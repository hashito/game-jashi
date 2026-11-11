// Sounds of 邪視 on the standard audio (js/kit/audio.js master gain, so the volume setting applies):
//   - beds from the kit's sound library (js/kit/ambience.js, standard 1.9): mountain wind, the creek and the evening insects, full
//     outdoors and muffled inside the villa, the shed and the hut (louder near an open door)
//   - one-shots from the kit's noise library (step-sound NOISES): the forestry bell, the glass of the bottle, steps outside the hut,
//     breath, rustles
//   - synthesized here: the scythe raised (an iron scrape rising, panned to its side) and swung, the hit, radio static, the phone's
//     ring, the engine cranking, a low sting
import { Ambience } from '../kit/ambience.js';

export function createSound(ctx) {
  const A = () => ctx.audio && ctx.audio.ctx;
  const out = () => (ctx.audio && ctx.audio.master) || (A() && A().destination);
  const quiet = () => !!ctx.calm;
  const pan = (ac, p) => { const n = ac.createStereoPanner(); n.pan.value = Math.max(-1, Math.min(1, p || 0)); return n; };
  const env = (ac, g, t, a, peak, hold, rel) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a); g.gain.setValueAtTime(Math.max(0.0002, peak), t + a + hold); g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + rel); };
  let nb = null;
  const noiseBuf = (ac) => { if (nb) return nb; nb = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate); const d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return nb; };
  const noise = (name, o) => ctx.audio && ctx.audio.noise && ctx.audio.noise(name, o);
  const filtered = (o) => {
    const ac = A(); if (!ac) return;
    const t = ac.currentTime + (o.delay || 0) + 0.01, src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    src.buffer = noiseBuf(ac); src.loop = true; f.type = o.type || 'bandpass'; f.frequency.setValueAtTime(o.f0, t); f.frequency.exponentialRampToValueAtTime(o.f1 || o.f0, t + o.dur); f.Q.value = o.q ?? 2;
    env(ac, g, t, o.a ?? 0.02, (o.vol ?? 0.3) * (quiet() ? 0.5 : 1), o.hold ?? 0, o.dur);
    src.connect(f); f.connect(g); g.connect(pan(ac, o.pan)).connect(out()); src.start(t); src.stop(t + (o.a ?? 0.02) + (o.hold ?? 0) + o.dur + 0.1);
  };
  const tone = (o) => {
    const ac = A(); if (!ac) return;
    const t = ac.currentTime + (o.delay || 0) + 0.01, osc = ac.createOscillator(), g = ac.createGain();
    osc.type = o.wave || 'sine'; osc.frequency.setValueAtTime(o.f0, t); osc.frequency.exponentialRampToValueAtTime(o.f1 || o.f0, t + o.dur);
    env(ac, g, t, o.a ?? 0.01, (o.vol ?? 0.2) * (quiet() ? 0.5 : 1), o.hold ?? 0, o.dur); osc.connect(g); g.connect(pan(ac, o.pan)).connect(out()); osc.start(t); osc.stop(t + (o.a ?? 0.01) + (o.hold ?? 0) + o.dur + 0.1);
  };

  // the scythe: raised (iron scraping upward over ~1 s, from its side), swung (a whoosh), the hit, the miss
  const scytheRaise = (angle = 0) => { const p = Math.sin(angle) * 0.8; filtered({ f0: 900, f1: 3200, dur: 0.95, q: 6, vol: 0.22, pan: p, a: 0.05 }); tone({ f0: 70, f1: 52, dur: 1.0, wave: 'sawtooth', vol: 0.05, pan: p }); noise('breath', { gain: 0.6 }); };
  const scytheSwing = () => filtered({ f0: 2400, f1: 500, dur: 0.28, q: 0.8, vol: 0.4, a: 0.01 });
  const hit = () => { tone({ f0: 120, f1: 45, dur: 0.35, wave: 'triangle', vol: 0.5 }); filtered({ f0: 600, dur: 0.2, q: 1, vol: 0.35, type: 'lowpass' }); sting(); };
  const miss = () => filtered({ f0: 3000, f1: 1500, dur: 0.12, q: 2, vol: 0.12 });
  const sting = () => { for (const f of [233, 246.9, 349]) tone({ f0: f, f1: f * 0.97, dur: 1.1, wave: 'sawtooth', vol: 0.05, hold: 0.2 }); };
  const throwBottle = () => filtered({ f0: 1800, f1: 900, dur: 0.35, q: 1, vol: 0.08 });
  const shatter = () => { noise('glass', { gain: 0.9 }); noise('splash', { gain: 0.4 }); };
  // the radio: static that swells, with the tuned voice it hides (k 0..1 = how close the dial is)
  let staticNode = null;
  function radioStatic(on, k = 0) {
    const ac = A(); if (!ac) return;
    if (on && !staticNode) {
      const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain(); src.buffer = noiseBuf(ac); src.loop = true; f.type = 'bandpass'; f.frequency.value = 1700; f.Q.value = 0.8; g.gain.value = 0;
      src.connect(f); f.connect(g); g.connect(out()); src.start(); staticNode = { src, g };
    }
    if (!staticNode) return;
    staticNode.g.gain.setTargetAtTime(on ? 0.12 * (1 - k * 0.8) * (quiet() ? 0.5 : 1) : 0, ac.currentTime, 0.15);
    if (!on) { const s = staticNode; staticNode = null; setTimeout(() => { try { s.src.stop(); } catch (e) { /* stopped */ } }, 600); }
  }
  const radioBurst = (sec = 1.2) => filtered({ f0: 1700, dur: sec, q: 0.9, vol: 0.16, hold: sec * 0.5 });
  // the phone in the mud: a plain old ring, twice
  const ring = (pan0 = 0) => { for (let i = 0; i < 2; i++) for (let j = 0; j < 10; j++) tone({ f0: j % 2 ? 1300 : 1600, dur: 0.05, vol: 0.06, delay: i * 1.4 + j * 0.05, pan: pan0, a: 0.004 }); };
  const engine = (ok) => { tone({ f0: 38, f1: ok ? 62 : 30, dur: ok ? 1.6 : 0.8, wave: 'sawtooth', vol: 0.12 }); filtered({ f0: 200, f1: ok ? 380 : 160, dur: ok ? 1.6 : 0.7, q: 1.5, vol: 0.12, type: 'lowpass' }); };
  const bell = (o = {}) => noise('bell', { gain: o.gain ?? 1 });
  const steps = (o = {}) => noise('footsteps', { gain: o.gain ?? 0.7 });
  const rustle = (o = {}) => noise('rustle', { gain: o.gain ?? 0.6 });
  const shutter = () => noise('slide', { gain: 0.9 });
  const breath = () => noise('breath', { gain: 0.5 });
  const ladder = () => { noise('scrape', { gain: 0.25 }); for (let i = 0; i < 4; i++) setTimeout(() => noise(i % 2 ? 'clack' : 'knock', { gain: 0.55 }), 120 + i * 260); };   // 5.8.1: hands and feet on the rungs
  const chain = () => { noise('rattle', { gain: 0.8 }); filtered({ f0: 700, f1: 400, dur: 1.2, q: 3, vol: 0.12 }); };

  // ---------------------------------------------------------------- the beds: wind, the creek and insects, heard through the buildings
  let amb = null;
  function beds() {
    const ac = A(); if (!ac || amb) return amb;
    amb = new Ambience(ac, { out: out() });
    amb.addBed('wind', { kind: 'wind', level: 0.22 });
    amb.addBed('river', { kind: 'river', level: 0.18 });
    amb.addBed('insects', { kind: 'insects', level: 0.08 });
    const door = (id) => () => { const d = ctx.world.doors.get(id); return d && d.isOpen ? 1 : 0; };
    amb.setModel({
      rooms: [
        { id: 'villa', box: [-6, 19, 6, 29], leak: 0.06 }, { id: 'shed', box: [-22, -5.5, -17, -1], leak: 0.12 }, { id: 'hut', box: [13, -18, 19, -13], leak: 0.1 },
      ],
      openings: [
        { id: 'entry', x: 0, y: 1.1, z: 19, width: 2.4, kind: 'door', rooms: ['villa', 'outside'], open: door('D_ENTRY') },
        { id: 'balc', x: 0, y: 4.5, z: 19, width: 1.6, kind: 'door', rooms: ['villa', 'outside'], open: door('D_BALC') },
        { id: 'shed', x: -19.5, y: 1.1, z: -1, width: 1.6, kind: 'door', rooms: ['shed', 'outside'], open: door('D_SHED') },
        { id: 'hut', x: 16, y: 1.1, z: -13, width: 1.6, kind: 'door', rooms: ['hut', 'outside'], open: door('D_SHELTER') },
      ],
    });
    return amb;
  }
  // per frame: the beds follow the listener; level 0..6 (the stage) makes the wind stronger and the insects fade at dusk
  function update(dt, o = {}) {
    const a = beds(); if (!a) return;
    const p = ctx.camera.position;
    a.update(dt, { x: p.x, y: p.y, z: p.z });
    a.setVolume && a.setVolume(ctx.settings ? ctx.settings.volume ?? 0.8 : 0.8);
    void o;
  }
  return { scytheRaise, scytheSwing, hit, miss, sting, throwBottle, shatter, radioStatic, radioBurst, ring, engine, bell, steps, rustle, shutter, breath, chain, ladder, update };
}
