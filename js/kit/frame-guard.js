/* game-kit 8cacc23: js/frame-guard.js — edit in game-kit and run tools/kit-sync.js */
// Frame pacing guard for three.js games: find and remove hitches (カクつき).
// No three.js import (renderer / scene are duck-typed), so the logic runs and is tested in Node.
//  - FrameStats: frame times in a ring buffer, p50 / p95 / p99 / max, a log of hitches with what the frame did
//  - FrameGuard: the per-frame entry point (stats, tags such as 'chunk' 12 ms, long tasks, an on-screen overlay
//    with ?perf, a warning when a shader program is linked after the warm-up, dynamic resolution)
//  - JobQueue: time-sliced work with a per-frame ms budget (chunk builds, uploads, dispose); generators or
//    async jobs that `await q.slice()`
//  - prewarm(): compile every program and upload every texture / buffer behind the loading veil
//  - DynamicResolution: lower / raise the pixel ratio to hold a frame time (with hysteresis)
//  - Pool, smoothDt, auditScene (lights toggled with .visible, huge textures ...)
// See docs/3d-stutter-guide.md.
//
//   const fg = new FrameGuard({ renderer, overlay: FrameGuard.query() });   // ?perf shows the overlay
//   await prewarm(renderer, scene, camera, { extra: [enemyModel, flare] });  // behind the veil
//   fg.armPrograms();                                                        // from now on a new program is a bug
//   const jobs = new JobQueue({ budgetMs: 3 });
//   renderer.setAnimationLoop((t) => { const dt = fg.frame(t); jobs.run(); update(dt); renderer.render(scene, camera); });

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
const probe = () => (typeof window !== "undefined" && window.__perf && typeof window.__perf.mark === "function" && typeof window.__perf.note === "function" ? window.__perf : null);   // a game's own __perf helper is not the probe (heiengo)

// percentile of an array of numbers (q in 0..1), nearest-rank
export function percentile(arr, q) {
  if (!arr.length) return 0;
  const s = Float64Array.from(arr).sort();
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1))];
}

// ---- stats --------------------------------------------------------------------------------------
export class FrameStats {
  // size: frames kept (default 600 = 10 s at 60 Hz); hitchMs: a frame longer than this is logged
  constructor(o = {}) {
    this.size = o.size ?? 600;
    this.hitchMs = o.hitchMs ?? 33.4;
    this.buf = new Float32Array(this.size);
    this.n = 0;
    this.i = 0;
    this.total = 0;
    this.hitches = []; // { t, ms, tags: { chunk: 12 } , label }
    this.maxHitches = o.maxHitches ?? 100;
    this.over33 = 0;
    this.over50 = 0;
    this.max = 0;
  }
  push(ms, tags = null, t = now(), label = "") {
    this.buf[this.i] = ms;
    this.i = (this.i + 1) % this.size;
    this.n = Math.min(this.n + 1, this.size);
    this.total++;
    if (ms > 33.4) this.over33++;
    if (ms > 50) this.over50++;
    if (ms > this.max) this.max = ms;
    if (ms > this.hitchMs) {
      this.hitches.push({ t: Math.round(t), ms: Math.round(ms), tags: tags ? { ...tags } : {}, label });
      if (this.hitches.length > this.maxHitches) this.hitches.shift();
      return true;
    }
    return false;
  }
  values() {
    return Array.from(this.n < this.size ? this.buf.subarray(0, this.n) : this.buf);
  }
  // over the frames in the ring buffer (max / counts: since the start or the last reset)
  summary() {
    const v = this.values();
    const r = (x) => Math.round(x * 10) / 10;
    return { frames: this.total, p50: r(percentile(v, 0.5)), p95: r(percentile(v, 0.95)), p99: r(percentile(v, 0.99)), max: r(this.max), over33: this.over33, over50: this.over50, hitches: this.hitches.length };
  }
  reset() {
    this.n = this.i = this.total = this.over33 = this.over50 = this.max = 0;
    this.hitches.length = 0;
  }
}

// delta time for the simulation: clamp the long frames (a hitch or a background tab must not
// teleport anything), optionally smooth the jitter of rAF timestamps
export function smoothDt(prev, rawSec, o = {}) {
  const max = o.max ?? 1 / 20;
  const k = o.smooth ?? 0; // 0 = no smoothing, 0.1..0.3 = a little
  const d = Math.min(Math.max(rawSec, 0), max);
  return prev > 0 && k > 0 ? prev + (d - prev) * (1 - k) : d;
}

