// ═══════════════════════════════════════════════════════════
// CaraLink Artisans — Edge Function : rembourser-commande
// Propriété : TOI Freddy
//
// Rembourse (en totalité ou en partie) une commande payée en ligne.
//
// Qui peut l'appeler :
//   • l'artisan propriétaire de la commande (depuis MPA Artisans)
//   • l'admin (toifreddypro@gmail.com), sur n'importe quelle commande
//
// Comment l'argent circule (paiement = "destination charge", commission 7 %) :
//   • le client récupère le montant remboursé ;
//   • Stripe REPREND à l'artisan sa part proportionnelle (reverse_transfer) ;
//   • CaraLink rend donc sa commission sur la partie remboursée, et ne
//     récupère PAS les frais de traitement Stripe (jamais restitués par Stripe).
//   → on n'utilise volontairement PAS refund_application_fee : avec ce montage,
//     la commission est déjà rendue via la reprise proportionnelle, et l'activer
//     redonnerait en plus de l'argent à l'artisan.
//
// Sécurités :
//   • vérification du solde Stripe de l'artisan AVANT de rembourser (Stripe ne
//     bloque pas un solde négatif, et c'est la plateforme qui en répond) ;
//   • clé d'idempotence : un double clic ne rembourse jamais deux fois ;
//   • jamais plus que le montant encore remboursable ;
//   • les entrées sont contrôlées (identifiant, montant, motif) et aucune erreur interne n'est détaillée ;
//   • un message de refus de Stripe n'est montré qu'à l'admin (il peut parler des finances de la plateforme) ;
//   • la mise à jour de la commande ne remplace jamais une valeur plus récente (deux remboursements simultanés).
//   Les colonnes de paiement d'une commande ne sont modifiables que par le serveur (securite-commandes.sql) : cette
//   fonction peut donc se fier à ce qu'elle lit.
// ═══════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;
const ADMIN_EMAIL = "toifreddypro@gmail.com";
const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MSG_ERREUR_GENERIQUE = "Une erreur est survenue. Réessayez dans un instant ou contactez le support.";

// Montant demandé : rien (= tout le reste), un nombre, ou un texte numérique (« 12.50 » / « 12,50 »). Tout autre type est refusé.
function lireMontant(v: unknown): number | null | "invalide" {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : "invalide";
  if (typeof v === "string" && /^\d+([.,]\d{1,2})?$/.test(v.trim())) return Number(v.trim().replace(",", "."));
  return "invalide";
}

