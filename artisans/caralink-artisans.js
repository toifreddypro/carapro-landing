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

const SECTEURS = [
  { code:'jardinage',     icon:'🌿' },
  { code:'plomberie',     icon:'🔧' },
  { code:'electricite',   icon:'⚡' },
  { code:'peinture',      icon:'🎨' },
  { code:'maconnerie',    icon:'🧱' },
  { code:'menuiserie',    icon:'🪚' },
  { code:'climatisation', icon:'❄️' },
  { code:'autre',         icon:'✨' },
];
function secteurLabel(code) {
  var s = SECTEURS.find(function(x){ return x.code === code; });
  return s ? s.icon + ' ' + T('sec_' + code) : escHtml(code);
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
  return '<div style="position:relative;display:inline-block;">' +
    '<button onclick="toggleLangMenuArtisans()" style="display:flex;align-items:center;gap:6px;padding:5px 10px;border-radius:8px;border:1px solid var(--brd);background:var(--panel);cursor:pointer;font-size:12.5px;color:var(--tx);">' +
      '<span class="flag-swatch ' + drapeaux[AT_LANG] + '"></span>' + noms[AT_LANG] +
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
}
document.addEventListener('click', function(e) {
  var menu = document.getElementById('lang-menu-artisans');
  if (menu && !e.target.closest('#nav')) menu.style.display = 'none';
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
        '<div style="display:flex;align-items:center;gap:8px;">' +
          '<img src="/apple-touch-icon.png" alt="LearnLogic Studio" style="width:26px;height:26px;border-radius:7px;flex-shrink:0;">' +
          '<span class="nav-logo-txt">CaraLink <span>Artisans</span></span>' +
        '</div>' +
      '</a>' +
      '<div class="nav-links" style="display:flex;align-items:center;gap:14px;">' +
        renderLangSwitcher() +
        '<a href="/artisans/connexion.html" style="padding:6px 10px;color:var(--tx);text-decoration:none;font-size:13.5px;">' + T('nav_connexion') + '</a>' +
        '<a href="/artisans/inscription.html" style="padding:6px 14px;border-radius:8px;background:var(--ac);color:#fff;font-weight:700;text-decoration:none;">' + T('nav_devenir_artisan') + '</a>' +
      '</div>' +
    '</div>' +
    '<div class="nav-spacer"></div>';
}

// ════════════════════════════════════════
//  HERO / RECHERCHE — secteur + commune, jamais de date (V2)
// ════════════════════════════════════════
var _searchState = { secteur:'', commune:'', tri:'' };

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
        '<p class="hero-note">' + T('hero_note') + '</p>' +
        '<div class="search-bar">' +
          '<div class="search-field"><label>' + T('search_secteur_label') + '</label>' +
            '<input id="search-secteur" type="text" placeholder="' + T('search_secteur_ph') + '" value="' + escHtml(_searchState.secteur) + '" onkeydown="if(event.key===\'Enter\')lancerRecherche()"/></div>' +
          '<div class="search-field"><label>' + T('search_lieu_label') + '</label>' +
            '<input id="search-commune" type="text" placeholder="' + T('search_lieu_ph') + '" value="' + escHtml(_searchState.commune) + '" onkeydown="if(event.key===\'Enter\')lancerRecherche()"/></div>' +
          '<div class="search-field">' +
            '<label>' + T('search_date_label') + ' <span style="font-weight:400;color:var(--mu2);text-transform:none;letter-spacing:0;">' + T('search_date_bientot') + '</span></label>' +
            '<input id="search-date" type="date" disabled style="opacity:.55;cursor:not-allowed;"/>' +
          '</div>' +
          '<button class="search-btn" onclick="lancerRecherche()">' +
            '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>' +
            T('search_btn') +
          '</button>' +
        '</div>' +
        '<div class="filters-wrap">' +
          '<button class="filter-pill" title="' + T('filter_bientot_title') + '" style="opacity:.55;cursor:not-allowed;" onclick="return false;">' + T('filter_dispo') + '</button>' +
          '<button class="filter-pill' + (_searchState.tri==='tarif'?' active':'') + '" onclick="trierPar(\'tarif\')">' + T('filter_tarif') + '</button>' +
          '<button class="filter-pill' + (_searchState.tri==='note'?' active':'') + '" onclick="trierPar(\'note\')">' + T('filter_note') + '</button>' +
        '</div>' +
      '</div>' +
    '</div>';
}

