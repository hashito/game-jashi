/* game-kit 1279a7c: js/guidance.js — edit in game-kit and run tools/kit-sync.js */
// Guiding the player, from what several games built on their own (standard 1.13). All opt-in from game.json except ctx.lookTo and task "reach" / when().
//   "pointer": true | { "range": 60 }     a diamond in the world over the next place: the station of the first required task that can start, or, from another
//                                         room, the door to walk through. ctx.nextPlace() -> { task, room, x, y, z, door } | null (未然調書 1.6.0)
//   "hud": { "quietFor": 60, "keep": ["guide"], "dimInDanger": true }
//                                         a quiet first minute: only the goal chip and the STEP card; the rest fades in at quietFor seconds, a stage or the first
//                                         notice (閉園後 1.7.0). dimInDanger: the top left dims while something hunts you, a touch brings it back (みる風車 1.7.0).
//                                         ctx.hud.quiet(sec) / ctx.hud.reveal()
//   ctx.lookTo(point | object, { sec, zoom, speed })   turn the player's eyes to a point, with an optional zoom, then give the view back (八尺様, 邪視: their own turnTo).
//                                         Calm mode and reduced motion: no zoom. Returns a promise for the end.
//   task "reach": { "x", "z", "r", "floor" } | { "room" }   tasks.json: the task is done when the player stands there (a lesson step, 五人分の朝's T_TUT1).
//   ext.registerTask(id, { when(ctx) -> bool })   the same from code. Both wait until the task's stage and needs are met (a canStart text stays what [E] says).
export const pointerConfig = (p) => (!p ? null : { range: 60, ...(typeof p === 'object' ? p : {}) });
export const hudConfig = (h) => (!h ? null : { quietFor: 0, keep: ['guide'], dimInDanger: false, ...(h === true ? { quietFor: 60, dimInDanger: true } : h) });

/** turn the view k (0..1) of the way to a point: fp has yaw and pitch, cam a position */
export function turnStep(fp, cam, pt, k) {
  const dx = pt.x - cam.x, dz = pt.z - cam.z, yaw = Math.atan2(-dx, -dz), pitch = Math.atan2((pt.y ?? cam.y) - cam.y, Math.hypot(dx, dz));
  fp.yaw += Math.atan2(Math.sin(yaw - fp.yaw), Math.cos(yaw - fp.yaw)) * k;
  fp.pitch += (pitch - fp.pitch) * k;
}

/** the first door on the shortest way between two rooms (open(door) false: not through it; when nothing is open all the way, any door counts) */
export function doorToward(plan, from, to, open = () => true) {
  if (!from || !to || from === to) return null;
  const search = (ok) => {
    const seen = new Map([[from, null]]), queue = [from];
    while (queue.length) {
      const r = queue.shift();
      if (r === to) { let d = null, at = r; while (seen.get(at)) { d = seen.get(at).door; at = seen.get(at).prev; } return d; }
      for (const door of plan.doors || []) {
        const next = door.a === r ? door.b : door.b === r ? door.a : null;
        if (!next || seen.has(next) || !ok(door)) continue;
        seen.set(next, { door, prev: r }); queue.push(next);
      }
    }
    return null;
  };
  return search(open) || search(() => true);
}

/** the task the player should do next: required first, then optional; only those that can start now */
export const nextTaskOf = (tasks, can) => tasks.find((t) => !t.optional && can(t)) || tasks.find(can) || null;

/** the room a step with done: 'room' waits for: its own room, else the task's */
export const stepRoom = (step, task) => step.room ?? task.room;

/** is the player at a task's "reach"? */
export function atReach(reach, p, floor, room) {
  if (!reach) return false;
  if (reach.floor != null && reach.floor !== floor) return false;
  if (reach.room) return reach.room === room;
  return Math.hypot(p.x - reach.x, p.z - reach.z) <= (reach.r ?? 1.4);
}

const CSS = `
#hud-left>*,#hud-right,#hud-left{transition:opacity .9s ease}
body.gf-hud-quiet #hud-left>.gf-hud-q,body.gf-hud-quiet #hud-right,body.gf-hud-quiet #lane{opacity:0;pointer-events:none}
body.gf-hud-dim #hud-left{opacity:.32}
body.gf-hud-dim #hud-left:hover,body.gf-hud-dim #hud-left:focus-within,body.gf-hud-dim.gf-hud-woken #hud-left{opacity:1}
`;
const motionless = (ctx) => !!ctx.calm || (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches);

