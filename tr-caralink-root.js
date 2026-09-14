// ═══════════════════════════════════════════════════════════
// CaraLink — tr-caralink-root.js
// Propriété : TOI Freddy
// Traductions FR / EN / ES de la landing caralink.app (racine)
// ═══════════════════════════════════════════════════════════

var CR_LANG = 'fr';

var CR_TR = {
  fr: {
    qui_sommes: "Qui sommes-nous ?",
    hero_eyebrow: "<span class=\"dot-pulse\"></span>Logique · Organisation · Performance",
    hero_title: "La <span class=\"accent\">puissance</span> d'un écosystème. La <span class=\"accent\">simplicité</span> d'une solution.",
    hero_sub: "Des outils intelligents pensés pour simplifier le travail des professionnels et indépendants.",
    hero_note: "Par des passionnés pour des passionnés avec l'aide de professionnels du terrain.",
    badge1: "🇬🇵 100% Antilles-Guyane",
    badge2: "🛡️ Sécurité & confiance",
    badge3: "🤖 IA intégrée",
    formation_titre: "CaraLink Formation",
    formation_sub: "Centres de formation à la recherche de formateurs disponibles.",
    alternance_titre: "CaraLink Alternance",
    alternance_sub: "Candidats à l'alternance, entreprises et centres — la mise en relation qui simplifie tout.",
    artisans_titre: "CaraLink Artisans",
    artisans_sub: "Trouvez un artisan de confiance près de chez vous — jardinage, plomberie, électricité…",
    decouvrir: "Découvrir →",
    footer_tagline: "Logique · Organisation · Performance",
    footer_rights: "© 2026 CaraLink. Tous droits réservés.",
    footer_mentions: "Mentions légales",
    footer_confidentialite: "Confidentialité",
    footer_contact: "Contact",
  },
  en: {
    qui_sommes: "About us",
    hero_eyebrow: "<span class=\"dot-pulse\"></span>Logic · Organization · Performance",
    hero_title: "The <span class=\"accent\">power</span> of an ecosystem. The <span class=\"accent\">simplicity</span> of a solution.",
    hero_sub: "Smart tools designed to simplify the work of professionals and independents.",
    hero_note: "By enthusiasts for enthusiasts, with the help of field professionals.",
    badge1: "🇬🇵 100% Caribbean-based",
    badge2: "🛡️ Security & trust",
    badge3: "🤖 Built-in AI",
    formation_titre: "CaraLink Formation",
    formation_sub: "Training centers looking for available trainers.",
    alternance_titre: "CaraLink Alternance",
    alternance_sub: "Apprenticeship candidates, companies and training centers — matching made simple.",
    artisans_titre: "CaraLink Artisans",
    artisans_sub: "Find a trusted craftsman near you — gardening, plumbing, electrical work…",
    decouvrir: "Discover →",
    footer_tagline: "Logic · Organization · Performance",
    footer_rights: "© 2026 CaraLink. All rights reserved.",
    footer_mentions: "Legal notice",
    footer_confidentialite: "Privacy",
    footer_contact: "Contact",
  },
  es: {
    qui_sommes: "Quiénes somos",
    hero_eyebrow: "<span class=\"dot-pulse\"></span>Lógica · Organización · Rendimiento",
    hero_title: "La <span class=\"accent\">potencia</span> de un ecosistema. La <span class=\"accent\">simplicidad</span> de una solución.",
    hero_sub: "Herramientas inteligentes pensadas para simplificar el trabajo de profesionales e independientes.",
    hero_note: "Por apasionados para apasionados, con la ayuda de profesionales del terreno.",
    badge1: "🇬🇵 100% Antillas-Guayana",
    badge2: "🛡️ Seguridad y confianza",
    badge3: "🤖 IA integrada",
    formation_titre: "CaraLink Formation",
    formation_sub: "Centros de formación en búsqueda de formadores disponibles.",
    alternance_titre: "CaraLink Alternance",
    alternance_sub: "Candidatos a la alternancia, empresas y centros — la puesta en contacto que simplifica todo.",
    artisans_titre: "CaraLink Artisans",
    artisans_sub: "Encuentra un artesano de confianza cerca de ti — jardinería, fontanería, electricidad…",
    decouvrir: "Descubrir →",
    footer_tagline: "Lógica · Organización · Rendimiento",
    footer_rights: "© 2026 CaraLink. Todos los derechos reservados.",
    footer_mentions: "Aviso legal",
    footer_confidentialite: "Privacidad",
    footer_contact: "Contacto",
  }
};

function setLangRoot(lang) {
  if (!CR_TR[lang]) return;
  CR_LANG = lang;
  localStorage.setItem('cr_lang', lang);

  var T = CR_TR[lang];
  document.querySelectorAll('[data-i18n]').forEach(function(el) {
    var key = el.getAttribute('data-i18n');
    if (T[key]) el.innerHTML = T[key];
  });
  document.documentElement.lang = lang;

  var drapeaux = { fr: 'flag-fr', en: 'flag-gb', es: 'flag-es' };
  var noms = { fr: 'Français', en: 'English', es: 'Español' };
  var btn = document.getElementById('lang-dropdown-btn-root');
  if (btn) btn.innerHTML = '<span class="flag-swatch ' + drapeaux[lang] + '"></span> ' + noms[lang];
  document.querySelectorAll('.lang-item-root').forEach(function(el) {
    el.classList.toggle('active', el.dataset.lang === lang);
  });
}

function toggleLangMenuRoot(ev) {
  if (ev) ev.stopPropagation();
  var menu = document.getElementById('lang-dropdown-menu-root');
  if (menu) menu.style.display = (menu.style.display === 'block') ? 'none' : 'block';
}

document.addEventListener('click', function(e) {
  var menu = document.getElementById('lang-dropdown-menu-root');
  if (menu && !e.target.closest('.lang-dropdown-wrap-root')) menu.style.display = 'none';
});

(function() {
  var saved = localStorage.getItem('cr_lang');
  if (saved && CR_TR[saved]) { setLangRoot(saved); return; }
  var bl = (navigator.language || 'fr').substring(0,2).toLowerCase();
  setLangRoot(CR_TR[bl] ? bl : 'fr');
})();
