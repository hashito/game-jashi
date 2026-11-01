/* game-kit 6e0b6f0: js/mg-pump-gauge.js — edit in game-kit and run tools/kit-sync.js */
// Library mini game "pump-gauge" (standard 1.8.4: a well's hand pump, a bellows at a forge, the pressure of an old boiler): each pump raises
// the needle and it leaks back down; keep it in the green band until the meter is full. Too much opens the valve (it hisses and drops) - no
// other penalty. Tap the pump / Space / E.
//   cfg: title, help, lo (0.55), hi (0.78), per (0.09: one pump), leak (0.14 per second), sec (3: seconds in the band), look: 'pump' | 'bellows',
//        ok, skin, stamp
//   hooks: { sound(name, ctx) }  name = 'pump' | 'hiss' | 'ok'
import { mgFrame } from './mg-frame.js';

export const inBand = (v, lo = 0.55, hi = 0.78) => v >= lo && v <= hi;
/** one step of the pressure: leaks, and the valve lets go above 0.97 */
export const pressureStep = (v, dt, leak = 0.14) => { const n = Math.max(0, v - leak * dt); return n > 0.97 ? { v: 0.4, vented: true } : { v: n, vented: false }; };
export const pumpGaugeOk = (held, sec = 3) => held >= sec;

export default {
  type: 'pump-gauge',
  about: '押して圧を上げ、針を緑の帯に保ち続ける',
  mount(host, cfg = {}, ctx = {}, hooks = {}) {
    return new Promise((done) => {
      const lo = cfg.lo ?? 0.55, hi = cfg.hi ?? 0.78, per = cfg.per ?? 0.09, leak = cfg.leak ?? 0.14, sec = cfg.sec ?? 3, snd = (k) => hooks.sound && hooks.sound(k, ctx);
      let v = 0.1, held = 0, raf = 0, last = 0;
      const f = mgFrame(host, { cfg, ctx, title: cfg.title || '圧を保つ', help: cfg.help || '押すたびに針が上がり、少しずつ下がります。針を緑の帯に保って、下の目盛りを満たしてください。' }, (ok) => { cancelAnimationFrame(raf); done(ok); });
      const arc = (a, b) => { const p = (t) => { const ang = Math.PI * (1 - t); return [100 + 80 * Math.cos(ang), 100 - 80 * Math.sin(ang)]; }; const [x1, y1] = p(a), [x2, y2] = p(b); return `M${x1.toFixed(1)} ${y1.toFixed(1)} A80 80 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`; };
      f.body.innerHTML = `<div class="mgx-pump mgx-pump--${cfg.look || 'pump'}"><svg viewBox="0 0 200 116" class="mgx-pump-dial" aria-hidden="true"><path d="${arc(0, 1)}" class="track"/><path d="${arc(lo, hi)}" class="band"/><path d="${arc(0.97, 1)}" class="danger"/><line x1="100" y1="100" x2="100" y2="28" class="needle"/><circle cx="100" cy="100" r="7" class="hub"/></svg>
        <div class="mgx-radio-hold"><i></i></div><button type="button" class="btn primary mgx-pump-btn">${cfg.look === 'bellows' ? '踏む' : '押す'}</button></div>`;
      const needle = f.body.querySelector('.needle'), meter = f.body.querySelector('.mgx-radio-hold i'), btn = f.body.querySelector('.mgx-pump-btn'), dial = f.body.querySelector('.mgx-pump-dial');
      const tick = (t) => {
        const dt = last ? Math.min(0.05, (t - last) / 1000) : 0; last = t;
        const s = pressureStep(v, dt, leak); v = s.v;
        if (s.vented) { snd('hiss'); f.miss(); f.say('上げすぎた。弁が開いて、圧が抜けた。'); }
        held = inBand(v, lo, hi) ? held + dt : Math.max(0, held - dt * 0.3);
        needle.style.transform = `rotate(${(v - 0.5) * 180}deg)`; dial.classList.toggle('good', inBand(v, lo, hi)); meter.style.width = `${Math.min(1, held / sec) * 100}%`;
        if (pumpGaugeOk(held, sec)) { snd('ok'); f.say(cfg.ok || '圧が安定した。'); f.win(700); return; }
        raf = requestAnimationFrame(tick);
      };
      const pump = () => { if (f.done) return; v = Math.min(1.2, v + per); snd('pump'); btn.classList.remove('push'); void btn.offsetWidth; btn.classList.add('push'); };
      btn.addEventListener('pointerdown', (e) => { e.preventDefault(); pump(); });
      f.on('keydown', (e) => { if ((e.code === 'Space' || e.code === 'KeyE') && !e.repeat) { e.preventDefault(); pump(); } });
      if (ctx.qa) return f.end(true);
      btn.focus(); raf = requestAnimationFrame(tick);
    });
  },
};
