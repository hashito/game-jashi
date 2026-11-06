/* game-kit 1b8c7db: js/body-fx.js — edit in game-kit and run tools/kit-sync.js */
// What the body does to the player (standard 1.12.1, from 五人分の朝: 「目眩などのエフェクトも標準化」). Always there: ctx.body, no setting needed.
//   ctx.body.dizzy(sec = 2.6, k = 1)    a dizzy spell: the view blurs, dims and tilts, two thumps, the legs slow for its length, then all comes back
//   ctx.body.heartbeat(sec = 4, bpm = 90, gain = 0.5)   heard from inside
//   ctx.body.ringing(sec = 2.2, k = 1)  the ears ring
//   ctx.body.stagger(sec = 2, k = 0.5)  the legs give for sec (k = how much slower, 0..0.8), they recover slowly
//   await ctx.body.collapse()           the faint: the heart slows, the view tilts and sinks to the floor, black. Move the player, then
//   await ctx.body.wake()               the eyes open twice, the blur clears
// A line of data/talk.json can carry one: { "who": "澪", "text": "……", "fx": "dizzy" } or "fx": { "dizzy": [3.2, 1.5] } (ctx.body's method and its arguments).
// A monster's nearness is game.json "approach" (js/approach-fx.js): the same legs, sway and ringing, driven by the distance.
// Calm mode / reduced motion: no tilt, no blur, the sound and the legs stay; ?qa: nothing waits.
const still = (ctx) => !!(ctx && (ctx.calm || ctx.qa || (ctx.settings && ctx.settings.calm))) || (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const canvasOf = (ctx) => (ctx.renderer && ctx.renderer.domElement) || document.querySelector('canvas');
const thump = (ctx, at = 0, g = 0.5) => { try { ctx.audio && ctx.audio.noiseBurst && ctx.audio.noiseBurst({ at, dur: 0.14, freq: 70, q: 1, gain: g, type: 'lowpass', wet: 0.3 }); } catch { /* quiet */ } };

/** a short dizzy spell: the view blurs, dims and tilts, then comes back (k = how strong) */
export function dizzy(ctx, sec = 2.6, k = 1) {
  thump(ctx, 0, 0.35 * k); thump(ctx, 0.3, 0.25 * k);
  stagger(ctx, sec, Math.min(0.5, 0.3 * k));
  const c = canvasOf(ctx); if (!c || still(ctx)) return;
  c.animate([{ filter: 'none', transform: 'none' }, { filter: `blur(${(2.2 * k).toFixed(1)}px) brightness(.65)`, transform: `rotate(${(1.6 * k).toFixed(2)}deg) scale(1.03)`, offset: 0.35 }, { filter: `blur(${(1.2 * k).toFixed(1)}px) brightness(.8)`, transform: `rotate(${(-0.9 * k).toFixed(2)}deg) scale(1.02)`, offset: 0.7 }, { filter: 'none', transform: 'none' }], { duration: sec * 1000, easing: 'ease-in-out' });
}
/** the faint: the heart slows, the view tilts and sinks to the floor, the dark closes in. Resolves on black (call wake() after the move) */
export async function collapse(ctx) {
  try { ctx.fp && ctx.fp.release && ctx.fp.release(); } catch { /* none */ }
  const v = document.createElement('div'); v.className = 'gf-mo-cover';
  v.style.background = 'radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 10%, #000 70%)';
  document.body.appendChild(v);
  const c = canvasOf(ctx);
  if (ctx.qa || still(ctx)) { v.style.background = '#000'; v.classList.add('on'); await wait(ctx.qa ? 50 : 600); collapse.v = v; return; }
  for (let i = 0; i < 5; i++) thump(ctx, i * (0.7 + i * 0.25), 0.55 - i * 0.08);
  if (c) collapse.anim = c.animate([{ filter: 'none', transform: 'none' }, { filter: 'blur(2px) brightness(.7)', transform: 'rotate(-3deg) translateY(2%) scale(1.04)', offset: 0.3 }, { filter: 'blur(5px) brightness(.45)', transform: 'rotate(10deg) translateY(10%) scale(1.12)', offset: 0.75 }, { filter: 'blur(9px) brightness(.2)', transform: 'rotate(24deg) translateY(28%) scale(1.25)' }], { duration: 3400, easing: 'cubic-bezier(.5,0,.8,.6)', fill: 'forwards' });
  await wait(30); v.style.transition = 'opacity 3.2s ease-in'; v.classList.add('on');
  await wait(3300);
  v.style.background = '#000';
  try { ctx.audio && ctx.audio.noiseBurst && ctx.audio.noiseBurst({ dur: 0.35, freq: 140, q: 1, gain: 0.6, type: 'lowpass', wet: 0.4 }); } catch { /* quiet */ }   // the body hits the floor
  await wait(1400);
  collapse.v = v;
}
/** waking up after the faint (or any black): the eyes open twice, the blur clears */
export async function wake(ctx) {
  const v = collapse.v; collapse.v = null;
  if (collapse.anim) { collapse.anim.cancel(); collapse.anim = null; }
  const c = canvasOf(ctx);
  if (!v) return;
  if (ctx.qa || still(ctx)) { v.remove(); return; }
  v.style.transition = 'none'; v.style.background = 'none'; v.style.opacity = '1';
  v.innerHTML = '<div style="position:absolute;left:0;right:0;top:0;height:50%;background:#000;transition:transform 1.1s ease"></div><div style="position:absolute;left:0;right:0;bottom:0;height:50%;background:#000;transition:transform 1.1s ease"></div>';
  const [top, bot] = v.children;
  if (c) c.animate([{ filter: 'blur(8px) brightness(.5)' }, { filter: 'blur(3px) brightness(.8)', offset: 0.6 }, { filter: 'none' }], { duration: 4200, easing: 'ease-out' });
  const lid = (k) => { top.style.transform = `translateY(${-k * 100}%)`; bot.style.transform = `translateY(${k * 100}%)`; };
  await wait(400); lid(0.25); await wait(1200); lid(0); await wait(700); lid(0.6); await wait(900); lid(0.35); await wait(600); lid(1); await wait(1200);
  v.remove();
}

/** the legs give for sec: fp.bodySlow eases back to 1 */
export function stagger(ctx, sec = 2, k = 0.5) {
  const fp = ctx.fp; if (!fp) return;
  const t0 = performance.now(), ms = sec * 1000, slow = Math.max(0, Math.min(0.8, k));
  stagger.id = (stagger.id || 0) + 1; const id = stagger.id;
  const tick = () => { if (id !== stagger.id) return; const u = (performance.now() - t0) / ms; if (u >= 1) { fp.bodySlow = 1; return; } fp.bodySlow = 1 - slow * (u < 0.6 ? 1 : (1 - u) / 0.4); setTimeout(tick, 80); };
  tick();
}
/** a heartbeat heard from inside */
export function heartbeat(ctx, sec = 4, bpm = 90, gain = 0.5) {
  const gap = 60 / bpm;
  for (let t = 0; t < sec; t += gap) { thump(ctx, t, gain); thump(ctx, t + 0.22, gain * 0.6); }
}
/** the ears ring */
export function ringing(ctx, sec = 2.2, k = 1) {
  try { ctx.audio && ctx.audio.tone && ctx.audio.tone({ dur: sec, freq: 3400 + Math.random() * 500, type: 'sine', gain: 0.012 * k, attack: Math.min(0.8, sec / 3), wet: 0.2 }); } catch { /* quiet */ }
}
/** ctx.body: the same effects without an import */
export function createBodyFx(ctx) {
  return {
    dizzy: (sec, k) => dizzy(ctx, sec, k), stagger: (sec, k) => stagger(ctx, sec, k), heartbeat: (sec, bpm, gain) => heartbeat(ctx, sec, bpm, gain), ringing: (sec, k) => ringing(ctx, sec, k),
    collapse: () => collapse(ctx), wake: () => wake(ctx),
    /** a talk line's fx: "dizzy" or { "dizzy": [3.2, 1.5] } */
    play(fx) { if (!fx || ctx.qa) return; for (const [name, args] of Object.entries(typeof fx === 'string' ? { [fx]: [] } : fx)) { const f = this[name]; if (typeof f === 'function' && name !== 'play') f(...(Array.isArray(args) ? args : [args])); } },
  };
}
