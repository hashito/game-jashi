/* game-kit 6e0b6f0: js/pause-menu.js — edit in game-kit and run tools/kit-sync.js */
// The standard PAUSE MENU of the UI shell (rule U21): one window (js/win-manager.js) with generous margins and 44px+ buttons:
// 再開 / 目標とタスク / 気になること / 地図 / 設定（揺れ・点滅を抑える・音量）/ 更新情報 / タイトルへ. Keyboard: ↑↓ (Home / End) move,
// Enter acts, Esc resumes. The three tab entries open the tab menu (js/tab-menu.js) on that tab; 更新情報 shows the
// release-notes list (js/release-notes.js) inside this window; 設定 is a sub-view. Games add their own entries with registerItem.
//
//   const pm = createPauseMenu({ wm, tabMenu: tm, releaseNotes: rn, onTitle: () => location.href = "./", onResume,
//                                onSettings: (s) => audio.setVolume(s.volume), storage: localStorage, key: "KeyP" });
//   pm.registerItem({ id: "save", label: "セーブ", icon: "save", after: "map", run: (ctx) => save() });          // acts (closes the menu unless it returns false)
//   pm.registerItem({ id: "help", label: "操作", render: (el, ctx) => { el.innerHTML = "..."; } });           // a sub-view with a back button
//   createPauseMenu({ ..., renderSettings: (el, pm) => el.append(qualitySelect(look)) })   // (1.1) extra rows in the settings view
//   pm.open(); pm.close(); pm.toggle(); pm.settings; pm.setSetting("volume", 0.4); pm.registerItem({ ..., hidden: () => bool })
// Settings: { calm (揺れを抑える), noFlash (点滅を抑える), volume 0..1, hudAlpha "normal" | "dense" | "light" (HUD の透明度 -> html[data-gf-hud]) } are kept in storage ("gf.settings"); they also set
// document.documentElement.dataset.gfCalm / gfNoFlash ("1" | absent) and --gf-volume, so CSS can react (shake / flash effects
// should check them). Esc with nothing open opens this menu (escOpens, default on); a game that opens it from pointer-lock loss calls pm.open().
import { esc } from "./ui.js";
import { iconOrText } from "./icons.js";
import { stepTab } from "./tab-menu.js";
import { gfRegister, gfEmit, gfOk, gfFail, gfUnknown } from "./gf-test.js";

export const PM_LABELS = {
  title: "一時停止", resume: "再開", tasks: "目標とタスク", notes: "気になること", map: "地図", settings: "設定", releases: "更新情報", toTitle: "タイトルへ",
  back: "← 戻る", calm: "揺れを抑える", calmNote: "画面の揺れ・ゆらぎを小さくします。", noFlash: "点滅を抑える", noFlashNote: "光の点滅・明滅を止めます。", volume: "音量", hudAlpha: "画面の表示の透け具合", hudAlphaNote: "画面の上にあるボタンや表示の、透け具合です。", hudNormal: "標準", hudDense: "濃い", hudLight: "薄い",
  confirmTitle: "タイトルへ戻りますか？", confirmNote: "まだ保存していない進み具合は、消えてしまうことがあります。", yes: "戻る", no: "続ける", info: "↑↓ で選んで、Enter で決めます。Esc で再開します。",
};
export const HUD_ALPHAS = ["normal", "dense", "light"];
export const DEFAULT_SETTINGS = { calm: false, noFlash: false, volume: 0.8, hudAlpha: "normal" };

// stored / typed values -> valid settings (pure)
export function normalizeSettings(v = {}) {
  const vol = +v.volume;
  return { hudAlpha: HUD_ALPHAS.includes(v.hudAlpha) ? v.hudAlpha : "normal", calm: !!v.calm, noFlash: !!v.noFlash, volume: Number.isFinite(vol) && v.volume !== null && v.volume !== "" ? Math.min(1, Math.max(0, Math.round(vol * 100) / 100)) : DEFAULT_SETTINGS.volume };
}
// roving index for ↑↓ / Home / End over n entries (pure; wraps)
export function menuMove(cur, n, key) {
  if (n <= 0) return -1;
  if (key === "Home") return 0;
  if (key === "End") return n - 1;
  return stepTab(Array.from({ length: n }, (_, i) => i), cur < 0 ? 0 : cur, key === "ArrowUp" ? -1 : 1);
}
export { placeTab as placeItem } from "./tab-menu.js";
import { placeTab } from "./tab-menu.js";

