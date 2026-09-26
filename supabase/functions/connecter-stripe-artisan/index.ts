// ═══════════════════════════════════════════════════════════
// CaraLink Artisans — Edge Function : connecter-stripe-artisan
// Propriété : TOI Freddy
//
// Crée (ou réutilise) un compte Stripe Express pour l'artisan connecté,
// et renvoie un lien d'onboarding Stripe (Stripe gère l'identité, les
// coordonnées bancaires, la vérification — rien à reconstruire ici).
// ═══════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function stripeCall(path: string, params: Record<string, string>, method = "POST") {
  const body = new URLSearchParams(params);
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: {
      "Authorization": `Bearer ${STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: method === "GET" ? undefined : body,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || "Erreur Stripe");
  return data;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

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
        email: artisan.email || "",
        "capabilities[card_payments][requested]": "true",
        "capabilities[transfers][requested]": "true",
        "business_type": "individual",
        "metadata[artisan_id]": artisan.id,
      });
      accountId = account.id;
      await sbAdmin.from("artisans").update({
        stripe_connect_account_id: accountId,
        stripe_connect_statut: "en_cours",
      }).eq("id", artisan.id);
    }

    const { origin } = await req.json().catch(() => ({ origin: null }));
    const baseUrl = origin || "https://caralink.app/mpa";

    const lien = await stripeCall("account_links", {
      account: accountId,
      refresh_url: `${baseUrl}/?stripe_connect=refresh`,
      return_url: `${baseUrl}/?stripe_connect=retour`,
      type: "account_onboarding",
    });

    return json({ url: lien.url });

  } catch (e) {
    console.error("[connecter-stripe-artisan]", e);
    return json({ error: (e as Error).message }, 500);
  }
});
