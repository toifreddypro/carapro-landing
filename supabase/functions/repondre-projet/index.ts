// ═════════════════════════════════════════════════
// CaraLink Artisans — Edge Function : repondre-projet
// Propriété : TOI Freddy
//
// Un artisan CONNECTÉ répond à un projet de client (message + idée de prix facultative). Une seule réponse par artisan et par projet ;
// les 6 premières réponses du tour sont retenues, les suivantes reçoivent « complet ». La vérification des droits, le comptage et
// l'enregistrement se font dans la base en une seule opération verrouillée (fonction inserer_reponse_projet) : deux réponses
// simultanées ne peuvent jamais dépasser 6.
//
// Le client est prévenu par email à la PREMIÈRE réponse et quand les 6 réponses sont là. L'email ne contient aucune coordonnée d'artisan.
//
// Protection du client : le message ne peut contenir ni numéro de téléphone, ni adresse email, ni lien. Le client décidera lui-même,
// à la fin, de communiquer ses coordonnées ; l'artisan n'a pas à contourner la messagerie.
//
// Sécurité :
//  - l'identité vient du JETON de connexion vérifié par le serveur ; l'artisan est celui rattaché à ce compte, jamais un identifiant envoyé ;
//  - tout est contrôlé côté serveur (type, taille, montant) ; 30 réponses par heure et par artisan au maximum ;
//  - le texte est échappé avant d'entrer dans un email ; une panne interne ne révèle jamais son détail.
// ═════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MSG_ERREUR_GENERIQUE = "Une erreur est survenue. Réessayez dans un instant.";
const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const URL_COMPTE = "https://caralink.app/artisans/compte.html?projet=liste";

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
function escHtml(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (m) => (({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }) as Record<string, string>)[m]);
}

// Téléphone (8 chiffres ou plus, même séparés par espaces, points, tirets, parenthèses), email, lien : refusés dans le message.
function contientCoordonnees(texte: string): boolean {
  if (/\d(?:[\s.\-()]*\d){7,}/.test(texte)) return true;
  if (/@/.test(texte)) return true;
  if (/(https?:\/\/|www\.)/i.test(texte)) return true;
  return false;
}

