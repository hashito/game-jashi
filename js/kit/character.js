/* game-kit 6e0b6f0: js/character.js — edit in game-kit and run tools/kit-sync.js */
// People, version 2: one skinned mesh per person (2 draw calls instead of ~30), a proper skeleton,
// and the motion layer of js/motion.js (idle / walk / run / sit / sit down / stand up / talk /
// look around / scared / crouch, crossfaded; speed-matched feet; head tracking; blinking; mouth).
//
//   import { makeCharacter } from './kit/character.js';
//   const c = makeCharacter({ coat: 0x3a4250, hairStyle: 'bob', female: true, blob: true });
//   scene.add(c.root);
//   c.set('talk');                 // or 'idle' 'walk' 'run' 'sit' 'lookAround' 'scared' 'crouch'
//   c.lookAt(camera.position);     // keeps tracking (clamped to what a neck can do); null to stop
//   c.sitOn(chair, P.SEAT_H.pipeChair);  // placed on a kit chair (props.js), seated at once
//   c.standUp(); c.sitDown();      // timed transitions; the root moves SIT_STAND_Z in front / back
//   each frame: move c.root as the game likes, then c.update(dt) — the walk follows the root's speed
//
// buildPerson(o) below takes the options of js/person.js and returns the same { root, update(dt,
// lookAt, mood), react(kind) }, so a game can switch by changing the import (see README).
// Built from parts (lathe torso, jointed limbs, painted face) like person.js, then baked into a
// SkinnedMesh with rigid weights; vertex colours carry the colour and (in alpha) the roughness, so
// all people share one body material.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Motion, solveLegs, splitLook, lookAngles, canTrack, damp, wobble, SIT_STAND_Z, BODY, crowdLevel, clamp } from './motion.js';

// ---- shared materials -----------------------------------------------------------------------
// MeshStandardMaterial with the roughness taken from the vertex colour's alpha
function roughFromAlpha(m) {
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('float roughnessFactor = roughness;', 'float roughnessFactor = roughness * vColor.a;');
  };
  m.customProgramCacheKey = () => 'kit-character-rough-alpha';
  return m;
}
let BODY_MAT = null;
export function bodyMaterial() {
  if (!BODY_MAT) BODY_MAT = roughFromAlpha(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }));
  return BODY_MAT;
}
const FABRIC_MATS = new Map();
function fabricMaterial(map) {
  if (!FABRIC_MATS.has(map)) FABRIC_MATS.set(map, roughFromAlpha(new THREE.MeshStandardMaterial({ vertexColors: true, map, roughness: 1 })));
  return FABRIC_MATS.get(map);
}

