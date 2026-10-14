// CaraLink Artisans — page « Annuler ma réservation » (ouverte depuis l'email du client). Le jeton du lien prouve que c'est bien lui.
// Toute donnée reçue est affichée avec textContent : jamais interprétée comme du HTML.
(function () {
  'use strict';
  var API = 'https://uzgboxfxpxazhysusewv.supabase.co/functions/v1/annuler-reservation';
  var token = new URLSearchParams(location.search).get('token') || '';
  var racine = document.getElementById('contenu');

  function el(tag, classe, texte) { var n = document.createElement(tag); if (classe) n.className = classe; if (texte != null) n.textContent = texte; return n; }
  function ecran() { racine.textContent = ''; for (var i = 0; i < arguments.length; i++) if (arguments[i]) racine.appendChild(arguments[i]); }
  function euros(n) { return Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'; }
  function message(titre, texte, ton) { ecran(el('h1', ton || 'neutre', titre), el('p', '', texte)); }

  async function appel(action) {
    var res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: token, action: action }) });
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok || data.error) { var e = new Error(data.error || 'Une erreur est survenue. Réessayez dans un instant.'); e.statut = res.status; throw e; }
    return data;
  }

  function afficher(i) {
    var r = el('div', 'resume');
    r.appendChild(el('div', '', i.artisan));
    r.appendChild(el('div', '', 'Rendez-vous : ' + i.date_affichee + ' à ' + i.heure));
    if (i.paye) r.appendChild(el('div', '', 'Payé en ligne : ' + euros(i.montant) + ' (' + i.nature + ')'));

    var consequence;
    if (!i.paye) consequence = 'Aucun paiement n\'a été prélevé : l\'annulation est sans conséquence.';
    else if (i.sera_rembourse) consequence = i.confirme
      ? 'Vous annulez dans le délai gratuit : vous serez remboursé(e) intégralement (' + euros(i.montant) + ').'
      : 'L\'artisan n\'a pas encore confirmé : vous serez remboursé(e) intégralement (' + euros(i.montant) + ').';
    else consequence = 'Le délai d\'annulation gratuite est dépassé' + (i.limite_gratuite ? ' (c\'était jusqu\'au ' + i.limite_gratuite + ')' : '') + ' : les ' + euros(i.montant) + ' de ' + i.nature + ' resteront acquis à l\'artisan, conformément aux conditions que vous avez acceptées. Le rendez-vous sera tout de même annulé.';

    var err = el('div', 'alerte'); err.style.display = 'none'; err.setAttribute('role', 'alert');
    var btn = el('button', 'principal', 'Confirmer l\'annulation'); btn.type = 'button';
    ecran(el('h1', '', 'Annuler ma réservation'), r, el('p', '', consequence), err, btn);
    btn.addEventListener('click', async function () {
      err.style.display = 'none'; btn.disabled = true; btn.textContent = 'Annulation en cours…';
      try {
        var d = await appel('annuler');
        message('Réservation annulée', d.rembourse ? 'C\'est fait. Vous êtes remboursé(e) de ' + euros(d.montant) + ' : le remboursement apparaît sur votre carte sous quelques jours. Un email de confirmation vous est envoyé.' : (d.conserve ? 'C\'est fait. Votre rendez-vous est annulé. Les frais déjà réglés restent acquis à l\'artisan.' : 'C\'est fait. Votre demande est annulée.'), 'ok');
      } catch (e) { err.textContent = e.message; err.style.display = 'block'; btn.disabled = false; btn.textContent = 'Confirmer l\'annulation'; }
    });
  }

  (async function () {
    if (!/^[0-9a-f-]{36}$/i.test(token)) { message('Lien incorrect', 'Ce lien est incomplet. Ouvrez-le depuis l\'email que vous avez reçu.', 'erreur'); return; }
    try {
      var i = await appel('infos');
      if (i.deja_annule) { message('Déjà annulée', 'Cette réservation est déjà annulée.', 'neutre'); return; }
      if (i.passe) { message('Rendez-vous passé', 'Ce rendez-vous est déjà passé : il ne peut plus être annulé ici.', 'neutre'); return; }
      afficher(i);
    } catch (e) { message(e.statut === 404 ? 'Lien introuvable' : 'Une erreur est survenue', e.message, 'erreur'); }
  })();
})();
