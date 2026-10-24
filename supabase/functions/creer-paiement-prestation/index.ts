// ═══════════════════════════════════════════════════════════
// CaraLink Artisans — Edge Function : creer-paiement-prestation
// Propriété : TOI Freddy
//
// Prépare le paiement en ligne d'une prestation, SUR LE COMPTE STRIPE DE L'ARTISAN (paiement direct, comme les commandes de la boutique) :
//  - « reservation » : frais de réservation (ou frais de déplacement d'une visite) payés par le client AVANT que l'artisan ne voie sa demande ;
//  - « solde » : montant demandé par l'artisan après la visite / la prestation (« Demander un paiement »).
// Le client n'a pas de compte : c'est le JETON de son lien (paiements_prestations.token) qui prouve qu'il est bien le destinataire.
//
// POST { token, action: "infos" }
//   → de quoi afficher la page de paiement (montant, artisan, créneau, conditions à accepter). Ne crée rien.
// POST { token, action: "payer", accepte: true }
//   → crée (ou réutilise) le Payment Intent Stripe et renvoie { client_secret, stripe_account }.
//     Pour une réservation, le client doit avoir accepté les conditions : la date et le TEXTE EXACT sont conservés comme preuve.
//
// Sécurité (fonction PUBLIQUE) :
//  - le montant, la commission et le compte Stripe viennent TOUJOURS de la base, jamais de la page ;
//  - un paiement déjà réglé, remboursé, annulé ou expiré n'est jamais repayé ; un lien de réservation expire au bout de 60 minutes ;
//  - UN SEUL paiement Stripe actif par ligne (réutilisé si même montant, clé d'idempotence contre les doubles appels) ;
//  - compte Stripe de l'artisan contrôlé (modèle « paiements directs » : Stripe porte les pertes, frais Stripe à la charge de l'artisan) ;
//  - commission : 7 % au-dessus de 200 € par mois sur le canal « prestations » (le prélèvement mensuel tient compte de ce qui est déjà commissionné ici), le mois commençant à l'heure de la Guadeloupe.
// ═══════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;
const TAUX_COMMISSION = 0.07;
const SEUIL_GRATUIT_EUROS = 200;
const DECALAGE_LOCAL_MS = 4 * 3600 * 1000; // Guadeloupe = UTC-4
const MONTANT_MINIMUM_CENTIMES = 50;
const VALIDITE_LIEN_RESERVATION_MS = 60 * 60 * 1000; // une demande non payée en 1 h est abandonnée
const VALIDITE_LIEN_SOLDE_MS = 14 * 24 * 3600 * 1000;
const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MSG_ERREUR_GENERIQUE = "Le paiement n'a pas pu être préparé. Réessayez dans un instant, ou contactez l'artisan.";

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

const euros = (n: number) => n.toFixed(2).replace(".", ",") + " €";

function calculerCommissionAvecSeuil(montantCentimes: number, dejaFactureCentimes: number, seuilCentimes: number, taux: number): number {
  const placeSousLeSeuil = Math.max(0, seuilCentimes - dejaFactureCentimes);
  const sousLeSeuil = Math.min(montantCentimes, placeSousLeSeuil);
  return Math.round((montantCentimes - sousLeSeuil) * taux);
}

// CA net des prestations payées en ligne depuis le 1er du mois (Guadeloupe), remboursements déduits. Un seul seuil de 200 € pour le canal
// « prestations » (le même que le prélèvement mensuel des prestations payées hors ligne, voir prelever-commission-prestations).
async function dejaFactureCeMoisCentimes(sb: any, artisanId: string, sauf?: string): Promise<number> {
  const local = new Date(Date.now() - DECALAGE_LOCAL_MS);
  const debutMois = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) + DECALAGE_LOCAL_MS).toISOString();
  const net = (m: any, r: any) => Math.round(Math.max(0, Number(m || 0) - Number(r || 0)) * 100);
  const { data: pre, error } = await sb.from("paiements_prestations").select("id, montant, montant_rembourse")
    .eq("artisan_id", artisanId).in("statut", ["paye", "partiellement_rembourse", "rembourse"]).gte("paye_le", debutMois);
  if (error) throw error;
  let total = 0;
  for (const p of pre || []) if (p.id !== sauf) total += net(p.montant, p.montant_rembourse);
  return total;
}

async function fetchAvecReprise(url: string, init: RequestInit): Promise<Response> {
  let res = await fetch(url, init);
  for (let i = 1; i <= 4 && res.status === 409; i++) { await new Promise((r) => setTimeout(r, 300 * i)); res = await fetch(url, init); }
  return res;
}
async function stripeCall(path: string, params: Record<string, string>, cle?: string, compte?: string) {
  const headers: Record<string, string> = { "Authorization": `Bearer ${STRIPE_SECRET_KEY}`, "Content-Type": "application/x-www-form-urlencoded" };
  if (cle) headers["Idempotency-Key"] = cle;
  if (compte) headers["Stripe-Account"] = compte;
  const res = await fetchAvecReprise(`https://api.stripe.com/v1/${path}`, { method: "POST", headers, body: new URLSearchParams(params) });
  const data = await res.json();
  if (!res.ok) { const e: any = new Error(data?.error?.message || "Erreur Stripe"); e.stripeCode = data?.error?.code || data?.error?.type; throw e; }
  return data;
}
async function stripeGet(path: string, compte?: string) {
  const headers: Record<string, string> = { "Authorization": `Bearer ${STRIPE_SECRET_KEY}` };
  if (compte) headers["Stripe-Account"] = compte;
  const res = await fetch(`https://api.stripe.com/v1/${path}`, { headers });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

function dateFr(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso + "T12:00:00Z");
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}

