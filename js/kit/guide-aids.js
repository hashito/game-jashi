/* game-kit 1279a7c: js/guide-aids.js — edit in game-kit and run tools/kit-sync.js */
// What keeps the player oriented (standard 1.14, docs/writing-style.md §7). A player remembers the gist, not every line (出口はこちらです 2026-11-06), so
// the game marks what matters, says it more than once, and keeps it where it can be read again:
//   **emphasis**   "**赤い札**" in any text of a game is drawn as a marked word: talks, tasks, thoughts, windows all go through one observer
//   wait bar       tasks.json "timer": { "seconds": 90, "label": "水位", "bar": true, "level": { "from": 45, "to": 15, "unit": "cm" }, "doneText": "…" }
//                  shows the reading and the time left at the top of the screen while it runs; it finishes by itself, what comes next stays the player's
//                  ctx.waitExtra = () => ({ label, left, k }) | null: a game's own wait (a cool-down) in the same bar when no task is waiting
//   これまで        a menu tab: stages.json levels[].recap (the story so far) and stages.json "facts": [{ "from": "G03", "text": "…" }] (what to keep in mind).
//                  The recap also opens when a saved game is resumed. levels[].remind is said once as the stage opens.
//   the map        await ctx.mapTip(): the window that says the map exists and how to open it on this device (and opens it if asked);
//                  with it used (or a fact that names 地図), the same line comes back when the player has made no progress for 75 s (twice per task at most)
// Pure parts are exported for test/guide-aids.test.mjs. The style is injected here (tokens only), no kit.css section is needed.
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const EM = /\*\*([^*\n]+)\*\*/g;
export const emHtml = (escaped) => String(escaped ?? '').replace(EM, '<b class="ga-em">$1</b>');
export const emPlain = (s) => String(s ?? '').replace(EM, '$1');
export function waitText(left) {
  const secs = Math.max(0, Math.ceil(left));
  return secs >= 60 ? `あと ${Math.floor(secs / 60)}分${String(secs % 60).padStart(2, '0')}秒` : `あと ${secs}秒`;
}
// "水位 35cm → 15cm まで" or "出力の確認：待っています"
export function waitLabel(timer, k) {
  const L = timer.level;
  return L ? `${timer.label} ${Math.round(L.from + (L.to - L.from) * k)}${L.unit} → ${L.to}${L.unit} まで` : `${timer.label}：待っています`;
}
// the levels reached so far (newest first) and the facts open now
export function recapOf(stages, upTo) {
  const levels = stages.levels || [];
  const index = (id) => levels.findIndex((l) => l.id === id);
  return { past: levels.slice(0, upTo + 1).filter((l) => l.recap).reverse(), facts: (stages.facts || []).filter((f) => index(f.from) <= upTo) };
}
export function mapTipText(touch) {
  const way = touch ? '**画面のメニュー**から「地図」' : '**M キー**（メニューの「地図」からも）';
  return `道に迷ったら、**地図**を開きます。\n開きかた：${way}\n地図の**上が北**です。今の目的地に印が出ます。`;
}

const CSS = `.ga-em{font-weight:700;color:var(--gf-accent)}
#ga-wait{position:fixed;z-index:30;left:50%;top:max(10px,env(safe-area-inset-top));transform:translateX(-50%);width:min(46vw,460px);min-width:300px;padding:8px 12px 10px;border-radius:8px;background:var(--gf-surface);color:var(--gf-text);box-shadow:0 2px 10px rgba(0,0,0,.55);pointer-events:none}
#ga-wait[hidden]{display:none}
.ga-wait-line{display:flex;justify-content:space-between;gap:12px;margin:0 0 6px;font-size:1rem;line-height:1.35}
.ga-wait-left{flex:none;font-variant-numeric:tabular-nums;color:var(--gf-accent)}
.ga-wait-track{height:10px;border-radius:5px;background:var(--gf-surface-2);overflow:hidden}
.ga-wait-track i{display:block;height:100%;width:0;background:var(--gf-accent);transition:width .25s linear}
.ga-recap h3{margin:14px 0 6px;font-size:1.05rem;color:var(--gf-text)}
.ga-recap h3:first-child{margin-top:0}
.ga-recap p,.ga-recap li{margin:0 0 8px;line-height:1.6;color:var(--gf-text)}
.ga-recap ul{margin:0;padding-left:1.2em}
@media (max-width:900px),(max-height:500px){#ga-wait{top:auto;bottom:calc(46vh + 6px);width:min(70vw,420px)}.ga-wait-line{font-size:15px}}`;

function installEm() {
  const fix = (node) => {
    if (!node.nodeValue || !node.nodeValue.includes('**')) return;
    const p = node.parentNode; if (!p || /^(SCRIPT|STYLE|TEXTAREA)$/.test(p.nodeName)) return;
    if (p.namespaceURI && p.namespaceURI.includes('svg')) { node.nodeValue = emPlain(node.nodeValue); return; }   // map labels: no markup in an SVG text
    const t = document.createElement('template'); t.innerHTML = emHtml(esc(node.nodeValue));
    p.replaceChild(t.content, node);
  };
  const walk = (root) => {
    if (root.nodeType === 3) return fix(root);
    if (root.nodeType !== 1 || !root.textContent.includes('**')) return;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), hit = [];
    while (w.nextNode()) if (w.currentNode.nodeValue.includes('**')) hit.push(w.currentNode);
    hit.forEach(fix);
  };
  new MutationObserver((list) => { for (const m of list) { if (m.type === 'characterData') fix(m.target); else m.addedNodes.forEach(walk); } }).observe(document.body, { subtree: true, childList: true, characterData: true });
  walk(document.body);
}

