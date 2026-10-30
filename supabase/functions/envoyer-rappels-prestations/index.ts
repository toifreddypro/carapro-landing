// ═══════════════════════════════════════════════════════════
// CaraLink Artisans — Edge Function : envoyer-rappels-prestations
// Propriété : TOI Freddy
//
// À lancer une fois par jour (Supabase Cron, même mécanisme que
// prelever-commission-prestations : secret partagé en en-tête, ou
// session admin pour un déclenchement manuel).
//
// Pour chaque intervention "Planifiée" prévue demain, avec un client qui a
// une adresse email connue : un email de rappel via Resend. Jamais deux
// fois le même rappel (colonne rappel_envoye), jamais pour une intervention
// déjà Terminée/Payée/Annulée.
//
// Horaire choisi pour le déclenchement automatique : 14h UTC (10h du matin
// en Guadeloupe, UTC-4) — loin de tout passage de minuit des deux côtés,
// pour que "demain" ne se calcule jamais de travers (voir le piège connu
// de fuseau horaire noté dans le projet).
//
// Sécurité :
//  - tout ce qui entre dans l'email (nom du client, de l'entreprise, du service, téléphone) est échappé : sans ça,
//    un artisan pouvait y glisser un faux lien, envoyé depuis ton adresse à n'importe quelle adresse de client ;
//  - le rappel est « réclamé » AVANT l'envoi : deux lancements simultanés (cron + bouton) n'envoient jamais deux fois
//    le même rappel ; si l'envoi échoue, la réclamation est annulée et le rappel sera retenté ;
//  - « demain » se calcule à l'heure de la Guadeloupe (UTC-4), jamais en UTC ;
//  - la date demandée est contrôlée ; le secret du déclenchement automatique est comparé sans fuite sur le temps.
// ═══════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ADMIN_EMAIL = "toifreddypro@gmail.com";
const CRON_SECRET = Deno.env.get("RAPPELS_CRON_SECRET");
const DECALAGE_LOCAL_MS = 4 * 3600 * 1000; // Guadeloupe = UTC-4
const MSG_ERREUR_GENERIQUE = "Une erreur est survenue. Réessayez dans un instant.";

function escHtml(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (m) => (({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }) as Record<string, string>)[m]);
}
function egalConstant(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function dateValide(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function demainISO(): string {
  // La date du jour en Guadeloupe (UTC-4), puis +1 jour : correct à n'importe quelle heure, pas seulement à 14h UTC.
  const d = new Date(Date.now() - DECALAGE_LOCAL_MS);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

async function envoyerEmail(to: string, subject: string, html: string): Promise<boolean> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) { console.warn("[envoyer-rappels-prestations] RESEND_API_KEY absente — email non envoyé."); return false; }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "CaraLink Artisans <notifications@learnlogicstudio.com>", to: [to], subject, html }),
    });
    if (!res.ok) { console.error("[envoyer-rappels-prestations] Échec Resend :", await res.text()); return false; }
    return true;
  } catch (e) {
    console.error("[envoyer-rappels-prestations] Erreur envoi email :", e);
    return false;
  }
}


