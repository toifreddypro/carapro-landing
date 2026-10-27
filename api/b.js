// ═══════════════════════════════════════════════════════════
// CaraLink Artisans — Aperçu de partage d'une boutique (Vercel, dossier api/)
// Propriété : TOI Freddy
//
// Pourquoi : quand on colle le lien d'une boutique dans WhatsApp, Facebook, Messenger ou un SMS, ces applications ne lancent pas le
// JavaScript de la page. Elles lisent seulement les balises « og: » de la page reçue. Or la page catalogue.html se remplit après coup,
// donc elles ne voyaient rien. Cette petite fonction leur sert une page minimale avec le NOM, l'ACCROCHE et la BANNIÈRE de l'artisan.
//
// Pour un visiteur normal, la même réponse le renvoie aussitôt vers la vraie boutique (/artisans/catalogue.html?s=…).
//
// Lien à partager : https://caralink.app/api/b?s=<slug de la boutique>
// Sécurité : le slug est vérifié (lettres, chiffres, tirets) ; tout texte est échappé ; l'image n'est acceptée que si elle vient
// du stockage de CaraLink (Supabase), jamais d'une adresse quelconque. Aucune donnée privée : on ne lit que ce que la boutique publique montre déjà.
// ═══════════════════════════════════════════════════════════

const SUPABASE_URL = "https://uzgboxfxpxazhysusewv.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV6Z2JveGZ4cHhhemh5c3VzZXd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkyMzI4NzUsImV4cCI6MjEwNDgwODg3NX0.zHWjsI4jH26I41R3oe8wDL4GazTWspxUdjQCe-fW7eQ";
const SITE = "https://caralink.app";
const PREFIXE_IMAGES = SUPABASE_URL + "/storage/v1/object/public/";

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}
function coupe(s, max) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max - 1).trimEnd() + "…" : t;
}

module.exports = async function handler(req, res) {
  const slug = String((req.query && req.query.s) || "");
  const slugOk = /^[A-Za-z0-9_-]{1,100}$/.test(slug);
  const cible = slugOk ? SITE + "/artisans/catalogue.html?s=" + encodeURIComponent(slug) : SITE + "/artisans/";

  // Valeurs par défaut (boutique introuvable, fermée, ou lecture impossible) : le lien marche quand même.
  let titre = "Boutique — CaraLink Artisans";
  let description = "Découvrez cette boutique d'artisan en Guadeloupe : commandez et payez en ligne, en toute simplicité.";
  let image = null;

  if (slugOk) {
    try {
      const ctrl = new AbortController();
      const minuteur = setTimeout(() => ctrl.abort(), 4000);
      const r = await fetch(SUPABASE_URL + "/functions/v1/lire-catalogue?s=" + encodeURIComponent(slug), {
        headers: { apikey: SUPABASE_ANON, Authorization: "Bearer " + SUPABASE_ANON },
        signal: ctrl.signal,
      });
      clearTimeout(minuteur);
      if (r.ok) {
        const d = await r.json();
        const a = d && d.artisan;
        if (a && a.nom_entreprise) {
          titre = coupe(a.nom_entreprise, 70) + " — Boutique CaraLink Artisans";
          const accroche = coupe(a.boutique_accroche, 200);
          const texte = coupe(a.boutique_texte, 200);
          const lieu = a.commune ? " à " + coupe(a.commune, 40) : "";
          description = accroche || texte || ("Boutique de " + coupe(a.nom_entreprise, 70) + lieu + " : commandez et payez en ligne.");
          const candidates = [a.boutique_banniere_url, a.photo_profil_url];
          for (const c of candidates) {
            if (typeof c === "string" && c.startsWith(PREFIXE_IMAGES) && c.length < 600) { image = c; break; }
          }
        }
      }
    } catch (_) { /* on garde les valeurs par défaut */ }
  }

  const html = "<!DOCTYPE html><html lang=\"fr\"><head><meta charset=\"utf-8\">" +
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">" +
    "<title>" + esc(titre) + "</title>" +
    "<meta name=\"description\" content=\"" + esc(description) + "\">" +
    "<link rel=\"canonical\" href=\"" + esc(cible) + "\">" +
    "<meta property=\"og:type\" content=\"website\">" +
    "<meta property=\"og:site_name\" content=\"CaraLink Artisans\">" +
    "<meta property=\"og:locale\" content=\"fr_FR\">" +
    "<meta property=\"og:title\" content=\"" + esc(titre) + "\">" +
    "<meta property=\"og:description\" content=\"" + esc(description) + "\">" +
    "<meta property=\"og:url\" content=\"" + esc(cible) + "\">" +
    (image ? "<meta property=\"og:image\" content=\"" + esc(image) + "\">" : "") +
    "<meta name=\"twitter:card\" content=\"" + (image ? "summary_large_image" : "summary") + "\">" +
    "<meta name=\"twitter:title\" content=\"" + esc(titre) + "\">" +
    "<meta name=\"twitter:description\" content=\"" + esc(description) + "\">" +
    (image ? "<meta name=\"twitter:image\" content=\"" + esc(image) + "\">" : "") +
    // Visiteur normal : redirection immédiate. (Les robots de partage ne suivent pas ceci et lisent les balises ci-dessus.)
    "<meta http-equiv=\"refresh\" content=\"0;url=" + esc(cible) + "\">" +
    "<script>location.replace(" + JSON.stringify(cible).replace(/</g, "\\u003c") + ");</script>" +
    "</head><body style=\"font-family:sans-serif;padding:24px;\"><p><a href=\"" + esc(cible) + "\">Ouvrir la boutique</a></p></body></html>";

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  // Mis en cache 5 minutes côté Vercel : une boutique très partagée ne sollicite pas la base à chaque clic.
  res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
  res.status(200).send(html);
};
