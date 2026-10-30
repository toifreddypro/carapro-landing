// ═════════════════════════════════════════════════
// CaraLink Artisans — Edge Function : admin-signalements
// Propriété : TOI Freddy
//
// Réservée à l'administrateur (toifreddypro@gmail.com, vérifié côté serveur, jamais côté navigateur).
// POST { action: "liste" }
// POST { action: "classer" | "avertir" | "bloquer" | "debloquer", signalement_id }
//   classer   : sans suite (le signalement ne compte plus)
//   avertir   : la personne verra un avertissement à sa prochaine connexion
//   bloquer   : sa messagerie est bloquée (plus de message ni de réponse à un projet) ; elle est prévenue à la connexion
//   debloquer : lève le blocage ; les signalements précédents sont classés
// ═════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const ADMIN_EMAIL = "toifreddypro@gmail.com";
const MSG_ERREUR_GENERIQUE = "Une erreur est survenue. Réessayez dans un instant.";
const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIONS = ["classer", "avertir", "bloquer", "debloquer"];

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Non authentifié." }, 401);
    const sbCaller = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await sbCaller.auth.getUser();
    if (!user || user.email !== ADMIN_EMAIL) return json({ error: "Accès réservé à l'administrateur." }, 403);

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Requête invalide." }, 400);

    if (body.action === "liste") {
      const { data, error } = await sb.rpc("admin_liste_signalements");
      if (error) throw error;
      return json({ success: true, signalements: data ?? [] });
    }
    if (!ACTIONS.includes(body.action)) return json({ error: "Action invalide." }, 400);
    if (typeof body.signalement_id !== "string" || !REGEX_UUID.test(body.signalement_id)) return json({ error: "Signalement introuvable." }, 404);

    const { data: r, error } = await sb.rpc("admin_agir_signalement", { p_id: body.signalement_id, p_action: body.action });
    if (error) throw error;
    if (!r?.ok) return json({ error: "Signalement introuvable.", code: r?.erreur }, 404);
    return json({ success: true });
  } catch (e) {
    console.error("[admin-signalements]", e);
    return json({ error: MSG_ERREUR_GENERIQUE }, 500);
  }
});