function trierPar(critere) {
  _searchState.tri = (_searchState.tri === critere) ? '' : critere;
  renderHero();
  chargerArtisans();
}

function lancerRecherche() {
  _searchState.secteur = document.getElementById('search-secteur').value.trim();
  _searchState.commune = document.getElementById('search-commune').value.trim();
  chargerArtisans();
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
      '<div class="ads-panel">' +
        '<div style="font-size:11px;font-weight:700;color:var(--mu2);letter-spacing:.05em;text-transform:uppercase;margin-bottom:10px;">' + T('ads_titre') + '</div>' +
        '<div style="font-size:13px;color:var(--mu);line-height:1.6;">' + T('ads_texte') + '</div>' +
      '</div>' +
      '<div class="results-panel">' +
        '<div class="results-header">' +
          '<span class="results-count" id="results-count">' + T('chargement') + '</span>' +
        '</div>' +
        '<div id="artisans-list"><div class="loader">' + T('chargement') + '</div></div>' +
      '</div>' +
      '<div class="map-panel">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">' +
          '<span class="map-label">' + T('map_label') + '</span>' +
        '</div>' +
        '<div id="leaflet-map" style="width:100%;height:280px;border-radius:12px;border:1px solid var(--brd);overflow:hidden;"></div>' +
      '</div>' +
    '</div>';
  chargerArtisans();
  setTimeout(initCarte, 100);
}

