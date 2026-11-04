/* game-kit b4c715e: js/mg-sound.js — edit in game-kit and run tools/kit-sync.js */
// The default sounds of the library mini games (standard 1.10.18): every js/mg-<type>.js calls hooks.sound(name, ctx, v); a game that gives
// no sound hook of its own gets these, made on the spot with WebAudio (ctx.audio = js/audio.js: tone / noiseBurst; no sound files).
//   mgSound(type, name, audio, v)  plays one cue ('bell' v = which bell, 'turn' / 'hum' / 'step' v = 0..1); unknown names are silent
//   mgSoundHook(type)              (name, ctx, v) => mgSound(type, name, ctx && ctx.audio, v), with a short gap per name so a drag is not a buzz
// A game that wants its own sound for a cue passes hooks.sound and calls mgSound(...) for the rest.

/** the bells of echo-bells / rhythm pads: a minor pentatonic, low to high (Hz) */
export const BELL_FREQS = [523.25, 622.25, 698.46, 783.99, 932.33, 1046.5];

const T = (a, o) => a.tone(o), N = (a, o) => a.noiseBurst(o);
const bell = (a, f, g = 0.07, at = 0) => {   // a small temple bell: the note, its bright overtone and a short strike
  T(a, { at, dur: 1.4, freq: f, type: 'sine', gain: g, wet: 0.45, attack: 0.004 });
  T(a, { at, dur: 0.7, freq: f * 2.76, type: 'sine', gain: g * 0.35, wet: 0.45, attack: 0.002 });
  T(a, { at, dur: 0.35, freq: f * 5.4, type: 'sine', gain: g * 0.12, wet: 0.3, attack: 0.002 });
  N(a, { at, dur: 0.02, freq: 4200, q: 3, gain: 0.05, wet: 0.1 });
};
const tick = (a, f = 2600, g = 0.12) => N(a, { dur: 0.018, freq: f, q: 5, gain: g, wet: 0.08 });
const thud = (a, f = 220, g = 0.25) => N(a, { dur: 0.09, freq: f, q: 1.5, gain: g, type: 'lowpass', wet: 0.15 });

/** the shared cues; a type's own table (below) wins */
const COMMON = {
  ok: (a) => { T(a, { dur: 0.5, freq: 659.25, type: 'triangle', gain: 0.06, wet: 0.35 }); T(a, { at: 0.12, dur: 0.7, freq: 987.77, type: 'triangle', gain: 0.06, wet: 0.4 }); },
  miss: (a) => T(a, { dur: 0.28, freq: 196, type: 'triangle', gain: 0.07, slide: 0.8, wet: 0.2 }),
  wrong: (a) => T(a, { dur: 0.28, freq: 196, type: 'triangle', gain: 0.07, slide: 0.8, wet: 0.2 }),
  bad: (a) => T(a, { dur: 0.28, freq: 196, type: 'triangle', gain: 0.07, slide: 0.8, wet: 0.2 }),
  bump: (a) => thud(a, 160, 0.3),
  off: (a) => T(a, { dur: 0.22, freq: 220, type: 'sawtooth', gain: 0.03, slide: 0.7, wet: 0.15 }),
  slip: (a) => T(a, { dur: 0.22, freq: 260, type: 'sawtooth', gain: 0.03, slide: 0.7, wet: 0.15 }),
  drop: (a) => { tick(a, 1800, 0.14); thud(a, 300, 0.12); },
  tick: (a) => tick(a),
  click: (a) => tick(a, 2200, 0.16),
  turn: (a) => tick(a, 1900, 0.12),
  tilt: (a) => tick(a, 2400, 0.1),
  move: (a) => N(a, { dur: 0.07, freq: 1800, q: 1, gain: 0.06, type: 'highpass', wet: 0.05 }),
  slide: (a) => N(a, { dur: 0.12, freq: 900, q: 0.8, gain: 0.12, wet: 0.08, sweep: 0.6 }),
  flip: (a) => N(a, { dur: 0.08, freq: 3000, q: 0.8, gain: 0.08, type: 'highpass', wet: 0.05 }),
  tile: (a) => { tick(a, 1500, 0.1); T(a, { dur: 0.08, freq: 880, type: 'triangle', gain: 0.025, wet: 0.1 }); },
  pick: (a) => N(a, { dur: 0.06, freq: 2600, q: 1, gain: 0.07, type: 'highpass', wet: 0.05 }),
  put: (a) => thud(a, 380, 0.18),
  join: (a) => T(a, { dur: 0.2, freq: 784, type: 'triangle', gain: 0.04, wet: 0.25 }),
  pair: (a) => { T(a, { dur: 0.25, freq: 784, type: 'triangle', gain: 0.045, wet: 0.3 }); T(a, { at: 0.08, dur: 0.3, freq: 1046.5, type: 'triangle', gain: 0.04, wet: 0.3 }); },
  found: (a) => { T(a, { dur: 0.3, freq: 880, type: 'sine', gain: 0.06, wet: 0.35 }); T(a, { at: 0.06, dur: 0.4, freq: 1318.5, type: 'sine', gain: 0.03, wet: 0.35 }); },
  press: (a) => tick(a, 1400, 0.16),
  set: (a) => { tick(a, 3200, 0.16); T(a, { dur: 0.05, freq: 1500, type: 'square', gain: 0.012, wet: 0.05 }); },
  lift: (a) => N(a, { dur: 0.05, freq: 3600, q: 6, gain: 0.04, wet: 0.05 }),
  step: (a, v = 0.5) => N(a, { dur: 0.1, freq: 240, q: 2, gain: 0.08 + 0.4 * v, type: 'lowpass', wet: 0.7 }),
  hit: (a) => thud(a, 180, 0.4),
  beat: (a) => T(a, { dur: 0.16, freq: 110, type: 'sine', gain: 0.12, slide: 0.6, wet: 0.2 }),
  draw: (a) => N(a, { dur: 0.05, freq: 5000, q: 0.7, gain: 0.025, type: 'highpass', wet: 0.03 }),
  zoom: (a) => T(a, { dur: 0.08, freq: 1200, type: 'square', gain: 0.008, wet: 0.05 }),
  ring: (a) => tick(a, 1700, 0.08),
  shutter: (a) => { N(a, { dur: 0.03, freq: 2500, q: 2, gain: 0.25, wet: 0.05 }); N(a, { at: 0.07, dur: 0.04, freq: 1800, q: 2, gain: 0.2, wet: 0.05 }); },
  pass: (a) => N(a, { dur: 0.5, freq: 500, q: 0.6, gain: 0.05, wet: 0.5, sweep: 0.5 }),
  fill: (a) => N(a, { dur: 0.6, freq: 700, q: 0.7, gain: 0.08, wet: 0.2, sweep: 1.6 }),
  pour: (a) => N(a, { dur: 0.6, freq: 900, q: 0.7, gain: 0.08, wet: 0.2, sweep: 0.7 }),
  empty: (a) => N(a, { dur: 0.45, freq: 500, q: 0.8, gain: 0.08, wet: 0.2, sweep: 0.5 }),
  pump: (a) => { thud(a, 140, 0.3); N(a, { at: 0.05, dur: 0.12, freq: 1600, q: 0.8, gain: 0.05, type: 'highpass', wet: 0.1 }); },
  hiss: (a) => N(a, { dur: 0.9, freq: 4000, q: 0.5, gain: 0.12, type: 'highpass', wet: 0.2, sweep: 0.6 }),
  hum: (a, v = 0) => T(a, { dur: 0.35, freq: 140 + 120 * v, type: 'sine', gain: 0.012 + 0.02 * v, wet: 0.2, attack: 0.05 }),
  gasp: (a) => N(a, { dur: 0.45, freq: 1200, q: 0.7, gain: 0.18, wet: 0.15, sweep: 1.8 }),
  heard: (a) => { T(a, { dur: 0.5, freq: 55, type: 'sawtooth', gain: 0.08, slide: 1.4, wet: 0.4 }); N(a, { dur: 0.25, freq: 300, q: 1, gain: 0.3, type: 'lowpass', wet: 0.5 }); },
};

