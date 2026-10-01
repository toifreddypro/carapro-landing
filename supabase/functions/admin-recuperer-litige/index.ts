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
// ═══════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;
const ADMIN_EMAIL = "toifreddypro@gmail.com";

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

async function stripePost(path: string, params: Record<string, string>) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${STRIPE_SECRET_KEY}`, "Content-Type": "application/x-www-form-urlencoded" },
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
    if (!body?.litige_id) return json({ error: "litige_id manquant." }, 400);

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
    const charge = await stripeGet(`charges/${litige.stripe_charge_id}`);
    const transferId = charge.transfer;
    if (!transferId) {
      return json({ error: "Aucun virement trouvé pour cette charge — rien à récupérer." }, 400);
    }

    let reversal;
    try {
      reversal = await stripePost(`transfers/${transferId}/reversals`, {
        amount: String(Math.round(litige.montant * 100)),
      });
    } catch (e) {
      // Échec Stripe (le plus souvent : solde insuffisant côté artisan) — on le consigne,
      // jamais une dette forcée en douce, l'admin reste informé de pourquoi ça n'a pas marché.
      await sbAdmin.from("litiges_stripe").update({
        transfer_reverse_statut: "echec", updated_at: new Date().toISOString(),
      }).eq("id", litige.id);
      return json({ error: "Échec de la récupération : " + (e as Error).message }, 400);
    }

    await sbAdmin.from("litiges_stripe").update({
      transfer_reverse_statut: "reussi",
      transfer_reverse_montant: reversal.amount / 100,
      transfer_reverse_le: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", litige.id);

    return json({ ok: true, montant_recupere: reversal.amount / 100 });

  } catch (e) {
    console.error("[admin-recuperer-litige]", e);
    return json({ error: (e as Error).message }, 500);
  }
});
