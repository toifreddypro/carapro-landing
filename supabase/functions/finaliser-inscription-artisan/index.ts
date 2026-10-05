// ═══════════════════════════════════════════════════════════
// CaraLink Artisans — Edge Function : finaliser-inscription-artisan
// Propriété : TOI Freddy
// Appelée juste après la création du compte (email/mdp, via le SDK
// Supabase côté client) — crée le profil artisan, vérifie le SIRET via
// l'API Etalab (gratuite, sans clé), et enregistre la référence du
// document RC Pro/décennale déjà déposé dans le stockage.
//
// Inscription en une seule fois, comme voulu par Freddy — jamais de
// retour obligatoire, la vérification humaine du document se fait
// ensuite en arrière-plan (statut "en_attente"), sans bloquer
// l'apparition dans l'annuaire.
//
// POST { nom_entreprise, secteur, commune, telephone, bio,
//        rayon_intervention_km, siret, document_path }
// Authorization: Bearer <token utilisateur, obtenu après signUp()>
//
// Sécurité :
//  - le plan, la vérification, l'activation et l'abonnement ne viennent JAMAIS de la page : ils sont fixés ici ;
//  - le document déclaré doit se trouver dans le dossier de la personne qui s'inscrit (jamais celui d'un autre) et
//    exister réellement dans le stockage ;
//  - tous les champs sont contrôlés côté serveur (type, taille, format) ; le secteur doit exister ; le SIRET doit avoir
//    14 chiffres avant d'être envoyé à l'API de l'État ;
//  - les champs sont vérifiés AVANT l'anti-robot : une faute de frappe ne consomme pas le jeton ;
//  - un seul profil par compte, même si deux appels se croisent (voir securite-inscription.sql) ;
//  - l'email du profil est celui du COMPTE DE CONNEXION (jamais une valeur envoyée par la page) ;
//  - une erreur interne n'est jamais détaillée.
// ═══════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const NOM_MAX = 120;
const COMMUNE_MAX = 100;
const BIO_MAX = 1000;
const RAYON_MIN = 1;
const RAYON_MAX = 200;
const REGEX_TELEPHONE = /^[0-9+\s.-]{8,20}$/;
const REGEX_SIRET = /^\d{14}$/;
// Chemin d'une pièce justificative : « <identifiant du compte>/<nom de fichier assaini> » (voir inscription.html).
const REGEX_DOCUMENT = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/([A-Za-z0-9._-]{1,255})$/i;
const BUCKET_DOCUMENTS = "artisans-documents";
const MSG_ERREUR_GENERIQUE = "Une erreur est survenue. Réessayez dans un instant.";

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function verifierSiret(siret: string): Promise<{ valide: boolean; nomOfficiel: string | null }> {
  try {
    // Le SIRET a déjà été contrôlé (14 chiffres) : il est de plus encodé, jamais collé tel quel dans l'adresse.
    const res = await fetch(`https://recherche-entreprises.api.gouv.fr/search?q=siret:${encodeURIComponent(siret)}`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return { valide: false, nomOfficiel: null };
    const data = await res.json();
    const resultats = data.results || [];
    if (!resultats.length) return { valide: false, nomOfficiel: null };
    const premier = resultats[0];
    return { valide: true, nomOfficiel: premier.nom_complet || premier.nom_raison_sociale || null };
  } catch (e) {
    console.error("[verifierSiret]", e);
    return { valide: false, nomOfficiel: null };
  }
}

// ⚠️ Ajouté le 14/09, désactivé temporairement le 29/09 (widget cassé côté client, cause
// trouvée le 30/09 : conflit entre les deux widgets Turnstile de la page, jamais le domaine
// ni la clé de site — tous deux vérifiés corrects). Réactivé le 30/09 une fois inscription.html
// corrigée pour donner un identifiant propre à chaque widget.
async function verifierTurnstile(token: string, ip: string | null): Promise<boolean> {
  try {
    const secret = Deno.env.get("TURNSTILE_SECRET_KEY") ?? "";
    if (!secret) { console.error("[verifierTurnstile] TURNSTILE_SECRET_KEY manquante"); return false; }
    const body = new URLSearchParams({ secret, response: token });
    if (ip) body.set("remoteip", ip);
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST", body, signal: AbortSignal.timeout(5000), // Cloudflare ne répond pas : on n'attend pas indéfiniment
    });
    const data = await res.json();
    return data.success === true;
  } catch (e) {
    console.error("[verifierTurnstile]", e);
    return false;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const sbAdmin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
  const sbAnon  = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") ?? "");

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Non authentifié." }, 401);

    const { data: userData, error: userErr } = await sbAnon.auth.getUser(token);
    if (userErr || !userData?.user) return json({ error: "Session invalide." }, 401);
    const userId = userData.user.id;

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Requête invalide." }, 400);

    const { nom_entreprise, secteur, commune, telephone, bio, rayon_intervention_km, siret, document_path, turnstile_token } = body;

    // ── Types : un champ texte doit être du texte, jamais un objet ou une liste (400 propre, jamais une panne) ──
    for (const v of [nom_entreprise, secteur, commune, telephone, bio, siret, document_path, turnstile_token]) {
      if (v != null && typeof v !== "string") return json({ error: "Requête invalide." }, 400);
    }
    if (rayon_intervention_km != null && typeof rayon_intervention_km !== "number" && typeof rayon_intervention_km !== "string") return json({ error: "Requête invalide." }, 400);

    const nom = (nom_entreprise ?? "").trim();
    const secteurCode = (secteur ?? "").trim();
    const communeNom = (commune ?? "").trim();
    const tel = (telephone ?? "").trim();
    if (!nom || !secteurCode || !communeNom || !tel) return json({ error: "Champs obligatoires manquants." }, 400);
    if (nom.length > NOM_MAX) return json({ error: `Nom d'entreprise trop long (${NOM_MAX} caractères maximum).` }, 400);
    if (communeNom.length > COMMUNE_MAX) return json({ error: `Commune trop longue (${COMMUNE_MAX} caractères maximum).` }, 400);
    if (secteurCode.length > 50) return json({ error: "Secteur inconnu." }, 400);
    if (!REGEX_TELEPHONE.test(tel)) return json({ error: "Numéro de téléphone invalide." }, 400);
    const bioTxt = (bio ?? "").trim();
    if (bioTxt.length > BIO_MAX) return json({ error: `Description trop longue (${BIO_MAX} caractères maximum).` }, 400);

    let rayon = 15;
    if (rayon_intervention_km != null && rayon_intervention_km !== "" && rayon_intervention_km !== 0) {
      const n = Number(rayon_intervention_km);
      if (!Number.isInteger(n) || n < RAYON_MIN || n > RAYON_MAX) return json({ error: `Rayon d'intervention invalide (de ${RAYON_MIN} à ${RAYON_MAX} km).` }, 400);
      rayon = n;
    }

    // SIRET : 14 chiffres (les espaces saisis sont tolérés). Sinon, refusé : il ne partira jamais vers l'API de l'État.
    const siretPropre = (siret ?? "").replace(/\s/g, "");
    if (siretPropre && !REGEX_SIRET.test(siretPropre)) return json({ error: "Le SIRET doit comporter 14 chiffres." }, 400);

    // Document : seulement un fichier du dossier de CETTE personne (jamais celui d'un autre compte).
    let cheminDocument: string | null = null;
    if (document_path) {
      const m = REGEX_DOCUMENT.exec(document_path);
      if (!m || m[1].toLowerCase() !== userId.toLowerCase()) return json({ error: "Document invalide." }, 400);
      cheminDocument = document_path;
    }

    // Le secteur doit exister (le secteur "autre" est le repli prévu par les pages).
    if (secteurCode !== "autre") {
      const { data: secteurExiste, error: errSect } = await sbAdmin.from("secteurs").select("code").eq("code", secteurCode).maybeSingle();
      if (errSect) throw errSect;
      if (!secteurExiste) return json({ error: "Secteur inconnu." }, 400);
    }

    // Turnstile : après les contrôles ci-dessus, pour qu'une simple faute de frappe ne consomme pas le jeton à usage unique.
    if (!turnstile_token) return json({ error: "Vérification anti-robot manquante." }, 400);
    const ip = req.headers.get("cf-connecting-ip") || (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null;
    const captchaOk = await verifierTurnstile(turnstile_token, ip);
    if (!captchaOk) return json({ error: "Vérification anti-robot échouée. Réessayez." }, 400);

    // Un seul profil artisan par compte — jamais de doublon si la
    // fonction est rappelée par erreur (double-clic, réseau lent).
    const { data: dejaExistant } = await sbAdmin.from("artisans").select("id").eq("user_id", userId).maybeSingle();
    if (dejaExistant) return json({ error: "Un profil existe déjà pour ce compte." }, 409);

    // Vérification SIRET — jamais bloquante pour l'inscription elle-même,
    // juste consignée pour la modération humaine ensuite.
    let siretValide = false;
    let statutVerif = "non_demande";
    if (siretPropre) {
      const resultat = await verifierSiret(siretPropre);
      siretValide = resultat.valide;
      statutVerif = "en_attente"; // toujours une revue humaine du document avant le vrai badge "vérifié"
    }

    // Le fichier déclaré existe-t-il vraiment ? (sinon : le profil est créé sans pièce, jamais une référence dans le vide)
    if (cheminDocument) {
      const [dossier, fichier] = cheminDocument.split("/");
      const { data: fichiers } = await sbAdmin.storage.from(BUCKET_DOCUMENTS).list(dossier, { search: fichier });
      if (!Array.isArray(fichiers) || !fichiers.some((f: any) => f.name === fichier)) cheminDocument = null;
    }

    const { data: artisan, error } = await sbAdmin.from("artisans").insert({
      user_id: userId, email: userData.user.email ?? null, // l'email du compte de connexion : les notifications (commandes, prélèvement…) partent de là
      nom_entreprise: nom, secteur: secteurCode, commune: communeNom, telephone: tel,
      bio: bioTxt || null, rayon_intervention_km: rayon,
      siret: siretPropre || null, verifie: false, verification_statut: statutVerif,
      actif: true,
    }).select().single();
    if (error) {
      // Deux appels simultanés : l'autre a créé le profil (index d'unicité de securite-inscription.sql).
      if ((error as any).code === "23505") return json({ error: "Un profil existe déjà pour ce compte." }, 409);
      throw error;
    }

    let documentEnregistre = false;
    if (cheminDocument) {
      const { error: errDoc } = await sbAdmin.from("artisans_documents").insert({
        artisan_id: artisan.id, type_document: "rc_pro", url_fichier: cheminDocument,
      });
      if (errDoc) console.error("[finaliser-inscription-artisan] Document non enregistré :", errDoc.message);
      else documentEnregistre = true;
    }

    return json({
      success: true, artisan_id: artisan.id,
      siret_reconnu: siretValide,
      document_enregistre: documentEnregistre,
      message: siretPropre
        ? "Profil créé. Votre document sera vérifié sous 24-48h."
        : "Profil créé. Ajoutez votre SIRET et votre assurance dès que possible pour obtenir le badge vérifié.",
    });

  } catch (e) {
    console.error("[finaliser-inscription-artisan]", e);
    return json({ error: MSG_ERREUR_GENERIQUE }, 500); // le détail reste dans les journaux, jamais chez l'utilisateur
  }
});