async function envoyerEmail(to: string, subject: string, html: string) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) { console.warn("[repondre-projet] RESEND_API_KEY absente — email non envoyé."); return; }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "CaraLink Artisans <notifications@learnlogicstudio.com>", to: [to], subject, html }),
    });
    if (!res.ok) console.error("[repondre-projet] Échec envoi Resend :", await res.text());
  } catch (e) { console.error("[repondre-projet] Erreur envoi email :", e); }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);

  const sb = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

  try {
    // ── Qui est-ce ? Le jeton de connexion, vérifié par le serveur ──
    const jeton = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!jeton) return json({ error: "Connectez-vous à votre espace artisan.", code: "connexion_requise" }, 401);
    const { data: auth, error: errAuth } = await sb.auth.getUser(jeton);
    const user = auth?.user;
    if (errAuth || !user) return json({ error: "Connectez-vous à votre espace artisan.", code: "connexion_requise" }, 401);

    const { data: artisan, error: errArt } = await sb.from("artisans").select("id, nom_entreprise, actif").eq("user_id", user.id).maybeSingle();
    if (errArt) throw errArt;
    if (!artisan) return json({ error: "Seuls les artisans peuvent répondre à un projet.", code: "pas_artisan" }, 403);
    if (artisan.actif === false) return json({ error: "Votre profil n'est pas actif.", code: "inactif" }, 403);

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Requête invalide." }, 400);
    const { projet_id, message, prix_indicatif } = body;
    if (typeof projet_id !== "string" || !REGEX_UUID.test(projet_id)) return json({ error: "Projet introuvable." }, 404);
    if (typeof message !== "string") return json({ error: "Requête invalide." }, 400);
    const texte = message.trim();
    if (texte.length < 10) return json({ error: "Écrivez un message d'au moins 10 caractères.", code: "message_court" }, 400);
    if (texte.length > 1000) return json({ error: "Message trop long (1000 caractères maximum).", code: "message_long" }, 400);
    if (contientCoordonnees(texte)) {
      return json({ error: "Pour la sécurité du client, n'écrivez ni numéro de téléphone, ni email, ni lien : il décidera lui-même de vous communiquer ses coordonnées à la fin.", code: "coordonnees" }, 400);
    }
    let prix: number | null = null;
    if (prix_indicatif != null && prix_indicatif !== "") {
      const n = typeof prix_indicatif === "number" ? prix_indicatif : Number(String(prix_indicatif).replace(",", ".").replace(/\s/g, ""));
      if (!Number.isFinite(n) || n < 0 || n > 1000000) return json({ error: "Montant invalide.", code: "prix_invalide" }, 400);
      prix = Math.round(n * 100) / 100;
    }

    // ── Limite : 30 réponses par heure et par artisan (si le limiteur est absent ou en panne, on laisse passer) ──
    try {
      const { data: autorise } = await sb.rpc("limiter_appel", { p_cle: `repondre-projet:${artisan.id}`, p_max: 30, p_fenetre_s: 3600 });
      if (autorise === false) return json({ error: "Trop de réponses envoyées. Réessayez dans un moment." }, 429);
    } catch (e) { console.error("[repondre-projet] limiter_appel :", e); }

    // ── Enregistrement : droits, plafond de 6 et verrou dans la base ──
    const { data: r, error: errRep } = await sb.rpc("inserer_reponse_projet", { p_projet: projet_id, p_artisan: artisan.id, p_message: texte, p_prix: prix });
    if (errRep) throw errRep;
    if (!r?.ok) {
      const messages: Record<string, [string, number]> = {
        complet: ["Ce projet a déjà reçu ses 6 réponses.", 409],
        deja: ["Vous avez déjà répondu à ce projet (ou il ne vous est plus proposé).", 409],
        ferme: ["Ce projet est clos ou expiré.", 409],
        non_eligible: ["Ce projet ne correspond pas à votre métier ou à votre zone.", 403],
        introuvable: ["Projet introuvable.", 404],
      };
      const [msg, statut] = messages[r?.erreur] ?? [MSG_ERREUR_GENERIQUE, 500];
      return json({ error: msg, code: r?.erreur ?? "erreur" }, statut);
    }

    // ── Prévenir le client à la première réponse et quand c'est complet (jamais bloquant) ──
    try {
      if (r.nb === 1 || r.nb === r.max) {
        const { data: u } = await sb.auth.admin.getUserById(r.client_user_id);
        if (u?.user?.email) {
          const complet = r.nb === r.max;
          const sujet = complet ? "Votre projet a reçu toutes ses réponses" : "Un artisan a répondu à votre projet";
          const corps = complet
            ? `<p>Votre projet à <strong>${escHtml(r.commune)}</strong> a reçu ses <strong>${r.max} réponses</strong>. Comparez les profils, les avis et les photos de réalisations, puis choisissez.</p>`
            : `<p><strong>${escHtml(artisan.nom_entreprise)}</strong> a répondu à votre projet à <strong>${escHtml(r.commune)}</strong>. D'autres artisans peuvent encore répondre (jusqu'à ${r.max}).</p>`;
          await envoyerEmail(u.user.email, sujet, `
            <div style="font-family:sans-serif;max-width:480px;">
              <h2 style="color:#B5502F;">${escHtml(sujet)}</h2>
              ${corps}
              <p style="margin:22px 0;"><a href="${URL_COMPTE}" style="display:inline-block;padding:12px 22px;border-radius:8px;background:#B5502F;color:#fff;font-weight:700;text-decoration:none;">Voir mes projets</a></p>
              <p style="font-size:12px;color:#6b7c96;">Vos coordonnées restent cachées : vous décidez vous-même, à la fin, de les partager avec l'artisan que vous choisissez.</p>
            </div>`);
        }
      }
    } catch (e) { console.error("[repondre-projet] Email au client échoué (réponse enregistrée quand même) :", e); }

    return json({ success: true, nb: r.nb, max: r.max });

  } catch (e) {
    console.error("[repondre-projet]", e);
    return json({ error: MSG_ERREUR_GENERIQUE }, 500);
  }
});
