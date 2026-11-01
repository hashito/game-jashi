/* game-kit 6e0b6f0: js/hud-slots.js — edit in game-kit and run tools/kit-sync.js */
// HUD slots (rule U27, docs/hud-slots.md): every HUD part has ONE region, so notifications can never sit on the clock, the sensors or the menu.
//
//   tl      top-left stack   goal chip, STEP chip                       (#hud-left, flow, order)
//   tr      top-right stack  ≡ menu, clock, sensors / work chip         (#hud-right, flow, order)
//   tc      notification lane, top centre, BELOW the stacks it would touch (#hs-tc inside #hud-slots; js/toast-lane.js)
//   bc      bottom thought band (#say)                                  (own place; kept clear of the cluster by shell.css)
//   br      bottom-right action cluster (touch: #t-right)               the interaction prompt sits right above it on touch
//
//   registerHudPart('clock', { slot: 'tr', order: 20 });                 // moves #clock into the top-right stack (el: given or by id)
//   registerHudPart('prompt', { slot: 'prompt' });                       // touch: first child of the cluster column; desktop: stays under the crosshair
//   layoutHudSlots();                                                    // measure the stacks, place the lane (also automatic: resize, observers)
//
// Pure helpers (laneBox, overlaps, partsOverlap) are used by tools/check-hud-overlap.mjs and the tests.
export const SLOTS = { tl: "hud-left", tr: "hud-right", tc: "hs-tc", br: "t-right" };
export const LANE_MAX_W = 520;
const GAP = 8;

import { gfRegister, gfOk, gfFail, gfUnknown } from "./gf-test.js";

const hasDom = () => typeof document !== "undefined" && !!document.body;
const PARTS = new Map();   // id -> { id, slot, order, el }
let laneEl = null, rafId = 0, observers = [];

export const intersects = (a, b, eps = 0.5) => a.left < b.right - eps && b.left < a.right - eps && a.top < b.bottom - eps && b.top < a.bottom - eps;

// Pure: where the lane goes. stacks / bottoms: rects { left, right, top, bottom } of visible parts; vw / vh: viewport; safe: { t, r, b, l }.
//   1. screen-centred at the top, when no top part is in its columns (wide screens: the stacks sit at the edges);
//   2. else squeezed into the free corridor between the left and the right stack (>= MIN_W wide), still at the top (short landscape phones);
//   3. else centred BELOW the taller of the stacks it would touch.
// bottom = above the crosshair / prompt / thought band / action cluster parts that share columns with it. Returns { left, width, top, bottom, free, mode }.
export const MIN_W = 220, MIN_FREE = 56;
export function laneBox({ vw, vh, stacks = [], bottoms = [], safe = {}, maxW = LANE_MAX_W, margin = 12 }) {
  const innerL = margin + (safe.l || 0), innerR = vw - margin - (safe.r || 0);
  const W0 = Math.max(120, Math.min(innerR - innerL, maxW));
  const top0 = Math.max(margin, safe.t || 0);
  let left = (vw - W0) / 2, width = W0, top = top0, mode = "top";
  const hits = (l, r) => stacks.filter((s) => s.right > l && s.left < r);
  const limit = (l, w, t) => { let b = vh / 2 - 28; for (const r of bottoms) if (r.right > l && r.left < l + w && r.bottom > t) b = Math.min(b, r.top - GAP); return b; };   // the crosshair and the line under it, the prompt, the band, the cluster
  if (hits(left, left + width).length) {
    const mid = vw / 2;
    const leftSide = stacks.filter((s) => s.left < mid && s.right <= mid + 1), rightSide = stacks.filter((s) => s.right > mid && s.left >= mid - 1);
    const spanning = stacks.some((s) => s.left < mid - 1 && s.right > mid + 1);
    const cl = Math.max(innerL, ...leftSide.map((s) => s.right + GAP)), cr = Math.min(innerR, ...rightSide.map((s) => s.left - GAP));
    const corridor = !spanning && cr - cl >= 140 ? { w: Math.min(W0, cr - cl), l: 0 } : null;
    if (corridor) corridor.l = cl + (cr - cl - corridor.w) / 2;
    let belowTop = top; for (const r of hits(left, left + width)) belowTop = Math.max(belowTop, r.bottom + GAP);
    const belowFree = limit(left, width, belowTop) - belowTop;
    if (corridor && (corridor.w >= MIN_W || belowFree < MIN_FREE)) { width = corridor.w; left = corridor.l; mode = "corridor"; }
    else { mode = "below"; top = belowTop; }
  }
  const bottom = limit(left, width, top);
  return { left, width, top, bottom, free: Math.max(0, bottom - top), mode };
}

