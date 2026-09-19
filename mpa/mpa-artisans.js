// ═══════════════════════════════════════════════════════════
// MPA Artisans — mpa-artisans.js
// Propriété : TOI Freddy
// Phase 1 : coquille + Fiche Artisan + Clients habituels + lecture
// des services (gérés depuis CaraLink Artisans, jamais dupliqués ici).
// ═══════════════════════════════════════════════════════════

const SUPABASE_URL  = 'https://uzgboxfxpxazhysusewv.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV6Z2JveGZ4cHhhemh5c3VzZXd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkyMzI4NzUsImV4cCI6MjEwNDgwODg3NX0.zHWjsI4jH26I41R3oe8wDL4GazTWspxUdjQCe-fW7eQ';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

var _session = null;
var _artisan = null;
var _clientsCache = [];
var _servicesCache = [];

function escHtml(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

async function doLogout() {
  await sb.auth.signOut();
  window.location.href = 'https://caralink.app/artisans/connexion.html';
}

function ouvrirModale(id) { document.getElementById(id).classList.add('show'); }
function fermerModale(id) { document.getElementById(id).classList.remove('show'); }

// ════════════════════════════════════════
//  MPA AI — bulle compagnon flottante
// ⚠️ Ajouté le 16/09 — même apparence et comportement que côté MPA
// Formation : bulle ✨ draggable, point de pulsation coloré selon
// l'urgence (cyan=info, orange=à surveiller, rouge=critique), remplace
// le toast générique pour ce qui mérite d'être "raconté" plutôt que
// juste confirmé. Déclencheurs adaptés au métier d'artisan (jamais
// une simple recopie des alertes Qualiopi/formateur, sans objet ici).
// ════════════════════════════════════════
var _mpaAiFeed = [];

function mpaAiDire(message, type, cta) {
  var icone = type === 'important' ? '🔴' : type === 'warning' ? '⚠️' : '✨';
  _mpaAiFeed.unshift({ message: message, icone: icone, type: type, time: new Date(), cta: cta });
  renderMpaAiFeed();

  var dot = document.getElementById('mpa-ai-dot');
  dot.classList.add('show');
  dot.className = 'mpa-ai-dot show' + (type === 'important' ? ' important' : type === 'warning' ? ' warning' : '');

  if (type === 'important') {
    document.getElementById('mpa-ai-panel').classList.add('open');
  }
}

function renderMpaAiFeed() {
  var zone = document.getElementById('mpa-ai-feed');
  if (!_mpaAiFeed.length) { zone.innerHTML = '<div class="mpa-ai-empty">Rien à signaler pour l\'instant 👋</div>'; return; }
  zone.innerHTML = _mpaAiFeed.map(function(m) {
    var heure = m.time.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' });
    return '<div class="mpa-ai-msg">' +
      '<span class="mpa-ai-msg-icone">' + m.icone + '</span>' + m.message +
      (m.cta ? '<br><button class="mpa-ai-msg-cta" onclick="' + m.cta.action + '">' + m.cta.label + '</button>' : '') +
      '<div class="mpa-ai-msg-time">' + heure + '</div>' +
    '</div>';
  }).join('');
}

function toggleMpaAi() {
  var panel = document.getElementById('mpa-ai-panel');
  panel.classList.toggle('open');
  if (panel.classList.contains('open')) {
    document.getElementById('mpa-ai-dot').classList.remove('show');
  }
}

// Rendre la bulle déplaçable — même comportement que côté Formation.
(function initMpaAiDrag() {
  document.addEventListener('DOMContentLoaded', function() {
    var fab = document.getElementById('mpa-ai-fab');
    if (!fab) return;
    var dragging = false, moved = false, offX, offY;

    fab.addEventListener('mousedown', function(e) {
      dragging = true; moved = false;
      offX = e.clientX - fab.getBoundingClientRect().left;
      offY = e.clientY - fab.getBoundingClientRect().top;
    });
    document.addEventListener('mousemove', function(e) {
      if (!dragging) return;
      moved = true;
      fab.style.left = (e.clientX - offX) + 'px';
      fab.style.top = (e.clientY - offY) + 'px';
      fab.style.right = 'auto'; fab.style.bottom = 'auto';
    });
    document.addEventListener('mouseup', function() {
      if (dragging && moved) {
        var r = fab.getBoundingClientRect();
        document.getElementById('mpa-ai-panel').style.bottom = (window.innerHeight - r.top + 12) + 'px';
        document.getElementById('mpa-ai-panel').style.right = (window.innerWidth - r.right) + 'px';
      }
      dragging = false;
    });
    fab.addEventListener('click', function(e) { if (moved) e.stopImmediatePropagation(); });
  });
})();

// ── Déclencheurs proactifs propres au métier d'artisan ──
async function verifierAlertesMpaAi() {
  // 1) Plafond micro-entreprise proche — critique dès 90%.
  var anneeAuj = new Date().getFullYear();
  var { data: interYear } = await sb.from('mpa_artisans_interventions')
    .select('prix, statut, date_intervention').eq('artisan_id', _artisan.id)
    .in('statut', ['terminee','payee']).gte('date_intervention', anneeAuj+'-01-01').lte('date_intervention', anneeAuj+'-12-31');
  var caBrut = (interYear||[]).reduce(function(s,i){ return s+(i.prix||0); }, 0);
  var pct = (caBrut / PLAFOND_MICRO_BIC_SERVICES) * 100;
  if (pct >= 90) {
    mpaAiDire('Vous êtes à ' + pct.toFixed(0) + '% du plafond micro-entreprise (' + caBrut.toFixed(0) + '€ / 77 700€). Au-delà, changement de régime fiscal obligatoire.', 'important',
      { label: 'Voir le tableau de bord', action: "switchTab(4)" });
  } else if (pct >= 70) {
    mpaAiDire('Vous avez atteint ' + pct.toFixed(0) + '% du plafond micro-entreprise cette année — à surveiller.', 'warning');
  }

  // 2) Factures émises depuis plus de 30 jours, jamais marquées payées.
  var seuil30j = new Date(); seuil30j.setDate(seuil30j.getDate() - 30);
  var { data: facturesAnciennes } = await sb.from('mpa_artisans_factures')
    .select('id, numero, date_facture, montant_total, client_id, mpa_artisans_clients(nom)')
    .eq('artisan_id', _artisan.id).lt('date_facture', seuil30j.toISOString().slice(0,10));
  if (facturesAnciennes && facturesAnciennes.length) {
    var { data: interFacturees } = await sb.from('mpa_artisans_interventions')
      .select('facture_id, statut').in('facture_id', facturesAnciennes.map(function(f){return f.id;}));
    var facturesImpayees = facturesAnciennes.filter(function(f) {
      return (interFacturees||[]).some(function(i) { return i.facture_id === f.id && i.statut !== 'payee'; });
    });
    if (facturesImpayees.length) {
      var f = facturesImpayees[0];
      var client = f.mpa_artisans_clients ? f.mpa_artisans_clients.nom : 'ce client';
      mpaAiDire('La facture ' + f.numero + ' (' + f.montant_total.toFixed(0) + '€, ' + escHtml(client) + ') a plus de 30 jours et n\'est pas encore marquée payée. Une petite relance ?', 'warning',
        { label: 'Voir la facturation', action: "switchTab(3)" });
    }
  }

  // 3) Nouvel utilisateur — aucun client ni service configuré.
  if (!_clientsCache.length && !_servicesCache.length) {
    mpaAiDire('Bienvenue sur MPA Artisans ! Commencez par ajouter un client habituel dans "Base de données", ou ajoutez vos services directement depuis votre espace CaraLink Artisans.', 'info');
  }
}

// ── Onglets principaux ──
function switchTab(i) {
  document.querySelectorAll('#nav .ntab').forEach(function(b, idx) { b.classList.toggle('active', idx === i); });
  document.querySelectorAll('#content > .pnl').forEach(function(p, idx) { p.classList.toggle('active', idx === i); });
}

// ── Sous-onglets Base de données ──
function switchBdd(i) {
  document.querySelectorAll('#bsnav .btab').forEach(function(b, idx) { b.classList.toggle('active', idx === i); });
  document.querySelectorAll('#p1 > .bpnl').forEach(function(p, idx) { p.classList.toggle('active', idx === i); });
}

// ════════════════════════════════════════
//  INIT
// ════════════════════════════════════════
async function init() {
  var { data: sessionData } = await sb.auth.getSession();
  if (!sessionData.session) { window.location.href = 'https://caralink.app/artisans/connexion.html'; return; }
  _session = sessionData.session;
  document.getElementById('uname').textContent = _session.user.email;

  var { data: artisan, error } = await sb.from('artisans').select('*').eq('user_id', _session.user.id).maybeSingle();
  if (error || !artisan) {
    alert('Aucun profil artisan trouvé pour ce compte. Créez d\'abord votre profil sur CaraLink Artisans.');
    window.location.href = 'https://caralink.app/artisans/inscription.html';
    return;
  }
  _artisan = artisan;

  renderFiche();
  await chargerClients();
  await chargerServices();
  await initPlanning();
  await chargerCompta();
  remplirSelectClientFacture();
  await chargerFactures();
  await initDashboard();
  renderMpaAiFeed();
  await verifierAlertesMpaAi();
}

// ════════════════════════════════════════
//  PLANNING — vue mensuelle, blocs Matin/Après-midi
//  Approche hybride décidée le 16/09 : affichage épuré par demi-
//  journée (jusqu'à 3-5 interventions/jour pour un artisan, contre
//  1-2 pour un formateur), avec heure précise en sous-couche pour le
//  futur Smart Dispatch IA.
// ════════════════════════════════════════
var _calAnnee, _calMois; // _calMois : 0-11
var _interventionsCache = [];
var _interventionEnCours = null;
var _serviceEnCours = null; // id de l'intervention ouverte dans la modale, ou null si création

const MOIS_NOMS = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
const JOURS_NOMS = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];

