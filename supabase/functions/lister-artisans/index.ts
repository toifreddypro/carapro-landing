// ═══════════════════════════════════════════════════════════
// CaraPro — Edge Function : lister-artisans
// Propriété : TOI Freddy
// Annuaire public — ne renvoie JAMAIS téléphone/email/SIRET, réservés
// aux échanges après mise en relation via un devis. Champs vitrine
// uniquement (nom, secteur, commune, bio, photo, vérification).
//
// GET ?secteur=X&commune=Y&q=texte
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

  const sb = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  try {
    const url = new URL(req.url);
    const secteur = url.searchParams.get("secteur");
    const commune = url.searchParams.get("commune");
    const q = url.searchParams.get("q");

    let requete = sb.from("artisans")
      .select("id, nom_entreprise, secteur, commune, bio, photo_profil_url, verifie, rayon_intervention_km")
      .eq("actif", true)
      .order("verifie", { ascending: false }) // les profils vérifiés remontent naturellement
      .order("created_at", { ascending: false });

    if (secteur) requete = requete.eq("secteur", secteur);
    if (commune) requete = requete.ilike("commune", "%" + commune + "%");
    if (q) requete = requete.or("nom_entreprise.ilike.%" + q + "%,bio.ilike.%" + q + "%");

    const { data, error } = await requete;
    if (error) throw error;

    return json({ artisans: data || [] });

  } catch (e) {
    console.error("[lister-artisans]", e);
    const msg = (e instanceof Error) ? e.message : "Erreur serveur.";
    return json({ error: msg }, 500);
  }
});
