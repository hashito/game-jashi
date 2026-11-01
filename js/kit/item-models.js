/* game-kit 6e0b6f0: js/item-models.js — edit in game-kit and run tools/kit-sync.js */
// Small hand-held things that must read as what they are from 1–3 m (the 「手袋が手袋っぽくない」 review):
// a key has a bow, a blade with teeth and a ring; a card has rounded corners, a printed face and a clip; a
// label roll shows its coloured labels and a loose end; a photo frame stands on its strut with the picture.
// Pure three.js + the kit's bevelled boxes and shared materials; every model's origin is the centre of what it
// rests on (y = 0 at the surface), front / top face up or +z. Faces are drawn by the caller on a canvas
// (Japanese text is never in a generated picture). Shared by the みる風車 sequels (first used in game-miru-delivery js/item-faces.js, which draws the faces).
import * as THREE from "three";
import { bevelBox } from "./prop-geo.js";
import { pm } from "./prop-mats.js";

const add = (g, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  g.add(m);
  return m;
};
const box = (g, w, h, d, mat, x, y, z, r = 0.002) => add(g, bevelBox(w, h, d, { r }), mat, x, y, z);
// a flat face from a canvas (drawn once): a texture, sRGB, mipmapped
export function faceTex(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
// a rounded-rectangle outline as a THREE.Shape (centred)
function rounded(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
// a flat plate lying on the surface, its top face showing `tex` (UV 0..1 over the plate)
function plate(g, w, d, t, shape, topMat, edgeMat) {
  const geo = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false, curveSegments: 6 });
  // UVs of the cap from the outline's bounds
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / w + 0.5, pos.getY(i) / d + 0.5);
  geo.rotateX(-Math.PI / 2); // lie down: the shape's +y runs to -z, the extrusion goes up
  const m = add(g, geo, [topMat, edgeMat], 0, 0, 0);
  // groups: 0 = caps, 1 = sides (ExtrudeGeometry)
  return m;
}

// ---- keys -------------------------------------------------------------------------------------------------
// a cylinder-lock key (bow with a hole, shoulder, a blade with cut teeth) on a split ring with a round tag
export function key(o = {}) {
  const g = new THREE.Group();
  const metal = pm("brass", o.color ?? 0xc8a85a, { metalness: 0.9, roughness: 0.35 });
  const s = new THREE.Shape();
  // the bow (a rounded head with a hole), then the blade with teeth along its lower edge
  s.absarc(0, 0, 0.014, Math.PI * 0.35, Math.PI * 1.65, false);
  s.lineTo(0.024, -0.004);
  s.lineTo(0.026, -0.006);
  const teeth = [0.004, 0.0015, 0.0045, 0.002, 0.004, 0.0025];
  let x = 0.028;
  for (const t of teeth) {
    s.lineTo(x + 0.003, -0.006 + t);
    s.lineTo(x + 0.006, -0.006);
    x += 0.006;
  }
  s.lineTo(x + 0.004, -0.002);
  s.lineTo(x + 0.004, 0.004);
  s.lineTo(0.024, 0.004);
  s.lineTo(0.024, 0.008);
  s.absarc(0, 0, 0.014, Math.PI * 0.35, Math.PI * 0.35, false);
  const hole = new THREE.Path();
  hole.absarc(-0.004, 0, 0.0045, 0, Math.PI * 2, true);
  s.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.0025, bevelEnabled: true, bevelThickness: 0.0005, bevelSize: 0.0005, bevelSegments: 1, curveSegments: 10 });
  geo.rotateX(-Math.PI / 2);
  add(g, geo, metal, 0.0, 0.0012, 0);
  // the groove along the blade
  box(g, x - 0.024, 0.0008, 0.0015, pm("steel", 0x8a7a40), 0.024 + (x - 0.024) / 2, 0.0042, -0.001, 0.0002);
  // split ring through the hole, and the tag
  add(g, new THREE.TorusGeometry(0.011, 0.0012, 6, 20), pm("steel", 0xb0b4b8, { metalness: 0.9 }), -0.016, 0.0016, 0, Math.PI / 2);
  if (o.tag !== false) {
    const tagMat = new THREE.MeshStandardMaterial({ map: o.tagTex || null, color: o.tagTex ? 0xffffff : o.tagColor ?? 0xe87020, roughness: 0.6 });
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.003, 20), [pm("plastic", o.tagColor ?? 0xe87020), tagMat, tagMat]);
    t.position.set(-0.042, 0.0016, 0.008);
    t.rotation.y = 0.4;
    g.add(t);
  }
  g.rotation.y = o.ry ?? 0.5;
  g.userData.kind = "key";
  return g;
}