async function initPlanning() {
  var auj = new Date();
  _calAnnee = auj.getFullYear();
  _calMois = auj.getMonth();
  renderDows();
  await chargerInterventions();
}

function renderDows() {
  document.getElementById('cal-dows').innerHTML = JOURS_NOMS.map(function(j) {
    return '<div class="cal-dow">' + j + '</div>';
  }).join('');
}

function moisPrecedent() { _calMois--; if (_calMois < 0) { _calMois = 11; _calAnnee--; } chargerInterventions(); }
function moisSuivant() { _calMois++; if (_calMois > 11) { _calMois = 0; _calAnnee++; } chargerInterventions(); }
function allerAujourdhui() { var auj = new Date(); _calAnnee = auj.getFullYear(); _calMois = auj.getMonth(); chargerInterventions(); }

async function chargerInterventions() {
  document.getElementById('cal-titre').textContent = MOIS_NOMS[_calMois] + ' ' + _calAnnee;

  var debutMois = new Date(_calAnnee, _calMois, 1);
  var finMois = new Date(_calAnnee, _calMois + 1, 0);
  var debutStr = debutMois.toISOString().slice(0, 10);
  var finStr = finMois.toISOString().slice(0, 10);

  var { data, error } = await sb.from('mpa_artisans_interventions')
    .select('*, mpa_artisans_clients(nom), artisans_services(nom_service)')
    .eq('artisan_id', _artisan.id)
    .gte('date_intervention', debutStr)
    .lte('date_intervention', finStr);

  if (error) { console.error(error); _interventionsCache = []; }
  else { _interventionsCache = data || []; }

  renderCalendrier();
}

function renderCalendrier() {
  var premierJourSemaine = (new Date(_calAnnee, _calMois, 1).getDay() + 6) % 7; // lundi = 0
  var joursDansMois = new Date(_calAnnee, _calMois + 1, 0).getDate();
  var joursDansMoisPrecedent = new Date(_calAnnee, _calMois, 0).getDate();

  var cellules = [];
  for (var i = premierJourSemaine - 1; i >= 0; i--) {
    cellules.push({ jour: joursDansMoisPrecedent - i, autreMonth: true });
  }
  for (var j = 1; j <= joursDansMois; j++) {
    cellules.push({ jour: j, autreMonth: false });
  }
  while (cellules.length % 7 !== 0) {
    cellules.push({ jour: cellules.length - premierJourSemaine - joursDansMois + 1, autreMonth: true });
  }

  var aujDate = new Date();
  var aujStr = aujDate.toISOString().slice(0, 10);

  document.getElementById('cal-grid').innerHTML = cellules.map(function(c, idx) {
    var dateStr = c.autreMonth ? null : _calAnnee + '-' + String(_calMois+1).padStart(2,'0') + '-' + String(c.jour).padStart(2,'0');
    var estWeekend = idx % 7 >= 5;
    var estAuj = dateStr === aujStr;

    var classes = 'cal-day' + (c.autreMonth ? ' other-month' : '') + (estWeekend ? ' weekend' : '') + (estAuj ? ' today' : '');

    var interDuJour = dateStr ? _interventionsCache.filter(function(i) { return i.date_intervention === dateStr; }) : [];
    var interMatin = interDuJour.filter(function(i) { return i.creneau !== 'apres_midi'; });
    var interAM = interDuJour.filter(function(i) { return i.creneau === 'apres_midi'; });

    return '<div class="' + classes + '">' +
      '<div class="cal-day-num">' + c.jour + '</div>' +
      (c.autreMonth ? '' :
        '<div class="cal-halves">' +
          renderCreneauHtml('matin', dateStr, interMatin) +
          renderCreneauHtml('apres_midi', dateStr, interAM) +
        '</div>'
      ) +
    '</div>';
  }).join('');
}

function renderCreneauHtml(creneau, dateStr, liste) {
  var maxVisible = 2;
  var visibles = liste.slice(0, maxVisible);
  var reste = liste.length - maxVisible;

  var pills = visibles.map(function(i) {
    var client = i.mpa_artisans_clients ? i.mpa_artisans_clients.nom : '';
    var service = i.artisans_services ? i.artisans_services.nom_service : '(sans service)';
    var heure = i.heure_debut ? i.heure_debut.slice(0,5) : '';
    var statut = i.statut || 'planifiee';
    return '<div class="cal-pill st-' + statut + '" onclick="avancerStatut(\'' + i.id + '\',event)" title="Cliquer pour faire avancer le statut">' +
      '<span class="cal-pill-txt">' +
        (heure ? '<span class="cal-pill-heure">' + heure + '</span> ' : '') +
        escHtml(service) + (client ? ' — ' + escHtml(client) : '') +
      '</span>' +
      '<span class="cal-pill-edit" onclick="event.stopPropagation();ouvrirIntervention(\'' + i.id + '\')" title="Modifier les détails">✎</span>' +
    '</div>';
  }).join('');

  var plus = reste > 0 ? '<div class="cal-more" onclick="ouvrirJourDetail(\'' + dateStr + '\',\'' + creneau + '\')">+' + reste + ' autre' + (reste>1?'s':'') + '</div>' : '';

  return '<div class="cal-half cal-half-' + (creneau==='matin'?'matin':'am') + '">' +
    '<div class="cal-half-label">' + (creneau==='matin'?'Matin':'Aprem') + '</div>' +
    pills + plus +
    '<button class="cal-add-btn" onclick="ouvrirNouvelleIntervention(\'' + dateStr + '\',\'' + creneau + '\')">+</button>' +
  '</div>';
}