// ---- time-sliced jobs ---------------------------------------------------------------------------
// A job is: a function (run once), a generator function (each `yield` ends a slice) or an async function
// that calls `await q.slice()` between steps. run() is called once per frame and spends at most budgetMs.
export class JobQueue {
  constructor(o = {}) {
    this.budgetMs = o.budgetMs ?? 4;
    this.maxJobs = o.maxJobsPerFrame ?? Infinity; // e.g. 1 for GPU uploads
    this.now = o.now || now;
    this.jobs = []; // { it | fn, res, rej, pri }
    this.waiters = []; // slice() callers waiting for the next frame
    this.t0 = -Infinity; // start of the current frame window
    this.lastRun = -Infinity;
    this.s = { frames: 0, jobs: 0, maxMs: 0, overBudget: 0 };
    this.guard = o.guard || null; // a FrameGuard: the time is tagged as o.tag (default 'jobs')
    this.tag = o.tag || "jobs";
  }
  get pending() {
    return this.jobs.length + this.waiters.length;
  }
  add(job, o = {}) {
    return new Promise((res, rej) => {
      const e = { job, res, rej, pri: o.priority ?? 0, it: null };
      // higher priority first, FIFO within a priority
      let i = this.jobs.length;
      while (i > 0 && this.jobs[i - 1].pri < e.pri) i--;
      this.jobs.splice(i, 0, e);
    });
  }
  // inside async work: resolves now if the frame still has budget, else at the next run()
  slice() {
    const t = this.now();
    if (t - this.t0 < this.budgetMs) return Promise.resolve();
    return new Promise((res) => {
      this.waiters.push(res);
      // nobody calls run() (hidden tab, title screen without a loop): do not hang forever
      if (t - this.lastRun > 250 && typeof setTimeout !== "undefined") setTimeout(() => this.release(), 50);
    });
  }
  release() {
    if (!this.waiters.length) return;
    const w = this.waiters;
    this.waiters = [];
    this.t0 = this.now();
    for (const r of w) r();
  }
  // call once per frame
  run(budgetMs = this.budgetMs) {
    const t0 = this.now();
    this.t0 = t0;
    this.lastRun = t0;
    this.s.frames++;
    // async jobs waiting on slice() continue after this returns (same frame, they check the window)
    const w = this.waiters;
    this.waiters = [];
    for (const r of w) r();
    let done = 0;
    while (this.jobs.length && done < this.maxJobs && this.now() - t0 < budgetMs) {
      const e = this.jobs[0];
      try {
        if (!e.it) {
          const out = e.job();
          if (out && typeof out.next === "function" && typeof out[Symbol.iterator] === "function") e.it = out;
          else {
            this.jobs.shift();
            done++;
            Promise.resolve(out).then(e.res, e.rej);
            continue;
          }
        }
        // a generator: step it until it ends or the budget is used
        let r = e.it.next();
        while (!r.done && this.now() - t0 < budgetMs) r = e.it.next();
        if (r.done) {
          this.jobs.shift();
          done++;
          e.res(r.value);
        } else break;
      } catch (err) {
        this.jobs.shift();
        e.rej(err);
      }
    }
    this.s.jobs += done;
    const ms = this.now() - t0;
    this.s.maxMs = Math.max(this.s.maxMs, ms);
    if (ms > budgetMs * 1.5) this.s.overBudget++;
    if (this.guard && ms > 0.05) this.guard.tag(this.tag, ms);
    return done;
  }
  stats() {
    return { ...this.s, pending: this.pending };
  }
}

// ---- object pool --------------------------------------------------------------------------------
export class Pool {
  constructor(create, reset = null, n = 0) {
    this.create = create;
    this.reset = reset;
    this.free = [];
    this.made = 0;
    for (let i = 0; i < n; i++) this.free.push(this.make());
  }
  make() {
    this.made++;
    return this.create();
  }
  get() {
    return this.free.length ? this.free.pop() : this.make();
  }
  release(o) {
    if (this.reset) this.reset(o);
    this.free.push(o);
  }
}

