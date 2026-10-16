// ═══════════════════════════════════════════════════════════
// CaraLink Artisans — Edge Function : maintenance-reservations
// Propriété : TOI Freddy
//
// Le « ménage » quotidien des réservations payées en ligne. Appelée chaque jour par envoyer-rappels-prestations (même secret,
// même déclenchement automatique), ou à la main par l'administrateur.
//
//  1. DEMANDES NON PAYÉES : un lien de paiement de réservation non réglé au bout d'1 h est abandonné (« expiré »), le paiement Stripe
//     ouvert est annulé, la demande est classée refusée (l'artisan ne l'a de toute façon jamais vue). Un paiement de solde
//     non réglé au bout de 14 jours expire de même.
//  2. PAYÉES MAIS PAS ENCORE VISIBLES : si le webhook n'a pas pu « libérer » la demande chez l'artisan (panne), on la libère ici.
//  3. SANS RÉPONSE DE L'ARTISAN : une réservation payée que l'artisan n'a ni confirmée ni refusée au bout de 48 h — ou dont le jour
//     est arrivé — est refusée d'office et le client est REMBOURSÉ intégralement.
//  4. REMBOURSEMENTS EN ATTENTE : un refus / une annulation dont le remboursement automatique avait échoué est rejoué.
//
// Rejouable sans effet double : tout est conditionnel, et les remboursements Stripe portent une clé d'idempotence.
// ═══════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};
const ADMIN_EMAIL = "toifreddypro@gmail.com";
const CRON_SECRET = Deno.env.get("RAPPELS_CRON_SECRET");
const DECALAGE_LOCAL_MS = 4 * 3600 * 1000;
const VALIDITE_RESERVATION_MS = 60 * 60 * 1000;
const VALIDITE_SOLDE_MS = 14 * 24 * 3600 * 1000;
const DELAI_REPONSE_ARTISAN_MS = 48 * 3600 * 1000;
const DELAI_LIBERATION_MS = 10 * 60 * 1000;
const MSG_ERREUR_GENERIQUE = "Une erreur est survenue. Réessayez dans un instant.";

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
function escHtml(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (m) => (({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }) as Record<string, string>)[m]);
}
function egalConstant(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let e = 0; for (let i = 0; i < a.length; i++) e |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return e === 0;
}
async function envoyerEmail(to: string, subject: string, html: string) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "CaraLink Artisans <notifications@learnlogicstudio.com>", to: [to], subject, html }),
    });
    if (!res.ok) console.error("[maintenance-reservations] Échec envoi Resend :", await res.text());
  } catch (e) { console.error("[maintenance-reservations] Erreur envoi email :", e); }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);

  try {
    const estCron = !!CRON_SECRET && egalConstant(req.headers.get("X-Cron-Secret") ?? "", CRON_SECRET);
    if (!estCron) {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return json({ error: "Non authentifié." }, 401);
      const sbCaller = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
      const { data: { user } } = await sbCaller.auth.getUser();
      if (!user || user.email !== ADMIN_EMAIL) return json({ error: "Réservé à l'administrateur." }, 403);
    }

    const cleService = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const base = Deno.env.get("SUPABASE_URL")!;
    const sb = createClient(base, cleService);
    const appeler = async (fonction: string, corps: Record<string, unknown>) => {
      try {
        const res = await fetch(`${base}/functions/v1/${fonction}`, { method: "POST", headers: { "Authorization": `Bearer ${cleService}`, "Content-Type": "application/json" }, body: JSON.stringify(corps) });
        if (!res.ok) console.error(`[maintenance-reservations] ${fonction} a répondu ${res.status} :`, await res.text());
        return res.ok;
      } catch (e) { console.error(`[maintenance-reservations] ${fonction} injoignable :`, e); return false; }
    };
    const bilan = { expirees: 0, relances: 0, liberees: 0, sans_reponse_remboursees: 0, remboursements_rejoues: 0, erreurs: 0 };
    const maintenant = Date.now();
    const aujourdhui = new Date(maintenant - DECALAGE_LOCAL_MS).toISOString().slice(0, 10);

    // ── 1. Non payées → expirées ──
    const { data: attente } = await sb.from("paiements_prestations").select("id, type, demande_id, created_at, stripe_payment_intent_id, stripe_account, artisan_id, client_nom, montant, relances_nb").eq("statut", "en_attente");
    for (const p of attente || []) {
      try {
        const age = maintenant - new Date(p.created_at).getTime();
        if (age <= (p.type === "reservation" ? VALIDITE_RESERVATION_MS : VALIDITE_SOLDE_MS)) continue;
        const { data: ok } = await sb.from("paiements_prestations").update({ statut: "expire", annule_par: "expiration", annule_le: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq("id", p.id).eq("statut", "en_attente").select("id");
        if (!ok || !ok.length) continue;
        if (p.stripe_payment_intent_id && p.stripe_account) {
          try {
            await fetch(`https://api.stripe.com/v1/payment_intents/${encodeURIComponent(p.stripe_payment_intent_id)}/cancel`, {
              method: "POST", headers: { "Authorization": `Bearer ${Deno.env.get("STRIPE_SECRET_KEY") ?? ""}`, "Stripe-Account": p.stripe_account },
            });
          } catch (e) { console.error("[maintenance-reservations] Annulation du paiement ouvert impossible :", e); }
        }
        if (p.type === "reservation" && p.demande_id) await sb.from("demandes_devis").update({ statut: "creneau_refuse", reponse_message: "Paiement non réglé" }).eq("id", p.demande_id).eq("statut", "creneau_propose");
        bilan.expirees++;
        // Un lien de paiement (solde) qui expire sans règlement : l'artisan en est prévenu (sinon il ne verrait que le silence).
        if (p.type === "solde") {
          try {
            const { data: art } = await sb.from("artisans").select("nom_entreprise, email").eq("id", p.artisan_id).maybeSingle();
            if (art?.email) await envoyerEmail(art.email, `⌛ Paiement non réglé — ${p.client_nom || "votre client"}`,
              `<div style="font-family:sans-serif;max-width:480px;"><h2 style="color:#B5502F;">⌛ Lien de paiement expiré</h2><p>Le lien de paiement de <strong>${escHtml(Number(p.montant).toFixed(2).replace(".", ","))} €</strong> envoyé à <strong>${escHtml(p.client_nom || "votre client")}</strong> a expiré sans règlement${Number(p.relances_nb || 0) > 0 ? ` (${Number(p.relances_nb)} relance${Number(p.relances_nb) > 1 ? "s" : ""} envoyée${Number(p.relances_nb) > 1 ? "s" : ""})` : ""}.</p><p>Vous pouvez le contacter, créer un nouveau lien depuis l'intervention (« Demander un paiement »), ou marquer l'intervention « Payée » s'il a réglé autrement.</p></div>`);
          } catch (e) { console.error("[maintenance-reservations] Prévenir l'artisan (lien expiré) :", e); }
        }
      } catch (e) { bilan.erreurs++; console.error("[maintenance-reservations] Expiration :", e); }
    }

    // ── 1 bis. Relances automatiques (offre Pro) : paiements de solde non réglés, à J+3 puis J+10 ──
    // La fonction relancer-paiement refait tous les contrôles (Pro, case cochée, âge du lien, 2 relances maximum, 24 h entre deux).
    const { data: aRelancer } = await sb.from("paiements_prestations").select("id").eq("type", "solde").eq("statut", "en_attente").eq("relance_auto", true).lt("relances_nb", 2);
    for (const r of aRelancer || []) {
      try {
        const res = await fetch(`${base}/functions/v1/relancer-paiement`, { method: "POST", headers: { "Authorization": `Bearer ${cleService}`, "Content-Type": "application/json" }, body: JSON.stringify({ paiement_id: r.id, auto: true }) });
        const rep = await res.json().catch(() => ({}));
        if (!res.ok) { bilan.erreurs++; console.error("[maintenance-reservations] relancer-paiement a répondu", res.status, rep); }
        else if (!rep.ignoree) bilan.relances++;
      } catch (e) { bilan.erreurs++; console.error("[maintenance-reservations] Relance :", e); }
    }

    // ── 2 + 3. Réservations payées en attente de réponse ──
    const { data: payees } = await sb.from("paiements_prestations").select("*").eq("type", "reservation").eq("statut", "paye").not("demande_id", "is", null);
    for (const p of payees || []) {
      try {
        const { data: d } = await sb.from("demandes_devis").select("id, statut, date_intervention, heure_debut, client_nom").eq("id", p.demande_id).maybeSingle();
        if (!d || d.statut !== "creneau_propose") continue;
        const payeDepuis = maintenant - new Date(p.paye_le || p.created_at).getTime();

        const { data: visible } = await sb.from("devis_reponses").select("id").eq("demande_id", d.id).limit(1);
        if (!visible || !visible.length) {
          if (payeDepuis >= DELAI_LIBERATION_MS && await appeler("liberer-reservation", { paiement_id: p.id })) bilan.liberees++;
          continue;
        }
        // Sans réponse depuis 48 h, ou le jour du rendez-vous est arrivé : refus d'office + remboursement intégral.
        if (payeDepuis < DELAI_REPONSE_ARTISAN_MS && d.date_intervention > aujourdhui) continue;
        const { data: reclame } = await sb.from("demandes_devis").update({ statut: "creneau_refuse", reponse_message: "Sans réponse de l'artisan" }).eq("id", d.id).eq("statut", "creneau_propose").select("id");
        if (!reclame || !reclame.length) continue;
        const ok = await appeler("rembourser-prestation", { paiement_id: p.id, annule_par: "expiration", motif: "L'artisan n'a pas répondu à temps" });
        bilan.sans_reponse_remboursees++;
        const { data: art } = await sb.from("artisans").select("nom_entreprise, user_id").eq("id", p.artisan_id).maybeSingle();
        const dateAff = new Date(d.date_intervention + "T12:00:00Z").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
        if (p.client_email) {
          await envoyerEmail(p.client_email, `Votre demande n'a pas reçu de réponse — vous êtes remboursé(e)`,
            `<div style="font-family:sans-serif;max-width:480px;"><h2 style="color:#B5502F;">Pas de réponse de l'artisan</h2><p>Bonjour ${escHtml(p.client_nom || "")}, ${art?.nom_entreprise ? `<strong>${escHtml(art.nom_entreprise)}</strong> n'a pas répondu` : "l'artisan n'a pas répondu"} à votre demande de rendez-vous du <strong>${escHtml(dateAff)}</strong>.</p><p>Vous êtes <strong>remboursé(e) intégralement</strong>${ok ? "" : " (remboursement en cours de traitement)"} ; il apparaît sur votre carte sous quelques jours. Vous pouvez choisir un autre artisan ou un autre créneau sur CaraLink.</p></div>`);
        }
        if (art?.user_id) {
          const { data: u } = await sb.auth.admin.getUserById(art.user_id);
          if (u?.user?.email) await envoyerEmail(u.user.email, `⏱️ Demande expirée faute de réponse — ${d.client_nom}`,
            `<div style="font-family:sans-serif;max-width:480px;"><h2 style="color:#B5502F;">Demande expirée</h2><p>Vous n'avez ni confirmé ni refusé la demande de <strong>${escHtml(d.client_nom)}</strong> pour le <strong>${escHtml(dateAff)}</strong>. Elle a été refusée automatiquement et le client remboursé.</p><p style="font-size:12.5px;color:#6b7c96;">Pensez à répondre rapidement aux prochaines demandes : c'est ce qui fait la confiance de vos clients.</p></div>`);
        }
      } catch (e) { bilan.erreurs++; console.error("[maintenance-reservations] Réservation payée :", e); }
    }

    // ── 4. Remboursements à rejouer (refus ou annulation dont le remboursement automatique avait échoué) ──
    const { data: aRembourser } = await sb.from("paiements_prestations").select("id, demande_id, intervention_id").eq("statut", "paye").limit(200);
    for (const p of aRembourser || []) {
      try {
        let doitEtreRembourse = false;
        if (p.demande_id) {
          const { data: d } = await sb.from("demandes_devis").select("statut").eq("id", p.demande_id).maybeSingle();
          if (d?.statut === "creneau_refuse") doitEtreRembourse = true;
        }
        if (!doitEtreRembourse && p.intervention_id) {
          const { data: i } = await sb.from("mpa_artisans_interventions").select("statut, annulee_motif").eq("id", p.intervention_id).maybeSingle();
          // Annulée par l'artisan → remboursement dû. Annulée par le client hors délai gratuit → les frais restent acquis.
          if (i?.statut === "annulee" && i.annulee_motif !== "annulation_client") doitEtreRembourse = true;
        }
        if (doitEtreRembourse && await appeler("rembourser-prestation", { paiement_id: p.id, annule_par: "artisan", motif: "Rendez-vous annulé ou refusé" })) bilan.remboursements_rejoues++;
      } catch (e) { bilan.erreurs++; console.error("[maintenance-reservations] Remboursement à rejouer :", e); }
    }

    return json({ ok: true, ...bilan });
  } catch (e) {
    console.error("[maintenance-reservations]", e);
    return json({ error: MSG_ERREUR_GENERIQUE }, 500);
  }
});
