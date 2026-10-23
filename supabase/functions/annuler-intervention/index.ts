// ═══════════════════════════════════════════════════════════
// CaraLink Artisans — Edge Function : annuler-intervention
// Propriété : TOI Freddy
//
// Déclenchée par l'artisan (authentifié) depuis MPA Artisans : « Impossible d'honorer cette prestation / ce rendez-vous ».
// Passe l'intervention en « Annulée » et prévient le client par email (si son adresse est connue), avec le motif choisi,
// un message libre de l'artisan et, si l'artisan le souhaite, une nouvelle date proposée.
//
// POST { intervention_id, motif, message?, nouvelle_date? }
//
// Sécurité :
//  - l'artisan ne peut agir que sur SES interventions, et seulement tant qu'elles sont « Planifiée » ou « En cours » ;
//  - le changement de statut est conditionnel (jamais deux annulations, donc jamais deux emails au client pour la même intervention) ;
//  - tout ce qui entre dans l'email (noms, message, date proposée, téléphone) est échappé ;
//  - paiement en ligne (15/10/2026) : si le client a payé des frais de réservation / de déplacement pour ce rendez-vous, ils lui sont
//    REMBOURSÉS AUTOMATIQUEMENT et intégralement (fonction rembourser-prestation) — l'artisan ne peut pas honorer, le client ne paie rien ;
//  - si l'intervention est la livraison d'une commande de la boutique, la réponse le signale pour que l'artisan rembourse la commande
//    depuis « Mes ventes ».
// ═══════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MSG_ERREUR_GENERIQUE = "Une erreur est survenue. Réessayez dans un instant.";
const MOTIFS: Record<string, string> = {
  maladie: "un problème de santé",
  imprevu: "un imprévu de dernière minute",
  meteo: "des conditions météo qui ne permettent pas d'intervenir",
  materiel: "un problème de matériel ou d'approvisionnement",
  autre: "un empêchement",
};

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
function escHtml(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (m) => (({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }) as Record<string, string>)[m]);
}
function dateFr(iso: string): string {
  const d = new Date(iso + "T12:00:00Z");
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}