/** a type's own sounds where the shared one would be wrong */
const BY_TYPE = {
  'echo-bells': { bell: (a, i = 0) => bell(a, BELL_FREQS[(i | 0) % BELL_FREQS.length]) },
  'rhythm-taps': { beat: (a) => bell(a, BELL_FREQS[0], 0.05), hit: (a) => { thud(a, 160, 0.35); bell(a, BELL_FREQS[2], 0.035); } },
  'tune-radio': {   // static that clears into a carrier tone as the needle nears the voice
    turn: (a, v = 0) => { N(a, { dur: 0.14, freq: 2400, q: 0.4, gain: 0.07 * (1 - v) + 0.01, wet: 0.05 }); if (v > 0.2) T(a, { dur: 0.16, freq: 440 + 220 * v, type: 'sine', gain: 0.03 * v, wet: 0.2, vibrato: 6 * (1 - v) }); },
  },
  'code-drums': { turn: (a) => tick(a, 1300, 0.16) },
  'cipher-wheel': { tick: (a) => tick(a, 1100, 0.14) },
  'compass-bearing': { tick: (a) => tick(a, 3400, 0.08) },
  'switch-panel': { click: (a) => { tick(a, 1600, 0.2); thud(a, 500, 0.06); } },
  'lock-pick': { drop: (a) => { N(a, { dur: 0.03, freq: 2400, q: 3, gain: 0.12, wet: 0.05 }); N(a, { at: 0.04, dur: 0.03, freq: 2000, q: 3, gain: 0.08, wet: 0.05 }); } },
  'balance-scale': { put: (a) => { tick(a, 2800, 0.12); T(a, { dur: 0.4, freq: 1568, type: 'sine', gain: 0.02, wet: 0.3 }); } },
  'kana-word': { tile: (a) => tick(a, 1200, 0.12) },
};

/** play one cue of a library mini game (silent without audio or for a name no table has) */
export function mgSound(type, name, audio, v) {
  if (!audio || typeof audio.tone !== 'function') return false;
  const fn = (BY_TYPE[type] && BY_TYPE[type][name]) || COMMON[name];
  if (!fn) return false;
  try { fn(audio, v); return true; } catch { return false; }
}

/** the minimum gap between two plays of one cue (ms): drags and per-frame cues stay a sound, not a buzz */
const GAP = { hum: 300, draw: 70, turn: 45, tick: 45, tilt: 45, zoom: 60, ring: 60, move: 50, lift: 50 };

/** the default hooks.sound of a library mini game */
export function mgSoundHook(type, now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())) {
  const last = {};
  return (name, ctx, v) => {
    const t = now(), g = GAP[name] || 0;
    if (g && last[name] != null && t - last[name] < g) return false;
    last[name] = t;
    return mgSound(type, name, ctx && ctx.audio, v);
  };
}

/** every cue name the library mini games use that has a sound (for the test) */
export const MG_SOUND_NAMES = Object.keys(COMMON);
export const mgSoundHas = (type, name) => !!((BY_TYPE[type] && BY_TYPE[type][name]) || COMMON[name]);
