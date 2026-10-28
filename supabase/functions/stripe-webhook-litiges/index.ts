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
// (14/10) PAIEMENTS DIRECTS : les nouvelles ventes se paient SUR LE COMPTE STRIPE DE L'ARTISAN. Leurs litiges arrivent donc par un point
// de terminaison « comptes connectés » (secret STRIPE_WEBHOOK_SECRET_LITIGES_CONNECT, événement porteur de « event.account »). Dans ce cas :
//  - c'est l'ARTISAN qui répond au litige depuis son espace Stripe, et Stripe (pas CaraLink) porte la perte si son solde ne suffit pas :
//    l'artisan est prévenu par email, et l'administrateur reçoit seulement une information (rien à avancer, rien à répondre à sa place) ;
//  - le litige n'est enregistré que si le compte de l'événement est bien celui de l'artisan de la commande.
//  Les litiges de l'ancien modèle (sans event.account) gardent exactement le comportement d'origine.
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
// Secret du point de terminaison « comptes connectés » (litiges des paiements directs).
const STRIPE_WEBHOOK_SECRET_CONNECT = Deno.env.get("STRIPE_WEBHOOK_SECRET_LITIGES_CONNECT") ?? "";
const EMAIL_ADMIN = "toifreddypro@gmail.com";

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// Vérification manuelle de la signature Stripe (HMAC SHA-256) — pas de SDK Stripe côté Deno.
// Durcie (audit sécurité 28/10) : message de plus de 5 minutes refusé (un message intercepté ne peut pas être rejoué),
// comparaison à temps constant, et TOUTES les signatures « v1 » sont acceptées (Stripe en envoie plusieurs quand un secret est renouvelé).
const TOLERANCE_SIGNATURE_SECONDES = 300;
function egalConstant(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let ecart = 0;
  for (let i = 0; i < a.length; i++) ecart |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return ecart === 0;
}
async function verifierSignatureStripe(payloadBrut: string, enTeteSignature: string, secret: string): Promise<boolean> {
  try {
    if (!secret) return false;
    let timestamp = "";
    const signatures: string[] = [];
    for (const part of enTeteSignature.split(",")) {
      const i = part.indexOf("=");
      if (i < 0) continue;
      const cle = part.slice(0, i).trim();
      const valeur = part.slice(i + 1).trim();
      if (cle === "t") timestamp = valeur;
      else if (cle === "v1") signatures.push(valeur);
    }
    if (!timestamp || !signatures.length) return false;
    const t = Number(timestamp);
    if (!Number.isFinite(t) || Math.abs(Date.now() / 1000 - t) > TOLERANCE_SIGNATURE_SECONDES) return false;

    const payloadSigne = `${timestamp}.${payloadBrut}`;
    const cle = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
    );
    const signatureBytes = await crypto.subtle.sign("HMAC", cle, new TextEncoder().encode(payloadSigne));
    const signatureCalculee = Array.from(new Uint8Array(signatureBytes)).map((b) => b.toString(16).padStart(2, "0")).join("");
    return signatures.some((sg) => egalConstant(sg, signatureCalculee));
  } catch (e) {
    console.error("[stripe-webhook-litiges] Erreur vérification signature :", e);
    return false;
  }
}

