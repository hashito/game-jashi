/* game-kit 6e0b6f0: js/look-input.js — edit in game-kit and run tools/kit-sync.js */
// Mouse and touch look for first-person games that keeps working on every kind of PC.
//
// Why this exists (2026-10, 『未然調書』「マウスが効きません」): first-person games decided "touch or mouse" once,
// from matchMedia('(pointer: coarse)'), and then only requested pointer lock and only read movementX while
// locked. That breaks in four ways the player cannot see:
//   1. a touch-screen laptop / 2-in-1 reports a coarse (or touch-capable) pointer: the game becomes touch-only,
//      never locks, ignores the mouse, and lays the invisible touch-look pad over the right half of the screen;
//   2. the browser refuses the lock (re-request within ~1 s of Esc, no user gesture after a window closed with
//      Esc, a sandboxed frame, a browser setting): the rejection was swallowed and nothing moved;
//   3. after a window closes, the re-lock without a gesture fails silently and there is no "click to resume";
//   4. the mouse handler itself threw (a field named like the look method shadowed it), and nothing told you.
// The rules here:
//   - mouse and touch are both accepted all the time. The mode (for the HUD: touch pad and buttons or not, key
//     names in hints) comes from any-pointer: fine / hover and then from the LAST trusted input event;
//   - a mouse press on the view requests pointer lock (not within `cooldown` ms of the last exit: the browser
//     would refuse); while the button is held and the view is not locked, the drag moves the view (drag-look);
//   - pointerlockerror / a rejected request switches to drag-look with a short on-screen note; the next click
//     tries again;
//   - when the lock is lost or a window closes, a visible "クリックで視点操作に戻る" prompt is shown (not a silent
//     re-lock attempt); cursor: none is set only on the locked element while it is locked;
//   - optional: arrow keys and the wheel turn the view (keys: true / wheel: true).
//
//   const mode = new InputMode({ onChange: (m) => hud.classList.toggle("touch", m === "touch") });
//   const look = new LookInput(canvas, {
//     onLook: (dx, dy, kind) => player.turn(dx * k, dy * k), // pixels; kind: lock | drag | key | wheel
//     blocked: () => ui.open || !started,                    // windows open: no lock, no drag, no prompt
//     onExit: () => ui.menu(),                               // the player's Esc released the lock
//     mode,
//   });
//   ui.onOpen = () => look.release();  ui.onClose = () => look.resume();  // each frame: look.update(dt)
//   look.state() -> { locked, mode, fallback, prompt, note, cursor, lastError }  (window.__lookInput() in pages;
//   window.__look() is kept as an alias when nothing else - render-presets - owns window.__look)

const NOW = () => (globalThis.performance && performance.now ? performance.now() : Date.now());

// ---- input mode ----------------------------------------------------------------------------------------
export function readEnv(win = globalThis) {
  const mm = (q) => {
    try {
      return !!(win.matchMedia && win.matchMedia(q).matches);
    } catch {
      return false;
    }
  };
  const nav = win.navigator || {};
  return {
    fine: mm("(any-pointer: fine)"),
    anyHover: mm("(any-hover: hover)"),
    primaryCoarse: mm("(pointer: coarse)"),
    primaryNoHover: mm("(hover: none)"),
    touchPoints: nav.maxTouchPoints || 0,
  };
}

// the first guess, before any input: a phone / tablet (coarse primary pointer that cannot hover, no fine
// pointer anywhere) starts in touch; anything with a mouse or a trackpad starts in mouse, even with a touch
// screen. The first touch / mouse event corrects it either way.
export function initialMode(env) {
  if (env.primaryCoarse && env.primaryNoHover && !env.fine) return "touch";
  if (env.fine || env.anyHover) return "mouse";
  return env.touchPoints > 0 || env.primaryCoarse ? "touch" : "mouse";
}

// the mode after one event (null: the event says nothing). Untrusted events (on-screen buttons that
// dispatch KeyboardEvents) are ignored; so is a mouse "move" with no movement (some touch screens send one).
export function modeFromEvent(ev, untrusted = false) {
  if (!ev || (ev.isTrusted === false && !untrusted)) return null;
  const t = ev.type || "";
  if (t.startsWith("touch")) return "touch";
  if (t.startsWith("pointer")) {
    if (ev.pointerType === "touch" || ev.pointerType === "pen") return "touch";
    if (ev.pointerType === "mouse") {
      if (t === "pointermove" && !ev.movementX && !ev.movementY && !ev.buttons) return null;
      return "mouse";
    }
    return null;
  }
  if (t === "keydown") return "mouse";
  if (t === "wheel") return "mouse";
  return null;
}

