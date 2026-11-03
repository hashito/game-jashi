/* game-kit 4b9f6fa: js/monster-std.js — edit in game-kit and run tools/kit-sync.js */
// The default monster pack (standard 1.5; rules S12 / S20). Driven by DATA: manifest data.monsters = data/monsters.json (schema/monsters.schema.json).
//   { "early": { "stages": 2 },
//     "monsters": [ { "id": "windmill", "look": "windmill", "phases": [ { "preset": "early", "untilStage": "L3" }, { "preset": "normal" } ],
//                     "spawn": { "room": "R3" }, "route": "loop1" | { "rooms": ["R1","C1","R2"] } | null, "activeFrom": { "stage": "L2" } | { "task": "T1" } | { "flag": "x" },
//                     "nearAttack": { "room": "C1", "from": { "room": "R2" }, "target": { "room": "C1" } },   // the scripted safe attack, once
//                     "params": { "sight": 11 } } ],
//     "hints": { "run": "走れ！", "turn": "曲がれ！", "hide": "隠れろ！" } }
// game-core calls installMonsters(ctx) when data.monsters exists and runs it as a system. A game may instead register its own with ext.registerMonster.
//
// What this does per frame (js/monster-ai.js has the rules, this file is the glue to the world):
//   * the AI on a nav built from plan.json (rooms, doors: a locked door is a wall; plan.routes or the plan's loops are the patrol), or ctx.world.monsterNav
//     (a game with its own grid gives { path(a, b), los(a, b) });
//   * the body (js/monster-looks.js: 'windmill' = the original look, 'dark-red-mist' = near-black with a deep-red rim) placed from the AI;
//   * noticing: sting + heartbeat + a glitch burst + the screen surge (fx.spook) that eases off over ~4 s; the protagonist's hint line ("走れ" ...) through
//     ctx.monologue; contact = ctx.die('monster') in every state (calm only softens the presentation: S12);
//   * ctx.fxState = { danger, mist, chasing } driven by how near the nearest monster is (js/fx-std.js reads it; the windmill never gets the red-black mist);
//   * window.__gf.monster (state / drive / seed) for tests.
import { MonsterAI, NearAttack, resolveParams, WITNESS } from './monster-ai.js';
import { navFromPlan } from './monster-nav.js';
import * as THREE from 'three';
import { createLook } from './monster-looks.js';
import { buildHideLook } from './hide-looks.js';
import { gfRegister, gfEmit, gfOk, gfFail, gfUnknown, mulberry32 } from './gf-test.js';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const DEF_LOOK = 'dark-red-mist';

// ---- pure helpers (tests) ----
export function defaultMonsterDef(def = {}) {
  const look = def.look || DEF_LOOK;
  // afterNear (standard 1.7): with a nearAttack, the monster does not patrol before the scripted first encounter has happened (S8 comes first)
  return { id: def.id || look, look, phases: def.phases || [{ preset: def.preset || 'early' }], spawn: def.spawn || null, route: def.route === undefined ? 'auto' : def.route, activeFrom: def.activeFrom || null, nearAttack: def.nearAttack || null, afterNear: def.afterNear ?? !!def.nearAttack, nearRespawn: def.nearRespawn ?? 6, params: def.params || {}, respawn: def.respawn ?? 14, assets: def.assets || null, opensDoors: def.opensDoors || false, footsteps: def.footsteps || null, lure: def.lure || null };
}
// which phase (preset) applies now: phases are tried in order; { untilStage } holds while the player's level is below that stage
export function phaseFor(def, levelOf, levelIndex) {
  for (const ph of def.phases) { if (!ph.untilStage) return ph; if (levelIndex < levelOf(ph.untilStage)) return ph; }
  return def.phases[def.phases.length - 1];
}
export function isActive(def, s) {
  const a = def.activeFrom;
  if (!a) return true;
  if (a.stage != null && s.levelIndex < s.levelOf(a.stage)) return false;
  if (a.task && !s.tasks.includes(a.task)) return false;
  if (a.flag && !s.flags.includes(a.flag)) return false;
  if (a.room && !s.visited.includes(a.room)) return false;
  return true;
}
// how scary the screen should be: proximity (danger / mist) and whether something hunts you. The windmill never gets the red-black mist (its look has no red / black).
export function proximity(ai, look, P) {
  if (!ai.active || ai.state === 'off') return { danger: 0, mist: 0, chasing: false };
  const d = Math.hypot(ai.pos.x - P.x, ai.pos.z - P.z);
  const chasing = ai.state === 'chase';
  const danger = chasing ? Math.max(0.35, 1 - d / 14) : Math.max(0, 1 - d / 9) * 0.6;
  return { danger: clamp(danger, 0, 1), mist: look === 'windmill' ? 0 : clamp(danger, 0, 1), chasing };
}
export const maxFx = (a, b) => ({ danger: Math.max(a.danger, b.danger), mist: Math.max(a.mist, b.mist), chasing: a.chasing || b.chasing });