const visibleRect = (el) => {
  if (!el || !el.isConnected) return null;
  const cs = getComputedStyle(el);
  if (cs.display === "none" || cs.visibility === "hidden") return null;
  const r = el.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return null;
  // what an ancestor with overflow other than visible clips away is not on screen
  let left = r.left, top = r.top, right = r.right, bottom = r.bottom;
  for (let p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
    const pc = getComputedStyle(p);
    if (pc.overflowX !== "visible" || pc.overflowY !== "visible") { const q = p.getBoundingClientRect(); left = Math.max(left, q.left); top = Math.max(top, q.top); right = Math.min(right, q.right); bottom = Math.min(bottom, q.bottom); }
  }
  if (right - left < 1 || bottom - top < 1) return null;
  return { left, top, right, bottom, width: right - left, height: bottom - top };
};

// The rect of what is really PAINTED: a transparent wrapper (a column like #guide) counts through its visible children, so empty room beside a narrow card is not "HUD".
export function paintedRect(el, depth = 0) {
  const r = visibleRect(el);
  if (!r) return null;
  const cs = getComputedStyle(el);
  const painted = (cs.backgroundColor && !/rgba?\(\s*0,\s*0,\s*0,\s*0\s*\)|transparent/.test(cs.backgroundColor)) || cs.backgroundImage !== "none" || parseFloat(cs.borderTopWidth) > 0 || parseFloat(cs.borderLeftWidth) > 0 || cs.boxShadow !== "none" || /^(IMG|SVG|CANVAS|BUTTON|INPUT)$/i.test(el.tagName) || (el.children.length === 0 && el.textContent.trim());
  if (painted || depth > 4 || !el.children.length) return r;
  let u = null;
  for (const k of el.children) { const q = paintedRect(k, depth + 1); if (q) u = u ? { left: Math.min(u.left, q.left), top: Math.min(u.top, q.top), right: Math.max(u.right, q.right), bottom: Math.max(u.bottom, q.bottom) } : { left: q.left, top: q.top, right: q.right, bottom: q.bottom }; }
  if (!u) return el.textContent.trim() ? r : null;
  return { ...u, width: u.right - u.left, height: u.bottom - u.top };
}

// ensure #hud-slots (holds the lane) inside #hud; mark the two stack containers. Returns { root, lane }.
export function ensureHudSlots(hud) {
  if (!hasDom()) return null;
  hud = hud || document.getElementById("hud") || document.body;
  let root = document.getElementById("hud-slots");
  if (!root) { root = document.createElement("div"); root.id = "hud-slots"; hud.appendChild(root); }
  laneEl = document.getElementById("hs-tc");
  if (!laneEl) { laneEl = document.createElement("div"); laneEl.id = "hs-tc"; laneEl.className = "hs-lane"; root.appendChild(laneEl); }
  for (const [slot, id] of [["tl", SLOTS.tl], ["tr", SLOTS.tr]]) { const c = document.getElementById(id); if (c) c.dataset.hudSlot = slot; }
  if (!observers.length) startObserving();
  registerGf();
  return { root, lane: laneEl };
}
export const laneElement = () => laneEl;

