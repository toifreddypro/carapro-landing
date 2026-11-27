// ═══════════════════════════════════════════════════════════
// CaraLink Artisans — carapro.js
// Propriété : TOI Freddy
// Structure et style repris fidèlement de plateforme.html/plateforme.js
// (même famille de produit, même concepteur) — logique métier propre à
// CaraLink Artisans V1 (annuaire + devis, jamais de calendrier de réservation,
// repoussé en V2). Tout le système de disponibilité/calendrier et la
// logique de rôle centre/formateur de plateforme.js ont été
// volontairement laissés de côté, sans objet ici.
//
// ⚠️ Ajouté le 14/09 — vraie traduction FR/EN/ES via tr-artisans.js
// (fonction T()), chargé avant ce fichier. Changer de langue recharge
// réellement nav/héro/résultats, jamais un simple message d'attente.
// ═══════════════════════════════════════════════════════════

const SUPABASE_URL  = 'https://uzgboxfxpxazhysusewv.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV6Z2JveGZ4cHhhemh5c3VzZXd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkyMzI4NzUsImV4cCI6MjEwNDgwODg3NX0.zHWjsI4jH26I41R3oe8wDL4GazTWspxUdjQCe-fW7eQ';

// ── Textes ajoutés le 15/10/2026 (paiement en ligne à la réservation) + filet de sécurité pour les textes de la fiche ──
// Fusion « seulement si absent » : un texte déjà présent dans tr-artisans.js n'est JAMAIS écrasé, un texte manquant s'affiche
// quand même (plutôt que son nom technique). Ainsi cette version marche quelle que soit la version de tr-artisans.js en ligne.
(function () {
  if (typeof AT_TR === 'undefined') return;
  var ajouts = {
    fr: {
      photos_securite: '🔒 Vos photos sont sécurisées : elles ne sont accessibles qu\'à vous et à l\'artisan consulté pour établir votre devis.',
      visite_frais_enligne: 'Frais de déplacement à régler en ligne pour réserver :',
      visite_mention_enligne: "Réglés maintenant, en ligne. Vous êtes remboursé(e) intégralement si l'artisan refuse ou ne peut pas venir.",
      reservation_frais_enligne: 'Frais de réservation à régler en ligne :',
      reservation_mention_enligne: "Réglés maintenant, en ligne. Ces frais sont déduits du prix final de l’intervention. Vous êtes remboursé(e) intégralement si l'artisan refuse ou annule.",
      annul_grat_1: 'Annulation gratuite jusqu’à ', annul_grat_2: ' h avant le rendez-vous.',
      annul_trop_tard_1: 'Ce créneau a lieu dans moins de ', annul_trop_tard_2: " h : l'annulation gratuite n'est plus possible. Si vous annulez, ces frais restent acquis à l'artisan.",
      annul_aucune: "Pas d'annulation gratuite : ces frais restent acquis à l'artisan si vous annulez.",
      err_email_paiement: "Une adresse email est nécessaire pour payer en ligne (votre reçu et le lien d'annulation y sont envoyés).",
      ph_email_paiement: 'Email (obligatoire — pour payer en ligne et recevoir votre reçu)',
      contact_titre: "Vos coordonnées (pour confirmer votre rendez-vous)", cmpt_connecte: "✓ Connecté : vos coordonnées sont préremplies depuis votre compte (vous pouvez les modifier).", cmpt_deja: "Déjà un compte client ?", cmpt_se_connecter: "Se connecter",
      err_nom_complet: "Merci d'indiquer votre prénom ET votre nom (ex. Marie Dupont) : l'artisan en a besoin pour vous reconnaître.",
      err_email_format: "Cette adresse email ne semble pas valide.",
      redirection_paiement: 'Redirection vers le paiement sécurisé…',
      fiche_indisponible_titre: 'Fiche indisponible', fiche_occupee_titre: 'Trop de visites en ce moment', fiche_erreur_titre: 'Une erreur est survenue',
      fiche_indisponible_texte: "Cet artisan n'est plus visible sur CaraLink ou le lien est incorrect.",
      fiche_occupee_texte: 'Beaucoup de personnes consultent les fiches en ce moment. Réessayez dans une minute.',
      fiche_erreur_texte: "La fiche n'a pas pu être chargée. Vérifiez votre connexion et réessayez.",
      fiche_voir_artisans: 'Voir les artisans', fiche_reessayer: 'Réessayer',
      partage_titre: 'Partager cette fiche', partage_fermer: 'Fermer', partage_texte_1: 'Découvrez ', partage_texte_2: ' sur CaraLink Artisans',
      partage_copier: 'Copier le lien', partage_whatsapp: 'WhatsApp', partage_facebook: 'Facebook', partage_email: 'Email',
      partage_lien_copie: 'Lien copié ✓', partage_copie_manuelle: 'Copiez le lien ci-dessus', partage_bouton: 'Partager',
      type_visite: 'Rendez-vous sur place', type_renseignement: 'Renseignement simple',
      type_renseignement_desc: 'Posez une question ou demandez un avis, sans rendez-vous ni déplacement.',
      type_visite_desc: "L'artisan se déplace pour estimer votre chantier et vous remettre un devis.",
      err_premiere_requise: 'Merci d’indiquer si c’est votre première intervention avec cet artisan.',
      err_type_requis: 'Merci de choisir la nature de votre demande.',
      visite_frais_variables: 'Les frais de déplacement dépendent de chaque artisan.',
      visite_frais: 'Frais de déplacement :', visite_sans_frais: 'Visite sans frais de déplacement.',
      visite_mention: "Le devis définitif des travaux vous est remis par l'artisan après sa visite.",
      visite_pas_de_creneaux: 'Choisissez un créneau dans les disponibilités de cet artisan.',
      fermeture_vacances: 'Vacances', fermeture_fermeture: 'Fermeture exceptionnelle', fermeture_inventaire: 'Inventaire', fermeture_formation: 'Formation', fermeture_autre: 'Indisponible',
      premiere_titre: 'Première intervention avec cet artisan ?',
      premiere_texte: "Pour un nouveau chantier, l'artisan doit d'abord se déplacer pour l'estimer.",
      premiere_oui: "Oui, c'est la première fois (devis / rendez-vous sur place)", premiere_non: "Non, je connais déjà cet artisan (réservation directe)",
      visite_choisir_creneau: 'Choisir un créneau de visite',
    },
    en: {
      photos_securite: '🔒 Your photos are secure: only you and the craftsman consulted for your quote can access them.',
      visite_frais_enligne: 'Call-out fee to pay online to book:',
      visite_mention_enligne: 'Paid now, online. You are fully refunded if the craftsman declines or cannot come.',
      reservation_frais_enligne: 'Booking fee to pay online:',
      reservation_mention_enligne: 'Paid now, online. These fees are deducted from the final price of the service. You are fully refunded if the craftsman declines or cancels.',
      annul_trop_tard_1: 'This slot is in less than ', annul_trop_tard_2: ' h: free cancellation is no longer possible. If you cancel, these fees are kept by the craftsman.',
      annul_grat_1: 'Free cancellation up to ', annul_grat_2: ' h before the appointment.',
      annul_aucune: 'No free cancellation: this fee is kept by the craftsman if you cancel.',
      err_email_paiement: 'An email address is required to pay online (your receipt and cancellation link are sent there).',
      ph_email_paiement: 'Email (required — to pay online and receive your receipt)',
      contact_titre: "Your details (to confirm your appointment)", cmpt_connecte: "✓ Signed in: your details are pre-filled from your account (you can edit them).", cmpt_deja: "Already have a customer account?", cmpt_se_connecter: "Sign in",
      err_nom_complet: "Please enter your first AND last name (e.g. Mary Smith): the craftsman needs it to recognise you.",
      err_email_format: "This email address doesn't look valid.",
      redirection_paiement: 'Redirecting to secure payment…',
      fiche_indisponible_titre: 'Profile unavailable', fiche_occupee_titre: 'Too many visits right now', fiche_erreur_titre: 'Something went wrong',
      fiche_indisponible_texte: 'This craftsman is no longer visible on CaraLink or the link is incorrect.',
      fiche_occupee_texte: 'Many people are viewing profiles right now. Please try again in a minute.',
      fiche_erreur_texte: 'The profile could not be loaded. Check your connection and try again.',
      fiche_voir_artisans: 'See craftsmen', fiche_reessayer: 'Try again',
      partage_titre: 'Share this profile', partage_fermer: 'Close', partage_texte_1: 'Discover ', partage_texte_2: ' on CaraLink Artisans',
      partage_copier: 'Copy link', partage_whatsapp: 'WhatsApp', partage_facebook: 'Facebook', partage_email: 'Email',
      partage_lien_copie: 'Link copied ✓', partage_copie_manuelle: 'Copy the link above', partage_bouton: 'Share',
      type_visite: 'On-site appointment', type_renseignement: 'Simple enquiry',
      type_renseignement_desc: 'Ask a question or get advice, with no appointment or visit.',
      type_visite_desc: 'The craftsman visits to assess your job and gives you a quote.',
      err_premiere_requise: 'Please tell us whether this is your first job with this craftsman.',
      err_type_requis: 'Please choose the nature of your request.',
      visite_frais_variables: 'Call-out fees depend on each craftsman.',
      visite_frais: 'Call-out fee:', visite_sans_frais: 'Visit with no call-out fee.',
      visite_mention: 'The final quote for the work is given by the craftsman after the visit.',
      visite_pas_de_creneaux: "Choose a slot in this craftsman's availability.",
      fermeture_vacances: 'Holiday', fermeture_fermeture: 'Closed', fermeture_inventaire: 'Stocktake', fermeture_formation: 'Training', fermeture_autre: 'Unavailable',
      premiere_titre: 'First job with this craftsman?',
      premiere_texte: 'For a new job, the craftsman first needs to visit to assess it.',
      premiere_oui: "Yes, it's the first time (quote / on-site appointment)", premiere_non: 'No, I already know this craftsman (direct booking)',
      visite_choisir_creneau: 'Choose a visit slot',
    },
    es: {
      photos_securite: '🔒 Tus fotos están protegidas: solo tú y el artesano consultado para tu presupuesto podéis acceder a ellas.',
      visite_frais_enligne: 'Gastos de desplazamiento a pagar en línea para reservar:',
      visite_mention_enligne: 'Se pagan ahora, en línea. Se le reembolsa íntegramente si el profesional rechaza o no puede ir.',
      reservation_frais_enligne: 'Gastos de reserva a pagar en línea:',
      reservation_mention_enligne: 'Se pagan ahora, en línea. Estos gastos se descuentan del precio final de la intervención. Se le reembolsa íntegramente si el profesional rechaza o cancela.',
      annul_trop_tard_1: 'Esta franja es dentro de menos de ', annul_trop_tard_2: ' h: ya no es posible la cancelación gratuita. Si cancela, el profesional se queda con estos gastos.',
      annul_grat_1: 'Cancelación gratuita hasta ', annul_grat_2: ' h antes de la cita.',
      annul_aucune: 'Sin cancelación gratuita: estos gastos quedan para el profesional si usted cancela.',
      err_email_paiement: 'Se necesita un correo electrónico para pagar en línea (allí se envían su recibo y el enlace de cancelación).',
      ph_email_paiement: 'Email (obligatorio — para pagar en línea y recibir su recibo)',
      contact_titre: "Sus datos (para confirmar su cita)", cmpt_connecte: "✓ Sesión iniciada: sus datos se han rellenado desde su cuenta (puede modificarlos).", cmpt_deja: "¿Ya tiene una cuenta de cliente?", cmpt_se_connecter: "Iniciar sesión",
      err_nom_complet: "Indique su nombre Y apellido (p. ej. María García): el profesional lo necesita para reconocerle.",
      err_email_format: "Este correo electrónico no parece válido.",
      redirection_paiement: 'Redirigiendo al pago seguro…',
      fiche_indisponible_titre: 'Ficha no disponible', fiche_occupee_titre: 'Demasiadas visitas ahora', fiche_erreur_titre: 'Ha ocurrido un error',
      fiche_indisponible_texte: 'Este profesional ya no es visible en CaraLink o el enlace es incorrecto.',
      fiche_occupee_texte: 'Mucha gente está consultando fichas ahora. Inténtelo de nuevo en un minuto.',
      fiche_erreur_texte: 'No se pudo cargar la ficha. Compruebe su conexión e inténtelo de nuevo.',
      fiche_voir_artisans: 'Ver profesionales', fiche_reessayer: 'Reintentar',
      partage_titre: 'Compartir esta ficha', partage_fermer: 'Cerrar', partage_texte_1: 'Descubra ', partage_texte_2: ' en CaraLink Artisans',
      partage_copier: 'Copiar enlace', partage_whatsapp: 'WhatsApp', partage_facebook: 'Facebook', partage_email: 'Email',
      partage_lien_copie: 'Enlace copiado ✓', partage_copie_manuelle: 'Copie el enlace de arriba', partage_bouton: 'Compartir',
      type_visite: 'Cita en el lugar', type_renseignement: 'Consulta sencilla',
      type_renseignement_desc: 'Haga una pregunta o pida una opinión, sin cita ni desplazamiento.',
      type_visite_desc: 'El profesional se desplaza para evaluar su obra y entregarle un presupuesto.',
      err_premiere_requise: 'Indique si es su primera intervención con este profesional.',
      err_type_requis: 'Elija la naturaleza de su solicitud.',
      visite_frais_variables: 'Los gastos de desplazamiento dependen de cada profesional.',
      visite_frais: 'Gastos de desplazamiento:', visite_sans_frais: 'Visita sin gastos de desplazamiento.',
      visite_mention: 'El presupuesto definitivo de la obra se entrega tras la visita.',
      visite_pas_de_creneaux: 'Elija un hueco en la disponibilidad de este profesional.',
      fermeture_vacances: 'Vacaciones', fermeture_fermeture: 'Cierre excepcional', fermeture_inventaire: 'Inventario', fermeture_formation: 'Formación', fermeture_autre: 'No disponible',
      premiere_titre: '¿Primera intervención con este profesional?',
      premiere_texte: 'Para una obra nueva, el profesional debe desplazarse primero para evaluarla.',
      premiere_oui: 'Sí, es la primera vez (presupuesto / cita en el lugar)', premiere_non: 'No, ya conozco a este profesional (reserva directa)',
      visite_choisir_creneau: 'Elegir un hueco de visita',
    },
  };
  ['fr', 'en', 'es'].forEach(function (l) {
    if (!AT_TR[l]) return;
    Object.keys(ajouts[l]).forEach(function (k) { if (!AT_TR[l][k]) AT_TR[l][k] = ajouts[l][k]; });
  });
})();