// ---- the painted face -----------------------------------------------------------------------
// equirectangular map for a SphereGeometry: the front (+z) is at u = 0.25. Variants: eyes open,
// eyes shut (blink), mouth open (talking). Cached per look, shared by everyone who has it.
const hexCss = (c) => (typeof c === 'string' ? c : `#${new THREE.Color(c).getHexString()}`);
function paintFace(o, variant) {
  const W = 512,
    H = 256;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = o.skinCss;
  g.fillRect(0, 0, W, H);
  const cx = W * 0.25;
  const shade = (x, y, r, col) => {
    const gr = g.createRadialGradient(x, y, 1, x, y, r);
    gr.addColorStop(0, col);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  };
  // modelling: cheeks, eye sockets, the sides of the nose, under the chin, the temples
  for (const sx of [-1, 1]) shade(cx + sx * 27, H * 0.63, 22, o.female ? 'rgba(220,120,115,0.28)' : 'rgba(205,130,115,0.18)');
  for (const sx of [-1, 1]) shade(cx + sx * 22, H * 0.47, 18, 'rgba(90,55,45,0.3)');
  for (const sx of [-1, 1]) shade(cx + sx * 52, H * 0.5, 30, 'rgba(90,55,45,0.12)');
  shade(cx, H * 0.88, 44, 'rgba(90,60,50,0.28)');
  g.fillStyle = 'rgba(110,70,55,0.16)';
  g.fillRect(cx - 7, H * 0.48, 3, 34);
  if (o.old) {
    g.strokeStyle = 'rgba(90,55,45,0.35)';
    g.lineWidth = 1;
    for (const sx of [-1, 1]) {
      g.beginPath();
      g.moveTo(cx + sx * 9, H * 0.63);
      g.quadraticCurveTo(cx + sx * 19, H * 0.68, cx + sx * 17, H * 0.75);
      g.stroke();
    }
    for (let i = 0; i < 2; i++) {
      g.beginPath();
      g.moveTo(cx - 20, H * (0.33 - i * 0.03));
      g.quadraticCurveTo(cx, H * (0.32 - i * 0.03), cx + 20, H * (0.33 - i * 0.03));
      g.stroke();
    }
  }
  g.filter = 'blur(0.6px)';
  // brows
  g.strokeStyle = o.browCss;
  g.lineWidth = o.browW;
  g.lineCap = 'round';
  for (const sx of [-1, 1]) {
    g.beginPath();
    g.moveTo(cx + sx * 10, H * (o.scared ? 0.385 : 0.4));
    g.quadraticCurveTo(cx + sx * 23, H * 0.372, cx + sx * 36, H * 0.405);
    g.stroke();
  }
  for (const sx of [-1, 1]) {
    const ex = cx + sx * 22,
      ey = H * 0.475;
    if (variant === 'blink') {
      g.strokeStyle = 'rgba(40,24,18,0.85)';
      g.lineWidth = 1.8;
      g.beginPath();
      g.ellipse(ex, ey - 1, 10.5, 3.2, 0, Math.PI * 0.08, Math.PI * 0.92);
      g.stroke();
      continue;
    }
    g.fillStyle = '#ece6de';
    g.beginPath();
    g.ellipse(ex, ey, 10.5, 4.8, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = o.eyeCss;
    g.beginPath();
    g.arc(ex, ey + 0.3, 4.4, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#0d0907';
    g.beginPath();
    g.arc(ex, ey + 0.3, 2, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.8)';
    g.fillRect(ex + 1, ey - 2, 1.6, 1.6);
    g.strokeStyle = 'rgba(30,18,12,0.92)';
    g.lineWidth = o.female ? 2.4 : 1.8;
    g.beginPath();
    g.ellipse(ex, ey, 11, 5.2, 0, Math.PI * 1.05, Math.PI * 1.95);
    g.stroke();
  }
  // nose tip and nostrils
  shade(cx, H * 0.6, 7, 'rgba(120,70,55,0.35)');
  g.fillStyle = 'rgba(90,50,40,0.55)';
  for (const sx of [-1, 1]) g.fillRect(cx + sx * 4 - 1.5, H * 0.615, 3, 1.6);
  // lips; open: a dark mouth with a hint of teeth
  if (variant === 'talk') {
    g.fillStyle = 'rgba(55,22,20,0.95)';
    g.beginPath();
    g.ellipse(cx, H * 0.712, 10, 5.2, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(235,230,220,0.8)';
    g.fillRect(cx - 6, H * 0.712 - 4.5, 12, 2);
    g.strokeStyle = o.lipCss;
    g.lineWidth = 2.2;
    g.stroke();
  } else {
    g.fillStyle = o.lipCss;
    g.beginPath();
    g.ellipse(cx, H * 0.705, 13, 3.4, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(90,40,38,0.8)';
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(cx - 13, H * 0.705);
    g.quadraticCurveTo(cx, H * 0.714, cx + 13, H * 0.705);
    g.stroke();
  }
  if (o.beard) {
    g.filter = 'blur(2px)';
    g.fillStyle = 'rgba(30,24,20,0.28)';
    g.beginPath();
    g.ellipse(cx, H * 0.8, 40, 22, 0, 0, Math.PI);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
const FACES = new Map();
function faceSet(o) {
  const key = [o.skinCss, o.browCss, o.browW, o.lipCss, o.eyeCss, o.female, o.old, o.beard].join('|');
  if (!FACES.has(key)) FACES.set(key, { open: paintFace(o, 'open'), blink: paintFace(o, 'blink'), talk: paintFace(o, 'talk') });
  return FACES.get(key);
}

// ---- building -------------------------------------------------------------------------------
const SEG = [
  { r: 5, sw: 6, sh: 4, head: [12, 9] },
  { r: 8, sw: 9, sh: 6, head: [20, 14] },
  { r: 12, sw: 13, sh: 9, head: [28, 20] },
];
const DEFAULTS = {
  coat: 0x4a505a, trousers: 0x2c3038, shirt: 0xe8e6e0, shoes: 0x1a1716, hair: 0x1e1a18, skin: 0xd8b49c,
  eyes: 0x2a1c14, hairStyle: 'short', sleeves: 'long', outfit: 'jacket', build: 0, scale: 1, legs: 1, detail: 2,
};
const tmpV = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();

function lathe(points, segs) {
  return new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), segs);
}

export function makeCharacter(opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const D = SEG[clamp(o.detail | 0, 0, 2)];
  const k = o.legs; // leg length factor (person.js `height`)
  const fem = !!o.female;
  const b = clamp(o.build, -1, 1); // -1 slim .. 1 heavy
  const wT = 1 + b * 0.16; // torso width
  const wL = 1 + b * 0.12; // limb thickness
  const shW = fem ? 0.92 : 1; // shoulders
  const hipWf = fem ? 1.1 : 1;
  const body = { ...BODY, thigh: 0.44 * k, shin: 0.43 * k, ankleH: 0.065 * k, hipW: 0.085 * hipWf };
  body.hipH = body.thigh + body.shin + body.ankleH - 0.012;
  const skinCss = hexCss(o.skinHex || o.skin);
  const skinCol = o.skinHex ? new THREE.Color(o.skinHex) : new THREE.Color(o.skin);
  const face = faceSet({
    skinCss,
    browCss: typeof o.brow === 'string' ? o.brow : 'rgba(45,30,24,0.85)',
    browW: typeof o.brow === 'number' ? o.brow : fem ? 2.2 : 3,
    lipCss: o.lip || (fem ? 'rgba(170,85,85,0.9)' : 'rgba(150,95,85,0.8)'),
    eyeCss: hexCss(o.eyes),
    female: fem,
    old: !!o.old,
    beard: !!o.beard,
  });

  // bones
  const bones = [];
  const B = {};
  const bone = (name, parent, x, y, z) => {
    const bn = new THREE.Bone();
    bn.name = name;
    bn.position.set(x, y, z);
    if (parent) parent.add(bn);
    B[name] = bn;
    bones.push(bn);
    return bn;
  };
  const base = bone('base', null, 0, 0, 0);
  const hips = bone('hips', base, 0, body.hipH, 0);
  const pelvis = bone('pelvis', hips, 0, 0, 0);
  const waist = bone('waist', hips, 0, 0.02, 0);
  const chest = bone('chest', waist, 0, 0.05, 0);
  const neck = bone('neck', chest, 0, 0.5, 0);
  const head = bone('head', neck, 0, 0.17, 0.01);
  for (const [s, sx] of [['L', 1], ['R', -1]]) {
    const sh = bone(`sh${s}`, chest, sx * 0.19 * shW * wT, 0.43, 0);
    const el = bone(`el${s}`, sh, 0, -0.29, 0);
    bone(`wr${s}`, el, 0, -0.26, 0);
    void sh;
    const th = bone(`thigh${s}`, hips, sx * body.hipW, 0, 0);
    const sn = bone(`shin${s}`, th, 0, -body.thigh, 0);
    bone(`foot${s}`, sn, 0, -body.shin, 0);
  }
  base.updateMatrixWorld(true);

  // parts: geometry in a bone's space, a colour, a roughness, and the material group
  const parts = [];
  const C = (c) => (c instanceof THREE.Color ? c : new THREE.Color(c));
  const part = (boneName, geo, { x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0 } = {}, color, rough = 0.85, group = 'body', ao = 0.28) => {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), tmpQ.setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
    parts.push({ bone: B[boneName], geo, m, color: C(color), rough, group, ao });
  };
  const seg = (boneName, r0, r1, len, color, rough, endCap = true) => {
    const geo = new THREE.CylinderGeometry(r0, r1, len, D.r, 1, true);
    geo.translate(0, -len / 2, 0);
    part(boneName, geo, {}, color, rough);
    if (endCap) part(boneName, new THREE.SphereGeometry(r1, D.sw, D.sh), { y: -len }, color, rough);
  };
  const sphere = (r, w = D.sw, h = D.sh, ...rest) => new THREE.SphereGeometry(r, w, h, ...rest);

  const top = o.coat;
  const sleeve = o.sleeves === 'short' ? skinCol : top;
  const legCol = o.skirt != null ? (o.stockings ?? skinCol) : o.trousers;
  const fabric = o.fabric ? 'fabric' : 'body';
  // pelvis and the jacket's hem
  part('pelvis', sphere(0.14), { sx: 1.05 * hipWf * wT, sy: 0.75, sz: 0.75 * wT }, o.skirt ?? o.trousers, 0.9);
  if (o.skirt != null) {
    part('pelvis', lathe([[0.02, 0.06], [0.15 * hipWf * wT, 0.05], [0.2 * hipWf * wT, -0.2], [0.235 * hipWf * wT, -0.4], [0.2 * hipWf * wT, -0.4], [0.02, -0.02]].reverse(), D.r + 4), { sz: 0.8 }, o.skirt, 0.9);
  }
  if (o.outfit === 'coat') {
    // long coat skirt to above the knee (hangs from the pelvis)
    part('pelvis', lathe([[0.15 * wT, 0.06], [0.17 * wT, -0.05], [0.21 * wT, -0.4], [0.195 * wT, -0.4], [0.155 * wT, -0.05], [0.13 * wT, 0.06]].reverse(), D.r + 4), { sz: 0.72 }, top, 0.92, fabric);
  }
  // (lathe profiles run bottom to top so the faces point outward)
  // torso: waist, chest, shoulders, closed at both ends
  const bf = b > 0 ? b * 0.025 : 0; // belly
  const wr = fem ? 0.112 : 0.128;
  part('chest', lathe([[0, -0.03], [wr + 0.012, -0.02], [wr + bf, 0.1], [0.142 + bf * 0.5, 0.24], [0.158, 0.36], [0.162, 0.43], [0.15, 0.475], [0.105, 0.51], [0.05, 0.53], [0, 0.535]], D.r + 4), { sx: 1.16 * shW * wT, sz: 0.64 * wT }, top, 0.9, fabric);
  if (o.outfit !== 'shirt') {
    // shirt V at the throat and an optional tie
    part('chest', new THREE.CylinderGeometry(0.0, 0.036, 0.11, 3, 1), { y: 0.455, z: 0.094 * wT, sz: 0.25, rx: Math.PI }, o.shirt, 0.8, 'body', 0.1);
    if (o.tie != null) part('chest', new THREE.BoxGeometry(0.03, 0.26, 0.012), { y: 0.33, z: 0.101 * wT + bf * 0.7, rx: -0.08 }, o.tie, 0.6, 'body', 0.1);
  }
  // neck
  part('neck', new THREE.CylinderGeometry(0.044, 0.052, 0.13, D.r), { y: 0.03 }, skinCol, 0.6);
  // head with the painted face, jaw, nose, ears
  part('head', sphere(0.105, D.head[0], D.head[1]), { sx: 0.85, sy: 1.15, sz: 0.97 }, 0xffffff, 0.62, 'face', 0);
  part('head', sphere(0.055), { y: -0.06, z: 0.012, sx: 1.0, sy: 0.9, sz: 1.0 }, skinCol, 0.62, 'body', 0.15);
  part('head', sphere(0.016, 8, 6), { y: -0.012, z: 0.101, sx: 0.75, sy: 1.1, sz: 1.0 }, skinCol, 0.55, 'body', 0.1);
  for (const sx of [-1, 1]) part('head', sphere(0.02, 8, 6), { x: sx * 0.086, z: -0.005, sx: 0.45, sy: 1.1, sz: 0.8 }, skinCol, 0.62, 'body', 0.2);
  // hair
  const hc = o.old && o.hair === DEFAULTS.hair ? 0x9a9690 : o.hair;
  const cap = () => part('head', sphere(0.11, D.sw + 2, D.sh, 0, Math.PI * 2, 0, Math.PI * 0.42), { y: 0.012, z: -0.01, sx: 0.88, sy: 1.12 }, hc, 0.5);
  const back = (len = 0.7) => part('head', sphere(0.108, D.sw + 2, D.sh, Math.PI * 0.5 + 1.2, Math.PI * 2 - 2.4, 0, Math.PI * len), { y: -0.005, z: -0.008, sx: 0.88, sy: 1.1, sz: 1.02 }, hc, 0.5);
  const style = fem && opts.hairStyle === undefined ? 'bob' : o.hairStyle;
  if (style === 'buzz') part('head', sphere(0.11, D.sw + 4, D.sh, 0, Math.PI * 2, 0, Math.PI * 0.5), { y: 0.006, z: -0.006, sx: 0.88, sy: 1.12 }, hc, 0.8);
  else if (style === 'bald') back(0.62);
  else {
    cap();
    back();
  }
  if (style === 'bob') part('head', sphere(0.118, D.sw + 2, D.sh, Math.PI * 0.5 + 0.9, Math.PI * 2 - 1.8, 0, Math.PI * 0.82), { y: -0.035, z: -0.01, sx: 0.95, sy: 1.35 }, hc, 0.5);
  if (style === 'long') {
    part('head', sphere(0.118, D.sw + 2, D.sh, Math.PI * 0.5 + 0.9, Math.PI * 2 - 1.8, 0, Math.PI * 0.82), { y: -0.035, z: -0.01, sx: 0.95, sy: 1.35 }, hc, 0.5);
    part('head', new THREE.CylinderGeometry(0.085, 0.07, 0.24, D.r, 1, false, Math.PI * 0.5 + 0.6, Math.PI * 2 - 1.2), { y: -0.16, z: -0.03, sz: 0.6 }, hc, 0.5);
  }
  if (style === 'ponytail') {
    part('head', sphere(0.035), { y: 0.02, z: -0.115 }, hc, 0.5);
    part('head', new THREE.CylinderGeometry(0.03, 0.012, 0.2, D.r), { y: -0.07, z: -0.135, rx: 0.25 }, hc, 0.5);
  }
  if (o.hat === 'cap') {
    const hat = o.hatColor ?? 0x1e2838;
    part('head', new THREE.CylinderGeometry(0.1, 0.098, 0.07, D.r + 4), { y: 0.085, sx: 0.95, sz: 1.05 }, hat, 0.6);
    part('head', new THREE.CylinderGeometry(0.113, 0.113, 0.012, D.r + 4), { y: 0.12, sx: 0.95, sz: 1.08 }, hat, 0.6);
    part('head', new THREE.CylinderGeometry(0.075, 0.075, 0.008, D.r + 4, 1, false, -Math.PI / 2, Math.PI), { y: 0.058, z: 0.06, sz: 0.7, rx: 0.15 }, 0x0e0e10, 0.3);
  }
  if (o.glasses) {
    const gc = typeof o.glasses === 'number' ? o.glasses : 0x1a1a1a;
    for (const sx of [-1, 1]) part('head', new THREE.TorusGeometry(0.017, 0.0022, 5, 14), { x: sx * 0.025, y: 0.011, z: 0.102 }, gc, 0.3, 'body', 0);
    part('head', new THREE.BoxGeometry(0.014, 0.003, 0.003), { y: 0.016, z: 0.104 }, gc, 0.3, 'body', 0);
    for (const sx of [-1, 1]) part('head', new THREE.BoxGeometry(0.003, 0.003, 0.09), { x: sx * 0.043, y: 0.013, z: 0.06 }, gc, 0.3, 'body', 0);
  }
  // arms: shoulder cap, upper arm, elbow, forearm, a mitten hand with a thumb
  for (const [s, sx] of [['L', 1], ['R', -1]]) {
    part(`sh${s}`, sphere(0.05 * wL), { x: -sx * 0.006, y: -0.012, sz: 0.9 }, top, 0.9, fabric);
    seg(`sh${s}`, 0.047 * wL, 0.038 * wL, 0.29, top, 0.9);
    seg(`el${s}`, 0.037 * wL, 0.029 * wL, 0.26, sleeve, sleeve === top ? 0.9 : 0.6, false);
    if (o.sleeves !== 'short') part(`el${s}`, new THREE.CylinderGeometry(0.031 * wL, 0.031 * wL, 0.02, D.r), { y: -0.245 }, o.shirt, 0.8);
    part(`wr${s}`, sphere(0.03, D.sw, D.sh), { y: -0.048, z: 0.004, sx: 0.72, sy: 1.5, sz: 0.5 }, skinCol, 0.6, 'body', 0.18);
    part(`wr${s}`, new THREE.CapsuleGeometry(0.009, 0.028, 3, 6), { x: -sx * 0.012, y: -0.035, z: 0.016, rz: sx * 0.35, rx: -0.3 }, skinCol, 0.6, 'body', 0.18);
    part(`wr${s}`, new THREE.CylinderGeometry(0.026, 0.027, 0.03, D.r), { y: -0.004, sz: 0.75 }, skinCol, 0.6, 'body', 0.1);
    // legs: thigh, knee, shin, shoe (rounded upper, sole, heel)
    part(`thigh${s}`, sphere(0.078 * wL), { sy: 0.9 }, legCol, 0.9);
    seg(`thigh${s}`, 0.075 * wL * hipWf, 0.052 * wL, body.thigh, legCol, 0.9);
    seg(`shin${s}`, 0.05 * wL, 0.036 * wL, body.shin, o.skirt != null ? legCol : o.trousers, 0.9);
    const ah = body.ankleH;
    part(`foot${s}`, sphere(1, D.sw, D.sh), { y: -ah + 0.034, z: 0.045, sx: 0.048, sy: 0.038, sz: 0.125 }, o.shoes, 0.38, 'body', 0.15);
    part(`foot${s}`, new THREE.BoxGeometry(0.09, 0.016, 0.255), { y: -ah + 0.008, z: 0.04 }, 0x141210, 0.7, 'body', 0);
    part(`foot${s}`, new THREE.CylinderGeometry(0.038, 0.04, 0.05, D.r), { y: -ah + 0.04 }, o.shoes, 0.4, 'body', 0.1);
  }

  // bake: every part into the skeleton's rest space, one weight per vertex
  const index = new Map(bones.map((bn, i) => [bn, i]));
  const groups = { body: [], face: [], fabric: [] };
  for (const p of parts) {
    const geo = p.geo.index ? p.geo : p.geo; // all three.js primitives are indexed
    geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(p.bone.matrixWorld, p.m));
    const n = geo.attributes.position.count;
    const col = new Float32Array(n * 4);
    const nrm = geo.attributes.normal;
    for (let i = 0; i < n; i++) {
      // a little sky occlusion: undersides darker (reads as contact shading on a lit body)
      const occ = 1 - p.ao * (0.5 - 0.5 * nrm.getY(i));
      col[i * 4] = p.color.r * occ;
      col[i * 4 + 1] = p.color.g * occ;
      col[i * 4 + 2] = p.color.b * occ;
      col[i * 4 + 3] = p.rough;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
    const si = new Uint16Array(n * 4).fill(0);
    const sw = new Float32Array(n * 4);
    const bi = index.get(p.bone);
    for (let i = 0; i < n; i++) {
      si[i * 4] = bi;
      sw[i * 4] = 1;
    }
    geo.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
    geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    groups[p.group].push(geo);
  }
  const faceMat = new THREE.MeshStandardMaterial({ map: face.open, roughness: 0.62 });
  const mats = [];
  const merged = [];
  for (const [key, list] of Object.entries(groups)) {
    if (!list.length) continue;
    merged.push(mergeGeometries(list));
    mats.push(key === 'face' ? faceMat : key === 'fabric' ? fabricMaterial(o.fabric) : bodyMaterial());
    for (const g of list) g.dispose();
  }
  const geometry = mergeGeometries(merged, true);
  for (const g of merged) g.dispose();
  const mesh = new THREE.SkinnedMesh(geometry, mats);
  mesh.name = 'character';
  const root = new THREE.Group();
  root.name = o.name || 'person';
  root.add(mesh, base);
  root.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(bones));
  base.scale.setScalar(o.scale);

  // extras that are not part of the skin
  let cig = null;
  if (o.smoker) {
    cig = new THREE.Group();
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.07, 6), new THREE.MeshStandardMaterial({ color: 0xeeeeee }));
    stick.rotation.x = Math.PI / 2;
    const ember = new THREE.Mesh(new THREE.SphereGeometry(0.005, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff5a1a }));
    ember.position.z = 0.036;
    cig.add(stick, ember);
    cig.userData.ember = ember;
    cig.position.set(-0.012, -0.05, 0.03);
    B.wrR.add(cig);
  }
  let blob = null;
  if (o.blob) {
    blob = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.75), blobMaterial());
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.004;
    blob.renderOrder = -1;
    blob.name = 'blob';
    root.add(blob);
  }

  const motion = new Motion({ body, seatH: o.seatH ?? 0.47, seed: o.seed, state: o.pose === 'sit' ? 'sit' : o.state || 'idle' });
  const ch = new Character(root, mesh, B, motion, { face, faceMat, cig, blob, scale: o.scale, smoker: !!o.smoker, body });
  if (o.lookAt) ch.lookAt(o.lookAt);
  ch.update(0);
  return ch;
}