function ouvrirJourDetail(dateStr, creneau) {
  // Version simple pour l'instant : ouvre directement la création,
  // la vue "détail du jour" pourra venir plus tard si le besoin se confirme.
  ouvrirNouvelleIntervention(dateStr, creneau);
}

// ⚠️ Ajouté le 16/09 — décidé avec Freddy : un clic direct sur la
// vignette fait avancer le statut (Planifiée → Terminée → Payée →
// Planifiée), sans passer par la modale. Le crayon séparé reste pour
// modifier les détails (date de paiement précise, prix, etc).
var CYCLE_STATUT = { planifiee: 'terminee', terminee: 'payee', payee: 'planifiee' };

async function avancerStatut(id, ev) {
  if (ev) ev.stopPropagation();
  var i = _interventionsCache.find(function(x) { return x.id === id; });
  if (!i) return;
  var statutActuel = i.statut || 'planifiee';
  if (statutActuel === 'annulee') return; // une intervention annulée ne suit pas ce cycle

  var nouveauStatut = CYCLE_STATUT[statutActuel] || 'planifiee';
  var maj = { statut: nouveauStatut };
  maj.date_paiement = nouveauStatut === 'payee' ? new Date().toISOString().slice(0, 10) : null;

  var { error } = await sb.from('mpa_artisans_interventions').update(maj).eq('id', id).eq('artisan_id', _artisan.id);
  if (error) { alert('Erreur : ' + error.message); return; }

  await chargerInterventions();
  if (document.getElementById('p2').classList.contains('active')) await chargerCompta();
}

async function remplirSelectsIntervention() {
  var selClient = document.getElementById('mi-client');
  selClient.innerHTML = '<option value="">— Aucun —</option>' +
    _clientsCache.map(function(c) { return '<option value="' + c.id + '">' + escHtml(c.nom) + '</option>'; }).join('');

  var selService = document.getElementById('mi-service');
  selService.innerHTML = '<option value="">— Aucun —</option>' +
    _servicesCache.map(function(s) { return '<option value="' + s.id + '">' + escHtml(s.nom_service) + '</option>'; }).join('');
}

async function ouvrirNouvelleIntervention(dateStr, creneau) {
  await remplirSelectsIntervention();
  _interventionEnCours = null;
  document.getElementById('mi-titre').textContent = 'Nouvelle intervention';
  document.getElementById('mi-date').value = dateStr;
  document.getElementById('mi-creneau').value = creneau;
  document.getElementById('mi-heure-debut').value = creneau === 'matin' ? '08:00' : '14:00';
  document.getElementById('mi-heure-fin').value = creneau === 'matin' ? '10:00' : '16:00';
  document.getElementById('mi-client').value = '';
  document.getElementById('mi-service').value = '';
  document.getElementById('mi-prix').value = '';
  document.getElementById('mi-notes').value = '';
  document.getElementById('mi-statut').value = 'planifiee';
  document.getElementById('mi-date-paiement').value = '';
  document.getElementById('mi-date-paiement-wrap').style.display = 'none';
  document.getElementById('mi-delete-wrap').style.display = 'none';
  ouvrirModale('modal-intervention');
}

async function ouvrirIntervention(id) {
  await remplirSelectsIntervention();
  var i = _interventionsCache.find(function(x) { return x.id === id; });
  if (!i) return;
  _interventionEnCours = id;
  document.getElementById('mi-titre').textContent = 'Modifier l\'intervention';
  document.getElementById('mi-date').value = i.date_intervention;
  document.getElementById('mi-creneau').value = i.creneau || 'matin';
  document.getElementById('mi-heure-debut').value = i.heure_debut ? i.heure_debut.slice(0,5) : '';
  document.getElementById('mi-heure-fin').value = i.heure_fin ? i.heure_fin.slice(0,5) : '';
  document.getElementById('mi-client').value = i.client_id || '';
  document.getElementById('mi-service').value = i.service_id || '';
  document.getElementById('mi-prix').value = i.prix || '';
  document.getElementById('mi-notes').value = i.notes || '';
  document.getElementById('mi-statut').value = i.statut || 'planifiee';
  document.getElementById('mi-date-paiement').value = i.date_paiement || '';
  toggleDatePaiement();
  document.getElementById('mi-delete-wrap').style.display = 'block';
  ouvrirModale('modal-intervention');
}

function toggleDatePaiement() {
  var statut = document.getElementById('mi-statut').value;
  var wrap = document.getElementById('mi-date-paiement-wrap');
  wrap.style.display = statut === 'payee' ? 'block' : 'none';
  if (statut === 'payee' && !document.getElementById('mi-date-paiement').value) {
    document.getElementById('mi-date-paiement').value = new Date().toISOString().slice(0, 10);
  }
}

async function sauverIntervention() {
  var maj = {
    artisan_id: _artisan.id,
    date_intervention: document.getElementById('mi-date').value,
    creneau: document.getElementById('mi-creneau').value,
    heure_debut: document.getElementById('mi-heure-debut').value || null,
    heure_fin: document.getElementById('mi-heure-fin').value || null,
    client_id: document.getElementById('mi-client').value || null,
    service_id: document.getElementById('mi-service').value || null,
    prix: parseFloat(document.getElementById('mi-prix').value) || null,
    notes: document.getElementById('mi-notes').value.trim() || null,
    statut: document.getElementById('mi-statut').value,
    date_paiement: document.getElementById('mi-statut').value === 'payee' ? (document.getElementById('mi-date-paiement').value || null) : null,
  };
  if (!maj.date_intervention) { alert('La date est obligatoire.'); return; }

  var res;
  if (_interventionEnCours) {
    res = await sb.from('mpa_artisans_interventions').update(maj).eq('id', _interventionEnCours).eq('artisan_id', _artisan.id);
  } else {
    res = await sb.from('mpa_artisans_interventions').insert(maj);
  }
  if (res.error) { alert('Erreur : ' + res.error.message); return; }
  fermerModale('modal-intervention');
  await chargerInterventions();
}

async function supprimerIntervention() {
  if (!_interventionEnCours) return;
  if (!confirm('Supprimer cette intervention ?')) return;
  var { error } = await sb.from('mpa_artisans_interventions').delete().eq('id', _interventionEnCours).eq('artisan_id', _artisan.id);
  if (error) { alert('Erreur : ' + error.message); return; }
  fermerModale('modal-intervention');
  await chargerInterventions();
}

// ════════════════════════════════════════
//  COMPTABILITÉ — matrice Clients × Mois
//  Vue Production : rangée dans le mois de l'intervention, dès
//  "Terminée" ou "Payée". Vue Réel : rangée dans le mois de la vraie
//  date de paiement — décidé le 16/09, la réalité du terrain pour un
//  artisan (contrairement à un centre de formation, aucun délai
//  contractuel connu à l'avance).
// ════════════════════════════════════════
var _vueCompta = 'production';
var _vueMoisTrim = 'mois';
var _anneeCompta = new Date().getFullYear();
var _interventionsAnneeCache = [];

const MOIS_COURTS = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];

