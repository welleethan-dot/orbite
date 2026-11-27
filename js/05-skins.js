// Orbite · Skins et boutique
// Fichiers chargés dans l'ordre de leur numéro ; ils partagent les mêmes variables.

// ---------- skins ----------
// Prices = "N runs of 50 laps" (10, 20, 50, 100, 1 000 runs) at ~14 crystals per 50-lap run.
// Mezen is a bonus skin: no price, unlocked at 92 390 laps in total.
const SKINS = [
  {id:'sonde',     name:'Sonde',     rarity:'Défaut',     price:0,     core:'#FFFFFF', glow:'#BFF3FF', trail:[191,243,255], width:5},
  {id:'comete',    name:'Comète',    rarity:'Commun',     price:140,   core:'#FFE1C2', glow:'#FF9F43', trail:[255,159,67],  width:5},
  {id:'glacier',   name:'Glacier',   rarity:'Commun',     price:280,   core:'#F0FCFF', glow:'#6FD3FF', trail:[111,211,255], width:6, ring:true},
  {id:'nebuleuse', name:'Nébuleuse', rarity:'Rare',       price:700,   core:'#F6DDFF', glow:'#C86BFF', trail:'nebula',      width:7},
  {id:'aurore',    name:'Aurore',    rarity:'Épique',     price:1400,  core:'#E4FFF4', glow:'#4DFFB5', trail:'aurora',      width:7, sparks:2},
  {id:'trounoir',  name:'Trou noir', rarity:'Légendaire', price:14000, core:'#05060F', glow:'#FFFFFF', trail:'rainbow',     width:8, disk:true, sparks:3},
  {id:'mezen',     name:'Mezen',     rarity:'Bonus',      price:0, unlockLaps:92390, core:'#FFFFFF', glow:'#FFFFFF', trail:'tie', width:6, sprite:true},
];
const RARITY_COL = {'Bonus':'#FF7AC8', 'Défaut':'#9AA3D9', 'Commun':'#C3CAEE', 'Rare':'#5AA8FF', 'Épique':'#B46BFF', 'Légendaire':'#FFB13B'};
const skin = () => SKINS.find(k => k.id === equipped) || SKINS[0];
function hexA(hex, a){ const n = parseInt(hex.slice(1), 16); return `rgba(${n>>16},${(n>>8)&255},${n&255},${a})`; }
function trailColor(sk, k, now, i = 0){
  const a = k*.6;
  if (sk.trail === 'tie') return Math.floor(i/2) % 2 ? `rgba(136,144,176,${a})` : `rgba(242,242,248,${a})`;   // striped like the tie
  if (Array.isArray(sk.trail)) return `rgba(${sk.trail[0]},${sk.trail[1]},${sk.trail[2]},${a})`;
  if (sk.trail === 'nebula'){ const r = 255 - 115*k, g = 110 - 20*k; return `rgba(${r|0},${g|0},255,${a})`; }
  if (sk.trail === 'aurora') return `hsla(${150 + 50*Math.sin(now/500 + k*4)},100%,65%,${a})`;
  return `hsla(${(now/6 + k*320) % 360},100%,65%,${a})`;                       // rainbow
}
// Mezen: pixel portrait (16 x 18), short dark hair, full beard, black suit, white shirt, striped tie.
const MEZEN = [
  '....HHHHHHHH....',
  '...HHHHHHHHHH...',
  '..HHHHhHHHHHHH..',
  '..HHSSSSSSSSHH..',
  '..HSSSSSSSSSSH..',
  '..SBBBSSSSBBBS..',
  '.NSSWESSSSEWSSN.',
  '.NSSSSSssSSSSSN.',
  '..MSSSSssSSSSM..',
  '..MSMMMMMMMMSM..',
  '..MMMSLLLLSMMM..',
  '..MMMMMMMMMMMM..',
  '...MMMMMMMMMM...',
  '....MMMMMMMM....',
  '..JJJTTTTTTJJJ..',
  '.JJJJTTKKTTJJJJ.',
  '.JJjJJTkKTJJjJJ.',
  '.JJJJJTKkTJJJJJ.',
];
const MEZEN_COL = {H:'#231A16', h:'#3D2E26', S:'#D9A582', s:'#B98060', N:'#C99272', B:'#1E1612', E:'#2A1D18', W:'#E9DDD2',
  M:'#1D1512', L:'#8E5A50', J:'#16171E', j:'#30323D', T:'#EEEEF2', K:'#111114', k:'#E8E8EC'};
