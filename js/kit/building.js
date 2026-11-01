/* game-kit 6e0b6f0: js/building.js — edit in game-kit and run tools/kit-sync.js */
// Buildings and trees of the standard (2026-11-01). The games built houses and roofs by hand (roof x15, house, hut, tree in
// hasshaku, kotoribako, jashi, heiengo, arakawa, whitepigeon, miru-fusha, yakkyoku), and the same faults came back:
//   - a roof slab tilted into place dips its own thickness below the wall top at the wall line: tiles show INSIDE the rooms
//   - two tilted slabs cross at the ridge and stick out; the triangle between the wall top and the roof stays open
//   - the roof texture is stretched over one slab (one repeat for 9 m of tiles)
//   - cedar boughs reach 3-4 m but trunks keep 1.4 m from a wall: the boughs go through the walls into the rooms (jashi 4.3)
// Here the geometry guarantees it:
//   roof(o)    a solid roof whose underside is exactly at the wall top on the wall line and rises inside (nothing below the wall
//              top inside the walls: roofClearance() proves it), the gable ends closed, metric UVs (1 unit = 1 m: the texture's
//              own repeat), eaves outside the walls only
//   house(o)   floor, walls with door / window openings, a ceiling at the wall top (the roof underside is never seen from inside),
//              the roof; userData.colliders (walls), userData.openings (where env-props door() goes), userData.rooms footprint
//   tree(o)    cedar / pine / broadleaf / bare; o.keepOut rectangles (local): no bough reaches into them
//   forest(o)  many trees instanced, kept off rectangles (houses, roads) with the bough reach taken into account
// Origins: a house at its floor centre (front = +z), a roof at the centre of the wall-top rectangle (y = 0 = the wall top), a tree
// at the foot of the trunk. Materials: pass your own (TextureLibrary.material(id) from the catalog: roof/*, wood/*, plaster/*);
// without them plain materials are used (Node tests run without a canvas).
import * as THREE from 'three';

const plain = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...o });
const DEF = { wall: 0x8a8070, roof: 0x3a3f40, under: 0x4a4034, floor: 0x6a5a48, ceiling: 0x7a7060, trim: 0x3a2c20 };
const mat = (m, key) => (m && m[key]) || plain(DEF[key]);

