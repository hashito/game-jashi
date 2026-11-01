/* game-kit 6e0b6f0: js/mg-photo-focus.js — edit in game-kit and run tools/kit-sync.js */
// Library mini game "photo-focus" (standard 1.8.3: a camera, a telescope, a spirit photo): turn the focus ring until the picture is sharp and
// zoom until the subject fills the frame, then press the shutter. A wrong shot only shows what was wrong (blurred / too small / too big).
// Focus: drag the ring or ← →; zoom: the − / + buttons or ↑ ↓; the shutter: the button / Space / E.
//   cfg: title, help, image (url; default a drawn torii in the dark with a figure), focus (0.62: the sharp place 0..1), zoom (0.7), tol (0.08),
//        ok (the line), skin, stamp
//   hooks: { sound(name, ctx) }  name = 'ring' | 'zoom' | 'shutter' | 'miss' | 'ok'
import { mgFrame, esc } from './mg-frame.js';

const SCENE = `<svg viewBox="0 0 160 100" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg"><rect width="160" height="100" fill="#1b2026"/><rect y="70" width="160" height="30" fill="#14181c"/>
  <g fill="#7a2a20"><rect x="52" y="30" width="56" height="5"/><rect x="48" y="26" width="64" height="4"/><rect x="60" y="34" width="5" height="40"/><rect x="95" y="34" width="5" height="40"/><rect x="58" y="42" width="44" height="3"/></g>
  <g fill="#d8d4c8" opacity="0.85"><ellipse cx="80" cy="54" rx="4" ry="5"/><path d="M74 60 Q80 57 86 60 L88 78 L72 78 Z"/></g></svg>`;
/** the shot is good when the focus and the zoom are both within tol */
export const photoFocusOk = (s, want, tol = 0.08) => Math.abs(s.focus - want.focus) <= tol && Math.abs(s.zoom - want.zoom) <= tol;
/** what is wrong with a shot (for the line) */
export const shotFault = (s, want, tol = 0.08) => (Math.abs(s.focus - want.focus) > tol ? 'blur' : s.zoom < want.zoom - tol ? 'small' : s.zoom > want.zoom + tol ? 'big' : '');

export default {
  type: 'photo-focus',
  about: 'ピントと構図を合わせて、写るべきものを撮る',
  mount(host, cfg = {}, ctx = {}, hooks = {}) {
    return new Promise((done) => {
      const want = { focus: cfg.focus ?? 0.62, zoom: cfg.zoom ?? 0.7 }, tol = cfg.tol ?? 0.08, snd = (k) => hooks.sound && hooks.sound(k, ctx);
      const s = { focus: 0.15, zoom: 0.3 }; let drag = null;
      const f = mgFrame(host, { cfg, ctx, title: cfg.title || '写真を撮る', help: cfg.help || 'ピント環を回して像をくっきりさせ、ズームで枠いっぱいに入れてから、シャッターを押してください。' }, done);
      f.body.innerHTML = `<div class="mgx-photo"><div class="mgx-photo-view"><div class="mgx-photo-pic">${cfg.image ? `<img src="${esc(cfg.image)}" alt="">` : SCENE}</div><div class="mgx-photo-frame"></div><div class="mgx-photo-flash"></div><span class="mgx-photo-meter"></span></div>
        <div class="mgx-photo-ring" role="slider" tabindex="0" aria-label="ピント環" aria-valuemin="0" aria-valuemax="100"><i></i></div>
        <div class="mgx-row mgx-photo-ctl"><button type="button" class="btn" data-z="-1" aria-label="引く">−</button><button type="button" class="btn primary mgx-photo-shutter">シャッター</button><button type="button" class="btn" data-z="1" aria-label="寄る">＋</button></div></div>`;
      const pic = f.body.querySelector('.mgx-photo-pic'), ring = f.body.querySelector('.mgx-photo-ring'), flash = f.body.querySelector('.mgx-photo-flash'), meter = f.body.querySelector('.mgx-photo-meter');
      const draw = () => {
        const blur = Math.abs(s.focus - want.focus) * 14;
        pic.style.filter = `blur(${blur.toFixed(1)}px)`; pic.style.transform = `scale(${(0.7 + s.zoom * 0.9).toFixed(3)})`;
        ring.style.setProperty('--r', `${(s.focus * 300).toFixed(0)}px`); ring.setAttribute('aria-valuenow', String(Math.round(s.focus * 100)));
        meter.textContent = `${(1 + s.zoom * 4).toFixed(1)}×`;
      };
      const setF = (v) => { s.focus = Math.min(1, Math.max(0, v)); snd('ring'); draw(); };
      const setZ = (v) => { s.zoom = Math.min(1, Math.max(0, Math.round(v * 20) / 20)); snd('zoom'); draw(); };
      ring.addEventListener('pointerdown', (e) => { e.preventDefault(); drag = e.clientX; ring.setPointerCapture && ring.setPointerCapture(e.pointerId); ring.focus(); });
      ring.addEventListener('pointermove', (e) => { if (drag === null) return; setF(s.focus + (e.clientX - drag) / 400); drag = e.clientX; });
      for (const ev of ['pointerup', 'pointercancel']) ring.addEventListener(ev, () => { drag = null; });
      f.body.querySelectorAll('[data-z]').forEach((b) => b.addEventListener('click', () => setZ(s.zoom + +b.dataset.z * 0.05)));
      const shoot = () => {
        if (f.done) return; snd('shutter'); flash.classList.remove('go'); void flash.offsetWidth; flash.classList.add('go');
        if (photoFocusOk(s, want, tol)) { snd('ok'); f.say(cfg.ok || 'くっきり写った。'); f.win(800); return; }
        const why = shotFault(s, want, tol); snd('miss'); f.miss();
        f.say(why === 'blur' ? 'ぼやけてしまった。ピント環をもう少し回して。' : why === 'small' ? '小さくて、何が写っているか分からない。もっと寄って。' : '寄りすぎて、枠からはみ出した。少し引いて。');
      };
      f.body.querySelector('.mgx-photo-shutter').addEventListener('click', shoot);
      f.on('keydown', (e) => {
        if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') { e.preventDefault(); setF(s.focus + (e.code === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 0.01 : 0.03)); }
        if (e.code === 'ArrowUp' || e.code === 'ArrowDown') { e.preventDefault(); setZ(s.zoom + (e.code === 'ArrowUp' ? 0.05 : -0.05)); }
        if ((e.code === 'Space' || e.code === 'KeyE') && !e.repeat && !(e.target.closest && e.target.closest('button'))) { e.preventDefault(); shoot(); }
      });
      draw();
      if (ctx.qa) return f.end(true);
      ring.focus();
    });
  },
};