function drawSprite(c, x, y, u){
  const ps = 1.6*u, w = 16*ps, h = 18*ps, x0 = Math.round(x - w/2), y0 = Math.round(y - h/2);
  const g = c.createRadialGradient(x, y, 0, x, y, 19*u);                    // soft halo so the black suit reads on space
  g.addColorStop(0, 'rgba(191,243,255,.35)'); g.addColorStop(1, 'rgba(191,243,255,0)');
  c.fillStyle = g; c.beginPath(); c.arc(x, y, 19*u, 0, TAU); c.fill();
  c.fillStyle = 'rgba(191,243,255,.75)';                                     // 1-pixel light outline
  for (let r = 0; r < 18; r++) for (let q = 0; q < 16; q++)
    if (MEZEN[r][q] !== '.') c.fillRect(x0 + (q-1)*ps, y0 + (r-1)*ps, ps*3, ps*3);
  for (let r = 0; r < 18; r++) for (let q = 0; q < 16; q++){
    const ch = MEZEN[r][q]; if (ch === '.') continue;
    c.fillStyle = MEZEN_COL[ch]; c.fillRect(x0 + q*ps, y0 + r*ps, Math.ceil(ps), Math.ceil(ps));
  }
}
// ---------- cached glows ----------
// A glow (canvas shadowBlur) is expensive to compute. Each glowing object is painted once into a small offscreen
// picture at the screen's pixel density, and that picture is copied every frame. Keyed by what changes its look.
const glowCache = new Map();
function glowSprite(key, half, paint){
  const dpr = Math.min(window.devicePixelRatio || 1, 2), k = key + '|' + dpr;
  let sp = glowCache.get(k);
  if (!sp){
    if (glowCache.size > 300) glowCache.clear();                     // many sizes seen (resizes): start over
    const cv2 = document.createElement('canvas'), px = Math.ceil(half*2*dpr);
    cv2.width = cv2.height = Math.max(1, px);
    const g = cv2.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, half*dpr, half*dpr);
    paint(g);
    sp = {img: cv2, half}; glowCache.set(k, sp);
  }
  return sp;
}
// A soft round glow only (no shape inside): shared by every object of the same colour and size, copied without
// rotation. The object itself is then drawn on top with a plain path, without any blur. Glow of a filled disc, plus,
// when `ring` > 0, the glow of its outline of that thickness (a filled and stroked shape casts both).
function haloSprite(color, radius, blur, ring){
  const r = Math.max(1, Math.round(radius)), b = Math.max(1, Math.round(blur)), dpr = Math.min(window.devicePixelRatio || 1, 2);
  return glowSprite(`halo|${color}|${r}|${b}|${ring}`, r + ring + b*1.5/dpr + 1, g => {   // shadowBlur counts screen pixels
    const far = 10000;                                    // the shape is drawn off-canvas; only its shadow lands
    g.shadowColor = color; g.shadowBlur = b; g.shadowOffsetX = far*dpr; g.fillStyle = g.strokeStyle = '#000'; g.lineWidth = ring;
    g.beginPath(); g.arc(-far, 0, r, 0, TAU); g.fill(); if (ring) g.stroke();
  });
}
// Copies a glow picture centred on (x, y). At full size it lands exactly on the screen's pixels, without smoothing:
// the cheapest copy there is, and identical to the eye (the glow is soft; it moves by less than half a pixel).
function blit(sp, x, y, f = 1, c = ctx){
  const h = sp.half*f;
  if (f !== 1){ c.drawImage(sp.img, x - h, y - h, h*2, h*2); return; }
  const d = Math.min(window.devicePixelRatio || 1, 2), px = sp.img.width/d;
  c.imageSmoothingEnabled = false;
  c.drawImage(sp.img, Math.round((x - h)*d)/d, Math.round((y - h)*d)/d, px, px);
  c.imageSmoothingEnabled = true;
}
function drawProbe(c, x, y, trail, sk, now, u){
  c.lineCap = 'round';
  for (let i = 1; i < trail.length; i++){
    const k = i/trail.length;
    c.strokeStyle = trailColor(sk, k, now, i); c.lineWidth = k*sk.width*u;
    c.beginPath(); c.moveTo(trail[i-1].x, trail[i-1].y); c.lineTo(trail[i].x, trail[i].y); c.stroke();
  }
  c.lineCap = 'butt';
  if (sk.sprite){ drawSprite(c, x, y, u); return; }
  if (sk.disk){                                   // accretion disk: rotating rainbow ring
    c.lineWidth = 3.2*u;
    for (let j = 0; j < 12; j++){
      const a0 = now/260 + j/12*TAU;
      c.strokeStyle = `hsl(${(j*30 + now/5) % 360},100%,65%)`;
      c.beginPath(); c.arc(x, y, 11*u, a0, a0 + TAU/12 + .03); c.stroke();
    }
  }
  // glowing core: drawn once into a cached picture, then copied (a live shadowBlur every frame was the costliest part)
  const r = 7*u, pad = 20*u*1.5/Math.min(window.devicePixelRatio || 1, 2) + 1, core = glowSprite(`core|${sk.core}|${sk.glow}|${u.toFixed(2)}`, r + pad, g => {
    g.shadowColor = sk.glow; g.shadowBlur = 20*u; g.fillStyle = sk.core; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
  });
  c.drawImage(core.img, x - core.half, y - core.half, core.half*2, core.half*2);
  if (sk.disk){ c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = 1.2*u; c.beginPath(); c.arc(x, y, 7*u, 0, TAU); c.stroke(); }
  else {
    c.strokeStyle = hexA(sk.glow, .5); c.lineWidth = 1.5;
    c.beginPath(); c.arc(x, y, Math.max(0, 11*u + Math.sin(now/180)*1.5*Math.min(1, u)), 0, TAU); c.stroke();
  }
  if (sk.ring){ c.strokeStyle = hexA(sk.glow, .28); c.lineWidth = 1.2; c.beginPath(); c.arc(x, y, Math.max(0, 15*u + Math.sin(now/240)*2*Math.min(1, u)), 0, TAU); c.stroke(); }
  if (sk.sparks){
    for (let j = 0; j < sk.sparks; j++){
      const a = now/240 + j/sk.sparks*TAU, r = (sk.disk ? 17 : 15)*u;
      c.fillStyle = sk.disk ? '#FFFFFF' : sk.glow;
      c.beginPath(); c.arc(x + Math.cos(a)*r, y + Math.sin(a)*r, 1.9*u, 0, TAU); c.fill();
    }
  }
}

