// ═══════════════════════════════════════════════════════════
// CaraLink Artisans — Edge Function : stripe-webhook-artisans
// Propriété : TOI Freddy
//
// Reçoit les événements Stripe pour les abonnements MPA Artisans, les
// paiements de commandes, et l'activation des comptes Connect des
// artisans. Deux points d'entrée Stripe distincts pointent ici (un
// webhook standard + un webhook "Connect"), chacun avec son propre
// secret de signature — d'où les deux secrets vérifiés ci-dessous.
//
// PLAN ESSENTIEL / PRO : la colonne "plan" (gratuit / pro / pro_offert) est la
// seule source de vérité pour savoir si un artisan a accès aux fonctions Pro.
// Ce webhook la met à jour d'après l'état de l'abonnement Stripe, avec deux
// garde-fous :
//  - il ne touche JAMAIS à "pro_offert" (un testeur gardera son Pro même si
//    un ancien abonnement Stripe expire) ;
//  - un abonnement qui se termine ne fait redescendre l'artisan en gratuit que
//    s'il s'agit de SON abonnement courant — la fin d'un vieil abonnement mis
//    en pause ne doit jamais retirer le Pro de quelqu'un qui en a un nouveau.
//
// ── Révision du 07/10/2026 ──────────────────────────────────
// 1. PAS DE PAIEMENT PERDU : si la base échoue, on répond une ERREUR à Stripe (qui réessaie pendant plusieurs jours) au lieu de
//    répondre « reçu » ; tous les traitements sont rejouables sans effet double.
// 2. UN ÉCHEC TARDIF N'ÉCRASE PLUS UN PAIEMENT RÉUSSI (Stripe ne garantit pas l'ordre des événements).
// 3. UN SUCCÈS REJOUÉ NE FAIT PLUS RECULER UNE COMMANDE (« prête » ne redevient jamais « confirmée »).
// 4. SIGNATURE : refus au-delà de 5 minutes (anti-rejeu), comparaison à temps constant, plusieurs signatures acceptées.
// 5. CARTE DE COMMISSION : « enregistrée » seulement si Stripe a bien accepté de la définir par défaut.
// 6. COMMANDE PAYÉE = COMMANDE QUI EXISTE : pour les commandes créées avec paiement_requis = vrai, c'est ICI (au paiement réussi, une
//    seule fois) que le stock est retiré et que l'artisan est prévenu. Si le dernier exemplaire a été pris entre-temps, le client
//    est remboursé automatiquement.
// 7. DOUBLE ABONNEMENT : si un artisan a déjà un abonnement Pro en cours, le second est annulé et l'administrateur est prévenu.
//
// ── Révision du 14/10/2026 : PAIEMENTS DIRECTS ──────────────
// Les paiements des commandes se font désormais SUR LE COMPTE STRIPE DE L'ARTISAN (direct charges). Leurs événements
// (payment_intent.*, charge.refunded) arrivent par le webhook « Connect » et portent « event.account » = le compte de l'artisan.
//  - les remboursements automatiques (rupture de stock, paiement en double) se font sur ce compte (en-tête Stripe-Account), sans
//    « reverse_transfer » (il n'y a plus de transfert à reprendre) ;
//  - un événement venant d'un compte Stripe n'est pris en compte que si ce compte est bien celui de l'artisan de la commande ;
//  - les anciennes commandes (paiement sur CaraLink, sans event.account) continuent d'être traitées comme avant.
// ═══════════════════════════════════════════════════════════

// ── Révision du 15/10/2026 : PAIEMENTS DE PRESTATIONS ───────
// Les frais de réservation / de déplacement payés à la réservation, et les paiements demandés après la visite (« Demander un paiement »),
// sont des paiements directs sur le compte de l'artisan, repérés par « metadata.paiement_prestation_id » (table paiements_prestations).
//  - payé : la ligne passe à « paye » (une seule fois) ; pour une réservation, la demande est alors « libérée » chez l'artisan
//    (fonction liberer-reservation, rejouable : si elle échoue, on répond une erreur et Stripe réessaie) ;
//  - payé APRÈS une annulation ou une expiration : remboursé automatiquement ;
//  - payé en double (deux cartes) : le second est remboursé ;
//  - remboursements (faits ici, depuis MPA ou dans le Dashboard Stripe) : la ligne est mise à jour d'après les montants de Stripe.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET_ARTISANS");
const STRIPE_WEBHOOK_SECRET_CONNECT = Deno.env.get("STRIPE_WEBHOOK_SECRET_ARTISANS_CONNECT");
const ADMIN_EMAIL = "toifreddypro@gmail.com";
const TOLERANCE_SIGNATURE_SECONDES = 300;
const STATUTS_PAYES = ["paye", "partiellement_rembourse", "rembourse"];

const sbAdmin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

