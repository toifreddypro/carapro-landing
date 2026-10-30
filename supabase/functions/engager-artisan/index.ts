// ═════════════════════════════════════════════════
// CaraLink Artisans — Edge Function : engager-artisan
// Propriété : TOI Freddy
//
// Le client choisit UN artisan parmi ceux qui ont répondu à son projet et décide de lui communiquer ses coordonnées.
// C'est définitif. Dans cet ordre :
//   1. la base engage la réponse en une seule opération verrouillée (engager_reponse_service) : le projet passe à « engagé »,
//      les autres discussions se ferment (motif « engagement ») — impossible d'engager deux artisans ;
//   2. une fiche client (origine « annuaire ») est créée chez l'artisan choisi : ses prestations comptent pour la commission ;
//   3. l'artisan reçoit un email avec les coordonnées, le client reçoit une confirmation avec le téléphone de l'artisan.
// Les coordonnées ne sont jamais enregistrées dans la base des projets. Les étapes 2 et 3 ne bloquent jamais : si l'une échoue,
// l'engagement reste valable et l'email porte quand même les coordonnées.
//
// Sécurité :
//  - le client est celui du JETON de connexion vérifié par le serveur (email confirmé exigé) ; jamais un identifiant envoyé ;
//  - la réponse doit appartenir à un projet de CE client, au tour en cours, discussion ouverte, artisan actif et non suspendu ;
//  - tout est contrôlé côté serveur (type, taille) ; 10 essais par heure et par client ; texte échappé avant d'entrer dans un email ;
//  - une panne interne ne révèle jamais son détail.
// ═════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MSG_ERREUR_GENERIQUE = "Une erreur est survenue. Réessayez dans un instant.";
const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const URL_MPA = "https://caralink.app/mpa/";
const URL_COMPTE = "https://caralink.app/artisans/compte.html?projet=liste";

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
function escHtml(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (m) => (({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }) as Record<string, string>)[m]);
}
function texte(v: unknown, max: number): string { return typeof v === "string" ? v.trim().slice(0, max) : ""; }

