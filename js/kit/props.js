/* game-kit 1b8c7db: js/props.js — edit in game-kit and run tools/kit-sync.js */
// Procedural props. The general helpers and the desk / locker / telephone / bin / cardboard box are
// reused from みる風車 (game-miru-fusha, js/props.js); the office furniture below them (steel desk,
// chairs, shelves, monitor, printer, vending machine, ...) was added for the police station.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { bevelBox, boxFrom, localBox } from './prop-geo.js';
import { pm, propTextures } from './prop-mats.js';
import { mergeProps } from './prop-batch.js';
import { vendingMachine as envVending } from './env-props.js';

// Merge all meshes of a group into one mesh per material (far fewer draw calls).
export function mergeByMaterial(group) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const buckets = new Map();
  group.traverse((o) => {
    if (!o.isMesh) return;
    const geo = o.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    const g2 = geo.index ? geo.toNonIndexed() : geo;
    // keep `color`: the kit props carry baked AO in it and their materials use vertexColors (without the
    // attribute they would render black)
    for (const k of Object.keys(g2.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g2.deleteAttribute(k);
    if (!g2.attributes.uv) g2.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g2.attributes.position.count * 2), 2));
    if (!buckets.has(o.material)) buckets.set(o.material, []);
    buckets.get(o.material).push(g2);
  });
  const out = new THREE.Group();
  for (const [mat, list] of buckets) {
    if (list.some((g) => g.attributes.color) && !list.every((g) => g.attributes.color && g.attributes.color.itemSize === 3))
      for (const g of list) if (!g.attributes.color || g.attributes.color.itemSize !== 3) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
    out.add(new THREE.Mesh(mergeGeometries(list), mat));
  }
  return out;
}

const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...o });

// 2026-10 brush-up (see README「小物・家具・環境の部品」): every box is a bevelBox (edges that catch the light,
// UVs in metres so a texture keeps its size on every face), materials come from prop-mats.js when the game
// passes no texture (detail, normal and roughness maps), and builders merge with baked vertex AO and set
// userData.colliders. Sizes, origins, facing and the drawer / door userData are unchanged.
const bb = (w, h, d, r = 0.004, seg = 1) => bevelBox(w, h, d, { r, seg });
// the game's texture T[key] when it has one (plus the kit's normal map for relief), else the kit material
function TM(T, key, kind, color, o = {}) {
  if (T && T[key]) return M(color, { map: T[key], normalMap: propTextures(kind).normalMap || null, ...o });
  const { roughness, side } = o;
  // painted steel is a painted (dielectric) surface: the old metalness 0.3-0.35 made it read dark grey
  const metalness = kind === 'paint' && o.metalness !== undefined ? Math.min(o.metalness, 0.12) : o.metalness;
  return pm(kind, color, Object.fromEntries(Object.entries({ roughness, metalness, side }).filter(([, v]) => v !== undefined)));
}
// kind: what the layout checker (layout-rules.js) and the games call it; every prop faces +z
const finish = (g, colliders, kind) => {
  g.userData.colliders = colliders || [localBox(g)];
  const out = mergeProps(g, { ao: true });
  if (kind) out.userData.kind = kind;
  return out;
};

function add(group, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  group.add(m);
  return m;
}

// Wooden desk with legs and a drawer that opens (2026-11-01: it was a solid box). Origin = floor centre, front = +z.
// userData.drawers = [{ obj, kind: 'drawer', travel }] (openables.js; plan.furniture with recipes.openables opens it with [E]).
export function desk(T, w = 1.4, d = 0.7, h = 0.76) {
  const g = new THREE.Group();
  const wood = TM(T, 'wood', 'wood', 0x6a4a30);
  const dark = TM(T, 'wood', 'wood', 0x3a2818);
  add(g, bb(w, 0.05, d, 0.012, 2), wood, 0, h - 0.025, 0);
  for (const [x, z] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ])
    add(g, bb(0.05, h - 0.05, 0.05), dark, x * (w / 2 - 0.05), (h - 0.05) / 2, z * (d / 2 - 0.05));
  // the drawer case under the top: sides, bottom and back (hollow, so the drawer slides out of it)
  const cw = w * 0.4, cx = w * 0.22, ch = 0.16, cd = d - 0.1;
  for (const sx of [-1, 1]) add(g, bb(0.015, ch, cd), wood, cx + sx * (cw / 2 - 0.0075), h - 0.05 - ch / 2, 0);
  add(g, bb(cw, 0.012, cd), wood, cx, h - 0.05 - ch + 0.006, 0);
  add(g, bb(cw, ch, 0.012), wood, cx, h - 0.05 - ch / 2, -cd / 2 + 0.006);
  add(g, bb(w - 0.1, 0.3, 0.02), dark, 0, h - 0.25, -d / 2 + 0.04); // modesty panel
  const out = finish(g, [boxFrom(w, h, d)], 'desk');
  const dr = drawer(cw - 0.034, ch - 0.02, cd - 0.05, wood, pm('steel', 0xb0a080));
  dr.position.set(cx, h - 0.05 - ch / 2, cd / 2 + 0.01);
  dr.userData.keep = true;
  out.add(dr);
  out.userData.drawers = [{ obj: dr, kind: 'drawer', travel: cd * 0.65 }];
  return out;
}

