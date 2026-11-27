// ═══════════════════════════════════════════════════════════
// CaraLink Artisans — Edge Function : forfait-groupe (lot 56b)
// Achat d'un forfait de séances par un client (sans compte : le jeton du lien suffit), solde, réservation des jours avec places.
// Paiement direct sur le compte Stripe de l'artisan (même modèle que creer-paiement-commande). Fonction PUBLIQUE :
// prix, nombre de séances, places et validité viennent TOUJOURS de la base, jamais de la page.
// Actions : infos_service · acheter · lire · reserver · annuler
// ═══════════════════════════════════════════════════════════
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;
const SEUIL_GRATUIT_CENTIMES = 200 * 100;
const DECALAGE_LOCAL_MS = 4 * 3600 * 1000;
const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REGEX_JETON = /^[0-9a-f]{64}$/;
const MSG_GENERIQUE = "L'opération n'a pas pu être faite. Réessayez dans un instant, ou contactez le coach.";
const SEMAINES_AFFICHEES = 5;

const json = (p: unknown, s = 200) => new Response(JSON.stringify(p), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const tauxPour = (plan: string | null | undefined) => (plan === "pro" || plan === "pro_offert") ? 0.05 : 0.07;
function commissionAvecSeuil(montant: number, deja: number, seuil: number, taux: number) {
  const sous = Math.min(montant, Math.max(0, seuil - deja));
  return Math.round((montant - sous) * taux);
}
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

async function stripeCall(path: string, params: Record<string, string>, cle?: string, compte?: string) {
  const headers: Record<string, string> = { "Authorization": `Bearer ${STRIPE_SECRET_KEY}`, "Content-Type": "application/x-www-form-urlencoded" };
  if (cle) headers["Idempotency-Key"] = cle;
  if (compte) headers["Stripe-Account"] = compte;
  let res = await fetch(`https://api.stripe.com/v1/${path}`, { method: "POST", headers, body: new URLSearchParams(params) });
  for (let i = 1; i <= 4 && res.status === 409; i++) { await new Promise((r) => setTimeout(r, 300 * i)); res = await fetch(`https://api.stripe.com/v1/${path}`, { method: "POST", headers, body: new URLSearchParams(params) }); }
  const data = await res.json();
  if (!res.ok) { const e: any = new Error(data?.error?.message || "Erreur Stripe"); e.stripeCode = data?.error?.code; throw e; }
  return data;
}
async function stripeGet(path: string, compte?: string) {
  const headers: Record<string, string> = { "Authorization": `Bearer ${STRIPE_SECRET_KEY}` };
  if (compte) headers["Stripe-Account"] = compte;
  const res = await fetch(`https://api.stripe.com/v1/${path}`, { headers });
  return { ok: res.ok, data: await res.json().catch(() => ({})) };
}
async function carteOk(artisanId: string): Promise<boolean> {
  try {
    const { data, error } = await sb.from("artisans").select("carte_prestations_enregistree, carte_delai_jusqua").eq("id", artisanId).maybeSingle();
    if (error) return true;
    if (!data) return false;
    return data.carte_prestations_enregistree === true || (!!data.carte_delai_jusqua && new Date(data.carte_delai_jusqua).getTime() > Date.now());
  } catch (_e) { return true; }
}
// Déjà facturé en ligne ce mois-ci (commandes + forfaits payés), pour la franchise de 200 €.
async function dejaFactureCentimes(artisanId: string, forfaitExclu: string): Promise<number> {
  const local = new Date(Date.now() - DECALAGE_LOCAL_MS);
  const debut = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) + DECALAGE_LOCAL_MS).toISOString();
  let total = 0;
  const { data: cmd } = await sb.from("commandes_catalogue").select("montant_total, montant_rembourse").eq("artisan_id", artisanId)
    .in("paiement_statut", ["paye", "partiellement_rembourse", "rembourse"]).gte("created_at", debut);
  for (const c of cmd || []) total += Math.round(Math.max(0, Number(c.montant_total || 0) - Number(c.montant_rembourse || 0)) * 100);
  const { data: fo } = await sb.from("artisans_forfaits").select("prix").eq("artisan_id", artisanId).eq("statut", "actif").neq("id", forfaitExclu).gte("paye_le", debut);
  for (const f of fo || []) total += Math.round(Number(f.prix || 0) * 100);
  return total;
}

