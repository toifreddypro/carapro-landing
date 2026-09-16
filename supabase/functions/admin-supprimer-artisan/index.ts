// TOI Freddy
// ════════════════════════════════════════
// admin-supprimer-artisan
// Supprime définitivement un compte artisan et toutes ses données liées,
// via la fonction SQL supprimer_compte_artisan() (elle-même protégée par
// is_super_admin_artisans() côté base — double vérification, jamais
// uniquement côté client). Même modèle que admin-supprimer-compte côté
// Formation.
// ════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const sbAdmin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
  const sbAnon  = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") ?? "");

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Non authentifié." }, 401);

    // Vérification admin côté serveur — jamais uniquement côté client.
    const { data: userData, error: userErr } = await sbAnon.auth.getUser(token);
    if (userErr || !userData?.user) return json({ error: "Session invalide." }, 401);
    if (userData.user.email !== "toifreddypro@gmail.com") {
      return json({ error: "Accès refusé." }, 403);
    }

    const body = await req.json().catch(() => null);
    if (!body?.user_id) return json({ error: "user_id manquant." }, 400);

    const { data, error } = await sbAdmin.rpc("supprimer_compte_artisan", { p_user_id: body.user_id });
    if (error) throw error;

    return json(data);

  } catch (e) {
    console.error("[admin-supprimer-artisan]", e);
    const msg = (e instanceof Error) ? e.message : "Erreur serveur.";
    return json({ error: msg }, 500);
  }
});
