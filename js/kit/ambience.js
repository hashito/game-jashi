/* game-kit 6e0b6f0: js/ambience.js — edit in game-kit and run tools/kit-sync.js */
// Outdoor ambience that hears the building: rain, wind, storm, traffic (1.9: insects cicadas frogs river waves snowWind) beds that are full outdoors,
// quiet and muffled (low-pass) indoors behind closed doors and windows, and louder / brighter when a door or
// window to the outside opens or you stand near one; an open opening is also a positional "leak" source, so
// the rain comes from the doorway. No three.js and no files: the beds are synthesised (or the game passes its
// own source), and all the maths is plain functions that run in Node (test/ambience.test.mjs).
//
//   const amb = new Ambience(audio.ctx, { out: audio.master });           // the game's master: volume / mute apply
//   amb.addBed("rain", { kind: "rain", level: 0.35 });                     // or build: (ctx, dest) => ({ stop() })
//   amb.setModel({
//     rooms: [{ id: "hall", box: [x0, z0, x1, z1], leak: 0.06 }],          // first match wins; nowhere = outdoors
//     openings: [{ id: "front", x, y: 1.1, z, width: 1.8, kind: "door", rooms: ["hall", "outside"],
//                  open: () => doors.front.open }],                         // 0..1, number or function
//   });
//   // every frame (after the doors moved):
//   amb.update(dt, { x: cam.position.x, y: cam.position.y, z: cam.position.z });
//   amb.state  // { room, outdoor, exposure, main, beds: { rain: { gain, cutoff, leaks: [{ id, gain, cutoff }] } } }
//
// Exposure (0..1) is how much of the outdoors reaches the listener:
//   outdoors                1 (or zone.exposure for a canopy / covered platform: rooms with outdoor: true)
//   indoors                 softOr(room.leak, every opening's contribution)
//   opening contribution    amount * (diffuse + (1 - diffuse) * near(d))      d = distance to the opening edge
//   amount                  lerp(seal, 1, open) * weight * exposure of the room on the other side
//   near(d)                 1 / (1 + d / ref)^2  (ref 2.5 m, 1 m door: 1 in the doorway, 0.25 at 3 m, 0.06 at 8 m)
// A neighbouring room's exposure is its own leak and openings (times `transfer`, 0.5), so an open office door
// to a hallway whose front door is shut lets in only a little. Each bed maps exposure to a gain
// (closedDb at 0, 0 dB at 1) and a low-pass cutoff (closedCut .. openCut, exponential); the directional part
// of the nearest open openings goes to panners at the openings instead of the main bed. Values are smoothed
// with a time constant (tau 0.6 s: 95 % in 1.8 s), so a door swinging open is a gentle swell, not a step, and walking
// through a doorway (near-field capped at nearMax 0.45) is no loud "shhh" (user: ドアを通る時にしゅぅるみたいな音が大きい).

export const SEAL = { door: 0.04, window: 0.12, shutter: 0.15, open: 1 }; // what a closed opening still lets in
export const BED_DEFAULTS = { level: 0.3, closedDb: -18, closedCut: 420, openCut: 11000, positional: true };
export const MODEL_DEFAULTS = { ref: 1.5, diffuse: 0.22, transfer: 0.5, maxLeaks: 2, tau: 0.6, nearMax: 0.45 };

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a, b, t) => a + (b - a) * t;
const val = (v, d) => (typeof v === "function" ? v() : (v ?? d));

// combine independent paths: 1 - Π(1 - e) (two half-open paths give 0.75, never more than 1)
export function softOr(...es) {
  let k = 1;
  for (const e of es.flat()) k *= 1 - clamp01(e);
  return 1 - k;
}

// 1 at the opening (within half its width), falling with distance
export function nearFalloff(d, width = 1, ref = MODEL_DEFAULTS.ref) {
  const x = Math.max(0, d - width / 2);
  return 1 / (1 + x / ref) ** 2;
}

export function inRoom(room, p) {
  if (room.contains) return !!room.contains(p);
  if (!room.box) return false;
  const [x0, z0, x1, z1] = room.box;
  if (p.x < Math.min(x0, x1) || p.x > Math.max(x0, x1) || p.z < Math.min(z0, z1) || p.z > Math.max(z0, z1))
    return false;
  if (room.y && p.y != null && (p.y < room.y[0] || p.y > room.y[1])) return false;
  return true;
}

