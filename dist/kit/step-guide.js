/* game-kit 2a9373b: js/step-guide.js — edit in game-kit and run tools/kit-sync.js */
// STEP-form explanations with emphasis and monologue hints (rules U22 / U23 of docs/3d-game-rules.md). Game-agnostic.
// Shows "STEP 1/3" cards one at a time (finished steps collapse to a checked line). A step advances when its done(state)
// turns true or the player taps 次へ. The target is emphasised (a ring / glow / arrow overlay on a DOM element, or your own
// onEmphasize(target, on, info) hook for a 3D object); if the player is idle the protagonist's one-liner (hint) is spoken
// through say(text). Help fades with success: level 'full' (first time) -> 'subtle' (done once) -> 'off' (done fadeAfter times).
// Colours / sizes come from the --gf-* tokens with fallbacks (css/kit.css "step-guide" block, classes sg-*).
// The logic (class StepGuideCore) has no DOM and takes an injectable clock: test/step-guide.test.mjs uses it.
//
//   import { createStepGuide, minigameSteps } from "./kit/step-guide.js";
//   const guide = createStepGuide({
//     container: el,                                     // where the cards go (omit = headless, logic only)
//     steps: [{ id: "look", title: "ドアを見る", body: "画面の中央に ◆ を合わせる", target: { selector: "#door-btn" }, emphasize: "ring",
//               hint: "あのドア、気になるな…", done: (s) => s.sawDoor }],
//     getState: () => game.state,                         // passed to done()
//     say: (text) => ui.say(text),                        // the game's inner-voice line (hint). Without it the hint shows inside the card.
//     storage: localStorage, key: "hikage.tutorial",      // completion counts survive reloads (every call is wrapped in try/catch)
//     onEmphasize: (target, on, info) => ...,             // 3D objects: info = { style: 'ring'|'glow'|'arrow', level, calm }
//     idleMs: 8000, fadeAfter: 3, calm: false, resume: false,   // resume: skip steps already completed in a previous session
//   });
//   guide.tick();            // call from your update loop (or leave auto: true = a 250 ms timer)
//   guide.next(); guide.skip(); guide.reset(); guide.touch();   // touch() = the player did something (resets the idle timer)
// Mini games: createStepGuide({ steps: minigameSteps("dial"), ... }) gives 3 short Japanese steps (what / how / what happens).

export const LEVELS = ["full", "subtle", "off"];
export const STYLES = ["ring", "glow", "arrow"];
const noop = () => {};
const safe = (f, d) => { try { return f(); } catch { return d; } };