function initCarte() {
  var el = document.getElementById('leaflet-map');
  if (!el || _map) return;
  _map = L.map('leaflet-map', { zoomControl:true, scrollWheelZoom:false }).setView([16.10,-61.55], 10);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 18
  }).addTo(_map);
  window._caraproIcon = L.divIcon({
    html: '<div style="width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#B5502F,#8F3D22);border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;font-size:12px;color:#fff;font-weight:700;">A</div>',
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
}

async function chargerArtisans() {
  var zoneListe = document.getElementById('artisans-list');
  var zoneCount = document.getElementById('results-count');
  if (!zoneListe) return;
  zoneListe.innerHTML = '<div class="loader">' + T('chargement') + '</div>';

  try {
    var params = new URLSearchParams();
    if (_searchState.secteur) params.set('secteur', _searchState.secteur);
    if (_searchState.commune) params.set('commune', _searchState.commune);

    var res = await fetch(SUPABASE_URL + '/functions/v1/lister-artisans?' + params.toString(), {
      headers: { 'Authorization': 'Bearer ' + SUPABASE_ANON }
    });
    var data = await res.json();
    if (data.error) throw new Error(data.error);

    var artisans = data.artisans || [];

    if (_searchState.tri === 'tarif') {
      artisans.sort(function(a, b) {
        if (a.tarif_min == null) return 1;
        if (b.tarif_min == null) return -1;
        return a.tarif_min - b.tarif_min;
      });
    } else if (_searchState.tri === 'note') {
      artisans.sort(function(a, b) {
        if (a.note_moyenne == null) return 1;
        if (b.note_moyenne == null) return -1;
        return b.note_moyenne - a.note_moyenne;
      });
    }

    if (zoneCount) zoneCount.textContent = artisans.length + ' ' + (artisans.length > 1 ? T('artisan_plusieurs') : T('artisan_un'));

    zoneListe.innerHTML = artisans.length
      ? artisans.map(renderArtisanCard).join('')
      : '<div class="etat-vide"><div class="etat-vide-titre">' + T('aucun_artisan_titre') + '</div>' + T('aucun_artisan_texte') + '</div>';

    mettreAJourCarte(artisans);

  } catch(e) {
    zoneListe.innerHTML = '<div class="etat-vide">' + T('erreur_generale') + '</div>';
    console.error(e);
  }
}

// ════════════════════════════════════════
//  CARTE ARTISAN
// ════════════════════════════════════════
function renderArtisanCard(a) {
  var ini = initiales(a.nom_entreprise);
  var photo = a.photo_profil_url
    ? '<img src="' + escHtml(a.photo_profil_url) + '" style="width:52px;height:52px;border-radius:50%;object-fit:cover;flex-shrink:0;" alt="">'
    : '<div class="avatar" style="width:52px;height:52px;font-size:16px;background:var(--line);display:flex;align-items:center;justify-content:center;border-radius:50%;font-family:Fraunces,serif;font-weight:700;color:var(--mu);">' + ini + '</div>';
  var badgeVerifie = a.verifie
    ? '<span class="badge-trust" title="SIRET et assurance vérifiés">✅ ' + T('badge_verifie') + '</span>'
    : '';
  var badgeNote = a.note_moyenne != null
    ? '<span class="badge-trust" style="background:rgba(180,83,9,.1);color:#b45309;">⭐ ' + a.note_moyenne + '</span>'
    : '';
  var badgeTarif = a.tarif_min != null
    ? '<span class="badge-trust" style="background:rgba(45,93,74,.1);color:#2D5D4A;">' + T('des_prefix') + ' ' + a.tarif_min + '€</span>'
    : '';
  return '<div class="formateur-card" onclick="ouvrirProfil(\'' + a.id + '\')">' +
    '<div class="card-top-row">' + photo +
      '<div class="card-info">' +
        '<div class="card-name">' + escHtml(a.nom_entreprise) + '</div>' +
        '<div class="card-title">' + secteurLabel(a.secteur) + ' · 📍 ' + escHtml(a.commune) + '</div>' +
      '</div>' +
    '</div>' +
    '<div class="card-meta">' +
      '<div class="card-badges">' + badgeVerifie + badgeNote + badgeTarif + '</div>' +
    '</div>' +
    (a.bio ? '<div style="font-size:13px;color:var(--mu2);margin-top:8px;">' + escHtml(a.bio) + '</div>' : '') +
  '</div>';
}

// ════════════════════════════════════════
//  PROFIL DÉTAILLÉ
// ════════════════════════════════════════
async function ouvrirProfil(id) {
  var div = document.getElementById('modal-profil');
  if (!div) { div = document.createElement('div'); div.id = 'modal-profil'; document.body.appendChild(div); }
  div.innerHTML = '<div style="position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:10001;display:flex;align-items:center;justify-content:center;padding:20px;"><div style="background:var(--panel,#fff);border-radius:14px;padding:30px;color:var(--mu);">' + T('chargement') + '</div></div>';

  try {
    var res = await fetch(SUPABASE_URL + '/functions/v1/lire-artisan?id=' + id, {
      headers: { 'Authorization': 'Bearer ' + SUPABASE_ANON }
    });
    var data = await res.json();
    if (data.error) throw new Error(data.error);

    div.innerHTML = buildProfilHTML(data);

  } catch(e) {
    div.innerHTML = '<div style="position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:10001;display:flex;align-items:center;justify-content:center;padding:20px;"><div style="background:var(--panel,#fff);border-radius:14px;padding:30px;color:var(--danger,#dc2626);">Erreur : ' + escHtml(e.message) + '</div></div>';
  }
}
function fermerProfil(e) { if (e && e.target !== e.currentTarget) return; var div = document.getElementById('modal-profil'); if (div) div.innerHTML = ''; }

function buildProfilHTML(data) {
  var a = data.artisan;
  var ini = initiales(a.nom_entreprise);
  var photo = a.photo_profil_url
    ? '<img src="' + escHtml(a.photo_profil_url) + '" style="width:72px;height:72px;border-radius:50%;object-fit:cover;" alt="">'
    : '<div style="width:72px;height:72px;border-radius:50%;background:var(--line);display:flex;align-items:center;justify-content:center;font-family:Fraunces,serif;font-size:26px;font-weight:700;color:var(--mu);">' + ini + '</div>';

  var servicesHtml = data.services.length
    ? data.services.map(function(s) {
        var prix = s.prix_indicatif ? (s.prix_indicatif + '€' + (s.unite ? '/' + s.unite : '')) : T('sur_devis');
        return '<div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--line,#eee);">' +
          '<div><strong>' + escHtml(s.nom_service) + '</strong>' + (s.description ? '<div style="font-size:12.5px;color:var(--mu2,#777);">' + escHtml(s.description) + '</div>' : '') + '</div>' +
          '<div style="font-weight:700;white-space:nowrap;margin-left:12px;">' + prix + '</div>' +
        '</div>';
      }).join('')
    : '<div style="color:var(--mu,#999);font-size:13px;">' + T('aucun_service') + '</div>';

  var photosHtml = data.photos.length
    ? '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:14px;">' +
        data.photos.map(function(p){ return '<img src="' + escHtml(p.url_photo) + '" style="width:100%;height:90px;object-fit:cover;border-radius:8px;" alt="' + escHtml(p.legende||'') + '">'; }).join('') +
      '</div>'
    : '';

  var avisHtml = data.avis.length
    ? data.avis.map(function(av) {
        return '<div style="padding:10px 0;border-bottom:1px solid var(--line,#eee);font-size:13px;">' +
          '<strong>' + '★'.repeat(av.note) + '☆'.repeat(5-av.note) + '</strong> — ' + escHtml(av.client_nom) +
          (av.commentaire ? '<div style="color:var(--mu2,#777);margin-top:3px;">' + escHtml(av.commentaire) + '</div>' : '') +
        '</div>';
      }).join('')
    : '<div style="color:var(--mu,#999);font-size:13px;">' + T('aucun_avis') + '</div>';

  return '<div onclick="fermerProfil(event)" style="position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:10001;display:flex;align-items:center;justify-content:center;padding:20px;overflow-y:auto;">' +
    '<div style="background:var(--panel,#fff);border-radius:16px;padding:28px;max-width:560px;width:100%;max-height:85vh;overflow-y:auto;">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;">' +
        '<div style="display:flex;gap:14px;align-items:center;">' + photo +
          '<div><div style="font-family:Fraunces,serif;font-size:19px;font-weight:700;">' + escHtml(a.nom_entreprise) + '</div>' +
          '<div style="font-size:13px;color:var(--mu2,#777);">' + secteurLabel(a.secteur) + ' · 📍 ' + escHtml(a.commune) + '</div>' +
          (a.verifie ? '<span class="badge-trust" style="margin-top:4px;display:inline-block;">✅ ' + T('badge_verifie') + '</span>' : '') +
          '</div>' +
        '</div>' +
        '<button onclick="fermerProfil({target:this,currentTarget:this})" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--mu,#999);">✕</button>' +
      '</div>' +
      (a.bio ? '<p style="font-size:14px;line-height:1.6;margin-bottom:18px;">' + escHtml(a.bio) + '</p>' : '') +
      '<div style="font-weight:700;margin-bottom:6px;">' + T('services_titre') + '</div>' + servicesHtml +
      photosHtml +
      '<div style="font-weight:700;margin:18px 0 6px;">' + T('avis_titre') + (data.note_moyenne ? ' — ' + data.note_moyenne + '/5 (' + data.nb_avis + ')' : '') + '</div>' + avisHtml +
      '<button onclick="ouvrirModalDevis(\'' + a.id + '\',\'' + escHtml(a.nom_entreprise).replace(/'/g,"\\'") + '\')" style="width:100%;margin-top:18px;padding:13px;border-radius:9px;border:none;background:var(--ac,#B5502F);color:#fff;font-size:14px;font-weight:700;cursor:pointer;">' + T('demander_devis') + '</button>' +
    '</div>' +
  '</div>';
}

// ════════════════════════════════════════
//  DEMANDE DE DEVIS
// ════════════════════════════════════════
function ouvrirModalDevis(artisanId, nomArtisan) {
  var div = document.getElementById('modal-devis');
  if (!div) { div = document.createElement('div'); div.id = 'modal-devis'; document.body.appendChild(div); }
  div.innerHTML =
    '<div style="position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:10002;display:flex;align-items:center;justify-content:center;padding:20px;" onclick="if(event.target===this)fermerModalDevis()">' +
      '<div style="background:var(--panel,#fff);border-radius:14px;padding:24px;max-width:440px;width:100%;">' +
        '<div style="font-size:16px;font-weight:700;margin-bottom:4px;">' + T('devis_titre') + '</div>' +
        '<div style="font-size:12px;color:var(--mu2,#777);margin-bottom:16px;">' + (nomArtisan ? T('devis_sub_a') + ' ' + escHtml(nomArtisan) + '. ' : '') + T('devis_sub_suite') + '</div>' +
        '<input id="devis-nom" type="text" placeholder="' + T('ph_nom') + '" style="width:100%;padding:10px 12px;border-radius:9px;border:1px solid var(--line,#ddd);font-family:\'Work Sans\',sans-serif;font-size:13px;box-sizing:border-box;margin-bottom:10px;">' +
        '<input id="devis-tel" type="tel" placeholder="' + T('ph_tel') + '" style="width:100%;padding:10px 12px;border-radius:9px;border:1px solid var(--line,#ddd);font-family:\'Work Sans\',sans-serif;font-size:13px;box-sizing:border-box;margin-bottom:10px;">' +
        '<input id="devis-commune" type="text" placeholder="' + T('ph_commune') + '" style="width:100%;padding:10px 12px;border-radius:9px;border:1px solid var(--line,#ddd);font-family:\'Work Sans\',sans-serif;font-size:13px;box-sizing:border-box;margin-bottom:10px;">' +
        '<textarea id="devis-message" rows="4" placeholder="' + T('ph_message') + '" style="width:100%;padding:10px 12px;border-radius:9px;border:1px solid var(--line,#ddd);font-family:\'Work Sans\',sans-serif;font-size:13px;box-sizing:border-box;resize:vertical;margin-bottom:10px;"></textarea>' +
        '<div id="devis-err" style="display:none;color:var(--danger,#dc2626);font-size:12px;margin-bottom:10px;"></div>' +
        '<div style="display:flex;gap:8px;">' +
          '<button id="btn-devis" onclick="envoyerDemandeDevis(\'' + artisanId + '\')" style="flex:1;padding:11px;border-radius:9px;border:none;background:var(--ac,#B5502F);color:#fff;font-size:13px;font-weight:700;cursor:pointer;">' + T('btn_envoyer') + '</button>' +
          '<button onclick="fermerModalDevis()" style="flex:1;padding:11px;border-radius:9px;border:1px solid var(--line,#ddd);background:transparent;color:var(--mu2,#777);cursor:pointer;">' + T('btn_annuler') + '</button>' +
        '</div>' +
      '</div>' +
    '</div>';
}
function fermerModalDevis() { var div = document.getElementById('modal-devis'); if (div) div.innerHTML = ''; }

async function envoyerDemandeDevis(artisanId) {
  var nom = document.getElementById('devis-nom').value.trim();
  var tel = document.getElementById('devis-tel').value.trim();
  var commune = document.getElementById('devis-commune').value.trim();
  var message = document.getElementById('devis-message').value.trim();
  var err = document.getElementById('devis-err');
  var btn = document.getElementById('btn-devis');

  if (!nom || !tel || !commune || !message) {
    err.textContent = T('err_champs'); err.style.display = 'block'; return;
  }
  btn.disabled = true; btn.textContent = T('btn_envoi_cours');

  try {
    var res = await fetch(SUPABASE_URL + '/functions/v1/soumettre-demande-devis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + SUPABASE_ANON },
      body: JSON.stringify({
        client_nom: nom, client_telephone: tel, commune: commune,
        description_besoin: message, secteur: _searchState.secteur || 'autre',
        artisan_id: artisanId,
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

// ── Init ──
document.addEventListener('DOMContentLoaded', function() {
  var saved = localStorage.getItem('at_lang');
  if (saved && AT_TR[saved]) AT_LANG = saved;
  renderNav();
  renderHero();
  renderResults();
});
