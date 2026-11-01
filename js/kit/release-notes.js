/* game-kit 6e0b6f0: js/release-notes.js — edit in game-kit and run tools/kit-sync.js */
// Release notes shared by every game (rule Q10): a window listing what changed, newest first, with a NEW badge for
// entries the player has not seen. Entry points: a small 「更新情報」 link on the title screen (rn-dot when unseen)
// and a pause-menu item. Fixed window size (U12), top-anchored on small screens (U14), tap targets >= 44px, Esc / × closes.
//
//   import { VERSION, NOTES } from "./data/release-notes.js";
//   const rn = createReleaseNotes({ notes: NOTES, version: VERSION, storage: localStorage, key: "mygame.rn" });
//   linkEl.onclick = () => rn.open();  dot.hidden = !rn.hasUnseen();
//   NOTES = [{ version: "1.3.0", date: "2026-10-18", title: "…", items: [{ type: "new|fix|change|balance", text: "…" }] }]  // newest first
import { esc } from "./ui.js";
import { gfRegister, gfEmit, gfOk, gfFail, gfUnknown } from "./gf-test.js";

export const RN_TYPES = { new: "新機能", fix: "修正", change: "変更", balance: "調整" };
export const RN_LABELS = { title: "更新情報", newb: "NEW", close: "閉じる", empty: "更新情報はまだありません。", current: "現在のバージョン" };

// ---- pure parts ----
const parts = (v) => String(v).split(".").map((n) => parseInt(n, 10));
export const isVersion = (v) => typeof v === "string" && /^\d+(\.\d+){0,2}$/.test(v);
export function compareVersions(a, b) {
  const x = parts(a), y = parts(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d < 0 ? -1 : 1; }
  return 0;
}
export const latest = (notes) => (notes || []).reduce((m, n) => (!m || compareVersions(n.version, m.version) > 0 ? n : m), null);
export const isISODate = (d) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d)) && new Date(d).toISOString().slice(0, 10) === d;
// returns a list of problems ([] = fine): versions strictly descending, ISO dates, non-empty items, known types
export function validateNotes(notes) {
  const errs = [];
  if (!Array.isArray(notes)) return ["notes は配列にしてください"];
  notes.forEach((n, i) => {
    const w = `#${i + 1}${n && n.version ? ` (${n.version})` : ""}`;
    if (!n || !isVersion(n.version)) { errs.push(`${w}: version が不正です`); return; } // wording-ok: a build error for the developer
    if (i > 0 && notes[i - 1] && isVersion(notes[i - 1].version) && compareVersions(notes[i - 1].version, n.version) <= 0) errs.push(`${w}: version が前の項目より小さくありません（新しい順）`);
    if (!isISODate(n.date)) errs.push(`${w}: date は YYYY-MM-DD にしてください`);
    if (!Array.isArray(n.items) || !n.items.length) errs.push(`${w}: items が空です`);
    else n.items.forEach((it, j) => {
      if (!it || !RN_TYPES[it.type]) errs.push(`${w} 項目${j + 1}: type は ${Object.keys(RN_TYPES).join("/")} のどれか`);
      if (!it || typeof it.text !== "string" || !it.text.trim()) errs.push(`${w} 項目${j + 1}: text が空です`);
    });
  });
  return errs;
}
// notes newer than the last seen version (all of them when nothing was seen)
export const unseenNotes = (notes, seen) => (notes || []).filter((n) => !seen || compareVersions(n.version, seen) > 0);
export function renderHTML(notes, opts = {}) {
  const labels = { ...RN_LABELS, ...(opts.labels || {}) };
  const list = notes || [];
  if (!list.length) return `<p class="rn-empty">${esc(labels.empty)}</p>`;
  const lat = latest(list);
  return list.map((n) => {
    const open = opts.expandAll || n.version === lat.version;
    const fresh = unseenNotes([n], opts.seen).length > 0;
    const items = (n.items || []).map((it) => `<li class="rn-item"><span class="rn-chip rn-t-${esc(it.type)}">${esc(RN_TYPES[it.type] || it.type)}</span><span class="rn-text">${esc(it.text)}</span></li>`).join("");
    return `<details class="rn-entry"${open ? " open" : ""}><summary class="rn-sum"><span class="rn-ver">v${esc(n.version)}</span><span class="rn-date">${esc(n.date || "")}</span>${n.title ? `<span class="rn-ttl">${esc(n.title)}</span>` : ""}${fresh ? `<span class="rn-new">${esc(labels.newb)}</span>` : ""}</summary><ul class="rn-items">${items}</ul></details>`;
  }).join("");
}

