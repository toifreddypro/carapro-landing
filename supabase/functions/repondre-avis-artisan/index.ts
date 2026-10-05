// ═══════════════════════════════════════════════════════════
// CaraLink Artisans — Edge Function : repondre-avis-artisan
// Propriété : TOI Freddy
//
// Permet à l'artisan (authentifié) de répondre publiquement à un avis
// qu'il a reçu — jamais de suppression ou de masquage, uniquement un
// droit de réponse, pour garder la crédibilité du système d'avis.
//
// POST { avis_id, reponse }
//
// Sécurité : l'avis doit appartenir à l'artisan CONNECTÉ ; l'identifiant et la réponse sont contrôlés (type, taille :
// la réponse est affichée publiquement) ; aucune erreur interne n'est détaillée.
// ═══════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const REPONSE_MAX = 1000;
const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MSG_ERREUR_GENERIQUE = "Une erreur est survenue. Réessayez dans un instant.";

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Non authentifié." }, 401);

    const sbCaller = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await sbCaller.auth.getUser();
    if (!user) return json({ error: "Session invalide." }, 401);

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Requête invalide." }, 400);
    const { avis_id, reponse } = body;
    if (typeof avis_id !== "string" || !REGEX_UUID.test(avis_id)) return json({ error: "Avis introuvable." }, 404);
    if (typeof reponse !== "string" || !reponse.trim()) return json({ error: "Réponse vide." }, 400);
    const texte = reponse.trim();
    if (texte.length > REPONSE_MAX) return json({ error: `Réponse trop longue (${REPONSE_MAX} caractères maximum).` }, 400);

    const sbAdmin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: artisan, error: errA } = await sbAdmin.from("artisans").select("id").eq("user_id", user.id).maybeSingle();
    if (errA) throw errA;
    if (!artisan) return json({ error: "Aucun profil artisan trouvé." }, 404);

    // On ne modifie l'avis que s'il appartient bien à l'artisan connecté — jamais de réponse sur l'avis d'un autre.
    const { data: avis, error: errV } = await sbAdmin.from("avis_carapro").select("id, artisan_id").eq("id", avis_id).maybeSingle();
    if (errV) throw errV;
    if (!avis || avis.artisan_id !== artisan.id) return json({ error: "Avis introuvable." }, 404);

    const { error } = await sbAdmin.from("avis_carapro").update({
      reponse_artisan: texte,
      reponse_le: new Date().toISOString(),
    }).eq("id", avis_id);
    if (error) throw error;

    return json({ ok: true });

  } catch (e) {
    console.error("[repondre-avis-artisan]", e);
    return json({ error: MSG_ERREUR_GENERIQUE }, 500); // le détail reste dans les journaux
  }
});
