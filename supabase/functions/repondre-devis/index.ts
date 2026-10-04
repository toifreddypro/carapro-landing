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
//   → affiche une petite page avec un champ de message optionnel
//     (impossible de taper un message directement depuis un lien
//     d'email — d'où cette étape intermédiaire, un simple formulaire
//     HTML sans JavaScript, qui fonctionne dans n'importe quel client
//     mail).
//
// GET ?token=xxx&action=confirmer|refuser&execute=1&message=...
//   → exécute réellement l'action (utilisé par le formulaire ci-dessus,
//     et directement par les boutons in-app de MPA Artisans qui
//     demandent le message via une simple invite avant l'appel).
//
// Si "confirmer" :
//   - crée (ou réutilise) un client habituel pour cet artisan
//   - crée directement l'intervention dans son planning MPA Artisans
//   - envoie un email de confirmation au client, avec le message
//     éventuel de l'artisan, si celui-ci avait donné son email
// Si "refuser" :
//   - marque la demande comme refusée
//   - envoie un email au client avec le message éventuel, s'il avait
//     donné son email
//
// Retourne toujours une page HTML (pas du JSON) puisque c'est ouvert
// directement dans un navigateur depuis un clic d'email.
//
// Sécurité :
//  - le lien de l'email n'affiche qu'un formulaire : rien n'est exécuté sans execute=1 ;
//  - la demande est "réclamée" de façon atomique AVANT toute écriture : un double-clic ou deux envois
//    simultanés ne créent jamais deux clients ni deux interventions ;
//  - si une étape échoue, tout est annulé (client créé, statut) pour qu'un nouvel essai reparte propre ;
//  - une proposition dont la date est passée n'est plus valable ;
//  - tout ce qui entre dans une page ou un email est échappé ; une erreur interne n'est jamais affichée ;
//  - les pages interdisent d'être affichées dans un cadre d'un autre site (anti-piégeage de clic).
// ═══════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MESSAGE_MAX = 1000;
const ENTETES_PAGE = {
  ...corsHeaders,
  "Content-Type": "text/html; charset=utf-8",
  "Content-Disposition": "inline",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
};

// Tout ce qui vient d'une URL, d'un artisan ou d'un visiteur est échappé avant d'entrer dans une page ou un email.
function escHtml(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (m) => (({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }) as Record<string, string>)[m]);
}
function telHref(tel: string): string { return String(tel ?? "").replace(/[^0-9+]/g, ""); }