export function roomAt(model, p) {
  for (const r of model.rooms || []) if (inRoom(r, p)) return r;
  return null; // outdoors
}

export function openAmount(o) {
  return clamp01(val(o.open, o.kind === "open" ? 1 : 0));
}

// what an opening lets through from its far side, before distance: lerp(seal, 1, open) * weight
export function passAmount(o) {
  const seal = o.seal ?? SEAL[o.kind || "door"] ?? SEAL.door;
  return lerp(seal, 1, openAmount(o)) * (o.weight ?? 1);
}

const OUT = "outside";
const isOutdoorId = (model, id) => id === OUT || (model.rooms || []).some((r) => r.id === id && r.outdoor);

// exposure of every room, propagated through the openings (outdoors = 1)
export function roomExposures(model, o = {}) {
  const transfer = o.transfer ?? model.transfer ?? MODEL_DEFAULTS.transfer;
  const E = { [OUT]: 1 };
  const rooms = model.rooms || [];
  for (const r of rooms) E[r.id] = r.outdoor ? (r.exposure ?? 1) : (r.leak ?? 0);
  const ops = (model.openings || []).map((op) => ({ op, pass: passAmount(op) }));
  for (let it = 0; it < 6; it++) {
    for (const r of rooms) {
      if (r.outdoor) continue;
      const paths = [r.leak ?? 0];
      for (const { op, pass } of ops) {
        const [a, b] = op.rooms;
        const other = a === r.id ? b : b === r.id ? a : null;
        if (other == null) continue;
        const far = E[other] ?? 0;
        paths.push(pass * far * (isOutdoorId(model, other) ? 1 : transfer));
      }
      E[r.id] = softOr(paths);
    }
  }
  return E;
}

// the listener's exposure: { room, outdoor, exposure, main, leaks: [{ id, x, y, z, amount, open }] }
// `main` is what the non-positional bed carries; `leaks` the directional part of the nearest openings.
export function computeExposure(model, p, o = {}) {
  const ref = o.ref ?? model.ref ?? MODEL_DEFAULTS.ref;
  const maxLeaks = o.maxLeaks ?? model.maxLeaks ?? MODEL_DEFAULTS.maxLeaks;
  const nearMax = o.nearMax ?? model.nearMax ?? MODEL_DEFAULTS.nearMax;
  const room = p.room !== undefined ? (model.rooms || []).find((r) => r.id === p.room) || null : roomAt(model, p);
  if (!room || room.outdoor) {
    const e = room ? (room.exposure ?? 1) : 1;
    return { room: room ? room.id : OUT, outdoor: true, exposure: e, main: e, leaks: [] };
  }
  const diffuse = room.diffuse ?? model.diffuse ?? MODEL_DEFAULTS.diffuse;
  const E = roomExposures(model, o);
  const transfer = o.transfer ?? model.transfer ?? MODEL_DEFAULTS.transfer;
  const parts = [];
  for (const op of model.openings || []) {
    const [a, b] = op.rooms;
    const other = a === room.id ? b : b === room.id ? a : null;
    if (other == null) continue;
    const amount = passAmount(op) * (E[other] ?? 0) * (isOutdoorId(model, other) ? 1 : transfer);
    if (amount <= 0) continue;
    const d = Math.hypot(p.x - op.x, (p.y ?? op.y ?? 0) - (op.y ?? p.y ?? 0), p.z - op.z);
    const near = Math.min(nearMax, nearFalloff(d, op.width ?? 1, op.ref ?? ref)); // capped: walking through a doorway must not swell into a loud hiss
    parts.push({ op, open: openAmount(op), wide: amount * diffuse, dir: amount * (1 - diffuse) * near });
  }
  const exposure = softOr(
    room.leak ?? 0,
    parts.map((q) => q.wide + q.dir),
  );
  // the directional part of the strongest open openings becomes positional; the rest stays in the bed
  const ranked = parts
    .filter((q) => q.open > 0.02)
    .sort((u, v) => v.dir - u.dir)
    .slice(0, maxLeaks);
  const leaks = ranked.map((q) => ({
    id: q.op.id,
    x: q.op.x,
    y: q.op.y ?? 1.2,
    z: q.op.z,
    amount: q.dir,
    open: q.open,
  }));
  const main = softOr(
    room.leak ?? 0,
    parts.map((q) => q.wide + (ranked.includes(q) ? 0 : q.dir)),
  );
  return { room: room.id, outdoor: false, exposure, main, leaks };
}

