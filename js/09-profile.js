// Orbite · Profil, célébration des skins, partage
// Fichiers chargés dans l'ordre de leur numéro ; ils partagent les mêmes variables.

// ---------- profile ----------
const fmtInt = n => Math.round(n || 0).toLocaleString('fr-FR');
const fmtDate = iso => { if (!iso) return ''; const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };
let animRaf = 0;
// Animated skin previews (profile avatar, unlock screen): runs while one of them is visible.
function animLoop(now){
  const jobs = [['profile', 'profAvatar', equipped, 30], ['unlock', 'unlockCv', unlockSkinId, 17], ['player', 'plAvatar', plSkin, 30]];
  let any = false;
  for (const [ov, id, skId, scale] of jobs){
    if ($(ov).hidden || !skId) continue; any = true;
    const cvs = $(id), sk = SKINS.find(k => k.id === skId), dpr = Math.min(devicePixelRatio || 1, 2), w = cvs.clientWidth, h = cvs.clientHeight;
    if (!w || !h || !sk) continue;
    if (cvs.width !== Math.round(w*dpr)){ cvs.width = Math.round(w*dpr); cvs.height = Math.round(h*dpr); }
    const c = cvs.getContext('2d'); c.setTransform(dpr,0,0,dpr,0,0); c.clearRect(0,0,w,h);
    const R = Math.min(w, h)*.34, x0 = w/2, y0 = h/2, u = R/scale*(sk.sprite ? .55 : 1), tr = [], a = now/800;   // the pixel portrait is much bigger than a probe
    c.strokeStyle = 'rgba(154,163,217,.22)'; c.setLineDash([3, 5]); c.beginPath(); c.arc(x0, y0, R, 0, TAU); c.stroke(); c.setLineDash([]);
    for (let i = 18; i >= 0; i--){ const b = a - i*.06; tr.push({x: x0 + Math.cos(b)*R, y: y0 + Math.sin(b)*R}); }
    drawProbe(c, tr[tr.length-1].x, tr[tr.length-1].y, tr, sk, now, u);
  }
  animRaf = any ? requestAnimationFrame(animLoop) : 0;
}
function startAnim(){ if (!animRaf) animRaf = requestAnimationFrame(animLoop); }
// Small static skin badge for the collection row.
function drawSkinBadge(cvs, sk){
  const dpr = Math.min(devicePixelRatio || 1, 2); cvs.width = cvs.height = Math.round(38*dpr);
  const c = cvs.getContext('2d'); c.setTransform(dpr,0,0,dpr,0,0);
  const tr = []; for (let i = 10; i >= 0; i--){ const b = -1.1 - i*.12; tr.push({x: 19 + Math.cos(b)*11, y: 22 + Math.sin(b)*11}); }
  drawProbe(c, 19, 19, sk.sprite ? [] : tr.map(p => ({x: p.x - 8, y: p.y + 6})), sk, 0, sk.sprite ? .55 : .9);
}
async function openProfile(){
  track('view', {s: 'profile'});
  unlockBonus();
  const st = store.get('v2.stats', {});
  $('profName').textContent = pseudo || 'Sans pseudo';
  $('pBest').textContent = fmtInt(best) + ' tours';
  $('pBestDate').textContent = st.bestDate && st.bestLapsSeen === best ? 'le ' + fmtDate(st.bestDate) : '';
  $('pChain').textContent = 'x' + (st.bestChain || 0);
  $('pNearRun').textContent = fmtInt(st.bestNearRun);
  $('pGemsRun').textContent = fmtInt(st.bestGemsRun) + ' ◆';
  $('pLongest').textContent = fmtTime(st.bestTime || 0).replace(/\.\d$/, '');
  $('pGames').textContent = fmtInt(games);
  $('pAvg').textContent = (games ? fmtInt(lapsTotal/games) : 0) + ' tours';
  $('pLaps').textContent = fmtInt(lapsTotal);
  $('pHops').textContent = fmtInt(st.hops);
  $('pNear').textContent = fmtInt(nearTotal);
  $('pGems').textContent = fmtInt(gemsTotal) + ' ◆';
  const box = $('pSkins'); box.replaceChildren();
  for (const sk of SKINS){ const cv = document.createElement('canvas'); cv.title = sk.name; if (!owned.includes(sk.id)) cv.className = 'off'; box.append(cv); drawSkinBadge(cv, sk); }
  $('pSkinCount').textContent = `${owned.length} / ${SKINS.length}`;
  const mz = SKINS.find(k => k.unlockLaps), done = Math.min(lapsTotal, mz.unlockLaps);
  $('pMezen').innerHTML = ''; const lab = document.createElement('span'); lab.append('Mezen : '); const bb = document.createElement('b');
  bb.textContent = owned.includes(mz.id) ? 'débloqué' : `${fmtInt(done)} / ${fmtInt(mz.unlockLaps)} tours`; lab.append(bb); $('pMezen').append(lab);
  $('pMezenBar').style.width = (owned.includes(mz.id) ? 100 : done/mz.unlockLaps*100).toFixed(2) + '%';
  $('profSince').textContent = 'Statistiques détaillées depuis le ' + fmtDate(st.since || new Date().toISOString().slice(0, 10));
  const rk = $('profRanks'); rk.replaceChildren();
  if (!pseudo){ const b = document.createElement('button'); b.className = 'pill buy'; b.textContent = 'Choisir un pseudo pour le classement'; b.addEventListener('click', () => openPseudo('menu')); rk.append(b); }
  ui.show('profile'); startAnim();
  if (pseudo){
    const span = (label, v) => { const x = document.createElement('span'); x.append(label + ' '); const b = document.createElement('b'); b.textContent = v; x.append(b); return x; };
    try {
      await flushScores();
      const [w, a] = await Promise.all([rpc('get_leaderboard', {p_sort: 'laps', p_period: 'week', p_me: playerId, p_limit: 1}), rpc('get_leaderboard', {p_sort: 'laps', p_period: 'all', p_me: playerId, p_limit: 1})]);
      const me = rows => rows.find(r => r.is_me); const mw = me(w), ma = me(a);
      rk.replaceChildren(span('Cette semaine', mw ? mw.rank + (mw.rank == 1 ? 'er' : 'e') : '—'), span('Tous les temps', ma ? ma.rank + (ma.rank == 1 ? 'er' : 'e') : '—'));
    } catch(e){ rk.replaceChildren(span('Classement', 'hors ligne')); }
  }
}
$('profileBtn').addEventListener('click', openProfile);
$('profClose').addEventListener('click', () => { ui.show('menu'); ui.stats(); });

