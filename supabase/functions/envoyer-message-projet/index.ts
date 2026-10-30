// ═════════════════════════════════════════════════
// CaraLink Artisans — Edge Function : envoyer-message-projet
// Propriété : TOI Freddy
//
// Envoie un message dans le fil entre un client et un artisan qui a répondu à son projet.
// Le CLIENT écrit en premier ; l'artisan ne peut répondre qu'après un message du client.
//
// Protection : ni numéro de téléphone, ni adresse email, ni lien dans un message. Le client décide lui-même, à la fin,
// de partager ses coordonnées (en choisissant « Engager cet artisan »).
//
// Sécurité :
//  - l'identité vient du JETON de connexion vérifié par le serveur ; client ou artisan est déterminé par la base, jamais par la requête ;
//  - droits, fil fermé, ordre d'écriture et limite de 200 messages contrôlés dans la base (une seule opération verrouillée) ;
//  - 60 messages par heure et par compte au maximum ;
//  - l'email de prévenance ne contient JAMAIS le texte du message ni de coordonnées, et n'est envoyé qu'une fois par rafale (15 min).
// ═════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MSG_ERREUR_GENERIQUE = "Une erreur est survenue. Réessayez dans un instant.";
const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
function escHtml(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (m) => (({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }) as Record<string, string>)[m]);
}
function contientCoordonnees(texte: string): boolean {
  if (/\d(?:[\s.\-()]*\d){7,}/.test(texte)) return true;
  if (/@/.test(texte)) return true;
  if (/(https?:\/\/|www\.)/i.test(texte)) return true;
  return false;
}

async function envoyerEmail(to: string, subject: string, html: string) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) { console.warn("[envoyer-message-projet] RESEND_API_KEY absente — email non envoyé."); return; }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "CaraLink Artisans <notifications@learnlogicstudio.com>", to: [to], subject, html }),
    });
    if (!res.ok) console.error("[envoyer-message-projet] Échec envoi Resend :", await res.text());
  } catch (e) { console.error("[envoyer-message-projet] Erreur envoi email :", e); }
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
    const { reponse_id, contenu } = body;
    if (typeof reponse_id !== "string" || !REGEX_UUID.test(reponse_id)) return json({ error: "Discussion introuvable.", code: "introuvable" }, 404);
    if (typeof contenu !== "string") return json({ error: "Requête invalide." }, 400);
    const texte = contenu.trim();
    if (texte.length < 1) return json({ error: "Écrivez votre message.", code: "vide" }, 400);
    if (texte.length > 1000) return json({ error: "Message trop long (1000 caractères maximum).", code: "message_long" }, 400);
    if (contientCoordonnees(texte)) {
      return json({ error: "Pour protéger tout le monde, n'écrivez ni numéro de téléphone, ni email, ni lien. Le client décidera lui-même de partager ses coordonnées à la fin.", code: "coordonnees" }, 400);
    }

    try {
      const { data: autorise } = await sb.rpc("limiter_appel", { p_cle: `message-projet:${user.id}`, p_max: 60, p_fenetre_s: 3600 });
      if (autorise === false) return json({ error: "Trop de messages envoyés. Réessayez dans un moment.", code: "limite" }, 429);
    } catch (e) { console.error("[envoyer-message-projet] limiter_appel :", e); }

    const { data: r, error: errMsg } = await sb.rpc("envoyer_message_service", { p_reponse: reponse_id, p_user: user.id, p_contenu: texte });
    if (errMsg) throw errMsg;
    if (!r?.ok) {
      const messages: Record<string, [string, number]> = {
        introuvable: ["Discussion introuvable.", 404],
        ferme: ["Cette discussion est fermée.", 409],
        client_dabord: ["Le client doit écrire le premier message.", 409],
        trop_de_messages: ["Cette discussion a atteint sa limite de messages.", 409],
        bloque: ["Votre messagerie est bloquée. Contactez contact@learnlogicstudio.com.", 403],
      };
      const [msg, statut] = messages[r?.erreur] ?? [MSG_ERREUR_GENERIQUE, 500];
      return json({ error: msg, code: r?.erreur ?? "erreur" }, statut);
    }

    // ── Prévenir l'autre personne, sans le texte du message (jamais bloquant) ──
    try {
      if (r.notifier) {
        const { data: u } = await sb.auth.admin.getUserById(r.destinataire_user_id);
        if (u?.user?.email) {
          const versClient = r.role === "artisan";
          const sujet = versClient ? `${r.artisan_nom} vous a écrit` : "Un client vous a écrit";
          const lien = versClient ? "https://caralink.app/artisans/compte.html?projet=liste" : "https://caralink.app/mpa/";
          const bouton = versClient ? "Lire le message" : "Lire dans MPA Artisans";
          await envoyerEmail(u.user.email, sujet, `
            <div style="font-family:sans-serif;max-width:480px;">
              <h2 style="color:#B5502F;">💬 ${escHtml(sujet)}</h2>
              <p>${versClient ? `<strong>${escHtml(r.artisan_nom)}</strong> vous a envoyé un message à propos de votre projet à <strong>${escHtml(r.commune)}</strong>.` : `Le client du projet à <strong>${escHtml(r.commune)}</strong> vous a envoyé un message.`}</p>
              <p style="margin:22px 0;"><a href="${lien}" style="display:inline-block;padding:12px 22px;border-radius:8px;background:#B5502F;color:#fff;font-weight:700;text-decoration:none;">${bouton}</a></p>
              <p style="font-size:12px;color:#6b7c96;">Pour la sécurité de chacun, les échanges se font uniquement sur CaraLink : aucun téléphone ni email n'est échangé tant que le client n'a pas décidé de les partager.</p>
            </div>`);
        }
      }
    } catch (e) { console.error("[envoyer-message-projet] Email échoué (message enregistré quand même) :", e); }

    return json({ success: true });

  } catch (e) {
    console.error("[envoyer-message-projet]", e);
    return json({ error: MSG_ERREUR_GENERIQUE }, 500);
  }
});
