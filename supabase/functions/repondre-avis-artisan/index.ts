// ═══════════════════════════════════════════════════════════
// CaraLink Artisans — Edge Function : repondre-avis-artisan
// Propriété : TOI Freddy
//
// Permet à l'artisan (authentifié) de répondre publiquement à un avis
// qu'il a reçu — jamais de suppression ou de masquage, uniquement un
// droit de réponse, pour garder la crédibilité du système d'avis.
//
// POST { avis_id, reponse }
// ═══════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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

    const { avis_id, reponse } = await req.json().catch(() => ({}));
    if (!avis_id || !reponse?.trim()) return json({ error: "Réponse vide." }, 400);

    const sbAdmin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: artisan } = await sbAdmin.from("artisans").select("id").eq("user_id", user.id).maybeSingle();
    if (!artisan) return json({ error: "Aucun profil artisan trouvé." }, 404);

    // On ne modifie l'avis que s'il appartient bien à l'artisan connecté — jamais de réponse sur l'avis d'un autre.
    const { data: avis } = await sbAdmin.from("avis_carapro").select("id, artisan_id").eq("id", avis_id).maybeSingle();
    if (!avis || avis.artisan_id !== artisan.id) return json({ error: "Avis introuvable." }, 404);

    const { error } = await sbAdmin.from("avis_carapro").update({
      reponse_artisan: reponse.trim(),
      reponse_le: new Date().toISOString(),
    }).eq("id", avis_id);
    if (error) throw error;

    return json({ ok: true });

  } catch (e) {
    console.error("[repondre-avis-artisan]", e);
    return json({ error: (e as Error).message }, 500);
  }
});