// ------------------------------------------------------------------------------------- roof
// o: { w (along the ridge, x), d (the span, z), type: 'gable' | 'shed' | 'flat', pitch (rad, 0.5 = 27 deg), overhang (eaves, 0.45),
//      gableOverhang (past the gable ends, 0.3), thick (0.12), ridgeCap: true, mats: { roof, under, wall } }
// shed: the low side at +z. Returns a Group; userData.rise = the ridge height above the wall top, userData.underAt(z) = the underside.
export function roof(o = {}) {
  const w = o.w ?? 6, d = o.d ?? 5, type = o.type || 'gable', pitch = o.pitch ?? 0.5, oh = o.overhang ?? 0.45, go = o.gableOverhang ?? 0.3, th = o.thick ?? 0.12;
  const t = Math.tan(type === 'flat' ? 0 : pitch), thv = th / Math.cos(type === 'flat' ? 0 : pitch), hs = d / 2, L = w + 2 * go, g = new THREE.Group();
  const M = o.mats || {}, top = mat(M, 'roof'), wallM = mat(M, 'wall');
  let prof, underAt, fill;
  if (type === 'flat') {
    prof = [[-(hs + oh), 0], [hs + oh, 0], [hs + oh, th], [-(hs + oh), th]];
    underAt = () => 0; fill = null;
  } else if (type === 'shed') {
    // underside 0 at z = +hs (the low wall), rising to 2*hs*t at z = -hs (the high wall)
    const u = (z) => (hs - z) * t;
    prof = [[hs + oh, u(hs + oh)], [hs + oh, u(hs + oh) + thv], [-(hs + oh), u(-(hs + oh)) + thv], [-(hs + oh), u(-(hs + oh))]];
    underAt = (z) => u(Math.max(-hs, Math.min(hs, z)));
    fill = [[-hs, 0], [hs, 0], [-hs, 2 * hs * t]];   // the end walls (and the high wall above the wall top)
  } else {
    const u = (z) => (hs - Math.abs(z)) * t;
    prof = [[-(hs + oh), u(hs + oh)], [0, u(0)], [hs + oh, u(hs + oh)], [hs + oh, u(hs + oh) + thv], [0, u(0) + thv], [-(hs + oh), u(hs + oh) + thv]];
    underAt = (z) => u(Math.max(-hs, Math.min(hs, z)));
    fill = [[-hs, 0], [hs, 0], [0, hs * t]];
  }
  // the slab: the profile (z, y) extruded along x. Shape X = z, extrude Z -> rotateY(+90deg) maps Z to x and X to -z (the profile is
  // mirrored, so build it mirrored)
  const shape = new THREE.Shape(prof.map(([z, y]) => new THREE.Vector2(-z, y)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: L, bevelEnabled: false });
  geo.rotateY(Math.PI / 2); geo.translate(-L / 2, 0, 0);
  const slab = new THREE.Mesh(geo, top); slab.name = 'roof'; slab.castShadow = slab.receiveShadow = true; g.add(slab);
  // the gable ends (and a shed's high wall) between the wall top and the underside, in the wall material, flush with the outer wall face
  if (fill) {
    const ft = o.wallT ?? 0.12;
    const fs = new THREE.Shape(fill.map(([z, y]) => new THREE.Vector2(-z, y)));
    for (const sx of [-1, 1]) {
      const fg = new THREE.ExtrudeGeometry(fs, { depth: ft, bevelEnabled: false }); fg.rotateY(Math.PI / 2);
      const m = new THREE.Mesh(fg, wallM); m.position.x = sx > 0 ? w / 2 - ft : -w / 2; m.name = 'gable'; m.castShadow = true; g.add(m);
    }
    if (type === 'shed') { const hw = new THREE.Mesh(new THREE.BoxGeometry(w, 2 * hs * t, ft), wallM); hw.position.set(0, hs * t, -hs + ft / 2); hw.name = 'gable'; g.add(hw); }
  }
  if (type === 'gable' && (o.ridgeCap ?? true)) {
    const cap = new THREE.Mesh(new THREE.BoxGeometry(L + 0.04, 0.12, 0.26), M.ridge || top);
    cap.position.y = hs * t + thv + 0.02; cap.name = 'ridge'; g.add(cap);
  }
  g.userData.rise = type === 'flat' ? th : type === 'shed' ? 2 * hs * t + thv : hs * t + thv;
  g.userData.underAt = underAt;
  g.userData.footprint = { w, d };
  return g;
}

// proof: the lowest point of the roof (slab and ridge) over the wall rectangle, inset by `inset`, from rays cast up from below on a
// grid (the real surfaces, not only the vertices: a tilted slab dips between its corners). ok = nothing below the wall top (0).
export function roofClearance(r, inset = 0.02, step = 0.2) {
  const { w, d } = r.userData.footprint; let low = Infinity;
  r.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(r.matrixWorld).invert(), meshes = [];
  r.traverse((m) => { if (m.isMesh && (m.name === 'roof' || m.name === 'ridge')) { const c = new THREE.Mesh(m.geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })); c.matrixWorld.multiplyMatrices(inv, m.matrixWorld); c.matrixAutoUpdate = false; meshes.push(c); } });
  const ray = new THREE.Raycaster(), up = new THREE.Vector3(0, 1, 0);
  for (let x = -w / 2 + inset; x <= w / 2 - inset + 1e-9; x += step) for (let z = -d / 2 + inset; z <= d / 2 - inset + 1e-9; z += step) {
    ray.set(new THREE.Vector3(x, -50, z), up);
    for (const m of meshes) { const h = ray.intersectObject(m, false)[0]; if (h) low = Math.min(low, h.point.y); }
  }
  return { low: low === Infinity ? null : low, ok: low === Infinity || low >= -1e-4 };
}

