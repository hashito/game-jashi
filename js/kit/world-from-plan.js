/* game-kit 9a50101: js/world-from-plan.js — edit in game-kit and run tools/kit-sync.js */
// The standard world builder (docs/standard-3d.md, layer "world"): plan.json (rooms, corridors, doors, stations) -> THREE objects,
// colliders, doors that open and a room lookup. Boxes only: floors, ceilings, walls with door gaps and lintels, door panels, task
// stations. The look is a flat palette per room kind + the preset lighting; richer looks (texture-library, props, env-props) are added
// by the game through the 'world:built' hook (ctx.world.group) or the room `look` key.
// Floors (standard 1.1): a room's `floor` (0, 1, ...) stands floorH (3.4 m) higher per floor; world.floorY(floor) gives the height and
// the controller's floorY follows it. A door of kind 'stairs' | 'lift' joins two rooms on different floors: each end gets a stair block
// you walk up to ([E]); door.ends = { a: { x, z, arrive: [x, z], yaw }, b: { ... } } places the blocks and where you arrive (default: the room's middle,
// 1.2 m from the block). world.useStairs(o, ctx) is the core's ctx.useStairs: a short fade, then ctx.setFloor(floor, { x, z, yaw }).
//
//   const world = buildWorld(plan, { isUnlocked: (key) => prog.isUnlocked(key) });
//   scene.add(world.group);  fp = new FirstPersonController(camera, canvas, { colliders: world.colliders, bounds: world.bounds });
//   world.roomAt(x, z) -> room id | null      world.spawn -> { x, z, yaw }      world.doors.get(id).open()
//   world.place(mesh, roomId, x?, z?)         puts a pickup / station mesh in a room (default: spread around the middle)
//   world.interactables                        meshes with userData.interact = { kind, id } (the raycast targets)
// Pure geometry helpers (wallSpans, doorEdge, sharedCuts, wallOwner) are exported and tested in Node; buildWorld needs THREE (import map or test/three-hook.mjs).
// Standard 1.7: a wall shared by two rooms is built once (an indoor room's wall wins over an outdoor one, then the lower id; W6);
// an outdoor room has no plaster walls: its edges keep their colliders and get a light look (rooms[].edge: 'trees' | 'hedge' |
// 'fence' | 'stone' | 'none'; default trees on the outer edge, hedge between two outdoor rooms) - world.edges lists them for a game
// that dresses them itself (edge 'none'); a door with "open": true is an opening (no panel, always open); lamps hang below the ceiling with a shade.
import * as THREE from 'three';
import { selectInteractable, selectAtScreen, rayBox } from './interact-select.js';
import { roomLook } from './room-types.js';

export const DEFAULTS = { wallH: 3, wallT: 0.16, floorH: 3.4, doorH: 2.2, doorW: 1.0, roomLights: true };
export const PALETTE = {
  room: { floor: 0x6b6f6c, wall: 0xb9b6a8, ceil: 0xd8d6cc }, corridor: { floor: 0x57605b, wall: 0xa7ada3, ceil: 0xc8cbc3 },
  outdoor: { floor: 0x3d4a3a, wall: 0x6b7466, ceil: null }, stairs: { floor: 0x5a5a5a, wall: 0xa0a0a0, ceil: 0xc0c0c0 },
};

// which wall of room r a door at (x, z) is on: 'n' (z = r.z) | 's' | 'w' | 'e', and the position along that wall
export function doorEdge(r, x, z) {
  const d = { n: Math.abs(z - r.z), s: Math.abs(z - (r.z + r.d)), w: Math.abs(x - r.x), e: Math.abs(x - (r.x + r.w)) };
  const edge = Object.keys(d).sort((a, b) => d[a] - d[b])[0];
  return { edge, t: edge === 'n' || edge === 's' ? x : z, dist: d[edge] };
}

// solid spans of a wall from t0 to t1 with gaps [{c, w}] cut out -> [[from, to], ...]
export function wallSpans(t0, t1, gaps) {
  const cuts = gaps.map((g) => [Math.max(t0, g.c - g.w / 2), Math.min(t1, g.c + g.w / 2)]).sort((a, b) => a[0] - b[0]);
  const out = []; let at = t0;
  for (const [a, b] of cuts) { if (a > at + 1e-3) out.push([at, a]); at = Math.max(at, b); }
  if (t1 > at + 1e-3) out.push([at, t1]);
  return out;
}

// who builds a wall two rooms share: an indoor room over an outdoor one, otherwise the lower id (pure)
export function wallOwner(a, b) {
  const out = (r) => (r.kind || 'room') === 'outdoor';
  if (out(a) !== out(b)) return out(a) ? b : a;
  return a.id < b.id ? a : b;
}
// the stretches of room r's edge that another room builds instead: [{ c, w }] gaps along the edge (pure)
export function sharedCuts(r, edge, rooms) {
  const cuts = [], f = r.floor || 0, eps = 0.02;
  const line = { n: r.z, s: r.z + r.d, w: r.x, e: r.x + r.w }[edge];
  const along = edge === 'n' || edge === 's';
  const t0 = along ? r.x : r.z, t1 = along ? r.x + r.w : r.z + r.d;
  const opposite = { n: 's', s: 'n', w: 'e', e: 'w' }[edge];
  for (const o of rooms) {
    if (o === r || (o.floor || 0) !== f) continue;
    const oline = { n: o.z, s: o.z + o.d, w: o.x, e: o.x + o.w }[opposite];
    if (Math.abs(oline - line) > eps) continue;
    const a = Math.max(t0, along ? o.x : o.z), b = Math.min(t1, along ? o.x + o.w : o.z + o.d);
    if (b - a <= eps) continue;
    if (wallOwner(r, o) !== r) cuts.push({ c: (a + b) / 2, w: b - a, by: o.id });
  }
  return cuts;
}
// the other room just across an edge at position t (for the edge look: shared or outer) (pure)
export function neighbourAt(r, edge, t, rooms) {
  const off = 0.3, f = r.floor || 0;
  const [x, z] = edge === 'n' ? [t, r.z - off] : edge === 's' ? [t, r.z + r.d + off] : edge === 'w' ? [r.x - off, t] : [r.x + r.w + off, t];
  return rooms.find((o) => o !== r && (o.floor || 0) === f && x > o.x && x < o.x + o.w && z > o.z && z < o.z + o.d) || null;
}
const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0, ...o });

