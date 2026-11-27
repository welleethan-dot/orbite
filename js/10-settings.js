// Orbite · Réglages et mode de test (/beta/ seulement)
// Fichiers chargés dans l'ordre de leur numéro ; ils partagent les mêmes variables.

// ---------- settings ----------
const canVibrate = typeof navigator.vibrate === 'function';
function setSwitch(id, on){ $(id).setAttribute('aria-checked', String(!!on)); }
function saveSettings(){ store.set('settings', settings); }
function openSettings(){
  setSwitch('swSound', !muted); setSwitch('swVib', settings.vib && canVibrate); setSwitch('swFx', settings.lowfx); setSwitch('swClock', settings.clock);
  $('swVib').disabled = !canVibrate;
  $('vibNote').textContent = canVibrate ? 'Petites vibrations pendant la partie' : 'Non disponible sur cet appareil';
  $('setPseudo').textContent = pseudo || 'Aucun pseudo';
  $('setPseudoBtn').textContent = pseudo ? 'Changer' : 'Choisir';
  if (pseudo) loadPlayerInfo().then(() => { if (pinfo && !$('settings').hidden) $('setPseudo').textContent = `${pseudo} · ${changesText(pinfo.changes_left).toLowerCase()}`; });
  ui.show('settings');
}
$('setBtn').addEventListener('click', openSettings);
$('setClose').addEventListener('click', () => { ui.show('menu'); ui.stats(); });
$('swSound').addEventListener('click', () => { muted = !muted; store.set('muted', muted); ui.muteIcon(); setSwitch('swSound', !muted); if (!muted) sfx.ui(); });
$('swVib').addEventListener('click', () => { settings.vib = !settings.vib; saveSettings(); setSwitch('swVib', settings.vib); buzz(20); });
$('swFx').addEventListener('click', () => { settings.lowfx = !settings.lowfx; saveSettings(); setSwitch('swFx', settings.lowfx); });
$('swClock').addEventListener('click', () => { settings.clock = !settings.clock; saveSettings(); setSwitch('swClock', settings.clock); $('clock').hidden = !settings.clock; });
$('setPseudoBtn').addEventListener('click', () => openPseudo('settings'));
$('setTuto').addEventListener('click', () => startTutorial('howto'));

