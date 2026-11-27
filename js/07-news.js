// Orbite · Versions, nouveautés, bandeau de mise à jour, correction 2.1.1
// Fichiers chargés dans l'ordre de leur numéro ; ils partagent les mêmes variables.

// ---------- versions & news ----------
// Newest first. Texts are written for players (no tech talk) and are proofread before each release.
const CHANGELOG = [
  {v:'2.3', date:'27/11/2026', notes:[
    "Nouveau : la seconde chance. Après une collision, reprenez la partie au même tour pour 100 ◆. Une seule fois par partie.",
    "Une flèche en haut à gauche de chaque écran pour revenir en arrière, sans descendre jusqu'en bas.",
  ]},
  {v:'2.2.2', date:'27/11/2026', notes:[
    "Le jeu est plus fluide, surtout sur les téléphones modestes et quand l'écran est rempli d'astéroïdes.",
  ]},
  {v:'2.2.1', date:'26/11/2026', notes:[
    "Améliorations techniques en coulisses, pour un jeu plus fiable à chaque mise à jour.",
  ]},
  {v:'2.2', date:'26/11/2026', notes:[
    "Nouveau : les Réglages, avec la roue dentée de l'accueil. Son, vibrations, chrono, pseudo, didacticiel et nouveautés, tout est au même endroit.",
    "Une option « Réduire les effets lumineux » adoucit les éclairs, les secousses de l'écran et les étoiles filantes.",
    "Un bug ? Une idée ? Les Réglages vous disent comment me contacter.",
    "L'accueil est épuré : « Comment jouer » passe dans les Réglages, et la moyenne de tours reste dans votre Profil.",
    "Sur Android, nouvelles vibrations pour les astéroïdes rapides et les nouveaux records.",
  ]},
  {v:'2.1.1', date:'25/11/2026', notes:[
    "Corrections et sécurité : le mode de test caché a été retiré du jeu.",
  ]},
  {v:'2.1', date:'25/11/2026', notes:[
    "Nouveau : votre Profil, avec vos performances, votre progression, votre collection de skins et votre rang au classement.",
    "Partagez vos parties depuis l'écran de fin, avec une image spéciale quand vous battez votre record.",
    "Quand vous débloquez un skin, il s'affiche en grand et vous pouvez le partager.",
  ]},
  {v:'2.0', date:'25/11/2026', notes:[
    "Nouveau : le classement en ligne ! Comparez vos meilleures parties en tours, en éclats et en série de frôlements, cette semaine ou depuis toujours.",
    "Choisissez votre pseudo : vos parties sont envoyées automatiquement, même jouées sans connexion (elles partent dès que vous êtes en ligne).",
    "Vous pouvez changer de pseudo 3 fois par mois. Votre ancien pseudo s'affiche à côté du nouveau pendant 30 jours.",
    "Votre rang de la semaine s'affiche en fin de partie.",
    "Protection renforcée contre la triche.",
  ]},
  {v:'1.9', date:'23/11/2026', notes:[
    "À chaque palier, son nom s'affiche en haut de l'écran et les orbites et les bords de l'écran s'illuminent de sa couleur : rouge pour la pluie d'astéroïdes, turquoise pour les astéroïdes rapides, violet pour l'inversion, or pour un nouveau record.",
    "Les annonces ne s'affichent plus en bas de l'écran.",
    "Nouveau : un didacticiel guide votre première partie, pas à pas.",
    "Nouvel écran « Comment jouer » sur l'accueil, avec toutes les règles et un bouton pour refaire le didacticiel.",
    "Le centre de la planète affiche seulement le nombre de tours.",
    "Nouveau : esquivez un astéroïde au tout dernier moment pour un frôlement, signalé par un anneau lumineux et un son. Enchaînez-les pour voir s'afficher x2, x3… et retrouvez vos frôlements en fin de partie.",
    "Un petit son quand vous équipez un skin dans la boutique.",
  ]},
  {v:'1.8', date:'22/11/2026', notes:[
    "Nouveautés : à chaque mise à jour, cette fenêtre vous montre ce qui a changé.",
    "Le jeu vous prévient quand une nouvelle version est disponible : un toucher suffit pour l'installer.",
    "Le numéro de version est affiché en bas de l'écran d'accueil.",
  ]},
  {v:'1.7', date:'22/11/2026', notes:[
    "Chaque annonce en jeu a sa couleur : rouge pour la pluie d'astéroïdes, orange pour les astéroïdes rapides, violet pour l'inversion, or pour un nouveau record.",
  ]},
  {v:'1.6', date:'22/11/2026', notes:[
    "Le son revient correctement quand vous revenez dans le jeu après l'avoir quitté.",
    "L'application est plus légère à télécharger.",
  ]},
  {v:'1.5', date:'22/11/2026', notes:[
    "Corrigé : le jeu ne se réduit plus en haut à gauche de l'écran quand vous revenez dans l'application.",
    "Les annonces en jeu sont plus petites et s'affichent sous la zone de jeu.",
    "Les écrans s'adaptent mieux à tous les téléphones (encoche, petits écrans).",
    "Nouveaux sons sur les boutons, et un bruit de tirelire quand vous achetez un skin.",
  ]},
  {v:'1.4', date:'19/11/2026', notes:[
    "Nouveau skin bonus : Mezen, à débloquer en cumulant 92 390 tours.",
    "Nouveaux prix des skins.",
  ]},
  {v:'1.3', date:'19/11/2026', notes:[
    "Les éclats rares apparaissent plus souvent.",
    "La boutique est simplifiée.",
  ]},
  {v:'1.2', date:'19/11/2026', notes:[
    "Nouvelle boutique : 5 skins pour votre sonde, à acheter avec vos éclats.",
    "Un éclat apparaît tous les 5 tours.",
    "L'écart de vitesse entre les deux orbites est réduit.",
  ]},
  {v:'1.1', date:'16/11/2026', notes:[
    "Le jeu prend tout l'écran du téléphone, avec des textes plus grands.",
    "Votre score et votre record se comptent en tours.",
    "Le jeu est plus difficile.",
    "Nouvelles statistiques sur l'accueil : record, moyenne, parties et éclats.",
  ]},
  {v:'1.0', date:'16/11/2026', notes:[
    "Première version installable sur téléphone.",
  ]},
];
const APP_VERSION = CHANGELOG[0].v;
$('verLabel').textContent = APP_VERSION;
const noteList = notes => notes.map(n => { const li = document.createElement('li'); li.textContent = n; return li; });
function openNews(){
  const c = CHANGELOG[0];
  $('newsTitle').textContent = 'Version ' + c.v; $('newsDate').textContent = c.date;
  $('newsList').replaceChildren(...noteList(c.notes));
  const h = $('newsHistory'); h.hidden = true; h.replaceChildren();
  for (const old of CHANGELOG.slice(1)){
    const t = document.createElement('h3'); t.textContent = 'Version ' + old.v;
    const d = document.createElement('span'); d.textContent = old.date; t.append(d);
    const ul = document.createElement('ul'); ul.className = 'notes'; ul.append(...noteList(old.notes));
    const box = document.createElement('div'); box.append(t, ul); h.append(box);
  }
  $('newsHistoryBtn').hidden = false;
  ui.show('news');
}
$('newsBtn').addEventListener('click', openNews);
$('newsOk').addEventListener('click', () => { store.set('seenVersion', APP_VERSION); ui.show('menu'); ui.stats(); });
$('newsHistoryBtn').addEventListener('click', () => { $('newsHistory').hidden = false; $('newsHistoryBtn').hidden = true; });
// ---------- correction of the progress obtained with the old hidden test mode (2.1.1) ----------
// An honest player always has: wallet + price of bought skins <= crystals earned in game (gemsTotal),
// and owns Mezen only with 92 390 laps. The "+1 000" button broke the first rule, "Débloquer Mezen" the second.
// Penalty: every skin is removed (the base probe is kept) and the wallet is set to half the crystals earned in game.
let cheatFixed = false;
if (!TEST_TOOLS){
  const spent = SKINS.filter(k => k.price > 0 && owned.includes(k.id)).reduce((a, k) => a + k.price, 0);
  const mz = SKINS.find(k => k.unlockLaps);
  if (wallet + spent > gemsTotal || (owned.includes(mz.id) && lapsTotal < mz.unlockLaps)){
    owned = ['sonde']; equipped = 'sonde'; wallet = Math.floor(gemsTotal / 2);
    store.set('v2.owned', owned); store.set('v2.skin', equipped); store.set('v2.wallet', wallet);
    cheatFixed = true;
  }
}
function showNewsIfNeeded(){
  const seen = store.get('seenVersion', null);
  if (seen === APP_VERSION) return false;
  if (seen === null && games === 0){ store.set('seenVersion', APP_VERSION); return false; }
  openNews(); return true;
}
// Show the news once after an update (players who never played start on the home screen); a correction notice comes first.
if (cheatFixed){ ui.show('notice'); ui.stats(); }
else showNewsIfNeeded();
$('noticeOk').addEventListener('click', () => { if (!showNewsIfNeeded()) ui.show('menu'); ui.stats(); });

