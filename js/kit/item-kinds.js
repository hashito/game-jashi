/* game-kit 6e0b6f0: js/item-kinds.js — edit in game-kit and run tools/kit-sync.js */
// Item kinds (standard 1.7, "置くだけ"): an item or a document with a `kind` is shown as a model of that thing instead of a coloured box,
// resting on what is under it (a desk, a shelf board, the floor; W3), slightly larger than life so it reads from 1-3 m (W11).
//   items.json  { "id": "I1", "kind": "key", "room": "R1", "x": 2, "z": 3 }              -> a key on the desk at (2, 3)
//   docs.json   { "id": "N1", "room": "R1", "x": 1, "z": 1 }                            -> a sheet of paper (docs default to "paper")
//   either: "y" (the support height) and "scale" override; ext can still replace the look (the pickup mesh is named item:<id> / doc:<id>).
// makeItemModel(kind, o) -> THREE.Group with its origin at the bottom centre (y = 0 rests on the surface); ITEM_KINDS lists the kinds.
// supportY(colliders, x, z, floorY, maxH) is pure: the highest collider top under (x, z) that a hand could reach (default <= 1.4 m).
import * as THREE from 'three';
import * as IM from './item-models.js';
import { ITEM_RECIPES, ITEM_MATERIALS, BASIC_KINDS, ITEM_GROUPS, itemGroup } from './item-catalog.js';

const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, ...o });
const box = (g, w, h, d, m, x = 0, y = 0, z = 0) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y + h / 2, z); b.castShadow = true; g.add(b); return b; };
const cyl = (g, r0, r1, h, m, x = 0, y = 0, z = 0, seg = 16) => { const c = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg), m); c.position.set(x, y + h / 2, z); c.castShadow = true; g.add(c); return c; };
const grp = (f) => (o = {}) => { const g = new THREE.Group(); f(g, o); return g; };

// each: a function (o) -> Group (origin at the bottom) and a label (for docs / tools)
export const ITEM_KINDS = {
  key: { label: '鍵', make: (o) => IM.key(o) },
  card: { label: 'カード・社員証', make: (o) => IM.idCard(o) },
  paper: { label: '紙・メモ・手紙', make: (o) => IM.paperSheet(o) },
  clipboard: { label: '書類ばさみ', make: (o) => IM.clipboard(o) },
  book: { label: '本・帳面・日誌', make: (o) => IM.book(o) },
  photo: { label: '写真立て', make: (o) => IM.photoFrame(o) },
  tag: { label: '札・タグ', make: (o) => IM.tag(o) },
  tape: { label: 'テープ・ロール', make: (o) => IM.roll(o) },
  talisman: { label: 'お札', make: grp((g, o) => { for (let i = 0; i < (o.n ?? 1); i++) { const p = box(g, 0.07, 0.003, 0.2, mat(o.color ?? 0xdccfa6, { roughness: 1 }), i * 0.085 - (o.n ? 0.04 : 0), i * 0.003); p.rotation.y = i * 0.08; } }) },
  bag: { label: '袋（塩・米）', make: grp((g, o) => { const b = box(g, 0.24, 0.3, 0.14, mat(o.color ?? 0xe8e2d0, { roughness: 1 })); b.scale.set(1, 1, 1); box(g, 0.2, 0.04, 0.12, mat(o.color ?? 0xe0d8c4, { roughness: 1 }), 0, 0.3); }) },
  bottle: { label: '瓶', make: grp((g, o) => { const m = mat(o.color ?? 0x3a2a1c, { roughness: 0.2, metalness: 0.1 }); cyl(g, 0.04, 0.04, 0.2, m); cyl(g, 0.015, 0.04, 0.06, m, 0, 0.2); cyl(g, 0.016, 0.016, 0.03, mat(0xa83a2a), 0, 0.26); }) },
  box: { label: '箱', make: grp((g, o) => { box(g, o.w ?? 0.16, o.h ?? 0.12, o.d ?? 0.16, mat(o.color ?? 0x5a4030)); }) },
  phone: { label: '携帯電話', make: grp((g, o) => { box(g, 0.05, 0.016, 0.1, mat(o.color ?? 0x2a2c30, { roughness: 0.4 })); }) },
  flashlight: { label: '懐中電灯', make: grp((g, o) => { const c = cyl(g, 0.022, 0.022, 0.18, mat(o.color ?? 0x2a2a2a, { metalness: 0.5 }), 0, 0.022); c.rotation.z = Math.PI / 2; c.position.y = 0.022; const h = cyl(g, 0.032, 0.026, 0.05, mat(0x444444, { metalness: 0.6 }), 0.1, 0.022); h.rotation.z = Math.PI / 2; h.position.y = 0.032; }) },
  tool: { label: '工具', make: grp((g, o) => { box(g, 0.2, 0.02, 0.03, mat(o.color ?? 0x7a7e84, { metalness: 0.7, roughness: 0.4 })); box(g, 0.04, 0.02, 0.06, mat(o.color ?? 0x7a7e84, { metalness: 0.7, roughness: 0.4 }), 0.1); }) },
  cloth: { label: '布', make: grp((g, o) => { box(g, 0.3, 0.03, 0.22, mat(o.color ?? 0xd8d2c0, { roughness: 1 })); }) },
  jar: { label: '壺・缶', make: grp((g, o) => { cyl(g, 0.06, 0.07, 0.14, mat(o.color ?? 0x8a7a60, { roughness: 0.6 }), 0, 0, 0, 18); }) },
  battery: { label: '電池', make: grp((g, o) => { for (let i = 0; i < (o.n ?? 4); i++) { const c = cyl(g, 0.007, 0.007, 0.05, mat(i % 2 ? 0x2a2a2a : 0xb08a3a, { metalness: 0.5 }), i * 0.016 - 0.024, 0.007); c.rotation.z = Math.PI / 2; } }) },
};
export const DOC_KIND = 'paper';

