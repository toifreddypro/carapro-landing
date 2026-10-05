// ═══════════════════════════════════════════════════════════
// CaraLink Artisans — Edge Function : supprimer-mon-compte
// Propriété : TOI Freddy
//
// Suppression RGPD à la demande de l'artisan lui-même (bouton en pied
// de page MPA Artisans). Action définitive, jamais réversible.
//
// Déroulement (jamais dans un autre ordre) :
//  1. l'artisan ne peut pas supprimer son compte s'il DOIT une commission (mois en cours ou précédent non prélevé)
//     ou s'il a des commandes PAYÉES NON LIVRÉES : réponse 409 avec un message clair, RIEN n'est touché ;
//  2. l'abonnement Stripe est résilié ; si la résiliation échoue, on s'ARRÊTE (rien n'est supprimé : on ne
//     laisse jamais quelqu'un facturé sans compte) ;
//  3. la base supprime TOUT en une seule transaction (fonction SQL, voir securite-suppression-compte.sql) : tout ou
//     rien, avec une archive comptable ;
//  4. SEULEMENT ensuite : suppression du client Stripe, du compte de paiement et des fichiers (photos, pièces
//     justificatives). Un échec de ce ménage est journalisé, il n'annule jamais la suppression.
// ═══════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;
const MSG_ERREUR_GENERIQUE = "Une erreur est survenue : votre compte n'a pas été supprimé. Réessayez dans un instant ou contactez le support.";

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const euros = (n: number) => n.toFixed(2).replace(".", ",") + " €";
function moisEnFrancais(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
}
function messageDeRefus(v: any): string {
  const raisons: string[] = [];
  if (Number(v?.commission_due) > 0) {
    const mois = (v.detail_commission ?? []).map((d: any) => moisEnFrancais(String(d.mois))).join(" et ");
    raisons.push(`Vous devez encore ${euros(Number(v.commission_due))} de commission sur vos prestations (${mois}). Elle est prélevée après la fin du mois : vous pourrez supprimer votre compte ensuite.`);
  }
  if (Number(v?.commandes_non_livrees) > 0) {
    const n = Number(v.commandes_non_livrees);
    raisons.push(`Vous avez ${n} commande${n > 1 ? "s" : ""} payée${n > 1 ? "s" : ""} pas encore livrée${n > 1 ? "s" : ""} : terminez-${n > 1 ? "les" : "la"} ou remboursez-${n > 1 ? "les" : "la"} avant de supprimer votre compte.`);
  }
  return raisons.join(" ") + " En cas de doute, contactez le support.";
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

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Non authentifié." }, 401);

    const sbCaller = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await sbCaller.auth.getUser();
    if (!user) return json({ error: "Session invalide." }, 401);

    const sbAdmin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Le compte supprimé est TOUJOURS celui de la session : jamais un identifiant envoyé par la page.
    const { data: artisan, error: errA } = await sbAdmin.from("artisans")
      .select("id, stripe_subscription_id, stripe_customer_id, stripe_connect_account_id").eq("user_id", user.id).maybeSingle();
    if (errA) throw errA;
    if (!artisan) return json({ error: "Aucun profil artisan trouvé pour ce compte." }, 404);

    // 1) Commission due ou commandes payées non livrées : on refuse, sans rien toucher.
    const { data: verif, error: errV } = await sbAdmin.rpc("verifier_suppression_artisan", { p_artisan_id: artisan.id });
    if (errV) throw errV;
    if (verif?.bloque) return json({ error: messageDeRefus(verif), refuse: true }, 409);

    // 2) Résilier l'abonnement AVANT de supprimer ; en cas d'échec, on s'arrête : rien n'est supprimé.
    if (artisan.stripe_subscription_id) {
      const r = await resilierAbonnement(artisan.stripe_subscription_id);
      if (r === "echec") return json({ error: "La résiliation de votre abonnement n'a pas pu être effectuée : rien n'a été supprimé. Réessayez dans un instant ou contactez le support." }, 502);
    }

    // 3) Suppression de TOUT en une seule transaction (avec archive comptable).
    const { data: resultat, error: errDel } = await sbAdmin.rpc("supprimer_mon_compte_artisan", { p_user_id: user.id });
    if (errDel) throw errDel;
    if (resultat?.refuse) return json({ error: messageDeRefus(resultat), refuse: true }, 409); // la situation a changé entre-temps

    // 4) Seulement maintenant que la base a confirmé : le ménage chez Stripe et dans le stockage.
    const avertissements = [
      ...(await nettoyerStripe(artisan.stripe_customer_id ?? null, artisan.stripe_connect_account_id ?? null)),
      ...(await supprimerFichiers(sbAdmin, user.id)),
    ];
    if (avertissements.length) console.error("[supprimer-mon-compte] Ménage incomplet (à traiter à la main) :", avertissements.join(" | "));

    return json({ ok: true });

  } catch (e) {
    console.error("[supprimer-mon-compte]", e);
    return json({ error: MSG_ERREUR_GENERIQUE }, 500); // le détail reste dans les journaux, jamais chez l'utilisateur
  }
});