// Encode une valeur de façon sûre pour l'insérer dans un attribut onclick="...(ICI)" —
// gère absolument tous les caractères spéciaux (apostrophes, guillemets, retours à la
// ligne...), contrairement à un simple remplacement d'apostrophes qui casse facilement.
// Le & doit être échappé EN PREMIER : sinon un texte saisi par un artisan contenant "&quot;" serait décodé par le
// navigateur en vrai guillemet, refermerait la chaîne JavaScript et exécuterait du code chez le visiteur.
function jsAttr(val) {
  return JSON.stringify(val == null ? '' : String(val))
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Secteurs — chargés depuis la table `secteurs` (modifiable depuis l'admin),
// avec une liste de repli si jamais le chargement échoue (mode dégradé).
var _secteursCache = [
  { code:'jardinage', icon:'🌿', label_fr:'Jardinage' },
  { code:'plomberie', icon:'🔧', label_fr:'Plomberie' },
  { code:'electricite', icon:'⚡', label_fr:'Électricité' },
  { code:'peinture', icon:'🎨', label_fr:'Peinture' },
  { code:'maconnerie', icon:'🧱', label_fr:'Maçonnerie' },
  { code:'menuiserie', icon:'🪚', label_fr:'Menuiserie' },
  { code:'climatisation', icon:'❄️', label_fr:'Climatisation' },
  { code:'autre', icon:'✨', label_fr:'Autre' },
];

async function chargerSecteurs() {
  // Les deux listes (métiers, grands secteurs) sont demandées en même temps, pas l'une après l'autre.
  var entetes = { 'apikey': SUPABASE_ANON, 'Authorization': 'Bearer ' + SUPABASE_ANON };
  await Promise.all([
    (async function() {
      try {
        var res = await fetch(SUPABASE_URL + '/rest/v1/secteurs?select=*&order=ordre.asc', { headers: entetes });
        var data = await res.json();
        if (res.ok && Array.isArray(data) && data.length) _secteursCache = data;
      } catch (e) { console.warn('Chargement des secteurs échoué, liste de repli utilisée.', e); }
    })(),
    (async function() {
      // Grands secteurs (Beauté, BTP, Animaux…) : s'ils manquent, la recherche garde l'ancienne liste à plat (mode dégradé).
      try {
        var res2 = await fetch(SUPABASE_URL + '/rest/v1/secteurs_groupes?select=*&order=ordre.asc', { headers: entetes });
        var data2 = await res2.json();
        if (res2.ok && Array.isArray(data2) && data2.length) _groupesCache = data2;
      } catch (e) { console.warn('Chargement des grands secteurs échoué, liste à plat utilisée.', e); }
    })()
  ]);
}

// ── Deux niveaux : grand secteur (Beauté…) puis métier (Coiffeur…) ──
var _groupesCache = [];
function modeGroupes() { return _groupesCache.length > 0 && _secteursCache.some(function(s) { return s.groupe; }); }
function libelleDe(o) { return String(o[secteurLabelChamp()] || o.label_fr || o.code || ''); }
function groupesTries() {
  return _groupesCache.slice().sort(function(a, b) { return (a.ordre || 0) - (b.ordre || 0); });
}
function metiersDuGroupe(g) {
  return _secteursCache.filter(function(s) { return s.groupe === g; }).sort(function(a, b) {
    var aa = /^autre/.test(a.code) ? 1 : 0, bb = /^autre/.test(b.code) ? 1 : 0;
    if (aa !== bb) return aa - bb;
    return libelleDe(a).localeCompare(libelleDe(b), AT_LANG || 'fr', { sensitivity: 'base' });
  });
}
function groupeDe(code) { var s = _secteursCache.find(function(x) { return x.code === code; }); return s && s.groupe ? s.groupe : ''; }
function etiquetteGroupe(g) { var o = _groupesCache.find(function(x) { return x.code === g; }); return o ? ((o.icon || '') + ' ' + libelleDe(o)).trim() : ''; }
function valeurSecteur() { return _searchState.secteur ? 'm:' + _searchState.secteur : (_searchState.groupe ? 'g:' + _searchState.groupe : ''); }
// Lit le champ « Secteur » (liste sur ordinateur, champ caché sur téléphone) et met à jour le secteur / le métier choisis.
function lireChampSecteur() {
  var el = document.getElementById('search-secteur'), v = el ? el.value.trim() : '';
  if (!modeGroupes()) { _searchState.secteur = v; _searchState.groupe = ''; return; }
  if (v.indexOf('g:') === 0) {
    var g = v.slice(2);
    if (g !== _searchState.groupe) { _searchState.groupe = g; _searchState.secteur = ''; } // un autre secteur : on repart de tous ses métiers
  } else if (v.indexOf('m:') === 0) {
    _searchState.secteur = v.slice(2); _searchState.groupe = groupeDe(_searchState.secteur) || _searchState.groupe;
  } else { _searchState.groupe = ''; _searchState.secteur = ''; }
}
// Petites pastilles « Tous · Coiffeur · Esthéticienne… » pour affiner dans le secteur choisi.
function majPuces() {
  var z = document.getElementById('metier-puces');
  if (!z) return;
  if (!modeGroupes() || !_searchState.groupe) { z.innerHTML = ''; z.style.display = 'none'; return; }
  var puce = function(code, txt, actif) {
    return '<button type="button" class="metier-puce' + (actif ? ' on' : '') + '" onclick="choisirMetier(\'' + escHtml(code) + '\')">' + txt + '</button>';
  };
  z.innerHTML = puce('', escHtml(T('search_metier_tous')), !_searchState.secteur) +
    metiersDuGroupe(_searchState.groupe).map(function(s) { return puce(s.code, escHtml(libelleDe(s)), _searchState.secteur === s.code); }).join('');
  z.style.display = 'flex';
}
function choisirMetier(code) {
  _searchState.secteur = code || '';
  var el = document.getElementById('search-secteur');
  if (el && el.tagName === 'INPUT') el.value = valeurSecteur();   // téléphone : champ caché à jour (la liste de l'ordinateur reste sur le grand secteur)
  majPuces();
  lancerRecherche(true);
}
function secteurSelectChange() { lireChampSecteur(); majPuces(); rechercheAuto(true); }

// Secteurs dans l'ordre alphabétique (« Autre » toujours en dernier) — l'ordre de la base ne sert plus à l'affichage de la recherche.
function secteursTries() {
  var champ = secteurLabelChamp();
  var nom = function(s) { return String(s[champ] || s.label_fr || s.code || ''); };
  // Liste à plat (mode dégradé) : les « Autre métier » de chaque grand secteur n'ont de sens que dans la liste à deux niveaux.
  return _secteursCache.filter(function(s) { return !/^autre-/.test(s.code); }).sort(function(a, b) {
    var aa = a.code === 'autre' ? 1 : 0, bb = b.code === 'autre' ? 1 : 0;
    if (aa !== bb) return aa - bb;
    return nom(a).localeCompare(nom(b), AT_LANG || 'fr', { sensitivity: 'base' });
  });
}
function sansAccents(t) { return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
// Téléphone : champ qui se filtre pendant qu'on tape (« plomb » → Plomberie). Le champ caché #search-secteur garde le code,
// donc tout le reste de la recherche fonctionne sans changement.
function htmlChampSecteurTel() {
  var actuel = _secteursCache.find(function(s) { return s.code === _searchState.secteur; });
  var texte = actuel ? ((actuel.icon || '') + ' ' + (actuel[secteurLabelChamp()] || actuel.label_fr)).trim() : (_searchState.groupe ? etiquetteGroupe(_searchState.groupe) : '');
  return '<div class="sect-combo">' +
    '<input id="search-secteur-txt" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="' + escHtml(T('search_secteur_tous')) + '" value="' + escHtml(texte) + '" onfocus="secteurOuvrir()" oninput="secteurFiltrer()" onkeydown="if(event.key===\'Enter\'){secteurPremier();return false;}"/>' +
    '<input id="search-secteur" type="hidden" value="' + escHtml(modeGroupes() ? valeurSecteur() : (_searchState.secteur || '')) + '"/></div>';
}
function secteurOuvrir() {
  var champ = document.getElementById('search-secteur-txt'); if (champ) champ.select();
  secteurFiltrer(true);
}
function secteurFiltrer(toutMontrer) {
  var champ = document.getElementById('search-secteur-txt'), liste = document.getElementById('sect-liste');
  if (!champ) return;
  // La bulle vit directement dans la page (pas dans le cadre de recherche, qui la coupe).
  if (!liste) { liste = document.createElement('div'); liste.id = 'sect-liste'; liste.className = 'sect-liste'; liste.style.display = 'none'; document.body.appendChild(liste); }
  var q = toutMontrer ? '' : sansAccents(champ.value.trim());
  if (!toutMontrer && !q) { document.getElementById('search-secteur').value = ''; }
  var champLib = secteurLabelChamp();
  var html = '';
  if (modeGroupes()) {
    // Sans texte : les grands secteurs. Avec du texte : les secteurs ET les métiers qui correspondent (« coiff » → Coiffeur, « bât » → BTP).
    if (!q) html += '<div class="sect-item sect-tous" onmousedown="event.preventDefault()" onclick="secteurChoisir(\'\')">' + escHtml(T('search_secteur_tous')) + '</div>';
    groupesTries().forEach(function(g) {
      var metiers = metiersDuGroupe(g.code);
      var gOk = !q || sansAccents(libelleDe(g)).indexOf(q) !== -1;
      if (gOk) html += '<div class="sect-item sect-groupe" data-v="g:' + escHtml(g.code) + '" onmousedown="event.preventDefault()" onclick="secteurChoisir(\'g:' + escHtml(g.code) + '\')"><span class="sect-ic">' + (g.icon || '') + '</span>' + escHtml(libelleDe(g)) + '</div>';
      if (q) metiers.forEach(function(s) {
        if (/^autre/.test(s.code) || sansAccents(libelleDe(s)).indexOf(q) === -1) return;
        html += '<div class="sect-item" data-v="m:' + escHtml(s.code) + '" onmousedown="event.preventDefault()" onclick="secteurChoisir(\'m:' + escHtml(s.code) + '\')"><span class="sect-ic">' + (s.icon || '') + '</span>' + escHtml(libelleDe(s)) + '<small>' + escHtml(libelleDe(g)) + '</small></div>';
      });
    });
    if (q && !html) html = '<div class="sect-vide">' + escHtml(T('search_secteur_aucun')) + '</div>';
  } else {
    var items = secteursTries().filter(function(s) { return !q || sansAccents(s[champLib] || s.label_fr).indexOf(q) !== -1; });
    if (!q) html += '<div class="sect-item sect-tous" onmousedown="event.preventDefault()" onclick="secteurChoisir(\'\')">' + escHtml(T('search_secteur_tous')) + '</div>';
    html += items.map(function(s) {
      return '<div class="sect-item" data-v="' + escHtml(s.code) + '" onmousedown="event.preventDefault()" onclick="secteurChoisir(\'' + escHtml(s.code) + '\')"><span class="sect-ic">' + (s.icon || '') + '</span>' + escHtml(s[champLib] || s.label_fr) + '</div>';
    }).join('');
    if (!items.length) html += '<div class="sect-vide">Aucun métier ne correspond. Essayez un autre mot.</div>';
  }
  liste.innerHTML = html;
  liste.style.display = 'block';
  secteurPlacer();
}
// La bulle est posée sur l'écran (et non dans le cadre de recherche, qui la coupait) : sous le champ, aussi large que l'écran,
// et jamais plus haute que la place restante au-dessus du clavier — le dernier métier reste atteignable en faisant défiler.
function secteurPlacer() {
  var liste = document.getElementById('sect-liste'), champ = document.getElementById('search-secteur-txt');
  if (!liste || !champ || liste.style.display === 'none') return;
  var vv = window.visualViewport, haut = vv ? vv.height : window.innerHeight, larg = vv ? vv.width : window.innerWidth;
  var r = champ.getBoundingClientRect();
  var top = r.bottom + 16;
  liste.style.position = 'fixed';
  liste.style.top = top + 'px'; liste.style.left = '16px'; liste.style.width = (larg - 32) + 'px';
  liste.style.maxHeight = Math.max(150, haut - top - 12) + 'px';
}
window.addEventListener('scroll', secteurPlacer, { passive: true });
if (window.visualViewport) window.visualViewport.addEventListener('resize', secteurPlacer);
function secteurChoisir(val) {
  var champ = document.getElementById('search-secteur-txt'), cache = document.getElementById('search-secteur'), liste = document.getElementById('sect-liste');
  val = val || '';
  var etiq = '';
  if (modeGroupes()) {
    if (val.indexOf('g:') === 0) { _searchState.groupe = val.slice(2); _searchState.secteur = ''; etiq = etiquetteGroupe(_searchState.groupe); }
    else if (val.indexOf('m:') === 0) {
      var m = _secteursCache.find(function(x) { return x.code === val.slice(2); });
      _searchState.secteur = val.slice(2); _searchState.groupe = (m && m.groupe) || '';
      etiq = m ? ((m.icon || '') + ' ' + libelleDe(m)).trim() : '';
    } else { _searchState.groupe = ''; _searchState.secteur = ''; }
    if (cache) cache.value = valeurSecteur();
  } else {
    var s = val ? _secteursCache.find(function(x) { return x.code === val; }) : null;
    _searchState.secteur = val; if (cache) cache.value = val;
    etiq = s ? ((s.icon || '') + ' ' + (s[secteurLabelChamp()] || s.label_fr)).trim() : '';
  }
  if (champ) { champ.value = etiq; champ.blur(); }
  if (liste) liste.style.display = 'none';
  majPuces();
  rechercheAuto(true);
}
function secteurPremier() {
  var champ = document.getElementById('search-secteur-txt');
  // Champ vide : on ne choisit rien à la place du client, on referme et on relance (la zone reste vide s'il n'y a plus aucun critère).
  if (!champ || !champ.value.trim()) { secteurChoisir(''); return; }
  var premier = document.querySelector('#sect-liste .sect-item[data-v]');
  if (premier) secteurChoisir(premier.getAttribute('data-v'));
}
document.addEventListener('click', function(e) {
  var liste = document.getElementById('sect-liste');
  if (liste && liste.style.display !== 'none' && !e.target.closest('.sect-combo') && !e.target.closest('#sect-liste')) liste.style.display = 'none';
});

function secteurLabelChamp() {
  var lang = (typeof AT_LANG !== 'undefined' && AT_LANG) || 'fr';
  return lang === 'en' ? 'label_en' : lang === 'es' ? 'label_es' : 'label_fr';
}

function secteurLabel(code) {
  var s = _secteursCache.find(function(x){ return x.code === code; });
  if (!s) return escHtml(code);
  var champ = secteurLabelChamp();
  var libelle = s[champ] || s.label_fr || s.code;
  return (s.icon || '') + ' ' + libelle;
}

const ZONES_COORDS = {
  'Les Abymes'          : [16.2691, -61.5053],
  'Baie-Mahault'        : [16.2674, -61.5868],
  'Basse-Terre'         : [16.0000, -61.7167],
  'Bouillante'          : [16.1233, -61.7756],
  'Capesterre-Belle-Eau': [16.0444, -61.5602],
  'Capesterre-de-Marie-Galante': [15.9204, -61.2383],
  'Deshaies'            : [16.3056, -61.7961],
  'Le Gosier'           : [16.2050, -61.4950],
  'Grand-Bourg'         : [15.8833, -61.3167],
  'Goyave'              : [16.1333, -61.5667],
  'Lamentin'            : [16.2706, -61.6381],
  'Morne-à-l\'Eau'      : [16.3333, -61.4667],
  'Le Moule'            : [16.3333, -61.3500],
  'Petit-Bourg'         : [16.1833, -61.5833],
  'Petit-Canal'         : [16.3833, -61.4833],
  'Pointe-à-Pitre'      : [16.2415, -61.5353],
  'Pointe-Noire'        : [16.2333, -61.7833],
  'Port-Louis'          : [16.4167, -61.5333],
  'Saint-Claude'        : [16.0333, -61.7000],
  'Saint-François'      : [16.2500, -61.2667],
  'Saint-Louis'         : [15.9500, -61.3000],
  'Sainte-Anne'         : [16.2167, -61.3833],
  'Sainte-Rose'         : [16.3333, -61.7000],
  'Terre-de-Bas'        : [15.8667, -61.6333],
  'Terre-de-Haut'       : [15.8667, -61.5833],
  'Trois-Rivières'      : [15.9833, -61.6500],
  'Vieux-Fort'          : [15.9500, -61.7167],
  'Vieux-Habitants'     : [16.0667, -61.7667],
  'Saint-Martin'        : [18.0708, -63.0501],
  'Saint-Barthélemy'    : [17.8960, -62.8510],
  'Martinique'          : [14.6415, -61.0242],
  'Guyane'              : [ 4.9224, -52.3135],
};
function getVilleCoords(ville) {
  if (!ville) return null;
  if (ZONES_COORDS[ville]) return ZONES_COORDS[ville];
  var villeL = ville.toLowerCase();
  for (var key in ZONES_COORDS) {
    if (key.toLowerCase().includes(villeL) || villeL.includes(key.toLowerCase())) return ZONES_COORDS[key];
  }
  return null;
}

function escHtml(str) {
  return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function initiales(nom) {
  return (nom||'?').trim().split(/\s+/).slice(0,2).map(function(m){ return m[0]; }).join('').toUpperCase();
}
function showToast(msg) {
  var t = document.getElementById('kk-toast');
  if (!t) { alert(msg); return; }
  t.textContent = msg;
  t.className = 'kk-toast show';
  clearTimeout(t._tid);
  t._tid = setTimeout(function(){ t.className = 'kk-toast'; }, 3500);
}

// ════════════════════════════════════════
//  SÉLECTEUR DE LANGUE — change réellement AT_LANG et redessine tout
// ════════════════════════════════════════
function renderLangSwitcher() {
  var drapeaux = { fr: 'flag-fr', en: 'flag-gb', es: 'flag-es' };
  var noms = { fr: 'Français', en: 'English', es: 'Español' };
  return '<div class="lang-switcher-desktop" style="position:relative;display:inline-block;">' +
    '<button onclick="toggleLangMenuArtisans()" style="display:flex;align-items:center;gap:6px;padding:5px 10px;border-radius:8px;border:1px solid var(--brd);background:var(--panel);cursor:pointer;font-size:12.5px;color:var(--tx);">' +
      '<span class="flag-swatch ' + drapeaux[AT_LANG] + '"></span><span class="lang-nom">' + noms[AT_LANG] + '</span>' +
    '</button>' +
    '<div id="lang-menu-artisans" style="display:none;position:absolute;top:100%;right:0;margin-top:6px;background:var(--panel);border:1px solid var(--brd);border-radius:10px;box-shadow:0 6px 20px rgba(19,34,60,.12);overflow:hidden;min-width:140px;z-index:50;">' +
      Object.keys(drapeaux).map(function(code) {
        return '<div onclick="choisirLangArtisans(\'' + code + '\')" style="display:flex;align-items:center;gap:8px;padding:9px 12px;cursor:pointer;font-size:13px;" onmouseover="this.style.background=\'var(--overlay-1,rgba(0,0,0,.04))\'" onmouseout="this.style.background=\'transparent\'">' +
          '<span class="flag-swatch ' + drapeaux[code] + '"></span>' + noms[code] +
        '</div>';
      }).join('') +
    '</div>' +
  '</div>';
}
// Téléphone : le bouton « Artisan » propose se connecter OU créer sa fiche. Ordinateur : lien direct, comme avant.
function ouvrirMenuArtisan(ev) {
  if (!window.matchMedia('(max-width:768px)').matches) return true;
  if (ev) ev.preventDefault();
  var m = document.getElementById('menu-artisan');
  if (m) m.style.display = (m.style.display === 'block') ? 'none' : 'block';
  return false;
}
function toggleLangMenuArtisans() {
  var menu = document.getElementById('lang-menu-artisans');
  if (menu) menu.style.display = (menu.style.display === 'none') ? 'block' : 'none';
}
function choisirLangArtisans(code) {
  document.getElementById('lang-menu-artisans').style.display = 'none';
  AT_LANG = code;
  localStorage.setItem('at_lang', code);
  renderNav();
  renderHero();
  renderResults();
  appliquerTraductionsStatiques();
}
document.addEventListener('click', function(e) {
  var menu = document.getElementById('lang-menu-artisans');
  if (menu && !e.target.closest('#nav')) menu.style.display = 'none';
  var ma = document.getElementById('menu-artisan');
  if (ma && !e.target.closest('.nav-art') && !e.target.closest('#menu-artisan')) ma.style.display = 'none';
});

// ════════════════════════════════════════
//  NAV
// ════════════════════════════════════════
function renderNav() {
  var nav = document.getElementById('nav');
  if (!nav) return;
  nav.innerHTML =
    '<div class="nav-wrap">' +
      '<a href="/artisans/" class="nav-logo">' +
        '<img src="/apple-touch-icon.png" alt="LearnLogic Studio" style="width:26px;height:26px;border-radius:7px;">' +
        '<div class="nav-brand"><span class="learn">Learn</span><span class="logic">Logic</span> <span class="studio">Studio</span></div>' +
        '<div class="nav-kk"><span class="karuk">Cara</span><span class="connect">Link</span> <span class="nav-kk-suffix">Artisans</span></div>' +
      '</a>' +
      /* ⚠️ 24/09 — Boutons toujours visibles, sans bouton hamburger ni panneau
      caché : après plusieurs tentatives de menu mobile qui ne s'affichaient
      pas chez certain·e·s utilisateur·rice·s (cause jamais confirmée avec
      certitude), on abandonne toute logique JS d'ouverture/fermeture.
      nav-wrap passe à la ligne naturellement (flex-wrap) s'il n'y a pas la
      place — aucun code personnalisé, comportement natif du navigateur. */
      '<div class="nav-links">' +
        '<a href="/artisans/compte.html" style="padding:6px 14px;border-radius:8px;border:1px solid var(--brd);color:var(--tx);font-weight:600;text-decoration:none;white-space:nowrap;">👤 <span class="nav-long">' + T('nav_compte_client') + '</span><span class="nav-court">' + T('nav_client_court') + '</span></a>' +
        '<a href="https://caralink.app/mpa/" class="nav-art" onclick="return ouvrirMenuArtisan(event)" style="padding:6px 14px;border-radius:8px;background:var(--ac);color:#fff;font-weight:700;text-decoration:none;white-space:nowrap;">🛠 <span class="nav-long">' + T('nav_espace_artisan') + '</span><span class="nav-court">' + T('nav_artisan_court') + '</span></a>' +
        '<a href="/artisans/inscription.html" class="nav-devenir" style="padding:6px 14px;border-radius:8px;border:1px solid var(--brd);color:var(--tx);font-weight:600;text-decoration:none;white-space:nowrap;">' + T('nav_devenir_artisan') + '</a>' +
        '<div id="menu-artisan" style="display:none;"><a href="https://caralink.app/mpa/">🔑 ' + T('nav_artisan_connexion') + '</a><a href="/artisans/inscription.html">✨ ' + T('nav_artisan_inscription') + '</a></div>' +
      '</div>' +
      '<div class="nav-right">' +
        renderLangSwitcher() +
      '</div>' +
    '</div>' +
    '<div class="nav-spacer"></div>';
}

// ════════════════════════════════════════
//  HERO / RECHERCHE — secteur + commune, jamais de date (V2)
// ════════════════════════════════════════
var _searchState = { secteur:'', groupe:'', commune:'', nom:'', tri:'', rge:false };

// Bouton « boutique » : fond ardoise sombre, lettres dorées à paillettes (comme l'enseigne « BOUTIQUE »).
(function() {
  if (document.getElementById('style-boutique-or')) return;
  var st = document.createElement('style'); st.id = 'style-boutique-or';
  st.textContent =
    '.btn-boutique-or{position:relative;display:inline-flex;align-items:center;gap:7px;padding:9px 18px;border-radius:999px;overflow:hidden;' +
      'font-size:13.5px;font-weight:800;letter-spacing:.6px;text-decoration:none;' +
      'border:0;outline:none;' +
      'background:radial-gradient(circle at 20% 25%,rgba(255,255,255,.07) 0 1px,transparent 1.6px),radial-gradient(circle at 70% 70%,rgba(255,255,255,.05) 0 1px,transparent 1.6px),linear-gradient(180deg,#3a3d42,#2a2d31);' +
      'background-size:19px 15px,23px 17px,100% 100%;' +
      'box-shadow:0 2px 8px rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.08);}' +
    '.btn-or-txt{display:inline-block;color:#e8c34e;' +
      'background:' +
        'radial-gradient(circle at 12% 40%,#fff 0 .9px,transparent 1.3px),radial-gradient(circle at 38% 65%,#fff7d1 0 .8px,transparent 1.2px),' +
        'radial-gradient(circle at 61% 30%,#fff 0 .9px,transparent 1.3px),radial-gradient(circle at 85% 60%,#fff7d1 0 .8px,transparent 1.2px),' +
        'linear-gradient(135deg,#f7dc7a 0%,#d4a52a 30%,#fbeaa0 50%,#c28f1c 72%,#efcd5e 100%);' +
      'background-size:17px 13px,21px 15px,15px 12px,19px 14px,100% 100%;' +
      '-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;' +
      'filter:drop-shadow(0 1px 1px rgba(0,0,0,.55));animation:boutique-or-scintille 2.8s ease-in-out infinite;}' +
    '@keyframes boutique-or-scintille{0%,100%{filter:drop-shadow(0 1px 1px rgba(0,0,0,.55)) brightness(1)}50%{filter:drop-shadow(0 1px 1px rgba(0,0,0,.55)) brightness(1.25)}}' +
    '.btn-boutique-or:hover,.btn-boutique-or:focus{border:0;outline:none;box-shadow:0 3px 12px rgba(0,0,0,.45);}' +
    '.btn-boutique-or-large{display:flex;justify-content:center;margin-top:12px;padding:11px 16px;font-size:14px;}' +
    '@media (prefers-reduced-motion:reduce){.btn-or-txt{animation:none;}}';
  document.head.appendChild(st);
})();

// ── Ouverture animée : les blocs descendent en fondu, des cartes grises tiennent la place pendant l'attente ──
// Tout est coupé automatiquement si le téléphone demande « réduire les animations ».
(function() {
  var st = document.createElement('style');
  st.textContent = '@keyframes atEntree{from{opacity:0;transform:translateY(-18px)}to{opacity:1;transform:none}}' +
    '.at-entree{animation:atEntree .5s ease-out backwards;animation-delay:var(--d,0s)}' +
    '@keyframes atBrille{0%{background-position:200% 0}100%{background-position:-200% 0}}' +
    '.at-sq{height:150px;border-radius:16px;margin-bottom:12px;border:1px solid #e3eaf4;background:linear-gradient(90deg,#eef2f8 25%,#f8fafd 50%,#eef2f8 75%);background-size:200% 100%;animation:atBrille 1.4s linear infinite}' +
    '@media (prefers-reduced-motion:reduce){.at-entree,.at-sq{animation:none !important}}';
  document.head.appendChild(st);
})();
function atEntree(liste, pas) {
  // On descend dans les gros blocs pour animer les éléments eux-mêmes (titres, lignes, cartes) : ils apparaissent l'un après l'autre,
  // pas tout le bloc d'un coup. Seuls ceux visibles à l'écran sont animés, du haut vers le bas.
  var feuilles = [];
  (function descendre(els, prof) {
    Array.prototype.forEach.call(els || [], function(el) {
      if (!el || el.nodeType !== 1 || /^(SCRIPT|STYLE|LINK)$/.test(el.tagName)) return;
      var cs = getComputedStyle(el);
      if (cs.position === 'fixed' || cs.display === 'none') return;
      var h = el.offsetHeight; if (h <= 0) return;
      var enfants = Array.prototype.filter.call(el.children, function(c) { return c.offsetHeight > 0; });
      if (prof < 3 && h > 150 && enfants.length >= 2) descendre(enfants, prof + 1); else feuilles.push(el);
    });
  })(liste, 0);
  var n = 0, bas = window.innerHeight + 40;
  feuilles.forEach(function(el) {
    el.classList.remove('at-entree');
    if (el.getBoundingClientRect().top > bas) return; // sous l'écran : inutile de l'animer
    el.style.setProperty('--d', Math.min(n * (pas || 0.11), 1.3).toFixed(2) + 's'); n++;
    void el.offsetWidth; el.classList.add('at-entree');
  });
}
function atSquelettes(n) { var h = ''; for (var i = 0; i < (n || 3); i++) h += '<div class="at-sq"></div>'; return h; }
// Fait défiler un nombre de 0 jusqu'à sa vraie valeur (le texte final reste exactement celui calculé).
function atDefilerNombre(el, duree) {
  if (!el) return;
  try { if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return; } catch (e) {}
  var texteFinal = el.textContent, m = texteFinal.match(/\d+/);
  if (!m) return;
  var cible = parseInt(m[0], 10);
  if (!isFinite(cible) || cible <= 0) return;
  var t0 = performance.now(), d = duree || 700;
  (function pas(now) {
    var k = Math.min(1, (now - t0) / d), e = 1 - Math.pow(1 - k, 3);
    if (k >= 1) { el.textContent = texteFinal; return; }
    el.textContent = texteFinal.replace(m[0], String(Math.round(cible * e)));
    requestAnimationFrame(pas);
  })(t0);
}

// ── Fenêtres animées : le fond blanc apparaît réduit puis s'élargit de haut en bas, les informations arrivent l'une après l'autre, les chiffres défilent ──
// Tout est coupé automatiquement si le téléphone demande « réduire les animations ».
(function() {
  var reduit = false; try { reduit = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
  if (reduit) return;
  var st = document.createElement('style');
  st.textContent = '@keyframes zfBoite{0%{opacity:0;transform:scale(.88,.25)}55%{opacity:1}100%{opacity:1;transform:none}}' +
    '.zf-boite{animation:zfBoite .45s cubic-bezier(.22,1,.36,1) both}' +
    '@keyframes zfFond{from{opacity:0}to{opacity:1}}.zf-fond{animation:zfFond .25s ease-out both}' +
    '@keyframes zfItem{from{opacity:0;transform:translateY(-14px)}to{opacity:1;transform:none}}' +
    '.zf-item{animation:zfItem .45s ease-out both;animation-delay:var(--d,0s)}';
  (document.head || document.documentElement).appendChild(st);

  function feuilles(racine) {
    var sortie = [];
    (function descendre(els, prof) {
      Array.prototype.forEach.call(els, function(el) {
        if (el.nodeType !== 1 || /^(SCRIPT|STYLE|LINK)$/.test(el.tagName)) return;
        var cs = getComputedStyle(el);
        if (cs.position === 'fixed' || cs.display === 'none') return;
        var h = el.offsetHeight; if (h <= 0) return;
        var enfants = Array.prototype.filter.call(el.children, function(c) { return c.offsetHeight > 0; });
        if (prof < 3 && h > 150 && enfants.length >= 2) descendre(enfants, prof + 1); else sortie.push(el);
      });
    })(racine.children, 0);
    return sortie;
  }
  // Un nombre seul (« 12 », « 37,50 € », « 45 % ») défile de 0 jusqu'à sa vraie valeur ; le texte final reste exactement celui d'origine.
  function defiler(el, attente) {
    var texteFinal = el.textContent, m = texteFinal.match(/\d(?:[\d\s  ]*\d)?(?:[.,]\d+)?/);
    if (!m) return;
    var cible = parseFloat(m[0].replace(/[\s  ]/g, '').replace(',', '.'));
    if (!isFinite(cible) || cible <= 0) return;
    var mDec = m[0].match(/[.,](\d+)$/), dec = mDec ? mDec[1].length : 0;
    setTimeout(function() {
      var t0 = performance.now();
      (function pas(now) {
        var k = Math.min(1, (now - t0) / 800), e = 1 - Math.pow(1 - k, 3);
        if (k >= 1) { el.textContent = texteFinal; return; }
        el.textContent = texteFinal.replace(m[0], (cible * e).toLocaleString('fr-FR', { minimumFractionDigits: dec, maximumFractionDigits: dec }));
        requestAnimationFrame(pas);
      })(t0);
    }, attente);
  }
  // Seuls les vrais chiffres défilent (montants en €, pourcentages, petits nombres) : jamais un téléphone, un code postal ou une année.
  function nombreSeul(t) {
    if (/^\s*\d{1,3}(?:[\s\u00a0\u202f]\d{3})*(?:[.,]\d+)?\s*(?:€|%)\s*$/.test(t)) return true;
    var m = /^\s*(\d{1,4})\s*$/.exec(t);
    return !!m && !(Number(m[1]) >= 1900 && Number(m[1]) <= 2100) && m[1].charAt(0) !== '0';
  }
  var dernier = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  function ouvrir(ov, boite, origine) {
    var t = Date.now();
    if (dernier) { if (dernier.get(ov) && t - dernier.get(ov) < 400) return; dernier.set(ov, t); }
    if (!boite) boite = Array.prototype.filter.call(ov.children, function(c) { return c.offsetHeight > 0 && !/^(SCRIPT|STYLE|LINK)$/.test(c.tagName); })[0];
    if (!boite) return;
    if (ov !== boite) { ov.classList.remove('zf-fond'); void ov.offsetWidth; ov.classList.add('zf-fond'); }
    boite.style.transformOrigin = origine || '50% 50%';
    boite.classList.remove('zf-boite'); void boite.offsetWidth; boite.classList.add('zf-boite');
    var items = feuilles(boite).slice(0, 14);
    items.forEach(function(el, i) {
      var d = 0.22 + i * 0.09;
      el.classList.remove('zf-item'); el.style.setProperty('--d', d.toFixed(2) + 's'); void el.offsetWidth; el.classList.add('zf-item');
      if (!el.children.length && nombreSeul(el.textContent)) defiler(el, d * 1000 + 150);
    });
    setTimeout(function() {
      ov.classList.remove('zf-fond'); boite.classList.remove('zf-boite');
      items.forEach(function(el) { el.classList.remove('zf-item'); });
    }, 2400);
  }
  function estFenetre(n) {
    return (n.style && n.style.position === 'fixed') || (n.matches && n.matches('.galerie,.modal-overlay,.overlay-bg'));
  }
  function couvre(n) {
    var r = n.getBoundingClientRect();
    return r.width >= window.innerWidth * 0.9 && r.height >= window.innerHeight * 0.9;
  }
  function demarrer() {
    new MutationObserver(function(liste) {
      liste.forEach(function(m) {
        if (m.type === 'attributes') {
          var el = m.target; if (!el.classList) return;
          var avant = ' ' + (m.oldValue || '') + ' ';
          var ouvertAvant = / (show|open) /.test(avant);
          var ouvertMaintenant = el.classList.contains('show') || el.classList.contains('open');
          if (ouvertAvant || !ouvertMaintenant) return;
          if (el.matches('.modal-overlay,.overlay-bg,.faq-overlay,.legal-modal-overlay')) ouvrir(el);
          else if (el.matches('.mpa-ai-panel')) ouvrir(el, el, 'left bottom');
        } else {
          Array.prototype.forEach.call(m.addedNodes, function(n) {
            if (n.nodeType === 1 && estFenetre(n) && n.offsetHeight > 0 && couvre(n)) ouvrir(n);
          });
        }
      });
    }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'], attributeOldValue: true });
  }
  if (document.body) demarrer(); else document.addEventListener('DOMContentLoaded', demarrer);
})();

function renderHero() {
  var hero = document.getElementById('hero');
  if (!hero) return;

  hero.innerHTML =
    '<div class="hero-section" id="recherche">' +
      '<img src="/artisans/img/hero-artisan-homme.png" alt="" class="hero-char hero-char-left">' +
      '<img src="/artisans/img/hero-artisan-femme.png" alt="" class="hero-char hero-char-right">' +
      '<div class="hero-main">' +
        '<div class="hero-eyebrow">' + T('hero_eyebrow') + '</div>' +
        '<h1 class="hero-title">' + T('hero_title') + '</h1>' +
        '<p class="hero-soustitre">' + T('hero_soustitre') + '</p>' +
        '<p class="hero-note">' + T('hero_note_short') + '</p>' +
        '<div class="cadre-haut">' +
        '<div class="app-bar-cadre"><span>🔧 CaraLink Artisans</span><span class="app-bar-sub">' + T('cadre_sous') + '</span></div>' +
        '<div class="search-bar">' +
          '<div class="search-question">🔍 ' + T('search_que') + '</div>' +
          '<div class="search-field"><label>' + T('search_secteur_label') + '</label>' +
            (ecranTel() ? htmlChampSecteurTel() :
            '<select id="search-secteur" onchange="secteurSelectChange()" onkeydown="if(event.key===\'Enter\')lancerRecherche()">' +
              '<option value="">' + T('search_secteur_tous') + '</option>' +
              (modeGroupes()
                ? groupesTries().map(function(g) {
                    return '<option value="g:' + g.code + '"' + (_searchState.groupe === g.code ? ' selected' : '') + '>' + (g.icon||'') + ' ' + escHtml(libelleDe(g)) + '</option>';
                  }).join('')
                : secteursTries().map(function(s) {
                    return '<option value="' + s.code + '"' + (_searchState.secteur === s.code ? ' selected' : '') + '>' + (s.icon||'') + ' ' + escHtml(s[secteurLabelChamp()] || s.label_fr) + '</option>';
                  }).join('')) +
            '</select>') + '</div>' +
          '<div class="search-field"><label>' + T('search_lieu_label') + '</label>' +
            '<input id="search-commune" type="text" placeholder="' + (ecranTel() ? T('search_lieu_court') : T('search_lieu_ph')) + '" enterkeyhint="search" oninput="rechercheAuto(false)" value="' + escHtml(_searchState.commune) + '" onkeydown="if(event.key===\'Enter\')lancerRecherche()"/></div>' +
          '<div class="search-field"><label>' + T('search_nom_label') + '</label>' +
            '<input id="search-nom" type="text" placeholder="' + (ecranTel() ? T('search_nom_court') : T('search_nom_ph')) + '" enterkeyhint="search" oninput="rechercheAuto(false)" value="' + escHtml(_searchState.nom) + '" onkeydown="if(event.key===\'Enter\')lancerRecherche()"/></div>' +
          '<button class="search-btn" onclick="lancerRecherche()">' +
            '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>' +
            T('search_btn') +
          '</button>' +
        '</div>' +
        '<div id="metier-puces" class="metier-puces" style="display:none"></div>' +
        '<div class="devis-mobile">📢 <a href="#" onclick="ouvrirModalDevisGeneral();return false;" style="color:var(--ac-t,var(--ac));font-weight:700;text-decoration:none;">' + T('hero_devisgen_lien') + '</a>' + T('hero_devisgen_suite') + '</div>' +
        '</div>' +
        '<div class="filters-wrap">' +
          '<button class="filter-pill' + (_searchState.tri==='note'?' active':'') + '" onclick="trierPar(\'note\')">' + T('filter_note') + '</button>' +
          '<button class="filter-pill' + (_searchState.rge?' active':'') + '" onclick="filtrerRge()">' + T('filter_rge') + '</button>' +
        '</div>' +
        '<div class="infos-duo">' + htmlAidesInfo() + htmlVideoClients() + '</div>' +
        '<div class="devis-desktop" style="margin-top:14px;font-size:12.5px;color:var(--mu);">' +
          '📢 <a href="#" onclick="ouvrirModalDevisGeneral();return false;" style="color:var(--ac-t,var(--ac));font-weight:700;text-decoration:none;">' + T('hero_devisgen_lien') + '</a>' +
          T('hero_devisgen_suite') +
        '</div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">' +
          ['1','2','3'].map(function(n) {
            return '<div style="flex:1 1 170px;background:rgba(255,255,255,.7);border:1px solid var(--line,#e3eaf4);border-radius:10px;padding:9px 11px;font-size:12px;line-height:1.4;"><b style="display:block;font-size:12.5px;color:var(--ink,#13223c);">' + T('prj_etape' + n) + '</b><span style="color:var(--mu,#6b7c96);">' + T('prj_etape' + n + '_d') + '</span></div>';
          }).join('') +
        '</div>' +
      '</div>' +
    '</div>';
  majPuces();
}

// ════════════════════════════════════════
//  BANDEAU D'INFOS QUI DÉFILENT (annuaire) : nombre d'artisans sur le site, dans une commune, dans un secteur.
//  Chiffres calculés une seule fois depuis la liste publique (aucune fonction de plus), puis tirés au hasard.
// ════════════════════════════════════════
var _infosStats = null, _infosTimer = null, _infosDernier = '', _infosChargement = false;

function normaliserLieu(t) { return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim(); }
function majusculesLieu(t) { return String(t).toLowerCase().replace(/(^|[\s\-'’])([a-zà-ÿ])/g, function(m, a, b) { return a + b.toUpperCase(); }); }

function calculerInfosStats(artisans) {
  var communes = {}, secteurs = {};
  artisans.forEach(function(a) {
    var c = String(a.commune || '').trim();
    if (c) { var k = normaliserLieu(c); (communes[k] = communes[k] || { nom: majusculesLieu(c), n: 0 }).n++; }
    if (a.secteur) { (secteurs[a.secteur] = secteurs[a.secteur] || { code: a.secteur, n: 0 }).n++; }
  });
  return {
    total: artisans.length,
    communes: Object.keys(communes).map(function(k) { return communes[k]; }),
    secteurs: Object.keys(secteurs).map(function(k) { return secteurs[k]; })
  };
}

function messagesInfos() {
  if (!_infosStats || !_infosStats.total) return [];
  var m = [], st = _infosStats;
  var n = function(x) { return x + ' ' + (x > 1 ? T('artisan_plusieurs') : T('artisan_un')); };
  m.push('total|' + '🛠️ ' + escHtml(T('info_total_avant')) + ' <b>' + n(st.total) + '</b> ' + escHtml(T('info_total_apres')));
  st.communes.forEach(function(c) { m.push('c:' + c.nom + '|📍 <b>' + n(c.n) + '</b> ' + escHtml(T('info_commune')) + ' <b>' + escHtml(c.nom) + '</b>'); });
  st.secteurs.forEach(function(x) { m.push('s:' + x.code + '|' + escHtml(T('info_secteur_avant')) + ' <b>' + secteurLabel(x.code) + '</b> : <b>' + n(x.n) + '</b>'); });
  return m;
}

function afficherInfoAuHasard() {
  var zone = document.getElementById('infos-defil-txt'), cadre = document.getElementById('infos-defil');
  if (!zone || !cadre) { clearInterval(_infosTimer); _infosTimer = null; return; }
  var tous = messagesInfos();
  if (!tous.length) { cadre.style.display = 'none'; return; }
  var choix = tous.filter(function(x) { return x.split('|')[0] !== _infosDernier; });
  var un = (choix.length ? choix : tous)[Math.floor(Math.random() * (choix.length || tous.length))];
  _infosDernier = un.split('|')[0];
  cadre.style.display = 'block';
  zone.style.opacity = '0';
  setTimeout(function() { zone.innerHTML = un.slice(un.indexOf('|') + 1); zone.style.opacity = '1'; }, zone.innerHTML ? 250 : 0);
}

async function demarrerInfosAnnuaire() {
  if (!document.getElementById('style-infos-defil')) {
    var st = document.createElement('style'); st.id = 'style-infos-defil';
    st.textContent = '.infos-defil{display:none;margin:10px 0 0;padding:9px 14px;border-radius:12px;background:rgba(255,255,255,.75);border:1px solid var(--line,#e3eaf4);font-size:13.5px;color:var(--ink,#13223c);text-align:center;min-height:20px;}' +
      '.infos-defil b{color:var(--ac,#1266E3);}' +
      '#infos-defil-txt{display:inline-block;transition:opacity .25s ease;}' +
      '@media (prefers-reduced-motion:reduce){#infos-defil-txt{transition:none;}}';
    document.head.appendChild(st);
  }
  var cadre = document.getElementById('infos-defil');
  if (cadre && !cadre.dataset.survol) {
    cadre.dataset.survol = '1';
    cadre.addEventListener('mouseenter', function() { cadre.dataset.pause = '1'; });
    cadre.addEventListener('mouseleave', function() { delete cadre.dataset.pause; });
  }
  if (!_infosStats && !_infosChargement) {
    _infosChargement = true;
    try {
      var liste = await listePublique();
      if (liste.length) _infosStats = calculerInfosStats(liste);
    } catch (e) { /* le bandeau reste simplement caché */ }
    _infosChargement = false;
  }
  if (!_infosStats) return;
  afficherInfoAuHasard();
  clearInterval(_infosTimer);
  _infosTimer = setInterval(function() {
    var c = document.getElementById('infos-defil');
    if (c && c.dataset.pause) return;
    afficherInfoAuHasard();
  }, 6000);
}


// ════════════════════════════════════════
//  VITRINE : avant toute recherche, vignettes réduites d'artisans (nom, secteur, commune, avis) qui défilent doucement (plus de 4 sur ordinateur, plus de 2 sur téléphone).
//  Même liste publique que le bandeau d'infos (un seul appel). Les artisans grisés (Stripe pas finalisé) y sont aussi : ça montre que l'annuaire se remplit.
//  Ordre mélangé à chaque visite ; défilement d'une vignette toutes les 4,5 s ; flèches et glissement au doigt ; pause au survol, au focus ou au toucher. Disparaît dès qu'on cherche.
// ════════════════════════════════════════
var _pListePublique = null;
function listePublique() {
  if (!_pListePublique) {
    _pListePublique = fetch(SUPABASE_URL + '/functions/v1/lister-artisans', { headers: { 'Authorization': 'Bearer ' + SUPABASE_ANON } })
      .then(function(r) { return r.json(); })
      .then(function(d) { return (!d.error && Array.isArray(d.artisans)) ? d.artisans : []; })
      .catch(function() { _pListePublique = null; return []; });
  }
  return _pListePublique;
}

var _vitrine = { liste: [], debut: 0, timer: null, pause: false, actif: false };
var VITRINE_TITRE = { fr: 'Des artisans près de chez vous', en: 'Artisans near you', es: 'Artesanos cerca de usted' };

function melangerListe(t) {
  var a = t.slice();
  for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var x = a[i]; a[i] = a[j]; a[j] = x; }
  return a;
}
var VITRINE_NOUVEAU = { fr: 'Nouveau', en: 'New', es: 'Nuevo' };
// Vignette réduite : nom (+ petite coche si vérifié), secteur, commune en couleur, avis. Rien d'autre.
function htmlVitrineCarte(a) {
  _artisansCartes[a.id] = a;
  var lg = (typeof AT_LANG !== 'undefined' && AT_LANG) || 'fr';
  var photo = a.photo_profil_url
    ? '<img src="' + escHtml(a.photo_profil_url) + '" class="vit-av" alt="" loading="lazy">'
    : '<div class="vit-av vit-av-ini">' + initiales(a.nom_entreprise) + '</div>';
  var nb = a.nb_avis || 0, note = a.note_moyenne != null ? Number(a.note_moyenne) : 0;
  var avis = nb > 0
    ? '<span class="vit-etoiles">' + etoilesCarte(note) + '</span> <span>' + note.toFixed(1) + ' (' + nb + ')</span>'
    : (a.nouveau ? '<span class="vit-nouveau">' + escHtml(VITRINE_NOUVEAU[lg] || VITRINE_NOUVEAU.fr) + '</span>' : '<span class="vit-sans-avis">' + escHtml(T('avis_aucun_court')) + '</span>');
  return '<div class="vit-carte" role="link" tabindex="0" onclick="ouvrirProfil(' + jsAttr(a.id) + ')" onkeydown="if(event.key===\'Enter\'){ouvrirProfil(' + jsAttr(a.id) + ')}">' + photo +
    '<div class="vit-nom"><span class="vit-nom-txt">' + escHtml(a.nom_entreprise) + '</span>' + (a.verifie ? '<span class="vit-coche" title="' + escHtml(T('badge_verifie')) + '" aria-label="' + escHtml(T('badge_verifie')) + '">✔</span>' : '') + '</div>' +
    '<div class="vit-secteur">' + secteurLabel(a.secteur) + '</div>' +
    '<div class="vit-commune">📍 ' + escHtml(a.commune) + '</div>' +
    '<div class="vit-avis">' + avis + '</div></div>';
}
function peindreVitrineCartes(avecEntree) {
  var z = document.getElementById('vitrine-piste');
  if (!z) return;
  var html = _vitrine.liste.slice(0, 30).map(htmlVitrineCarte).join('');
  z.innerHTML = html;
  if (avecEntree) atEntree(z.children, 0.05);
}
// Série de vignettes : si elles débordent, on la répète une fois pour que le défilement boucle sans saut.
function preparerBoucleVitrine() {
  var z = document.getElementById('vitrine-piste'); if (!z) return 0;
  var cartes = z.querySelectorAll('.vit-carte');
  if (!cartes.length) return 0;
  var largeur = cartes[cartes.length - 1].offsetLeft + cartes[cartes.length - 1].offsetWidth - cartes[0].offsetLeft;
  if (largeur <= z.clientWidth + 4) { z.classList.add('centre'); return 0; } // tout tient : rien à faire défiler
  z.classList.remove('centre');
  var copie = document.createElement('div'); copie.style.display = 'contents'; copie.setAttribute('aria-hidden', 'true');
  copie.innerHTML = _vitrine.liste.slice(0, 30).map(htmlVitrineCarte).join('').replace(/tabindex="0"/g, 'tabindex="-1"');
  while (copie.firstChild) z.appendChild(copie.firstChild);
  var c2 = z.querySelectorAll('.vit-carte')[cartes.length];
  return c2.offsetLeft - cartes[0].offsetLeft; // largeur d'une série (espaces compris)
}
// Ordre du défilement. Avant 30 artisans : tout le monde, au hasard (c'est juste et suffisant).
// À partir de 30 : seuls les profils avec photo + un produit ou un service sont montrés, et le mélange est PONDÉRÉ :
// les artisans actifs depuis 14 jours ont plus de chances de passer en premier (poids 3), les nouveaux aussi (poids 2), les autres gardent leur chance (poids 1).
// Ce n'est pas un classement : personne n'est écarté parce qu'il met rarement à jour. Les avis et l'abonnement Pro n'y entrent jamais.
var SEUIL_VITRINE_PONDEREE = 30;
function poidsVitrine(a) { return a.actif_recemment ? 3 : (a.nouveau ? 2 : 1); }
function ordreVitrine(liste, hasard) {
  hasard = hasard || Math.random;
  if (liste.length < SEUIL_VITRINE_PONDEREE) return melangerListe(liste);
  var retenus = liste.filter(function(a) { return a.vitrine_eligible !== false; });
  return retenus.map(function(a) { return { a: a, k: -Math.log(1 - hasard()) / poidsVitrine(a) }; })
    .sort(function(x, y) { return x.k - y.k; })
    .map(function(x) { return x.a; });
}
function vitrineDefiler(sens) {
  var z = document.getElementById('vitrine-piste'); if (!z) return;
  var c = z.querySelector('.vit-carte'); var pas = c ? c.getBoundingClientRect().width + 12 : 200;
  var W = _vitrine.largeurSerie || 0;
  if (W) { if (sens < 0 && z.scrollLeft < pas) z.scrollLeft += W; }
  z.scrollBy({ left: sens * pas, behavior: 'smooth' });
}
function arreterVitrine() {
  clearInterval(_vitrine.timer); _vitrine.timer = null; cancelAnimationFrame(_vitrine.raf); _vitrine.raf = null; _vitrine.actif = false;
  var v = document.getElementById('vitrine'); if (v) v.innerHTML = ''; // vidé : aucun doublon d'identifiants avec les vrais résultats
}
async function afficherVitrine() {
  var zone = document.getElementById('vitrine');
  if (!zone) { // la page ne la contient pas (ancienne version en mémoire) : on la crée juste sous le haut de page
    var hero = document.getElementById('hero');
    if (!hero || !hero.parentNode) return;
    zone = document.createElement('section'); zone.id = 'vitrine';
    hero.parentNode.insertBefore(zone, hero.nextSibling);
  }
  if (!document.getElementById('style-vitrine')) {
    var st = document.createElement('style'); st.id = 'style-vitrine';
    st.textContent = '#vitrine{display:none;}body.avant-recherche #vitrine{display:block;}' +
      '#vitrine .vit-titre{text-align:center;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--mu2,#6b7c96);margin:0 0 12px;}' +
      '#vitrine-cadre{position:relative;}' +
      '#vitrine-piste{display:flex;gap:12px;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch;padding:4px 2px 12px;}' +
      '#vitrine-piste::-webkit-scrollbar{display:none;}' +
      '.vit-carte{flex:0 0 200px;box-sizing:border-box;background:#fff;border:2px solid #e3eaf4;border-radius:18px;padding:14px 10px 12px;display:flex;flex-direction:column;align-items:center;text-align:center;gap:3px;cursor:pointer;box-shadow:0 6px 18px rgba(19,34,60,.06);transition:transform .15s ease,box-shadow .15s ease;min-width:0;}' +
      '.vit-carte:hover{transform:translateY(-2px);box-shadow:0 10px 24px rgba(19,34,60,.11);}' +
      '.vit-carte:focus-visible{outline:3px solid #1266E3;outline-offset:2px;}' +
      '.vit-av{width:54px;height:54px;border-radius:50%;object-fit:cover;flex-shrink:0;margin-bottom:4px;}' +
      '.vit-av-ini{display:flex;align-items:center;justify-content:center;background:rgba(18,102,227,.12);color:#0E4FB8;font-weight:700;font-size:17px;}' +
      '.vit-nom{display:flex;align-items:center;justify-content:center;gap:5px;max-width:100%;font-weight:700;font-size:14.5px;color:#13223c;}' +
      '.vit-nom-txt{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;}' +
      '.vit-coche{flex-shrink:0;width:16px;height:16px;border-radius:50%;background:#16a34a;color:#fff;font-size:10px;line-height:16px;text-align:center;}' +
      '.vit-secteur{font-size:12.5px;color:#5d6b82;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
      '.vit-commune{font-size:13.5px;font-weight:800;color:#0E4FB8;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
      '.vit-avis{font-size:12px;color:#5d6b82;margin-top:2px;display:flex;align-items:center;justify-content:center;gap:4px;flex-wrap:wrap;}' +
      '.vit-etoiles .star-on{color:#f59e0b;}.vit-etoiles .star-off{color:#d5dbe6;}' +
      '.vit-nouveau{background:#e8f0ff;color:#1565e8;font-weight:700;border-radius:999px;padding:2px 9px;font-size:11.5px;}' +
      '.vit-fl{display:none;position:absolute;top:42%;transform:translateY(-50%);width:40px;height:40px;border-radius:50%;border:1px solid #d9e1ee;background:#fff;color:#13223c;font-size:20px;line-height:1;cursor:pointer;box-shadow:0 4px 12px rgba(19,34,60,.15);z-index:2;}' +
      '.vit-fl.g{left:-14px;}.vit-fl.d{right:-14px;}' +
      '@media(min-width:769px){#vitrine{max-width:1100px;margin:22px auto 8px;padding:0 24px;}.vit-fl{display:block;}}' +
      '@media(max-width:768px){#vitrine{margin:6px 0 22px;}#vitrine .vit-titre{margin-left:12px;margin-right:12px;}#vitrine-piste{padding-left:12px;padding-right:12px;}.vit-carte{flex:0 0 43%;padding:12px 8px 10px;}.vit-av{width:46px;height:46px;}.vit-nom{font-size:13.5px;}}' +
      '#vitrine-piste.centre{justify-content:center;}@media (prefers-reduced-motion:reduce){#vitrine-piste{scroll-behavior:auto;}.vit-carte{transition:none;}}';
    document.head.appendChild(st);
  }
  var liste;
  try { liste = await listePublique(); } catch (e) { liste = []; }
  if (!liste.length || window._rechercheFaite) { arreterVitrine(); return; }
  var v = _vitrine;
  if (!v.actif || v.total !== liste.length) { v.liste = ordreVitrine(liste); v.total = liste.length; v.debut = 0; }
  v.actif = true;
  var titre = VITRINE_TITRE[(typeof AT_LANG !== 'undefined' && AT_LANG) || 'fr'] || VITRINE_TITRE.fr;
  zone.innerHTML = '<div class="vit-titre">' + escHtml(titre) + '</div><div id="vitrine-cadre">' +
    '<button type="button" class="vit-fl g" aria-label="←" onclick="vitrineDefiler(-1)">‹</button>' +
    '<div id="vitrine-piste"></div>' +
    '<button type="button" class="vit-fl d" aria-label="→" onclick="vitrineDefiler(1)">›</button></div>';
  peindreVitrineCartes(true);
  zone.onmouseenter = function() { v.pause = true; };
  zone.onmouseleave = function() { v.pause = false; };
  zone.onfocusin = function() { v.pause = true; };
  zone.onfocusout = function() { v.pause = false; };
  var repriseTactile = function() { v.pause = true; clearTimeout(v.repriseTactile); v.repriseTactile = setTimeout(function() { v.pause = false; }, 6000); };
  zone.ontouchstart = repriseTactile; zone.onpointerdown = repriseTactile;
  clearInterval(v.timer); cancelAnimationFrame(v.raf);
  var calme = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  v.largeurSerie = preparerBoucleVitrine();
  if (!calme && v.largeurSerie) {
    var piste = document.getElementById('vitrine-piste');
    var pos = piste.scrollLeft, dernier = null, VITESSE = 55; // pixels par seconde : continu, sans à-coups
    var pas = function(t) {
      if (!document.getElementById('vitrine-piste') || window._rechercheFaite) { v.raf = null; return; }
      if (dernier !== null && !v.pause && !document.hidden) {
        var dt = Math.min(t - dernier, 60) / 1000;
        if (Math.abs(piste.scrollLeft - pos) > 2) pos = piste.scrollLeft; // la personne (ou une flèche) a déplacé la piste
        pos += VITESSE * dt;
        if (pos >= v.largeurSerie) pos -= v.largeurSerie;
        piste.scrollLeft = pos;
      } else { pos = piste.scrollLeft; }
      dernier = t;
      v.raf = requestAnimationFrame(pas);
    };
    v.raf = requestAnimationFrame(pas);
  }
}

function filtrerRge() {
  _searchState.rge = !_searchState.rge;
  window._rechercheFaite = true; document.body.classList.remove('avant-recherche'); arreterVitrine();
  renderHero();
  chargerArtisans();
}

function trierPar(critere) {
  _searchState.tri = (_searchState.tri === critere) ? '' : critere;
  window._rechercheFaite = true; document.body.classList.remove('avant-recherche'); arreterVitrine();
  renderHero();
  chargerArtisans();
}

function ecranTel() { return window.matchMedia('(max-width:768px)').matches; }
var _timerRechercheAuto = null;
// Téléphone : pas de bouton « Chercher » — la recherche part toute seule quand on choisit un secteur
// ou quand on a fini de taper (0,7 s sans toucher le clavier). La touche « Rechercher » du clavier marche aussi.
function rechercheAuto(immediat) {
  if (!ecranTel()) return;
  clearTimeout(_timerRechercheAuto);
  _timerRechercheAuto = setTimeout(function() { lancerRecherche(!immediat); }, immediat ? 0 : 700);
}
function lancerRecherche(sansDefiler) {
  // Téléphone : les vignettes n'apparaissent qu'après une recherche (le style ne s'applique que sur petit écran).
  lireChampSecteur();
  _searchState.commune = document.getElementById('search-commune').value.trim();
  _searchState.nom = document.getElementById('search-nom').value.trim();
  // Aucun critère (champs vidés) : la zone des résultats reste vide, comme à l'arrivée sur la page.
  if (!_searchState.secteur && !_searchState.groupe && !_searchState.commune && !_searchState.nom && !_searchState.rge) {
    window._rechercheFaite = false;
    document.body.classList.add('avant-recherche');
    afficherVitrine();
    return;
  }
  window._rechercheFaite = true;
  document.body.classList.remove('avant-recherche');
  arreterVitrine();
  chargerArtisans();
  if (sansDefiler !== true) {
    var zr = document.getElementById('main-results');
    if (zr && zr.scrollIntoView) setTimeout(function() { zr.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 80);
  }
}

// ════════════════════════════════════════
//  RÉSULTATS + CARTE
// ════════════════════════════════════════
var _map = null;
var _mapMarkers = [];

function renderResults() {
  var main = document.getElementById('main-results');
  if (!main) return;
  main.innerHTML =
    '<div class="results-layout">' +
      '<div class="partner-panel" id="partner-panel">' +
      '</div>' +
      '<div class="results-panel">' +
        '<div class="results-header">' +
          '<span class="results-count" id="results-count">' + T('chargement') + '</span>' +
        '</div>' +
        '<div id="artisans-list">' + atSquelettes(3) + '</div>' +
      '</div>' +
      '<div class="map-panel">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">' +
          '<span class="map-label">' + T('map_label') + '</span>' +
        '</div>' +
        '<div id="leaflet-map" style="width:100%;height:280px;border-radius:12px;border:1px solid var(--brd);overflow:hidden;"></div>' +
        '<div class="infos-defil" id="infos-defil" aria-live="polite"><span id="infos-defil-txt"></span></div>' +
      '</div>' +
    '</div>';
  renderPartnerPanel();
  demarrerInfosAnnuaire();
  if (!window._rechercheFaite) document.body.classList.add('avant-recherche');
  afficherVitrine();
  chargerPubAccueil();
  chargerArtisans();
  setTimeout(initCarte, 100);
}

// ── Pubs de l'annuaire, fusionnées : une carte CaraLink Alternance, puis un partenaire, puis une carte CaraLink… ──
// Trois endroits : colonne de gauche (ordinateur, après recherche), page d'accueil (avant recherche), carte glissée dans la liste (téléphone).
// Interrupteur « pub » éteint dans l'admin : il ne reste que les cartes CaraLink Alternance. Un partenaire garde son lien et sa petite phrase.
var BESOINS_ALTERNANCE_PUBLIC = [
  { code: 'commercial', phrase: 'Un artisan a aussi besoin de prospecter.', metier: 'Il vous faut un commercial.', img: '/artisans/img/alt-commercial.webp' },
  { code: 'communication', phrase: 'Un artisan a aussi besoin de se faire connaître.', metier: 'Il vous faut de la communication.', img: '/artisans/img/alt-communication.webp' },
  { code: 'administratif', phrase: 'Un artisan a aussi besoin de gérer sa paperasse.', metier: 'Il vous faut un assistant administratif.', img: '/artisans/img/alt-administratif.webp' },
  { code: 'comptable', phrase: 'Un artisan a aussi besoin de chiffrer.', metier: 'Il vous faut un gestionnaire comptable.', img: '/artisans/img/alt-comptable.webp' },
];

var _pubListe = null;
var PUB_URL_LOGOS_OK = SUPABASE_URL + '/storage/v1/object/public/pub-logos/';

// Lit la liste des pubs partenaires actives (une seule fois). Éteinte, vide ou en panne : liste vide.
async function lirePubListe() {
  if (_pubListe) return _pubListe;
  try {
    var res = await fetch(SUPABASE_URL + '/rest/v1/rpc/pub_annonces_actives', {
      method: 'POST',
      headers: { 'apikey': SUPABASE_ANON, 'Authorization': 'Bearer ' + SUPABASE_ANON, 'Content-Type': 'application/json' },
      body: '{}'
    });
    var data = await res.json();
    // Défense en plus : un logo ne vient que de notre dossier de logos, un lien que en https.
    _pubListe = (Array.isArray(data) ? data : []).filter(function(a) { return a && a.logo_url && String(a.logo_url).indexOf(PUB_URL_LOGOS_OK) === 0; })
      .map(function(a) { return { nom: String(a.nom || ''), phrase: String(a.phrase || '').slice(0, 80), logo_url: a.logo_url, lien: /^https:\/\//i.test(a.lien || '') ? a.lien : null }; });
  } catch (e) { _pubListe = []; }
  return _pubListe;
}

// Cartes CaraLink et partenaires en alternance : A1, P1, A2, P2… (s'il y a plus de cartes CaraLink, elles finissent la série).
function slidesFusion() {
  var A = BESOINS_ALTERNANCE_PUBLIC, P = _pubListe || [], out = [];
  for (var i = 0; i < Math.max(A.length, P.length); i++) {
    if (i < A.length) out.push({ t: 'alt', b: A[i] });
    if (i < P.length) out.push({ t: 'pub', a: P[i] });
  }
  return out;
}

function enteteLibelle(txt, mention) {
  return '<div style="font-size:11px;font-weight:700;color:var(--mu2);letter-spacing:.05em;text-transform:uppercase;margin-bottom:10px;display:flex;justify-content:space-between;gap:8px;"><span>' + escHtml(txt) + '</span>' + (mention ? '<span style="font-weight:600;opacity:.7;">' + escHtml(mention) + '</span>' : '') + '</div>';
}

// ── Grande carte (colonne de gauche) ──
function htmlSlideGrande(s) {
  if (s.t === 'alt') {
    var b = s.b;
    return enteteLibelle('Vous êtes artisan ?') +
      '<a href="https://learnlogicstudio.com/connect.html?besoin=' + b.code + '#section-calculateur" target="_blank" rel="noopener" style="display:block;text-decoration:none;color:inherit;">' +
        '<div style="font-size:15px;font-weight:700;color:var(--tx);line-height:1.35;min-height:2.7em;margin-bottom:4px;">' + b.phrase + '</div>' +
        '<div style="font-size:14px;font-weight:700;color:var(--ac-t,var(--ac));line-height:1.35;min-height:2.7em;margin-bottom:10px;">' + b.metier + ' →</div>' +
        '<img src="' + b.img + '" alt="" width="540" height="770" decoding="async" style="display:block;width:100%;height:auto;aspect-ratio:54/77;object-fit:cover;border-radius:12px;background:var(--inp);box-shadow:0 6px 18px rgba(19,34,60,.18);">' +
      '</a>';
  }
  var a = s.a;
  var corps = '<div style="height:170px;display:flex;align-items:center;justify-content:center;background:#fff;border:1px solid var(--brd);border-radius:12px;padding:10px;">' +
    '<img src="' + escHtml(a.logo_url) + '" alt="' + escHtml(a.nom) + '" style="max-width:100%;max-height:100%;object-fit:contain;" decoding="async"></div>' +
    '<div style="font-size:14px;font-weight:700;color:var(--tx);text-align:center;margin-top:10px;line-height:1.3;">' + escHtml(a.nom) + '</div>' +
    (a.phrase ? '<div style="font-size:13px;color:var(--mu);text-align:center;margin-top:4px;line-height:1.4;">' + escHtml(a.phrase) + '</div>' : '');
  return enteteLibelle(T('pub_titre'), T('pub_mention')) +
    (a.lien ? '<a href="' + escHtml(a.lien) + '" target="_blank" rel="noopener sponsored" style="display:block;text-decoration:none;color:inherit;">' + corps + '</a>' : '<div>' + corps + '</div>');
}

// ── Petite carte (page d'accueil et téléphone) ──
function htmlSlideCompacte(s) {
  if (s.t === 'alt') {
    var b = s.b;
    return '<a href="https://learnlogicstudio.com/connect.html?besoin=' + b.code + '#section-calculateur" target="_blank" rel="noopener" style="display:flex;gap:14px;align-items:center;text-decoration:none;color:inherit;">' +
      '<img src="' + b.img + '" alt="" width="540" height="770" loading="lazy" decoding="async" style="flex:none;width:88px;height:125px;object-fit:cover;border-radius:10px;background:var(--inp);">' +
      '<div style="min-width:0;">' +
        '<div style="font-size:10.5px;font-weight:700;color:var(--mu2);letter-spacing:.05em;text-transform:uppercase;margin-bottom:5px;">Vous êtes artisan ?</div>' +
        '<div style="font-size:14px;font-weight:700;color:var(--tx);line-height:1.35;margin-bottom:3px;">' + b.phrase + '</div>' +
        '<div style="font-size:13.5px;font-weight:700;color:var(--ac-t,var(--ac));line-height:1.35;">' + b.metier + ' →</div>' +
      '</div></a>';
  }
  var a = s.a;
  var corps = '<div style="display:flex;gap:14px;align-items:center;min-height:125px;">' +
    '<div style="flex:none;width:88px;height:88px;display:flex;align-items:center;justify-content:center;background:#fff;border:1px solid var(--brd);border-radius:10px;padding:6px;box-sizing:border-box;">' +
      '<img class="pub-logo-c" src="' + escHtml(a.logo_url) + '" alt="' + escHtml(a.nom) + '" style="max-width:100%;max-height:100%;object-fit:contain;" decoding="async"></div>' +
    '<div style="min-width:0;">' +
      '<div style="font-size:10.5px;font-weight:700;color:var(--mu2);letter-spacing:.05em;text-transform:uppercase;margin-bottom:5px;">' + escHtml(T('pub_titre')) + ' · ' + escHtml(T('pub_mention')) + '</div>' +
      '<div style="font-size:14px;font-weight:700;color:var(--tx);line-height:1.35;margin-bottom:3px;">' + escHtml(a.nom) + '</div>' +
      (a.phrase ? '<div style="font-size:13.5px;color:var(--mu);line-height:1.4;">' + escHtml(a.phrase) + '</div>' : '') +
    '</div></div>';
  return a.lien ? '<a href="' + escHtml(a.lien) + '" target="_blank" rel="noopener sponsored" style="display:block;text-decoration:none;color:inherit;">' + corps + '</a>' : corps;
}

// ── Mécanique commune : une rotation par endroit (gauche, accueil, mobile) ──
var _rot = {};
function rotationPoints(nom) {
  var r = _rot[nom];
  return r.slides.map(function(_, i) {
    var actif = i === r.i;
    return '<button type="button" onclick="rotationAller(\'' + nom + '\',' + i + ')" aria-label="' + (i + 1) + '" aria-current="' + (actif ? 'true' : 'false') + '" style="width:' + (actif ? '20px' : '8px') + ';height:8px;padding:0;border:none;border-radius:9px;cursor:pointer;background:' + (actif ? 'var(--ac)' : 'var(--brd)') + ';transition:all .3s;"></button>';
  }).join('');
}
function rotationAfficher(nom) {
  var r = _rot[nom], zone = document.getElementById(r.zone), pts = r.points ? document.getElementById(r.points) : null;
  if (!zone || !r.slides.length) return;
  var s = r.slides[r.i];
  if (r.hauteurFixe) {                     // la carte partenaire, plus courte, garde la hauteur de la carte CaraLink : rien ne saute
    if (s.t === 'alt') { zone.style.minHeight = '0'; zone.innerHTML = r.html(s); r.h = zone.offsetHeight; }
    else { zone.innerHTML = r.html(s); }
    zone.style.minHeight = r.h ? r.h + 'px' : '';
  } else { zone.innerHTML = r.html(s); }
  if (pts) pts.innerHTML = r.slides.length > 1 ? rotationPoints(nom) : '';
  zone.style.opacity = '1';
}
function rotationAller(nom, i) {
  var r = _rot[nom], zone = r && document.getElementById(r.zone);
  if (!zone || !r.slides.length) return;
  r.i = (i + r.slides.length) % r.slides.length;
  var calme = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (calme) { rotationAfficher(nom); return; }
  zone.style.opacity = '0';
  setTimeout(function() { if (_rot[nom] === r) rotationAfficher(nom); }, 300);
}
// cfg : zone, points (id ou null), html (fonction), delai (ms), pause (id de l'élément qui met en pause au survol), hauteurFixe
function rotationDemarrer(nom, cfg) {
  if (_rot[nom] && _rot[nom].timer) clearInterval(_rot[nom].timer);
  var r = _rot[nom] = { zone: cfg.zone, points: cfg.points, html: cfg.html, hauteurFixe: !!cfg.hauteurFixe, h: 0, i: 0, pause: false, timer: null, slides: slidesFusion() };
  var el = cfg.pause && document.getElementById(cfg.pause);
  if (el) {
    el.onmouseenter = function() { r.pause = true; }; el.onmouseleave = function() { r.pause = false; };
    el.onfocusin = function() { r.pause = true; }; el.onfocusout = function() { r.pause = false; };
  }
  rotationAfficher(nom);
  r.timer = setInterval(function() {
    if (_rot[nom] !== r || !document.getElementById(r.zone)) { clearInterval(r.timer); return; }
    if (r.pause || document.hidden || r.slides.length < 2) return;
    rotationAller(nom, r.i + 1);
  }, cfg.delai);
  // Les partenaires arrivent un instant après : on ajoute leurs cartes sans repartir de zéro.
  lirePubListe().then(function() {
    if (_rot[nom] !== r || !document.getElementById(r.zone)) return;
    var courante = r.slides[r.i];
    r.slides = slidesFusion();
    var k = r.slides.findIndex(function(s) { return courante && s.t === courante.t && (s.b === courante.b || s.a === courante.a); });
    r.i = k < 0 ? 0 : k;
    var pts = r.points ? document.getElementById(r.points) : null;
    if (pts) pts.innerHTML = r.slides.length > 1 ? rotationPoints(nom) : '';
  });
}

function htmlPartnerPanel() {
  return (
    '<div id="rot-gauche-zone" style="transition:opacity .3s;"></div>' +
    '<div id="rot-gauche-points" style="display:flex;justify-content:center;align-items:center;gap:6px;margin:12px 0 14px;"></div>' +
    '<div style="border-top:1px solid var(--brd);padding-top:12px;">' +
      '<div style="font-size:13px;color:var(--mu);line-height:1.6;margin-bottom:10px;">Voyez pourquoi un alternant peut vous coûter très peu en Guadeloupe.</div>' +
      '<a href="https://learnlogicstudio.com/connect.html#section-calculateur" target="_blank" rel="noopener" style="display:inline-block;padding:9px 14px;border-radius:8px;background:var(--ac);color:#fff;font-size:12.5px;font-weight:700;text-decoration:none;">Calculez votre coût réel →</a>' +
    '</div>'
  );
}

function renderPartnerPanel() {
  var zone = document.getElementById('partner-panel');
  if (!zone) return;
  zone.innerHTML = htmlPartnerPanel();
  if (!document.getElementById('style-pub-annuaire')) {
    var st = document.createElement('style'); st.id = 'style-pub-annuaire';
    st.textContent = '.partner-panel{max-height:calc(100vh - 96px);overflow-y:auto;scrollbar-width:thin;}';
    document.head.appendChild(st);
  }
  BESOINS_ALTERNANCE_PUBLIC.forEach(function(b) { var im = new Image(); im.src = b.img; }); // les photos sont prêtes avant d'être affichées
  rotationDemarrer('gauche', { zone: 'rot-gauche-zone', points: 'rot-gauche-points', html: htmlSlideGrande, delai: 6000, pause: 'partner-panel', hauteurFixe: true });
}

// Page d'accueil (avant toute recherche, ordinateur et téléphone) : une petite carte qui alterne, sous le défilement des artisans.
function chargerPubAccueil() {
  var zone = document.getElementById('pub-accueil');
  if (!zone) return;
  zone.innerHTML = '<div class="pub-accueil-in"><div id="rot-accueil-zone" style="transition:opacity .3s;"></div><div id="rot-accueil-points" style="display:flex;justify-content:center;gap:6px;margin-top:10px;"></div></div>';
  rotationDemarrer('accueil', { zone: 'rot-accueil-zone', points: 'rot-accueil-points', html: htmlSlideCompacte, delai: 6000, pause: 'pub-accueil' });
}

// ── Téléphone : UNE carte compacte glissée dans la liste (après la 3e fiche), jamais en haut de page ──
function htmlPubAlternanceMobile() { return htmlSlideCompacte({ t: 'alt', b: BESOINS_ALTERNANCE_PUBLIC[0] }); }
function demarrerPubAlternanceMobile() {
  if (!document.getElementById('pub-alt-mobile')) return;
  if (!document.getElementById('pub-alt-mobile-style')) {
    var st = document.createElement('style'); st.id = 'pub-alt-mobile-style';
    st.textContent = '.pub-alt-mobile{display:none;} @media(max-width:900px){.pub-alt-mobile{display:block;background:var(--panel);border:1px solid var(--brd);border-radius:14px;padding:12px;margin:0 0 14px;box-shadow:0 1px 3px rgba(19,34,60,.05);transition:opacity .35s;}}';
    document.head.appendChild(st);
  }
  rotationDemarrer('mobile', { zone: 'pub-alt-mobile', points: null, html: htmlSlideCompacte, delai: 7000, pause: null });
}

function initCarte() {
  var el = document.getElementById('leaflet-map');
  if (!el || _map) return;
  _map = L.map('leaflet-map', { zoomControl:true, scrollWheelZoom:false }).setView([16.20,-61.45], 9);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 18
  }).addTo(_map);
  window._caraproIcon = L.divIcon({
    html: '<div style="width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#1266E3,#0E4FB8);border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;font-size:12px;color:#fff;font-weight:700;">A</div>',
    className:'', iconSize:[28,28], iconAnchor:[14,14], popupAnchor:[0,-16]
  });
}

function mettreAJourCarte(artisans) {
  if (!_map) { setTimeout(function(){ mettreAJourCarte(artisans); }, 300); return; }
  _mapMarkers.forEach(function(m){ _map.removeLayer(m); });
  _mapMarkers = [];
  artisans.forEach(function(a) {
    var coords = getVilleCoords(a.commune);
    if (!coords) return;
    var marker = L.marker(coords, { icon: window._caraproIcon }).addTo(_map);
    marker.bindPopup('<strong>' + escHtml(a.nom_entreprise) + '</strong><br>' + escHtml(a.commune));
    _mapMarkers.push(marker);
  });
  recentrerCarte();
}

// Centre la carte sur les artisans trouvés (ou sur toute la Guadeloupe s'il n'y en a pas).
// La carte est créée alors qu'elle est encore cachée (avant la 1re recherche) : on lui redonne sa vraie taille d'abord.
var BORNES_GUADELOUPE = [[15.80, -61.85], [16.52, -61.00]];
function recentrerCarte() {
  if (!_map) return;
  try {
    _map.invalidateSize();
    if (_mapMarkers.length === 1) { _map.setView(_mapMarkers[0].getLatLng(), 12); return; }
    if (_mapMarkers.length > 1) { _map.fitBounds(L.featureGroup(_mapMarkers).getBounds(), { padding: [28, 28], maxZoom: 12 }); return; }
    _map.fitBounds(BORNES_GUADELOUPE);
  } catch (e) { /* la carte ne doit jamais gêner la recherche */ }
}

async function chargerArtisans() {
  var zoneListe = document.getElementById('artisans-list');
  var zoneCount = document.getElementById('results-count');
  if (!zoneListe) return;
  zoneListe.innerHTML = atSquelettes(3);

  try {
    var params = new URLSearchParams();
    // Un métier précis, ou tous les métiers du grand secteur choisi (codes séparés par des virgules).
    var codesSecteur = _searchState.secteur || (_searchState.groupe ? metiersDuGroupe(_searchState.groupe).map(function(s) { return s.code; }).join(',') : '');
    if (codesSecteur) params.set('secteur', codesSecteur);
    if (_searchState.commune) params.set('commune', _searchState.commune);
    if (_searchState.rge) params.set('rge', '1');

    var res = await fetch(SUPABASE_URL + '/functions/v1/lister-artisans?' + params.toString(), {
      headers: { 'Authorization': 'Bearer ' + SUPABASE_ANON }
    });
    var data = await res.json();
    if (data.error) throw new Error(data.error);

    var artisans = data.artisans || [];

    if (_searchState.nom) {
      var qNom = _searchState.nom.toLowerCase();
      artisans = artisans.filter(function(a) {
        var secteurTxt = secteurLabel(a.secteur) || '';
        return (a.nom_entreprise || '').toLowerCase().indexOf(qNom) !== -1
          || secteurTxt.toLowerCase().indexOf(qNom) !== -1
          || (a.bio || '').toLowerCase().indexOf(qNom) !== -1;
      });
    }

    if (_searchState.tri === 'note') {
      // Tri choisi par le visiteur (jamais l'ordre par défaut) : sans avis = en dernier, sans jugement.
      artisans.sort(function(a, b) {
        if (a.note_moyenne == null && b.note_moyenne == null) return 0;
        if (a.note_moyenne == null) return 1;
        if (b.note_moyenne == null) return -1;
        return b.note_moyenne - a.note_moyenne;
      });
    }

    if (zoneCount) zoneCount.textContent = artisans.length + ' ' + (artisans.length > 1 ? T('artisan_plusieurs') : T('artisan_un'));

    var cartesHtml = artisans.map(renderArtisanCard);
    if (cartesHtml.length >= 2) cartesHtml.splice(Math.min(3, cartesHtml.length), 0, '<div class="pub-alt-mobile" id="pub-alt-mobile">' + htmlPubAlternanceMobile() + '</div>');
    zoneListe.innerHTML = artisans.length
      ? cartesHtml.join('')
      : '<div class="etat-vide"><div class="etat-vide-titre">' + T('aucun_artisan_titre') + '</div>' + T('aucun_artisan_texte') + '</div>';

    atEntree(zoneListe.children, 0.08);                 // les cartes descendent l'une après l'autre
    if (artisans.length) atDefilerNombre(zoneCount, 700); // « 12 artisans » : le nombre défile jusqu'au vrai total
    artisans.forEach(function(a) { if (a.paiement_en_ligne !== false) chargerApercuCarte(a.id); });
    planifierCoeurs();
    demarrerPubAlternanceMobile();

    mettreAJourCarte(artisans);

  } catch(e) {
    zoneListe.innerHTML = '<div class="etat-vide">' + T('erreur_generale') + '</div>';
    console.error(e);
  }
}

// ════════════════════════════════════════
//  CARTE ARTISAN — même vignette que les formateurs de CaraLink Formation,
//  adaptée à l'artisan : couleur terracotta, ni favoris ni tarif jour/heure,
//  et à la place des créneaux Matin / Après-midi : les vraies plages horaires.
// ════════════════════════════════════════
var _artisansCartes = {};
var LOCALES_CARTE = { fr: 'fr-FR', en: 'en-GB', es: 'es-ES' };
var CLASSES_PASTILLES_CARTE = ['bt-accent', 'bt-green', 'bt-purple', 'bt-amber'];

function localeCarte() { return LOCALES_CARTE[(typeof AT_LANG !== 'undefined' && AT_LANG) || 'fr'] || 'fr-FR'; }

// Date du visiteur au format AAAA-MM-JJ (jamais toISOString : en Guadeloupe, après 20h, il serait déjà "demain" en UTC).
function dateLocaleISO(d) {
  d = d || new Date();
  var m = d.getMonth() + 1, j = d.getDate();
  return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (j < 10 ? '0' : '') + j;
}
function dateCourteCarte(iso) {
  return new Date(iso + 'T12:00:00').toLocaleDateString(localeCarte(), { weekday: 'short', day: 'numeric' });
}
function libelleProchaineDispo(iso) {
  var demain = new Date(); demain.setDate(demain.getDate() + 1);
  if (iso === dateLocaleISO()) return T('dispo_aujourdhui_court');
  if (iso === dateLocaleISO(demain)) return T('dispo_demain_court');
  return T('dispo_le_court') + ' ' + dateCourteCarte(iso);
}

function etoilesCarte(note) {
  var rond = Math.round(Number(note) || 0), h = '';
  for (var i = 1; i <= 5; i++) h += '<span class="' + (i <= rond ? 'star-on' : 'star-off') + '">★</span>';
  return h;
}

// Services de l'artisan en pastilles colorées (4 max + "+N"), comme les compétences d'un formateur.
function pastillesServicesCarte(services) {
  if (!services || !services.length) return '';
  var html = services.slice(0, 4).map(function(nom, i) {
    return '<span class="badge-trust bt-accent">' + escHtml(nom) + '</span>'; // toutes les prestations ont la même couleur
  }).join('');
  if (services.length > 4) html += '<span class="badge-trust bt-more">+' + (services.length - 4) + '</span>';
  return html;
}
// Ordre des pastilles : « Vérifié » d'abord, puis « Nouveau sur CaraLink » (bleu neutre (ni étoile ni doré), jamais une recommandation).
function badgeNouveauCarte(a) {
  return a.nouveau ? '<span class="badge-trust bt-blue" title="' + escHtml(T('badge_nouveau_info')) + '">' + escHtml(T('badge_nouveau')) + '</span>' : '';
}
// « Vérifié » en vert, à droite de la carte (là où se trouvait « Disponibilités en temps réel »).
// Bloc d'information « aides à la rénovation » : INFORMATION SEULEMENT (aucun montant, aucune promesse d'aide, aucun calcul).
// Source des règles : france-renov.gouv.fr (page « MaPrimeRénov' en Outre-mer »). Le lien renvoie vers le site officiel.
function htmlAidesInfo() {
  if (!document.getElementById('style-aides-info')) {
    var st = document.createElement('style'); st.id = 'style-aides-info';
    st.textContent = '.aides-info{margin:12px auto 0;max-width:560px;text-align:left;border:1px solid var(--line,#e3eaf4);border-radius:14px;background:rgba(255,255,255,.75);font-size:13px;color:var(--ink,#13223c);}' +
      '.aides-info summary{cursor:pointer;padding:10px 16px;font-weight:600;list-style:none;}' +
      '.aides-info summary::-webkit-details-marker{display:none;}' +
      '.aides-info .aides-corps{padding:0 16px 14px;line-height:1.55;}' +
      '.aides-info .aides-corps ul{margin:6px 0 8px 18px;padding:0;}' +
      '.aides-info .aides-note{font-size:12px;color:var(--mu,#6b7a90);margin-top:8px;}';
    document.head.appendChild(st);
  }
  return '<details class="aides-info"><summary>🌿 ' + escHtml(T('aides_titre')) + '</summary><div class="aides-corps">' +
    '<p>' + escHtml(T('aides_intro')) + '</p>' +
    '<ul><li>' + escHtml(T('aides_p1')) + '</li><li>' + escHtml(T('aides_p2')) + '</li><li>' + escHtml(T('aides_p3')) + '</li></ul>' +
    '<p><a href="https://france-renov.gouv.fr/aides/mpr-outremer" target="_blank" rel="noopener noreferrer" style="color:var(--ac,#1266E3);font-weight:700;">' + escHtml(T('aides_lien')) + ' →</a></p>' +
    '<p class="aides-note">' + escHtml(T('aides_avert')) + '</p></div></details>';
}

// Vidéo de présentation pour les clients : repliée par défaut, ne charge rien tant qu'on ne l'ouvre pas.
function htmlVideoClients() {
  if (!document.getElementById('style-video-clients')) {
    var st = document.createElement('style'); st.id = 'style-video-clients';
    st.textContent = '.vid-clients{margin:12px auto 0;max-width:560px;text-align:left;border:1px solid var(--line,#e3eaf4);border-radius:14px;background:rgba(255,255,255,.75);font-size:13px;color:var(--ink,#13223c);}' +
      '.vid-clients summary{cursor:pointer;padding:10px 16px;font-weight:600;list-style:none;}' +
      '.vid-clients summary::-webkit-details-marker{display:none;}' +
      '.vid-clients .vid-corps{padding:0 16px 16px;text-align:center;}' +
      '.vid-clients video{width:min(72vw,280px);aspect-ratio:9/16;border-radius:24px;border:1px solid var(--line,#e3eaf4);box-shadow:0 14px 40px rgba(19,34,60,.14);background:#fff;object-fit:cover;display:block;margin:0 auto;}' +
      '.vid-clients .vid-note{font-size:12px;color:var(--mu,#6b7a90);margin-top:8px;}' +
      '.infos-duo{display:flex;flex-wrap:wrap;gap:0 12px;justify-content:center;align-items:flex-start;max-width:1160px;margin:0 auto;}' +
      '.infos-duo .aides-info,.infos-duo .vid-clients{flex:1 1 420px;min-width:0;}' +
      '.vid-clients:not([open]){animation:vidDouce 2.6s ease-in-out infinite;}' +
      '.vid-clients:not([open]):hover{animation:none;}' +
      '@keyframes vidDouce{0%,100%{box-shadow:0 0 0 0 rgba(18,102,227,0);border-color:var(--line,#e3eaf4);background:rgba(255,255,255,.75);}50%{box-shadow:0 0 0 5px rgba(18,102,227,.16);border-color:rgba(18,102,227,.55);background:rgba(255,246,241,.95);}}' +
      '@media (prefers-reduced-motion:reduce){.vid-clients:not([open]){animation:none;border-color:rgba(18,102,227,.45);}}';
    document.head.appendChild(st);
  }
  return '<details class="vid-clients" ontoggle="if(!this.open){var v=this.querySelector(\'video\');if(v)v.pause();}"><summary>▶️ ' + escHtml(T('vid_clients_titre')) + '</summary><div class="vid-corps">' +
    '<video controls playsinline preload="none" controlslist="nodownload" poster="/artisans/img/caralink-clients.jpg" aria-label="' + escHtml(T('vid_clients_label')) + '"><source src="/artisans/img/caralink-clients.mp4" type="video/mp4"></video>' +
    '<p class="vid-note">' + escHtml(T('vid_clients_note')) + '</p></div></details>';
}

function badgeRgeTexte(a) {
  if (!a.rge) return '';
  var d = a.rge_jusqu ? new Date(a.rge_jusqu + 'T12:00:00Z').toLocaleDateString() : '';
  return '<span class="badge-trust bt-green" title="' + escHtml(T('badge_rge_titre')) + (d ? ' — ' + escHtml(T('badge_rge_jusqu')) + ' ' + escHtml(d) : '') + '">🌿 RGE</span>';
}
function badgeVerifieCarte(a) {
  return (a.verifie ? '<span class="badge-trust bt-green bt-verifie" title="SIRET et assurance vérifiés">✅ ' + escHtml(T('badge_verifie')) + '</span>' : '') + badgeRgeTexte(a);
}
// « sur les produits » / « sur les prestations » / les deux : où un cashback ou un code promo s'applique.
function libelleScopeAvantage(ventes, interventions) {
  return T(ventes && interventions ? 'avt_s_vi' : (ventes ? 'avt_s_v' : 'avt_s_i'));
}
// Pastilles de la vignette : cashback et code promo, avec ce qu'ils couvrent (jamais un code « partenaire » masqué : le serveur ne l'envoie pas).
function avantagesCarteHtml(av) {
  if (!av) return '';
  var h = '';
  if (av.cashback) h += '<span class="badge-trust bt-green">' + escHtml(T('perk_cashback').replace('{p}', Math.round(av.cashback.pct)) + ' ' + libelleScopeAvantage(av.cashback.ventes, av.cashback.interventions)) + '</span>';
  if (av.code_promo) h += '<span class="badge-trust bt-accent">' + escHtml(T('avt_code').replace('{c}', av.code_promo.code).replace('{p}', Math.round(av.code_promo.pct)) + ' ' + libelleScopeAvantage(av.code_promo.ventes, av.code_promo.interventions)) + '</span>';
  return h;
}
function pastillesSpecialesCarte(a) {
  var h = '';
  if (a.alternance_niveau >= 2) h += '<span class="badge-trust bt-purple" title="Cette entreprise s\'engage activement pour la formation locale">🟠 Tremplin des jeunes</span>';
  if (a.tarif_min != null) h += '<span class="badge-trust bt-accent">' + T('des_prefix') + ' ' + a.tarif_min + '€</span>';
  return h;
}

// Libellé court d'une journée bloquée par l'artisan (type choisi dans une liste, jamais de texte libre) — null si le jour n'est pas bloqué.
function libelleFermeture(code) {
  if (!code) return '';
  var cles = { vacances: 'fermeture_vacances', fermeture: 'fermeture_fermeture', inventaire: 'fermeture_inventaire', formation: 'fermeture_formation' };
  return T(cles[code] || 'fermeture_autre');
}

// Une colonne de la grille : jour + plages horaires (début–fin). Une plage "complète" est grisée ; un jour fermé affiche —.
function colonneJourCarte(j) {
  var slots = (j.ferme || !j.plages.length)
    ? (j.fermeture
        ? '<div class="dispo-slot unavailable" style="font-size:10px;line-height:1.25;white-space:normal;">' + escHtml(libelleFermeture(j.fermeture)) + '</div>'
        : '<div class="dispo-slot unavailable">—</div>')
    : j.plages.map(function(p) {
        return '<div class="dispo-slot ' + (p.libre ? 'available' : 'unavailable') + '"' + (p.libre ? '' : ' title="' + escHtml(T('dispo_complet')) + '"') + '>' +
          (p.fixe ? '<span class="h-deb">' + p.debut + '</span>' : '<span class="h-deb">' + p.debut + '</span><span class="h-sep">–</span><span class="h-fin">' + p.fin + '</span>') + '</div>'; // p.fixe : l'artisan donne ses heures précises (8:00 · 10:00…)
      }).join('');
  return '<div class="dispo-day"><div class="dispo-day-label">' + escHtml(dateCourteCarte(j.date)) + '</div>' + slots + '</div>';
}

// ── Favoris (cœur) : le client connecté retrouve ses artisans dans « Mon compte → Favoris ». Sans compte, on propose d'en créer un. ──
var _favIds = null, _favTimer = null; // _favIds : { idArtisan: true } une fois chargé ; null = pas encore connu / pas connecté
async function jetonFav() {
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
function coeurHtml(id, enLigne) {
  return '<button type="button" class="coeur-btn' + (enLigne ? ' coeur-inline' : '') + '" data-coeur="' + escHtml(id) + '" aria-pressed="false" title="' + escHtml(T('coeur_ajouter')) + '" aria-label="' + escHtml(T('coeur_ajouter')) + '" onclick="basculerCoeur(event, ' + jsAttr(id) + ')">☆</button>';
}
function peindreCoeurs() {
  if (!document.getElementById('style-coeur')) {
    var st = document.createElement('style'); st.id = 'style-coeur';
    st.textContent = '.coeur-btn{position:absolute;top:10px;right:12px;z-index:2;width:34px;height:34px;border-radius:50%;border:1px solid rgba(0,0,0,.12);background:rgba(255,255,255,.92);color:#0E4FB8;font-size:19px;line-height:1;cursor:pointer;padding:0;}' +
      '.coeur-btn.coeur-inline{position:static;display:inline-block;vertical-align:middle;margin-left:10px;width:32px;height:32px;font-size:18px;}' +
      '.coeur-btn.on{background:#1266E3;color:#fff;border-color:#1266E3;}';
    document.head.appendChild(st);
  }
  var tous = document.querySelectorAll('[data-coeur]');
  for (var i = 0; i < tous.length; i++) {
    var b = tous[i], on = !!(_favIds && _favIds[b.getAttribute('data-coeur')]);
    b.textContent = on ? '★' : '☆';
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.title = T(on ? 'coeur_retirer' : 'coeur_ajouter'); b.setAttribute('aria-label', b.title);
  }
}
function planifierCoeurs() { clearTimeout(_favTimer); _favTimer = setTimeout(majCoeurs, 60); }
async function majCoeurs() {
  peindreCoeurs();
  var jeton = await jetonFav();
  if (!jeton) return;
  if (_favIds === null) {
    try {
      var r = await fetch(SUPABASE_URL + '/rest/v1/rpc/mes_favoris_ids', { method: 'POST', headers: { 'apikey': SUPABASE_ANON, 'Authorization': 'Bearer ' + jeton, 'Content-Type': 'application/json' }, body: '{}' });
      if (r.ok) { var ids = await r.json(); _favIds = {}; (Array.isArray(ids) ? ids : []).forEach(function(x) { _favIds[x] = true; }); }
    } catch (e) { /* les cœurs restent vides : jamais bloquant */ }
  }
  peindreCoeurs();
}
async function basculerCoeur(ev, id) {
  if (ev) { ev.stopPropagation(); ev.preventDefault(); }
  var jeton = await jetonFav();
  if (!jeton) {
    if (confirm(T('coeur_connexion'))) location.href = 'compte.html?retour=' + encodeURIComponent(location.href.split('#')[0]);
    return;
  }
  if (_favIds === null) await majCoeurs();
  if (_favIds === null) _favIds = {};
  var veut = !_favIds[id];
  try {
    var r = await fetch(SUPABASE_URL + '/rest/v1/rpc/favori_basculer', { method: 'POST', headers: { 'apikey': SUPABASE_ANON, 'Authorization': 'Bearer ' + jeton, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_artisan: id, p_actif: veut }) });
    var d = r.ok ? await r.json() : null;
    if (d && d.ok) { if (veut) _favIds[id] = true; else delete _favIds[id]; peindreCoeurs(); return; }
    alert(d && d.erreur === 'limite' ? T('coeur_limite') : T('cpt_err_generique'));
  } catch (e) { alert(T('cpt_err_generique')); }
}

// ── Sessions avec places (Lot 25) : coaching, atelier… plusieurs personnes à la même heure ──
var _sessionsFiche = {};
function dateHeureSessionPub(d, h) {
  var j = new Date(d + 'T12:00:00Z').toLocaleDateString(localeCarte(), { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  var p = String(h).split(':');
  return j + ' · ' + parseInt(p[0], 10) + ' h' + (p[1] === '00' ? '' : ' ' + p[1]);
}
function placesSessionTxt(n) { return n <= 0 ? T('sess_complet') : (n === 1 ? T('sess_une_place') : n + ' ' + T('sess_places')); }
function prixSessionTxt(p) { return p > 0 ? p.toFixed(2).replace('.', ',') + ' € ' + T('sess_par_pers') : T('sess_gratuit'); }
function sessionsCarteHtml(liste) {
  var x = liste[0];
  return '<div class="session-carte">🎓 <b>' + escHtml(x.titre) + '</b><br>' + escHtml(dateHeureSessionPub(x.date, x.heure)) + ' · ' + escHtml(placesSessionTxt(x.places_restantes)) +
    (liste.length > 1 ? '<br>+ ' + (liste.length - 1) + ' ' + escHtml(T('sess_et_autres')) : '') + '</div>';
}
function sessionsFicheHtml(liste, artisanId) {
  if (!liste || !liste.length) return '';
  liste.forEach(function(x) { _sessionsFiche[x.id] = x; });
  return '<div class="sessions-fiche"><h4>🎓 ' + escHtml(T('sess_titre')) + '</h4>' + liste.map(function(x) {
    var complet = x.places_restantes <= 0;
    return '<div class="session-fiche"><div class="s-t">' + escHtml(x.titre) + '</div>' +
      '<div class="s-i">📅 ' + escHtml(dateHeureSessionPub(x.date, x.heure)) + ' · ' + x.duree_min + ' min<br>📍 ' + escHtml(x.lieu) + '<br>💶 ' + escHtml(prixSessionTxt(x.prix)) + '<br>👥 ' + escHtml(placesSessionTxt(x.places_restantes)) +
      (x.description ? '<br>' + escHtml(x.description) : '') + '</div>' +
      '<button type="button"' + (complet ? ' disabled' : ' onclick="ouvrirReservationSession(' + jsAttr(x.id) + ',' + jsAttr(artisanId) + ')"') + '>' + escHtml(complet ? T('sess_complet') : T('sess_reserver')) + '</button></div>';
  }).join('') + '</div>';
}
function ouvrirReservationSession(sid, artisanId) {
  var x = _sessionsFiche[sid]; if (!x) return;
  var ancien = document.getElementById('interet-fond'); if (ancien) ancien.remove();
  var max = Math.min(5, x.places_restantes), opts = '';
  for (var n = 1; n <= max; n++) opts += '<option value="' + n + '">' + n + '</option>';
  var f = document.createElement('div'); f.id = 'interet-fond'; f.className = 'interet-fond';
  f.innerHTML = '<div class="interet-boite" role="dialog" aria-modal="true" aria-labelledby="sess-t">' +
    '<h3 id="sess-t">' + escHtml(x.titre) + '</h3>' +
    '<p>📅 ' + escHtml(dateHeureSessionPub(x.date, x.heure)) + '<br>📍 ' + escHtml(x.lieu) + '<br>💶 ' + escHtml(prixSessionTxt(x.prix)) + (x.prix > 0 ? '<br>' + escHtml(T('sess_paiement')) : '') + '</p>' +
    (max > 1 ? '<label style="font-size:13px;display:block;margin-bottom:4px;">' + escHtml(T('sess_nb')) + '</label><select id="sess-nb" style="width:100%;box-sizing:border-box;border:1px solid #d9e1ee;border-radius:10px;padding:10px 12px;font:inherit;font-size:15px;margin-bottom:10px;">' + opts + '</select>' : '') +
    '<input id="sess-nom" type="text" maxlength="60" autocomplete="name" placeholder="' + escHtml(T('sess_nom')) + '" aria-label="' + escHtml(T('sess_nom')) + '">' +
    '<input id="sess-tel" type="tel" maxlength="20" autocomplete="tel" inputmode="tel" placeholder="' + escHtml(T('sess_tel')) + '" aria-label="' + escHtml(T('sess_tel')) + '">' +
    '<input id="sess-email" type="email" maxlength="120" autocomplete="email" inputmode="email" placeholder="' + escHtml(T('sess_email')) + '" aria-label="' + escHtml(T('sess_email')) + '">' +
    '<div class="i-msg" id="interet-etat" role="status"></div>' +
    '<div class="i-act"><button type="button" onclick="document.getElementById(\'interet-fond\').remove()">' + escHtml(T('interet_annuler')) + '</button>' +
    '<button type="button" class="i-ok" id="interet-envoi" onclick="envoyerReservationSession(' + jsAttr(sid) + ',' + jsAttr(artisanId) + ')">' + escHtml(T('sess_confirmer')) + '</button></div></div>';
  f.addEventListener('click', function(ev) { if (ev.target === f) f.remove(); });
  document.body.appendChild(f);
  var c = document.getElementById('sess-nom'); if (c) c.focus();
}
async function envoyerReservationSession(sid, artisanId) {
  var etat = document.getElementById('interet-etat'), btn = document.getElementById('interet-envoi');
  var nom = (document.getElementById('sess-nom').value || '').trim(), tel = (document.getElementById('sess-tel').value || '').trim();
  var mail = (document.getElementById('sess-email').value || '').trim(), sel = document.getElementById('sess-nb');
  if (!nom || !tel) { etat.style.color = '#dc2626'; etat.textContent = T('sess_err_champs'); return; }
  btn.disabled = true; etat.style.color = '#5d6b82'; etat.textContent = '…';
  try {
    var res = await fetch(SUPABASE_URL + '/functions/v1/reserver-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + SUPABASE_ANON },
      body: JSON.stringify({ session_id: sid, nom: nom, telephone: tel, email: mail || undefined, nb_places: sel ? parseInt(sel.value, 10) : 1 }),
    });
    var d = await res.json().catch(function() { return {}; });
    if (res.ok && d.ok) {
      etat.style.color = '#0f9d78'; etat.textContent = mail ? T('sess_merci_mail') : T('sess_merci');
      setTimeout(function() { var f = document.getElementById('interet-fond'); if (f) f.remove(); chargerApercuDispo(artisanId); }, 2200);
      return;
    }
    etat.style.color = '#dc2626'; etat.textContent = d.error || T('cpt_err_generique'); btn.disabled = false;
    if (d.code === 'complet' || d.code === 'pas_assez') chargerApercuDispo(artisanId);
  } catch (e) { etat.style.color = '#dc2626'; etat.textContent = T('cpt_err_generique'); btn.disabled = false; }
}

// ── « Prévenir cet artisan » (Lot 24) : le client dit à un artisan pas encore réservable qu'il aimerait réserver chez lui ──
function ouvrirInteret(id) {
  var ancien = document.getElementById('interet-fond'); if (ancien) ancien.remove();
  var f = document.createElement('div'); f.id = 'interet-fond'; f.className = 'interet-fond';
  f.innerHTML = '<div class="interet-boite" role="dialog" aria-modal="true" aria-labelledby="interet-t">' +
    '<h3 id="interet-t">' + escHtml(T('interet_titre')) + '</h3><p>' + escHtml(T('interet_aide')) + '</p>' +
    '<input id="interet-prenom" type="text" maxlength="40" autocomplete="given-name" placeholder="' + escHtml(T('interet_prenom')) + '" aria-label="' + escHtml(T('interet_prenom')) + '">' +
    '<textarea id="interet-msg" rows="2" maxlength="300" placeholder="' + escHtml(T('interet_msg')) + '" aria-label="' + escHtml(T('interet_msg')) + '"></textarea>' +
    '<div class="i-msg" id="interet-etat" role="status"></div>' +
    '<div class="i-act"><button type="button" onclick="document.getElementById(\'interet-fond\').remove()">' + escHtml(T('interet_annuler')) + '</button>' +
    '<button type="button" class="i-ok" id="interet-envoi" onclick="envoyerInteret(' + jsAttr(id) + ')">' + escHtml(T('interet_envoyer')) + '</button></div></div>';
  f.addEventListener('click', function(ev) { if (ev.target === f) f.remove(); });
  document.body.appendChild(f);
  var champ = document.getElementById('interet-prenom'); if (champ) champ.focus();
}
async function envoyerInteret(id) {
  var etat = document.getElementById('interet-etat'), btn = document.getElementById('interet-envoi');
  var prenom = (document.getElementById('interet-prenom').value || '').trim();
  var msg = (document.getElementById('interet-msg').value || '').trim();
  if (!prenom) { etat.style.color = '#dc2626'; etat.textContent = T('interet_err_prenom'); return; }
  btn.disabled = true; etat.style.color = '#5d6b82'; etat.textContent = '…';
  try {
    var res = await fetch(SUPABASE_URL + '/functions/v1/prevenir-artisan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + SUPABASE_ANON },
      body: JSON.stringify({ artisan_id: id, prenom: prenom, message: msg || undefined }),
    });
    var d = await res.json().catch(function() { return {}; });
    if (res.ok && d.ok) {
      etat.style.color = '#0f9d78'; etat.textContent = d.deja ? T('interet_deja') : T('interet_merci');
      setTimeout(function() { var f = document.getElementById('interet-fond'); if (f) f.remove(); }, 1800);
      return;
    }
    etat.style.color = '#dc2626'; etat.textContent = d.error || T('cpt_err_generique'); btn.disabled = false;
  } catch (e) { etat.style.color = '#dc2626'; etat.textContent = T('cpt_err_generique'); btn.disabled = false; }
}

function renderArtisanCard(a) {
  _artisansCartes[a.id] = a;
  var ini = initiales(a.nom_entreprise);
  var photo = a.photo_profil_url
    ? '<img src="' + escHtml(a.photo_profil_url) + '" class="card-avatar" alt="">'
    : '<div class="avatar card-avatar">' + ini + '</div>';
  var noteAff = a.note_moyenne != null ? Number(a.note_moyenne) : 0;
  var nb = a.nb_avis || 0;
  var grise = a.paiement_en_ligne === false; // Stripe pas finalisé : visible, en couleurs, mais pas réservable — le client peut le prévenir
  if (!document.getElementById('style-carte-grisee')) {
    var stg = document.createElement('style'); stg.id = 'style-carte-grisee';
    stg.textContent = '.formateur-card.carte-grisee{cursor:pointer;}' +
      '.carte-grisee-note{margin-top:10px;padding:10px 12px;border-radius:12px;background:#eef4ff;border:1px solid #cfe0fb;color:#1f3b63;font-size:12.5px;line-height:1.5;}.carte-grisee-note b{color:#13223c;}' +
      '.carte-grisee-note button{display:block;width:100%;margin-top:9px;min-height:44px;border:0;border-radius:12px;background:#1565e8;color:#fff;font:inherit;font-weight:700;font-size:14px;cursor:pointer;}' +
      '.interet-fond{position:fixed;inset:0;background:rgba(19,34,60,.55);z-index:99999;display:flex;align-items:flex-end;justify-content:center;padding:12px;}' +
      '.interet-boite{background:#fff;border-radius:18px;max-width:420px;width:100%;padding:18px;box-sizing:border-box;color:#13223c;font-family:inherit;}' +
      '.interet-boite h3{margin:0 0 6px;font-size:17px;}.interet-boite p{margin:0 0 12px;font-size:13.5px;color:#5d6b82;}' +
      '.interet-boite input,.interet-boite textarea{width:100%;box-sizing:border-box;border:1px solid #d9e1ee;border-radius:10px;padding:10px 12px;font:inherit;font-size:15px;margin-bottom:10px;}' +
      '.interet-boite .i-act{display:flex;gap:8px;}.interet-boite .i-act button{flex:1;min-height:46px;border-radius:12px;border:1px solid #d9e1ee;background:#fff;color:#13223c;font:inherit;font-weight:600;cursor:pointer;}.interet-boite .i-act button.i-ok{background:#1565e8;border-color:#1565e8;color:#fff;}' +
      '.interet-boite .i-msg{font-size:13.5px;margin:0 0 10px;min-height:18px;}' +
      '.session-carte{margin-top:8px;padding:8px 10px;border-radius:10px;background:#EEF4FF;border:1px solid #f6d99b;font-size:12.5px;line-height:1.45;color:#7a4b00;}' +
      '.sessions-fiche{margin:14px 0;}.sessions-fiche h4{margin:0 0 8px;font-size:14px;}' +
      '.session-fiche{border:1px solid #f6d99b;background:#F7FAFF;border-radius:14px;padding:12px;margin-bottom:8px;color:#13223c;}' +
      '.session-fiche .s-t{font-weight:700;font-size:14.5px;}.session-fiche .s-i{font-size:13px;color:#5d6b82;margin:3px 0 8px;line-height:1.5;}' +
      '.session-fiche button{width:100%;min-height:44px;border:0;border-radius:12px;background:#1565e8;color:#fff;font:inherit;font-weight:700;cursor:pointer;}.session-fiche button[disabled]{background:#c7cfdc;cursor:default;}';
    document.head.appendChild(stg);
  }
  var noteGrisee = grise ? '<div class="carte-grisee-note"><b>' + escHtml(T('carte_grisee_titre')) + '</b><br>' + escHtml(T('carte_grisee_texte')) +
    '<button type="button" onclick="event.stopPropagation();ouvrirInteret(' + jsAttr(a.id) + ')">' + escHtml(T('interet_bouton')) + '</button></div>' : '';
  return '<div class="formateur-card' + (grise ? ' carte-grisee' : '') + '" style="position:relative;"' + ' onclick="ouvrirProfil(' + jsAttr(a.id) + ')"' + '>' + (grise ? '' : coeurHtml(a.id, false)) +
    '<div class="card-top-row">' + photo +
      '<div class="card-info">' +
        '<div class="card-name">' + escHtml(a.nom_entreprise) + '</div>' +
        '<div class="card-title">' + secteurLabel(a.secteur) + ' · 📍 ' + escHtml(a.commune) + '</div>' +
        '<div class="card-tags" id="tags-carte-' + escHtml(a.id) + '">' + badgeVerifieCarte(a) + badgeNouveauCarte(a) + pastillesSpecialesCarte(a) + '</div>' +
      '</div>' +
    '</div>' +
    (a.bio ? '<div class="card-bio">' + escHtml(a.bio) + '</div>' : '') +
    '<div class="card-meta">' +
      (nb > 0
        ? '<div class="card-stars">' + etoilesCarte(noteAff) + '<span>' + noteAff.toFixed(1) + ' (' + nb + ' ' + (nb === 1 ? T('avis_un') : T('avis_plusieurs')) + ')</span></div>'
        : '<div class="card-stars"><span style="color:var(--mu2,#777);">' + escHtml(T('avis_aucun_court')) + '</span></div>') +
      '<div class="card-badges" id="dispo-carte-' + escHtml(a.id) + '"></div>' +
    '</div>' +
    (a.a_photos ? '<div style="font-size:12px;color:var(--mu2,#777);margin:2px 0 6px;">📷 ' + escHtml(T('badge_photos')) + '</div>' : '') +
    '<div class="dispo-grid" id="grille-carte-' + escHtml(a.id) + '" style="display:none;"></div>' +
    '<div id="avantages-carte-' + escHtml(a.id) + '" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;"></div>' +
    '<div id="sessions-carte-' + escHtml(a.id) + '"></div>' +
    '<div id="phares-carte-' + escHtml(a.id) + '"></div>' + noteGrisee +
  '</div>';
}

// Complète la vignette avec les données du serveur : services (pastilles), semaine en cours et prochaine dispo.
async function chargerApercuCarte(id) {
  var a = _artisansCartes[id];
  var zoneTags = document.getElementById('tags-carte-' + id);
  var zoneDispo = document.getElementById('dispo-carte-' + id);
  var grille = document.getElementById('grille-carte-' + id);
  var zonePhares = document.getElementById('phares-carte-' + id);
  var zoneAvantages = document.getElementById('avantages-carte-' + id);
  if (!a || !zoneTags) return;
  try {
    var res = await fetch(SUPABASE_URL + '/functions/v1/verifier-disponibilite-artisan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + SUPABASE_ANON },
      body: JSON.stringify({ mode: 'apercu', artisan_id: id, aujourdhui: dateLocaleISO() }),
    });
    var data = await res.json();
    if (data.error) return;

    zoneTags.innerHTML = badgeVerifieCarte(a) + badgeNouveauCarte(a) + pastillesServicesCarte(data.services) + pastillesSpecialesCarte(a);
    if (zoneAvantages) zoneAvantages.innerHTML = avantagesCarteHtml(data.avantages);

    if (data.semaine && data.semaine.length && zoneDispo && grille) {
      var dispo = data.prochaine_date
        ? '<span class="card-dispo now"><span class="dispo-dot now"></span>' + escHtml(libelleProchaineDispo(data.prochaine_date)) + '</span>'
        : '<span class="card-dispo none"><span class="dispo-dot none"></span>' + escHtml(T('dispo_aucune_carte')) + '</span>';
      zoneDispo.innerHTML = dispo;
      grille.innerHTML = data.semaine.map(colonneJourCarte).join('');
      grille.style.display = 'grid';
    }

    var zoneSess = document.getElementById('sessions-carte-' + id);
    if (zoneSess && data.sessions && data.sessions.length) zoneSess.innerHTML = sessionsCarteHtml(data.sessions);

    if (zonePhares && data.produits_phares && data.produits_phares.length) {
      var miniatures = data.produits_phares.map(function(p) {
        return p.url_photo
          ? '<img src="' + escHtml(p.url_photo) + '" class="phare-mini" alt="' + escHtml(p.nom) + '" title="' + escHtml(p.nom) + '">'
          : '<div class="phare-mini phare-mini-vide" title="' + escHtml(p.nom) + '">📦</div>';
      }).join('');
      var lienBoutique = data.slug_catalogue
        ? '<a href="catalogue.html?s=' + encodeURIComponent(data.slug_catalogue) + '" class="phares-lien btn-boutique-or" target="_blank" rel="noopener" onclick="event.stopPropagation();">🛍️<span class="btn-or-txt">' + escHtml(T('phares_voir_boutique')) + ' →</span></a>'
        : '';
      var promoVentes = !data.avantages || !data.avantages.code_promo || data.avantages.code_promo.ventes !== false; // code réservé aux interventions : pas à côté de la boutique
      var promo = (data.code_promo && promoVentes)
        ? '<span class="phares-code-promo">🎁 ' + escHtml(data.code_promo) + '</span>'
        : '';
      zonePhares.innerHTML =
        '<div class="phares-bloc">' +
          '<div class="phares-titre">' + escHtml(T('phares_titre')) + '</div>' +
          '<div class="phares-photos">' + miniatures + '</div>' +
          '<div class="phares-bas">' + lienBoutique + promo + '</div>' +
        '</div>';
    }
  } catch (e) { /* la vignette reste complète et utilisable sans l'aperçu */ }
}

// ════════════════════════════════════════
//  PROFIL DÉTAILLÉ
// ════════════════════════════════════════
async function ouvrirProfil(id) {
  var div = document.getElementById('modal-profil');
  if (!div) { div = document.createElement('div'); div.id = 'modal-profil'; document.body.appendChild(div); }
  div.innerHTML = '<div style="position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:10001;display:flex;align-items:center;justify-content:center;padding:12px;"><div style="background:var(--panel,#fff);border-radius:14px;padding:30px;color:var(--mu);">' + T('chargement') + '</div></div>';

  var statutHttp = 0; // 0 = pas de réponse du tout (connexion coupée)
  try {
    var res = await fetch(SUPABASE_URL + '/functions/v1/lire-artisan?id=' + encodeURIComponent(id), {
      headers: { 'Authorization': 'Bearer ' + SUPABASE_ANON }
    });
    statutHttp = res.status;
    var data = await res.json();
    if (data.error) throw new Error(data.error);

    _profilDataCourant = data;
    div.innerHTML = buildProfilHTML(data);
    initFicheFx();
    if (data.artisan.paiement_en_ligne !== false) chargerApercuDispo(data.artisan.id);

  } catch(e) {
    afficherFicheIndisponible(id, statutHttp);
  }
}
// Fiche impossible à afficher : un message DOUX (jamais « Erreur : … » brut) et toujours une sortie (avant, l'écran d'erreur ne se fermait pas).
//  404 / 400 : la fiche n'existe plus (désactivée, supprimée, lien ancien) → on invite à voir les autres artisans.
//  429       : trop de consultations → réessayer dans un instant.   Autre / pas de réponse : problème de connexion → réessayer.
function afficherFicheIndisponible(id, statut) {
  var div = document.getElementById('modal-profil'); if (!div) return;
  var absente = statut === 404 || statut === 400, occupee = statut === 429;
  var icone = absente ? '🔍' : (occupee ? '⏳' : '📡');
  var titre = absente ? T('fiche_indisponible_titre') : (occupee ? T('fiche_occupee_titre') : T('fiche_erreur_titre'));
  var texte = absente ? T('fiche_indisponible_texte') : (occupee ? T('fiche_occupee_texte') : T('fiche_erreur_texte'));
  var style = 'padding:11px 18px;border-radius:10px;font-family:inherit;font-size:14px;font-weight:600;cursor:pointer;';
  var principal = absente
    ? '<button type="button" onclick="fermerProfil({target:this,currentTarget:this})" style="' + style + 'border:none;background:var(--ac,#1266E3);color:#fff;">' + T('fiche_voir_artisans') + '</button>'
    : '<button type="button" onclick="ouvrirProfil(' + jsAttr(id) + ')" style="' + style + 'border:none;background:var(--ac,#1266E3);color:#fff;">' + T('fiche_reessayer') + '</button>' +
      '<button type="button" onclick="fermerProfil({target:this,currentTarget:this})" style="' + style + 'border:1px solid var(--line,#ddd);background:transparent;color:inherit;">' + T('partage_fermer') + '</button>';
  div.innerHTML = '<div onclick="fermerProfil(event)" style="position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:10001;display:flex;align-items:center;justify-content:center;padding:12px;">' +
    '<div style="background:var(--panel,#fff);border-radius:16px;padding:30px 26px;max-width:380px;width:100%;text-align:center;">' +
      '<div style="font-size:38px;margin-bottom:10px;">' + icone + '</div>' +
      '<div style="font-family:Fraunces,serif;font-size:19px;font-weight:700;margin-bottom:8px;">' + titre + '</div>' +
      '<div style="font-size:13.5px;line-height:1.5;color:var(--mu2,#777);margin-bottom:18px;">' + texte + '</div>' +
      '<div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">' + principal + '</div>' +
    '</div></div>';
}
// ── Partager la fiche d'un artisan : menu de partage du téléphone, sinon une petite fenêtre (copier le lien, WhatsApp, Facebook, email) ──
function urlFichePartage(artisanId) { return location.origin + '/artisans/?artisan=' + encodeURIComponent(artisanId); }
async function partagerFiche(artisanId) {
  var a = _profilDataCourant && _profilDataCourant.artisan;
  if (!a || a.id !== artisanId) return;
  var url = urlFichePartage(a.id), texte = T('partage_texte_1') + a.nom_entreprise + T('partage_texte_2');
  if (navigator.share) {
    try { await navigator.share({ title: a.nom_entreprise, text: texte, url: url }); return; }
    catch (e) { if (e && e.name === 'AbortError') return; /* le client a refermé le menu : rien à faire ; autre échec : on propose la fenêtre */ }
  }
  ouvrirMenuPartage(url, texte, a.nom_entreprise);
}
function ouvrirMenuPartage(url, texte, nom, titreMenu) {
  var div = document.getElementById('modal-partage');
  if (!div) { div = document.createElement('div'); div.id = 'modal-partage'; document.body.appendChild(div); }
  var bouton = 'display:flex;align-items:center;gap:10px;width:100%;box-sizing:border-box;padding:11px 14px;border:1px solid var(--line,#ddd);border-radius:10px;background:transparent;color:inherit;font-family:inherit;font-size:14px;cursor:pointer;text-decoration:none;';
  // Le nom de l'artisan n'est JAMAIS inséré comme du code : seulement via textContent / encodeURIComponent, après coup.
  div.innerHTML =
    '<div onclick="fermerMenuPartage(event)" style="position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:10020;display:flex;align-items:center;justify-content:center;padding:12px;">' +
      '<div style="background:var(--panel,#fff);border-radius:14px;padding:22px;max-width:400px;width:100%;max-height:90vh;overflow-y:auto;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;"><div style="font-weight:700;font-size:16px;">' + (titreMenu || T('partage_titre')) + '</div>' +
        '<button type="button" onclick="fermerMenuPartage({target:this,currentTarget:this})" aria-label="' + escHtml(T('partage_fermer')) + '" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--mu,#999);">✕</button></div>' +
        '<div id="partage-nom" style="font-size:13px;color:var(--mu2,#777);margin-bottom:12px;"></div>' +
        '<input id="partage-url" readonly onclick="this.select()" style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid var(--line,#ddd);border-radius:8px;font-size:13px;margin-bottom:10px;font-family:inherit;background:transparent;color:inherit;">' +
        '<div style="display:flex;flex-direction:column;gap:8px;">' +
          '<button type="button" id="partage-copier" onclick="copierLienPartage()" style="' + bouton + '">📋 ' + T('partage_copier') + '</button>' +
          '<a id="partage-whatsapp" target="_blank" rel="noopener noreferrer" style="' + bouton + '">💬 ' + T('partage_whatsapp') + '</a>' +
          '<a id="partage-facebook" target="_blank" rel="noopener noreferrer" style="' + bouton + '">📘 ' + T('partage_facebook') + '</a>' +
          '<a id="partage-email" style="' + bouton + '">✉️ ' + T('partage_email') + '</a>' +
        '</div>' +
      '</div>' +
    '</div>';
  document.getElementById('partage-nom').textContent = nom;
  document.getElementById('partage-url').value = url;
  document.getElementById('partage-whatsapp').href = 'https://wa.me/?text=' + encodeURIComponent(texte + ' ' + url);
  document.getElementById('partage-facebook').href = 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(url);
  document.getElementById('partage-email').href = 'mailto:?subject=' + encodeURIComponent(nom) + '&body=' + encodeURIComponent(texte + '\n\n' + url);
}
async function copierLienPartage() {
  var champ = document.getElementById('partage-url'), bouton = document.getElementById('partage-copier');
  if (!champ || !bouton) return;
  var ok = false;
  try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(champ.value); ok = true; } } catch (e) { /* on essaie l'autre méthode */ }
  if (!ok) { champ.focus(); champ.select(); try { ok = document.execCommand('copy'); } catch (e) { ok = false; } }
  var avant = bouton.innerHTML;
  bouton.textContent = ok ? T('partage_lien_copie') : T('partage_copie_manuelle');
  setTimeout(function() { if (document.getElementById('partage-copier') === bouton) bouton.innerHTML = avant; }, 2200);
}
function fermerMenuPartage(e) { if (e && e.target !== e.currentTarget) return; var d = document.getElementById('modal-partage'); if (d) d.innerHTML = ''; }

function fermerProfil(e) { if (e && e.target !== e.currentTarget) return; var div = document.getElementById('modal-profil'); if (div) div.innerHTML = ''; }

// ════════════════════════════════════════
//  FICHE ARTISAN (18/11/2026) — une seule présentation, téléphone ET ordinateur (maquette validée) :
//  carte compacte en haut · 4 onglets (Services, Photos, Boutique, À propos) · services en lignes, détail au clic · bouton « Voir les disponibilités » toujours en bas.
//  Les disponibilités, les sessions, la réservation et le devis sont les mêmes qu'avant : on les range seulement autrement.
// ════════════════════════════════════════
var _fxServices = [], _fxPhotos = [];
var ICONES_FX = [['🛠️', '#EEF4FF'], ['🌿', '#e6f7ef'], ['✨', '#e8f0ff'], ['🧰', '#f3e8ff'], ['🔧', '#fef9c3'], ['💧', '#e0f2fe']];

function injecterStyleFx() {
  if (document.getElementById('style-fx')) return;
  var st = document.createElement('style'); st.id = 'style-fx';
  st.textContent =
    '.fx-ov{position:fixed;inset:0;background:rgba(19,34,60,.5);z-index:10001;display:flex;align-items:center;justify-content:center;padding:16px;font-family:inherit;}' +
    '.fx-card{position:relative;width:100%;max-width:600px;height:min(90vh,900px);background:var(--panel,#fff);color:var(--tx,#13223c);border:2px solid var(--brd,#e3eaf4);border-radius:28px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 60px rgba(19,34,60,.3);}' +
    '.fx-top{display:flex;align-items:center;justify-content:space-between;padding:14px 16px 6px 20px;}' +
    '.fx-marque{font-weight:800;font-size:15px;color:#0E4FB8;}' +
    '.fx-top-btns{display:flex;gap:8px;}.fx-top-btns button{width:38px;height:38px;border-radius:50%;border:2px solid var(--brd,#e3eaf4);background:transparent;color:inherit;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;}' +
    '.fx-scroll{flex:1;overflow-y:auto;padding:6px 16px 20px;-webkit-overflow-scrolling:touch;}' +
    '.fx-box{border:2px solid var(--brd,#e3eaf4);border-radius:24px;background:var(--panel,#fff);}' +
    '.fx-head{padding:18px;}.fx-hrow{display:flex;gap:14px;align-items:center;}' +
    '.fx-av{width:68px;height:68px;border-radius:50%;object-fit:cover;flex-shrink:0;}.fx-av-ini{background:var(--line,#eef2f8);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:24px;color:var(--mu,#64748b);}' +
    '.fx-nom{font-size:21px;font-weight:800;line-height:1.15;letter-spacing:-.3px;}.fx-sub{font-size:14px;font-weight:600;color:var(--mu2,#5b6b82);margin-top:3px;}' +
    '.fx-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px;}.fx-chip{font-size:12.5px;font-weight:700;border-radius:30px;padding:4px 10px;}' +
    '.fx-vert{background:#e3f8ec;color:#0f7a3c;}.fx-or{background:#fff3d6;color:#9a5b00;}.fx-bleu{background:#e0ecff;color:#1d4ed8;}.fx-gris{background:#eef2f8;color:#5b6b82;}.fx-amb{background:rgba(245,158,11,.14);color:#b45309;}' +
    '.fx-bio{font-size:14.5px;line-height:1.5;margin-top:14px;}.fx-clamp{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}' +
    '.fx-more{background:none;border:none;color:#0E4FB8;font-weight:800;font-size:14px;cursor:pointer;padding:6px 0 0;font-family:inherit;}' +
    '.fx-tabs{position:sticky;top:0;z-index:5;display:flex;margin:12px 0;padding:0 6px;}' +
    '.fx-tab{flex:1;background:none;border:none;padding:16px 4px 18px;font-family:inherit;font-size:15px;font-weight:800;color:var(--mu,#7a8aa5);cursor:pointer;}.fx-tab.on{color:var(--tx,#13223c);}' +
    '.fx-ind{position:absolute;bottom:7px;left:0;height:4px;border-radius:4px;background:#1266E3;transition:transform .25s ease,width .25s ease;}' +
    '.fx-panel{display:none;}.fx-panel.on{display:block;animation:fxIn .25s ease;}@keyframes fxIn{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:none;}}' +
    '.fx-svc{display:flex;align-items:center;gap:14px;width:100%;text-align:left;padding:12px 14px;margin-bottom:10px;border:2px solid var(--brd,#e3eaf4);border-radius:22px;background:var(--panel,#fff);color:inherit;font-family:inherit;cursor:pointer;}' +
    '.fx-th{width:54px;height:54px;border-radius:15px;object-fit:cover;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:26px;}' +
    '.fx-svc-txt{flex:1;min-width:0;}.fx-svc-nom{display:block;font-size:16px;font-weight:800;line-height:1.25;}.fx-svc-meta{display:block;font-size:13.5px;font-weight:600;color:var(--mu2,#5b6b82);margin-top:3px;}' +
    '.fx-plus{width:34px;height:34px;border-radius:50%;border:2.5px solid #1266E3;color:#1266E3;font-size:22px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;line-height:1;}' +
    '.fx-btn2{display:block;width:100%;margin-top:6px;padding:14px;border-radius:30px;border:2px solid #1266E3;background:transparent;color:#1266E3;font-family:inherit;font-size:15px;font-weight:800;cursor:pointer;}' +
    '.fx-grille{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;}.fx-ph{padding:0;border:none;background:none;cursor:pointer;aspect-ratio:1;border-radius:18px;overflow:hidden;}.fx-ph img{width:100%;height:100%;object-fit:cover;display:block;}' +
    '.fx-prods{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;}.fx-prod{border:2px solid var(--brd,#e3eaf4);border-radius:20px;padding:10px;}' +
    '.fx-prod img,.fx-noimg{width:100%;aspect-ratio:1;object-fit:cover;border-radius:14px;display:block;background:var(--line,#eef2f8);}.fx-noimg{display:flex;align-items:center;justify-content:center;font-size:26px;}' +
    '.fx-pn{font-size:14px;font-weight:800;margin-top:8px;line-height:1.25;}.fx-pp{font-size:14px;font-weight:800;color:#0E4FB8;margin-top:4px;}.fx-pp s{font-size:12px;font-weight:500;color:var(--mu,#999);margin-left:4px;}' +
    '.fx-lnk{display:block;text-align:center;margin-top:16px;font-weight:800;font-size:15px;color:#0E4FB8;text-decoration:none;}' +
    '.fx-bloc{margin-bottom:22px;}.fx-bloc h4{font-size:13px;font-weight:800;color:var(--mu2,#5b6b82);margin:0 0 8px;}' +
    '.fx-avis{padding:10px 0;border-bottom:1px solid var(--line,#eee);font-size:13.5px;}.fx-cache{display:none;}' +
    '.fx-bar{padding:12px 16px 16px;border-top:2px solid var(--brd,#e3eaf4);background:var(--panel,#fff);}' +
    '.fx-cta{width:100%;height:56px;border-radius:30px;border:none;background:#1266E3;color:#fff;font-family:inherit;font-size:17px;font-weight:800;cursor:pointer;box-shadow:0 10px 22px rgba(18,102,227,.28);}' +
    '.fx-scrim{position:absolute;inset:0;background:rgba(19,34,60,.45);opacity:0;pointer-events:none;transition:opacity .25s;z-index:20;}.fx-scrim.on{opacity:1;pointer-events:auto;}' +
    '.fx-sheet{position:absolute;left:0;right:0;bottom:0;max-height:90%;display:flex;flex-direction:column;background:var(--panel,#fff);border-radius:28px 28px 0 0;transform:translateY(105%);transition:transform .3s cubic-bezier(.2,.8,.2,1);z-index:21;box-shadow:0 -10px 40px rgba(0,0,0,.18);}.fx-sheet.on{transform:none;}' +
    '.fx-sheet-tete{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:18px 20px 8px;font-size:18px;font-weight:800;}' +
    '.fx-sheet-tete button{width:36px;height:36px;border-radius:50%;border:2px solid var(--brd,#e3eaf4);background:transparent;color:inherit;cursor:pointer;font-size:15px;flex-shrink:0;padding:0;}' +
    '.fx-sheet-corps{overflow-y:auto;padding:4px 20px 22px;}' +
    '.fx-grand{width:100%;height:210px;object-fit:cover;border-radius:22px;display:block;margin-bottom:14px;}.fx-grand-ic{height:130px;border-radius:22px;display:flex;align-items:center;justify-content:center;font-size:56px;margin-bottom:14px;}' +
    '.fx-lb{position:fixed;inset:0;z-index:10030;background:rgba(0,0,0,.86);display:flex;align-items:center;justify-content:center;padding:14px;cursor:zoom-out;}.fx-lb img{max-width:96vw;max-height:90vh;border-radius:14px;}' +
    '.fx-card .fiche-grille{display:grid !important;grid-template-columns:repeat(7,1fr);gap:6px;border-top:none !important;padding-top:0 !important;margin-bottom:8px;}' +
    '.fx-card #dispo-service-photo img{max-height:120px !important;width:100%;object-fit:cover;border-radius:14px;}' +
    '.fx-card .dispo-day-label{font-size:11px !important;white-space:nowrap;}.fx-card .dispo-slot{font-size:11px !important;font-weight:700 !important;}' +
    '.fx-card .dispo-slot.available{background:#fff !important;color:#13223C !important;border-color:#cfd9e8 !important;}' +
    '@media(max-width:768px){.fx-ov{padding:0;align-items:flex-end;}.fx-card{max-width:none;height:94vh;height:94dvh;border-radius:28px 28px 0 0;border-bottom:none;}.fx-prods{grid-template-columns:repeat(2,1fr);}.fx-card .dispo-day-label,.fx-card .dispo-slot{font-size:9.5px !important;}}';
  document.head.appendChild(st);
}

function formatDureeFx(min) { min = parseInt(min, 10); if (!min) return ''; var h = Math.floor(min / 60), m = min % 60; return h && m ? h + ' h ' + (m < 10 ? '0' : '') + m : (h ? h + ' h' : m + ' min'); }
function prixServiceFx(s) { return s.prix_indicatif ? (escHtml(s.prix_indicatif) + ' €' + (s.unite && s.unite !== 'forfait' ? ' / ' + escHtml(s.unite) : '')) : T('sur_devis'); }

function buildProfilHTML(data) {
  injecterStyleFx();
  var a = data.artisan;
  _fxServices = data.services || [];
  _fxPhotos = data.photos || [];
  var avatar = a.photo_profil_url
    ? '<img class="fx-av" src="' + escHtml(a.photo_profil_url) + '" alt="">'
    : '<div class="fx-av fx-av-ini">' + escHtml(initiales(a.nom_entreprise)) + '</div>';

  // Pastilles : l'essentiel de la confiance, en une ligne.
  var chips = (a.verifie ? '<span class="fx-chip fx-vert">✅ ' + T('badge_verifie') + '</span>' : '') +
    (data.nb_avis > 0
      ? '<span class="fx-chip fx-or">⭐ ' + (Number(data.note_moyenne) || 0).toFixed(1) + ' · ' + data.nb_avis + ' ' + (data.nb_avis === 1 ? T('avis_un') : T('avis_plusieurs')) + '</span>'
      : '<span class="fx-chip fx-gris">' + escHtml(T('avis_aucun_court')) + '</span>') +
    (a.nouveau ? '<span class="fx-chip fx-bleu">' + escHtml(T('badge_nouveau')) + '</span>' : '') +
    (a.rge ? '<span>' + badgeRgeTexte(a) + '</span>' : '') +
    (a.alternance_niveau >= 2 ? '<span class="fx-chip fx-amb" title="Cette entreprise s\'engage activement pour la formation locale">🟠 Tremplin des jeunes</span>' : '');
  var bioTxt = a.bio ? String(a.bio) : '';
  var bioHtml = bioTxt
    ? '<div class="fx-bio fx-clamp" id="fx-bio">' + escHtml(bioTxt) + '</div>' + (bioTxt.length > 110 ? '<button type="button" class="fx-more" id="fx-more" onclick="basculerBioFx()">' + escHtml(T('fx_lire_suite')) + '</button>' : '')
    : '';

  // ── Onglet Services : une ligne par service (petite photo, durée, prix) ; la grande photo et le détail s'ouvrent au clic.
  var devisBtn = '<button type="button" class="fx-btn2" onclick="ouvrirModalDevis(' + jsAttr(a.id) + ',' + jsAttr(a.nom_entreprise) + ',' + jsAttr(a.secteur) + ')">' + escHtml(T('demander_devis')) + '</button>';
  var grise = a.paiement_en_ligne === false; // paiements en ligne pas actifs : on voit la fiche, on ne réserve pas
  if (grise) devisBtn = '';
  var servicesHtml = _fxServices.length
    ? _fxServices.map(function(s, i) {
        var ic = ICONES_FX[i % ICONES_FX.length], d = formatDureeFx(s.duree_estimee_min);
        var th = s.photo_url ? '<img class="fx-th" src="' + escHtml(s.photo_url) + '" alt="" loading="lazy">' : '<span class="fx-th" style="background:' + ic[1] + '">' + ic[0] + '</span>';
        return '<' + (grise ? 'div style="cursor:default;"' : 'button type="button" onclick="ouvrirServiceFx(' + i + ')"') + ' class="fx-svc">' + th +
          '<span class="fx-svc-txt"><span class="fx-svc-nom">' + escHtml(s.nom_service) + '</span><span class="fx-svc-meta">' + (d ? d + ' · ' : '') + prixServiceFx(s) + '</span></span>' + (grise ? '' : '<span class="fx-plus">+</span>') + '</' + (grise ? 'div' : 'button') + '>';
      }).join('') + devisBtn
    : '<div style="color:var(--mu,#999);font-size:13.5px;margin-bottom:12px;">' + T('aucun_service') + '</div>' + devisBtn;
  if (grise) servicesHtml = '<div style="margin:0 0 12px;padding:12px 14px;border-radius:14px;background:#eef4ff;border:1px solid #cfe0fb;color:#1f3b63;font-size:13px;line-height:1.5;"><b style="color:#13223c;">' + escHtml(T('carte_grisee_titre')) + '</b><br>' + escHtml(T('carte_grisee_texte')) + '</div>' + servicesHtml;

  // ── Onglet Photos
  var photosHtml = _fxPhotos.length
    ? '<div class="fx-grille">' + _fxPhotos.map(function(p, i) { return '<button type="button" class="fx-ph" onclick="ouvrirPhotoFx(' + i + ')"><img src="' + escHtml(p.url_photo) + '" alt="' + escHtml(p.legende || '') + '" loading="lazy"></button>'; }).join('') + '</div>'
    : '';

  // ── Onglet Boutique (seulement si l'artisan a des produits phares)
  var produits = data.produits_phares || [];
  var boutiqueHtml = produits.length
    ? '<div class="fx-prods">' + produits.map(function(p) {
        var prixRemise = p.prix != null && p.promo_pct ? Math.round(p.prix * (1 - p.promo_pct / 100) * 100) / 100 : null;
        return '<div class="fx-prod">' + (p.url_photo ? '<img src="' + escHtml(p.url_photo) + '" alt="' + escHtml(p.nom) + '" loading="lazy">' : '<div class="fx-noimg">📦</div>') +
          '<div class="fx-pn">' + escHtml(p.nom) + '</div>' +
          (p.prix != null ? '<div class="fx-pp">' + (prixRemise != null ? prixRemise : p.prix) + ' €' + (prixRemise != null ? '<s>' + p.prix + ' €</s>' : '') + '</div>' : '') + '</div>';
      }).join('') + '</div>' +
      (a.slug_catalogue ? '<a class="fx-lnk" href="catalogue.html?s=' + encodeURIComponent(a.slug_catalogue) + '" target="_blank" rel="noopener">🛍️ ' + escHtml(T('fx_voir_boutique')) + ' ›</a>' : '') +
      ((a.code_promo && a.code_promo_ventes !== false) ? '<div style="text-align:center;margin-top:12px;"><span style="font-family:monospace;font-size:12px;font-weight:700;padding:5px 12px;border-radius:8px;background:rgba(18,102,227,.08);color:#0E4FB8;border:1px dashed #0E4FB8;">🎁 ' + escHtml(a.code_promo) + '</span></div>' : '')
    : '';

  // ── Onglet À propos : présentation complète, avantages, avis
  var avantages = (a.cashback_pct || a.remise_fidele_pct || a.code_promo)
    ? (a.cashback_pct ? '<div style="font-weight:600;font-size:13.5px;line-height:1.5;">' + escHtml(T('perk_cashback').replace('{p}', Math.round(a.cashback_pct)) + ' ' + libelleScopeAvantage(a.cashback_ventes !== false, a.cashback_interventions !== false)) + '</div>' : '') +
      (a.code_promo && Number(a.code_promo_pct) >= 1 ? '<div style="font-weight:600;font-size:13.5px;line-height:1.5;">' + escHtml(T('avt_code').replace('{c}', a.code_promo).replace('{p}', Math.round(Number(a.code_promo_pct))) + ' ' + libelleScopeAvantage(a.code_promo_ventes !== false, a.code_promo_interventions !== false)) + '</div>' : '') +
      (a.remise_fidele_pct ? '<div style="font-weight:600;font-size:13.5px;line-height:1.5;">' + escHtml(T('perk_fidele').replace('{p}', Math.round(a.remise_fidele_pct))) + '</div>' : '') +
      '<div style="font-size:12px;color:var(--mu2,#777);margin-top:4px;">' + escHtml(T('perk_info')) + '</div>'
    : '';
  var avis = data.avis || [];
  var avisHtml = avis.length
    ? avis.map(function(av, i) {
        return '<div class="fx-avis' + (i >= 2 ? ' fx-cache' : '') + '"><strong>' + '★'.repeat(av.note) + '☆'.repeat(5 - av.note) + '</strong> — ' + escHtml(av.client_nom) +
          (av.commentaire ? '<div style="color:var(--mu2,#777);margin-top:3px;">' + escHtml(av.commentaire) + '</div>' : '') +
          (av.reponse_artisan ? '<div style="margin-top:6px;padding:8px 10px;background:var(--p2,#f6f9fe);border-radius:10px;font-size:12.5px;color:var(--mu2,#777);"><strong style="color:#0E4FB8;">' + T('reponse_artisan_prefix') + '</strong> ' + escHtml(av.reponse_artisan) + '</div>' : '') + '</div>';
      }).join('') + (avis.length > 2 ? '<button type="button" class="fx-btn2" id="fx-avis-plus" onclick="voirPlusAvisFx()" style="margin-top:12px;">' + escHtml(T('avis_voir_plus')) + ' (' + (avis.length - 2) + ')</button>' : '')
    : '<div style="color:var(--mu,#999);font-size:13.5px;">' + T('aucun_avis') + '</div>';
  // Onglet À propos : la description est déjà en haut de la fiche (plus de doublon). Ici : infos pratiques, réseaux, avantages, avis.
  var infos = [];
  var kmRayon = Number(a.rayon_intervention_km);
  if (a.mode_lieu === 'salon') infos.push('🏠 ' + T('fiche_salon').replace('{commune}', a.commune || ''));
  else if (kmRayon > 0) infos.push('📍 ' + T('fiche_zone').replace('{km}', Math.round(kmRayon)).replace('{commune}', a.commune || ''));
  if (a.membre_depuis) {
    var dMembre = new Date(a.membre_depuis);
    if (!isNaN(dMembre.getTime())) infos.push('🗓️ ' + T('fiche_membre').replace('{date}', dMembre.toLocaleDateString(AT_LANG === 'en' ? 'en-GB' : (AT_LANG === 'es' ? 'es-ES' : 'fr-FR'), { month: 'long', year: 'numeric' })));
  }
  var reseaux = [];
  if (/^[A-Za-z0-9._]{1,30}$/.test(a.boutique_instagram || '')) reseaux.push(['📸 Instagram', 'https://www.instagram.com/' + a.boutique_instagram]);
  if (/^[A-Za-z0-9._]{1,30}$/.test(a.boutique_tiktok || '')) reseaux.push(['🎵 TikTok', 'https://www.tiktok.com/@' + a.boutique_tiktok]);
  if (/^[A-Za-z0-9.\-]{1,80}$/.test(a.boutique_facebook || '')) reseaux.push(['📘 Facebook', 'https://www.facebook.com/' + a.boutique_facebook]);
  if (/^[A-Za-z0-9._\-]{3,30}$/.test(a.boutique_youtube || '')) reseaux.push(['▶️ YouTube', 'https://www.youtube.com/@' + a.boutique_youtube]);
  var infosHtml = infos.map(function(t) { return '<div style="font-weight:600;font-size:13.5px;line-height:1.5;">' + escHtml(t) + '</div>'; }).join('') +
    (a.nouveau ? '<div style="font-size:12.5px;color:var(--mu2,#777);margin-top:' + (infos.length ? '8px' : '0') + ';">' + escHtml(T('badge_nouveau_info')) + '</div>' : '');
  var reseauxHtml = reseaux.length
    ? '<div style="display:flex;flex-wrap:wrap;gap:8px;">' + reseaux.map(function(r) {
        return '<a href="' + escHtml(r[1]) + '" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:9px 14px;border-radius:99px;border:1px solid var(--brd,#e3eaf4);color:var(--tx,#13223c);font-weight:700;font-size:13px;text-decoration:none;">' + escHtml(r[0]) + '</a>';
      }).join('') + '</div>'
    : '';
  var aproposHtml =
    (infosHtml ? '<div class="fx-bloc"><h4>' + escHtml(T('fiche_infos')) + '</h4>' + infosHtml + '</div>' : '') +
    (reseauxHtml ? '<div class="fx-bloc"><h4>' + escHtml(T('fiche_reseaux')) + '</h4>' + reseauxHtml + '</div>' : '') +
    (avantages ? '<div class="fx-bloc"><h4>' + escHtml(T('fiche_avantages')) + '</h4>' + avantages + '</div>' : '') +
    '<div class="fx-bloc"><h4>' + escHtml(T('avis_titre')) + '</h4>' + avisHtml + '</div>';

  var onglets = [['services', T('fx_onglet_services'), servicesHtml]];
  if (photosHtml) onglets.push(['photos', T('fx_onglet_photos'), photosHtml]);
  if (boutiqueHtml) onglets.push(['boutique', T('fx_onglet_boutique'), boutiqueHtml]);
  onglets.push(['apropos', T('fx_onglet_apropos'), aproposHtml]);

  return '<div class="fx-ov" onclick="fermerProfil(event)">' +
    '<div class="fx-card" role="dialog" aria-label="' + escHtml(a.nom_entreprise) + '">' +
      '<div class="fx-top"><span class="fx-marque">🔧 CaraLink Artisans</span><span class="fx-top-btns">' +
        '<button type="button" onclick="partagerFiche(' + jsAttr(a.id) + ')" aria-label="' + escHtml(T('partage_titre')) + '">🔗</button>' +
        '<button type="button" onclick="fermerProfil({target:this,currentTarget:this})" aria-label="' + escHtml(T('partage_fermer')) + '">✕</button></span></div>' +
      '<div class="fx-scroll" id="fx-scroll">' +
        '<div class="fx-box fx-head"><div class="fx-hrow">' + avatar + '<div style="min-width:0;"><div class="fx-nom">' + escHtml(a.nom_entreprise) + '</div>' +
          '<div class="fx-sub">' + secteurLabel(a.secteur) + ' · 📍 ' + escHtml(a.commune) + '</div></div></div>' +
          '<div class="fx-chips">' + chips + '</div>' + bioHtml + '</div>' +
        '<div class="fx-box fx-tabs" id="fx-tabs" role="tablist">' + onglets.map(function(o, i) {
          return '<button type="button" role="tab" class="fx-tab' + (i === 0 ? ' on' : '') + '" onclick="ongletFx(' + jsAttr(o[0]) + ',this)">' + escHtml(o[1]) + '</button>';
        }).join('') + '<span class="fx-ind" id="fx-ind"></span></div>' +
        onglets.map(function(o, i) { return '<div class="fx-panel' + (i === 0 ? ' on' : '') + '" data-p="' + o[0] + '">' + o[2] + '</div>'; }).join('') +
      '</div>' +
      '<div class="fx-bar">' + (grise ? '<button type="button" class="fx-cta" id="fx-cta" onclick="ouvrirInteret(' + jsAttr(a.id) + ')">' + escHtml(T('interet_bouton')) + '</button>' : '<button type="button" class="fx-cta" id="fx-cta" onclick="ouvrirDispoFx()">📅 ' + escHtml(T('fx_voir_dispos')) + '</button>') + '</div>' +
      '<div class="fx-scrim" id="fx-scrim" onclick="fermerFeuillesFx()"></div>' +
      '<div class="fx-sheet" id="fx-dispo"><div class="fx-sheet-tete"><span>' + escHtml(T('fx_dispos_titre')) + '</span><button type="button" onclick="fermerFeuillesFx()" aria-label="' + escHtml(T('partage_fermer')) + '">✕</button></div>' +
        '<div class="fx-sheet-corps"><div class="fx-dispo-sec"><div id="dispo-zone-' + escHtml(a.id) + '"><div style="font-size:12.5px;color:var(--mu,#999);">⏳ Vérification des disponibilités…</div></div></div></div></div>' +
      '<div class="fx-sheet" id="fx-svc"><div class="fx-sheet-tete"><span id="fx-svc-titre"></span><button type="button" onclick="fermerFeuillesFx()" aria-label="' + escHtml(T('partage_fermer')) + '">✕</button></div><div class="fx-sheet-corps" id="fx-svc-corps"></div></div>' +
    '</div></div>';
}

// Après l'affichage : on place le soulignement de l'onglet actif (une fois les polices chargées).
function initFicheFx() {
  var pos = function() { var b = document.querySelector('#fx-tabs .fx-tab.on'); if (b) posIndFx(b); };
  requestAnimationFrame(pos);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(pos);
}
function posIndFx(btn) {
  var ind = document.getElementById('fx-ind'); if (!ind || !btn) return;
  ind.style.width = Math.round(btn.offsetWidth * 0.6) + 'px';
  ind.style.transform = 'translateX(' + Math.round(btn.offsetLeft + btn.offsetWidth * 0.2) + 'px)';
}
function ongletFx(nom, btn) {
  var card = document.querySelector('#modal-profil .fx-card'); if (!card) return;
  card.querySelectorAll('.fx-tab').forEach(function(b) { b.classList.toggle('on', b === btn); });
  card.querySelectorAll('.fx-panel').forEach(function(p) { p.classList.toggle('on', p.getAttribute('data-p') === nom); });
  posIndFx(btn);
  var sc = document.getElementById('fx-scroll'), tabs = document.getElementById('fx-tabs');
  if (sc && tabs && sc.scrollTop > tabs.offsetTop - 12) sc.scrollTop = Math.max(0, tabs.offsetTop - 12);
}
function basculerBioFx() {
  var b = document.getElementById('fx-bio'), m = document.getElementById('fx-more'); if (!b || !m) return;
  var replie = b.classList.toggle('fx-clamp');
  m.textContent = replie ? T('fx_lire_suite') : T('fx_reduire');
}
function voirPlusAvisFx() {
  document.querySelectorAll('#modal-profil .fx-cache').forEach(function(x) { x.classList.remove('fx-cache'); });
  var p = document.getElementById('fx-avis-plus'); if (p) p.remove();
}
function ouvrirPhotoFx(i) {
  var p = _fxPhotos[i]; if (!p) return;
  var d = document.createElement('div'); d.className = 'fx-lb';
  d.onclick = function() { d.remove(); };
  var im = document.createElement('img'); im.src = p.url_photo; im.alt = p.legende || '';
  d.appendChild(im); document.body.appendChild(d);
}
function ouvrirFeuilleFx(id) {
  fermerFeuillesFx(true);
  var el = document.getElementById(id), sc = document.getElementById('fx-scrim'); if (!el) return;
  el.classList.add('on'); if (sc) sc.classList.add('on');
}
function fermerFeuillesFx(garderFond) {
  document.querySelectorAll('#modal-profil .fx-sheet.on').forEach(function(x) { x.classList.remove('on'); });
  if (!garderFond) { var sc = document.getElementById('fx-scrim'); if (sc) sc.classList.remove('on'); }
}
function ouvrirDispoFx() { ouvrirFeuilleFx('fx-dispo'); }
function ouvrirServiceFx(i) {
  var s = _fxServices[i]; if (!s) return;
  var ic = ICONES_FX[i % ICONES_FX.length], d = formatDureeFx(s.duree_estimee_min);
  document.getElementById('fx-svc-titre').textContent = s.nom_service;
  var corps = document.getElementById('fx-svc-corps');
  corps.innerHTML = (s.photo_url ? '<img class="fx-grand" src="' + escHtml(s.photo_url) + '" alt="' + escHtml(s.nom_service) + '">' : '<div class="fx-grand-ic" style="background:' + ic[1] + '">' + ic[0] + '</div>') +
    '<div style="font-size:15px;font-weight:700;color:var(--mu2,#5b6b82);">' + (d ? d + ' · ' : '') + prixServiceFx(s) + '</div>' +
    (s.description ? '<p style="font-size:14.5px;line-height:1.55;margin:12px 0 0;">' + escHtml(s.description) + '</p>' : '') +
    (s.forfait_seances
      ? '<div style="margin:14px 0 0;padding:12px 14px;border-radius:12px;background:#eef4ff;border:1px solid #cfe0fb;font-size:13.5px;line-height:1.5;color:#1f3b63;">📦 Forfait de ' + Number(s.forfait_seances) + ' séances · ' + Number(s.forfait_prix) + ' €<br>' + (s.groupe_places ? '👥 Cours collectif · ' + Number(s.groupe_places) + ' places par séance' : '🧍 Séances individuelles sur rendez-vous') + '<br>Vous achetez le forfait une fois, puis vous réservez vos jours quand vous voulez.</div>' +
        '<a class="fx-cta" style="margin-top:14px;display:block;text-align:center;text-decoration:none;" href="forfait.html?s=' + encodeURIComponent(s.id) + '">Acheter le forfait</a>'
      : '<button type="button" class="fx-cta" style="margin-top:20px;" onclick="reserverServiceFx(' + i + ')">' + escHtml(T('fx_reserver_service')) + '</button>');
  ouvrirFeuilleFx('fx-svc');
}
// « Réserver ce service » : on ouvre les disponibilités avec ce service déjà choisi.
function reserverServiceFx(i) {
  var s = _fxServices[i], a = _profilDataCourant && _profilDataCourant.artisan; if (!s || !a) return;
  ouvrirFeuilleFx('fx-dispo');
  ouvrirVerifDispo(a.id);
  var sel = document.getElementById('dispo-service');
  if (sel && s.id) { sel.value = s.id; surChangementPrestationsDispo(); }
  var corps = document.querySelector('#fx-dispo .fx-sheet-corps'); if (corps) corps.scrollTop = 0;
}
// Si l'artisan n'a aucune disponibilité à montrer, le bouton du bas propose le devis à la place.
function majBarreFx() {
  var cta = document.getElementById('fx-cta'), a = _profilDataCourant && _profilDataCourant.artisan; if (!cta || !a) return;
  cta.textContent = '📋 ' + T('demander_devis');
  cta.onclick = function() { ouvrirModalDevis(a.id, a.nom_entreprise, a.secteur); };
}

// ════════════════════════════════════════
//  DISPONIBILITÉS — aperçu + vérification réelle (Smart Dispatch public)
// ════════════════════════════════════════

var _profilDataCourant = null;
window._dispoContexte = null;

function heureVersMinPublic(hhmm) { var p = hhmm.split(':'); return parseInt(p[0],10)*60 + parseInt(p[1],10); }
function minVersHeurePublic(min) { min = Math.max(0, Math.round(min)); var h = Math.floor(min/60), m = min%60; return (h<10?'0':'')+h+':'+(m<10?'0':'')+m; }

var JOURS_COURT_CARTE = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
var ORDRE_AFFICHAGE_JOURS_CARTE = [1, 2, 3, 4, 5, 6, 0]; // lundi en premier, dimanche en dernier

async function chargerApercuDispo(artisanId) {
  var zone = document.getElementById('dispo-zone-' + artisanId);
  if (!zone) return;
  try {
    var res = await fetch(SUPABASE_URL + '/functions/v1/verifier-disponibilite-artisan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + SUPABASE_ANON },
      body: JSON.stringify({ mode: 'apercu', artisan_id: artisanId, aujourdhui: dateLocaleISO() }),
    });
    var data = await res.json();
    var grilleFiche = (data.semaine && data.semaine.length) ? '<div class="dispo-grid fiche-grille">' + data.semaine.map(colonneJourCarte).join('') + '</div>' : '';
    // Sessions avec places : dans un bloc à part, sous les disponibilités (il survit au changement d'affichage de la zone).
    var sessHtml = data.error ? '' : sessionsFicheHtml(data.sessions, artisanId);
    var contSess = document.getElementById('sessions-fiche-' + artisanId);
    if (!contSess) { contSess = document.createElement('div'); contSess.id = 'sessions-fiche-' + artisanId; zone.parentNode.insertBefore(contSess, zone.nextSibling); }
    contSess.innerHTML = sessHtml;
    if (data.error || (!data.prochaine_date && !grilleFiche)) {
      zone.innerHTML = '';
      if (!sessHtml) majBarreFx();
      return;
    }
    if (!data.prochaine_date) { zone.innerHTML = grilleFiche; return; }
    zone.innerHTML = grilleFiche +
      '<button type="button" onclick="ouvrirVerifDispo(' + jsAttr(artisanId) + ')" style="width:100%;text-align:left;padding:12px 14px;border-radius:10px;border:1px solid var(--ac-brd,#C7DCFA);background:rgba(18,102,227,.06);color:var(--ac,#1266E3);font-size:13.5px;font-weight:700;cursor:pointer;">' + T('dispo_apercu_prefix') + ' ' + data.label + ' →</button>' +
      '<div style="font-size:11.5px;color:var(--mu,#999);margin-top:5px;text-align:center;"><a href="#" onclick="ouvrirVerifDispo(' + jsAttr(artisanId) + ');return false;" style="color:var(--mu2,#777);">' + T('dispo_autres_creneaux') + '</a></div>';
  } catch (e) {
    zone.innerHTML = '';
    majBarreFx();
  }
}

// Avant que le formulaire existe : « salon » seulement si l'artisan reçoit uniquement chez lui ; « les_deux » démarre sur « chez l'artisan ».
function lieuChoisiDepart(artisanId) { var m = modeLieuArtisan(artisanId); return (m === 'salon' || m === 'les_deux') ? 'salon' : 'domicile'; }
function lieuDispoHTML(artisanId) {
  var m = modeLieuArtisan(artisanId), a = (_profilDataCourant && _profilDataCourant.artisan) || {};
  if (m === 'salon') return '<div style="font-size:12.5px;color:#166534;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:9px;padding:10px 12px;line-height:1.45;margin-bottom:8px;">' + T('dispo_lieu_info_1') + '<strong>' + escHtml(a.nom_entreprise || '') + '</strong>' + (a.commune ? ' (' + escHtml(a.commune) + ')' : '') + T('dispo_lieu_info_2') + '</div>';
  if (m === 'les_deux') return '<div style="margin-bottom:8px;"><div style="font-size:12px;font-weight:700;color:var(--mu2,#555);margin-bottom:6px;">' + T('dispo_lieu_titre') + '</div>' +
    '<label style="display:flex;gap:8px;align-items:center;font-size:13px;cursor:pointer;margin-bottom:4px;"><input type="radio" name="dispo-lieu" value="salon" checked onchange="basculerLieuDispo(' + jsAttr(artisanId) + ')"> ' + T('dispo_lieu_chez_artisan') + '</label>' +
    '<label style="display:flex;gap:8px;align-items:center;font-size:13px;cursor:pointer;"><input type="radio" name="dispo-lieu" value="domicile" onchange="basculerLieuDispo(' + jsAttr(artisanId) + ')"> ' + T('dispo_lieu_chez_moi') + '</label></div>';
  return '';
}
function ouvrirVerifDispo(artisanId, pourVisite) {
  // « pourVisite » : vient du choix « Rendez-vous sur place » (lié à CET artisan, ne s'applique pas à une autre fiche).
  // Sinon (bouton « Voir les disponibilités ») : le client repart de zéro et la question « première intervention ? » lui sera posée.
  window._visiteDemandee = pourVisite ? artisanId : false;
  var zone = document.getElementById('dispo-zone-' + artisanId);
  if (!zone || !_profilDataCourant) return;
  var services = _profilDataCourant.services || [];
  window._dispoOptionsServices = services.map(function(s) {
    return '<option value="' + (s.id || '') + '" data-duree="' + (s.duree_estimee_min || 60) + '">' + escHtml(s.nom_service) + '</option>';
  }).join('');
  var options = services.map(function(s) {
    return '<option value="' + (s.id || '') + '" data-duree="' + (s.duree_estimee_min || 60) + '">' + escHtml(s.nom_service) + '</option>';
  }).join('');
  zone.innerHTML =
    '<div style="border:1px solid var(--line,#eee);border-radius:10px;padding:14px;">' +
      (pourVisite ? '<div style="font-size:13px;font-weight:700;color:#1e40af;margin-bottom:8px;">' + T('type_visite') + '</div>' : '') +
      '<div style="font-size:12px;color:var(--mu2,#777);margin-bottom:10px;">' + T('dispo_intro') + '</div>' +
      (options ? '<div id="dispo-services"><select id="dispo-service" onchange="surChangementPrestationsDispo()" style="width:100%;padding:9px 10px;border-radius:8px;border:1px solid var(--line,#ddd);margin-bottom:8px;box-sizing:border-box;">' + options + '</select><div id="dispo-service-photo"></div></div>' +
        (services.length > 1 ? '<a id="dispo-ajout-presta" href="#" onclick="ajouterPrestationDispo();return false;" style="display:inline-block;font-size:12.5px;font-weight:700;color:var(--ac,#1266E3);margin:-2px 0 10px;">' + T('dispo_ajout_presta') + '</a>' : '') : '') +
      '<div id="dispo-compte" style="font-size:12.5px;color:var(--mu2,#777);margin-bottom:8px;"></div>' +
      lieuDispoHTML(artisanId) +
      '<div id="dispo-bloc-adresse" style="display:' + (lieuChoisiDepart(artisanId) === 'salon' ? 'none' : 'block') + ';">' +
      '<input id="dispo-adresse" type="text" placeholder="' + T('ph_adresse_interv') + '" style="width:100%;padding:9px 10px;border-radius:8px;border:1px solid var(--line,#ddd);margin-bottom:8px;box-sizing:border-box;">' +
      '<div style="display:flex;gap:8px;margin-bottom:8px;">' +
        '<input id="dispo-cp" type="text" placeholder="' + T('ph_cp') + '" style="flex:1;min-width:0;padding:9px 10px;border-radius:8px;border:1px solid var(--line,#ddd);box-sizing:border-box;">' +
        '<input id="dispo-commune" type="text" placeholder="' + T('ph_commune') + '" style="flex:2;min-width:0;padding:9px 10px;border-radius:8px;border:1px solid var(--line,#ddd);box-sizing:border-box;">' +
      '</div></div>' +
      '<div style="font-size:12px;font-weight:700;color:var(--mu2,#555);margin:6px 0 6px;">' + T('contact_titre') + '</div>' +
      '<input id="dispo-nom" type="text" autocomplete="name" placeholder="' + T('ph_nom') + '" style="width:100%;padding:9px 10px;border-radius:8px;border:1px solid var(--line,#ddd);margin-bottom:8px;box-sizing:border-box;">' +
      '<input id="dispo-tel" type="tel" autocomplete="tel" placeholder="' + T('ph_tel') + '" style="width:100%;padding:9px 10px;border-radius:8px;border:1px solid var(--line,#ddd);margin-bottom:8px;box-sizing:border-box;">' +
      '<input id="dispo-email" type="email" autocomplete="email" placeholder="' + (montantPaiementEnLigne('visite', artisanId) > 0 || montantPaiementEnLigne('reservation', artisanId) > 0 ? T('ph_email_paiement') : T('ph_email_optionnel')) + '" style="width:100%;padding:9px 10px;border-radius:8px;border:1px solid var(--line,#ddd);margin-bottom:8px;box-sizing:border-box;">' +
      '<button type="button" onclick="verifierDispoReelle(' + jsAttr(artisanId) + ')" style="width:100%;padding:10px;border-radius:8px;border:none;background:var(--ac,#1266E3);color:#fff;font-weight:700;cursor:pointer;">' + T('dispo_verifier_btn') + '</button>' +
      '<div id="dispo-resultat" style="margin-top:10px;"></div>' +
    '</div>';
  prefillDispoDepuisCompte();
  majPhotoServiceDispo();
}
// Photo du service choisi (première liste), affichée sous la liste : le client voit ce qu'il réserve.
function majPhotoServiceDispo() {
  var zone = document.getElementById('dispo-service-photo'), sel = document.getElementById('dispo-service');
  if (!zone) return;
  var s = sel && _profilDataCourant && (_profilDataCourant.services || []).find(function(x) { return String(x.id) === String(sel.value); });
  zone.innerHTML = s && s.photo_url ? '<img src="' + escHtml(s.photo_url) + '" alt="' + escHtml(s.nom_service) + '" loading="lazy" style="display:block;width:100%;max-height:180px;object-fit:cover;border-radius:12px;margin:0 0 8px;background:var(--line,#eee);">' : '';
}

// ── Où se passe le rendez-vous : chez l'artisan (salon, atelier) ou chez le client (15/11/2026) ──
function modeLieuArtisan(artisanId) {
  var a = _profilDataCourant && _profilDataCourant.artisan;
  if (!a || (artisanId && a.id !== artisanId)) return 'domicile';
  return a.mode_lieu === 'salon' || a.mode_lieu === 'les_deux' ? a.mode_lieu : 'domicile';
}
function lieuChoisiDispo(artisanId) {
  var m = modeLieuArtisan(artisanId);
  if (m === 'salon') return 'salon';
  if (m === 'les_deux') { var r = document.querySelector('input[name="dispo-lieu"]:checked'); return r && r.value === 'domicile' ? 'domicile' : 'salon'; }
  return 'domicile';
}
// Le client change « chez l'artisan / chez moi » : l'adresse apparaît ou disparaît, et les créneaux déjà affichés sont effacés.
function basculerLieuDispo(artisanId) {
  var bloc = document.getElementById('dispo-bloc-adresse');
  if (bloc) bloc.style.display = lieuChoisiDispo(artisanId) === 'salon' ? 'none' : 'block';
  window._dispoContexte = null;
  var res = document.getElementById('dispo-resultat'); if (res) res.innerHTML = '';
}

// ── Plusieurs prestations sur une même réservation (14/11/2026) — 4 au maximum. La 1re reste « dispo-service » ; les autres sont « dispo-service-sup ».
var PRESTATIONS_MAX = 4;
function selectsPrestationsDispo() {
  return Array.prototype.slice.call(document.querySelectorAll('#dispo-services select'));
}
function ajouterPrestationDispo() {
  var zone = document.getElementById('dispo-services'); if (!zone) return;
  if (selectsPrestationsDispo().length >= PRESTATIONS_MAX) { alert(T('dispo_prestations_max')); return; }
  var ligne = document.createElement('div');
  ligne.className = 'dispo-ligne-sup';
  ligne.style.cssText = 'display:flex;gap:6px;align-items:center;margin-bottom:8px;';
  ligne.innerHTML = '<select class="dispo-service-sup" onchange="surChangementPrestationsDispo()" style="flex:1;min-width:0;padding:9px 10px;border-radius:8px;border:1px solid var(--line,#ddd);box-sizing:border-box;">' + (window._dispoOptionsServices || '') + '</select>' +
    '<button type="button" onclick="retirerPrestationDispo(this)" title="' + T('dispo_retirer_presta') + '" aria-label="' + T('dispo_retirer_presta') + '" style="flex:none;width:34px;height:34px;border-radius:8px;border:1px solid var(--line,#ddd);background:#fff;color:#dc2626;font-size:16px;cursor:pointer;">✕</button>';
  zone.appendChild(ligne);
  var plein = selectsPrestationsDispo().length >= PRESTATIONS_MAX, lien = document.getElementById('dispo-ajout-presta');
  if (lien) lien.style.display = plein ? 'none' : 'inline-block';
  surChangementPrestationsDispo();
}
function retirerPrestationDispo(bouton) {
  var ligne = bouton.parentNode; if (ligne && ligne.parentNode) ligne.parentNode.removeChild(ligne);
  var lien = document.getElementById('dispo-ajout-presta'); if (lien) lien.style.display = 'inline-block';
  surChangementPrestationsDispo();
}
// Les créneaux affichés dépendaient des anciennes prestations : on les efface, la cliente relance la recherche (jamais un créneau trop court).
function surChangementPrestationsDispo() {
  window._dispoContexte = null;
  majPhotoServiceDispo();
  var res = document.getElementById('dispo-resultat');
  if (res && res.innerHTML.trim()) res.innerHTML = '<div style="font-size:12.5px;color:var(--mu2,#777);">' + T('dispo_changer_presta') + '</div>';
}
// Prestations choisies (sans doublon, 4 au maximum) : ids dans l'ordre, et durée totale.
function prestationsChoisiesDispo() {
  var ids = [], duree = 0;
  selectsPrestationsDispo().forEach(function(sel) {
    var id = sel.value; if (!id || id === 'undefined' || id === 'null' || ids.indexOf(id) !== -1) return;
    ids.push(id);
    duree += parseInt(sel.selectedOptions[0].getAttribute('data-duree'), 10) || 60;
  });
  return { ids: ids.slice(0, PRESTATIONS_MAX), duree: duree };
}

// ── Compte client : préremplit la demande d'intervention (adresse, nom, téléphone, email) quand le client est connecté ──
// Même session que compte.html (même site). Rien n'est jamais écrasé : on ne remplit que les cases encore vides.
function lienCompteRetour() { return '/artisans/compte.html?retour=' + encodeURIComponent(location.href.split('#')[0]); }
async function jetonClientConnecte() {
  var cle = 'sb-uzgboxfxpxazhysusewv-auth-token';
  try {
    var o = JSON.parse(localStorage.getItem(cle) || 'null');
    if (!o || !o.access_token) return null;
    if (o.expires_at && o.expires_at * 1000 > Date.now() + 30000) return o;
    if (!o.refresh_token) return null;
    var r = await fetch(SUPABASE_URL + '/auth/v1/token?grant_type=refresh_token', { method: 'POST', headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON }, body: JSON.stringify({ refresh_token: o.refresh_token }) });
    if (!r.ok) return null;
    var n = await r.json();
    if (!n.access_token) return null;
    o.access_token = n.access_token; o.refresh_token = n.refresh_token || o.refresh_token; o.expires_at = n.expires_at || (Math.floor(Date.now() / 1000) + (n.expires_in || 3600)); if (n.user) o.user = n.user;
    try { localStorage.setItem(cle, JSON.stringify(o)); } catch (e) {}
    return o;
  } catch (e) { return null; }
}
async function prefillDispoDepuisCompte() {
  var zone = document.getElementById('dispo-compte');
  if (!zone) return;
  var o = await jetonClientConnecte();
  var uid = o && o.user && o.user.id, email = o && o.user && o.user.email;
  if (!uid) {
    zone.innerHTML = T('cmpt_deja') + ' <a href="' + lienCompteRetour() + '" target="_blank" rel="noopener" style="color:var(--ac,#1266E3);font-weight:700;">' + T('cmpt_se_connecter') + '</a>';
    return;
  }
  var p = {};
  try {
    var r = await fetch(SUPABASE_URL + '/rest/v1/comptes_clients?select=nom,telephone,adresse,code_postal,commune&user_id=eq.' + encodeURIComponent(uid), { headers: { 'apikey': SUPABASE_ANON, 'Authorization': 'Bearer ' + o.access_token } });
    if (r.ok) p = (await r.json())[0] || {};
  } catch (e) {}
  function mettre(id, v) { var e = document.getElementById(id); if (e && v && !e.value.trim()) e.value = v; }
  mettre('dispo-adresse', p.adresse); mettre('dispo-cp', p.code_postal); mettre('dispo-commune', p.commune);
  mettre('dispo-nom', p.nom); mettre('dispo-tel', p.telephone); mettre('dispo-email', email);
  zone.innerHTML = T('cmpt_connecte');
}
// Le client vient de se connecter dans l'autre onglet : à son retour, on remplit le formulaire sans recharger.
document.addEventListener('visibilitychange', function() { if (!document.hidden && document.getElementById('dispo-compte')) prefillDispoDepuisCompte(); });

async function verifierDispoReelle(artisanId, dateDebut) {
  var resultat = document.getElementById('dispo-resultat');
  var adresse, cp, commune, dureeMin, serviceId, serviceIds = [], contact = null, lieu = 'domicile';

  if (dateDebut && window._dispoContexte) {
    contact = window._dispoContexte.contact || null;
    // Navigation semaine suivante/précédente : on réutilise le contexte déjà validé
    adresse = window._dispoContexte.adresse; cp = window._dispoContexte.cp; commune = window._dispoContexte.commune;
    dureeMin = window._dispoContexte.duree; serviceId = window._dispoContexte.serviceId; serviceIds = window._dispoContexte.serviceIds || []; lieu = window._dispoContexte.lieu || 'domicile';
  } else {
    lieu = lieuChoisiDispo(artisanId);
    if (lieu === 'salon') { // chez l'artisan : pas d'adresse à donner (le serveur utilise celle de l'artisan)
      var art0 = (_profilDataCourant && _profilDataCourant.artisan) || {};
      adresse = 'Chez ' + (art0.nom_entreprise || 'l\'artisan'); cp = ''; commune = art0.commune || '';
    } else {
      adresse = document.getElementById('dispo-adresse').value.trim();
      cp = document.getElementById('dispo-cp').value.trim();
      commune = document.getElementById('dispo-commune').value.trim();
    }
    var cNom = document.getElementById('dispo-nom').value.trim();
    var cTel = document.getElementById('dispo-tel').value.trim();
    var cEmail = document.getElementById('dispo-email').value.trim();
    if (!adresse || !commune || !cNom || !cTel) { resultat.innerHTML = '<div style="color:var(--danger,#dc2626);font-size:12.5px;">' + T('err_champs') + '</div>'; return; }
    if (cNom.indexOf(' ') < 0) { resultat.innerHTML = '<div style="color:var(--danger,#dc2626);font-size:12.5px;">' + T('err_nom_complet') + '</div>'; return; }
    if (cEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cEmail)) { resultat.innerHTML = '<div style="color:var(--danger,#dc2626);font-size:12.5px;">' + T('err_email_format') + '</div>'; return; }
    if (!cEmail && (montantPaiementEnLigne('visite', artisanId) > 0 || montantPaiementEnLigne('reservation', artisanId) > 0)) { resultat.innerHTML = '<div style="color:var(--danger,#dc2626);font-size:12.5px;">' + T('err_email_paiement') + '</div>'; return; }
    contact = { nom: cNom, tel: cTel, email: cEmail };
    var selService = document.getElementById('dispo-service');
    var choix = prestationsChoisiesDispo();
    dureeMin = selService ? (choix.duree || 60) : 60; // durées additionnées quand il y a plusieurs prestations
    serviceIds = choix.ids;
    serviceId = serviceIds.length ? serviceIds[0] : null;
  }

  resultat.innerHTML = '<div style="font-size:12.5px;color:var(--mu,#999);">' + T('dispo_calcul_cours') + '</div>';
  try {
    var res = await fetch(SUPABASE_URL + '/functions/v1/verifier-disponibilite-artisan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + SUPABASE_ANON },
      body: JSON.stringify({ mode: 'creneaux', artisan_id: artisanId, adresse: adresse, code_postal: cp, commune: commune, duree_min: dureeMin, lieu: lieu, date_debut: dateDebut || undefined }),
    });
    var data = await res.json();
    if (data.error) { resultat.innerHTML = '<div style="color:var(--danger,#dc2626);font-size:12.5px;">' + escHtml(data.error) + '</div>'; return; }

    window._dispoContexte = {
      artisanId: artisanId, adresse: adresse, cp: cp, commune: commune, serviceId: serviceId, serviceIds: serviceIds, lieu: lieu, duree: dureeMin, contact: contact,
      secteur: (_profilDataCourant && _profilDataCourant.artisan.secteur) || 'autre',
      latitude: data.latitude, longitude: data.longitude, dateDebutFenetre: data.date_debut_fenetre,
    };

    var auMoinsUnCreneau = data.jours.some(function(j) { return j.creneaux.length > 0; });
    var grille = '<div style="display:flex;align-items:stretch;gap:4px;">' +
      '<button type="button" onclick="' + (data.peut_reculer ? "naviguerSemaineDispo(-1)" : '') + '" ' + (data.peut_reculer ? '' : 'disabled') + ' style="border:none;background:none;font-size:20px;color:' + (data.peut_reculer ? 'var(--ac,#1266E3)' : 'var(--line,#ddd)') + ';cursor:' + (data.peut_reculer ? 'pointer' : 'default') + ';padding:0 4px;">‹</button>' +
      '<div style="flex:1;display:grid;grid-template-columns:repeat(' + data.jours.length + ',1fr);gap:4px;">' +
        data.jours.map(function(j) {
          var dateAff = new Date(j.date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long' });
          return '<div style="text-align:center;">' +
            '<div style="min-height:34px;display:flex;flex-direction:column;justify-content:flex-end;margin-bottom:6px;">' +
              '<div style="font-size:10.5px;font-weight:700;text-transform:capitalize;color:var(--mu2,#555);line-height:1.3;">' + dateAff + '</div>' +
              '<div style="font-size:10.5px;color:var(--mu,#999);line-height:1.3;white-space:nowrap;">' + j.jour_num + ' ' + j.mois_label + '</div>' +
            '</div>' +
            (j.creneaux.length
              ? j.creneaux.map(function(h) {
                  return '<button type="button" onclick="choisirCreneauPublic(' + jsAttr(j.date) + ',' + jsAttr(h) + ')" style="display:block;width:100%;padding:5px 2px;margin-bottom:4px;border-radius:6px;border:1px solid var(--ac-brd,#C7DCFA);background:#eef7f2;color:var(--ac,#1266E3);font-weight:700;font-size:11.5px;cursor:pointer;">' + h + '</button>';
                }).join('')
              : (j.fermeture
                  ? '<div style="color:var(--mu,#999);font-size:10.5px;line-height:1.25;padding:5px 0;">' + escHtml(libelleFermeture(j.fermeture)) + '</div>'
                  : '<div style="color:var(--line,#ccc);font-size:13px;padding:5px 0;">—</div>')) +
          '</div>';
        }).join('') +
      '</div>' +
      '<button type="button" onclick="' + (data.peut_avancer ? "naviguerSemaineDispo(1)" : '') + '" ' + (data.peut_avancer ? '' : 'disabled') + ' style="border:none;background:none;font-size:20px;color:' + (data.peut_avancer ? 'var(--ac,#1266E3)' : 'var(--line,#ddd)') + ';cursor:' + (data.peut_avancer ? 'pointer' : 'default') + ';padding:0 4px;">›</button>' +
    '</div>';

    resultat.innerHTML = grille +
      '<div style="font-size:10.5px;color:var(--mu,#999);text-align:center;margin-top:10px;">' + T('dispo_disclaimer') + '</div>' +
      (auMoinsUnCreneau ? '' : '<div style="font-size:11.5px;color:var(--mu,#999);text-align:center;margin-top:8px;">' + T('dispo_rien_periode') + '</div>') +
      '<div style="text-align:center;margin-top:12px;padding-top:12px;border-top:1px solid var(--line,#eee);">' +
        '<style>@keyframes sm-pulse{0%,100%{opacity:1;background:rgba(18,102,227,.14);}50%{opacity:.45;background:rgba(18,102,227,0);}}.sm-clignote{display:inline-block;padding:2px 8px;border-radius:6px;animation:sm-pulse 1.4s ease-in-out infinite;}@media (prefers-reduced-motion:reduce){.sm-clignote{animation:none;background:rgba(18,102,227,.14);}}</style>' +
        '<a href="#" onclick="ouvrirModalSurMesure();return false;" style="font-size:12px;color:var(--mu2,#777);">' + T('dispo_sur_mesure_q') + ' <strong class="sm-clignote" style="color:var(--ac,#1266E3);">' + T('dispo_sur_mesure_lien') + '</strong></a>' +
      '</div>';
  } catch (e) {
    resultat.innerHTML = '<div style="color:var(--danger,#dc2626);font-size:12.5px;">Erreur de connexion, réessayez.</div>';
  }
}

function naviguerSemaineDispo(direction) {
  var ctx = window._dispoContexte;
  if (!ctx) return;
  var d = new Date(ctx.dateDebutFenetre + 'T12:00:00');
  d.setDate(d.getDate() + direction * 5);
  verifierDispoReelle(ctx.artisanId, d.toISOString().slice(0, 10));
}

function choisirCreneauPublic(dateStr, heureDebut) {
  var ctx = window._dispoContexte;
  if (!ctx) return;
  ctx.date = dateStr;
  ctx.heureDebut = heureDebut;
  ctx.heureFin = minVersHeurePublic(heureVersMinPublic(heureDebut) + (ctx.duree || 60));
  ouvrirModalCreneau();
}

// Cet artisan encaisse-t-il en ligne pour au moins un des deux types de rendez-vous ? (alors l'email est demandé d'emblée)
function paiementPossibleSurCreneau() {
  var ctx = window._dispoContexte;
  var id = ctx && ctx.artisanId;
  return montantPaiementEnLigne('visite', id) > 0 || montantPaiementEnLigne('reservation', id) > 0;
}
// Vérifie l'email avant l'envoi quand cette demande se paie en ligne ; retourne le message d'erreur, ou '' si tout va bien.
function erreurEmailPaiement(email) {
  var ctx = window._dispoContexte;
  return (!email && montantPaiementEnLigne(_typeInterventionChoisi, ctx && ctx.artisanId) > 0) ? T('err_email_paiement') : '';
}
// Si le serveur demande un paiement, on envoie le client vers la page de paiement sécurisée (jamais ailleurs que chez nous).
function suivrePaiementSiRequis(data, err, btn) {
  if (!data || !data.paiement_requis) return false;
  var url = String(data.page_paiement || '');
  if (url.indexOf('https://caralink.app/artisans/payer-prestation.html?token=') !== 0) return false;
  if (btn) { btn.disabled = true; btn.textContent = T('redirection_paiement'); }
  window.location.href = url;
  return true;
}

function ouvrirModalCreneau() {
  var ctx = window._dispoContexte;
  if (!ctx) return;
  _devisPhotos = [];
  _typeInterventionChoisi = null;
  var div = document.getElementById('modal-devis');
  if (!div) { div = document.createElement('div'); div.id = 'modal-devis'; document.body.appendChild(div); }
  var dateAff = new Date(ctx.date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  div.innerHTML =
    '<div style="position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:10002;display:flex;align-items:center;justify-content:center;padding:12px;" onclick="if(event.target===this)fermerModalDevis()">' +
      '<div style="' + STYLE_BOITE_DEVIS + '">' +
        '<div style="font-size:16px;font-weight:700;margin-bottom:4px;">' + T('creneau_titre') + '</div>' +
        '<div style="font-size:12.5px;color:var(--mu2,#777);margin-bottom:16px;text-transform:capitalize;">' + dateAff + ' à ' + ctx.heureDebut + ' — ' + escHtml(ctx.adresse) + '</div>' +
        '<input id="devis-nom" type="text" value="' + escHtml((ctx.contact && ctx.contact.nom) || '') + '" placeholder="' + T('ph_nom') + '" style="width:100%;padding:10px 12px;border-radius:9px;border:1px solid var(--line,#ddd);font-family:\'Work Sans\',sans-serif;font-size:13px;box-sizing:border-box;margin-bottom:10px;">' +
        '<input id="devis-tel" type="tel" value="' + escHtml((ctx.contact && ctx.contact.tel) || '') + '" placeholder="' + T('ph_tel') + '" style="width:100%;padding:10px 12px;border-radius:9px;border:1px solid var(--line,#ddd);font-family:\'Work Sans\',sans-serif;font-size:13px;box-sizing:border-box;margin-bottom:10px;">' +
        '<input id="devis-email" type="email" value="' + escHtml((ctx.contact && ctx.contact.email) || '') + '" placeholder="' + (paiementPossibleSurCreneau() ? T('ph_email_paiement') : T('ph_email_optionnel')) + '" style="width:100%;padding:10px 12px;border-radius:9px;border:1px solid var(--line,#ddd);font-family:\'Work Sans\',sans-serif;font-size:13px;box-sizing:border-box;margin-bottom:10px;">' +
        premiereInterventionHTML() +
        '<textarea id="devis-message" rows="3" placeholder="' + T('ph_precisions') + '" style="width:100%;padding:10px 12px;border-radius:9px;border:1px solid var(--line,#ddd);font-family:\'Work Sans\',sans-serif;font-size:13px;box-sizing:border-box;resize:vertical;margin-bottom:10px;"></textarea>' +
        photosPickerHTML() +
        '<div id="devis-err" style="display:none;color:var(--danger,#dc2626);font-size:12px;margin-bottom:10px;"></div>' +
        '<div style="display:flex;gap:8px;">' +
          '<button id="btn-devis" onclick="envoyerCreneauDevis()" style="flex:1;padding:11px;border-radius:9px;border:none;background:#16a34a;color:#fff;font-size:13px;font-weight:700;cursor:pointer;">' + T('btn_envoyer_artisan') + '</button>' +
          '<button onclick="fermerModalDevis()" style="flex:1;padding:11px;border-radius:9px;border:1px solid var(--line,#ddd);background:transparent;color:var(--mu2,#777);cursor:pointer;">' + T('btn_annuler') + '</button>' +
        '</div>' +
      '</div>' +
    '</div>';
}

function afficherConfirmationDemande(nomArtisan, emailDonne) {
  var div = document.getElementById('modal-devis');
  if (!div) return;
  div.innerHTML =
    '<style>@media(max-width:640px){.cf-box{border-radius:28px !important;padding:34px 24px 26px !important;max-width:none !important;margin:0 6px;}.cf-ico{font-size:72px !important;margin-bottom:14px !important;}.cf-t{font-size:24px !important;font-weight:800 !important;line-height:1.25;margin-bottom:12px !important;}.cf-s{font-size:16px !important;font-weight:600 !important;line-height:1.45 !important;color:#6b7c96 !important;}.cf-btn{width:100% !important;padding:15px !important;font-size:17px !important;border-radius:99px !important;}}</style>' +'<div style="position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:10002;display:flex;align-items:center;justify-content:center;padding:12px;" onclick="if(event.target===this)fermerConfirmationDemande()">' +
      '<div class="cf-box" style="background:var(--panel,#fff);border-radius:14px;padding:28px;max-width:420px;width:100%;text-align:center;">' +
        '<div class="cf-ico" style="font-size:38px;margin-bottom:10px;">✅</div>' +
        '<div class="cf-t" style="font-size:16px;font-weight:700;margin-bottom:10px;">' + T('confirmation_titre') + '</div>' +
        '<div class="cf-s" style="font-size:13.5px;color:var(--mu2,#555);line-height:1.5;margin-bottom:6px;">' + T('confirmation_texte1') + ' <strong>' + escHtml(nomArtisan || 'l\'artisan') + '</strong>' + T('confirmation_texte2') + '</div>' +
        (emailDonne ? '<div class="cf-s" style="font-size:12.5px;color:var(--mu,#999);margin-bottom:16px;">' + T('confirmation_email') + '</div>' : '<div style="margin-bottom:16px;"></div>') +
        '<button class="cf-btn" onclick="fermerConfirmationDemande()" style="width:100%;padding:11px;border-radius:9px;border:none;background:var(--ac,#1266E3);color:#fff;font-size:13px;font-weight:700;cursor:pointer;">' + T('btn_fermer') + '</button>' +
      '</div>' +
    '</div>';
}

function fermerConfirmationDemande() {
  fermerModalDevis();
  fermerProfil({ target: null, currentTarget: null });
}

async function envoyerCreneauDevis() {
  var ctx = window._dispoContexte;
  if (!ctx) return;
  var nom = document.getElementById('devis-nom').value.trim();
  var tel = document.getElementById('devis-tel').value.trim();
  var email = document.getElementById('devis-email').value.trim();
  var message = document.getElementById('devis-message').value.trim() || 'Proposition de créneau via la disponibilité en ligne CaraLink Artisans.';
  var err = document.getElementById('devis-err');
  var btn = document.getElementById('btn-devis');

  if (!nom || !tel) { err.textContent = T('err_champs'); err.style.display = 'block'; return; }
  if (_typeInterventionChoisi !== 'visite' && _typeInterventionChoisi !== 'reservation') { err.textContent = T('err_premiere_requise'); err.style.display = 'block'; return; }
  var errMail = erreurEmailPaiement(email);
  if (errMail) { err.textContent = errMail; err.style.display = 'block'; return; }
  btn.disabled = true; btn.textContent = T('btn_envoi_cours');

  try {
    var res = await fetch(SUPABASE_URL + '/functions/v1/soumettre-demande-devis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + SUPABASE_ANON },
      body: JSON.stringify({
        client_nom: nom, client_telephone: tel, client_email: email || null, contact_prefere: email ? 'email' : 'telephone',
        commune: ctx.commune, description_besoin: message, secteur: ctx.secteur, photos: _devisPhotos,
        artisan_id: ctx.artisanId, type_intervention: _typeInterventionChoisi,
        date_intervention: ctx.date, heure_debut: ctx.heureDebut, heure_fin: ctx.heureFin,
        adresse: ctx.adresse, code_postal: ctx.cp, service_id: ctx.serviceId, service_ids: ctx.serviceIds || [], lieu: ctx.lieu || 'domicile',
        latitude: ctx.latitude, longitude: ctx.longitude,
      }),
    });
    var data = await res.json();
    if (data.error) throw new Error(data.error);
    if (suivrePaiementSiRequis(data, err, btn)) return;

    afficherConfirmationDemande(_profilDataCourant && _profilDataCourant.artisan && _profilDataCourant.artisan.nom_entreprise, !!email);
  } catch (e) {
    err.textContent = e.message; err.style.display = 'block';
    btn.disabled = false; btn.textContent = T('btn_envoyer_artisan');
  }
}

// ── Demande sur-mesure — le client choisit un horaire hors des créneaux calculés,
// l'artisan valide manuellement (jamais automatique, pour ne pas geler un créneau
// flexible sur une demande qui aurait pu être casée ailleurs) ──
function ouvrirModalSurMesure() {
  var ctx = window._dispoContexte;
  if (!ctx) return;
  _devisPhotos = [];
  _typeInterventionChoisi = null;
  var div = document.getElementById('modal-devis');
  if (!div) { div = document.createElement('div'); div.id = 'modal-devis'; document.body.appendChild(div); }
  div.innerHTML =
    '<div style="position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:10002;display:flex;align-items:center;justify-content:center;padding:12px;" onclick="if(event.target===this)fermerModalDevis()">' +
      '<div style="' + STYLE_BOITE_DEVIS + '">' +
        '<div style="font-size:16px;font-weight:700;margin-bottom:4px;">' + T('surmesure_titre') + '</div>' +
        '<div style="font-size:12px;color:var(--mu2,#777);margin-bottom:16px;">' + T('surmesure_intro1') + '<br>📍 ' + escHtml(ctx.adresse) + '</div>' +
        '<div style="display:flex;gap:8px;margin-bottom:10px;">' +
          '<input id="sm-date" type="date" style="flex:1;min-width:0;padding:10px 12px;border-radius:9px;border:1px solid var(--line,#ddd);font-size:13px;box-sizing:border-box;">' +
          '<input id="sm-heure" type="time" style="flex:1;min-width:0;padding:10px 12px;border-radius:9px;border:1px solid var(--line,#ddd);font-size:13px;box-sizing:border-box;">' +
        '</div>' +
        '<input id="devis-nom" type="text" placeholder="' + T('ph_nom') + '" style="width:100%;padding:10px 12px;border-radius:9px;border:1px solid var(--line,#ddd);font-family:\'Work Sans\',sans-serif;font-size:13px;box-sizing:border-box;margin-bottom:10px;">' +
        '<input id="devis-tel" type="tel" placeholder="' + T('ph_tel') + '" style="width:100%;padding:10px 12px;border-radius:9px;border:1px solid var(--line,#ddd);font-family:\'Work Sans\',sans-serif;font-size:13px;box-sizing:border-box;margin-bottom:10px;">' +
        '<input id="devis-email" type="email" placeholder="' + (paiementPossibleSurCreneau() ? T('ph_email_paiement') : T('ph_email_optionnel')) + '" style="width:100%;padding:10px 12px;border-radius:9px;border:1px solid var(--line,#ddd);font-family:\'Work Sans\',sans-serif;font-size:13px;box-sizing:border-box;margin-bottom:10px;">' +
        premiereInterventionHTML() +
        '<textarea id="devis-message" rows="3" placeholder="' + T('ph_pourquoi') + '" style="width:100%;padding:10px 12px;border-radius:9px;border:1px solid var(--line,#ddd);font-family:\'Work Sans\',sans-serif;font-size:13px;box-sizing:border-box;resize:vertical;margin-bottom:10px;"></textarea>' +
        photosPickerHTML() +
        '<div id="devis-err" style="display:none;color:var(--danger,#dc2626);font-size:12px;margin-bottom:10px;"></div>' +
        '<div style="display:flex;gap:8px;">' +
          '<button id="btn-devis" onclick="envoyerSurMesureDevis()" style="flex:1;padding:11px;border-radius:9px;border:none;background:var(--ac,#1266E3);color:#fff;font-size:13px;font-weight:700;cursor:pointer;">' + T('btn_envoyer_demande') + '</button>' +
          '<button onclick="fermerModalDevis()" style="flex:1;padding:11px;border-radius:9px;border:1px solid var(--line,#ddd);background:transparent;color:var(--mu2,#777);cursor:pointer;">' + T('btn_annuler') + '</button>' +
        '</div>' +
      '</div>' +
    '</div>';
}

async function envoyerSurMesureDevis() {
  var ctx = window._dispoContexte;
  if (!ctx) return;
  var dateVal = document.getElementById('sm-date').value;
  var heureVal = document.getElementById('sm-heure').value;
  var nom = document.getElementById('devis-nom').value.trim();
  var tel = document.getElementById('devis-tel').value.trim();
  var email = document.getElementById('devis-email').value.trim();
  var message = document.getElementById('devis-message').value.trim() || 'Demande sur-mesure via la disponibilité en ligne CaraLink Artisans.';
  var err = document.getElementById('devis-err');
  var btn = document.getElementById('btn-devis');

  if (!dateVal || !heureVal || !nom || !tel) { err.textContent = T('err_champs'); err.style.display = 'block'; return; }
  if (_typeInterventionChoisi !== 'visite' && _typeInterventionChoisi !== 'reservation') { err.textContent = T('err_premiere_requise'); err.style.display = 'block'; return; }
  var errMail = erreurEmailPaiement(email);
  if (errMail) { err.textContent = errMail; err.style.display = 'block'; return; }
  btn.disabled = true; btn.textContent = T('btn_envoi_cours');

  var heureFin = minVersHeurePublic(heureVersMinPublic(heureVal) + (ctx.duree || 60));

  try {
    var res = await fetch(SUPABASE_URL + '/functions/v1/soumettre-demande-devis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + SUPABASE_ANON },
      body: JSON.stringify({
        client_nom: nom, client_telephone: tel, client_email: email || null, contact_prefere: email ? 'email' : 'telephone',
        commune: ctx.commune, description_besoin: message, secteur: ctx.secteur, photos: _devisPhotos,
        artisan_id: ctx.artisanId, type_intervention: _typeInterventionChoisi,
        date_intervention: dateVal, heure_debut: heureVal, heure_fin: heureFin,
        adresse: ctx.adresse, code_postal: ctx.cp, service_id: ctx.serviceId, service_ids: ctx.serviceIds || [], lieu: ctx.lieu || 'domicile',
        latitude: ctx.latitude, longitude: ctx.longitude,
        hors_horaires: true,
      }),
    });
    var data = await res.json();
    if (data.error) throw new Error(data.error);
    if (suivrePaiementSiRequis(data, err, btn)) return;

    afficherConfirmationDemande(_profilDataCourant && _profilDataCourant.artisan && _profilDataCourant.artisan.nom_entreprise, !!email);
  } catch (e) {
    err.textContent = e.message; err.style.display = 'block';
    btn.disabled = false; btn.textContent = T('btn_envoyer_demande');
  }
}

// ════════════════════════════════════════
//  DEMANDE DE DEVIS
// ════════════════════════════════════════
// ── Photos jointes (optionnel) — partagées entre les 2 modales de devis ──
var _devisPhotos = []; // data URLs base64, redimensionnées, 4 maximum

function redimensionnerImage(file, maxWidth) {
  return new Promise(function(resolve, reject) {
    var reader = new FileReader();
    reader.onload = function(e) {
      var img = new Image();
      img.onload = function() {
        var scale = Math.min(1, maxWidth / img.width);
        var w = Math.round(img.width * scale), h = Math.round(img.height * scale);
        var canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.75));
      };
      img.onerror = function() { reject(new Error('Image illisible')); };
      img.src = e.target.result;
    };
    reader.onerror = function() { reject(new Error('Lecture du fichier échouée')); };
    reader.readAsDataURL(file);
  });
}

// ── Nature de la demande — deux choix clairs dès le départ (refonte du 05/10), partagés entre les formulaires de devis ──
//  « renseignement » : un échange de messages, aucun déplacement.
//  « visite »        : l'artisan se déplace pour estimer le chantier (frais de déplacement annoncés avant l'envoi).
//  « reservation »   : réservation directe d'un créneau par un client qui connaît déjà l'artisan (fenêtres de créneau seulement).
// Boîte des fenêtres de demande : plus haute que l'écran dès qu'on affiche les frais ou la question « première intervention » →
// elle DÉFILE (comme la fenêtre de commande), pour que les boutons du bas restent toujours accessibles, aussi sur téléphone.
var STYLE_BOITE_DEVIS = 'background:var(--panel,#fff);border-radius:14px;padding:24px;max-width:440px;width:100%;max-height:90vh;overflow-y:auto;overscroll-behavior:contain;';
var _typeInterventionChoisi = null;
var TYPES_INTERVENTION = [
  { code: 'renseignement', labelKey: 'type_renseignement', descKey: 'type_renseignement_desc' },
  { code: 'visite', labelKey: 'type_visite', descKey: 'type_visite_desc' },
];
// Anciens types : uniquement pour LIRE d'anciennes demandes (libellés). Jamais proposés au client.
var TYPES_INTERVENTION_ANCIENS = [
  { code: 'urgence', labelKey: 'type_urgence' },
  { code: 'installation', labelKey: 'type_installation' },
  { code: 'devis', labelKey: 'type_devis' },
  { code: 'entretien', labelKey: 'type_entretien' },
];

function formaterEurosPublic(n) {
  var loc = AT_LANG === 'en' ? 'en-GB' : (AT_LANG === 'es' ? 'es-ES' : 'fr-FR');
  return Number(n).toLocaleString(loc, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

// Frais de déplacement de l'artisan dont la fiche est ouverte : un nombre (0 = visite sans frais), ou undefined si on ne
// connaît pas l'artisan (demande ouverte à plusieurs artisans : chacun a les siens).
function fraisDeplacementContexte(artisanId) {
  var a = _profilDataCourant && _profilDataCourant.artisan;
  if (!a || (artisanId && a.id !== artisanId)) return undefined;
  var f = Number(a.frais_deplacement);
  return (a.frais_deplacement == null || !isFinite(f) || f < 0) ? 0 : f;
}

// L'artisan propose-t-il une visite d'estimation ? « Non » seulement s'il l'a indiqué dans son profil MPA. Sans réponse de sa part
// (vide), la visite reste proposée comme avant. Sans artisan précis (demande ouverte à plusieurs artisans) : oui.
function visitePropose(artisanId) {
  var a = _profilDataCourant && _profilDataCourant.artisan;
  if (!a || (artisanId && a.id !== artisanId)) return true;
  if (a.mode_lieu === 'salon') return false; // l'artisan reçoit chez lui : pas de visite d'estimation, réservation directe
  return a.proposer_visite !== false;
}

// ── Paiement en ligne à la réservation (15/10/2026) ──
// L'artisan dont la fiche est ouverte, SEULEMENT s'il a activé ses paiements en ligne (sinon : ancien fonctionnement, rien à payer ici).
// Prix total connu du service choisi (forfait, ou tarif horaire × durée), sinon null. Même règle que le serveur, qui recalcule de toute façon.
function prixTotalServiceChoisi() {
  var ctx = window._dispoContexte, services = (_profilDataCourant && _profilDataCourant.services) || [];
  if (!ctx || !ctx.serviceId) return null;
  var ids = (ctx.serviceIds && ctx.serviceIds.length) ? ctx.serviceIds : [ctx.serviceId];
  var total = null; // somme des prix CONNUS (comme le serveur) : un service sans prix fixe ne compte pas, le plafond reste donc prudent
  ids.forEach(function(id) {
    var sv = services.find(function(x) { return x.id === id; });
    if (!sv) return;
    var pu = Number(sv.prix_indicatif), unite = String(sv.unite || '').trim().toLowerCase(), duree = Number(sv.duree_estimee_min), p = null;
    if (!(pu > 0)) return;
    if (!unite || unite.indexOf('forfait') >= 0) p = pu;
    else if (/^(h|heure|heures)$/.test(unite) && duree > 0) p = Math.round(pu * duree / 60 * 100) / 100;
    if (p !== null) total = Math.round(((total || 0) + p) * 100) / 100;
  });
  return total;
}
function artisanPaiementsActifs(artisanId) {
  var a = _profilDataCourant && _profilDataCourant.artisan;
  if (!a || (artisanId && a.id !== artisanId)) return null;
  return a.stripe_connect_statut === 'actif' ? a : null;
}
// Montant que le client paiera en ligne pour ce type de demande (0 = rien). Seulement un affichage : le serveur recalcule tout.
function montantPaiementEnLigne(type, artisanId) {
  var a = artisanPaiementsActifs(artisanId);
  if (!a) return 0;
  var m = type === 'visite' ? Number(a.frais_deplacement) : (type === 'reservation' ? Number(a.frais_reservation) : 0);
  if (type === 'reservation' && isFinite(m)) { // anti-arnaque : au plus 30 % du prix du service (s'il est connu) et 100 €, comme le serveur
    m = Math.min(m, 100);
    var pt = prixTotalServiceChoisi(); if (pt !== null) m = Math.min(m, Math.floor(pt * 0.30 * 100) / 100);
  }
  return isFinite(m) && m >= 0.5 ? m : 0;
}
function politiqueAnnulationHTML(a) {
  var h = Number(a && a.annulation_gratuite_heures);
  if (!isFinite(h)) h = 24;
  if (h > 0) {
    // Créneau déjà plus proche que le délai gratuit : on prévient AVANT que le client ne choisisse et ne paie (heure de la Guadeloupe, UTC-4).
    var ctx = window._dispoContexte;
    if (ctx && ctx.date && ctx.heureDebut) {
      var debut = new Date(ctx.date + 'T' + String(ctx.heureDebut).slice(0, 5) + ':00-04:00').getTime();
      if (isFinite(debut) && Date.now() > debut - h * 3600000) return '<strong>⚠️ ' + T('annul_trop_tard_1') + h + T('annul_trop_tard_2') + '</strong>';
    }
    return T('annul_grat_1') + h + T('annul_grat_2');
  }
  return T('annul_aucune');
}
function reservationInfoHTML() {
  var ctx = window._dispoContexte;
  var a = artisanPaiementsActifs(ctx && ctx.artisanId);
  var m = montantPaiementEnLigne('reservation', ctx && ctx.artisanId);
  if (!a || !m) return '';
  return '<div style="background:#f0fdf4;border:1px solid #bbf7d0;color:#166534;border-radius:9px;padding:10px 12px;font-size:12.5px;line-height:1.45;margin-top:8px;">' +
    '<div style="font-weight:600;">' + T('reservation_frais_enligne') + ' <strong>' + formaterEurosPublic(m) + '</strong></div>' +
    '<div style="margin-top:4px;">' + T('reservation_mention_enligne') + '</div>' +
    '<div style="margin-top:4px;">' + politiqueAnnulationHTML(a) + '</div>' +
  '</div>';
}

function visiteInfoHTML(frais) {
  var ctxV = window._dispoContexte;
  var aActif = artisanPaiementsActifs(ctxV && ctxV.artisanId);
  if (aActif && frais !== undefined && frais >= 0.5) {
    return '<div style="background:#f0fdf4;border:1px solid #bbf7d0;color:#166534;border-radius:9px;padding:10px 12px;font-size:12.5px;line-height:1.45;margin-top:8px;">' +
      '<div style="font-weight:600;">' + T('visite_frais_enligne') + ' <strong>' + formaterEurosPublic(frais) + '</strong></div>' +
      '<div style="margin-top:4px;">' + T('visite_mention_enligne') + '</div>' +
      '<div style="margin-top:4px;">' + politiqueAnnulationHTML(aActif) + '</div>' +
      '<div style="margin-top:4px;">' + T('visite_mention') + '</div>' +
    '</div>';
  }
  var ligne = frais === undefined
    ? T('visite_frais_variables')
    : (frais > 0 ? T('visite_frais') + ' <strong>' + formaterEurosPublic(frais) + '</strong>' : T('visite_sans_frais'));
  return '<div style="background:#eff6ff;border:1px solid #bfdbfe;color:#1e40af;border-radius:9px;padding:10px 12px;font-size:12.5px;line-height:1.45;margin-top:8px;">' +
    '<div style="font-weight:600;">' + ligne + '</div>' +
    '<div style="margin-top:4px;">' + T('visite_mention') + '</div>' +
  '</div>';
}

function typeInterventionPickerHTML() {
  return '<div style="margin-bottom:10px;">' +
      '<div style="font-size:11.5px;font-weight:600;color:var(--mu2,#777);margin-bottom:6px;">' + T('type_interv_titre') + '</div>' +
      '<div id="type-interv-pills" style="display:flex;flex-direction:column;gap:8px;">' +
        TYPES_INTERVENTION.map(function(t) {
          return '<button type="button" id="type-interv-' + t.code + '" onclick="choisirTypeIntervention(\'' + t.code + '\')" style="text-align:left;padding:10px 12px;border-radius:10px;border:1.5px solid var(--line,#ddd);background:transparent;color:var(--mu2,#555);cursor:pointer;font-family:inherit;">' +
            '<div style="font-size:13px;font-weight:700;">' + T(t.labelKey) + '</div>' +
            '<div class="type-interv-desc" style="font-size:12px;margin-top:3px;line-height:1.4;opacity:.85;">' + T(t.descKey) + '</div>' +
          '</button>';
        }).join('') +
      '</div>' +
      '<div id="type-interv-info"></div>' +
    '</div>';
}

function choisirTypeIntervention(code) {
  _typeInterventionChoisi = code; // un choix est obligatoire : pas de désélection
  TYPES_INTERVENTION.forEach(function(t) {
    var btn = document.getElementById('type-interv-' + t.code);
    if (!btn) return;
    var actif = _typeInterventionChoisi === t.code;
    btn.style.background = actif ? 'var(--ac,#1266E3)' : 'transparent';
    btn.style.color = actif ? '#fff' : 'var(--mu2,#555)';
    btn.style.borderColor = actif ? 'var(--ac,#1266E3)' : 'var(--line,#ddd)';
  });
  var info = document.getElementById('type-interv-info');
  if (info) info.innerHTML = code === 'visite' ? visiteInfoHTML(window._typeInterventionFrais) : '';
  if (typeof window._onTypeInterventionChoisi === 'function') window._onTypeInterventionChoisi(code);
}

function typeInterventionLabel(code) {
  var t = TYPES_INTERVENTION.concat(TYPES_INTERVENTION_ANCIENS).find(function(x) { return x.code === code; });
  return t ? T(t.labelKey) : null;
}

// « Devis / Rendez-vous sur place » choisi dans le formulaire de message d'un artisan : un rendez-vous a besoin d'un créneau,
// on passe donc à la vérification de disponibilité (la question « première intervention ? » y est déjà répondue : oui).
function commencerVisiteDepuisDevis(artisanId) {
  var zone = document.getElementById('dispo-zone-' + artisanId);
  if (!zone || !_profilDataCourant) { showToast(T('visite_pas_de_creneaux')); return; }
  fermerModalDevis();
  ouvrirVerifDispo(artisanId, true); // true = le client a déjà choisi « Rendez-vous sur place » : on ne le lui redemande pas
  if (zone.scrollIntoView) zone.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ── Fenêtres de créneau : « première intervention avec cet artisan ? » (réponse obligatoire) ──
function premiereInterventionHTML() {
  var ctx = window._dispoContexte;
  window._typeInterventionFrais = fraisDeplacementContexte(ctx && ctx.artisanId);
  // L'artisan a indiqué qu'il ne propose pas de visite d'estimation : aucune question, c'est une réservation directe.
  if (!visitePropose(ctx && ctx.artisanId) || (ctx && ctx.lieu === 'salon')) { _typeInterventionChoisi = 'reservation'; return reservationInfoHTML() ? '<div style="margin-bottom:10px;">' + reservationInfoHTML() + '</div>' : ''; }
  // Le client vient de choisir « Rendez-vous sur place » pour CET artisan : la réponse est déjà donnée, on affiche seulement le rappel.
  if (window._visiteDemandee && ctx && window._visiteDemandee === ctx.artisanId) {
    _typeInterventionChoisi = 'visite';
    return '<div id="premiere-interv" style="margin-bottom:10px;">' +
        '<div style="font-size:13px;font-weight:700;color:#1e40af;">' + T('type_visite') + '</div>' +
        visiteInfoHTML(window._typeInterventionFrais) +
      '</div>';
  }
  return '<div id="premiere-interv" style="background:#EEF4FF;border:1px solid #9DC2F7;border-radius:10px;padding:12px;margin-bottom:10px;">' +
      '<div style="font-size:13px;font-weight:700;color:#0B3D91;margin-bottom:4px;">' + T('premiere_titre') + '</div>' +
      '<div style="font-size:12.5px;color:#0B3D91;line-height:1.45;margin-bottom:8px;">' + T('premiere_texte') + '</div>' +
      '<label style="display:flex;gap:8px;align-items:flex-start;font-size:13px;cursor:pointer;margin-bottom:6px;"><input type="radio" name="premiere-interv" value="oui" onchange="choisirPremiereIntervention(\'visite\')" style="margin-top:2px;"><span>' + T('premiere_oui') + '</span></label>' +
      '<label style="display:flex;gap:8px;align-items:flex-start;font-size:13px;cursor:pointer;"><input type="radio" name="premiere-interv" value="non" onchange="choisirPremiereIntervention(\'reservation\')" style="margin-top:2px;"><span>' + T('premiere_non') + '</span></label>' +
      '<div id="premiere-interv-info"></div>' +
    '</div>';
}

function choisirPremiereIntervention(code) {
  _typeInterventionChoisi = code; // 'visite' (devis / rendez-vous sur place) ou 'reservation' (réservation directe)
  var info = document.getElementById('premiere-interv-info');
  if (info) info.innerHTML = code === 'visite' ? visiteInfoHTML(window._typeInterventionFrais) : (code === 'reservation' ? reservationInfoHTML() : '');
}

function photosPickerHTML() {
  return '<div style="margin-bottom:10px;">' +
      '<div style="font-size:11.5px;font-weight:600;color:var(--mu2,#777);margin-bottom:6px;">' + T('photos_titre') + '</div>' +
      '<input type="file" id="devis-photos-input" accept="image/*" multiple style="display:none;" onchange="ajouterPhotosDevis(this.files)">' +
      '<button type="button" onclick="document.getElementById(\'devis-photos-input\').click()" style="width:100%;padding:9px;border-radius:8px;border:1.5px dashed var(--line,#ddd);background:transparent;color:var(--mu2,#777);font-size:12.5px;font-weight:600;cursor:pointer;">' + T('photos_btn') + '</button>' +
      '<div style="font-size:11.5px;color:var(--mu2,#777);margin-top:6px;line-height:1.4;">' + T('photos_securite') + '</div>' +
      '<div id="devis-photos-preview" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;"></div>' +
    '</div>';
}

function ajouterPhotosDevis(files) {
  var restant = 4 - _devisPhotos.length;
  if (restant <= 0) return;
  var liste = Array.prototype.slice.call(files).slice(0, restant);
  liste.forEach(function(f) {
    redimensionnerImage(f, 1200).then(function(dataUrl) {
      _devisPhotos.push(dataUrl);
      renderPhotosDevis();
    }).catch(function() { /* photo illisible : on l'ignore silencieusement, jamais bloquant */ });
  });
  document.getElementById('devis-photos-input').value = '';
}

function renderPhotosDevis() {
  var zone = document.getElementById('devis-photos-preview');
  if (!zone) return;
  zone.innerHTML = _devisPhotos.map(function(url, i) {
    return '<div style="position:relative;">' +
      '<img src="' + escHtml(url) + '" style="width:56px;height:56px;object-fit:cover;border-radius:8px;border:1px solid var(--line,#ddd);">' +
      '<button type="button" onclick="retirerPhotoDevis(' + i + ')" style="position:absolute;top:-6px;right:-6px;width:18px;height:18px;border-radius:50%;background:#dc2626;color:#fff;border:none;font-size:11px;line-height:1;cursor:pointer;padding:0;">✕</button>' +
    '</div>';
  }).join('');
}

function retirerPhotoDevis(i) {
  _devisPhotos.splice(i, 1);
  renderPhotosDevis();
}

// ── Préférence de contact (téléphone ou email) — partagée entre les 2 modales de devis ──
var _devisContactPref = 'telephone';

function contactPrefHTML() {
  return '<div style="margin-bottom:10px;">' +
      '<div style="font-size:11.5px;font-weight:600;color:var(--mu2,#777);margin-bottom:6px;">' + T('pref_contact_titre') + '</div>' +
      '<div style="display:flex;gap:8px;">' +
        '<button type="button" id="pref-tel-btn" onclick="choisirContactPref(\'telephone\')" style="flex:1;padding:8px;border-radius:8px;border:1.5px solid var(--ac,#1266E3);background:var(--ac,#1266E3);color:#fff;font-size:12.5px;font-weight:600;cursor:pointer;">' + T('pref_tel') + '</button>' +
        '<button type="button" id="pref-email-btn" onclick="choisirContactPref(\'email\')" style="flex:1;padding:8px;border-radius:8px;border:1.5px solid var(--line,#ddd);background:transparent;color:var(--mu2,#777);font-size:12.5px;font-weight:600;cursor:pointer;">' + T('pref_email') + '</button>' +
      '</div>' +
    '</div>' +
    '<input id="devis-email" type="email" placeholder="votre@email.com" style="display:none;width:100%;padding:10px 12px;border-radius:9px;border:1px solid var(--line,#ddd);font-family:\'Work Sans\',sans-serif;font-size:13px;box-sizing:border-box;margin-bottom:10px;">';
}

function choisirContactPref(pref) {
  _devisContactPref = pref;
  var btnTel = document.getElementById('pref-tel-btn');
  var btnEmail = document.getElementById('pref-email-btn');
  var champEmail = document.getElementById('devis-email');
  if (!btnTel || !btnEmail) return;
  btnTel.style.background = pref === 'telephone' ? 'var(--ac,#1266E3)' : 'transparent';
  btnTel.style.color = pref === 'telephone' ? '#fff' : 'var(--mu2,#777)';
  btnTel.style.borderColor = pref === 'telephone' ? 'var(--ac,#1266E3)' : 'var(--line,#ddd)';
  btnEmail.style.background = pref === 'email' ? 'var(--ac,#1266E3)' : 'transparent';
  btnEmail.style.color = pref === 'email' ? '#fff' : 'var(--mu2,#777)';
  btnEmail.style.borderColor = pref === 'email' ? 'var(--ac,#1266E3)' : 'var(--line,#ddd)';
  if (champEmail) champEmail.style.display = pref === 'email' ? 'block' : 'none';
}

function ouvrirModalDevis(artisanId, nomArtisan, secteurArtisan) {
  _devisContactPref = 'telephone'; // réinitialisé à chaque ouverture
  _devisPhotos = []; document.getElementById('devis-photos-preview') && (document.getElementById('devis-photos-preview').innerHTML = '');
  // Un artisan qui ne propose pas de visite : pas de choix à faire, c'est un renseignement (le formulaire s'ouvre directement).
  var visiteOk = visitePropose(artisanId);
  _typeInterventionChoisi = visiteOk ? null : 'renseignement';
  window._typeInterventionFrais = fraisDeplacementContexte(artisanId);
  // « Rendez-vous sur place » : le bouton devient « Choisir un créneau de visite » (un rendez-vous a besoin d'un créneau).
  window._onTypeInterventionChoisi = function(code) {
    var b = document.getElementById('btn-devis'); if (!b) return;
    // Un renseignement a besoin des coordonnées et du message ; un rendez-vous sur place, non : tout est demandé APRÈS le créneau.
    var champs = document.getElementById('devis-champs'); if (champs) champs.style.display = code === 'visite' ? 'none' : 'block';
    // Fonctions directes (pas d'attribut HTML) : aucune valeur à échapper.
    if (code === 'visite') {
      b.textContent = T('visite_choisir_creneau');
      b.onclick = function() { commencerVisiteDepuisDevis(artisanId); };
    } else {
      b.textContent = T('btn_envoyer');
      b.onclick = function() { envoyerDemandeDevis(artisanId, secteurArtisan || 'autre'); };
    }
  };
  var div = document.getElementById('modal-devis');
  if (!div) { div = document.createElement('div'); div.id = 'modal-devis'; document.body.appendChild(div); }
  div.innerHTML =
    '<div style="position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:10002;display:flex;align-items:center;justify-content:center;padding:12px;" onclick="if(event.target===this)fermerModalDevis()">' +
      '<div style="' + STYLE_BOITE_DEVIS + '">' +
        '<div style="font-size:16px;font-weight:700;margin-bottom:4px;">' + T('devis_titre') + '</div>' +
        '<div style="font-size:12px;color:var(--mu2,#777);margin-bottom:16px;">' + (nomArtisan ? T('devis_sub_a') + ' ' + escHtml(nomArtisan) + '. ' : '') + T('devis_sub_suite') + '</div>' +
        (visiteOk ? typeInterventionPickerHTML() : '') +
        '<div id="devis-champs" style="display:' + (visiteOk ? 'none' : 'block') + ';">' +
        '<input id="devis-nom" type="text" placeholder="' + T('ph_nom') + '" style="width:100%;padding:10px 12px;border-radius:9px;border:1px solid var(--line,#ddd);font-family:\'Work Sans\',sans-serif;font-size:13px;box-sizing:border-box;margin-bottom:10px;">' +
        '<input id="devis-tel" type="tel" placeholder="' + T('ph_tel') + '" style="width:100%;padding:10px 12px;border-radius:9px;border:1px solid var(--line,#ddd);font-family:\'Work Sans\',sans-serif;font-size:13px;box-sizing:border-box;margin-bottom:10px;">' +
        contactPrefHTML() +
        '<input id="devis-commune" type="text" placeholder="' + T('ph_commune') + '" style="width:100%;padding:10px 12px;border-radius:9px;border:1px solid var(--line,#ddd);font-family:\'Work Sans\',sans-serif;font-size:13px;box-sizing:border-box;margin-bottom:10px;">' +
        '<textarea id="devis-message" rows="4" placeholder="' + T('ph_message') + '" style="width:100%;padding:10px 12px;border-radius:9px;border:1px solid var(--line,#ddd);font-family:\'Work Sans\',sans-serif;font-size:13px;box-sizing:border-box;resize:vertical;margin-bottom:10px;"></textarea>' +
        photosPickerHTML() +
        '</div>' +
        '<div id="devis-err" style="display:none;color:var(--danger,#dc2626);font-size:12px;margin-bottom:10px;"></div>' +
        '<div style="display:flex;gap:8px;">' +
          '<button id="btn-devis" onclick="envoyerDemandeDevis(' + jsAttr(artisanId) + ',' + jsAttr(secteurArtisan||'autre') + ')" style="flex:1;padding:11px;border-radius:9px;border:none;background:var(--ac,#1266E3);color:#fff;font-size:13px;font-weight:700;cursor:pointer;">' + T('btn_envoyer') + '</button>' +
          '<button onclick="fermerModalDevis()" style="flex:1;padding:11px;border-radius:9px;border:1px solid var(--line,#ddd);background:transparent;color:var(--mu2,#777);cursor:pointer;">' + T('btn_annuler') + '</button>' +
        '</div>' +
      '</div>' +
    '</div>';
}
function fermerModalDevis() { var div = document.getElementById('modal-devis'); if (div) div.innerHTML = ''; window._onTypeInterventionChoisi = null; }

// ⚠️ À REMPLIR avant déploiement — Stripe Dashboard → Développeurs → Clés API → "Clé publiable" (pk_live_...).
// Jamais la clé secrète ici, uniquement la clé publique (faite pour être visible côté client).
var STRIPE_PUBLIC_KEY = 'pk_live_51TWxxBJPTOXXy1ykTYLysvDCbnnJUXzqbc164Wif38u1g7BijiOLdUWKD8HPlQBX7he8K76aZNMUARo14yuQhzdQ000WVXdeEF';
var _stripeClient = null;
var _stripeElements = null;

// ── Modale de commande sur un article du catalogue ──
function ouvrirModalCommande(catalogueId, nomArticle, paiementActif) {
  var div = document.getElementById('modal-commande');
  if (!div) { div = document.createElement('div'); div.id = 'modal-commande'; document.body.appendChild(div); }
  div.innerHTML =
    '<div style="position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:10002;display:flex;align-items:center;justify-content:center;padding:12px;" onclick="if(event.target===this)fermerModalCommande()">' +
      '<div style="background:var(--panel,#fff);border-radius:14px;padding:24px;max-width:440px;width:100%;max-height:90vh;overflow-y:auto;">' +
        '<div style="font-size:16px;font-weight:700;margin-bottom:4px;">Commander</div>' +
        '<div style="font-size:12px;color:var(--mu2,#777);margin-bottom:16px;">' + escHtml(nomArticle) + (paiementActif ? ' — paiement en ligne disponible' : '') + '</div>' +
        '<input type="hidden" id="cmd-catalogue-id" value="' + escHtml(catalogueId) + '">' +
        '<input type="hidden" id="cmd-nom-article" value="' + escHtml(nomArticle) + '">' +
        '<input type="hidden" id="cmd-paiement-actif" value="' + (paiementActif ? '1' : '0') + '">' +
        '<div style="display:flex;gap:8px;margin-bottom:10px;">' +
          '<input id="cmd-nom" type="text" placeholder="Votre nom" style="flex:1;min-width:0;padding:10px 12px;border-radius:9px;border:1px solid var(--line,#ddd);font-family:\'Work Sans\',sans-serif;font-size:13px;box-sizing:border-box;">' +
          '<input id="cmd-tel" type="tel" placeholder="Téléphone" style="flex:1;min-width:0;padding:10px 12px;border-radius:9px;border:1px solid var(--line,#ddd);font-family:\'Work Sans\',sans-serif;font-size:13px;box-sizing:border-box;">' +
        '</div>' +
        '<input id="cmd-email" type="email" placeholder="Email (optionnel)" style="width:100%;padding:10px 12px;border-radius:9px;border:1px solid var(--line,#ddd);font-family:\'Work Sans\',sans-serif;font-size:13px;box-sizing:border-box;margin-bottom:10px;">' +
        '<div style="display:flex;gap:8px;margin-bottom:10px;">' +
          '<div style="flex:1;min-width:0;"><label style="font-size:11.5px;color:var(--mu2,#777);display:block;margin-bottom:4px;">Quantité</label><input id="cmd-qte" type="number" min="1" value="1" style="width:100%;padding:10px 12px;border-radius:9px;border:1px solid var(--line,#ddd);font-family:\'Work Sans\',sans-serif;font-size:13px;box-sizing:border-box;"></div>' +
          '<div style="flex:1;min-width:0;"><label style="font-size:11.5px;color:var(--mu2,#777);display:block;margin-bottom:4px;">Date souhaitée</label><input id="cmd-date" type="date" style="width:100%;padding:10px 12px;border-radius:9px;border:1px solid var(--line,#ddd);font-family:\'Work Sans\',sans-serif;font-size:13px;box-sizing:border-box;"></div>' +
        '</div>' +
        '<div style="display:flex;gap:14px;margin-bottom:10px;">' +
          '<label style="display:flex;align-items:center;gap:5px;font-size:13px;cursor:pointer;"><input type="radio" name="cmd-mode" value="retrait" checked onchange="document.getElementById(\'cmd-livraison-wrap\').style.display=\'none\';">🏠 Retrait sur place</label>' +
          '<label style="display:flex;align-items:center;gap:5px;font-size:13px;cursor:pointer;"><input type="radio" name="cmd-mode" value="livraison" onchange="document.getElementById(\'cmd-livraison-wrap\').style.display=\'block\';">🚚 Livraison</label>' +
        '</div>' +
        '<div id="cmd-livraison-wrap" style="display:none;margin-bottom:10px;">' +
          '<input id="cmd-adresse" type="text" placeholder="Adresse de livraison" style="width:100%;padding:10px 12px;border-radius:9px;border:1px solid var(--line,#ddd);font-family:\'Work Sans\',sans-serif;font-size:13px;box-sizing:border-box;margin-bottom:8px;">' +
          '<div style="display:flex;gap:8px;">' +
            '<input id="cmd-cp" type="text" placeholder="Code postal" style="flex:1;min-width:0;padding:10px 12px;border-radius:9px;border:1px solid var(--line,#ddd);font-family:\'Work Sans\',sans-serif;font-size:13px;box-sizing:border-box;">' +
            '<input id="cmd-commune" type="text" placeholder="Commune" style="flex:1;min-width:0;padding:10px 12px;border-radius:9px;border:1px solid var(--line,#ddd);font-family:\'Work Sans\',sans-serif;font-size:13px;box-sizing:border-box;">' +
          '</div>' +
        '</div>' +
        '<textarea id="cmd-notes" rows="2" placeholder="Précisions (optionnel)" style="width:100%;padding:10px 12px;border-radius:9px;border:1px solid var(--line,#ddd);font-family:\'Work Sans\',sans-serif;font-size:13px;box-sizing:border-box;resize:vertical;margin-bottom:10px;"></textarea>' +
        '<div id="cmd-err" style="display:none;color:var(--danger,#dc2626);font-size:12px;margin-bottom:10px;"></div>' +
        '<div style="display:flex;gap:8px;">' +
          '<button id="btn-cmd-envoyer" onclick="envoyerCommande()" style="flex:1;padding:11px;border-radius:9px;border:none;background:#16a34a;color:#fff;font-size:13px;font-weight:700;cursor:pointer;">Envoyer la commande</button>' +
          '<button onclick="fermerModalCommande()" style="flex:1;padding:11px;border-radius:9px;border:1px solid var(--line,#ddd);background:transparent;color:var(--mu2,#777);cursor:pointer;">Annuler</button>' +
        '</div>' +
      '</div>' +
    '</div>';
}

function fermerModalCommande() { var div = document.getElementById('modal-commande'); if (div) div.innerHTML = ''; }

async function afficherEtapePaiement(commandeId) {
  var conteneur = document.getElementById('modal-commande');
  conteneur.innerHTML =
    '<div style="position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:10002;display:flex;align-items:center;justify-content:center;padding:12px;">' +
      '<div style="background:var(--panel,#fff);border-radius:14px;padding:24px;max-width:420px;width:100%;">' +
        '<div style="font-size:15px;font-weight:700;margin-bottom:4px;">✅ Commande enregistrée</div>' +
        '<div style="font-size:12.5px;color:var(--mu2,#777);margin-bottom:16px;">Réglez maintenant par carte pour la confirmer.</div>' +
        '<div id="paiement-element" style="margin-bottom:14px;"></div>' +
        '<div id="paiement-err" style="display:none;color:var(--danger,#dc2626);font-size:12px;margin-bottom:10px;"></div>' +
        '<button id="btn-payer" onclick="confirmerPaiementCommande()" style="width:100%;padding:12px;border-radius:9px;border:none;background:#16a34a;color:#fff;font-size:14px;font-weight:700;cursor:pointer;">Chargement…</button>' +
        '<button onclick="fermerModalCommande()" style="width:100%;padding:10px;margin-top:8px;border-radius:9px;border:1px solid var(--line,#ddd);background:transparent;color:var(--mu2,#777);cursor:pointer;font-size:13px;">Payer plus tard directement avec l\'artisan</button>' +
      '</div>' +
    '</div>';

  try {
    var res = await fetch(SUPABASE_URL + '/functions/v1/creer-paiement-commande', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commande_id: commandeId }),
    });
    var data = await res.json();
    if (data.error) throw new Error(data.error);

    if (!_stripeClient) _stripeClient = Stripe(STRIPE_PUBLIC_KEY);
    _stripeElements = _stripeClient.elements({ clientSecret: data.client_secret });
    var paymentElement = _stripeElements.create('payment');
    paymentElement.mount('#paiement-element');

    var btn = document.getElementById('btn-payer');
    btn.textContent = 'Payer';
    btn.disabled = false;
  } catch (e) {
    document.getElementById('paiement-err').textContent = 'Erreur : ' + e.message;
    document.getElementById('paiement-err').style.display = 'block';
    var btn2 = document.getElementById('btn-payer');
    if (btn2) btn2.style.display = 'none';
  }
}

async function confirmerPaiementCommande() {
  var btn = document.getElementById('btn-payer');
  var err = document.getElementById('paiement-err');
  err.style.display = 'none';
  btn.disabled = true; btn.textContent = 'Paiement en cours…';

  var { error, paymentIntent } = await _stripeClient.confirmPayment({
    elements: _stripeElements,
    redirect: 'if_required',
  });

  if (error) {
    err.textContent = error.message || 'Le paiement a échoué.';
    err.style.display = 'block';
    btn.disabled = false; btn.textContent = 'Payer';
    return;
  }

  document.getElementById('modal-commande').innerHTML =
    '<style>@media(max-width:640px){.cf-box{border-radius:28px !important;padding:34px 24px 26px !important;max-width:none !important;margin:0 6px;}.cf-ico{font-size:72px !important;margin-bottom:14px !important;}.cf-t{font-size:24px !important;font-weight:800 !important;line-height:1.25;margin-bottom:12px !important;}.cf-s{font-size:16px !important;font-weight:600 !important;line-height:1.45 !important;color:#6b7c96 !important;}.cf-btn{width:100% !important;padding:15px !important;font-size:17px !important;border-radius:99px !important;}}</style>' +'<div style="position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:10002;display:flex;align-items:center;justify-content:center;padding:12px;">' +
      '<div class="cf-box" style="background:var(--panel,#fff);border-radius:14px;padding:28px;max-width:380px;width:100%;text-align:center;">' +
        '<div class="cf-ico" style="font-size:32px;margin-bottom:10px;">✅</div>' +
        '<div class="cf-t" style="font-size:15px;font-weight:700;margin-bottom:8px;">Paiement confirmé !</div>' +
        '<div class="cf-s" style="font-size:13px;color:var(--mu2,#777);margin-bottom:16px;">Votre commande est réglée, l\'artisan va la préparer.</div>' +
        '<button class="cf-btn" onclick="fermerModalCommande()" style="padding:10px 20px;border-radius:9px;border:none;background:var(--ac,#1266E3);color:#fff;font-weight:700;cursor:pointer;">Fermer</button>' +
      '</div>' +
    '</div>';
}

async function envoyerCommande() {
  var err = document.getElementById('cmd-err');
  err.style.display = 'none';
  var nom = document.getElementById('cmd-nom').value.trim();
  var tel = document.getElementById('cmd-tel').value.trim();
  var mode = document.querySelector('input[name="cmd-mode"]:checked').value;
  var adresse = document.getElementById('cmd-adresse').value.trim();

  if (!nom || !tel) { err.textContent = 'Votre nom et votre téléphone sont obligatoires.'; err.style.display = 'block'; return; }
  if (mode === 'livraison' && !adresse) { err.textContent = 'L\'adresse de livraison est obligatoire.'; err.style.display = 'block'; return; }

  var btn = document.getElementById('btn-cmd-envoyer');
  btn.disabled = true; btn.textContent = 'Envoi…';
  try {
    var res = await fetch(SUPABASE_URL + '/functions/v1/soumettre-commande', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        catalogue_id: document.getElementById('cmd-catalogue-id').value,
        quantite: document.getElementById('cmd-qte').value,
        client_nom: nom,
        client_telephone: tel,
        client_email: document.getElementById('cmd-email').value.trim() || null,
        mode: mode,
        adresse_livraison: mode === 'livraison' ? adresse : null,
        code_postal_livraison: mode === 'livraison' ? document.getElementById('cmd-cp').value.trim() : null,
        commune_livraison: mode === 'livraison' ? document.getElementById('cmd-commune').value.trim() : null,
        date_souhaitee: document.getElementById('cmd-date').value || null,
        notes: document.getElementById('cmd-notes').value.trim() || null,
      }),
    });
    var data = await res.json();
    if (data.error) throw new Error(data.error);

    var paiementActif = document.getElementById('cmd-paiement-actif').value === '1';
    if (paiementActif) {
      await afficherEtapePaiement(data.commande_id);
      return;
    }

    document.getElementById('modal-commande').innerHTML =
      '<style>@media(max-width:640px){.cf-box{border-radius:28px !important;padding:34px 24px 26px !important;max-width:none !important;margin:0 6px;}.cf-ico{font-size:72px !important;margin-bottom:14px !important;}.cf-t{font-size:24px !important;font-weight:800 !important;line-height:1.25;margin-bottom:12px !important;}.cf-s{font-size:16px !important;font-weight:600 !important;line-height:1.45 !important;color:#6b7c96 !important;}.cf-btn{width:100% !important;padding:15px !important;font-size:17px !important;border-radius:99px !important;}}</style>' +'<div style="position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:10002;display:flex;align-items:center;justify-content:center;padding:12px;">' +
        '<div class="cf-box" style="background:var(--panel,#fff);border-radius:14px;padding:28px;max-width:380px;width:100%;text-align:center;">' +
          '<div class="cf-ico" style="font-size:32px;margin-bottom:10px;">✅</div>' +
          '<div class="cf-t" style="font-size:15px;font-weight:700;margin-bottom:8px;">Commande envoyée !</div>' +
          '<div class="cf-s" style="font-size:13px;color:var(--mu2,#777);margin-bottom:16px;">L\'artisan va la confirmer directement avec vous.</div>' +
          '<button class="cf-btn" onclick="fermerModalCommande()" style="padding:10px 20px;border-radius:9px;border:none;background:var(--ac,#1266E3);color:#fff;font-weight:700;cursor:pointer;">Fermer</button>' +
        '</div>' +
      '</div>';
  } catch (e) {
    err.textContent = 'Erreur : ' + e.message;
    err.style.display = 'block';
    btn.disabled = false; btn.textContent = 'Envoyer la commande';
  }
}

