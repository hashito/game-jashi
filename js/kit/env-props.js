/* game-kit 6e0b6f0: js/env-props.js — edit in game-kit and run tools/kit-sync.js */
// Environment pieces that several games build on their own: doors, windows, benches, vending machines,
// sign panels, lamps, fences, railings, stairs, pipes, crates, pallets, drums, bins, bags, plants, cones,
// bollards and cars. Bevelled edges (bevelBox), metre UVs, the shared PBR materials (prop-mats.js), baked
// vertex AO and collision boxes in userData.colliders. Origin = floor centre, front = +z, metres.
//
//   import * as E from "./env-props.js";
//   const d = E.door({ w: 0.9, kind: "panel" }); scene.add(d); E.setDoorOpen(d, 0.5);
//   const lamp = E.ceilingLight({ kind: "panel" }); lamp.position.y = 2.6;   // hangs down from y 0
//   colliders.push(...propColliders(obj));                                   // prop-batch.js
//
// Every builder takes one options object; common keys:
//   detail: 2 full (default) | 1 fewer bevel segments, no small parts | 0 boxes only (use with propLOD)
//   ao: true (default) bake vertex AO when merging; merge: false keeps the parts as separate meshes
// Builders return a Group whose static parts are merged by material (1-6 draw calls per prop). Moving
// parts (door leaves, lids) are separate children with userData.keep = true.
import * as THREE from "three";
import { bevelBox, cylinderUV, metricUV, boxFrom } from "./prop-geo.js";
import { pm, trimUV } from "./prop-mats.js";
import { mergeProps } from "./prop-batch.js";

// ------------------------------------------------------------------------------------------- helpers
function part(g, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  g.add(m);
  return m;
}
const det = (o) => o.detail ?? 2;
// bevelled box; r is reduced to 0 at detail 0
// (two bevel segments only for big radii at full detail: a 1-segment chamfer with smooth normals already
// catches the light on small parts, at 108 instead of 300 triangles)
const bx = (g, o, w, h, d, mat, x, y, z, r = 0.008) => part(g, bevelBox(w, h, d, { r: det(o) ? r : 0, seg: det(o) >= 2 && r >= 0.015 ? 2 : 1 }), mat, x, y, z);
const cyl = (g, o, r0, r1, h, mat, x, y, z, seg = 16, rx = 0, rz = 0) =>
  part(g, cylinderUV(new THREE.CylinderGeometry(r0, r1, h, det(o) >= 2 ? seg : Math.max(6, seg >> 1)), 1), mat, x, y, z, rx, 0, rz);
