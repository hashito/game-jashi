// 5.7.5: draw only what can be seen (the game was heavy: up to 600 draw calls a frame around the villa, the kit's phone budget is 100).
//   - the furniture and small things inside a building are drawn only in the room you are in and the rooms next to it (a door between);
//     walls, floors, ceilings, roofs, doors and the outside of the buildings always stay
//   - small things outdoors are not drawn far off in the fog: under 1.2 m beyond 40 m, under 4 m beyond 70 m (the fog hides them there)
//   - the trees (instanced), the ground, the big shapes, the figure and everything outside the world group are never touched
// A hidden mesh is moved to camera layer 1 (the camera and the shadow camera see layer 0), never set .visible = false: the game's own
// show / hide (stages.json "show", picked-up items) keeps working untouched.
// Then the meshes that never move or change are merged, per room and per material (walls, floors, ceilings, furniture): one draw call
// instead of dozens. Left out of the merge: anything under a named group (the game finds and moves those), door leaves, pickups and
// stations, anything hidden at the start, see-through materials, skinned meshes and userData.keep (the kit's moving parts).
// And the room lamps: every lit surface paid for all eight pendants at once (no shadows, so they also shone through the walls). Three real
// lights now stand at the lamps nearest to you (the room you are in and the ones next to it first) and fade across when you move; the other
// pendants still glow (their bulbs are emissive). It runs behind the title, before the kit compiles the shaders, so the light count never
// changes during play.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const HIDE = 1;
const ALWAYS = /^(wall|floor|ceil|door|station|stairs|hide|exit|roof|outer)[:_-]/i;