// one bed's levels for an exposure: gain closedDb..0 dB (times level), cutoff closedCut..openCut
export function bedLevels(bed, e) {
  const b = { ...BED_DEFAULTS, ...bed };
  e = clamp01(e);
  return { gain: b.level * 10 ** ((b.closedDb * (1 - e)) / 20), cutoff: b.closedCut * (b.openCut / b.closedCut) ** e };
}

// a leak path: as loud as its share (linear), as bright as the opening is open (a cracked window is duller)
export function leakLevels(bed, amount, open) {
  const b = { ...BED_DEFAULTS, ...bed };
  return {
    gain: b.level * clamp01(amount),
    cutoff: b.closedCut * (b.openCut / b.closedCut) ** lerp(0.45, 1, clamp01(open)),
  };
}

// exponential smoothing toward a target with time constant tau (frame-rate independent)
export function smooth(cur, target, dt, tau = MODEL_DEFAULTS.tau) {
  if (!(tau > 0)) return target;
  return target + (cur - target) * Math.exp(-dt / tau);
}

// ---- synthesised beds (Web Audio) -------------------------------------------------------------------
function noiseBuffer(ctx, sec = 3, brown = false) {
  const n = Math.floor(ctx.sampleRate * sec);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    if (brown) {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    } else d[i] = w;
  }
  return buf;
}

const BUFS = new WeakMap(); // one white and one brown buffer per context, shared by every bed
function loopNoise(ctx, brown) {
  let b = BUFS.get(ctx);
  if (!b) BUFS.set(ctx, (b = {}));
  const k = brown ? "brown" : "white";
  const s = ctx.createBufferSource();
  s.buffer = b[k] || (b[k] = noiseBuffer(ctx, 3, brown));
  s.loop = true;
  return s;
}

function lfo(ctx, rate, depth, target) {
  const o = ctx.createOscillator();
  o.frequency.value = rate;
  const g = ctx.createGain();
  g.gain.value = depth;
  o.connect(g).connect(target);
  o.start();
  return o;
}

