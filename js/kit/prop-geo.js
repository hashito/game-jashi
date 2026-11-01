/* game-kit 6e0b6f0: js/prop-geo.js — edit in game-kit and run tools/kit-sync.js */
// Geometry helpers for props and furniture (no DOM: runs in Node, see test/prop-geo.test.mjs).
//
//   bevelBox(w, h, d, { r: 0.01, seg: 1, uv: 1 })   box with rounded / chamfered edges, UVs in metres
//   metricUV(geo, 1)                                  re-project UVs by box mapping (1 texture = 1 m)
//   bakeAO(geo, { floor: 0, reach: 0.35 })            vertex-colour occlusion: dark near the floor and underneath
//   localBox(obj) / boxFrom(w, h, d, x, y, z)         collision boxes (THREE.Box3) in the prop's own space
//
// Why: a bare BoxGeometry has razor edges that never catch a highlight, UVs that stretch one texture over
// the whole face whatever its size, and nothing that darkens the bottom where it meets the floor. Those
// three are most of why primitive furniture reads as "grey boxes" (docs/3d-audit.md items 3 and 7).
import * as THREE from "three";

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();

// A box w x h x d centred on the origin whose 12 edges are rounded with radius r (seg = 1 is a cheap
// chamfer with smooth normals; 2-3 is round). The flat faces stay exactly at +-w/2 etc., so a bevelled
// box replaces a BoxGeometry of the same size without moving anything (top of a desk stays at h).
// uv: metres per texture repeat (box mapping per face), or 0 to keep 0..1 per face.
export function bevelBox(w, h, d, o = {}) {
  const half = [w / 2, h / 2, d / 2];
  const r = Math.max(0, Math.min(o.r ?? 0.01, ...half.map((x) => x * 0.999)));
  const seg = Math.max(1, Math.round(o.seg ?? 1));
  if (r < 1e-5) {
    const g = new THREE.BoxGeometry(w, h, d);
    g.clearGroups();
    return o.uv === 0 ? g : metricUV(g, o.uv ?? 1);
  }
  const n = 2 * seg + 1; // grid intervals per axis: seg bevel steps, one flat span, seg bevel steps
  const g = new THREE.BoxGeometry(1, 1, 1, n, n, n);
  const p = g.attributes.position;
  const nor = g.attributes.normal;
  const inner = half.map((x) => x - r);
  const u = [0, 0, 0];
  for (let i = 0; i < p.count; i++) {
    for (let a = 0; a < 3; a++) {
      const c = p.getComponent(i, a); // -0.5 .. 0.5 on the unit grid
      const k = Math.round((c + 0.5) * n);
      const neg = k <= seg;
      const f = neg ? (seg - k) / seg : (k - seg - 1) / seg; // 0 = start of the bevel, 1 = the edge
      // the face axis of this vertex is at the edge (|c| = 0.5): f = 1 there
      u[a] = (neg ? -1 : 1) * (Math.abs(c) > 0.4999 ? 1 : Math.tan((f * Math.PI) / 4));
      p.setComponent(i, a, neg ? -inner[a] : inner[a]);
    }
    _n.set(u[0], u[1], u[2]).normalize();
    _v.fromBufferAttribute(p, i).addScaledVector(_n, r);
    p.setXYZ(i, _v.x, _v.y, _v.z);
    nor.setXYZ(i, _n.x, _n.y, _n.z);
  }
  g.clearGroups();
  if (o.uv !== 0) metricUV(g, o.uv ?? 1);
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

// Box-mapped UVs in metres: each vertex is projected on the plane of its strongest normal axis, so a
// texture keeps its real size on every face of every prop (no stretched wood grain on a long shelf).
// scale = metres per repeat. rot: true swaps u/v (grain along the other direction).
export function metricUV(geo, scale = 1, rot = false) {
  const p = geo.attributes.position;
  const nr = geo.attributes.normal;
  if (!nr) geo.computeVertexNormals();
  const N = geo.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const ax = Math.abs(N.getX(i));
    const ay = Math.abs(N.getY(i));
    const az = Math.abs(N.getZ(i));
    let s;
    let t;
    if (ay >= ax && ay >= az) [s, t] = [x, z];
    else if (ax >= az) [s, t] = [z, y];
    else [s, t] = [x, y];
    if (rot) [s, t] = [t, s];
    uv[i * 2] = s / scale;
    uv[i * 2 + 1] = t / scale;
  }
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return geo;
}