// ---- standard 1.9: the recipe kinds of js/item-catalog.js (174 more) ----
// item textures: assets/textures/item/<tex>.webp next to the page (kit-sync copies the ones a game's items use). setItemTextureBase() for another place;
// a texture that does not load leaves the material's own colour, so a kind always shows (also in Node, where nothing is loaded).
let texBase = 'assets/textures/';
export const setItemTextureBase = (url) => { texBase = url.endsWith('/') ? url : `${url}/`; };
const texCache = new Map(), matCache = new Map();
function itemTexture(id, onLoad) {
  if (typeof document === 'undefined') return null;
  let e = texCache.get(id);
  if (!e) {
    e = { tex: null, ok: false, wait: [] }; texCache.set(id, e);
    e.tex = new THREE.TextureLoader().load(`${texBase}item/${id}.webp`, () => { e.ok = true; e.wait.splice(0).forEach((f) => f(e.tex)); }, undefined, () => { e.wait.length = 0; });
    e.tex.colorSpace = THREE.SRGBColorSpace; e.tex.anisotropy = 4;
  }
  if (e.ok) onLoad(e.tex); else e.wait.push(onLoad);
  return e.tex;
}
/** a material for a recipe part: a name of ITEM_MATERIALS (shared), '#rrggbb', or '$' (the item's colour) */
export function itemMaterial(m, main = '#8a8a88') {
  if (m === '$') m = main;
  if (typeof m === 'string' && m.startsWith('#')) { const k = `c:${m}`; if (!matCache.has(k)) matCache.set(k, mat(m)); return matCache.get(k); }
  if (matCache.has(m)) return matCache.get(m);
  const d = ITEM_MATERIALS[m] || { c: '#ff00ff' };
  const o = { roughness: d.r ?? 0.8, metalness: d.m ?? 0 };
  if (d.o != null) Object.assign(o, { transparent: true, opacity: d.o, depthWrite: false });
  if (d.e) Object.assign(o, { emissive: new THREE.Color(d.e), emissiveIntensity: 0.8 });
  const M = mat(d.c, o);
  if (d.tex) itemTexture(d.tex, (t) => { M.map = t; M.color.set(d.e ? d.c : '#ffffff'); M.needsUpdate = true; });
  matCache.set(m, M);
  return M;
}
const RAD = Math.PI / 180;
/** build a recipe (js/item-catalog.js) into a Group */
export function buildRecipe(r, o = {}) {
  const g = new THREE.Group(), main = o.color || r.main;
  for (const p of r.parts) {
    let geo, m, pos, rot = [0, 0, 0], scl = null, lift = 0;
    if (p[0] === 'b') { geo = new THREE.BoxGeometry(p[1], p[2], p[3]); m = p[4]; pos = p.slice(5, 8); rot = p.slice(8, 11); lift = p[2] / 2; }
    else if (p[0] === 'c') { geo = new THREE.CylinderGeometry(p[1], p[2], p[3], p[11] || 16); m = p[4]; pos = p.slice(5, 8); rot = p.slice(8, 11); lift = p[3] / 2; }
    else if (p[0] === 's') { geo = new THREE.SphereGeometry(p[1], 18, 12); m = p[2]; pos = p.slice(3, 6); scl = p.slice(6, 9); rot = [0, p[9] || 0, 0]; }
    else if (p[0] === 't') { geo = new THREE.TorusGeometry(p[1], p[2], 8, 24, ((p[10] ?? 360) * RAD)); m = p[3]; pos = p.slice(4, 7); rot = p.slice(7, 10); lift = p[2]; }
    else continue;
    const mesh = new THREE.Mesh(geo, itemMaterial(m, main));
    mesh.rotation.set((rot[0] || 0) * RAD, (rot[1] || 0) * RAD, (rot[2] || 0) * RAD);
    if (scl) mesh.scale.set(scl[0] ?? 1, scl[1] ?? 1, scl[2] ?? 1);
    // y is the bottom of the part AFTER its rotation / scale (a lying cylinder rests on its side)
    mesh.updateMatrix(); geo.computeBoundingBox(); lift = -geo.boundingBox.clone().applyMatrix4(mesh.matrix).min.y;
    mesh.position.set(pos[0] || 0, (pos[1] || 0) + lift, pos[2] || 0);
    mesh.castShadow = true; g.add(mesh);
  }
  return g;
}
for (const [k, r] of Object.entries(ITEM_RECIPES)) if (!ITEM_KINDS[k]) ITEM_KINDS[k] = { label: r.label, group: r.group, make: (o) => buildRecipe(r, o) };
for (const [k, l] of Object.entries(BASIC_KINDS)) if (ITEM_KINDS[k]) ITEM_KINDS[k].group = 'basic';
/** a game's own kind (ext.registerItemKind lands here): make(o) -> Group */
export function registerItemKind(kind, make, label = kind) { if (typeof make !== 'function') throw new Error(`item kind "${kind}": needs a make function`); ITEM_KINDS[kind] = { label, group: 'game', make }; }
export { ITEM_GROUPS, itemGroup };