// ── Demande générale (hors fiche) — devenue « Publier un projet » (30/10/2026) ──
// Elle exige un compte client : le formulaire vit dans la page du compte (compte.html), qui demande la connexion si besoin, puis
// ouvre directement le formulaire en 3 étapes. Le téléphone et l'email du client ne sont jamais montrés aux artisans.
function ouvrirModalDevisGeneral() {
  location.href = '/artisans/compte.html?projet=nouveau';
}

async function envoyerDemandeDevis(artisanId, secteurArtisan) {
  var nom = document.getElementById('devis-nom').value.trim();
  var tel = document.getElementById('devis-tel').value.trim();
  var email = document.getElementById('devis-email').value.trim();
  var commune = document.getElementById('devis-commune').value.trim();
  var message = document.getElementById('devis-message').value.trim();
  var err = document.getElementById('devis-err');
  var btn = document.getElementById('btn-devis');

  if (_typeInterventionChoisi === 'visite') { commencerVisiteDepuisDevis(artisanId); return; } // un rendez-vous sur place a besoin d'un créneau
  if (!_typeInterventionChoisi) { err.textContent = T('err_type_requis'); err.style.display = 'block'; return; }

  if (!nom || !tel || !commune || !message) {
    err.textContent = T('err_champs'); err.style.display = 'block'; return;
  }
  if (_devisContactPref === 'email' && !email) {
    err.textContent = T('err_email_requis'); err.style.display = 'block'; return;
  }
  btn.disabled = true; btn.textContent = T('btn_envoi_cours');

  try {
    var res = await fetch(SUPABASE_URL + '/functions/v1/soumettre-demande-devis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + SUPABASE_ANON },
      body: JSON.stringify({
        client_nom: nom, client_telephone: tel, client_email: email || null, contact_prefere: _devisContactPref,
        commune: commune, description_besoin: message, secteur: secteurArtisan || 'autre', photos: _devisPhotos,
        artisan_id: artisanId, type_intervention: _typeInterventionChoisi,
      }),
    });
    var data = await res.json();
    if (data.error) throw new Error(data.error);

    fermerModalDevis();
    fermerProfil({ target:null, currentTarget:null });
    showToast(T('toast_envoye'));
  } catch(e) {
    err.textContent = e.message; err.style.display = 'block';
    btn.disabled = false; btn.textContent = T('btn_envoyer');
  }
}

