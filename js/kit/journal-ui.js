/* game-kit 6e0b6f0: js/journal-ui.js — edit in game-kit and run tools/kit-sync.js */
// The journal / collection screen for js/sidestory.js: tabs 進行中・完了・気になること・収集, stories with
// their progress (done steps, the next one and what it still needs, the rest hidden), locked ones as
// "？？？" silhouettes, open threads with what was noticed and solved ones with their answer, a reward
// grid per kind with completion %, NEW badges for what changed since the tab was last seen.
// HTML in an element, or in a KitUI window (css: kit.css hb-tabs + css/_new/sidestory.css jr-*).
// From 閉園後 (js/side.js journal / qList / collection) / 第零処理区 (js/ui-side.js).
//
//   const jr = new Journal(ss, { areaName: (id) => AREAS[id].name, img: (kind, id) => mediaUrl(id), kindNames: { card: 'カード' } });
//   jr.open(ui)                  // a KitUI window (wide), or jr.render(el, 'threads') into any element
//   jr.badge() -> number of NEW things (for a HUD dot); jr.onTrack = (storyId) => ...
import { KitUI, esc } from "./ui.js";
import { icon } from "./icons.js";
import { gfRegister, gfEmit, gfOk, gfFail, gfUnknown } from "./gf-test.js";
import { viewItemHtml } from "./inventory-ui.js";

const TABS = [
  ["active", "進行中"],
  ["done", "完了"],
  ["threads", "気になること"],
  ["collection", "収集"],
];

export class Journal {
  // o: areaName(id), gimmickName(id), itemName(id), img(kind, id) -> url | null, kindNames { kind: label },
  //    labels (override any text below), showLocked (true), lockedMax (24)
  constructor(ss, o = {}) {
    this.ss = ss;
    this.o = { showLocked: true, lockedMax: 24, kindNames: {}, ...o };
    this.L = { next: "次", need: "必要", have: "持っている", track: "目印にする", tracking: "目印にしています", none: "まだ何もありません。", locked: "？？？", newb: "NEW", answer: "分かったこと", noticed: "書き留めたこと", hintMore: "どこかに、まだ続きがありそうです。", hintWait: "いつか、分かるかもしれません。", hintAt: "どこかで、答えに出会えるかもしれません。", reward: "報酬", solved: "つながったこと", ...(o.labels || {}) };
    this.tab = "active";
    this.onTrack = null;
  }

  name(kind, id) {
    const ss = this.ss;
    if (kind === "area") return this.o.areaName ? this.o.areaName(id) : ss.d.areas[id]?.name || id;
    if (kind === "gimmick") return this.o.gimmickName ? this.o.gimmickName(id) : ss.G[id]?.name || id;
    return this.o.itemName ? this.o.itemName(id) : (ss.d.items[id] || ss.d.rewards[id])?.name || id;
  }
  pic(kind, id, fallback = "") {
    const u = this.o.img ? this.o.img(kind, id) : null;
    return u ? `<div class="jr-pic" style="background-image:url('${esc(u).replace(/'/g, "%27")}')"></div>` : `<div class="jr-pic jr-nopic">${esc(fallback)}</div>`;
  }
  isNew(key) {
    return this.ss.isFresh(key) ? `<span class="jr-new">${esc(this.L.newb)}</span>` : "";
  }

  // NEW things per tab
  fresh() {
    const ss = this.ss;
    const keys = Object.keys(ss.s.fresh);
    return {
      active: keys.filter((k) => k.startsWith("ss:") && ss.storyState(k.slice(3)) === "active").length,
      done: keys.filter((k) => k.startsWith("ss:") && ss.storyState(k.slice(3)) === "done").length,
      threads: keys.filter((k) => k.startsWith("q:")).length,
      collection: keys.filter((k) => k.startsWith("rw:") && ss.d.rewards[k.slice(3)]).length,
    };
  }
  badge() {
    return Object.values(this.fresh()).reduce((a, b) => a + b, 0);
  }

