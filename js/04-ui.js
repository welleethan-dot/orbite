// Orbite · Interface : écrans, début / pause / fin de partie, saut
// Fichiers chargés dans l'ordre de leur numéro ; ils partagent les mêmes variables.

// ---------- UI ----------
const ui = {
  show(id){ for (const k of ['menu','paused','over','test','shop','news','howto','board','pseudoBox','profile','unlock','sharebox','notice','settings','second','player']) $(k).hidden = k !== id; },
  hud(on){ $('hud').hidden = !on; },
  score(){ $('sc').textContent = S.laps; $('hs').textContent = 'Record ' + Math.max(best, testRun || S.tuto ? 0 : S.laps); $('gm').textContent = '◆ ' + S.shards; },
  stats(){ $('menuBest').textContent = best; $('menuGames').textContent = games; $('menuGems').textContent = wallet; },
  muteIcon(){ $('wave').style.display = muted ? 'none' : ''; $('mute').setAttribute('aria-label', muted ? 'Activer le son' : 'Couper le son'); }
};
ui.stats(); ui.muteIcon();

function start(){
  clearEvent(); $('tuto').hidden = true; $('sc').classList.remove('glow'); resize();
  audio();
  S = fresh(); mode = 'play'; ui.show(null); ui.hud(true); ui.score();
  S.hard = testRun && testRun.kind !== 'random' ? testRun.kind === 'hard' : Math.random() < 0.2; // one run in five, on average
  S.omegaMax = S.hard ? 3.6 : 3.25;
  if (testRun && testRun.lap > 0) jumpToLap(testRun.lap);
  $('testTag').hidden = !testRun;
  if (testRun) $('testTag').textContent = 'Test · T' + testRun.lap + (S.hard ? ' · difficile' : ' · normale');
  // hard runs are never announced: the player only feels it
  $('hint').hidden = false; $('hint').style.opacity = 1;
  setTimeout(()=>{ $('hint').style.opacity = 0; }, 2600);
}
let bannerTimer = 0;
// One colour per event, so it can be recognised out of the corner of the eye without reading it.
const EVENT_COL = {rain:'#FF4D6D', fast:'#19E6D2', flip:'#B46BFF', record:'#FFD66B'};   // red, turquoise, violet, gold
// One word, read in a glance (full explanations are in the rules on the home screen).
// Events are shown without any text: the orbits and the screen edges light up in the event's colour.
// Each event also has its own rhythm (1 flash, 2 flashes, a longer pulse) so it reads even without the colour.
// The event's name is also shown, big and bold, at the top of the screen between the score and the orbits.
let fx = null, bannerTimer2 = 0;                 // fx: {color, pulses, dur, t}
// hold = true (tutorial): the colour and the title stay until the player moves on.
function banner(title, color, pulses = 1, dur = 1.2, hold = false){
  fx = {color, pulses, dur, t: 0, hold};
  $('hint').style.opacity = 0;
  const b = $('banner'); b.hidden = true; void b.offsetWidth;   // restart the animation
  b.textContent = title; b.style.color = color; b.style.textShadow = `0 0 18px ${hexA(color, .7)}, 0 2px 0 rgba(10,12,34,.6)`;
  // centre it in the free band between the HUD and the top of the outer orbit (rocks included)
  const hudBottom = $('hud').getBoundingClientRect().bottom, orbitTop = cy - lanes[1] - 26*unit;
  b.style.top = Math.round(orbitTop - hudBottom > 34 ? (hudBottom + orbitTop)/2 : hudBottom + 22) + 'px';
  b.classList.toggle('hold', hold); b.hidden = false;
  clearTimeout(bannerTimer2); if (!hold) bannerTimer2 = setTimeout(() => { b.hidden = true; }, 1900);
}
function fxLevel(){                              // 0..1, current brightness of the event light
  if (!fx) return 0;
  const k = fx.t / fx.dur;
  if (settings.lowfx) return k >= 1 ? (fx.hold ? .3 : 0) : .3*(1 - k);   // reduced effects: a soft, steady glow, no flashes
  if (k >= 1) return fx.hold ? .5 + .25*Math.sin((fx.t - fx.dur)*3) : 0;   // held: gentle breathing
  const phase = (k * fx.pulses) % 1;
  return Math.sin(Math.PI * phase) * (1 - .35*k);
}
const fmtTime = t => { const m = Math.floor(t/60), s = t - m*60; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1); };
function reverse(){
  for (const o of S.rocks){ const p = pos(o.a, lanes[o.lane]); burst(p.x, p.y, COL.rock, 6, 90); }
  S.rocks = [];
  S.dir = -S.dir;
  for (const g of S.gems) g.prev = ahead(g.a);
  S.spawnT = .5; S.shake = .35;
  tone(300, 900, .25, 'sine', .1);
}
function pause(){ if (mode !== 'play') return; mode = 'paused'; ui.show('paused'); }
function resume(){ if (mode !== 'paused') return; mode = 'play'; ui.show(null); last = performance.now(); }

// Back arrow (2.3) at the top left of each menu screen: does exactly what the screen's own "Retour…" button does.
// A single button on the page itself (not inside the screens, whose blurred background would make it scroll away).
const BACK_OF = {settings: 'setClose', board: 'boardClose', profile: 'profClose', shop: 'shopClose', howto: 'howClose',
  pseudoBox: 'pseudoLater', news: 'newsOk', sharebox: 'shareClose', unlock: 'unlockClose', test: 'testClose', player: 'plClose'};
const backBtn = document.createElement('button');
backBtn.className = 'icon back'; backBtn.id = 'backBtn'; backBtn.setAttribute('aria-label', 'Retour'); backBtn.hidden = true;
backBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>';
document.body.appendChild(backBtn);
const backScreen = () => Object.keys(BACK_OF).find(k => !$(k).hidden);
backBtn.addEventListener('click', () => { const k = backScreen(); if (k) $(BACK_OF[k]).click(); });   // that button plays the click sound
const syncBack = () => { backBtn.hidden = !backScreen(); };
const backWatch = new MutationObserver(syncBack);
for (const k of Object.keys(BACK_OF)) backWatch.observe($(k), {attributes: true, attributeFilter: ['hidden']});
syncBack();