// ════════════════════════════════════════
//  MODALS LÉGALES
// ⚠️ Ajouté le 15/09 — les liens du footer appelaient openLegal(),
// jamais définie nulle part : liens cassés depuis le début. Corrigé en
// alignant sur le vrai nom utilisé par CaraLink Formation
// (ouvrirModalLegal), avec du contenu propre à Artisans.
// ════════════════════════════════════════
var LEGAL_VERSION_ARTISANS = '14 octobre 2026';
var LEGAL_CONTENT_ARTISANS = {
  mentions: {
    fr: { titre: 'Mentions légales', contenu:
      '<h3>Éditeur du site</h3><p>Le site <strong>CaraLink Artisans</strong> est édité par LearnLogic Studio (SIRET 832 640 858 000 29), entreprise individuelle, 971 Guadeloupe, France. Directeur de la publication : le représentant légal de LearnLogic Studio.</p>' +
      '<h3>Contact</h3><p><a href="mailto:contact@learnlogicstudio.com">contact@learnlogicstudio.com</a></p>' +
      '<h3>Hébergement et prestataires techniques</h3><p>Le site est hébergé par Vercel Inc. La base de données et les fichiers sont hébergés par Supabase Inc. Les paiements en ligne sont assurés par Stripe. Les emails sont envoyés par Resend.</p>' +
      '<h3>Propriété intellectuelle</h3><p>Les textes, logos, images et le code du site appartiennent à LearnLogic Studio ou à leurs auteurs. Toute reproduction sans autorisation est interdite. Les photos et descriptions publiées par un artisan restent sa propriété.</p>' },
    en: { titre: 'Legal notice', contenu:
      '<h3>Publisher</h3><p>The <strong>CaraLink Artisans</strong> website is published by LearnLogic Studio (SIRET 832 640 858 000 29), sole proprietorship, 971 Guadeloupe, France. Publication director: the legal representative of LearnLogic Studio.</p>' +
      '<h3>Contact</h3><p><a href="mailto:contact@learnlogicstudio.com">contact@learnlogicstudio.com</a></p>' +
      '<h3>Hosting and technical providers</h3><p>The site is hosted by Vercel Inc. The database and files are hosted by Supabase Inc. Online payments are handled by Stripe. Emails are sent by Resend.</p>' +
      '<h3>Intellectual property</h3><p>The texts, logos, images and code of the site belong to LearnLogic Studio or their authors. Any reproduction without permission is prohibited. Photos and descriptions published by a craftsman remain his or her property.</p>' },
    es: { titre: 'Aviso legal', contenu:
      '<h3>Editor</h3><p>El sitio <strong>CaraLink Artisans</strong> está editado por LearnLogic Studio (SIRET 832 640 858 000 29), empresa individual, 971 Guadalupe, Francia. Director de la publicación: el representante legal de LearnLogic Studio.</p>' +
      '<h3>Contacto</h3><p><a href="mailto:contact@learnlogicstudio.com">contact@learnlogicstudio.com</a></p>' +
      '<h3>Alojamiento y proveedores técnicos</h3><p>El sitio está alojado por Vercel Inc. La base de datos y los archivos están alojados por Supabase Inc. Los pagos en línea los gestiona Stripe. Los correos los envía Resend.</p>' +
      '<h3>Propiedad intelectual</h3><p>Los textos, logotipos, imágenes y el código del sitio pertenecen a LearnLogic Studio o a sus autores. Queda prohibida toda reproducción sin autorización. Las fotos y descripciones publicadas por un artesano siguen siendo de su propiedad.</p>' },
  },
  cgu: {
    fr: { titre: 'Conditions générales d\'utilisation', contenu:
      '<p><em>Version du 26 novembre 2026.</em> Les présentes conditions définissent l\'accès et l\'utilisation de CaraLink Artisans, l\'annuaire de mise en relation entre clients et artisans, édité par LearnLogic Studio (SIRET 832 640 858 000 29). En utilisant le site, vous les acceptez.</p>' +
      '<h3>Rôle de la plateforme</h3><p>CaraLink Artisans met en relation des clients et des artisans. Le contrat de prestation est conclu entre le client et l\'artisan : la plateforme n\'en est pas partie, ne fixe pas les prix, ne réalise pas les travaux et ne garantit pas la qualité des prestations.</p>' +
      '<h2 style="font-size:15px;margin:22px 0 4px;">Pour les clients</h2>' +
      '<h3>Ce qui est gratuit</h3><p>Consulter l\'annuaire, rechercher un artisan et demander un renseignement ou un devis sont gratuits. Le prix des travaux est fixé par l\'artisan, dans son devis.</p>' +
      '<h3>Frais de déplacement ou de réservation</h3><p>Certains artisans demandent, pour réserver une visite ou un créneau, des frais de déplacement ou de réservation, payés en ligne avant que l\'artisan voie votre demande. Le montant et les conditions d\'annulation sont affichés avant tout paiement, et vous les acceptez en cochant deux cases. Le paiement se fait par carte via Stripe, directement à l\'artisan. CaraLink n\'a pas accès à votre numéro de carte.</p>' +
      '<h3>Annulation et remboursement</h3><p>L\'artisan fixe un délai d\'annulation gratuite (par exemple 24 h avant le rendez-vous). Si vous annulez avant que l\'artisan ait confirmé, ou dans ce délai, vous êtes remboursé intégralement. Passé ce délai, les frais restent acquis à l\'artisan. Si l\'artisan refuse, annule, ne peut pas honorer le rendez-vous ou ne répond pas dans les 48 heures, vous êtes remboursé intégralement et automatiquement, sur la carte utilisée (le remboursement apparaît en quelques jours). Pour annuler, utilisez le lien reçu par email : conservez-le.</p>' +
      '<h3>Droit de rétractation</h3><p>Vous disposez en principe de 14 jours pour vous rétracter d\'un contrat conclu à distance. Si vous demandez que la prestation commence avant la fin de ce délai (case à cocher avant le paiement), vous ne pouvez plus vous rétracter une fois la prestation pleinement exécutée ; si vous vous rétractez avant, vous payez un montant proportionnel à ce qui a été fourni.</p>' +
      '<h2 style="font-size:15px;margin:22px 0 4px;">Pour les artisans</h2>' +
      '<h3>Notre partenariat</h3><p>CaraLink n\'est pas un annuaire en libre-service : c\'est un partenariat. Nous vous apportons de la visibilité et des clients ; en échange, vous jouez le jeu. Vous honorez vos rendez-vous, vous tenez vos interventions à jour (en cours, terminée, ou annulée avec son motif) et, pour les clients venus de CaraLink, vous privilégiez le paiement par CaraLink, plus sûr pour vous comme pour eux, avec une facture automatique. Pour que tout reste équitable, CaraLink peut demander au client comment la prestation et le paiement se sont passés. Si quelque chose ne va pas, vous êtes d\'abord prévenu et vous pouvez vous expliquer ; en cas de manquements répétés, la visibilité de votre fiche peut être réduite, puis suspendue, jusqu\'à régularisation.</p>' +
      '<h3>Votre fiche</h3><p>Vous garantissez l\'exactitude de vos informations (identité, SIRET, zone d\'intervention, tarifs) et la validité de vos assurances (responsabilité civile professionnelle, décennale si votre métier l\'exige). Vous vous engagez à honorer les rendez-vous que vous confirmez.</p>' +
      '<h3>Offres</h3><p>L\'offre Essentiel est gratuite. L\'offre Pro coûte 24,99 € par mois, avec 30 jours d\'essai gratuit, et se résilie à tout moment depuis votre espace.</p>' +
      '<h3>Carte bancaire puis paiement en ligne obligatoires</h3><p>Pour être réservable, un artisan doit (1) avoir enregistré une carte bancaire, qui sert uniquement au prélèvement de la commission décrite ci-dessous, puis (2) avoir activé les paiements en ligne (compte Stripe). Sans l\'une des deux, la fiche reste visible dans l\'annuaire mais grisée, et ne peut pas être réservée. Les artisans inscrits avant le 26 novembre 2026 disposent de 14 jours pour enregistrer leur carte. Les paiements des clients vont directement sur votre compte Stripe.</p>' +
      '<h3>Commission et frais</h3><p>CaraLink prélève une commission de 7 % (5 % pour les artisans en offre Pro) uniquement sur la part des prestations qui dépasse 200 € par mois (et non sur les 200 premiers euros), qu\'elles soient payées en ligne ou directement à vous (espèces, virement, chèque), pour les clients venus par CaraLink : annuaire, lien de fiche partagé, QR code, recommandation d\'un autre client. Cette règle s\'applique sans limite de durée à ces clients, même s\'ils reviennent plus tard. Les clients que vous ajoutez vous-même à la main dans MPA Artisans ne sont pas commissionnés. Les frais de paiement de Stripe sont à votre charge. Pour la boutique, une retenue de 1,9 % + 0,25 € par commande s\'ajoute à la commission. La commission est retenue au paiement ou prélevée une fois par mois sur la carte que vous avez enregistrée. La carte bancaire enregistrée n\'est débitée qu\'à partir du premier euro au-delà de 200 € par mois (gratuit pour commencer, afin de soutenir les petits créateurs). La commission sert uniquement au fonctionnement du site et au paiement de ses charges. Si une commission reste impayée, CaraLink peut suspendre la possibilité de planifier de nouvelles interventions pour des clients venus de CaraLink, jusqu\'à régularisation. Les réservations déjà payées par des clients ne sont pas affectées.</p>' +
      '<h3>Remboursements</h3><p>Quand un client est remboursé, la commission correspondante vous est rendue. Les frais de Stripe, que Stripe ne restitue pas, restent à votre charge.</p>' +
      '<h3>Mise à jour des interventions</h3><p>La commission est calculée sur les interventions que vous passez en « Terminée » ou « Payée ». Merci de le faire au plus tard dans les 7 jours suivant la prestation. Une intervention terminée mais volontairement non déclarée est considérée comme un contournement : CaraLink peut vous demander des explications, puis réduire ou suspendre la visibilité de votre fiche, et réclamer la commission correspondante.</p>' +
      '<h3>Interdiction de contournement</h3><p>Vous vous interdisez d\'utiliser CaraLink uniquement pour obtenir des contacts puis d\'encaisser hors plateforme afin d\'éviter la commission.</p>' +
      '<h3>Suspension et suppression</h3><p>En cas de manquement à ces conditions, CaraLink peut, après vous avoir prévenu, réduire la visibilité de votre fiche, suspendre ou supprimer un compte. Vous pouvez supprimer votre compte depuis MPA Artisans, sauf si une commission est due ou si une commande payée n\'est pas livrée.</p>' +
      '<h2 style="font-size:15px;margin:22px 0 4px;">Pour tous</h2>' +
      '<h3>Avis</h3><p>Les avis sont laissés par des clients qui ont été en relation avec l\'artisan via CaraLink, grâce à un lien personnel. Ils ne sont pas rémunérés. L\'artisan peut y répondre. Pour signaler un avis manifestement abusif, écrivez à contact@learnlogicstudio.com.</p>' +
      '<h3>Vérification des artisans</h3><p>Le SIRET est vérifié automatiquement auprès du registre officiel des entreprises ; cela prouve l\'existence de l\'entreprise, pas la qualité de son travail. Les documents d\'assurance sont examinés manuellement, mais leur validité continue reste de la responsabilité de l\'artisan.</p>' +
      '<h3>Responsabilité</h3><p>CaraLink Artisans ne peut être tenu responsable des dommages liés à une prestation réalisée par un artisan, ni d\'une indisponibilité temporaire du site.</p>' +
      '<h3>Droit applicable et réclamations</h3><p>Ces conditions sont régies par le droit français. Pour toute réclamation, écrivez à contact@learnlogicstudio.com. Les consommateurs peuvent recourir gratuitement à un médiateur de la consommation : ses coordonnées vous sont communiquées sur demande.</p>' },
    en: { titre: 'Terms of Service', contenu:
      '<p><em>Version of 26 November 2026.</em> These terms define access to and use of CaraLink Artisans, the directory connecting clients and craftsmen, published by LearnLogic Studio (SIRET 832 640 858 000 29). By using the site you accept them.</p>' +
      '<h3>Role of the platform</h3><p>CaraLink Artisans connects clients and craftsmen. The service contract is made between the client and the craftsman: the platform is not a party to it, does not set prices, does not perform the work and does not guarantee the quality of the services.</p>' +
      '<h2 style="font-size:15px;margin:22px 0 4px;">For clients</h2>' +
      '<h3>What is free</h3><p>Browsing the directory, searching for a craftsman and asking for information or a quote are free. The price of the work is set by the craftsman in his or her quote.</p>' +
      '<h3>Call-out or booking fees</h3><p>Some craftsmen ask, to book a visit or a time slot, for call-out or booking fees, paid online before the craftsman sees your request. The amount and the cancellation conditions are shown before any payment, and you accept them by ticking two boxes. Payment is made by card through Stripe, directly to the craftsman. CaraLink has no access to your card number.</p>' +
      '<h3>Cancellation and refund</h3><p>The craftsman sets a free-cancellation period (for example 24 h before the appointment). If you cancel before the craftsman has confirmed, or within that period, you are fully refunded. After that period the fees remain with the craftsman. If the craftsman refuses, cancels, cannot honour the appointment or does not reply within 48 hours, you are fully and automatically refunded on the card used (the refund shows up within a few days). To cancel, use the link received by email: keep it.</p>' +
      '<h3>Right of withdrawal</h3><p>You normally have 14 days to withdraw from a distance contract. If you ask for the service to start before the end of that period (tick-box before payment), you can no longer withdraw once the service has been fully performed; if you withdraw earlier, you pay a proportionate amount for what was provided.</p>' +
      '<h2 style="font-size:15px;margin:22px 0 4px;">For craftsmen</h2>' +
      '<h3>Our partnership</h3><p>CaraLink is not a self-service directory: it is a partnership. We bring you visibility and clients; in return, you play fair. You honour your appointments, you keep your jobs up to date (in progress, completed, or cancelled with a reason) and, for clients who came through CaraLink, you favour payment through CaraLink, which is safer for you and for them, with an automatic invoice. To keep things fair, CaraLink may ask the client how the service and the payment went. If something is wrong, you are warned first and can explain yourself; in case of repeated breaches, the visibility of your profile may be reduced, then suspended, until the situation is put right.</p>' +
      '<h3>Your profile</h3><p>You guarantee that your information (identity, SIRET, service area, prices) is accurate and that your insurance is valid (professional liability, and ten-year cover if your trade requires it). You undertake to honour the appointments you confirm.</p>' +
      '<h3>Plans</h3><p>The Essential plan is free. The Pro plan costs €24.99 per month, with a 30-day free trial, and can be cancelled at any time from your account.</p>' +
      '<h3>Bank card, then online payments, required</h3><p>To be bookable, a craftsman must (1) have registered a bank card, used only to collect the commission described below, then (2) have activated online payments (Stripe account). Without either one, the profile stays visible in the directory but greyed out and cannot be booked. Craftsmen registered before 26 November 2026 have 14 days to register their card. Client payments go directly to your Stripe account.</p>' +
      '<h3>Commission and fees</h3><p>CaraLink takes a 7% commission (5% for craftsmen on the Pro plan) only on the part of services that exceeds €200 per month (not on the first €200), whether paid online or directly to you (cash, transfer, cheque), for clients who came through CaraLink: directory, shared profile link, QR code, recommendation by another client. This rule applies with no time limit to those clients, even if they come back later. Clients you add yourself by hand in MPA Artisans are not subject to commission. Stripe\'s payment fees are borne by you. For the shop, a 1.9% + €0.25 deduction per order is added to the commission. The commission is deducted at payment or charged once a month to the card you registered. The registered bank card is only charged from the first euro above €200 per month (free to begin, to support small creators). The commission is used only to run the site and pay its costs. If a commission remains unpaid, CaraLink may suspend the ability to schedule new interventions for clients who came through CaraLink until the situation is settled. Bookings already paid by clients are not affected.</p>' +
      '<h3>Refunds</h3><p>When a client is refunded, the matching commission is returned to you. Stripe\'s fees, which Stripe does not return, remain your responsibility.</p>' +
      '<h3>Keeping interventions up to date</h3><p>The commission is calculated on the interventions you mark as “Completed” or “Paid”. Please do so within 7 days of the service. A completed intervention deliberately left undeclared is considered circumvention: CaraLink may ask you for explanations, then reduce or suspend the visibility of your profile, and claim the corresponding commission.</p>' +
      '<h3>No circumvention</h3><p>You agree not to use CaraLink only to obtain contacts and then collect payment outside the platform in order to avoid the commission.</p>' +
      '<h3>Suspension and deletion</h3><p>In case of breach of these terms, CaraLink may, after warning you, reduce the visibility of your profile, suspend or delete an account. You can delete your account from MPA Artisans, unless a commission is due or a paid order has not been delivered.</p>' +
      '<h2 style="font-size:15px;margin:22px 0 4px;">For everyone</h2>' +
      '<h3>Reviews</h3><p>Reviews are left by clients who were in contact with the craftsman through CaraLink, using a personal link. They are not paid for. The craftsman may reply. To report a clearly abusive review, write to contact@learnlogicstudio.com.</p>' +
      '<h3>Craftsman verification</h3><p>The SIRET is checked automatically against the official business register; this proves the business exists, not the quality of its work. Insurance documents are manually reviewed, but their continued validity remains the craftsman\'s responsibility.</p>' +
      '<h3>Liability</h3><p>CaraLink Artisans cannot be held liable for damage related to a service performed by a craftsman, nor for temporary unavailability of the site.</p>' +
      '<h3>Governing law and complaints</h3><p>These terms are governed by French law. For any complaint, write to contact@learnlogicstudio.com. Consumers may use a consumer mediator free of charge: contact details are provided on request.</p>' },
    es: { titre: 'Condiciones generales de uso', contenu:
      '<p><em>Versión del 26 de noviembre de 2026.</em> Estas condiciones definen el acceso y el uso de CaraLink Artisans, el directorio que conecta clientes y artesanos, editado por LearnLogic Studio (SIRET 832 640 858 000 29). Al usar el sitio las aceptas.</p>' +
      '<h3>Papel de la plataforma</h3><p>CaraLink Artisans conecta clientes y artesanos. El contrato de servicio se celebra entre el cliente y el artesano: la plataforma no es parte, no fija los precios, no realiza los trabajos y no garantiza la calidad de los servicios.</p>' +
      '<h2 style="font-size:15px;margin:22px 0 4px;">Para los clientes</h2>' +
      '<h3>Qué es gratuito</h3><p>Consultar el directorio, buscar un artesano y pedir información o un presupuesto es gratuito. El precio de los trabajos lo fija el artesano en su presupuesto.</p>' +
      '<h3>Gastos de desplazamiento o de reserva</h3><p>Algunos artesanos piden, para reservar una visita o un hueco, gastos de desplazamiento o de reserva, pagados en línea antes de que el artesano vea tu solicitud. El importe y las condiciones de cancelación se muestran antes de pagar, y los aceptas marcando dos casillas. El pago se hace con tarjeta a través de Stripe, directamente al artesano. CaraLink no tiene acceso al número de tu tarjeta.</p>' +
      '<h3>Cancelación y reembolso</h3><p>El artesano fija un plazo de cancelación gratuita (por ejemplo 24 h antes de la cita). Si cancelas antes de que el artesano confirme, o dentro de ese plazo, se te reembolsa íntegramente. Pasado el plazo, los gastos quedan para el artesano. Si el artesano rechaza, cancela, no puede acudir o no responde en 48 horas, se te reembolsa íntegra y automáticamente en la tarjeta utilizada (el reembolso aparece en unos días). Para cancelar usa el enlace recibido por correo: guárdalo.</p>' +
      '<h3>Derecho de desistimiento</h3><p>En principio dispones de 14 días para desistir de un contrato a distancia. Si pides que el servicio comience antes del final de ese plazo (casilla antes del pago), ya no podrás desistir una vez el servicio esté plenamente ejecutado; si desistes antes, pagas un importe proporcional a lo prestado.</p>' +
      '<h2 style="font-size:15px;margin:22px 0 4px;">Para los artesanos</h2>' +
      '<h3>Nuestra asociación</h3><p>CaraLink no es un directorio de autoservicio: es una asociación. Te aportamos visibilidad y clientes; a cambio, juegas limpio. Cumples tus citas, mantienes tus trabajos al día (en curso, terminado o cancelado con su motivo) y, para los clientes llegados a través de CaraLink, prefieres el pago por CaraLink, más seguro para ti y para ellos, con factura automática. Para que todo sea justo, CaraLink puede preguntar al cliente cómo fueron el servicio y el pago. Si algo no va bien, se te avisa primero y puedes explicarte; en caso de incumplimientos repetidos, la visibilidad de tu ficha puede reducirse y luego suspenderse hasta que se regularice.</p>' +
      '<h3>Tu ficha</h3><p>Garantizas que tus datos (identidad, SIRET, zona de actuación, tarifas) son exactos y que tus seguros están vigentes (responsabilidad civil profesional y, si tu oficio lo exige, decenal). Te comprometes a cumplir las citas que confirmes.</p>' +
      '<h3>Planes</h3><p>El plan Esencial es gratuito. El plan Pro cuesta 24,99 € al mes, con 30 días de prueba gratuita, y se cancela en cualquier momento desde tu espacio.</p>' +
      '<h3>Tarjeta bancaria y luego pago en línea, obligatorios</h3><p>Para poder ser reservado, un artesano debe (1) haber registrado una tarjeta bancaria, que sirve únicamente para cobrar la comisión descrita más abajo, y después (2) haber activado los pagos en línea (cuenta Stripe). Sin una de las dos, la ficha sigue visible en el directorio pero atenuada, y no se puede reservar. Los artesanos registrados antes del 26 de noviembre de 2026 tienen 14 días para registrar su tarjeta. Los pagos de los clientes van directamente a tu cuenta Stripe.</p>' +
      '<h3>Comisión y gastos</h3><p>CaraLink cobra una comisión del 7 % (5 % para artesanos con el plan Pro) únicamente sobre la parte de los servicios que supera 200 € al mes (y no sobre los primeros 200 €), tanto si se pagan en línea como directamente a ti (efectivo, transferencia, cheque), por los clientes llegados a través de CaraLink: directorio, enlace de ficha compartido, código QR, recomendación de otro cliente. Esta regla se aplica sin límite de tiempo a esos clientes, aunque vuelvan más tarde. Los clientes que añades tú mismo a mano en MPA Artisans no generan comisión. Los gastos de pago de Stripe corren por tu cuenta. En la tienda se suma a la comisión una retención del 1,9 % + 0,25 € por pedido. La comisión se retiene en el pago o se cobra una vez al mes en la tarjeta que registraste. La tarjeta bancaria registrada solo se cobra a partir del primer euro por encima de 200 € al mes (gratis para empezar, para apoyar a los pequeños creadores). La comisión se usa únicamente para el funcionamiento del sitio y para pagar sus gastos. Si una comisión queda impagada, CaraLink puede suspender la posibilidad de planificar nuevas intervenciones para clientes llegados a través de CaraLink hasta su regularización. Las reservas ya pagadas por clientes no se ven afectadas.</p>' +
      '<h3>Reembolsos</h3><p>Cuando se reembolsa a un cliente, se te devuelve la comisión correspondiente. Los gastos de Stripe, que Stripe no devuelve, siguen a tu cargo.</p>' +
      '<h3>Actualización de las intervenciones</h3><p>La comisión se calcula sobre las intervenciones que marcas como «Terminada» o «Pagada». Por favor, hazlo como máximo 7 días después del servicio. Una intervención terminada pero no declarada de forma deliberada se considera una elusión: CaraLink puede pedirte explicaciones, luego reducir o suspender la visibilidad de tu ficha y reclamar la comisión correspondiente.</p>' +
      '<h3>Prohibición de elusión</h3><p>Te comprometes a no usar CaraLink solo para obtener contactos y cobrar después fuera de la plataforma para evitar la comisión.</p>' +
      '<h3>Suspensión y eliminación</h3><p>En caso de incumplimiento de estas condiciones, CaraLink puede, tras avisarte, reducir la visibilidad de tu ficha, suspender o eliminar una cuenta. Puedes eliminar tu cuenta desde MPA Artisans, salvo que se deba una comisión o haya un pedido pagado sin entregar.</p>' +
      '<h2 style="font-size:15px;margin:22px 0 4px;">Para todos</h2>' +
      '<h3>Opiniones</h3><p>Las opiniones las dejan clientes que estuvieron en contacto con el artesano a través de CaraLink, mediante un enlace personal. No son remuneradas. El artesano puede responder. Para señalar una opinión claramente abusiva, escribe a contact@learnlogicstudio.com.</p>' +
      '<h3>Verificación de artesanos</h3><p>El SIRET se verifica automáticamente en el registro oficial de empresas; eso prueba que la empresa existe, no la calidad de su trabajo. Los documentos de seguro se revisan manualmente, pero su validez continua sigue siendo responsabilidad del artesano.</p>' +
      '<h3>Responsabilidad</h3><p>CaraLink Artisans no puede ser considerado responsable de los daños relacionados con un servicio realizado por un artesano, ni de una indisponibilidad temporal del sitio.</p>' +
      '<h3>Derecho aplicable y reclamaciones</h3><p>Estas condiciones se rigen por el derecho francés. Para cualquier reclamación, escribe a contact@learnlogicstudio.com. Los consumidores pueden acudir gratuitamente a un mediador de consumo: sus datos se facilitan previa solicitud.</p>' },
  },
  privacy: {
    fr: { titre: 'Confidentialité', contenu:
      '<p><em>Version du ' + LEGAL_VERSION_ARTISANS + '.</em> Le responsable du traitement de vos données est LearnLogic Studio (SIRET 832 640 858 000 29), contact : <a href="mailto:contact@learnlogicstudio.com">contact@learnlogicstudio.com</a>.</p>' +
      '<h3>Les données que nous collectons</h3><p><strong>Clients :</strong> nom, téléphone, email (obligatoire pour une réservation payée), commune ou adresse d\'intervention, description du besoin, photos jointes, montant et date des paiements. Votre numéro de carte est géré par Stripe : nous n\'y avons pas accès.</p><p><strong>Artisans :</strong> identité, coordonnées, adresse, SIRET, documents d\'assurance, services, tarifs, photos, ainsi que les données de gestion saisies dans MPA Artisans (clients, interventions, factures).</p>' +
      '<h3>Pourquoi, et sur quelle base</h3><p>Pour mettre en relation clients et artisans, traiter les demandes, les réservations, les paiements et les remboursements, envoyer les emails liés à votre demande, gérer les comptes artisans, prélever la commission, prévenir la fraude et respecter nos obligations légales. Ces traitements reposent sur l\'exécution du service que vous demandez, nos obligations légales et notre intérêt légitime à sécuriser la plateforme.</p>' +
      '<h3>Qui y accède</h3><p>Votre téléphone et votre email ne sont jamais affichés publiquement. Ils sont transmis à l\'artisan concerné par votre demande, après paiement des frais de réservation ou lorsque l\'artisan prend la demande en charge. Nous ne vendons jamais vos données.</p><p>Nous faisons appel à des prestataires techniques : Vercel (hébergement du site), Supabase (base de données et fichiers), Stripe (paiements), Resend (emails), Cloudflare (protection anti-robot) et des services de cartographie (calcul de trajets à partir d\'adresses). Certains sont situés hors de l\'Union européenne ; les transferts sont encadrés par les garanties prévues par la réglementation.</p>' +
      '<h3>Confidentialité des photos de chantier</h3><p>Les photos transmises lors d\'une demande de devis ou d\'intervention sont stockées dans un espace privé. Elles sont strictement réservées à l\'évaluation technique de la prestation : seuls l\'artisan concerné et vous y avez accès, par des liens temporaires, et elles ne sont jamais rendues publiques.</p>' +
      '<h3>Durée de conservation</h3><p>Vos données sont conservées le temps nécessaire au service, puis supprimées ou anonymisées, sauf obligation légale de les garder (par exemple les justificatifs de paiement et de comptabilité). À la suppression d\'un compte artisan, les données sont effacées et une archive comptable minimale est conservée.</p>' +
      '<h3>Vos droits</h3><p>Vous pouvez demander l\'accès, la rectification, l\'effacement de vos données, vous opposer à un traitement, en demander la limitation ou la portabilité, en écrivant à <a href="mailto:contact@learnlogicstudio.com">contact@learnlogicstudio.com</a>. Vous pouvez aussi saisir la CNIL (cnil.fr).</p>' },
    en: { titre: 'Privacy', contenu:
      '<p><em>Version of 14 October 2026.</em> The controller of your data is LearnLogic Studio (SIRET 832 640 858 000 29), contact: <a href="mailto:contact@learnlogicstudio.com">contact@learnlogicstudio.com</a>.</p>' +
      '<h3>Data we collect</h3><p><strong>Clients:</strong> name, phone, email (required for a paid booking), town or service address, description of the need, attached photos, amount and date of payments. Your card number is handled by Stripe: we have no access to it.</p><p><strong>Craftsmen:</strong> identity, contact details, address, SIRET, insurance documents, services, prices, photos, and the management data entered in MPA Artisans (clients, jobs, invoices).</p>' +
      '<h3>Why, and on what basis</h3><p>To connect clients and craftsmen, process requests, bookings, payments and refunds, send emails related to your request, manage craftsman accounts, collect the commission, prevent fraud and meet our legal obligations. These processing operations rely on performing the service you request, our legal obligations and our legitimate interest in securing the platform.</p>' +
      '<h3>Who has access</h3><p>Your phone number and email are never shown publicly. They are passed to the craftsman concerned by your request, after payment of the booking fee or when the craftsman takes the request on. We never sell your data.</p><p>We use technical providers: Vercel (site hosting), Supabase (database and files), Stripe (payments), Resend (emails), Cloudflare (anti-bot protection) and mapping services (route calculation from addresses). Some are located outside the European Union; transfers are covered by the safeguards required by regulation.</p>' +
      '<h3>Confidentiality of job-site photos</h3><p>Photos sent with a quote or job request are stored in a private space. They are strictly reserved for the technical assessment of the job: only the craftsman concerned and you can access them, through temporary links, and they are never made public.</p>' +
      '<h3>Retention</h3><p>Your data is kept as long as needed for the service, then deleted or anonymised, unless the law requires keeping it (for example payment and accounting records). When a craftsman account is deleted, data is erased and a minimal accounting archive is kept.</p>' +
      '<h3>Your rights</h3><p>You may request access to, correction or erasure of your data, object to processing, or ask for restriction or portability, by writing to <a href="mailto:contact@learnlogicstudio.com">contact@learnlogicstudio.com</a>. You may also contact the French data protection authority (cnil.fr).</p>' },
    es: { titre: 'Privacidad', contenu:
      '<p><em>Versión del 14 de octubre de 2026.</em> El responsable del tratamiento de tus datos es LearnLogic Studio (SIRET 832 640 858 000 29), contacto: <a href="mailto:contact@learnlogicstudio.com">contact@learnlogicstudio.com</a>.</p>' +
      '<h3>Datos que recogemos</h3><p><strong>Clientes:</strong> nombre, teléfono, correo (obligatorio para una reserva de pago), localidad o dirección de intervención, descripción de la necesidad, fotos adjuntas, importe y fecha de los pagos. El número de tu tarjeta lo gestiona Stripe: no tenemos acceso.</p><p><strong>Artesanos:</strong> identidad, datos de contacto, dirección, SIRET, documentos de seguro, servicios, tarifas, fotos y los datos de gestión introducidos en MPA Artisans (clientes, intervenciones, facturas).</p>' +
      '<h3>Para qué y con qué base</h3><p>Para conectar clientes y artesanos, tramitar solicitudes, reservas, pagos y reembolsos, enviar los correos relacionados con tu solicitud, gestionar las cuentas de artesanos, cobrar la comisión, prevenir el fraude y cumplir nuestras obligaciones legales. Estos tratamientos se basan en la ejecución del servicio que solicitas, nuestras obligaciones legales y nuestro interés legítimo en proteger la plataforma.</p>' +
      '<h3>Quién accede</h3><p>Tu teléfono y tu correo nunca se muestran públicamente. Se transmiten al artesano afectado por tu solicitud, tras el pago de los gastos de reserva o cuando el artesano acepta la solicitud. Nunca vendemos tus datos.</p><p>Recurrimos a proveedores técnicos: Vercel (alojamiento del sitio), Supabase (base de datos y archivos), Stripe (pagos), Resend (correos), Cloudflare (protección antirrobots) y servicios de cartografía (cálculo de trayectos a partir de direcciones). Algunos están fuera de la Unión Europea; las transferencias están cubiertas por las garantías que exige la normativa.</p>' +
      '<h3>Confidencialidad de las fotos de obra</h3><p>Las fotos enviadas con una solicitud de presupuesto o de intervención se guardan en un espacio privado. Están estrictamente reservadas a la evaluación técnica del trabajo: solo el artesano afectado y tú tenéis acceso, mediante enlaces temporales, y nunca se hacen públicas.</p>' +
      '<h3>Conservación</h3><p>Tus datos se conservan el tiempo necesario para el servicio y después se eliminan o anonimizan, salvo obligación legal de conservarlos (por ejemplo justificantes de pago y contabilidad). Al eliminar una cuenta de artesano se borran los datos y se conserva un archivo contable mínimo.</p>' +
      '<h3>Tus derechos</h3><p>Puedes solicitar el acceso, la rectificación o la supresión de tus datos, oponerte a un tratamiento, pedir su limitación o portabilidad, escribiendo a <a href="mailto:contact@learnlogicstudio.com">contact@learnlogicstudio.com</a>. También puedes acudir a la autoridad francesa de protección de datos (cnil.fr).</p>' },
  },
  cookies: {
    fr: { titre: 'Cookies', contenu:
      '<p>Ce site utilise uniquement des cookies et un stockage techniques nécessaires à son fonctionnement : préférence de langue, session de connexion, protection anti-robot (Cloudflare) sur certains formulaires, et sécurité du paiement (Stripe) sur la page de paiement. Aucun cookie publicitaire ni de suivi à des fins commerciales.</p>' },
    en: { titre: 'Cookies', contenu:
      '<p>This site only uses technical cookies and storage necessary for its operation: language preference, login session, anti-bot protection (Cloudflare) on some forms, and payment security (Stripe) on the payment page. No advertising cookies and no tracking for commercial purposes.</p>' },
    es: { titre: 'Cookies', contenu:
      '<p>Este sitio solo utiliza cookies y almacenamiento técnicos necesarios para su funcionamiento: preferencia de idioma, sesión de conexión, protección antirrobots (Cloudflare) en algunos formularios y seguridad del pago (Stripe) en la página de pago. Sin cookies publicitarias ni seguimiento con fines comerciales.</p>' },
  },
};