// ---- dynamic resolution -------------------------------------------------------------------------
// Feed frame times; it returns a new pixel ratio when one should be applied (else null). Goes down after
// `downAfter` s above target * 1.2 (EMA, so one spike does not count), tries going up after `upAfter` s at or
// under the target; a level that had to be left again soon is not retried for a while (no flip-flop).
export class DynamicResolution {
  constructor(o = {}) {
    this.target = o.targetMs ?? 1000 / 60;
    this.max = o.max ?? 1.5;
    this.min = o.min ?? 0.6;
    this.step = o.step ?? 0.15;
    this.downAfter = o.downAfter ?? 1.0;
    this.upAfter = o.upAfter ?? 5.0;
    this.ratio = o.start ?? this.max;
    this.ema = this.target;
    this.bad = 0;
    this.good = 0;
    this.sinceUp = Infinity;
    this.ban = 0; // s during which going up is not tried
    this.changes = 0;
    this.lastDown = null; // { from, ema }: the step down still on trial
  }
  update(dtMs) {
    const dt = Math.min(dtMs, 250) / 1000;
    this.ema += (Math.min(dtMs, 100) - this.ema) * 0.1;
    this.sinceUp += dt;
    this.ban = Math.max(0, this.ban - dt);
    if (this.ema > this.target * 1.2) (this.bad += dt), (this.good = 0);
    else if (this.ema <= this.target * 1.08) (this.good += dt), (this.bad = 0);
    else this.bad = this.good = 0;
    if (this.bad >= this.downAfter && this.ratio > this.min) {
      this.bad = 0;
      const last = this.lastDown;
      if (last && this.ema > last.ema * 0.9) {
        // the last step down bought nothing: the frame time is not the pixels (a 30 Hz screen, a busy CPU) - back up, and never below that again
        this.lastDown = null;
        this.min = Math.max(this.min, last.from);
        return this.set(last.from);
      }
      if (this.sinceUp < this.upAfter) this.ban = 30; // the last step up did not hold
      this.lastDown = { from: this.ratio, ema: this.ema };
      return this.set(Math.max(this.min, this.ratio - this.step));
    }
    if (this.good >= this.upAfter && this.ratio < this.max && this.ban <= 0) {
      this.good = 0;
      this.sinceUp = 0;
      this.lastDown = null;
      return this.set(Math.min(this.max, this.ratio + this.step));
    }
    return null;
  }
  set(r) {
    r = Math.round(r * 100) / 100;
    if (r === this.ratio) return null;
    this.ratio = r;
    this.changes++;
    this.ema = this.target; // the new size needs its own measure
    return r;
  }
}

// ---- warm-up ------------------------------------------------------------------------------------
// every texture used by the materials under the roots
export function collectTextures(roots) {
  const out = new Set();
  for (const root of [].concat(roots)) {
    if (!root || !root.traverse) continue;
    root.traverse((o) => {
      for (const m of [].concat(o.material || [])) for (const v of Object.values(m)) if (v && v.isTexture) out.add(v);
      if (o.isScene && o.background && o.background.isTexture) out.add(o.background);
      if (o.isScene && o.environment && o.environment.isTexture) out.add(o.environment);
    });
  }
  return [...out];
}

const nextFrame = () => new Promise((r) => (typeof requestAnimationFrame !== "undefined" ? requestAnimationFrame(() => r()) : setTimeout(r, 0)));

// Compile every program and upload every texture and buffer before play (behind the loading veil).
//  extra: objects that come later (enemies, effects, held items, a chunk's representative props): added to
//         the scene for the warm-up and removed again, so their programs use the real lights / fog
//  render: one real frame with frustum culling off (uploads geometry, compiles shadow-depth programs and the
//          tone-mapped screen variants that compile() alone does not reach)
//  budgetMs: texture uploads are spread over frames so the veil keeps animating
// -> { ms, programs (linked by this), textures }
export async function prewarm(renderer, scene, camera, o = {}) {
  const t0 = now();
  const p0 = renderer.info && renderer.info.programs ? renderer.info.programs.length : 0;
  const extra = [].concat(o.extra || []).filter(Boolean);
  const holder = [];
  for (const x of extra) if (!x.parent) (scene.add(x), holder.push(x));
  if (renderer.compileAsync) await renderer.compileAsync(scene, camera);
  else if (renderer.compile) renderer.compile(scene, camera);
  let textures = 0;
  if (o.textures !== false && renderer.initTexture) {
    let t = now();
    for (const tex of collectTextures([scene, ...extra])) {
      if (tex.isRenderTargetTexture || (tex.image === undefined && !tex.isDataTexture)) continue;
      renderer.initTexture(tex);
      textures++;
      if (now() - t > (o.budgetMs ?? 8)) (await nextFrame(), (t = now()));
    }
  }
  if (o.render !== false && renderer.render) {
    const culled = [];
    scene.traverse((x) => {
      if (x.frustumCulled) (culled.push(x), (x.frustumCulled = false));
    });
    // shadow maps are drawn once even when they normally update on demand
    const sm = renderer.shadowMap;
    if (sm && sm.enabled && sm.autoUpdate === false) sm.needsUpdate = true;
    renderer.render(scene, camera);
    for (const x of culled) x.frustumCulled = true;
    await nextFrame();
  }
  for (const x of holder) scene.remove(x);
  const p1 = renderer.info && renderer.info.programs ? renderer.info.programs.length : 0;
  const r = { ms: Math.round(now() - t0), programs: p1 - p0, textures };
  if (o.onDone) o.onDone(r);
  return r;
}

