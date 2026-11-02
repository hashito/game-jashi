/* game-kit 9a50101: js/flavor.js — edit in game-kit and run tools/kit-sync.js */
// Flavor lines (standard 1.10; feedback 2026-11-02 「フレーバーテキストを全体に追加するべき。『嫌な匂いがする』など、雰囲気を出す目的」):
// short thoughts that only set the mood - a smell, a sound, the cold, something out of place - said in the thought band when the player
// first enters a room, comes near a spot, or has walked a while in silence. They never carry a hint the game needs (that belongs in tasks
// and talk) and never interrupt: a line waits until the thought band is free and is dropped if the moment has passed.
// data/flavor.json (docs/flavor.md):
//   { "every": [45, 80],                       seconds of quiet play between idle lines (min, max)
//     "rooms":  { "ROOM_ID": [line, ...] },    the first visit to the room in each stage says one of these; idle lines also draw from here
//     "stages": { "L2": [line, ...] },         idle lines of that stage (anywhere)
//     "idle":   [line, ...],                   idle lines of any stage
//     "spots":  [{ "x", "z", "r": 2.5, "floor": 0, "text" | "lines": [..], "stage"?: "L2" | [..], "once"?: true }] }
//   line = "text" | { "text", "stage"?: "L2" | ["L2", "L3"] }
const pickStage = (l) => (typeof l === 'string' ? null : l.stage ? [].concat(l.stage) : null);
const textOf = (l) => (typeof l === 'string' ? l : l.text);
const inStage = (l, stage) => { const s = pickStage(l); return !s || s.includes(stage); };

// the decisions, without the game (test/flavor.test.mjs): tick(dt, where) -> a line to say now, or null
export class FlavorPicker {
  constructor(data = {}, { rand = Math.random } = {}) {
    this.d = data; this.rand = rand;
    this.every = data.every || [45, 80];
    this.quiet = 0; this.next = this.span(); this.pending = null; this.seenRooms = new Set(); this.spotsDone = new Set(); this.recent = [];
  }
  span() { const [a, b] = this.every; return a + (b - a) * this.rand(); }
  // remember the stage change: rooms speak again on their first visit of the new stage
  stage(stage) { if (stage !== this.stageId) { this.stageId = stage; this.seenRooms.clear(); for (const k of [...this.spotsDone]) if (!k.startsWith('once:')) this.spotsDone.delete(k); } }
  pool(stage, room) {
    const d = this.d, all = [...((d.stages || {})[stage] || []), ...(((d.rooms || {})[room]) || []), ...(d.idle || [])];
    return all.filter((l) => inStage(l, stage)).map(textOf).filter(Boolean);
  }
  choose(list) {
    if (!list.length) return null;
    const fresh = list.filter((t) => !this.recent.includes(t)), from = fresh.length ? fresh : list;
    const t = from[Math.floor(this.rand() * from.length) % from.length];
    this.recent.push(t); while (this.recent.length > Math.max(1, Math.min(list.length - 1, Math.ceil(list.length * 0.7)))) this.recent.shift();   // never remember the whole pool, or nothing would be fresh
    return t;
  }
  // where: { stage, room, x, z, floor, busy (the thought band is in use), blocked (a window / a chase / a scene) }
  tick(dt, w) {
    this.stage(w.stage);
    if (w.blocked) { this.pending = null; return null; }
    // a room's first visit in this stage
    if (w.room && !this.seenRooms.has(w.room)) {
      this.seenRooms.add(w.room);
      const lines = (((this.d.rooms || {})[w.room]) || []).filter((l) => inStage(l, w.stage)).map(textOf);
      if (lines.length) this.pending = { text: this.choose(lines), room: w.room, ttl: 12 };
    }
    // a spot within reach
    for (const [i, s] of (this.d.spots || []).entries()) {
      const key = `${s.once ? 'once:' : ''}${i}`;
      if (this.spotsDone.has(key) || ((s.floor || 0) !== (w.floor || 0)) || (s.stage && ![].concat(s.stage).includes(w.stage))) continue;
      if (Math.hypot(w.x - s.x, w.z - s.z) > (s.r || 2.5)) continue;
      this.spotsDone.add(key);
      this.pending = { text: s.text || this.choose(s.lines || []), room: w.room, ttl: 8 };
    }
    if (this.pending) {
      this.pending.ttl -= dt;
      if (this.pending.ttl <= 0 || this.pending.room !== w.room) this.pending = null;   // the moment has passed
      else if (!w.busy) { const t = this.pending.text; this.pending = null; this.quiet = 0; return t; }
      return null;
    }
    // quiet play
    if (w.busy) { this.quiet = Math.min(this.quiet, this.next - 6); return null; }   // something was said: wait a little after it
    this.quiet += dt;
    if (this.quiet < this.next) return null;
    this.quiet = 0; this.next = this.span();
    return this.choose(this.pool(w.stage, w.room));
  }
}

// in the game: one picker, ticked by game-core's systems; says through the thought band (ctx.monologue) in a softer style
export function installFlavor(ctx, data) {
  const picker = new FlavorPicker(data);
  const stageId = () => { const L = ctx.prog && ctx.prog.def && ctx.prog.def.levels; return L && L[ctx.prog.index] ? L[ctx.prog.index].id : ''; };
  const update = (dt, c, active) => {
    if (!ctx.state.started) return;
    const p = ctx.camera.position, ui = ctx.ui;
    const blocked = !active || (ctx.wm && ctx.wm.isOpen) || (ui && ui.open) || !!(ctx.fxState && (ctx.fxState.chasing || ctx.fxState.danger > 0.5)) || !!ctx.flavorOff;
    const busy = !!(ui && ui.sayLine && (ui.sayLine.cur || ui.sayLine.q.length));
    const t = picker.tick(Math.min(dt, 0.25), { stage: stageId(), room: ctx.state.room, x: p.x, z: p.z, floor: ctx.floor || 0, busy, blocked });
    if (t) { ctx.monologue(t, 4.5); ctx.bus.emit('flavor:said', { text: t }); }
  };
  return { picker, update };
}
