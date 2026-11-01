/* game-kit 6e0b6f0: js/prop-batch.js — edit in game-kit and run tools/kit-sync.js */
// Putting many props in a scene cheaply: merge by material with baked AO, instancing, LOD, collision
// boxes for controller.js, and soft contact shadows under furniture.
//
//   import { mergeProps, mergePlaced, instanceProps, propLOD, propColliders, contactShadow, withContactShadow } from "./prop-batch.js";
//   const desk = mergeProps(group, { ao: true });                    // one mesh per material, AO baked
//   const room = mergePlaced([desk1, desk2, shelf]);                // a whole room of placed props -> few draw calls
//   const chairs = instanceProps(() => E.bench(), [{ x: 0, z: 2, ry: 0 }, { x: 2, z: 2, ry: Math.PI }]);
//   scene.add(propLOD((detail) => E.vendingMachine({ detail }), [0, 8, 20]));
//   colliders.push(...propColliders(obj));                             // [{ box, tag }] for FirstPersonController
//   scene.add(withContactShadow(obj));                                 // a soft dark patch on the floor under it
//
// Rules: parts that move (doors, drawers, lids) are marked with userData.keep = true by the builders and
// are left out of every merge (they stay separate objects you can animate). userData.colliders on a
// prop (THREE.Box3[] in the prop's own space) is used for collisions instead of its full bounds.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { bakeAO, localBox } from "./prop-geo.js";
import { withVertexColors, baseMaterial } from "./prop-mats.js";

const ATTRS = ["position", "normal", "uv", "color"];

// geometry of one mesh moved into `space` (a Matrix4 that maps world -> merge space), with exactly
// position / normal / uv / color, indexed
function prepared(mesh, space) {
  const g = mesh.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(space, mesh.matrixWorld));
  for (const k of Object.keys(g.attributes)) if (!ATTRS.includes(k)) g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  const n = g.attributes.position.count;
  if (!g.attributes.uv) g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  if (!g.attributes.color) g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  if (g.attributes.color.itemSize === 4) {
    const c4 = g.attributes.color;
    const c3 = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) [c3[i * 3], c3[i * 3 + 1], c3[i * 3 + 2]] = [c4.getX(i), c4.getY(i), c4.getZ(i)];
    g.setAttribute("color", new THREE.BufferAttribute(c3, 3));
  }
  if (!g.index) g.setIndex([...Array(n).keys()]);
  g.clearGroups();
  g.morphAttributes = {};
  return g;
}

const isKept = (o, root) => {
  for (let p = o; p && p !== root; p = p.parent) if (p.userData.keep) return true;
  return false;
};

// buckets: Map(material -> geometry[]) of the meshes under `roots`, in `space`. With o.ao each part
// that has no AO yet gets it baked here (in the merge space, so the floor is y 0 of that space unless
// o.ao.floor says otherwise); parts that already have it (built by env-props / props) keep theirs.
// The AO copy of a material is grouped with its base material (one draw call for both).
function collect(roots, space, o, stopAt = null) {
  const out = new Map();
  for (const root of roots)
    root.traverse((m) => {
      if (!m.isMesh || m.isInstancedMesh || m.isSkinnedMesh || isKept(m, stopAt || root) || m.userData.noMerge) return;
      if (Array.isArray(m.material)) return; // multi-material meshes stay as they are
      const g = prepared(m, space);
      if (o.ao && !m.geometry.userData.aoBaked) bakeAO(g, typeof o.ao === "object" ? o.ao : {});
      const key = baseMaterial(m.material);
      if (!out.has(key)) out.set(key, []);
      out.get(key).push(g);
    });
  return out;
}

function build(buckets, o) {
  const group = new THREE.Group();
  for (const [mat, list] of buckets) {
    const geo = mergeGeometries(list);
    list.forEach((g) => g.dispose());
    const tinted = hasTint(geo);
    const m = tinted ? withVertexColors(mat) : mat;
    if (tinted) geo.userData.aoBaked = true;
    const mesh = new THREE.Mesh(geo, m);
    mesh.castShadow = !!o.castShadow && !mat.transparent;
    mesh.receiveShadow = !!o.receiveShadow;
    if (mat.transparent) mesh.renderOrder = 2;
    group.add(mesh);
  }
  return group;
}
function hasTint(geo) {
  const c = geo.attributes.color.array;
  for (let i = 0; i < c.length; i++) if (c[i] !== 1) return true;
  return false;
}

// Merge a prop (a Group of parts) into one mesh per material. The parts marked userData.keep (doors,
// drawers) are moved over unmerged, and userData (colliders, drawers, anchors) is kept.
// o.ao: true or bakeAO options (floor height in the prop's space, reach, ...). Floor = y 0 of the prop.
export function mergeProps(group, o = {}) {
  group.updateMatrixWorld(true);
  const space = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const out = build(collect([group], space, o, group), o);
  const kept = [];
  group.traverse((c) => {
    if (c !== group && c.userData.keep && !isKept(c.parent, group)) kept.push(c);
  });
  for (const k of kept) {
    // keep where it is relative to the prop's root (it may sit inside a nested group)
    new THREE.Matrix4().multiplyMatrices(space, k.matrixWorld).decompose(k.position, k.quaternion, k.scale);
    out.add(k);
  }
  out.userData = { ...group.userData };
  out.name = group.name;
  return out;
}

