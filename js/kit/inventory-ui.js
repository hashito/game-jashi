/* game-kit bd0256a: js/inventory-ui.js — edit in game-kit and run tools/kit-sync.js */
// The item-management UI shared by every game (rule U17, with progress-ui.js taskScreen and journal-ui.js createJournal):
// owned items as a grid (photo + name), a detail pane (large photo, short description, "why needed" (S6), the protagonist's
// one-line feeling), use / examine buttons, selected + NEW states, a related-items link (opens the related items / papers
// during a puzzle, rule U6), tabs by kind, keyboard (I opens, arrows, Enter). Fixed window size (U12), list on top and
// detail below on narrow screens (U14), centred on big ones, tap targets >= 44px.
// Also viewItem(): the object card (photo card + a separate feeling panel, U19) used by the inventory, the journal and the look-at popup.
// Modelled on 未然調書's notebook (photo + impression per thing) and 届けるな's work terminal (所持品).
//
//   const inv = createInventory({
//     items: ITEMS,                         // [{ id, name, desc, why?, feeling?, img?, tab?, tag?, meta?, related?: [id], useLabel?, canUse?, examine? }] or { id: {...} }
//     getOwned: () => state.inv,            // ids, in the order picked up (what is not owned is not shown: no spoilers)
//     tabs: [{ id: "key", label: "業務用品" }],   // optional; item.tab picks the tab
//     onUse: (item, inv) => ..., onExamine: (item, inv) => ...,   // the game does the work; call inv.render() after a change
//     onRelated: (id, item, inv) => ...,    // default: select it when owned (the game may open a doc instead)
//     actions: (item) => [{ t, cls, fn }],  // extra buttons (組み合わせる, 破棄 ...)
//     onPick: (fromId, toId, inv) => ...,   // when inv.pick = id is set, the next tap goes here (combine)
//     storage: localStorage, name: "main",  // NEW marks are kept (anything with getItem / setItem; safe when blocked)
//     key: "KeyI", onKey: () => ui.openInventory(),
//   });
//   inv.render(el)  /  inv.open(ui)         // into any element, or a KitUI window
//   inv.keydown("ArrowRight" | "Enter" ...) // for the game's own key handling (returns true when used)
//   inv.select(id)  inv.badge()  inv.on("change", fn)  inv.mountButton(hudEl)
import { esc } from "./ui.js";
import { icon } from "./icons.js";
import { gfRegister, gfEmit, gfOk, gfFail, gfUnknown } from "./gf-test.js";

export const INV_LABELS = { title: "所持品", empty: "まだ何も持っていません。", emptyTab: "ここには、まだ何もありません。", newb: "NEW", why: "なぜ必要か", use: "使う", examine: "調べる", related: "関連", feeling: "ひとこと", close: "閉じる", hint: "タップで選びます。もう一度タップするか Enter で、使う・調べるができます。", pick: "組み合わせる物を選ぶ" };

// ---- pure parts (no document; test/inventory-ui.test.mjs) ----
export const normalizeItems = (items) => (Array.isArray(items) ? items : Object.entries(items || {}).map(([id, v]) => ({ id, ...v })));
// owned items in pick-up order; unknown ids and duplicates are dropped
export function ownedItems(items, owned) {
  const by = new Map(normalizeItems(items).map((i) => [i.id, i]));
  const seen = new Set();
  return (owned || []).filter((id) => by.has(id) && !seen.has(id) && seen.add(id)).map((id) => by.get(id));
}
export const itemsInTab = (list, tab, tabs = []) => (!tab || !tabs.length ? list : list.filter((i) => (i.tab || tabs[0].id) === tab));
export const tabCounts = (list, tabs) => Object.fromEntries(tabs.map((t) => [t.id, list.filter((i) => (i.tab || tabs[0].id) === t.id).length]));
export const freshIds = (list, seen) => list.filter((i) => !seen.includes(i.id)).map((i) => i.id);
// the id after moving by `step` cells (arrows: ±1, ±cols); clamps at both ends; unknown current = first
export function moveSelection(ids, cur, step) {
  if (!ids.length) return null;
  const i = ids.indexOf(cur);
  return ids[Math.min(ids.length - 1, Math.max(0, (i < 0 ? 0 : i) + step))];
}
const pic = (img, cls, fallback) => (img ? `<span class="${cls}" style="background-image:url('${esc(img).replace(/'/g, "%27")}')"></span>` : `<span class="${cls} iv-nopic">${esc(String(fallback || "？").slice(0, 2))}</span>`);

