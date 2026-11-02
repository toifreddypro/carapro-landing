// ═══════════════════════════════════════════════════════════
// CaraPro — Edge Function : lister-artisans
// Propriété : TOI Freddy
// Annuaire public — ne renvoie JAMAIS téléphone/email/SIRET, réservés
// aux échanges après mise en relation via un devis. Champs vitrine
// uniquement (nom, secteur, commune, bio, photo, vérification).
//
// Les artisans sans Stripe actif restent AFFICHÉS mais marqués paiement_en_ligne = false : la vignette est grisée et expliquée (décision du 02/11/2026).
// GET ?secteur=X&commune=Y&q=texte
//
// ORDRE DE L'ANNUAIRE (règles du 31/10/2026 — « visibilité ≠ réputation ») :
//  - L'ordre par défaut est un MÉLANGE QUOTIDIEN : même résultat pour tous les visiteurs d'une même journée (le jour change à minuit,
//    heure de Guadeloupe), clé = date + identifiant de l'artisan. Les avis n'y entrent JAMAIS, ni l'abonnement Pro.
//  - « Nouveau sur CaraLink » = inscrit depuis moins de 90 jours ET moins de 3 avis. Une place découverte est réservée toutes les 3 positions
//    (3e, 6e, 9e…) à un profil nouveau, s'il en reste ; sinon les autres profils remontent. Après 90 jours, l'artisan rejoint le mélange normal.
//  - Les chiffres (avis, photos…) sont renvoyés tels quels pour AIDER à choisir ; l'absence d'avis donne note_moyenne = null, jamais 0.
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

const JOURS_NOUVEAU = 90;      // un artisan reste « nouveau » 90 jours…
const AVIS_NOUVEAU = 3;        // …ou jusqu'à son 3e avis, le premier des deux
const PAS_DECOUVERTE = 3;      // une place découverte toutes les 3 positions

// Jour de Guadeloupe (UTC-4) : la clé du mélange change à minuit chez nous, pas à 20 h.
function jourGuadeloupe(): string {
  return new Date(Date.now() - 4 * 3600 * 1000).toISOString().slice(0, 10);
}

