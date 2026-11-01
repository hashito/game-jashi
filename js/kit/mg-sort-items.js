/* game-kit 6e0b6f0: js/mg-sort-items.js — edit in game-kit and run tools/kit-sync.js */
// Library mini game "sort-items" (standard 1.8.2: sorting mail, putting things back on the shelf, offerings to their altars): drag each item
// to the place it belongs (or tap the item, then tap the place; with keys Tab / Enter the same way). A wrong place sends it back with a short
// reason; nothing is lost.
//   cfg: title, help, bins ([{ id, label }]), items ([{ id, label, bin, why }]: why = the line when put in a wrong place), ok
//   hooks: { sound(name, ctx) }  name = 'pick' | 'put' | 'wrong' | 'ok'
import { mgFrame, esc } from './mg-frame.js';

const DEF = {
  bins: [{ id: 'keep', label: '残す' }, { id: 'burn', label: 'お焚き上げ' }, { id: 'return', label: '持ち主へ返す' }],
  items: [{ id: 'a', label: '古いお守り', bin: 'burn' }, { id: 'b', label: '名前入りの手袋', bin: 'return' }, { id: 'c', label: '社務所の台帳', bin: 'keep' }, { id: 'd', label: '割れた絵馬', bin: 'burn' }],
};
/** does item belong in bin */
export const sortItemsOk = (item, binId) => item.bin === binId;
export const allSorted = (items, placed) => items.every((it) => placed[it.id] === it.bin);

export default {
  type: 'sort-items',
  about: '物を、正しい置き場へ運んで仕分ける',
  mount(host, cfg = {}, ctx = {}, hooks = {}) {
    return new Promise((done) => {
      const bins = cfg.bins || DEF.bins, items = cfg.items || DEF.items, snd = (k) => hooks.sound && hooks.sound(k, ctx);
      const placed = {}; let picked = null, drag = null;
      const f = mgFrame(host, { cfg, ctx, title: cfg.title || '仕分ける', help: cfg.help || '物を置き場へドラッグしてください（物を押してから置き場を押しても動かせます）。' }, (ok) => { if (drag && drag.ghost) drag.ghost.remove(); done(ok); });
      f.body.innerHTML = `<div class="mgx-sort"><div class="mgx-sort-tray" aria-label="まだ仕分けていない物"></div><div class="mgx-sort-bins">${bins.map((b) => `<button type="button" class="mgx-sort-bin" data-bin="${esc(b.id)}"><b>${esc(b.label)}</b><span class="mgx-sort-in"></span></button>`).join('')}</div></div>`;
      const tray = f.body.querySelector('.mgx-sort-tray');
      const draw = () => {
        tray.innerHTML = items.filter((it) => !placed[it.id]).map((it) => `<button type="button" class="mgx-sort-item${picked === it.id ? ' picked' : ''}" data-item="${esc(it.id)}" aria-pressed="${picked === it.id}">${esc(it.label)}</button>`).join('') || '<span class="mgx-sort-empty">すべて仕分けた</span>';
        f.progress(Object.keys(placed).length, items.length);
        for (const b of f.body.querySelectorAll('.mgx-sort-bin')) b.querySelector('.mgx-sort-in').textContent = items.filter((it) => placed[it.id] === b.dataset.bin).map((it) => it.label).join('・');
      };
      const put = (id, binId) => {
        const it = items.find((x) => x.id === id); if (!it || f.done) return;
        picked = null;
        if (!sortItemsOk(it, binId)) { snd('wrong'); f.miss(); f.say(it.why || `「${it.label}」は、そこではない。`); draw(); return; }
        placed[id] = binId; snd('put'); f.say(''); draw();
        const got = f.body.querySelector(`.mgx-sort-bin[data-bin="${binId}"]`); if (got) { got.classList.remove('got'); void got.offsetWidth; got.classList.add('got'); }
        if (allSorted(items, placed)) { snd('ok'); f.say(cfg.ok || 'すべて正しく仕分けた。'); f.win(700); return; }
        const next = tray.querySelector('button'); next && next.focus();
      };
      tray.addEventListener('click', (e) => {
        const b = e.target.closest('[data-item]'); if (!b) return;
        picked = picked === b.dataset.item ? null : b.dataset.item; snd('pick'); draw();
        const p = tray.querySelector('.picked'); p && p.focus(); f.say(picked ? '置き場を押してください。' : '');
      });
      f.body.querySelector('.mgx-sort-bins').addEventListener('click', (e) => { const b = e.target.closest('[data-bin]'); if (b && picked) put(picked, b.dataset.bin); });
      // drag: a ghost follows the pointer; dropping over a place puts the item there (a short press stays a tap)
      tray.addEventListener('pointerdown', (e) => { const b = e.target.closest('[data-item]'); if (b && !(e.pointerType === 'mouse' && e.button)) drag = { id: b.dataset.item, x: e.clientX, y: e.clientY, ghost: null, el: b }; });
      f.on('pointermove', (e) => {
        if (!drag) return;
        if (!drag.ghost && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 8) { drag.ghost = drag.el.cloneNode(true); drag.ghost.classList.add('mgx-sort-ghost'); document.body.appendChild(drag.ghost); }
        if (drag.ghost) {
          e.preventDefault(); drag.ghost.style.left = `${e.clientX}px`; drag.ghost.style.top = `${e.clientY}px`;
          const over = document.elementFromPoint(e.clientX, e.clientY), bin = over && over.closest && over.closest('[data-bin]');
          f.body.querySelectorAll('.mgx-sort-bin.hot').forEach((x) => x !== bin && x.classList.remove('hot')); if (bin) bin.classList.add('hot');
        }
      });
      f.on('pointerup', (e) => {
        if (!drag) return; const d = drag; drag = null;
        if (!d.ghost) return; d.ghost.remove(); f.body.querySelectorAll('.mgx-sort-bin.hot').forEach((x) => x.classList.remove('hot'));
        const over = document.elementFromPoint(e.clientX, e.clientY), bin = over && over.closest && over.closest('[data-bin]');
        if (bin) put(d.id, bin.dataset.bin);
      });
      draw();
      if (ctx.qa) return f.end(true);
      const first = tray.querySelector('button'); first && first.focus();
    });
  },
};
