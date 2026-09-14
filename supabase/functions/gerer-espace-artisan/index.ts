// ═══════════════════════════════════════════════════════════
// CaraLink Artisans — Edge Function : gerer-espace-artisan
// Propriété : TOI Freddy
// Toutes les écritures de l'espace artisan connecté, routées par
// "action" — jamais d'accès à un autre profil que le sien, vérifié à
// chaque appel via le token.
//
// POST { action, ...champs }
// Authorization: Bearer <token utilisateur>
//
// Actions : maj_profil | ajouter_service | modifier_service |
//           supprimer_service | ajouter_photo | supprimer_photo |
//           repondre_devis
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

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const sbAdmin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
  const sbAnon  = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") ?? "");

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Non authentifié." }, 401);

    const { data: userData, error: userErr } = await sbAnon.auth.getUser(token);
    if (userErr || !userData?.user) return json({ error: "Session invalide." }, 401);
    const userId = userData.user.id;

    const { data: artisan, error: artErr } = await sbAdmin.from("artisans")
      .select("id").eq("user_id", userId).maybeSingle();
    if (artErr) throw artErr;
    if (!artisan) return json({ error: "Aucun profil artisan pour ce compte." }, 404);
    const artisanId = artisan.id;

    const body = await req.json().catch(() => null);
    if (!body || !body.action) return json({ error: "Requête invalide." }, 400);

    switch (body.action) {

      case "maj_profil": {
        const { nom_entreprise, secteur, commune, telephone, bio, rayon_intervention_km } = body;
        const { error } = await sbAdmin.from("artisans").update({
          nom_entreprise, secteur, commune, telephone, bio,
          rayon_intervention_km: rayon_intervention_km || 15,
        }).eq("id", artisanId);
        if (error) throw error;
        return json({ success: true });
      }

      case "ajouter_service": {
        const { nom_service, description, prix_indicatif, unite } = body;
        if (!nom_service) return json({ error: "Nom du service obligatoire." }, 400);
        const { data, error } = await sbAdmin.from("artisans_services").insert({
          artisan_id: artisanId, nom_service, description: description || null,
          prix_indicatif: prix_indicatif || null, unite: unite || null,
        }).select().single();
        if (error) throw error;
        return json({ success: true, service: data });
      }

      case "modifier_service": {
        const { id, nom_service, description, prix_indicatif, unite } = body;
        if (!id) return json({ error: "Identifiant manquant." }, 400);
        const { error } = await sbAdmin.from("artisans_services")
          .update({ nom_service, description, prix_indicatif, unite })
          .eq("id", id).eq("artisan_id", artisanId);
        if (error) throw error;
        return json({ success: true });
      }

      case "supprimer_service": {
        const { id } = body;
        if (!id) return json({ error: "Identifiant manquant." }, 400);
        const { error } = await sbAdmin.from("artisans_services").delete()
          .eq("id", id).eq("artisan_id", artisanId);
        if (error) throw error;
        return json({ success: true });
      }

      case "ajouter_photo": {
        const { url_photo, legende } = body;
        if (!url_photo) return json({ error: "Photo manquante." }, 400);
        const { data, error } = await sbAdmin.from("artisans_photos").insert({
          artisan_id: artisanId, url_photo, legende: legende || null,
        }).select().single();
        if (error) throw error;
        return json({ success: true, photo: data });
      }

      case "supprimer_photo": {
        const { id } = body;
        if (!id) return json({ error: "Identifiant manquant." }, 400);
        const { error } = await sbAdmin.from("artisans_photos").delete()
          .eq("id", id).eq("artisan_id", artisanId);
        if (error) throw error;
        return json({ success: true });
      }

      case "repondre_devis": {
        const { devis_reponse_id, message, prix_propose } = body;
        if (!devis_reponse_id || !message) return json({ error: "Message obligatoire." }, 400);
        const { error } = await sbAdmin.from("devis_reponses").update({
          message, prix_propose: prix_propose || null, statut: "vue",
        }).eq("id", devis_reponse_id).eq("artisan_id", artisanId);
        if (error) throw error;
        return json({ success: true });
      }

      default:
        return json({ error: "Action inconnue." }, 400);
    }

  } catch (e) {
    console.error("[gerer-espace-artisan]", e);
    const msg = (e instanceof Error) ? e.message : "Erreur serveur.";
    return json({ error: msg }, 500);
  }
});