// a round bar from a to b
function strut(g, o, a, b, r, mat, seg = 10) {
  const A = new THREE.Vector3(...a);
  const B = new THREE.Vector3(...b);
  const m = new THREE.Mesh(cylinderUV(new THREE.CylinderGeometry(r, r, A.distanceTo(B), det(o) >= 2 ? seg : 6), 1), mat);
  m.position.copy(A).add(B).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  g.add(m);
  return m;
}
function seeded(seed) {
  let s = (seed * 16807) % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
function done(g, o, kind, colliders) {
  g.userData.kind = kind;
  g.userData.colliders = colliders;
  if (o.merge === false) return g;
  return mergeProps(g, { ao: o.ao ?? true });
}
const canvasTex = (S, draw, srgb = true) => {
  const c = document.createElement("canvas");
  c.width = c.height = S;
  draw(c.getContext("2d"), S);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
};

// ---------------------------------------------------------------------------------------------- doors
// A door set in a wall opening: frame (jambs + head + architraves on both faces) and a leaf on its
// hinge (left edge seen from +z). The wall runs along x, its faces at z = +-wall/2.
//   kind: 'flush' | 'panel' (four raised panels) | 'glass' (upper glazing) | 'steel' (kick plate, closer)
//   handle: 'lever' | 'knob' | 'bar'.  swing: 1 opens toward +z, -1 toward -z.
// userData.door = { hinge, max } (setDoorOpen(door, 0..1)); userData.colliders = jambs + the closed leaf
// (tagged 'door': switch it off while the door is open, as doors.js does).
export function door(o = {}) {
  const w = o.w ?? 0.9;
  const h = o.h ?? 2.05;
  const wall = o.wall ?? 0.12;
  const kind = o.kind ?? "flush";
  const g = new THREE.Group();
  const frameM = pm("paint", o.frame ?? 0xd8d4c8);
  const leafM = kind === "steel" ? pm("paint", o.color ?? 0x5a6670) : pm(o.wood ? "wood" : "paint", o.color ?? (o.wood ? 0x9a7650 : 0xe6e1d6), { uv: 0.6 });
  const fw = 0.045;
  const fd = wall + 0.02;
  bx(g, o, fw, h + fw, fd, frameM, -w / 2 - fw / 2, (h + fw) / 2, 0, 0.004);
  bx(g, o, fw, h + fw, fd, frameM, w / 2 + fw / 2, (h + fw) / 2, 0, 0.004);
  bx(g, o, w + fw * 2, fw, fd, frameM, 0, h + fw / 2, 0, 0.004);
  if (det(o) >= 1)
    for (const s of [-1, 1]) {
      // architraves: a flat moulding round the opening on each face of the wall
      const z = s * (wall / 2 + 0.008);
      bx(g, o, 0.07, h + 0.07, 0.016, frameM, -w / 2 - 0.035, (h + 0.07) / 2, z, 0.005);
      bx(g, o, 0.07, h + 0.07, 0.016, frameM, w / 2 + 0.035, (h + 0.07) / 2, z, 0.005);
      bx(g, o, w + 0.14, 0.07, 0.016, frameM, 0, h + 0.035, z, 0.005);
    }
  // the leaf
  const swing = o.swing ?? 1;
  const hinge = new THREE.Group();
  hinge.position.set(-w / 2, 0, swing * 0.0);
  hinge.userData.keep = true;
  hinge.name = "doorHinge";
  const leaf = new THREE.Group();
  const lw = w - 0.006;
  const lh = h - 0.012;
  const lt = 0.04;
  const L = { ...o, ao: false };
  if (kind === "glass") {
    // stiles and rails round a glass pane in the upper half
    bx(leaf, L, 0.11, lh, lt, leafM, 0.055, lh / 2 + 0.006, 0, 0.005);
    bx(leaf, L, 0.11, lh, lt, leafM, lw - 0.055, lh / 2 + 0.006, 0, 0.005);
    bx(leaf, L, lw - 0.22, 0.12, lt, leafM, lw / 2, lh - 0.054, 0, 0.005);
    bx(leaf, L, lw - 0.22, lh * 0.5, lt, leafM, lw / 2, lh * 0.25 + 0.006, 0, 0.005);
    part(leaf, new THREE.BoxGeometry(lw - 0.22, lh * 0.5 - 0.12, 0.008), pm("glass", 0xd8e6ea), lw / 2, lh * 0.75 - 0.054, 0);
  } else {
    bx(leaf, L, lw, lh, lt, leafM, lw / 2, lh / 2 + 0.006, 0, 0.006);
    if (kind === "panel" && det(o) >= 1)
      for (const s of [-1, 1])
        for (const [py, ph] of [
          [lh * 0.72, lh * 0.36],
          [lh * 0.26, lh * 0.36],
        ])
          for (const px of [lw * 0.29, lw * 0.71]) bx(leaf, L, lw * 0.32, ph, 0.012, leafM, px, py, s * (lt / 2 + 0.003), 0.005);
    if (kind === "steel" && det(o) >= 1) {
      for (const s of [-1, 1]) bx(leaf, L, lw - 0.04, 0.22, 0.004, pm("steel", 0xb8bcc0), lw / 2, 0.14, s * (lt / 2 + 0.002), 0.002);
      bx(leaf, L, 0.32, 0.05, 0.05, pm("paint", 0x303438), 0.3, lh - 0.06, swing * 0.045, 0.01); // closer
    }
  }
  if (det(o) >= 1) {
    const metal = pm("steel", 0xc0c0bc);
    const hy = 1.0;
    for (const s of [-1, 1]) {
      const z = s * (lt / 2 + 0.006);
      if ((o.handle ?? "lever") === "knob") {
        cyl(leaf, L, 0.03, 0.03, 0.01, metal, lw - 0.07, hy, z, 16, Math.PI / 2);
        part(leaf, new THREE.SphereGeometry(0.028, 16, 10), metal, lw - 0.07, hy, s * (lt / 2 + 0.05));
        strut(leaf, L, [lw - 0.07, hy, z], [lw - 0.07, hy, s * (lt / 2 + 0.04)], 0.01, metal);
      } else if (o.handle === "bar") {
        strut(leaf, L, [lw - 0.08, hy - 0.2, s * (lt / 2 + 0.05)], [lw - 0.08, hy + 0.2, s * (lt / 2 + 0.05)], 0.014, metal);
        for (const dy of [-0.18, 0.18]) strut(leaf, L, [lw - 0.08, hy + dy, z], [lw - 0.08, hy + dy, s * (lt / 2 + 0.05)], 0.01, metal);
      } else {
        cyl(leaf, L, 0.026, 0.026, 0.01, metal, lw - 0.065, hy, z, 16, Math.PI / 2);
        strut(leaf, L, [lw - 0.065, hy, z], [lw - 0.065, hy, s * (lt / 2 + 0.05)], 0.009, metal);
        strut(leaf, L, [lw - 0.065, hy, s * (lt / 2 + 0.05)], [lw - 0.2, hy, s * (lt / 2 + 0.055)], 0.011, metal);
      }
    }
    for (const y of [0.25, lh / 2, lh - 0.25]) cyl(leaf, L, 0.008, 0.008, 0.1, metal, 0, y, 0, 8);
  }
  hinge.add(mergeProps(leaf, { ao: false }));
  g.add(hinge);
  const leafBox = boxFrom(w, h, lt + 0.02, 0, h / 2, 0);
  leafBox.tag = "door";
  g.userData.door = { hinge, max: o.max ?? 1.75, swing, leafBox };
  const out = done(g, o, "door", [boxFrom(fw, h, fd, -w / 2 - fw / 2), boxFrom(fw, h, fd, w / 2 + fw / 2), leafBox]);
  out.userData.door.hinge = out.getObjectByName("doorHinge");
  if (o.open) setDoorOpen(out, o.open);
  return out;
}
// 0 = closed, 1 = fully open (max radians). Switches the leaf's collider off past half open.
export function setDoorOpen(d, t) {
  const D = d.userData.door;
  D.hinge.rotation.y = -D.swing * D.max * Math.max(0, Math.min(1, t));
  D.open = t;
  D.leafBox.off = t > 0.5;
}

// ---------------------------------------------------------------------------------------------- windows
// A window in a wall along x (faces at z = +-wall/2, room side +z). sill: height of the bottom of the
// opening. panes: [columns, rows]. Inner sill board on +z, a drip sill outside; optional blind (0..1 down).
export function windowFrame(o = {}) {
  const w = o.w ?? 1.2;
  const h = o.h ?? 1.1;
  const sill = o.sill ?? 0.9;
  const wall = o.wall ?? 0.12;
  const [cols, rows] = o.panes ?? [2, 1];
  const g = new THREE.Group();
  const fm = o.wood ? pm("wood", o.color ?? 0x8a6a48) : pm("paint", o.color ?? 0xb8bcbc, { metalness: 0.5 });
  const f = 0.05;
  const y0 = sill;
  bx(g, o, w, f, 0.07, fm, 0, y0 + f / 2, 0, 0.004);
  bx(g, o, w, f, 0.07, fm, 0, y0 + h - f / 2, 0, 0.004);
  bx(g, o, f, h, 0.07, fm, -w / 2 + f / 2, y0 + h / 2, 0, 0.004);
  bx(g, o, f, h, 0.07, fm, w / 2 - f / 2, y0 + h / 2, 0, 0.004);
  for (let c = 1; c < cols; c++) bx(g, o, 0.035, h - f * 2, 0.06, fm, -w / 2 + (w * c) / cols, y0 + h / 2, c % 2 ? 0.012 : -0.012, 0.003);
  for (let r = 1; r < rows; r++) bx(g, o, w - f * 2, 0.03, 0.05, fm, 0, y0 + (h * r) / rows, 0, 0.003);
  part(g, new THREE.BoxGeometry(w - f * 2, h - f * 2, 0.006), pm("glass", o.glass ?? 0xcfe0e8), 0, y0 + h / 2, 0);
  // reveal (the wall's thickness round the opening) and sills
  const rv = pm("paint", o.wallColor ?? 0xe8e4dc);
  if (det(o) >= 1) {
    bx(g, o, w + 0.02, 0.025, wall / 2 + 0.07, pm("wood", 0xc8b496, { uv: 0.6 }), 0, y0 - 0.0125, wall / 4 + 0.035, 0.006);
    bx(g, o, w + 0.06, 0.03, 0.09, pm("paint", 0x9a9c98), 0, y0 - 0.03, -wall / 2 - 0.03, 0.006);
    for (const s of [-1, 1]) bx(g, o, 0.02, h, wall, rv, s * (w / 2 + 0.01), y0 + h / 2, 0, 0);
    bx(g, o, w + 0.04, 0.02, wall, rv, 0, y0 + h + 0.01, 0, 0);
  }
  if (o.blind) {
    const bh = (h - 0.08) * o.blind;
    const slat = pm("plastic", 0xe8e6e0);
    for (let y = 0; y < bh; y += 0.025) {
      const s = bx(g, o, w - 0.08, 0.002, 0.025, slat, 0, y0 + h - 0.06 - y, wall / 2 + 0.03, 0);
      s.rotation.x = 0.5;
    }
    bx(g, o, w - 0.04, 0.04, 0.04, slat, 0, y0 + h - 0.03, wall / 2 + 0.03, 0.008);
  }
  return done(g, o, "window", []);
}

// ---------------------------------------------------------------------------------------------- benches
// kind: 'park' (wooden slats on cast iron sides), 'waiting' (a row of moulded seats on a steel beam),
// 'locker' (a plank on steel legs, for a changing room). Seat top at 0.42-0.45 m; faces +z.
export const BENCH_SEAT_H = { park: 0.45, waiting: 0.44, locker: 0.42 };
export function bench(o = {}) {
  const kind = o.kind ?? "park";
  const w = o.w ?? (kind === "waiting" ? 1.6 : 1.8);
  const g = new THREE.Group();
  const iron = pm("paint", 0x2a2e30, { metalness: 0.6, roughness: 0.45 });
  const sh = BENCH_SEAT_H[kind];
  if (kind === "park") {
    const wood = pm("wood", o.color ?? 0x9a6a40, { uv: 0.7 });
    for (let i = 0; i < 4; i++) bx(g, o, w, 0.03, 0.085, wood, 0, sh - 0.015, 0.16 - i * 0.1, 0.008);
    for (let i = 0; i < 3; i++) {
      const s = bx(g, o, w, 0.085, 0.025, wood, 0, sh + 0.12 + i * 0.1, -0.22 - i * 0.012, 0.008);
      s.rotation.x = -0.12;
    }
    for (const x of [-w / 2 + 0.15, w / 2 - 0.15]) {
      strut(g, o, [x, 0, 0.2], [x, sh - 0.03, 0.17], 0.025, iron);
      strut(g, o, [x, 0, -0.2], [x, sh + 0.38, -0.27], 0.025, iron);
      strut(g, o, [x, sh - 0.035, 0.2], [x, sh - 0.035, -0.22], 0.02, iron);
      if (det(o) >= 1) strut(g, o, [x, sh + 0.18, 0.18], [x, sh + 0.2, -0.22], 0.018, iron); // armrest
      bx(g, o, 0.09, 0.02, 0.1, iron, x, 0.01, 0.2, 0.005);
      bx(g, o, 0.09, 0.02, 0.1, iron, x, 0.01, -0.2, 0.005);
    }
  } else if (kind === "waiting") {
    const n = Math.max(2, Math.round(w / 0.55));
    const seatM = pm("plastic", o.color ?? 0x3f6a8a);
    const steel = pm("steel", 0xa8acb0);
    bx(g, o, w, 0.06, 0.08, steel, 0, sh - 0.12, -0.02, 0.01);
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + (w / n) * (i + 0.5);
      bx(g, o, w / n - 0.04, 0.04, 0.44, seatM, x, sh - 0.02, 0.02, 0.018);
      const b = bx(g, o, w / n - 0.04, 0.4, 0.035, seatM, x, sh + 0.24, -0.21, 0.016);
      b.rotation.x = -0.12;
      strut(g, o, [x, sh - 0.12, -0.04], [x, sh + 0.07, -0.2], 0.012, steel);
    }
    for (const x of [-w / 2 + 0.12, w / 2 - 0.12]) {
      strut(g, o, [x, 0.025, 0.18], [x, sh - 0.12, -0.02], 0.022, steel);
      strut(g, o, [x, 0.025, -0.22], [x, sh - 0.12, -0.02], 0.022, steel);
      for (const z of [0.18, -0.22]) bx(g, o, 0.07, 0.025, 0.07, pm("rubber", 0x1a1a1a), x, 0.0125, z, 0.006); // feet
    }
  } else {
    const wood = pm("wood", o.color ?? 0xc8a070, { uv: 0.7 });
    bx(g, o, w, 0.04, 0.32, wood, 0, sh - 0.02, 0, 0.01);
    for (const x of [-w / 2 + 0.12, w / 2 - 0.12])
      for (const z of [-0.12, 0.12]) strut(g, o, [x, 0, z], [x, sh - 0.04, z], 0.016, iron);
    for (const x of [-w / 2 + 0.12, w / 2 - 0.12]) strut(g, o, [x, 0.12, -0.12], [x, 0.12, 0.12], 0.012, iron);
    strut(g, o, [-w / 2 + 0.12, 0.12, 0], [w / 2 - 0.12, 0.12, 0], 0.012, iron);
  }
  return done(g, o, "bench", [boxFrom(w, sh + 0.3, 0.5, 0, (sh + 0.3) / 2, 0)]);
}

