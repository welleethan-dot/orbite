#!/usr/bin/env node
// Tests automatiques d'Orbite : rejouent tout le jeu sur téléphones simulés avant chaque publication.
//
//   python3 tools/build.py && node tests/run.js          (depuis la racine du dépôt)
//   node tests/run.js classement profil                  (seulement les tests dont le nom contient ces mots)
//
// - Le serveur Supabase est SIMULÉ (aucun score n'est écrit dans le vrai classement).
// - Les fichiers servis reçoivent un petit accès de test (window.__t) : il n'existe jamais dans le jeu publié.
// - Nécessite Playwright (require('playwright')) avec Chromium installé.
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const {chromium, devices} = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'version.json'), 'utf8')).version;
const SUPA = 'https://gnltdkmweifqfceapwws.supabase.co/**';
const HOOK = `window.__t = {get S(){ return S; }, get lanes(){ return lanes; }, get unit(){ return unit; }, get best(){ return best; },
  hop: () => hop(), seal: () => seal(), fx: () => fxLevel(), tutoEnter: i => tutoEnter(i)};`;

// ---------- petit serveur de fichiers (avec l'accès de test injecté) ----------
const TYPES = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json'};
function serve(){
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(ROOT, p);
    if (!file.startsWith(ROOT) || !fs.existsSync(file)) { res.writeHead(404); return res.end('404'); }
    let body = fs.readFileSync(file);
    const ext = path.extname(file);
    if (ext === '.html' || ext === '.js'){
      const txt = body.toString('utf8');
      if (/^S = fresh\(\);$/m.test(txt)) body = Buffer.from(txt.replace(/^S = fresh\(\);$/m, 'S = fresh();\n' + HOOK));
    }
    res.writeHead(200, {'Content-Type': TYPES[ext] || 'application/octet-stream', 'Cache-Control': 'no-store'});
    res.end(body);
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}

// ---------- serveur Supabase simulé ----------
function fakeSupabase(){
  const db = {players: {}, scores: [], skins: {}, offline: false, calls: []};
  db.handler = async route => {
    if (db.offline) return route.abort('internetdisconnected');
    const fn = route.request().url().split('/rpc/')[1], a = JSON.parse(route.request().postData() || '{}');
    db.calls.push(fn);
    const ok = x => route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(x)});
    const ko = m => route.fulfill({status: 400, contentType: 'application/json', body: JSON.stringify({message: m})});
    if (fn === 'set_pseudo'){
      if (/connard/i.test(a.p_pseudo)) return ko('pseudo_interdit');
      if (Object.entries(db.players).some(([k, v]) => k !== a.p_id && v.toLowerCase() === a.p_pseudo.toLowerCase())) return ko('pseudo_pris');
      db.players[a.p_id] = a.p_pseudo; return ok(a.p_pseudo);
    }
    if (fn === 'player_info') return ok(db.players[a.p_id] ? {pseudo: db.players[a.p_id], changes_left: 3, next_reset: '2026-12-01'} : null);
    if (fn === 'set_skins'){ if (!db.players[a.p_id]) return ko('joueur_inconnu'); db.skins[a.p_id] = {skin: a.p_skin, skins: a.p_skins}; return ok(true); }
    if (fn === 'player_profile'){
      const id = Object.keys(db.players).find(k => db.players[k].toLowerCase() === String(a.p_pseudo).toLowerCase()); if (!id) return ok(null);
      const mine = db.scores.filter(s => s.p_id === id), max = k => Math.max(0, ...mine.map(s => s[k]));
      const bests = {}; for (const s of db.scores) bests[s.p_id] = Math.max(bests[s.p_id] || 0, s.p_laps);
      return ok({pseudo: db.players[id], old_pseudo: null, since: '2026-11-25', games: mine.length, laps_total: mine.reduce((x, s) => x + s.p_laps, 0),
        best: max('p_laps'), best_date: '2026-11-26', best_gems: max('p_gems'), best_chain: max('p_best_chain'),
        rank: 1 + Object.values(bests).filter(v => v > max('p_laps')).length, skin: (db.skins[id] || {}).skin || null, skins: (db.skins[id] || {}).skins || null});
    }
    if (fn === 'submit_score'){ if (!db.players[a.p_id]) return ko('joueur_inconnu'); db.scores.push({...a}); return ok(true); }
    if (fn === 'get_leaderboard'){
      const key = {laps: 'p_laps', gems: 'p_gems', chain: 'p_best_chain'}[a.p_sort], bestOf = {};
      for (const s of db.scores) if (!bestOf[s.p_id] || s[key] > bestOf[s.p_id][key]) bestOf[s.p_id] = s;
      const rows = Object.values(bestOf).filter(s => s[key] > 0).sort((x, y) => y[key] - x[key])
        .map((s, i) => ({rank: i + 1, pseudo: db.players[s.p_id], old_pseudo: null, laps: s.p_laps, duration: s.p_duration, gems: s.p_gems, best_chain: s.p_best_chain, is_me: s.p_id === a.p_me}));
      return ok(rows.filter(r => r.rank <= a.p_limit || r.is_me));
    }
    return ko('inconnu');
  };
  return db;
}