// ── Système de couleurs par client (même mécanique que MPA Formation) ──
var CLIENT_PALETTE = [
  '#B5502F', // Terre cuite (marque)
  '#0891b2', // Cyan/sarcelle doux
  '#7c6fdb', // Violet doux
  '#0a8f68', // Vert émeraude doux
  '#b45309', // Ambre/brun doux
  '#c2578f', // Rose vieilli doux
  '#4f6ba8', // Bleu ardoise
  '#5a8a5a', // Vert sauge
  '#8a6ba8', // Mauve doux
  '#3f8a8a', // Teal foncé doux
];
var CLIENT_COLORS = {};
function getClientColor(nom) {
  if (!nom) return '#B5502F';
  if (CLIENT_COLORS[nom]) return CLIENT_COLORS[nom];
  var hash = 0;
  for (var i = 0; i < nom.length; i++) {
    hash = (hash * 31 + nom.charCodeAt(i)) & 0xffffffff;
  }
  var idx = Math.abs(hash) % CLIENT_PALETTE.length;
  CLIENT_COLORS[nom] = CLIENT_PALETTE[idx];
  return CLIENT_COLORS[nom];
}

function switchVueCompta(vue) {
  _vueCompta = vue;
  document.getElementById('cta-prod').classList.toggle('active', vue === 'production');
  document.getElementById('cta-reel').classList.toggle('active', vue === 'reel');
  document.getElementById('compta-note').innerHTML = vue === 'production'
    ? '💡 Vue <strong>Production</strong> : le CA est rangé dans le mois de l\'intervention, dès qu\'elle est marquée "Terminée" ou "Payée".'
    : '💡 Vue <strong>Encaissement</strong> : le CA est rangé dans le mois de la vraie date de paiement — la réalité de trésorerie d\'un artisan.';
  renderMatriceCompta();
}

function setVueMoisTrim(vue) {
  _vueMoisTrim = vue;
  document.getElementById('cpv2-btn-mois').classList.toggle('active', vue === 'mois');
  document.getElementById('cpv2-btn-trim').classList.toggle('active', vue === 'trim');
  renderMatriceCompta();
}

function anneeComptaPrec() { _anneeCompta--; chargerCompta(); }
function anneeComptaSuiv() { _anneeCompta++; chargerCompta(); }

async function chargerCompta() {
  document.getElementById('compta-annee').textContent = _anneeCompta;
  var debut = _anneeCompta + '-01-01';
  var fin = _anneeCompta + '-12-31';

  var { data, error } = await sb.from('mpa_artisans_interventions')
    .select('*, mpa_artisans_clients(nom)')
    .eq('artisan_id', _artisan.id)
    .neq('statut', 'annulee')
    .or('date_intervention.gte.' + debut + ',date_paiement.gte.' + debut)
    .lte('date_intervention', fin);

  if (error) { console.error(error); _interventionsAnneeCache = []; }
  else { _interventionsAnneeCache = data || []; }

  renderMatriceCompta();
}

function renderMatriceCompta() {
  // Regroupement par client, puis par mois (1-12), selon la vue active
  var parClient = {}; // { nomClient: { 1: montant, 2: montant, ... } }
  var totalParMois = Array(13).fill(0); // index 1-12
  var totalGeneral = 0;

  _interventionsAnneeCache.forEach(function(i) {
    if (_vueCompta === 'production') {
      if (i.statut !== 'terminee' && i.statut !== 'payee') return;
      var d = new Date(i.date_intervention);
      if (d.getFullYear() !== _anneeCompta) return;
      var mois = d.getMonth() + 1;
      ajouterMontant(i, mois);
    } else {
      if (i.statut !== 'payee' || !i.date_paiement) return;
      var dp = new Date(i.date_paiement);
      if (dp.getFullYear() !== _anneeCompta) return;
      var moisP = dp.getMonth() + 1;
      ajouterMontant(i, moisP);
    }
  });

  function ajouterMontant(i, mois) {
    var nomClient = i.mpa_artisans_clients ? i.mpa_artisans_clients.nom : '(sans client)';
    if (!parClient[nomClient]) parClient[nomClient] = {};
    parClient[nomClient][mois] = (parClient[nomClient][mois] || 0) + (i.prix || 0);
    totalParMois[mois] += (i.prix || 0);
    totalGeneral += (i.prix || 0);
  }

  var curMonth = new Date().getMonth(); // 0-11
  var isCurYear = (_anneeCompta === new Date().getFullYear());
  var cotisPct = _artisan.cotisation_sociale_pct ?? 22;
  var clients = Object.keys(parClient).sort();
  var thead = document.getElementById('thead-compta-row');
  var tbody = document.getElementById('tbody-compta');

  if (_vueMoisTrim === 'trim') {
    // ── COLONNES = 4 TRIMESTRES ──
    var qDefs = [
      { l: 'T1', m: [1, 2, 3] },
      { l: 'T2', m: [4, 5, 6] },
      { l: 'T3', m: [7, 8, 9] },
      { l: 'T4', m: [10, 11, 12] }
    ];
    var curQ = Math.floor(curMonth / 3);

    thead.innerHTML = '<th>Client</th>' + qDefs.map(function(q, qi) {
      return '<th' + (qi === curQ && isCurYear ? ' class="col-now"' : '') + '>' + q.l + '</th>';
    }).join('') + '<th>Total</th>';

    if (!clients.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="etat-vide-tbl">Aucune donnée pour ' + _anneeCompta + '.</td></tr>';
    } else {
      tbody.innerHTML = clients.map(function(nom) {
        var ligne = parClient[nom];
        var totalLigne = 0;
        var clr = getClientColor(nom);
        var cellules = qDefs.map(function(q, qi) {
          var val = 0;
          q.m.forEach(function(m) { val += ligne[m] || 0; });
          totalLigne += val;
          var cls = (qi === curQ && isCurYear) ? ' class="col-now"' : '';
          return '<td' + cls + ' style="text-align:right;' + (val ? '' : 'color:var(--mu);') + '">' + (val ? val.toFixed(0) + '€' : '—') + '</td>';
        }).join('');
        return '<tr class="cpv2-row-client"><td style="border-left-color:' + clr + ';color:' + clr + ';"><strong>' + escHtml(nom) + '</strong></td>' + cellules + '<td style="text-align:right;font-weight:700;">' + totalLigne.toFixed(0) + '€</td></tr>';
      }).join('');

      tbody.innerHTML += '<tr class="cpv2-sep"><td colspan="6"><div class="cpv2-matrix-sep-bar"></div></td></tr>';
    }

    var qBrut = [], qCotis = [], qNet = [];
    qDefs.forEach(function(q) {
      var b = 0; q.m.forEach(function(m) { b += totalParMois[m] || 0; });
      var co = Math.round(b * cotisPct / 100 * 100) / 100;
      qBrut.push(b); qCotis.push(co); qNet.push(b - co);
    });
    function makeQRow(data, label, cls, color) {
      var cells = data.map(function(v, qi) {
        var c = (qi === curQ && isCurYear) ? ' class="col-now"' : '';
        return '<td' + c + ' style="text-align:right;font-weight:700;' + (color ? 'color:' + color + ';' : '') + '">' + (v ? v.toFixed(0) + '€' : '—') + '</td>';
      }).join('');
      return '<tr class="' + cls + '"><td><strong>' + label + '</strong></td>' + cells + '<td></td></tr>';
    }
    tbody.innerHTML += makeQRow(qBrut, 'CA brut', 'cpv2-row-brut');
    tbody.innerHTML += makeQRow(qCotis, 'Cotisations', 'cpv2-row-cotis', 'var(--gold)');
    tbody.innerHTML += makeQRow(qNet, 'CA net', 'cpv2-row-net', 'var(--ac)');
  } else {
    // ── COLONNES = 12 MOIS ──
    thead.innerHTML = '<th>Client</th>' + MOIS_COURTS.map(function(m, idx) {
      return '<th' + (idx === curMonth && isCurYear ? ' class="col-now"' : '') + '>' + m + '</th>';
    }).join('') + '<th>Total</th>';

    if (!clients.length) {
      tbody.innerHTML = '<tr><td colspan="14" class="etat-vide-tbl">Aucune donnée pour ' + _anneeCompta + '.</td></tr>';
    } else {
      tbody.innerHTML = clients.map(function(nom) {
        var ligne = parClient[nom];
        var totalLigne = 0;
        var clr = getClientColor(nom);
        var cellules = MOIS_COURTS.map(function(_, idx) {
          var m = idx + 1;
          var val = ligne[m] || 0;
          totalLigne += val;
          var cls = (idx === curMonth && isCurYear) ? ' class="col-now"' : '';
          return '<td' + cls + ' style="text-align:right;' + (val ? '' : 'color:var(--mu);') + '">' + (val ? val.toFixed(0) + '€' : '—') + '</td>';
        }).join('');
        return '<tr class="cpv2-row-client"><td style="border-left-color:' + clr + ';color:' + clr + ';"><strong>' + escHtml(nom) + '</strong></td>' + cellules + '<td style="text-align:right;font-weight:700;">' + totalLigne.toFixed(0) + '€</td></tr>';
      }).join('');

      tbody.innerHTML += '<tr class="cpv2-sep"><td colspan="14"><div class="cpv2-matrix-sep-bar"></div></td></tr>';
    }

    var mBrut = [], mCotis = [], mNet = [];
    for (var mi = 1; mi <= 12; mi++) {
      var b2 = totalParMois[mi] || 0;
      var co2 = Math.round(b2 * cotisPct / 100 * 100) / 100;
      mBrut.push(b2); mCotis.push(co2); mNet.push(b2 - co2);
    }
    function makeMRow(data, label, cls, color) {
      var cells = data.map(function(v, idx) {
        var c = (idx === curMonth && isCurYear) ? ' class="col-now"' : '';
        return '<td' + c + ' style="text-align:right;font-weight:700;' + (color ? 'color:' + color + ';' : '') + '">' + (v ? v.toFixed(0) + '€' : '—') + '</td>';
      }).join('');
      return '<tr class="' + cls + '"><td><strong>' + label + '</strong></td>' + cells + '<td></td></tr>';
    }
    tbody.innerHTML += makeMRow(mBrut, 'CA brut', 'cpv2-row-brut');
    tbody.innerHTML += makeMRow(mCotis, 'Cotisations', 'cpv2-row-cotis', 'var(--gold)');
    tbody.innerHTML += makeMRow(mNet, 'CA net', 'cpv2-row-net', 'var(--ac)');
  }

  // KPIs (toujours sur le CA Production de l'année, référence "vraie richesse produite")
  var caBrutProduction = 0;
  _interventionsAnneeCache.forEach(function(i) {
    if (i.statut !== 'terminee' && i.statut !== 'payee') return;
    var d = new Date(i.date_intervention);
    if (d.getFullYear() !== _anneeCompta) return;
    caBrutProduction += (i.prix || 0);
  });
  var cotis = caBrutProduction * (cotisPct / 100);
  var net = caBrutProduction - cotis;

  document.getElementById('kpi-ca-brut').textContent = caBrutProduction.toFixed(0) + ' €';
  document.getElementById('kpi-cotis').textContent = cotis.toFixed(0) + ' €';
  document.getElementById('kpi-ca-net').textContent = net.toFixed(0) + ' €';
}

