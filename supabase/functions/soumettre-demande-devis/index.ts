// ═══════════════════════════════════════════════════════════
// CaraPro — Edge Function : soumettre-demande-devis
// Propriété : TOI Freddy
// Crée une demande de devis, ouverte aux artisans du secteur/commune
// concernés — zéro friction client (nom + téléphone seulement, comme
// CaraLink). Si lancée depuis la fiche d'un artisan précis, une
// réponse "pré-remplie" est aussi créée pour lui, pour qu'il la voie
// immédiatement dans son espace MPA Artisans (onglet "Demandes").
//
// Envoie aussi un email de notification (Resend) : à l'artisan visé
// si la demande est privée, ou à tous les artisans du secteur si elle
// est ouverte. Un échec d'envoi d'email ne fait jamais échouer la
// demande elle-même — l'email est un bonus, pas une dépendance dure.
//
// POST { client_nom, client_telephone, secteur, description_besoin,
//        commune, artisan_id? }
// ═══════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function envoyerEmail(to: string, subject: string, html: string) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) { console.warn("[soumettre-demande-devis] RESEND_API_KEY absente — email non envoyé."); return; }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "CaraLink Artisans <notifications@learnlogicstudio.com>",
        to: [to],
        subject,
        html,
      }),
    });
    if (!res.ok) console.error("[soumettre-demande-devis] Échec envoi Resend :", await res.text());
  } catch (e) {
    console.error("[soumettre-demande-devis] Erreur envoi email :", e);
  }
}

const LABELS_TYPE_INTERVENTION: Record<string, string> = {
  urgence: "🔥 Urgent",
  installation: "📅 Rendez-vous classique",
  devis: "💬 Devis / Renseignement",
  entretien: "🔁 Suivi / Habitué·e",
};
function badgeTypeIntervention(type: string | null | undefined): string {
  if (!type || !LABELS_TYPE_INTERVENTION[type]) return "";
  return `<p style="display:inline-block;background:#eef2ff;color:#4338ca;padding:4px 10px;border-radius:20px;font-weight:700;font-size:13px;">${LABELS_TYPE_INTERVENTION[type]}</p>`;
}

function emailHtmlDemande(clientNom: string, clientTel: string, clientEmail: string | null, contactPrefere: string, commune: string, description: string, secteur: string, nbPhotos: number, typeIntervention: string | null): string {
  const contactHtml = contactPrefere === "email"
    ? `<p>📧 Préfère être recontacté(e) par email : <a href="mailto:${clientEmail}">${clientEmail}</a></p>`
    : `<p>📞 Préfère être recontacté(e) par téléphone : <a href="tel:${clientTel}">${clientTel}</a></p>`;
  const photosHtml = nbPhotos > 0
    ? `<p>📷 ${nbPhotos} photo${nbPhotos > 1 ? "s" : ""} jointe${nbPhotos > 1 ? "s" : ""} — à consulter dans votre espace MPA Artisans.</p>`
    : "";
  return `
    <div style="font-family:sans-serif;max-width:480px;">
      <h2 style="color:#B5502F;">📢 Nouvelle demande de devis</h2>
      ${badgeTypeIntervention(typeIntervention)}
      <p><strong>${clientNom}</strong> (${commune}) recherche un artisan en <strong>${secteur}</strong>.</p>
      <p style="background:#f7f9fc;padding:12px 16px;border-radius:8px;">${description}</p>
      ${contactHtml}
      ${photosHtml}
      <p style="font-size:12px;color:#6b7c96;margin-top:20px;">Répondez directement depuis votre espace MPA Artisans, onglet « Demandes ».</p>
    </div>
  `;
}

async function geocoderAdresse(adresse: string, cp: string | null, commune: string) {
  const q = [adresse, cp, commune].filter(Boolean).join(", ");
  if (!q) return null;
  try {
    const res = await fetch("https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" + encodeURIComponent(q), {
      headers: { "User-Agent": "CaraLinkArtisans/1.0" },
    });
    const data = await res.json();
    if (data && data[0]) return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
  } catch (e) { console.warn("[soumettre-demande-devis] Géocodage échoué :", e); }
  return null;
}

