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
// ═══════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;
const ADMIN_EMAIL = "toifreddypro@gmail.com";
const TAUX_COMMISSION = 0.07;
const SEUIL_GRATUIT_EUROS = 300; // même seuil que côté Ventes — à garder aligné si on le change un jour

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
  const totalCentimes = (data || []).reduce((s: number, i: any) => s + Math.round((Number(i.prix) || 0) * 100), 0);
  return totalCentimes;
}

async function stripeCall(path: string, params: Record<string, string>) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${STRIPE_SECRET_KEY}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const data = await res.json();
  return { ok: res.ok, data };
}

async function traiterUnArtisan(sb: any, artisan: any, debut: string, finExclusive: string, moisISO: string) {
  // Filet de sécurité applicatif — la contrainte unique en base est le vrai garde-fou.
  const { data: dejaFait } = await sb.from("prelevements_prestations")
    .select("id").eq("artisan_id", artisan.id).eq("mois", moisISO).maybeSingle();
  if (dejaFait) return { artisan_id: artisan.id, statut: "deja_traite" };

  const caTotalCentimes = await caPrestationsAnnuaireDuMois(sb, artisan.id, debut, finExclusive);
  const { commissionCentimes, montantCommissionneCentimes } = calculerCommissionAvecSeuil(caTotalCentimes, SEUIL_GRATUIT_EUROS * 100, TAUX_COMMISSION);

  const ligneBase = {
    artisan_id: artisan.id, mois: moisISO,
    ca_total: caTotalCentimes / 100,
    part_commissionnee: montantCommissionneCentimes / 100,
    commission_montant: commissionCentimes / 100,
  };

  if (commissionCentimes <= 0) {
    await sb.from("prelevements_prestations").insert({ ...ligneBase, statut: "sous_le_seuil" });
    return { artisan_id: artisan.id, statut: "sous_le_seuil", ca: caTotalCentimes / 100 };
  }

  if (!artisan.stripe_customer_id) {
    await sb.from("prelevements_prestations").insert({ ...ligneBase, statut: "echoue", erreur: "Aucune carte enregistrée." });
    return { artisan_id: artisan.id, statut: "echoue", erreur: "Aucune carte enregistrée." };
  }

  const { ok, data: intent } = await stripeCall("payment_intents", {
    amount: String(commissionCentimes),
    currency: "eur",
    customer: artisan.stripe_customer_id,
    off_session: "true",
    confirm: "true",
    description: `Commission CaraLink Artisans — prestations ${moisISO.slice(0, 7)} — ${artisan.nom_entreprise}`,
    "metadata[artisan_id]": artisan.id,
    "metadata[mois]": moisISO,
  });

  if (!ok) {
    await sb.from("prelevements_prestations").insert({ ...ligneBase, statut: "echoue", erreur: intent?.error?.message || "Erreur Stripe." });
    return { artisan_id: artisan.id, statut: "echoue", erreur: intent?.error?.message };
  }

  await sb.from("prelevements_prestations").insert({ ...ligneBase, statut: "reussi", stripe_payment_intent_id: intent.id });
  return { artisan_id: artisan.id, statut: "reussi", commission: commissionCentimes / 100 };
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
    if (!user || user.email !== ADMIN_EMAIL) return json({ error: "Réservé à l'administrateur." }, 403);

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => ({}));

    const { debut, finExclusive, moisISO } = body.mois_iso
      ? { debut: body.mois_iso, finExclusive: (() => { const d = new Date(body.mois_iso + "T00:00:00Z"); d.setUTCMonth(d.getUTCMonth() + 1); return d.toISOString().slice(0, 10); })(), moisISO: body.mois_iso }
      : bornesMoisPrecedent();

    const { data: artisans, error } = await sb.from("artisans").select("id, nom_entreprise, stripe_customer_id");
    if (error) throw error;

    const resultats = [];
    for (const artisan of artisans || []) {
      try {
        resultats.push(await traiterUnArtisan(sb, artisan, debut, finExclusive, moisISO));
      } catch (e) {
        resultats.push({ artisan_id: artisan.id, statut: "erreur", erreur: (e as Error).message });
      }
    }

    return json({ ok: true, mois: moisISO, traites: resultats.length, resultats });

  } catch (e) {
    console.error("[prelever-commission-prestations]", e);
    return json({ error: (e as Error).message || "Erreur serveur." }, 500);
  }
});
