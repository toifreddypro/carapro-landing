// ═══════════════════════════════════════════════════════════
// CaraLink Artisans — Edge Function : demander-paiement-prestation
// Propriété : TOI Freddy
//
// « Demander un paiement » : après la visite (ou la prestation), l'artisan saisit à la main le montant de son devis / de sa facture
// pour une intervention ; le client reçoit un email avec un lien de paiement sécurisé (carte, sur le compte Stripe de l'artisan).
// L'artisan peut aussi copier le lien et l'envoyer lui-même (SMS, WhatsApp).
//
// POST { intervention_id, montant, description?, client_email?, geste_type?, geste_valeur?, geste_motif? }   — artisan connecté
//   geste_type 'pct' | 'eur' : geste commercial pour CE client (gratuit, toutes offres). Il REMPLACE les remises automatiques
//   (code promo, client fidèle) : c'est l'artisan qui décide. Le client le voit détaillé sur sa page de paiement et dans son email.
//   → { ok, lien, email_envoye, deja_paye_en_ligne }
//
// Sécurité :
//  - l'artisan n'agit que sur SES interventions ; paiements Stripe actifs obligatoires ;
//  - le montant est contrôlé (de 0,50 € à 10 000 €) ; la description est limitée et échappée dans l'email ;
//  - une demande de paiement encore en attente pour la même intervention est annulée avant d'en créer une nouvelle (jamais deux liens vivants) ;
//  - l'adresse email du client est contrôlée ; le lien expire au bout de 14 jours (voir maintenance-reservations) ;
//  - relance_auto (Pro) : le client est relancé automatiquement à J+3 et J+10 s'il n'a pas payé (voir relancer-paiement).
// ═══════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const PAGE_PAIEMENT = "https://caralink.app/artisans/payer-prestation.html";
const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REGEX_EMAIL = /^[^\s@<>"'()\[\]\\,;:]+@[^\s@<>"'()\[\]\\,;:]+\.[^\s@<>"'()\[\]\\,;:]+$/;
const MONTANT_MIN = 0.5, MONTANT_MAX = 10000;
const MSG_ERREUR_GENERIQUE = "Une erreur est survenue. Réessayez dans un instant.";

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
function escHtml(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (m) => (({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }) as Record<string, string>)[m]);
}
const euros = (n: number) => n.toFixed(2).replace(".", ",") + " €";

