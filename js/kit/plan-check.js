/* game-kit 6e0b6f0: js/plan-check.js — edit in game-kit and run tools/kit-sync.js */
// Floor-plan checks (W16/W17), pure data in -> findings out. No DOM, runs in Node and in the browser.
// plan = { rooms:[{id,name,x,z,w,d,floor?,kind:'room'|'corridor'|'outdoor'|'stairs'}],
//          doors:[{id,a,b,x?,z?,width,kind?:'door'|'stairs'|'lift'|'exit',reason?}],
//          stations?:[{id,room,x?,z?}], furniture?:[{id,room,x,z,w,d}], routes?:[{id,path:[roomId..],open?}],
//          start, exits:[roomId..] }
// (x,z) = the room's min corner in metres; w along x, d along z; floor = storey index (default 0).
// Door (x,z) = centre of the opening, on the wall shared by a and b (omit for stairs/lifts).
// checkPlan(plan, opts) -> { errors:[{code,msg}], warns:[{code,msg}], info:[..], stats, ok }
// opts: { corridorMin=1.2, doorMin=0.9, corridorMaxWidth=4, corridorAspect=3, maxDirectPerRoom=2,
//         asError:[codes], ignore:[codes] }
export const CODES = {
  'room-overlap': 'rooms overlap', 'unreachable': 'room not reachable from start', 'corridor-narrow': 'corridor narrower than 1.2 m',
  'door-narrow': 'door narrower than 0.9 m', 'door-wall': 'door is not on the wall shared by its rooms', 'station-room': 'station not inside its room',
  'corridor-shape': 'a corridor must be long and narrow (aspect >= 3, width <= 4 m)', 'direct-per-room': 'room has too many direct room-to-room links',
  'direct-total': 'too many direct room-to-room links overall', 'direct-reason': 'direct link without a building reason',
  'no-corridor': 'room has no corridor access', 'dead-end': 'dead-end corridor / open route', 'exit-unreachable': 'exit not reachable', 'exits-few': 'fewer than 2 exits',
  'furniture-door': 'furniture blocks a door', 'route': 'monster route is broken', 'no-loop': 'no loop in the corridor network (monsters get cornered)',
  'ref': 'unknown id / bad reference',
};
const EPS = 0.31;
const isHall = (r) => r.kind === 'corridor' || r.kind === 'stairs';
// a way through for the loop and corridor-access checks: corridors, stairs and outdoor areas (a village's loop runs along its roads; standard 1.7)
const isWay = (r) => isHall(r) || r.kind === 'outdoor';