export class InputMode {
  constructor(o = {}) {
    const win = o.window || globalThis;
    this.env = o.env || readEnv(win);
    this.mode = o.mode || initialMode(this.env);
    this.onChange = o.onChange || null;
    this.untrusted = !!o.untrusted; // tests: accept synthetic events
    this.pinned = !!o.pin; // ?touch=1 and tests: the mode is fixed, events do not change it
    this.root = o.root !== undefined ? o.root : win.document && win.document.documentElement;
    this.touchCapable = this.env.touchPoints > 0 || this.env.primaryCoarse;
    this.mouseCapable = this.env.fine || this.env.anyHover;
    this._on = [];
    const t = o.target || (win.addEventListener ? win : null);
    if (t) for (const ev of ["pointerdown", "pointermove", "touchstart", "keydown", "wheel"]) this._listen(t, ev, (e) => this.feed(e));
    this._apply();
  }
  _listen(t, ev, f) {
    t.addEventListener(ev, f, { capture: true, passive: true });
    this._on.push([t, ev, f]);
  }
  feed(ev) {
    if (this.pinned) return this.mode;
    const m = modeFromEvent(ev, this.untrusted);
    if (!m || m === this.mode) return this.mode;
    this.mode = m;
    if (m === "touch") this.touchCapable = true;
    else this.mouseCapable = true;
    this._apply();
    if (this.onChange) this.onChange(m);
    return m;
  }
  _apply() {
    if (this.root && this.root.dataset) this.root.dataset.input = this.mode; // CSS: html[data-input=touch]
  }
  // a mode from outside the DOM events: "pad" when a game controller is used (the next mouse / touch event takes over again)
  set(m) {
    if (m === this.mode) return this.mode;
    this.mode = m;
    this._apply();
    if (this.onChange) this.onChange(m);
    return m;
  }
  get touch() {
    return this.mode === "touch";
  }
  dispose() {
    for (const [t, ev, f] of this._on) t.removeEventListener(ev, f, { capture: true });
  }
}

// ---- look ----------------------------------------------------------------------------------------------
// Chrome on Windows sometimes reports one huge movementX right after locking / at a monitor edge
export function clampSpike(d, max = 350) {
  return Math.abs(d) > max ? 0 : d;
}

const ARROWS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
// keyboard look: pixels for this frame from the held arrow keys (speed in px per second)
export function keyLook(keys, dt, speed = 520) {
  let x = 0;
  let y = 0;
  for (const k of keys) {
    const a = ARROWS[k];
    if (a) {
      x += a[0];
      y += a[1];
    }
  }
  return [x * speed * dt, y * speed * dt * 0.7];
}

export const TEXT = {
  prompt: "クリックで視点操作に戻る",
  failed: "マウスを固定できませんでした。ドラッグで見回せます（クリックでもう一度固定を試します）",
  cooldown: "もう一度クリックすると視点操作に戻ります",
  drag: "ドラッグで見回せます",
};