// Steel locker with vents, handle and number plate; the door opens on its hinge. o.hinge: 'left' (default,
// the left edge seen from the front) | 'right' — pick the side with room to swing (layout-rules.js pickHinge:
// a door that opens against a wall or a neighbour's open door does not open at all). The hinge group is
// userData.keep, so level merges (render-assets mergeStatic, prop-batch mergePlaced) leave it movable;
// before 2026-10-17 it was merged into the room and the door could never open.
// userData.drawers = [{ obj: hinge, kind: 'locker', angle, hinge }] (openables.js opens it).
export function locker(T, color = 0x4a4e52, h = 1.85, o = {}) {
  const g = new THREE.Group();
  const body = TM(T, 'metal', 'paint', color, { metalness: 0.35 });
  const dark = M(0x15171a);
  const inner = M(0x2c2e30, { roughness: 0.9 });
  // hollow steel case
  add(g, bb(0.02, h, 0.48), body, -0.28, h / 2, 0);
  add(g, bb(0.02, h, 0.48), body, 0.28, h / 2, 0);
  add(g, bb(0.58, h, 0.02), inner, 0, h / 2, -0.23);
  add(g, bb(0.58, 0.02, 0.48), body, 0, h - 0.01, 0);
  add(g, bb(0.58, 0.05, 0.48), body, 0, 0.025, 0);
  add(g, bb(0.54, 0.015, 0.44), inner, 0, h - 0.3, 0); // hat shelf
  add(g, new THREE.CylinderGeometry(0.008, 0.008, 0.5), pm('steel', 0xa8a8a0), 0, h - 0.4, 0, 0, 0, Math.PI / 2); // hanger rail
  const out = finish(g, [boxFrom(0.6, h, 0.5)], 'locker');
  const right = o.hinge === 'right';
  const side = right ? 1 : -1;
  // the door on its hinge; vents, handle (on the free edge), number plate
  const hinge = new THREE.Group();
  hinge.name = 'lockerHinge';
  hinge.userData.keep = true;
  hinge.position.set(side * 0.29, 0, 0.245);
  const door = new THREE.Group();
  door.position.x = -side * 0.29;
  hinge.add(door);
  add(door, bb(0.58, h - 0.02, 0.02), body, 0, h / 2, 0);
  for (let i = 0; i < 5; i++) add(door, bb(0.3, 0.015, 0.01, 0), dark, 0, h - 0.18 - i * 0.04, 0.012);
  for (let i = 0; i < 5; i++) add(door, bb(0.3, 0.015, 0.01, 0), dark, 0, 0.3 + i * 0.04, 0.012);
  add(door, bb(0.03, 0.14, 0.03), pm('steel', 0xb0b0a8), -side * 0.2, h * 0.55, 0.02);
  add(door, bb(0.12, 0.05, 0.01), M(0xd8d0b0), 0, h - 0.4, 0.012);
  const doorMesh = mergeProps(door);
  doorMesh.position.copy(door.position);
  hinge.remove(door);
  hinge.add(doorMesh);
  out.add(hinge);
  // 100 degrees: past that the door of a locker in a row runs into the neighbour's open door
  const open = o.angle ?? 1.75;
  out.userData.drawers = [{ obj: hinge, kind: 'locker', angle: side * open, hinge: right ? 'right' : 'left' }];
  out.userData.door = { w: 0.58, hinge: right ? 'right' : 'left', open };
  return out;
}

// Upright fridge (家庭用・業務用): a freezer door on top and the fridge door below, on the same hinge side;
// handles on the free edge. Origin = floor centre, front = +z; stand it with its back to a wall (5 cm gap
// for the coils) and the hinge on the side nearer a wall or a neighbour (layout-rules.js pickHinge).
// o: { w: 0.68, h: 1.8, d: 0.68, hinge: 'left' | 'right', color, freezer: true, angle: 1.75 }
// userData.drawers = the doors' hinge groups (userData.keep: never merged); userData.door for layout-rules.js.
export function fridge(T, o = {}) {
  const w = o.w ?? 0.68;
  const h = o.h ?? 1.8;
  const d = o.d ?? 0.68;
  const g = new THREE.Group();
  const body = TM(T, 'metal', 'paint', o.color ?? 0xe4e4de, { metalness: 0.1, roughness: 0.45 });
  const inner = M(0xf2f2ee, { roughness: 0.6 });
  const dark = M(0x2a2c2e, { roughness: 0.8 });
  const t = 0.04; // the doors' thickness
  const cd = d - t; // the cabinet behind the doors
  const cz = -t / 2;
  // a hollow cabinet: sides, back, top, plinth, the divider and glass shelves
  add(g, bb(0.03, h, cd), body, -w / 2 + 0.015, h / 2, cz);
  add(g, bb(0.03, h, cd), body, w / 2 - 0.015, h / 2, cz);
  add(g, bb(w, h, 0.03), body, 0, h / 2, cz - cd / 2 + 0.015);
  add(g, bb(w, 0.03, cd), body, 0, h - 0.015, cz);
  add(g, bb(w, 0.08, cd), dark, 0, 0.04, cz);
  const split = o.freezer === false ? 0 : h * 0.66;
  if (split) add(g, bb(w - 0.06, 0.04, cd - 0.03), inner, 0, split, cz);
  for (const y of [0.45, 0.8, split ? split - 0.3 : 1.25]) add(g, bb(w - 0.07, 0.008, cd - 0.08), pm('glass', 0xdde6e8), 0, y, cz);
  const out = finish(g, [boxFrom(w, h, d)], 'fridge');
  const right = o.hinge === 'right';
  const side = right ? 1 : -1;
  const open = o.angle ?? 1.75;
  const handle = pm('steel', 0xb8b8b0);
  out.userData.drawers = [];
  const doors = split ? [[0.09, split - 0.01], [split + 0.01, h - 0.01]] : [[0.09, h - 0.01]];
  for (const [y0, y1] of doors) {
    const hinge = new THREE.Group();
    hinge.name = 'fridgeHinge';
    hinge.userData.keep = true;
    hinge.position.set(side * (w / 2), 0, d / 2 - t);
    const leaf = new THREE.Group();
    const dh = y1 - y0;
    add(leaf, bb(w, dh, t, 0.01, 2), body, -side * (w / 2), y0 + dh / 2, t / 2);
    add(leaf, bb(w - 0.08, dh - 0.08, 0.03), inner, -side * (w / 2), y0 + dh / 2, -0.015); // the inner liner
    const hl = Math.min(0.5, dh - 0.2);
    const hy = dh > 0.8 ? y1 - 0.15 - hl : y0 + 0.08;
    add(leaf, bb(0.025, hl, 0.03), handle, -side * (w - 0.05), hy + hl / 2, t + 0.02);
    hinge.add(mergeProps(leaf));
    out.add(hinge);
    out.userData.drawers.push({ obj: hinge, kind: 'door', angle: side * open, hinge: right ? 'right' : 'left' });
  }
  out.userData.door = { w, hinge: right ? 'right' : 'left', open };
  return out;
}

// ---------------------------------------------------------------------------
// Small textured devices (no bare boxes)
// ---------------------------------------------------------------------------
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  return t;
}

