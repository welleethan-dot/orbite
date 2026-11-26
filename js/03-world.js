// Orbite · Monde : géométrie, état de la partie, astéroïdes, éclats, frôlements, paliers
// Fichiers chargés dans l'ordre de leur numéro ; ils partagent les mêmes variables.

// ---------- geometry ----------
let W, H, cx, cy, R0, lanes = [0,0], unit;
let DPR = 1;
function resize(){
  const dpr = DPR = Math.min(window.devicePixelRatio || 1, 2);
  const r = cv.getBoundingClientRect(); W = r.width; H = r.height;
  cv.width = Math.round(W*dpr); cv.height = Math.round(H*dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);
  // Outer orbit as wide as the screen allows (keeping room for a rock at the edge and the HUD above).
  const small = W < 700;                       // phones and small tablets
  const boost = small ? 1.35 : 1;              // objects drawn bigger on phones
  let outer = Math.max(80, Math.min(W/2 - 30*boost, H*0.38)), cyv = H*0.53;
  // Tutorial: fit the orbits whole between the event title (top) and the tutorial card (bottom).
  let st = null; try { st = S; } catch(e){}      // resize() also runs before the game state exists
  const card = document.getElementById('tuto');
  if (st && st.tuto && card && !card.hidden){
    const top = document.getElementById('hud').getBoundingClientRect().bottom + 52, bottom = card.getBoundingClientRect().top - 8;
    const o2 = Math.min(outer, (bottom - top)/2 - 22);
    if (o2 > 60){ outer = o2; cyv = (top + bottom)/2; }
  }
  unit = outer/154 * boost; cx = W/2; cy = cyv;
  R0 = outer*0.31; lanes = [outer/1.55, outer];   // probe ~55 % faster on the outer orbit
}
addEventListener('resize', resize); resize();
// Android can drop the canvas while the app is in the background and give it back with its scale reset
// (the game then shrinks into the top-left corner). Re-measure whenever the app comes back.
for (const ev of ['pageshow', 'focus', 'orientationchange']) addEventListener(ev, () => setTimeout(resize, 60));
document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(resize, 60); });
cv.addEventListener('contextrestored', resize);
setInterval(() => {                                  // safety net: size changed without any event
  const r = cv.getBoundingClientRect();
  if (Math.abs(cv.width - Math.round(r.width*DPR)) > 1 || Math.abs(cv.height - Math.round(r.height*DPR)) > 1) resize();
}, 1000);

// ---------- background stars ----------
const stars = Array.from({length:140}, () => ({a:Math.random()*TAU, d:Math.sqrt(Math.random()), s:Math.random()*1.4+.3, tw:Math.random()*TAU}));

// ---------- rock shapes ----------
function rockShape(){ const n = 7 + (Math.random()*4|0); return Array.from({length:n}, (_,i)=>({a:i/n*TAU, r:.72+Math.random()*.32})); }

// ---------- state ----------
let mode = 'menu';
let S;
function fresh(){
  return { t:0, a:-Math.PI/2, lane:1, r:lanes[1], omega:1.5, score:0, shards:0, laps:0, lapAcc:0, campT:0, dir:1, revWarn:0, meteors:[], hard:false, storm:false, omegaMax:3.25, clockShown:'',
    rocks:[], gems:[], parts:[], trail:[], spawnT:1.2, gemDue:0, gemTry:0, gemWait:0, gemCount:0, shake:0, pulse:0, popups:[], dead:false, deadT:0 };
}
S = fresh();

const mod = (x, m) => ((x % m) + m) % m;
const ahead = a => mod(S.dir*(a - S.a), TAU); // angular distance ahead of the player, in its direction of travel
const lapProgress = (from, span) => Math.max(0, Math.min(1, (S.laps - from)/span));

