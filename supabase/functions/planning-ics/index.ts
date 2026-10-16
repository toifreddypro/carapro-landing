// ═══════════════════════════════════════════════════════════
// CaraLink Artisans — Edge Function : planning-ics
// Propriété : TOI Freddy
//
// Flux d'agenda (abonnement) du planning d'un artisan, au format .ics : l'artisan colle UNE fois le lien dans Google Agenda,
// Apple Calendar ou Outlook, et son agenda se met à jour tout seul. Aucune connexion à Google, donc aucune validation Google.
// Réservé à l'offre Pro (vérifié ICI à chaque lecture : si l'abonnement s'arrête, le flux s'arrête).
//
// GET ?t=<code secret de l'artisan>
// À déployer SANS vérification de jeton (--no-verify-jwt) : ce sont les agendas des artisans qui appellent ce lien, pas un navigateur connecté.
//
// Sécurité : le code secret (≥ 32 caractères, tiré au hasard par MPA) fait office de clé ; l'artisan peut le régénérer à tout moment, ce qui
// coupe l'ancien lien ; limitation par visiteur ; seulement date, heure, service, nom du client, adresse de l'intervention et notes de
// l'artisan : JAMAIS de téléphone ni d'email ; toute erreur est muette côté public.
// Heures : enregistrées en heure de Guadeloupe (UTC-4, sans heure d'été) puis écrites en UTC dans le fichier : aucun décalage possible.
// ═══════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = { "Access-Control-Allow-Origin": "*" };
const DECALAGE_GUADELOUPE_H = 4; // UTC-4 toute l'année
const JOURS_AVANT = 60;
const JOURS_APRES = 365;
const REGEX_CODE = /^[A-Za-z0-9_-]{32,128}$/;

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