// Old black desk telephone: body, rotary dial, handset on its cradle and a coiled cord.
export function phone() {
  const g = new THREE.Group();
  const black = M(0x161616, { roughness: 0.35 });
  const body = add(g, new THREE.CylinderGeometry(0.09, 0.12, 0.08, 16), black, 0, 0.04, 0);
  body.scale.z = 0.85;
  const dialTex = canvasTex(64, 64, (c, w, h) => {
    c.fillStyle = '#d8d2c0';
    c.beginPath();
    c.arc(32, 32, 30, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#161616';
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI * 0.3 + (i / 10) * Math.PI * 1.6;
      c.beginPath();
      c.arc(32 + Math.cos(a) * 21, 32 + Math.sin(a) * 21, 5, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = '#a03030';
    c.beginPath();
    c.arc(32, 32, 9, 0, Math.PI * 2);
    c.fill();
  });
  add(g, new THREE.CylinderGeometry(0.05, 0.05, 0.01, 20), new THREE.MeshStandardMaterial({ map: dialTex, roughness: 0.5 }), 0, 0.085, 0.03, 0.35, 0, 0);
  // handset
  add(g, new THREE.CapsuleGeometry(0.018, 0.16, 4, 8), black, 0, 0.12, -0.03, 0, 0, Math.PI / 2);
  for (const x of [-0.09, 0.09]) add(g, new THREE.CylinderGeometry(0.03, 0.026, 0.035, 12), black, x, 0.105, -0.03);
  // cord
  const pts = [];
  for (let i = 0; i < 40; i++)
    pts.push(new THREE.Vector3(-0.12 - i * 0.004 + Math.cos(i * 1.4) * 0.008, 0.04 - i * 0.0008 + Math.sin(i * 1.4) * 0.008, -0.03 + i * 0.004));
  add(g, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.004, 4), black);
  return g;
}

// Waste bins. 'office': a small perforated steel basket with crumpled paper; 'station': a two-bay
// sorting bin with lids and printed labels (corridor).
export function trashBin(kind = 'office') {
  const g = new THREE.Group();
  if (kind === 'office') {
    const mesh = canvasTex(64, 64, (c, w, h) => {
      c.fillStyle = '#4a4e50';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#000';
      for (let y = 4; y < h; y += 8) for (let x = (y / 8) % 2 ? 4 : 0; x < w; x += 8) c.fillRect(x, y, 4, 4);
    });
    mesh.wrapS = mesh.wrapT = THREE.RepeatWrapping;
    mesh.repeat.set(6, 3);
    const steel = new THREE.MeshStandardMaterial({ map: mesh, alphaMap: mesh, alphaTest: 0.3, side: THREE.DoubleSide, metalness: 0.5, roughness: 0.5, color: 0x9a9e9c });
    add(g, new THREE.CylinderGeometry(0.15, 0.12, 0.3, 20, 1, true), steel, 0, 0.15, 0);
    add(g, new THREE.CylinderGeometry(0.12, 0.12, 0.01, 20), M(0x4a4e50, { metalness: 0.5 }), 0, 0.005, 0);
    add(g, new THREE.TorusGeometry(0.15, 0.008, 6, 24), pm('steel', 0x6a6e6c), 0, 0.3, 0, Math.PI / 2);
    const paper = [M(0xe8e4d8, { roughness: 1 }), M(0xd8cdb0, { roughness: 1 }), M(0xc8d0d8, { roughness: 1 })];
    for (let i = 0; i < 6; i++) {
      const ball = new THREE.IcosahedronGeometry(0.045 + (i % 3) * 0.01, 1);
      const p = ball.attributes.position;
      for (let k = 0; k < p.count; k++) p.setXYZ(k, p.getX(k) * (0.8 + ((k * 37) % 10) / 25), p.getY(k) * (0.8 + ((k * 53) % 10) / 25), p.getZ(k) * (0.8 + ((k * 71) % 10) / 25));
      ball.computeVertexNormals();
      add(g, ball, paper[i % 3], Math.cos(i * 2.1) * 0.06, 0.12 + i * 0.03, Math.sin(i * 2.1) * 0.06, i, i * 0.7, 0);
    }
    return g;
  }
  const body = M(0x8a9294, { metalness: 0.35, roughness: 0.5 });
  const label = (text, col) =>
    new THREE.MeshStandardMaterial({
      map: canvasTex(128, 64, (c, w, h) => {
        c.fillStyle = col;
        c.fillRect(0, 0, w, h);
        c.fillStyle = '#fff';
        c.font = 'bold 26px sans-serif';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(text, w / 2, h / 2 + 1);
      }),
      roughness: 0.6,
    });
  [
    ['可燃', '#b03028'],
    ['缶・びん', '#2a5a9a'],
  ].forEach(([t, col], i) => {
    const x = (i - 0.5) * 0.42;
    add(g, bb(0.4, 0.78, 0.36), body, x, 0.39, 0);
    add(g, bb(0.42, 0.04, 0.38), M(0x3a3e40, { metalness: 0.4 }), x, 0.8, 0);
    add(g, i ? new THREE.CylinderGeometry(0.06, 0.06, 0.042, 16) : bb(0.24, 0.042, 0.06), M(0x0c0c0c), x, 0.802, i ? 0 : 0.05);
    add(g, new THREE.PlaneGeometry(0.3, 0.15), label(t, col), x, 0.62, 0.181);
  });
  return g;
}

// An open cardboard box: four walls and four flaps folded outwards.
export function cardboardBox(T, w = 0.5, h = 0.34, d = 0.4) {
  const g = new THREE.Group();
  const card = TM(T, 'fabric', 'cardboard', 0xb08a58, { roughness: 0.95, side: THREE.DoubleSide });
  const inside = M(0x7a5a38, { roughness: 1, side: THREE.DoubleSide });
  const t = 0.008;
  add(g, bb(w, t, d), inside, 0, t / 2, 0);
  add(g, bb(w, h, t), card, 0, h / 2, d / 2);
  add(g, bb(w, h, t), card, 0, h / 2, -d / 2);
  add(g, bb(t, h, d), card, w / 2, h / 2, 0);
  add(g, bb(t, h, d), card, -w / 2, h / 2, 0);
  // flaps hinged on the top edges, folded open (one bent half up)
  const flap = (len, wid, x, z, ry, tilt) => {
    const hinge = new THREE.Group();
    hinge.position.set(x, h, z);
    hinge.rotation.order = 'YXZ';
    hinge.rotation.set(tilt, ry, 0);
    g.add(hinge);
    add(hinge, bb(wid, t, len), card, 0, 0, len / 2);
  };
  flap(d / 2, w, 0, d / 2, 0, 0.5);
  flap(d / 2, w, 0, -d / 2, Math.PI, 0.35);
  flap(w / 2, d, w / 2, 0, Math.PI / 2, 0.7);
  flap(w / 2, d, -w / 2, 0, -Math.PI / 2, -0.9);
  // packing tape strip and a printed label
  add(g, bb(0.06, h * 0.7, 0.002), M(0xc8b890, { roughness: 0.4 }), 0, h * 0.65, d / 2 + 0.005);
  return g;
}

// ---- police station furniture -------------------------------------------------------------------

// Grey steel office desk with a side drawer unit. Origin = floor centre; the sitter is on the -z side
// (where the chairs are placed), the modesty panel on +z.
export function steelDesk(T, w = 1.4, d = 0.7, h = 0.72) {
  const g = new THREE.Group();
  const top = TM(T, 'metal', 'paint', 0x8a8c84, { metalness: 0.2, roughness: 0.6 });
  const body = TM(T, 'metal', 'paint', 0x9a9c94, { metalness: 0.3, roughness: 0.55 });
  const lino = T.deskTop ? M(0xffffff, { map: T.deskTop, roughness: 0.5 }) : M(0x4c5a52, { roughness: 0.5 });
  add(g, bb(w, 0.035, d, 0.008, 2), lino, 0, h - 0.018, 0);
  add(g, bb(w, 0.04, d), top, 0, h - 0.055, 0);
  // the side drawer unit is a hollow case; its three drawers slide out (see World.openable)
  const ux = w / 2 - 0.23;
  const uh = h - 0.08;
  const ud = d - 0.04;
  add(g, bb(0.02, uh, ud), body, ux - 0.2, uh / 2, 0);
  add(g, bb(0.02, uh, ud), body, ux + 0.2, uh / 2, 0);
  add(g, bb(0.42, uh, 0.02), body, ux, uh / 2, ud / 2 - 0.01);
  add(g, bb(0.42, 0.04, ud), body, ux, 0.02, 0);
  add(g, bb(0.03, h - 0.08, d - 0.04), body, -w / 2 + 0.03, (h - 0.08) / 2, 0);
  add(g, bb(w - 0.1, 0.3, 0.02), body, 0, h - 0.25, d / 2 - 0.03); // modesty panel (far side)
  const out = finish(g, [boxFrom(w, h, d)], 'desk');
  out.userData.front = -1; // the sitter's side (layout-rules.js: the strip in front must be free)
  const handle = pm('steel', 0x3a3a3a);
  const dh = (uh - 0.06) / 3;
  out.userData.drawers = [];
  for (let i = 0; i < 3; i++) {
    const dr = drawer(0.38, dh - 0.01, ud - 0.06, body, handle);
    dr.position.set(ux, uh - (i + 0.5) * dh, -d / 2 + 0.01);
    dr.rotation.y = Math.PI; // the drawers face the person sitting at the desk (-z, where the chairs are)
    dr.userData.keep = true; // moves: level merges leave it out
    out.add(dr);
    out.userData.drawers.push({ obj: dr, kind: 'drawer', travel: -ud * 0.6 });
  }
  return out;
}

// A drawer: front panel with a pull, and an open tray behind it. Origin = centre of the front face.
function drawer(w, h, depth, mat, handleMat) {
  const g = new THREE.Group();
  add(g, bb(w, h, 0.02), mat, 0, 0, -0.01);
  add(g, bb(w * 0.32, 0.018, 0.025), handleMat, 0, h * 0.18, 0.012);
  const tray = M(0x55585a, { roughness: 0.8 });
  const th = h * 0.8;
  add(g, bb(w - 0.02, 0.01, depth), tray, 0, -h / 2 + 0.02, -depth / 2 - 0.02);
  add(g, bb(0.01, th, depth), tray, -w / 2 + 0.015, -h / 2 + 0.02 + th / 2, -depth / 2 - 0.02);
  add(g, bb(0.01, th, depth), tray, w / 2 - 0.015, -h / 2 + 0.02 + th / 2, -depth / 2 - 0.02);
  add(g, bb(w - 0.02, th, 0.01), tray, 0, -h / 2 + 0.02 + th / 2, -depth - 0.02);
  // a few sheets / a folder inside so an open drawer is not empty
  add(g, bb(w * 0.7, 0.02, depth * 0.6), M(0xd8d2c0, { roughness: 1 }), 0, -h / 2 + 0.04, -depth * 0.5);
  return mergeProps(g); // one or two draw calls per drawer instead of seven
}

// Plain table (interrogation room, evidence room). Origin = floor centre.
export function table(T, w = 1.2, d = 0.8, h = 0.72, color = 0x7a756a) {
  const g = new THREE.Group();
  const top = TM(T, 'wood', 'wood', color, { roughness: 0.7 });
  const leg = M(0x404040, { metalness: 0.5, roughness: 0.5 });
  add(g, bb(w, 0.04, d, 0.012, 2), top, 0, h - 0.02, 0);
  for (const [x, z] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ])
    add(g, new THREE.CylinderGeometry(0.02, 0.02, h - 0.04, 8), leg, x * (w / 2 - 0.06), (h - 0.04) / 2, z * (d / 2 - 0.06));
  return finish(g, null, 'table');
}

