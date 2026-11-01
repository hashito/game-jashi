/* game-kit 6e0b6f0: js/monster-looks.js — edit in game-kit and run tools/kit-sync.js */
// The bodies of the standard monster (js/monster-std.js). Two looks:
//   'windmill'      the みる風車 (game-miru-fusha js/fusha.js, js/emoji.js) EXACTLY: flat emoji pictures (😁 and 👆👈👉👇; 🫵 on a blank face when it has
//                   seen you), a pinwheel that spins and drops frames, bigger as it nears, always facing you. No red, no black.
//                   The pictures are the Twemoji SVGs of assets/monster/*.svg (CC BY 4.0, Twitter, Inc and other contributors: credit them).
//   'dark-red-mist' a person (js/character.js) whose body is near-black with a thin deep-red rim that stutters; used with the red-black mist of
//                   js/fx-std.js for every monster that is not the windmill (S12).
// A look is { root, update(dt, st, cam), dispose() } where st = { state, pos:{x,z,floor}, yaw, moving, speed, dist, visible, floorY }.
import * as THREE from 'three';
import { makeCharacter } from './character.js';

// ---------------- windmill ----------------
export const WINDMILL_FILES = { faceGrin: 'face_grin.svg', faceBlank: 'face_seen.svg', handUp: 'hand_up.svg', handLeft: 'hand_left.svg', handDown: 'hand_down.svg', handRight: 'hand_right.svg', handYou: 'hand_you.svg' };
export const HAND_KEYS = ['handUp', 'handLeft', 'handDown', 'handRight'];
const texCache = new Map();
// canvas textures are made now (blank) and painted when the picture has loaded, so a look never waits for the network
export function windmillTextures(base = 'assets/monster/') {
  if (texCache.has(base)) return texCache.get(base);
  const TEX = {};
  for (const [k, f] of Object.entries(WINDMILL_FILES)) {
    const c = document.createElement('canvas'); c.width = c.height = 512;
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    TEX[k] = t;
    const img = new Image();
    img.onload = () => { c.getContext('2d').drawImage(img, 0, 0, 512, 512); t.needsUpdate = true; };
    img.src = base + f;
  }
  texCache.set(base, TEX);
  return TEX;
}

// pose 0: 😁 with 👆👈👇👉   pose 1: 🫪 with 🫵 all round (it has seen you)   pose 2: fingers fold in (the kill)
export function setPose(model, pose, k = 0) {
  const recog = pose >= 1;
  if (model.pose !== (recog ? 1 : 0)) {
    model.pose = recog ? 1 : 0;
    model.face.material.map = recog ? model.TEX.faceBlank : model.TEX.faceGrin;
    model.face.material.needsUpdate = true;
    for (const h of model.hands) { h.mesh.material.map = recog ? model.TEX.handYou : model.TEX[h.key]; h.mesh.material.needsUpdate = true; }
  }
  const dist = pose === 2 ? 0.9 - 0.55 * k : 0.9;
  for (const h of model.hands) {
    h.mesh.position.set(-Math.sin(h.ang) * dist, Math.cos(h.ang) * dist, 0.02);
    h.mesh.rotation.z = recog ? -model.spinnerAngle || 0 : 0; // 🫵 stays upright and stares at you
    h.mesh.scale.setScalar(pose === 2 ? 1 + 0.5 * k : 1);
  }
}