// Merge many placed props (already positioned under the scene or one parent) into one Group in world
// space: a room of furniture becomes a handful of draw calls. Moving parts (userData.keep) are not merged;
// with o.remove they are re-parented to the result and the originals are taken out of their parents.
// Returns the Group plus .userData.colliders: world boxes of every prop (for controller.js).
export function mergePlaced(objects, o = {}) {
  objects.forEach((x) => x.updateMatrixWorld(true));
  const out = build(collect(objects, new THREE.Matrix4(), o), o);
  out.userData.colliders = objects.flatMap((x) => propColliders(x, { tag: o.tag }));
  if (o.remove)
    for (const x of objects) {
      const kept = [];
      x.traverse((c) => c !== x && c.userData.keep && !isKept(c.parent, x) && kept.push(c));
      for (const k of kept) out.attach(k);
      x.removeFromParent();
    }
  return out;
}

// One InstancedMesh per material of a prop for many copies (chairs in a hall, lockers in a row, street
// lights). make: a Group or a function returning one. at: [{ x, y, z, ry, s }] or THREE.Matrix4[].
// Moving parts are left out (instanced copies do not open). Returns a Group with .userData.colliders.
export function instanceProps(make, at, o = {}) {
  const proto = typeof make === "function" ? make() : make;
  const merged = mergeProps(proto, o);
  const mats = at.map((p) =>
    p.isMatrix4
      ? p
      : new THREE.Matrix4().compose(
          new THREE.Vector3(p.x || 0, p.y || 0, p.z || 0),
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.ry || 0),
          new THREE.Vector3().setScalar(p.s || 1),
        ),
  );
  const out = new THREE.Group();
  for (const m of merged.children) {
    if (!m.isMesh || m.userData.keep) continue;
    const im = new THREE.InstancedMesh(m.geometry, m.material, mats.length);
    mats.forEach((mt, i) => im.setMatrixAt(i, mt));
    im.instanceMatrix.needsUpdate = true;
    im.castShadow = m.castShadow;
    im.receiveShadow = m.receiveShadow;
    im.computeBoundingSphere();
    out.add(im);
  }
  const local = proto.userData.colliders?.length ? proto.userData.colliders : [localBox(proto)];
  out.userData.colliders = mats.flatMap((mt) => local.map((b) => ({ box: b.clone().applyMatrix4(mt), tag: o.tag || proto.userData.kind || "prop" })));
  out.userData.kind = proto.userData.kind;
  return out;
}

// Level of detail. make(detail) builds the prop at detail 2 (full), 1 (no small parts, fewer bevel
// segments) or 0 (a few boxes). dists: the distance at which each level starts, e.g. [0, 8, 20].
// hide: a distance after which nothing is drawn (optional). The levels are merged with mergeProps.
export function propLOD(make, dists = [0, 8, 20], o = {}) {
  const lod = new THREE.LOD();
  const levels = dists.length;
  dists.forEach((d, i) => {
    const detail = Math.max(0, 2 - Math.round((i * 2) / Math.max(1, levels - 1)));
    const obj = mergeProps(make(detail), o);
    lod.addLevel(obj, d);
    if (i === 0) lod.userData = { ...obj.userData };
  });
  if (o.hide) lod.addLevel(new THREE.Object3D(), o.hide);
  lod.autoUpdate = true;
  return lod;
}

// Collision boxes of a prop in world space, in the shape controller.js wants: [{ box, tag, off }].
// Uses userData.colliders (local Box3s set by the builders: a desk is its top and legs area, a door
// frame its two jambs) or else the bounds of the whole prop.
export function propColliders(obj, o = {}) {
  obj.updateMatrixWorld(true);
  const local = obj.userData.colliders?.length ? obj.userData.colliders : [localBox(obj)];
  return local.filter((b) => !b.isEmpty()).map((b) => ({ box: b.clone().applyMatrix4(obj.matrixWorld), tag: o.tag || obj.userData.kind || "prop", off: false }));
}

// ------------------------------------------------------------------------------------- contact shadows
let SHADOW_TEX = null;
function shadowTexture() {
  if (SHADOW_TEX || typeof document === "undefined") return SHADOW_TEX;
  const S = 128;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d");
  // a rounded-rectangle falloff: a radial gradient stretched by the plane's own scale
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grd.addColorStop(0, "rgba(0,0,0,1)");
  grd.addColorStop(0.55, "rgba(0,0,0,0.75)");
  grd.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  SHADOW_TEX = new THREE.CanvasTexture(c);
  return SHADOW_TEX;
}
const SHADOW_MATS = new Map();

// A soft dark patch on the floor (w x d metres, centred on the origin, a few mm above y 0). Not a
// real shadow: it is the contact darkening that real AO / soft shadows give and that keeps furniture,
// people and animals from looking like they float. One draw call; cheap enough for phones.
export function contactShadow(w = 1, d = 1, o = {}) {
  const op = o.opacity ?? 0.5;
  if (!SHADOW_MATS.has(op))
    SHADOW_MATS.set(op, new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: shadowTexture(), transparent: true, opacity: op, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), SHADOW_MATS.get(op));
  m.rotation.x = -Math.PI / 2;
  m.position.y = o.y ?? 0.003;
  m.renderOrder = 1;
  m.userData.noCollide = true;
  m.name = "contactShadow";
  return m;
}

// Add a contact shadow under a prop, sized from its footprint (pad: extra metres around it).
export function withContactShadow(obj, o = {}) {
  const b = localBox(obj);
  const pad = o.pad ?? 0.12;
  const s = contactShadow(b.max.x - b.min.x + pad * 2, b.max.z - b.min.z + pad * 2, o);
  s.position.x = (b.min.x + b.max.x) / 2;
  s.position.z = (b.min.z + b.max.z) / 2;
  obj.add(s);
  return obj;
}