// UVs for a CylinderGeometry in metres (u around the circumference, v along the height).
export function cylinderUV(geo, scale = 1) {
  const pr = geo.parameters || {};
  const circ = Math.PI * ((pr.radiusTop ?? 1) + (pr.radiusBottom ?? 1));
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * circ) / scale, (uv.getY(i) * (pr.height ?? 1)) / scale);
  return geo;
}

// Vertex-colour ambient occlusion baked into a geometry that is already in the space of the room or
// prop root (floor at y = floor). Three cheap terms that do most of the work of real AO for furniture:
//  - height: a dark band where the prop meets the floor, fading over `reach` metres
//  - underside: faces that point down are darker (they only ever see the floor)
//  - inside: optional boxes (o.cavities, THREE.Box3[]) whose inside is darker (shelf bays, lockers)
// Writes a `color` attribute (multiply), so the material needs vertexColors: true (prop-mats.js does it).
export function bakeAO(geo, o = {}) {
  const floor = o.floor ?? 0;
  const reach = o.reach ?? 0.35;
  const min = o.min ?? 0.45; // brightness right at the floor
  const under = o.under ?? 0.55; // brightness of a face pointing straight down
  const cav = o.cavities || [];
  const p = geo.attributes.position;
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const N = geo.attributes.normal;
  const prev = geo.attributes.color;
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) - floor;
    const t = Math.max(0, Math.min(1, y / reach));
    let ao = min + (1 - min) * t * t * (3 - 2 * t); // smoothstep
    const ny = N.getY(i);
    if (ny < 0) ao *= 1 - (1 - under) * -ny;
    if (cav.length) {
      _v.fromBufferAttribute(p, i);
      for (const b of cav) if (b.containsPoint(_v)) ao *= o.cavity ?? 0.7;
    }
    const base = prev ? [prev.getX(i), prev.getY(i), prev.getZ(i)] : [1, 1, 1];
    col[i * 3] = base[0] * ao;
    col[i * 3 + 1] = base[1] * ao;
    col[i * 3 + 2] = base[2] * ao;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return geo;
}

// A collision box in the prop's own space (origin = floor centre).
export const boxFrom = (w, h, d, x = 0, y = h / 2, z = 0) => new THREE.Box3(new THREE.Vector3(x - w / 2, y - h / 2, z - d / 2), new THREE.Vector3(x + w / 2, y + h / 2, z + d / 2));

// Bounds of an object in its own space (ignores its position / rotation in the parent).
export function localBox(obj) {
  const box = new THREE.Box3();
  obj.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(obj.matrixWorld).invert();
  obj.traverse((o) => {
    if (!o.isMesh || o.userData.noCollide) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    const b = o.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    box.union(b);
  });
  return box;
}

// Triangle count of an object (for budgets and LOD checks).
export function triCount(obj) {
  let n = 0;
  obj.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry;
    const tris = (g.index ? g.index.count : g.attributes.position.count) / 3;
    n += tris * (o.isInstancedMesh ? o.count : 1);
  });
  return n;
}

// Draw calls an object adds (meshes x material groups), for the gallery and tests.
export function drawCalls(obj) {
  let n = 0;
  obj.traverse((o) => {
    if (o.isMesh && o.visible) n += Array.isArray(o.material) ? Math.max(1, o.geometry.groups.length) : 1;
  });
  return n;
}
