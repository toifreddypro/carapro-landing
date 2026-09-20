// ═══════════════════════════════════════════════════════════
// CaraPro — Edge Function : repondre-devis
// Propriété : TOI Freddy
//
// Cible des liens "✅ Confirmer" / "❌ Refuser" envoyés par email à
// l'artisan pour une proposition de créneau. Ouverte en GET (un simple
// clic sur un lien), sans connexion — le jeton secret dans l'URL fait
// office de preuve d'identité pour CETTE demande précise uniquement.
//
// GET ?token=xxx&action=confirmer|refuser
//
// Si "confirmer" :
//   - crée (ou réutilise) un client habituel pour cet artisan
//   - crée directement l'intervention dans son planning MPA Artisans
//   - envoie un email de confirmation au client, si celui-ci avait
//     choisi d'être recontacté par email
// Si "refuser" :
//   - marque simplement la demande comme refusée
//
// Retourne une page HTML simple (pas du JSON) puisque c'est ouvert
// directement dans un navigateur depuis un clic d'email.
// ═══════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function pageHtml(titre: string, message: string, couleur: string): Response {
  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${titre}</title>
    <style>
      body{font-family:'Outfit',Arial,sans-serif;background:#f7f9fc;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px;}
      .box{background:#fff;border-radius:16px;padding:40px;max-width:420px;text-align:center;box-shadow:0 8px 32px rgba(19,34,60,.1);}
      h1{color:${couleur};font-size:20px;margin-bottom:12px;}
      p{color:#6b7c96;font-size:14px;line-height:1.6;}
      a{color:#B5502F;font-weight:700;text-decoration:none;}
    </style></head>
    <body><div class="box"><h1>${titre}</h1><p>${message}</p></div></body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

async function envoyerEmail(to: string, subject: string, html: string) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) { console.warn("[repondre-devis] RESEND_API_KEY absente — email non envoyé."); return; }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "CaraLink Artisans <notifications@learnlogicstudio.com>", to: [to], subject, html }),
    });
    if (!res.ok) console.error("[repondre-devis] Échec envoi Resend :", await res.text());
  } catch (e) { console.error("[repondre-devis] Erreur envoi email :", e); }
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const action = url.searchParams.get("action");

  if (!token || (action !== "confirmer" && action !== "refuser")) {
    return pageHtml("Lien invalide", "Ce lien de confirmation est incomplet ou incorrect.", "#dc2626");
  }

  const sb = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  try {
    const { data: demande, error } = await sb.from("demandes_devis").select("*").eq("token", token).maybeSingle();
    if (error) throw error;
    if (!demande) {
      return pageHtml("Lien introuvable", "Cette proposition de créneau n'existe plus ou le lien est incorrect.", "#dc2626");
    }
    if (demande.statut !== "creneau_propose") {
      const dejaTraite = demande.statut === "creneau_confirme" ? "déjà confirmée" : "déjà traitée (refusée)";
      return pageHtml("Déjà traité", `Cette proposition de créneau a été ${dejaTraite} — aucune action supplémentaire n'est nécessaire.`, "#6b7c96");
    }

    // ── Récupérer l'artisan visé, via la demande de devis correspondante ──
    const { data: reponse } = await sb.from("devis_reponses").select("artisan_id").eq("demande_id", demande.id).maybeSingle();
    const artisanId = reponse?.artisan_id;
    if (!artisanId) {
      return pageHtml("Erreur", "Impossible de retrouver l'artisan associé à cette demande. Contactez le support.", "#dc2626");
    }

    if (action === "refuser") {
      await sb.from("demandes_devis").update({ statut: "creneau_refuse" }).eq("id", demande.id);
      return pageHtml("Créneau refusé", "C'est noté — ce créneau a été refusé. Le client n'a pas été notifié automatiquement ; pensez à le prévenir vous-même si besoin.", "#6b7c96");
    }

    // ── action === "confirmer" ──

    // 1) Client habituel : on en crée un nouveau à partir des infos de la demande
    //    (plus simple et plus sûr que de deviner un doublon existant — l'artisan pourra fusionner à la main si besoin)
    const { data: client, error: errClient } = await sb.from("mpa_artisans_clients").insert({
      artisan_id: artisanId,
      nom: demande.client_nom,
      adresse: demande.adresse,
      code_postal: demande.code_postal,
      commune: demande.commune,
      delai_paiement: 30,
    }).select().single();
    if (errClient) throw errClient;

    // 2) Intervention créée directement dans le planning
    const { error: errInter } = await sb.from("mpa_artisans_interventions").insert({
      artisan_id: artisanId,
      client_id: client.id,
      service_id: demande.service_id || null,
      date_intervention: demande.date_intervention,
      heure_debut: demande.heure_debut,
      heure_fin: demande.heure_fin,
      creneau: demande.heure_debut < "12:00" ? "matin" : "apres_midi",
      adresse: demande.adresse,
      code_postal: demande.code_postal,
      commune: demande.commune,
      latitude: demande.latitude,
      longitude: demande.longitude,
      notes: demande.description_besoin,
      statut: "planifiee",
    });
    if (errInter) throw errInter;

    await sb.from("demandes_devis").update({ statut: "creneau_confirme" }).eq("id", demande.id);

    // 3) Email de confirmation au client, si celui-ci avait choisi ce canal — jamais bloquant
    try {
      if (demande.contact_prefere === "email" && demande.client_email) {
        const dateAff = new Date(demande.date_intervention).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
        const html = `<div style="font-family:sans-serif;max-width:480px;">
          <h2 style="color:#16a34a;">✅ Rendez-vous confirmé</h2>
          <p>Votre intervention du <strong>${dateAff} à ${demande.heure_debut}</strong> est confirmée.</p>
          <p style="font-size:12px;color:#6b7c96;">À bientôt !</p>
        </div>`;
        await envoyerEmail(demande.client_email, `Rendez-vous confirmé — ${dateAff}`, html);
      }
    } catch (e) { console.error("[repondre-devis] Email de confirmation client échoué :", e); }

    return pageHtml("Créneau confirmé ✅", "L'intervention a été ajoutée à votre planning MPA Artisans, et le client a été notifié si vous aviez son email. À bientôt !", "#16a34a");

  } catch (e) {
    console.error("[repondre-devis]", e);
    return pageHtml("Erreur", "Une erreur est survenue. Réessayez ou contactez le support.", "#dc2626");
  }
});
