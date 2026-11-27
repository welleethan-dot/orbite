// Orbite · Commandes, mise à jour, dessin, boucle du jeu
// Fichiers chargés dans l'ordre de leur numéro ; ils partagent les mêmes variables.

// ---------- input ----------
cv.addEventListener('pointerdown', e => { e.preventDefault(); if (mode === 'play') hop(); });
addEventListener('keydown', e => {
  if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'ArrowDown'){
    e.preventDefault();
    if (mode === 'play') hop(); else if (mode === 'menu') playPressed(); else if (mode === 'over') start(); else if (mode === 'paused') resume();
  } else if (e.code === 'KeyP' || e.code === 'Escape'){ mode === 'play' ? pause() : resume(); }
});
$('play').addEventListener('click', playPressed);
$('again').addEventListener('click', start);
$('resume').addEventListener('click', resume);
$('pauseBtn').addEventListener('click', pause);
$('mute').addEventListener('click', () => { muted = !muted; store.set('muted', muted); ui.muteIcon(); if (!muted) sfx.lap(); });
$('clock').hidden = !settings.clock;
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

// ---------- update ----------
function pos(a = S.a, r = S.r){ return {x: cx + Math.cos(a)*r, y: cy + Math.sin(a)*r}; }

function update(dt){
  if (mode === 'play'){
    S.t += dt; S.campT += dt; if (S.shield > 0) S.shield -= dt;   // second chance: a moment without collisions
    S.omega = S.tuto ? 1.3 : omegaAt(S.t);           // the tutorial runs slowly
    if (!S.tuto){ const ct = fmtTime(S.t); if (ct !== S.clockShown){ S.clockShown = ct; $('clock').textContent = ct; } }
    const da = S.omega*dt; S.a += S.dir*da; S.lapAcc += da;
    if (S.lapAcc >= TAU){ S.lapAcc -= TAU; S.laps++; S.pulse = 1; sfx.lap(); ui.score();
      if (S.laps % 5 === 0) S.gemDue++;
      if (!testRun && !S.tuto && best > 0 && S.laps === best + 1) { banner('Nouveau record', EVENT_COL.record, 1, 1.2); buzz([70, 50, 15, 40, 15]); }   // victory: long, then two taps
      if (S.laps % 7 === 0 || (S.hard && S.laps === 15)) shootingStars(); // lap 15: only in a hard run
      if (S.laps === 40) { calmSky(CALM_TIME); banner('Astéroïdes rapides', EVENT_COL.fast, 2, 1.2); buzz([12, 40, 12, 40, 12]); }   // three quick taps
      if (S.laps >= 50 && S.laps < CHAOS_LAP && (S.laps - 50) % 8 === 0) flipWarn(1.6);
      if (S.laps > CHAOS_LAP && S.laps >= S.nextFlip){ flipWarn(CHAOS_WARN); S.nextFlip = S.laps + chaosGap(); }   // from lap 200: sooner, at random
      if (S.laps === 30){ S.storm = true; calmSky(CALM_TIME); banner('Pluie d’astéroïdes', EVENT_COL.rain, 1, 1.2); buzz([30,50,30]); }
      if (S.laps === CHAOS_LAP){ calmSky(CALM_TIME); S.nextFlip = S.laps + chaosGap(); banner('Inversions folles', EVENT_COL.chaos, 3, 1.6); buzz([20, 30, 20, 30, 20, 30, 20]); }
      if (PALIER_BONUS[S.laps] && !S.tuto) palierBonus(PALIER_BONUS[S.laps]);
    }
    S.r += (lanes[S.lane] - S.r) * Math.min(1, dt*40);

    // reversal warning: nothing new spawns, then the field is cleared and the direction flips
    if (S.revWarn > 0){
      S.revWarn -= dt; S.spawnT = Math.max(S.spawnT, .1); S.gemTry = 0;
      if (S.revWarn <= 0) reverse();
    }
    // respite before a new stage (2.4): the sky was cleared, nothing new arrives while the title is read
    if (S.calm > 0){ S.calm -= dt; S.spawnT = Math.max(S.spawnT, .1); S.gemTry = 0; }
    if (S.tuto) tutoUpdate(dt); else {
    S.spawnT -= dt;
    if (S.spawnT <= 0){ const lane = pickLane(); // if a spot is refused (it would block both orbits), try other spots on the same orbit
      const ok = spawnRocks(lane) || spawnRocks(lane) || spawnRocks(lane) || spawnRocks(lane); S.spawnT = ok ? Math.max(.38, 1.15 - S.t*0.017) * (S.hard ? .82 : 1) * (S.storm ? .65 : 1) * (0.75 + Math.random()*.5) : .1; }
    // Crystals: one every 5 laps. Rare ones (worth 3): 2 in 4 in a normal run, 3 in 4 in a hard run.
    if (S.gemDue > 0 && S.revWarn <= 0 && !(S.calm > 0)){
      S.gemTry += dt;
      if (S.gemTry >= .15){
        S.gemTry = 0; S.gemWait += .15;
        const n = S.gemCount + 1;
        const rare = (S.hard ? n % 4 !== 1 : n % 2 === 0) && S.gemWait < 4;  // a rare one waits up to 4 s for a rock to tuck against
        if (rare ? spawnHardGem() : spawnGem()){ S.gemDue--; S.gemCount++; S.gemWait = 0; }
      }
    }
    }

    const p = pos();
    S.trail.push({x:p.x, y:p.y}); if (S.trail.length > 22) S.trail.shift();

    for (const o of S.rocks){
      o.rot += o.vr*dt;
      if (o.w){
        o.a -= S.dir*o.w*dt;
        o.meet = o.passed ? o.a : S.a + S.dir*ahead(o.a)*S.omega/(S.omega + o.w);
      }
      const op = pos(o.a, lanes[o.lane]);
      const fade = Math.min(1, (S.t - o.born)/.35);
      const d = hypot(op.x-p.x, op.y-p.y), hitR = o.size*.8 + 6*unit;
      if (!o.passed && !o.ghost && fade > .6 && d < hitR && !(S.shield > 0)){ if (S.tuto) tutoHit(); else gameOver(); break; }
      if (!o.passed && !o.ghost && fade > .6) o.minD = Math.min(o.minD ?? 1e9, d - hitR);   // closest it came, edge to edge
      const ah = ahead(o.a);
      if (!o.passed && ah > o.prev + Math.PI){ o.passed = true; if (o.nearArmed || (o.minD !== undefined && o.minD < NEAR_GAP*unit)) nearMiss(o); }
      o.prev = ah;
    }
    S.rocks = S.rocks.filter(o => !(o.passed && ahead(o.a) < 5.4));
    for (const g of S.gems){
      const gp = pos(g.a, lanes[g.lane]);
      if (!g.got && hypot(gp.x-p.x, gp.y-p.y) < 18*unit){
        g.got = true; S.shards += g.val; ui.score(); sfx.shard(); buzz(g.hard ? [12,30,12] : 12);
        burst(gp.x, gp.y, COL.shard, g.hard ? 28 : 16, g.hard ? 200 : 140); popup('+' + g.val, gp.x, gp.y, COL.shard);
      }
      const ah = ahead(g.a); if (ah > g.prev + Math.PI) g.passed = true; g.prev = ah;
    }
    S.gems = S.gems.filter(g => !g.got && !g.passed);
  } else if (mode === 'dying' || mode === 'over' || mode === 'offer'){
    S.deadT += dt;
    if (mode === 'offer'){
      S.offerT -= dt; $('secondBar').style.width = Math.max(0, S.offerT/REVIVE_WAIT*100) + '%';
      if (S.offerT <= 0) declineRevive();
    }
  } else if (mode === 'menu'){
    // idle demo orbit behind the menu
    S.t += dt; S.a += 1.1*dt; S.r += (lanes[S.lane] - S.r)*Math.min(1, dt*10);
    if (Math.sin(S.t*0.9) > 0 !== (S.lane === 1)) S.lane = 1 - S.lane;
    const p = pos(); S.trail.push({x:p.x, y:p.y}); if (S.trail.length > 22) S.trail.shift();
  }
  if (mode !== 'paused'){
    for (const m of S.meteors){ m.age += dt; if (m.age > 0){ m.x += m.vx*dt; m.y += m.vy*dt; } }
    S.meteors = S.meteors.filter(m => m.age < m.life);
    for (const q of S.parts){ q.x += q.vx*dt; q.y += q.vy*dt; q.vx *= .96; q.vy *= .96; q.life -= q.decay*dt; }
    S.parts = S.parts.filter(q => q.life > 0);
    for (const u of S.popups){ u.y -= 40*dt*unit; u.life -= dt*1.4; }
    S.popups = S.popups.filter(u => u.life > 0);
    S.shake = Math.max(0, S.shake - dt*2.2);
    S.pulse = Math.max(0, S.pulse - dt*2);
    S.nearFlash = Math.max(0, (S.nearFlash || 0) - dt*2.5);
    if (fx){ fx.t += dt; if (fx.t >= fx.dur && !fx.hold) fx = null; }
  }
}

