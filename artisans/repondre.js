// CaraLink Artisans — page « Confirmer / Refuser un créneau » (ouverte depuis l'email envoyé à l'artisan).
// Toute donnée reçue est affichée avec textContent : jamais interprétée comme du HTML.
(function () {
  'use strict';
  var API = 'https://uzgboxfxpxazhysusewv.supabase.co/functions/v1/repondre-devis';
  var MPA = 'https://caralink.app/mpa/';
  var params = new URLSearchParams(location.search);
  var token = params.get('token') || '';
  var action = params.get('action') || '';
  var racine = document.getElementById('contenu');

  function el(tag, classe, texte) {
    var n = document.createElement(tag);
    if (classe) n.className = classe;
    if (texte != null) n.textContent = texte;
    return n;
  }
  function ecran() {
    racine.textContent = '';
    for (var i = 0; i < arguments.length; i++) if (arguments[i]) racine.appendChild(arguments[i]);
  }
  function message(titre, texte, ton, avecMpa, reessayer) {
    var enfants = [el('h1', ton || 'neutre', titre), el('p', '', texte)];
    if (reessayer) {
      var b = el('button', 'principal', 'Réessayer');
      b.type = 'button';
      b.addEventListener('click', charger);
      enfants.push(b);
    }
    if (avecMpa) {
      var a = el('a', 'bouton', 'Ouvrir mon espace MPA Artisans');
      a.href = MPA;
      enfants.push(a);
    }
    ecran.apply(null, enfants);
  }
  function titreErreur(code) {
    return code === 'introuvable' ? 'Lien introuvable' : code === 'invalide' ? 'Lien invalide' : 'Une erreur est survenue';
  }

  function formulaire(infos) {
    var confirmer = action === 'confirmer';
    var titre = el('h1', confirmer ? 'ok' : 'neutre', confirmer ? 'Confirmer ce créneau' : 'Refuser ce créneau');
    var sous = el('p', 'sous', 'Rendez-vous du ' + infos.date_affichee + ' à ' + infos.heure + '. Vous pouvez laisser un message optionnel (pour préciser une contrainte, ou justifier un refus) — le client le recevra par email s\u2019il a laissé son adresse.');
    var champ = el('label', 'champ', 'Message pour le client (optionnel)');
    champ.setAttribute('for', 'message');
    var zone = el('textarea');
    zone.id = 'message';
    zone.rows = 4;
    zone.maxLength = 1000;
    zone.placeholder = 'Message optionnel…';
    if (!confirmer) zone.value = 'Désolé, ce créneau n\u2019est finalement plus disponible.';
    var erreur = el('div', 'alerte');
    erreur.setAttribute('role', 'alert');
    erreur.hidden = true;
    var bouton = el('button', 'principal ' + (confirmer ? 'vert' : 'gris'), confirmer ? '\u2705 Confirmer' : '\u274C Refuser');
    bouton.type = 'button';
    var enCours = false;
    bouton.addEventListener('click', function () {
      if (enCours) return;
      enCours = true;
      bouton.disabled = true;
      var libelle = bouton.textContent;
      bouton.textContent = 'Envoi…';
      erreur.hidden = true;
      fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: token, action: action, message: zone.value }) })
        .then(function (res) { return res.json().catch(function () { return {}; }).then(function (data) { return { res: res, data: data }; }); })
        .then(function (r) {
          if (r.res.ok && r.data.ok) {
            var notifie = r.data.client_notifie;
            if (r.data.resultat === 'confirme') {
              message('Créneau confirmé \u2705', 'L\u2019intervention a été ajoutée à votre planning MPA Artisans. ' + (notifie ? 'Le client a été notifié par email.' : 'Le client n\u2019avait pas laissé d\u2019adresse email : pensez à le contacter directement.'), 'ok', true);
            } else {
              message('Créneau refusé', 'C\u2019est noté — ce créneau a été refusé. ' + (notifie ? 'Le client a été notifié par email.' : ''), 'neutre');
            }
            return;
          }
          if (r.res.status === 409 || r.res.status === 410) { message(r.res.status === 410 ? 'Créneau passé' : 'Déjà traité', r.data.error || 'Cette proposition n\u2019est plus disponible.', 'neutre'); return; }
          throw new Error(r.data.error || 'Une erreur est survenue.');
        })
        .catch(function (e) {
          erreur.textContent = (e && e.message && e.message !== 'Failed to fetch') ? e.message : 'Connexion impossible — vérifiez votre connexion internet et réessayez.';
          erreur.hidden = false;
          bouton.disabled = false;
          bouton.textContent = libelle;
          enCours = false;
        });
    });
    ecran(titre, sous, champ, zone, erreur, bouton);
  }

  function charger() {
    ecran(el('p', 'chargement', 'Chargement…'));
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(token) || (action !== 'confirmer' && action !== 'refuser')) {
      message('Lien invalide', 'Ce lien de confirmation est incomplet ou incorrect.', 'erreur');
      return;
    }
    fetch(API + '?token=' + encodeURIComponent(token) + '&info=1')
      .then(function (res) { return res.json().catch(function () { return {}; }).then(function (data) { return { res: res, data: data }; }); })
      .then(function (r) {
        if (!r.res.ok) { message(titreErreur(r.data.code), r.data.error || 'Une erreur est survenue.', 'erreur', false, r.res.status >= 500); return; }
        if (r.data.statut !== 'creneau_propose') {
          message('Déjà traité', 'Cette proposition de créneau a été ' + (r.data.statut === 'creneau_confirme' ? 'déjà confirmée' : 'déjà traitée (refusée)') + ' — aucune action supplémentaire n\u2019est nécessaire.', 'neutre');
          return;
        }
        if (r.data.passe) { message('Créneau passé', 'Ce créneau est déjà passé : cette proposition n\u2019est plus valable. Le client peut faire une nouvelle demande.', 'neutre'); return; }
        formulaire(r.data);
      })
      .catch(function () { message('Connexion impossible', 'Vérifiez votre connexion internet, puis réessayez.', 'erreur', false, true); });
  }

  charger();
})();
