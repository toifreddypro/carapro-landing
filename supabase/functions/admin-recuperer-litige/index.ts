// ═══════════════════════════════════════════════════════════
// CaraLink Artisans — Edge Function : admin-recuperer-litige
// Propriété : TOI Freddy
//
// Action manuelle et volontaire (jamais automatique — voir la discussion du
// 01/10) : récupère le montant d'un litige auprès de l'artisan concerné, en
// inversant le virement ("transfer reversal") qui lui avait été fait au
// moment du paiement. Ne fonctionne que si l'artisan a encore ce montant
// disponible sur son solde Stripe — sinon Stripe refuse l'opération, ce
// n'est jamais une dette qu'on force silencieusement.
//
// Double vérification admin côté serveur, jamais côté client — même modèle
// que admin-supprimer-artisan.
//
// Sécurité : un double clic ne récupère JAMAIS deux fois (clé d'idempotence côté Stripe : sur un virement de 100 € et
// un litige de 50 €, deux reprises de 50 € laissaient l'artisan à -100 € au lieu de -50 €) ; le montant du litige est
// contrôlé ; l'identifiant est contrôlé ; si l'enregistrement du résultat échoue après une reprise réussie, c'est
// signalé (jamais passé sous silence) ; aucune erreur interne n'est détaillée (les refus de Stripe, utiles à l'admin, le sont).
// ═══════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;
const ADMIN_EMAIL = "toifreddypro@gmail.com";
const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MSG_ERREUR_GENERIQUE = "Une erreur est survenue : rien n'a été modifié (voir les journaux de la fonction).";

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function stripeGet(path: string) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    headers: { "Authorization": `Bearer ${STRIPE_SECRET_KEY}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || "Erreur Stripe.");
  return data;
}

// Stripe répond 409 quand une requête portant la MÊME clé d'idempotence est encore en cours (double clic) : on attend un
// instant puis on renvoie la même requête, qui rejoue alors le résultat du premier appel.
async function fetchAvecReprise(url: string, init: RequestInit): Promise<Response> {
  let res = await fetch(url, init);
  for (let i = 1; i <= 4 && res.status === 409; i++) {
    await new Promise((r) => setTimeout(r, 300 * i));
    res = await fetch(url, init);
  }
  return res;
}

async function stripePost(path: string, params: Record<string, string>, cleIdempotence?: string) {
  const headers: Record<string, string> = { "Authorization": `Bearer ${STRIPE_SECRET_KEY}`, "Content-Type": "application/x-www-form-urlencoded" };
  if (cleIdempotence) headers["Idempotency-Key"] = cleIdempotence;
  const res = await fetchAvecReprise(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers,
    body: new URLSearchParams(params),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || "Erreur Stripe.");
  return data;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);

  const sbAdmin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const sbAnon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Non authentifié." }, 401);
    const { data: userData, error: userErr } = await sbAnon.auth.getUser(token);
    if (userErr || !userData?.user) return json({ error: "Session invalide." }, 401);
    if (userData.user.email !== ADMIN_EMAIL) return json({ error: "Accès refusé." }, 403);

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body) || !body.litige_id) return json({ error: "litige_id manquant." }, 400);
    if (typeof body.litige_id !== "string" || !REGEX_UUID.test(body.litige_id)) return json({ error: "litige_id invalide." }, 400);

    const { data: litige, error: errL } = await sbAdmin.from("litiges_stripe")
      .select("id, stripe_charge_id, montant, transfer_reverse_statut, artisans(nom_entreprise)")
      .eq("id", body.litige_id).maybeSingle();
    if (errL) throw errL;
    if (!litige) return json({ error: "Litige introuvable." }, 404);
    if (litige.transfer_reverse_statut === "reussi") {
      return json({ error: "Ce litige a déjà été récupéré auprès de l'artisan." }, 409);
    }

    // Le virement vers l'artisan n'est jamais un objet séparé qu'on a créé nous-même (destination
    // charge : Stripe le crée tout seul) — il faut d'abord retrouver son identifiant via la charge.
    const montantCentimes = Math.round(Number(litige.montant) * 100);
    if (!Number.isFinite(montantCentimes) || montantCentimes <= 0) return json({ error: "Le montant de ce litige est invalide : rien à récupérer." }, 400);
    if (!litige.stripe_charge_id || typeof litige.stripe_charge_id !== "string") return json({ error: "Ce litige n'a pas de charge Stripe associée : rien à récupérer." }, 400);

    const charge = await stripeGet(`charges/${encodeURIComponent(litige.stripe_charge_id)}`);
    const transferId = charge.transfer;
    if (!transferId) {
      return json({ error: "Aucun virement trouvé pour cette charge — rien à récupérer." }, 400);
    }

    let reversal;
    try {
      // Clé d'idempotence : le même litige, le même montant = la MÊME reprise (jamais deux).
      reversal = await stripePost(`transfers/${encodeURIComponent(transferId)}/reversals`, {
        amount: String(montantCentimes),
      }, `recuperation-litige_${litige.id}_${montantCentimes}`);
    } catch (e) {
      // Échec Stripe (le plus souvent : solde insuffisant côté artisan) — on le consigne,
      // jamais une dette forcée en douce, l'admin reste informé de pourquoi ça n'a pas marché.
      await sbAdmin.from("litiges_stripe").update({
        transfer_reverse_statut: "echec", updated_at: new Date().toISOString(),
      }).eq("id", litige.id);
      return json({ error: "Échec de la récupération : " + (e as Error).message }, 400);
    }

    const { error: errMaj } = await sbAdmin.from("litiges_stripe").update({
      transfer_reverse_statut: "reussi",
      transfer_reverse_montant: reversal.amount / 100,
      transfer_reverse_le: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", litige.id);
    if (errMaj) {
      // La reprise a bien eu lieu chez Stripe : on le dit, au lieu de faire croire à un échec (et de laisser retenter).
      console.error("[admin-recuperer-litige] Reprise réussie mais enregistrement impossible :", errMaj.message, reversal.id);
      return json({ ok: true, montant_recupere: reversal.amount / 100, avertissement: `La récupération a bien eu lieu chez Stripe (${reversal.id}) mais n'a pas pu être enregistrée : ne la relance pas, vérifie le litige dans Stripe.` });
    }

    return json({ ok: true, montant_recupere: reversal.amount / 100 });

  } catch (e) {
    console.error("[admin-recuperer-litige]", e);
    return json({ error: MSG_ERREUR_GENERIQUE }, 500); // le détail reste dans les journaux
  }
});