  open(ui, title = "記録", sub = "") {
    const w = ui.window("journal", esc(title), esc(sub), { wide: true, cls: "hb-win jr-win" });
    this.render(w.body);
    ui.buttons(w.foot, [{ t: "閉じる", fn: () => ui.close() }]);
    return w;
  }

  render(el, tab = this.tab) {
    this.tab = tab;
    const ss = this.ss;
    const c = ss.counts();
    const f = this.fresh();
    const count = { active: c.active, done: c.done, threads: c.open, collection: `${c.rewards}/${c.rewardsTotal}` };
    const tabs = KitUI.tabs(TABS.map(([k, t]) => [k, `${esc(t)}${f[k] ? '<i class="jr-dot"></i>' : ""}`, count[k]]), tab);
    const body = { active: () => this.activeHtml(), done: () => this.doneHtml(), threads: () => this.threadsHtml(), collection: () => this.collectionHtml() }[tab]();
    const sum = tab === "threads" ? this.bar(c.solved, c.threads) : tab === "collection" ? "" : this.bar(c.done, c.stories);
    el.innerHTML = `<div class="jr">${tabs}${sum ? `<div class="jr-sum">${sum}</div>` : ""}<div class="jr-body">${body}</div></div>`;
    el.querySelectorAll("[data-tab]").forEach((b) => (b.onclick = () => this.render(el, b.dataset.tab)));
    el.querySelectorAll("[data-track]").forEach((b) => (b.onclick = () => {
      ss.track(b.dataset.track);
      if (this.onTrack) this.onTrack(b.dataset.track);
      this.render(el, tab);
    }));
    el.querySelectorAll("[data-rw]").forEach((b) => (b.onclick = () => {
      const r = ss.d.rewards[b.dataset.rw];
      const d = el.querySelector(".jr-detail");
      if (r && d) d.innerHTML = `<b>${esc(r.name || r.id)}</b>${r.text ? `<p>${esc(r.text)}</p>` : ""}`;
    }));
    // what this tab shows is no longer new (the badges stay on screen until the next render)
    const seen = Object.keys(ss.s.fresh).filter((k) => (tab === "threads" ? k.startsWith("q:") : tab === "collection" ? k.startsWith("rw:") : k.startsWith("ss:") && ss.storyState(k.slice(3)) === tab));
    ss.markSeen(seen);
    return el;
  }

  bar(n, total) {
    const pct = total ? Math.round((n / total) * 100) : 0;
    return `<div class="jr-bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct}%"></i></div><span class="jr-num">${n}/${total}<small>${pct}%</small></span>`;
  }

  steps(s) {
    const ss = this.ss;
    const n = ss.progress(s.id).n;
    return `<ol class="jr-steps">${s.steps.map((st, i) => {
      if (i < n) return `<li class="done"><span class="jr-box">✓</span><span>${esc(st.text || st.act || "")}</span></li>`;
      if (i > n) return `<li class="later"><span class="jr-box"></span><span class="jr-dim">……</span></li>`;
      const need = [st.need, st.key].filter(Boolean).map((k) => `${esc(this.name("item", k))}${ss.has(k) ? `（${esc(this.L.have)}）` : ""}`);
      const gm = ss.G[st.at];
      return `<li class="cur"><span class="jr-box"></span><span><b>${esc(this.L.next)}：</b>${gm?.area ? `${esc(this.name("area", gm.area))}の` : ""}「${esc(this.name("gimmick", st.at))}」${st.act ? `で「${esc(st.act)}」` : ""}${need.length ? `<br><span class="jr-dim">${esc(this.L.need)}：${need.join("・")}</span>` : ""}${st.hint ? `<br><span class="jr-dim">${esc(st.hint)}</span>` : ""}</span></li>`;
    }).join("")}</ol>`;
  }

