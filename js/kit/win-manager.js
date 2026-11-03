/* game-kit 4b9f6fa: js/win-manager.js — edit in game-kit and run tools/kit-sync.js */
// The window manager of the standard UI shell (rules U12 / U14 / U21): ONE window at a time, a fixed size per breakpoint
// (never changed by tabs or content: the content scrolls inside), larger on big screens (>= 900 x 700), ALWAYS top-anchored
// (windows shown one after another keep their top edge in one place: a size s window after a size m one does not jump down),
// a text-only window (no picture, table, input, tabs) shrinks to its text (fit: true / false forces it), generous margins incl. the safe-area insets, a header bar (title + ⓘ + ×), Esc closes,
// the focus is trapped inside, mouse + touch (buttons >= 44px). 'open' / 'close' events let the game pause.
// The inner-voice (thought) line is a separate bottom band (U14): the window layer sits ABOVE it in z-order but its area ends
// where the band starts, so the two never overlap. Style: css/kit.css wm-* (theme tokens --gf-*, with fallbacks).
//
//   const wm = createWindowManager({ container: document.body, thought: "#thought", onPause: (p) => (p ? fp.release() : fp.lock()) });
//   wm.register("notes", () => ({ title: "メモ", info: "説明文", render: (body, ctx) => { body.innerHTML = "..."; } }));
//   wm.open("notes");                                   // or wm.open("x", { title, render, size: "s" | "m" | "l", info, locked, onClose })
//   wm.on("open", (id) => ...); wm.on("close", (id) => ...); wm.close(); wm.current; wm.isOpen;
//   wm.setBand(px)  // the height of the inner-voice band when it is not an element  /  wm.resize()
// Without a document (node) the state machine and the events still run (the DOM parts are skipped): that is what the tests use.

import { icon } from "./icons.js";
import { gfRegister, gfEmit, gfOk, gfFail, gfUnknown } from "./gf-test.js";
export const WM_LABELS = { close: "閉じる", info: "説明", back: "戻る" };
export const WM_SIZES = { s: { w: 560, h: 460 }, m: { w: 800, h: 620 }, l: { w: 1040, h: 720 } };
export const WM_LARGE = { w: 900, h: 700 }; // a viewport at least this big is "large"
// On large screens the named sizes grow with the viewport (a PC window uses the screen; the preset is the floor): fraction of the viewport, capped.
export const WM_GROW = { s: { fw: 0.5, fh: 0.64, w: 880, h: 780 }, m: { fw: 0.62, fh: 0.78, w: 1200, h: 920 }, l: { fw: 0.8, fh: 0.88, w: 1520, h: 1020 } };