// ------------------------------------------------------------------------------------- house
// o: { w, d, wallH (2.6), wallT (0.12), floorH (0.03: the floor top above the ground), roof: { ...roof() options } | false, ceiling: true, floor: true,
//      doors: [{ side: 's'|'n'|'e'|'w', at: 0 (offset along the wall from its centre), w: 0.9, h: 2.05 }],
//      windows: [{ side, at, w: 1.2, h: 0.9, sill: 0.9 }], mats: { wall, wallIn, roof, under, floor, ceiling, trim } }
// s = +z (the front), n = -z, e = +x, w = -x. The walls stand inside the footprint (outer faces on it).
export function house(o = {}) {
  const w = o.w ?? 6, d = o.d ?? 5, H = o.wallH ?? 2.6, T = o.wallT ?? 0.12, M = o.mats || {}, g = new THREE.Group();
  const wallM = mat(M, 'wall'), wallIn = M.wallIn || wallM, cols = [], openings = [];
  const add = (geo, m, x, y, z, name) => { const me = new THREE.Mesh(geo, m); me.position.set(x, y, z); me.name = name; me.castShadow = me.receiveShadow = true; g.add(me); return me; };
  // one wall: solid pieces between the openings (doors from the floor, windows from the sill)
  const sides = { s: { len: w, at: (u) => [u, d / 2 - T / 2], rot: 0 }, n: { len: w, at: (u) => [u, -d / 2 + T / 2], rot: 0 }, e: { len: d - 2 * T, at: (u) => [w / 2 - T / 2, u], rot: 1 }, w: { len: d - 2 * T, at: (u) => [-w / 2 + T / 2, u], rot: 1 } };
  for (const [k, S] of Object.entries(sides)) {
    const holes = [...(o.doors || []).filter((x) => x.side === k).map((x) => ({ ...x, w: x.w ?? 0.9, y0: 0, y1: x.h ?? 2.05, door: true })), ...(o.windows || []).filter((x) => x.side === k).map((x) => ({ ...x, w: x.w ?? 1.2, y0: x.sill ?? 0.9, y1: (x.sill ?? 0.9) + (x.h ?? 0.9) }))]
      .map((x) => ({ ...x, u0: (x.at ?? 0) - x.w / 2, u1: (x.at ?? 0) + x.w / 2 })).sort((a, b) => a.u0 - b.u0);
    const piece = (u0, u1, y0, y1) => {
      if (u1 - u0 < 0.005 || y1 - y0 < 0.005) return;
      const [x, z] = S.at((u0 + u1) / 2), sx = S.rot ? T : u1 - u0, sz = S.rot ? u1 - u0 : T;
      add(new THREE.BoxGeometry(sx, y1 - y0, sz), [wallM, wallM, wallM, wallM, wallM, wallM], x, (y0 + y1) / 2, z, `wall:${k}`);
      cols.push(new THREE.Box3(new THREE.Vector3(x - sx / 2, y0, z - sz / 2), new THREE.Vector3(x + sx / 2, y1, z + sz / 2)));
    };
    let u = -S.len / 2;
    for (const h of holes) {
      piece(u, h.u0, 0, H);                  // the solid wall before the opening
      piece(h.u0, h.u1, h.y1, H);            // above it
      if (h.y0 > 0) piece(h.u0, h.u1, 0, h.y0);   // under a window
      const [x, z] = S.at((h.u0 + h.u1) / 2);
      openings.push({ side: k, kind: h.door ? 'door' : 'window', x, z, w: h.w, y0: h.y0, y1: h.y1, ry: S.rot ? Math.PI / 2 : 0 });
      u = h.u1;
    }
    piece(u, S.len / 2, 0, H);
  }
  // the floor top is floorH above the ground the house stands on (never level with it: the ground would flicker through)
  const FH = o.floorH ?? 0.03;
  if (o.floor ?? true) { const f = add(new THREE.BoxGeometry(w - 2 * T, 0.06, d - 2 * T), mat(M, 'floor'), 0, FH - 0.03, 0, 'floor'); f.castShadow = false; }
  // the ceiling at the wall top: from inside, the roof underside is never seen (and nothing of the roof can come through it)
  if (o.ceiling ?? true) { const c = add(new THREE.BoxGeometry(w - 2 * T, 0.03, d - 2 * T), mat(M, 'ceiling'), 0, H - 0.015, 0, 'ceiling'); c.castShadow = false; }
  if (o.roof !== false) {
    const r = roof({ w, d, wallT: T, ...(o.roof || {}), mats: { roof: M.roof, under: M.under, wall: wallM, ridge: M.ridge } });
    r.position.y = H; r.name = 'roof-group'; g.add(r); g.userData.roof = r;
  }
  // doors: [{ side, at, w, leaf: 'fusuma' | 'shoji' | 'glass' | 'wood' }] fill the opening with a slidingDoor (userData.doorObjs; its
  // colliders join the house's); a door without `leaf` is left open for env-props door() or the game's own
  const doorObjs = [];
  for (const op of openings) {
    const d = (o.doors || []).find((x) => x.side === op.side && x.leaf && Math.abs((x.at ?? 0) - (op.side === 'e' || op.side === 'w' ? op.z : op.x)) < 1e-6);
    if (op.kind !== 'door' || !d) continue;
    const sd = slidingDoor({ w: op.w, h: op.y1, kind: d.leaf, wall: T, mats: M.door });
    sd.position.set(op.x, FH, op.z); sd.rotation.y = op.ry; sd.name = `door:${op.side}`; g.add(sd); sd.updateMatrix();
    for (const b of sd.userData.colliders) { const c = b.clone().applyMatrix4(sd.matrix); c.tag = b.tag; cols.push(c); }
    doorObjs.push(sd);
  }
  g.userData.doorObjs = doorObjs;
  g.userData.colliders = cols;
  g.userData.openings = openings;
  g.userData.kind = 'house';
  g.userData.footprint = { w, d, wallH: H, wallT: T, floorH: FH };
  void wallIn;
  return g;
}