// slot: 'tl' | 'tr' | 'tc' | 'br' | 'bc' | 'prompt'. move: false = keep the element where it is (it is positioned by CSS).
export function registerHudPart(id, o = {}) {
  if (!hasDom()) return null;
  const el = o.el || document.getElementById(id);
  if (!el) return null;
  const slot = o.slot || "tr", order = o.order ?? 50;
  PARTS.set(id, { id, slot, order, el });
  el.dataset.hudPart = id; el.dataset.hudSlot = slot;
  if (o.move !== false) {
    let host = null, first = false;
    if (slot === "tl" || slot === "tr") host = document.getElementById(SLOTS[slot]);
    else if (slot === "tc") host = laneEl || document.getElementById("hs-tc");
    else if (slot === "br") host = document.getElementById("t-right");
    else if (slot === "prompt") {   // touch: first line of the action-cluster column; otherwise (desktop, the input mode changed) back in #hud, under the crosshair
      const cl = document.getElementById("t-right"), touch = document.body.classList.contains("touch") && cl;
      host = touch ? cl : el.parentElement && el.parentElement.id === "t-right" ? document.getElementById("hud") : null; first = !!touch;
    }
    if (host && el.parentElement !== host) { first ? host.prepend(el) : host.appendChild(el); }
    else if (host && first && host.firstChild !== el) host.prepend(el);
  }
  if (slot === "tl" || slot === "tr" || slot === "tc") el.style.order = String(order);
  schedule();
  return el;
}
export function unregisterHudPart(id) { const p = PARTS.get(id); if (p) { delete p.el.dataset.hudPart; PARTS.delete(id); schedule(); } }
export const hudPartIds = () => [...PARTS.keys()];

// the visible HUD parts (registered ones + lane items + the touch controls) as rects, for the overlap check and for the layout
export function hudPartRects() {
  if (!hasDom()) return [];
  const out = [];
  const seen = new Set();
  const add = (id, slot, el) => { if (seen.has(el)) return; const r = paintedRect(el); if (!r) return; const op = parseFloat(getComputedStyle(el).opacity); if (op < 0.05) return; seen.add(el); out.push({ id, slot, el, rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height } }); };
  for (const p of PARTS.values()) add(p.id, p.slot, p.el);
  document.querySelectorAll("[data-hud-part]").forEach((el) => add(el.dataset.hudPart, el.dataset.hudSlot || "tc", el));
  // parts nobody registered still count: every child of the two stacks and of the action cluster, the touch stick, the thought band, the prompt, the crosshair
  const nameOf = (el) => el.id || [...el.classList].find((c) => c && !/^(hidden|show)$/.test(c)) || el.tagName.toLowerCase();
  for (const [slot, cid] of [["tl", SLOTS.tl], ["tr", SLOTS.tr], ["br", SLOTS.br]]) { const c = document.getElementById(cid); if (c) for (const k of c.children) add(`${slot}:${nameOf(k)}`, slot, k); }
  for (const [id, slot] of [["t-stick", "br"], ["say", "bc"], ["prompt", "prompt"], ["crosshair", "center"]]) { const e = document.getElementById(id); if (e && (id !== "prompt" || e.textContent)) add(id, slot, e); }
  for (const p of out) p.wrap = out.some((q) => q !== p && p.el.contains(q.el));   // a column that holds other parts (not an overlap with them)
  return out;
}

// Does anything overlap? parts: hudPartRects() output (or the same shape). Returns [{ a, b }].
export function partsOverlap(parts) {
  const bad = [];
  for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) {
    const a = parts[i], b = parts[j];
    if (a.el && b.el && (a.el.contains(b.el) || b.el.contains(a.el))) continue;   // a part inside another part (the card inside its column) is not an overlap
    if (intersects(a.rect, b.rect)) bad.push({ a: a.id, b: b.id });
  }
  return bad;
}

