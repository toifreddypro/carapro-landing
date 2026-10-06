// ═════════════════════════════════════════════════
// CaraPro — Edge Function : soumettre-demande-devis
// Propriété : TOI Freddy
// Crée une demande de devis, ouverte aux artisans du secteur/commune
// concernés — zéro friction client (nom + téléphone seulement, comme
// CaraLink). Si lancée depuis la fiche d'un artisan précis, une
// réponse "pré-remplie" est aussi créée pour lui, pour qu'il la voie
// immédiatement dans son espace MPA Artisans (onglet "Demandes").
//
// Envoie aussi un email de notification (Resend) : à l'artisan visé
// si la demande est privée, ou aux artisans du secteur dont le rayon
// couvre la commune si elle est ouverte. Un échec d'envoi d'email ne
// fait jamais échouer la demande elle-même.
//
// Sécurité (cette fonction est publique : n'importe qui peut l'appeler, avec n'importe quoi) :
//  - toutes les valeurs sont contrôlées côté serveur (type, taille, format) — jamais seulement par la page ;
//  - le secteur doit exister (sinon un texte quelconque serait enregistré puis affiché chez les artisans) ;
//  - l'artisan visé et le service doivent exister, et le service appartenir à cet artisan ;
//  - tout ce qui entre dans un email est échappé ;
//  - les photos sont reconnues par leur CONTENU (JPEG, PNG, WebP), pas par ce qu'elles prétendent être ;
//  - un même téléphone ou email ne peut pas envoyer plus de 10 demandes par heure ;
//  - une demande ouverte ne prévient que les 15 artisans les plus proches ;
//  - une panne interne ne révèle jamais son détail au visiteur.
//
// Types de demande (refonte du 05/10) :
//  - « renseignement » : simple échange de messages, aucun créneau, aucun déplacement ;
//  - « visite » : rendez-vous sur place pour estimer le chantier. Adressée à un artisan précis, elle EXIGE un créneau.
//    Les frais de déplacement sont lus chez l'artisan au moment de la demande puis FIGÉS sur la demande : jamais une
//    valeur envoyée par la page ;
//  - « reservation » : réservation directe d'un créneau (client qui connaît déjà l'artisan) — exige un créneau ;
//  - un artisan qui a indiqué ne PAS proposer de visite (proposer_visite = false) refuse les demandes de visite ; sans réponse
//    de sa part (vide), la visite reste proposée comme avant ;
//  - les anciens types (urgence, installation, devis, entretien) restent acceptés : pages déjà ouvertes, anciennes demandes.
// ═════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MSG_ERREUR_GENERIQUE = "Une erreur est survenue. Réessayez dans un instant.";
// Supabase n'affiche pas les pages HTML sur son domaine par défaut : les boutons des emails mènent à une page de ton site.
const PAGE_REPONSE = "https://caralink.app/artisans/repondre.html";
const TYPES_INTERVENTION_VALIDES = ["renseignement", "visite", "reservation", "urgence", "installation", "devis", "entretien"];
const FRAIS_DEPLACEMENT_MAX = 500; // plafond de sécurité (la base impose aussi 0 à 500)
const LIMITE_DEMANDES_PAR_HEURE = 10;
const MAX_ARTISANS_NOTIFIES = 15;
const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REGEX_EMAIL = /^[^\s@<>"'()\[\]\\,;:]+@[^\s@<>"'()\[\]\\,;:]+\.[^\s@<>"'()\[\]\\,;:]+$/;
const REGEX_DATE = /^\d{4}-\d{2}-\d{2}$/;
const REGEX_HEURE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Tout ce qui vient d'un visiteur est échappé avant d'entrer dans un email HTML : sinon un nom ou un message
// contenant du HTML (faux lien, faux bouton) serait envoyé tel quel aux artisans, depuis l'adresse de la plateforme.
function escHtml(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (m) => (({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }) as Record<string, string>)[m]);
}
function texteHtml(s: unknown): string { return escHtml(s).replace(/\r?\n/g, "<br>"); } // conserve les retours à la ligne du message
function telHref(tel: string): string { return tel.replace(/[^0-9+]/g, ""); }