  entry(s, open) {
    const ss = this.ss;
    const p = ss.progress(s.id);
    const tracked = ss.s.track === s.id;
    const area = s.area ? `<span class="jr-dim">${esc(this.name("area", s.area))}</span>` : "";
    const rewards = (s.reward || []).map((r) => `<span class="jr-chip">${esc(this.name("item", r))}</span>`).join("");
    const head = `<summary>${this.isNew(`ss:${s.id}`)}<b>${esc(s.title)}</b>${area}<span class="jr-prog"><i style="width:${(p.n / p.total) * 100}%"></i></span><span class="jr-num">${p.n}/${p.total}</span></summary>`;
    if (p.state === "done") return `<details class="jr-entry done">${head}${typeof s.done === "string" ? `<p>${esc(s.done)}</p>` : ""}<div class="jr-rw">${rewards}</div></details>`;
    return `<details class="jr-entry" ${open ? "open" : ""}>${head}${s.intro ? `<p class="jr-dim">${esc(s.intro)}</p>` : ""}${this.steps(s)}<div class="jr-foot">${tracked ? `<span class="jr-chip on">${esc(this.L.tracking)}</span>` : `<button class="btn small" data-track="${esc(s.id)}">${esc(this.L.track)}</button>`}${rewards ? `<span class="jr-dim">${esc(this.L.reward)}：</span>${rewards}` : ""}</div></details>`;
  }

  locked() {
    if (!this.o.showLocked) return "";
    const list = this.ss.locked();
    if (!list.length) return "";
    const shown = list.slice(0, this.o.lockedMax);
    return `<div class="jr-locked">${shown.map((s) => `<div class="jr-sil" aria-label="未発見"><b>${esc(this.L.locked)}</b>${s.area ? `<span>${esc(this.name("area", s.area))}</span>` : ""}</div>`).join("")}${list.length > shown.length ? `<div class="jr-sil more">+${list.length - shown.length}</div>` : ""}</div>`;
  }

  activeHtml() {
    const ss = this.ss;
    const list = ss.active();
    return `${list.length ? list.map((s) => this.entry(s, s.id === ss.s.track)).join("") : `<p class="jr-empty">${esc(this.L.none)}</p>`}${this.locked()}`;
  }

  doneHtml() {
    const list = this.ss.completed();
    return list.length ? list.map((s) => this.entry(s, false)).join("") : `<p class="jr-empty">${esc(this.L.none)}</p>`;
  }

  threadsHtml() {
    const ss = this.ss;
    const open = ss.threads("open");
    const solved = ss.threads("solved").sort((a, b) => ss.s.qs[b.id] - ss.s.qs[a.id]);
    const unseen = ss.threads("unseen").length;
    const notes = (t) => `<ul class="jr-notes">${ss.noticed(t.id).map((p) => `<li>${esc(p.note || "")}</li>`).join("")}</ul>`;
    const openHtml = open.map((t) => {
      const st = ss.threadState(t.id);
      const hint = st === "open" ? this.L.hintMore : t.reveal.at ? this.L.hintAt : this.L.hintWait;
      return `<div class="jr-q">${this.pic("thread", t.id, "？")}<div>${this.isNew(`q:${t.id}`)}<b>${esc(t.title)}</b>${notes(t)}<span class="jr-qmark">？</span><span class="jr-dim">${esc(hint)}</span></div></div>`;
    }).join("");
    const solvedHtml = solved.map((t) => `<details class="jr-q-done" ${ss.isFresh(`q:${t.id}`) ? "open" : ""}><summary>${this.isNew(`q:${t.id}`)}<b>${esc(t.title)}</b></summary><div class="jr-q">${this.pic("answer", t.id, "！")}<div><span class="jr-dim">${esc(this.L.noticed)}</span>${notes(t)}<span class="jr-dim">${esc(this.L.answer)}</span><p>${esc(t.reveal.text || "")}</p></div></div></details>`).join("");
    const sil = this.o.showLocked && unseen ? `<div class="jr-locked">${Array.from({ length: Math.min(unseen, this.o.lockedMax) }, () => `<div class="jr-sil"><b>${esc(this.L.locked)}</b></div>`).join("")}</div>` : "";
    return `${openHtml || (solvedHtml ? "" : `<p class="jr-empty">${esc(this.L.none)}</p>`)}${solvedHtml ? `<div class="sec">${esc(this.L.solved)}</div>${solvedHtml}` : ""}${sil}`;
  }

