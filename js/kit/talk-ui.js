/* game-kit 1b8c7db: js/talk-ui.js — edit in game-kit and run tools/kit-sync.js */
// The 3D conversation window (standard 1.7): who speaks, where, an optional picture, the line, and 次へ (tap / click / Enter; S11:
// the player sends each line). A choice is the same window with buttons. Both open in the ONE window of win-manager (U12), so the game
// pauses and the pointer is free while they are open; the protagonist's thoughts stay in the thought band (ctx.monologue).
//   await ctx.talk([{ who: '祖父', where: '玄関', img: 'assets/photos/x.webp', text: '…' }, { who: '私', text: '…' }], { title: '居間', last: '閉じる' });
//   const v = await ctx.choose({ who: '戸の外', text: '…', options: [{ id: 'open', label: '開ける' }, { id: 'keep', label: '開けない', primary: true }] });
//   a line may carry a voice: { who, text, voice: 'assets/voice/x.mp3', vfx: 'wall' | null } -> played when the line shows, stopped on the next line / close
//   portraits: { '祖父': 'assets/photos/ph-grandpa.webp', ... } (game.json "portraits", or createTalk / talk option): the speaker's face beside
//   EVERY line they say (a line's own img is the scene picture above it); the me-speaker has none. A window with faces or pictures keeps one size.
//   a line may carry a body effect: { who, text, fx: 'dizzy' | { dizzy: [3, 1.5] } } (js/body-fx.js)
//   ctx.talk('opening')   // a key of data/talk.json (game.json "data": { "talk": "data/talk.json" }) holding an array of lines
// ?qa (tests): nothing opens, talk resolves true and choose resolves with window.__gfChoice or the primary option; ctx.talkLog lists what was shown.
// Style: css/kit.css .gf-talk (tokens). The me-speaker (default '私') is drawn quieter.
// Steady pictures (1.11.1, from 五人分の朝: 「トップ画像が読み込み中の時に吹き出しが上下します」): every picture of a talk is loaded when it
// opens, the picture box has its size before the picture arrives (css aspect-ratio), and a line without a picture keeps the last one
// shown, so the words never jump up and down from line to line.
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const seen = new Set();
/** start loading pictures now (the browser keeps them; the window shows them at once later) */
export function preload(urls) {
  if (typeof Image === 'undefined') return;
  for (const u of urls) if (u && !seen.has(u)) { seen.add(u); const im = new Image(); im.decoding = 'async'; im.src = u; }
}

export function createTalk({ wm, qa = false, me = '私', data = null, log = [], voice = null, portraits = null, said = null, fx = null } = {}) {
  const linesOf = (x) => (typeof x === 'string' ? (data && data[x]) || [] : x || []);
  function talk(src, o = {}) {
    const lines = linesOf(src);
    log.push({ type: 'talk', title: o.title || (typeof src === 'string' ? src : ''), n: lines.length });
    if (qa || !lines.length || !wm) return Promise.resolve(true);
    const faces = { ...(portraits || {}), ...(o.portraits || {}) }, face = (who) => (who && who !== me && faces[who]) || '';
    preload(lines.map((l) => l.img).concat(lines.map((l) => face(l.who))));
    const firstImg = (lines.find((l) => l.img) || {}).img || '';
    const picOf = (k) => { for (let j = k; j >= 0; j--) if (lines[j].img) return lines[j].img; return firstImg; };
    return new Promise((resolve) => {
      let i = 0, spoken = null;
      const hush = () => { try { spoken && spoken.stop && spoken.stop(); } catch (e) {} spoken = null; };
      const render = (el) => {
        const L = lines[i], last = i === lines.length - 1;
        hush(); if (L.voice && voice) spoken = voice(L); if (said) said(L); if (L.fx && fx) fx(L.fx);   // said: every line read goes to the game's 言葉の記録
        const f = face(L.who), words = `<p class="gf-talk-who">${esc(L.who || '')}${L.where ? `<span>（${esc(L.where)}）</span>` : ''}</p><p class="gf-talk-text">${esc(L.text).replace(/\n/g, '<br>')}</p>`;
        el.innerHTML = `<div class="gf-talk${L.who === me ? ' gf-talk--me' : ''}">${picOf(i) ? `<img class="gf-talk-img${L.img ? '' : ' gf-talk-img--kept'}" src="${esc(picOf(i))}" alt="">` : ''}${f ? `<div class="gf-talk-row"><img class="gf-talk-face" src="${esc(f)}" alt="${esc(L.who)}"><div class="gf-talk-words">${words}</div></div>` : words}<div class="gf-talk-foot"><span class="gf-talk-n">${i + 1} / ${lines.length}</span><button type="button" class="btn primary gf-talk-next">${last ? esc(o.last || '閉じる') : '次へ'}</button></div></div>`;
        const b = el.querySelector('.gf-talk-next');
        b.onclick = () => { if (last) wm.close(); else { i++; render(el); } };
        el.querySelector('.gf-talk-text').onclick = () => b.click();
        setTimeout(() => b.focus(), 30);
      };
      const pics = lines.some((l) => l.img || face(l.who));   // a window with pictures keeps one size from line to line (no text-only fit)
      wm.open('talk', { title: o.title || '会話', size: lines.some((l) => l.img) ? 'm' : 's', ...(pics ? { fit: false } : {}), locked: true, render, onClose: () => { hush(); resolve(true); } });
    });
  }
  function choose(c) {
    const options = c.options || [];
    const fallback = (options.find((x) => x.primary) || options[options.length - 1] || {}).id ?? null;
    log.push({ type: 'choose', who: c.who || '', options: options.map((x) => x.id) });
    if (qa || !wm) return Promise.resolve((typeof window !== 'undefined' && window.__gfChoice) || fallback);
    preload([c.img]);
    return new Promise((resolve) => {
      let picked = null;
      wm.open('choice', { title: c.title || c.who || '選ぶ', size: 's', locked: true, render: (el) => {
        el.innerHTML = `<div class="gf-talk">${c.img ? `<img class="gf-talk-img" src="${esc(c.img)}" alt="">` : ''}${c.who && c.title ? `<p class="gf-talk-who">${esc(c.who)}</p>` : ''}<p class="gf-talk-text">${esc(c.text).replace(/\n/g, '<br>')}</p><div class="gf-talk-choices">${options.map((x) => `<button type="button" class="btn${x.primary ? ' primary' : ''} gf-talk-choice" data-id="${esc(x.id)}">${esc(x.label)}</button>`).join('')}</div></div>`;
        el.querySelectorAll('.gf-talk-choice').forEach((b) => { b.onclick = () => { picked = b.dataset.id; wm.close(); }; });
        setTimeout(() => { const p = el.querySelector('.gf-talk-choice.primary') || el.querySelector('.gf-talk-choice'); p && p.focus(); }, 30);
      }, onClose: () => resolve(picked) });
    });
  }
  return { talk, choose, log };
}
