/* game-kit 4b9f6fa: js/monster-ai.js — edit in game-kit and run tools/kit-sync.js */
// The standard monster's behaviour (rules S12, S20). Pure: no DOM, no THREE, runs in Node (tests, tools/check-escape.mjs).
// The 3D body, the sounds and the screen effects are in js/monster-std.js; it feeds this class the player and reads { pos, yaw, state, visible }.
//
//   const ai = new MonsterAI(nav, { preset: 'early', route: nav.routes[0].points });   // nav: js/monster-nav.js navFromPlan() or any { path, los }
//   ai.spawnAt({ x, z });  ai.update(dt, { x, z, floor, hidden });  for (const e of ai.events) ...
//
// States:  idle -> wander (patrol the plan's loops / routes) -> [notices the player] -> chase -> lose -> seek (last seen place) -> idle ...
//   * Noticing: the player is in the vision cone (fov, sight) and no wall between, for `notice` seconds; or within `near` metres with a line of sight.
//   * Contact kills in EVERY state (S12). Calm mode only softens the presentation, it never makes the monster harmless. The only harmless
//     appearance is the scripted near attack (NearAttack below), and it is used once.
//   * Early game (S20, preset "early"): the chase is slower than running and faster than walking, it is short, and it is lost when the line of
//     sight is broken (`noLos`), when two corners lie between (`corners`), when the player is far (`dist`), when the player is hidden (`hide`)
//     or when the chase has gone on too long (`cap`). Failing (stopping, a dead end, contact) still kills.
//   * Events: { type: 'state'|'notice'|'lose'|'catch'|'hint'|'step', ... }; a 'hint' is the protagonist's line ("走れ" "曲がれ" "隠れろ").
export const PLAYER = { walk: 2.2, run: 3.8 }; // js/controller.js defaults
export const WITNESS = 8; // a hiding place does not work if the monster is closer than this with a line of sight when the player gets in

const base = {
  speed: { wander: 0.9, seek: 1.4, chase: 3.4 },
  sight: 12, fov: 130, near: 1.8, notice: 1.0, catch: 0.9,
  idle: [2, 5], look: 2.2, loseTime: 1.6, reacquire: 2.5,
  lose: { noLos: 4, corners: 2, cornersDelay: 1.0, dist: 20, cap: 30, hide: 1.2 },
  hints: true, hintText: { run: '走れ！', turn: '曲がれ！', hide: '隠れろ！' }, // wording-ok: urgent chase hints, the protagonist's own voice
};
export const PRESETS = {
  // S20: a calm player can get away. chase is between walk (2.2) and run (3.8)
  early: { ...base, speed: { wander: 0.9, seek: 1.3, chase: 3.0 }, sight: 11, fov: 120, near: 1.8, notice: 1.1, catch: 0.85, lose: { noLos: 3, corners: 2, cornersDelay: 0.8, dist: 16, cap: 18, hide: 1.2 } },
  normal: { ...base },
  // later chapters: faster than running; only a door, a hiding place or the chapter's trick saves you
  hunter: { ...base, speed: { wander: 1.1, seek: 1.8, chase: 4.1 }, sight: 14, fov: 150, near: 2.4, notice: 0.7, lose: { noLos: 6, corners: 3, cornersDelay: 2.5, dist: 30, cap: 45, hide: 2 } },
};
export function resolveParams(preset = 'normal', over = {}) {
  const b = typeof preset === 'string' ? PRESETS[preset] : preset;
  if (!b) throw new Error(`monster preset "${preset}" is not one of ${Object.keys(PRESETS).join(', ')}`);
  return { ...b, ...over, speed: { ...b.speed, ...(over.speed || {}) }, lose: { ...b.lose, ...(over.lose || {}) }, hintText: { ...b.hintText, ...(over.hintText || {}) } };
}
// S20: can a calm player get away from this chase? (the chase must be slower than running and, so the player is not simply caught, no slower than walking is not required:
// a monster slower than walking is fine too). Used by the schema check and check-escape.
export function outrunnable(p, player = PLAYER) { return p.speed.chase < player.run - 0.2 && p.lose.cap > 0 && p.lose.cap <= 60; }
export function earlyOk(p, player = PLAYER) { return p.speed.chase > player.walk && outrunnable(p, player); }

