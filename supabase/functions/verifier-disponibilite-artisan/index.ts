// ═══════════════════════════════════════════════════════════
// CaraPro — Edge Function : verifier-disponibilite-artisan
// Propriété : TOI Freddy
//
// Deux modes, selon le corps de la requête :
//
//  1) { mode: "apercu", artisan_id, aujourdhui? }
//     → Aperçu grossier type Doctolib ("Prochaine disponibilité le...")
//       basé uniquement sur les horaires habituels de l'artisan et son
//       planning déjà rempli. AUCUN calcul de trajet (on ne connaît pas
//       encore l'adresse du client à ce stade).
//       Sert aussi à dessiner la vignette d'artisan : renvoie en plus
//       `semaine` (7 jours : plages horaires + libre/complet) et `services`
//       (noms des prestations). `aujourdhui` (AAAA-MM-JJ) = la date du
//       visiteur, pour éviter le décalage de fuseau (Guadeloupe = UTC-4).
//
//  2) { mode: "creneaux", artisan_id, adresse, code_postal, commune, duree_min }
//     → Vrai calcul Smart Dispatch : géocode l'adresse, et pour chaque
//       jour à venir, cherche les trous dans le planning réel de
//       l'artisan qui tiennent compte du trajet aller/retour vers cette
//       adresse. Retourne les créneaux qui marchent vraiment.
//
// Sécurité : ne renvoie JAMAIS le détail du planning de l'artisan
// (noms de clients, adresses des autres interventions) — uniquement
// des horaires libres/occupés calculés côté serveur.
//
// Sécurité : l'artisan doit exister ET être actif (jamais les horaires ni le code promo d'un artisan désactivé) ; seuls les
// produits MIS AU CATALOGUE (en_vente) sont montrés ; toutes les entrées sont contrôlées ; limitation par visiteur (le mode
// « créneaux » interroge des services extérieurs : adresse et itinéraires) ; délai maximum sur chaque service extérieur ;
// aucune erreur interne n'est détaillée.
// ═══════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Limitation par visiteur (voir securite-limites.sql). Si le limiteur lui-même tombe en panne, on laisse passer :
//    ce sont des lectures publiques, mieux vaut un service disponible qu'un site bloqué par une panne du limiteur. ──
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
const ADRESSE_MAX = 200, CODE_POSTAL_MAX = 10, COMMUNE_MAX = 100, DUREE_MIN = 15, DUREE_MAX = 480;

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const MARGE_SECURITE_MIN = 10;
const HORIZON_JOURS = 14; // pour le mode aperçu
const SEMAINE_JOURS = 7;  // jours affichés sur la vignette d'artisan
const FENETRE_JOURS = 5;  // nombre de colonnes affichées d'un coup en mode créneaux
const HORIZON_PAGINATION_JOURS = 84; // 12 semaines — limite de navigation "semaine suivante"
const JOURS_NOMS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const MOIS_NOMS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

function heureVersMin(hhmmss: string): number {
  const [h, m] = hhmmss.split(":");
  return parseInt(h, 10) * 60 + parseInt(m, 10);
}
function minVersHeure(min: number): string {
  min = Math.max(0, Math.round(min));
  const h = Math.floor(min / 60), m = min % 60;
  return (h < 10 ? "0" : "") + h + ":" + (m < 10 ? "0" : "") + m;
}
function arrondirQuart(min: number): number {
  return Math.ceil(min / 15) * 15;
}
function dateISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}
// "Aujourd'hui" : la date du visiteur si elle est fournie et plausible (±2 jours), sinon celle du serveur.
// Midi UTC pour éviter tout décalage de jour.
function baseJour(aujourdhuiClient: unknown): Date {
  if (typeof aujourdhuiClient === "string" && /^\d{4}-\d{2}-\d{2}$/.test(aujourdhuiClient)) {
    const d = new Date(aujourdhuiClient + "T12:00:00Z");
    if (!isNaN(d.getTime()) && Math.abs(d.getTime() - Date.now()) / 86400000 <= 2) return d;
  }
  return new Date();
}

