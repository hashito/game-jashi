/* game-kit c5819b2: js/ui.js — edit in game-kit and run tools/kit-sync.js */
// Windows and short messages over a first-person game (style: css/kit.css). From ひだまり薬局 js/ui.js.
// One window at a time; while one is open the controller should not move (pass `isBlocked: () => !!ui.open`).
//
//   const ui = new KitUI({ onOpen: () => fp.release(), onClose: () => fp.lock() });
//   const w = ui.window('task', 'タイトル', 'サブ', { wide: true, locked: false, app: appBar(...) });
//   w.body.innerHTML = '...'; ui.buttons(w.foot, [{ t: 'OK', cls: 'primary', fn: () => ui.close() }]);
//   ui.say('一言'); ui.toast('通知', 'ok'); ui.talk('田辺さん', '「…」', [{ t: '返事', fn }], { face: url });
//   ui.stamp('見破った！', '説明', true)   // the big centred stamp for a moment of success
const $ = (id) => document.getElementById(id);
export const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function ensure(id, parent = document.body) {
  let el = $(id);
  if (!el) {
    el = document.createElement("div");
    el.id = id;
    parent.appendChild(el);
  }
  return el;
}

// the thought line (standard 1.8.1, feedback "messages get cut off"): a line stays up at least as long as it takes to read (readSec), and a
// line that arrives while another is still being read waits for it (a short queue) instead of replacing it mid-sentence; a repeated line
// only extends the one showing. o.urgent shows at once ("走れ"). Pure: the clock and the timers are injected (test/say-line.test.mjs).
export const sayText = (html) => String(html).replace(/<[^>]*>/g, "").replace(/&[a-z]+;/g, " ");
// slow enough to read while walking (feedback 2026-11-02 「文章が一瞬しか表示されず、思ったことや会話が流れる」): 2.4 s + 0.15 s a character, up to 15 s
export const readSec = (html) => Math.min(15, 2.4 + sayText(html).length * 0.15);
// a line longer than `max` visible characters becomes pages shown one after another (split after 。！？, then 、, then hard), so the band
// never needs more than about 4 lines on a phone; a leading speaker tag (<span class="who">…</span>) is repeated on every page
export function splitSay(html, max = 60) {
  const h = String(html), m = h.match(/^(<span[^>]*>[^<]*<\/span>)/), head = m ? m[1] : "", body = h.slice(head.length);
  if (sayText(body).length <= max || /<(?!\/?(b|i|em|strong|span))/i.test(body)) return [h];
  const pages = []; let rest = body;
  while (sayText(rest).length > max) {
    let cut = -1;
    for (const re of [/[。！？!?」]/g, /[、，,]/g]) { let x; re.lastIndex = 0; while ((x = re.exec(rest)) && x.index < max) cut = x.index + 1; if (cut > max * 0.35) break; cut = -1; }
    if (cut < 0) cut = max;
    pages.push(rest.slice(0, cut)); rest = rest.slice(cut).replace(/^\s+/, "");
  }
  if (rest) pages.push(rest);
  return pages.map((p) => head + p);
}
export class SayLine {
  // timer / clear are wrapped: a browser throws "Illegal invocation" when setTimeout is called as a method of another object (this.timer(...))
  constructor({ show, hide, now = () => performance.now() / 1000, timer = (f, ms) => setTimeout(f, ms), clear = (h) => clearTimeout(h), max = 6 } = {}) {
    Object.assign(this, { show, hide, now, timer, clear, max });
    this.q = []; this.cur = null; this.hideT = null; this.waitT = null;
    this.log = [];   // every line shown, oldest first (the last 60): the 言葉の記録 tab reads it, so nothing said is lost
  }
  remember(html) { const last = this.log[this.log.length - 1]; if (last && last.html === html) return; this.log.push({ html, at: Date.now() }); if (this.log.length > 60) this.log.shift(); }
  push(html, sec = 4.5, o = {}) {
    const pages = splitSay(html, o.max ?? this.pageMax ?? 60);
    if (pages.length > 1) { pages.forEach((pg, i) => this.push(pg, Math.max(readSec(pg), sec / pages.length), { ...o, urgent: o.urgent && i === 0, max: Infinity })); return; }
    const t = this.now(), dur = Math.max(sec, readSec(html));
    if (this.cur && this.cur.html === html) { this.cur.hideAt = Math.max(this.cur.hideAt, t + dur); this.arm(); return; }
    this.q = this.q.filter((x) => x.html !== html);
    if (o.urgent) { this.q.unshift({ html, dur }); this.clear(this.waitT); this.waitT = null; this.next(true); return; }
    this.q.push({ html, dur });
    while (this.q.length > this.max) { const i = this.q.findIndex((x) => !/class="who"/.test(x.html)); this.q.splice(i >= 0 ? i : 0, 1); }   // a crowded queue drops a thought before a spoken line
    this.next();
  }
  next(force = false) {
    const t = this.now();
    if (!force && this.cur && t < this.cur.readyAt) {
      if (!this.waitT) this.waitT = this.timer(() => { this.waitT = null; this.next(); }, (this.cur.readyAt - t) * 1000 + 20);
      return;
    }
    const n = this.q.shift(); if (!n) return;
    this.cur = { html: n.html, readyAt: t + Math.min(n.dur, readSec(n.html)), hideAt: t + n.dur };
    this.show(n.html, sayText(n.html).length); this.remember(n.html);
    this.arm();
    if (this.q.length) this.next();
  }
  arm() {
    this.clear(this.hideT);
    const c = this.cur; if (!c) return;
    this.hideT = this.timer(() => { if (this.cur === c) { this.cur = null; this.hide(); this.next(); } }, Math.max(0, c.hideAt - this.now()) * 1000);
  }
}

