// ═══════════════════════════════════════════════════════════
// CaraPro — Edge Function : lister-artisans
// Propriété : TOI Freddy
// Annuaire public — ne renvoie JAMAIS téléphone/email/SIRET, réservés
// aux échanges après mise en relation via un devis. Champs vitrine
// uniquement (nom, secteur, commune, bio, photo, vérification).
//
// Après le 1er novembre 2026 : seuls les artisans avec Stripe actif sont listés.
// GET ?secteur=X&commune=Y&q=texte
// ═══════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FIN_PERIODE_GRACE = "2026-11-01";

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
      .eq("suspendu_commission", false)
      .order("verifie", { ascending: false }) // les profils vérifiés remontent naturellement
      .order("created_at", { ascending: false });

    // Après la période de grâce (1er novembre 2026), seuls les artisans dont les paiements en ligne (Stripe) sont actifs apparaissent
    // dans l'annuaire : sans paiement en ligne, ils ne peuvent pas recevoir de réservation. Le filtre est fait côté serveur.
    const aujourdhui = new Date(Date.now() - 4 * 3600 * 1000).toISOString().slice(0, 10); // date en Guadeloupe (UTC-4)
    if (aujourdhui > FIN_PERIODE_GRACE) requete = requete.eq("stripe_connect_statut", "actif");

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
