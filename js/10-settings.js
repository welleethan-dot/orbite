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
  const flips = n >= 50 ? Math.floor((n - 50)/8) + 1 : 0;
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

function gameOver(){
  mode = 'dying'; S.dead = true; S.deadT = 0; S.shake = 1;
  const p = pos(); burst(p.x, p.y, skin().glow, 40, 260); burst(p.x, p.y, COL.rock, 24, 180);
  sfx.crash(); buzz([60, 40, 120]);
  const isBest = recordRun();                   // test runs never touch the stats
  setTimeout(() => {
    mode = 'over'; ui.hud(false);
    $('finalScore').textContent = S.laps; $('overBest').textContent = best;
    $('overShards').textContent = S.shards; $('overNear').textContent = S.near || 0;
    $('overTime').textContent = fmtTime(S.t);
    $('overTitle').textContent = testRun ? 'Fin du test' : 'Collision';
    $('newBest').hidden = !isBest; ui.show('over'); ui.stats();
    showOverRank();
  }, 900);
}
function hop(){
  if (mode !== 'play') return;
  // last-moment dodge: a rock on the orbit we leave would have hit within NEAR_TIME
  for (const o of S.rocks){
    if (o.passed || o.ghost || o.lane !== S.lane) continue;
    const R = lanes[o.lane], half = (o.size*.8 + 6*unit)/R, ttc = (ahead(o.a) - half) / (S.omega + (o.w || 0));
    if (ttc < NEAR_TIME && ahead(o.a) < Math.PI) o.nearArmed = true;
  }
  S.lane = 1 - S.lane; S.campT = 0;
  if (!S.tuto) S.hops = (S.hops || 0) + 1;
  if (S.tuto) tutoHop();
  S.r += (lanes[S.lane] - S.r) * 0.4; // first part of the jump happens on the tap itself, not on the next frame
  sfx.hop(S.lane === 1); buzz(8);
  const p = pos(); burst(p.x, p.y, COL.ion, 6, 60);
}
