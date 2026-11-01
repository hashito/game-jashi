/* game-kit 6e0b6f0: js/audio-at.js — edit in game-kit and run tools/kit-sync.js */
// Positional cues and "heard through the building" (standard 1.5), pure: no Web Audio, no DOM; runs in Node (test/audio-at.test.mjs).
//   audio.at(pos).door()        any one-shot of js/audio.js played FROM a world position (a Vector3 / { x, y, z }): panned, quieter with distance,
//                               and muffled (low-pass + quieter) when walls / shut doors lie between that spot and the listener.
//   audio.occlusionOf = (pos) => 0..1      set by game-core from the plan (roomGraph + occlusion below); a game may replace it (a grid game: its own line of sight).
// The muffling is room based (the standard world is rooms and doors): the sound travels room to room through the doors; every OPEN door costs a little,
// every shut one a lot; the cheapest route counts. The outdoor ambience (js/ambience.js) does the same for the beds.
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const COST = { open: 0.22, shut: 0.7, wall: 0.95 }; // what one open door / one shut door / no door at all takes out of the sound

// rooms and the doors between them: { rooms: Map(id -> { floor }), adj: Map(id -> [{ to, door }]) }; same-floor neighbours only unless the door is stairs / lift
export function roomGraph(plan) {
  const rooms = new Map((plan.rooms || []).map((r) => [r.id, { floor: r.floor || 0, x: r.x, z: r.z, w: r.w, d: r.d }]));
  const adj = new Map([...rooms.keys()].map((k) => [k, []]));
  for (const d of plan.doors || []) {
    if (!rooms.has(d.a) || !rooms.has(d.b)) continue;
    const kind = d.kind || 'door';
    adj.get(d.a).push({ to: d.b, door: d.id, kind }); adj.get(d.b).push({ to: d.a, door: d.id, kind });
  }
  return { rooms, adj };
}
export function roomOf(graph, x, z, floor = 0) {
  let best = null;
  for (const [id, r] of graph.rooms) if ((r.floor || 0) === floor && x >= r.x && x <= r.x + r.w && z >= r.z && z <= r.z + r.d && (!best || r.w * r.d < best.a)) best = { id, a: r.w * r.d };
  return best ? best.id : null;
}
// 0 = heard clearly (same room), 1 = (almost) not at all. isOpen(doorId) -> bool | 0..1 (a door swinging); stairs / lifts count as a shut door
export function occlusion(graph, from, to, isOpen = () => true) {
  if (!from || !to || from === to) return from === to && from ? 0 : COST.wall;
  const best = new Map([[from, 0]]), q = [from];
  while (q.length) {
    q.sort((a, b) => best.get(a) - best.get(b));
    const u = q.shift(), cu = best.get(u);
    if (u === to) return clamp01(cu);
    for (const e of graph.adj.get(u) || []) {
      const open = e.kind === 'stairs' || e.kind === 'lift' ? 0 : +clamp01(+isOpen(e.door));
      const c = cu + COST.shut + (COST.open - COST.shut) * open;
      if (c < (best.has(e.to) ? best.get(e.to) : Infinity)) { best.set(e.to, c); q.push(e.to); }
    }
  }
  return COST.wall;
}
// the filter for an occlusion value: a low-pass that closes (12 kHz -> 450 Hz, exponential) and a gain that drops (1 -> 0.35)
export function muffle(occ) {
  const k = clamp01(occ);
  return { cutoff: 12000 * Math.pow(450 / 12000, k), gain: 1 - 0.65 * k };
}
