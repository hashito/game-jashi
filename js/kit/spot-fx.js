/* game-kit 6e0b6f0: js/spot-fx.js — edit in game-kit and run tools/kit-sync.js */
// "It saw you" effects (standard 1.9): the moment a monster notices the player, the screen answers. A small library of named effects, chosen per
// game or per monster, combinable, gentler in calm mode, and open to a game's own.
//   game.json      "spotFx": "red-flash"                                  (every monster; default: none beyond the standard spook + glitch)
//   monsters.json  { "id": "m1", "spotFx": ["white-flash", "shake", { "name": "word", "text": "見つかった" }] }   (this monster; wins over game.json)
//   ext / code     registerSpotFx('my-fx', (host, step, env) => { ...; return ms })   then "spotFx": "my-fx"
//   ctx.spotFx(spec, { first })   play now (game-core makes ctx.spotFx; js/monster-std.js calls it on 'notice')
// An effect is a function (host, step, env) -> ms it lasts. step = { name, strength 0..1, ms, text, color }; env = { canvas, camera, sound, calm }.
// Every effect builds its own elements in #gf-spotfx (pointer-events: none) and removes them when done; nothing stays on the screen.
// ctx.calm / reduced motion: flashes, static and glitches become a soft dark edge (spotPlan), strength at most 0.4 (rule A2: the setting おだやか).

export const SPOT_FX = {};   // name -> { label, make }
export const registerSpotFx = (name, make, label = name) => { if (typeof make !== 'function') throw new Error(`spotFx "${name}": needs a function`); SPOT_FX[name] = { label, make }; };
const FLASHY = new Set(['red-flash', 'white-flash', 'static', 'glitch', 'shake', 'zoom']);
export const SPOT_COMBOS = {   // named sets (a spec may name one)
  jump: ['white-flash', 'shake', 'word'],
  dread: ['ink', 'heartbeat', 'desaturate'],
  tape: ['static', 'glitch'],
  stare: ['tunnel', 'zoom', 'heartbeat'],
};

/** normalise a spec (string | combo | object | array) into steps; calm swaps the flashy ones for a soft edge (pure) */
export function spotPlan(spec, { calm = false } = {}) {
  const out = [];
  const add = (s) => {
    if (!s) return;
    if (Array.isArray(s)) return s.forEach(add);
    if (typeof s === 'string') { if (SPOT_COMBOS[s]) return SPOT_COMBOS[s].forEach(add); s = { name: s }; }
    if (typeof s !== 'object' || !s.name) return;
    let st = { strength: 1, ...s };
    if (calm) { st.strength = Math.min(0.4, st.strength); if (FLASHY.has(st.name)) st = { ...st, name: 'ink' }; }
    if (!out.some((o) => o.name === st.name)) out.push(st);
  };
  add(spec);
  return out;
}

const el = (host, css, html = '') => { const d = document.createElement('div'); d.style.cssText = `position:absolute;inset:0;pointer-events:none;${css}`; d.innerHTML = html; host.appendChild(d); return d; };
// our own layers hold their last frame until removed; the game's canvas / camera targets are let go when done (release)
const anim = (node, frames, ms, done) => { const a = node.animate(frames, { duration: ms, easing: 'ease-out', fill: done === release ? 'none' : 'forwards' }); a.onfinish = () => (done ? done(a) : node.remove()); return ms; };
const release = (a) => a.cancel();
const k = (s, a, b) => a + (b - a) * Math.max(0, Math.min(1, s.strength));

