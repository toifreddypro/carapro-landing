// ═══════════════════════════════════════════════════════════
// CaraPro — Edge Function : verifier-disponibilite-artisan
// Propriété : TOI Freddy
//
// Deux modes, selon le corps de la requête :
//
//  1) { mode: "apercu", artisan_id }
//     → Aperçu grossier type Doctolib ("Prochaine disponibilité le...")
//       basé uniquement sur les horaires habituels de l'artisan et son
//       planning déjà rempli. AUCUN calcul de trajet (on ne connaît pas
//       encore l'adresse du client à ce stade).
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

const MARGE_SECURITE_MIN = 10;
const HORIZON_JOURS = 14; // pour le mode aperçu
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

async function geocoderAdresse(adresse: string, cp: string, commune: string) {
  const q = [adresse, cp, commune].filter(Boolean).join(" ");
  if (!q) return null;
  try {
    const res = await fetch("https://api-adresse.data.gouv.fr/search/?limit=1&q=" + encodeURIComponent(q));
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

async function tempsTrajetMinutes(latA: number, lonA: number, latB: number, lonB: number): Promise<number | null> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${lonA},${latA};${lonB},${latB}?overview=false`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.routes && data.routes[0]) return Math.ceil(data.routes[0].duration / 60);
  } catch (e) { console.warn("Calcul de trajet échoué :", e); }
  return null;
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
    if (!body || !body.artisan_id) return json({ error: "artisan_id manquant." }, 400);
    const { mode, artisan_id } = body;

    const { data: horaires, error: errH } = await sb.from("artisans_horaires")
      .select("*").eq("artisan_id", artisan_id).order("heure_debut", { ascending: true });
    if (errH) throw errH;
    if (!horaires || !horaires.length) {
      return json({ jours: [], message: "Cet artisan n'a pas encore renseigné ses horaires habituels." });
    }

    const aujourdhui = new Date();
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
      for (let i = 0; i < HORIZON_JOURS; i++) {
        const jour = new Date(aujourdhui);
        jour.setDate(jour.getDate() + i);
        const jourStr = dateISO(jour);
        const joursemaine = jour.getDay();
        if (estJourBloque(jourStr)) continue; // journée bloquée par l'artisan (congés, absence...)
        const blocsJour = horaires.filter((h: any) => h.jour_semaine === joursemaine);
        if (!blocsJour.length) continue; // l'artisan ne travaille pas ce jour-là

        const interDuJour = (interventions || []).filter((x: any) => x.date_intervention === jourStr);
        // Un jour est "disponible" s'il reste au moins 30 min libres dans un bloc horaire
        for (const bloc of blocsJour) {
          const debutBloc = heureVersMin(bloc.heure_debut);
          const finBloc = heureVersMin(bloc.heure_fin);
          const occupePendantBloc = interDuJour
            .filter((x: any) => heureVersMin(x.heure_debut) < finBloc && heureVersMin(x.heure_fin) > debutBloc)
            .reduce((total: number, x: any) => total + (heureVersMin(x.heure_fin) - heureVersMin(x.heure_debut)), 0);
          const dureeLibre = (finBloc - debutBloc) - occupePendantBloc;
          if (dureeLibre >= 30) {
            return json({
              prochaine_date: jourStr,
              label: i === 0 ? "aujourd'hui" : i === 1 ? "demain" : JOURS_NOMS[joursemaine] + " " + jour.getDate() + "/" + (jour.getMonth() + 1),
            });
          }
        }
      }
      return json({ prochaine_date: null, label: null, message: "Aucune disponibilité dans les " + HORIZON_JOURS + " prochains jours." });
    }

    // ═══ MODE CRÉNEAUX — vrai calcul avec trajet, une fois l'adresse connue ═══
    // Retourne toujours FENETRE_JOURS jours consécutifs (même sans créneau, pour un
    // affichage en grille façon Doctolib) — date_debut permet de paginer vers l'avant.
    if (mode === "creneaux") {
      const { adresse, code_postal, commune } = body;
      const duree = parseInt(body.duree_min, 10) || 60;
      if (!adresse) return json({ error: "Adresse manquante." }, 400);

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
    const msg = (e instanceof Error) ? e.message : (e && typeof e === "object" && "message" in e) ? String((e as any).message) : "Erreur serveur.";
    return json({ error: msg }, 500);
  }
});
