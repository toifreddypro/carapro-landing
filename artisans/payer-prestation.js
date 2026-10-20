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
  var infos = null, stripe = null, elements = null;

  function el(tag, classe, texte) { var n = document.createElement(tag); if (classe) n.className = classe; if (texte != null) n.textContent = texte; return n; }
  function ecran() { racine.textContent = ''; for (var i = 0; i < arguments.length; i++) if (arguments[i]) racine.appendChild(arguments[i]); }
  function euros(n) { return Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'; }
  function message(titre, texte, ton) { ecran(el('h1', ton || 'neutre', titre), el('p', '', texte)); }

  async function appel(corps) {
    var res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ token: token }, corps)) });
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

  function afficherPaiement() {
    var titre = infos.type === 'reservation' ? (infos.nature === 'frais de déplacement' ? 'Régler les frais de déplacement' : 'Régler les frais de réservation') : 'Régler votre prestation';
    var m = el('div', 'montant', euros(infos.montant));
    var btn = el('button', 'principal', infos.type === 'reservation' ? 'Continuer vers le paiement' : 'Payer ' + euros(infos.montant));
    btn.type = 'button';
    var err = el('div', 'alerte'); err.style.display = 'none'; err.setAttribute('role', 'alert');
    var cases = [];
    var enfants = [el('h1', '', titre), m, resume()];

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
    ecran(el('h1', '', titre), el('div', 'montant', euros(infos.montant)), resume(), zone, err, btn, el('p', 'secu', '🔒 Paiement sécurisé par carte (Stripe).'));
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
      if (infos.statut === 'expire') { message('Lien expiré', 'Ce lien n\'est plus valable. Refaites votre demande depuis la fiche de l\'artisan sur CaraLink.', 'neutre'); return; }
      if (infos.statut === 'annule') { message('Demande annulée', 'Cette demande a été annulée : rien n\'est à payer.', 'neutre'); return; }
      if (new URLSearchParams(location.search).get('redirect_status') === 'succeeded') { message('Paiement en cours de vérification', 'Votre paiement est en cours de traitement. Vous recevrez un email de confirmation dans quelques instants.', 'neutre'); return; }
      afficherPaiement();
    } catch (e) {
      message(e.statut === 404 ? 'Lien introuvable' : 'Une erreur est survenue', e.message, 'erreur');
    }
  }
  charger();
})();
