/* game-kit dc6b159: js/interior-finish.js — edit in game-kit and run tools/kit-sync.js */
// One look for the inside of old Japanese buildings (standard 1.8), on top of what world-from-plan builds:
//   - tatami laid as mats (1.8 x 0.9 m, staggered rows) with the dark cloth border (heri) on the long sides, over the weave texture
//   - a board ceiling instead of the flat white one (the pendant no longer burns a white spot into it), softer pendants
//   - trim along every wall: the kamoi beam at the door height, a skirting board, a ceiling rim; a post in each corner
//   - the kit's lintels (the wall above a door) in the wall's own texture
//   - woody(obj): the props' grey steel (shelves, table legs: office furniture) turned to dark wood, so a room keeps one palette
// Usage (after world-from-plan and the textures recipe):
//   import { finishInterior } from '../kit/interior-finish.js';
//   const fin = finishInterior({ world, plan, tex: texReadyPromiseOrLibrary }, { rooms: ['IMA', 'ZASHIKI'] });
//   const shelf = fin.woody(P.shelf({}, 1.6, 1.8, 0.4, 3, 'boxes'));
// Options: rooms (ids, default every room that is not outdoor), trim (true), posts (true), ceiling (texture id or null: keep),
// ceilTint (0x8a7a68), lamp (factor on the pendants, 0.6), lintelTex (texture id, default the room's wallTex), seed.
import * as THREE from 'three';

const rng = (seed) => { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };

/** a transparent canvas with the borders of tatami mats laid over a w x d metre floor (staggered rows, mats ageing a little apart) */
export function tatamiBorders(w, d, seed = 7) {
  const P = 128, c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w * P)); c.height = Math.max(1, Math.round(d * P));
  const g = c.getContext('2d'), mw = 1.8, md = 0.9, r = rng(seed);
  for (let j = 0, z = 0; z < d; j++, z += md) for (let x = j % 2 ? -mw / 2 : 0; x < w; x += mw) {
    g.fillStyle = `rgba(${r() < 0.5 ? '40,30,10' : '255,240,200'},${(0.03 + r() * 0.05).toFixed(3)})`; g.fillRect(x * P, z * P, mw * P, md * P);
    g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(x * P - 1, z * P, 2, md * P);   // the short ends butt together
    g.fillStyle = '#26241d'; g.fillRect(x * P, z * P, mw * P, 0.035 * P); g.fillRect(x * P, (z + md) * P - 0.035 * P, mw * P, 0.035 * P);   // heri
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

export function finishInterior({ world, plan, tex }, o = {}) {
  const K = { trim: true, posts: true, ceiling: 'wood_cedar_old', ceilTint: 0x8a7a68, lamp: 0.6, seed: 7, ...o };
  const G = new THREE.Group(); G.name = 'interior-finish'; world.group.add(G);
  const rooms = (plan.rooms || []).filter((r) => r.kind !== 'outdoor' && (!K.rooms || K.rooms.includes(r.id)));
  const texP = Promise.resolve(tex).catch(() => null);
  const beam = new THREE.MeshStandardMaterial({ color: 0x2c231b, roughness: 0.9 }), post = new THREE.MeshStandardMaterial({ color: 0x33281f, roughness: 0.9 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x33281f, roughness: 0.85 });
  const box = (w, h, d, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.receiveShadow = true; G.add(b); return b; };
  const T = world.wallT || 0.16, ceilH = (r) => (r.h || world.wallH || 3);
  for (const r of rooms) {
    const y0 = r.y || 0, cx = r.x + r.w / 2, cz = r.z + r.d / 2, H = ceilH(r);
    const lamp = world.group.getObjectByName(`lamp:${r.id}`); if (lamp) lamp.intensity *= K.lamp;
    if (/tatami/.test(r.floorTex || '')) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(r.w, r.d), new THREE.MeshStandardMaterial({ map: tatamiBorders(r.w, r.d, K.seed + r.w * 7 + r.d), transparent: true, depthWrite: false, roughness: 0.95 }));
      p.rotation.x = -Math.PI / 2; p.position.set(cx, y0 + 0.006, cz); p.receiveShadow = true; G.add(p);
    }
    if (K.trim) for (const [x0, z0, x1, z1, nx, nz] of [[r.x, r.z, r.x + r.w, r.z, 0, 1], [r.x, r.z + r.d, r.x + r.w, r.z + r.d, 0, -1], [r.x, r.z, r.x, r.z + r.d, 1, 0], [r.x + r.w, r.z, r.x + r.w, r.z + r.d, -1, 0]]) {
      const along = x1 - x0 > 0, len = along ? x1 - x0 : z1 - z0;
      for (const [y, h, t] of [[2.27, 0.1, 0.07], [0.05, 0.1, 0.03], [H - 0.03, 0.06, 0.05]]) { const off = T / 2 + t / 2; box(along ? len : t, h, along ? t : len, beam, (x0 + x1) / 2 + nx * off, y0 + y, (z0 + z1) / 2 + nz * off); }
    }
    if (K.posts) for (const [x, z] of [[r.x + 0.15, r.z + 0.15], [r.x + r.w - 0.15, r.z + 0.15], [r.x + 0.15, r.z + r.d - 0.15], [r.x + r.w - 0.15, r.z + r.d - 0.15]]) box(0.14, H, 0.14, post, x, y0 + H / 2, z);
  }
  const ready = texP.then((lib) => {
    if (!lib) return;
    const has = (id) => { try { return !!lib.entry(id); } catch { return false; } };
    if (has('wood_dark')) { const m = lib.material('wood_dark', { triplanar: 0.8 }); wood.map = m.map; wood.color.set(0x8a7560); wood.needsUpdate = true; }
    if (K.ceiling && has(K.ceiling)) { const m = lib.material(K.ceiling, { triplanar: 1.2 }); m.color.set(K.ceilTint); for (const r of rooms) for (const c of world.group.children) if (c.name === `ceil:${r.id}` || c.name === `ceil:${r.id}:part`) c.material = m; }   // :part = the ceiling round a stair opening (1.10)
    // lintels: the thin unnamed boxes world-from-plan puts above the doors, inside one of these rooms' walls
    const inRoom = (x, z) => rooms.find((r) => x > r.x - 0.2 && x < r.x + r.w + 0.2 && z > r.z - 0.2 && z < r.z + r.d + 0.2);
    world.group.traverse((m) => {
      const p = m.geometry && m.geometry.parameters;
      if (!m.isMesh || m.name || !p || !(p.height < 1) || m.position.y < 2 || m.position.y > 3.2 || !(Math.abs(p.width - T) < 0.01 || Math.abs(p.depth - T) < 0.01)) return;
      const r = inRoom(m.position.x, m.position.z), id = r && (K.lintelTex || r.wallTex);
      if (id && has(id)) m.material = lib.material(id, { triplanar: true });
    });
  });
  const hsl = {};
  /** turn the grey (steel) parts of a prop to dark wood; returns the object */
  const woody = (obj) => { obj.traverse((m) => { if (m.isMesh && m.material && m.material.color && m.material.color.getHSL(hsl).s < 0.15) m.material = wood; }); return obj; };
  return { group: G, rooms, woody, wood, ready };
}
