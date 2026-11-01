/* game-kit 6e0b6f0: js/voice-fx.js — edit in game-kit and run tools/kit-sync.js */
// Voice processing for in-world voices (rule S15; standard 1.5): a phone call, the PA (店内放送), a radio, a voice heard through a wall. S15: the voice must be degraded
// ENOUGH to be hard to hear (narrow band, noise, dropouts, echo, clipping) - the subtitle carries the words. Web Audio only, no files; the pure part runs in Node.
//
//   const vfx = createVoiceFx(audio.ctx, { out: audio.master });             // after audio.init()
//   const h = vfx.play(source, 'phone', { pos, intensity: 1, volume: 1 });   // source: an AudioBuffer, an HTMLAudioElement / MediaStream, or a url (fetched + decoded)
//   h.stop();  h.done  (a Promise that resolves when it ended)                // a call that rings out, a PA announcement, a muffled voice in the next room
//   vfx.presets  // 'phone' | 'pa' | 'radio' | 'wall'
// Chain: high-pass -> low-pass (the band) -> clipping (waveshaper) -> dropout gate (random cut-outs) -> echo (delay + feedback) / room send -> out; a noise bed (hiss / hum / crackle) is mixed in.
//   phone  300-3400 Hz, light clipping, hiss, a few dropouts      pa     450-4200 Hz, a long echo, hum, mild clipping   (店内放送)
//   radio  500-2800 Hz, heavy clipping, loud static, squelch dropouts      wall   a low-pass at ~420 Hz, quieter, a little echo (muffled through a wall)
// `intensity` 0..1 scales the damage (1 = S15 minimum for the preset; more than 1 is allowed up to 1.5). tools / tests: s15Ok(name) says whether a preset is degraded enough.
export const PRESETS = {
  phone: { hp: 300, lp: 3400, q: 0.9, drive: 2.2, noise: 0.045, noiseKind: 'hiss', dropout: { rate: 0.5, min: 0.06, max: 0.22 }, echo: { time: 0.07, fb: 0.12, mix: 0.1 }, gain: 1.0 },
  pa: { hp: 450, lp: 4200, q: 0.8, drive: 1.6, noise: 0.03, noiseKind: 'hum', dropout: { rate: 0.2, min: 0.05, max: 0.15 }, echo: { time: 0.19, fb: 0.38, mix: 0.32 }, gain: 0.95 },
  radio: { hp: 500, lp: 2800, q: 1.2, drive: 4, noise: 0.09, noiseKind: 'static', dropout: { rate: 0.9, min: 0.05, max: 0.3 }, echo: { time: 0.05, fb: 0.05, mix: 0.05 }, gain: 0.9 },
  wall: { hp: 80, lp: 420, q: 0.7, drive: 1, noise: 0.01, noiseKind: 'hiss', dropout: { rate: 0, min: 0, max: 0 }, echo: { time: 0.11, fb: 0.2, mix: 0.18 }, gain: 0.6 },
};
// S15 minimum damage: a band no wider than 4000 Hz and at least one of noise >= 0.02 / dropouts / echo mix >= 0.15 / drive >= 2; the wall is judged by its low-pass
export function s15Ok(name, intensity = 1) {
  const p = paramsFor(name, intensity);
  const band = p.lp - p.hp;
  const narrow = band <= 4000 || p.lp <= 800;
  const damaged = p.noise >= 0.02 || p.dropout.rate > 0 || p.echo.mix >= 0.15 || p.drive >= 2 || p.lp <= 800;
  return narrow && damaged;
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// the preset scaled by the intensity (the band narrows, the noise / dropouts / clipping / echo grow)
export function paramsFor(name, intensity = 1) {
  const b = PRESETS[name];
  if (!b) throw new Error(`voice preset "${name}" is not one of ${Object.keys(PRESETS).join(', ')}`);
  const k = clamp(intensity, 0, 1.5), mid = Math.sqrt(b.hp * b.lp);
  const hp = k < 1 ? b.hp * (1 - (1 - k) * 0.5) : b.hp * Math.pow(mid / b.hp, (k - 1) * 0.35);   // under 1 the band opens up, over 1 it narrows toward its middle
  const lp = k < 1 ? b.lp * (1 + (1 - k) * 1.2) : b.lp * Math.pow(mid / b.lp, (k - 1) * 0.35);
  return { ...b, hp, lp, drive: 1 + (b.drive - 1) * k, noise: b.noise * k, dropout: { ...b.dropout, rate: b.dropout.rate * k }, echo: { ...b.echo, mix: clamp(b.echo.mix * k, 0, 0.6), fb: clamp(b.echo.fb * (0.6 + 0.4 * k), 0, 0.6) } };
}
// the waveshaper curve: tanh clipping of strength `drive` (1 = nearly linear)
export function distortionCurve(drive = 2, n = 1024) {
  const c = new Float32Array(n), k = Math.max(1, drive);
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(x * k) / Math.tanh(k); }
  return c;
}
// when the voice cuts out: [{ at, len }] over `duration` seconds (rate = cut-outs per second)
export function dropoutSchedule(dropout, duration, rand = Math.random) {
  const out = [];
  if (!dropout || !(dropout.rate > 0)) return out;
  for (let t = 0.2 + rand() * 0.4; t < duration; t += 0.25 + rand() * (1 / dropout.rate)) { const len = dropout.min + rand() * (dropout.max - dropout.min); if (t + len < duration) out.push({ at: t, len }); }
  return out;
}