export function installMonsters(ctx) {
  const cfg = ctx.data.monsters;
  if (!cfg) return null;
  const { bus, scene, camera } = ctx;
  const plan = ctx.data.plan;
  const doors = () => ctx.world && ctx.world.doors;
  const nav = ctx.monsterNav || (ctx.world && ctx.world.monsterNav) || navFromPlan(plan, { isDoorOpen: (id) => { const d = doors() && doors().get(id); return !d || !((d.locked && d.locked()) || d.monsterHold > 0); }, isDoorPassable: (id) => { const d = doors() && doors().get(id); return !(d && d.monsterHold > 0); } });   // a locked door blocks its sight; a fire door just shut (monsterHold, standard 1.10.15) blocks its way too
  ctx.monsterNavUsed = nav;
  const levelOf = (id) => (ctx.levelIndex ? ctx.levelIndex(id) : 0);
  const sstate = () => ({ levelIndex: ctx.prog ? ctx.prog.index : 0, levelOf, tasks: ctx.state.tasks, flags: ctx.state.flags, visited: ctx.state.visited });
  const safeRooms = new Set((plan.rooms || []).filter((r) => r.safe).map((r) => r.id));
  const list = [];
  const rng = () => (ctx.rand || Math.random)();   // __gf.rng.seed(n) replaces ctx.rand
  const pointOf = (spec) => {
    if (!spec) return null;
    if (spec.x != null) return { x: spec.x, z: spec.z, floor: spec.floor || 0 };
    return nav.centre(spec.room);
  };
  const routeOf = (def) => {
    if (def.route === null) return null;
    if (def.route && typeof def.route === 'object' && def.route.rooms) return def.route.rooms.map((id) => nav.centre(id)).filter(Boolean);
    if (typeof def.route === 'string' && def.route !== 'auto') { const r = nav.routes.find((x) => x.id === def.route); if (r) return r.points; }
    // 'auto': a loop through the spawn room, else the first loop, else the first route
    const sp = def.spawn && def.spawn.room;
    const r = nav.routes.find((x) => sp && x.rooms.includes(sp)) || nav.routes[0];
    return r ? r.points : null;
  };

  for (const raw of cfg.monsters || []) {
    const def = defaultMonsterDef(raw);
    const ph0 = phaseFor(def, levelOf, 0);
    const hintText = cfg.hints ? Object.fromEntries(Object.entries(cfg.hints).filter(([, v]) => v)) : {};
    const params = { ...def.params, hintText: { ...hintText, ...((def.params || {}).hintText || {}) } };
    const ai = new MonsterAI(nav, { preset: ph0.preset, params, route: routeOf(def), rand: rng });
    // a look the game registered (ext.registerLook, standard 1.7) wins over the kit's built-in looks of the same name
    const custom = ctx.ext && ctx.ext.reg && ctx.ext.reg.look && ctx.ext.reg.look.get(def.look);
    const look = custom ? custom.create({ assets: def.assets || cfg.assets || undefined, def, ctx }) : createLook(def.look, { assets: def.assets || cfg.assets || undefined });
    scene.add(look.root);
    list.push({ def, ai, look, phase: ph0, active: false, spawned: false, wait: 0, hbT: 0, nearDone: false, near: null, fx: { danger: 0, mist: 0, chasing: false } });
  }

  // a room with "shutHide": true hides the player while every door of it is shut (a hut whose closable door is drawn: standard 1.10.4)
  const shutRooms = new Map((plan.rooms || []).filter((r) => r.shutHide).map((r) => [r.id, (plan.doors || []).filter((d) => (d.a === r.id || d.b === r.id) && d.kind !== 'stairs' && d.kind !== 'lift').map((d) => d.id)]));
  const shutIn = () => { const ids = shutRooms.get(ctx.state.room); return !!ids && ids.every((id) => { const d = doors() && doors().get(id); return d && !d.isOpen; }); };
  const P = () => ({ x: camera.position.x, z: camera.position.z, floor: ctx.floor, hidden: !!ctx.hidden || nav.safe.has(ctx.state.room) || shutIn(), visibility: ctx.visibility ? ctx.visibility() : 1 });   // visibility: standard 1.7 (crouch / light)   // hiding places (ctx.hidden) and safe rooms (plan.rooms[].safe): it cannot see or touch you
  const farSpawn = (m) => {
    const p = P();
    const sp = pointOf(m.def.spawn);
    if (sp && Math.hypot(sp.x - p.x, sp.z - p.z) > 6) return sp;
    // a room centre far from the player (not a safe room), out of sight
    const rooms = nav.rooms.filter((r) => !safeRooms.has(r.id) && r.kind !== 'corridor' && r.floor === ctx.floor && Math.hypot(r.cx - p.x, r.cz - p.z) > 10);
    const r = rooms.length ? rooms[Math.floor(rng() * rooms.length)] : nav.rooms[Math.floor(rng() * nav.rooms.length)];
    return r ? { x: r.cx, z: r.cz, floor: r.floor } : { x: 0, z: 0, floor: 0 };
  };
  const place = (m) => { const sp = farSpawn(m); m.ai.spawnAt(sp, m.ai.route ? 'wander' : 'idle'); if (m.ai.route) m.ai.goTo(m.ai.route[m.ai.routeIdx % m.ai.route.length]); m.ai.blockNotice = 4; m.look.respawn && m.look.respawn(); m.spawned = true; };
  const monologue = (text, sec = 2.2) => (ctx.monologue ? ctx.monologue(text, sec, { urgent: true }) : ctx.ui && ctx.ui.say && ctx.ui.say(text, sec, { urgent: true }));   // the chase hint ("走れ") cuts in

  const onEvent = (m, e) => {
    if (e.type === 'notice') {
      ctx.sound && ctx.sound('stinger'); ctx.sound && ctx.sound('heartbeat', 0.9);
      const fx = ctx.fx || (ctx.look && ctx.look.fx);
      fx && fx.spook && fx.spook(1);
      fx && fx.glitch && fx.glitch(0.35, 0.12);
      ctx.spotFx && ctx.spotFx(m.def.spotFx, { first: e.first });   // standard 1.9: monsters.json "spotFx" (else game.json "spotFx")
      bus.emit('monster:seen', { id: m.def.id, first: e.first }); gfEmit('monsterStd', 'notice', { id: m.def.id });
    } else if (e.type === 'lose') bus.emit('monster:lost', { id: m.def.id, why: e.why });
    else if (e.type === 'hint') monologue(e.text, 2.2);
    else if (e.type === 'catch') {
      const fx = ctx.fx || (ctx.look && ctx.look.fx);
      fx && fx.spook && fx.spook(1.4);
      ctx.sound && ctx.sound('stinger');
      bus.emit('monster:catch', { id: m.def.id }); gfEmit('monsterStd', 'catch', { id: m.def.id });
      ctx.die('monster');   // S12: contact kills, whatever the state. Calm only softens the presentation (the game's death sequence reads ctx.calm).
    }
  };

  // the scripted near attack (S8): once, it never touches you
  const startNear = (m, spec) => {
    const from = pointOf(spec.from) || farSpawn(m), target = pointOf(spec.target) || from;
    m.near = new NearAttack(nav, { from, target, ...(spec.stop ? { stop: spec.stop } : {}), ...(spec.speed ? { speed: spec.speed } : {}) });
    m.nearDone = true; m.spawned = true; m.ai.despawn();
    bus.emit('monster:near-start', { id: m.def.id });
  };
  bus.on('player:room', ({ to }) => {
    for (const m of list) { const n = m.def.nearAttack; if (n && !m.nearDone && !m.near && n.room === to && isActive(m.def, sstate())) startNear(m, n); }
  });
  // monsters.json "opensDoors": true | seconds (deguchi K2): it opens a closed (unlocked) door it walks into and stops there that long (0.9 s);
  // "footsteps": "<audio noise>" | { noise, stride, gain, range } (K5): its steps sound where it walks, and bus 'monster:step' fires on every step;
  // "lure": { block, ignoreWithin } (K4): the defaults of ctx.monsters.lure(pt, o) - it walks to a sound, not noticing you for `block` s
  const floorOfRoom = new Map((plan.rooms || []).map((r) => [r.id, r.floor || 0]));
  const closedDoorNear = (pos, r) => {
    if (!doors()) return null;
    for (const d of doors().values()) {
      if (d.isOpen || !d.mesh || !d.def || d.def.x == null || (d.locked && d.locked()) || d.monsterHold > 0) continue;
      if ((floorOfRoom.get(d.def.a) || 0) === (pos.floor || 0) && Math.hypot(d.def.x - pos.x, d.def.z - pos.z) < r) return d;
    }
    return null;
  };
  const doorsAndSteps = (m, dt, p) => {
    if (m.def.opensDoors && m.ai.moving) {
      const d = closedDoorNear(m.ai.pos, 1.15);
      if (d && d.open()) {
        m.ai.pauseT = typeof m.def.opensDoors === 'number' ? m.def.opensDoors : 0.9;
        if (!ctx.state.doors.includes(d.def.id)) ctx.state.doors.push(d.def.id);
        if (Math.hypot(d.def.x - p.x, d.def.z - p.z) < 10) ctx.sound && ctx.sound('door');
        bus.emit('door:open', { id: d.def.id, by: m.def.id });
      }
    }
    const fs = m.def.footsteps;
    if (fs && m.ai.moving && (m.ai.pos.floor || 0) === (p.floor || 0)) {
      const f = typeof fs === 'string' ? { noise: fs } : fs;
      m.stepAcc = (m.stepAcc || 0) + (m.ai.speed || 0) * dt;
      if (m.stepAcc >= (f.stride || 1.4)) {
        m.stepAcc = 0;
        const at = { x: m.ai.pos.x, z: m.ai.pos.z, floor: m.ai.pos.floor || 0 };
        const dd = Math.hypot(at.x - p.x, at.z - p.z), R = f.range ?? 22;   // fainter with distance, unheard past `range` m
        if (f.noise && dd < R && ctx.audio && ctx.audio.noise) { try { ctx.audio.noise(f.noise, { pos: { x: at.x, y: 0.05, z: at.z }, gain: (f.gain ?? 1) * Math.max(0.15, 1 - dd / R) * (ctx.calm ? 0.6 : 1) }); } catch { /* no audio */ } }
        bus.emit('monster:step', { id: m.def.id, ...at, run: m.ai.state === 'chase' });
      }
    }
  };
  const resetAll = () => { for (const m of list) { m.ai.reset(); m.near = null; m.spawned = false; m.wait = 3; } ctx.fxState = { danger: 0, mist: 0, chasing: false, spook: 0 }; };
  bus.on('player:respawn', resetAll);
  bus.on('game:start', resetAll);

  const sys = {
    list, nav,
    update(dt, c, active) {
      const p = P();
      let fx = { danger: 0, mist: 0, chasing: false };
      const st = sstate();
      for (const m of list) {
        // a window is open / the game is not running: the monster waits where it is (nothing moves behind a menu)
        const on = isActive(m.def, st);
        if (on !== m.active) { m.active = on; if (!on) { m.ai.despawn(); m.spawned = false; } }
        const ph = phaseFor(m.def, levelOf, st.levelIndex);
        if (ph !== m.phase) { m.phase = ph; m.ai.p = resolveParams(ph.preset, m.def.params); if (m.def.params && m.def.params.hintText == null) m.ai.p.hintText = { ...m.ai.p.hintText, ...(cfg.hints || {}) }; }
        const fy = ctx.world.floorY ? ctx.world.floorY(m.ai.pos.floor || 0) : 0;
        if (m.near) {
          if (active) for (const e of m.near.update(dt, p)) { bus.emit('monster:near', { id: m.def.id, type: e.type }); if (e.type === 'near') { ctx.sound && ctx.sound('stinger'); (ctx.fx || {}).spook && ctx.fx.spook(0.8); } if (e.type === 'gone') { const f = ctx.fx; f && f.blackout && f.blackout(0.5); } }
          m.look.update(dt, { state: 'near', pos: m.near.pos, yaw: m.near.yaw, moving: m.near.state === 'walk' || m.near.state === 'approach', visible: m.near.visible, dist: Math.hypot(m.near.pos.x - p.x, m.near.pos.z - p.z), floorY: fy }, camera.position);
          if (m.near.done) { m.near = null; m.look.root.visible = false; m.spawned = false; m.wait = m.def.nearRespawn; }   // after the scripted encounter it comes back (standard 1.7)
          continue;
        }
        const waitsForNear = m.def.afterNear && m.def.nearAttack && !m.nearDone;   // S8: the scripted encounter comes first
        if (on && !m.spawned && active && !waitsForNear) { if (m.wait > 0) m.wait -= dt; else place(m); }
        if (on && m.spawned && active) {
          for (const e of m.ai.update(dt, p)) onEvent(m, e);
          doorsAndSteps(m, dt, p);
          if (m.ai.state === 'chase' && (m.hbT -= dt) <= 0) { m.hbT = 0.8; ctx.sound && ctx.sound('heartbeat', 0.5); }
        }
        const dist = Math.hypot(m.ai.pos.x - p.x, m.ai.pos.z - p.z);
        m.look.update(dt, { state: m.ai.state, pos: m.ai.pos, yaw: m.ai.yaw, moving: m.ai.moving, speed: m.ai.speed, dist, visible: m.ai.active && on && (m.ai.pos.floor || 0) === ctx.floor, floorY: fy }, camera.position);
        m.fx = proximity(m.ai, m.def.look, p);
        fx = maxFx(fx, m.fx);
      }
      const prev = ctx.fxState || {};
      ctx.fxState = { ...prev, ...fx, noMist: list.length > 0 && list.every((m) => m.def.look === 'windmill') };   // the windmill look has no red / black: no mist for it
    },
    nearAttack(id, spec) { const m = list.find((x) => x.def.id === id) || list[0]; if (m) startNear(m, spec); },
    // tests: put a monster somewhere, make it notice, read states
    snapshot() { return list.map((m) => ({ id: m.def.id, look: m.def.look, active: m.active, spawned: m.spawned, near: !!m.near, ...m.ai.snapshot(), preset: m.phase.preset, chaseSpeed: m.ai.p.speed.chase })); },
    place(id, pt, state = 'idle') { const m = list.find((x) => x.def.id === id) || list[0]; if (!m) return false; m.spawned = true; m.active = true; m.ai.spawnAt(pt, state); m.ai.blockNotice = 0; return true; },
    chase(id) { const m = list.find((x) => x.def.id === id) || list[0]; if (!m) return false; m.spawned = true; m.active = true; if (!m.ai.active) place(m); m.ai.startChase(P(), true); for (const e of m.ai.events.splice(0)) onEvent(m, e); return true; },
    reset: resetAll,
    // the monster walks to a sound at pt (deguchi K4): not while it is right on top of you in a chase (ignoreWithin m), and it notices nobody on
    // the way for `block` s. Returns true when it goes. o: { id, block, ignoreWithin }
    lure(pt, o = {}) {
      const m = list.find((x) => x.def.id === o.id) || list.find((x) => x.spawned && x.ai.active) || list[0];
      if (!m || !m.ai.active || !pt) return false;
      const L = { block: 1.4, ignoreWithin: 2.2, ...(m.def.lure || {}), ...o }, q = P();
      if (m.ai.state === 'chase' && (m.ai.pos.floor || 0) === (q.floor || 0) && Math.hypot(m.ai.pos.x - q.x, m.ai.pos.z - q.z) < L.ignoreWithin) return false;
      if (!m.ai.goTo({ x: pt.x, z: pt.z, floor: pt.floor ?? m.ai.pos.floor ?? 0 })) return false;
      m.ai.set('seek'); m.ai.blockNotice = L.block;
      bus.emit('monster:lure', { id: m.def.id, x: pt.x, z: pt.z });
      return true;
    },
    // after a door turned into a wall (a fire door shut): every monster walking a path finds a new one
    repath() { for (const m of list) if (m.ai.active && m.ai.target && m.ai.path) { if (!m.ai.goTo(m.ai.target)) { m.ai.path = null; } } },
  };
  bus.on('door:close', ({ id }) => { const d = doors() && doors().get(id); if (d && d.monsterHold > 0) sys.repath(); });
  // __gf hooks (docs/testing.md; only with ?gftest=1)
  gfRegister('monsterStd', () => ({
    snapshot: () => ({ monsters: sys.snapshot(), fxState: ctx.fxState || null, hidden: !!ctx.hidden, rooms: nav.rooms.length, routes: nav.routes.map((r) => r.id) }),
    drive(action, a = {}) {
      const m = list.find((x) => x.def.id === (a.id || list[0] && list[0].def.id));
      if (!m && action !== 'reset' && action !== 'hide') return gfFail(`unknown monster "${a.id}"`);
      switch (action) {
        case 'place': { const pt = a.room ? nav.centre(a.room) : a; if (!pt) return gfFail(`unknown room "${a.room}"`); sys.place(m.def.id, pt, a.state || 'idle'); return gfOk({ state: m.ai.state }); }
        case 'chase': sys.chase(m.def.id); return gfOk({ state: m.ai.state });
        case 'hide': ctx.hidden = !!a.on; return gfOk({ hidden: ctx.hidden });
        case 'tick': { const n = a.n || 1, dt = a.dt || 1 / 30; for (let i = 0; i < n; i++) sys.update(dt, ctx, true); return gfOk({ state: m.ai.state, pos: { ...m.ai.pos } }); }
        case 'reset': resetAll(); ctx.hidden = false; return gfOk();
        default: return gfUnknown(action);
      }
    },
    seed: (n) => { ctx.rand = mulberry32(n); },
    reset: () => { resetAll(); ctx.hidden = false; },
  }));
  // hiding places (plan.hides): [E] 隠れる puts you in the spot (ctx.hidden = true: the monster cannot see or touch you, unless it saw you get in - WITNESS), walking away or [E] again comes out
  const hides = plan.hides || [];
  if (hides.length && ctx.world.interactables) {
    const spots = new Map();
    for (const h of hides) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.8, 1.0), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
      m.name = `hide:${h.id}`; m.position.y = 0.9; m.userData.interact = { kind: 'hide', id: h.id };
      if (ctx.world.place) ctx.world.place(m, h.room, h.x, h.z); else { m.position.x = h.x; m.position.z = h.z; ctx.world.group && ctx.world.group.add(m); }
      ctx.world.interactables.push(m); spots.set(h.id, h);
    }
    // hiding places you can see (standard 1.10.13, rule G7, js/hide-looks.js): h.look = 'locker' | 'cabinet' | 'oshiire'; the door shuts behind you
    const looks = new Map();
    for (const h of hides) {
      if (!h.look || !ctx.world.group) continue;
      const R = ctx.world.rooms && ctx.world.rooms.get(h.room), L = buildHideLook(h, R && R.room); if (!L) continue;
      L.group.position.y = (R && R.y) || 0; ctx.world.group.add(L.group); L.group.updateMatrixWorld(true);
      for (const s of L.solids) ctx.world.colliders.push({ box: new THREE.Box3().setFromObject(s), off: false });
      looks.set(h.id, { ...L, k: 0, target: 0 });
    }
    ctx.hideLooks = looks;
    const leave = () => { if (ctx.hidden) { ctx.hidden = false; ctx.hideSpot = null; document.body.classList.remove('gf-hidden'); for (const l of looks.values()) l.target = 0; bus.emit('player:unhide', {}); } };
    ctx.leaveHide = leave;
    ctx.systems.push({ id: 'hide', def: { update: (dt = 0.016) => { for (const l of looks.values()) if (l.k !== l.target) { l.k += Math.sign(l.target - l.k) * Math.min(Math.abs(l.target - l.k), dt * 3.2); l.setShut(l.k); } if (ctx.hidden && ctx.hideSpot && Math.hypot(camera.position.x - ctx.hideSpot.x, camera.position.z - ctx.hideSpot.z) > 1.1) leave(); } }, inst: null });
    ctx.ext.registerInteract('hide', {
      prompt: (o) => (ctx.hidden ? '[E] 出る' : `[E] 隠れる：${(spots.get(o.id) || {}).label || '隠れる場所'}`),
      run: (o) => { const h = spots.get(o.id); if (!h) return; if (ctx.hidden) return leave(); if (ctx.controlOpen && !ctx.controlOpen('hide')) return ctx.controlNotYet();   /* a gate (standard 1.10.11) */ ctx.hidden = true; ctx.hideSpot = h; camera.position.x = h.x; camera.position.z = h.z; document.body.classList.add('gf-hidden'); const l = looks.get(h.id); if (l) { l.target = 1; ctx.audio && ctx.audio.lockerDoor && ctx.audio.lockerDoor({ x: h.x, y: 1, z: h.z }, false); } bus.emit('player:hide', { id: h.id }); },
    });
    bus.on('player:respawn', leave);
  }
  ctx.monsters = sys;
  return sys;
}