function escHtml(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

// Une erreur de base de données interrompt le traitement : on répond 500, Stripe réessaie plus tard.
function lever(error: { message: string } | null | undefined, contexte: string) {
  if (error) throw new Error(`${contexte} : ${error.message}`);
}

// ── Signature Stripe ────────────────────────────────────────

function egalConstant(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let ecart = 0;
  for (let i = 0; i < a.length; i++) ecart |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return ecart === 0;
}

// Vérification de signature Stripe sans dépendance externe (HMAC SHA-256, comme le fait le SDK Stripe) :
// refuse un message de plus de 5 minutes (un message intercepté ne peut pas être rejoué), compare à temps constant,
// accepte plusieurs signatures (Stripe en envoie plusieurs quand un secret est renouvelé).
async function verifierSignature(payload: string, sigHeader: string, secret: string | undefined, maintenantMs = Date.now()): Promise<boolean> {
  if (!secret) return false;
  let timestamp = "";
  const signatures: string[] = [];
  for (const part of sigHeader.split(",")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const cle = part.slice(0, i).trim();
    const valeur = part.slice(i + 1).trim();
    if (cle === "t") timestamp = valeur;
    else if (cle === "v1") signatures.push(valeur);
  }
  if (!timestamp || !signatures.length) return false;
  const t = Number(timestamp);
  if (!Number.isFinite(t) || Math.abs(maintenantMs / 1000 - t) > TOLERANCE_SIGNATURE_SECONDES) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sigBytes = await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${payload}`));
  const calculee = Array.from(new Uint8Array(sigBytes)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return signatures.some((s) => egalConstant(s, calculee));
}

// Essaie les deux secrets — l'un des deux endpoints Stripe a forcément signé avec l'un des deux.
async function verifierSignatureMultiple(payload: string, sigHeader: string): Promise<boolean> {
  if (await verifierSignature(payload, sigHeader, STRIPE_WEBHOOK_SECRET)) return true;
  if (await verifierSignature(payload, sigHeader, STRIPE_WEBHOOK_SECRET_CONNECT)) return true;
  return false;
}

// ── Appels Stripe et emails ─────────────────────────────────

async function stripeApi(methode: string, chemin: string, corps?: URLSearchParams, cleIdempotence?: string, compteConnecte?: string | null) {
  const entetes: Record<string, string> = { "Authorization": `Bearer ${Deno.env.get("STRIPE_SECRET_KEY") ?? ""}` };
  if (compteConnecte) entetes["Stripe-Account"] = compteConnecte; // agir sur le compte de l'artisan (paiements directs)
  if (corps) entetes["Content-Type"] = "application/x-www-form-urlencoded";
  if (cleIdempotence) entetes["Idempotency-Key"] = cleIdempotence;
  const init: RequestInit = { method: methode, headers: entetes, body: corps };
  let res = await fetch(`https://api.stripe.com/v1/${chemin}`, init);
  for (let i = 1; i <= 4 && res.status === 409; i++) { // conflit d'idempotence : on réessaie un instant plus tard
    await new Promise((r) => setTimeout(r, 300 * i));
    res = await fetch(`https://api.stripe.com/v1/${chemin}`, init);
  }
  let data: any = null;
  try { data = await res.json(); } catch { /* corps vide ou illisible */ }
  return { ok: res.ok, status: res.status, data };
}

async function envoyerEmail(to: string, subject: string, html: string): Promise<boolean> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) { console.warn("[stripe-webhook-artisans] RESEND_API_KEY absente — email non envoyé."); return false; }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({ from: "CaraLink Artisans <notifications@learnlogicstudio.com>", to: [to], subject, html }),
    });
    if (!res.ok) console.error("[stripe-webhook-artisans] Échec envoi Resend :", await res.text());
    return res.ok;
  } catch (e) {
    console.error("[stripe-webhook-artisans] Échec envoi Resend :", e);
    return false;
  }
}

async function alerterAdmin(sujet: string, lignes: string[]) {
  const html = `<div style="font-family:sans-serif;max-width:520px;"><h3 style="color:#B5502F;">${escHtml(sujet)}</h3>${lignes.map((l) => `<p>${escHtml(l)}</p>`).join("")}</div>`;
  await envoyerEmail(ADMIN_EMAIL, `⚠️ CaraLink — ${sujet}`, html);
}

// ── Abonnements ─────────────────────────────────────────────

// Ancienne colonne abonnement_statut — conservée telle quelle (l'Admin l'affiche encore).
function mapStatutStripeVersArtisans(statutStripe: string): string {
  if (statutStripe === "trialing") return "essai";
  if (statutStripe === "active") return "actif";
  if (statutStripe === "past_due") return "actif"; // Stripe retente le paiement automatiquement, on ne coupe pas tout de suite
  // paused (essai expiré sans carte), canceled, unpaid, incomplete_expired → lecture_seule (nom hérité de l'ancien modèle)
  return "lecture_seule";
}

// Un abonnement donne accès au Pro tant qu'il est en essai, actif, ou en retard de paiement
// (Stripe retente seul — on ne retire pas le Pro à la première échéance ratée).
function abonnementDonneLePro(statutStripe: string): boolean {
  return statutStripe === "trialing" || statutStripe === "active" || statutStripe === "past_due";
}

// Date de fin d'essai (si essai) ou de prochain renouvellement (si actif) — affichée dans MPA.
// Selon la version d'API Stripe, current_period_end est sur l'abonnement ou sur son premier élément.
function extraireEcheance(sub: any): string | null {
  if (!abonnementDonneLePro(sub.status)) return null;
  const secondes = sub.status === "trialing"
    ? sub.trial_end
    : (sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end);
  return secondes ? new Date(secondes * 1000).toISOString() : null;
}

// Un artisan ne doit avoir qu'UN abonnement Pro. Si un autre abonnement encore actif existe déjà, le NOUVEAU est un doublon :
// on garde le premier, on annule le second et on prévient l'administrateur. Retourne vrai si le doublon est traité (rien à appliquer).
// On n'annule JAMAIS dans le doute : si l'état de l'ancien abonnement est introuvable chez Stripe, on applique comme avant et on prévient.
async function traiterDoublonAbonnement(sub: any, cible: (q: any) => any): Promise<boolean> {
  const { data: artisan, error } = await cible(sbAdmin.from("artisans").select("id, nom_entreprise, email, stripe_subscription_id")).maybeSingle();
  lever(error, "Lecture de l'artisan (doublon d'abonnement)");
  if (!artisan || !artisan.stripe_subscription_id || artisan.stripe_subscription_id === sub.id) return false;

  const ancien = await stripeApi("GET", `subscriptions/${encodeURIComponent(artisan.stripe_subscription_id)}`);
  const identite = `${artisan.nom_entreprise || "Artisan"} (${artisan.email || "sans email"}, id ${artisan.id})`;
  if (!ancien.ok) {
    await alerterAdmin("Abonnement Pro à vérifier", [
      `L'artisan ${identite} vient de créer un abonnement ${sub.id}, mais l'état de son abonnement précédent ${artisan.stripe_subscription_id} est introuvable chez Stripe (erreur ${ancien.status}).`,
      "Rien n'a été annulé. Vérifiez dans le Dashboard Stripe qu'il n'a pas deux abonnements actifs.",
    ]);
    return false;
  }
  if (!abonnementDonneLePro(ancien.data?.status)) return false; // l'ancien est terminé : le nouveau est un vrai remplacement

  // DOUBLON. D'abord on regarde si le nouveau n'est pas déjà annulé (événement rejoué) : on ne refait pas une annulation faite.
  const actuel = await stripeApi("GET", `subscriptions/${encodeURIComponent(sub.id)}`);
  if (actuel.ok && actuel.data?.status === "canceled") return true;
  const annulation = await stripeApi("DELETE", `subscriptions/${encodeURIComponent(sub.id)}`, undefined, `doublon-abo-${sub.id}`);
  if (!annulation.ok) {
    await alerterAdmin("Double abonnement : annulation à faire à la main", [
      `L'artisan ${identite} a deux abonnements Pro : ${artisan.stripe_subscription_id} (le premier, gardé) et ${sub.id} (le doublon).`,
      `L'annulation automatique du doublon a échoué (erreur ${annulation.status}). Annulez ${sub.id} dans le Dashboard Stripe.`,
    ]);
    throw new Error(`Annulation du doublon ${sub.id} refusée par Stripe (${annulation.status})`); // Stripe réessaiera
  }
  await alerterAdmin("Double abonnement annulé", [
    `L'artisan ${identite} s'est abonné une deuxième fois au Pro.`,
    `Abonnement gardé : ${artisan.stripe_subscription_id}. Abonnement annulé : ${sub.id}.`,
    "Pensez à vérifier dans Stripe si le doublon a déjà été facturé (un essai sans carte ne l'est pas) : le cas échéant, remboursez-le.",
  ]);
  return true;
}

