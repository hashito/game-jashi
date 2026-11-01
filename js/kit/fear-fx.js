/* game-kit 6e0b6f0: js/fear-fx.js — edit in game-kit and run tools/kit-sync.js */
// Fear on the body (standard 1.8.1, feedback 2026-11-01 "震えや心音などの細かいギミック"): when the thing is near or in view the view trembles,
// the heart beats faster and louder, and the edges of the screen close in, pulsing with the beat. One number drives it all.
//
//   import { createFear } from './kit/fear-fx.js';
//   const fear = createFear(ctx);            // adds the #gf-fear vignette
//   fear.kick(0.9);                          // a shock (a face at the window): rises at once, fades over ~3 s
//   // every frame, after the controller (a system): the level 0..1 this frame (distance, being seen, a meter)
//   fear.update(dt, level, { heart: true });  // heart: false when another part already beats the heart (the monster pack in a chase)
//
// ctx.calm (low stimulation) keeps it at 40 %. The tremble is a roll / pitch wobble added after the controller sets the rotation, so it never
// drifts the view. Pure model (fearStep) + DOM / camera glue.
export function fearStep(s, dt, level) {
  const kick = Math.max(0, (s.kick || 0) - dt * 0.33);
  const want = Math.max(0, Math.min(1, Math.max(level || 0, kick)));
  const v = (s.v || 0) + (want - (s.v || 0)) * Math.min(1, dt * (want > (s.v || 0) ? 6 : 1.6));
  let hb = (s.hb ?? 0) - dt, beat = false;
  if (v > 0.15 && hb <= 0) { hb = 1.15 - v * 0.72; beat = true; } else if (v <= 0.15) hb = Math.min(hb, 0.25);
  return { kick, v, hb, beat, pulse: beat ? 1 : Math.max(0, (s.pulse || 0) - dt * 3.2) };
}
export const heartGap = (v) => 1.15 - v * 0.72;

export function createFear(ctx, o = {}) {
  let s = { v: 0, kick: 0, hb: 0, pulse: 0 };
  let el = null;
  if (typeof document !== 'undefined') {
    el = document.getElementById('gf-fear');
    if (!el) { el = document.createElement('div'); el.id = 'gf-fear'; el.setAttribute('aria-hidden', 'true'); document.body.appendChild(el); }
  }
  const api = {
    get level() { return s.v; },
    kick(a = 1) { s.kick = Math.max(s.kick, a); },
    update(dt, level = 0, u = {}) {
      s = fearStep(s, dt, level);
      const calm = !!ctx.calm, f = s.v * (calm ? 0.4 : 1), t = performance.now() / 1000, cam = ctx.camera;
      if (cam && f > 0.04 && !u.noShake) {
        cam.rotation.z += (Math.sin(t * 31) + Math.sin(t * 47.3) * 0.6) * 0.0045 * f * (o.shake ?? 1);
        cam.rotation.x += Math.sin(t * 38.7 + 1.3) * 0.0032 * f * (o.shake ?? 1);
      }
      if (s.beat && u.heart !== false) ctx.audio && ctx.audio.heartbeat && ctx.audio.heartbeat((0.16 + f * 0.42) * (o.heartGain ?? 1));
      if (el) {
        const op = Math.min(0.92, f * 0.75 + s.pulse * f * 0.22);
        const shown = op > 0.02 ? op.toFixed(3) : '0';
        if (el.dataset.op !== shown) { el.dataset.op = shown; el.style.opacity = shown; }
      }
      return s;
    },
    reset() { s = { v: 0, kick: 0, hb: 0, pulse: 0 }; if (el) { el.style.opacity = '0'; el.dataset.op = '0'; } },
  };
  return api;
}
