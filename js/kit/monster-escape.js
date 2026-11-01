/* game-kit 6e0b6f0: js/monster-escape.js — edit in game-kit and run tools/kit-sync.js */
// Rule S20 as code: can a calm player get away from the early chase? Pure (Node + browser). Used by tools/check-escape.mjs and the tests.
//
//   const nav = navFromPlan(plan);  const p = resolveParams('early');
//   escapeScenarios(nav, p, { rooms })                      -> [{ id, player:{x,z,floor}, monster:{x,z,floor}, gap }]  every chase start in these rooms
//   findEscape(nav, p, scenario, player?)                   -> { ok, refuge: 'hide'|'loop'|'corners', node, path:[pts], margin } | { ok:false, reason }
//   replay(nav, p, scenario, 'run'|'stand', { path })       -> { outcome: 'escaped'|'caught'|'timeout', t, events }   (the real MonsterAI, a player walking at run speed)
//
// Static proof (findEscape): the monster starts `gap` metres (along the walkways) behind the player and chases at speed.chase; the player runs at
// 0.95 * run. A node is SAFE when the player gets there at least `margin` seconds before the monster. From the player's start we search only
// through safe nodes; the escape exists when a safe node is a hiding spot (the plan's `hides`), lies on a loop of the room graph (run round it
// until the chase gives up) or lies behind at least `lose.corners` bends (the monster loses you). A start with no such node is a death trap
// (a dead end with no hiding place): the plan needs a loop, a bend or a hiding place there.
import { PLAYER, WITNESS, MonsterAI } from './monster-ai.js';

const hyp = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// every chase start in the given rooms: the player at a room centre or a door of it, the monster at any walkway point that is `gapMin`..`sight` metres away
export function escapeScenarios(nav, p, o = {}) {
  const rooms = new Set(o.rooms || nav.rooms.map((r) => r.id));
  const G = nav.graph, out = [];
  const gapMin = o.gapMin ?? 3.5;
  for (const n of G.nodes) {
    if (!rooms.has(n.room) || n.kind === 'hide' || nav.safe.has(n.room)) continue; // nobody is chased inside a safe room
    const dm = G.dijkstra([{ id: n.id, d: 0 }]).dist;
    for (const m of G.nodes) {
      if (m.id === n.id || m.kind === 'hide' || (o.monsterRooms && !o.monsterRooms.includes(m.room))) continue;
      if (dm[m.id] < gapMin || dm[m.id] > p.sight || (o.requireLos !== false && !nav.los(n, m))) continue; // it noticed the player, so it saw them
      out.push({ id: `${n.room}#${n.id}<-${m.room}#${m.id}`, player: { x: n.x, z: n.z, floor: n.floor || 0 }, monster: { x: m.x, z: m.z, floor: m.floor || 0 }, gap: dm[m.id], room: n.room });
    }
  }
  return out;
}

export function findEscape(nav, p, sc, player = PLAYER, o = {}) {
  const G = nav.graph, margin = o.margin ?? 0.4, vr = (o.vr ?? player.run) * 0.95, vc = p.speed.chase;
  const dm = G.dijkstra(nav.sourcesOf(sc.monster)).dist;
  const safe = (i, d) => d / vr + margin < dm[i] / vc;
  const { dist: dp, prev } = G.dijkstra(nav.sourcesOf(sc.player), safe);
  const minHide = o.hideMargin ?? 1.5;
  let best = null;
  for (let i = 0; i < G.nodes.length; i++) {
    if (!(dp[i] < Infinity)) continue;
    const n = G.nodes[i], m = dm[i] / vc - dp[i] / vr;
    const chain = []; for (let k = i; k >= 0; k = prev[k]) chain.push(k); chain.reverse();
    const pts = chain.map((k) => ({ x: G.nodes[k].x, z: G.nodes[k].z, floor: G.nodes[k].floor || 0 }));
    let refuge = null;
    if (nav.safe.has(n.room) && m >= minHide) refuge = 'safe'; // a safe room: it cannot see or touch you there
    else if (n.kind === 'hide' && m >= minHide && dm[i] - vc * (dp[i] / vr) >= WITNESS + 0.5) refuge = 'hide'; // it must not see you get in
    else if (nav.loops.has(n.room) && n.kind !== 'hide' && dp[i] >= (o.minRun ?? 6)) refuge = 'loop'; // a loop you have run into, not one you stand next to
    else if (p.lose.corners && dp[i] >= (o.minRun ?? 6) && nav.corners(pts, sc.player) >= p.lose.corners) refuge = 'corners';
    if (!refuge) continue;
    const rank = { safe: 0, hide: 0, loop: 1, corners: 2 }[refuge];
    if (!best || rank < best.rank || (rank === best.rank && dp[i] < best.len)) best = { ok: true, refuge, node: i, path: pts, margin: m, len: dp[i], rank };
  }
  if (best) return best;
  const reach = dp.filter((d) => d < Infinity).length;
  return { ok: false, reason: reach <= 1 ? 'the player cannot move away from the monster' : `${reach} safe points but no hiding spot, loop or bend among them` };
}