const NOMS_JOURS = ["", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];
function dateISOGuadeloupe(d: Date) { return new Date(d.getTime() - DECALAGE_LOCAL_MS).toISOString().slice(0, 10); }
// Prochaines séances d'un cours (jours + heure du service) avec le nombre de places restantes.
async function prochainesSeances(service: any, valableJusqua: string | null) {
  const jours: number[] = service.groupe_jours || [];
  const heure: string = service.groupe_heure;
  if (!jours.length || !heure) return [];
  const aujourdhui = new Date(Date.now() - DECALAGE_LOCAL_MS);
  const base = Date.UTC(aujourdhui.getUTCFullYear(), aujourdhui.getUTCMonth(), aujourdhui.getUTCDate());
  const limite = valableJusqua ? new Date(valableJusqua).getTime() : Infinity;
  const dates: string[] = [];
  for (let i = 0; i < SEMAINES_AFFICHEES * 7; i++) {
    const d = new Date(base + i * 86400000);
    const iso = d.toISOString().slice(0, 10);
    const isodow = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
    if (!jours.includes(isodow)) continue;
    const debutMs = Date.parse(`${iso}T${heure}:00Z`) + DECALAGE_LOCAL_MS; // heure locale (UTC-4) → UTC
    if (debutMs <= Date.now() || debutMs > limite) continue;
    dates.push(iso);
  }
  if (!dates.length) return [];
  const { data: pris } = await sb.from("artisans_forfaits_seances").select("date_seance")
    .eq("service_id", service.id).eq("heure", heure).neq("statut", "annulee").in("date_seance", dates);
  const compte: Record<string, number> = {};
  for (const p of pris || []) compte[p.date_seance] = (compte[p.date_seance] || 0) + 1;
  return dates.map((iso) => {
    const isodow = new Date(iso + "T00:00:00Z").getUTCDay() || 7;
    return { date: iso, jour: NOMS_JOURS[isodow], heure, places_restantes: Math.max(0, service.groupe_places - (compte[iso] || 0)) };
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Requête invalide." }, 400);
    const action = String(body.action || "");

    // ── Présentation du forfait avant achat ──
    if (action === "infos_service" || action === "acheter") {
      const serviceId = String(body.service_id || "");
      if (!/^[0-9a-zA-Z-]{1,64}$/.test(serviceId)) return json({ error: "Forfait introuvable." }, 404);
      const { data: s, error: eS } = await sb.from("artisans_services")
        .select("id, artisan_id, nom_service, description, forfait_seances, forfait_prix, forfait_validite_jours, forfait_annulation, groupe_places, groupe_jours, groupe_heure, artisans(nom_entreprise, stripe_connect_account_id, stripe_connect_statut, plan, actif, suspendu_commission)")
        .eq("id", serviceId).maybeSingle();
      if (eS) throw eS;
      const art: any = (s as any)?.artisans;
      if (!s || !s.forfait_seances || !s.forfait_prix || !art?.actif || art.suspendu_commission) return json({ error: "Forfait introuvable." }, 404);
      const reservable = art.stripe_connect_statut === "actif" && !!art.stripe_connect_account_id && await carteOk(s.artisan_id);
      const validite = Number(s.forfait_validite_jours || 90);
      const resume = {
        artisan: art.nom_entreprise, nom_service: s.nom_service, description: s.description || null,
        nb_seances: s.forfait_seances, prix: Number(s.forfait_prix), prix_par_seance: Math.round(Number(s.forfait_prix) / s.forfait_seances * 100) / 100,
        validite_jours: validite, annulation: s.forfait_annulation || "due",
        collectif: !!s.groupe_places, places: s.groupe_places || null,
        jours: (s.groupe_jours || []).map((j: number) => NOMS_JOURS[j]), heure: s.groupe_heure || null, reservable,
      };
      if (action === "infos_service") return json(resume);

      // ── Achat ──
      if (!reservable) return json({ error: "Ce coach n'a pas encore activé les paiements en ligne." }, 400);
      if (!s.groupe_places) return json({ error: "Ce forfait n'est pas encore ouvert à l'achat en ligne." }, 400); // forfait individuel : étape suivante
      const nom = String(body.nom || "").trim(), tel = String(body.telephone || "").trim(), email = String(body.email || "").trim().toLowerCase();
      if (nom.length < 2 || nom.length > 60) return json({ error: "Indiquez votre nom." }, 400);
      if (tel.length < 6 || tel.length > 20) return json({ error: "Indiquez un numéro de téléphone valide." }, 400);
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 120) return json({ error: "Indiquez un email valide : il sert à retrouver votre forfait." }, 400);
      if (body.accepte_conditions !== true) return json({ error: "Vous devez accepter les conditions du forfait." }, 400);

      const compte: string = art.stripe_connect_account_id;
      const cs = await stripeGet(`accounts/${encodeURIComponent(compte)}`);
      if (!cs.ok || cs.data?.controller?.losses?.payments !== "stripe" || cs.data?.controller?.fees?.payer !== "account") {
        console.error("[forfait-groupe] compte non conforme", s.artisan_id);
        return json({ error: "Ce coach doit réactiver ses paiements en ligne." }, 400);
      }
      const montant = Math.round(Number(s.forfait_prix) * 100);
      if (montant < 50) return json({ error: "Montant trop faible pour un paiement en ligne." }, 400);

      // Un seul forfait « en attente » par client et par service : on réutilise le paiement ouvert si le prix n'a pas changé.
      const { data: ancien } = await sb.from("artisans_forfaits").select("*").eq("service_id", serviceId).eq("email", email).eq("statut", "en_attente").order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (ancien?.stripe_payment_intent_id) {
        const pi = await stripeGet(`payment_intents/${encodeURIComponent(ancien.stripe_payment_intent_id)}`, compte);
        if (pi.ok && ["requires_payment_method", "requires_confirmation", "requires_action"].includes(pi.data?.status) && pi.data.amount === montant && pi.data.client_secret) {
          return json({ client_secret: pi.data.client_secret, stripe_account: compte, token: ancien.token });
        }
        if (pi.ok && pi.data?.status === "processing") return json({ error: "Un paiement est déjà en cours. Patientez quelques instants." }, 409);
        if (pi.ok && ["requires_payment_method", "requires_confirmation", "requires_action"].includes(pi.data?.status)) {
          try { await stripeCall(`payment_intents/${encodeURIComponent(ancien.stripe_payment_intent_id)}/cancel`, {}, undefined, compte); } catch (e) { console.error("[forfait-groupe] annulation ancien paiement", e); }
        }
        await sb.from("artisans_forfaits").update({ statut: "annule" }).eq("id", ancien.id).eq("statut", "en_attente");
      }

      const valable = new Date(Date.now() + validite * 86400000).toISOString();
      const { data: f, error: eF } = await sb.from("artisans_forfaits").insert({
        artisan_id: s.artisan_id, service_id: serviceId, nom_service: s.nom_service, nom, telephone: tel, email,
        nb_total: s.forfait_seances, prix: Number(s.forfait_prix), annulation: s.forfait_annulation || "due", valable_jusqua: valable,
      }).select("id, token").single();
      if (eF) throw eF;

      const deja = await dejaFactureCentimes(s.artisan_id, f.id);
      const retenue = Math.min(commissionAvecSeuil(montant, deja, SEUIL_GRATUIT_CENTIMES, tauxPour(art.plan)), montant);
      const params: Record<string, string> = {
        amount: String(montant), currency: "eur", "automatic_payment_methods[enabled]": "true",
        "metadata[forfait_id]": f.id, "metadata[artisan_id]": s.artisan_id,
        description: `Forfait ${s.forfait_seances} séances — ${s.nom_service} — ${art.nom_entreprise}`,
        receipt_email: email,
      };
      if (retenue > 0) params["application_fee_amount"] = String(retenue);
      let intent: any;
      try { intent = await stripeCall("payment_intents", params, `forfait_${f.id}`, compte); }
      catch (e) { await sb.from("artisans_forfaits").update({ statut: "annule" }).eq("id", f.id); throw e; }
      const { error: eM } = await sb.from("artisans_forfaits").update({ stripe_payment_intent_id: intent.id, stripe_account: compte, commission_montant: retenue / 100 }).eq("id", f.id);
      if (eM) {
        try { await stripeCall(`payment_intents/${encodeURIComponent(intent.id)}/cancel`, {}, undefined, compte); } catch (_e) { /* journalisé ci-dessous */ }
        throw eM;
      }
      return json({ client_secret: intent.client_secret, stripe_account: compte, token: f.token });
    }

    // ── Actions sur un forfait existant (jeton du lien) ──
    const token = String(body.token || "");
    if (!REGEX_JETON.test(token)) return json({ error: "Lien invalide." }, 404);
    const { data: f, error: eF } = await sb.from("artisans_forfaits").select("*, artisans(nom_entreprise)").eq("token", token).maybeSingle();
    if (eF) throw eF;
    if (!f) return json({ error: "Forfait introuvable." }, 404);

    if (action === "lire") {
      const { data: seances } = await sb.from("artisans_forfaits_seances").select("id, date_seance, heure, statut").eq("forfait_id", f.id).order("date_seance", { ascending: true });
      const utilisees = (seances || []).filter((q: any) => q.statut !== "annulee").length;
      let disponibles: unknown[] = [];
      if (f.statut === "actif" && f.service_id) {
        const { data: s } = await sb.from("artisans_services").select("id, groupe_places, groupe_jours, groupe_heure").eq("id", f.service_id).maybeSingle();
        if (s) disponibles = await prochainesSeances(s, f.valable_jusqua);
      }
      return json({
        artisan: (f as any).artisans?.nom_entreprise, nom_service: f.nom_service, client: f.nom, statut: f.statut,
        nb_total: f.nb_total, solde: Math.max(0, f.nb_total - utilisees), valable_jusqua: f.valable_jusqua, annulation: f.annulation,
        seances: seances || [], disponibles,
      });
    }

    if (action === "reserver") {
      const date = String(body.date || ""), heure = String(body.heure || "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^[0-2]\d:[0-5]\d$/.test(heure)) return json({ error: "Jour invalide." }, 400);
      if (body.accepte !== true) return json({ error: "Vous devez accepter que la séance réservée soit due." }, 400);
      const { data: r, error: eR } = await sb.rpc("reserver_seance_forfait", { p_token: token, p_date: date, p_heure: heure });
      if (eR) throw eR;
      const msgs: Record<string, string> = {
        forfait_inactif: "Ce forfait n'est pas (ou plus) actif.", expire: "Ce forfait a expiré.", indisponible: "Ce cours n'est plus proposé.",
        jour_invalide: "Ce jour ne fait pas partie du cours.", passee: "Cette séance est déjà passée.", apres_validite: "Ce jour est après la fin de validité de votre forfait.",
        solde_vide: "Vous avez utilisé toutes les séances de ce forfait.", deja_reserve: "Vous êtes déjà inscrit à cette séance.", complet: "Cette séance est complète.",
      };
      if (!r?.ok) return json({ error: msgs[r?.code] || MSG_GENERIQUE, code: r?.code }, r?.code === "complet" ? 409 : 400);
      return json({ ok: true, solde: r.solde, places_restantes: r.restantes });
    }

    if (action === "annuler") {
      const id = String(body.seance_id || "");
      if (!REGEX_UUID.test(id)) return json({ error: "Séance introuvable." }, 404);
      const { data: r, error: eR } = await sb.rpc("annuler_seance_forfait", { p_token: token, p_seance: id });
      if (eR) throw eR;
      if (!r?.ok) {
        const m: Record<string, string> = { due: "Cette séance est due : elle ne peut pas être annulée.", trop_tard: "Il est trop tard pour annuler gratuitement (moins de 24 h avant la séance).", introuvable: "Séance introuvable." };
        return json({ error: m[r?.code] || MSG_GENERIQUE, code: r?.code }, 400);
      }
      return json({ ok: true });
    }
    return json({ error: "Action inconnue." }, 400);
  } catch (e) {
    console.error("[forfait-groupe]", e);
    return json({ error: MSG_GENERIQUE }, 500);
  }
});