// Measure the stacks and the bottom parts, place the lane (top, width) and tell the lane how much height it may use (--gf-lane-free).
export function layoutHudSlots() {
  rafId = 0;
  if (!hasDom()) return null;
  const lane = laneEl || document.getElementById("hs-tc");
  if (!lane) return null;
  const rects = (sel) => [...document.querySelectorAll(sel)].map(visibleRect).filter(Boolean);
  const kids = (id) => { const c = document.getElementById(id); return c ? [...c.children].map((k) => paintedRect(k)).filter(Boolean) : []; };
  const stacks = [...kids(SLOTS.tl), ...kids(SLOTS.tr), ...[document.getElementById("t-menu")].map((k) => k && paintedRect(k)).filter(Boolean)];
  const bottoms = [];
  const push = (r) => { if (r) bottoms.push(r); };
  push(visibleRect(document.getElementById("crosshair")));
  const pr = document.getElementById("prompt"); if (pr && pr.textContent) push(visibleRect(pr));
  const tr = document.getElementById("t-right"); if (tr) for (const k of tr.children) push(paintedRect(k));
  push(visibleRect(document.getElementById("t-stick")));
  const say = document.getElementById("say"); if (say && say.classList.contains("on")) push(visibleRect(say));
  const cs = getComputedStyle(document.documentElement);
  const px = (v) => parseFloat(cs.getPropertyValue(v)) || 0;
  const safe = { t: px("--gf-safe-t"), r: px("--gf-safe-r"), b: px("--gf-safe-b"), l: px("--gf-safe-l") };
  const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
  const b = laneBox({ vw, vh, stacks: stacks.map(toRect), bottoms: bottoms.map(toRect), safe });
  // placed with the `translate` property (not left / top): moving it never counts as a layout shift (CLS) and costs no layout
  lane.style.left = "0"; lane.style.top = "0"; lane.style.transform = "none"; lane.style.translate = `${Math.round(b.left)}px ${Math.round(b.top)}px`;
  lane.dataset.mode = b.mode;
  lane.style.setProperty("--gf-lane-w", `${Math.round(b.width)}px`);
  lane.style.setProperty("--gf-lane-free", `${Math.round(b.free)}px`);
  lane.dataset.free = String(Math.round(b.free));
  return b;
}
const toRect = (r) => ({ left: r.left, right: r.right, top: r.top, bottom: r.bottom });

export function schedule() {
  if (rafId || !hasDom()) return;
  rafId = typeof requestAnimationFrame === "function" ? requestAnimationFrame(layoutHudSlots) : (layoutHudSlots(), 0);
}
export const laneFree = () => (laneEl ? parseFloat(laneEl.dataset.free) || 0 : 0);

let listening = false;
function startObserving() {
  if (!listening) { listening = true; addEventListener("resize", schedule); addEventListener("orientationchange", schedule); }
  if (typeof ResizeObserver === "function") {
    const ro = new ResizeObserver(schedule);
    for (const id of ["hud-left", "hud-right", "t-right", "prompt"]) { const e = document.getElementById(id); if (e) ro.observe(e); }
    observers.push(ro);
  }
  if (typeof MutationObserver === "function") {
    const mo = new MutationObserver(schedule);
    for (const id of ["hud-left", "hud-right", "t-right"]) { const e = document.getElementById(id); if (e) mo.observe(e, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "hidden", "style"] }); }
    observers.push(mo);
  }
  schedule();
}
// the containers may be created after ensureHudSlots(): observe them once they exist
export function observeHudContainers() {
  for (const o of observers) o.disconnect?.();
  observers = [];
  startObserving();
}

