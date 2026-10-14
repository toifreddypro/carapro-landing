// ═══════════════════════════════════════════════════════════
// CaraLink Artisans — Edge Function : rembourser-prestation
// Propriété : TOI Freddy
//
// Rembourse un paiement en ligne de prestation (frais de réservation / frais de déplacement / solde demandé après la visite).
// Le remboursement part du compte Stripe de l'artisan (paiement direct) et la commission de CaraLink est rendue avec.
//
// Deux façons de l'appeler :
//  1. PAR LE SERVEUR (autres fonctions : refus de l'artisan, annulation, ménage automatique) — en-tête Authorization = clé service.
//  2. PAR L'ARTISAN connecté (bouton « Rembourser le client » de MPA) — il ne peut rembourser que SES paiements.
//
// POST { paiement_id, motif?, montant? (euros, remboursement partiel — artisan seulement), annule_par? ("client"|"artisan"|"refus"|"expiration") }
//
// Sécurité :
//  - on ne rembourse qu'un paiement réellement encaissé (« paye » ou « partiellement_rembourse ») ;
//  - jamais plus que ce qui reste à rembourser ; le montant d'un remboursement partiel est contrôlé ;
//  - clé d'idempotence Stripe : un double-clic ou un rejeu ne rembourse jamais deux fois ;
//  - le détail d'une erreur Stripe n'est jamais renvoyé au navigateur.
// ═══════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MSG_ERREUR_GENERIQUE = "Le remboursement n'a pas pu être fait. Réessayez dans un instant.";
const ORIGINES = ["client", "artisan", "refus", "expiration"];

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
function escHtml(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (m) => (({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }) as Record<string, string>)[m]);
}
const euros = (n: number) => n.toFixed(2).replace(".", ",") + " €";

async function envoyerEmail(to: string, subject: string, html: string) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "CaraLink Artisans <notifications@learnlogicstudio.com>", to: [to], subject, html }),
    });
    if (!res.ok) console.error("[rembourser-prestation] Échec envoi Resend :", await res.text());
  } catch (e) { console.error("[rembourser-prestation] Erreur envoi email :", e); }
}

