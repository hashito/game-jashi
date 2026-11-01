/* game-kit 6e0b6f0: js/mg-timing.js — edit in game-kit and run tools/kit-sync.js */
// Library mini game "timing" (from ことりばこ: the seal on the knot): a marker swings across; press when it is over the target.
// A miss lets it swing on; nothing is lost. Every `misses` misses the target widens a little (no wall). Mouse, touch, Space / E.
//   cfg: title, help, button ('貼る'), half (0.12: half the target width, 0..1 of the track), speed (0.6 swings / s), misses (3),
//        target (0.5: where on the track), ok / early / late (the lines), look: 'seal' (default) | 'needle' | 'hammer'
//   hooks: { sound(name, ctx) }  name = 'press' | 'ok' | 'miss'
import { mgFrame } from './mg-frame.js';

export const timingOk = (x, target = 0.5, half = 0.12) => Math.abs(x - target) <= half;
/** the marker's place 0..1 at time t (seconds): a smooth back-and-forth */
export const swingAt = (t, speed = 0.6) => 0.5 - 0.5 * Math.cos(t * speed * Math.PI * 2);

export default {
  type: 'timing',
  about: '揺れる印が的の上に来たときに押す（封を貼る・針を落とす・打つ）',
  mount(host, cfg = {}, ctx = {}, hooks = {}) {
    return new Promise((done) => {
      const target = cfg.target ?? 0.5, speed = cfg.speed ?? 0.6, snd = (n) => hooks.sound && hooks.sound(n, ctx);
      let half = cfg.half ?? 0.12, miss = 0, raf = 0, t0 = 0, x = 0, paused = false;
      const f = mgFrame(host, { cfg, ctx, title: cfg.title || '合わせて押す', help: cfg.help || '揺れている印が、的の真上に来たときに押してください。' }, (ok) => { cancelAnimationFrame(raf); done(ok); });
      f.body.innerHTML = `<div class="mgx-timing mgx-timing--${cfg.look || 'seal'}"><div class="mgx-timing-track"><div class="mgx-timing-target"></div><div class="mgx-timing-mark"></div></div><button type="button" class="btn primary mgx-timing-btn">${cfg.button || '貼る'}</button></div>`;
      const tg = f.body.querySelector('.mgx-timing-target'), mk = f.body.querySelector('.mgx-timing-mark'), btn = f.body.querySelector('.mgx-timing-btn');
      const drawTarget = () => { tg.style.left = `${(target - half) * 100}%`; tg.style.width = `${half * 200}%`; };
      const tick = (t) => { if (!t0) t0 = t; if (!paused) { x = swingAt((t - t0) / 1000, speed); mk.style.left = `${x * 100}%`; } raf = requestAnimationFrame(tick); };
      const press = () => {
        if (f.done || paused) return;
        snd('press');
        if (timingOk(x, target, half)) { paused = true; f.say(cfg.ok || 'ぴたりと合った。'); snd('ok'); f.win(650); return; }
        miss++; snd('miss'); f.miss(); f.say(x < target ? cfg.early || '少し早い。もう一度。' : cfg.late || '少し遅い。もう一度。');
        if (miss % (cfg.misses ?? 3) === 0 && half < 0.24) { half += 0.03; drawTarget(); }
      };
      btn.addEventListener('pointerdown', (e) => { e.preventDefault(); press(); });
      f.on('keydown', (e) => { if ((e.code === 'Space' || e.code === 'KeyE') && !e.repeat) { e.preventDefault(); press(); } });
      drawTarget();
      if (ctx.qa) return f.end(true);
      raf = requestAnimationFrame(tick); btn.focus();
    });
  },
};