// ════════════════════════════════════════
//  FACTURATION — regroupée par client, "panier non facturé"
//  Décidé le 16/09 avec Freddy : jamais une facture par intervention,
//  toujours un lot de tout ce qui est Terminée/Payée et pas encore
//  facturé pour un client donné, peu importe la date exacte.
// ════════════════════════════════════════
var _panierActuel = [];

function remplirSelectClientFacture() {
  var sel = document.getElementById('fact-client');
  sel.innerHTML = '<option value="">— Choisir un client —</option>' +
    _clientsCache.map(function(c) { return '<option value="' + c.id + '">' + escHtml(c.nom) + '</option>'; }).join('');
}

async function chargerPanierClient() {
  var clientId = document.getElementById('fact-client').value;
  var zone = document.getElementById('fact-panier');
  if (!clientId) { zone.innerHTML = ''; return; }

  var { data, error } = await sb.from('mpa_artisans_interventions')
    .select('*, artisans_services(nom_service)')
    .eq('artisan_id', _artisan.id)
    .eq('client_id', clientId)
    .in('statut', ['terminee', 'payee'])
    .is('facture_id', null)
    .order('date_intervention', { ascending: true });

  if (error) { zone.innerHTML = '<p style="color:var(--danger);font-size:13px;">Erreur : ' + error.message + '</p>'; return; }
  _panierActuel = data || [];

  if (!_panierActuel.length) {
    zone.innerHTML = '<p style="font-size:13px;color:var(--mu);padding:14px 0;">Aucune intervention en attente de facturation pour ce client.</p>';
    return;
  }

  zone.innerHTML =
    _panierActuel.map(function(i) {
      var service = i.artisans_services ? i.artisans_services.nom_service : '(sans service)';
      var dateAff = new Date(i.date_intervention).toLocaleDateString('fr-FR', { day:'numeric', month:'short', year:'numeric' });
      return '<label class="panier-item">' +
        '<input type="checkbox" class="panier-check" data-id="' + i.id + '" data-prix="' + (i.prix||0) + '" checked onchange="recalculerPanier()">' +
        '<span class="panier-item-info">' + escHtml(service) + ' <span style="color:var(--mu);">— ' + dateAff + '</span></span>' +
        '<span class="panier-item-prix">' + (i.prix||0).toFixed(2) + '€</span>' +
      '</label>';
    }).join('') +
    '<div class="panier-total">' +
      '<span class="panier-total-label">Total sélectionné</span>' +
      '<span class="panier-total-montant" id="panier-total-montant">0€</span>' +
    '</div>' +
    '<button class="addb" style="width:100%;justify-content:center;margin-top:14px;padding:11px;" onclick="genererFacture()">🧾 Générer la facture</button>';

  recalculerPanier();
}

function recalculerPanier() {
  var total = 0;
  document.querySelectorAll('.panier-check:checked').forEach(function(cb) {
    total += parseFloat(cb.dataset.prix) || 0;
  });
  var el = document.getElementById('panier-total-montant');
  if (el) el.textContent = total.toFixed(2) + '€';
}

async function genererFacture() {
  var clientId = document.getElementById('fact-client').value;
  var checked = Array.from(document.querySelectorAll('.panier-check:checked'));
  if (!checked.length) { alert('Sélectionnez au moins une intervention.'); return; }

  var idsSelectionnes = checked.map(function(cb) { return cb.dataset.id; });
  var montantTotal = checked.reduce(function(s, cb) { return s + (parseFloat(cb.dataset.prix) || 0); }, 0);

  // Numérotation simple : ANNÉE-XXX, séquentiel par artisan
  var { count } = await sb.from('mpa_artisans_factures').select('id', { count: 'exact', head: true }).eq('artisan_id', _artisan.id);
  var numero = new Date().getFullYear() + '-' + String((count||0) + 1).padStart(3, '0');

  var { data: facture, error } = await sb.from('mpa_artisans_factures').insert({
    artisan_id: _artisan.id, client_id: clientId, numero: numero, montant_total: montantTotal,
  }).select().single();
  if (error) { alert('Erreur : ' + error.message); return; }

  var { error: err2 } = await sb.from('mpa_artisans_interventions')
    .update({ facture_id: facture.id }).in('id', idsSelectionnes);
  if (err2) { alert('Erreur : ' + err2.message); return; }

  await chargerPanierClient();
  await chargerFactures();
  imprimerFacture(facture.id);
}