function emailHtmlCreneau(clientNom: string, clientTel: string, clientEmail: string | null, contactPrefere: string, commune: string, adresse: string, description: string, dateAff: string, heureDebut: string, heureFin: string, nbPhotos: number, token: string, horsHoraires: boolean, typeIntervention: string | null): string {
  const base = Deno.env.get("SUPABASE_URL") ?? "";
  const lienConfirmer = `${base}/functions/v1/repondre-devis?token=${token}&action=confirmer`;
  const lienRefuser = `${base}/functions/v1/repondre-devis?token=${token}&action=refuser`;
  const contactHtml = contactPrefere === "email"
    ? `📧 <a href="mailto:${clientEmail}">${clientEmail}</a>`
    : `📞 <a href="tel:${clientTel}">${clientTel}</a>`;
  const photosHtml = nbPhotos > 0 ? `<p>📷 ${nbPhotos} photo${nbPhotos > 1 ? "s" : ""} jointe${nbPhotos > 1 ? "s" : ""} — à consulter dans votre espace MPA Artisans.</p>` : "";
  const alerteHorsHoraires = horsHoraires
    ? `<p style="background:#fff7ed;border:1px solid #fdba74;color:#9a3412;padding:10px 14px;border-radius:8px;font-weight:700;">⚠️ Demande hors de vos horaires habituels — vérifiez que ça vous convient avant de confirmer.</p>`
    : "";
  return `
    <div style="font-family:sans-serif;max-width:480px;">
      <h2 style="color:#B5502F;">📅 Proposition de créneau</h2>
      ${alerteHorsHoraires}
      ${badgeTypeIntervention(typeIntervention)}
      <p><strong>${clientNom}</strong> (${commune}) souhaite une intervention le <strong>${dateAff} entre ${heureDebut} et ${heureFin}</strong>, à cette adresse : ${adresse}.</p>
      <p style="background:#f7f9fc;padding:12px 16px;border-radius:8px;">${description}</p>
      <p>Contact : ${contactHtml}</p>
      ${photosHtml}
      <div style="margin:24px 0;">
        <a href="${lienConfirmer}" style="display:inline-block;padding:12px 22px;border-radius:8px;background:#16a34a;color:#fff;font-weight:700;text-decoration:none;margin-right:10px;">✅ Confirmer ce créneau</a>
        <a href="${lienRefuser}" style="display:inline-block;padding:12px 22px;border-radius:8px;background:#f1f5f9;color:#475569;font-weight:700;text-decoration:none;">❌ Refuser</a>
      </div>
      <p style="font-size:12px;color:#6b7c96;">En confirmant, ce rendez-vous sera automatiquement ajouté à votre planning MPA Artisans, sans avoir à vous connecter.</p>
    </div>
  `;
}

const BUCKET_PHOTOS = "devis-photos";

// Décode et téléverse jusqu'à 4 photos (data URLs base64) envoyées par le client, retourne leurs URLs publiques.
// Jamais bloquant : une photo qui échoue est simplement ignorée, la demande reste valide sans elle.
async function uploaderPhotos(sb: any, demandeId: string, photosBase64: unknown): Promise<string[]> {
  if (!Array.isArray(photosBase64)) return [];
  const urls: string[] = [];
  for (let i = 0; i < Math.min(photosBase64.length, 4); i++) {
    try {
      const dataUrl = photosBase64[i];
      if (typeof dataUrl !== "string") continue;
      const match = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
      if (!match) continue;
      const mime = match[1];
      const bytes = Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0));
      if (bytes.length > 3 * 1024 * 1024) continue; // garde-fou : 3 Mo max par photo après compression
      const ext = mime.split("/")[1] || "jpg";
      const path = `${demandeId}/${i}.${ext}`;
      const { error } = await sb.storage.from(BUCKET_PHOTOS).upload(path, bytes, { contentType: mime, upsert: true });
      if (error) { console.error("[soumettre-demande-devis] upload photo échoué:", error); continue; }
      const { data: pub } = sb.storage.from(BUCKET_PHOTOS).getPublicUrl(path);
      if (pub?.publicUrl) urls.push(pub.publicUrl);
    } catch (e) {
      console.error("[soumettre-demande-devis] erreur traitement photo:", e);
    }
  }
  return urls;
}