registerSpotFx('red-flash', (h, s) => anim(el(h, `background:radial-gradient(ellipse at center, rgba(160,0,0,${k(s, 0.15, 0.35)}) 0%, rgba(110,0,0,${k(s, 0.4, 0.85)}) 100%)`), [{ opacity: 1 }, { opacity: 0 }], s.ms || 900), '赤い閃光');
registerSpotFx('white-flash', (h, s) => anim(el(h, 'background:#fff'), [{ opacity: k(s, 0.4, 0.9) }, { opacity: 0 }], s.ms || 450), '白飛び');
registerSpotFx('ink', (h, s) => { const d = el(h, `background:radial-gradient(ellipse at center, transparent ${k(s, 55, 30)}%, rgba(0,0,0,0.92) 100%)`); return anim(d, [{ opacity: 0, transform: 'scale(1.25)' }, { opacity: 1, transform: 'scale(1)', offset: 0.3 }, { opacity: 0, transform: 'scale(1.1)' }], s.ms || 1800); }, '墨のにじみ');
registerSpotFx('heartbeat', (h, s, env) => {
  env.sound && env.sound('heartbeat', 1);
  const d = el(h, `background:radial-gradient(ellipse at center, transparent 45%, rgba(90,0,0,${k(s, 0.35, 0.7)}) 100%)`);
  return anim(d, [{ opacity: 0 }, { opacity: 1, offset: 0.12 }, { opacity: 0.2, offset: 0.3 }, { opacity: 1, offset: 0.42 }, { opacity: 0 }], s.ms || 1400);
}, '鼓動');
registerSpotFx('static', (h, s) => {
  const c = document.createElement('canvas'); c.width = 160; c.height = 90; c.style.cssText = `position:absolute;inset:0;width:100%;height:100%;pointer-events:none;image-rendering:pixelated;mix-blend-mode:screen;opacity:${k(s, 0.25, 0.55)}`; h.appendChild(c);
  const g = c.getContext('2d'), img = g.createImageData(160, 90); let on = true;
  const tick = () => { if (!on) return; for (let i = 0; i < img.data.length; i += 4) { const v = Math.random() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; } g.putImageData(img, 0, 0); requestAnimationFrame(tick); };
  tick(); const ms = s.ms || 700; anim(c, [{ opacity: c.style.opacity }, { opacity: 0 }], ms, () => { on = false; c.remove(); }); return ms;
}, '砂嵐');
registerSpotFx('glitch', (h, s, env) => {
  const ms = s.ms || 700, n = 9;
  for (let i = 0; i < n; i++) { const top = Math.random() * 90, hh = 2 + Math.random() * 8; const d = el(h, `top:${top}%;bottom:auto;height:${hh}%;background:linear-gradient(90deg, rgba(255,0,80,.55), rgba(0,255,255,.5));mix-blend-mode:screen`); const dx = () => `translateX(${(Math.random() - 0.5) * 30 * s.strength}%)`; anim(d, [{ transform: dx(), opacity: 1 }, { transform: dx(), opacity: 0.2, offset: 0.25 }, { transform: dx(), opacity: 1, offset: 0.5 }, { transform: 'translateX(0)', opacity: 0 }], ms * (0.6 + Math.random() * 0.4)); }
  if (env.canvas) anim(env.canvas, [{ filter: `hue-rotate(${90 * s.strength}deg) contrast(1.4)`, transform: `translateX(${8 * s.strength}px)` }, { filter: 'none', transform: 'none' }], ms, release);
  return ms;
}, '映像の乱れ');
registerSpotFx('shake', (h, s, env) => {
  const t = env.canvas || h, a = 14 * s.strength, ms = s.ms || 500;
  return anim(t, [0, 1, 2, 3, 4, 5, 6].map((i) => ({ transform: i === 6 ? 'none' : `translate(${(Math.random() - 0.5) * a}px, ${(Math.random() - 0.5) * a}px)` })), ms, release);
}, '揺れ');
registerSpotFx('zoom', (h, s, env) => {
  const cam = env.camera; if (!cam || !cam.isPerspectiveCamera) return 0;
  const f0 = cam.fov, f1 = f0 * (1 - 0.28 * s.strength), ms = s.ms || 900, t0 = performance.now();
  const step = (t) => { const p = Math.min(1, (t - t0) / ms), e = p < 0.25 ? p / 0.25 : 1 - (p - 0.25) / 0.75; cam.fov = f0 + (f1 - f0) * Math.max(0, e); cam.updateProjectionMatrix(); if (p < 1) requestAnimationFrame(step); else { cam.fov = f0; cam.updateProjectionMatrix(); } };
  requestAnimationFrame(step); return ms;
}, '引き寄せ');
registerSpotFx('tunnel', (h, s) => { const d = el(h, `backdrop-filter:blur(${k(s, 2, 6)}px);-webkit-mask:radial-gradient(ellipse at center, transparent 35%, #000 75%);mask:radial-gradient(ellipse at center, transparent 35%, #000 75%)`); return anim(d, [{ opacity: 0 }, { opacity: 1, offset: 0.25 }, { opacity: 0 }], s.ms || 2000); }, '視野が狭まる');
registerSpotFx('desaturate', (h, s, env) => { const t = env.canvas; if (!t) return 0; return anim(t, [{ filter: 'none' }, { filter: `grayscale(${s.strength}) contrast(1.2) sepia(${0.3 * s.strength})`, offset: 0.2 }, { filter: 'none' }], s.ms || 2200, release); }, '色が抜ける');
registerSpotFx('letterbox', (h, s) => {
  const ms = s.ms || 2200, hh = k(s, 6, 12);
  for (const side of ['top', 'bottom']) anim(el(h, `${side === 'top' ? 'bottom' : 'top'}:auto;height:${hh}%;background:#000`), [{ transform: `translateY(${side === 'top' ? -100 : 100}%)` }, { transform: 'none', offset: 0.2 }, { transform: 'none', offset: 0.75 }, { transform: `translateY(${side === 'top' ? -100 : 100}%)` }], ms);
  return ms;
}, '黒帯');
registerSpotFx('word', (h, s) => {
  const d = el(h, 'display:grid;place-items:center');
  const w = document.createElement('div'); w.textContent = s.text || '見つかった';
  w.style.cssText = `font:900 clamp(40px, 12vw, 120px)/1 var(--gf-font, serif);color:${s.color || 'var(--gf-danger, #e0483a)'};letter-spacing:.1em;text-shadow:0 0 18px rgba(0,0,0,.9), 0 0 2px #000`;
  d.appendChild(w); d.setAttribute('role', 'status');
  anim(w, [{ transform: 'scale(1.6)', opacity: 0 }, { transform: 'scale(1)', opacity: 1, offset: 0.15 }, { transform: 'scale(1.02) translateX(2px)', opacity: 1, offset: 0.7 }, { transform: 'scale(1.05)', opacity: 0 }], s.ms || 1500, () => d.remove());
  return s.ms || 1500;
}, '文字');
registerSpotFx('veins', (h, s) => {
  const paths = Array.from({ length: 10 }, (_, i) => { const side = i % 4, a = (i * 37) % 100; const [x, y] = side === 0 ? [a, 0] : side === 1 ? [100, a] : side === 2 ? [a, 100] : [0, a]; let d = `M${x} ${y}`, px = x, py = y; for (let j = 0; j < 5; j++) { px += (50 - px) * 0.18 + (Math.random() - 0.5) * 8; py += (50 - py) * 0.18 + (Math.random() - 0.5) * 8; d += ` L${px.toFixed(1)} ${py.toFixed(1)}`; } return `<path d="${d}"/>`; }).join('');
  const d = el(h, '', `<svg viewBox="0 0 100 100" preserveAspectRatio="none" style="width:100%;height:100%"><g fill="none" stroke="rgba(120,0,0,.8)" stroke-width="${k(s, 0.4, 0.9)}" stroke-linecap="round">${paths}</g></svg>`);
  return anim(d, [{ opacity: 0, clipPath: 'inset(0 0 0 0)' }, { opacity: 1, offset: 0.2 }, { opacity: 0 }], s.ms || 1600);
}, '血の筋');

