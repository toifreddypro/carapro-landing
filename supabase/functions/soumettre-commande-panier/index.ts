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

const FENETRE_LIVRAISON_FLEXIBLE_JOURS = 7;

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

// Distance par la route. Trois niveaux, pour qu'une commande ne soit JAMAIS bloquée par une panne d'un service externe :
//  1. IGN (Géoplateforme) ; 2. OSRM public ; 3. à défaut, distance à vol d'oiseau × 1,4 (la route est toujours plus longue que la ligne droite,
//  surtout en Guadeloupe). Le niveau utilisé est écrit dans les journaux Supabase pour qu'on voie si IGN répond pour la Guadeloupe.
function distanceVolOiseauKm(latA: number, lonA: number, latB: number, lonB: number): number {
  const rad = (d: number) => d * Math.PI / 180;
  const dLat = rad(latB - latA), dLon = rad(lonB - lonA);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(latA)) * Math.cos(rad(latB)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}
async function distanceTrajetKm(latA: number, lonA: number, latB: number, lonB: number): Promise<number | null> {
  try {
    const url = `https://data.geopf.fr/navigation/itineraire?resource=bdtopo-osrm&profile=car&optimization=fastest&getSteps=false&geometryFormat=polyline&distanceUnit=meter&timeUnit=second&start=${lonA},${latA}&end=${lonB},${latB}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const data = await res.json().catch(() => null);
    if (res.ok && data?.distance != null) return data.distance / 1000;
    console.error("[soumettre-commande-panier] IGN sans distance — statut", res.status, JSON.stringify(data)?.slice(0, 300));
  } catch (e) { console.error("[soumettre-commande-panier] IGN en échec :", e); }
  try {
    const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${lonA},${latA};${lonB},${latB}?overview=false`, { signal: AbortSignal.timeout(8000) });
    const data = await res.json().catch(() => null);
    const m = data?.routes?.[0]?.distance;
    if (res.ok && m != null) { console.warn("[soumettre-commande-panier] Distance obtenue par OSRM (IGN indisponible)."); return m / 1000; }
    console.error("[soumettre-commande-panier] OSRM sans distance — statut", res.status);
  } catch (e) { console.error("[soumettre-commande-panier] OSRM en échec :", e); }
  const estimee = Math.round(distanceVolOiseauKm(latA, lonA, latB, lonB) * 1.4 * 10) / 10;
  console.warn("[soumettre-commande-panier] Distance estimée à vol d'oiseau × 1,4 :", estimee, "km");
  return estimee;
}

function calculerFraisLivraison(base: number, kmInclus: number, prixKm: number, distanceKm: number): number {
  if (distanceKm <= kmInclus) return base;
  return Math.round((base + (distanceKm - kmInclus) * prixKm) * 100) / 100;
}

