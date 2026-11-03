/* game-kit 77f396d: js/barrier-look.js — edit in game-kit and run tools/kit-sync.js */
// The look of a roped-off opening (standard 1.10.14, rule S13 "前半は行ける所を絞る"): a shimenawa-like rope on stakes with paper shide
// ('rope', outdoors, shrines, old houses) or cones with yellow-black tape ('tape', offices, plants, stations). The group is centred on
// the opening, runs along its local x (width w) and stands on y = 0; the caller places and turns it. A post every 3 m or less.
// world-from-plan uses it for doors with open + unlock; games with their own world (r5) use it for their gated arches.
import * as THREE from 'three';

const mats = {};
const mat = (k, c) => (mats[k] ||= new THREE.MeshStandardMaterial({ color: c, roughness: 0.75 }));
let stripeT = null;
function stripeTex() {
  if (stripeT) return stripeT;
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = 64; c.height = 16; const g = c.getContext('2d');
  g.fillStyle = '#e8c21a'; g.fillRect(0, 0, 64, 16); g.fillStyle = '#1a1a1a'; for (let x = -16; x < 64; x += 16) { g.beginPath(); g.moveTo(x, 16); g.lineTo(x + 8, 16); g.lineTo(x + 16, 0); g.lineTo(x + 8, 0); g.fill(); }
  stripeT = new THREE.CanvasTexture(c); stripeT.wrapS = THREE.RepeatWrapping; stripeT.colorSpace = THREE.SRGBColorSpace; return stripeT;
}

/** a rope / tape group across an opening of width w (kind 'rope' | 'tape') */
export function barrierLook(kind, w, name = 'barrier') {
  const G = new THREE.Group(); G.name = name;
  const part = (geo, mt, x, y, z) => { const o = new THREE.Mesh(geo, mt); o.position.set(x, y, z); o.castShadow = true; G.add(o); return o; };
  const half = w / 2 - 0.08;
  const n = Math.max(1, Math.ceil((half * 2) / 3)), xs = Array.from({ length: n + 1 }, (_, i) => -half + (i * half * 2) / n);
  if (kind === 'rope') {
    const stake = mat('barrier-stake', 0x5a4632), rope = mat('barrier-rope', 0xb59a62), paper = mat('barrier-paper', 0xe8e2d0);
    for (const x of xs) part(new THREE.CylinderGeometry(0.045, 0.05, 1.15, 8), stake, x, 0.575, 0);
    for (let i = 0; i < n; i++) {
      const x0 = xs[i], x1 = xs[i + 1], curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(x0, 1.0, 0), new THREE.Vector3((x0 + x1) / 2, 0.84, 0), new THREE.Vector3(x1, 1.0, 0));
      part(new THREE.TubeGeometry(curve, 12, 0.022, 6, false), rope, 0, 0, 0);
      const pt = curve.getPoint(0.5); part(new THREE.PlaneGeometry(0.07, 0.16), paper, pt.x, pt.y - 0.1, 0).material.side = THREE.DoubleSide;
    }
  } else {
    const cone = mat('barrier-cone', 0xd8602a), bar = mat('barrier-bar', 0x2a2a2a), tape = new THREE.MeshStandardMaterial({ map: stripeTex(), roughness: 0.6, side: THREE.DoubleSide });
    for (const x of xs) { part(new THREE.ConeGeometry(0.16, 0.7, 12), cone, x, 0.35, 0); part(new THREE.CylinderGeometry(0.02, 0.02, 0.4, 6), bar, x, 0.85, 0); }
    const t = part(new THREE.PlaneGeometry(half * 2, 0.07), tape, 0, 1.0, 0); if (t.material.map) t.material.map.repeat.set(Math.max(1, Math.round(half * 4)), 1);
  }
  return G;
}