// ---------- outils ----------
let BASE, browser;
const URL_OF = {app: () => BASE + '/', beta: () => BASE + '/beta/', claude: () => BASE + '/build/claude.html'};
const PREFIX = {app: 'orbite.', beta: 'orbite-beta.', claude: 'orbite.'};
function check(cond, msg){ if (!cond) throw new Error(msg); }
const wait = ms => new Promise(r => setTimeout(r, ms));

// Ouvre une variante sur un téléphone simulé. opts.store : sauvegarde de départ (scellée via le jeu si opts.seal).
async function open(variant = 'app', opts = {}){
  const ctx = await browser.newContext({...devices[opts.device || 'iPhone 13'], serviceWorkers: opts.sw ? 'allow' : 'block'});
  const db = fakeSupabase(); await ctx.route(SUPA, db.handler);
  if (opts.vibrate) await ctx.addInitScript(() => { window.__vib = []; navigator.vibrate = x => { window.__vib.push(x); return true; }; });
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const pre = PREFIX[variant];
  await page.goto(URL_OF[variant]());
  const store = Object.assign({tutoDone: true, seenVersion: VERSION}, opts.store || {});
  await page.evaluate(([pre, store, doSeal]) => {
    localStorage.clear();
    for (const [k, v] of Object.entries(store)) if (v !== undefined) localStorage.setItem(pre + k, JSON.stringify(v));
    if (doSeal) window.__t.seal();
  }, [pre, store, !!opts.seal]);
  await page.reload(); await wait(300);
  return {ctx, page, db, errors, pre, close: () => ctx.close()};
}
async function playUntilOver(page, setup){
  if (await page.isVisible('#again')) await page.tap('#again'); else await page.tap('#play');
  await wait(300);
  if (setup) await page.evaluate(setup);
  await page.waitForSelector('#over:not([hidden])', {timeout: 60000}); await wait(300);
}
const ls = (page, pre, k) => page.evaluate(([pre, k]) => JSON.parse(localStorage.getItem(pre + k)), [pre, k]);