async function geocoderAdresse(adresse: string, cp: string, commune: string) {
  const q = [adresse, cp, commune].filter(Boolean).join(" ");
  if (!q) return null;
  try {
    const res = await fetch("https://api-adresse.data.gouv.fr/search/?limit=1&q=" + encodeURIComponent(q), { signal: AbortSignal.timeout(5000) });
    const texte = await res.text();
    if (!res.ok) {
      console.error("[geocoderAdresse] API Adresse a répondu " + res.status + " pour \"" + q + "\" — corps : " + texte.slice(0, 300));
      return null;
    }
    let data: any;
    try { data = JSON.parse(texte); } catch {
      console.error("[geocoderAdresse] Réponse non-JSON de l'API Adresse pour \"" + q + "\" — corps : " + texte.slice(0, 300));
      return null;
    }
    const feature = data?.features?.[0];
    if (feature?.geometry?.coordinates) {
      const [lon, lat] = feature.geometry.coordinates;
      return { lat, lon };
    }
    console.warn("[geocoderAdresse] Aucun résultat pour \"" + q + "\".");
  } catch (e) { console.error("[geocoderAdresse] Erreur réseau pour \"" + q + "\" :", e); }
  return null;
}

// Calcul de trajet — service de l'IGN (Géoplateforme) en premier ; l'ancien serveur public OSRM
// n'est plus qu'un secours. Réponse IGN vérifiée : `duration` en secondes (timeUnit=second).
// getSteps=false + geometryFormat=polyline = réponse minuscule (on n'a besoin que de la durée).
const TRAJET_CACHE = new Map<string, number>();

async function tempsTrajetIGN(latA: number, lonA: number, latB: number, lonB: number): Promise<number | null> {
  const url = "https://data.geopf.fr/navigation/itineraire?resource=bdtopo-osrm&profile=car&optimization=fastest" +
    "&getSteps=false&geometryFormat=polyline&distanceUnit=meter&timeUnit=second" +
    `&start=${lonA},${latA}&end=${lonB},${latB}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
  if (!res.ok) return null; // ex. 429 : limite de 5 requêtes/seconde dépassée
  const data = await res.json();
  return typeof data.duration === "number" ? Math.ceil(data.duration / 60) : null;
}

async function tempsTrajetOSRM(latA: number, lonA: number, latB: number, lonB: number): Promise<number | null> {
  const url = `https://router.project-osrm.org/route/v1/driving/${lonA},${latA};${lonB},${latB}?overview=false`;
  const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
  const data = await res.json();
  if (data.routes && data.routes[0]) return Math.ceil(data.routes[0].duration / 60);
  return null;
}