// ---- cards and papers ---------------------------------------------------------------------------------------
// an ID / work card (85.6 x 54 mm, rounded corners) with a printed face, a clip and a short lanyard loop
export function idCard(o = {}) {
  const g = new THREE.Group();
  const w = o.w ?? 0.086, d = o.d ?? 0.054;
  const face = new THREE.MeshStandardMaterial({ map: o.tex || null, color: o.tex ? 0xffffff : 0xf2f0ea, roughness: 0.45 });
  plate(g, w, d, 0.0012, rounded(w, d, 0.004), face, pm("plastic", o.edge ?? 0xe8e6e0));
  // the clear holder round it
  if (o.holder !== false) {
    const hol = new THREE.Mesh(bevelBox(w + 0.008, 0.002, d + 0.008, { r: 0.0009 }), pm("glass", 0xdfe8ea, { opacity: 0.22, transparent: true }));
    hol.position.y = 0.0015;
    g.add(hol);
  }
  // the metal clip at the top edge and the lanyard
  box(g, 0.014, 0.003, 0.012, pm("steel", 0xc0c4c8, { metalness: 0.9 }), 0, 0.003, -d / 2 - 0.008, 0.001);
  if (o.lanyard !== false) {
    const tube = new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3([[0, 0.002, -d / 2 - 0.014], [-0.03, 0.0015, -d / 2 - 0.05], [-0.01, 0.0015, -d / 2 - 0.1], [0.03, 0.0015, -d / 2 - 0.08], [0.02, 0.0015, -d / 2 - 0.03], [0, 0.002, -d / 2 - 0.014]].map((p) => new THREE.Vector3(...p)), true),
      40, 0.0035, 4, true
    );
    tube.scale(1, 0.4, 1);
    add(g, tube, pm("fabric", o.lanyardColor ?? 0x2a4a8a));
  }
  g.rotation.y = o.ry ?? -0.3;
  g.userData.kind = "card";
  return g;
}
// a laminated instruction card (A6-ish) with a punched hole and a ring
export function laminatedCard(o = {}) {
  const g = new THREE.Group();
  const w = o.w ?? 0.15, d = o.d ?? 0.105;
  const face = new THREE.MeshStandardMaterial({ map: o.tex || null, color: o.tex ? 0xffffff : 0xf4f0e2, roughness: 0.25 });
  plate(g, w, d, 0.0016, rounded(w, d, 0.006), face, pm("plastic", 0xe8e8e0));
  add(g, new THREE.TorusGeometry(0.012, 0.0014, 6, 18), pm("steel", 0xb8bcc0, { metalness: 0.9 }), -w / 2 + 0.012, 0.002, -d / 2 + 0.012, Math.PI / 2);
  g.rotation.y = o.ry ?? 0.3;
  g.userData.kind = "card";
  return g;
}
// a sheet of paper lying a little curled (two panels at a small angle) with a printed face
export function paperSheet(o = {}) {
  const g = new THREE.Group();
  const w = o.w ?? 0.21, d = o.d ?? 0.297;
  const mat = new THREE.MeshStandardMaterial({ map: o.tex || null, color: o.tex ? 0xffffff : 0xeee8d8, roughness: 0.92, side: THREE.DoubleSide });
  const geo = new THREE.PlaneGeometry(w, d, 1, 6);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const t = (y + d / 2) / d;
    p.setZ(i, Math.pow(Math.max(0, t - 0.75) * 4, 2) * 0.012 + Math.pow(Math.max(0, 0.15 - t) * 6.6, 2) * 0.006);
  }
  geo.computeVertexNormals();
  add(g, geo, mat, 0, 0.0008, 0, -Math.PI / 2);
  g.rotation.y = o.ry ?? 0.25;
  g.userData.kind = "paper";
  return g;
}
// a clipboard: hardboard with rounded corners, the sprung metal clip with its lever, paper under the clip
export function clipboard(o = {}) {
  const g = new THREE.Group();
  const w = 0.235, d = 0.32;
  plate(g, w, d, 0.004, rounded(w, d, 0.01), pm("wood", 0x8a6a48), pm("wood", 0x6a5038));
  const paper = new THREE.MeshStandardMaterial({ map: o.tex || null, color: o.tex ? 0xffffff : 0xeee8d8, roughness: 0.9 });
  const pg = new THREE.PlaneGeometry(0.21, 0.28);
  add(g, pg, paper, 0, 0.0046, 0.012, -Math.PI / 2);
  const steel = pm("steel", 0xc8ccd0, { metalness: 0.9, roughness: 0.3 });
  box(g, 0.11, 0.008, 0.028, steel, 0, 0.008, -d / 2 + 0.03, 0.002);
  add(g, new THREE.CylinderGeometry(0.004, 0.004, 0.1, 10), steel, 0, 0.012, -d / 2 + 0.018, 0, 0, Math.PI / 2);
  // the lever (a bent wire loop)
  add(g, new THREE.TorusGeometry(0.018, 0.0018, 6, 16, Math.PI), steel, 0, 0.014, -d / 2 + 0.006, -Math.PI / 2 - 0.3);
  g.rotation.y = o.ry ?? -0.15;
  g.userData.kind = "clipboard";
  return g;
}
// a hard-backed notebook / ledger: covers, a cloth spine, the page block with its edges, a ribbon
export function book(o = {}) {
  const g = new THREE.Group();
  const w = o.w ?? 0.18, d = o.d ?? 0.25, t = o.t ?? 0.03;
  const cover = pm("fabric", o.color ?? 0x5a3a2a);
  const coverTop = new THREE.MeshStandardMaterial({ map: o.tex || null, color: o.tex ? 0xffffff : o.color ?? 0x5a3a2a, roughness: 0.8 });
  box(g, w, 0.003, d, cover, 0, 0.0015, 0, 0.001);
  const top = box(g, w, 0.003, d, cover, 0, t - 0.0015, 0, 0.001);
  add(g, new THREE.PlaneGeometry(w - 0.004, d - 0.004), coverTop, 0, t + 0.0001, 0, -Math.PI / 2);
  void top;
  box(g, w - 0.008, t - 0.006, d - 0.006, pm("paint", 0xe8e0c8, { roughness: 0.95 }), 0.003, t / 2, 0, 0.001);
  // the spine (round-backed) on -x
  const sp = new THREE.CylinderGeometry(t / 2, t / 2, d, 12, 1, false, Math.PI, Math.PI);
  add(g, sp, pm("fabric", o.spine ?? 0x3a2418), -w / 2, t / 2, 0, Math.PI / 2, 0, 0);
  // a ribbon bookmark out of the bottom edge
  box(g, 0.006, 0.0008, 0.05, pm("fabric", 0xa02020), 0.03, 0.0008, d / 2 + 0.018, 0.0003);
  g.rotation.y = o.ry ?? 0.2;
  g.userData.kind = "book";
  return g;
}