async function chargerFactures() {
  var { data, error } = await sb.from('mpa_artisans_factures')
    .select('*, mpa_artisans_clients(nom)')
    .eq('artisan_id', _artisan.id)
    .order('date_facture', { ascending: false });
  if (error) { console.error(error); return; }

  var tbody = document.getElementById('tbody-factures');
  if (!data || !data.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="etat-vide-tbl">Aucune facture émise pour l\'instant.</td></tr>';
    return;
  }
  tbody.innerHTML = data.map(function(f) {
    var dateAff = new Date(f.date_facture).toLocaleDateString('fr-FR');
    var client = f.mpa_artisans_clients ? f.mpa_artisans_clients.nom : '—';
    return '<tr>' +
      '<td><strong>' + escHtml(f.numero) + '</strong></td>' +
      '<td>' + escHtml(client) + '</td>' +
      '<td>' + dateAff + '</td>' +
      '<td>' + f.montant_total.toFixed(2) + '€</td>' +
      '<td><button class="icbtn" onclick="imprimerFacture(\'' + f.id + '\')" title="Voir / imprimer">🖨</button></td>' +
    '</tr>';
  }).join('');
}

async function imprimerFacture(factureId) {
  var { data: facture, error } = await sb.from('mpa_artisans_factures')
    .select('*, mpa_artisans_clients(*)').eq('id', factureId).single();
  if (error) { alert('Erreur : ' + error.message); return; }

  var { data: lignes } = await sb.from('mpa_artisans_interventions')
    .select('*, artisans_services(nom_service)').eq('facture_id', factureId).order('date_intervention', { ascending: true });

  var a = _artisan;
  var c = facture.mpa_artisans_clients;
  var dateFactureAff = new Date(facture.date_facture).toLocaleDateString('fr-FR', { day:'numeric', month:'long', year:'numeric' });

  var lignesHtml = (lignes||[]).map(function(l) {
    var service = l.artisans_services ? l.artisans_services.nom_service : '(sans service)';
    var dateAff = new Date(l.date_intervention).toLocaleDateString('fr-FR', { day:'numeric', month:'short', year:'numeric' });
    return '<tr><td>' + dateAff + '</td><td>' + escHtml(service) + (l.notes ? ' — ' + escHtml(l.notes) : '') + '</td><td>' + (l.prix||0).toFixed(2) + '€</td></tr>';
  }).join('');

  document.getElementById('facture-print').innerHTML =
    '<div class="fp-page">' +
      '<div class="fp-header">' +
        '<div class="fp-brand">MPA <span>Artisans</span></div>' +
        '<div class="fp-meta">Facture n° ' + escHtml(facture.numero) + '<br>Le ' + dateFactureAff + '</div>' +
      '</div>' +
      '<div class="fp-parties">' +
        '<div class="fp-partie">' +
          '<div class="fp-partie-label">Émetteur</div>' +
          '<div class="fp-partie-nom">' + escHtml(a.nom_entreprise||'') + '</div>' +
          '<p>' + escHtml(a.statut||'') + (a.siret ? '<br>SIRET ' + escHtml(a.siret) : '') + (a.ape ? ' — APE ' + escHtml(a.ape) : '') +
          (a.adresse ? '<br>' + escHtml(a.adresse) : '') + (a.code_postal||a.commune ? '<br>' + escHtml(a.code_postal||'') + ' ' + escHtml(a.commune||'') : '') +
          (a.telephone ? '<br>Tél. ' + escHtml(a.telephone) : '') + (a.email ? '<br>' + escHtml(a.email) : '') + '</p>' +
        '</div>' +
        '<div class="fp-partie">' +
          '<div class="fp-partie-label">Client</div>' +
          '<div class="fp-partie-nom">' + escHtml(c.nom) + '</div>' +
          '<p>' + (c.adresse ? escHtml(c.adresse) + '<br>' : '') + (c.adresse2 ? escHtml(c.adresse2) + '<br>' : '') +
          (c.code_postal||c.commune ? escHtml(c.code_postal||'') + ' ' + escHtml(c.commune||'') : '') +
          (c.referent ? '<br>À l\'attention de ' + escHtml(c.referent) : '') + '</p>' +
        '</div>' +
      '</div>' +
      '<table class="fp-table">' +
        '<thead><tr><th>Date</th><th>Prestation</th><th>Montant</th></tr></thead>' +
        '<tbody>' + lignesHtml + '</tbody>' +
      '</table>' +
      '<div class="fp-total-row"><span>Total</span><span>' + facture.montant_total.toFixed(2) + '€</span></div>' +
      (a.tva_config && a.tva_config !== 'Non assujetti' ? '' : '<p style="font-size:11px;color:#6b7c96;">TVA non applicable, art. 293 B du CGI.</p>') +
      '<div class="fp-footer">' + escHtml(a.nom_entreprise||'') + (a.siret ? ' — SIRET ' + escHtml(a.siret) : '') + '</div>' +
    '</div>';

  document.getElementById('facture-print').style.display = 'block';
  setTimeout(function() {
    window.print();
    document.getElementById('facture-print').style.display = 'none';
  }, 200);
}

// ════════════════════════════════════════
//  TABLEAU DE BORD — plafond micro-entreprise, estimation IR,
//  disponibilités visibles.
//  ⚠️ Abattement forfaitaire à 50% (BIC prestations de services),
//  volontairement différent des 34% de MPA Formation (BNC, services
//  libéraux) — vraie différence de régime fiscal entre un formateur
//  indépendant et un artisan, pas une erreur de recopie.
// ════════════════════════════════════════
const PLAFOND_MICRO_BIC_SERVICES = 77700;
const ABATTEMENT_BIC_SERVICES = 0.50;
// Barème progressif IR 2024 (revenus 2024, déclarés en 2025)
const BAREME_IR = [
  { seuil: 0,      taux: 0    },
  { seuil: 11294,  taux: 0.11 },
  { seuil: 28797,  taux: 0.30 },
  { seuil: 82341,  taux: 0.41 },
  { seuil: 177106, taux: 0.45 },
];

function calculerIR(revenuImposable, nbParts) {
  var parPart = revenuImposable / (nbParts || 1);
  var impotParPart = 0;
  for (var i = 0; i < BAREME_IR.length; i++) {
    var seuilBas = BAREME_IR[i].seuil;
    var seuilHaut = (i + 1 < BAREME_IR.length) ? BAREME_IR[i+1].seuil : Infinity;
    if (parPart > seuilBas) {
      var tranche = Math.min(parPart, seuilHaut) - seuilBas;
      impotParPart += tranche * BAREME_IR[i].taux;
    }
  }
  return impotParPart * (nbParts || 1);
}

async function initDashboard() {
  document.getElementById('dash-parts').value = _artisan.parts_fiscales || 1;
  await calculerDashboardFiscal();
  _dispoAnnee = new Date().getFullYear();
  _dispoMois = new Date().getMonth();
  await renderDispoCalendrier();
}