// ---------------------------------------------------------------------------------------- vending machine
// A drink vending machine: a rounded steel cabinet, a display window with rows of bottles and cans
// behind glass, a lit panel of buttons, coin slot, note slot and the pick-up flap (from the trim sheet).
// front: a texture for the display (e.g. a generated photo); without it the bottles are modelled.
// userData.front: the display mesh; userData.glow: the light material (lampOn / emissiveIntensity).
export const VENDING_FRONT_PROUD = 0.002;
export function vendingMachine(o = {}) {
  const g = new THREE.Group();
  const w = 0.9;
  const h = 1.83;
  const d = 0.72;
  const body = pm("paint", o.color ?? 0xe8e8e4, { metalness: 0.3 });
  const dark = pm("plastic", 0x1e2024);
  const trim = pm("trim", 0xffffff);
  bx(g, o, w + 0.02, 0.06, d + 0.02, dark, 0, 0.03, 0, 0.01); // plinth
  // the display: a 10 cm deep recess in the front with the goods on shelves, behind glass
  const dy = 1.18;
  const dh = 0.95;
  const dw = 0.8;
  const inset = o.front ? 0 : 0.1;
  bx(g, o, w, h, d - inset, body, 0, h / 2, -inset / 2, 0.02);
  if (inset) {
    const top = h - (dy + dh / 2);
    const low = dy - dh / 2;
    const zf = d / 2 - inset / 2;
    bx(g, o, w, top, inset + 0.002, body, 0, h - top / 2, zf, 0.02);
    bx(g, o, w, low, inset + 0.002, body, 0, low / 2, zf, 0.02);
    for (const s of [-1, 1]) bx(g, o, (w - dw) / 2, dh + 0.01, inset + 0.002, body, s * (dw / 2 + (w - dw) / 4), dy, zf, 0.008);
  }
  const glow = o.own ? new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xf4f6ff, emissiveIntensity: 0.9 }) : pm("glow", 0xf4f6ff, { emissiveIntensity: 0.9 });
  let front;
  if (o.front) {
    // on the cabinet face: 2 mm proud (clear of z-fighting, well under decal-float; it was 14 mm out in the air)
    front = part(g, new THREE.PlaneGeometry(dw, dh), new THREE.MeshStandardMaterial({ map: o.front, emissive: 0xffffff, emissiveMap: o.front, emissiveIntensity: 0.55, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), 0, dy, d / 2 + VENDING_FRONT_PROUD);
  } else {
    front = part(g, new THREE.PlaneGeometry(dw, dh), pm("glow", 0xdfe6ee, { emissiveIntensity: 0.35 }), 0, dy, d / 2 - inset + 0.004);
    if (det(o) >= 1) {
      const r = seeded(o.seed ?? 3);
      const cols = [0xc83a30, 0x2a6ab0, 0xe8c040, 0xf0f0f0];
      for (let row = 0; row < 3; row++) {
        const y = dy + dh / 2 - 0.12 - row * 0.3;
        bx(g, o, dw, 0.012, 0.09, pm("plastic", 0xd0d4d8), 0, y - 0.11, d / 2 - 0.055, 0.003); // shelf
        for (let i = 0; i < 8; i++) {
          const x = -dw / 2 + 0.05 + i * 0.1;
          const c = pm("plastic", cols[Math.floor(r() * cols.length)], { roughness: 0.3 });
          if (row === 2 || r() < 0.3) cyl(g, o, 0.033, 0.033, 0.12, c, x, y - 0.045, d / 2 - 0.045, 12);
          else {
            cyl(g, o, 0.032, 0.032, 0.14, c, x, y - 0.035, d / 2 - 0.045, 12);
            cyl(g, o, 0.012, 0.032, 0.05, c, x, y + 0.06, d / 2 - 0.045, 12);
          }
          if (det(o) >= 2) bx(g, o, 0.035, 0.018, 0.006, pm("glow", 0x40e080, { emissiveIntensity: 0.8 }), x, y - 0.13, d / 2 + 0.003, 0); // the lit buttons under each
        }
      }
    }
    part(g, new THREE.PlaneGeometry(dw, dh), pm("glass", 0xe0eaf0), 0, dy, d / 2 - 0.004);
  }
  // the lit header and the control column
  bx(g, o, dw, 0.1, 0.02, glow, 0, h - 0.1, d / 2 + 0.004, 0.005);
  if (det(o) >= 1) {
    const panel = bx(g, o, 0.2, 0.32, 0.03, dark, 0.28, 0.55, d / 2 + 0.01, 0.008);
    panel.userData.noMerge = false;
    const slot = part(g, new THREE.PlaneGeometry(0.16, 0.08), trim, 0.28, 0.62, d / 2 + 0.027);
    trimUV(slot.geometry, "vent", 0.16, 0.16);
    bx(g, o, 0.04, 0.06, 0.02, pm("steel", 0xc8c8c8), 0.28, 0.5, d / 2 + 0.03, 0.006); // coin return lever
    // the pick-up flap
    bx(g, o, 0.62, 0.2, 0.04, dark, -0.04, 0.24, d / 2 + 0.01, 0.015);
    const flap = part(g, new THREE.PlaneGeometry(0.56, 0.14), trim, -0.04, 0.24, d / 2 + 0.031);
    trimUV(flap.geometry, "ribbed", 0.3, 0.56);
    // side vents at the back
    for (const s of [-1, 1]) {
      const v = part(g, new THREE.PlaneGeometry(0.3, 0.2), trim, s * (w / 2 + 0.001), 0.3, -d / 2 + 0.2, 0, (s * Math.PI) / 2, 0);
      trimUV(v.geometry, "grille", 0.15, 0.3);
    }
  }
  const out = done(g, o, "vending", [boxFrom(w, h, d)]);
  out.userData.front = out.children.find((m) => m.material === front.material) || front;
  out.userData.glow = glow;
  return out;
}

// ------------------------------------------------------------------------------------------------ signs
// A sign panel. The face is drawn on a canvas: pictogram ('exit' | 'arrow' | 'toilet' | 'stairs' |
// 'none'), or draw(g, w, h) for the game's own (text included: the kit's images never contain text).
// mount: 'wall' (flat on the wall, back at z 0), 'ceiling' (hangs from y 0 on two rods), 'stand' (on a
// post from the floor), 'blade' (sticks out of the wall along +z). glow: lit from inside (emissive).
const PICTOS = {
  arrow(c, W, H) {
    c.beginPath();
    c.moveTo(W * 0.2, H * 0.42);
    c.lineTo(W * 0.55, H * 0.42);
    c.lineTo(W * 0.55, H * 0.25);
    c.lineTo(W * 0.82, H * 0.5);
    c.lineTo(W * 0.55, H * 0.75);
    c.lineTo(W * 0.55, H * 0.58);
    c.lineTo(W * 0.2, H * 0.58);
    c.closePath();
    c.fill();
  },
  exit(c, W, H) {
    // a running figure and a door
    c.fillRect(W * 0.62, H * 0.18, W * 0.22, H * 0.64);
    c.save();
    c.globalCompositeOperation = "destination-out";
    c.fillRect(W * 0.66, H * 0.24, W * 0.14, H * 0.58);
    c.restore();
    c.beginPath();
    c.arc(W * 0.36, H * 0.24, H * 0.08, 0, Math.PI * 2);
    c.fill();
    c.lineWidth = H * 0.09;
    c.lineCap = "round";
    c.strokeStyle = c.fillStyle;
    c.beginPath();
    c.moveTo(W * 0.34, H * 0.36);
    c.lineTo(W * 0.3, H * 0.58);
    c.lineTo(W * 0.4, H * 0.8);
    c.moveTo(W * 0.3, H * 0.58);
    c.lineTo(W * 0.18, H * 0.78);
    c.moveTo(W * 0.34, H * 0.42);
    c.lineTo(W * 0.46, H * 0.5);
    c.moveTo(W * 0.33, H * 0.42);
    c.lineTo(W * 0.22, H * 0.48);
    c.stroke();
  },
  toilet(c, W, H) {
    for (const [x, skirt] of [
      [0.32, false],
      [0.68, true],
    ]) {
      c.beginPath();
      c.arc(W * x, H * 0.24, H * 0.08, 0, Math.PI * 2);
      c.fill();
      if (skirt) {
        c.beginPath();
        c.moveTo(W * x, H * 0.36);
        c.lineTo(W * (x + 0.1), H * 0.66);
        c.lineTo(W * (x - 0.1), H * 0.66);
        c.fill();
      } else c.fillRect(W * (x - 0.07), H * 0.36, W * 0.14, H * 0.3);
      c.fillRect(W * (x - 0.05), H * 0.66, W * 0.04, H * 0.18);
      c.fillRect(W * (x + 0.01), H * 0.66, W * 0.04, H * 0.18);
    }
    c.fillRect(W * 0.49, H * 0.15, W * 0.02, H * 0.7);
  },
  stairs(c, W, H) {
    c.beginPath();
    c.moveTo(W * 0.15, H * 0.82);
    for (let i = 0; i < 4; i++) {
      c.lineTo(W * (0.15 + i * 0.17), H * (0.82 - (i + 1) * 0.15));
      c.lineTo(W * (0.32 + i * 0.17), H * (0.82 - (i + 1) * 0.15));
    }
    c.lineTo(W * 0.85, H * 0.82);
    c.closePath();
    c.fill();
  },
  none() {},
};
export function signPanel(o = {}) {
  const w = o.w ?? 0.6;
  const h = o.h ?? 0.24;
  const mount = o.mount ?? "wall";
  const g = new THREE.Group();
  const frame = pm("paint", o.frame ?? 0xc8ccd0, { metalness: 0.5 });
  const t = 0.03;
  const S = 512;
  const tex = canvasTex(S, (c) => {
    const H = Math.round((S * h) / w);
    c.canvas.height = H;
    c.fillStyle = o.bg ?? "#1f7a4a";
    c.fillRect(0, 0, S, H);
    c.fillStyle = o.ink ?? "#ffffff";
    if (o.draw) o.draw(c, S, H);
    else (PICTOS[o.picto ?? "arrow"] || PICTOS.none)(c, S, H);
    if (o.flip) {
      const img = c.getImageData(0, 0, S, H);
      c.save();
      c.scale(-1, 1);
      c.putImageData(img, 0, 0);
      c.restore();
    }
  });
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  const faceM = o.glow
    ? new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: o.glow === true ? 0.8 : o.glow, roughness: 0.4 })
    : new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45 });
  const both = mount === "ceiling" || mount === "blade" || mount === "stand";
  const cy = mount === "ceiling" ? -(o.drop ?? 0.25) - h / 2 : mount === "stand" ? (o.post ?? 1.4) + h / 2 : 0;
  const rotY = mount === "blade" ? Math.PI / 2 : 0;
  const cz = mount === "wall" ? t / 2 : mount === "blade" ? w / 2 + 0.05 : 0;
  const holder = new THREE.Group();
  holder.position.set(0, cy, cz);
  holder.rotation.y = rotY;
  g.add(holder);
  bx(holder, o, w + 0.02, h + 0.02, t, frame, 0, 0, 0, 0.006);
  part(holder, new THREE.PlaneGeometry(w, h), faceM, 0, 0, t / 2 + 0.001);
  if (both) part(holder, new THREE.PlaneGeometry(w, h), faceM, 0, 0, -t / 2 - 0.001, 0, Math.PI, 0);
  const steel = pm("steel", 0xb0b4b8);
  if (mount === "ceiling") for (const x of [-w * 0.35, w * 0.35]) strut(g, o, [x, 0, 0], [x, cy + h / 2, 0], 0.005, steel, 6);
  if (mount === "stand") {
    strut(g, o, [0, 0.03, 0], [0, cy - h / 2, 0], 0.025, steel);
    cyl(g, o, 0.18, 0.2, 0.03, pm("paint", 0x303438), 0, 0.015, 0, 20);
  }
  if (mount === "blade") bx(g, o, 0.03, h + 0.04, 0.12, steel, 0, 0, 0.04, 0.006);
  const out = done(g, o, "sign", mount === "stand" ? [boxFrom(0.4, cy + h / 2, 0.4, 0, (cy + h / 2) / 2, 0)] : []);
  out.userData.face = faceM;
  return out;
}