// Tout ce qui vient d'un visiteur ou d'un artisan est échappé avant d'entrer dans un email HTML : sinon un nom
// ou une note contenant du HTML (faux lien, faux bouton) serait envoyé tel quel, depuis l'adresse de la plateforme.
function escHtml(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (m) => (({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }) as Record<string, string>)[m]);
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
  if (!signatureValide && STRIPE_WEBHOOK_SECRET_CONNECT) {
    signatureValide = await verifierSignatureStripe(payloadBrut, enTeteSignature, STRIPE_WEBHOOK_SECRET_CONNECT);
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

  // Litige d'un paiement direct : l'événement vient du compte Stripe de l'artisan.
  const compteEvenement: string | null = typeof event.account === "string" && event.account ? event.account : null;

  try {
    if (event.type === "charge.dispute.created") {
      const dispute = event.data.object;

      // Relier au bon artisan via la commande associée au payment_intent de ce litige.
      const { data: commande } = await sb.from("commandes_catalogue")
        .select("id, artisan_id, artisans(nom_entreprise, email, stripe_connect_account_id)")
        .eq("stripe_payment_intent_id", dispute.payment_intent)
        .maybeSingle();

      // Un compte Stripe ne peut déclarer un litige que sur les commandes de SON artisan.
      if (compteEvenement && (commande as any)?.artisans?.stripe_connect_account_id !== compteEvenement) {
        console.error("[stripe-webhook-litiges] Litige venant d'un compte sans commande correspondante :", compteEvenement, dispute.id);
        await envoyerEmail(EMAIL_ADMIN, "⚠️ Litige Stripe d'un compte non rattaché à une commande",
          `<div style="font-family:sans-serif;max-width:520px;"><p>Litige ${escHtml(dispute.id)} (${(dispute.amount / 100).toFixed(2)} €) reçu du compte ${escHtml(compteEvenement)}, sans commande correspondante chez CaraLink. Rien n'a été enregistré : vérifiez dans le Dashboard Stripe.</p></div>`);
        return json({ received: true });
      }

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
      if (errIns && (errIns as any).code !== "23505") throw errIns; // 23505 : litige déjà enregistré (événement rejoué) — pas une erreur

      const artisanInfos = (commande as any)?.artisans;
      const dateLimite = dispute.evidence_details?.due_by
        ? new Date(dispute.evidence_details.due_by * 1000).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
        : "non précisée";
      if (compteEvenement) {
        // PAIEMENT DIRECT : c'est l'artisan qui répond, Stripe porte la perte éventuelle. L'artisan est prévenu ; l'administrateur est seulement informé.
        const art = (commande as any)?.artisans;
        const htmlArtisan = `<div style="font-family:sans-serif;max-width:520px;">
          <h2 style="color:#B3261E;">⚠️ Litige ouvert sur une de vos ventes — ${(dispute.amount / 100).toFixed(2)} €</h2>
          <p>Le client (ou sa banque) conteste un paiement reçu sur votre compte Stripe. <strong>C'est à vous de répondre</strong>, depuis votre espace Stripe, avant le <strong>${dateLimite}</strong> : sans réponse, le litige est perdu et le montant est repris sur votre solde Stripe (des frais de litige s'y ajoutent).</p>
          <p><strong>Motif indiqué par la banque :</strong> ${escHtml(dispute.reason)}</p>
          <p>Joignez les preuves utiles (commande, échanges avec le client, preuve de retrait ou de livraison).</p>
          <p style="margin-top:16px;"><a href="https://connect.stripe.com/express_login" style="color:#B5502F;font-weight:700;">Ouvrir mon espace Stripe →</a></p>
          <p style="margin-top:12px;color:#666;font-size:12.5px;">Besoin d'aide ? Répondez à cet email.</p>
        </div>`;
        if (art?.email) await envoyerEmail(art.email, `⚠️ Litige sur une de vos ventes (${(dispute.amount / 100).toFixed(2)} €) — réponse avant le ${dateLimite}`, htmlArtisan);
        await envoyerEmail(EMAIL_ADMIN, `ℹ️ Litige chez ${art?.nom_entreprise ?? "un artisan"} (${(dispute.amount / 100).toFixed(2)} €) — à lui de répondre`,
          `<div style="font-family:sans-serif;max-width:520px;"><p><strong>${escHtml(art?.nom_entreprise ?? "Artisan non identifié")}</strong> a un litige de <strong>${(dispute.amount / 100).toFixed(2)} €</strong> (motif : ${escHtml(dispute.reason)}), à répondre avant le ${dateLimite}.</p>
          <p>Paiement direct : l'artisan a été prévenu par email et répond lui-même ; Stripe porte la perte si son solde ne suffit pas. <strong>Rien à avancer ni à répondre de ta part</strong> ; pense simplement à vérifier qu'il agit.</p></div>`);
        return json({ received: true });
      }

      const html = `<div style="font-family:sans-serif;max-width:520px;">
        <h2 style="color:#B3261E;">⚠️ Nouveau litige Stripe — ${(dispute.amount / 100).toFixed(2)} €</h2>
        <p><strong>Artisan :</strong> ${escHtml(artisanInfos?.nom_entreprise ?? "non identifié")}</p>
        <p><strong>Motif indiqué par la banque :</strong> ${escHtml(dispute.reason)}</p>
        <p><strong>Date limite pour répondre à Stripe :</strong> ${dateLimite}</p>
        <p style="margin-top:16px;">Répondez directement dans le <a href="https://dashboard.stripe.com/disputes/${encodeURIComponent(String(dispute.id))}" style="color:#B5502F;font-weight:700;">Dashboard Stripe</a> avant cette date, sans quoi le litige est automatiquement perdu.</p>
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
