// ═══════════════════════════════════════════════════════════
// CaraLink Artisans — Edge Function : soumettre-commande-panier
// Propriété : TOI Freddy
//
// Reçoit un panier (plusieurs articles du catalogue, potentiellement de
// quantités différentes) et crée UNE commande avec plusieurs lignes.
// Remplace, pour catalogue.html, l'ancienne soumission "un produit à la
// fois" (soumettre-commande.ts, qui reste utilisée telle quelle par la
// fiche détaillée — jamais touchée ici).
//
// Sécurité : les prix ne sont JAMAIS pris tels quels dans la requête —
// toujours revérifiés depuis artisans_catalogue côté serveur (avec la
// remise en cours appliquée), pour qu'un visiteur ne puisse pas changer
// un prix en modifiant la requête envoyée par son navigateur. Le prix
// ainsi figé est celui qui sera facturé, même si l'artisan change son
// tarif entre la commande et le paiement.
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
  if (!apiKey) { console.warn("[soumettre-commande-panier] RESEND_API_KEY absente — email non envoyé."); return; }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "CaraLink Artisans <notifications@learnlogicstudio.com>", to: [to], subject, html }),
    });
    if (!res.ok) console.error("[soumettre-commande-panier] Échec envoi Resend :", await res.text());
  } catch (e) { console.error("[soumettre-commande-panier] Erreur envoi email :", e); }
}

// ── Frais de livraison — calcul réel à la commande, jamais pris du navigateur. Mêmes sources
// que MPA (Base Adresse Nationale pour géocoder, IGN Géoplateforme pour la distance réelle par
// la route — jamais une distance à vol d'oiseau).
async function geocoderAdresse(adresse: string, cp: string | null, commune: string | null): Promise<{ lat: number; lon: number } | null> {
  const q = [adresse, cp, commune].filter(Boolean).join(", ");
  if (!q) return null;
  try {
    const res = await fetch("https://api-adresse.data.gouv.fr/search/?limit=1&q=" + encodeURIComponent(q));
    const data = await res.json();
    const feature = data?.features?.[0];
    if (feature?.geometry?.coordinates) return { lat: feature.geometry.coordinates[1], lon: feature.geometry.coordinates[0] };
  } catch (e) { console.warn("[soumettre-commande-panier] Géocodage échoué :", e); }
  return null;
}

