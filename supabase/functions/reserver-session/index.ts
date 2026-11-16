// ═════════════════════════════════════════════════
// CaraLink — Edge Function : reserver-session (Lot 25)
// Un client réserve une ou plusieurs places dans une session collective (coaching, atelier…) d'un artisan.
//
// Sécurité (fonction publique : n'importe qui peut l'appeler avec n'importe quoi) :
//  - nom, téléphone, e-mail, nombre de places contrôlés côté serveur (type, taille, format) ;
//  - la session doit exister, être ouverte et à venir ; son artisan doit être actif ;
//  - les places sont comptées par la BASE, session verrouillée : jamais deux clients sur la dernière place ;
//  - 10 appels par heure et par visiteur, et au plus 3 réservations par jour pour la même session et la même adresse ;
//  - tout ce qui entre dans un e-mail est échappé ; un échec d'e-mail ne fait jamais échouer la réservation ;
//  - une panne interne ne révèle jamais son détail au visiteur.
// ═════════════════════════════════════════════════
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const MSG_ERREUR = "Une erreur est survenue. Réessayez dans un instant.";
const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const REGEX_NOM = /^[\p{L}][\p{L} '’.-]{1,59}$/u;
const MAX_PLACES_PAR_RESERVATION = 5;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
function escHtml(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (m) => (({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }) as Record<string, string>)[m]);
}
async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function envoyerEmail(to: string, subject: string, html: string) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) { console.warn("[reserver-session] RESEND_API_KEY absente — email non envoyé."); return; }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "CaraLink Artisans <notifications@learnlogicstudio.com>", to: [to], subject, html }),
    });
    if (!res.ok) console.error("[reserver-session] Échec envoi Resend :", await res.text());
  } catch (e) { console.error("[reserver-session] Erreur envoi email :", e); }
}
function dateLongue(dateISO: string): string {
  return new Date(dateISO + "T12:00:00Z").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}
