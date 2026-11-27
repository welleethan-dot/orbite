// Orbite · Classement en ligne (Supabase), pseudo
// Fichiers chargés dans l'ordre de leur numéro ; ils partagent les mêmes variables.

// ---------- online leaderboard (Supabase) ----------
// The game only calls 3 server functions; every check is done on the server (see supabase/schema.sql).
// The publishable key is public by design: the tables themselves are closed to it.
const SUPA_URL = 'https://gnltdkmweifqfceapwws.supabase.co', SUPA_KEY = 'sb_publishable_EUpYNzgX8BLXItnegCevXw_oPxFBuIz';
async function rpc(fn, args){
  let r;
  try { r = await fetch(`${SUPA_URL}/rest/v1/rpc/${fn}`, {method: 'POST', headers: {apikey: SUPA_KEY, 'Content-Type': 'application/json'}, body: JSON.stringify(args)}); }
  catch(e){ const err = new Error('reseau'); err.code = 'reseau'; throw err; }
  const j = await r.json().catch(() => null);
  if (!r.ok){ const err = new Error('erreur'); err.code = (j && j.message) || 'reseau'; throw err; }
  return j;
}
function newId(){
  try { return crypto.randomUUID(); } catch(e){}
  const b = crypto.getRandomValues(new Uint8Array(16)); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}
let playerId = store.get('v2.pid', null); if (!playerId){ playerId = newId(); store.set('v2.pid', playerId); }
let pseudo = store.get('v2.pseudo', null);
let pending = store.get('v2.pending', []);      // runs not sent yet (no pseudo yet, or no connection)
let flushing = null;

function queueScore(){
  pending.push({l: S.laps, d: Math.round(S.t*10)/10, g: S.shards, c: S.bestChain || 0});
  pending = pending.slice(-20); store.set('v2.pending', pending);
  flushScores();
}
// Send waiting runs one by one (the server accepts one run every 3 s per player).
function flushScores(){
  if (flushing) return flushing;
  if (!pseudo || !pending.length) return Promise.resolve();
  flushing = (async () => {
    while (pending.length){
      const s = pending[0];
      try { await rpc('submit_score', {p_id: playerId, p_laps: s.l, p_duration: s.d, p_gems: s.g, p_best_chain: s.c, p_version: APP_VERSION}); }
      catch(e){
        if (e.code === 'reseau'){ break; }                                   // offline: retry later
        if (e.code === 'trop_rapide'){ await new Promise(r => setTimeout(r, 3300)); continue; }
        if (e.code === 'joueur_inconnu'){ pseudo = null; store.set('v2.pseudo', null); break; }
        // score_impossible or anything else: this run is dropped
      }
      pending.shift(); store.set('v2.pending', pending);
      if (pending.length) await new Promise(r => setTimeout(r, 3300));
    }
  })().finally(() => { flushing = null; });
  return flushing;
}
addEventListener('online', () => flushScores());
document.addEventListener('visibilitychange', () => { if (!document.hidden) flushScores(); });
setTimeout(flushScores, 1500);

// End of a run: rank of the week, or an invitation to pick a pseudo.
let lastRunRank = null;
async function showOverRank(){
  lastRunRank = null;
  const out = $('overRank'), ask = $('overPseudo');
  out.hidden = true; ask.hidden = true;
  if (testRun) return;
  if (!pseudo){ ask.hidden = false; return; }
  await flushScores();
  if (pending.length){ out.textContent = 'Partie enregistrée : elle sera envoyée au classement dès que vous serez en ligne.'; out.hidden = false; return; }
  try {
    const rows = await rpc('get_leaderboard', {p_sort: 'laps', p_period: 'week', p_me: playerId, p_limit: 1});
    const me = rows.find(r => r.is_me);
    if (me) lastRunRank = me.rank;
    if (me && mode === 'over'){ out.textContent = `${me.rank}${me.rank == 1 ? 'er' : 'e'} du classement cette semaine`; out.hidden = false; }
  } catch(e){}
}