export function buildWorld(plan, o = {}) {
  const K = { ...DEFAULTS, ...o };
  const group = new THREE.Group(); group.name = 'world';
  const colliders = [], interactables = [], roomsById = new Map(), doors = new Map();
  const isUnlocked = o.isUnlocked || (() => true);
  const rooms = plan.rooms || [];
  const mats = {};
  const m = (k, c) => (mats[`${k}${c}`] ||= mat(c));
  const box = (w, h, d, material, x, y, z, collide = true, name = '') => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z); mesh.name = name; mesh.castShadow = false; mesh.receiveShadow = true;
    group.add(mesh);
    let col = null;
    if (collide) { col = { box: new THREE.Box3(new THREE.Vector3(x - w / 2, y - h / 2, z - d / 2), new THREE.Vector3(x + w / 2, y + h / 2, z + d / 2)), off: false }; colliders.push(col); }
    return { mesh, col };
  };
  const yOf = (r) => (r.floor || 0) * K.floorH;
  const floorY = (floor) => (floor || 0) * K.floorH;
  const byId = new Map(rooms.map((r) => [r.id, r]));

  // doors per room (non-vertical ones that have a position)
  const gapsOf = new Map(rooms.map((r) => [r.id, []]));
  for (const d of plan.doors || []) {
    const a = byId.get(d.a), b = byId.get(d.b);
    if (!a || !b || d.x == null || d.kind === 'stairs' || d.kind === 'lift' || (a.floor || 0) !== (b.floor || 0)) continue;
    for (const r of [a, b]) { const e = doorEdge(r, d.x, d.z); gapsOf.get(r.id).push({ ...e, w: d.width ?? K.doorW, id: d.id }); }
  }

  const edges = [];   // outdoor edges: { room, edge, from: [x, z], to: [x, z], shared, look }
  const hidden = new THREE.MeshBasicMaterial({ visible: false });
  const litRooms = rooms.filter((r) => (PALETTE[r.kind || 'room'] || PALETTE.room).ceil != null).length;
  for (const r of rooms) {
    const pal = PALETTE[r.kind || 'room'] || PALETTE.room, y0 = yOf(r), H = K.wallH, T = K.wallT;
    const outdoor = (r.kind || 'room') === 'outdoor';
    const tint = (c) => { const k = 1 + ((r.id.split('').reduce((s, ch) => s + ch.charCodeAt(0), 0) % 7) - 3) * 0.03; return new THREE.Color(c).multiplyScalar(k).getHex(); };
    const cx = r.x + r.w / 2, cz = r.z + r.d / 2;
    box(r.w, 0.1, r.d, m('f' + r.kind, tint(pal.floor)), cx, y0 - 0.05, cz, false, `floor:${r.id}`);
    if (pal.ceil != null) box(r.w, 0.1, r.d, m('c' + r.kind, pal.ceil), cx, y0 + H + 0.05, cz, false, `ceil:${r.id}`);
    const wallM = outdoor ? hidden : m('w' + r.kind, tint(pal.wall));
    const edgesOf = { n: [r.x, r.x + r.w, r.z, 'x'], s: [r.x, r.x + r.w, r.z + r.d, 'x'], w: [r.z, r.z + r.d, r.x, 'z'], e: [r.z, r.z + r.d, r.x + r.w, 'z'] };
    for (const [edge, [t0, t1, fixed, axis]] of Object.entries(edgesOf)) {
      const doorGaps = gapsOf.get(r.id).filter((g) => g.edge === edge).map((g) => ({ c: g.t, w: g.w }));
      const cuts = K.dedupe === false ? [] : sharedCuts(r, edge, rooms);
      for (const [a, b] of wallSpans(t0, t1, [...doorGaps, ...cuts])) {
        const len = b - a, mid = (a + b) / 2;
        if (axis === 'x') box(len, H, T, wallM, mid, y0 + H / 2, fixed, true, `wall:${r.id}:${edge}`);
        else box(T, H, len, wallM, fixed, y0 + H / 2, mid, true, `wall:${r.id}:${edge}`);
        if (outdoor) {
          const nb = neighbourAt(r, edge, mid, rooms);
          const look = r.edge || (nb ? 'hedge' : roomLook(r).edge || 'trees');   // rooms[].edge; between two rooms a hedge; outside: the room type's look, else trees
          edges.push({ room: r.id, edge, from: axis === 'x' ? [a, fixed] : [fixed, a], to: axis === 'x' ? [b, fixed] : [fixed, b], shared: !!nb, look, y: y0 });
        }
      }
      if (outdoor) continue;   // no lintels over outdoor openings
      for (const g of doorGaps) { // lintel above each opening (not where another room builds the wall)
        if (cuts.some((c) => Math.abs(c.c - g.c) < c.w / 2)) continue;
        const lh = H - K.doorH;
        if (lh > 0.05) { const l = axis === 'x' ? box(g.w, lh, T, wallM, g.c, y0 + K.doorH + lh / 2, fixed, false) : box(T, lh, g.w, wallM, fixed, y0 + K.doorH + lh / 2, g.c, false); l.mesh.userData.lintel = { room: r.id, edge }; }   // unnamed (games look for it), tagged so the textures recipe paints it like its wall
      }
    }
    if (K.roomLights && pal.ceil != null && litRooms <= 16) {   // indoor rooms only: a big outdoor map must not switch off every lamp (jashi 5.0)
      // a pendant below the ceiling (a ceiling-high light washes the ceiling out) with a small shade and a glowing bulb
      const ly = y0 + H - 0.6;
      const l = new THREE.PointLight(0xfff1d6, Math.min(30, 4 + r.w * r.d * 0.12), Math.max(r.w, r.d) * 1.8, 1.6);
      l.position.set(cx, ly, cz); l.name = `lamp:${r.id}`; group.add(l);
      const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.28, 0.18, 16, 1, true), m('shade', 0x3a3530)); shade.material.side = THREE.DoubleSide; shade.position.set(cx, ly + 0.12, cz); shade.name = `lampshade:${r.id}`; group.add(shade);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), mats.bulb ||= new THREE.MeshStandardMaterial({ color: 0xfff4dc, emissive: 0xffe0a8, emissiveIntensity: 2 })); bulb.position.set(cx, ly + 0.04, cz); bulb.name = `lampbulb:${r.id}`; group.add(bulb);
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.6 - 0.2 + 0.1, 4), m('cord', 0x1a1a1a)); cord.position.set(cx, (ly + 0.2 + y0 + H) / 2, cz); cord.name = `lampcord:${r.id}`; group.add(cord);   // from the ceiling to the shade (it was H long and hung to eye level)
    }
    roomsById.set(r.id, { room: r, y: y0, cx, cz, slots: 0 });
  }
  if (K.edgeLooks !== false) dressEdges(group, edges, colliders);

  // door panels (one per door, in the gap of room a); a locked door stays shut until its unlock key is unlocked
  // Designed doors (standard 1.10.2; feedback 2026-11-02 「ベランダへのドアのデザインを直して」「ヨコテンでドアのデザインを他のゲームについて見直して」):
  // a panel in a frame that swings or slides open (it used to vanish). plan.doorLook (default 'swing') or door.look:
  //   'swing'  a wooden door with two inset panels and a knob on each face, hinged on one side, swings 100 degrees into room a
  //   'slide'  a wooden sliding door (引き戸) with a recessed pull, slides along the wall on room a's side
  //   'fusuma' a paper sliding door (襖) with a dark lacquered border and a round pull
  //   'glass'  a glazed sliding door: four panes over a wooden kick panel (the balcony door of 邪視 5.0.2)
  //   'none'   nothing drawn (the game dresses the door itself; it still opens, closes and blocks)
  // The [E] target and the collider is an invisible box in the gap (`door:<id>`); the look is the group `doorlook:<id>`.
  const doorM = m('door', 0x6a4b32), doorPanelM = m('door-panel', 0x553a26), frameM = m('door-frame', 0x3e2c1e), knobM = mat(0x8a7a5a, { metalness: 0.6, roughness: 0.4 });
  const paperM = m('door-paper', 0xd9cfb4), lacquerM = m('door-lacquer', 0x231812), glassM = new THREE.MeshStandardMaterial({ color: 0x9fb4b8, transparent: true, opacity: 0.28, roughness: 0.08, metalness: 0.1, depthWrite: false });
  const doorHitM = new THREE.MeshBasicMaterial({ visible: false });
  const outdoorRoom = (r) => (r.kind || 'room') === 'outdoor';
  function doorLook(d, a, b, edge, w) {
    const look = d.look || plan.doorLook || 'swing', H = K.doorH - 0.02, T = K.wallT;
    const sIn = edge === 'n' || edge === 'e' ? 1 : -1;   // room a's side, in the door's local z (local x runs along the opening)
    const G = new THREE.Group(); G.name = `doorlook:${d.id}`;
    if (look === 'none') return { G, leaves: [], look, sliding: true, sIn, w, faces: [], decos: [] };
    const part = (host, mt, x, y, z, sx, sy, sz) => { const o = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mt); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; host.add(o); return o; };
    if (!(outdoorRoom(a) && (!b || outdoorRoom(b)))) {   // the casing round the opening, on both faces (not for a gate between two outdoor rooms)
      for (const sx of [-1, 1]) part(G, frameM, sx * (w / 2 + 0.04), K.doorH / 2, 0, 0.08, K.doorH + 0.02, T + 0.05);
      part(G, frameM, 0, K.doorH + 0.04, 0, w + 0.16, 0.08, T + 0.05);
    }
    // one leaf of width lw, its parts centred on x = 0 (a swing leaf is shifted onto its hinge below)
    const makeLeaf = (lw) => {
      const leaf = new THREE.Group();
      const slab = (mt, th) => { const o = part(leaf, mt, 0, H / 2 + 0.01, 0, lw - 0.03, H, th); o.userData.doorFace = true; return o; };
      if (look === 'swing') {
        slab(doorM, 0.045);
        for (const f of [-1, 1]) for (const [py, ph] of [[H * 0.72, H * 0.36], [H * 0.27, H * 0.36]]) part(leaf, doorPanelM, 0, py, f * 0.026, lw - 0.24, ph, 0.012);   // two inset panels a face
        for (const f of [-1, 1]) part(leaf, knobM, lw / 2 - 0.1, 1.0, f * 0.045, 0.05, 0.05, 0.05);
      } else if (look === 'fusuma') {
        slab(paperM, 0.03);
        for (const f of [-1, 1]) { for (const sx of [-1, 1]) part(leaf, lacquerM, sx * (lw / 2 - 0.035), H / 2 + 0.01, f * 0.017, 0.04, H, 0.008); for (const yy of [0.03, H - 0.01]) part(leaf, lacquerM, 0, yy, f * 0.017, lw - 0.03, 0.04, 0.008); }
        for (const f of [-1, 1]) part(leaf, lacquerM, lw / 2 - 0.13, 0.95, f * 0.018, 0.06, 0.06, 0.006);   // the round pull (引手)
      } else if (look === 'glass') {
        const st = 0.06, kick = 0.85;
        for (const sx of [-1, 1]) part(leaf, doorM, sx * (lw / 2 - 0.015 - st / 2), H / 2 + 0.01, 0, st, H, 0.05);
        for (const yy of [0.04, kick, (kick + H) / 2, H - 0.02]) part(leaf, doorM, 0, yy, 0, lw - 0.03, 0.06, 0.05);
        part(leaf, doorPanelM, 0, kick / 2 + 0.02, 0, lw - 0.12, kick - 0.06, 0.03);   // the kick panel (腰板)
        part(leaf, doorM, 0, (kick + H) / 2, 0, 0.04, H - kick - 0.06, 0.05);   // the muntin
        for (const sx of [-1, 1]) for (const yy of [(kick + (kick + H) / 2) / 2, ((kick + H) / 2 + H) / 2]) part(leaf, glassM, sx * (lw / 4 - 0.01), yy, 0, lw / 2 - 0.1, (H - kick) / 2 - 0.08, 0.008);
        for (const f of [-1, 1]) part(leaf, knobM, lw / 2 - 0.1, 1.0, f * 0.03, 0.02, 0.14, 0.02);
      } else {   // slide
        slab(doorM, 0.04);
        for (const f of [-1, 1]) { part(leaf, doorPanelM, 0, H * 0.5, f * 0.022, lw - 0.16, H - 0.2, 0.008); part(leaf, lacquerM, lw / 2 - 0.1, 1.0, f * 0.022, 0.03, 0.16, 0.006); }
      }
      return leaf;
    };
    // a wide opening (1.5 m and more) gets two leaves: a pair of doors swinging from both jambs, or two sliding apart
    const sliding = look !== 'swing', pair = w >= 1.5, lw = pair ? w / 2 : w, leaves = [];
    for (const side of pair ? [-1, 1] : [1]) {
      const leaf = makeLeaf(sliding ? lw + 0.07 : lw), hold = new THREE.Group();   /* a sliding leaf runs in front of the wall: a little wider, so a pair overlaps in the middle and no light shows through */ hold.add(leaf); G.add(hold);
      if (sliding) { hold.position.set(pair ? side * lw / 2 : 0, 0, sIn * (T / 2 + 0.035 + (pair && side > 0 ? 0.045 : 0))); }   // runs on room a's face of the wall (the second leaf on its own track)
      else { leaf.position.x = -side * (lw / 2 - 0.015); if (side > 0) leaf.rotation.y = Math.PI; hold.position.x = side * (w / 2 - 0.015); }   // hinged at its jamb, the knob on the far edge
      leaves.push({ hold, side, base: hold.position.x });
    }
    const faces = [], decos = [];
    for (const f of leaves) f.hold.traverse((o) => { if (o.isMesh) (o.userData.doorFace ? faces : decos).push(o); });
    return { G, leaves, look, sliding, sIn, w: lw, faces, decos };
  }
  const doorAnims = [];
  for (const d of plan.doors || []) {
    const a = byId.get(d.a);
    if (!a || d.x == null || d.kind === 'stairs' || d.kind === 'lift') continue;
    if (d.open) { doors.set(d.id, { def: d, mesh: null, col: null, isOpen: true, locked: () => false, open() { return false; }, close() {} }); continue; }   // an opening: no panel
    const { edge } = doorEdge(a, d.x, d.z), w = d.width ?? K.doorW, y0 = yOf(a), alongX = edge === 'n' || edge === 's';
    const fixed = alongX ? (edge === 'n' ? a.z : a.z + a.d) : edge === 'w' ? a.x : a.x + a.w;
    const { mesh, col } = alongX ? box(w, K.doorH, 0.12, doorHitM, d.x, y0 + K.doorH / 2, fixed, true, `door:${d.id}`) : box(0.12, K.doorH, w, doorHitM, fixed, y0 + K.doorH / 2, d.z, true, `door:${d.id}`);
    mesh.userData.interact = { kind: 'door', id: d.id };
    interactables.push(mesh);
    const L = doorLook(d, a, byId.get(d.b), edge, w);
    L.G.position.set(alongX ? d.x : fixed, y0, alongX ? fixed : d.z); L.G.rotation.y = alongX ? 0 : -Math.PI / 2; group.add(L.G);
    // games written for the old box door dress it with `door.mesh.material = ...`: a material with a picture goes on the leaf's face (the drawn
    // panels and pulls step aside for the picture), an invisible one hides the whole door (a gate the game builds itself)
    Object.defineProperty(mesh, 'material', { configurable: true, get: () => doorHitM, set: (v) => { if (!v || v === doorHitM) return; if (v.visible === false) { L.G.visible = false; return; } L.G.visible = true; if (!L.faces.length) return; for (const o of L.faces) o.material = v; for (const o of L.decos) o.visible = false; } });
    const anim = { L, t: 0, to: 0 };
    const api = {
      def: d, mesh, col, look: L.G, isOpen: false,
      locked: () => !!d.unlock && !isUnlocked(d.unlock),
      open() { if (api.isOpen || api.locked()) return false; api.isOpen = true; mesh.visible = false; col.off = true; anim.to = 1; return true; },
      close() { api.isOpen = false; mesh.visible = true; col.off = false; anim.to = 0; },
      snap() { anim.t = anim.to; pose(anim); },   // jump to the end (a restored save)
    };
    doorAnims.push(anim);
    doors.set(d.id, api);
  }
  // open / close over 0.6 s (eased); a swing door turns about its hinge, a sliding one runs along the wall
  function pose(an) { const e = an.t * an.t * (3 - 2 * an.t), L = an.L; for (const f of L.leaves) { if (L.sliding) f.hold.position.x = f.base + f.side * e * (L.w * 0.94); else f.hold.rotation.y = f.side * L.sIn * e * 1.75; } }
  const updateDoors = (dt) => { for (const an of doorAnims) if (an.t !== an.to) { an.t = an.to > an.t ? Math.min(an.to, an.t + dt / 0.6) : Math.max(an.to, an.t - dt / 0.6); pose(an); } };

  // room under a point (y = the eye height; floors are told apart by it)
  const roomAt = (x, z, y = 1.6) => {
    for (const { room: r, y: ry } of roomsById.values()) if (x >= r.x && x <= r.x + r.w && z >= r.z && z <= r.z + r.d && Math.abs(y - ry - 1.6) < K.floorH / 2) return r.id;
    return null;
  };

  // station consoles
  const stationM = mat(0x23302c, { emissive: 0x2a8a5a, emissiveIntensity: 0.55 });
  function place(mesh, roomId, x, z) {
    const R = roomsById.get(roomId);
    if (!R) throw new Error(`world.place: unknown room ${roomId}`);
    if (x == null || z == null) { const k = R.slots++, ang = k * 2.4 + 0.6, rad = Math.min(R.room.w, R.room.d) * 0.28; x = R.cx + Math.cos(ang) * rad; z = R.cz + Math.sin(ang) * rad; }
    mesh.position.x = x; mesh.position.z = z; mesh.position.y += R.y;
    group.add(mesh);
    return mesh;
  }
  for (const s of plan.stations || []) {
    if (!roomsById.has(s.room)) continue;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.1, 0.5), stationM);
    mesh.position.y = 0.55; mesh.name = `station:${s.id}`; mesh.userData.interact = { kind: 'station', id: s.id, label: s.label };
    place(mesh, s.room, s.x, s.z);
    colliders.push({ box: new THREE.Box3().setFromObject(mesh), off: false });
    interactables.push(mesh);
  }

  // stairs / lifts: a block at each end, [E] to go to the other floor
  const stairM = mat(0x3a3f44, { emissive: 0x1a3a2a, emissiveIntensity: 0.4 });
  // a stair end drawn as stairs (standard 1.10): going up, a steep flight along the room to its far wall, climbing through a dark opening in
  // the ceiling; going down, a dark stairwell in the floor with a railing round it and the top nosing. The flight runs from the room's centre
  // towards the end point (or ends.<a|b>.dir: n / s / e / w) and stops at the wall. hit: an invisible box over it (the [E] target and the collider)
  const treadM = m('stair-tread', 0x5a4636), riserM = m('stair-riser', 0x3b2e24), railM = m('stair-rail', 0x2c2420), wellM = new THREE.MeshBasicMaterial({ color: 0x050505 });
  const hitM = new THREE.MeshBasicMaterial({ visible: false });
  function stairFlight(R, ex, ez, dir, up, y0, arrive, kind = 'ladder') {
    const cx = R.x + R.w / 2, cz = R.z + R.d / 2, dx0 = ex - cx, dz0 = ez - cz;
    const D = dir || (Math.abs(dx0) > Math.abs(dz0) ? (dx0 > 0 ? 'e' : 'w') : (dz0 >= 0 ? 's' : 'n'));
    const v = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }[D] || [0, 1], alongX = v[0] !== 0;
    const span = alongX ? R.w : R.d, wall = alongX ? (v[0] > 0 ? R.x + R.w : R.x) : (v[1] > 0 ? R.z + R.d : R.z);
    const arr = arrive || [cx, cz + 1.2], arrU = alongX ? arr[0] : arr[1], sg = alongX ? v[0] : v[1];
    const room = Math.abs(wall - 0.06 * sg - (arrU + sg * 0.5));   // the flight starts half a metre past where a player arrives (never on top of them)
    const ladder = kind !== 'flight', L = ladder ? 0.9 : Math.max(1.0, Math.min(3.2, span - 1.0, room)), W = ladder ? 0.8 : 1.2;
    const far = wall - (alongX ? v[0] : v[1]) * 0.06, near = far - (alongX ? v[0] : v[1]) * L;   // along the axis
    const mid = (near + far) / 2, side = alongX ? ez : ex;
    const at = (u, w, y) => (alongX ? [u, y, w] : [w, y, u]);   // u along the flight, w across
    const look = new THREE.Group(); look.name = 'stair-flight';
    const add = (geo, mt, u, w, y, ry = 0) => { const o = new THREE.Mesh(geo, mt); o.position.set(...at(u, w, y)); o.rotation.y = ry; o.castShadow = true; o.receiveShadow = true; look.add(o); return o; };
    const sz = (lu, lw, h) => (alongX ? new THREE.BoxGeometry(lu, h, lw) : new THREE.BoxGeometry(lw, h, lu));
    const sgn = alongX ? v[0] : v[1];
    if (ladder) {
      // a ladder against the wall, up through a hatch (feedback 2026-11-02 「普通階段逆じゃない？ハシゴの方が良いかも」): its foot and its head are
      // at the same place on both floors, so it fits a plan whose two ends arrive at the same spot (a straight flight cannot)
      const rise = K.floorH, footU = far - sgn * 0.62, headU = far - sgn * 0.14, yTop = up ? y0 + rise + 1.0 : y0 + 1.0, yFoot = up ? y0 : y0 - rise;
      const len = Math.hypot(headU - footU, yTop - yFoot), ang = Math.atan2(headU - footU, yTop - yFoot), midU = (footU + headU) / 2;
      const tilt = (o) => { if (alongX) o.rotation.z = -ang; else o.rotation.x = ang; return o; };
      for (const sw of [-1, 1]) tilt(add(sz(0.06, 0.07, len), railM, midU, side + sw * 0.25, (yFoot + yTop) / 2));   // the two rails
      const lo = up ? y0 : y0 - 0.9;   // downstairs the whole ladder; upstairs the rungs seen in the hatch
      for (let y = yFoot + 0.28; y < yTop - 0.1; y += 0.28) { if (y < lo) continue; const t = (y - yFoot) / (yTop - yFoot); add(sz(0.045, 0.5, 0.045), treadM, footU + (headU - footU) * t, side, y); }
      if (!up) {
        add(sz(L, W, 0.012), wellM, mid, side, y0 + 0.012).name = 'stair-well';   // the hatch (removed when the floor is opened over the ladder below)
        for (const [u, sw] of [[near, -1], [far, -1], [far, 1], [near, 1]]) add(sz(0.06, 0.06, 0.95), railM, u, side + sw * (W / 2 + 0.04), y0 + 0.475);
        for (const sw of [-1, 1]) add(sz(L, 0.05, 0.05), railM, mid, side + sw * (W / 2 + 0.04), y0 + 0.93);   // a rail each side; the room side stays open to step on
      }
    } else if (up) {
      const rise = K.floorH, n = Math.max(8, Math.round(rise / 0.24)), stepH = rise / n, stepD = L / n;
      for (let i = 0; i < n; i++) {
        const y = y0 + stepH * (i + 1);   // all the way to the upper floor: seen through the opening cut in the ceiling (抜け感)
        const u = near + sgn * stepD * (i + 0.5);
        add(sz(stepD + 0.02, W, 0.04), treadM, u, side, y - 0.02);                   // tread
        add(sz(0.02, W, stepH), riserM, u - sgn * stepD / 2, side, y - stepH / 2);    // riser
      }
      const run = Math.hypot(L, rise), ang = Math.atan2(rise, L);
      for (const sw of [-1, 1]) {   // stringers and a handrail on the open side
        const g = add(sz(run, 0.05, 0.22), riserM, mid, side + sw * (W / 2 + 0.025), y0 + rise / 2);
        if (alongX) g.rotation.z = sgn * ang; else g.rotation.x = -sgn * ang;
      }
      const hr = add(sz(run, 0.05, 0.05), railM, mid, side - (W / 2 + 0.05), y0 + rise / 2 + 0.9); if (alongX) hr.rotation.z = sgn * ang; else hr.rotation.x = -sgn * ang;
    } else {
      add(sz(L, W, 0.012), wellM, mid, side, y0 + 0.012).name = 'stair-well';            // the stairwell (removed when the floor is opened over a flight below)
      add(sz(0.06, W, 0.05), treadM, far - sgn * 0.03, side, y0 + 0.03);                    // the top nosing: the flight below climbs to the wall, so its top is there
      for (let i = 1; i <= 3; i++) add(sz(0.04, W - 0.06, 0.012), riserM, far - sgn * (0.18 * i), side, y0 + 0.02).name = 'stair-well';   // the next treads, dim in the dark
      const posts = [[near + sgn * 0.05, -1], [far, -1], [far, 1], [near + sgn * 0.05, 1]];
      for (const [u, sw] of posts) add(sz(0.06, 0.06, 0.95), railM, u, side + sw * (W / 2 + 0.06), y0 + 0.475);
      for (const sw of [-1, 1]) add(sz(L, 0.05, 0.05), railM, mid, side + sw * (W / 2 + 0.06), y0 + 0.93);
      add(sz(0.05, W + 0.12, 0.05), railM, far, side, y0 + 0.93);
    }
    const hit = new THREE.Mesh(sz(L, W, up && !ladder ? 2.0 : up ? 1.8 : 0.9), hitM); hit.position.set(...at(mid, side, y0 + (up ? 1.0 : 0.45)));
    // the room's pendant hangs off the flight, over where the player arrives (its cord must not run through the steps)
    const lampU = near - sgn * 0.45;
    for (const k of ['lamp', 'lampshade', 'lampbulb', 'lampcord']) { const o = group.getObjectByName(`${k}:${R.id}`); if (o) { if (alongX) o.position.x = lampU; else o.position.z = lampU; } }
    const u0 = Math.min(near, far), u1 = Math.max(near, far), rect = alongX ? { x0: u0, x1: u1, z0: side - W / 2, z1: side + W / 2 } : { x0: side - W / 2, x1: side + W / 2, z0: u0, z1: u1 };
    return { look, hit, rect };
  }
  // open a ceiling / floor slab (a box named `name`) over rect: the slab is rebuilt as the pieces around the hole
  function cutSlab(name, rect) {
    const o = group.getObjectByName(name); if (!o || !o.geometry || !o.geometry.parameters) return false;
    const { width: w, height: h, depth: dd } = o.geometry.parameters, X0 = o.position.x - w / 2, X1 = o.position.x + w / 2, Z0 = o.position.z - dd / 2, Z1 = o.position.z + dd / 2;
    const x0 = Math.max(X0, rect.x0), x1 = Math.min(X1, rect.x1), z0 = Math.max(Z0, rect.z0), z1 = Math.min(Z1, rect.z1);
    if (x1 - x0 < 0.2 || z1 - z0 < 0.2) return false;
    for (const [a0, a1, b0, b1] of [[X0, x0, Z0, Z1], [x1, X1, Z0, Z1], [x0, x1, Z0, z0], [x0, x1, z1, Z1]]) {
      if (a1 - a0 < 0.01 || b1 - b0 < 0.01) continue;
      const p = new THREE.Mesh(new THREE.BoxGeometry(a1 - a0, h, b1 - b0), o.material); p.position.set((a0 + a1) / 2, o.position.y, (b0 + b1) / 2);
      p.receiveShadow = o.receiveShadow; p.name = `${name}:part`; group.add(p);
    }
    group.remove(o); return true;
  }
  const stairs = new Map(), flights = new Map();
  for (const d of plan.doors || []) {
    const a = byId.get(d.a), b = byId.get(d.b);
    if (!a || !b || !(d.kind === 'stairs' || d.kind === 'lift' || (a.floor || 0) !== (b.floor || 0))) continue;
    const locked = () => !!d.unlock && !isUnlocked(d.unlock);
    const mkEnd = (from, to, key) => {
      const E = (d.ends && d.ends[key]) || {}, F = roomsById.get(from.id), T = roomsById.get(to.id);
      const ex = E.x ?? F.cx, ez = E.z ?? F.cz, y0 = F.y;
      const up = (T.room.floor || 0) > (from.floor || 0);
      const flight = d.kind === 'lift' ? null : stairFlight(F.room, ex, ez, E.dir, up, y0, E.arrive, d.look);   // a ladder, or a flight with look: 'flight' (feedback 2026-11-02 "階段は階段に"), lifts keep the box
      const mesh = flight ? flight.hit : new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.0, 0.6), stairM);
      if (flight) { group.add(flight.look); flights.set(`${d.id}:${up ? 'up' : 'down'}`, { ...flight, room: from.id }); } else mesh.position.set(ex, y0 + 1.0, ez);
      mesh.name = `stairs:${d.id}:${key}`;
      const arrive = (d.ends && d.ends[key === 'a' ? 'b' : 'a'] && d.ends[key === 'a' ? 'b' : 'a'].arrive) || [T.cx, T.cz + 1.2];
      mesh.userData.interact = { kind: 'stairs', id: d.id, label: d.label || (d.kind === 'lift' ? 'エレベーターに乗る' : (T.room.floor || 0) > (from.floor || 0) ? '上の階へ' : '下の階へ'), to: { x: arrive[0], z: arrive[1], floor: to.floor || 0, yaw: ((d.ends && d.ends[key === 'a' ? 'b' : 'a']) || {}).yaw ?? 0 }, locked, hint: d.hint || '', unlock: d.unlock || '' };
      group.add(mesh); interactables.push(mesh);
      colliders.push({ box: new THREE.Box3().setFromObject(mesh), off: false });
      stairs.set(`${d.id}:${key}`, mesh);
    };
    mkEnd(a, b, 'a'); mkEnd(b, a, 'b');
    // 抜け感 (feedback 2026-11-02 「階段の抜け感を表現して」): where the upper end's stairwell lies over the lower flight, the lower room's ceiling and
    // the upper room's floor are opened over the flight, so the steps are seen climbing into the room above and the well looks down onto them
    const fl = flights.get(`${d.id}:up`), fw = flights.get(`${d.id}:down`);
    if (fl && fw) {
      const r1 = fl.rect, r2 = fw.rect, ix = Math.max(0, Math.min(r1.x1, r2.x1) - Math.max(r1.x0, r2.x0)), iz = Math.max(0, Math.min(r1.z1, r2.z1) - Math.max(r1.z0, r2.z0));
      if (ix * iz > 0.6 * (r1.x1 - r1.x0) * (r1.z1 - r1.z0)) {
        const opened = cutSlab(`ceil:${fl.room}`, r1) | cutSlab(`floor:${fw.room}`, r1);
        if (opened) fw.look.children.filter((o) => o.name === 'stair-well').forEach((o) => fw.look.remove(o));
      }
    }
  }

  // bounds and spawn
  const xs = rooms.flatMap((r) => [r.x, r.x + r.w]), zs = rooms.flatMap((r) => [r.z, r.z + r.d]);
  const bounds = [Math.min(...xs) - 0.5, Math.min(...zs) - 0.5, Math.max(...xs) + 0.5, Math.max(...zs) + 0.5];
  const S = roomsById.get(plan.start);
  let spawn = plan.spawn ? { yaw: 0, ...plan.spawn } : null;
  if (!spawn && S) {
    const d0 = (plan.doors || []).find((d) => (d.a === plan.start || d.b === plan.start) && d.x != null);
    const yaw = d0 ? Math.atan2(-(d0.x - S.cx), -(d0.z - S.cz)) : 0;
    spawn = { x: S.cx, z: S.cz, yaw };
  }
  const spawnRoom = S && S.room;
  if (spawn && spawn.floor == null && spawnRoom) spawn.floor = spawnRoom.floor || 0;
  return { group, colliders, interactables, rooms: roomsById, doors, stairs, roomAt, place, bounds, spawn, floorY, yOf: (id) => roomsById.get(id)?.y || 0, K, edges, update: (dt) => updateDoors(dt) };
}