function dateValide(s: string): boolean {
  if (!REGEX_DATE.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s; // refuse aussi le 31 février
}

async function envoyerEmail(to: string, subject: string, html: string) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) { console.warn("[soumettre-demande-devis] RESEND_API_KEY absente — email non envoyé."); return; }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "CaraLink Artisans <notifications@learnlogicstudio.com>",
        to: [to],
        subject,
        html,
      }),
    });
    if (!res.ok) console.error("[soumettre-demande-devis] Échec envoi Resend :", await res.text());
  } catch (e) {
    console.error("[soumettre-demande-devis] Erreur envoi email :", e);
  }
}

const LABELS_TYPE_INTERVENTION: Record<string, string> = {
  renseignement: "💬 Devis / Renseignement simple",
  visite: "🚗 Devis / Rendez-vous sur place",
  reservation: "📅 Réservation directe",
  urgence: "🔥 Urgent",
  installation: "📅 Rendez-vous classique",
  devis: "💬 Devis / Renseignement",
  entretien: "🔁 Suivi / Habitué·e",
};
function badgeTypeIntervention(type: string | null | undefined): string {
  if (!type || !LABELS_TYPE_INTERVENTION[type]) return "";
  return `<p style="display:inline-block;background:#eef2ff;color:#4338ca;padding:4px 10px;border-radius:20px;font-weight:700;font-size:13px;">${LABELS_TYPE_INTERVENTION[type]}</p>`;
}

function emailHtmlDemande(clientNom: string, clientTel: string, clientEmail: string | null, contactPrefere: string, commune: string, description: string, secteur: string, nbPhotos: number, typeIntervention: string | null): string {
  const contactHtml = contactPrefere === "email"
    ? `<p>📧 Préfère être recontacté(e) par email : <a href="mailto:${escHtml(clientEmail)}">${escHtml(clientEmail)}</a></p>`
    : `<p>📞 Préfère être recontacté(e) par téléphone : <a href="tel:${escHtml(telHref(clientTel))}">${escHtml(clientTel)}</a></p>`;
  const photosHtml = nbPhotos > 0
    ? `<p>📷 ${nbPhotos} photo${nbPhotos > 1 ? "s" : ""} jointe${nbPhotos > 1 ? "s" : ""} — à consulter dans votre espace MPA Artisans.</p>`
    : "";
  return `
    <div style="font-family:sans-serif;max-width:480px;">
      <h2 style="color:#B5502F;">📢 Nouvelle demande de devis</h2>
      ${badgeTypeIntervention(typeIntervention)}
      <p><strong>${escHtml(clientNom)}</strong> (${escHtml(commune)}) recherche un artisan en <strong>${escHtml(secteur)}</strong>.</p>
      <p style="background:#f7f9fc;padding:12px 16px;border-radius:8px;">${texteHtml(description)}</p>
      ${contactHtml}
      ${photosHtml}
      <p style="font-size:12px;color:#6b7c96;margin-top:20px;">Répondez directement depuis votre espace MPA Artisans, onglet « Demandes ».</p>
    </div>
  `;
}

async function geocoderAdresse(adresse: string, cp: string | null, commune: string) {
  const q = [adresse, cp, commune].filter(Boolean).join(" ");
  if (!q) return null;
  try {
    const res = await fetch("https://api-adresse.data.gouv.fr/search/?limit=1&q=" + encodeURIComponent(q));
    if (!res.ok) { console.error("[soumettre-demande-devis] API Adresse a répondu " + res.status + "."); return null; }
    const data = await res.json();
    const feature = data?.features?.[0];
    if (feature?.geometry?.coordinates) {
      const [lon, lat] = feature.geometry.coordinates;
      return { lat, lon };
    }
  } catch (e) { console.warn("[soumettre-demande-devis] Géocodage échoué :", e); }
  return null;
}

const euros = (n: number) => n.toFixed(2).replace(".", ",") + " €";
function blocVisiteArtisan(typeIntervention: string | null, fraisDeplacement: number | null): string {
  if (typeIntervention !== "visite") return "";
  const frais = fraisDeplacement && fraisDeplacement > 0
    ? `Frais de déplacement annoncés au client : <strong>${escHtml(euros(fraisDeplacement))}</strong>, à lui facturer lors de votre visite.`
    : "Visite sans frais de déplacement.";
  return `<p style="background:#eff6ff;border:1px solid #bfdbfe;color:#1e40af;padding:10px 14px;border-radius:8px;">🚗 ${frais} Le devis définitif des travaux sera à remettre au client après la visite.</p>`;
}