async function calculerDashboardFiscal() {
  var anneeAuj = new Date().getFullYear();
  var debut = anneeAuj + '-01-01';
  var fin = anneeAuj + '-12-31';

  var { data } = await sb.from('mpa_artisans_interventions')
    .select('prix, statut, date_intervention')
    .eq('artisan_id', _artisan.id)
    .in('statut', ['terminee', 'payee'])
    .gte('date_intervention', debut)
    .lte('date_intervention', fin);

  var caBrut = (data || []).reduce(function(s, i) { return s + (i.prix || 0); }, 0);

  // Jauge plafond micro-entreprise
  var pct = Math.min(100, (caBrut / PLAFOND_MICRO_BIC_SERVICES) * 100);
  document.getElementById('dash-me-pct').textContent = pct.toFixed(0) + '%';
  document.getElementById('dash-me-amt').textContent = caBrut.toFixed(0) + ' € / ' + PLAFOND_MICRO_BIC_SERVICES.toLocaleString('fr-FR') + ' €';
  var bar = document.getElementById('dash-jauge-me');
  bar.style.width = pct + '%';
  bar.className = 'dj-bar' + (pct >= 90 ? ' danger' : pct >= 70 ? ' warn' : '');
  document.getElementById('dash-me-msg').textContent =
    pct >= 90 ? '⚠️ Seuil bientôt atteint' : pct >= 70 ? 'À surveiller' : 'Marge confortable';

  // Estimation IR
  var revenuImposable = caBrut * (1 - ABATTEMENT_BIC_SERVICES);
  var nbParts = parseFloat(document.getElementById('dash-parts').value) || 1;
  var ir = calculerIR(revenuImposable, nbParts);

  document.getElementById('dash-ir-body').innerHTML =
    '<div class="ir-ligne"><span>CA brut (année)</span><span>' + caBrut.toFixed(0) + ' €</span></div>' +
    '<div class="ir-ligne"><span>Revenu imposable (après abattement 50%)</span><span>' + revenuImposable.toFixed(0) + ' €</span></div>' +
    '<div class="ir-ligne"><span>Estimation impôt sur le revenu</span><span>' + ir.toFixed(0) + ' €</span></div>';
}

async function sauverPartsFiscales() {
  var parts = parseFloat(document.getElementById('dash-parts').value) || 1;
  await sb.from('artisans').update({ parts_fiscales: parts }).eq('id', _artisan.id);
  _artisan.parts_fiscales = parts;
  await calculerDashboardFiscal();
}

// ── Mini-calendrier disponibilités ──
var _dispoAnnee, _dispoMois;

function dispoMoisPrec() { _dispoMois--; if (_dispoMois < 0) { _dispoMois = 11; _dispoAnnee--; } renderDispoCalendrier(); }
function dispoMoisSuiv() { _dispoMois++; if (_dispoMois > 11) { _dispoMois = 0; _dispoAnnee++; } renderDispoCalendrier(); }

async function renderDispoCalendrier() {
  document.getElementById('dv2-cal-month').textContent = MOIS_NOMS[_dispoMois] + ' ' + _dispoAnnee;

  var debutMois = new Date(_dispoAnnee, _dispoMois, 1).toISOString().slice(0,10);
  var finMois = new Date(_dispoAnnee, _dispoMois + 1, 0).toISOString().slice(0,10);
  var { data } = await sb.from('mpa_artisans_interventions')
    .select('date_intervention')
    .eq('artisan_id', _artisan.id)
    .neq('statut', 'annulee')
    .gte('date_intervention', debutMois)
    .lte('date_intervention', finMois);

  var joursOccupes = {};
  (data || []).forEach(function(i) { joursOccupes[i.date_intervention] = true; });

  var premierJourSemaine = (new Date(_dispoAnnee, _dispoMois, 1).getDay() + 6) % 7;
  var joursDansMois = new Date(_dispoAnnee, _dispoMois + 1, 0).getDate();

  var html = '';
  for (var v = 0; v < premierJourSemaine; v++) html += '<div class="dv2-day other"></div>';
  for (var j = 1; j <= joursDansMois; j++) {
    var dateStr = _dispoAnnee + '-' + String(_dispoMois+1).padStart(2,'0') + '-' + String(j).padStart(2,'0');
    var occupe = !!joursOccupes[dateStr];
    html += '<div class="dv2-day' + (occupe ? ' busy' : '') + '">' + j + '</div>';
  }
  document.getElementById('dv2-cal-grid').innerHTML = html;
}

// ════════════════════════════════════════
//  FICHE ARTISAN
// ════════════════════════════════════════
function renderFiche() {
  var a = _artisan;
  document.getElementById('fv-nom').textContent = a.nom_entreprise || '—';
  document.getElementById('fv-statut').textContent = a.statut || 'Artisan Indépendant';
  document.getElementById('fv-act').textContent = a.secteur || '—';
  document.getElementById('fv-siret').textContent = a.siret || '—';
  document.getElementById('fv-ape').textContent = a.ape || '—';
  document.getElementById('fv-tva-intra').textContent = a.tva_intra || '—';
  document.getElementById('fv-adr').textContent = a.adresse || '—';
  document.getElementById('fv-cp').textContent = a.code_postal || '—';
  document.getElementById('fv-com').textContent = a.commune || '—';
  document.getElementById('fv-tel').textContent = a.telephone || '—';
  document.getElementById('fv-email').textContent = a.email || '—';
  document.getElementById('fv-web').textContent = a.site_web || '—';

  document.getElementById('cfg-cotis').value = a.cotisation_sociale_pct ?? 22;
  document.getElementById('cfg-tva').value = a.tva_config || 'Non assujetti';
}

function openModifierFiche() {
  var a = _artisan;
  document.getElementById('m-nom').value = a.nom_entreprise || '';
  document.getElementById('m-statut').value = a.statut || 'Artisan Indépendant';
  document.getElementById('m-siret').value = a.siret || '';
  document.getElementById('m-ape').value = a.ape || '';
  document.getElementById('m-tva-intra').value = a.tva_intra || '';
  document.getElementById('m-adr').value = a.adresse || '';
  document.getElementById('m-cp').value = a.code_postal || '';
  document.getElementById('m-com').value = a.commune || '';
  document.getElementById('m-tel').value = a.telephone || '';
  document.getElementById('m-email').value = a.email || '';
  document.getElementById('m-web').value = a.site_web || '';
  ouvrirModale('modal-fiche');
}

async function sauverFiche() {
  var maj = {
    nom_entreprise: document.getElementById('m-nom').value.trim(),
    statut: document.getElementById('m-statut').value.trim(),
    siret: document.getElementById('m-siret').value.trim(),
    ape: document.getElementById('m-ape').value.trim(),
    tva_intra: document.getElementById('m-tva-intra').value.trim(),
    adresse: document.getElementById('m-adr').value.trim(),
    code_postal: document.getElementById('m-cp').value.trim(),
    commune: document.getElementById('m-com').value.trim(),
    telephone: document.getElementById('m-tel').value.trim(),
    email: document.getElementById('m-email').value.trim(),
    site_web: document.getElementById('m-web').value.trim(),
  };
  var { error } = await sb.from('artisans').update(maj).eq('id', _artisan.id);
  if (error) { alert('Erreur : ' + error.message); return; }
  Object.assign(_artisan, maj);
  renderFiche();
  fermerModale('modal-fiche');
}

async function saveConfigFiscal() {
  var maj = {
    cotisation_sociale_pct: parseFloat(document.getElementById('cfg-cotis').value) || 22,
    tva_config: document.getElementById('cfg-tva').value.trim() || 'Non assujetti',
  };
  var { error } = await sb.from('artisans').update(maj).eq('id', _artisan.id);
  if (error) { alert('Erreur : ' + error.message); return; }
  Object.assign(_artisan, maj);
}

