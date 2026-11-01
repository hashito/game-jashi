/* game-kit 6e0b6f0: js/tab-menu.js — edit in game-kit and run tools/kit-sync.js */
// The TAB MENU of the standard UI shell (rule U20): one window (js/win-manager.js) with the tabs
// 所持品 / 目標とタスク / 気になること・写真 / 地図 (+ the game's own tabs via registerTab). Tab key or the HUD button opens it,
// Q / R or ← → switch tabs, each tab shows a badge (new items, unseen notes). The tasks are IN the tab menu (not only behind
// another key). The content is rendered by the existing parts: createInventory (inventory-ui), createJournal (journal-ui),
// ProgressUI.taskScreenHTML (progress-ui). The map is a SLOT: the game registers it with registerTab (the map module,
// js/map-svg.js, is not imported here).
//
//   const tm = createTabMenu({ wm, inventory: inv, journal: jr, progress: pui, key: "Tab" });
//   tm.registerTab({ id: "map", label: "地図", icon: "map", render: (el, ctx) => map.mount(el), badge: () => 0, onShow, onHide });
//   tm.registerTab({ id: "radio", label: "無線", icon: "radio", render: (el) => {...}, after: "tasks" });   // a game's extra tab
//   tm.open("tasks"); tm.toggle(); tm.close(); tm.mountButton(hudEl); tm.badge(); tm.on("tab", (id) => ...)
//
// Tab def: { id, label, icon?, render(el, ctx), badge?: () => number|boolean, onShow?, onHide?, onKey?(code) -> bool, focus?: css selector
// of the element to re-focus after a keyboard action, after?: id to sit after (default: appended) }.
// Map slot contract (agent A2's js/map-svg.js): render(el, ctx) mounts into `el` (it owns that element until onHide / the next render);
// ctx = { id, tm, wm, body, setBadge }. The map must size itself to `el` (the tab content is a fixed-size scroll box) and not add Esc/Tab handlers.
// Keys: Tab / Esc close (Tab only when the focus is on the tab bar or the page, so Tab still moves between buttons inside a tab);
// Q / R always switch tabs; ← → switch tabs while the tab bar has the focus, otherwise they go to the tab's onKey (the inventory grid);
// ↓ from the tab bar moves into the content.
import { esc } from "./ui.js";
import { icon, iconOrText } from "./icons.js";
import { gfRegister, gfEmit, gfOk, gfFail, gfUnknown } from "./gf-test.js";

export const TM_LABELS = { title: "メニュー", items: "所持品", tasks: "目標とタスク", notes: "気になること・写真", map: "地図", noMap: "地図はまだ使えません。", noTasks: "いまのタスクはありません。", info: "Tab か Esc で閉じます。Q と R、または ← → でタブを切り替えます。↓ で中身に進みます。", hud: "メニュー" };
export const TM_ICONS = { items: "items", tasks: "tasks", notes: "notes", map: "map" }; // icon names (js/icons.js); a game tab may pass an icon name or any text

// the id of the tab `step` away (wraps); unknown current = first (pure)
export function stepTab(ids, cur, step) {
  if (!ids.length) return null;
  const i = ids.indexOf(cur);
  return ids[(((i < 0 ? 0 : i) + step) % ids.length + ids.length) % ids.length];
}
// insert a def after `after` (or append); a def with the same id replaces in place (pure)
export function placeTab(list, def) {
  const at = list.findIndex((t) => t.id === def.id);
  if (at >= 0) return list.map((t, i) => (i === at ? { ...t, ...def } : t));
  const next = list.slice();
  const to = def.after ? next.findIndex((t) => t.id === def.after) : -1;
  next.splice(to >= 0 ? to + 1 : next.length, 0, def);
  return next;
}
export const badgeValue = (def) => {
  try {
    const b = def.badge ? def.badge() : 0;
    return b === true ? 1 : +b || 0;
  } catch {
    return 0;
  }
};
// should the Tab key toggle the menu? (pure: the focus is on the page, the tab bar or nothing)
export const tabKeyToggles = (activeTag, inTabBar) => !activeTag || activeTag === "BODY" || !!inTabBar;

