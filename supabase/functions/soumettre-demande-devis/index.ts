// ═══════════════════════════════════════════════════════════
// CaraPro — Edge Function : soumettre-demande-devis
// Propriété : TOI Freddy
// Crée une demande de devis, ouverte aux artisans du secteur/commune
// concernés — zéro friction client (nom + téléphone seulement, comme
// CaraLink). Si lancée depuis la fiche d'un artisan précis, une
// réponse "pré-remplie" est aussi créée pour lui, pour qu'il la voie
// immédiatement dans son espace MPA Artisans (onglet "Demandes").
//
// Envoie aussi un email de notification (Resend) : à l'artisan visé
// si la demande est privée, ou à tous les artisans du secteur si elle
// est ouverte. Un échec d'envoi d'email ne fait jamais échouer la
// demande elle-même — l'email est un bonus, pas une dépendance dure.
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

async function envoyerEmail(to: string, subject: string, html: string) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) { console.warn("[soumettre-demande-devis] RESEND_API_KEY absente — email non envoyé."); return; }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "CaraLink Artisans <notifications@learnlogicstudio.com>",
        to: [to],
        subject,
        html,
      }),
    });
    if (!res.ok) console.error("[soumettre-demande-devis] Échec envoi Resend :", await res.text());
  } catch (e) {
    console.error("[soumettre-demande-devis] Erreur envoi email :", e);
  }
}

function emailHtmlDemande(clientNom: string, clientTel: string, commune: string, description: string, secteur: string): string {
  return `
    <div style="font-family:sans-serif;max-width:480px;">
      <h2 style="color:#B5502F;">📢 Nouvelle demande de devis</h2>
      <p><strong>${clientNom}</strong> (${commune}) recherche un artisan en <strong>${secteur}</strong>.</p>
      <p style="background:#f7f9fc;padding:12px 16px;border-radius:8px;">${description}</p>
      <p>☎ <a href="tel:${clientTel}">${clientTel}</a></p>
      <p style="font-size:12px;color:#6b7c96;margin-top:20px;">Répondez directement depuis votre espace MPA Artisans, onglet « Demandes ».</p>
    </div>
  `;
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
      statut: artisan_id ? "directe" : "ouverte",
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

    // ── Notification email — jamais bloquante pour la demande elle-même ──
    try {
      const emailHtml = emailHtmlDemande(client_nom, client_telephone, commune, description_besoin, secteur);

      if (artisan_id) {
        // Demande privée : uniquement l'artisan visé
        const { data: artisan } = await sb.from("artisans").select("user_id, nom_entreprise").eq("id", artisan_id).maybeSingle();
        if (artisan?.user_id) {
          const { data: userData } = await sb.auth.admin.getUserById(artisan.user_id);
          if (userData?.user?.email) {
            await envoyerEmail(userData.user.email, `Nouvelle demande de devis — ${client_nom}`, emailHtml);
          }
        }
      } else {
        // Demande ouverte : tous les artisans du secteur
        const { data: artisans } = await sb.from("artisans").select("user_id").eq("secteur", secteur);
        for (const a of artisans ?? []) {
          const { data: userData } = await sb.auth.admin.getUserById(a.user_id);
          if (userData?.user?.email) {
            await envoyerEmail(userData.user.email, `Nouvelle demande dans votre secteur — ${client_nom}`, emailHtml);
          }
        }
      }
    } catch (emailErr) {
      console.error("[soumettre-demande-devis] Notification email échouée (demande créée quand même) :", emailErr);
    }

    return json({ success: true, demande_id: demande.id });

  } catch (e) {
    console.error("[soumettre-demande-devis]", e);
    const msg = (e instanceof Error) ? e.message : "Erreur serveur.";
    return json({ error: msg }, 500);
  }
});
