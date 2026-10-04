// ═══════════════════════════════════════════════════════════
// CaraLink Artisans — Edge Function : soumettre-commande
// Propriété : TOI Freddy
//
// Reçoit une commande publique sur un article du catalogue (retrait
// ou livraison), l'enregistre et prévient l'artisan par email. Pas
// de paiement en ligne pour l'instant — la commande se règle comme
// l'artisan le souhaite, au retrait ou à la livraison.
//
// Sécurité (cette fonction est publique : n'importe qui peut l'appeler) :
//  - un produit non publié (en_vente = false) est traité comme inexistant ;
//  - le stock est vérifié ET décrémenté, comme dans soumettre-commande-panier ;
//  - toutes les valeurs sont contrôlées (type, taille, format) côté serveur ;
//  - tout ce qui entre dans l'email de l'artisan est échappé ;
//  - une panne interne ne révèle jamais son détail au visiteur.
// ═══════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MSG_ERREUR_GENERIQUE = "Une erreur est survenue. Réessayez dans un instant.";
const QUANTITE_MAX = 999;
const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REGEX_DATE = /^\d{4}-\d{2}-\d{2}$/;

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// Tout ce qui vient d'un visiteur ou d'un artisan est échappé avant d'entrer dans un email HTML : sinon un nom
// ou une note contenant du HTML (faux lien, faux bouton) serait envoyé tel quel, depuis l'adresse de la plateforme.
function escHtml(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (m) => (({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }) as Record<string, string>)[m]);
}

async function envoyerEmail(to: string, subject: string, html: string) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) { console.warn("[soumettre-commande] RESEND_API_KEY absente — email non envoyé."); return; }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "CaraLink Artisans <notifications@learnlogicstudio.com>", to: [to], subject, html }),
    });
    if (!res.ok) console.error("[soumettre-commande] Échec envoi Resend :", await res.text());
  } catch (e) { console.error("[soumettre-commande] Erreur envoi email :", e); }
}