  collectionHtml() {
    const ss = this.ss;
    const kinds = [...new Set(Object.values(ss.d.rewards).map((r) => r.kind || "other"))];
    const all = ss.collection();
    const sec = (k) => {
      const c = ss.collection(k === "other" ? null : k);
      const list = k === "other" ? c.list.filter((x) => !x.reward.kind) : c.list;
      const have = list.filter((x) => x.got).length;
      const cells = list.map(({ reward: r, got, fresh }) => (got ? `<button class="jr-cell got" data-rw="${esc(r.id)}" title="${esc(r.name || r.id)}">${this.pic("reward", r.id, (r.name || r.id).slice(0, 1))}<span>${esc(r.name || r.id)}</span>${fresh ? `<span class="jr-new">${esc(this.L.newb)}</span>` : ""}</button>` : `<div class="jr-cell"><div class="jr-pic jr-nopic">？</div><span>${esc(this.L.locked)}</span></div>`)).join("");
      return `<div class="jr-kind"><div class="sec">${esc(this.o.kindNames[k] || k)}<span class="jr-num">${have}/${list.length}<small>${list.length ? Math.round((have / list.length) * 100) : 0}%</small></span></div><div class="jr-grid">${cells}</div></div>`;
    };
    return `<div class="jr-sum">${this.bar(all.have, all.total)}</div>${kinds.map(sec).join("")}<div class="jr-detail"></div>`;
  }
}

// ======================================================================================================================
// createJournal: the "気になること・写真" notebook that is not tied to SideStory — tabs (資料 / 写真 / 調べたもの / 気づき ...),
// each entry = a photo thumbnail + the protagonist's one-line impression, grouped by room, ★ pins with a ★-only filter,
// NEW dots for what was added since the tab was last seen, tap an entry to open it again (the game shows it, then calls back()).
// From 日影 (notebook tab: N key, HUD button, ★, by room, re-open on tap) and 未然調書 (tabbed notebook with impressions + photos).
//
//   const jr = createJournal({
//     tabs: [{ id: "doc", label: "資料" }, { id: "photo", label: "写真" }, { id: "ex", label: "調べたもの" }, { id: "note", label: "気づき" }],
//     getEntries: () => state.notices,           // [{ id, tab, group, title, line, img, tag? }]  (only what has been SEEN: no spoilers)
//     groups: ROOMS,                             // { R01: "事務室" } or [{ id, label }]  (order = room order; unknown ids sort last)
//     onOpen: (entry, jr) => ui.showDoc(entry, { onClose: () => jr.reopen() }),   // tap = look again
//     storage: localStorage,                     // anything with getItem / setItem (default: localStorage, safe when blocked); pins + seen are kept
//     layout: "side",                            // optional: tabs down the left on wide screens (未然調書 style)
//     key: "KeyN", onKey: () => ui.inventory("notice"),  // optional hotkey (ignored while typing)
//   });
//   jr.render(el, "photo")  /  jr.open(ui)       // into any element, or a KitUI window
//   jr.mountButton(hudEl)                         // a "気になる" HUD button with a NEW dot
//   jr.badge()  jr.pin(id)  jr.isPinned(id)  jr.setFilter("pin")  jr.on("change", fn)
// entry.line is the protagonist's one-line impression; entry.img is a url (or null: a tinted tile with the tag's first letter).
const J_LABELS = { back: "もどる", feeling: "ひとこと", all: "すべて", pinned: "あとで見返す", hint: "見つけたものが、ここに残ります。新しいものが上に並びます。", empty: "まだ、ここには何もありません。", emptyPin: "印をつけたものは、まだありません。", newb: "NEW", pin: "あとで見返す印", title: "気になること", close: "閉じる", allRooms: "すべての場所", noGroup: "そのほか", newestFirst: "新しいものから並べています。", more: "くわしく見る", reread: "もういちど読む", expand: "ひらく", collapse: "とじる", inRoom: (n) => `${n}件` };

