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

// ── FAQ — même mécanisme que celui déjà en place côté MPA Centres/Formation (plateforme.html) :
// recherche par mots-clés sur un contenu écrit à l'avance, jamais un vrai dialogue IA générative.
function ouvrirFAQ() {
  ouvrirModale('modal-faq');
}

function toggleFAQItem(el) {
  var etaitOuvert = el.classList.contains('open');
  document.querySelectorAll('#faq-body .faq-item.open').forEach(function(i) { i.classList.remove('open'); });
  if (!etaitOuvert) el.classList.add('open');
}

// Recherche par mots-clés (jamais une vraie IA générative) — chaque mot de 3 lettres ou plus
// de la question est comparé au contenu de chaque question de la FAQ (son data-q et son texte
// visible) ; celle qui correspond sur le plus de mots gagne. Même principe que côté MPA Centres.
function chercherFAQ(question) {
  var mots = question.toLowerCase().split(/\s+/).filter(function(m) { return m.length > 2; });
  if (!mots.length) return null;
  var meilleurId = null, meilleurScore = 0;
  document.querySelectorAll('#faq-body .faq-item').forEach(function(item) {
    var texte = ((item.dataset.q || '') + ' ' + item.textContent).toLowerCase();
    var score = mots.filter(function(m) { return texte.indexOf(m) !== -1; }).length;
    if (score > meilleurScore) { meilleurScore = score; meilleurId = item.id; }
  });
  return meilleurScore > 0 ? meilleurId : null;
}

function poserQuestionFAQ() {
  var input = document.getElementById('mpa-ai-question-input');
  if (!input) return;
  var question = input.value.trim();
  if (!question) return;
  input.value = '';

  var idTrouve = chercherFAQ(question);
  if (idTrouve) {
    ouvrirFAQ();
    setTimeout(function() {
      var el = document.getElementById(idTrouve);
      if (!el) return;
      document.querySelectorAll('#faq-body .faq-item.open').forEach(function(i) { i.classList.remove('open'); });
      el.classList.add('open');
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.style.transition = 'background .4s';
      el.style.background = 'var(--inp, #f6f9fe)';
      setTimeout(function() { el.style.background = ''; }, 2000);
    }, 150);
    mpaAiDire('Voici ce que j\'ai trouvé dans la FAQ pour votre question.', 'success');
  } else {
    mpaAiDire('Je ne trouve pas de réponse à cette question dans la FAQ. Besoin d\'aide ? contact@learnlogicstudio.com', 'warning');
  }
}

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

  if (type === 'important' || type === 'pro') {
    document.getElementById('mpa-ai-panel').classList.add('open');
  }
}

function renderMpaAiFeed() {
  var zone = document.getElementById('mpa-ai-feed');
  if (!_mpaAiFeed.length) { zone.innerHTML = '<div class="mpa-ai-empty">' + (_artisan ? 'Bonjour ' + escHtml(nomAccueil()) + ' ! ' : '') + 'Rien à signaler pour l\'instant 👋</div>'; return; }
  zone.innerHTML = _mpaAiFeed.map(function(m) {
    var heure = m.time.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' });
    return '<div class="mpa-ai-msg">' +
      '<span class="mpa-ai-msg-icone">' + m.icone + '</span>' + m.message +
      (m.cta ? '<br>' + [].concat(m.cta).map(function(c) { return '<button class="mpa-ai-msg-cta" onclick="' + c.action + '">' + c.label + '</button>'; }).join(' ') : '') +
      '<div class="mpa-ai-msg-time">' + heure + '</div>' +
    '</div>';
  }).join('');
}

function ouvrirPanneauMpaAi() { var pn = document.getElementById('mpa-ai-panel'); if (pn) pn.classList.add('open'); var d = document.getElementById('mpa-ai-dot'); if (d) d.classList.remove('show'); }
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
  // 1) Plafond micro-entreprise proche — critique dès 90 % (services 83 600 € ou ensemble 203 100 €, le plus proche des deux).
  var anneeAuj = new Date().getFullYear();
  var lignesPlafond = [];
  try { lignesPlafond = await chargerLignesCA(anneeAuj + '-01-01', (anneeAuj + 1) + '-01-01'); } catch (e) { console.error(e); }
  var tPlafond = totauxFamilles(lignesPlafond, 'production', function(d) { return d.getFullYear() === anneeAuj; });
  var plaf = calculPlafond(tPlafond);
  var pct = plaf.pct;
  if (pct >= 90) {
    mpaAiDire('Vous êtes à ' + pct.toFixed(0) + '% du plafond micro-entreprise (' + plaf.montant.toFixed(0) + '€ / ' + plaf.limite.toLocaleString('fr-FR') + '€' + (plaf.parServices ? ', services' : ', ensemble') + '). Au-delà, changement de régime fiscal obligatoire.', 'important',
      { label: 'Voir ma comptabilité', action: "switchTab(7)" });
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
      mpaAiDire('La facture ' + escHtml(f.numero) + ' (' + f.montant_total.toFixed(0) + '€, ' + escHtml(client) + ') a plus de 30 jours et n\'est pas encore marquée payée. Une petite relance ?', 'warning',
        { label: 'Voir ma comptabilité', action: "switchTab(7)" });
    }
  }

  // 3) Nouvel utilisateur — aucun client ni service configuré.
  if (!_clientsCache.length && !_servicesCache.length) {
    mpaAiDire('Bienvenue sur MPA Artisans, ' + escHtml(nomAccueil()) + ' ! Commencez par ajouter un client habituel dans "Mon profil", ou ajoutez vos services dans "Mes interventions".', 'info');
  }

  // 4) Demandes et commandes en attente — réutilise les chiffres déjà calculés par
  // chargerDemandes()/chargerCommandes() pour les badges, jamais un second comptage à part qui
  // pourrait se désynchroniser du vrai badge affiché.
  var badgeDemandes = document.getElementById('cnt-demandes');
  var nbDemandes = (badgeDemandes && badgeDemandes.style.display !== 'none') ? parseInt(badgeDemandes.textContent, 10) || 0 : 0;
  var badgeCommandes = document.getElementById('cnt-commandes');
  var nbCommandes = (badgeCommandes && badgeCommandes.style.display !== 'none') ? parseInt(badgeCommandes.textContent, 10) || 0 : 0;

  if (nbDemandes > 0 && nbCommandes > 0) {
    mpaAiDire('📬 Vous avez ' + nbDemandes + ' demande' + (nbDemandes > 1 ? 's' : '') + ' et ' + nbCommandes + ' commande' + (nbCommandes > 1 ? 's' : '') + ' en attente.', 'info',
      { label: 'Voir mes interventions', action: "switchTab(3)" });
  } else if (nbDemandes > 0) {
    mpaAiDire('📬 Vous avez ' + nbDemandes + ' nouvelle' + (nbDemandes > 1 ? 's' : '') + ' demande' + (nbDemandes > 1 ? 's' : '') + ' de devis en attente.', 'info',
      { label: 'Voir mes demandes', action: "switchTab(3);switchSousOnglet('nav-interventions','conteneur-interventions',1)" });
  } else if (nbCommandes > 0) {
    mpaAiDire('🛒 Vous avez ' + nbCommandes + ' nouvelle' + (nbCommandes > 1 ? 's' : '') + ' commande' + (nbCommandes > 1 ? 's' : '') + ' à traiter.', 'info',
      { label: 'Voir mes commandes', action: "switchTab(4);switchSousOnglet('nav-ventes','conteneur-ventes',2)" });
  }

  // 4 bis) Livraisons de boutique : à préparer, en retard. Uniquement ici, à chaque ouverture — jamais d'email à l'artisan.
  var voirCmd = { label: 'Voir mes commandes', action: "switchTab(4);switchSousOnglet('nav-ventes','conteneur-ventes',2)" };
  var cmds = (typeof _commandesCache !== 'undefined' && _commandesCache) ? _commandesCache : [];
  var enRetardCmd = cmds.filter(commandeEnRetard);
  if (enRetardCmd.length === 1) {
    var cr = enRetardCmd[0];
    mpaAiDire('⏰ La commande de ' + escHtml(cr.client_nom) + ' devait être prête le ' + dateCourteFR(cr.livraison_debut) + '. Ce retard m\'empêche de la regrouper avec vos autres interventions. Que voulez-vous faire ?', 'warning', [
      { label: '📦 Elle est prête', action: "marquerCommandePrete('" + cr.id + "')" },
      { label: '↩️ Rembourser', action: "ouvrirRemboursement('" + cr.id + "')" },
      voirCmd ]);
  } else if (enRetardCmd.length > 1) {
    mpaAiDire('⏰ ' + enRetardCmd.length + ' commandes à livrer auraient dû être prêtes. Ces retards m\'empêchent de regrouper les livraisons. Pour chacune : la passer en « Prête » dès que possible, ou la rembourser.', 'warning', voirCmd);
  }
  var aPreparer = cmds.filter(function(c) {
    return c.mode === 'livraison' && commandeReglee(c) && c.statut !== 'prete' && c.statut !== 'terminee' && c.statut !== 'annulee' && c.livraison_debut && !commandeEnRetard(c) && c.livraison_debut <= ajouterJoursISO(jourGuadeloupe(), 3);
  });
  if (aPreparer.length) {
    mpaAiDire('📦 ' + aPreparer.length + ' commande' + (aPreparer.length > 1 ? 's' : '') + ' à préparer avant le début de la fenêtre de livraison (' + aPreparer.map(function(c) { return escHtml(c.client_nom) + ' : ' + dateCourteFR(c.livraison_debut); }).join(' ; ') + ').', 'info', voirCmd);
  }
  var pretesAPlanifier = cmds.filter(function(c) { return c.mode === 'livraison' && commandeReglee(c) && c.statut === 'prete' && !c.intervention_id; });
  // MPA-AI cherche en continu le meilleur jour : si vous êtes déjà dans la commune un jour de la fenêtre, elle le propose (un clic).
  // À l'échéance (veille du début de fenêtre ou après), elle propose le meilleur jour même sans regroupement.
  var veille = ajouterJoursISO(jourGuadeloupe(), 1);
  var sansAnalyse = 0;
  pretesAPlanifier.forEach(function(c) {
    var echue = c.livraison_debut && c.livraison_debut <= veille;
    analyserJoursLivraison(c).then(function(an) {
      var m = an.meilleur;
      if (m && (m.memeCommune > 0 || echue)) {
        mpaAiDire('🚚 ' + (echue ? 'C\'est le moment de planifier' : 'Bonne occasion pour planifier') + ' la livraison de ' + escHtml(c.client_nom) + ' (' + escHtml(c.commune_livraison || '') + '). Meilleur jour : <strong>' + dateCourteFR(m.date) + '</strong> — ' + resumeJourLivraison(m, c.commune_livraison) + '. Le client ne sera prévenu que 2 jours avant.', 'info', [
          { label: '✅ Valider ce jour', action: "validerJourProposeLivraison('" + c.id + "','" + m.date + "')" },
          { label: 'Choisir un autre jour', action: "planifierLivraisonCommande('" + c.id + "')" } ]);
      } else if (!m && echue) {
        mpaAiDire('🚚 La livraison de ' + escHtml(c.client_nom) + ' est à planifier, mais aucun jour libre dans sa fenêtre. Choisissez un jour à la main.', 'warning', { label: 'Planifier', action: "planifierLivraisonCommande('" + c.id + "')" });
      } else { sansAnalyse++; if (sansAnalyse === pretesAPlanifier.length) mpaAiDire('🚚 ' + sansAnalyse + ' livraison' + (sansAnalyse > 1 ? 's prêtes attendent' : ' prête attend') + ' d\'être planifiée' + (sansAnalyse > 1 ? 's' : '') + '. Je vous proposerai un jour dès qu\'il y aura un regroupement possible.', 'info', { label: 'Voir mes livraisons', action: "switchTab(5)" }); }
    });
  });
  // Livraisons planifiées mais PROVISOIRES (client pas encore prévenu) : MPA-AI cherche mieux, et rappelle quand le mail partira.
  var provisoires = cmds.filter(function(c) { return c.mode === 'livraison' && commandeReglee(c) && c.intervention_id && !c.livraison_confirmee_le && c.livraison_prevue_le && c.statut !== 'terminee' && c.statut !== 'annulee'; });
  provisoires.forEach(function(c) {
    analyserJoursLivraison(c, c.intervention_id).then(function(an) {
      var actuel = an.jours.find(function(x) { return x.date === c.livraison_prevue_le; });
      var m = an.meilleur;
      var gainCommune = m && m.date !== c.livraison_prevue_le && m.memeCommune > ((actuel && actuel.memeCommune) || 0);
      if (gainCommune) {
        mpaAiDire('🧩 Mieux pour la livraison de ' + escHtml(c.client_nom) + ' : vous serez déjà à ' + escHtml(c.commune_livraison || 'proximité') + ' le <strong>' + dateCourteFR(m.date) + '</strong> (au lieu du ' + dateCourteFR(c.livraison_prevue_le) + '). Le client n\'a encore reçu aucune date : je déplace sans rien envoyer.', 'info', [
          { label: '✅ Déplacer au ' + dateCourteFR(m.date), action: "deplacerLivraisonProvisoire('" + c.id + "','" + m.date + "')" },
          { label: 'Garder le ' + dateCourteFR(c.livraison_prevue_le), action: "" } ]);
      } else if (c.livraison_prevue_le <= ajouterJoursISO(jourGuadeloupe(), 4)) {
        mpaAiDire('📅 Livraison de ' + escHtml(c.client_nom) + ' le ' + dateCourteFR(c.livraison_prevue_le) + ' : pas de meilleur jour. ' + (c.livraison_prevue_le <= ajouterJoursISO(jourGuadeloupe(), 2) ? 'Le client va être prévenu automatiquement.' : 'Le client sera prévenu le ' + dateCourteFR(ajouterJoursISO(c.livraison_prevue_le, -2)) + '.'), 'info', { label: '✉️ Prévenir maintenant', action: "prevenirClientLivraisonMaintenant('" + c.id + "')" });
      }
    });
  });

  // 4 bis) Interventions dont la date est passée mais qui ne sont pas encore « terminées » : c'est ce qui fausse le chiffre d'affaires,
  // la facturation et les demandes d'avis (qui partent 48 h après « terminée »). Rappel simple, pour tous les plans, jamais bloquant.
  var nbAClore = await compterInterventionsACloturer();
  var nbEnCoursVieilles = await compterInterventionsEnCoursAnciennes(); // celles-là ont leur propre rappel juste après
  if (nbAClore - nbEnCoursVieilles > 0) {
    var nAC = nbAClore - nbEnCoursVieilles;
    mpaAiDire('🗓️ ' + nAC + ' intervention' + (nAC > 1 ? 's sont passées' : ' est passée') + ' mais ' + (nAC > 1 ? 'ne sont pas encore marquées' : 'n\'est pas encore marquée') + ' « Terminée ». Mettez-' + (nAC > 1 ? 'les' : 'la') + ' à jour : votre chiffre d\'affaires sera juste et vous pourrez facturer.', 'info',
      { label: 'Voir mon planning', action: "switchTab(2)" });
  }

  // 4 ter) Demandes de paiement non réglées : le silence est ce qui décourage l'artisan, on le lui dit.
  try {
    var { data: impayes } = await sb.from('paiements_prestations').select('id, client_nom, montant, statut, created_at, annule_le')
      .eq('artisan_id', _artisan.id).eq('type', 'solde').in('statut', ['en_attente', 'expire']).order('created_at', { ascending: true });
    var ilYa7j = Date.now() - 7 * 86400000;
    var enAttente = (impayes || []).filter(function(x) { return x.statut === 'en_attente' && Date.now() - new Date(x.created_at).getTime() > 2 * 86400000; });
    var expires = (impayes || []).filter(function(x) { return x.statut === 'expire' && x.annule_le && new Date(x.annule_le).getTime() > ilYa7j; });
    if (enAttente.length || expires.length) {
      var parties = [];
      if (enAttente.length === 1) { var a1 = enAttente[0]; parties.push(escHtml(a1.client_nom || 'Un client') + ' n\'a pas encore payé ' + eurosMPA(a1.montant) + ' (demande envoyée il y a ' + Math.floor((Date.now() - new Date(a1.created_at).getTime()) / 86400000) + ' jours)'); }
      else if (enAttente.length > 1) parties.push(enAttente.length + ' demandes de paiement ne sont pas encore réglées (' + eurosMPA(enAttente.reduce(function(t, x) { return t + Number(x.montant); }, 0)) + ' au total)');
      if (expires.length) parties.push(expires.length === 1 ? 'le lien de ' + escHtml(expires[0].client_nom || 'un client') + ' a expiré sans paiement' : expires.length + ' liens ont expiré sans paiement');
      mpaAiDire('💶 ' + parties.join(' ; ') + '. Ouvrez l\'intervention pour relancer votre client, copier le lien ou créer un nouveau lien.', 'warning',
        { label: 'Voir mon planning', action: "switchTab(2)" });
    }
  } catch (e) { /* table ou colonnes pas encore créées : rien à signaler */ }

  // 5) Interventions "En cours" qui traînent depuis plus de 60 jours — un simple rappel, jamais
  // bloquant (contrairement au seuil des 90 jours, qui lui empêche de planifier du nouveau).
  var nbEnCoursAnciennes = await compterInterventionsEnCoursAnciennes();
  if (nbEnCoursAnciennes > 0) {
    mpaAiDire('📅 ' + nbEnCoursAnciennes + ' intervention' + (nbEnCoursAnciennes > 1 ? 's sont' : ' est') + ' toujours "En cours" depuis plus de ' + DELAI_ALERTE_EN_COURS_JOURS + ' jours. Vérifiez leur statut pour garder votre planning à jour.', 'warning',
      { label: 'Voir mon planning', action: "switchTab(2)" });
  }

  // 6) Avis à demander — 48h après une intervention terminée, c'est le bon moment.
  var aProposerAvis = estPro() ? await trouverInterventionsAvisAProposer() : []; // suggestion réservée à l'offre Pro
  if (aProposerAvis.length === 1) {
    var seule = aProposerAvis[0];
    var nomClient = seule.mpa_artisans_clients.nom;
    mpaAiDire('✨ L\'intervention chez ' + escHtml(nomClient) + ' s\'est terminée il y a 48h. Le bon moment pour lui demander un avis.', 'info',
      { label: 'Demander un avis', action: "demanderAvis('" + seule.id + "')" });
  } else if (aProposerAvis.length > 1) {
    mpaAiDire('✨ ' + aProposerAvis.length + ' interventions terminées il y a 48h n\'ont pas encore reçu de demande d\'avis.', 'info',
      { label: 'Voir mon planning', action: "switchTab(2)" });
  }

  // 7) Abonnement Pro : paiement en échec, ou essai qui se termine bientôt. Le message ne suppose pas
  // qu'il manque une carte (on ne sait pas si l'artisan en a déjà ajouté une) : il renvoie vers le portail.
  if (_artisan.plan === 'pro') {
    if (_artisan.abonnement_paiement_en_echec) {
      mpaAiDire('⚠️ Le dernier paiement de votre abonnement Pro a échoué. Mettez votre carte à jour pour garder le Pro.', 'warning',
        { label: 'Mettre à jour ma carte', action: 'ouvrirPortailAbonnement()' });
    } else if (_artisan.abonnement_statut === 'essai' && !_artisan.abonnement_fin_programmee && _artisan.abonnement_echeance) {
      var joursRestants = Math.ceil((new Date(_artisan.abonnement_echeance).getTime() - Date.now()) / 86400000);
      if (joursRestants >= 0 && joursRestants <= 3) {
        mpaAiDire('⏳ Votre essai Pro se termine ' + (joursRestants === 0 ? 'aujourd\'hui' : 'dans ' + joursRestants + ' jour' + (joursRestants > 1 ? 's' : '')) + '. Sans carte enregistrée, vous repasserez en Essentiel (rien n\'est supprimé).', 'warning',
          { label: 'Gérer mon abonnement', action: 'ouvrirPortailAbonnement()' });
      }
    }
  }

  // 8) Commission prestations : carte à enregistrer AVANT le seuil gratuit, ou commission restée impayée.
  var etatC = await chargerEtatCommission();
  if (etatC) {
    var impayeC = Number(etatC.commission_impayee || 0);
    var caC = Number(etatC.ca_mois || 0);
    if (impayeC > 0) {
      mpaAiDire('⚠️ Une commission de ' + eurosMPA(impayeC) + ' n\'a pas pu être prélevée. Tant qu\'elle n\'est pas réglée, vous ne pouvez plus planifier de nouvelle intervention venue de CaraLink.', 'warning',
        { label: 'Enregistrer une carte', action: 'ouvrirCartePrestations()' });
    } else if (!etatC.carte && caC >= Number(etatC.seuil || 200)) {
      mpaAiDire('⚠️ Vous avez dépassé ' + etatC.seuil + ' € ce mois-ci avec vos clients venus de CaraLink. Enregistrez une carte pour pouvoir en planifier de nouveaux. Elle est débitée seulement sur la part au-dessus de ' + etatC.seuil + ' €.', 'warning',
        { label: 'Enregistrer une carte', action: 'ouvrirCartePrestations()' });
    } else if (!etatC.carte && caC >= SEUIL_ALERTE_CARTE_EUROS) {
      mpaAiDire('🔔 Vous approchez du seuil gratuit (' + eurosMPA(caC) + ' sur ' + etatC.seuil + ' € ce mois-ci). Pensez à enregistrer une carte pour ne pas être bloqué.', 'info',
        { label: 'Enregistrer une carte', action: 'ouvrirCartePrestations()' });
    }
  }
}

// ── Onglets principaux ──
// Les numéros d'onglet (0 à 7) restent ceux d'origine : les alertes et boutons qui appellent switchTab(n) n'ont donc pas à changer.
// « Ma journée » (0) et « Mon planning » (2) sont désormais UN SEUL onglet, « Mon planning » : la journée en haut, le calendrier dessous.
var TAB_PANNEAUX = ['p-journee', 'p-profil', 'p0', 'p-interventions', 'p-ventes', 'p-livraisons', 'p-stock', 'p-compta'];
var TAB_BOUTONS  = ['nt-planning', 'nt-profil', 'nt-planning', 'nt-interventions', 'nt-ventes', 'nt-livraisons', 'nt-stock', 'nt-compta'];
function switchTab(i) {
  document.querySelectorAll('#nav .ntab').forEach(function(b) { b.classList.remove('active'); });
  var bouton = document.getElementById(TAB_BOUTONS[i]);
  if (bouton) bouton.classList.add('active');
  var actifs = (i === 0 || i === 2) ? ['p-journee', 'p0'] : [TAB_PANNEAUX[i]];
  document.querySelectorAll('#content > .pnl').forEach(function(p) { p.classList.toggle('active', actifs.indexOf(p.id) >= 0); });
  // La compta peut devenir périmée par une action faite depuis un autre onglet (ex : marquer une
  // intervention "Payée" depuis Ma journée) — on la rafraîchit systématiquement en y entrant,
  // plutôt que de compter sur chaque endroit qui pourrait la rendre périmée pour y penser.
  if (TAB_PANNEAUX[i] === 'p-compta' && typeof chargerCompta === 'function') chargerCompta();
  if (TAB_PANNEAUX[i] === 'p-livraisons' && typeof chargerLivraisons === 'function') chargerLivraisons();
}

// ── Activités de l'artisan : intervention, boutique, livraison ──
// artisans.activites (liste) : vide = l'artisan n'a pas encore répondu → TOUS les onglets restent normaux.
// Sinon, les onglets dont il ne se sert pas sont estompés (jamais bloqués : un clic les ouvre quand même).
// Planning, Mon profil et Ma comptabilité sont toujours en pleine couleur. Mon stock sert aux interventions (fournitures) ET à la boutique (produits).
function appliquerActivites() {
  var act = (_artisan && Array.isArray(_artisan.activites) && _artisan.activites.length) ? _artisan.activites : null;
  var a = function(c) { return !act || act.indexOf(c) >= 0; };
  var etat = {
    'nt-interventions': a('interventions'),
    'nt-ventes': a('boutique'),
    'nt-livraisons': a('livraison'),
    'nt-stock': a('interventions') || a('boutique')
  };
  Object.keys(etat).forEach(function(id) {
    var b = document.getElementById(id); if (!b) return;
    b.classList.toggle('inactif', !etat[id]);
    if (etat[id]) b.removeAttribute('title'); else b.title = 'Vous n\'avez pas indiqué cette activité. Cliquez pour l\'ouvrir quand même.';
  });
}
function ouvrirQuestionActivites() {
  var act = (_artisan && Array.isArray(_artisan.activites)) ? _artisan.activites : [];
  ['interventions', 'boutique', 'livraison'].forEach(function(c) { var e = document.getElementById('act-' + c); if (e) e.checked = act.indexOf(c) >= 0; });
  var err = document.getElementById('act-erreur'); if (err) err.style.display = 'none';
  var bAct = document.getElementById('act-btn-suivant'); if (bAct) bAct.textContent = regimeAPoser() ? 'Suivant' : 'Valider';
  ouvrirModale('modal-activites');
}
async function repondreQuestionActivites() {
  var choisies = ['interventions', 'boutique', 'livraison'].filter(function(c) { var e = document.getElementById('act-' + c); return e && e.checked; });
  var err = document.getElementById('act-erreur');
  if (!choisies.length) { if (err) err.style.display = 'block'; return; }
  var { error } = await sb.from('artisans').update({ activites: choisies }).eq('id', _artisan.id);
  if (error) { alert('Erreur : ' + error.message); return; }
  _artisan.activites = choisies;
  fermerModale('modal-activites');
  appliquerActivites();
  // La question est traitée : on la retire de la liste de MPA-AI et on la remplace par une confirmation.
  _mpaAiFeed = _mpaAiFeed.filter(function(m) { return !(m.cta && m.cta.action === 'ouvrirQuestionActivites()'); });
  var panneau = document.getElementById('mpa-ai-panel'); if (panneau) panneau.classList.remove('open');
  mpaAiDire('C\'est noté. Les onglets dont vous ne vous servez pas sont estompés, mais ils restent ouverts si vous en avez besoin. Pour changer : « ⚙ Mes activités », à droite des onglets.', 'info');
  // Ensuite : la question sur l'impôt (si pas encore répondu), puis celle sur la visite d'estimation.
  if (regimeAPoser()) { window._questionRegimeDite = true; ouvrirQuestionRegime(); return; }
  await suiteApresQuestionsDebut();
}
// La visite d'estimation n'a de sens que pour qui intervient chez ses clients : elle vient en dernier.
async function suiteApresQuestionsDebut() {
  await demanderAssistantReglages(true); // l'assistant de réglage remplace la question isolée sur la visite d'estimation
}

// ── Question « versement libératoire » (impôt sur le revenu) — juste après la question sur les activités ──
// artisans.versement_liberatoire : null = pas encore répondu, true / false = réponse. Sert à estimer l'impôt avec le bon calcul.
function regimeAPoser() {
  return !!_artisan && ('versement_liberatoire' in _artisan) && _artisan.versement_liberatoire == null;
}
function ouvrirQuestionRegime() {
  ['oui', 'non'].forEach(function(v) { var e = document.getElementById('regime-' + v); if (e) e.checked = false; });
  var err = document.getElementById('regime-erreur'); if (err) err.style.display = 'none';
  ouvrirModale('modal-regime-fiscal');
}
async function repondreQuestionRegime() {
  var oui = document.getElementById('regime-oui').checked, non = document.getElementById('regime-non').checked;
  var err = document.getElementById('regime-erreur');
  if (!oui && !non) { if (err) err.style.display = 'block'; return; }
  var { error } = await sb.from('artisans').update({ versement_liberatoire: oui }).eq('id', _artisan.id);
  if (error) { alert('Erreur : ' + error.message); return; }
  _artisan.versement_liberatoire = oui;
  fermerModale('modal-regime-fiscal');
  _mpaAiFeed = _mpaAiFeed.filter(function(m) { return !(m.cta && m.cta.action === 'ouvrirQuestionRegime()'); });
  var panneau = document.getElementById('mpa-ai-panel'); if (panneau) panneau.classList.remove('open');
  var sel = document.getElementById('cfg-liberatoire'); if (sel) sel.value = oui ? 'oui' : 'non';
  mpaAiDire(oui ? 'C\'est noté : j\'estime votre impôt avec le versement libératoire. Pour changer : Mon profil › Paramètres fiscaux.' : 'C\'est noté : j\'estime votre impôt au barème classique, avec l\'abattement. Pour changer : Mon profil › Paramètres fiscaux.', 'info');
  try { calculerDashboardFiscal(); } catch (e) {}
  await suiteApresQuestionsDebut();
}
async function reporterQuestionRegime() {
  fermerModale('modal-regime-fiscal');
  await suiteApresQuestionsDebut();
}
// MPA-AI pose la question tant que l'artisan n'a pas répondu — une fois par session. Renvoie true si elle a été posée.
async function demanderRegimeFiscal() {
  if (window._questionRegimeDite || !regimeAPoser()) return false;
  window._questionRegimeDite = true;
  mpaAiDire('Une autre question rapide : avez-vous choisi le <strong>versement libératoire</strong> de l\'impôt sur le revenu ? Cela me permet d\'estimer votre impôt correctement.',
    'pro', { label: 'Répondre', action: 'ouvrirQuestionRegime()' });
  return true;
}
// MPA-AI pose la question tant que l'artisan n'a pas répondu (colonne présente et vide) — une fois par session. Renvoie true si elle a été posée.
async function demanderActivites() {
  if (window._questionActivitesDite || !_artisan || !('activites' in _artisan)) return false;
  if (Array.isArray(_artisan.activites) && _artisan.activites.length) return false;
  window._questionActivitesDite = true;
  mpaAiDire('Bonjour ' + escHtml(nomAccueil()) + ' ! Une question rapide pour vous simplifier la vue : qu\'est-ce que vous faites ? Je mettrai en avant les onglets utiles.',
    'pro', { label: 'Répondre', action: 'ouvrirQuestionActivites()' });
  return true;
}

// Nom d'accueil : le nom de l'entreprise sans la forme juridique (SARL, EURL, SAS, EI…), et pas trop long.
function nomAccueil() {
  var brut = String((_artisan && _artisan.nom_entreprise) || '').trim();
  var n = brut.replace(/(^|[\s,\-–])(S\.?A\.?R\.?L\.?|EURL|SASU|SAS|EIRL|EI|SA)\.?(?=$|[\s,\-–])/g, ' ').replace(/\s{2,}/g, ' ').replace(/^[\s,\-–]+|[\s,\-–]+$/g, '');
  if (!n) n = brut;
  if (n.length > 32) n = n.slice(0, 32).replace(/\s+\S*$/, '') + '…';
  return n || 'à vous';
}

// ── Sous-onglets génériques — un seul mécanisme pour les trois groupes (Mon profil,
// Mes interventions, Mes ventes), au lieu d'une fonction dédiée par groupe comme avant
// (switchBdd). Même logique exacte, juste paramétrée par les bons identifiants.
function switchSousOnglet(idNav, idConteneur, i) {
  document.querySelectorAll('#' + idNav + ' .btab').forEach(function(b, idx) { b.classList.toggle('active', idx === i); });
  document.querySelectorAll('#' + idConteneur + ' > .bpnl').forEach(function(p, idx) { p.classList.toggle('active', idx === i); });
}

// ════════════════════════════════════════
//  INIT
// ════════════════════════════════════════
async function init() {
  var { data: sessionData } = await sb.auth.getSession();
  if (!sessionData.session) { window.location.href = 'https://caralink.app/artisans/connexion.html'; return; }
  _session = sessionData.session;
  document.getElementById('uname').textContent = _session.user.email;

  var ADMIN_EMAIL = 'toifreddypro@gmail.com'; // même adresse que admin.html
  if (_session.user.email === ADMIN_EMAIL) {
    document.getElementById('btn-admin-topbar').style.display = 'inline-flex';
  }

  var { data: artisan, error } = await sb.from('artisans').select('*').eq('user_id', _session.user.id).maybeSingle();
  if (error) {
    // Une erreur (session expirée, réseau...) n'est jamais la preuve d'une absence de profil —
    // renvoyer vers l'inscription dans ce cas ferait croire à tort qu'il faut recréer un compte.
    // On déconnecte proprement et on renvoie vers la connexion, la vraie sortie de secours.
    await sb.auth.signOut();
    alert('Votre session a expiré. Merci de vous reconnecter.');
    window.location.href = 'https://caralink.app/artisans/connexion.html';
    return;
  }
  if (!artisan) {
    // Une session valide sans profil ne veut pas forcément dire "jamais inscrit" — ça peut aussi
    // être une session restée active d'un compte différent, ou d'une inscription jamais terminée.
    // On déconnecte et on renvoie vers la CONNEXION (pas l'inscription à l'aveugle) : l'utilisateur
    // peut alors se reconnecter avec le bon compte, ou s'inscrire lui-même s'il le faut vraiment.
    await sb.auth.signOut();
    alert('Aucun profil artisan n\'est associé à ce compte. Connectez-vous avec le bon compte, ou inscrivez-vous si vous n\'avez pas encore de profil.');
    window.location.href = 'https://caralink.app/artisans/connexion.html';
    return;
  }
  _artisan = artisan;
  await synchroniserStatutStripe(); // au retour de Stripe (ou tant que « en cours ») : lit l'état réel du compte chez Stripe
  majInfoAbonnementMpaAi();

  renderFiche();
  await chargerClients();
  await chargerDemandes();
  await chargerAvis();
  await chargerCommandes();
  await chargerLivraisons();
  await chargerHoraires();
  await chargerIndispos();
  await chargerServices();
  await chargerPhotos();
  await chargerCatalogue();
  await chargerFournitures();
  await initPlanning();
  await chargerCompta();
  remplirSelectClientFacture();
  await chargerFactures();
  await initDashboard();
  renderMpaAiFeed();
  await verifierAlertesMpaAi();
  appliquerActivites();
  // Une seule question à la fois : d'abord l'activité, puis l'impôt (versement libératoire), la visite d'estimation en dernier.
  if (!(await demanderActivites()) && !(await demanderRegimeFiscal())) await demanderAssistantReglages(false); // après les autres alertes : la question de MPA-AI est la plus visible
  rappelerPaiementsBoutique('demarrage');
  rappelerStripeReservations();
  await verifierNouveautes();
  renderMonOffre();
  traiterRetourAbonnement(); // sans attendre : peut patienter jusqu'à 30 s le temps que Stripe prévienne le serveur
}

// Met en forme la description : une ligne par idée, « Libellé : texte » avec le libellé en gras.
// Si l'annonce a été écrite d'un seul bloc, on la découpe avant chaque « Libellé : » et avant 💡.
function formaterDescriptionNouveaute(desc) {
  var txt = String(desc || '').trim();
  if (txt.indexOf('\n') === -1) {
    txt = txt.replace(/([.!?]) +(?=[A-ZÀ-Ý][^.!?:\n]{2,40} : )/g, '$1\n').replace(/ *(?=💡)/g, '\n');
  }
  return txt.split(/\n+/).map(function(l) { return l.trim(); }).filter(Boolean).map(function(l) {
    var m = l.match(/^([^:\n]{2,40}) : (.+)$/);
    var corps = m ? '<strong style="color:var(--tx,#111);">' + escHtml(m[1]) + '</strong> — ' + escHtml(m[2]) : escHtml(l);
    var astuce = l.indexOf('💡') === 0;
    return '<div style="font-size:13.5px;line-height:1.55;color:var(--mu2);margin:0 0 8px;' +
      (astuce ? 'background:rgba(181,80,47,.08);border-radius:8px;padding:8px 10px;' : '') + '">' + corps + '</div>';
  }).join('');
}

// ── Quoi de neuf — annonces publiées depuis l'admin, montrées une fois par artisan ──
async function verifierNouveautes() {
  var depuis = _artisan.derniere_nouveaute_vue || '1970-01-01T00:00:00Z';
  var { data: items, error } = await sb.from('nouveautes').select('*')
    .eq('actif', true).gt('created_at', depuis).order('created_at', { ascending: true });
  if (error || !items || !items.length) return;

  document.getElementById('nouveautes-liste').innerHTML = items.map(function(n) {
    return '<div style="padding:12px 0;border-bottom:1px solid var(--brd);">' +
      '<div style="font-weight:700;font-size:15px;margin-bottom:8px;">✨ ' + escHtml(n.titre) + '</div>' +
      formaterDescriptionNouveaute(n.description) +
    '</div>';
  }).join('');
  document.getElementById('modal-nouveautes').classList.add('show');
}

async function fermerNouveautes() {
  document.getElementById('modal-nouveautes').classList.remove('show');
  var maintenant = new Date().toISOString();
  _artisan.derniere_nouveaute_vue = maintenant;
  await sb.from('artisans').update({ derniere_nouveaute_vue: maintenant }).eq('id', _artisan.id);
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
  await renderItineraireWidget();
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

  // Si une colonne du client manque en base (ex. telephone), on réessaie sans elle plutôt que de vider tout le planning.
  var res = null;
  for (var champs of ['nom, email, telephone', 'nom, email']) {
    res = await sb.from('mpa_artisans_interventions')
      .select('*, mpa_artisans_clients(' + champs + '), artisans_services(nom_service)')
      .eq('artisan_id', _artisan.id)
      .gte('date_intervention', debutStr)
      .lte('date_intervention', finStr);
    if (!res.error || res.error.code !== '42703') break;
  }
  var data = res.data, error = res.error;

  if (error) { console.error(error); _interventionsCache = []; }
  else { _interventionsCache = data || []; }

  // Journées bloquées qui touchent ce mois (pour les afficher dans le calendrier).
  var ind = await sb.from('artisans_indisponibilites').select('*').eq('artisan_id', _artisan.id)
    .lte('date_debut', finStr).gte('date_fin', debutStr);
  _indisposMois = ind.error ? [] : (ind.data || []);

  renderCalendrier();
  renderRecapInterventions();
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

    var blocage = dateStr ? _indisposMois.find(function(x) { return dateStr >= x.date_debut && dateStr <= x.date_fin; }) : null;
    var classes = 'cal-day' + (c.autreMonth ? ' other-month' : '') + (estWeekend ? ' weekend' : '') + (estAuj ? ' today' : '') + (blocage ? ' bloque' : '');

    var interDuJour = dateStr ? _interventionsCache.filter(function(i) { return i.date_intervention === dateStr; }) : [];
    var interMatin = interDuJour.filter(function(i) { return i.creneau !== 'apres_midi'; });
    var interAM = interDuJour.filter(function(i) { return i.creneau === 'apres_midi'; });

    var pointsUniques = [];
    interDuJour.forEach(function(i) {
      var s = classeStatut(i.statut);
      if (s !== 'annulee' && pointsUniques.indexOf(s) === -1) pointsUniques.push(s);
    });
    var compactHtml = c.autreMonth ? '' :
      (pointsUniques.length
        ? '<div class="cal-compact"><div class="cal-compact-dots">' + pointsUniques.map(function(s) { return '<span class="cal-status-dot cal-status-' + s + '"></span>'; }).join('') + '</div></div>'
        : '<div class="cal-compact"></div>');

    return '<div class="' + classes + '"' + (c.autreMonth ? '' : ' onclick="ouvrirDetailJourMobile(\'' + dateStr + '\')"') + '>' +
      '<div class="cal-day-num">' + c.jour + '</div>' +
      (blocage ? '<div class="cal-bloque-tag" title="Journée bloquée : vos clients voient « ' + escHtml(libelleTypeFermeture(blocage.type_fermeture)) + ' »">⛔ ' + escHtml(libelleTypeFermeture(blocage.type_fermeture)) + '</div>' : '') +
      compactHtml +
      (c.autreMonth ? '' :
        '<div class="cal-halves">' +
          renderCreneauHtml('matin', dateStr, interMatin) +
          renderCreneauHtml('apres_midi', dateStr, interAM) +
        '</div>'
      ) +
    '</div>';
  }).join('');
}

// Un statut ne sert que dans des noms de classes CSS : on n'accepte que de simples mots (jamais de guillemet, d'espace ni de chevron).
function classeStatut(s) { return /^[a-z_-]{1,30}$/.test(s || '') ? s : 'planifiee'; }

function renderCreneauHtml(creneau, dateStr, liste) {
  var maxVisible = 2;
  var visibles = liste.slice(0, maxVisible);
  var reste = liste.length - maxVisible;

  var LABEL_STATUT = { planifiee: 'Planifiée', en_cours: 'En cours', terminee: 'Terminée', payee: 'Payée' };

  var pills = visibles.map(function(i) {
    var client = i.mpa_artisans_clients ? i.mpa_artisans_clients.nom : '';
    var service = libelleServiceIntervention(i);
    var heure = i.heure_debut ? i.heure_debut.slice(0,5) : '';
    var statut = classeStatut(i.statut);
    var statutSuivant = CYCLE_STATUT[statut] || 'planifiee';
    var titreStatut = statut === 'annulee' ? 'Intervention annulée' : 'Statut : ' + LABEL_STATUT[statut] + ' — cliquer pour passer à ' + LABEL_STATUT[statutSuivant];
    return '<div class="cal-pill st-' + statut + '" onclick="event.stopPropagation();ouvrirIntervention(\'' + i.id + '\')" title="Cliquer pour voir/modifier les détails">' +
      '<span class="cal-pill-txt">' +
        (heure ? '<span class="cal-pill-heure">' + heure + '</span> ' : '') +
        escHtml(service) + (client ? ' — ' + escHtml(client) : '') +
      '</span>' +
      (statut !== 'annulee'
        ? '<span class="cal-status-dot cal-status-' + statut + '" onclick="event.stopPropagation();avancerStatut(\'' + i.id + '\',event)" title="' + titreStatut + '"></span>'
        : '') +
    '</div>';
  }).join('');

  var plus = reste > 0 ? '<div class="cal-more" onclick="event.stopPropagation();ouvrirJourDetail(\'' + dateStr + '\',\'' + creneau + '\')">+' + reste + ' autre' + (reste>1?'s':'') + '</div>' : '';

  return '<div class="cal-half cal-half-' + (creneau==='matin'?'matin':'am') + '">' +
    '<div class="cal-half-label">' + (creneau==='matin'?'Matin':'Aprem') + '</div>' +
    pills + plus +
    '<button class="cal-add-btn" onclick="event.stopPropagation();ouvrirNouvelleIntervention(\'' + dateStr + '\',\'' + creneau + '\')">+</button>' +
  '</div>';
}

function ouvrirJourDetail(dateStr, creneau) {
  // Version simple pour l'instant : ouvre directement la création,
  // la vue "détail du jour" pourra venir plus tard si le besoin se confirme.
  ouvrirNouvelleIntervention(dateStr, creneau);
}

// ── Détail du jour — vue compacte mobile (tap sur un jour du calendrier) ──
function ouvrirDetailJourMobile(dateStr) {
  if (!dateStr) return;
  var interDuJour = _interventionsCache.filter(function(i) { return i.date_intervention === dateStr; })
    .sort(function(a, b) { return (a.heure_debut || '').localeCompare(b.heure_debut || ''); });

  var dateAff = new Date(dateStr + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  var LABEL_STATUT = { planifiee: 'Planifiée', en_cours: 'En cours', terminee: 'Terminée', payee: 'Payée', annulee: 'Annulée' };

  var liste = interDuJour.length
    ? interDuJour.map(function(i) {
        var client = i.mpa_artisans_clients ? i.mpa_artisans_clients.nom : '—';
        var service = libelleServiceIntervention(i);
        var heure = i.heure_debut ? i.heure_debut.slice(0,5) : '';
        var statut = classeStatut(i.statut);
        return '<div onclick="fermerModale(\'modal-jour-mobile\');ouvrirIntervention(\'' + i.id + '\')" style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--brd);cursor:pointer;">' +
          '<span class="cal-status-dot cal-status-' + statut + '" style="flex-shrink:0;"></span>' +
          '<div style="flex:1;">' +
            '<div style="font-size:13.5px;font-weight:600;">' + (heure ? heure + ' — ' : '') + escHtml(service) + '</div>' +
            '<div style="font-size:12px;color:var(--mu);">' + escHtml(client) + ' · ' + LABEL_STATUT[statut] + '</div>' +
          '</div>' +
        '</div>';
      }).join('')
    : '<p style="font-size:13px;color:var(--mu);padding:10px 0;">Aucune intervention ce jour-là.</p>';

  var div = document.getElementById('modal-jour-mobile');
  if (!div) {
    div = document.createElement('div');
    div.id = 'modal-jour-mobile';
    div.className = 'modal-overlay';
    document.body.appendChild(div);
  }
  div.innerHTML =
    '<div class="modal-box">' +
      '<h3 style="text-transform:capitalize;">' + dateAff + '</h3>' +
      '<div style="margin:10px 0;">' + liste + '</div>' +
      '<div class="modal-actions">' +
        '<button class="btn-primary" onclick="fermerModale(\'modal-jour-mobile\');ouvrirNouvelleIntervention(\'' + dateStr + '\',\'matin\')">+ Ajouter une intervention</button>' +
        '<button class="btn-secondary" onclick="fermerModale(\'modal-jour-mobile\')">Fermer</button>' +
      '</div>' +
    '</div>';
  ouvrirModale('modal-jour-mobile');
}

// ⚠️ Ajouté le 16/09 — décidé avec Freddy : un clic direct sur la
// vignette fait avancer le statut (Planifiée → Terminée → Payée →
// Planifiée), sans passer par la modale. Le crayon séparé reste pour
// modifier les détails (date de paiement précise, prix, etc).
var CYCLE_STATUT = { planifiee: 'en_cours', en_cours: 'terminee', terminee: 'payee', payee: 'planifiee' };

async function avancerStatut(id, ev) {
  if (ev) ev.stopPropagation();
  if (!verifierAccesEcriture()) return;
  var i = _interventionsCache.find(function(x) { return x.id === id; });
  if (!i) return;
  var statutActuel = i.statut || 'planifiee';
  if (statutActuel === 'annulee') return; // une intervention annulée ne suit pas ce cycle

  if (statutActuel === 'terminee') { payerEnMainPropre(id, false); return; } // « Payée » ne se pose plus d'un simple clic : confirmation « Payé en main propre »
  var nouveauStatut = CYCLE_STATUT[statutActuel] || 'planifiee';
  // Terminée / Payée : le prix doit avoir été validé (sinon l'intervention compterait pour 0 € et ne pourrait pas être facturée).
  if (['terminee', 'payee'].indexOf(nouveauStatut) !== -1 && i.prix == null) { demanderPrixPuis(i, function() { avancerStatut(id); }); return; }
  var maj = { statut: nouveauStatut };
  maj.date_paiement = nouveauStatut === 'payee' ? new Date().toISOString().slice(0, 10) : null;

  var { error } = await sb.from('mpa_artisans_interventions').update(maj).eq('id', id).eq('artisan_id', _artisan.id);
  if (error) { alert('Erreur : ' + error.message); return; }

  await chargerInterventions();
  if (document.getElementById('p-compta').classList.contains('active')) await chargerCompta();
  if (nouveauStatut === 'terminee') suiteInterventionTerminee(id);
}

// ── Fenêtre « Quel est le prix ? » : barrière avant Terminée / Payée ──
var _suitePrix = null, _intervPrix = null;
function demanderPrixPuis(i, suite) {
  _suitePrix = suite; _intervPrix = i;
  var client = i.mpa_artisans_clients && i.mpa_artisans_clients.nom ? i.mpa_artisans_clients.nom : 'Client';
  var service = i.artisans_services && i.artisans_services.nom_service ? ' — ' + i.artisans_services.nom_service : '';
  var dateAff = new Date(i.date_intervention + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  document.getElementById('px-resume').textContent = client + service + ' — ' + dateAff;
  var sug = suggestionPrixService(i.service_id, i.duree_min || (i.heure_debut && i.heure_fin ? heureVersMin(String(i.heure_fin).slice(0, 5)) - heureVersMin(String(i.heure_debut).slice(0, 5)) : 0));
  document.getElementById('px-prix').value = sug.valeur != null ? String(sug.valeur).replace('.', ',') : '';
  document.getElementById('px-aide').textContent = sug.texte;
  document.getElementById('px-erreur').style.display = 'none';
  document.getElementById('px-valider').disabled = false;
  ouvrirModale('modal-prix');
}
async function validerPrixRequis(gratuit) {
  var i = _intervPrix; if (!i) return;
  var prix = 0;
  if (!gratuit) {
    var brut = document.getElementById('px-prix').value.replace(/\s/g, '').replace('€', '').replace(',', '.');
    prix = Number(brut);
    if (!/^\d+(\.\d{1,2})?$/.test(brut) || !isFinite(prix) || prix <= 0 || prix > 1000000) {
      var e = document.getElementById('px-erreur'); e.textContent = 'Indiquez un prix valide, par exemple 120 ou 120,50. Si c\'est gratuit, utilisez le bouton « C\'est gratuit ».'; e.style.display = 'block'; return;
    }
  }
  document.getElementById('px-valider').disabled = true;
  var { error } = await sb.from('mpa_artisans_interventions').update({ prix: prix }).eq('id', i.id).eq('artisan_id', _artisan.id);
  if (error) { var e2 = document.getElementById('px-erreur'); e2.textContent = 'Erreur : ' + error.message; e2.style.display = 'block'; document.getElementById('px-valider').disabled = false; return; }
  i.prix = prix;
  fermerModale('modal-prix');
  var suite = _suitePrix; _suitePrix = null; _intervPrix = null;
  if (suite) suite();
}

// ── Une intervention vient d'être marquée « Terminée » : MPA-AI propose la suite (facturer, demander le solde). ──
// Plusieurs clôtures d'affilée (rattrapage) → UN seul message récapitulatif, jamais une pile de messages.
var _termineesRecentes = [], _minuteurTerminees = null;
function suiteInterventionTerminee(id) {
  if (_termineesRecentes.indexOf(id) < 0) _termineesRecentes.push(id);
  clearTimeout(_minuteurTerminees);
  _minuteurTerminees = setTimeout(function() { var ids = _termineesRecentes; _termineesRecentes = []; messageSuiteTerminee(ids); }, 1800);
}
function messageSuiteTerminee(ids) {
  var liste = ids.map(function(x) { return _interventionsCache.find(function(i) { return i.id === x; }); }).filter(Boolean);
  if (!liste.length) return;
  var facturables = liste.filter(function(i) { return !i.facture_id && i.client_id && Number(i.prix) > 0; });
  if (liste.length > 1) {
    if (!facturables.length) return;
    mpaAiDire('🧾 ' + liste.length + ' interventions terminées, ' + facturables.length + ' à facturer. ' + (estPro() ? 'Ouvrez chacune pour « Facturer en 1 clic », ou regroupez-les dans une seule facture.' : 'Regroupez-les dans une seule facture depuis Mes factures.'), 'info',
      { label: 'Aller à Mes factures', action: "switchTab(7);switchSousOnglet('nav-compta','conteneur-compta',1)" });
    return;
  }
  var i = liste[0];
  var nomClient = (i.mpa_artisans_clients && i.mpa_artisans_clients.nom) ? escHtml(i.mpa_artisans_clients.nom) : 'votre client';
  if (i.facture_id) return; // déjà facturée : rien à proposer
  if (i.prix === 0 || i.prix === '0') return; // marquée gratuite : rien à facturer
  if (!i.client_id || !(Number(i.prix) > 0)) {
    mpaAiDire('✅ Intervention chez ' + nomClient + ' terminée. Pour la facturer, il faut un client et un prix : complétez la fiche.', 'info',
      { label: 'Ouvrir l\'intervention', action: "ouvrirIntervention('" + i.id + "')" });
    return;
  }
  var boutons = [];
  if (estPro()) {
    boutons.push({ label: '🧾 Facturer en 1 clic', action: "facturerIntervention('" + i.id + "')" });
    boutons.push({ label: '✉️ Facturer et envoyer', action: "facturerIntervention('" + i.id + "', true)" });
  } else {
    boutons.push({ label: 'Aller à Mes factures', action: "switchTab(7);switchSousOnglet('nav-compta','conteneur-compta',1)" });
  }
  var resteAPayer = paiementsEnLigneActifs() && i.statut !== 'payee' && !estLivraisonIntervention(i);
  if (resteAPayer) boutons.push({ label: '💶 Demander un paiement', action: "demanderPaiementDepuisMessage('" + i.id + "')" });
  mpaAiDire('✅ Intervention chez ' + nomClient + ' terminée (' + eurosMPA(i.prix) + '). On ' + (estPro() ? 'facture ?' : 'pense à la facturer ? (Avec l\'offre Pro, un seul clic suffit.)') + (resteAPayer ? ' Vous pouvez aussi lui envoyer un lien de paiement par carte.' : ''), 'info', boutons);
  ouvrirPanneauMpaAi();
}
async function demanderPaiementDepuisMessage(id) {
  await ouvrirIntervention(id);
  await chargerPaiementsIntervention(_interventionsCache.find(function(x) { return x.id === id; }));
  ouvrirDemandePaiement();
}

// ════════════════════════════════════════
//  DEMANDES DE DEVIS — boîte de réception
// ════════════════════════════════════════

async function chargerDemandes() {
  var zone = document.getElementById('zone-demandes');
  if (!zone) return;

  // Demandes privées : déjà adressées à moi (via devis_reponses)
  var { data: reponses, error: err1 } = await sb.from('devis_reponses')
    .select('*')
    .eq('artisan_id', _artisan.id);
  if (err1) { zone.innerHTML = '<p style="color:var(--danger);">Erreur : ' + escHtml(err1.message) + '</p>'; return; }

  var idsPrivees = (reponses || []).map(function(r) { return r.demande_id; });
  var demandesPrivees = [];
  if (idsPrivees.length) {
    var { data: dp, error: errDp } = await sb.from('demandes_devis').select('*').in('id', idsPrivees);
    if (errDp) { zone.innerHTML = '<p style="color:var(--danger);">Erreur : ' + escHtml(errDp.message) + '</p>'; return; }
    demandesPrivees = dp || [];
  }

  // Demandes ouvertes dans mon secteur, pas encore prises en charge par moi
  var { data: ouvertes, error: err2 } = await sb.from('demandes_devis')
    .select('*')
    .eq('statut', 'ouverte')
    .eq('secteur', _artisan.secteur);
  if (err2) { zone.innerHTML = '<p style="color:var(--danger);">Erreur : ' + escHtml(err2.message) + '</p>'; return; }

  var liste = [];
  (reponses || []).forEach(function(r) {
    var d = demandesPrivees.find(function(x) { return x.id === r.demande_id; });
    if (!d) return;
    liste.push({ type: 'privee', reponse_id: r.id, reponse_statut: r.statut, demande: d });
  });
  (ouvertes || []).forEach(function(d) {
    if (idsPrivees.indexOf(d.id) !== -1) return; // déjà prise en charge par moi, déjà listée ci-dessus
    liste.push({ type: 'ouverte', demande_id: d.id, demande: d });
  });
  liste.sort(function(a, b) { return new Date(b.demande.created_at) - new Date(a.demande.created_at); });

  // Paiements en ligne rattachés à ces demandes (frais de réservation / de déplacement déjà réglés) — facultatif : jamais bloquant.
  window._paiementsDemandes = {};
  try {
    var idsD = liste.map(function(l) { return l.demande.id; });
    if (idsD.length) {
      var { data: pays } = await sb.from('paiements_prestations').select('demande_id, montant, statut').eq('artisan_id', _artisan.id).eq('type', 'reservation').in('demande_id', idsD);
      (pays || []).forEach(function(x) { window._paiementsDemandes[x.demande_id] = x; });
    }
  } catch (ePay) { console.warn('Paiements des demandes non chargés :', ePay); }

  // Photos jointes : l'espace de stockage est PRIVÉ, on demande des liens temporaires signés (valables 1 h) pour ce que cet artisan a le droit de voir.
  await signerPhotosDemandes(liste);

  _demandesListe = liste;
  renderDemandes();
}

// Les photos d'une demande sont rangées dans l'espace privé « devis-photos ». La colonne contient un chemin (« id-demande/0.jpg ») ;
// les demandes plus anciennes contiennent encore l'ancienne adresse publique complète : on en extrait le chemin.
var _photosSignees = {};
function cheminPhotoDevis(v) {
  var s = String(v || '');
  var i = s.indexOf('/devis-photos/');
  if (i !== -1) s = s.slice(i + '/devis-photos/'.length);
  return s.split('?')[0];
}
async function signerPhotosDemandes(liste) {
  try {
    var chemins = [];
    (liste || []).forEach(function(l) {
      ((l.demande && l.demande.photos) || []).forEach(function(v) {
        var c = cheminPhotoDevis(v);
        if (c && chemins.indexOf(c) === -1) chemins.push(c);
      });
    });
    _photosSignees = {};
    if (!chemins.length) return;
    var { data, error } = await sb.storage.from('devis-photos').createSignedUrls(chemins, 3600);
    if (error) { console.warn('Photos des demandes non chargées :', error.message); return; }
    (data || []).forEach(function(x) { if (x && x.path && x.signedUrl) _photosSignees[x.path] = x.signedUrl; });
  } catch (e) { console.warn('Photos des demandes non chargées :', e); }
}
function urlPhotoDevis(v) { return _photosSignees[cheminPhotoDevis(v)] || ''; }

// ── Demandes : « À traiter » / « Archivées » ──
// Une demande est ARCHIVÉE quand l'artisan a fini avec elle : réponse marquée traitée, ou créneau déjà confirmé / refusé.
// (Confirmer ou refuser un créneau change le statut de la DEMANDE mais pas celui de la réponse : sans cette règle, une demande déjà
// traitée restait comptée comme « nouvelle » dans la pastille et chez MPA-AI.) Une demande ouverte non prise en charge n'est jamais archivée.
var _vueDemandes = 'atraiter';
var _demandesListe = [];
function demandeArchivee(l) {
  if (l.type !== 'privee') return false;
  var st = l.demande && l.demande.statut;
  return l.reponse_statut === 'traitee' || st === 'creneau_confirme' || st === 'creneau_refuse';
}
function basculerVueDemandes(v) { _vueDemandes = v === 'archivees' ? 'archivees' : 'atraiter'; renderDemandes(); }
function renderDemandes() {
  var zone = document.getElementById('zone-demandes');
  if (!zone) return;
  var liste = _demandesListe || [];
  var nbArchivees = liste.filter(demandeArchivee).length;
  var nbNouvelles = liste.length - nbArchivees;
  var badge = document.getElementById('cnt-demandes');
  if (badge) { if (nbNouvelles > 0) { badge.textContent = nbNouvelles; badge.style.display = 'inline-flex'; } else { badge.style.display = 'none'; } }
  if (!liste.length) {
    zone.innerHTML = '<div class="etat-vide-tbl">Aucune demande pour l\'instant.</div>';
    return;
  }
  var archivees = _vueDemandes === 'archivees';
  var affichees = liste.filter(function(l) { return demandeArchivee(l) === archivees; });
  var barre = '<div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;">' + [['atraiter', 'À traiter', nbNouvelles], ['archivees', 'Archivées', nbArchivees]].map(function(v) {
    var actif = (v[0] === 'archivees') === archivees;
    return '<button type="button" onclick="basculerVueDemandes(\'' + v[0] + '\')" style="padding:7px 14px;border-radius:20px;font-family:inherit;font-size:13px;font-weight:600;cursor:pointer;border:1px solid ' + (actif ? 'var(--ac)' : 'var(--brd)') + ';background:' + (actif ? 'var(--ac)' : 'transparent') + ';color:' + (actif ? '#fff' : 'var(--mu)') + ';">' + v[1] + ' (' + v[2] + ')</button>';
  }).join('') + '</div>';
  if (!affichees.length) {
    zone.innerHTML = barre + '<div class="etat-vide-tbl">' + (archivees
      ? 'Aucune demande archivée pour l\'instant. Une demande arrive ici quand vous la marquez traitée, ou quand vous confirmez ou refusez son créneau.'
      : 'Aucune demande à traiter ✅' + (nbArchivees ? ' Vos demandes déjà traitées sont dans « Archivées ».' : '')) + '</div>';
    return;
  }
  var htmlCartes = affichees.map(function(l) {
    var d = l.demande;
    var estCreneau = ['creneau_propose', 'creneau_confirme', 'creneau_refuse'].indexOf(d.statut) !== -1;
    var dateAff = new Date(d.created_at).toLocaleDateString('fr-FR');

    var badgeType;
    if (d.statut === 'creneau_propose') badgeType = '<span style="font-size:10.5px;font-weight:700;padding:3px 9px;border-radius:20px;background:rgba(180,83,9,.1);color:#b45309;">📅 Créneau proposé</span>';
    else if (d.statut === 'creneau_confirme') badgeType = '<span style="font-size:10.5px;font-weight:700;padding:3px 9px;border-radius:20px;background:rgba(22,163,74,.1);color:#16a34a;">✅ Confirmé</span>';
    else if (d.statut === 'creneau_refuse') badgeType = '<span style="font-size:10.5px;font-weight:700;padding:3px 9px;border-radius:20px;background:var(--brd);color:var(--mu);">❌ Refusé</span>';
    else if (l.type === 'privee') badgeType = '<span style="font-size:10.5px;font-weight:700;padding:3px 9px;border-radius:20px;background:rgba(181,80,47,.1);color:var(--ac);">🔓 Privée</span>';
    else badgeType = '<span style="font-size:10.5px;font-weight:700;padding:3px 9px;border-radius:20px;background:rgba(59,130,246,.1);color:#3b82f6;">📢 Ouverte (mise en concurrence)</span>';

    var actionsHaut;
    if (d.statut === 'creneau_propose') {
      actionsHaut = '<div style="display:flex;gap:6px;">' +
          '<button class="addb" style="background:#16a34a;" onclick="repondreCreneauInApp(' + jsAttrLocal(d.token) + ',\'confirmer\')">✅ Confirmer</button>' +
          '<button class="addb" style="background:var(--mu2);" onclick="repondreCreneauInApp(' + jsAttrLocal(d.token) + ',\'refuser\')">❌ Refuser</button>' +
        '</div>';
    } else if (estCreneau) {
      actionsHaut = '<span style="font-size:11.5px;color:var(--mu);">Traité</span>';
    } else if (l.type === 'ouverte') {
      actionsHaut = '<button class="addb" onclick="prendreEnCharge(\'' + d.id + '\')">Prendre en charge</button>';
    } else if (l.reponse_statut === 'envoyee') {
      actionsHaut = '<div style="display:flex;gap:6px;">' +
          '<button class="addb" onclick="marquerTraitee(\'' + l.reponse_id + '\')">Marquer traitée</button>' +
          '<button class="icbtn danger" onclick="supprimerDemande(\'' + l.reponse_id + '\')" title="Supprimer">🗑</button>' +
        '</div>';
    } else {
      actionsHaut = '<div style="display:flex;align-items:center;gap:8px;">' +
          '<span style="font-size:11.5px;color:var(--mu);">✓ Traitée</span>' +
          '<button class="icbtn danger" onclick="supprimerDemande(\'' + l.reponse_id + '\')" title="Supprimer">🗑</button>' +
        '</div>';
    }

    var ligneCreneau = estCreneau && d.date_intervention
      ? (d.hors_horaires ? '<div style="font-size:12px;font-weight:700;color:#9a3412;background:#fff7ed;border:1px solid #fdba74;border-radius:6px;padding:4px 8px;margin-bottom:6px;display:inline-block;">⚠️ Hors horaires habituels</div><br>' : '') +
        '<div style="font-size:13px;font-weight:700;color:var(--ac);margin-bottom:6px;">📅 ' + new Date(d.date_intervention).toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long' }) + ' à ' + (d.heure_debut||'').slice(0,5) + '</div>' +
        (d.reponse_message ? '<div style="font-size:12px;color:var(--mu2);font-style:italic;margin-bottom:6px;">Votre message : « ' + escHtml(d.reponse_message) + ' »</div>' : '')
      : '';

    // Le canal choisi par le client devient l'action principale — l'autre reste visible en secours.
    // L'email est toujours affiché en clair (mailto peu fiable sous Windows) — jamais caché derrière un bouton.
    // Sur une demande OUVERTE pas encore prise en charge, les coordonnées restent masquées :
    // l'artisan doit s'engager (Prendre en charge) avant d'y accéder, pour éviter que le client
    // ne se fasse contacter par des artisans qui n'ont jamais vraiment l'intention de répondre.
    var noteEmail = '<div style="font-size:10.5px;color:var(--mu);margin-top:5px;">⚠️ Cette adresse vous est communiquée uniquement pour répondre à cette demande — pas pour de la prospection commerciale.</div>';
    var blocEmail = '<a href="mailto:' + escHtml(d.client_email) + '" style="display:inline-block;padding:8px 14px;border-radius:8px;background:rgba(181,80,47,.08);border:1px solid var(--ac-brd);color:var(--ac);font-size:13px;font-weight:700;text-decoration:none;font-family:\'JetBrains Mono\',monospace;">📧 ' + escHtml(d.client_email) + '</a>' + noteEmail;
    var contactPref = d.contact_prefere || 'telephone';
    var blocContact;
    if (l.type === 'ouverte') {
      blocContact = '<div style="font-size:12px;color:var(--mu);padding:8px 12px;background:var(--p2);border-radius:8px;">🔒 Coordonnées visibles après prise en charge</div>';
    } else {
      blocContact = (contactPref === 'email' && d.client_email)
        ? blocEmail + (d.client_telephone ? '<div style="font-size:11px;color:var(--mu);margin-top:8px;">ou par téléphone : <a href="tel:' + escHtml(d.client_telephone) + '" style="color:var(--mu2);">' + escHtml(d.client_telephone) + '</a></div>' : '')
        : '<a href="tel:' + escHtml(d.client_telephone) + '" style="display:inline-block;padding:8px 16px;border-radius:8px;background:var(--ac);color:#fff;font-size:12.5px;font-weight:700;text-decoration:none;">📞 Rappeler ' + escHtml(d.client_nom) + '</a>' +
          (d.client_email ? '<div style="margin-top:8px;">ou par email : ' + blocEmail + '</div>' : '');
    }

    return '<div style="border:1px solid var(--brd);border-radius:10px;padding:14px;margin-bottom:10px;">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:8px;">' +
        '<div>' +
          '<strong>' + escHtml(d.client_nom) + '</strong> ' + badgeType + '<br>' +
          '<span style="font-size:12.5px;color:var(--mu);">' + secteurLabelLocal(d.secteur) + ' · 📍 ' + escHtml(d.commune) + ' · ' + dateAff + '</span>' +
        '</div>' +
        actionsHaut +
      '</div>' +
      ligneCreneau +
      (typeInterventionLabelLocal(d.type_intervention) ? '<div style="display:inline-block;font-size:12px;font-weight:700;color:#4338ca;background:#eef2ff;padding:3px 10px;border-radius:20px;margin-bottom:8px;">' + typeInterventionLabelLocal(d.type_intervention) + '</div><br>' : '') +
        ligneVisiteMPA(d) +
      '<div style="font-size:13px;margin-bottom:10px;">' + escHtml(d.description_besoin) + '</div>' +
      ((d.photos && d.photos.length) ?
        '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;">' +
          d.photos.map(function(v) {
            var url = urlPhotoDevis(v);
            if (!url) return '';
            return '<a href="' + escHtml(url) + '" target="_blank" rel="noopener"><img src="' + escHtml(url) + '" style="width:64px;height:64px;object-fit:cover;border-radius:8px;border:1px solid var(--brd);"></a>';
          }).join('') +
        '</div>' : '') +
      '<div style="margin-bottom:8px;">' + blocContact + '</div>' +
      (d.statut === 'creneau_confirme' ? '' :
        '<button onclick="creerClientDepuisDemande(' + jsAttrLocal(d.client_nom) + ',' + jsAttrLocal(d.commune) + ')" style="background:none;border:none;color:var(--ac);font-size:12px;font-weight:600;cursor:pointer;text-decoration:underline;">+ Ajouter comme client habituel</button>') +
    '</div>';
  }).join('');
  zone.innerHTML = barre + htmlCartes;
}

var LABELS_TYPE_INTERVENTION = {
  renseignement: '💬 Devis / Renseignement simple',
  visite: '🚗 Devis / Rendez-vous sur place',
  reservation: '📅 Réservation directe',
  urgence: '🔥 Urgent',
  installation: '📅 Rendez-vous classique',
  devis: '💬 Devis / Renseignement',
  entretien: '🔁 Suivi / Habitué·e',
};
// ── Réglage « mon activité nécessite une visite d'estimation » (MPA-AI le demande, puis case dans « Mon profil ») ──
function majVisiteChamps() { // les frais n'ont de sens que si l'artisan propose la visite
  var c = document.getElementById('m-visite'), bloc = document.getElementById('m-frais-bloc');
  if (c && bloc) bloc.style.display = c.checked ? 'block' : 'none';
}
// Suggestion d'après le métier (jamais imposée) : « oui » pour les métiers où il faut voir le chantier avant de chiffrer (plomberie,
// électricité, mécanique, climatisation, jardinage, maçonnerie, menuiserie, peinture) ; « non » pour ceux où le client réserve directement
// (coiffure, esthétique, cosmétique, pâtisserie, impression). Tout autre secteur : pas de suggestion.
function suggestionVisite(texte) {
  var s = String(texte || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[_\-]+/g, ' '); // « espaces_verts » = « espaces verts »
  if (/plomb/.test(s)) return { reponse: true, phrase: 'En plomberie, c\'est souvent le cas : nous vous suggérons « Oui ».' };
  if (/electr/.test(s)) return { reponse: true, phrase: 'En électricité, c\'est souvent le cas : nous vous suggérons « Oui ».' };
  if (/mecani|garag/.test(s)) return { reponse: true, phrase: 'En mécanique, c\'est souvent le cas : nous vous suggérons « Oui ».' };
  if (/jardin|paysag|espaces? verts?/.test(s)) return { reponse: true, phrase: 'En jardinage, c\'est souvent le cas, car il faut voir le terrain (ou l\'arbre) pour estimer le prix : nous vous suggérons « Oui ».' };
  if (/clim/.test(s)) return { reponse: true, phrase: 'En climatisation, c\'est souvent le cas, car il faut voir l\'emplacement pour estimer le prix : nous vous suggérons « Oui ».' };
  if (/macon/.test(s)) return { reponse: true, phrase: 'En maçonnerie, c\'est souvent le cas, car il faut voir le chantier pour estimer le prix : nous vous suggérons « Oui ».' };
  if (/menuis/.test(s)) return { reponse: true, phrase: 'En menuiserie, c\'est souvent le cas, car il faut prendre les mesures sur place : nous vous suggérons « Oui ».' };
  if (/peintur/.test(s)) return { reponse: true, phrase: 'En peinture, c\'est souvent le cas, car il faut voir les surfaces à peindre pour estimer le prix : nous vous suggérons « Oui ».' };
  // Métiers où le client réserve directement (rien à aller voir avant) : on suggère « Non ».
  if (/coiff/.test(s)) return { reponse: false, phrase: 'En coiffure, vos clients réservent en général directement : nous vous suggérons « Non ».' };
  if (/esthet/.test(s)) return { reponse: false, phrase: 'En esthétique, vos clients réservent en général directement : nous vous suggérons « Non ».' };
  if (/cosmet/.test(s)) return { reponse: false, phrase: 'En cosmétique, vos clients réservent en général directement : nous vous suggérons « Non ».' };
  if (/patisser/.test(s)) return { reponse: false, phrase: 'En pâtisserie, vos clients réservent en général directement : nous vous suggérons « Non ».' };
  if (/impress/.test(s)) return { reponse: false, phrase: 'En impression, vos clients réservent en général directement : nous vous suggérons « Non ».' };
  return { reponse: null, phrase: '' };
}
async function libelleSecteurArtisan() { // « code + libellé » du secteur de l'artisan (le libellé n'est pas chargé au démarrage)
  var texte = String(_artisan.secteur || '');
  try {
    var lib = (_secteursCache || []).find(function(s) { return s.code === _artisan.secteur; });
    if (!lib) { var r = await sb.from('secteurs').select('code, label_fr').eq('code', _artisan.secteur).maybeSingle(); lib = r && r.data; }
    if (lib && lib.label_fr) texte += ' ' + lib.label_fr;
  } catch (e) { /* le code suffit pour la suggestion */ }
  return texte;
}
// ════════════════════════════════════════
//  ASSISTANT DE RÉGLAGE (MPA-AI) — pose les bonnes questions selon ce que l'artisan fait, et règle sa fiche pour lui.
//  Services (interventions) : visite sur place ? frais de déplacement, frais de réservation, annulation gratuite.
//  Ventes (boutique) : explications (paiements, produits phares, partage du lien). Livraison : frais de livraison.
//  Chaque étape : valeur proposée, « Passer » possible, jamais d'effacement silencieux. Les mêmes réglages restent modifiables dans « Mon profil ».
// ════════════════════════════════════════
var _as = null;
function cleAssistant() { return 'mpa_assistant_' + (_artisan ? _artisan.id : ''); }
function lireEtatAssistant() { try { return localStorage.getItem(cleAssistant()) || ''; } catch (e) { return ''; } }
function ecrireEtatAssistant(v) { try { localStorage.setItem(cleAssistant(), v); } catch (e) { /* confort uniquement */ } }

function assistantGroupes() {
  var act = (_artisan && Array.isArray(_artisan.activites) && _artisan.activites.length) ? _artisan.activites : ['interventions', 'boutique', 'livraison'];
  return { services: act.indexOf('interventions') >= 0, ventes: act.indexOf('boutique') >= 0, livraison: act.indexOf('livraison') >= 0 };
}
// Y a-t-il encore quelque chose à régler ? (sert à proposer l'assistant automatiquement, jamais plus d'une fois par session)
function assistantAFaire() {
  if (!_artisan) return false;
  var g = assistantGroupes();
  if (g.services && ('proposer_visite' in _artisan) && _artisan.proposer_visite == null) return true;
  if (g.livraison && ('livraison_forfait_base' in _artisan) && _artisan.livraison_forfait_base == null && _artisan.livraison_km_inclus == null && _artisan.livraison_prix_km_supp == null) return true;
  if (g.ventes && lireEtatAssistant() === '') return true;
  return false;
}
// direct = true : juste après les questions de début (l'assistant s'ouvre) ; false : au démarrage, MPA-AI propose seulement.
async function demanderAssistantReglages(direct) {
  if (window._assistantDit || !_artisan || !assistantAFaire()) return false;
  if (lireEtatAssistant() === 'reporte' || lireEtatAssistant() === 'fait') return false;
  window._assistantDit = true;
  if (direct) { lancerAssistantReglages(); return true; }
  mpaAiDire('Je peux régler votre fiche avec vous en quelques minutes : je vous pose les bonnes questions selon ce que vous faites (déplacements, boutique, livraison), et je remplis pour vous.',
    'pro', { label: 'C\'est parti', action: 'lancerAssistantReglages()' });
  return true;
}

function euroLisible(n) { return Number(n).toFixed(2).replace('.', ',') + ' €'; }
function noteStripeAssistant() {
  if (paiementsEnLigneActifs()) return '';
  return '<div style="margin-top:12px;padding:10px 12px;border-radius:9px;background:#fffbeb;border:1px solid #fde68a;color:#92400e;font-size:12.5px;line-height:1.5;">⚠️ Vos paiements en ligne ne sont pas encore activés : ces frais ne seront demandés à vos clients qu\'une fois Stripe activé. <button class="addb" style="margin-top:6px;" onclick="lancerStripeConnect(this)">Activer mes paiements →</button></div>';
}
function champEuroAssistant(id, valeurInitiale, placeholder) {
  return '<input id="' + id + '" type="text" inputmode="decimal" value="' + (valeurInitiale != null && Number(valeurInitiale) > 0 ? escHtml(String(valeurInitiale).replace('.', ',')) : '') + '" placeholder="' + placeholder + '" style="width:100%;box-sizing:border-box;padding:10px 12px;border-radius:9px;border:1px solid var(--b2);font-size:15px;"/>';
}
function fraisActifsAssistant() {
  var visite = _as.rep.visite !== undefined ? _as.rep.visite : _artisan.proposer_visite === true;
  var dep = _as.rep.deplacement !== undefined ? _as.rep.deplacement : _artisan.frais_deplacement;
  var resa = _as.rep.reservation !== undefined ? _as.rep.reservation : _artisan.frais_reservation;
  return (visite && Number(dep) > 0) || Number(resa) > 0;
}

function etapesAssistant() {
  var g = assistantGroupes(), E = [];
  if (g.services && 'proposer_visite' in _artisan) {
    E.push({ id: 'visite', titre: '🔧 Faut-il aller voir le chantier avant le devis ?',
      rendre: function() {
        var cur = _as.rep.visite !== undefined ? _as.rep.visite : (_artisan.proposer_visite != null ? _artisan.proposer_visite : null);
        var sug = _as.suggestion || { reponse: null, phrase: '' };
        return '<p style="font-size:13.5px;line-height:1.5;margin:0 0 10px;">Pour beaucoup de métiers, on ne peut pas chiffrer sans avoir vu les lieux.</p>' +
          (sug.phrase ? '<div style="font-size:12.5px;color:var(--ac);margin-bottom:10px;">✨ ' + escHtml(sug.phrase) + '</div>' : '') +
          '<label class="act-choix"><input type="radio" name="as-visite" id="as-visite-oui"' + (cur === true ? ' checked' : '') + '/><div><strong>Oui, souvent' + (sug.reponse === true ? ' (suggéré)' : '') + '</strong><span>Vos clients peuvent vous demander de venir voir le chantier : ils choisissent un créneau de visite, et vos frais de déplacement leur sont annoncés avant.</span></div></label>' +
          '<label class="act-choix"><input type="radio" name="as-visite" id="as-visite-non"' + (cur === false ? ' checked' : '') + '/><div><strong>Non, mes clients peuvent réserver directement' + (sug.reponse === false ? ' (suggéré)' : '') + '</strong><span>Ils réservent un créneau sans visite préalable.</span></div></label>';
      },
      valider: function() { var o = document.getElementById('as-visite-oui').checked, n = document.getElementById('as-visite-non').checked; if (!o && !n) return 'Choisissez une réponse (ou « Passer »).'; _as.tmp = o; return null; },
      sauver: async function() {
        var { error } = await sb.from('artisans').update({ proposer_visite: _as.tmp }).eq('id', _artisan.id);
        if (error) return error.message;
        _artisan.proposer_visite = _as.tmp; _as.rep.visite = _as.tmp;
        _as.resume.push(_as.tmp ? 'Visite sur place : vos clients peuvent la demander' : 'Réservation directe, sans visite');
      } });
    E.push({ id: 'deplacement', titre: '🚗 Frais de déplacement (visite sur place)',
      si: function() { return (_as.rep.visite !== undefined ? _as.rep.visite : _artisan.proposer_visite === true) === true; },
      rendre: function() {
        return '<p style="font-size:13.5px;line-height:1.5;margin:0 0 10px;">Le client paie votre déplacement <strong>en ligne</strong> dès sa demande : vous ne vous déplacez plus gratuitement, et la demande ne vous arrive qu\'une fois payée. Il est remboursé automatiquement s\'il annule dans votre délai gratuit, ou si vous refusez ou annulez.</p>' +
          '<label style="font-size:12px;font-weight:600;color:var(--mu2);display:block;margin-bottom:4px;">Montant en € — laissez vide : visite sans frais</label>' + champEuroAssistant('as-dep', _artisan.frais_deplacement, 'Ex. 25') + noteStripeAssistant();
      },
      valider: function() { var r = lireFraisDeplacement(document.getElementById('as-dep').value); if (!r.ok) return 'Indiquez un montant entre 0 et 500 € (par exemple 25 ou 25,50), ou laissez vide.'; _as.tmp = r.valeur; return null; },
      sauver: async function() {
        var { error } = await sb.from('artisans').update({ frais_deplacement: _as.tmp }).eq('id', _artisan.id);
        if (error) return error.message;
        _artisan.frais_deplacement = _as.tmp; _as.rep.deplacement = _as.tmp;
        _as.resume.push(_as.tmp > 0 ? 'Frais de déplacement : ' + euroLisible(_as.tmp) : 'Visite sans frais de déplacement');
      } });
  }
  if (g.services && 'frais_reservation' in _artisan) {
    E.push({ id: 'reservation', titre: '📅 Frais de réservation d\'un créneau',
      rendre: function() {
        return '<p style="font-size:13.5px;line-height:1.5;margin:0 0 10px;">C\'est un acompte payé <strong>en ligne</strong> par le client à la réservation (de 1 à 100 €, et au plus <strong>30 % du prix</strong> de chaque service). Il est déduit du prix final. Il vous assure un revenu si le client manque le rendez-vous, et lui est renvoyé si c\'est vous qui annulez, ou si vous ne répondez pas sous 48 h.</p>' +
          '<div style="font-size:12.5px;color:var(--mu);margin-bottom:10px;">Sans frais, la réservation est gratuite pour vos clients : c\'est le choix le plus simple pour démarrer.</div>' +
          '<label style="font-size:12px;font-weight:600;color:var(--mu2);display:block;margin-bottom:4px;">Montant en € — laissez vide : aucun frais</label>' + champEuroAssistant('as-resa', _artisan.frais_reservation, 'Ex. 10') + noteStripeAssistant();
      },
      valider: function() {
        var r = lireFraisDeplacement(document.getElementById('as-resa').value);
        if (!r.ok || (r.valeur !== null && r.valeur > 0 && r.valeur < 1)) return 'Indiquez un montant entre 1 et 500 € (par exemple 10 ou 12,50), ou laissez vide.';
        _as.tmp = r.valeur; return null;
      },
      sauver: async function() {
        var { error } = await sb.from('artisans').update({ frais_reservation: _as.tmp }).eq('id', _artisan.id);
        if (error) return error.message;
        _artisan.frais_reservation = _as.tmp; _as.rep.reservation = _as.tmp;
        _as.resume.push(_as.tmp > 0 ? 'Frais de réservation : ' + euroLisible(_as.tmp) : 'Réservation gratuite');
      } });
  }
  if (g.services && 'annulation_gratuite_heures' in _artisan) {
    E.push({ id: 'annulation', titre: '↩️ Annulation gratuite par le client',
      si: function() { return fraisActifsAssistant(); },
      rendre: function() {
        var h = Number(_artisan.annulation_gratuite_heures); if (!isFinite(h)) h = 24;
        var opts = [[0, 'Jamais — les frais restent acquis dès la confirmation'], [2, 'Jusqu\'à 2 h avant le rendez-vous'], [6, 'Jusqu\'à 6 h avant le rendez-vous'], [12, 'Jusqu\'à 12 h avant le rendez-vous'], [24, 'Jusqu\'à 24 h avant le rendez-vous'], [48, 'Jusqu\'à 48 h avant le rendez-vous'], [72, 'Jusqu\'à 72 h avant le rendez-vous'], [168, 'Jusqu\'à 7 jours avant le rendez-vous']];
        return '<p style="font-size:13.5px;line-height:1.5;margin:0 0 10px;">Jusqu\'à quand votre client peut-il annuler et être remboursé ? Après ce délai, il perd ses frais et c\'est vous qui les gardez. Avant votre confirmation, il est toujours remboursé.</p>' +
          '<select id="as-annul" style="width:100%;padding:10px 12px;border-radius:9px;border:1px solid var(--b2);font-size:14px;">' + opts.map(function(o) { return '<option value="' + o[0] + '"' + (o[0] === h ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>';
      },
      valider: function() { _as.tmp = parseInt(document.getElementById('as-annul').value, 10) || 0; return null; },
      sauver: async function() {
        var { error } = await sb.from('artisans').update({ annulation_gratuite_heures: _as.tmp }).eq('id', _artisan.id);
        if (error) return error.message;
        _artisan.annulation_gratuite_heures = _as.tmp;
        _as.resume.push(_as.tmp > 0 ? 'Annulation gratuite jusqu\'à ' + _as.tmp + ' h avant' : 'Frais acquis dès la confirmation');
      } });
  }
  if (g.ventes) {
    E.push({ id: 'ventes', titre: '🛍️ Votre boutique en 3 gestes', info: true,
      rendre: function() {
        var actif = paiementsEnLigneActifs();
        return '<div style="font-size:13.5px;line-height:1.55;">' +
          '<p style="margin:0 0 12px;"><strong>1. Activer les paiements.</strong> Vos clients paient en ligne par carte, l\'argent arrive sur votre compte Stripe. ' + (actif ? '<span style="color:#0f9d78;font-weight:700;">✓ Déjà activés.</span>' : 'Ça se fait une fois, en quelques minutes : <button class="addb" onclick="lancerStripeConnect(this)">Activer mes paiements →</button>') + '</p>' +
          '<p style="margin:0 0 12px;"><strong>2. Mettre en avant vos produits phares.</strong> Ce sont les produits montrés en premier sur votre fiche : <strong>1 en offre Essentiel, 4 en offre Pro</strong>. Dans <em>Mes ventes › Mon catalogue</em>, touchez l\'étoile ⭐ d\'un produit.</p>' +
          '<p style="margin:0;"><strong>3. Partager votre boutique par lien.</strong> Envoyez le lien (WhatsApp, Facebook, email) ou imprimez le QR code : <button class="addb" onclick="assistantOuvrirPartage()">🔗 Partager ma boutique</button></p></div>';
      },
      sauver: async function() { ecrireEtatAssistant(lireEtatAssistant() || 'ventes_vu'); _as.resume.push('Boutique : explications vues'); } });
  }
  if (g.livraison && 'livraison_forfait_base' in _artisan) {
    E.push({ id: 'livraison', titre: '🚚 Frais de livraison',
      rendre: function() {
        function v(x) { return x != null ? escHtml(String(x)) : ''; }
        var st = 'width:100%;box-sizing:border-box;padding:10px 12px;border-radius:9px;border:1px solid var(--b2);font-size:15px;';
        return '<p style="font-size:13.5px;line-height:1.5;margin:0 0 10px;">Vos kilomètres sont facturés automatiquement au client selon la distance, à chaque commande. Mettez 0 € pour une livraison gratuite.</p>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;">' +
          '<div><label style="font-size:11.5px;font-weight:600;color:var(--mu2);display:block;margin-bottom:4px;">Forfait de base (€)</label><input id="as-liv-base" type="number" min="0" step="0.5" value="' + v(_artisan.livraison_forfait_base) + '" oninput="assistantExempleLivraison()" style="' + st + '"/></div>' +
          '<div><label style="font-size:11.5px;font-weight:600;color:var(--mu2);display:block;margin-bottom:4px;">Distance incluse (km)</label><input id="as-liv-km" type="number" min="0" step="1" value="' + v(_artisan.livraison_km_inclus) + '" oninput="assistantExempleLivraison()" style="' + st + '"/></div>' +
          '<div><label style="font-size:11.5px;font-weight:600;color:var(--mu2);display:block;margin-bottom:4px;">€/km au-delà</label><input id="as-liv-prix" type="number" min="0" step="0.1" value="' + v(_artisan.livraison_prix_km_supp) + '" oninput="assistantExempleLivraison()" style="' + st + '"/></div></div>' +
          '<div id="as-liv-exemple" style="margin-top:10px;font-size:12.5px;color:var(--mu);"></div>';
      },
      apres: function() { assistantExempleLivraison(); },
      valider: function() {
        var ids = ['as-liv-base', 'as-liv-km', 'as-liv-prix'], vals = [];
        for (var k = 0; k < ids.length; k++) {
          var brut = document.getElementById(ids[k]).value.trim().replace(',', '.');
          if (brut === '') { vals.push(null); continue; }
          var n = parseFloat(brut);
          if (!isFinite(n) || n < 0 || n > 10000) return 'Indiquez des montants positifs (ou laissez vide).';
          vals.push(n);
        }
        _as.tmp = vals; return null;
      },
      sauver: async function() {
        var maj = { livraison_forfait_base: _as.tmp[0], livraison_km_inclus: _as.tmp[1], livraison_prix_km_supp: _as.tmp[2] };
        var { error } = await sb.from('artisans').update(maj).eq('id', _artisan.id);
        if (error) return error.message;
        Object.assign(_artisan, maj);
        var ch = { 'livraison-base': maj.livraison_forfait_base, 'livraison-km-inclus': maj.livraison_km_inclus, 'livraison-prix-km': maj.livraison_prix_km_supp };
        Object.keys(ch).forEach(function(id) { var e = document.getElementById(id); if (e) e.value = ch[id] == null ? '' : ch[id]; });
        try { afficherExempleLivraison(); } catch (e) {}
        _as.resume.push(maj.livraison_forfait_base > 0 || maj.livraison_prix_km_supp > 0 ? 'Livraison : ' + euroLisible(maj.livraison_forfait_base || 0) + ' de base' + (maj.livraison_km_inclus ? ' jusqu\'à ' + maj.livraison_km_inclus + ' km' : '') + (maj.livraison_prix_km_supp > 0 ? ', puis ' + euroLisible(maj.livraison_prix_km_supp) + '/km' : '') : 'Livraison sans frais');
      } });
  }
  return E;
}
function assistantExempleLivraison() {
  var z = document.getElementById('as-liv-exemple'); if (!z) return;
  var b = document.getElementById('as-liv-base').value, k = document.getElementById('as-liv-km').value, p = document.getElementById('as-liv-prix').value;
  if (b === '' || k === '') { z.textContent = ''; return; }
  z.textContent = '💡 ' + b + ' € jusqu\'à ' + k + ' km depuis chez vous' + (p && Number(p) > 0 ? ', puis ' + p + ' € par km supplémentaire.' : ', rien au-delà.');
}
function assistantOuvrirPartage() { assistantFermer(true); setTimeout(function() { ouvrirPartageArtisan('boutique'); }, 50); }

async function lancerAssistantReglages() {
  if (!_artisan) return;
  // L'assistant s'appuie sur ce que l'artisan fait : si pas encore répondu, on commence par cette question.
  if (('activites' in _artisan) && !(Array.isArray(_artisan.activites) && _artisan.activites.length)) { ouvrirQuestionActivites(); return; }
  var panneau = document.getElementById('mpa-ai-panel'); if (panneau) panneau.classList.remove('open');
  _mpaAiFeed = _mpaAiFeed.filter(function(m) { return !(m.cta && m.cta.action === 'lancerAssistantReglages()'); });
  _as = { etapes: etapesAssistant(), cur: null, rep: {}, resume: [], tmp: null, suggestion: null };
  if (!_as.etapes.length) { alert('Il n\'y a rien à régler pour le moment.'); return; }
  if (assistantGroupes().services && _artisan.proposer_visite == null) { try { _as.suggestion = suggestionVisite(await libelleSecteurArtisan()); } catch (e) {} }
  assistantAller(0);
  ouvrirModale('modal-assistant');
}
function assistantActives() { return _as.etapes.filter(function(s) { return !s.si || s.si(); }); }
function assistantAller(index) {
  // Saute les étapes dont la condition n'est plus vraie.
  while (index < _as.etapes.length && _as.etapes[index].si && !_as.etapes[index].si()) index++;
  if (index >= _as.etapes.length) { assistantFin(); return; }
  _as.cur = index;
  var s = _as.etapes[index], actives = assistantActives();
  var pos = actives.indexOf(s) + 1;
  document.getElementById('as-progression').textContent = 'Étape ' + pos + ' sur ' + actives.length;
  document.getElementById('as-titre').textContent = s.titre;
  document.getElementById('as-corps').innerHTML = s.rendre();
  var err = document.getElementById('as-erreur'); err.style.display = 'none';
  document.getElementById('as-suivant').textContent = s.info ? 'Compris' : 'Suivant';
  document.getElementById('as-passer').style.display = s.info ? 'none' : '';
  document.getElementById('as-suivant').disabled = false;
  if (s.apres) s.apres();
}
function assistantErreur(msg) { var e = document.getElementById('as-erreur'); e.textContent = msg; e.style.display = 'block'; }
async function assistantSuivant() {
  var s = _as.etapes[_as.cur]; if (!s) return;
  if (s.valider) { var msg = s.valider(); if (msg) { assistantErreur(msg); return; } }
  var btn = document.getElementById('as-suivant'); btn.disabled = true;
  var erreur = s.sauver ? await s.sauver() : null;
  if (erreur) { assistantErreur('Erreur : ' + erreur); btn.disabled = false; return; }
  assistantAller(_as.cur + 1);
}
function assistantPasser() { assistantAller(_as.cur + 1); }
function assistantFin() {
  document.getElementById('as-progression').textContent = 'Terminé';
  document.getElementById('as-titre').textContent = '✅ C\'est réglé';
  document.getElementById('as-corps').innerHTML =
    (_as.resume.length ? '<ul style="margin:0 0 12px;padding-left:20px;font-size:13.5px;line-height:1.7;">' + _as.resume.map(function(t) { return '<li>' + escHtml(t) + '</li>'; }).join('') + '</ul>' : '<p style="font-size:13.5px;">Rien n\'a été modifié.</p>') +
    '<p style="font-size:12.5px;color:var(--mu);line-height:1.5;margin:0;">Vous pouvez tout changer à tout moment dans « Mon profil › Modifier ». Pour relancer cet assistant : « 🧭 Assistant de réglage » dans Mon profil. Le bouton <strong>?</strong> dans « Mes interventions » rappelle le parcours de vos clients.</p>';
  document.getElementById('as-erreur').style.display = 'none';
  document.getElementById('as-suivant').textContent = 'Fermer';
  document.getElementById('as-suivant').onclick = function() { assistantFermer(); };
  document.getElementById('as-suivant').disabled = false;
  document.getElementById('as-passer').style.display = 'none';
  document.getElementById('as-plus-tard').style.display = 'none';
  ecrireEtatAssistant('fait');
  try { renderFiche(); } catch (e) {}
}
// « Plus tard » : l'assistant ne se rouvre plus tout seul (il reste dans Mon profil).
function assistantFermer(silencieux) {
  fermerModale('modal-assistant');
  if (_as && _as.cur != null && lireEtatAssistant() !== 'fait' && !silencieux) ecrireEtatAssistant('reporte');
  var b = document.getElementById('as-suivant'); if (b) b.onclick = assistantSuivant;
  var pt = document.getElementById('as-plus-tard'); if (pt) pt.style.display = '';
  try { renderFiche(); } catch (e) {}
}

// ════════════════════════════════════════
//  Bouton « ? » de « Mes interventions » : le parcours d'un client, avec les VRAIS réglages de l'artisan.
// ════════════════════════════════════════
function ouvrirAideParcours() {
  var a = _artisan || {}, actif = paiementsEnLigneActifs();
  var resa = Number(a.frais_reservation) || 0, dep = Number(a.frais_deplacement) || 0, visite = a.proposer_visite === true;
  var h = Number(a.annulation_gratuite_heures); if (!isFinite(h)) h = 24;
  var lignesPaiement = [];
  if (actif && resa >= 1) lignesPaiement.push('Réservation directe : le client paie <strong>' + euroLisible(resa) + '</strong> de frais de réservation en ligne, avant que vous voyiez sa demande.');
  if (actif && visite && dep > 0) lignesPaiement.push('Visite sur place : il paie <strong>' + euroLisible(dep) + '</strong> de frais de déplacement en ligne.');
  var etape1Paiement = lignesPaiement.length ? lignesPaiement.join('<br>')
    : 'Aucun paiement à cette étape : la réservation est <strong>gratuite</strong> pour vos clients.';
  var avertissement = (!actif && (resa >= 1 || (visite && dep > 0)))
    ? '<div style="margin-top:8px;padding:8px 10px;border-radius:8px;background:#fffbeb;border:1px solid #fde68a;color:#92400e;font-size:12px;">⚠️ Vos frais ne sont pas demandés tant que vos paiements en ligne ne sont pas activés (Mes ventes › Mon catalogue).</div>' : '';
  var fraisEnJeu = actif && (resa >= 1 || (visite && dep > 0));
  var etape3Annul = fraisEnJeu ? '<br>' + (h > 0 ? 'Il peut annuler gratuitement jusqu\'à <strong>' + h + ' h</strong> avant le rendez-vous ; ensuite, il perd ses frais.' : 'Ses frais restent acquis dès la confirmation.') : '';
  function bloc(n, titre, texte) {
    return '<div style="display:flex;gap:12px;margin-bottom:14px;"><div style="flex-shrink:0;width:26px;height:26px;border-radius:50%;background:var(--ac);color:#fff;font-weight:700;font-size:13px;display:flex;align-items:center;justify-content:center;">' + n + '</div>' +
      '<div style="font-size:13px;line-height:1.55;"><strong>' + titre + '</strong><div style="color:var(--mu2);margin-top:2px;">' + texte + '</div></div></div>';
  }
  document.getElementById('aide-parcours-corps').innerHTML =
    bloc(1, 'Le client réserve', 'Depuis votre fiche ou votre lien de partage, il choisit un créneau libre et laisse ses coordonnées.<br>💳 ' + etape1Paiement + avertissement) +
    bloc(2, 'Vous recevez la demande', 'Un email vous prévient, et la demande apparaît dans « Mes demandes ». Vous confirmez ou vous refusez. <strong>Sans réponse sous 48 h</strong>, ou si vous refusez, les frais éventuellement payés sont remboursés automatiquement.') +
    bloc(3, 'Le client reçoit la confirmation', 'Par email, avec son lien pour annuler.' + etape3Annul) +
    bloc(4, 'Le jour J', 'Vous faites l\'intervention, puis vous la passez en « Terminée » dans « Mes interventions ».') +
    bloc(5, 'Le paiement du solde', '💳 Ouvrez l\'intervention et touchez <strong>« Demander un paiement »</strong> : le client reçoit un lien pour payer par carte, valable 14 jours. Tenez compte des frais déjà payés.<br>🧾 En Pro, « Facturer en 1 clic » crée la facture.') +
    '<div style="font-size:12px;color:var(--mu);border-top:1px solid var(--brd);padding-top:10px;line-height:1.5;">Boutique : le client paie sa commande en ligne au moment de commander. Pour changer vos frais : <a href="#" onclick="fermerModale(\'modal-aide-parcours\');lancerAssistantReglages();return false;" style="color:var(--ac);">🧭 Assistant de réglage</a>.</div>';
  ouvrirModale('modal-aide-parcours');
}

// (ancienne question isolée sur la visite : remplacée par l'assistant ci-dessus, conservée pour mémoire)
async function demanderReglageVisite() {
  if (window._questionVisiteDite || !_artisan || !('proposer_visite' in _artisan) || _artisan.proposer_visite != null) return;
  window._questionVisiteDite = true;
  window._suggestionVisite = suggestionVisite(await libelleSecteurArtisan());
  mpaAiDire('Une question rapide pour votre fiche publique : est-ce qu\'il vous faut souvent aller voir le chantier avant de pouvoir faire votre devis ?' + (window._suggestionVisite.phrase ? ' ' + window._suggestionVisite.phrase : ''),
    'pro', { label: 'Répondre', action: 'ouvrirQuestionVisite()' });
}
function ouvrirQuestionVisite() {
  var sug = window._suggestionVisite || { reponse: null, phrase: '' };
  var zone = document.getElementById('visite-question-suggestion');
  if (zone) { zone.style.display = sug.phrase ? 'block' : 'none'; zone.textContent = sug.phrase ? '✨ ' + sug.phrase : ''; }
  var oui = document.getElementById('visite-btn-oui'), non = document.getElementById('visite-btn-non');
  if (oui) oui.textContent = 'Oui, souvent' + (sug.reponse === true ? ' (suggéré)' : '');
  if (non) non.textContent = 'Non, mes clients peuvent réserver directement' + (sug.reponse === false ? ' (suggéré)' : '');
  var q = document.getElementById('visite-vue-question'), c = document.getElementById('visite-vue-confirmation');
  if (q) q.style.display = 'block'; if (c) c.style.display = 'none';   // toujours la QUESTION à l'ouverture
  ouvrirModale('modal-visite-question');
}
function fermerQuestionVisite() {
  fermerModale('modal-visite-question');
  var panneau = document.getElementById('mpa-ai-panel'); if (panneau) panneau.classList.remove('open'); // le panneau ouvert par la question se referme
}
// Après la réponse : une CONFIRMATION claire (ce que ça change, comment changer d'avis), pas seulement une ligne dans la liste de MPA-AI.
function afficherConfirmationVisite(oui) {
  var q = document.getElementById('visite-vue-question'), c = document.getElementById('visite-vue-confirmation');
  if (!q || !c) { fermerModale('modal-visite-question'); return; }
  document.getElementById('visite-confirm-titre').textContent = oui ? '✅ C\'est noté : oui, il vous faut souvent aller voir le chantier' : '✅ C\'est noté : vos clients réservent directement en ligne.';
  document.getElementById('visite-confirm-effet').textContent = oui
    ? 'Vos clients peuvent maintenant vous demander de venir voir le chantier : ils choisissent un créneau de visite, et vos frais de déplacement leur sont annoncés avant. Pensez à les indiquer.'
    : 'Ils ne verront plus l\'option pour demander un rendez-vous sur place.';
  document.getElementById('visite-confirm-action').textContent = oui ? 'Régler mes frais de déplacement' : 'Changer ma réponse';
  q.style.display = 'none'; c.style.display = 'block';
}
async function repondreQuestionVisite(oui) {
  var { error } = await sb.from('artisans').update({ proposer_visite: oui }).eq('id', _artisan.id);
  if (error) { alert('Erreur : ' + error.message); return; }
  _artisan.proposer_visite = oui;
  renderFiche();
  // La question est traitée : on la retire de la liste de MPA-AI (plus de bouton « Répondre » périmé) et on la remplace par une confirmation.
  _mpaAiFeed = _mpaAiFeed.filter(function(m) { return !(m.cta && m.cta.action === 'ouvrirQuestionVisite()'); });
  mpaAiDire(oui ? 'C\'est noté : vos clients peuvent vous demander de venir voir le chantier. Pensez à indiquer vos frais de déplacement.'
                : 'C\'est noté : vos clients réservent directement en ligne. Ils ne verront plus l\'option pour demander un rendez-vous sur place. Vous pouvez changer cette réponse dans « Mon profil » → Modifier.',
    'info', { label: oui ? 'Régler mes frais' : 'Changer ma réponse', action: 'openModifierFiche()' });
  var panneau = document.getElementById('mpa-ai-panel'); if (panneau) panneau.classList.remove('open');
  afficherConfirmationVisite(oui);
}

// Frais de déplacement saisis par l'artisan : « » = vide ; virgule ou point ; de 0 à 500 € ; au plus 2 décimales.
function lireFraisDeplacement(brut) {
  var original = String(brut == null ? '' : brut).trim();
  if (original === '') return { ok: true, valeur: null }; // champ vide = pas de frais
  var s = original.replace(/\s/g, '').replace('€', '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return { ok: false }; // un champ rempli mais illisible est REFUSÉ (jamais effacé en silence)
  var n = Number(s);
  if (!isFinite(n) || n > 500) return { ok: false };
  return { ok: true, valeur: n };
}
// Rappel sur la carte d'une demande de visite : les frais annoncés au client (figés au moment de sa demande).
function ligneVisiteMPA(d) {
  var pay = d && window._paiementsDemandes && window._paiementsDemandes[d.id];
  if (pay && ['paye', 'partiellement_rembourse', 'rembourse'].indexOf(pay.statut) !== -1) {
    var m = Number(pay.montant).toFixed(2).replace('.', ',');
    var nature = d.type_intervention === 'visite' ? 'frais de déplacement' : 'frais de réservation';
    var suite = pay.statut === 'rembourse' ? 'Ils ont été remboursés au client.' : (d.statut === 'creneau_propose' ? 'Si vous refusez ou ne répondez pas sous 48 h, il est remboursé automatiquement.' : 'Ils sont à vous (net des frais Stripe).');
    return '<div style="font-size:12px;color:#166534;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:6px 10px;margin-bottom:8px;">💶 Le client a déjà payé <strong>' + m + ' €</strong> de ' + nature + ' en ligne. ' + suite + (d.type_intervention === 'visite' ? ' Le devis définitif des travaux est à remettre après la visite.' : '') + '</div>';
  }
  if (!d || d.type_intervention !== 'visite') return '';
  var f = Number(d.frais_deplacement);
  var texte = d.frais_deplacement == null
    ? 'Le client souhaite une visite sur place pour estimer le chantier.'
    : (f > 0 ? 'Frais de déplacement annoncés au client : <strong>' + f.toFixed(2).replace('.', ',') + ' €</strong>, à lui facturer lors de votre visite.' : 'Visite sans frais de déplacement.');
  return '<div style="font-size:12px;color:#1e40af;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:6px 10px;margin-bottom:8px;">🚗 ' + texte + ' Le devis définitif des travaux est à remettre après la visite.</div>';
}
function typeInterventionLabelLocal(code) {
  return LABELS_TYPE_INTERVENTION[code] || null;
}

function secteurLabelLocal(code) {
  // MPA Artisans n'a pas la table secteurs chargée en mémoire comme CaraLink Artisans —
  // on affiche simplement le code proprement capitalisé, suffisant pour un usage interne.
  if (!code) return '—';
  return escHtml(code.charAt(0).toUpperCase() + code.slice(1)); // le secteur d'une demande vient du formulaire d'un visiteur
}

// Valeur à écrire DANS un attribut HTML (onclick="f(' + jsAttrLocal(x) + ')"). Le & doit être échappé EN PREMIER :
// sinon un texte saisi par un visiteur contenant "&quot;" serait décodé par le navigateur en vrai guillemet,
// refermerait la chaîne et exécuterait du code dans la session de l'artisan.
function jsAttrLocal(val) {
  return JSON.stringify(val == null ? '' : String(val))
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function repondreCreneauInApp(token, action) {
  if (!verifierAccesEcriture()) return;
  var message = prompt(action === 'confirmer'
    ? 'Un message pour le client ? (optionnel, laissez vide pour aucun)'
    : 'Une raison à préciser au client ? (modifiable, ou laissez vide pour aucune)',
    action === 'refuser' ? 'Désolé, ce créneau n\'est finalement plus disponible.' : '');
  if (message === null) return; // annulé
  if (action === 'refuser' && !confirm('Confirmer le refus de ce créneau ?')) return;
  try {
    var res = await fetch(SUPABASE_URL + '/functions/v1/repondre-devis', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: token, action: action, message: message }),
    });
    var data = await res.json().catch(function() { return {}; });
    // Le serveur répond maintenant par des données : une proposition déjà traitée, périmée ou en erreur n'est plus prise pour un succès.
    if (!res.ok || !data.ok) throw new Error(data.error || ('Erreur serveur (' + res.status + ')'));
    await chargerDemandes();
    if (action === 'confirmer') await chargerInterventions();
  } catch (e) {
    alert('Erreur : ' + e.message);
  }
}

async function prendreEnCharge(demandeId) {
  if (!verifierAccesEcriture()) return;
  var { error } = await sb.from('devis_reponses').insert({
    demande_id: demandeId, artisan_id: _artisan.id, message: '', statut: 'envoyee',
  });
  if (error) { alert('Erreur : ' + error.message); return; }
  await chargerDemandes();
}

async function marquerTraitee(reponseId) {
  if (!verifierAccesEcriture()) return;
  var { error } = await sb.from('devis_reponses').update({ statut: 'traitee' }).eq('id', reponseId).eq('artisan_id', _artisan.id);
  if (error) { alert('Erreur : ' + error.message); return; }
  await chargerDemandes();
}

async function supprimerDemande(reponseId) {
  if (!verifierAccesEcriture()) return;
  if (!confirm('Retirer cette demande de votre liste ?\n\nElle ne sera plus visible pour vous. Si elle était ouverte à tout votre secteur, les autres artisans continueront de la voir.')) return;
  var { error } = await sb.from('devis_reponses').delete().eq('id', reponseId).eq('artisan_id', _artisan.id);
  if (error) { alert('Erreur : ' + error.message); return; }
  await chargerDemandes();
}

function creerClientDepuisDemande(nom, commune) {
  switchTab(1); switchSousOnglet('nav-profil', 'conteneur-profil', 1);
  openAjouterClient();
  document.getElementById('c-nom').value = nom || '';
  document.getElementById('c-com').value = commune || '';
}



// ════════════════════════════════════════
//  SMART DISPATCH IA — géocodage, trajets, créneaux suggérés
// ════════════════════════════════════════

var _geocodeCache = {}; // clé: "adresse, cp, commune" → {lat, lon}
var _trajetCache = {};  // clé: "lat1,lon1|lat2,lon2" → minutes

function heureVersMin(hhmm) {
  var p = hhmm.split(':');
  return parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
}
function minVersHeure(min) {
  min = Math.max(0, Math.round(min));
  var h = Math.floor(min / 60), m = min % 60;
  return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
}
function arrondirQuart(min) { return Math.ceil(min / 15) * 15; }

async function geocoderAdresse(adresse, cp, commune) {
  var q = [adresse, cp, commune].filter(Boolean).join(', ');
  if (!q) return null;
  if (_geocodeCache[q]) return _geocodeCache[q];
  try {
    var res = await fetch('https://api-adresse.data.gouv.fr/search/?limit=1&q=' + encodeURIComponent(q));
    var data = await res.json();
    var feature = data && data.features && data.features[0];
    if (feature && feature.geometry && feature.geometry.coordinates) {
      var pt = { lat: feature.geometry.coordinates[1], lon: feature.geometry.coordinates[0] };
      _geocodeCache[q] = pt;
      return pt;
    }
  } catch (e) { console.warn('Géocodage échoué :', e); }
  return null;
}

async function tempsTrajetMinutes(latA, lonA, latB, lonB) {
  if (latA == null || lonA == null || latB == null || lonB == null) return null;
  var cle = latA + ',' + lonA + '|' + latB + ',' + lonB;
  if (_trajetCache[cle] != null) return _trajetCache[cle];
  try {
    var url = 'https://data.geopf.fr/navigation/itineraire?resource=bdtopo-osrm&profile=car&optimization=fastest&getSteps=false&geometryFormat=polyline&distanceUnit=meter&timeUnit=second&start=' + lonA + ',' + latA + '&end=' + lonB + ',' + latB;
    var res = await fetch(url);
    var data = await res.json();
    if (data.duration != null) {
      var min = Math.ceil(data.duration / 60);
      _trajetCache[cle] = min;
      return min;
    }
  } catch (e) { console.warn('Calcul de trajet échoué :', e); }
  return null;
}

// Géocode l'intervention en cours de saisie si besoin, et la met à jour en mémoire (mi-lat / mi-lon)
async function geocoderInterventionCourante() {
  var adresse = document.getElementById('mi-adr').value.trim();
  var cp = document.getElementById('mi-cp').value.trim();
  var commune = document.getElementById('mi-com').value.trim();
  if (!adresse) return null;
  return await geocoderAdresse(adresse, cp, commune);
}

function preRemplirAdresseIntervention() {
  var clientId = document.getElementById('mi-client').value;
  var c = _clientsCache.find(function(x) { return x.id === clientId; });
  if (c) {
    document.getElementById('mi-adr').value = c.adresse || '';
    document.getElementById('mi-cp').value = c.code_postal || '';
    document.getElementById('mi-com').value = c.commune || '';
  }
  calculerCreneaux();
}

// Tarif indicatif du service → prix proposé pour l'intervention. Forfait ou sans unité : tel quel ; à l'heure : × la durée ;
// autre unité (m², jour…) : aucun calcul (on ne connaît pas la quantité), le tarif est seulement rappelé.
function suggestionPrixService(serviceId, dureeMin) {
  var sv = _servicesCache.find(function(x) { return x.id === serviceId; });
  if (!sv || !(Number(sv.prix_indicatif) > 0)) return { valeur: null, texte: '' };
  var pu = Number(sv.prix_indicatif), unite = String(sv.unite || '').trim().toLowerCase();
  var rappel = 'Tarif indicatif de ce service : ' + eurosMPA(pu) + (sv.unite ? ' / ' + sv.unite : '') + '.';
  if (!unite || unite.indexOf('forfait') >= 0) return { valeur: pu, texte: rappel + ' Prix proposé : modifiez-le si besoin.' };
  if (/^(h|heure|heures)$/.test(unite) && dureeMin > 0) { var v = Math.round(pu * dureeMin / 60 * 100) / 100; return { valeur: v, texte: rappel + ' Prix proposé pour ' + dureeMin + ' min : ' + eurosMPA(v) + ' — modifiez-le si besoin.' }; }
  return { valeur: null, texte: rappel + ' Indiquez le prix total de l\'intervention.' };
}

function preRemplirDureeIntervention() {
  var serviceId = document.getElementById('mi-service').value;
  var s = _servicesCache.find(function(x) { return x.id === serviceId; });
  if (s && s.duree_estimee_min && !document.getElementById('mi-duree').value) {
    document.getElementById('mi-duree').value = s.duree_estimee_min;
  }
  majPrixSuggere();
  calculerCreneaux();
}

// Le prix proposé suit le service et la durée, TANT QUE l'artisan ne l'a pas saisi lui-même :
// un prix tapé à la main n'est jamais écrasé ; un prix proposé automatiquement est recalculé quand la durée change.
function majPrixSuggere() {
  var champ = document.getElementById('mi-prix');
  var serviceId = document.getElementById('mi-service').value;
  var s = _servicesCache.find(function(x) { return x.id === serviceId; });
  var duree = parseInt(document.getElementById('mi-duree').value, 10) || (s && s.duree_estimee_min) || 0;
  var sug = suggestionPrixService(serviceId, duree);
  var hint = document.getElementById('mi-prix-hint'); if (hint) hint.textContent = sug.texte;
  var vide = champ.value === '';
  var suitEncore = champ.dataset.auto === '1' && Number(champ.value) === Number(champ.dataset.autoVal);
  if (sug.valeur != null && (vide || suitEncore)) {
    champ.value = sug.valeur;
    champ.dataset.auto = '1'; champ.dataset.autoVal = String(sug.valeur);
  } else if (sug.valeur == null && suitEncore) {
    // Le nouveau service n'a pas de prix proposable (autre unité) : on retire l'ancien prix automatique, qui n'est plus le bon.
    champ.value = '';
    champ.dataset.auto = '0';
  }
}

function surDureeChangee() {
  majPrixSuggere();
  calculerCreneaux();
}

function recalculerHeureFin() {
  var debut = document.getElementById('mi-heure-debut').value;
  var duree = parseInt(document.getElementById('mi-duree').value, 10);
  if (debut && duree) {
    document.getElementById('mi-heure-fin').value = minVersHeure(heureVersMin(debut) + duree);
  }
  if (debut) {
    document.getElementById('mi-creneau').value = heureVersMin(debut) < 12 * 60 ? 'matin' : 'apres_midi';
  }
}

function choisirCreneau(debut) {
  document.getElementById('mi-heure-debut').value = debut;
  recalculerHeureFin();
}

var _calculCreneauxToken = 0;

var MARGE_SECURITE_MIN = 10; // tampon de sécurité ajouté après chaque trajet calculé

async function calculerCreneaux() {
  var zone = document.getElementById('mi-creneaux-zone');
  if (!zone) return;
  var monToken = ++_calculCreneauxToken; // évite qu'une réponse tardive écrase un calcul plus récent

  var dateStr = document.getElementById('mi-date').value;
  var duree = parseInt(document.getElementById('mi-duree').value, 10);
  var adresse = document.getElementById('mi-adr').value.trim();

  if (!dateStr || !adresse || !duree) {
    zone.innerHTML = 'Renseignez la date, l\'adresse et la durée pour voir un créneau suggéré à la suite de votre dernier rendez-vous du jour.';
    return;
  }

  var duJour = _interventionsCache.filter(function(i) {
    return i.date_intervention === dateStr && i.id !== _interventionEnCours && i.statut !== 'annulee' && i.heure_debut && i.heure_fin;
  }).sort(function(a, b) { return a.heure_debut.localeCompare(b.heure_debut); });

  if (!duJour.length) {
    zone.innerHTML = 'C\'est votre première intervention de la journée — choisissez vous-même l\'heure de début (07:00 par défaut).';
    return;
  }

  zone.innerHTML = '⏳ Calcul du créneau…';
  var pt = await geocoderInterventionCourante();
  if (monToken !== _calculCreneauxToken) return;
  if (!pt) {
    zone.innerHTML = '<span style="color:var(--gold);">⚠ Adresse introuvable — vous pouvez saisir l\'heure manuellement, mais je ne peux pas vérifier le trajet.</span>';
    return;
  }

  var creneaux = [];
  for (var k = 0; k < duJour.length; k++) {
    var prev = duJour[k];
    var next = duJour[k + 1] || null;
    if (prev.latitude == null) continue; // intervention jamais géocodée : on ne devine pas, on saute ce trou par prudence

    var travelIn = await tempsTrajetMinutes(prev.latitude, prev.longitude, pt.lat, pt.lon);
    if (monToken !== _calculCreneauxToken) return;
    if (travelIn == null) continue;

    var debutMin = arrondirQuart(heureVersMin(prev.heure_fin.slice(0, 5)) + travelIn + MARGE_SECURITE_MIN);

    if (next) {
      if (next.latitude == null) continue;
      var travelOut = await tempsTrajetMinutes(pt.lat, pt.lon, next.latitude, next.longitude);
      if (monToken !== _calculCreneauxToken) return;
      if (travelOut == null) continue;
      if (debutMin + duree + travelOut + MARGE_SECURITE_MIN > heureVersMin(next.heure_debut.slice(0, 5))) continue; // ne rentre pas dans le trou disponible
    }

    creneaux.push({ debut: minVersHeure(debutMin), travelIn: travelIn, apres: prev.heure_fin.slice(0, 5) });
  }

  if (!creneaux.length) {
    zone.innerHTML = '<span style="color:var(--danger);">⚠ Aucun créneau ne semble tenir compte-tenu de vos trajets ce jour-là. Vous pouvez tout de même saisir une heure à la main.</span>';
    return;
  }

  zone.innerHTML = creneaux.map(function(c) {
    return '<button type="button" onclick="choisirCreneau(\'' + c.debut + '\')" style="padding:7px 12px;margin:3px 4px 3px 0;border-radius:8px;border:1px solid var(--ac-brd);background:var(--panel);color:var(--ac);font-weight:700;font-size:13px;cursor:pointer;">' +
      c.debut + '<span style="display:block;font-weight:400;color:var(--mu);font-size:9.5px;">après ' + c.apres + ' +' + c.travelIn + ' min trajet</span></button>';
  }).join('');
}

// Vérification après enregistrement — jamais bloquante, juste informative
// Détection de journée chargée — volontairement modeste : jamais de prétention à connaître le
// trafic réel du moment (aucune API ne nous donne ça). Se contente de repérer un signal simple
// et honnête : une journée déjà bien remplie, proche (dans les 3 prochains jours, l'esprit
// "dernière minute"), à laquelle on vient d'ajouter une intervention dans un secteur différent
// du reste. Jamais bloquant — juste un signal de tension, pour que l'artisan le sache avant
// d'être surpris sur le terrain.
const SEUIL_JOURNEE_CHARGEE = 3;
const FENETRE_DERNIERE_MINUTE_JOURS = 3;

async function verifierTensionJournee(dateStr, communeNouvelle, idAExclure) {
  if (!estPro()) return; // réservé à l'offre Pro (simple message d'information, jamais bloquant)
  if (!communeNouvelle) return; // rien à comparer sans commune

  var aujourdhui = new Date(); aujourdhui.setHours(0, 0, 0, 0);
  var dateCible = new Date(dateStr + 'T00:00:00');
  var joursAvant = Math.round((dateCible - aujourdhui) / 86400000);
  if (joursAvant < 0 || joursAvant > FENETRE_DERNIERE_MINUTE_JOURS) return; // pas "dernière minute"

  var requete = sb.from('mpa_artisans_interventions')
    .select('id, commune')
    .eq('artisan_id', _artisan.id)
    .eq('date_intervention', dateStr)
    .neq('statut', 'annulee');
  if (idAExclure) requete = requete.neq('id', idAExclure);
  var { data: autres } = await requete;
  if (!autres || autres.length < SEUIL_JOURNEE_CHARGEE - 1) return; // pas assez chargée

  // Secteur dominant du jour = la commune la plus fréquente parmi les autres interventions.
  var compteurs = {};
  autres.forEach(function(a) {
    var c = (a.commune || '').trim().toLowerCase();
    if (!c) return;
    compteurs[c] = (compteurs[c] || 0) + 1;
  });
  var secteurDominant = Object.keys(compteurs).sort(function(x, y) { return compteurs[y] - compteurs[x]; })[0];
  if (!secteurDominant) return; // aucune commune connue parmi les autres, rien à comparer

  var communeNouvelleNorm = communeNouvelle.trim().toLowerCase();
  if (communeNouvelleNorm === secteurDominant) return; // même secteur, pas de tension à signaler

  var dateAff = dateCible.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  var nbTotal = autres.length + 1;
  mpaAiDire(
    '📅 Vous avez déjà ' + autres.length + ' intervention' + (autres.length > 1 ? 's' : '') + ' prévue' + (autres.length > 1 ? 's' : '') + ' ' + dateAff +
    ' (secteur ' + escHtml(secteurDominant.charAt(0).toUpperCase() + secteurDominant.slice(1)) + '), et vous venez d\'en ajouter une à ' + escHtml(communeNouvelle) +
    ' — un secteur différent. Avec ' + nbTotal + ' interventions ce jour-là, le planning risque d\'être serré.',
    'warning',
    { label: 'Voir mon planning', action: "switchTab(2)" },
  );
}

async function verifierFaisabiliteJour(dateStr, idAModifier) {
  var duJour = _interventionsCache.filter(function(i) {
    return i.date_intervention === dateStr && i.statut !== 'annulee' && i.heure_debut && i.heure_fin && i.latitude != null;
  }).sort(function(a, b) { return a.heure_debut.localeCompare(b.heure_debut); });

  var alertes = [];
  for (var k = 0; k < duJour.length - 1; k++) {
    var a = duJour[k], b = duJour[k + 1];
    var travel = await tempsTrajetMinutes(a.latitude, a.longitude, b.latitude, b.longitude);
    if (travel == null) continue;
    var finA = heureVersMin(a.heure_fin.slice(0,5));
    var debutB = heureVersMin(b.heure_debut.slice(0,5));
    if (finA + travel > debutB) {
      alertes.push('Entre ' + a.heure_fin.slice(0,5) + ' et ' + b.heure_debut.slice(0,5) + ' : ' + travel + ' min de trajet nécessaires, ' + (debutB - finA) + ' min seulement disponibles.');
    }
  }
  if (alertes.length) {
    alert('⚠ Attention, ce planning semble serré :\n\n' + alertes.join('\n'));
  }
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
  var enRetard = await trouverPrestationAnnuaireEnRetard();
  if (enRetard) {
    var dateAff = new Date(enRetard.date_intervention + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
    alert('Impossible de planifier une nouvelle intervention tant qu\'une prestation passée (' + dateAff + ') n\'est pas soldée.\n\nOuvrez-la et marquez-la au moins "En cours" (si vous vous en occupez encore), ou "Terminée"/"Annulée" si c\'est fini.');
    return;
  }
  window._commandeEnLivraison = null;
  await remplirSelectsIntervention();
  majVerrouLivraisonIntervention(null);
  _interventionEnCours = null;
  document.getElementById('mi-titre').textContent = 'Nouvelle intervention';
  document.getElementById('mi-date').value = dateStr;
  document.getElementById('mi-creneau').value = creneau;

  var premiereDuJour = !_interventionsCache.some(function(i) {
    return i.date_intervention === dateStr && i.statut !== 'annulee' && i.heure_debut;
  });
  if (premiereDuJour) {
    document.getElementById('mi-heure-debut').value = creneau === 'matin' ? '07:00' : '14:00';
    document.getElementById('mi-heure-fin').value = creneau === 'matin' ? '09:00' : '16:00';
  } else {
    document.getElementById('mi-heure-debut').value = '';
    document.getElementById('mi-heure-fin').value = '';
  }
  document.getElementById('mi-client').value = '';
  majVerrouClientIntervention(false);
  document.getElementById('mi-adr').value = '';
  document.getElementById('mi-cp').value = '';
  document.getElementById('mi-com').value = '';
  document.getElementById('mi-service').value = '';
  document.getElementById('mi-duree').value = '';
  document.getElementById('mi-creneaux-zone').innerHTML = 'Renseignez la date, l\'adresse et la durée pour voir les créneaux qui tiennent compte de vos trajets.';
  document.getElementById('mi-prix').value = '';
  document.getElementById('mi-prix').dataset.auto = '0';
  var hintN = document.getElementById('mi-prix-hint'); if (hintN) hintN.textContent = '';
  document.getElementById('mi-notes').value = '';
  document.getElementById('mi-statut').value = 'planifiee';
  masquerOptionPayee(false);
  document.getElementById('mi-date-paiement').value = '';
  document.getElementById('mi-date-paiement-wrap').style.display = 'none';
  document.getElementById('mi-delete-wrap').style.display = 'none';
  document.getElementById('mi-impossible-wrap').style.display = 'none';
  var zonePaiement = document.getElementById('mi-paiement-wrap'); if (zonePaiement) { zonePaiement.style.display = 'none'; zonePaiement.innerHTML = ''; }
  var zoneFacture = document.getElementById('mi-facture-wrap'); if (zoneFacture) { zoneFacture.style.display = 'none'; zoneFacture.innerHTML = ''; }
  ouvrirModale('modal-intervention');
}

// Le client d'une intervention EXISTANTE ne se change pas quand il vient de l'annuaire (ni pour un client « à la main », ni pour « aucun
// client ») : sinon la prestation sortirait de la base de la commission. La base applique la même règle (securite-prestations-client.sql).
function majVerrouClientIntervention(existante) {
  var sel = document.getElementById('mi-client'); if (!sel) return;
  var c = (_clientsCache || []).find(function(x) { return x.id === sel.value; });
  var verrou = !!existante && !!c && c.origine === 'annuaire';
  sel.disabled = verrou;
  var note = document.getElementById('mi-client-note'); if (note) note.style.display = verrou ? 'block' : 'none';
}

// Intervention de LIVRAISON d'une commande : tout vient de la commande (client, adresse, prix = frais déjà payés). Seuls le jour, le créneau et les heures se choisissent.
// Une intervention de LIVRAISON n'a pas de service : on l'affiche comme telle (jamais « sans service »), et ses frais sont déjà réglés avec la commande.
function estLivraisonIntervention(i) {
  return !!i && (/^Livraison\b/i.test(i.notes || '') || (typeof _commandesCache !== 'undefined' && (_commandesCache || []).some(function(c) { return c.intervention_id === i.id; })));
}
function libelleServiceIntervention(i, brut) {
  var nom = i.artisans_services && i.artisans_services.nom_service;
  if (nom) return nom;
  return estLivraisonIntervention(i) ? (brut ? 'Livraison' : '🚚 Livraison') : '(sans service)';
}
var CHAMPS_VERROU_LIVRAISON = ['mi-client', 'mi-adr', 'mi-cp', 'mi-com', 'mi-service', 'mi-prix'];
function majVerrouLivraisonIntervention(commande, nouvelle) {
  CHAMPS_VERROU_LIVRAISON.forEach(function(id) { var el = document.getElementById(id); if (el) el.disabled = !!commande; });
  var st = document.getElementById('mi-statut'); if (st && nouvelle !== undefined && commande && nouvelle) st.disabled = true; else if (st) st.disabled = false;
  var ban = document.getElementById('mi-liv-banner');
  if (!ban) {
    ban = document.createElement('div'); ban.id = 'mi-liv-banner';
    ban.style.cssText = 'display:none;margin:0 0 12px;padding:10px 12px;border-radius:8px;background:rgba(181,80,47,.08);border:1px solid rgba(181,80,47,.25);font-size:12.5px;line-height:1.5;';
    var titre = document.getElementById('mi-titre'); titre.parentNode.insertBefore(ban, titre.nextSibling);
  }
  if (!commande) { ban.style.display = 'none'; return; }
  ban.innerHTML = '🚚 <strong>Livraison de la commande de ' + escHtml(commande.client_nom) + '</strong> — le client, l\'adresse et le prix (frais de livraison déjà payés) viennent de la commande et ne se modifient pas ici.<br>' +
    (commande.livraison_debut && commande.livraison_fin ? 'Fenêtre annoncée au client : du <strong>' + dateCourteFR(commande.livraison_debut) + '</strong> au <strong>' + dateCourteFR(commande.livraison_fin) + '</strong>. ' : '') +
    'Choisissez le <strong>jour, le créneau et les heures</strong> : le client sera prévenu par email.';
  ban.style.display = 'block';
}

async function ouvrirIntervention(id) {
  await remplirSelectsIntervention();
  var i = _interventionsCache.find(function(x) { return x.id === id; });
  if (!i) return;
  _interventionEnCours = id;
  document.getElementById('mi-titre').textContent = 'Modifier l\'intervention';
  var _commandeLiee = (_commandesCache || []).find(function(c) { return c.intervention_id === id; }) || null;
  document.getElementById('mi-date').value = i.date_intervention;
  document.getElementById('mi-creneau').value = i.creneau || 'matin';
  document.getElementById('mi-heure-debut').value = i.heure_debut ? i.heure_debut.slice(0,5) : '';
  document.getElementById('mi-heure-fin').value = i.heure_fin ? i.heure_fin.slice(0,5) : '';
  document.getElementById('mi-client').value = i.client_id || '';
  majVerrouClientIntervention(true);
  document.getElementById('mi-adr').value = i.adresse || '';
  document.getElementById('mi-cp').value = i.code_postal || '';
  document.getElementById('mi-com').value = i.commune || '';
  document.getElementById('mi-service').value = i.service_id || '';
  document.getElementById('mi-duree').value = (i.heure_debut && i.heure_fin) ? (heureVersMin(i.heure_fin.slice(0,5)) - heureVersMin(i.heure_debut.slice(0,5))) : '';
  document.getElementById('mi-prix').value = i.prix == null ? '' : i.prix;
  document.getElementById('mi-prix').dataset.auto = '0';
  var hintP = document.getElementById('mi-prix-hint'); if (hintP) hintP.textContent = (i.prix == null && i.service_id) ? suggestionPrixService(i.service_id, i.duree_min || 0).texte : (i.prix === 0 || i.prix === '0' ? 'Intervention marquée gratuite.' : '');
  document.getElementById('mi-notes').value = i.notes || '';
  masquerOptionPayee(i.statut === 'payee');
  document.getElementById('mi-statut').value = i.statut || 'planifiee';
  document.getElementById('mi-date-paiement').value = i.date_paiement || '';
  toggleDatePaiement();
  majVerrouLivraisonIntervention(_commandeLiee, false);
  document.getElementById('mi-delete-wrap').style.display = 'block';
  document.getElementById('mi-impossible-wrap').style.display = ['planifiee', 'en_cours'].indexOf(i.statut || 'planifiee') !== -1 ? 'block' : 'none';
  renderZoneAvisIntervention(i);
  if (i.facture_id && !_numerosFactures[i.facture_id]) await chargerFacturesCommandes();
  renderZoneFactureIntervention(i);
  chargerPaiementsIntervention(i);
  ouvrirModale('modal-intervention');
  calculerCreneaux();
}

// ════════════════════════════════════════
//  PAIEMENTS EN LIGNE D'UNE INTERVENTION (15/10/2026)
//  Frais de réservation / de déplacement payés à la réservation, et paiements demandés après la visite (« Demander un paiement »).
// ════════════════════════════════════════
var _paiementsIntervention = [];
// Ce que le client a déjà payé en ligne (net des remboursements), et la part qui est un ACOMPTE sur le prix (frais de réservation, pas frais de déplacement d'une visite).
function netPaiement(p) { return Number(p.montant) - Number(p.montant_rembourse || 0); }
function dejaPayeEnLigne() {
  return _paiementsIntervention.filter(function(p) { return ['paye', 'partiellement_rembourse'].indexOf(p.statut) !== -1; }).reduce(function(t, p) { return t + netPaiement(p); }, 0);
}
function acompteDejaPaye() {
  return _paiementsIntervention.filter(function(p) { return p.type === 'reservation' && !p._visite && ['paye', 'partiellement_rembourse'].indexOf(p.statut) !== -1; }).reduce(function(t, p) { return t + netPaiement(p); }, 0);
}
function eurosMPA(n) { return Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'; }

async function chargerPaiementsIntervention(i) {
  var zone = document.getElementById('mi-paiement-wrap');
  if (!zone) return;
  _paiementsIntervention = [];
  if (!i || i.statut === 'annulee') { zone.style.display = 'none'; zone.innerHTML = ''; return; }
  zone.style.display = 'block';
  zone.innerHTML = '<div style="font-size:12px;color:var(--mu);">Chargement des paiements…</div>';
  try {
    var { data, error } = await sb.from('paiements_prestations').select('*').eq('artisan_id', _artisan.id).eq('intervention_id', i.id)
      .neq('statut', 'annule').order('created_at', { ascending: true });
    if (error) throw error;
    // Un lien de paiement (solde) expiré reste visible : l'artisan voit pourquoi rien n'est arrivé. Une réservation expirée, non.
    _paiementsIntervention = (data || []).filter(function(p) { return p.statut !== 'expire' || p.type === 'solde'; });
    // Les frais de DÉPLACEMENT d'une visite ne sont pas un acompte sur le prix : on repère ces paiements pour ne pas les déduire automatiquement.
    try {
      var idsDemandes = _paiementsIntervention.filter(function(p) { return p.type === 'reservation' && p.demande_id; }).map(function(p) { return p.demande_id; });
      if (idsDemandes.length) {
        var rd = await sb.from('demandes_devis').select('id, type_intervention').in('id', idsDemandes);
        var visites = {}; (rd.data || []).forEach(function(d) { if (d.type_intervention === 'visite') visites[d.id] = true; });
        _paiementsIntervention.forEach(function(p) { p._visite = !!visites[p.demande_id]; });
      }
    } catch (e) { /* facultatif : sans cette information, tous les frais de réservation sont traités comme un acompte */ }
  } catch (e) { _paiementsIntervention = []; } // table pas encore créée (SQL pas lancé) : on affiche seulement le bouton « Payé en main propre »
  renderPaiementsIntervention(i);
}

function renderPaiementsIntervention(i) {
  var zone = document.getElementById('mi-paiement-wrap');
  if (!zone) return;
  var libelleStatut = { expire: '⌛ lien expiré sans paiement', en_attente: '⏳ en attente de paiement', paye: '✅ payé', partiellement_rembourse: '↩️ remboursé en partie', rembourse: '↩️ remboursé' };
  var lignes = _paiementsIntervention.map(function(p) {
    var nom = p.type === 'reservation' ? 'Frais payés à la réservation' : 'Paiement demandé';
    var datePaye = p.paye_le ? ' le ' + new Date(p.paye_le).toLocaleDateString('fr-FR') : '';
    var actions = '';
    if (['paye', 'partiellement_rembourse'].indexOf(p.statut) !== -1) actions = ' <button type="button" onclick="rembourserPaiementPrestation(\'' + p.id + '\')" style="background:none;border:none;color:var(--danger);font-size:12px;cursor:pointer;text-decoration:underline;">Rembourser</button>';
    var detailAttente = '';
    if (p.type === 'solde' && p.statut === 'en_attente') detailAttente = detailAttentePaiement(p);
    if (p.type === 'solde' && p.statut === 'expire') detailAttente = '<div style="font-size:11.5px;color:var(--mu);margin:3px 0 0 22px;">Le client n\'a pas payé' + historiqueRelances(p) + '. Contactez-le, ou créez un nouveau lien avec « Demander un paiement ».' + boutonMarquerPaye(p) + '</div>';
    if (p.statut === 'en_attente') actions = ' <button type="button" onclick="copierLienPaiementPrestation(\'' + p.token + '\')" style="background:none;border:none;color:var(--ac);font-size:12px;cursor:pointer;text-decoration:underline;">Copier le lien</button>';
    if (p.conditions_acceptees_le) actions += ' <button type="button" onclick="ouvrirPreuveConsentement(\'' + p.id + '\')" style="background:none;border:none;color:var(--ac);font-size:12px;cursor:pointer;text-decoration:underline;">📜 Preuve d\'acceptation</button>';
    var reste = Number(p.montant_rembourse) > 0 ? ' (remboursé : ' + eurosMPA(p.montant_rembourse) + ')' : '';
    return '<div style="font-size:12.5px;margin-bottom:6px;">💶 ' + nom + ' : <strong>' + eurosMPA(p.montant) + '</strong> — ' + (libelleStatut[p.statut] || escHtml(p.statut)) + datePaye + reste + actions + detailAttente + '</div>';
  }).join('');
  var livraisonCommande = estLivraisonIntervention(i);
  var peutDemander = !livraisonCommande && paiementsEnLigneActifs() && ['annulee'].indexOf(i.statut) === -1;
  var dejaPayee = i.statut === 'payee';
  var payeEnLigne = _paiementsIntervention.some(function(p) { return p.type === 'solde' && ['paye', 'partiellement_rembourse', 'rembourse'].indexOf(p.statut) !== -1; });
  var noteLivraison = livraisonCommande ? '<div style="font-size:12.5px;margin-top:8px;text-align:center;color:var(--mu);">🚚 Livraison : les frais ont déjà été réglés en ligne avec la commande. Rien à demander au client.</div>' : '';
  var etatPaye = dejaPayee ? '<div style="font-size:12.5px;margin-top:8px;text-align:center;">' + (payeEnLigne ? '🟢 Payée en ligne via CaraLink' : '🟢 Payée en main propre <span style="color:var(--mu);">(hors CaraLink)</span>') + '</div>' : '';
  var blocPropre = (i.statut === 'terminee' && !livraisonCommande)
    ? '<div style="text-align:center;margin-top:10px;"><button type="button" onclick="payerEnMainPropre(null, true)" style="padding:9px 18px;border-radius:8px;border:1.5px solid #16a34a;background:rgba(34,197,94,.08);color:#15803d;font-size:13px;font-weight:700;cursor:pointer;">💵 Payé en main propre</button><div style="font-size:11px;color:var(--mu);margin-top:5px;">Espèces, chèque, virement… tout paiement reçu hors CaraLink.</div></div>'
    : '';
  var enAttente = _paiementsIntervention.some(function(p) { return p.type === 'solde' && p.statut === 'en_attente' && Date.now() - new Date(p.created_at).getTime() < 14 * 86400000; });
  zone.innerHTML = (lignes || '') +
    (peutDemander && dejaPayee
      ? '<div style="text-align:center;margin-top:6px;"><button type="button" disabled aria-disabled="true" style="padding:9px 18px;border-radius:8px;border:1.5px solid var(--b2);background:var(--bg);color:var(--mu);font-size:13px;font-weight:700;cursor:not-allowed;opacity:.65;">💶 Demander un paiement</button><div style="font-size:11px;color:var(--mu);margin-top:5px;">Cette intervention est déjà payée. Pour redemander un paiement, repassez-la d\'abord en « Terminée ».</div></div>'
      : peutDemander && enAttente
      ? '<div style="text-align:center;margin-top:6px;"><button type="button" disabled aria-disabled="true" style="padding:9px 18px;border-radius:8px;border:1.5px solid var(--b2);background:var(--bg);color:var(--mu);font-size:13px;font-weight:700;cursor:not-allowed;opacity:.65;">💶 Demander un paiement</button><div style="font-size:11px;color:var(--mu);margin-top:5px;">⏳ Une demande de paiement est déjà en attente. Utilisez « Relancer » ci-dessus pour rappeler votre client.</div></div>'
      : peutDemander
      ? '<div style="text-align:center;margin-top:6px;"><button type="button" onclick="ouvrirDemandePaiement()" style="padding:9px 18px;border-radius:8px;border:1.5px solid var(--ac);background:var(--ac);color:#fff;font-size:13px;font-weight:700;cursor:pointer;">💶 Demander un paiement</button><div style="font-size:11px;color:var(--mu);margin-top:5px;">Envoie à votre client un lien de paiement par carte pour le montant de votre devis.</div></div>'
      : (lignes ? '' : '<div style="font-size:11.5px;color:var(--mu);text-align:center;">Activez vos paiements en ligne (Mon profil) pour pouvoir demander un paiement à vos clients.</div>')) + blocPropre + etatPaye + noteLivraison;
}

// ── Relances d'un lien de paiement non réglé ──
function historiqueRelances(p) {
  var h = Array.isArray(p.relances_historique) ? p.relances_historique : [];
  if (!h.length) return '';
  return ' · relances : ' + h.map(function(r) { return new Date(r.le).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) + (r.par === 'auto' ? ' (auto)' : ' (vous)'); }).join(', ');
}
function boutonMarquerPaye(p) {
  return ' <button type="button" onclick="payerEnMainPropre(null, true)" style="background:none;border:none;color:var(--ac);font-size:12px;cursor:pointer;text-decoration:underline;">Le client a payé autrement ? 💵 Payé en main propre</button>';
}
function detailAttentePaiement(p) {
  var creeLe = new Date(p.created_at).getTime(), maintenant = Date.now();
  var jours = Math.floor((maintenant - creeLe) / 86400000);
  var expireLe = new Date(creeLe + 14 * 86400000).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
  var nb = Number(p.relances_nb || 0);
  var dernier = new Date(p.derniere_relance_le || p.created_at).getTime();
  var heuresRestantes = Math.ceil((24 * 3600000 - (maintenant - dernier)) / 3600000);
  var bouton;
  var styleDesactive = 'padding:5px 12px;border-radius:7px;border:1.5px solid var(--b2);background:var(--bg);color:var(--mu);font-size:12px;font-weight:700;cursor:not-allowed;opacity:.7;';
  if (!p.client_email) bouton = '<span style="color:var(--mu);">Pas d\'email pour ce client : copiez le lien et envoyez-le vous-même (SMS, WhatsApp).</span>';
  else if (nb >= 2) bouton = '<button type="button" disabled aria-disabled="true" style="' + styleDesactive + '">✉️ Relancer (2/2)</button> <span style="color:var(--mu);">2 relances envoyées : c\'était la dernière.</span>';
  else if (heuresRestantes > 0) bouton = '<button type="button" disabled aria-disabled="true" style="' + styleDesactive + '">✉️ Relancer (' + nb + '/2)</button> <span style="color:var(--mu);">Disponible dans ' + (heuresRestantes > 1 ? heuresRestantes + ' h' : '1 h') + ' : une relance n\'est possible que 24 h après la demande de paiement' + (nb > 0 ? ' (ou après la précédente relance)' : '') + '.</span>';
  else bouton = '<button type="button" onclick="relancerPaiementPrestation(\'' + p.id + '\')" style="padding:5px 12px;border-radius:7px;border:1.5px solid var(--ac);background:transparent;color:var(--ac);font-size:12px;font-weight:700;cursor:pointer;">✉️ Relancer (' + nb + '/2)</button>';
  if (p.client_email) bouton += '<br><span style="color:var(--mu);">Le client a perdu l\'email ? </span><button type="button" onclick="renvoyerLienPaiement(\'' + p.id + '\')" style="background:none;border:none;color:var(--ac);font-size:11.5px;cursor:pointer;text-decoration:underline;padding:0;">Renvoyer le même lien</button>';
  var auto = (p.relance_auto && nb < 2) ? '<br>🤖 Relance automatique prévue si le client ne paie pas.' : '';
  return '<div style="font-size:11.5px;color:var(--mu);margin:3px 0 0 22px;line-height:1.6;">Lien envoyé il y a ' + (jours < 1 ? 'moins d\'un jour' : jours + ' jour' + (jours > 1 ? 's' : '')) + ', valable jusqu\'au ' + expireLe + historiqueRelances(p) + '.' + auto + '<br>' + bouton + boutonMarquerPaye(p) + '</div>';
}
async function relancerPaiementPrestation(id) {
  var p = _paiementsIntervention.find(function(x) { return x.id === id; });
  if (!p) return;
  if (!confirm('Renvoyer l\'email de paiement à ' + (p.client_nom || 'votre client') + ' ?\n\nVous pouvez le faire 2 fois au plus, une fois par jour.')) return;
  try {
    var { data: { session: authSession } } = await sb.auth.getSession();
    var res = await fetch(SUPABASE_URL + '/functions/v1/relancer-paiement', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authSession.access_token },
      body: JSON.stringify({ paiement_id: id }),
    });
    var data = await res.json();
    if (data.error) {
      var messages = {
        relance_trop_tot: 'Une relance a déjà été envoyée il y a moins de 24 h. Réessayez dans ' + (data.dans_heures || 24) + ' h.',
        relances_epuisees: 'Les 2 relances ont déjà été envoyées.',
        lien_expire: 'Ce lien a expiré : créez-en un nouveau avec « Demander un paiement ».',
        deja_paye: 'Ce paiement a déjà été réglé.',
        lien_inactif: 'Ce lien n\'est plus actif.',
        email_client_manquant: 'Ce client n\'a pas d\'email : copiez le lien et envoyez-le lui vous-même.',
        email_non_envoye: 'L\'email n\'a pas pu partir. Réessayez dans un instant.',
        relance_en_cours: 'Une relance est déjà en cours.',
      };
      throw new Error(messages[data.error] || data.error);
    }
    mpaAiDire('✉️ Relance envoyée à ' + escHtml(p.client_nom || 'votre client') + '.' + (data.derniere ? ' C\'était la dernière : le lien expire à la date prévue.' : ''), 'info');
    var i = _interventionsCache.find(function(x) { return x.id === _interventionEnCours; });
    if (i) await chargerPaiementsIntervention(i);
  } catch (e) { alert(e.message); }
}
// « Le client a perdu l'email » : le même lien est renvoyé tel quel, avec confirmation. Cela ne compte pas comme une relance.
async function renvoyerLienPaiement(id) {
  var p = _paiementsIntervention.find(function(x) { return x.id === id; });
  if (!p) return;
  if (!confirm('Renvoyer le MÊME lien de paiement (' + eurosMPA(p.montant) + ') par email à ' + (p.client_nom || 'votre client') + ' (' + (p.client_email || '') + ') ?\n\nÀ utiliser s\'il a perdu le premier email. Cela ne compte pas comme une relance (3 renvois par jour au plus).')) return;
  try {
    var { data: { session: authSession } } = await sb.auth.getSession();
    var res = await fetch(SUPABASE_URL + '/functions/v1/relancer-paiement', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authSession.access_token },
      body: JSON.stringify({ paiement_id: id, renvoi: true }),
    });
    var data = await res.json();
    if (data.error) {
      var messages = { renvoi_trop_souvent: 'Vous avez déjà renvoyé ce lien 3 fois aujourd\'hui. Réessayez demain, ou copiez le lien pour l\'envoyer vous-même.', lien_expire: 'Ce lien a expiré : créez-en un nouveau.', deja_paye: 'Ce paiement a déjà été réglé.', lien_inactif: 'Ce lien n\'est plus actif.', email_non_envoye: 'L\'email n\'a pas pu partir. Réessayez dans un instant.' };
      throw new Error(messages[data.error] || data.error);
    }
    alert('✅ Le lien de paiement a été renvoyé à ' + (p.client_email || 'votre client') + '.');
  } catch (e) { alert(e.message); }
}
// Paiement reçu hors CaraLink (espèces, chèque, virement…) : l'intervention passe en « Payée » ; la base annule alors un éventuel lien en attente.
async function payerEnMainPropre(id, depuisModale) {
  if (!verifierAccesEcriture()) return;
  var i = _interventionsCache.find(function(x) { return x.id === (id || _interventionEnCours); });
  if (!i) return;
  if (i.statut === 'payee') { alert('Cette intervention est déjà payée.'); return; }
  if (i.prix == null || i.prix === '') { demanderPrixPuis(i, function() { payerEnMainPropre(i.id, depuisModale); }); return; }
  var client = (i.mpa_artisans_clients && i.mpa_artisans_clients.nom) || 'votre client';
  var lienEnAttente = (_paiementsIntervention || []).some(function(p) { return p.intervention_id === i.id && p.type === 'solde' && p.statut === 'en_attente'; });
  if (!confirm('💵 Marquer cette intervention « Payée en main propre » ?\n\n' + client + ' vous a réglé ' + (Number(i.prix) > 0 ? eurosMPA(i.prix) : '') + ' hors CaraLink (espèces, chèque, virement…).' + (lienEnAttente ? '\n\nLe lien de paiement en ligne déjà envoyé sera annulé : il ne pourra plus payer.' : '') + '\n\nLe montant compte dans votre chiffre d\'affaires, sans frais de paiement en ligne.')) return;
  var { error } = await sb.from('mpa_artisans_interventions').update({ statut: 'payee', date_paiement: new Date(Date.now() - 4 * 3600 * 1000).toISOString().slice(0, 10) }).eq('id', i.id).eq('artisan_id', _artisan.id);
  if (error) { alert('Erreur : ' + error.message); return; }
  mpaAiDire('💵 Intervention marquée « Payée en main propre »' + (lienEnAttente ? ' ; le lien de paiement en ligne a été annulé.' : '.'), 'info');
  await chargerInterventions();
  if (document.getElementById('p-compta').classList.contains('active')) await chargerCompta();
  if (depuisModale) await ouvrirIntervention(i.id);
}

function copierLienPaiementPrestation(token) {
  var lien = 'https://caralink.app/artisans/payer-prestation.html?token=' + encodeURIComponent(token);
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(lien).then(function() { mpaAiDire('🔗 Lien de paiement copié : vous pouvez le coller dans un SMS ou un message WhatsApp.', 'info'); }, function() { prompt('Copiez ce lien :', lien); });
  else prompt('Copiez ce lien :', lien);
}

function ouvrirDemandePaiement() {
  var i = _interventionsCache.find(function(x) { return x.id === _interventionEnCours; });
  if (!i) return;
  if ((_commandesCache || []).some(function(c) { return c.intervention_id === i.id; })) { alert('Les frais de cette livraison ont déjà été réglés en ligne avec la commande : il n\'y a rien à demander au client.'); return; }
  if (i.statut === 'payee') { alert('Cette intervention est déjà payée : il n\'y a plus rien à demander. Repassez-la en « Terminée » si vous devez encore encaisser un montant.'); return; }
  // Un lien est déjà en attente : le bouton est grisé (voir renderPaiementsIntervention) ; ce garde-fou couvre un clic déjà parti.
  if ((_paiementsIntervention || []).some(function(p) { return p.type === 'solde' && p.statut === 'en_attente' && Date.now() - new Date(p.created_at).getTime() < 14 * 86400000; })) { alert('Un paiement est déjà en attente pour cette intervention : utilisez « Relancer » (ou « Renvoyer le même lien »).'); return; }
  var client = i.mpa_artisans_clients || {};
  var dateAff = new Date(i.date_intervention + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  document.getElementById('dp-resume').textContent = (client.nom || 'Client') + ' — ' + dateAff;
  // Les frais de réservation sont un acompte inclus dans le prix : on demande le RESTE (prix − acompte déjà payé).
  var acompte = acompteDejaPaye();
  var reste = i.prix ? Math.round((Number(i.prix) - acompte) * 100) / 100 : 0;
  document.getElementById('dp-montant').value = reste > 0 ? String(reste).replace('.', ',') : '';
  document.getElementById('dp-description').value = '';
  document.getElementById('dp-email').value = client.email || '';
  var dejaPaye = _paiementsIntervention.filter(function(p) { return ['paye', 'partiellement_rembourse'].indexOf(p.statut) !== -1; }).reduce(function(s, p) { return s + Number(p.montant) - Number(p.montant_rembourse || 0); }, 0);
  var autresPayes = Math.round((dejaPaye - acompte) * 100) / 100;
  var noteAcompte = '';
  if (acompte > 0 && i.prix) noteAcompte = '💡 Le client a déjà payé <strong>' + eurosMPA(acompte) + '</strong> de frais de réservation : c\'est un acompte, il est <strong>déduit automatiquement</strong> du prix de ' + eurosMPA(i.prix) + (reste > 0 ? ' (reste à payer : <strong>' + eurosMPA(reste) + '</strong>).' : '. Il n\'y a plus rien à demander : le prix est déjà couvert.') + '<br>';
  else if (acompte > 0) noteAcompte = '💡 Le client a déjà payé <strong>' + eurosMPA(acompte) + '</strong> de frais de réservation (acompte) : déduisez-le du montant que vous demandez.<br>';
  if (autresPayes > 0.004) noteAcompte += '💡 Le client a aussi payé <strong>' + eurosMPA(autresPayes) + '</strong> de frais de déplacement : non déduits automatiquement, à vous de décider.<br>';
  document.getElementById('dp-note').innerHTML = noteAcompte +
    '✉️ Le client reçoit un email avec le lien de paiement (valable 14 jours). Vous pouvez aussi copier le lien ensuite et l\'envoyer vous-même.<br>🏦 L\'argent arrive tout de suite sur votre compte Stripe, puis sur votre compte bancaire sous quelques jours (délai fixé par Stripe, pas par CaraLink).';
  var caseAuto = document.getElementById('dp-relance-auto');
  if (caseAuto) { caseAuto.checked = estPro(); caseAuto.disabled = !estPro(); }
  var noteAuto = document.getElementById('dp-relance-note');
  if (noteAuto) noteAuto.textContent = estPro() ? 'Si le client n\'a pas payé, MPA-AI le relance par email à J+3 puis à J+10 (la dernière fois), à votre nom. Vous gardez la main : vous pouvez aussi relancer vous-même, 2 fois au plus.' : 'Offre Pro : relance automatique du client à J+3 et J+10. Vous pouvez toujours le relancer vous-même, 2 fois au plus.';
  document.getElementById('btn-dp').disabled = false;
  document.getElementById('btn-dp').textContent = 'Envoyer la demande de paiement';
  fermerModale('modal-intervention');
  ouvrirModale('modal-demander-paiement');
}

async function confirmerDemandePaiement() {
  var i = _interventionsCache.find(function(x) { return x.id === _interventionEnCours; });
  if (!i) return;
  var brut = document.getElementById('dp-montant').value.replace(/\s/g, '').replace('€', '').replace(',', '.');
  var montant = Number(brut);
  if (!/^\d+(\.\d{1,2})?$/.test(brut) || !isFinite(montant) || montant < 0.5 || montant > 10000) { alert('Indiquez un montant valide (de 0,50 € à 10 000 €), par exemple 180 ou 180,50.'); return; }
  // Cohérence avec le prix de l'intervention : ce que le client a déjà payé + ce qu'on lui demande ne doit pas dépasser le prix enregistré.
  var dejaPayeNet = _paiementsIntervention.filter(function(p) { return ['paye', 'partiellement_rembourse'].indexOf(p.statut) !== -1; }).reduce(function(t, p) { return t + Number(p.montant) - Number(p.montant_rembourse || 0); }, 0);
  var totalAttendu = Math.round((montant + dejaPayeNet) * 100) / 100;
  if (Number(i.prix) > 0 && totalAttendu > Number(i.prix) + 0.005) {
    if (!confirm('Le prix enregistré pour cette intervention est de ' + eurosMPA(i.prix) + ', mais vous demandez ' + eurosMPA(montant) + (dejaPayeNet > 0 ? ' en plus des ' + eurosMPA(dejaPayeNet) + ' déjà payés en ligne' : '') + ', soit ' + eurosMPA(totalAttendu) + ' au total.\n\nMettre le prix de l\'intervention à ' + eurosMPA(totalAttendu) + ' et envoyer la demande ?\n\n(Annuler : revenir pour corriger le montant.)')) return;
    var { error: errMaj } = await sb.from('mpa_artisans_interventions').update({ prix: totalAttendu }).eq('id', i.id).eq('artisan_id', _artisan.id);
    if (errMaj) { alert('Erreur : ' + errMaj.message); return; }
    i.prix = totalAttendu;
  }
  var btn = document.getElementById('btn-dp');
  btn.disabled = true; btn.textContent = 'Envoi…';
  try {
    var { data: { session: authSession } } = await sb.auth.getSession();
    var res = await fetch(SUPABASE_URL + '/functions/v1/demander-paiement-prestation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authSession.access_token },
      body: JSON.stringify({ intervention_id: i.id, montant: montant, description: document.getElementById('dp-description').value, client_email: document.getElementById('dp-email').value.trim(), relance_auto: !!(document.getElementById('dp-relance-auto') && document.getElementById('dp-relance-auto').checked) }),
    });
    var data = await res.json();
    if (data.error === 'paiement_deja_en_attente') throw new Error('Un paiement est déjà en attente pour cette intervention : utilisez « Relancer » (ou « Renvoyer le même lien »).');
    if (data.error) throw new Error(data.error);
    fermerModale('modal-demander-paiement');
    // Sans prix sur l'intervention, elle compterait pour 0 € dans le chiffre d'affaires et ne pourrait pas être facturée : on le renseigne.
    if (i.prix == null || i.prix === '') {
      var prixTotal = Math.round((montant + (Number(data.deja_paye_en_ligne) || 0)) * 100) / 100;
      var { error: errPrix } = await sb.from('mpa_artisans_interventions').update({ prix: prixTotal }).eq('id', i.id).eq('artisan_id', _artisan.id);
      if (!errPrix) { i.prix = prixTotal; mpaAiDire('🏷️ Cette intervention n\'avait pas de prix : j\'ai enregistré ' + eurosMPA(prixTotal) + ' (ce que vous demandez' + (data.deja_paye_en_ligne > 0 ? ', plus ' + eurosMPA(data.deja_paye_en_ligne) + ' déjà payés en ligne' : '') + '), pour votre chiffre d\'affaires et votre facture. Modifiable dans l\'intervention.', 'info'); }
    }
    if (data.email_envoye) mpaAiDire('💶 Demande de paiement de ' + eurosMPA(montant) + ' envoyée à votre client par email. Vous serez prévenu dès qu\'il aura payé.', 'info');
    else {
      mpaAiDire('💶 Demande de paiement créée (' + eurosMPA(montant) + '), mais ' + (data.sans_email ? 'ce client n\'a pas d\'email' : 'l\'email n\'a pas pu partir') + ' : copiez le lien et envoyez-le lui vous-même.', 'warning');
      try { await navigator.clipboard.writeText(data.lien); } catch (_) { prompt('Copiez ce lien et envoyez-le à votre client :', data.lien); }
    }
    await ouvrirIntervention(i.id);
  } catch (e) {
    alert('Erreur : ' + e.message);
    btn.disabled = false; btn.textContent = 'Envoyer la demande de paiement';
  }
}

async function rembourserPaiementPrestation(paiementId) {
  var p = _paiementsIntervention.find(function(x) { return x.id === paiementId; });
  if (!p) return;
  var reste = Number(p.montant) - Number(p.montant_rembourse || 0);
  var saisie = prompt('Montant à rembourser à votre client (maximum ' + eurosMPA(reste) + ') :', String(reste.toFixed(2)).replace('.', ','));
  if (saisie === null) return;
  var montant = Number(String(saisie).replace(/\s/g, '').replace('€', '').replace(',', '.'));
  if (!isFinite(montant) || montant <= 0 || montant > reste + 0.001) { alert('Montant invalide (entre 0,01 € et ' + eurosMPA(reste) + ').'); return; }
  if (!confirm('Rembourser ' + eurosMPA(montant) + ' à votre client ? Cette action est définitive.')) return;
  try {
    var { data: { session: authSession } } = await sb.auth.getSession();
    var res = await fetch(SUPABASE_URL + '/functions/v1/rembourser-prestation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authSession.access_token },
      body: JSON.stringify({ paiement_id: paiementId, montant: montant, motif: 'Remboursement demandé par l\'artisan' }),
    });
    var data = await res.json();
    if (data.error) throw new Error(data.error);
    mpaAiDire('↩️ ' + eurosMPA(data.rembourse) + ' remboursés à votre client. Il en est prévenu par email.', 'info');
    var i = _interventionsCache.find(function(x) { return x.id === _interventionEnCours; });
    if (i) await chargerPaiementsIntervention(i);
  } catch (e) { alert('Erreur : ' + e.message); }
}

// ── « Impossible d'honorer » : annule l'intervention et prévient le client par email ──
function ouvrirImpossibleHonorer() {
  var i = _interventionsCache.find(function(x) { return x.id === _interventionEnCours; });
  if (!i) return;
  var client = i.mpa_artisans_clients || {};
  var service = i.artisans_services ? i.artisans_services.nom_service : '';
  var dateAff = new Date(i.date_intervention + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  document.getElementById('imp-resume').textContent = (client.nom || 'Client') + ' — ' + dateAff + (i.heure_debut ? ' à ' + i.heure_debut.slice(0, 5) : '') + (service ? ' — ' + service : '');
  document.getElementById('imp-motif').value = 'imprevu';
  document.getElementById('imp-message').value = '';
  document.getElementById('imp-date').value = '';
  document.getElementById('imp-note').innerHTML = client.email
    ? '✉️ Un email sera envoyé à <strong>' + escHtml(client.email) + '</strong>.'
    : '⚠️ Ce client n\'a pas d\'adresse email : <strong>prévenez-le vous-même</strong>' + (client.telephone ? ' au ' + escHtml(client.telephone) : '') + '.';
  var payesEnLigne = (_paiementsIntervention || []).filter(function(p) { return ['paye', 'partiellement_rembourse'].indexOf(p.statut) !== -1; }).reduce(function(t, p) { return t + Number(p.montant) - Number(p.montant_rembourse || 0); }, 0);
  if (payesEnLigne > 0) document.getElementById('imp-note').innerHTML += '<br>💶 Les <strong>' + eurosMPA(payesEnLigne) + '</strong> déjà payés en ligne par ce client lui seront <strong>remboursés automatiquement</strong>.';
  document.getElementById('btn-impossible').disabled = false;
  document.getElementById('btn-impossible').textContent = 'Annuler et prévenir mon client';
  fermerModale('modal-intervention');
  ouvrirModale('modal-impossible');
}

async function confirmerImpossibleHonorer() {
  if (!verifierAccesEcriture()) return;
  var id = _interventionEnCours;
  var btn = document.getElementById('btn-impossible');
  btn.disabled = true; btn.textContent = 'Envoi…';
  try {
    var { data: { session: authSession } } = await sb.auth.getSession();
    var res = await fetch(SUPABASE_URL + '/functions/v1/annuler-intervention', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authSession.access_token },
      body: JSON.stringify({
        intervention_id: id,
        motif: document.getElementById('imp-motif').value,
        message: document.getElementById('imp-message').value,
        nouvelle_date: document.getElementById('imp-date').value,
      }),
    });
    var data = await res.json();
    if (data.error) throw new Error(data.error);
    fermerModale('modal-impossible');
    await chargerInterventions();
    var msg = data.client_prevenu
      ? '🚫 Rendez-vous annulé. Votre client a été prévenu par email.'
      : '🚫 Rendez-vous annulé. ' + (data.client_sans_email ? 'Ce client n\'a pas d\'email : pensez à le prévenir directement.' : 'L\'email n\'a pas pu partir : prévenez votre client directement.');
    mpaAiDire(msg, data.client_prevenu ? 'info' : 'warning');
    if (data.commande_liee && data.commande_id) {
      await chargerCommandes(); await chargerLivraisons();
      mpaAiDire('📦 Cette intervention était la livraison d\'une commande de votre boutique. La commande n\'est pas perdue : elle est revenue à « Prête, à planifier ». Que voulez-vous faire ?', 'important', [
        { label: '🚚 Choisir une nouvelle date', action: "planifierLivraisonCommande('" + data.commande_id + "')" },
        { label: '↩️ Rembourser la commande', action: "ouvrirRemboursement('" + data.commande_id + "')" } ]);
    }
  } catch (e) {
    alert('Erreur : ' + e.message);
    btn.disabled = false; btn.textContent = 'Annuler et prévenir mon client';
  }
}

function renderZoneAvisIntervention(i) {
  var zone = document.getElementById('mi-avis-wrap');
  if (!zone) return;
  if (!['terminee', 'payee'].includes(i.statut)) { zone.style.display = 'none'; return; }
  zone.style.display = 'block';
  if (i.avis_demande_le) {
    var dateAff = new Date(i.avis_demande_le).toLocaleDateString('fr-FR');
    zone.innerHTML =
      '<div style="font-size:12px;color:var(--mu);margin-bottom:6px;">✅ Avis demandé le ' + dateAff + '</div>' +
      '<button onclick="demanderAvis(\'' + i.id + '\')" style="background:none;border:none;color:var(--ac);font-size:12px;cursor:pointer;text-decoration:underline;">Renvoyer l\'email de demande</button>';
  } else {
    zone.innerHTML =
      '<button id="btn-demander-avis" onclick="demanderAvis(\'' + i.id + '\')" style="padding:9px 18px;border-radius:8px;border:1.5px solid var(--ac);background:transparent;color:var(--ac);font-size:12.5px;font-weight:700;cursor:pointer;">⭐ Demander un avis au client</button>';
  }
}

async function signalerRetard(interventionId) {
  if (!verifierAccesEcriture()) return;
  if (!exigerPro('retard')) return;
  var i = (_itinInterventionsSemaine || []).find(function(x) { return x.id === interventionId; });
  if (!i) return;
  var client = i.mpa_artisans_clients;
  if (!client || !client.email) { alert('Ce client n\'a pas d\'email enregistré — impossible de le prévenir automatiquement.'); return; }

  var minutes = prompt('Combien de minutes de retard environ, pour ' + client.nom + ' ?', '15');
  if (minutes === null) return; // annulé
  minutes = parseInt(minutes, 10);
  if (!minutes || minutes <= 0) { alert('Indiquez un nombre de minutes valide.'); return; }

  try {
    var { data: { session: authSession } } = await sb.auth.getSession();
    var res = await fetch(SUPABASE_URL + '/functions/v1/signaler-retard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authSession.access_token },
      body: JSON.stringify({ intervention_id: interventionId, minutes: minutes }),
    });
    var data = await res.json();
    if (data.error) throw new Error(data.error);
    mpaAiDire('⏰ ' + escHtml(client.nom) + ' a été prévenu(e) d\'un retard d\'environ ' + minutes + ' minutes.', 'info');
    alert('✅ Message envoyé : ' + client.nom + ' (' + client.email + ') a été prévenu(e) d\'un retard d\'environ ' + minutes + ' minutes.');
  } catch (e) {
    if (!traiterErreurPlan(e)) alert('Erreur : ' + e.message);
  }
}

async function demanderAvis(interventionId) {
  if (!verifierAccesEcriture()) return;
  var btn = document.getElementById('btn-demander-avis');
  if (btn) { btn.disabled = true; btn.textContent = 'Envoi…'; }
  try {
    var { data: { session: authSession } } = await sb.auth.getSession();
    var res = await fetch(SUPABASE_URL + '/functions/v1/demander-avis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authSession.access_token },
      body: JSON.stringify({ intervention_id: interventionId }),
    });
    var data = await res.json();
    if (data.error) throw new Error(data.error);
    var i = _interventionsCache.find(function(x) { return x.id === interventionId; });
    if (i) i.avis_demande_le = new Date().toISOString();
    renderZoneAvisIntervention(i);
    alert('Demande d\'avis envoyée par email au client.');
  } catch (e) {
    alert('Erreur : ' + e.message);
    if (btn) { btn.disabled = false; btn.textContent = '⭐ Demander un avis au client'; }
  }
}

// ── Onglet Avis ──
var _avisCache = [];

async function chargerAvis() {
  var { data, error } = await sb.from('avis_carapro').select('*').eq('artisan_id', _artisan.id).order('created_at', { ascending: false });
  if (error) { console.error('chargerAvis:', error); return; }
  _avisCache = data || [];
  renderAvis();
}

function renderAvis() {
  var zone = document.getElementById('zone-avis');
  var zoneMoyenne = document.getElementById('avis-moyenne');
  if (!zone) return;

  if (!_avisCache.length) {
    zone.innerHTML = '<p style="font-size:13px;color:var(--mu);">Aucun avis pour l\'instant. Demandez-en un depuis une intervention Terminée ou Payée.</p>';
    if (zoneMoyenne) zoneMoyenne.textContent = '';
    return;
  }

  var moyenne = _avisCache.reduce(function(s, a) { return s + a.note; }, 0) / _avisCache.length;
  if (zoneMoyenne) zoneMoyenne.textContent = '⭐ ' + moyenne.toFixed(1) + ' (' + _avisCache.length + ' avis)';

  zone.innerHTML = _avisCache.map(function(a) {
    var dateAff = new Date(a.created_at).toLocaleDateString('fr-FR');
    var etoiles = '★'.repeat(a.note) + '☆'.repeat(5 - a.note);
    var reponseHtml = a.reponse_artisan
      ? '<div style="margin-top:10px;padding:10px 12px;background:var(--p2);border-radius:8px;font-size:12.5px;"><strong style="color:var(--ac);">Votre réponse :</strong> ' + escHtml(a.reponse_artisan) + '</div>'
      : '<div style="margin-top:10px;">' +
          '<button onclick="ouvrirReponseAvis(\'' + a.id + '\')" id="btn-repondre-' + a.id + '" style="background:none;border:none;color:var(--ac);font-size:12px;font-weight:700;cursor:pointer;text-decoration:underline;">Répondre à cet avis</button>' +
          '<div id="zone-reponse-' + a.id + '" style="display:none;margin-top:8px;">' +
            '<textarea id="txt-reponse-' + a.id + '" rows="2" placeholder="Votre réponse publique…" style="width:100%;padding:8px 10px;border-radius:8px;border:1px solid var(--b2);font-family:Outfit,sans-serif;font-size:13px;box-sizing:border-box;"></textarea>' +
            '<button onclick="envoyerReponseAvis(\'' + a.id + '\')" style="margin-top:6px;padding:6px 14px;border-radius:7px;border:none;background:var(--ac);color:#fff;font-size:12px;font-weight:700;cursor:pointer;">Envoyer</button>' +
          '</div>' +
        '</div>';
    return '<div style="border:1px solid var(--brd);border-radius:10px;padding:14px;margin-bottom:10px;">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
        '<strong style="font-size:13px;">' + escHtml(a.client_nom || 'Client CaraLink') + '</strong>' +
        '<span style="font-size:11px;color:var(--mu);">' + dateAff + '</span>' +
      '</div>' +
      '<div style="color:#f59e0b;font-size:15px;letter-spacing:1px;">' + etoiles + '</div>' +
      (a.commentaire ? '<div style="font-size:13px;color:var(--mu2);margin-top:6px;">' + escHtml(a.commentaire) + '</div>' : '') +
      reponseHtml +
    '</div>';
  }).join('');
}

function ouvrirReponseAvis(avisId) {
  var btn = document.getElementById('btn-repondre-' + avisId);
  var zone = document.getElementById('zone-reponse-' + avisId);
  if (btn) btn.style.display = 'none';
  if (zone) zone.style.display = 'block';
}

async function envoyerReponseAvis(avisId) {
  if (!verifierAccesEcriture()) return;
  var texte = document.getElementById('txt-reponse-' + avisId).value.trim();
  if (!texte) { alert('Écrivez une réponse avant d\'envoyer.'); return; }
  try {
    var { data: { session: authSession } } = await sb.auth.getSession();
    var res = await fetch(SUPABASE_URL + '/functions/v1/repondre-avis-artisan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authSession.access_token },
      body: JSON.stringify({ avis_id: avisId, reponse: texte }),
    });
    var data = await res.json();
    if (data.error) throw new Error(data.error);
    await chargerAvis();
  } catch (e) {
    alert('Erreur : ' + e.message);
  }
}

// « Payée » ne se choisit plus à la main : elle vient du paiement en ligne ou du bouton « Payé en main propre ». Le choix reste visible seulement pour une intervention déjà payée.
function masquerOptionPayee(dejaPayee) {
  var o = document.querySelector('#mi-statut option[value="payee"]');
  if (o) { o.hidden = !dejaPayee; o.disabled = !dejaPayee; }
}
function toggleDatePaiement() {
  var statut = document.getElementById('mi-statut').value;
  var wrap = document.getElementById('mi-date-paiement-wrap');
  wrap.style.display = statut === 'payee' ? 'block' : 'none';
  if (statut === 'payee' && !document.getElementById('mi-date-paiement').value) {
    document.getElementById('mi-date-paiement').value = new Date().toISOString().slice(0, 10);
  }
}

// ── Avis produit (CaraLink Artisans / MPA Artisans) ──
// Projet LearnLogic (coqprurgsvfxddbmwtor) — distinct du projet CaraLink Artisans.
// Public, non authentifié : l'artisan écrit son nom lui-même, l'avis part en
// attente de validation avant de pouvoir apparaître sur les bannières.
var AVIS_PRODUIT_URL = 'https://coqprurgsvfxddbmwtor.supabase.co/functions/v1/lire-avis';
var AVIS_PRODUIT_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNvcXBydXJnc3ZmeGRkYm13dG9yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0OTg5OTcsImV4cCI6MjA5NDA3NDk5N30.v_8LietUpGkZVgyKgqojE2HoMIE7Y0GVO7fi9AWm4IY';

function ouvrirAvisProduit() {
  document.getElementById('ap-nom').value = _artisan.nom_entreprise || '';
  document.getElementById('ap-texte').value = '';
  document.getElementById('ap-err').style.display = 'none';
  document.getElementById('ap-ok').style.display = 'none';
  ouvrirModale('modal-avis-produit');
}

async function envoyerAvisProduit() {
  var nom = document.getElementById('ap-nom').value.trim();
  var texte = document.getElementById('ap-texte').value.trim();
  var err = document.getElementById('ap-err');
  var ok = document.getElementById('ap-ok');
  var btn = document.getElementById('btn-avis-produit');
  err.style.display = 'none'; ok.style.display = 'none';

  if (!nom) { err.textContent = 'Le nom à afficher est obligatoire.'; err.style.display = 'block'; return; }
  if (texte.length < 10) { err.textContent = 'Écrivez un avis un peu plus complet (10 caractères minimum).'; err.style.display = 'block'; return; }

  btn.disabled = true; btn.textContent = 'Envoi…';
  try {
    var res = await fetch(AVIS_PRODUIT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': AVIS_PRODUIT_ANON, 'Authorization': 'Bearer ' + AVIS_PRODUIT_ANON },
      body: JSON.stringify({ action: 'soumettre', type: 'artisan', nom_affiche: nom, texte: texte }),
    });
    var data = await res.json();
    if (data.error) throw new Error(data.error);
    ok.textContent = 'Merci ! Votre avis sera visible après vérification.';
    ok.style.display = 'block';
    setTimeout(function() { fermerModale('modal-avis-produit'); }, 2000);
  } catch (e) {
    err.textContent = 'Erreur : ' + e.message;
    err.style.display = 'block';
  }
  btn.disabled = false; btn.textContent = 'Envoyer mon avis';
}

// ── Suppression de compte (RGPD) ──
function ouvrirSuppressionCompte() {
  document.getElementById('suppr-confirm-texte').value = '';
  document.getElementById('suppr-err').style.display = 'none';
  ouvrirModale('modal-suppr-compte');
}

async function confirmerSuppressionCompte() {
  var texte = document.getElementById('suppr-confirm-texte').value.trim();
  var err = document.getElementById('suppr-err');
  if (texte !== 'SUPPRIMER') {
    err.textContent = 'Tapez exactement SUPPRIMER (en majuscules) pour confirmer.';
    err.style.display = 'block';
    return;
  }
  if (!confirm('Dernière confirmation : supprimer définitivement votre compte MPA Artisans et toutes vos données ?')) return;

  var btn = document.getElementById('btn-suppr-compte');
  btn.disabled = true; btn.textContent = 'Suppression en cours…';
  try {
    var { data: { session: authSession } } = await sb.auth.getSession();
    var res = await fetch(SUPABASE_URL + '/functions/v1/supprimer-mon-compte', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authSession.access_token },
    });
    var data = await res.json();
    if (data.error) throw new Error(data.error);
    alert('Votre compte a bien été supprimé. Merci d\'avoir utilisé MPA Artisans.');
    await sb.auth.signOut();
    window.location.href = 'https://caralink.app/artisans/';
  } catch (e) {
    err.textContent = 'Erreur : ' + e.message;
    err.style.display = 'block';
    btn.disabled = false; btn.textContent = 'Supprimer définitivement mon compte';
  }
}
// ── Garde d'accès en lecture seule (essai expiré sans carte) ──
// Appelée en tout début des actions qui créent/modifient/suppriment des données métier
// (interventions, clients, factures, services, horaires, demandes). Ne bloque jamais la
// consultation, ni l'édition de la fiche profil ou du calcul fiscal.
function verifierAccesEcriture() {
  // Abonnement masqué temporairement (28/09) — le temps de construire le modèle "gratuit sous
  // un seuil de CA, commission au-delà". Personne n'est bloqué en attendant. Pour revenir en
  // arrière : remettre le bloc if ci-dessous (voir l'historique du fichier).
  return true;
}

async function sauverIntervention() {
  if (!verifierAccesEcriture()) return;
  var adresse = document.getElementById('mi-adr').value.trim() || null;
  var cp = document.getElementById('mi-cp').value.trim() || null;
  var commune = document.getElementById('mi-com').value.trim() || null;

  var maj = {
    artisan_id: _artisan.id,
    date_intervention: document.getElementById('mi-date').value,
    creneau: document.getElementById('mi-creneau').value,
    heure_debut: document.getElementById('mi-heure-debut').value || null,
    heure_fin: document.getElementById('mi-heure-fin').value || null,
    client_id: document.getElementById('mi-client').value || null,
    adresse: adresse,
    code_postal: cp,
    commune: commune,
    service_id: document.getElementById('mi-service').value || null,
    prix: isNaN(parseFloat(document.getElementById('mi-prix').value)) ? null : parseFloat(document.getElementById('mi-prix').value), // 0 = gratuit, volontairement
    notes: document.getElementById('mi-notes').value.trim() || null,
    statut: document.getElementById('mi-statut').value,
    date_paiement: document.getElementById('mi-statut').value === 'payee' ? (document.getElementById('mi-date-paiement').value || null) : null,
  };
  if (!maj.date_intervention) { alert('La date est obligatoire.'); return; }
  if (['terminee', 'payee'].indexOf(maj.statut) !== -1 && maj.prix == null) {
    alert('Indiquez le prix de l\'intervention avant de la passer en « ' + (maj.statut === 'payee' ? 'Payée' : 'Terminée') + ' » : il compte dans votre chiffre d\'affaires et sert à votre facture.\n\nSi c\'est gratuit (garantie, geste commercial), saisissez 0.');
    document.getElementById('mi-prix').focus();
    return;
  }

  // Géocodage silencieux — si l'adresse a une correspondance, on la stocke ; sinon on enregistre quand même (jamais bloquant)
  if (adresse) {
    var pt = await geocoderAdresse(adresse, cp, commune);
    if (pt) { maj.latitude = pt.lat; maj.longitude = pt.lon; }
  }

  var res;
  var ancienStatut = null, _ex = null;
  if (_interventionEnCours) { _ex = _interventionsCache.find(function(x) { return x.id === _interventionEnCours; }); ancienStatut = _ex ? _ex.statut : null; }
  // Annuler passe toujours par « Impossible d'honorer » : il prévient le client, rembourse ce qui a été payé et libère une éventuelle commande.
  if (_ex && maj.statut === 'annulee' && ancienStatut !== 'annulee') { alert('Pour annuler cette intervention, utilisez le bouton « Impossible d\'honorer » : votre client est prévenu et ses paiements en ligne sont remboursés.'); document.getElementById('mi-statut').value = ancienStatut; return; }
  var changementDate = !!(_ex && ['planifiee', 'en_cours'].indexOf(ancienStatut) !== -1 && ['planifiee', 'en_cours'].indexOf(maj.statut) !== -1 && (_ex.date_intervention !== maj.date_intervention || (_ex.creneau || '') !== (maj.creneau || '') || String(_ex.heure_debut || '').slice(0, 5) !== String(maj.heure_debut || '').slice(0, 5)));
  var ancienneDate = _ex ? _ex.date_intervention : null;
  if (_interventionEnCours) {
    res = await sb.from('mpa_artisans_interventions').update(maj).eq('id', _interventionEnCours).eq('artisan_id', _artisan.id).select().single();
  } else {
    res = await sb.from('mpa_artisans_interventions').insert(maj).select().single();
  }
  if (res.error) {
    if (String(res.error.message || '').indexOf('COMMISSION_CARTE_REQUISE') >= 0) {
      // Verrou posé par la base : carte obligatoire au-dessus du seuil gratuit, ou commission restée impayée.
      if (confirm('Pour planifier une nouvelle intervention venue de CaraLink, il faut d\'abord enregistrer une carte bancaire (ou régler la commission restée impayée).\n\nElle n\'est débitée qu\'au-dessus de 200 € par mois.\n\nL\'enregistrer maintenant ?')) {
        fermerModale('modal-intervention');
        ouvrirCartePrestations();
      }
      return;
    }
    alert('Erreur : ' + res.error.message); return;
  }
  fermerModale('modal-intervention');
  await chargerInterventions();
  if (maj.statut === 'terminee' && ancienStatut !== 'terminee' && res.data) suiteInterventionTerminee(res.data.id);
  if (changementDate && res.data) await prevenirClientDeplacement(res.data.id, ancienneDate);
  if (['terminee', 'payee'].indexOf(maj.statut) !== -1) chargerCommandes(); // une livraison terminée clôture sa commande (la base s'en charge)
  if (maj.statut !== 'annulee') {
    verifierFaisabiliteJour(maj.date_intervention);
    verifierTensionJournee(maj.date_intervention, maj.commune, _interventionEnCours);
  }

  // Si cette intervention vient d'une commande à livrer, on boucle la liaison.
  if (window._commandeEnLivraison && !_interventionEnCours) {
    var infoCommande = window._commandeEnLivraison;
    window._commandeEnLivraison = null;
    var { error: errLien } = await sb.from('commandes_catalogue')
      .update({ intervention_id: res.data.id, livraison_prevue_le: res.data.date_intervention })
      .eq('id', infoCommande.commandeId).eq('artisan_id', _artisan.id);
    if (errLien) console.error('Liaison commande/intervention:', errLien);
    var probleme = await notifierClientCommande(infoCommande.commandeId, 'livraison_prevue', { date: res.data.date_intervention, creneau: res.data.creneau || null });
    await chargerCommandes();
    await chargerLivraisons();
    alert(probleme ? '🚚 Livraison planifiée.\n\n⚠️ ' + probleme : '🚚 Livraison planifiée : le client a reçu un email avec le jour prévu.');
  }
}

// Intervention déplacée : le client est TOUJOURS prévenu par email (aucun choix — un client doit savoir que la date a changé). MPA-AI en informe l'artisan.
async function prevenirClientDeplacement(interventionId, ancienneDate) {
  try {
    var { data: { session: authSession } } = await sb.auth.getSession();
    var res = await fetch(SUPABASE_URL + '/functions/v1/notifier-intervention-deplacee', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authSession.access_token },
      body: JSON.stringify({ intervention_id: interventionId, ancienne_date: ancienneDate }),
    });
    var data = await res.json();
    if (data.error) throw new Error(data.error);
    if (data.provisoire) { mpaAiDire('📅 Livraison déplacée au ' + dateCourteFR(data.date) + '. Le client n\'a encore reçu aucune date : il sera prévenu le ' + dateCourteFR(ajouterJoursISO(data.date, -2)) + '.', 'info'); await chargerCommandes(); await chargerLivraisons(); if (data.hors_fenetre) mpaAiDire('📅 Attention : ce nouveau jour est en dehors de la fenêtre de livraison annoncée au client. Vérifiez qu\'il pourra le recevoir ce jour-là.', 'warning'); return; }
    if (data.client_prevenu) mpaAiDire('✉️ Le rendez-vous a été déplacé : j\'ai prévenu votre client par email du nouveau jour.', 'info');
    else mpaAiDire('⚠️ Le rendez-vous a été déplacé, mais ' + (data.client_sans_email ? 'ce client n\'a pas d\'adresse email : prévenez-le directement.' : 'l\'email n\'a pas pu partir : prévenez votre client directement.'), 'warning');
    if (data.livraison) {
      await chargerCommandes(); await chargerLivraisons();
      if (data.hors_fenetre) mpaAiDire('📅 Attention : ce nouveau jour est en dehors de la fenêtre de livraison annoncée au client. Il en a été informé, mais vérifiez que cela lui convient.', 'warning');
    }
  } catch (e) {
    mpaAiDire('⚠️ Le rendez-vous a été déplacé, mais je n\'ai pas pu prévenir votre client par email : prévenez-le directement.', 'warning');
  }
}

async function supprimerIntervention() {
  if (!verifierAccesEcriture()) return;
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

// ── Comptabilité : trois familles de chiffre d'affaires (Interventions, Ventes boutique, Livraisons) ──
// Chaque famille a son taux de cotisations (ventes de marchandises ≠ prestations de services) et son abattement fiscal.
// Une « ligne » = un montant, sa famille, son client et ses deux dates (production / encaissement) :
//   - Interventions et Livraisons viennent de mpa_artisans_interventions. Une intervention est une LIVRAISON quand une commande y est reliée
//     (commandes_catalogue.intervention_id, posé par « Planifier la livraison ») ; son prix = les frais de livraison.
//   - Ventes = commandes boutique réglées, nettes des remboursements et SANS les frais de livraison (déjà comptés dans la livraison).
var _lignesCompta = [];
var _erreurCompta = false;
var _comptaMobilePeriode = null; // index de la colonne (0-11 mois, 0-3 trimestres) — null = période en cours

// 'AAAA-MM-JJ' → date locale à minuit (jamais new Date('AAAA-MM-JJ') : ce serait minuit UTC, donc la veille en Guadeloupe).
function _dateJour(s) {
  if (!s) return null;
  var t = String(s), m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(t);
}

// Toutes les lignes de CA dont une date tombe dans [debut, finExclue[ (chaînes 'AAAA-MM-JJ'). Lève une erreur si la lecture échoue.
async function chargerLignesCA(debut, finExclue) {
  var d0 = _dateJour(debut), d1 = _dateJour(finExclue);
  var margeA = new Date(d0.getTime()); margeA.setDate(margeA.getDate() - 1);
  var margeB = new Date(d1.getTime()); margeB.setDate(margeB.getDate() + 1);
  var rI = await sb.from('mpa_artisans_interventions')
    .select('id, prix, statut, date_intervention, date_paiement, facture_id, mpa_artisans_clients(nom), artisans_services(nom_service)')
    .eq('artisan_id', _artisan.id).neq('statut', 'annulee')
    .or('and(date_intervention.gte.' + debut + ',date_intervention.lt.' + finExclue + '),and(date_paiement.gte.' + debut + ',date_paiement.lt.' + finExclue + ')');
  var rL = await sb.from('commandes_catalogue').select('intervention_id')
    .eq('artisan_id', _artisan.id).not('intervention_id', 'is', null);
  var rV = await sb.from('commandes_catalogue')
    .select('id, nom_article, catalogue_id, montant_total, montant_rembourse, frais_livraison, created_at, client_nom')
    .eq('artisan_id', _artisan.id).in('paiement_statut', STATUTS_COMMANDE_REGLEE)
    .gte('created_at', margeA.toISOString()).lt('created_at', margeB.toISOString());
  var err = rI.error || rL.error || rV.error;
  if (err) throw err;

  var liv = {};
  (rL.data || []).forEach(function(c) { liv[c.intervention_id] = true; });
  var lignes = [];
  (rI.data || []).forEach(function(i) {
    var fait = i.statut === 'terminee' || i.statut === 'payee';
    lignes.push({
      fam: liv[i.id] ? 'livraisons' : 'interventions',
      client: (i.mpa_artisans_clients && i.mpa_artisans_clients.nom) || '(sans client)',
      montant: Number(i.prix) || 0,
      libelle: (i.artisans_services && i.artisans_services.nom_service) || (estLivraisonIntervention(i) ? 'Livraison' : 'Intervention'), statut: i.statut, factureId: i.facture_id || null,
      dProd: fait ? _dateJour(i.date_intervention) : null,
      dReel: (i.statut === 'payee' && i.date_paiement) ? _dateJour(i.date_paiement) : null
    });
  });
  (rV.data || []).forEach(function(v) {
    var net = Math.max(0, Number(v.montant_total || 0) - Number(v.montant_rembourse || 0) - Number(v.frais_livraison || 0));
    var d = new Date(v.created_at);
    lignes.push({ fam: 'ventes', client: v.client_nom || '(client boutique)', montant: net, libelle: v.nom_article || 'Commande', statut: Number(v.montant_rembourse) > 0 ? 'remboursée en partie' : 'réglée', factureId: null, dProd: d, dReel: d });
  });
  return lignes;
}

// Taux de cotisations d'une famille = taux de l'activité + contribution à la formation professionnelle (CFP, artisans).
function tauxCotisationsFamille(fam) {
  var base = fam === 'ventes'
    ? (_artisan.cotisation_ventes_pct ?? TAUX_DEFAUT_VENTES)
    : (_artisan.cotisation_sociale_pct ?? TAUX_DEFAUT_SERVICES);
  return Number(base) + Number(_artisan.cfp_pct ?? TAUX_DEFAUT_CFP);
}
function cotisationsFamille(fam, brut) { return Math.round(brut * tauxCotisationsFamille(fam)) / 100; }
function formatPct(x) { return Number(x).toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' %'; }

// vue : 'production' ou 'reel' ; dansPeriode(date) → booléen
function totauxFamilles(lignes, vue, dansPeriode) {
  var t = { interventions: 0, ventes: 0, livraisons: 0 };
  lignes.forEach(function(l) {
    var d = vue === 'reel' ? l.dReel : l.dProd;
    if (d && dansPeriode(d)) t[l.fam] += l.montant;
  });
  t.services = t.interventions + t.livraisons;
  t.total = t.services + t.ventes;
  return t;
}
function cotisationsTotales(t) {
  return cotisationsFamille('interventions', t.interventions) + cotisationsFamille('ventes', t.ventes) + cotisationsFamille('livraisons', t.livraisons);
}

// Plafond micro-entreprise : services ≤ 83 600 € ET ensemble (ventes + services) ≤ 203 100 € — on affiche celui dont on est le plus proche.
function calculPlafond(t) {
  var pS = t.services / PLAFOND_MICRO_SERVICES, pT = t.total / PLAFOND_MICRO_VENTE;
  var parServices = pS >= pT;
  return {
    pct: Math.max(pS, pT) * 100,
    montant: parServices ? t.services : t.total,
    limite: parServices ? PLAFOND_MICRO_SERVICES : PLAFOND_MICRO_VENTE,
    parServices: parServices
  };
}

// Impôt sur le revenu estimé : versement libératoire (1 % ventes, 1,7 % services) OU barème avec l'abattement de chaque famille.
function calculImpotEstime(t, nbParts) {
  if (_artisan.versement_liberatoire === true) {
    var vl = t.ventes * VERSEMENT_LIB_FAMILLE.ventes + t.interventions * VERSEMENT_LIB_FAMILLE.interventions + t.livraisons * VERSEMENT_LIB_FAMILLE.livraisons;
    return { liberatoire: true, impot: vl, imposable: null };
  }
  var imposable = t.ventes * (1 - ABATTEMENT_FAMILLE.ventes) + t.interventions * (1 - ABATTEMENT_FAMILLE.interventions) + t.livraisons * (1 - ABATTEMENT_FAMILLE.livraisons);
  return { liberatoire: false, impot: calculerIR(imposable, nbParts), imposable: imposable };
}

// ── Détail du chiffre d'affaires (Pro) : chaque ligne qui compose un mois, avec client, date, statut, facture et centimes ──
var _detailCAMois = null, _detailCAFam = 'toutes';
function changerDetailCA() {
  _detailCAMois = parseInt(document.getElementById('detail-ca-mois').value, 10);
  _detailCAFam = document.getElementById('detail-ca-fam').value;
  renderDetailCA();
}
function renderDetailCA() {
  var zone = document.getElementById('detail-ca-liste'), selM = document.getElementById('detail-ca-mois'), selF = document.getElementById('detail-ca-fam');
  if (!zone || !selM || !selF) return;
  var annee = _anneeCompta, aujourdhui = new Date();
  if (_detailCAMois === null || isNaN(_detailCAMois)) _detailCAMois = (annee === aujourdhui.getFullYear()) ? aujourdhui.getMonth() + 1 : 1;
  selM.innerHTML = MOIS_NOMS.map(function(n, i) { return '<option value="' + (i + 1) + '"' + (i + 1 === _detailCAMois ? ' selected' : '') + '>' + n + ' ' + annee + '</option>'; }).join('');
  selF.innerHTML = '<option value="toutes">Toutes les familles</option>' + FAMILLES_CA.map(function(f) { return '<option value="' + f + '"' + (f === _detailCAFam ? ' selected' : '') + '>' + _FAM_LIBELLE[f] + '</option>'; }).join('');
  if (_erreurCompta) { zone.innerHTML = '<p style="color:var(--mu);">Le chiffre d\'affaires n\'a pas pu être chargé. Rechargez la page.</p>'; return; }
  var lignes = _lignesCompta.filter(function(l) {
    var d = l.dProd; // Production : le mois de l'intervention (terminée/payée) ou de la vente — même règle que les totaux
    return d && d.getFullYear() === annee && d.getMonth() + 1 === _detailCAMois && (_detailCAFam === 'toutes' || l.fam === _detailCAFam);
  }).sort(function(a, b) { return a.dProd - b.dProd; });
  if (!lignes.length) { zone.innerHTML = '<p style="color:var(--mu);">Aucune ligne pour ce mois.</p>'; return; }
  var total = lignes.reduce(function(s, l) { return s + l.montant; }, 0);
  var nbFact = lignes.filter(function(l) { return l.factureId; }).length;
  var LIB_STATUT = { terminee: 'Terminée', payee: 'Payée', planifiee: 'Planifiée', en_cours: 'En cours' };
  zone.innerHTML = '<div style="overflow-x:auto;"><table class="dtbl" style="min-width:560px;"><thead><tr><th>Date</th><th>Libellé</th><th>Client</th><th>Statut</th><th>Facture</th><th style="text-align:right;">Montant</th></tr></thead><tbody>' +
    lignes.map(function(l) {
      var num = l.factureId ? (_numerosFactures[l.factureId] || 'oui') : '—';
      return '<tr><td>' + l.dProd.toLocaleDateString('fr-FR') + '</td><td>' + escHtml(l.libelle || '') + ' <span style="color:var(--mu);font-size:11px;">' + (l.fam === 'ventes' ? '🛍️' : l.fam === 'livraisons' ? '🚚' : '🔧') + '</span></td><td>' + escHtml(l.client) + '</td><td>' + escHtml(LIB_STATUT[l.statut] || l.statut || '') + '</td><td>' + escHtml(String(num)) + '</td><td style="text-align:right;font-weight:700;">' + eurosMPA(l.montant) + '</td></tr>';
    }).join('') + '</tbody></table></div>' +
    '<div style="margin-top:8px;font-size:12.5px;color:var(--mu2);">' + lignes.length + ' ligne' + (lignes.length > 1 ? 's' : '') + ' · ' + nbFact + ' facturée' + (nbFact > 1 ? 's' : '') + ' · Total <strong>' + eurosMPA(total) + '</strong> (avant cotisations)</div>';
}

// ── Récapitulatif gratuit des interventions du mois affiché au planning : nom, date, montant, remboursée ou non ──
var _recapIntSeq = 0;
async function renderRecapInterventions() {
  var zone = document.getElementById('zone-recap-interventions');
  if (!zone) return;
  var seq = ++_recapIntSeq;
  var lignes = (_interventionsCache || []).filter(function(i) { return i.statut !== 'annulee'; })
    .sort(function(a, b) { return String(a.date_intervention).localeCompare(String(b.date_intervention)); });
  var titre = '<div style="font-size:14px;font-weight:700;margin-bottom:8px;">📊 Mes interventions ' + (/^[aeiouéèh]/i.test(MOIS_NOMS[_calMois]) ? 'd\'' : 'de ') + MOIS_NOMS[_calMois].toLowerCase() + '</div>';
  if (!lignes.length) { zone.innerHTML = titre + '<p style="font-size:13px;color:var(--mu);margin:0;">Aucune intervention ce mois-ci.</p>'; return; }
  var rembourse = {}, enLigne = {};
  try {
    var r = await sb.from('paiements_prestations').select('intervention_id, montant_rembourse, statut, type')
      .eq('artisan_id', _artisan.id).in('intervention_id', lignes.map(function(i) { return i.id; }));
    (r.data || []).forEach(function(p) { if (p.type === 'solde' && ['paye', 'partiellement_rembourse', 'rembourse'].indexOf(p.statut) !== -1) enLigne[p.intervention_id] = true; });
    (r.data || []).forEach(function(p) { if (Number(p.montant_rembourse) > 0) rembourse[p.intervention_id] = (rembourse[p.intervention_id] || 0) + Number(p.montant_rembourse); });
  } catch (e) { /* table absente ou erreur : on affiche le récap sans la mention de remboursement */ }
  if (seq !== _recapIntSeq) return; // le mois a changé entre-temps
  var fait = lignes.filter(function(i) { return i.statut === 'terminee' || i.statut === 'payee'; });
  var total = fait.reduce(function(s, i) { return s + (Number(i.prix) || 0); }, 0);
  zone.innerHTML = titre + '<div style="max-height:280px;overflow-y:auto;border:1px solid var(--brd);border-radius:10px;padding:0 12px;">' + lignes.map(function(i) {
    var nom = (i.artisans_services && i.artisans_services.nom_service) || (estLivraisonIntervention(i) ? 'Livraison' : 'Intervention');
    var date = new Date(i.date_intervention + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    var badge = rembourse[i.id] ? ' <span style="font-size:11px;font-weight:700;color:#b45309;background:rgba(245,158,11,.12);padding:2px 7px;border-radius:6px;">↩️ remboursée ' + eurosMPA(rembourse[i.id]) + '</span>' : '';
    if (i.statut === 'payee') badge += ' <span style="font-size:11px;color:var(--mu);">' + (enLigne[i.id] ? '💳 en ligne' : '💵 main propre') + '</span>';
    var fait1 = i.statut === 'terminee' || i.statut === 'payee';
    return '<div onclick="ouvrirIntervention(\'' + i.id + '\')" style="display:flex;justify-content:space-between;gap:10px;padding:7px 0;border-bottom:1px solid var(--brd);cursor:pointer;font-size:13px;' + (fait1 ? '' : 'color:var(--mu);') + '">' +
      '<span><span style="color:var(--mu);margin-right:8px;">' + date + '</span>' + escHtml(nom) + badge + '</span>' +
      '<strong>' + (Number(i.prix) > 0 ? eurosMPA(Number(i.prix)) : '—') + '</strong></div>';
  }).join('') + '</div>' +
  '<div style="margin-top:8px;font-size:12.5px;color:var(--mu2);">' + fait.length + ' réalisée' + (fait.length > 1 ? 's' : '') + ' · Total <strong>' + eurosMPA(total) + '</strong>. Les interventions à venir sont en gris. Le détail par client est dans Ma comptabilité (offre Pro).</div>';
}

async function chargerCompta() {
  document.getElementById('compta-annee').textContent = _anneeCompta;
  try {
    _lignesCompta = await chargerLignesCA(_anneeCompta + '-01-01', (_anneeCompta + 1) + '-01-01');
    _erreurCompta = false;
  } catch (e) {
    console.error(e);
    _lignesCompta = []; _erreurCompta = true;
  }
  renderMatriceCompta();
}

function choisirPeriodeComptaMobile(idx) {
  _comptaMobilePeriode = idx;
  renderMatriceCompta();
}

var _FAM_LIBELLE = { interventions: '🔧 Interventions', ventes: '🛍️ Ventes boutique', livraisons: '🚚 Livraisons' };
// Montants du tableau de bord : sans décimale quand c'est un compte rond, avec centimes sinon (un 0,60 € ne doit pas disparaître).
function _fmtCA(v) { return Math.abs(v - Math.round(v)) < 0.005 ? String(Math.round(v)) : v.toFixed(2).replace('.', ','); }
function _eur0(v) { return v ? _fmtCA(v) + '€' : '—'; }

function renderMatriceCompta() {
  var vue = _vueCompta, annee = _anneeCompta;
  var parFam = { interventions: Array(13).fill(0), ventes: Array(13).fill(0), livraisons: Array(13).fill(0) };
  var parClient = {}; // { nomClient: { mois: montant } } — toutes familles confondues
  _lignesCompta.forEach(function(l) {
    var d = vue === 'reel' ? l.dReel : l.dProd;
    if (!d || d.getFullYear() !== annee) return;
    var m = d.getMonth() + 1;
    parFam[l.fam][m] += l.montant;
    if (!parClient[l.client]) parClient[l.client] = {};
    parClient[l.client][m] = (parClient[l.client][m] || 0) + l.montant;
  });

  var curMonth = new Date().getMonth();
  var isCurYear = (annee === new Date().getFullYear());
  var trim = (_vueMoisTrim === 'trim');
  var cols = trim
    ? [{ l: 'T1', m: [1, 2, 3] }, { l: 'T2', m: [4, 5, 6] }, { l: 'T3', m: [7, 8, 9] }, { l: 'T4', m: [10, 11, 12] }]
    : MOIS_COURTS.map(function(l, i) { return { l: l, m: [i + 1] }; });
  var curIdx = trim ? Math.floor(curMonth / 3) : curMonth;
  var nbCol = cols.length + 2;
  function somme(arr, ms) { return ms.reduce(function(s, m) { return s + (arr[m] || 0); }, 0); }
  function clsNow(i) { return (i === curIdx && isCurYear) ? ' class="col-now"' : ''; }

  // ── Tableau 1 (gratuit) : récapitulatif par famille ──
  var thead = document.getElementById('thead-recap-row');
  var tbody = document.getElementById('tbody-recap');
  thead.innerHTML = '<th></th>' + cols.map(function(c, i) { return '<th' + clsNow(i) + '>' + c.l + '</th>'; }).join('') + '<th>Total</th>';

  function ligneTableau(label, valeurs, cls, couleur) {
    var tot = valeurs.reduce(function(s, v) { return s + v; }, 0);
    var cells = valeurs.map(function(v, i) {
      return '<td' + clsNow(i) + ' style="text-align:center;font-weight:700;' + (couleur ? 'color:' + couleur + ';' : '') + '">' + _eur0(v) + '</td>';
    }).join('');
    return '<tr class="' + cls + '"><td>' + label + '</td>' + cells + '<td style="text-align:center;font-weight:800;' + (couleur ? 'color:' + couleur + ';' : '') + '">' + _eur0(tot) + '</td></tr>';
  }
  var html = '';
  var totBrut = cols.map(function() { return 0; }), totCotis = cols.map(function() { return 0; });
  if (_erreurCompta) {
    html = '<tr><td colspan="' + nbCol + '" class="etat-vide-tbl">Le chiffre d\'affaires n\'a pas pu être chargé. Rechargez la page.</td></tr>';
  } else {
    FAMILLES_CA.forEach(function(f) {
      var brut = cols.map(function(c) { return somme(parFam[f], c.m); });
      var cot = brut.map(function(v) { return cotisationsFamille(f, v); });
      var net = brut.map(function(v, i) { return v - cot[i]; });
      brut.forEach(function(v, i) { totBrut[i] += v; totCotis[i] += cot[i]; });
      html += '<tr class="rec-fam"><td colspan="' + nbCol + '">' + _FAM_LIBELLE[f] + ' <span class="rec-taux">cotisations ' + formatPct(tauxCotisationsFamille(f)) + '</span></td></tr>';
      html += ligneTableau('CA brut', brut, 'cpv2-row-brut');
      html += ligneTableau('Cotisations', cot, 'cpv2-row-cotis', 'var(--gold)');
      html += ligneTableau('Net', net, 'cpv2-row-net', 'var(--ac)');
    });
    var totNet = totBrut.map(function(v, i) { return v - totCotis[i]; });
    html += '<tr class="rec-fam rec-total"><td colspan="' + nbCol + '">Σ Total</td></tr>';
    html += ligneTableau('Total CA brut', totBrut, 'cpv2-row-brut');
    html += ligneTableau('Total cotisations', totCotis, 'cpv2-row-cotis', 'var(--gold)');
    html += ligneTableau('Total net', totNet, 'cpv2-row-net', 'var(--ac)');
  }
  tbody.innerHTML = html;

  // ── Tableau 2 (Pro) : détail par client ──
  var pro = estPro();
  var blocPro = document.getElementById('compta-client-pro'), verrou = document.getElementById('compta-client-verrou');
  if (blocPro) blocPro.style.display = pro ? '' : 'none';
  if (verrou) verrou.style.display = pro ? 'none' : '';
  var clients = Object.keys(parClient).sort();
  var blocDetail = document.getElementById('compta-detail-ca');
  if (blocDetail) blocDetail.style.display = pro ? '' : 'none';
  if (pro) renderDetailCA();
  if (pro) {
    var th2 = document.getElementById('thead-compta-row'), tb2 = document.getElementById('tbody-compta');
    th2.innerHTML = '<th>Client</th>' + cols.map(function(c, i) { return '<th' + clsNow(i) + '>' + c.l + '</th>'; }).join('') + '<th>Total</th>';
    if (!clients.length) {
      tb2.innerHTML = '<tr><td colspan="' + nbCol + '" class="etat-vide-tbl">Aucune donnée pour ' + annee + '.</td></tr>';
    } else {
      tb2.innerHTML = clients.map(function(nom) {
        var ligne = parClient[nom], totalLigne = 0, clr = getClientColor(nom);
        var cellules = cols.map(function(c, i) {
          var val = somme(ligne, c.m); totalLigne += val;
          return '<td' + clsNow(i) + ' style="text-align:center;' + (val ? '' : 'color:var(--mu);') + '">' + _eur0(val) + '</td>';
        }).join('');
        return '<tr class="cpv2-row-client"><td style="border-left-color:' + clr + ';color:' + clr + ';"><strong>' + escHtml(nom) + '</strong></td>' + cellules + '<td style="text-align:center;font-weight:700;">' + _eur0(totalLigne) + '</td></tr>';
      }).join('');
    }
  }

  renderComptaMobile(parFam, parClient, clients, cols, curIdx, isCurYear, pro);

  // KPIs de l'année (toujours en Production : la « vraie richesse produite »), toutes familles confondues
  var t = totauxFamilles(_lignesCompta, 'production', function(d) { return d.getFullYear() === annee; });
  var cotis = cotisationsTotales(t);
  document.getElementById('kpi-ca-brut').textContent = _fmtCA(t.total) + ' €';
  document.getElementById('kpi-cotis').textContent = _fmtCA(cotis) + ' €';
  document.getElementById('kpi-ca-net').textContent = _fmtCA(t.total - cotis) + ' €';

  var note = document.getElementById('compta-note-cotis');
  if (note) {
    note.innerHTML = '💡 Cotisations estimées : ventes ' + formatPct(_artisan.cotisation_ventes_pct ?? TAUX_DEFAUT_VENTES) +
      ', interventions et livraisons ' + formatPct(_artisan.cotisation_sociale_pct ?? TAUX_DEFAUT_SERVICES) +
      ', <strong>plus ' + formatPct(_artisan.cfp_pct ?? TAUX_DEFAUT_CFP) + ' de contribution à la formation professionnelle</strong> (artisans). ' +
      'Taux modifiables dans Mon profil (ex. avec l\'ACRE). Simple estimation : à confirmer avec votre comptable.';
  }
}

function renderComptaMobile(parFam, parClient, clients, cols, curIdx, isCurYear, pro) {
  var zonePeriodes = document.getElementById('compta-mobile-periodes');
  var zoneListe = document.getElementById('compta-mobile-liste');
  if (!zonePeriodes || !zoneListe) return;
  if (_comptaMobilePeriode === null || _comptaMobilePeriode >= cols.length) _comptaMobilePeriode = isCurYear ? curIdx : 0;
  var idx = _comptaMobilePeriode, ms = cols[idx].m;
  function somme(arr) { return ms.reduce(function(s, m) { return s + (arr[m] || 0); }, 0); }

  zonePeriodes.innerHTML = cols.map(function(c, i) {
    return '<button class="' + (i === idx ? 'actif' : '') + '" onclick="choisirPeriodeComptaMobile(' + i + ')">' + c.l + ((i === curIdx && isCurYear) ? ' •' : '') + '</button>';
  }).join('');

  var totB = 0, totC = 0, h = '';
  FAMILLES_CA.forEach(function(f) {
    var b = somme(parFam[f]), c = cotisationsFamille(f, b);
    totB += b; totC += c;
    h += '<div class="compta-mobile-fam">' + _FAM_LIBELLE[f] + '</div>' +
      '<div class="compta-mobile-client"><span>CA brut</span><span>' + _fmtCA(b) + ' €</span></div>' +
      '<div class="compta-mobile-client" style="color:var(--gold);"><span>Cotisations</span><span>' + _fmtCA(c) + ' €</span></div>' +
      '<div class="compta-mobile-client" style="color:var(--ac);"><span>Net</span><span>' + _fmtCA(b - c) + ' €</span></div>';
  });
  h += '<div class="compta-mobile-fam">Σ Total</div>' +
    '<div class="compta-mobile-total"><span>CA brut</span><span>' + _fmtCA(totB) + ' €</span></div>' +
    '<div class="compta-mobile-total" style="color:var(--gold);"><span>Cotisations</span><span>' + _fmtCA(totC) + ' €</span></div>' +
    '<div class="compta-mobile-total" style="color:var(--ac);"><span>Net</span><span>' + _fmtCA(totB - totC) + ' €</span></div>';
  zoneListe.innerHTML = h;

  var zoneClients = document.getElementById('compta-client-mobile');
  if (zoneClients) {
    if (!pro) { zoneClients.innerHTML = ''; return; }
    var lignes = clients.map(function(nom) {
      var val = somme(parClient[nom]);
      return val ? '<div class="compta-mobile-client"><span style="color:' + getClientColor(nom) + ';font-weight:600;">' + escHtml(nom) + '</span><span>' + val.toFixed(0) + ' €</span></div>' : '';
    }).join('');
    zoneClients.innerHTML = '<div class="compta-mobile-fam">Clients — ' + cols[idx].l + '</div>' + (lignes || '<p style="font-size:13px;color:var(--mu);padding:10px 0;">Aucune donnée pour cette période.</p>');
  }
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
      var service = libelleServiceIntervention(i);
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

function genererFacture() { return avecVerrouFacture('basket', _genererFacture); }
async function _genererFacture() {
  if (!verifierAccesEcriture()) return;
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

  (data || []).forEach(function(f) { _numerosFactures[f.id] = f.numero; if (f.envoyee_le) _envoisFactures[f.id] = { le: f.envoyee_le, a: f.envoyee_a }; });
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
      '<td><button class="icbtn" onclick="imprimerFacture(\'' + f.id + '\')" title="Voir / imprimer">🖨</button> ' +
        '<button class="icbtn" onclick="envoyerFacture(\'' + f.id + '\')" title="' + (_envoisFactures[f.id] ? 'Envoyée — renvoyer par email' : 'Envoyer par email au client (Pro)') + '">' + (_envoisFactures[f.id] ? '✅✉️' : '✉️') + '</button></td>' +
    '</tr>';
  }).join('');
}

// ════════════════════════════════════════
//  FACTURE EN 1 CLIC (Pro) — interventions et commandes de la boutique
//  Le panier classique (plusieurs interventions sur une facture) reste gratuit.
// ════════════════════════════════════════
var _envoisFactures = {}; // id de facture → { le, a } : date et adresse du dernier envoi par email
var _numerosFactures = {}; // id de facture → numéro, pour afficher « Facturée n° … »
var _facturesCommandes = null; // commande_id → id de facture ; null = colonne absente (SQL facture-commandes.sql pas lancé) → boutons masqués

async function prochainNumeroFacture() {
  var { count } = await sb.from('mpa_artisans_factures').select('id', { count: 'exact', head: true }).eq('artisan_id', _artisan.id);
  return new Date().getFullYear() + '-' + String((count || 0) + 1).padStart(3, '0');
}

function renderZoneFactureIntervention(i) {
  var zone = document.getElementById('mi-facture-wrap');
  if (!zone) return;
  if (!i || ['terminee', 'payee'].indexOf(i.statut) === -1 || i.prix === 0 || i.prix === '0') { zone.style.display = 'none'; zone.innerHTML = ''; return; }
  zone.style.display = 'block';
  if (!(Number(i.prix) > 0) || !i.client_id) {
    // On explique au lieu de cacher : sans prix ni client, pas de facture, et l'intervention compte pour 0 € dans le chiffre d'affaires.
    zone.innerHTML = '<div style="font-size:12.5px;color:#b45309;background:rgba(245,158,11,.1);border-radius:8px;padding:9px 12px;line-height:1.5;">🧾 Pour facturer cette intervention (et la compter dans votre chiffre d\'affaires), renseignez ' + (!(Number(i.prix) > 0) && !i.client_id ? 'le <strong>prix</strong> et le <strong>client</strong>' : !(Number(i.prix) > 0) ? 'le <strong>prix</strong>' : 'le <strong>client</strong>') + ' ci-dessus, puis enregistrez.</div>';
    return;
  }
  zone.innerHTML = i.facture_id
    ? '<div style="font-size:13px;color:#0f9d78;font-weight:700;margin-bottom:8px;">✓ Facturée' + (_numerosFactures[i.facture_id] ? ' — facture n° ' + escHtml(_numerosFactures[i.facture_id]) : '') + '</div>' + htmlEnvoiFacture(i.facture_id)
    : '<button onclick="facturerIntervention(\'' + i.id + '\')" style="padding:9px 18px;border-radius:8px;border:none;background:var(--ac);color:#fff;font-size:13px;font-weight:700;cursor:pointer;">🧾 Facturer en 1 clic</button> ' +
      '<button onclick="facturerIntervention(\'' + i.id + '\', true)" style="padding:9px 18px;border-radius:8px;border:1.5px solid var(--ac);background:transparent;color:var(--ac);font-size:13px;font-weight:700;cursor:pointer;">✉️ Facturer et envoyer</button>' +
      '<div style="font-size:11px;color:var(--mu);margin-top:5px;">Crée la facture de cette intervention ; elle s\'ouvre pour l\'imprimer, et vous la retrouvez dans « Mes factures ».</div>';
}

// Verrou d'interface : un double clic ne lance jamais deux fois la même opération (la base garantit en plus qu'un doublon est refusé).
var _verrousFacture = {};
async function avecVerrouFacture(cle, fonction) {
  if (_verrousFacture[cle]) return;
  _verrousFacture[cle] = true;
  try { return await fonction(); } finally { delete _verrousFacture[cle]; }
}
// Erreurs de la base lors de la facture en 1 clic → message clair. Retourne true si l'erreur est traitée.
function traiterErreurFacture(erreur) {
  var m = (erreur && erreur.message) || '';
  if (m.indexOf('facture_rapide_reserve_pro') !== -1) { proposerPassagePro('facture_rapide'); return true; }
  var textes = {
    deja_facturee: 'Cette facture a déjà été créée : elle apparaît dans « Mes factures ».',
    statut_non_facturable: 'Seule une intervention terminée ou payée peut être facturée.',
    client_manquant: 'Choisissez d\'abord un client pour cette intervention, puis enregistrez.',
    prix_manquant: 'Cette intervention n\'a pas de prix.',
    commande_non_payee: 'Seule une commande payée en ligne peut être facturée ici.',
    rien_a_facturer: 'Cette commande n\'a rien à facturer (les frais de livraison se facturent avec la livraison).',
    intervention_introuvable: 'Intervention introuvable. Rechargez la page.',
    commande_introuvable: 'Commande introuvable. Rechargez la page.',
    client_introuvable: 'Client introuvable. Rechargez la page.',
  };
  for (var cle in textes) { if (m.indexOf(cle) !== -1) { alert(textes[cle]); return true; } }
  if (/function .* does not exist|Could not find the function|PGRST202/.test(m)) { alert('Cette fonction n\'est pas encore activée sur votre compte (mise à jour en cours). Réessayez dans un instant.'); return true; }
  return false;
}

function facturerIntervention(id, envoyer) { return avecVerrouFacture('fi:' + id, function() { return _facturerIntervention(id, envoyer); }); }
async function _facturerIntervention(id, envoyer) {
  if (!verifierAccesEcriture()) return;
  if (!exigerPro('facture_rapide')) return;
  var i = _interventionsCache.find(function(x) { return x.id === id; });
  if (!i) return;
  // Déjà facturée (par exemple en « 1 clic » juste avant) : on ne reste pas muet, on envoie ou on ouvre la facture existante.
  if (i.facture_id) { if (envoyer) envoyerFacture(i.facture_id); else imprimerFacture(i.facture_id); return; }
  if (!i.client_id) { alert('Choisissez d\'abord un client pour cette intervention, puis enregistrez.'); return; }
  if (!(Number(i.prix) > 0)) { alert('Cette intervention n\'a pas de prix.'); return; }
  // Tout se passe dans la base, d'un seul bloc : verrou de l'intervention, contrôle Pro, numéro attribué, facture créée et liée.
  var { data: facture, error } = await sb.rpc('facturer_intervention', { p_intervention_id: id });
  if (error) {
    if (!traiterErreurFacture(error)) alert('Erreur : ' + error.message);
    if ((error.message || '').indexOf('deja_facturee') !== -1) { await chargerFacturesCommandes(); }
    return;
  }
  i.facture_id = facture.id; _numerosFactures[facture.id] = facture.numero;
  renderZoneFactureIntervention(i);
  if (document.getElementById('fact-client') && document.getElementById('fact-client').value) chargerPanierClient();
  chargerFactures();
  if (envoyer) envoyerFacture(facture.id); else imprimerFacture(facture.id);
}

// Lien commandes → factures. La colonne commande_id est facultative : sans elle, les boutons de facture des commandes restent masqués.
async function chargerFacturesCommandes() {
  // Colonnes facultatives (facture-commandes.sql, facture-email.sql) : on essaie le jeu le plus complet, puis on retombe sur moins.
  var jeux = ['id, numero, commande_id, envoyee_le, envoyee_a', 'id, numero, commande_id', 'id, numero, envoyee_le, envoyee_a', 'id, numero'];
  var data = null, colonnes = '';
  for (var k = 0; k < jeux.length; k++) {
    var r = await sb.from('mpa_artisans_factures').select(jeux[k]).eq('artisan_id', _artisan.id);
    if (!r.error) { data = r.data; colonnes = jeux[k]; break; }
  }
  if (data === null) { _facturesCommandes = null; return; }
  _facturesCommandes = colonnes.indexOf('commande_id') !== -1 ? {} : null; // sans commande_id : boutons de facture des commandes masqués
  (data || []).forEach(function(f) {
    _numerosFactures[f.id] = f.numero;
    if (f.envoyee_le) _envoisFactures[f.id] = { le: f.envoyee_le, a: f.envoyee_a };
    if (_facturesCommandes && f.commande_id) _facturesCommandes[f.commande_id] = f.id;
  });
}

// Ligne « envoyée le … » + bouton d'envoi / de renvoi d'une facture déjà créée (Pro).
function htmlEnvoiFacture(factureId, petit) {
  var e = _envoisFactures[factureId];
  var taille = petit ? 'padding:4px 10px;font-size:11.5px;' : 'padding:7px 14px;font-size:12.5px;';
  var bouton = '<button onclick="envoyerFacture(\'' + factureId + '\')" style="' + taille + 'border-radius:7px;border:1px solid var(--ac);background:transparent;color:var(--ac);font-weight:700;cursor:pointer;">' + (e ? '↻ Renvoyer' : '✉️ Envoyer au client') + '</button>';
  var mention = e ? '<span style="font-size:11.5px;color:var(--mu);margin-right:8px;">✉️ Envoyée le ' + new Date(e.le).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'America/Guadeloupe' }) + (e.a ? ' à ' + escHtml(e.a) : '') + '</span>' : '';
  return mention + bouton;
}

function envoyerFacture(factureId) { return avecVerrouFacture('ef:' + factureId, function() { return _envoyerFacture(factureId); }); }
async function _envoyerFacture(factureId) {
  if (!verifierAccesEcriture()) return;
  if (!exigerPro('facture_email')) return;
  var { data: f, error } = await sb.from('mpa_artisans_factures').select('numero, mpa_artisans_clients(nom, email)').eq('id', factureId).eq('artisan_id', _artisan.id).maybeSingle();
  if (error || !f) { alert('Facture introuvable.'); return; }
  var client = f.mpa_artisans_clients || {};
  var email = '';
  if (_envoisFactures[factureId] && !confirm('Cette facture a déjà été envoyée. L\'envoyer de nouveau à ' + (client.email || 'ce client') + ' ?')) return;
  if (!client.email) {
    email = (prompt('Adresse email de ' + (client.nom || 'ce client') + ' pour lui envoyer la facture :', '') || '').trim();
    if (!email) return;
  }
  try {
    var { data: { session: authSession } } = await sb.auth.getSession();
    var res = await fetch(SUPABASE_URL + '/functions/v1/envoyer-facture', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authSession.access_token },
      body: JSON.stringify({ facture_id: factureId, email: email || undefined }),
    });
    var data = await res.json();
    if (data.error) throw new Error(data.error);
    _envoisFactures[factureId] = { le: data.envoyee_le, a: data.envoyee_a };
    if (email) { try { chargerClients(); } catch (e) {} }
    rafraichirZonesFacture(factureId);
    mpaAiDire('✉️ La facture n° ' + escHtml(f.numero) + ' a été envoyée à ' + escHtml(data.envoyee_a || client.email) + '. S\'il répond, sa réponse arrive directement dans votre boîte mail.', 'info');
  } catch (e) {
    if (traiterErreurPlan(e)) return;
    alert(e.message === 'email_client_manquant' ? 'Cette adresse email n\'est pas valide.' : e.message === 'envoi_en_cours' ? 'Un envoi est déjà en cours pour cette facture. Patientez quelques secondes.' : 'Erreur : ' + e.message);
  }
}

function rafraichirZonesFacture(factureId) {
  var i = (_interventionsCache || []).find(function(x) { return x.facture_id === factureId; });
  if (i) renderZoneFactureIntervention(i);
  if (typeof renderCommandes === 'function' && _commandesCache && _commandesCache.length) renderCommandes();
  chargerFactures();
}

function montantFacturableCommande(c) {
  return Math.round(((Number(c.montant_total) || 0) - (Number(c.frais_livraison) || 0)) * 100) / 100;
}

function boutonFactureCommande(c) {
  if (_facturesCommandes === null) return '';
  if (_facturesCommandes[c.id]) {
    return '<span style="font-size:11.5px;color:#0f9d78;font-weight:700;margin-left:8px;">✓ Facturée' + (_numerosFactures[_facturesCommandes[c.id]] ? ' — n° ' + escHtml(_numerosFactures[_facturesCommandes[c.id]]) : '') + '</span> ' + htmlEnvoiFacture(_facturesCommandes[c.id], true);
  }
  if (c.paiement_statut !== 'paye' || !(montantFacturableCommande(c) > 0)) return '';
  if (c.statut !== 'terminee') return '<button disabled title="Disponible une fois la commande terminée" style="padding:6px 14px;border-radius:7px;border:none;background:var(--ac);color:#fff;font-size:12px;font-weight:700;opacity:.35;cursor:not-allowed;margin-left:6px;">🧾 Facturer</button>' +
    '<button disabled title="Disponible une fois la commande terminée" style="padding:6px 14px;border-radius:7px;border:1px solid var(--ac);background:transparent;color:var(--ac);font-size:12px;font-weight:700;opacity:.35;cursor:not-allowed;margin-left:6px;">✉️ Facturer et envoyer</button>';
  return '<button onclick="facturerCommande(\'' + c.id + '\')" style="padding:6px 14px;border-radius:7px;border:none;background:var(--ac);color:#fff;font-size:12px;font-weight:700;cursor:pointer;margin-left:6px;">🧾 Facturer</button>' +
    '<button onclick="facturerCommande(\'' + c.id + '\', true)" style="padding:6px 14px;border-radius:7px;border:1px solid var(--ac);background:transparent;color:var(--ac);font-size:12px;font-weight:700;cursor:pointer;margin-left:6px;">✉️ Facturer et envoyer</button>';
}

function normaliserNomClient(n) {
  return String(n || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function facturerCommande(id, envoyer) { return avecVerrouFacture('fc:' + id, function() { return _facturerCommande(id, envoyer); }); }
async function _facturerCommande(id, envoyer) {
  if (!verifierAccesEcriture()) return;
  if (!exigerPro('facture_rapide')) return;
  var c = _commandesCache.find(function(x) { return x.id === id; });
  if (!c || _facturesCommandes === null) return;
  if (_facturesCommandes[id]) return; // déjà facturée
  if (c.statut !== 'terminee') { alert('Cette commande pourra être facturée une fois « Terminée » (livrée ou remise au client).'); return; }
  if (c.paiement_statut !== 'paye') { alert('Seule une commande payée en ligne peut être facturée ici.'); return; }
  var montant = montantFacturableCommande(c);
  if (!(montant > 0)) { alert('Cette commande n\'a rien à facturer (les frais de livraison se facturent avec la livraison).'); return; }

  // Client : fiche existante du même nom (ou même email), sinon création avec les coordonnées de la commande.
  var nomNorm = normaliserNomClient(c.client_nom);
  var client = (_clientsCache || []).find(function(x) {
    return (c.client_email && x.email && x.email.toLowerCase() === String(c.client_email).toLowerCase()) || normaliserNomClient(x.nom) === nomNorm;
  });
  if (!client) {
    var livraison = c.mode === 'livraison';
    var { data: nouveau, error: errClient } = await sb.from('mpa_artisans_clients').insert({
      artisan_id: _artisan.id, nom: c.client_nom, email: c.client_email || null,
      adresse: livraison ? (c.adresse_livraison || null) : null,
      code_postal: livraison ? (c.code_postal_livraison || null) : null,
      commune: livraison ? (c.commune_livraison || null) : null,
    }).select().single();
    if (errClient) { alert('Erreur création client : ' + errClient.message); return; }
    client = nouveau;
    chargerClients();
  }

  var { data: facture, error } = await sb.rpc('facturer_commande', { p_commande_id: id, p_client_id: client.id });
  if (error) {
    if (!traiterErreurFacture(error)) alert('Erreur : ' + error.message);
    await chargerFacturesCommandes(); renderCommandes();
    return;
  }
  _facturesCommandes[id] = facture.id; _numerosFactures[facture.id] = facture.numero;
  renderCommandes();
  chargerFactures();
  if (envoyer) envoyerFacture(facture.id); else imprimerFacture(facture.id);
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

  var delaiPaiement = (c && c.delai_paiement) || 30;
  var dateEcheance = new Date(facture.date_facture);
  dateEcheance.setDate(dateEcheance.getDate() + delaiPaiement);
  var dateEcheanceAff = dateEcheance.toLocaleDateString('fr-FR', { day:'numeric', month:'long', year:'numeric' });

  var lignesHtml = (lignes||[]).map(function(l) {
    var service = libelleServiceIntervention(l, true);
    var dateAff = new Date(l.date_intervention).toLocaleDateString('fr-FR', { day:'numeric', month:'short', year:'numeric' });
    var montant = l.prix || 0;
    return '<tr><td>' + dateAff + '</td><td>' + escHtml(service) + (l.notes ? ' — ' + escHtml(l.notes) : '') + '</td><td>1</td><td>' + montant.toFixed(2) + '€</td><td>' + montant.toFixed(2) + '€</td></tr>';
  }).join('');
  var libelleColonne = 'Prestation';
  if (facture.commande_id) {
    // Facture d'une commande de la boutique : articles de la commande (ou article unique), + ligne d'ajustement si une remise explique l'écart.
    libelleColonne = 'Désignation';
    var { data: cmd } = await sb.from('commandes_catalogue').select('*').eq('id', facture.commande_id).maybeSingle();
    var articles = [];
    if (cmd) {
      var { data: lignesCmd } = await sb.from('commandes_catalogue_lignes').select('nom_article, prix_unitaire, quantite').eq('commande_id', cmd.id);
      if (lignesCmd && lignesCmd.length) articles = lignesCmd.map(function(l) { return { nom: l.nom_article, qte: l.quantite, pu: Number(l.prix_unitaire) || 0 }; });
      else articles = [{ nom: cmd.nom_article, qte: cmd.quantite || 1, pu: (Number(facture.montant_total) || 0) / (cmd.quantite || 1) }];
    }
    var dateCmd = cmd ? new Date(cmd.paiement_traite_le || cmd.created_at).toLocaleDateString('fr-FR', { day:'numeric', month:'short', year:'numeric', timeZone:'America/Guadeloupe' }) : '';
    var somme = 0;
    lignesHtml = articles.map(function(l) {
      somme += l.pu * l.qte;
      return '<tr><td>' + dateCmd + '</td><td>' + escHtml(l.nom) + '</td><td>' + l.qte + '</td><td>' + l.pu.toFixed(2) + '€</td><td>' + (l.pu * l.qte).toFixed(2) + '€</td></tr>';
    }).join('');
    var ecart = Math.round(((Number(facture.montant_total) || 0) - somme) * 100) / 100;
    if (articles.length && Math.abs(ecart) > 0.004) lignesHtml += '<tr><td>' + dateCmd + '</td><td>Remise / ajustement</td><td>1</td><td>' + ecart.toFixed(2) + '€</td><td>' + ecart.toFixed(2) + '€</td></tr>';
  }

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
        '<thead><tr><th>Date</th><th>' + libelleColonne + '</th><th>Qté</th><th>Prix unit.</th><th>Montant</th></tr></thead>' +
        '<tbody>' + lignesHtml + '</tbody>' +
      '</table>' +
      '<div class="fp-total-row"><span>Total TTC</span><span>' + facture.montant_total.toFixed(2) + '€</span></div>' +
      (a.tva_config && a.tva_config !== 'Non assujetti' ? '' : '<p style="font-size:11px;color:#6b7c96;">TVA non applicable, art. 293 B du CGI.</p>') +
      '<p style="font-size:11px;color:#6b7c96;">Conditions de règlement : paiement sous ' + delaiPaiement + ' jours — échéance le ' + dateEcheanceAff + '. En cas de retard de paiement, indemnité forfaitaire de recouvrement de 40€ (art. L441-10 du Code de commerce), applicable aux relations entre professionnels.</p>' +
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
const STRIPE_PUBLIC_KEY_MPA = 'pk_live_51TWxxBJPTOXXy1ykTYLysvDCbnnJUXzqbc164Wif38u1g7BijiOLdUWKD8HPlQBX7he8K76aZNMUARo14yuQhzdQ000WVXdeEF';
// Chiffres 2026 (micro-entreprise artisan, BIC) — à revoir chaque année. Sources : plafonds revalorisés 2026-2028 (CCI Paris IDF), taux URSSAF 2026, abattements et versement libératoire de l'administration fiscale.
const PLAFOND_MICRO_SERVICES = 83600;   // prestations de services (interventions + livraisons)
const PLAFOND_MICRO_VENTE = 203100;     // ensemble ventes + services
const TAUX_DEFAUT_SERVICES = 21.2;      // cotisations : prestations de services (la livraison en est une)
const TAUX_DEFAUT_VENTES = 12.3;        // cotisations : vente de marchandises
const TAUX_DEFAUT_CFP = 0.3;            // contribution à la formation professionnelle, artisans
const ABATTEMENT_FAMILLE = { interventions: 0.50, livraisons: 0.50, ventes: 0.71 };
const VERSEMENT_LIB_FAMILLE = { interventions: 0.017, livraisons: 0.017, ventes: 0.01 };
const FAMILLES_CA = ['interventions', 'ventes', 'livraisons'];

// ── Modèle "gratuit sous un seuil" (28/09) — clients trouvés via CaraLink uniquement ──
// Un client "annuaire" (origine trackée sur mpa_artisans_clients) vient d'une demande de devis
// publique ; un client "manuel" a été ajouté par l'artisan lui-même et ne compte jamais ici.
// Même logique marginale que côté Ventes (creer-paiement-commande.ts), pour ne jamais créer
// d'effet de seuil brutal : seule la part au-dessus du seuil est concernée.
const SEUIL_GRATUIT_PRESTATIONS_EUROS = 200;
const DELAI_GRACE_PRESTATION_JOURS = 7; // au-delà, une intervention "Planifiée" non soldée bloque la suite

function calculerPartAuDessusDuSeuil(montantCentimes, dejaCentimes, seuilCentimes) {
  var placeRestante = Math.max(0, seuilCentimes - dejaCentimes);
  var sousLeSeuil = Math.min(montantCentimes, placeRestante);
  return montantCentimes - sousLeSeuil;
}

// CA net (Terminée/Payée, même règle que la Comptabilité) des seuls clients "annuaire", depuis
// le 1er du mois en cours.
async function calculerCAPrestationsAnnuaireDuMois() {
  var debutMois = new Date(); debutMois.setDate(1);
  var debutStr = debutMois.toISOString().slice(0, 10);
  var { data, error } = await sb.from('mpa_artisans_interventions')
    .select('prix, mpa_artisans_clients!inner(origine)')
    .eq('artisan_id', _artisan.id)
    .eq('mpa_artisans_clients.origine', 'annuaire')
    .in('statut', ['terminee', 'payee'])
    .gte('date_intervention', debutStr);
  if (error) { console.error(error); return 0; }
  return (data || []).reduce(function(s, i) { return s + (i.prix || 0); }, 0);
}

// Deux cas bloquent la planification d'une nouvelle intervention "annuaire" :
// - "Planifiée" dont la date est passée depuis plus de DELAI_GRACE_PRESTATION_JOURS (7j) —
//   l'artisan n'a même pas commencé, rien ne justifie que ça traîne.
// - "En cours" depuis plus de DELAI_GRACE_EN_COURS_JOURS (90j) — un dossier légitimement long
//   (pièce à commander, gros chantier) ne doit jamais être bloqué à court terme ; seul un abandon
//   manifeste après 3 mois déclenche le blocage.
// Ça vise précisément la faille "encaissé en main propre, jamais déclaré terminé" — pas les
// interventions en cours légitimement.
const DELAI_GRACE_EN_COURS_JOURS = 90;

async function trouverPrestationAnnuaireEnRetard() {
  var limitePlanifiee = new Date(); limitePlanifiee.setDate(limitePlanifiee.getDate() - DELAI_GRACE_PRESTATION_JOURS);
  var limiteEnCours = new Date(); limiteEnCours.setDate(limiteEnCours.getDate() - DELAI_GRACE_EN_COURS_JOURS);

  var { data: planifieesEnRetard, error: err1 } = await sb.from('mpa_artisans_interventions')
    .select('id, date_intervention, mpa_artisans_clients!inner(origine)')
    .eq('artisan_id', _artisan.id)
    .eq('statut', 'planifiee')
    .eq('mpa_artisans_clients.origine', 'annuaire')
    .lt('date_intervention', limitePlanifiee.toISOString().slice(0, 10))
    .limit(1);
  if (err1) { console.error(err1); return null; }
  if (planifieesEnRetard && planifieesEnRetard.length) return planifieesEnRetard[0];

  var { data: enCoursEnRetard, error: err2 } = await sb.from('mpa_artisans_interventions')
    .select('id, date_intervention, mpa_artisans_clients!inner(origine)')
    .eq('artisan_id', _artisan.id)
    .eq('statut', 'en_cours')
    .eq('mpa_artisans_clients.origine', 'annuaire')
    .lt('date_intervention', limiteEnCours.toISOString().slice(0, 10))
    .limit(1);
  if (err2) { console.error(err2); return null; }
  return (enCoursEnRetard && enCoursEnRetard.length) ? enCoursEnRetard[0] : null;
}

// Rappel souple, jamais bloquant — à ne pas confondre avec DELAI_GRACE_EN_COURS_JOURS (90j, qui
// lui bloque la planification, et seulement pour les clients "annuaire"). Celui-ci concerne
// TOUTE intervention "En cours" qui traîne, quel que soit le client — le risque qu'un artisan
// oublie tout simplement un dossier, pas une question de commission.
const DELAI_ALERTE_EN_COURS_JOURS = 60;

// Avis automatique 48h après une intervention terminée — s'appuie sur date_intervention (la
// date du service) faute de date de passage en "Terminée" enregistrée à part ; une fenêtre de
// 48 à 72h (pas pile 48h) pour ne jamais rater le moment si l'artisan n'ouvre pas l'app ce
// jour précis. Jamais suggéré deux fois : avis_demande_le, déjà utilisé par le bouton manuel.
async function trouverInterventionsAvisAProposer() {
  var il48h = new Date(); il48h.setDate(il48h.getDate() - 2);
  var il72h = new Date(); il72h.setDate(il72h.getDate() - 3);
  var { data, error } = await sb.from('mpa_artisans_interventions')
    .select('id, date_intervention, mpa_artisans_clients(nom, email)')
    .eq('artisan_id', _artisan.id)
    .in('statut', ['terminee', 'payee'])
    .is('avis_demande_le', null)
    .gte('date_intervention', il72h.toISOString().slice(0, 10))
    .lte('date_intervention', il48h.toISOString().slice(0, 10));
  if (error) { console.error(error); return []; }
  // Un avis ne sert à rien à demander sans email pour l'envoyer.
  return (data || []).filter(function(i) { return i.mpa_artisans_clients && i.mpa_artisans_clients.email; });
}

async function compterInterventionsACloturer() {
  var aujourdhui = new Date(Date.now() - 4 * 3600 * 1000).toISOString().slice(0, 10); // jour en Guadeloupe (UTC-4)
  var { count, error } = await sb.from('mpa_artisans_interventions')
    .select('id', { count: 'exact', head: true })
    .eq('artisan_id', _artisan.id)
    .in('statut', ['planifiee', 'en_cours'])
    .lt('date_intervention', aujourdhui);
  if (error) { console.error(error); return 0; }
  return count || 0;
}

async function compterInterventionsEnCoursAnciennes() {
  var limite = new Date(); limite.setDate(limite.getDate() - DELAI_ALERTE_EN_COURS_JOURS);
  var { count, error } = await sb.from('mpa_artisans_interventions')
    .select('id', { count: 'exact', head: true })
    .eq('artisan_id', _artisan.id)
    .eq('statut', 'en_cours')
    .lt('date_intervention', limite.toISOString().slice(0, 10));
  if (error) { console.error(error); return 0; }
  return count || 0;
}

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
  await chargerEtatCommission();
  renderEncartCartePrestations();
  await calculerDashboardFiscal();
  _dispoAnnee = new Date().getFullYear();
  _dispoMois = new Date().getMonth();
  await renderDispoCalendrier();
  renderRappelCloture();
  renderEncartAbonnement();
  renderEncartAlternance();
}

// ── Info abonnement affichée dans l'en-tête du panneau MPA-AI ──
// Masqué temporairement (28/09) le temps de construire le modèle "gratuit sous un seuil de CA".
function majInfoAbonnementMpaAi() {
  var zone = document.getElementById('mpa-ai-abonnement-info');
  if (zone) zone.textContent = '';
}

// ── Paiements en ligne (Stripe Connect) ──
function renderEncartStripeConnect() {
  var cibles = ['encart-stripe-connect-catalogue'];
  var statut = _artisan.stripe_connect_statut || 'non_demarre';

  var html;
  if (statut === 'actif') {
    html = '<div style="background:rgba(15,157,120,.06);border:1px solid rgba(15,157,120,.3);border-radius:14px;padding:12px 20px;font-size:12.5px;color:#0f9d78;">' +
        '✅ Paiements en ligne activés — vos clients peuvent payer leurs commandes directement par carte.' +
      '</div>';
  } else {
    var texte = statut === 'en_cours'
      ? 'Activation en cours — terminez la vérification de votre compte. Tant qu\'elle n\'est pas terminée, vos produits ne peuvent pas être mis en vente.'
      : 'Activez les paiements en ligne : c\'est nécessaire pour mettre vos produits en vente. Vos clients paient par carte et l\'argent arrive sur votre compte (environ 5 minutes — pièce d\'identité et IBAN).';
      var nbMasques = (_catalogueCache || []).filter(function(c) { return c.en_vente !== false; }).length;
      var avertissement = nbMasques > 0 ? '<div style="margin-top:6px;color:#b45309;font-weight:600;">⚠️ Votre boutique est masquée : vos ' + nbMasques + ' produit' + (nbMasques > 1 ? 's' : '') + ' en vente ne sont pas visibles des clients tant que les paiements ne sont pas activés.</div>' : '';
    html = '<div style="background:rgba(59,130,246,.06);border:1px solid rgba(59,130,246,.3);border-radius:14px;padding:14px 20px;display:flex;align-items:center;gap:16px;flex-wrap:wrap;">' +
        '<div style="flex:1;min-width:220px;font-size:12.5px;color:var(--mu2);">💳 ' + texte + avertissement + '</div>' +
        '<button onclick="lancerStripeConnect(this)" style="flex-shrink:0;padding:9px 16px;border-radius:8px;border:none;background:#3b82f6;color:#fff;font-size:12.5px;font-weight:700;cursor:pointer;white-space:nowrap;">' + (statut === 'en_cours' ? 'Terminer l\'activation →' : 'Activer les paiements →') + '</button>' +
      '</div>';
  }

  cibles.forEach(function(id) {
    var zone = document.getElementById(id);
    if (zone) zone.innerHTML = html;
  });
}

// Au retour du formulaire Stripe (?stripe_connect=retour), ou tant que le compte est « en cours », on demande à Stripe l'état réel du
// compte (via le serveur) au lieu d'attendre le message automatique (webhook), qui peut tarder. Silencieux en cas d'échec : la page
// affiche alors simplement le statut déjà enregistré. 6 secondes maximum d'attente.
async function synchroniserStatutStripe() {
  try {
    var params = new URLSearchParams(window.location.search);
    var retour = params.get('stripe_connect') === 'retour';
    if (!_artisan || !_artisan.stripe_connect_account_id) return;
    if (!retour && _artisan.stripe_connect_statut !== 'en_cours') return;
    if (retour) { // l'adresse ne doit pas rester marquée : un rechargement ne refait pas la lecture
      params.delete('stripe_connect');
      var qs = params.toString();
      history.replaceState(null, '', window.location.pathname + (qs ? '?' + qs : '') + window.location.hash);
    }
    var { data: { session: authSession } } = await sb.auth.getSession();
    if (!authSession) return;
    var ctrl = new AbortController();
    var minuteur = setTimeout(function() { ctrl.abort(); }, 6000);
    var res = await fetch(SUPABASE_URL + '/functions/v1/connecter-stripe-artisan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authSession.access_token },
      body: JSON.stringify({ action: 'synchroniser' }),
      signal: ctrl.signal,
    });
    clearTimeout(minuteur);
    var data = await res.json();
    if (data && (data.statut === 'actif' || data.statut === 'en_cours')) _artisan.stripe_connect_statut = data.statut;
  } catch (e) { /* silencieux : on garde le statut enregistré */ }
}

async function lancerStripeConnect(btn) {
  if (btn) { btn.disabled = true; btn.textContent = 'Redirection…'; }
  try {
    var { data: { session: authSession } } = await sb.auth.getSession();
    var res = await fetch(SUPABASE_URL + '/functions/v1/connecter-stripe-artisan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authSession.access_token },
      body: JSON.stringify({ origin: window.location.origin + window.location.pathname.replace(/\/[^/]*$/, '') }),
    });
    var data = await res.json();
    if (data.error) throw new Error(data.error);
    window.location.href = data.url;
  } catch (e) {
    alert('Erreur : ' + e.message);
    if (btn) { btn.disabled = false; btn.textContent = 'Activer les paiements →'; }
  }
}

// ── Abonnement Stripe — essai 14 jours, 19,99€/mois ──
// Masqué temporairement (28/09) : plus aucun encart, plus de compte à rebours, plus de bouton
// "S'abonner". Le temps de construire le modèle "gratuit sous un seuil de CA, commission au-delà".
// Pour revenir en arrière : remettre l'ancien corps de fonction (voir l'historique du fichier).
function renderEncartAbonnement() {
  var zone = document.getElementById('encart-abonnement');
  if (zone) zone.innerHTML = '';
}

// ═════════════════════════════════════════════════════════════════════════════
// Offre Essentiel / Pro
// La colonne artisans.plan (gratuit / pro / pro_offert) est l'unique source de vérité. Le VRAI
// blocage est fait par la base de données (impossible à contourner depuis le navigateur) ; tout
// ce qui suit sert seulement à expliquer clairement à l'artisan ce qui se passe — avant, ou juste
// après un refus de la base.
// ═════════════════════════════════════════════════════════════════════════════
var LIMITE_PRODUITS_ESSENTIEL = 9; // à garder identique à la limite écrite dans paywall-plan.sql
var LIMITE_PHARES_GRATUIT = 1, LIMITE_PHARES_PRO = 4; // à garder identiques à phares-plan.sql
function limitePhares() { return estPro() ? LIMITE_PHARES_PRO : LIMITE_PHARES_GRATUIT; }
var PRIX_PRO_AFFICHE = '9,90 €/mois';
var _dernierMessagePro = 0;

function estPro() {
  return !!_artisan && (_artisan.plan === 'pro' || _artisan.plan === 'pro_offert');
}

// L'essai n'est offert qu'une fois (le serveur y veille) : on ne le mentionne que s'il reste possible.
function texteEssai() {
  return (_artisan && _artisan.stripe_subscription_id) ? '' : ' 14 jours d\'essai gratuit, sans carte.';
}

function texteLimiteProduits() {
  return 'Vous avez atteint la limite de ' + LIMITE_PRODUITS_ESSENTIEL + ' produits de l\'offre Essentiel. Avec l\'offre Pro (' + PRIX_PRO_AFFICHE + ') : catalogue illimité, Mes fournitures et scan QR code / code-barres.';
}

function proposerPassagePro(raison) {
  var maintenant = Date.now();
  if (maintenant - _dernierMessagePro < 5000) return; // jamais deux fois le même message sur un double-clic
  _dernierMessagePro = maintenant;
  var message = raison === 'produits'
    ? texteLimiteProduits() + texteEssai()
    : raison === 'phares'
    ? '⭐ L\'offre Essentiel permet ' + LIMITE_PHARES_GRATUIT + ' produit phare. Avec l\'offre Pro (' + PRIX_PRO_AFFICHE + '), vous en mettez ' + LIMITE_PHARES_PRO + ' en avant sur votre fiche et votre boutique, avec le catalogue illimité et Mes fournitures. Pour changer de produit phare, retirez d\'abord l\'étoile de l\'actuel.' + texteEssai()
    : raison === 'detail_client'
    ? '🔒 Le détail du chiffre d\'affaires par client fait partie de l\'offre Pro (' + PRIX_PRO_AFFICHE + '), avec le catalogue illimité et Mes fournitures. Le récapitulatif par mois (interventions, ventes, livraisons) reste gratuit.' + texteEssai()
    : raison === 'facture_rapide'
    ? '🧾 La facture en 1 clic (depuis une intervention ou une commande de la boutique) fait partie de l\'offre Pro (' + PRIX_PRO_AFFICHE + '), avec le catalogue illimité et Mes fournitures. Le panier de facturation classique reste gratuit.' + texteEssai()
    : raison === 'agenda'
    ? '📅 Retrouver votre planning dans Google Agenda, Apple Calendrier ou Outlook, mis à jour automatiquement, fait partie de l\'offre Pro (' + PRIX_PRO_AFFICHE + '), avec le catalogue illimité et Mes fournitures.' + texteEssai()
    : raison === 'facture_email'
    ? '✉️ L\'envoi de vos factures par email, directement à vos clients, fait partie de l\'offre Pro (' + PRIX_PRO_AFFICHE + '), avec le catalogue illimité et Mes fournitures. Imprimer une facture reste gratuit.' + texteEssai()
    : raison === 'code_promo'
    ? '🎁 Le code promo (remise automatique dans le panier de vos clients) fait partie de l\'offre Pro (' + PRIX_PRO_AFFICHE + '), avec le catalogue illimité et Mes fournitures.' + texteEssai()
    : raison === 'retard'
    ? '⏰ Prévenir un client d\'un retard fait partie de l\'offre Pro (' + PRIX_PRO_AFFICHE + '), avec le catalogue illimité et Mes fournitures.' + texteEssai()
    : '🔒 Mes fournitures fait partie de l\'offre Pro (' + PRIX_PRO_AFFICHE + ') : suivi de vos consommables, scan QR code / code-barres et alerte avant la rupture.' + texteEssai();
  mpaAiDire(message, 'pro', { label: 'Passer en Pro', action: 'lancerAbonnement()' });
}

function exigerPro(raison) {
  if (estPro()) return true;
  proposerPassagePro(raison);
  return false;
}

// refus === true : l'artisan vient d'être bloqué (on ouvre MPA-AI) ; false : simple information
// juste après avoir créé son dernier produit gratuit.
function afficherLimiteProduits(refus) {
  if (refus) { proposerPassagePro('produits'); return; }
  mpaAiDire(texteLimiteProduits(), 'warning', { label: 'Passer en Pro', action: 'lancerAbonnement()' });
}

// Rattrape un refus venu de la base — y compris quand l'écran croyait encore l'artisan Pro
// (ex. essai terminé entre-temps) : on resynchronise l'écran en même temps.
function traiterErreurPlan(erreur) {
  var m = (erreur && erreur.message) || '';
  var raison = m.indexOf('fournitures_reservees_pro') !== -1 ? 'fournitures'
    : m.indexOf('limite_produits_essentiel') !== -1 ? 'produits'
    : m.indexOf('retard_reserve_pro') !== -1 ? 'retard'
    : m.indexOf('facture_rapide_reserve_pro') !== -1 ? 'facture_rapide'
    : m.indexOf('facture_email_reserve_pro') !== -1 ? 'facture_email'
    : m.indexOf('limite_phares') !== -1 ? 'phares' : null;
  if (!raison) return false;
  rafraichirPlan();
  proposerPassagePro(raison);
  return true;
}

async function rafraichirPlan() {
  var { data } = await sb.from('artisans')
    .select('plan, abonnement_statut, abonnement_echeance, stripe_subscription_id')
    .eq('id', _artisan.id).maybeSingle();
  if (data) {
    Object.assign(_artisan, data);
    renderMonOffre();
    renderFournitures();
  }
  return data;
}

async function lancerAbonnement() {
  var btn = document.getElementById('btn-abonnement');
  var libelle = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Redirection vers Stripe…'; }
  var redirige = false;
  try {
    var { data: { session: authSession } } = await sb.auth.getSession();
    var res = await fetch(SUPABASE_URL + '/functions/v1/create-checkout-session-artisans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authSession.access_token },
      body: JSON.stringify({}), // les adresses de retour sont fixées côté serveur, jamais fournies par le navigateur
    });
    var data = await res.json();
    if (res.status === 409) {
      await rafraichirPlan(); // l'écran n'était pas à jour : l'artisan a déjà l'offre Pro
      mpaAiDire('Vous avez déjà l\'offre Pro — rien à faire de plus.', 'info');
      return;
    }
    if (data.error) throw new Error(data.error);
    redirige = true;
    window.location.href = data.url;
  } catch (e) {
    alert('Erreur : ' + e.message);
  } finally {
    if (btn && !redirige) { btn.disabled = false; btn.textContent = libelle || 'Passer en Pro →'; }
  }
}

async function ouvrirPortailAbonnement() {
  var btn = document.getElementById('btn-portail');
  var libelle = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Ouverture du portail…'; }
  var redirige = false;
  try {
    var { data: { session: authSession } } = await sb.auth.getSession();
    var res = await fetch(SUPABASE_URL + '/functions/v1/create-portal-session-artisans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authSession.access_token },
      body: JSON.stringify({}), // le client Stripe et l'adresse de retour sont décidés côté serveur
    });
    var data = await res.json();
    if (data.error) throw new Error(data.error);
    redirige = true;
    window.location.href = data.url;
  } catch (e) {
    alert('Erreur : ' + e.message);
  } finally {
    if (btn && !redirige) { btn.disabled = false; btn.textContent = libelle || 'Gérer mon abonnement →'; }
  }
}

function dateFR(iso) { return iso ? new Date(iso).toLocaleDateString('fr-FR') : null; }

function annonceBienvenuePro(d) {
  var fin = dateFR(d.abonnement_echeance);
  mpaAiDire(
    '🎉 Bienvenue dans l\'offre Pro ! Votre catalogue est désormais illimité et Mes fournitures avec scan est débloqué.' +
      (d.abonnement_statut === 'essai' && fin ? ' Votre essai gratuit court jusqu\'au ' + fin + '.' : ''),
    'pro',
    { label: 'Voir mes fournitures', action: "switchTab(6);switchSousOnglet('nav-stock','conteneur-stock',0)" });
}

// Au retour de Stripe (?abonnement=succes|annule). Stripe prévient notre serveur quelques secondes
// APRÈS le paiement, parfois après le retour de l'artisan : on attend (jusqu'à 30 s) que le plan
// bascule avant de féliciter, plutôt que d'annoncer trop tôt ou jamais.
async function traiterRetourAbonnement() {
  var retour = new URLSearchParams(window.location.search).get('abonnement');
  if (!retour) return;
  history.replaceState(null, '', window.location.pathname); // un rechargement ne rejoue pas le message
  if (retour === 'annule') {
    mpaAiDire('Pas de souci — vous pouvez passer en Pro quand vous le souhaitez.', 'info', { label: 'Passer en Pro', action: 'lancerAbonnement()' });
    return;
  }
  if (retour !== 'succes') return;
  for (var essai = 0; essai < 10; essai++) {
    var d = await rafraichirPlan();
    if (d && d.plan === 'pro') { annonceBienvenuePro(d); return; }
    await new Promise(function(r) { setTimeout(r, 3000); });
  }
  mpaAiDire('Votre paiement est en cours de validation. Rechargez la page dans un instant pour voir votre offre Pro.', 'info');
}

// Carte "Mon offre" en haut de Ma fiche artisan.
// Offre de l'artisan à côté de son adresse, dans le bandeau du haut : visible sur tous les écrans.
function majOffreBandeau() {
  var z = document.getElementById('uplan');
  if (!z || !_artisan) return;
  var plan = _artisan.plan || 'gratuit';
  var texte, couleur;
  if (plan === 'pro_offert') { texte = 'Pro offert'; couleur = '#0f9d78'; }
  else if (plan === 'pro') { texte = _artisan.abonnement_statut === 'essai' ? 'Pro (essai)' : 'Pro'; couleur = '#0f9d78'; }
  else { texte = 'Essentiel'; couleur = 'var(--mu2)'; }
  z.innerHTML = ' - <strong style="color:' + couleur + ';">' + texte + '</strong>';
}

function renderMonOffre() {
  var zone = document.getElementById('zone-mon-offre');
  majOffreBandeau();
  if (!zone || !_artisan) return;
  var plan = _artisan.plan || 'gratuit';
  var fin = dateFR(_artisan.abonnement_echeance);
  var styleBadge = 'font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;';
  var badge, corps;

  if (plan === 'pro_offert') {
    badge = '<span style="' + styleBadge + 'background:rgba(15,157,120,.12);color:#0f9d78;">Pro · offert</span>';
    corps = 'Toutes les fonctions Pro vous sont offertes : catalogue illimité, Mes fournitures avec scan QR code / code-barres.';
  } else if (plan === 'pro') {
    badge = '<span style="' + styleBadge + 'background:rgba(15,157,120,.12);color:#0f9d78;">Pro</span>';
    var alerte = _artisan.abonnement_paiement_en_echec
      ? '<div style="margin-bottom:8px;padding:9px 11px;border-radius:8px;background:rgba(220,38,38,.07);color:var(--danger);font-size:12.5px;font-weight:600;">⚠️ Le dernier paiement de votre abonnement a échoué. Mettez votre carte à jour pour garder le Pro.</div>'
      : '';
    var texte;
    if (_artisan.abonnement_fin_programmee) {
      texte = 'Résiliation programmée : vous gardez le Pro' + (fin ? ' jusqu\'au <strong>' + fin + '</strong>' : '') + ', puis vous repasserez en Essentiel — rien n\'est supprimé. Vous pouvez annuler cette résiliation à tout moment.';
    } else if (_artisan.abonnement_statut === 'essai') {
      texte = 'Essai gratuit' + (fin ? ' jusqu\'au <strong>' + fin + '</strong>' : '') + '. Ajoutez une carte avant cette date pour garder le Pro sans interruption — sinon vous repasserez en Essentiel, rien n\'est supprimé.';
    } else {
      texte = 'Abonnement actif' + (fin ? ' — prochain renouvellement le <strong>' + fin + '</strong>' : '') + ' (' + PRIX_PRO_AFFICHE + ').';
    }
    corps = alerte + texte + '<div><button class="addb" id="btn-portail" onclick="ouvrirPortailAbonnement()" style="margin-top:10px;">Gérer mon abonnement →</button></div>';
  } else {
    var nb = (typeof _catalogueCache !== 'undefined' && _catalogueCache) ? _catalogueCache.length : 0;
    badge = '<span style="' + styleBadge + 'background:var(--p2);color:var(--mu2);">Essentiel</span>';
    corps = '<strong>' + nb + ' / ' + LIMITE_PRODUITS_ESSENTIEL + ' produits</strong> créés. ' +
      (_artisan.stripe_subscription_id
        ? 'Votre essai Pro est terminé. Reprenez l\'offre Pro (' + PRIX_PRO_AFFICHE + ') quand vous le souhaitez — la carte est demandée, sans nouvel essai.'
        : 'Passez en Pro (' + PRIX_PRO_AFFICHE + ') : catalogue illimité, Mes fournitures avec scan QR code / code-barres. 14 jours d\'essai gratuit, sans carte.') +
      '<div><button class="addb" id="btn-abonnement" onclick="lancerAbonnement()" style="margin-top:10px;">Passer en Pro →</button></div>';
  }

  zone.innerHTML = '<div class="dcard"><div class="dchdr"><div class="dctit">⭐ Mon offre</div>' + badge + '</div>' +
    '<div class="dcbdy" style="padding:14px 16px;font-size:13px;line-height:1.6;color:var(--mu2);">' + corps + '</div></div>';
}

// ── Rappel : interventions passées encore marquées "Planifiée" ──
// Les empêche de rester coincées — sans statut Terminée/Payée, impossible de les facturer
// ni de demander un avis au client.
async function renderRappelCloture(idZone) {
  var zone = document.getElementById(idZone || 'encart-rappel-cloture');
  if (!zone) return;
  var aujourdhui = new Date().toISOString().slice(0, 10);
  var { count, error } = await sb.from('mpa_artisans_interventions')
    .select('id', { count: 'exact', head: true })
    .eq('artisan_id', _artisan.id)
    .eq('statut', 'planifiee')
    .lt('date_intervention', aujourdhui);
  if (error) { console.error('renderRappelCloture:', error); return; }
  if (!count) { zone.innerHTML = ''; return; }
  zone.innerHTML =
    '<div style="background:rgba(245,158,11,.06);border:1px solid rgba(245,158,11,.3);border-radius:14px;padding:14px 20px;margin-bottom:16px;display:flex;align-items:center;gap:12px;">' +
      '<span style="font-size:20px;">⏰</span>' +
      '<div style="flex:1;font-size:12.5px;color:var(--mu2);">' +
        '<strong style="color:#b45309;">' + count + ' intervention' + (count > 1 ? 's' : '') + ' passée' + (count > 1 ? 's' : '') + '</strong> encore marquée' + (count > 1 ? 's' : '') + ' "Planifiée" — pensez à les clôturer (Terminée/Payée) pour pouvoir les facturer et demander un avis au client.' +
      '</div>' +
      '<button onclick="switchTab(2)" style="flex-shrink:0;padding:7px 14px;border-radius:7px;border:1.5px solid #b45309;background:transparent;color:#b45309;font-size:11.5px;font-weight:700;cursor:pointer;white-space:nowrap;">Voir le planning →</button>' +
    '</div>';
}

// ── Encart croisé vers CaraLink Alternance — "Essor de CaraLink" ──
// Panneau à double orientation : 4 phrases cliquables individuellement (chacune transmet le
// besoin identifié au calculateur via ?besoin=X) + une accroche générale en dessous pour ceux
// qui ne se reconnaissent dans aucune des 4 phrases. Le badge "Tremplin des jeunes" reste
// auto-déclaré par l'artisan (aucun suivi automatique d'un simple clic, qui n'a pas de sens).
var BESOINS_ALTERNANCE = [
  { code: 'commercial', phrase: 'Un artisan a aussi besoin de prospecter.', metier: 'Il vous faut un commercial.' },
  { code: 'communication', phrase: 'Un artisan a aussi besoin de se faire connaître.', metier: 'Il vous faut de la communication.' },
  { code: 'administratif', phrase: 'Un artisan a aussi besoin de gérer sa paperasse.', metier: 'Il vous faut un assistant administratif.' },
  { code: 'comptable', phrase: 'Un artisan a aussi besoin de chiffrer.', metier: 'Il vous faut un comptable.' },
];
var _indexBesoinAlternance = 0;
var _timerBesoinAlternance = null;

function renderEncartAlternance() {
  var zone = document.getElementById('encart-alternance');
  if (!zone) return;
  var niveau = _artisan.alternance_niveau || 0;

  if (niveau >= 2) {
    zone.innerHTML =
      '<div style="background:linear-gradient(135deg,rgba(245,158,11,.1),rgba(245,158,11,.04));border:1px solid rgba(245,158,11,.35);border-radius:14px;padding:14px 20px;margin-bottom:20px;display:flex;align-items:center;gap:12px;">' +
        '<span style="font-size:22px;">🟠</span>' +
        '<div>' +
          '<div style="font-size:13px;font-weight:700;color:#b45309;">Tremplin des jeunes</div>' +
          '<div style="font-size:12px;color:var(--mu2);">Merci de vous engager pour l\'alternance en Guadeloupe — ce badge apparaît désormais sur votre fiche publique CaraLink Artisans.</div>' +
        '</div>' +
      '</div>';
    return;
  }

  demarrerEncartAlternance();
}

function htmlEncartAlternance() {
  var b = BESOINS_ALTERNANCE[_indexBesoinAlternance];
  return (
    '<div style="background:linear-gradient(135deg,rgba(15,157,120,.08),rgba(15,157,120,.03));border:1px solid rgba(15,157,120,.25);border-radius:14px;padding:16px 20px;margin-bottom:20px;">' +
      '<a href="https://learnlogicstudio.com/connect.html?besoin=' + b.code + '#section-calculateur" target="_blank" rel="noopener" id="besoin-alternance-lien" style="display:block;text-decoration:none;color:inherit;padding:8px 0;border-bottom:1px solid rgba(15,157,120,.15);margin-bottom:12px;transition:opacity .4s;">' +
        '<div style="font-size:12.5px;color:var(--mu2);">' + b.phrase + '</div>' +
        '<div style="font-size:13px;font-weight:700;color:#0f9d78;">' + b.metier + ' →</div>' +
      '</a>' +
      '<div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;">' +
        '<div style="flex:1;min-width:220px;font-size:12.5px;color:var(--mu2);">Voyez pourquoi un alternant peut vous coûter très peu en Guadeloupe.</div>' +
        '<a href="https://learnlogicstudio.com/connect.html#section-calculateur" target="_blank" rel="noopener" style="flex-shrink:0;padding:8px 14px;border-radius:8px;background:#0f9d78;color:#fff;font-size:12px;font-weight:700;text-decoration:none;white-space:nowrap;">Calculez votre coût réel →</a>' +
      '</div>' +
      '<div style="text-align:center;margin-top:10px;">' +
        '<a href="#" onclick="declarerOffreAlternance();return false;" style="font-size:11px;color:var(--mu);">✓ Vous avez déjà publié une offre d\'alternance ?</a>' +
      '</div>' +
    '</div>'
  );
}

function demarrerEncartAlternance() {
  var zone = document.getElementById('encart-alternance');
  if (!zone) return;
  zone.innerHTML = htmlEncartAlternance();
  if (_timerBesoinAlternance) clearInterval(_timerBesoinAlternance);
  _timerBesoinAlternance = setInterval(function() {
    var lien = document.getElementById('besoin-alternance-lien');
    if (lien) lien.style.opacity = '0';
    setTimeout(function() {
      _indexBesoinAlternance = (_indexBesoinAlternance + 1) % BESOINS_ALTERNANCE.length;
      zone.innerHTML = htmlEncartAlternance();
    }, 400);
  }, 5000);
}

async function declarerOffreAlternance() {
  if (!confirm('Confirmez-vous avoir publié une offre d\'alternance sur CaraLink Alternance ? Le badge "Tremplin des jeunes" apparaîtra sur votre fiche publique.')) return;
  var { error } = await sb.from('artisans').update({ alternance_niveau: 2, alternance_date_offre: new Date().toISOString() }).eq('id', _artisan.id);
  if (error) { alert('Erreur : ' + error.message); return; }
  _artisan.alternance_niveau = 2;
  if (_timerBesoinAlternance) clearInterval(_timerBesoinAlternance);
  renderEncartAlternance();
}

async function calculerDashboardFiscal() {
  var anneeAuj = new Date().getFullYear();
  var lignes = [];
  try { lignes = await chargerLignesCA(anneeAuj + '-01-01', (anneeAuj + 1) + '-01-01'); } catch (e) { console.error(e); }
  var t = totauxFamilles(lignes, 'production', function(d) { return d.getFullYear() === anneeAuj; });
  var caBrut = t.total;

  // Jauge plafond micro-entreprise (2026-2028) : services 83 600 € ET ensemble 203 100 € — on montre le plus proche.
  var p = calculPlafond(t);
  var pct = Math.min(100, p.pct);
  document.getElementById('dash-me-pct').textContent = pct.toFixed(0) + '%';
  document.getElementById('dash-me-amt').textContent = p.montant.toFixed(0) + ' € / ' + p.limite.toLocaleString('fr-FR') + ' €';
  var bar = document.getElementById('dash-jauge-me');
  bar.style.width = pct + '%';
  bar.className = 'dj-bar' + (pct >= 90 ? ' danger' : pct >= 70 ? ' warn' : '');
  document.getElementById('dash-me-msg').textContent =
    pct >= 90 ? '⚠️ Seuil bientôt atteint' : pct >= 70 ? 'À surveiller' : 'Marge confortable';
  document.getElementById('dash-me-detail').textContent =
    'Services : ' + t.services.toFixed(0) + ' € / ' + PLAFOND_MICRO_SERVICES.toLocaleString('fr-FR') + ' € · Ensemble : ' + t.total.toFixed(0) + ' € / ' + PLAFOND_MICRO_VENTE.toLocaleString('fr-FR') + ' € ' +
    '(interventions ' + t.interventions.toFixed(0) + ' €, livraisons ' + t.livraisons.toFixed(0) + ' €, ventes ' + t.ventes.toFixed(0) + ' €)';

  // Jauge seuil gratuit — CA prestations du mois, clients "annuaire" uniquement
  var caAnnuaireMois = await calculerCAPrestationsAnnuaireDuMois();
  var seuilCentimes = SEUIL_GRATUIT_PRESTATIONS_EUROS * 100;
  var partCommissionnableCentimes = calculerPartAuDessusDuSeuil(Math.round(caAnnuaireMois * 100), 0, seuilCentimes);
  var pctA = Math.min(100, (caAnnuaireMois / SEUIL_GRATUIT_PRESTATIONS_EUROS) * 100);
  document.getElementById('dash-annuaire-pct').textContent = pctA.toFixed(0) + '%';
  document.getElementById('dash-annuaire-amt').textContent = caAnnuaireMois.toFixed(0) + ' € / ' + SEUIL_GRATUIT_PRESTATIONS_EUROS + ' €';
  var barA = document.getElementById('dash-jauge-annuaire');
  barA.style.width = pctA + '%';
  barA.className = 'dj-bar' + (pctA >= 100 ? ' danger' : pctA >= 70 ? ' warn' : '');
  document.getElementById('dash-annuaire-msg').textContent = partCommissionnableCentimes > 0
    ? '⚠️ ' + (partCommissionnableCentimes / 100).toFixed(0) + ' € au-dessus du seuil ce mois-ci'
    : 'Encore gratuit ce mois-ci';

  // Estimation IR : abattement propre à chaque famille (71 % ventes, 50 % services), ou versement libératoire si l'artisan l'a choisi.
  var nbParts = parseFloat(document.getElementById('dash-parts').value) || 1;
  var ir = calculImpotEstime(t, nbParts);
  var regimeNonPrecise = ('versement_liberatoire' in _artisan) && _artisan.versement_liberatoire == null;
  document.getElementById('dash-ir-body').innerHTML =
    '<div class="ir-ligne"><span>CA brut (année)</span><span>' + caBrut.toFixed(0) + ' €</span></div>' +
    (ir.liberatoire
      ? '<div class="ir-ligne"><span>Versement libératoire (1 % ventes, 1,7 % services)</span><span>' + ir.impot.toFixed(0) + ' €</span></div>'
      : '<div class="ir-ligne"><span>Revenu imposable (abattement 71 % ventes, 50 % services)</span><span>' + ir.imposable.toFixed(0) + ' €</span></div>' +
        '<div class="ir-ligne"><span>Estimation impôt sur le revenu</span><span>' + ir.impot.toFixed(0) + ' €</span></div>') +
    (regimeNonPrecise ? '<div style="font-size:10.5px;color:var(--mu);margin-top:6px;">Calcul au barème classique. Vous avez le versement libératoire ? Indiquez-le dans Mon profil › Paramètres fiscaux.</div>' : '');
  var sousTitreIR = document.getElementById('dash-ir-sub');
  if (sousTitreIR) sousTitreIR.textContent = ir.liberatoire ? 'Versement libératoire de l\'impôt sur le revenu' : 'Abattement forfaitaire : 71 % ventes, 50 % services';
  afficherCAMois();
}

// ── CA du mois (carte du Tableau de bord) : trois familles, comparé au mois précédent complet. Mêmes règles que la Comptabilité (vue Production).
async function afficherCAMois() {
  var corps = document.getElementById('ca-mois-corps');
  if (!corps || !_artisan) return;
  try {
    var n = new Date(), a = n.getFullYear(), m = n.getMonth();
    var lignes = await chargerLignesCA(_dateLocaleISO(a, m - 1, 1), _dateLocaleISO(a, m + 1, 1));
    var cur = totauxFamilles(lignes, 'production', function(d) { return d.getFullYear() === a && d.getMonth() === m; });
    var prec = totauxFamilles(lignes, 'production', function(d) { var p = new Date(a, m - 1, 1); return d.getFullYear() === p.getFullYear() && d.getMonth() === p.getMonth(); });
    var nomL = MOIS_NOMS[m].toLowerCase(), nomPrec = MOIS_NOMS[(m + 11) % 12].toLowerCase();
    var t = document.getElementById('ca-mois-titre');
    if (t) t.textContent = 'Mon chiffre d\'affaires ' + (/^[aeiouhé]/.test(nomL) ? 'd\'' : 'de ') + nomL;
    var euros = function(x) { return Math.round(x).toLocaleString('fr-FR') + ' €'; };
    var ecart = cur.total - prec.total, comp;
    if (prec.total <= 0) comp = cur.total > 0 ? '<span style="color:var(--mu);">Pas de chiffre d\'affaires en ' + nomPrec + ' pour comparer.</span>' : '';
    else {
      var pct = Math.round(ecart / prec.total * 100);
      comp = '<span style="font-weight:700;color:' + (ecart >= 0 ? '#0f9d78' : 'var(--danger)') + ';">' + (ecart >= 0 ? '▲ +' : '▼ ') + pct + ' %</span> <span style="color:var(--mu);">par rapport à ' + nomPrec + ' (' + euros(prec.total) + ', mois complet)</span>';
    }
    corps.innerHTML =
      '<div style="font-size:26px;font-weight:800;color:var(--tx,inherit);line-height:1.1;margin-bottom:4px;">' + euros(cur.total) + '</div>' +
      (comp ? '<div style="margin-bottom:8px;">' + comp + '</div>' : '') +
      '<div style="display:flex;gap:18px;flex-wrap:wrap;font-size:12.5px;">' +
        '<span>🔧 Interventions : <strong>' + euros(cur.interventions) + '</strong></span>' +
        '<span>🛍️ Ventes : <strong>' + euros(cur.ventes) + '</strong></span>' +
        '<span>🚚 Livraisons : <strong>' + euros(cur.livraisons) + '</strong></span>' +
      '</div>';
  } catch (e) {
    console.error(e);
    corps.textContent = 'Le chiffre d\'affaires du mois n\'a pas pu être chargé.';
  }
}

function _dateLocaleISO(annee, moisIdx, jour) {
  var d = new Date(annee, moisIdx, jour);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
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
  var fvVisite = document.getElementById('fv-visite');
  if (fvVisite) fvVisite.textContent = a.proposer_visite === false ? 'Non — vos clients réservent directement' : (a.proposer_visite === true ? 'Oui' : 'Non renseigné — proposée par défaut');
  var fvFrais = document.getElementById('fv-frais'); // (absent si la page HTML en mémoire est plus ancienne que ce code : on ne plante pas)
  if (fvFrais) {
    var fr = Number(a.frais_deplacement);
    fvFrais.textContent = (a.frais_deplacement == null || a.frais_deplacement === '' || !isFinite(fr)) ? 'Non renseigné — visite sans frais'
      : (fr > 0 ? fr.toFixed(2).replace('.', ',') + ' €' : '0,00 € — visite sans frais');
  }

  var fvResa = document.getElementById('fv-frais-resa');
  if (fvResa) {
    var fresa = Number(a.frais_reservation);
    fvResa.textContent = (a.frais_reservation == null || !isFinite(fresa) || fresa <= 0) ? 'Aucun' : fresa.toFixed(2).replace('.', ',') + ' €';
  }
  var fvAnnul = document.getElementById('fv-annul');
  if (fvAnnul) {
    var hAnnul = a.annulation_gratuite_heures == null ? 24 : Number(a.annulation_gratuite_heures);
    fvAnnul.textContent = hAnnul > 0 ? 'Jusqu\'à ' + (hAnnul >= 48 && hAnnul % 24 === 0 ? (hAnnul / 24) + ' jours' : hAnnul + ' h') + ' avant le rendez-vous' : 'Jamais (frais acquis dès la confirmation)';
  }

  document.getElementById('cfg-cotis').value = a.cotisation_sociale_pct ?? TAUX_DEFAUT_SERVICES;
  document.getElementById('cfg-cotis-ventes').value = a.cotisation_ventes_pct ?? TAUX_DEFAUT_VENTES;
  document.getElementById('cfg-cfp').value = a.cfp_pct ?? TAUX_DEFAUT_CFP;
  document.getElementById('cfg-liberatoire').value = a.versement_liberatoire === true ? 'oui' : a.versement_liberatoire === false ? 'non' : '';
  document.getElementById('cfg-tva').value = a.tva_config || 'Non assujetti';
}

var _secteursCache = null;

async function openModifierFiche() {
  var a = _artisan;
  var apercu = document.getElementById('apercu-logo');
  apercu.innerHTML = a.photo_profil_url
    ? '<img src="' + a.photo_profil_url + '" style="width:100%;height:100%;object-fit:cover;">'
    : (a.nom_entreprise || '—').split(' ').filter(Boolean).slice(0, 2).map(function(w) { return w[0].toUpperCase(); }).join('');
  document.getElementById('m-nom').value = a.nom_entreprise || '';
  document.getElementById('m-statut').value = a.statut || 'Artisan Indépendant';
  document.getElementById('m-siret').value = a.siret || '';
  document.getElementById('m-ape').value = a.ape || '';
  document.getElementById('m-tva-intra').value = a.tva_intra || '';
  document.getElementById('m-adr').value = a.adresse || '';
  document.getElementById('m-cp').value = a.code_postal || '';
  document.getElementById('m-com').value = a.commune || '';
  document.getElementById('m-rayon').value = a.rayon_intervention_km || 15;
  var champFrais = document.getElementById('m-frais'); // (absent si la page HTML en mémoire est plus ancienne que ce code)
  if (champFrais) champFrais.value = (a.frais_deplacement != null && a.frais_deplacement !== '') ? String(a.frais_deplacement).replace('.', ',') : '';
  var champResa = document.getElementById('m-frais-resa');
  if (champResa) champResa.value = (a.frais_reservation != null && a.frais_reservation !== '' && Number(a.frais_reservation) > 0) ? String(a.frais_reservation).replace('.', ',') : '';
  var champAnnul = document.getElementById('m-annul-heures');
  if (champAnnul) champAnnul.value = String(a.annulation_gratuite_heures == null ? 24 : a.annulation_gratuite_heures);
  // Case « visite d'estimation » : cochée = comportement réel (sans réponse, la visite est proposée par défaut).
  var caseVisite = document.getElementById('m-visite'); window._visiteTouchee = false;
  if (caseVisite) { caseVisite.checked = a.proposer_visite !== false; majVisiteChamps(); }
  document.getElementById('m-tel').value = a.telephone || '';
  document.getElementById('m-email').value = a.email || '';
  document.getElementById('m-web').value = a.site_web || '';
  document.getElementById('m-bio').value = a.bio || '';

  if (!_secteursCache) {
    var { data } = await sb.from('secteurs').select('code, label_fr').order('ordre', { ascending: true });
    _secteursCache = data || [];
  }
  document.getElementById('m-secteur').innerHTML = _secteursCache.map(function(s) {
    return '<option value="' + s.code + '"' + (s.code === a.secteur ? ' selected' : '') + '>' + s.label_fr + '</option>';
  }).join('');

  ouvrirModale('modal-fiche');
}

// ════════════════════════════════════════
//  HORAIRES HABITUELS — utilisés pour les disponibilités publiques
// ════════════════════════════════════════

var _horairesCache = [];
var JOURS_SEMAINE_LABEL = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
var ORDRE_JOURS_AFFICHAGE = [1, 2, 3, 4, 5, 6, 0]; // lundi en premier, dimanche en dernier

async function chargerHoraires() {
  var zone = document.getElementById('zone-horaires');
  if (!zone) return;
  var { data, error } = await sb.from('artisans_horaires').select('*').eq('artisan_id', _artisan.id)
    .order('jour_semaine', { ascending: true }).order('heure_debut', { ascending: true });
  if (error) { zone.innerHTML = '<p style="color:var(--danger);">Erreur : ' + escHtml(error.message) + '</p>'; return; }
  _horairesCache = data || [];
  renderHoraires();
}

function renderHoraires() {
  var zone = document.getElementById('zone-horaires');
  if (!zone) return;
  zone.innerHTML = ORDRE_JOURS_AFFICHAGE.map(function(jour) {
    var blocs = _horairesCache.filter(function(h) { return h.jour_semaine === jour; });
    return '<div>' +
      '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--brd);flex-wrap:wrap;">' +
        '<div style="width:90px;font-weight:600;font-size:13px;">' + JOURS_SEMAINE_LABEL[jour] + '</div>' +
        '<div style="flex:1;display:flex;gap:6px;flex-wrap:wrap;">' +
          (blocs.length ? blocs.map(function(b) {
            return '<span style="display:inline-flex;align-items:center;gap:5px;padding:4px 9px;border-radius:7px;background:var(--p2);font-family:\'JetBrains Mono\',monospace;font-size:11.5px;">' +
              b.heure_debut.slice(0, 5) + '–' + b.heure_fin.slice(0, 5) +
              '<button onclick="supprimerPlageHoraire(\'' + b.id + '\')" style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:12px;padding:0;">✕</button></span>';
          }).join('') : '<span style="font-size:12px;color:var(--mu);">Ne travaille pas</span>') +
        '</div>' +
        '<button onclick="ouvrirAjoutPlage(' + jour + ')" style="background:none;border:1px dashed var(--b2);border-radius:6px;padding:4px 10px;font-size:11.5px;color:var(--mu2);cursor:pointer;">+ Plage</button>' +
      '</div>' +
      '<div id="plage-form-' + jour + '" style="display:none;padding:8px 0 8px 100px;gap:6px;align-items:center;">' +
        '<input type="time" id="plage-debut-' + jour + '" style="padding:5px 8px;border-radius:6px;border:1px solid var(--b2);">' +
        '<span style="font-size:12px;color:var(--mu);">à</span>' +
        '<input type="time" id="plage-fin-' + jour + '" style="padding:5px 8px;border-radius:6px;border:1px solid var(--b2);">' +
        '<button onclick="confirmerAjoutPlage(' + jour + ')" style="padding:5px 10px;border-radius:6px;border:none;background:var(--ac);color:#fff;font-size:11.5px;font-weight:700;cursor:pointer;">OK</button>' +
      '</div>' +
    '</div>';
  }).join('');
}

function ouvrirAjoutPlage(jour) {
  var div = document.getElementById('plage-form-' + jour);
  if (!div) return;
  div.style.display = (div.style.display === 'none' || !div.style.display) ? 'flex' : 'none';
}

async function confirmerAjoutPlage(jour) {
  if (!verifierAccesEcriture()) return;
  var debut = document.getElementById('plage-debut-' + jour).value;
  var fin = document.getElementById('plage-fin-' + jour).value;
  if (!debut || !fin || debut >= fin) { alert('Merci de renseigner une heure de début et une heure de fin valides (fin après le début).'); return; }
  var { error } = await sb.from('artisans_horaires').insert({ artisan_id: _artisan.id, jour_semaine: jour, heure_debut: debut, heure_fin: fin });
  if (error) { alert('Erreur : ' + error.message); return; }
  await chargerHoraires();
}

async function supprimerPlageHoraire(id) {
  if (!verifierAccesEcriture()) return;
  var { error } = await sb.from('artisans_horaires').delete().eq('id', id).eq('artisan_id', _artisan.id);
  if (error) { alert('Erreur : ' + error.message); return; }
  await chargerHoraires();
}

// ════════════════════════════════════════
//  JOURNÉES BLOQUÉES — congés, jours fériés, absences ponctuelles
// ════════════════════════════════════════

var _indisposCache = [];
// Types de fermeture : c'est le SEUL élément montré aux clients (jamais du texte libre — voir « note personnelle » ci-dessous).
var TYPES_FERMETURE_LIBELLE = { vacances: 'Vacances', fermeture: 'Fermeture exceptionnelle', inventaire: 'Inventaire', formation: 'Formation', autre: 'Indisponible' };
function libelleTypeFermeture(code) { return TYPES_FERMETURE_LIBELLE[code] || TYPES_FERMETURE_LIBELLE.autre; }
var _indisposMois = []; // journées bloquées du mois affiché dans le planning

async function chargerIndispos() {
  var zone = document.getElementById('zone-indispo');
  if (!zone) return;
  var aujourdhui = new Date().toISOString().slice(0, 10);
  var { data, error } = await sb.from('artisans_indisponibilites').select('*').eq('artisan_id', _artisan.id)
    .gte('date_fin', aujourdhui).order('date_debut', { ascending: true });
  if (error) { zone.innerHTML = '<p style="color:var(--danger);">Erreur : ' + escHtml(error.message) + '</p>'; return; }
  _indisposCache = data || [];
  renderIndispos();
}

function renderIndispos() {
  var zone = document.getElementById('zone-indispo');
  if (!zone) return;
  var liste = _indisposCache.map(function(i) {
    var debutAff = new Date(i.date_debut + 'T00:00:00').toLocaleDateString('fr-FR');
    var finAff = new Date(i.date_fin + 'T00:00:00').toLocaleDateString('fr-FR');
    var periode = i.date_debut === i.date_fin ? debutAff : (debutAff + ' → ' + finAff);
    return '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid var(--brd);">' +
      '<div>' +
        '<span style="font-weight:600;font-size:13px;">' + periode + '</span>' +
        '<span style="font-size:12px;font-weight:600;color:var(--ac);margin-left:8px;">' + escHtml(libelleTypeFermeture(i.type_fermeture)) + '</span>' +
        (i.motif ? '<span style="font-size:12px;color:var(--mu);margin-left:8px;" title="Note personnelle : visible par vous seulement">🔒 ' + escHtml(i.motif) + '</span>' : '') +
      '</div>' +
      '<button onclick="supprimerIndispo(\'' + i.id + '\')" style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:13px;padding:0;">✕</button>' +
    '</div>';
  }).join('');

  zone.innerHTML =
    (liste || '<div style="font-size:12.5px;color:var(--mu);margin-bottom:10px;">Aucune journée bloquée à venir.</div>') +
    '<div style="display:flex;gap:6px;align-items:center;margin-top:10px;flex-wrap:wrap;">' +
      '<input type="date" id="indispo-debut" style="padding:6px 8px;border-radius:6px;border:1px solid var(--b2);font-size:12.5px;">' +
      '<span style="font-size:12px;color:var(--mu);">au</span>' +
      '<input type="date" id="indispo-fin" style="padding:6px 8px;border-radius:6px;border:1px solid var(--b2);font-size:12.5px;">' +
      '<select id="indispo-type" title="Ce motif est affiché à vos clients" style="padding:6px 8px;border-radius:6px;border:1px solid var(--b2);font-size:12.5px;">' +
        '<option value="vacances">Vacances</option><option value="fermeture">Fermeture exceptionnelle</option>' +
        '<option value="inventaire">Inventaire</option><option value="formation">Formation</option><option value="autre">Autre (affiché « Indisponible »)</option>' +
      '</select>' +
      '<input type="text" id="indispo-motif" maxlength="200" placeholder="Note personnelle (non visible par vos clients)" style="flex:1;min-width:160px;padding:6px 8px;border-radius:6px;border:1px solid var(--b2);font-size:12.5px;">' +
      '<button onclick="ajouterIndispo()" style="padding:6px 12px;border-radius:6px;border:none;background:var(--ac);color:#fff;font-size:12px;font-weight:700;cursor:pointer;">+ Bloquer</button>' +
    '</div>' +
    '<div style="font-size:11.5px;color:var(--mu);margin-top:6px;">Vos clients voient le <strong>type</strong> (ex. « Vacances ») sur votre fiche et au moment de réserver. La note personnelle reste privée.</div>';
}

async function ajouterIndispo() {
  if (!verifierAccesEcriture()) return;
  var debut = document.getElementById('indispo-debut').value;
  var fin = document.getElementById('indispo-fin').value || debut;
  var motif = document.getElementById('indispo-motif').value.trim() || null;
  var typeFermeture = document.getElementById('indispo-type').value;
  if (!TYPES_FERMETURE_LIBELLE[typeFermeture]) typeFermeture = 'autre';
  if (!debut) { alert('Merci de renseigner au moins une date de début.'); return; }
  if (fin < debut) { alert('La date de fin ne peut pas être avant la date de début.'); return; }
  var { error } = await sb.from('artisans_indisponibilites').insert({ artisan_id: _artisan.id, date_debut: debut, date_fin: fin, motif: motif, type_fermeture: typeFermeture });
  if (error) { alert('Erreur : ' + error.message); return; }
  await chargerIndispos();
}

async function supprimerIndispo(id) {
  if (!verifierAccesEcriture()) return;
  var { error } = await sb.from('artisans_indisponibilites').delete().eq('id', id).eq('artisan_id', _artisan.id);
  if (error) { alert('Erreur : ' + error.message); return; }
  await chargerIndispos();
}

async function uploaderLogo() {
  if (!verifierAccesEcriture()) return;
  var input = document.getElementById('logo-input');
  var fichier = input.files[0];
  if (!fichier) return;
  var btn = document.getElementById('btn-logo');
  var texteOriginal = btn.textContent;
  btn.disabled = true; btn.textContent = 'Envoi…';
  try {
    var chemin = _artisan.user_id + '/logo_' + Date.now() + '_' + fichier.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    var up = await sb.storage.from('artisans-photos').upload(chemin, fichier);
    if (up.error) throw new Error(up.error.message);
    var { data: pub } = sb.storage.from('artisans-photos').getPublicUrl(chemin);
    var { error } = await sb.from('artisans').update({ photo_profil_url: pub.publicUrl }).eq('id', _artisan.id);
    if (error) throw error;
    _artisan.photo_profil_url = pub.publicUrl;
    document.getElementById('apercu-logo').innerHTML = '<img src="' + pub.publicUrl + '" style="width:100%;height:100%;object-fit:cover;">';
  } catch (e) {
    alert('Erreur : ' + e.message);
  } finally {
    btn.disabled = false; btn.textContent = texteOriginal;
    input.value = '';
  }
}

async function sauverFiche() {
  var maj = {
    nom_entreprise: document.getElementById('m-nom').value.trim(),
    statut: document.getElementById('m-statut').value.trim(),
    siret: document.getElementById('m-siret').value.trim(),
    ape: document.getElementById('m-ape').value.trim(),
    tva_intra: document.getElementById('m-tva-intra').value.trim(),
    secteur: document.getElementById('m-secteur').value,
    adresse: document.getElementById('m-adr').value.trim(),
    code_postal: document.getElementById('m-cp').value.trim(),
    commune: document.getElementById('m-com').value.trim(),
    rayon_intervention_km: parseInt(document.getElementById('m-rayon').value, 10) || 15,
    telephone: document.getElementById('m-tel').value.trim(),
    email: document.getElementById('m-email').value.trim(),
    site_web: document.getElementById('m-web').value.trim(),
    bio: document.getElementById('m-bio').value.trim(),
  };
  // Frais de déplacement d'une visite sur place : annoncés au client avant sa demande. Envoyés SEULEMENT s'ils sont renseignés
  // ou s'il y avait déjà une valeur à effacer : ainsi l'enregistrement du profil ne dépend pas de la colonne tant qu'on n'y touche pas.
  // Si le champ n'existe pas dans la page affichée (ancienne page en mémoire), on ne touche PAS aux frais : jamais d'effacement silencieux.
  // Réglage « visite d'estimation » : envoyé seulement si la colonne existe, et si l'artisan y a touché ou avait déjà répondu
  // (enregistrer le profil sans y toucher ne vaut JAMAIS réponse : MPA-AI continue de poser la question).
  var caseVisite = document.getElementById('m-visite');
  var visiteCochee = caseVisite ? caseVisite.checked : true;
  if (caseVisite && 'proposer_visite' in _artisan && (window._visiteTouchee || _artisan.proposer_visite != null)) maj.proposer_visite = caseVisite.checked;
  // Les frais ne concernent que les artisans qui proposent la visite : case décochée, on n'y touche pas.
  var champFrais = document.getElementById('m-frais');
  if (champFrais && visiteCochee) {
    var frais = lireFraisDeplacement(champFrais.value);
    if (!frais.ok) { alert('Les frais de déplacement doivent être un montant entre 0 et 500 € (par exemple 25 ou 25,50).'); return; }
    if (frais.valeur !== null || _artisan.frais_deplacement != null) maj.frais_deplacement = frais.valeur;
  }
  // Frais de réservation (payés en ligne) et délai d'annulation gratuite. Envoyés seulement si les colonnes existent (SQL lancé) :
  // jamais d'effacement silencieux si la page affichée est plus ancienne.
  var champResa = document.getElementById('m-frais-resa');
  if (champResa && 'frais_reservation' in _artisan) {
    var resa = lireFraisDeplacement(champResa.value);
    if (!resa.ok || (resa.valeur !== null && resa.valeur > 0 && resa.valeur < 1) || (resa.valeur !== null && resa.valeur > 100 && resa.valeur !== Number(_artisan.frais_reservation))) { alert('Les frais de réservation doivent être un montant entre 1 et 100 € (par exemple 10 ou 12,50), ou rester vides. Ils sont aussi limités à 30 % du prix de chaque service.'); return; }
    if (resa.valeur !== null || _artisan.frais_reservation != null) maj.frais_reservation = resa.valeur;
    if (resa.valeur !== null && resa.valeur > 0 && !paiementsEnLigneActifs()) {
      if (!confirm('Ces frais sont payés en ligne : ils ne s\'appliqueront qu\'une fois vos paiements en ligne activés (Stripe).\n\nEnregistrer quand même ?')) return;
    }
  }
  var champAnnul = document.getElementById('m-annul-heures');
  if (champAnnul && 'annulation_gratuite_heures' in _artisan) maj.annulation_gratuite_heures = parseInt(champAnnul.value, 10) || 0;
  // Géocodage de l'adresse pro — sert de point de départ pour le calcul des trajets (Smart Dispatch)
  if (maj.adresse) {
    var pt = await geocoderAdresse(maj.adresse, maj.code_postal, maj.commune);
    if (pt) { maj.latitude = pt.lat; maj.longitude = pt.lon; }
  }
  var { error } = await sb.from('artisans').update(maj).eq('id', _artisan.id);
  if (error) { alert('Erreur : ' + error.message); return; }
  Object.assign(_artisan, maj);
  renderFiche();
  fermerModale('modal-fiche');
  if (_itinDateChoisie) choisirJourItineraire(_itinDateChoisie);
}

async function saveConfigFiscal() {
  function nombre(id, defaut) { var v = parseFloat(String(document.getElementById(id).value).replace(',', '.')); return (isFinite(v) && v >= 0 && v <= 100) ? v : defaut; }
  var maj = {
    cotisation_sociale_pct: nombre('cfg-cotis', TAUX_DEFAUT_SERVICES),
    tva_config: document.getElementById('cfg-tva').value.trim() || 'Non assujetti',
  };
  // Nouvelles colonnes : on ne les écrit que si la base les a (le SQL « regime-fiscal-artisan.sql » doit avoir été lancé).
  if ('cotisation_ventes_pct' in _artisan) maj.cotisation_ventes_pct = nombre('cfg-cotis-ventes', TAUX_DEFAUT_VENTES);
  if ('cfp_pct' in _artisan) maj.cfp_pct = nombre('cfg-cfp', TAUX_DEFAUT_CFP);
  if ('versement_liberatoire' in _artisan) {
    var vl = document.getElementById('cfg-liberatoire').value;
    maj.versement_liberatoire = vl === 'oui' ? true : vl === 'non' ? false : null;
  }
  var { error } = await sb.from('artisans').update(maj).eq('id', _artisan.id);
  if (error) { alert('Erreur : ' + error.message); return; }
  Object.assign(_artisan, maj);
  // Les écrans de chiffres dépendent de ces réglages : on les recalcule.
  try { renderMatriceCompta(); calculerDashboardFiscal(); } catch (e) { console.error(e); }
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
    tbody.innerHTML = '<tr><td colspan="6" class="etat-vide-tbl">Aucun client habituel pour l\'instant.</td></tr>';
    return;
  }
  tbody.innerHTML = liste.map(function(c) {
    return '<tr>' +
      '<td><strong>' + escHtml(c.nom) + '</strong></td>' +
      '<td>' + (c.email ? escHtml(c.email) : '<span style="color:var(--mu);">—</span>') + '</td>' +
      '<td>' + escHtml(c.adresse||'—') + '</td>' +
      '<td>' + escHtml(c.code_postal||'—') + '</td>' +
      '<td>' + escHtml(c.commune||'—') + '</td>' +
      '<td>' + (c.delai_paiement||30) + ' j</td>' +
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
  document.getElementById('c-email').value = '';
  document.getElementById('c-adr').value = '';
  document.getElementById('c-cp').value = '';
  document.getElementById('c-com').value = '';
  document.getElementById('c-delai').value = 30;
  ouvrirModale('modal-client');
}

async function sauverClient() {
  if (!verifierAccesEcriture()) return;
  var nom = document.getElementById('c-nom').value.trim();
  if (!nom) { alert('Le nom du client est obligatoire.'); return; }
  var nouveau = {
    artisan_id: _artisan.id,
    nom: nom,
    email: document.getElementById('c-email').value.trim() || null,
    adresse: document.getElementById('c-adr').value.trim() || null,
    code_postal: document.getElementById('c-cp').value.trim() || null,
    commune: document.getElementById('c-com').value.trim() || null,
    delai_paiement: parseInt(document.getElementById('c-delai').value, 10) || 30,
  };
  var { error } = await sb.from('mpa_artisans_clients').insert(nouveau);
  if (error) { alert('Erreur : ' + error.message); return; }
  fermerModale('modal-client');
  await chargerClients();
}

async function supprimerClient(id) {
  if (!verifierAccesEcriture()) return;
  if (!confirm('Supprimer ce client ?')) return;
  var { error } = await sb.from('mpa_artisans_clients').delete().eq('id', id).eq('artisan_id', _artisan.id);
  if (error) { alert('Erreur : ' + error.message); return; }
  await chargerClients();
}

// ════════════════════════════════════════
//  MES SERVICES — gestion complète (source unique, partagée avec CaraLink Artisans)
// ════════════════════════════════════════

// ════════════════════════════════════════
//  PHOTOS — visibles sur la fiche publique CaraLink Artisans
// ════════════════════════════════════════

var _photosCache = [];

async function chargerPhotos() {
  var zone = document.getElementById('zone-photos');
  if (!zone) return;
  var { data, error } = await sb.from('artisans_photos').select('*').eq('artisan_id', _artisan.id).order('ordre', { ascending: true });
  if (error) { zone.innerHTML = '<p style="color:var(--danger);">Erreur : ' + escHtml(error.message) + '</p>'; return; }
  _photosCache = data || [];
  renderPhotosGrille();
}

function renderPhotosGrille() {
  var zone = document.getElementById('zone-photos');
  if (!zone) return;
  if (!_photosCache.length) {
    zone.innerHTML = '<p style="grid-column:1/-1;font-size:13px;color:var(--mu);">Aucune photo pour l\'instant — ajoutez vos plus belles réalisations pour rassurer vos futurs clients.</p>';
    return;
  }
  zone.innerHTML = _photosCache.map(function(p) {
    return '<div style="position:relative;border-radius:10px;overflow:hidden;aspect-ratio:1;background:var(--p2);">' +
      '<img src="' + escHtml(p.url_photo) + '" alt="" style="width:100%;height:100%;object-fit:cover;display:block;">' +
      '<button onclick="supprimerPhoto(\'' + p.id + '\')" style="position:absolute;top:5px;right:5px;background:rgba(0,0,0,.6);color:#fff;border:none;border-radius:7px;width:24px;height:24px;cursor:pointer;font-size:13px;">✕</button>' +
    '</div>';
  }).join('');
}

async function uploaderPhoto() {
  if (!verifierAccesEcriture()) return;
  var input = document.getElementById('photo-input');
  var fichier = input.files[0];
  if (!fichier) return;
  var btn = document.getElementById('btn-ajouter-photo');
  btn.disabled = true; btn.textContent = 'Envoi…';
  try {
    var chemin = _artisan.user_id + '/' + Date.now() + '_' + fichier.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    var up = await sb.storage.from('artisans-photos').upload(chemin, fichier);
    if (up.error) throw new Error(up.error.message);
    var { data: pub } = sb.storage.from('artisans-photos').getPublicUrl(chemin);
    var { error } = await sb.from('artisans_photos').insert({
      artisan_id: _artisan.id, url_photo: pub.publicUrl, ordre: _photosCache.length,
    });
    if (error) throw error;
    await chargerPhotos();
  } catch (e) {
    alert('Erreur : ' + e.message);
  }
  btn.disabled = false; btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Ajouter';
  input.value = '';
}

async function supprimerPhoto(id) {
  if (!verifierAccesEcriture()) return;
  if (!confirm('Supprimer cette photo ?')) return;
  var { error } = await sb.from('artisans_photos').delete().eq('id', id).eq('artisan_id', _artisan.id);
  if (error) { alert('Erreur : ' + error.message); return; }
  await chargerPhotos();
}

// ════════════════════════════════════════
//  CATALOGUE — produits disponibles ou sur commande
// ════════════════════════════════════════

var _catalogueCache = [];
var _ventesCatalogueCache = {};

// Génère un lien de boutique lisible à partir du nom d'entreprise + un suffixe aléatoire
// court (évite les collisions sans avoir besoin de vérifier l'unicité côté client).
function genererSlugCatalogue(nomEntreprise) {
  var base = (nomEntreprise || 'boutique').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // enlève les accents
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'boutique';
  var suffixe = Math.random().toString(36).slice(2, 6);
  return base + '-' + suffixe;
}

// Même calcul que celui utilisé côté serveur à la commande (soumettre-commande-panier) — tenu
// ici uniquement pour montrer un exemple à l'artisan pendant qu'il règle son tarif, jamais pour
// calculer un vrai montant facturé (ça, c'est toujours recalculé côté serveur).
function calculerFraisLivraison(base, kmInclus, prixKm, distanceKm) {
  base = Number(base) || 0; kmInclus = Number(kmInclus) || 0; prixKm = Number(prixKm) || 0;
  if (distanceKm <= kmInclus) return base;
  return Math.round((base + (distanceKm - kmInclus) * prixKm) * 100) / 100;
}

function afficherExempleLivraison() {
  var base = document.getElementById('livraison-base').value;
  var kmInclus = document.getElementById('livraison-km-inclus').value;
  var prixKm = document.getElementById('livraison-prix-km').value;
  var zone = document.getElementById('livraison-exemple');
  if (base === '' || kmInclus === '') { zone.textContent = ''; return; }
  var b = Number(base), ki = Number(kmInclus), pk = Number(prixKm) || 0;
  function frais(km) { return km <= ki ? b : Math.round((b + (km - ki) * pk) * 100) / 100; }
  function eur(n) { return n.toFixed(2).replace('.', ',') + ' €'; }
  var texte = '💡 ' + eur(b) + ' jusqu\'à ' + ki + ' km depuis votre local';
  texte += pk > 0 ? ', puis ' + eur(pk) + ' par km supplémentaire.' : ', rien au-delà (pas de tarif au km supplémentaire réglé).';
  texte += ' Ce que paierait le client : ' + [5, 10, 20, 30].map(function(km) { return km + ' km → ' + eur(frais(km)); }).join(' · ') + '.';
  zone.textContent = texte;
}

async function sauverTarifLivraison() {
  if (!verifierAccesEcriture()) return;
  var base = document.getElementById('livraison-base').value;
  var kmInclus = document.getElementById('livraison-km-inclus').value;
  var prixKm = document.getElementById('livraison-prix-km').value;
  var delaiBrut = document.getElementById('livraison-delai-jours').value;
  var delai = delaiBrut === '' ? 7 : Math.round(parseFloat(delaiBrut));
  if (!(delai >= 0 && delai <= 30)) { alert('Le délai de préparation doit être compris entre 0 et 30 jours.'); return; }
  var btn = document.getElementById('btn-livraison-sauver');
  btn.disabled = true; btn.textContent = 'Enregistrement…';
  var { error } = await sb.from('artisans').update({
    livraison_forfait_base: base === '' ? null : parseFloat(base),
    livraison_km_inclus: kmInclus === '' ? null : parseFloat(kmInclus),
    livraison_prix_km_supp: prixKm === '' ? null : parseFloat(prixKm),
    livraison_delai_jours: delai,
  }).eq('id', _artisan.id);
  if (error) { alert('Erreur : ' + error.message); } else {
    _artisan.livraison_forfait_base = base === '' ? null : parseFloat(base);
    _artisan.livraison_km_inclus = kmInclus === '' ? null : parseFloat(kmInclus);
    _artisan.livraison_prix_km_supp = prixKm === '' ? null : parseFloat(prixKm);
    _artisan.livraison_delai_jours = delai;
  }
  btn.disabled = false; btn.textContent = 'Enregistrer';
}

async function chargerCatalogue() {
  var zone = document.getElementById('zone-catalogue');
  if (!zone) return;

  renderEncartStripeConnect();

  document.getElementById('livraison-base').value = _artisan.livraison_forfait_base ?? '';
  document.getElementById('livraison-km-inclus').value = _artisan.livraison_km_inclus ?? '';
  document.getElementById('livraison-prix-km').value = _artisan.livraison_prix_km_supp ?? '';
  document.getElementById('livraison-delai-jours').value = _artisan.livraison_delai_jours ?? 7;
  afficherExempleLivraison();

  // Lien de boutique : généré une fois pour toutes si l'artisan n'en a pas encore.
  if (!_artisan.slug_catalogue) {
    var slug = genererSlugCatalogue(_artisan.nom_entreprise);
    var { error: errSlug } = await sb.from('artisans').update({ slug_catalogue: slug }).eq('id', _artisan.id);
    if (!errSlug) _artisan.slug_catalogue = slug;
  }
  var champLien = document.getElementById('boutique-lien');
  if (champLien) champLien.value = _artisan.slug_catalogue ? 'https://caralink.app/artisans/catalogue.html?s=' + _artisan.slug_catalogue : '—';
  var champPromo = document.getElementById('boutique-code-promo');
  if (champPromo) champPromo.value = _artisan.code_promo || '';
  var champPct = document.getElementById('boutique-code-promo-pct'), champFin = document.getElementById('boutique-code-promo-fin');
  if (champPct) champPct.value = _artisan.code_promo_pct || '';
  if (champFin) champFin.value = _artisan.code_promo_fin || '';
  var champVis = document.getElementById('boutique-code-promo-visible');
  if (champVis) champVis.checked = _artisan.code_promo_visible !== false;
  afficherStatutCodePromo();
  afficherPauseBoutique();

  var { data, error } = await sb.from('artisans_catalogue').select('*').eq('artisan_id', _artisan.id).order('ordre', { ascending: true });
  if (error) { zone.innerHTML = '<p style="color:var(--danger);">Erreur : ' + escHtml(error.message) + '</p>'; return; }
  _catalogueCache = data || [];
  renderEncartStripeConnect(); // la carte (et l'avertissement « boutique masquée ») dépendent de la liste des produits qu'on vient de charger

  // Ventes par produit — jamais un compteur stocké, toujours recalculé sur les commandes réglées.
  _ventesCatalogueCache = await calculerVentesCatalogue(_catalogueCache.map(function(c) { return c.id; }));

  renderCatalogueGrille();
  renderProduitsStock();
  renderVentesProduits();
  afficherStatutCodePromo();
  chargerUsageCodePromo();
  renderMonOffre();
  alerterStocksBas();
}

// MPA-AI : rappelle les produits dont le stock a atteint le seuil d'alerte choisi par l'artisan.
// Un même état (mêmes produits, mêmes quantités) n'est annoncé qu'une fois par session, pas à chaque rechargement du catalogue.
function alerterStocksBas() {
  var bas = _catalogueCache.filter(function(c) {
    return c.quantite_stock != null && c.seuil_alerte != null && c.quantite_stock <= c.seuil_alerte;
  });
  if (!bas.length) return;
  var signature = bas.map(function(c) { return c.id + ':' + c.quantite_stock; }).join('|');
  try { if (sessionStorage.getItem('alerte_stock_vue') === signature) return; sessionStorage.setItem('alerte_stock_vue', signature); } catch (e) {}
  var lignes = bas.map(function(c) {
    return c.quantite_stock <= 0 ? '🚫 ' + escHtml(c.nom) + ' : épuisé' : '🔔 ' + escHtml(c.nom) + ' : ' + c.quantite_stock + ' restant' + (c.quantite_stock > 1 ? 's' : '') + ' (seuil ' + c.seuil_alerte + ')';
  });
  var epuise = bas.some(function(c) { return c.quantite_stock <= 0; });
  mpaAiDire('<strong>Stock à surveiller :</strong><br>' + lignes.join('<br>') + '<br><br>Pensez à réapprovisionner pour ne pas manquer de ventes.', epuise ? 'important' : 'warning');
}

// Ventes par produit = commandes réglées d'UN article (ancien format : catalogue_id sur la commande) + lignes des commandes PANIER
// réglées (catalogue_id sur chaque ligne). Les commandes de la boutique actuelle sont toutes des paniers : sans leurs lignes,
// le compteur restait à 0 malgré des ventes. Les lignes sont lues par paquets de 100 commandes (adresse de requête limitée).
var STATUTS_COMMANDE_REGLEE = ['paye', 'partiellement_rembourse', 'rembourse'];
var _caCatalogue = {}; // chiffre d'affaires par article (remboursements et livraison exclus), rempli avec les quantités
async function calculerVentesCatalogue(ids) {
  var ventes = {};
  _caCatalogue = {};
  if (!ids.length) return ventes;
  var connus = {};
  ids.forEach(function(id) { connus[id] = true; });
  var { data: unArticle } = await sb.from('commandes_catalogue').select('catalogue_id, quantite, montant_total, montant_rembourse, frais_livraison')
    .in('catalogue_id', ids).in('paiement_statut', STATUTS_COMMANDE_REGLEE);
  (unArticle || []).forEach(function(c) {
    if (!c.catalogue_id) return;
    ventes[c.catalogue_id] = (ventes[c.catalogue_id] || 0) + (c.quantite || 0);
    _caCatalogue[c.catalogue_id] = (_caCatalogue[c.catalogue_id] || 0) + Math.max(0, Number(c.montant_total || 0) - Number(c.montant_rembourse || 0) - Number(c.frais_livraison || 0));
  });
  var { data: paniers } = await sb.from('commandes_catalogue').select('id')
    .eq('artisan_id', _artisan.id).is('catalogue_id', null).in('paiement_statut', STATUTS_COMMANDE_REGLEE);
  var idsPaniers = (paniers || []).map(function(c) { return c.id; });
  for (var i = 0; i < idsPaniers.length; i += 100) {
    var { data: lignes } = await sb.from('commandes_catalogue_lignes').select('catalogue_id, quantite, prix_unitaire')
      .in('commande_id', idsPaniers.slice(i, i + 100));
    (lignes || []).forEach(function(l) {
      if (!l.catalogue_id || !connus[l.catalogue_id]) return;
      ventes[l.catalogue_id] = (ventes[l.catalogue_id] || 0) + (l.quantite || 0);
      _caCatalogue[l.catalogue_id] = (_caCatalogue[l.catalogue_id] || 0) + (Number(l.prix_unitaire) || 0) * (l.quantite || 0);
    });
  }
  return ventes;
}

// ── Partager sa fiche ou sa boutique : lien, message prêt à envoyer, WhatsApp / Facebook / email, QR code à imprimer ──
// Un client qui réserve par ce lien passe par CaraLink : il compte comme client CaraLink (règle de commission de la formule).
var _partageArtisan = null; // { quoi, url, nom, texte }
function lienPartageArtisan(quoi) {
  if (!_artisan) return null;
  if (quoi === 'boutique') return _artisan.slug_catalogue ? 'https://caralink.app/artisans/catalogue.html?s=' + encodeURIComponent(_artisan.slug_catalogue) : null;
  return 'https://caralink.app/artisans/?artisan=' + encodeURIComponent(_artisan.id);
}
// ════════════════════════════════════════
//  PLANNING DANS L'AGENDA DU TÉLÉPHONE (Pro) — abonnement par lien (.ics), servi par la fonction planning-ics.
//  L'artisan colle le lien UNE fois dans Google Agenda / Apple Calendrier / Outlook ; l'agenda se met ensuite à jour tout seul.
//  Le lien contient un code secret (artisans.calendrier_code), régénérable : l'ancien lien cesse alors de fonctionner.
// ════════════════════════════════════════
function nouveauCodeAgenda() {
  var octets = new Uint8Array(30);
  crypto.getRandomValues(octets);
  var bin = ''; octets.forEach(function(o) { bin += String.fromCharCode(o); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); // 40 caractères
}
function lienAgenda() {
  return _artisan && _artisan.calendrier_code ? SUPABASE_URL + '/functions/v1/planning-ics?t=' + _artisan.calendrier_code : '';
}
async function ouvrirAgendaSync() {
  if (!exigerPro('agenda')) return;
  if (!('calendrier_code' in _artisan)) { alert('Cette fonction n\'est pas encore activée sur votre compte. Réessayez un peu plus tard.'); return; }
  if (!_artisan.calendrier_code) {
    var code = nouveauCodeAgenda();
    var { error } = await sb.from('artisans').update({ calendrier_code: code }).eq('id', _artisan.id);
    if (error) { alert('Erreur : ' + error.message); return; }
    _artisan.calendrier_code = code;
  }
  afficherAgendaSync();
  ouvrirModale('modal-agenda');
}
function afficherAgendaSync() {
  var lien = lienAgenda();
  document.getElementById('ag-lien').value = lien;
  document.getElementById('ag-apple').href = lien.replace(/^https:/, 'webcal:');
  // L'appareil de l'artisan passe en premier : Apple sur iPhone / Mac, Google Agenda ailleurs.
  var estApple = /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent || '');
  var ios = document.getElementById('ag-bloc-ios'), goo = document.getElementById('ag-bloc-google'), zone = ios.parentNode;
  zone.insertBefore(estApple ? ios : goo, zone.firstChild);
}
// Raccourci Apple Calendrier : seul Safari sait ouvrir un lien « webcal: ». Ailleurs (application installée, navigateur intégré), rien ne se passe :
// on prévient alors l'artisan au lieu de le laisser devant un bouton muet.
function ouvrirAppleCalendrier(ev) {
  if (ev) ev.preventDefault();
  var lien = lienAgenda(); if (!lien) return;
  var cache = false;
  var surCache = function() { cache = document.hidden; };
  document.addEventListener('visibilitychange', surCache, { once: true });
  window.location.href = lien.replace(/^https:/, 'webcal:');
  setTimeout(function() {
    document.removeEventListener('visibilitychange', surCache);
    if (!cache && !document.hidden) alert('Ce raccourci n\'a pas pu ouvrir Apple Calendrier depuis cette page.\n\nPas de souci : touchez « Copier », puis Réglages › Calendrier › Comptes de calendrier › Ajouter un compte › Autre › Ajouter un calendrier avec abonnement, et collez le lien.');
  }, 2500);
}
async function regenererLienAgenda() {
  if (!confirm('Générer un nouveau lien ? L\'ancien cessera de fonctionner : vous devrez coller le nouveau dans votre agenda.')) return;
  var code = nouveauCodeAgenda();
  var { error } = await sb.from('artisans').update({ calendrier_code: code }).eq('id', _artisan.id);
  if (error) { alert('Erreur : ' + error.message); return; }
  _artisan.calendrier_code = code;
  afficherAgendaSync();
}

function ouvrirPartageArtisan(quoi) {
  var url = lienPartageArtisan(quoi);
  if (!url) { alert('Le lien de votre boutique n\'est pas encore prêt : ouvrez d\'abord l\'onglet « Catalogue », puis réessayez.'); return; }
  var nom = _artisan.nom_entreprise || 'mon entreprise';
  var boutique = quoi === 'boutique';
  var texte = boutique ? 'Découvrez ma boutique en ligne : ' + url : 'Bonjour, vous pouvez réserver un rendez-vous avec ' + nom + ' directement en ligne : ' + url;
  _partageArtisan = { quoi: boutique ? 'boutique' : 'fiche', url: url, nom: nom, texte: texte };
  document.getElementById('pa-titre').textContent = boutique ? '🔗 Partager ma boutique' : '🔗 Partager ma fiche';
  document.getElementById('pa-intro').textContent = boutique ? 'Envoyez le lien de votre boutique à vos clients, ou imprimez le QR code.' : 'Envoyez le lien de votre fiche à vos clients : ils peuvent réserver un rendez-vous en ligne, ou imprimez le QR code.';
  document.getElementById('pa-lien').value = url;
  document.getElementById('pa-message').value = texte;
  document.getElementById('pa-whatsapp').href = 'https://wa.me/?text=' + encodeURIComponent(texte);
  document.getElementById('pa-facebook').href = 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(url);
  document.getElementById('pa-email').href = 'mailto:?subject=' + encodeURIComponent(boutique ? 'Ma boutique en ligne' : nom) + '&body=' + encodeURIComponent(texte);
  document.getElementById('pa-natif').style.display = navigator.share ? 'inline-block' : 'none';
  document.getElementById('pa-note').textContent = boutique
    ? 'Les achats se font en ligne via CaraLink (commission selon votre formule : voir « Mon offre »).'
    : 'Les clients qui réservent par ce lien passent par CaraLink : ils comptent comme clients CaraLink, et leurs prestations suivent la règle de commission de votre formule.';
  var zone = document.getElementById('pa-qr'), btn = document.getElementById('pa-telecharger');
  zone.innerHTML = '';
  try {
    var img = new Image(); img.alt = 'QR code'; img.style.cssText = 'width:200px;height:200px;display:block;'; img.src = dataUrlQRArtisan(url, 300);
    zone.appendChild(img); zone.style.padding = '10px'; btn.style.display = 'inline-block';
  } catch (e) {
    zone.style.padding = '0'; btn.style.display = 'none';
    zone.innerHTML = '<div style="font-size:12.5px;color:var(--danger);padding:8px;">Le QR code n\'a pas pu être créé (connexion). Rechargez la page et réessayez.</div>';
  }
  ouvrirModale('modal-partage-artisan');
}
// PNG du QR code avec une marge blanche (indispensable pour qu'un téléphone le lise une fois imprimé). Lève une erreur si la bibliothèque est absente.
function dataUrlQRArtisan(url, taille) {
  if (typeof QRCode === 'undefined') throw new Error('QRCode indisponible');
  var tmp = document.createElement('div'); tmp.style.cssText = 'position:fixed;left:-9999px;top:0;'; document.body.appendChild(tmp);
  try {
    new QRCode(tmp, { text: url, width: taille, height: taille, correctLevel: QRCode.CorrectLevel.M });
    var src = tmp.querySelector('canvas'); if (!src) throw new Error('canvas absent');
    var marge = Math.round(taille * 0.08), c = document.createElement('canvas'); c.width = c.height = taille + 2 * marge;
    var g = c.getContext('2d'); g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(src, marge, marge);
    return c.toDataURL('image/png');
  } finally { document.body.removeChild(tmp); }
}
function telechargerQRArtisan() {
  if (!_partageArtisan) return;
  try {
    var a = document.createElement('a'); a.href = dataUrlQRArtisan(_partageArtisan.url, 1000);
    a.download = _partageArtisan.quoi === 'boutique' ? 'qr-ma-boutique.png' : 'qr-ma-fiche.png';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  } catch (e) { alert('Le QR code n\'a pas pu être créé. Rechargez la page et réessayez.'); }
}
async function copierTextePartageArtisan(idChamp, idBouton) {
  var champ = document.getElementById(idChamp), bouton = document.getElementById(idBouton);
  if (!champ || !bouton) return;
  var ok = false;
  try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(champ.value); ok = true; } } catch (e) { /* on essaie l'autre méthode */ }
  if (!ok) { champ.focus(); champ.select(); try { ok = document.execCommand('copy'); } catch (e) { ok = false; } }
  var avant = bouton.textContent;
  bouton.textContent = ok ? '✅ Copié' : 'Sélectionnez puis copiez';
  setTimeout(function() { bouton.textContent = avant; }, 2200);
}
async function partagerNatifArtisan() {
  if (!_partageArtisan || !navigator.share) return;
  try { await navigator.share({ title: _partageArtisan.quoi === 'boutique' ? 'Ma boutique en ligne' : _partageArtisan.nom, text: _partageArtisan.texte.replace(_partageArtisan.url, '').trim(), url: _partageArtisan.url }); }
  catch (e) { /* menu refermé par l'artisan, ou partage impossible : les boutons WhatsApp / Facebook / email restent là */ }
}

function copierLienBoutique() {
  var champ = document.getElementById('boutique-lien');
  champ.select();
  if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(champ.value); } else { document.execCommand('copy'); }
  alert('Lien copié !');
}

// ── Boutique en pause : fermer / rouvrir sa boutique en ligne d'un clic ──
function afficherPauseBoutique() {
  var zone = document.getElementById('boutique-pause-zone');
  if (!zone) return;
  var pause = _artisan.boutique_en_pause === true;
  zone.style.borderColor = pause ? 'rgba(217,119,6,.5)' : 'var(--brd)';
  zone.innerHTML =
    '<div style="font-size:13px;line-height:1.45;">' +
      (pause
        ? '<strong>⏸️ Boutique en pause</strong><br><span style="color:var(--mu);">Vos clients voient « boutique momentanément fermée » et ne peuvent plus commander ni payer.</span>'
        : '<strong>🟢 Boutique ouverte</strong><br><span style="color:var(--mu);">Besoin d\'une pause (vacances, rupture générale…) ? Fermez-la en un clic, sans rien supprimer.</span>') +
    '</div>' +
    '<button class="addb" id="btn-pause-boutique" onclick="basculerPauseBoutique()" style="flex-shrink:0;">' + (pause ? '▶️ Rouvrir ma boutique' : '⏸️ Mettre en pause') + '</button>';
}

async function basculerPauseBoutique() {
  var pause = _artisan.boutique_en_pause === true;
  if (!pause && !confirm('Mettre votre boutique en pause ?\n\nVos clients ne pourront plus commander ni payer tant que vous ne l\'aurez pas rouverte. Les commandes déjà payées ne sont pas touchées.')) return;
  var btn = document.getElementById('btn-pause-boutique');
  if (btn) { btn.disabled = true; btn.textContent = 'Un instant…'; }
  var { error } = await sb.from('artisans').update({ boutique_en_pause: !pause }).eq('id', _artisan.id);
  if (error) {
    alert('Erreur : ' + error.message);
  } else {
    _artisan.boutique_en_pause = !pause;
    mpaAiDire(_artisan.boutique_en_pause
      ? '⏸️ Votre boutique est en pause : plus aucune commande possible. Pensez à la rouvrir quand vous êtes prêt !'
      : '🟢 Votre boutique est rouverte : vos clients peuvent de nouveau commander.', _artisan.boutique_en_pause ? 'warning' : 'success');
  }
  afficherPauseBoutique();
}

// Dit à l'artisan, en clair, si son code est en ce moment utilisable par les clients (et pourquoi pas).
function afficherStatutCodePromo() {
  var z = document.getElementById('code-promo-statut');
  if (!z) return;
  var code = _artisan.code_promo, pct = Number(_artisan.code_promo_pct), fin = _artisan.code_promo_fin;
  var aujourdhui = new Date(Date.now() - 4 * 3600 * 1000).toISOString().slice(0, 10);
  if (!code) { z.textContent = 'Aucun code actif.'; return; }
  if (!estPro()) { z.innerHTML = '⚠️ Réservé à l\'offre Pro : tant que vous n\'êtes pas Pro, votre code n\'est pas proposé à vos clients.'; return; }
  if (!(pct >= 1 && pct <= 50)) { z.innerHTML = '⚠️ Indiquez le pourcentage de remise : sans lui, le code n\'est pas proposé à vos clients.'; return; }
  if (fin && String(fin).slice(0, 10) < aujourdhui) { z.innerHTML = '⌛ Ce code a expiré le ' + new Date(fin + 'T12:00:00').toLocaleDateString('fr-FR') + '.'; return; }
  var nbRemises = (_catalogueCache || []).filter(function(c) { return c.promo_pct && c.en_vente !== false; }).length;
  z.innerHTML = '✅ Actif : <strong>' + escHtml(code) + '</strong> donne −' + pct + ' %' + (fin ? ' jusqu\'au ' + new Date(fin + 'T12:00:00').toLocaleDateString('fr-FR') : '') + (_artisan.code_promo_visible === false ? ' · 🔒 non affiché sur CaraLink' : ' · affiché sur CaraLink') + '.' +
    (nbRemises ? ' <span style="color:var(--mu);">' + nbRemises + ' produit' + (nbRemises > 1 ? 's' : '') + ' ' + (nbRemises > 1 ? 'ont' : 'a') + ' déjà une remise : le code ne s\'y applique pas.</span>' : '');
}

// Combien de fois chaque code a servi : commandes réglées avec ce code, hors commandes entièrement remboursées.
async function chargerUsageCodePromo() {
  var z = document.getElementById('code-promo-usage');
  if (!z || !_artisan) return;
  try {
    var { data, error } = await sb.from('commandes_catalogue').select('code_promo, montant_total, montant_rembourse, frais_livraison')
      .eq('artisan_id', _artisan.id).not('code_promo', 'is', null).in('paiement_statut', STATUTS_COMMANDE_REGLEE);
    if (error) throw error;
    var parCode = {};
    (data || []).forEach(function(c) {
      if (Number(c.montant_rembourse || 0) >= Number(c.montant_total || 0) && Number(c.montant_total) > 0) return;
      var k = c.code_promo;
      if (!parCode[k]) parCode[k] = { n: 0, ca: 0 };
      parCode[k].n++;
      parCode[k].ca += Math.max(0, Number(c.montant_total || 0) - Number(c.montant_rembourse || 0) - Number(c.frais_livraison || 0));
    });
    var codes = Object.keys(parCode).sort(function(a, b) { return parCode[b].n - parCode[a].n; });
    if (!codes.length) { z.innerHTML = _artisan.code_promo ? '<span style="color:var(--mu);">📊 Ce code n\'a pas encore été utilisé.</span>' : ''; return; }
    z.innerHTML = '📊 <strong>Utilisation des codes</strong><br>' + codes.map(function(k) {
      var u = parCode[k];
      return '<span style="font-family:monospace;font-weight:700;">' + escHtml(k) + '</span>' + (k === _artisan.code_promo ? ' (actuel)' : '') + ' : ' + u.n + ' commande' + (u.n > 1 ? 's' : '') + ' · ' + eurosMPA(u.ca) + ' de ventes';
    }).join('<br>');
  } catch (e) { z.innerHTML = ''; /* colonne pas encore créée (SQL pas lancé) : rien à afficher */ }
}

async function sauverCodePromo() {
  if (!verifierAccesEcriture()) return;
  var code = document.getElementById('boutique-code-promo').value.trim().toUpperCase();
  var pctBrut = document.getElementById('boutique-code-promo-pct').value.trim();
  var fin = document.getElementById('boutique-code-promo-fin').value || null;
  if (code && !exigerPro('code_promo')) return;
  if (code && !/^[A-Z0-9_-]{3,30}$/.test(code)) { alert('Le code doit faire 3 à 30 caractères : lettres, chiffres, tiret ou souligné (sans espace ni accent).'); return; }
  var pct = pctBrut === '' ? null : parseInt(pctBrut, 10);
  if (code && (!pct || pct < 1 || pct > 50)) { alert('Indiquez une remise entre 1 % et 50 %.'); return; }
  if (!code) { pct = null; fin = null; } // pas de code : on efface tout
  var btn = document.getElementById('btn-code-promo');
  btn.disabled = true; btn.textContent = 'Enregistrement…';
  var visible = document.getElementById('boutique-code-promo-visible').checked;
  var maj = { code_promo: code || null, code_promo_pct: pct, code_promo_fin: fin, code_promo_visible: code ? visible : true };
  var { error } = await sb.from('artisans').update(maj).eq('id', _artisan.id);
  if (error) { alert('Erreur : ' + error.message); }
  else {
    _artisan.code_promo = maj.code_promo; _artisan.code_promo_pct = maj.code_promo_pct; _artisan.code_promo_fin = maj.code_promo_fin; _artisan.code_promo_visible = maj.code_promo_visible;
    document.getElementById('boutique-code-promo').value = code;
    mpaAiDire(code ? '🎁 Code promo ' + escHtml(code) + ' enregistré : −' + pct + ' % sur les produits qui n\'ont pas déjà une remise' + (visible ? '.' : ' (code partenaire : non affiché sur CaraLink).') : '🎁 Code promo supprimé.', 'info');
  }
  btn.disabled = false; btn.textContent = 'Enregistrer';
  afficherStatutCodePromo();
  chargerUsageCodePromo();
}

function renderVentesProduits() {
  var zone = document.getElementById('zone-ventes-produits');
  if (!zone) return;
  if (!_catalogueCache.length) { zone.innerHTML = 'Ajoutez des produits pour voir vos ventes ici.'; return; }

  var avecVentes = _catalogueCache.map(function(c) { return { nom: c.nom, ventes: _ventesCatalogueCache[c.id] || 0, ca: _caCatalogue[c.id] || 0 }; })
    .sort(function(a, b) { return b.ventes - a.ventes; });
  var meilleures = avecVentes.slice(0, 3);
  var moins = avecVentes.slice(-3).reverse();

  function liste(items) {
    return items.map(function(i) { return '<div style="display:flex;justify-content:space-between;padding:4px 0;"><span>' + escHtml(i.nom) + '</span><strong>' + i.ventes + ' vendu' + (i.ventes > 1 ? 's' : '') + (i.ca > 0 ? ' · ' + eurosMPA(i.ca) : '') + '</strong></div>'; }).join('');
  }
  zone.innerHTML =
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">' +
      '<div><div style="font-weight:700;color:#0f9d78;margin-bottom:6px;">🏆 Meilleures ventes</div>' + liste(meilleures) + '</div>' +
      '<div><div style="font-weight:700;color:var(--mu);margin-bottom:6px;">📉 Moins vendus</div>' + liste(moins) + '</div>' +
    '</div>';
}

function renderCatalogueGrille() {
  var zone = document.getElementById('zone-catalogue');
  if (!zone) return;
  // Mon catalogue = uniquement ce qui est actuellement en vente. Pour ajouter un article ici,
  // il doit d'abord exister dans Mes produits (Mon stock), puis être choisi via "Ajouter".
  var enVente = _catalogueCache.filter(function(c) { return c.en_vente !== false; });
  if (!enVente.length) {
    zone.innerHTML = '<p style="grid-column:1/-1;font-size:13px;color:var(--mu);">Rien en vente pour l\'instant — ajoutez un produit depuis votre stock.</p>';
    return;
  }
  zone.innerHTML = enVente.map(function(c) {
    var badge = c.type === 'sur_commande'
      ? '<span style="display:inline-block;padding:2px 8px;border-radius:6px;background:rgba(245,158,11,.1);color:#b45309;font-size:10.5px;font-weight:700;">Sur commande' + (c.delai_preparation ? ' · ' + escHtml(c.delai_preparation) : '') + '</span>'
      : '<span style="display:inline-block;padding:2px 8px;border-radius:6px;background:rgba(15,157,120,.1);color:#0f9d78;font-size:10.5px;font-weight:700;">Disponible</span>';
    var photo = c.url_photo
      ? '<img src="' + escHtml(c.url_photo) + '" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:8px 8px 0 0;">'
      : '<div style="width:100%;aspect-ratio:1;background:var(--p2);border-radius:8px 8px 0 0;display:flex;align-items:center;justify-content:center;color:var(--mu);font-size:24px;">📦</div>';
    var ventes = _ventesCatalogueCache[c.id] || 0;
    return '<div style="border:1px solid var(--brd);border-radius:10px;overflow:hidden;position:relative;">' +
      '<button onclick="supprimerCatalogue(\'' + c.id + '\')" style="position:absolute;top:6px;right:6px;background:rgba(0,0,0,.55);color:#fff;border:none;border-radius:7px;width:24px;height:24px;cursor:pointer;font-size:12px;z-index:1;">✕</button>' +
      '<button onclick="togglePhareCatalogue(\'' + c.id + '\')" title="' + (c.est_phare ? 'Retirer des produits phares' : 'Marquer comme produit phare') + '" style="position:absolute;top:6px;left:6px;background:' + (c.est_phare ? 'var(--gold,#b45309)' : 'rgba(0,0,0,.45)') + ';color:#fff;border:none;border-radius:7px;width:24px;height:24px;cursor:pointer;font-size:13px;z-index:1;">⭐</button>' +
      photo +
      '<div style="padding:10px;">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:3px;">' +
          '<div style="font-size:13px;font-weight:700;">' + escHtml(c.nom) + '</div>' +
          '<button onclick="ouvrirModifierCatalogue(\'' + c.id + '\')" title="Modifier cet article" style="flex-shrink:0;background:none;border:1px solid var(--brd);border-radius:6px;width:22px;height:22px;cursor:pointer;font-size:11px;color:var(--mu2);">✎</button>' +
        '</div>' +
        (c.prix != null ? '<div style="font-size:13px;color:var(--ac);font-weight:700;margin-bottom:6px;">' + c.prix + ' €</div>' : '') +
        (c.categorie ? '<div style="font-size:10.5px;color:var(--mu);margin-bottom:4px;">🏷️ ' + escHtml(c.categorie) + '</div>' : '') +
        badge +
        '<div style="font-size:11px;color:var(--mu);margin-top:6px;">' + ventes + ' vendu' + (ventes > 1 ? 's' : '') + '</div>' +
        '<div style="display:flex;align-items:center;gap:6px;margin-top:8px;">' +
          '<input type="number" min="0" max="99" placeholder="Remise %" value="' + (c.promo_pct || '') + '" id="promo-' + c.id + '" style="width:70px;padding:5px 7px;border-radius:6px;border:1px solid var(--brd);font-size:11.5px;">' +
          '<button onclick="sauverPromoCatalogue(\'' + c.id + '\')" style="padding:5px 9px;border-radius:6px;border:1px solid var(--ac);background:transparent;color:var(--ac);font-size:11px;font-weight:700;cursor:pointer;">OK</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('');
}

// ── Mes produits (Mon stock) — TOUS les produits, en vente ou non. C'est ici qu'on les crée ;
// "Mon catalogue" (Mes ventes) ne fait plus que choisir, parmi ceux-là, lesquels sont en vente.
function renderProduitsStock() {
  var zone = document.getElementById('zone-produits-stock');
  if (!zone) return;
  if (!_catalogueCache.length) {
    zone.innerHTML = '<p style="grid-column:1/-1;font-size:13px;color:var(--mu);">Aucun produit pour l\'instant — créez votre premier article.</p>';
    return;
  }
  zone.innerHTML = _catalogueCache.map(function(c) {
    var enVente = c.en_vente !== false;
    var stockTexte = c.quantite_stock == null ? 'Illimité' : c.quantite_stock + ' en stock';
    var stockBas = c.quantite_stock != null && c.quantite_stock <= 0;
    var stockAlerte = !stockBas && c.quantite_stock != null && c.seuil_alerte != null && c.quantite_stock <= c.seuil_alerte;
    var photo = c.url_photo
      ? '<img src="' + escHtml(c.url_photo) + '" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:8px 8px 0 0;">'
      : '<div style="width:100%;aspect-ratio:1;background:var(--p2);border-radius:8px 8px 0 0;display:flex;align-items:center;justify-content:center;color:var(--mu);font-size:24px;">📦</div>';
    return '<div style="border:1px solid var(--brd);border-radius:10px;overflow:hidden;position:relative;">' +
      '<button onclick="supprimerCatalogue(\'' + c.id + '\')" style="position:absolute;top:6px;right:6px;background:rgba(0,0,0,.55);color:#fff;border:none;border-radius:7px;width:24px;height:24px;cursor:pointer;font-size:12px;z-index:1;">✕</button>' +
      photo +
      '<div style="padding:10px;">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:3px;">' +
          '<div style="font-size:13px;font-weight:700;">' + escHtml(c.nom) + '</div>' +
          '<button onclick="ouvrirModifierCatalogue(\'' + c.id + '\')" title="Modifier cet article" style="flex-shrink:0;background:none;border:1px solid var(--brd);border-radius:6px;width:22px;height:22px;cursor:pointer;font-size:11px;color:var(--mu2);">✎</button>' +
        '</div>' +
        (c.prix != null ? '<div style="font-size:13px;color:var(--ac);font-weight:700;margin-bottom:4px;">' + c.prix + ' €</div>' : '') +
        '<div style="font-size:11.5px;color:' + (stockBas ? 'var(--danger)' : stockAlerte ? '#b45309' : 'var(--mu2)') + ';font-weight:' + (stockBas || stockAlerte ? '700' : '400') + ';">' + (stockBas ? '⚠️ ' : stockAlerte ? '🔔 Stock bas : ' : '') + stockTexte + '</div>' +
        '<span style="display:inline-block;margin-top:6px;padding:2px 8px;border-radius:6px;font-size:10.5px;font-weight:700;' + (enVente ? 'background:rgba(15,157,120,.1);color:#0f9d78;' : 'background:var(--p2);color:var(--mu);') + '">' + (enVente ? '✅ En vente' : 'Pas en vente') + '</span>' +
        '<button onclick="toggleEnVenteCatalogue(\'' + c.id + '\')" style="display:block;width:100%;margin-top:8px;padding:6px;border-radius:7px;border:1px solid ' + (enVente ? 'var(--brd)' : 'var(--ac)') + ';background:transparent;color:' + (enVente ? 'var(--mu2)' : 'var(--ac)') + ';font-size:11.5px;font-weight:700;cursor:pointer;">' + (enVente ? 'Retirer de la vente' : 'Mettre en vente') + '</button>' +
      '</div>' +
    '</div>';
  }).join('');
}

// ── Règle du 06/10 : on ne met un produit en vente que si les paiements en ligne sont ACTIFS (sinon la boutique ne servirait à rien). ──
// Créer et préparer des produits reste libre ; retirer un produit de la vente aussi. La base de données applique la même règle.
// MPA-AI accompagne l'artisan vers l'activation des paiements dès qu'il a des produits : sans eux il ne peut rien vendre.
// Au plus une fois par session et par occasion (au démarrage / juste après la création d'un produit).
var _rappelsPaiements = {};
function rappelerPaiementsBoutique(occasion) {
  if (!_artisan || paiementsEnLigneActifs() || _rappelsPaiements[occasion]) return;
  if (!(_catalogueCache && _catalogueCache.length)) return;
  _rappelsPaiements[occasion] = true;
  if (_artisan.stripe_connect_statut === 'en_cours') {
    mpaAiDire('Votre compte de paiement n\'est pas encore vérifié. Terminez l\'activation pour pouvoir mettre vos produits en vente.', 'pro', { label: 'Terminer l\'activation →', action: 'lancerStripeConnect(null)' });
  } else {
    mpaAiDire((occasion === 'creation' ? 'Votre produit est prêt ! ' : 'Vous avez des produits prêts. ') + 'Pour les mettre en vente, activez d\'abord les paiements en ligne : vos clients paient par carte et l\'argent arrive sur votre compte. Cela prend environ 5 minutes — ayez votre pièce d\'identité et votre IBAN sous la main.', 'pro', { label: 'Activer les paiements →', action: 'lancerStripeConnect(null)' });
  }
}
// Réservations payées en ligne (15/10/2026) : sans paiements en ligne actifs, un artisan ne peut plus recevoir de réservation ni apparaître
// dans l'annuaire, après une période de grâce. MPA-AI le rappelle, une fois par session, avec la date limite.
var FIN_PERIODE_GRACE_PAIEMENTS = '2026-11-01';
function rappelerStripeReservations() {
  if (!_artisan || paiementsEnLigneActifs() || _rappelsPaiements['reservations']) return;
  _rappelsPaiements['reservations'] = true;
  var aujourdhui = new Date(Date.now() - 4 * 3600 * 1000).toISOString().slice(0, 10);
  var enCours = _artisan.stripe_connect_statut === 'en_cours';
  var action = { label: enCours ? 'Terminer l\'activation →' : 'Activer mes paiements →', action: 'lancerStripeConnect(null)' };
  if (aujourdhui > FIN_PERIODE_GRACE_PAIEMENTS) {
    mpaAiDire('⚠️ Vos paiements en ligne ne sont pas activés : vous n\'apparaissez plus dans l\'annuaire et vos clients ne peuvent plus réserver chez vous. Activez-les (environ 5 minutes) pour revenir immédiatement.', 'important', action);
  } else {
    mpaAiDire('💶 Nouveau : vos clients paient désormais leurs frais de réservation / de déplacement EN LIGNE, ce qui vous protège des rendez-vous non honorés. Pour continuer à recevoir des réservations et apparaître dans l\'annuaire, activez vos paiements en ligne <strong>avant le 1er novembre 2026</strong> (environ 5 minutes).', 'important', action);
  }
}
function paiementsEnLigneActifs() { return !!_artisan && _artisan.stripe_connect_statut === 'actif'; }
function exigerPaiementsActifs() { // vrai = on peut continuer ; sinon : on explique et on propose d'activer (porte de sortie : « Annuler »)
  if (paiementsEnLigneActifs()) return true;
  var enCours = !!_artisan && _artisan.stripe_connect_statut === 'en_cours';
  var oui = confirm(enCours
    ? 'Votre compte de paiement est en cours de vérification : tant qu\'il n\'est pas validé, vous ne pouvez pas mettre de produit en vente.\n\nTerminer la vérification maintenant ?'
    : 'Pour mettre un produit en vente, il faut d\'abord activer les paiements en ligne : vos clients paient par carte et l\'argent arrive sur votre compte. C\'est obligatoire pour vendre, et cela prend environ 5 minutes (pièce d\'identité et IBAN).\n\nActiver les paiements maintenant ?');
  if (oui) lancerStripeConnect(null);
  return false;
}
async function toggleEnVenteCatalogue(id) {
  if (!verifierAccesEcriture()) return;
  var c = _catalogueCache.find(function(x) { return x.id === id; });
  if (!c) return;
  var nouvelEtat = !(c.en_vente !== false);
  if (nouvelEtat && !exigerPaiementsActifs()) return; // mettre en vente exige des paiements actifs ; retirer de la vente reste toujours possible
  var { error } = await sb.from('artisans_catalogue').update({ en_vente: nouvelEtat }).eq('id', id).eq('artisan_id', _artisan.id);
  if (error) { alert('Erreur : ' + error.message); return; }
  c.en_vente = nouvelEtat;
  renderProduitsStock();
  renderCatalogueGrille();
}

// Depuis Mon catalogue, "Ajouter" ne crée plus un produit — il choisit, parmi ceux déjà créés
// dans Mes produits mais pas encore en vente, lequel publier.
function openChoisirProduitAVendre() {
  var horsVente = _catalogueCache.filter(function(c) { return c.en_vente === false; });
  var zone = document.getElementById('zone-choix-produit-vente');
  if (!horsVente.length) {
    zone.innerHTML = '<p style="font-size:13px;color:var(--mu);padding:10px 0;">Tous vos produits sont déjà en vente. Créez-en un nouveau depuis <strong>Mon stock → Mes produits</strong>.</p>';
  } else {
    zone.innerHTML = horsVente.map(function(c) {
      return '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--brd);">' +
        '<span style="font-size:13px;">' + escHtml(c.nom) + (c.prix != null ? ' <span style="color:var(--mu);">— ' + c.prix + ' €</span>' : '') + '</span>' +
        '<button onclick="toggleEnVenteCatalogue(\'' + c.id + '\');fermerModale(\'modal-choix-produit-vente\');" class="addb">Mettre en vente</button>' +
      '</div>';
    }).join('');
  }
  ouvrirModale('modal-choix-produit-vente');
}

async function togglePhareCatalogue(id) {
  if (!verifierAccesEcriture()) return;
  var item = _catalogueCache.find(function(c) { return c.id === id; });
  if (!item) return;
  var nouveauEtat = !item.est_phare;
  // Limite de l'offre : 1 produit phare en Essentiel, 4 en Pro (la base la contrôle aussi : phares-plan.sql).
  if (nouveauEtat && _catalogueCache.filter(function(c) { return c.est_phare; }).length >= limitePhares()) {
    if (estPro()) alert('Vous avez déjà ' + LIMITE_PHARES_PRO + ' produits phares. Retirez l\'étoile d\'un produit avant d\'en choisir un autre.');
    else proposerPassagePro('phares');
    return;
  }
  var { error } = await sb.from('artisans_catalogue').update({ est_phare: nouveauEtat }).eq('id', id);
  if (error) { if (traiterErreurPlan(error)) return; alert('Erreur : ' + error.message); return; }
  item.est_phare = nouveauEtat;
  renderCatalogueGrille();
}

async function sauverPromoCatalogue(id) {
  var champ = document.getElementById('promo-' + id);
  var valeur = champ.value === '' ? null : parseInt(champ.value, 10);
  if (valeur != null && (isNaN(valeur) || valeur <= 0 || valeur >= 100)) { alert('La remise doit être un pourcentage entre 1 et 99.'); return; }
  var { error } = await sb.from('artisans_catalogue').update({ promo_pct: valeur }).eq('id', id);
  if (error) { alert('Erreur : ' + error.message); return; }
  var item = _catalogueCache.find(function(c) { return c.id === id; });
  if (item) item.promo_pct = valeur;
  afficherStatutCodePromo();
  if (valeur != null && _artisan.code_promo && _artisan.code_promo_pct) mpaAiDire('ℹ️ Ce produit a maintenant une remise de ' + valeur + ' % : votre code promo ' + escHtml(_artisan.code_promo) + ' ne s\'y applique pas (jamais les deux à la fois).', 'info');
}

var _catalogueEnEdition = null;

function openAjouterCatalogue() {
  if (!estPro() && _catalogueCache.length >= LIMITE_PRODUITS_ESSENTIEL) { afficherLimiteProduits(true); return; }
  _catalogueEnEdition = null;
  document.getElementById('modal-catalogue-titre').textContent = 'Ajouter un article';
  document.getElementById('btn-cat-sauver').textContent = 'Enregistrer';
  document.getElementById('cat-nom').value = '';
  document.getElementById('cat-categorie').value = '';
  document.getElementById('cat-desc').value = '';
  document.getElementById('cat-prix').value = '';
  document.getElementById('cat-type').value = 'disponible';
  document.getElementById('cat-delai').value = '';
  document.getElementById('cat-delai-wrap').style.display = 'none';
  document.getElementById('cat-stock').value = '';
  document.getElementById('cat-seuil').value = '';
  document.getElementById('cat-photo-input').value = '';
  ouvrirModale('modal-catalogue');
}

function ouvrirModifierCatalogue(id) {
  var c = _catalogueCache.find(function(x) { return x.id === id; });
  if (!c) return;
  _catalogueEnEdition = id;
  document.getElementById('modal-catalogue-titre').textContent = 'Modifier l\'article';
  document.getElementById('btn-cat-sauver').textContent = 'Enregistrer les modifications';
  document.getElementById('cat-nom').value = c.nom || '';
  document.getElementById('cat-categorie').value = c.categorie || '';
  document.getElementById('cat-desc').value = c.description || '';
  document.getElementById('cat-prix').value = c.prix != null ? c.prix : '';
  document.getElementById('cat-type').value = c.type || 'disponible';
  document.getElementById('cat-delai').value = c.delai_preparation || '';
  document.getElementById('cat-delai-wrap').style.display = c.type === 'sur_commande' ? 'block' : 'none';
  document.getElementById('cat-stock').value = c.quantite_stock != null ? c.quantite_stock : '';
  document.getElementById('cat-seuil').value = c.seuil_alerte != null ? c.seuil_alerte : '';
  document.getElementById('cat-photo-input').value = '';
  ouvrirModale('modal-catalogue');
}

async function sauverCatalogue() {
  if (!verifierAccesEcriture()) return;
  var nom = document.getElementById('cat-nom').value.trim();
  if (!nom) { alert('Le nom de l\'article est obligatoire.'); return; }
  var btn = document.getElementById('btn-cat-sauver');
  btn.disabled = true; btn.textContent = 'Enregistrement…';

  try {
    var urlPhoto = null;
    var fichier = document.getElementById('cat-photo-input').files[0];
    if (fichier) {
      var chemin = _artisan.user_id + '/catalogue-' + Date.now() + '_' + fichier.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      var up = await sb.storage.from('artisans-photos').upload(chemin, fichier);
      if (up.error) throw new Error(up.error.message);
      var { data: pub } = sb.storage.from('artisans-photos').getPublicUrl(chemin);
      urlPhoto = pub.publicUrl;
    }

    var champs = {
      nom: nom,
      categorie: document.getElementById('cat-categorie').value.trim() || null,
      description: document.getElementById('cat-desc').value.trim() || null,
      prix: parseFloat(document.getElementById('cat-prix').value) || null,
      type: document.getElementById('cat-type').value,
      delai_preparation: document.getElementById('cat-delai').value.trim() || null,
      quantite_stock: document.getElementById('cat-stock').value !== '' ? parseInt(document.getElementById('cat-stock').value, 10) : null,
      // Un seuil n'a de sens que si le stock est suivi (pas illimité).
      seuil_alerte: (document.getElementById('cat-stock').value !== '' && document.getElementById('cat-seuil').value !== '' && parseInt(document.getElementById('cat-seuil').value, 10) >= 0) ? parseInt(document.getElementById('cat-seuil').value, 10) : null,
    };
    if (urlPhoto) champs.url_photo = urlPhoto; // garde la photo existante si aucune nouvelle n'est choisie

    if (_catalogueEnEdition) {
      var { error } = await sb.from('artisans_catalogue').update(champs).eq('id', _catalogueEnEdition).eq('artisan_id', _artisan.id);
      if (error) throw error;
    } else {
      // Un produit tout juste créé depuis "Mes produits" n'est pas mis en vente tout seul — il
      // faut explicitement le choisir depuis "Mon catalogue" (voir openChoisirProduitAVendre).
      var nouveau = Object.assign({ artisan_id: _artisan.id, ordre: _catalogueCache.length, en_vente: false }, champs);
      var { error } = await sb.from('artisans_catalogue').insert(nouveau);
      if (error) throw error;
    }
    fermerModale('modal-catalogue');
    await chargerCatalogue();
    if (!_catalogueEnEdition && !estPro() && _catalogueCache.length >= LIMITE_PRODUITS_ESSENTIEL) afficherLimiteProduits(false);
    else if (!_catalogueEnEdition) rappelerPaiementsBoutique('creation');
  } catch (e) {
    if (!traiterErreurPlan(e)) alert('Erreur : ' + e.message);
  }
  btn.disabled = false; btn.textContent = _catalogueEnEdition ? 'Enregistrer les modifications' : 'Ajouter';
}

async function supprimerCatalogue(id) {
  if (!verifierAccesEcriture()) return;
  if (!confirm('Supprimer cet article du catalogue ?')) return;
  var { error } = await sb.from('artisans_catalogue').delete().eq('id', id).eq('artisan_id', _artisan.id);
  if (error) { alert('Erreur : ' + error.message); return; }
  await chargerCatalogue();
}

// ════════════════════════════════════════
//  COMMANDES — retrait ou livraison, avec bascule vers le planning
// ════════════════════════════════════════

var _commandesCache = [];
var _lignesCommandesCache = {};
var _interventionsAVenirCache = [];
var LABELS_STATUT_COMMANDE = { nouvelle: '🆕 Nouvelle', confirmee: '✅ Confirmée', prete: '📦 Prête', terminee: '🏁 Terminée', annulee: '⛔ Annulée' };
var CYCLE_STATUT_COMMANDE = { nouvelle: 'confirmee', confirmee: 'prete', prete: 'terminee' };

// ── Mes livraisons — la liste du jour, pour ne pas avoir à chercher dans le planning.
// Montre aussi si la livraison a été regroupée avec une autre intervention du même secteur
// le même jour — pas un indicateur stocké à part, toujours recalculé en comparant les
// interventions du jour entre elles (jamais désynchronisé).
async function chargerLivraisons() {
  var zone = document.getElementById('zone-livraisons');
  if (!zone) return;

  var aujourdhui = jourGuadeloupe();
  var { data: livraisons, error } = await sb.from('commandes_catalogue')
    .select('id, client_nom, client_telephone, adresse_livraison, commune_livraison, nom_article, quantite, statut, paiement_statut, intervention_id, livraison_debut, livraison_fin, livraison_prevue_le, mpa_artisans_interventions(id, date_intervention, creneau, heure_debut, commune, statut)')
    .eq('artisan_id', _artisan.id)
    .eq('mode', 'livraison')
    .neq('statut', 'annulee');
  if (error) {
    zone.innerHTML = '<p style="color:var(--danger);">Erreur : ' + escHtml(error.message) + '</p>';
    return;
  }
  var toutes = (livraisons || []).filter(function(l) { return STATUTS_COMMANDE_REGLEE.indexOf(l.paiement_statut) !== -1 && l.statut !== 'terminee'; });
  var finSemaine = ajouterJoursISO(aujourdhui, 7);
  var planifiees = toutes.filter(function(l) { var i = l.mpa_artisans_interventions; return i && i.statut !== 'annulee'; });
  var duJour = planifiees.filter(function(l) { return l.mpa_artisans_interventions.date_intervention === aujourdhui; });
  var semaine = planifiees.filter(function(l) { var d = l.mpa_artisans_interventions.date_intervention; return d > aujourdhui && d <= finSemaine; });
  var aPlanifier = toutes.filter(function(l) { var i = l.mpa_artisans_interventions; return !(i && i.statut !== 'annulee'); })
    .sort(function(a, b) { return String(a.livraison_debut || '9999').localeCompare(String(b.livraison_debut || '9999')); });

  if (!duJour.length && !semaine.length && !aPlanifier.length) {
    zone.innerHTML = '<div class="etat-vide-tbl">Aucune livraison à venir.</div>';
    return;
  }

  // Une livraison est "regroupée" si une AUTRE intervention (prestation ou livraison) a lieu
  // le même jour, dans la même commune — recalculé à chaque affichage, jamais stocké.
  var { data: interventionsProches } = await sb.from('mpa_artisans_interventions')
    .select('id, commune, date_intervention').eq('artisan_id', _artisan.id).gte('date_intervention', aujourdhui).lte('date_intervention', finSemaine).neq('statut', 'annulee');

  var heureDe = function(i) { return i.heure_debut || (i.creneau === 'matin' ? 'Matin' : (i.creneau === 'apres_midi' || i.creneau === 'apres-midi') ? 'Après-midi' : '—'); };
  var titre = function(txt, n) { return '<div style="font-size:12.5px;font-weight:700;margin:14px 0 4px;color:var(--mu2);">' + txt + ' <span style="font-weight:500;color:var(--mu);">(' + n + ')</span></div>'; };
  var carte = function(l, enteteHtml) {
    var i = l.mpa_artisans_interventions;
    var note = '';
    if (i) {
      var autres = (interventionsProches || []).filter(function(x) { return x.id !== i.id && x.date_intervention === i.date_intervention && (x.commune || '').toLowerCase().trim() === (i.commune || '').toLowerCase().trim(); }).length;
      note = autres > 0
        ? '<div style="font-size:11.5px;color:#16a34a;margin-top:4px;">🧩 Regroupée — ' + autres + ' autre' + (autres > 1 ? 's' : '') + ' intervention' + (autres > 1 ? 's' : '') + ' dans ' + escHtml(i.commune || 'le même secteur') + '.</div>'
        : '<div style="font-size:11.5px;color:var(--mu);margin-top:4px;">Livraison isolée ce jour.</div>';
    }
    return '<div style="padding:12px 0;border-bottom:1px solid var(--brd);">' +
      '<div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;">' + enteteHtml +
        '<span style="font-size:12px;color:var(--mu);">' + escHtml(l.nom_article) + ' × ' + l.quantite + '</span>' +
      '</div>' +
      '<div style="font-size:13px;margin-top:2px;">' + escHtml(l.client_nom) + ' — ' + escHtml(l.adresse_livraison || '') + (l.commune_livraison ? ', ' + escHtml(l.commune_livraison) : '') + '</div>' +
      '<div style="font-size:12px;color:var(--mu);">📞 ' + escHtml(l.client_telephone || '—') + '</div>' +
      note + '</div>';
  };
  var parHeure = function(a, b) { return (a.mpa_artisans_interventions.heure_debut || '99:99').localeCompare(b.mpa_artisans_interventions.heure_debut || '99:99'); };
  duJour.sort(parHeure);
  semaine.sort(function(a, b) { return a.mpa_artisans_interventions.date_intervention.localeCompare(b.mpa_artisans_interventions.date_intervention) || parHeure(a, b); });

  zone.innerHTML =
    titre('Aujourd\'hui', duJour.length) + (duJour.length ? duJour.map(function(l) { return carte(l, '<strong>' + escHtml(heureDe(l.mpa_artisans_interventions)) + '</strong>'); }).join('') : '<div style="font-size:12.5px;color:var(--mu);">Aucune livraison prévue aujourd\'hui.</div>') +
    (semaine.length ? titre('Cette semaine', semaine.length) + semaine.map(function(l) { return carte(l, '<strong>' + escHtml(dateCourteFR(l.mpa_artisans_interventions.date_intervention)) + ' · ' + escHtml(heureDe(l.mpa_artisans_interventions)) + '</strong>'); }).join('') : '') +
    (aPlanifier.length ? titre('À planifier', aPlanifier.length) + aPlanifier.map(function(l) {
      var enRetard = l.statut !== 'prete' && l.livraison_debut && aujourdhui >= l.livraison_debut;
      var etat = l.statut === 'prete' ? '<span style="color:#0f9d78;font-weight:700;font-size:12px;">📦 Prête — à planifier</span>' : (enRetard ? '<span style="color:var(--danger);font-weight:700;font-size:12px;">⏰ À préparer (en retard)</span>' : '<span style="color:var(--mu);font-size:12px;">À préparer</span>');
      var fen = l.livraison_debut && l.livraison_fin ? 'Entre le ' + dateCourteFR(l.livraison_debut) + ' et le ' + dateCourteFR(l.livraison_fin) : 'Date à convenir';
      return carte(l, '<strong>' + escHtml(fen) + '</strong>').replace(/<\/div>$/, '<div style="margin-top:4px;">' + etat + '</div></div>');
    }).join('') : '');
}

// Règle du 07/10 : une commande de la boutique n'existe pour l'artisan qu'une fois PAYÉE. Une commande créée avec « paiement_requis »
// mais jamais payée (client qui a fermé la fenêtre, carte refusée) reste invisible : elle n'est ni listée, ni comptée dans la pastille,
// ni annoncée par MPA-AI. Les commandes d'AVANT la règle (paiement_requis faux ou absent) restent visibles, comme avant.
function commandeVisible(c) {
  return c.paiement_requis !== true || ['paye', 'partiellement_rembourse', 'rembourse'].indexOf(c.paiement_statut) !== -1;
}
async function chargerCommandes() {
  var zone = document.getElementById('zone-commandes');
  if (!zone) return;
  var { data, error } = await sb.from('commandes_catalogue').select('*').eq('artisan_id', _artisan.id).order('created_at', { ascending: false });
  if (error) { zone.innerHTML = '<p style="color:var(--danger);">Erreur : ' + escHtml(error.message) + '</p>'; return; }
  _commandesCache = (data || []).filter(commandeVisible);
  await chargerFacturesCommandes();

  // Détail des commandes panier (plusieurs articles) — chargé en une seule requête groupée.
  _lignesCommandesCache = {};
  var idsPanier = _commandesCache.filter(function(c) { return c.catalogue_id == null; }).map(function(c) { return c.id; });
  if (idsPanier.length) {
    var { data: lignes } = await sb.from('commandes_catalogue_lignes').select('commande_id, nom_article, prix_unitaire, quantite').in('commande_id', idsPanier);
    (lignes || []).forEach(function(l) {
      if (!_lignesCommandesCache[l.commande_id]) _lignesCommandesCache[l.commande_id] = [];
      _lignesCommandesCache[l.commande_id].push(l);
    });
  }

  var aujourdhui = new Date().toISOString().slice(0, 10);
  var { data: aVenir } = await sb.from('mpa_artisans_interventions')
    .select('date_intervention, creneau, commune')
    .eq('artisan_id', _artisan.id)
    .neq('statut', 'annulee')
    .gte('date_intervention', aujourdhui)
    .order('date_intervention', { ascending: true });
  _interventionsAVenirCache = aVenir || [];

  renderCommandes();

  var nouvelles = _commandesCache.filter(function(c) { return c.statut === 'nouvelle'; }).length;
  var badge = document.getElementById('cnt-commandes');
  if (badge) { badge.style.display = nouvelles ? 'inline-block' : 'none'; badge.textContent = nouvelles; }
}

function trouverInterventionProche(commune) {
  if (!commune) return null;
  var communeNorm = commune.trim().toLowerCase();
  return _interventionsAVenirCache.find(function(i) { return (i.commune || '').trim().toLowerCase() === communeNorm; }) || null;
}

function renderCommandes() {
  var zone = document.getElementById('zone-commandes');
  if (!zone) return;
  if (!_commandesCache.length) {
    zone.innerHTML = '<p style="font-size:13px;color:var(--mu);">Aucune commande pour l\'instant.</p>';
    return;
  }
  var cartes = _commandesCache.map(function(c) {
    var modeTxt = c.mode === 'livraison'
      ? '🚚 Livraison — ' + escHtml(c.adresse_livraison || '') + ' ' + escHtml(c.code_postal_livraison || '') + ' ' + escHtml(c.commune_livraison || '')
      : '🏠 Retrait sur place';
    var dateCommandeTxt = dateHeureGuadeloupe(c.created_at);
    var datePaiementTxt = (c.paiement_statut && c.paiement_statut !== 'en_attente' && c.paiement_statut !== 'echoue') ? dateHeureGuadeloupe(c.paiement_traite_le) : '';
    var fluxHtml = fluxCommandeHtml(c);

    // Règlement en ligne (uniquement si la commande a été payée par carte via CaraLink)
    var total = Number(c.montant_total) || 0, rembourse = Number(c.montant_rembourse) || 0;
    var ligneReglement = '';
    if (c.paiement_statut === 'paye') {
      ligneReglement = '<div style="font-size:12.5px;color:#0f9d78;margin-bottom:' + (c.frais_paiement_montant != null ? '2' : '8') + 'px;font-weight:600;">💳 Payée en ligne — ' + eurosFR(total) + '</div>';
      // Détail de ce que CaraLink retient (commission + frais de paiement) : seulement pour les commandes payées depuis la refacturation des frais.
      if (c.frais_paiement_montant != null && c.commission_montant != null) {
        var retenue = Number(c.commission_montant) || 0, fraisPaiement = Number(c.frais_paiement_montant) || 0, partCommission = Math.round((retenue - fraisPaiement) * 100) / 100;
        ligneReglement += '<div style="font-size:11.5px;color:var(--mu);margin-bottom:8px;">Retenue CaraLink : ' + eurosFR(retenue) + ' (frais de paiement ' + eurosFR(fraisPaiement) + (partCommission > 0.004 ? ' + commission ' + eurosFR(partCommission) : '') + ') · <strong>Vous recevez ' + eurosFR(Math.max(0, total - retenue)) + '</strong></div>';
      } else if (c.commission_montant != null) {
        // Paiement direct (depuis le 14/10) : l'argent arrive sur VOTRE compte Stripe, qui en prélève lui-même ses frais ; CaraLink ne retient que sa commission (0 sous la franchise mensuelle).
        var commissionDirecte = Number(c.commission_montant) || 0;
        ligneReglement += '<div style="font-size:11.5px;color:var(--mu);margin-bottom:8px;">Encaissé sur votre compte Stripe (frais Stripe prélevés par Stripe) · ' +
          (commissionDirecte > 0.004 ? 'Commission CaraLink : ' + eurosFR(commissionDirecte) : 'Aucune commission CaraLink') + '</div>';
      }
    } else if (c.paiement_statut === 'partiellement_rembourse') {
      ligneReglement = '<div style="font-size:12.5px;color:#b45309;margin-bottom:8px;font-weight:600;">↩️ Remboursée en partie : ' + eurosFR(rembourse) + ' sur ' + eurosFR(total) + '</div>';
    } else if (c.paiement_statut === 'rembourse') {
      ligneReglement = '<div style="font-size:12.5px;color:var(--mu2);margin-bottom:8px;font-weight:600;">↩️ Remboursée — ' + eurosFR(rembourse || total) + '</div>';
    } else if (c.paiement_statut === 'en_attente') {
      ligneReglement = '<div style="font-size:12.5px;color:var(--mu);margin-bottom:8px;">⏳ Paiement en ligne en attente</div>';
    } else if (c.paiement_statut === 'echoue') {
      ligneReglement = '<div style="font-size:12.5px;color:var(--danger);margin-bottom:8px;">⚠️ Paiement en ligne échoué</div>';
    }
    var boutonRembourser = ((c.paiement_statut === 'paye' || c.paiement_statut === 'partiellement_rembourse') && c.stripe_payment_intent_id)
      ? '<button onclick="ouvrirRemboursement(\'' + c.id + '\')" style="padding:6px 14px;border-radius:7px;border:1px solid var(--danger);background:transparent;color:var(--danger);font-size:12px;font-weight:700;cursor:pointer;margin-left:6px;">↩️ Rembourser</button>'
      : '';

    var badgeProche = '';
    if (c.mode === 'livraison' && !c.intervention_id && c.statut === 'prete') {
      var proche = trouverInterventionProche(c.commune_livraison);
      if (proche) {
        var dateProcheAff = new Date(proche.date_intervention).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
        badgeProche = '<div style="display:inline-block;padding:3px 8px;border-radius:6px;background:rgba(15,157,120,.1);color:#0f9d78;font-size:11px;font-weight:700;margin-bottom:8px;">📍 Intervention le ' + dateProcheAff + ' dans le coin — à regrouper ?</div><br>';
      }
    }

    var lignesPanier = _lignesCommandesCache[c.id];
    var enTeteCommande = (c.catalogue_id == null && lignesPanier && lignesPanier.length)
      ? '<div><strong>Commande — ' + lignesPanier.length + ' article' + (lignesPanier.length > 1 ? 's' : '') + '</strong>' +
          '<ul style="margin:4px 0 0;padding-left:18px;font-size:12.5px;color:var(--mu2);">' +
            lignesPanier.map(function(l) { return '<li>' + l.quantite + ' × ' + escHtml(l.nom_article) + ' — ' + eurosFR(l.prix_unitaire * l.quantite) + '</li>'; }).join('') +
          '</ul>' +
        '</div>'
      : '<div><strong>' + escHtml(c.nom_article) + '</strong> × ' + c.quantite + '</div>';

    return { c: c, html: '<div style="border:1px solid var(--brd);border-radius:10px;padding:14px;margin-bottom:10px;">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">' +
        enTeteCommande +
        '<span style="font-size:11px;font-weight:700;color:var(--mu2);flex-shrink:0;margin-left:10px;">' + (LABELS_STATUT_COMMANDE[c.statut] || escHtml(c.statut)) + '</span>' +
      '</div>' +
      '<div style="font-size:12px;color:var(--mu);margin-bottom:3px;">🕒 Commandée le ' + dateCommandeTxt + (datePaiementTxt && datePaiementTxt !== dateCommandeTxt ? ' · payée le ' + datePaiementTxt : '') + '</div>' +
      '<div style="font-size:12.5px;color:var(--mu2);margin-bottom:3px;">' + modeTxt + '</div>' +
      (c.mode === 'livraison' ? '<div style="font-size:12.5px;color:var(--mu2);margin-bottom:3px;">📅 ' + texteFenetreCommande(c) + '</div>' : '') +
      '<div style="font-size:12.5px;color:var(--mu2);margin-bottom:8px;">👤 ' + escHtml(c.client_nom) + ' — ' + escHtml(c.client_telephone) + '</div>' +
      (c.notes ? '<div style="font-size:12.5px;color:var(--mu2);margin-bottom:8px;font-style:italic;">« ' + escHtml(c.notes) + ' »</div>' : '') +
      ligneReglement +
      badgeProche +
      fluxHtml +
      '<div style="margin-top:8px;">' + boutonFactureCommande(c) + boutonRembourser + '</div>' +
    '</div>' };
  });

  // Rangement par mois (la liste devient longue) : le mois en cours et le dernier mois avec commandes sont ouverts, les autres repliés.
  var groupes = [], parMois = {};
  cartes.forEach(function(k) {
    var mois = new Date(new Date(k.c.created_at).getTime() - 4 * 3600 * 1000).toISOString().slice(0, 7);
    if (!parMois[mois]) { parMois[mois] = { mois: mois, cartes: [] }; groupes.push(parMois[mois]); }
    parMois[mois].cartes.push(k);
  });
  if (!_moisCommandesOuverts) {
    _moisCommandesOuverts = {};
    _moisCommandesOuverts[new Date(Date.now() - 4 * 3600 * 1000).toISOString().slice(0, 7)] = true;
    if (groupes.length) _moisCommandesOuverts[groupes[0].mois] = true;
  }
  var nouvellesTotal = _commandesCache.filter(function(c) { return c.statut === 'nouvelle'; }).length;
  zone.innerHTML = (nouvellesTotal ? '<div style="font-size:12.5px;font-weight:700;color:var(--ac);margin-bottom:10px;">🔔 ' + nouvellesTotal + ' commande' + (nouvellesTotal > 1 ? 's' : '') + ' à traiter</div>' : '') +
    groupes.map(function(g) {
      var annee = g.mois.slice(0, 4), numMois = parseInt(g.mois.slice(5, 7), 10) - 1;
      var nom = MOIS_NOMS[numMois]; nom = nom.charAt(0).toUpperCase() + nom.slice(1);
      var vendu = g.cartes.reduce(function(t, k) { var c = k.c; return t + (STATUTS_COMMANDE_REGLEE.indexOf(c.paiement_statut) !== -1 ? Math.max(0, Number(c.montant_total || 0) - Number(c.montant_rembourse || 0)) : 0); }, 0);
      var aTraiter = g.cartes.filter(function(k) { return k.c.statut === 'nouvelle'; }).length;
      return '<details ' + (_moisCommandesOuverts[g.mois] ? 'open ' : '') + 'ontoggle="basculerMoisCommandes(\'' + g.mois + '\', this.open)" style="margin-bottom:12px;">' +
        '<summary style="cursor:pointer;font-size:14px;font-weight:700;padding:8px 0;border-bottom:1px solid var(--brd);margin-bottom:10px;">' + nom + ' ' + annee +
        ' <span style="font-weight:500;font-size:12.5px;color:var(--mu);">· ' + g.cartes.length + ' commande' + (g.cartes.length > 1 ? 's' : '') + ' · ' + eurosFR(vendu) + (aTraiter ? ' · <span style="color:var(--ac);font-weight:700;">' + aTraiter + ' à traiter</span>' : '') + '</span></summary>' +
        g.cartes.map(function(k) { return k.html; }).join('') + '</details>';
    }).join('');
}
var _moisCommandesOuverts = null;
function basculerMoisCommandes(mois, ouvert) { if (!_moisCommandesOuverts) _moisCommandesOuverts = {}; _moisCommandesOuverts[mois] = !!ouvert; }

// ── Parcours d'une commande : toutes les étapes sont visibles, les futures sont grisées avec leur explication, un seul bouton principal. ──
function ajouterJoursISO(iso, n) { var d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function jourGuadeloupe() { return new Date(Date.now() - 4 * 3600 * 1000).toISOString().slice(0, 10); }
function dateCourteFR(iso) { return new Date(iso + 'T12:00:00Z').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }); }
function texteFenetreCommande(c) {
  if (c.livraison_prevue_le) return 'Livraison prévue le <strong>' + dateCourteFR(c.livraison_prevue_le) + '</strong>';
  if (c.livraison_debut && c.livraison_fin) return 'Livraison estimée entre le <strong>' + dateCourteFR(c.livraison_debut) + '</strong> et le <strong>' + dateCourteFR(c.livraison_fin) + '</strong>';
  return c.date_souhaitee ? 'Souhaitée le ' + new Date(c.date_souhaitee).toLocaleDateString('fr-FR') : 'Date de livraison à convenir';
}
function commandeReglee(c) { return STATUTS_COMMANDE_REGLEE.indexOf(c.paiement_statut) !== -1; }
function commandeEnRetard(c) { return c.mode === 'livraison' && commandeReglee(c) && c.statut !== 'prete' && c.statut !== 'terminee' && c.statut !== 'annulee' && !!c.livraison_debut && jourGuadeloupe() >= c.livraison_debut; }
function fluxCommandeHtml(c) {
  if (c.statut === 'annulee') return '';
  if (!commandeReglee(c)) return '';
  var livraison = c.mode === 'livraison';
  var prete = c.statut === 'prete' || c.statut === 'terminee', terminee = c.statut === 'terminee', planifiee = !!c.intervention_id;
  var etapes = livraison
    ? [['💳 Payée', true], ['📦 Prête', prete], ['🚚 Planifiée', planifiee || terminee], ['🏁 Terminée', terminee], ['🧾 Facturée', !!(_facturesCommandes && _facturesCommandes[c.id])]]
    : [['💳 Payée', true], ['📦 Prête', prete], ['🤝 Remise', terminee], ['🧾 Facturée', !!(_facturesCommandes && _facturesCommandes[c.id])]];
  var puces = etapes.map(function(e) {
    return '<span style="display:inline-block;padding:3px 9px;border-radius:99px;font-size:11px;font-weight:700;margin:0 4px 4px 0;' +
      (e[1] ? 'background:rgba(15,157,120,.12);color:#0f9d78;">✓ ' : 'background:var(--bg2,#f1f5f9);color:var(--mu);opacity:.75;">') + e[0] + '</span>';
  }).join('');
  var principal = '', explication = '';
  var btn = function(txt, action) { return '<button onclick="' + action + '" style="padding:8px 16px;border-radius:8px;border:none;background:var(--ac);color:#fff;font-size:12.5px;font-weight:700;cursor:pointer;">' + txt + '</button>'; };
  if (terminee) {
    explication = livraison ? 'Livrée ✓ — vous pouvez maintenant facturer.' : 'Remise au client ✓ — vous pouvez maintenant facturer.';
  } else if (!prete) {
    principal = btn('📦 Marquer comme prête', "marquerCommandePrete('" + c.id + "')");
    explication = livraison ? 'Une fois prête, vous planifiez la livraison : le client reçoit alors un email avec le jour prévu.' : 'Une fois prête, prévenez votre client qu\'il peut venir la retirer.';
    if (commandeEnRetard(c)) {
      principal = '<div style="padding:10px;border-radius:8px;background:rgba(220,38,38,.07);border:1px solid rgba(220,38,38,.25);margin-bottom:8px;font-size:12.5px;"><strong style="color:var(--danger);">⏰ Cette commande aurait dû être prête le ' + dateCourteFR(c.livraison_debut) + '.</strong> Le retard empêche de regrouper la livraison avec vos autres interventions.<div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px;">' +
        '<button onclick="marquerCommandePrete(\'' + c.id + '\')" style="padding:6px 12px;border-radius:7px;border:none;background:var(--ac);color:#fff;font-size:12px;font-weight:700;cursor:pointer;">📦 Elle est prête maintenant</button>' +
        '<button onclick="ouvrirRemboursement(\'' + c.id + '\')" style="padding:6px 12px;border-radius:7px;border:1px solid var(--danger);background:transparent;color:var(--danger);font-size:12px;font-weight:700;cursor:pointer;">↩️ Rembourser</button></div></div>';
      explication = '';
    }
  } else if (livraison && !planifiee) {
    principal = btn('🚚 Planifier la livraison', "planifierLivraisonCommande('" + c.id + "')");
    explication = 'Choisissez le jour dans la fenêtre du client : il recevra un email avec la date. Une fois la livraison terminée, la commande passe toute seule en « Terminée ».';
  } else if (livraison) {
    if (c.livraison_confirmee_le) {
      explication = '✓ Client prévenu : livraison le ' + dateCourteFR(c.livraison_prevue_le) + '. Quand l\'intervention de livraison sera terminée, cette commande passera automatiquement en « Terminée ».';
    } else {
      principal = '<button onclick="prevenirClientLivraisonMaintenant(\'' + c.id + '\')" style="padding:8px 16px;border-radius:8px;border:1px solid var(--ac);background:transparent;color:var(--ac);font-size:12.5px;font-weight:700;cursor:pointer;">✉️ Prévenir le client maintenant</button>';
      explication = '🕓 Livraison <strong>provisoire</strong> le ' + (c.livraison_prevue_le ? dateCourteFR(c.livraison_prevue_le) : '—') + ' : le client sera prévenu le ' + (c.livraison_prevue_le ? dateCourteFR(ajouterJoursISO(c.livraison_prevue_le, -2)) : '—') + ' (2 jours avant). D\'ici là vous pouvez la déplacer sans rien envoyer.';
    }
  } else {
    principal = btn('🤝 Marquer comme remise', "marquerCommandeRemise('" + c.id + "')");
    explication = 'À cliquer quand le client a récupéré sa commande.';
  }
  var aFacturer = !terminee && !(_facturesCommandes && _facturesCommandes[c.id]) ? 'La facture se débloque une fois la commande « Terminée ».' : '';
  return '<div style="margin:8px 0;">' + puces + '</div>' + principal +
    (explication ? '<div style="font-size:12px;color:var(--mu);margin:6px 0 2px;">' + explication + '</div>' : '') +
    (aFacturer ? '<div style="font-size:12px;color:var(--mu);margin:2px 0;opacity:.8;">🔒 ' + aFacturer + '</div>' : '');
}
// Email au client (prête / livraison prévue / retard) — la fonction serveur vérifie que la commande est bien à l'artisan connecté.
async function notifierClientCommande(id, type, extra) {
  try {
    var { data: { session: authSession } } = await sb.auth.getSession();
    var res = await fetch(SUPABASE_URL + '/functions/v1/notifier-commande-client', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authSession.access_token },
      body: JSON.stringify(Object.assign({ commande_id: id, type: type }, extra || {})),
    });
    var data = await res.json();
    if (data.error) return data.error === 'email_client_manquant' ? 'Ce client n\'a pas laissé d\'adresse email : prévenez-le par téléphone.' : (data.error === 'commande_non_notifiable' ? 'Cette commande ne peut pas être notifiée.' : 'L\'email n\'a pas pu partir (' + data.error + ').');
    return null;
  } catch (e) { return 'L\'email n\'a pas pu partir.'; }
}
async function marquerCommandePrete(id) {
  if (!verifierAccesEcriture()) return;
  var c = _commandesCache.find(function(x) { return x.id === id; });
  if (!c) return;
  var { error } = await sb.from('commandes_catalogue').update({ statut: 'prete', prete_le: new Date().toISOString() }).eq('id', id).eq('artisan_id', _artisan.id);
  if (error) { alert('Erreur : ' + error.message); return; }
  await chargerCommandes();
  mpaAiDire('📦 Commande de ' + escHtml(c.client_nom) + ' marquée « Prête ».' + (c.mode === 'livraison' ? ' Vous pouvez maintenant planifier la livraison.' : ' Pensez à prévenir votre client qu\'il peut venir la retirer.'), 'info');
}
async function prevenirClientLivraisonMaintenant(id) {
  var c = _commandesCache.find(function(x) { return x.id === id; });
  if (!c) return;
  if (!confirm('Envoyer dès maintenant à ' + c.client_nom + ' le mail « livraison prévue le ' + dateCourteFR(c.livraison_prevue_le) + ' » ?\n\nLa date devient ferme : la déplacer ensuite lui enverrait un nouveau mail.')) return;
  var probleme = await notifierClientCommande(id, 'livraison_prevue');
  await chargerCommandes(); await chargerLivraisons();
  mpaAiDire(probleme ? '⚠️ ' + probleme : '✉️ ' + escHtml(c.client_nom) + ' est prévenu : livraison le ' + dateCourteFR(c.livraison_prevue_le) + '.', probleme ? 'warning' : 'info');
}
async function marquerCommandeRemise(id) {
  if (!verifierAccesEcriture()) return;
  var { error } = await sb.from('commandes_catalogue').update({ statut: 'terminee' }).eq('id', id).eq('artisan_id', _artisan.id);
  if (error) { alert('Erreur : ' + error.message); return; }
  await chargerCommandes();
}
async function avancerStatutCommande(id) {
  if (!verifierAccesEcriture()) return;
  var c = _commandesCache.find(function(x) { return x.id === id; });
  if (!c || !CYCLE_STATUT_COMMANDE[c.statut]) return;
  var { error } = await sb.from('commandes_catalogue').update({ statut: CYCLE_STATUT_COMMANDE[c.statut] }).eq('id', id).eq('artisan_id', _artisan.id);
  if (error) { alert('Erreur : ' + error.message); return; }
  await chargerCommandes();
}

// ── Remboursement d'une commande payée en ligne ──
// (volontairement SANS verifierAccesEcriture : rembourser un client doit toujours rester possible,
//  même si l'essai est terminé.)
var _remboursementEnCours = null;
var _rbStockTouche = false; // vrai dès que l'artisan a lui-même coché/décoché « Remettre en stock » : on ne le change plus à sa place

// Date + heure à l'heure de la Guadeloupe (UTC-4, pas d'heure d'été), quel que soit le fuseau de l'appareil. Renvoie '—' si la date est absente ou invalide.
function dateHeureGuadeloupe(iso) {
  if (!iso) return '—';
  var d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  var opts = { timeZone: 'America/Guadeloupe' };
  return d.toLocaleDateString('fr-FR', Object.assign({ day: 'numeric', month: 'long', year: 'numeric' }, opts)) + ' à ' +
         d.toLocaleTimeString('fr-FR', Object.assign({ hour: '2-digit', minute: '2-digit' }, opts)).replace(':', 'h');
}

function eurosFR(n) {
  return (Number(n) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

function ouvrirRemboursement(id) {
  var c = _commandesCache.find(function(x) { return x.id === id; });
  if (!c) return;
  var total = Number(c.montant_total) || 0;
  var deja = Number(c.montant_rembourse) || 0;
  var restant = Math.round((total - deja) * 100) / 100;
  if (restant <= 0) { alert('Cette commande est déjà remboursée en totalité.'); return; }

  _remboursementEnCours = { id: id, total: total, restant: restant, deja: deja, commission: Number(c.commission_montant) || 0 };
  document.getElementById('rb-resume').innerHTML =
    '<strong>' + escHtml(c.nom_article) + '</strong> × ' + c.quantite + ' — ' + escHtml(c.client_nom) + '<br>' +
    'Payé : ' + eurosFR(total) + (deja ? ' · déjà remboursé : ' + eurosFR(deja) : '') +
    ' · <strong>remboursable : ' + eurosFR(restant) + '</strong>';
  var champ = document.getElementById('rb-montant');
  champ.value = restant.toFixed(2);
  champ.max = restant;
  document.getElementById('rb-motif').value = '';
  _rbStockTouche = false;
  document.getElementById('rb-stock').checked = true;
  document.getElementById('rb-err').style.display = 'none';
  var btn = document.getElementById('btn-rb-confirmer');
  btn.disabled = false; btn.textContent = 'Confirmer le remboursement';
  majApercuRemboursement();
  ouvrirModale('modal-remboursement');
}

// Un produit « indisponible / en rupture » ne revient pas en stock : tant que l'artisan n'a pas lui-même touché la case, elle suit le motif.
function motifSansRetourStock(motif) {
  return /indisponible|rupture|plus de stock|épuisé|epuise|plus en stock/i.test(motif || '');
}
function majStockSelonMotif() {
  if (_rbStockTouche) return;
  document.getElementById('rb-stock').checked = !motifSansRetourStock(document.getElementById('rb-motif').value);
}

function majApercuRemboursement() {
  var r = _remboursementEnCours;
  var info = document.getElementById('rb-info');
  if (!r || !info) return;
  var m = parseFloat(document.getElementById('rb-montant').value);
  // « Remettre en stock » : seulement pour un remboursement TOTAL d'une commande encore intacte.
  var ligneStock = document.getElementById('rb-stock-ligne');
  if (ligneStock) ligneStock.style.display = (m > 0 && r.deja === 0 && Math.abs(m - r.restant) < 0.005) ? 'flex' : 'none';
  if (!(m > 0)) { info.textContent = ''; return; }
  info.textContent = 'Le client sera remboursé de ' + eurosFR(m) + ' et en sera prévenu par email s\'il a donné son adresse. Stripe reprendra ' + eurosFR(m) +
    ' sur votre solde Stripe. Les frais de paiement de cette vente ne sont pas restitués par Stripe : ils restent à votre charge. ' +
    'Si votre solde ne suffit pas, il passe en négatif : le remboursement du client n\'est pas bloqué, mais Stripe pourra prélever la différence sur votre compte bancaire.';
}

async function confirmerRemboursement() {
  var r = _remboursementEnCours;
  if (!r) return;
  var err = document.getElementById('rb-err');
  var btn = document.getElementById('btn-rb-confirmer');
  err.style.display = 'none';

  var m = parseFloat(document.getElementById('rb-montant').value);
  if (!(m > 0)) { err.textContent = 'Indiquez un montant à rembourser.'; err.style.display = 'block'; return; }
  if (m > r.restant + 0.001) { err.textContent = 'Le montant dépasse ce qui reste remboursable (' + eurosFR(r.restant) + ').'; err.style.display = 'block'; return; }
  if (!confirm('Confirmer le remboursement de ' + eurosFR(m) + ' au client ?\n\nCette action est définitive.')) return;

  btn.disabled = true; btn.textContent = 'Remboursement en cours…';
  try {
    var { data: { session: authSession } } = await sb.auth.getSession();
    var res = await fetch(SUPABASE_URL + '/functions/v1/rembourser-commande', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authSession.access_token },
      body: JSON.stringify({ commande_id: r.id, montant: m, motif: document.getElementById('rb-motif').value.trim(),
        remettre_en_stock: r.deja === 0 && Math.abs(m - r.restant) < 0.005 && document.getElementById('rb-stock').checked }),
    });
    var data = await res.json();
    if (data.error) throw new Error(data.error);
    fermerModale('modal-remboursement');
    _remboursementEnCours = null;
    await chargerCommandes();
    if (data.remis_en_stock) await chargerCatalogue(); // le stock affiché doit refléter la remise en stock
    alert((data.en_attente
      ? '⏳ Remboursement de ' + eurosFR(data.montant_rembourse) + ' enregistré, mais Stripe le met en attente : votre solde Stripe ne le couvre pas encore. Il partira dès que le solde le permet (vous pouvez aussi alimenter votre solde depuis votre espace Stripe).'
      : '✅ Remboursement de ' + eurosFR(data.montant_rembourse) + ' effectué. Le client le verra sous quelques jours ouvrés, selon sa banque.') + (data.remis_en_stock ? '\nLes articles ont été remis en stock.' : ''));
  } catch (e) {
    err.textContent = e.message;
    err.style.display = 'block';
    btn.disabled = false; btn.textContent = 'Confirmer le remboursement';
  }
}

// ── Carte enregistrée pour la commission prestations (SetupIntent Stripe) ──
var _stripeClientMpa = null;
var _stripeElementsCarte = null;

// État de la commission prestations de l'artisan connecté (carte, CA « annuaire » du mois, commission impayée) — calculé côté base.
// Si la fonction SQL n'existe pas encore, l'écran se comporte comme avant (aucune alerte, aucun blocage affiché).
var _etatCommission = null;
var SEUIL_ALERTE_CARTE_EUROS = 150; // on prévient l'artisan avant qu'il atteigne le seuil gratuit de 200 €
async function chargerEtatCommission() {
  try {
    var { data, error } = await sb.rpc('etat_commission_prestations');
    if (error) throw error;
    _etatCommission = data || null;
  } catch (e) { console.warn('etat_commission_prestations :', e && e.message); _etatCommission = null; }
  return _etatCommission;
}

function renderEncartCartePrestations() {
  var zone = document.getElementById('encart-carte-prestations');
  if (!zone) return;
  var etat = _etatCommission;
  var aCarte = !!_artisan.carte_prestations_enregistree;
  var impaye = etat ? Number(etat.commission_impayee || 0) : 0;
  var caMois = etat ? Number(etat.ca_mois || 0) : 0;
  var seuil = etat ? Number(etat.seuil || 200) : 200;
  var bouton = function(texte, couleur) {
    return '<button onclick="ouvrirCartePrestations()" style="flex-shrink:0;padding:9px 16px;border-radius:8px;border:none;background:' + couleur + ';color:#fff;font-size:12.5px;font-weight:700;cursor:pointer;white-space:nowrap;">' + texte + '</button>';
  };
  var boite = function(fond, bord, contenu, bout) {
    return '<div style="background:' + fond + ';border:1px solid ' + bord + ';border-radius:14px;padding:14px 20px;display:flex;align-items:center;gap:16px;flex-wrap:wrap;">' +
      '<div style="flex:1;min-width:220px;font-size:12.5px;color:var(--mu2);">' + contenu + '</div>' + bout + '</div>';
  };
  if (impaye > 0) {
    zone.innerHTML = boite('rgba(220,38,38,.07)', 'rgba(220,38,38,.4)',
      '⚠️ <strong>Commission impayée : ' + eurosMPA(impaye) + '.</strong> Le prélèvement n\'a pas pu être fait. Tant qu\'elle n\'est pas réglée, vous ne pouvez plus planifier de nouvelle intervention venue de CaraLink. Enregistrez une carte valide : elle sera débitée aussitôt.',
      bouton('Enregistrer une carte →', '#dc2626'));
  } else if (aCarte) {
    zone.innerHTML =
      '<div style="background:rgba(15,157,120,.06);border:1px solid rgba(15,157,120,.3);border-radius:14px;padding:12px 20px;font-size:12.5px;color:#0f9d78;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">' +
        '<span>✅ Carte enregistrée pour la commission prestations.</span>' +
        '<button onclick="ouvrirCartePrestations()" style="padding:6px 12px;border-radius:7px;border:1px solid rgba(15,157,120,.4);background:transparent;color:#0f9d78;font-size:12px;font-weight:700;cursor:pointer;">Remplacer</button>' +
      '</div>';
  } else if (etat && caMois >= seuil) {
    zone.innerHTML = boite('rgba(220,38,38,.07)', 'rgba(220,38,38,.4)',
      '⚠️ <strong>Vous avez dépassé ' + seuil + ' € ce mois-ci</strong> avec vos clients venus de CaraLink. Pour pouvoir en planifier de nouveaux, enregistrez une carte. Elle est débitée une fois par mois, seulement sur la part au-dessus de ' + seuil + ' €.',
      bouton('Enregistrer une carte →', '#dc2626'));
  } else if (etat && caMois >= SEUIL_ALERTE_CARTE_EUROS) {
    zone.innerHTML = boite('rgba(245,158,11,.08)', 'rgba(245,158,11,.4)',
      '🔔 <strong>Vous approchez du seuil gratuit</strong> (' + eurosMPA(caMois) + ' sur ' + seuil + ' € ce mois-ci). Enregistrez une carte dès maintenant pour ne pas être bloqué : elle ne sera débitée que si vous dépassez ' + seuil + ' €.',
      bouton('Enregistrer une carte →', '#f59e0b'));
  } else {
    zone.innerHTML = boite('rgba(59,130,246,.06)', 'rgba(59,130,246,.3)',
      '💳 Aucune carte enregistrée — nécessaire uniquement si vous dépassez le seuil gratuit de 200 €/mois sur vos clients CaraLink.',
      bouton('Enregistrer une carte →', '#3b82f6'));
  }
}

async function ouvrirCartePrestations() {
  document.getElementById('cp-err').style.display = 'none';
  document.getElementById('cp-element').innerHTML = 'Chargement…';
  ouvrirModale('modal-carte-prestations');
  try {
    var { data: { session: authSession } } = await sb.auth.getSession();
    var res = await fetch(SUPABASE_URL + '/functions/v1/enregistrer-carte-prestations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authSession.access_token },
    });
    var data = await res.json();
    if (data.error) throw new Error(data.error);

    if (!_stripeClientMpa) _stripeClientMpa = Stripe(STRIPE_PUBLIC_KEY_MPA);
    _stripeElementsCarte = _stripeClientMpa.elements({ clientSecret: data.client_secret });
    document.getElementById('cp-element').innerHTML = '';
    var paymentElement = _stripeElementsCarte.create('payment');
    paymentElement.mount('#cp-element');
  } catch (e) {
    document.getElementById('cp-element').innerHTML = '';
    document.getElementById('cp-err').textContent = e.message;
    document.getElementById('cp-err').style.display = 'block';
  }
}

async function confirmerCartePrestations() {
  var btn = document.getElementById('btn-cp-confirmer');
  var err = document.getElementById('cp-err');
  err.style.display = 'none';
  if (!_stripeClientMpa || !_stripeElementsCarte) return;
  btn.disabled = true; btn.textContent = 'Enregistrement…';
  try {
    var { error, setupIntent } = await _stripeClientMpa.confirmSetup({
      elements: _stripeElementsCarte,
      redirect: 'if_required',
    });
    if (error) throw new Error(error.message);
    // Le webhook (setup_intent.succeeded) confirme côté serveur ; on ne fait ici qu'un
    // rafraîchissement optimiste de l'écran, la vraie source de vérité reste le serveur.
    _artisan.carte_prestations_enregistree = true;
    if (_etatCommission) { _etatCommission.carte = true; _etatCommission.bloque_seuil = false; }
    fermerModale('modal-carte-prestations');
    renderEncartCartePrestations();
    // Le serveur confirme la carte (et relance une éventuelle commission échouée) en quelques secondes : on relit l'état juste après.
    setTimeout(async function() { await chargerEtatCommission(); renderEncartCartePrestations(); }, 5000);
    alert('✅ Carte enregistrée. Elle ne sera débitée que si vos prestations trouvées via CaraLink dépassent 200 € dans un mois' + (_etatCommission && _etatCommission.commission_impayee > 0 ? ', et la commission restée impayée va être prélevée dans quelques instants.' : '.'));
  } catch (e) {
    err.textContent = e.message;
    err.style.display = 'block';
  } finally {
    btn.disabled = false; btn.textContent = 'Enregistrer cette carte';
  }
}

// ── Planifier la livraison d'une commande : fenêtre dédiée (l'intervention est créée en coulisses, l'artisan ne voit que ce qui compte). ──
// Analyse chaque jour de la fenêtre promise au client : indisponible, non travaillé, déjà chargé, ou « déjà dans le secteur » (regroupement).
async function analyserJoursLivraison(c, sansInterventionId) {
  var aujourdhui = jourGuadeloupe();
  var debut = c.livraison_debut || c.date_souhaitee || aujourdhui;
  var fin = c.livraison_fin || ajouterJoursISO(debut, 6);
  var horsFenetre = false;
  if (debut < aujourdhui) debut = aujourdhui;
  if (fin < debut) { fin = ajouterJoursISO(debut, 6); horsFenetre = true; } // fenêtre entièrement passée : on propose la semaine à venir
  var [rI, rX] = await Promise.all([
    sb.from('mpa_artisans_interventions').select('id, date_intervention, commune, statut').eq('artisan_id', _artisan.id).gte('date_intervention', debut).lte('date_intervention', fin).neq('statut', 'annulee'),
    sb.from('artisans_indisponibilites').select('date_debut, date_fin').eq('artisan_id', _artisan.id).lte('date_debut', fin).gte('date_fin', debut),
  ]);
  var interv = (rI.data || []).filter(function(i) { return i.id !== sansInterventionId; }), indis = rX.data || [];
  var communeNorm = (c.commune_livraison || '').trim().toLowerCase();
  var jours = [];
  for (var d = debut; d <= fin; d = ajouterJoursISO(d, 1)) {
    var jourSem = new Date(d + 'T12:00:00Z').getUTCDay();
    var duJour = interv.filter(function(i) { return i.date_intervention === d; });
    var memeCommune = duJour.filter(function(i) { return communeNorm && (i.commune || '').trim().toLowerCase() === communeNorm; }).length;
    var bloque = indis.some(function(x) { return x.date_debut <= d && x.date_fin >= d; });
    var nonTravaille = !bloque && (_horairesCache || []).length > 0 && !(_horairesCache || []).some(function(h) { return h.jour_semaine === jourSem; });
    jours.push({ date: d, nb: duJour.length, memeCommune: memeCommune, bloque: bloque, nonTravaille: nonTravaille, dispo: !bloque && !nonTravaille });
  }
  var candidats = jours.filter(function(x) { return x.dispo; });
  var meilleur = null;
  candidats.forEach(function(x) {
    var score = x.memeCommune * 10 - x.nb;
    if (!meilleur || score > meilleur._score) { x._score = score; meilleur = x; }
  });
  return { jours: jours, meilleur: meilleur, debut: debut, fin: fin, horsFenetre: horsFenetre };
}
function resumeJourLivraison(x, commune) {
  if (x.bloque) return '⛔ Indisponible';
  if (x.nonTravaille) return '💤 Jour non travaillé';
  if (x.memeCommune) return '🧩 Vous êtes déjà à ' + escHtml(commune || 'proximité') + ' (' + x.memeCommune + ' intervention' + (x.memeCommune > 1 ? 's' : '') + ')';
  if (x.nb) return x.nb + ' intervention' + (x.nb > 1 ? 's' : '') + ' ce jour-là';
  return 'Libre';
}

var _planifLivraison = null; // { commandeId, jours, meilleur }
async function planifierLivraisonCommande(commandeId) {
  if (!verifierAccesEcriture()) return;
  var c = _commandesCache.find(function(x) { return x.id === commandeId; });
  if (!c) return;
  var analyse = await analyserJoursLivraison(c);
  _planifLivraison = { commandeId: commandeId, analyse: analyse, jourChoisi: analyse.meilleur ? analyse.meilleur.date : null };

  var modale = document.getElementById('modal-planif-livraison');
  if (!modale) {
    modale = document.createElement('div');
    modale.className = 'modal-overlay'; modale.id = 'modal-planif-livraison';
    modale.innerHTML = '<div class="modal-box"><div id="pl-contenu"></div></div>';
    document.body.appendChild(modale);
  }
  var lignes = _lignesCommandesCache[c.id];
  var articles = (c.catalogue_id == null && lignes && lignes.length) ? lignes.map(function(l) { return l.quantite + ' × ' + escHtml(l.nom_article); }).join(', ') : (c.quantite + ' × ' + escHtml(c.nom_article));
  var boutonsJours = analyse.jours.map(function(x) {
    var choisi = x.date === _planifLivraison.jourChoisi;
    return '<label style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:8px;border:1px solid ' + (choisi ? 'var(--ac)' : 'var(--brd)') + ';margin-bottom:6px;' + (x.dispo ? 'cursor:pointer;' : 'opacity:.45;cursor:not-allowed;') + '">' +
      '<input type="radio" name="pl-jour" value="' + x.date + '"' + (x.dispo ? '' : ' disabled') + (choisi ? ' checked' : '') + ' onchange="_planifLivraison.jourChoisi=this.value;majChoixJourLivraison()">' +
      '<span style="flex:1;"><strong>' + dateCourteFR(x.date) + '</strong><br><span style="font-size:12px;color:' + (x.memeCommune ? '#16a34a' : 'var(--mu)') + ';">' + resumeJourLivraison(x, c.commune_livraison) + '</span></span>' +
      (analyse.meilleur && analyse.meilleur.date === x.date ? '<span style="font-size:11px;font-weight:700;color:var(--ac);">⭐ Proposé par MPA-AI</span>' : '') +
    '</label>';
  }).join('');
  document.getElementById('pl-contenu').innerHTML =
    '<h3>🚚 Planifier la livraison</h3>' +
    '<div style="font-size:13px;line-height:1.55;margin-bottom:10px;"><strong>' + escHtml(c.client_nom) + '</strong> — ' + articles + '<br>📍 ' + escHtml(c.adresse_livraison || '') + ' ' + escHtml(c.code_postal_livraison || '') + ' ' + escHtml(c.commune_livraison || '') + '<br>' +
      '<span style="color:var(--mu);">Frais de livraison déjà payés : ' + eurosFR(c.frais_livraison || 0) + '</span></div>' +
    '<div style="font-size:12.5px;margin-bottom:10px;padding:8px 10px;border-radius:8px;background:rgba(181,80,47,.08);">📅 ' + (c.livraison_debut ? 'Fenêtre annoncée au client : du <strong>' + dateCourteFR(c.livraison_debut) + '</strong> au <strong>' + dateCourteFR(c.livraison_fin) + '</strong>.' : 'Aucune fenêtre annoncée (ancienne commande).') + (analyse.horsFenetre ? '<br>⚠️ Cette fenêtre est dépassée : le client sera prévenu du nouveau jour.' : '') + '</div>' +
    '<div style="font-size:12.5px;font-weight:700;margin-bottom:6px;">Choisissez le jour</div>' + boutonsJours +
    '<div class="modal-row" style="display:flex;gap:10px;margin-top:10px;">' +
      '<div class="modal-field" style="flex:1;"><label>Créneau</label><select id="pl-creneau" style="width:100%;padding:9px 12px;border-radius:8px;border:1px solid var(--b2);font-size:13px;"><option value="matin">Matin</option><option value="apres_midi">Après-midi</option></select></div>' +
      '<div class="modal-field" style="flex:1;"><label>Heure (facultatif)</label><input id="pl-heure" type="time"/></div>' +
    '</div>' +
    '<div id="pl-note" style="font-size:12px;color:var(--mu);margin:4px 0 10px;">' + (c.client_email ? '✉️ Le jour reste provisoire : votre client en est prévenu par email 2 jours avant (tout de suite si c\'est dans moins de 2 jours). D\'ici là, vous pouvez le déplacer sans rien envoyer.' : '⚠️ Ce client n\'a pas d\'adresse email : prévenez-le directement.') + '</div>' +
    '<div class="modal-actions"><button id="pl-valider" class="btn-primary" onclick="confirmerPlanificationLivraison()"' + (_planifLivraison.jourChoisi ? '' : ' disabled') + '>Valider ce jour</button>' +
    '<button class="btn-secondary" onclick="fermerModale(\'modal-planif-livraison\')">Retour</button></div>';
  ouvrirModale('modal-planif-livraison');
}
function majChoixJourLivraison() {
  document.querySelectorAll('#pl-contenu label').forEach(function(l) { var r = l.querySelector('input[type=radio]'); if (r) l.style.borderColor = r.checked ? 'var(--ac)' : 'var(--brd)'; });
  var b = document.getElementById('pl-valider'); if (b) b.disabled = !_planifLivraison.jourChoisi;
}
// Crée l'intervention de livraison en coulisses, lie la commande, prévient le client (un seul email : « livraison prévue le … »).
async function creerLivraisonCommande(commandeId, date, creneau, heure) {
  var c = _commandesCache.find(function(x) { return x.id === commandeId; });
  if (!c) return { erreur: 'Commande introuvable.' };
  // Fiche client : on réutilise celle qui existe déjà (même email ou même nom) — jamais de doublon.
  var nomNorm = normaliserNomClient(c.client_nom);
  var client = (_clientsCache || []).find(function(x) {
    return (c.client_email && x.email && x.email.toLowerCase() === String(c.client_email).toLowerCase()) || normaliserNomClient(x.nom) === nomNorm;
  });
  if (!client) {
    var { data: nouveau, error: errClient } = await sb.from('mpa_artisans_clients').insert({
      artisan_id: _artisan.id, nom: c.client_nom, telephone: c.client_telephone, email: c.client_email || null,
      adresse: c.adresse_livraison, code_postal: c.code_postal_livraison, commune: c.commune_livraison,
    }).select().single();
    if (errClient) return { erreur: 'Création du client : ' + errClient.message };
    client = nouveau; chargerClients();
  }
  var ligne = {
    artisan_id: _artisan.id, date_intervention: date, creneau: creneau, heure_debut: heure || null, heure_fin: null,
    client_id: client.id, adresse: c.adresse_livraison, code_postal: c.code_postal_livraison, commune: c.commune_livraison, service_id: null,
    prix: Number(c.frais_livraison) || 0, // les frais de livraison, déjà payés avec la commande
    notes: 'Livraison — ' + c.nom_article + ' × ' + c.quantite + (c.notes ? ' — ' + c.notes : ''),
    statut: 'planifiee', date_paiement: null,
  };
  var pt = c.adresse_livraison ? await geocoderAdresse(c.adresse_livraison, c.code_postal_livraison, c.commune_livraison) : null;
  if (pt) { ligne.latitude = pt.lat; ligne.longitude = pt.lon; }
  var res = await sb.from('mpa_artisans_interventions').insert(ligne).select().single();
  if (res.error) return { erreur: res.error.message };
  var { error: errLien } = await sb.from('commandes_catalogue').update({ intervention_id: res.data.id, livraison_prevue_le: date }).eq('id', commandeId).eq('artisan_id', _artisan.id);
  if (errLien) return { erreur: 'Liaison avec la commande : ' + errLien.message };
  // Livraison PROVISOIRE : le client n'est prévenu qu'à J-2 (par MPA-AI ou, à défaut, par le serveur) pour que l'artisan puisse encore optimiser.
  // Si le jour choisi est dans moins de 2 jours, plus de temps à perdre : le mail part tout de suite.
  var immediat = date <= ajouterJoursISO(jourGuadeloupe(), 2);
  var probleme = immediat ? await notifierClientCommande(commandeId, 'livraison_prevue') : null;
  await chargerCommandes(); await chargerLivraisons(); chargerInterventions();
  return { ok: true, probleme: probleme, immediat: immediat };
}
async function confirmerPlanificationLivraison() {
  if (!_planifLivraison || !_planifLivraison.jourChoisi) return;
  var btn = document.getElementById('pl-valider'); btn.disabled = true; btn.textContent = 'Enregistrement…';
  var r = await creerLivraisonCommande(_planifLivraison.commandeId, _planifLivraison.jourChoisi, document.getElementById('pl-creneau').value, document.getElementById('pl-heure').value);
  if (r.erreur) {
    btn.disabled = false; btn.textContent = 'Valider ce jour';
    if (String(r.erreur).indexOf('COMMISSION_CARTE_REQUISE') >= 0) {
      if (confirm('Pour planifier une nouvelle intervention venue de CaraLink, il faut d\'abord enregistrer une carte bancaire (ou régler la commission restée impayée).\n\nElle n\'est débitée qu\'au-delà du seuil gratuit. Ouvrir l\'enregistrement de la carte ?')) { fermerModale('modal-planif-livraison'); ouvrirCartePrestations(); }
      return;
    }
    alert('Erreur : ' + r.erreur); return;
  }
  fermerModale('modal-planif-livraison');
  mpaAiDire(messageLivraisonPlanifiee(_planifLivraison.jourChoisi, r), r.probleme ? 'warning' : 'info');
}
function messageLivraisonPlanifiee(date, r) {
  if (r.immediat) return r.probleme ? '🚚 Livraison planifiée le ' + dateCourteFR(date) + ', mais ' + r.probleme : '🚚 Livraison planifiée le ' + dateCourteFR(date) + ' : c\'est dans moins de 2 jours, j\'ai donc prévenu votre client par email tout de suite.';
  return '🚚 Livraison planifiée le ' + dateCourteFR(date) + ' (provisoire). Votre client sera prévenu par email le ' + dateCourteFR(ajouterJoursISO(date, -2)) + ' (2 jours avant). D\'ici là, je surveille s\'il y a un meilleur jour.';
}
// Déplace en silence une livraison provisoire (le client n'a encore reçu aucune date).
async function deplacerLivraisonProvisoire(commandeId, date) {
  if (!verifierAccesEcriture()) return;
  var c = _commandesCache.find(function(x) { return x.id === commandeId; });
  if (!c || !c.intervention_id || c.livraison_confirmee_le) return;
  var ancienne = c.livraison_prevue_le;
  var { error } = await sb.from('mpa_artisans_interventions').update({ date_intervention: date }).eq('id', c.intervention_id).eq('artisan_id', _artisan.id);
  if (error) { alert('Erreur : ' + error.message); return; }
  await prevenirClientDeplacement(c.intervention_id, ancienne);
  chargerInterventions();
}
// Un clic depuis MPA-AI : valide le jour qu'elle propose (créneau du matin, modifiable ensuite dans le planning).
async function validerJourProposeLivraison(commandeId, date) {
  if (!verifierAccesEcriture()) return;
  var r = await creerLivraisonCommande(commandeId, date, 'matin', null);
  if (r.erreur) { alert('Erreur : ' + r.erreur); return; }
  mpaAiDire(messageLivraisonPlanifiee(date, r), r.probleme ? 'warning' : 'info');
}

function appliquerRegroupementLivraison(date, creneau) {
  var champDate = document.getElementById('mi-date');
  var champCreneau = document.getElementById('mi-creneau');
  if (!champDate || !champCreneau) return; // la fenêtre a pu être fermée entre-temps
  champDate.value = date;
  champCreneau.value = creneau;
  calculerCreneaux();
}

// ════════════════════════════════════════
//  ITINÉRAIRE DU JOUR — trajet visuel, réutilise le calcul de Smart Dispatch
// ════════════════════════════════════════

var _itinDateChoisie = null;
var _itinInterventionsSemaine = [];
var _itinMap = null;

async function renderItineraireWidget() {
  var aujourdhui = new Date();
  var fin = new Date(aujourdhui); fin.setDate(fin.getDate() + 6);
  var debutStr = aujourdhui.toISOString().slice(0, 10);
  var finStr = fin.toISOString().slice(0, 10);

  var { data, error } = await sb.from('mpa_artisans_interventions')
    .select('id, date_intervention, heure_debut, commune, latitude, longitude, mpa_artisans_clients(nom, email)')
    .eq('artisan_id', _artisan.id)
    .neq('statut', 'annulee')
    .gte('date_intervention', debutStr)
    .lte('date_intervention', finStr)
    .order('heure_debut', { ascending: true });
  if (error) { console.error('renderItineraireWidget:', error); return; }
  _itinInterventionsSemaine = data || [];

  var jours = document.getElementById('itin-jours');
  var html = '';
  for (var i = 0; i < 7; i++) {
    var d = new Date(aujourdhui); d.setDate(d.getDate() + i);
    var dStr = d.toISOString().slice(0, 10);
    var label = i === 0 ? 'Aujourd\'hui' : JOURS_NOMS[d.getDay() === 0 ? 6 : d.getDay() - 1] + ' ' + d.getDate();
    var actif = (dStr === (_itinDateChoisie || debutStr));
    html += '<button onclick="choisirJourItineraire(\'' + dStr + '\')" style="flex-shrink:0;padding:7px 12px;border-radius:8px;border:1px solid ' + (actif ? 'var(--ac)' : 'var(--brd)') + ';background:' + (actif ? 'var(--ac)' : 'transparent') + ';color:' + (actif ? '#fff' : 'var(--tx)') + ';font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;">' + label + '</button>';
  }
  jours.innerHTML = html;

  await choisirJourItineraire(_itinDateChoisie || debutStr);
  renderRappelCloture('encart-rappel-cloture-journee');
}

// Point de départ de la journée : l'adresse pro de l'artisan (géocodée à l'enregistrement de sa fiche).
function baseArtisanCoords() {
  if (_artisan && _artisan.latitude != null && _artisan.longitude != null) {
    return { latitude: _artisan.latitude, longitude: _artisan.longitude };
  }
  return null;
}

async function choisirJourItineraire(dateStr) {
  _itinDateChoisie = dateStr;
  var jours = document.getElementById('itin-jours');
  if (jours) {
    Array.prototype.forEach.call(jours.children, function(btn, idx) {
      var d = new Date(); d.setDate(d.getDate() + idx);
      var actif = d.toISOString().slice(0, 10) === dateStr;
      btn.style.borderColor = actif ? 'var(--ac)' : 'var(--brd)';
      btn.style.background = actif ? 'var(--ac)' : 'transparent';
      btn.style.color = actif ? '#fff' : 'var(--tx)';
    });
  }

  var duJour = _itinInterventionsSemaine.filter(function(i) { return i.date_intervention === dateStr; });
  var liste = document.getElementById('itin-liste');

  if (!duJour.length) {
    liste.innerHTML = '<p style="font-size:12.5px;color:var(--mu);">Aucune intervention ce jour-là.</p>';
    if (_itinMap) { _itinMap.remove(); _itinMap = null; }
    document.getElementById('itin-carte').innerHTML = '';
    return;
  }

  liste.innerHTML = '<p style="font-size:12px;color:var(--mu);">Calcul des trajets…</p>';
  var morceaux = [];
  var base = baseArtisanCoords();
  if (base) {
    var premier = duJour[0];
    var minDepart = await tempsTrajetMinutes(base.latitude, base.longitude, premier.latitude, premier.longitude);
    morceaux.push('<div style="display:flex;gap:10px;align-items:center;padding:6px 0;font-size:13px;">' +
      '<strong style="width:48px;flex-shrink:0;">🏠</strong>' +
      '<span>Départ <span style="color:var(--mu);">(chez vous)</span></span>' +
    '</div>');
    morceaux.push('<div style="padding:4px 0 4px 58px;font-size:11.5px;color:var(--mu);">' +
      (minDepart != null ? '🚗 ' + minDepart + ' min de trajet' : '🚗 trajet non calculé (adresse manquante)') +
    '</div>');
  }
  var estAujourdhui = dateStr === new Date().toISOString().slice(0, 10);
  for (var k = 0; k < duJour.length; k++) {
    var i = duJour[k];
    var nomClient = i.mpa_artisans_clients ? i.mpa_artisans_clients.nom : '—';
    // Bouton "Retard" discret — uniquement sur la journée en cours, jamais sur un jour futur
    // affiché en avance (prévenir d'un retard n'a de sens que pour aujourd'hui).
    var boutonRetard = (estAujourdhui && estPro())
      ? '<button onclick="signalerRetard(\'' + i.id + '\')" title="Prévenir le client d\'un retard" style="margin-left:auto;flex-shrink:0;background:#fff7ed;border:1.5px solid #f59e0b;color:#b45309;font-size:13px;font-weight:700;cursor:pointer;padding:7px 12px;border-radius:8px;">⏰ Je suis en retard</button>'
      : '';
    morceaux.push('<div style="display:flex;gap:10px;align-items:center;padding:6px 0;font-size:13px;">' +
      '<strong style="width:48px;flex-shrink:0;">' + (i.heure_debut || '—') + '</strong>' +
      '<span>' + escHtml(i.commune || '—') + ' <span style="color:var(--mu);">(' + escHtml(nomClient) + ')</span></span>' +
      boutonRetard +
    '</div>');

    if (k < duJour.length - 1) {
      var suivant = duJour[k + 1];
      var minutes = await tempsTrajetMinutes(i.latitude, i.longitude, suivant.latitude, suivant.longitude);
      morceaux.push('<div style="padding:4px 0 4px 58px;font-size:11.5px;color:var(--mu);">' +
        (minutes != null ? '🚗 ' + minutes + ' min de trajet' : '🚗 trajet non calculé (adresse manquante)') +
      '</div>');
    }
  }
  if (!base) {
    morceaux.push('<p style="font-size:11.5px;color:var(--mu);margin-top:8px;">💡 Renseignez votre adresse dans Mon profil → Ma fiche artisan pour voir aussi le trajet depuis chez vous.</p>');
  }
  liste.innerHTML = morceaux.join('');

  await dessinerCarteItineraire(duJour);
}

async function dessinerCarteItineraire(interventions) {
  var conteneur = document.getElementById('itin-carte');
  var avecCoords = interventions.filter(function(i) { return i.latitude != null && i.longitude != null; });

  if (!avecCoords.length) {
    conteneur.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:12px;color:var(--mu);padding:10px;text-align:center;">Aucune adresse géolocalisée pour ce jour — ajoutez une adresse aux interventions pour voir le trajet.</div>';
    if (_itinMap) { _itinMap.remove(); _itinMap = null; }
    return;
  }

  conteneur.innerHTML = '';
  if (_itinMap) { _itinMap.remove(); _itinMap = null; }
  _itinMap = L.map('itin-carte', { zoomControl: false, attributionControl: false });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(_itinMap);

  // Étapes du tracé : départ (chez l'artisan, s'il a renseigné son adresse) puis chaque intervention.
  var base = baseArtisanCoords();
  var etapes = base ? [base].concat(avecCoords) : avecCoords;

  var points = etapes.map(function(e) { return [e.latitude, e.longitude]; });
  if (base) {
    L.marker([base.latitude, base.longitude], {
      icon: L.divIcon({ className: '', html: '<div style="width:30px;height:30px;border-radius:50%;background:#fff;border:2px solid #B5502F;display:flex;align-items:center;justify-content:center;font-size:16px;box-shadow:0 2px 6px rgba(0,0,0,.25);">🏠</div>', iconSize: [30, 30], iconAnchor: [15, 15] }),
    }).addTo(_itinMap).bindTooltip('Départ — chez vous', { permanent: false });
  }
  avecCoords.forEach(function(i, idx) {
    L.marker([i.latitude, i.longitude]).addTo(_itinMap)
      .bindTooltip((idx + 1) + '. ' + (i.heure_debut || '') + ' — ' + (i.commune || ''), { permanent: false });
  });
  _itinMap.fitBounds(points, { padding: [24, 24], maxZoom: 15 });

  // Trace le trajet réel (service IGN, même moteur que Smart Dispatch) entre chaque étape consécutive, départ compris.
  for (var j = 0; j < etapes.length - 1; j++) {
    var a = etapes[j], b = etapes[j + 1];
    try {
      var url = 'https://data.geopf.fr/navigation/itineraire?resource=bdtopo-osrm&profile=car&optimization=fastest&geometryFormat=geojson&distanceUnit=meter&timeUnit=second&start=' + a.longitude + ',' + a.latitude + '&end=' + b.longitude + ',' + b.latitude;
      var res = await fetch(url);
      var data = await res.json();
      if (data.geometry && data.geometry.coordinates) {
        var coordsLatLng = data.geometry.coordinates.map(function(c) { return [c[1], c[0]]; });
        var ligne = L.polyline(coordsLatLng, { color: '#B5502F', weight: 4, opacity: 0.85 }).addTo(_itinMap);
        var minutes = Math.ceil(data.duration / 60);
        var km = Math.round(data.distance / 100) / 10;
        var milieu = coordsLatLng[Math.floor(coordsLatLng.length / 2)];
        L.marker(milieu, {
          icon: L.divIcon({ className: '', html: '<div style="background:#fff;border:1px solid var(--brd,#e3eaf4);border-radius:7px;padding:2px 7px;font-size:11px;font-weight:700;color:#B5502F;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,.15);">' + minutes + ' min · ' + km + ' km</div>', iconSize: null }),
        }).addTo(_itinMap);
      }
    } catch (e) { console.warn('Tracé itinéraire échoué :', e); }
  }
}

// ── Mes fournitures — stock interne, optionnellement relié à un produit vendu. Chaque variation
// passe par un mouvement enregistré (achat/utilisation/correction), jamais un chiffre écrasé en
// silence : on peut toujours comprendre a posteriori pourquoi le stock a bougé.
var _fournituresCache = [];
var _fournitureEnCours = null;

async function chargerFournitures() {
  var { data, error } = await sb.from('artisans_fournitures')
    .select('*')
    .eq('artisan_id', _artisan.id)
    .order('nom', { ascending: true });
  if (error) { document.getElementById('zone-fournitures').innerHTML = '<p style="color:var(--danger);">Erreur : ' + escHtml(error.message) + '</p>'; return; }
  _fournituresCache = data || [];
  renderFournitures();
}

function renderFournituresListe() {
  var zone = document.getElementById('zone-fournitures');
  if (!_fournituresCache.length) {
    zone.innerHTML = '<div class="etat-vide-tbl">Aucune fourniture pour l\'instant.</div>';
    return;
  }

  zone.innerHTML = '<div style="display:flex;flex-direction:column;gap:10px;">' + _fournituresCache.map(function(f) {
    var stockBas = f.seuil_alerte != null && f.quantite <= f.seuil_alerte;
    return '<div style="border:1px solid ' + (stockBas ? '#fca5a5' : 'var(--brd)') + ';border-radius:10px;padding:12px 14px;' + (stockBas ? 'background:rgba(220,38,38,.04);' : '') + '">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">' +
        '<div>' +
          '<strong style="font-size:13.5px;">' + escHtml(f.nom) + '</strong><br>' +
          '<span style="font-size:13px;color:' + (stockBas ? 'var(--danger)' : 'var(--mu2)') + ';font-weight:' + (stockBas ? '700' : '400') + ';">' + (stockBas ? '⚠️ ' : '') + f.quantite + ' ' + escHtml(f.unite) + '</span>' +
        '</div>' +
        '<div style="display:flex;gap:4px;flex-shrink:0;">' +
          '<button onclick="genererQRFourniture(\'' + f.id + '\')" title="QR code à imprimer" style="background:none;border:none;cursor:pointer;color:var(--mu);font-size:14px;">▦</button>' +
          '<button onclick="ouvrirModifierFourniture(\'' + f.id + '\')" title="Modifier" style="background:none;border:none;cursor:pointer;color:var(--mu);font-size:14px;">✎</button>' +
          '<button onclick="supprimerFourniture(\'' + f.id + '\')" title="Supprimer" style="background:none;border:none;cursor:pointer;color:var(--mu);font-size:14px;">🗑</button>' +
        '</div>' +
      '</div>' +
      '<div style="display:flex;gap:8px;margin-top:10px;">' +
        '<button onclick="enregistrerMouvementFourniture(\'' + f.id + '\',\'achat\')" style="flex:1;padding:7px;border-radius:7px;border:1px solid #16a34a;background:transparent;color:#16a34a;font-size:12px;font-weight:700;cursor:pointer;">➕ Achat</button>' +
        '<button onclick="enregistrerMouvementFourniture(\'' + f.id + '\',\'utilisation\')" style="flex:1;padding:7px;border-radius:7px;border:1px solid #b45309;background:transparent;color:#b45309;font-size:12px;font-weight:700;cursor:pointer;">➖ Utilisation</button>' +
      '</div>' +
    '</div>';
  }).join('') + '</div>';
}

function renderFournitures() {
  renderFournituresListe();
  var zone = document.getElementById('zone-fournitures');
  if (!zone || estPro()) return;
  zone.insertAdjacentHTML('afterbegin',
    '<div style="border:1px dashed var(--ac);background:rgba(181,80,47,.05);border-radius:10px;padding:12px 14px;margin-bottom:12px;font-size:12.5px;line-height:1.55;">' +
      '🔒 <strong>Mes fournitures fait partie de l\'offre Pro</strong> (' + PRIX_PRO_AFFICHE + '). Suivez vos consommables, scannez QR codes et codes-barres, soyez prévenu avant la rupture.' + texteEssai() +
      '<div><button class="addb" onclick="lancerAbonnement()" style="margin-top:8px;">Passer en Pro →</button></div>' +
    '</div>');
}

function openAjouterFourniture() {
  if (!exigerPro('fournitures')) return;
  _fournitureEnCours = null;
  document.getElementById('titre-modal-fourniture').textContent = 'Nouvelle fourniture';
  document.getElementById('btn-fourn-sauver').textContent = 'Ajouter';
  document.getElementById('fourn-nom').value = '';
  document.getElementById('fourn-quantite').value = '0';
  document.getElementById('fourn-unite').value = 'unité';
  document.getElementById('fourn-seuil').value = '';
  ouvrirModale('modal-fourniture');
}

function ouvrirModifierFourniture(id) {
  if (!exigerPro('fournitures')) return;
  var f = _fournituresCache.find(function(x) { return x.id === id; });
  if (!f) return;
  _fournitureEnCours = id;
  document.getElementById('titre-modal-fourniture').textContent = 'Modifier la fourniture';
  document.getElementById('btn-fourn-sauver').textContent = 'Enregistrer';
  document.getElementById('fourn-nom').value = f.nom;
  document.getElementById('fourn-quantite').value = f.quantite;
  document.getElementById('fourn-unite').value = f.unite;
  document.getElementById('fourn-seuil').value = f.seuil_alerte != null ? f.seuil_alerte : '';
  ouvrirModale('modal-fourniture');
}

async function sauverFourniture() {
  if (!exigerPro('fournitures')) return;
  if (!verifierAccesEcriture()) return;
  var nom = document.getElementById('fourn-nom').value.trim();
  if (!nom) { alert('Le nom est obligatoire.'); return; }
  var maj = {
    artisan_id: _artisan.id,
    nom: nom,
    quantite: parseFloat(document.getElementById('fourn-quantite').value) || 0,
    unite: document.getElementById('fourn-unite').value,
    seuil_alerte: document.getElementById('fourn-seuil').value ? parseFloat(document.getElementById('fourn-seuil').value) : null,
  };

  var res;
  if (_fournitureEnCours) {
    res = await sb.from('artisans_fournitures').update(maj).eq('id', _fournitureEnCours).eq('artisan_id', _artisan.id);
  } else {
    res = await sb.from('artisans_fournitures').insert(maj);
  }
  if (res.error) { if (!traiterErreurPlan(res.error)) alert('Erreur : ' + res.error.message); return; }
  fermerModale('modal-fourniture');
  await chargerFournitures();
}

async function supprimerFourniture(id) {
  if (!verifierAccesEcriture()) return;
  if (!confirm('Supprimer cette fourniture ? Son historique de mouvements sera perdu.')) return;
  var { error } = await sb.from('artisans_fournitures').delete().eq('id', id).eq('artisan_id', _artisan.id);
  if (error) { alert('Erreur : ' + error.message); return; }
  await chargerFournitures();
}

// Enregistre un mouvement (achat ou utilisation) ET met à jour le stock en une fois — jamais
// l'un sans l'autre, pour que le journal corresponde toujours exactement au chiffre affiché.
// Purement un suivi interne (matériel, consommables) — aucun lien avec ce qui est vendu,
// qui a son propre suivi de stock dans Mes produits.
async function enregistrerMouvementFourniture(id, type) {
  if (!exigerPro('fournitures')) return;
  if (!verifierAccesEcriture()) return;
  var f = _fournituresCache.find(function(x) { return x.id === id; });
  if (!f) return;

  // Stock ACTUEL relu à l'instant (un autre appareil a pu le modifier depuis le dernier chargement) : on l'affiche avant de demander la quantité,
  // pour qu'on ne se trompe pas de produit ni de quantité.
  var { data: stockFrais } = await sb.from('artisans_fournitures').select('quantite').eq('id', id).eq('artisan_id', _artisan.id).maybeSingle();
  if (stockFrais && stockFrais.quantite != null) f.quantite = Number(stockFrais.quantite);
  var quantiteAvant = f.quantite;

  var quantiteStr = prompt('📦 ' + f.nom + '\nStock actuel : ' + quantiteAvant + ' ' + f.unite + '\n\n' + (type === 'achat' ? 'Quantité achetée' : 'Quantité utilisée') + ' (' + f.unite + ') :', '1');
  if (quantiteStr === null) return;
  var quantite = parseFloat(String(quantiteStr).replace(',', '.'));
  if (!quantite || quantite <= 0) { alert('Indiquez une quantité valide.'); return; }
  if (type !== 'achat' && quantite > quantiteAvant && !confirm('Attention : vous indiquez ' + quantite + ' ' + f.unite + ' utilisé(s), mais il n\'en reste que ' + quantiteAvant + ' en stock.\n\nContinuer ? Le stock passera à 0.')) return;

  var nouvelleQuantite = type === 'achat' ? quantiteAvant + quantite : quantiteAvant - quantite;
  if (nouvelleQuantite < 0) nouvelleQuantite = 0;

  var { error: errMaj } = await sb.from('artisans_fournitures').update({ quantite: nouvelleQuantite, updated_at: new Date().toISOString() }).eq('id', id).eq('artisan_id', _artisan.id);
  if (errMaj) { if (!traiterErreurPlan(errMaj)) alert('Erreur : ' + errMaj.message); return; }

  await sb.from('artisans_fournitures_mouvements').insert({
    fourniture_id: id, artisan_id: _artisan.id, type: type, quantite: quantite,
  });

  // Rappel du résultat : de combien à combien (visible dans le fil de MPA AI).
  mpaAiDire('📦 ' + escHtml(f.nom) + ' : ' + quantiteAvant + ' → ' + nouvelleQuantite + ' ' + escHtml(f.unite) + (type === 'achat' ? ' (achat)' : ' (utilisation)'), 'info');

  // Alerte de stock bas — le vrai cœur de cette fonctionnalité : prévenir avant la pénurie.
  if (f.seuil_alerte != null && nouvelleQuantite <= f.seuil_alerte) {
    mpaAiDire('📦 "' + escHtml(f.nom) + '" est bas (' + nouvelleQuantite + ' ' + escHtml(f.unite) + ' restant' + (nouvelleQuantite > 1 ? 's' : '') + ') — pensez à en racheter.', 'warning',
      { label: 'Voir mon stock', action: "switchTab(6);switchSousOnglet('nav-stock','conteneur-stock',0)" });
  }

  await chargerFournitures();
}

// ── Scan QR code / code-barres — ZXing lit indifféremment les deux depuis la caméra. Un QR
// généré par nous-mêmes encode "CARALINK-FOURN:<id>" (reconnu directement) ; un vrai code-barres
// d'un produit du commerce est comparé au champ code_barres de chaque fourniture.
var _scanEnCours = null;    // contrôleur ZXing actif, pour pouvoir l'arrêter proprement
var _scanTypePrevu = null;  // 'achat' ou 'utilisation', fixé au moment d'ouvrir le scan
var _codeEnAttenteAssociation = null;

async function ouvrirScanFourniture(type) {
  if (!exigerPro('fournitures')) return;
  _scanTypePrevu = type;
  document.getElementById('titre-scan-fourniture').textContent = type === 'achat' ? 'Scanner un achat' : 'Scanner une utilisation';
  document.getElementById('scan-fourniture-statut').textContent = '';
  ouvrirModale('modal-scan-fourniture');

  if (typeof ZXingBrowser === 'undefined') {
    document.getElementById('scan-fourniture-statut').textContent = 'Le lecteur de code ne s\'est pas chargé — vérifiez votre connexion et réessayez.';
    return;
  }
  try {
    var lecteur = new ZXingBrowser.BrowserMultiFormatReader();
    var videoEl = document.getElementById('video-scan-fourniture');
    _scanEnCours = await lecteur.decodeFromConstraints(
      { video: { facingMode: 'environment' } },
      videoEl,
      function(resultat, erreur, controles) {
        if (resultat) {
          controles.stop();
          _scanEnCours = null;
          fermerModale('modal-scan-fourniture');
          traiterCodeScanne(resultat.getText(), type);
        }
      },
    );
  } catch (e) {
    document.getElementById('scan-fourniture-statut').textContent = 'Caméra inaccessible : ' + e.message + ' (autorisez l\'accès à la caméra dans votre navigateur).';
  }
}

function fermerScanFourniture() {
  if (_scanEnCours && _scanEnCours.stop) _scanEnCours.stop();
  _scanEnCours = null;
  fermerModale('modal-scan-fourniture');
}

var PREFIXE_QR_FOURNITURE = 'CARALINK-FOURN:';

function traiterCodeScanne(texte, type) {
  var fourniture = null;
  if (texte.indexOf(PREFIXE_QR_FOURNITURE) === 0) {
    var id = texte.slice(PREFIXE_QR_FOURNITURE.length);
    fourniture = _fournituresCache.find(function(f) { return f.id === id; });
  } else {
    fourniture = _fournituresCache.find(function(f) { return f.code_barres === texte; });
  }

  if (fourniture) {
    enregistrerMouvementFourniture(fourniture.id, type);
    return;
  }

  // Code jamais vu — on propose de l'associer à une fourniture existante plutôt que d'échouer
  // silencieusement. On ne propose que les fournitures sans code-barres déjà enregistré, pour
  // ne jamais en écraser un par erreur.
  _codeEnAttenteAssociation = { code: texte, type: type };
  var sel = document.getElementById('associer-code-select');
  var disponibles = _fournituresCache.filter(function(f) { return !f.code_barres; });
  if (!disponibles.length) {
    alert('Code non reconnu, et toutes vos fournitures ont déjà un code associé. Créez d\'abord la fourniture correspondante.');
    return;
  }
  sel.innerHTML = disponibles.map(function(f) { return '<option value="' + f.id + '">' + escHtml(f.nom) + '</option>'; }).join('');
  ouvrirModale('modal-associer-code');
}

async function confirmerAssociationCode() {
  if (!exigerPro('fournitures')) return;
  if (!verifierAccesEcriture()) return;
  var fournitureId = document.getElementById('associer-code-select').value;
  var enAttente = _codeEnAttenteAssociation;
  if (!fournitureId || !enAttente) return;

  var { error } = await sb.from('artisans_fournitures').update({ code_barres: enAttente.code }).eq('id', fournitureId).eq('artisan_id', _artisan.id);
  if (error) { alert('Erreur : ' + error.message); return; }

  var f = _fournituresCache.find(function(x) { return x.id === fournitureId; });
  if (f) f.code_barres = enAttente.code;

  fermerModale('modal-associer-code');
  _codeEnAttenteAssociation = null;
  enregistrerMouvementFourniture(fournitureId, enAttente.type);
}

// Génère un QR code à imprimer pour une fourniture — jamais un code-barres existant, toujours
// un identifiant interne, reconnu directement sans passer par l'étape d'association.
function genererQRFourniture(id) {
  if (!exigerPro('fournitures')) return;
  var f = _fournituresCache.find(function(x) { return x.id === id; });
  if (!f) return;
  document.getElementById('titre-qr-fourniture').textContent = f.nom;
  var zone = document.getElementById('rendu-qr-fourniture');
  zone.innerHTML = '';
  if (typeof QRCode === 'undefined') {
    zone.textContent = 'Le générateur de QR code ne s\'est pas chargé — vérifiez votre connexion.';
  } else {
    new QRCode(zone, { text: PREFIXE_QR_FOURNITURE + f.id, width: 180, height: 180 });
  }
  ouvrirModale('modal-qr-fourniture');
}

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
    var prix = s.prix_indicatif ? (s.prix_indicatif + '€' + (s.unite ? '/' + s.unite : '')) : '<span style="font-style:italic;color:var(--mu);">Sur devis</span>';
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
  positionnerUnite('forfait');
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
  positionnerUnite(s.unite);
  ouvrirModale('modal-service');
}

// ── Unité du tarif indicatif : liste déroulante (+ « Autre… » en texte libre) ──
var UNITES_PROPOSEES = ['forfait', 'heure', 'jour', 'm²', 'ml', 'pièce'];
function majChampUnite() {
  var autre = document.getElementById('s-unite-choix').value === 'autre';
  var champ = document.getElementById('s-unite');
  champ.style.display = autre ? '' : 'none';
  if (autre) champ.focus();
}
// Reconnaît aussi les anciennes saisies libres (« h », « heures », « m2 »…) pour retrouver la bonne ligne de la liste.
function positionnerUnite(valeur) {
  var u = String(valeur || '').trim().toLowerCase();
  var alias = { h: 'heure', heures: 'heure', m2: 'm²', 'm 2': 'm²', piece: 'pièce', 'pièces': 'pièce', pieces: 'pièce', unite: 'pièce', 'unité': 'pièce', jours: 'jour', j: 'jour' };
  if (alias[u]) u = alias[u];
  var choix = document.getElementById('s-unite-choix');
  if (!u) { choix.value = 'forfait'; document.getElementById('s-unite').value = ''; }
  else if (UNITES_PROPOSEES.indexOf(u) >= 0) { choix.value = u; document.getElementById('s-unite').value = ''; }
  else { choix.value = 'autre'; document.getElementById('s-unite').value = String(valeur).trim(); }
  majChampUnite();
  if (choix.value === 'autre') document.getElementById('s-unite').blur();
}
function lireUnite() {
  var v = document.getElementById('s-unite-choix').value;
  if (v === 'autre') return document.getElementById('s-unite').value.trim() || null;
  return v;
}

async function sauverService() {
  if (!verifierAccesEcriture()) return;
  var nom = document.getElementById('s-nom').value.trim();
  if (!nom) { alert('Le nom du service est obligatoire.'); return; }
  var maj = {
    artisan_id: _artisan.id,
    nom_service: nom,
    description: document.getElementById('s-desc').value.trim() || null,
    duree_estimee_min: parseInt(document.getElementById('s-duree').value, 10) || null,
    prix_indicatif: parseFloat(document.getElementById('s-prix').value) || null,
    unite: lireUnite(),
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
  if (!verifierAccesEcriture()) return;
  if (!confirm('Supprimer ce service ?')) return;
  var { error } = await sb.from('artisans_services').delete().eq('id', id).eq('artisan_id', _artisan.id);
  if (error) { alert('Erreur : ' + error.message); return; }
  await chargerServices();
}

init();


// ════════════════════════════════════════
//  PREUVE D'ACCEPTATION DES CONDITIONS (frais de réservation / déplacement)
//  Le client a coché les cases avant de payer : le serveur a gardé la date, l'heure et le TEXTE EXACT accepté.
//  L'artisan peut l'afficher et l'imprimer (contrôle, litige, contestation de paiement).
// ════════════════════════════════════════
function donneesPreuve(idPaiement) {
  var p = (_paiementsIntervention || []).find(function(x) { return x.id === idPaiement; });
  if (!p || !p.conditions_acceptees_le) return null;
  var i = (_interventionsCache || []).find(function(x) { return x.id === _interventionEnCours; }) || {};
  return {
    p: p, i: i,
    quand: new Date(p.conditions_acceptees_le).toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'medium', timeZone: 'America/Guadeloupe' }) + ' (heure de la Guadeloupe)',
    rdv: i.date_intervention ? new Date(i.date_intervention + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + (i.heure_debut ? ' à ' + String(i.heure_debut).slice(0, 5) : '') : '—'
  };
}
function htmlPreuve(d) {
  var p = d.p, e = escHtml;
  var textes = String(p.conditions_texte || '').split('\n\n').filter(Boolean).map(function(t) { return '<li style="margin-bottom:8px;">☑ ' + e(t) + '</li>'; }).join('');
  return '<div style="font-size:13px;line-height:1.55;">' +
    '<p style="margin:0 0 10px;"><strong>Client :</strong> ' + e(p.client_nom || '—') + (p.client_email ? ' — ' + e(p.client_email) : '') + '<br>' +
    '<strong>Rendez-vous :</strong> ' + e(d.rdv) + '<br>' +
    '<strong>Montant :</strong> ' + eurosMPA(p.montant) + ' (' + (p.type === 'reservation' ? 'frais payés à la réservation' : 'paiement') + ')<br>' +
    '<strong>Conditions acceptées le :</strong> ' + e(d.quand) + '<br>' +
    (p.paye_le ? '<strong>Paiement le :</strong> ' + e(new Date(p.paye_le).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Guadeloupe' })) + '<br>' : '') +
    '<strong>Références :</strong> ' + e(p.id) + (p.stripe_payment_intent_id ? ' / ' + e(p.stripe_payment_intent_id) : '') + '</p>' +
    '<p style="margin:0 0 6px;font-weight:700;">Le client a coché les cases suivantes avant de payer :</p><ul style="list-style:none;padding:0;margin:0;">' + textes + '</ul></div>';
}
function ouvrirPreuveConsentement(idPaiement) {
  var d = donneesPreuve(idPaiement); if (!d) return;
  window._preuveCourante = idPaiement;
  document.getElementById('preuve-corps').innerHTML = htmlPreuve(d);
  ouvrirModale('modal-preuve');
}
function imprimerPreuveConsentement() {
  var d = donneesPreuve(window._preuveCourante); if (!d) return;
  var w = window.open('', '_blank'); if (!w) { alert('Autorisez les fenêtres pop-up pour imprimer.'); return; }
  w.document.write('<!doctype html><meta charset="utf-8"><title>Preuve d\'acceptation des conditions</title><body style="font-family:Arial,sans-serif;max-width:720px;margin:30px auto;padding:0 16px;color:#111;">' +
    '<h2>Preuve d\'acceptation des conditions de réservation</h2><p style="color:#555;font-size:12px;">' + escHtml((_artisan && _artisan.nom_entreprise) || '') + ' — document généré par CaraLink Artisans à partir des données enregistrées au moment du paiement.</p>' + htmlPreuve(d) + '</body>');
  w.document.close(); w.focus(); setTimeout(function() { w.print(); }, 300);
}
