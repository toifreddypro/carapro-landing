// ═══════════════════════════════════════════════════════════
// CaraLink Artisans — Edge Function : annuler-reservation
// Propriété : TOI Freddy
//
// Annulation d'une réservation PAR LE CLIENT, depuis le lien de son email (page annuler-reservation.html). Le client n'a pas de compte :
// c'est le jeton du paiement (paiements_prestations.token) qui prouve que c'est bien lui.
//
// POST { token, action: "infos" }    → l'état de la réservation et ce qui se passera si le client annule (remboursé ou non).
// POST { token, action: "annuler" }  → annule réellement.
//
// Règles (la politique est choisie par l'artisan : « annulation gratuite jusqu'à X h avant ») :
//  - paiement pas encore réglé                       → la demande est simplement abandonnée ;
//  - l'artisan n'a PAS encore confirmé le rendez-vous → remboursement intégral (il ne s'est engagé à rien) ;
//  - rendez-vous confirmé, annulation dans le délai gratuit → remboursement intégral ;
//  - rendez-vous confirmé, délai gratuit dépassé      → les frais restent acquis à l'artisan ; le rendez-vous est annulé quand même ;
//  - rendez-vous déjà passé                           → plus d'annulation possible.
// L'artisan est toujours prévenu par email. L'heure du rendez-vous est lue en heure de la Guadeloupe (UTC-4).
//
// Sécurité : action conditionnelle (jamais deux annulations ni deux remboursements), tout ce qui entre dans un email est échappé,
// aucun détail interne n'est renvoyé.
// ═══════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MSG_ERREUR_GENERIQUE = "Une erreur est survenue. Réessayez dans un instant ou contactez l'artisan.";

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
function escHtml(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (m) => (({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }) as Record<string, string>)[m]);
}
const euros = (n: number) => n.toFixed(2).replace(".", ",") + " €";

