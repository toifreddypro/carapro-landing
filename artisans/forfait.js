// CaraLink Artisans — page « forfait » : achat d'un forfait de séances (?s=identifiant du service), puis solde et réservation des jours (?t=jeton).
// Le client n'a pas de compte : le jeton du lien suffit. Prix, places et solde viennent TOUJOURS du serveur. Tout texte reçu est affiché avec textContent.
(function () {
  'use strict';
  var API = 'https://uzgboxfxpxazhysusewv.supabase.co/functions/v1/forfait-groupe';
  var STRIPE_PUBLIC_KEY = 'pk_live_51TWxxBJPTOXXy1ykTYLysvDCbnnJUXzqbc164Wif38u1g7BijiOLdUWKD8HPlQBX7he8K76aZNMUARo14yuQhzdQ000WVXdeEF';
  var params = new URLSearchParams(location.search);
  var serviceId = params.get('s') || '', token = params.get('t') || '';
  var racine = document.getElementById('contenu');
  var stripe = null, elements = null;

  function el(tag, classe, texte) { var n = document.createElement(tag); if (classe) n.className = classe; if (texte != null) n.textContent = texte; return n; }
  function ecran() { racine.textContent = ''; for (var i = 0; i < arguments.length; i++) if (arguments[i]) racine.appendChild(arguments[i]); }
  function euros(n) { return Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'; }
  function message(titre, texte, ton) { ecran(el('h1', ton || 'neutre', titre), el('p', '', texte)); }
  function jolieDate(iso, jour) { var p = iso.split('-'); return (jour ? jour.charAt(0).toUpperCase() + jour.slice(1) + ' ' : '') + p[2] + '/' + p[1] + '/' + p[0]; }
  function champ(type, placeholder, maxlength, label) { var i = document.createElement('input'); i.type = type; i.placeholder = placeholder; i.maxLength = maxlength; i.className = 'champ'; i.setAttribute('aria-label', label || placeholder); return i; }
  function texteAnnulation(a) { return a === 'gratuite_24h' ? 'Annulation gratuite jusqu\'à 24 h avant la séance (la séance est alors recréditée). Moins de 24 h avant, elle est due.' : 'Une séance réservée est due : elle n\'est ni remboursée ni recréditée en cas d\'annulation.'; }

  async function appel(corps) {
    var res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok || data.error) { var e = new Error(data.error || 'Une erreur est survenue. Réessayez dans un instant.'); e.statut = res.status; e.code = data.code; throw e; }
    return data;
  }

  // ───────── Achat ─────────
  async function chargerAchat() {
    try {
      var i = await appel({ action: 'infos_service', service_id: serviceId });
      if (!i.reservable) { message('Achat en ligne pas encore disponible', i.artisan + ' n\'a pas encore activé les paiements en ligne.', 'neutre'); return; }
      var r = el('div', 'resume');
      r.appendChild(el('div', '', i.artisan));
      r.appendChild(el('div', '', '📦 ' + i.nb_seances + ' séances · ' + euros(i.prix) + ' (soit ' + euros(i.prix_par_seance) + ' la séance)'));
      if (i.solo) r.appendChild(el('div', '', '🧍 Séances individuelles · vous choisissez vos créneaux dans l\'agenda du coach'));
      if (i.collectif) r.appendChild(el('div', '', '👥 Cours collectif · ' + i.places + ' places' + (i.jours.length ? ' · ' + i.jours.join(', ') + (i.heure ? ' à ' + i.heure : '') : '')));
      r.appendChild(el('div', '', 'Valable ' + i.validite_jours + ' jours à partir de l\'achat'));
      var nom = champ('text', 'Votre nom', 60), tel = champ('tel', 'Téléphone', 20), mail = champ('email', 'Email (pour retrouver votre forfait)', 120);
      var lab = el('label', 'case'); var cb = document.createElement('input'); cb.type = 'checkbox';
      lab.appendChild(cb); lab.appendChild(el('span', '', 'J\'ai compris : vous choisissez vos jours après l\'achat. ' + texteAnnulation(i.annulation)));
      var err = el('div', 'alerte'); err.style.display = 'none'; err.setAttribute('role', 'alert');
      var btn = el('button', 'principal', 'Continuer vers le paiement · ' + euros(i.prix)); btn.type = 'button'; btn.disabled = true;
      cb.addEventListener('change', function () { btn.disabled = !cb.checked; });
      ecran(el('h1', '', i.nom_service), r, nom, tel, mail, lab, err, btn, el('p', 'secu', '🔒 Paiement sécurisé par carte (Stripe). Vos coordonnées bancaires ne sont jamais vues par CaraLink.'));
      btn.addEventListener('click', async function () {
        err.style.display = 'none'; btn.disabled = true; btn.textContent = 'Préparation…';
        try {
          var d = await appel({ action: 'acheter', service_id: serviceId, nom: nom.value, telephone: tel.value, email: mail.value, accepte_conditions: true });
          formulairePaiement(d, i);
        } catch (e) { err.textContent = e.message; err.style.display = 'block'; btn.disabled = false; btn.textContent = 'Continuer vers le paiement · ' + euros(i.prix); }
      });
    } catch (e) { message(e.statut === 404 ? 'Forfait introuvable' : 'Une erreur est survenue', e.message, 'erreur'); }
  }

  function formulairePaiement(d, i) {
    stripe = Stripe(STRIPE_PUBLIC_KEY, { stripeAccount: d.stripe_account });
    elements = stripe.elements({ clientSecret: d.client_secret });
    var zone = el('div'); zone.id = 'element';
    var err = el('div', 'alerte'); err.style.display = 'none'; err.setAttribute('role', 'alert');
    var btn = el('button', 'principal', 'Payer ' + euros(i.prix)); btn.type = 'button';
    ecran(el('h1', '', i.nom_service), el('div', 'montant', euros(i.prix)), zone, err, btn, el('p', 'secu', '🔒 Paiement sécurisé par carte (Stripe).'));
    elements.create('payment').mount('#element');
    btn.addEventListener('click', async function () {
      err.style.display = 'none'; btn.disabled = true; btn.textContent = 'Paiement en cours…';
      var r = await stripe.confirmPayment({ elements: elements, redirect: 'if_required', confirmParams: { return_url: location.origin + location.pathname + '?t=' + encodeURIComponent(d.token) } });
      if (r.error) { err.textContent = r.error.message || 'Le paiement a échoué.'; err.style.display = 'block'; btn.disabled = false; btn.textContent = 'Payer ' + euros(i.prix); return; }
      location.href = location.pathname + '?t=' + encodeURIComponent(d.token) + '&merci=1';
    });
  }

  // ───────── Solde et réservation ─────────
  async function chargerSolde() {
    if (!/^[0-9a-f]{64}$/.test(token)) { message('Lien incorrect', 'Ce lien est incomplet. Ouvrez-le depuis l\'email que vous avez reçu.', 'erreur'); return; }
    try {
      var f = await appel({ action: 'lire', token: token });
      if (f.statut === 'en_attente') {
        var b = el('button', 'principal', 'Actualiser'); b.type = 'button'; b.addEventListener('click', chargerSolde);
        ecran(el('h1', 'neutre', 'Paiement en cours de vérification'), el('p', '', 'Votre paiement est en cours de traitement. Votre forfait sera actif dans quelques instants.'), b); return;
      }
      if (f.statut !== 'actif') { message('Forfait non actif', 'Ce forfait n\'est plus actif. Contactez ' + f.artisan + '.', 'neutre'); return; }
      afficherSolde(f);
    } catch (e) { message(e.statut === 404 ? 'Lien introuvable' : 'Une erreur est survenue', e.message, 'erreur'); }
  }

  function afficherSolde(f) {
    var enfants = [];
    if (params.get('merci')) enfants.push(el('p', 'alerte', '✅ Paiement reçu, merci ! Un email avec ce lien vous a été envoyé.')), enfants[0].style.cssText = 'background:#f0fdf4;border-color:#bbf7d0;color:#166534';
    enfants.push(el('h1', '', f.nom_service), el('p', '', f.artisan + ' · valable jusqu\'au ' + new Date(f.valable_jusqua).toLocaleDateString('fr-FR')));
    enfants.push(el('div', 'solde', f.solde + ' sur ' + f.nb_total), el('p', '', f.solde > 1 ? 'séances restantes' : 'séance restante'));
    var err = el('div', 'alerte'); err.style.display = 'none'; err.setAttribute('role', 'alert'); enfants.push(err);

    var reservees = f.seances.filter(function (s) { return s.statut === 'reservee'; });
    if (reservees.length) {
      enfants.push(el('h2', '', 'Mes séances réservées'));
      reservees.forEach(function (s) {
        var l = el('div', 'seance'); var t = el('div', '', jolieDate(s.date_seance) + ' à ' + s.heure);
        l.appendChild(t);
        if (f.annulation === 'gratuite_24h') {
          var x = el('button', '', 'Annuler'); x.type = 'button';
          x.addEventListener('click', async function () {
            x.disabled = true;
            try { await appel({ action: 'annuler', token: token, seance_id: s.id }); chargerSolde(); }
            catch (e) { err.textContent = e.message; err.style.display = 'block'; x.disabled = false; }
          });
          l.appendChild(x);
        }
        enfants.push(l);
      });
      if (f.annulation !== 'gratuite_24h') enfants.push(el('p', 'astuce', texteAnnulation(f.annulation)));
    }

    var lab = el('label', 'case'); var cb = document.createElement('input'); cb.type = 'checkbox';
    lab.appendChild(cb); lab.appendChild(el('span', '', 'Je comprends : ' + (f.annulation === 'gratuite_24h' ? 'une séance réservée est due, sauf annulation gratuite jusqu\'à 24 h avant.' : 'une séance réservée est due, sans remboursement ni recrédit si j\'annule.')));
    if (f.solde > 0) {
      enfants.push(el('h2', '', 'Réserver un jour'));
      if (f.solo) { var zoneSolo = el('div'); enfants.push(lab, zoneSolo); chargerCreneauxSolo(zoneSolo, cb, err, null); }
      else if (!f.disponibles.length) enfants.push(el('p', '', 'Aucune séance à venir pour le moment.'));
      else if (!f.solo) {
        enfants.push(lab);
        f.disponibles.forEach(function (s) {
          var deja = reservees.some(function (r) { return r.date_seance === s.date && r.heure === s.heure; });
          var complet = s.places_restantes <= 0;
          var l = el('div', 'seance' + (complet ? ' complet' : ''));
          var t = el('div', '', jolieDate(s.date, s.jour) + ' à ' + s.heure); t.appendChild(el('small', '', deja ? 'Vous êtes inscrit(e)' : complet ? 'Complet' : s.places_restantes + (s.places_restantes > 1 ? ' places restantes' : ' place restante')));
          l.appendChild(t);
          var bt = el('button', '', deja ? 'Inscrit' : complet ? 'Complet' : 'Réserver'); bt.type = 'button'; bt.disabled = complet || deja;
          bt.addEventListener('click', async function () {
            err.style.display = 'none';
            if (!cb.checked) { err.textContent = 'Cochez la case pour confirmer que la séance réservée est due.'; err.style.display = 'block'; return; }
            bt.disabled = true; bt.textContent = '…';
            try { await appel({ action: 'reserver', token: token, date: s.date, heure: s.heure, accepte: true }); chargerSolde(); }
            catch (e) { err.textContent = e.message; err.style.display = 'block'; if (e.code === 'complet') chargerSolde(); else { bt.disabled = false; bt.textContent = 'Réserver'; } }
          });
          l.appendChild(bt); enfants.push(l);
        });
      }
    } else enfants.push(el('p', '', 'Vous avez utilisé toutes les séances de ce forfait. Merci ! Vous pouvez en reprendre un sur la fiche de ' + f.artisan + '.'));
    ecran.apply(null, enfants);
  }


  // Séances individuelles : créneaux libres du coach, fenêtre par fenêtre.
  async function chargerCreneauxSolo(zone, cb, err, dateDebut) {
    zone.textContent = ''; zone.appendChild(el('p', 'chargement', 'Chargement des créneaux…'));
    try {
      var d = await appel({ action: 'creneaux_solo', token: token, date_debut: dateDebut || undefined });
      zone.textContent = '';
      if (!d.jours.length) zone.appendChild(el('p', '', 'Aucun créneau libre sur cette période.'));
      d.jours.forEach(function (j) {
        var l = el('div', 'seance'); l.style.flexWrap = 'wrap';
        l.appendChild(el('div', '', jolieDate(j.date, j.jour_label)));
        var rang = el('div'); rang.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap';
        j.creneaux.forEach(function (h) {
          var bt = el('button', '', h); bt.type = 'button';
          bt.addEventListener('click', async function () {
            err.style.display = 'none';
            if (!cb.checked) { err.textContent = 'Cochez la case pour confirmer que la séance réservée est due.'; err.style.display = 'block'; return; }
            bt.disabled = true;
            try { await appel({ action: 'reserver_solo', token: token, date: j.date, heure: h, accepte: true }); chargerSolde(); }
            catch (e) { err.textContent = e.message; err.style.display = 'block'; bt.disabled = false; if (e.code === 'complet') chargerCreneauxSolo(zone, cb, err, dateDebut); }
          });
          rang.appendChild(bt);
        });
        l.appendChild(rang); zone.appendChild(l);
      });
      var nav = el('div'); nav.style.cssText = 'display:flex;gap:8px;margin-top:6px';
      if (d.peut_reculer) { var b1 = el('button', 'secondaire', '← Avant'); b1.type = 'button'; b1.addEventListener('click', function () { var x = new Date(d.date_debut + 'T12:00:00'); x.setDate(x.getDate() - 5); chargerCreneauxSolo(zone, cb, err, x.toISOString().slice(0, 10)); }); nav.appendChild(b1); }
      if (d.peut_avancer) { var b2 = el('button', 'secondaire', 'Après →'); b2.type = 'button'; b2.addEventListener('click', function () { var x = new Date(d.date_debut + 'T12:00:00'); x.setDate(x.getDate() + 5); chargerCreneauxSolo(zone, cb, err, x.toISOString().slice(0, 10)); }); nav.appendChild(b2); }
      zone.appendChild(nav);
    } catch (e) { zone.textContent = ''; zone.appendChild(el('p', 'alerte', e.message)); }
  }

  if (token) chargerSolde(); else if (serviceId) chargerAchat(); else message('Lien incorrect', 'Ouvrez cette page depuis la fiche du coach ou depuis votre email.', 'erreur');
})();
