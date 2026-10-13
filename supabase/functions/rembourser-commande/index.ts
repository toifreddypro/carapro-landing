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
// (14/10) DEUX MODÈLES de paiement coexistent, détectés commande par commande (le paiement est cherché sur le compte de l'artisan) :
//   • PAIEMENT DIRECT (nouveau) : le paiement vit sur le compte Stripe de l'artisan. Le remboursement part de SON solde ; Stripe porte
//     la perte s'il ne peut pas couvrir (compte « Stripe responsable des pertes »). CaraLink n'avance JAMAIS rien : plus de garde-fou
//     de solde bloquant. Si le solde est insuffisant, Stripe peut laisser le remboursement « en attente » : la réponse le signale.
//   • ANCIEN MODÈLE « destination charge » (commandes d'avant le 14/10) : comportement d'origine ci-dessous, inchangé.
//
// Comment l'argent circule (ANCIEN modèle, paiement = "destination charge") :
//   • le client récupère le montant remboursé ;
//   • Stripe REPREND à l'artisan le montant remboursé (reverse_transfer) ;
//   • la retenue CaraLink (frais de paiement + éventuelle commission) n'est PAS rendue : Stripe ne restitue jamais ses frais,
//     et la retenue sert justement à les couvrir. Décision du 13/10 : c'est l'artisan qui les supporte (un remboursement
//     vient de sa gestion : stock, indisponibilité…), CaraLink n'y gagne ni n'y perd rien. On n'utilise donc PAS
//     refund_application_fee. L'artisan en est prévenu dans la fenêtre de remboursement et par email.
//   • conséquence : au plus la retenue de la commande peut manquer sur le solde de l'artisan ; Stripe la déduit de ses
//     prochaines ventes (le garde-fou ci-dessous tolère exactement cet écart).
//
// (13/10) Après un remboursement réussi : un email au CLIENT (s'il a donné son adresse) et un à l'ARTISAN, et, sur
// demande (remettre_en_stock) pour un remboursement TOTAL, les articles retournent en stock. Ces suites ne se font qu'une
// fois : seule la requête qui met réellement la commande à jour les déclenche (jamais un double clic).
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

function escHtml(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (m) => (({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }) as Record<string, string>)[m]);
}

async function envoyerEmail(to: string, subject: string, html: string, replyTo?: string) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) { console.warn("[rembourser-commande] RESEND_API_KEY absente — email non envoyé."); return; }
  try {
    const corps: Record<string, unknown> = { from: "CaraLink Artisans <notifications@learnlogicstudio.com>", to: [to], subject, html };
    if (replyTo) corps.reply_to = replyTo;
    const res = await fetch("https://api.resend.com/emails", { method: "POST", headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify(corps) });
    if (!res.ok) console.error("[rembourser-commande] Échec envoi Resend :", await res.text());
  } catch (e) { console.error("[rembourser-commande] Erreur envoi email :", e); }
}

// Remet (delta > 0) du stock sans écraser une vente simultanée : l'écriture ne réussit que si le stock lu n'a pas changé.
async function remettreEnStock(sb: any, articleId: string, quantite: number): Promise<"ok" | "illimite" | "introuvable"> {
  for (let essai = 0; essai < 5; essai++) {
    const { data: article, error } = await sb.from("artisans_catalogue").select("id, quantite_stock").eq("id", articleId).maybeSingle();
    if (error) throw error;
    if (!article) return "introuvable";
    if (article.quantite_stock == null) return "illimite"; // stock non suivi : rien à remettre
    const { data: maj, error: errMaj } = await sb.from("artisans_catalogue").update({ quantite_stock: article.quantite_stock + quantite })
      .eq("id", articleId).eq("quantite_stock", article.quantite_stock).select("id");
    if (errMaj) throw errMaj;
    if (maj && maj.length) return "ok";
  }
  throw new Error(`Stock de ${articleId} : trop de conflits d'écriture`);
}

