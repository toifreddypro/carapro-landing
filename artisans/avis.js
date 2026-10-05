// CaraLink Artisans — page « Donner son avis » (ouverte depuis l'email envoyé au client).
// Toute donnée reçue est affichée avec textContent / value : jamais interprétée comme du HTML.
(function () {
  'use strict';
  var API = 'https://uzgboxfxpxazhysusewv.supabase.co/functions/v1/soumettre-avis-artisan';
  var params = new URLSearchParams(location.search);
  var token = params.get('token') || '';
  var racine = document.getElementById('contenu');
  var CHEMIN_ETOILE = 'M12 2l2.9 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l7.1-1.01z';

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
  function message(titre, texte, ton, reessayer) {
    var enfants = [el('h1', ton || 'neutre', titre), el('p', '', texte)];
    if (reessayer) {
      var b = el('button', 'principal', 'Réessayer');
      b.type = 'button';
      b.addEventListener('click', charger);
      enfants.push(b);
    }
    ecran.apply(null, enfants);
  }
  function titreErreur(code) {
    return code === 'introuvable' ? 'Lien introuvable' : code === 'invalide' ? 'Lien invalide' : 'Une erreur est survenue';
  }
  function etoileSvg() {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    var p = document.createElementNS(ns, 'path');
    p.setAttribute('d', CHEMIN_ETOILE);
    svg.appendChild(p);
    return svg;
  }

  function formulaire(infos) {
    var dejaDonne = !!infos.deja_donne;
    var titre = el('h1', '', 'Votre avis sur ' + infos.artisan);
    var sous = el('p', 'sous', 'Intervention du ' + infos.date_affichee);

    var groupe = el('fieldset', 'etoiles');
    groupe.appendChild(el('legend', '', 'Votre note, de 1 à 5 étoiles'));
    var radios = [];
    function colorer() {
      var choisie = 0;
      radios.forEach(function (r) { if (r.checked) choisie = parseInt(r.value, 10); });
      radios.forEach(function (r, i) { r.nextSibling.setAttribute('class', i < choisie ? 'active' : ''); });
    }
    for (var n = 1; n <= 5; n++) {
      var lab = el('label');
      lab.title = n + ' étoile' + (n > 1 ? 's' : '');
      var radio = el('input');
      radio.type = 'radio';
      radio.name = 'note';
      radio.value = String(n);
      radio.setAttribute('aria-label', n + ' étoile' + (n > 1 ? 's' : '') + ' sur 5');
      if (infos.note === n) radio.checked = true;
      radio.addEventListener('change', function () { colorer(); erreur.hidden = true; });
      radios.push(radio);
      lab.appendChild(radio);
      lab.appendChild(etoileSvg());
      groupe.appendChild(lab);
    }

    var aide = dejaDonne ? el('p', 'aide', 'Vous avez déjà donné votre avis : vous pouvez le modifier jusqu\u2019à la fin du délai de 7 jours.') : null;
    var champ = el('label', 'champ', 'Un commentaire ? (optionnel)');
    champ.setAttribute('for', 'commentaire');
    var zone = el('textarea');
    zone.id = 'commentaire';
    zone.rows = 4;
    zone.maxLength = 1000;
    zone.placeholder = 'Un commentaire ? (optionnel)';
    zone.value = infos.commentaire || '';
    var compteur = el('p', 'compteur', zone.value.length + ' / 1000');
    zone.addEventListener('input', function () { compteur.textContent = zone.value.length + ' / 1000'; });
    var erreur = el('div', 'alerte');
    erreur.setAttribute('role', 'alert');
    erreur.hidden = true;
    var bouton = el('button', 'principal', dejaDonne ? 'Modifier mon avis' : 'Envoyer mon avis');
    bouton.type = 'button';
    var enCours = false;
    bouton.addEventListener('click', function () {
      if (enCours) return;
      var note = 0;
      radios.forEach(function (r) { if (r.checked) note = parseInt(r.value, 10); });
      if (!note) { erreur.textContent = 'Merci de choisir une note entre 1 et 5 étoiles.'; erreur.hidden = false; radios[0].focus(); return; }
      enCours = true;
      bouton.disabled = true;
      var libelle = bouton.textContent;
      bouton.textContent = 'Envoi…';
      erreur.hidden = true;
      fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: token, note: note, commentaire: zone.value }) })
        .then(function (res) { return res.json().catch(function () { return {}; }).then(function (data) { return { res: res, data: data }; }); })
        .then(function (r) {
          if (r.res.ok && r.data.ok) { message('Merci !', 'Votre avis a bien été enregistré. Vous pouvez revenir sur ce lien pendant 7 jours pour le modifier si besoin.', 'ok'); return; }
          if (r.res.status === 410) { message('Modification impossible', r.data.error || 'Le délai de 7 jours pour modifier votre avis est dépassé.', 'erreur'); return; }
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
    ecran(titre, sous, groupe, aide, champ, zone, compteur, erreur, bouton);
    colorer();
  }

  function charger() {
    ecran(el('p', 'chargement', 'Chargement…'));
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(token)) { message('Lien invalide', 'Ce lien d\u2019avis est incomplet ou incorrect.', 'erreur'); return; }
    fetch(API + '?token=' + encodeURIComponent(token) + '&info=1')
      .then(function (res) { return res.json().catch(function () { return {}; }).then(function (data) { return { res: res, data: data }; }); })
      .then(function (r) {
        if (!r.res.ok) { message(titreErreur(r.data.code), r.data.error || 'Une erreur est survenue.', 'erreur', r.res.status >= 500); return; }
        if (r.data.deja_donne && !r.data.modifiable) { message('Avis déjà envoyé', 'Vous avez déjà donné votre avis sur cette intervention, et le délai de 7 jours pour le modifier est dépassé. Merci pour votre retour !', 'neutre'); return; }
        formulaire(r.data);
      })
      .catch(function () { message('Connexion impossible', 'Vérifiez votre connexion internet, puis réessayez.', 'erreur', true); });
  }

  charger();
})();