export class LookInput {
  constructor(el, o = {}) {
    this.el = el;
    this.doc = o.document || el.ownerDocument || globalThis.document;
    this.win = o.window || this.doc.defaultView || globalThis;
    this.onLook = o.onLook || (() => {});
    this.blocked = o.blocked || (() => false);
    this.onExit = o.onExit || null;
    this.onLock = o.onLock || null;
    this.onFail = o.onFail || null; // (reason) the browser refused the lock: drag-look is on (a game with its own pause can resume play)
    this.mode = o.mode || null; // an InputMode, or null (then: mouse unless the event says touch)
    this.cooldown = o.cooldown ?? 1100;
    this.now = o.now || NOW;
    this.text = { ...TEXT, ...(o.text || {}) };
    this.keysOn = !!o.keys;
    this.wheelOn = !!o.wheel;
    this.lockOn = o.lock !== false; // false: drag-look only (e.g. a page in an iframe without allow-pointer-lock)
    this.keys = new Set();
    this.lastExit = -1e9;
    this.lastError = null;
    this.fallback = false; // the browser refused the lock: drag-look until a click locks
    this.releasing = false;
    this.pending = false;
    this.drag = null;
    this.promptOn = false;
    this.noteText = "";
    this._noteT = 0;
    this._was = false;
    this._on = [];
    this._makeUi(o);
    const on = (t, ev, f, opt) => (t.addEventListener(ev, f, opt), this._on.push([t, ev, f, opt]));
    on(this.doc, "pointerlockchange", () => this._change());
    on(this.doc, "pointerlockerror", () => this._failed("pointerlockerror"));
    on(this.doc, "mousemove", (e) => {
      if (!this.locked) return;
      if (this.blocked()) return;
      this._look(clampSpike(e.movementX || 0), clampSpike(e.movementY || 0), "lock");
    });
    on(el, "pointerdown", (e) => this._down(e));
    // the drag is followed on the document: a refused lock can drop the pointer capture, and the pointer
    // may leave the canvas (over the HUD) while the button is held
    on(this.doc, "pointermove", (e) => this._move(e));
    const up = (e) => this._up(e);
    on(this.doc, "pointerup", up);
    on(this.doc, "pointercancel", up);
    if (this.keysOn) {
      on(this.win, "keydown", (e) => {
        if (ARROWS[e.code]) this.keys.add(e.code);
      });
      on(this.win, "keyup", (e) => this.keys.delete(e.code));
      on(this.win, "blur", () => this.keys.clear());
    }
    if (this.wheelOn)
      on(
        el,
        "wheel",
        (e) => {
          if (this.blocked()) return;
          e.preventDefault && e.preventDefault();
          // a horizontal wheel / trackpad swipe turns; shift + wheel turns too
          const dx = e.deltaX || (e.shiftKey ? e.deltaY : 0);
          const dy = e.shiftKey ? 0 : e.deltaY * 0.5;
          this._look(dx * 0.6, dy * 0.6, "wheel");
        },
        { passive: false },
      );
    if (this.promptEl) on(this.promptEl, "click", (e) => (e.stopPropagation && e.stopPropagation(), this.lock()));
    if (this.doc === globalThis.document && typeof window !== "undefined") {
      window.__lookInput = () => this.state();
      // backward-compatible alias: window.__look() was this function's old name. render-presets owns window.__look
      // (the preset object) when a page uses it, so the alias only fills an empty slot or replaces an older alias.
      const old = window.__look;
      if (old === undefined || (typeof old === "function" && old.__lookInputAlias)) window.__look = Object.assign(() => this.state(), { __lookInputAlias: true });
    }
    this._sync();
  }

  _makeUi(o) {
    const d = this.doc;
    if (!d.createElement || o.ui === false) return;
    const host = d.body || d.documentElement;
    const n = d.createElement("div");
    n.className = "kit-look-note";
    n.setAttribute("role", "status");
    n.style.cssText =
      "position:fixed;left:50%;top:14%;transform:translateX(-50%);padding:8px 14px;border-radius:8px;background:rgba(0,0,0,.7);color:#fff;font:16px/1.4 system-ui,sans-serif;z-index:70;display:none;pointer-events:none;max-width:90vw;text-align:center";
    host.appendChild(n);
    this.noteEl = n;
    if (o.prompt === false) return; // the game shows its own "click to resume" (a pause screen)
    const p = d.createElement("div");
    p.className = "kit-look-prompt";
    p.setAttribute("role", "button");
    p.style.cssText =
      "position:fixed;left:50%;bottom:22%;transform:translateX(-50%);padding:10px 18px;border-radius:8px;background:rgba(0,0,0,.74);color:#fff;font:16px/1.4 system-ui,sans-serif;cursor:pointer;z-index:70;display:none;max-width:90vw;text-align:center";
    host.appendChild(p);
    this.promptEl = p;
  }

  get locked() {
    return this.doc.pointerLockElement === this.el;
  }
  get touchMode() {
    return !!(this.mode && this.mode.mode === "touch");
  }

  // from a user gesture (a click, a key handler); does nothing while a window is open
  lock() {
    if (!this.lockOn || this.blocked() || this.locked || this.pending) return false;
    if (!this.el.requestPointerLock) return this._failed("unsupported"), false;
    if (this.now() - this.lastExit < this.cooldown) {
      // the browser refuses for about a second after an exit: say "click again" instead of failing silently
      this.note(this.text.cooldown, 2.5);
      this._sync();
      return false;
    }
    this.pending = true;
    let p;
    try {
      p = this.el.requestPointerLock();
    } catch (e) {
      this.pending = false;
      this._failed(String((e && e.name) || e));
      return false;
    }
    if (p && p.then)
      p.then(
        () => (this.pending = false),
        (e) => {
          this.pending = false;
          this._failed(String((e && e.name) || e));
        },
      );
    else this.pending = false; // old API: pointerlockchange / pointerlockerror tell the result
    return true;
  }

  // our own release (a window, a card or the ending opens): not the player's Esc, so no onExit
  release() {
    this.keys.clear();
    this.drag = null;
    if (this.locked && this.doc.exitPointerLock) {
      this.releasing = true;
      this.doc.exitPointerLock();
    }
    this._sync();
  }