// Un code promo n'est valable que si l'artisan est Pro, qu'il a un code ET un pourcentage (1 à 50), et que la date de fin n'est pas passée (jour de Guadeloupe).
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
    if (!body) return json({ error: "Requête invalide." }, 400);
    // Aperçu des frais de livraison (le client n'a pas fini de remplir le formulaire) : aucune commande créée, aucun email envoyé.
    const apercu = body.apercu === true;
    // L'email est obligatoire : la confirmation de commande et le reçu y sont envoyés.
    if (!apercu && (typeof body.client_email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.client_email.trim()) || body.client_email.length > 200)) {
      return json({ error: "Votre email est obligatoire pour recevoir la confirmation de votre commande." }, 400);
    }

    const { artisan_id, lignes, client_nom, client_telephone, client_email, mode, adresse_livraison, code_postal_livraison, commune_livraison, date_souhaitee, livraison_flexible, notes, code_promo: codeSaisi } = body;

    if (!artisan_id) return json({ error: "Boutique manquante." }, 400);
    if (!Array.isArray(lignes) || !lignes.length) return json({ error: "Le panier est vide." }, 400);
    if (!apercu && !client_nom?.trim()) return json({ error: "Votre nom est obligatoire." }, 400);
    if (!apercu && !client_telephone?.trim()) return json({ error: "Votre téléphone est obligatoire." }, 400);
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
    if (apercu) {
      const ip = (req.headers.get("x-forwarded-for") || "inconnue").split(",")[0].trim();
      try {
        const { data: ok } = await sb.rpc("limiter_appel", { p_cle: `apercu-livraison:${artisan_id}:${ip}`, p_max: 30, p_fenetre_s: 600 });
        if (ok === false) return json({ error: "Trop de demandes. Réessayez dans quelques minutes." }, 429);
      } catch (e) { console.error("[limiter_appel]", e); }
    }

    // Les articles doivent tous appartenir à CET artisan — jamais mélanger le panier de plusieurs boutiques.
    const { data: articles, error: errArt } = await sb.from("artisans_catalogue")
      .select("id, nom, prix, promo_pct, artisan_id, quantite_stock, en_vente").in("id", idsArticles).eq("artisan_id", artisan_id);
    if (errArt) throw errArt;
    // Un produit hors vente (« Mon stock », en_vente = false) est traité comme inexistant : jamais commandable (comme dans soumettre-commande).
    if (!articles || articles.length !== idsArticles.length || (articles as any[]).some((a) => a.en_vente === false)) {
      return json({ error: "Un ou plusieurs articles de votre panier n'existent plus. Actualisez la page." }, 404);
    }

    const { data: artisan, error: errA } = await sb.from("artisans")
      .select("nom_entreprise, email, plan, code_promo, code_promo_pct, code_promo_fin, latitude, longitude, livraison_forfait_base, livraison_km_inclus, livraison_prix_km_supp, stripe_connect_statut, boutique_en_pause")
      .eq("id", artisan_id).maybeSingle();
    if (errA) throw errA;
    if (!artisan) return json({ error: "Boutique introuvable." }, 404);
    // Règle du 06/10 : une boutique n'accepte de commande que si les paiements en ligne de l'artisan sont ACTIFS (sinon la vente en ligne
    // ne servirait à rien). Contrôle fait AVANT tout le reste : ni stock touché, ni email « vente manquée », ni commande créée.
    if (artisan.stripe_connect_statut !== "actif") return json({ error: "Cette boutique n'accepte pas encore les commandes en ligne." }, 409);
    // Boutique mise en pause par l'artisan : aucune nouvelle commande, même si le client avait gardé la page ouverte.
    if (artisan.boutique_en_pause === true) return json({ error: "Cette boutique est momentanément fermée. Revenez plus tard." }, 409);

    // Ménage (règle du 07/10) : une commande jamais payée au bout de 24 h est annulée. Elle n'a jamais été visible de l'artisan ni
    // compté sur son stock ; on s'en occupe ici, à chaque nouvelle commande de cette boutique, sans tâche planifiée. Si le ménage
    // échoue, ce n'est pas grave : la commande en cours n'est pas concernée.
    const { error: errMenage } = await sb.from("commandes_catalogue").update({ statut: "annulee" })
      .eq("artisan_id", artisan_id).eq("paiement_requis", true).eq("statut", "nouvelle")
      .is("paiement_traite_le", null).lt("created_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString());
    if (errMenage) console.warn("[soumettre-commande-panier] Ménage des commandes non payées échoué :", errMenage.message);

    // Stock insuffisant — refusé proprement, jamais une vente silencieuse de ce qu'il n'y a pas.
    // quantite_stock à null = illimité (ex : une formation), jamais vérifié. L'artisan ne voit
    // jamais cette tentative autrement (rien n'est créé) — c'est MPA-AI qui le prévient, pour
    // qu'une vente manquée par rupture de stock ne passe jamais inaperçue.
    for (const a of articles as any[]) {
      if (a.quantite_stock == null) continue;
      const demande = quantitesDemandees.get(a.id)!;
      if (a.quantite_stock < demande) {
        if (artisan.email && !apercu) {
          const html = `<div style="font-family:sans-serif;max-width:480px;">
            <h2 style="color:#B5502F;">✨ MPA AI — une vente vient d'échouer, faute de stock</h2>
            <p><strong>${escHtml(client_nom)}</strong> a tenté de commander <strong>${demande} × ${escHtml(a.nom)}</strong>, mais il n'en restait que <strong>${a.quantite_stock}</strong>.</p>
            <p>La commande n'a pas été enregistrée — le client a vu un message clair, mais rien n'apparaît dans vos commandes.</p>
            <p style="margin-top:16px;">Pensez à réapprovisionner ce produit dans <strong>Mon stock → Mes produits</strong> si vous le pouvez.</p>
            <p style="margin-top:20px;"><a href="https://caralink.app/mpa/" style="color:#B5502F;font-weight:700;">Voir dans MPA Artisans →</a></p>
          </div>`;
          await envoyerEmail(artisan.email, `✨ MPA AI — vente manquée : "${a.nom}" en rupture`, html);
        }
        return json({ error: `Stock insuffisant pour "${a.nom}" — il n'en reste que ${a.quantite_stock}.` }, 422);
      }
    }

    // Prix effectif = prix catalogue, remise en cours appliquée — figé ici, jamais recalculé
    // plus tard (même si l'artisan change son prix ou sa remise avant le paiement).
    // Code promo (offre Pro) : saisi par le client, vérifié ICI (le navigateur n'a pas le dernier mot). Il s'applique uniquement aux produits
    // qui n'ont pas déjà une remise : jamais de cumul. Un code erroné ou expiré est refusé clairement, jamais ignoré en silence.
    let pctCode = 0;
    let codeApplique: string | null = null;
    const saisi = typeof codeSaisi === "string" ? codeSaisi.trim() : "";
    if (saisi) {
      if (!codePromoValide(artisan, (artisan as any).plan) || String((artisan as any).code_promo).trim().toLowerCase() !== saisi.toLowerCase()) {
        return json({ error: "Ce code promo n'est pas valide ou a expiré." }, 422);
      }
      if (!(articles as any[]).some((a) => !a.promo_pct)) {
        return json({ error: "Ce code ne s'applique pas aux produits déjà en remise de votre panier." }, 422);
      }
      pctCode = Number((artisan as any).code_promo_pct);
      codeApplique = String((artisan as any).code_promo).trim();
    }
    const lignesAEnregistrer: Array<{ catalogue_id: string; nom_article: string; prix_unitaire: number; quantite: number }> = articles.map((a: any) => {
      const quantite = quantitesDemandees.get(a.id)!;
      const prixEffectif = a.promo_pct
        ? Math.round(a.prix * (1 - a.promo_pct / 100) * 100) / 100
        : (pctCode ? Math.round(a.prix * (1 - pctCode / 100) * 100) / 100 : a.prix);
      return { catalogue_id: a.id, nom_article: a.nom, prix_unitaire: prixEffectif, quantite };
    });
    const montantProduits = Math.round(lignesAEnregistrer.reduce((s: number, l) => s + l.prix_unitaire * l.quantite, 0) * 100) / 100;

    // Frais de livraison : calculés sur la vraie distance par la route, uniquement si l'artisan
    // a réglé un tarif. Sans coordonnées côté artisan ou tarif non réglé : jamais de frais (0€),
    // c'est un manque de configuration de son côté, pas une raison de bloquer le client. En
    // revanche, une adresse de livraison qui ne se géocode pas est bloquante : impossible de
    // livrer un endroit qu'on ne sait pas localiser.
    let fraisLivraison = 0;
    let distanceKmCalculee: number | null = null;
    if (mode === "livraison" && artisan.latitude != null && artisan.longitude != null && artisan.livraison_forfait_base != null) {
      const pointClient = await geocoderAdresse(adresse_livraison, code_postal_livraison, commune_livraison);
      if (!pointClient) {
        return json({ error: "Nous n'avons pas pu localiser cette adresse. Merci de vérifier qu'elle est correcte." }, 422);
      }
      const distance = await distanceTrajetKm(artisan.latitude, artisan.longitude, pointClient.lat, pointClient.lon);
      if (distance == null) {
        return json({ error: "Impossible de calculer les frais de livraison pour cette adresse pour le moment. Réessayez dans un instant." }, 422);
      }
      distanceKmCalculee = distance;
      fraisLivraison = calculerFraisLivraison(
        Number(artisan.livraison_forfait_base) || 0,
        Number(artisan.livraison_km_inclus) || 0,
        Number(artisan.livraison_prix_km_supp) || 0,
        distance,
      );
    }

    const montantTotal = Math.round((montantProduits + fraisLivraison) * 100) / 100;
    if (apercu) {
      return json({ ok: true, apercu: true, montant_produits: montantProduits, frais_livraison: fraisLivraison, distance_km: distanceKmCalculee != null ? Math.round(distanceKmCalculee * 10) / 10 : null, montant_total: montantTotal });
    }
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
      livraison_flexible: mode === "livraison" ? !!livraison_flexible : false,
      livraison_fenetre_jours: (mode === "livraison" && livraison_flexible) ? FENETRE_LIVRAISON_FLEXIBLE_JOURS : null,
      notes: notes?.trim() || null,
      code_promo: codeApplique, code_promo_pct: codeApplique ? pctCode : null,
      paiement_requis: true, // le client DOIT payer en ligne : la commande n'existe pour l'artisan qu'une fois payée (voir stripe-webhook-artisans)
    }).select().single();
    if (errIns) throw errIns;

    const { error: errLignes } = await sb.from("commandes_catalogue_lignes").insert(
      lignesAEnregistrer.map((l) => ({ commande_id: commande.id, catalogue_id: l.catalogue_id, nom_article: l.nom_article, prix_unitaire: l.prix_unitaire, quantite: l.quantite })),
    );
    if (errLignes) throw errLignes;

    // Décrémente le stock de chaque article suivi (quantite_stock non nul). Le filtre
    // gte() est un filet de sécurité contre une vente concurrente improbable entre la
    // vérification plus haut et cet instant — si jamais ça arrivait, la mise à jour
    // n'a simplement aucun effet plutôt que de passer en négatif.
    // Le stock n'est PAS retiré ici et l'artisan n'est PAS prévenu : tant que le client n'a pas payé, la commande n'existe pas pour lui.
    // Au paiement réussi, stripe-webhook-artisans retire le stock (remboursement automatique s'il n'y en a plus) et envoie l'email.
    return json({ ok: true, commande_id: commande.id, montant_produits: montantProduits, montant_total: montantTotal, frais_livraison: fraisLivraison });

  } catch (e) {
    console.error("[soumettre-commande-panier]", e);
    return json({ error: "Une erreur est survenue. Réessayez dans un instant." }, 500); // le détail reste dans les journaux, jamais chez le visiteur
  }
});