// Things in a scene that make hitches later: lights hidden with .visible (each change of the light count
// recompiles every lit material: use intensity 0), shadow casters toggled, very big textures, many programs.
export function auditScene(scene, renderer = null, o = {}) {
  const out = [];
  const maxTex = o.maxTexture ?? 2048;
  scene.traverse((x) => {
    if (x.isLight && !x.isAmbientLight && x.visible === false) out.push(`light "${x.name || x.type}" is hidden with visible=false: keep it visible and set intensity = 0 (a change of the light count recompiles every lit material)`);
  });
  for (const t of collectTextures(scene)) {
    const w = t.image && (t.image.width || t.image.videoWidth);
    const h = t.image && (t.image.height || t.image.videoHeight);
    if (w > maxTex || h > maxTex) out.push(`texture "${t.name || t.uuid.slice(0, 8)}" is ${w}x${h} (> ${maxTex}): slow to upload on phones`);
  }
  if (renderer && renderer.info && renderer.info.programs && renderer.info.programs.length > (o.maxPrograms ?? 40))
    out.push(`${renderer.info.programs.length} shader programs: share materials, avoid per-object material variants`);
  return out;
}

// ---- the guard ----------------------------------------------------------------------------------
export class FrameGuard {
  // ?perf (or ?perf=1) in the URL
  static query(name = "perf") {
    return typeof location !== "undefined" && new URLSearchParams(location.search).has(name);
  }
  // o: renderer, overlay (bool), hitchMs, log (console.warn hitches; default = overlay), longTasks (default true),
  //    dynres ({ targetMs, min, max } or a DynamicResolution; applies renderer.setPixelRatio), onHitch(h)
  constructor(o = {}) {
    this.o = o;
    this.renderer = o.renderer || null;
    this.stats = new FrameStats({ hitchMs: o.hitchMs ?? 33.4, size: o.size });
    this.last = 0;
    this.tags = {};
    this.label = "";
    this.dt = 0;
    this.long = [];
    this.armed = -1; // program count after the warm-up (-1: not armed)
    this.newPrograms = [];
    this.log = o.log ?? !!o.overlay;
    this.dyn = o.dynres ? (o.dynres instanceof DynamicResolution ? o.dynres : new DynamicResolution(o.dynres)) : null;
    if (this.dyn && this.renderer && this.renderer.getPixelRatio) this.dyn.ratio = this.renderer.getPixelRatio();
    this.el = null;
    this.drawT = 0;
    this.stops = [];
    if (o.longTasks !== false) this.stops.push(watchLongTasks((e) => this.long.push(e) > 50 && this.long.shift()));
    if (o.overlay && typeof document !== "undefined") {
      this.el = document.createElement("div");
      this.el.className = "fg-overlay";
      this.el.style.cssText = "position:fixed;left:6px;bottom:6px;z-index:99999;font:11px/1.35 ui-monospace,monospace;color:#cfe;background:rgba(0,0,0,.62);padding:4px 7px;border-radius:4px;pointer-events:none;white-space:pre;contain:content";
      document.body.appendChild(this.el);
    }
  }
  // what the game is doing now (a phase name in the hitch log: 'title', 'walk', 'dialog' ...)
  phase(label) {
    this.label = label;
    const p = probe();
    if (p) p.mark(label);
  }
  // add ms of a kind of work to this frame ('chunk', 'upload', 'dispose' ...)
  tag(kind, ms) {
    this.tags[kind] = (this.tags[kind] || 0) + ms;
    const p = probe();
    if (p) p.note(kind, ms);
  }
  measure(kind, fn) {
    const t = now();
    try {
      return fn();
    } finally {
      this.tag(kind, now() - t);
    }
  }
  // after prewarm(): any program linked from now on is reported (a light was hidden, a material variant ...)
  armPrograms() {
    const r = this.renderer;
    this.armed = r && r.info && r.info.programs ? r.info.programs.length : -1;
  }
  // call first thing in the frame with the rAF timestamp (or nothing); returns the dt in seconds (clamped)
  frame(t = now()) {
    const ms = this.last ? t - this.last : 0;
    this.last = t;
    if (ms > 0) {
      const tags = this.tags;
      if (this.armed >= 0) {
        const progs = this.renderer.info.programs;
        if (progs.length > this.armed) {
          for (const p of progs.slice(this.armed)) this.newPrograms.push(p.name || "?");
          tags.programs = progs.length - this.armed;
          if (this.log) console.warn(`[frame-guard] ${progs.length - this.armed} shader program(s) linked during play: ${progs.slice(this.armed).map((p) => p.name).join(", ")}`);
          this.armed = progs.length;
        }
      }
      if (this.stats.push(ms, tags, t, this.label)) {
        const h = this.stats.hitches[this.stats.hitches.length - 1];
        if (this.o.onHitch) this.o.onHitch(h);
        if (this.log) console.warn(`[frame-guard] hitch ${h.ms} ms ${h.label}`, h.tags);
      }
      if (this.dyn) {
        const r = this.dyn.update(ms);
        if (r !== null && this.renderer && this.renderer.setPixelRatio) this.renderer.setPixelRatio(r);
      }
      this.tags = {};
      this.drawT -= ms;
      if (this.el && this.drawT <= 0) (this.drawT = 500), this.draw();
    }
    this.dt = smoothDt(this.dt, ms / 1000, this.o.dt);
    return this.dt;
  }
  draw() {
    const s = this.stats.summary();
    const r = this.renderer && this.renderer.info;
    const last = this.stats.hitches[this.stats.hitches.length - 1];
    this.el.textContent =
      `p50 ${s.p50}  p95 ${s.p95}  p99 ${s.p99}  max ${s.max} ms\n>33 ${s.over33}  >50 ${s.over50}  long tasks ${this.long.length}` +
      (r ? `\nprograms ${r.programs ? r.programs.length : "?"}  calls ${r.render.calls}  tex ${r.memory.textures}  geo ${r.memory.geometries}` : "") +
      (this.dyn ? `  px ${this.dyn.ratio}` : "") +
      (last ? `\nlast hitch ${last.ms} ms ${last.label} ${Object.entries(last.tags).map(([k, v]) => `${k} ${Math.round(v)}`).join(" ")}` : "");
  }
  report() {
    return { ...this.stats.summary(), hitchLog: this.stats.hitches.slice(-20), newPrograms: this.newPrograms.slice(), longTasks: this.long.length, pixelRatio: this.dyn ? this.dyn.ratio : undefined };
  }
  dispose() {
    for (const s of this.stops) s();
    if (this.el) this.el.remove();
  }
}

// long tasks (>50 ms) and long animation frames (Chrome 123+: with the scripts that ran and forced layout)
export function watchLongTasks(cb) {
  if (typeof PerformanceObserver === "undefined") return () => {};
  const obs = [];
  const add = (type, map) => {
    try {
      const po = new PerformanceObserver((l) => l.getEntries().forEach((e) => cb(map(e))));
      po.observe({ type, buffered: false });
      obs.push(po);
    } catch {
      /* not supported */
    }
  };
  add("long-animation-frame", (e) => ({ type: "loaf", t: e.startTime, ms: e.duration, layout: e.forcedStyleAndLayoutDuration || 0, scripts: (e.scripts || []).map((s) => `${(s.sourceURL || "").split("/").pop()} ${s.sourceFunctionName || ""} ${Math.round(s.duration)}ms`) }));
  if (!PerformanceObserver.supportedEntryTypes || !PerformanceObserver.supportedEntryTypes.includes("long-animation-frame")) add("longtask", (e) => ({ type: "longtask", t: e.startTime, ms: e.duration }));
  return () => obs.forEach((o) => o.disconnect());
}