// the interaction pick (rule W18, js/interact-select.js): the thing the camera looks at, with a cone assist, a 15 cm margin around the
// visible mesh, a reach of >= 2.2 m and hysteresis. opts: { reach, touch, viewH, colliders: [{ box, off }] (walls: a thing behind one is not selected),
// prev (the id shown last frame; kept in the module otherwise) }. Returns null or { object, ...userData.interact, distance, via }.
const _bx = new THREE.Box3(), _q = new THREE.Vector3();
let lastPick = null;
function candidatesOf(camera, interactables, reach) {
  const out = [];
  for (const o of interactables) {
    if (!o.visible) continue;
    // the world position (matrixWorld), not o.position: a part of a prop (a drawer, a cabinet door) has a local position
    const e = o.matrixWorld.elements, wx = o.parent ? e[12] : o.position.x, wz = o.parent ? e[14] : o.position.z;
    if (Math.abs(wx - camera.position.x) > reach + 3 || Math.abs(wz - camera.position.z) > reach + 3) continue;
    _bx.setFromObject(o);
    if (_bx.isEmpty()) continue;
    out.push({ id: o.id, min: [_bx.min.x, _bx.min.y, _bx.min.z], max: [_bx.max.x, _bx.max.y, _bx.max.z], obj: o });
  }
  return out;
}
const blockedBy = (colliders, eye) => (cand) => {
  // a wall (a tall collider box) that the line from the eye to the thing's visible surface enters more than 10 cm before the surface hides it
  // (a terminal mounted on the near face of a wall is entered at the surface itself: not hidden)
  const e = [eye.x, eye.y, eye.z], q = [Math.max(cand.min[0], Math.min(e[0], cand.max[0])), Math.max(cand.min[1], Math.min(e[1], cand.max[1])), Math.max(cand.min[2], Math.min(e[2], cand.max[2]))];
  const dx = q[0] - e[0], dy = q[1] - e[1], dz = q[2] - e[2], L = Math.hypot(dx, dy, dz);
  if (L < 0.3) return false;
  const d = [dx / L, dy / L, dz / L];
  for (const k of colliders) {
    if (k.off) continue;
    const b = k.box;
    if (b.max.y - b.min.y < 1.0 || b.max.y < eye.y - 0.4 || b.min.y > eye.y + 0.4) continue;
    const t = rayBox(e, d, { min: [b.min.x, b.min.y, b.min.z], max: [b.max.x, b.max.y, b.max.z] }, L);
    if (t != null && t < L - 0.1) return true;
  }
  return false;
};
// every visible interactable with its visible bounds (the sweep of tools/check-select-range.mjs, tests): [{ id, kind, min, max }]
export function selectablesOf(interactables) {
  return candidatesOf({ position: { x: 0, z: 0 } }, interactables, 1e9).map((c) => ({ id: `${c.obj.userData.interact.kind}:${c.obj.userData.interact.id}`, kind: c.obj.userData.interact.kind, min: c.min, max: c.max }));
}
export function pickInteractable(camera, interactables, reach = 2.4, ray, opts = {}) {
  void ray;
  const cands = candidatesOf(camera, interactables, reach);
  if (!cands.length) return (lastPick = null);
  camera.updateMatrixWorld();
  const dir = camera.getWorldDirection(_q.clone());
  const eye = camera.position;
  const sel = selectInteractable({ eye: [eye.x, eye.y, eye.z], dir: [dir.x, dir.y, dir.z], candidates: cands, prev: opts.prev ?? lastPick, touch: !!opts.touch, viewH: opts.viewH || 720, fovDeg: camera.fov || 70,
    blocked: opts.colliders ? blockedBy(opts.colliders, eye) : null, opts: { reach } });
  lastPick = sel ? sel.id : null;
  return sel ? { object: sel.cand.obj, ...sel.cand.obj.userData.interact, distance: sel.dist, via: sel.via } : null;
}
// a tap on the screen at (x, y) in CSS px of the w x h view: the thing under the finger (touch radius >= 44 px), or null
export function pickInteractableAt(camera, interactables, x, y, w, h, reach = 2.4, opts = {}) {
  const cands = candidatesOf(camera, interactables, reach);
  if (!cands.length) return null;
  camera.updateMatrixWorld();
  const m = camera.matrixWorld.elements;
  const basis = { right: [m[0], m[1], m[2]], up: [m[4], m[5], m[6]], fwd: [-m[8], -m[9], -m[10]] };
  const eye = camera.position;
  const sel = selectAtScreen({ x, y, w, h, fovDeg: camera.fov || 70, eye: [eye.x, eye.y, eye.z], basis, candidates: cands, blocked: opts.colliders ? blockedBy(opts.colliders, eye) : null, opts: { reach } });
  return sel ? { object: sel.cand.obj, ...sel.cand.obj.userData.interact, distance: sel.dist, via: sel.via } : null;
}

