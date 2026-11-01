/* game-kit 6e0b6f0: js/mg-frame.js — edit in game-kit and run tools/kit-sync.js */
// The frame of the library mini games (js/mg-*.js): a top-anchored panel (title, close, help, the stage, a message line) inside the host
// the game gives. Esc and the close button end without penalty. Style: css/kit.css "mini game library" block (.mgx-*, theme tokens).
//   const f = mgFrame(host, { title, help, cfg, ctx }, (ok) => done(ok));
//   f.body / f.say(text) / f.on(type, fn) / f.end(ok)
//   standard 1.8.3 (feedback "もっとバリエーション増やしてアニメーションやユーアイもよくして"):
//   f.win(ms)            the clear: the panel glows, a stamp (cfg.stamp, '完了') presses down, then f.end(true) after ms (at least 0.7 s)
//   f.miss()             a short shake of the stage (no penalty - it only says "not yet")
//   f.progress(n, total) pips in the head (found 2 of 3, step 1 of 4 ...)
//   cfg.skin             the look of the panel: 'paper' (the theme's, default) | 'metal' | 'wood' | 'crt' | 'night' | 'washi'
//   ctx.calm / the OS "reduce motion": no shake, no pop, the stamp just appears
export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
export const SKINS = ['paper', 'metal', 'wood', 'crt', 'night', 'washi'];
export const skinOf = (cfg = {}) => (SKINS.includes(cfg.skin) ? cfg.skin : 'paper');

export function mgFrame(host, { title = '', help = '', cfg = {}, ctx = {} } = {}, done = () => {}) {
  const calm = !!ctx.calm || (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  host.innerHTML = `<div class="mgx mgx--skin-${skinOf(cfg)}${calm ? ' mgx--calm' : ''}" role="dialog" aria-label="${esc(title)}"><div class="mgx-head"><b>${esc(title)}</b><span class="mgx-pips" aria-hidden="true"></span><button type="button" class="btn mgx-close" data-close>閉じる</button></div>${help ? `<p class="mgx-help">${esc(help)}</p>` : ''}<div class="mgx-body"></div><p class="mgx-msg" aria-live="polite"></p></div>`;
  const root = host.querySelector('.mgx'), msg = host.querySelector('.mgx-msg'), body = host.querySelector('.mgx-body'), pips = host.querySelector('.mgx-pips');
  let finished = false, winning = false;
  const offs = [];
  const replay = (el, cls) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };
  const f = {
    body,
    root,
    say: (t) => { if (msg.textContent === (t || '')) return; msg.textContent = t || ''; if (t) replay(msg, 'in'); },
    // a window listener that lives until the game ends
    on: (type, fn) => { addEventListener(type, fn); offs.push(() => removeEventListener(type, fn)); },
    end: (ok) => { if (finished) return; finished = true; offs.forEach((o) => o()); done(!!ok); },
    win: (ms = 650) => {
      if (finished || winning) return; winning = true;
      root.classList.add('mgx--win');
      const st = document.createElement('div');
      st.className = 'mgx-stamp'; st.setAttribute('aria-hidden', 'true');
      st.innerHTML = `<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="20"/><path d="M14 25l7 7 13-15"/></svg><span>${esc(cfg.stamp || '完了')}</span>`;
      body.appendChild(st);
      setTimeout(() => f.end(true), Math.max(ms, calm ? 300 : 700));
    },
    miss: () => { if (!calm && !finished) replay(body, 'mgx-shake'); },
    progress: (n, total) => { pips.innerHTML = Array.from({ length: total }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join(''); },
    get done() { return finished || winning; },
  };
  host.querySelector('[data-close]').onclick = () => { if (!winning) f.end(false); };   // during the clear the answer is already yes
  f.on('keydown', (e) => { if (e.code === 'Escape' && !winning) f.end(false); });
  return f;
}

/** a seeded random 0..1 (the same deal for the same seed: the playtests and the docs rely on it) */
export const rng = (seed = 1) => { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };
