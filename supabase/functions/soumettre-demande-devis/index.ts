// ═══════════════════════════════════════════════════════════
// CaraPro — Edge Function : soumettre-demande-devis
// Propriété : TOI Freddy
// Crée une demande de devis, ouverte aux artisans du secteur/commune
// concernés — zéro friction client (nom + téléphone seulement, comme
// CaraLink). Si lancée depuis la fiche d'un artisan précis, une
// réponse "pré-remplie" est aussi créée pour lui, pour qu'il la voie
// immédiatement dans son espace (à construire).
//
// POST { client_nom, client_telephone, secteur, description_besoin,
//        commune, artisan_id? }
// ═══════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);

  const sb = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  try {
    const body = await req.json().catch(() => null);
    if (!body) return json({ error: "Requête invalide." }, 400);

    const { client_nom, client_telephone, secteur, description_besoin, commune, artisan_id } = body;

    if (!client_nom || !client_telephone || !secteur || !description_besoin || !commune) {
      return json({ error: "Champs obligatoires manquants." }, 400);
    }
    if (!/^[0-9+\s.-]{8,20}$/.test(client_telephone)) {
      return json({ error: "Numéro de téléphone invalide." }, 400);
    }

    const { data: demande, error } = await sb.from("demandes_devis").insert({
      client_nom, client_telephone, secteur, description_besoin, commune,
      statut: "ouverte",
    }).select().single();
    if (error) throw error;

    if (artisan_id) {
      await sb.from("devis_reponses").insert({
        demande_id: demande.id,
        artisan_id,
        message: "",
        statut: "envoyee",
      });
    }

    return json({ success: true, demande_id: demande.id });

  } catch (e) {
    console.error("[soumettre-demande-devis]", e);
    const msg = (e instanceof Error) ? e.message : "Erreur serveur.";
    return json({ error: msg }, 500);
  }
});
