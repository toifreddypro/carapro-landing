// ═══════════════════════════════════════════════════════════
// CaraPro — Edge Function : lire-artisan
// Propriété : TOI Freddy
// Profil complet d'un artisan (vitrine) — services, photos, bio.
// Jamais téléphone/email direct — l'échange passe par une demande de
// devis, comme pour le reste de la plateforme (jamais de coordonnées
// directes avant qu'un artisan choisisse de répondre).
//
// GET ?id=X
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
    const id = url.searchParams.get("id");
    if (!id) return json({ error: "Identifiant manquant." }, 400);

    const { data: artisan, error } = await sb.from("artisans")
      .select("id, nom_entreprise, secteur, commune, bio, photo_profil_url, verifie, rayon_intervention_km, alternance_niveau, stripe_connect_statut, slug_catalogue, code_promo")
      .eq("id", id)
      .eq("actif", true)
      .maybeSingle();
    if (error) throw error;
    if (!artisan) return json({ error: "Artisan introuvable." }, 404);

    const { data: services } = await sb.from("artisans_services")
      .select("id, nom_service, description, prix_indicatif, unite, duree_estimee_min")
      .eq("artisan_id", id)
      .order("ordre", { ascending: true });

    const { data: photos } = await sb.from("artisans_photos")
      .select("url_photo, legende")
      .eq("artisan_id", id)
      .order("ordre", { ascending: true });

    // Produits phares — choisis à la main par l'artisan (est_phare), sinon repli sur les 3
    // meilleures ventes. Même logique que catalogue.html et la vignette (verifier-disponibilite-
    // artisan.ts), jamais un compteur stocké : toujours recalculé sur les commandes réglées.
    // Le catalogue complet reste sur la page boutique dédiée (lien slug_catalogue) — cette fiche
    // ne montre qu'un aperçu soigné des produits phares, pas la liste entière.
    const { data: produitsArtisan } = await sb.from("artisans_catalogue")
      .select("id, nom, description, prix, url_photo, type, delai_preparation, promo_pct, est_phare")
      .eq("artisan_id", id);
    const listeProduits = produitsArtisan || [];
    let produitsPhares: any[] = [];
    if (listeProduits.length) {
      const idsProduits = listeProduits.map((p: any) => p.id);
      const { data: commandes } = await sb.from("commandes_catalogue")
        .select("catalogue_id, quantite").in("catalogue_id", idsProduits)
        .in("paiement_statut", ["paye", "partiellement_rembourse", "rembourse"]);
      const ventes = new Map<string, number>();
      (commandes || []).forEach((c: any) => { if (c.catalogue_id) ventes.set(c.catalogue_id, (ventes.get(c.catalogue_id) || 0) + (c.quantite || 0)); });

      const phares = listeProduits.filter((p: any) => p.est_phare);
      const source = phares.length
        ? phares
        : [...listeProduits].sort((a: any, b: any) => (ventes.get(b.id) || 0) - (ventes.get(a.id) || 0));
      produitsPhares = source.slice(0, 3).map((p: any) => ({
        id: p.id, nom: p.nom, description: p.description, prix: p.prix, url_photo: p.url_photo,
        type: p.type, delai_preparation: p.delai_preparation, promo_pct: p.promo_pct,
      }));
    }

    const { data: avis } = await sb.from("avis_carapro")
      .select("client_nom, note, commentaire, created_at, reponse_artisan, reponse_le")
      .eq("artisan_id", id)
      .order("created_at", { ascending: false })
      .limit(10);

    const noteMoyenne = avis && avis.length
      ? Math.round((avis.reduce((s, a) => s + a.note, 0) / avis.length) * 10) / 10
      : null;

    return json({
      artisan,
      services: services || [],
      photos: photos || [],
      produits_phares: produitsPhares,
      avis: avis || [],
      note_moyenne: noteMoyenne,
      nb_avis: (avis || []).length,
    });

  } catch (e) {
    console.error("[lire-artisan]", e);
    const msg = (e instanceof Error) ? e.message : (e && typeof e === "object" && "message" in e) ? String((e as any).message) : "Erreur serveur.";
    return json({ error: msg }, 500);
  }
});
