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
  // 5.9 (feedback 2026-11-13 「全体的に寂れたテクスチャ」): nobody has looked after this mountain for years. The wood gets water stains,
  // streaks running down and lichen over its photo; the iron rusts, the yellow and red paint flakes off. Each is one canvas, drawn once
  // and put on the material that already exists (no new material, no new draw call)
  const wr = (() => { let q = 977; return () => ((q = (q * 1664525 + 1013904223) >>> 0) / 4294967296); })();
  const canvasMap = (S, draw, rep = [1, 1]) => { const cv = document.createElement('canvas'); cv.width = cv.height = S; draw(cv.getContext('2d'), S); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...rep); t.anisotropy = 4; return t; };
  const blot = (g, x, y, r, rgba) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, rgba); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, r, r * (0.6 + wr() * 0.6), wr() * 3, 0, Math.PI * 2); g.fill(); };
  const speckle = (g, S, n, rgba, size = 2) => { g.fillStyle = rgba; for (let i = 0; i < n; i++) g.fillRect(wr() * S, wr() * S, size * (0.5 + wr()), size * (0.5 + wr())); };
  const streaks = (g, S, n, rgba) => { for (let i = 0; i < n; i++) { const x = wr() * S, y = wr() * S * 0.6, h = S * (0.15 + wr() * 0.45), w = 1 + wr() * 3; const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, rgba); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x, y, w, h); } };
  const wornWood = (g, S) => {
    for (let i = 0; i < 9; i++) blot(g, wr() * S, wr() * S, S * (0.06 + wr() * 0.16), `rgba(28,24,16,${(0.18 + wr() * 0.2).toFixed(2)})`);   // water stains
    streaks(g, S, 26, 'rgba(22,18,12,0.32)');                                                                                       // rain running down
    for (let i = 0; i < 7; i++) { const x = wr() * S, y = wr() * S; for (let k = 0; k < 40; k++) { g.fillStyle = `rgba(${92 + wr() * 30 | 0},${110 + wr() * 30 | 0},${62 + wr() * 20 | 0},${(0.25 + wr() * 0.35).toFixed(2)})`; const a = wr() * 6.3, r = wr() * S * 0.05; g.fillRect(x + Math.cos(a) * r, y + Math.sin(a) * r, 2 + wr() * 3, 2 + wr() * 3); } }   // lichen
    speckle(g, S, 500, 'rgba(15,12,8,0.25)', 1.6);
  };
  const metal = (base, rustAmt, flakes) => canvasMap(256, (g, S) => {
    g.fillStyle = base; g.fillRect(0, 0, S, S); speckle(g, S, 900, 'rgba(0,0,0,0.12)', 1.4); speckle(g, S, 300, 'rgba(255,255,255,0.05)', 1.2);
    for (let i = 0; i < rustAmt; i++) blot(g, wr() * S, wr() * S, S * (0.04 + wr() * 0.14), `rgba(${104 + wr() * 30 | 0},${54 + wr() * 18 | 0},${26 + wr() * 10 | 0},${(0.45 + wr() * 0.4).toFixed(2)})`);
    for (let i = 0; i < flakes; i++) { g.fillStyle = wr() < 0.6 ? `rgba(${88 + wr() * 20 | 0},${70 + wr() * 14 | 0},${56 | 0},0.9)` : 'rgba(70,64,58,0.9)'; g.beginPath(); const x = wr() * S, y = wr() * S; g.moveTo(x, y); for (let k = 0; k < 6; k++) g.lineTo(x + (wr() - 0.5) * 22, y + (wr() - 0.5) * 22); g.fill(); }   // paint gone to the metal
    streaks(g, S, 18, 'rgba(96,52,24,0.45)');
  });
  for (const [m, tex] of [[M.iron, metal('#4c4d4b', 10, 0)], [M.rust, metal('#6b4632', 16, 0)], [M.yellow, metal('#c9a43a', 7, 26)], [M.red, metal('#a3322a', 4, 18)]]) { m.color.setHex(0xffffff); m.map = tex; m.needsUpdate = true; }
  // the wood: its photo first, the wear over it (before cull.js merges, the boot waits for api.ready)
  const agedWood = loader.loadAsync('assets/textures/weathered-wood-v4-2.webp').then((t) => {
    const img = t.image, S = 512, cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d');
    g.drawImage(img, 0, 0, S, S); wornWood(g, S);
    const a = new THREE.CanvasTexture(cv); a.colorSpace = THREE.SRGBColorSpace; a.wrapS = a.wrapT = THREE.RepeatWrapping; a.anisotropy = 4;
    for (const m of [M.weathered, M.plank]) { const t2 = a.clone(); t2.repeat.copy(m.map.repeat); m.map = t2; m.needsUpdate = true; }
    t.dispose();
  }).catch(() => 0);

  // ---------------------------------------------------------------- ground, mountains, the trails that go on into the fog (W4)
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(320, 320), M.ground); ground.rotation.x = -Math.PI / 2; ground.position.set(0, -0.06, 0); ground.receiveShadow = true; G.add(ground);
  const rnd = (() => { let s = 4302; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); })();
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2 + rnd() * 0.2, r = 120 + rnd() * 30, h = 40 + rnd() * 34; const m = new THREE.Mesh(new THREE.ConeGeometry(36 + rnd() * 16, h, 7), mat(0x2a3330)); m.position.set(Math.cos(a) * r, h / 2 - 3, Math.sin(a) * r); G.add(m); }
  const strips = [   // visual road beyond the plan: [x0, z0, x1, z1, width]
    [4, -30, 4, -120, 3.2], [-34, 20.5, -130, 20.5, 3.6],
  ];
  const keepOut = plan.rooms.map((r) => ({ minX: r.x, maxX: r.x + r.w, minZ: r.z, maxZ: r.z + r.d }));
  keepOut.push({ minX: -36, maxX: 4, minZ: -17, maxZ: -8 });   // 5.7: no cedar between the fire tower and the bridge (the reflector's line of sight)
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
    // 5.8: the edge was open ground with bushes, trees far behind it: it looked walkable. A close row of young cedars stands outside every
    // boundary wall now, their crowns clear of the walkable ground (W3), never inside another walkable area, on a road or in the creek
    {
      const OFF = treeReach({ h: 6, kind: 'cedar' }) + 0.25, edge = [];
      world.group.traverse((o) => {
        if (!o.isMesh || !/^wall:O_/.test(o.name)) return;
        const rid = o.name.split(':')[1], r = (ctx.data.plan.rooms || []).find((x) => x.id === rid); if (!r) return;
        const b = new THREE.Box3().setFromObject(o), alongX = b.max.x - b.min.x > b.max.z - b.min.z, len = alongX ? b.max.x - b.min.x : b.max.z - b.min.z;
        const cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2, out = alongX ? Math.sign(cz - (r.z + r.d / 2)) || 1 : Math.sign(cx - (r.x + r.w / 2)) || 1;
        for (let t = 0.5 + rnd() * 0.6; t < len; t += 1.5 + rnd() * 0.9) {
          const x = alongX ? b.min.x + t : cx + out * (OFF + rnd() * 0.5), z = alongX ? cz + out * (OFF + rnd() * 0.5) : b.min.z + t;
          if (dist(x, z) < OFF - 0.2 || world.roomAt(x, z, 1) || Math.abs(z + 10.2) < 1.8 || edge.some((e) => Math.abs(e[0] - x) < 1.3 && Math.abs(e[1] - z) < 1.3)) continue;
          edge.push([x, z, 0.9 + rnd() * 0.35, rnd() * 6.3]);
        }
      });
      const ep = tree({ kind: 'cedar', h: 6, seed: 23, mats: { bark: M.bark } });
      for (const { geometry, material } of mergedParts(ep)) {
        const im = new THREE.InstancedMesh(geometry, material, edge.length);
        edge.forEach(([x, z, s, ry], i) => im.setMatrixAt(i, new THREE.Matrix4().compose(V3(x, -0.05, z), new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), ry), V3(1, s, 1))));
        im.instanceMatrix.needsUpdate = true; im.castShadow = true; im.computeBoundingSphere(); im.name = 'forest:edge'; G.add(im);
      }
      for (const [x, z, s] of edge) trunks.push(new THREE.Box3(V3(x - 0.25, 0, z - 0.25), V3(x + 0.25, 6 * s, z + 0.25)));
      api.occluders.push(...trunks.slice(-edge.length));
      api.edgeTrees = edge.length;
    }
    // undergrowth along the hidden boundary walls: the edge of the walkable ground reads as bushes and moss, not as an invisible wall
    const bush = new THREE.IcosahedronGeometry(0.7, 0), spots = [];
    // 5.8.2 (「建物の中の端に草木が飛び出しています」): a bush never reaches into a building (its walls are outdoor walls too)
    const indoor = plan.rooms.filter((r) => r.kind !== 'outdoor'), inDist = (x, z) => Math.min(...indoor.map((r) => Math.hypot(Math.max(r.x - x, 0, x - r.x - r.w), Math.max(r.z - z, 0, z - r.z - r.d))));
    world.group.traverse((o) => {
      if (!o.isMesh || !/^wall:O_/.test(o.name)) return;
      const b = new THREE.Box3().setFromObject(o), len = Math.max(b.max.x - b.min.x, b.max.z - b.min.z), alongX = b.max.x - b.min.x > b.max.z - b.min.z;
      for (let t = 0.6; t < len; t += 1.3 + rnd()) { const sp = [alongX ? b.min.x + t : (b.min.x + b.max.x) / 2, alongX ? (b.min.z + b.max.z) / 2 : b.min.z + t, 0.6 + rnd() * 0.7]; if (inDist(sp[0], sp[1]) > sp[2] * 0.85 + 0.15) spots.push(sp); }
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
    for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2, l = cyl(0.018, 0.022, 1.3, M.iron, Math.cos(a) * 0.22, 0.62, Math.sin(a) * 0.22, 6, t); l.rotation.set(-Math.sin(a) * 0.3, 0, Math.cos(a) * 0.3); }   // the feet splay out and the tops meet under the tube (the other sign stood it on its head)
    const tube = cyl(0.07, 0.055, 0.9, M.white, 0, 1.32, -0.05, 14, t); tube.rotation.x = Math.PI / 2 + 0.12; cyl(0.075, 0.075, 0.05, M.black, 0, 1.27, -0.5, 14, t).rotation.x = Math.PI / 2 + 0.12; }
  // the amado: a wooden leaf beside the balcony door that slides across it when T_SHUTTER is done (W5)
  { const s = named('shutter'); s.position.set(0, balcY, 18.86);   // outside the wall line (z 19), on the balcony side
    const leaf = box(1.7, 2.2, 0.05, M.plank, 0, 1.1, 0, s); for (let i = -2; i <= 2; i++) box(0.03, 2.2, 0.06, M.weathered, i * 0.34, 0, 0.01, leaf);   // the battens ride on the leaf (left on the frame they read as bars across the open door)
    box(3.6, 0.08, 0.12, M.weathered, 0.9, 2.26, 0, s); box(3.6, 0.04, 0.12, M.weathered, 0.9, 0.02, 0, s);
    api.parts.shutter = { leaf, t: 0, target: 0 }; leaf.position.x = 1.8; }
  // the balcony door (feedback 2026-11-02 "ベランダへのドアももう少しデザイン"): a glazed sliding door in a wooden frame instead of the plain
  // panel. The standard panel stays as the collider and the [E] target (invisible); this leaf slides along the room side of the wall when it opens
  { const bd = world.doors.get('D_BALC');
    if (bd && bd.mesh) {
      bd.mesh.material = new THREE.MeshBasicMaterial({ visible: false });
      const W = bd.def.width || 1.6, H = 2.2, frameM = mat(0x3e3127, { map: M.plank.map }), z = 19.12;
      const casing = named('balcony-casing'); casing.position.set(0, balcY, z + 0.02);   // the fixed frame round the opening
      box(0.1, H + 0.1, 0.06, frameM, -W / 2 - 0.05, (H + 0.1) / 2, 0, casing); box(0.1, H + 0.1, 0.06, frameM, W / 2 + 0.05, (H + 0.1) / 2, 0, casing);
      box(W + 0.2, 0.1, 0.06, frameM, 0, H + 0.05, 0, casing); box(W + 0.2, 0.03, 0.2, M.weathered, 0, 0.015, -0.1, casing);   // head and threshold
      for (const sx of [-1, 1]) box(0.08, H + 0.06, 0.04, frameM, sx * (W / 2 + 0.04), (H + 0.06) / 2, -0.23, casing);   // jambs on the balcony face (behind the amado's track)
      const leaf = named('balcony-door'); leaf.position.set(0, balcY, z); leaf.userData.keep = true;   // it slides: out of cull.js's merge (its "balcony-" name reads as still)
      const st = 0.07, kick = 0.5, rail = 0.07;
      box(st, H, 0.05, frameM, -W / 2 + st / 2, H / 2, 0, leaf); box(st, H, 0.05, frameM, W / 2 - st / 2, H / 2, 0, leaf);   // stiles
      box(W, rail, 0.05, frameM, 0, H - rail / 2, 0, leaf); box(W, kick, 0.045, frameM, 0, kick / 2, 0, leaf); box(W - 0.3, kick - 0.16, 0.05, M.plank, 0, kick / 2, 0, leaf);   // kick panel with a raised board              // top rail, wooden kick panel
      box(W - st * 2, 0.05, 0.05, frameM, 0, kick + 0.025, 0, leaf);                                                         // rail over the panel
      const gy0 = kick + 0.05, gy1 = H - rail, gh = gy1 - gy0;
      box(W - st * 2, gh, 0.012, new THREE.MeshStandardMaterial({ color: 0xa9bcbe, roughness: 0.35, metalness: 0, transparent: true, opacity: 0.28, depthWrite: false }), 0, gy0 + gh / 2, 0, leaf).castShadow = false;   // matte enough not to glint with the room lamps                                      // the glass
      box(0.035, gh, 0.04, frameM, 0, gy0 + gh / 2, 0, leaf); box(W - st * 2, 0.035, 0.04, frameM, 0, gy0 + gh * 0.55, 0, leaf);   // mullions: four panes
      box(0.025, 0.22, 0.03, M.brass, -W / 2 + st + 0.06, 1.05, 0.035, leaf);                                                 // the pull (room side)
      api.parts.balconyDoor = { leaf, door: bd, t: 0, W };
    }
  }
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
    const bs = named('bottles_shelf'); bs.position.set(-20.92, 1.693, -5.2);   // 5.7.3: standing on the top board, left of the photo (y 1.68, nothing else on it): the lower boards are full of boxes, and in front of them the bottles floated
    for (const x of [-0.12, 0.12]) { cyl(0.06, 0.07, 0.26, M.bottle, x, 0.13, 0, 12, bs); cyl(0.035, 0.035, 0.05, M.red, x, 0.285, 0, 10, bs); }
    // looking at the bottles up there is looking at the shelf: an unseen [E] handle around them (the kit's station box stops at 1.1 m)
    { const h = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.4), new THREE.MeshBasicMaterial({ visible: false })); h.position.set(-20.92, 1.85, -5.15); h.name = 'shelf-bottles-handle'; h.userData.interact = { kind: 'station', id: 'S_SHELF' }; world.group.add(h); world.interactables.push(h); }
    const cr = named('crank_floor'); cr.position.set(15.4, 0.04, -17.2);
    const shaft = cyl(0.02, 0.02, 0.62, M.iron, 0, 0, 0, 8, cr); shaft.rotation.z = Math.PI / 2;
    const grip = cyl(0.035, 0.035, 0.16, M.red, 0.32, 0.08, 0, 10, cr); void grip; cyl(0.02, 0.02, 0.16, M.iron, -0.3, 0.06, 0, 8, cr);
    const cot = P.bed({}, {}); cot.position.set(18.45, 0, -15.0); G.add(cot); solid(cot);   // 5.8.1: against the east wall north of the locker, and solid (it stood on the locker and was the way behind the desk)
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
    addCol(10.6, -21, 12.92, -19, 0, 1.9);   // up to the hut-side boundary: no 12 cm squeeze between the boulder and the wall (a player was shut in there, 2026-11-02)
    for (let i = 0; i < 18; i++) { const x = -6 + rnd() * 12, z = -11.2 + (rnd() - 0.5) * 2.4; if (Math.abs(x - 0.8) > 2.2) stone(x, z, 0.18 + rnd() * 0.3, [1, 0.6, 1]); }
  }
  // ---------------------------------------------------------------- the creek and the bridge (the red string on its rail)
  // 5.8: a footbridge of two logs and boards over the creek, a rope rail on posts on one side
  function footbridge(x) {
    const F = named(`footbridge:${x}`); F.position.set(x, 0, -10.2); F.userData.keep = true;
    for (const dx of [-0.42, 0.42]) { const l = cyl(0.17, 0.2, 4.6, M.bark, dx, 0.16, 0, 9, F); l.rotation.x = Math.PI / 2; }
    for (let i = 0; i < 11; i++) box(1.5, 0.06, 0.36, M.plank, (i % 2 ? 0.03 : -0.03), 0.36, -2 + i * 0.4, F);
    for (const z of [-2.1, 0, 2.1]) box(0.09, 1.3, 0.09, M.bark, 0.78, 0.53, z, F);   // 5.9: the rope posts reach down into the bank (they stood 18 cm over the ground)
    const rope = cyl(0.015, 0.015, 4.3, M.weathered, 0.78, 1.12, 0, 5, F); rope.rotation.x = Math.PI / 2;
  }
  { const w = new THREE.Mesh(new THREE.PlaneGeometry(90, 2.6), M.water); w.rotation.x = -Math.PI / 2; w.position.set(0, 0.012, -10.2); w.name = 'creek'; G.add(w); api.parts.water = w;
    const B = named('bridge'); B.position.set(0.8, 0, -10.2);
    box(3.4, 0.14, 4.2, M.plank, 0, 0.3, 0, B); for (const x of [-1.65, 1.65]) { box(0.1, 0.9, 4.2, M.weathered, x, 0.75, 0, B); for (const z of [-2, 0, 2]) box(0.12, 1.1, 0.12, M.bark, x, 0.55, z, B); }
    // 5.9 (a floating-object scan): the red string was added to the mountain, not to the bridge, and hung in the air 11 m north of it; now it is tied to the east rail
    const knot = cyl(0.03, 0.03, 0.5, M.red, 1.7, 1.05, 1.2, 6, B); knot.rotation.z = 0.3; knot.name = 'bridge-knot';
    // 5.7: the water that rises when the figure stands on the bridge. The colliders leave the deck as the only way over; no eye-blocking (they are water)
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64; { const g = cv.getContext('2d'); for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(220,214,190,${0.08 + rnd() * 0.22})`; g.fillRect(rnd() * 256, rnd() * 64, 16 + rnd() * 70, 1 + rnd() * 2); } }
    const tex = new THREE.CanvasTexture(cv); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(14, 1); tex.colorSpace = THREE.SRGBColorSpace;
    const foam = new THREE.Mesh(new THREE.PlaneGeometry(90, 3.4), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false })); foam.rotation.x = -Math.PI / 2; foam.position.set(0, 0.03, -10.2); foam.name = 'flood-foam'; G.add(foam);
    const solid2 = (x0, z0, x1, z1) => { const c = { box: new THREE.Box3(V3(x0, -1, z0), V3(x1, 2.4, z1)), off: true }; colliders.push(c); return c; };
    // 5.8: the banks are always solid (the creek was waded anywhere; the hut door was reached through the water): the bridge and two
    // footbridges (FOOT) cross it. In the flood (L7) the footbridges are under the water too; wading back is the flood's own rule
    const FOOT = [-19.5, 16], half = 0.8, cuts = [-30, ...FOOT.flatMap((x) => [x - half, x + half]).sort((a, b) => a - b), 30];
    const spans = [[cuts[0], cuts[1]], [cuts[2], -0.9], [2.5, cuts[3]], [cuts[4], cuts[5]]];
    const banks = spans.map(([a, b]) => { const c = solid2(a, -11.6, b, -8.8); c.off = false; return c; }), gate = solid2(-1, -12, 2.6, -11.6);
    const fgaps = FOOT.map((x) => solid2(x - half, -11.6, x + half, -8.8));
    for (const x of FOOT) footbridge(x);
    // 5.9 (feedback: 「渡れなくなった橋は無くしてしまってよい」): in the flood the two footbridges go under and are carried off; their gaps stay
    // water (fgaps). Only the main bridge is left to cross
    const feet = FOOT.map((x) => G.getObjectByName(`footbridge:${x}`)).filter(Boolean);
    api.parts.flood = { foam, tex, t: 0, target: 0, banks, fgaps, gate, feet, gone: false, dry: new THREE.Color(0x2b3a3b), wet: new THREE.Color(0x3b3425) };
    api.setFlood = (on, solid = on) => { const f = api.parts.flood; f.target = on ? 1 : 0; for (const c of f.banks) c.off = on && !solid; for (const c of f.fgaps) c.off = !(on && solid);
      if (!on && f.gone) { f.gone = false; for (const b of f.feet) { b.visible = true; b.position.y = 0; b.rotation.set(0, 0, 0); } } else if (on) f.gone = true; };
    api.setBridgeShut = (on) => { api.parts.flood.gate.off = !on; }; }
  // the work tag's wire (N_TAG hangs from it at x -10, z -13): two stakes and a wire, so the tag is not in mid-air
  { const w = named('tag-wire'); w.position.set(-10, 0, -13);
    for (const x of [-0.95, 0.95]) box(0.1, 1.75, 0.1, M.bark, x, 0.875, 0, w);
    const wire = cyl(0.008, 0.008, 1.9, M.iron, 0, 1.62, 0, 4, w); wire.rotation.z = Math.PI / 2;
    const hook = cyl(0.006, 0.006, 0.12, M.iron, 0, 1.56, 0, 4, w); void hook; }
  // ---------------------------------------------------------------- the forestry bell
  { const b = named('bell-frame'); b.position.set(-12.7, 0, -6.6);
    for (const x of [-0.7, 0.7]) box(0.14, 2.6, 0.14, M.bark, x, 1.3, 0, b);
    box(1.7, 0.14, 0.18, M.bark, 0, 2.6, 0, b); const bell = cyl(0.12, 0.26, 0.4, M.brass, 0, 2.25, 0, 16, b); bell.name = 'bell'; api.parts.bell = bell;
    const s = cyl(0.008, 0.008, 1.2, M.iron, 0.2, 1.65, 0.02, 4, b); void s; }
  // 5.8: the old bell down the creek (T_LURE), a frame like the other one
  { const b = named('bell-frame2'); b.position.set(24.4, 0, -28.9);
    for (const x of [-0.7, 0.7]) box(0.14, 2.6, 0.14, M.bark, x, 1.3, 0, b);
    box(1.7, 0.14, 0.18, M.bark, 0, 2.6, 0, b); const bell = cyl(0.12, 0.26, 0.4, M.brass, 0, 2.25, 0, 16, b); bell.name = 'bell2'; api.parts.bell2 = bell;
    addCol(23.6, -29.15, 25.2, -28.65, 0, 2.6); }
  // 5.8: crates with two bottles in them, on the way (the two from the shed ran out while exploring): the story fills them up, once each
  api.caches = [];
  for (const [id, x, z, ry] of [['bridge', 4.1, -14.2, 0.2], ['hut', 13.6, -13.75, 0], ['post', -26.9, -23.1, 0]]) {   // 5.9: three (the forest road and the tower ones went)
    const k = named(`bottle-crate:${id}`); k.position.set(x, 0, z); k.rotation.y = ry;
    box(0.5, 0.28, 0.36, M.plank, 0, 0.14, 0, k);
    const bt = new THREE.Group(); bt.name = `bottle-crate-bottles:${id}`; k.add(bt);
    for (const bx of [-0.1, 0.1]) { cyl(0.06, 0.07, 0.26, M.bottle, bx, 0.41, 0, 12, bt); cyl(0.035, 0.035, 0.05, M.red, bx, 0.565, 0, 10, bt); }
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.8, 0.6), new THREE.MeshBasicMaterial({ visible: false })); h.position.set(x, 0.4, z); h.name = `bottle-crate-handle:${id}`; world.group.add(h);
    k.updateMatrixWorld(true); colliders.push({ box: new THREE.Box3().setFromObject(k.children[0]), off: false });
    api.caches.push({ id, handle: h, bottles: bt });
  }
  // ---------------------------------------------------------------- the gate (a chain bar over the forest road) and its crank box (G1)
  { const gx = -16, gz0 = 14.1, gz1 = 17.9;
    for (const z of [gz0, gz1]) { cyl(0.11, 0.13, 1.3, M.yellow, gx, 0.65, z, 10); }
    const down = named('gate_bar_down'); down.position.set(gx, 1.05, (gz0 + gz1) / 2);
    const bar = box(0.1, 0.1, 3.8, M.yellow, 0, 0, 0, down); for (let i = -1; i <= 1; i += 2) box(0.11, 0.11, 0.5, M.red, 0, 0, i * 0.9, down); void bar;
    const up = named('gate_bar_up'); up.position.set(gx, 1.05, gz0); const ub = box(0.1, 3.8, 0.1, M.yellow, 0, 1.9, 0, up); void ub; box(0.11, 0.5, 0.11, M.red, 0, 1.0, 0, up);
    const kb = named('crank-box'); kb.position.set(-14.9, 0, 13.6);
    box(0.5, 1.0, 0.36, M.iron, 0, 0.5, 0, kb); box(0.52, 0.06, 0.4, M.rust, 0, 1.03, 0, kb);
    const hub = cyl(0.07, 0.07, 0.08, M.brass, 0.27, 0.7, 0, 12, kb); hub.rotation.z = Math.PI / 2; api.parts.crankHub = hub;
    { const l = named('box_lock', kb); l.position.set(0.3, 0.9, 0); l.scale.setScalar(2.4); box(0.05, 0.1, 0.09, M.brass, 0, 0, 0, l); const sh = new THREE.Mesh(new THREE.TorusGeometry(0.033, 0.007, 6, 14, Math.PI), M.iron); sh.position.set(0, 0.05, 0); sh.rotation.y = Math.PI / 2; l.add(sh); }   // 5.7: 葛西さん's new padlock
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
  // 5.9: how each one hangs now: lean = the post tipped back (outdoors), roll = the board askew, nail = it hangs from one top corner
  const HANG = { W_TRAIL_NOTICE: { lean: 0.12, roll: 0.07 }, W_FORESTRY_NOTICE: { nail: -0.42 }, W_BRIDGE_NOTICE: { lean: -0.1, roll: -0.12 }, W_POST_SIGN: { lean: 0.14, roll: 0.1 }, W_TOWER_SIGN: { nail: 0.33 },
    W_SHELTER_NOTICE: { nail: -0.3 }, W_CABIN_MEMORY: { roll: 0.05 }, W_LOGGING_MEMORY: { roll: -0.07 }, W_CREEK_MEMORY: { roll: 0.06 }, W_PARKING_MEMORY: { roll: -0.04 } };
  for (const d of ctx.data.docs || []) {
    if (!d.wall) continue;
    const f = named(`wall-doc:${d.id}`); f.position.set(d.x, d.y ?? 1.6, d.z); f.rotation.order = 'YXZ'; f.rotation.y = d.wall.rot || 0;
    const tex = d.photo ? loader.load(d.photo) : null; if (tex) tex.colorSpace = THREE.SRGBColorSpace;
    const hg = HANG[d.id] || {}, W2 = d.wall.w / 2 + 0.03, H2 = d.wall.h / 2 + 0.03;
    if (hg.lean) f.rotation.x = -hg.lean;
    // the board itself in a pivot: at its centre (askew) or at the top corner of its last nail
    const pv = named(`wall-doc-board:${d.id}`, f), side = Math.sign(hg.nail || 0) || 1;
    if (hg.nail) { pv.position.set(-side * (W2 - 0.04), H2 - 0.04, 0); pv.rotation.z = hg.nail; } else if (hg.roll) pv.rotation.z = hg.roll;
    const bd = named(`wall-doc-face:${d.id}`, pv); if (hg.nail) bd.position.set(side * (W2 - 0.04), -(H2 - 0.04), 0);
    box(d.wall.w + 0.06, d.wall.h + 0.06, 0.03, d.wall.type === 'photo' ? M.black : M.plank, 0, 0, -0.012, bd);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(d.wall.w, d.wall.h), new THREE.MeshStandardMaterial({ color: tex ? 0xffffff : 0xe8e2d0, map: tex, roughness: 0.9 })); face.position.z = 0.006; bd.add(face);
    if (hg.nail) cyl(0.012, 0.012, 0.07, M.iron, 0, 0, 0.02, 6, pv).rotation.x = Math.PI / 2;   // the nail it still hangs on
    { const pk = world.interactables.find((m) => m.name === `doc:${d.id}`); if (pk) { if (pk.userData.model) { pk.remove(pk.userData.model); pk.userData.model = null; } pk.userData.wallFrame = f; } }   // 5.8: the kit's flat paper stuck out of the frame
    if (d.wall.type === 'notice' && !(world.roomAt(d.x, d.z, 1.6) || '').startsWith('CAB')) { box(0.08, (d.y ?? 1.6) + d.wall.h / 2, 0.08, M.bark, 0, -((d.y ?? 1.6) - d.wall.h / 2) / 2 - d.wall.h / 2 + 0.02, -0.06, f); }
  }

  // 5.9: signs nobody put back up. A board with letters on a canvas, lying, leaning or hanging from one nail
  const signTex = (lines, o = {}) => canvasMap(256, (g, S) => {
    g.fillStyle = o.bg || '#d8d2c0'; g.fillRect(0, 0, S, S); wornWood(g, S);
    g.fillStyle = o.ink || 'rgba(150,34,26,0.82)'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `700 ${o.size || 64}px "Yu Mincho","Hiragino Mincho ProN",serif`;
    lines.forEach((t, i) => g.fillText(t, S / 2, S / 2 + (i - (lines.length - 1) / 2) * (o.size || 64) * 1.15));
    for (let i = 0; i < 160; i++) { g.fillStyle = 'rgba(216,210,192,0.9)'; g.fillRect(wr() * S, wr() * S, 3 + wr() * 9, 2 + wr() * 5); }   // the paint has come off in flakes
    streaks(g, S, 14, 'rgba(60,40,20,0.35)');
  });
  { // the road closed sign by the fallen tree, knocked flat (its two legs, one snapped)
    const tx = signTex(['通行止'], { size: 70 }), sm = mat(0xffffff, { map: tx });
    const b = box(1.3, 0.04, 0.42, sm, 2.6, 0.02, -29.2); b.rotation.y = 0.35;
    const l1 = box(0.06, 0.05, 0.9, M.weathered, 2.15, 0.025, -28.9); l1.rotation.y = 0.35 + 0.2; const l2 = box(0.06, 0.05, 0.5, M.weathered, 3.15, 0.025, -29.55); l2.rotation.y = -0.4; }
  { // the car park sign: its post rotted at the foot, it lies against the edge of the gravel
    const tx = signTex(['駐車場'], { size: 64, ink: 'rgba(40,52,88,0.85)' }), sm = mat(0xffffff, { map: tx });
    const p = box(0.08, 0.08, 1.8, M.bark, -31.6, 0.04, 27.6); p.rotation.y = 0.5;
    const b = box(0.7, 0.03, 0.5, sm, -31.2, 0.05, 28.35); b.rotation.y = 0.5; box(0.1, 0.12, 0.1, M.bark, -32.0, 0.06, 26.85); }
  { // a tin notice on the shed's north wall, hanging from one nail
    const tx = signTex(['火の用心'], { size: 52, bg: '#cfc8b4' }), sm = mat(0xffffff, { map: tx, metalness: 0.35, roughness: 0.6 });
    const pv = new THREE.Group(); pv.position.set(-21.6, 1.85, -0.86); pv.rotation.z = -0.62; G.add(pv);   // 5.9.1: on the wall west of the sliding door, not over its opening
    box(0.5, 0.36, 0.012, sm, 0.25, -0.18, 0, pv); cyl(0.01, 0.01, 0.05, M.iron, 0, 0, 0.01, 6, pv).rotation.x = Math.PI / 2; }
  // moss where the walls and posts meet the ground (one instanced mesh): the buildings nobody keeps
  { const spots = [];
    for (const r of plan.rooms) { if (r.kind === 'outdoor' || (r.floor || 0) !== 0 || r.w == null) continue; const per = 2 * (r.w + r.d), n = Math.round(per * (/^CAB/.test(r.id) ? 0.6 : 1.4));
      for (let i = 0; i < n; i++) { const t = wr() * per; let x, z; if (t < r.w) { x = r.x + t; z = r.z - 0.08; } else if (t < r.w + r.d) { x = r.x + r.w + 0.08; z = r.z + t - r.w; } else if (t < 2 * r.w + r.d) { x = r.x + t - r.w - r.d; z = r.z + r.d + 0.08; } else { x = r.x - 0.08; z = r.z + t - 2 * r.w - r.d; }
        if (world.roomAt(x, z, 1) && !/^O_/.test(world.roomAt(x, z, 1))) continue; spots.push([x, z, 0.16 + wr() * 0.3]); } }
    const mg = new THREE.IcosahedronGeometry(1, 0), im = new THREE.InstancedMesh(mg, M.moss, spots.length);
    spots.forEach(([x, z, sc], i) => im.setMatrixAt(i, new THREE.Matrix4().compose(V3(x, 0, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, wr() * 6, 0)), V3(sc * 1.4, sc * 0.28, sc))));
    im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); im.name = 'moss-bases'; im.receiveShadow = true; G.add(im); }

  // 5.8: a wall doc is read by looking at its frame: after the kit has seated the pickups, each one's box becomes the frame
  api.fitWallDocs = () => { for (const pk of world.interactables) { const f = pk.userData && pk.userData.wallFrame; if (!f) continue; const d = pk.userData.def.wall;
    pk.geometry.dispose(); pk.geometry = new THREE.BoxGeometry(d.w + 0.06, d.h + 0.06, 0.04).translate(0, 0, -0.004); f.updateMatrixWorld(true); f.getWorldPosition(pk.position); pk.parent.worldToLocal(pk.position); pk.rotation.set(0, d.rot || 0, 0); pk.updateMatrixWorld(true); } };

  // ---------------------------------------------------------------- the uncle (L1 only: he leaves for the car once the telescope is done)
  { const c = makeCharacter({ detail: 1, build: 0.2, skin: '#c89f86', hair: '#2a2622', top: '#4d5a4a', bottom: '#33302c', shoes: '#2a2420' });
    const u = named('uncle'); u.position.set(2.3, FY(1), 24.2); u.rotation.y = -2.2; u.add(c.root); api.people.uncle = { root: u, character: c }; }

  // ---------------------------------------------------------------- 5.7: the old forestry post, dark and left as it was
  const NO_LAMP = /^(lamp|lampshade|lampbulb|lampcord):(POST|POST_BUNK|TOWER_[012])$/;
  world.group.traverse((o) => { if (NO_LAMP.test(o.name)) { if (o.isLight && o.name === 'lamp:TOWER_2') { api.parts.towerLamp = o; o.color.setHex(0xffa860); o.intensity = 0; } else o.visible = false; } });
  roofOn(-34, -28, -26, -18.6, wallTop(['POST', 'POST_BUNK']), { pitch: 0.42 });
  { const put = (o, x, z, ry = 0, sol = true) => { o.position.set(x, 0, z); o.rotation.y = ry; G.add(o); if (sol) solid(o); return o; };
    put(P.steelDesk({}, 1.6, 0.7), -30.8, -27.4);                 // the desk of the diary
    put(P.steelDesk({}, 1.3, 0.7), -27.9, -27.4);                 // the roll book lies open here
    put(P.officeChair(), -30.9, -26.5, Math.PI + 0.5, false);
    put(P.filingCabinet({}, 1.3), -33.5, -27.5);
    put(P.filingCabinet({}, 1.3), -32.9, -27.5);
    put(P.coatRack(), -26.6, -27.5, 0, false);
    const s = P.shelf({}, 1.4, 1.8, 0.4, 4, 'boxes'); put(s, -33.7, -23.9 + 1.5 - 1.5, Math.PI / 2);
    // a mug left on the desk, a stopped clock on the wall
    cyl(0.04, 0.04, 0.09, M.white, -30.0, 0.77, -27.5, 12);
    { const c = named('post-clock'); c.position.set(-29.5, 2.1, -27.94); const f = cyl(0.17, 0.17, 0.04, M.white, 0, 0, 0, 22, c); f.rotation.x = Math.PI / 2; box(0.012, 0.13, 0.01, M.black, 0.02, 0.05, 0.03, c).rotation.z = -0.4; box(0.016, 0.09, 0.01, M.black, -0.03, -0.03, 0.03, c).rotation.z = 2.4; }
    // the key cabinet on the west wall: shut until the number is found, then open with its hooks showing
    { const shut = named('keybox_shut'); shut.position.set(-33.93, 1.45, -25.2); box(0.1, 0.58, 0.46, M.iron, 0, 0, 0, shut);
      for (let i = 0; i < 3; i++) { const d = cyl(0.03, 0.03, 0.03, M.brass, 0.06, 0, -0.12 + i * 0.12, 12, shut); d.rotation.z = Math.PI / 2; }
      const open = named('keybox_open'); open.position.set(-33.93, 1.45, -25.2); box(0.1, 0.58, 0.46, M.black, 0, 0, 0, open);
      const leaf = box(0.03, 0.58, 0.46, M.iron, 0.25, 0, -0.42, open); leaf.rotation.y = 1.2;
      for (const z of [-0.12, 0.04, 0.16]) box(0.06, 0.02, 0.02, M.brass, 0.05, 0.12, z, open); }
    // the bunk room: three cots, the table of the notice, and nine pairs of boots against the wall (the roll book had eight names)
    for (const x of [-32.6, -28.4, -26.9]) put(P.bed({}, {}), x, -19.9, Math.PI / 2);
    put(P.table({}, 0.7, 0.5, 0.74, 0x4a3a2c), -27.6, -21.55);
    const rubber = mat(0x2a3530, { roughness: 0.55 }), leg = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.055, 0.34, 8), rubber, 18), foot = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.07, 0.24), rubber, 18);
    for (let i = 0; i < 18; i++) { const pair = Math.floor(i / 2), side = i % 2 ? 0.075 : -0.075, x = -33.7 + 0.08, z = -21.7 + pair * 0.36 + side; leg.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, 0.19, z)); foot.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x + 0.07, 0.035, z).multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2))); }
    leg.instanceMatrix.needsUpdate = foot.instanceMatrix.needsUpdate = true; leg.computeBoundingSphere(); foot.computeBoundingSphere(); leg.name = 'boots'; foot.name = 'boots-feet'; G.add(leg, foot);
    // a finger post where the old trail leaves the road (no writing, W: the map and the talk name it)
    { const f = named('trail-post'); f.position.set(-5.4, 0, -21.4); f.rotation.z = 0.13; box(0.1, 1.9, 0.1, M.bark, 0, 0.95, 0, f);
      const arm = named('trail-post-arm', f); arm.position.set(-0.07, 1.74, 0.03); arm.rotation.z = 1.18; box(0.8, 0.14, 0.04, M.weathered, -0.38, 0, 0, arm); cyl(0.012, 0.012, 0.06, M.iron, -0.02, 0, 0.02, 6, arm).rotation.x = Math.PI / 2; }   // 5.9: the arm hangs from its last nail
  }
  // ---------------------------------------------------------------- 5.7: the fire tower: a boarded base, two open floors, a roof with the alarm bell
  { const y1 = FY(1), y2 = FY(2), top = y2 + 2.7, x0 = -35.2, x1 = -32, z0 = -16.6, z1 = -13.4;
    world.group.traverse((o) => { if (o.isMesh && (/^wall:TOWER_[12]:/.test(o.name) || /^ceil:TOWER_[12]$/.test(o.name))) o.visible = false; });
    for (const x of [x0, x1]) for (const z of [z0, z1]) box(0.2, top, 0.2, M.bark, x, top / 2, z);
    for (const y of [y1, y2]) { box(3.5, 0.14, 0.14, M.weathered, -33.6, y, z0, G); box(3.5, 0.14, 0.14, M.weathered, -33.6, y, z1, G); box(0.14, 0.14, 3.5, M.weathered, x0, y, -15, G); box(0.14, 0.14, 3.5, M.weathered, x1, y, -15, G); }
    // cross braces on the two open storeys of the south and north sides
    for (const [y, h] of [[y1 / 2, y1], [(y1 + y2) / 2, y2 - y1]]) for (const z of [z0, z1]) for (const s of [-1, 1]) { const b = box(Math.hypot(3.2, h), 0.08, 0.08, M.plank, -33.6, y, z + (z === z0 ? -0.1 : 0.1)); b.rotation.z = s * Math.atan2(h, 3.2); }
    for (const y of [y1, y2]) for (const [x, z, len, ry] of [[-33.6, z0 + 0.03, 3.2, 0], [-33.6, z1 - 0.03, 3.2, 0], [x0 + 0.03, -15, 3.2, Math.PI / 2], [x1 - 0.03, -15, 3.2, Math.PI / 2]]) { const r = E.railing({ len, h: 1.05, color: 0x4a4038 }); r.position.set(x, y, z); r.rotation.y = ry; G.add(r); }
    const rf = roofOn(x0, z0, x1, z1, top, { pitch: 0.5 }); rf.name = 'tower-roof';
    const b = cyl(0.11, 0.2, 0.32, M.brass, -34.7, y2 + 2.1, -16.1, 14); b.name = 'tower-bell'; box(0.03, 0.5, 0.03, M.iron, -34.7, y2 + 2.5, -16.1);
    // the tin board on its post at the east rail. It lives in a parent the reflector can hide while we look through its hole
    const board = named('board'); board.position.set(-32.42, y2, -15); api.parts.board = board;
    box(0.08, 1.5, 0.08, M.bark, 0, 0.75, 0, board);
    const tin = mat(0x7d7a6e, { metalness: 0.7, roughness: 0.42 });
    const whole = named('board_whole', board); box(0.03, 0.8, 0.8, tin, -0.06, 1.42, 0, whole); { const h = cyl(0.05, 0.05, 0.04, M.black, -0.06, 1.42, 0, 14, whole); h.rotation.z = Math.PI / 2; }
    const cracked = named('board_cracked', board); { const a = box(0.03, 0.8, 0.38, tin, -0.06, 1.42, -0.21, cracked); a.rotation.x = 0.06; const c = box(0.03, 0.74, 0.34, tin, -0.08, 1.38, 0.2, cracked); c.rotation.x = -0.18; }
    api.parts.sun = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xffb070, transparent: true, depthWrite: false, fog: false, map: (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), r = g.createRadialGradient(64, 64, 4, 64, 64, 64); r.addColorStop(0, 'rgba(255,240,205,1)'); r.addColorStop(0.3, 'rgba(255,170,96,.8)'); r.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })() }));
    api.parts.sun.position.set(-118, 24, -18); api.parts.sun.scale.set(46, 46, 1); api.parts.sun.visible = false; api.parts.sun.name = 'low-sun'; G.add(api.parts.sun);
  }

  // the amado's pull (the S_SHUTTER station) on the frame by the door
  box(0.07, 0.34, 0.09, M.iron, 1.4, balcY + 1.05, 19.13); box(0.16, 0.05, 0.05, M.iron, 1.4, balcY + 1.22, 19.13);
  // the stations that have a model here (telescope, radio, shelf, bell, crank box, car, phone, the hut floor, the amado pull): their
  // marker boxes are not drawn (G1: no plain boxes), they stay as the thing to select
  const unseen = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  // 山道の記録 (5.2): three cedars with an eye carved into the bark (the stations S_MARK1-3), the carving facing the path; each trunk
  // stands on its station, and the station box is wrapped round the trunk at eye height
  { const wood = mat(0xcaa47a, { roughness: 0.8 }), old = mat(0x6d6a4a, { roughness: 1 }), slit = mat(0x1a120c), cloth = mat(0xe8e4d8, { roughness: 1 });
    const MARKS = [{ id: 'S_MARK1', face: Math.PI / 2, kind: 'fresh' }, { id: 'S_MARK2', face: Math.PI / 2, kind: 'old' }, { id: 'S_MARK3', face: -Math.PI / 2, kind: 'cloth' }];
    for (const mk of MARKS) {
      const st = (plan.stations || []).find((x) => x.id === mk.id); if (!st) continue;
      const fx = Math.sin(mk.face), fz = Math.cos(mk.face), tx = st.x, tz = st.z;
      const g = named(`mark:${mk.id}`); g.position.set(tx, 0, tz); g.rotation.y = mk.face;
      cyl(0.36, 0.5, 10, M.bark, 0, 5, 0, 12, g);
      addCol(tx - 0.4, tz - 0.4, tx + 0.4, tz + 0.4, 0, 4);
      const eye = (y, sc, m) => { const e = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), m); e.scale.set(0.15 * sc, 0.3 * sc, 0.05); e.position.set(0, y, 0.47); g.add(e);
        box(0.025 * sc, 0.22 * sc, 0.03, slit, 0, y, 0.515, g); };
      if (mk.kind === 'old') { eye(1.75, 0.8, old); eye(1.2, 0.6, old); }
      else eye(1.55, 1, wood);
      if (mk.kind === 'cloth') { const band = cyl(0.42, 0.44, 0.22, cloth, 0, 1.05, 0, 14, g); band.castShadow = false; }
      // the station's box (kit: 0.9 x 1.1 x 0.5 on the ground) wraps the trunk from 0.8 to 1.9 m, so looking at the tree from any side selects it
      const sm = world.group.getObjectByName(`station:${mk.id}`);
      if (sm) { const was = new THREE.Box3().setFromObject(sm), c0 = was.getCenter(V3(0, 0, 0)); sm.position.y += 0.8; sm.scale.set(1.25, 1, 2.2); sm.updateMatrixWorld(true); for (const c of world.colliders) if (c.box && c.box.containsPoint(c0) && Math.abs(c.box.max.y - was.max.y) < 0.01) c.box.setFromObject(sm); }
    }
  }
  // 5.7: the cabinet on the wall and the board on the rail are at eye height: their station boxes go up with them
  for (const id of ['S_KEYBOX', 'S_REFLECT', 'S_BELL2']) { const sm = world.group.getObjectByName(`station:${id}`); if (!sm) continue; const was = new THREE.Box3().setFromObject(sm), c0 = was.getCenter(V3(0, 0, 0)); sm.position.y += 0.85; sm.updateMatrixWorld(true); for (const c of world.colliders) if (c.box && c.box.containsPoint(c0) && Math.abs(c.box.max.y - was.max.y) < 0.01) c.box.setFromObject(sm); }
  for (const id of ['S_TELESCOPE', 'S_SHUTTER', 'S_RADIO', 'S_SHELF', 'S_BELL', 'S_BELL2', 'S_CRANK', 'S_PHONE', 'S_GATE', 'S_CAR', 'S_MARK1', 'S_MARK2', 'S_MARK3', 'S_DIARY', 'S_KEYBOX', 'S_REFLECT']) {
    const m = world.group.getObjectByName(`station:${id}`); if (!m) continue;
    m.traverse((o) => { if (o.isMesh) o.material = unseen; });
  }

  // the outside of the walls (W1): weathered boards on every face that looks out (after the recipes painted the rooms)
  api.ready = Promise.all([texReady.then(() => dressOuterWalls(ctx, M.weathered)).catch(() => 0), agedWood]);
  api.update = (dt, t) => {
    const bdp = api.parts.balconyDoor; if (bdp) { bdp.t += ((bdp.door.isOpen ? 1 : 0) - bdp.t) * Math.min(1, dt * 3); bdp.leaf.position.x = -(bdp.W - 0.12) * bdp.t; }   // slides west, away from the amado
    const s = api.parts.shutter; if (s) { s.t += (s.target - s.t) * Math.min(1, dt * 1.6); s.leaf.position.x = 1.8 * (1 - s.t); }
    if (api.parts.carRing) api.parts.carRing.material.opacity = 0.22 + 0.2 * (0.5 + 0.5 * Math.sin(t * 3));
    if (api.parts.phoneScreen) { const on = Math.sin(t * 6) > -0.2; api.parts.phoneLight.intensity = on ? 1.4 : 0.2; api.parts.phoneScreen.material.color.setHex(on ? 0x9fd2ff : 0x223344); }
    if (api.parts.water) api.parts.water.material.opacity = 0.82 + Math.sin(t * 0.7) * 0.04;
    const fl = api.parts.flood; if (fl) {
      fl.t += (fl.target - fl.t) * Math.min(1, dt * 0.5); fl.tex.offset.x -= dt * 0.55;
      const w = api.parts.water; w.position.y = 0.012 + fl.t * 0.24; w.scale.y = 1 + fl.t * 0.32; M.water.color.copy(fl.dry).lerp(fl.wet, fl.t);
      fl.foam.position.y = w.position.y + 0.015; fl.foam.material.opacity = fl.t * 0.8;
      if (fl.gone) for (const b of fl.feet) if (b.visible) { b.position.y -= dt * 0.35; b.position.x += dt * 0.6; b.rotation.y += dt * 0.08; if (b.position.y < -0.75) b.visible = false; }   // sinking, pulled downstream
    }
    const uc = api.people.uncle; if (uc && uc.root.visible && uc.character.update) uc.character.update(dt);
  };
  return api;
}
