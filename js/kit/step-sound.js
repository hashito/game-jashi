/* game-kit 6e0b6f0: js/step-sound.js — edit in game-kit and run tools/kit-sync.js */
// Footsteps by the floor underfoot, and the small noises of a house (standard 1.8). Pure data + rules; js/audio.js plays them.
// The survey (2026-11, 24 games): 16 games each wrote their own audio.step(surface) with 2-6 surfaces (arakawa grass/carpet/metal/
// water, miru-delivery grating/asphalt/tile, heiengo asphalt, yakkyoku vinyl ...) and game-core always said 'lino'. Now one table:
//   audio.step(stepSurfaceOf(room, { def: 'wood' }), { run, crouch })     // game-core does this on every step of the player
//   audio.noise('knock', { pos, n: 3 })                                     // knock thud rattle scrape slide creakFloor drip tap rustle splash
//     1.9: bell suzu chime phoneRing clack cloth wetStep footsteps scratch glass whisper breath clockTick creakDoor switch (+ registerNoise)
// A room picks its surface with `step` in plan.rooms ("tatami"), or it follows its floorTex ("tatami_old" -> tatami,
// "gravel_snow" -> snow ...), or its kind (outdoor -> dirt), or game.json audio.step, else 'lino'.

// each part is a noise burst ({ dur, freq, q, gain, type, wet, sweep, at }) or a tone ({ tone: true, dur, freq, type, gain, slide })
export const STEP_SURFACES = {
  lino: [{ dur: 0.07, freq: 380, q: 1.5, gain: 0.14, type: 'lowpass', wet: 0.3 }, { dur: 0.02, freq: 2400, q: 2, gain: 0.045, wet: 0.3 }],
  wax: [{ dur: 0.06, freq: 520, q: 1.5, gain: 0.13, type: 'lowpass', wet: 0.6 }, { dur: 0.018, freq: 3200, q: 3, gain: 0.06, wet: 0.8 }],
  wood: [{ dur: 0.08, freq: 260, q: 1.2, gain: 0.16, type: 'lowpass', wet: 0.35 }, { tone: true, dur: 0.09, freq: 150, type: 'triangle', gain: 0.02, slide: 0.8, wet: 0.4 }, { dur: 0.015, freq: 1800, q: 2, gain: 0.03, wet: 0.3 }],
  tatami: [{ dur: 0.1, freq: 900, q: 0.6, gain: 0.06, wet: 0.08, sweep: 0.6 }, { dur: 0.05, freq: 200, q: 1, gain: 0.07, type: 'lowpass', wet: 0.05 }],
  carpet: [{ dur: 0.07, freq: 260, q: 1, gain: 0.1, type: 'lowpass', wet: 0.1 }],
  tile: [{ dur: 0.05, freq: 1800, q: 2, gain: 0.12, wet: 0.5 }, { dur: 0.05, freq: 420, q: 1.5, gain: 0.1, type: 'lowpass', wet: 0.5 }],
  concrete: [{ dur: 0.06, freq: 420, q: 1.5, gain: 0.13, type: 'lowpass', wet: 0.45 }, { dur: 0.02, freq: 2600, q: 2, gain: 0.04, wet: 0.45 }],
  gravel: [{ dur: 0.14, freq: 2200, q: 0.7, gain: 0.09, wet: 0.08, sweep: 0.7 }, { at: 0.03, dur: 0.1, freq: 3400, q: 1, gain: 0.05, wet: 0.08 }, { dur: 0.05, freq: 300, q: 1, gain: 0.06, type: 'lowpass', wet: 0.05 }],
  grass: [{ dur: 0.09, freq: 1400, q: 0.8, gain: 0.08, wet: 0.05 }, { dur: 0.05, freq: 300, q: 1, gain: 0.06, type: 'lowpass', wet: 0.05 }],
  dirt: [{ dur: 0.07, freq: 500, q: 0.9, gain: 0.09, type: 'lowpass', wet: 0.05 }, { dur: 0.04, freq: 1600, q: 1, gain: 0.03, wet: 0.05 }],
  snow: [{ dur: 0.16, freq: 1100, q: 1.4, gain: 0.08, wet: 0.03, sweep: 1.4 }, { at: 0.02, dur: 0.1, freq: 2600, q: 3, gain: 0.03, wet: 0.03 }],
  mud: [{ dur: 0.16, freq: 420, q: 1.2, gain: 0.1, type: 'lowpass', wet: 0.1, sweep: 0.5 }, { at: 0.06, dur: 0.08, freq: 900, q: 4, gain: 0.04, wet: 0.1 }],
  water: [{ dur: 0.18, freq: 900, q: 0.7, gain: 0.1, wet: 0.4, sweep: 0.5 }, { at: 0.04, dur: 0.06, freq: 2200, q: 3, gain: 0.03, wet: 0.4 }],
  metal: [{ dur: 0.06, freq: 380, q: 1.5, gain: 0.12, type: 'lowpass', wet: 0.5 }, { tone: true, dur: 0.12, freq: 220, type: 'triangle', gain: 0.025, wet: 0.6 }],
  grating: [{ dur: 0.06, freq: 1600, q: 5, gain: 0.15, wet: 0.5 }, { at: 0.01, dur: 0.12, freq: 700, q: 8, gain: 0.075, wet: 0.5 }],
};