// ---------- shop ----------
let pendingBuy = null, previewRaf = 0;
const fmtN = n => n.toLocaleString('fr-FR');
function renderShop(){
  unlockBonus();
  $('wallet').textContent = fmtN(wallet);
  const box = $('skins'); box.innerHTML = '';
  for (const sk of SKINS){
    const has = owned.includes(sk.id), on = equipped === sk.id;
    const t = document.createElement('div'); t.className = 'skin' + (on ? ' on' : ''); t.style.setProperty('--rar', RARITY_COL[sk.rarity]);
    let action, sub = '';
    if (sk.unlockLaps && !has){
      const done = Math.min(lapsTotal, sk.unlockLaps);
      action = '<button class="pill" disabled>Verrouillé</button>';
      sub = `${fmtN(done)} / ${fmtN(sk.unlockLaps)} tours cumulés<span class="bar"><i style="width:${(done/sk.unlockLaps*100).toFixed(2)}%"></i></span>`;
    }
    else if (on) action = '<button class="pill" disabled>Équipé</button>';
    else if (has) action = `<button class="pill" data-equip="${sk.id}">Équiper</button>`;
    else if (wallet >= sk.price) action = `<button class="pill buy" data-buy="${sk.id}">◆ ${fmtN(sk.price)}</button>`;
    else { action = `<button class="pill" disabled>◆ ${fmtN(sk.price)}</button>`; sub = `Il manque ◆ ${fmtN(sk.price - wallet)}`; }
    t.innerHTML = `<canvas data-skin="${sk.id}"></canvas><b>${sk.name}</b><span class="rar">${sk.rarity}</span>${action}<small>${sub}</small>`;
    box.append(t);
  }
  $('confirm').hidden = !pendingBuy;
  if (pendingBuy){ const sk = SKINS.find(k => k.id === pendingBuy); $('confirmText').textContent = `Acheter ${sk.name} pour ◆ ${fmtN(sk.price)} ?`; }
}
function previewLoop(now){
  for (const cvs of document.querySelectorAll('#skins canvas')){
    const sk = SKINS.find(k => k.id === cvs.dataset.skin), dpr = Math.min(devicePixelRatio || 1, 2);
    const w = cvs.clientWidth, h = cvs.clientHeight;
    if (!w || !h || !sk) continue;               // not laid out yet
    if (cvs.width !== Math.round(w*dpr)){ cvs.width = Math.round(w*dpr); cvs.height = Math.round(h*dpr); }
    const c = cvs.getContext('2d'); c.setTransform(dpr,0,0,dpr,0,0); c.clearRect(0,0,w,h);
    const R = Math.min(w, h)*.34, x0 = w/2, y0 = h/2, u = R/40, tr = [];
    c.strokeStyle = 'rgba(154,163,217,.18)'; c.setLineDash([3,5]); c.beginPath(); c.arc(x0, y0, R, 0, TAU); c.stroke(); c.setLineDash([]);
    const a = now/700;
    for (let i = 16; i >= 0; i--){ const b = a - i*.06; tr.push({x: x0 + Math.cos(b)*R, y: y0 + Math.sin(b)*R}); }
    drawProbe(c, tr[tr.length-1].x, tr[tr.length-1].y, tr, sk, now, sk.sprite ? u*1.4 : u);
  }
  previewRaf = $('shop').hidden ? 0 : requestAnimationFrame(previewLoop);
}
function unlockBonus(){
  for (const sk of SKINS) if (sk.unlockLaps && lapsTotal >= sk.unlockLaps && !owned.includes(sk.id)){
    owned.push(sk.id); store.set('v2.owned', owned); syncSkins(); setTimeout(() => celebrateSkin(sk.id), 300);
  }
}
function openShop(){ pendingBuy = null; renderShop(); ui.show('shop'); if (!previewRaf) previewRaf = requestAnimationFrame(previewLoop); }
$('shopBtn').addEventListener('click', openShop);
$('shopClose').addEventListener('click', () => { ui.show('menu'); ui.stats(); });
$('skins').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b || b.disabled) return;
  if (b.dataset.equip){ equipped = b.dataset.equip; store.set('v2.skin', equipped); syncSkins(); pendingBuy = null; sfx.equip(); buzz(10); renderShop(); }
  if (b.dataset.buy){ pendingBuy = b.dataset.buy; renderShop(); $('confirm').scrollIntoView({block:'nearest'}); }
});
$('confirmNo').addEventListener('click', () => { pendingBuy = null; renderShop(); });
$('confirmYes').addEventListener('click', () => {
  const sk = SKINS.find(k => k.id === pendingBuy); pendingBuy = null;
  if (sk && wallet >= sk.price && !owned.includes(sk.id)){
    wallet -= sk.price; owned.push(sk.id); equipped = sk.id;
    store.set('v2.wallet', wallet); store.set('v2.owned', owned); store.set('v2.skin', equipped);
    sfx.piggy(); buzz([10, 30, 10, 30, 40]);
    renderShop(); setTimeout(() => celebrateSkin(sk.id), 700);   // after the piggy-bank sound
    return;
  }
  renderShop();
});

// Click sound on every button of the menus (not in game). Purchases have their own sound.
document.addEventListener('click', e => {
  const b = e.target.closest('.overlay button, .tuto button'); if (!b || b.disabled || b.id === 'confirmYes') return;
  if (b.dataset.equip) return;                   // equipping has its own sound
  if (['play', 'again', 'testGo', 'resume', 'secondYes', 'trGo'].includes(b.id)) sfx.go(); else sfx.ui();
});