// each returns { stop() } and plays into `dest`
export const BEDS = {
  // steady hiss of drops, a brighter patter band on top
  rain(ctx, dest) {
    const src = loopNoise(ctx);
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 400;
    const pk = ctx.createBiquadFilter();
    pk.type = "peaking";
    pk.frequency.value = 3200;
    pk.Q.value = 0.8;
    pk.gain.value = 4;
    const g = ctx.createGain();
    g.gain.value = 0.55;
    src.connect(hp).connect(pk).connect(g).connect(dest);
    const wob = lfo(ctx, 0.13, 0.08, g.gain);
    src.start();
    return { stop: () => [src, wob].forEach((n) => n.stop()) };
  },
  // band-passed noise with a slow swell (gusts)
  wind(ctx, dest) {
    const src = loopNoise(ctx);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 520;
    bp.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.value = 0.5;
    src.connect(bp).connect(g).connect(dest);
    const a = lfo(ctx, 0.07, 0.3, g.gain);
    const b = lfo(ctx, 0.05, 260, bp.frequency);
    src.start();
    return { stop: () => [src, a, b].forEach((n) => n.stop()) };
  },
  // heavy rain plus a low rumble
  storm(ctx, dest) {
    const r = BEDS.rain(ctx, dest);
    const src = loopNoise(ctx, true);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 160;
    const g = ctx.createGain();
    g.gain.value = 0.9;
    src.connect(lp).connect(g).connect(dest);
    const a = lfo(ctx, 0.04, 0.5, g.gain);
    src.start();
    return {
      stop() {
        [src, a].forEach((n) => n.stop());
        r.stop();
      },
    };
  },
  // far traffic: low brown noise with slow passing swells
  traffic(ctx, dest) {
    const src = loopNoise(ctx, true);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 700;
    const g = ctx.createGain();
    g.gain.value = 0.6;
    src.connect(lp).connect(g).connect(dest);
    const a = lfo(ctx, 0.11, 0.25, g.gain);
    const b = lfo(ctx, 0.03, 200, lp.frequency);
    src.start();
    return { stop: () => [src, a, b].forEach((n) => n.stop()) };
  },
  // standard 1.9: the beds of the Japanese countryside the games kept faking with rain or wind
  // summer-night insects (suzumushi / korogi): a high chirping tone, pulsed fast, in slow trills
  insects(ctx, dest) {
    const out = ctx.createGain();
    out.gain.value = 0.0;
    out.connect(dest);
    const nodes = [];
    for (const [f, rate, trill] of [[4300, 32, 0.45], [3700, 24, 0.31], [5100, 40, 0.23]]) {
      const o = ctx.createOscillator();
      o.frequency.value = f;
      const am = ctx.createGain();
      am.gain.value = 0;
      o.connect(am).connect(out);
      nodes.push(lfo(ctx, rate, 0.5, am.gain), lfo(ctx, trill, 0.5, am.gain), o);
      o.start();
    }
    out.gain.value = 0.05;
    return { stop: () => nodes.forEach((n) => n.stop()) };
  },
  // cicadas in the heat: a dense high noise band, buzzing fast, swelling and fading
  cicadas(ctx, dest) {
    const src = loopNoise(ctx);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 5200;
    bp.Q.value = 3;
    const am = ctx.createGain();
    am.gain.value = 0.35;
    const g = ctx.createGain();
    g.gain.value = 0.55;
    src.connect(bp).connect(am).connect(g).connect(dest);
    const a = lfo(ctx, 48, 0.3, am.gain);
    const b = lfo(ctx, 0.09, 0.35, g.gain);
    const c = lfo(ctx, 0.2, 500, bp.frequency);
    src.start();
    return { stop: () => [src, a, b, c].forEach((n) => n.stop()) };
  },
  // paddy frogs at night: low croaks, pulsed in irregular rows
  frogs(ctx, dest) {
    const out = ctx.createGain();
    out.gain.value = 0.12;
    out.connect(dest);
    const nodes = [];
    for (const [f, rate, row] of [[380, 14, 0.7], [520, 18, 0.43], [300, 11, 0.29]]) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = f;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = f * 2.5;
      const am = ctx.createGain();
      am.gain.value = 0;
      o.connect(lp).connect(am).connect(out);
      nodes.push(lfo(ctx, rate, 0.25, am.gain), lfo(ctx, row, 0.25, am.gain), o);
      o.start();
    }
    return { stop: () => nodes.forEach((n) => n.stop()) };
  },
  // a river or a stream: brown rush plus a bubbling mid band
  river(ctx, dest) {
    const src = loopNoise(ctx, true);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1200;
    const g = ctx.createGain();
    g.gain.value = 0.7;
    src.connect(lp).connect(g).connect(dest);
    const w = loopNoise(ctx);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1800;
    bp.Q.value = 1.2;
    const g2 = ctx.createGain();
    g2.gain.value = 0.12;
    w.connect(bp).connect(g2).connect(dest);
    const a = lfo(ctx, 0.6, 0.05, g2.gain);
    const b = lfo(ctx, 1.7, 400, bp.frequency);
    src.start();
    w.start();
    return { stop: () => [src, w, a, b].forEach((n) => n.stop()) };
  },
  // sea waves: a slow deep swell that rolls in and draws back
  waves(ctx, dest) {
    const src = loopNoise(ctx, true);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 900;
    const g = ctx.createGain();
    g.gain.value = 0.5;
    src.connect(lp).connect(g).connect(dest);
    const a = lfo(ctx, 0.09, 0.45, g.gain);
    const b = lfo(ctx, 0.09, 600, lp.frequency);
    src.start();
    return { stop: () => [src, a, b].forEach((n) => n.stop()) };
  },
  // a cold wind over snow and cedars: higher and thinner than wind, with a whistle on the gusts
  snowWind(ctx, dest) {
    const src = loopNoise(ctx);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 900;
    bp.Q.value = 1.4;
    const g = ctx.createGain();
    g.gain.value = 0.4;
    src.connect(bp).connect(g).connect(dest);
    const o = ctx.createOscillator();
    o.frequency.value = 760;
    const og = ctx.createGain();
    og.gain.value = 0.006;
    o.connect(og).connect(dest);
    const a = lfo(ctx, 0.05, 0.3, g.gain);
    const b = lfo(ctx, 0.04, 500, bp.frequency);
    const c = lfo(ctx, 0.05, 0.005, og.gain);
    const d = lfo(ctx, 0.11, 140, o.frequency);
    src.start();
    o.start();
    return { stop: () => [src, o, a, b, c, d].forEach((n) => n.stop()) };
  },
};
export const BED_KINDS = () => Object.keys(BEDS);
/** a game's own bed kind: build(ctx, dest) -> { stop() } (also ext.registerBed) */
export function registerBed(name, build) {
  if (typeof build !== "function") throw new Error(`registerBed("${name}"): build(ctx, dest) is needed`);
  BEDS[name] = build;
}