// Lien direct vers un texte légal (ex. depuis la page d'inscription) : ?legal=cgu | privacy | mentions | cookies
document.addEventListener('DOMContentLoaded', function () {
  try {
    var l = new URLSearchParams(window.location.search).get('legal');
    if (l && LEGAL_CONTENT_ARTISANS[l]) ouvrirModalLegal(l);
  } catch (e) {}
});

function ouvrirModalLegal(type) {
  var existing = document.getElementById('modal-legal');
  if (existing) existing.remove();

  var content = (LEGAL_CONTENT_ARTISANS[type] && LEGAL_CONTENT_ARTISANS[type][AT_LANG]) || LEGAL_CONTENT_ARTISANS[type]['fr'];
  if (!content) return;

  var div = document.createElement('div');
  div.id = 'modal-legal';
  div.style.cssText = 'position:fixed;inset:0;z-index:10003;display:flex;align-items:flex-start;justify-content:center;padding:40px 20px;background:rgba(0,0,0,.6);backdrop-filter:blur(4px);overflow-y:auto;';
  div.innerHTML =
    '<div style="background:var(--panel,#fff);border:1px solid var(--brd,#e3eaf4);border-radius:16px;padding:32px;width:100%;max-width:680px;position:relative;">' +
      '<button onclick="document.getElementById(\'modal-legal\').remove()" style="position:absolute;top:16px;right:16px;background:rgba(0,0,0,.05);border:1px solid var(--brd,#e3eaf4);border-radius:6px;color:var(--mu2,#777);font-size:16px;width:30px;height:30px;cursor:pointer;line-height:1;">✕</button>' +
      '<h2 style="font-size:18px;font-weight:800;margin-bottom:20px;padding-right:40px;">' + content.titre + '</h2>' +
      '<div class="legal-content-artisans" style="font-size:13.5px;color:var(--mu2,#555);line-height:1.7;">' + content.contenu + '</div>' +
      '<div style="margin-top:24px;padding-top:16px;border-top:1px solid var(--brd,#e3eaf4);text-align:right;">' +
        '<button onclick="document.getElementById(\'modal-legal\').remove()" style="padding:9px 24px;border-radius:8px;border:none;background:var(--ac,#1266E3);color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:Outfit,sans-serif;">' + (AT_LANG==='en'?'Close':AT_LANG==='es'?'Cerrar':'Fermer') + '</button>' +
      '</div>' +
    '</div>';

  if (!document.getElementById('legal-styles-artisans')) {
    var style = document.createElement('style');
    style.id = 'legal-styles-artisans';
    style.textContent = '.legal-content-artisans h3{font-size:14px;font-weight:700;color:var(--ink,#13223c);margin:16px 0 6px;}.legal-content-artisans p{margin-bottom:10px;}.legal-content-artisans a{color:var(--ac,#1266E3);}';
    document.head.appendChild(style);
  }

  document.body.appendChild(div);
}

