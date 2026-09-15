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
