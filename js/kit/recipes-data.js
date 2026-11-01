/* game-kit 6e0b6f0: js/recipes-data.js — edit in game-kit and run tools/kit-sync.js */
// The "recipes" of the standard (standard 1.5): the content parts that were copied around by hand (props, env-props, texture-library, ambience, openables) switched on from game.json,
// pure side (names, plan -> models, checks). js/recipes.js is the THREE / Web Audio side. game.json:
//   "recipes": {
//     "props": true,                 plan.furniture[] { id, room, x, z, w, d, kind, rot?, args?, opts? } become props (js/props.js, js/env-props.js): x,z = the CENTRE, rot in degrees; colliders are added to the world
//     "textures": "assets/textures/",   js/texture-library.js: plan.rooms[].floorTex / wallTex (catalog ids) dress the floors / walls (the folder holds catalog.json; kit-sync "textures" copies the files)
//     "ambience": { "beds": [ { "name": "rain", "kind": "rain", "level": 0.35 } ] },   js/ambience.js: outdoor beds that muffle behind doors (model from the plan; rooms with kind "outdoor" are outdoors)
//     "openables": true              js/openables.js: props with userData.drawers (lockers, fridges, cabinets) open with [E] and save their state
//   }
// kit-sync (tools/kit-features.cjs) copies exactly the modules a switch needs.
export const PROP_KINDS = {
  // js/props.js (T = the texture set, {} is fine)
  desk: { from: 'P', t: true }, steelDesk: { from: 'P', t: true }, table: { from: 'P', t: true }, locker: { from: 'P', t: true }, fridge: { from: 'P', t: true }, cardboardBox: { from: 'P', t: true },
  shelf: { from: 'P', t: true }, filingCabinet: { from: 'P', t: true }, counter: { from: 'P', t: true }, crateBox: { from: 'P', t: true }, trashBin: { from: 'P' }, pipeChair: { from: 'P' },
  officeChair: { from: 'P' }, printer: { from: 'P' }, cabinet: { from: 'P', t: true }, tansu: { from: 'P', t: true }, bed: { from: 'P', t: true }, woodenChair: { from: 'P', t: true }, phone: { from: 'P' }, coatRack: { from: 'P' }, extinguisher: { from: 'P' },
  // js/env-props.js (an options object)
  bench: { from: 'E' }, vendingMachine: { from: 'E' }, plant: { from: 'E' }, crate: { from: 'E' }, pallet: { from: 'E' }, drum: { from: 'E' }, wheelieBin: { from: 'E' }, trashBag: { from: 'E' },
  trafficCone: { from: 'E' }, bollard: { from: 'E' }, car: { from: 'E' }, streetLamp: { from: 'E' }, deskLamp: { from: 'E' }, signPanel: { from: 'E' }, fence: { from: 'E' }, railing: { from: 'E' },
};
export const furnitureOf = (plan) => (plan.furniture || []).filter((f) => f.kind);

// the ambience model (js/ambience.js setModel) from the plan: rooms as boxes (kind "outdoor" = outdoors), doors as openings; doorOpen(id) -> 0..1
export function ambienceModelFromPlan(plan, doorOpen = () => 0) {
  const rooms = (plan.rooms || []).map((r) => ({ id: r.id, box: [r.x, r.z, r.x + r.w, r.z + r.d], leak: r.leak ?? (r.kind === 'outdoor' ? 1 : 0.04), outdoor: r.kind === 'outdoor' || undefined }));
  const byId = new Map((plan.rooms || []).map((r) => [r.id, r]));
  const openings = (plan.doors || []).filter((d) => d.x != null && byId.has(d.a) && byId.has(d.b) && d.kind !== 'stairs' && d.kind !== 'lift').map((d) => ({ id: d.id, x: d.x, y: 1.1, z: d.z, width: d.width ?? 1, kind: d.kind === 'window' ? 'window' : 'door', rooms: [d.a, d.b], open: () => doorOpen(d.id) }));
  return { rooms, openings };
}

export function checkRecipes(recipes, plan, opts = {}) {
  const errors = [], warns = [];
  if (!recipes) return { errors, warns };
  const rooms = new Map(((plan && plan.rooms) || []).map((r) => [r.id, r]));
  if (recipes.props) {
    const ids = new Set();
    for (const f of (plan && plan.furniture) || []) {
      if (!f.kind) { warns.push(`furniture "${f.id}": no kind (recipes.props has nothing to build)`); continue; }
      if (!PROP_KINDS[f.kind]) errors.push(`furniture "${f.id}": kind "${f.kind}" is not one of ${Object.keys(PROP_KINDS).join(', ')}`);
      if (ids.has(f.id)) errors.push(`furniture "${f.id}": duplicate id`); ids.add(f.id);
      const r = rooms.get(f.room);
      if (!r) errors.push(`furniture "${f.id}": room "${f.room}" is not in plan.json`);
      else if (f.x < r.x || f.x > r.x + r.w || f.z < r.z || f.z > r.z + r.d) errors.push(`furniture "${f.id}": its centre (${f.x}, ${f.z}) is outside room "${f.room}"`);
    }
  }
  if (recipes.textures) {
    const known = opts.textureIds;
    for (const r of rooms.values()) for (const k of ['floorTex', 'wallTex']) if (r[k] && known && !known.includes(r[k])) errors.push(`room "${r.id}": ${k} "${r[k]}" is not in the texture catalog`);
  }
  if (recipes.ambience) {
    if (!(recipes.ambience.beds || []).length) warns.push('recipes.ambience: no beds (nothing to play)');
    if (![...rooms.values()].some((r) => r.kind === 'outdoor')) warns.push('recipes.ambience: no room with kind "outdoor" (the beds are heard everywhere at the same level)');
  }
  return { errors, warns };
}