// the これまで tab, or null when the game has no recap data (game-core adds it before the game's own tabs)
export function recapTab(ctx, stages) {
  if (!stages || !((stages.levels || []).some((l) => l.recap) || (stages.facts || []).length)) return null;
  return { id: 'recap', label: 'これまで', icon: 'book', after: 'tasks', render: (host) => {
    const { past, facts } = recapOf(stages, ctx.prog ? ctx.prog.index : 0);
    host.innerHTML = `<div class="ga-recap">${past[0] ? `<h3>いま</h3><p>${esc(past[0].recap)}</p>` : ''}${facts.length ? `<h3>覚えておくこと</h3><ul>${facts.map((f) => `<li>${esc(f.text)}</li>`).join('')}</ul>` : ''}${past.length > 1 ? `<h3>ここまで</h3>${past.slice(1).map((l) => `<p>${esc(l.recap)}</p>`).join('')}` : ''}</div>`;
  } };
}

export function installGuideAids(ctx, { bus, systems, tasks, stages }) {
  if (typeof document === 'undefined') return;
  const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
  installEm();
  const bars = tasks.filter((t) => t.timer && t.timer.bar);
  const levels = (stages && stages.levels) || [];
  let el = null, doneUntil = 0, doneText = '', lostT = 0, lostSaid = 0, tipUsed = ((stages && stages.facts) || []).some((f) => f.text.includes('地図'));
  const say = (text, sec) => ctx.monologue(text, sec ?? Math.min(9, 2.4 + String(text).length * 0.09));
  const bar = () => {
    if (el) return el;
    el = document.createElement('div'); el.id = 'ga-wait'; el.hidden = true; el.setAttribute('role', 'status');
    el.innerHTML = '<p class="ga-wait-line"><span class="ga-wait-label"></span><b class="ga-wait-left"></b></p><div class="ga-wait-track"><i></i></div>';
    document.body.appendChild(el);
    return el;
  };
  const running = () => bars.find((t) => !ctx.state.tasks.includes(t.id) && ctx.levelIndex(t.stage) === (ctx.prog ? ctx.prog.index : 0) && (t.needs || []).every((n) => ctx.state.tasks.includes(n)));
  const draw = () => {
    const extra = ctx.waitExtra ? ctx.waitExtra() : null;
    if (!el && !bars.length && !extra) return;
    const b = bar();
    if (!ctx.active()) { b.hidden = true; return; }   // a talk, a window, a mini game, the pause: the bar waits with the clock
    const lab = b.querySelector('.ga-wait-label'), left = b.querySelector('.ga-wait-left'), fill = b.querySelector('i'), t = running();
    if (t) { const v = ctx.timer(t.id); lab.textContent = waitLabel(t.timer, v.k); left.textContent = waitText(v.left); fill.style.width = `${v.k * 100}%`; b.hidden = false; }
    else if (performance.now() < doneUntil) { lab.textContent = doneText; left.textContent = ''; fill.style.width = '100%'; b.hidden = false; }
    else if (extra) { lab.textContent = extra.label; left.textContent = waitText(extra.left); fill.style.width = `${extra.k * 100}%`; b.hidden = false; }
    else b.hidden = true;
  };
  const lost = (dt) => {
    const fx = ctx.fxState || {};
    if (!tipUsed || ctx.wm.isOpen || ctx.ui.open || fx.chasing || (fx.danger || 0) > 0.2) return;
    lostT += dt;
    if (lostT > 75 && lostSaid < 2) { lostT = 0; lostSaid++; say(`道が分からなければ、**地図**を開く。${ctx.isTouch ? '画面のメニューから。' : 'M キーで。'}`, 5); }
  };
  systems.push({ id: 'guide-aids', def: { update: (dt, c, active) => { draw(); if (active) lost(dt); } }, inst: null });

  ctx.mapTip = async () => {
    tipUsed = true;
    const v = await ctx.choose({ who: '操作の案内', title: '迷ったら、地図', text: mapTipText(ctx.isTouch), options: [{ id: 'map', label: '地図を開いてみる', primary: true }, { id: 'go', label: '歩き出す' }] });
    if (v === 'map' && !ctx.qa) setTimeout(() => dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyM' })), 60);
  };
  bus.on('task:done', ({ id } = {}) => {
    lostT = 0; lostSaid = 0;
    const t = bars.find((x) => x.id === id);
    if (t && t.timer.doneText) { doneText = t.timer.doneText; doneUntil = performance.now() + 9000; }
  });
  bus.on('stage:up', ({ level } = {}) => {
    lostT = 0; lostSaid = 0;
    const l = levels.find((x) => x.id === level);
    if (l && l.remind) setTimeout(() => say(l.remind, 6), ctx.qa ? 0 : 1500);
  });
  bus.on('game:start', async ({ resume } = {}) => {
    if (!resume || ctx.qa) return;
    const l = levels[ctx.prog ? ctx.prog.index : 0];
    if (l && l.recap) await ctx.choose({ who: 'これまで', title: '前回のつづき', text: `${l.recap}\n\n読み返すときは、メニューの「これまで」。`, options: [{ id: 'go', label: 'つづける', primary: true }] });
  });
}