// ---------- les tests ----------
const TESTS = {
  async 'chargement des 3 variantes'(){
    for (const v of ['app', 'beta', 'claude']){
      const t = await open(v);
      check(t.errors.length === 0, `${v} : erreurs ${t.errors}`);
      check(await t.page.isVisible('#menu'), `${v} : accueil invisible`);
      if (v !== 'claude') check((await t.page.textContent('#verLabel')) === VERSION, `${v} : numéro de version ≠ ${VERSION}`);
      if (v === 'beta') check((await t.page.textContent('#menu .eyebrow')).includes('Version de test'), 'beta : mention « Version de test » absente');
      await t.close();
    }
  },
  async 'mise en page sur 3 téléphones'(){
    for (const device of ['iPhone SE', 'iPhone 13', 'Pixel 7']){
      const t = await open('app', {device});
      const r = await t.page.evaluate(() => ({hscroll: document.documentElement.scrollWidth > innerWidth,
        gear: document.getElementById('setBtn').getBoundingClientRect().bottom, text: document.querySelector('#menu .eyebrow').getBoundingClientRect().top}));
      check(!r.hscroll, `${device} : défilement horizontal`);
      check(r.gear < r.text, `${device} : la roue dentée chevauche le texte`);
      await t.close();
    }
  },
  async 'partie, fin de partie et statistiques'(){
    const t = await open('app');
    await playUntilOver(t.page, () => { __t.S.laps = 7; __t.S.shards = 4; });
    check(await t.page.isVisible('#newBest'), 'pas de « Nouveau record » à la première partie');
    check((await ls(t.page, t.pre, 'v2.games')) === 1, 'partie non comptée');
    check((await ls(t.page, t.pre, 'v2.best')) >= 7, 'record non enregistré');
    check((await ls(t.page, t.pre, 'v2.wallet')) >= 4, 'éclats non ajoutés');
    check(t.errors.length === 0, `erreurs ${t.errors}`); await t.close();
  },
  async 'nouveau record en cours de partie (titre + vibration)'(){
    const t = await open('app', {device: 'Pixel 7', vibrate: true});
    await playUntilOver(t.page, () => { __t.S.laps = 5; });
    const best = await t.page.evaluate(() => __t.best);
    await t.page.tap('#again'); await wait(300);
    await t.page.evaluate(b => { window.__vib = []; const S = __t.S; S.laps = b; S.lapAcc = Math.PI*2 - .02; }, best); await wait(400);
    check((await t.page.textContent('#banner')).includes('Nouveau record'), 'titre « Nouveau record » absent');
    check(await t.page.evaluate(() => window.__vib.some(v => JSON.stringify(v) === '[70,50,15,40,15]')), 'vibration du record absente');
    await t.close();
  },
  async 'paliers 30 / 40 / 50 (titres et inversion)'(){
    const t = await open('app');
    await t.page.tap('#play'); await wait(300);
    await t.page.evaluate(() => setInterval(() => { __t.S.rocks = []; }, 30));   // no collision during this test
    for (const [lap, title] of [[29, 'Pluie'], [39, 'rapides'], [49, 'Inversion']]){
      await t.page.evaluate(l => { const S = __t.S; S.laps = l; S.lapAcc = Math.PI*2 - .02; S.rocks = []; }, lap); await wait(350);
      check((await t.page.textContent('#banner')).includes(title), `palier ${lap + 1} : titre « ${title} » absent`);
      await wait(1800);
    }
    check(await t.page.evaluate(() => __t.S.dir === -1), "l'inversion n'a pas changé le sens");
    await t.close();
  },
  async 'répit avant les paliers, bonus 100 / 200, inversions folles'(){
    const t = await open('app');
    await t.page.tap('#play'); await wait(300);
    // lap 30: the sky clears and nothing new arrives for 2 s
    const r30 = await t.page.evaluate(() => new Promise(res => { const S = __t.S;
      S.t = 60; S.laps = 29; S.lapAcc = Math.PI*2 - .01; S.rocks = []; for (let i = 0; i < 4; i++){ const o = makeRock(i % 2, S.a + 1.5 + i*.6); o.born = -9; S.rocks.push(o); }
      setTimeout(() => { const a = {laps: S.laps, rocks: S.rocks.filter(o => !o.passed).length, calm: S.calm};
        setTimeout(() => { a.rocksLater = S.rocks.filter(o => !o.passed).length; res(a); }, 1500); }, 150); }));
    check(r30.laps === 30 && r30.rocks === 0 && r30.calm > 1.5, `tour 30 : pas de répit (${JSON.stringify(r30)})`);
    check(r30.rocksLater === 0, `tour 30 : astéroïdes pendant le répit (${r30.rocksLater})`);
    await t.page.evaluate(() => setInterval(() => { __t.S.rocks = []; }, 30));   // no collision from here on
    await t.page.evaluate(() => { const S = __t.S; S.laps = 99; S.lapAcc = Math.PI*2 - .01; }); await wait(300);
    check((await t.page.textContent('#banner')).includes('+10'), 'tour 100 : pas d’annonce du bonus');
    check(await t.page.evaluate(() => __t.S.bonus === 10), 'tour 100 : bonus non compté');
    await wait(1800);
    await t.page.evaluate(() => { const S = __t.S; S.laps = 199; S.lapAcc = Math.PI*2 - .01; }); await wait(300);
    check((await t.page.textContent('#banner')).includes('Inversions folles'), 'tour 200 : titre absent');
    const r200 = await t.page.evaluate(() => ({bonus: __t.S.bonus, next: __t.S.nextFlip, calm: __t.S.calm}));
    check(r200.bonus === 35 && r200.next >= 203 && r200.next <= 206 && r200.calm > 1.5, `tour 200 : ${JSON.stringify(r200)}`);
    // chaos: reversals every 3 to 6 laps, 0.9 s warning
    const flips = await t.page.evaluate(() => new Promise(res => { const S = __t.S, seen = [];
      const iv = setInterval(() => {
        if (S.revWarn > 0 && !seen.find(x => x.lap === S.laps)) seen.push({lap: S.laps, warn: S.revWarn});
        if (S.revWarn <= 0 && !(S.calm > 0)){ S.lapAcc = Math.PI*2 - .01; }
        if (S.laps >= 240){ clearInterval(iv); res(seen); }
      }, 20); }));
    const gaps = flips.slice(1).map((f, i) => f.lap - flips[i].lap);
    check(flips.length >= 7 && gaps.every(g => g >= 3 && g <= 6), `inversions folles : ${JSON.stringify(flips.map(f => f.lap))}`);
    check(flips.every(f => f.warn <= .9), 'alerte d’inversion trop longue après 200');
    check(new Set(gaps).size > 1, 'inversions pas aléatoires');
    // the bonus goes to the wallet, not to the run's crystals (checked by the server)
    const before = await ls(t.page, t.pre, 'v2.wallet') || 0, shards = await t.page.evaluate(() => __t.S.shards);
    await t.page.evaluate(() => { const S = __t.S, o = makeRock(S.lane, S.a + .05); o.born = -9; S.rocks.push(o); });
    await t.page.evaluate(() => { const S = __t.S; S.rocks = []; gameOver(); }); await wait(1200);
    check((await ls(t.page, t.pre, 'v2.wallet')) === before + shards + 35, 'bonus non ajouté au porte-monnaie');
    check((await ls(t.page, t.pre, 'v2.pending'))[0].g === shards || t.db.scores.length === 0, 'bonus envoyé au classement comme éclats de la partie');
    check(t.errors.length === 0, `erreurs ${t.errors}`); await t.close();
  },
  async 'didacticiel complet'(){
    const t = await open('app', {store: {tutoDone: undefined}});
    await t.page.tap('#play'); await wait(400);
    check(await t.page.isVisible('#tuto'), 'le didacticiel ne démarre pas pour un nouveau joueur');
    await t.page.evaluate(() => {
      const TAU = 2*Math.PI, md = x => ((x % TAU) + TAU) % TAU;
      window.__bot = setInterval(() => { const S = __t.S; if (!S.tuto) return;
        const near = (lane, o) => o.lane === lane && !o.passed && !o.ghost && md(S.dir*(o.a - S.a)) < (S.tuto.step === 2 ? .38 : .55);   // step 2: frôlement, jump late
        if (S.tuto.step === 0){ __t.hop(); return; }
        if (S.rocks.some(o => near(S.lane, o)) && !S.rocks.some(o => near(1 - S.lane, o))){ __t.hop(); return; }
        if (S.gems.length){ const g = S.gems[0]; if (g.lane !== S.lane && md(S.dir*(g.a - S.a)) < 1.2 && !S.rocks.some(o => near(1 - S.lane, o))) __t.hop(); }
      }, 120);
    });
    for (let i = 0; i < 500 && (await t.page.evaluate(() => __t.S.tuto && __t.S.tuto.step)) < 6; i++) await wait(150);
    check((await t.page.evaluate(() => __t.S.tuto.step)) === 6, 'les étapes jouables du didacticiel ne se terminent pas (étape ' + (await t.page.evaluate(() => __t.S.tuto.step)) + ')');
    check(await t.page.evaluate(() => __t.S.near >= 1), 'étape du frôlement validée sans frôlement');
    for (let i = 0; i < 6; i++){ await t.page.tap('#tutoNext'); await wait(250); }
    check((await t.page.textContent('#tutoNext')) === 'JOUER', 'dernière étape sans bouton JOUER');
    await t.page.tap('#tutoNext'); await wait(300);
    check(await t.page.evaluate(() => !__t.S.tuto), 'JOUER ne lance pas une vraie partie');
    check((await ls(t.page, t.pre, 'tutoDone')) === true, 'didacticiel non marqué comme fait');
    check((await ls(t.page, t.pre, 'v2.games')) === null, 'le didacticiel a compté une partie');
    check(t.errors.length === 0, `erreurs ${t.errors}`); await t.close();
  },
  async 'entraînement : paliers débloqués, rien ne compte'(){
    let t = await open('app');
    await t.page.tap('#trainBtn'); await wait(150);
    check(await t.page.$$eval('#trainList button', l => l.length === 4 && l.every(b => !b.disabled)), 'paliers pas tous ouverts pour un nouveau joueur');
    await t.close();
    t = await open('app', {store: {'v2.best': 60, 'v2.games': 5, 'v2.gems': 500, 'v2.wallet': 500}, seal: true});
    await t.page.tap('#trainBtn'); await wait(150);
    const st = await t.page.$$eval('#trainList button', l => l.map(b => b.disabled ? 0 : 1).join(''));
    check(st === '1111', 'paliers pas tous ouverts : ' + st);
    await t.page.tap('#trainList button:nth-child(2)'); await wait(300);
    check(await t.page.evaluate(() => mode === 'play' && __t.S.laps === 38), 'l’entraînement ne commence pas au tour 38');
    check((await t.page.textContent('#testTag')).includes('Astéroïdes rapides'), 'mention « Entraînement » absente');
    await t.page.evaluate(() => { const S = __t.S; S.shards = 9; const o = makeRock(S.lane, S.a + .05); o.born = -9; S.rocks.push(o); });
    await t.page.waitForSelector('#over:not([hidden])', {timeout: 5000});
    check(await t.page.isHidden('#second'), 'seconde chance proposée à l’entraînement');
    check((await t.page.textContent('#overTitle')) === 'Entraînement' && await t.page.isHidden('#shareRun'), 'fin d’entraînement mal affichée');
    check((await ls(t.page, t.pre, 'v2.games')) === 5 && (await ls(t.page, t.pre, 'v2.wallet')) === 500 && (await ls(t.page, t.pre, 'v2.best')) === 60, 'l’entraînement a compté');
    check(t.db.scores.length === 0, 'entraînement envoyé au classement');
    await t.page.tap('#again'); await wait(300);
    check(await t.page.evaluate(() => __t.S.laps === 38), 'REJOUER ne relance pas le même entraînement');
    await t.page.tap('#pauseBtn'); await t.page.tap('#homeFromPause'); await wait(200);
    // any starting lap, 0 to 200
    await t.page.tap('#trainBtn'); await t.page.fill('#trLap', '500'); await t.page.press('#trLap', 'Enter'); await t.page.dispatchEvent('#trLap', 'change');
    check((await t.page.inputValue('#trLap')) === '200', 'tour au choix non plafonné à 200');
    await t.page.fill('#trLap', '120'); await t.page.dispatchEvent('#trLap', 'change'); await t.page.tap('#trPlus'); await t.page.tap('#trGo'); await wait(300);
    check(await t.page.evaluate(() => mode === 'play' && __t.S.laps === 121 && __t.S.storm), 'départ au tour choisi (121) raté');
    check((await t.page.textContent('#testTag')).includes('Tour 121'), 'mention du tour choisi absente');
    await t.page.tap('#pauseBtn'); await t.page.tap('#homeFromPause'); await wait(200);
    await t.page.tap('#trainBtn'); await wait(100);
    check((await t.page.inputValue('#trLap')) === '121', 'tour au choix non mémorisé');
    await t.page.tap('#backBtn'); await wait(100);
    await t.page.tap('#play'); await wait(300);
    check(await t.page.evaluate(() => __t.S.laps === 0) && await t.page.isHidden('#testTag'), 'JOUER après un entraînement ne lance pas une vraie partie');
    check(t.errors.length === 0, `erreurs ${t.errors}`); await t.close();
  },
  async 'boutique : achat, célébration, équipement'(){
    const t = await open('beta');
    for (let i = 0; i < 5; i++) await t.page.tap('#title');
    await t.page.tap('#addGems'); await t.page.tap('#testClose');
    await t.page.tap('#shopBtn'); await t.page.tap('[data-buy=comete]'); await t.page.tap('#confirmYes'); await wait(1100);
    check(await t.page.isVisible('#unlock'), 'pas d’écran « Nouveau skin »');
    await t.page.tap('#unlockClose');
    check((await ls(t.page, t.pre, 'v2.wallet')) === 860, 'prix mal déduit');
    await t.page.reload(); await wait(300);
    check((await ls(t.page, t.pre, 'v2.owned')).includes('comete'), 'skin perdu après relance (sceau ?)');
    await t.page.tap('#shopBtn'); await t.page.tap('[data-equip=sonde]');
    check((await ls(t.page, t.pre, 'v2.skin')) === 'sonde', 'équipement non pris en compte');
    check(t.errors.length === 0, `erreurs ${t.errors}`); await t.close();
  },
  async 'flèche retour sur chaque écran (fixe au défilement)'(){
    const t = await open('app', {device: 'iPhone SE'});
    check(await t.page.isHidden('#backBtn'), 'flèche visible sur l’accueil');
    for (const [btn, screen] of [['#setBtn', 'settings'], ['#boardBtn', 'board'], ['#profileBtn', 'profile'], ['#shopBtn', 'shop']]){
      await t.page.tap(btn); await wait(150);
      check(await t.page.isVisible('#backBtn'), `${screen} : pas de flèche retour visible`);
      await t.page.evaluate(id => { document.getElementById(id).scrollTop = 99999; }, screen); await wait(100);
      const r = await t.page.evaluate(() => { const b = document.getElementById('backBtn').getBoundingClientRect(); return {top: b.top, left: b.left}; });
      check(r.top >= 0 && r.top < 80 && r.left < 60, `${screen} : flèche pas en haut à gauche après défilement (${r.top}, ${r.left})`);
      await t.page.tap('#backBtn'); await wait(150);
      check(await t.page.isVisible('#menu'), `${screen} : la flèche ne ramène pas à l’accueil`);
      check(await t.page.isHidden('#backBtn'), `${screen} : flèche restée sur l’accueil`);
    }
    await t.page.tap('#setBtn'); await t.page.tap('#howBtn'); await t.page.tap('#backBtn'); await wait(150);
    check(await t.page.isVisible('#settings'), '« Comment jouer » : la flèche ne ramène pas aux réglages');
    await t.page.tap('#backBtn'); await wait(150); await t.page.tap('#play'); await wait(200);
    check(await t.page.isHidden('#backBtn'), 'flèche visible pendant la partie');
    check(t.errors.length === 0, `erreurs ${t.errors}`); await t.close();
  },
  async 'seconde chance : 100 éclats, une fois par partie'(){
    const t = await open('app', {store: {'v2.gems': 250, 'v2.wallet': 250, 'v2.games': 3}, seal: true});
    await t.page.tap('#play'); await wait(300);
    const crash = () => t.page.evaluate(() => { const S = __t.S; S.laps = 17; S.rocks.length = 0;
      const o = makeRock(S.lane, S.a + .05); o.born = -9; S.rocks.push(o); });
    await crash(); await t.page.waitForSelector('#second:not([hidden])', {timeout: 5000});
    check((await t.page.textContent('#secondLaps')) === '17', 'mauvais nombre de tours affiché');
    check((await ls(t.page, t.pre, 'v2.games')) === 3, 'partie comptée avant le choix');
    await t.page.tap('#secondYes'); await wait(300);
    check(await t.page.evaluate(() => mode === 'play' && __t.S.laps === 17 && __t.S.rocks.length === 0), 'la partie ne reprend pas au même tour');
    check((await ls(t.page, t.pre, 'v2.wallet')) === 150, 'les 100 éclats ne sont pas déduits');
    await t.page.evaluate(() => { const S = __t.S, o = makeRock(S.lane, S.a + .05); o.born = -9; S.rocks.push(o); });
    await wait(400);
    check(await t.page.evaluate(() => mode === 'play'), 'pas de protection juste après la reprise');
    await t.page.evaluate(() => { __t.S.shield = 0; }); await crash();
    await t.page.waitForSelector('#over:not([hidden])', {timeout: 5000});
    check(await t.page.isHidden('#second'), 'seconde chance proposée deux fois');
    check((await ls(t.page, t.pre, 'v2.games')) === 4 && (await t.page.textContent('#finalScore')) === '17', 'partie mal comptée après la reprise');
    check((await ls(t.page, t.pre, 'v2.wallet')) === 150, 'porte-monnaie faux');
    // refus (temps écoulé) et porte-monnaie insuffisant
    await t.page.tap('#again'); await wait(300); await crash();
    await t.page.waitForSelector('#second:not([hidden])', {timeout: 5000});
    await t.page.waitForSelector('#over:not([hidden])', {timeout: 9000});
    check((await ls(t.page, t.pre, 'v2.wallet')) === 150, 'éclats déduits sans accord');
    await t.page.evaluate(() => { wallet = 50; });
    await t.page.tap('#again'); await wait(300); await crash();
    await t.page.waitForSelector('#over:not([hidden])', {timeout: 5000});
    check(await t.page.isHidden('#second'), 'proposée sans assez d’éclats');
    check(t.errors.length === 0, `erreurs ${t.errors}`); await t.close();
  },
  async 'sceau : modification à la main remise à zéro'(){
    const t = await open('app', {store: {'v2.gems': 50, 'v2.wallet': 50, 'v2.best': 20}, seal: true});
    check((await t.page.textContent('#menuBest')) === '20', 'progression légitime perdue');
    await t.page.evaluate(pre => localStorage.setItem(pre + 'v2.wallet', '999999'), t.pre);
    await t.page.reload(); await wait(300);
    check((await t.page.textContent('#menuGems')) === '0', 'la triche à la main n’est pas remise à zéro');
    await t.close();
  },
  async 'correction des tricheurs (2.1.1)'(){
    const cheat = await open('app', {store: {'v2.gems': 40, 'v2.wallet': 1500, 'v2.owned': ['sonde', 'comete', 'trounoir'], 'v2.skin': 'trounoir', 'v2.laps': 120}, seal: true});
    check(await cheat.page.isVisible('#notice'), 'tricheur non repéré');
    check((await ls(cheat.page, cheat.pre, 'v2.wallet')) === 20, 'porte-monnaie ≠ moitié des éclats gagnés');
    check(JSON.stringify(await ls(cheat.page, cheat.pre, 'v2.owned')) === '["sonde"]', 'skins non retirés');
    await cheat.close();
    const honest = await open('app', {store: {'v2.gems': 500, 'v2.wallet': 80, 'v2.owned': ['sonde', 'comete', 'glacier'], 'v2.laps': 900}, seal: true});
    check(!(await honest.page.isVisible('#notice')), 'joueur honnête puni à tort');
    await honest.close();
  },
  async 'mode caché : absent de l’application, présent sur /beta/'(){
    for (const [v, expected] of [['app', false], ['beta', true]]){
      const t = await open(v);
      for (let i = 0; i < 5; i++) await t.page.tap('#title');
      await wait(200);
      check((await t.page.isVisible('#test')) === expected, `${v} : mode caché ${expected ? 'absent' : 'accessible'}`);
      await t.close();
    }
  },
  async 'classement : pseudo, envoi, rang, file hors connexion'(){
    const t = await open('app');
    await playUntilOver(t.page, () => { __t.S.laps = 9; });
    check(await t.page.isVisible('#overPseudo'), 'pas d’invitation à choisir un pseudo');
    await t.page.tap('#overPseudo');
    await t.page.fill('#pseudoInput', 'gros connard'); await t.page.tap('#pseudoOk'); await wait(300);
    check((await t.page.textContent('#pseudoErr')).includes('pas autorisé'), 'pseudo grossier accepté');
    await t.page.fill('#pseudoInput', 'Testeur_1'); await t.page.tap('#pseudoOk'); await wait(1200);
    check((await t.page.textContent('#overRank')).includes('1er'), 'rang absent en fin de partie');
    t.db.offline = true;
    await playUntilOver(t.page, () => { __t.S.laps = 3; }); await wait(800);
    check((await ls(t.page, t.pre, 'v2.pending')).length === 1, 'partie hors connexion non gardée');
    t.db.offline = false; await t.page.evaluate(() => dispatchEvent(new Event('online'))); await wait(1500);
    check((await ls(t.page, t.pre, 'v2.pending')).length === 0, 'partie en attente non envoyée au retour du réseau');
    t.db.players.x = '<img src=x onerror=alert(1)>'; t.db.scores.push({p_id: 'x', p_laps: 80, p_duration: 160, p_gems: 30, p_best_chain: 12});
    await t.page.tap('#homeFromOver'); await t.page.tap('#boardBtn'); await wait(800);
    check((await t.page.$$('#boardList li')).length === 2, 'classement incomplet');
    check(await t.page.evaluate(() => !document.querySelector('#boardList img')), 'pseudo interprété comme du code');
    check(t.errors.length === 0, `erreurs ${t.errors}`); await t.close();
  },
  async 'profil d’un joueur depuis le classement'(){
    const t = await open('app', {store: {'v2.pseudo': 'Moi_42', 'v2.owned': ['sonde', 'comete', 'aurore'], 'v2.skin': 'aurore', 'v2.gems': 2000, 'v2.wallet': 0}, seal: true});
    const me = await t.page.evaluate(pre => JSON.parse(localStorage.getItem(pre + 'v2.pid')), t.pre);
    t.db.players[me] = 'Moi_42'; t.db.players.x = 'Rival<b>'; t.db.skins.x = {skin: 'glacier', skins: ['sonde', 'glacier', 'mezen']};
    t.db.scores.push({p_id: 'x', p_laps: 80, p_duration: 160, p_gems: 30, p_best_chain: 12}, {p_id: 'x', p_laps: 40, p_duration: 90, p_gems: 9, p_best_chain: 4},
                     {p_id: me, p_laps: 20, p_duration: 50, p_gems: 3, p_best_chain: 1});
    t.db.players.y = 'Ancien'; t.db.scores.push({p_id: 'y', p_laps: 10, p_duration: 30, p_gems: 1, p_best_chain: 0});
    await wait(4500);                                          // sent shortly after start (not to slow the start down)
    check(JSON.stringify(t.db.skins[me]) === JSON.stringify({skin: 'aurore', skins: ['sonde', 'comete', 'aurore']}), 'mes skins ne sont pas envoyés : ' + JSON.stringify(t.db.skins[me]) + ' ' + t.db.calls + ' ' + JSON.stringify(await t.page.evaluate(() => [pseudo, owned, equipped])));
    await t.page.tap('#boardBtn'); await wait(800);
    await t.page.tap('#boardList li:first-child'); await wait(600);
    check(await t.page.isVisible('#player'), 'le profil du joueur ne s’ouvre pas');
    check((await t.page.textContent('#plName')) === 'Rival<b>', 'pseudo mal affiché');
    check(await t.page.evaluate(() => !document.querySelector('#player .pname b')), 'pseudo interprété comme du code');
    check((await t.page.textContent('#plBest')).startsWith('80') && (await t.page.textContent('#plRank')) === '1er', 'record ou rang faux');
    check((await t.page.textContent('#plChain')) === 'x12' && (await t.page.textContent('#plGames')) === '2', 'série ou parties fausses');
    const off = await t.page.$$eval('#plSkins canvas', l => l.map(c => c.className === 'off' ? 0 : 1).join(''));
    check(off === '1010001', 'skins débloqués faux : ' + off);
    check((await t.page.textContent('#plSkinCount')).includes('Glacier'), 'skin équipé absent');
    await t.page.tap('#backBtn'); await wait(300);
    check(await t.page.isVisible('#board'), 'la flèche ne ramène pas au classement');
    await t.page.tap('#boardList li:nth-child(3)'); await wait(600);
    check((await t.page.textContent('#plSkinCount')).includes('mise à jour'), 'joueur sans skins envoyés : pas de message');
    await t.page.tap('#plClose'); await wait(200);
    t.db.offline = true; await t.page.tap('#boardList li:first-child'); await wait(600);
    check((await t.page.textContent('#plMsg')).includes('indisponible'), 'pas de message sans connexion');
    check(t.errors.length === 0, `erreurs ${t.errors}`); await t.close();
  },
  async 'profil et partage'(){
    const t = await open('app', {store: {'v2.pseudo': 'Testeur_1'}});
    t.db.players[await t.page.evaluate(pre => JSON.parse(localStorage.getItem(pre + 'v2.pid')), t.pre)] = 'Testeur_1';
    await playUntilOver(t.page, () => { __t.S.laps = 12; __t.S.bestChain = 3; }); await wait(800);
    await t.page.tap('#shareRun'); await wait(1500);
    const size = await t.page.evaluate(() => { const i = document.getElementById('shareImg'); return i.naturalWidth + 'x' + i.naturalHeight; });
    check(size === '1080x1350', `image de partage : ${size}`);
    await t.page.tap('#shareClose'); await t.page.tap('#homeFromOver'); await t.page.tap('#profileBtn'); await wait(1200);
    const bestNow = await t.page.evaluate(() => __t.best), shown = await t.page.textContent('#pBest');
    check(bestNow >= 12 && shown.startsWith(String(bestNow)), `record du profil « ${shown} » ≠ ${bestNow}`);
    check((await t.page.textContent('#profRanks')).includes('1er'), 'rang absent du profil');
    check(t.errors.length === 0, `erreurs ${t.errors}`); await t.close();
  },
  async 'réglages : mémorisés, chrono, effets réduits'(){
    const t = await open('app');
    await t.page.tap('#setBtn'); await t.page.tap('#swClock'); await t.page.tap('#swFx'); await t.page.tap('#swSound');
    await t.page.reload(); await wait(300); await t.page.tap('#setBtn');
    const st = await t.page.evaluate(() => ['swSound', 'swFx', 'swClock'].map(i => document.getElementById(i).getAttribute('aria-checked')).join());
    check(st === 'false,true,false', `réglages non mémorisés (${st})`);
    await t.page.tap('#setClose'); await t.page.tap('#play'); await wait(300);
    check(await t.page.isHidden('#clock'), 'chrono toujours affiché');
    await t.page.evaluate(() => { const S = __t.S; S.laps = 29; S.lapAcc = Math.PI*2 - .02; });
    let mx = 0; for (let i = 0; i < 10; i++){ await wait(100); mx = Math.max(mx, await t.page.evaluate(() => __t.fx())); }
    check(mx > 0 && mx <= .35, `éclair non adouci (${mx.toFixed(2)})`);
    await t.close();
  },
  async 'lien Claude : message sans connexion'(){
    const t = await open('claude');
    await t.page.tap('#boardBtn'); await wait(400);
    check((await t.page.textContent('#boardMsg')).includes("uniquement dans l'application"), 'message du lien Claude absent');
    check(t.db.calls.length === 0, 'le lien Claude a tenté de joindre le serveur');
    await t.close();
  },
  async 'mode hors ligne de l’application'(){
    const t = await open('app', {sw: true});
    await t.page.evaluate(() => navigator.serviceWorker.ready); await t.page.reload(); await wait(800);
    await t.ctx.setOffline(true); await t.page.reload(); await wait(800);
    check(await t.page.isVisible('#menu'), 'le jeu ne s’ouvre pas hors connexion');
    await t.page.tap('#play'); await wait(800);
    check(await t.page.evaluate(() => __t.S.t > 0), 'la partie ne démarre pas hors connexion');
    await t.close();
  },
  async 'équité : un passage toujours libre (pilote, 25 s dès le tour 29)'(){
    const t = await open('app');
    await t.page.tap('#play'); await wait(300);
    await t.page.evaluate(() => {
      const S0 = __t.S; S0.laps = 29; S0.t = 70; S0.storm = true; window.__hits = 0;
      const TAU = 2*Math.PI, md = x => ((x % TAU) + TAU) % TAU;
      setInterval(() => { const S = __t.S, L = __t.lanes, u = __t.unit;
        const danger = (lane, T) => S.rocks.some(o => { if (o.passed || o.lane !== lane) return false;
          const ah = md(S.dir*(o.a - S.a)), half = (o.size*.8 + 9*u)/L[lane]; return ah < (S.omega + (o.w || 0))*T + half || ah > TAU - half; });
        if (danger(S.lane, .12) && !danger(1 - S.lane, .12)) __t.hop();
      }, 8);
    });
    await wait(25000);
    check(!(await t.page.isVisible('#over')), 'le pilote s’est fait toucher : passage bloqué ?');
    await t.close();
  },
  async 'dessin allégé : halos copiés, pas recalculés'(){
    const t = await open('app', {device: 'Pixel 7'});
    await t.page.tap('#play'); await wait(300);
    const r = await t.page.evaluate(() => new Promise(res => {
      mode = 'paused'; document.getElementById('paused').hidden = true;
      S.rocks = []; for (let i = 0; i < 8; i++){ const o = makeRock(i % 2, S.a + .6 + i*.7); o.born = -9; S.rocks.push(o); }
      S.gems = []; addGem(0, S.a + 1.2, true, 0); S.gems[0].born = -9;
      let frames = 0;
      setTimeout(() => {                                       // the pictures are painted during the first frames
        let blur = 0, grad = 0;
        const sb = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'shadowBlur');
        Object.defineProperty(ctx, 'shadowBlur', {configurable: true, get(){ return sb.get.call(this); }, set(v){ if (v > 0) blur++; sb.set.call(this, v); }});
        const cr = ctx.createRadialGradient.bind(ctx); ctx.createRadialGradient = (...a) => { grad++; return cr(...a); };
        const tick = () => { if (++frames < 30) requestAnimationFrame(tick); else {
          delete ctx.shadowBlur; delete ctx.createRadialGradient;
          const o = S.rocks[3], p = pos(o.a, lanes[o.lane]), d = DPR, px = (x, y) => ctx.getImageData(Math.round(x*d), Math.round(y*d), 1, 1).data;
          const near = px(p.x + o.size*1.15, p.y), far = px(p.x + o.size*4, p.y);   // just outside the rock (its edge is at .72 to 1.04 x size) / open space
          res({blur, grad, near: near[0], far: far[0], cache: glowCache.size});
        } };
        requestAnimationFrame(tick);
      }, 400);
    }));
    check(r.blur === 0, `${r.blur} flous recalculés en 30 images (attendu : 0)`);
    check(r.grad === 0, `${r.grad} dégradés recalculés en 30 images (attendu : 0)`);
    check(r.near > r.far + 15, `halo rouge des astéroïdes absent (${r.near} contre ${r.far} dans le vide)`);
    check(r.cache < 40, `trop d'images en mémoire : ${r.cache}`);
    check(t.errors.length === 0, `erreurs : ${t.errors}`);
    await t.close();
  },
};

// ---------- lancement ----------
(async () => {
  const filters = process.argv.slice(2).map(s => s.toLowerCase());
  const chosen = Object.entries(TESTS).filter(([name]) => !filters.length || filters.some(f => name.toLowerCase().includes(f)));
  const server = await serve(); BASE = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch();
  console.log(`Orbite ${VERSION} — ${chosen.length} test(s)\n`);
  let failed = 0; const t0 = Date.now();
  for (const [name, fn] of chosen){
    const s = Date.now();
    try { await fn(); console.log(`  ✓ ${name}  (${((Date.now() - s)/1000).toFixed(1)} s)`); }
    catch(e){ failed++; console.log(`  ✗ ${name}\n      → ${e.message.split('\n').slice(0, process.env.DEBUG ? 30 : 1).join('\n')}`); }
  }
  await browser.close(); server.close();
  console.log(`\n${chosen.length - failed}/${chosen.length} réussis en ${((Date.now() - t0)/1000).toFixed(0)} s`);
  process.exit(failed ? 1 : 0);
})();
