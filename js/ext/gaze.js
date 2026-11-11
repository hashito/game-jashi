// The body rules of 邪視 on top of the standard monster (rules.js has the numbers, unchanged from 4.3.0):
//   - eye contact: while its face is in view, near enough and nothing stands between, the mind (sanity) drains; glasses halve it,
//     far away it is weaker; closing the eyes (hold Q / the touch button) or anything in between lets it recover. 0 = death
//   - the scythe: within reach, in front of or beside you (never from behind), it raises the scythe for ~1 s (sound, the screen edge
//     on its side, the arm up) and swings: a third of the body. It stands still while it raises, swings and recovers
//   - a bottle (R, two of them): thrown at it within 8.5 m with nothing between, it flinches for 6.5 s and loses you
//   - after a death: 5 s of grace (no eye contact, no swing) and the standard monster re-places itself away from you
// The figure that can be looked at is the standard monster or, before the radio, the scripted one of story.js (shared.scripted).
import * as THREE from 'three';
import { RULES, createSurvival, updateSurvival, stunEnemy, canThrow, threatDirection } from './rules.js';

const HEAD_Y = 2.35;
export function createGaze(ctx, { shared, mountain, sound, fear, onDeath }) {
  let S = createSurvival();
  const st = { closed: false, keyClosed: false, charges: 2, frozen: 0, throwFx: null, lastEvent: '', firstHit: false, firstWindup: false };
  const cam = ctx.camera, tmp = new THREE.Vector3(), ray = new THREE.Ray(), hit = new THREE.Vector3();
  const mon = () => (ctx.monsters && ctx.monsters.list && ctx.monsters.list[0]) || null;
  // 5.7.3: it stands at arm's length (KEEP_OFF): the body overlapped the player's before. It is moved back along the line between the two,
  // only where nothing stands in the way (the nav's line of sight), so it is never pushed into a wall
  const KEEP_OFF = 1.3;
  function keepOff(ai, P) {
    if (!ai.pos || (P.floor || 0) !== (ai.pos.floor || 0)) return;
    const dx = ai.pos.x - P.x, dz = ai.pos.z - P.z, d = Math.hypot(dx, dz);
    if (d >= KEEP_OFF) return;
    const ux = d > 1e-3 ? dx / d : -Math.sin(ctx.fp ? ctx.fp.yaw : 0), uz = d > 1e-3 ? dz / d : -Math.cos(ctx.fp ? ctx.fp.yaw : 0);
    const to = { x: P.x + ux * KEEP_OFF, z: P.z + uz * KEEP_OFF, floor: ai.pos.floor || 0 };
    if (!ai.nav || !ai.nav.los || ai.nav.los(ai.pos, to)) { ai.pos.x = to.x; ai.pos.z = to.z; }
    ai.moving = false;
  }
  // the AI stands still while the scythe is up or it is stunned (and while a window is open the standard pack already waits)
  const m0 = mon();
  if (m0 && !m0.ai.__jashi) {
    const ai = m0.ai, orig = ai.update.bind(ai);
    ai.update = (dt, P) => { if (st.frozen > 0 || (S.phase !== 'idle' && S.phase !== 'death')) { ai.events.length = 0; ai.moving = false; ai.speed = 0; keepOff(ai, P); return ai.events; } const ev = orig(dt, P); keepOff(ai, P); return ev; };
    ai.__jashi = true;
  }

  // ---------------------------------------------------------------- what stands between (indoor walls, floors, closed doors, cover, trunks)
  const walls = [];
  ctx.world.group.traverse((o) => {
    if (!o.isMesh || !/^(wall|floor|ceil):/.test(o.name)) return;
    const rid = o.name.split(':')[1], r = ctx.data.plan.rooms.find((x) => x.id === rid);
    if (!r || r.kind === 'outdoor' || o.visible === false || (o.material && o.material.visible === false)) return;
    walls.push(new THREE.Box3().setFromObject(o));
  });
  const doorBoxes = () => { const out = []; for (const d of ctx.world.doors.values()) if (d.mesh && d.mesh.visible && !d.isOpen && d.def.id !== 'D_GATE') out.push(new THREE.Box3().setFromObject(d.mesh)); return out; };
  const coverBox = new THREE.Box3(), COVER_UP = new THREE.Vector3(0, 0.25, 0), COVER_SHIFT = new THREE.Vector3(0, 0.25, 0);
  function blocked(from, to) {
    const d = from.distanceTo(to); ray.origin.copy(from); ray.direction.copy(to).sub(from).normalize();
    for (const list of [walls, mountain.occluders, doorBoxes()]) for (const b0 of list) {
      // 5.7.4: low cover counts half a metre higher: its eyes (2.35 m) stood over the plank screen (2.15) and the stacks, so hiding did nothing
      const b = list === mountain.occluders && b0.max.y < 3 ? coverBox.copy(b0).expandByVector(COVER_UP).translate(COVER_SHIFT) : b0;
      if (b.containsPoint(from)) continue; if (ray.intersectBox(b, hit) && hit.distanceTo(from) < d - 0.3) return true;
    }
    const sh = mountain.parts.shutter; if (sh && sh.t > 0.6 && (from.z - 19.1) * (to.z - 19.1) < 0 && Math.abs(from.y - to.y) < 6) return true;
    return false;
  }

  // ---------------------------------------------------------------- the figure that is looked at
  function source() {
    const sc = shared.scripted;
    if (sc && sc.visible) return { x: sc.x, z: sc.z, floor: sc.floor || 0, ai: null, yaw: sc.yaw || 0 };
    const m = mon(); if (!m || !m.active || !m.spawned || m.ai.state === 'off' || m.near) return null;
    return { x: m.ai.pos.x, z: m.ai.pos.z, floor: m.ai.pos.floor || 0, ai: m.ai, yaw: m.ai.yaw };
  }
  const floorY = (f) => (ctx.world.floorY ? ctx.world.floorY(f) : f * 3.4);

  // ---------------------------------------------------------------- HUD (mind / body, the scythe warning, bottles, the closed eyes)
  document.body.insertAdjacentHTML('beforeend', `
    <div id="js-meters" class="js-meters" hidden><div class="js-meter"><span>心</span><b><i id="js-sanity"></i></b></div><div class="js-meter js-meter--body"><span>体</span><b><i id="js-health"></i></b></div><p id="js-bottles" class="js-bottles" hidden></p></div>
    <div id="js-threat" class="js-threat" hidden><span id="js-threat-arrow" class="js-threat-arrow"></span><span id="js-threat-text"></span></div>
    <div id="js-edge" class="js-edge" hidden></div>
    <div id="js-lids" class="js-lids" hidden><i></i><i></i></div>
    <div id="js-hit" class="js-hit" hidden></div>`);
  const $ = (id) => document.getElementById(id);
  ctx.registerHudPart && ctx.registerHudPart('js-meters', { slot: 'tl', order: 40 });
  const setClosed = (on) => {
    if (st.closed === on) return; st.closed = on;
    const fp = ctx.fp; if (fp) { if (on) { fp.__spd = fp.__spd || { s: fp.o.speed, r: fp.o.run }; fp.o.speed = RULES.closedWalk; fp.o.run = RULES.closedWalk; } else if (fp.__spd) { fp.o.speed = fp.__spd.s; fp.o.run = fp.__spd.r; fp.__spd = null; } }
    $('js-lids').hidden = !on; document.body.classList.toggle('js-eyes-closed', on);
  };
  addEventListener('keydown', (e) => { if (e.code === 'KeyQ' && ctx.state.started && !ctx.wm.isOpen) st.keyClosed = true; if (e.code === 'KeyR' && ctx.state.started && !ctx.wm.isOpen && !e.repeat) throwBottle(); });
  addEventListener('keyup', (e) => { if (e.code === 'KeyQ') st.keyClosed = false; });
  addEventListener('blur', () => { st.keyClosed = false; });

  // ---------------------------------------------------------------- the bottle
  const bottleMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.22, 10), new THREE.MeshStandardMaterial({ color: 0xb8a66a, roughness: 0.3, transparent: true, opacity: 0.85 }));
  bottleMesh.visible = false; ctx.scene.add(bottleMesh);
  function throwBottle() {
    if (!ctx.state.inv.includes('I_BOTTLE')) return;
    if (st.charges <= 0) { ctx.ui.toast('ボトルは、もう残っていない。'); return; }
    const s = source(); if (!s || !s.ai) { ctx.ui.toast('投げる相手が見えない。'); return; }
    const head = tmp.set(s.x, floorY(s.floor) + 1.6, s.z), d = Math.hypot(s.x - cam.position.x, s.z - cam.position.z);
    const dir = new THREE.Vector3(); cam.getWorldDirection(dir); const to = head.clone().sub(cam.position).normalize();
    if (dir.dot(to) < 0.45) { ctx.ui.toast('白い姿の方を向いてから投げる。'); return; }
    if (!canThrow({ charges: st.charges, distance: d, blocked: blocked(cam.position, head), dead: S.dead })) { ctx.ui.toast(d > 8.5 ? 'まだ遠い。もう少し引きつける。' : '間に何かある。'); return; }
    st.charges--; ctx.bus.emit('jashi:bottle', { left: st.charges });
    st.throwFx = { t: 0, from: cam.position.clone().add(new THREE.Vector3(0, -0.2, 0)), to: head.clone() };
    bottleMesh.visible = true; sound && sound.throwBottle && sound.throwBottle();
    updateBottles();
  }
  function landBottle() {
    stunEnemy(S); st.frozen = RULES.stunSeconds; shared.pose = { attack: 'stunned', progress: 1 };
    const m = mon(); if (m) { m.ai.lastSeen = null; m.ai.set('lose'); }
    sound && sound.shatter && sound.shatter(); fear && fear.kick(0.3);
    ctx.bus.emit('jashi:stunned', {});
  }
  const updateBottles = () => { const b = $('js-bottles'); const has = ctx.state.inv.includes('I_BOTTLE'); b.hidden = !has; if (has) b.textContent = `ボトル ${st.charges} 本（R で投げる）`; };

  // ---------------------------------------------------------------- per frame
  let threatSide = null, edgeT = 0;
  function update(dt, active) {
    const meters = $('js-meters'); meters.hidden = !ctx.state.started;
    if (st.throwFx) { const f = st.throwFx; f.t += dt / 0.45; const k = Math.min(1, f.t); bottleMesh.position.lerpVectors(f.from, f.to, k); bottleMesh.position.y += Math.sin(k * Math.PI) * 0.8; bottleMesh.rotation.x += dt * 14; if (k >= 1) { st.throwFx = null; bottleMesh.visible = false; landBottle(); } }
    if (st.frozen > 0) st.frozen = Math.max(0, st.frozen - dt);
    const touch = document.body.querySelector('#eyes.on');
    setClosed(active && (st.keyClosed || !!touch || !!shared.forceClose));
    const s = source(), fp = ctx.fp;
    let input = { active: false };
    if (active && s && (s.floor === (ctx.floor || 0) || s.ai == null)) {
      const head = tmp.set(s.x, floorY(s.floor) + HEAD_Y, s.z), eye = cam.position;
      const dist = Math.hypot(s.x - eye.x, s.z - eye.z);
      const dir = new THREE.Vector3(); cam.getWorldDirection(dir); const to = head.clone().sub(eye); const dl = to.length(); to.divideScalar(dl || 1);
      const ndc = head.clone().project(cam), onScreen = ndc.z < 1 && Math.abs(ndc.x) < 0.98 && Math.abs(ndc.y) < 0.98;   // 5.7.4: off the screen is not seen
      const inView = dir.dot(to) > 0.8 && dl < 38 && onScreen;
      const isBlocked = !shared.aim && (!!ctx.hidden || blocked(eye.clone(), head.clone()));   // 5.7: through the reflector's hole nothing stands between
      const th = threatDirection({ player: { x: eye.x, z: eye.z }, yaw: fp ? fp.yaw : 0, monster: { x: s.x, z: s.z } });
      // it faces you (within 70 degrees) to swing; it never starts from behind you
      const face = Math.atan2(eye.x - s.x, eye.z - s.z); let dy = face - (s.yaw || 0); while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
      input = { active: true, moving: !!(fp && fp.moving), run: false, closed: st.closed, gaze: inView, blocked: isBlocked, distance: s.ai ? dist : Infinity, glasses: ctx.state.inv.includes('I_GLASSES') && ctx.state.tasks.includes('T_RADIO') && !shared.aim, attackAligned: Math.abs(dy) < 1.25, attackVisible: th.side !== 'behind' };
      threatSide = th;
      if (s.ai && (S.phase === 'windup' || S.phase === 'strike')) { s.ai.yaw = face; }
    }
    if (st.frozen > 0 && S.phase !== 'stunned') S.phase = 'stunned';
    const evs = updateSurvival(S, input, dt);
    if (st.frozen <= 0 && S.phase === 'stunned') { S.phase = 'idle'; S.stun = 0; }
    for (const e of evs) onEvent(e);
    shared.pose = S.phase === 'windup' || S.phase === 'strike' || S.phase === 'recover' || S.phase === 'stunned' ? { attack: S.phase, progress: 1 - S.phaseTime / (S.phaseLength || 1) } : {};
    // HUD
    $('js-sanity').style.width = `${S.sanity.toFixed(1)}%`; $('js-health').style.width = `${S.health.toFixed(1)}%`;
    meters.dataset.low = S.sanity < 35 ? '1' : '';
    const warn = S.phase === 'windup' && threatSide;
    $('js-threat').hidden = !warn;
    if (warn) { $('js-threat-arrow').textContent = threatSide.arrow; $('js-threat-text').textContent = threatSide.label; }
    const edge = $('js-edge'); edgeT = Math.max(0, edgeT - dt); edge.hidden = !warn && edgeT <= 0; if (warn) edge.dataset.side = threatSide.side;
    $('js-hit').hidden = S.hit <= 0.02; if (S.hit > 0.02) $('js-hit').style.opacity = String(Math.min(0.85, S.hit));
    document.body.classList.toggle('js-gazing', input.active && input.gaze && !input.blocked && !st.closed);
    return input;
  }
  function onEvent(e) {
    st.lastEvent = e; ctx.bus.emit('jashi:rule', { type: e });
    if (e === 'windup') { sound && sound.scytheRaise && sound.scytheRaise(threatSide ? threatSide.angle : 0); fear && fear.kick(0.7); edgeT = 0.4; if (!st.firstWindup) { st.firstWindup = true; ctx.bus.emit('jashi:first-windup', {}); } }
    if (e === 'swing') sound && sound.scytheSwing && sound.scytheSwing();
    if (e === 'hit') { sound && sound.hit && sound.hit(); fear && fear.kick(1); ctx.fx && ctx.fx.spook && ctx.fx.spook(0.8); if (!st.firstHit) { st.firstHit = true; ctx.bus.emit('jashi:first-hit', {}); } }
    if (e === 'miss') sound && sound.miss && sound.miss();
    if (e === 'death') onDeath('scythe');
    if (e === 'gazeDeath') onDeath('gaze');
  }
  function reset({ grace = 0 } = {}) { const charges = st.charges; S = createSurvival(); S.grace = grace; st.charges = charges; st.frozen = 0; st.throwFx = null; bottleMesh.visible = false; shared.pose = {}; setClosed(false); updateBottles(); }
  ctx.bus.on('item:pickup', updateBottles); ctx.bus.on('task:done', updateBottles);
  return {
    update, reset, updateBottles,
    get state() { return S; }, get charges() { return st.charges; }, set charges(v) { st.charges = v; updateBottles(); },
    get closed() { return st.closed; }, get frozen() { return st.frozen; },
    level: () => { const g = 1 - S.sanity / 100; return Math.min(1, Math.max(g * 0.9, S.phase === 'windup' ? 0.85 : 0, S.hit * 0.8)); },
    source, blocked,
  };
}
