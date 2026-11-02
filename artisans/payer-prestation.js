// CaraLink Artisans — page de paiement d'une prestation (frais de réservation / de déplacement, ou paiement demandé par l'artisan).
// Le client n'a pas de compte : le jeton du lien suffit. Montant, artisan et conditions viennent TOUJOURS du serveur.
// Toute donnée reçue est affichée avec textContent : jamais interprétée comme du HTML.
(function () {
  'use strict';
  var API = 'https://uzgboxfxpxazhysusewv.supabase.co/functions/v1/creer-paiement-prestation';
  var STRIPE_PUBLIC_KEY = 'pk_live_51TWxxBJPTOXXy1ykTYLysvDCbnnJUXzqbc164Wif38u1g7BijiOLdUWKD8HPlQBX7he8K76aZNMUARo14yuQhzdQ000WVXdeEF';
  var PAGE_ANNULER = 'annuler-reservation.html';
  var SITE_RETOUR = 'https://caralink.app/artisans/';
  var token = new URLSearchParams(location.search).get('token') || '';
  var racine = document.getElementById('contenu');
  var SUPABASE_URL = 'https://uzgboxfxpxazhysusewv.supabase.co';
  var SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV6Z2JveGZ4cHhhemh5c3VzZXd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkyMzI4NzUsImV4cCI6MjEwNDgwODg3NX0.zHWjsI4jH26I41R3oe8wDL4GazTWspxUdjQCe-fW7eQ';
  var PAGE_COMPTE = 'compte.html?retour=' + encodeURIComponent(location.href); // le lien de paiement complet (avec son jeton) : après connexion, le client revient ici
  var infos = null, stripe = null, elements = null;
  var choix = { code: '', credit: false }; // ce que le client a demandé ; le prix, lui, est toujours recalculé par le serveur

  // Le jeton de connexion du client (même site que compte.html). Expiré ? renouvelé ; impossible ? on paie comme invité.
  async function jetonClient() {
    var cle = 'sb-uzgboxfxpxazhysusewv-auth-token';
    try {
      var o = JSON.parse(localStorage.getItem(cle) || 'null');
      if (!o || !o.access_token) return null;
      if (o.expires_at && o.expires_at * 1000 > Date.now() + 30000) return o.access_token;
      if (!o.refresh_token) return null;
      var r = await fetch(SUPABASE_URL + '/auth/v1/token?grant_type=refresh_token', { method: 'POST', headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON }, body: JSON.stringify({ refresh_token: o.refresh_token }) });
      if (!r.ok) return null;
      var n = await r.json();
      if (!n.access_token) return null;
      o.access_token = n.access_token; o.refresh_token = n.refresh_token || o.refresh_token; o.expires_at = n.expires_at || (Math.floor(Date.now() / 1000) + (n.expires_in || 3600)); if (n.user) o.user = n.user;
      try { localStorage.setItem(cle, JSON.stringify(o)); } catch (e) {}
      return o.access_token;
    } catch (e) { return null; }
  }

  function el(tag, classe, texte) { var n = document.createElement(tag); if (classe) n.className = classe; if (texte != null) n.textContent = texte; return n; }
  function ecran() { racine.textContent = ''; for (var i = 0; i < arguments.length; i++) if (arguments[i]) racine.appendChild(arguments[i]); }
  function euros(n) { return Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'; }
  function message(titre, texte, ton) { ecran(el('h1', ton || 'neutre', titre), el('p', '', texte)); }

  async function appel(corps) {
    var extra = { token: token };
    if (corps.action === 'infos' || corps.action === 'payer') {
      var jeton = await jetonClient();
      if (jeton) extra.access_token = jeton;
      if (choix.code) extra.code_promo = choix.code;
      if (choix.credit) extra.utiliser_credit = true;
    }
    var res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign(extra, corps)) });
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok || data.error) { var e = new Error(data.error || 'Une erreur est survenue. Réessayez dans un instant.'); e.statut = res.status; throw e; }
    return data;
  }

  function resume() {
    var r = el('div', 'resume');
    r.appendChild(el('div', '', infos.artisan));
    if (infos.date_affichee) r.appendChild(el('div', '', 'Rendez-vous : ' + infos.date_affichee + (infos.heure ? ' à ' + infos.heure : '')));
    if (infos.description && infos.type === 'solde') r.appendChild(el('div', '', infos.description));
    return r;
  }

  // Détail du prix (paiement final seulement) : prix, remise, crédit, à payer.
  function ligne(libelle, valeur, classe) { var l = el('div', 'ligne' + (classe ? ' ' + classe : '')); l.appendChild(el('span', '', libelle)); l.appendChild(el('span', '', valeur)); return l; }
  function detailPrix() {
    var d = el('div', 'detail');
    d.appendChild(ligne('Prix de la prestation', euros(infos.montant_brut)));
    if (infos.remise > 0) {
      var libelle = infos.remise_origine === 'geste' ? '🤝 Geste commercial de ' + infos.artisan : infos.remise_origine === 'code' ? 'Code promo' : 'Remise « client fidèle »' + (infos.fidele_pct ? ' (' + infos.fidele_pct + ' %)' : '');
      d.appendChild(ligne(libelle, '− ' + euros(infos.remise), 'vert'));
      if (infos.remise_origine === 'geste' && infos.remise_motif) d.appendChild(el('div', 'motif', infos.remise_motif));
    }
    if (infos.credit_applique > 0) d.appendChild(ligne('Votre crédit CaraLink', '− ' + euros(infos.credit_applique), 'vert'));
    d.appendChild(ligne('À payer', euros(infos.montant), 'total'));
    return d;
  }
  var MSG_CODE = { invalide: "Ce code n'est pas valable pour cet artisan.", hors_perimetre: "Ce code est réservé aux achats de la boutique : il ne s'applique pas aux interventions.", deja_utilise: 'Vous avez déjà utilisé ce code chez cet artisan : il ne sert qu\'une fois.', connexion_requise: 'Connectez-vous à votre compte CaraLink pour utiliser un code promo.', geste_remplace: 'Le geste commercial de votre artisan remplace les codes promo : il est déjà appliqué.', fidele_plus_avantageuse: 'Votre remise « client fidèle » est plus avantageuse : elle est appliquée, votre code reste utilisable une prochaine fois.' };
  async function recalculer() { try { infos = await appel({ action: 'infos' }); } catch (e) { /* on garde l'écran */ } afficherPaiement(); }
  function optionsRemise() {
    var z = el('div', 'options');
    if (!infos.connecte) {
      var a = el('a', 'lien-compte', 'Vous avez un compte CaraLink ? Connectez-vous pour utiliser un code promo ou votre crédit.'); a.href = PAGE_COMPTE; z.appendChild(a);
      if (infos.cashback_pct) z.appendChild(el('p', 'astuce', 'Avec un compte CaraLink, ' + infos.cashback_pct + ' % de ce paiement vous est rendu en crédit chez ' + infos.artisan + '.'));
      return z;
    }
    if (infos.credit_disponible > 0) {
      var lab = el('label', 'case'); var cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = choix.credit;
      lab.appendChild(cb); lab.appendChild(el('span', '', 'Utiliser mon crédit chez ' + infos.artisan + ' (' + euros(infos.credit_disponible) + ' disponibles)'));
      cb.addEventListener('change', function () { choix.credit = cb.checked; recalculer(); });
      z.appendChild(lab);
    }
    var geste = infos.remise_origine === 'geste';
    var rang = el('div', 'rang-code'); var inp = document.createElement('input'); inp.type = 'text'; inp.placeholder = 'Code promo'; inp.maxLength = 40; inp.value = choix.code; inp.setAttribute('aria-label', 'Code promo'); inp.autocomplete = 'off';
    var ok = el('button', 'secondaire', 'Appliquer'); ok.type = 'button';
    ok.addEventListener('click', function () { choix.code = inp.value.trim(); recalculer(); });
    rang.appendChild(inp); rang.appendChild(ok); if (!geste) z.appendChild(rang); // un geste commercial de l'artisan remplace les codes
    if (geste) z.appendChild(el('p', 'astuce', 'Ce geste commercial remplace les autres remises. Votre crédit CaraLink reste utilisable en plus.'));
    if (choix.code && infos.code_statut && infos.code_statut !== 'ok') z.appendChild(el('p', 'alerte', MSG_CODE[infos.code_statut] || 'Code non appliqué.'));
    if (infos.cashback_pct) z.appendChild(el('p', 'astuce', infos.cashback_pct + ' % de ce paiement vous seront rendus en crédit chez ' + infos.artisan + '.'));
    return z;
  }

  function afficherPaiement() {
    var titre = infos.type === 'reservation' ? (infos.nature === 'frais de déplacement' ? 'Régler les frais de déplacement' : 'Régler les frais de réservation') : 'Régler votre prestation';
    var m = el('div', 'montant', euros(infos.montant));
    var solde = infos.type === 'solde';
    var btn = el('button', 'principal', infos.type === 'reservation' ? 'Continuer vers le paiement' : 'Payer ' + euros(infos.montant));
    btn.type = 'button';
    var err = el('div', 'alerte'); err.style.display = 'none'; err.setAttribute('role', 'alert');
    var cases = [];
    var enfants = solde ? [el('h1', '', titre), resume(), detailPrix(), optionsRemise()] : [el('h1', '', titre), m, resume()];

    if (infos.type === 'reservation') {
      enfants.push(el('p', '', "L'artisan ne verra votre demande qu'une fois ce paiement effectué."));
      (infos.conditions || []).forEach(function (txt) {
        var lab = el('label', 'case'); var cb = document.createElement('input'); cb.type = 'checkbox';
        lab.appendChild(cb); lab.appendChild(el('span', '', txt)); cases.push(cb); enfants.push(lab);
      });
      btn.disabled = true;
      cases.forEach(function (c) { c.addEventListener('change', function () { btn.disabled = !cases.every(function (x) { return x.checked; }); }); });
    }
    enfants.push(err, btn, el('p', 'secu', '🔒 Paiement sécurisé par carte (Stripe). Vos coordonnées bancaires ne sont jamais vues par CaraLink.'));
    ecran.apply(null, enfants);

    btn.addEventListener('click', async function () {
      err.style.display = 'none'; btn.disabled = true; btn.textContent = 'Préparation…';
      try {
        var data = await appel({ action: 'payer', accepte: infos.type === 'reservation' ? true : undefined });
        if (data.montant != null) infos.montant = Number(data.montant);
        afficherFormulaire(data, titre);
      } catch (e) {
        err.textContent = e.message; err.style.display = 'block';
        btn.disabled = false; btn.textContent = infos.type === 'reservation' ? 'Continuer vers le paiement' : 'Payer ' + euros(infos.montant);
        if (e.statut === 409 || e.statut === 410) charger();
      }
    });
  }

  function afficherFormulaire(data, titre) {
    stripe = Stripe(STRIPE_PUBLIC_KEY, { stripeAccount: data.stripe_account });
    elements = stripe.elements({ clientSecret: data.client_secret });
    var zone = el('div'); zone.id = 'element';
    var err = el('div', 'alerte'); err.style.display = 'none'; err.setAttribute('role', 'alert');
    var btn = el('button', 'principal', 'Payer ' + euros(infos.montant)); btn.type = 'button';
    ecran(el('h1', '', titre), infos.type === 'solde' ? detailPrix() : el('div', 'montant', euros(infos.montant)), resume(), zone, err, btn, el('p', 'secu', '🔒 Paiement sécurisé par carte (Stripe).'));
    elements.create('payment').mount('#element');
    btn.addEventListener('click', async function () {
      err.style.display = 'none'; btn.disabled = true; btn.textContent = 'Paiement en cours…';
      var r = await stripe.confirmPayment({ elements: elements, redirect: 'if_required', confirmParams: { return_url: location.origin + location.pathname + '?token=' + encodeURIComponent(token) } });
      if (r.error) { err.textContent = r.error.message || 'Le paiement a échoué.'; err.style.display = 'block'; btn.disabled = false; btn.textContent = 'Payer ' + euros(infos.montant); return; }
      afficherSucces();
    });
  }

  function afficherSucces() {
    var enfants = [el('h1', 'ok', '✅ Paiement reçu')];
    if (infos.type === 'reservation') {
      enfants.push(el('p', '', 'Merci ! Votre demande vient d\'être transmise à ' + infos.artisan + '. Vous recevrez un email dès qu\'il aura confirmé le rendez-vous. S\'il refuse ou ne peut pas l\'honorer, vous êtes remboursé(e) intégralement et automatiquement.'));
      if (infos.nature !== 'frais de déplacement') enfants.push(el('p', '', 'Ces frais sont déduits du prix final de l\'intervention.'));
      var a = el('a', 'lien', 'Annuler ma réservation'); a.href = PAGE_ANNULER + '?token=' + encodeURIComponent(token); enfants.push(a);
      var retour = el('a', 'lien', 'Revenir à CaraLink'); retour.href = SITE_RETOUR; enfants.push(retour);
    } else {
      enfants.push(el('p', '', 'Merci ! ' + infos.artisan + ' est prévenu de votre paiement. Un reçu vous est envoyé par email.'));
      var retour2 = el('a', 'lien', 'Revenir à CaraLink'); retour2.href = SITE_RETOUR; enfants.push(retour2);
    }
    ecran.apply(null, enfants);
  }

  async function charger() {
    if (!/^[0-9a-f-]{36}$/i.test(token)) { message('Lien incorrect', 'Ce lien de paiement est incomplet. Ouvrez-le depuis l\'email que vous avez reçu.', 'erreur'); return; }
    try {
      infos = await appel({ action: 'infos' });
      if (['paye', 'partiellement_rembourse', 'rembourse'].indexOf(infos.statut) >= 0) {
        if (new URLSearchParams(location.search).get('redirect_status') === 'succeeded' || infos.statut === 'paye') afficherSucces(); else message('Paiement déjà réglé', 'Ce paiement a déjà été effectué.', 'neutre');
        return;
      }
      if (infos.statut === 'expire') { message('Lien expiré', infos.type === 'solde' ? 'Ce lien de paiement n\'est plus valable. Contactez ' + infos.artisan + ' : il pourra vous envoyer un nouveau lien.' : 'Ce lien n\'est plus valable. Refaites votre demande depuis la fiche de l\'artisan sur CaraLink.', 'neutre'); return; }
      if (infos.statut === 'annule') { message('Demande annulée', 'Cette demande a été annulée : rien n\'est à payer.', 'neutre'); return; }
      if (new URLSearchParams(location.search).get('redirect_status') === 'succeeded') { message('Paiement en cours de vérification', 'Votre paiement est en cours de traitement. Vous recevrez un email de confirmation dans quelques instants.', 'neutre'); return; }
      afficherPaiement();
    } catch (e) {
      message(e.statut === 404 ? 'Lien introuvable' : 'Une erreur est survenue', e.message, 'erreur');
    }
  }
  charger();
})();
