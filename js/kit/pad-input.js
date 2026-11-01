/* game-kit 6e0b6f0: js/pad-input.js — edit in game-kit and run tools/kit-sync.js */
// Game controller (pad) for the standard 3D games (standard 1.5). game-core wires it; a game does not write its own (届けるな's js/ext/input.js is this).
// Standard mapping only (Xbox / PlayStation / Switch pro through the browser's Gamepad API). Pure core: no DOM, the pads and the callbacks are injected, so it runs in Node.
//
//   left stick   walk                 right stick   look                 LT / L3   run (held)
//   A            [E] interact (Enter in a window)       B   Escape (close)  in a window only
//   X            items (KeyI)         Y   the terminal menu (Tab)         LB / RB   tabs (KeyQ / KeyR)
//   Back         map (KeyM)           Start   pause (Escape)              d-pad     arrows (choose in a window)
//   const pad = new PadInput({ getPads: () => navigator.getGamepads(), onKey(code, down), onMove(x, y), onLook(dx, dy), onRun(on), windowOpen: () => wm.isOpen, blocked: () => ..., onUse: () => im.set('pad'), buttons: { 2: 'KeyG' } });
//   each frame: pad.poll(dt)   (the first real use calls onUse once; a stick at rest or a connected pad that nobody touches does not count)
export const PAD = { dead: 0.18, look: 2.6, trigger: 0.5 };
export const deadzone = (v, d = PAD.dead) => (Math.abs(v || 0) > d ? v : 0);

// button index -> key code. `open` = a window / the menu is open (A confirms, B closes)
export const BUTTONS = { 0: 'KeyE', 2: 'KeyI', 3: 'Tab', 4: 'KeyQ', 5: 'KeyR', 8: 'KeyM', 9: 'Escape', 12: 'ArrowUp', 13: 'ArrowDown', 14: 'ArrowLeft', 15: 'ArrowRight' };
export function keyFor(i, open, over = null) {
  if (!open && over && over[i]) return over[i];   // game.json controls.pad.buttons: { "2": "KeyG" } replaces the walking mapping of a button
  if (open) { if (i === 0) return 'Enter'; if (i === 1) return 'Escape'; if (i === 3) return 'Escape'; if (i === 9) return 'Escape'; if (i === 2) return null; }
  else if (i === 1 || i === 12 || i === 13 || i === 14 || i === 15) return null; // B and the d-pad do nothing while walking
  return BUTTONS[i] || null;
}
export const pickPad = (pads) => { for (const p of pads || []) if (p && p.connected && p.mapping === 'standard') return p; return null; };

export class PadInput {
  constructor(o) {
    this.o = { dead: PAD.dead, lookSpeed: PAD.look, ...o };
    this.prev = []; this.on = false; this.running = false; this.used = false; this.padId = null;
  }
  get connected() { return this.on; }
  poll(dt) {
    const o = this.o, gp = pickPad(o.getPads && o.getPads());
    if (!gp) { if (this.on) { this.on = false; o.onMove && o.onMove(0, 0); if (this.running) { this.running = false; o.onRun && o.onRun(false); } } return false; }
    this.on = true; this.padId = gp.id;
    const ax = (i) => deadzone(gp.axes[i], o.dead), btn = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
    const open = !!(o.windowOpen && o.windowOpen()), blocked = !!(o.blocked && o.blocked());
    const act = Math.abs(ax(0)) + Math.abs(ax(1)) + Math.abs(ax(2)) + Math.abs(ax(3)) > 0 || gp.buttons.some((b, i) => b && b.pressed && !this.prev[i]);
    if (act && !this.used) { this.used = true; o.onUse && o.onUse(); } else if (act && o.onUse && o.always) o.onUse();
    const free = !open && !blocked;
    o.onMove && o.onMove(free ? ax(0) : 0, free ? ax(1) : 0);
    if (free && o.onLook) { const k = dt * this.o.lookSpeed; if (ax(2) || ax(3)) o.onLook(ax(2) * k, ax(3) * k * 0.8); }
    const run = free && (btn(10) || ((gp.buttons[6] && gp.buttons[6].value) || 0) > PAD.trigger || btn(6));
    if (run !== this.running) { this.running = run; o.onRun && o.onRun(run); }
    for (let i = 0; i < gp.buttons.length; i++) {
      const down = btn(i);
      if (down !== !!this.prev[i]) {
        const code = keyFor(i, open, o.buttons);
        // while the game is blocked (a card, a mini game) only the window keys get through
        if (code && (open || !blocked || code === 'Escape')) o.onKey && o.onKey(code, down, i);
      }
      this.prev[i] = down;
    }
    return true;
  }
}