function pageHtml(titre: string, message: string, couleur: string): Response {
  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escHtml(titre)}</title>
    <style>
      body{font-family:'Outfit',Arial,sans-serif;background:#f7f9fc;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px;}
      .box{background:#fff;border-radius:16px;padding:40px;max-width:420px;text-align:center;box-shadow:0 8px 32px rgba(19,34,60,.1);}
      h1{color:${couleur};font-size:20px;margin-bottom:12px;}
      p{color:#6b7c96;font-size:14px;line-height:1.6;}
      a{color:#B5502F;font-weight:700;text-decoration:none;}
    </style></head>
    <body><div class="box"><h1>${escHtml(titre)}</h1><p>${escHtml(message)}</p></div></body></html>`;
  return new Response(html, { headers: ENTETES_PAGE });
}

function formulaireMessageHtml(token: string, action: string, dateAff: string, heure: string): Response {
  const estConfirmer = action === "confirmer";
  const titre = estConfirmer ? "Confirmer ce créneau" : "Refuser ce créneau";
  const couleur = estConfirmer ? "#16a34a" : "#6b7c96";
  const valeurDefaut = estConfirmer ? "" : "Désolé, ce créneau n'est finalement plus disponible.";
  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escHtml(titre)}</title>
    <style>
      body{font-family:'Outfit',Arial,sans-serif;background:#f7f9fc;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px;}
      .box{background:#fff;border-radius:16px;padding:32px;max-width:420px;width:100%;box-shadow:0 8px 32px rgba(19,34,60,.1);}
      h1{color:${couleur};font-size:19px;margin-bottom:6px;}
      p.sub{color:#6b7c96;font-size:13.5px;margin-bottom:18px;}
      textarea{width:100%;box-sizing:border-box;padding:10px 12px;border-radius:9px;border:1.5px solid #e3eaf4;font-family:'Outfit',Arial,sans-serif;font-size:13.5px;resize:vertical;margin-bottom:16px;}
      button{width:100%;padding:12px;border-radius:9px;border:none;background:${couleur};color:#fff;font-size:14px;font-weight:700;cursor:pointer;}
    </style></head>
    <body><div class="box">
      <h1>${escHtml(titre)}</h1>
      <p class="sub">Rendez-vous du ${escHtml(dateAff)} à ${escHtml(heure)}. Vous pouvez laisser un message optionnel (pour préciser une contrainte, ou justifier un refus) — le client le recevra par email si vous avez son adresse.</p>
      <form method="GET" action="">
        <input type="hidden" name="token" value="${escHtml(token)}">
        <input type="hidden" name="action" value="${escHtml(action)}">
        <input type="hidden" name="execute" value="1">
        <textarea name="message" rows="3" placeholder="Message optionnel…">${valeurDefaut}</textarea>
        <button type="submit">${estConfirmer ? "✅ Confirmer" : "❌ Refuser"}</button>
      </form>
    </div></body></html>`;
  return new Response(html, { headers: ENTETES_PAGE });
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
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const action = url.searchParams.get("action");
  const execute = url.searchParams.get("execute") === "1";
  const message = (url.searchParams.get("message") || "").trim().slice(0, MESSAGE_MAX) || null;

  if (!token || token.length > 100 || (action !== "confirmer" && action !== "refuser")) {
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

    // Une proposition dont la date est passée n'est plus valable (date du jour en Guadeloupe, UTC-4).
    const aujourdhui = new Date(Date.now() - 4 * 3600 * 1000).toISOString().slice(0, 10);
    if (demande.date_intervention && demande.date_intervention < aujourdhui) {
      return pageHtml("Créneau passé", "Ce créneau est déjà passé : cette proposition n'est plus valable. Le client peut faire une nouvelle demande.", "#6b7c96");
    }

    const dateAff = new Date(demande.date_intervention).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

    // ── Étape 1 : pas encore "execute" → on affiche le petit formulaire de message ──
    if (!execute) {
      return formulaireMessageHtml(token, action, dateAff, (demande.heure_debut || "").slice(0, 5));
    }

    // ── Récupérer l'artisan visé, via la demande de devis correspondante ──
    const { data: reponse } = await sb.from("devis_reponses").select("artisan_id").eq("demande_id", demande.id).maybeSingle();
    const artisanId = reponse?.artisan_id;
    if (!artisanId) {
      return pageHtml("Erreur", "Impossible de retrouver l'artisan associé à cette demande. Contactez le support.", "#dc2626");
    }

    // Réclamation ATOMIQUE de la demande : un seul des envois simultanés l'obtient. (L'ancien verrou « lecture seule »
    // a disparu : les demandes de devis font partie de l'offre Essentiel gratuite, y compris après la fin d'un essai Pro.)
    const nouveauStatut = action === "confirmer" ? "creneau_confirme" : "creneau_refuse";
    const { data: reclame, error: errReclame } = await sb.from("demandes_devis")
      .update({ statut: nouveauStatut, reponse_message: message }).eq("id", demande.id).eq("statut", "creneau_propose").select("id");
    if (errReclame) throw errReclame;
    if (!reclame || reclame.length === 0) {
      return pageHtml("Déjà traité", "Cette proposition de créneau vient d'être traitée — aucune action supplémentaire n'est nécessaire.", "#6b7c96");
    }
    const annulerReclamation = async () => {
      try { await sb.from("demandes_devis").update({ statut: "creneau_propose", reponse_message: null }).eq("id", demande.id); } catch (e) { console.error("[repondre-devis] Annulation de la réclamation échouée :", e); }
    };

    if (action === "refuser") {
      try {
        if (demande.client_email) {
          const html = `<div style="font-family:sans-serif;max-width:480px;">
            <h2 style="color:#6b7c96;">Créneau non disponible</h2>
            <p>Votre demande pour le <strong>${escHtml(dateAff)} à ${escHtml((demande.heure_debut || "").slice(0, 5))}</strong> n'a malheureusement pas pu être retenue.</p>
            ${message ? `<p style="background:#f7f9fc;padding:12px 16px;border-radius:8px;">${escHtml(message)}</p>` : ""}
            <p style="font-size:12px;color:#6b7c96;">N'hésitez pas à consulter d'autres créneaux ou d'autres artisans sur CaraLink.</p>
          </div>`;
          await envoyerEmail(demande.client_email, `Créneau non disponible — ${dateAff}`, html);
        }
      } catch (e) { console.error("[repondre-devis] Email de refus client échoué :", e); }

      return pageHtml("Créneau refusé", "C'est noté — ce créneau a été refusé. Le client a été notifié par email s'il avait laissé son adresse.", "#6b7c96");
    }

    // ── action === "confirmer" ──

    // 1) Client habituel : on en crée un nouveau à partir des infos de la demande
    //    (plus simple et plus sûr que de deviner un doublon existant — l'artisan pourra fusionner à la main si besoin)
    const { data: artisanInfos } = await sb.from("artisans").select("nom_entreprise, telephone").eq("id", artisanId).maybeSingle();

    let clientId: string | null = null;
    try {
    const { data: client, error: errClient } = await sb.from("mpa_artisans_clients").insert({
      artisan_id: artisanId,
      nom: demande.client_nom,
      email: demande.client_email || null,
      adresse: demande.adresse,
      code_postal: demande.code_postal,
      commune: demande.commune,
      delai_paiement: 30,
      origine: "annuaire", // ce client vient de la demande de devis publique — sert au calcul du seuil de CA prestations
    }).select().single();
    if (errClient) throw errClient;
    clientId = client.id;

    // 2) Intervention créée directement dans le planning
    const notesIntervention = message ? `${demande.description_besoin} (Note de l'artisan à la confirmation : ${message})` : demande.description_besoin;
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
      notes: notesIntervention,
      statut: "planifiee",
    });
    if (errInter) throw errInter;
    } catch (e) {
      // Une étape a échoué : on défait ce qui a été créé, pour qu'un nouvel essai reparte propre.
      if (clientId) { try { await sb.from("mpa_artisans_clients").delete().eq("id", clientId); } catch (e2) { console.error("[repondre-devis] Nettoyage du client échoué :", e2); } }
      await annulerReclamation();
      throw e;
    }

    // 3) Email de confirmation au client, avec le message éventuel — jamais bloquant
    try {
      if (demande.client_email) {
        const html = `<div style="font-family:sans-serif;max-width:480px;">
          <h2 style="color:#16a34a;">✅ Rendez-vous confirmé</h2>
          <p>Votre intervention du <strong>${escHtml(dateAff)} à ${escHtml((demande.heure_debut || "").slice(0, 5))}</strong> est confirmée${artisanInfos?.nom_entreprise ? ` avec <strong>${escHtml(artisanInfos.nom_entreprise)}</strong>` : ""}.</p>
          ${message ? `<p style="background:#f7f9fc;padding:12px 16px;border-radius:8px;">${escHtml(message)}</p>` : ""}
          ${artisanInfos?.telephone ? `<p style="font-size:12.5px;color:#6b7c96;">En cas d'empêchement, vous pouvez contacter directement l'artisan au <a href="tel:${escHtml(telHref(artisanInfos.telephone))}">${escHtml(artisanInfos.telephone)}</a>.</p>` : ""}
          <p style="font-size:12px;color:#6b7c96;">À bientôt !</p>
        </div>`;
        await envoyerEmail(demande.client_email, `Rendez-vous confirmé — ${dateAff}`, html);
      }
    } catch (e) { console.error("[repondre-devis] Email de confirmation client échoué :", e); }

    return pageHtml("Créneau confirmé ✅", "L'intervention a été ajoutée à votre planning MPA Artisans, et le client a été notifié si vous aviez son email. À bientôt !", "#16a34a");

  } catch (e) {
    console.error("[repondre-devis]", e);
    return pageHtml("Erreur", "Une erreur est survenue. Réessayez dans un instant ou contactez le support.", "#dc2626"); // le détail reste dans les journaux
  }
});