async function stripePost(chemin: string, params: Record<string, string>, cle: string, compte: string) {
  const entetes: Record<string, string> = {
    "Authorization": `Bearer ${Deno.env.get("STRIPE_SECRET_KEY") ?? ""}`,
    "Content-Type": "application/x-www-form-urlencoded",
    "Idempotency-Key": cle,
    "Stripe-Account": compte,
  };
  const init: RequestInit = { method: "POST", headers: entetes, body: new URLSearchParams(params) };
  let res = await fetch(`https://api.stripe.com/v1/${chemin}`, init);
  for (let i = 1; i <= 4 && res.status === 409; i++) { await new Promise((r) => setTimeout(r, 300 * i)); res = await fetch(`https://api.stripe.com/v1/${chemin}`, init); }
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);

  try {
    const cleService = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, cleService);
    const authHeader = req.headers.get("Authorization") ?? "";
    const interne = authHeader === `Bearer ${cleService}`;

    let userId: string | null = null;
    if (!interne) {
      if (!authHeader) return json({ error: "Non authentifié." }, 401);
      const sbCaller = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
      const { data: { user } } = await sbCaller.auth.getUser();
      if (!user) return json({ error: "Session invalide." }, 401);
      userId = user.id;
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Requête invalide." }, 400);
    const { paiement_id } = body;
    if (typeof paiement_id !== "string" || !REGEX_UUID.test(paiement_id)) return json({ error: "Paiement invalide." }, 400);
    const motif = typeof body.motif === "string" ? body.motif.trim().slice(0, 300) : "";
    const annulePar = typeof body.annule_par === "string" && ORIGINES.includes(body.annule_par) ? body.annule_par : null;

    const { data: p, error } = await sb.from("paiements_prestations").select("*").eq("id", paiement_id).maybeSingle();
    if (error) throw error;
    if (!p) return json({ error: "Paiement introuvable." }, 404);

    const { data: artisan } = await sb.from("artisans").select("id, user_id, nom_entreprise, email").eq("id", p.artisan_id).maybeSingle();
    if (!interne && (!artisan || artisan.user_id !== userId)) return json({ error: "Paiement introuvable." }, 404);

    if (!["paye", "partiellement_rembourse"].includes(p.statut)) return json({ error: "Ce paiement n'est pas encaissé ou a déjà été remboursé en totalité." }, 409);
    if (!p.stripe_payment_intent_id || !p.stripe_account) return json({ error: "Ce paiement n'a pas de trace chez Stripe." }, 409);

    const totalCentimes = Math.round(Number(p.montant) * 100);
    const dejaCentimes = Math.round(Number(p.montant_rembourse || 0) * 100);
    const resteCentimes = totalCentimes - dejaCentimes;
    if (resteCentimes <= 0) return json({ error: "Ce paiement est déjà remboursé en totalité." }, 409);

    let aRembourserCentimes = resteCentimes;
    if (!interne && body.montant != null && body.montant !== "") {
      const m = Number(body.montant);
      if (!Number.isFinite(m) || m <= 0) return json({ error: "Montant invalide." }, 400);
      aRembourserCentimes = Math.round(m * 100);
      if (aRembourserCentimes > resteCentimes) return json({ error: `Vous ne pouvez pas rembourser plus de ${euros(resteCentimes / 100)}.` }, 400);
    }

    const params: Record<string, string> = {
      payment_intent: p.stripe_payment_intent_id,
      amount: String(aRembourserCentimes),
      reason: "requested_by_customer",
      "metadata[paiement_prestation_id]": p.id,
      "metadata[demande_par]": interne ? "automatique" : "artisan",
    };
    if (Number(p.commission_montant) > 0) params["refund_application_fee"] = "true"; // la commission de CaraLink est rendue au prorata
    const r = await stripePost("refunds", params, `refund-prest-${p.id}-${dejaCentimes}-${aRembourserCentimes}`, p.stripe_account);
    if (!r.ok) {
      console.error("[rembourser-prestation] Stripe a refusé le remboursement :", r.status, JSON.stringify(r.data)?.slice(0, 300));
      const msg = r.data?.error?.code === "charge_already_refunded" ? "Ce paiement est déjà remboursé." : MSG_ERREUR_GENERIQUE;
      return json({ error: msg }, 502);
    }

    const nouveauTotal = (dejaCentimes + aRembourserCentimes) / 100;
    const integral = dejaCentimes + aRembourserCentimes >= totalCentimes;
    const maj: Record<string, unknown> = {
      statut: integral ? "rembourse" : "partiellement_rembourse",
      montant_rembourse: nouveauTotal,
      rembourse_le: new Date().toISOString(),
      motif_remboursement: motif || p.motif_remboursement || null,
      updated_at: new Date().toISOString(),
    };
    if (annulePar && !p.annule_par) { maj.annule_par = annulePar; maj.annule_le = new Date().toISOString(); }
    const { error: errMaj } = await sb.from("paiements_prestations").update(maj).eq("id", p.id);
    if (errMaj) console.error("[rembourser-prestation] Remboursement fait mais base non mise à jour (le webhook la rattrapera) :", errMaj.message);

    // Le client est prévenu (email du paiement) ; jamais bloquant.
    try {
      if (p.client_email) {
        await envoyerEmail(p.client_email, `Remboursement de ${euros(aRembourserCentimes / 100)} — ${artisan?.nom_entreprise || "votre artisan"}`,
          `<div style="font-family:sans-serif;max-width:480px;">
            <h2 style="color:#16a34a;">💶 Vous êtes remboursé(e)</h2>
            <p>Bonjour ${escHtml(p.client_nom || "")}, nous avons remboursé <strong>${escHtml(euros(aRembourserCentimes / 100))}</strong>${artisan?.nom_entreprise ? ` réglés à <strong>${escHtml(artisan.nom_entreprise)}</strong>` : ""}.</p>
            ${motif && !interne ? `<p style="background:#f7f9fc;padding:10px 14px;border-radius:8px;">${escHtml(motif)}</p>` : ""}
            <p style="font-size:12.5px;color:#6b7c96;">Le remboursement apparaît sur votre carte sous quelques jours ouvrés (selon votre banque).</p>
          </div>`);
      }
    } catch (e) { console.error("[rembourser-prestation] Email client échoué :", e); }

    return json({ ok: true, rembourse: aRembourserCentimes / 100, total_rembourse: nouveauTotal, integral });
  } catch (e) {
    console.error("[rembourser-prestation]", e);
    return json({ error: MSG_ERREUR_GENERIQUE }, 500);
  }
});