/** the player for a game: ctx.spotFx(spec, opts) plays a spec (or the game default) on top of the view */
export function createSpotFx(ctx = {}, gameSpec = null) {
  let host = null;
  const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const play = (spec = gameSpec, o = {}) => {
    if (typeof document === 'undefined') return [];
    const calm = !!(ctx.calm || (ctx.settings && ctx.settings.calm) || document.documentElement.dataset.gfCalm === '1' || reduced());
    const steps = spotPlan(spec == null ? gameSpec : spec, { calm });
    if (!steps.length) return [];
    if (!host || !host.isConnected) { host = document.getElementById('gf-spotfx') || Object.assign(document.createElement('div'), { id: 'gf-spotfx' }); host.setAttribute('aria-hidden', 'true'); host.style.cssText = 'position:fixed;inset:0;z-index:40;pointer-events:none;overflow:hidden'; document.body.appendChild(host); }
    const env = { canvas: (ctx.renderer && ctx.renderer.domElement) || document.querySelector('canvas'), camera: ctx.camera || null, sound: ctx.sound || null, calm, first: o.first };
    return steps.map((st) => { const fx = SPOT_FX[st.name]; if (!fx) { console.warn(`spotFx: no effect "${st.name}"`); return 0; } try { return fx.make(host, st, env) || 0; } catch (e) { console.warn(`spotFx ${st.name}:`, e); return 0; } });
  };
  return { play, plan: (spec) => spotPlan(spec, { calm: !!ctx.calm }), names: () => Object.keys(SPOT_FX) };
}
