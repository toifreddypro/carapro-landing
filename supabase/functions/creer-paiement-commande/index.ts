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
//
// Frais de livraison (30/09) : quand la commande a des frais de livraison (calculés et figés
// à la commande, voir soumettre-commande-panier.ts), ils sont inclus dans le même paiement
// Stripe que le produit — un seul règlement pour le client. La commission Ventes s'applique
// au montant total (produit + livraison), cohérent avec le reste du panier. Le montant de
// livraison seul, lui, devient ensuite le prix de l'intervention créée dans MPA (voir
// planifierLivraisonCommande) — jamais recompté une seconde fois : le client de livraison
// n'est jamais "annuaire", donc jamais vu par le système de commission Prestations.
//
// Sécurité (cette fonction est PUBLIQUE : le client n'a pas de compte) :
//  - le montant et la commission viennent TOUJOURS de la base (jamais de la page) ; les colonnes de paiement et les
//    lignes d'une commande ne sont modifiables que par le serveur (securite-commandes.sql) ;
//  - UN SEUL paiement Stripe actif par commande : si un paiement est déjà ouvert pour le même montant, on le
//    réutilise (recharger la page ou ouvrir deux onglets ne crée pas un second paiement) ; un paiement périmé est annulé ;
//    la clé d'idempotence couvre deux appels simultanés ;
//  - une commande déjà payée, remboursée (même en partie) ou annulée n'est jamais repayée ;
//  - minimum Stripe contrôlé (0,50 €), identifiant de commande contrôlé ;
//  - si la commande ne peut pas être mise à jour, le paiement créé est annulé ;
//  - le détail d'une erreur Stripe (identifiants de comptes…) n'est jamais renvoyé au client ;
//  - le mois du seuil gratuit commence le 1er à minuit, heure de la Guadeloupe (UTC-4).
// ═══════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;
const TAUX_COMMISSION = 0.07; // 7%
const SEUIL_GRATUIT_EUROS = 200; // seuil mensuel — aligné sur celui des Prestations (28/09)
const DECALAGE_LOCAL_MS = 4 * 3600 * 1000; // Guadeloupe = UTC-4 : le « mois » de l'artisan commence à 04:00 UTC
const MONTANT_MINIMUM_CENTIMES = 50; // Stripe refuse tout paiement en dessous de 0,50 €
const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MSG_ERREUR_GENERIQUE = "Le paiement n'a pas pu être préparé. Réessayez dans un instant, ou contactez l'artisan.";
const STATUTS_PAIEMENT_DEJA_REGLES = ["paye", "partiellement_rembourse", "rembourse"];

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

// CA net déjà facturé en ligne par l'artisan depuis le 1er du mois (heure de la Guadeloupe), remboursements déduits.
// Une commande totalement remboursée compte donc pour 0€ ; une commande partiellement remboursée
// ne compte que pour ce qu'il en reste.
async function dejaFactureCeMoisCentimes(sb: any, artisanId: string): Promise<number> {
  // Début du mois en heure de la Guadeloupe (UTC-4), exprimé en UTC.
  const local = new Date(Date.now() - DECALAGE_LOCAL_MS);
  const debutMoisISO = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) + DECALAGE_LOCAL_MS).toISOString();
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
  const res = await fetchAvecReprise(`https://api.stripe.com/v1/${path}`, { method: "POST", headers, body: new URLSearchParams(params) });
  const data = await res.json();
  if (!res.ok) { const e: any = new Error(data?.error?.message || "Erreur Stripe"); e.stripeCode = data?.error?.code || data?.error?.type; throw e; }
  return data;
}