// Clé de mélange déterministe : même jour + même artisan = même clé, pour tous les visiteurs.
async function cleDuJour(jour: string, id: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(jour + "|" + id));
  return Array.from(new Uint8Array(buf).slice(0, 8)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// « Profil complet » : photo de profil, description d'au moins 40 caractères et au moins un service.
function profilComplet(a: any, nbServices: number): boolean {
  return !!a.photo_profil_url && String(a.bio || "").trim().length >= 40 && nbServices > 0;
}

// Insère un profil nouveau en 3e, 6e, 9e… position ; s'il n'y en a plus, les autres continuent normalement.
function intercalerDecouverte<T>(ordinaires: T[], nouveaux: T[]): T[] {
  const sortie: T[] = [];
  let o = 0, n = 0;
  while (o < ordinaires.length || n < nouveaux.length) {
    const positionDecouverte = (sortie.length + 1) % PAS_DECOUVERTE === 0;
    if (positionDecouverte && n < nouveaux.length) sortie.push(nouveaux[n++]);
    else if (o < ordinaires.length) sortie.push(ordinaires[o++]);
    else sortie.push(nouveaux[n++]);
  }
  return sortie;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const sb = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  try {
    try {
      const ip = req.headers.get("cf-connecting-ip") || (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "inconnue";
      const { data: autorise } = await sb.rpc("limiter_appel", { p_cle: `lister-artisans:${ip}`, p_max: 120, p_fenetre_s: 60 });
      if (autorise === false) return new Response(JSON.stringify({ error: "Trop de requêtes. Réessayez dans une minute." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "60" } });
    } catch (e) { console.error("[lister-artisans] limiter_appel :", e); }
    const url = new URL(req.url);
    const secteur = url.searchParams.get("secteur");
    const commune = url.searchParams.get("commune");
    const q = url.searchParams.get("q");

    let requete = sb.from("artisans")
      .select("id, nom_entreprise, secteur, commune, bio, photo_profil_url, verifie, rayon_intervention_km, created_at, rge_statut, rge_valide_jusqu, stripe_connect_statut")
      .eq("actif", true)
      .eq("suspendu_commission", false);

    // Un artisan sans paiement en ligne (Stripe) ne peut pas encaisser une réservation ni une commande : il reste visible dans l'annuaire,
    // mais sa vignette est grisée (champ paiement_en_ligne). La fiche détaillée reste fermée tant que Stripe n'est pas finalisé.
    const aujourdhui = new Date(Date.now() - 4 * 3600 * 1000).toISOString().slice(0, 10); // date en Guadeloupe (UTC-4)
    // Filtre « artisans RGE » : uniquement un badge validé par l'administrateur ET encore dans sa date de validité.
    if (url.searchParams.get("rge") === "1") requete = requete.eq("rge_statut", "valide").gte("rge_valide_jusqu", aujourdhui);

    if (secteur) requete = requete.eq("secteur", secteur);
    if (commune) requete = requete.ilike("commune", "%" + commune + "%");
    // Audit du 01/11 : le texte cherché entrait tel quel dans le filtre « .or(...) » de la base. Avec une virgule, un visiteur pouvait y glisser
    // une condition sur une colonne PRIVÉE (téléphone, email, SIRET) et deviner ces valeurs en regardant quels artisans apparaissent.
    // On ne garde donc que lettres, chiffres, espaces, tiret et apostrophe : plus aucun caractère qui a un sens dans un filtre.
    const recherche = (q || "").replace(/[^\p{L}\p{N} '\-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 60);
    if (recherche) requete = requete.or("nom_entreprise.ilike.%" + recherche + "%,bio.ilike.%" + recherche + "%");

    const { data, error } = await requete;
    if (error) throw error;
    const liste: any[] = data || [];

    // Chiffres de l'annuaire (avis, photos, services) en un seul appel.
    const stats = new Map<string, any>();
    if (liste.length) {
      const { data: lignes, error: errStats } = await sb.rpc("stats_annuaire", { p_ids: liste.map((a) => a.id) });
      if (errStats) throw errStats;
      for (const l of lignes || []) stats.set(l.artisan_id, l);
    }

    const jour = jourGuadeloupe();
    const limiteNouveau = Date.now() - JOURS_NOUVEAU * 24 * 3600 * 1000;
    const enrichis = await Promise.all(liste.map(async (a) => {
      const st = stats.get(a.id) || {};
      const nbAvis = Number(st.nb_avis || 0);
      const nouveau = new Date(a.created_at).getTime() > limiteNouveau && nbAvis < AVIS_NOUVEAU;
      const { created_at: _c, rge_statut: _rs, rge_valide_jusqu: _rv, stripe_connect_statut: _sc, ...publics } = a; // la date d'inscription et l'état interne du dossier RGE ne sont pas publics
      const rgeActif = a.rge_statut === "valide" && !!a.rge_valide_jusqu && a.rge_valide_jusqu >= aujourdhui;
      return {
        cle: await cleDuJour(jour, a.id),
        nouveau,
        artisan: {
          ...publics,
          nouveau,
          paiement_en_ligne: a.stripe_connect_statut === "actif",
          rge: rgeActif,
          rge_jusqu: rgeActif ? a.rge_valide_jusqu : null,
          nb_avis: nbAvis,
          note_moyenne: nbAvis > 0 && st.note_moyenne != null ? Number(st.note_moyenne) : null, // null = pas encore d'avis (jamais 0)
          a_photos: Number(st.nb_photos || 0) > 0,
          profil_complet: profilComplet(a, Number(st.nb_services || 0)),
        },
      };
    }));

    // Mélange quotidien (jamais d'avis, jamais d'abonnement), puis place découverte toutes les 3 positions.
    const parCle = (x: any, y: any) => (x.cle < y.cle ? -1 : x.cle > y.cle ? 1 : 0);
    const ordinaires = enrichis.filter((e) => !e.nouveau).sort(parCle).map((e) => e.artisan);
    const nouveaux = enrichis.filter((e) => e.nouveau).sort(parCle).map((e) => e.artisan);

    // Les vignettes réservables d'abord, les grisées ensuite (ordre du mélange conservé dans chaque groupe).
    const ordre = intercalerDecouverte(ordinaires, nouveaux);
    const resultat = ordre.filter((x: any) => x.paiement_en_ligne).concat(ordre.filter((x: any) => !x.paiement_en_ligne));
    return json({ artisans: resultat, jour });

  } catch (e) {
    console.error("[lister-artisans]", e);
    return json({ error: "Une erreur est survenue. Réessayez dans un instant." }, 500); // le détail reste dans les journaux
  }
});
