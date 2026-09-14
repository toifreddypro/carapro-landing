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

async function verifierSiret(siret: string): Promise<{ valide: boolean; nomOfficiel: string | null }> {
  try {
    const res = await fetch(`https://recherche-entreprises.api.gouv.fr/search?q=siret:${siret}`);
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

// ⚠️ Ajouté le 14/09 — décidé avec Freddy : le token était collecté côté
// client mais jamais vérifié côté serveur, rendant le captcha purement
// décoratif. La clé secrète ne quitte jamais cette fonction, jamais
// exposée dans le HTML/JS.
async function verifierTurnstile(token: string, ip: string | null): Promise<boolean> {
  try {
    const secret = Deno.env.get("TURNSTILE_SECRET_KEY") ?? "";
    if (!secret) { console.error("[verifierTurnstile] TURNSTILE_SECRET_KEY manquante"); return false; }
    const body = new URLSearchParams({ secret, response: token });
    if (ip) body.set("remoteip", ip);
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST", body,
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
    if (!body) return json({ error: "Requête invalide." }, 400);

    const { nom_entreprise, secteur, commune, telephone, bio, rayon_intervention_km, siret, document_path, turnstile_token } = body;

    if (!turnstile_token) return json({ error: "Vérification anti-robot manquante." }, 400);
    const ip = req.headers.get("x-forwarded-for");
    const captchaOk = await verifierTurnstile(turnstile_token, ip);
    if (!captchaOk) return json({ error: "Vérification anti-robot échouée. Réessayez." }, 400);

    if (!nom_entreprise || !secteur || !commune || !telephone) {
      return json({ error: "Champs obligatoires manquants." }, 400);
    }

    // Un seul profil artisan par compte — jamais de doublon si la
    // fonction est rappelée par erreur (double-clic, réseau lent).
    const { data: dejaExistant } = await sbAdmin.from("artisans").select("id").eq("user_id", userId).maybeSingle();
    if (dejaExistant) return json({ error: "Un profil existe déjà pour ce compte." }, 409);

    // Vérification SIRET — jamais bloquante pour l'inscription elle-même,
    // juste consignée pour la modération humaine ensuite.
    let siretValide = false;
    let statutVerif = "non_demande";
    if (siret) {
      const siretPropre = String(siret).replace(/\s/g, "");
      const resultat = await verifierSiret(siretPropre);
      siretValide = resultat.valide;
      statutVerif = "en_attente"; // toujours une revue humaine du document avant le vrai badge "vérifié"
    }

    const { data: artisan, error } = await sbAdmin.from("artisans").insert({
      user_id: userId, nom_entreprise, secteur, commune, telephone,
      bio: bio || null, rayon_intervention_km: rayon_intervention_km || 15,
      siret: siret || null, verifie: false, verification_statut: statutVerif,
      actif: true,
    }).select().single();
    if (error) throw error;

    if (document_path) {
      await sbAdmin.from("artisans_documents").insert({
        artisan_id: artisan.id, type_document: "rc_pro", url_fichier: document_path,
      });
    }

    return json({
      success: true, artisan_id: artisan.id,
      siret_reconnu: siretValide,
      message: siret
        ? "Profil créé. Votre document sera vérifié sous 24-48h."
        : "Profil créé. Ajoutez votre SIRET et votre assurance dès que possible pour obtenir le badge vérifié.",
    });

  } catch (e) {
    console.error("[finaliser-inscription-artisan]", e);
    const msg = (e instanceof Error) ? e.message : "Erreur serveur.";
    return json({ error: msg }, 500);
  }
});