async function envoyerEmail(to: string, subject: string, html: string) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "CaraLink Artisans <notifications@learnlogicstudio.com>", to: [to], subject, html }),
    });
    if (!res.ok) console.error("[annuler-reservation] Échec envoi Resend :", await res.text());
  } catch (e) { console.error("[annuler-reservation] Erreur envoi email :", e); }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Requête invalide." }, 400);
    const { token, action } = body;
    if (typeof token !== "string" || !REGEX_UUID.test(token)) return json({ error: "Ce lien est incomplet ou incorrect." }, 404);
    if (action !== "infos" && action !== "annuler") return json({ error: "Requête invalide." }, 400);

    const cleService = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, cleService);
    const { data: p, error } = await sb.from("paiements_prestations").select("*").eq("token", token).eq("type", "reservation").maybeSingle();
    if (error) throw error;
    if (!p) return json({ error: "Cette réservation n'existe pas ou le lien est incorrect." }, 404);

    const { data: artisan } = await sb.from("artisans").select("id, user_id, nom_entreprise, telephone").eq("id", p.artisan_id).maybeSingle();
    const { data: d } = p.demande_id ? await sb.from("demandes_devis").select("id, statut, date_intervention, heure_debut, type_intervention, client_nom").eq("id", p.demande_id).maybeSingle() : { data: null };
    if (!d) return json({ error: "Demande introuvable." }, 404);

    const debut = new Date(`${d.date_intervention}T${String(d.heure_debut || "00:00").slice(0, 5)}:00-04:00`); // heure de la Guadeloupe
    const maintenant = Date.now();
    const passe = Number.isNaN(debut.getTime()) ? false : debut.getTime() <= maintenant;
    const heures = Number(p.annulation_gratuite_heures ?? 0);
    const limiteGratuite = heures > 0 && !Number.isNaN(debut.getTime()) ? debut.getTime() - heures * 3600 * 1000 : null;
    const dansDelaiGratuit = limiteGratuite !== null && maintenant <= limiteGratuite;
    const confirme = d.statut === "creneau_confirme";
    const dejaAnnule = !!p.annule_par || ["annule", "expire", "rembourse"].includes(p.statut) || d.statut === "creneau_refuse";
    const paye = ["paye", "partiellement_rembourse"].includes(p.statut);
    // Remboursé si : rendez-vous pas encore confirmé par l'artisan, OU annulation dans le délai gratuit.
    const seraRembourse = paye && (!confirme || dansDelaiGratuit);

    const dateAff = new Date(d.date_intervention + "T12:00:00Z").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
    const heureAff = String(d.heure_debut || "").slice(0, 5);

    if (action === "infos") {
      return json({
        artisan: artisan?.nom_entreprise ?? "", date_affichee: dateAff, heure: heureAff, montant: Number(p.montant),
        paye, confirme, deja_annule: dejaAnnule, passe, sera_rembourse: seraRembourse,
        annulation_gratuite_heures: heures,
        limite_gratuite: limiteGratuite !== null ? new Date(limiteGratuite).toLocaleString("fr-FR", { timeZone: "America/Guadeloupe", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) : null,
        nature: d.type_intervention === "visite" ? "frais de déplacement" : "frais de réservation",
      });
    }

    // ── annuler ──
    if (dejaAnnule) return json({ error: "Cette réservation est déjà annulée." }, 409);
    if (passe) return json({ error: "Ce rendez-vous est déjà passé : il ne peut plus être annulé ici." }, 410);

    // 1) Le rendez-vous : demande abandonnée (pas encore confirmée) ou intervention annulée (déjà confirmée). Conditionnel : un seul appel l'obtient.
    if (confirme) {
      if (!p.intervention_id) return json({ error: "Ce rendez-vous doit être annulé directement auprès de l'artisan." }, 409);
      const { data: maj, error: errI } = await sb.from("mpa_artisans_interventions")
        .update({ statut: "annulee", annulee_le: new Date().toISOString(), annulee_motif: "annulation_client" })
        .eq("id", p.intervention_id).in("statut", ["planifiee", "en_cours"]).select("id");
      if (errI) throw errI;
      if (!maj || !maj.length) return json({ error: "Ce rendez-vous ne peut plus être annulé ici (déjà terminé ou annulé)." }, 409);
    } else {
      const { data: maj, error: errD } = await sb.from("demandes_devis")
        .update({ statut: "creneau_refuse", reponse_message: "Annulée par le client" }).eq("id", d.id).eq("statut", "creneau_propose").select("id");
      if (errD) throw errD;
      if (!maj || !maj.length) return json({ error: "Cette demande vient d'être traitée par l'artisan. Rechargez la page." }, 409);
    }

    // 2) L'argent : remboursé ou conservé.
    let rembourse = false;
    if (paye) {
      if (seraRembourse) {
        const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/rembourser-prestation`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${cleService}`, "Content-Type": "application/json" },
          body: JSON.stringify({ paiement_id: p.id, annule_par: "client", motif: "Annulation par le client dans le délai gratuit" }),
        });
        rembourse = res.ok;
        if (!res.ok) console.error("[annuler-reservation] Remboursement refusé :", res.status, await res.text()); // le ménage automatique réessaiera
      } else {
        await sb.from("paiements_prestations").update({ annule_par: "client", annule_le: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", p.id);
      }
    } else {
      await sb.from("paiements_prestations").update({ statut: "annule", annule_par: "client", annule_le: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", p.id).eq("statut", "en_attente");
    }

    // 3) L'artisan est prévenu (si la demande lui était visible) ; le client reçoit la confirmation. Jamais bloquant.
    try {
      if (paye && artisan?.user_id) {
        const { data: u } = await sb.auth.admin.getUserById(artisan.user_id);
        if (u?.user?.email) {
          await envoyerEmail(u.user.email, `Rendez-vous annulé par le client — ${d.client_nom} (${dateAff})`,
            `<div style="font-family:sans-serif;max-width:480px;">
              <h2 style="color:#B5502F;">Le client a annulé</h2>
              <p><strong>${escHtml(d.client_nom)}</strong> a annulé son rendez-vous du <strong>${escHtml(dateAff)} à ${escHtml(heureAff)}</strong>${confirme ? " (il figurait dans votre planning, il est passé en « Annulée »)" : ""}.</p>
              ${seraRembourse ? `<p style="font-size:13px;color:#475569;">Le client est remboursé de ${escHtml(euros(Number(p.montant)))}${confirme ? " (annulation dans le délai gratuit que vous avez fixé)" : " (vous n'aviez pas encore confirmé)"}.</p>`
                : `<p style="background:#f0fdf4;border:1px solid #bbf7d0;color:#166534;padding:10px 14px;border-radius:8px;">💶 L'annulation est tardive (hors du délai gratuit de ${heures} h) : les <strong>${escHtml(euros(Number(p.montant)))}</strong> réglés restent acquis.</p>`}
            </div>`);
        }
      }
      if (p.client_email) {
        await envoyerEmail(p.client_email, "Votre réservation est annulée",
          `<div style="font-family:sans-serif;max-width:480px;">
            <h2 style="color:#B5502F;">Réservation annulée</h2>
            <p>Bonjour ${escHtml(p.client_nom || "")}, votre rendez-vous du <strong>${escHtml(dateAff)} à ${escHtml(heureAff)}</strong>${artisan?.nom_entreprise ? ` chez <strong>${escHtml(artisan.nom_entreprise)}</strong>` : ""} est annulé.</p>
            <p>${!paye ? "Aucun paiement n'a été prélevé." : (seraRembourse ? `Vous êtes <strong>remboursé(e) intégralement</strong> (${escHtml(euros(Number(p.montant)))}) ; le remboursement apparaît sur votre carte sous quelques jours.` : `Comme l'annulation intervient après le délai gratuit, les ${escHtml(euros(Number(p.montant)))} de ${d.type_intervention === "visite" ? "frais de déplacement" : "frais de réservation"} restent acquis à l'artisan, conformément aux conditions que vous avez acceptées.`)}</p>
          </div>`);
      }
    } catch (e) { console.error("[annuler-reservation] Emails échoués :", e); }

    return json({ ok: true, rembourse: paye && seraRembourse, conserve: paye && !seraRembourse, montant: Number(p.montant) });
  } catch (e) {
    console.error("[annuler-reservation]", e);
    return json({ error: MSG_ERREUR_GENERIQUE }, 500);
  }
});