// floorTex / look ids -> surface (first match wins); covers the kit catalog's floor ids and the games' own names
const BY_TEX = [
  [/wallpaper|ceiling|plaster/, null], [/tatami|igusa/, 'tatami'], [/snow/, 'snow'], [/gravel|jari|ballast/, 'gravel'], [/mud|paddy|bog|wet_earth/, 'mud'],
  [/water|puddle|flood|tide/, 'water'], [/grass|aze|moss|lawn|weed/, 'grass'], [/(^|_)(dirt|earth|soil|doma|path|field)(_|\d|$)/, 'dirt'],
  [/grating|grate|mesh_floor/, 'grating'], [/metal|steel|iron|plate|rust/, 'metal'], [/carpet|rug|rubber|(^|_)mat(_|$)|felt/, 'carpet'],
  [/tile|terrazzo|ceramic|marble/, 'tile'], [/wax|hospital|school_floor/, 'wax'], [/lino|vinyl|cushion/, 'lino'],
  [/wood|plank|board|floor_kura|kura_floor|engawa|cedar|pine|parquet|flooring/, 'wood'],
  [/leaves|sand|dust|ground|forest/, 'dirt'], [/wet_floor/, 'wax'],
  [/concrete|asphalt|stone|granite|cobble|paving|curb|road/, 'concrete'],
];
const BY_KIND = { outdoor: 'dirt', stairs: 'concrete' };

/** the surface for a texture / look id, or null */
export function surfaceOfTex(id) {
  if (!id) return null;
  const s = String(id).toLowerCase();
  if (STEP_SURFACES[s]) return s;
  for (const [re, surf] of BY_TEX) if (re.test(s)) return surf;   // a wall texture used as a floor says nothing
  return null;
}

/** the surface to walk on in a plan room: room.step > floorTex > look > kind > def > 'lino' */
export function stepSurfaceOf(room, { def } = {}) {
  if (room && room.step && STEP_SURFACES[room.step]) return room.step;
  return (room && (surfaceOfTex(room.floorTex) || surfaceOfTex(room.look) || BY_KIND[room.kind])) || (STEP_SURFACES[def] ? def : 'lino');
}

/** the parts of one step: louder and closer together when running, softer crouched; a small random detune per step */
export function stepParts(surface, { run = false, crouch = false, rnd = Math.random } = {}) {
  const k = crouch ? 0.45 : run ? 1.3 : 1;
  return (STEP_SURFACES[surface] || STEP_SURFACES.lino).map((p) => ({ ...p, gain: p.gain * k, freq: p.freq * (0.92 + rnd() * 0.16) }));
}