// ---- pure parts (no document; test/journal-ui.test.mjs) ----
export const togglePin = (pins, id) => (pins.includes(id) ? pins.filter((p) => p !== id) : [...pins, id]);
// newest: newest first inside each group (by entry.at when given, else the later in the list is newer) and the groups ordered by their newest entry (groupOrder "recent");
// room: only the entries of that group id; by "when": group by entry.when (a label such as "第2章" / "01:20") instead of the room.
export function groupEntries(entries, { tab = null, pins = [], pinnedOnly = false, groups = [], newest = false, groupOrder = newest ? "recent" : "room", room = "", by = "room" } = {}) {
  const order = (Array.isArray(groups) ? groups : Object.entries(groups).map(([id, label]) => ({ id, label: typeof label === "string" ? label : label.name }))).map((g) => (typeof g === "string" ? { id: g, label: g } : g));
  const shown = entries.map((e, i) => ({ e, i })).filter(({ e }) => (!tab || e.tab === tab) && (!pinnedOnly || pins.includes(e.id)) && (!room || (e.group ?? "") === room));
  const at = ({ e, i }) => (typeof e.at === "number" ? e.at : i);
  const out = [];
  for (const x of shown) {
    const id = by === "when" ? e_when(x.e) : by === "none" ? "" : x.e.group ?? "";
    let g = out.find((y) => y.id === id);
    if (!g) out.push((g = { id, label: by === "when" ? id : order.find((o) => o.id === id)?.label ?? x.e.groupLabel ?? id, items: [] }));
    g.items.push(x);
  }
  for (const g of out) {
    if (newest) g.items.sort((a, b) => at(b) - at(a));
    g.entries = g.items.map((x) => x.e);
    g.top = g.items.length ? Math.max(...g.items.map(at)) : 0;
    delete g.items;
  }
  const rank = (id) => order.findIndex((o) => o.id === id) + 1 || 9999;
  return by === "room" && groupOrder === "room" ? out.sort((a, b) => rank(a.id) - rank(b.id)) : out.sort((a, b) => (a.id === "" ? 1 : 0) - (b.id === "" ? 1 : 0) || b.top - a.top);
}
const e_when = (e) => e.when ?? "";
// the rooms that have an entry in a tab (for the room filter): [{ id, label, n }] in the order of the groups
export function roomChoices(entries, { tab = null, groups = [] } = {}) {
  const list = groupEntries(entries, { tab, groups });
  return list.map((g) => ({ id: g.id, label: g.label, n: g.entries.length }));
}
export const tabCounts = (entries, tabs) => Object.fromEntries(tabs.map((t) => [t.id, entries.filter((e) => e.tab === t.id).length]));
export const freshIds = (entries, seen) => entries.filter((e) => !seen.includes(e.id)).map((e) => e.id);
export const freshByTab = (entries, seen, tabs) => Object.fromEntries(tabs.map((t) => [t.id, entries.filter((e) => e.tab === t.id && !seen.includes(e.id)).length]));
// one row (rule U29 / the self record must be easy to read): title + the protagonist's line, tap = it opens in place (the whole line, the text, a button for the
// photo card / re-reading); the star keeps it for later.  open: rendered expanded.  The caption sits in <em>, the line in <small class="jn-line"> (voice pair tokens).
export const entryHtml = (e, { pinned = false, fresh = false, open = false, hasOpen = true, L = J_LABELS } = {}) => {
  const more = !!(e.text || e.img || hasOpen);
  const text = e.text ? String(e.text).split("\n").filter(Boolean).map((t) => `<p>${esc(t)}</p>`).join("") : "";
  const btn = e.img || e.text || hasOpen ? `<button type="button" class="btn small jn-go" data-open="${esc(e.id)}">${esc(e.img || e.text ? L.more : L.reread)}</button>` : "";
  return `<div class="jn-row${open ? " open" : ""}${e.img ? "" : " jn-nopic"}" data-e="${esc(e.id)}"><div class="jn-card"><button type="button" class="jn-main" data-toggle="${esc(e.id)}" aria-expanded="${open}">${e.img ? `<span class="jn-th" style="background-image:url('${esc(e.img).replace(/'/g, "%27")}')"></span>` : ""}<span class="jn-tx">${e.tag ? `<em>${esc(e.tag)}</em>` : ""}<b>${fresh ? `<span class="jr-new">${esc(L.newb)}</span>` : ""}${esc(e.title || "")}</b>${e.line ? `<small class="jn-line">${esc(e.line)}</small>` : ""}</span><span class="jn-chev" aria-hidden="true">${icon("chevron", { size: 20 })}</span></button>${more ? `<div class="jn-more"${open ? "" : " hidden"}>${text}${btn}</div>` : ""}</div><button type="button" class="jn-star${pinned ? " on" : ""}" data-pin="${esc(e.id)}" aria-pressed="${pinned}" aria-label="${esc(L.pin)}" title="${esc(L.pin)}">${icon("star", { size: 22 })}</button></div>`;
};

