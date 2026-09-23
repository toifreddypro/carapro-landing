// ═══════════════════════════════════════════════════════════
// CaraLink Artisans — Edge Function : demander-avis
// Propriété : TOI Freddy
//
// Déclenchée par l'artisan (authentifié) depuis MPA Artisans, sur une
// intervention Terminée ou Payée. Génère un lien à usage unique et
// envoie un email au client pour lui demander de noter l'intervention.
// Jamais automatique — c'est toujours l'artisan qui décide d'envoyer.
//
// POST { intervention_id }
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
  if (!apiKey) { console.warn("[demander-avis] RESEND_API_KEY absente — email non envoyé."); return; }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "CaraLink Artisans <notifications@learnlogicstudio.com>", to: [to], subject, html }),
    });
    if (!res.ok) console.error("[demander-avis] Échec envoi Resend :", await res.text());
  } catch (e) { console.error("[demander-avis] Erreur envoi email :", e); }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Non authentifié." }, 401);

    const sbCaller = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await sbCaller.auth.getUser();
    if (!user) return json({ error: "Session invalide." }, 401);

    const { intervention_id } = await req.json().catch(() => ({}));
    if (!intervention_id) return json({ error: "intervention_id manquant." }, 400);

    const sbAdmin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: artisan } = await sbAdmin.from("artisans").select("id, nom_entreprise").eq("user_id", user.id).maybeSingle();
    if (!artisan) return json({ error: "Aucun profil artisan trouvé." }, 404);

    const { data: intervention, error: errI } = await sbAdmin.from("mpa_artisans_interventions")
      .select("id, artisan_id, client_id, statut, avis_token, mpa_artisans_clients(nom, email)")
      .eq("id", intervention_id).eq("artisan_id", artisan.id).maybeSingle();
    if (errI) throw errI;
    if (!intervention) return json({ error: "Intervention introuvable." }, 404);
    if (!["terminee", "payee"].includes(intervention.statut)) {
      return json({ error: "Cette intervention doit être marquée Terminée ou Payée avant de demander un avis." }, 400);
    }
    const client = (intervention as any).mpa_artisans_clients;
    if (!client?.email) return json({ error: "Ce client n'a pas d'adresse email enregistrée — impossible de lui envoyer la demande." }, 400);

    // Réutilise le même token si une demande a déjà été envoyée pour cette intervention
    // (permet à l'artisan de renvoyer l'email sans casser un lien déjà transmis).
    let token = intervention.avis_token;
    if (!token) {
      token = crypto.randomUUID();
      const { error: errMaj } = await sbAdmin.from("mpa_artisans_interventions")
        .update({ avis_token: token, avis_demande_le: new Date().toISOString() })
        .eq("id", intervention_id);
      if (errMaj) throw errMaj;
    }

    const base = Deno.env.get("SUPABASE_URL") ?? "";
    const lien = `${base}/functions/v1/soumettre-avis-artisan?token=${token}`;
    const html = `<div style="font-family:sans-serif;max-width:480px;">
      <h2 style="color:#B5502F;">Votre avis compte !</h2>
      <p>${artisan.nom_entreprise} vous invite à partager votre expérience sur l'intervention réalisée.</p>
      <div style="margin:24px 0;">
        <a href="${lien}" style="display:inline-block;padding:12px 24px;border-radius:8px;background:#B5502F;color:#fff;font-weight:700;text-decoration:none;">⭐ Laisser mon avis</a>
      </div>
      <p style="font-size:12px;color:#6b7c96;">Ça prend moins d'une minute, aucun compte n'est nécessaire.</p>
    </div>`;
    await envoyerEmail(client.email, `${artisan.nom_entreprise} vous invite à donner votre avis`, html);

    return json({ ok: true });

  } catch (e) {
    console.error("[demander-avis]", e);
    return json({ error: (e as Error).message }, 500);
  }
});