export const HUD_COMPACT = { w: 600, h: 500, closedW: 240, closedFrac: 0.45, openW: 340, openFrac: 0.6, fullW: 340, fullFrac: 0.62 };
// The top-left HUD column (STEP card, goal chip, menu button): compact on small screens (< 600 wide, < 500 tall, or touch) so it never covers the view (pure).
// compact + closed = a row of small chips (max 45% of the width), compact + open (the STEP card tapped) = max 60%; big screens keep the full column.
export function hudLayout(vw, vh, { touch = false, open = false } = {}) {
  const compact = !!touch || vw < HUD_COMPACT.w || vh < HUD_COMPACT.h;
  const H = HUD_COMPACT;
  const maxW = compact ? Math.round(Math.min(vw * (open ? H.openFrac : H.closedFrac), open ? H.openW : H.closedW)) : Math.round(Math.min(H.fullW, vw * H.fullFrac));
  return { compact, open: compact && !!open, maxW };
}
export const PHONE_SHORT = 500, PHONE_ZOOM = 1.18; // windows on a phone: the text bigger (standard 1.10.16)
export const isLarge = (vw, vh) => vw >= WM_LARGE.w && vh >= WM_LARGE.h;
// The fixed window size for a viewport (pure). `band` = the inner-voice band height at the bottom (kept free).
// Large: centred, the preset size grown with the viewport (WM_GROW; a custom {w,h} stays exact), margin 32. Small: a full-screen SHEET (the whole screen minus the margin / safe-area insets, margin 16, 12 on short
// landscapes; the band is ignored: the thought line is hidden behind it and the window must never shrink to a strip).
export function windowSize(vw, vh, { size = "m", band = 0 } = {}) {
  const custom = typeof size === "object" && size;
  const base = custom ? { w: size.w || WM_SIZES.m.w, h: size.h || WM_SIZES.m.h } : WM_SIZES[size] || WM_SIZES.m;
  const large = isLarge(vw, vh);
  const g = !custom && large ? WM_GROW[WM_SIZES[size] ? size : "m"] : null;
  const preset = g ? { w: Math.round(Math.max(base.w, Math.min(g.w, vw * g.fw))), h: Math.round(Math.max(base.h, Math.min(g.h, vh * g.fh))) } : base;
  // text grows a little with a big window (1 at 800px tall, up to 1.25); on a phone (short side < 500 px) it is PHONE_ZOOM (feedback
  // 2026-11-04 出口はこちらです「携帯でダイアログが小さく文字が見えない」: 15 px is about 2.5 mm on a phone)
  const zoom = large ? Math.round(Math.max(1, Math.min(1.25, vh / 800)) * 100) / 100 : Math.min(vw, vh) < PHONE_SHORT ? PHONE_ZOOM : 1;
  const margin = large ? 32 : vh < 520 ? 12 : 16;
  const freeW = Math.max(240, vw - margin * 2);
  const bandKept = large ? band || 0 : 0;
  const freeH = Math.max(200, vh - bandKept - margin * 2);
  return { mode: large ? "large" : "small", margin, w: large ? Math.min(preset.w, freeW) : freeW, h: large ? Math.min(preset.h, freeH) : freeH, band: bandKept, zoom };
}
// the next focus target for a Tab press inside a trap of `n` focusable elements (pure; -1 = none focused)
// a window body that holds only text and buttons (no picture, canvas, video, table, form field or tab menu) fits its height to the text
const MEDIA = "img, canvas, video, iframe, table, textarea, select, input:not([type=button]):not([type=submit]), .tm, .wm-flush, :not(button) > svg";
// a picture in a window is never blown up past 1.3x its own pixels (a big PC window made 448-720 px photos look rough; 1.10.9). SVG scales freely.
export const IMG_UPSCALE = 1.3;
export const imgCap = (naturalW) => (naturalW > 1 ? `min(100%, ${Math.round(naturalW * IMG_UPSCALE)}px)` : "");
function capImages(body) {
  if (!body.querySelectorAll) return;
  for (const im of body.querySelectorAll("img:not([data-wm-cap])")) {
    im.setAttribute("data-wm-cap", "");
    if (/\.svg(\?|#|$)|^data:image\/svg/i.test(im.getAttribute("src") || "")) continue;
    const f = () => { if (!im.style.maxWidth && imgCap(im.naturalWidth)) im.style.maxWidth = imgCap(im.naturalWidth); };
    if (im.complete) f();
    else im.addEventListener("load", f, { once: true });
  }
}
export const textOnly = (body) => !!body && !body.querySelector(MEDIA);
export const trapIndex = (cur, n, shift) => (n <= 0 ? -1 : shift ? (cur <= 0 ? n - 1 : cur - 1) : cur < 0 || cur >= n - 1 ? 0 : cur + 1);

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const hasDom = () => typeof document !== "undefined" && !!document.body;

export function createWindowManager(o = {}) {
  const L = { ...WM_LABELS, ...(o.labels || {}) };
  const subs = { open: [], close: [] };
  const defs = new Map();
  let cur = null; // { id, opts, layer, win, body, head, titleEl, opener }
  let band = 0;
  let warming = false; // (perf) windows opened by warm() are painted for real but invisible, and make no 'open' / 'close' event and no pause
  const emit = (ev, ...a) => (gfEmit("winManager", ev, { id: a[0] }), subs[ev].forEach((f) => f(...a)));
  const dom = () => hasDom() && o.root !== null;
  const parent = () => o.container || (typeof document !== "undefined" ? document.body : null);

  function bandPx() {
    if (typeof o.thought === "function") return o.thought() || 0;
    const t = typeof o.thought === "string" && hasDom() ? document.querySelector(o.thought) : o.thought;
    if (t && t.getBoundingClientRect && t.getClientRects().length) {
      const r = t.getBoundingClientRect();
      const vh = typeof innerHeight === "number" ? innerHeight : 0;
      const cs = typeof getComputedStyle === "function" ? getComputedStyle(t) : null;
      if (cs && (+cs.opacity === 0 || cs.visibility === "hidden" || !String(t.textContent || "").trim())) return band; // an empty / faded thought line keeps nothing free
      if (r.height > 0 && vh) return Math.max(0, vh - r.top);
    }
    return band;
  }
  function layout() {
    if (!cur || !cur.layer) return;
    const vw = typeof innerWidth === "number" ? innerWidth : 1280;
    const vh = typeof innerHeight === "number" ? innerHeight : 720;
    const z = windowSize(vw, vh, { size: cur.opts.size, band: bandPx() });
    const st = cur.layer.style;
    st.setProperty("--wm-w", `${z.w}px`);
    st.setProperty("--wm-h", `${z.h}px`);
    st.setProperty("--wm-m", `${z.margin}px`);
    st.setProperty("--wm-band", `${z.band}px`);
    st.setProperty("--wm-zoom", String(z.zoom || 1));
    cur.layer.dataset.mode = z.mode;
    refit();
  }
  function refit() {
    if (!cur || !cur.layer || !cur.body) return;
    capImages(cur.body);
    const f = cur.opts.fit;
    cur.layer.classList.toggle("wm-fit", f === true || (f !== false && !cur.body.classList.contains("wm-flush") && textOnly(cur.body)));
  }
  const onResize = () => layout();

  function focusables() {
    return cur && cur.win ? [...cur.win.querySelectorAll(FOCUSABLE)].filter((e) => e.offsetParent !== null || e === document.activeElement) : [];
  }
  function onKey(e) {
    if (!cur) return;
    if (e.code === "Escape" || e.key === "Escape") {
      if (cur.opts.locked) return cur.opts.onEsc && cur.opts.onEsc();
      e.preventDefault();
      e.stopPropagation();
      api.close();
      return;
    }
    if (e.key === "Tab" && !e.defaultPrevented && cur.win) {
      const f = focusables();
      if (!f.length) return;
      const i = f.indexOf(document.activeElement);
      const inside = cur.win.contains(document.activeElement);
      const n = trapIndex(inside ? i : -1, f.length, e.shiftKey);
      // only take over at the ends (or when the focus escaped): the normal order is kept in between
      if (!inside || (e.shiftKey && i <= 0) || (!e.shiftKey && i >= f.length - 1)) {
        e.preventDefault();
        f[n].focus();
      }
    }
  }

  function build(id, opts) {
    const layer = document.createElement("div");
    layer.className = `wm-layer wm-${id}`.replace(/[^\w -]/g, "") + (warming ? " wm-warm" : "");
    layer.innerHTML = `<div class="wm-win" role="dialog" aria-modal="true" aria-label="${esc(String(opts.title || ""))}"><header class="wm-head"><h2 class="wm-title">${esc(opts.title || "")}</h2>${opts.info ? `<button type="button" class="wm-btn wm-info" aria-label="${esc(L.info)}" aria-expanded="false" title="${esc(L.info)}">${icon("info", { size: 22 })}</button>` : ""}<button type="button" class="wm-btn wm-x" aria-label="${esc(L.close)}" title="${esc(L.close)}">${icon("close", { size: 22 })}</button></header>${opts.info ? `<div class="wm-infobox" hidden>${opts.infoHtml ? opts.info : esc(opts.info)}</div>` : ""}<div class="wm-body"></div></div>`;
    const win = layer.querySelector(".wm-win");
    const x = layer.querySelector(".wm-x");
    x.addEventListener("click", () => !opts.locked && api.close());
    if (opts.locked) x.hidden = true;
    const ib = layer.querySelector(".wm-info");
    if (ib)
      ib.addEventListener("click", () => {
        const box = layer.querySelector(".wm-infobox");
        box.hidden = !box.hidden;
        ib.setAttribute("aria-expanded", String(!box.hidden));
      });
    layer.addEventListener("pointerdown", (e) => {
      if (e.target === layer && !opts.locked && opts.backdropClose !== false) api.close();
    });
    return { layer, win, body: layer.querySelector(".wm-body"), titleEl: layer.querySelector(".wm-title") };
  }

  const api = {
    L,
    get current() {
      return cur ? cur.id : null;
    },
    get isOpen() {
      return !!cur;
    },
    get body() {
      return cur ? cur.body : null;
    },
    on(ev, fn) {
      if (subs[ev]) subs[ev].push(fn);
      return api;
    },
    register(id, factory) {
      defs.set(id, factory);
      return api;
    },
    has: (id) => defs.has(id),
    setBand(px) {
      band = Math.max(0, +px || 0);
      layout();
      return api;
    },
    resize: () => (layout(), api),
    // replace the text of the ⓘ box of the open window (a screen whose explanation depends on its state); the window must have been opened with an info
    setInfo(html, isHtml = true) {
      const box = cur && cur.layer && cur.layer.querySelector(".wm-infobox");
      if (box) box[isHtml ? "innerHTML" : "textContent"] = html;
      return !!box;
    },
    setTitle(t) {
      if (cur) {
        cur.opts.title = t;
        if (cur.titleEl) cur.titleEl.textContent = t;
        if (cur.win) cur.win.setAttribute("aria-label", t);
      }
      return api;
    },
    // open(id, opts): opts override what register(id, factory) returned. { title, render(body, ctx), size, info, locked, onClose, onEsc }
    open(id, opts = {}) {
      const def = defs.get(id);
      const made = typeof def === "function" ? def(opts) : def || {};
      const merged = { ...made, ...opts };
      if (!def && !merged.render) throw new Error(`win-manager: unknown window "${id}"`);
      // a window opened by a key press ([E] on a thing): that press ends here, so the new window's own key handlers never see it and
      // close the window again at once (miru-fusha 1.6.0: [E] on the projector opened the reels and the same E closed them)
      const ev = typeof window !== "undefined" ? window.event : null;
      if (ev && ev.type === "keydown") ev.stopPropagation();
      const wasOpen = !!cur;
      if (cur) closeCurrent(true);
      cur = { id, opts: merged, layer: null, win: null, body: null, opener: hasDom() ? document.activeElement : null, warm: warming };
      if (dom()) {
        const b = build(id, merged);
        Object.assign(cur, b);
        parent().appendChild(b.layer);
        layout();
        addEventListener("resize", onResize);
        document.addEventListener("keydown", onKey, true);
      }
      const ctx = { id, wm: api, body: cur.body, close: () => api.close(), setTitle: api.setTitle };
      if (!wasOpen && o.onPause && !warming) o.onPause(true);
      if (!warming) emit("open", id);
      if (merged.render && cur.body) merged.render(cur.body, ctx);
      else if (merged.render) merged.render(null, ctx);
      if (dom() && cur && cur.body) {
        refit();
        if (typeof MutationObserver === "function") (cur.mo = new MutationObserver(refit)).observe(cur.body, { childList: true, subtree: true });
      }
      if (dom() && cur && !cur.win.contains(document.activeElement)) {
        const first = cur.body.querySelector("[autofocus]") || cur.win.querySelector(".wm-x:not([hidden])") || cur.win;
        if (!first.hasAttribute("tabindex") && first === cur.win) first.setAttribute("tabindex", "-1");
        first.focus && first.focus({ preventScroll: true });
      }
      return api;
    },
    close() {
      closeCurrent(false);
      return api;
    },
    // warm(fn): run fn() (async) with every window it opens flagged "warm": the layer is invisible (opacity .001, class wm-warm) but really laid out and painted,
    // so the first real open does not pay for style / layout / font glyphs / image decode. No open / close events and no onPause (the game does not notice).
    // Pair it with `await frames(2)` between opening and closing so a frame is actually produced.
    async warm(fn) {
      const prev = warming;
      warming = true;
      const had = hasDom() && document.body.classList.contains("gf-warming");
      if (hasDom()) document.body.classList.add("gf-warming");
      try {
        return await fn(api);
      } finally {
        if (cur && cur.warm) closeCurrent(true);
        warming = prev;
        if (!had && hasDom()) document.body.classList.remove("gf-warming");
      }
    },
    get warming() {
      return warming;
    },
    destroy() {
      closeCurrent(true);
      subs.open.length = subs.close.length = 0;
    },
  };

  function closeCurrent(replacing) {
    if (!cur) return;
    const w = cur;
    cur = null;
    if (w.mo) w.mo.disconnect();
    if (w.layer) {
      removeEventListener("resize", onResize);
      document.removeEventListener("keydown", onKey, true);
      w.layer.remove();
    }
    if (w.opts.onClose) w.opts.onClose(w.id);
    if (!w.warm) emit("close", w.id);
    if (!replacing && !w.warm) {
      if (o.onPause) o.onPause(false);
      try {
        w.opener && w.opener.focus && w.opener.focus({ preventScroll: true });
      } catch {
        /* ignore */
      }
    }
  }
  // test hooks (docs/testing.md); never run unless ?gftest=1
  gfRegister("winManager", () => ({
    snapshot: () => ({ open: !!cur, current: cur ? cur.id : null, title: cur && cur.titleEl ? cur.titleEl.textContent : cur ? String(cur.opts.title || "") : "", size: cur && cur.layer ? { w: parseInt(cur.layer.style.getPropertyValue("--wm-w"), 10) || 0, h: parseInt(cur.layer.style.getPropertyValue("--wm-h"), 10) || 0 } : null, registered: [...defs.keys()], warming, band }),
    drive(action, a = {}) {
      switch (action) {
        case "open": if (!defs.has(a.id) && !a.render) return gfFail(`unknown window "${a.id}"`); api.open(a.id, { ...(a.opts || {}), ...(a.render ? { render: a.render } : {}) }); return gfOk({ current: api.current });
        case "close": api.close(); return gfOk();
        case "escape": if (!cur) return gfFail("no window open"); document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true })); return gfOk({ open: !!cur });
        case "clickClose": return cur && cur.layer && cur.layer.querySelector(".wm-x") ? (cur.layer.querySelector(".wm-x").click(), gfOk()) : gfFail("no close button");
        case "setTitle": api.setTitle(String(a.title || "")); return gfOk();
        case "setBand": api.setBand(a.px); return gfOk();
        default: return gfUnknown(action);
      }
    },
    reset: () => closeCurrent(true),
  }));
  return api;
}
