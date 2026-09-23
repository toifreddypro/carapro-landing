// ═══════════════════════════════════════════════════════════
// CaraLink Artisans — Edge Function : soumettre-avis-artisan
// Propriété : TOI Freddy
//
// Page publique (lien à usage unique par email) où le client note
// l'intervention. Modification possible pendant 7 jours après le
// premier envoi, puis figé. Aucun compte requis.
// ═══════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FENETRE_MODIF_JOURS = 7;

function pageHtml(titre: string, message: string, couleur: string): Response {
  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${titre}</title>
    <style>
      body{font-family:'Outfit',Arial,sans-serif;background:#f7f9fc;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px;}
      .box{background:#fff;border-radius:16px;padding:32px;max-width:420px;width:100%;box-shadow:0 8px 32px rgba(19,34,60,.1);text-align:center;}
      h1{color:${couleur};font-size:19px;margin-bottom:10px;}
      p{color:#4a5c78;font-size:13.5px;line-height:1.6;}
    </style></head>
    <body><div class="box"><h1>${titre}</h1><p>${message}</p></div></body></html>`;
  return new Response(html, { headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8", "Content-Disposition": "inline" } });
}

function formulaireHtml(token: string, nomEntreprise: string, dateAff: string, noteExistante: number | null, commentaireExistant: string | null): Response {
  const etoiles = [1, 2, 3, 4, 5].map((n) =>
    `<label style="font-size:36px;cursor:pointer;color:#e3eaf4;" id="etoile-${n}">
      <input type="radio" name="note" value="${n}" style="display:none;" ${noteExistante === n ? "checked" : ""} onchange="majEtoiles(${n})">★
    </label>`
  ).join("");

  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Votre avis</title>
    <style>
      body{font-family:'Outfit',Arial,sans-serif;background:#f7f9fc;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px;}
      .box{background:#fff;border-radius:16px;padding:32px;max-width:440px;width:100%;box-shadow:0 8px 32px rgba(19,34,60,.1);}
      h1{color:#13223c;font-size:18px;margin-bottom:6px;}
      p.sub{color:#6b7c96;font-size:13px;margin-bottom:20px;}
      textarea{width:100%;box-sizing:border-box;padding:10px 12px;border-radius:9px;border:1.5px solid #e3eaf4;font-family:inherit;font-size:13.5px;resize:vertical;margin:16px 0;}
      button{width:100%;padding:12px;border-radius:9px;border:none;background:#B5502F;color:#fff;font-size:14px;font-weight:700;cursor:pointer;}
      .etoiles{text-align:center;margin:10px 0;}
    </style></head>
    <body><div class="box">
      <h1>Votre avis sur ${nomEntreprise}</h1>
      <p class="sub">Intervention du ${dateAff}</p>
      <form method="GET" action="">
        <input type="hidden" name="token" value="${token}">
        <input type="hidden" name="execute" value="1">
        <div class="etoiles" id="etoiles">${etoiles}</div>
        <textarea name="commentaire" rows="4" placeholder="Un commentaire ? (optionnel)">${commentaireExistant || ""}</textarea>
        <button type="submit">Envoyer mon avis</button>
      </form>
    </div>
    <script>
      function majEtoiles(n) {
        for (let i = 1; i <= 5; i++) document.getElementById('etoile-' + i).style.color = i <= n ? '#f59e0b' : '#e3eaf4';
      }
      ${noteExistante ? `majEtoiles(${noteExistante});` : ""}
    </script>
    </body></html>`;
  return new Response(html, { headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8", "Content-Disposition": "inline" } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const execute = url.searchParams.get("execute") === "1";
  const note = parseInt(url.searchParams.get("note") || "", 10);
  const commentaire = (url.searchParams.get("commentaire") || "").trim() || null;

  if (!token) return pageHtml("Lien invalide", "Ce lien d'avis est incomplet ou incorrect.", "#dc2626");

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const { data: intervention, error } = await sb.from("mpa_artisans_interventions")
      .select("id, artisan_id, date_intervention, artisans(nom_entreprise), mpa_artisans_clients(nom)")
      .eq("avis_token", token).maybeSingle();
    if (error) throw error;
    if (!intervention) return pageHtml("Lien introuvable", "Ce lien d'avis n'existe pas ou n'est plus valide.", "#dc2626");

    const nomEntreprise = (intervention as any).artisans?.nom_entreprise || "cet artisan";
    const nomClient = (intervention as any).mpa_artisans_clients?.nom || "Client CaraLink";
    const dateAff = new Date(intervention.date_intervention).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

    const { data: avisExistant } = await sb.from("avis_carapro").select("*").eq("intervention_id", intervention.id).maybeSingle();

    if (avisExistant) {
      const modifiableJusqua = avisExistant.modifiable_jusqua ? new Date(avisExistant.modifiable_jusqua) : null;
      const encoreModifiable = modifiableJusqua && modifiableJusqua.getTime() > Date.now();
      if (!execute && !encoreModifiable) {
        return pageHtml("Avis déjà envoyé", "Vous avez déjà donné votre avis sur cette intervention, et le délai de 7 jours pour le modifier est dépassé. Merci pour votre retour !", "#6b7c96");
      }
      if (execute && !encoreModifiable) {
        return pageHtml("Modification impossible", "Le délai de 7 jours pour modifier votre avis est dépassé.", "#dc2626");
      }
    }

    if (!execute) {
      return formulaireHtml(token, nomEntreprise, dateAff, avisExistant?.note ?? null, avisExistant?.commentaire ?? null);
    }

    if (!note || note < 1 || note > 5) {
      return pageHtml("Note manquante", "Merci de choisir une note entre 1 et 5 étoiles.", "#dc2626");
    }

    if (avisExistant) {
      const { error: errUpd } = await sb.from("avis_carapro").update({ note, commentaire }).eq("id", avisExistant.id);
      if (errUpd) throw errUpd;
    } else {
      const { error: errIns } = await sb.from("avis_carapro").insert({
        artisan_id: intervention.artisan_id,
        intervention_id: intervention.id,
        client_nom: nomClient,
        note, commentaire,
        modifiable_jusqua: new Date(Date.now() + FENETRE_MODIF_JOURS * 24 * 60 * 60 * 1000).toISOString(),
      });
      if (errIns) throw errIns;
    }

    return pageHtml("Merci !", "Votre avis a bien été enregistré. Vous pouvez revenir sur ce lien pendant 7 jours pour le modifier si besoin.", "#16a34a");

  } catch (e) {
    console.error("[soumettre-avis-artisan]", e);
    return pageHtml("Erreur", "Une erreur est survenue — réessayez plus tard.", "#dc2626");
  }
});
