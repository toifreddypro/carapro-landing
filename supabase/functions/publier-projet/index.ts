// ═════════════════════════════════════════════════
// CaraLink Artisans — Edge Function : publier-projet
// Propriété : TOI Freddy
//
// Un client CONNECTÉ (compte client, email confirmé) publie un projet : un besoin choisi dans la liste, une description,
// une commune, jusqu'à 4 photos. C'est la « demande générale » nouvelle formule (remplace la demande ouverte sans compte).
//
// Phase 3 (30/10/2026) : une fois le projet enregistré, les artisans concernés (bon métier + dans le rayon, ou « à distance » quand le
// besoin le permet) sont prévenus par email : les 15 plus proches au maximum, jamais un envoi en masse. L'email ne contient AUCUNE
// coordonnée du client. Un échec d'envoi ne fait jamais échouer la publication. Les artisans voient aussi le projet dans MPA.
//
// Le téléphone et l'email du client ne sont JAMAIS copiés dans le projet : ils restent dans son compte, cachés des artisans,
// pour limiter les risques de harcèlement. Le client décidera lui-même de les partager, à la fin.
//
// Sécurité (fonction publique : n'importe qui peut l'appeler, avec n'importe quoi) :
//  - l'identité vient du JETON de connexion vérifié par le serveur, jamais d'un champ envoyé par la page ;
//  - l'email du compte doit être confirmé ;
//  - le besoin doit exister et être actif ; la famille est LUE chez le besoin, jamais envoyée par la page ;
//  - toutes les valeurs sont contrôlées côté serveur (type, taille, format) ;
//  - les photos sont reconnues par leur CONTENU (JPEG, PNG, WebP), 3 Mo maximum chacune, 4 au plus ;
//  - 3 projets par jour et par compte, 5 projets ouverts en même temps, 20 appels par heure et par adresse ;
//  - les coordonnées de la commune sont posées par le serveur ;
//  - une panne interne ne révèle jamais son détail au visiteur.
// ═════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MSG_ERREUR_GENERIQUE = "Une erreur est survenue. Réessayez dans un instant.";
const BUCKET_PHOTOS = "projets-photos";
const TAILLE_MAX_PHOTO_OCTETS = 3 * 1024 * 1024;
const TAILLE_MAX_BASE64 = Math.ceil(TAILLE_MAX_PHOTO_OCTETS * 4 / 3) + 4; // refuse AVANT de décoder
const MAX_PHOTOS = 4;
const MAX_PROJETS_PAR_JOUR = 3;
const MAX_PROJETS_OUVERTS = 5;
const REGEX_BESOIN = /^[a-z0-9-]{2,60}$/;
const MAX_ARTISANS_NOTIFIES = 15;
const URL_MPA = "https://caralink.app/mpa/";

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Tout ce qui vient d'un visiteur est échappé avant d'entrer dans un email HTML.
function escHtml(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (m) => (({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }) as Record<string, string>)[m]);
}
function texteHtml(s: unknown): string { return escHtml(s).replace(/\r?\n/g, "<br>"); }

async function envoyerEmail(to: string, subject: string, html: string) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) { console.warn("[publier-projet] RESEND_API_KEY absente — email non envoyé."); return; }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "CaraLink Artisans <notifications@learnlogicstudio.com>", to: [to], subject, html }),
    });
    if (!res.ok) console.error("[publier-projet] Échec envoi Resend :", await res.text());
  } catch (e) { console.error("[publier-projet] Erreur envoi email :", e); }
}

