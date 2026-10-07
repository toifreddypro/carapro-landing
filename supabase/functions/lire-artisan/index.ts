// ═══════════════════════════════════════════════════════════
// CaraPro — Edge Function : lire-artisan
// Propriété : TOI Freddy
// Profil complet d'un artisan (vitrine) — services, photos, bio.
// Jamais téléphone/email direct — l'échange passe par une demande de
// devis, comme pour le reste de la plateforme (jamais de coordonnées
// directes avant qu'un artisan choisisse de répondre).
//
// GET ?id=X
//
// Frais de déplacement d'une visite sur place et réglage « proposer la visite » (tous deux réglés par l'artisan dans MPA) :
// affichés / appliqués sur la fiche. Colonnes facultatives : si elles n'existent pas encore, la fiche s'affiche quand même.
//
// Sécurité : seuls les produits MIS AU CATALOGUE (en_vente) sont montrés (jamais « Mon stock ») ; l'identifiant est contrôlé ;
// limitation par visiteur ; note moyenne et nombre d'avis calculés sur TOUS les avis (la liste n'en montre que 10) ;
// aucune erreur interne n'est détaillée.
// ═══════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Limitation par visiteur (voir securite-limites.sql). Si le limiteur lui-même tombe en panne, on laisse passer :
//    ce sont des lectures publiques, mieux vaut un service disponible qu'un site bloqué par une panne du limiteur. ──
const COLONNES_ARTISAN_BASE = "id, nom_entreprise, secteur, commune, bio, photo_profil_url, verifie, rayon_intervention_km, alternance_niveau, stripe_connect_statut, slug_catalogue, code_promo";
// Du plus complet au plus simple : si une colonne facultative n'existe pas encore (SQL pas lancé), on réessaie avec moins.
const JEUX_COLONNES_ARTISAN = [`${COLONNES_ARTISAN_BASE}, frais_deplacement, proposer_visite`, `${COLONNES_ARTISAN_BASE}, frais_deplacement`, COLONNES_ARTISAN_BASE];
const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MSG_ERREUR_GENERIQUE = "Une erreur est survenue. Réessayez dans un instant.";

function ipVisiteur(req: Request): string {
  return req.headers.get("cf-connecting-ip") || (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "inconnue";
}
async function limiteAtteinte(sb: any, cle: string, max: number, fenetreSecondes: number): Promise<boolean> {
  try {
    const { data, error } = await sb.rpc("limiter_appel", { p_cle: cle, p_max: max, p_fenetre_s: fenetreSecondes });
    if (error) { console.error("[limiter_appel]", error.message); return false; }
    return data === false;
  } catch (e) { console.error("[limiter_appel]", e); return false; }
}
function reponseTropDeRequetes(corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify({ error: "Trop de requêtes. Réessayez dans une minute." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "60" } });
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") return json({ error: "Méthode non autorisée." }, 405);

  const sb = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return json({ error: "Identifiant manquant." }, 400);
    if (!REGEX_UUID.test(id)) return json({ error: "Artisan introuvable." }, 404);
    if (await limiteAtteinte(sb, "lire-artisan:" + ipVisiteur(req), 120, 60)) return reponseTropDeRequetes(corsHeaders);

    let artisan: any = null, error: any = null;
    for (const colonnes of JEUX_COLONNES_ARTISAN) {
      ({ data: artisan, error } = await sb.from("artisans").select(colonnes).eq("id", id).eq("actif", true).maybeSingle());
      if (!(error && (error as any).code === "42703")) break;
    }
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
      .eq("artisan_id", id)
      .or("en_vente.is.null,en_vente.eq.true"); // jamais « Mon stock »
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

    // Règle du 06/10 : tant que les paiements en ligne de l'artisan ne sont pas ACTIFS, sa boutique n'existe pas pour le public :
    // ni produits mis en avant, ni lien vers la boutique sur sa fiche.
    if (artisan.stripe_connect_statut !== "actif") { produitsPhares = []; artisan.slug_catalogue = null; }

    const { data: avis } = await sb.from("avis_carapro")
      .select("client_nom, note, commentaire, created_at, reponse_artisan, reponse_le")
      .eq("artisan_id", id)
      .order("created_at", { ascending: false })
      .limit(10);

    // Note moyenne et nombre d'avis sur TOUS les avis (la liste ci-dessus n'en montre que les 10 derniers).
    const { data: toutesLesNotes } = await sb.from("avis_carapro").select("note").eq("artisan_id", id);
    const notes = (toutesLesNotes || []).map((a: any) => Number(a.note)).filter((n: number) => Number.isFinite(n));
    const noteMoyenne = notes.length ? Math.round((notes.reduce((s: number, n: number) => s + n, 0) / notes.length) * 10) / 10 : null;

    return json({
      artisan,
      services: services || [],
      photos: photos || [],
      produits_phares: produitsPhares,
      avis: avis || [],
      note_moyenne: noteMoyenne,
      nb_avis: notes.length,
    });

  } catch (e) {
    console.error("[lire-artisan]", e);
    return json({ error: MSG_ERREUR_GENERIQUE }, 500); // le détail reste dans les journaux
  }
});
