// ═══════════════════════════════════════════════════════════
// CaraLink Artisans — Edge Function : envoyer-rappels-entretien
// Propriété : TOI Freddy
//
// Le carnet d'entretien : une fois par jour, un email de rappel aux clients dont un entretien arrive à échéance
// (« il y a 12 mois, Jean Plomb est intervenu pour l'entretien de votre chaudière »). Appelée chaque jour par
// envoyer-rappels-prestations (même secret, même passage) ; l'administrateur peut aussi la lancer à la main.
//
// Règles (voir retour-client-3.sql) :
//  - seulement les adresses qui ont un compte CaraLink CONFIRMÉ, et seulement si le client n'a pas coupé le rappel ;
//  - UN rappel par cycle : la ligne est « réclamée » AVANT l'envoi (deux lancements simultanés n'envoient jamais deux fois) ;
//    si l'envoi échoue, la réclamation est annulée et le rappel sera retenté le lendemain (pendant 60 jours) ;
//  - un seul email par client et par jour, même s'il a plusieurs entretiens à échéance ;
//  - chaque email porte un lien de désinscription (par ligne, ou pour tous les rappels) + l'en-tête List-Unsubscribe ;
//  - les avantages de l'artisan (code promo, remise « client fidèle », cashback) ne sont cités que s'il est en offre Pro avec
//    paiements en ligne actifs, et un code « partenaire » masqué n'est jamais révélé ;
//  - si l'artisan n'est plus disponible (compte supprimé, désactivé, suspendu), le rappel dit simplement qu'il faut en trouver
//    un autre et renvoie vers l'annuaire : AUCUN artisan n'est nommé ni mis en avant ;
//  - tout ce qui entre dans l'email est échappé (noms, services) ; les liens sont construits ici, jamais pris d'une saisie.
// ═══════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};
const ADMIN_EMAIL = "toifreddypro@gmail.com";
const CRON_SECRET = Deno.env.get("RAPPELS_CRON_SECRET");
const DECALAGE_LOCAL_MS = 4 * 3600 * 1000; // Guadeloupe = UTC-4
const SITE = "https://caralink.app/artisans";
const MSG_ERREUR_GENERIQUE = "Une erreur est survenue. Réessayez dans un instant.";
const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
function escHtml(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (m) => (({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }) as Record<string, string>)[m]);
}
function egalConstant(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function aujourdhuiGuadeloupe(): string { return new Date(Date.now() - DECALAGE_LOCAL_MS).toISOString().slice(0, 10); }
function dateValide(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
const estPro = (plan: string | null | undefined) => plan === "pro" || plan === "pro_offert";

function dureeDepuis(dateIso: string): string {
  const d = new Date(dateIso + "T12:00:00Z"), a = new Date(aujourdhuiGuadeloupe() + "T12:00:00Z");
  let mois = (a.getUTCFullYear() - d.getUTCFullYear()) * 12 + (a.getUTCMonth() - d.getUTCMonth());
  if (a.getUTCDate() < d.getUTCDate()) mois--;
  if (mois < 1) return "récemment";
  if (mois < 12) return `il y a ${mois} mois`;
  const ans = Math.floor(mois / 12), reste = mois % 12;
  return `il y a ${ans} an${ans > 1 ? "s" : ""}${reste ? ` et ${reste} mois` : ""}`;
}

async function envoyerEmail(to: string, subject: string, html: string, lienDesinscription: string): Promise<boolean> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) { console.warn("[envoyer-rappels-entretien] RESEND_API_KEY absente — email non envoyé."); return false; }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "CaraLink Artisans <notifications@learnlogicstudio.com>", to: [to], subject, html,
        headers: { "List-Unsubscribe": `<${lienDesinscription}>` },
      }),
    });
    if (!res.ok) { console.error("[envoyer-rappels-entretien] Échec Resend :", await res.text()); return false; }
    return true;
  } catch (e) { console.error("[envoyer-rappels-entretien] Erreur envoi email :", e); return false; }
}

