// ═══════════════════════════════════════════════════════════
// CaraLink Artisans — Edge Function : liberer-reservation
// Propriété : TOI Freddy
//
// Appelée PAR LE SERVEUR (le webhook Stripe, le ménage automatique) une fois que le client a PAYÉ ses frais de réservation :
// c'est seulement à cet instant que l'artisan voit la demande dans MPA (onglet « Demandes ») et reçoit l'email avec les boutons
// « Confirmer » / « Refuser ». Le client reçoit son reçu, avec le lien pour annuler.
//
// POST { paiement_id }   — en-tête Authorization = clé service (jamais appelable depuis un navigateur).
//
// Rejouable sans effet double : si la demande est déjà visible de l'artisan, on ne refait rien.
// ═══════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SITE = "https://caralink.app/artisans";
const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}
function escHtml(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (m) => (({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }) as Record<string, string>)[m]);
}
function texteHtml(s: unknown): string { return escHtml(s).replace(/\r?\n/g, "<br>"); }
function telHref(tel: string): string { return String(tel ?? "").replace(/[^0-9+]/g, ""); }
const euros = (n: number) => n.toFixed(2).replace(".", ",") + " €";

async function envoyerEmail(to: string, subject: string, html: string): Promise<boolean> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) { console.warn("[liberer-reservation] RESEND_API_KEY absente — email non envoyé."); return false; }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "CaraLink Artisans <notifications@learnlogicstudio.com>", to: [to], subject, html }),
    });
    if (!res.ok) console.error("[liberer-reservation] Échec envoi Resend :", await res.text());
    return res.ok;
  } catch (e) { console.error("[liberer-reservation] Erreur envoi email :", e); return false; }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);
  const cleService = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  if (req.headers.get("Authorization") !== `Bearer ${cleService}`) return json({ error: "Non autorisé." }, 401);

  try {
    const body = await req.json().catch(() => null);
    const paiementId = body?.paiement_id;
    if (typeof paiementId !== "string" || !REGEX_UUID.test(paiementId)) return json({ error: "Paiement invalide." }, 400);

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, cleService);
    const { data: p, error } = await sb.from("paiements_prestations").select("*").eq("id", paiementId).maybeSingle();
    if (error) throw error;
    if (!p || p.type !== "reservation" || !p.demande_id) return json({ error: "Paiement introuvable." }, 404);
    if (!["paye", "partiellement_rembourse"].includes(p.statut)) return json({ ok: true, ignore: "paiement non encaissé" });

    const { data: d, error: errD } = await sb.from("demandes_devis").select("*").eq("id", p.demande_id).maybeSingle();
    if (errD) throw errD;
    if (!d) return json({ error: "Demande introuvable." }, 404);
    if (d.statut !== "creneau_propose") return json({ ok: true, ignore: "demande déjà traitée" });

    // Déjà visible de l'artisan ? (événement Stripe rejoué) → rien à refaire.
    const { data: deja } = await sb.from("devis_reponses").select("id").eq("demande_id", d.id).limit(1);
    if (deja && deja.length) return json({ ok: true, ignore: "déjà libérée" });

    const { error: errRep } = await sb.from("devis_reponses").insert({ demande_id: d.id, artisan_id: p.artisan_id, message: "", statut: "envoyee" });
    if (errRep) throw errRep; // le webhook réessaiera

    const { data: artisan } = await sb.from("artisans").select("user_id, nom_entreprise, telephone").eq("id", p.artisan_id).maybeSingle();
    const dateAff = new Date(d.date_intervention + "T12:00:00Z").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
    const hDebut = String(d.heure_debut || "").slice(0, 5);
    const hFin = String(d.heure_fin || "").slice(0, 5) || "?";
    const montant = Number(p.montant);
    const nature = d.type_intervention === "visite" ? "frais de déplacement" : "frais de réservation";
    const nbPhotos = Array.isArray(d.photos) ? d.photos.length : 0;

    // ── Email à l'artisan ──
    let artisanPrevenu = false;
    try {
      if (artisan?.user_id) {
        const { data: u } = await sb.auth.admin.getUserById(artisan.user_id);
        if (u?.user?.email) {
          const lienConfirmer = `${SITE}/repondre.html?token=${encodeURIComponent(d.token)}&action=confirmer`;
          const lienRefuser = `${SITE}/repondre.html?token=${encodeURIComponent(d.token)}&action=refuser`;
          const contact = d.contact_prefere === "email" && d.client_email
            ? `📧 <a href="mailto:${escHtml(d.client_email)}">${escHtml(d.client_email)}</a>`
            : `📞 <a href="tel:${escHtml(telHref(d.client_telephone))}">${escHtml(d.client_telephone)}</a>`;
          const html = `<div style="font-family:sans-serif;max-width:480px;">
            <h2 style="color:#B5502F;">📅 Réservation payée — proposition de créneau</h2>
            ${d.hors_horaires ? `<p style="background:#fff7ed;border:1px solid #fdba74;color:#9a3412;padding:10px 14px;border-radius:8px;font-weight:700;">⚠️ Demande hors de vos horaires habituels — vérifiez que ça vous convient avant de confirmer.</p>` : ""}
            <p style="background:#f0fdf4;border:1px solid #bbf7d0;color:#166534;padding:10px 14px;border-radius:8px;">💶 Le client a déjà payé <strong>${escHtml(euros(montant))}</strong> de ${nature} en ligne. Si vous refusez ou ne répondez pas, il est remboursé automatiquement.</p>
            <p><strong>${escHtml(d.client_nom)}</strong> (${escHtml(d.commune)}) souhaite une intervention le <strong>${escHtml(dateAff)} entre ${escHtml(hDebut)} et ${escHtml(hFin)}</strong>, à cette adresse : ${escHtml(d.adresse)}.</p>
            <p style="background:#f7f9fc;padding:12px 16px;border-radius:8px;">${texteHtml(d.description_besoin)}</p>
            <p>Contact : ${contact}</p>
            ${nbPhotos > 0 ? `<p>📷 ${nbPhotos} photo${nbPhotos > 1 ? "s" : ""} jointe${nbPhotos > 1 ? "s" : ""} — à consulter dans votre espace MPA Artisans.</p>` : ""}
            <div style="margin:24px 0;">
              <a href="${escHtml(lienConfirmer)}" style="display:inline-block;padding:12px 22px;border-radius:8px;background:#16a34a;color:#fff;font-weight:700;text-decoration:none;margin-right:10px;">✅ Confirmer ce créneau</a>
              <a href="${escHtml(lienRefuser)}" style="display:inline-block;padding:12px 22px;border-radius:8px;background:#f1f5f9;color:#475569;font-weight:700;text-decoration:none;">❌ Refuser</a>
            </div>
            <p style="font-size:12px;color:#6b7c96;">En confirmant, ce rendez-vous sera automatiquement ajouté à votre planning MPA Artisans, sans avoir à vous connecter.</p>
          </div>`;
          artisanPrevenu = await envoyerEmail(u.user.email, `${d.hors_horaires ? "⚠️ Hors horaires — " : ""}Réservation payée — ${d.client_nom} le ${dateAff}`, html);
        }
      }
    } catch (e) { console.error("[liberer-reservation] Email artisan échoué :", e); }

    // ── Email au client : reçu + lien pour annuler ──
    try {
      if (p.client_email) {
        const heures = Number(p.annulation_gratuite_heures ?? 0);
        const lienAnnuler = `${SITE}/annuler-reservation.html?token=${encodeURIComponent(p.token)}`;
        const politique = heures > 0
          ? `Vous pouvez annuler gratuitement jusqu'à <strong>${heures} h</strong> avant le rendez-vous. Passé ce délai, les ${nature} restent acquis à l'artisan.`
          : `Les ${nature} restent acquis à l'artisan en cas d'annulation de votre part.`;
        await envoyerEmail(p.client_email, `Demande envoyée à ${artisan?.nom_entreprise || "l'artisan"} — paiement reçu`,
          `<div style="font-family:sans-serif;max-width:480px;">
            <h2 style="color:#16a34a;">✅ Paiement reçu — demande envoyée</h2>
            <p>Bonjour ${escHtml(d.client_nom)}, votre paiement de <strong>${escHtml(euros(montant))}</strong> (${nature}) est bien reçu et votre demande de rendez-vous le <strong>${escHtml(dateAff)} à ${escHtml(hDebut)}</strong> a été transmise à <strong>${escHtml(artisan?.nom_entreprise || "l'artisan")}</strong>.</p>
            <p>L'artisan doit maintenant <strong>confirmer</strong> le créneau : vous recevrez un email dès sa réponse. S'il refuse ou ne peut pas honorer le rendez-vous, vous êtes <strong>remboursé(e) intégralement et automatiquement</strong>.</p>
            <p style="font-size:13px;color:#475569;">${politique}</p>
            <p style="text-align:center;margin:22px 0;"><a href="${escHtml(lienAnnuler)}" style="display:inline-block;background:#f1f5f9;color:#475569;padding:11px 20px;border-radius:8px;text-decoration:none;font-weight:700;">Annuler ma réservation</a></p>
          </div>`);
      }
    } catch (e) { console.error("[liberer-reservation] Email client échoué :", e); }

    return json({ ok: true, artisan_prevenu: artisanPrevenu });
  } catch (e) {
    console.error("[liberer-reservation]", e);
    return json({ error: "Erreur." }, 500);
  }
});
