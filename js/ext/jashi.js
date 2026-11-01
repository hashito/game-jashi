// 邪視: the 4.x creature (pale skin, one vertical eye, a dislocated jaw, a covered emaciated body and a sickle), registered as the
// monster look "jashi" (ext.registerLook). The model is the 4.x buildCreature; on top of it: a walking gait, the haze it stands in
// (feedback 2026-11-01 「モヤがかかっている感じ」), the head that turns to you, and the sickle raised / swung by the gaze system (gaze.js).
import * as THREE from 'three';

const clamp = (n, a = 0, b = 1) => Math.max(a, Math.min(b, n));
const material = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.94, ...extra });
export const HEIGHT = 2.62;

/** the 4.x creature, unchanged in shape (dist/creature.js buildCreature); returns { root, parts } */
export function buildCreature() {
  const root = new THREE.Group(); root.name = 'jashi';
  const group = (name, parent, x = 0, y = 0, z = 0) => { const o = new THREE.Group(); o.name = name; o.position.set(x, y, z); parent.add(o); return o; };
  const mesh = (name, geometry, skin, parent, x = 0, y = 0, z = 0, scale) => { const o = new THREE.Mesh(geometry, skin); o.name = name; o.position.set(x, y, z); if (scale) o.scale.set(...scale); o.castShadow = true; parent.add(o); return o; };
  const ball = (name, skin, parent, x, y, z, scale, seg = 10) => mesh(name, new THREE.SphereGeometry(1, seg, 8), skin, parent, x, y, z, scale);
  const tube = (name, points, radius, skin, parent, closed = false) => mesh(name, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), closed), points.length * 2, radius, 5, closed), skin, parent);
  const maps = {};
  const loader = typeof document !== 'undefined' ? new THREE.TextureLoader() : null;
  for (const [name, rep] of [['skin', [1.6, 1.6]], ['cloth', [3, 2]], ['iron', [1.5, 1.5]], ['wood', [1, 2]]]) {
    if (!loader) { maps[name] = null; continue; }
    const t = loader.load(`assets/textures/creature-${name}-v4-2.webp`, undefined, undefined, () => {});
    t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...rep); t.anisotropy = 2; maps[name] = t;
  }
  const textured = (color, name, extra = {}) => material(color, { map: maps[name], ...extra, bumpMap: extra.bumpScale ? maps[name] : null });
  const skin = textured('#d3d1bd', 'skin', { bumpScale: 0.005 }), tendon = textured('#b5b7a3', 'skin', { bumpScale: 0.004 }), fold = textured('#6b7264', 'skin', { bumpScale: 0.003 });
  const cavity = material('#100f12', { roughness: 0.99 }), tooth = material('#b8b196', { roughness: 0.73 }), nail = material('#665f4b', { roughness: 0.86 });
  const shroud = textured('#929688', 'cloth', { roughness: 1, bumpScale: 0.009 }), binding = textured('#555548', 'cloth', { roughness: 1 });
  const handleMat = textured('#a08a6c', 'wood', { roughness: 0.91, bumpScale: 0.006 });
  const bladeMat = textured('#aaa38e', 'iron', { metalness: 0.62, roughness: 0.78, bumpScale: 0.003, side: THREE.DoubleSide }), edgeMat = textured('#cccbbb', 'iron', { metalness: 0.78, roughness: 0.52 });

  const torso = group('torso', root);
  ball('ribcage', skin, torso, -0.025, 1.53, -0.035, [0.3, 0.5, 0.185]);
  ball('hollow-waist', skin, torso, 0.012, 1.2, 0.015, [0.175, 0.29, 0.135]);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) tube(`rib-${side}-${i}`, [[side * 0.035, 1.77 - i * 0.11, 0.142], [side * 0.15, 1.72 - i * 0.105, 0.161], [side * 0.245, 1.66 - i * 0.095, 0.09]], 0.013, tendon, torso);
    ball(`shoulder-${side}`, skin, torso, side * 0.25, 1.88, -0.025, [0.15, 0.125, 0.15]);
    tube(`neck-tendon-${side}`, [[side * 0.16, 1.86, 0.09], [side * 0.095, 2.04, 0.11], [side * 0.11 - 0.06, 2.22, 0.12]], 0.018, tendon, torso);
  }
  mesh('neck', new THREE.CylinderGeometry(0.073, 0.11, 0.39, 10), skin, torso, -0.055, 2.02, 0.035);
  mesh('torn-shroud', new THREE.CylinderGeometry(0.2, 0.245, 0.68, 11), shroud, torso, 0.015, 0.91, 0.015);
  for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; const s = mesh(`shroud-edge-${i}`, new THREE.ConeGeometry(0.05, 0.18 + (i % 2) * 0.05, 3), shroud, torso, Math.sin(a) * 0.22, 0.55 - (i % 2) * 0.025, Math.cos(a) * 0.22); s.rotation.z = Math.PI; }

  const head = group('head', torso, -0.075, 2.28, 0.14);
  const skullGeo = new THREE.SphereGeometry(1, 18, 14), sp = skullGeo.attributes.position;
  for (let i = 0; i < sp.count; i++) { let x = sp.getX(i); const y = sp.getY(i); let z = sp.getZ(i); if (y < -0.05 && z > 0) z *= 0.46 + 0.3 * Math.abs(x); x *= 1 + 0.045 * y - 0.055 * Math.sin(y * 4); sp.setXYZ(i, x, y, z); }
  skullGeo.computeVertexNormals();
  mesh('pale-skull', skullGeo, skin, head, 0, 0.025, -0.025, [0.3, 0.365, 0.245]);
  for (const side of [-1, 1]) {
    ball(`temple-${side}`, tendon, head, side * 0.205, 0.035 + side * 0.015, 0.125, [0.085, 0.16, 0.105]);
    tube(`cheekbone-${side}`, [[side * 0.245, 0.13, 0.13], [side * 0.23, -0.025, 0.215], [side * 0.155, -0.085, 0.265], [side * 0.13, -0.18, 0.2]], 0.029, skin, head);
    tube(`jaw-tendon-${side}`, [[side * 0.22, -0.035, 0.12], [side * 0.18, -0.225, 0.17], [side * 0.105 + 0.02, -0.34, 0.21]], 0.014, tendon, head);
  }
  ball('vertical-eye-socket', fold, head, 0.004, 0.115, 0.232, [0.135, 0.222, 0.075], 14);
  const ocular = group('ocular', head, 0.004, 0.115, 0.292);
  ball('single-vertical-eye', material('#c1c4ab', { roughness: 0.27 }), ocular, 0, 0, 0, [0.078, 0.155, 0.048], 16);
  const iris = ball('vertical-iris', material('#767e4a', { roughness: 0.35 }), ocular, -0.005, -0.006, 0.045, [0.044, 0.113, 0.012], 12);
  const pupil = ball('single-slit-pupil', cavity, ocular, -0.005, -0.006, 0.057, [0.013, 0.083, 0.008], 10);
  ball('eye-catchlight', new THREE.MeshBasicMaterial({ color: '#dedfbb' }), pupil, -0.25, 0.42, 0.82, [0.13, 0.08, 0.13], 6);
  const upperLid = group('upper-lid', head, 0.004, 0.115, 0.292), lowerLid = group('lower-lid', head, 0.004, 0.115, 0.292);
  const rim = (a0, a1, n, r) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + (a1 - a0) * i / n; return [Math.cos(a) * r, Math.sin(a) * 0.17, 0.012 + Math.sin(a * 2) * 0.011]; });
  tube('heavy-upper-eyelid', rim(0, Math.PI, 8, 0.091), 0.027, skin, upperLid);
  tube('uneven-lower-eyelid', rim(Math.PI, Math.PI * 2, 8, 0.09), 0.019, tendon, lowerLid);
  tube('forehead-ridge-left', [[-0.09, 0.32, 0.18], [-0.145, 0.235, 0.255], [-0.14, 0.08, 0.265], [-0.105, -0.065, 0.27]], 0.028, skin, head);
  tube('forehead-ridge-right', [[0.1, 0.315, 0.17], [0.135, 0.23, 0.25], [0.12, 0.1, 0.267], [0.104, -0.035, 0.26]], 0.02, tendon, head);
  ball('collapsed-nose-bridge', skin, head, -0.003, -0.091, 0.245, [0.045, 0.068, 0.036]);
  ball('mouth-cavity', cavity, head, 0.01, -0.215, 0.176, [0.139, 0.147, 0.085], 14);
  tube('upper-mouth-rim', [[-0.137, -0.185, 0.23], [-0.105, -0.133, 0.27], [-0.035, -0.126, 0.284], [0.065, -0.143, 0.275], [0.141, -0.205, 0.22]], 0.02, tendon, head);
  const jaw = group('dislocated-jaw', head, 0.026, -0.17, 0.13); jaw.rotation.z = -0.16;
  tube('lower-jaw-bone', [[-0.16, 0.015, 0.055], [-0.13, -0.145, 0.103], [-0.035, -0.196, 0.139], [0.07, -0.178, 0.141], [0.13, -0.063, 0.072]], 0.034, skin, jaw);
  ball('drawn-chin', skin, jaw, -0.007, -0.193, 0.112, [0.085, 0.046, 0.052]);
  for (let i = 0; i < 7; i++) {
    const x = (i - 3) * 0.029, len = [0.036, 0.058, 0.044, 0.067, 0.042, 0.055, 0.034][i];
    const up = mesh(`upper-tooth-${i}`, new THREE.ConeGeometry(0.011 + (i % 2) * 0.002, len, 5), tooth, head, x, -0.151 - len / 2 + Math.abs(x) * 0.16, 0.272 - Math.abs(x) * 0.18); up.rotation.z = Math.PI + (i - 3) * 0.055;
    if (i !== 2 && i !== 5) { const lo = mesh(`lower-tooth-${i}`, new THREE.ConeGeometry(0.012, len * 0.7, 5), tooth, jaw, x - 0.007, -0.148 + len * 0.25, 0.145 - Math.abs(x) * 0.12); lo.rotation.z = (i - 3) * 0.04; }
  }
  const throat = ball('throat-tension', tendon, torso, -0.052, 2.02, 0.118, [0.047, 0.1, 0.027]);
  const arms = [], legs = [];
  for (const side of [-1, 1]) {
    const arm = group(`arm-${side}`, torso, side * 0.31, 1.88, -0.02);
    ball('upper-arm', skin, arm, side * 0.04, -0.29, 0.015, [0.079, 0.35, 0.071]);
    ball('protruding-elbow', tendon, arm, side * 0.075, -0.6, 0.025, [0.071, 0.066, 0.063]);
    ball('long-forearm', skin, arm, side * 0.09, -0.88, 0.08, [0.051, 0.34, 0.054]);
    tube('forearm-tendon', [[side * 0.08, -0.63, 0.075], [side * 0.105, -0.94, 0.128], [side * 0.1, -1.23, 0.162]], 0.009, tendon, arm);
    ball('knuckled-palm', skin, arm, side * 0.1, -1.2, 0.13, [0.074, 0.12, 0.037]);
    for (let f = 0; f < 4; f++) {
      const len = 0.16 + (f === 1 ? 0.035 : 0), x = side * 0.1 + (f - 1.5) * 0.03;
      const fi = mesh(`finger-${side}-${f}`, new THREE.CylinderGeometry(0.012, 0.008, len, 5), skin, arm, x, -1.36, 0.15); fi.rotation.x = -0.3 - f * 0.07;
      const cl = mesh(`claw-${side}-${f}`, new THREE.ConeGeometry(0.009, 0.055, 5), nail, fi, 0, -len / 2 + 0.014, 0.02); cl.rotation.x = -Math.PI / 2 - 0.25;
    }
    arms.push(arm);
    const leg = group(`leg-${side}`, root, side * 0.13, 0.98, 0.005);
    ball('thigh', skin, leg, side * 0.015, -0.23, -0.015, [0.085, 0.29, 0.078]);
    ball('exposed-knee', tendon, leg, side * 0.01, -0.49, 0.025, [0.073, 0.065, 0.062]);
    mesh('shin', new THREE.CylinderGeometry(0.055, 0.035, 0.46, 8), skin, leg, 0, -0.72, 0.045);
    ball('long-foot', tendon, leg, 0, -0.93, 0.12, [0.073, 0.045, 0.165]);
    legs.push(leg);
  }
  const sickle = group('sickle', arms[1], 0.1, -1.2, 0.16);
  const handle = mesh('worn-wood-handle', new THREE.CylinderGeometry(0.023, 0.031, 0.8, 8), handleMat, sickle, 0, 0.1, 0); handle.rotation.z = -0.18;
  for (let i = 0; i < 3; i++) mesh(`sickle-binding-${i}`, new THREE.CylinderGeometry(0.033, 0.033, 0.022, 7), binding, sickle, -0.045 + i * 0.004, 0.34 + i * 0.035, 0);
  const bs = new THREE.Shape(); bs.moveTo(-0.07, 0.47); bs.bezierCurveTo(0.28, 0.69, 0.8, 0.65, 0.72, -0.17); bs.bezierCurveTo(0.65, 0.22, 0.41, 0.42, -0.07, 0.38);
  mesh('curved-rusted-blade', new THREE.ExtrudeGeometry(bs, { depth: 0.018, bevelEnabled: false, curveSegments: 10 }), bladeMat, sickle, 0, 0, -0.009);
  tube('chipped-cutting-edge', [[-0.055, 0.395, 0.012], [0.3, 0.4, 0.012], [0.57, 0.265, 0.012], [0.72, -0.17, 0.012]], 0.008, edgeMat, sickle);
  return { root, parts: { torso, head, jaw, ocular, iris, pupil, upperLid, lowerLid, throat, arms, legs, sickle } };
}