// ── Init ──
document.addEventListener('DOMContentLoaded', async function() {
  // Avant : tout attendait la liste des métiers. Maintenant elle part en même temps que le haut de page et les témoignages.
  var pSecteurs = chargerSecteurs();
  chargerTemoignagesArtisans();
  renderNav();
  atEntree([document.getElementById('nav')], 0);
  await pSecteurs;
  renderHero();
  atEntree(Array.prototype.slice.call((document.getElementById('hero') || {}).children || []), 0.12);
  renderResults();
  // Lien direct vers une fiche : https://caralink.app/artisans/?artisan=<identifiant> (ex. le bouton « Choisir un autre créneau »
  // de l'email de refus). L'identifiant vient de l'adresse : on n'accepte QUE la forme exacte d'un identifiant (rien d'autre n'est envoyé).
  var voulu = new URLSearchParams(location.search).get('artisan');
  if (voulu && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(voulu)) ouvrirProfil(voulu);
});

// ── Témoignages — même mécanisme que sur les autres landings LearnLogic ──
// Avis PRODUIT (utilisation de CaraLink Artisans/MPA Artisans), pas à confondre
// avec avis_carapro (avis client sur le travail d'un artisan précis).
(function() {
  var SUPABASE_URL_TEMOIN = 'https://coqprurgsvfxddbmwtor.supabase.co';
  var SUPABASE_ANON_TEMOIN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNvcXBydXJnc3ZmeGRkYm13dG9yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0OTg5OTcsImV4cCI6MjA5NDA3NDk5N30.v_8LietUpGkZVgyKgqojE2HoMIE7Y0GVO7fi9AWm4IY';
  var TYPE_ROLE_TEMOIN = { artisan: 'Artisan indépendant' };

  function escHtmlTemoin(s) {
    return (s||'').toString().replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; });
  }

  function carteTemoignage(t) {
    var initiale = (t.nom_affiche || 'U')[0].toUpperCase();
    return '<div class="t-card">' +
      '<div class="t-card-quote">« ' + escHtmlTemoin(t.texte) + ' »</div>' +
      '<div class="t-card-author">' +
        '<div class="t-card-avatar">' + escHtmlTemoin(initiale) + '</div>' +
        '<div><div class="t-card-name">' + escHtmlTemoin(t.nom_affiche) + '</div><div class="t-card-role">' + (TYPE_ROLE_TEMOIN[t.type] || 'Utilisateur') + '</div></div>' +
      '</div>' +
    '</div>';
  }

  function carteVide() {
    return '<div class="t-card">' +
      '<div class="t-card-quote">« Soyez le premier à partager votre expérience CaraLink Artisans. »</div>' +
    '</div>';
  }

  window.chargerTemoignagesArtisans = async function() {
    var track = document.getElementById('t-marquee-track');
    try {
      var res = await fetch(SUPABASE_URL_TEMOIN + '/functions/v1/lire-avis?type=artisan', {
        headers: { 'apikey': SUPABASE_ANON_TEMOIN, 'Authorization': 'Bearer ' + SUPABASE_ANON_TEMOIN }
      });
      var data = await res.json();
      if (data.error) throw new Error(data.error);
      var reels = data.avis || [];
      if (!track) return;
      if (!reels.length) { track.innerHTML = carteVide() + carteVide(); return; }
      track.innerHTML = reels.map(carteTemoignage).join('') + reels.map(carteTemoignage).join('');
    } catch(e) {
      console.warn('[Témoignages Artisans]', e.message);
      if (track) track.innerHTML = carteVide() + carteVide();
    }
  };
})();
