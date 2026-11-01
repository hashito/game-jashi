/* game-kit 6e0b6f0: js/room-types.js — edit in game-kit and run tools/kit-sync.js */
// Room types (standard 1.7, "置くだけ"): a plan room with `type` gets a floor and wall texture and a few pieces of furniture against
// its walls, so a plan of rooms and doors is already a believable place. Everything can be overridden in plan.json:
//   { "id": "R1", "type": "washitsu", ... }                    -> tatami + clay walls + a low chest against a free wall
//   { "id": "R1", "type": "washitsu", "floorTex": "tatami_weave_old", "furnish": false }   -> your texture, no furniture
//   plan.furniture[] entries for the room are kept and placed first (the automatic ones avoid them and the doors).
// Pure (no THREE): ROOM_TYPES, roomLook(room), autoFurniture(plan), typeTextures(plan). Used by recipes.js (textures, props),
// world-from-plan.js (outdoor edge look) and tools/kit-sync.js (which textures to copy). docs/standard-3d.md "置くだけ".

// furniture: [kind (recipes-data PROP_KINDS), width along the wall, depth, args / opts]
export const ROOM_TYPES = {
  washitsu: { label: '和室', floor: 'tatami_weave', wall: 'clay_wall', furniture: [['shelf', 1.6, 0.4, { args: [1.6, 0.9, 0.4, 3, 'boxes'] }]] },
  kitchen: { label: '台所', floor: 'planks_dark', wall: 'plaster_yellowed', furniture: [['fridge', 0.7, 0.7], ['shelf', 1.4, 0.4, { args: [1.4, 1.8, 0.4, 5, 'boxes'] }], ['table', 1.2, 0.7, { args: [1.2, 0.7, 0.86, 0x6a5038] }]] },
  storage: { label: '物置・納戸', floor: 'planks_worn', wall: 'clay_wall', furniture: [['shelf', 1.8, 0.45, { args: [1.8, 2.0, 0.45, 7, 'boxes'] }], ['cardboardBox', 0.5, 0.4], ['crate', 0.6, 0.6, { opts: { w: 0.6 } }]] },
  office: { label: '事務室', floor: 'linoleum_grey', wall: 'plaster_white', furniture: [['desk', 1.4, 0.7], ['filingCabinet', 0.5, 0.6], ['locker', 0.6, 0.5], ['shelf', 1.8, 0.45]] },
  shop: { label: '店', floor: 'planks_grey_old', wall: 'panel_wood_wall', furniture: [['shelf', 2.4, 0.45, { args: [2.4, 1.9, 0.45, 11, 'boxes'] }], ['shelf', 2.4, 0.45, { args: [2.4, 1.9, 0.45, 12, 'boxes'] }], ['counter', 2.4, 0.6, { args: [2.4] }]] },
  classroom: { label: '教室', floor: 'planks_oak', wall: 'paint_mint', furniture: [['shelf', 1.8, 0.45], ['locker', 0.6, 0.5]] },
  hospital: { label: '病室・診察室', floor: 'linoleum_cream', wall: 'paint_peeling_green', furniture: [['shelf', 1.2, 0.45], ['locker', 0.6, 0.5]] },
  bathroom: { label: '洗面・便所', floor: 'tile_bathroom_white', wall: 'tile_kitchen_beige', furniture: [] },
  workshop: { label: '作業場・機械室', floor: 'concrete_floor_worn', wall: 'concrete_stained', furniture: [['steelDesk', 1.4, 0.7], ['shelf', 1.8, 0.45], ['drum', 0.6, 0.6]] },
  corridor: { label: '廊下', floor: 'vinyl_beige', wall: 'plaster_white', furniture: [] },
  engawa: { label: '中廊下・縁側', floor: 'engawa_boards', wall: 'clay_wall', furniture: [] },
  doma: { label: '土間', floor: 'dirt_floor', wall: 'clay_wall', furniture: [] },
  // outdoor: ground and the look of the edges (world-from-plan dressEdges)
  road: { label: '道', floor: 'gravel', edge: 'trees', outdoor: true },
  yard: { label: '庭', floor: 'soil', edge: 'hedge', outdoor: true },
  field: { label: '畑・田', floor: 'mud', edge: 'hedge', outdoor: true },
  forest: { label: '林', floor: 'leaves_ground', edge: 'trees', outdoor: true },
  grounds: { label: '境内・敷地', floor: 'moss', edge: 'stone', outdoor: true },
  street: { label: '舗装の道', floor: 'asphalt', edge: 'fence', outdoor: true },
};