export class StepGuideCore {
  constructor(o = {}) {
    this.o = { idleMs: 8000, fadeAfter: 3, calm: false, resume: false, auto: true, ...o };
    this.steps = (o.steps || []).map((s, i) => ({ id: s.id ?? `step${i + 1}`, emphasize: "ring", ...s }));
    this.getState = o.getState || (() => ({}));
    this.say = o.say || null;
    this.now = o.now || (() => Date.now());
    this.storeKey = `stepguide.${o.key || "default"}`;
    this.storage = o.storage || null;
    this.counts = this._load();
    this.idx = 0;
    this.finished = false;
    this.skipped = false;
    this.hintSaid = false;
    this.emphasized = null;
    this.lastActive = this.now();
    this.log = [];
    this._enter(true);
  }
  _load() {
    if (!this.storage) return {};
    const raw = safe(() => this.storage.getItem(this.storeKey), null);
    const j = safe(() => JSON.parse(raw), null);
    return j && typeof j.n === "object" && j.n ? { ...j.n } : {};
  }
  _save() {
    if (this.storage) safe(() => this.storage.setItem(this.storeKey, JSON.stringify({ n: this.counts })));
  }
  // level of help for a step: how many times it has been completed before
  levelOf(id) {
    const n = this.counts[id] || 0;
    return n >= this.o.fadeAfter ? "off" : n >= 1 ? "subtle" : "full";
  }
  get step() { return this.steps[this.idx] || null; }
  get level() { return this.step ? this.levelOf(this.step.id) : "off"; }
  get completed() { return this.steps.slice(0, this.idx).map((s) => s.id); }
  snapshot() {
    return { idx: this.idx, total: this.steps.length, step: this.step, level: this.level, finished: this.finished, skipped: this.skipped, completed: this.completed, hintSaid: this.hintSaid };
  }
  _emph(on) {
    const s = this.step;
    if (on) {
      if (!s || !s.target || this.level === "off" || this.finished) return;
      this.emphasized = s;
      (this.o.onEmphasize || noop)(s.target, true, { style: s.emphasize, level: this.level, calm: !!this.o.calm, step: s });
    } else if (this.emphasized) {
      const e = this.emphasized;
      this.emphasized = null;
      (this.o.onEmphasize || noop)(e.target, false, { style: e.emphasize, level: this.levelOf(e.id), calm: !!this.o.calm, step: e });
    }
  }
  _enter(first) {
    // skip steps completed in a previous session when resume is on
    while (this.o.resume && this.step && (this.counts[this.step.id] || 0) >= 1) this.idx++;
    this.hintSaid = false;
    this.lastActive = this.now();
    if (!this.step) { this.finished = true; this._emph(false); if (!first) (this.o.onDone || noop)(this); else this.log.push("done"); return; }
    this._emph(true);
    if (!first) (this.o.onChange || noop)(this);
  }
  touch() { this.lastActive = this.now(); }
  _complete(count) {
    const s = this.step;
    if (!s) return false;
    this._emph(false);
    if (count) { this.counts[s.id] = (this.counts[s.id] || 0) + 1; this._save(); }
    this.idx++;
    this._enter(false);
    return true;
  }
  // the player tapped 次へ
  next() { return this._complete(true); }
  // check done() and the idle timer; returns true when the step changed
  tick() {
    const s = this.step;
    if (!s || this.finished) return false;
    if (typeof s.done === "function" && safe(() => s.done(this.getState()), false)) return this._complete(true);
    const lv = this.level;
    if (lv !== "off" && s.hint && !this.hintSaid && this.now() - this.lastActive >= this.o.idleMs * (lv === "subtle" ? 2 : 1)) {
      this.hintSaid = true;
      if (this.say) safe(() => this.say(s.hint));
      (this.o.onChange || noop)(this);
    }
    return false;
  }
  // leave the rest without counting it as learned
  skip() {
    this._emph(false);
    this.idx = this.steps.length;
    this.skipped = true;
    this.finished = true;
    (this.o.onDone || noop)(this);
  }
  // forget everything and start again
  reset() {
    this._emph(false);
    this.counts = {};
    if (this.storage) safe(() => this.storage.removeItem(this.storeKey));
    this.idx = 0; this.finished = false; this.skipped = false;
    this._enter(false);
  }
  // true when every step is at level 'off' (the guide has nothing left to show)
  get allFaded() { return this.steps.every((s) => this.levelOf(s.id) === "off"); }
}

// ---- default STEP lists for js/task-minigames.js (what to do / how / what happens) ---------------------------------
const MG = {
  dial: [
    ["やること", "つまみを回して、針を印に合わせます。", "どこに合わせるの？"], // wording-ok: the 3rd item is the protagonist's inner voice
    ["やりかた", "つまみをドラッグするか、左右のボタンで少しずつ回します。", "ゆっくり回せばいいか。"], // wording-ok: the 3rd item is the protagonist's inner voice
    ["できると", "印に重なると光って、そのまま完了です。ずれても減点はありません。", "ずれても、やり直せる。"], // wording-ok: the 3rd item is the protagonist's inner voice
  ],
  sequence: [
    ["やること", "光った順番を覚えます。", "順番を見ておこう。"], // wording-ok: the 3rd item is the protagonist's inner voice
    ["やりかた", "同じ順番で、ボタンを押していきます。", "ひとつずつ、同じ順に。"], // wording-ok: the 3rd item is the protagonist's inner voice
    ["できると", "最後まで合えば完了。間違えたら最初からやり直せます。", "間違えても、最初から。"], // wording-ok: the 3rd item is the protagonist's inner voice
  ],
  align: [
    ["やること", "動く物を、読み取りの線に重ねます。", "あの線に重ねればいい。"], // wording-ok: the 3rd item is the protagonist's inner voice
    ["やりかた", "ドラッグするか、スライダーで位置をずらします。", "少しずつ動かしてみる。"], // wording-ok: the 3rd item is the protagonist's inner voice
    ["できると", "線に重なると色が変わるので、そこで決定。外れても何度でも。", "ぴったりなら、決まる。"], // wording-ok: the 3rd item is the protagonist's inner voice
  ],
  tape: [
    ["やること", "テープの継ぎ目を、封の線に合わせます。", "継ぎ目を線に合わせる。"], // wording-ok: the 3rd item is the protagonist's inner voice
    ["やりかた", "ドラッグかスライダーでテープをずらします。", "ずらして、探そう。"], // wording-ok: the 3rd item is the protagonist's inner voice
    ["できると", "継ぎ目が線に重なると完了です。外れても減点なし。", "ずれたら、またやればいい。"], // wording-ok: the 3rd item is the protagonist's inner voice
  ],
  wipe: [
    ["やること", "汚れた面をきれいに拭きます。", "ここ、汚れてるな。"], // wording-ok: the 3rd item is the protagonist's inner voice
    ["やりかた", "指かマウスで、汚れの上をなぞります。", "こすってみよう。"], // wording-ok: the 3rd item is the protagonist's inner voice
    ["できると", "ほとんど拭けたら完了。細かい所は残っていても大丈夫です。", "だいたい拭ければいい。"], // wording-ok: the 3rd item is the protagonist's inner voice
  ],
  cables: [
    ["やること", "同じ色のコネクタ同士を、線でつなぎます。", "色を合わせるのか。"], // wording-ok: the 3rd item is the protagonist's inner voice
    ["やりかた", "片方をタップして、つなぎたい相手をタップします。ドラッグでもつなげます。", "選んで、相手を選ぶ。"], // wording-ok: the 3rd item is the protagonist's inner voice
    ["できると", "全部つながれば完了。違う色は、つながらずに戻るだけです。", "違っても、戻るだけ。"], // wording-ok: the 3rd item is the protagonist's inner voice
  ],
  lanes: [
    ["やること", "流れてくる物を、行き先の列に仕分けます。", "どの列に入れるんだっけ。"], // wording-ok: the 3rd item is the protagonist's inner voice
    ["やりかた", "物をタップして、行き先の列をタップします。ドラッグでも動かせます。", "選んで、列に入れる。"], // wording-ok: the 3rd item is the protagonist's inner voice
    ["できると", "全部入れ終われば完了。違う列に入れたら、返ってくるだけです。", "間違えても、返ってくる。"], // wording-ok: the 3rd item is the protagonist's inner voice
  ],
};
export const MINIGAME_TYPES = Object.keys(MG);