// ---------- new skin celebration ----------
let unlockSkinId = null, unlockBack = 'shop';
function celebrateSkin(id){
  const sk = SKINS.find(k => k.id === id); if (!sk) return;
  unlockSkinId = id; unlockBack = !$('shop').hidden ? 'shop' : 'menu';
  $('unlockName').textContent = sk.name;
  const r = $('unlockRar'); r.textContent = sk.rarity; r.style.color = r.style.borderColor = RARITY_COL[sk.rarity];
  ui.show('unlock'); startAnim(); buzz([10, 40, 10]);
}
$('unlockClose').addEventListener('click', () => { if (unlockBack === 'shop'){ renderShop(); ui.show('shop'); if (!previewRaf) previewRaf = requestAnimationFrame(previewLoop); } else ui.show('menu'); });
$('unlockShare').addEventListener('click', () => openShare('skin', {skin: unlockSkinId}, 'unlock'));

// ---------- sharing ----------
// A picture of the run (or of the new skin) is drawn first and previewed; the second tap opens the phone's
// share sheet (it has to happen directly inside a tap on iPhone). Without a share sheet: copy the text.
const GAME_URL = 'https://welleethan-dot.github.io/orbite/';
let shareFile = null, shareText = '', shareBack = 'over', shareUrl = null;
if (!CanvasRenderingContext2D.prototype.roundRect){                  // older iPhones
  CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r){
    this.moveTo(x + r, y); this.arcTo(x + w, y, x + w, y + h, r); this.arcTo(x + w, y + h, x, y + h, r);
    this.arcTo(x, y + h, x, y, r); this.arcTo(x, y, x + w, y, r); this.closePath();
  };
}
async function shareImage(kind, d){
  try { await Promise.all([document.fonts.load('800 100px Unbounded'), document.fonts.load('700 40px "JetBrains Mono"')]); } catch(e){}
  const W = 1080, H = 1350, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d');
  const rec = kind === 'run' && d.record, gold = '#FFD66B', accent = kind === 'skin' ? RARITY_COL[SKINS.find(k => k.id === d.skin).rarity] : rec ? gold : COL.ion;
  const bg = c.createRadialGradient(W/2, H*.42, 0, W/2, H*.42, H*.8); bg.addColorStop(0, rec ? '#2A2350' : COL.void2); bg.addColorStop(1, COL.void);
  c.fillStyle = bg; c.fillRect(0, 0, W, H);
  let seed = 11; const rnd = () => (seed = (seed*16807) % 2147483647)/2147483647;
  for (let i = 0; i < 160; i++){ c.globalAlpha = .2 + rnd()*.6; c.fillStyle = COL.ion; c.beginPath(); c.arc(rnd()*W, rnd()*H, rnd()*2.4 + .4, 0, TAU); c.fill(); }
  c.globalAlpha = 1;
  if (rec){                                        // record: golden rays and confetti
    c.save(); c.translate(W/2, 520);
    for (let i = 0; i < 24; i++){ c.rotate(TAU/24); const g = c.createLinearGradient(0, 0, 0, -700); g.addColorStop(0, 'rgba(255,214,107,.22)'); g.addColorStop(1, 'rgba(255,214,107,0)'); c.fillStyle = g; c.beginPath(); c.moveTo(-26, 0); c.lineTo(26, 0); c.lineTo(0, -700); c.fill(); }
    c.restore();
    for (let i = 0; i < 70; i++){ c.save(); c.translate(rnd()*W, rnd()*H*.75); c.rotate(rnd()*TAU); c.fillStyle = ['#FFD66B','#F2A541','#BFF3FF','#FF7AC8'][i % 4]; c.globalAlpha = .75; c.fillRect(-7, -3, 14, 6); c.restore(); }
    c.globalAlpha = 1;
  }
  // frame
  c.strokeStyle = hexA(accent, rec || kind === 'skin' ? .9 : .35); c.lineWidth = rec ? 10 : 4; c.beginPath(); c.roundRect(36, 36, W - 72, H - 72, 48); c.stroke();
  c.textAlign = 'center'; c.textBaseline = 'alphabetic';
  // title
  const tg = c.createLinearGradient(0, 120, 0, 210); tg.addColorStop(0, COL.ion); tg.addColorStop(1, COL.mist);
  c.fillStyle = tg; c.font = '800 96px Unbounded, sans-serif'; c.fillText('ORBITE', W/2, 200);
  // orbit scene
  const cx = W/2, cy = kind === 'skin' ? 640 : 560, R = 230;
  c.lineWidth = 3; c.setLineDash([10, 18]); c.strokeStyle = 'rgba(154,163,217,.35)';
  for (const r of [R/1.55, R]){ c.beginPath(); c.arc(cx, cy, r, 0, TAU); c.stroke(); }
  c.setLineDash([]);
  const sk = SKINS.find(k => k.id === (kind === 'skin' ? d.skin : equipped)) || SKINS[0];
  if (kind === 'skin'){                              // the skin is the star: big, alone on its orbit
    const halo = c.createRadialGradient(cx, cy, 0, cx, cy, 260); halo.addColorStop(0, hexA(accent, .28)); halo.addColorStop(1, hexA(accent, 0));
    c.fillStyle = halo; c.beginPath(); c.arc(cx, cy, 260, 0, TAU); c.fill();
    const tr = []; for (let i = 0; i <= 26; i++){ const t = i/26; tr.push({x: cx - 400*(1 - t), y: cy - 170*(1 - t)*(1 - t)}); }   // trail sweeping in from the left
    drawProbe(c, cx, cy, tr, sk, 1200, sk.sprite ? 9 : 11);
  } else {
    const pg = c.createRadialGradient(cx - 30, cy - 34, 8, cx, cy, 88); pg.addColorStop(0, '#FFE2A8'); pg.addColorStop(.45, COL.sun); pg.addColorStop(1, '#B4482A');
    c.fillStyle = pg; c.beginPath(); c.arc(cx, cy, 86, 0, TAU); c.fill();
    const tr = []; for (let i = 22; i >= 0; i--){ const b = -.75 - i*.07; tr.push({x: cx + Math.cos(b)*R, y: cy + Math.sin(b)*R}); }
    drawProbe(c, tr[tr.length-1].x, tr[tr.length-1].y, tr, sk, 1200, sk.sprite ? 4.2 : 3.4);
  }
  if (kind === 'run'){
    c.fillStyle = COL.void; c.font = '800 64px Unbounded, sans-serif'; c.textBaseline = 'middle'; c.fillText(String(d.laps), cx, cy + 4); c.textBaseline = 'alphabetic';
    if (rec){ c.fillStyle = gold; c.font = '800 54px Unbounded, sans-serif'; c.fillText('NOUVEAU RECORD', W/2, 900); }
    c.fillStyle = rec ? gold : COL.ion; c.font = '800 150px Unbounded, sans-serif'; c.fillText(String(d.laps), W/2, rec ? 1050 : 990);
    c.fillStyle = COL.mist; c.font = '700 40px "JetBrains Mono", monospace'; c.fillText('TOURS', W/2, rec ? 1100 : 1045);
    const bits = [d.gems + ' ◆'];
    if (d.chain > 1) bits.push('série x' + d.chain);
    if (d.rank) bits.push(d.rank + (d.rank == 1 ? 'er' : 'e') + ' cette semaine');
    c.fillStyle = COL.ion; c.font = '700 36px "JetBrains Mono", monospace'; c.fillText(bits.join('  ·  '), W/2, rec ? 1165 : 1120);
    if (pseudo){ c.fillStyle = COL.mist; c.font = '500 32px "JetBrains Mono", monospace'; c.fillText('par ' + pseudo, W/2, rec ? 1215 : 1175); }
  } else {
    c.fillStyle = gold; c.font = '800 50px Unbounded, sans-serif'; c.fillText('NOUVEAU SKIN', W/2, 330);
    c.fillStyle = COL.ion; c.font = '800 110px Unbounded, sans-serif'; c.fillText(sk.name, W/2, 1010);
    c.font = '700 40px "JetBrains Mono", monospace'; const label = sk.rarity.toUpperCase(), tw = c.measureText(label).width + 60;
    c.strokeStyle = accent; c.lineWidth = 4; c.beginPath(); c.roundRect(W/2 - tw/2, 1045, tw, 70, 35); c.stroke();
    c.fillStyle = accent; c.fillText(label, W/2, 1094);
    if (pseudo){ c.fillStyle = COL.mist; c.font = '500 32px "JetBrains Mono", monospace'; c.fillText('débloqué par ' + pseudo, W/2, 1170); }
  }
  c.fillStyle = COL.sun; c.font = '700 34px "JetBrains Mono", monospace'; c.fillText('welleethan-dot.github.io/orbite', W/2, H - 80);
  return await new Promise(res => cv.toBlob(res, 'image/png'));
}
async function openShare(kind, d, back){
  shareBack = back; $('shareGo').disabled = true; $('shareHint').textContent = 'Préparation de l\'image…';
  if (shareUrl){ URL.revokeObjectURL(shareUrl); shareUrl = null; }
  $('shareImg').removeAttribute('src'); ui.show('sharebox');
  const blob = await shareImage(kind, d);
  shareFile = new File([blob], kind === 'skin' ? 'orbite-skin.png' : 'orbite-partie.png', {type: 'image/png'});
  shareUrl = URL.createObjectURL(blob); $('shareImg').src = shareUrl;
  if (kind === 'skin'){ const sk = SKINS.find(k => k.id === d.skin); shareText = `J'ai débloqué le skin ${sk.name} (${sk.rarity}) sur Orbite ! ${GAME_URL}`; }
  else shareText = d.record ? `Nouveau record sur Orbite : ${d.laps} tours ! Tu fais mieux ? ${GAME_URL}` : `J'ai fait ${d.laps} tours sur Orbite. Tu fais mieux ? ${GAME_URL}`;
  const canFiles = !!(navigator.canShare && navigator.canShare({files: [shareFile]}));
  $('shareGo').hidden = !navigator.share; $('shareGo').disabled = false;
  $('shareHint').textContent = navigator.share ? (canFiles ? '' : 'Votre appareil partagera le texte et le lien.') : 'Le partage n\'est pas disponible ici : appui long sur l\'image pour l\'enregistrer, ou copiez le texte.';
}
$('shareGo').addEventListener('click', async () => {
  const data = {text: shareText};
  if (shareFile && navigator.canShare && navigator.canShare({files: [shareFile]})) data.files = [shareFile]; else data.url = GAME_URL;
  try { await navigator.share(data); } catch(e){}
});
$('shareCopy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(shareText); $('shareHint').textContent = 'Texte copié.'; }
  catch(e){ $('shareHint').textContent = shareText; }
});
$('shareClose').addEventListener('click', () => { if (shareBack === 'unlock'){ ui.show('unlock'); startAnim(); } else ui.show(shareBack); });
$('shareRun').addEventListener('click', () => openShare('run', {laps: S.laps, gems: S.shards, chain: S.bestChain || 0, record: !$('newBest').hidden, rank: lastRunRank}, 'over'));
