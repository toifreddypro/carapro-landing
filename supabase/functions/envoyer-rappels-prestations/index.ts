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
// ═══════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ADMIN_EMAIL = "toifreddypro@gmail.com";
const CRON_SECRET = Deno.env.get("RAPPELS_CRON_SECRET");

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function demainISO(): string {
  const d = new Date();
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
    const estCron = !!CRON_SECRET && secretCron === CRON_SECRET;

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

      const heure = inter.heure_debut || (inter.creneau === "matin" ? "dans la matinée" : inter.creneau === "apres-midi" ? "dans l'après-midi" : "");
      const html = `<div style="font-family:sans-serif;max-width:480px;">
        <h2 style="color:#B5502F;">Rappel — rendez-vous demain</h2>
        <p>Bonjour ${client.nom || ""},</p>
        <p>Petit rappel : <strong>${artisan?.nom_entreprise || "votre artisan"}</strong> a rendez-vous avec vous demain${service?.nom_service ? " pour : " + service.nom_service : ""}${heure ? " — " + heure : ""}.</p>
        ${artisan?.telephone ? `<p>Une question ou besoin de reporter ? Contactez directement l'artisan au ${artisan.telephone}.</p>` : ""}
      </div>`;

      const envoye = await envoyerEmail(client.email, `Rappel : rendez-vous demain avec ${artisan?.nom_entreprise || "votre artisan"}`, html);
      if (envoye) {
        await sb.from("mpa_artisans_interventions").update({ rappel_envoye: true }).eq("id", inter.id);
        resultats.push({ intervention_id: inter.id, statut: "envoye" });
      } else {
        resultats.push({ intervention_id: inter.id, statut: "echec_envoi" });
      }
    }

    return json({ ok: true, date: dateCible, traites: resultats.length, resultats });

  } catch (e) {
    console.error("[envoyer-rappels-prestations]", e);
    return json({ error: (e as Error).message || "Erreur serveur." }, 500);
  }
});