// ------------------------------------------------------------------------------------------------ lamps
// Ceiling lights hang down from y = 0 (put them at the ceiling height). Each returns userData.light: the
// local point where a real light would go (add a PointLight / SpotLight only for the nearest few, see
// docs/3d-quality-guide.md) and userData.glow: the emissive material (shared by every lamp of the same
// kind and colour unless own: true; lampOn(lamp, false) turns that material off).
//   kind: 'panel' (recessed 0.6 m square), 'tube' (twin fluorescent batten), 'pendant' (shade on a cord),
//   'downlight' (small round).
export function ceilingLight(o = {}) {
  const kind = o.kind ?? "panel";
  const col = o.color ?? 0xfff2e0;
  const g = new THREE.Group();
  const glow = o.own ? new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: col, emissiveIntensity: o.intensity ?? 1.6 }) : pm("glow", col, { emissiveIntensity: o.intensity ?? 1.6 });
  const housing = pm("paint", 0xe8e8e4);
  let at = new THREE.Vector3(0, -0.05, 0);
  if (kind === "panel") {
    const s = o.w ?? 0.6;
    bx(g, o, s, 0.03, s, housing, 0, -0.015, 0, 0.004);
    part(g, new THREE.PlaneGeometry(s - 0.05, s - 0.05), glow, 0, -0.031, 0, Math.PI / 2, 0, 0);
  } else if (kind === "tube") {
    const len = o.w ?? 1.25;
    bx(g, o, len + 0.04, 0.05, 0.16, housing, 0, -0.025, 0, 0.012);
    for (const z of [-0.04, 0.04]) cyl(g, o, 0.014, 0.014, len, glow, 0, -0.065, z, 10, 0, Math.PI / 2);
    for (const x of [-len / 2 - 0.005, len / 2 + 0.005]) bx(g, o, 0.02, 0.04, 0.13, housing, x, -0.06, 0, 0.004);
    at = new THREE.Vector3(0, -0.08, 0);
  } else if (kind === "pendant") {
    const drop = o.drop ?? 0.7;
    const shade = pm("paint", o.shade ?? 0x2a2c2e, { side: THREE.DoubleSide, metalness: 0.4 });
    strut(g, o, [0, 0, 0], [0, -drop, 0], 0.004, pm("rubber", 0x111111), 6);
    cyl(g, o, 0.05, 0.05, 0.02, housing, 0, -0.01, 0, 16);
    part(g, cylinderUV(new THREE.CylinderGeometry(0.035, 0.2, 0.18, det(o) >= 2 ? 28 : 12, 1, true), 1), shade, 0, -drop - 0.09, 0);
    part(g, new THREE.SphereGeometry(0.05, 14, 10), glow, 0, -drop - 0.13, 0);
    at = new THREE.Vector3(0, -drop - 0.15, 0);
  } else {
    cyl(g, o, 0.08, 0.08, 0.015, housing, 0, -0.0075, 0, 24);
    part(g, new THREE.CircleGeometry(0.06, 24), glow, 0, -0.016, 0, Math.PI / 2, 0, 0);
    at = new THREE.Vector3(0, -0.03, 0);
  }
  const out = done(g, o, "lamp", []);
  out.userData.light = at;
  out.userData.glow = glow;
  return out;
}
// A street light: tapered pole, curved arm, LED head. Origin = foot of the pole; the arm reaches +z.
export function streetLamp(o = {}) {
  const h = o.h ?? 5.5;
  const arm = o.arm ?? 1.2;
  const g = new THREE.Group();
  const pole = pm("paint", o.color ?? 0x8e9396, { metalness: 0.5 });
  const glow = o.own ? new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: o.light ?? 0xfff0d8, emissiveIntensity: 2 }) : pm("glow", o.light ?? 0xfff0d8, { emissiveIntensity: 2 });
  cyl(g, o, 0.06, 0.1, h, pole, 0, h / 2, 0, 14);
  cyl(g, o, 0.14, 0.16, 0.5, pole, 0, 0.25, 0, 14); // the base
  if (det(o) >= 1) bx(g, o, 0.1, 0.22, 0.04, pole, 0, 1.0, 0.1, 0.01); // the service hatch
  const pts = [];
  for (let i = 0; i <= 8; i++) {
    const a = (i / 8) * (Math.PI / 2);
    pts.push(new THREE.Vector3(0, h - 0.4 + Math.sin(a) * 0.4, (1 - Math.cos(a)) * 0.4));
  }
  pts.push(new THREE.Vector3(0, h, arm));
  part(g, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), det(o) >= 2 ? 24 : 8, 0.045, 8), pole);
  bx(g, o, 0.22, 0.07, 0.5, pole, 0, h - 0.01, arm + 0.12, 0.025);
  part(g, new THREE.PlaneGeometry(0.16, 0.4), glow, 0, h - 0.047, arm + 0.12, Math.PI / 2, 0, 0);
  const out = done(g, o, "streetlamp", [boxFrom(0.3, h, 0.3)]);
  out.userData.light = new THREE.Vector3(0, h - 0.1, arm + 0.12);
  out.userData.glow = glow;
  return out;
}
// A desk lamp with a weighted base and a two-part arm; userData.light is under the shade.
export function deskLamp(o = {}) {
  const g = new THREE.Group();
  const m = pm("paint", o.color ?? 0x2a5a4a, { metalness: 0.4 });
  const glow = o.own ? new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff0d0, emissiveIntensity: 1.5 }) : pm("glow", 0xfff0d0, { emissiveIntensity: 1.5 });
  cyl(g, o, 0.08, 0.09, 0.025, m, 0, 0.0125, 0, 24);
  strut(g, o, [0, 0.02, 0], [0, 0.3, -0.08], 0.008, m);
  strut(g, o, [0, 0.3, -0.08], [0, 0.38, 0.12], 0.008, m);
  part(g, new THREE.SphereGeometry(0.014, 10, 8), m, 0, 0.3, -0.08);
  const shade = part(g, cylinderUV(new THREE.CylinderGeometry(0.025, 0.07, 0.1, 20, 1, true), 1), pm("paint", o.color ?? 0x2a5a4a, { metalness: 0.4, side: THREE.DoubleSide }), 0, 0.35, 0.15);
  shade.rotation.x = 0.5;
  part(g, new THREE.SphereGeometry(0.025, 12, 8), glow, 0, 0.34, 0.16);
  const out = done(g, o, "lamp", [boxFrom(0.18, 0.4, 0.18)]);
  out.userData.light = new THREE.Vector3(0, 0.3, 0.18);
  out.userData.glow = glow;
  return out;
}
export function lampOn(lamp, on = true, intensity) {
  const m = lamp.userData.glow;
  if (!m) return;
  m.userData.on ??= m.emissiveIntensity;
  m.emissiveIntensity = on ? (intensity ?? m.userData.on) : 0;
}

