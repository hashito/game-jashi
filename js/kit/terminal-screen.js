/* game-kit 6e0b6f0: js/terminal-screen.js — edit in game-kit and run tools/kit-sync.js */
// The "terminal" screen kind of the standard (standard 1.5): a window of the standard window manager with a title bar, the ⓘ (goal + one plain line per choice),
// the screen's lines, a lamp, a list of choices (single press, select -> 確定, or a long press with a progress bar), and the related items / documents (tap for the
// card, Shift+1..9). Driven by data/terminals.json (docs/terminal-screen.md; pure rules in js/terminal-data.js). game-core installs it when game.json data.terminals is set:
//   ctx.openScreen('terminal', 'T_DOOR')            or an interact { kind: 'terminal', id } on a world object / a plan station with "terminal": "T_DOOR"
//   events: terminal:open { id }, terminal:close { id }, terminal:view { terminal, view } (a handler may edit view.lines / view.buttons), terminal:choose { terminal, choice, result }
//   keys: Up / Down move, Enter / Space press (hold it for a long press), the pad's A is Enter; Esc closes (the window manager).
import { esc } from './ui.js';
import { viewItemHtml } from './inventory-ui.js';
import { viewOf, infoHtml, choose, press, confirm, holdProgress, HOLD_DEFAULT } from './terminal-data.js';
import { gfRegister, gfEmit, gfOk, gfFail, gfUnknown } from './gf-test.js';

export const SCREEN = 'terminal';

