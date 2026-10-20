// ═══════════════════════════════════════════════════════════
// CaraLink Artisans — Edge Function : envoyer-facture
// Propriété : TOI Freddy
//
// Envoie par email, à son client, une facture déjà créée par l'artisan (facture d'intervention ou de commande de la boutique).
// Réservé à l'offre Pro — refusé ici aussi, jamais seulement caché dans l'interface.
//
// POST { facture_id, email? }   (email : seulement si la fiche client n'en a pas encore ; il est alors enregistré sur la fiche)
//
// Sécurité : session de l'artisan obligatoire ; la facture doit lui appartenir ; tout texte venu d'un artisan ou d'un client est
// échappé avant d'entrer dans l'email ; l'email part de la plateforme avec « répondre à » = l'adresse de l'artisan ;
// limitation : 30 envois par heure et par artisan, 5 envois par jour et par facture ; aucune erreur interne n'est détaillée.
// Un seul envoi à la fois par facture (verrou de 30 secondes, atomique en base) : un double clic ne part jamais deux fois.
// Colonnes facultatives (envoyee_le, envoyee_a — voir facture-email.sql ; envoi_en_cours_le — voir facture-numerotation.sql) : si elles n'existent pas encore, l'envoi marche quand même.
// ═══════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const MSG_ERREUR_GENERIQUE = "Une erreur est survenue. Réessayez dans un instant.";
const REGEX_EMAIL = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]{2,}$/;

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
function escHtml(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (m) => (({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }) as Record<string, string>)[m]);
}
function euros(n: number): string { return n.toFixed(2).replace(".", ",") + " €"; }
function dateFR(d: Date, long = false): string {
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: long ? "long" : "short", year: "numeric", timeZone: "America/Guadeloupe" });
}

async function limiteAtteinte(sb: any, cle: string, max: number, fenetreSecondes: number): Promise<boolean> {
  try {
    const { data, error } = await sb.rpc("limiter_appel", { p_cle: cle, p_max: max, p_fenetre_s: fenetreSecondes });
    if (error) { console.error("[limiter_appel]", error.message); return false; }
    return data === false;
  } catch (e) { console.error("[limiter_appel]", e); return false; }
}