// A round bar from point a to point b ([x, y, z]); used for chair legs and frames so the ends land
// exactly where they should (a leg touches the floor at y = 0 and meets the seat under its corner).
function strut(group, a, b, r, mat, seg = 8) {
  const A = new THREE.Vector3(...a);
  const B = new THREE.Vector3(...b);
  const len = A.distanceTo(B);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), mat);
  m.position.copy(A).add(B).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  group.add(m);
  return m;
}

// Seat height (top of the seat) of the chairs below, in metres. A person built with
// buildPerson({ pose: 'sit', seatH }) at the chair's origin and rotation sits on it.
export const SEAT_H = { pipeChair: 0.47, officeChair: 0.47, woodenChair: 0.45, bed: 0.5 };

// Folding steel chair. Origin = floor centre under the seat; faces +z (the backrest is on -z).
// Two raked rear posts run from the floor to the top of the backrest, the front legs end under the
// front corners of the seat, side rails and stretchers tie them together.
export function pipeChair(color = 0x6a6e70) {
  const g = new THREE.Group();
  const pipe = pm('steel', 0xa8aaa8);
  const seat = M(color, { roughness: 0.6 });
  const r = 0.012;
  const sx = 0.195; // the frame runs along the sides of the seat
  add(g, bb(0.42, 0.035, 0.4), seat, 0, 0.4525, 0); // top at SEAT_H.pipeChair
  // rear posts: floor (z -0.19) -> top of the backrest (z -0.235), a little rake
  const rear = (y) => -0.19 - (0.045 * y) / 0.88;
  for (const x of [-sx, sx]) {
    strut(g, [x, 0, rear(0)], [x, 0.88, rear(0.88)], r, pipe);
    strut(g, [x, 0, 0.19], [x, 0.435, 0.175], r, pipe); // front leg, under the seat's front corner
    strut(g, [x, 0.425, rear(0.425)], [x, 0.425, 0.175], r, pipe); // side rail under the seat
  }
  for (const [y, z0, z1] of [
    [0.12, rear(0.12), rear(0.12)],
    [0.12, 0.186, 0.186],
  ])
    strut(g, [-sx, y, z0], [sx, y, z1], r * 0.8, pipe); // stretchers between the legs
  // the backrest panel rides on the front of the rear posts, tilted with them
  const back = add(g, bb(0.4, 0.2, 0.025), seat, 0, 0.76, rear(0.76) + r + 0.0125);
  back.rotation.x = -Math.atan2(0.045, 0.88);
  return finish(g, null, 'chair');
}

// textures for the furniture that is built without T (a game may call this once; optional)
let PT = {};
export function setPropTextures(T) {
  PT = T || {};
}

