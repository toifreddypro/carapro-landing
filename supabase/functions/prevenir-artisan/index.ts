// ═════════════════════════════════════════════════
// CaraLink — Edge Function : prevenir-artisan (Lot 24)
// Un client voit un artisan qui n'a pas encore activé les paiements en ligne (donc pas réservable) et touche
// « Prévenir cet artisan ». On enregistre l'intérêt et on envoie UN e-mail doux à l'artisan (au plus un par jour).
//
// Sécurité (fonction publique : n'importe qui peut l'appeler avec n'importe quoi) :
//  - prénom et message contrôlés côté serveur (type, taille, caractères) ; aucun lien accepté dans le message ;
//  - tout ce qui entre dans l'e-mail est échappé ;
//  - l'artisan doit exister ET ne pas être déjà réservable (sinon : refus) ;
//  - la même personne (adresse IP, stockée hachée) ne prévient le même artisan qu'une fois par jour, et au plus 5 artisans par jour ;
//  - au plus un e-mail par jour et par artisan, quel que soit le nombre de clients ;
//  - un échec d'envoi d'e-mail ne fait jamais échouer la demande ; une panne interne ne révèle jamais son détail.
// ═════════════════════════════════════════════════
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const MSG_ERREUR = "Une erreur est survenue. Réessayez dans un instant.";
const MAX_ARTISANS_PAR_JOUR = 5;
const REGEX_PRENOM = /^[\p{L}][\p{L} '’-]{0,39}$/u;
const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
async function envoyerEmail(to: string, subject: string, html: string): Promise<boolean> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) { console.warn("[prevenir-artisan] RESEND_API_KEY absente — email non envoyé."); return false; }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "CaraLink Artisans <notifications@learnlogicstudio.com>", to: [to], subject, html }),
    });
    if (!res.ok) { console.error("[prevenir-artisan] Échec envoi Resend :", await res.text()); return false; }
    return true;
  } catch (e) { console.error("[prevenir-artisan] Erreur envoi email :", e); return false; }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);
  const sb = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Requête invalide." }, 400);
    const { artisan_id, prenom, message } = body as Record<string, unknown>;
    if (typeof artisan_id !== "string" || !REGEX_UUID.test(artisan_id)) return json({ error: "Requête invalide." }, 400);
    if (typeof prenom !== "string") return json({ error: "Indiquez votre prénom." }, 400);
    if (message != null && typeof message !== "string") return json({ error: "Requête invalide." }, 400);
    const prenomNet = prenom.trim().replace(/\s+/g, " ");
    if (!REGEX_PRENOM.test(prenomNet)) return json({ error: "Indiquez votre prénom (lettres uniquement)." }, 400);
    const msgNet = (message ?? "").trim();
    if (msgNet.length > 300) return json({ error: "Votre message est trop long (300 caractères au maximum)." }, 400);
    if (/https?:|www\.|@|\.(com|fr|net|org|app)\b/i.test(msgNet)) return json({ error: "Merci de ne pas mettre de lien ni d'adresse dans le message." }, 400);

    const ip = req.headers.get("cf-connecting-ip") || (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "inconnue";
    try {
      const { data: autorise } = await sb.rpc("limiter_appel", { p_cle: `prevenir-artisan:${ip}`, p_max: 10, p_fenetre_s: 3600 });
      if (autorise === false) return json({ error: "Trop de tentatives. Réessayez dans un moment." }, 429);
    } catch (e) { console.error("[prevenir-artisan] limiter_appel :", e); }

    const { data: artisan, error: errArt } = await sb.from("artisans").select("id, nom_entreprise, user_id, stripe_connect_statut").eq("id", artisan_id).maybeSingle();
    if (errArt) throw errArt;
    if (!artisan) return json({ error: "Artisan introuvable." }, 404);
    if (artisan.stripe_connect_statut === "actif") return json({ error: "Cet artisan peut déjà être réservé directement.", code: "reservable" }, 409);

    const ipHash = await sha256(`caralink-interet:${ip}`);
    const depuis = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data: recents, error: errRec } = await sb.from("artisans_interets").select("artisan_id").eq("ip_hash", ipHash).gte("created_at", depuis);
    if (errRec) throw errRec;
    if ((recents ?? []).some((r: any) => r.artisan_id === artisan_id)) return json({ ok: true, deja: true }); // déjà prévenu aujourd'hui : on remercie, sans rien refaire
    if (new Set((recents ?? []).map((r: any) => r.artisan_id)).size >= MAX_ARTISANS_PAR_JOUR) return json({ error: "Vous avez déjà prévenu plusieurs artisans aujourd'hui. Réessayez demain." }, 429);

    const { data: ligne, error: errIns } = await sb.from("artisans_interets")
      .insert({ artisan_id, prenom: prenomNet, message: msgNet || null, ip_hash: ipHash }).select("id").single();
    if (errIns) throw errIns;

    // ── E-mail : au plus un par jour et par artisan — jamais bloquant ──
    try {
      const { count: dejaMails } = await sb.from("artisans_interets").select("id", { count: "exact", head: true })
        .eq("artisan_id", artisan_id).eq("email_envoye", true).gte("created_at", depuis);
      if ((dejaMails ?? 0) === 0 && artisan.user_id) {
        const { data: u } = await sb.auth.admin.getUserById(artisan.user_id);
        const to = u?.user?.email;
        if (to) {
          const depuis30 = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
          const { count: nb30 } = await sb.from("artisans_interets").select("id", { count: "exact", head: true }).eq("artisan_id", artisan_id).gte("created_at", depuis30);
          const autres = Math.max(0, (nb30 ?? 1) - 1);
          const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#13223c;line-height:1.55;">
            <h2 style="margin:0 0 12px;">Un client voulait vous réserver 👋</h2>
            <p><strong>${escHtml(prenomNet)}</strong> a regardé votre fiche sur CaraLink et aurait aimé réserver chez vous.</p>
            ${msgNet ? `<p style="background:#f3f6fb;border-radius:10px;padding:10px 14px;">« ${escHtml(msgNet).replace(/\r?\n/g, "<br>")} »</p>` : ""}
            ${autres > 0 ? `<p>${autres} autre${autres > 1 ? "s" : ""} personne${autres > 1 ? "s" : ""} ${autres > 1 ? "ont" : "a"} aussi voulu vous réserver ces 30 derniers jours.</p>` : ""}
            <p>Pour l'instant, vos clients ne peuvent pas réserver en ligne chez vous, car les paiements en ligne ne sont pas encore activés. Cela prend environ 5 minutes (pièce d'identité et IBAN), et cela vous protège des rendez-vous non honorés.</p>
            <p style="margin:22px 0;"><a href="https://caralink.app/mpa/" style="background:#1565e8;color:#fff;text-decoration:none;padding:12px 20px;border-radius:12px;font-weight:700;">Activer mes réservations →</a></p>
            <p style="font-size:12.5px;color:#6b7c96;">Vous recevez au plus un e-mail de ce type par jour.</p></div>`;
          if (await envoyerEmail(to, "Un client voulait vous réserver sur CaraLink", html)) {
            await sb.from("artisans_interets").update({ email_envoye: true }).eq("id", ligne.id);
          }
        }
      }
    } catch (e) { console.error("[prevenir-artisan] notification :", e); }

    return json({ ok: true });
  } catch (e) {
    console.error("[prevenir-artisan]", e);
    return json({ error: MSG_ERREUR }, 500);
  }
});
