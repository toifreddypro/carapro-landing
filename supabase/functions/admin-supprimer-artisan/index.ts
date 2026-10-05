// TOI Freddy
// ════════════════════════════════════════
// admin-supprimer-artisan
// Supprime définitivement un compte artisan et toutes ses données liées. L'administrateur peut TOUJOURS supprimer
// (comptes de test, demande explicite) : la vérification « commission due / commandes non livrées » ne vaut que pour
// l'artisan lui-même. Une archive comptable est conservée dans tous les cas.
//
// Déroulement : session admin vérifiée côté serveur → abonnement Stripe résilié (si la résiliation échoue, on
// s'arrête, rien n'est supprimé) → suppression de TOUT en une seule transaction (fonction SQL, droits réservés au
// serveur) → ensuite seulement, ménage chez Stripe et dans le stockage. Les éventuels restes sont renvoyés dans
// « avertissements », à traiter à la main.
// ════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;
const ADMIN_EMAIL = "toifreddypro@gmail.com";
const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MSG_ERREUR_GENERIQUE = "Erreur lors de la suppression : rien n'a été supprimé (voir les journaux de la fonction pour le détail).";

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── Ménage chez Stripe et dans le stockage : JAMAIS avant que la base ait confirmé la suppression ──
async function stripeDelete(chemin: string): Promise<{ ok: boolean; status: number }> {
  try {
    const res = await fetch(`https://api.stripe.com/v1/${chemin}`, { method: "DELETE", headers: { "Authorization": `Bearer ${STRIPE_SECRET_KEY}` } });
    if (!res.ok) console.error(`[suppression] Stripe DELETE ${chemin} :`, res.status, await res.text().catch(() => ""));
    return { ok: res.ok, status: res.status };
  } catch (e) {
    console.error(`[suppression] Stripe DELETE ${chemin} impossible :`, e);
    return { ok: false, status: 0 };
  }
}

// Résilie l'abonnement. « absent » (404) : déjà résilié ou inexistant, ce n'est pas un obstacle. « echec » : on s'arrête, rien n'est supprimé.
async function resilierAbonnement(subscriptionId: string): Promise<"ok" | "absent" | "echec"> {
  const r = await stripeDelete(`subscriptions/${encodeURIComponent(subscriptionId)}`);
  return r.ok ? "ok" : (r.status === 404 ? "absent" : "echec");
}

async function nettoyerStripe(customerId: string | null, connectId: string | null): Promise<string[]> {
  const avertissements: string[] = [];
  if (customerId) { const r = await stripeDelete(`customers/${encodeURIComponent(customerId)}`); if (!r.ok && r.status !== 404) avertissements.push(`Client Stripe ${customerId} non supprimé : à vérifier dans le tableau de bord Stripe.`); }
  if (connectId) { const r = await stripeDelete(`accounts/${encodeURIComponent(connectId)}`); if (!r.ok && r.status !== 404) avertissements.push(`Compte de paiement Stripe ${connectId} non supprimé (solde ou virement en cours ?) : à traiter dans le tableau de bord Stripe.`); }
  return avertissements;
}

const BUCKETS_FICHIERS = ["artisans-photos", "artisans-documents"];

async function supprimerFichiers(sbAdmin: any, userId: string): Promise<string[]> {
  const avertissements: string[] = [];
  for (const bucket of BUCKETS_FICHIERS) {
    try {
      const chemins: string[] = [];
      const { data: racine, error } = await sbAdmin.storage.from(bucket).list(userId, { limit: 1000 });
      if (error) throw error;
      for (const f of racine ?? []) {
        if (f.id) { chemins.push(`${userId}/${f.name}`); continue; }
        const { data: sous } = await sbAdmin.storage.from(bucket).list(`${userId}/${f.name}`, { limit: 1000 }); // un niveau de sous-dossier
        for (const g of sous ?? []) if (g.id) chemins.push(`${userId}/${f.name}/${g.name}`);
      }
      if (chemins.length) {
        const { error: errRm } = await sbAdmin.storage.from(bucket).remove(chemins);
        if (errRm) throw errRm;
      }
    } catch (e) {
      console.error(`[suppression] Fichiers de ${bucket} non supprimés :`, e);
      avertissements.push(`Fichiers du stockage « ${bucket} » non supprimés : à vérifier.`);
    }
  }
  return avertissements;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const sbAdmin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
  const sbAnon  = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") ?? "");

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Non authentifié." }, 401);

    // Vérification admin côté serveur — jamais uniquement côté client.
    const { data: userData, error: userErr } = await sbAnon.auth.getUser(token);
    if (userErr || !userData?.user) return json({ error: "Session invalide." }, 401);
    if (userData.user.email !== ADMIN_EMAIL) return json({ error: "Accès refusé." }, 403);

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body) || !body.user_id) return json({ error: "user_id manquant." }, 400);
    if (typeof body.user_id !== "string" || !REGEX_UUID.test(body.user_id)) return json({ error: "user_id invalide." }, 400);
    const userId: string = body.user_id;

    // Les identifiants Stripe sont lus AVANT la suppression (le profil disparaît avec ses colonnes).
    const { data: artisan, error: errA } = await sbAdmin.from("artisans")
      .select("id, stripe_subscription_id, stripe_customer_id, stripe_connect_account_id").eq("user_id", userId).maybeSingle();
    if (errA) throw errA;

    if (artisan?.stripe_subscription_id) {
      const r = await resilierAbonnement(artisan.stripe_subscription_id);
      if (r === "echec") return json({ error: "La résiliation de l'abonnement Stripe a échoué : rien n'a été supprimé. Réessaie dans un instant (ou résilie-le à la main dans Stripe)." }, 502);
    }

    const { data, error } = await sbAdmin.rpc("supprimer_compte_artisan", { p_user_id: userId, p_admin_user_id: userData.user.id });
    if (error) throw error;

    const avertissements = artisan
      ? [...(await nettoyerStripe(artisan.stripe_customer_id ?? null, artisan.stripe_connect_account_id ?? null)), ...(await supprimerFichiers(sbAdmin, userId))]
      : await supprimerFichiers(sbAdmin, userId);
    if (avertissements.length) console.error("[admin-supprimer-artisan] Ménage incomplet (à traiter à la main) :", avertissements.join(" | "));

    return json({ ...(data ?? {}), avertissements });

  } catch (e) {
    console.error("[admin-supprimer-artisan]", e);
    return json({ error: MSG_ERREUR_GENERIQUE }, 500); // le détail reste dans les journaux
  }
});
