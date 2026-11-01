/* game-kit 6e0b6f0: js/mg-tune-radio.js — edit in game-kit and run tools/kit-sync.js */
// Library mini game "tune-radio" (standard 1.8.2: a radio, a walkie-talkie, an old receiver): turn the knob to find the voice under the
// static; the needle shows the band, the noise bars calm down as you get close, and holding it there for `hold` seconds tunes it in.
// Nothing is lost by drifting off. Mouse / touch drag on the knob, or ← → (Shift = fine). Register it with useMinigames() (js/mg-library.js).
//   cfg: title, help, target (0..1 on the band, 0.63), width (0.035: half of the window that counts as tuned), hold (1.2 s),
//        start (where the needle begins), lo / hi (the band labels, '76.0' / '95.0'), unit ('MHz'), ok (the line)
//   hooks: { sound(name, ctx, v) }  name = 'turn' (v = clarity 0..1) | 'ok'
import { mgFrame, esc } from './mg-frame.js';

/** how clear the voice is at x (0..1): 1 on the target, 0 beyond 4 widths */
export const clarity = (x, target = 0.63, width = 0.035) => Math.max(0, 1 - Math.abs(x - target) / (width * 4));
/** tuned when inside the window */
export const tuneRadioOk = (x, target = 0.63, width = 0.035) => Math.abs(x - target) <= width;

export default {
  type: 'tune-radio',
  about: 'つまみを回して雑音の奥の声を探し、合ったところで少し止める',
  mount(host, cfg = {}, ctx = {}, hooks = {}) {
    return new Promise((done) => {
      const target = cfg.target ?? 0.63, width = cfg.width ?? 0.035, hold = cfg.hold ?? 1.2, snd = (n, v) => hooks.sound && hooks.sound(n, ctx, v);
      let x = cfg.start ?? (target > 0.5 ? 0.12 : 0.88), held = 0, raf = 0, last = 0, drag = null, said = '';
      const f = mgFrame(host, { cfg, ctx, title: cfg.title || '周波数を合わせる', help: cfg.help || 'つまみを回して、雑音が静まり声が聞こえるところで止めてください。' }, (ok) => { cancelAnimationFrame(raf); done(ok); });
      f.body.innerHTML = `<div class="mgx-radio">
        <div class="mgx-radio-band"><span>${esc(cfg.lo || '76.0')}</span><div class="mgx-radio-scale"><i class="mgx-radio-needle"></i></div><span>${esc(cfg.hi || '95.0')} ${esc(cfg.unit || 'MHz')}</span></div>
        <div class="mgx-radio-bars" aria-hidden="true">${'<b></b>'.repeat(16)}</div>
        <div class="mgx-radio-hold" aria-hidden="true"><i></i></div>
        <div class="mgx-radio-knob" role="slider" tabindex="0" aria-label="同調つまみ" aria-valuemin="0" aria-valuemax="100"><i></i></div>
      </div>`;
      const wrap = f.body.querySelector('.mgx-radio'), needle = f.body.querySelector('.mgx-radio-needle'), bars = [...f.body.querySelectorAll('.mgx-radio-bars b')], meter = f.body.querySelector('.mgx-radio-hold i'), knob = f.body.querySelector('.mgx-radio-knob');
      const set = (v) => { x = Math.min(1, Math.max(0, v)); needle.style.left = `${x * 100}%`; knob.style.setProperty('--a', `${x * 540 - 270}deg`); knob.setAttribute('aria-valuenow', String(Math.round(x * 100))); snd('turn', clarity(x, target, width)); };
      const say = (s) => { if (s !== said) { said = s; f.say(s); } };
      const tick = (t) => {
        const dt = last ? Math.min(0.05, (t - last) / 1000) : 0; last = t;
        const c = clarity(x, target, width);
        wrap.classList.toggle('near', c > 0.75);
        bars.forEach((b, i) => { b.style.height = `${10 + (1 - c) * (20 + 60 * Math.abs(Math.sin(t / 90 + i * 1.7)))}%`; });
        held = tuneRadioOk(x, target, width) ? held + dt : 0;
        meter.style.width = `${Math.min(1, held / hold) * 100}%`;
        say(c > 0.75 ? '声が聞こえる。そのまま…' : c > 0.25 ? '雑音の奥に、何か聞こえる。' : '');
        if (held >= hold) { f.say(cfg.ok || '声がはっきり聞こえた。'); snd('ok'); f.win(600); return; }
        raf = requestAnimationFrame(tick);
      };
      // drag around the knob: the change of angle turns it (one full turn = 2/3 of the band)
      const ang = (e) => { const r = knob.getBoundingClientRect(); return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)); };
      knob.addEventListener('pointerdown', (e) => { e.preventDefault(); knob.setPointerCapture && knob.setPointerCapture(e.pointerId); drag = { a: ang(e) }; knob.focus(); });
      knob.addEventListener('pointermove', (e) => { if (!drag) return; const a = ang(e); let d = a - drag.a; if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; drag.a = a; set(x + d / (Math.PI * 3)); });
      const up = () => { drag = null; };
      knob.addEventListener('pointerup', up); knob.addEventListener('pointercancel', up);
      f.on('keydown', (e) => { if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') { e.preventDefault(); set(x + (e.code === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 0.004 : 0.015)); } });
      set(x);
      if (ctx.qa) return f.end(true);
      knob.focus(); raf = requestAnimationFrame(tick);
    });
  },
};
