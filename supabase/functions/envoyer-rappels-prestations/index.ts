// ═══════════════════════════════════════════════════════════
// CaraLink Artisans — Edge Function : envoyer-rappels-prestations
// Propriété : TOI Freddy
//
// À lancer une fois par jour (Supabase Cron, même mécanisme que
// prelever-commission-prestations : secret partagé en en-tête, ou
// session admin pour un déclenchement manuel).
//
// Pour chaque intervention "Planifiée" prévue demain, avec un client qui a
// une adresse email connue : un email de rappel via Resend. Jamais deux
// fois le même rappel (colonne rappel_envoye), jamais pour une intervention
// déjà Terminée/Payée/Annulée.
//
// Horaire choisi pour le déclenchement automatique : 14h UTC (10h du matin
// en Guadeloupe, UTC-4) — loin de tout passage de minuit des deux côtés,
// pour que "demain" ne se calcule jamais de travers (voir le piège connu
// de fuseau horaire noté dans le projet).
//
// Sécurité :
//  - tout ce qui entre dans l'email (nom du client, de l'entreprise, du service, téléphone) est échappé : sans ça,
//    un artisan pouvait y glisser un faux lien, envoyé depuis ton adresse à n'importe quelle adresse de client ;
//  - le rappel est « réclamé » AVANT l'envoi : deux lancements simultanés (cron + bouton) n'envoient jamais deux fois
//    le même rappel ; si l'envoi échoue, la réclamation est annulée et le rappel sera retenté ;
//  - « demain » se calcule à l'heure de la Guadeloupe (UTC-4), jamais en UTC ;
//  - la date demandée est contrôlée ; le secret du déclenchement automatique est comparé sans fuite sur le temps.
// ═══════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ADMIN_EMAIL = "toifreddypro@gmail.com";
const CRON_SECRET = Deno.env.get("RAPPELS_CRON_SECRET");
const DECALAGE_LOCAL_MS = 4 * 3600 * 1000; // Guadeloupe = UTC-4
const MSG_ERREUR_GENERIQUE = "Une erreur est survenue. Réessayez dans un instant.";

function escHtml(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (m) => (({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }) as Record<string, string>)[m]);
}
function egalConstant(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function dateValide(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function demainISO(): string {
  // La date du jour en Guadeloupe (UTC-4), puis +1 jour : correct à n'importe quelle heure, pas seulement à 14h UTC.
  const d = new Date(Date.now() - DECALAGE_LOCAL_MS);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

async function envoyerEmail(to: string, subject: string, html: string): Promise<boolean> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) { console.warn("[envoyer-rappels-prestations] RESEND_API_KEY absente — email non envoyé."); return false; }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "CaraLink Artisans <notifications@learnlogicstudio.com>", to: [to], subject, html }),
    });
    if (!res.ok) { console.error("[envoyer-rappels-prestations] Échec Resend :", await res.text()); return false; }
    return true;
  } catch (e) {
    console.error("[envoyer-rappels-prestations] Erreur envoi email :", e);
    return false;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);

  try {
    const secretCron = req.headers.get("X-Cron-Secret");
    const estCron = !!CRON_SECRET && egalConstant(secretCron ?? "", CRON_SECRET);

    if (!estCron) {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return json({ error: "Non authentifié." }, 401);
      const sbCaller = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await sbCaller.auth.getUser();
      if (!user || user.email !== ADMIN_EMAIL) return json({ error: "Réservé à l'administrateur." }, 403);
    }

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => ({}));
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Requête invalide." }, 400);
    if (body.date_iso != null && body.date_iso !== "" && (typeof body.date_iso !== "string" || !dateValide(body.date_iso))) return json({ error: "Date invalide (format AAAA-MM-JJ)." }, 400);
    const dateCible = body.date_iso || demainISO();

    const { data: interventions, error } = await sb.from("mpa_artisans_interventions")
      .select("id, date_intervention, creneau, heure_debut, artisan_id, artisans(nom_entreprise, telephone), mpa_artisans_clients(nom, email), artisans_services(nom_service)")
      .eq("date_intervention", dateCible)
      .eq("statut", "planifiee")
      .eq("rappel_envoye", false);
    if (error) throw error;

    const resultats = [];
    for (const inter of interventions || []) {
      const client = (inter as any).mpa_artisans_clients;
      const artisan = (inter as any).artisans;
      const service = (inter as any).artisans_services;

      if (!client?.email) {
        resultats.push({ intervention_id: inter.id, statut: "sans_email" });
        continue;
      }

      const heure = inter.heure_debut || (inter.creneau === "matin" ? "dans la matinée" : (inter.creneau === "apres_midi" || inter.creneau === "apres-midi") ? "dans l'après-midi" : "");
      // « Réclamation » AVANT l'envoi : un seul des lancements simultanés l'obtient (jamais deux emails identiques).
      const { data: reclame, error: errReclame } = await sb.from("mpa_artisans_interventions")
        .update({ rappel_envoye: true }).eq("id", inter.id).eq("rappel_envoye", false).select("id");
      if (errReclame) { console.error("[envoyer-rappels-prestations] Réclamation impossible :", errReclame.message); resultats.push({ intervention_id: inter.id, statut: "erreur" }); continue; }
      if (!reclame || reclame.length === 0) { resultats.push({ intervention_id: inter.id, statut: "deja_envoye" }); continue; }

      const html = `<div style="font-family:sans-serif;max-width:480px;">
        <h2 style="color:#B5502F;">Rappel — rendez-vous demain</h2>
        <p>Bonjour ${escHtml(client.nom || "")},</p>
        <p>Petit rappel : <strong>${escHtml(artisan?.nom_entreprise || "votre artisan")}</strong> a rendez-vous avec vous demain${service?.nom_service ? " pour : " + escHtml(service.nom_service) : ""}${heure ? " — " + escHtml(heure) : ""}.</p>
        ${artisan?.telephone ? `<p>Une question ou besoin de reporter ? Contactez directement l'artisan au ${escHtml(artisan.telephone)}.</p>` : ""}
      </div>`;

      // Sujet : texte brut sur une seule ligne, de longueur raisonnable.
      const nomSujet = String(artisan?.nom_entreprise || "votre artisan").replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, 80);
      const envoye = await envoyerEmail(client.email, `Rappel : rendez-vous demain avec ${nomSujet}`, html);
      if (envoye) {
        resultats.push({ intervention_id: inter.id, statut: "envoye" });
      } else {
        // L'envoi a échoué : on annule la réclamation, le rappel sera retenté au prochain passage.
        const { error: errAnnul } = await sb.from("mpa_artisans_interventions").update({ rappel_envoye: false }).eq("id", inter.id);
        if (errAnnul) console.error("[envoyer-rappels-prestations] Annulation de la réclamation impossible :", errAnnul.message);
        resultats.push({ intervention_id: inter.id, statut: "echec_envoi" });
      }
    }

    return json({ ok: true, date: dateCible, traites: resultats.length, resultats });

  } catch (e) {
    console.error("[envoyer-rappels-prestations]", e);
    return json({ error: MSG_ERREUR_GENERIQUE }, 500); // le détail reste dans les journaux
  }
});