export function installGuidance(ctx, { manifest = {}, tasks = [], plan = null, stationPos = () => ({}), reachOk = () => true, taskReg = () => null }) {
  const { bus, camera, fp } = ctx, sys = [];
  // ---- ctx.lookTo ----
  let look = null, baseFov = 0;
  ctx.lookTo = (pt, o = {}) => new Promise((done) => {
    const target = pt && pt.isObject3D ? pt.position : pt;
    if (look) look.done();
    if (!target || !fp) { look = null; done(); return; }
    if (!baseFov) baseFov = camera.fov;
    look = { target, t: o.sec ?? 1.2, speed: o.speed ?? 5, zoom: motionless(ctx) ? 1 : o.zoom ?? 1, done };
  });
  sys.push((dt, active) => {
    if (look) {
      if (active) { look.t -= dt; turnStep(fp, camera.position, look.target, Math.min(1, dt * look.speed)); }
      if (look.t <= 0) { look.done(); look = null; }
    }
    if (!baseFov) return;
    const want = look ? baseFov / look.zoom : baseFov;
    if (Math.abs(camera.fov - want) > 0.01) { camera.fov += (want - camera.fov) * Math.min(1, dt * 5); camera.updateProjectionMatrix(); }
  });
  // ---- task "reach" / when() ----
  let watchT = 0, watch = null;
  sys.push((dt, active) => {
    if (!active || ctx.skipping) return;
    if ((watchT -= dt) > 0) return;
    watchT = 0.12;
    watch = watch || tasks.filter((t) => t.reach || (taskReg(t.id) || {}).when);
    const p = camera.position;
    for (const t of watch) {
      if (ctx.state.tasks.includes(t.id) || !reachOk(t)) continue;
      const reg = taskReg(t.id);
      if (atReach(t.reach, p, ctx.floor, ctx.state.room) || (reg && reg.when && reg.when(ctx, t))) ctx.completeTask(t.id);
    }
  });
  // ---- the next place ----
  const can = (t) => (t.station || t.reach || t.room) && ctx.canStart(t) === true;
  ctx.nextPlace = () => {
    if (!plan || !ctx.state.started || ctx.state.ended) return null;
    const t = nextTaskOf(tasks, can);
    if (!t) return null;
    const room = t.reach && t.reach.room ? t.reach.room : t.room, here = ctx.state.room, world = ctx.world;
    const R = room ? plan.rooms.find((r) => r.id === room) : null;
    const pos = t.reach && t.reach.x != null ? t.reach : t.station ? stationPos(t.station) : {};
    if (room && here && here !== room) {
      const open = (d) => { const w = world.doors && world.doors.get(d.id); return !(w && w.locked && w.locked()); };
      const d = doorToward(plan, here, room, open);
      if (d && d.x != null) { const F = (plan.rooms.find((r) => r.id === here) || {}).floor || 0; return { task: t.id, room, door: d.id, x: d.x, y: (world.floorY ? world.floorY(F) : 0) + 1.75, z: d.z }; }
    }
    if (pos.x == null && !R) return null;
    const x = pos.x ?? R.x + R.w / 2, z = pos.z ?? R.z + R.d / 2, F = (R && R.floor) || (t.reach && t.reach.floor) || 0;
    return { task: t.id, room, door: null, x, y: (world.floorY ? world.floorY(F) : 0) + 1.5, z };
  };
  const pc = pointerConfig(manifest.pointer);
  if (pc && plan && ctx.THREE && typeof document !== 'undefined') {
    const T = ctx.THREE, c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    g.translate(32, 32); g.rotate(Math.PI / 4); g.fillStyle = '#ffae12'; g.strokeStyle = '#1a1408'; g.lineWidth = 5; g.fillRect(-15, -15, 30, 30); g.strokeRect(-15, -15, 30, 30);
    const tex = new T.CanvasTexture(c);
    if (T.SRGBColorSpace) tex.colorSpace = T.SRGBColorSpace;
    const mark = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
    mark.name = 'next-place'; mark.renderOrder = 999; mark.visible = false; ctx.scene.add(mark);
    let again = 0, now = null;
    sys.push((dt, active) => {
      if ((again -= dt) <= 0) { again = 0.25; now = active ? ctx.nextPlace() : null; }
      const P = camera.position, d = now ? Math.hypot(now.x - P.x, now.z - P.z) : 0;
      mark.visible = !!now && d > 0.9 && d < pc.range && active;
      if (!mark.visible) return;
      const size = Math.max(0.2, d * (ctx.isTouch ? 0.075 : 0.055));   // keeps a least size on the screen across a room and on a phone
      mark.position.set(now.x, now.y + Math.sin(performance.now() / 300) * 0.03, now.z); mark.scale.set(size, size, 1);
    });
  }
  // ---- the quiet first minute, the dimmed HUD ----
  const hc = hudConfig(manifest.hud);
  if (hc && typeof document !== 'undefined') {
    const st = document.createElement('style');
    st.textContent = CSS; document.head.appendChild(st);
    const B = document.body;
    let quietLeft = 0, woke = 0;
    const mark = () => { const keep = new Set(['guide', ...(hc.keep || [])]); for (const e of (document.getElementById('hud-left') || { children: [] }).children) e.classList.toggle('gf-hud-q', !e.classList.contains('pg-hud') && !keep.has(e.id)); };
    ctx.hud = {
      quiet(sec) { quietLeft = sec; mark(); B.classList.add('gf-hud-quiet'); },
      reveal() { quietLeft = 0; B.classList.remove('gf-hud-quiet'); },
      get isQuiet() { return B.classList.contains('gf-hud-quiet'); },
    };
    if (hc.quietFor > 0) {
      bus.on('game:start', ({ resume, scene }) => { if (!resume && !scene && !ctx.qa) ctx.hud.quiet(hc.quietFor); });
      for (const ev of ['stage:up', 'monster:seen']) bus.on(ev, () => ctx.hud.reveal());
    }
    const left = document.getElementById('hud-left');
    if (left) left.addEventListener('pointerdown', () => { woke = 4; B.classList.add('gf-hud-woken'); });
    sys.push((dt, active) => {
      if (quietLeft > 0 && active && (quietLeft -= dt) <= 0) ctx.hud.reveal();
      if (woke > 0 && (woke -= dt) <= 0) B.classList.remove('gf-hud-woken');
      if (hc.dimInDanger) { const f = ctx.fxState || {}; B.classList.toggle('gf-hud-dim', !!(active && (f.chasing || (f.danger || 0) > 0.2))); }
    });
  }
  return { update: (dt, active) => { for (const f of sys) f(dt, active); } };
}