// ------------------------------------------------------------------------------------- fences, railings
let CHAIN = null;
const chainTex = () =>
  (CHAIN ??= canvasTex(64, (c, S) => {
    c.clearRect(0, 0, S, S);
    c.strokeStyle = "#fff";
    c.lineWidth = 5;
    c.beginPath();
    c.moveTo(0, S / 2);
    c.lineTo(S / 2, 0);
    c.lineTo(S, S / 2);
    c.lineTo(S / 2, S);
    c.closePath();
    c.stroke();
  }));
// kind: 'chain' (chain-link on steel posts), 'mesh' (welded panels), 'picket' (white wooden pickets),
// 'rail' (two steel rails, a low barrier). Runs along x from -len/2 to len/2.
export function fence(o = {}) {
  const len = o.len ?? 3;
  const h = o.h ?? (o.kind === "picket" ? 0.9 : o.kind === "rail" ? 0.8 : 1.8);
  const kind = o.kind ?? "chain";
  const g = new THREE.Group();
  const posts = Math.max(1, Math.round(len / (kind === "picket" ? 1.8 : 2.4)));
  if (kind === "picket") {
    const wood = pm("paint", o.color ?? 0xf0eee6, { roughness: 0.7 });
    for (let i = 0; i <= posts; i++) bx(g, o, 0.08, h + 0.05, 0.08, wood, -len / 2 + (len * i) / posts, (h + 0.05) / 2, 0, 0.008);
    for (const y of [0.2, h - 0.2]) bx(g, o, len, 0.06, 0.025, wood, 0, y, -0.035, 0.006);
    const n = Math.floor(len / 0.13);
    for (let i = 0; i < n; i++) {
      const x = -len / 2 + 0.065 + i * (len / n);
      part(g, bevelBox(0.075, h - 0.08, 0.018, { r: 0 }), wood, x, (h - 0.08) / 2 + 0.04, 0); // plain boxes: many of them
      if (det(o) >= 1) {
        const tip = part(g, new THREE.ConeGeometry(0.053, 0.06, 4), wood, x, h - 0.01, 0, 0, Math.PI / 4, 0);
        tip.scale.z = 0.34;
      }
    }
  } else {
    const steel = pm("paint", o.color ?? 0x5e6a62, { metalness: 0.5 });
    for (let i = 0; i <= posts; i++) cyl(g, o, 0.03, 0.03, h, steel, -len / 2 + (len * i) / posts, h / 2, 0, 10);
    if (kind === "rail") {
      for (const y of [h - 0.05, h * 0.45]) bx(g, o, len, 0.08, 0.04, steel, 0, y, 0.035, 0.012);
    } else {
      strut(g, o, [-len / 2, h - 0.02, 0], [len / 2, h - 0.02, 0], 0.02, steel);
      strut(g, o, [-len / 2, 0.08, 0], [len / 2, 0.08, 0], 0.012, steel);
      const t = kind === "chain" ? chainTex() : null;
      const meshM = t
        ? pm("steel", o.wire ?? 0x9aa0a0, { map: t, alphaMap: t, alphaTest: 0.5, side: THREE.DoubleSide, uv: 0.06 })
        : null;
      if (t) {
        const p = part(g, new THREE.PlaneGeometry(len, h - 0.1), meshM, 0, h / 2, 0);
        const uv = p.geometry.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * len) / 0.06, (uv.getY(i) * (h - 0.1)) / 0.06);
      } else {
        const wire = pm("paint", o.color ?? 0x5e6a62, { metalness: 0.5 });
        for (let x = -len / 2 + 0.1; x < len / 2; x += 0.2) strut(g, o, [x, 0.08, 0], [x, h - 0.02, 0], 0.004, wire, 4);
        for (let y = 0.25; y < h - 0.1; y += 0.25) strut(g, o, [-len / 2, y, 0], [len / 2, y, 0], 0.004, wire, 4);
      }
    }
  }
  return done(g, o, "fence", [boxFrom(len, h, 0.1)]);
}

// A handrail run along x: posts every 1.2 m or less, a round top rail, and 'pipe' (mid rail), 'bars'
// (balusters every 0.11 m) or 'glass' (panels) between. h: top of the rail.
export function railing(o = {}) {
  const len = o.len ?? 3;
  const h = o.h ?? 1.0;
  const kind = o.kind ?? "pipe";
  const g = new THREE.Group();
  const m = kind === "glass" ? pm("steel", 0xc8ccd0) : pm("paint", o.color ?? 0x7a8288, { metalness: 0.6 });
  const n = Math.max(1, Math.ceil(len / 1.2));
  for (let i = 0; i <= n; i++) {
    const x = -len / 2 + (len * i) / n;
    strut(g, o, [x, 0, 0], [x, h - 0.02, 0], 0.022, m);
    if (det(o) >= 1) cyl(g, o, 0.045, 0.045, 0.01, m, x, 0.005, 0, 16);
  }
  strut(g, o, [-len / 2 - 0.03, h, 0], [len / 2 + 0.03, h, 0], 0.025, m, 14);
  if (kind === "pipe") strut(g, o, [-len / 2, h * 0.5, 0], [len / 2, h * 0.5, 0], 0.015, m);
  else if (kind === "bars") {
    strut(g, o, [-len / 2, 0.1, 0], [len / 2, 0.1, 0], 0.012, m);
    for (let x = -len / 2 + 0.11; x < len / 2 - 0.05; x += 0.11) strut(g, o, [x, 0.1, 0], [x, h, 0], 0.008, m, 6);
  } else if (kind === "glass") {
    for (let i = 0; i < n; i++) {
      const x0 = -len / 2 + (len * i) / n;
      part(g, new THREE.BoxGeometry(len / n - 0.08, h - 0.2, 0.01), pm("glass", 0xd0e4e8), x0 + len / n / 2, h / 2 + 0.02, 0);
    }
  }
  return done(g, o, "railing", [boxFrom(len, h, 0.08)]);
}

// ---------------------------------------------------------------------------------------------- stairs
// A straight flight that climbs toward -z from its foot at z = 0 (front edge of the first step) to
// `rise` metres up at z = -run. kind: 'concrete' (solid steps, rubber nosing), 'steel' (open tread
// plates on stringers, for factories and fire escapes), 'wood'. rails: 'both' | 'left' | 'right' | 'none'.
// userData.heightAt(x, z) gives the walking height on the flight in local space (null outside), so a
// controller can follow the steps; userData.colliders are the sides (the flight itself is walkable).
export function stairs(o = {}) {
  const w = o.w ?? 1.2;
  const rise = o.rise ?? 3.0;
  const n = o.steps ?? Math.max(2, Math.round(rise / 0.18));
  const rH = rise / n;
  const tD = o.tread ?? 0.27;
  const run = tD * n;
  const kind = o.kind ?? "concrete";
  const g = new THREE.Group();
  const trim = pm("trim", 0xffffff);
  if (kind === "steel") {
    const steel = pm("paint", o.color ?? 0x4a5258, { metalness: 0.6 });
    const ang = Math.atan2(rise, run);
    const sl = Math.hypot(rise, run) + 0.3;
    // stringers: a slanted plate from the floor at the foot to the top landing (a box with moved corners)
    for (const s of [-1, 1]) {
      const geo = new THREE.BoxGeometry(0.012, 1, 1);
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const front = p.getZ(i) > 0;
        const top = p.getY(i) > 0;
        p.setZ(i, front ? 0.02 : -run);
        p.setY(i, (front ? 0 : rise - 0.2) + (top ? 0.22 : 0));
      }
      geo.computeVertexNormals();
      part(g, metricUV(geo, 1), steel, s * (w / 2 + 0.006), 0, 0);
    }
    void ang;
    void sl;
    for (let i = 0; i < n; i++) {
      const y = (i + 1) * rH;
      const z = -(i + 0.5) * tD;
      bx(g, o, w, 0.02, tD - 0.01, steel, 0, y - 0.01, z, 0.003);
      if (det(o) >= 1) {
        const tr = part(g, new THREE.PlaneGeometry(w - 0.02, tD - 0.03), trim, 0, y + 0.001, z, -Math.PI / 2, 0, 0);
        trimUV(tr.geometry, "tread", 0.25, w);
      }
    }
  } else {
    const mat = kind === "wood" ? pm("wood", o.color ?? 0xa07850, { uv: 0.8 }) : pm("concrete", o.color ?? 0xb8b6b0);
    for (let i = 0; i < n; i++) {
      const y = (i + 1) * rH;
      // a block from the floor up to this step's top (solid flight, no gaps from below)
      bx(g, o, w, y, tD + (i < n - 1 ? 0.002 : 0), mat, 0, y / 2, -(i + 0.5) * tD, i === 0 ? 0.006 : 0.006);
      if (det(o) >= 1) {
        const nose = part(g, new THREE.PlaneGeometry(w - 0.04, 0.04), trim, 0, y + 0.0015, -i * tD - 0.02, -Math.PI / 2, 0, 0);
        trimUV(nose.geometry, kind === "wood" ? "ribbed" : o.hazard ? "hazard" : "ribbed", 0.2, w);
      }
    }
  }
  const rails = o.rails ?? "both";
  if (rails !== "none") {
    const m = pm("paint", o.railColor ?? 0x7a8288, { metalness: 0.6 });
    for (const s of rails === "both" ? [-1, 1] : rails === "left" ? [-1] : [1]) {
      const x = s * (w / 2 - 0.04);
      for (let i = 0; i <= n; i += Math.max(1, Math.floor(n / 4))) {
        const y = i * rH;
        strut(g, o, [x, y, -i * tD - 0.1], [x, y + 0.9, -i * tD - 0.1], 0.018, m);
      }
      strut(g, o, [x, 0.9, 0.1], [x, rise + 0.9, -run - 0.1], 0.022, m, 12);
    }
  }
  g.userData.heightAt = (x, z) => (Math.abs(x) > w / 2 || z > 0.001 || z < -run ? null : Math.min(n, Math.floor(-z / tD) + 1) * rH);
  const heightAt = g.userData.heightAt;
  const out = done(g, o, "stairs", [boxFrom(0.04, rise + 1, run, -w / 2 - 0.02, (rise + 1) / 2, -run / 2), boxFrom(0.04, rise + 1, run, w / 2 + 0.02, (rise + 1) / 2, -run / 2)]);
  out.userData.heightAt = heightAt;
  out.userData.run = run;
  out.userData.rise = rise;
  return out;
}