// Office chair on five castors. Origin = floor centre under the seat; faces +z (backrest on -z).
export function officeChair() {
  const g = new THREE.Group();
  const black = PT.chairFabric ? M(0x5a5c60, { map: PT.chairFabric, roughness: 0.9 }) : pm('fabric', 0x3a3c40);
  const metal = pm('steel', 0x777777);
  const plastic = M(0x1a1a1c, { roughness: 0.5 });
  add(g, bb(0.47, 0.08, 0.45, 0.025, 2), black, 0, 0.43, 0); // cushion, top at SEAT_H.officeChair
  add(g, bb(0.4, 0.03, 0.34), plastic, 0, 0.375, 0); // seat pan / mechanism
  // backrest on a spine that comes out from under the seat
  const tilt = -0.1;
  const back = add(g, bb(0.44, 0.46, 0.06, 0.025, 2), black, 0, 0.79, -0.25);
  back.rotation.x = tilt;
  strut(g, [0, 0.375, -0.12], [0, 0.375, -0.25], 0.02, plastic);
  strut(g, [0, 0.365, -0.25], [0, 0.59, -0.25 + 0.03], 0.02, plastic);
  // gas lift column from the hub to the seat pan
  strut(g, [0, 0.09, 0], [0, 0.36, 0], 0.026, metal, 12);
  add(g, new THREE.CylinderGeometry(0.05, 0.06, 0.05, 12), plastic, 0, 0.1, 0);
  // five arms sloping down to the castors; each castor wheel touches the floor
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const ex = Math.sin(a) * 0.29;
    const ez = Math.cos(a) * 0.29;
    strut(g, [0, 0.1, 0], [ex, 0.075, ez], 0.016, plastic, 6);
    strut(g, [ex, 0.075, ez], [ex, 0.05, ez], 0.008, metal, 6); // castor stem
    const wheel = add(g, new THREE.CylinderGeometry(0.025, 0.025, 0.022, 10), plastic, ex, 0.025, ez);
    wheel.rotation.set(0, a, Math.PI / 2);
  }
  return finish(g, null, 'chair');
}

// Open steel shelving with binders / boxes. Origin = floor centre, front = +z.
export function shelf(T, w = 1.8, h = 2.0, d = 0.45, seed = 1, fill = 'binders') {
  const g = new THREE.Group();
  const steel = TM(T, 'metal', 'paint', 0x7c8078, { metalness: 0.35, roughness: 0.55 });
  for (const x of [-w / 2 + 0.02, w / 2 - 0.02])
    for (const z of [-d / 2 + 0.02, d / 2 - 0.02]) add(g, bb(0.035, h, 0.035), steel, x, h / 2, z);
  const levels = 5;
  let s = seed;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const colors = [0x2f4a6a, 0x6a2f2f, 0x2f5a3a, 0x8a7a50, 0x3a3a3a, 0xc8c0a8];
  const mats = colors.map((c) => M(c, { roughness: 0.8 }));
  const card = TM(T, 'fabric', 'cardboard', 0xa88458, { roughness: 0.95 });
  for (let i = 0; i < levels; i++) {
    const y = 0.08 + (i * (h - 0.1)) / (levels - 1);
    add(g, bb(w, 0.025, d), steel, 0, y, 0);
    if (i === levels - 1) continue;
    let x = -w / 2 + 0.06;
    while (x < w / 2 - 0.12) {
      if (fill === 'boxes') {
        const bw = 0.32 + r() * 0.08;
        if (x + bw > w / 2 - 0.05) break;
        add(g, bb(bw, 0.26, d - 0.08), card, x + bw / 2, y + 0.14, 0);
        x += bw + 0.04;
      } else {
        const bw = 0.05 + r() * 0.03;
        const bh = 0.26 + r() * 0.08;
        add(g, bb(bw, bh, d - 0.12, 0), mats[Math.floor(r() * mats.length)], x + bw / 2, y + bh / 2 + 0.013, 0, 0, 0, r() < 0.08 ? 0.2 : 0);
        x += bw + 0.005;
        if (r() < 0.06) x += 0.12;
      }
    }
  }
  return finish(g, null, 'shelf');
}

// Filing cabinet (four drawers, or two when low). Origin = floor centre, front = +z.
export function filingCabinet(T, h = 1.3) {
  const g = new THREE.Group();
  const body = TM(T, 'metal', 'paint', 0x8e938a, { metalness: 0.35, roughness: 0.5 });
  const handle = pm('steel', 0x333333);
  const n = h > 1 ? 4 : 2;
  // hollow case: sides, back, top, bottom (the drawers fill the front)
  add(g, bb(0.02, h, 0.62), body, -0.225, h / 2, 0);
  add(g, bb(0.02, h, 0.62), body, 0.225, h / 2, 0);
  add(g, bb(0.47, h, 0.02), body, 0, h / 2, -0.3);
  add(g, bb(0.47, 0.02, 0.62), body, 0, h - 0.01, 0);
  add(g, bb(0.47, 0.04, 0.62), body, 0, 0.02, 0);
  const out = finish(g, null, 'cabinet');
  const dh = (h - 0.06) / n;
  out.userData.drawers = [];
  for (let i = 0; i < n; i++) {
    const dr = drawer(0.43, dh - 0.008, 0.52, body, handle);
    dr.position.set(0, h - 0.02 - (i + 0.5) * dh, 0.31);
    dr.userData.keep = true;
    out.add(dr);
    out.userData.drawers.push({ obj: dr, kind: 'drawer', travel: 0.4 });
  }
  return out;
}