// Distance à vol d'oiseau (km) — suffisant pour filtrer des notifications par rayon,
// pas besoin d'un vrai calcul de trajet ici (contrairement au Smart Dispatch).
function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function emailHtmlDemandeOuverte(commune: string, description: string, secteur: string, nbPhotos: number, typeIntervention: string | null): string {
  const photosHtml = nbPhotos > 0 ? `<p>📷 ${nbPhotos} photo${nbPhotos > 1 ? "s" : ""} jointe${nbPhotos > 1 ? "s" : ""} — à consulter dans votre espace MPA Artisans.</p>` : "";
  return `
    <div style="font-family:sans-serif;max-width:480px;">
      <h2 style="color:#B5502F;">📢 Un client vous cherche</h2>
      ${badgeTypeIntervention(typeIntervention)}
      <p>Un client recherche un professionnel en <strong>${secteur}</strong>, disponible rapidement, à <strong>${commune}</strong>.</p>
      <p style="background:#f7f9fc;padding:12px 16px;border-radius:8px;">${description}</p>
      ${photosHtml}
      <p style="font-size:13px;">Soyez le premier à lui proposer un créneau — ses coordonnées apparaissent dès que vous prenez la demande en charge, depuis votre espace MPA Artisans, onglet « Demandes ».</p>
    </div>
  `;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);

  const sb = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  try {
    const body = await req.json().catch(() => null);
    if (!body) return json({ error: "Requête invalide." }, 400);

    const { client_nom, client_telephone, client_email, contact_prefere, secteur, description_besoin, commune, artisan_id, photos,
            date_intervention, heure_debut, heure_fin, adresse, code_postal, latitude, longitude, service_id, hors_horaires, type_intervention } = body;

    if (!client_nom || !client_telephone || !secteur || !description_besoin || !commune) {
      return json({ error: "Champs obligatoires manquants." }, 400);
    }
    if (!/^[0-9+\s.-]{8,20}$/.test(client_telephone)) {
      return json({ error: "Numéro de téléphone invalide." }, 400);
    }
    const contactChoisi = (contact_prefere === "email") ? "email" : "telephone";
    if (contactChoisi === "email" && (!client_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(client_email))) {
      return json({ error: "Adresse email invalide." }, 400);
    }

    const estUneProposionDeCreneau = !!(date_intervention && heure_debut && artisan_id);
    if (estUneProposionDeCreneau && !adresse) {
      return json({ error: "Adresse d'intervention manquante." }, 400);
    }

    // Coordonnées : reçues du client (vérification préalable), sinon géocodées ici
    // (cas de la demande sur-mesure, qui ne passe pas par la vérification de dispo)
    let lat = latitude ?? null;
    let lon = longitude ?? null;
    if (estUneProposionDeCreneau && (lat == null || lon == null)) {
      const pt = await geocoderAdresse(adresse, code_postal || null, commune);
      if (pt) { lat = pt.lat; lon = pt.lon; }
    }

    const token = estUneProposionDeCreneau ? crypto.randomUUID() : null;

    const { data: demande, error } = await sb.from("demandes_devis").insert({
      client_nom, client_telephone, client_email: client_email || null, contact_prefere: contactChoisi,
      secteur, description_besoin, commune, type_intervention: type_intervention || null,
      statut: estUneProposionDeCreneau ? "creneau_propose" : (artisan_id ? "directe" : "ouverte"),
      ...(estUneProposionDeCreneau ? {
        token, date_intervention, heure_debut, heure_fin: heure_fin || null,
        adresse, code_postal: code_postal || null, latitude: lat, longitude: lon,
        service_id: service_id || null, hors_horaires: !!hors_horaires,
      } : {}),
    }).select().single();
    if (error) throw error;

    if (artisan_id) {
      await sb.from("devis_reponses").insert({
        demande_id: demande.id,
        artisan_id,
        message: "",
        statut: "envoyee",
      });
    }

    // ── Photos jointes — jamais bloquant pour la demande elle-même ──
    let nbPhotos = 0;
    try {
      const urls = await uploaderPhotos(sb, demande.id, photos);
      if (urls.length) {
        await sb.from("demandes_devis").update({ photos: urls }).eq("id", demande.id);
        nbPhotos = urls.length;
      }
    } catch (photoErr) {
      console.error("[soumettre-demande-devis] Téléversement des photos échoué (demande créée quand même) :", photoErr);
    }

    // ── Notification email — jamais bloquante pour la demande elle-même ──
    try {
      if (estUneProposionDeCreneau) {
        const { data: artisan } = await sb.from("artisans").select("user_id").eq("id", artisan_id).maybeSingle();
        if (artisan?.user_id) {
          const { data: userData } = await sb.auth.admin.getUserById(artisan.user_id);
          if (userData?.user?.email) {
            const dateAff = new Date(date_intervention).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
            const emailHtml = emailHtmlCreneau(client_nom, client_telephone, client_email || null, contactChoisi, commune, adresse, description_besoin, dateAff, heure_debut, heure_fin || "?", nbPhotos, token as string, !!hors_horaires, type_intervention || null);
            await envoyerEmail(userData.user.email, `${hors_horaires ? "⚠️ Demande hors horaires — " : ""}Proposition de créneau — ${client_nom} le ${dateAff}`, emailHtml);
          }
        }
      } else {
        const emailHtml = emailHtmlDemande(client_nom, client_telephone, client_email || null, contactChoisi, commune, description_besoin, secteur, nbPhotos, type_intervention || null);
        if (artisan_id) {
          // Demande privée : uniquement l'artisan visé
          const { data: artisan } = await sb.from("artisans").select("user_id, nom_entreprise").eq("id", artisan_id).maybeSingle();
          if (artisan?.user_id) {
            const { data: userData } = await sb.auth.admin.getUserById(artisan.user_id);
            if (userData?.user?.email) {
              await envoyerEmail(userData.user.email, `Nouvelle demande de devis — ${client_nom}`, emailHtml);
            }
          }
        } else {
          // Demande ouverte : uniquement les artisans du secteur dont le rayon
          // d'intervention déclaré couvre la commune du client — jamais un envoi
          // en masse à tout le secteur, peu importe la distance réelle.
          const ptClient = await geocoderAdresse("", null, commune);
          const { data: artisans } = await sb.from("artisans")
            .select("user_id, latitude, longitude, rayon_intervention_km").eq("secteur", secteur);
          const emailOuverte = emailHtmlDemandeOuverte(commune, description_besoin, secteur, nbPhotos, type_intervention || null);
          for (const a of artisans ?? []) {
            if (!ptClient || a.latitude == null || a.longitude == null) continue; // impossible de vérifier la distance : on ne notifie pas par prudence
            const rayon = a.rayon_intervention_km || 15;
            if (distanceKm(ptClient.lat, ptClient.lon, a.latitude, a.longitude) > rayon) continue;
            const { data: userData } = await sb.auth.admin.getUserById(a.user_id);
            if (userData?.user?.email) {
              await envoyerEmail(userData.user.email, `Un client vous cherche à ${commune}`, emailOuverte);
            }
          }
        }
      }
    } catch (emailErr) {
      console.error("[soumettre-demande-devis] Notification email échouée (demande créée quand même) :", emailErr);
    }

    return json({ success: true, demande_id: demande.id });

  } catch (e) {
    console.error("[soumettre-demande-devis]", e);
    const msg = (e instanceof Error) ? e.message : (e && typeof e === "object" && "message" in e) ? String((e as any).message) : "Erreur serveur.";
    return json({ error: msg }, 500);
  }
});