// A newer version is online? (version.json is published with each release.) Offer it outside of a run.
let updateReady = false;
function newerThan(a, b){
  const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++){ const d = (x[i] || 0) - (y[i] || 0); if (d) return d > 0; }
  return false;
}
let remoteVersion = null;
async function checkUpdate(){
  try {
    const r = await fetch('version.json?t=' + Date.now(), {cache: 'no-store'});
    if (!r.ok) return;
    const j = await r.json();
    if (newerThan(j.version, APP_VERSION)){ updateReady = true; remoteVersion = j.version; }
  } catch(e){}
}
// The bar sits at the top of whichever screen is open (home, pause, end of run), never over the game.
setInterval(() => {
  const bar = $('updateBar'), host = ['menu', 'paused', 'over'].map(id => $(id)).find(o => !o.hidden);
  if (!updateReady || !host){ bar.hidden = true; return; }
  const card = host.querySelector('.card');
  if (bar.parentElement !== card) card.prepend(bar);
  bar.hidden = false;
}, 500);
checkUpdate(); setInterval(checkUpdate, 5*60*1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkUpdate(); });
$('updateBar').addEventListener('click', async () => {
  sfx.go();
  try { const reg = await navigator.serviceWorker?.getRegistration(); await reg?.update(); } catch(e){}
  location.replace('./?v=' + encodeURIComponent(remoteVersion || Date.now()));   // new address: skips any stale copy
});
