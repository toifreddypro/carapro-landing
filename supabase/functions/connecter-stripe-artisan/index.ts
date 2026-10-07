// ═══════════════════════════════════════════════════════════
// CaraLink Artisans — Edge Function : connecter-stripe-artisan
// Propriété : TOI Freddy
//
// Crée (ou réutilise) un compte Stripe Express pour l'artisan connecté,
// et renvoie un lien d'onboarding Stripe (Stripe gère l'identité, les
// coordonnées bancaires, la vérification — rien à reconstruire ici).
//
// Sécurité :
//  - chaque appel agit sur le profil de la personne CONNECTÉE ;
//  - la création du compte Stripe est idempotente : deux appels simultanés (double-clic) ne créent jamais deux
//    comptes (le second écraserait le premier en base et le compte bancaire de l'artisan serait sur un compte orphelin) ;
//  - les adresses de retour sont FIXES : la page ne peut plus envoyer « origin » pour rediriger l'artisan ailleurs ;
//  - l'adresse email du compte Stripe est celle du compte de connexion si le profil n'en a pas ;
//  - le détail d'une erreur Stripe n'est jamais renvoyé à l'artisan ;
//  - (07/10) en cas d'échec, l'ADMINISTRATEUR reçoit un email avec l'étape qui a échoué, le message exact de Stripe et un conseil —
//    il n'a plus besoin d'aller chercher dans les journaux. La réponse renvoyée à la page ne contient que le nom de l'étape.
// ═══════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;
const BASE_URL_RETOUR = "https://caralink.app/mpa"; // fixe : jamais une adresse envoyée par la page
const ADMIN_EMAIL = "toifreddypro@gmail.com";
const MSG_ERREUR_GENERIQUE = "Une erreur est survenue. Réessayez dans un instant.";

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// Stripe répond 409 quand une requête portant la MÊME clé d'idempotence est encore en cours (double-clic, deux lancements qui
// se croisent) : on attend un instant puis on renvoie la même requête, qui rejoue alors le résultat du premier appel.
async function fetchAvecReprise(url: string, init: RequestInit): Promise<Response> {
  let res = await fetch(url, init);
  for (let i = 1; i <= 4 && res.status === 409; i++) {
    await new Promise((r) => setTimeout(r, 300 * i));
    res = await fetch(url, init);
  }
  return res;
}

class ErreurStripe extends Error {
  constructor(message: string, public status: number, public code?: string, public type?: string, public param?: string) { super(message); }
}

async function stripeCall(path: string, params: Record<string, string>, cleIdempotence?: string) {
  const headers: Record<string, string> = { "Authorization": `Bearer ${STRIPE_SECRET_KEY}`, "Content-Type": "application/x-www-form-urlencoded" };
  if (cleIdempotence) headers["Idempotency-Key"] = cleIdempotence;
  const res = await fetchAvecReprise(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers,
    body: new URLSearchParams(params),
  });
  let data: any = null;
  try { data = await res.json(); } catch { /* réponse vide ou illisible (panne Stripe) */ }
  if (!res.ok) throw new ErreurStripe(data?.error?.message || `Erreur Stripe (HTTP ${res.status})`, res.status, data?.error?.code, data?.error?.type, data?.error?.param);
  return data;
}