// ---------------- Web Audio ----------------
function noiseBuffer(ctx, kind, seconds = 2) {
  const n = Math.floor(ctx.sampleRate * seconds), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === 'hum') d[i] = Math.sin((i / ctx.sampleRate) * Math.PI * 2 * 100) * 0.6 + w * 0.15;       // 100 Hz mains hum
    else if (kind === 'static') d[i] = w * (Math.random() < 0.003 ? 1 : 0.5) ;                             // hiss with crackle
    else { last = last * 0.4 + w * 0.6; d[i] = last; }                                                       // hiss
  }
  return buf;
}
export function createVoiceFx(ctx, o = {}) {
  const out = o.out || ctx.destination, rand = o.rand || Math.random;
  const bufCache = new Map();
  const toSource = async (src) => {
    if (src && src.sampleRate && src.getChannelData) { const s = ctx.createBufferSource(); s.buffer = src; return { node: s, start: () => s.start(), stop: () => { try { s.stop(); } catch { /* already stopped */ } }, ended: (f) => (s.onended = f), duration: src.duration }; }
    if (typeof src === 'string') { let b = bufCache.get(src); if (!b) { const r = await fetch(src); b = await ctx.decodeAudioData(await r.arrayBuffer()); bufCache.set(src, b); } return toSource(b); }
    if (src && src.play && ctx.createMediaElementSource) { const s = ctx.createMediaElementSource(src); return { node: s, start: () => src.play(), stop: () => src.pause(), ended: (f) => src.addEventListener('ended', f), duration: src.duration || 5 }; }
    if (src && src.getAudioTracks && ctx.createMediaStreamSource) return { node: ctx.createMediaStreamSource(src), start() {}, stop() {}, ended() {}, duration: 60 };
    throw new Error('voice-fx: source must be an AudioBuffer, a media element, a MediaStream or a url');
  };
  function play(source, name, opt = {}) {
    const p = paramsFor(name, opt.intensity ?? 1);
    let stopped = false, finish; const done = new Promise((r) => (finish = r));
    const handle = { done, stop() { stopped = true; try { h && h.stop(); } catch { /* */ } nodes.forEach((n) => { try { n.disconnect(); } catch { /* */ } }); finish(); }, params: p };
    const nodes = []; let h = null;
    (async () => {
      h = await toSource(source); if (stopped) return;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = p.hp; hp.Q.value = p.q;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = p.lp; lp.Q.value = p.q;
      const ws = ctx.createWaveShaper(); ws.curve = distortionCurve(p.drive); ws.oversample = '2x';
      const gate = ctx.createGain(); gate.gain.value = 1;
      const mix = ctx.createGain(); mix.gain.value = (opt.volume ?? 1) * p.gain;
      const delay = ctx.createDelay(1); delay.delayTime.value = p.echo.time;
      const fb = ctx.createGain(); fb.gain.value = p.echo.fb; const wet = ctx.createGain(); wet.gain.value = p.echo.mix;
      h.node.connect(hp); hp.connect(lp); lp.connect(ws); ws.connect(gate); gate.connect(mix);
      gate.connect(delay); delay.connect(fb); fb.connect(delay); delay.connect(wet); wet.connect(mix);
      // a noise bed under the voice (the same band as the voice, so it sounds like the line, not like a hiss on top)
      const ns = ctx.createBufferSource(); ns.buffer = noiseBuffer(ctx, p.noiseKind); ns.loop = true;
      const nhp = ctx.createBiquadFilter(); nhp.type = 'highpass'; nhp.frequency.value = p.hp; const nlp = ctx.createBiquadFilter(); nlp.type = 'lowpass'; nlp.frequency.value = p.lp * 1.3;
      const ng = ctx.createGain(); ng.gain.value = p.noise; ns.connect(nhp); nhp.connect(nlp); nlp.connect(ng); ng.connect(mix);
      let dest = out;
      if (opt.pos && ctx.createPanner) { const pn = ctx.createPanner(); pn.panningModel = 'HRTF'; pn.distanceModel = 'inverse'; pn.refDistance = 2; pn.setPosition(opt.pos.x, opt.pos.y ?? 1.5, opt.pos.z); pn.connect(out); dest = pn; nodes.push(pn); }
      mix.connect(dest);
      nodes.push(hp, lp, ws, gate, mix, delay, fb, wet, ns, nhp, nlp, ng);
      const t0 = ctx.currentTime;
      for (const d of dropoutSchedule(p.dropout, (h.duration || 8) + 0.5, rand)) { gate.gain.setValueAtTime(1, t0 + d.at - 0.005); gate.gain.linearRampToValueAtTime(0.02, t0 + d.at); gate.gain.setValueAtTime(0.02, t0 + d.at + d.len); gate.gain.linearRampToValueAtTime(1, t0 + d.at + d.len + 0.01); }
      ns.start(); h.ended(() => { if (stopped) return; ns.stop(); setTimeout(() => { handle.stop(); }, p.echo.time * 1000 * 6); });
      h.start();
    })().catch((e) => { handle.error = e; finish(); });
    return handle;
  }
  return { play, presets: Object.keys(PRESETS), params: paramsFor };
}