async function stripeGet(path: string) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, { headers: { "Authorization": `Bearer ${STRIPE_SECRET_KEY}` } });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Requête invalide." }, 400);
    const commande_id = body.commande_id;
    if (!commande_id) return json({ error: "commande_id manquant." }, 400);
    if (typeof commande_id !== "string" || !REGEX_UUID.test(commande_id)) return json({ error: "Commande introuvable." }, 404);

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: commande, error: errC } = await sb.from("commandes_catalogue")
      .select("id, artisan_id, catalogue_id, nom_article, quantite, paiement_statut, statut, stripe_payment_intent_id, frais_livraison, artisans(stripe_connect_account_id, stripe_connect_statut, nom_entreprise), artisans_catalogue(prix)")
      .eq("id", commande_id).maybeSingle();
    if (errC) throw errC;
    if (!commande) return json({ error: "Commande introuvable." }, 404);
    // Une commande déjà réglée (même remboursée, même en partie) ou annulée ne se repaie jamais.
    if (STATUTS_PAIEMENT_DEJA_REGLES.includes(commande.paiement_statut)) return json({ error: "Cette commande est déjà payée." }, 400);
    if (commande.statut === "annulee") return json({ error: "Cette commande a été annulée." }, 400);

    const artisanInfos = (commande as any).artisans;
    const articleInfos = (commande as any).artisans_catalogue;
    if (!artisanInfos?.stripe_connect_account_id || artisanInfos.stripe_connect_statut !== "actif") {
      return json({ error: "Cet artisan n'a pas encore activé les paiements en ligne — le paiement se fait directement avec lui pour l'instant." }, 400);
    }

    const fraisLivraisonCentimes = Math.round((Number((commande as any).frais_livraison) || 0) * 100);

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

    // Frais de livraison : déjà calculés et figés à la commande (jamais recalculés ici, jamais
    // repris d'une valeur envoyée par le client) — juste ajoutés au montant à régler.
    montantTotal += fraisLivraisonCentimes;
    if (fraisLivraisonCentimes > 0) descriptionStripe += ` (livraison incluse : ${(fraisLivraisonCentimes / 100).toFixed(2)} €)`;

    if (!Number.isFinite(montantTotal) || montantTotal < MONTANT_MINIMUM_CENTIMES) {
      return json({ error: "Le montant de cette commande est trop faible pour un paiement en ligne (0,50 € minimum) : le paiement se fait directement avec l'artisan." }, 400);
    }

    // ── Un seul paiement actif par commande ──
    const ancienId = commande.stripe_payment_intent_id as string | null;
    if (ancienId) {
      const ancien = await stripeGet(`payment_intents/${encodeURIComponent(ancienId)}`);
      if (ancien.ok) {
        const st = ancien.data?.status;
        if (st === "succeeded") return json({ error: "Cette commande est déjà payée." }, 400);
        if (st === "processing") return json({ error: "Un paiement est déjà en cours pour cette commande. Patientez quelques instants." }, 409);
        if (["requires_payment_method", "requires_confirmation", "requires_action"].includes(st)) {
          // Même montant : on RÉUTILISE le paiement ouvert (recharger la page ne crée pas un second paiement).
          if (ancien.data.amount === montantTotal && ancien.data.client_secret) return json({ client_secret: ancien.data.client_secret });
          // Montant différent (prix ou frais modifiés depuis) : l'ancien paiement est périmé, on l'annule.
          try { await stripeCall(`payment_intents/${encodeURIComponent(ancienId)}/cancel`, {}); } catch (e) { console.error("[creer-paiement-commande] Annulation de l'ancien paiement impossible :", e); }
        }
      }
    }

    const dejaFacture = await dejaFactureCeMoisCentimes(sb, commande.artisan_id);
    const { commissionCentimes: commission } = calculerCommissionAvecSeuil(
      montantTotal, dejaFacture, SEUIL_GRATUIT_EUROS * 100, TAUX_COMMISSION,
    );

    // Clé d'idempotence : deux appels simultanés pour la même commande, le même montant et le même état précédent
    // obtiennent le MÊME paiement (jamais deux).
    const intent = await stripeCall("payment_intents", {
      amount: String(montantTotal),
      currency: "eur",
      "automatic_payment_methods[enabled]": "true",
      "application_fee_amount": String(commission),
      "transfer_data[destination]": artisanInfos.stripe_connect_account_id,
      "metadata[commande_id]": commande_id,
      "metadata[artisan_id]": commande.artisan_id,
      "description": descriptionStripe,
    }, `paiement-commande_${commande_id}_${montantTotal}_${ancienId ?? "aucun"}`);

    const { error: errMaj } = await sb.from("commandes_catalogue").update({
      stripe_payment_intent_id: intent.id,
      montant_total: montantTotal / 100,
      commission_montant: commission / 100,
      paiement_statut: "en_attente",
    }).eq("id", commande_id);
    if (errMaj) {
      // Sans cette trace, un paiement réussi serait impossible à rapprocher (et à rembourser) : on annule le paiement créé.
      console.error("[creer-paiement-commande] Mise à jour de la commande impossible :", errMaj.message);
      try { await stripeCall(`payment_intents/${encodeURIComponent(intent.id)}/cancel`, {}); } catch (e) { console.error("[creer-paiement-commande] Annulation impossible :", e); }
      throw new Error("Mise à jour de la commande impossible.");
    }

    return json({ client_secret: intent.client_secret });

  } catch (e) {
    console.error("[creer-paiement-commande]", e);
    if ((e as any)?.stripeCode === "idempotency_error") return json({ error: "Votre paiement est en cours de préparation. Patientez un instant puis réessayez." }, 409);
    return json({ error: MSG_ERREUR_GENERIQUE }, 500); // le détail (identifiants Stripe…) reste dans les journaux
  }
});