async function envoyerEmail(to: string, subject: string, html: string) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) { console.warn("[engager-artisan] RESEND_API_KEY absente — email non envoyé."); return; }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "CaraLink Artisans <notifications@learnlogicstudio.com>", to: [to], subject, html }),
    });
    if (!res.ok) console.error("[engager-artisan] Échec envoi Resend :", await res.text());
  } catch (e) { console.error("[engager-artisan] Erreur envoi email :", e); }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);

  const sb = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

  try {
    // ── Qui est-ce ? Le jeton de connexion, vérifié par le serveur ──
    const jeton = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!jeton) return json({ error: "Connectez-vous à votre espace client.", code: "connexion_requise" }, 401);
    const { data: auth, error: errAuth } = await sb.auth.getUser(jeton);
    const user = auth?.user;
    if (errAuth || !user) return json({ error: "Connectez-vous à votre espace client.", code: "connexion_requise" }, 401);
    if (!user.email_confirmed_at) return json({ error: "Confirmez d'abord votre adresse email : le lien vous a été envoyé à l'inscription.", code: "email_non_confirme" }, 403);

    // ── Ce que le client accepte de communiquer ──
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Requête invalide." }, 400);
    if (typeof body.reponse_id !== "string" || !REGEX_UUID.test(body.reponse_id)) return json({ error: "Réponse introuvable.", code: "introuvable" }, 404);
    const nom = texte(body.nom, 100), tel = texte(body.telephone, 30), adresse = texte(body.adresse, 200), cp = texte(body.code_postal, 10), commune = texte(body.commune, 100);
    const chiffres = tel.replace(/\D/g, "");
    if (nom.length < 2) return json({ error: "Indiquez votre nom.", code: "nom" }, 400);
    if (!/^[+\d\s.\-()]+$/.test(tel) || chiffres.length < 8 || chiffres.length > 15) return json({ error: "Indiquez un numéro de téléphone valide.", code: "telephone" }, 400);
    if (adresse.length < 3 || commune.length < 2) return json({ error: "Indiquez votre adresse et votre commune : l'artisan doit savoir où intervenir.", code: "adresse" }, 400);

    // ── Limite : 10 essais par heure et par client (si le limiteur est absent ou en panne, on laisse passer) ──
    try {
      const { data: autorise } = await sb.rpc("limiter_appel", { p_cle: `engager-artisan:${user.id}`, p_max: 10, p_fenetre_s: 3600 });
      if (autorise === false) return json({ error: "Trop d'essais. Réessayez dans un moment." }, 429);
    } catch (e) { console.error("[engager-artisan] limiter_appel :", e); }

    // ── 1) L'engagement, dans la base ──
    const { data: r, error: errEng } = await sb.rpc("engager_reponse_service", { p_reponse: body.reponse_id, p_user: user.id });
    if (errEng) throw errEng;
    if (!r?.ok) {
      const messages: Record<string, [string, number]> = {
        deja: ["Vous avez déjà engagé un artisan pour ce projet.", 409],
        ferme: ["Ce projet est clos ou expiré.", 409],
        introuvable: ["Réponse introuvable.", 404],
        artisan_indisponible: ["Cet artisan n'est plus disponible. Choisissez-en un autre.", 409],
      };
      const [msg, statut] = messages[r?.erreur] ?? [MSG_ERREUR_GENERIQUE, 500];
      return json({ error: msg, code: r?.erreur ?? "erreur" }, statut);
    }

    // ── 2) La fiche client chez l'artisan (jamais bloquant) ──
    try {
      const { data: existant } = await sb.from("mpa_artisans_clients").select("id").eq("artisan_id", r.artisan_id).eq("email", user.email ?? "").limit(1);
      if (!existant || existant.length === 0) {
        const { error: errClient } = await sb.from("mpa_artisans_clients").insert({
          artisan_id: r.artisan_id, nom, email: user.email ?? null, telephone: tel,
          adresse, code_postal: cp || null, commune, delai_paiement: 30,
          origine: "annuaire", // ce client vient d'un projet publié sur CaraLink — sert au calcul du seuil de CA prestations
        });
        if (errClient) throw errClient;
      }
    } catch (e) { console.error("[engager-artisan] Fiche client non créée (l'engagement reste valable, l'email porte les coordonnées) :", e); }

    // Les informations données ici complètent le profil du client s'il ne les avait pas encore (jamais d'écrasement)
    try {
      const { data: profil } = await sb.from("comptes_clients").select("telephone, adresse, code_postal, commune").eq("user_id", user.id).maybeSingle();
      if (profil) {
        const maj: Record<string, string> = {};
        if (!profil.telephone) maj.telephone = tel;
        if (!profil.adresse) maj.adresse = adresse;
        if (!profil.code_postal && cp) maj.code_postal = cp;
        if (!profil.commune) maj.commune = commune;
        if (Object.keys(maj).length) await sb.from("comptes_clients").update(maj).eq("user_id", user.id);
      }
    } catch (e) { console.error("[engager-artisan] Profil client non complété :", e); }

    // ── 3) Emails (jamais bloquants) ──
    try {
      let emailArtisan: string | null = r.artisan_email || null;
      if (!emailArtisan && r.artisan_user_id) {
        const { data: ua } = await sb.auth.admin.getUserById(r.artisan_user_id);
        emailArtisan = ua?.user?.email ?? null;
      }
      if (emailArtisan) {
        await envoyerEmail(emailArtisan, "Un client vous a choisi", `
          <div style="font-family:sans-serif;max-width:520px;">
            <h2 style="color:#B5502F;">Un client vous a choisi 🎉</h2>
            <p>Pour son projet <strong>${escHtml(r.besoin)}</strong> à <strong>${escHtml(r.commune)}</strong>, le client a choisi de vous communiquer ses coordonnées :</p>
            <div style="background:#f6f9fe;border-radius:10px;padding:14px 18px;line-height:1.8;">
              <strong>${escHtml(nom)}</strong><br>
              📞 ${escHtml(tel)}<br>
              ✉️ ${escHtml(user.email ?? "")}<br>
              📍 ${escHtml(adresse)}${cp ? ", " + escHtml(cp) : ""} ${escHtml(commune)}
            </div>
            <p style="margin-top:14px;"><strong>Son projet :</strong> ${escHtml(r.description)}</p>
            <p>Contactez-le rapidement pour convenir d'un rendez-vous. Il a déjà été ajouté à vos clients dans votre espace, et votre discussion reste ouverte.</p>
            <p style="margin:22px 0;"><a href="${URL_MPA}" style="display:inline-block;padding:12px 22px;border-radius:8px;background:#B5502F;color:#fff;font-weight:700;text-decoration:none;">Ouvrir mon espace</a></p>
            <p style="font-size:12px;color:#6b7c96;">Ce client vient de CaraLink : ses prestations entrent dans le calcul de votre commission mensuelle (franchise de 200 €).</p>
          </div>`);
      }
      if (user.email) {
        await envoyerEmail(user.email, "Votre artisan est engagé", `
          <div style="font-family:sans-serif;max-width:480px;">
            <h2 style="color:#B5502F;">Vous avez choisi ${escHtml(r.artisan_nom)}</h2>
            <p>Vos coordonnées ont été communiquées à <strong>${escHtml(r.artisan_nom)}</strong> pour votre projet <strong>${escHtml(r.besoin)}</strong>. Il va vous contacter.</p>
            ${r.artisan_telephone ? `<p>Vous pouvez aussi l'appeler : <strong>${escHtml(r.artisan_telephone)}</strong></p>` : ""}
            <p>Vos échanges restent disponibles dans votre espace.</p>
            <p style="margin:22px 0;"><a href="${URL_COMPTE}" style="display:inline-block;padding:12px 22px;border-radius:8px;background:#B5502F;color:#fff;font-weight:700;text-decoration:none;">Voir mes projets</a></p>
          </div>`);
      }
    } catch (e) { console.error("[engager-artisan] Emails échoués (engagement enregistré quand même) :", e); }

    return json({ success: true, artisan_nom: r.artisan_nom, artisan_telephone: r.artisan_telephone ?? null });

  } catch (e) {
    console.error("[engager-artisan]", e);
    return json({ error: MSG_ERREUR_GENERIQUE }, 500);
  }
});
