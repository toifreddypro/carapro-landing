// ═══════════════════════════════════════════════════════════
// CaraLink Artisans — Edge Function : mon-espace-artisan
// Propriété : TOI Freddy
// Lecture complète du profil de l'artisan CONNECTÉ (jamais un autre) —
// profil, services, photos, et les devis qui lui sont associés (via
// devis_reponses), avec le détail de la demande d'origine.
//
// GET — Authorization: Bearer <token utilisateur>
// ═══════════════════════════════════════════════════════════

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

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const sbAdmin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
  const sbAnon  = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") ?? "");

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Non authentifié." }, 401);

    const { data: userData, error: userErr } = await sbAnon.auth.getUser(token);
    if (userErr || !userData?.user) return json({ error: "Session invalide." }, 401);
    const userId = userData.user.id;

    const { data: artisan, error } = await sbAdmin.from("artisans")
      .select("*").eq("user_id", userId).maybeSingle();
    if (error) throw error;
    if (!artisan) return json({ error: "Aucun profil artisan pour ce compte." }, 404);

    const [{ data: services }, { data: photos }, { data: reponses }, { data: documents }] = await Promise.all([
      sbAdmin.from("artisans_services").select("*").eq("artisan_id", artisan.id).order("ordre", { ascending: true }),
      sbAdmin.from("artisans_photos").select("*").eq("artisan_id", artisan.id).order("ordre", { ascending: true }),
      sbAdmin.from("devis_reponses").select("id, message, prix_propose, statut, created_at, demande_id").eq("artisan_id", artisan.id).order("created_at", { ascending: false }),
      sbAdmin.from("artisans_documents").select("type_document, statut_ia, created_at").eq("artisan_id", artisan.id),
    ]);

    // Détail des demandes liées à chaque réponse — jamais les coordonnées
    // d'un client tant que l'artisan n'a pas réellement répondu.
    const demandeIds = (reponses || []).map((r) => r.demande_id);
    let demandesParId: Record<string, any> = {};
    if (demandeIds.length) {
      const { data: demandes } = await sbAdmin.from("demandes_devis")
        .select("id, client_nom, client_telephone, description_besoin, commune, secteur, created_at")
        .in("id", demandeIds);
      (demandes || []).forEach((d) => { demandesParId[d.id] = d; });
    }
    const devis = (reponses || []).map((r) => ({ ...r, demande: demandesParId[r.demande_id] || null }));

    return json({ artisan, services: services || [], photos: photos || [], devis, documents: documents || [] });

  } catch (e) {
    console.error("[mon-espace-artisan]", e);
    const msg = (e instanceof Error) ? e.message : "Erreur serveur.";
    return json({ error: msg }, 500);
  }
});
