// ═══════════════════════════════════════════════════════════
// CaraLink Artisans — Edge Function : stripe-webhook-litiges
// Propriété : TOI Freddy
//
// Webhook Stripe DÉDIÉ aux litiges (charge.dispute.*) — volontairement séparé
// du webhook existant (stripe-webhook-artisans, qui gère déjà remboursements et
// cartes enregistrées) pour ne jamais risquer de casser ce qui fonctionne déjà.
// Stripe autorise plusieurs points de terminaison webhook en parallèle, chacun
// avec ses propres événements et son propre secret — c'est exactement ce schéma.
//
// Rappel du contexte (voir la discussion du 01/10) : en "destination charges",
// un litige débite TOUJOURS le solde Stripe de la plateforme (nous), jamais
// directement celui de l'artisan — même si l'argent lui a déjà été transféré.
// Ce webhook se contente d'enregistrer le litige et de prévenir l'administrateur
// — la récupération auprès de l'artisan reste une action manuelle, volontaire,
// jamais automatique (voir admin-recuperer-litige.ts).
//
// Événements écoutés :
// - charge.dispute.created : nouveau litige, jamais vu avant -> enregistrement + email
// - charge.dispute.updated : évolution (ex. passage en "besoin de réponse urgente")
// - charge.dispute.closed  : résolu (gagné/perdu/annulé) -> mise à jour du statut
// ═══════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET_LITIGES") ?? "";
// Secret temporaire, pour vérifier le branchement via `stripe trigger` (mode test) sans jamais
// toucher au vrai secret live — à retirer (variable d'environnement) une fois la vérification faite.
const STRIPE_WEBHOOK_SECRET_TEST = Deno.env.get("STRIPE_WEBHOOK_SECRET_LITIGES_TEST") ?? "";
const EMAIL_ADMIN = "toifreddypro@gmail.com";

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// Vérification manuelle de la signature Stripe (HMAC SHA-256) — pas de SDK Stripe côté Deno,
// on vérifie nous-mêmes exactement comme Stripe le documente pour les environnements non-Node.
async function verifierSignatureStripe(payloadBrut: string, enTeteSignature: string, secret: string): Promise<boolean> {
  try {
    const parties = Object.fromEntries(enTeteSignature.split(",").map((p) => p.split("=")) as [string, string][]);
    const timestamp = parties["t"];
    const signatureAttendue = parties["v1"];
    if (!timestamp || !signatureAttendue) return false;

    const payloadSigne = `${timestamp}.${payloadBrut}`;
    const cle = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
    );
    const signatureBytes = await crypto.subtle.sign("HMAC", cle, new TextEncoder().encode(payloadSigne));
    const signatureCalculee = Array.from(new Uint8Array(signatureBytes)).map((b) => b.toString(16).padStart(2, "0")).join("");
    return signatureCalculee === signatureAttendue;
  } catch (e) {
    console.error("[stripe-webhook-litiges] Erreur vérification signature :", e);
    return false;
  }
}

async function envoyerEmail(to: string, subject: string, html: string) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) { console.warn("[stripe-webhook-litiges] RESEND_API_KEY absente — email non envoyé."); return; }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "CaraLink Artisans <notifications@learnlogicstudio.com>", to: [to], subject, html }),
    });
    if (!res.ok) console.error("[stripe-webhook-litiges] Échec envoi Resend :", await res.text());
  } catch (e) { console.error("[stripe-webhook-litiges] Erreur envoi email :", e); }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);

  const payloadBrut = await req.text();
  const enTeteSignature = req.headers.get("stripe-signature") ?? "";

  if (!STRIPE_WEBHOOK_SECRET) {
    console.error("[stripe-webhook-litiges] STRIPE_WEBHOOK_SECRET_LITIGES manquante.");
    return json({ error: "Configuration serveur incomplète." }, 500);
  }
  var signatureValide = await verifierSignatureStripe(payloadBrut, enTeteSignature, STRIPE_WEBHOOK_SECRET);
  if (!signatureValide && STRIPE_WEBHOOK_SECRET_TEST) {
    signatureValide = await verifierSignatureStripe(payloadBrut, enTeteSignature, STRIPE_WEBHOOK_SECRET_TEST);
  }
  if (!signatureValide) {
    console.error("[stripe-webhook-litiges] Signature Stripe invalide — requête rejetée.");
    return json({ error: "Signature invalide." }, 400);
  }

  let event: any;
  try {
    event = JSON.parse(payloadBrut);
  } catch {
    return json({ error: "Payload JSON invalide." }, 400);
  }

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    if (event.type === "charge.dispute.created") {
      const dispute = event.data.object;

      // Relier au bon artisan via la commande associée au payment_intent de ce litige.
      const { data: commande } = await sb.from("commandes_catalogue")
        .select("id, artisan_id, artisans(nom_entreprise, email)")
        .eq("stripe_payment_intent_id", dispute.payment_intent)
        .maybeSingle();

      const { error: errIns } = await sb.from("litiges_stripe").insert({
        commande_id: commande?.id ?? null,
        artisan_id: commande?.artisan_id ?? null,
        stripe_dispute_id: dispute.id,
        stripe_charge_id: dispute.charge,
        stripe_payment_intent_id: dispute.payment_intent,
        montant: dispute.amount / 100,
        devise: dispute.currency,
        motif: dispute.reason,
        statut: dispute.status,
        date_echeance_reponse: dispute.evidence_details?.due_by ? new Date(dispute.evidence_details.due_by * 1000).toISOString() : null,
      });
      if (errIns) throw errIns;

      const artisanInfos = (commande as any)?.artisans;
      const dateLimite = dispute.evidence_details?.due_by
        ? new Date(dispute.evidence_details.due_by * 1000).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
        : "non précisée";
      const html = `<div style="font-family:sans-serif;max-width:520px;">
        <h2 style="color:#B3261E;">⚠️ Nouveau litige Stripe — ${(dispute.amount / 100).toFixed(2)} €</h2>
        <p><strong>Artisan :</strong> ${artisanInfos?.nom_entreprise ?? "non identifié"}</p>
        <p><strong>Motif indiqué par la banque :</strong> ${dispute.reason}</p>
        <p><strong>Date limite pour répondre à Stripe :</strong> ${dateLimite}</p>
        <p style="margin-top:16px;">Répondez directement dans le <a href="https://dashboard.stripe.com/disputes/${dispute.id}" style="color:#B5502F;font-weight:700;">Dashboard Stripe</a> avant cette date, sans quoi le litige est automatiquement perdu.</p>
        <p style="margin-top:12px;"><a href="https://caralink.app/artisans/admin.html" style="color:#B5502F;font-weight:700;">Voir dans Admin →</a></p>
      </div>`;
      await envoyerEmail(EMAIL_ADMIN, `⚠️ Litige Stripe (${(dispute.amount / 100).toFixed(2)} €) — réponse avant le ${dateLimite}`, html);

    } else if (event.type === "charge.dispute.updated" || event.type === "charge.dispute.closed") {
      const dispute = event.data.object;
      const { error: errMaj } = await sb.from("litiges_stripe").update({
        statut: dispute.status,
        updated_at: new Date().toISOString(),
      }).eq("stripe_dispute_id", dispute.id);
      if (errMaj) throw errMaj;
    }

    return json({ received: true });

  } catch (e) {
    console.error("[stripe-webhook-litiges]", e);
    return json({ error: (e as Error).message }, 500);
  }
});
