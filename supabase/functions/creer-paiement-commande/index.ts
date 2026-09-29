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
//
// Modèle "gratuit sous un seuil" (28/09) : chaque mois, les premiers SEUIL_GRATUIT_EUROS
// facturés en ligne via CaraLink par un artisan ne sont PAS commissionnés — seule la part
// qui dépasse ce seuil l'est, à TAUX_COMMISSION. Calcul marginal (pas d'effet de seuil brutal) :
// une commande qui chevauche le seuil n'est commissionnée QUE sur sa portion au-dessus.
// Objectif : un petit mois (quelques dizaines d'euros) ne coûte plus rien à l'artisan.
// ═══════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;
const TAUX_COMMISSION = 0.07; // 7%
const SEUIL_GRATUIT_EUROS = 200; // seuil mensuel — aligné sur celui des Prestations (28/09)

// Calcul pur, testé isolément (voir la suite de tests fournie à part).
// Tout en centimes pour éviter les erreurs d'arrondi. `dejaFactureCentimes` = ce que
// l'artisan a déjà facturé en ligne CE MOIS-CI (net des remboursements), avant cette commande.
function calculerCommissionAvecSeuil(
  montantCommandeCentimes: number,
  dejaFactureCentimes: number,
  seuilCentimes: number,
  taux: number,
): { commissionCentimes: number; montantSousLeSeuilCentimes: number; montantCommissionneCentimes: number } {
  const placeRestanteSousLeSeuil = Math.max(0, seuilCentimes - dejaFactureCentimes);
  const montantSousLeSeuilCentimes = Math.min(montantCommandeCentimes, placeRestanteSousLeSeuil);
  const montantCommissionneCentimes = montantCommandeCentimes - montantSousLeSeuilCentimes;
  const commissionCentimes = Math.round(montantCommissionneCentimes * taux);
  return { commissionCentimes, montantSousLeSeuilCentimes, montantCommissionneCentimes };
}

// CA net déjà facturé en ligne par l'artisan depuis le 1er du mois (UTC), remboursements déduits.
// Une commande totalement remboursée compte donc pour 0€ ; une commande partiellement remboursée
// ne compte que pour ce qu'il en reste.
async function dejaFactureCeMoisCentimes(sb: any, artisanId: string): Promise<number> {
  const maintenant = new Date();
  const debutMoisISO = new Date(Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth(), 1)).toISOString();
  const { data, error } = await sb.from("commandes_catalogue")
    .select("montant_total, montant_rembourse")
    .eq("artisan_id", artisanId)
    .in("paiement_statut", ["paye", "partiellement_rembourse", "rembourse"])
    .gte("created_at", debutMoisISO);
  if (error) throw error;
  const totalCentimes = (data || []).reduce((somme: number, c: any) => {
    const net = Number(c.montant_total || 0) - Number(c.montant_rembourse || 0);
    return somme + Math.round(Math.max(0, net) * 100);
  }, 0);
  return totalCentimes;
}

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
      .select("id, artisan_id, catalogue_id, nom_article, quantite, paiement_statut, artisans(stripe_connect_account_id, stripe_connect_statut, nom_entreprise), artisans_catalogue(prix)")
      .eq("id", commande_id).maybeSingle();
    if (errC) throw errC;
    if (!commande) return json({ error: "Commande introuvable." }, 404);
    if (commande.paiement_statut === "paye") return json({ error: "Cette commande est déjà payée." }, 400);

    const artisanInfos = (commande as any).artisans;
    const articleInfos = (commande as any).artisans_catalogue;
    if (!artisanInfos?.stripe_connect_account_id || artisanInfos.stripe_connect_statut !== "actif") {
      return json({ error: "Cet artisan n'a pas encore activé les paiements en ligne — le paiement se fait directement avec lui pour l'instant." }, 400);
    }

    // Commande panier (plusieurs lignes, catalogue_id de la commande = null) : le prix de
    // chaque article a déjà été figé à la commande (soumettre-commande-panier.ts) — on
    // additionne ces lignes, on ne retourne JAMAIS consulter le prix catalogue actuel de
    // l'article (il a pu changer depuis). Sinon (commande "un produit", flux existant) :
    // comportement inchangé, prix repris du catalogue au moment du paiement.
    let montantTotal: number;
    let descriptionStripe: string;
    if (commande.catalogue_id != null) {
      if (articleInfos?.prix == null) {
        return json({ error: "Cet article n'a plus de prix défini." }, 400);
      }
      montantTotal = Math.round(articleInfos.prix * commande.quantite * 100); // centimes
      descriptionStripe = `${commande.nom_article} × ${commande.quantite} — ${artisanInfos.nom_entreprise}`;
    } else {
      const { data: lignes, error: errL } = await sb.from("commandes_catalogue_lignes")
        .select("prix_unitaire, quantite").eq("commande_id", commande_id);
      if (errL) throw errL;
      if (!lignes || !lignes.length) return json({ error: "Cette commande n'a aucun article." }, 400);
      montantTotal = Math.round(lignes.reduce((s: number, l: any) => s + l.prix_unitaire * l.quantite, 0) * 100);
      descriptionStripe = `${commande.nom_article} — ${artisanInfos.nom_entreprise}`;
    }
    const dejaFacture = await dejaFactureCeMoisCentimes(sb, commande.artisan_id);
    const { commissionCentimes: commission } = calculerCommissionAvecSeuil(
      montantTotal, dejaFacture, SEUIL_GRATUIT_EUROS * 100, TAUX_COMMISSION,
    );

    const intent = await stripeCall("payment_intents", {
      amount: String(montantTotal),
      currency: "eur",
      "automatic_payment_methods[enabled]": "true",
      "application_fee_amount": String(commission),
      "transfer_data[destination]": artisanInfos.stripe_connect_account_id,
      "metadata[commande_id]": commande_id,
      "description": descriptionStripe,
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
