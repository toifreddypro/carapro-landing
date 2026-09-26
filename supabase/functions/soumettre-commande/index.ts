// ═══════════════════════════════════════════════════════════
// CaraLink Artisans — Edge Function : soumettre-commande
// Propriété : TOI Freddy
//
// Reçoit une commande publique sur un article du catalogue (retrait
// ou livraison), l'enregistre et prévient l'artisan par email. Pas
// de paiement en ligne pour l'instant — la commande se règle comme
// l'artisan le souhaite, au retrait ou à la livraison.
// ═══════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);

  try {
    const body = await req.json().catch(() => null);
    if (!body) return json({ error: "Requête invalide." }, 400);

    const { catalogue_id, quantite, client_nom, client_telephone, client_email, mode, adresse_livraison, code_postal_livraison, commune_livraison, date_souhaitee, notes } = body;

    if (!catalogue_id) return json({ error: "Article manquant." }, 400);
    if (!client_nom?.trim()) return json({ error: "Votre nom est obligatoire." }, 400);
    if (!client_telephone?.trim()) return json({ error: "Votre téléphone est obligatoire." }, 400);
    if (!["retrait", "livraison"].includes(mode)) return json({ error: "Mode invalide." }, 400);
    if (mode === "livraison" && !adresse_livraison?.trim()) return json({ error: "L'adresse de livraison est obligatoire." }, 400);

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: article, error: errArt } = await sb.from("artisans_catalogue")
      .select("id, nom, artisan_id, artisans(nom_entreprise, email)")
      .eq("id", catalogue_id).maybeSingle();
    if (errArt) throw errArt;
    if (!article) return json({ error: "Cet article n'existe plus." }, 404);

    const { data: commande, error: errIns } = await sb.from("commandes_catalogue").insert({
      artisan_id: article.artisan_id,
      catalogue_id,
      nom_article: article.nom,
      quantite: Math.max(1, parseInt(quantite, 10) || 1),
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

    const artisanInfos = (article as any).artisans;
    if (artisanInfos?.email) {
      const html = `<div style="font-family:sans-serif;max-width:480px;">
        <h2 style="color:#B5502F;">Nouvelle commande — ${article.nom}</h2>
        <p><strong>${client_nom}</strong> (${client_telephone}) commande <strong>${commande.quantite} × ${article.nom}</strong>.</p>
        <p>Mode : ${mode === "livraison" ? "🚚 Livraison — " + adresse_livraison : "🏠 Retrait sur place"}</p>
        ${date_souhaitee ? `<p>Date souhaitée : ${date_souhaitee}</p>` : ""}
        ${notes ? `<p>Précisions : ${notes}</p>` : ""}
        <p style="margin-top:20px;"><a href="https://caralink.app/mpa/" style="color:#B5502F;font-weight:700;">Voir dans MPA Artisans →</a></p>
      </div>`;
      await envoyerEmail(artisanInfos.email, `Nouvelle commande : ${article.nom}`, html);
    }

    return json({ ok: true, commande_id: commande.id });

  } catch (e) {
    console.error("[soumettre-commande]", e);
    return json({ error: (e as Error).message }, 500);
  }
});
