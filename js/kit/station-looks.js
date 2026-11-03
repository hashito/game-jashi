/* game-kit 4b9f6fa: js/station-looks.js — edit in game-kit and run tools/kit-sync.js */
// Work places that look like the thing itself (standard 1.10.15, deguchi kit-feedback K10): plan.stations[i].look turns the green console box
// into an object, and .mount says where it stands. The box stays as the invisible [E] target.
//   mount 'top'    on the furniture under it (a desk / table top at 0.72 m)
//   mount 'wall'   fixed to the nearest wall of the room, at about 1.3 m
//   mount 'floor'  standing on the floor, its back to the nearest wall (its collider follows it)
//   look  plan | phone | monitors | terminal | deck | selector | console | valves | alarm | cord | power | seal | wallphone | secphone |
//         pinbox | latch | shutterbox (anything else: a plain grey box)
import * as THREE from 'three';
import { nearestWallYaw } from './hide-looks.js';

export const STATION_LOOKS = ['plan', 'phone', 'monitors', 'terminal', 'deck', 'selector', 'console', 'valves', 'alarm', 'cord', 'power', 'seal', 'wallphone', 'secphone', 'pinbox', 'latch', 'shutterbox'];
const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.8, ...o });

/** the model of one look (its front faces +z, its foot at y 0; a wall look is centred on y 0) */
export function stationModel(kind) {
  const g = new THREE.Group();
  const b = (w, h, d, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
  const grey = std({ color: 0x8c8f8c, roughness: 0.6, metalness: 0.2 }), dark = std({ color: 0x2c2f31, roughness: 0.55 }), cream = std({ color: 0xcfc8b4, roughness: 0.7 });
  const lamp = (c, x, y, z) => { const o = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), new THREE.MeshBasicMaterial({ color: c })); o.position.set(x, y, z); g.add(o); };
  const screen = (w, h, x, y, z, c = 0x2f4a3a) => { const o = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: c })); o.position.set(x, y, z); g.add(o); };
  switch (kind) {
    case 'plan': { const sh = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.6), std({ color: 0xe6e2d6, roughness: 0.95 })); sh.rotation.x = -Math.PI / 2; sh.rotation.z = 0.08; sh.position.y = 0.004; g.add(sh); b(0.2, 0.03, 0.08, std({ color: 0xc9a227 }), 0.32, 0.015, 0.18); break; }
    case 'phone': b(0.24, 0.07, 0.2, cream, 0, 0.035, 0); b(0.2, 0.05, 0.06, cream, 0, 0.09, -0.04); break;
    case 'monitors': for (const x of [-0.42, 0, 0.42]) { b(0.38, 0.3, 0.3, cream, x, 0.17, 0); screen(0.3, 0.22, x, 0.18, 0.151, x === 0 ? 0x3d5a46 : 0x24382c); } break;
    case 'terminal': b(0.42, 0.34, 0.34, cream, 0, 0.19, 0); screen(0.32, 0.24, 0, 0.21, 0.171, 0x2d4c5a); b(0.42, 0.03, 0.16, cream, 0, 0.015, 0.28); break;
    case 'deck': b(0.46, 0.14, 0.32, dark, 0, 0.07, 0); b(0.16, 0.02, 0.1, std({ color: 0x111111 }), -0.08, 0.145, 0); lamp(0xc03020, 0.16, 0.1, 0.161); break;
    case 'selector': b(0.7, 0.42, 0.32, grey, 0, 0.21, 0); for (let i = 0; i < 6; i++) lamp([0x3060d0, 0xe8e8e0, 0xe08a30][i % 3], -0.25 + i * 0.1, 0.26, 0.161); break;
    case 'console': { b(1.3, 0.76, 0.6, grey, 0, 0.38, 0); const top = b(1.3, 0.04, 0.5, dark, 0, 0.8, 0.02); top.rotation.x = -0.35; for (let i = 0; i < 5; i++) lamp(i === 4 ? 0x40c070 : 0xd0a030, -0.4 + i * 0.2, 0.86, 0.05); b(0.03, 0.3, 0.03, dark, 0.45, 0.95, -0.1); break; }
    case 'valves': {
      const red = std({ color: 0xb03a2e, roughness: 0.5 }), blue = std({ color: 0x2e5fb0, roughness: 0.5 }), pipe = std({ color: 0x6b6f70, metalness: 0.5, roughness: 0.45 });
      for (const [x, m] of [[-0.35, red], [0.35, blue]]) { const pp = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.0, 12), pipe); pp.position.set(x, 1.5, -0.12); g.add(pp); const w = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.022, 8, 20), m); w.position.set(x, 1.15, 0.02); g.add(w); }
      b(0.3, 0.4, 0.22, grey, 0, 0.7, -0.05); const crank = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.015, 6, 16), grey); crank.position.set(0, 0.75, 0.08); g.add(crank);
      break;
    }
    case 'alarm': b(0.6, 0.8, 0.12, cream, 0, 0, 0); lamp(0xd02818, -0.18, 0.25, 0.07); lamp(0xd02818, 0, 0.25, 0.07); lamp(0x30a050, 0.18, 0.25, 0.07); screen(0.4, 0.16, 0, 0.02, 0.061, 0x3a1a14); break;
    case 'cord': { b(0.12, 0.2, 0.06, grey, 0, 0.3, 0); const c = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 1.0, 5), std({ color: 0xd8d0b0 })); c.position.set(0, -0.25, 0.03); g.add(c); break; }
    case 'power': b(0.7, 0.9, 0.16, grey, 0, 0, 0); b(0.7, 0.06, 0.17, std({ color: 0xe08a30 }), 0, 0.36, 0); for (let i = 0; i < 4; i++) b(0.06, 0.12, 0.05, dark, -0.24 + i * 0.16, 0.02, 0.09); break;
    case 'seal': b(0.6, 0.8, 0.16, grey, 0, 0, 0); b(0.6, 0.05, 0.17, std({ color: 0x3060d0 }), 0, 0.32, 0); lamp(0xd03020, 0.2, -0.2, 0.09); b(0.08, 0.14, 0.04, std({ color: 0xc02a20 }), -0.15, -0.2, 0.09); break;
    case 'wallphone': b(0.22, 0.32, 0.1, std({ color: 0x3a3c3a, roughness: 0.6 }), 0, 0, 0); b(0.06, 0.24, 0.06, dark, -0.06, 0.0, 0.07); break;
    case 'secphone': b(0.26, 0.36, 0.1, cream, 0, 0, 0); b(0.07, 0.26, 0.07, cream, -0.07, 0.0, 0.08); for (let i = 0; i < 3; i++) lamp(0x30a050, 0.07, 0.1 - i * 0.06, 0.06); break;
    case 'pinbox': b(0.28, 0.36, 0.12, std({ color: 0xc9a227, roughness: 0.6 }), 0, 0, 0); b(0.04, 0.12, 0.04, std({ color: 0xc02a20 }), 0, -0.06, 0.08); break;
    case 'latch': b(0.2, 0.5, 0.1, grey, 0, 0, 0); b(0.06, 0.2, 0.08, std({ color: 0xc02a20 }), 0, 0.08, 0.07); break;
    case 'shutterbox': b(0.5, 0.7, 0.14, grey, 0, 0, 0); lamp(0x30a050, -0.1, 0.2, 0.08); lamp(0xd0a030, 0.1, 0.2, 0.08); b(0.08, 0.08, 0.04, std({ color: 0x2a6a3a }), 0, 0.02, 0.08); b(0.08, 0.08, 0.04, std({ color: 0x8a2a20 }), 0, -0.14, 0.08); break;
    default: b(0.5, 0.5, 0.3, grey, 0, 0.25, 0);
  }
  return g;
}

