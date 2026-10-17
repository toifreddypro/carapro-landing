// ═══════════════════════════════════════════════════════════
// CaraLink Artisans — Edge Function : notifier-admin
// Propriété : TOI Freddy
//
// UNE seule fonction qui t'envoie un email quand il se passe quelque chose d'important côté artisans :
//   inscription            — un nouvel artisan vient de créer son profil              (appelée par finaliser-inscription-artisan)
//   abonnement             — un artisan prend l'abonnement Pro pour la première fois    (appelée par stripe-webhook-artisans)
//   reabonnement           — un artisan qui avait déjà été abonné reprend un abonnement
//   reprise                — un artisan annule sa résiliation (son abonnement continue)
//   resiliation_programmee — un artisan résilie : le Pro durera jusqu'à la fin de la période payée
//   abonnement_termine     — l'abonnement est terminé : l'artisan repasse en Essentiel
//   paiement_echec         — le paiement de l'abonnement a échoué (Stripe réessaie seul)
//
// POST { type, ...informations }   — réservée à l'interne : clé de service obligatoire (aucun navigateur ne peut l'appeler).
// À déployer SANS vérification de jeton (--no-verify-jwt) : c'est la clé de service, comparée ici à temps constant, qui protège la fonction.
//
// Sécurité : tout ce qui est reçu est borné et échappé avant d'entrer dans l'email ; une erreur n'est jamais détaillée à l'appelant ;
// l'appelant n'attend jamais le résultat de façon bloquante (il ignore l'échec : une notification ne doit jamais bloquer une inscription ou un paiement).
// ═══════════════════════════════════════════════════════════

const DESTINATAIRE = Deno.env.get("NOTIFICATIONS_ADMIN_EMAIL") || "contact@learnlogicstudio.com";
const TYPES: Record<string, { icone: string; titre: string; couleur: string }> = {
  inscription:            { icone: "🆕", titre: "Nouvelle inscription artisan", couleur: "#0f9d78" },
  abonnement:             { icone: "💳", titre: "Nouvel abonnement Pro",        couleur: "#0f9d78" },
  reabonnement:           { icone: "🔁", titre: "Réabonnement Pro",             couleur: "#0f9d78" },
  reprise:                { icone: "🙌", titre: "Résiliation annulée",          couleur: "#0f9d78" },
  resiliation_programmee: { icone: "👋", titre: "Résiliation programmée",       couleur: "#c27a00" },
  abonnement_termine:     { icone: "⛔", titre: "Abonnement terminé",           couleur: "#c0392b" },
  paiement_echec:         { icone: "⚠️", titre: "Paiement d'abonnement en échec", couleur: "#c0392b" },
};
const LIBELLES: Record<string, string> = {
  nom_entreprise: "Entreprise", email: "Email", telephone: "Téléphone", secteur: "Métier", commune: "Commune",
  siret: "SIRET", verification: "Vérification SIRET", document: "Document RC Pro", statut: "Statut de l'abonnement",
  echeance: "Prochaine échéance / fin d'essai", fin_pro: "Le Pro dure jusqu'au", plan: "Offre",
};
const ORDRE = Object.keys(LIBELLES);

function escHtml(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (m) => (({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }) as Record<string, string>)[m]);
}
function egalConstant(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let e = 0; for (let i = 0; i < a.length; i++) e |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return e === 0;
}
function borne(v: unknown, max = 200): string {
  return String(v ?? "").replace(/[\r\n\t]+/g, " ").trim().slice(0, max);
}
function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);
  try {
    const cleService = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const jeton = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!cleService || !jeton || !egalConstant(jeton, cleService)) return json({ error: "Non autorisé." }, 403);

    const corps = await req.json().catch(() => null);
    const type = borne(corps?.type, 40);
    const cadre = TYPES[type];
    if (!cadre) return json({ error: "Type inconnu." }, 400);

    const lignes = ORDRE.filter((k) => corps[k] != null && String(corps[k]).trim() !== "")
      .map((k) => `<tr><td style="padding:5px 14px 5px 0;color:#6b7c96;font-size:13px;white-space:nowrap;">${escHtml(LIBELLES[k])}</td><td style="padding:5px 0;font-size:14px;font-weight:600;color:#13223c;">${escHtml(borne(corps[k]))}</td></tr>`)
      .join("");
    const note = corps.note ? `<p style="font-size:13px;color:#4a5c78;margin:14px 0 0;">${escHtml(borne(corps.note, 400))}</p>` : "";
    const qui = borne(corps.nom_entreprise, 120) || "un artisan";
    const html = `<div style="font-family:sans-serif;max-width:520px;">
      <h2 style="color:${cadre.couleur};margin:0 0 12px;">${cadre.icone} ${escHtml(cadre.titre)}</h2>
      <table style="border-collapse:collapse;">${lignes}</table>${note}
      <p style="font-size:11.5px;color:#6b7c96;margin:18px 0 0;">Notification automatique CaraLink Artisans.</p></div>`;

    const apiKey = Deno.env.get("RESEND_API_KEY");
    if (!apiKey) { console.warn("[notifier-admin] RESEND_API_KEY absente — email non envoyé."); return json({ ok: false }, 200); }
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "CaraLink Artisans <notifications@learnlogicstudio.com>", to: [DESTINATAIRE], subject: `${cadre.icone} ${cadre.titre} — ${qui}`, html }),
    });
    if (!res.ok) { console.error("[notifier-admin] Échec envoi Resend :", await res.text()); return json({ ok: false }, 200); }
    return json({ ok: true });
  } catch (e) {
    console.error("[notifier-admin]", e);
    return json({ error: "Erreur." }, 500);
  }
});