async function appliquerAbonnement(sub: any) {
  const donneLePro = abonnementDonneLePro(sub.status);
  const artisanId = sub.metadata?.artisan_id;
  // Retrouve l'artisan par les métadonnées de l'abonnement ; filet de sécurité par customer_id si elles
  // n'ont pas suivi (abonnement modifié depuis le dashboard Stripe sans passer par notre code).
  const cible = (q: any) => artisanId ? q.eq("id", artisanId) : q.eq("stripe_customer_id", sub.customer);
  // Un abonnement qui se TERMINE ne s'applique que s'il est l'abonnement courant de l'artisan
  // (ou si l'artisan n'en a encore aucun) ; un abonnement qui DÉMARRE devient le courant.
  const seulementSiCourant = (q: any) => donneLePro ? q : q.or(`stripe_subscription_id.eq.${sub.id},stripe_subscription_id.is.null`);

  // Un abonnement qui donne le Pro alors que l'artisan en a déjà un autre en cours est un doublon : annulé, rien à appliquer.
  if (donneLePro && await traiterDoublonAbonnement(sub, cible)) return;

  const { error: errAbo } = await seulementSiCourant(cible(sbAdmin.from("artisans").update({
    abonnement_statut: mapStatutStripeVersArtisans(sub.status),
    stripe_subscription_id: sub.id,
    abonnement_echeance: extraireEcheance(sub),
    // Résiliation demandée dans le portail : le Pro dure jusqu'à la fin de la période payée.
    // (selon la version d'API, c'est cancel_at_period_end ou une date cancel_at)
    abonnement_fin_programmee: donneLePro && (sub.cancel_at_period_end === true || sub.cancel_at != null),
    abonnement_paiement_en_echec: sub.status === "past_due",
  })));
  lever(errAbo, "Maj abonnement artisan");

  const { error: errPlan } = await seulementSiCourant(cible(sbAdmin.from("artisans").update({
    plan: donneLePro ? "pro" : "gratuit",
  }))).neq("plan", "pro_offert"); // jamais d'écrasement d'un Pro offert
  lever(errPlan, "Maj plan artisan");
}

// ── Paiement d'une commande du catalogue ──

// Paiements directs : l'événement vient du compte Stripe de l'artisan (« event.account »). On ne le prend en compte que si ce compte
// est bien celui de l'artisan de la commande (un compte ne peut jamais faire bouger la commande d'un autre).
// Sans « event.account » (ancien modèle, paiement sur CaraLink) : comportement d'avant.
async function compteCorrespond(artisanId: string, compteEvenement: string | null): Promise<boolean> {
  if (!compteEvenement) return true;
  const { data, error } = await sbAdmin.from("artisans").select("stripe_connect_account_id").eq("id", artisanId).maybeSingle();
  lever(error, "Lecture du compte Stripe de l'artisan");
  return data?.stripe_connect_account_id === compteEvenement;
}

// Paramètres d'un remboursement : sans « reverse_transfer » sur un paiement direct (rien à reprendre, l'argent est chez l'artisan).
// Paiement direct : la commission de CaraLink est rendue avec le remboursement (sans commission, il n'y a rien à rendre : Stripe l'ignore).
function paramsRemboursement(base: Record<string, string>, compteEvenement: string | null, commissionCentimes = 0): URLSearchParams {
  const p = new URLSearchParams(base);
  if (!compteEvenement) p.set("reverse_transfer", "true");
  else if (commissionCentimes > 0) p.set("refund_application_fee", "true");
  return p;
}

// Retire du stock (ou le remet si delta > 0) sans jamais passer sous zéro, même si deux paiements arrivent en même temps :
// l'écriture ne réussit que si le stock lu n'a pas changé entre-temps, sinon on relit et on recommence.
async function ajusterStock(articleId: string, delta: number, alertes?: any[]): Promise<"ok" | "illimite" | "insuffisant"> {
  for (let essai = 0; essai < 5; essai++) {
    const { data: article, error } = await sbAdmin.from("artisans_catalogue").select("id, nom, artisan_id, quantite_stock, seuil_alerte").eq("id", articleId).maybeSingle();
    lever(error, "Lecture du stock");
    if (!article) return "ok"; // produit supprimé entre-temps : rien à décompter
    if (article.quantite_stock == null) return "illimite"; // stock non suivi (ex : une formation)
    const nouveau = article.quantite_stock + delta;
    if (nouveau < 0) return "insuffisant";
    const { data: maj, error: errMaj } = await sbAdmin.from("artisans_catalogue").update({ quantite_stock: nouveau })
      .eq("id", articleId).eq("quantite_stock", article.quantite_stock).select("id");
    lever(errMaj, "Maj du stock");
    if (maj && maj.length) {
      // Le stock vient de franchir le seuil d'alerte de l'artisan (de « au-dessus » à « au niveau ou en dessous ») : on le note,
      // l'email part seulement quand la commande entière est validée (voir decompterStock), jamais sur un stock remis ensuite.
      if (alertes && delta < 0 && article.seuil_alerte != null && article.quantite_stock > article.seuil_alerte && nouveau <= article.seuil_alerte) {
        alertes.push({ nom: article.nom, artisan_id: article.artisan_id, stock: nouveau, seuil: article.seuil_alerte });
      }
      return "ok";
    }
  }
  throw new Error(`Stock de ${articleId} : trop de conflits d'écriture`);
}