// ------------------------------------------------------------------------------------- sliding doors and gates
// The games' own doors were mostly Japanese ones the kit did not have (fusuma, shoji, the genkan's glass doors, amado, a gate:
// 43 door builders, 10 gates in the 2026-11 survey). Both open with js/openables.js (userData.drawers) or setSlidingOpen / the gate's
// hinge angle, and keep the moving leaf out of merging (userData.keep).
//   slidingDoor(o)  o: { w (the opening, 1.8), h (1.8), kind: 'fusuma' | 'shoji' | 'glass' | 'wood' (amado), leaves (2), wall (0.12),
//                   mats: { leaf, frame, paper } }. Origin at the floor centre of the opening, the wall along x (as env-props door()).
//                   Leaf 0 slides behind leaf 1 (to +x). userData.drawers = [{ obj, kind: 'slide', travel, axis: 'x' }],
//                   userData.colliders: the leaves (tag 'door': off while open, setSlidingOpen does it) and the jambs.
export const SLIDING_KINDS = { fusuma: '襖（紙張り、引手）', shoji: '障子（格子と和紙）', glass: '玄関の格子ガラス戸', wood: '雨戸・板戸' };
const boxIn = (G, sx, sy, sz, m, x, y, z, name) => { const me = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m); me.position.set(x, y, z); me.name = name || ''; me.castShadow = me.receiveShadow = true; G.add(me); return me; };
export function slidingDoor(o = {}) {
  const w = o.w ?? 1.8, h = o.h ?? 1.8, wall = o.wall ?? 0.12, kind = o.kind || 'fusuma', n = Math.max(1, o.leaves ?? 2), M = o.mats || {}, g = new THREE.Group();
  const frameM = M.frame || plain(0x5a4630), leafM = M.leaf || plain(kind === 'fusuma' ? 0xd8cfb8 : kind === 'wood' ? 0x6a5640 : 0x7a6248);
  const paperM = M.paper || plain(kind === 'glass' ? 0xcfdde0 : 0xf2eee2, kind === 'glass' ? { transparent: true, opacity: 0.45, roughness: 0.1 } : { emissive: 0x2a2820 });
  const fw = 0.05;
  boxIn(g, w + 2 * fw, 0.04, wall + 0.02, frameM, 0, 0.02, 0, 'shikii');                    // the sill with its tracks
  boxIn(g, w + 2 * fw, 0.06, wall + 0.02, frameM, 0, h + 0.03, 0, 'kamoi');                 // the lintel
  for (const s of [-1, 1]) boxIn(g, fw, h, wall + 0.02, frameM, s * (w / 2 + fw / 2), h / 2, 0, 'jamb');
  const lw = w / n + 0.02, lt = 0.03, cols = [], drawers = [];
  const jambs = [-1, 1].map((s) => new THREE.Box3(new THREE.Vector3(s < 0 ? -w / 2 - fw : w / 2, 0, -wall / 2), new THREE.Vector3(s < 0 ? -w / 2 : w / 2 + fw, h, wall / 2)));
  for (let i = 0; i < n; i++) {
    const leaf = new THREE.Group(), x0 = -w / 2 + (i + 0.5) * (w / n), z = (i % 2 ? -1 : 1) * (lt / 2 + 0.004);   // two tracks
    leaf.position.set(x0, 0.04, z); leaf.name = `leaf:${i}`; leaf.userData.keep = true;
    const lh = h - 0.04, st = kind === 'fusuma' ? 0.025 : 0.035;
    if (kind === 'fusuma' || kind === 'wood') boxIn(leaf, lw, lh, lt, leafM, 0, lh / 2, 0, 'panel');
    else boxIn(leaf, lw - 2 * st, lh - 2 * st, 0.006, paperM, 0, lh / 2, 0, 'paper');
    // the frame of the leaf (fusuma: a thin edge; shoji / glass: stiles, rails and the lattice)
    for (const s of [-1, 1]) boxIn(leaf, st, lh, lt + 0.004, frameM, s * (lw / 2 - st / 2), lh / 2, 0, 'stile');
    for (const y of [st / 2, lh - st / 2]) boxIn(leaf, lw, st, lt + 0.004, frameM, 0, y, 0, 'rail');
    if (kind === 'shoji' || kind === 'glass') {
      const cx = kind === 'shoji' ? 3 : 2, cy = kind === 'shoji' ? 6 : 4;
      for (let k = 1; k < cx; k++) boxIn(leaf, 0.012, lh - 2 * st, 0.016, frameM, -lw / 2 + st + (k * (lw - 2 * st)) / cx, lh / 2, 0, 'kumiko');
      for (let k = 1; k < cy; k++) boxIn(leaf, lw - 2 * st, 0.012, 0.016, frameM, 0, st + (k * (lh - 2 * st)) / cy, 0, 'kumiko');
      if (kind === 'glass') boxIn(leaf, lw - 2 * st, lh * 0.3, lt, leafM, 0, st + lh * 0.15, 0, 'kick');   // the wooden lower panel
    }
    if (kind === 'fusuma') for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.006, 16), plain(0x2a2420, { metalness: 0.5 })); p.rotation.x = Math.PI / 2; p.position.set((i ? -1 : 1) * (lw / 2 - 0.09), 0.85, s * (lt / 2 + 0.002)); p.name = 'hikite'; leaf.add(p); }
    g.add(leaf);
    const b = new THREE.Box3(new THREE.Vector3(x0 - lw / 2, 0, z - lt / 2 - 0.01), new THREE.Vector3(x0 + lw / 2, h, z + lt / 2 + 0.01)); b.tag = 'door'; cols.push(b);
    if (i === 0) drawers.push({ obj: leaf, kind: 'slide', travel: (w / n) * 0.96, axis: 'x' });
  }
  g.userData.drawers = drawers;
  g.userData.colliders = [...jambs, ...cols];
  g.userData.kind = 'slidingDoor';
  g.userData.sliding = { leaf: drawers[0].obj, base: drawers[0].obj.position.x, travel: drawers[0].travel, box: cols[0] };
  if (o.open) setSlidingOpen(g, o.open);
  return g;
}
/** 0 = shut, 1 = open: slides leaf 0 and switches its collider off past half open */
export function setSlidingOpen(d, t) {
  const S = d.userData.sliding, k = Math.max(0, Math.min(1, t));
  S.leaf.position.x = S.base + S.travel * k; S.open = k; S.box.off = k > 0.5;
}

