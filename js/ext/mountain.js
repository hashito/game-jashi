// The mountain of 邪視, dressed on top of the standard world (world-from-plan builds the rooms, hidden outdoor walls, doors, stations
// and pickups from data/plan.json). This module adds the looks and the few colliders the plan does not have:
//   - the ground, the cedar forest kept a bough's reach off every walkable rectangle (W3), mountains in the fog, the trails
//     going on past the playable area into the fog (W4: south past a fallen tree, west past the parking lot)
//   - the villa: the outside of its walls (W1, outer-walls), the band between the two floors, the roof, the balcony with a
//     railing and the telescope, the amado that really slides across the balcony door (W5), the radio desk and the note table
//   - the shed and the evacuation hut roofs; timber stacks, the plank screen and the creek boulders (granite, W2) as cover
//   - the creek and the bridge with its red string, the forestry bell on its frame, the gate (bar down / up) with its crank box (G1),
//     the uncle's car with the driver's door open, the cabin light and a mark on the ground once the gate is up (G2)
//   - the uncle (standard character), the bottles on the shed shelf, the crank on the hut floor, the phone in the mud
//   - the wall notices and photos (docs with a "wall" field) as frames on their walls
// Names shown / hidden per stage by data/stages.json "show": uncle, gate_bar_down, gate_bar_up, car_cue, bottles_shelf, crank_floor, phone_mud.
import * as THREE from 'three';
import * as E from '../kit/env-props.js';
import * as P from '../kit/props.js';
import { roof, tree, treeReach } from '../kit/building.js';
import { makeCharacter } from '../kit/character.js';
import { dressOuterWalls } from '../kit/outer-walls.js';
import { TextureLibrary } from '../kit/texture-library.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.92, ...o });
const loader = new THREE.TextureLoader();
function own(file, repeat = [1, 1]) {
  const t = loader.load(`assets/textures/${file}`, undefined, undefined, () => {});
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); t.anisotropy = 4; return t;
}
// the parts of a tree prototype merged into one geometry per material (two draw calls a tree class instead of forty)
function mergedParts(group) {
  group.updateMatrixWorld(true);
  const byMat = new Map();
  group.traverse((m) => { if (!m.isMesh) return; const g = m.geometry.clone().applyMatrix4(m.matrixWorld); const ng = g.index ? g.toNonIndexed() : g; if (!byMat.has(m.material)) byMat.set(m.material, []); byMat.get(m.material).push(ng); });
  return [...byMat].map(([material, list]) => {
    const out = new THREE.BufferGeometry();
    for (const name of ['position', 'normal', 'uv']) {
      if (!list.every((g) => g.attributes[name])) continue;
      const n = list[0].attributes[name].itemSize, arr = new Float32Array(list.reduce((s, g) => s + g.attributes[name].array.length, 0));
      let o = 0; for (const g of list) { arr.set(g.attributes[name].array, o); o += g.attributes[name].array.length; }
      out.setAttribute(name, new THREE.BufferAttribute(arr, n));
    }
    out.computeBoundingSphere(); return { geometry: out, material };
  });
}