// ── Commissions impayées : relance à 7 jours, relance à 14 jours, suspension à 30 jours (même passage quotidien) ──
// Le « jour 0 » est la date à laquelle le prélèvement est passé en « échoué » (colonne echec_depuis). Chaque étape est RÉCLAMÉE avant
// l'envoi (un seul lancement l'obtient : jamais deux emails identiques) ; si l'envoi échoue, la réclamation est annulée et retentée.
// La suspension n'efface rien : la fiche et la boutique sortent de l'annuaire et plus aucun projet n'est proposé ; tout revient
// automatiquement dès que la commission est payée (voir commission-impayee.sql).
function eurosFr(n: number): string { return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €"; }
function dateFr(d: Date): string { return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Guadeloupe" }); }

async function traiterCommissionsImpayees(sb: any) {
  const bilan = { relance_7: 0, relance_14: 0, suspensions: 0, echecs: 0 };
  const { data: lignes, error } = await sb.from("prelevements_prestations")
    .select("id, artisan_id, mois, commission_montant, echec_depuis, relance_7_le, relance_14_le")
    .eq("statut", "echoue").not("echec_depuis", "is", null);
  if (error) { console.error("[envoyer-rappels-prestations] lecture des commissions échouées :", error.message); return bilan; }
  const parArtisan = new Map<string, any[]>();
  for (const l of lignes || []) { if (!parArtisan.has(l.artisan_id)) parArtisan.set(l.artisan_id, []); parArtisan.get(l.artisan_id)!.push(l); }

  for (const [artisanId, liste] of parArtisan) {
    try {
      const { data: art } = await sb.from("artisans").select("id, nom_entreprise, email, suspendu_commission").eq("id", artisanId).maybeSingle();
      if (!art) continue;
      const total = liste.reduce((s: number, l: any) => s + Number(l.commission_montant || 0), 0);
      const depuis = new Date(Math.min(...liste.map((l: any) => new Date(l.echec_depuis).getTime())));
      const jours = Math.floor((Date.now() - depuis.getTime()) / 86400000);
      const dateSuspension = new Date(depuis.getTime() + 30 * 86400000);
      const nom = escHtml(art.nom_entreprise || "");
      const lienMpa = `<p style="margin:20px 0;"><a href="https://caralink.app/mpa/" style="display:inline-block;padding:12px 22px;border-radius:8px;background:#B5502F;color:#fff;font-weight:700;text-decoration:none;">Régler dans MPA Artisans</a></p>`;
      const lienFaq = `<p style="font-size:13px;"><a href="https://caralink.app/artisans/#faq-commission" style="color:#B5502F;">Pourquoi cette commission ? Voir l'explication et le calcul</a></p>`;

      if (jours >= 30) {
        if (art.suspendu_commission) continue;
        const { data: r } = await sb.from("artisans").update({ suspendu_commission: true, suspendu_le: new Date().toISOString() }).eq("id", artisanId).eq("suspendu_commission", false).select("id");
        if (!r || r.length === 0) continue; // un autre lancement l'a fait
        bilan.suspensions++;
        if (art.email) await envoyerEmail(art.email, "🚫 Votre fiche CaraLink est suspendue (commission impayée)", `<div style="font-family:sans-serif;max-width:480px;">
          <h2 style="color:#dc2626;">Fiche suspendue</h2><p>Bonjour ${nom},</p>
          <p>Votre commission de <strong>${eurosFr(total)}</strong> est impayée depuis plus de 30 jours. Votre fiche et votre boutique sont donc <strong>retirées de l'annuaire</strong> et aucun nouveau projet de client ne vous est proposé.</p>
          <p>Rien n'est supprimé : tout revient <strong>automatiquement</strong> dès que la commission est payée (mettez à jour votre carte dans MPA Artisans : le prélèvement est alors retenté immédiatement).</p>${lienMpa}${lienFaq}</div>`);
        await envoyerEmail(ADMIN_EMAIL, `Suspension commission impayée : ${art.nom_entreprise}`, `<p>${nom} est suspendu(e) de l'annuaire : ${eurosFr(total)} impayés depuis le ${dateFr(depuis)}.</p>`);
        continue;
      }
      const etape = jours >= 14 ? 14 : jours >= 7 ? 7 : 0;
      if (etape === 0 || !art.email) continue;
      const colonne = etape === 14 ? "relance_14_le" : "relance_7_le";
      const aRelancer = liste.filter((l: any) => !l[colonne]);
      if (aRelancer.length === 0) continue;
      const ids = aRelancer.map((l: any) => l.id);
      const { data: reclame } = await sb.from("prelevements_prestations").update({ [colonne]: new Date().toISOString() }).in("id", ids).is(colonne, null).select("id");
      if (!reclame || reclame.length === 0) continue;
      const corps = etape === 14
        ? `<p><strong>Dernier rappel avant suspension.</strong> Votre commission de <strong>${eurosFr(total)}</strong> est impayée depuis ${jours} jours. Sans règlement avant le <strong>${dateFr(dateSuspension)}</strong>, votre fiche et votre boutique seront retirées de l'annuaire (elles reviennent dès le règlement).</p>`
        : `<p>Votre commission de <strong>${eurosFr(total)}</strong> n'a pas pu être prélevée il y a ${jours} jours. Merci de mettre à jour votre carte dans MPA Artisans : le prélèvement est retenté immédiatement. Sans règlement avant le ${dateFr(dateSuspension)}, votre fiche sera retirée de l'annuaire.</p>`;
      const ok = await envoyerEmail(art.email, etape === 14 ? "⚠️ Dernier rappel : commission CaraLink impayée" : "Rappel : commission CaraLink impayée",
        `<div style="font-family:sans-serif;max-width:480px;"><h2 style="color:#B5502F;">Commission impayée</h2><p>Bonjour ${nom},</p>${corps}${lienMpa}${lienFaq}</div>`);
      if (ok) { if (etape === 14) bilan.relance_14++; else bilan.relance_7++; }
      else { bilan.echecs++; await sb.from("prelevements_prestations").update({ [colonne]: null }).in("id", ids); }
    } catch (e) { console.error("[envoyer-rappels-prestations] commission impayée, artisan", artisanId, e); bilan.echecs++; }
  }
  return bilan;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);

  try {
    const secretCron = req.headers.get("X-Cron-Secret");
    const estCron = !!CRON_SECRET && egalConstant(secretCron ?? "", CRON_SECRET);

    if (!estCron) {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return json({ error: "Non authentifié." }, 401);
      const sbCaller = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await sbCaller.auth.getUser();
      if (!user || user.email !== ADMIN_EMAIL) return json({ error: "Réservé à l'administrateur." }, 403);
    }

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => ({}));
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Requête invalide." }, 400);
    if (body.date_iso != null && body.date_iso !== "" && (typeof body.date_iso !== "string" || !dateValide(body.date_iso))) return json({ error: "Date invalide (format AAAA-MM-JJ)." }, 400);
    const dateCible = body.date_iso || demainISO();

    const { data: interventions, error } = await sb.from("mpa_artisans_interventions")
      .select("id, date_intervention, creneau, heure_debut, artisan_id, artisans(nom_entreprise, telephone), mpa_artisans_clients(nom, email), artisans_services(nom_service)")
      .eq("date_intervention", dateCible)
      .eq("statut", "planifiee")
      .eq("rappel_envoye", false);
    if (error) throw error;

    const resultats = [];
    for (const inter of interventions || []) {
      const client = (inter as any).mpa_artisans_clients;
      const artisan = (inter as any).artisans;
      const service = (inter as any).artisans_services;

      if (!client?.email) {
        resultats.push({ intervention_id: inter.id, statut: "sans_email" });
        continue;
      }

      const heure = inter.heure_debut || (inter.creneau === "matin" ? "dans la matinée" : (inter.creneau === "apres_midi" || inter.creneau === "apres-midi") ? "dans l'après-midi" : "");
      // « Réclamation » AVANT l'envoi : un seul des lancements simultanés l'obtient (jamais deux emails identiques).
      const { data: reclame, error: errReclame } = await sb.from("mpa_artisans_interventions")
        .update({ rappel_envoye: true }).eq("id", inter.id).eq("rappel_envoye", false).select("id");
      if (errReclame) { console.error("[envoyer-rappels-prestations] Réclamation impossible :", errReclame.message); resultats.push({ intervention_id: inter.id, statut: "erreur" }); continue; }
      if (!reclame || reclame.length === 0) { resultats.push({ intervention_id: inter.id, statut: "deja_envoye" }); continue; }

      const html = `<div style="font-family:sans-serif;max-width:480px;">
        <h2 style="color:#B5502F;">Rappel — rendez-vous demain</h2>
        <p>Bonjour ${escHtml(client.nom || "")},</p>
        <p>Petit rappel : <strong>${escHtml(artisan?.nom_entreprise || "votre artisan")}</strong> a rendez-vous avec vous demain${service?.nom_service ? " pour : " + escHtml(service.nom_service) : ""}${heure ? " — " + escHtml(heure) : ""}.</p>
        ${artisan?.telephone ? `<p>Une question ou besoin de reporter ? Contactez directement l'artisan au ${escHtml(artisan.telephone)}.</p>` : ""}
      </div>`;

      // Sujet : texte brut sur une seule ligne, de longueur raisonnable.
      const nomSujet = String(artisan?.nom_entreprise || "votre artisan").replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, 80);
      const envoye = await envoyerEmail(client.email, `Rappel : rendez-vous demain avec ${nomSujet}`, html);
      if (envoye) {
        resultats.push({ intervention_id: inter.id, statut: "envoye" });
      } else {
        // L'envoi a échoué : on annule la réclamation, le rappel sera retenté au prochain passage.
        const { error: errAnnul } = await sb.from("mpa_artisans_interventions").update({ rappel_envoye: false }).eq("id", inter.id);
        if (errAnnul) console.error("[envoyer-rappels-prestations] Annulation de la réclamation impossible :", errAnnul.message);
        resultats.push({ intervention_id: inter.id, statut: "echec_envoi" });
      }
    }

    // Ménage quotidien des réservations payées en ligne (paiements non réglés, artisan sans réponse → remboursement…) :
    // même déclenchement, même secret. Jamais bloquant pour les rappels.
    try {
      if (CRON_SECRET) {
        const m = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/maintenance-reservations`, { method: "POST", headers: { "X-Cron-Secret": CRON_SECRET, "Content-Type": "application/json" }, body: "{}" });
        if (!m.ok) console.error("[envoyer-rappels-prestations] maintenance-reservations a répondu", m.status);
      }
    } catch (e) { console.error("[envoyer-rappels-prestations] maintenance-reservations injoignable :", e); }

    // Commissions impayées : relances (7 j, 14 j) et suspension (30 j). Jamais bloquant pour les rappels.
    let commissions: unknown = null;
    try { commissions = await traiterCommissionsImpayees(sb); } catch (e) { console.error("[envoyer-rappels-prestations] commissions impayées :", e); }

    return json({ ok: true, date: dateCible, traites: resultats.length, resultats, commissions });

  } catch (e) {
    console.error("[envoyer-rappels-prestations]", e);
    return json({ error: MSG_ERREUR_GENERIQUE }, 500); // le détail reste dans les journaux
  }
});