// Retire le stock de toute la commande, tout ou rien : si un article manque, ce qui avait déjà été retiré est remis.
async function decompterStock(lignes: any[]): Promise<{ ok: boolean; manquants: string[] }> {
  const parArticle = new Map<string, { quantite: number; nom: string }>();
  for (const l of lignes) {
    if (!l.catalogue_id) continue;
    const deja = parArticle.get(l.catalogue_id);
    parArticle.set(l.catalogue_id, { quantite: (deja?.quantite || 0) + Number(l.quantite || 0), nom: l.nom_article });
  }
  const retires: Array<[string, number]> = [];
  const alertes: any[] = [];
  for (const [id, { quantite, nom }] of parArticle) {
    const r = await ajusterStock(id, -quantite, alertes);
    if (r === "insuffisant") {
      for (const [idRetire, q] of retires) await ajusterStock(idRetire, q);
      return { ok: false, manquants: [nom] };
    }
    if (r === "ok") retires.push([id, quantite]);
  }
  await envoyerAlertesStock(alertes);
  return { ok: true, manquants: [] };
}

// MPA-AI prévient l'artisan par email quand un produit atteint son seuil d'alerte. Un échec d'envoi ne bloque jamais la commande.
async function envoyerAlertesStock(alertes: any[]) {
  for (const a of alertes) {
    try {
      const { data: artisan } = await sbAdmin.from("artisans").select("email").eq("id", a.artisan_id).maybeSingle();
      if (!artisan?.email) continue;
      const vide = a.stock <= 0;
      const sujet = vide ? `✨ MPA AI — "${a.nom}" est épuisé` : `✨ MPA AI — stock bas : "${a.nom}"`;
      const html = `<div style="font-family:sans-serif;max-width:520px;"><h3 style="color:#B5502F;">${vide ? "🚫" : "⚠️"} ${escHtml(a.nom)}</h3>
        <p>${vide ? `Votre produit <strong>${escHtml(a.nom)}</strong> est <strong>épuisé</strong>.` : `Il ne reste que <strong>${a.stock}</strong> exemplaire${a.stock > 1 ? "s" : ""} de <strong>${escHtml(a.nom)}</strong> (votre seuil d'alerte : ${a.seuil}).`}</p>
        <p>Pensez à réapprovisionner pour ne pas manquer de ventes. Vous pouvez mettre à jour le stock dans MPA, onglet Mes produits.</p></div>`;
      await envoyerEmail(artisan.email, sujet, html);
    } catch (e) {
      console.error("[stripe-webhook-artisans] Alerte de stock non envoyée :", e);
    }
  }
}

function emailNouvelleCommande(commande: any, lignes: any[]): string {
  const detail = lignes.map((l) => `<li>${l.quantite} × ${escHtml(l.nom_article)} — ${(Number(l.prix_unitaire) * Number(l.quantite)).toFixed(2)} €</li>`).join("");
  const frais = Number(commande.frais_livraison || 0);
  const mode = commande.mode === "livraison"
    ? "🚚 Livraison — " + escHtml(commande.adresse_livraison) + (frais > 0 ? ` (frais de livraison : ${frais.toFixed(2)} €)` : "")
    : "🏠 Retrait sur place";
  const date = commande.date_souhaitee
    ? `<p>Date ${commande.livraison_flexible ? "souhaitée au plus tôt" : "souhaitée"} : ${escHtml(commande.date_souhaitee)}${commande.livraison_flexible ? ` (flexible, ${escHtml(commande.livraison_fenetre_jours)} jours)` : ""}</p>`
    : "";
  return `<div style="font-family:sans-serif;max-width:480px;">
        <h2 style="color:#B5502F;">Nouvelle commande payée — ${Number(commande.montant_total).toFixed(2)} €</h2>
        <p><strong>${escHtml(commande.client_nom)}</strong> (${escHtml(commande.client_telephone)}) a payé en ligne :</p>
        <ul>${detail}</ul>
        <p>Mode : ${mode}</p>
        ${date}
        ${commande.notes ? `<p>Précisions : ${escHtml(commande.notes)}</p>` : ""}
        <p style="margin-top:20px;"><a href="https://caralink.app/mpa/" style="color:#B5502F;font-weight:700;">Voir dans MPA Artisans →</a></p>
      </div>`;
}

// Le client a payé mais le dernier exemplaire a été pris pendant ce temps : remboursement intégral automatique.
// Même montage que rembourser-commande : le remboursement part du compte de l'artisan (paiement direct) ; les frais Stripe ne sont pas rendus.
async function gererRuptureApresPaiement(commande: any, lignes: any[], artisan: any, manquants: string[], intent: any, compteEvenement: string | null) {
  const resume = commande.nom_article || "votre commande";
  const rembourse = await stripeApi("POST", "refunds", paramsRemboursement({
    payment_intent: intent.id,
    reason: "requested_by_customer",
    "metadata[commande_id]": commande.id,
    "metadata[demande_par]": "automatique",
    "metadata[motif]": "rupture_de_stock",
  }, compteEvenement, Math.round(Number(commande.commission_montant || 0) * 100)), `rupture-stock-${commande.id}`, compteEvenement);

  if (rembourse.ok) {
    if (artisan?.email) {
      await envoyerEmail(artisan.email, `✨ MPA AI — vente remboursée : "${manquants[0]}" en rupture`,
        `<div style="font-family:sans-serif;max-width:480px;">
        <h2 style="color:#B5502F;">✨ MPA AI — une vente a été remboursée, faute de stock</h2>
        <p><strong>${escHtml(commande.client_nom)}</strong> a payé <strong>${Number(commande.montant_total).toFixed(2)} €</strong> pour ${escHtml(resume)}, mais il ne restait plus assez de <strong>${escHtml(manquants[0])}</strong> au moment du paiement (une autre commande a été payée juste avant).</p>
        <p>Le client a été remboursé automatiquement et intégralement. <strong>Il n'y a rien à faire de votre côté.</strong></p>
        <p style="margin-top:16px;">Pensez à réapprovisionner ce produit dans <strong>Mon stock → Mes produits</strong> si vous le pouvez.</p>
        <p style="margin-top:20px;"><a href="https://caralink.app/mpa/" style="color:#B5502F;font-weight:700;">Voir dans MPA Artisans →</a></p>
      </div>`);
    }
    if (commande.client_email) {
      await envoyerEmail(commande.client_email, `Votre commande chez ${artisan?.nom_entreprise || "l'artisan"} n'a pas pu être honorée`,
        `<div style="font-family:sans-serif;max-width:480px;">
        <h2 style="color:#B5502F;">Votre commande n'a pas pu être honorée</h2>
        <p>Bonjour ${escHtml(commande.client_nom)}, le dernier exemplaire de <strong>${escHtml(manquants[0])}</strong> a été vendu pendant que vous payiez.</p>
        <p>Vous êtes <strong>remboursé(e) intégralement</strong> (${Number(commande.montant_total).toFixed(2)} €). Le remboursement apparaît sur votre carte sous quelques jours.</p>
        <p>Nous sommes désolés pour ce désagrément.</p>
      </div>`);
    }
    return;
  }

  // Le remboursement automatique a échoué : la commande reste visible et payée chez l'artisan, qui peut la rembourser depuis MPA.
  console.error("[stripe-webhook-artisans] Remboursement automatique échoué :", rembourse.status, JSON.stringify(rembourse.data)?.slice(0, 300));
  if (artisan?.email) {
    await envoyerEmail(artisan.email, `⚠️ MPA AI — commande payée à rembourser : "${manquants[0]}" en rupture`,
      `<div style="font-family:sans-serif;max-width:480px;">
        <h2 style="color:#B5502F;">⚠️ Une commande payée est à rembourser</h2>
        <p><strong>${escHtml(commande.client_nom)}</strong> a payé <strong>${Number(commande.montant_total).toFixed(2)} €</strong> pour ${escHtml(resume)}, mais il n'y avait plus assez de <strong>${escHtml(manquants[0])}</strong>.</p>
        <p>Le remboursement automatique n'a pas pu se faire. <strong>Merci de rembourser cette commande depuis MPA</strong> (onglet Commandes, bouton « Rembourser »).</p>
        <p style="margin-top:20px;"><a href="https://caralink.app/mpa/" style="color:#B5502F;font-weight:700;">Voir dans MPA Artisans →</a></p>
      </div>`);
  }
  await alerterAdmin("Commande payée, remboursement automatique échoué", [
    `Commande ${commande.id} (${resume}, ${Number(commande.montant_total).toFixed(2)} €) : rupture de stock après paiement et remboursement refusé par Stripe (erreur ${rembourse.status}).`,
    "L'artisan a été prévenu et doit rembourser depuis MPA ; vérifiez qu'il le fait.",
  ]);
}

