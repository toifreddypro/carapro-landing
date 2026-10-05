// ═══════════════════════════════════════════════════════════
// CaraLink Artisans — Edge Function : prelever-commission-prestations
// Propriété : TOI Freddy
//
// À lancer une fois par mois (manuellement par l'admin pour l'instant, un
// vrai déclenchement automatique — Supabase Cron — pourra être branché
// une fois que ça tourne bien en pratique).
//
// Pour chaque artisan ayant enregistré une carte : calcule le CA "Terminée
// ou Payée" du MOIS PRÉCÉDENT sur les seuls clients "annuaire" (jamais les
// clients ajoutés à la main), applique le même seuil gratuit et le même
// calcul marginal que côté Ventes (creer-paiement-commande.ts), et prélève
// 7% de la part au-dessus du seuil sur la carte enregistrée — hors session,
// donc en son absence.
//
// Un mois déjà traité (même artisan, même mois) n'est JAMAIS retraité —
// contrainte unique en base, filet de sécurité en plus de la vérification
// applicative. Chaque artisan est indépendant : l'échec de l'un (carte
// refusée, etc.) n'empêche jamais de traiter les suivants.
//
// POST { mois_iso?: "AAAA-MM-01", simuler?: true }
//   simuler = true : calcule et montre ce qui SERAIT prélevé, sans rien débiter, enregistrer ni envoyer.
//
// Garde-fous :
//  - la carte enregistrée est retrouvée chez Stripe (carte par défaut du client, sinon la plus récente) et fournie au
//    paiement : Stripe n'utilise PAS automatiquement la carte du client pour un PaymentIntent ;
//  - une clé d'idempotence (artisan + mois + montant) : deux lancements qui se croisent ne débitent jamais deux fois ;
//  - seul un paiement dont Stripe confirme l'état « réussi » est enregistré comme prélevé ;
//  - un prix négatif ne diminue jamais la base de calcul ;
//  - un mois qui n'est pas terminé ne peut pas être prélevé pour de vrai (la simulation reste possible) ;
//  - si l'enregistrement échoue après un débit réussi, c'est signalé, jamais passé sous silence.
// ═══════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;
const ADMIN_EMAIL = "toifreddypro@gmail.com";
const CRON_SECRET = Deno.env.get("PRELEVEMENT_CRON_SECRET"); // déclenchement automatique mensuel (Supabase Cron)
const TAUX_COMMISSION = 0.07;
const SEUIL_GRATUIT_EUROS = 200; // même seuil que côté Ventes — à garder aligné si on le change un jour
const MINIMUM_STRIPE_CENTIMES = 50; // Stripe refuse tout prélèvement en dessous de 0,50€
const REGEX_MOIS = /^\d{4}-(0[1-9]|1[0-2])-01$/;
const MSG_ERREUR_GENERIQUE = "Une erreur est survenue. Réessayez dans un instant.";

// Tout ce qui vient d'un tiers (message d'erreur de Stripe…) est échappé avant d'entrer dans un email.
function escHtml(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (m) => (({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }) as Record<string, string>)[m]);
}
// Comparaison du secret sans fuite sur le temps de calcul.
function egalConstant(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function envoyerEmail(to: string, subject: string, html: string) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) { console.warn("[prelever-commission-prestations] RESEND_API_KEY absente — email non envoyé."); return; }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "CaraLink Artisans <notifications@learnlogicstudio.com>", to: [to], subject, html }),
    });
    if (!res.ok) console.error("[prelever-commission-prestations] Échec envoi Resend :", await res.text());
  } catch (e) { console.error("[prelever-commission-prestations] Erreur envoi email :", e); }
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function euros(centimes: number): string {
  return (centimes / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

// Même calcul marginal que creer-paiement-commande.ts (sans effet de seuil brutal), en centimes.
function calculerCommissionAvecSeuil(montantCentimes: number, seuilCentimes: number, taux: number) {
  const montantCommissionneCentimes = Math.max(0, montantCentimes - seuilCentimes);
  return { commissionCentimes: Math.round(montantCommissionneCentimes * taux), montantCommissionneCentimes };
}

// 1er jour du mois précédent, et 1er jour du mois en cours (borne exclusive) — au format AAAA-MM-JJ.
function bornesMoisPrecedent(): { debut: string; finExclusive: string; moisISO: string } {
  const maintenant = new Date();
  const debut = new Date(Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth() - 1, 1));
  const finExclusive = new Date(Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth(), 1));
  return { debut: debut.toISOString().slice(0, 10), finExclusive: finExclusive.toISOString().slice(0, 10), moisISO: debut.toISOString().slice(0, 10) };
}

