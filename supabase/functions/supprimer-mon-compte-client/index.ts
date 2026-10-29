// ═══════════════════════════════════════════════════════════
// CaraLink Artisans — Edge Function : supprimer-mon-compte-client
// Propriété : TOI Freddy
//
// Suppression RGPD d'un COMPTE CLIENT, à la demande du client lui-même (bouton « Supprimer mon compte » de la page Mon compte).
// À déployer avec --no-verify-jwt (la fonction vérifie elle-même le jeton).
//
// - Efface le compte (connexion) et le profil (nom, téléphone). Les commandes déjà passées restent chez les artisans
//   (obligations comptables) : elles ne sont simplement plus rattachées à un compte.
// - Refuse si ce compte est AUSSI celui d'un artisan : sa suppression passe par MPA Artisans (qui archive et contrôle les commissions).
// ═══════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: artisan } = await sb.from("artisans").select("id").eq("user_id", u.user.id).maybeSingle();
    if (artisan) return json({ error: "artisan" }, 409);

    // Photos des projets publiés (phase 2, 30/10/2026) : effacées avec le compte. Les lignes des projets partent d'elles-mêmes
    // avec le compte ; les photos, elles, resteraient dans l'espace de stockage. Jamais bloquant pour la suppression.
    try {
      const { data: projets } = await sb.from("projets").select("photos").eq("client_user_id", u.user.id);
      const chemins = (projets ?? []).flatMap((p: any) => (Array.isArray(p.photos) ? p.photos : []));
      if (chemins.length) await sb.storage.from("projets-photos").remove(chemins);
    } catch (e) { console.error("[supprimer-mon-compte-client] photos de projets :", e); }

    // Dans l'ordre : le profil, puis le compte (les commandes passent à « sans compte » toutes seules).
    const { error: errP } = await sb.from("comptes_clients").delete().eq("user_id", u.user.id);
    if (errP) throw errP;
    const { error: errU } = await sb.auth.admin.deleteUser(u.user.id);
    if (errU) throw errU;
    return json({ ok: true });
  } catch (e) {
    console.error("[supprimer-mon-compte-client]", e);
    return json({ error: "Une erreur est survenue : votre compte n'a pas été supprimé. Réessayez dans un instant." }, 500);
  }
});