// the object card (U19): the photo card (photo + name + description + why) and, SEPARATE from it, the protagonist's feeling
// as its own bordered block (the inner-voice card, 未然調書's 物の見え方). Stacked vertically by default (portrait / narrow);
// { side: true } puts the feeling beside the photo card on wide containers. Data shape unchanged: { photo, title, text, feeling }.
export function viewItemHtml({ photo, title, text, feeling, tag, why, meta, side } = {}, L = INV_LABELS) {
  const card = `<div class="iv-photocard">${pic(photo, "iv-photo", title)}<div class="iv-info">${tag ? `<em class="iv-tag">${esc(tag)}</em>` : ""}<b class="iv-name">${esc(title || "")}</b>${meta ? `<span class="iv-meta">${esc(meta)}</span>` : ""}${text ? `<p class="iv-text">${esc(text)}</p>` : ""}${why ? `<p class="iv-why"><span>${esc(L.why)}</span>${esc(why)}</p>` : ""}</div></div>`;
  const voice = feeling ? `<aside class="iv-voice" aria-label="${esc(L.feeling)}"><span class="iv-voice-l">${esc(L.feeling)}</span><p class="iv-feel">「${esc(feeling)}」</p></aside>` : "";
  return `<div class="iv-view${side ? " iv-side" : ""}">${card}${voice}</div>`;
}
// as an element (appended to `parent` when given); the same card everywhere
export function viewItem(o = {}, parent = null, L = INV_LABELS) {
  const el = document.createElement("div");
  el.className = "iv iv-card";
  el.innerHTML = viewItemHtml(o, L);
  if (parent) parent.appendChild(el);
  return el;
}
export const cellHtml = (i, { sel = false, fresh = false, pick = false, L = INV_LABELS } = {}) =>
  `<button type="button" class="iv-cell${sel ? " sel" : ""}${pick ? " pick" : ""}" role="option" aria-selected="${sel}" data-id="${esc(i.id)}" title="${esc(i.name)}">${pic(i.img, "iv-th", i.name)}<span class="iv-nm">${esc(i.name)}</span>${i.count > 1 ? `<span class="iv-n">×${i.count}</span>` : ""}${fresh ? `<span class="iv-new">${esc(L.newb)}</span>` : ""}</button>`;

const safeStorage = () => {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
};