// A room's big fixture (standard 1.13, 五人分の朝: 「各部屋が似通っていて分かりずらい。大きな特徴をみんなつける」). Origin = floor centre, front = +z, L = the length along x.
export function washerRow(L = 3) {
  const g = new THREE.Group(), white = pm('paint', 0xeeeeea), steel = pm('steel', 0xb9c1c3), dark = pm('steel', 0x1d2224);
  const glass = M(0x2c3f44, { roughness: 0.08, metalness: 0.3 });
  const n = Math.max(1, Math.round(L)), cw = L / n;
  for (let i = 0; i < n; i++) {
    const x = -L / 2 + cw * (i + 0.5);
    add(g, bb(cw - 0.06, 1.15, 0.7), white, x, 0.575, 0);
    add(g, new THREE.CylinderGeometry(0.3, 0.3, 0.05, 24), steel, x, 0.6, 0.36, Math.PI / 2);
    add(g, new THREE.CylinderGeometry(0.23, 0.23, 0.06, 24), glass, x, 0.6, 0.38, Math.PI / 2);
    add(g, new THREE.CylinderGeometry(0.05, 0.05, 0.04, 12), dark, x + cw * 0.3, 1.0, 0.36, Math.PI / 2);
  }
  return finish(g, null, 'washer');
}
function rack(g, L, H, levels, D, post) {
  for (const s of [-1, 1]) add(g, bb(0.04, H, D), post, s * (L / 2 - 0.02), H / 2, 0);
  for (let j = 0; j <= levels; j++) add(g, bb(L, 0.03, D), post, 0, 0.08 + (j * (H - 0.1)) / levels, 0);
}
/** steel shelves of box files: the same spines row on row, a white label on each */
export function fileRack(L = 2.4, H = 2.1) {
  const g = new THREE.Group(), steel = pm('steel', 0xb9c1c3), grey = M(0x77808a, { roughness: 0.9 }), tan = M(0xa18f6c, { roughness: 0.9 }), label = M(0xeeeeea, { roughness: 0.9 }), levels = 5;
  rack(g, L, H, levels, 0.5, steel);
  for (let j = 0; j < levels; j++) {
    const y = 0.1 + (j * (H - 0.1)) / levels;
    let i = 0;
    for (let x = -L / 2 + 0.12; x < L / 2 - 0.08; x += 0.115, i++) {
      add(g, bb(0.1, 0.3, 0.3, 0), (i + j * 3) % 7 ? grey : tan, x, y + 0.16, 0.05);
      add(g, bb(0.07, 0.1, 0.004, 0), label, x, y + 0.19, 0.203);
    }
  }
  return finish(g, null, 'shelf');
}
/** wooden shelves stacked with folded white sheets */
export function linenRack(L = 2.4, H = 2.1) {
  const g = new THREE.Group(), wood = pm('wood', 0x8a6a48), white = M(0xeeeeea, { roughness: 0.95 }), cream = M(0xe6dfcc, { roughness: 0.95 }), levels = 4;
  rack(g, L, H, levels, 0.5, wood);
  for (let j = 0; j < levels; j++) {
    const y = 0.1 + (j * (H - 0.1)) / levels;
    let i = 0;
    for (let x = -L / 2 + 0.25; x < L / 2 - 0.2; x += 0.42, i++) {
      const n = 3 + (i + j) % 3;
      for (let q = 0; q < n; q++) add(g, bb(0.36, 0.07, 0.38), (q + j) % 4 ? white : cream, x + 0.01 * (q % 2), y + 0.04 + q * 0.072, 0.02);
    }
  }
  return finish(g, null, 'shelf');
}
/** a steel wall of square cabinet doors, three high, with handles and card slots (cold rooms, lockers of a records office) */
export function bodyCabinets(L = 3) {
  const g = new THREE.Group(), steel = pm('steel', 0xb9c1c3), door = pm('steel', 0xc9d0d2), dark = pm('steel', 0x1d2224), card = M(0xeeeeea, { roughness: 0.9 });
  add(g, bb(L, 2.25, 0.6), steel, 0, 1.125, 0);
  const cols = Math.max(2, Math.round(L / 0.78)), cw = L / cols;
  for (let i = 0; i < cols; i++) for (let j = 0; j < 3; j++) {
    const x = -L / 2 + cw * (i + 0.5), y = 0.42 + j * 0.68;
    add(g, bb(cw - 0.06, 0.62, 0.02), door, x, y, 0.305);
    add(g, bb(0.2, 0.04, 0.05), dark, x + cw * 0.22, y, 0.33);
    add(g, bb(0.16, 0.07, 0.004, 0), card, x - cw * 0.2, y + 0.18, 0.317);
  }
  return finish(g, null, 'shelf');
}
/** a tall round tank with hoops and pipes up to the ceiling */
export function tank(r = 1.25, h = 2.5) {
  const g = new THREE.Group(), body = pm('paint', 0x6f7a6c), rust = M(0x6b4630, { roughness: 0.8 });
  add(g, new THREE.CylinderGeometry(r, r, h, 28), body, 0, h / 2, 0);
  for (const y of [0.16, 0.5, 0.84]) add(g, new THREE.TorusGeometry(r + 0.01, 0.035, 8, 36), rust, 0, y * h, 0, Math.PI / 2);
  add(g, new THREE.CylinderGeometry(0.11, 0.11, 0.6, 12), rust, r * 0.4, h + 0.3, -r * 0.24);
  add(g, new THREE.CylinderGeometry(0.08, 0.08, 0.6, 12), rust, -r * 0.32, h + 0.3, r * 0.32);
  return finish(g, null, 'cabinet');
}

// Flat monitor + keyboard; returns { group, screen } where screen is the emissive plane.
export function monitor(screenTex) {
  const g = new THREE.Group();
  const shell = M(0x1c1c1e, { roughness: 0.4 });
  add(g, bb(0.52, 0.34, 0.04), shell, 0, 0.3, 0);
  add(g, bb(0.06, 0.12, 0.05), shell, 0, 0.08, -0.02);
  add(g, bb(0.22, 0.015, 0.16), shell, 0, 0.008, -0.02);
  const screen = add(g, new THREE.PlaneGeometry(0.48, 0.3), new THREE.MeshBasicMaterial({ map: screenTex }), 0, 0.3, 0.021);
  add(g, bb(0.44, 0.02, 0.14), M(0x2a2a2c), 0, 0.01, 0.24);
  return { group: g, screen };
}

// Desktop laser printer with a paper tray.
export function printer() {
  const g = new THREE.Group();
  const shell = M(0xd8d6ce, { roughness: 0.5 });
  const dark = M(0x2a2a2a, { roughness: 0.6 });
  add(g, bb(0.42, 0.26, 0.4), shell, 0, 0.13, 0);
  add(g, bb(0.3, 0.02, 0.2), dark, 0, 0.265, -0.02);
  add(g, bb(0.28, 0.006, 0.16), M(0xf2f0e8), 0, 0.28, 0.02); // printed sheets on the output tray
  add(g, bb(0.06, 0.03, 0.01), M(0x30c060), 0.15, 0.2, 0.201);
  return g;
}

// Vending machine; the front picture is the generated vending-machine photo of みる風車 (T.vending).
// Since 2026-10 this is env-props.js vendingMachine(): a rounded cabinet with modelled bottles behind
// glass when there is no picture, buttons, slots and the pick-up flap. userData.front is still the display.
export function vendingMachine(T = {}) {
  return envVending({ front: T.vending || null });
}

