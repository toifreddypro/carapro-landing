// ═══════════════════════════════════════════════════════════
// CaraLink Artisans — Edge Function : enregistrer-carte-prestations
// Propriété : TOI Freddy
//
// Crée (ou réutilise) le client Stripe de l'artisan et un SetupIntent :
// une carte enregistrée UNE FOIS, jamais débitée tout de suite, qui sert
// ensuite au prélèvement automatique mensuel de la commission sur les
// prestations "annuaire" au-dessus du seuil gratuit.
//
// Le frontend confirme ce SetupIntent avec Stripe Elements (Payment Element).
// Une fois confirmé, c'est le webhook (événement setup_intent.succeeded)
// qui marque la carte comme enregistrée — jamais le frontend seul, pour ne
// jamais faire confiance à une confirmation qu'on n'a pas vue soi-même.
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

async function stripeCall(path: string, params: Record<string, string>) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${STRIPE_SECRET_KEY}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || "Erreur Stripe.");
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

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: artisan, error } = await sb.from("artisans")
      .select("id, nom_entreprise, email, stripe_customer_id").eq("user_id", user.id).maybeSingle();
    if (error) throw error;
    if (!artisan) return json({ error: "Profil artisan introuvable." }, 404);

    let customerId = artisan.stripe_customer_id as string | null;
    if (!customerId) {
      const customer = await stripeCall("customers", {
        email: artisan.email || "",
        name: artisan.nom_entreprise || "",
        "metadata[artisan_id]": artisan.id,
      });
      customerId = customer.id;
      await sb.from("artisans").update({ stripe_customer_id: customerId }).eq("id", artisan.id);
    }

    const setupIntent = await stripeCall("setup_intents", {
      customer: customerId!,
      usage: "off_session",
      "metadata[artisan_id]": artisan.id,
      "automatic_payment_methods[enabled]": "true",
    });

    return json({ client_secret: setupIntent.client_secret });

  } catch (e) {
    console.error("[enregistrer-carte-prestations]", e);
    return json({ error: (e as Error).message || "Erreur serveur." }, 500);
  }
});