//   gate(o)  a wooden gate with a small roof: o: { w (the passage, 2.4), h (2.3), roof: true, mats: { post, leaf, roof } }. Two leaves on
//           hinges at the posts (userData.drawers: kind 'door', angle; both swing toward +z), colliders: posts + the closed leaves
//           (tag 'door'). Origin at the middle of the passage on the ground; the passage runs along z.
export function gate(o = {}) {
  const w = o.w ?? 2.4, h = o.h ?? 2.3, M = o.mats || {}, g = new THREE.Group(), P = 0.18;
  const postM = M.post || plain(0x4a3a2a), leafM = M.leaf || plain(0x5a4632);
  for (const s of [-1, 1]) boxIn(g, P, h + 0.4, P, postM, s * (w / 2 + P / 2), (h + 0.4) / 2, 0, 'post');
  boxIn(g, w + 2 * P + 0.5, 0.16, 0.16, postM, 0, h + 0.3, 0, 'kasagi');
  boxIn(g, w + 2 * P, 0.12, 0.12, postM, 0, h, 0, 'nuki');
  if (o.roof !== false) { const r = roof({ w: w + 2 * P + 0.3, d: 0.7, type: 'gable', pitch: 0.55, overhang: 0.25, gableOverhang: 0.2, thick: 0.08, mats: { roof: M.roof, wall: postM } }); r.position.y = h + 0.38; r.name = 'gate-roof'; g.add(r); }
  const lw = w / 2 - 0.01, lh = h - 0.12, drawers = [], cols = [];
  for (const s of [-1, 1]) {
    const hinge = new THREE.Group(); hinge.position.set(s * w / 2, 0.06, 0); hinge.name = `gateHinge:${s < 0 ? 'l' : 'r'}`; hinge.userData.keep = true;
    const cx = -s * lw / 2;
    for (const k of [-1, 1]) boxIn(hinge, 0.07, lh, 0.06, leafM, cx + k * (lw / 2 - 0.035), lh / 2, 0, 'stile');
    for (const y of [0.1, lh * 0.55, lh - 0.05]) boxIn(hinge, lw, 0.08, 0.06, leafM, cx, y, 0, 'rail');
    for (let k = 0; k < 7; k++) boxIn(hinge, 0.012 + lw / 8, lh * 0.5, 0.025, leafM, cx - lw / 2 + (k + 0.5) * (lw / 7), lh * 0.3, 0, 'board');   // boards below, a lattice above
    for (let k = 1; k < 6; k++) boxIn(hinge, 0.03, lh * 0.4, 0.03, leafM, cx - lw / 2 + (k * lw) / 6, lh * 0.77, 0, 'bar');
    g.add(hinge);
    drawers.push({ obj: hinge, kind: 'door', angle: s * 1.5 });   // both swing toward +z
    const b = new THREE.Box3(new THREE.Vector3(Math.min(0, s * w / 2), 0, -0.05), new THREE.Vector3(Math.max(0, s * w / 2), h, 0.05)); b.tag = 'door'; cols.push(b);
  }
  g.userData.drawers = drawers;
  g.userData.colliders = [...[-1, 1].map((s) => new THREE.Box3(new THREE.Vector3(s * (w / 2 + P / 2) - P / 2, 0, -P / 2), new THREE.Vector3(s * (w / 2 + P / 2) + P / 2, h + 0.4, P / 2))), ...cols];
  g.userData.kind = 'gate';
  return g;
}