// the floor / wall texture and the outdoor edge look a room ends up with (the plan's own values win)
export function roomLook(room) {
  const t = ROOM_TYPES[room.type] || null;
  return { floorTex: room.floorTex || (t && t.floor) || null, wallTex: room.wallTex || (t && !t.outdoor && t.wall) || null, edge: room.edge || (t && t.edge) || null };
}

// every texture id the plan's room types need (kit-sync copies them)
export function typeTextures(plan) {
  const ids = new Set();
  for (const r of (plan && plan.rooms) || []) { const l = roomLook(r); if (l.floorTex) ids.add(l.floorTex); if (l.wallTex) ids.add(l.wallTex); }
  return [...ids];
}

// furniture against free walls (W1): back to the wall, facing in, clear of the doors (1 m either side) and of each other.
// Returns plan.furniture-shaped entries { id, room, kind, x, z, rot, w, d, args?, opts?, auto: true }.
export function autoFurniture(plan, o = {}) {
  const out = [];
  const doors = (plan.doors || []).filter((d) => d.x != null && d.kind !== 'stairs' && d.kind !== 'lift');
  const keep = 1.0, gapBetween = 0.3, off = 0.06;
  for (const r of plan.rooms || []) {
    const T = ROOM_TYPES[r.type];
    if (!T || T.outdoor || r.furnish === false || !(T.furniture || []).length || (r.kind || 'room') !== 'room') continue;
    const own = (plan.furniture || []).filter((f) => f.room === r.id);
    // free stretches per wall: [edge, from, to] minus doors and the plan's own furniture near that wall
    const walls = [['n', r.x, r.x + r.w], ['s', r.x, r.x + r.w], ['w', r.z, r.z + r.d], ['e', r.z, r.z + r.d]].map(([edge, a, b]) => {
      const blocked = [];
      for (const d of doors) {
        if (d.a !== r.id && d.b !== r.id) continue;
        const onLine = edge === 'n' ? Math.abs(d.z - r.z) < 0.05 : edge === 's' ? Math.abs(d.z - (r.z + r.d)) < 0.05 : edge === 'w' ? Math.abs(d.x - r.x) < 0.05 : Math.abs(d.x - (r.x + r.w)) < 0.05;
        if (!onLine) continue;
        const c = edge === 'n' || edge === 's' ? d.x : d.z, w = (d.width ?? 1) / 2 + keep;
        blocked.push([c - w, c + w]);
      }
      for (const f of own) {
        const near = edge === 'n' ? f.z - r.z < 1.2 : edge === 's' ? r.z + r.d - f.z < 1.2 : edge === 'w' ? f.x - r.x < 1.2 : r.x + r.w - f.x < 1.2;
        if (!near) continue;
        const c = edge === 'n' || edge === 's' ? f.x : f.z, w = Math.max(f.w || 1, f.d || 1) / 2 + gapBetween;
        blocked.push([c - w, c + w]);
      }
      return { edge, a: a + 0.15, b: b - 0.15, blocked, used: [] };
    });
    let n = 0;
    for (const [kind, w, d, extra = {}] of T.furniture) {
      if (o.max != null && n >= o.max) break;
      // the wall with the longest free stretch that fits
      let best = null;
      for (const wl of walls) {
        const cuts = [...wl.blocked, ...wl.used].sort((p, q) => p[0] - q[0]);
        let at = wl.a;
        for (const [p, q] of [...cuts, [wl.b, wl.b]]) { const free = Math.min(p, wl.b) - at; if (free >= w + 0.1 && (!best || free > best.free)) best = { wl, from: at, free }; at = Math.max(at, q); }
      }
      if (!best) continue;
      const c = best.from + best.free / 2, e = best.wl.edge;
      const x = e === 'n' || e === 's' ? c : e === 'w' ? r.x + d / 2 + off : r.x + r.w - d / 2 - off;
      const z = e === 'w' || e === 'e' ? c : e === 'n' ? r.z + d / 2 + off : r.z + r.d - d / 2 - off;
      const rot = { n: 0, s: 180, w: 90, e: 270 }[e];   // the front (+z of the model) faces into the room
      best.wl.used.push([c - w / 2 - gapBetween, c + w / 2 + gapBetween]);
      out.push({ id: `auto_${r.id}_${n}`, room: r.id, kind, x: +x.toFixed(2), z: +z.toFixed(2), rot, w, d, ...(extra.args ? { args: extra.args } : {}), ...(extra.opts ? { opts: extra.opts } : {}), auto: true });
      n++;
    }
  }
  return out;
}