  // a window closed: lock again only while this is a user gesture and the browser will accept it,
  // otherwise show the prompt (the player clicks it, or the view)
  resume() {
    if (this.blocked() || this.touchMode) return this._sync();
    const ua = this.win.navigator && this.win.navigator.userActivation;
    const gesture = ua ? ua.isActive : true;
    if (gesture && this.now() - this.lastExit >= this.cooldown && !this.fallback) this.lock();
    this._sync();
  }

  note(text, sec = 3) {
    this.noteText = text;
    this._noteT = sec;
    if (this.noteEl) {
      this.noteEl.textContent = text;
      this.noteEl.style.display = text ? "block" : "none";
    }
  }

  // each frame: keyboard look and the note timer
  update(dt) {
    if (!!this.promptEl && this._wantPrompt() !== this.promptOn) this._sync(); // a window opened / closed without release() / resume()
    if (this._noteT > 0 && (this._noteT -= dt) <= 0) this.note("", 0);
    if (this.keysOn && this.keys.size && !this.blocked()) {
      const [x, y] = keyLook(this.keys, dt);
      if (x || y) this._look(x, y, "key");
    }
  }

  _look(dx, dy, kind) {
    try {
      this.onLook(dx, dy, kind);
    } catch (e) {
      // a broken handler must be visible in the console once, not swallowed per frame
      if (!this._threw) console.error("LookInput onLook threw", e);
      this._threw = true;
      this.lastError = "onLook: " + String((e && e.message) || e);
    }
  }

  _down(e) {
    if (e.pointerType && e.pointerType !== "mouse") return; // touch / pen: the game's own touch look
    if (e.button !== undefined && e.button !== 0) return;
    if (this.blocked()) return;
    if (this.mode) this.mode.feed(e);
    this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
    try {
      this.el.setPointerCapture && e.pointerId !== undefined && this.el.setPointerCapture(e.pointerId);
    } catch {
      /* not capturable: drag still works while over the view */
    }
    if (!this.locked) this.lock();
    this._sync();
  }
  _move(e) {
    const d = this.drag;
    if (!d || this.locked || (e.pointerId !== undefined && e.pointerId !== d.id)) return;
    if (e.buttons !== undefined && !(e.buttons & 1)) return this._up(e);
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    d.x = e.clientX;
    d.y = e.clientY;
    if (!this.blocked()) this._look(dx, dy, "drag");
  }
  _up(e) {
    if (!this.drag || (e && e.pointerId !== undefined && this.drag.id !== undefined && e.pointerId !== this.drag.id)) return;
    this.drag = null;
    this._sync();
  }

  _failed(reason) {
    this.lastError = reason;
    this.pending = false;
    if (!this.blocked()) {
      this.fallback = true;
      this.note(this.text.failed, 5);
    }
    this._sync();
    if (this.onFail) this.onFail(reason);
  }

  _change() {
    const locked = this.locked;
    this.pending = false;
    if (locked) {
      this.fallback = false;
      this.drag = null;
      this.note("", 0);
      if (this.onLock) this.onLock();
    } else if (this._was) {
      this.lastExit = this.now();
      this.keys.clear();
      const ours = this.releasing;
      this.releasing = false;
      if (!ours && this.onExit) this.onExit();
    }
    this._was = locked;
    this._sync();
  }

  _wantPrompt() {
    return this.lockOn && !this.locked && !this.blocked() && !this.touchMode && !this.drag;
  }

  _sync() {
    const locked = this.locked;
    // the cursor is hidden only on the locked view, never on the page
    this.el.style.cursor = locked ? "none" : this.drag ? "grabbing" : "";
    this.promptOn = !!this.promptEl && this._wantPrompt();
    if (this.promptEl) {
      this.promptEl.textContent = this.fallback ? this.text.drag + "／クリックで固定" : this.text.prompt;
      this.promptEl.style.display = this.promptOn ? "block" : "none";
    }
  }

  state() {
    this._sync();
    return {
      locked: this.locked,
      mode: this.mode ? this.mode.mode : "mouse",
      fallback: this.fallback,
      prompt: this.promptOn,
      note: this.noteText,
      dragging: !!this.drag,
      cursor: this.el.style.cursor,
      lastError: this.lastError,
    };
  }

  dispose() {
    for (const [t, ev, f, opt] of this._on) t.removeEventListener(ev, f, opt);
    if (this.promptEl && this.promptEl.remove) this.promptEl.remove();
    if (this.noteEl && this.noteEl.remove) this.noteEl.remove();
  }
}