export function installTerminals(ctx) {
  const data = ctx.data.terminals;
  if (!data) return null;
  const { bus, ext, wm } = ctx;
  const byId = new Map((data.terminals || []).map((t) => [t.id, t]));
  let cur = null;   // { id, sel, lines, lamp, hold: { id, t } }
  const items = ctx.data.items || [], docs = ctx.data.docs || [];
  const state = () => ({ flags: ctx.state.flags, tasks: ctx.state.tasks, items: ctx.state.inv, docs: ctx.state.docsRead, looked: ctx.state.looked || [], lines: cur && cur.lines, lamp: cur && cur.lamp });
  const q = (sel) => (wm.body ? wm.body.querySelector(sel) : null);

  const view = () => { const t = byId.get(cur.id), v = viewOf(t, state()); bus.emit('terminal:view', { terminal: cur.id, view: v }); return v; };
  const draw = () => {
    if (!cur || !q('.tm-term')) return;
    const v = view();
    wm.setTitle(v.title);
    q('.tm-goal').textContent = v.goal ? `目的：${v.goal}` : '';
    q('.tm-lines').textContent = v.lines.join('\n');
    q('.tm-lamp').className = `tm-lamp ${v.lamp || ''}`;
    const photo = q('.tm-photo'); photo.style.backgroundImage = v.photo ? `url(${v.photo})` : ''; photo.hidden = !v.photo;
    const box = q('.tm-choices'); box.innerHTML = '';
    v.buttons.forEach((b) => {
      const el = document.createElement('button');
      el.type = 'button'; el.className = `btn tm-choice${cur.sel === b.id ? ' sel' : ''}${b.hold ? ' hold' : ''}`; el.dataset.id = b.id; el.disabled = b.disabled;
      el.innerHTML = `<span class="tm-lb">${esc(b.label)}</span>${b.hold ? '<span class="tm-bar"><i></i></span><small>長押し</small>' : ''}${b.decision && cur.sel === b.id ? '<small>もう一度で決定</small>' : ''}${b.disabled ? `<small>${esc(b.reason)}</small>` : ''}`;
      if (b.hold) {
        const start = () => { cur.hold = { id: b.id, t: 0, hold: b.hold }; el.classList.add('on'); };
        const stop = () => { if (cur.hold && cur.hold.id === b.id) { cur.hold = null; el.classList.remove('on'); const i = el.querySelector('.tm-bar i'); if (i) i.style.width = '0%'; } };
        el.addEventListener('pointerdown', (e) => { e.preventDefault(); if (!b.disabled) start(); });
        for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(ev, stop);
      } else el.addEventListener('click', () => pressChoice(b.id));
      box.appendChild(el);
    });
    const cf = q('.tm-confirm'); cf.hidden = !cur.sel;
    if (cur.sel) { const c = v.buttons.find((b) => b.id === cur.sel); cf.querySelector('.tm-sel').textContent = c ? `選択中：${c.label}` : ''; cf.querySelector('.tm-sel-info').textContent = c ? c.info : ''; }
    const rel = q('.tm-rel'); rel.innerHTML = v.related.length ? '<small>関連：</small>' : '';
    v.related.forEach((id, i) => {
      const it = items.find((x) => x.id === id), d = docs.find((x) => x.id === id), r = it || d; if (!r) return;
      const b = document.createElement('button'); b.type = 'button'; b.className = 'tm-relbtn'; b.title = i < 9 ? `Shift+${i + 1}` : '';
      b.innerHTML = `<span class="tm-th" style="${r.photo ? `background-image:url(${esc(r.photo)})` : ''}"></span><span>${esc(it ? it.name : d.title)}</span>`;
      b.onclick = () => peek(id);
      rel.appendChild(b);
    });
    wm.setInfo(infoHtml(byId.get(cur.id), esc));
  };
  const peek = (id) => {
    const it = items.find((x) => x.id === id), d = docs.find((x) => x.id === id), r = it || d, box = q('.tm-peek'); if (!r || !box) return;
    box.innerHTML = `<div class="tm-peekcard">${viewItemHtml({ photo: r.photo, title: it ? it.name : d.title, text: it ? it.desc : d.text, feeling: r.feeling, tag: it ? '関連する物' : '関連する資料' })}<button type="button" class="btn tm-peekx">戻る</button></div>`;
    box.hidden = false; box.querySelector('.tm-peekx').onclick = () => { box.hidden = true; };
    bus.emit('item:view', { id });
  };

  function fire(id) {
    const t = byId.get(cur.id), r = choose(t, id, state());
    if (!r.ok) return false;
    const ev = { terminal: cur.id, choice: id, result: { ...r.result }, handled: false };
    bus.emit('terminal:choose', ev);
    const res = ev.result;
    for (const f of res.set || []) ctx.setFlag(f);
    if (res.complete) ctx.completeTask(res.complete);
    cur.lines = res.lines && res.lines.length ? res.lines : cur.lines; cur.lamp = res.lamp || cur.lamp;
    gfEmit('terminal', 'choose', { id: cur.id, choice: id });
    ctx.sound && ctx.sound('beep', true);
    if (res.next) { const to = res.next; open(to); return true; }
    if (res.close) { wm.close(); return true; }
    draw();
    return true;
  }
  function pressChoice(id) {
    const v = view(), b = v.buttons.find((x) => x.id === id);
    if (!b || b.disabled) return false;
    const r = press(cur.sel, { id, decision: b.decision });
    cur.sel = r.sel;
    if (r.fire) return fire(r.fire);
    draw();
    return true;
  }
  function open(id, opts = {}) {
    const t = byId.get(id);
    if (!t) return false;
    cur = { id, sel: null, lines: null, lamp: '', hold: null };
    wm.open(SCREEN, {
      title: t.title || id, size: opts.size || 'm', info: infoHtml(t, esc), infoHtml: true,
      onClose: () => { const was = cur && cur.id; cur = null; bus.emit('terminal:close', { id: was }); gfEmit('terminal', 'close', { id: was }); },
      render: (body) => {
        body.innerHTML = `<div class="tm-term"><div class="tm-head"><span class="tm-photo" hidden></span><span class="tm-lamp"></span></div><p class="tm-goal"></p><pre class="tm-lines"></pre><div class="tm-choices" role="group"></div><div class="tm-confirm" hidden><b class="tm-sel"></b><p class="tm-sel-info"></p><button type="button" class="btn primary tm-ok">決定する</button> <button type="button" class="btn tm-cancel">やめる</button></div><div class="tm-rel"></div><div class="tm-peek" hidden></div></div>`;
        body.querySelector('.tm-ok').onclick = () => { const r = confirm(cur.sel); cur.sel = r.sel; fire(r.fire); };
        body.querySelector('.tm-cancel').onclick = () => { cur.sel = null; draw(); };
        draw();
      },
    });
    bus.emit('terminal:open', { id });
    gfEmit('terminal', 'open', { id });
    return true;
  }
  // long press timers + keys (the window manager owns Esc)
  const keys = (e, down) => {
    if (!cur || wm.current !== SCREEN) return;
    const els = [...document.querySelectorAll('.tm-choice:not([disabled])')];
    if (down && (e.code === 'ArrowDown' || e.code === 'ArrowUp') && els.length) { const i = els.indexOf(document.activeElement); els[(i + (e.code === 'ArrowDown' ? 1 : -1) + els.length) % els.length].focus(); e.preventDefault(); return; }
    const f = document.activeElement && document.activeElement.classList && document.activeElement.classList.contains('tm-choice') ? document.activeElement : null;
    if ((e.code === 'Enter' || e.code === 'Space') && f && f.classList.contains('hold')) { e.preventDefault(); if (down && !cur.hold) { cur.hold = { id: f.dataset.id, t: 0, hold: +(byId.get(cur.id).choices.find((c) => c.id === f.dataset.id) || {}).hold || HOLD_DEFAULT, key: true }; f.classList.add('on'); } if (!down && cur.hold && cur.hold.key) { cur.hold = null; f.classList.remove('on'); const i = f.querySelector('.tm-bar i'); if (i) i.style.width = '0%'; } }
    if (down && e.code.startsWith('Digit') && e.shiftKey) { const n = +e.code.slice(5) - 1, r = q('.tm-rel'); const b = r && r.querySelectorAll('.tm-relbtn')[n]; if (b) b.click(); }
  };
  window.addEventListener('keydown', (e) => keys(e, true), true);
  window.addEventListener('keyup', (e) => keys(e, false), true);
  const tick = (dt) => {
    if (!cur || !cur.hold || wm.current !== SCREEN) return;
    cur.hold.t += dt;
    const p = holdProgress(cur.hold.t, cur.hold.hold), el = q(`.tm-choice[data-id="${cur.hold.id}"] .tm-bar i`);
    if (el) el.style.width = `${Math.round(p * 100)}%`;
    if (p >= 1) { const id = cur.hold.id; cur.hold = null; fire(id); }
  };
  ctx.systems && ctx.systems.push({ id: 'terminal-hold', def: { update: (dt) => tick(dt) }, inst: null });

  ext.registerScreen(SCREEN, { open: (c, id, opts) => open(id, opts), close: () => wm.current === SCREEN && wm.close() });
  ext.registerInteract('terminal', { prompt: (o) => { const t = byId.get(o.id); return t ? `[E] ${t.title}` : ''; }, run: (o) => open(o.id) });
  const api = { byId, open, fire, press: pressChoice, view: () => (cur ? view() : null), tick, get current() { return cur ? cur.id : null; } };
  ctx.terminals = api;
  gfRegister('terminal', () => ({
    snapshot: () => ({ open: !!cur && wm.current === SCREEN, id: cur && cur.id, sel: cur && cur.sel, lamp: cur && cur.lamp, ids: [...byId.keys()], buttons: cur ? view().buttons.map((b) => ({ id: b.id, disabled: b.disabled, hold: b.hold })) : [] }),
    drive(action, a = {}) {
      switch (action) {
        case 'open': return open(a.id) ? gfOk({ id: a.id }) : gfFail(`unknown terminal "${a.id}"`);
        case 'press': if (!cur) return gfFail('no terminal open'); return pressChoice(a.choice) ? gfOk({ sel: cur && cur.sel }) : gfFail(`cannot press "${a.choice}"`);
        case 'confirm': if (!cur || !cur.sel) return gfFail('nothing selected'); return fire(confirm(cur.sel).fire) ? gfOk() : gfFail('refused');
        case 'hold': if (!cur) return gfFail('no terminal open'); { const c = byId.get(cur.id).choices.find((x) => x.id === a.choice); if (!c) return gfFail(`unknown choice "${a.choice}"`); cur.hold = { id: c.id, t: 0, hold: +c.hold || HOLD_DEFAULT }; for (let i = 0; i < 200 && cur && cur.hold; i++) tick(0.05); return gfOk({ open: !!cur }); }
        case 'close': wm.close(); return gfOk();
        default: return gfUnknown(action);
      }
    },
    reset: () => { cur && wm.current === SCREEN && wm.close(); cur = null; },
  }));
  return api;
}