// ----- pseudo -----
let pseudoBack = 'menu', pinfo = null, pseudoConfirm = false;   // pinfo: {pseudo, changes_left, next_reset}
const MONTHS = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
const fmtReset = iso => { const [y, m, d] = iso.split('-').map(Number); return (d === 1 ? '1er' : d) + ' ' + MONTHS[m - 1]; };
const changesText = n => n === 0 ? 'Plus de changement possible ce mois-ci' : `${n} changement${n > 1 ? 's' : ''} restant${n > 1 ? 's' : ''} ce mois-ci`;
async function loadPlayerInfo(){ if (!pseudo) return null; try { pinfo = await rpc('player_info', {p_id: playerId}); } catch(e){} return pinfo; }
const PSEUDO_ERR = {
  pseudo_invalide: "De 3 à 16 caractères : lettres, chiffres, espace, point, tiret ou _.",
  pseudo_interdit: "Ce pseudo n'est pas autorisé. Choisissez-en un autre.",
  pseudo_pris: "Ce pseudo est déjà pris. Choisissez-en un autre.",
  pseudo_limite: "Vous avez déjà changé 3 fois de pseudo ce mois-ci.",
  reseau: "Pas de connexion. Réessayez quand vous serez en ligne.",
};
function openPseudo(back){
  pseudoBack = back; $('pseudoInput').value = pseudo || ''; $('pseudoErr').textContent = '';
  pseudoConfirm = false; $('pseudoOk').textContent = 'VALIDER';
  $('pseudoInfo').textContent = pseudo && pinfo ? changesText(pinfo.changes_left) + ' (le premier pseudo ne compte pas).' : '';
  ui.show('pseudoBox'); setTimeout(() => { try { $('pseudoInput').focus(); } catch(e){} }, 50);
}
async function submitPseudo(){
  const v = $('pseudoInput').value.replace(/\s+/g, ' ').trim();
  if (!/^[A-Za-z0-9À-ÖØ-öø-ÿ _.\-]{3,16}$/.test(v)){ $('pseudoErr').textContent = PSEUDO_ERR.pseudo_invalide; return; }
  // Changing an existing pseudo: ask for confirmation first (3 changes a month).
  if (pseudo && v !== pseudo && !pseudoConfirm){
    const left = pinfo ? pinfo.changes_left : null;
    if (left === 0){ $('pseudoErr').textContent = PSEUDO_ERR.pseudo_limite + (pinfo ? ` Prochain changement possible le ${fmtReset(pinfo.next_reset)}.` : ''); return; }
    pseudoConfirm = true; $('pseudoOk').textContent = 'CONFIRMER';
    $('pseudoInfo').textContent = `Changer de pseudo ? « ${pseudo} » s'affichera comme ancien pseudo pendant 30 jours.` + (left != null ? ` Il vous restera ${left - 1} changement${left - 1 > 1 ? 's' : ''} ce mois-ci.` : '');
    return;
  }
  $('pseudoOk').disabled = true; $('pseudoErr').textContent = '';
  try {
    pseudo = await rpc('set_pseudo', {p_id: playerId, p_pseudo: v}); store.set('v2.pseudo', pseudo); await loadPlayerInfo(); syncSkins();
    sfx.go(); flushScores();
    if (pseudoBack === 'board') openBoard(); else if (pseudoBack === 'over'){ ui.show('over'); showOverRank(); } else if (pseudoBack === 'settings') openSettings(); else ui.show('menu');
  } catch(e){
    let m = PSEUDO_ERR[e.code] || "Une erreur est survenue. Réessayez.";
    if (e.code === 'pseudo_limite'){ await loadPlayerInfo(); if (pinfo) m += ` Prochain changement possible le ${fmtReset(pinfo.next_reset)}.`; }
    $('pseudoErr').textContent = m; pseudoConfirm = false; $('pseudoOk').textContent = 'VALIDER';
  }
  $('pseudoOk').disabled = false;
}
$('pseudoOk').addEventListener('click', submitPseudo);
$('pseudoInput').addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') submitPseudo(); });
$('pseudoInput').addEventListener('input', () => { pseudoConfirm = false; $('pseudoOk').textContent = 'VALIDER'; $('pseudoErr').textContent = ''; });
$('pseudoLater').addEventListener('click', () => { if (pseudoBack === 'board') openBoard(); else if (pseudoBack === 'settings') openSettings(); else ui.show(pseudoBack === 'over' ? 'over' : 'menu'); });
$('overPseudo').addEventListener('click', () => openPseudo('over'));