// the small noises of a house that horror games kept writing (hasshaku knock / scrape, mizen-chosho footsteps, the miru games
// drip / tap ...). `n` repeats with `gap` seconds between (a knock of 3); every part takes the pos for the spatial bus.
export const NOISES = {
  knock: { n: 3, gap: 0.32, parts: [{ dur: 0.07, freq: 180, q: 1.4, gain: 0.5, type: 'lowpass', wet: 0.45 }, { dur: 0.02, freq: 1200, q: 2, gain: 0.08, wet: 0.4 }] },
  thud: { parts: [{ dur: 0.3, freq: 120, q: 1, gain: 0.6, type: 'lowpass', wet: 0.5 }, { tone: true, dur: 0.25, freq: 60, type: 'sine', gain: 0.18, slide: 0.6, wet: 0.4 }] },
  rattle: { n: 6, gap: 0.05, parts: [{ dur: 0.035, freq: 1400, q: 6, gain: 0.16, wet: 0.3 }] },
  scrape: { parts: [{ dur: 0.7, freq: 700, q: 3, gain: 0.14, wet: 0.35, sweep: 1.6, decay: false }, { dur: 0.7, freq: 240, q: 1, gain: 0.08, type: 'lowpass', wet: 0.3 }] },
  slide: { parts: [{ dur: 0.45, freq: 1500, q: 0.8, gain: 0.06, wet: 0.2, sweep: 0.7 }, { at: 0.4, dur: 0.06, freq: 240, q: 1.5, gain: 0.18, type: 'lowpass', wet: 0.3 }] },   // fusuma / shoji
  creakFloor: { parts: [{ tone: true, dur: 0.5, freq: 340, type: 'sawtooth', gain: 0.012, slide: 0.75, vibrato: 18, wet: 0.5 }, { dur: 0.4, freq: 600, q: 9, gain: 0.05, wet: 0.5, sweep: 0.8 }] },
  drip: { parts: [{ tone: true, dur: 0.09, freq: 1400, type: 'sine', gain: 0.05, slide: 1.8, wet: 0.7 }] },
  tap: { n: 2, gap: 0.22, parts: [{ dur: 0.03, freq: 3200, q: 4, gain: 0.12, wet: 0.4 }, { tone: true, dur: 0.06, freq: 2100, type: 'sine', gain: 0.02, wet: 0.5 }] },   // a finger on glass
  rustle: { parts: [{ dur: 0.6, freq: 2600, q: 0.6, gain: 0.05, type: 'highpass', wet: 0.15, sweep: 0.6 }] },
  splash: { parts: [{ dur: 0.35, freq: 900, q: 0.6, gain: 0.2, wet: 0.4, sweep: 0.4 }, { at: 0.05, dur: 0.2, freq: 2600, q: 2, gain: 0.05, wet: 0.4 }] },
  // standard 1.9: what the games still synthesised by hand (the survey of js/ext/sound.js: bells, phones, clocks, glass, breath)
  bell: { parts: [{ tone: true, dur: 3, freq: 392, type: 'sine', gain: 0.07, attack: 0.004, wet: 0.7 }, { tone: true, dur: 1.6, freq: 1046, type: 'sine', gain: 0.025, attack: 0.004, wet: 0.7 }, { tone: true, dur: 2.2, freq: 587, type: 'sine', gain: 0.02, wet: 0.7 }, { dur: 0.03, freq: 900, q: 2, gain: 0.15, type: 'lowpass', wet: 0.6 }] },   // a temple bell, struck once
  suzu: { n: 4, gap: 0.11, parts: [{ tone: true, dur: 0.25, freq: 3150, type: 'sine', gain: 0.025, attack: 0.002, wet: 0.5 }, { tone: true, dur: 0.18, freq: 4700, type: 'sine', gain: 0.012, attack: 0.002, wet: 0.5 }] },   // a shrine bell / a cat's bell
  chime: { parts: [{ tone: true, dur: 0.9, freq: 659, type: 'triangle', gain: 0.05, attack: 0.005, wet: 0.4 }, { at: 0.55, tone: true, dur: 1.3, freq: 523, type: 'triangle', gain: 0.05, attack: 0.005, wet: 0.4 }] },   // a door chime, ding-dong
  phoneRing: { n: 20, gap: 0.05, parts: [{ tone: true, dur: 0.04, freq: 1320, type: 'square', gain: 0.012, wet: 0.3 }, { tone: true, dur: 0.04, freq: 1480, type: 'square', gain: 0.008, wet: 0.3 }] },   // one ring of an old phone (repeat it with a pause)
  clack: { n: 2, gap: 0.38, parts: [{ dur: 0.03, freq: 2300, q: 5, gain: 0.35, wet: 0.6 }, { tone: true, dur: 0.07, freq: 1250, type: 'triangle', gain: 0.04, wet: 0.6 }] },   // hyoshigi, wooden clappers
  cloth: { parts: [{ dur: 0.45, freq: 1100, q: 0.5, gain: 0.05, type: 'lowpass', wet: 0.1, sweep: 0.7 }, { at: 0.1, dur: 0.3, freq: 2400, q: 0.8, gain: 0.02, wet: 0.1 }] },   // kimono, a futon, someone turning over
  wetStep: { parts: [{ dur: 0.12, freq: 650, q: 1, gain: 0.12, type: 'lowpass', wet: 0.4, sweep: 0.6 }, { at: 0.05, dur: 0.06, freq: 2300, q: 4, gain: 0.03, wet: 0.4 }] },   // a bare wet foot
  footsteps: { n: 5, gap: 0.55, parts: [{ dur: 0.1, freq: 150, q: 1, gain: 0.35, type: 'lowpass', wet: 0.5 }, { tone: true, dur: 0.12, freq: 80, type: 'sine', gain: 0.05, slide: 0.7, wet: 0.5 }] },   // someone walking upstairs / in the next room
  scratch: { n: 4, gap: 0.2, parts: [{ dur: 0.14, freq: 2600, q: 4, gain: 0.09, wet: 0.35, sweep: 1.3 }] },   // nails on wood
  glass: { parts: [{ dur: 0.5, freq: 4200, q: 0.8, gain: 0.22, type: 'highpass', wet: 0.4, sweep: 0.6 }, { tone: true, dur: 0.3, freq: 3100, type: 'sine', gain: 0.02, wet: 0.5 }, { at: 0.06, tone: true, dur: 0.25, freq: 4700, type: 'sine', gain: 0.015, wet: 0.5 }, { at: 0.15, tone: true, dur: 0.2, freq: 5900, type: 'sine', gain: 0.012, wet: 0.5 }] },   // a breaking pane or cup
  whisper: { parts: [{ dur: 1.2, freq: 3000, q: 1.6, gain: 0.035, wet: 0.5, sweep: 1.3, decay: false }, { at: 0.3, dur: 0.8, freq: 1700, q: 2.5, gain: 0.02, wet: 0.5, sweep: 0.8 }] },   // a voiceless breath of words
  breath: { n: 2, gap: 1.5, parts: [{ dur: 0.9, freq: 800, q: 0.7, gain: 0.05, type: 'lowpass', wet: 0.2, sweep: 1.3, decay: false }] },   // breathing close by
  clockTick: { n: 8, gap: 0.5, parts: [{ dur: 0.012, freq: 4200, q: 8, gain: 0.12, wet: 0.3 }, { dur: 0.02, freq: 1300, q: 4, gain: 0.04, wet: 0.3 }] },
  creakDoor: { parts: [{ tone: true, dur: 1.3, freq: 210, type: 'sawtooth', gain: 0.012, slide: 1.6, vibrato: 24, wet: 0.5 }, { dur: 1.1, freq: 900, q: 10, gain: 0.04, wet: 0.5, sweep: 1.4 }] },   // a hinge, slowly
  switch: { parts: [{ dur: 0.012, freq: 3200, q: 3, gain: 0.16, wet: 0.2 }, { at: 0.012, dur: 0.02, freq: 900, q: 2, gain: 0.06, wet: 0.2 }] },   // a light switch
};
/** every noise name (standard + the game's own) */
export const NOISE_NAMES = () => Object.keys(NOISES);
/** a game's own noise: { n, gap, parts: [...] } in the same part shape (also ext.registerNoise) */
export function registerNoise(name, def) {
  if (!def || !Array.isArray(def.parts) || !def.parts.length) throw new Error(`registerNoise("${name}"): { parts: [...] } is needed`);
  NOISES[name] = def;
}

/** the timed parts of a noise ({ n, gap, gain } override the table) */
export function noiseParts(name, { n, gap, gain = 1, rnd = Math.random } = {}) {
  const d = NOISES[name];
  if (!d) return [];
  const N = n ?? d.n ?? 1, G = gap ?? d.gap ?? 0.3, out = [];
  for (let i = 0; i < N; i++) for (const p of d.parts) out.push({ ...p, at: (p.at || 0) + i * G * (0.9 + rnd() * 0.2), gain: p.gain * gain * (i ? 0.85 + rnd() * 0.2 : 1) });
  return out;
}