let BLOB_MAT = null;
function blobMaterial() {
  if (BLOB_MAT) return BLOB_MAT;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  gr.addColorStop(0, 'rgba(0,0,0,0.55)');
  gr.addColorStop(0.5, 'rgba(0,0,0,0.3)');
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  BLOB_MAT = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  return BLOB_MAT;
}

// ---- runtime --------------------------------------------------------------------------------
const wp = new THREE.Vector3();
const lp = new THREE.Vector3();
export class Character {
  constructor(root, mesh, bones, motion, x) {
    this.root = root;
    this.mesh = mesh;
    this.bones = bones;
    this.motion = motion;
    this.x = x;
    this.scale = x.scale;
    this.target = null;
    this.look = { yaw: 0, pitch: 0, w: 0 };
    this.talking = false;
    this.autoSpeed = true;
    this.fixedSpeed = null;
    this.speed = 0;
    this.lastPos = null;
    this.blinkT = 1 + Math.random() * 3;
    this.mouthT = 0;
    this.reactT = 0;
    this.reactKind = '';
    this.smokeT = 4;
    this.frame = 0;
    root.userData.character = this;
  }
  get state() {
    return this.motion.state;
  }
  set(state, o) {
    this.motion.set(state, o);
    return this;
  }
  sitDown() {
    this.motion.sitDown();
    return this;
  }
  standUp() {
    this.motion.standUp();
    return this;
  }
  talk(on = true) {
    this.talking = on;
    return this;
  }
  // a world point (Vector3, or any Object3D, followed every frame); null stops tracking
  lookAt(target) {
    this.target = target;
    return this;
  }
  setSpeed(v) {
    this.fixedSpeed = v;
    return this;
  }
  setMood(m) {
    this.motion.moodTarget = clamp(m, 0, 1);
    return this;
  }
  react(kind) {
    this.reactT = 0.9;
    this.reactKind = kind;
  }
  // put the person on a kit chair (props.js: the chair faces +z, seat top at seatH) and sit at once
  sitOn(chair, seatH) {
    chair.updateWorldMatrix(true, false);
    chair.getWorldPosition(this.root.position);
    chair.getWorldQuaternion(this.root.quaternion);
    if (this.root.parent) {
      this.root.parent.updateWorldMatrix(true, false);
      this.root.parent.worldToLocal(this.root.position);
    }
    this.motion.seatH = seatH ?? chair.userData.seatH ?? this.motion.seatH;
    this.motion.set('sit', { fade: 0 });
    this.motion.from = null;
    this.lastPos = null;
    this.update(0);
    return this;
  }
  measureSpeed(dt) {
    this.root.getWorldPosition(wp);
    if (this.lastPos && dt > 0) {
      const dx = wp.x - this.lastPos.x;
      const dz = wp.z - this.lastPos.z;
      const d = Math.hypot(dx, dz);
      if (d < 2) {
        // signed along the facing direction; the full ground speed drives the gait
        this.root.getWorldDirection(lp);
        const v = (Math.sign(dx * lp.x + dz * lp.z || 1) * d) / dt / this.scale;
        this.speed = damp(this.speed, v, 12, dt);
      }
    }
    this.lastPos = (this.lastPos || new THREE.Vector3()).copy(wp);
    return this.speed;
  }
  // dt seconds; lookAt / mood: the person.js signature (a point to turn the head to, pressure 0..1)
  update(dt, lookAt, mood) {
    if (lookAt !== undefined) this.target = lookAt;
    if (mood !== undefined) this.setMood(mood);
    const m = this.motion;
    const speed = this.fixedSpeed ?? (this.autoSpeed ? this.measureSpeed(dt) : 0);
    const pose = m.update(dt, speed);
    for (const ev of m.events.splice(0)) {
      // the transitions start / end SIT_STAND_Z in front of the chair
      if (ev === 'sitDown:start') this.root.translateZ(-SIT_STAND_Z * this.scale);
      if (ev === 'standUp') this.root.translateZ(SIT_STAND_Z * this.scale);
      if (ev === 'standUp' || ev === 'sitDown:start') {
        this.root.updateMatrixWorld();
        this.root.getWorldPosition(wp);
        this.lastPos?.copy(wp);
        if (ev === 'standUp') m.update(0, 0);
      }
    }
    this.apply(pose, dt);
    this.faceUpdate(dt, pose);
    return this;
  }
  apply(p, dt) {
    const B = this.bones;
    const t = this.motion.t;
    let headX = p.headX;
    let headY = p.headY;
    let neckX = p.neckX;
    let neckY = p.neckY;
    let chestY = p.chestY;
    let waistX = p.waistX;
    // head tracking, smoothed, weight fades in / out
    let want = 0;
    if (this.target) {
      const tp = this.target.isObject3D ? this.target.getWorldPosition(lp) : lp.copy(this.target);
      this.root.worldToLocal(tp);
      tp.divideScalar(this.scale);
      const a = lookAngles(tp.x - p.hipsX, tp.y - (p.hipsY + 0.72), tp.z - p.hipsZ);
      if (canTrack(a.yaw)) {
        want = 1;
        this.look.yaw = damp(this.look.yaw, a.yaw, 7, dt);
        this.look.pitch = damp(this.look.pitch, a.pitch, 7, dt);
      }
    }
    this.look.w = damp(this.look.w, want, 4, dt);
    if (this.look.w > 1e-3) {
      const s = splitLook(this.look.yaw, this.look.pitch);
      const w = this.look.w;
      headY += (s.headY - headY) * w;
      neckY += (s.neckY - neckY) * w;
      headX += (s.headX - headX * 0.5) * w;
      neckX += s.neckX * w;
      chestY += s.chestY * w;
    }
    // talking while doing something else: small nods
    if (this.talking && this.motion.state !== 'talk') headX += Math.sin(t * 6.1) * 0.025 * Math.max(0, Math.sin(t * 2.7));
    if (this.reactT > 0) {
      this.reactT -= dt;
      const k = Math.sin((Math.max(0, this.reactT) / 0.9) * Math.PI);
      if (this.reactKind === 'press') {
        headX -= k * 0.35;
        waistX -= k * 0.08;
      } else headX += k * 0.18;
    }
    const tr = p.tremble ? (s) => wobble(t * 9, s) * 0.03 * p.tremble : () => 0;
    B.hips.position.set(p.hipsX, p.hipsY, p.hipsZ);
    B.pelvis.rotation.set(0, p.hipsYaw, 0);
    B.waist.rotation.set(waistX, p.waistY, p.waistZ);
    B.chest.rotation.set(p.chestX, chestY, p.chestZ);
    B.chest.scale.set(1 + p.breath * 0.006, 1 + p.breath * 0.008, 1 + p.breath * 0.012);
    B.neck.rotation.set(neckX, neckY, 0);
    B.head.rotation.set(headX + tr(1), headY + tr(2), p.headZ);
    let shRx = p.shRx;
    let elR = p.elR;
    if (this.x.smoker && (this.motion.state === 'idle' || this.motion.state === 'talk')) {
      this.smokeT -= dt;
      const up = this.smokeT < 1.6 && this.smokeT > 0 ? Math.sin((this.smokeT / 1.6) * Math.PI) : 0;
      if (this.smokeT < -6 + this.motion.mood * 4) this.smokeT = 6 - this.motion.mood * 3 + Math.random() * 5;
      shRx = -0.35 - up * 1.0;
      elR = -0.6 - up * 1.5;
      this.x.cig.userData.ember.material.color.setHex(up > 0.5 ? 0xffaa44 : 0xff5a1a);
    }
    B.shL.rotation.set(p.shLx + tr(3), p.shLy, p.shLabd);
    B.shR.rotation.set(shRx + tr(4), -p.shRy, -p.shRabd);
    B.elL.rotation.set(p.elL, 0, 0);
    B.elR.rotation.set(elR, 0, 0);
    B.wrL.rotation.set(p.wrL, 0, 0);
    B.wrR.rotation.set(p.wrR, 0, 0);
    const legs = solveLegs(p, this.x.body);
    for (const s of ['L', 'R']) {
      const l = legs[s];
      B[`thigh${s}`].rotation.set(l.hipX, 0, l.hipZ);
      B[`shin${s}`].rotation.set(l.knee, 0, 0);
      B[`foot${s}`].rotation.set(l.ankle, 0, -l.hipZ);
    }
    if (this.x.blob) {
      this.x.blob.position.set(p.hipsX * this.scale, 0.004, (p.hipsZ + 0.03) * this.scale);
      const sc = this.scale * (p.hipsY < 0.7 ? 1.1 : 1);
      this.x.blob.scale.setScalar(sc);
    }
  }
  faceUpdate(dt, p) {
    const f = this.x.face;
    this.blinkT -= dt;
    let map = f.open;
    if (this.blinkT < 0) {
      map = f.blink;
      if (this.blinkT < -0.12) this.blinkT = (this.motion.state === 'scared' ? 0.8 : 2) + Math.random() * 3.5;
    } else if (this.talking || p.mouth > 0.5) {
      // syllables: open / shut at an irregular 5-9 Hz
      this.mouthT -= dt;
      if (this.mouthT < 0) {
        this.mouthOpen = !this.mouthOpen && Math.random() > 0.15;
        this.mouthT = 0.06 + Math.random() * 0.12;
      }
      if (this.mouthOpen) map = f.talk;
    }
    if (this.x.faceMat.map !== map) this.x.faceMat.map = map;
  }
  // The current pose as a static geometry (CPU skinning) in the root's space, with the same groups
  // and materials: for InstancedMesh crowds that do not need to move (an audience, a queue).
  bakeStatic() {
    const src = this.mesh.geometry;
    const out = new THREE.BufferGeometry();
    const n = src.attributes.position.count;
    const pos = new Float32Array(n * 3);
    this.root.updateMatrixWorld(true);
    this.mesh.skeleton.update();
    const v = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      this.mesh.getVertexPosition(i, v);
      pos.set([v.x, v.y, v.z], i * 3);
    }
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('uv', src.attributes.uv.clone());
    out.setAttribute('color', src.attributes.color.clone());
    out.setIndex(src.index.clone());
    for (const g of src.groups) out.addGroup(g.start, g.count, g.materialIndex);
    out.computeVertexNormals();
    return out;
  }
  dispose() {
    this.mesh.geometry.dispose();
    this.x.faceMat.dispose();
    this.root.removeFromParent();
  }
}

