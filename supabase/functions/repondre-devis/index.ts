// ═══════════════════════════════════════════════════════════
// CaraPro — Edge Function : repondre-devis
// Propriété : TOI Freddy
//
// Répond aux liens "✅ Confirmer" / "❌ Refuser" envoyés par email à l'artisan pour une proposition de
// créneau. Supabase n'affiche PAS les pages HTML sur son domaine par défaut (elles sont réécrites en texte brut) :
// cette fonction ne renvoie donc plus de page, seulement des DONNÉES (JSON). La page que voit l'artisan est
// https://caralink.app/artisans/repondre.html, qui appelle cette fonction.
//
// GET  ?token=xxx&info=1
//   → l'état de la proposition (à traiter / déjà confirmée / déjà refusée / date passée) pour afficher la page.
// POST { token, action: "confirmer" | "refuser", message? }
//   → exécute réellement l'action (utilisé par la page, et par les boutons de MPA Artisans).
// GET  sans info=1 (anciens liens d'emails déjà envoyés)
//   → redirige vers la page, qui reprend le jeton et l'action. Un simple GET n'exécute JAMAIS rien.
//
// Si "confirmer" :
//   - crée un client habituel pour cet artisan, et l'intervention dans son planning MPA Artisans
//   - envoie un email de confirmation au client, avec le message éventuel de l'artisan
// Si "refuser" :
//   - marque la demande comme refusée, et envoie un email au client avec le message éventuel
//
// Sécurité :
//  - le jeton (UUID aléatoire) fait office de preuve d'identité pour CETTE demande uniquement ;
//  - la demande est "réclamée" de façon atomique AVANT toute écriture : un double-clic ou deux envois
//    simultanés ne créent jamais deux clients ni deux interventions ;
//  - si une étape échoue, tout est annulé (client créé, statut) pour qu'un nouvel essai reparte propre ;
//  - une proposition dont la date est passée n'est plus valable ;
//  - tout ce qui entre dans un email est échappé ; une erreur interne n'est jamais détaillée.
// ═══════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SITE_URL = "https://caralink.app";
const PAGE_REPONSE = `${SITE_URL}/artisans/repondre.html`;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const MESSAGE_MAX = 1000;
const REGEX_TOKEN = /^[A-Za-z0-9_-]{1,100}$/;
const MSG_ERREUR_GENERIQUE = "Une erreur est survenue. Réessayez dans un instant ou contactez le support.";

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

