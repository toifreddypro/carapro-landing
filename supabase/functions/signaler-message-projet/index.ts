// ═════════════════════════════════════════════════
// CaraLink Artisans — Edge Function : signaler-message-projet
// Propriété : TOI Freddy
//
// Un client ou un artisan signale un message REÇU de l'autre personne dans une discussion de projet.
//  - la discussion se ferme et les messages de l'autre sont masqués pour celui qui signale ;
//  - le texte signalé est copié comme preuve ; la personne signalée n'est PAS prévenue au 1er signalement ;
//  - 2e signalement par une personne différente : avertissement à sa prochaine connexion ; 3e : messagerie bloquée (voir signalements.sql) ;
//  - tu reçois un email avec le message, les noms, le projet et le nombre de personnes différentes qui l'ont signalé.
//
// Sécurité : l'identité vient du JETON vérifié par le serveur ; on ne peut signaler qu'un message de l'AUTRE personne de SA discussion ;
// 20 signalements par jour et par compte au maximum ; le texte est échappé dans l'email.
// ═════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const ADMIN_EMAIL = "toifreddypro@gmail.com";
const MSG_ERREUR_GENERIQUE = "Une erreur est survenue. Réessayez dans un instant.";
const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
function escHtml(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (m) => (({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }) as Record<string, string>)[m]);
}
async function envoyerEmail(to: string, subject: string, html: string) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) { console.warn("[signaler-message-projet] RESEND_API_KEY absente — email non envoyé."); return; }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "CaraLink Artisans <notifications@learnlogicstudio.com>", to: [to], subject, html }),
    });
    if (!res.ok) console.error("[signaler-message-projet] Échec envoi Resend :", await res.text());
  } catch (e) { console.error("[signaler-message-projet] Erreur envoi email :", e); }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);
  const sb = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

  try {
    const jeton = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!jeton) return json({ error: "Connectez-vous.", code: "connexion_requise" }, 401);
    const { data: auth, error: errAuth } = await sb.auth.getUser(jeton);
    const user = auth?.user;
    if (errAuth || !user) return json({ error: "Connectez-vous.", code: "connexion_requise" }, 401);

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Requête invalide." }, 400);
    const { message_id } = body;
    if (typeof message_id !== "string" || !REGEX_UUID.test(message_id)) return json({ error: "Message introuvable.", code: "introuvable" }, 404);

    try {
      const { data: autorise } = await sb.rpc("limiter_appel", { p_cle: `signaler-message:${user.id}`, p_max: 20, p_fenetre_s: 86400 });
      if (autorise === false) return json({ error: "Trop de signalements aujourd'hui.", code: "limite" }, 429);
    } catch (e) { console.error("[signaler-message-projet] limiter_appel :", e); }

    const { data: r, error: errSig } = await sb.rpc("signaler_message_service", { p_message: message_id, p_user: user.id });
    if (errSig) throw errSig;
    if (!r?.ok) return json({ error: "Message introuvable.", code: r?.erreur ?? "introuvable" }, 404);
    if (r.deja) return json({ success: true });

    // ── Prévenir l'administrateur, avec la preuve (jamais bloquant) ──
    try {
      const { data: liste } = await sb.rpc("admin_liste_signalements");
      const s = (liste ?? []).find((x: any) => x.id === r.signalement_id);
      const action = r.bloque ? "🚫 Messagerie BLOQUÉE automatiquement (3 personnes différentes)" : r.avertissement ? "⚠️ Avertissement envoyé à la prochaine connexion (2 personnes différentes)" : "1er signalement : la discussion est fermée";
      await envoyerEmail(ADMIN_EMAIL, `Signalement : ${s?.nom_signale ?? "message"} (${r.nb_signaleurs} personne${r.nb_signaleurs > 1 ? "s" : ""})`, `
        <div style="font-family:sans-serif;max-width:560px;">
          <h2 style="color:#dc2626;">🚩 Message signalé</h2>
          <p><strong>${escHtml(s?.nom_signale ?? "—")}</strong> (${escHtml(r.role_signale)}) a été signalé(e) par <strong>${escHtml(s?.nom_signaleur ?? "—")}</strong>.</p>
          <p>Projet : ${escHtml(s?.projet?.besoin ?? "—")} à ${escHtml(s?.projet?.commune ?? "—")}</p>
          <p style="background:#fdecec;padding:12px 16px;border-radius:8px;white-space:pre-wrap;">${escHtml(s?.message ?? "")}</p>
          <p style="font-size:12px;color:#6b7c96;">Écrit le ${escHtml(s?.message_le ?? "")}</p>
          <p><strong>${escHtml(action)}</strong></p>
          <p style="margin:20px 0;"><a href="https://caralink.app/artisans/admin.html#signalements" style="display:inline-block;padding:12px 22px;border-radius:8px;background:#B5502F;color:#fff;font-weight:700;text-decoration:none;">Ouvrir l'administration (onglet Signalements)</a></p>
        </div>`);
    } catch (e) { console.error("[signaler-message-projet] Email admin échoué (signalement enregistré quand même) :", e); }

    return json({ success: true });
  } catch (e) {
    console.error("[signaler-message-projet]", e);
    return json({ error: MSG_ERREUR_GENERIQUE }, 500);
  }
});