// ════════════════════════════════════════
//  CLIENTS HABITUELS
// ════════════════════════════════════════
async function chargerClients() {
  var { data, error } = await sb.from('mpa_artisans_clients').select('*').eq('artisan_id', _artisan.id).order('nom', { ascending: true });
  if (error) { console.error(error); return; }
  _clientsCache = data || [];
  document.getElementById('cnt-c').textContent = _clientsCache.length;
  renderClients(_clientsCache);
}

function renderClients(liste) {
  var tbody = document.getElementById('tbody-clients');
  if (!liste.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="etat-vide-tbl">Aucun client habituel pour l\'instant.</td></tr>';
    return;
  }
  tbody.innerHTML = liste.map(function(c) {
    return '<tr>' +
      '<td><strong>' + escHtml(c.nom) + '</strong></td>' +
      '<td>' + escHtml(c.adresse||'—') + '</td>' +
      '<td>' + escHtml(c.code_postal||'—') + '</td>' +
      '<td>' + escHtml(c.commune||'—') + '</td>' +
      '<td>' + (c.delai_paiement||30) + ' j</td>' +
      '<td>' + escHtml(c.referent||'—') + '</td>' +
      '<td><button class="icbtn danger" onclick="supprimerClient(\'' + c.id + '\')" title="Supprimer">🗑</button></td>' +
    '</tr>';
  }).join('');
}

function filtrerClients() {
  var q = document.getElementById('sinp-clients').value.trim().toLowerCase();
  if (!q) { renderClients(_clientsCache); return; }
  renderClients(_clientsCache.filter(function(c) {
    return (c.nom + ' ' + (c.commune||'')).toLowerCase().indexOf(q) !== -1;
  }));
}

function openAjouterClient() {
  document.getElementById('c-nom').value = '';
  document.getElementById('c-adr').value = '';
  document.getElementById('c-cp').value = '';
  document.getElementById('c-com').value = '';
  document.getElementById('c-delai').value = 30;
  document.getElementById('c-ref').value = '';
  ouvrirModale('modal-client');
}

async function sauverClient() {
  var nom = document.getElementById('c-nom').value.trim();
  if (!nom) { alert('Le nom du client est obligatoire.'); return; }
  var nouveau = {
    artisan_id: _artisan.id,
    nom: nom,
    adresse: document.getElementById('c-adr').value.trim() || null,
    code_postal: document.getElementById('c-cp').value.trim() || null,
    commune: document.getElementById('c-com').value.trim() || null,
    delai_paiement: parseInt(document.getElementById('c-delai').value, 10) || 30,
    referent: document.getElementById('c-ref').value.trim() || null,
  };
  var { error } = await sb.from('mpa_artisans_clients').insert(nouveau);
  if (error) { alert('Erreur : ' + error.message); return; }
  fermerModale('modal-client');
  await chargerClients();
}

async function supprimerClient(id) {
  if (!confirm('Supprimer ce client ?')) return;
  var { error } = await sb.from('mpa_artisans_clients').delete().eq('id', id).eq('artisan_id', _artisan.id);
  if (error) { alert('Erreur : ' + error.message); return; }
  await chargerClients();
}

// ════════════════════════════════════════
//  MES SERVICES — gestion complète (source unique, partagée avec CaraLink Artisans)
// ════════════════════════════════════════

async function chargerServices() {
  var { data, error } = await sb.from('artisans_services').select('*').eq('artisan_id', _artisan.id).order('ordre', { ascending: true });
  if (error) { console.error(error); return; }
  _servicesCache = data || [];
  document.getElementById('cnt-s').textContent = _servicesCache.length;
  renderServices(_servicesCache);
}

function renderServices(liste) {
  var tbody = document.getElementById('tbody-services');
  if (!liste.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="etat-vide-tbl">Aucun service défini pour l\'instant.</td></tr>';
    return;
  }
  tbody.innerHTML = liste.map(function(s) {
    var prix = s.prix_indicatif ? (s.prix_indicatif + '€' + (s.unite ? '/' + s.unite : '')) : 'Sur devis';
    var duree = s.duree_estimee_min ? formatDuree(s.duree_estimee_min) : '—';
    return '<tr>' +
      '<td><strong>' + escHtml(s.nom_service) + '</strong></td>' +
      '<td>' + escHtml(s.description||'—') + '</td>' +
      '<td>' + duree + '</td>' +
      '<td>' + prix + '</td>' +
      '<td style="white-space:nowrap;">' +
        '<button class="icbtn" onclick="ouvrirService(\'' + s.id + '\')" title="Modifier">✎</button>' +
        '<button class="icbtn danger" onclick="supprimerService(\'' + s.id + '\')" title="Supprimer">🗑</button>' +
      '</td>' +
    '</tr>';
  }).join('');
}

function formatDuree(min) {
  var h = Math.floor(min / 60), m = min % 60;
  if (h && m) return h + 'h' + (m < 10 ? '0' : '') + m;
  if (h) return h + 'h';
  return m + ' min';
}

function filtrerServices() {
  var q = document.getElementById('sinp-services').value.trim().toLowerCase();
  if (!q) { renderServices(_servicesCache); return; }
  renderServices(_servicesCache.filter(function(s) {
    return (s.nom_service + ' ' + (s.description||'')).toLowerCase().indexOf(q) !== -1;
  }));
}

function openAjouterService() {
  _serviceEnCours = null;
  document.getElementById('modal-service-titre').textContent = 'Ajouter un service';
  document.getElementById('modal-service-btn').textContent = 'Ajouter';
  document.getElementById('s-nom').value = '';
  document.getElementById('s-desc').value = '';
  document.getElementById('s-duree').value = '';
  document.getElementById('s-prix').value = '';
  document.getElementById('s-unite').value = '';
  ouvrirModale('modal-service');
}

function ouvrirService(id) {
  var s = _servicesCache.find(function(x) { return x.id === id; });
  if (!s) return;
  _serviceEnCours = id;
  document.getElementById('modal-service-titre').textContent = 'Modifier ce service';
  document.getElementById('modal-service-btn').textContent = 'Enregistrer';
  document.getElementById('s-nom').value = s.nom_service || '';
  document.getElementById('s-desc').value = s.description || '';
  document.getElementById('s-duree').value = s.duree_estimee_min || '';
  document.getElementById('s-prix').value = s.prix_indicatif || '';
  document.getElementById('s-unite').value = s.unite || '';
  ouvrirModale('modal-service');
}

async function sauverService() {
  var nom = document.getElementById('s-nom').value.trim();
  if (!nom) { alert('Le nom du service est obligatoire.'); return; }
  var maj = {
    artisan_id: _artisan.id,
    nom_service: nom,
    description: document.getElementById('s-desc').value.trim() || null,
    duree_estimee_min: parseInt(document.getElementById('s-duree').value, 10) || null,
    prix_indicatif: parseFloat(document.getElementById('s-prix').value) || null,
    unite: document.getElementById('s-unite').value.trim() || null,
  };
  var res;
  if (_serviceEnCours) {
    res = await sb.from('artisans_services').update(maj).eq('id', _serviceEnCours).eq('artisan_id', _artisan.id);
  } else {
    maj.ordre = _servicesCache.length;
    res = await sb.from('artisans_services').insert(maj);
  }
  if (res.error) { alert('Erreur : ' + res.error.message); return; }
  fermerModale('modal-service');
  await chargerServices();
}

async function supprimerService(id) {
  if (!confirm('Supprimer ce service ?')) return;
  var { error } = await sb.from('artisans_services').delete().eq('id', id).eq('artisan_id', _artisan.id);
  if (error) { alert('Erreur : ' + error.message); return; }
  await chargerServices();
}

init();