// minigameSteps("dial", { done: [fn, fn, fn], target: ".mg-stage", emphasize: "ring", prefix: "mg" }) -> steps for createStepGuide
// Without done() a step advances on 次へ only. The hints are the protagonist's one-liners (override per game: opts.hints [..]).
export function minigameSteps(type, o = {}) {
  const base = MG[type === "tape" ? "tape" : type];
  if (!base) throw new Error(`step-guide: no steps for mini game type "${type}" (${MINIGAME_TYPES.join(", ")})`);
  return base.map(([title, body, hint], i) => {
    const s = { id: `${o.prefix || "mg"}-${type}-${i + 1}`, title, body, hint: o.hints?.[i] ?? hint };
    if (o.done?.[i]) s.done = o.done[i];
    if (i === 0 && o.target) { s.target = typeof o.target === "string" ? { selector: o.target } : o.target; s.emphasize = o.emphasize || "ring"; }
    return s;
  });
}

// ---- DOM ------------------------------------------------------------------------------------------------------
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

import { gfRegister, gfEmit, gfOk, gfFail, gfUnknown } from "./gf-test.js";

export function createStepGuide(o = {}) {
  const container = o.container || null;
  const root = container ? document.createElement("div") : null;
  let overlay = null, overlayEl = null, raf = 0, timer = 0;
  const hasDom = typeof document !== "undefined";

  // perf (Q12): the ring follows its target, but it reads the layout only every 3rd frame and writes the styles only when the rectangle changed
  // (reading + writing every frame forced a layout each frame, 180 ms right after a window opened)
  let placeN = 0, placed = "";
  function placeOverlay() {
    raf = 0;
    if (!overlay || !overlayEl) return;
    if (placeN++ % 3 === 0) {
      const rc = overlayEl.getBoundingClientRect();
      const pad = 6, key = `${rc.left | 0},${rc.top | 0},${rc.width | 0},${rc.height | 0}`;
      if (key !== placed) {
        placed = key;
        // position by the `translate` property (not left/top): moving a fixed element by left/top is counted as a layout shift (CLS), a transform is not (docs/load-flicker.md)
        overlay.style.translate = `${rc.left - pad}px ${rc.top - pad}px`;
        overlay.style.width = `${rc.width + pad * 2}px`; overlay.style.height = `${rc.height + pad * 2}px`;
      }
    }
    raf = requestAnimationFrame(placeOverlay);
  }
  function domEmphasize(target, on, info) {
    if (!hasDom) return;
    if (!on) { overlay?.remove(); overlay = null; overlayEl = null; if (raf) cancelAnimationFrame(raf); raf = 0; return; }
    const el = target && target.selector ? document.querySelector(target.selector) : target && target.nodeType === 1 ? target : null;
    if (!el) return;   // nothing to ring (3D target without a hook, or the element is not there yet)
    overlayEl = el; placeN = 0; placed = "";
    overlay = document.createElement("div");
    overlay.className = `sg-emph sg-emph--${info.style} sg-lv-${info.level}${info.calm ? " sg-calm" : ""}`;
    overlay.setAttribute("aria-hidden", "true");
    document.body.appendChild(overlay);
    placeOverlay();
  }

  const core = new StepGuideCore({
    ...o,
    onEmphasize: (target, on, info) => {
      const custom = o.onEmphasize;
      // a selector / element target goes to the built-in overlay unless the game hook handles it (it may also call domEmphasize through return value)
      const handled = custom ? custom(target, on, info) : false;
      if (handled !== true && target && (target.selector || target.nodeType === 1)) domEmphasize(target, on, info);
    },
    onChange: (c) => { render(); o.onChange && o.onChange(c); },
    onDone: (c) => { render(); o.onDone && o.onDone(c); },
  });

  function render() {
    if (!root) return;
    const sn = core.snapshot(), n = core.steps.length;
    const done = core.steps.slice(0, sn.idx).map((s, i) => `<div class="sg-done"><span class="sg-check" aria-hidden="true">✓</span> STEP ${i + 1} ${esc(s.title || "")}</div>`).join("");
    let cur = "";
    if (sn.step && !sn.finished) {
      const s = sn.step, lv = sn.level;
      const hintInCard = !core.say && sn.hintSaid && s.hint;
      cur = `<section class="sg-card sg-lv-${lv}${core.o.calm ? " sg-calm" : ""}" aria-live="polite"><div class="sg-step">STEP ${sn.idx + 1}/${n}</div><div class="sg-title">${esc(s.title || "")}</div>`
        + (lv === "off" ? "" : `<div class="sg-body">${esc(s.body || "")}</div>`)
        + (hintInCard ? `<div class="sg-hint">「${esc(s.hint)}」</div>` : "")
        + `<div class="sg-actions"><button type="button" class="sg-btn sg-next" data-sg="next">次へ</button><button type="button" class="sg-btn sg-skip" data-sg="skip">スキップ</button></div></section>`;
    }
    root.className = "sg-wrap" + (sn.finished && o.hideWhenDone !== false ? " sg-hidden" : "");
    root.innerHTML = done + cur;
  }
  if (root) {
    root.addEventListener("click", (e) => {
      const b = e.target.closest("[data-sg]");
      if (!b) return;
      core.touch();
      if (b.dataset.sg === "next") core.next(); else core.skip();
    });
    container.appendChild(root);
    render();
  }
  if (hasDom && o.auto !== false && !o.now) {
    timer = setInterval(() => core.tick(), 250);
    const t = () => core.touch();
    addEventListener("pointerdown", t, true); addEventListener("keydown", t, true);
    core._off = () => { removeEventListener("pointerdown", t, true); removeEventListener("keydown", t, true); };
  }
  const sg = Object.assign(core, {
    el: root,
    render,
    destroy() { clearInterval(timer); core._off && core._off(); core._emph(false); domEmphasize(null, false, {}); root && root.remove(); },
  });
  gfRegister("stepGuide", () => ({
    snapshot: () => { const n = core.snapshot(); return { idx: n.idx, total: n.total, stepId: n.step ? n.step.id : null, title: n.step ? n.step.title || "" : "", level: n.level, finished: n.finished, skipped: n.skipped, completed: n.completed, hintSaid: n.hintSaid, allFaded: core.allFaded, counts: { ...core.counts } }; },
    drive(action, a = {}) {
      switch (action) {
        case "next": gfEmit("stepGuide", "next", { idx: core.idx }); return core.next() ? gfOk({ idx: core.idx, finished: core.finished }) : gfFail("no step to complete");
        case "skip": core.skip(); return gfOk({ finished: core.finished });
        case "tick": return gfOk({ changed: core.tick(), idx: core.idx });
        case "idle": core.lastActive -= Math.max(0, +a.ms || 0); return gfOk({ changed: core.tick(), hintSaid: core.hintSaid });
        case "reset": core.reset(); return gfOk({ idx: core.idx });
        case "clickNext": { const b = root && root.querySelector('[data-sg="next"]'); return b ? (b.click(), gfOk({ idx: core.idx })) : gfFail("no next button"); }
        default: return gfUnknown(action);
      }
    },
    reset: () => core.reset(),
  }));
  return sg;
}
