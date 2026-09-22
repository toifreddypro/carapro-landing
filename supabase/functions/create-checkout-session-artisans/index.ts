// ═══════════════════════════════════════════════════════════
// CaraLink Artisans — Edge Function : create-checkout-session-artisans
// Propriété : TOI Freddy
//
// Crée une session de paiement Stripe (abonnement 19,99€/mois, essai
// 14 jours) pour un artisan connecté à MPA Artisans. L'artisan est
// redirigé vers Stripe Checkout, puis revient sur MPA Artisans.
// ═══════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;
const PRICE_ID = "price_1UIdRqJPTOXXy1ykKU7Oqves"; // MPA Artisans — Mensuel, 19,99€/mois

async function stripeCall(path: string, params: Record<string, string>) {
  const body = new URLSearchParams(params);
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || "Erreur Stripe");
  return data;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Non authentifié." }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Session invalide." }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const sbAdmin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: artisan, error } = await sbAdmin.from("artisans").select("id, nom_entreprise, stripe_customer_id").eq("user_id", user.id).maybeSingle();
    if (error) throw error;
    if (!artisan) return new Response(JSON.stringify({ error: "Aucun profil artisan trouvé." }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Réutilise le customer Stripe existant s'il y en a déjà un (évite les doublons
    // si l'artisan relance l'abonnement après un essai précédent).
    let customerId = artisan.stripe_customer_id;
    if (!customerId) {
      const customer = await stripeCall("customers", {
        email: user.email || "",
        name: artisan.nom_entreprise || "",
        "metadata[artisan_id]": artisan.id,
      });
      customerId = customer.id;
      await sbAdmin.from("artisans").update({ stripe_customer_id: customerId }).eq("id", artisan.id);
    }

    const { origin } = await req.json().catch(() => ({ origin: null }));
    const baseUrl = origin || "https://caralink.app/mpa";

    const session = await stripeCall("checkout/sessions", {
      customer: customerId!,
      mode: "subscription",
      "line_items[0][price]": PRICE_ID,
      "line_items[0][quantity]": "1",
      "payment_method_collection": "if_required", // pas de carte exigée pour démarrer l'essai
      "subscription_data[trial_period_days]": "14",
      "subscription_data[trial_settings][end_behavior][missing_payment_method]": "pause", // essai sans carte → mis en pause, pas annulé
      "subscription_data[metadata][artisan_id]": artisan.id,
      success_url: `${baseUrl}/abonnement.html?statut=succes`,
      cancel_url: `${baseUrl}/abonnement.html?statut=annule`,
    });

    return new Response(JSON.stringify({ url: session.url }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    console.error("[create-checkout-session-artisans]", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