export function dressMountain(ctx) {
  const { world } = ctx, plan = ctx.data.plan;
  const G = new THREE.Group(); G.name = 'mountain'; world.group.add(G);
  const api = { group: G, parts: {}, occluders: [], people: {} };
  const colliders = world.colliders;
  const addCol = (x0, z0, x1, z1, y0 = 0, y1 = 2.4) => { const c = { box: new THREE.Box3(V3(Math.min(x0, x1), y0, Math.min(z0, z1)), V3(Math.max(x0, x1), y1, Math.max(z0, z1))), off: false }; colliders.push(c); api.occluders.push(c.box); return c; };
  const box = (w, h, d, m, x, y, z, parent = G) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = true; b.receiveShadow = true; parent.add(b); return b; };
  const cyl = (r0, r1, h, m, x, y, z, seg = 10, parent = G) => { const c = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg), m); c.position.set(x, y, z); c.castShadow = true; parent.add(c); return c; };
  // furniture is solid and has a top the standard seats pickups on (game-core seatPickups reads world.colliders)
  const solid = (obj) => { obj.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(obj); colliders.push({ box: b, off: false }); return obj; };
  const named = (name, parent = G) => { const g = new THREE.Group(); g.name = name; parent.add(g); return g; };
  const FY = (f) => (world.floorY ? world.floorY(f) : f * 3.4);

  const M = {
    weathered: mat(0x8d8172, { map: own('weathered-wood-v4-2.webp', [0.5, 0.5]) }),
    plank: mat(0x6b5a48, { map: own('weathered-wood-v4-2.webp', [1, 1]) }),
    roof: mat(0x3b3936, { roughness: 0.75, metalness: 0.25 }), under: mat(0x4a4034),
    granite: mat(0x9a978e, { map: own('granite-rock-v4-2.webp', [1, 1]) }),
    bark: mat(0x7d6a58, { map: own('cedar-bark-v4-2.webp', [1, 3]) }),
    ground: mat(0x6c6a58, { map: own('forest-floor-v4-2.webp', [60, 60]) }),
    soil: mat(0x5c5446, { map: own('forest-floor-v4-2.webp', [1, 12]) }),
    water: new THREE.MeshStandardMaterial({ color: 0x2b3a3b, roughness: 0.12, metalness: 0.25, transparent: true, opacity: 0.86 }),
    iron: mat(0x4c4d4b, { metalness: 0.6, roughness: 0.55 }), rust: mat(0x6b4632, { metalness: 0.4, roughness: 0.8 }),
    red: mat(0xa3322a), yellow: mat(0xc9a43a), white: mat(0xd9d6cc), black: mat(0x1d1d1f, { roughness: 0.5 }),
    brass: mat(0x9a7b45, { metalness: 0.7, roughness: 0.4 }), glass: new THREE.MeshStandardMaterial({ color: 0x9fb4b8, roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.35 }),
    bottle: new THREE.MeshStandardMaterial({ color: 0xb8a66a, roughness: 0.25, transparent: true, opacity: 0.75 }),
    glow: new THREE.MeshBasicMaterial({ color: 0xffe0a0 }), screen: new THREE.MeshBasicMaterial({ color: 0x9fd2ff }),
    cue: new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.35, depthWrite: false }),
    shrub: mat(0x34452e, { flatShading: true }), moss: mat(0x48573a, { flatShading: true }),
  };
  const texReady = TextureLibrary.load('assets/textures/', { renderer: ctx.renderer }).catch(() => null);

  // ---------------------------------------------------------------- ground, mountains, the trails that go on into the fog (W4)
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(320, 320), M.ground); ground.rotation.x = -Math.PI / 2; ground.position.set(0, -0.06, 0); ground.receiveShadow = true; G.add(ground);
  const rnd = (() => { let s = 4302; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); })();
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2 + rnd() * 0.2, r = 120 + rnd() * 30, h = 40 + rnd() * 34; const m = new THREE.Mesh(new THREE.ConeGeometry(36 + rnd() * 16, h, 7), mat(0x2a3330)); m.position.set(Math.cos(a) * r, h / 2 - 3, Math.sin(a) * r); G.add(m); }
  const strips = [   // visual road beyond the plan: [x0, z0, x1, z1, width]
    [4, -30, 4, -120, 3.2], [-34, 20.5, -130, 20.5, 3.6],
  ];
  const keepOut = plan.rooms.map((r) => ({ minX: r.x, maxX: r.x + r.w, minZ: r.z, maxZ: r.z + r.d }));
  for (const [x0, z0, x1, z1, w] of strips) {
    const len = Math.hypot(x1 - x0, z1 - z0), m = new THREE.Mesh(new THREE.PlaneGeometry(w, len), M.soil);
    m.rotation.x = -Math.PI / 2; m.rotation.z = -Math.atan2(x1 - x0, z1 - z0) + Math.PI; m.position.set((x0 + x1) / 2, 0.004, (z0 + z1) / 2); m.receiveShadow = true; G.add(m);
    keepOut.push({ minX: Math.min(x0, x1) - w / 2, maxX: Math.max(x0, x1) + w / 2, minZ: Math.min(z0, z1) - w / 2, maxZ: Math.max(z0, z1) + w / 2 });
  }
  // the fallen tree across the road below (why the uncle cannot come back up, and why the way south is no way down)
  { const t = cyl(0.42, 0.55, 11, M.bark, 4.5, 0.5, -37, 10); t.rotation.z = Math.PI / 2; t.rotation.y = 0.25; addCol(-1.5, -37.8, 10, -36.2, 0, 1.1); }

  // ---------------------------------------------------------------- the forest: no bough reaches a walkable rectangle (W3)
  {
    const dist = (x, z) => Math.min(...keepOut.map((r) => Math.hypot(Math.max(r.minX - x, 0, x - r.maxX), Math.max(r.minZ - z, 0, z - r.maxZ))));
    const classes = [{ h: 12, n: 620, area: 80, sy: [0.75, 1.3] }, { h: 4.5, n: 260, area: 60, sy: [0.7, 1.25] }];
    const trunks = [];
    for (const C of classes) {
      const reach = treeReach({ h: C.h, kind: 'cedar' }) + 0.35, spots = [];
      for (let i = 0; i < C.n * 12 && spots.length < C.n; i++) {
        const x = -C.area + rnd() * C.area * 2 - 2, z = -C.area + rnd() * C.area * 2;
        if (dist(x, z) < reach || spots.some((s) => Math.abs(s[0] - x) < 1.9 && Math.abs(s[1] - z) < 1.9)) continue;
        spots.push([x, z, C.sy[0] + rnd() * (C.sy[1] - C.sy[0]), rnd() * Math.PI * 2]);
      }
      const proto = tree({ kind: 'cedar', h: C.h, seed: 11 + C.h, mats: { bark: M.bark } });
      for (const { geometry, material } of mergedParts(proto)) {
        const im = new THREE.InstancedMesh(geometry, material, spots.length);
        spots.forEach(([x, z, s, ry], i) => im.setMatrixAt(i, new THREE.Matrix4().compose(V3(x, -0.05, z), new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), ry), V3(1, s, 1))));
        im.instanceMatrix.needsUpdate = true; im.castShadow = true; im.computeBoundingSphere(); im.name = `forest:${C.h}`; G.add(im);
      }
      for (const [x, z, s] of spots) if (dist(x, z) < 9) trunks.push(new THREE.Box3(V3(x - 0.3, 0, z - 0.3), V3(x + 0.3, C.h * s, z + 0.3)));
    }
    api.occluders.push(...trunks);
    // undergrowth along the hidden boundary walls: the edge of the walkable ground reads as bushes and moss, not as an invisible wall
    const bush = new THREE.IcosahedronGeometry(0.7, 0), spots = [];
    world.group.traverse((o) => {
      if (!o.isMesh || !/^wall:O_/.test(o.name)) return;
      const b = new THREE.Box3().setFromObject(o), len = Math.max(b.max.x - b.min.x, b.max.z - b.min.z), alongX = b.max.x - b.min.x > b.max.z - b.min.z;
      for (let t = 0.6; t < len; t += 1.3 + rnd()) spots.push([alongX ? b.min.x + t : (b.min.x + b.max.x) / 2, alongX ? (b.min.z + b.max.z) / 2 : b.min.z + t, 0.6 + rnd() * 0.7]);
    });
    const im = new THREE.InstancedMesh(bush, M.shrub, spots.length);
    spots.forEach(([x, z, s], i) => im.setMatrixAt(i, new THREE.Matrix4().compose(V3(x, s * 0.35, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rnd() * 6, 0)), V3(s * 1.2, s * 0.8, s * 1.2))));
    im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); im.name = 'undergrowth'; G.add(im);
  }

  // ---------------------------------------------------------------- the villa, the shed, the hut
  const wallTop = (ids) => { let y = 0; world.group.traverse((o) => { if (o.isMesh && ids.some((id) => o.name.startsWith(`wall:${id}:`))) { const b = new THREE.Box3().setFromObject(o); y = Math.max(y, b.max.y); } }); return y || 3; };
  const roofOn = (x0, z0, x1, z1, y, o = {}) => { const r = roof({ w: x1 - x0, d: z1 - z0, pitch: 0.5, overhang: 0.5, mats: { roof: M.roof, under: M.under, wall: M.weathered }, ...o }); r.position.set((x0 + x1) / 2, y, (z0 + z1) / 2); G.add(r); return r; };
  roofOn(-6, 19, 6, 29, wallTop(['CAB_UP', 'CAB_STORE', 'CAB_ST1']));
  roofOn(-22, -5.5, -17, -1, wallTop(['SHED']), { type: 'shed', pitch: 0.28 });
  roofOn(13, -18, 19, -13, wallTop(['SHELTER']), { pitch: 0.42 });
  // the band between the two floors of the villa (the ground floor's walls stop at 3 m, the upper floor stands at 3.4 m)
  const band = (y0, y1) => { const h = y1 - y0, y = (y0 + y1) / 2; box(12.2, h, 0.2, M.weathered, 0, y, 18.95); box(12.2, h, 0.2, M.weathered, 0, y, 29.05); box(0.2, h, 10.2, M.weathered, -6.05, y, 24); box(0.2, h, 10.2, M.weathered, 6.05, y, 24); };
  band(2.95, FY(1) + 0.05);
  // the balcony: open on three sides (the walls stay as colliders, below a railing), posts under it
  const balcY = FY(1);
  world.group.traverse((o) => { if (o.isMesh && (/^wall:CAB_BALC:[new]/.test(o.name) || o.name === 'ceil:CAB_BALC')) o.visible = false; });
  // no ceiling over the balcony: no pendant either (its light, shade, bulb and cord hang at the room's centre)
  world.group.traverse((o) => { if (Math.abs(o.position.x) < 0.05 && Math.abs(o.position.z - 18) < 0.05 && o.position.y > balcY + 1.5) o.visible = false; });
  for (const [x, z, len, ry] of [[0, 17.02, 6, 0], [-2.98, 18, 2, Math.PI / 2], [2.98, 18, 2, Math.PI / 2]]) { const r = E.railing({ len, h: 1.05, color: 0x4a4038 }); r.position.set(x, balcY, z); r.rotation.y = ry; G.add(r); }
  for (const x of [-2.8, 2.8]) box(0.18, balcY, 0.18, M.plank, x, balcY / 2, 17.2);
  box(6.1, 0.12, 2.1, M.plank, 0, balcY - 0.08, 18);
  // the telescope on its tripod, looking south down the valley
  { const t = named('telescope'); t.position.set(-1.9, balcY, 17.75);
    for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2, l = cyl(0.018, 0.022, 1.3, M.iron, Math.cos(a) * 0.22, 0.62, Math.sin(a) * 0.22, 6, t); l.rotation.set(Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3); }
    const tube = cyl(0.07, 0.055, 0.9, M.white, 0, 1.32, -0.05, 14, t); tube.rotation.x = Math.PI / 2 + 0.12; cyl(0.075, 0.075, 0.05, M.black, 0, 1.27, -0.5, 14, t).rotation.x = Math.PI / 2 + 0.12; }
  // the amado: a wooden leaf beside the balcony door that slides across it when T_SHUTTER is done (W5)
  { const s = named('shutter'); s.position.set(0, balcY, 18.86);   // outside the wall line (z 19), on the balcony side
    const leaf = box(1.7, 2.2, 0.05, M.plank, 0, 1.1, 0, s); for (let i = -2; i <= 2; i++) box(0.03, 2.2, 0.06, M.weathered, i * 0.34, 1.1, 0.01, s);
    box(3.6, 0.08, 0.12, M.weathered, 0.9, 2.26, 0, s); box(3.6, 0.04, 0.12, M.weathered, 0.9, 0.02, 0, s);
    api.parts.shutter = { leaf, t: 0, target: 0 }; leaf.position.x = 1.8; }
  // the radio desk (hall, east end) and the note table (by the stairs)
  { const d = P.desk({}, 1.8, 0.7, 0.76); d.position.set(3.3, 0, 24.75); G.add(d); solid(d);
    const r = named('radio-set'); r.position.set(2.7, 0.76, 24.7);
    box(0.42, 0.2, 0.24, M.black, 0, 0.1, 0, r); box(0.3, 0.07, 0.01, M.screen, -0.03, 0.13, -0.125, r).material = new THREE.MeshBasicMaterial({ color: 0x6b8a64 });
    const knob = cyl(0.035, 0.035, 0.03, M.brass, 0.15, 0.1, -0.13, 14, r); knob.rotation.x = Math.PI / 2; api.parts.radioKnob = knob;
    const ant = cyl(0.006, 0.006, 0.6, M.iron, -0.17, 0.5, 0.05, 6, r); ant.rotation.z = 0.25;
    const t = P.table({}, 0.9, 0.6, 0.76, 0x5a4636); t.position.set(-2.2, 0, 24); G.add(t); solid(t); }
  // bed, store shelves, workroom boxes (W1: rooms are lived in)
  { const b = P.bed({}, {}); b.position.set(0.8, 0, 28); b.rotation.y = Math.PI / 2; G.add(b); solid(b);
    const ch = P.tansu({}, { h: 0.84 }); ch.position.set(-2.25, 0, 27.6); G.add(ch); solid(ch);          // the cassette case on the chest
    const nt = P.table({}, 0.6, 0.45, 0.8, 0x4a3a2c); nt.position.set(3.6, 0, 27.1); G.add(nt); solid(nt);   // the hand mirror on the side table
    const s1 = P.shelf({}, 1.6, 1.8, 0.4, 5, 'boxes'); s1.position.set(2, FY(1), 28.7); G.add(s1); solid(s1);
    for (const [x, z] of [[-4.6, 20.2], [-3.9, 20.5], [4.8, 22.4]]) { const c = P.cardboardBox({}, 0.55, 0.38, 0.42); c.position.set(x, FY(1), z); c.rotation.y = rnd(); G.add(c); }
    const w = P.desk({}, 1.4, 0.7, 0.76); w.position.set(3.6, FY(1), 24.9); G.add(w); solid(w); }
  // the shed shelf (bottles) and the hut's floorboards (the crank)
  { const s = P.shelf({}, 1.4, 1.7, 0.4, 3, 'boxes'); s.position.set(-20.4, 0, -5.2); G.add(s); solid(s);
    const bs = named('bottles_shelf'); bs.position.set(-20.4, 0.92, -5.15);
    for (const x of [-0.12, 0.12]) { cyl(0.06, 0.07, 0.26, M.bottle, x, 0.13, 0, 12, bs); cyl(0.035, 0.035, 0.05, M.red, x, 0.285, 0, 10, bs); }
    const cr = named('crank_floor'); cr.position.set(15.4, 0.04, -17.2);
    const shaft = cyl(0.02, 0.02, 0.62, M.iron, 0, 0, 0, 8, cr); shaft.rotation.z = Math.PI / 2;
    const grip = cyl(0.035, 0.035, 0.16, M.red, 0.32, 0.08, 0, 10, cr); void grip; cyl(0.02, 0.02, 0.16, M.iron, -0.3, 0.06, 0, 8, cr);
    const cot = P.bed({}, {}); cot.position.set(17.9, 0, -16.6); G.add(cot);
    const rec = P.table({}, 3.0, 0.7, 0.8, 0x5a4a3a); rec.position.set(15.8, 0, -15.95); G.add(rec); solid(rec); }   // the record desk (ledger, photo)

  // ---------------------------------------------------------------- cover: timber stacks, the plank screen, the boulders (W2)
  { const L = named('timber-stack'); L.position.set(-16.8, 0, -7);
    for (let row = 0; row < 5; row++) for (let i = 0; i < 6 - row; i++) { const l = cyl(0.19, 0.19, 2.4, M.bark, 0, 0.19 + row * 0.33, (i - (5 - row) / 2) * 0.36 * 0.9, 9, L); l.rotation.z = Math.PI / 2; }
    addCol(-18, -7.9, -15.6, -6.1, 0, 1.95);
    const S = named('timber-screen'); S.position.set(-9.8, 0, -5.4);
    for (let i = 0; i < 11; i++) box(0.06, 2.15, 0.29, M.plank, 0, 1.075, -1.5 + i * 0.3, S);
    for (const z of [-1.6, 1.6]) box(0.12, 2.3, 0.12, M.bark, 0.08, 1.15, z, S);
    addCol(-9.95, -7.05, -9.65, -3.75, 0, 2.15);
    const stone = (x, z, s, k = [1, 0.8, 1]) => { const m = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 1), M.granite); m.position.set(x, s * k[1] * 0.75, z); m.scale.set(...k); m.rotation.set(rnd(), rnd() * 6, rnd()); m.castShadow = true; G.add(m); return m; };
    stone(11.6, -20, 1.25, [1.1, 1.1, 0.9]); stone(12.6, -19.2, 0.7); stone(10.9, -21, 0.55);
    addCol(10.6, -21, 12.8, -19, 0, 1.9);
    for (let i = 0; i < 18; i++) { const x = -6 + rnd() * 12, z = -11.2 + (rnd() - 0.5) * 2.4; if (Math.abs(x - 0.8) > 2.2) stone(x, z, 0.18 + rnd() * 0.3, [1, 0.6, 1]); }
  }
  // ---------------------------------------------------------------- the creek and the bridge (the red string on its rail)
  { const w = new THREE.Mesh(new THREE.PlaneGeometry(90, 2.6), M.water); w.rotation.x = -Math.PI / 2; w.position.set(0, 0.012, -10.2); w.name = 'creek'; G.add(w); api.parts.water = w;
    const B = named('bridge'); B.position.set(0.8, 0, -10.2);
    box(3.4, 0.14, 4.2, M.plank, 0, 0.3, 0, B); for (const x of [-1.65, 1.65]) { box(0.1, 0.9, 4.2, M.weathered, x, 0.75, 0, B); for (const z of [-2, 0, 2]) box(0.12, 1.1, 0.12, M.bark, x, 0.55, z, B); }
    const knot = cyl(0.03, 0.03, 0.5, M.red, 2.4, 1.02, 1.2, 6); knot.rotation.z = 0.3; }
  // ---------------------------------------------------------------- the forestry bell
  { const b = named('bell-frame'); b.position.set(-12.7, 0, -6.6);
    for (const x of [-0.7, 0.7]) box(0.14, 2.6, 0.14, M.bark, x, 1.3, 0, b);
    box(1.7, 0.14, 0.18, M.bark, 0, 2.6, 0, b); const bell = cyl(0.12, 0.26, 0.4, M.brass, 0, 2.25, 0, 16, b); bell.name = 'bell'; api.parts.bell = bell;
    const s = cyl(0.008, 0.008, 1.2, M.iron, 0.2, 1.65, 0.02, 4, b); void s; }
  // ---------------------------------------------------------------- the gate (a chain bar over the forest road) and its crank box (G1)
  { const gx = -16, gz0 = 14.1, gz1 = 17.9;
    for (const z of [gz0, gz1]) { cyl(0.11, 0.13, 1.3, M.yellow, gx, 0.65, z, 10); }
    const down = named('gate_bar_down'); down.position.set(gx, 1.05, (gz0 + gz1) / 2);
    const bar = box(0.1, 0.1, 3.8, M.yellow, 0, 0, 0, down); for (let i = -1; i <= 1; i += 2) box(0.11, 0.11, 0.5, M.red, 0, 0, i * 0.9, down); void bar;
    const up = named('gate_bar_up'); up.position.set(gx, 1.05, gz0); const ub = box(0.1, 3.8, 0.1, M.yellow, 0, 1.9, 0, up); void ub; box(0.11, 0.5, 0.11, M.red, 0, 1.0, 0, up);
    const kb = named('crank-box'); kb.position.set(-14.9, 0, 13.6);
    box(0.5, 1.0, 0.36, M.iron, 0, 0.5, 0, kb); box(0.52, 0.06, 0.4, M.rust, 0, 1.03, 0, kb);
    const hub = cyl(0.07, 0.07, 0.08, M.brass, 0.27, 0.7, 0, 12, kb); hub.rotation.z = Math.PI / 2; api.parts.crankHub = hub;
    const arm = named('crank-arm', kb); arm.position.set(0.32, 0.7, 0); cyl(0.02, 0.02, 0.3, M.iron, 0, 0.15, 0, 6, arm); cyl(0.03, 0.03, 0.12, M.red, 0.06, 0.3, 0, 8, arm).rotation.z = Math.PI / 2; arm.visible = false; api.parts.crankArm = arm;
    const door = world.doors.get('D_GATE'); if (door && door.mesh) door.mesh.material = new THREE.MeshBasicMaterial({ visible: false });
  }
  // ---------------------------------------------------------------- the uncle's car: the driver's door open, the cabin light and a mark (G2)
  { const car = E.car({ kind: 'sedan', color: 0x5a6670, interior: true }); car.position.set(-27.4, 0, 23.2); car.rotation.y = Math.PI; car.name = 'uncle-car'; G.add(car); api.parts.car = car;
    addCol(-28.4, 20.8, -26.4, 25.6, 0, 1.4);
    const cue = named('car_cue'); cue.position.set(-25.7, 0, 22.6);
    const door = box(0.06, 0.95, 1.05, M.weathered, 0.55, 0.75, 0.45, cue); door.material = mat(0x5a6670, { metalness: 0.5, roughness: 0.35 }); door.rotation.y = -0.9;
    const lamp = new THREE.PointLight(0xffd9a0, 6, 6, 1.6); lamp.position.set(-0.9, 1.25, 0.2); cue.add(lamp);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.62, 32), M.cue); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02; cue.add(ring); api.parts.carRing = ring;
  }
  // ---------------------------------------------------------------- the phone ringing in the mud
  { const p = named('phone_mud'); p.position.set(17.6, 0.03, -23);
    box(0.08, 0.012, 0.15, M.black, 0, 0, 0, p).rotation.y = 0.5; const sc = box(0.065, 0.004, 0.12, M.screen, 0, 0.008, 0, p); sc.rotation.y = 0.5; api.parts.phoneScreen = sc;
    const l = new THREE.PointLight(0x9fd2ff, 1.4, 2.4, 2); l.position.y = 0.2; p.add(l); api.parts.phoneLight = l; }

  // ---------------------------------------------------------------- the wall notices and photos (docs with "wall")
  for (const d of ctx.data.docs || []) {
    if (!d.wall) continue;
    const f = named(`wall-doc:${d.id}`); f.position.set(d.x, d.y ?? 1.6, d.z); f.rotation.y = d.wall.rot || 0;
    const tex = d.photo ? loader.load(d.photo) : null; if (tex) tex.colorSpace = THREE.SRGBColorSpace;
    box(d.wall.w + 0.06, d.wall.h + 0.06, 0.03, d.wall.type === 'photo' ? M.black : M.plank, 0, 0, -0.012, f);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(d.wall.w, d.wall.h), new THREE.MeshStandardMaterial({ color: tex ? 0xffffff : 0xe8e2d0, map: tex, roughness: 0.9 })); face.position.z = 0.006; f.add(face);
    if (d.wall.type === 'notice' && !(world.roomAt(d.x, d.z, 1.6) || '').startsWith('CAB')) { box(0.08, (d.y ?? 1.6) + d.wall.h / 2, 0.08, M.bark, 0, -((d.y ?? 1.6) - d.wall.h / 2) / 2 - d.wall.h / 2 + 0.02, -0.06, f); }
  }

  // ---------------------------------------------------------------- the uncle (L1 only: he leaves for the car once the telescope is done)
  { const c = makeCharacter({ detail: 1, build: 0.2, skin: '#c89f86', hair: '#2a2622', top: '#4d5a4a', bottom: '#33302c', shoes: '#2a2420' });
    const u = named('uncle'); u.position.set(2.3, FY(1), 24.2); u.rotation.y = -2.2; u.add(c.root); api.people.uncle = { root: u, character: c }; }

  // the amado's pull (the S_SHUTTER station) on the frame by the door
  box(0.07, 0.34, 0.09, M.iron, 1.4, balcY + 1.05, 19.13); box(0.16, 0.05, 0.05, M.iron, 1.4, balcY + 1.22, 19.13);
  // the stations that have a model here (telescope, radio, shelf, bell, crank box, car, phone, the hut floor, the amado pull): their
  // marker boxes are not drawn (G1: no plain boxes), they stay as the thing to select
  const unseen = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  for (const id of ['S_TELESCOPE', 'S_SHUTTER', 'S_RADIO', 'S_SHELF', 'S_BELL', 'S_CRANK', 'S_PHONE', 'S_GATE', 'S_CAR']) {
    const m = world.group.getObjectByName(`station:${id}`); if (!m) continue;
    m.traverse((o) => { if (o.isMesh) o.material = unseen; });
  }

  // the outside of the walls (W1): weathered boards on every face that looks out (after the recipes painted the rooms)
  api.ready = texReady.then(() => dressOuterWalls(ctx, M.weathered)).catch(() => 0);
  api.update = (dt, t) => {
    const s = api.parts.shutter; if (s) { s.t += (s.target - s.t) * Math.min(1, dt * 1.6); s.leaf.position.x = 1.8 * (1 - s.t); }
    if (api.parts.carRing) api.parts.carRing.material.opacity = 0.22 + 0.2 * (0.5 + 0.5 * Math.sin(t * 3));
    if (api.parts.phoneScreen) { const on = Math.sin(t * 6) > -0.2; api.parts.phoneLight.intensity = on ? 1.4 : 0.2; api.parts.phoneScreen.material.color.setHex(on ? 0x9fd2ff : 0x223344); }
    if (api.parts.water) api.parts.water.material.opacity = 0.82 + Math.sin(t * 0.7) * 0.04;
    const uc = api.people.uncle; if (uc && uc.root.visible && uc.character.update) uc.character.update(dt);
  };
  return api;
}
