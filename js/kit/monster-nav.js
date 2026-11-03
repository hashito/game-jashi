/* game-kit 4b9f6fa: js/monster-nav.js — edit in game-kit and run tools/kit-sync.js */
// Navigation for the standard monster (js/monster-ai.js) built from plan.json. Pure: no DOM, no THREE, runs in Node.
//
//   const nav = navFromPlan(plan, { isDoorOpen: (id) => true, isDoorPassable?: (id) => true });   (isDoorOpen: sight; isDoorPassable === false: no path through)
//   nav.roomAt(x, z, floor)        -> room id | null
//   nav.path(a, b)                 -> [{ x, z }, ...] waypoints from a (excluded) to b (included), or null if unreachable
//   nav.los(a, b)                  -> true when no wall is between a and b (door openings are gaps; a shut door is a wall)
//   nav.pathLength(path, from)     -> metres;  nav.corners(path, from, minDeg) -> number of turns
//   nav.graph                      -> { nodes:[{id,x,z,room,kind}], edges, dijkstra(fromNodeId) } (check-escape.mjs uses it)
//   nav.routes                     -> patrol routes as waypoint lists: plan.routes (room id paths) or the loops found in the room graph
//   nav.loops                      -> the rooms that lie on a loop (a cycle in the room graph: a door that is not a bridge)
//   nav.hides                      -> plan.hides [{ id, room, x, z }] (hiding spots; optional in plan.json)
//
// A point is { x, z, floor? } (floor defaults to 0). Rooms are rectangles (x,z = min corner; w along x, d along z). A door is an
// opening of `width` metres centred on (x,z) on the wall the two rooms share. Doors without x,z (stairs, lifts) join the two room centres
// (the monster takes a few seconds to use them: `stairCost`). Outdoor rooms have no walls of their own.
const EPS = 1e-6;
const hyp = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export function segCross(ax, az, bx, bz, cx, cz, dx, dz) {
  // proper or touching intersection of segments ab and cd
  const d1x = bx - ax, d1z = bz - az, d2x = dx - cx, d2z = dz - cz;
  const den = d1x * d2z - d1z * d2x;
  if (Math.abs(den) < EPS) return false;
  const t = ((cx - ax) * d2z - (cz - az) * d2x) / den;
  const u = ((cx - ax) * d1z - (cz - az) * d1x) / den;
  return t > EPS && t < 1 - EPS && u >= -EPS && u <= 1 + EPS;
}

export const pathLength = (p, from) => { let L = 0, c = from; for (const w of p || []) { L += hyp(c, w); c = w; } return L; };
// number of turns sharper than minDeg along from -> path (a doorway and a bend of a corridor each count)
export function corners(p, from, minDeg = 40) {
  if (!p) return 0;
  let n = 0, prev = from;
  for (let i = 0; i + 1 < p.length; i++) {
    const a = Math.atan2(p[i].z - prev.z, p[i].x - prev.x), b = Math.atan2(p[i + 1].z - p[i].z, p[i + 1].x - p[i].x);
    let d = Math.abs(b - a) % (Math.PI * 2); if (d > Math.PI) d = Math.PI * 2 - d;
    if (hyp(prev, p[i]) > 0.2 && d * 180 / Math.PI > minDeg) n++;
    prev = p[i];
  }
  return n;
}

// A game with its OWN walk grid (届けるな: js/grid.js) uses the same AI through this adapter. grid: { path(ax, az, bx, bz) -> [[x, z, floor?], ...] (the first point is the start) | null, los(ax, az, bx, bz) -> bool }
// o: { rooms: [{ id, cx, cz, floor }] (random patrol points when no route), routes, safe: Set(room ids), roomAt(x, z) }
export function navFromGrid(grid, o = {}) {
  const pts = (p) => p.map((w) => ({ x: w[0], z: w[1], floor: w[2] || 0 }));
  return {
    kind: 'grid', grid,
    path(a, b) { const p = grid.path(a.x, a.z, b.x, b.z); if (!p || !p.length) return null; const out = pts(p); if (out.length > 1 && hyp(out[0], a) < 0.75) out.shift(); return out; },
    los(a, b) { return (a.floor || 0) === (b.floor || 0) && !!grid.los(a.x, a.z, b.x, b.z); },
    pathLength, corners, rooms: o.rooms || [], routes: o.routes || [], safe: o.safe || new Set(), loops: new Set(), hides: o.hides || [], graph: null, centre: o.centre || (() => null), roomAt: o.roomAt || (() => null),
  };
}