// Le message dit seulement POURQUOI le lien ne marche pas (sans rien révéler de privé : il faut déjà posséder le code secret pour en voir un autre que « lien invalide »).
const MOTIFS: Record<number, string> = {
  404: "Calendrier indisponible : lien invalide, incomplet ou remplacé par un nouveau lien.",
  403: "Calendrier indisponible : le planning dans l'agenda fait partie de l'offre Pro.",
  429: "Calendrier indisponible : trop de demandes, réessayez dans quelques minutes.",
  500: "Calendrier indisponible : erreur temporaire, réessayez dans quelques minutes.",
};
function refus(status: number): Response {
  return new Response(MOTIFS[status] || "Calendrier indisponible.", { status, headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" } });
}

// Texte ICS : barre oblique, point-virgule, virgule et retours à la ligne protégés.
function echapper(s: unknown): string {
  return String(s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}
// Lignes de 75 octets maximum, suite introduite par une espace.
function plier(ligne: string): string {
  const enc = new TextEncoder();
  if (enc.encode(ligne).length <= 75) return ligne;
  const parts: string[] = [];
  let cur = "", taille = 0, limite = 75;
  for (const ch of ligne) {
    const t = enc.encode(ch).length;
    if (taille + t > limite) { parts.push(cur); cur = ""; taille = 0; limite = 74; }
    cur += ch; taille += t;
  }
  parts.push(cur);
  return parts.join("\r\n ");
}
const p2 = (n: number) => String(n).padStart(2, "0");
// « 2026-10-16 » + « 14:30 » en heure de Guadeloupe → 20261016T183000Z
function enUTC(date: string, hhmm: string): string {
  const [a, m, j] = date.split("-").map(Number);
  const [h, mi] = hhmm.split(":").map(Number);
  const d = new Date(Date.UTC(a, m - 1, j, h + DECALAGE_GUADELOUPE_H, mi, 0));
  return `${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}T${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}00Z`;
}
function horaires(i: any): { debut: string; fin: string } {
  const hd = i.heure_debut ? String(i.heure_debut).slice(0, 5) : "";
  const hf = i.heure_fin ? String(i.heure_fin).slice(0, 5) : "";
  if (hd && hf) return { debut: hd, fin: hf };
  if (hd) { const [h, m] = hd.split(":").map(Number); return { debut: hd, fin: `${p2(Math.min(h + 1, 23))}:${p2(m)}` }; }
  return i.creneau === "apres_midi" ? { debut: "14:00", fin: "18:00" } : { debut: "07:00", fin: "12:00" };
}
const STATUTS = ["planifiee", "en_cours", "terminee", "payee"];
const LIBELLE_STATUT: Record<string, string> = { planifiee: "Planifiée", en_cours: "En cours", terminee: "Terminée", payee: "Payée" };

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET" && req.method !== "HEAD") return refus(405);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    const code = new URL(req.url).searchParams.get("t") || "";
    if (!REGEX_CODE.test(code)) return refus(404);
    if (await limiteAtteinte(sb, "planning-ics:" + ipVisiteur(req), 60, 60)) return refus(429);

    const { data: artisan, error: errArtisan } = await sb.from("artisans").select("id, nom_entreprise, plan, actif").eq("calendrier_code", code).maybeSingle();
    if (errArtisan) { console.error("[planning-ics] lecture artisan", errArtisan.message); return refus(500); }
    if (!artisan || artisan.actif === false) return refus(404);
    if (artisan.plan !== "pro" && artisan.plan !== "pro_offert") return refus(403);
    if (await limiteAtteinte(sb, "planning-ics:artisan:" + artisan.id, 240, 3600)) return refus(429);

    const auj = new Date(Date.now() - DECALAGE_GUADELOUPE_H * 3600 * 1000);
    const bornes = (decalageJours: number) => new Date(auj.getTime() + decalageJours * 86400000).toISOString().slice(0, 10);
    const { data: interventions, error } = await sb.from("mpa_artisans_interventions")
      .select("*, mpa_artisans_clients(nom), artisans_services(nom_service)") // « * » comme le fait MPA : ne dépend d'aucune colonne particulière
      .eq("artisan_id", artisan.id).in("statut", STATUTS)
      .gte("date_intervention", bornes(-JOURS_AVANT)).lte("date_intervention", bornes(JOURS_APRES))
      .order("date_intervention", { ascending: true });
    if (error) { console.error("[planning-ics] lecture interventions", error.message); return refus(500); }

    const maintenant = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
    const lignes: string[] = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//CaraLink//MPA Artisans//FR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
      "X-WR-CALNAME:" + echapper("MPA Artisans — " + (artisan.nom_entreprise || "Planning")),
      "X-WR-TIMEZONE:America/Guadeloupe", "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H",
    ];
    for (const i of (interventions || []) as any[]) {
      const h = horaires(i);
      const service = i.artisans_services?.nom_service || "Intervention";
      const client = i.mpa_artisans_clients?.nom || "";
      const lieu = [i.adresse, [i.code_postal, i.commune].filter(Boolean).join(" ")].filter(Boolean).join(", ");
      const description = [LIBELLE_STATUT[i.statut] ? "Statut : " + LIBELLE_STATUT[i.statut] : "", i.notes || ""].filter(Boolean).join("\n");
      lignes.push(
        "BEGIN:VEVENT", `UID:${i.id}@caralink.app`, `DTSTAMP:${maintenant}`,
        `DTSTART:${enUTC(i.date_intervention, h.debut)}`, `DTEND:${enUTC(i.date_intervention, h.fin)}`,
        "SUMMARY:" + echapper(client ? `${service} — ${client}` : service),
      );
      if (lieu) lignes.push("LOCATION:" + echapper(lieu));
      if (description) lignes.push("DESCRIPTION:" + echapper(description));
      lignes.push("END:VEVENT");
    }
    lignes.push("END:VCALENDAR");

    return new Response(lignes.map(plier).join("\r\n") + "\r\n", {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "private, max-age=300", "Content-Disposition": 'inline; filename="planning.ics"' },
    });
  } catch (e) {
    console.error("[planning-ics]", e);
    return refus(500);
  }
});