async function traiterPaiementReussi(intent: any, compteEvenement: string | null) {
  const commandeId = intent.metadata?.commande_id;
  if (!commandeId) return;
  const { data: commande, error } = await sbAdmin.from("commandes_catalogue").select("*").eq("id", commandeId).maybeSingle();
  lever(error, "Lecture de la commande");
  if (!commande) { console.error("[stripe-webhook-artisans] Paiement reçu pour une commande introuvable :", commandeId); return; }
  if (!(await compteCorrespond(commande.artisan_id, compteEvenement))) {
    console.error("[stripe-webhook-artisans] Paiement venant d'un compte Stripe qui n'est pas celui de l'artisan de la commande :", commandeId, compteEvenement);
    await alerterAdmin("Paiement ignoré : compte Stripe incohérent", [`Commande ${commandeId} : le paiement ${intent.id} vient du compte ${compteEvenement}, qui n'est pas celui de l'artisan de la commande. Rien n'a été modifié.`]);
    return;
  }

  const dejaPayee = STATUTS_PAYES.includes(commande.paiement_statut);

  // Deux paiements réussis pour la même commande (deux onglets, deux cartes) : le premier compte, le second est remboursé.
  if (dejaPayee && commande.stripe_payment_intent_id && commande.stripe_payment_intent_id !== intent.id) {
    const r = await stripeApi("POST", "refunds", paramsRemboursement({
      payment_intent: intent.id, reason: "duplicate",
      "metadata[commande_id]": commandeId, "metadata[demande_par]": "automatique", "metadata[motif]": "paiement_en_double",
    }, compteEvenement, Number(intent.application_fee_amount || 0)), `doublon-paiement-${intent.id}`, compteEvenement);
    await alerterAdmin(r.ok ? "Paiement en double remboursé" : "Paiement en double À REMBOURSER", [
      `La commande ${commandeId} a été payée deux fois (${commande.stripe_payment_intent_id} puis ${intent.id}).`,
      r.ok ? `Le second paiement (${intent.id}) a été remboursé automatiquement.` : `Le remboursement automatique de ${intent.id} a échoué (erreur ${r.status}) : remboursez-le dans le Dashboard Stripe.`,
    ]);
    return;
  }

  // Commande d'AVANT la règle « paiement obligatoire » : stock et email ont déjà été faits à sa création. On ne fait que constater
  // le paiement, sans jamais faire reculer son statut.
  if (commande.paiement_requis !== true) {
    if (!dejaPayee) {
      const { error: errPaye } = await sbAdmin.from("commandes_catalogue").update({ paiement_statut: "paye" }).eq("id", commandeId);
      lever(errPaye, "Maj du paiement de la commande");
    }
    const { error: errStatut } = await sbAdmin.from("commandes_catalogue").update({ statut: "confirmee" }).eq("id", commandeId).eq("statut", "nouvelle");
    lever(errStatut, "Maj du statut de la commande");
    return;
  }

  // Commande avec paiement obligatoire : on « réclame » le traitement. Une seule livraison de l'événement obtient la réclamation :
  // un événement rejoué ne retire pas le stock deux fois et n'envoie pas l'email deux fois.
  const { data: reclame, error: errReclame } = await sbAdmin.from("commandes_catalogue")
    .update({ paiement_statut: "paye", paiement_traite_le: new Date().toISOString(), stripe_payment_intent_id: intent.id })
    .eq("id", commandeId).is("paiement_traite_le", null).select("id");
  lever(errReclame, "Prise en compte du paiement");
  if (!reclame || !reclame.length) return; // déjà traité

  // À partir d'ici le paiement est enregistré : une panne ne doit plus faire réessayer Stripe (le stock serait retiré deux fois).
  // On prévient l'administrateur pour que rien ne reste en suspens sans que quelqu'un le sache.
  try {
    const attendu = Math.round(Number(commande.montant_total) * 100);
    if (intent.amount_received != null && attendu > 0 && Number(intent.amount_received) !== attendu) {
      await alerterAdmin("Montant payé différent du montant de la commande", [`Commande ${commandeId} : ${attendu / 100} € attendus, ${Number(intent.amount_received) / 100} € encaissés.`]);
    }
    // Une commande non payée expirée (annulée) qui est finalement payée revit ; une nouvelle passe à « confirmée » ; jamais de recul.
    const { error: errStatut } = await sbAdmin.from("commandes_catalogue").update({ statut: "confirmee" }).eq("id", commandeId).in("statut", ["nouvelle", "annulee"]);
    lever(errStatut, "Maj du statut de la commande");

    const { data: lignes, error: errLignes } = await sbAdmin.from("commandes_catalogue_lignes")
      .select("catalogue_id, nom_article, prix_unitaire, quantite").eq("commande_id", commandeId);
    lever(errLignes, "Lecture des lignes de la commande");
    const { data: artisan, error: errArtisan } = await sbAdmin.from("artisans").select("nom_entreprise, email").eq("id", commande.artisan_id).maybeSingle();
    lever(errArtisan, "Lecture de l'artisan");

    const stock = await decompterStock(lignes || []);
    if (!stock.ok) { await gererRuptureApresPaiement(commande, lignes || [], artisan, stock.manquants, intent, compteEvenement); return; }

    if (artisan?.email) await envoyerEmail(artisan.email, `Nouvelle commande : ${commande.nom_article}`, emailNouvelleCommande(commande, lignes || []));
  } catch (e) {
    console.error("[stripe-webhook-artisans] Traitement d'une commande payée incomplet :", e);
    await alerterAdmin("Commande payée à vérifier", [
      `Commande ${commandeId} : le paiement est enregistré mais le traitement (statut, stock, email à l'artisan) s'est interrompu : ${e instanceof Error ? e.message : String(e)}.`,
      "Vérifiez la commande dans MPA et le stock du produit.",
    ]);
  }
}