async function envoyerEmail(to: string, replyTo: string | null, subject: string, html: string): Promise<boolean> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) { console.error("[envoyer-facture] RESEND_API_KEY absente."); return false; }
  const corps: Record<string, unknown> = { from: "CaraLink Artisans <notifications@learnlogicstudio.com>", to: [to], subject, html };
  if (replyTo && REGEX_EMAIL.test(replyTo)) corps.reply_to = replyTo;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(corps),
  });
  if (!res.ok) { console.error("[envoyer-facture] Échec envoi Resend :", await res.text()); return false; }
  return true;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);

  const sbAdmin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const sbAnon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);

  try {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Non authentifié." }, 401);
    const { data: userData, error: userErr } = await sbAnon.auth.getUser(token);
    if (userErr || !userData?.user) return json({ error: "Session invalide." }, 401);

    const { data: artisan } = await sbAdmin.from("artisans").select("*").eq("user_id", userData.user.id).maybeSingle();
    if (!artisan) return json({ error: "Profil artisan introuvable." }, 404);
    if (artisan.plan !== "pro" && artisan.plan !== "pro_offert") return json({ error: "facture_email_reserve_pro" }, 403);

    const body = await req.json().catch(() => null);
    const factureId = String(body?.facture_id ?? "");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(factureId)) return json({ error: "Facture introuvable." }, 404);

    const { data: facture, error: errF } = await sbAdmin.from("mpa_artisans_factures")
      .select("*, mpa_artisans_clients(*)").eq("id", factureId).eq("artisan_id", artisan.id).maybeSingle();
    if (errF) throw errF;
    if (!facture) return json({ error: "Facture introuvable." }, 404);
    const client = (facture as any).mpa_artisans_clients;
    if (!client) return json({ error: "Cette facture n'a pas de client." }, 400);

    if (await limiteAtteinte(sbAdmin, `envoyer-facture:artisan:${artisan.id}`, 30, 3600)) return json({ error: "Trop d'envois. Réessayez dans une heure." }, 429);
    if (await limiteAtteinte(sbAdmin, `envoyer-facture:facture:${facture.id}`, 5, 86400)) return json({ error: "Cette facture a déjà été envoyée plusieurs fois aujourd'hui." }, 429);

    // Adresse du client : celle de sa fiche, sinon celle saisie par l'artisan (puis enregistrée sur la fiche).
    let destinataire: string = client.email || "";
    if (!destinataire) {
      const saisi = String(body?.email ?? "").trim();
      if (!REGEX_EMAIL.test(saisi) || saisi.length > 200) return json({ error: "email_client_manquant" }, 400);
      destinataire = saisi;
      const { error: errMaj } = await sbAdmin.from("mpa_artisans_clients").update({ email: saisi }).eq("id", client.id).eq("artisan_id", artisan.id);
      if (errMaj) console.error("[envoyer-facture] email client non enregistré :", errMaj.message);
    }

    // Verrou anti double-envoi (double clic, deux requêtes simultanées) : un seul envoi à la fois par facture, atomique côté base.
    // Colonne facultative (facture-numerotation.sql) : si elle n'existe pas encore, on continue sans verrou.
    const limiteVerrou = new Date(Date.now() - 30000).toISOString();
    const { data: verrou, error: errVerrou } = await sbAdmin.from("mpa_artisans_factures")
      .update({ envoi_en_cours_le: new Date().toISOString() })
      .eq("id", facture.id).or(`envoi_en_cours_le.is.null,envoi_en_cours_le.lt.${limiteVerrou}`).select("id");
    let verrouPris = false;
    if (errVerrou) {
      if ((errVerrou as any).code !== "42703") throw errVerrou;
    } else if (!verrou || !verrou.length) {
      return json({ error: "envoi_en_cours" }, 409);
    } else { verrouPris = true; }
    const libererVerrou = async () => { if (verrouPris) await sbAdmin.from("mpa_artisans_factures").update({ envoi_en_cours_le: null }).eq("id", facture.id); };

    // Lignes de la facture : interventions facturées, ou articles de la commande de la boutique.
    const total = Number(facture.montant_total) || 0;
    let lignes: { date: string; libelle: string; qte: number; pu: number }[] = [];
    if (facture.commande_id) {
      const { data: cmd } = await sbAdmin.from("commandes_catalogue").select("*").eq("id", facture.commande_id).eq("artisan_id", artisan.id).maybeSingle();
      if (cmd) {
        const dateCmd = dateFR(new Date(cmd.paiement_traite_le || cmd.created_at));
        const { data: lc } = await sbAdmin.from("commandes_catalogue_lignes").select("nom_article, prix_unitaire, quantite").eq("commande_id", cmd.id);
        if (lc && lc.length) lignes = lc.map((l: any) => ({ date: dateCmd, libelle: l.nom_article, qte: Number(l.quantite) || 1, pu: Number(l.prix_unitaire) || 0 }));
        else lignes = [{ date: dateCmd, libelle: cmd.nom_article, qte: Number(cmd.quantite) || 1, pu: total / (Number(cmd.quantite) || 1) }];
        const somme = lignes.reduce((s, l) => s + l.pu * l.qte, 0);
        const ecart = Math.round((total - somme) * 100) / 100;
        if (Math.abs(ecart) > 0.004) lignes.push({ date: dateCmd, libelle: "Remise / ajustement", qte: 1, pu: ecart });
      }
    } else {
      const { data: li } = await sbAdmin.from("mpa_artisans_interventions")
        .select("date_intervention, prix, notes, artisans_services(nom_service)").eq("facture_id", facture.id).eq("artisan_id", artisan.id).order("date_intervention", { ascending: true });
      lignes = (li || []).map((l: any) => ({
        date: dateFR(new Date(String(l.date_intervention) + "T12:00:00Z")),
        libelle: (l.artisans_services?.nom_service || "Prestation") + (l.notes ? " — " + l.notes : ""),
        qte: 1, pu: Number(l.prix) || 0,
      }));
    }

    const delai = Number(client.delai_paiement) || 30;
    const dateFacture = new Date(facture.date_facture);
    const echeance = new Date(dateFacture.getTime() + delai * 86400000);
    const colonne = facture.commande_id ? "Désignation" : "Prestation";
    const tva = (artisan.tva_config && artisan.tva_config !== "Non assujetti") ? "" : `<p style="font-size:11px;color:#6b7c96;margin:10px 0 0;">TVA non applicable, art. 293 B du CGI.</p>`;
    const lignesHtml = lignes.map((l) =>
      `<tr><td style="padding:7px 8px;border-bottom:1px solid #e4e8ef;">${escHtml(l.date)}</td><td style="padding:7px 8px;border-bottom:1px solid #e4e8ef;">${escHtml(l.libelle)}</td><td style="padding:7px 8px;border-bottom:1px solid #e4e8ef;text-align:center;">${l.qte}</td><td style="padding:7px 8px;border-bottom:1px solid #e4e8ef;text-align:right;">${euros(l.pu)}</td><td style="padding:7px 8px;border-bottom:1px solid #e4e8ef;text-align:right;">${euros(l.pu * l.qte)}</td></tr>`).join("");
    const adresseArtisan = [artisan.adresse, [artisan.code_postal, artisan.commune].filter(Boolean).join(" ")].filter(Boolean).map(escHtml).join("<br>");
    const adresseClient = [client.adresse, client.adresse2, [client.code_postal, client.commune].filter(Boolean).join(" ")].filter(Boolean).map(escHtml).join("<br>");

    const html = `<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#1a2233;">
      <p>Bonjour ${escHtml(client.nom)},</p>
      <p>Veuillez trouver ci-dessous la facture n° <strong>${escHtml(facture.numero)}</strong> de <strong>${escHtml(artisan.nom_entreprise)}</strong>.</p>
      <div style="border:1px solid #e4e8ef;border-radius:10px;padding:20px;margin:16px 0;">
        <div style="display:flex;justify-content:space-between;margin-bottom:14px;"><strong style="font-size:17px;color:#B5502F;">Facture n° ${escHtml(facture.numero)}</strong></div>
        <p style="margin:0 0 14px;font-size:13px;color:#6b7c96;">Émise le ${dateFR(dateFacture, true)}</p>
        <table style="width:100%;border-collapse:collapse;margin-bottom:16px;font-size:13px;"><tr>
          <td style="vertical-align:top;width:50%;padding-right:10px;"><div style="font-size:11px;color:#6b7c96;text-transform:uppercase;">Émetteur</div><strong>${escHtml(artisan.nom_entreprise)}</strong><br>${artisan.siret ? "SIRET " + escHtml(artisan.siret) + "<br>" : ""}${adresseArtisan}${artisan.telephone ? "<br>Tél. " + escHtml(artisan.telephone) : ""}${artisan.email ? "<br>" + escHtml(artisan.email) : ""}</td>
          <td style="vertical-align:top;width:50%;"><div style="font-size:11px;color:#6b7c96;text-transform:uppercase;">Client</div><strong>${escHtml(client.nom)}</strong><br>${adresseClient}</td>
        </tr></table>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead><tr style="background:#f4f6fa;"><th style="padding:7px 8px;text-align:left;">Date</th><th style="padding:7px 8px;text-align:left;">${colonne}</th><th style="padding:7px 8px;">Qté</th><th style="padding:7px 8px;text-align:right;">Prix unit.</th><th style="padding:7px 8px;text-align:right;">Montant</th></tr></thead>
          <tbody>${lignesHtml}</tbody>
        </table>
        <p style="text-align:right;font-size:16px;margin:14px 0 0;"><strong>Total TTC : ${euros(total)}</strong></p>
        ${tva}
        <p style="font-size:11px;color:#6b7c96;margin:10px 0 0;">Conditions de règlement : paiement sous ${delai} jours — échéance le ${dateFR(echeance, true)}. En cas de retard de paiement, indemnité forfaitaire de recouvrement de 40 € (art. L441-10 du Code de commerce), applicable aux relations entre professionnels.</p>
      </div>
      <p style="font-size:12px;color:#6b7c96;">Pour toute question, répondez simplement à cet email : votre message sera adressé directement à ${escHtml(artisan.nom_entreprise)}.</p>
    </div>`;

    const ok = await envoyerEmail(destinataire, artisan.email || null, `Facture n° ${facture.numero} — ${artisan.nom_entreprise}`, html);
    if (!ok) { await libererVerrou(); return json({ error: "L'email n'a pas pu être envoyé. Réessayez dans un instant." }, 502); }

    const maintenant = new Date().toISOString();
    const { error: errMarque } = await sbAdmin.from("mpa_artisans_factures").update({ envoyee_le: maintenant, envoyee_a: destinataire }).eq("id", facture.id);
    if (errMarque) console.error("[envoyer-facture] marquage non enregistré :", errMarque.message); // colonnes facultatives
    return json({ ok: true, envoyee_le: maintenant, envoyee_a: destinataire });

  } catch (e) {
    console.error("[envoyer-facture]", e);
    return json({ error: MSG_ERREUR_GENERIQUE }, 500);
  }
});
