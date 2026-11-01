// CaraLink Artisans — désinscription d'un rappel d'entretien (lien reçu par email). Aucune connexion nécessaire : le jeton du lien suffit.
// Toute donnée reçue est affichée avec textContent : jamais interprétée comme du HTML.
(function () {
  'use strict';
  var SUPABASE_URL = 'https://uzgboxfxpxazhysusewv.supabase.co';
  var SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV6Z2JveGZ4cHhhemh5c3VzZXd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkyMzI4NzUsImV4cCI6MjEwNDgwODg3NX0.zHWjsI4jH26I41R3oe8wDL4GazTWspxUdjQCe-fW7eQ';
  var SITE = 'https://caralink.app/artisans/';
  var params = new URLSearchParams(location.search);
  var jeton = params.get('j') || '';
  var tout = params.get('tout') === '1';
  var racine = document.getElementById('contenu');
  var L = (navigator.language || 'fr').slice(0, 2);
  var TXT = {
    fr: { titre_ok: 'C\'est fait', tout: 'Vous ne recevrez plus aucun rappel d\'entretien de CaraLink.', un: 'Vous ne recevrez plus le rappel « {service} » de {artisan}.', rien: 'Lien incorrect', rien_t: 'Ce lien n\'est pas valable ou n\'existe plus.', err: 'Une erreur est survenue. Réessayez dans un instant.', annuler: 'Annuler : me réinscrire', tous: 'Ne plus recevoir AUCUN rappel d\'entretien', revenu: 'Vous êtes de nouveau inscrit(e) aux rappels.', retour: 'Revenir à CaraLink', info: 'Vous pouvez retrouver et gérer vos rappels dans « Mon compte » → « Mon carnet ».' },
    en: { titre_ok: 'Done', tout: 'You will no longer receive any maintenance reminder from CaraLink.', un: 'You will no longer receive the "{service}" reminder from {artisan}.', rien: 'Invalid link', rien_t: 'This link is not valid or no longer exists.', err: 'Something went wrong. Please try again in a moment.', annuler: 'Undo: sign me up again', tous: 'Stop ALL maintenance reminders', revenu: 'You are signed up for reminders again.', retour: 'Back to CaraLink', info: 'You can manage your reminders in "My account" → "My logbook".' },
    es: { titre_ok: 'Hecho', tout: 'Ya no recibirá ningún recordatorio de mantenimiento de CaraLink.', un: 'Ya no recibirá el recordatorio «{service}» de {artisan}.', rien: 'Enlace incorrecto', rien_t: 'Este enlace no es válido o ya no existe.', err: 'Ha ocurrido un error. Inténtelo de nuevo en un momento.', annuler: 'Deshacer: volver a suscribirme', tous: 'No recibir NINGÚN recordatorio de mantenimiento', revenu: 'Vuelve a estar suscrito/a a los recordatorios.', retour: 'Volver a CaraLink', info: 'Puede gestionar sus recordatorios en «Mi cuenta» → «Mi libreta».' }
  };
  var T = TXT[L] || TXT.fr;
  function el(tag, classe, texte) { var n = document.createElement(tag); if (classe) n.className = classe; if (texte != null) n.textContent = texte; return n; }
  function ecran() { racine.textContent = ''; for (var i = 0; i < arguments.length; i++) if (arguments[i]) racine.appendChild(arguments[i]); }
  function lien() { var a = el('a', 'lien', T.retour); a.href = SITE; return a; }

  async function preference(toutes, desinscrit) {
    var res = await fetch(SUPABASE_URL + '/rest/v1/rpc/carnet_preference', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON, 'Authorization': 'Bearer ' + SUPABASE_ANON },
      body: JSON.stringify({ p_jeton: jeton, p_tout: toutes, p_desinscrit: desinscrit })
    });
    if (!res.ok) throw new Error('http');
    return res.json();
  }

  function fait(r, toutes) {
    var phrase = toutes ? T.tout : T.un.replace('{service}', r.service || '').replace('{artisan}', r.artisan || '');
    var annuler = el('button', '', T.annuler); annuler.type = 'button';
    annuler.addEventListener('click', async function () {
      annuler.disabled = true;
      try { var x = await preference(toutes, false); if (x && x.ok) ecran(el('h1', 'ok', T.titre_ok), el('p', '', T.revenu), lien()); else throw new Error('x'); }
      catch (e) { annuler.disabled = false; alert(T.err); }
    });
    var enfants = [el('h1', 'ok', '✅ ' + T.titre_ok), el('p', '', phrase), annuler];
    if (!toutes) {
      var tous = el('button', '', T.tous); tous.type = 'button';
      tous.addEventListener('click', async function () {
        tous.disabled = true;
        try { var x = await preference(true, true); if (x && x.ok) fait(x, true); else throw new Error('x'); }
        catch (e) { tous.disabled = false; alert(T.err); }
      });
      enfants.push(tous);
    }
    enfants.push(el('p', '', T.info), lien());
    ecran.apply(null, enfants);
  }

  async function demarrer() {
    if (!/^[0-9a-f-]{36}$/i.test(jeton)) { ecran(el('h1', 'erreur', T.rien), el('p', '', T.rien_t), lien()); return; }
    try {
      var r = await preference(tout, true);
      if (!r || !r.ok) { ecran(el('h1', 'erreur', T.rien), el('p', '', T.rien_t), lien()); return; }
      fait(r, tout);
    } catch (e) { ecran(el('h1', 'erreur', T.err), lien()); }
  }
  demarrer();
})();