// Prévient les artisans concernés. Jamais bloquant. Aucune coordonnée du client dans l'email : il n'en a pas, la base non plus.
async function notifierArtisans(sb: any, projetId: string, besoinLibelle: string, commune: string, description: string, nbPhotos: number) {
  try {
    const { data: cibles, error } = await sb.rpc("projets_a_notifier", { p_projet: projetId, p_limite: MAX_ARTISANS_NOTIFIES });
    if (error) throw error;
    const extrait = description.length > 300 ? description.slice(0, 300).trim() + "…" : description;
    const photos = nbPhotos > 0 ? `<p>📷 ${nbPhotos} photo${nbPhotos > 1 ? "s" : ""} jointe${nbPhotos > 1 ? "s" : ""} — à voir dans MPA Artisans.</p>` : "";
    const html = `
      <div style="font-family:sans-serif;max-width:480px;">
        <h2 style="color:#B5502F;">📢 Un client cherche un professionnel</h2>
        <p><strong>${escHtml(besoinLibelle)}</strong> à <strong>${escHtml(commune)}</strong></p>
        <p style="background:#f7f9fc;padding:12px 16px;border-radius:8px;">${texteHtml(extrait)}</p>
        ${photos}
        <p>Ce projet accepte <strong>6 réponses au maximum</strong> : les premiers artisans qui répondent sont retenus.</p>
        <p style="margin:22px 0;"><a href="${URL_MPA}" style="display:inline-block;padding:12px 22px;border-radius:8px;background:#B5502F;color:#fff;font-weight:700;text-decoration:none;">Voir le projet dans MPA Artisans</a></p>
        <p style="font-size:12px;color:#6b7c96;">Pour protéger le client contre le harcèlement, ses coordonnées ne sont pas communiquées : vous échangerez avec lui par messagerie, et c'est lui qui décidera de vous les donner à la fin.</p>
      </div>`;
    await Promise.allSettled((cibles ?? []).map(async (c: any) => {
      const { data: u } = await sb.auth.admin.getUserById(c.user_id);
      if (u?.user?.email) await envoyerEmail(u.user.email, `Nouveau projet à ${commune} — ${besoinLibelle}`, html);
    }));
  } catch (e) { console.error("[publier-projet] Notification des artisans échouée (projet créé quand même) :", e); }
}

