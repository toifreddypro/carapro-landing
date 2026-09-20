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

// Encode une valeur de façon sûre pour l'insérer dans un attribut onclick="...(ICI)" —
// gère absolument tous les caractères spéciaux (apostrophes, guillemets, retours à la
// ligne...), contrairement à un simple remplacement d'apostrophes qui casse facilement.
function jsAttr(val) {
  return JSON.stringify(val == null ? '' : String(val)).replace(/"/g, '&quot;');
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
  try {
    var { data, error } = await sb.from('secteurs').select('*').order('ordre', { ascending: true });
    if (!error && data && data.length) _secteursCache = data;
  } catch (e) { console.warn('Chargement des secteurs échoué, liste de repli utilisée.', e); }
}

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
  appliquerTraductionsStatiques();
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
        '<img src="/apple-touch-icon.png" alt="LearnLogic Studio" style="width:26px;height:26px;border-radius:7px;">' +
        '<div class="nav-brand"><span class="learn">Learn</span><span class="logic">Logic</span> <span class="studio">Studio</span></div>' +
        '<div class="nav-kk"><span class="karuk">Cara</span><span class="connect">Link</span> <span class="nav-kk-suffix">Artisans</span></div>' +
      '</a>' +
      '<div class="nav-links">' +
        /* ⚠️ 17/09 — "Mon espace" pointe directement vers MPA Artisans
        (caralink.app/mpa/), plus vers une page de connexion propre à
        CaraLink Artisans : MPA Artisans gère lui-même l'identification,
        comme demandé par Freddy ("comme CaraLink Formation"). URL à
        confirmer si elle diffère de caralink.app/mpa/. */
        '<a href="https://caralink.app/mpa/" style="padding:6px 14px;border-radius:8px;background:var(--ac);color:#fff;font-weight:700;text-decoration:none;">' + T('nav_mon_espace') + '</a>' +
        '<a href="/artisans/inscription.html" style="padding:6px 14px;border-radius:8px;border:1px solid var(--brd);color:var(--tx);font-weight:600;text-decoration:none;">' + T('nav_devenir_artisan') + '</a>' +
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
        '<div class="hero-tagline">' +
          '<span class="hero-tagline-part">' + T('hero_tag1') + '</span>' +
          '<span class="hero-tagline-sep" aria-hidden="true"></span>' +
          '<span class="hero-tagline-part">' + T('hero_tag2') + '</span>' +
        '</div>' +
        '<p class="hero-note">' + T('hero_note_short') + '</p>' +
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
        '<div style="margin-top:14px;font-size:12.5px;color:var(--mu);">' +
          '📢 <a href="#" onclick="ouvrirModalDevisGeneral();return false;" style="color:var(--ac);font-weight:700;text-decoration:none;">Faire une demande de devis générale</a>' +
          ' — visible par tous les artisans du secteur et de la commune choisis' +
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
      '<div class="partner-panel">' +
        '<div style="font-size:11px;font-weight:700;color:var(--mu2);letter-spacing:.05em;text-transform:uppercase;margin-bottom:10px;">' + T('partner_titre') + '</div>' +
        '<div style="font-size:13px;color:var(--mu);line-height:1.6;">' + T('partner_texte') + '</div>' +
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
  return '<div class="formateur-card" onclick="ouvrirProfil(' + jsAttr(a.id) + ')">' +
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
    _profilDataCourant = data;
    chargerApercuDispo(data.artisan.id);

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
      '<div id="dispo-zone-' + a.id + '" style="margin:16px 0;"><div style="font-size:12.5px;color:var(--mu,#999);">⏳ Vérification des disponibilités…</div></div>' +
      '<div style="font-weight:700;margin:18px 0 6px;">' + T('avis_titre') + (data.note_moyenne ? ' — ' + data.note_moyenne + '/5 (' + data.nb_avis + ')' : '') + '</div>' + avisHtml +
      '<button onclick="ouvrirModalDevis(' + jsAttr(a.id) + ',' + jsAttr(a.nom_entreprise) + ',' + jsAttr(a.secteur) + ')" style="width:100%;margin-top:18px;padding:13px;border-radius:9px;border:none;background:var(--ac,#B5502F);color:#fff;font-size:14px;font-weight:700;cursor:pointer;">' + T('demander_devis') + '</button>' +
    '</div>' +
  '</div>';
}

// ════════════════════════════════════════
//  DISPONIBILITÉS — aperçu + vérification réelle (Smart Dispatch public)
// ════════════════════════════════════════

var _profilDataCourant = null;
window._dispoContexte = null;

function heureVersMinPublic(hhmm) { var p = hhmm.split(':'); return parseInt(p[0],10)*60 + parseInt(p[1],10); }
function minVersHeurePublic(min) { min = Math.max(0, Math.round(min)); var h = Math.floor(min/60), m = min%60; return (h<10?'0':'')+h+':'+(m<10?'0':'')+m; }