// ------------------------------------------------------------------------------------- trees
// deterministic small random (a tree's look depends on its seed only)
const rng = (seed) => { let s = (seed >>> 0) || 1; return () => ((s = Math.imul(s ^ (s >>> 15), 2246822519) ^ Math.imul(s ^ (s >>> 13), 3266489917)) >>> 0) / 4294967296; };
let NEEDLES = null;
function needleTexture() {
  if (NEEDLES || typeof document === 'undefined') return NEEDLES;
  const c = document.createElement('canvas'); c.width = 128; c.height = 64; const x = c.getContext('2d');
  x.strokeStyle = '#3c5236'; x.lineWidth = 3; x.beginPath(); x.moveTo(0, 32); x.lineTo(124, 30); x.stroke();
  for (let i = 0; i < 70; i++) { const u = 6 + i * 1.7, l = 26 * (1 - u / 140); x.strokeStyle = i % 3 ? '#2f4a2c' : '#41603a'; x.lineWidth = 1.6; x.beginPath(); x.moveTo(u, 31); x.lineTo(u + 6, 31 - l); x.moveTo(u, 31); x.lineTo(u + 6, 31 + l); x.stroke(); }
  NEEDLES = new THREE.CanvasTexture(c); NEEDLES.colorSpace = THREE.SRGBColorSpace; return NEEDLES;
}
export const TREE_KINDS = { cedar: '杉（円錐、段の枝）', pine: '松（上に平たい枝葉）', broadleaf: '広葉樹（丸い樹冠）', bare: '枯れ木' };
// the farthest a bough of this tree reaches from the trunk (forest() keeps trees this far from keep-out rectangles, or trims them)
export const treeReach = (o = {}) => { const h = o.h ?? 12, k = o.kind || 'cedar'; return k === 'cedar' ? Math.min(4, 0.3 * h) : k === 'pine' ? 0.32 * h : k === 'broadleaf' ? 0.28 * h : 0.2 * h; };
const inRects = (x, z, rects) => (rects || []).some((r) => x > r.minX && x < r.maxX && z > r.minZ && z < r.maxZ);