// ---------- draw ----------
let starRot = 0;
// The deep-space background gradient covers the whole screen: painted once per screen size, then copied each frame.
let bgCache = null;
function blitBackground(){
  const key = `${W}|${H}|${DPR}|${cx}|${cy}`;
  if (!bgCache || bgCache.key !== key){
    const c2 = bgCache && bgCache.img || document.createElement('canvas');
    c2.width = Math.round(W*DPR); c2.height = Math.round(H*DPR);
    const g = c2.getContext('2d'); g.setTransform(DPR, 0, 0, DPR, 0, 0);
    const bg = g.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W,H)*.75);
    bg.addColorStop(0, COL.void2); bg.addColorStop(1, COL.void);
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    bgCache = {key, img: c2};
  }
  ctx.imageSmoothingEnabled = false; ctx.drawImage(bgCache.img, 0, 0, W, H); ctx.imageSmoothingEnabled = true;
}
function draw(now){
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);          // re-applied every frame (lost if the canvas is reset)
  ctx.save();
  blitBackground();

  if (S.shake > 0 && !calmFx()){ const k = S.shake*S.shake*10*unit; ctx.translate((Math.random()-.5)*k, (Math.random()-.5)*k); }

  // stars
  starRot += reduceMotion ? 0 : 0.0006;
  const sr = Math.hypot(W, H)*.6;
  for (const s of stars){
    const a = s.a + starRot, x = cx + Math.cos(a)*s.d*sr, y = cy + Math.sin(a)*s.d*sr;
    if (x < -2 || x > W+2 || y < -2 || y > H+2) continue;
    ctx.globalAlpha = .35 + .35*Math.sin(now/900 + s.tw);
    ctx.fillStyle = COL.ion; ctx.fillRect(x, y, s.s, s.s);
  }
  ctx.globalAlpha = 1;

  // shooting stars (behind everything else)
  for (const m of S.meteors){
    if (m.age <= 0) continue;
    const k = m.age / m.life, alpha = Math.sin(Math.PI*k)*0.55;
    const sp = Math.hypot(m.vx, m.vy), tl = m.len*Math.min(1, m.age/0.15);
    const tx = m.x - m.vx/sp*tl, ty = m.y - m.vy/sp*tl;
    const gr = ctx.createLinearGradient(tx, ty, m.x, m.y);
    gr.addColorStop(0, 'rgba(191,243,255,0)'); gr.addColorStop(1, `rgba(191,243,255,${alpha})`);
    ctx.strokeStyle = gr; ctx.lineWidth = 1.4*unit; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(m.x, m.y); ctx.stroke();
    ctx.globalAlpha = alpha; ctx.fillStyle = '#FFFFFF';
    ctx.beginPath(); ctx.arc(m.x, m.y, 1.3*unit, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.lineCap = 'butt';

  // lanes
  const lit = fxLevel();
  ctx.lineWidth = 1.2 + 2.6*lit*unit;
  for (let i=0;i<2;i++){
    ctx.strokeStyle = lit > 0 ? hexA(fx.color, .3 + .65*lit)
      : i === S.lane && mode === 'play' ? 'rgba(191,243,255,.32)' : 'rgba(154,163,217,.16)';
    ctx.setLineDash([3*unit, 7*unit]);
    ctx.beginPath(); ctx.arc(cx, cy, lanes[i], 0, TAU); ctx.stroke();
  }
  ctx.setLineDash([]);

  // planet
  const planet = glowSprite(`planet|${R0.toFixed(2)}`, R0*2.2, g => {   // never changes: painted once, then copied
    const pr = R0;
    const halo = g.createRadialGradient(0, 0, pr*.8, 0, 0, pr*2.2);
    halo.addColorStop(0, 'rgba(242,165,65,.28)'); halo.addColorStop(1, 'rgba(242,165,65,0)');
    g.fillStyle = halo; g.beginPath(); g.arc(0, 0, pr*2.2, 0, TAU); g.fill();
    const pg = g.createRadialGradient(-pr*.35, -pr*.4, pr*.1, 0, 0, pr);
    pg.addColorStop(0, '#FFE2A8'); pg.addColorStop(.45, COL.sun); pg.addColorStop(1, '#B4482A');
    g.fillStyle = pg; g.beginPath(); g.arc(0, 0, pr, 0, TAU); g.fill();
    g.save(); g.beginPath(); g.arc(0, 0, pr, 0, TAU); g.clip();
    g.strokeStyle = 'rgba(120,40,20,.25)'; g.lineWidth = pr*.12;
    for (let k=-2;k<=2;k++){ g.beginPath(); g.ellipse(0, k*pr*.33, pr*1.2, pr*.12, -.18, 0, TAU); g.stroke(); }
    g.restore();
  });
  blit(planet, cx, cy, 1 + S.pulse*.06);
  // lap counter on the planet
  if (mode === 'play' || mode === 'dying' || mode === 'offer'){
    ctx.fillStyle = 'rgba(10,12,34,.75)'; ctx.font = `700 ${Math.round(13*unit)}px "JetBrains Mono", monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(S.laps), cx, cy);
  }

  // gems
  for (const g of S.gems){
    const p = pos(g.a, lanes[g.lane]), f = Math.min(1, (S.t - g.born)/.4), s = 8*unit*f, sp = g.spin + now/400;
    const S8 = 8*unit, gem = glowSprite(`gem|${unit.toFixed(3)}`, S8*1.3 + 14*unit*1.5/DPR + 1, c => {   // one shared picture, turned
      c.shadowColor = COL.shard; c.shadowBlur = 14*unit; c.fillStyle = COL.shard; c.beginPath();
      c.moveTo(0, -S8*1.3); c.lineTo(S8*.8, 0); c.lineTo(0, S8*1.3); c.lineTo(-S8*.8, 0); c.closePath(); c.fill();
    });
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(sp); ctx.scale(f, f);
    ctx.drawImage(gem.img, -gem.half, -gem.half, gem.half*2, gem.half*2);
    ctx.restore();
    if (g.hard){ // rare crystal: pulsing double ring
      ctx.strokeStyle = COL.shard; ctx.lineWidth = 1.5*unit;
      ctx.globalAlpha = .5 + .4*Math.sin(now/150);
      ctx.beginPath(); ctx.arc(p.x, p.y, (15 + 2*Math.sin(now/150))*unit*f, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  // rocks
  for (const o of S.rocks){
    const p = pos(o.a, lanes[o.lane]), f = Math.min(1, (S.t - o.born)/.35), s = o.size*f;
    if (o.w && !o.passed){ // rushing rock: fading red streak behind it, along its orbit
      ctx.lineCap = 'round'; ctx.lineWidth = o.size*.9*f;
      for (let i = 1; i <= 5; i++){
        const a0 = o.a + S.dir*(i-1)*.07, a1 = o.a + S.dir*i*.07;
        ctx.strokeStyle = `rgba(255,77,109,${.24*(1 - i/6)})`;
        ctx.beginPath(); ctx.arc(cx, cy, lanes[o.lane], Math.min(a0,a1), Math.max(a0,a1)); ctx.stroke();
      }
      ctx.lineCap = 'butt';
    }
    const fadeOut = o.passed ? .45 : 1;
    // glow: one shared picture under the rock; the faint glow just inside its outline is a gradient in the fill
    const R = o.size*.88, halo = haloSprite(COL.rock, R, 16*unit, Math.round(2*unit)), hz = halo.half*f, inner = 16*unit*1.6/DPR;
    ctx.globalAlpha = fadeOut;
    blit(halo, p.x, p.y, f);
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(o.rot); ctx.scale(f, f);
    if (!o.fill || o.fillUnit !== unit){
      o.fillUnit = unit; o.fill = ctx.createRadialGradient(0, 0, Math.max(0, R - inner), 0, 0, R);
      o.fill.addColorStop(0, '#3A1630'); o.fill.addColorStop(.5, '#4B1B3A'); o.fill.addColorStop(1, '#63213C');
    }
    ctx.fillStyle = o.fill; ctx.strokeStyle = COL.rock; ctx.lineWidth = 2*unit/f;
    ctx.beginPath();
    o.shape.forEach((v,i) => { const x = Math.cos(v.a)*v.r*o.size, y = Math.sin(v.a)*v.r*o.size; i ? ctx.lineTo(x,y) : ctx.moveTo(x,y); });
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore(); ctx.globalAlpha = 1;
  }

  // trail + probe
  if (!S.dead){
    const p = pos();
    if (S.shield > 0) ctx.globalAlpha = .45 + .4*Math.sin(now/(calmFx() ? 160 : 70));   // second chance: the probe flickers
    drawProbe(ctx, p.x, p.y, S.trail, skin(), now, unit);
    ctx.globalAlpha = 1;
    if (S.nearFlash > 0){                          // near miss: a white ring bursting out of the probe
      ctx.strokeStyle = `rgba(255,255,255,${S.nearFlash})`; ctx.lineWidth = 2.5*unit*S.nearFlash;
      ctx.beginPath(); ctx.arc(p.x, p.y, (12 + (1 - S.nearFlash)*26)*unit, 0, TAU); ctx.stroke();
    }
  }

  // particles
  for (const q of S.parts){ ctx.globalAlpha = Math.max(0, q.life); ctx.fillStyle = q.color; ctx.beginPath(); ctx.arc(q.x, q.y, q.s, 0, TAU); ctx.fill(); }
  ctx.globalAlpha = 1;
  // popups
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const u of S.popups){ ctx.globalAlpha = Math.max(0, u.life); ctx.fillStyle = u.color; ctx.font = `800 ${Math.round(18*unit)}px Unbounded, sans-serif`; ctx.fillText(u.text, u.x, u.y - 16*unit); }
  ctx.globalAlpha = 1;
  ctx.restore();
  // event light on the screen edges
  const glow = fxLevel();
  if (glow > 0){
    const e = Math.min(W, H) * .16, c0 = hexA(fx.color, .5*glow), c1 = hexA(fx.color, 0);
    for (const [x0, y0, x1, y1, rx, ry, rw, rh] of [[0,0,0,e, 0,0,W,e], [0,H,0,H-e, 0,H-e,W,e], [0,0,e,0, 0,0,e,H], [W,0,W-e,0, W-e,0,e,H]]){
      const g = ctx.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, c0); g.addColorStop(1, c1);
      ctx.fillStyle = g; ctx.fillRect(rx, ry, rw, rh);
    }
  }
}

// ---------- loop ----------
let last = performance.now();
function frame(now){
  const dt = Math.min(.05, (now - last)/1000); last = now;
  update(dt); draw(now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
try { navigator.wakeLock && navigator.wakeLock.request('screen').catch(()=>{}); } catch(e){}