async function chargerApercuDispo(artisanId) {
  var zone = document.getElementById('dispo-zone-' + artisanId);
  if (!zone) return;
  try {
    var res = await fetch(SUPABASE_URL + '/functions/v1/verifier-disponibilite-artisan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + SUPABASE_ANON },
      body: JSON.stringify({ mode: 'apercu', artisan_id: artisanId }),
    });
    var data = await res.json();
    if (data.error || !data.prochaine_date) {
      zone.innerHTML = '';
      return;
    }
    zone.innerHTML =
      '<button type="button" onclick="ouvrirVerifDispo(' + jsAttr(artisanId) + ')" style="width:100%;text-align:left;padding:12px 14px;border-radius:10px;border:1px solid var(--ac-brd,#e8c4b8);background:rgba(181,80,47,.06);color:var(--ac,#B5502F);font-size:13.5px;font-weight:700;cursor:pointer;">📅 Prochaine disponibilité : ' + data.label + ' →</button>' +
      '<div style="font-size:11.5px;color:var(--mu,#999);margin-top:5px;text-align:center;"><a href="#" onclick="ouvrirVerifDispo(' + jsAttr(artisanId) + ');return false;" style="color:var(--mu2,#777);">Cliquez ici pour découvrir d\'autres créneaux</a></div>';
  } catch (e) {
    zone.innerHTML = '';
  }
}

function ouvrirVerifDispo(artisanId) {
  var zone = document.getElementById('dispo-zone-' + artisanId);
  if (!zone || !_profilDataCourant) return;
  var services = _profilDataCourant.services || [];
  var options = services.map(function(s) {
    return '<option value="' + (s.id || '') + '" data-duree="' + (s.duree_estimee_min || 60) + '">' + escHtml(s.nom_service) + '</option>';
  }).join('');
  zone.innerHTML =
    '<div style="border:1px solid var(--line,#eee);border-radius:10px;padding:14px;">' +
      '<div style="font-size:12px;color:var(--mu2,#777);margin-bottom:10px;">CaraLink calcule les disponibilités réelles en tenant compte des trajets de l\'artisan — indiquez où l\'intervention doit avoir lieu.</div>' +
      (options ? '<select id="dispo-service" style="width:100%;padding:9px 10px;border-radius:8px;border:1px solid var(--line,#ddd);margin-bottom:8px;box-sizing:border-box;">' + options + '</select>' : '') +
      '<input id="dispo-adresse" type="text" placeholder="Adresse de l\'intervention" style="width:100%;padding:9px 10px;border-radius:8px;border:1px solid var(--line,#ddd);margin-bottom:8px;box-sizing:border-box;">' +
      '<div style="display:flex;gap:8px;margin-bottom:8px;">' +
        '<input id="dispo-cp" type="text" placeholder="Code postal" style="flex:1;padding:9px 10px;border-radius:8px;border:1px solid var(--line,#ddd);box-sizing:border-box;">' +
        '<input id="dispo-commune" type="text" placeholder="Commune" style="flex:2;padding:9px 10px;border-radius:8px;border:1px solid var(--line,#ddd);box-sizing:border-box;">' +
      '</div>' +
      '<button type="button" onclick="verifierDispoReelle(' + jsAttr(artisanId) + ')" style="width:100%;padding:10px;border-radius:8px;border:none;background:var(--ac,#B5502F);color:#fff;font-weight:700;cursor:pointer;">Vérifier la disponibilité</button>' +
      '<div id="dispo-resultat" style="margin-top:10px;"></div>' +
    '</div>';
}

