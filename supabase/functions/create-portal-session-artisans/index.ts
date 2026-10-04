// ═══════════════════════════════════════════════════════════
// CaraLink Artisans — Edge Function : create-portal-session-artisans
// Propriété : TOI Freddy
//
// Ouvre le portail client Stripe d'un artisan abonné au Pro : ajouter ou
// changer sa carte, résilier (en fin de période payée), voir ses factures.
//
// Règles :
//  - Le client Stripe vient TOUJOURS de la ligne de l'artisan connecté en
//    base — jamais du navigateur. Impossible d'ouvrir le portail d'un autre.
//  - Réservé à ceux qui ont (ou ont eu) un abonnement : un artisan qui n'a
//    jamais pris le Pro n'a rien à y gérer.
//  - L'adresse de retour est fixée ici, pas fournie par le navigateur.
// ═══════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;
const PORTAIL_CONFIGURATION_ID = "bpc_1UMr2oJPTOXXy1yk8Xlm43mQ"; // portail MPA Artisans Pro (voir Stripe > Réglages > Portail client)
const URL_RETOUR_MPA = "https://caralink.app/mpa/";

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function stripeCall(path: string, params: Record<string, string>) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${STRIPE_SECRET_KEY}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
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

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return json({ error: "Session invalide." }, 401);

    const sbAdmin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: artisan, error } = await sbAdmin.from("artisans")
      .select("id, stripe_customer_id, stripe_subscription_id")
      .eq("user_id", user.id).maybeSingle();
    if (error) throw error;
    if (!artisan) return json({ error: "Aucun profil artisan trouvé." }, 404);
    if (!artisan.stripe_customer_id || !artisan.stripe_subscription_id) {
      return json({ error: "Aucun abonnement à gérer." }, 404);
    }

    const session = await stripeCall("billing_portal/sessions", {
      customer: artisan.stripe_customer_id,
      return_url: URL_RETOUR_MPA,
      configuration: PORTAIL_CONFIGURATION_ID,
    });

    return json({ url: session.url });

  } catch (e) {
    console.error("[create-portal-session-artisans]", e);
    return json({ error: (e as Error).message }, 500);
  }
});