export function createTabMenu(o = {}) {
  const wm = o.wm;
  if (!wm) throw new Error("tab-menu: wm (a window manager) is required");
  const L = { ...TM_LABELS, ...(o.labels || {}) };
  let tabs = [];
  let active = o.tab || "items";
  let hostEl = null;
  const subs = { tab: [], change: [] };
  const emit = (ev, ...a) => (gfEmit("tabMenu", ev, { arg: typeof a[0] === "string" ? a[0] : null }), subs[ev].forEach((f) => f(...a)));
  const hasDom = typeof document !== "undefined" && !!document.body;

  const api = {
    L,
    get tabs() {
      return tabs.slice();
    },
    get active() {
      return active;
    },
    get isOpen() {
      return wm.current === "tab-menu";
    },
    on(ev, fn) {
      if (subs[ev]) subs[ev].push(fn);
      return api;
    },
    registerTab(def) {
      if (!def || !def.id) throw new Error("tab-menu: a tab needs an id");
      tabs = placeTab(tabs, { icon: TM_ICONS[def.id], ...def });
      if (api.isOpen) paint();
      return api;
    },
    removeTab(id) {
      tabs = tabs.filter((t) => t.id !== id);
      if (active === id) active = tabs[0]?.id;
      return api;
    },
    badge: () => tabs.reduce((n, t) => n + badgeValue(t), 0),
    badges: () => Object.fromEntries(tabs.map((t) => [t.id, badgeValue(t)])),
    setTab(id) {
      if (!tabs.some((t) => t.id === id)) return api;
      const prev = tabs.find((t) => t.id === active);
      if (api.isOpen && prev && prev.onHide && prev.id !== id) prev.onHide();
      active = id;
      emit("tab", id);
      if (api.isOpen) paint();
      return api;
    },
    open(id) {
      if (id && tabs.some((t) => t.id === id)) active = id;
      if (!tabs.some((t) => t.id === active)) active = tabs[0]?.id;
      wm.open("tab-menu", {});
      return api;
    },
    close() {
      if (api.isOpen) wm.close();
      return api;
    },
    toggle() {
      return api.isOpen ? api.close() : api.open();
    },
    // keys for the game's own handler too (returns true when used)
    keydown(code) {
      if (!api.isOpen) return false;
      const ids = tabs.map((t) => t.id);
      const to = { KeyQ: -1, KeyR: 1 }[code];
      if (to) return (api.setTab(stepTab(ids, active, to)), true);
      return false;
    },
    mountButton(parent = hasDom ? document.body : null, label = L.hud) {
      if (!parent) return null;
      const b = document.createElement("button");
      b.type = "button";
      b.className = "tm-hud";
      b.setAttribute("aria-label", label);
      b.title = label;
      const paint2 = () => (b.innerHTML = `${icon("terminal", { size: 24 })}<span class="tm-hud-lb"> ${esc(label)}</span>${api.badge() ? '<i class="tm-dot" aria-label="new"></i>' : ""}`);
      paint2();
      b.addEventListener("click", () => api.toggle());
      subs.change.push(paint2);
      parent.appendChild(b);
      return b;
    },
    refresh() {
      if (api.isOpen) paintBadges();
      emit("change");
      return api;
    },
  };

  // ---- built-in tabs from the existing parts ----
  const inv = o.inventory, jr = o.journal, pg = o.progress;
  if (inv)
    api.registerTab({ id: "items", label: L.items, badge: () => inv.badge(), focus: ".iv-cell.sel", onKey: (c) => inv.keydown(c, gridCols()), render: (el) => inv.render(el) });
  if (pg || o.tasks)
    api.registerTab({ id: "tasks", label: L.tasks, render: (el) => (o.tasks ? o.tasks(el) : (el.innerHTML = `<div class="pg tm-tasks">${pg.taskScreenHTML ? pg.taskScreenHTML() : `<p class="tm-empty">${esc(L.noTasks)}</p>`}</div>`)) });
  if (jr)
    api.registerTab({ id: "notes", label: L.notes, badge: () => jr.badge(), render: (el) => jr.render(el) });
  if (!tabs.some((t) => t.id === "map"))
    api.registerTab({ id: "map", label: L.map, render: (el) => (el.innerHTML = `<p class="tm-empty">${esc(L.noMap)}</p>`) });
  (o.tabs || []).forEach((t) => api.registerTab(t));
  if (inv && inv.on) inv.on("change", () => api.refresh());
  if (jr && jr.on) jr.on("change", () => api.refresh());
  if (pg && pg.p && pg.p.on) pg.p.on("update", () => api.isOpen && active === "tasks" && paintContent());

  function gridCols() {
    const g = hostEl && hostEl.querySelector(".iv-grid");
    if (!g || !g.firstElementChild) return 4;
    const first = g.firstElementChild.offsetTop;
    let n = 0;
    for (const c of g.children) if (c.offsetTop === first) n++;
    return Math.max(1, n);
  }

  // ---- DOM ----
  function shell(body) {
    hostEl = body;
    body.classList.add("wm-flush");
    body.innerHTML = `<div class="tm"><nav class="tm-tabs" role="tablist" aria-label="${esc(L.title)}"></nav><div class="tm-content" role="tabpanel"></div></div>`;
    body.querySelector(".tm-tabs").addEventListener("click", (e) => {
      const b = e.target.closest("[data-tm]");
      if (b) api.setTab(b.dataset.tm);
    });
    paint();
  }
  function paintBadges() {
    if (!hostEl) return;
    hostEl.querySelectorAll("[data-tm]").forEach((b) => {
      const t = tabs.find((x) => x.id === b.dataset.tm);
      const n = t ? badgeValue(t) : 0;
      const dot = b.querySelector(".tm-badge");
      if (dot) {
        dot.hidden = !n;
        dot.textContent = n > 1 ? String(n) : "";
        dot.classList.toggle("dot", n === 1);
      }
    });
  }
  function paintTabs() {
    const nav = hostEl.querySelector(".tm-tabs");
    const hadFocus = nav.contains(document.activeElement);
    nav.innerHTML = tabs
      .map((t) => {
        const n = badgeValue(t);
        return `<button type="button" role="tab" class="tm-tab${t.id === active ? " on" : ""}" data-tm="${esc(t.id)}" aria-label="${esc(t.label)}" title="${esc(t.label)}" aria-selected="${t.id === active}" tabindex="${t.id === active ? 0 : -1}">${t.icon ? `<span class="tm-ic" aria-hidden="true">${iconOrText(t.icon, { size: 22 })}</span>` : ""}<span class="tm-lb">${esc(t.label)}</span><i class="tm-badge${n === 1 ? " dot" : ""}"${n ? "" : " hidden"}>${n > 1 ? n : ""}</i></button>`;
      })
      .join("");
    if (hadFocus) nav.querySelector(".tm-tab.on")?.focus({ preventScroll: true });
  }
  function paintContent() {
    const t = tabs.find((x) => x.id === active);
    const el = hostEl.querySelector(".tm-content");
    el.dataset.tab = active;
    el.scrollTop = 0;
    el.innerHTML = "";
    if (t && t.render) t.render(el, { id: t.id, tm: api, wm, body: el, setBadge: () => paintBadges() });
    if (t && t.onShow) t.onShow(el);
    paintBadges();
  }
  function paint() {
    if (!hostEl || !hasDom) return;
    paintTabs();
    paintContent();
  }

  // ---- keys (document, capture: the menu is a modal window) ----
  function onKey(e) {
    if (!api.isOpen || e.defaultPrevented) return;
    const ae = document.activeElement;
    const inBar = !!(ae && ae.closest && ae.closest(".tm-tabs"));
    const inContent = !!(ae && ae.closest && ae.closest(".tm-content"));
    if (e.code === "KeyQ" || e.code === "KeyR") {
      if (/INPUT|TEXTAREA|SELECT/.test(ae?.tagName || "")) return;
      e.preventDefault();
      api.keydown(e.code);
      return;
    }
    if (e.key === "Tab" && !e.shiftKey && tabKeyToggles(ae && ae.tagName, inBar)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      api.close();
      return;
    }
    if (inBar && (e.code === "ArrowLeft" || e.code === "ArrowRight")) {
      e.preventDefault();
      api.setTab(stepTab(tabs.map((t) => t.id), active, e.code === "ArrowRight" ? 1 : -1));
      return;
    }
    if (inBar && e.code === "ArrowDown") {
      e.preventDefault();
      const c = hostEl.querySelector(".tm-content");
      const t = tabs.find((x) => x.id === active);
      const target = (t && t.focus && c.querySelector(t.focus)) || c.querySelector(FOCUS) || c;
      if (!target.hasAttribute("tabindex") && target === c) c.setAttribute("tabindex", "-1");
      target.focus({ preventScroll: true });
      return;
    }
    if (inContent && /^Arrow/.test(e.code)) {
      const t = tabs.find((x) => x.id === active);
      if (e.code === "ArrowUp" && !t?.onKey) return;
      if (t && t.onKey && t.onKey(e.code)) {
        e.preventDefault();
        if (t.focus) hostEl.querySelector(`.tm-content ${t.focus}`)?.focus({ preventScroll: true });
      }
    }
  }
  const FOCUS = 'button:not([disabled]), input, select, textarea, [href]';

  wm.register("tab-menu", () => ({
    title: L.title,
    info: L.info,
    size: "l",
    render: (body) => {
      if (!body) return; // no document (node tests): state only
      shell(body);
      body.querySelector(".tm-tab.on")?.focus({ preventScroll: true });
    },
    onClose: () => {
      const t = tabs.find((x) => x.id === active);
      if (t && t.onHide) t.onHide();
      hostEl = null;
    },
  }));
  if (hasDom) document.addEventListener("keydown", onKey, true);
  // the opening key (ignored while typing, or while another window is open)
  const openKey = o.key === undefined ? "Tab" : o.key;
  if (hasDom && openKey)
    document.addEventListener("keydown", (e) => {
      if (e.code !== openKey || e.repeat || e.defaultPrevented || api.isOpen || wm.isOpen) return;
      if (/INPUT|TEXTAREA|SELECT/.test((e.target && e.target.tagName) || "")) return;
      if (o.canOpen && !o.canOpen()) return;
      e.preventDefault();
      api.open();
    });
  gfRegister("tabMenu", () => ({
    snapshot: () => ({ open: api.isOpen, active, tabs: tabs.map((t) => ({ id: t.id, label: t.label })), badges: api.badges(), badge: api.badge() }),
    drive(action, a = {}) {
      switch (action) {
        case "open": api.open(a.tab || a.id); return gfOk({ active, open: api.isOpen });
        case "close": api.close(); return gfOk();
        case "toggle": api.toggle(); return gfOk({ open: api.isOpen });
        case "setTab": if (!tabs.some((t) => t.id === a.id)) return gfFail(`unknown tab "${a.id}"`); api.setTab(a.id); return gfOk({ active });
        case "key": return gfOk({ used: api.keydown(a.code) });
        case "refresh": api.refresh(); return gfOk();
        default: return gfUnknown(action);
      }
    },
    reset() { api.close(); active = tabs[0] && tabs[0].id; },
  }));
  return api;
}
