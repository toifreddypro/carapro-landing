// ═══════════════════════════════════════════════════════════
// CaraLink Artisans — Edge Function : supprimer-mon-compte
// Propriété : TOI Freddy
//
// Suppression RGPD à la demande de l'artisan lui-même (bouton en pied
// de page MPA Artisans). Résilie l'abonnement Stripe en cours s'il y
// en a un, puis efface toutes les données liées avant de supprimer
// le compte de connexion. Action définitive, jamais réversible.
// ═══════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function annulerAbonnementStripe(subscriptionId: string) {
  try {
    const res = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${STRIPE_SECRET_KEY}` },
    });
    if (!res.ok) console.error("[supprimer-mon-compte] Résiliation Stripe échouée :", await res.text());
  } catch (e) { console.error("[supprimer-mon-compte] Erreur résiliation Stripe :", e); }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Non authentifié." }, 401);

    const sbCaller = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await sbCaller.auth.getUser();
    if (!user) return json({ error: "Session invalide." }, 401);

    const sbAdmin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: artisan, error: errA } = await sbAdmin.from("artisans")
      .select("id, stripe_subscription_id").eq("user_id", user.id).maybeSingle();
    if (errA) throw errA;
    if (!artisan) return json({ error: "Aucun profil artisan trouvé pour ce compte." }, 404);

    const artisanId = artisan.id;

    // 1) Résilier l'abonnement Stripe en cours, pour ne jamais continuer à facturer
    //    quelqu'un qui vient de supprimer son compte.
    if (artisan.stripe_subscription_id) {
      await annulerAbonnementStripe(artisan.stripe_subscription_id);
    }

    // 2) Effacer toutes les données liées, dans un ordre qui respecte les dépendances.
    const tablesLiees = [
      "avis_carapro",
      "devis_reponses",
      "mpa_artisans_factures",
      "mpa_artisans_interventions",
      "mpa_artisans_clients",
      "artisans_photos",
      "artisans_services",
      "artisans_horaires",
      "artisans_indisponibilites",
    ];
    for (const table of tablesLiees) {
      const { error } = await sbAdmin.from(table).delete().eq("artisan_id", artisanId);
      if (error) console.error(`[supprimer-mon-compte] Échec suppression ${table} :`, error.message);
    }
    // Demandes de devis adressées directement à cet artisan (jamais les demandes "ouvertes"
    // qu'il aurait seulement prises en charge — celles-là restent visibles pour les autres).
    await sbAdmin.from("demandes_devis").delete().eq("artisan_id", artisanId);

    // 3) Supprimer la fiche artisan elle-même.
    const { error: errDel } = await sbAdmin.from("artisans").delete().eq("id", artisanId);
    if (errDel) throw errDel;

    // 4) Supprimer le compte de connexion — en dernier, pour ne jamais se retrouver avec
    //    un compte de connexion orphelin si une étape précédente avait échoué.
    const { error: errAuth } = await sbAdmin.auth.admin.deleteUser(user.id);
    if (errAuth) throw errAuth;

    return json({ ok: true });

  } catch (e) {
    console.error("[supprimer-mon-compte]", e);
    return json({ error: (e as Error).message }, 500);
  }
});