async function caPrestationsAnnuaireDuMois(sb: any, artisanId: string, debut: string, finExclusive: string): Promise<number> {
  const { data, error } = await sb.from("mpa_artisans_interventions")
    .select("prix, mpa_artisans_clients!inner(origine)")
    .eq("artisan_id", artisanId)
    .eq("mpa_artisans_clients.origine", "annuaire")
    .in("statut", ["terminee", "payee"])
    .gte("date_intervention", debut)
    .lt("date_intervention", finExclusive);
  if (error) throw error;
  const totalCentimes = (data || []).reduce((s: number, i: any) => s + Math.max(0, Math.round((Number(i.prix) || 0) * 100)), 0); // un prix négatif ne fait jamais baisser la base
  return totalCentimes;
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
  return { ok: res.ok, status: res.status, data };
}

async function stripeGet(path: string) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, { headers: { "Authorization": `Bearer ${STRIPE_SECRET_KEY}` } });
  const data = await res.json();
  return { ok: res.ok, data };
}

// La carte à débiter : la carte par défaut du client si elle existe, sinon la plus récemment enregistrée.
// (Stripe n'utilise pas tout seul la carte d'un client pour un PaymentIntent : il faut la lui désigner.)
async function carteEnregistree(customerId: string): Promise<string | null> {
  const liste = await stripeGet(`customers/${encodeURIComponent(customerId)}/payment_methods?type=card&limit=10`);
  const cartes: Array<{ id: string }> = (liste.ok && Array.isArray(liste.data?.data)) ? liste.data.data : [];
  if (cartes.length === 0) return null;
  const client = await stripeGet(`customers/${encodeURIComponent(customerId)}`);
  const parDefaut = client.ok ? client.data?.invoice_settings?.default_payment_method : null;
  if (parDefaut && cartes.some((c) => c.id === parDefaut)) return parDefaut;
  return cartes[0].id;
}

