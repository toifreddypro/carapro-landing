// ════════════════════════════════════════════════════════════════
// CaraLink Artisans — Edge Function : verifier-code-promo
// Propriété : TOI Freddy
//
// Le client saisit un code promo dans son panier : on lui dit s'il est valable et quel pourcentage il donne. Le code peut être
// « secret » (non affiché sur CaraLink : code partenaire, vidéo, affiche…), donc le navigateur ne peut pas le comparer lui-même.
// La remise réellement appliquée est recalculée par soumettre-commande-panier au moment de la commande : ceci n'est qu'un aperçu.
//
// POST { artisan_id, code, access_token }  →  { ok: true, code, pct }
//   ou { error: "code_invalide" } (même réponse pour un code faux, expiré ou d'un artisan non Pro)
//   ou { error: "connexion_requise" } (pas de compte client connecté : le code n'est même pas regardé)
//   ou { error: "code_deja_utilise" } (une seule utilisation par client et par boutique)
// Limite : 15 essais / 10 minutes par visiteur et par boutique (on ne peut pas deviner un code par essais répétés).
// À déployer avec --no-verify-jwt (appelée par le navigateur du client).
// ════════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
async function limiteAtteinte(sb: any, cle: string, max: number, fenetreSecondes: number): Promise<boolean> {
  try {
    const { data, error } = await sb.rpc("limiter_appel", { p_cle: cle, p_max: max, p_fenetre_s: fenetreSecondes });
    if (error) { console.error("[limiter_appel]", error.message); return false; }
    return data === false;
  } catch (e) { console.error("[limiter_appel]", e); return false; }
}

function codePromoValide(a: any, plan: string | null | undefined): boolean {
  if (!a || !a.code_promo || !String(a.code_promo).trim()) return false;
  if (plan !== "pro" && plan !== "pro_offert") return false;
  const pct = Number(a.code_promo_pct);
  if (!(pct >= 1 && pct <= 50)) return false;
  if (a.code_promo_fin) {
    const aujourdhui = new Date(Date.now() - 4 * 3600 * 1000).toISOString().slice(0, 10);
    if (String(a.code_promo_fin).slice(0, 10) < aujourdhui) return false;
  }
  return true;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return json({ error: "Requête invalide." }, 400);
    const artisanId = String(body.artisan_id || "");
    const saisi = typeof body.code === "string" ? body.code.trim() : "";
    if (!REGEX_UUID.test(artisanId) || !saisi || saisi.length > 40) return json({ error: "code_invalide" }, 422);

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const ip = (req.headers.get("x-forwarded-for") || "inconnue").split(",")[0].trim();
    if (await limiteAtteinte(sb, `code-promo:${artisanId}:${ip}`, 15, 600)) return json({ error: "Trop d'essais. Réessayez dans quelques minutes." }, 429);

    // Un code promo n'est utilisable qu'avec un COMPTE CLIENT connecté (règle du 23/10 : une seule utilisation par client).
    // Contrôlé AVANT de regarder le code : sans compte, la réponse est toujours la même, qu'il soit bon ou faux
    // (sinon un visiteur pourrait deviner un code secret en voyant la réponse changer).
    let clientId: string | null = null;
    if (typeof body.access_token === "string" && body.access_token.length > 20 && body.access_token.length < 4000) {
      try {
        const { data: ud } = await sb.auth.getUser(body.access_token);
        if (ud?.user?.id) clientId = ud.user.id;
      } catch (_) { /* jeton invalide : traité comme « pas connecté » */ }
    }
    if (!clientId) return json({ error: "connexion_requise" }, 401);

    const { data: a } = await sb.from("artisans")
      .select("plan, code_promo, code_promo_pct, code_promo_fin, stripe_connect_statut, boutique_en_pause, actif").eq("id", artisanId).maybeSingle();
    if (!a || a.actif === false || a.stripe_connect_statut !== "actif" || a.boutique_en_pause === true) return json({ error: "code_invalide" }, 422);
    if (!codePromoValide(a, a.plan) || String(a.code_promo).trim().toLowerCase() !== saisi.toLowerCase()) return json({ error: "code_invalide" }, 422);
    // Une seule utilisation par client et par boutique (une commande payée avec un code, non remboursée en totalité).
    const { data: dejaUtilise, error: errUtilise } = await sb.rpc("code_promo_deja_utilise", { p_user: clientId, p_artisan: artisanId });
    if (errUtilise) throw errUtilise;
    if (dejaUtilise === true) return json({ error: "code_deja_utilise" }, 422);
    return json({ ok: true, code: String(a.code_promo).trim(), pct: Number(a.code_promo_pct) });
  } catch (e) {
    console.error("[verifier-code-promo]", e);
    return json({ error: "Une erreur est survenue. Réessayez dans un instant." }, 500);
  }
});
