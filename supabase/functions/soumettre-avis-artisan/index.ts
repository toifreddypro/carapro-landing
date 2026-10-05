// ═══════════════════════════════════════════════════════════
// CaraLink Artisans — Edge Function : soumettre-avis-artisan
// Propriété : TOI Freddy
//
// Lien à usage unique, envoyé par email, avec lequel le client note l'intervention. Modification possible
// pendant 7 jours après le premier envoi, puis figé. Aucun compte requis.
//
// Supabase n'affiche PAS les pages HTML sur son domaine par défaut (elles sont réécrites en texte brut) :
// cette fonction ne renvoie donc plus de page, seulement des DONNÉES (JSON). La page que voit le client est
// https://caralink.app/artisans/avis.html, qui appelle cette fonction.
//
// GET  ?token=xxx&info=1
//   → de quoi afficher la page : nom de l'artisan, date, et l'avis déjà donné s'il y en a un.
// POST { token, note (1 à 5), commentaire? }
//   → enregistre l'avis (ou le modifie, dans les 7 jours).
// GET  sans info=1 (anciens liens d'emails déjà envoyés)
//   → redirige vers la page, qui reprend le jeton. Un simple GET n'enregistre JAMAIS rien.
//
// Sécurité :
//  - la note doit être exactement un entier de 1 à 5, le commentaire est limité à 1000 caractères ;
//  - un double-clic ne crée pas deux avis (voir securite-avis.sql, et le repli sur la mise à jour ci-dessous) ;
//  - une erreur interne n'est jamais détaillée.
// ═══════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SITE_URL = "https://caralink.app";
const PAGE_AVIS = `${SITE_URL}/artisans/avis.html`;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const FENETRE_MODIF_JOURS = 7;
const COMMENTAIRE_MAX = 1000;
const REGEX_TOKEN = /^[A-Za-z0-9_-]{1,100}$/;
const MSG_ERREUR_GENERIQUE = "Une erreur est survenue — réessayez plus tard.";

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);

  // ── Anciens liens d'emails (et tout GET sans info=1) : on renvoie vers la page, on n'enregistre rien ──
  if (req.method === "GET" && url.searchParams.get("info") !== "1") {
    const cible = new URL(PAGE_AVIS);
    const t = url.searchParams.get("token") ?? "";
    if (REGEX_TOKEN.test(t)) cible.searchParams.set("token", t);
    return new Response(null, { status: 302, headers: { ...corsHeaders, "Location": cible.toString(), "Cache-Control": "no-store" } });
  }
  if (req.method !== "GET" && req.method !== "POST") return json({ error: "Méthode non autorisée.", code: "methode" }, 405);

  // ── Lecture des paramètres ──
  let token = "";
  let note = NaN;
  let commentaire: string | null = null;
  if (req.method === "GET") {
    token = url.searchParams.get("token") ?? "";
  } else {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Requête invalide.", code: "invalide" }, 400);
    if ((body.token != null && typeof body.token !== "string") || (body.commentaire != null && typeof body.commentaire !== "string")) return json({ error: "Requête invalide.", code: "invalide" }, 400);
    token = body.token ?? "";
    // La note : exactement un entier de 1 à 5 (nombre ou texte), rien d'autre.
    note = (typeof body.note === "number" || typeof body.note === "string") && /^[1-5]$/.test(String(body.note)) ? parseInt(String(body.note), 10) : NaN;
    commentaire = (body.commentaire ?? "").trim().slice(0, COMMENTAIRE_MAX) || null;
  }
  if (!REGEX_TOKEN.test(token)) return json({ error: "Ce lien d'avis est incomplet ou incorrect.", code: "invalide" }, 400);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const { data: intervention, error } = await sb.from("mpa_artisans_interventions")
      .select("id, artisan_id, date_intervention, artisans(nom_entreprise), mpa_artisans_clients(nom)")
      .eq("avis_token", token).maybeSingle();
    if (error) throw error;
    if (!intervention) return json({ error: "Ce lien d'avis n'existe pas ou n'est plus valide.", code: "introuvable" }, 404);

    const nomEntreprise = (intervention as any).artisans?.nom_entreprise || "cet artisan";
    const nomClient = (intervention as any).mpa_artisans_clients?.nom || "Client CaraLink";
    const dateAff = new Date(intervention.date_intervention).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

    const { data: avisExistant } = await sb.from("avis_carapro").select("*").eq("intervention_id", intervention.id).maybeSingle();
    const modifiableJusqua = avisExistant?.modifiable_jusqua ? new Date(avisExistant.modifiable_jusqua) : null;
    const encoreModifiable = !avisExistant || !!(modifiableJusqua && modifiableJusqua.getTime() > Date.now());

    // ── GET info : de quoi afficher la page ──
    if (req.method === "GET") {
      return json({
        artisan: nomEntreprise,
        date_affichee: dateAff,
        deja_donne: !!avisExistant,
        note: avisExistant?.note ?? null,
        commentaire: avisExistant?.commentaire ?? null,
        modifiable: encoreModifiable,
      });
    }

    // ── POST : enregistrement ──
    if (!encoreModifiable) return json({ error: "Le délai de 7 jours pour modifier votre avis est dépassé.", code: "delai_depasse" }, 410);
    if (!Number.isInteger(note)) return json({ error: "Merci de choisir une note entre 1 et 5 étoiles.", code: "note_manquante" }, 400);

    if (avisExistant) {
      const { error: errUpd } = await sb.from("avis_carapro").update({ note, commentaire }).eq("id", avisExistant.id);
      if (errUpd) throw errUpd;
    } else {
      const { error: errIns } = await sb.from("avis_carapro").insert({
        artisan_id: intervention.artisan_id,
        intervention_id: intervention.id,
        client_nom: nomClient,
        note, commentaire,
        modifiable_jusqua: new Date(Date.now() + FENETRE_MODIF_JOURS * 24 * 60 * 60 * 1000).toISOString(),
      });
      if (errIns) {
        // Double-clic : un envoi simultané a déjà créé l'avis (l'index d'unicité de securite-avis.sql l'a refusé).
        // On met alors à jour celui-là, au lieu de créer un doublon ou d'afficher une erreur.
        if ((errIns as any).code === "23505") {
          const { error: errMaj } = await sb.from("avis_carapro").update({ note, commentaire }).eq("intervention_id", intervention.id);
          if (errMaj) throw errMaj;
        } else {
          throw errIns;
        }
      }
    }

    return json({ ok: true, modifie: !!avisExistant });

  } catch (e) {
    console.error("[soumettre-avis-artisan]", e);
    return json({ error: MSG_ERREUR_GENERIQUE, code: "erreur" }, 500); // le détail reste dans les journaux
  }
});