function heureCourte(h: string): string { const [hh, mm] = String(h).slice(0, 5).split(":"); return mm === "00" ? `${parseInt(hh, 10)} h` : `${parseInt(hh, 10)} h ${mm}`; }
function prixTxt(p: number): string { return p > 0 ? p.toFixed(2).replace(".", ",") + " € par personne" : "Gratuit"; }

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);
  const sb = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Requête invalide." }, 400);
    const { session_id, nom, telephone, email, nb_places } = body as Record<string, unknown>;
    if (typeof session_id !== "string" || !REGEX_UUID.test(session_id)) return json({ error: "Requête invalide." }, 400);
    if (typeof nom !== "string" || typeof telephone !== "string" || (email != null && typeof email !== "string")) return json({ error: "Requête invalide." }, 400);

    const nomNet = nom.trim().replace(/\s+/g, " ");
    const telNet = telephone.trim();
    const emailNet = (email ?? "").trim();
    const nb = typeof nb_places === "number" ? nb_places : parseInt(String(nb_places ?? "1"), 10);
    if (!REGEX_NOM.test(nomNet)) return json({ error: "Indiquez votre nom (lettres uniquement)." }, 400);
    if (!/^[0-9 +().-]{6,20}$/.test(telNet) || telNet.replace(/\D/g, "").length < 6) return json({ error: "Indiquez un numéro de téléphone valide." }, 400);
    if (emailNet && (emailNet.length > 120 || !REGEX_EMAIL.test(emailNet))) return json({ error: "Cette adresse e-mail ne semble pas valide." }, 400);
    if (!Number.isInteger(nb) || nb < 1 || nb > MAX_PLACES_PAR_RESERVATION) return json({ error: `Vous pouvez réserver de 1 à ${MAX_PLACES_PAR_RESERVATION} places à la fois.` }, 400);

    const ip = req.headers.get("cf-connecting-ip") || (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "inconnue";
    try {
      const { data: autorise } = await sb.rpc("limiter_appel", { p_cle: `reserver-session:${ip}`, p_max: 10, p_fenetre_s: 3600 });
      if (autorise === false) return json({ error: "Trop de tentatives. Réessayez dans un moment." }, 429);
    } catch (e) { console.error("[reserver-session] limiter_appel :", e); }

    const { data: session, error: errS } = await sb.from("artisans_sessions")
      .select("id, artisan_id, titre, date_session, heure_debut, duree_min, lieu, prix_par_personne, statut").eq("id", session_id).maybeSingle();
    if (errS) throw errS;
    if (!session || session.statut !== "ouverte") return json({ error: "Cette session n'est plus disponible.", code: "indisponible" }, 409);
    const { data: artisan, error: errA } = await sb.from("artisans").select("*").eq("id", session.artisan_id).eq("actif", true).maybeSingle();
    if (errA) throw errA;
    if (!artisan) return json({ error: "Cette session n'est plus disponible.", code: "indisponible" }, 409);

    const ipHash = await sha256(`caralink-session:${ip}`);
    const depuis = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { count: dejaIci } = await sb.from("artisans_sessions_inscrits").select("id", { count: "exact", head: true }).eq("session_id", session_id).eq("ip_hash", ipHash).gte("created_at", depuis);
    if ((dejaIci ?? 0) >= 3) return json({ error: "Vous avez déjà réservé plusieurs fois pour cette session aujourd'hui." }, 429);

    const { data: r, error: errR } = await sb.rpc("reserver_place_session", { p_session: session_id, p_nom: nomNet, p_tel: telNet, p_email: emailNet, p_nb: nb, p_ip_hash: ipHash });
    if (errR) throw errR;
    if (!r || !r.ok) {
      if (r?.code === "complet") return json({ error: "Désolé, cette session est complète.", code: "complet" }, 409);
      if (r?.code === "pas_assez") return json({ error: `Il ne reste que ${r.restantes} place${r.restantes > 1 ? "s" : ""}.`, code: "pas_assez", restantes: r.restantes }, 409);
      return json({ error: "Cette session n'est plus disponible.", code: "indisponible" }, 409);
    }

    // ── E-mails (jamais bloquants) ──
    try {
      const quand = `${dateLongue(session.date_session)} à ${heureCourte(session.heure_debut)}`;
      const nomArtisan = artisan.nom_entreprise || "l'artisan";
      if (emailNet) {
        await envoyerEmail(emailNet, `Votre place est réservée — ${session.titre}`, `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#13223c;line-height:1.55;">
          <h2 style="margin:0 0 10px;">✅ Votre place est réservée</h2>
          <p>Bonjour ${escHtml(nomNet)}, c'est confirmé pour <strong>${escHtml(session.titre)}</strong> avec ${escHtml(nomArtisan)}.</p>
          <p style="background:#f3f6fb;border-radius:10px;padding:12px 14px;">📅 ${escHtml(quand)} (${session.duree_min} min)<br>📍 ${escHtml(session.lieu)}<br>👥 ${nb} place${nb > 1 ? "s" : ""}<br>💶 ${escHtml(prixTxt(Number(session.prix_par_personne)))}${Number(session.prix_par_personne) > 0 ? " — à régler directement auprès de l'artisan" : ""}</p>
          ${artisan.telephone ? `<p>Un empêchement ? Prévenez l'artisan au <strong>${escHtml(artisan.telephone)}</strong> pour libérer votre place.</p>` : "<p>Un empêchement ? Prévenez l'artisan pour libérer votre place.</p>"}
          <p style="font-size:12.5px;color:#6b7c96;">CaraLink — made in Guadeloupe 🌴</p></div>`);
      }
      if (artisan.user_id) {
        const { data: u } = await sb.auth.admin.getUserById(artisan.user_id);
        const to = u?.user?.email;
        if (to) {
          await envoyerEmail(to, `Nouvelle inscription — ${session.titre}`, `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#13223c;line-height:1.55;">
            <h2 style="margin:0 0 10px;">🎉 Nouvelle inscription</h2>
            <p><strong>${escHtml(nomNet)}</strong> a réservé ${nb} place${nb > 1 ? "s" : ""} pour <strong>${escHtml(session.titre)}</strong> (${escHtml(quand)}).</p>
            <p>📞 ${escHtml(telNet)}${emailNet ? `<br>✉️ ${escHtml(emailNet)}` : ""}</p>
            <p>Il reste <strong>${r.restantes}</strong> place${r.restantes > 1 ? "s" : ""}.</p>
            <p style="margin:20px 0;"><a href="https://caralink.app/mpa/" style="background:#1565e8;color:#fff;text-decoration:none;padding:12px 20px;border-radius:12px;font-weight:700;">Voir mes sessions →</a></p></div>`);
        }
      }
    } catch (e) { console.error("[reserver-session] notification :", e); }

    return json({ ok: true, restantes: r.restantes });
  } catch (e) {
    console.error("[reserver-session]", e);
    return json({ error: MSG_ERREUR }, 500);
  }
});