const rad = (d) => (d * Math.PI) / 180;
const dist2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export class MonsterAI {
  constructor(nav, o = {}) {
    this.nav = nav;
    this.p = resolveParams(o.preset || 'normal', o.params || {});
    this.rand = o.rand || Math.random;
    this.route = o.route || null; // [{x,z}] patrol waypoints (cyclic)
    this.reset();
  }
  reset() {
    this.state = 'off';
    this.pos = { x: 0, z: 0, floor: 0 };
    this.yaw = 0;
    this.t = 0; // time in state
    this.path = null; this.pi = 0; this.repath = 0;
    this.target = null; // [seek / wander] where it is going
    this.seen = 0; // seconds the player has been in view
    this.lastSeen = null;
    this.noLosT = 0; this.cornersT = 0; this.chaseT = 0; this.hideT = 0;
    this.blockNotice = 0; this.routeIdx = 0; this.idleFor = 0; this.lookT = 0;
    this.witnessed = false; this.wasHidden = false;
    this.hintAt = { run: -9, turn: -9, hide: -9 }; this.hintCount = { run: 0, turn: 0, hide: 0 }; this.clock = 0;
    this.events = []; this.noticed = 0; this.lost = 0; this.caught = false; this.speed = 0; this.moving = false;
    this.lastP = null; this.stillT = 0; this.pauseT = 0;
  }
  get active() { return this.state !== 'off'; }
  get chasing() { return this.state === 'chase'; }
  emit(type, o = {}) { this.events.push({ type, ...o }); }
  set(state) {
    if (this.state === state) return;
    const from = this.state;
    this.state = state; this.t = 0;
    this.emit('state', { from, to: state });
  }
  spawnAt(pt, state = 'idle') {
    this.pos = { x: pt.x, z: pt.z, floor: pt.floor || 0 };
    this.path = null; this.caught = false;
    this.idleFor = this.p.idle[0] + this.rand() * (this.p.idle[1] - this.p.idle[0]);
    this.set(state);
  }
  despawn() { this.state = 'off'; this.path = null; }

  // ---- perception ----
  canSee(P, d = dist2(this.pos, P)) {
    if (P.hidden && !this.witnessed) return false;
    if ((P.floor || 0) !== (this.pos.floor || 0) || d > this.p.sight * (P.visibility ?? 1)) return false;   // P.visibility (standard 1.7): crouching / a light change how far it notices you
    if (d > this.p.near * (P.visibility ?? 1) + 1.2) {
      const dx = P.x - this.pos.x, dz = P.z - this.pos.z, l = d || 1;
      const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
      if ((dx * fx + dz * fz) / l < Math.cos(rad(this.p.fov / 2))) return false;
    }
    return this.nav.los(this.pos, P);
  }
  // chasing it sees all around (it has already got you)
  seesAround(P, d = dist2(this.pos, P)) {
    if (P.hidden && !this.witnessed) return false;
    return (P.floor || 0) === (this.pos.floor || 0) && d <= this.p.sight * 1.4 * (P.visibility ?? 1) && this.nav.los(this.pos, P);
  }

  // ---- movement ----
  goTo(pt) {
    this.target = { x: pt.x, z: pt.z, floor: pt.floor || 0 };
    this.path = this.nav.path(this.pos, this.target);
    this.pi = 0; this.repath = 0.3;
    return !!this.path;
  }
  walk(dt, speed) {
    this.moving = false; this.speed = speed;
    if (this.pauseT > 0) { this.pauseT -= dt; this.speed = 0; return false; }   // a short stop (it opens a door: monster-std opensDoors)
    if (!this.path || this.pi >= this.path.length) return true;
    let step = speed * dt;
    while (step > 0 && this.pi < this.path.length) {
      const w = this.path[this.pi];
      if ((w.floor || 0) !== (this.pos.floor || 0)) { this.pos.floor = w.floor || 0; }
      const dx = w.x - this.pos.x, dz = w.z - this.pos.z, d = Math.hypot(dx, dz);
      if (d > 1e-4) this.yaw = Math.atan2(dx, dz);
      if (d <= step) { this.pos.x = w.x; this.pos.z = w.z; step -= d; this.pi++; } else { this.pos.x += (dx / d) * step; this.pos.z += (dz / d) * step; step = 0; }
      this.moving = true;
    }
    return this.pi >= this.path.length;
  }
  nextWaypoint() {
    if (this.route && this.route.length) {
      // the route point nearest ahead of where it is
      this.routeIdx = (this.routeIdx + 1) % this.route.length;
      return this.route[this.routeIdx];
    }
    const r = this.nav.rooms;
    const room = r[Math.floor(this.rand() * r.length)];
    return room ? { x: room.cx, z: room.cz, floor: room.floor } : null;
  }

  // ---- the player noticed us / we noticed the player ----
  startChase(P, first) {
    this.seen = 0; this.noLosT = 0; this.cornersT = 0; this.chaseT = 0; this.hideT = 0;
    this.lastSeen = { x: P.x, z: P.z, floor: P.floor || 0 };
    this.noticed++;
    this.set('chase');
    this.emit('notice', { first: this.noticed === 1, dist: dist2(this.pos, P) });
    if (this.p.hints) this.hint('run');
    this.repath = 0;
  }
  hint(kind) {
    if (!this.p.hints || this.hintCount[kind] >= 3 || this.clock - this.hintAt[kind] < 4.5) return;
    this.hintAt[kind] = this.clock; this.hintCount[kind]++;
    this.emit('hint', { kind, text: this.p.hintText[kind] });
  }

  // P: { x, z, floor?, hidden? }. Returns this.events (cleared at the start of each update).
  update(dt, P) {
    this.events.length = 0;
    if (this.state === 'off') return this.events;
    this.clock += dt; this.t += dt;
    if (this.blockNotice > 0) this.blockNotice -= dt;
    const d = (P.floor || 0) === (this.pos.floor || 0) ? dist2(this.pos, P) : Infinity;
    // a hiding place only works if it did not see you get in
    if (P.hidden && !this.wasHidden) this.witnessed = d < WITNESS && this.nav.los(this.pos, P) && (this.state === 'chase');
    if (!P.hidden) this.witnessed = false;
    this.wasHidden = !!P.hidden;
    // stillness of the player (for the hint "run" when it stops)
    if (this.lastP && dist2(this.lastP, P) / Math.max(dt, 1e-3) < 0.3) this.stillT += dt; else this.stillT = 0;
    this.lastP = { x: P.x, z: P.z };
    // contact kills in every state
    if (!this.caught && d < this.p.catch && !(P.hidden && !this.witnessed)) {
      this.caught = true;
      this.emit('catch', { state: this.state });
      this.set('lose');
      return this.events;
    }
    switch (this.state) {
      case 'idle': {
        this.moving = false; this.speed = 0;
        if (this.noticeCheck(dt, P, d)) break;
        if (this.t >= this.idleFor) { const w = this.nextWaypoint(); if (w && this.goTo(w)) { this.set('wander'); } else this.t = 0; }
        break;
      }
      case 'wander': {
        if (this.noticeCheck(dt, P, d)) break;
        if (this.walk(dt, this.p.speed.wander)) { this.idleFor = this.p.idle[0] + this.rand() * (this.p.idle[1] - this.p.idle[0]); this.set('idle'); }
        break;
      }
      case 'seek': {
        if (this.noticeCheck(dt, P, d)) break;
        if (this.walk(dt, this.p.speed.seek)) {
          this.moving = false; this.lookT += dt; this.yaw += dt * 1.1; // looks around
          if (this.lookT >= this.p.look) { this.lookT = 0; this.idleFor = 1; this.set('idle'); }
        }
        break;
      }
      case 'chase': this.updateChase(dt, P, d); break;
      case 'lose': {
        this.moving = false; this.speed = 0;
        if (this.t >= this.p.loseTime) {
          if (this.caught) { this.caught = false; this.set('idle'); break; } // the game kills the player and resets us; a stray frame must not loop
          this.blockNotice = this.p.reacquire;
          if (this.lastSeen && this.goTo(this.lastSeen)) { this.lookT = 0; this.set('seek'); } else { this.idleFor = 2; this.set('idle'); }
        }
        break;
      }
    }
    return this.events;
  }

  noticeCheck(dt, P, d) {
    const close = d < this.p.near * (P.visibility ?? 1) && this.nav.los(this.pos, P) && !(P.hidden && !this.witnessed);
    const sees = this.canSee(P, d);
    if (sees && this.blockNotice <= 0) this.seen += dt; else this.seen = Math.max(0, this.seen - dt * 0.5);
    if ((close && this.blockNotice <= 0) || this.seen >= this.p.notice) { this.startChase(P, true); return true; }
    if (close || sees) this.lastSeen = { x: P.x, z: P.z, floor: P.floor || 0 };
    return false;
  }

  updateChase(dt, P, d) {
    const L = this.p.lose;
    this.chaseT += dt;
    const sees = this.seesAround(P, d);
    if (sees) { this.noLosT = 0; this.lastSeen = { x: P.x, z: P.z, floor: P.floor || 0 }; } else this.noLosT += dt;
    // where it heads: the player while it sees them, else the last place it saw them
    const goal = sees ? P : this.lastSeen || P;
    if (this.repath <= 0 || !this.path) { this.goTo(goal); this.repath = 0.25; } else this.repath -= dt;
    const arrived = this.walk(dt, this.p.speed.chase);
    // lose conditions (S20)
    let why = null;
    if (P.hidden && !this.witnessed) { this.hideT += dt; if (this.hideT >= L.hide) why = 'hidden'; } else this.hideT = 0;
    if (!sees) {
      if (this.noLosT >= L.noLos) why = why || 'sight';
      if (arrived && this.noLosT > 0.6) why = why || 'arrived';
      if (L.corners) {
        const pth = this.nav.path(this.pos, P);
        if (pth && this.nav.corners(pth, this.pos) >= L.corners) { this.cornersT += dt; if (this.cornersT >= L.cornersDelay) why = why || 'corners'; } else this.cornersT = 0;
      }
    } else this.cornersT = 0;
    if (d > L.dist) why = why || 'distance';
    if (this.chaseT >= L.cap) why = why || 'cap';
    if (why) { this.lost++; this.emit('lose', { why }); this.set('lose'); return; }
    this.chaseHints(P, d, sees);
  }
  chaseHints(P, d, sees) {
    if (!this.p.hints) return;
    if (d < 7 && this.stillT > 0.8) this.hint('run');
    if (this.chaseT > 2 && this.nav.graph) {
      const near = (kind, r) => this.nav.graph.nodes.some((n) => n.kind === kind && (n.floor || 0) === (P.floor || 0) && dist2(n, P) < r);
      if (sees && d > 2.5 && near('door', 6)) this.hint('turn');
      if (d > 3 && near('hide', 7)) this.hint('hide');
    }
  }
  snapshot() { return { state: this.state, pos: { ...this.pos }, yaw: this.yaw, chaseT: this.chaseT }; }
}

