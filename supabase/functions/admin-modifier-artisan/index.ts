// ═══════════════════════════════════════════════════════════
// CaraLink Artisans — Edge Function : admin-modifier-artisan
// Propriété : TOI Freddy
//
// Permet à l'admin (toifreddypro@gmail.com uniquement, vérifié côté
// serveur) de modifier le statut d'abonnement ou le badge vérifié
// d'un artisan — jamais d'écriture directe depuis le client, même
// pour l'admin, comme pour la suppression de compte.
//
// POST { artisan_id, abonnement_statut? , verifie? }
// ═══════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ADMIN_EMAIL = "toifreddypro@gmail.com";
const STATUTS_VALIDES = ["essai", "actif", "lecture_seule", "annule"];

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Non authentifié." }, 401);

    // Vérification admin côté serveur — jamais confiée au client, même pour n'afficher que le bouton.
    const sbCaller = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await sbCaller.auth.getUser();
    if (!user || user.email !== ADMIN_EMAIL) {
      return json({ error: "Accès réservé à l'administrateur." }, 403);
    }

    const body = await req.json().catch(() => null);
    const artisanId = body?.artisan_id;
    if (!artisanId) return json({ error: "artisan_id manquant." }, 400);

    const maj: Record<string, unknown> = {};
    if (body?.abonnement_statut !== undefined) {
      if (!STATUTS_VALIDES.includes(body.abonnement_statut)) return json({ error: "Statut d'abonnement invalide." }, 400);
      maj.abonnement_statut = body.abonnement_statut;
    }
    if (body?.verifie !== undefined) {
      maj.verifie = !!body.verifie;
    }
    if (Object.keys(maj).length === 0) return json({ error: "Rien à modifier." }, 400);

    const sbAdmin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { error } = await sbAdmin.from("artisans").update(maj).eq("id", artisanId);
    if (error) throw error;

    return json({ ok: true });

  } catch (e) {
    console.error("[admin-modifier-artisan]", e);
    return json({ error: (e as Error).message }, 500);
  }
});