function emailHtmlCreneau(clientNom: string, clientTel: string, clientEmail: string | null, contactPrefere: string, commune: string, adresse: string, description: string, dateAff: string, heureDebut: string, heureFin: string, nbPhotos: number, token: string, horsHoraires: boolean, typeIntervention: string | null, fraisDeplacement: number | null = null): string {
  const lienConfirmer = `${PAGE_REPONSE}?token=${encodeURIComponent(token)}&action=confirmer`;
  const lienRefuser = `${PAGE_REPONSE}?token=${encodeURIComponent(token)}&action=refuser`;
  const contactHtml = contactPrefere === "email"
    ? `📧 <a href="mailto:${escHtml(clientEmail)}">${escHtml(clientEmail)}</a>`
    : `📞 <a href="tel:${escHtml(telHref(clientTel))}">${escHtml(clientTel)}</a>`;
  const photosHtml = nbPhotos > 0 ? `<p>📷 ${nbPhotos} photo${nbPhotos > 1 ? "s" : ""} jointe${nbPhotos > 1 ? "s" : ""} — à consulter dans votre espace MPA Artisans.</p>` : "";
  const alerteHorsHoraires = horsHoraires
    ? `<p style="background:#fff7ed;border:1px solid #fdba74;color:#9a3412;padding:10px 14px;border-radius:8px;font-weight:700;">⚠️ Demande hors de vos horaires habituels — vérifiez que ça vous convient avant de confirmer.</p>`
    : "";
  return `
    <div style="font-family:sans-serif;max-width:480px;">
      <h2 style="color:#B5502F;">📅 Proposition de créneau</h2>
      ${alerteHorsHoraires}
      ${badgeTypeIntervention(typeIntervention)}
      ${blocVisiteArtisan(typeIntervention, fraisDeplacement)}
      <p><strong>${escHtml(clientNom)}</strong> (${escHtml(commune)}) souhaite une intervention le <strong>${escHtml(dateAff)} entre ${escHtml(heureDebut)} et ${escHtml(heureFin)}</strong>, à cette adresse : ${escHtml(adresse)}.</p>
      <p style="background:#f7f9fc;padding:12px 16px;border-radius:8px;">${texteHtml(description)}</p>
      <p>Contact : ${contactHtml}</p>
      ${photosHtml}
      <div style="margin:24px 0;">
        <a href="${escHtml(lienConfirmer)}" style="display:inline-block;padding:12px 22px;border-radius:8px;background:#16a34a;color:#fff;font-weight:700;text-decoration:none;margin-right:10px;">✅ Confirmer ce créneau</a>
        <a href="${escHtml(lienRefuser)}" style="display:inline-block;padding:12px 22px;border-radius:8px;background:#f1f5f9;color:#475569;font-weight:700;text-decoration:none;">❌ Refuser</a>
      </div>
      <p style="font-size:12px;color:#6b7c96;">En confirmant, ce rendez-vous sera automatiquement ajouté à votre planning MPA Artisans, sans avoir à vous connecter.</p>
    </div>
  `;
}

const BUCKET_PHOTOS = "devis-photos";
const TAILLE_MAX_PHOTO_OCTETS = 3 * 1024 * 1024;
const TAILLE_MAX_BASE64 = Math.ceil(TAILLE_MAX_PHOTO_OCTETS * 4 / 3) + 4; // refuse AVANT de décoder : pas de décodage d'un fichier géant

