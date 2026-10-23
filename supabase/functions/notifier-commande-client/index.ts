// ═══════════════════════════════════════════════════════════
// CaraLink Artisans — Edge Function : notifier-commande-client
// Propriété : TOI Freddy
//
// Envoie au CLIENT d'une commande l'UNIQUE email du parcours livraison : « votre livraison est prévue le … ».
// (24/10, décision de Freddy : pas d'autres mails — « prête », « retard » seront visibles dans le compte client.)
// Appelée par l'artisan depuis MPA Artisans (session connectée), à déployer avec --no-verify-jwt
// (la fonction vérifie elle-même le jeton de l'artisan).
//
// POST { commande_id, type: "livraison_prevue", date: "AAAA-MM-JJ", creneau? }
//
// Sécurités : seul l'artisan propriétaire de la commande peut l'appeler ; la commande doit être payée et non annulée ;
// 6 envois par commande et par jour au plus ; aucune erreur interne n'est détaillée ; tout texte est échappé.
// ═══════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REGEX_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TYPES = ["livraison_prevue"];
const CRENEAUX: Record<string, string> = { matin: "le matin", apres_midi: "l'après-midi", "après-midi": "l'après-midi", journee: "dans la journée" };
const REGLEES = ["paye", "partiellement_rembourse"];
const MSG_ERREUR = "Une erreur est survenue. Réessayez dans un instant.";

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
    if (!res.ok) console.error("[notifier-commande-client] Échec Resend :", await res.text());
    return res.ok;
  } catch (e) { console.error("[notifier-commande-client] Erreur envoi :", e); return false; }
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
    if (typeof body.commande_id !== "string" || !REGEX_UUID.test(body.commande_id)) return json({ error: "Commande invalide." }, 400);
    if (typeof body.type !== "string" || !TYPES.includes(body.type)) return json({ error: "Type d'email invalide." }, 400);
    const date = typeof body.date === "string" && REGEX_DATE.test(body.date) ? body.date : null;
    const creneau = typeof body.creneau === "string" ? CRENEAUX[body.creneau] || null : null;
    if (!date) return json({ error: "Date de livraison manquante." }, 400);

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: c, error: errC } = await sb.from("commandes_catalogue").select("*").eq("id", body.commande_id).maybeSingle();
    if (errC) throw errC;
    if (!c) return json({ error: "Commande introuvable." }, 404);
    const { data: artisan } = await sb.from("artisans").select("id, user_id, nom_entreprise, email, telephone").eq("id", c.artisan_id).maybeSingle();
    if (!artisan || artisan.user_id !== u.user.id) return json({ error: "Commande introuvable." }, 404);
    if (!REGLEES.includes(c.paiement_statut) || c.statut === "annulee") return json({ error: "commande_non_notifiable" }, 409);
    if (!c.client_email) return json({ error: "email_client_manquant" }, 400);
    if (await limiteAtteinte(sb, `notifier-commande:${c.id}`, 6, 86400)) return json({ error: "Trop d'envois pour cette commande aujourd'hui." }, 429);

    const nomArtisan = artisan.nom_entreprise || "votre artisan";
    const contact = [artisan.telephone ? `📞 ${escHtml(artisan.telephone)}` : "", artisan.email ? `✉️ ${escHtml(artisan.email)}` : ""].filter(Boolean).join(" &nbsp; ");
    const bas = contact ? `<p style="font-size:12.5px;color:#475569;">Une question ? ${contact}</p>` : "";
    const bonjour = `<p>Bonjour ${escHtml(c.client_nom || "")},</p>`;
    const enveloppe = (titre: string, corps: string) => `<div style="font-family:sans-serif;max-width:480px;"><h2 style="color:#B5502F;">${titre}</h2>${bonjour}${corps}${bas}</div>`;
    let sujet = "", html = "";

    sujet = `Votre livraison est prévue le ${dateFR(date!)}`;
    html = enveloppe("Votre livraison est prévue 🚚", `<p><strong>${escHtml(nomArtisan)}</strong> vous livrera <strong>le ${escHtml(dateFR(date!))}</strong>${creneau ? `, ${escHtml(creneau)}` : ""}${c.adresse_livraison ? ` à l'adresse : ${escHtml(c.adresse_livraison)} ${escHtml(c.code_postal_livraison || "")} ${escHtml(c.commune_livraison || "")}` : ""}.</p><p>Merci d'être joignable ce jour-là.</p>`);

    const envoye = await envoyerEmail(c.client_email, artisan.email || null, sujet, html);
    if (!envoye) return json({ error: "envoi_impossible" }, 502);
    return json({ ok: true });
  } catch (e) {
    console.error("[notifier-commande-client]", e);
    return json({ error: MSG_ERREUR }, 500);
  }
});