async function tempsTrajetMinutes(latA: number, lonA: number, latB: number, lonB: number): Promise<number | null> {
  const cle = [latA, lonA, latB, lonB].map((n) => Number(n).toFixed(5)).join(",");
  const enMemoire = TRAJET_CACHE.get(cle);
  if (enMemoire !== undefined) return enMemoire;

  let minutes: number | null = null;
  try { minutes = await tempsTrajetIGN(latA, lonA, latB, lonB); } catch (e) { console.warn("Trajet IGN échoué :", e); }
  if (minutes === null) {
    try { minutes = await tempsTrajetOSRM(latA, lonA, latB, lonB); } catch (e) { console.warn("Trajet OSRM (secours) échoué :", e); }
  }
  if (minutes !== null) {
    if (TRAJET_CACHE.size > 500) TRAJET_CACHE.clear();
    TRAJET_CACHE.set(cle, minutes);
  }
  return minutes;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);

  const sb = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body) || !body.artisan_id) return json({ error: "artisan_id manquant." }, 400);
    const { mode, artisan_id } = body;
    if (typeof artisan_id !== "string" || !REGEX_UUID.test(artisan_id)) return json({ error: "Artisan introuvable." }, 404);
    if (mode !== "apercu" && mode !== "creneaux") return json({ error: "mode invalide (attendu : apercu | creneaux)." }, 400);

    // Limitation par visiteur : l'aperçu est léger (une vignette par artisan), les créneaux appellent des services extérieurs.
    if (await limiteAtteinte(sb, `dispo-${mode}:` + ipVisiteur(req), mode === "creneaux" ? 30 : 300, 60)) return reponseTropDeRequetes(corsHeaders);

    // L'artisan doit exister ET être actif : jamais les horaires ni le code promo d'un artisan désactivé.
    const { data: artisanPublic, error: errArt } = await sb.from("artisans").select("id, slug_catalogue, code_promo, stripe_connect_statut").eq("id", artisan_id).eq("actif", true).maybeSingle();
    if (errArt) throw errArt;
    if (!artisanPublic) return json({ error: "Artisan introuvable." }, 404);

    // Aperçu de vignette : noms des services (pastilles), même si l'artisan n'a pas encore d'horaires.
    let services: string[] = [];
    let produitsPhares: Array<{ nom: string; url_photo: string | null }> = [];
    let slugCatalogue: string | null = null;
    let codePromo: string | null = null;
    if (mode === "apercu") {
      const { data: svc } = await sb.from("artisans_services")
        .select("nom_service").eq("artisan_id", artisan_id).order("ordre", { ascending: true }).limit(20);
      services = (svc || []).map((s: any) => s.nom_service).filter(Boolean);

      slugCatalogue = artisanPublic.slug_catalogue ?? null;
      codePromo = artisanPublic.code_promo ?? null;

      // Produits phares : choisis à la main par l'artisan, sinon repli sur les 3 meilleures
      // ventes (jamais un compteur stocké — toujours recalculé sur les commandes réglées).
      const { data: produits } = await sb.from("artisans_catalogue")
        .select("id, nom, url_photo, est_phare").eq("artisan_id", artisan_id)
        .or("en_vente.is.null,en_vente.eq.true"); // jamais « Mon stock »
      const listeProduits = produits || [];
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
        produitsPhares = source.slice(0, 3).map((p: any) => ({ nom: p.nom, url_photo: p.url_photo }));
      }
    }

    // Règle du 06/10 : sans paiements en ligne ACTIFS, pas de boutique visible : ni produits phares, ni lien, ni code promo sur les cartes.
    if (artisanPublic.stripe_connect_statut !== "actif") { produitsPhares = []; slugCatalogue = null; codePromo = null; }

    const { data: horaires, error: errH } = await sb.from("artisans_horaires")
      .select("*").eq("artisan_id", artisan_id).order("heure_debut", { ascending: true });
    if (errH) throw errH;
    if (!horaires || !horaires.length) {
      const message = "Cet artisan n'a pas encore renseigné ses horaires habituels.";
      return mode === "apercu"
        ? json({ prochaine_date: null, label: null, semaine: [], services, produits_phares: produitsPhares, slug_catalogue: slugCatalogue, code_promo: codePromo, message })
        : json({ jours: [], message });
    }

    const aujourdhui = baseJour(body.aujourdhui);
    const dateDebut = dateISO(aujourdhui);
    const dateFinHorizon = new Date(aujourdhui);
    dateFinHorizon.setDate(dateFinHorizon.getDate() + HORIZON_PAGINATION_JOURS);

    const { data: interventions, error: errI } = await sb.from("mpa_artisans_interventions")
      .select("date_intervention, heure_debut, heure_fin, latitude, longitude")
      .eq("artisan_id", artisan_id)
      .neq("statut", "annulee")
      .gte("date_intervention", dateDebut)
      .lte("date_intervention", dateISO(dateFinHorizon));
    if (errI) throw errI;

    const { data: indispos } = await sb.from("artisans_indisponibilites")
      .select("date_debut, date_fin")
      .eq("artisan_id", artisan_id)
      .gte("date_fin", dateDebut)
      .lte("date_debut", dateISO(dateFinHorizon));

    function estJourBloque(jourStr: string): boolean {
      return (indispos || []).some((i: any) => jourStr >= i.date_debut && jourStr <= i.date_fin);
    }

    // ═══ MODE APERÇU — pas de trajet, juste "y a-t-il un trou dans le planning" ═══
    if (mode === "apercu") {
      // Un bloc horaire est "libre" s'il reste au moins 30 min disponibles dans ce bloc.
      const blocLibre = (bloc: any, interDuJour: any[]): boolean => {
        const debutBloc = heureVersMin(bloc.heure_debut);
        const finBloc = heureVersMin(bloc.heure_fin);
        const occupePendantBloc = interDuJour
          .filter((x: any) => heureVersMin(x.heure_debut) < finBloc && heureVersMin(x.heure_fin) > debutBloc)
          .reduce((total: number, x: any) => total + (heureVersMin(x.heure_fin) - heureVersMin(x.heure_debut)), 0);
        return (finBloc - debutBloc) - occupePendantBloc >= 30;
      };
      const interduJourStr = (jourStr: string) => (interventions || []).filter((x: any) => x.date_intervention === jourStr);

      // Semaine affichée sur la vignette : horaires + libre/complet. Jamais le détail du planning.
      const semaine: Array<{ date: string; ferme: boolean; plages: Array<{ debut: string; fin: string; libre: boolean }> }> = [];
      for (let i = 0; i < SEMAINE_JOURS; i++) {
        const jour = new Date(aujourdhui);
        jour.setDate(jour.getDate() + i);
        const jourStr = dateISO(jour);
        const blocsJour = horaires.filter((h: any) => h.jour_semaine === jour.getDay());
        if (estJourBloque(jourStr) || !blocsJour.length) { semaine.push({ date: jourStr, ferme: true, plages: [] }); continue; }
        const interDuJour = interduJourStr(jourStr);
        semaine.push({
          date: jourStr,
          ferme: false,
          plages: blocsJour.map((b: any) => ({
            debut: minVersHeure(heureVersMin(b.heure_debut)),
            fin: minVersHeure(heureVersMin(b.heure_fin)),
            libre: blocLibre(b, interDuJour),
          })),
        });
      }

      // Prochaine disponibilité (comportement inchangé)
      for (let i = 0; i < HORIZON_JOURS; i++) {
        const jour = new Date(aujourdhui);
        jour.setDate(jour.getDate() + i);
        const jourStr = dateISO(jour);
        const joursemaine = jour.getDay();
        if (estJourBloque(jourStr)) continue; // journée bloquée par l'artisan (congés, absence...)
        const blocsJour = horaires.filter((h: any) => h.jour_semaine === joursemaine);
        if (!blocsJour.length) continue; // l'artisan ne travaille pas ce jour-là
        const interDuJour = interduJourStr(jourStr);
        if (blocsJour.some((bloc: any) => blocLibre(bloc, interDuJour))) {
          return json({
            prochaine_date: jourStr,
            label: i === 0 ? "aujourd'hui" : i === 1 ? "demain" : JOURS_NOMS[joursemaine] + " " + jour.getDate() + "/" + (jour.getMonth() + 1),
            semaine,
            services,
            produits_phares: produitsPhares,
            slug_catalogue: slugCatalogue,
            code_promo: codePromo,
          });
        }
      }
      return json({ prochaine_date: null, label: null, semaine, services, produits_phares: produitsPhares, slug_catalogue: slugCatalogue, code_promo: codePromo, message: "Aucune disponibilité dans les " + HORIZON_JOURS + " prochains jours." });
    }

    // ═══ MODE CRÉNEAUX — vrai calcul avec trajet, une fois l'adresse connue ═══
    // Retourne toujours FENETRE_JOURS jours consécutifs (même sans créneau, pour un
    // affichage en grille façon Doctolib) — date_debut permet de paginer vers l'avant.
    if (mode === "creneaux") {
      const { adresse, code_postal, commune } = body;
      if (!adresse) return json({ error: "Adresse manquante." }, 400);
      if (typeof adresse !== "string" || adresse.length > ADRESSE_MAX) return json({ error: "Adresse invalide." }, 400);
      if (code_postal != null && (typeof code_postal !== "string" || code_postal.length > CODE_POSTAL_MAX)) return json({ error: "Code postal invalide." }, 400);
      if (commune != null && (typeof commune !== "string" || commune.length > COMMUNE_MAX)) return json({ error: "Commune invalide." }, 400);
      const duree = Math.min(DUREE_MAX, Math.max(DUREE_MIN, parseInt(body.duree_min, 10) || 60));
      if (body.date_debut != null && body.date_debut !== "" && (typeof body.date_debut !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.date_debut) || Number.isNaN(new Date(body.date_debut + "T00:00:00Z").getTime()))) return json({ error: "date_debut invalide (format AAAA-MM-JJ)." }, 400);

      let dateDebutFenetre = body.date_debut ? new Date(body.date_debut + "T00:00:00") : new Date(aujourdhui);
      const dateMaxAutorisee = new Date(aujourdhui);
      dateMaxAutorisee.setDate(dateMaxAutorisee.getDate() + HORIZON_PAGINATION_JOURS - FENETRE_JOURS);
      if (dateDebutFenetre < aujourdhui) dateDebutFenetre = new Date(aujourdhui);
      if (dateDebutFenetre > dateMaxAutorisee) dateDebutFenetre = dateMaxAutorisee;

      const pt = await geocoderAdresse(adresse, code_postal, commune);
      if (!pt) return json({ error: "Adresse introuvable — vérifiez l'orthographe." }, 422);

      const joursDispo: any[] = [];

      for (let i = 0; i < FENETRE_JOURS; i++) {
        const jour = new Date(dateDebutFenetre);
        jour.setDate(jour.getDate() + i);
        const jourStr = dateISO(jour);
        const joursemaine = jour.getDay();
        const blocsJour = estJourBloque(jourStr) ? [] : horaires.filter((h: any) => h.jour_semaine === joursemaine);

        const creneauxJour: string[] = [];

        if (blocsJour.length) {
          const interDuJour = (interventions || [])
            .filter((x: any) => x.date_intervention === jourStr)
            .sort((a: any, b: any) => a.heure_debut.localeCompare(b.heure_debut));

          for (const bloc of blocsJour) {
            const debutBloc = heureVersMin(bloc.heure_debut);
            const finBloc = heureVersMin(bloc.heure_fin);
            const interDansBloc = interDuJour.filter((x: any) =>
              heureVersMin(x.heure_debut) >= debutBloc && heureVersMin(x.heure_fin) <= finBloc);

            const points: any[] = [{ estAncre: true, finMin: debutBloc, lat: null, lon: null }];
            interDansBloc.forEach((x: any) => points.push({
              estAncre: false, debutMin: heureVersMin(x.heure_debut), finMin: heureVersMin(x.heure_fin),
              lat: x.latitude, lon: x.longitude,
            }));

            for (let k = 0; k < points.length; k++) {
              const prev = points[k];
              const next = points[k + 1] || null;

              let travelIn = 0;
              if (!prev.estAncre) {
                if (prev.lat == null) continue;
                const t = await tempsTrajetMinutes(prev.lat, prev.lon, pt.lat, pt.lon);
                if (t == null) continue;
                travelIn = t;
              }

              let debutMin = arrondirQuart(prev.finMin + travelIn + (prev.estAncre ? 0 : MARGE_SECURITE_MIN));
              const finDispoBloc = next ? next.debutMin : finBloc;

              if (next) {
                if (next.lat == null) continue;
                const travelOut = await tempsTrajetMinutes(pt.lat, pt.lon, next.lat, next.lon);
                if (travelOut == null) continue;
                if (debutMin + duree + travelOut + MARGE_SECURITE_MIN > finDispoBloc) continue;
              } else {
                if (debutMin + duree > finDispoBloc) continue;
              }

              if (debutMin < debutBloc) debutMin = debutBloc;
              creneauxJour.push(minVersHeure(debutMin));
            }
          }
        }

        joursDispo.push({
          date: jourStr,
          jour_label: JOURS_NOMS[joursemaine],
          jour_num: jour.getDate(),
          mois_label: MOIS_NOMS[jour.getMonth()],
          creneaux: creneauxJour.slice(0, 4),
        });
      }

      return json({
        adresse_geocodee: true, latitude: pt.lat, longitude: pt.lon,
        date_debut_fenetre: dateISO(dateDebutFenetre),
        peut_reculer: dateISO(dateDebutFenetre) > dateISO(aujourdhui),
        peut_avancer: dateISO(dateDebutFenetre) < dateISO(dateMaxAutorisee),
        jours: joursDispo,
      });
    }

    return json({ error: "mode invalide (attendu : apercu | creneaux)." }, 400);

  } catch (e) {
    console.error("[verifier-disponibilite-artisan]", e);
    return json({ error: MSG_ERREUR_GENERIQUE }, 500); // le détail reste dans les journaux
  }
});