// Reconnaît le vrai format d'après les premiers octets. Le type annoncé par le visiteur n'est qu'une déclaration.
function formatReel(b: Uint8Array): { mime: string; ext: string } | null {
  if (b.length > 3 && b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return { mime: "image/jpeg", ext: "jpg" };
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47 && b[4] === 0x0D && b[5] === 0x0A && b[6] === 0x1A && b[7] === 0x0A) return { mime: "image/png", ext: "png" };
  if (b.length > 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return { mime: "image/webp", ext: "webp" };
  return null;
}

// Décode et téléverse jusqu'à 4 photos (data URLs base64) envoyées par le client, retourne leurs URLs publiques.
// Jamais bloquant : une photo refusée ou qui échoue est simplement ignorée, la demande reste valide sans elle.
async function uploaderPhotos(sb: any, demandeId: string, photosBase64: unknown): Promise<string[]> {
  if (!Array.isArray(photosBase64)) return [];
  const urls: string[] = [];
  for (let i = 0; i < Math.min(photosBase64.length, 4); i++) {
    try {
      const dataUrl = photosBase64[i];
      if (typeof dataUrl !== "string") continue;
      const match = dataUrl.match(/^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
      if (!match) continue;
      if (match[1].length > TAILLE_MAX_BASE64) continue;
      const bytes = Uint8Array.from(atob(match[1]), (c) => c.charCodeAt(0));
      if (bytes.length > TAILLE_MAX_PHOTO_OCTETS) continue;
      const format = formatReel(bytes);
      if (!format) continue; // pas une vraie image JPEG/PNG/WebP : refusée, quoi qu'elle prétende
      const path = `${demandeId}/${i}.${format.ext}`;
      const { error } = await sb.storage.from(BUCKET_PHOTOS).upload(path, bytes, { contentType: format.mime, upsert: true });
      if (error) { console.error("[soumettre-demande-devis] upload photo échoué:", error); continue; }
      const { data: pub } = sb.storage.from(BUCKET_PHOTOS).getPublicUrl(path);
      if (pub?.publicUrl) urls.push(pub.publicUrl);
    } catch (e) {
      console.error("[soumettre-demande-devis] erreur traitement photo:", e);
    }
  }
  return urls;
}

// Distance à vol d'oiseau (km) — suffisant pour filtrer des notifications par rayon,
// pas besoin d'un vrai calcul de trajet ici (contrairement au Smart Dispatch).
function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function emailHtmlDemandeOuverte(commune: string, description: string, secteur: string, nbPhotos: number, typeIntervention: string | null): string {
  const photosHtml = nbPhotos > 0 ? `<p>📷 ${nbPhotos} photo${nbPhotos > 1 ? "s" : ""} jointe${nbPhotos > 1 ? "s" : ""} — à consulter dans votre espace MPA Artisans.</p>` : "";
  return `
    <div style="font-family:sans-serif;max-width:480px;">
      <h2 style="color:#B5502F;">📢 Un client vous cherche</h2>
      ${badgeTypeIntervention(typeIntervention)}
      <p>Un client recherche un professionnel en <strong>${escHtml(secteur)}</strong>, disponible rapidement, à <strong>${escHtml(commune)}</strong>.</p>
      <p style="background:#f7f9fc;padding:12px 16px;border-radius:8px;">${texteHtml(description)}</p>
      ${photosHtml}
      <p style="font-size:13px;">Soyez le premier à lui proposer un créneau — ses coordonnées apparaissent dès que vous prenez la demande en charge, depuis votre espace MPA Artisans, onglet « Demandes ».</p>
    </div>
  `;
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
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Requête invalide." }, 400);

    const { client_nom, client_telephone, client_email, contact_prefere, secteur, description_besoin, commune, artisan_id, photos,
            date_intervention, heure_debut, heure_fin, adresse, code_postal, latitude, longitude, service_id, hors_horaires, type_intervention } = body;

    // ── Types : un champ texte doit être du texte (sinon : 400 propre, jamais une panne 500) ──
    for (const v of [client_nom, client_telephone, client_email, contact_prefere, secteur, description_besoin, commune, adresse, type_intervention, date_intervention, heure_debut, heure_fin, artisan_id, service_id]) {
      if (v != null && typeof v !== "string") return json({ error: "Requête invalide." }, 400);
    }
    if (code_postal != null && typeof code_postal !== "string" && typeof code_postal !== "number") return json({ error: "Requête invalide." }, 400);

    const nom = (client_nom ?? "").trim();
    const tel = (client_telephone ?? "").trim();
    const email = (client_email ?? "").trim();
    const secteurCode = (secteur ?? "").trim();
    const description = (description_besoin ?? "").trim();
    const communeNom = (commune ?? "").trim();
    const adresseTxt = (adresse ?? "").trim();
    const cp = code_postal == null || code_postal === "" ? null : String(code_postal).trim();

    if (!nom || !tel || !secteurCode || !description || !communeNom) {
      return json({ error: "Champs obligatoires manquants." }, 400);
    }
    if (nom.length > 100) return json({ error: "Texte trop long pour « Votre nom » (100 caractères maximum)." }, 400);
    if (communeNom.length > 100) return json({ error: "Texte trop long pour « La commune » (100 caractères maximum)." }, 400);
    if (description.length > 2000) return json({ error: "Texte trop long pour « Votre demande » (2000 caractères maximum)." }, 400);
    if (adresseTxt.length > 250) return json({ error: "Texte trop long pour « L'adresse » (250 caractères maximum)." }, 400);
    if (cp != null && cp.length > 12) return json({ error: "Code postal invalide." }, 400);
    if (secteurCode.length > 50) return json({ error: "Secteur inconnu." }, 400);
    if (!/^[0-9+\s.-]{8,20}$/.test(tel)) {
      return json({ error: "Numéro de téléphone invalide." }, 400);
    }
    const contactChoisi = (contact_prefere === "email") ? "email" : "telephone";
    if ((contactChoisi === "email" && !email) || (email && (email.length > 200 || !REGEX_EMAIL.test(email)))) {
      return json({ error: "Adresse email invalide." }, 400);
    }
    const typeIntervention = (type_intervention ?? "").trim() || null;
    if (typeIntervention && !TYPES_INTERVENTION_VALIDES.includes(typeIntervention)) return json({ error: "Type de demande invalide." }, 400);
    const artisanId = (artisan_id ?? "").trim() || null;
    if (artisanId && !REGEX_UUID.test(artisanId)) return json({ error: "Artisan introuvable." }, 404);
    const serviceId = (service_id ?? "").trim() || null;
    if (serviceId && !REGEX_UUID.test(serviceId)) return json({ error: "Service invalide." }, 400);
    const dateIntervention = (date_intervention ?? "").trim() || null;
    if (dateIntervention && !dateValide(dateIntervention)) return json({ error: "Date invalide." }, 400);
    const heureDebut = (heure_debut ?? "").trim() || null;
    const heureFin = (heure_fin ?? "").trim() || null;
    if ((heureDebut && !REGEX_HEURE.test(heureDebut)) || (heureFin && !REGEX_HEURE.test(heureFin))) return json({ error: "Heure invalide." }, 400);
    const nombreOuNull = (v: unknown, min: number, max: number): number | null | "invalide" => {
      if (v == null || v === "") return null;
      const n = Number(v);
      return Number.isFinite(n) && n >= min && n <= max ? n : "invalide";
    };
    const latClient = nombreOuNull(latitude, -90, 90);
    const lonClient = nombreOuNull(longitude, -180, 180);
    if (latClient === "invalide" || lonClient === "invalide") return json({ error: "Coordonnées invalides." }, 400);

    // ── L'artisan visé et le service doivent exister (et le service lui appartenir) ──
    let artisanVise: any = null;
    if (artisanId) {
      // Tolérance : si une colonne facultative n'existe pas encore (devis-visite.sql, devis-visite-reglage.sql pas lancés), on
      // réessaie avec moins de colonnes : jamais une panne, seulement les réglages absents ignorés.
      let a: any = null, errArt: any = null;
      for (const colonnes of ["id, user_id, nom_entreprise, secteur, frais_deplacement, proposer_visite", "id, user_id, nom_entreprise, secteur, frais_deplacement", "id, user_id, nom_entreprise, secteur"]) {
        ({ data: a, error: errArt } = await sb.from("artisans").select(colonnes).eq("id", artisanId).maybeSingle());
        if (!(errArt && (errArt as any).code === "42703")) break;
      }
      if (errArt) throw errArt;
      if (!a) return json({ error: "Artisan introuvable." }, 404);
      artisanVise = a;
      if (serviceId) {
        const { data: svc, error: errSvc } = await sb.from("artisans_services").select("id").eq("id", serviceId).eq("artisan_id", artisanId).maybeSingle();
        if (errSvc) throw errSvc;
        if (!svc) return json({ error: "Service invalide." }, 400);
      }
    }

    // ── Le secteur doit exister (le secteur "autre" est le repli prévu par la page). Pour une demande adressée à un
    //    artisan précis, son propre secteur est aussi accepté : un secteur supprimé de la liste depuis l'inscription
    //    ne doit pas empêcher de lui écrire. ──
    if (secteurCode !== "autre" && secteurCode !== artisanVise?.secteur) {
      const { data: secteurExiste, error: errSect } = await sb.from("secteurs").select("code").eq("code", secteurCode).maybeSingle();
      if (errSect) throw errSect;
      if (!secteurExiste) return json({ error: "Secteur inconnu." }, 400);
    }

    // ── Limite d'envois : un même téléphone ou email ne peut pas inonder les artisans ──
    // (freine les boucles de script basiques ; la vraie protection contre un robot est un contrôle anti-robot de type Turnstile)
    const depuis = new Date(Date.now() - 3600 * 1000).toISOString();
    const compter = async (colonne: string, valeur: string) => {
      const { count, error } = await sb.from("demandes_devis").select("id", { count: "exact", head: true }).eq(colonne, valeur).gte("created_at", depuis);
      if (error) throw error;
      return count ?? 0;
    };
    if ((await compter("client_telephone", tel)) >= LIMITE_DEMANDES_PAR_HEURE || (email && (await compter("client_email", email)) >= LIMITE_DEMANDES_PAR_HEURE)) {
      return json({ error: "Trop de demandes envoyées. Réessayez dans un moment." }, 429);
    }

    const estUneProposionDeCreneau = !!(dateIntervention && heureDebut && artisanId);
    // Cohérence du type et du créneau : un rendez-vous (visite ou réservation) sans créneau n'a pas de sens, et un simple
    // renseignement n'en a pas besoin. (Une demande OUVERTE de visite, sans artisan précis, reste possible sans créneau.)
    if (typeIntervention === "visite" && artisanId && !estUneProposionDeCreneau) return json({ error: "Choisissez un créneau pour le rendez-vous sur place." }, 400);
    if (typeIntervention === "reservation" && !estUneProposionDeCreneau) return json({ error: "Choisissez un créneau pour cette réservation." }, 400);
    if (typeIntervention === "renseignement" && (dateIntervention || heureDebut)) return json({ error: "Une demande de renseignement n'a pas de créneau." }, 400);

    // Un artisan qui a indiqué ne pas proposer de visite d'estimation (réglage de son profil) la refuse aussi côté serveur :
    // le réglage n'est pas qu'un cache-misère de l'écran. Sans réponse de sa part (vide), la visite reste proposée.
    if (typeIntervention === "visite" && artisanVise && artisanVise.proposer_visite === false) {
      return json({ error: "Cet artisan ne propose pas de rendez-vous sur place. Envoyez-lui un renseignement simple, ou réservez directement un créneau." }, 400);
    }

    // Frais de déplacement d'une visite : lus chez l'artisan MAINTENANT, puis figés sur la demande. La page n'en envoie jamais.
    let fraisVisite: number | null = null;
    if (typeIntervention === "visite" && artisanVise) {
      const f = Number(artisanVise.frais_deplacement);
      fraisVisite = Number.isFinite(f) && f > 0 ? Math.min(f, FRAIS_DEPLACEMENT_MAX) : 0;
    }
    if (estUneProposionDeCreneau && !adresseTxt) {
      return json({ error: "Adresse d'intervention manquante." }, 400);
    }

    // Coordonnées : reçues du client (vérification préalable), sinon géocodées ici
    // (cas de la demande sur-mesure, qui ne passe pas par la vérification de dispo)
    let lat = latClient;
    let lon = lonClient;
    if (estUneProposionDeCreneau && (lat == null || lon == null)) {
      const pt = await geocoderAdresse(adresseTxt, cp, communeNom);
      if (pt) { lat = pt.lat; lon = pt.lon; }
    }

    const token = estUneProposionDeCreneau ? crypto.randomUUID() : null;

    const lignesDemande: Record<string, unknown> = {
      client_nom: nom, client_telephone: tel, client_email: email || null, contact_prefere: contactChoisi,
      secteur: secteurCode, description_besoin: description, commune: communeNom, type_intervention: typeIntervention,
      ...(fraisVisite !== null ? { frais_deplacement: fraisVisite } : {}),
      statut: estUneProposionDeCreneau ? "creneau_propose" : (artisanId ? "directe" : "ouverte"),
      ...(estUneProposionDeCreneau ? {
        token, date_intervention: dateIntervention, heure_debut: heureDebut, heure_fin: heureFin,
        adresse: adresseTxt, code_postal: cp, latitude: lat, longitude: lon,
        service_id: serviceId, hors_horaires: !!hors_horaires,
      } : {}),
    };
    let { data: demande, error } = await sb.from("demandes_devis").insert(lignesDemande).select().single();
    // Tolérance : colonne des frais absente de la table (SQL pas lancé) → on enregistre la demande sans, jamais une panne.
    if (error && (error as any).code === "42703" && "frais_deplacement" in lignesDemande) {
      delete lignesDemande.frais_deplacement;
      ({ data: demande, error } = await sb.from("demandes_devis").insert(lignesDemande).select().single());
    }
    if (error) throw error;

    if (artisanId) {
      const { error: errRep } = await sb.from("devis_reponses").insert({
        demande_id: demande.id,
        artisan_id: artisanId,
        message: "",
        statut: "envoyee",
      });
      if (errRep) throw errRep; // sans cette ligne, l'artisan ne verrait jamais la demande : on ne répond pas "succès" dans le vide
    }

    // ── Photos jointes — jamais bloquant pour la demande elle-même ──
    let nbPhotos = 0;
    try {
      const urls = await uploaderPhotos(sb, demande.id, photos);
      if (urls.length) {
        await sb.from("demandes_devis").update({ photos: urls }).eq("id", demande.id);
        nbPhotos = urls.length;
      }
    } catch (photoErr) {
      console.error("[soumettre-demande-devis] Téléversement des photos échoué (demande créée quand même) :", photoErr);
    }

    // ── Notification email — jamais bloquante pour la demande elle-même ──
    try {
      if (estUneProposionDeCreneau) {
        if (artisanVise?.user_id) {
          const { data: userData } = await sb.auth.admin.getUserById(artisanVise.user_id);
          if (userData?.user?.email) {
            const dateAff = new Date(dateIntervention!).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
            const emailHtml = emailHtmlCreneau(nom, tel, email || null, contactChoisi, communeNom, adresseTxt, description, dateAff, heureDebut!, heureFin || "?", nbPhotos, token as string, !!hors_horaires, typeIntervention, fraisVisite);
            await envoyerEmail(userData.user.email, `${hors_horaires ? "⚠️ Demande hors horaires — " : ""}Proposition de créneau — ${nom} le ${dateAff}`, emailHtml);
          }
        }
      } else {
        if (artisanId) {
          // Demande privée : uniquement l'artisan visé
          if (artisanVise?.user_id) {
            const { data: userData } = await sb.auth.admin.getUserById(artisanVise.user_id);
            if (userData?.user?.email) {
              const emailHtml = emailHtmlDemande(nom, tel, email || null, contactChoisi, communeNom, description, secteurCode, nbPhotos, typeIntervention);
              await envoyerEmail(userData.user.email, `Nouvelle demande de devis — ${nom}`, emailHtml);
            }
          }
        } else {
          // Demande ouverte : uniquement les artisans du secteur dont le rayon d'intervention déclaré couvre la
          // commune du client — et au plus les MAX_ARTISANS_NOTIFIES plus proches, jamais un envoi en masse.
          const ptClient = await geocoderAdresse("", null, communeNom);
          const { data: artisans } = await sb.from("artisans")
            .select("user_id, latitude, longitude, rayon_intervention_km").eq("secteur", secteurCode);
          const emailOuverte = emailHtmlDemandeOuverte(communeNom, description, secteurCode, nbPhotos, typeIntervention);
          const candidats: Array<{ user_id: string; km: number }> = [];
          for (const a of artisans ?? []) {
            if (!ptClient || a.latitude == null || a.longitude == null) continue; // impossible de vérifier la distance : on ne notifie pas par prudence
            const rayon = a.rayon_intervention_km || 15;
            const km = distanceKm(ptClient.lat, ptClient.lon, a.latitude, a.longitude);
            if (km > rayon) continue;
            candidats.push({ user_id: a.user_id, km });
          }
          candidats.sort((x, y) => x.km - y.km);
          await Promise.allSettled(candidats.slice(0, MAX_ARTISANS_NOTIFIES).map(async (a) => {
            const { data: userData } = await sb.auth.admin.getUserById(a.user_id);
            if (userData?.user?.email) await envoyerEmail(userData.user.email, `Un client vous cherche à ${communeNom}`, emailOuverte);
          }));
        }
      }
    } catch (emailErr) {
      console.error("[soumettre-demande-devis] Notification email échouée (demande créée quand même) :", emailErr);
    }

    return json({ success: true, demande_id: demande.id });

  } catch (e) {
    console.error("[soumettre-demande-devis]", e);
    return json({ error: MSG_ERREUR_GENERIQUE }, 500); // le détail reste dans les journaux, jamais chez le visiteur
  }
});