// The scripted near attack (S8, once): it walks to a spot, and if the player is in sight it comes up to `stop` metres, stares, and is gone
// (a blackout). It never touches anyone. After this the monster is MonsterAI (S12/S20).
//   const n = new NearAttack(nav, { from, target, stop: 2.2 });  n.update(dt, P) -> events: { type: 'near' | 'gone' | 'leave' }
export class NearAttack {
  constructor(nav, o) {
    this.nav = nav; this.o = { speed: 1.0, stop: 2.2, sight: 9, stare: 2.6, ...o };
    this.pos = { ...o.from, floor: o.from.floor || 0 }; this.yaw = 0; this.state = 'walk'; this.t = 0; this.events = []; this.done = false;
    this.path = nav.path(this.pos, o.target) || [o.target]; this.pi = 0; this.visible = true;
  }
  step(dt, goal) {
    if (this.path !== goal) { this.path = goal; this.pi = 0; }
    let s = this.o.speed * dt;
    while (s > 0 && this.pi < this.path.length) {
      const w = this.path[this.pi], dx = w.x - this.pos.x, dz = w.z - this.pos.z, d = Math.hypot(dx, dz);
      if (d > 1e-4) this.yaw = Math.atan2(dx, dz);
      if (d <= s) { this.pos.x = w.x; this.pos.z = w.z; s -= d; this.pi++; } else { this.pos.x += dx / d * s; this.pos.z += dz / d * s; s = 0; }
    }
    return this.pi >= this.path.length;
  }
  update(dt, P) {
    this.events.length = 0; this.t += dt;
    if (this.done) return this.events;
    const d = dist2(this.pos, P);
    const sees = !P.hidden && d <= this.o.sight && this.nav.los(this.pos, P);
    if (this.state === 'walk') {
      if (sees && this.t > 1.5) { this.state = 'approach'; this.t = 0; }
      else if (this.step(dt, this.path)) { this.state = 'look'; this.t = 0; }
    } else if (this.state === 'look') {
      if (sees) { this.state = 'approach'; this.t = 0; } else if (this.t > 4) { this.state = 'leave'; this.t = 0; this.events.push({ type: 'leave' }); this.done = true; this.visible = false; }
    } else if (this.state === 'approach') {
      if (d <= this.o.stop) { this.state = 'near'; this.t = 0; this.events.push({ type: 'near' }); } else this.step(dt, [{ x: P.x, z: P.z }]);
    } else if (this.state === 'near') {
      if (this.t >= this.o.stare) { this.state = 'gone'; this.events.push({ type: 'gone' }); this.done = true; this.visible = false; }
    }
    return this.events;
  }
}
