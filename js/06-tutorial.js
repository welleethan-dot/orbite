// Orbite · Didacticiel et « Comment jouer »
// Fichiers chargés dans l'ordre de leur numéro ; ils partagent les mêmes variables.

// ---------- tutorial ----------
// A guided first run: slow, no game over, one thing learnt per step. Launched on a new player's first
// "Jouer", and again from "Comment jouer". Players who already played are not forced into it.
let tutoDone = store.get('tutoDone', false) || games > 0, tutoFrom = 'play';
const TUTO = [
  {id:'tap',    goal:3, prog:'Sauts', text:"Touchez n'importe où sur l'écran : la sonde saute d'une orbite à l'autre."},
  {id:'dodge',  goal:2, prog:'Astéroïdes évités', text:"Un astéroïde arrive sur votre orbite ! Changez d'orbite pour l'éviter."},
  {id:'gem',    text:"Passez sur l'éclat ◆ pour le ramasser. Les éclats servent à acheter des skins dans la boutique."},
  {id:'rare',   text:"Un éclat rare, collé à un astéroïde, vaut 3 ◆. Attrapez-le, puis changez vite d'orbite !"},
  {id:'lap',    text:"Votre score, c'est le nombre de tours, affiché en haut à gauche. Faites un tour complet."},
  {id:'rain',   info:true, ev:['Pluie d’astéroïdes', 'rain', 1, 1.2], text:"Plus vous tenez, plus ça se corse. À 30 tours, voici ce qui s'affichera : la pluie d'astéroïdes. Ils arrivent bien plus souvent."},
  {id:'fast',   info:true, ev:['Astéroïdes rapides', 'fast', 2, 1.2], text:"À 40 tours, voici ce qui s'affichera : les astéroïdes rapides. Repérez leur traînée, ils foncent droit sur vous."},
  {id:'flip',   info:true, ev:['Inversion', 'flip', 2, 1.6], text:"À 50 tours, voici ce qui s'affichera : l'inversion. La sonde change de sens, et pendant l'alerte aucun astéroïde n'arrive."},
  {id:'record', info:true, ev:['Nouveau record', 'record', 1, 1.2], text:"Et voici ce qui s'affichera quand vous battrez votre record : tout passe à l'or."},
  {id:'ready',  info:true, last:true, text:"Vous êtes prêt ! Retenez les couleurs : chaque palier affiche son nom en haut de l'écran. Bonne chance !"},
];
function playPressed(){ if (!tutoDone) startTutorial('play'); else start(); }
function startTutorial(from){
  tutoFrom = from; fx = null; testRun = null; audio();
  S = fresh(); S.tuto = {step: 0}; mode = 'play';
  ui.show(null); ui.hud(true); ui.score(); $('clock').textContent = ''; $('testTag').hidden = true;
  $('hint').hidden = true; $('tuto').hidden = false;
  tutoEnter(0);
}
function clearEvent(){ fx = null; clearTimeout(bannerTimer2); $('banner').hidden = true; $('banner').classList.remove('hold'); }
function tutoEnter(i){
  const st = TUTO[i];
  clearEvent();
  S.tuto = {step: i, count: 0, wait: .6, advance: 0, rock: null, gem: null, lapStart: S.laps};
  S.rocks = []; S.gems = [];
  $('tutoStep').textContent = `Didacticiel · ${i + 1}/${TUTO.length}`;
  $('tutoText').textContent = st.text;
  $('tutoNext').hidden = !st.info; $('tutoNext').textContent = st.last ? 'JOUER' : 'Suivant';
  $('tutoSkip').hidden = !!st.last;
  $('sc').classList.toggle('glow', st.id === 'lap');
  tutoProg();
  resize();                                     // re-fit the orbits above the card (its height follows the text)
  if (st.ev){ const [title, col, pulses, dur] = st.ev; banner(title, EVENT_COL[col], pulses, dur, true); }
  if (st.id === 'flip') S.revWarn = 1.6;
}
function tutoProg(msg){
  const st = TUTO[S.tuto.step];
  $('tutoProg').textContent = msg || (st.goal ? `${st.prog} : ${S.tuto.count}/${st.goal}` : '');
}
function tutoStepDone(){ const T = S.tuto; if (T.advance) return; T.advance = .7; tutoProg('Bravo !'); sfx.go(); }
function tutoHop(){
  const T = S.tuto; if (TUTO[T.step].id !== 'tap' || T.advance) return;
  T.count++; tutoProg(); if (T.count >= TUTO[T.step].goal) tutoStepDone();
}
function tutoHit(){                              // no game over in the tutorial: the step starts again
  const T = S.tuto, p = pos();
  burst(p.x, p.y, COL.rock, 16, 140); noise(.25, .15); buzz(40); S.shake = .5;
  S.rocks = []; S.gems = []; T.rock = T.gem = null; T.wait = 1;
  tutoProg('Touché ! On recommence.');
}
function tutoSpawn(){
  const T = S.tuto, id = TUTO[T.step].id, other = 1 - S.lane;
  if (id === 'dodge'){ T.rock = makeRock(S.lane, S.a + S.dir*2.4); S.rocks.push(T.rock); }
  if (id === 'gem'){ addGem(other, S.a + S.dir*2.6, false, 0); T.gem = S.gems[S.gems.length - 1]; }
  if (id === 'rare'){
    const ra = S.a + S.dir*3.4;
    T.rock = makeRock(other, ra); S.rocks.push(T.rock);
    addGem(other, ra - S.dir*.75, true, 0); T.gem = S.gems[S.gems.length - 1];
  }
}
// Event steps: a live, harmless demo keeps running until the player taps "Suivant".
function tutoDemo(dt){
  const T = S.tuto, id = TUTO[T.step].id, lane = Math.random() < .5 ? 0 : 1;
  if (id === 'flip' && S.revWarn <= 0){            // flip again every few seconds
    T.flipT = (T.flipT ?? 2.6) - dt;
    if (T.flipT <= 0){ T.flipT = 2.6; S.revWarn = 1.6; }
  }
  T.demoT = (T.demoT || 0) - dt; if (T.demoT > 0) return;
  if (id === 'rain'){ const r = makeRock(lane, S.a + S.dir*(1.8 + Math.random()*2.6)); r.ghost = true; S.rocks.push(r); T.demoT = .28; }
  if (id === 'fast'){
    const w = .9 + Math.random()*.4, m = 1.8 + Math.random(), r = makeRock(lane, S.a + S.dir*m*(S.omega + w)/S.omega, w, S.a + S.dir*m);
    r.ghost = true; S.rocks.push(r); T.demoT = .9;
  }
  if (id === 'flip' && S.revWarn <= 0){ const r = makeRock(lane, S.a + S.dir*(2 + Math.random()*1.5)); r.ghost = true; S.rocks.push(r); T.demoT = .7; }
}
function tutoUpdate(dt){
  const T = S.tuto, st = TUTO[T.step];
  if (T.advance){ T.advance -= dt; if (T.advance <= 0){ T.advance = 0; tutoNext(); } return; }
  if (T.wait > 0){ T.wait -= dt; if (T.wait <= 0){ T.wait = 0; tutoProg(); tutoSpawn(); } return; }
  if (st.info){ tutoDemo(dt); return; }
  if (st.id === 'dodge' && T.rock && T.rock.passed){
    T.count++; tutoProg(); T.rock = null;
    if (T.count >= st.goal) tutoStepDone(); else T.wait = .5;
  }
  if (st.id === 'gem' && T.gem){
    if (T.gem.got) tutoStepDone();
    else if (T.gem.passed){ T.gem = null; T.wait = .3; tutoProg('Raté, il en revient un.'); }
  }
  if (st.id === 'rare' && T.gem){
    if (T.gem.got && T.rock.passed) tutoStepDone();
    else if (T.gem.passed && !T.gem.got){ S.rocks = []; T.gem = T.rock = null; T.wait = .6; tutoProg('Raté, on recommence.'); }
  }
  if (st.id === 'lap' && S.laps > T.lapStart) tutoStepDone();
}
function tutoNext(){ const i = S.tuto.step + 1; if (i < TUTO.length) tutoEnter(i); else tutoFinish(true); }
function tutoFinish(play){
  tutoDone = true; store.set('tutoDone', true);
  clearEvent(); $('tuto').hidden = true; $('sc').classList.remove('glow'); resize();
  if (play) start(); else goHome();
}
$('tutoNext').addEventListener('click', () => { if (TUTO[S.tuto.step].last) tutoFinish(true); else tutoNext(); });
$('tutoSkip').addEventListener('click', () => tutoFinish(tutoFrom === 'play'));
$('howBtn').addEventListener('click', () => ui.show('howto'));
$('howClose').addEventListener('click', () => openSettings());   // « Comment jouer » lives in the settings
$('tutoAgain').addEventListener('click', () => startTutorial('howto'));
