/* game-kit 1b8c7db: js/approach-fx.js — edit in game-kit and run tools/kit-sync.js */
// The approach of a monster, on the screen and in the ears (standard 1.11, from 五人分の朝 2026-11-05: 「敵が近づいた時の演出を強く」
// 「捕まったらアップにする」). game.json:
//   "approach": true | { "vignette": true, "heartbeat": true, "shake": true, "catchImage": "assets/photos/x.jpg", "catchOn": ["monster"], "catchFocus": "50% 10%" }
// Reads ctx.fxState = { danger 0..1, chasing } (written by js/monster-std.js or the game's own monster) every frame:
//   vignette   a dark-red edge that closes in with the danger
//   heartbeat  from about one beat a second at the edge of hearing to three when it is on you (monster-std's own chase beat steps aside)
//   shake      a small tremble of the view when it is very near (never in calm mode)
//   pulse(k)   the warning when it turns toward you: a red flash at the edges, a low hit, the fx surge (monster-std calls it on "notice")
//   catchClose the moment of the catch: the picture (catchImage) rushes in full screen, then dark; ctx.die waits for it (reasons in catchOn)
//   dizzy      (1.11.1, from 五人分の朝: 「近づくと心臓の鼓動やめまいなどが発生して逃げづらくなるように」) when it is near, the legs slow
//              (fp.slow down to 1 - slowBy), the view sways and blurs a little and the ears ring; it eases off as the distance grows
//   presence   its own sound, more often the nearer it is: 'wet' (a drowned gurgle and a choked moan) | 'breath' (a slow rasp) | null;
//              from ctx.fxState.pos ({x, y, z}) in 3D when the game gives it
// Calm mode / reduced motion: no shake, no flash, no sway or blur (the legs still slow), a still picture; ?qa: everything instant.
const CSS = `
.ax-vig{position:fixed;inset:0;z-index:40;pointer-events:none;opacity:0;background:radial-gradient(ellipse at 50% 50%,rgba(0,0,0,0) 38%,rgba(40,4,6,.55) 72%,rgba(8,0,0,.92) 100%)}
.ax-pulse{position:fixed;inset:0;z-index:41;pointer-events:none;opacity:0;box-shadow:inset 0 0 22vmin 6vmin rgba(150,10,14,.85)}
.ax-catch{position:fixed;inset:0;z-index:1002;background:#000;overflow:hidden}
.ax-catch-img{position:absolute;inset:-6%;transform-origin:50% 12%;background:#000 50% 6%/cover no-repeat;filter:contrast(1.25) brightness(.85) saturate(.7)}
.ax-catch-flash{position:absolute;inset:0;background:#e8f0f0;opacity:0}
.ax-catch-dark{position:absolute;inset:0;background:linear-gradient(to bottom,rgba(6,12,14,0),rgba(4,8,10,.92));opacity:0}
`;
const quiet = (f) => { try { f(); } catch { /* no sound / no fx */ } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
export const approachConfig = (v) => (v ? { vignette: true, heartbeat: true, shake: true, dizzy: true, slowBy: 0.38, presence: null, catchOn: ['monster'], ...(typeof v === 'object' ? v : {}) } : null);
// the sounds of a presence (ctx.audio tone / noiseBurst; k = 0..1 how near)
const PRESENCE = {
  wet: (a, k, pos) => {
    const g = 0.1 + k * 0.32;
    for (let i = 0; i < 3 + Math.round(k * 4); i++) a.noiseBurst({ at: i * (0.07 + Math.random() * 0.05), dur: 0.07, freq: 170 + Math.random() * 260, q: 8, gain: g * 0.8, type: 'bandpass', wet: 0.55, pos });
    a.tone({ at: 0.25, dur: 1.3 + k, freq: 92 + Math.random() * 14, type: 'sawtooth', gain: 0.012 + k * 0.03, slide: 0.55, vibrato: 7, attack: 0.25, wet: 0.7, pos });
    a.noiseBurst({ at: 0.3, dur: 1.1, freq: 520, q: 2.2, gain: g * 0.35, type: 'bandpass', wet: 0.7, sweep: -0.5, pos });
  },
  breath: (a, k, pos) => {
    a.noiseBurst({ dur: 1.2, freq: 700, q: 1.2, gain: 0.06 + k * 0.2, type: 'bandpass', wet: 0.5, sweep: 0.3, pos });
    a.noiseBurst({ at: 1.3, dur: 1.5, freq: 520, q: 1.2, gain: 0.05 + k * 0.16, type: 'bandpass', wet: 0.5, sweep: -0.3, pos });
  },
};

export function createApproach(ctx, cfg0) {
  const cfg = approachConfig(cfg0 === undefined ? true : cfg0);
  if (!cfg || typeof document === 'undefined') return null;
  if (!document.getElementById('ax-css')) { const s = document.createElement('style'); s.id = 'ax-css'; s.textContent = CSS; document.head.appendChild(s); }
  const still = () => !!(ctx.calm || ctx.qa || (ctx.settings && ctx.settings.calm)) || (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const vig = document.createElement('div'); vig.className = 'ax-vig'; document.body.appendChild(vig);
  const pul = document.createElement('div'); pul.className = 'ax-pulse'; document.body.appendChild(pul);
  const canvas = () => (ctx.renderer && ctx.renderer.domElement) || null;
  let shown = 0, beatT = 0, catching = false, dz = 0, t = 0, ringT = 0, presT = 1.5;
  const A = {
    cfg,
    /** true when this module beats the heart (monster-std then skips its own chase beat) */
    get heartbeat() { return !!cfg.heartbeat; },
    get level() { return shown; },
    /** 0..1 how dizzy (the legs are slowed by slowBy times this) */
    get dizzy() { return dz; },
    update(dt, active) {
      const s = ctx.fxState || {}, calm = still();
      const target = active ? Math.min(1, (s.danger || 0) * (s.chasing ? 1.15 : 0.8)) : 0;
      shown += (target - shown) * Math.min(1, dt * 3);
      if (cfg.vignette) vig.style.opacity = (calm ? shown * 0.6 : shown).toFixed(3);
      if (cfg.heartbeat && active && shown > 0.12 && !ctx.qa) {
        if ((beatT -= dt) <= 0) {
          beatT = 1 / (0.95 + shown * 2.1); const g = 0.12 + shown * 0.4, a = ctx.audio;
          quiet(() => { a.heartbeat ? a.heartbeat(g) : a.tone({ dur: 0.15, freq: 55, gain: g, wet: 0 }); a.tone({ at: 0.18, dur: 0.12, freq: 48, type: 'sine', gain: g * 0.7, wet: 0 }); });
        }
      } else beatT = 0;
      t += dt;
      // the dizziness: the legs slow, the view sways and blurs, the ears ring (eases off with the distance)
      const dTarget = cfg.dizzy && active ? Math.max(0, Math.min(1, (shown - 0.3) / 0.55)) : 0;
      dz += (dTarget - dz) * Math.min(1, dt * (dTarget > dz ? 1.6 : 0.8));
      if (!active) dz = 0;   // a window, a catch, a scene: the legs are back at once
      if (dz < 0.002) dz = 0;
      if (ctx.fp) ctx.fp.slow = 1 - (cfg.slowBy || 0) * dz;
      if (dz > 0.55 && !ctx.qa && (ringT -= dt) <= 0) { ringT = 4 + Math.random() * 2; quiet(() => ctx.audio.tone({ dur: 2.2, freq: 3400 + Math.random() * 500, type: 'sine', gain: 0.006 + dz * 0.01, attack: 0.8, wet: 0.2 })); }
      // its own sound, more often the nearer it is
      const s0 = s.danger || 0, maker = cfg.presence && PRESENCE[cfg.presence];
      if (maker && active && s0 > 0.04 && !ctx.qa && (presT -= dt) <= 0) { presT = 3.6 - s0 * 2.2 + Math.random() * 1.4; quiet(() => maker(ctx.audio, s0, s.pos)); }
      const cv = canvas();
      if (cv) {
        if (cfg.shake && active && shown > 0.55 && !calm) { const k = (shown - 0.55) * 7; cv.style.translate = `${((Math.random() - 0.5) * k).toFixed(1)}px ${((Math.random() - 0.5) * k).toFixed(1)}px`; }
        else if (cv.style.translate) cv.style.translate = '';
        if (dz > 0 && !calm) { cv.style.rotate = `${(Math.sin(t * 1.25) * dz * 1.4).toFixed(2)}deg`; cv.style.scale = (1 + dz * 0.05).toFixed(3); cv.style.filter = `blur(${(dz * 1.4).toFixed(2)}px) saturate(${(1 - dz * 0.35).toFixed(2)})`; }
        else if (dz > 0) { cv.style.filter = `saturate(${(1 - dz * 0.35).toFixed(2)})`; }
        else if (cv.style.rotate || cv.style.filter) { cv.style.rotate = ''; cv.style.scale = ''; cv.style.filter = ''; }
      }
    },
    pulse(k = 1) {
      if (still()) { pul.style.opacity = '0.35'; setTimeout(() => { pul.style.opacity = '0'; }, 900); return; }
      pul.animate([{ opacity: 0 }, { opacity: 0.95 * k, offset: 0.12 }, { opacity: 0.2 }, { opacity: 0.8 * k, offset: 0.62 }, { opacity: 0 }], { duration: 1700, easing: 'ease-out' });
      quiet(() => ctx.fx && ctx.fx.spook && ctx.fx.spook(0.45 * k));
      quiet(() => ctx.audio.noiseBurst({ dur: 0.5, freq: 60, q: 1, gain: 0.7 * k, type: 'lowpass', wet: 0.5 }));
    },
    /** should the catch close-up play for this death reason? */
    catches(reason) { return !!cfg.catchImage && (!cfg.catchOn || cfg.catchOn.includes(reason) || cfg.catchOn.includes('*')); },
    /** the close-up (resolves on dark; the death sequence follows) */
    async catchClose(image = cfg.catchImage) {
      if (catching || !image) return; catching = true;
      try {
        const el = document.createElement('div'); el.className = 'ax-catch';
        el.innerHTML = '<div class="ax-catch-img"></div><div class="ax-catch-dark"></div><div class="ax-catch-flash"></div>';
        const img = el.children[0], dark = el.children[1], flash = el.children[2];
        img.style.backgroundImage = `url('${image}')`; if (cfg.catchFocus) img.style.backgroundPosition = cfg.catchFocus;
        document.body.appendChild(el);
        quiet(() => ctx.fp && ctx.fp.release && ctx.fp.release());
        if (ctx.qa) { await wait(60); el.remove(); return; }
        const a = ctx.audio;
        quiet(() => a.stinger());
        quiet(() => a.noiseBurst({ dur: 1.2, freq: 260, q: 0.7, gain: 0.55, type: 'lowpass', wet: 0.7, sweep: -0.5 }));
        quiet(() => a.tone({ at: 0.05, dur: 1.1, freq: 1900, type: 'sawtooth', gain: 0.03, slide: 0.45, wet: 0.6, vibrato: 18 }));
        if (still()) { img.style.transform = 'scale(1.1)'; await wait(1400); }
        else {
          flash.animate([{ opacity: 0.9 }, { opacity: 0 }], { duration: 260, easing: 'ease-out' });
          img.animate([
            { transform: 'scale(1.0) translate(0,0)', filter: 'contrast(1.25) brightness(.5) saturate(.7)' },
            { transform: 'scale(1.18) translate(-1%,1%)', filter: 'contrast(1.3) brightness(.95) saturate(.7)', offset: 0.18 },
            { transform: 'scale(1.22) translate(1.2%,-.6%)', offset: 0.26 },
            { transform: 'scale(1.27) translate(-.8%,.4%)', offset: 0.34 },
            { transform: 'scale(1.32) translate(.6%,.8%)', offset: 0.5 },
            { transform: 'scale(1.6) translate(0,-2%)', filter: 'contrast(1.4) brightness(.4) saturate(.5) blur(2px)' },
          ], { duration: 1700, easing: 'cubic-bezier(.2,.7,.4,1)', fill: 'forwards' });
          dark.animate([{ opacity: 0 }, { opacity: 0, offset: 0.45 }, { opacity: 1 }], { duration: 1700, fill: 'forwards' });
          await wait(1750);
        }
        el.style.transition = 'opacity .3s'; el.style.opacity = '0'; await wait(320); el.remove();
      } finally { catching = false; }
    },
    get catching() { return catching; },
  };
  return A;
}