async function envoyerEmail(to: string, subject: string, html: string): Promise<boolean> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) { console.warn("[annuler-intervention] RESEND_API_KEY absente — email non envoyé."); return false; }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "CaraLink Artisans <notifications@learnlogicstudio.com>", to: [to], subject, html }),
    });
    if (!res.ok) console.error("[annuler-intervention] Échec envoi Resend :", await res.text());
    return res.ok;
  } catch (e) {
    console.error("[annuler-intervention] Erreur envoi email :", e);
    return false;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Non authentifié." }, 401);
    const sbCaller = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await sbCaller.auth.getUser();
    if (!user) return json({ error: "Session invalide." }, 401);

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Requête invalide." }, 400);
    const { intervention_id, motif } = body;
    if (typeof intervention_id !== "string" || !/^[0-9a-f-]{36}$/i.test(intervention_id)) return json({ error: "Intervention invalide." }, 400);
    if (typeof motif !== "string" || !(motif in MOTIFS)) return json({ error: "Merci de choisir un motif." }, 400);
    const message = typeof body.message === "string" ? body.message.trim().slice(0, 500) : "";
    const nouvelleDate = typeof body.nouvelle_date === "string" ? body.nouvelle_date.trim().slice(0, 100) : "";

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: artisan } = await sb.from("artisans").select("id, nom_entreprise, telephone").eq("user_id", user.id).maybeSingle();
    if (!artisan) return json({ error: "Aucun profil artisan trouvé." }, 404);

    const { data: inter, error: errI } = await sb.from("mpa_artisans_interventions")
      .select("id, statut, date_intervention, heure_debut, creneau, mpa_artisans_clients(nom, email), artisans_services(nom_service)")
      .eq("id", intervention_id).eq("artisan_id", artisan.id).maybeSingle();
    if (errI) throw errI;
    if (!inter) return json({ error: "Intervention introuvable." }, 404);
    if (!["planifiee", "en_cours"].includes(inter.statut)) return json({ error: "Cette intervention ne peut plus être annulée (déjà terminée, payée ou annulée)." }, 409);

    // Annulation conditionnelle : un seul appel l'obtient, donc un seul email.
    const { data: maj, error: errMaj } = await sb.from("mpa_artisans_interventions")
      .update({ statut: "annulee", annulee_le: new Date().toISOString(), annulee_motif: motif })
      .eq("id", intervention_id).in("statut", ["planifiee", "en_cours"]).select("id");
    if (errMaj) throw errMaj;
    if (!maj || maj.length === 0) return json({ error: "Cette intervention vient d'être annulée." }, 409);

    // Livraison d'une commande de la boutique ? (l'artisan doit alors décider du remboursement)
    // (24/10) La commande n'est pas perdue : elle est détachée de la livraison annulée et revient à « Prête, à planifier ».
    // L'artisan choisit alors : une nouvelle date, ou rembourser la commande.
    const { data: commandes } = await sb.from("commandes_catalogue").select("id")
      .eq("intervention_id", intervention_id).not("statut", "in", "(annulee,terminee)").limit(1);
    const commandeLiee = !!(commandes && commandes.length);
    const commandeId: string | null = commandeLiee ? commandes![0].id : null;
    if (commandeId) {
      const { error: errDet } = await sb.from("commandes_catalogue").update({ intervention_id: null, livraison_prevue_le: null }).eq("id", commandeId);
      if (errDet) console.error("[annuler-intervention] Détachement de la commande :", errDet.message);
    }

    // Paiements en ligne liés à ce rendez-vous (frais de réservation, solde) : remboursés automatiquement et intégralement.
    let montantRembourse = 0, remboursementEchoue = false;
    try {
      const { data: payes } = await sb.from("paiements_prestations").select("id, montant, montant_rembourse")
        .eq("intervention_id", intervention_id).in("statut", ["paye", "partiellement_rembourse"]);
      for (const pay of payes || []) {
        const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/rembourser-prestation`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`, "Content-Type": "application/json" },
          body: JSON.stringify({ paiement_id: pay.id, annule_par: "artisan", motif: "Rendez-vous annulé par l'artisan" }),
        });
        if (res.ok) montantRembourse += Number(pay.montant) - Number(pay.montant_rembourse || 0); else { remboursementEchoue = true; console.error("[annuler-intervention] Remboursement refusé :", res.status, await res.text()); }
      }
    } catch (e) { remboursementEchoue = true; console.error("[annuler-intervention] Remboursement échoué :", e); }
    const aRembourse = montantRembourse > 0 || remboursementEchoue;

    const client = (inter as any).mpa_artisans_clients;
    const service = (inter as any).artisans_services;
    let clientPrevenu = false;
    if (client?.email) {
      const heure = inter.heure_debut ? String(inter.heure_debut).slice(0, 5) : (inter.creneau === "matin" ? "le matin" : (inter.creneau === "apres_midi" || inter.creneau === "apres-midi") ? "l'après-midi" : "");
      const html = `<div style="font-family:sans-serif;max-width:520px;">
        <h2 style="color:#B5502F;">Votre rendez-vous est annulé</h2>
        <p>Bonjour ${escHtml(client.nom || "")},</p>
        <p>Nous sommes désolés : <strong>${escHtml(artisan.nom_entreprise)}</strong> ne pourra pas honorer votre rendez-vous prévu <strong>${escHtml(dateFr(inter.date_intervention))}</strong>${heure ? " (" + escHtml(heure) + ")" : ""}${service?.nom_service ? " pour : " + escHtml(service.nom_service) : ""}, à cause de ${escHtml(MOTIFS[motif])}.</p>
        ${message ? `<p style="padding:10px 14px;background:#f6f9fe;border-radius:8px;">${escHtml(message).replace(/\n/g, "<br>")}</p>` : ""}
        ${nouvelleDate ? `<p>Nouvelle date proposée : <strong>${escHtml(nouvelleDate)}</strong>. Merci de confirmer directement avec l'artisan.</p>` : "<p>L'artisan vous recontactera pour convenir d'une nouvelle date.</p>"}
        ${artisan.telephone ? `<p>Pour le joindre : <strong>${escHtml(artisan.telephone)}</strong></p>` : ""}
        ${aRembourse ? `<p style="background:#f0fdf4;border:1px solid #bbf7d0;color:#166534;padding:10px 14px;border-radius:8px;">💶 Les sommes que vous avez réglées en ligne pour ce rendez-vous vous sont <strong>remboursées intégralement</strong>${remboursementEchoue ? " (remboursement en cours de traitement)" : ` (${escHtml(montantRembourse.toFixed(2).replace(".", ","))} €)`}. Elles apparaîtront sur votre carte sous quelques jours.</p>` : (commandeLiee ? "" : '<p style="font-size:12px;color:#6b7c96;">Aucun paiement n\'est dû pour ce rendez-vous annulé.</p>')}
      </div>`;
      const nomSujet = String(artisan.nom_entreprise || "votre artisan").replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, 80);
      clientPrevenu = await envoyerEmail(client.email, `Rendez-vous annulé — ${nomSujet}`, html);
    }

    return json({ ok: true, client_rembourse: montantRembourse, remboursement_echoue: remboursementEchoue, client_prevenu: clientPrevenu, client_sans_email: !client?.email, commande_liee: commandeLiee, commande_id: commandeId });
  } catch (e) {
    console.error("[annuler-intervention]", e);
    return json({ error: MSG_ERREUR_GENERIQUE }, 500);
  }
});
