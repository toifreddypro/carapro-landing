// ═══════════════════════════════════════════════════════════
// CaraLink Artisans — Edge Function : signaler-retard
// Propriété : TOI Freddy
//
// Action manuelle, déclenchée par l'artisan lui-même depuis "Ma journée" (bouton ⏰
// discret sur la carte du jour) — jamais une détection automatique : on n'a aucun suivi
// de position en temps réel, donc impossible de savoir qu'un artisan est en retard tout
// seul. L'artisan dit "je suis en retard", on prévient le client par email.
// ═══════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function envoyerEmail(to: string, subject: string, html: string) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) { console.warn("[signaler-retard] RESEND_API_KEY absente — email non envoyé."); return; }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "CaraLink Artisans <notifications@learnlogicstudio.com>", to: [to], subject, html }),
  });
  if (!res.ok) console.error("[signaler-retard] Échec envoi Resend :", await res.text());
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);

  const sbAdmin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const sbAnon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Non authentifié." }, 401);
    const { data: userData, error: userErr } = await sbAnon.auth.getUser(token);
    if (userErr || !userData?.user) return json({ error: "Session invalide." }, 401);

    const { data: artisan } = await sbAdmin.from("artisans").select("id, nom_entreprise, plan").eq("user_id", userData.user.id).maybeSingle();
    if (!artisan) return json({ error: "Profil artisan introuvable." }, 404);
    // Réservé à l'offre Pro — refusé ici aussi, jamais seulement caché dans l'interface.
    if (artisan.plan !== "pro" && artisan.plan !== "pro_offert") return json({ error: "retard_reserve_pro" }, 403);

    const body = await req.json().catch(() => null);
    const minutes = Number(body?.minutes);
    if (!body?.intervention_id) return json({ error: "intervention_id manquant." }, 400);
    if (!minutes || minutes <= 0 || minutes > 600) return json({ error: "Nombre de minutes invalide." }, 400);

    const { data: intervention, error: errI } = await sbAdmin.from("mpa_artisans_interventions")
      .select("id, artisan_id, heure_debut, mpa_artisans_clients(nom, email)")
      .eq("id", body.intervention_id).eq("artisan_id", artisan.id).maybeSingle();
    if (errI) throw errI;
    if (!intervention) return json({ error: "Intervention introuvable." }, 404);

    const client = (intervention as any).mpa_artisans_clients;
    if (!client?.email) return json({ error: "Ce client n'a pas d'email enregistré." }, 400);

    const html = `<div style="font-family:sans-serif;max-width:480px;">
      <h2 style="color:#B5502F;">⏰ Léger retard prévu</h2>
      <p>Bonjour ${client.nom},</p>
      <p><strong>${artisan.nom_entreprise}</strong> vous informe d'un retard d'environ <strong>${minutes} minutes</strong> sur votre rendez-vous${intervention.heure_debut ? " de " + intervention.heure_debut : ""} aujourd'hui.</p>
      <p>Merci de votre compréhension.</p>
    </div>`;
    await envoyerEmail(client.email, `⏰ Léger retard prévu — ${artisan.nom_entreprise}`, html);

    return json({ ok: true });

  } catch (e) {
    console.error("[signaler-retard]", e);
    return json({ error: (e as Error).message }, 500);
  }
});
