/* game-kit 40c1bc6: js/mg-tune-radio.js — edit in game-kit and run tools/kit-sync.js */
// Library mini game "tune-radio" (standard 1.8.2: a radio, a walkie-talkie, an old receiver): turn the knob to find the voice under the
// static; the needle shows the band, the noise bars calm down as you get close, and holding it there for `hold` seconds tunes it in.
// Nothing is lost by drifting off. Mouse / touch drag on the knob, or ← → (Shift = fine). Register it with useMinigames() (js/mg-library.js).
//   cfg: title, help, target (0..1 on the band, 0.63), width (0.035: half of the window that counts as tuned), hold (1.2 s),
//        start (where the needle begins), lo / hi (the band labels, '76.0' / '95.0'), unit ('MHz'), ok (the line)
//        target / width / start may also be given on the lo..hi scale (target > 1: e.g. lo 0, hi 100, target 63, width 5)
//   hooks: { sound(name, ctx, v) }  name = 'turn' (v = clarity 0..1) | 'ok'
// Without sound it still reads (feedback 2026-11-02 「同調のつまみを音無でもわかるように」): a signal meter that rises from far off, the noise
// bars settling into a clean wave as the voice comes in, and a caption of what would be heard (ザーッ… -> 声が混じる -> 「…聞こえるか」).
import { mgFrame, esc } from './mg-frame.js';

/** how clear the voice is at x (0..1): 1 on the target, 0 beyond 4 widths */
export const clarity = (x, target = 0.63, width = 0.035) => Math.max(0, 1 - Math.abs(x - target) / (width * 4));
/** tuned when inside the window */
export const tuneRadioOk = (x, target = 0.63, width = 0.035) => Math.abs(x - target) <= width;
/** the signal meter: rises from 12 widths away, so the direction can be found by eye */
export const signal = (x, target = 0.63, width = 0.035) => Math.max(0, 1 - Math.abs(x - target) / (width * 12));
/** cfg on the band scale (target > 1) -> 0..1 */
export function bandCfg(cfg = {}) {
  if (!((cfg.target ?? 0) > 1)) return { target: cfg.target ?? 0.63, width: cfg.width ?? 0.035, start: cfg.start };
  const lo = Number(cfg.lo ?? 0) || 0, hi = Number(cfg.hi ?? 100) || 100, n = (v) => (v - lo) / (hi - lo);
  return { target: n(cfg.target), width: (cfg.width ?? 3.5) / (hi - lo), start: cfg.start == null ? undefined : n(cfg.start) };
}
/** the caption of what is heard at signal s / clarity c */
export const heard = (s, c) => (c > 0.75 ? '「……聞こえるか……」声だ。そのまま止める。' : c > 0.25 ? 'ザ…ザザ…人の声のようなものが混じる。もう少し。' : s > 0.35 ? 'ザザ……雑音が少し弱まった。この辺りだ。' : 'ザーーッ……雑音だけ。');

export default {
  type: 'tune-radio',
  about: 'つまみを回して雑音の奥の声を探し、合ったところで少し止める',
  mount(host, cfg = {}, ctx = {}, hooks = {}) {
    return new Promise((done) => {
      const B = bandCfg(cfg), target = B.target, width = B.width, hold = cfg.hold ?? 1.2, snd = (n, v) => hooks.sound && hooks.sound(n, ctx, v);
      let x = B.start ?? (target > 0.5 ? 0.12 : 0.88), held = 0, raf = 0, last = 0, drag = null, said = '';
      const f = mgFrame(host, { cfg, ctx, title: cfg.title || '周波数を合わせる', help: cfg.help || 'つまみを回して、雑音が静まり声が聞こえるところで止めてください。' }, (ok) => { cancelAnimationFrame(raf); done(ok); });
      f.body.innerHTML = `<div class="mgx-radio">
        <div class="mgx-radio-band"><span>${esc(String(cfg.lo ?? '76.0'))}</span><div class="mgx-radio-scale"><i class="mgx-radio-needle"></i></div><span>${esc(String(cfg.hi ?? '95.0'))} ${esc(cfg.unit ?? 'MHz')}</span></div>
        <p class="mgx-radio-heard" aria-live="polite"></p>
        <div class="mgx-radio-signal"><span>電波</span><div><i></i></div></div>
        <div class="mgx-radio-bars" aria-hidden="true">${'<b></b>'.repeat(16)}</div>
        <div class="mgx-radio-hold" aria-hidden="true"><i></i></div>
        <div class="mgx-radio-knob" role="slider" tabindex="0" aria-label="同調つまみ" aria-valuemin="0" aria-valuemax="100"><i></i></div>
      </div>`;
      const wrap = f.body.querySelector('.mgx-radio'), needle = f.body.querySelector('.mgx-radio-needle'), bars = [...f.body.querySelectorAll('.mgx-radio-bars b')], meter = f.body.querySelector('.mgx-radio-hold i'), knob = f.body.querySelector('.mgx-radio-knob'), sig = f.body.querySelector('.mgx-radio-signal i'), heardEl = f.body.querySelector('.mgx-radio-heard');
      const set = (v) => { x = Math.min(1, Math.max(0, v)); needle.style.left = `${x * 100}%`; knob.style.setProperty('--a', `${x * 540 - 270}deg`); knob.setAttribute('aria-valuenow', String(Math.round(x * 100))); snd('turn', clarity(x, target, width)); };
      const say = (s) => { if (s !== said) { said = s; heardEl.textContent = s; } };   // the caption sits right under the band: on a short phone screen the frame's say line is below the fold
      const tick = (t) => {
        const dt = last ? Math.min(0.05, (t - last) / 1000) : 0; last = t;
        const c = clarity(x, target, width), s = signal(x, target, width), q = Math.max(c, s * 0.6);
        wrap.classList.toggle('near', c > 0.75); wrap.classList.toggle('warm', s > 0.35);
        sig.style.width = `${Math.round(s * 100)}%`;
        bars.forEach((b, i) => { const noise = 20 + 60 * Math.abs(Math.sin(t / 90 + i * 1.7)), wave = 45 + 35 * Math.sin(t / 260 + i * 0.55); b.style.height = `${(1 - q) * noise + q * wave}%`; });   // noise -> a clean wave
        held = tuneRadioOk(x, target, width) ? held + dt : 0;
        meter.style.width = `${Math.min(1, held / hold) * 100}%`;
        say(heard(s, c));
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