// Les deux phrases que le client coche — écrites ICI (une seule source) et conservées telles quelles comme preuve.
function conditionsReservation(montant: number, heures: number, type: string | null, nomArtisan: string, delaiDejaPasse = false): string[] {
  const nature = type === "visite" ? "frais de déplacement" : "frais de réservation";
  const politique = heures > 0 && delaiDejaPasse
    ? `Ce rendez-vous a lieu dans moins de ${heures} h : l'annulation gratuite n'est donc plus possible pour ce créneau. Si j'annule, les ${nature} (${euros(montant)}) restent acquis à ${nomArtisan}.`
    : heures > 0
    ? `Annulation gratuite jusqu'à ${heures} h avant le rendez-vous : je suis alors remboursé(e) intégralement. Passé ce délai, les ${nature} (${euros(montant)}) restent acquis à ${nomArtisan}.`
    : `Aucune annulation gratuite n'est prévue : les ${nature} (${euros(montant)}) restent acquis à ${nomArtisan} si j'annule.`;
  return [
    `${politique} Si ${nomArtisan} annule, refuse ou ne peut pas honorer le rendez-vous, je suis remboursé(e) intégralement.`,
    "Je demande que la prestation puisse commencer avant la fin du délai de rétractation de 14 jours. Je reconnais qu'une fois la prestation pleinement exécutée, je ne peux plus me rétracter ; si je me rétracte avant la fin, je paierai un montant proportionnel à ce qui a été fourni.",
  ];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Requête invalide." }, 400);
    const { token, action } = body;
    if (typeof token !== "string" || !REGEX_UUID.test(token)) return json({ error: "Ce lien est incomplet ou incorrect." }, 404);
    if (action !== "infos" && action !== "payer") return json({ error: "Requête invalide." }, 400);

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: p, error } = await sb.from("paiements_prestations").select("*").eq("token", token).maybeSingle();
    if (error) throw error;
    if (!p) return json({ error: "Ce lien de paiement n'existe pas ou n'est plus valable." }, 404);

    const { data: artisan, error: errA } = await sb.from("artisans")
      .select("id, nom_entreprise, stripe_connect_account_id, stripe_connect_statut").eq("id", p.artisan_id).maybeSingle();
    if (errA) throw errA;
    if (!artisan) return json({ error: "Artisan introuvable." }, 404);

    let demande: any = null;
    if (p.demande_id) {
      const { data: d } = await sb.from("demandes_devis").select("date_intervention, heure_debut, adresse, type_intervention").eq("id", p.demande_id).maybeSingle();
      demande = d;
    }

    const validiteMs = p.type === "reservation" ? VALIDITE_LIEN_RESERVATION_MS : VALIDITE_LIEN_SOLDE_MS;
    const expire = p.statut === "en_attente" && Date.now() - new Date(p.created_at).getTime() > validiteMs;
    const statutEffectif = expire ? "expire" : p.statut;
    const montant = Number(p.montant);
    const heures = Number(p.annulation_gratuite_heures ?? 0);
    // Si le rendez-vous est déjà plus proche que le délai d'annulation gratuite, on le dit AVANT le paiement (la case cochée sert de preuve).
    const debutRdv = demande?.date_intervention ? new Date(`${demande.date_intervention}T${String(demande.heure_debut || "00:00").slice(0, 5)}:00-04:00`).getTime() : NaN;
    const delaiGratuitDejaPasse = heures > 0 && Number.isFinite(debutRdv) && Date.now() > debutRdv - heures * 3600 * 1000;
    const conditions = p.type === "reservation" ? conditionsReservation(montant, heures, demande?.type_intervention ?? null, artisan.nom_entreprise, delaiGratuitDejaPasse) : [];

    if (action === "infos") {
      return json({
        type: p.type, statut: statutEffectif, montant, artisan: artisan.nom_entreprise,
        client_nom: p.client_nom, description: p.description,
        date_affichee: demande?.date_intervention ? dateFr(demande.date_intervention) : null,
        heure: demande?.heure_debut ? String(demande.heure_debut).slice(0, 5) : null,
        nature: demande?.type_intervention === "visite" ? "frais de déplacement" : "frais de réservation",
        annulation_gratuite_heures: heures, conditions,
      });
    }

    // ── action « payer » ──
    if (statutEffectif !== "en_attente") {
      const msg = statutEffectif === "expire" ? (p.type === "solde" ? `Ce lien a expiré. Contactez ${artisan.nom_entreprise} : il pourra vous envoyer un nouveau lien.` : "Ce lien a expiré. Refaites votre demande depuis la fiche de l'artisan.")
        : (["paye", "partiellement_rembourse", "rembourse"].includes(statutEffectif) ? "Ce paiement a déjà été réglé." : "Ce paiement a été annulé.");
      return json({ error: msg }, 409);
    }
    if (p.type === "reservation") {
      if (body.accepte !== true) return json({ error: "Merci de cocher les deux cases pour continuer." }, 400);
      if (demande?.date_intervention) {
        const aujourdhui = new Date(Date.now() - DECALAGE_LOCAL_MS).toISOString().slice(0, 10);
        if (demande.date_intervention < aujourdhui) return json({ error: "Ce créneau est passé. Refaites une demande." }, 410);
      }
    }
    if (!artisan.stripe_connect_account_id || artisan.stripe_connect_statut !== "actif") {
      return json({ error: "Cet artisan ne peut pas encaisser en ligne pour le moment." }, 400);
    }
    const compte: string = artisan.stripe_connect_account_id;
    const compteStripe = await stripeGet(`accounts/${encodeURIComponent(compte)}`);
    if (!compteStripe.ok || compteStripe.data?.controller?.losses?.payments !== "stripe" || compteStripe.data?.controller?.fees?.payer !== "account") {
      console.error("[creer-paiement-prestation] compte non conforme au modèle paiements directs", artisan.id);
      return json({ error: "Cet artisan doit réactiver ses paiements en ligne." }, 400);
    }

    const montantCentimes = Math.round(montant * 100);
    if (!Number.isFinite(montantCentimes) || montantCentimes < MONTANT_MINIMUM_CENTIMES) return json({ error: "Montant invalide." }, 400);

    // Un seul paiement actif : on réutilise celui qui est ouvert pour le même montant.
    const ancienId = p.stripe_payment_intent_id as string | null;
    if (ancienId) {
      const ancien = await stripeGet(`payment_intents/${encodeURIComponent(ancienId)}`, compte);
      if (ancien.ok) {
        const st = ancien.data?.status;
        if (st === "succeeded") return json({ error: "Ce paiement a déjà été réglé." }, 409);
        if (st === "processing") return json({ error: "Un paiement est déjà en cours. Patientez quelques instants." }, 409);
        if (["requires_payment_method", "requires_confirmation", "requires_action"].includes(st)) {
          if (ancien.data.amount === montantCentimes && ancien.data.client_secret) return json({ client_secret: ancien.data.client_secret, stripe_account: compte });
          try { await stripeCall(`payment_intents/${encodeURIComponent(ancienId)}/cancel`, {}, undefined, compte); } catch (e) { console.error("[creer-paiement-prestation] Annulation de l'ancien paiement impossible :", e); }
        }
      }
    }

    const dejaFacture = await dejaFactureCeMoisCentimes(sb, p.artisan_id, p.id);
    const commission = Math.min(calculerCommissionAvecSeuil(montantCentimes, dejaFacture, SEUIL_GRATUIT_EUROS * 100, TAUX_COMMISSION), montantCentimes);

    const params: Record<string, string> = {
      amount: String(montantCentimes),
      currency: "eur",
      "automatic_payment_methods[enabled]": "true",
      "metadata[paiement_prestation_id]": p.id,
      "metadata[artisan_id]": p.artisan_id,
      "metadata[type]": p.type,
      "description": `${p.type === "reservation" ? (demande?.type_intervention === "visite" ? "Frais de déplacement" : "Frais de réservation (déduits du prix final de l'intervention)") : "Paiement de prestation"} — ${artisan.nom_entreprise}`,
    };
    if (p.client_email) params["receipt_email"] = p.client_email;
    if (commission > 0) params["application_fee_amount"] = String(commission);
    const intent = await stripeCall("payment_intents", params, `paiement-prestation_${p.id}_${montantCentimes}_${ancienId ?? "aucun"}`, compte);

    const maj: Record<string, unknown> = {
      stripe_payment_intent_id: intent.id, stripe_account: compte, commission_montant: commission / 100, updated_at: new Date().toISOString(),
    };
    if (p.type === "reservation") { maj.conditions_acceptees_le = new Date().toISOString(); maj.conditions_texte = conditions.join("\n\n"); }
    const { error: errMaj } = await sb.from("paiements_prestations").update(maj).eq("id", p.id).eq("statut", "en_attente");
    if (errMaj) {
      console.error("[creer-paiement-prestation] Mise à jour impossible :", errMaj.message);
      try { await stripeCall(`payment_intents/${encodeURIComponent(intent.id)}/cancel`, {}, undefined, compte); } catch (e) { console.error("[creer-paiement-prestation] Annulation impossible :", e); }
      throw new Error("Mise à jour du paiement impossible.");
    }
    return json({ client_secret: intent.client_secret, stripe_account: compte });

  } catch (e) {
    console.error("[creer-paiement-prestation]", e);
    if ((e as any)?.stripeCode === "idempotency_error") return json({ error: "Votre paiement est en cours de préparation. Patientez un instant puis réessayez." }, 409);
    return json({ error: MSG_ERREUR_GENERIQUE }, 500);
  }
});
