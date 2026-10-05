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
//  - le détail d'une erreur Stripe n'est jamais renvoyé.
// ═══════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;
const BASE_URL_RETOUR = "https://caralink.app/mpa"; // fixe : jamais une adresse envoyée par la page
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

async function stripeCall(path: string, params: Record<string, string>, cleIdempotence?: string) {
  const headers: Record<string, string> = { "Authorization": `Bearer ${STRIPE_SECRET_KEY}`, "Content-Type": "application/x-www-form-urlencoded" };
  if (cleIdempotence) headers["Idempotency-Key"] = cleIdempotence;
  const res = await fetchAvecReprise(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers,
    body: new URLSearchParams(params),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || "Erreur Stripe");
  return data;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Non authentifié." }, 401);

    const sbCaller = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await sbCaller.auth.getUser();
    if (!user) return json({ error: "Session invalide." }, 401);

    const sbAdmin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: artisan, error: errA } = await sbAdmin.from("artisans")
      .select("id, nom_entreprise, email, stripe_connect_account_id").eq("user_id", user.id).maybeSingle();
    if (errA) throw errA;
    if (!artisan) return json({ error: "Aucun profil artisan trouvé." }, 404);

    // Réutilise le compte Connect existant s'il y en a déjà un — jamais de doublon.
    let accountId = artisan.stripe_connect_account_id;
    if (!accountId) {
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
      const { error: errMaj } = await sbAdmin.from("artisans").update({
        stripe_connect_account_id: accountId,
        stripe_connect_statut: "en_cours",
      }).eq("id", artisan.id);
      if (errMaj) throw errMaj;
    }

    const baseUrl = BASE_URL_RETOUR;

    const lien = await stripeCall("account_links", {
      account: accountId,
      refresh_url: `${baseUrl}/?stripe_connect=refresh`,
      return_url: `${baseUrl}/?stripe_connect=retour`,
      type: "account_onboarding",
    });

    return json({ url: lien.url });

  } catch (e) {
    console.error("[connecter-stripe-artisan]", e);
    return json({ error: MSG_ERREUR_GENERIQUE }, 500); // le détail (Stripe, base) reste dans les journaux
  }
});