async function traiterUnArtisan(sb: any, artisan: any, debut: string, finExclusive: string, moisISO: string, simuler: boolean) {
  const nom = artisan.nom_entreprise;
  // Filet de sécurité applicatif — la contrainte unique en base est le vrai garde-fou.
  const { data: dejaFait } = await sb.from("prelevements_prestations")
    .select("id").eq("artisan_id", artisan.id).eq("mois", moisISO).maybeSingle();
  if (dejaFait) return { artisan_id: artisan.id, nom, statut: "deja_traite" };

  const caTotalCentimes = await caPrestationsAnnuaireDuMois(sb, artisan.id, debut, finExclusive);
  const { commissionCentimes, montantCommissionneCentimes } = calculerCommissionAvecSeuil(caTotalCentimes, SEUIL_GRATUIT_EUROS * 100, TAUX_COMMISSION);

  const ligneBase = {
    artisan_id: artisan.id, mois: moisISO,
    ca_total: caTotalCentimes / 100,
    part_commissionnee: montantCommissionneCentimes / 100,
    commission_montant: commissionCentimes / 100,
  };

  // Enregistre le résultat du mois. Une ligne déjà présente (deux lancements simultanés) n'est pas une erreur :
  // l'autre lancement a fait le travail. Toute autre panne est remontée, jamais ignorée.
  const enregistrer = async (ligne: Record<string, unknown>): Promise<"ok" | "deja" | "echec"> => {
    const { error } = await sb.from("prelevements_prestations").insert(ligne);
    if (!error) return "ok";
    if ((error as any).code === "23505") return "deja";
    console.error("[prelever-commission-prestations] Enregistrement impossible :", error.message, JSON.stringify(ligne));
    return "echec";
  };

  if (commissionCentimes <= 0) {
    if (!simuler) await enregistrer({ ...ligneBase, statut: "sous_le_seuil" });
    return { artisan_id: artisan.id, nom, statut: "sous_le_seuil", ca: caTotalCentimes / 100 };
  }

  // Sous 0,50€, Stripe refuse le prélèvement — on ne tente pas, on note et on garde le CA en
  // mémoire pour l'admin, mais on n'essaie plus une carte qui échouerait de toute façon.
  if (commissionCentimes < MINIMUM_STRIPE_CENTIMES) {
    if (!simuler) await enregistrer({ ...ligneBase, statut: "sous_minimum_stripe" });
    return { artisan_id: artisan.id, nom, statut: "sous_minimum_stripe", commission: commissionCentimes / 100 };
  }

  const carte = artisan.stripe_customer_id ? await carteEnregistree(artisan.stripe_customer_id) : null;

  if (!carte) {
    if (simuler) return { artisan_id: artisan.id, nom, statut: "carte_manquante", commission: commissionCentimes / 100 };
    await enregistrer({ ...ligneBase, statut: "echoue", erreur: "Aucune carte enregistrée." });
    if (artisan.email) {
      await envoyerEmail(artisan.email, "⚠️ Une carte est nécessaire pour votre commission CaraLink",
        `<div style="font-family:sans-serif;max-width:480px;">
          <h2 style="color:#B5502F;">Commission due, aucune carte enregistrée</h2>
          <p>Bonjour,</p>
          <p>Vos prestations trouvées via CaraLink ont dépassé le seuil gratuit ce mois-ci (${moisISO.slice(0, 7)}) : ${euros(commissionCentimes)} de commission sont dus, mais aucune carte n'est enregistrée sur votre compte.</p>
          <p>Merci d'enregistrer une carte dans MPA Artisans (Tableau de bord → Carte prestations) pour régulariser.</p>
          <p style="margin-top:20px;"><a href="https://caralink.app/mpa/" style="color:#B5502F;font-weight:700;">Ouvrir MPA Artisans →</a></p>
        </div>`);
    }
    return { artisan_id: artisan.id, nom, statut: "echoue", erreur: "Aucune carte enregistrée." };
  }

  if (simuler) return { artisan_id: artisan.id, nom, statut: "a_prelever", commission: commissionCentimes / 100 };

  const { ok, status, data: intent } = await stripeCall("payment_intents", {
    amount: String(commissionCentimes),
    currency: "eur",
    customer: artisan.stripe_customer_id,
    payment_method: carte,
    off_session: "true",
    confirm: "true",
    description: `Commission CaraLink Artisans — prestations ${moisISO.slice(0, 7)} — ${artisan.nom_entreprise}`,
    "metadata[artisan_id]": artisan.id,
    "metadata[mois]": moisISO,
  }, `commission-prestations_${artisan.id}_${moisISO}_${commissionCentimes}`); // même artisan + même mois + même montant = jamais deux débits

  // Une autre requête avec la même clé est encore en cours après plusieurs attentes (lancement simultané) : ce n'est PAS un échec de
  // carte. On ne note rien et on n'écrit pas à l'artisan : l'autre lancement fait le travail.
  if (!ok && status === 409) return { artisan_id: artisan.id, nom, statut: "deja_traite" };

  // Seul un paiement dont Stripe confirme l'état « réussi » compte comme prélevé.
  if (!ok || intent?.status !== "succeeded") {
    const motif = intent?.error?.message || (intent?.status ? `Paiement non abouti (état Stripe : ${intent.status}).` : "Erreur Stripe.");
    await enregistrer({ ...ligneBase, statut: "echoue", erreur: motif });
    if (artisan.email) {
      await envoyerEmail(artisan.email, "⚠️ Le prélèvement de votre commission CaraLink a échoué",
        `<div style="font-family:sans-serif;max-width:480px;">
          <h2 style="color:#B5502F;">Prélèvement de commission — échec</h2>
          <p>Bonjour,</p>
          <p>Le prélèvement automatique de ${euros(commissionCentimes)} (commission sur vos prestations de ${moisISO.slice(0, 7)}) n'a pas pu être effectué${intent?.error?.message ? " : " + escHtml(intent.error.message) : ""}.</p>
          <p>Merci de mettre à jour votre carte enregistrée dans MPA Artisans (Tableau de bord → Carte prestations) pour régulariser.</p>
          <p style="margin-top:20px;"><a href="https://caralink.app/mpa/" style="color:#B5502F;font-weight:700;">Ouvrir MPA Artisans →</a></p>
        </div>`);
    }
    return { artisan_id: artisan.id, nom, statut: "echoue", erreur: motif };
  }

  const suite = await enregistrer({ ...ligneBase, statut: "reussi", stripe_payment_intent_id: intent.id });
  if (suite === "echec") return { artisan_id: artisan.id, nom, statut: "reussi_non_enregistre", commission: commissionCentimes / 100, stripe_payment_intent_id: intent.id, erreur: "Débit réussi chez Stripe mais non enregistré en base : à vérifier." };
  if (suite === "deja") return { artisan_id: artisan.id, nom, statut: "deja_traite" };
  return { artisan_id: artisan.id, nom, statut: "reussi", commission: commissionCentimes / 100 };
}