// Update a crowd: near people every frame, far ones every 2nd / 3rd / 6th frame (with the time they
// missed), so 50 people cost about as much as 15.
export function updateCrowd(list, camera, dt) {
  camera.getWorldPosition(lp);
  for (const c of list) {
    c.root.getWorldPosition(wp);
    const { every } = crowdLevel(wp.distanceTo(lp));
    c.crowdDt = (c.crowdDt || 0) + dt;
    c.frame++;
    if (c.frame % every === 0) {
      c.update(c.crowdDt);
      c.crowdDt = 0;
    }
  }
}

// ---- js/person.js compatibility -------------------------------------------------------------
// Same options (coat, trousers, skin, skinHex, hair, brow, lip, pose: 'sit' | 'stand', height,
// seatH, female, smoker, fabric) and the same return shape; plus the Character as .character.
export function buildPerson(o = {}) {
  const c = makeCharacter({ ...o, legs: o.height || 1, scale: o.scale || 1, pose: o.pose, state: o.pose === 'sit' ? 'sit' : 'idle' });
  // person.js people stay where they are put: turning or carrying them is not walking
  c.autoSpeed = o.autoSpeed ?? false;
  return {
    root: c.root,
    character: c,
    update: (dt, lookAt, mood = 0) => c.update(dt, lookAt ?? null, mood),
    react: (kind) => c.react(kind),
  };
}