// ----- leaderboard screen -----
let boardSort = store.get('boardSort', 'laps'), boardPeriod = store.get('boardPeriod', 'week'), boardReq = 0;
function boardTabs(){
  for (const b of document.querySelectorAll('#boardPeriod button')) b.setAttribute('aria-pressed', String(b.dataset.p === boardPeriod));
  for (const b of document.querySelectorAll('#boardSort .chip')) b.setAttribute('aria-pressed', String(b.dataset.s === boardSort));
  $('boardNote').textContent = boardPeriod === 'week' ? 'Remis à zéro chaque lundi' : 'Depuis le lancement du classement';
}
function boardMe(){
  const box = $('boardMe'); box.replaceChildren();
  if (pseudo){
    const t = document.createElement('span'); t.append('Vous jouez en tant que '); const b = document.createElement('b'); b.textContent = pseudo; t.append(b);
    const c = document.createElement('button'); c.className = 'link'; c.textContent = 'Changer'; c.addEventListener('click', () => openPseudo('board'));
    const n = document.createElement('small'); n.className = 'lbn';
    if (pinfo){ n.textContent = pinfo.changes_left === 0 ? `Prochain changement le ${fmtReset(pinfo.next_reset)}` : changesText(pinfo.changes_left); }
    box.append(t, c, n);
  } else {
    const c = document.createElement('button'); c.className = 'pill buy'; c.textContent = 'Choisir un pseudo pour apparaître';
    c.addEventListener('click', () => openPseudo('board')); box.append(c);
  }
}
async function loadBoard(){
  const id = ++boardReq, list = $('boardList'), msg = $('boardMsg');
  boardTabs(); list.replaceChildren(); msg.textContent = 'Chargement…';
  try {
    await flushScores();
    const rows = await rpc('get_leaderboard', {p_sort: boardSort, p_period: boardPeriod, p_me: playerId, p_limit: 50});
    if (id !== boardReq) return;
    msg.textContent = rows.length ? '' : (boardPeriod === 'week' ? 'Aucune partie cette semaine. Soyez le premier !' : 'Aucune partie pour l\'instant. Soyez le premier !');
    let prev = 0;
    for (const r of rows){
      const li = document.createElement('li');
      li.className = (r.is_me ? 'me ' : '') + (r.rank <= 3 ? 'r' + r.rank : '') + (r.rank > prev + 1 && prev ? ' sep' : '');
      prev = r.rank;
      const rk = document.createElement('span'); rk.className = 'rk'; rk.textContent = r.rank;
      const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = r.pseudo;           // text only: no HTML from players
      const val = document.createElement('span'); val.className = 'val';
      val.textContent = boardSort === 'gems' ? r.gems + ' ◆' : boardSort === 'chain' ? 'x' + r.best_chain : r.laps;
      const sm = document.createElement('small');
      const parts = [];
      if (r.old_pseudo){ const w = document.createElement('span'); w.className = 'was'; w.textContent = 'anciennement ' + r.old_pseudo; sm.append(w); }
      if (boardSort !== 'laps') parts.push(r.laps + ' tours');
      parts.push(fmtTime(r.duration));
      if (boardSort !== 'gems') parts.push(r.gems + ' ◆');
      if (boardSort !== 'chain' && r.best_chain) parts.push('série x' + r.best_chain);
      sm.append(parts.join(' · '));
      li.append(rk, nm, val, sm); list.append(li);
      li.setAttribute('role', 'button'); li.tabIndex = 0; li.setAttribute('aria-label', 'Voir le profil de ' + r.pseudo);
      const go = () => { sfx.ui(); openPlayer(r.pseudo); };
      li.addEventListener('click', go); li.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); go(); } });
    }
  } catch(e){ if (id === boardReq) msg.textContent = 'Impossible de charger le classement. Vérifiez votre connexion.'; }
}
function openBoard(){ syncSkins(); boardMe(); ui.show('board'); loadBoard(); loadPlayerInfo().then(() => { if (!$('board').hidden) boardMe(); }); }
$('boardBtn').addEventListener('click', openBoard);
$('boardClose').addEventListener('click', () => { ui.show('menu'); ui.stats(); });
$('boardPeriod').addEventListener('click', e => { const b = e.target.closest('button'); if (b){ boardPeriod = b.dataset.p; store.set('boardPeriod', boardPeriod); loadBoard(); } });
$('boardSort').addEventListener('click', e => { const b = e.target.closest('.chip'); if (b){ boardSort = b.dataset.s; store.set('boardSort', boardSort); loadBoard(); } });