// the entry view (U19): the photo card (img, title, text) and the protagonist's line as its own panel. Used by the default tap action.
export const entryViewHtml = (e, L = J_LABELS) => viewItemHtml({ photo: e.img, title: e.title, text: e.text, feeling: e.line, tag: e.tag }, { feeling: L.feeling, why: "" });

const safeStorage = () => {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
};

export function createJournal(o = {}) {
  const tabs = o.tabs || [];
  const L = { ...J_LABELS, ...(o.labels || {}) };
  const storage = o.storage === undefined ? safeStorage() : o.storage;
  const skey = `journal.${o.name || "main"}`;
  const st = { pins: [], seen: [], filter: "all", tab: o.tab || tabs[0]?.id, view: null, room: "", open: [] };
  const newest = o.newest !== false; // newest first (U29: the latest thing the player noticed is on top)
  try {
    const d = JSON.parse((storage && storage.getItem(skey)) || "null");
    if (d) ((st.pins = d.pins || []), (st.seen = d.seen || []));
  } catch {}
  const save = () => {
    try {
      storage && storage.setItem(skey, JSON.stringify({ pins: st.pins, seen: st.seen }));
    } catch {}
  };
  const subs = [];
  const emit = () => (gfEmit("journal", "change", { pins: st.pins.length }), subs.forEach((f) => f()));
  const entries = () => (o.getEntries ? o.getEntries() : []) || [];
  let host = null;
  const tabInfo = (id) => tabs.find((t) => t.id === id) || {};
  const api = {
    state: st,
    on: (ev, fn) => (ev === "change" && subs.push(fn), api),
    entries,
    viewHtml: (e) => entryViewHtml(e, L),
    isPinned: (id) => st.pins.includes(id),
    pin(id) {
      st.pins = togglePin(st.pins, id);
      save();
      emit();
      return st.pins.includes(id);
    },
    setFilter(f) {
      st.filter = f === "pin" ? "pin" : "all";
      return api;
    },
    setRoom(id) {
      st.room = id || "";
      return api;
    },
    toggleOpen(id) {
      st.open = st.open.includes(id) ? st.open.filter((x) => x !== id) : [...st.open, id];
      return st.open.includes(id);
    },
    fresh: () => freshByTab(entries(), st.seen, tabs),
    badge: () => Object.values(api.fresh()).reduce((a, b) => a + b, 0),
    markSeen(tab = st.tab) {
      const add = entries().filter((e) => e.tab === tab && !st.seen.includes(e.id)).map((e) => e.id);
      if (add.length) ((st.seen = [...st.seen, ...add]), save(), emit());
    },
    // re-render into the last element (call it from onOpen's "closed" callback)
    reopen() {
      if (host) api.render(host.el, host.tab);
      else if (o.onReopen) o.onReopen();
    },
    render(el, tab = st.tab) {
      st.tab = tab;
      host = { el, tab };
      const all = entries();
      const ve = st.view && all.find((x) => x.id === st.view);
      if (ve) {
        // default entry view (when the game gave no onOpen): photo card + the separate line panel, back button
        el.innerHTML = `<div class="jr jn jn-detail"><button type="button" class="btn jn-back" data-back>${esc(L.back)}</button><div class="jn-view">${entryViewHtml(ve, L)}</div></div>`;
        el.querySelector("[data-back]").onclick = () => ((st.view = null), api.render(el, tab));
        return el;
      }
      st.view = null;
      const counts = tabCounts(all, tabs);
      const fresh = api.fresh();
      const pinned = st.filter === "pin" && st.pins.length > 0;
      const rooms = o.by === "when" || o.by === "none" ? [] : roomChoices(all, { tab, groups: o.groups || [] }).filter((r) => r.id !== "");
      if (st.room && !rooms.some((r) => r.id === st.room)) st.room = "";
      const groups = groupEntries(all, { tab, pins: st.pins, pinnedOnly: pinned, groups: o.groups || [], newest, room: st.room, by: o.by || "room" });
      const named = groups.filter((g) => g.id !== "").length;
      const seenNow = new Set(st.seen);
      const tabsHtml = KitUI.tabs(tabs.map((t) => [t.id, `${esc(t.label)}${fresh[t.id] ? '<i class="jr-dot"></i>' : ""}`, counts[t.id]]), tab);
      const here = all.filter((e) => e.tab === tab);
      const bar = `<div class="jn-bar"><button type="button" class="jn-chip${pinned ? "" : " on"}" data-f="all">${esc(L.all)}（${here.length}）</button><button type="button" class="jn-chip${pinned ? " on" : ""}" data-f="pin">${icon("star", { size: 16 })} ${esc(L.pinned)}（${here.filter((e) => st.pins.includes(e.id)).length}）</button></div>${rooms.length > 1 ? `<div class="jn-bar jn-rooms" role="group" aria-label="${esc(L.allRooms)}"><button type="button" class="jn-chip${st.room ? "" : " on"}" data-room="">${esc(L.allRooms)}</button>${rooms.map((r) => `<button type="button" class="jn-chip${st.room === r.id ? " on" : ""}" data-room="${esc(r.id)}">${esc(r.label)}（${r.n}）</button>`).join("")}</div>` : ""}<p class="jn-hint">${esc(tabInfo(tab).hint || L.hint)}</p>`;
      const body =
        groups.map((g) => `<section class="jn-group">${g.label || named ? `<h4>${esc(g.label || L.noGroup)}<small>${esc(L.inRoom(g.entries.length))}</small></h4>` : ""}${g.entries.map((e) => entryHtml(e, { pinned: st.pins.includes(e.id), fresh: !seenNow.has(e.id), open: st.open.includes(e.id), hasOpen: !!o.onOpen, L })).join("")}</section>`).join("") ||
        `<p class="jr-empty">${esc(st.filter === "pin" && !pinned ? L.emptyPin : tabInfo(tab).empty || L.empty)}</p>`;
      el.innerHTML = `<div class="jr jn${o.layout === "side" ? " jn-side" : ""}">${tabsHtml}<div class="jn-col">${bar}<div class="jn-body">${body}</div></div></div>`;
      el.querySelectorAll("[data-tab]").forEach((b) => (b.onclick = () => api.render(el, b.dataset.tab)));
      el.querySelectorAll("[data-f]").forEach((b) => (b.onclick = () => (api.setFilter(b.dataset.f), api.render(el, tab))));
      el.querySelectorAll("[data-room]").forEach((b) => (b.onclick = () => ((st.room = b.dataset.room), api.render(el, tab))));
      // tap = the entry opens in place (and closes again); the scroll position stays
      el.querySelectorAll("[data-toggle]").forEach(
        (b) =>
          (b.onclick = () => {
            const id = b.dataset.toggle;
            st.open = st.open.includes(id) ? st.open.filter((x) => x !== id) : [...st.open, id];
            const top = (el.querySelector(".jn-body") || {}).scrollTop || 0;
            api.render(el, tab);
            const nb = el.querySelector(".jn-body");
            if (nb) nb.scrollTop = top;
          })
      );
      el.querySelectorAll("[data-pin]").forEach(
        (b) =>
          (b.onclick = () => {
            const top = (el.querySelector(".jn-body") || {}).scrollTop || 0;
            api.pin(b.dataset.pin);
            api.render(el, tab);
            const nb = el.querySelector(".jn-body");
            if (nb) nb.scrollTop = top;
          })
      );
      el.querySelectorAll("[data-open]").forEach(
        (b) =>
          (b.onclick = () => {
            const e = all.find((x) => x.id === b.dataset.open);
            if (e && o.onOpen && o.onOpen(e, api) !== false) return; // (1.1) onOpen returning false = show the journal's own card for this entry
            if (e) ((st.view = e.id), api.render(el, tab));
          })
      );
      api.markSeen(tab); // what this tab shows is no longer new (the NEW badges stay until the next render)
      return el;
    },
    open(ui, title = L.title, sub = "") {
      const w = ui.window("journal", esc(title), esc(sub), { wide: true, cls: "hb-win jr-win" });
      api.render(w.body);
      ui.buttons(w.foot, [{ t: L.close, fn: () => ui.close() }]);
      return w;
    },
    mountButton(parent = document.body, label = L.title) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "jn-hud";
      const paint = () => (b.setAttribute("aria-label", label), (b.title = label), (b.innerHTML = `${icon("notes", { size: 22 })}<span class="hud-lb">${esc(label)}</span>${api.badge() ? '<i class="jr-dot"></i>' : ""}`));
      paint();
      api.on("change", paint);
      b.onclick = () => (o.onKey ? o.onKey() : api.open(o.ui));
      parent.appendChild(b);
      return b;
    },
  };
  if (o.key && typeof addEventListener === "function")
    addEventListener("keydown", (e) => {
      if (e.code === o.key && !e.repeat && !/INPUT|TEXTAREA|SELECT/.test((e.target && e.target.tagName) || "") && o.onKey) o.onKey(e);
    });
  gfRegister("journal", () => ({
    snapshot: () => ({ tab: st.tab, tabs: tabs.map((t) => t.id), filter: st.filter, room: st.room, open: st.open.slice(), pins: st.pins.slice(), seen: st.seen.slice(), entries: entries().map((e) => e.id), fresh: api.fresh(), badge: api.badge() }),
    drive(action, a = {}) {
      switch (action) {
        case "pin": if (!entries().some((e) => e.id === a.id)) return gfFail(`unknown entry "${a.id}"`); return gfOk({ pinned: api.pin(a.id), pins: st.pins.slice() });
        case "setFilter": api.setFilter(a.filter); return gfOk({ filter: st.filter });
        case "setRoom": api.setRoom(a.id); if (host) api.render(host.el, st.tab); return gfOk({ room: st.room });
        case "toggleOpen": if (!entries().some((e) => e.id === a.id)) return gfFail(`unknown entry "${a.id}"`); { const on = api.toggleOpen(a.id); if (host) api.render(host.el, st.tab); return gfOk({ open: st.open.slice(), opened: on }); }
        case "setTab": if (!tabs.some((t) => t.id === a.id)) return gfFail(`unknown tab "${a.id}"`); st.tab = a.id; if (host) api.render(host.el, a.id); return gfOk({ tab: st.tab });
        case "markSeen": api.markSeen(a.tab); return gfOk({ seen: st.seen.slice() });
        default: return gfUnknown(action);
      }
    },
    reset() { st.pins = []; st.seen = []; st.filter = "all"; st.room = ""; st.open = []; st.tab = o.tab || tabs[0]?.id; st.view = null; },
  }));
  return api;
}
