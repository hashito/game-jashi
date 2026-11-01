/* game-kit 6e0b6f0: js/mg-steady-hand.js — edit in game-kit and run tools/kit-sync.js */
// Library mini game "steady-hand" (standard 1.8.4: keep a candle's flame in the draught, hold a dowsing pendulum over the spot, keep the
// lens on a moving figure): a ring drifts slowly; keep your pointer (the mouse, a finger, or the marker moved with the arrow keys) inside it.
// The meter fills while inside and only drains slowly outside, so a slip never sends you back to the start.
//   cfg: title, help, sec (4: seconds inside needed), r (0.16: the ring's radius, part of the height), speed (1), look: 'flame' | 'lens', ok,
//        skin, stamp
//   hooks: { sound(name, ctx, v) }  name = 'hum' (v = 0..1 the meter) | 'slip' | 'ok'
import { mgFrame } from './mg-frame.js';

/** where the ring is at time t (0..1 in the box): a slow figure-of-eight */
export const ringAt = (t, speed = 1) => ({ x: 0.5 + 0.32 * Math.sin(t * 0.55 * speed), y: 0.5 + 0.28 * Math.sin(t * 1.1 * speed + 0.6) });
export const inside = (p, c, r = 0.16, aspect = 1.6) => Math.hypot((p.x - c.x) * aspect, p.y - c.y) <= r;
/** the meter: fills inside, drains at a third of the speed outside */
export const meterStep = (m, isIn, dt, sec = 4) => Math.max(0, Math.min(1, m + (isIn ? dt / sec : -dt / (sec * 3))));
export const steadyHandOk = (m) => m >= 1;

export default {
  type: 'steady-hand',
  about: 'ゆっくり動く輪の中に、指先（印）を保ち続ける',
  mount(host, cfg = {}, ctx = {}, hooks = {}) {
    return new Promise((done) => {
      const sec = cfg.sec ?? 4, r = cfg.r ?? 0.16, speed = cfg.speed ?? 1, snd = (k, v) => hooks.sound && hooks.sound(k, ctx, v);
      const p = { x: 0.5, y: 0.5 }; let m = 0, raf = 0, last = 0, t = 0, wasIn = false;
      const f = mgFrame(host, { cfg, ctx, title: cfg.title || '手を保つ', help: cfg.help || 'ゆっくり動く輪の中に、指先（矢印キーなら印）を入れたままにしてください。外れても、少し減るだけです。' }, (ok) => { cancelAnimationFrame(raf); done(ok); });
      f.body.innerHTML = `<div class="mgx-steady mgx-steady--${cfg.look || 'flame'}"><div class="mgx-steady-box" tabindex="0" role="application" aria-label="輪を追う。矢印キーで印を動かす"><i class="mgx-steady-ring"></i><i class="mgx-steady-dot"></i></div><div class="mgx-radio-hold"><i></i></div></div>`;
      const box = f.body.querySelector('.mgx-steady-box'), ring = f.body.querySelector('.mgx-steady-ring'), dot = f.body.querySelector('.mgx-steady-dot'), meter = f.body.querySelector('.mgx-radio-hold i');
      const aspect = () => (box.clientHeight ? box.clientWidth / box.clientHeight : 1.6);
      ring.style.height = `${r * 200}%`;   // square by aspect-ratio (css)
      const keys = new Set();
      const tick = (now) => {
        const dt = last ? Math.min(0.05, (now - last) / 1000) : 0; last = now; t += dt;
        for (const k of keys) { const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[k]; if (d) { p.x = Math.min(1, Math.max(0, p.x + d[0] * dt * 0.35)); p.y = Math.min(1, Math.max(0, p.y + d[1] * dt * 0.55)); } }
        const c = ringAt(t, speed), isIn = inside(p, c, r, aspect());
        m = meterStep(m, isIn, dt, sec);
        ring.style.left = `${c.x * 100}%`; ring.style.top = `${c.y * 100}%`; ring.classList.toggle('in', isIn);
        dot.style.left = `${p.x * 100}%`; dot.style.top = `${p.y * 100}%`; meter.style.width = `${m * 100}%`;
        if (wasIn && !isIn) { snd('slip'); f.say('外れた。輪の中へ戻して。'); } if (isIn && !wasIn) f.say('そのまま…'); wasIn = isIn;
        snd('hum', m);
        if (steadyHandOk(m)) { snd('ok'); f.say(cfg.ok || '最後まで保てた。'); f.win(700); return; }
        raf = requestAnimationFrame(tick);
      };
      const at = (e) => { const b = box.getBoundingClientRect(); p.x = Math.min(1, Math.max(0, (e.clientX - b.left) / b.width)); p.y = Math.min(1, Math.max(0, (e.clientY - b.top) / b.height)); };
      box.addEventListener('pointermove', at); box.addEventListener('pointerdown', (e) => { e.preventDefault(); at(e); box.setPointerCapture && box.setPointerCapture(e.pointerId); });
      f.on('keydown', (e) => { if (e.code.startsWith('Arrow')) { e.preventDefault(); keys.add(e.code); } });
      f.on('keyup', (e) => keys.delete(e.code));
      if (ctx.qa) return f.end(true);
      box.focus(); raf = requestAnimationFrame(tick);
    });
  },
};