// ----------------------------------------------------------------------------------------------- pipes
// A pipe run through points ([x, y, z], metres): straight lengths, a fitting at each corner and flanges
// at the ends of each length; brackets: wall clamps every 1.5 m. Merged; colliders = one box per length.
export function pipeRun(points, o = {}) {
  const r = o.r ?? 0.05;
  const g = new THREE.Group();
  const m = o.rust ? pm("rust", o.color ?? 0x7a8a80) : pm("paint", o.color ?? 0x7a8a80, { metalness: 0.5 });
  const fit = pm("paint", o.fitting ?? 0x5a6460, { metalness: 0.6 });
  const P = points.map((p) => new THREE.Vector3(...p));
  const cols = [];
  for (let i = 0; i < P.length - 1; i++) {
    strut(g, o, P[i].toArray(), P[i + 1].toArray(), r, m, 16);
    const dir = P[i + 1].clone().sub(P[i]).normalize();
    if (o.flanges !== false && det(o) >= 1)
      for (const [p, s] of [
        [P[i], 1],
        [P[i + 1], -1],
      ]) {
        const at = p.clone().addScaledVector(dir, s * r * 2.2);
        strut(g, o, at.clone().addScaledVector(dir, -0.012).toArray(), at.clone().addScaledVector(dir, 0.012).toArray(), r * 1.55, fit, 16);
      }
    if (o.brackets && det(o) >= 1) {
      const L = P[i].distanceTo(P[i + 1]);
      for (let d = 0.75; d < L - 0.3; d += 1.5) {
        const at = P[i].clone().addScaledVector(dir, d);
        part(g, new THREE.TorusGeometry(r * 1.1, 0.008, 6, 16), fit, at.x, at.y, at.z).quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
      }
    }
    const b = new THREE.Box3().setFromPoints([P[i], P[i + 1]]).expandByScalar(r);
    cols.push(b);
  }
  for (let i = 1; i < P.length - 1; i++) part(g, new THREE.SphereGeometry(r * 1.25, det(o) >= 2 ? 16 : 8, det(o) >= 2 ? 12 : 6), fit, P[i].x, P[i].y, P[i].z);
  return done(g, o, "pipe", cols);
}

// ------------------------------------------------------------------------------------ crates, drums, bins
// kind: 'slat' (a wooden crate: frame edges and slats with gaps) | 'plywood' (closed box with battens).
export function crate(o = {}) {
  const w = o.w ?? 0.6;
  const h = o.h ?? o.w ?? 0.6;
  const d = o.d ?? o.w ?? 0.6;
  const g = new THREE.Group();
  const wood = pm(o.kind === "plywood" ? "plywood" : "wood", o.color ?? (o.kind === "plywood" ? 0xc8a878 : 0xa8885a), { uv: 0.5 });
  const dark = pm("wood", 0x6a5038, { uv: 0.5 });
  const e = 0.045;
  if (o.kind === "plywood" || det(o) === 0) bx(g, o, w - 0.01, h - 0.01, d - 0.01, wood, 0, h / 2, 0, 0.003);
  else {
    // slats on the four sides and the top, gaps between them; a dark inside so the gaps read
    bx(g, o, w - 0.06, h - 0.06, d - 0.06, dark, 0, h / 2, 0, 0);
    const nS = Math.max(3, Math.round(h / 0.15));
    for (let i = 0; i < nS; i++) {
      const y = e + ((h - e * 2) * (i + 0.5)) / nS;
      const sh = ((h - e * 2) / nS) * 0.8;
      for (const s of [-1, 1]) {
        part(g, bevelBox(w - 0.02, sh, 0.016, { r: 0 }), wood, 0, y, s * (d / 2 - 0.01));
        part(g, bevelBox(0.016, sh, d - 0.02, { r: 0 }), wood, s * (w / 2 - 0.01), y, 0);
      }
    }
    const nT = Math.max(3, Math.round(w / 0.15));
    for (let i = 0; i < nT; i++) part(g, bevelBox(((w - 0.02) / nT) * 0.82, 0.016, d - 0.02, { r: 0 }), wood, -w / 2 + 0.01 + ((w - 0.02) * (i + 0.5)) / nT, h - 0.01, 0);
  }
  // frame battens on every edge
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) bx(g, o, e, h, e, wood, sx * (w / 2 - e / 2 + 0.004), h / 2, sz * (d / 2 - e / 2 + 0.004), 0.006);
  if (det(o) >= 1)
    for (const y of [e / 2, h - e / 2])
      for (const s of [-1, 1]) {
        bx(g, o, w, e, e * 0.7, wood, 0, y, s * (d / 2 - e * 0.35 + 0.006), 0.006);
        bx(g, o, e * 0.7, e, d, wood, s * (w / 2 - e * 0.35 + 0.006), y, 0, 0.006);
      }
  return done(g, o, "crate", [boxFrom(w, h, d)]);
}
// A 1.1 m pallet (Japanese standard T11): top boards, three stringer blocks, bottom boards.
export function pallet(o = {}) {
  const s = o.w ?? 1.1;
  const g = new THREE.Group();
  const wood = pm("wood", o.color ?? 0xb8986a, { uv: 0.6 });
  for (let i = 0; i < 7; i++) bx(g, o, s, 0.022, 0.1, wood, 0, 0.133, -s / 2 + 0.05 + (i * (s - 0.1)) / 6, 0.003);
  for (const x of [-s / 2 + 0.05, 0, s / 2 - 0.05]) {
    bx(g, o, 0.1, 0.022, s, wood, x, 0.111, 0, 0.003);
    for (const z of [-s / 2 + 0.05, 0, s / 2 - 0.05]) bx(g, o, 0.1, 0.078, 0.1, wood, x, 0.061, z, 0.004);
  }
  for (const z of [-s / 2 + 0.05, 0, s / 2 - 0.05]) bx(g, o, s, 0.022, 0.1, wood, 0, 0.011, z, 0.003);
  return done(g, o, "pallet", [boxFrom(s, 0.144, s)]);
}
// A 200 L steel drum with rolling hoops, a top chime and two bungs.
export function drum(o = {}) {
  const g = new THREE.Group();
  const m = o.rust ? pm("rust", o.color ?? 0x3a5a7a) : pm("paint", o.color ?? 0x3a5a7a, { metalness: 0.4 });
  const r = 0.29;
  const h = 0.88;
  cyl(g, o, r, r, h - 0.02, m, 0, h / 2, 0, 24);
  cyl(g, o, r - 0.005, r - 0.005, 0.01, m, 0, h - 0.008, 0, 24);
  if (det(o) >= 1) {
    for (const y of [h * 0.33, h * 0.66]) part(g, new THREE.TorusGeometry(r + 0.004, 0.01, 6, det(o) >= 2 ? 32 : 16), m, 0, y, 0, Math.PI / 2, 0, 0);
    for (const y of [0.012, h - 0.012]) part(g, new THREE.TorusGeometry(r - 0.004, 0.012, 6, det(o) >= 2 ? 32 : 16), m, 0, y, 0, Math.PI / 2, 0, 0);
    cyl(g, o, 0.03, 0.03, 0.012, pm("steel", 0xb0b0b0), 0.17, h, 0, 12);
    cyl(g, o, 0.02, 0.02, 0.012, pm("steel", 0xb0b0b0), -0.18, h, 0.04, 12);
  }
  return done(g, o, "drum", [boxFrom(r * 2, h, r * 2)]);
}
// A 120 L wheelie bin: tapered body, hinged lid (userData.lid, a separate kept child), two wheels.
export function wheelieBin(o = {}) {
  const g = new THREE.Group();
  const m = pm("plastic", o.color ?? 0x3a6a4a);
  const w = 0.48;
  const d = 0.55;
  const h = 0.93;
  const body = bx(g, o, w, h - 0.06, d, m, 0, (h - 0.06) / 2 + 0.03, 0, 0.03);
  // a slight taper: narrow at the bottom
  const p = body.geometry.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = (p.getY(i) + (h - 0.06) / 2) / (h - 0.06);
    p.setX(i, p.getX(i) * (0.88 + 0.12 * t));
    p.setZ(i, p.getZ(i) * (0.88 + 0.12 * t));
  }
  body.geometry.computeVertexNormals();
  const tyre = pm("rubber", 0x151515);
  for (const s of [-1, 1]) cyl(g, o, 0.1, 0.1, 0.05, tyre, s * 0.22, 0.1, -d / 2 + 0.05, 16, 0, Math.PI / 2);
  strut(g, o, [-0.24, 0.1, -d / 2 + 0.05], [0.24, 0.1, -d / 2 + 0.05], 0.012, pm("steel", 0x888888));
  bx(g, o, w + 0.02, 0.04, 0.05, m, 0, h - 0.06, -d / 2 - 0.02, 0.012); // handle bar at the back
  const lid = new THREE.Group();
  lid.position.set(0, h - 0.03, -d / 2);
  lid.userData.keep = true;
  lid.name = "lid";
  const L = { ...o, ao: false };
  bx(lid, L, w + 0.04, 0.04, d + 0.04, m, 0, 0, d / 2 + 0.01, 0.015);
  g.add(lid);
  const out = done(g, o, "bin", [boxFrom(w, h, d)]);
  out.userData.lid = out.getObjectByName("lid");
  return out;
}
// A tied rubbish bag (squashed, lumpy sphere). seed changes the shape.
export function trashBag(o = {}) {
  const g = new THREE.Group();
  const m = pm("plastic", o.color ?? 0x1c1c1e, { roughness: 0.32 });
  const r = seeded(o.seed ?? 5);
  const geo = new THREE.SphereGeometry(0.3, det(o) >= 2 ? 20 : 10, det(o) >= 2 ? 14 : 8);
  const p = geo.attributes.position;
  const bumps = Array.from({ length: 6 }, () => [new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize(), 0.03 + r() * 0.04]);
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = v.clone().normalize();
    let k = 1;
    for (const [b, a] of bumps) k += Math.max(0, n.dot(b) - 0.6) * a * 6;
    v.multiplyScalar(k);
    v.y = v.y < 0 ? v.y * 0.7 : v.y * 0.85;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  const lift = -geo.boundingBox.min.y;
  part(g, geo, m, 0, lift, 0);
  const top = geo.boundingBox.max.y + lift;
  cyl(g, o, 0.012, 0.05, 0.08, m, 0, top + 0.02, 0, 8);
  if (det(o) >= 1)
    for (const s of [-1, 1]) {
      const ear = part(g, new THREE.SphereGeometry(0.035, 8, 6), m, s * 0.04, top + 0.07, 0);
      ear.scale.set(1, 0.5, 0.4);
    }
  return done(g, o, "bag", [boxFrom(0.6, top, 0.6)]);
}

