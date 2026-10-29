/* game-kit 2a9373b: js/gf-test.js — edit in game-kit and run tools/kit-sync.js */
// The test hook registry of the shared modules (docs/testing.md). OFF by default: with no `?gftest=1` (and no `window.__gfTest = true`) every call
// here returns at once and the hook factories are never run, so a shipped game pays nothing.
//
//   import { gfRegister, gfEmit } from "./gf-test.js";
//   gfRegister("winManager", () => ({ snapshot: () => ({ open: api.isOpen }), drive: (action, args) => ..., seed: (n) => {}, reset: () => {} }));
//   gfEmit("winManager", "open", { id });                        // an entry in window.__gf.events
//
// window.__gf = { version, modules: { <name>: { snapshot(), drive(action, args), seed(n), reset() } }, list(), snapshot(), drive(module, action, args),
//   clock, rng, events, emit(), shot(label), shots, reset(), selfCheck() }
// Rules: drive() returns { ok: true, ... } or { ok: false, error: "..." } and never throws; snapshot() returns plain JSON (no DOM nodes, no functions).
export const GF_VERSION = 1;

const g = typeof globalThis !== "undefined" ? globalThis : {};
export function gfEnabled() {
  try {
    if (g.__gfTest === true) return true;
    return typeof location !== "undefined" && /[?&]gftest(=(1|true|on))?(&|#|$)/.test(location.search);
  } catch { return false; }
}

// ---- seeded RNG (mulberry32): the same seed gives the same numbers on every machine ----
export function mulberry32(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- virtual clock: install() replaces Date.now / performance.now / setTimeout / setInterval / requestAnimationFrame; advance(ms) runs what is due ----
export function createClock() {
  let t = 0, seq = 0, installed = false, saved = null;
  const q = []; // { id, at, fn, every }
  const add = (fn, ms, every) => { const id = ++seq; q.push({ id, at: t + Math.max(0, +ms || 0), fn, every }); return id; };
  const del = (id) => { const i = q.findIndex((x) => x.id === id); if (i >= 0) q.splice(i, 1); };
  const api = {
    now: () => t,
    get installed() { return installed; },
    get pending() { return q.length; },
    setTimeout: (fn, ms) => add(fn, ms),
    setInterval: (fn, ms) => add(fn, Math.max(1, +ms || 1), Math.max(1, +ms || 1)),
    clear: del,
    advance(ms = 16) {
      const end = t + Math.max(0, +ms || 0);
      for (let guard = 0; guard < 100000; guard++) {
        q.sort((a, b) => a.at - b.at || a.id - b.id);
        const n = q[0];
        if (!n || n.at > end) break;
        t = n.at;
        if (n.every) n.at += n.every; else q.shift();
        try { n.fn(t); } catch (e) { gfEmit("clock", "error", { message: String(e && e.message || e) }); }
      }
      t = end;
      return t;
    },
    install() {
      if (installed) return api;
      installed = true;
      saved = { dn: Date.now, pn: g.performance && g.performance.now, st: g.setTimeout, ct: g.clearTimeout, si: g.setInterval, ci: g.clearInterval, raf: g.requestAnimationFrame, caf: g.cancelAnimationFrame };
      const base = saved.dn.call(Date);
      Date.now = () => base + t;
      if (g.performance) g.performance.now = () => t;
      g.setTimeout = (fn, ms, ...a) => add(() => fn(...a), ms);
      g.clearTimeout = (id) => del(id);
      g.setInterval = (fn, ms, ...a) => add(() => fn(...a), Math.max(1, +ms || 1), Math.max(1, +ms || 1));
      g.clearInterval = (id) => del(id);
      g.requestAnimationFrame = (fn) => add(fn, 16);
      g.cancelAnimationFrame = (id) => del(id);
      return api;
    },
    uninstall() {
      if (!installed) return api;
      installed = false;
      Date.now = saved.dn;
      if (g.performance && saved.pn) g.performance.now = saved.pn;
      Object.assign(g, { setTimeout: saved.st, clearTimeout: saved.ct, setInterval: saved.si, clearInterval: saved.ci, requestAnimationFrame: saved.raf, cancelAnimationFrame: saved.caf });
      return api;
    },
    reset() { q.length = 0; t = 0; return api; },
  };
  return api;
}

// ---- the registry ----
const EVENT_CAP = 1000;
let reg = null;
function build() {
  const modules = {};
  const events = [];
  const shots = [];
  const clock = createClock();
  let rngFn = mulberry32(1), seedN = 1;
  const rng = {
    seed(n = 1) { seedN = n >>> 0; rngFn = mulberry32(seedN); Object.values(modules).forEach((m) => { try { m.seed && m.seed(n); } catch { /* a module may ignore the seed */ } }); return seedN; },
    next: () => rngFn(),
    get current() { return seedN; },
  };
  const api = {
    version: GF_VERSION,
    modules,
    events,
    shots,
    clock,
    rng,
    list: () => Object.keys(modules),
    snapshot: () => Object.fromEntries(Object.entries(modules).map(([k, m]) => [k, safe(() => m.snapshot())])),
    drive(name, action, args) {
      const m = modules[name];
      if (!m) return { ok: false, error: `no module "${name}"` };
      try {
        const r = m.drive(action, args);
        return r && typeof r === "object" && "ok" in r ? r : { ok: true, value: r };
      } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
    },
    emit(module, type, data) {
      events.push({ t: clock.now(), module, type, data: data === undefined ? null : data });
      if (events.length > EVENT_CAP) events.splice(0, events.length - EVENT_CAP);
    },
    eventsOf: (module, type) => events.filter((e) => (!module || e.module === module) && (!type || e.type === type)),
    // a screenshot hook: records the label + the state; the runner (tools/cdp.mjs page.shot) takes the picture right after this returns
    shot(label = "") {
      const s = { label, t: clock.now(), w: typeof innerWidth === "number" ? innerWidth : 0, h: typeof innerHeight === "number" ? innerHeight : 0, snapshot: api.snapshot() };
      shots.push(s);
      return s;
    },
    reset() {
      Object.values(modules).forEach((m) => { try { m.reset && m.reset(); } catch { /* ignore */ } });
      events.length = 0; shots.length = 0; clock.reset();
      return true;
    },
    // the generic contract check every registered module must pass (the lab page and tools/selftest.mjs run it)
    selfCheck() {
      const out = [];
      for (const [name, m] of Object.entries(modules)) {
        const r = { module: name, ok: true, problems: [] };
        const bad = (s) => { r.ok = false; r.problems.push(s); };
        for (const f of ["snapshot", "drive", "seed", "reset"]) if (typeof m[f] !== "function") bad(`${f}() is missing`);
        if (r.ok) {
          let s1, s2;
          try { s1 = JSON.stringify(m.snapshot()); s2 = JSON.stringify(m.snapshot()); } catch (e) { bad(`snapshot() is not JSON: ${e.message}`); }
          if (s1 !== undefined && s1 !== s2) bad("snapshot() is not stable between two calls");
          if (s1 === undefined && r.ok) bad("snapshot() returned undefined");
          const d = api.drive(name, "__no_such_action__");
          if (d.ok !== false || !d.error) bad("drive(unknown action) must return { ok: false, error }");
        }
        out.push(r);
      }
      return out;
    },
  };
  return api;
}
const safe = (f) => { try { return f(); } catch (e) { return { error: String(e && e.message || e) }; } };

export function gfInit() {
  if (reg) return reg;
  if (!gfEnabled()) return null;
  reg = build();
  g.__gf = reg;
  try { if (/[?&]gfseed=(\d+)/.test(location.search)) reg.rng.seed(+RegExp.$1); if (/[?&]gfclock(=1|&|$)/.test(location.search)) reg.clock.install(); } catch { /* no location */ }
  return reg;
}
// Register a module. `factory` is only called when the tests are on. Returns an unregister function (a no-op when off). A second registration of
// the same name replaces the first (a game that rebuilds its UI keeps only the live one).
export function gfRegister(name, factory) {
  const r = gfInit();
  if (!r) return () => {};
  const hooks = typeof factory === "function" ? factory() : factory;
  const m = { snapshot: () => ({}), drive: () => ({ ok: false, error: "no drive()" }), seed() {}, reset() {}, ...hooks };
  r.modules[name] = m;
  return () => { if (r.modules[name] === m) delete r.modules[name]; };
}
export function gfEmit(module, type, data) {
  if (reg) reg.emit(module, type, data);
}
// helpers for hook authors
export const gfOk = (extra = {}) => ({ ok: true, ...extra });
export const gfFail = (error) => ({ ok: false, error: String(error) });
export const gfUnknown = (action) => gfFail(`unknown action "${action}"`);
// click a DOM element by selector inside `root`; returns the drive() result
export function gfClick(root, selector) {
  const el = root && root.querySelector ? root.querySelector(selector) : null;
  if (!el) return gfFail(`not found: ${selector}`);
  el.click();
  return gfOk();
}
