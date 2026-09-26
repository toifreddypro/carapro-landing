// ═══════════════════════════════════════════════════════════
// CaraLink Artisans — Edge Function : creer-paiement-commande
// Propriété : TOI Freddy
//
// Crée un Payment Intent Stripe pour une commande du catalogue, en
// "destination charge" : le client paie CaraLink Artisans, les frais
// de traitement Stripe sont prélevés sur NOTRE part (pas celle de
// l'artisan), notre commission est retenue automatiquement, et le
// reste part directement sur le compte Stripe de l'artisan.
//
// Taux de commission à ajuster ici — décidé à 7% le 25/09, à revoir
// une fois qu'il y a du vrai volume pour voir comment ça se comporte.
// ═══════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;
const TAUX_COMMISSION = 0.07; // 7%

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

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
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);

  try {
    const { commande_id } = await req.json().catch(() => ({}));
    if (!commande_id) return json({ error: "commande_id manquant." }, 400);

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: commande, error: errC } = await sb.from("commandes_catalogue")
      .select("id, artisan_id, nom_article, quantite, paiement_statut, artisans(stripe_connect_account_id, stripe_connect_statut, nom_entreprise), artisans_catalogue(prix)")
      .eq("id", commande_id).maybeSingle();
    if (errC) throw errC;
    if (!commande) return json({ error: "Commande introuvable." }, 404);
    if (commande.paiement_statut === "paye") return json({ error: "Cette commande est déjà payée." }, 400);

    const artisanInfos = (commande as any).artisans;
    const articleInfos = (commande as any).artisans_catalogue;
    if (!artisanInfos?.stripe_connect_account_id || artisanInfos.stripe_connect_statut !== "actif") {
      return json({ error: "Cet artisan n'a pas encore activé les paiements en ligne — le paiement se fait directement avec lui pour l'instant." }, 400);
    }
    if (articleInfos?.prix == null) {
      return json({ error: "Cet article n'a plus de prix défini." }, 400);
    }

    const montantTotal = Math.round(articleInfos.prix * commande.quantite * 100); // centimes
    const commission = Math.round(montantTotal * TAUX_COMMISSION);

    const intent = await stripeCall("payment_intents", {
      amount: String(montantTotal),
      currency: "eur",
      "automatic_payment_methods[enabled]": "true",
      "application_fee_amount": String(commission),
      "transfer_data[destination]": artisanInfos.stripe_connect_account_id,
      "metadata[commande_id]": commande_id,
      "description": `${commande.nom_article} × ${commande.quantite} — ${artisanInfos.nom_entreprise}`,
    });

    await sb.from("commandes_catalogue").update({
      stripe_payment_intent_id: intent.id,
      montant_total: montantTotal / 100,
      commission_montant: commission / 100,
      paiement_statut: "en_attente",
    }).eq("id", commande_id);

    return json({ client_secret: intent.client_secret });

  } catch (e) {
    console.error("[creer-paiement-commande]", e);
    return json({ error: (e as Error).message }, 500);
  }
});