function setParam(ctx, param, v, tc = 0.04) {
  if (!param) return;
  if (param.setTargetAtTime && ctx) param.setTargetAtTime(v, ctx.currentTime, tc);
  else param.value = v;
}

// ---- the controller ---------------------------------------------------------------------------------
export class Ambience {
  // ctx may be null (Node, or audio not started yet): the maths and `state` still run
  constructor(ctx, o = {}) {
    this.ctx = ctx || null;
    this.o = { ...MODEL_DEFAULTS, ...o };
    this.model = o.model || { rooms: [], openings: [] };
    this.fn = null;
    this.beds = {};
    this.volume = o.volume ?? 1;
    this.muted = false;
    this.cur = null; // smoothed { main, exposure, leaks: { id: amount } }
    this.state = { room: OUT, outdoor: true, exposure: 1, main: 1, beds: {} };
    if (this.ctx) {
      this.bus = this.ctx.createGain();
      this.bus.gain.value = this.volume;
      this.bus.connect(o.out || this.ctx.destination);
    }
  }

  setModel(model) {
    this.model = model;
    this.fn = null;
  }
  // or let the game compute exposure: fn(listener) -> number | { exposure, main?, leaks? } (as computeExposure)
  setExposureFn(fn) {
    this.fn = fn;
  }

  setVolume(v) {
    this.volume = v;
    if (this.bus) setParam(this.ctx, this.bus.gain, this.muted ? 0 : v, 0.08);
  }
  setMuted(m) {
    this.muted = !!m;
    this.setVolume(this.volume);
  }

  // late start (the context exists only after the first tap): attach and build the beds added so far
  attach(ctx, out) {
    if (this.ctx || !ctx) return;
    this.ctx = ctx;
    this.bus = ctx.createGain();
    this.bus.gain.value = this.muted ? 0 : this.volume;
    this.bus.connect(out || ctx.destination);
    for (const b of Object.values(this.beds)) this._build(b);
  }

  addBed(name, cfg = {}) {
    this.removeBed(name);
    const b = { name, cfg: { ...BED_DEFAULTS, ...cfg }, leaks: {} };
    this.beds[name] = b;
    if (this.ctx) this._build(b);
    return b;
  }

  removeBed(name, fade = 0.6) {
    const b = this.beds[name];
    if (!b) return;
    delete this.beds[name];
    if (!b.out) return;
    setParam(this.ctx, b.out.gain, 0, fade / 3);
    setTimeout(
      () => {
        try {
          b.src.stop();
        } catch {
          /* already stopped */
        }
        b.out.disconnect();
      },
      fade * 1000 + 100,
    );
  }

  _build(b) {
    const ctx = this.ctx;
    b.out = ctx.createGain(); // the bed's own fade (removeBed)
    b.out.connect(this.bus);
    b.tap = ctx.createGain(); // the raw source, fanned out to the main path and the leak paths
    b.src = (b.cfg.build || BEDS[b.cfg.kind || b.name] || BEDS.rain)(ctx, b.tap);
    b.lp = ctx.createBiquadFilter();
    b.lp.type = "lowpass";
    b.lp.Q.value = 0.5;
    b.gain = ctx.createGain();
    b.gain.gain.value = 0;
    b.tap.connect(b.lp).connect(b.gain).connect(b.out);
    b.slots = [];
  }

  // a panner fed by the bed, parked at an opening (direction only: the distance is in our gain)
  _slot(b) {
    const ctx = this.ctx;
    let s = b.slots.find((q) => !q.id);
    if (s) return s;
    s = { id: null, lp: ctx.createBiquadFilter(), gain: ctx.createGain(), pan: ctx.createPanner() };
    s.lp.type = "lowpass";
    s.gain.gain.value = 0;
    s.pan.panningModel = "HRTF";
    s.pan.distanceModel = "linear";
    s.pan.rolloffFactor = 0;
    b.tap.connect(s.lp).connect(s.gain).connect(s.pan).connect(b.out);
    b.slots.push(s);
    return s;
  }

