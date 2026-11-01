/* game-kit 6e0b6f0: js/outer-walls.js — edit in game-kit and run tools/kit-sync.js */
// Outside faces of house walls (standard 1.8.1, hasshaku feedback 2026-11-01 "家の壁がテクスチャが有効ではありません"): world-from-plan gives
// every wall of an indoor room the room's `wallTex` on all six faces, so from the yard a house shows its inside plaster - flat and pale.
// This puts an outside material (charred cedar boards, weathered planks, mortar ...) on the face of each wall that looks out onto an outdoor
// room or onto nothing, and leaves the inside face (and walls between two indoor rooms) as they are.
//
//   import { dressOuterWalls } from './kit/outer-walls.js';
//   // after the recipes have put the room textures on (they load asynchronously): e.g. in a boot step, before the shaders are pre-compiled
//   const outM = tex.material('wall_yakisugi', { triplanar: 1 });
//   dressOuterWalls(ctx, outM, { per: (room) => (room.id === 'KURA' ? kuraM : null) });   // per: a room's own outside material (null = outM)
//
// Walls are the world's meshes named wall:<room>:<edge> (BoxGeometry; groups +x 0, -x 1, +y 2, -y 3, +z 4, -z 5). Returns the number dressed.
// Pure part: outsideFace(edge) / looksOut(room, edge, mid, roomAt), tested in test/outer-walls.test.mjs.
export const FACE = { e: 0, w: 1, s: 4, n: 5 };
const OUT = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] };
export const outsideFace = (edge) => FACE[edge] ?? -1;
// does the wall of `room` on `edge` (its middle at mid = [x, z]) look out onto an outdoor room or nothing? roomAt(x, z) -> room | null
export function looksOut(room, edge, mid, roomAt, probe = 0.4) {
  if (!room || room.kind === "outdoor" || !(edge in FACE)) return false;
  const o = roomAt(mid[0] + OUT[edge][0] * probe, mid[1] + OUT[edge][1] * probe);
  return !o || o.kind === "outdoor";
}

export function dressOuterWalls(ctx, outMaterial, o = {}) {
  const rooms = new Map(((ctx.data && ctx.data.plan && ctx.data.plan.rooms) || []).map((r) => [r.id, r]));
  const byId = (id) => rooms.get(id) || null;
  const roomAt = o.roomAt || ((x, z) => { const id = ctx.world.roomAt(x, z, 1); return id ? byId(id) : null; });
  let n = 0;
  ctx.world.group.traverse((m) => {
    if (!m.isMesh || !/^wall:/.test(m.name) || m.userData.outerDone) return;
    if (m.material && m.material.visible === false) return;
    const [, rid, edge] = m.name.split(":"), r = byId(rid);
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    const bb = m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld);
    const mid = [(bb.min.x + bb.max.x) / 2, (bb.min.z + bb.max.z) / 2];
    if (!looksOut(r, edge, mid, roomAt)) return;
    const outM = (o.per && o.per(r)) || outMaterial; if (!outM) return;
    const inM = Array.isArray(m.material) ? m.material[0] : m.material;
    const mats = [inM, inM, inM, inM, inM, inM]; mats[FACE[edge]] = outM;
    m.material = mats; m.userData.outerDone = true; n++;
  });
  return n;
}