export function checkPlan(plan, opts = {}) {
  const o = { corridorMin: 1.2, doorMin: 0.9, corridorMaxWidth: 4, corridorAspect: 3, maxDirectPerRoom: 2, asError: [], ignore: [], ...opts };
  // plan.checks = { ignore: [codes], why } (standard 1.1): a plan that deliberately breaks a W16 rule (a room-to-room level without corridors) says so once, in the data
  if (plan.checks && Array.isArray(plan.checks.ignore)) o.ignore = [...new Set([...(o.ignore || []), ...plan.checks.ignore])];
  const errors = [], warns = [], info = [];
  const add = (code, msg, sev) => {
    if (o.ignore.includes(code)) return;
    (sev === 'error' || o.asError.includes(code) ? errors : warns).push({ code, msg });
  };
  const E = (c, m) => add(c, m, 'error'), W = (c, m) => add(c, m, 'warn');
  const rooms = plan.rooms || [], doors = plan.doors || [];
  const byId = new Map(rooms.map((r) => [r.id, r]));
  const fl = (r) => r.floor || 0;
  const name = (r) => `${r.id}${r.name ? ' ' + r.name : ''}`;

  // rooms: shape, overlap
  for (const r of rooms) {
    if (r.kind === 'corridor') {
      const w = Math.min(r.w, r.d), l = Math.max(r.w, r.d);
      if (w < o.corridorMin) E('corridor-narrow', `corridor ${name(r)} is ${w.toFixed(2)} m wide (< ${o.corridorMin} m)`);
      if (l / w < o.corridorAspect || w > o.corridorMaxWidth) E('corridor-shape', `corridor ${name(r)} is ${r.w}x${r.d} m: not long and narrow (aspect ${(l / w).toFixed(1)}, width ${w} m; need aspect >= ${o.corridorAspect}, width <= ${o.corridorMaxWidth} m). Call it a room, or reshape it`);
    }
  }
  for (let i = 0; i < rooms.length; i++) for (let j = i + 1; j < rooms.length; j++) {
    const a = rooms[i], b = rooms[j];
    if (fl(a) !== fl(b)) continue;
    const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), oz = Math.min(a.z + a.d, b.z + b.d) - Math.max(a.z, b.z);
    if (ox > 0.01 && oz > 0.01) E('room-overlap', `rooms ${name(a)} and ${name(b)} overlap by ${ox.toFixed(1)}x${oz.toFixed(1)} m`);
  }

  // doors: references, width, position on the shared wall
  const adj = new Map(rooms.map((r) => [r.id, []]));
  const validDoors = [];
  for (const d of doors) {
    const a = byId.get(d.a), b = byId.get(d.b);
    if (!a || !b) { E('ref', `door ${d.id}: unknown room ${!a ? d.a : d.b}`); continue; }
    const wid = d.width ?? 1;
    if (wid < o.doorMin && d.kind !== 'exit') E('door-narrow', `door ${d.id} (${d.a}-${d.b}) is ${wid} m wide (< ${o.doorMin} m)`);
    const vertical = d.kind === 'stairs' || d.kind === 'lift' || fl(a) !== fl(b);
    if (!vertical && d.x != null) {
      const near = (r) => {
        const dx = Math.max(r.x - d.x, 0, d.x - (r.x + r.w)), dz = Math.max(r.z - d.z, 0, d.z - (r.z + r.d));
        const onEdge = Math.abs(d.x - r.x) < EPS || Math.abs(d.x - r.x - r.w) < EPS || Math.abs(d.z - r.z) < EPS || Math.abs(d.z - r.z - r.d) < EPS;
        return dx <= EPS && dz <= EPS && onEdge;
      };
      if (!near(a) || !near(b)) E('door-wall', `door ${d.id} at (${d.x}, ${d.z}) is not on the wall shared by ${d.a} and ${d.b}`);
    }
    adj.get(d.a).push(d.b); adj.get(d.b).push(d.a);
    validDoors.push(d);
  }

  // reachability
  const reach = (from) => {
    const seen = new Set([from]), q = [from];
    while (q.length) for (const n of adj.get(q.shift()) || []) if (!seen.has(n)) { seen.add(n); q.push(n); }
    return seen;
  };
  const start = plan.start;
  let seen = new Set();
  if (!byId.has(start)) E('ref', `start room "${start}" does not exist`);
  else {
    seen = reach(start);
    for (const r of rooms) if (!seen.has(r.id)) E('unreachable', `room ${name(r)} cannot be reached from start ${start}`);
  }
  const exits = plan.exits || [];
  for (const e of exits) {
    if (!byId.has(e)) E('ref', `exit room "${e}" does not exist`);
    else if (byId.has(start) && !seen.has(e)) E('exit-unreachable', `exit ${e} cannot be reached from start`);
  }
  if (exits.length < 2) W('exits-few', `only ${exits.length} exit(s); put one at each end of the main corridor`);

  // W16: direct links, corridor access, dead ends
  const plain = (r) => r.kind !== 'corridor' && r.kind !== 'stairs' && r.kind !== 'outdoor';
  const direct = new Map(), pairs = [];
  for (const d of validDoors) {
    const a = byId.get(d.a), b = byId.get(d.b);
    if (!plain(a) || !plain(b) || d.kind === 'exit') continue;
    pairs.push(d);
    for (const [x, y] of [[a, b], [b, a]]) { if (!direct.has(x.id)) direct.set(x.id, new Set()); direct.get(x.id).add(y.id); }
    if (!d.reason) W('direct-reason', `direct link ${d.a}-${d.b} (door ${d.id}) has no "reason" (e.g. anteroom, prep room)`);
  }
  for (const [id, s] of direct) if (s.size > o.maxDirectPerRoom) W('direct-per-room', `room ${name(byId.get(id))} links directly to ${s.size} rooms (${[...s].join(', ')}); max ${o.maxDirectPerRoom}`);
  const nRooms = rooms.filter(plain).length;
  const pairSet = new Set(pairs.map((d) => [d.a, d.b].sort().join('|')));
  if (pairSet.size > nRooms / 3) W('direct-total', `${pairSet.size} direct room-to-room links among ${nRooms} rooms (limit ${(nRooms / 3).toFixed(1)} = rooms/3)`);
  for (const r of rooms.filter(plain)) {
    if (!(adj.get(r.id) || []).some((n) => isWay(byId.get(n)))) W('no-corridor', `room ${name(r)} has no door to a corridor`);
  }
  for (const r of rooms.filter(isHall)) {
    const deg = new Set(adj.get(r.id)).size;
    if (deg <= 1 && !exits.includes(r.id) && r.id !== start) W('dead-end', `${r.kind} ${name(r)} is a dead end (${deg} connection); add a loop, an exit or a stair`);
  }
  // loop: corridors/stairs network must contain a cycle
  const halls = rooms.filter(isWay);
  if (halls.length > 1) {
    const hs = new Set(halls.map((h) => h.id));
    const edges = new Set(validDoors.filter((d) => hs.has(d.a) && hs.has(d.b)).map((d) => d.id));
    if (edges.size < halls.length) W('no-loop', `corridor network is a tree (${halls.length} corridors/stairs, ${edges.size} links): no loop to run around; link both ends or add a cross corridor`);
  }

  // stations / furniture / routes
  for (const s of plan.stations || []) {
    const r = byId.get(s.room);
    if (!r) { E('ref', `station ${s.id}: unknown room ${s.room}`); continue; }
    if (s.x != null && (s.x < r.x || s.x > r.x + r.w || s.z < r.z || s.z > r.z + r.d)) {
      const other = rooms.find((q) => fl(q) === fl(r) && s.x >= q.x && s.x <= q.x + q.w && s.z >= q.z && s.z <= q.z + q.d);
      E('station-room', `station ${s.id} at (${s.x}, ${s.z}) is not inside ${s.room}${other ? ` (it is in ${other.id})` : ''}`);
    }
  }
  for (const f of plan.furniture || []) {
    for (const d of validDoors) {
      if (d.x == null || (d.a !== f.room && d.b !== f.room)) continue;
      const m = 0.6;
      if (d.x >= f.x - f.w / 2 - m && d.x <= f.x + f.w / 2 + m && d.z >= f.z - f.d / 2 - m && d.z <= f.z + f.d / 2 + m) E('furniture-door', `furniture ${f.id} stands within ${m} m of door ${d.id}`);
    }
  }
  for (const rt of plan.routes || []) {
    const p = rt.path || [];
    for (let i = 0; i + 1 < p.length; i++) if (!(adj.get(p[i]) || []).includes(p[i + 1])) E('route', `route ${rt.id}: ${p[i]} -> ${p[i + 1]} have no door`);
    if (p.length > 2 && p[0] !== p[p.length - 1] && !rt.open) W('dead-end', `route ${rt.id} does not return to its start (set "open":true if intended)`);
  }
  const stats = { rooms: rooms.length, doors: doors.length, directPairs: pairSet.size, corridors: rooms.filter((r) => r.kind === 'corridor').length };
  info.push(`${stats.rooms} rooms, ${stats.doors} doors, ${stats.directPairs} direct room links`);
  return { errors, warns, info, stats, ok: errors.length === 0 };
}

// ids of the doors that join two ordinary rooms directly (for highlighting)
export function directLinks(plan) {
  const byId = new Map((plan.rooms || []).map((r) => [r.id, r]));
  const plain = (r) => r && r.kind !== 'corridor' && r.kind !== 'stairs' && r.kind !== 'outdoor';
  return (plan.doors || []).filter((d) => plain(byId.get(d.a)) && plain(byId.get(d.b)) && d.kind !== 'exit').map((d) => d.id);
}