// Tout ce qui vient d'un artisan ou d'un visiteur est échappé avant d'entrer dans un email.
function escHtml(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (m) => (({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }) as Record<string, string>)[m]);
}
function telHref(tel: string): string { return String(tel ?? "").replace(/[^0-9+]/g, ""); }

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

  // ── Anciens liens d'emails (et tout GET sans info=1) : on renvoie vers la page, on n'exécute rien ──
  if (req.method === "GET" && url.searchParams.get("info") !== "1") {
    const cible = new URL(PAGE_REPONSE);
    const t = url.searchParams.get("token") ?? "";
    const a = url.searchParams.get("action") ?? "";
    if (REGEX_TOKEN.test(t)) cible.searchParams.set("token", t);
    if (a === "confirmer" || a === "refuser") cible.searchParams.set("action", a);
    return new Response(null, { status: 302, headers: { ...corsHeaders, "Location": cible.toString(), "Cache-Control": "no-store" } });
  }
  if (req.method !== "GET" && req.method !== "POST") return json({ error: "Méthode non autorisée.", code: "methode" }, 405);

  // ── Lecture des paramètres ──
  let token = "";
  let action = "";
  let message: string | null = null;
  if (req.method === "GET") {
    token = url.searchParams.get("token") ?? "";
  } else {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Requête invalide.", code: "invalide" }, 400);
    if ((body.token != null && typeof body.token !== "string") || (body.action != null && typeof body.action !== "string") || (body.message != null && typeof body.message !== "string")) {
      return json({ error: "Requête invalide.", code: "invalide" }, 400);
    }
    token = body.token ?? "";
    action = body.action ?? "";
    message = (body.message ?? "").trim().slice(0, MESSAGE_MAX) || null;
    if (action !== "confirmer" && action !== "refuser") return json({ error: "Action invalide.", code: "invalide" }, 400);
  }
  if (!REGEX_TOKEN.test(token)) return json({ error: "Ce lien est incomplet ou incorrect.", code: "invalide" }, 400);

  const sb = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  try {
    const { data: demande, error } = await sb.from("demandes_devis").select("*").eq("token", token).maybeSingle();
    if (error) throw error;
    if (!demande) return json({ error: "Cette proposition de créneau n'existe plus ou le lien est incorrect.", code: "introuvable" }, 404);

    // Une proposition dont la date est passée n'est plus valable (date du jour en Guadeloupe, UTC-4).
    const aujourdhui = new Date(Date.now() - 4 * 3600 * 1000).toISOString().slice(0, 10);
    const passe = !!(demande.date_intervention && demande.date_intervention < aujourdhui);
    const dateAff = new Date(demande.date_intervention).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
    const heure = (demande.heure_debut || "").slice(0, 5);

    // ── GET info : de quoi afficher la page (rien de personnel : ni nom, ni contact du client) ──
    if (req.method === "GET") return json({ statut: demande.statut, passe, date_affichee: dateAff, heure });

    // ── POST : exécution ──
    if (demande.statut !== "creneau_propose") {
      const dejaTraite = demande.statut === "creneau_confirme" ? "déjà confirmée" : "déjà traitée (refusée)";
      return json({ error: `Cette proposition de créneau a été ${dejaTraite} — aucune action supplémentaire n'est nécessaire.`, code: "deja_traite", statut: demande.statut }, 409);
    }
    if (passe) return json({ error: "Ce créneau est déjà passé : cette proposition n'est plus valable. Le client peut faire une nouvelle demande.", code: "passe" }, 410);

    // ── Récupérer l'artisan visé, via la demande de devis correspondante ──
    const { data: reponse } = await sb.from("devis_reponses").select("artisan_id").eq("demande_id", demande.id).maybeSingle();
    const artisanId = reponse?.artisan_id;
    if (!artisanId) return json({ error: "Impossible de retrouver l'artisan associé à cette demande. Contactez le support.", code: "artisan_introuvable" }, 422);

    // Réclamation ATOMIQUE de la demande : un seul des envois simultanés l'obtient. (Les demandes de devis font partie
    // de l'offre Essentiel gratuite : aucun verrou d'abonnement ici.)
    const nouveauStatut = action === "confirmer" ? "creneau_confirme" : "creneau_refuse";
    const { data: reclame, error: errReclame } = await sb.from("demandes_devis")
      .update({ statut: nouveauStatut, reponse_message: message }).eq("id", demande.id).eq("statut", "creneau_propose").select("id");
    if (errReclame) throw errReclame;
    if (!reclame || reclame.length === 0) {
      return json({ error: "Cette proposition de créneau vient d'être traitée — aucune action supplémentaire n'est nécessaire.", code: "deja_traite" }, 409);
    }
    const annulerReclamation = async () => {
      try { await sb.from("demandes_devis").update({ statut: "creneau_propose", reponse_message: null }).eq("id", demande.id); } catch (e) { console.error("[repondre-devis] Annulation de la réclamation échouée :", e); }
    };

    if (action === "refuser") {
      try {
        if (demande.client_email) {
          const html = `<div style="font-family:sans-serif;max-width:480px;">
            <h2 style="color:#6b7c96;">Créneau non disponible</h2>
            <p>Votre demande pour le <strong>${escHtml(dateAff)} à ${escHtml(heure)}</strong> n'a malheureusement pas pu être retenue.</p>
            ${message ? `<p style="background:#f7f9fc;padding:12px 16px;border-radius:8px;">${escHtml(message)}</p>` : ""}
            <p style="font-size:12px;color:#6b7c96;">N'hésitez pas à consulter d'autres créneaux ou d'autres artisans sur CaraLink.</p>
          </div>`;
          await envoyerEmail(demande.client_email, `Créneau non disponible — ${dateAff}`, html);
        }
      } catch (e) { console.error("[repondre-devis] Email de refus client échoué :", e); }

      return json({ ok: true, resultat: "refuse", client_notifie: !!demande.client_email });
    }

    // ── action === "confirmer" ──
    const { data: artisanInfos } = await sb.from("artisans").select("nom_entreprise, telephone").eq("id", artisanId).maybeSingle();

    // 1) Client habituel : on en crée un nouveau à partir des infos de la demande
    //    (plus simple et plus sûr que de deviner un doublon existant — l'artisan pourra fusionner à la main si besoin)
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
          <p>Votre intervention du <strong>${escHtml(dateAff)} à ${escHtml(heure)}</strong> est confirmée${artisanInfos?.nom_entreprise ? ` avec <strong>${escHtml(artisanInfos.nom_entreprise)}</strong>` : ""}.</p>
          ${message ? `<p style="background:#f7f9fc;padding:12px 16px;border-radius:8px;">${escHtml(message)}</p>` : ""}
          ${artisanInfos?.telephone ? `<p style="font-size:12.5px;color:#6b7c96;">En cas d'empêchement, vous pouvez contacter directement l'artisan au <a href="tel:${escHtml(telHref(artisanInfos.telephone))}">${escHtml(artisanInfos.telephone)}</a>.</p>` : ""}
          <p style="font-size:12px;color:#6b7c96;">À bientôt !</p>
        </div>`;
        await envoyerEmail(demande.client_email, `Rendez-vous confirmé — ${dateAff}`, html);
      }
    } catch (e) { console.error("[repondre-devis] Email de confirmation client échoué :", e); }

    return json({ ok: true, resultat: "confirme", client_notifie: !!demande.client_email });

  } catch (e) {
    console.error("[repondre-devis]", e);
    return json({ error: MSG_ERREUR_GENERIQUE, code: "erreur" }, 500); // le détail reste dans les journaux
  }
});