/** dress one station: s = the plan entry, room = its plan room, box = the console mesh (already placed), col = its collider, y0 = the floor's y.
 *  Returns the model (added to `group`), or null when s.look is not set. */
export function dressStation(s, room, box, col, group, y0 = 0) {
  if (!s.look || !room || !box) return null;
  const mount = s.mount || 'top', m = stationModel(s.look), w = nearestWallYaw(room, s.x ?? box.position.x, s.z ?? box.position.z);
  box.material = new THREE.MeshBasicMaterial({ visible: false });
  if (col && mount !== 'floor') col.off = true;
  let x = box.position.x, z = box.position.z, y = 0;
  m.rotation.y = w.yaw;
  if (mount === 'top') { y = 0.72; box.position.y = y0 + 0.72 + 0.25; box.scale.set(0.8, 0.5, 0.8); }
  else {
    const off = mount === 'wall' ? 0.1 : s.look === 'valves' ? 0.2 : 0.38;
    if (w.side === 'w') x = room.x + off; if (w.side === 'e') x = room.x + room.w - off; if (w.side === 'n') z = room.z + off; if (w.side === 's') z = room.z + room.d - off;
    y = mount === 'wall' ? (s.look === 'cord' ? 1.2 : 1.3) : 0;
    box.position.set(x, y0 + (mount === 'wall' ? 1.3 : 0.55), z);
    if (mount === 'wall') box.scale.set(0.8, 0.8, 0.8);
  }
  m.position.set(x, y0 + y, z); m.name = `stlook:${s.id}`; group.add(m);
  if (mount === 'floor' && col) { box.rotation.y = w.yaw; box.updateMatrixWorld(true); col.box.setFromObject(box); }   // the collider follows the console to the wall
  return m;
}