export class KitUI {
  constructor(o = {}) {
    this.o = o;
    this.root = ensure("ui");
    this.sayEl = ensure("say", ensure("hud"));
    this.sayLine = new SayLine({ show: (html, n) => { this.sayEl.innerHTML = html; this.sayEl.classList.toggle("long", n > 44); this.sayEl.classList.add("on"); }, hide: () => this.sayEl.classList.remove("on") });
    this.lane = o.lane || null;   // a ToastLane (js/toast-lane.js): toasts go there (rule U27); without it the legacy #toasts box
    this.toastsEl = this.lane ? null : ensure("toasts", ensure("hud"));
    this.open = null;
    this.cur = null;
    this.after = [];
    addEventListener("keydown", (e) => this.key(e));
  }

  // { el, body, foot, close }. opts: wide, locked (Esc does not close; set w.onEsc), cls, app (html above the title), onClose
  window(name, title, sub = "", opts = {}) {
    this.close(true);
    this.o.onOpen && this.o.onOpen(name);
    const el = document.createElement("div");
    el.className = `win-wrap ${opts.cls || ""}`;
    el.innerHTML = `<div class="win ${opts.wide ? "wide" : ""}" role="dialog" aria-label="${esc(String(title).replace(/<[^>]+>/g, ""))}">${opts.app || ""}<div class="win-head"><div class="win-title">${title}</div><div class="win-sub">${sub}</div>${opts.locked ? "" : '<button class="win-x" aria-label="閉じる">×</button>'}</div><div class="win-body"></div><div class="win-foot"></div></div>`;
    this.root.appendChild(el);
    const w = { el, body: el.querySelector(".win-body"), foot: el.querySelector(".win-foot"), name, locked: !!opts.locked, onClose: opts.onClose };
    const x = el.querySelector(".win-x");
    if (x) x.onclick = () => this.close();
    this.cur = w;
    this.open = name;
    return w;
  }

  close(silent = false) {
    const w = this.cur;
    if (!w) return;
    w.el.remove();
    this.cur = null;
    const name = this.open;
    this.open = null;
    if (silent) return;
    if (w.onClose) w.onClose();
    this.o.onClose && this.o.onClose(name);
    const fns = this.after;
    this.after = [];
    fns.forEach((f) => setTimeout(f, 200));
  }

  // run after the current window closes (e.g. a line of dialogue once a software screen is dismissed)
  afterClose(fn) {
    this.after.push(fn);
  }

  key(e) {
    if (!this.open || e.code !== "Escape") return;
    e.preventDefault();
    if (this.cur && this.cur.locked) return this.cur.onEsc && this.cur.onEsc();
    this.close();
  }

  // [{ t, cls, fn, disabled, note }]
  buttons(parent, list) {
    parent.innerHTML = "";
    for (const b of list) {
      const btn = document.createElement("button");
      btn.className = `btn ${b.cls || ""}`;
      btn.innerHTML = `${b.t}${b.note ? `<span class="note">${b.note}</span>` : ""}`;
      btn.disabled = !!b.disabled;
      btn.onclick = () => b.fn && b.fn(btn);
      parent.appendChild(btn);
    }
  }

  // the thought line: queued, never cut while it is being read (SayLine). o.urgent shows at once
  say(html, sec = 4.5, o = {}) {
    this.sayLine.push(html, sec, o);
  }

  toast(html, cls = "", max = 4) {
    if (this.lane) return this.lane.push({ html, kind: "toast", cls: cls === "ok" ? "tl-ok" : cls });
    const el = document.createElement("div");
    el.className = `toast ${cls}`;
    el.innerHTML = html;
    this.toastsEl.appendChild(el);
    while (this.toastsEl.children.length > max) this.toastsEl.firstChild.remove();
    setTimeout(() => el.classList.add("out"), 4200);
    setTimeout(() => el.remove(), 5000);
  }

  // a conversation: portrait (opts.face), the line, then choices [{ t, fn }]
  talk(who, line, choices, opts = {}) {
    const w = this.window("talk", who, opts.sub || "", { locked: !!opts.locked });
    w.body.innerHTML = `${opts.intro ? `<p class="intro">${opts.intro}</p>` : ""}<div class="talkrow">${opts.face ? `<img class="talkface" src="${opts.face}" alt="">` : ""}<div class="bubble">${line}</div></div>`;
    this.buttons(w.foot, choices.map((c) => ({ t: c.t, cls: c.cls || "choice", fn: () => c.fn() })));
    return w;
  }

  stamp(big, text = "", strong = true, sec = 2.2) {
    const el = document.createElement("div");
    el.className = `catch ${strong ? "clean" : ""}`;
    el.innerHTML = `<div class="stamp-big">${big}</div>${text ? `<div class="what">${text}</div>` : ""}`;
    document.body.appendChild(el);
    setTimeout(() => el.classList.add("out"), sec * 1000);
    setTimeout(() => el.remove(), sec * 1000 + 700);
  }

  // tabs inside a window: [['key', 'label', count?]] -> html; wire with ui.onTabs(w.body, fn)
  static tabs(list, cur) {
    return `<nav class="hb-tabs" role="tablist">${list.map(([k, t, n]) => `<button role="tab" class="hb-tab ${k === cur ? "on" : ""}" data-tab="${k}">${t}${n !== undefined ? `<span class="cnt">${n}</span>` : ""}</button>`).join("")}</nav>`;
  }

  onTabs(root, fn) {
    for (const b of root.querySelectorAll("[data-tab]")) b.onclick = () => fn(b.dataset.tab);
  }
}
