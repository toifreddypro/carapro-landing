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
//
// Sécurité :
//  - chaque appel agit sur le profil de la personne CONNECTÉE (jamais un identifiant envoyé par la page) ;
//  - la création du client Stripe est idempotente : deux appels simultanés (double-clic) ne créent jamais deux clients,
//    sinon la carte se retrouverait sur un client orphelin et le prélèvement mensuel n'en trouverait aucune ;
//  - la carte seule est proposée (le prélèvement mensuel ne sait débiter qu'une carte) ;
//  - l'adresse email du client Stripe est celle du compte de connexion si le profil n'en a pas ;
//  - le détail d'une erreur Stripe n'est jamais renvoyé.
// ═══════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;
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
      // Clé d'idempotence : deux appels simultanés obtiennent le MÊME client Stripe (jamais deux).
      const customer = await stripeCall("customers", {
        email: artisan.email || user.email || "",
        name: artisan.nom_entreprise || "",
        "metadata[artisan_id]": artisan.id,
      }, `client-carte-prestations_${artisan.id}`);
      customerId = customer.id;
      const { error: errMaj } = await sb.from("artisans").update({ stripe_customer_id: customerId }).eq("id", artisan.id);
      if (errMaj) throw errMaj;
    }

    const setupIntent = await stripeCall("setup_intents", {
      customer: customerId!,
      usage: "off_session",
      "metadata[artisan_id]": artisan.id,
      "payment_method_types[0]": "card", // le prélèvement mensuel ne débite qu'une carte
    });

    return json({ client_secret: setupIntent.client_secret });

  } catch (e) {
    console.error("[enregistrer-carte-prestations]", e);
    return json({ error: MSG_ERREUR_GENERIQUE }, 500); // le détail (Stripe, base) reste dans les journaux
  }
});
