// ═════════════════════════════════════════════════
// CaraLink Artisans — Edge Function : relancer-projet
// Propriété : TOI Freddy
//
// Un client CONNECTÉ relance SON projet quand aucune réponse ne lui convient (2 relances au maximum). Les artisans qui ont déjà
// répondu sont exclus du nouveau tour, sauf ceux que le client a cochés « Garder pour la relance » (ils restent et comptent dans les 6).
// Le projet est rouvert pour 30 jours et les artisans qui n'ont jamais répondu, du bon métier et de la bonne zone, sont prévenus
// par email (15 plus proches au maximum). Aucune coordonnée du client dans l'email.
//
// Sécurité :
//  - l'identité vient du JETON de connexion vérifié par le serveur ; le projet doit appartenir à ce compte (vérifié dans la base) ;
//  - 10 relances par jour et par compte au maximum ; une panne interne ne révèle jamais son détail.
// ═════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MSG_ERREUR_GENERIQUE = "Une erreur est survenue. Réessayez dans un instant.";
const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_ARTISANS_NOTIFIES = 15;
const URL_MPA = "https://caralink.app/mpa/";

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
function escHtml(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (m) => (({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }) as Record<string, string>)[m]);
}
function texteHtml(s: unknown): string { return escHtml(s).replace(/\r?\n/g, "<br>"); }

async function envoyerEmail(to: string, subject: string, html: string) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) { console.warn("[relancer-projet] RESEND_API_KEY absente — email non envoyé."); return; }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "CaraLink Artisans <notifications@learnlogicstudio.com>", to: [to], subject, html }),
    });
    if (!res.ok) console.error("[relancer-projet] Échec envoi Resend :", await res.text());
  } catch (e) { console.error("[relancer-projet] Erreur envoi email :", e); }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);

  const sb = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

  try {
    const jeton = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!jeton) return json({ error: "Connectez-vous à votre compte client.", code: "connexion_requise" }, 401);
    const { data: auth, error: errAuth } = await sb.auth.getUser(jeton);
    const user = auth?.user;
    if (errAuth || !user) return json({ error: "Connectez-vous à votre compte client.", code: "connexion_requise" }, 401);

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Requête invalide." }, 400);
    const { projet_id } = body;
    if (typeof projet_id !== "string" || !REGEX_UUID.test(projet_id)) return json({ error: "Projet introuvable." }, 404);

    try {
      const { data: autorise } = await sb.rpc("limiter_appel", { p_cle: `relancer-projet:${user.id}`, p_max: 10, p_fenetre_s: 86400 });
      if (autorise === false) return json({ error: "Trop de relances aujourd'hui. Réessayez demain.", code: "limite_jour" }, 429);
    } catch (e) { console.error("[relancer-projet] limiter_appel :", e); }

    // ── La relance elle-même : droits, exclusions et réponses gardées dans la base (opération verrouillée) ──
    const { data: r, error: errRel } = await sb.rpc("relancer_projet_service", { p_projet: projet_id, p_user: user.id });
    if (errRel) throw errRel;
    if (!r?.ok) {
      const messages: Record<string, [string, number]> = {
        introuvable: ["Projet introuvable.", 404],
        clos: ["Ce projet est clôturé : publiez-en un nouveau.", 409],
        limite_relances: ["Vous avez déjà relancé ce projet 2 fois. Publiez un nouveau projet si besoin.", 409],
        tout_garde: ["Vous avez gardé toutes les réponses : il n'y a personne de nouveau à solliciter.", 409],
      };
      const [msg, statut] = messages[r?.erreur] ?? [MSG_ERREUR_GENERIQUE, 500];
      return json({ error: msg, code: r?.erreur ?? "erreur" }, statut);
    }

    // ── Prévenir les nouveaux artisans (jamais bloquant) ──
    try {
      const { data: p } = await sb.from("projets").select("besoin_code, commune, description, photos").eq("id", projet_id).maybeSingle();
      const { data: besoin } = p ? await sb.from("besoins").select("label_fr").eq("code", p.besoin_code).maybeSingle() : { data: null };
      const { data: cibles, error: errCibles } = await sb.rpc("projets_a_notifier", { p_projet: projet_id, p_limite: MAX_ARTISANS_NOTIFIES });
      if (errCibles) throw errCibles;
      if (p && besoin) {
        const extrait = p.description.length > 300 ? p.description.slice(0, 300).trim() + "…" : p.description;
        const nbPhotos = Array.isArray(p.photos) ? p.photos.length : 0;
        const photos = nbPhotos > 0 ? `<p>📷 ${nbPhotos} photo${nbPhotos > 1 ? "s" : ""} jointe${nbPhotos > 1 ? "s" : ""} — à voir dans MPA Artisans.</p>` : "";
        const html = `
          <div style="font-family:sans-serif;max-width:480px;">
            <h2 style="color:#B5502F;">📢 Un client cherche un professionnel</h2>
            <p><strong>${escHtml(besoin.label_fr)}</strong> à <strong>${escHtml(p.commune)}</strong></p>
            <p style="background:#f7f9fc;padding:12px 16px;border-radius:8px;">${texteHtml(extrait)}</p>
            ${photos}
            <p>Ce projet accepte <strong>6 réponses au maximum</strong> : les premiers artisans qui répondent sont retenus.</p>
            <p style="margin:22px 0;"><a href="${URL_MPA}" style="display:inline-block;padding:12px 22px;border-radius:8px;background:#B5502F;color:#fff;font-weight:700;text-decoration:none;">Voir le projet dans MPA Artisans</a></p>
            <p style="font-size:12px;color:#6b7c96;">Pour protéger le client contre le harcèlement, ses coordonnées ne sont pas communiquées : vous échangerez avec lui par messagerie, et c'est lui qui décidera de vous les donner à la fin.</p>
          </div>`;
        await Promise.allSettled((cibles ?? []).map(async (c: any) => {
          const { data: u } = await sb.auth.admin.getUserById(c.user_id);
          if (u?.user?.email) await envoyerEmail(u.user.email, `Nouveau projet à ${p.commune} — ${besoin.label_fr}`, html);
        }));
      }
    } catch (e) { console.error("[relancer-projet] Notification des artisans échouée (relance enregistrée quand même) :", e); }

    return json({ success: true, tour: r.tour, gardes: r.gardes });

  } catch (e) {
    console.error("[relancer-projet]", e);
    return json({ error: MSG_ERREUR_GENERIQUE }, 500);
  }
});