// Bornes du mois demandé, ou du mois précédent si rien n'est précisé. Un vrai prélèvement n'a lieu que sur un mois TERMINÉ.
function lireMois(moisIso: unknown, simuler: boolean): { debut: string; finExclusive: string; moisISO: string } | string {
  if (moisIso == null || moisIso === "") return bornesMoisPrecedent();
  if (typeof moisIso !== "string" || !REGEX_MOIS.test(moisIso)) return "Mois invalide : le format attendu est AAAA-MM-01.";
  const d = new Date(moisIso + "T00:00:00Z");
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== moisIso) return "Mois invalide.";
  const maintenant = new Date();
  const debutMoisCourant = new Date(Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth(), 1)).toISOString().slice(0, 10);
  if (!simuler && moisIso >= debutMoisCourant) return "Ce mois n'est pas terminé : on ne prélève que des mois complets (vous pouvez le simuler).";
  d.setUTCMonth(d.getUTCMonth() + 1);
  return { debut: moisIso, finExclusive: d.toISOString().slice(0, 10), moisISO: moisIso };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);

  try {
    // Deux façons légitimes d'appeler cette fonction : une vraie session admin (bouton dans
    // l'admin), ou le secret partagé du déclenchement automatique mensuel (Supabase Cron) —
    // un job planifié n'a pas de session utilisateur, donc pas de jeton d'accès à présenter.
    const secretCron = req.headers.get("X-Cron-Secret") ?? "";
    const estCron = !!CRON_SECRET && egalConstant(secretCron, CRON_SECRET);

    if (!estCron) {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return json({ error: "Non authentifié." }, 401);
      const sbCaller = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await sbCaller.auth.getUser();
      if (!user || user.email !== ADMIN_EMAIL) return json({ error: "Réservé à l'administrateur." }, 403);
    }

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => ({}));
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Requête invalide." }, 400);
    if (body.simuler != null && typeof body.simuler !== "boolean") return json({ error: "Requête invalide." }, 400);
    const simuler = body.simuler === true;

    const mois = lireMois(body.mois_iso, simuler);
    if (typeof mois === "string") return json({ error: mois }, 400);
    const { debut, finExclusive, moisISO } = mois;

    const { data: artisans, error } = await sb.from("artisans").select("id, nom_entreprise, email, stripe_customer_id");
    if (error) throw error;

    const resultats = [];
    for (const artisan of artisans || []) {
      try {
        resultats.push(await traiterUnArtisan(sb, artisan, debut, finExclusive, moisISO, simuler));
      } catch (e) {
        console.error("[prelever-commission-prestations] artisan", artisan.id, e);
        resultats.push({ artisan_id: artisan.id, nom: artisan.nom_entreprise, statut: "erreur", erreur: (e as Error).message });
      }
    }

    return json({ ok: true, simulation: simuler, mois: moisISO, traites: resultats.length, resultats });

  } catch (e) {
    console.error("[prelever-commission-prestations]", e);
    return json({ error: MSG_ERREUR_GENERIQUE }, 500); // le détail reste dans les journaux
  }
});