// o: { kind, h (12), r (trunk radius, 0.25), seed, keepOut: [{ minX, maxX, minZ, maxZ }] (local to the trunk foot), mats: { bark, bough, leaves } }
export function tree(o = {}) {
  const kind = o.kind || 'cedar', h = o.h ?? 12, r = o.r ?? 0.25, R = rng(o.seed ?? 1), M = o.mats || {}, g = new THREE.Group();
  const bark = M.bark || plain(0x5a4a3a, { roughness: 1 });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.4, r, h, 8), bark); trunk.position.y = h / 2; trunk.name = 'trunk'; trunk.castShadow = true; g.add(trunk);
  const bough = M.bough || plain(0x35502f, { map: needleTexture(), alphaTest: needleTexture() ? 0.35 : 0, side: THREE.DoubleSide, roughness: 1 });
  const leaves = M.leaves || plain(0x3f5a32, { roughness: 1, flatShading: true });
  // a bough is a len x (len * 0.55) plane along its direction: test its centre line and both long edges
  const reachOk = (a, len, y) => {
    if (y >= (o.keepOutTop ?? 99)) return true;
    const c = Math.cos(a), s = Math.sin(a), half = len * 0.3;
    for (let k = 0; k <= 6; k++) for (const e of [-half, 0, half]) { const u = (len * k) / 6; if (inRects(c * u - s * e, s * u + c * e, o.keepOut)) return false; }
    return true;
  };
  if (kind === 'cedar' || kind === 'pine') {
    const tiers = kind === 'cedar' ? 8 : 3, per = kind === 'cedar' ? 5 : 6;
    for (let i = 0; i < tiers; i++) for (let j = 0; j < per; j++) {
      const f = kind === 'cedar' ? i / tiers : 0.8 + (i / tiers) * 0.2, y = h * (kind === 'cedar' ? 0.3 + f * 0.66 : f), a = (j / per) * Math.PI * 2 + i * 0.7 + R() * 0.4;
      const len = (kind === 'cedar' ? treeReach(o) * (1 - f * 0.8) : treeReach(o) * (0.6 + R() * 0.4)) * (0.85 + R() * 0.15);
      if (!reachOk(a, len, y)) continue;
      // a horizontal plane reaching along +x, drooped (Rz) then turned to its direction a (Ry): order YXZ applies Rz first
      const p = new THREE.Mesh(new THREE.PlaneGeometry(len, len * 0.55).translate(len / 2, 0, 0).rotateX(-Math.PI / 2), bough);
      p.position.y = y; p.rotation.order = 'YXZ'; p.rotation.set(0, -a, kind === 'cedar' ? -0.28 : -0.06);
      p.name = 'bough'; p.castShadow = true; g.add(p);
    }
  } else if (kind === 'broadleaf') {
    const cr = treeReach(o);
    for (let i = 0; i < 7; i++) {
      const a = R() * Math.PI * 2, d = R() * cr * 0.55, s = cr * (0.45 + R() * 0.3), x = Math.cos(a) * d, z = Math.sin(a) * d, y = h * 0.62 + R() * h * 0.25;
      if ((o.keepOut || []).some((r) => Math.hypot(Math.max(r.minX - x, 0, x - r.maxX), Math.max(r.minZ - z, 0, z - r.maxZ)) < s * 1.02)) continue;
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 1), leaves); b.position.set(x, y, z); b.scale.y = 0.8; b.name = 'crown'; b.castShadow = true; g.add(b);
    }
  } else {
    for (let i = 0; i < 6; i++) {
      const a = R() * Math.PI * 2, y = h * (0.45 + R() * 0.45), len = treeReach(o) * (0.5 + R() * 0.5);
      if (!reachOk(a, len, y)) continue;
      const br = new THREE.Mesh(new THREE.CylinderGeometry(0.02, r * 0.3, len, 5).translate(0, len / 2, 0), bark);
      br.position.y = y; br.rotation.order = 'YXZ'; br.rotation.set(0, -a, -(Math.PI / 2 - (0.4 + R() * 0.4))); br.name = 'branch'; g.add(br);
    }
  }
  g.userData.colliders = [new THREE.Box3(new THREE.Vector3(-r, 0, -r), new THREE.Vector3(r, h, r))];
  g.userData.kind = 'tree';
  return g;
}