  _exposure(p) {
    if (!this.fn) return computeExposure(this.model, p, this.o);
    const r = this.fn(p);
    if (typeof r === "number") return { room: null, outdoor: r >= 1, exposure: r, main: r, leaks: [] };
    return { room: null, outdoor: false, leaks: [], main: r.exposure, ...r };
  }

  update(dt, listener) {
    if (!listener) return this.state;
    const t = this._exposure(listener);
    const tau = this.o.tau;
    if (!this.cur) this.cur = { main: t.main, exposure: t.exposure, leaks: {}, pos: {} };
    const c = this.cur;
    c.main = smooth(c.main, t.main, dt, tau);
    c.exposure = smooth(c.exposure, t.exposure, dt, tau);
    const want = {};
    for (const l of t.leaks) {
      want[l.id] = l;
      c.pos[l.id] = l;
    }
    for (const id of new Set([...Object.keys(c.leaks), ...Object.keys(want)])) {
      c.leaks[id] = smooth(c.leaks[id] ?? 0, want[id] ? want[id].amount : 0, dt, tau);
      if (!want[id] && c.leaks[id] < 1e-3) delete c.leaks[id];
    }
    const beds = {};
    for (const b of Object.values(this.beds)) {
      const positional = b.cfg.positional !== false;
      const lv = bedLevels(b.cfg, positional ? c.main : c.exposure);
      const leaks = [];
      if (positional)
        for (const [id, amount] of Object.entries(c.leaks)) {
          const L = leakLevels(b.cfg, amount, (want[id] || c.pos[id]).open ?? 1);
          leaks.push({ id, ...L });
        }
      beds[b.name] = { gain: lv.gain, cutoff: lv.cutoff, leaks };
      if (b.gain) this._apply(b, lv, leaks, c.pos);
    }
    this.state = { room: t.room, outdoor: t.outdoor, exposure: c.exposure, main: c.main, target: t.exposure, beds };
    return this.state;
  }

  _apply(b, lv, leaks, pos) {
    const ctx = this.ctx;
    setParam(ctx, b.gain.gain, lv.gain);
    setParam(ctx, b.lp.frequency, lv.cutoff);
    const live = new Set(leaks.map((l) => l.id));
    for (const s of b.slots)
      if (s.id && !live.has(s.id)) {
        setParam(ctx, s.gain.gain, 0);
        s.id = null;
      }
    for (const l of leaks) {
      const s = b.slots.find((q) => q.id === l.id) || Object.assign(this._slot(b), { id: l.id });
      const p = pos[l.id];
      if (s.pan.positionX) {
        s.pan.positionX.value = p.x;
        s.pan.positionY.value = p.y;
        s.pan.positionZ.value = p.z;
      } else s.pan.setPosition(p.x, p.y, p.z);
      setParam(ctx, s.gain.gain, l.gain);
      setParam(ctx, s.lp.frequency, l.cutoff);
    }
  }

  // one line for a debug overlay / console: "hall in e=0.31 rain -9.4dB 1.6kHz +front -14dB"
  describe() {
    const s = this.state;
    const db = (g) => (g > 0 ? (20 * Math.log10(g)).toFixed(1) : "-inf") + "dB";
    const parts = [`${s.room} ${s.outdoor ? "out" : "in"} e=${s.exposure.toFixed(2)}`];
    for (const [n, b] of Object.entries(s.beds)) {
      parts.push(`${n} ${db(b.gain)} ${(b.cutoff / 1000).toFixed(1)}kHz`);
      for (const l of b.leaks) parts.push(`+${l.id} ${db(l.gain)}`);
    }
    return parts.join(" ");
  }

  // what the Web Audio graph is actually set to (for headless checks): { rain: { gain, cutoff, leaks: [...] } }
  measured() {
    const m = {};
    for (const b of Object.values(this.beds)) {
      if (!b.gain) continue;
      m[b.name] = {
        gain: b.gain.gain.value,
        cutoff: b.lp.frequency.value,
        leaks: b.slots
          .filter((s) => s.id)
          .map((s) => ({ id: s.id, gain: s.gain.gain.value, cutoff: s.lp.frequency.value })),
      };
    }
    return { running: !!this.ctx && this.ctx.state === "running", bus: this.bus ? this.bus.gain.value : 0, beds: m };
  }

  stop() {
    for (const n of Object.keys(this.beds)) this.removeBed(n, 0.3);
  }
}