// ---- rolls, tags, pins, badges, frames ---------------------------------------------------------------------
// a roll of labels or tape: the wound roll (its outer turn shows the labels / the tape), the core, a loose end
export function roll(o = {}) {
  const g = new THREE.Group();
  const R = o.r ?? 0.055, r = o.core ?? 0.024, h = o.h ?? 0.048;
  const side = new THREE.MeshStandardMaterial({ map: o.tex || null, color: o.tex ? 0xffffff : o.color ?? 0xeeeae0, roughness: o.tape ? 0.3 : 0.8 });
  const ringM = pm("paint", o.edgeColor ?? (o.tape ? 0xa07038 : 0xf2efe6), { roughness: o.tape ? 0.3 : 0.85 });
  const outer = new THREE.CylinderGeometry(R, R, h, 32, 1, true);
  add(g, outer, side, 0, h / 2, 0);
  // the flat sides: rings between the core and the outside, with fine winding lines
  const ring = new THREE.RingGeometry(r, R, 32, 3);
  add(g, ring, ringM, 0, h, 0, -Math.PI / 2);
  add(g, ring, ringM, 0, 0.0005, 0, Math.PI / 2);
  // the cardboard core
  add(g, new THREE.CylinderGeometry(r, r, h + 0.002, 20, 1, true), pm("cardboard", 0x9a7a50, { side: THREE.DoubleSide }), 0, h / 2, 0);
  // the loose end: a strip leaving the roll tangentially and lying on the surface
  const endM = new THREE.MeshStandardMaterial({ map: o.endTex || o.tex || null, color: o.endTex || o.tex ? 0xffffff : o.color ?? 0xeeeae0, roughness: o.tape ? 0.3 : 0.8, side: THREE.DoubleSide });
  const strip = new THREE.PlaneGeometry(h * 0.96, 0.07);
  const sm = add(g, strip, endM, 0, 0.0006, R + 0.035, -Math.PI / 2);
  sm.rotation.z = Math.PI / 2;
  g.userData.kind = o.tape ? "tape" : "labels";
  return g;
}
// a cardboard / plastic tag with a reinforced hole and a loop of string
export function tag(o = {}) {
  const g = new THREE.Group();
  const w = o.w ?? 0.08, d = o.d ?? 0.15;
  const s = new THREE.Shape();
  s.moveTo(-w / 2, -d / 2);
  s.lineTo(w / 2, -d / 2);
  s.lineTo(w / 2, d / 2 - 0.02);
  s.lineTo(w / 2 - 0.02, d / 2);
  s.lineTo(-w / 2 + 0.02, d / 2);
  s.lineTo(-w / 2, d / 2 - 0.02);
  s.closePath();
  const hole = new THREE.Path();
  hole.absarc(0, d / 2 - 0.018, 0.005, 0, Math.PI * 2, true);
  s.holes.push(hole);
  const face = new THREE.MeshStandardMaterial({ map: o.tex || null, color: o.tex ? 0xffffff : o.color ?? 0xe8c030, roughness: 0.7 });
  plate(g, w, d, 0.0015, s, face, pm("paint", o.color ?? 0xe8c030));
  add(g, new THREE.TorusGeometry(0.008, 0.0015, 6, 16), pm("steel", 0xb0b0a8, { metalness: 0.8 }), 0, 0.0015, -(d / 2 - 0.018), Math.PI / 2);
  const str = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([[0, 0.002, -(d / 2 - 0.018)], [0.02, 0.002, -d / 2 - 0.04], [-0.01, 0.002, -d / 2 - 0.08], [-0.03, 0.002, -d / 2 - 0.05]].map((p) => new THREE.Vector3(...p))), 16, 0.0012, 4);
  add(g, str, pm("fabric", 0xd8d0b8));
  g.rotation.y = o.ry ?? -0.4;
  g.userData.kind = "tag";
  return g;
}
// a machine pin: a turned shaft with a head and a chamfer, a cross hole with its split pin
export function pin(o = {}) {
  const g = new THREE.Group();
  const L = o.len ?? 0.16, r = o.r ?? 0.009;
  const steel = pm("steel", 0xc0c4c8, { metalness: 0.95, roughness: 0.28 });
  const prof = [[0, 0], [r * 1.9, 0], [r * 2.0, 0.003], [r * 2.0, 0.012], [r * 1.9, 0.014], [r, 0.016], [r, L - 0.004], [r * 0.7, L], [0, L]].map(([x, y]) => new THREE.Vector2(x, y));
  const geo = new THREE.LatheGeometry(prof, 20);
  geo.rotateZ(-Math.PI / 2);
  add(g, geo, steel, -L / 2, r * 2.0, 0);
  // the split pin through the cross hole near the end
  add(g, new THREE.TorusGeometry(0.006, 0.0012, 6, 14), pm("steel", 0x9a9a90, { metalness: 0.8 }), L / 2 - 0.016, r * 2.0, 0, 0, Math.PI / 2);
  g.rotation.y = o.ry ?? 0.6;
  g.userData.kind = "pin";
  return g;
}
// a cloth name badge, its edge stitched, threads torn at one end
export function clothBadge(o = {}) {
  const g = new THREE.Group();
  const w = o.w ?? 0.1, d = o.d ?? 0.035;
  const face = new THREE.MeshStandardMaterial({ map: o.tex || null, color: o.tex ? 0xffffff : 0x8a8e88, roughness: 0.98 });
  plate(g, w, d, 0.002, rounded(w, d, 0.004), face, pm("fabric", o.color ?? 0x7a7e78));
  const thread = pm("fabric", 0x3a3c38);
  for (const [x, z, a] of [[w / 2 + 0.004, -0.006, 0.4], [w / 2 + 0.006, 0.004, -0.3], [w / 2 + 0.003, 0.012, 0.9]]) box(g, 0.012, 0.0008, 0.0012, thread, x, 0.0012, z, 0.0002).rotation.y = a;
  g.rotation.y = o.ry ?? 0.35;
  g.userData.kind = "badge";
  return g;
}
// a photo frame standing on its strut (picture facing +z), tilted back a little
export function photoFrame(o = {}) {
  const g = new THREE.Group();
  const w = o.w ?? 0.16, h = o.h ?? 0.12, t = 0.012, b = 0.012;
  const frameM = pm("wood", o.color ?? 0x4a3020, { roughness: 0.5 });
  const f = new THREE.Group();
  box(f, w, b, t, frameM, 0, h / 2 - b / 2, 0, 0.002);
  box(f, w, b, t, frameM, 0, -h / 2 + b / 2, 0, 0.002);
  box(f, b, h - 2 * b, t, frameM, -w / 2 + b / 2, 0, 0, 0.002);
  box(f, b, h - 2 * b, t, frameM, w / 2 - b / 2, 0, 0, 0.002);
  const pic = new THREE.MeshStandardMaterial({ map: o.tex || null, color: o.tex ? 0xffffff : 0x6a6a60, roughness: 0.35 });
  add(f, new THREE.PlaneGeometry(w - 2 * b + 0.002, h - 2 * b + 0.002), pic, 0, 0, 0.002);
  box(f, w - 0.01, h - 0.01, 0.003, pm("cardboard", 0x6a5038), 0, 0, -t / 2 + 0.0015, 0.001);
  // the strut behind
  const st = box(f, 0.03, h * 0.8, 0.003, pm("cardboard", 0x5a4430), 0, -h * 0.1, -0.03, 0.001);
  st.rotation.x = -0.45;
  const tilt = 0.22;
  f.rotation.x = -tilt;
  f.position.set(0, (h / 2) * Math.cos(tilt) + 0.001, (h / 2) * Math.sin(tilt) * 0.5);
  g.add(f);
  g.rotation.y = o.ry ?? -0.2;
  g.userData.kind = "frame";
  return g;
}