// ---------- hidden test mode ----------
let testRun = null;                              // {lap, kind} while a test run is active
let testCfg = store.get('test', {lap: 29, kind: 'random'});
// Put the run in the state it would normally have on reaching lap n: same clock, speed, phases, direction.
function jumpToLap(n){
  let t = 0, ang = 0; const target = n*TAU;
  const w = tt => omegaAt(tt);
  while (ang < target){ ang += w(t)*0.01; t += 0.01; }
  S.t = t; S.omega = w(t); S.laps = n; S.storm = n >= 30;
  const flips = n >= 50 ? Math.floor((Math.min(n, CHAOS_LAP - 1) - 50)/8) + 1 : 0;
  if (n >= CHAOS_LAP) S.nextFlip = n + 1 + Math.floor(Math.random()*3);
  S.dir = flips % 2 ? -1 : 1;
  S.spawnT = 1; S.gemCount = Math.floor(n/5); ui.score();
}
function testUI(){
  $('lapInput').value = testCfg.lap;
  for (const b of document.querySelectorAll('#lapChips .chip')) b.setAttribute('aria-pressed', String(+b.dataset.lap === testCfg.lap));
  for (const b of document.querySelectorAll('#kindChips .chip')) b.setAttribute('aria-pressed', String(b.dataset.kind === testCfg.kind));
}
function setLap(n){ testCfg.lap = Math.max(0, Math.min(200, Math.round(+n) || 0)); store.set('test', testCfg); testUI(); }
function openTest(){ testUI(); ui.show('test'); }
let titleTaps = 0, titleTimer = 0;
$('title').addEventListener('click', () => {
  titleTaps++; clearTimeout(titleTimer); titleTimer = setTimeout(() => { titleTaps = 0; }, 1500);
  if (titleTaps >= 5 && TEST_TOOLS){ titleTaps = 0; openTest(); }   // test tools exist only on the test address
});
$('lapMinus').addEventListener('click', () => setLap(testCfg.lap - 1));
$('lapPlus').addEventListener('click', () => setLap(testCfg.lap + 1));
$('lapInput').addEventListener('change', e => setLap(e.target.value));
$('lapChips').addEventListener('click', e => { const b = e.target.closest('.chip'); if (b) setLap(b.dataset.lap); });
$('kindChips').addEventListener('click', e => { const b = e.target.closest('.chip'); if (b){ testCfg.kind = b.dataset.kind; store.set('test', testCfg); testUI(); } });
$('testGo').addEventListener('click', () => { setLap($('lapInput').value); testRun = {...testCfg}; start(); });
$('testClose').addEventListener('click', () => { ui.show('menu'); ui.stats(); });
// test helpers for the shop (hidden mode only)
$('addGems').addEventListener('click', () => { wallet += 1000; store.set('v2.wallet', wallet); $('addGems').textContent = '+1 000 ◆ (solde ' + fmtN(wallet) + ')'; });
$('unlockMezen').addEventListener('click', () => {
  if (!owned.includes('mezen')){ owned.push('mezen'); store.set('v2.owned', owned); setTimeout(() => celebrateSkin('mezen'), 200); }
  $('unlockMezen').textContent = 'Mezen débloqué';
});
$('resetSkins').addEventListener('click', () => {
  wallet = 0; owned = ['sonde']; equipped = 'sonde';
  store.set('v2.wallet', 0); store.set('v2.owned', owned); store.set('v2.skin', equipped);
  $('addGems').textContent = '+1 000 ◆'; $('resetSkins').textContent = 'Boutique remise à zéro';
});
// Back to the home screen from the pause or game-over screen.
// A run abandoned from the pause screen still counts (record + number of games), except in test mode.
function goHome(){
  $('tuto').hidden = true; $('sc').classList.remove('glow'); clearEvent(); resize();
  if ((mode === 'paused' || mode === 'play') && !testRun && !S.tuto){
    recordRun();
  }
  testRun = null; mode = 'menu'; S = fresh();
  ui.hud(false); $('hint').hidden = true; $('banner').hidden = true;
  ui.show('menu'); ui.stats();
}
$('homeFromPause').addEventListener('click', goHome);
$('homeFromOver').addEventListener('click', goHome);

