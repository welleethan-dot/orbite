// Orbite · Sons (tous générés par le code) et vibrations
// Fichiers chargés dans l'ordre de leur numéro ; ils partagent les mêmes variables.

// ---------- audio ----------
let ac = null, audioCameBack = false;
function newAudio(){ try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch(e){ ac = null; } }
function audio(){
  if (!ac || ac.state === 'closed') newAudio();
  if (ac && ac.state !== 'running') ac.resume().catch(() => {});
  return ac;
}
// iOS interrupts audio while the app is in the background and sometimes never gives it back
// (state "interrupted", or "suspended" forever). We pause it ourselves when leaving; on the first
// touch after coming back we resume it, and if it is still stuck we rebuild it from scratch
// (all sounds are synthesised, so nothing is lost).
function unlockAudio(){                       // a silent sample played inside the touch: required by iOS
  try { const b = ac.createBuffer(1, 1, 22050), s = ac.createBufferSource(); s.buffer = b; s.connect(ac.destination); s.start(0); ac.resume().catch(() => {}); } catch(e){}
}
function wakeAudio(){
  if (!ac || ac.state === 'running') return;
  if (ac.state === 'suspended' && !audioCameBack){
    const old = ac; old.resume().catch(() => {});
    setTimeout(() => { if (ac === old && old.state !== 'running') audioCameBack = true; }, 300);  // stuck: rebuild on next touch
    return;
  }
  try { ac.close(); } catch(e){}
  newAudio(); if (ac) unlockAudio();
  audioCameBack = false;
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden){ if (ac && ac.state === 'running') ac.suspend().catch(() => {}); }
  else audioCameBack = true;
});
for (const ev of ['touchend', 'pointerdown', 'click', 'keydown']) addEventListener(ev, wakeAudio, {capture: true, passive: true});
function tone(f1, f2, dur, type='sine', vol=.15, at=0){
  if (muted) return; const a = audio(); if (!a) return;
  const o = a.createOscillator(), g = a.createGain(), t = a.currentTime + at;
  o.type = type; o.frequency.setValueAtTime(f1, t); o.frequency.exponentialRampToValueAtTime(f2, t+dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t+dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t+dur);
}
function noise(dur=.5, vol=.3){
  if (muted) return; const a = audio(); if (!a) return;
  const len = a.sampleRate*dur, b = a.createBuffer(1, len, a.sampleRate), d = b.getChannelData(0);
  for (let i=0;i<len;i++) d[i] = (Math.random()*2-1) * Math.pow(1-i/len, 2);
  const s = a.createBufferSource(), g = a.createGain(), f = a.createBiquadFilter();
  f.type='lowpass'; f.frequency.value = 900; s.buffer = b; g.gain.value = vol;
  s.connect(f).connect(g).connect(a.destination); s.start();
}
const sfx = {
  hop(up){ tone(up?520:390, up?780:300, .09, 'triangle', .08); },
  shard(){ tone(880, 1760, .12, 'sine', .12); setTimeout(()=>tone(1320, 2200, .1, 'sine', .08), 60); },
  lap(){ tone(440, 660, .15, 'sine', .07); },
  ui(){ tone(1250, 980, .045, 'triangle', .05); },                 // menu buttons
  equip(){ tone(660, 990, .08, 'triangle', .07); tone(990, 1480, .12, 'sine', .06, .07); tone(2640, 2640, .1, 'sine', .025, .16); },   // skin equipped
  near(chain){                                                      // near miss: a swish, pitched up along a chain
    const f = 1400 + Math.min(chain - 1, 4)*180;
    tone(f*1.4, f*.55, .14, 'sawtooth', .022); tone(f, f*1.5, .09, 'sine', .06, .02);
  },
  go(){ tone(520, 1040, .12, 'triangle', .07); },                   // play / replay / resume
  piggy(){                                                          // skin bought: coins into a piggy bank
    [0, .07, .15, .26, .38].forEach(at => {
      const f = 2100 + Math.random()*700;
      tone(f, f*.98, .14, 'sine', .07, at); tone(f*2.76, f*2.7, .08, 'sine', .025, at);   // metallic clink
    });
    tone(190, 80, .18, 'triangle', .12, .5);                         // thud of the coins landing
    [1568, 1976, 2637].forEach((f, i) => tone(f, f, .22, 'sine', .05, .62 + i*.07));    // little sparkle
  },
  crash(){ noise(.6, .35); tone(180, 40, .5, 'sawtooth', .12); }
};
function buzz(p){ if (!settings.vib) return; try { navigator.vibrate && navigator.vibrate(p); } catch(e){} }