class ErreurMetier extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function euros(cents: number): string {
  return (cents / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

// ── Calcul pur (testé isolément) — tout en centimes pour éviter les erreurs d'arrondi ──
function calculerRemboursement(
  c: { montant_total: number; commission_montant: number | null; montant_rembourse: number | null },
  montantDemandeEuros?: number | string | null,
) {
  const totalCents = Math.round(Number(c.montant_total) * 100);
  const dejaCents = Math.round(Number(c.montant_rembourse || 0) * 100);
  const restantCents = totalCents - dejaCents;
  if (!(totalCents > 0)) throw new ErreurMetier("Montant de la commande introuvable.");
  if (restantCents <= 0) throw new ErreurMetier("Cette commande est déjà remboursée en totalité.");

  const pasDeMontant = montantDemandeEuros === null || montantDemandeEuros === undefined || montantDemandeEuros === "";
  const montantCents = pasDeMontant ? restantCents : Math.round(Number(montantDemandeEuros) * 100);
  if (!Number.isFinite(montantCents) || montantCents <= 0) throw new ErreurMetier("Montant à rembourser invalide.");
  if (montantCents > restantCents) {
    throw new ErreurMetier("Le montant demandé (" + euros(montantCents) + ") dépasse ce qui reste remboursable (" + euros(restantCents) + ").");
  }

  const commissionCents = Math.round(Number(c.commission_montant || 0) * 100);
  const partArtisanCents = totalCents - commissionCents;
  // Part que Stripe reprendra à l'artisan : proportionnelle au montant remboursé.
  const reprisArtisanCents = Math.round(montantCents * partArtisanCents / totalCents);
  const nouveauTotalCents = dejaCents + montantCents;
  const statut = nouveauTotalCents >= totalCents ? "rembourse" : "partiellement_rembourse";

  return { totalCents, dejaCents, restantCents, montantCents, reprisArtisanCents, nouveauTotalCents, statut };
}

// ── Solde disponible + en attente du compte Stripe de l'artisan (en centimes, EUR) ──
async function soldeArtisanCents(accountId: string): Promise<number> {
  const res = await fetch("https://api.stripe.com/v1/balance", {
    headers: { "Authorization": `Bearer ${STRIPE_SECRET_KEY}`, "Stripe-Account": accountId },
  });
  const data = await res.json();
  if (!res.ok) throw new ErreurMetier("Impossible de vérifier votre solde Stripe pour le moment. Réessayez dans un instant.", 502);
  const somme = (lignes: Array<{ amount: number; currency: string }> | undefined) =>
    (lignes || []).filter((l) => l.currency === "eur").reduce((s, l) => s + l.amount, 0);
  return somme(data.available) + somme(data.pending);
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

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Requête invalide." }, 400);
    if (!body.commande_id) return json({ error: "commande_id manquant." }, 400);
    if (typeof body.commande_id !== "string" || !REGEX_UUID.test(body.commande_id)) return json({ error: "commande_id invalide." }, 400);
    const montantDemande = lireMontant(body.montant);
    if (montantDemande === "invalide") return json({ error: "Montant à rembourser invalide." }, 400);

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: commande, error: errC } = await sb.from("commandes_catalogue")
      .select("id, nom_article, statut, paiement_statut, stripe_payment_intent_id, montant_total, commission_montant, montant_rembourse, artisans(user_id, stripe_connect_account_id)")
      .eq("id", body.commande_id).maybeSingle();
    if (errC) throw errC;
    if (!commande) return json({ error: "Commande introuvable." }, 404);

    const artisan = (commande as any).artisans;
    const estAdmin = user.email === ADMIN_EMAIL;
    const estProprietaire = artisan?.user_id === user.id;
    if (!estAdmin && !estProprietaire) return json({ error: "Vous ne pouvez pas rembourser cette commande." }, 403);

    if (!["paye", "partiellement_rembourse"].includes(commande.paiement_statut) || !commande.stripe_payment_intent_id) {
      throw new ErreurMetier("Cette commande n'a pas été payée en ligne (ou elle est déjà remboursée en totalité).");
    }

    const calc = calculerRemboursement(commande, montantDemande);

    // ── Garde-fou : l'artisan doit avoir de quoi couvrir la reprise ──
    // (l'admin peut forcer : c'est alors CaraLink qui assume la différence)
    const forcer = estAdmin && body.forcer === true;
    if (!forcer) {
      if (!artisan?.stripe_connect_account_id) throw new ErreurMetier("Compte Stripe de l'artisan introuvable.", 500);
      const solde = await soldeArtisanCents(artisan.stripe_connect_account_id);
      if (solde < calc.reprisArtisanCents) {
        throw new ErreurMetier(
          "Remboursement bloqué : le solde Stripe de l'artisan (" + euros(Math.max(solde, 0)) + ") ne couvre pas la reprise de " +
          euros(calc.reprisArtisanCents) + ". Contactez le support CaraLink pour traiter ce cas.", 409,
        );
      }
    }

    // ── Remboursement Stripe ──
    const motif = typeof body.motif === "string" ? body.motif.trim().slice(0, 400) : "";
    const params = new URLSearchParams({
      payment_intent: commande.stripe_payment_intent_id,
      amount: String(calc.montantCents),
      reverse_transfer: "true",
      reason: "requested_by_customer",
      "metadata[commande_id]": commande.id,
      "metadata[demande_par]": user.email || user.id,
    });
    if (motif) params.set("metadata[motif]", motif);

    const res = await fetch("https://api.stripe.com/v1/refunds", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
        // Même commande + même état = même clé : un double clic ne rembourse jamais deux fois.
        "Idempotency-Key": `rbk_${commande.id}_${calc.dejaCents}_${calc.montantCents}`,
      },
      body: params,
    });
    const refund = await res.json();
    if (!res.ok) {
      console.error("[rembourser-commande] Stripe a refusé le remboursement :", refund?.error?.message);
      // Le message de Stripe peut évoquer les finances de la plateforme : seul l'admin le voit.
      throw new ErreurMetier(estAdmin ? (refund?.error?.message || "Erreur Stripe lors du remboursement.") : "Stripe n'a pas pu effectuer ce remboursement. Contactez le support CaraLink.", 502);
    }

    // ── Mise à jour de la commande (le webhook charge.refunded confirmera avec les valeurs Stripe) ──
    const maj: Record<string, unknown> = {
      paiement_statut: calc.statut,
      montant_rembourse: calc.nouveauTotalCents / 100,
      rembourse_le: new Date().toISOString(),
    };
    if (motif) maj.motif_remboursement = motif;
    // Mise à jour « si rien n'a bougé entre-temps » : deux remboursements simultanés ne s'écrasent pas l'un l'autre
    // (le webhook charge.refunded rétablit les valeurs exactes de Stripe de toute façon).
    let majReq = sb.from("commandes_catalogue").update(maj).eq("id", commande.id);
    majReq = commande.montant_rembourse == null ? majReq.is("montant_rembourse", null) : majReq.eq("montant_rembourse", commande.montant_rembourse);
    const { data: majFaite, error: errMaj } = await majReq.select("id");
    if (errMaj) console.error("[rembourser-commande] Remboursement fait chez Stripe mais mise à jour base échouée :", errMaj.message);
    else if (!majFaite || majFaite.length === 0) console.warn("[rembourser-commande] La commande a changé pendant le remboursement : le webhook charge.refunded fera foi.");

    if (calc.statut === "rembourse") {
      // Commande pas encore livrée/récupérée → elle est annulée. Une commande déjà terminée garde son statut.
      await sb.from("commandes_catalogue").update({ statut: "annulee" })
        .eq("id", commande.id).in("statut", ["nouvelle", "confirmee", "prete"]);
    }

    return json({
      ok: true,
      refund_id: refund.id,
      statut: calc.statut,
      montant_rembourse: calc.montantCents / 100,
      total_rembourse: calc.nouveauTotalCents / 100,
      repris_artisan: calc.reprisArtisanCents / 100,
    });

  } catch (e) {
    if (e instanceof ErreurMetier) return json({ error: e.message }, e.status);
    console.error("[rembourser-commande]", e);
    return json({ error: MSG_ERREUR_GENERIQUE }, 500); // le détail reste dans les journaux
  }
});