// ── Paiements de prestations (frais de réservation, solde après visite) ──

async function libererReservation(paiementId: string) {
  const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/liberer-reservation`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ paiement_id: paiementId }),
  });
  if (!res.ok) throw new Error(`liberer-reservation a répondu ${res.status}`); // Stripe réessaiera (la libération est rejouable sans effet double)
}

async function traiterPaiementPrestation(intent: any, compteEvenement: string | null) {
  const id = intent.metadata?.paiement_prestation_id;
  if (!id) return;
  const { data: p, error } = await sbAdmin.from("paiements_prestations").select("*").eq("id", id).maybeSingle();
  lever(error, "Lecture du paiement de prestation");
  if (!p) { console.error("[stripe-webhook-artisans] Paiement reçu pour une prestation introuvable :", id); return; }
  if (!(await compteCorrespond(p.artisan_id, compteEvenement))) {
    await alerterAdmin("Paiement de prestation ignoré : compte Stripe incohérent", [`Paiement ${id} : l'événement ${intent.id} vient du compte ${compteEvenement}, qui n'est pas celui de l'artisan. Rien n'a été modifié.`]);
    return;
  }
  const compte = compteEvenement || p.stripe_account;
  const dejaPaye = STATUTS_PAYES.includes(p.statut);

  // Autre carte, autre paiement pour la même ligne : le premier compte, le second est remboursé.
  if (dejaPaye && p.stripe_payment_intent_id && p.stripe_payment_intent_id !== intent.id) {
    const r = await stripeApi("POST", "refunds", paramsRemboursement({
      payment_intent: intent.id, reason: "duplicate",
      "metadata[paiement_prestation_id]": id, "metadata[demande_par]": "automatique", "metadata[motif]": "paiement_en_double",
    }, compte, Number(intent.application_fee_amount || 0)), `doublon-prestation-${intent.id}`, compte);
    await alerterAdmin(r.ok ? "Paiement de prestation en double remboursé" : "Paiement de prestation en double À REMBOURSER", [
      `Le paiement ${id} a été réglé deux fois (${p.stripe_payment_intent_id} puis ${intent.id}).`,
      r.ok ? "Le second a été remboursé automatiquement." : `Le remboursement automatique a échoué (erreur ${r.status}) : remboursez ${intent.id} dans le Dashboard Stripe.`,
    ]);
    return;
  }

  // Payé alors que la demande était déjà annulée ou expirée : on rembourse tout de suite, rien n'est dû.
  if (["annule", "expire"].includes(p.statut)) {
    const r = await stripeApi("POST", "refunds", paramsRemboursement({
      payment_intent: intent.id, reason: "requested_by_customer",
      "metadata[paiement_prestation_id]": id, "metadata[demande_par]": "automatique", "metadata[motif]": "paiement_apres_annulation",
    }, compte, Number(intent.application_fee_amount || 0)), `tardif-prestation-${intent.id}`, compte);
    if (!r.ok) {
      await alerterAdmin("Paiement de prestation tardif À REMBOURSER", [`Le client a payé ${id} (${intent.id}) après l'annulation ou l'expiration, et le remboursement automatique a échoué (erreur ${r.status}). Remboursez-le dans le Dashboard Stripe.`]);
      throw new Error("Remboursement du paiement tardif refusé"); // Stripe réessaiera
    }
    const { error: errT } = await sbAdmin.from("paiements_prestations").update({
      statut: "rembourse", montant_rembourse: p.montant, rembourse_le: new Date().toISOString(), paye_le: new Date().toISOString(),
      stripe_payment_intent_id: intent.id, stripe_account: compte, motif_remboursement: "Paiement reçu après l'annulation ou l'expiration de la demande",
      updated_at: new Date().toISOString(),
    }).eq("id", id).in("statut", ["annule", "expire"]);
    lever(errT, "Maj du paiement tardif");
    if (p.client_email) await envoyerEmail(p.client_email, "Votre paiement a été remboursé", `<div style="font-family:sans-serif;max-width:480px;"><h2 style="color:#B5502F;">Votre paiement a été remboursé</h2><p>Bonjour ${escHtml(p.client_nom || "")}, votre demande avait déjà été annulée ou avait expiré au moment de votre paiement. Il vous est <strong>remboursé intégralement</strong> ; il apparaîtra sur votre carte sous quelques jours.</p></div>`);
    return;
  }

  // Normal : « en attente » → « payé » (une seule livraison de l'événement obtient la réclamation).
  if (p.statut === "en_attente") {
    const { data: reclame, error: errR } = await sbAdmin.from("paiements_prestations").update({
      statut: "paye", paye_le: new Date().toISOString(), stripe_payment_intent_id: intent.id, stripe_account: compte, updated_at: new Date().toISOString(),
    }).eq("id", id).eq("statut", "en_attente").select("id");
    lever(errR, "Prise en compte du paiement de prestation");
    if (reclame && reclame.length) {
      const attendu = Math.round(Number(p.montant) * 100);
      if (intent.amount_received != null && Number(intent.amount_received) !== attendu) {
        await alerterAdmin("Montant de prestation payé différent", [`Paiement ${id} : ${attendu / 100} € attendus, ${Number(intent.amount_received) / 100} € encaissés.`]);
      }
      if (p.type === "solde") {
        try {
          if (p.intervention_id) {
            await sbAdmin.from("mpa_artisans_interventions").update({ statut: "payee", date_paiement: new Date(Date.now() - 4 * 3600 * 1000).toISOString().slice(0, 10) })
              .eq("id", p.intervention_id).eq("statut", "terminee");
          }
          const { data: art } = await sbAdmin.from("artisans").select("email, nom_entreprise").eq("id", p.artisan_id).maybeSingle();
          if (art?.email) {
            await envoyerEmail(art.email, `💶 Paiement reçu — ${Number(p.montant).toFixed(2).replace(".", ",")} € de ${p.client_nom || "votre client"}`,
              `<div style="font-family:sans-serif;max-width:480px;"><h2 style="color:#16a34a;">💶 Paiement reçu</h2><p><strong>${escHtml(p.client_nom || "Votre client")}</strong> vient de régler <strong>${Number(p.montant).toFixed(2).replace(".", ",")} €</strong>${p.description ? ` (${escHtml(p.description)})` : ""} en ligne.</p><p style="font-size:13px;color:#475569;">L'argent arrive sur votre compte Stripe, selon vos paramètres de virement.</p><p style="margin-top:20px;"><a href="https://caralink.app/mpa/" style="color:#B5502F;font-weight:700;">Voir dans MPA Artisans →</a></p></div>`);
          }
        } catch (e) { console.error("[stripe-webhook-artisans] Suites du paiement de solde incomplètes :", e); }
        return;
      }
    }
  }

  // Réservation payée : la demande devient visible de l'artisan (rejouable ; sans effet si déjà fait).
  if (p.type === "reservation") await libererReservation(id);
}

