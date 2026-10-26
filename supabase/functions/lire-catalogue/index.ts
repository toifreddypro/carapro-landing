// ═══════════════════════════════════════════════════════════
// CaraLink Artisans — Edge Function : lire-catalogue
// Propriété : TOI Freddy
//
// Page catalogue publique d'un artisan, via son lien unique (slug) — pensé
// comme les portails apprenants de CaraLink Formation : un lien à partager,
// aucune connexion nécessaire pour le visiteur.
//
// Produits phares : ceux que l'artisan a choisis à la main (est_phare) ;
// à défaut, les meilleures ventes (autant que l'offre le permet : 1 en gratuit, 4 en Pro) (calculées sur les commandes payées,
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
// Produits phares selon l'offre : 1 en gratuit, 4 en Pro (même règle écrite côté base : phares-plan.sql).
const NB_PHARES_GRATUIT = 1;
const NB_PHARES_PRO = 4;
function nbPharesPlan(plan: string | null | undefined): number {
  return (plan === "pro" || plan === "pro_offert") ? NB_PHARES_PRO : NB_PHARES_GRATUIT;
}
const NB_COMPLEMENTAIRES = 3;

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// Un code promo n'est valable que si l'artisan est Pro, qu'il a un code ET un pourcentage (1 à 50), et que la date de fin n'est pas passée (jour de Guadeloupe).
function codePromoValide(a: any, plan: string | null | undefined): boolean {
  if (!a || !a.code_promo || !String(a.code_promo).trim()) return false;
  if (plan !== "pro" && plan !== "pro_offert") return false;
  const pct = Number(a.code_promo_pct);
  if (!(pct >= 1 && pct <= 50)) return false;
  if (a.code_promo_fin) {
    const aujourdhui = new Date(Date.now() - 4 * 3600 * 1000).toISOString().slice(0, 10);
    if (String(a.code_promo_fin).slice(0, 10) < aujourdhui) return false;
  }
  return true;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const sb = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

  try {
    const url = new URL(req.url);
    const slug = url.searchParams.get("s");
    if (!slug) return json({ error: "Lien manquant." }, 400);

    const { data: artisan, error } = await sb.from("artisans")
      .select("id, nom_entreprise, secteur, commune, photo_profil_url, verifie, code_promo, code_promo_pct, code_promo_fin, code_promo_visible, stripe_connect_statut, boutique_en_pause, plan, cashback_pct, boutique_banniere_url, boutique_texte, boutique_accent, boutique_fond, boutique_affiche_adresse, boutique_affiche_telephone, boutique_affiche_email, adresse, code_postal, telephone, email")
      .eq("slug_catalogue", slug)
      .eq("actif", true)
      .maybeSingle();
    if (error) throw error;
    if (!artisan) return json({ error: "Boutique introuvable." }, 404);

    // Règle du 06/10 : tant que les paiements en ligne de l'artisan ne sont pas ACTIFS, sa boutique n'existe pas pour le public
    // (même les produits déjà « en vente » sont masqués). La page affiche « Cette boutique ouvrira bientôt ».
    if (artisan.stripe_connect_statut !== "actif") {
      return json({
        artisan: { id: artisan.id, nom_entreprise: artisan.nom_entreprise, secteur: artisan.secteur, commune: artisan.commune, photo_profil_url: artisan.photo_profil_url, verifie: artisan.verifie, code_promo: null, paiement_actif: false },
        produits: [], produits_phares: [], boutique_ouverte: false,
      });
    }

    // Boutique mise en pause par l'artisan : aucun produit n'est montré, la page affiche « momentanément fermée ».
    if (artisan.boutique_en_pause === true) {
      return json({
        artisan: { id: artisan.id, nom_entreprise: artisan.nom_entreprise, secteur: artisan.secteur, commune: artisan.commune, photo_profil_url: artisan.photo_profil_url, verifie: artisan.verifie, code_promo: null, paiement_actif: true },
        produits: [], produits_phares: [], boutique_ouverte: false, boutique_en_pause: true,
      });
    }

    const { data: produits, error: errP } = await sb.from("artisans_catalogue")
      .select("id, nom, description, prix, url_photo, type, delai_preparation, est_phare, promo_pct, categorie, created_at")
      .eq("artisan_id", artisan.id)
      .or("en_vente.is.null,en_vente.eq.true") // « Mon stock » (en_vente = false) n'est jamais affiché : seulement ce que l'artisan a mis au catalogue
      .order("ordre", { ascending: true });
    if (errP) throw errP;

    const liste = produits || [];
    const idsPresents = liste.map((p: any) => p.id);

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

    const nbPhares = nbPharesPlan(artisan.plan);
    const auMoinsUnPhareChoisi = liste.some((p: any) => p.est_phare);
    let idsPhares: Set<string>;
    if (auMoinsUnPhareChoisi) {
      idsPhares = new Set(liste.filter((p: any) => p.est_phare).slice(0, nbPhares).map((p: any) => p.id));
    } else {
      idsPhares = new Set(
        [...liste].sort((a: any, b: any) => (ventesParProduit.get(b.id) || 0) - (ventesParProduit.get(a.id) || 0))
          .slice(0, nbPhares).map((p: any) => p.id),
      );
    }

    // Souvent achetés ensemble — jamais une heuristique, toujours les vraies commandes panier
    // réglées (table commandes_catalogue_lignes, la seule source possible : une commande d'un
    // seul article ne peut par définition rien dire sur un co-achat). Pour chaque produit, les
    // autres articles les plus fréquemment présents dans le MÊME panier, classés par fréquence.
    const complementaires = new Map<string, string[]>();
    if (idsPresents.length) {
      const { data: lignesPanier } = await sb.from("commandes_catalogue_lignes")
        .select("commande_id, catalogue_id, commandes_catalogue!inner(paiement_statut)")
        .in("catalogue_id", idsPresents)
        .in("commandes_catalogue.paiement_statut", ["paye", "partiellement_rembourse", "rembourse"]);

      const parCommande = new Map<string, Set<string>>();
      (lignesPanier || []).forEach((l: any) => {
        if (!l.catalogue_id) return;
        if (!parCommande.has(l.commande_id)) parCommande.set(l.commande_id, new Set());
        parCommande.get(l.commande_id)!.add(l.catalogue_id);
      });

      const compteurs = new Map<string, Map<string, number>>();
      parCommande.forEach((idsDuPanier) => {
        const uniques = [...idsDuPanier];
        if (uniques.length < 2) return; // un panier d'un seul article n'apprend rien sur un co-achat
        uniques.forEach((a) => {
          uniques.forEach((b) => {
            if (a === b) return;
            if (!compteurs.has(a)) compteurs.set(a, new Map());
            const m = compteurs.get(a)!;
            m.set(b, (m.get(b) || 0) + 1);
          });
        });
      });

      compteurs.forEach((autres, produitId) => {
        const tries = [...autres.entries()].sort((x, y) => y[1] - x[1]).slice(0, NB_COMPLEMENTAIRES).map((e) => e[0]);
        complementaires.set(produitId, tries);
      });
    }

    const seuilNouveaute = Date.now() - JOURS_NOUVEAUTE * 86400000;
    const produitsAff = liste.map((p: any) => ({
      id: p.id, nom: p.nom, description: p.description, prix: p.prix, url_photo: p.url_photo,
      type: p.type, delai_preparation: p.delai_preparation, promo_pct: p.promo_pct, categorie: p.categorie,
      est_phare: idsPhares.has(p.id),
      est_nouveaute: new Date(p.created_at).getTime() >= seuilNouveaute,
      complementaires: complementaires.get(p.id) || [],
    }));

    const codeOk = codePromoValide(artisan, artisan.plan);
    return json({
      artisan: { id: artisan.id, nom_entreprise: artisan.nom_entreprise, secteur: artisan.secteur, commune: artisan.commune, photo_profil_url: artisan.photo_profil_url, verifie: artisan.verifie, code_promo: (codeOk && artisan.code_promo_visible !== false) ? artisan.code_promo : null, code_promo_pct: (codeOk && artisan.code_promo_visible !== false) ? Number(artisan.code_promo_pct) : null, code_promo_fin: (codeOk && artisan.code_promo_visible !== false) ? (artisan.code_promo_fin ?? null) : null, code_promo_actif: codeOk, boutique_banniere_url: artisan.boutique_banniere_url ?? null, boutique_texte: (artisan.boutique_texte ?? "").trim() || null, boutique_accent: artisan.boutique_accent ?? null, boutique_fond: artisan.boutique_fond ?? null,
        // Coordonnées : publiées UNIQUEMENT si l'artisan a coché la case correspondante dans MPA.
        contact_adresse: artisan.boutique_affiche_adresse === true ? ([artisan.adresse, [artisan.code_postal, artisan.commune].filter(Boolean).join(" ")].map((x: any) => String(x ?? "").trim()).filter(Boolean).join(", ") || null) : null,
        contact_telephone: artisan.boutique_affiche_telephone === true ? (String(artisan.telephone ?? "").trim() || null) : null,
        contact_email: artisan.boutique_affiche_email === true ? (String(artisan.email ?? "").trim() || null) : null,
        cashback_pct: ((artisan.plan === "pro" || artisan.plan === "pro_offert") && Number(artisan.cashback_pct) >= 1) ? Number(artisan.cashback_pct) : null, paiement_actif: artisan.stripe_connect_statut === "actif" },
      produits: produitsAff,
      produits_phares: produitsAff.filter((p: any) => p.est_phare),
    });

  } catch (e) {
    console.error("[lire-catalogue]", e);
    const msg = (e instanceof Error) ? e.message : "Erreur serveur.";
    return json({ error: "Une erreur est survenue. Réessayez dans un instant." }, 500);
  }
});