// a model of the kind, origin at the bottom centre, scaled up a little (W11: small things are placed larger than life)
export function makeItemModel(kind, o = {}) {
  const k = ITEM_KINDS[kind];
  if (!k) return null;
  const g = k.make(o);
  const b = new THREE.Box3().setFromObject(g);
  if (!b.isEmpty()) { const c = b.getCenter(new THREE.Vector3()); g.children.forEach((ch) => { ch.position.x -= c.x; ch.position.z -= c.z; ch.position.y -= b.min.y; }); }
  const s = o.scale ?? 1.35;
  const wrap = new THREE.Group(); wrap.add(g); g.scale.setScalar(s); wrap.name = `kind:${kind}`;
  wrap.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  return wrap;
}

// the surface a thing at (x, z) rests on: the highest collider top under it at most maxH above the floor (desks, tables, shelf tops), else the floor (pure)
export function supportY(colliders, x, z, floorY = 0, maxH = 1.4) {
  let y = floorY;
  for (const c of colliders || []) {
    if (c.off) continue;
    const b = c.box, mn = b.min, mx = b.max;
    if (x < mn.x || x > mx.x || z < mn.z || z > mx.z) continue;
    const top = mx.y;
    if (top > floorY + 0.02 && top <= floorY + maxH && top > y && mn.y <= floorY + 0.3) y = top;
  }
  return y;
}