async function traiterRemboursementPrestation(charge: any, compteEvenement: string | null) {
  const intentId = charge.payment_intent;
  const rembourse = Number(charge.amount_refunded || 0);
  const total = Number(charge.amount || 0);
  if (!intentId || !(rembourse > 0)) return;
  const { data: p, error } = await sbAdmin.from("paiements_prestations").select("id, artisan_id, montant, montant_rembourse, statut").eq("stripe_payment_intent_id", intentId).maybeSingle();
  lever(error, "Lecture du paiement de prestation (remboursement)");
  if (!p || !(await compteCorrespond(p.artisan_id, compteEvenement))) return;
  const integral = total > 0 && rembourse >= total;
  // Stripe est la source de vérité ; on n'écrit que si ça change quelque chose (idempotent).
  if (Math.round(Number(p.montant_rembourse || 0) * 100) === rembourse && (integral ? p.statut === "rembourse" : p.statut === "partiellement_rembourse")) return;
  const { error: errM } = await sbAdmin.from("paiements_prestations").update({
    statut: integral ? "rembourse" : "partiellement_rembourse", montant_rembourse: rembourse / 100,
    rembourse_le: new Date().toISOString(), updated_at: new Date().toISOString(),
  }).eq("id", p.id);
  lever(errM, "Maj remboursement de prestation");
}

async function traiterPaiementEchoue(intent: any, compteEvenement: string | null) {
  const commandeId = intent.metadata?.commande_id;
  if (!commandeId) return;
  if (compteEvenement) {
    const { data: c, error: errC } = await sbAdmin.from("commandes_catalogue").select("artisan_id").eq("id", commandeId).maybeSingle();
    lever(errC, "Lecture de la commande (échec de paiement)");
    if (!c || !(await compteCorrespond(c.artisan_id, compteEvenement))) return;
  }
  // Un échec n'écrase JAMAIS un paiement réussi ou remboursé (Stripe ne garantit pas l'ordre des événements).
  const { error } = await sbAdmin.from("commandes_catalogue").update({ paiement_statut: "echoue" }).eq("id", commandeId)
    .or("paiement_statut.is.null,paiement_statut.not.in.(paye,rembourse,partiellement_rembourse)");
  lever(error, "Maj de l'échec de paiement");
}