const angDist = (a, b) => Math.abs(mod(a - b + Math.PI, TAU) - Math.PI);
function laneBlockedNear(lane, a, gap){
  // `meet` = where the probe will actually cross the rock (differs from `a` for rushing rocks)
  return S.rocks.some(o => o.lane === lane && angDist(a, o.meet) < gap);
}
// Free arc a crystal needs on its own lane, on each side, so the player can
// slip in after one rock, take it, and slip out before the next one.
// rock half-width (collision radius as an angle) + the arc travelled during `secs`.
function gemClearance(lane, secs){
  const rockHalf = 21*unit / lanes[lane];
  const omegaSoon = Math.min(S.omega + 0.2, S.omegaMax);   // speed a little later, when the crystal is reached
  return rockHalf + omegaSoon*secs;
}
// Margins tighten as the run goes on: full progress after 90 s.
const progress = () => Math.min(1, S.t / 90);
// a hard run trims every margin by 15 %
const gemEasySecs = () => (0.8 - 0.35*progress()) * (S.hard ? .85 : 1);   // 0.80 s -> 0.45 s
const gemHardSecs = () => (0.32 - 0.14*progress()) * (S.hard ? .85 : 1);  // 0.32 s -> 0.18 s (0.15 s in a hard run)
function gemBlocks(lane, a){
  return S.gems.some(g => !g.got && g.lane === lane && angDist(a, g.a) < g.clear);
}
// Rocks aim at the probe's orbit more and more, and always once it has stayed on one orbit too long.
function pickLane(){
  const lapTime = TAU / S.omega;
  let p = 0.6 + 0.2*lapProgress(20, 20);        // 60 % at the start -> 80 % from lap 40
  if (S.campT > lapTime*0.5) p = 0.9;           // half a lap on the same orbit
  if (S.campT > lapTime*0.9) p = 1;             // almost a full lap: no escape
  return Math.random() < p ? S.lane : 1 - S.lane;
}
function spawnRocks(lane){
  const minGap = S.omega*0.42 + 0.42;          // time the player needs to switch, as an angle
  const d = S.dir;
  // From lap 30, rocks appear closer: lead shrinks from 2.3 rad to 1.75 rad by lap 60.
  const lead = 2.3 - 0.55*lapProgress(30, 30);
  // From lap 40, some rocks rush along the orbit toward the probe (more often, faster, up to lap 70).
  const rushChance = S.laps < 40 ? 0 : 0.15 + 0.25*lapProgress(40, 30);
  if (Math.random() < rushChance){
    const w = 0.6 + Math.random()*0.6 + 0.3*lapProgress(40, 30);   // its own speed, rad/s
    const meetAhead = lead + Math.random()*1.0;                    // where the probe will cross it
    const meet = S.a + d*meetAhead;
    if (laneBlockedNear(1-lane, meet, minGap) || gemBlocks(lane, meet)) return false;
    S.rocks.push(makeRock(lane, S.a + d*meetAhead*(S.omega + w)/S.omega, w, meet));
    return true;
  }
  const cluster = S.t > 18 && Math.random() < Math.min(S.storm ? .6 : .45, S.t*.008) ? 2 + (Math.random()<.35?1:0) : 1;
  const base = S.a + d*(lead + Math.random()*1.4);
  const step = 0.34*d;
  // fairness: the other lane must stay open across the whole cluster
  for (let k=0;k<cluster;k++) if (laneBlockedNear(1-lane, base + k*step, minGap)) return false;
  // never drop a rock inside a crystal's reserved arc
  for (let k=0;k<cluster;k++) if (gemBlocks(lane, base + k*step)) return false;
  for (let k=0;k<cluster;k++){
    S.rocks.push(makeRock(lane, base + k*step));
  }
  return true;
}
// Speed of the probe (rad/s) after t seconds: top speed after ~45 s (~40 s in a hard run).
function omegaAt(t){ return S.hard ? 1.75 + Math.min(1.85, t*0.046) : 1.5 + Math.min(1.75, t*0.039); }
function makeRock(lane, a, w = 0, meet = a){
  return {lane, a, w, meet, rot:Math.random()*TAU, vr:(Math.random()-.5)*2, shape:rockShape(), born:S.t, passed:false, prev:ahead(a), size:(13+Math.random()*4)*unit};
}
function addGem(lane, a, hard, clear){
  S.gems.push({lane, a, hard, clear, val: hard ? 3 : 1, born:S.t, prev:ahead(a), spin:Math.random()*TAU});
}
function spawnGem(){
  // easy: a wide free arc on its own lane
  for (let tries = 0; tries < 6; tries++){
    const lane = Math.random() < .5 ? 0 : 1;
    const a = S.a + S.dir*(2.2 + Math.random()*1.6);
    const clear = gemClearance(lane, gemEasySecs());
    if (laneBlockedNear(lane, a, clear) || gemBlocks(lane, a)) continue;
    addGem(lane, a, false, clear);
    return true;
  }
  return false;
}
// hard: tucked right next to an incoming rock, with just enough room to grab it
function spawnHardGem(){
  const cands = S.rocks.filter(o => !o.passed && !o.w && ahead(o.a) > 1.9);
  for (let tries = 0; tries < 6 && cands.length; tries++){
    const o = cands[(Math.random()*cands.length)|0];
    const clear = gemClearance(o.lane, gemHardSecs());
    const a = o.a + (Math.random() < .5 ? -1 : 1) * (clear + (.03 + Math.random()*.08)*(1 - .7*progress()));
    if (ahead(a) < 1.8 || ahead(a) > 5.2) continue;
    if (laneBlockedNear(o.lane, a, clear) || gemBlocks(o.lane, a)) continue;
    addGem(o.lane, a, true, clear);
    return true;
  }
  return false;
}
// a few faint shooting stars crossing the background, staggered
function shootingStars(){
  if (calmFx()) return;
  const n = 2 + (Math.random() < .5 ? 1 : 0), big = Math.max(W, H);
  const dir = Math.random() < .5 ? 1 : -1;
  for (let i = 0; i < n; i++){
    const ang = (0.35 + Math.random()*0.35);           // 20 to 40 degrees below horizontal
    const spd = big*(0.9 + Math.random()*0.4);
    S.meteors.push({
      x: dir > 0 ? Math.random()*W*0.5 : W*0.5 + Math.random()*W*0.5,
      y: Math.random()*H*0.35,
      vx: Math.cos(ang)*spd*dir, vy: Math.sin(ang)*spd,
      age: -(i*0.45 + Math.random()*0.25), life: 0.8 + Math.random()*0.3,
      len: (70 + Math.random()*50)*unit
    });
  }
}
// ---------- near miss (frôlement) ----------
// No "Frôlé !" text (it was distracting): a white ring, sparks and a swish confirm it; a chain shows x2, x3…
// A rock dodged at the last moment (the probe leaves its orbit less than NEAR_TIME before impact),
// or that passes within NEAR_GAP (x unit) of the probe, without touching it. Counted per run (S.near)
// and in total (v2.near), ready for future daily challenges or crystal rewards.
const NEAR_GAP = 5, NEAR_TIME = .12;   // edge-to-edge gap (x unit) / last-moment dodge (seconds before impact)
function nearMiss(o){
  S.near = (S.near || 0) + 1;
  S.nearChain = S.t - (S.lastNear ?? -9) < 2.5 ? (S.nearChain || 0) + 1 : 1; S.lastNear = S.t;
  S.bestChain = Math.max(S.bestChain || 0, S.nearChain);
  const p = pos(), op = pos(o.a, lanes[o.lane]);
  burst((p.x + op.x)/2, (p.y + op.y)/2, '#FFFFFF', 10 + 3*Math.min(S.nearChain, 4), 170);
  if (S.nearChain >= 2) popup('x' + S.nearChain, p.x, p.y - 14*unit, '#FFFFFF');   // only the chain multiplier, from x2
  S.nearFlash = 1; sfx.near(S.nearChain); buzz(8);
}
function burst(x, y, color, n, spd){
  for (let i=0;i<n;i++){ const a = Math.random()*TAU, v = (Math.random()*.8+.2)*spd*unit;
    S.parts.push({x, y, vx:Math.cos(a)*v, vy:Math.sin(a)*v, life:1, decay:.8+Math.random()*1.2, color, s:(Math.random()*2+1)*unit}); }
}
function popup(text, x, y, color){ S.popups.push({text, x, y, life:1, color}); }