// Reconnaît le vrai format d'après les premiers octets. Le type annoncé par le visiteur n'est qu'une déclaration.
function formatReel(b: Uint8Array): { mime: string; ext: string } | null {
  if (b.length > 3 && b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return { mime: "image/jpeg", ext: "jpg" };
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47 && b[4] === 0x0D && b[5] === 0x0A && b[6] === 0x1A && b[7] === 0x0A) return { mime: "image/png", ext: "png" };
  if (b.length > 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return { mime: "image/webp", ext: "webp" };
  return null;
}

// Jamais bloquant : une photo refusée ou qui échoue est ignorée, le projet reste valide sans elle.
async function uploaderPhotos(sb: any, projetId: string, photosBase64: unknown): Promise<string[]> {
  if (!Array.isArray(photosBase64)) return [];
  const chemins: string[] = [];
  for (let i = 0; i < Math.min(photosBase64.length, MAX_PHOTOS); i++) {
    try {
      const dataUrl = photosBase64[i];
      if (typeof dataUrl !== "string") continue;
      const match = dataUrl.match(/^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
      if (!match) continue;
      if (match[1].length > TAILLE_MAX_BASE64) continue;
      const bytes = Uint8Array.from(atob(match[1]), (c) => c.charCodeAt(0));
      if (bytes.length > TAILLE_MAX_PHOTO_OCTETS) continue;
      const format = formatReel(bytes);
      if (!format) continue;
      const path = `${projetId}/${i}.${format.ext}`;
      const { error } = await sb.storage.from(BUCKET_PHOTOS).upload(path, bytes, { contentType: format.mime, upsert: true });
      if (error) { console.error("[publier-projet] upload photo échoué:", error); continue; }
      chemins.push(path);
    } catch (e) {
      console.error("[publier-projet] erreur traitement photo:", e);
    }
  }
  return chemins;
}

// Centre de la commune (API officielle des adresses). Jamais bloquant : sans coordonnées, le projet est quand même créé.
async function geocoderCommune(commune: string, cp: string | null) {
  const q = [cp, commune].filter(Boolean).join(" ");
  try {
    const res = await fetch("https://api-adresse.data.gouv.fr/search/?limit=1&type=municipality&q=" + encodeURIComponent(q), { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = await res.json();
    const coords = data?.features?.[0]?.geometry?.coordinates;
    if (Array.isArray(coords) && coords.length === 2) return { lon: Number(coords[0]), lat: Number(coords[1]) };
  } catch (e) { console.warn("[publier-projet] géocodage échoué :", e); }
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
    // ── Qui est-ce ? Le jeton de connexion, vérifié par le serveur. Jamais une identité envoyée par la page. ──
    const jeton = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!jeton) return json({ error: "Connectez-vous à votre compte client pour publier un projet.", code: "connexion_requise" }, 401);
    const { data: auth, error: errAuth } = await sb.auth.getUser(jeton);
    const user = auth?.user;
    if (errAuth || !user) return json({ error: "Connectez-vous à votre compte client pour publier un projet.", code: "connexion_requise" }, 401);
    if (!user.email_confirmed_at) return json({ error: "Confirmez d'abord votre adresse email (le lien vous a été envoyé à l'inscription).", code: "email_non_confirme" }, 403);

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Requête invalide." }, 400);
    const { besoin_code, description, commune, code_postal, photos } = body;

    for (const v of [besoin_code, description, commune]) {
      if (typeof v !== "string") return json({ error: "Requête invalide." }, 400);
    }
    if (code_postal != null && typeof code_postal !== "string" && typeof code_postal !== "number") return json({ error: "Requête invalide." }, 400);

    const codeBesoin = besoin_code.trim();
    const texte = description.trim();
    const communeNom = commune.trim();
    const cp = code_postal == null || code_postal === "" ? null : String(code_postal).trim();

    if (!REGEX_BESOIN.test(codeBesoin)) return json({ error: "Choisissez le type de besoin." }, 400);
    if (texte.length < 10) return json({ error: "Décrivez votre projet en quelques mots (10 caractères au minimum)." }, 400);
    if (texte.length > 2000) return json({ error: "Texte trop long pour « Votre projet » (2000 caractères maximum)." }, 400);
    if (communeNom.length < 2) return json({ error: "Indiquez votre commune." }, 400);
    if (communeNom.length > 100) return json({ error: "Texte trop long pour « La commune » (100 caractères maximum)." }, 400);
    if (cp != null && cp.length > 12) return json({ error: "Code postal invalide." }, 400);

    // ── Le besoin doit exister et être actif ; la famille vient de LUI ──
    const { data: besoin, error: errBesoin } = await sb.from("besoins").select("code, famille, label_fr").eq("code", codeBesoin).eq("actif", true).maybeSingle();
    if (errBesoin) throw errBesoin;
    if (!besoin) return json({ error: "Ce type de besoin n'existe pas." }, 400);

    // ── Limites ──
    // Par adresse du visiteur : 20 appels par heure (si le limiteur est absent ou en panne, on laisse passer).
    try {
      const ip = (req.headers.get("cf-connecting-ip") || (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "inconnue");
      const { data: autorise } = await sb.rpc("limiter_appel", { p_cle: `publier-projet:${ip}`, p_max: 20, p_fenetre_s: 3600 });
      if (autorise === false) return json({ error: "Trop de tentatives. Réessayez dans un moment." }, 429);
    } catch (e) { console.error("[publier-projet] limiter_appel :", e); }

    // Par compte : 3 projets par 24 h, et 5 projets ouverts en même temps.
    const depuis = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { count: nbJour, error: errJour } = await sb.from("projets").select("id", { count: "exact", head: true })
      .eq("client_user_id", user.id).gte("created_at", depuis);
    if (errJour) throw errJour;
    if ((nbJour ?? 0) >= MAX_PROJETS_PAR_JOUR) return json({ error: "Vous avez déjà publié 3 projets aujourd'hui. Réessayez demain, ou clôturez un projet inutile.", code: "limite_jour" }, 429);
    const { count: nbOuverts, error: errOuverts } = await sb.from("projets").select("id", { count: "exact", head: true })
      .eq("client_user_id", user.id).eq("statut", "ouvert").gt("expire_le", new Date().toISOString());
    if (errOuverts) throw errOuverts;
    if ((nbOuverts ?? 0) >= MAX_PROJETS_OUVERTS) return json({ error: "Vous avez déjà 5 projets ouverts. Clôturez-en un avant d'en publier un autre.", code: "limite_ouverts" }, 429);

    // ── Création : coordonnées posées par le serveur, jamais par la page ──
    const pt = await geocoderCommune(communeNom, cp);
    const { data: projet, error: errIns } = await sb.from("projets").insert({
      client_user_id: user.id,
      famille: besoin.famille,
      besoin_code: besoin.code,
      description: texte,
      commune: communeNom,
      code_postal: cp,
      latitude: pt ? pt.lat : null,
      longitude: pt ? pt.lon : null,
    }).select("id").single();
    if (errIns) throw errIns;

    // ── Photos — jamais bloquant pour le projet lui-même ──
    let nbPhotos = 0;
    try {
      const chemins = await uploaderPhotos(sb, projet.id, photos);
      if (chemins.length) {
        await sb.from("projets").update({ photos: chemins }).eq("id", projet.id);
        nbPhotos = chemins.length;
      }
    } catch (e) {
      console.error("[publier-projet] Téléversement des photos échoué (projet créé quand même) :", e);
    }

    // ── Prévenir les artisans concernés (jamais bloquant) ──
    await notifierArtisans(sb, projet.id, besoin.label_fr, communeNom, texte, nbPhotos);

    return json({ success: true, projet_id: projet.id, nb_photos: nbPhotos });

  } catch (e) {
    console.error("[publier-projet]", e);
    return json({ error: MSG_ERREUR_GENERIQUE }, 500); // le détail reste dans les journaux, jamais chez le visiteur
  }
});
