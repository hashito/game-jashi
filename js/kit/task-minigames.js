/* game-kit 6e0b6f0: js/task-minigames.js — edit in game-kit and run tools/kit-sync.js */
// Short "Among Us-style" mini games for work / task screens (rule S16 of docs/3d-game-rules.md). Game-agnostic:
// the game registers which task gets which game, then awaits start(). 10-40 s each, understood at once, a miss only
// retries (no penalty), mouse AND touch (pointer events; tap-to-pick as well as drag), every target >= 44 px,
// Esc / the close button aborts without penalty (start resolves false). Calm: no flashing, no timers, shorter win beat.
// From 退勤まで (game-miru-delivery js/minigames.js). Styles: css/kit.css "task mini games" block (#mg ...). Docs: docs/task-minigames.md
//
//   import { register, start, needsMiniGame, miniFlag } from "./kit/task-minigames.js";
//   register("CLOCK", "dial", { title: "勤怠端末：時刻つまみ", help: "つまみを回して印に針を合わせる", target: 110, label: "1:50", gate: ["in"] });
//   register("SEALER", "tape", { title: "封かん機：テープ合わせ", help: "…", gate: ["seal"] });
//   if (needsMiniGame("CLOCK", "in", fired)) { const ok = await start("CLOCK", { calm, qa }); if (!ok) return; fired[miniFlag("CLOCK")] = true; }
//   // true = done (or ?qa / opts.qa: skipped), false = aborted (nothing is lost)
//
// types: dial | sequence | align | tape (align with テープ / 継ぎ目 defaults) | wipe | cables | lanes.
// cfg: title, help, gate [button ids that need it first], and per type: dial { target deg, label, tol },
//   align/tape { item, mark, tol }, sequence { n, symbols }, cables { n }, lanes { items, lanes, laneNames }, wipe { need }.
// Everything above the "---- DOM ----" line is pure (no document): test/task-minigames.test.mjs uses it.
import { esc } from "./ui.js";
import { gfRegister, gfEmit, gfOk, gfFail, gfUnknown } from "./gf-test.js";

export const TYPES = ["dial", "sequence", "align", "tape", "wipe", "cables", "lanes"];
const DEFAULTS = {
  align: { item: "バーコード", mark: "読取線" },
  tape: { item: "テープ", mark: "継ぎ目" },
  dial: { target: 0, label: "" },
};
// ---- registry: which task gets which game, and which panel button needs it first -----------------------------
export const TASKS = {};
export const GATES = {};
export function register(taskId, type, cfg = {}) {
  if (!TYPES.includes(type)) throw new Error(`task-minigames: unknown type "${type}" for ${taskId} (${TYPES.join(", ")})`);
  TASKS[taskId] = { title: taskId, help: "", ...DEFAULTS[type], ...cfg, kind: type === "tape" ? "align" : type, type };
  if (cfg.gate) GATES[taskId] = [].concat(cfg.gate);
  else delete GATES[taskId];
  return TASKS[taskId];
}
export const registerAll = (map) => Object.entries(map).forEach(([id, [type, cfg]]) => register(id, type, cfg));
export const unregister = (taskId) => (delete TASKS[taskId], delete GATES[taskId]);
export const has = (taskId) => !!TASKS[taskId];
export const gameFor = (taskId) => (TASKS[taskId] ? TASKS[taskId].type : null);
export const needsMiniGame = (taskId, buttonId, fired = {}) => !!GATES[taskId] && GATES[taskId].includes(buttonId) && !fired[`mg_${taskId}`];
export const miniFlag = (taskId) => `mg_${taskId}`;

// ---- pure game state ----------------------------------------------------------------------------------------
export function rngFrom(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}
export const shuffle = (arr, rng = Math.random) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// align: value 0..100, the mark is at 50. The start is always visibly off.
export const alignOk = (value, target = 50, tol = 3) => Math.abs(value - target) <= tol;
export const alignStart = (rng = Math.random) => (rng() < 0.5 ? 12 + rng() * 22 : 66 + rng() * 22);