async function envoyerEmail(to: string, subject: string, html: string): Promise<boolean> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "CaraLink Artisans <notifications@learnlogicstudio.com>", to: [to], subject, html }),
    });
    if (!res.ok) console.error("[demander-paiement-prestation] Échec envoi Resend :", await res.text());
    return res.ok;
  } catch (e) { console.error("[demander-paiement-prestation] Erreur envoi email :", e); return false; }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Non authentifié." }, 401);
    const sbCaller = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await sbCaller.auth.getUser();
    if (!user) return json({ error: "Session invalide." }, 401);

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Requête invalide." }, 400);
    const { intervention_id } = body;
    if (typeof intervention_id !== "string" || !REGEX_UUID.test(intervention_id)) return json({ error: "Intervention invalide." }, 400);
    const montant = Math.round(Number(body.montant) * 100) / 100;
    if (!Number.isFinite(montant) || montant < MONTANT_MIN || montant > MONTANT_MAX) return json({ error: `Le montant doit être compris entre ${euros(MONTANT_MIN)} et ${euros(MONTANT_MAX)}.` }, 400);
    // Geste commercial (facultatif) : calculé ICI, jamais pris tel quel d'un total envoyé par la page.
    let geste = 0, gestePct: number | null = null;
    const gesteMotif = typeof body.geste_motif === "string" ? body.geste_motif.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, 120) : "";
    if (body.geste_type !== undefined && body.geste_type !== null && body.geste_type !== "") {
      const v = Number(body.geste_valeur);
      if (body.geste_type === "pct") {
        if (!Number.isFinite(v) || v <= 0 || v > 90) return json({ error: "Le geste commercial en pourcentage doit être compris entre 1 % et 90 %." }, 400);
        gestePct = Math.round(v * 100) / 100; geste = Math.round(montant * gestePct) / 100;
      } else if (body.geste_type === "eur") {
        if (!Number.isFinite(v) || v <= 0) return json({ error: "Indiquez un geste commercial supérieur à 0 €." }, 400);
        geste = Math.round(v * 100) / 100;
      } else return json({ error: "Type de geste commercial invalide." }, 400);
      geste = Math.round(geste * 100) / 100;
      if (montant - geste < MONTANT_MIN) return json({ error: `Avec ce geste commercial, le client paierait moins de ${euros(MONTANT_MIN)} : réduisez-le.` }, 400);
    }
    const montantNet = Math.round((montant - geste) * 100) / 100;
    const description = typeof body.description === "string" ? body.description.trim().slice(0, 300) : "";
    const emailSaisi = typeof body.client_email === "string" ? body.client_email.trim() : "";
    if (emailSaisi && (emailSaisi.length > 200 || !REGEX_EMAIL.test(emailSaisi))) return json({ error: "Adresse email invalide." }, 400);

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    // Audit 01/11 : chaque demande envoie un email (texte libre de l'artisan) à une adresse qu'il peut choisir. Plafonds par artisan et par rendez-vous.
    for (const [cle, max, fenetre] of [[`demander-paiement:artisan:${user.id}`, 30, 3600], [`demander-paiement:artisan-jour:${user.id}`, 100, 86400], [`demander-paiement:rdv:${intervention_id}`, 5, 86400]] as [string, number, number][]) {
      try {
        const { data: ok } = await sb.rpc("limiter_appel", { p_cle: cle, p_max: max, p_fenetre_s: fenetre });
        if (ok === false) return json({ error: "Trop de demandes de paiement. Réessayez plus tard." }, 429);
      } catch (e) { console.error("[limiter_appel]", e); }
    }
    const { data: artisan } = await sb.from("artisans").select("id, nom_entreprise, stripe_connect_account_id, stripe_connect_statut, plan").eq("user_id", user.id).maybeSingle();
    if (!artisan) return json({ error: "Aucun profil artisan trouvé." }, 404);
    if (!artisan.stripe_connect_account_id || artisan.stripe_connect_statut !== "actif") {
      return json({ error: "Activez d'abord vos paiements en ligne (Stripe) pour pouvoir demander un paiement." }, 400);
    }

    const { data: inter, error: errI } = await sb.from("mpa_artisans_interventions")
      .select("id, statut, mpa_artisans_clients(nom, email, telephone)").eq("id", intervention_id).eq("artisan_id", artisan.id).maybeSingle();
    if (errI) throw errI;
    if (!inter) return json({ error: "Intervention introuvable." }, 404);
    if (inter.statut === "annulee") return json({ error: "Cette intervention est annulée." }, 409);
    const client = (inter as any).mpa_artisans_clients;
    const emailClient = emailSaisi || client?.email || "";

    // Un lien est déjà en attente et encore valable : on n'en crée pas un second (le client recevrait deux emails, et la limite de relances serait contournée).
    const { data: enAttente } = await sb.from("paiements_prestations").select("id, created_at")
      .eq("intervention_id", intervention_id).eq("type", "solde").eq("statut", "en_attente");
    if ((enAttente || []).some((x: any) => Date.now() - new Date(x.created_at).getTime() < 14 * 24 * 3600 * 1000)) {
      return json({ error: "paiement_deja_en_attente" }, 409);
    }

    // Jamais deux liens de paiement vivants pour la même intervention (ici : seulement des liens périmés).
    await sb.from("paiements_prestations").update({ statut: "annule", annule_par: "artisan", annule_le: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("intervention_id", intervention_id).eq("type", "solde").eq("statut", "en_attente");

    const { data: dejaPayes } = await sb.from("paiements_prestations").select("montant, montant_rembourse")
      .eq("intervention_id", intervention_id).in("statut", ["paye", "partiellement_rembourse"]);
    const dejaPayeEnLigne = (dejaPayes || []).reduce((s: number, x: any) => s + Number(x.montant) - Number(x.montant_rembourse || 0), 0);

    const { data: pai, error: errP } = await sb.from("paiements_prestations").insert({
      artisan_id: artisan.id, type: "solde", intervention_id,
      client_nom: client?.nom || null, client_email: emailClient || null, client_telephone: client?.telephone || null,
      description: description || null, montant: montantNet, statut: "en_attente",
      // Geste commercial : le prix d'origine est gardé (« montant_brut »), le client règle « montant ».
      ...(geste > 0 ? { montant_brut: montant, remise_montant: geste, remise_origine: "geste", remise_motif: gesteMotif || null } : {}),
      // Relances automatiques (offre Pro) : cochées par défaut, jamais pour une autre offre (et refusées aussi côté serveur).
      relance_auto: body.relance_auto !== false && (artisan.plan === "pro" || artisan.plan === "pro_offert") && !!emailClient,
    }).select("token").single();
    if (errP) throw errP;
    const lien = `${PAGE_PAIEMENT}?token=${pai.token}`;

    let emailEnvoye = false;
    if (emailClient) {
      emailEnvoye = await envoyerEmail(emailClient, `Paiement demandé par ${String(artisan.nom_entreprise || "votre artisan").replace(/[\u0000-\u001f\u007f]+/g, " ").slice(0, 80)} — ${euros(montantNet)}`,
        `<div style="font-family:sans-serif;max-width:480px;">
          <h2 style="color:#B5502F;">💶 Paiement demandé</h2>
          <p>Bonjour ${escHtml(client?.nom || "")}, <strong>${escHtml(artisan.nom_entreprise)}</strong> vous demande de régler <strong>${escHtml(euros(montantNet))}</strong>${description ? ` pour : ${escHtml(description)}` : ""}.</p>
          ${geste > 0 ? `<p style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px 14px;font-size:13.5px;color:#166534;">🤝 <strong>Geste commercial de ${escHtml(artisan.nom_entreprise)}</strong> : ${escHtml(euros(geste))} de remise${gestePct ? ` (${escHtml(String(gestePct).replace(".", ","))} %)` : ""} sur ${escHtml(euros(montant))}.${gesteMotif ? ` ${escHtml(gesteMotif)}` : ""}</p>` : ""}
          ${dejaPayeEnLigne > 0 ? `<p style="font-size:12.5px;color:#475569;">Vous avez déjà réglé ${escHtml(euros(dejaPayeEnLigne))} en ligne (frais de réservation / de déplacement) : l'artisan en tient compte dans le montant demandé.</p>` : ""}
          <p style="text-align:center;margin:22px 0;"><a href="${escHtml(lien)}" style="display:inline-block;background:#B5502F;color:#ffffff;padding:13px 26px;border-radius:8px;text-decoration:none;font-weight:700;">Payer en ligne</a></p>
          <p style="font-size:12px;color:#6b7c96;">Paiement sécurisé par carte (Stripe). Le lien est valable 14 jours.</p>
        </div>`);
    }
    return json({ ok: true, lien, email_envoye: emailEnvoye, sans_email: !emailClient, deja_paye_en_ligne: dejaPayeEnLigne, montant_net: montantNet, geste });
  } catch (e) {
    console.error("[demander-paiement-prestation]", e);
    return json({ error: MSG_ERREUR_GENERIQUE }, 500);
  }
});
