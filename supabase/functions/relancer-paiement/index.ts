// ═══════════════════════════════════════════════════════════
// CaraLink Artisans — Edge Function : relancer-paiement
// Propriété : TOI Freddy
//
// Relance par email d'une demande de paiement (« solde ») que le client n'a pas réglée : le même lien est renvoyé.
//
// POST { paiement_id }                 — artisan connecté : relance MANUELLE (toutes les offres)
// POST { paiement_id, auto: true }     — appelée par maintenance-reservations avec la clé de service : relance AUTOMATIQUE (offre Pro)
//
// Règles (identiques pour les deux) :
//  - au plus 2 relances par lien, manuelles et automatiques confondues, et au plus une par 24 h (le 1er email d'origine compte comme un envoi) ;
//  - uniquement un lien encore « en attente » et valable (14 jours) ; jamais pour un lien payé, annulé ou expiré ;
//  - automatique : l'artisan doit être Pro, avoir laissé « relance automatique » cochée, et le lien doit avoir au moins 3 jours (1re relance)
//    puis 10 jours (2e relance, la dernière, qui annonce la date d'expiration) ;
//  - la relance est « réclamée » en base AVANT l'envoi (deux clics ou deux lancements simultanés n'envoient jamais deux emails) ;
//    si l'envoi échoue, la réclamation est annulée ; chaque relance est tracée (date, manuelle ou automatique).
// ═══════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const PAGE_PAIEMENT = "https://caralink.app/artisans/payer-prestation.html";
const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALIDITE_MS = 14 * 24 * 3600 * 1000;
const UN_JOUR_MS = 24 * 3600 * 1000;
const MAX_RELANCES = 2;
const AGE_MIN_AUTO_MS = [3 * UN_JOUR_MS, 10 * UN_JOUR_MS]; // âge minimum du lien pour la 1re puis la 2e relance automatique
const MSG_ERREUR_GENERIQUE = "Une erreur est survenue. Réessayez dans un instant.";

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
function escHtml(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (m) => (({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }) as Record<string, string>)[m]);
}
const euros = (n: number) => n.toFixed(2).replace(".", ",") + " €";
function egalConstant(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let e = 0; for (let i = 0; i < a.length; i++) e |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return e === 0;
}
async function envoyerEmail(to: string, replyTo: string | null, subject: string, html: string): Promise<boolean> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return false;
  try {
    const corps: Record<string, unknown> = { from: "CaraLink Artisans <notifications@learnlogicstudio.com>", to: [to], subject, html };
    if (replyTo) corps.reply_to = replyTo;
    const res = await fetch("https://api.resend.com/emails", { method: "POST", headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify(corps) });
    if (!res.ok) console.error("[relancer-paiement] Échec envoi Resend :", await res.text());
    return res.ok;
  } catch (e) { console.error("[relancer-paiement] Erreur envoi email :", e); return false; }
}
async function limiteAtteinte(sb: any, cle: string, max: number, fenetreSecondes: number): Promise<boolean> {
  try {
    const { data, error } = await sb.rpc("limiter_appel", { p_cle: cle, p_max: max, p_fenetre_s: fenetreSecondes });
    if (error) { console.error("[limiter_appel]", error.message); return false; }
    return data === false;
  } catch (e) { console.error("[limiter_appel]", e); return false; }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);

  try {
    const cleService = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, cleService);
    const authHeader = req.headers.get("Authorization") ?? "";
    const jeton = authHeader.replace(/^Bearer\s+/i, "");
    if (!jeton) return json({ error: "Non authentifié." }, 401);

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Requête invalide." }, 400);
    if (typeof body.paiement_id !== "string" || !REGEX_UUID.test(body.paiement_id)) return json({ error: "Paiement invalide." }, 400);

    const auto = body.auto === true;
    let userId: string | null = null;
    if (auto) {
      if (!egalConstant(jeton, cleService)) return json({ error: "Non autorisé." }, 403); // seule la maintenance interne peut déclencher l'automatique
    } else {
      const sbAnon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
      const { data: u } = await sbAnon.auth.getUser(jeton);
      if (!u?.user) return json({ error: "Session invalide." }, 401);
      userId = u.user.id;
    }

    const { data: p, error: errP } = await sb.from("paiements_prestations").select("*").eq("id", body.paiement_id).eq("type", "solde").maybeSingle();
    if (errP) throw errP;
    if (!p) return json({ error: "Demande de paiement introuvable." }, 404);

    const { data: artisan } = await sb.from("artisans").select("id, user_id, nom_entreprise, email, telephone, plan").eq("id", p.artisan_id).maybeSingle();
    if (!artisan) return json({ error: "Artisan introuvable." }, 404);
    if (!auto && artisan.user_id !== userId) return json({ error: "Demande de paiement introuvable." }, 404);

    // ── Conditions communes ──
    const maintenant = Date.now();
    const age = maintenant - new Date(p.created_at).getTime();
    // En mode automatique, un lien qui n'est pas (ou plus) à relancer n'est pas une erreur : on l'ignore simplement.
    const refus = (code: string, statut: number, extra: Record<string, unknown> = {}) => auto ? json({ ok: true, ignoree: true, raison: code }) : json({ error: code, ...extra }, statut);
    if (p.statut !== "en_attente") return refus(p.statut === "paye" ? "deja_paye" : "lien_inactif", 409);
    if (age > VALIDITE_MS) return refus("lien_expire", 409);
    if (!p.client_email) return refus("email_client_manquant", 400);
    const nb = Number(p.relances_nb || 0);
    if (nb >= MAX_RELANCES) return refus("relances_epuisees", 409);
    const dernier = new Date(p.derniere_relance_le || p.created_at).getTime();
    if (maintenant - dernier < UN_JOUR_MS) return refus("relance_trop_tot", 429, { dans_heures: Math.ceil((UN_JOUR_MS - (maintenant - dernier)) / 3600000) });

    if (auto) {
      const pro = artisan.plan === "pro" || artisan.plan === "pro_offert";
      if (!pro || p.relance_auto !== true) return json({ ok: true, ignoree: true });
      if (age < AGE_MIN_AUTO_MS[nb]) return json({ ok: true, ignoree: true });
    } else if (await limiteAtteinte(sb, `relancer-paiement:${artisan.id}`, 20, 3600)) {
      return json({ error: "Trop de demandes. Réessayez plus tard." }, 429);
    }

    // ── Réclamation atomique AVANT l'envoi ──
    const maintenantISO = new Date(maintenant).toISOString();
    const historique = Array.isArray(p.relances_historique) ? p.relances_historique : [];
    const nouvelHistorique = [...historique, { le: maintenantISO, par: auto ? "auto" : "artisan" }];
    const { data: reclame, error: errC } = await sb.from("paiements_prestations")
      .update({ relances_nb: nb + 1, derniere_relance_le: maintenantISO, relances_historique: nouvelHistorique, updated_at: maintenantISO })
      .eq("id", p.id).eq("statut", "en_attente").eq("relances_nb", nb).select("id");
    if (errC) throw errC;
    if (!reclame || !reclame.length) return refus("relance_en_cours", 409);

    const dernierRappel = nb + 1 >= MAX_RELANCES;
    const expire = new Date(new Date(p.created_at).getTime() + VALIDITE_MS).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Guadeloupe" });
    const lien = `${PAGE_PAIEMENT}?token=${p.token}`;
    const nomArtisan = String(artisan.nom_entreprise || "votre artisan").replace(/[\u0000-\u001f\u007f]+/g, " ").slice(0, 80);
    const contact = [artisan.telephone ? `📞 ${escHtml(artisan.telephone)}` : "", artisan.email ? `✉️ ${escHtml(artisan.email)}` : ""].filter(Boolean).join(" &nbsp; ");

    const envoye = await envoyerEmail(p.client_email, artisan.email || null,
      `${dernierRappel ? "Dernier rappel" : "Rappel"} — paiement de ${euros(Number(p.montant))} à ${nomArtisan}`,
      `<div style="font-family:sans-serif;max-width:480px;">
        <h2 style="color:#B5502F;">💶 ${dernierRappel ? "Dernier rappel de paiement" : "Petit rappel de paiement"}</h2>
        <p>Bonjour ${escHtml(p.client_nom || "")}, <strong>${escHtml(nomArtisan)}</strong> vous a demandé de régler <strong>${escHtml(euros(Number(p.montant)))}</strong>${p.description ? ` pour : ${escHtml(p.description)}` : ""}, et nous n'avons pas encore reçu votre paiement.</p>
        <p style="text-align:center;margin:22px 0;"><a href="${escHtml(lien)}" style="display:inline-block;background:#B5502F;color:#ffffff;padding:13px 26px;border-radius:8px;text-decoration:none;font-weight:700;">Payer en ligne</a></p>
        <p style="font-size:12.5px;color:#475569;">Le lien est valable jusqu'au <strong>${escHtml(expire)}</strong>${dernierRappel ? ", puis il ne fonctionnera plus. Si vous avez déjà réglé autrement (espèces, virement), ignorez ce message." : "."}</p>
        ${contact ? `<p style="font-size:12.5px;color:#475569;">Une question ? Contactez directement l'artisan : ${contact}</p>` : ""}
        <p style="font-size:11.5px;color:#6b7c96;">Paiement sécurisé par carte (Stripe). ${dernierRappel ? "Vous ne recevrez pas d'autre relance pour cette demande." : "Vous pourriez recevoir au plus un dernier rappel."}</p>
      </div>`);

    if (!envoye) {
      // L'envoi a échoué : on rend la relance (elle pourra être retentée).
      await sb.from("paiements_prestations").update({ relances_nb: nb, derniere_relance_le: p.derniere_relance_le ?? null, relances_historique: historique, updated_at: new Date().toISOString() })
        .eq("id", p.id).eq("relances_nb", nb + 1);
      return json({ error: "email_non_envoye" }, 502);
    }
    return json({ ok: true, relances_nb: nb + 1, derniere: dernierRappel });
  } catch (e) {
    console.error("[relancer-paiement]", e);
    return json({ error: MSG_ERREUR_GENERIQUE }, 500);
  }
});