// where a running player should head next: the safe node that leaves the biggest time margin (so round a loop it keeps running away from the monster)
export function fleeTarget(nav, P, M, p, player = PLAYER) {
  const G = nav.graph, vr = player.run * 0.95, vc = p.speed.chase;
  const dm = G.dijkstra(nav.sourcesOf(M)).dist;
  const dp = G.dijkstra(nav.sourcesOf(P), (i, d) => d / vr + 0.2 < dm[i] / vc).dist;
  let best = null, bs = -Infinity;
  for (let i = 0; i < G.nodes.length; i++) { if (!(dp[i] < Infinity) || dp[i] < 1.2 || G.nodes[i].kind === 'hide') continue; const sc = dm[i] / vc - dp[i] / vr + dp[i] * 0.02 - (nav.loops.size && !nav.loops.has(G.nodes[i].room) ? 100 : 0); /* never into a dead end */ if (sc > bs) { bs = sc; best = G.nodes[i]; } }
  return best;
}

// the real MonsterAI against a player model. policy 'stand' = the player does not move; 'run' = it runs along `path` and then
// hides (if the path ends at a hiding spot) / keeps going round the loop / stays.
export function replay(nav, p, sc, policy = 'run', o = {}) {
  const ai = new MonsterAI(nav, { preset: p, rand: () => 0.5 });
  const P = { x: sc.player.x, z: sc.player.z, floor: sc.player.floor || 0, hidden: false };
  ai.spawnAt(sc.monster, 'idle'); ai.yaw = Math.atan2(P.x - sc.monster.x, P.z - sc.monster.z);
  ai.startChase(P, true);
  const dt = 1 / 30, vr = o.vr ?? PLAYER.run, limit = o.limit ?? p.lose.cap + 20;
  const events = [];
  let path = (o.path || []).slice(), pi = 0, t = 0, fleeing = false, ft = 0, goal = null;
  const hideAtEnd = o.refuge === 'hide' || o.refuge === 'safe';
  while (t < limit) {
    t += dt;
    if (policy === 'run') {
      let step = vr * dt;
      if (pi >= path.length && !hideAtEnd) { ft -= dt; if (ft <= 0 || !goal) { ft = 0.4; const g = fleeTarget(nav, P, ai.pos, p); goal = g ? nav.path(P, g) : null; } }
      const route = pi < path.length ? path : goal;
      let gi = pi < path.length ? pi : 0;
      while (step > 0 && route && gi < route.length) {
        const w = route[gi], d = hyp(P, w);
        if (d <= step) { P.x = w.x; P.z = w.z; step -= d; gi++; if (route === path) pi = gi; } else { P.x += ((w.x - P.x) / d) * step; P.z += ((w.z - P.z) / d) * step; step = 0; }
      }
      if (pi >= path.length && hideAtEnd) P.hidden = true;
    }
    for (const e of ai.update(dt, P)) {
      events.push({ t, ...e });
      if (e.type === 'catch') return { outcome: 'caught', t, events };
      if (e.type === 'lose') return { outcome: 'escaped', t, events, why: e.why };
    }
  }
  return { outcome: 'timeout', t, events };
}