async function distanceTrajetKm(latA: number, lonA: number, latB: number, lonB: number): Promise<number | null> {
  try {
    const url = `https://data.geopf.fr/navigation/itineraire?resource=bdtopo-osrm&profile=car&optimization=fastest&getSteps=false&geometryFormat=polyline&distanceUnit=meter&timeUnit=second&start=${lonA},${latA}&end=${lonB},${latB}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.distance != null) return data.distance / 1000;
  } catch (e) { console.warn("[soumettre-commande-panier] Calcul de trajet échoué :", e); }
  return null;
}

function calculerFraisLivraison(base: number, kmInclus: number, prixKm: number, distanceKm: number): number {
  if (distanceKm <= kmInclus) return base;
  return Math.round((base + (distanceKm - kmInclus) * prixKm) * 100) / 100;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);

  try {
    const body = await req.json().catch(() => null);
    if (!body) return json({ error: "Requête invalide." }, 400);

    const { artisan_id, lignes, client_nom, client_telephone, client_email, mode, adresse_livraison, code_postal_livraison, commune_livraison, date_souhaitee, notes } = body;

    if (!artisan_id) return json({ error: "Boutique manquante." }, 400);
    if (!Array.isArray(lignes) || !lignes.length) return json({ error: "Le panier est vide." }, 400);
    if (!client_nom?.trim()) return json({ error: "Votre nom est obligatoire." }, 400);
    if (!client_telephone?.trim()) return json({ error: "Votre téléphone est obligatoire." }, 400);
    if (!["retrait", "livraison"].includes(mode)) return json({ error: "Mode invalide." }, 400);
    if (mode === "livraison" && !adresse_livraison?.trim()) return json({ error: "L'adresse de livraison est obligatoire." }, 400);

    // Quantités demandées, par identifiant d'article — jamais les prix, jamais les noms
    // (uniquement pour indiquer QUOI et COMBIEN ; le prix vient toujours de la base).
    const quantitesDemandees = new Map<string, number>();
    for (const l of lignes) {
      if (!l || !l.catalogue_id) return json({ error: "Article invalide dans le panier." }, 400);
      const q = Math.max(1, parseInt(l.quantite, 10) || 1);
      quantitesDemandees.set(l.catalogue_id, (quantitesDemandees.get(l.catalogue_id) || 0) + q);
    }
    const idsArticles = [...quantitesDemandees.keys()];

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Les articles doivent tous appartenir à CET artisan — jamais mélanger le panier de plusieurs boutiques.
    const { data: articles, error: errArt } = await sb.from("artisans_catalogue")
      .select("id, nom, prix, promo_pct, artisan_id").in("id", idsArticles).eq("artisan_id", artisan_id);
    if (errArt) throw errArt;
    if (!articles || articles.length !== idsArticles.length) {
      return json({ error: "Un ou plusieurs articles de votre panier n'existent plus. Actualisez la page." }, 404);
    }

    const { data: artisan, error: errA } = await sb.from("artisans")
      .select("nom_entreprise, email, latitude, longitude, livraison_forfait_base, livraison_km_inclus, livraison_prix_km_supp")
      .eq("id", artisan_id).maybeSingle();
    if (errA) throw errA;
    if (!artisan) return json({ error: "Boutique introuvable." }, 404);

    // Prix effectif = prix catalogue, remise en cours appliquée — figé ici, jamais recalculé
    // plus tard (même si l'artisan change son prix ou sa remise avant le paiement).
    const lignesAEnregistrer: Array<{ catalogue_id: string; nom_article: string; prix_unitaire: number; quantite: number }> = articles.map((a: any) => {
      const quantite = quantitesDemandees.get(a.id)!;
      const prixEffectif = a.promo_pct ? Math.round(a.prix * (1 - a.promo_pct / 100) * 100) / 100 : a.prix;
      return { catalogue_id: a.id, nom_article: a.nom, prix_unitaire: prixEffectif, quantite };
    });
    const montantProduits = Math.round(lignesAEnregistrer.reduce((s: number, l) => s + l.prix_unitaire * l.quantite, 0) * 100) / 100;

    // Frais de livraison : calculés sur la vraie distance par la route, uniquement si l'artisan
    // a réglé un tarif. Sans coordonnées côté artisan ou tarif non réglé : jamais de frais (0€),
    // c'est un manque de configuration de son côté, pas une raison de bloquer le client. En
    // revanche, une adresse de livraison qui ne se géocode pas est bloquante : impossible de
    // livrer un endroit qu'on ne sait pas localiser.
    let fraisLivraison = 0;
    if (mode === "livraison" && artisan.latitude != null && artisan.longitude != null && artisan.livraison_forfait_base != null) {
      const pointClient = await geocoderAdresse(adresse_livraison, code_postal_livraison, commune_livraison);
      if (!pointClient) {
        return json({ error: "Nous n'avons pas pu localiser cette adresse. Merci de vérifier qu'elle est correcte." }, 422);
      }
      const distance = await distanceTrajetKm(artisan.latitude, artisan.longitude, pointClient.lat, pointClient.lon);
      if (distance == null) {
        return json({ error: "Impossible de calculer les frais de livraison pour cette adresse pour le moment. Réessayez dans un instant." }, 422);
      }
      fraisLivraison = calculerFraisLivraison(
        Number(artisan.livraison_forfait_base) || 0,
        Number(artisan.livraison_km_inclus) || 0,
        Number(artisan.livraison_prix_km_supp) || 0,
        distance,
      );
    }

    const montantTotal = Math.round((montantProduits + fraisLivraison) * 100) / 100;
    const nbArticlesDistincts = lignesAEnregistrer.length;
    const resumeNom = nbArticlesDistincts === 1
      ? lignesAEnregistrer[0].nom_article
      : lignesAEnregistrer[0].nom_article + " + " + (nbArticlesDistincts - 1) + " autre" + (nbArticlesDistincts > 2 ? "s" : "");

    const { data: commande, error: errIns } = await sb.from("commandes_catalogue").insert({
      artisan_id,
      catalogue_id: null, // commande multi-articles : le détail vit dans commandes_catalogue_lignes
      nom_article: resumeNom,
      quantite: lignesAEnregistrer.reduce((s: number, l) => s + l.quantite, 0),
      montant_total: montantTotal,
      frais_livraison: fraisLivraison > 0 ? fraisLivraison : null,
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

    const { error: errLignes } = await sb.from("commandes_catalogue_lignes").insert(
      lignesAEnregistrer.map((l) => ({ commande_id: commande.id, catalogue_id: l.catalogue_id, nom_article: l.nom_article, prix_unitaire: l.prix_unitaire, quantite: l.quantite })),
    );
    if (errLignes) throw errLignes;

    if (artisan.email) {
      const detailLignes = lignesAEnregistrer.map((l) => `<li>${l.quantite} × ${l.nom_article} — ${(l.prix_unitaire * l.quantite).toFixed(2)} €</li>`).join("");
      const html = `<div style="font-family:sans-serif;max-width:480px;">
        <h2 style="color:#B5502F;">Nouvelle commande — ${montantTotal.toFixed(2)} €</h2>
        <p><strong>${client_nom}</strong> (${client_telephone}) commande :</p>
        <ul>${detailLignes}</ul>
        <p>Mode : ${mode === "livraison" ? "🚚 Livraison — " + adresse_livraison + (fraisLivraison > 0 ? ` (frais de livraison : ${fraisLivraison.toFixed(2)} €)` : "") : "🏠 Retrait sur place"}</p>
        ${date_souhaitee ? `<p>Date souhaitée : ${date_souhaitee}</p>` : ""}
        ${notes ? `<p>Précisions : ${notes}</p>` : ""}
        <p style="margin-top:20px;"><a href="https://caralink.app/mpa/" style="color:#B5502F;font-weight:700;">Voir dans MPA Artisans →</a></p>
      </div>`;
      await envoyerEmail(artisan.email, `Nouvelle commande : ${resumeNom}`, html);
    }

    return json({ ok: true, commande_id: commande.id, montant_total: montantTotal, frais_livraison: fraisLivraison });

  } catch (e) {
    console.error("[soumettre-commande-panier]", e);
    return json({ error: (e as Error).message }, 500);
  }
});