// table and desk tops in a room (pure): low colliders (0.5-1.2 m above the floor) at least 0.3 m wide, inside the room, largest first
export function topsIn(colliders, room, floorY = 0) {
  const out = [];
  for (const c of colliders || []) {
    if (c.off) continue;
    const b = c.box, h = b.max.y - floorY, w = b.max.x - b.min.x, d = b.max.z - b.min.z;
    if (h < 0.5 || h > 1.2 || w < 0.3 || d < 0.3 || b.min.y > floorY + 0.3) continue;
    const x = (b.min.x + b.max.x) / 2, z = (b.min.z + b.max.z) / 2;
    if (x < room.x || x > room.x + room.w || z < room.z || z > room.z + room.d) continue;
    out.push({ x, z, y: b.max.y, area: w * d, minX: b.min.x, maxX: b.max.x, minZ: b.min.z, maxZ: b.max.z });
  }
  return out.sort((a, b) => b.area - a.area);
}

// Things on a desk must not stick out (2026-11-01, user: 机の上の物が飛び出す). Both pure:
// seatOn: rest a thing of footprint w x d near (x, z) on the highest top under it, moved inward so the whole footprint stays on the top
// (EDGE m from each edge); a top smaller than the thing gets it centred. No top under it = the floor, (x, z) unchanged.
export const EDGE = 0.03;
export function seatOn(colliders, x, z, w = 0.2, d = 0.2, floorY = 0, maxH = 1.4) {
  let best = null;
  for (const c of colliders || []) {
    if (c.off) continue;
    const b = c.box, top = b.max.y;
    if (x < b.min.x || x > b.max.x || z < b.min.z || z > b.max.z) continue;
    if (top > floorY + 0.02 && top <= floorY + maxH && b.min.y <= floorY + 0.3 && (!best || top > best.max.y)) best = b;
  }
  if (!best) return { x, z, y: floorY, top: null };
  const fit = (v, lo, hi, s) => (hi - lo <= s + 2 * EDGE ? (lo + hi) / 2 : Math.min(hi - EDGE - s / 2, Math.max(lo + EDGE + s / 2, v)));
  return { x: fit(x, best.min.x, best.max.x, w), z: fit(z, best.min.z, best.max.z, d), y: best.max.y, top: best };
}
// slotOn: where the n-th thing (0-based) of footprint w x d goes on a top from topsIn (a row along the long side, then the next row);
// null when the top is full, so the caller moves on to the next top instead of pushing things over the edge
export function slotOn(top, n, w = 0.2, d = 0.2, gap = 0.06) {
  const long = top.maxX - top.minX >= top.maxZ - top.minZ, L = long ? top.maxX - top.minX : top.maxZ - top.minZ, S = long ? top.maxZ - top.minZ : top.maxX - top.minX;
  const a = long ? w : d, b = long ? d : w, per = Math.max(0, Math.floor((L - 2 * EDGE + gap) / (a + gap))), rows = Math.max(0, Math.floor((S - 2 * EDGE + gap) / (b + gap)));
  if (!per || !rows || n >= per * rows) return null;
  const i = n % per, j = Math.floor(n / per), u = -((per - 1) * (a + gap)) / 2 + i * (a + gap), v = -((rows - 1) * (b + gap)) / 2 + j * (b + gap);
  return long ? { x: top.x + u, z: top.z + v, y: top.y } : { x: top.x + v, z: top.z + u, y: top.y };
}