async function verifierDispoReelle(artisanId, dateDebut) {
  var resultat = document.getElementById('dispo-resultat');
  var adresse, cp, commune, dureeMin, serviceId;

  if (dateDebut && window._dispoContexte) {
    // Navigation semaine suivante/précédente : on réutilise le contexte déjà validé
    adresse = window._dispoContexte.adresse; cp = window._dispoContexte.cp; commune = window._dispoContexte.commune;
    dureeMin = window._dispoContexte.duree; serviceId = window._dispoContexte.serviceId;
  } else {
    adresse = document.getElementById('dispo-adresse').value.trim();
    cp = document.getElementById('dispo-cp').value.trim();
    commune = document.getElementById('dispo-commune').value.trim();
    if (!adresse || !commune) { resultat.innerHTML = '<div style="color:var(--danger,#dc2626);font-size:12.5px;">Adresse et commune obligatoires.</div>'; return; }
    var selService = document.getElementById('dispo-service');
    dureeMin = selService ? parseInt(selService.selectedOptions[0].getAttribute('data-duree'), 10) : 60;
    serviceId = selService ? selService.value : null;
    if (!serviceId || serviceId === 'undefined' || serviceId === 'null') serviceId = null;
  }

  resultat.innerHTML = '<div style="font-size:12.5px;color:var(--mu,#999);">⏳ Calcul en cours, ça peut prendre quelques secondes…</div>';
  try {
    var res = await fetch(SUPABASE_URL + '/functions/v1/verifier-disponibilite-artisan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + SUPABASE_ANON },
      body: JSON.stringify({ mode: 'creneaux', artisan_id: artisanId, adresse: adresse, code_postal: cp, commune: commune, duree_min: dureeMin, date_debut: dateDebut || undefined }),
    });
    var data = await res.json();
    if (data.error) { resultat.innerHTML = '<div style="color:var(--danger,#dc2626);font-size:12.5px;">' + escHtml(data.error) + '</div>'; return; }

    window._dispoContexte = {
      artisanId: artisanId, adresse: adresse, cp: cp, commune: commune, serviceId: serviceId, duree: dureeMin,
      secteur: (_profilDataCourant && _profilDataCourant.artisan.secteur) || 'autre',
      latitude: data.latitude, longitude: data.longitude, dateDebutFenetre: data.date_debut_fenetre,
    };

    var auMoinsUnCreneau = data.jours.some(function(j) { return j.creneaux.length > 0; });
    var grille = '<div style="display:flex;align-items:stretch;gap:4px;">' +
      '<button type="button" onclick="' + (data.peut_reculer ? "naviguerSemaineDispo(-1)" : '') + '" ' + (data.peut_reculer ? '' : 'disabled') + ' style="border:none;background:none;font-size:20px;color:' + (data.peut_reculer ? 'var(--ac,#B5502F)' : 'var(--line,#ddd)') + ';cursor:' + (data.peut_reculer ? 'pointer' : 'default') + ';padding:0 4px;">‹</button>' +
      '<div style="flex:1;display:grid;grid-template-columns:repeat(' + data.jours.length + ',1fr);gap:4px;">' +
        data.jours.map(function(j) {
          var dateAff = new Date(j.date + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long' });
          return '<div style="text-align:center;">' +
            '<div style="font-size:10.5px;font-weight:700;text-transform:capitalize;color:var(--mu2,#555);">' + dateAff + '</div>' +
            '<div style="font-size:10.5px;color:var(--mu,#999);margin-bottom:6px;">' + j.jour_num + ' ' + j.mois_label + '</div>' +
            (j.creneaux.length
              ? j.creneaux.map(function(h) {
                  return '<button type="button" onclick="choisirCreneauPublic(' + jsAttr(j.date) + ',' + jsAttr(h) + ')" style="display:block;width:100%;padding:5px 2px;margin-bottom:4px;border-radius:6px;border:1px solid var(--ac-brd,#e8c4b8);background:#eef7f2;color:var(--ac,#B5502F);font-weight:700;font-size:11.5px;cursor:pointer;">' + h + '</button>';
                }).join('')
              : '<div style="color:var(--line,#ccc);font-size:13px;padding:5px 0;">—</div>') +
          '</div>';
        }).join('') +
      '</div>' +
      '<button type="button" onclick="' + (data.peut_avancer ? "naviguerSemaineDispo(1)" : '') + '" ' + (data.peut_avancer ? '' : 'disabled') + ' style="border:none;background:none;font-size:20px;color:' + (data.peut_avancer ? 'var(--ac,#B5502F)' : 'var(--line,#ddd)') + ';cursor:' + (data.peut_avancer ? 'pointer' : 'default') + ';padding:0 4px;">›</button>' +
    '</div>';

    resultat.innerHTML = grille + (auMoinsUnCreneau ? '' : '<div style="font-size:11.5px;color:var(--mu,#999);text-align:center;margin-top:8px;">Rien sur cette période — essayez la semaine suivante, ou « Demander un devis » pour convenir d\'une date directement.</div>');
  } catch (e) {
    resultat.innerHTML = '<div style="color:var(--danger,#dc2626);font-size:12.5px;">Erreur de connexion, réessayez.</div>';
  }
}