// Pole coat rack with a coat on a hanger: shoulders, sleeves, lapels and an inner pocket.
// opts.envelope: a kraft envelope (with a red 親展 stamp) sticking out of the inner pocket;
// its local position is returned in g.userData.envelope.
export function coatRack(coatColor = 0x5a5c5a, opts = {}) {
  const g = new THREE.Group();
  const wood = M(0x3a2a1a, { roughness: 0.6 });
  add(g, new THREE.CylinderGeometry(0.02, 0.025, 1.75), wood, 0, 0.875, 0);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    add(g, new THREE.CylinderGeometry(0.012, 0.016, 0.38), wood, Math.cos(a) * 0.12, 0.08, Math.sin(a) * 0.12, Math.sin(a) * 1.25, 0, -Math.cos(a) * 1.25);
    add(g, new THREE.CylinderGeometry(0.008, 0.008, 0.12), wood, Math.cos(a) * 0.04, 1.72, Math.sin(a) * 0.04, Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9);
  }
  add(g, new THREE.SphereGeometry(0.03, 10, 8), wood, 0, 1.77, 0);
  // the coat hangs in front of the pole, facing +z
  const cloth = M(coatColor, { side: THREE.DoubleSide, roughness: 0.95 });
  const lining = M(0x4a3a30, { side: THREE.DoubleSide, roughness: 0.9 });
  const coat = new THREE.Group();
  coat.position.set(0, 0, 0.1);
  g.add(coat);
  add(coat, new THREE.TorusGeometry(0.17, 0.006, 6, 20, Math.PI), M(0x8a6a40), 0, 1.6, 0, 0, 0, 0); // hanger
  add(coat, new THREE.CylinderGeometry(0.004, 0.004, 0.12), pm('steel', 0x999999), 0, 1.68, 0);
  const shoulders = add(coat, new THREE.CapsuleGeometry(0.06, 0.3, 4, 10), cloth, 0, 1.58, 0, 0, 0, Math.PI / 2);
  shoulders.scale.set(1, 1, 0.7);
  const body = add(coat, new THREE.CylinderGeometry(0.19, 0.23, 0.9, 18, 1, true, 0.35, Math.PI * 2 - 0.7), cloth, 0, 1.12, 0); // open at the front
  body.scale.z = 0.5; // the gap in the cylinder (theta around 0) is the open front, facing +z
  const inside = add(coat, new THREE.CylinderGeometry(0.185, 0.225, 0.88, 18, 1, true), lining, 0, 1.12, -0.005);
  inside.scale.z = 0.47;
  for (const s of [-1, 1]) {
    const sl = add(coat, new THREE.CapsuleGeometry(0.045, 0.55, 4, 8), cloth, s * 0.22, 1.2, -0.01, 0, 0, s * 0.08);
    sl.scale.z = 0.8;
    // lapels: two flat strips forming a V
    add(coat, bb(0.07, 0.3, 0.012), cloth, s * 0.06, 1.42, 0.105, 0.08, 0, s * 0.35);
    add(coat, bb(0.035, 0.012, 0.03), M(0x1a1a1a), s * 0.05, 1.2 - (s + 1) * 0.08, 0.115); // buttons
  }
  add(coat, bb(0.12, 0.03, 0.06), cloth, 0, 1.6, -0.02); // collar
  if (opts.envelope) {
    const tex = canvasTex(128, 96, (c, w, h) => {
      c.fillStyle = '#b8955e';
      c.fillRect(0, 0, w, h);
      for (let i = 0; i < 600; i++) {
        c.fillStyle = `rgba(${90 + Math.random() * 60},${60 + Math.random() * 40},30,0.18)`;
        c.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1);
      }
      c.strokeStyle = 'rgba(70,45,20,0.6)';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(0, 2);
      c.lineTo(w / 2, h * 0.42);
      c.lineTo(w, 2);
      c.stroke();
      c.strokeStyle = '#b01e1e';
      c.lineWidth = 3;
      c.strokeRect(w * 0.62, h * 0.55, w * 0.3, h * 0.3);
      c.fillStyle = '#b01e1e';
      c.font = 'bold 15px serif';
      c.textAlign = 'center';
      c.fillText('親展', w * 0.77, h * 0.77);
      c.fillStyle = 'rgba(30,20,10,0.55)';
      c.fillRect(w * 0.08, h * 0.62, w * 0.4, 2);
      c.fillRect(w * 0.08, h * 0.72, w * 0.3, 2);
    });
    const env = new THREE.Group();
    add(env, bb(0.2, 0.14, 0.004), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }), 0, 0, 0);
    env.position.set(-0.05, 1.38, 0.118); // half out of the inner pocket, over the left lapel
    env.rotation.set(-0.15, 0.1, 0.32);
    coat.add(env);
    g.userData.envelope = new THREE.Vector3(-0.05, 1.38, 0.2);
  }
  return g;
}

// Standing ashtray (smoking room). The ash / sand disc sits 1 mm into the bowl and stands 4 mm over its rim (it was
// 0.5 mm over it and z-fought); userData.ashTop is its top, where butts lie (a butt's centre: ashTop + 0.0045).
export const ASHTRAY = { rim: 0.71, ashTop: 0.714 };
export function ashtrayStand() {
  const g = new THREE.Group();
  const metal = pm('steel', 0x8a8a86);
  add(g, new THREE.CylinderGeometry(0.03, 0.03, 0.66, 10), metal, 0, 0.33, 0);
  add(g, new THREE.CylinderGeometry(0.17, 0.2, 0.03, 18), metal, 0, 0.015, 0);
  add(g, new THREE.CylinderGeometry(0.17, 0.13, 0.06, 18), metal, 0, 0.68, 0);
  add(g, new THREE.CylinderGeometry(0.14, 0.14, 0.005, 18), M(0x6a6460, { roughness: 1 }), 0, ASHTRAY.ashTop - 0.0025, 0);
  g.userData.ashTop = ASHTRAY.ashTop;
  return g;
}

// A cigarette butt lying in the ashtray.
export function butt() {
  const g = new THREE.Group();
  add(g, new THREE.CylinderGeometry(0.0045, 0.0045, 0.03, 6), M(0xe8e0d0), 0, 0, 0, 0, 0, Math.PI / 2);
  add(g, new THREE.CylinderGeometry(0.0047, 0.0047, 0.012, 6), M(0xc88a40), 0.02, 0, 0, 0, 0, Math.PI / 2);
  return g;
}

// Fire extinguisher.
export function extinguisher() {
  const g = new THREE.Group();
  const red = M(0xb01818, { roughness: 0.35, metalness: 0.2 });
  add(g, new THREE.CylinderGeometry(0.08, 0.08, 0.5, 14), red, 0, 0.25, 0);
  add(g, new THREE.SphereGeometry(0.08, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), red, 0, 0.5, 0);
  add(g, bb(0.03, 0.08, 0.1), pm('steel', 0x222222), 0, 0.6, 0.02);
  return g;
}

// Reception counter for the lobby.
export function counter(T, w = 3) {
  const g = new THREE.Group();
  add(g, bb(w, 1.05, 0.6), TM(T, 'wood', 'wood', 0x8e8a7c, { roughness: 0.7 }), 0, 0.525, 0);
  add(g, bb(w + 0.1, 0.04, 0.75), M(0xcac6b6, { roughness: 0.4 }), 0, 1.07, 0.05);
  return finish(g, null, 'counter');
}

// Wooden crate fallback (when assets/models/crate.glb is missing).
export function crateBox(T) {
  const g = new THREE.Group();
  add(g, bb(0.6, 0.6, 0.6), TM(T, 'wood', 'wood', 0x8a6a40, { roughness: 0.8 }), 0, 0.3, 0);
  return g;
}

// ---- 2026-11-01: more standard furniture (the games built these themselves: cabinetWithDoors x4, bed x3, chair x3) ----
// Every opening part is its own entry of userData.drawers (recipes registers each one apart when there are several: one drawer
// of a tansu opens, not all of them). Origin = floor centre, front = +z, colliders in userData.colliders.