// ---- DOM part ----
const safeStorage = () => { try { return typeof localStorage !== "undefined" ? localStorage : null; } catch { return null; } };
export function createReleaseNotes(o = {}) {
  const notes = o.notes || [];
  const key = o.key || "game.release-notes";
  const storage = o.storage === undefined ? safeStorage() : o.storage;
  const version = o.version || (latest(notes) || {}).version || "";
  const readSeen = () => { try { return (storage && storage.getItem(key)) || null; } catch { return null; } };
  let seen = readSeen();
  let root = null, onKey = null, opener = null, warmOpen = false;
  const api = {
    hasUnseen: () => unseenNotes(notes, seen).length > 0,
    markSeen() {
      const l = latest(notes); if (!l) return;
      seen = l.version;
      try { storage && storage.setItem(key, seen); } catch { /* storage blocked */ }
    },
    get isOpen() { return !!root; },
    // open({ warm: true }): an invisible open for the pre-paint (ui-warm.js): no key handler, no focus, not marked seen, no onOpen / onClose
    open(opt = {}) {
      if (root || typeof document === "undefined") return api;
      warmOpen = !!opt.warm;
      const host = o.container || document.body;
      opener = document.activeElement;
      root = document.createElement("div");
      root.className = "rn-wrap" + (warmOpen ? " rn-warm" : "");
      root.innerHTML = `<div class="rn-win" role="dialog" aria-modal="true" aria-label="${esc(RN_LABELS.title)}"><div class="rn-head"><h2 class="rn-h">${esc(RN_LABELS.title)}</h2>${version ? `<span class="rn-cur">${esc(RN_LABELS.current)} v${esc(version)}</span>` : ""}<button type="button" class="rn-x" aria-label="${esc(RN_LABELS.close)}">×</button></div><div class="rn-body">${renderHTML(notes, { seen })}</div></div>`;
      root.addEventListener("pointerdown", (e) => { if (e.target === root) api.close(); });
      root.querySelector(".rn-x").addEventListener("click", () => api.close());
      onKey = (e) => { if (e.key === "Escape" || e.code === "Escape") { e.preventDefault(); e.stopPropagation(); api.close(); } };
      host.appendChild(root);
      if (warmOpen) return api;
      document.addEventListener("keydown", onKey, true);
      root.querySelector(".rn-x").focus();
      api.markSeen(); // the NEW badges above were drawn from the previous `seen`
      if (o.onOpen) o.onOpen(api);
      return api;
    },
    close() {
      if (!root) return api;
      const warm = warmOpen;
      warmOpen = false;
      document.removeEventListener("keydown", onKey, true);
      root.remove(); root = null;
      if (warm) return api;
      try { opener && opener.focus && opener.focus(); } catch { /* ignore */ }
      if (o.onClose) o.onClose(api);
      return api;
    },
    html: () => renderHTML(notes, { seen }),
  };
  gfRegister("releaseNotes", () => ({
    snapshot: () => ({ open: !!root, version, latest: (latest(notes) || {}).version || null, seen, hasUnseen: api.hasUnseen(), count: notes.length, entries: root ? root.querySelectorAll(".rn-entry").length : 0, newBadges: root ? root.querySelectorAll(".rn-new").length : 0 }),
    drive(action) {
      switch (action) {
        case "open": api.open(); gfEmit("releaseNotes", "open", { version }); return gfOk({ open: !!root });
        case "close": api.close(); return gfOk();
        case "markSeen": api.markSeen(); return gfOk({ seen });
        default: return gfUnknown(action);
      }
    },
    reset() { api.close(); seen = readSeen(); },
  }));
  return api;
}