function naviguerSemaineDispo(direction) {
  var ctx = window._dispoContexte;
  if (!ctx) return;
  var d = new Date(ctx.dateDebutFenetre + 'T00:00:00');
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

function ouvrirModalCreneau() {
  var ctx = window._dispoContexte;
  if (!ctx) return;
  _devisPhotos = [];
  var div = document.getElementById('modal-devis');
  if (!div) { div = document.createElement('div'); div.id = 'modal-devis'; document.body.appendChild(div); }
  var dateAff = new Date(ctx.date + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  div.innerHTML =
    '<div style="position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:10002;display:flex;align-items:center;justify-content:center;padding:20px;" onclick="if(event.target===this)fermerModalDevis()">' +
      '<div style="background:var(--panel,#fff);border-radius:14px;padding:24px;max-width:440px;width:100%;">' +
        '<div style="font-size:16px;font-weight:700;margin-bottom:4px;">📅 Confirmer ce créneau</div>' +
        '<div style="font-size:12.5px;color:var(--mu2,#777);margin-bottom:16px;text-transform:capitalize;">' + dateAff + ' à ' + ctx.heureDebut + ' — ' + escHtml(ctx.adresse) + '</div>' +
        '<input id="devis-nom" type="text" placeholder="' + T('ph_nom') + '" style="width:100%;padding:10px 12px;border-radius:9px;border:1px solid var(--line,#ddd);font-family:\'Work Sans\',sans-serif;font-size:13px;box-sizing:border-box;margin-bottom:10px;">' +
        '<input id="devis-tel" type="tel" placeholder="' + T('ph_tel') + '" style="width:100%;padding:10px 12px;border-radius:9px;border:1px solid var(--line,#ddd);font-family:\'Work Sans\',sans-serif;font-size:13px;box-sizing:border-box;margin-bottom:10px;">' +
        '<input id="devis-email" type="email" placeholder="Email (optionnel — pour recevoir la confirmation automatiquement)" style="width:100%;padding:10px 12px;border-radius:9px;border:1px solid var(--line,#ddd);font-family:\'Work Sans\',sans-serif;font-size:13px;box-sizing:border-box;margin-bottom:10px;">' +
        '<textarea id="devis-message" rows="3" placeholder="Précisions pour l\'artisan (optionnel)" style="width:100%;padding:10px 12px;border-radius:9px;border:1px solid var(--line,#ddd);font-family:\'Work Sans\',sans-serif;font-size:13px;box-sizing:border-box;resize:vertical;margin-bottom:10px;"></textarea>' +
        photosPickerHTML() +
        '<div id="devis-err" style="display:none;color:var(--danger,#dc2626);font-size:12px;margin-bottom:10px;"></div>' +
        '<div style="display:flex;gap:8px;">' +
          '<button id="btn-devis" onclick="envoyerCreneauDevis()" style="flex:1;padding:11px;border-radius:9px;border:none;background:#16a34a;color:#fff;font-size:13px;font-weight:700;cursor:pointer;">Envoyer à l\'artisan</button>' +
          '<button onclick="fermerModalDevis()" style="flex:1;padding:11px;border-radius:9px;border:1px solid var(--line,#ddd);background:transparent;color:var(--mu2,#777);cursor:pointer;">Annuler</button>' +
        '</div>' +
      '</div>' +
    '</div>';
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
  btn.disabled = true; btn.textContent = T('btn_envoi_cours');

  try {
    var res = await fetch(SUPABASE_URL + '/functions/v1/soumettre-demande-devis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + SUPABASE_ANON },
      body: JSON.stringify({
        client_nom: nom, client_telephone: tel, client_email: email || null, contact_prefere: email ? 'email' : 'telephone',
        commune: ctx.commune, description_besoin: message, secteur: ctx.secteur, photos: _devisPhotos,
        artisan_id: ctx.artisanId,
        date_intervention: ctx.date, heure_debut: ctx.heureDebut, heure_fin: ctx.heureFin,
        adresse: ctx.adresse, code_postal: ctx.cp, service_id: ctx.serviceId,
        latitude: ctx.latitude, longitude: ctx.longitude,
      }),
    });
    var data = await res.json();
    if (data.error) throw new Error(data.error);

    fermerModalDevis();
    fermerProfil({ target: null, currentTarget: null });
    showToast('Votre demande a été envoyée à l\'artisan — vous recevrez une confirmation dès qu\'il aura validé.');
  } catch (e) {
    err.textContent = e.message; err.style.display = 'block';
    btn.disabled = false; btn.textContent = 'Envoyer à l\'artisan';
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

function photosPickerHTML() {
  return '<div style="margin-bottom:10px;">' +
      '<div style="font-size:11.5px;font-weight:600;color:var(--mu2,#777);margin-bottom:6px;">📷 Une ou plusieurs photos (optionnel)</div>' +
      '<input type="file" id="devis-photos-input" accept="image/*" multiple style="display:none;" onchange="ajouterPhotosDevis(this.files)">' +
      '<button type="button" onclick="document.getElementById(\'devis-photos-input\').click()" style="width:100%;padding:9px;border-radius:8px;border:1.5px dashed var(--line,#ddd);background:transparent;color:var(--mu2,#777);font-size:12.5px;font-weight:600;cursor:pointer;">+ Ajouter des photos — ça aide l\'artisan à évaluer le travail</button>' +
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
      '<img src="' + url + '" style="width:56px;height:56px;object-fit:cover;border-radius:8px;border:1px solid var(--line,#ddd);">' +
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
      '<div style="font-size:11.5px;font-weight:600;color:var(--mu2,#777);margin-bottom:6px;">Comment souhaitez-vous être recontacté(e) ?</div>' +
      '<div style="display:flex;gap:8px;">' +
        '<button type="button" id="pref-tel-btn" onclick="choisirContactPref(\'telephone\')" style="flex:1;padding:8px;border-radius:8px;border:1.5px solid var(--ac,#B5502F);background:var(--ac,#B5502F);color:#fff;font-size:12.5px;font-weight:600;cursor:pointer;">📞 Téléphone</button>' +
        '<button type="button" id="pref-email-btn" onclick="choisirContactPref(\'email\')" style="flex:1;padding:8px;border-radius:8px;border:1.5px solid var(--line,#ddd);background:transparent;color:var(--mu2,#777);font-size:12.5px;font-weight:600;cursor:pointer;">📧 Email</button>' +
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
  btnTel.style.background = pref === 'telephone' ? 'var(--ac,#B5502F)' : 'transparent';
  btnTel.style.color = pref === 'telephone' ? '#fff' : 'var(--mu2,#777)';
  btnTel.style.borderColor = pref === 'telephone' ? 'var(--ac,#B5502F)' : 'var(--line,#ddd)';
  btnEmail.style.background = pref === 'email' ? 'var(--ac,#B5502F)' : 'transparent';
  btnEmail.style.color = pref === 'email' ? '#fff' : 'var(--mu2,#777)';
  btnEmail.style.borderColor = pref === 'email' ? 'var(--ac,#B5502F)' : 'var(--line,#ddd)';
  if (champEmail) champEmail.style.display = pref === 'email' ? 'block' : 'none';
}

function ouvrirModalDevis(artisanId, nomArtisan, secteurArtisan) {
  _devisContactPref = 'telephone'; // réinitialisé à chaque ouverture
  _devisPhotos = []; document.getElementById('devis-photos-preview') && (document.getElementById('devis-photos-preview').innerHTML = '');
  var div = document.getElementById('modal-devis');
  if (!div) { div = document.createElement('div'); div.id = 'modal-devis'; document.body.appendChild(div); }
  div.innerHTML =
    '<div style="position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:10002;display:flex;align-items:center;justify-content:center;padding:20px;" onclick="if(event.target===this)fermerModalDevis()">' +
      '<div style="background:var(--panel,#fff);border-radius:14px;padding:24px;max-width:440px;width:100%;">' +
        '<div style="font-size:16px;font-weight:700;margin-bottom:4px;">' + T('devis_titre') + '</div>' +
        '<div style="font-size:12px;color:var(--mu2,#777);margin-bottom:16px;">' + (nomArtisan ? T('devis_sub_a') + ' ' + escHtml(nomArtisan) + '. ' : '') + T('devis_sub_suite') + '</div>' +
        '<input id="devis-nom" type="text" placeholder="' + T('ph_nom') + '" style="width:100%;padding:10px 12px;border-radius:9px;border:1px solid var(--line,#ddd);font-family:\'Work Sans\',sans-serif;font-size:13px;box-sizing:border-box;margin-bottom:10px;">' +
        '<input id="devis-tel" type="tel" placeholder="' + T('ph_tel') + '" style="width:100%;padding:10px 12px;border-radius:9px;border:1px solid var(--line,#ddd);font-family:\'Work Sans\',sans-serif;font-size:13px;box-sizing:border-box;margin-bottom:10px;">' +
        contactPrefHTML() +
        '<input id="devis-commune" type="text" placeholder="' + T('ph_commune') + '" style="width:100%;padding:10px 12px;border-radius:9px;border:1px solid var(--line,#ddd);font-family:\'Work Sans\',sans-serif;font-size:13px;box-sizing:border-box;margin-bottom:10px;">' +
        '<textarea id="devis-message" rows="4" placeholder="' + T('ph_message') + '" style="width:100%;padding:10px 12px;border-radius:9px;border:1px solid var(--line,#ddd);font-family:\'Work Sans\',sans-serif;font-size:13px;box-sizing:border-box;resize:vertical;margin-bottom:10px;"></textarea>' +
        photosPickerHTML() +
        '<div id="devis-err" style="display:none;color:var(--danger,#dc2626);font-size:12px;margin-bottom:10px;"></div>' +
        '<div style="display:flex;gap:8px;">' +
          '<button id="btn-devis" onclick="envoyerDemandeDevis(' + jsAttr(artisanId) + ',' + jsAttr(secteurArtisan||'autre') + ')" style="flex:1;padding:11px;border-radius:9px;border:none;background:var(--ac,#B5502F);color:#fff;font-size:13px;font-weight:700;cursor:pointer;">' + T('btn_envoyer') + '</button>' +
          '<button onclick="fermerModalDevis()" style="flex:1;padding:11px;border-radius:9px;border:1px solid var(--line,#ddd);background:transparent;color:var(--mu2,#777);cursor:pointer;">' + T('btn_annuler') + '</button>' +
        '</div>' +
      '</div>' +
    '</div>';
}
function fermerModalDevis() { var div = document.getElementById('modal-devis'); if (div) div.innerHTML = ''; }

// ── Demande générale (hors fiche) — ouverte à tous les artisans du secteur/commune ──
function ouvrirModalDevisGeneral() {
  _devisContactPref = 'telephone'; // réinitialisé à chaque ouverture
  _devisPhotos = []; document.getElementById('devis-photos-preview') && (document.getElementById('devis-photos-preview').innerHTML = '');
  var div = document.getElementById('modal-devis');
  if (!div) { div = document.createElement('div'); div.id = 'modal-devis'; document.body.appendChild(div); }
  var champLabel = secteurLabelChamp();
  var options = _secteursCache.map(function(s) {
    return '<option value="' + escHtml(s.code) + '">' + (s.icon||'') + ' ' + escHtml(s[champLabel] || s.label_fr) + '</option>';
  }).join('');
  div.innerHTML =
    '<div style="position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:10002;display:flex;align-items:center;justify-content:center;padding:20px;" onclick="if(event.target===this)fermerModalDevis()">' +
      '<div style="background:var(--panel,#fff);border-radius:14px;padding:24px;max-width:440px;width:100%;">' +
        '<div style="font-size:16px;font-weight:700;margin-bottom:4px;">📢 Demande de devis générale</div>' +
        '<div style="font-size:12px;color:var(--mu2,#777);margin-bottom:16px;">Votre demande sera visible par tous les artisans du secteur et de la commune choisis — idéal pour comparer plusieurs devis.</div>' +
        '<select id="devis-secteur" style="width:100%;padding:10px 12px;border-radius:9px;border:1px solid var(--line,#ddd);font-family:\'Outfit\',sans-serif;font-size:13px;box-sizing:border-box;margin-bottom:6px;">' + options + '</select>' +
        '<div style="font-size:11px;color:var(--mu,#999);margin-bottom:10px;">Vous ne voyez pas votre secteur ? <a href="mailto:contact@learnlogicstudio.com" style="color:var(--ac);">Écrivez-nous</a> pour qu\'on l\'ajoute.</div>' +
        '<input id="devis-nom" type="text" placeholder="' + T('ph_nom') + '" style="width:100%;padding:10px 12px;border-radius:9px;border:1px solid var(--line,#ddd);font-family:\'Work Sans\',sans-serif;font-size:13px;box-sizing:border-box;margin-bottom:10px;">' +
        '<input id="devis-tel" type="tel" placeholder="' + T('ph_tel') + '" style="width:100%;padding:10px 12px;border-radius:9px;border:1px solid var(--line,#ddd);font-family:\'Work Sans\',sans-serif;font-size:13px;box-sizing:border-box;margin-bottom:10px;">' +
        contactPrefHTML() +
        '<input id="devis-commune" type="text" placeholder="' + T('ph_commune') + '" style="width:100%;padding:10px 12px;border-radius:9px;border:1px solid var(--line,#ddd);font-family:\'Work Sans\',sans-serif;font-size:13px;box-sizing:border-box;margin-bottom:10px;">' +
        '<textarea id="devis-message" rows="4" placeholder="' + T('ph_message') + '" style="width:100%;padding:10px 12px;border-radius:9px;border:1px solid var(--line,#ddd);font-family:\'Work Sans\',sans-serif;font-size:13px;box-sizing:border-box;resize:vertical;margin-bottom:10px;"></textarea>' +
        photosPickerHTML() +
        '<div id="devis-err" style="display:none;color:var(--danger,#dc2626);font-size:12px;margin-bottom:10px;"></div>' +
        '<div style="display:flex;gap:8px;">' +
          '<button id="btn-devis" onclick="envoyerDemandeDevisGenerale()" style="flex:1;padding:11px;border-radius:9px;border:none;background:var(--ac,#B5502F);color:#fff;font-size:13px;font-weight:700;cursor:pointer;">' + T('btn_envoyer') + '</button>' +
          '<button onclick="fermerModalDevis()" style="flex:1;padding:11px;border-radius:9px;border:1px solid var(--line,#ddd);background:transparent;color:var(--mu2,#777);cursor:pointer;">' + T('btn_annuler') + '</button>' +
        '</div>' +
      '</div>' +
    '</div>';
}

async function envoyerDemandeDevisGenerale() {
  var secteur = document.getElementById('devis-secteur').value;
  var nom = document.getElementById('devis-nom').value.trim();
  var tel = document.getElementById('devis-tel').value.trim();
  var email = document.getElementById('devis-email').value.trim();
  var commune = document.getElementById('devis-commune').value.trim();
  var message = document.getElementById('devis-message').value.trim();
  var err = document.getElementById('devis-err');
  var btn = document.getElementById('btn-devis');

  if (!nom || !tel || !commune || !message) {
    err.textContent = T('err_champs'); err.style.display = 'block'; return;
  }
  if (_devisContactPref === 'email' && !email) {
    err.textContent = 'Merci de renseigner votre email — vous avez choisi d\'être recontacté(e) par ce canal.'; err.style.display = 'block'; return;
  }
  btn.disabled = true; btn.textContent = T('btn_envoi_cours');

  try {
    var res = await fetch(SUPABASE_URL + '/functions/v1/soumettre-demande-devis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + SUPABASE_ANON },
      body: JSON.stringify({
        client_nom: nom, client_telephone: tel, client_email: email || null, contact_prefere: _devisContactPref,
        commune: commune, description_besoin: message, secteur: secteur, photos: _devisPhotos,
        // pas d'artisan_id : demande ouverte, visible par tous les artisans du secteur/commune
      }),
    });
    var data = await res.json();
    if (data.error) throw new Error(data.error);

    fermerModalDevis();
    showToast(T('toast_envoye'));
  } catch(e) {
    err.textContent = e.message; err.style.display = 'block';
    btn.disabled = false; btn.textContent = T('btn_envoyer');
  }
}

async function envoyerDemandeDevis(artisanId, secteurArtisan) {
  var nom = document.getElementById('devis-nom').value.trim();
  var tel = document.getElementById('devis-tel').value.trim();
  var email = document.getElementById('devis-email').value.trim();
  var commune = document.getElementById('devis-commune').value.trim();
  var message = document.getElementById('devis-message').value.trim();
  var err = document.getElementById('devis-err');
  var btn = document.getElementById('btn-devis');

  if (!nom || !tel || !commune || !message) {
    err.textContent = T('err_champs'); err.style.display = 'block'; return;
  }
  if (_devisContactPref === 'email' && !email) {
    err.textContent = 'Merci de renseigner votre email — vous avez choisi d\'être recontacté(e) par ce canal.'; err.style.display = 'block'; return;
  }
  btn.disabled = true; btn.textContent = T('btn_envoi_cours');

  try {
    var res = await fetch(SUPABASE_URL + '/functions/v1/soumettre-demande-devis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + SUPABASE_ANON },
      body: JSON.stringify({
        client_nom: nom, client_telephone: tel, client_email: email || null, contact_prefere: _devisContactPref,
        commune: commune, description_besoin: message, secteur: secteurArtisan || 'autre', photos: _devisPhotos,
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

// ════════════════════════════════════════
//  MODALS LÉGALES
// ⚠️ Ajouté le 15/09 — les liens du footer appelaient openLegal(),
// jamais définie nulle part : liens cassés depuis le début. Corrigé en
// alignant sur le vrai nom utilisé par CaraLink Formation
// (ouvrirModalLegal), avec du contenu propre à Artisans.
// ════════════════════════════════════════
var LEGAL_CONTENT_ARTISANS = {
  mentions: {
    fr: { titre: 'Mentions légales', contenu:
      '<h3>Éditeur du site</h3><p>Le site <strong>CaraLink Artisans</strong> est édité par LearnLogic Studio (SIRET 832 640 858 000 29), 971 Guadeloupe, France.</p>' +
      '<h3>Contact</h3><p><a href="mailto:contact@learnlogicstudio.com">contact@learnlogicstudio.com</a></p>' +
      '<h3>Hébergement</h3><p>Le site est hébergé par Vercel Inc. La base de données est hébergée par Supabase Inc.</p>' },
    en: { titre: 'Legal notice', contenu:
      '<h3>Publisher</h3><p>The <strong>CaraLink Artisans</strong> website is published by LearnLogic Studio (SIRET 832 640 858 000 29), 971 Guadeloupe, France.</p>' +
      '<h3>Contact</h3><p><a href="mailto:contact@learnlogicstudio.com">contact@learnlogicstudio.com</a></p>' +
      '<h3>Hosting</h3><p>The site is hosted by Vercel Inc. The database is hosted by Supabase Inc.</p>' },
    es: { titre: 'Aviso legal', contenu:
      '<h3>Editor</h3><p>El sitio <strong>CaraLink Artisans</strong> está editado por LearnLogic Studio (SIRET 832 640 858 000 29), 971 Guadalupe, Francia.</p>' +
      '<h3>Contacto</h3><p><a href="mailto:contact@learnlogicstudio.com">contact@learnlogicstudio.com</a></p>' +
      '<h3>Alojamiento</h3><p>El sitio está alojado por Vercel Inc. La base de datos está alojada por Supabase Inc.</p>' },
  },
  cgu: {
    fr: { titre: 'Conditions générales d\'utilisation', contenu:
      '<p>Les présentes CGU définissent les conditions d\'accès et d\'utilisation de CaraLink Artisans, l\'annuaire de mise en relation entre clients et artisans, édité par LearnLogic Studio (SIRET 832 640 858 000 29).</p>' +
      '<h3>Gratuité</h3><p>L\'annuaire, la recherche et la demande de devis sont entièrement gratuits.</p>' +
      '<h3>Responsabilité</h3><p>CaraLink Artisans met en relation clients et artisans mais n\'est pas partie au contrat conclu entre eux. La plateforme ne garantit pas la qualité des prestations réalisées par les artisans référencés.</p>' +
      '<h3>Vérification des artisans</h3><p>Le SIRET est vérifié automatiquement auprès du registre officiel des entreprises. Les documents d\'assurance sont examinés manuellement mais leur validité continue reste de la responsabilité de l\'artisan.</p>' },
    en: { titre: 'Terms of Service', contenu:
      '<p>These Terms of Service define the conditions of access to and use of CaraLink Artisans, the directory connecting clients and craftsmen, published by LearnLogic Studio (SIRET 832 640 858 000 29).</p>' +
      '<h3>Free of charge</h3><p>The directory, search and quote requests are entirely free.</p>' +
      '<h3>Liability</h3><p>CaraLink Artisans connects clients and craftsmen but is not a party to the contract between them. The platform does not guarantee the quality of work performed by listed craftsmen.</p>' +
      '<h3>Craftsman verification</h3><p>SIRET is automatically verified against the official business register. Insurance documents are manually reviewed, but their continued validity remains the craftsman\'s responsibility.</p>' },
    es: { titre: 'Condiciones generales de uso', contenu:
      '<p>Las presentes CGU definen las condiciones de acceso y uso de CaraLink Artisans, el directorio que conecta clientes y artesanos, editado por LearnLogic Studio (SIRET 832 640 858 000 29).</p>' +
      '<h3>Gratuidad</h3><p>El directorio, la búsqueda y las solicitudes de presupuesto son completamente gratuitos.</p>' +
      '<h3>Responsabilidad</h3><p>CaraLink Artisans conecta clientes y artesanos, pero no es parte del contrato entre ellos. La plataforma no garantiza la calidad de los trabajos realizados por los artesanos listados.</p>' +
      '<h3>Verificación de artesanos</h3><p>El SIRET se verifica automáticamente en el registro oficial de empresas. Los documentos de seguro se revisan manualmente, pero su validez continua sigue siendo responsabilidad del artesano.</p>' },
  },
  privacy: {
    fr: { titre: 'Confidentialité', contenu:
      '<p>Vos données sont hébergées sur une infrastructure sécurisée, avec des règles d\'accès strictes — chaque utilisateur n\'accède qu\'à ses propres données.</p>' +
      '<p>Votre téléphone et votre email ne sont jamais affichés publiquement — ils ne sont partagés qu\'au moment d\'une demande de devis.</p>' +
      '<p>CaraLink Artisans ne vend jamais vos données à des tiers.</p>' },
    en: { titre: 'Privacy', contenu:
      '<p>Your data is hosted on secure infrastructure, with strict access rules — each user only accesses their own data.</p>' +
      '<p>Your phone number and email are never shown publicly — they are only shared when a quote is requested.</p>' +
      '<p>CaraLink Artisans never sells your data to third parties.</p>' },
    es: { titre: 'Privacidad', contenu:
      '<p>Tus datos están alojados en una infraestructura segura, con normas de acceso estrictas — cada usuario solo accede a sus propios datos.</p>' +
      '<p>Tu teléfono y correo electrónico nunca se muestran públicamente — solo se comparten en el momento de una solicitud de presupuesto.</p>' +
      '<p>CaraLink Artisans nunca vende tus datos a terceros.</p>' },
  },
  cookies: {
    fr: { titre: 'Cookies', contenu:
      '<p>Ce site utilise uniquement des cookies techniques nécessaires à son fonctionnement (préférence de langue, session de connexion). Aucun cookie publicitaire ou de tracking tiers.</p>' },
    en: { titre: 'Cookies', contenu:
      '<p>This site only uses technical cookies necessary for its operation (language preference, login session). No advertising or third-party tracking cookies.</p>' },
    es: { titre: 'Cookies', contenu:
      '<p>Este sitio solo utiliza cookies técnicas necesarias para su funcionamiento (preferencia de idioma, sesión de conexión). Sin cookies publicitarias ni de seguimiento de terceros.</p>' },
  },
};

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
        '<button onclick="document.getElementById(\'modal-legal\').remove()" style="padding:9px 24px;border-radius:8px;border:none;background:var(--ac,#B5502F);color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:Outfit,sans-serif;">' + (AT_LANG==='en'?'Close':AT_LANG==='es'?'Cerrar':'Fermer') + '</button>' +
      '</div>' +
    '</div>';

  if (!document.getElementById('legal-styles-artisans')) {
    var style = document.createElement('style');
    style.id = 'legal-styles-artisans';
    style.textContent = '.legal-content-artisans h3{font-size:14px;font-weight:700;color:var(--ink,#13223c);margin:16px 0 6px;}.legal-content-artisans p{margin-bottom:10px;}.legal-content-artisans a{color:var(--ac,#B5502F);}';
    document.head.appendChild(style);
  }

  document.body.appendChild(div);
}

// ── Init ──
document.addEventListener('DOMContentLoaded', async function() {
  await chargerSecteurs();
  renderNav();
  renderHero();
  renderResults();
});