// ---- stress test hook (tools/check-hud-overlap.mjs, test/hud-slots-browser): every kind of notification at its longest, all at once ----
export const STRESS_TEXT = "とても長い通知の文章がここに入ります。一行に収まらなくても、時計やセンサーやメニューには重ならない。".repeat(2) + "LONGASCIITOKEN_".repeat(6);
export function stressHud({ lane, ui, hooks = [] } = {}) {
  if (!hasDom()) return null;
  for (const f of hooks) { try { f(true); } catch { /* a game part that is not there */ } }
  const T = 600000;
  if (lane) {
    for (let i = 0; i < 4; i++) lane.push({ kind: "toast", html: `${STRESS_TEXT.slice(0, 70 + i * 20)} ${i}`, ttl: T });
    lane.push({ kind: "quest-note", title: "サブ業務を受けた", html: `<b>${STRESS_TEXT.slice(0, 40)}</b><span>${STRESS_TEXT}</span>`, ttl: T });
    lane.push({ kind: "card", title: "入手", html: `<b>${STRESS_TEXT.slice(0, 50)}</b>`, ttl: T });
    lane.sticky("carry-hint", true, STRESS_TEXT);
    lane.push({ kind: "prompt", html: STRESS_TEXT, key: "stress-prompt", ttl: T });
  }
  const pr = document.getElementById("prompt"); if (pr) { pr.textContent = `[E] ${STRESS_TEXT.slice(0, 60)}`; }
  if (ui && ui.say) ui.say(STRESS_TEXT, 600);
  clearInterval(keepTimer);   // the game may say something of its own meanwhile (and switch the line off after 4 s): the stress keeps the thought line on screen
  keepTimer = setInterval(() => { const s = document.getElementById("say"); if (s) s.classList.add("on"); }, 250);
  if (lane && lane.settle) { layoutHudSlots(); lane.settle(); layoutHudSlots(); }   // measured now, not on the next frame
  schedule();
  return { lane: lane ? lane.snapshot() : [] };
}
let keepTimer = 0;
export function unstressHud({ lane, ui, hooks = [] } = {}) {
  clearInterval(keepTimer); keepTimer = 0;
  if (lane) lane.clear();
  const pr = document.getElementById("prompt"); if (pr) pr.textContent = "";
  const say = document.getElementById("say"); if (say) say.classList.remove("on");
  for (const f of hooks) { try { f(false); } catch { /* ignore */ } }
  schedule();
}

// ---- test hooks (docs/testing.md; only with ?gftest=1): window.__gf.modules.hudSlots ----
let TEST = { lane: null, ui: null, hooks: [] };
export function bindHudTest(o) { TEST = { ...TEST, ...o }; }   // game-core / the harness hand over the lane, the KitUI (say) and the game's own "show my HUD parts" hooks
// window.__gfHud (the overlap checker, tools/check-hud-overlap.mjs): stress() shows every notification kind at its longest + the game's own parts, snapshot() lists the visible parts
export function hudTestHooks({ lane, ui, hooks = [] } = {}) {
  bindHudTest({ lane, ui, hooks });
  return {
    lane, parts: hudPartRects, layout: layoutHudSlots,
    overlaps: () => partsOverlap(hudPartRects()).map((p) => `${p.a} x ${p.b}`),
    stress: () => stressHud({ lane, ui, hooks }), unstress: () => unstressHud({ lane, ui, hooks }),
    snapshot: () => ({ lane: lane ? lane.snapshot() : [], free: laneFree(), parts: hudPartRects().map((p) => ({ id: p.id, slot: p.slot, wrap: p.wrap, ...p.rect })) }),
  };
}
let gfDone = false;
function registerGf() {
  if (gfDone) return; gfDone = true;
  gfRegister("hudSlots", () => ({
    snapshot: () => {
      const parts = hudPartRects();
      return { parts: parts.map((p) => ({ id: p.id, slot: p.slot, rect: [p.rect.left, p.rect.top, p.rect.right, p.rect.bottom].map(Math.round) })), overlaps: partsOverlap(parts).map((x) => `${x.a} x ${x.b}`), laneMode: laneEl ? laneEl.dataset.mode || "" : "", laneFree: laneFree(), registered: hudPartIds() };
    },
    drive: (action, a = {}) => {
      switch (action) {
        case "layout": layoutHudSlots(); return gfOk({ free: laneFree(), mode: laneEl ? laneEl.dataset.mode : "" });
        case "stress": stressHud(TEST); layoutHudSlots(); return gfOk({ parts: hudPartRects().length });
        case "unstress": unstressHud(TEST); return gfOk({});
        case "register": { const el = registerHudPart(a.id, { slot: a.slot, order: a.order }); return el ? gfOk({}) : gfFail(`no element "${a.id}"`); }
        default: return gfUnknown(action);
      }
    },
    reset: () => unstressHud(TEST),
  }));
}