// ----------------------------------------------------------------------------------------------- plants
let LEAF = null;
const leafTex = () =>
  (LEAF ??= canvasTex(128, (c, S) => {
    c.clearRect(0, 0, S, S);
    // three leaves on a stem: an alpha card (alphaTest) that reads as foliage from any side
    const leaf = (x, y, a, l, w) => {
      c.save();
      c.translate(x, y);
      c.rotate(a);
      const grd = c.createLinearGradient(0, 0, 0, -l);
      grd.addColorStop(0, "#3c6a30");
      grd.addColorStop(1, "#6a9a48");
      c.fillStyle = grd;
      c.beginPath();
      c.moveTo(0, 0);
      c.quadraticCurveTo(w, -l * 0.45, 0, -l);
      c.quadraticCurveTo(-w, -l * 0.45, 0, 0);
      c.fill();
      c.strokeStyle = "rgba(30,60,20,0.8)";
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(0, -l * 0.95);
      c.stroke();
      c.restore();
    };
    c.strokeStyle = "#4a5a2a";
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(S / 2, S);
    c.lineTo(S / 2, S * 0.3);
    c.stroke();
    leaf(S / 2, S * 0.36, 0, S * 0.34, S * 0.14);
    leaf(S / 2, S * 0.62, -0.9, S * 0.36, S * 0.15);
    leaf(S / 2, S * 0.72, 0.85, S * 0.34, S * 0.14);
  }));
// A potted plant. kind: 'leafy' (crossed leaf cards round a stem, ficus-like), 'snake' (upright blades),
// 'shrub' (a clipped round bush, outdoor). h: overall height.
export function plant(o = {}) {
  const kind = o.kind ?? "leafy";
  const h = o.h ?? (kind === "shrub" ? 0.8 : 1.1);
  const g = new THREE.Group();
  const r = seeded(o.seed ?? 7);
  if (kind === "shrub") {
    const leaves = pm("fabric", o.color ?? 0x3a5a2c, { roughness: 1 });
    const geo = new THREE.IcosahedronGeometry(0.5, det(o) >= 2 ? 3 : 1);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const k = 1 + Math.sin(p.getX(i) * 13 + p.getY(i) * 7) * 0.05 + Math.sin(p.getZ(i) * 17) * 0.04;
      p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * (h / 1), p.getZ(i) * k);
    }
    geo.computeVertexNormals();
    geo.computeBoundingBox();
    part(g, geo, leaves, 0, -geo.boundingBox.min.y, 0); // sits on the ground
    return done(g, o, "plant", [boxFrom(1, h, 1)]);
  }
  const potH = h * 0.3;
  const potR = Math.max(0.12, h * 0.15);
  const pot = pm("plastic", o.pot ?? 0xe0dcd2, { roughness: 0.6 });
  cyl(g, o, potR, potR * 0.78, potH, pot, 0, potH / 2, 0, 20);
  if (det(o) >= 1) part(g, new THREE.TorusGeometry(potR, 0.012, 6, 24), pot, 0, potH, 0, Math.PI / 2, 0, 0);
  cyl(g, o, potR - 0.01, potR - 0.01, 0.01, pm("concrete", 0x3a2a1e), 0, potH - 0.02, 0, 20);
  if (kind === "snake") {
    const blade = pm("plastic", 0x3a6a38, { roughness: 0.6, side: THREE.DoubleSide });
    for (let i = 0; i < (det(o) >= 1 ? 9 : 4); i++) {
      const a = r() * Math.PI * 2;
      const bh = (h - potH) * (0.6 + r() * 0.4);
      const b = part(g, new THREE.PlaneGeometry(0.06, bh, 1, 3), blade, Math.cos(a) * potR * 0.4, potH + bh / 2, Math.sin(a) * potR * 0.4, (r() - 0.5) * 0.3, a, (r() - 0.5) * 0.3);
      const bp = b.geometry.attributes.position;
      for (let k = 0; k < bp.count; k++) if (bp.getY(k) > bh * 0.45) bp.setX(k, bp.getX(k) * 0.2);
    }
  } else {
    const leafM = new THREE.MeshStandardMaterial({ map: leafTex(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.75 });
    leafM.name = "prop:leaf";
    strut(g, o, [0, potH - 0.02, 0], [0.02, h * 0.8, 0], 0.012, pm("wood", 0x5a4030));
    const cards = det(o) >= 2 ? 14 : det(o) >= 1 ? 8 : 4;
    const top = h - potH;
    for (let i = 0; i < cards; i++) {
      const s = 0.25 + r() * 0.2;
      const y = potH + top * (0.3 + r() * 0.62);
      const a = r() * Math.PI * 2;
      const rad = 0.05 + r() * 0.12;
      const c = part(g, new THREE.PlaneGeometry(s, s), leafM, Math.cos(a) * rad, y, Math.sin(a) * rad, (r() - 0.5) * 0.6, a, (r() - 0.5) * 0.8);
      c.userData.noCollide = true;
    }
  }
  return done(g, o, "plant", [boxFrom(potR * 2, potH, potR * 2)]);
}