// ----- skins shared with the other players (2.3) -----
// Sent when they change (and once a pseudo exists). The server keeps only known skins.
let skinsTimer = 0;
function syncSkins(){
  clearTimeout(skinsTimer);
  skinsTimer = setTimeout(async () => {
    if (!pseudo) return;
    const list = SKINS.map(k => k.id).filter(id => owned.includes(id)), sig = equipped + '|' + list.join(',');
    if (store.get('v2.skinsSent', '') === sig) return;
    try { await rpc('set_skins', {p_id: playerId, p_skin: equipped, p_skins: list}); store.set('v2.skinsSent', sig); }
    catch(e){ if (e.code === 'trop_rapide') syncSkins(); }               // otherwise: next time
  }, 1200);
}
setTimeout(syncSkins, 2500);

// ----- another player's profile, opened from the leaderboard (2.3) -----
let plSkin = null, plReq = 0;
async function openPlayer(name){
  const id = ++plReq;
  plSkin = null; $('plName').textContent = name; $('plWas').textContent = ''; $('plSince').textContent = '';
  $('plPerf').hidden = $('plColl').hidden = true; $('plMsg').textContent = 'Chargement…';
  ui.show('player'); startAnim();
  let p;
  try { p = await rpc('player_profile', {p_pseudo: name}); }
  catch(e){ if (id === plReq) $('plMsg').textContent = 'Profil indisponible pour le moment. Vérifiez votre connexion.'; return; }
  if (id !== plReq) return;
  if (!p){ $('plMsg').textContent = 'Ce joueur a changé de pseudo.'; return; }
  $('plMsg').textContent = '';
  $('plName').textContent = p.pseudo;                                    // text only: no HTML from players
  $('plWas').textContent = p.old_pseudo ? 'anciennement ' + p.old_pseudo : '';
  $('plBest').textContent = fmtInt(p.best) + ' tours';
  $('plBestDate').textContent = p.best_date ? 'le ' + fmtDate(p.best_date) : '';
  $('plRank').textContent = p.best ? p.rank + (p.rank == 1 ? 'er' : 'e') : '—';
  $('plChain').textContent = 'x' + (p.best_chain || 0);
  $('plGems').textContent = fmtInt(p.best_gems) + ' ◆';
  $('plGames').textContent = fmtInt(p.games);
  $('plPerf').hidden = false;
  const box = $('plSkins'); box.replaceChildren();
  const has = Array.isArray(p.skins) ? p.skins : null;
  plSkin = has && SKINS.some(k => k.id === p.skin) ? p.skin : 'sonde';
  startAnim();                                                            // his skin, turning around the avatar
  if (has){
    for (const sk of SKINS){ const cv = document.createElement('canvas'); cv.title = sk.name; if (!has.includes(sk.id)) cv.className = 'off'; box.append(cv); drawSkinBadge(cv, sk); }
    const cur = SKINS.find(k => k.id === plSkin);
    $('plSkinCount').textContent = `Skins : ${has.filter(id => SKINS.some(k => k.id === id)).length} / ${SKINS.length} · équipé : ${cur.name}`;
  } else $('plSkinCount').textContent = 'Ses skins s\'afficheront après sa prochaine mise à jour du jeu.';
  $('plColl').hidden = false;
  $('plSince').textContent = p.since ? 'Dans le classement depuis le ' + fmtDate(p.since) : '';
}
$('plClose').addEventListener('click', () => ui.show('board'));
