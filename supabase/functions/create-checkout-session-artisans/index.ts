// ═══════════════════════════════════════════════════════════
// CaraLink Artisans — Edge Function : create-checkout-session-artisans
// Propriété : TOI Freddy
//
// Crée une session de paiement Stripe pour passer un artisan en offre Pro
// (9,90€/mois). L'artisan est redirigé vers Stripe Checkout, puis revient
// sur MPA Artisans.
//
// Règles :
//  - Un artisan déjà Pro (abonné ou Pro offert) ne peut pas s'abonner une
//    seconde fois (sinon : double facturation).
//  - L'essai gratuit de 14 jours, sans carte, n'est offert qu'UNE fois par
//    artisan. Dès qu'il a eu un abonnement (même en pause), la prochaine fois
//    c'est un abonnement normal, avec carte, sans essai — sinon on pourrait
//    enchaîner les essais gratuits à l'infini et ne jamais payer.
//  - Les adresses de retour sont écrites ici, jamais fournies par le
//    navigateur.
//
// Sécurité :
//  - un double-clic ne crée pas deux sessions de paiement (deux abonnements possibles = double facturation) : la
//    clé d'idempotence rend la MÊME session pendant 30 minutes ; au-delà, une nouvelle session est créée ;
//  - le client Stripe est créé de façon idempotente avec la MÊME clé que enregistrer-carte-prestations : les deux
//    fonctions partagent la colonne stripe_customer_id, la seconde retrouve toujours le client de la première ;
//  - une erreur interne ou de Stripe n'est jamais renvoyée telle quelle.
// ═══════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;
const PRICE_ID = "price_1UMoXDJPTOXXy1ykAdtiD56W"; // MPA Artisans Pro — 9,90€/mois
const URL_RETOUR_MPA = "https://caralink.app/mpa/";
const JOURS_ESSAI = 14;
const DUREE_SESSION_MS = 30 * 60 * 1000; // pendant ce délai, un nouveau clic renvoie la même session de paiement
const MSG_ERREUR_GENERIQUE = "Une erreur est survenue. Réessayez dans un instant.";

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// Stripe répond 409 quand une requête portant la MÊME clé d'idempotence est encore en cours (double-clic) : on attend un
// instant puis on renvoie la même requête, qui rejoue alors le résultat du premier appel.
async function fetchAvecReprise(url: string, init: RequestInit): Promise<Response> {
  let res = await fetch(url, init);
  for (let i = 1; i <= 4 && res.status === 409; i++) {
    await new Promise((r) => setTimeout(r, 300 * i));
    res = await fetch(url, init);
  }
  return res;
}

async function stripeCall(path: string, params: Record<string, string>, cleIdempotence?: string) {
  const body = new URLSearchParams(params);
  const headers: Record<string, string> = { "Authorization": `Bearer ${STRIPE_SECRET_KEY}`, "Content-Type": "application/x-www-form-urlencoded" };
  if (cleIdempotence) headers["Idempotency-Key"] = cleIdempotence;
  const res = await fetchAvecReprise(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers,
    body,
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

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return json({ error: "Session invalide." }, 401);

    const sbAdmin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: artisan, error } = await sbAdmin.from("artisans")
      .select("id, nom_entreprise, email, stripe_customer_id, stripe_subscription_id, plan")
      .eq("user_id", user.id).maybeSingle();
    if (error) throw error;
    if (!artisan) return json({ error: "Aucun profil artisan trouvé." }, 404);

    if (artisan.plan === "pro" || artisan.plan === "pro_offert") {
      return json({ error: "Vous avez déjà l'offre Pro." }, 409);
    }

    // Réutilise le customer Stripe existant s'il y en a déjà un (évite les doublons).
    let customerId = artisan.stripe_customer_id;
    if (!customerId) {
      // Mêmes paramètres ET même clé que enregistrer-carte-prestations : les deux fonctions retrouvent le même client.
      const customer = await stripeCall("customers", {
        email: artisan.email || user.email || "",
        name: artisan.nom_entreprise || "",
        "metadata[artisan_id]": artisan.id,
      }, `client-artisan_${artisan.id}`);
      customerId = customer.id;
      const { error: errMaj } = await sbAdmin.from("artisans").update({ stripe_customer_id: customerId }).eq("id", artisan.id);
      if (errMaj) throw errMaj;
    }

    // Essai gratuit : une seule fois. stripe_subscription_id n'est renseigné que par le webhook,
    // donc une session abandonnée (jamais menée au bout) ne consomme pas l'essai.
    const premiereFois = !artisan.stripe_subscription_id;

    const params: Record<string, string> = {
      customer: customerId!,
      mode: "subscription",
      "line_items[0][price]": PRICE_ID,
      "line_items[0][quantity]": "1",
      "subscription_data[metadata][artisan_id]": artisan.id,
      success_url: `${URL_RETOUR_MPA}?abonnement=succes`,
      cancel_url: `${URL_RETOUR_MPA}?abonnement=annule`,
    };
    if (premiereFois) {
      params["payment_method_collection"] = "if_required"; // pas de carte exigée pour démarrer l'essai
      params["subscription_data[trial_period_days]"] = String(JOURS_ESSAI);
      params["subscription_data[trial_settings][end_behavior][missing_payment_method]"] = "pause"; // essai sans carte → mis en pause, pas annulé
    } else {
      params["payment_method_collection"] = "always"; // pas d'essai : la carte est demandée tout de suite
    }

    // Même artisan, même type d'offre, même créneau de 30 minutes : la MÊME session (jamais deux sessions à payer).
    const session = await stripeCall("checkout/sessions", params, `checkout-pro_${artisan.id}_${premiereFois ? "essai" : "payant"}_${Math.floor(Date.now() / DUREE_SESSION_MS)}`);

    return json({ url: session.url, essai: premiereFois });

  } catch (e) {
    console.error("[create-checkout-session-artisans]", e);
    return json({ error: MSG_ERREUR_GENERIQUE }, 500); // le détail (Stripe, base) reste dans les journaux
  }
});