// dial: angles in degrees, 0 = up, clockwise. Shortest signed difference.
export const angleDiff = (a, b) => ((((a - b) % 360) + 540) % 360) - 180;
export const dialOk = (angle, target, tol = 7) => Math.abs(angleDiff(angle, target)) <= tol;
export const angleOf = (cx, cy, x, y) => ((Math.atan2(x - cx, cy - y) * 180) / Math.PI + 360) % 360;
export const dialStart = (target, rng = Math.random) => (target + 90 + rng() * 160) % 360;

// wipe: a cols x rows grid of dirt (1 = dirty). wipeAt clears the cells within r (in cell units) of (cx, cy).
export const wipeNew = (cols = 24, rows = 12) => ({ cols, rows, dirt: new Array(cols * rows).fill(1) });
export function wipeAt(g, cx, cy, r = 1.6) {
  let cleared = 0;
  for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(g.rows - 1, Math.ceil(cy + r)); y++)
    for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(g.cols - 1, Math.ceil(cx + r)); x++)
      if (g.dirt[y * g.cols + x] && (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) ((g.dirt[y * g.cols + x] = 0), cleared++);
  return cleared;
}
export const wipeClean = (g) => 1 - g.dirt.reduce((a, b) => a + b, 0) / g.dirt.length;
export const wipeDone = (g, need = 0.92) => wipeClean(g) >= need;

// sequence: press the shown order. A wrong press restarts the sequence (instantly), nothing else.
export const seqNew = (n = 4, symbols = 4, rng = Math.random) => ({ symbols: Math.max(n, symbols), order: shuffle([...Array(Math.max(n, symbols)).keys()], rng).slice(0, n), at: 0, misses: 0 });
export function seqPress(s, sym) {
  if (s.at >= s.order.length) return "done";
  if (s.order[s.at] === sym) {
    s.at++;
    return s.at === s.order.length ? "done" : "ok";
  }
  s.at = 0;
  s.misses++;
  return "wrong";
}

// cables: left plug i belongs to right socket pairs[i]. connect() true = joined; a wrong one joins nothing.
export const cablesNew = (n = 4, rng = Math.random) => ({ n, pairs: shuffle([...Array(n).keys()], rng), done: new Set(), misses: 0 });
export function cableConnect(s, left, right) {
  if (s.done.has(left)) return false;
  if (s.pairs[left] === right) return (s.done.add(left), true);
  s.misses++;
  return false;
}
export const cablesDone = (s) => s.done.size === s.n;

// lanes: each slip has a lane; dropping it in the wrong tray sends it back.
export function lanesNew(items = 4, lanes = 3, rng = Math.random) {
  const list = Array.from({ length: items }, (_, i) => ({ id: i, lane: i % lanes, placed: false }));
  return { lanes, items: shuffle(list, rng), misses: 0 };
}
export function laneDrop(s, itemId, lane) {
  const it = s.items.find((x) => x.id === itemId);
  if (!it || it.placed) return false;
  if (it.lane === lane) return (it.placed = true);
  s.misses++;
  return false;
}
export const lanesDone = (s) => s.items.every((x) => x.placed);

// ---- DOM ------------------------------------------------------------------------------------------------------
const SHAPES = ["▲", "●", "■", "◆", "★"];
const COLORS = ["#e0483a", "#3a8be0", "#e0c23a", "#46c27a", "#b06ae0"]; // fallbacks; the real colours are the theme tokens --gf-mg-c1..5 (text-safe in every theme, U30)
const cv = (i) => `var(--gf-mg-c${i + 1}, ${COLORS[i]})`;
const COLOR_NAMES = ["赤", "青", "黄", "緑", "紫"];
const LANE_NAMES_DEFAULT = ["A", "B", "C", "D"];
let active = null;

export const qaFlag = () => typeof location !== "undefined" && /[?&]qa(=|&|$)/.test(location.search);
export const isActive = () => !!active;

