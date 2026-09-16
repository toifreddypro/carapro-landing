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
var _interventionEnCours = null; // id de l'intervention ouverte dans la modale, ou null si création

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
var _anneeCompta = new Date().getFullYear();
var _interventionsAnneeCache = [];

const MOIS_COURTS = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];

function switchVueCompta(vue) {
  _vueCompta = vue;
  document.getElementById('cta-prod').classList.toggle('active', vue === 'production');
  document.getElementById('cta-reel').classList.toggle('active', vue === 'reel');
  document.getElementById('compta-note').innerHTML = vue === 'production'
    ? '💡 Vue <strong>Production</strong> : le CA est rangé dans le mois de l\'intervention, dès qu\'elle est marquée "Terminée" ou "Payée".'
    : '💡 Vue <strong>Réel</strong> : le CA est rangé dans le mois de la vraie date de paiement — la réalité de trésorerie d\'un artisan.';
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

  // En-tête
  document.getElementById('thead-compta-row').innerHTML =
    '<th>Client</th>' + MOIS_COURTS.map(function(m) { return '<th style="text-align:right;">' + m + '</th>'; }).join('') +
    '<th style="text-align:right;">Total</th>';

  // Corps
  var clients = Object.keys(parClient).sort();
  var tbody = document.getElementById('tbody-compta');
  if (!clients.length) {
    tbody.innerHTML = '<tr><td colspan="14" class="etat-vide-tbl">Aucune donnée pour ' + _anneeCompta + '.</td></tr>';
  } else {
    tbody.innerHTML = clients.map(function(nom) {
      var ligne = parClient[nom];
      var totalLigne = 0;
      var cellules = MOIS_COURTS.map(function(_, idx) {
        var m = idx + 1;
        var val = ligne[m] || 0;
        totalLigne += val;
        return '<td style="text-align:right;' + (val ? '' : 'color:var(--mu);') + '">' + (val ? val.toFixed(0) + '€' : '—') + '</td>';
      }).join('');
      return '<tr><td><strong>' + escHtml(nom) + '</strong></td>' + cellules + '<td style="text-align:right;font-weight:700;">' + totalLigne.toFixed(0) + '€</td></tr>';
    }).join('');

    // Ligne total
    tbody.innerHTML += '<tr style="background:var(--p2);"><td><strong>Total</strong></td>' +
      totalParMois.slice(1).map(function(v) { return '<td style="text-align:right;font-weight:700;">' + (v ? v.toFixed(0) + '€' : '—') + '</td>'; }).join('') +
      '<td style="text-align:right;font-weight:800;color:var(--ac);">' + totalGeneral.toFixed(0) + '€</td></tr>';
  }

  // KPIs (toujours sur le CA Production de l'année, référence "vraie richesse produite")
  var caBrutProduction = 0;
  _interventionsAnneeCache.forEach(function(i) {
    if (i.statut !== 'terminee' && i.statut !== 'payee') return;
    var d = new Date(i.date_intervention);
    if (d.getFullYear() !== _anneeCompta) return;
    caBrutProduction += (i.prix || 0);
  });
  var cotisPct = _artisan.cotisation_sociale_pct ?? 22;
  var cotis = caBrutProduction * (cotisPct / 100);
  var net = caBrutProduction - cotis;

  document.getElementById('kpi-ca-brut').textContent = caBrutProduction.toFixed(0) + ' €';
  document.getElementById('kpi-cotis').textContent = cotis.toFixed(0) + ' €';
  document.getElementById('kpi-ca-net').textContent = net.toFixed(0) + ' €';
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
//  MES SERVICES — lecture seule (source unique : CaraLink Artisans)
// ════════════════════════════════════════
async function chargerServices() {
  var { data, error } = await sb.from('artisans_services').select('*').eq('artisan_id', _artisan.id).order('ordre', { ascending: true });
  if (error) { console.error(error); return; }
  _servicesCache = data || [];
  document.getElementById('cnt-s').textContent = _servicesCache.length;

  var tbody = document.getElementById('tbody-services');
  if (!_servicesCache.length) {
    tbody.innerHTML = '<tr><td colspan="3" class="etat-vide-tbl">Aucun service défini pour l\'instant — ajoutez-en depuis votre espace CaraLink Artisans.</td></tr>';
    return;
  }
  tbody.innerHTML = _servicesCache.map(function(s) {
    var prix = s.prix_indicatif ? (s.prix_indicatif + '€' + (s.unite ? '/' + s.unite : '')) : 'Sur devis';
    return '<tr>' +
      '<td><strong>' + escHtml(s.nom_service) + '</strong></td>' +
      '<td>' + escHtml(s.description||'—') + '</td>' +
      '<td>' + prix + '</td>' +
    '</tr>';
  }).join('');
}

init();
