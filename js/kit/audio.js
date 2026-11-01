/* game-kit 6e0b6f0: js/audio.js — edit in game-kit and run tools/kit-sync.js */
import { muffle as muffleOf } from './audio-at.js';
import { stepParts, noiseParts } from './step-sound.js';
// Procedural sound (Web Audio API). The engine (noise bursts, tones, positional output, generated
// reverb, loops, footsteps, door / paper / beep sounds) is reused from みる風車 (game-miru-fusha,
// js/audio.js); the station sounds (fluorescent hum, phone, printer, kitchen on the line, stamp,
// first train) are added here. Nothing is recorded, so there is nothing to license.
export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.loops = {};
    this.ambT = 6;
    this.volume = 0.85;
    this.calm = false; // END4: the station is ordinary again
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.makeImpulse(1.2, 3);
    this.wideReverb = ctx.createConvolver();
    this.wideReverb.buffer = this.makeImpulse(2.6, 2.2);
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.4;
    this.wideWet = ctx.createGain();
    this.wideWet.gain.value = 0;
    this.reverb.connect(this.wet).connect(this.master);
    this.wideReverb.connect(this.wideWet).connect(this.master);
    this.noiseBuf = this.makeNoise(2);
    this.music = ctx.createGain();
    this.music.gain.value = 0.7;
    this.music.connect(this.master);
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  // room acoustics: the 135 m² hall gets a long, wide tail (reverb_profile wide_0.9s)
  setRoom(profile) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const wide = profile && profile.startsWith('wide');
    this.wet.gain.setTargetAtTime(wide ? 0.15 : 0.4, t, 0.4);
    this.wideWet.gain.setTargetAtTime(wide ? 0.7 : 0, t, 0.4);
  }

  makeNoise(seconds) {
    const len = this.ctx.sampleRate * seconds;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  makeImpulse(seconds, decay) {
    const rate = this.ctx.sampleRate;
    const len = rate * seconds;
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  setListener(cam) {
    if (!this.ctx) return;
    const L = this.ctx.listener;
    const p = cam.position;
    const f = cam.getWorldDirection(this._v || (this._v = cam.position.clone()));
    if (L.positionX) {
      L.positionX.value = p.x;
      L.positionY.value = p.y;
      L.positionZ.value = p.z;
      L.forwardX.value = f.x;
      L.forwardY.value = f.y;
      L.forwardZ.value = f.z;
      L.upX.value = 0;
      L.upY.value = 1;
      L.upZ.value = 0;
    } else {
      L.setPosition(p.x, p.y, p.z);
      L.setOrientation(f.x, f.y, f.z, 0, 1, 0);
    }
  }

  // positional cue (standard 1.5): audio.at(pos).door() plays any one-shot FROM a world position; the sound is panned, falls off with distance and is muffled when walls /
  // shut doors lie between it and the listener (audio.occlusionOf(pos) -> 0..1, set by game-core from the plan; js/audio-at.js). Methods that already take a pos first (creak, locked, ring ...) get it too.
  at(pos) {
    const self = this;
    return new Proxy(this, {
      get(t, k) {
        const f = t[k];
        if (typeof f !== 'function') return f;
        return (...a) => { const was = self._at; self._at = pos; try { return f.apply(self, a); } finally { self._at = was; } };
      },
    });
  }

  out(pos, wet = 0.35) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    if (!pos && this._at) pos = this._at;
    let head = g;
    if (pos && this.occlusionOf) { // behind walls / shut doors: low-pass + quieter
      const occ = +this.occlusionOf(pos) || 0;
      if (occ > 0.02) { const f = ctx.createBiquadFilter(), gg = ctx.createGain(), m = muffleOf(occ); f.type = 'lowpass'; f.frequency.value = m.cutoff; gg.gain.value = m.gain; g.connect(f); f.connect(gg); head = gg; }
    }
    if (pos) {
      const p = ctx.createPanner();
      p.panningModel = 'HRTF';
      p.distanceModel = 'inverse';
      p.refDistance = 2;
      p.rolloffFactor = 1.1;
      if (p.positionX) {
        p.positionX.value = pos.x;
        p.positionY.value = pos.y;
        p.positionZ.value = pos.z;
      } else p.setPosition(pos.x, pos.y, pos.z);
      head.connect(p);
      p.connect(this.master);
    } else head.connect(this.master);
    if (wet > 0) {
      const w = ctx.createGain();
      w.gain.value = wet;
      g.connect(w);
      w.connect(this.reverb);
      w.connect(this.wideReverb);
    }
    return g;
  }

  noiseBurst({ at = 0, dur = 0.05, freq = 2000, q = 4, gain = 0.5, type = 'bandpass', pos = null, decay = true, wet = 0.35, sweep = 0 }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + at;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(30, freq * sweep), t + dur);
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    if (decay) g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    else g.gain.setValueAtTime(0, t + dur);
    src.connect(f).connect(g).connect(this.out(pos, wet));
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  tone({ at = 0, dur = 0.2, freq = 440, type = 'sine', gain = 0.2, pos = null, slide = 0, attack = 0.01, wet = 0.35, dest = null, vibrato = 0 }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + at;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    if (vibrato) {
      const l = this.ctx.createOscillator();
      l.frequency.value = 5.5;
      const lg = this.ctx.createGain();
      lg.gain.value = vibrato;
      l.connect(lg).connect(o.frequency);
      l.start(t);
      l.stop(t + dur + 0.05);
    }
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest || this.out(pos, wet));
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  // ---- one-shots -----------------------------------------------------------------------------
  // footsteps by the floor underfoot (js/step-sound.js: lino wax wood tatami carpet tile concrete gravel grass dirt snow mud water metal grating)
  step(surface = 'lino', { run = false, crouch = false, pos = null } = {}) {
    for (const p of stepParts(surface, { run, crouch })) this.part(p, pos);
  }

  // a house noise from js/step-sound.js NOISES (knock thud rattle scrape slide creakFloor drip tap rustle splash)
  noise(name, { pos = null, n, gap, gain } = {}) {
    for (const p of noiseParts(name, { n, gap, gain })) this.part(p, pos);
  }

  part(p, pos) {
    const { tone, ...o } = p;
    if (tone) this.tone({ ...o, pos }); else this.noiseBurst({ ...o, pos });
  }

  // quiet on purpose: walking through doors is constant, so it sits just above a pickup (user: ドアを通る時の音が大きくて気になります)
  door() {
    this.tone({ dur: 0.5, freq: 160, type: 'sawtooth', gain: 0.014, slide: 1.4, vibrato: 10, wet: 0.4 });
    this.noiseBurst({ at: 0.4, dur: 0.25, freq: 170, q: 2, gain: 0.12, type: 'lowpass', wet: 0.4 });
  }

  locked(pos) {
    // the knob spins without catching (EV04)
    this.noiseBurst({ dur: 0.08, freq: 900, q: 5, gain: 0.35, pos });
    this.noiseBurst({ at: 0.12, dur: 0.08, freq: 860, q: 5, gain: 0.35, pos });
    this.noiseBurst({ at: 0.26, dur: 0.12, freq: 1200, q: 8, gain: 0.15, pos });
  }

  pickup() {
    this.noiseBurst({ dur: 0.08, freq: 3000, q: 1, gain: 0.07, type: 'highpass', wet: 0.1 });
    this.tone({ dur: 0.15, freq: 523, type: 'triangle', gain: 0.03, wet: 0.2 });
  }

  beep(ok = true) {
    this.tone({ dur: 0.12, freq: ok ? 1200 : 300, type: 'square', gain: 0.04, wet: 0.2 });
  }

  paper() {
    this.noiseBurst({ dur: 0.25, freq: 3500, q: 0.7, gain: 0.12, type: 'highpass', wet: 0.05, sweep: 0.6 });
  }

  // the sting when something spots you (S12): a low hit and a rising scrape; a glitch burst for the screen's surge
  stinger() {
    this.tone({ dur: 0.9, freq: 82, type: 'sawtooth', gain: 0.1, slide: 0.5, wet: 0.7 });
    this.tone({ at: 0.02, dur: 0.6, freq: 1300, type: 'square', gain: 0.025, slide: 2.2, wet: 0.5 });
    this.noiseBurst({ dur: 0.5, freq: 600, q: 0.8, gain: 0.3, type: 'lowpass', wet: 0.6 });
  }

  glitch() {
    this.noiseBurst({ dur: 0.12, freq: 4200, q: 1.2, gain: 0.18, type: 'highpass', wet: 0.1 });
    this.tone({ dur: 0.1, freq: 190, type: 'square', gain: 0.035, slide: 0.4, wet: 0.1 });
  }

  heartbeat(gain = 0.4) {
    this.tone({ dur: 0.15, freq: 55, type: 'sine', gain, wet: 0 });
    this.tone({ at: 0.22, dur: 0.15, freq: 50, type: 'sine', gain: gain * 0.7, wet: 0 });
  }

  creak(pos) {
    this.tone({ dur: 1.4, freq: 70 + Math.random() * 60, type: 'sawtooth', gain: 0.03, slide: 1.4, vibrato: 6, pos, wet: 0.9 });
  }

  // a rubber stamp on paper: the sound of a record becoming official
  stamp() {
    this.noiseBurst({ dur: 0.09, freq: 240, q: 1.2, gain: 0.9, type: 'lowpass', wet: 0.2 });
    this.noiseBurst({ at: 0.01, dur: 0.05, freq: 1800, q: 1, gain: 0.2, wet: 0.2 });
  }

  // the room "drops out" for a moment right after an adoption (doc 11: 生活音が途切れる)
  dropout(sec = 1.2) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const g = this.music.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0.02, t + 0.08);
    g.linearRampToValueAtTime(0.7, t + sec);
  }

  chairScrape(pos) {
    this.noiseBurst({ dur: 0.7, freq: 700, q: 6, gain: 0.35, pos, wet: 0.9, sweep: 1.5 });
    this.tone({ dur: 0.6, freq: 210, type: 'sawtooth', gain: 0.03, slide: 1.3, vibrato: 20, pos, wet: 0.9 });
  }

  ashFall(pos) {
    this.noiseBurst({ dur: 0.12, freq: 5000, q: 0.6, gain: 0.05, type: 'highpass', pos, wet: 0.2 });
  }

  lighter(pos) {
    this.noiseBurst({ dur: 0.04, freq: 4200, q: 3, gain: 0.25, pos, wet: 0.2 });
    this.noiseBurst({ at: 0.05, dur: 0.5, freq: 900, q: 0.8, gain: 0.05, pos, wet: 0.2 });
  }

  vending(pos) {
    this.noiseBurst({ dur: 0.6, freq: 120, q: 2, gain: 0.5, type: 'lowpass', pos, wet: 0.9 });
    this.noiseBurst({ at: 0.55, dur: 0.25, freq: 260, q: 3, gain: 0.6, pos, wet: 0.9 });
  }

  // a steel drawer sliding on its runners; a locker door on its hinge
  drawer(pos, open = true) {
    this.noiseBurst({ dur: 0.35, freq: open ? 1400 : 1100, q: 3, gain: 0.18, pos, wet: 0.4, sweep: open ? 0.7 : 1.4 });
    this.noiseBurst({ at: 0.32, dur: 0.06, freq: 500, q: 2, gain: 0.35, type: 'lowpass', pos, wet: 0.4 });
  }

  lockerDoor(pos, open = true) {
    this.tone({ dur: 0.35, freq: open ? 320 : 260, type: 'sawtooth', gain: 0.025, slide: open ? 1.3 : 0.8, vibrato: 14, pos, wet: 0.5 });
    if (!open) this.noiseBurst({ at: 0.3, dur: 0.12, freq: 700, q: 1.5, gain: 0.5, pos, wet: 0.5 });
  }

  // the office telephone ringing with nobody there (two or three rings)
  ring(pos) {
    const n = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < 8; k++) this.tone({ at: i * 2.6 + k * 0.1, dur: 0.07, freq: 1400 + (k % 2) * 300, type: 'square', gain: 0.03, pos, wet: 0.7 });
    }
  }

  // footsteps somewhere close, then gone
  footsteps(pos) {
    for (let i = 0; i < 5; i++) this.noiseBurst({ at: i * 0.55, dur: 0.08, freq: 260, q: 2, gain: 0.35, type: 'lowpass', pos, wet: 0.8 });
  }

  click() {
    this.noiseBurst({ dur: 0.02, freq: 2600, q: 4, gain: 0.2, wet: 0.1 });
  }

  // laser printer warming up and feeding paper (EV09, END1)
  printer(pos, pages = 1) {
    this.tone({ dur: 1.6, freq: 90, type: 'sawtooth', gain: 0.03, slide: 1.5, pos, wet: 0.3 });
    for (let i = 0; i < pages; i++) {
      this.noiseBurst({ at: 1.2 + i * 0.9, dur: 0.6, freq: 1100, q: 1.2, gain: 0.18, pos, wet: 0.3, sweep: 0.7 });
      this.noiseBurst({ at: 1.75 + i * 0.9, dur: 0.05, freq: 400, q: 2, gain: 0.3, pos, wet: 0.3 });
    }
  }

  // Japanese landline ring (16 Hz-modulated double bell) as heard from the caller's side: ring-back
  ringback(n = 2) {
    for (let i = 0; i < n; i++) {
      this.tone({ at: i * 3, dur: 1, freq: 400, type: 'sine', gain: 0.05, attack: 0.02, wet: 0 });
      this.tone({ at: i * 3, dur: 1, freq: 415, type: 'sine', gain: 0.04, attack: 0.02, wet: 0 });
    }
  }

  pickupPhone() {
    this.noiseBurst({ dur: 0.08, freq: 600, q: 1, gain: 0.3, type: 'lowpass', wet: 0.05 });
  }

  hangup() {
    this.noiseBurst({ dur: 0.1, freq: 300, q: 2, gain: 0.5, type: 'lowpass', wet: 0.1 });
    this.tone({ at: 0.3, dur: 0.25, freq: 400, type: 'sine', gain: 0.03, wet: 0 });
    this.tone({ at: 0.7, dur: 0.25, freq: 400, type: 'sine', gain: 0.03, wet: 0 });
  }

  // the first train far away (EV10, END4)
  train() {
    for (let i = 0; i < 8; i++) {
      this.noiseBurst({ at: i * 0.45, dur: 0.18, freq: 160, q: 1.5, gain: 0.25, type: 'lowpass', wet: 0.6 });
      this.noiseBurst({ at: i * 0.45 + 0.12, dur: 0.15, freq: 180, q: 1.5, gain: 0.2, type: 'lowpass', wet: 0.6 });
    }
    this.tone({ at: 0.5, dur: 2.5, freq: 520, type: 'triangle', gain: 0.015, vibrato: 3, wet: 0.8 });
  }

  // ---- loops -------------------------------------------------------------------------------
  startLoop(name, build) {
    if (!this.ctx || this.loops[name]) return;
    this.loops[name] = build();
  }

  stopLoop(name, fade = 0.5) {
    const l = this.loops[name];
    if (!l) return;
    const t = this.ctx.currentTime;
    l.gain.gain.cancelScheduledValues(t);
    l.gain.gain.setValueAtTime(l.gain.gain.value, t);
    l.gain.gain.linearRampToValueAtTime(0, t + fade);
    setTimeout(() => l.nodes.forEach((n) => n.stop && n.stop()), fade * 1000 + 100);
    delete this.loops[name];
  }

  // Station ambience: fluorescent hum, air-conditioning noise floor, a very low drone.
  ambience() {
    this.startLoop('amb', () => {
      const ctx = this.ctx;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 3);
      gain.connect(this.music);
      const nodes = [];
      const n = ctx.createBufferSource();
      n.buffer = this.noiseBuf;
      n.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 300;
      const ng = ctx.createGain();
      ng.gain.value = 0.18;
      n.connect(f).connect(ng).connect(gain);
      nodes.push(n);
      // 50 Hz mains hum of the fluorescent tubes (eastern Japan), with harmonics
      for (const [fr, gn] of [
        [100, 0.012],
        [200, 0.006],
        [300, 0.003],
      ]) {
        const o = ctx.createOscillator();
        o.frequency.value = fr;
        const og = ctx.createGain();
        og.gain.value = gn;
        o.connect(og).connect(gain);
        nodes.push(o);
      }
      const df = ctx.createBiquadFilter();
      df.type = 'lowpass';
      df.frequency.value = 160;
      df.Q.value = 4;
      const dg = ctx.createGain();
      dg.gain.value = 0.03;
      df.connect(dg).connect(gain);
      for (const fr of [49, 51.5]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = fr;
        o.connect(df);
        nodes.push(o);
      }
      this.droneGain = dg;
      nodes.forEach((x) => x.start());
      return { gain, nodes };
    });
  }

  // the low drone fades out for the true ending
  setCalm(on) {
    this.calm = on;
    if (this.droneGain && this.ctx) this.droneGain.gain.setTargetAtTime(on ? 0 : 0.03, this.ctx.currentTime, 2);
  }

  // positional ventilation fan in the smoking room (stops while the envelope is shown)
  fan(pos) {
    this.startLoop('fan', () => {
      const ctx = this.ctx;
      const gain = ctx.createGain();
      gain.gain.value = 0.5;
      const p = ctx.createPanner();
      p.distanceModel = 'inverse';
      p.refDistance = 1.5;
      p.rolloffFactor = 1.6;
      if (p.positionX) {
        p.positionX.value = pos.x;
        p.positionY.value = pos.y;
        p.positionZ.value = pos.z;
      } else p.setPosition(pos.x, pos.y, pos.z);
      gain.connect(p).connect(this.master);
      const n = ctx.createBufferSource();
      n.buffer = this.noiseBuf;
      n.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 420;
      f.Q.value = 0.8;
      const ng = ctx.createGain();
      ng.gain.value = 0.12;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 9;
      const lg = ctx.createGain();
      lg.gain.value = 0.04;
      lfo.connect(lg).connect(ng.gain);
      n.connect(f).connect(ng).connect(gain);
      [n, lfo].forEach((x) => x.start());
      return { gain, nodes: [n, lfo] };
    });
  }

  // The wife's kitchen on the line: tap water, a fridge hum, now and then a plate or the watch
  // on the washbasin. Telephone band-pass. `watchGone` silences the watch clink (EV08).
  kitchen(on, watchGone = false) {
    if (!on) {
      this.stopLoop('kitchen', 0.3);
      clearInterval(this.kitchenT);
      return;
    }
    this.startLoop('kitchen', () => {
      const ctx = this.ctx;
      const gain = ctx.createGain();
      gain.gain.value = 0.6;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1300;
      bp.Q.value = 0.6;
      gain.connect(bp).connect(this.master);
      this.lineIn = gain;
      const n = ctx.createBufferSource();
      n.buffer = this.noiseBuf;
      n.loop = true;
      const ng = ctx.createGain();
      ng.gain.value = 0.02;
      n.connect(ng).connect(gain);
      const hum = ctx.createOscillator();
      hum.frequency.value = 60;
      const hg = ctx.createGain();
      hg.gain.value = 0.02;
      hum.connect(hg).connect(gain);
      [n, hum].forEach((x) => x.start());
      return { gain, nodes: [n, hum] };
    });
    clearInterval(this.kitchenT);
    this.kitchenT = setInterval(() => {
      if (!this.lineIn) return;
      const k = Math.random();
      const t = this.ctx.currentTime;
      const dest = this.lineIn;
      if (k < 0.4) {
        // a plate set down
        this.tone({ dur: 0.4, freq: 1800 + Math.random() * 400, type: 'sine', gain: 0.03, dest });
        this.tone({ dur: 0.3, freq: 2700, type: 'sine', gain: 0.015, dest });
      } else if (k < 0.7 && !watchGone) {
        // the watch moved on the washbasin: a small metallic clink
        this.tone({ dur: 0.15, freq: 4200, type: 'triangle', gain: 0.02, dest });
      } else {
        const src = this.ctx.createBufferSource();
        src.buffer = this.noiseBuf;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.06, t + 0.2);
        g.gain.linearRampToValueAtTime(0, t + 1.6);
        src.connect(g).connect(dest);
        src.start(t);
        src.stop(t + 1.7);
      }
    }, 2600);
  }

  // per-frame: rare, natural station sounds around the listener (never tied to a jump scare)
  update(dt, listener) {
    if (!this.ctx || !listener) return;
    this.ambT -= dt;
    if (this.ambT > 0) return;
    this.ambT = 9 + Math.random() * 14;
    const a = Math.random() * Math.PI * 2;
    const r = 5 + Math.random() * 7;
    const pos = { x: listener.x + Math.cos(a) * r, y: 2.5, z: listener.z + Math.sin(a) * r };
    const k = Math.random();
    if (this.calm) {
      if (k < 0.5) this.tone({ dur: 0.5, freq: 900, type: 'sine', gain: 0.01, pos, wet: 0.5 });
      return;
    }
    if (k < 0.45) this.creak(pos);
    else if (k < 0.75)
      this.noiseBurst({ dur: 0.05, freq: 1800, q: 4, gain: 0.08, pos, wet: 0.7 }); // a tick in the ducts
    else {
      // a phone ringing once in an empty office far away
      this.tone({ dur: 0.6, freq: 1300, type: 'square', gain: 0.008, pos, wet: 0.9, vibrato: 30 });
    }
  }
}
