// ═══════════════════════════════════════════════════════════
// CaraLink Artisans — Edge Function : stripe-webhook-artisans
// Propriété : TOI Freddy
//
// Reçoit les événements Stripe pour les abonnements MPA Artisans et
// synchronise artisans.abonnement_statut. Trois états gérés : essai
// (14 jours, plein accès), actif (payant, plein accès), lecture_seule
// (essai expiré sans carte, ou abonnement résilié/impayé).
// ═══════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET_ARTISANS")!;

const sbAdmin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

// Vérification de signature Stripe sans dépendance externe (HMAC SHA-256, comme le fait le SDK Stripe).
async function verifierSignature(payload: string, sigHeader: string, secret: string): Promise<boolean> {
  const parts = Object.fromEntries(sigHeader.split(",").map((p) => p.split("=")));
  const timestamp = parts["t"];
  const signature = parts["v1"];
  if (!timestamp || !signature) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signedPayload = `${timestamp}.${payload}`;
  const sigBytes = await crypto.subtle.sign("HMAC", key, encoder.encode(signedPayload));
  const computedSig = Array.from(new Uint8Array(sigBytes)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return computedSig === signature;
}

function mapStatutStripeVersArtisans(statutStripe: string): string {
  if (statutStripe === "trialing") return "essai";
  if (statutStripe === "active") return "actif";
  if (statutStripe === "past_due") return "actif"; // Stripe retente le paiement automatiquement, on ne coupe pas tout de suite
  // paused (essai expiré sans carte), canceled, unpaid, incomplete_expired → lecture seule
  return "lecture_seule";
}

Deno.serve(async (req: Request) => {
  try {
    const sig = req.headers.get("stripe-signature");
    const payload = await req.text();
    if (!sig || !(await verifierSignature(payload, sig, STRIPE_WEBHOOK_SECRET))) {
      return new Response("Signature invalide.", { status: 400 });
    }

    const event = JSON.parse(payload);

    if (event.type.startsWith("customer.subscription.")) {
      const sub = event.data.object;
      const artisanId = sub.metadata?.artisan_id;
      const statut = mapStatutStripeVersArtisans(sub.status);

      if (artisanId) {
        const { error } = await sbAdmin.from("artisans").update({
          abonnement_statut: statut,
          stripe_subscription_id: sub.id,
        }).eq("id", artisanId);
        if (error) console.error("[stripe-webhook-artisans] Maj artisan (par artisan_id) échouée:", error.message);
      } else {
        // Filet de sécurité : si le metadata n'a pas suivi (ex. abonnement modifié depuis le dashboard Stripe
        // sans passer par notre code), on retrouve l'artisan via le customer_id.
        const { error } = await sbAdmin.from("artisans").update({
          abonnement_statut: statut,
          stripe_subscription_id: sub.id,
        }).eq("stripe_customer_id", sub.customer);
        if (error) console.error("[stripe-webhook-artisans] Maj artisan (par customer_id) échouée:", error.message);
      }
    }

    return new Response(JSON.stringify({ received: true }), { headers: { "Content-Type": "application/json" } });

  } catch (e) {
    console.error("[stripe-webhook-artisans]", e);
    return new Response("Erreur serveur.", { status: 500 });
  }
});
