// ═══════════════════════════════════════════════════════════
// CaraLink Artisans — Edge Function : notifier-intervention-deplacee
// Propriété : TOI Freddy
//
// Appelée automatiquement par MPA Artisans quand l'artisan DÉPLACE une intervention (jour, créneau ou heure).
// Le client est TOUJOURS prévenu par email (pas de choix pour l'artisan : un client doit savoir qu'on a changé la date).
//
// POST { intervention_id, ancienne_date: "AAAA-MM-JJ" }   (à déployer avec --no-verify-jwt : le jeton de l'artisan est vérifié ici)
//
// - Prestation : email « votre rendez-vous est déplacé au … ».
// - Livraison d'une commande de la boutique : email « votre livraison est prévue le … » et la commande garde le nouveau jour.
// Réponse : { ok, client_prevenu, client_sans_email, hors_fenetre }.
// Sécurité : seul l'artisan propriétaire ; intervention encore « Planifiée » / « En cours » ; 6 envois par intervention et par jour ;
// tout texte est échappé ; aucune erreur interne n'est détaillée.
// ═══════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REGEX_DATE = /^\d{4}-\d{2}-\d{2}$/;

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
function escHtml(s: unknown): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function dateFR(iso: string): string {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}
async function envoyerEmail(to: string, replyTo: string | null, subject: string, html: string): Promise<boolean> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return false;
  try {
    const corps: Record<string, unknown> = { from: "CaraLink Artisans <notifications@learnlogicstudio.com>", to: [to], subject, html };
    if (replyTo) corps.reply_to = replyTo;
    const res = await fetch("https://api.resend.com/emails", { method: "POST", headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify(corps) });
    if (!res.ok) console.error("[notifier-intervention-deplacee] Échec Resend :", await res.text());
    return res.ok;
  } catch (e) { console.error("[notifier-intervention-deplacee] Erreur envoi :", e); return false; }
}
async function limiteAtteinte(sb: any, cle: string, max: number, fenetreSecondes: number): Promise<boolean> {
  try {
    const { data, error } = await sb.rpc("limiter_appel", { p_cle: cle, p_max: max, p_fenetre_s: fenetreSecondes });
    if (error) { console.error("[limiter_appel]", error.message); return false; }
    return data === false;
  } catch (e) { console.error("[limiter_appel]", e); return false; }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);
  try {
    const jeton = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!jeton) return json({ error: "Non authentifié." }, 401);
    const sbAnon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: u } = await sbAnon.auth.getUser(jeton);
    if (!u?.user) return json({ error: "Session invalide." }, 401);

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Requête invalide." }, 400);
    if (typeof body.intervention_id !== "string" || !REGEX_UUID.test(body.intervention_id)) return json({ error: "Intervention invalide." }, 400);
    const ancienne = typeof body.ancienne_date === "string" && REGEX_DATE.test(body.ancienne_date) ? body.ancienne_date : null;

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: artisan } = await sb.from("artisans").select("id, nom_entreprise, email, telephone").eq("user_id", u.user.id).maybeSingle();
    if (!artisan) return json({ error: "Aucun profil artisan trouvé." }, 404);

    const { data: inter, error: errI } = await sb.from("mpa_artisans_interventions")
      .select("id, statut, date_intervention, heure_debut, creneau, mpa_artisans_clients(nom, email)")
      .eq("id", body.intervention_id).eq("artisan_id", artisan.id).maybeSingle();
    if (errI) throw errI;
    if (!inter) return json({ error: "Intervention introuvable." }, 404);
    if (!["planifiee", "en_cours"].includes(inter.statut)) return json({ error: "intervention_non_deplacable" }, 409);
    if (await limiteAtteinte(sb, `deplacee:${inter.id}`, 6, 86400)) return json({ error: "Trop d'envois pour cette intervention aujourd'hui." }, 429);

    // Livraison d'une commande de la boutique ? Elle garde le nouveau jour, et on vérifie qu'il reste dans la fenêtre promise.
    const { data: commandes } = await sb.from("commandes_catalogue").select("id, livraison_debut, livraison_fin, adresse_livraison, commune_livraison, code_postal_livraison")
      .eq("intervention_id", inter.id).eq("artisan_id", artisan.id).limit(1);
    const commande = commandes && commandes.length ? commandes[0] : null;
    let horsFenetre = false;
    if (commande) {
      await sb.from("commandes_catalogue").update({ livraison_prevue_le: inter.date_intervention }).eq("id", commande.id);
      if (commande.livraison_debut && commande.livraison_fin) horsFenetre = inter.date_intervention < commande.livraison_debut || inter.date_intervention > commande.livraison_fin;
    }

    const client = (inter as any).mpa_artisans_clients;
    if (!client?.email) return json({ ok: true, client_prevenu: false, client_sans_email: true, hors_fenetre: horsFenetre });

    const heure = inter.heure_debut ? String(inter.heure_debut).slice(0, 5) : (inter.creneau === "matin" ? "le matin" : (inter.creneau === "apres_midi" || inter.creneau === "apres-midi") ? "l'après-midi" : "");
    const nomArtisan = artisan.nom_entreprise || "votre artisan";
    const contact = artisan.telephone ? `<p style="font-size:12.5px;color:#475569;">Une question ? 📞 ${escHtml(artisan.telephone)}</p>` : "";
    const avant = ancienne ? ` (au lieu du ${escHtml(dateFR(ancienne))})` : "";
    const nouveau = `<strong>${escHtml(dateFR(inter.date_intervention))}</strong>${heure ? ` (${escHtml(heure)})` : ""}`;
    const sujet = commande ? `Votre livraison est prévue le ${dateFR(inter.date_intervention)}` : `Votre rendez-vous est déplacé au ${dateFR(inter.date_intervention)}`;
    const html = commande
      ? `<div style="font-family:sans-serif;max-width:480px;"><h2 style="color:#B5502F;">Votre livraison est prévue 🚚</h2><p>Bonjour ${escHtml(client.nom || "")},</p><p><strong>${escHtml(nomArtisan)}</strong> vous livrera le ${nouveau}${avant}${commande.adresse_livraison ? ` à l'adresse : ${escHtml(commande.adresse_livraison)} ${escHtml(commande.code_postal_livraison || "")} ${escHtml(commande.commune_livraison || "")}` : ""}.</p><p>Merci d'être joignable ce jour-là.</p>${contact}</div>`
      : `<div style="font-family:sans-serif;max-width:480px;"><h2 style="color:#B5502F;">Votre rendez-vous est déplacé</h2><p>Bonjour ${escHtml(client.nom || "")},</p><p><strong>${escHtml(nomArtisan)}</strong> a dû déplacer votre rendez-vous : il aura lieu le ${nouveau}${avant}.</p><p>Si cette nouvelle date ne vous convient pas, contactez directement l'artisan.</p>${contact}</div>`;
    const envoye = await envoyerEmail(client.email, artisan.email || null, sujet, html);
    return json({ ok: true, client_prevenu: envoye, client_sans_email: false, hors_fenetre: horsFenetre, livraison: !!commande });
  } catch (e) {
    console.error("[notifier-intervention-deplacee]", e);
    return json({ error: "Une erreur est survenue. Réessayez dans un instant." }, 500);
  }
});