function emailClientRemboursement(entreprise: string, article: string, montantCents: number, total: boolean, motif: string): string {
  return `<div style="font-family:sans-serif;max-width:480px;">
    <h2 style="color:#B5502F;">Votre commande a été ${total ? "remboursée" : "remboursée en partie"}</h2>
    <p><strong>${escHtml(entreprise)}</strong> vous a remboursé <strong>${euros(montantCents)}</strong> pour « ${escHtml(article)} ».</p>
    ${motif ? `<p>Motif indiqué : ${escHtml(motif)}</p>` : ""}
    <p>L'argent est renvoyé sur la carte utilisée pour le paiement. Selon votre banque, il apparaît sous quelques jours ouvrés.</p>
    <p style="color:#888;font-size:12px;margin-top:18px;">Une question ? Répondez simplement à cet email : il arrive directement chez ${escHtml(entreprise)}.</p>
  </div>`;
}

function emailArtisanRemboursement(d: { article: string; client: string; montantCents: number; total: boolean; reprisCents: number; motif: string; stock: string }): string {
  return `<div style="font-family:sans-serif;max-width:480px;">
    <h2 style="color:#B5502F;">Remboursement effectué — ${escHtml(d.article)}</h2>
    <p><strong>${euros(d.montantCents)}</strong> ont été remboursés à <strong>${escHtml(d.client)}</strong> (${d.total ? "remboursement total" : "remboursement partiel"}).</p>
    ${d.motif ? `<p>Motif : ${escHtml(d.motif)}</p>` : ""}
    <p>Stripe a repris <strong>${euros(d.reprisCents)}</strong> sur votre solde. Les frais de paiement de la vente ne sont pas restitués par Stripe : ils restent à votre charge.</p>
    ${d.stock ? `<p>${escHtml(d.stock)}</p>` : ""}
    <p style="margin-top:20px;"><a href="https://caralink.app/mpa/" style="color:#B5502F;font-weight:700;">Voir dans MPA Artisans →</a></p>
  </div>`;
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
      .select("id, nom_article, statut, paiement_statut, stripe_payment_intent_id, montant_total, commission_montant, montant_rembourse, catalogue_id, quantite, client_nom, client_email, artisans(user_id, stripe_connect_account_id, email, nom_entreprise)")
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

    // ── Quel modèle ? Le paiement est-il sur le compte de l'artisan (paiement direct) ou sur CaraLink (ancien modèle) ? ──
    if (!artisan?.stripe_connect_account_id) throw new ErreurMetier("Compte Stripe de l'artisan introuvable.", 500);
    const compteArtisan: string = artisan.stripe_connect_account_id;
    const resPaiement = await fetch(`https://api.stripe.com/v1/payment_intents/${encodeURIComponent(commande.stripe_payment_intent_id)}`, {
      headers: { "Authorization": `Bearer ${STRIPE_SECRET_KEY}`, "Stripe-Account": compteArtisan },
    });
    const donneesPaiement = await resPaiement.json().catch(() => ({}));
    let paiementDirect: boolean;
    if (resPaiement.ok) paiementDirect = true;
    else if (donneesPaiement?.error?.code === "resource_missing") paiementDirect = false; // introuvable chez l'artisan : ancien modèle
    else throw new ErreurMetier("Impossible de vérifier ce paiement pour le moment. Réessayez dans un instant.", 502);

    // ── Garde-fou (ANCIEN modèle seulement) : l'artisan doit avoir de quoi couvrir la reprise ──
    // (l'admin peut forcer : c'est alors CaraLink qui assume la différence)
    const forcer = estAdmin && body.forcer === true;
    if (!paiementDirect && !forcer) {
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
      reason: "requested_by_customer",
      "metadata[commande_id]": commande.id,
      "metadata[demande_par]": user.email || user.id,
    });
    if (motif) params.set("metadata[motif]", motif);
    if (!paiementDirect) params.set("reverse_transfer", "true"); // ancien modèle : reprendre sa part à l'artisan

    const entetesStripe: Record<string, string> = {
      "Authorization": `Bearer ${STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
      // Même commande + même état = même clé : un double clic ne rembourse jamais deux fois.
      "Idempotency-Key": `rbk_${commande.id}_${calc.dejaCents}_${calc.montantCents}`,
    };
    if (paiementDirect) entetesStripe["Stripe-Account"] = compteArtisan; // le remboursement part du compte de l'artisan
    const res = await fetchAvecReprise("https://api.stripe.com/v1/refunds", { method: "POST", headers: entetesStripe, body: params });
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

    // ── Suites du remboursement (une seule fois : seule la requête qui a VRAIMENT mis la commande à jour les déclenche) ──
    // Jamais bloquantes : le client est déjà remboursé, une panne ici ne doit pas faire croire à un échec.
    let remisEnStock = false;
    if (!errMaj && majFaite && majFaite.length > 0) {
      const total = calc.statut === "rembourse";
      try {
        // Remise en stock : uniquement sur demande, pour un remboursement TOTAL fait en une fois (jamais après un remboursement partiel :
        // on ne sait pas quels articles ont été rendus).
        if (body.remettre_en_stock === true && total && calc.dejaCents === 0) {
          const { data: lignes, error: errL } = await sb.from("commandes_catalogue_lignes").select("catalogue_id, quantite").eq("commande_id", commande.id);
          if (errL) throw errL;
          const parArticle = new Map<string, number>();
          for (const l of (lignes && lignes.length ? lignes : [{ catalogue_id: (commande as any).catalogue_id, quantite: (commande as any).quantite }])) {
            if (!l.catalogue_id || !(Number(l.quantite) > 0)) continue;
            parArticle.set(l.catalogue_id, (parArticle.get(l.catalogue_id) || 0) + Number(l.quantite));
          }
          for (const [articleId, q] of parArticle) {
            if ((await remettreEnStock(sb, articleId, q)) === "ok") remisEnStock = true;
          }
        }
      } catch (e) { console.error("[rembourser-commande] Remise en stock impossible :", e); }

      try {
        const entreprise = artisan?.nom_entreprise || "L'artisan";
        const clientEmail = typeof (commande as any).client_email === "string" ? (commande as any).client_email.trim() : "";
        if (clientEmail) await envoyerEmail(clientEmail, `Votre commande a été ${total ? "remboursée" : "remboursée en partie"} — ${entreprise}`,
          emailClientRemboursement(entreprise, commande.nom_article, calc.montantCents, total, motif), artisan?.email || undefined);
        if (artisan?.email) await envoyerEmail(artisan.email, `Remboursement effectué : ${commande.nom_article}`,
          emailArtisanRemboursement({ article: commande.nom_article, client: (commande as any).client_nom || "le client", montantCents: calc.montantCents, total,
            reprisCents: calc.montantCents, motif, stock: remisEnStock ? "Les articles ont été remis en stock." : "" }));
      } catch (e) { console.error("[rembourser-commande] Emails de remboursement non envoyés :", e); }
    }

    return json({
      ok: true,
      refund_id: refund.id,
      statut: calc.statut,
      montant_rembourse: calc.montantCents / 100,
      total_rembourse: calc.nouveauTotalCents / 100,
      repris_artisan: (paiementDirect ? calc.montantCents : calc.reprisArtisanCents) / 100,
      // Paiement direct : si le solde de l'artisan ne couvre pas encore le remboursement, Stripe peut le laisser « en attente ».
      en_attente: paiementDirect && (refund.status === "pending" || refund.status === "requires_action"),
      remis_en_stock: remisEnStock,
    });

  } catch (e) {
    if (e instanceof ErreurMetier) return json({ error: e.message }, e.status);
    console.error("[rembourser-commande]", e);
    return json({ error: MSG_ERREUR_GENERIQUE }, 500); // le détail reste dans les journaux
  }
});