// Second chance (2.3): once per run, for REVIVE_COST crystals from the wallet, resume at the same lap.
// Offered for REVIVE_WAIT seconds after the crash; the run is only counted once the player declines (or time runs out).
const REVIVE_COST = 100, REVIVE_WAIT = 6, REVIVE_SHIELD = 2;
function gameOver(){
  mode = 'dying'; S.dead = true; S.deadT = 0; S.shake = 1;
  const p = pos(); burst(p.x, p.y, skin().glow, 40, 260); burst(p.x, p.y, COL.rock, 24, 180);
  sfx.crash(); buzz([60, 40, 120]);
  if (!S.revived && wallet >= REVIVE_COST && !(testRun && testRun.train)){   // no second chance in training
    setTimeout(() => {
      if (mode !== 'dying') return;
      mode = 'offer'; S.offerT = REVIVE_WAIT; ui.hud(false);
      $('secondLaps').textContent = S.laps; $('secondWallet').textContent = fmtN(wallet);
      $('secondBar').style.width = '100%'; ui.show('second');
    }, 900);
    return;
  }
  finishRun(900);
}
function finishRun(delay){
  const isBest = recordRun();                   // test runs never touch the stats
  setTimeout(() => {
    mode = 'over'; ui.hud(false);
    $('finalScore').textContent = S.laps; $('overBest').textContent = best;
    $('overShards').textContent = S.shards + (S.bonus || 0); $('overNear').textContent = S.near || 0;
    $('overTime').textContent = fmtTime(S.t);
    $('overTitle').textContent = testRun ? (testRun.train ? 'Entraînement' : 'Fin du test') : 'Collision';
    $('shareRun').hidden = !!testRun;
    $('newBest').hidden = !isBest; ui.show('over'); ui.stats();
    showOverRank();
  }, delay);
}
function declineRevive(){
  if (mode !== 'offer') return;
  mode = 'dying'; ui.show(null); finishRun(0);
}
function revive(){
  if (mode !== 'offer' || wallet < REVIVE_COST) return;
  wallet -= REVIVE_COST; store.set('v2.wallet', wallet);
  S.revived = true; S.dead = false; S.shield = REVIVE_SHIELD;
  S.rocks = []; S.spawnT = Math.max(S.spawnT, 1);              // a clear sky to start again
  S.trail = []; S.shake = 0;
  mode = 'play'; ui.show(null); ui.hud(true); ui.score(); last = performance.now();
}
$('secondYes').addEventListener('click', revive);
$('secondNo').addEventListener('click', declineRevive);
function hop(){
  if (mode !== 'play') return;
  // last-moment dodge: a rock on the orbit we leave would have hit within NEAR_TIME
  for (const o of S.rocks){
    if (o.passed || o.ghost || o.lane !== S.lane) continue;
    const R = lanes[o.lane], half = (o.size*.8 + 6*unit)/R, ttc = (ahead(o.a) - half) / (S.omega + (o.w || 0));
    if (ttc < (S.tuto ? TUTO_NEAR_TIME : NEAR_TIME) && ahead(o.a) < Math.PI) o.nearArmed = true;
  }
  S.lane = 1 - S.lane; S.campT = 0;
  if (!S.tuto) S.hops = (S.hops || 0) + 1;
  if (S.tuto) tutoHop();
  S.r += (lanes[S.lane] - S.r) * 0.4; // first part of the jump happens on the tap itself, not on the next frame
  sfx.hop(S.lane === 1); buzz(8);
  const p = pos(); burst(p.x, p.y, COL.ion, 6, 60);
}

// ---------- training (2.5) ----------
// Start just before a stage, to practise it. Nothing counts (it is a test run without the test tools):
// no record, no leaderboard, no crystals, no second chance. A stage opens once the record has reached it.
const TRAINING = [
  {lap: 28,  at: 30,  name: 'Pluie d’astéroïdes', col: 'rain'},
  {lap: 38,  at: 40,  name: 'Astéroïdes rapides', col: 'fast'},
  {lap: 48,  at: 50,  name: 'Inversion',          col: 'flip'},
  {lap: 198, at: 200, name: 'Inversions folles',  col: 'chaos'},
];
function openTraining(){
  const box = $('trainList'); box.replaceChildren();
  for (const tr of TRAINING){
    const b = document.createElement('button'), open = best >= tr.at;
    const dot = document.createElement('span'); dot.className = 'tdot'; dot.style.background = EVENT_COL[tr.col];
    const nm = document.createElement('b'); nm.textContent = tr.name;
    const lap = document.createElement('span'); lap.className = 'tlap'; lap.textContent = 'tour ' + tr.at;
    const sm = document.createElement('small'); sm.textContent = open ? 'Départ au tour ' + tr.lap : 'Atteignez le tour ' + tr.at + ' pour le débloquer';
    b.append(dot, nm, lap, sm); b.disabled = !open; b.dataset.lap = tr.lap;
    b.addEventListener('click', () => { testRun = {lap: tr.lap, kind: 'random', train: true, name: tr.name}; start(); });
    box.append(b);
  }
  ui.show('train');
}
$('trainBtn').addEventListener('click', openTraining);
$('trainClose').addEventListener('click', () => { ui.show('menu'); ui.stats(); });