// the standard look of outdoor edges (the colliders are the plan's walls; this only draws): trees = a row of cedars outside the edge,
// hedge = a clipped hedge on the line, fence = posts and two rails, stone = a low stone wall, none = nothing (the game dresses world.edges)
const EDGE_MATS = {};
const edgeMat = (k, c) => (EDGE_MATS[k] ||= new THREE.MeshStandardMaterial({ color: c, roughness: 0.95 }));
export function dressEdges(group, edges, colliders = []) {
  const trees = [];
  for (const e of edges) {
    const [x0, z0] = e.from, [x1, z1] = e.to, len = Math.hypot(x1 - x0, z1 - z0), alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, y = e.y || 0;
    const out = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] }[e.edge];
    const add = (w, h, d, mt, px, py, pz) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mt); b.position.set(px, py, pz); b.castShadow = true; b.receiveShadow = true; b.name = `edge:${e.room}:${e.edge}`; group.add(b); return b; };
    if (e.look === 'hedge') add(alongX ? len : 0.8, 1.8, alongX ? 0.8 : len, edgeMat('hedge', 0x2c4428), cx, y + 0.9, cz);
    else if (e.look === 'stone') add(alongX ? len : 0.6, 1.1, alongX ? 0.6 : len, edgeMat('stone', 0x6f7368), cx, y + 0.55, cz);
    else if (e.look === 'fence') {
      const n = Math.max(1, Math.round(len / 2));
      for (let i = 0; i <= n; i++) { const t = i / n; add(0.1, 1.1, 0.1, edgeMat('post', 0x4a3a2a), x0 + (x1 - x0) * t, y + 0.55, z0 + (z1 - z0) * t); }
      for (const hy of [0.45, 0.95]) add(alongX ? len : 0.05, 0.06, alongX ? 0.05 : len, edgeMat('post', 0x4a3a2a), cx, y + hy, cz);
    } else if (e.look === 'trees') {
      const n = Math.max(1, Math.round(len / 2.4));
      for (let i = 0; i < n; i++) { const t = (i + 0.5) / n, k = ((i * 7919 + Math.round(cx * 13 + cz * 7)) % 100) / 100; trees.push([x0 + (x1 - x0) * t + out[0] * (1.3 + k), y, z0 + (z1 - z0) * t + out[1] * (1.3 + k), 0.8 + k * 0.5]); }
    }
  }
  if (trees.length) {
    const trunk = new THREE.CylinderGeometry(0.12, 0.2, 1, 6); trunk.translate(0, 0.5, 0);
    const crown = new THREE.ConeGeometry(1.4, 4.6, 7); crown.translate(0, 4.2, 0);
    const tm = new THREE.InstancedMesh(trunk, edgeMat('bark', 0x3a2f26), trees.length), cm = new THREE.InstancedMesh(crown, edgeMat('cedar', 0x1f3326), trees.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
    trees.forEach(([x, y, z, s], i) => { m4.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(s, s * 2.4, s)); tm.setMatrixAt(i, m4); m4.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(s, s, s)); cm.setMatrixAt(i, m4); });
    tm.name = 'edge:trees'; cm.name = 'edge:trees'; tm.castShadow = cm.castShadow = true; group.add(tm, cm);
  }
  void colliders;
  return trees.length;
}