const safeStorage = () => {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
};

export function createPauseMenu(o = {}) {
  const wm = o.wm;
  if (!wm) throw new Error("pause-menu: wm (a window manager) is required");
  const L = { ...PM_LABELS, ...(o.labels || {}) };
  const storage = o.storage === undefined ? safeStorage() : o.storage;
  const skey = o.settingsKey || "gf.settings";
  const hasDom = typeof document !== "undefined" && !!document.body;
  let settings = { ...DEFAULT_SETTINGS };
  try {
    settings = normalizeSettings(JSON.parse((storage && storage.getItem(skey)) || "{}"));
  } catch {
    /* blocked or broken storage: defaults */
  }
  let items = [];
  let view = "menu"; // "menu" | "settings" | "releases" | "confirm" | item id
  let body = null;

  const tab = (id) => () => (o.tabMenu ? (o.tabMenu.open(id), true) : false);
  const base = [
    { id: "resume", label: L.resume, icon: "play", primary: true, run: () => true },
    { id: "tasks", label: L.tasks, icon: "tasks", run: tab("tasks"), hidden: () => !o.tabMenu || !o.tabMenu.tabs.some((t) => t.id === "tasks") },
    { id: "notes", label: L.notes, icon: "notes", run: tab("notes"), hidden: () => !o.tabMenu || !o.tabMenu.tabs.some((t) => t.id === "notes") },
    { id: "map", label: L.map, icon: "map", run: tab("map"), hidden: () => !o.tabMenu || !o.tabMenu.tabs.some((t) => t.id === "map") },
    { id: "settings", label: L.settings, icon: "settings", view: "settings" },
    { id: "releases", label: L.releases, icon: "releases", view: "releases", badge: () => !!(o.releaseNotes && o.releaseNotes.hasUnseen()), hidden: () => !o.releaseNotes },
    { id: "title", label: L.toTitle, icon: "home", view: "confirm", hidden: () => !o.onTitle },
  ];
  items = base;

  function applySettings() {
    if (!hasDom) return;
    const d = document.documentElement;
    settings.calm ? (d.dataset.gfCalm = "1") : delete d.dataset.gfCalm;
    settings.noFlash ? (d.dataset.gfNoFlash = "1") : delete d.dataset.gfNoFlash;
    settings.hudAlpha && settings.hudAlpha !== "normal" ? (d.dataset.gfHud = settings.hudAlpha) : delete d.dataset.gfHud; // css/theme.css html[data-gf-hud=dense|light]
    d.style.setProperty("--gf-volume", String(settings.volume));
  }
  applySettings();

  const visible = () => items.filter((i) => !(i.hidden && i.hidden()));
  const api = {
    L,
    get settings() {
      return { ...settings };
    },
    get isOpen() {
      return wm.current === "pause-menu";
    },
    get items() {
      return visible().map((i) => i.id);
    },
    registerItem(def) {
      if (!def || !def.id) throw new Error("pause-menu: an item needs an id");
      items = placeTab(items, def);
      if (api.isOpen && view === "menu") paint();
      return api;
    },
    removeItem(id) {
      items = items.filter((i) => i.id !== id);
      return api;
    },
    setSetting(k, v) {
      if (!(k in DEFAULT_SETTINGS)) return api;
      settings = normalizeSettings({ ...settings, [k]: v });
      try {
        storage && storage.setItem(skey, JSON.stringify(settings));
      } catch {
        /* storage blocked */
      }
      applySettings();
      if (o.onSettings) o.onSettings({ ...settings }, k);
      return api;
    },
    open(v = "menu") {
      view = v;
      wm.open("pause-menu", {});
      return api;
    },
    close() {
      if (api.isOpen) wm.close();
      return api;
    },
    toggle() {
      return api.isOpen ? api.close() : api.open();
    },
    // activate an entry (what Enter / a tap does); the pure path the tests use
    activate(id) {
      const it = visible().find((i) => i.id === id);
      if (!it) return false;
      gfEmit("pauseMenu", "activate", { id });
      if (it.view) return (view = it.view), api.isOpen && paint(), true;
      if (it.render) return (view = it.id), api.isOpen && paint(), true;
      const keep = it.run ? it.run({ pm: api, wm }) : true;
      if (id === "resume" || keep !== false) {
        // an entry that opened another window (the tab menu) replaced this one already
        if (api.isOpen) api.close();
        if (id === "resume" && o.onResume) o.onResume();
      }
      return true;
    },
  };

  function paint() {
    if (!body) return;
    const head = (t) => wm.setTitle(t);
    if (view === "menu") {
      head(L.title);
      body.innerHTML = `<div class="pm"><ul class="pm-list" role="menu">${visible()
        .map((i) => {
          const b = i.badge ? i.badge() : 0;
          return `<li role="none"><button type="button" role="menuitem" class="pm-item${i.primary ? " primary" : ""}" data-pm="${esc(i.id)}"><span class="pm-ic" aria-hidden="true">${iconOrText(i.icon || "", { size: 22 })}</span><span class="pm-lb">${esc(i.label)}</span>${b ? '<i class="pm-dot"></i>' : ""}</button></li>`;
        })
        .join("")}</ul></div>`;
      body.querySelectorAll("[data-pm]").forEach((b) => (b.onclick = () => api.activate(b.dataset.pm)));
      body.querySelector(".pm-item")?.focus({ preventScroll: true });
      return;
    }
    const back = `<button type="button" class="pm-back" data-back>${esc(L.back)}</button>`;
    const toMenu = () => ((view = "menu"), paint());
    if (view === "settings") {
      head(L.settings);
      body.innerHTML = `<div class="pm pm-sub">${back}<div class="pm-set"><label class="pm-row"><input type="checkbox" data-s="calm"${settings.calm ? " checked" : ""}><span><b>${esc(L.calm)}</b><small>${esc(L.calmNote)}</small></span></label><label class="pm-row"><input type="checkbox" data-s="noFlash"${settings.noFlash ? " checked" : ""}><span><b>${esc(L.noFlash)}</b><small>${esc(L.noFlashNote)}</small></span></label><label class="pm-row pm-vol"><span><b>${esc(L.volume)}</b><small data-vol>${Math.round(settings.volume * 100)}%</small></span><input type="range" min="0" max="100" step="5" data-s="volume" value="${Math.round(settings.volume * 100)}" aria-label="${esc(L.volume)}"></label><label class="pm-row pm-sel"><span><b>${esc(L.hudAlpha)}</b><small>${esc(L.hudAlphaNote)}</small></span><select data-s="hudAlpha" aria-label="${esc(L.hudAlpha)}">${HUD_ALPHAS.map((k) => `<option value="${k}"${settings.hudAlpha === k ? " selected" : ""}>${esc(L[{ normal: "hudNormal", dense: "hudDense", light: "hudLight" }[k]])}</option>`).join("")}</select></label></div></div>`;
      // (standard 1.1) the game's own rows in the settings (画質 / 視点の速さ ...): o.renderSettings(el, api) appends to the settings box
      if (o.renderSettings) { const box = body.querySelector(".pm-set"); if (box) try { o.renderSettings(box, api); } catch (e) { console.error(e); } }
      body.querySelectorAll("select[data-s]").forEach((sel) => (sel.onchange = () => api.setSetting(sel.dataset.s, sel.value)));
      body.querySelectorAll("input[data-s]").forEach((inp) => {
        inp.oninput = inp.onchange = () => {
          const k = inp.dataset.s;
          api.setSetting(k, k === "volume" ? +inp.value / 100 : inp.checked);
          const v = body.querySelector("[data-vol]");
          if (v) v.textContent = `${Math.round(settings.volume * 100)}%`;
        };
      });
    } else if (view === "releases") {
      head(L.releases);
      body.innerHTML = `<div class="pm pm-sub">${back}<div class="pm-rel">${o.releaseNotes ? o.releaseNotes.html() : ""}</div></div>`;
      if (o.releaseNotes) o.releaseNotes.markSeen();
    } else if (view === "confirm") {
      head(L.confirmTitle);
      body.innerHTML = `<div class="pm pm-sub"><p class="pm-note">${esc(L.confirmNote)}</p><div class="pm-yn"><button type="button" class="pm-item primary" data-no>${esc(L.no)}</button><button type="button" class="pm-item" data-yes>${esc(L.yes)}</button></div></div>`;
      body.querySelector("[data-no]").onclick = toMenu;
      body.querySelector("[data-yes]").onclick = () => (api.close(), o.onTitle && o.onTitle());
      body.querySelector("[data-no]").focus({ preventScroll: true });
      return;
    } else {
      const it = items.find((i) => i.id === view);
      head(it ? it.label : L.title);
      body.innerHTML = `<div class="pm pm-sub">${back}<div class="pm-custom"></div></div>`;
      if (it && it.render) it.render(body.querySelector(".pm-custom"), { pm: api, wm, back: toMenu });
    }
    body.querySelector("[data-back]").onclick = toMenu;
    body.querySelector("[data-back]").focus({ preventScroll: true });
  }

  function onKey(e) {
    if (!api.isOpen || e.defaultPrevented) return;
    if (view === "menu" || view === "confirm") {
      const btns = [...body.querySelectorAll(".pm-item")];
      if (/^Arrow(Up|Down)$|^(Home|End)$/.test(e.key)) {
        e.preventDefault();
        const to = menuMove(btns.indexOf(document.activeElement), btns.length, e.key);
        btns[to]?.focus({ preventScroll: true });
      }
    }
  }

  wm.register("pause-menu", () => ({
    title: L.title,
    info: L.info,
    size: "s",
    render: (b) => {
      body = b;
      paint();
    },
    onClose: () => {
      body = null;
      view = "menu";
    },
  }));
  // Esc in a sub-view goes back first (the window manager closes on Esc: intercept before it)
  if (hasDom) {
    document.addEventListener(
      "keydown",
      (e) => {
        if (api.isOpen && e.code === "Escape" && view !== "menu") {
          e.preventDefault();
          e.stopImmediatePropagation();
          view = "menu";
          paint();
          return;
        }
        onKey(e);
      },
      true
    );
    document.addEventListener("keydown", (e) => {
      if (e.repeat || e.defaultPrevented || wm.isOpen) return;
      if (/INPUT|TEXTAREA|SELECT/.test((e.target && e.target.tagName) || "")) return;
      if (o.canOpen && !o.canOpen()) return;
      const k = o.key === undefined ? "KeyP" : o.key;
      if ((k && e.code === k) || (o.escOpens !== false && e.code === "Escape")) {
        e.preventDefault();
        api.open();
      }
    });
  }
  gfRegister("pauseMenu", () => ({
    snapshot: () => ({ open: api.isOpen, view, items: api.items, settings: { ...settings } }),
    drive(action, a = {}) {
      switch (action) {
        case "open": api.open(a.view || "menu"); return gfOk({ open: api.isOpen });
        case "close": api.close(); return gfOk();
        case "toggle": api.toggle(); return gfOk({ open: api.isOpen });
        case "activate": return api.activate(a.id) ? gfOk({ open: api.isOpen, view }) : gfFail(`unknown item "${a.id}"`);
        case "setSetting": if (!(a.key in DEFAULT_SETTINGS)) return gfFail(`unknown setting "${a.key}"`); api.setSetting(a.key, a.value); return gfOk({ settings: { ...settings } });
        default: return gfUnknown(action);
      }
    },
    reset() { api.close(); view = "menu"; },
  }));
  return api;
}
