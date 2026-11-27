// Orbite · Bases : raccourcis, couleurs, sauvegarde scellée, statistiques
// Fichiers chargés dans l'ordre de leur numéro ; ils partagent les mêmes variables.

const $ = id => document.getElementById(id);
const cv = $('c'), ctx = cv.getContext('2d');
const TAU = Math.PI * 2;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const calmFx = () => reduceMotion || settings.lowfx;   // "Réduire les effets lumineux" (or the phone's reduce-motion setting)
const COL = {void:'#0A0C22', void2:'#151A44', sun:'#F2A541', ion:'#BFF3FF', rock:'#FF4D6D', shard:'#FFD66B', mist:'#9AA3D9'};

// ---------- storage (best-effort) ----------
const STORE_PREFIX = 'orbite.';
const TEST_TOOLS = STORE_PREFIX !== 'orbite.';     // hidden test mode: test address (/beta/) only                  // the beta build uses its own prefix (separate save)
const hypot = Math.hypot;                        // private copy: cannot be replaced from the console
const store = {
  get(k, d){ try { const v = localStorage.getItem(STORE_PREFIX+k); return v == null ? d : JSON.parse(v); } catch(e){ return d; } },
  set(k, v){ try { localStorage.setItem(STORE_PREFIX+k, JSON.stringify(v)); } catch(e){} if (SEALED.includes(k)) seal(); }
};
// Progress is sealed: editing these values by hand (browser console) breaks the seal and the progress is reset.
// It stops casual cheating only; the online leaderboard is protected on the server.
// Each group of values has its own seal, so adding a group later never invalidates the existing ones.
const SEAL_GROUPS = [
  {seal: 'v2.seal',  keys: ['v2.best', 'v2.games', 'v2.laps', 'v2.gems', 'v2.wallet', 'v2.owned', 'v2.near'], skin: true},
  {seal: 'v2.seal2', keys: ['v2.stats']},                       // detailed stats for the future Profile screen (2.0)
];
const SEALED = SEAL_GROUPS.flatMap(g => g.keys);
function sealOf(g){
  let h = 0x811c9dc5, txt = 'orbite·' + g.keys.map(k => { try { return localStorage.getItem(STORE_PREFIX + k); } catch(e){ return ''; } }).join('|');
  for (let i = 0; i < txt.length; i++){ h ^= txt.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36);
}
function seal(){ for (const g of SEAL_GROUPS){ try { localStorage.setItem(STORE_PREFIX + g.seal, sealOf(g)); } catch(e){} } }
for (const g of SEAL_GROUPS){
  let saved = null; try { saved = localStorage.getItem(STORE_PREFIX + g.seal); } catch(e){}
  if (saved === null){ try { localStorage.setItem(STORE_PREFIX + g.seal, sealOf(g)); } catch(e){} continue; }   // first time: trust what is there
  if (saved !== sealOf(g)){                                      // edited by hand: this group is reset
    try { for (const k of g.keys) localStorage.removeItem(STORE_PREFIX + k); if (g.skin) localStorage.setItem(STORE_PREFIX + 'v2.skin', '"sonde"'); } catch(e){}
    try { localStorage.setItem(STORE_PREFIX + g.seal, sealOf(g)); } catch(e){}
  }
}
// Stats v2: the record is the best number of laps. (v1 stored points, which are not comparable.)
let best = store.get('v2.best', 0), games = store.get('v2.games', 0), lapsTotal = store.get('v2.laps', 0),
    gemsTotal = store.get('v2.gems', 0), muted = store.get('muted', false);
let wallet = store.get('v2.wallet', gemsTotal), nearTotal = store.get('v2.near', 0);            // spendable crystals (gemsTotal = lifetime)
let owned = store.get('v2.owned', ['sonde']), equipped = store.get('v2.skin', 'sonde');
// Player settings (2.2). Sound stays in its own key ('muted').
let settings = Object.assign({vib: true, lowfx: false, clock: true, stats: true}, store.get('settings', {}));   // stats: anonymous statistics (2.6)
// Count a finished run in the stats (never for test runs). Returns true on a new record.
function recordRun(){
  if (testRun) return false;
  games++; lapsTotal += S.laps; gemsTotal += S.shards + (S.bonus || 0); wallet += S.shards + (S.bonus || 0); store.set('v2.wallet', wallet);   // + stage bonus (2.4)
  nearTotal += S.near || 0; store.set('v2.near', nearTotal);
  // Detailed stats, recorded now for the future Profile screen (not shown yet).
  const st = store.get('v2.stats', {});
  st.bestChain   = Math.max(st.bestChain   || 0, S.bestChain || 0);   // best near-miss chain (x…)
  st.bestNearRun = Math.max(st.bestNearRun || 0, S.near || 0);       // most near misses in one run
  st.bestGemsRun = Math.max(st.bestGemsRun || 0, S.shards);          // most crystals in one run
  st.bestTime    = Math.max(st.bestTime    || 0, Math.round(S.t));   // longest run (s)
  st.timeTotal   = (st.timeTotal || 0) + Math.round(S.t);            // total play time (s)
  st.since       = st.since || new Date().toISOString().slice(0, 10);
  st.hops        = (st.hops || 0) + (S.hops || 0);                    // total jumps (2.1)
  if (S.laps > (st.bestLapsSeen || 0)){ st.bestLapsSeen = S.laps; st.bestDate = new Date().toISOString().slice(0, 10); }   // date of the record
  store.set('v2.stats', st);
  const isBest = S.laps > best; if (isBest) best = S.laps;
  store.set('v2.games', games); store.set('v2.laps', lapsTotal); store.set('v2.gems', gemsTotal); store.set('v2.best', best);
  queueScore();                                  // online leaderboard
  return isBest;
}