// --------------------------------------------------------------------------------------- street furniture
export function trafficCone(o = {}) {
  const g = new THREE.Group();
  const orange = pm("plastic", 0xf06a1a, { roughness: 0.55 });
  cyl(g, o, 0.035, 0.16, 0.66, orange, 0, 0.37, 0, 20);
  if (det(o) >= 1) for (const [y, r] of [[0.52, 0.075], [0.36, 0.11]]) cyl(g, o, r + 0.002, r + 0.012, 0.07, pm("plastic", 0xf4f4f0, { roughness: 0.3 }), 0, y, 0, 20);
  bx(g, o, 0.38, 0.04, 0.38, pm("rubber", 0x222222), 0, 0.02, 0, 0.02);
  return done(g, o, "cone", [boxFrom(0.38, 0.7, 0.38)]);
}
export function bollard(o = {}) {
  const g = new THREE.Group();
  const h = o.h ?? 0.85;
  const m = pm("paint", o.color ?? 0xd8d8d0, { metalness: 0.4 });
  cyl(g, o, 0.06, 0.07, h, m, 0, h / 2, 0, 16);
  part(g, new THREE.SphereGeometry(0.06, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), m, 0, h, 0);
  if (det(o) >= 1) for (const y of [h - 0.12, h - 0.2]) cyl(g, o, 0.0615, 0.0625, 0.04, pm("paint", 0xd03020, { roughness: 0.3 }), 0, y, 0, 16);
  return done(g, o, "bollard", [boxFrom(0.16, h, 0.16)]);
}

// ------------------------------------------------------------------------------------------------- cars
// A parked car. kind: 'sedan' | 'kei' (tall boxy minicar) | 'van'. Faces +z (the bonnet), wheels on the
// floor; lit: head and tail lights glow. Body panels are bevelled boxes with a big radius; the cabin is
// glass with painted pillars and roof.
export function car(o = {}) {
  const kind = o.kind ?? "sedan";
  const S = { sedan: [1.75, 4.5, 1.45, 0.62, 1.0], kei: [1.48, 3.4, 1.65, 0.6, 0.55], van: [1.7, 4.7, 1.95, 0.6, 0.35] }[kind];
  const [W, L, H, bodyH, hood] = S;
  const g = new THREE.Group();
  const paint = pm("paint", o.color ?? 0x8a9198, { metalness: 0.55, roughness: 0.3 });
  const dark = pm("plastic", 0x1a1c1e, { roughness: 0.6 });
  const glass = pm("paint", 0x1a2228, { metalness: 0.6, roughness: 0.08 });
  const clear = 0.16;
  const wr = 0.31;
  // lower body
  bx(g, o, W, bodyH, L, paint, 0, clear + bodyH / 2, 0, 0.12);
  // cabin: glass box with a painted roof
  const cabL = L - hood - (kind === "sedan" ? 0.9 : 0.25);
  const cabZ = (L / 2 - hood - cabL / 2) - (kind === "sedan" ? 0 : 0);
  const cabH = H - clear - bodyH;
  const cab = bx(g, o, W - 0.12, cabH, cabL, glass, 0, clear + bodyH + cabH / 2 - 0.02, cabZ - (kind === "sedan" ? 0.35 : 0.1), 0.1);
  // taper the cabin's top (the windscreen and back window lean in)
  const p = cab.geometry.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = (p.getY(i) + cabH / 2) / cabH;
    const lean = kind === "sedan" ? 0.32 : kind === "kei" ? 0.12 : 0.06;
    p.setZ(i, p.getZ(i) * (1 - lean * t * (p.getZ(i) > 0 ? 1.3 : 0.7)));
    p.setX(i, p.getX(i) * (1 - 0.06 * t));
  }
  cab.geometry.computeVertexNormals();
  const roof = bx(g, o, W - 0.2, 0.05, cabL * (kind === "sedan" ? 0.62 : 0.86), paint, 0, H - 0.03, cabZ - (kind === "sedan" ? 0.42 : 0.12), 0.025);
  roof.userData.part = "roof";
  if (det(o) >= 1) {
    // bumpers, lights, mirrors, a blank number plate
    for (const s of [-1, 1]) {
      bx(g, o, W + 0.02, 0.14, 0.14, dark, 0, clear + 0.1, s * (L / 2 - 0.03), 0.05);
      bx(g, o, 0.2, 0.06, 0.02, pm("plastic", 0xf0f0e8), 0, clear + 0.25, s * (L / 2 + 0.002), 0.004);
    }
    const head = pm("glow", 0xfff6e0, { emissiveIntensity: o.lit ? 2 : 0.05 });
    const tail = pm("glow", 0xd01810, { emissiveIntensity: o.lit ? 1.6 : 0.25 });
    for (const sx of [-1, 1]) {
      bx(g, o, 0.3, 0.09, 0.03, head, sx * (W / 2 - 0.22), clear + bodyH - 0.12, L / 2 - 0.005, 0.02);
      bx(g, o, 0.26, 0.09, 0.03, tail, sx * (W / 2 - 0.2), clear + bodyH - 0.12, -L / 2 + 0.005, 0.02);
      bx(g, o, 0.04, 0.09, 0.15, paint, sx * (W / 2 + 0.03), clear + bodyH + 0.08, L / 2 - hood - 0.05, 0.015);
      // door seams and handles from the trim sheet / small boxes
      if (det(o) >= 2) bx(g, o, 0.012, 0.025, 0.14, dark, sx * (W / 2 + 0.002), clear + bodyH - 0.12, -0.15, 0.005);
    }
  }
  // wheels in dark arches
  const tyre = pm("rubber", 0x141414);
  const rim = pm("steel", 0xb8bcc0);
  for (const sz of [-1, 1])
    for (const sx of [-1, 1]) {
      const z = sz * (L / 2 - (kind === "kei" ? 0.55 : 0.8));
      cyl(g, o, wr, wr, 0.2, tyre, sx * (W / 2 - 0.1), wr, z, 24, 0, Math.PI / 2);
      if (det(o) >= 1) cyl(g, o, wr * 0.6, wr * 0.6, 0.012, rim, sx * (W / 2 + 0.002), wr, z, 20, 0, Math.PI / 2);
      if (det(o) >= 1) bx(g, o, 0.02, wr * 1.2, wr * 2.3, dark, sx * (W / 2 - 0.005), clear + 0.18, z, 0.01);
    }
  const out = done(g, o, "car", [boxFrom(W + 0.1, H, L + 0.05)]);
  if (o.interior) carInterior(out, o, { W, L, H, clear, bodyH, cabL, cabZ, kind });
  return out;
}
// the inside of a car for a ride scene (standard 1.7): o.interior = true adds group "interior" (hidden; show it and hide userData.shell
// when the camera is inside): floor, roof lining, pillars, side and front glass, dashboard, wheel, seats. userData.seats = eye points
// [{ id, x, y, z }] in the car's space (front +z, so the right hand is -x; the driver sits on the right, as in Japan).
function carInterior(car, o, { W, L, H, clear, bodyH, cabL, cabZ }) {
  const shell = [...car.children];
  const I = new THREE.Group(); I.name = "interior"; I.visible = false;
  const trim = pm("plastic", 0x2a2c2a, { roughness: 0.7 }), lining = pm("fabric", 0x8a877e, { roughness: 1 }), seat = pm("fabric", o.seatColor ?? 0x3a3f44, { roughness: 0.95 });
  const glassIn = new THREE.MeshStandardMaterial({ color: 0x9fb6b2, transparent: true, opacity: 0.12, roughness: 0.1, depthWrite: false });
  const iw = W - 0.16, floorY = clear + 0.12, roofY = H - 0.08, z0 = cabZ - cabL / 2, z1 = cabZ + cabL / 2;
  const box = (w, h, d, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); I.add(b); return b; };
  box(iw, 0.04, cabL, trim, 0, floorY, cabZ); box(iw, 0.04, cabL, lining, 0, roofY, cabZ);
  for (const sx of [-1, 1]) {
    box(0.05, clear + bodyH - floorY, cabL, trim, sx * iw / 2, (floorY + clear + bodyH) / 2, cabZ);
    for (const z of [z0 + 0.05, cabZ, z1 - 0.05]) box(0.06, roofY - clear - bodyH, 0.1, trim, sx * iw / 2, (roofY + clear + bodyH) / 2, z);
    const gl = box(0.01, roofY - clear - bodyH - 0.06, cabL - 0.1, glassIn, sx * (iw / 2 - 0.01), (roofY + clear + bodyH) / 2, cabZ); gl.renderOrder = 2;
  }
  box(iw, 0.36, 0.5, trim, 0, clear + bodyH - 0.02, z1 - 0.25);
  const ws = box(iw, roofY - clear - bodyH, 0.01, glassIn, 0, (roofY + clear + bodyH) / 2, z1 + 0.02); ws.renderOrder = 2;
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.025, 6, 20), trim); wheel.position.set(-iw / 4, clear + bodyH + 0.18, z1 - 0.6); wheel.rotation.x = -0.9; I.add(wheel);
  const rows = Math.max(1, Math.min(3, Math.floor((cabL - 0.8) / 0.85)));
  const seats = [];
  for (let r = 0; r < rows; r++) {
    const z = z1 - 1.0 - r * 0.85;
    for (const [sx, id] of [[-1, r ? `rear${r}-right` : "driver"], [1, r ? `rear${r}-left` : "front-left"]]) {   // facing +z, the right hand is -x
      const x = sx * iw / 4;
      box(iw / 2 - 0.1, 0.12, 0.5, seat, x, floorY + 0.36, z + 0.05);
      box(iw / 2 - 0.1, 0.62, 0.12, seat, x, floorY + 0.7, z - 0.22);
      seats.push({ id, x, y: floorY + 1.15, z: z + 0.05 });
    }
  }
  car.add(I);
  car.userData.interior = I; car.userData.shell = shell; car.userData.seats = seats;
  return I;
}