// many trees. o: { area: { minX, maxX, minZ, maxZ }, n, seed, kind | kinds: [..], h: [min, max], keepOut: [rects] (houses, roads, paths:
// no trunk inside a rect grown by `gap`, and no bough reaches into one), gap (0.6), spacing (1.7), mats }
// Trees whose reach touches a keep-out rect are built one by one with their boughs trimmed; the rest are instanced (3 variants a kind).
// Returns a Group; userData.colliders = trunks (world), userData.trees = [{ x, z, h, kind }].
export function forest(o = {}) {
  const A = o.area || { minX: -20, maxX: 20, minZ: -20, maxZ: 20 }, R = rng(o.seed ?? 7), kinds = o.kinds || [o.kind || 'cedar'], [h0, h1] = o.h || [9, 16];
  const gap = o.gap ?? 0.6, rects = (o.keepOut || []).map((r) => ({ minX: r.minX - gap, maxX: r.maxX + gap, minZ: r.minZ - gap, maxZ: r.maxZ + gap })), out = new THREE.Group(), trees = [];
  for (let tries = 0; trees.length < (o.n ?? 60) && tries < (o.n ?? 60) * 30; tries++) {
    const x = A.minX + R() * (A.maxX - A.minX), z = A.minZ + R() * (A.maxZ - A.minZ), kind = kinds[Math.floor(R() * kinds.length)], h = h0 + R() * (h1 - h0);
    if (inRects(x, z, rects) || trees.some((t) => Math.hypot(t.x - x, t.z - z) < (o.spacing ?? 1.7))) continue;
    trees.push({ x, z, h, kind, v: Math.floor(R() * 3), ry: R() * Math.PI * 2 });
  }
  const near = (t) => rects.some((r) => x2(t, r) < treeReach(t));
  const x2 = (t, r) => Math.hypot(Math.max(r.minX - t.x, 0, t.x - r.maxX), Math.max(r.minZ - t.z, 0, t.z - r.maxZ));
  const groups = new Map();
  for (const t of trees) {
    if (near(t)) {
      // trimmed one by one: the keep-out rects in the tree's own (rotated) frame
      const c = Math.cos(t.ry), s = Math.sin(t.ry);   // world -> the tree frame: Ry(-ry)
      const local = rects.map((r) => { const pts = [[r.minX, r.minZ], [r.maxX, r.minZ], [r.minX, r.maxZ], [r.maxX, r.maxZ]].map(([x, z]) => [(x - t.x) * c - (z - t.z) * s, (x - t.x) * s + (z - t.z) * c]); return { minX: Math.min(...pts.map((p) => p[0])), maxX: Math.max(...pts.map((p) => p[0])), minZ: Math.min(...pts.map((p) => p[1])), maxZ: Math.max(...pts.map((p) => p[1])) }; });
      const one = tree({ kind: t.kind, h: t.h, seed: 100 + t.v, keepOut: local, mats: o.mats }); one.position.set(t.x, 0, t.z); one.rotation.y = t.ry; out.add(one);
    } else { const k = `${t.kind}:${t.v}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(t); }
  }
  for (const [k, list] of groups) {
    const [kind, v] = k.split(':'), proto = tree({ kind, h: 12, seed: 100 + Number(v), mats: o.mats });
    proto.updateMatrixWorld(true);   // the parts' own matrices (never rendered yet: still identity otherwise, the boughs lay on the ground)
    for (const m of proto.children) {
      const im = new THREE.InstancedMesh(m.geometry.clone().applyMatrix4(m.matrix), m.material, list.length);
      list.forEach((t, i) => im.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(t.x, 0, t.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.ry), new THREE.Vector3(1, t.h / 12, 1))));
      im.instanceMatrix.needsUpdate = true; im.castShadow = true; im.computeBoundingSphere(); im.name = `forest:${k}:${m.name}`; out.add(im);
    }
  }
  out.userData.trees = trees.map(({ x, z, h, kind }) => ({ x, z, h, kind }));
  out.userData.colliders = trees.map((t) => new THREE.Box3(new THREE.Vector3(t.x - 0.3, 0, t.z - 0.3), new THREE.Vector3(t.x + 0.3, t.h, t.z + 0.3)));
  return out;
}