export function createCull(ctx) {
  const { world, camera } = ctx, plan = ctx.data.plan;
  const rooms = new Map(plan.rooms.map((r) => [r.id, r]));
  const indoor = (id) => { const r = rooms.get(id); return !!r && r.kind !== 'outdoor'; };
  // the rooms next to each room: through any door, opening or stairs of the plan
  const next = new Map(plan.rooms.map((r) => [r.id, new Set([r.id])]));
  for (const d of plan.doors || []) if (next.has(d.a) && next.has(d.b)) { next.get(d.a).add(d.b); next.get(d.b).add(d.a); }

  // the parts that are not ours to hide: door leaves (they move), anything named by the game for show / hide stays in, but its meshes
  // only hide with their room like the rest
  const skip = new Set();
  for (const d of world.doors.values()) if (d.look) d.look.traverse((o) => skip.add(o));

  const inRoom = new Map();   // room id -> [mesh]
  const outdoor = [];         // { mesh, x, z, far2 }
  const box = new THREE.Box3(), c = new THREE.Vector3(), s = new THREE.Vector3();
  world.group.updateMatrixWorld(true);
  world.group.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || skip.has(o) || ALWAYS.test(o.name || '')) return;
    if (o.material && (o.material.visible === false || (Array.isArray(o.material) && o.material.every((m) => m.visible === false)))) return;
    box.setFromObject(o); if (box.isEmpty()) return;
    box.getCenter(c); box.getSize(s);
    const size = Math.max(s.x, s.y, s.z);
    if (size > 6) return;   // a building, a roof, the ground
    const rid = world.roomAt(c.x, c.z, c.y);
    if (rid && indoor(rid)) {
      // only what stands inside the room: a mesh that reaches through its walls (the outside boards) stays
      const r = rooms.get(rid), m = 0.12;
      if (r.w != null && (box.min.x < r.x - m || box.max.x > r.x + r.w + m || box.min.z < r.z - m || box.max.z > r.z + r.d + m)) return;
      if (!inRoom.has(rid)) inRoom.set(rid, []);
      inRoom.get(rid).push(o);
    } else if (size < 4) {
      const far = size < 1.2 ? 40 : 70;
      outdoor.push({ mesh: o, x: c.x, z: c.z, far2: far * far });
    }
  });

  // ---- the merge -------------------------------------------------------------------------------------------------------------------
  // groups the kit and the mountain build once and never touch again (the stairs, a gable, the furniture of a room, the balcony, the
  // timber stacks); every other named group is the game's to move or show
  const SAFE = new Set(['', 'world', 'mountain']), STILL = /^(stair|wall|interior|balcony|timber)([:_-]|$)/;
  const keepOut = new Set();
  for (const o of world.interactables || []) o.traverse((x) => keepOut.add(x));
  const movable = (o) => {
    if (keepOut.has(o) || skip.has(o) || o.isSkinnedMesh || o.morphTargetInfluences || o.userData.keep) return true;
    const ms = Array.isArray(o.material) ? o.material : [o.material]; if (!ms.length || ms.some((m) => !m || m.transparent || m.visible === false)) return true;
    if (Array.isArray(o.material) && !(o.geometry.groups && o.geometry.groups.length)) return true;
    if (o.name && !/^(wall|floor|ceil|lampshade|lampbulb|lampcord|stair|gable|interior|timber|balcony)([:_-]|$)/.test(o.name)) return true;   // a mesh the game named is its own to show or move
    for (let p = o.parent; p && p !== world.group; p = p.parent) if (!(SAFE.has(p.name || '') || STILL.test(p.name)) || !p.visible || p.userData.keep) return true;
    return !o.visible;
  };
  const KEEP = ['position', 'normal', 'uv', 'color'];   // color: the kit's props shade their corners with vertex colours (the material's vertexColors)
  const sig = (g) => Object.keys(g.attributes).filter((k) => KEEP.includes(k)).sort().map((k) => k + g.attributes[k].itemSize).join(',');
  const toLocal = new THREE.Matrix4().copy(world.group.matrixWorld).invert();
  const buckets = new Map();
  // two materials that look the same are the same (the kit makes one per wall): a key of what the shader draws
  // a world-space (triplanar) wall material reads the map by world position: same texture, same look, whatever its UV settings
  const tri = (m) => m.customProgramCacheKey !== THREE.Material.prototype.customProgramCacheKey && /^triplanar/.test(m.customProgramCacheKey());
  // a material whose only texture is its map: the map's repeat / offset is written into the UVs of the merged faces, so floors of one
  // texture and different sizes become one material (bakeable); any other texture keeps its own material
  const bakeable = (m) => !tri(m) && m.map && !(m.userData && Object.keys(m.userData).length) && !m.normalMap && !m.roughnessMap && !m.metalnessMap && !m.aoMap && !m.emissiveMap && !m.bumpMap && !m.alphaMap && !m.lightMap;
  const look = (m) => [m.type, m.name, tri(m) ? 'tri:' + m.customProgramCacheKey() + ':' + (m.map && m.map.source.uuid) : '', m.color && m.color.getHexString(), m.emissive && m.emissive.getHexString(), m.emissiveIntensity, m.roughness, m.metalness,
    bakeable(m) ? 'img:' + m.map.source.uuid + ':' + m.map.wrapS + ':' + m.map.wrapT + ':' + m.map.magFilter + ':' + m.map.colorSpace : !tri(m) && m.map && m.map.uuid, m.normalMap && m.normalMap.uuid, m.roughnessMap && m.roughnessMap.uuid, m.aoMap && m.aoMap.uuid, m.emissiveMap && m.emissiveMap.uuid,
    m.side, m.flatShading, m.vertexColors, m.opacity, m.alphaTest, m.fog, m.depthWrite, m.polygonOffset, m.toneMapped,
    !tri(m) && m.onBeforeCompile && m.onBeforeCompile.toString() !== THREE.Material.prototype.onBeforeCompile.toString() ? m.uuid : '',
    m.userData && Object.keys(m.userData).length ? m.uuid : ''].join('|');
  const bucketOf = new Map();
  for (const [rid, list] of inRoom) for (const o of list) bucketOf.set(o, rid);
  // an item is one material's part of a mesh: a whole mesh, or the faces of one material of a mesh that has several (an outer wall is
  // a box with six faces, five of the room's plaster and one of the weathered boards: six draw calls each, two kinds of material)
  const CELL = 24;
  const parts = new Map();   // mesh -> number of its items not merged yet
  world.group.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || movable(o)) return;
    let rid = bucketOf.get(o);
    const far = outdoor.find((x) => x.mesh === o);
    if (far) rid = 'far:' + Math.floor(far.x / CELL) + ',' + Math.floor(far.z / CELL);
    if (!rid) { box.setFromObject(o); if (box.isEmpty()) return; box.getCenter(c); rid = 'always:' + (world.roomAt(c.x, c.z, c.y) || 'out'); }
    const items = [];
    if (!Array.isArray(o.material)) items.push({ o, mat: o.material, ranges: null });
    else {
      const byMat = new Map();
      for (const gr of o.geometry.groups) { const mat = o.material[gr.materialIndex]; if (!mat) continue; const k = look(mat); if (!byMat.has(k)) byMat.set(k, { o, mat, ranges: [] }); byMat.get(k).ranges.push([gr.start, gr.count]); }
      items.push(...byMat.values());
    }
    parts.set(o, items.length);
    for (const it of items) {
      const key = rid + '|' + look(it.mat) + '|' + (o.castShadow ? 1 : 0) + (o.receiveShadow ? 1 : 0);
      if (!buckets.has(key)) buckets.set(key, { rid, list: [] });
      buckets.get(key).list.push(it);
    }
  });
  let merged = 0, removed = 0;
  const done = new Set();
  for (const { rid, list } of buckets.values()) {
    if (list.length < 2 && !list[0].ranges) continue;   // one whole mesh alone: nothing to gain
    const geos = [], mat0 = list[0].mat, items0 = new Map(list.map((it, i) => [i, it]));
    for (const { o, ranges } of list) {
      const g = o.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(toLocal, o.matrixWorld));
      for (const k of Object.keys(g.attributes)) if (!KEEP.includes(k) || (k === 'color' && !mat0.vertexColors)) g.deleteAttribute(k);
      if (mat0.vertexColors && !g.attributes.color) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
      if (!g.attributes.normal) g.computeVertexNormals();
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      if (!g.index) g.setIndex([...Array(g.attributes.position.count).keys()]);
      if (bakeable(mat0)) { const mat = items0.get(geos.length).mat; mat.map.updateMatrix(); const uv = g.attributes.uv, v2 = new THREE.Vector2(); for (let i = 0; i < uv.count; i++) { v2.fromBufferAttribute(uv, i).applyMatrix3(mat.map.matrix); uv.setXY(i, v2.x, v2.y); } }
      if (ranges) { const src = g.index.array, idx = []; for (const [st, n] of ranges) for (let i = st; i < Math.min(st + n, src.length); i++) idx.push(src[i]); g.setIndex(idx); }
      g.clearGroups(); g.morphAttributes = {};
      geos.push(g);
    }
    let geo = null;
    if (new Set(geos.map(sig)).size === 1) { try { geo = mergeGeometries(geos, false); } catch (e) { geo = null; } }
    for (const g of geos) g.dispose();
    if (!geo) continue;
    let mat = mat0;
    if (bakeable(mat0)) { mat = mat0.clone(); mat.map = mat0.map.clone(); mat.map.repeat.set(1, 1); mat.map.offset.set(0, 0); mat.map.rotation = 0; mat.map.center.set(0, 0); mat.map.matrixAutoUpdate = true; mat.map.needsUpdate = false; }
    const o0 = list[0].o, m = new THREE.Mesh(geo, mat); m.name = 'merged:' + rid; m.castShadow = o0.castShadow; m.receiveShadow = o0.receiveShadow; m.matrixAutoUpdate = false;
    world.group.add(m); merged++;
    for (const { o } of list) parts.set(o, parts.get(o) - 1);
    if (inRoom.has(rid)) inRoom.get(rid).push(m);
    if (rid.startsWith('far:')) { geo.computeBoundingBox(); const ctr = geo.boundingBox.getCenter(new THREE.Vector3()).applyMatrix4(world.group.matrixWorld); const rs = geo.boundingBox.getSize(new THREE.Vector3()).length() / 2; let f2 = 0; for (const { o } of list) { const x = outdoor.find((e) => e.mesh === o); if (x) f2 = Math.max(f2, x.far2); } const fr = Math.sqrt(f2) + rs; outdoor.push({ mesh: m, x: ctr.x, z: ctr.z, far2: fr * fr }); }
    for (const { o } of list) done.add(o);
  }
  // a mesh is hidden only when every one of its parts went into a merged mesh (else it stays as it was, and its merged parts draw the
  // same faces twice, which shows nothing)
  const gone = new Set();
  for (const o of done) if (parts.get(o) === 0) { o.visible = false; o.matrixAutoUpdate = false; gone.add(o); removed++; }   // still and hidden: no matrix work each frame either
  for (const [rid, L] of inRoom) inRoom.set(rid, L.filter((x) => !gone.has(x)));
  for (let i = outdoor.length - 1; i >= 0; i--) if (gone.has(outdoor[i].mesh)) outdoor.splice(i, 1);

  // ---- the moon's shadow: under a roof the furniture's shadow fell inside the roof's own shadow, so the shadow pass drew it for nothing
  // (rooms with a ceiling only; the walls and the roofs keep theirs). castShadow changes no shader, nothing recompiles.
  let noCast = 0;
  const roofed = new Set(); world.group.traverse((o) => { if (o.isMesh && /^ceil:/.test(o.name)) roofed.add(o.name.split(':')[1]); });
  for (const [rid, list] of inRoom) if (roofed.has(rid)) for (const m of list) if (m.castShadow) { m.castShadow = false; noCast++; }

  // ---- the lamps ------------------------------------------------------------------------------------------------------------------
  const POOL = 3;
  const lamps = [];
  const v = new THREE.Vector3();
  world.group.traverse((o) => { if (o.isPointLight && /^lamp:/.test(o.name) && !/TOWER/.test(o.name) && o.visible && o.intensity > 0) lamps.push(o); });
  const lampData = lamps.map((l) => (l.getWorldPosition(v), { room: l.name.slice(5), pos: v.clone(), color: l.color.clone(), i: l.intensity, d: l.distance, decay: l.decay }));
  const pool = [];
  if (lamps.length > POOL) {
    for (const l of lamps) l.parent.remove(l);
    for (let k = 0; k < POOL; k++) { const l = new THREE.PointLight(0xffffff, 0, 1, 1.6); l.name = 'lamp-pool'; l.userData = { lamp: -1, want: -1 }; ctx.scene.add(l); pool.push(l); }
  }
  let lampT = 0;
  function lampsUpdate(dt, now) {
    if (!pool.length) return;
    if (now || (lampT -= dt) <= 0) {
      lampT = 0.3;
      const p = camera.position, near = shownRooms || new Set();
      const want = lampData.map((L, i) => [i, L.pos.distanceToSquared(p) * (near.has(L.room) ? 1 : 25)]).sort((a, b) => a[1] - b[1]).slice(0, POOL).map((x) => x[0]);
      const free = pool.filter((l) => !want.includes(l.userData.want));
      for (const w of want) if (!pool.some((l) => l.userData.want === w)) { const l = free.shift(); if (l) l.userData.want = w; }
    }
    for (const l of pool) {
      const u = l.userData;
      if (u.want !== u.lamp) {
        l.intensity = now ? 0 : Math.max(0, l.intensity - dt * 40);
        if (l.intensity > 0.05) continue;
        u.lamp = u.want; const L = lampData[u.lamp]; if (!L) continue;
        l.position.copy(L.pos); l.color.copy(L.color); l.distance = L.d; l.decay = L.decay;
      }
      const L = lampData[u.lamp]; if (L) l.intensity = now ? L.i : Math.min(L.i, l.intensity + dt * 40);
    }
  }

  const setShown = (mesh, on) => { if (on) mesh.layers.enable(0), mesh.layers.disable(HIDE); else mesh.layers.set(HIDE); };
  let shownRooms = null, lastRoom = '', t = 0;
  const stats = { indoorMeshes: 0, outdoorMeshes: outdoor.length, hidden: 0, merged, mergedFrom: removed, lamps: lamps.length, noCast, lampLights: pool.length || lamps.length };
  for (const list of inRoom.values()) stats.indoorMeshes += list.length;

  function rooms_(id) {
    const out = new Set(next.get(id) || [id]);
    // standing outside: the buildings whose door opens onto this ground, and their rooms next to the door
    return out;
  }
  function applyRooms(id) {
    const want = rooms_(id);
    for (const [rid, list] of inRoom) {
      const on = want.has(rid) || !roofed.has(rid);   // 5.8: an open-air room (the balcony) is seen from outside: it was culled to its frame
      if (shownRooms && shownRooms.has(rid) === on) continue;
      for (const m of list) setShown(m, on);
    }
    shownRooms = want;
  }
  function applyFar() {
    const p = camera.position; let hidden = 0;
    for (const o of outdoor) {
      const on = (o.x - p.x) ** 2 + (o.z - p.z) ** 2 < o.far2;
      if (on !== o.on) { setShown(o.mesh, on); o.on = on; }
      if (!on) hidden++;
    }
    stats.hidden = hidden;
  }

  return {
    stats,
    update(dt) {
      const id = ctx.state.room;
      const moved = id && id !== lastRoom && rooms.has(id);
      if (moved) { lastRoom = id; applyRooms(id); }
      lampsUpdate(dt, moved && !pool.some((l) => l.userData.lamp >= 0));
      if ((t -= dt) <= 0) { t = 0.25; applyFar(); }
    },
    // everything back on (a scripted scene that moves the camera far, e.g. the telescope view)
    all() { for (const list of inRoom.values()) for (const m of list) setShown(m, true); for (const o of outdoor) { setShown(o.mesh, true); o.on = true; } shownRooms = null; lastRoom = ''; },
  };
}