function dateValide(s: string): boolean {
  if (!REGEX_DATE.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s; // refuse aussi le 31 février
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return json({ error: "Requête invalide." }, 400);

    const { catalogue_id, quantite, client_nom, client_telephone, client_email, mode, adresse_livraison, code_postal_livraison, commune_livraison, date_souhaitee, notes } = body;

    // Types et tailles : jamais fait confiance à la page (n'importe qui peut appeler cette fonction directement).
    const champsTexte: Array<[unknown, number, string]> = [
      [client_nom, 100, "Votre nom"], [client_telephone, 30, "Votre téléphone"], [client_email, 200, "Votre email"],
      [adresse_livraison, 250, "L'adresse de livraison"], [code_postal_livraison, 12, "Le code postal"],
      [commune_livraison, 100, "La commune"], [notes, 1000, "Vos précisions"],
    ];
    for (const [v, max, libelle] of champsTexte) {
      if (v != null && typeof v !== "string") return json({ error: "Requête invalide." }, 400);
      if (typeof v === "string" && v.trim().length > max) return json({ error: `Texte trop long pour « ${libelle} » (${max} caractères maximum).` }, 400);
    }

    if (typeof catalogue_id !== "string" || !REGEX_UUID.test(catalogue_id)) return json({ error: "Cet article n'existe plus." }, 404);
    if (!client_nom?.trim()) return json({ error: "Votre nom est obligatoire." }, 400);
    if (!client_telephone?.trim()) return json({ error: "Votre téléphone est obligatoire." }, 400);
    if (client_email?.trim() && !REGEX_EMAIL.test(client_email.trim())) return json({ error: "Votre email n'est pas valide." }, 400);
    if (!["retrait", "livraison"].includes(mode)) return json({ error: "Mode invalide." }, 400);
    if (mode === "livraison" && !adresse_livraison?.trim()) return json({ error: "L'adresse de livraison est obligatoire." }, 400);
    if (date_souhaitee != null && date_souhaitee !== "" && (typeof date_souhaitee !== "string" || !dateValide(date_souhaitee))) {
      return json({ error: "La date souhaitée n'est pas valide." }, 400);
    }
    const qte = Math.min(QUANTITE_MAX, Math.max(1, parseInt(String(quantite), 10) || 1));

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: article, error: errArt } = await sb.from("artisans_catalogue")
      .select("id, nom, artisan_id, en_vente, quantite_stock, artisans(nom_entreprise, email)")
      .eq("id", catalogue_id).maybeSingle();
    if (errArt) throw errArt;
    // Un produit non publié est traité comme inexistant : on ne confirme jamais l'existence d'un brouillon.
    if (!article || (article as any).en_vente === false) return json({ error: "Cet article n'existe plus." }, 404);

    const artisanInfos = (article as any).artisans;
    const stock = (article as any).quantite_stock;

    // Stock insuffisant — refusé proprement. quantite_stock à null = illimité. L'artisan est prévenu : une vente
    // manquée par rupture de stock ne doit jamais passer inaperçue (rien n'est enregistré).
    if (stock != null && stock < qte) {
      if (artisanInfos?.email) {
        const htmlAlerte = `<div style="font-family:sans-serif;max-width:480px;">
          <h2 style="color:#B5502F;">✨ MPA AI — une vente vient d'échouer, faute de stock</h2>
          <p><strong>${escHtml(client_nom.trim())}</strong> a tenté de commander <strong>${qte} × ${escHtml(article.nom)}</strong>, mais il n'en restait que <strong>${stock}</strong>.</p>
          <p>La commande n'a pas été enregistrée — le client a vu un message clair, mais rien n'apparaît dans vos commandes.</p>
          <p style="margin-top:16px;">Pensez à réapprovisionner ce produit dans <strong>Mon stock → Mes produits</strong> si vous le pouvez.</p>
          <p style="margin-top:20px;"><a href="https://caralink.app/mpa/" style="color:#B5502F;font-weight:700;">Voir dans MPA Artisans →</a></p>
        </div>`;
        await envoyerEmail(artisanInfos.email, `✨ MPA AI — vente manquée : "${article.nom}" en rupture`, htmlAlerte);
      }
      return json({ error: `Stock insuffisant pour « ${article.nom} » — il n'en reste que ${stock}.` }, 422);
    }

    const { data: commande, error: errIns } = await sb.from("commandes_catalogue").insert({
      artisan_id: article.artisan_id,
      catalogue_id,
      nom_article: article.nom,
      quantite: qte,
      client_nom: client_nom.trim(),
      client_telephone: client_telephone.trim(),
      client_email: client_email?.trim() || null,
      mode,
      adresse_livraison: mode === "livraison" ? adresse_livraison?.trim() : null,
      code_postal_livraison: mode === "livraison" ? code_postal_livraison?.trim() : null,
      commune_livraison: mode === "livraison" ? commune_livraison?.trim() : null,
      date_souhaitee: date_souhaitee || null,
      notes: notes?.trim() || null,
    }).select().single();
    if (errIns) throw errIns;

    // Décrémente le stock suivi. Le filtre gte() est un filet contre une vente concurrente improbable :
    // la mise à jour n'a alors aucun effet plutôt que de passer en négatif.
    if (stock != null) {
      await sb.from("artisans_catalogue").update({ quantite_stock: stock - qte }).eq("id", article.id).gte("quantite_stock", qte);
    }

    if (artisanInfos?.email) {
      const html = `<div style="font-family:sans-serif;max-width:480px;">
        <h2 style="color:#B5502F;">Nouvelle commande — ${escHtml(article.nom)}</h2>
        <p><strong>${escHtml(client_nom.trim())}</strong> (${escHtml(client_telephone.trim())}) commande <strong>${commande.quantite} × ${escHtml(article.nom)}</strong>.</p>
        <p>Mode : ${mode === "livraison" ? "🚚 Livraison — " + escHtml(adresse_livraison.trim()) : "🏠 Retrait sur place"}</p>
        ${date_souhaitee ? `<p>Date souhaitée : ${escHtml(date_souhaitee)}</p>` : ""}
        ${notes?.trim() ? `<p>Précisions : ${escHtml(notes.trim())}</p>` : ""}
        <p style="margin-top:20px;"><a href="https://caralink.app/mpa/" style="color:#B5502F;font-weight:700;">Voir dans MPA Artisans →</a></p>
      </div>`;
      await envoyerEmail(artisanInfos.email, `Nouvelle commande : ${article.nom}`, html);
    }

    return json({ ok: true, commande_id: commande.id });

  } catch (e) {
    console.error("[soumettre-commande]", e);
    return json({ error: MSG_ERREUR_GENERIQUE }, 500); // le détail reste dans les journaux, jamais chez le visiteur
  }
});