// Cabinet with hinged doors (戸棚 / 物入れ / 衣装棚 when tall). o: { w: 0.9, h: 1.8, d: 0.45, doors: 2 | 1, shelves: 3, color, wood: true, angle }
export function cabinet(T, o = {}) {
  const w = o.w ?? 0.9, h = o.h ?? 1.8, d = o.d ?? 0.45, n = o.doors ?? (w > 0.6 ? 2 : 1), wood = o.wood ?? true;
  const body = wood ? TM(T, 'wood', 'wood', o.color ?? 0x6a4c34) : TM(T, 'metal', 'paint', o.color ?? 0x8a8e88, { metalness: 0.3 });
  const inner = M(0x3a3430, { roughness: 0.9 }), handle = pm('steel', 0xa89a80);
  const g = new THREE.Group();
  for (const sx of [-1, 1]) add(g, bb(0.02, h, d), body, sx * (w / 2 - 0.01), h / 2, 0);
  add(g, bb(w, 0.02, d), body, 0, h - 0.01, 0);
  add(g, bb(w, 0.06, d), body, 0, 0.03, 0);
  add(g, bb(w - 0.04, h - 0.08, 0.012), inner, 0, h / 2, -d / 2 + 0.006);
  const shelves = o.shelves ?? Math.max(1, Math.round(h / 0.45) - 1);
  for (let i = 1; i <= shelves; i++) add(g, bb(w - 0.04, 0.018, d - 0.04), inner, 0, 0.06 + (i * (h - 0.08)) / (shelves + 1), -0.01);
  const out = finish(g, [boxFrom(w, h, d)], 'cabinet');
  out.userData.drawers = [];
  const dw = (w - 0.01) / n, open = o.angle ?? 1.7;
  for (let i = 0; i < n; i++) {
    const right = n === 2 ? i === 1 : o.hinge === 'right', side = right ? 1 : -1, x0 = -w / 2 + 0.005 + i * dw;
    const hinge = new THREE.Group(); hinge.userData.keep = true; hinge.name = 'cabinetHinge';
    hinge.position.set(right ? x0 + dw : x0, 0, d / 2 + 0.01);
    const leaf = new THREE.Group();
    add(leaf, bb(dw - 0.006, h - 0.1, 0.02), body, 0, h / 2 + 0.01, 0);
    add(leaf, bb(0.02, 0.12, 0.02), handle, -side * (dw / 2 - 0.05), h * 0.5, 0.018);
    const m = mergeProps(leaf); m.position.x = -side * (dw / 2); hinge.add(m); out.add(hinge);
    out.userData.drawers.push({ obj: hinge, kind: 'door', angle: side * open, hinge: right ? 'right' : 'left' });
  }
  return out;
}

// Chest of drawers (たんす / 整理棚): rows of drawers that each open on their own. o: { w: 0.9, h: 1.0, d: 0.45, rows: 4, cols: 1 | 2, color }
export function tansu(T, o = {}) {
  const w = o.w ?? 0.9, h = o.h ?? 1.0, d = o.d ?? 0.45, rows = o.rows ?? Math.max(2, Math.round(h / 0.24)), cols = o.cols ?? 1;
  const body = TM(T, 'wood', 'wood', o.color ?? 0x5a3c26), front = TM(T, 'wood', 'wood', o.front ?? 0x6e4a2e), handle = pm('steel', 0x2a2620);
  const g = new THREE.Group();
  for (const sx of [-1, 1]) add(g, bb(0.02, h, d), body, sx * (w / 2 - 0.01), h / 2, 0);
  add(g, bb(w, 0.025, d), body, 0, h - 0.0125, 0);
  add(g, bb(w, 0.05, d), body, 0, 0.025, 0);
  add(g, bb(w - 0.04, h - 0.07, 0.012), body, 0, h / 2, -d / 2 + 0.006);
  const out = finish(g, [boxFrom(w, h, d)], 'tansu');
  out.userData.drawers = [];
  const dh = (h - 0.08) / rows, dw = (w - 0.04) / cols;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const dr = drawer(dw - 0.008, dh - 0.008, d - 0.06, front, handle);
    dr.position.set(-w / 2 + 0.02 + (c + 0.5) * dw, h - 0.03 - (r + 0.5) * dh, d / 2 + 0.005);
    dr.userData.keep = true; out.add(dr);
    out.userData.drawers.push({ obj: dr, kind: 'drawer', travel: (d - 0.06) * 0.7 });
  }
  return out;
}

// Bed: frame, mattress, pillow and a folded blanket. o: { w: 1.0, l: 2.0, h: 0.5 (mattress top), color, sheet, blanket, headboard: true }
// The long side runs along z, the head at -z.
export function bed(T, o = {}) {
  const w = o.w ?? 1.0, l = o.l ?? 2.0, top = o.h ?? SEAT_H.bed, wood = TM(T, 'wood', 'wood', o.color ?? 0x5e4430);
  const cloth = (c) => pm('fabric', c);
  const g = new THREE.Group(), frameH = top - 0.18;
  add(g, bb(w, 0.06, l), wood, 0, frameH - 0.03, 0);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(g, bb(0.06, frameH - 0.06, 0.06), wood, x * (w / 2 - 0.03), (frameH - 0.06) / 2, z * (l / 2 - 0.03));
  add(g, bb(w - 0.04, 0.18, l - 0.04, 0.03, 2), cloth(o.sheet ?? 0xd8d4c8), 0, frameH + 0.09, 0);
  add(g, bb(w * 0.6, 0.1, 0.32, 0.04, 2), cloth(0xe6e2d8), 0, top + 0.05, -l / 2 + 0.24);
  add(g, bb(w - 0.02, 0.05, l * 0.55, 0.02, 2), cloth(o.blanket ?? 0x5a6a78), 0, top + 0.025, l * 0.2);
  if (o.headboard ?? true) add(g, bb(w, 0.5, 0.04), wood, 0, top + 0.18, -l / 2 + 0.02);
  return finish(g, [boxFrom(w, top + 0.1, l)], 'bed');
}

// Wooden chair (台所・学校・民家). Origin = floor centre, the seat faces +z. SEAT_H.woodenChair = seat top.
export function woodenChair(T = {}, o = {}) {
  const sh = SEAT_H.woodenChair, wood = TM(T, 'wood', 'wood', o.color ?? 0x7a5a3c), g = new THREE.Group();
  add(g, bb(0.42, 0.03, 0.4, 0.006), wood, 0, sh - 0.015, 0);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(g, bb(0.035, sh - 0.03, 0.035), wood, x * 0.18, (sh - 0.03) / 2, z * 0.17);
  for (const x of [-1, 1]) add(g, bb(0.035, 0.45, 0.035), wood, x * 0.18, sh + 0.225, -0.17);
  for (const y of [0.18, 0.36]) add(g, bb(0.36, 0.05, 0.02), wood, 0, sh + y, -0.17);
  return finish(g, [boxFrom(0.42, sh, 0.4)], 'chair');
}