export function createInventory(o = {}) {
  const tabs = o.tabs || [];
  const L = { ...INV_LABELS, ...(o.labels || {}) };
  const storage = o.storage === undefined ? safeStorage() : o.storage;
  const skey = `inventory.${o.name || "main"}`;
  const st = { sel: null, tab: o.tab || tabs[0]?.id || null, seen: [] };
  try {
    const d = JSON.parse((storage && storage.getItem(skey)) || "null");
    if (d && Array.isArray(d.seen)) st.seen = d.seen;
  } catch {}
  const save = () => {
    try {
      storage && storage.setItem(skey, JSON.stringify({ seen: st.seen }));
    } catch {}
  };
  const subs = [];
  const emit = () => (gfEmit("inventory", "change", { sel: st.sel, tab: st.tab }), subs.forEach((f) => f()));
  const all = () => ownedItems(typeof o.items === "function" ? o.items() : o.items, o.getOwned ? o.getOwned() : []);
  const shown = () => itemsInTab(all(), st.tab, tabs);
  let host = null;
  const api = {
    state: st,
    pick: null,
    on: (ev, fn) => (ev === "change" && subs.push(fn), api),
    items: all,
    shown,
    fresh: () => freshIds(all(), st.seen),
    badge: () => api.fresh().length,
    selected: () => all().find((i) => i.id === st.sel) || null,
    markSeen(id) {
      if (id && !st.seen.includes(id)) ((st.seen = [...st.seen, id]), save(), emit());
    },
    select(id, rerender = true) {
      const it = all().find((i) => i.id === id);
      if (!it) return api;
      if (it.tab && tabs.length) st.tab = it.tab; // a related item on another tab
      st.sel = id;
      if (rerender && host) api.render(host.el);
      return api;
    },
    setTab(t) {
      st.tab = t;
      st.sel = null;
      if (host) api.render(host.el);
      return api;
    },
    use: () => api.selected() && o.onUse && o.onUse(api.selected(), api),
    examine: () => api.selected() && o.onExamine && o.onExamine(api.selected(), api),
    // keys for the game's own handler: arrows move (cols = grid columns), Enter / Space = use or examine, Q / R = tabs
    keydown(code, cols = 4) {
      if ((code === "KeyQ" || code === "KeyR") && tabs.length) {
        const i = tabs.findIndex((t) => t.id === st.tab);
        api.setTab(tabs[(i + (code === "KeyR" ? 1 : tabs.length - 1)) % tabs.length].id);
        return true;
      }
      const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -cols, ArrowDown: cols }[code];
      if (step) {
        const id = moveSelection(shown().map((i) => i.id), st.sel, step);
        if (id) api.select(id);
        return true;
      }
      if (code === "Enter" || code === "Space") {
        const it = api.selected();
        if (!it) return false;
        it.canUse === false || !o.onUse ? api.examine() : api.use();
        return true;
      }
      return false;
    },
    render(el = host && host.el) {
      if (!el) return null;
      host = { el };
      const list = all();
      const cur = shown();
      if (!cur.some((i) => i.id === st.sel)) st.sel = cur[0]?.id || null;
      const it = cur.find((i) => i.id === st.sel) || null;
      const fresh = new Set(freshIds(list, st.seen));
      const counts = tabs.length ? tabCounts(list, tabs) : {};
      fresh.delete(st.sel); // the item being looked at is marked seen below: no NEW tag on it, so the tags, the tab's new count and the menu badge agree
      const tabsHtml = tabs.length ? `<nav class="hb-tabs iv-tabs" role="tablist">${tabs.map((t) => `<button type="button" role="tab" class="hb-tab${t.id === st.tab ? " on" : ""}" data-tab="${esc(t.id)}">${esc(t.label)}${(() => { const n = list.filter((i) => (i.tab || tabs[0].id) === t.id && fresh.has(i.id)).length; return n ? `<i class="jr-dot iv-newn" aria-label="new">${n}</i>` : ""; })()}<span class="cnt">${counts[t.id]}</span></button>`).join("")}</nav>` : "";
      const grid = cur.length ? cur.map((i) => cellHtml(i, { sel: i.id === st.sel, fresh: fresh.has(i.id), pick: api.pick === i.id, L })).join("") : `<p class="iv-empty">${esc(list.length ? L.emptyTab : L.empty)}</p>`;
      let detail = `<p class="iv-empty">${esc(L.hint)}</p>`;
      let acts = "";
      const extra = it && o.actions ? o.actions(it) || [] : [];
      if (it) {
        detail = viewItemHtml({ photo: it.img, title: it.name, text: it.desc, feeling: it.feeling, why: it.why, tag: it.tag, meta: it.meta }, L);
        const rel = (it.related || []).map((r) => list.find((x) => x.id === r)).filter(Boolean);
        acts = `${it.canUse !== false && o.onUse ? `<button type="button" class="btn primary" data-act="use">${esc(it.useLabel || L.use)}</button>` : ""}${o.onExamine && it.examine !== false ? `<button type="button" class="btn" data-act="examine">${esc(it.examineLabel || L.examine)}</button>` : ""}${extra.map((a, n) => `<button type="button" class="btn ${esc(a.cls || "")}" data-extra="${n}">${esc(a.t)}</button>`).join("")}${rel.length ? `<span class="iv-rel"><small>${esc(L.related)}</small>${rel.map((r) => `<button type="button" class="iv-chip" data-rel="${esc(r.id)}">${pic(r.img, "iv-th s", r.name)}${esc(r.name)}</button>`).join("")}</span>` : ""}`;
      }
      const gridTop = (el.querySelector(".iv-grid") || {}).scrollTop || 0;
      el.innerHTML = `<div class="iv iv-inv">${tabsHtml}${api.pick ? `<div class="iv-pickmsg">${esc(L.pick)}</div>` : ""}<div class="iv-main"><div class="iv-grid" role="listbox" aria-label="${esc(L.title)}">${grid}</div><div class="iv-detail">${detail}<div class="iv-acts">${acts}</div></div></div></div>`;
      const g = el.querySelector(".iv-grid");
      if (g) g.scrollTop = gridTop;
      el.querySelectorAll("[data-tab]").forEach((b) => (b.onclick = () => api.setTab(b.dataset.tab)));
      el.querySelectorAll(".iv-cell").forEach((b) => {
        b.onclick = () => {
          const id = b.dataset.id;
          if (api.pick && id !== api.pick) {
            const from = api.pick;
            api.pick = null;
            return o.onPick ? o.onPick(from, id, api) : api.render(el);
          }
          if (st.sel === id && !api.pick) return api.keydown("Enter"); // a second tap acts
          api.pick = null;
          api.select(id);
        };
      });
      el.querySelectorAll("[data-act]").forEach((b) => (b.onclick = () => (b.dataset.act === "use" ? api.use() : api.examine())));
      el.querySelectorAll("[data-extra]").forEach((b) => (b.onclick = () => extra[+b.dataset.extra] && extra[+b.dataset.extra].fn && extra[+b.dataset.extra].fn(api)));
      el.querySelectorAll("[data-rel]").forEach((b) => (b.onclick = () => (o.onRelated ? o.onRelated(b.dataset.rel, list.find((x) => x.id === b.dataset.rel), api) : api.select(b.dataset.rel))));
      if (it) api.markSeen(it.id); // looking at it makes it no longer new (the badge stays until the next render)
      return el;
    },
    open(ui, title = L.title, sub = "") {
      const w = ui.window("inventory", esc(title), esc(sub), { wide: true, cls: "hb-win iv-win" });
      api.render(w.body);
      ui.buttons(w.foot, [{ t: L.close, fn: () => ui.close() }]);
      return w;
    },
    mountButton(parent = document.body, label = L.title) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "jn-hud iv-hud";
      const paint = () => (b.setAttribute("aria-label", label), (b.title = label), (b.innerHTML = `${icon("items", { size: 22 })}<span class="hud-lb">${esc(label)}</span>${api.badge() ? '<i class="jr-dot"></i>' : ""}`));
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
  gfRegister("inventory", () => ({
    snapshot: () => ({ tab: st.tab, tabs: tabs.map((t) => t.id), selected: st.sel, owned: all().map((i) => i.id), shown: shown().map((i) => i.id), fresh: api.fresh(), badge: api.badge(), seen: st.seen.slice(), pick: api.pick ? (api.pick.id || true) : null }),
    drive(action, a = {}) {
      switch (action) {
        case "select": if (!all().some((i) => i.id === a.id)) return gfFail(`not owned "${a.id}"`); api.select(a.id); return gfOk({ selected: st.sel, tab: st.tab });
        case "setTab": if (!tabs.some((t) => t.id === a.id)) return gfFail(`unknown tab "${a.id}"`); api.setTab(a.id); return gfOk({ tab: st.tab });
        case "use": if (!api.selected()) return gfFail("nothing selected"); api.use(); gfEmit("inventory", "use", { id: st.sel }); return gfOk({ id: st.sel });
        case "examine": if (!api.selected()) return gfFail("nothing selected"); api.examine(); gfEmit("inventory", "examine", { id: st.sel }); return gfOk({ id: st.sel });
        case "markSeen": api.markSeen(a.id); return gfOk({ seen: st.seen.slice() });
        case "key": api.keydown(a.code, a.cols); return gfOk({ selected: st.sel });
        default: return gfUnknown(action);
      }
    },
    reset() { st.sel = null; st.tab = o.tab || tabs[0]?.id || null; st.seen = []; api.pick = null; },
  }));
  return api;
}