// ── Remboursement d'une commande (depuis MPA, l'admin, ou directement dans le dashboard Stripe) ──
// On prend les montants de Stripe comme source de vérité : le traitement est idempotent
// (recevoir deux fois le même événement donne le même résultat).
async function traiterRemboursement(charge: any, compteEvenement: string | null) {
  const intentId = charge.payment_intent;
  const rembourse = Number(charge.amount_refunded || 0);
  const total = Number(charge.amount || 0);
  if (!intentId || !(rembourse > 0)) return;
  if (compteEvenement) {
    // Remboursement fait sur le compte d'un artisan (par MPA, ou par l'artisan lui-même dans son espace Stripe) : la commande doit être la sienne.
    const { data: c, error: errC } = await sbAdmin.from("commandes_catalogue").select("artisan_id").eq("stripe_payment_intent_id", intentId).maybeSingle();
    lever(errC, "Lecture de la commande (remboursement)");
    if (!c || !(await compteCorrespond(c.artisan_id, compteEvenement))) return;
  }
  const integral = total > 0 && rembourse >= total;
  const { error } = await sbAdmin.from("commandes_catalogue").update({
    paiement_statut: integral ? "rembourse" : "partiellement_rembourse",
    montant_rembourse: rembourse / 100,
    rembourse_le: new Date().toISOString(),
  }).eq("stripe_payment_intent_id", intentId);
  lever(error, "Maj remboursement");

  if (integral) {
    // Commande pas encore livrée/récupérée → annulée. Une commande déjà terminée garde son statut.
    const { error: errAnnul } = await sbAdmin.from("commandes_catalogue").update({ statut: "annulee" })
      .eq("stripe_payment_intent_id", intentId).in("statut", ["nouvelle", "confirmee", "prete"]);
    lever(errAnnul, "Annulation commande remboursée");
  }
}

// ── Carte enregistrée pour la commission prestations (SetupIntent confirmé) ──
async function traiterCarteEnregistree(setupIntent: any) {
  const artisanId = setupIntent.metadata?.artisan_id;
  const customerId = setupIntent.customer;
  const paymentMethodId = setupIntent.payment_method;
  if (!artisanId || !customerId || !paymentMethodId) return;
  // La carte devient le moyen de paiement par défaut du client Stripe — le prélèvement mensuel n'a ensuite qu'à débiter
  // « le moyen de paiement par défaut du client ». Elle n'est déclarée « enregistrée » que si Stripe a bien accepté.
  const res = await stripeApi("POST", `customers/${encodeURIComponent(customerId)}`, new URLSearchParams({ "invoice_settings[default_payment_method]": paymentMethodId }));
  if (!res.ok) throw new Error(`Stripe a refusé de définir le moyen de paiement par défaut (${res.status})`); // Stripe réessaiera
  const { error } = await sbAdmin.from("artisans").update({ carte_prestations_enregistree: true }).eq("id", artisanId);
  lever(error, "Maj carte_prestations_enregistree");

  // Une commission restée « échouée » faute de carte (ou carte refusée) est retentée tout de suite avec la nouvelle carte.
  // Jamais bloquant : si cet appel échoue, la carte reste bien enregistrée et le lancement mensuel retentera de toute façon.
  const secretCron = Deno.env.get("PRELEVEMENT_CRON_SECRET");
  if (secretCron) {
    try {
      const rep = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/prelever-commission-prestations`, {
        method: "POST",
        headers: { "X-Cron-Secret": secretCron, "Content-Type": "application/json" },
        body: JSON.stringify({ reprise_artisan_id: artisanId }),
      });
      if (!rep.ok) console.error("[stripe-webhook-artisans] reprise de commission refusée :", rep.status);
    } catch (e) { console.error("[stripe-webhook-artisans] reprise de commission impossible :", e); }
  }
}

// ── Onboarding Stripe Connect d'un artisan terminé (compte prêt à recevoir des paiements) ──
async function traiterCompteConnect(account: any) {
  const artisanId = account.metadata?.artisan_id;
  if (!artisanId) return;
  const actif = account.charges_enabled && account.payouts_enabled;
  const { error } = await sbAdmin.from("artisans").update({
    stripe_connect_statut: actif ? "actif" : "en_cours",
  }).eq("id", artisanId).eq("stripe_connect_account_id", account.id);
  lever(error, "Maj statut Connect");
}

Deno.serve(async (req: Request) => {
  try {
    const sig = req.headers.get("stripe-signature");
    const payload = await req.text();
    if (!sig || !(await verifierSignatureMultiple(payload, sig))) {
      return new Response("Signature invalide.", { status: 400 });
    }

    const event = JSON.parse(payload);

    if (event.type.startsWith("customer.subscription.")) await appliquerAbonnement(event.data.object);
    const compteEvenement: string | null = typeof event.account === "string" && event.account ? event.account : null; // présent pour les paiements directs
    if (event.type === "payment_intent.succeeded") {
      await traiterPaiementReussi(event.data.object, compteEvenement);
      await traiterPaiementPrestation(event.data.object, compteEvenement);
    }
    if (event.type === "payment_intent.payment_failed") await traiterPaiementEchoue(event.data.object, compteEvenement);
    if (event.type === "charge.refunded") {
      await traiterRemboursement(event.data.object, compteEvenement);
      await traiterRemboursementPrestation(event.data.object, compteEvenement);
    }
    if (event.type === "setup_intent.succeeded") await traiterCarteEnregistree(event.data.object);
    if (event.type === "account.updated") await traiterCompteConnect(event.data.object);

    return new Response(JSON.stringify({ received: true }), { headers: { "Content-Type": "application/json" } });

  } catch (e) {
    // Une erreur (base indisponible, Stripe qui refuse…) répond 500 : Stripe réessaiera l'événement plus tard.
    console.error("[stripe-webhook-artisans]", e);
    return new Response("Erreur serveur.", { status: 500 });
  }
});