let hazeTex = null;
function hazeTexture() {
  if (hazeTex || typeof document === 'undefined') return hazeTex;
  const cv = document.createElement('canvas'); cv.width = cv.height = 128; const g = cv.getContext('2d');
  for (let i = 0; i < 7; i++) { const x = 64 + Math.cos(i * 2.1) * 14, y = 64 + Math.sin(i * 2.1) * 12, gr = g.createRadialGradient(x, y, 2, x, y, 50); gr.addColorStop(0, 'rgba(255,255,255,0.3)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); }
  hazeTex = new THREE.CanvasTexture(cv); hazeTex.colorSpace = THREE.SRGBColorSpace; return hazeTex;
}

/** the creature with its gait, haze and the attack poses; pose = { attack: '' | 'windup' | 'strike' | 'recover' | 'stunned', progress 0..1 } */
export function makeJashi(o = {}) {
  const { root, parts: P } = buildCreature();
  root.scale.setScalar(HEIGHT / 2.62);
  const haze = new THREE.Group(); haze.name = 'haze'; root.add(haze);
  const puffs = [], tex = hazeTexture();
  for (let i = 0; i < (o.detail === 1 ? 10 : 15); i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xd9ddd3, transparent: true, opacity: 0, depthWrite: false, fog: true }));
    s.userData = { a: i * 2.39996, r: 0.3 + (i % 4) * 0.12, y: 0.15 + (i / 14) * 2.5, k: 0.9 + (i % 3) * 0.35, ph: i * 0.7, base: 0.12 + (i % 5) * 0.022 }; s.renderOrder = 4; haze.add(s); puffs.push(s);
  }
  const S = { t: 0, walk: 0, jaw: 0 };
  const update = (dt, { speed = 0, look = null, pose = {} } = {}) => {
    S.t += dt; const t = S.t;
    // gait: long slow strides, the torso leaning forward when it hunts
    S.walk += dt * (0.8 + speed * 1.15);
    const sw = Math.sin(S.walk * 2.2) * Math.min(1, speed / 1.2);
    P.legs[0].rotation.x = sw * 0.55; P.legs[1].rotation.x = -sw * 0.55;
    P.arms[0].rotation.x = -sw * 0.32;
    P.torso.rotation.x = 0.08 + Math.min(0.2, speed * 0.05) + Math.sin(t * 2.05) * 0.015;
    // the sickle arm: hanging, raised high behind the shoulder (windup), swung across (strike), lowered (recover)
    const p = clamp(pose.progress || 0), arm = P.arms[1];
    let ax = sw * 0.32, az = 0;
    if (pose.attack === 'windup') { ax = -2.4 * p; az = -0.4 * p; } else if (pose.attack === 'strike') { ax = -2.4 + 3.4 * p; az = -0.4 + 0.9 * p; } else if (pose.attack === 'recover') { ax = 1.0 * (1 - p); az = 0.5 * (1 - p); } else if (pose.attack === 'stunned') { ax = 0.4; az = 0.2; P.torso.rotation.x = -0.18; }
    arm.rotation.x += (ax - arm.rotation.x) * Math.min(1, dt * (pose.attack === 'strike' ? 30 : 9)); arm.rotation.z += (az - arm.rotation.z) * Math.min(1, dt * 9);
    // the head turns to you (and leans a little too far); the eye follows
    if (look) {
      const wp = new THREE.Vector3(); P.head.getWorldPosition(wp);
      const yaw = Math.atan2(look.x - wp.x, look.z - wp.z) - root.rotation.y;
      let d = yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
      P.head.rotation.y += (clamp(d, -1.2, 1.2) - P.head.rotation.y) * Math.min(1, dt * 5);
      P.head.rotation.z = Math.sin(t * 0.9) * 0.1 + 0.18;
    } else { P.head.rotation.y *= 1 - Math.min(1, dt * 2); P.head.rotation.z = Math.sin(t * 0.9) * 0.08; }
    // soft tissue (4.x updateCreatureDetails): breath, the gasp of the attack, the rare slow blink, the throat
    const gasp = pose.attack === 'windup' ? p * 0.5 : pose.attack === 'strike' ? 0.55 : pose.attack === 'stunned' ? 0.68 : 0;
    const target = 0.045 + (Math.sin(t * (speed > 1.5 ? 5.4 : 2.05)) + 1) * 0.027 + gasp;
    P.jaw.rotation.x += (target - P.jaw.rotation.x) * (1 - Math.exp(-Math.min(0.1, dt) * 9));
    P.jaw.rotation.z = -0.16 + Math.sin(t * 1.7) * 0.025 + gasp * 0.12;
    const ph = (t + 2.3) % 9.7, blink = ph < 0.42 ? Math.sin(ph / 0.42 * Math.PI) * 0.86 : 0;
    P.ocular.scale.y = 1 - blink * 0.77; P.upperLid.position.y = 0.115 - blink * 0.13; P.lowerLid.position.y = 0.115 + blink * 0.07;
    P.pupil.scale.x = 1 + gasp * 0.35; P.throat.scale.y = 1 + Math.sin(t * 2.05) * 0.07 + gasp * 0.22;
    for (const s of puffs) {
      const u = s.userData, rise = (t * 0.12 + u.ph * 0.4) % 1;
      s.position.set(Math.cos(u.a + t * 0.15) * u.r, u.y + rise * 0.35, Math.sin(u.a + t * 0.15) * u.r * 0.8);
      const sc = (0.75 + u.k * 0.55) * (0.9 + 0.12 * Math.sin(t * 0.8 + u.ph)); s.scale.set(sc, sc, 1);
      s.material.opacity = u.base * Math.sin(Math.PI * rise) * (0.75 + 0.25 * Math.sin(t * 1.3 + u.ph));
    }
  };
  return { root, parts: P, haze, update };
}

// the look contract of monster-std: { root, update(dt, st, cam), respawn(), dispose() }. The attack pose comes from the gaze system (shared.pose).
export function jashiLook(shared) {
  return () => {
    const j = makeJashi(); const root = j.root; root.visible = false;
    let last = null;
    return {
      kind: 'jashi', root,
      update(dt, st, cam) {
        root.visible = !!st.visible && !shared.hidden;
        if (!root.visible) return;
        root.position.set(st.pos.x, st.floorY || 0, st.pos.z);
        let d = st.yaw - root.rotation.y; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
        root.rotation.y += d * Math.min(1, dt * 3.5);
        const sp = last ? Math.hypot(st.pos.x - last.x, st.pos.z - last.z) / Math.max(dt, 1e-3) : 0; last = { x: st.pos.x, z: st.pos.z };
        const sees = st.state === 'chase' || st.state === 'lose' || st.state === 'near';
        j.update(dt, { speed: st.moving ? sp : 0, look: sees || (shared.pose && shared.pose.attack) ? cam.position : null, pose: shared.pose || {} });
      },
      respawn() { last = null; },
      dispose() { root.removeFromParent(); },
    };
  };
}