export function windmillLook(o = {}) {
  const TEX = windmillTextures(o.assets);
  const root = new THREE.Group(), spinner = new THREE.Group();
  root.add(spinner);
  const mat = (tex) => new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, color: 0xd8d0c0 });
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.95), mat(TEX.faceGrin));
  face.position.z = 0.01; spinner.add(face);
  const hands = [];
  for (let k = 0; k < 4; k++) { // 0 up, 1 left, 2 down, 3 right: the finger always points away from the face
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), mat(TEX[HAND_KEYS[k]]));
    hands.push({ mesh: m, ang: (k * Math.PI) / 2, key: HAND_KEYS[k] });
    spinner.add(m);
  }
  const model = { root, spinner, face, hands, pose: -1, TEX, spinnerAngle: 0 };
  setPose(model, 0, 0);
  root.visible = false;
  const S = { size: o.size || 1, base: o.size || 1, angle: 0, hang: 0, poseV: 0, poseT: 0, tick: 0 };
  return {
    kind: 'windmill', root, model,
    update(dt, st, cam) {
      root.visible = !!st.visible;
      if (!root.visible) return;
      // the closer it gets, the bigger it looms; the hunting one grows as it closes in
      const want = S.base * (1 + Math.max(0, (9 - st.dist) / 9) * (st.state === 'chase' ? 1.0 : 0.9));
      S.size += (Math.min(2, want) - S.size) * Math.min(1, dt * 1.4);
      const fy = st.floorY || 0, ceil = st.ceil || 3.2;
      let y = Math.max(1.55 * S.size, 1.25 * S.size + 0.15);
      y = Math.min(y, ceil - 1.25 * S.size - 0.05);
      root.position.set(st.pos.x, fy + Math.max(0.6, y), st.pos.z);
      root.scale.setScalar(S.size);
      root.rotation.y = Math.atan2(cam.x - st.pos.x, cam.z - st.pos.z); // always faces you
      if (st.state === 'chase') { // hunting: no spin, it holds still and stares (🫵🫪)
        const up = Math.round(S.angle / (Math.PI * 2)) * Math.PI * 2;
        S.angle += (up - S.angle) * Math.min(1, dt * 12);
      } else if (st.state !== 'lose') { // it spins like a pinwheel; now and then a few frames drop
        S.hang -= dt;
        if (S.hang <= 0) {
          if (Math.random() < dt * 0.6) S.hang = 0.08 + Math.random() * 0.15;
          S.angle += (st.state === 'idle' ? 2.5 : 5) * dt * (S.hang > 0 ? 3 : 1);
        }
      }
      spinner.rotation.z = S.angle; model.spinnerAngle = S.angle;
      S.poseT = st.state === 'chase' || st.state === 'lose' ? 1 : 0;
      S.poseV += (S.poseT - S.poseV) * Math.min(1, dt * 14);
      setPose(model, S.poseV > 0.5 ? 1 : 0, 0);
    },
    // a new appearance has a new size
    respawn() { S.base = S.size = 0.55 + Math.random() * 0.75; },
    dispose() { root.removeFromParent(); },
  };
}

// ---------------- dark-red-mist ----------------
export function darkRedMistLook(o = {}) {
  const c = makeCharacter({ coat: 0x6a7076, trousers: 0x3a3e44, shirt: 0x9aa0a4, shoes: 0x1a1a1a, hair: 0x1a1816, skin: 0xd8c2b0, build: -0.6, legs: 1.08, scale: 1.06, hairStyle: 'short', outfit: 'shirt', blob: true, ...(o.character || {}) });
  const root = c.root;
  root.name = 'monster'; root.visible = false;
  const mats = [];
  // near-black body with a thin deep-red rim: it must read as something that should not be touched
  root.traverse((m) => {
    if (!m.isMesh) return;
    if (m.name !== 'blob') m.castShadow = true;
    if (m.name === 'blob' || !m.material) return;
    const one = (mt) => { const k = mt.clone(); if (k.color) k.color.multiplyScalar(0.16); if (k.emissive) { k.emissive.setHex(o.rim || 0x3a0505); k.emissiveIntensity = 0.5; } mats.push(k); return k; };
    m.material = Array.isArray(m.material) ? m.material.map(one) : one(m.material);
  });
  const S = { t: 0, sy: root.scale.y };
  return {
    kind: 'dark-red-mist', root, character: c,
    update(dt, st, cam) {
      root.visible = !!st.visible;
      if (!root.visible) return;
      root.position.set(st.pos.x, st.floorY || 0, st.pos.z);
      let d = st.yaw - root.rotation.y; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
      root.rotation.y += d * Math.min(1, dt * 6);
      c.lookAt(st.state === 'chase' || st.state === 'lose' ? cam : null); // cam = the camera position (Vector3)
      if (!st.moving) c.setSpeed(0); else c.setSpeed(null);
      // flicker and smear: the red rim stutters, the figure stretches and slips sideways for a frame now and then
      S.t += dt;
      const fl = 0.35 + 0.35 * Math.sin(S.t * 23) * Math.sin(S.t * 7.3) + (Math.random() < 0.04 ? 0.8 : 0);
      for (const m of mats) if (m.emissive) m.emissiveIntensity = Math.max(0.1, fl + (st.state === 'chase' ? 0.4 : 0));
      const sm = Math.random() < 0.03 ? 1 : 0;
      root.position.x += sm * (Math.random() - 0.5) * 0.12;
      root.scale.y = S.sy * (1 + sm * 0.06);
      c.update(dt);
    },
    respawn() {},
    dispose() { root.removeFromParent(); },
  };
}

export const LOOKS = { windmill: windmillLook, 'dark-red-mist': darkRedMistLook };
export function createLook(kind, o = {}) {
  const f = LOOKS[kind];
  if (!f) throw new Error(`monster look "${kind}" is not one of ${Object.keys(LOOKS).join(', ')}`);
  return f(o);
}