export function start(taskId, opts = {}) {
  const T = TASKS[taskId];
  if (!T || typeof document === "undefined" || opts.qa || (opts.qa === undefined && qaFlag())) return Promise.resolve(true);
  if (active) return active.promise;
  const rng = opts.rng || Math.random;
  const calm = !!opts.calm;
  const root = document.createElement("div");
  root.id = "mg";
  root.className = calm ? "calm" : "";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-label", T.title);
  root.tabIndex = -1;
  root.innerHTML = `<div class="mg-box"><div class="mg-head"><b>${esc(T.title)}</b><button class="mg-x" aria-label="閉じる（Esc）">× 閉じる</button></div><div class="mg-help">${esc(T.help)}</div><div class="mg-stage"></div><div class="mg-msg" aria-live="polite"></div><div class="mg-foot">うまくいかなくても、何度でもやり直せます。<span class="desk-only"> Esc でやめられます。</span></div></div>`;
  document.body.appendChild(root);
  const stage = root.querySelector(".mg-stage"), msg = root.querySelector(".mg-msg");
  const say = (t, bad) => {
    msg.textContent = t;
    msg.classList.toggle("bad", !!bad);
    if (bad && !calm) {
      stage.classList.remove("flash");
      void stage.offsetWidth;
      stage.classList.add("flash");
    }
  };
  let finish;
  const promise = new Promise((res) => (finish = res));
  const prevFocus = document.activeElement;
  let guide = null; // opts.guide = { create(root, T) -> { destroy() } }: the game's STEP guide (step-guide.js minigameSteps) for this mini game
  const close = (ok) => {
    if (!active) return;
    if (guide) { try { guide.destroy(); } catch {} guide = null; }
    removeEventListener("keydown", onKey, true);
    root.remove();
    active = null;
    try {
      prevFocus && prevFocus.focus && prevFocus.focus();
    } catch {}
    finish(ok);
  };
  const win = () => {
    gfEmit("taskMinigames", "win", { taskId });
    say("できた！", false);
    root.classList.add("won");
    setTimeout(() => close(true), calm ? 250 : 600);
  };
  // keys: Esc aborts; nothing else reaches the game (number keys would press the panel under us)
  const onKey = (e) => {
    if (e.code === "Escape") (e.preventDefault(), e.stopImmediatePropagation(), close(false));
    else if (!root.contains(e.target)) e.stopImmediatePropagation();
  };
  addEventListener("keydown", onKey, true);
  root.addEventListener("keydown", (e) => e.stopPropagation());
  root.querySelector(".mg-x").addEventListener("click", () => close(false));
  root.addEventListener("pointerdown", (e) => e.stopPropagation());
  active = { promise, close, win, taskId, kind: T.kind };
  gfEmit("taskMinigames", "start", { taskId, kind: T.kind });
  BUILD[T.kind](stage, T, { rng, calm, say, win });
  if (opts.guide && opts.guide.create) { try { guide = opts.guide.create(root, T) || null; } catch { guide = null; } }
  root.focus();
  return promise;
}
export const abort = () => active && active.close(false);

// tap a source then a target, or drag a source onto a target; onPair(srcEl, dstEl) -> true if it was right
function pairing(srcs, dsts, onPair) {
  let sel = null;
  const mark = (el) => (srcs.forEach((s) => s.classList.toggle("sel", s === el)), (sel = el));
  const hit = (x, y) => document.elementsFromPoint(x, y).find((e) => dsts.includes(e));
  srcs.forEach((s) => {
    let drag = null;
    s.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      if (s.classList.contains("done")) return;
      mark(s);
      drag = { x: e.clientX, y: e.clientY, moved: false };
      try {
        s.setPointerCapture(e.pointerId);
      } catch {}
    });
    s.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.hypot(dx, dy) > 8) drag.moved = true;
      if (drag.moved) s.style.transform = `translate(${dx}px, ${dy}px)`;
    });
    const end = (e) => {
      if (!drag) return;
      const was = drag;
      drag = null;
      s.style.transform = "";
      if (!was.moved) return;
      const d = hit(e.clientX, e.clientY);
      mark(null);
      if (d) onPair(s, d);
    };
    s.addEventListener("pointerup", end);
    s.addEventListener("pointercancel", () => ((drag = null), (s.style.transform = "")));
  });
  dsts.forEach((d) =>
    d.addEventListener("click", () => {
      if (!sel) return;
      const s = sel;
      mark(null);
      onPair(s, d);
    })
  );
}

