// ═══════════════════════════════════════════════════════════
// CaraLink Artisans — Edge Function : lire-catalogue
// Propriété : TOI Freddy
//
// Page catalogue publique d'un artisan, via son lien unique (slug) — pensé
// comme les portails apprenants de CaraLink Formation : un lien à partager,
// aucune connexion nécessaire pour le visiteur.
//
// Produits phares : ceux que l'artisan a choisis à la main (est_phare) ;
// à défaut, les 3 meilleures ventes (calculées sur les commandes payées,
// jamais un compteur stocké à part — toujours recalculé, jamais désynchronisé).
// Nouveauté : un produit créé il y a moins de 30 jours, calculé à la volée,
// jamais un champ à cocher qui resterait vrai indéfiniment.
//
// GET ?s=<slug>
// ═══════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const JOURS_NOUVEAUTE = 30;
const NB_PHARES = 3;

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const sb = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

  try {
    const url = new URL(req.url);
    const slug = url.searchParams.get("s");
    if (!slug) return json({ error: "Lien manquant." }, 400);

    const { data: artisan, error } = await sb.from("artisans")
      .select("id, nom_entreprise, secteur, commune, photo_profil_url, verifie, code_promo, stripe_connect_statut")
      .eq("slug_catalogue", slug)
      .eq("actif", true)
      .maybeSingle();
    if (error) throw error;
    if (!artisan) return json({ error: "Boutique introuvable." }, 404);

    const { data: produits, error: errP } = await sb.from("artisans_catalogue")
      .select("id, nom, description, prix, url_photo, type, delai_preparation, est_phare, promo_pct, created_at")
      .eq("artisan_id", artisan.id)
      .order("ordre", { ascending: true });
    if (errP) throw errP;

    const liste = produits || [];
    const idsPresents = liste.map((p) => p.id);

    // Ventes par produit (quantité cumulée sur les commandes réglées), pour le repli
    // "meilleures ventes" — jamais de compteur stocké, toujours recalculé à la demande.
    const ventesParProduit = new Map<string, number>();
    if (idsPresents.length) {
      const { data: commandes } = await sb.from("commandes_catalogue")
        .select("catalogue_id, quantite")
        .in("catalogue_id", idsPresents)
        .in("paiement_statut", ["paye", "partiellement_rembourse", "rembourse"]);
      (commandes || []).forEach((c: any) => {
        if (!c.catalogue_id) return;
        ventesParProduit.set(c.catalogue_id, (ventesParProduit.get(c.catalogue_id) || 0) + (c.quantite || 0));
      });
    }

    const auMoinsUnPhareChoisi = liste.some((p: any) => p.est_phare);
    let idsPhares: Set<string>;
    if (auMoinsUnPhareChoisi) {
      idsPhares = new Set(liste.filter((p: any) => p.est_phare).slice(0, NB_PHARES).map((p: any) => p.id));
    } else {
      idsPhares = new Set(
        [...liste].sort((a: any, b: any) => (ventesParProduit.get(b.id) || 0) - (ventesParProduit.get(a.id) || 0))
          .slice(0, NB_PHARES).map((p: any) => p.id),
      );
    }

    const seuilNouveaute = Date.now() - JOURS_NOUVEAUTE * 86400000;
    const produitsAff = liste.map((p: any) => ({
      id: p.id, nom: p.nom, description: p.description, prix: p.prix, url_photo: p.url_photo,
      type: p.type, delai_preparation: p.delai_preparation, promo_pct: p.promo_pct,
      est_phare: idsPhares.has(p.id),
      est_nouveaute: new Date(p.created_at).getTime() >= seuilNouveaute,
    }));

    return json({
      artisan: { id: artisan.id, nom_entreprise: artisan.nom_entreprise, secteur: artisan.secteur, commune: artisan.commune, photo_profil_url: artisan.photo_profil_url, verifie: artisan.verifie, code_promo: artisan.code_promo, paiement_actif: artisan.stripe_connect_statut === "actif" },
      produits: produitsAff,
      produits_phares: produitsAff.filter((p) => p.est_phare),
    });

  } catch (e) {
    console.error("[lire-catalogue]", e);
    const msg = (e instanceof Error) ? e.message : "Erreur serveur.";
    return json({ error: msg }, 500);
  }
});
