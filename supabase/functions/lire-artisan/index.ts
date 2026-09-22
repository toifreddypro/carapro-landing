// ═══════════════════════════════════════════════════════════
// CaraPro — Edge Function : lire-artisan
// Propriété : TOI Freddy
// Profil complet d'un artisan (vitrine) — services, photos, bio.
// Jamais téléphone/email direct — l'échange passe par une demande de
// devis, comme pour le reste de la plateforme (jamais de coordonnées
// directes avant qu'un artisan choisisse de répondre).
//
// GET ?id=X
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

  const sb = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return json({ error: "Identifiant manquant." }, 400);

    const { data: artisan, error } = await sb.from("artisans")
      .select("id, nom_entreprise, secteur, commune, bio, photo_profil_url, verifie, rayon_intervention_km, alternance_niveau")
      .eq("id", id)
      .eq("actif", true)
      .maybeSingle();
    if (error) throw error;
    if (!artisan) return json({ error: "Artisan introuvable." }, 404);

    const { data: services } = await sb.from("artisans_services")
      .select("id, nom_service, description, prix_indicatif, unite, duree_estimee_min")
      .eq("artisan_id", id)
      .order("ordre", { ascending: true });

    const { data: photos } = await sb.from("artisans_photos")
      .select("url_photo, legende")
      .eq("artisan_id", id)
      .order("ordre", { ascending: true });

    const { data: avis } = await sb.from("avis_carapro")
      .select("client_nom, note, commentaire, created_at")
      .eq("artisan_id", id)
      .order("created_at", { ascending: false })
      .limit(10);

    const noteMoyenne = avis && avis.length
      ? Math.round((avis.reduce((s, a) => s + a.note, 0) / avis.length) * 10) / 10
      : null;

    return json({
      artisan,
      services: services || [],
      photos: photos || [],
      avis: avis || [],
      note_moyenne: noteMoyenne,
      nb_avis: (avis || []).length,
    });

  } catch (e) {
    console.error("[lire-artisan]", e);
    const msg = (e instanceof Error) ? e.message : (e && typeof e === "object" && "message" in e) ? String((e as any).message) : "Erreur serveur.";
    return json({ error: msg }, 500);
  }
});