// Les avantages que l'artisan offre réellement à ce client (rien d'inventé : seulement ce qui est réglé et applicable).
function avantagesHtml(l: any, aujourdhui: string): string {
  if (l.indisponible || !estPro(l.plan) || !l.stripe_actif) return "";
  const lignes: string[] = [];
  const pctCode = Number(l.code_promo_pct);
  const codeUtilisable = l.code_promo && String(l.code_promo).trim() && l.code_promo_visible !== false && pctCode >= 1 && pctCode <= 50
    && (!l.code_promo_fin || String(l.code_promo_fin).slice(0, 10) >= aujourdhui);
  const pctFid = Number(l.remise_fidele_pct), pctCb = Number(l.cashback_pct);
  if (pctFid >= 1 && pctFid <= 20) lignes.push(`🤝 <strong>${escHtml(String(pctFid).replace(".", ","))} % de remise</strong> sur le paiement final, parce que vous êtes déjà venu : elle s'applique toute seule.`);
  if (codeUtilisable) lignes.push(`🎁 Code promo <strong>${escHtml(String(l.code_promo).trim())}</strong> : ${escHtml(String(pctCode).replace(".", ","))} % de remise (la plus avantageuse des deux remises s'applique).`);
  if (pctCb >= 1 && pctCb <= 10) lignes.push(`💚 <strong>${escHtml(String(pctCb).replace(".", ","))} % de cashback</strong> : un crédit offert pour votre prochaine intervention.`);
  if (!lignes.length) return "";
  return `<div style="margin:10px 0 0;padding:10px 14px;border-radius:8px;background:#f0fdf4;border:1px solid #bbf7d0;font-size:13px;color:#166534;line-height:1.55;">${lignes.join("<br>")}<div style="font-size:11.5px;color:#4b7a5c;margin-top:4px;">Avantages proposés par cet artisan quand vous payez en ligne via CaraLink.</div></div>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);

  try {
    const estCron = !!CRON_SECRET && egalConstant(req.headers.get("X-Cron-Secret") ?? "", CRON_SECRET);
    if (!estCron) {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return json({ error: "Non authentifié." }, 401);
      const sbCaller = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
      const { data: { user } } = await sbCaller.auth.getUser();
      if (!user || user.email !== ADMIN_EMAIL) return json({ error: "Réservé à l'administrateur." }, 403);
    }

    const body = await req.json().catch(() => ({}));
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Requête invalide." }, 400);
    if (body.date_iso != null && body.date_iso !== "" && (typeof body.date_iso !== "string" || !dateValide(body.date_iso))) return json({ error: "Date invalide (format AAAA-MM-JJ)." }, 400);
    const dateJour: string = body.date_iso || aujourdhuiGuadeloupe();

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: lignes, error } = await sb.rpc("rappels_entretien_du_jour", { p_date: dateJour });
    if (error) throw error;

    // Un seul email par client et par jour.
    const parClient = new Map<string, any[]>();
    for (const l of lignes || []) { if (!parClient.has(l.client_email)) parClient.set(l.client_email, []); parClient.get(l.client_email)!.push(l); }

    const bilan = { clients: parClient.size, envoyes: 0, rappels: 0, echecs: 0, deja_traites: 0 };
    for (const [email, liste] of parClient) {
      // « Réclamation » AVANT l'envoi : seul un des lancements simultanés obtient chaque ligne.
      const reclamees: any[] = [];
      for (const l of liste) {
        if (!REGEX_UUID.test(String(l.id))) continue;
        const { data: r } = await sb.from("carnet_entretien").update({ dernier_rappel_envoye_le: new Date().toISOString() }).eq("id", l.id).is("dernier_rappel_envoye_le", null).select("id");
        if (r && r.length) reclamees.push(l); else bilan.deja_traites++;
      }
      if (!reclamees.length) continue;

      const premier = reclamees[0];
      const lienTout = `${SITE}/desinscription-carnet.html?j=${encodeURIComponent(premier.jeton)}&tout=1`;
      const blocs = reclamees.map((l) => {
        const nom = escHtml(l.artisan_nom || "votre artisan"), service = escHtml(l.service_nom);
        const stop = `<div style="font-size:11.5px;margin-top:10px;"><a href="${SITE}/desinscription-carnet.html?j=${encodeURIComponent(l.jeton)}" style="color:#6b7c96;">Ne plus recevoir ce rappel</a></div>`;
        if (l.indisponible) {
          return `<div style="border:1px solid #e3eaf4;border-radius:10px;padding:14px 16px;margin:0 0 14px;">
            <div style="font-weight:700;">🔧 ${service}</div>
            <p style="margin:6px 0 10px;font-size:14px;">${escHtml(dureeDepuis(String(l.derniere_intervention_le)))}, ${nom} est intervenu chez vous. <strong>Cet artisan n'est plus disponible sur CaraLink.</strong> Si vous avez encore besoin de ce service, vous pouvez trouver un autre artisan dans l'annuaire.</p>
            <a href="${SITE}/" style="display:inline-block;background:#B5502F;color:#ffffff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;">Trouver un artisan</a>${stop}</div>`;
        }
        const lienFiche = REGEX_UUID.test(String(l.artisan_id)) ? `${SITE}/?artisan=${encodeURIComponent(l.artisan_id)}` : `${SITE}/`;
        const tel = l.telephone ? `<div style="font-size:12.5px;color:#475569;margin-top:8px;">Ou appelez directement ${nom} : ${escHtml(l.telephone)}</div>` : "";
        return `<div style="border:1px solid #e3eaf4;border-radius:10px;padding:14px 16px;margin:0 0 14px;">
          <div style="font-weight:700;">🔧 ${service}</div>
          <p style="margin:6px 0 10px;font-size:14px;">${escHtml(dureeDepuis(String(l.derniere_intervention_le)))}, <strong>${nom}</strong> est intervenu chez vous. C'est le bon moment d'y penser.</p>
          <a href="${escHtml(lienFiche)}" style="display:inline-block;background:#B5502F;color:#ffffff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;">Reprendre rendez-vous</a>
          ${avantagesHtml(l, dateJour)}${tel}${stop}</div>`;
      }).join("");

      const un = reclamees.length === 1;
      const sujet = un
        ? `🔧 C'est le moment : ${String(premier.service_nom).replace(/[\u0000-\u001f\u007f]+/g, " ").slice(0, 80)}`
        : "🔧 Vos rappels d'entretien CaraLink";
      const html = `<div style="font-family:sans-serif;max-width:520px;">
        <h2 style="color:#B5502F;">${un ? "Un petit rappel d'entretien" : "Vos rappels d'entretien"}</h2>
        <p>Bonjour,</p>
        <p style="font-size:14px;">Voici ${un ? "un entretien" : "des entretiens"} à prévoir, d'après votre carnet CaraLink.</p>
        ${blocs}
        <p style="font-size:12px;color:#6b7c96;line-height:1.5;margin-top:22px;">Vous recevez ce rappel parce que vous avez un compte CaraLink et que vous avez fait appel à ${un ? "cet artisan" : "ces artisans"}. Vous retrouvez et gérez vos rappels dans « Mon compte » → « Mon carnet ».<br>
        <a href="${escHtml(lienTout)}" style="color:#6b7c96;">Ne plus recevoir aucun rappel d'entretien</a></p>
      </div>`;

      const ok = await envoyerEmail(email, sujet, html, lienTout);
      if (ok) { bilan.envoyes++; bilan.rappels += reclamees.length; }
      else {
        bilan.echecs++;
        await sb.from("carnet_entretien").update({ dernier_rappel_envoye_le: null }).in("id", reclamees.map((l) => l.id)); // retenté demain
      }
    }
    return json({ ok: true, date: dateJour, ...bilan });
  } catch (e) {
    console.error("[envoyer-rappels-entretien]", e);
    return json({ error: MSG_ERREUR_GENERIQUE }, 500);
  }
});