export function navFromPlan(plan, opts = {}) {
  const o = { isDoorOpen: () => true, stairCost: 6, nodeOffset: 0.75, ...opts };
  const rooms = (plan.rooms || []).map((r) => ({ ...r, floor: r.floor || 0, cx: r.x + r.w / 2, cz: r.z + r.d / 2 }));
  const byId = new Map(rooms.map((r) => [r.id, r]));
  const doors = plan.doors || [];

  const inRect = (r, x, z, pad = 0) => x >= r.x - pad && x <= r.x + r.w + pad && z >= r.z - pad && z <= r.z + r.d + pad;
  // the smallest room containing the point (a corridor beats a hall that overlaps by a wall)
  function roomAt(x, z, floor = 0) {
    let best = null;
    for (const r of rooms) if (r.floor === floor && inRect(r, x, z) && (!best || r.w * r.d < best.w * best.d)) best = r;
    return best ? best.id : null;
  }

  // which wall (axis + coordinate) a door sits on, and the unit normal pointing from room a into room b
  function doorGeom(d) {
    if (d.x == null || d.z == null) return null;
    const a = byId.get(d.a), b = byId.get(d.b);
    if (!a || !b) return null;
    const nearX = Math.min(Math.abs(d.x - a.x), Math.abs(d.x - (a.x + a.w)));
    const nearZ = Math.min(Math.abs(d.z - a.z), Math.abs(d.z - (a.z + a.d)));
    const vertical = nearX <= nearZ; // wall is x = const
    const n = vertical ? { x: Math.sign(b.cx - a.cx) || 1, z: 0 } : { x: 0, z: Math.sign(b.cz - a.cz) || 1 };
    return { vertical, n, w: d.width || 1 };
  }

  // ---- walls (rectangle edges with the door openings cut out) ----
  const walls = [];
  const wallsOf = (r) => {
    const edges = [
      { v: false, c: r.z, lo: r.x, hi: r.x + r.w }, { v: false, c: r.z + r.d, lo: r.x, hi: r.x + r.w },
      { v: true, c: r.x, lo: r.z, hi: r.z + r.d }, { v: true, c: r.x + r.w, lo: r.z, hi: r.z + r.d },
    ];
    for (const e of edges) {
      const gaps = [];
      for (const d of doors) {
        if ((d.a !== r.id && d.b !== r.id) || d.x == null) continue;
        const g = doorGeom(d);
        if (!g || g.vertical !== e.v) continue;
        const along = e.v ? d.z : d.x, across = e.v ? d.x : d.z;
        if (Math.abs(across - e.c) > 0.31 || along < e.lo - 0.01 || along > e.hi + 0.01) continue;
        if (o.isDoorOpen(d.id, d) !== false) gaps.push([along - g.w / 2, along + g.w / 2]);
      }
      gaps.sort((p, q) => p[0] - q[0]);
      let cur = e.lo;
      const seg = (s, t) => { if (t - s > 0.01) walls.push(e.v ? { ax: e.c, az: s, bx: e.c, bz: t, floor: r.floor } : { ax: s, az: e.c, bx: t, bz: e.c, floor: r.floor }); };
      for (const [s, t] of gaps) { seg(cur, Math.max(cur, s)); cur = Math.max(cur, t); }
      seg(cur, e.hi);
    }
  };
  let wallsDoorKey = null;
  const buildWalls = () => {
    const key = doors.map((d) => (o.isDoorOpen(d.id, d) !== false ? 1 : 0)).join('');
    if (key === wallsDoorKey) return;
    wallsDoorKey = key; walls.length = 0;
    for (const r of rooms) if (r.kind !== 'outdoor') wallsOf(r);
  };
  buildWalls();
  function los(a, b) {
    buildWalls();
    const fa = a.floor || 0, fb = b.floor || 0;
    if (fa !== fb) return false;
    for (const w of walls) if (w.floor === fa && segCross(a.x, a.z, b.x, b.z, w.ax, w.az, w.bx, w.bz)) return false;
    return true;
  }

  // ---- graph: door-side points + room centres ----
  const nodes = [], edges = new Map(); // id -> [{ to, cost }]
  const nodesByRoom = new Map();
  const addNode = (n) => { n.id = nodes.length; nodes.push(n); edges.set(n.id, []); (nodesByRoom.get(n.room) || nodesByRoom.set(n.room, []).get(n.room)).push(n.id); return n; };
  const link = (i, j, cost) => { edges.get(i).push({ to: j, cost }); edges.get(j).push({ to: i, cost }); };
  for (const r of rooms) addNode({ x: r.cx, z: r.cz, room: r.id, floor: r.floor, kind: 'centre' });
  for (const d of doors) {
    const a = byId.get(d.a), b = byId.get(d.b);
    if (!a || !b) continue;
    const g = doorGeom(d);
    if (!g) { // stairs / lift: centre to centre
      const ca = nodesByRoom.get(a.id)[0], cb = nodesByRoom.get(b.id)[0];
      link(ca, cb, o.stairCost + hyp(nodes[ca], nodes[cb]) * 0.2);
      continue;
    }
    const pa = addNode({ x: d.x - g.n.x * o.nodeOffset, z: d.z - g.n.z * o.nodeOffset, room: a.id, floor: a.floor, kind: 'door', door: d.id });
    const pb = addNode({ x: d.x + g.n.x * o.nodeOffset, z: d.z + g.n.z * o.nodeOffset, room: b.id, floor: b.floor, kind: 'door', door: d.id });
    link(pa.id, pb.id, 2 * o.nodeOffset);
    for (const [i, j] of [[pa.id, pb.id], [pb.id, pa.id]]) edges.get(i).find((e) => e.to === j).door = d.id;   // o.isDoorPassable(id) === false cuts it
    pa.mate = pb.id; pb.mate = pa.id;
  }
  const hides = (plan.hides || []).map((h) => ({ ...h, floor: (byId.get(h.room) || {}).floor || 0 }));
  for (const h of hides) { const n = addNode({ x: h.x, z: h.z, room: h.room, floor: h.floor, kind: 'hide', hide: h.id }); h.node = n.id; }
  // inside a room every pair of points sees each other (the rooms are convex rectangles)
  for (const ids of nodesByRoom.values()) for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) link(ids[i], ids[j], hyp(nodes[ids[i]], nodes[ids[j]]));

  function dijkstra(sources, allow) { // sources: [{ id, d }]; allow?(id, dist) restricts the usable nodes -> { dist, prev }
    const dist = new Array(nodes.length).fill(Infinity), prev = new Array(nodes.length).fill(-1), done = new Array(nodes.length).fill(false);
    for (const s of sources) if (s.d < dist[s.id] && (!allow || allow(s.id, s.d))) dist[s.id] = s.d;
    for (;;) {
      let u = -1;
      for (let i = 0; i < nodes.length; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
      if (u < 0) break;
      done[u] = true;
      for (const e of edges.get(u)) if ((!e.door || !o.isDoorPassable || o.isDoorPassable(e.door) !== false) && dist[u] + e.cost < dist[e.to] && (!allow || allow(e.to, dist[u] + e.cost))) { dist[e.to] = dist[u] + e.cost; prev[e.to] = u; }
    }
    return { dist, prev };
  }

  function roomOfPoint(p) {
    const f = p.floor || 0;
    let id = roomAt(p.x, p.z, f);
    if (id) return id;
    // outside every rectangle (e.g. a hair outside a wall): the nearest room on that floor
    let best = null, bd = Infinity;
    for (const r of rooms) { if (r.floor !== f) continue; const dx = Math.max(r.x - p.x, 0, p.x - r.x - r.w), dz = Math.max(r.z - p.z, 0, p.z - r.z - r.d), d = Math.hypot(dx, dz); if (d < bd) { bd = d; best = r; } }
    return best ? best.id : null;
  }

  function path(a, b) {
    const ra = roomOfPoint(a), rb = roomOfPoint(b);
    if (!ra || !rb) return null;
    if (ra === rb) return [{ x: b.x, z: b.z, floor: b.floor || 0 }];
    const src = (nodesByRoom.get(ra) || []).map((id) => ({ id, d: hyp(a, nodes[id]) }));
    const { dist, prev } = dijkstra(src);
    let best = -1, bd = Infinity;
    for (const id of nodesByRoom.get(rb) || []) { const t = dist[id] + hyp(nodes[id], b); if (t < bd) { bd = t; best = id; } }
    if (best < 0) return null;
    const out = [];
    for (let n = best; n >= 0; n = prev[n]) out.push(n);
    out.reverse();
    const pts = [...out.map((id) => ({ x: nodes[id].x, z: nodes[id].z, floor: nodes[id].floor })), { x: b.x, z: b.z, floor: b.floor || 0 }];
    // do not walk back to a waypoint that is behind (the walker is already past the first door point): skip leading points a straight line passes
    while (pts.length > 1 && (pts[0].floor || 0) === (a.floor || 0) && (pts[1].floor || 0) === (a.floor || 0) && hyp(a, pts[1]) <= hyp(a, pts[0]) + hyp(pts[0], pts[1]) + 1e-6 && hyp(a, pts[0]) < 1.2 && los(a, pts[1])) pts.shift();
    return pts;
  }
  // ---- loops: the doors that are not bridges of the room graph ----
  const adj = new Map(rooms.map((r) => [r.id, []]));
  doors.forEach((d, i) => { if (adj.has(d.a) && adj.has(d.b)) { adj.get(d.a).push({ to: d.b, i }); adj.get(d.b).push({ to: d.a, i }); } });
  const bridges = new Set();
  { // lowpoint bridge search (multi-edges handled by edge index)
    const disc = new Map(), low = new Map(); let t = 0;
    const dfs = (u, pe) => {
      disc.set(u, ++t); low.set(u, disc.get(u));
      for (const { to, i } of adj.get(u)) {
        if (i === pe) continue;
        if (disc.has(to)) low.set(u, Math.min(low.get(u), disc.get(to)));
        else { dfs(to, i); low.set(u, Math.min(low.get(u), low.get(to))); if (low.get(to) > disc.get(u)) bridges.add(i); }
      }
    };
    for (const r of rooms) if (!disc.has(r.id)) dfs(r.id, -1);
  }
  const loopDoors = new Set(doors.map((d, i) => i).filter((i) => !bridges.has(i)));
  const loopRooms = new Set();
  doors.forEach((d, i) => { if (loopDoors.has(i)) { loopRooms.add(d.a); loopRooms.add(d.b); } });
  const centre = (id) => { const r = byId.get(id); return r ? { x: r.cx, z: r.cz, floor: r.floor } : null; };
  // a cycle through the loop rooms (shortest one back to the start), for patrolling
  function loopRoutes() {
    const out = [], seen = new Set();
    for (const i of loopDoors) {
      const d = doors[i];
      // shortest path from d.b back to d.a without that door
      const dist = new Map([[d.b, [d.b]]]), q = [d.b];
      for (let h = 0; h < q.length; h++) for (const { to, i: j } of adj.get(q[h])) if (j !== i && !dist.has(to)) { dist.set(to, [...dist.get(q[h]), to]); q.push(to); }
      const back = dist.get(d.a);
      if (!back) continue;
      const cyc = [d.a, ...back]; // d.a -> d.b -> ... -> d.a
      const key = [...new Set(cyc)].sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ id: `loop${out.length + 1}`, path: cyc, loop: true });
    }
    return out;
  }
  const routeDefs = (plan.routes && plan.routes.length ? plan.routes.map((r) => ({ id: r.id, path: r.path, loop: !r.open && r.path.length > 2 && r.path[0] === r.path[r.path.length - 1] })) : loopRoutes());
  const routes = routeDefs.map((r) => ({ id: r.id, loop: r.loop, rooms: r.path, points: r.path.map(centre).filter(Boolean) }));

  const sourcesOf = (p) => (nodesByRoom.get(roomOfPoint(p)) || []).map((id) => ({ id, d: hyp(p, nodes[id]) }));
  const safe = new Set(rooms.filter((r) => r.safe).map((r) => r.id)); // rooms where the monster cannot see or touch the player (plan.rooms[].safe)
  return { plan, rooms, sourcesOf, safe, byId, doors, walls, roomAt, path, los, pathLength, corners, graph: { nodes, edges, dijkstra, nodesByRoom }, routes, loops: loopRooms, loopDoors, bridges, hides, centre, roomOfPoint };
}