const btn = (cls, html) => {
  const b = document.createElement("button");
  b.type = "button";
  b.className = cls;
  b.innerHTML = html;
  return b;
};

const BUILD = {
  align(stage, T, c) {
    let v = alignStart(c.rng);
    stage.innerHTML = `<div class="al-win"><div class="al-mark"><i></i><span>${esc(T.mark)}</span></div><div class="al-item"><span>${esc(T.item)}</span></div></div><input class="al-range" type="range" min="0" max="100" step="0.5" aria-label="${esc(T.item)}の位置"><button class="mg-ok" type="button">これで合わせる</button>`;
    const item = stage.querySelector(".al-item"), range = stage.querySelector(".al-range");
    const paint = () => (item.style.left = `${v}%`);
    range.value = v;
    paint();
    range.addEventListener("input", () => ((v = +range.value), paint()));
    stage.querySelector(".mg-ok").addEventListener("click", () => {
      if (alignOk(v, 50, T.tol ?? 3)) c.win();
      else c.say(v < 50 ? "印より、少し左にあります。" : "印より、少し右にあります。", true);
    });
  },
  dial(stage, T, c) {
    let a = dialStart(T.target, c.rng);
    stage.innerHTML = `<div class="dl-face"><div class="dl-tick" style="transform:rotate(${T.target}deg)"><i></i></div><div class="dl-knob"><div class="dl-needle"></div></div><span class="dl-lbl">${esc(T.label || "")}</span></div><div class="dl-keys"><button class="mg-step" data-d="-6" type="button" aria-label="左へ回す">⟲ 左</button><button class="mg-step" data-d="6" type="button" aria-label="右へ回す">右 ⟳</button></div><button class="mg-ok" type="button">これで合わせる</button>`;
    const knob = stage.querySelector(".dl-knob"), face = stage.querySelector(".dl-face");
    const paint = () => (knob.style.transform = `rotate(${a}deg)`);
    paint();
    let drag = false;
    const at = (e) => {
      const r = face.getBoundingClientRect();
      a = angleOf(r.left + r.width / 2, r.top + r.height / 2, e.clientX, e.clientY);
      paint();
    };
    face.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      drag = true;
      try {
        face.setPointerCapture(e.pointerId);
      } catch {}
      at(e);
    });
    face.addEventListener("pointermove", (e) => drag && at(e));
    face.addEventListener("pointerup", () => (drag = false));
    face.addEventListener("pointercancel", () => (drag = false));
    stage.querySelectorAll(".mg-step").forEach((b) => b.addEventListener("click", () => ((a = (a + +b.dataset.d + 360) % 360), paint())));
    stage.querySelector(".mg-ok").addEventListener("click", () => (dialOk(a, T.target, T.tol ?? 7) ? c.win() : c.say("針が、印から少しずれています。", true)));
  },
  sequence(stage, T, c) {
    const n = Math.min(T.n || 4, 5);
    const s = seqNew(n, Math.min(5, Math.max(n, T.symbols || 4)), c.rng);
    const chip = (i) => `<span class="sq-chip" style="--c:${cv(i)}">${SHAPES[i]}</span>`;
    stage.innerHTML = `<div class="sq-order">${s.order.map((i, n) => `<span class="sq-n">${n + 1}${chip(i)}</span>`).join("")}</div><div class="sq-pad"></div>`;
    const pad = stage.querySelector(".sq-pad"), steps = [...stage.querySelectorAll(".sq-n")];
    const paint = () => steps.forEach((el, n) => el.classList.toggle("ok", n < s.at));
    shuffle([...Array(s.symbols).keys()], c.rng).forEach((i) => {
      const b = btn("sq-btn", `${SHAPES[i]}<small>${COLOR_NAMES[i]}</small>`);
      b.style.setProperty("--c", cv(i));
      b.addEventListener("click", () => {
        const r = seqPress(s, i);
        paint();
        if (r === "done") c.win();
        else if (r === "wrong") c.say("順番が違っていました。最初からもう一度どうぞ。", true);
        else c.say("", false);
      });
      pad.appendChild(b);
    });
  },
  wipe(stage, T, c) {
    const g = wipeNew(24, 12);
    stage.innerHTML = `<div class="wp-glass"><div class="wp-scan"><span>||| |||| || |||</span></div><canvas class="wp-dirt" width="480" height="240"></canvas></div><div class="wp-bar"><i></i></div>`;
    const cv = stage.querySelector("canvas"), ctx = cv.getContext("2d"), bar = stage.querySelector(".wp-bar i");
    ctx.fillStyle = "#3b3326";
    ctx.fillRect(0, 0, 480, 240);
    for (let i = 0; i < 260; i++) {
      ctx.fillStyle = `rgba(${40 + c.rng() * 50},${34 + c.rng() * 40},${20 + c.rng() * 20},${0.4 + c.rng() * 0.5})`;
      ctx.beginPath();
      ctx.arc(c.rng() * 480, c.rng() * 240, 4 + c.rng() * 14, 0, 7);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "destination-out";
    let down = false, last = null;
    const wipe = (e) => {
      const r = cv.getBoundingClientRect(), x = ((e.clientX - r.left) / r.width) * 480, y = ((e.clientY - r.top) / r.height) * 240;
      ctx.lineWidth = 56;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(last ? last[0] : x, last ? last[1] : y);
      ctx.lineTo(x, y);
      ctx.stroke();
      // sample along the stroke so a fast swipe clears every cell it crossed
      const n = last ? Math.max(1, Math.ceil(Math.hypot(x - last[0], y - last[1]) / 10)) : 1;
      for (let i = 1; i <= n; i++) wipeAt(g, (((last ? last[0] : x) + ((x - (last ? last[0] : x)) * i) / n) / 480) * g.cols, (((last ? last[1] : y) + ((y - (last ? last[1] : y)) * i) / n) / 240) * g.rows, 1.5);
      last = [x, y];
      bar.style.width = `${Math.round(wipeClean(g) * 100)}%`;
      if (wipeDone(g, T.need ?? 0.92)) {
        down = false;
        ctx.clearRect(0, 0, 480, 240);
        c.win();
      }
    };
    cv.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      down = true;
      last = null;
      try {
        cv.setPointerCapture(e.pointerId);
      } catch {}
      wipe(e);
    });
    cv.addEventListener("pointermove", (e) => down && wipe(e));
    cv.addEventListener("pointerup", () => ((down = false), (last = null)));
    cv.addEventListener("pointercancel", () => ((down = false), (last = null)));
  },
  cables(stage, T, c) {
    const s = cablesNew(Math.min(T.n || 4, 5), c.rng);
    const rightOrder = shuffle([...Array(s.n).keys()], c.rng);
    stage.innerHTML = `<svg class="cb-wires"></svg><div class="cb-col l"></div><div class="cb-col r"></div>`;
    const L = stage.querySelector(".l"), R = stage.querySelector(".r"), svg = stage.querySelector("svg");
    const plug = (i) => `<span style="--c:${cv(i)}">${SHAPES[i]}</span>${COLOR_NAMES[i]}`;
    const lefts = [...Array(s.n).keys()].map((i) => {
      const b = btn("cb-plug", plug(i));
      b.style.setProperty("--c", cv(i));
      b.dataset.i = i;
      L.appendChild(b);
      return b;
    });
    // right socket k holds the colour rightOrder[k]; s.pairs[left] = the right slot of that colour
    s.pairs = [...Array(s.n).keys()].map((i) => rightOrder.indexOf(i));
    const rights = rightOrder.map((i, k) => {
      const b = btn("cb-sock", plug(i));
      b.style.setProperty("--c", cv(i));
      b.dataset.k = k;
      R.appendChild(b);
      return b;
    });
    pairing(lefts, rights, (l, r) => {
      const ok = cableConnect(s, +l.dataset.i, +r.dataset.k);
      if (!ok) return c.say("色が違います。もう一度つなぎましょう。", true), false;
      l.classList.add("done");
      r.classList.add("done");
      const a = l.getBoundingClientRect(), b = r.getBoundingClientRect(), o = svg.getBoundingClientRect();
      svg.insertAdjacentHTML("beforeend", `<line x1="${a.right - o.left}" y1="${a.top + a.height / 2 - o.top}" x2="${b.left - o.left}" y2="${b.top + b.height / 2 - o.top}" style="stroke:${cv(+l.dataset.i)}" stroke-width="7" stroke-linecap="round"/>`);
      c.say("", false);
      if (cablesDone(s)) c.win();
      return true;
    });
  },
  lanes(stage, T, c) {
    const LANE_NAMES = (T.laneNames || LANE_NAMES_DEFAULT).slice(0, T.lanes || 3);
    const s = lanesNew(T.items || 4, LANE_NAMES.length, c.rng);
    stage.innerHTML = `<div class="ln-items"></div><div class="ln-trays"></div>`;
    const it = stage.querySelector(".ln-items"), tr = stage.querySelector(".ln-trays");
    const srcs = s.items.map((x) => {
      const b = btn("ln-slip", `<b>${LANE_NAMES[x.lane]}</b>-0${x.id + 3}`);
      b.dataset.id = x.id;
      it.appendChild(b);
      return b;
    });
    const dsts = LANE_NAMES.map((n, i) => {
      const b = btn("ln-tray", `トレイ <b>${n}</b>`);
      b.dataset.lane = i;
      tr.appendChild(b);
      return b;
    });
    pairing(srcs, dsts, (sl, tray) => {
      if (!laneDrop(s, +sl.dataset.id, +tray.dataset.lane)) return c.say("その列ではないようです。ほかの列を試してみましょう。", true), false;
      sl.classList.add("done");
      sl.disabled = true;
      c.say("", false);
      if (lanesDone(s)) c.win();
      return true;
    });
  },
};