// ── Alerte à l'administrateur (échec de la création du compte de paiement d'un artisan) ──
function conseilPour(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("responsibilities of managing losses") || m.includes("platform-profile")) return "Il faut valider le PROFIL DE PLATEFORME Connect dans le Dashboard Stripe : Connect → Paramètres → Profil de la plateforme (https://dashboard.stripe.com/settings/connect/platform-profile). Ensuite l'artisan peut réessayer.";
  if (m.includes("signed up for connect") || m.includes("dashboard.stripe.com/connect")) return "Stripe Connect n'est pas encore activé sur ton compte Stripe : Dashboard → Connect → Commencer, puis valide le profil de plateforme.";
  if (m.includes("required permissions") || m.includes("restricted key") || m.includes("rak_")) return "La clé secrète enregistrée dans Supabase (STRIPE_SECRET_KEY) est une clé restreinte sans le droit de créer des comptes connectés. Remplace-la par une clé avec les droits Connect.";
  if (m.includes("idempotent")) return "Un essai précédent de cet artisan est encore mémorisé par Stripe avec d'autres paramètres. Cela disparaît tout seul au bout de 24 heures.";
  if (m.includes("invalid email")) return "L'adresse email du profil de cet artisan est invalide pour Stripe : à corriger dans son profil.";
  if (m.includes("api key") || m.includes("invalid api key")) return "La clé secrète Stripe enregistrée dans Supabase (STRIPE_SECRET_KEY) est absente ou invalide.";
  return "Cause non reconnue : le message de Stripe ci-dessus dit ce qui ne va pas. Vérifie aussi Dashboard Stripe → Développeurs → Journaux.";
}
function escHtml(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
async function alerterAdmin(sbAdmin: any, etape: string, e: any, artisan: any, utilisateur: any) {
  try {
    // Au plus 3 alertes par heure et par artisan (un artisan qui clique en boucle ne remplit pas ta boîte mail).
    if (artisan?.id) {
      const { data, error } = await sbAdmin.rpc("limiter_appel", { p_cle: `alerte-connect:${artisan.id}`, p_max: 3, p_fenetre_s: 3600 });
      if (!error && data === false) return;
    }
    const apiKey = Deno.env.get("RESEND_API_KEY");
    if (!apiKey) { console.warn("[connecter-stripe-artisan] RESEND_API_KEY absente — alerte non envoyée."); return; }
    const message = e?.message ?? String(e);
    const lignes = [
      ["Étape qui a échoué", etape],
      ["Message", message],
      ["Détail Stripe", e instanceof ErreurStripe ? `HTTP ${e.status}${e.type ? " · type " + e.type : ""}${e.code ? " · code " + e.code : ""}${e.param ? " · paramètre " + e.param : ""}` : "(erreur hors Stripe)"],
      ["Artisan", artisan ? `${artisan.nom_entreprise || "?"} — ${artisan.email || utilisateur?.email || "sans email"} — id ${artisan.id}` : `profil non lu (compte ${utilisateur?.email || "?"})`],
    ];
    const html = `<div style="font-family:sans-serif;max-width:560px;"><h3 style="color:#B5502F;">Un artisan n'a pas pu activer ses paiements</h3>
      ${lignes.map(([k, v]) => `<p><strong>${escHtml(k)} :</strong> ${escHtml(v)}</p>`).join("")}
      <p style="background:#FFF7ED;border:1px solid #FED7AA;border-radius:8px;padding:10px;"><strong>Conseil :</strong> ${escHtml(conseilPour(message))}</p>
      <p style="color:#888;font-size:12px;">L'artisan a vu « Une erreur est survenue. Réessayez dans un instant. » — aucun détail technique ne lui est montré.</p></div>`;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({ from: "CaraLink Artisans <notifications@learnlogicstudio.com>", to: [ADMIN_EMAIL], subject: `⚠️ CaraLink — activation des paiements impossible (${etape})`, html }),
    });
    if (!res.ok) console.error("[connecter-stripe-artisan] Échec envoi de l'alerte :", await res.text());
  } catch (err) {
    console.error("[connecter-stripe-artisan] Échec de l'alerte administrateur :", err);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);

  let etape = "authentification";
  let artisanLu: any = null;
  let utilisateur: any = null;
  const sbAdmin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Non authentifié." }, 401);

    const sbCaller = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await sbCaller.auth.getUser();
    if (!user) return json({ error: "Session invalide." }, 401);
    utilisateur = user;

    etape = "lecture_du_profil";
    const { data: artisan, error: errA } = await sbAdmin.from("artisans")
      .select("id, nom_entreprise, email, stripe_connect_account_id").eq("user_id", user.id).maybeSingle();
    if (errA) throw errA;
    if (!artisan) return json({ error: "Aucun profil artisan trouvé." }, 404);
    artisanLu = artisan;

    // Réutilise le compte Connect existant s'il y en a déjà un — jamais de doublon.
    let accountId = artisan.stripe_connect_account_id;
    if (!accountId) {
      etape = "creation_compte_stripe";
      const account = await stripeCall("accounts", {
        type: "express",
        country: "FR",
        email: artisan.email || user.email || "",
        "capabilities[card_payments][requested]": "true",
        "capabilities[transfers][requested]": "true",
        "business_type": "individual",
        "metadata[artisan_id]": artisan.id,
      }, `compte-connect_${artisan.id}`); // deux appels simultanés : le MÊME compte Stripe (jamais deux)
      accountId = account.id;
      etape = "enregistrement_du_compte";
      const { error: errMaj } = await sbAdmin.from("artisans").update({
        stripe_connect_account_id: accountId,
        stripe_connect_statut: "en_cours",
      }).eq("id", artisan.id);
      if (errMaj) throw errMaj;
    }

    etape = "lien_onboarding";
    const baseUrl = BASE_URL_RETOUR;

    const lien = await stripeCall("account_links", {
      account: accountId,
      refresh_url: `${baseUrl}/?stripe_connect=refresh`,
      return_url: `${baseUrl}/?stripe_connect=retour`,
      type: "account_onboarding",
    });

    return json({ url: lien.url });

  } catch (e) {
    console.error("[connecter-stripe-artisan] échec à l'étape", etape, e);
    await alerterAdmin(sbAdmin, etape, e, artisanLu, utilisateur); // l'administrateur reçoit le détail par email
    return json({ error: MSG_ERREUR_GENERIQUE, etape }, 500); // la page ne reçoit que le nom de l'étape, jamais le détail (Stripe, base)
  }
});