// test hooks (docs/testing.md): drive("start", { taskId }) opens the real mini game, drive("solve") wins it, drive("abort") closes it as a failure
let gfLast = null;
gfRegister("taskMinigames", () => ({
  snapshot: () => ({ active: !!active, taskId: active ? active.taskId : null, kind: active ? active.kind : null, tasks: Object.keys(TASKS), gates: Object.keys(GATES), types: TYPES.slice() }),
  drive(action, a = {}) {
    switch (action) {
      case "register": register(a.taskId, a.type, a.cfg || {}); return gfOk({ tasks: Object.keys(TASKS) });
      case "start": { if (!TASKS[a.taskId]) return gfFail(`unknown task "${a.taskId}"`); gfLast = { taskId: a.taskId, result: null }; const rec = gfLast; start(a.taskId, { qa: false, calm: !!a.calm, rng: rngFrom(a.seed || 1) }).then((ok) => { rec.result = ok; gfEmit("taskMinigames", "end", { taskId: rec.taskId, ok }); }); return gfOk({ active: !!active }); }
      case "solve": if (!active) return gfFail("no mini game is open"); active.win(); return gfOk();
      case "abort": if (!active) return gfFail("no mini game is open"); abort(); return gfOk();
      case "result": return gfLast ? gfOk({ taskId: gfLast.taskId, result: gfLast.result }) : gfFail("never started");
      default: return gfUnknown(action);
    }
  },
  seed() {},
  reset: () => { abort(); gfLast = null; },
}));
