/* game-kit 6e0b6f0: js/schema-check.js — edit in game-kit and run tools/kit-sync.js */
// A small JSON Schema checker (no dependencies, no DOM; Node and browser) + the cross-file checks of a game's data.
// Supported keywords: $ref ("#/$defs/x"), type (string | array), enum, const, required, properties, additionalProperties
// (bool | schema), items, minItems, maxItems, minLength, maxLength, pattern, minimum, maximum, oneOf, anyOf, uniqueBy (own).
// validate(schema, data) -> ["$.rooms[2].w: must be >= 1", ...]   ([] = fine)
// checkGameData({ game, plan, items, docs, tasks, stages, endings, notes }, { minigameTypes }) -> { errors, warns }
//   cross-references between the files (room / stage / task / unlock ids), reachability by stage (a room behind a door that a
//   later stage unlocks cannot hold an earlier task or item), endings that can be reached, the progression definition.
// names of the kinds / room types (item kinds: js/item-catalog.js, 192 since standard 1.9; room types kept in sync with js/room-types.js ROOM_TYPES; test/standard-1.7.test.mjs checks)
import { ITEM_KIND_LIST } from './item-catalog.js';
export const ITEM_KIND_NAMES = ITEM_KIND_LIST;
export const ROOM_TYPE_NAMES = ['washitsu', 'kitchen', 'storage', 'office', 'shop', 'classroom', 'hospital', 'bathroom', 'workshop', 'corridor', 'engawa', 'doma', 'road', 'yard', 'field', 'forest', 'grounds', 'street'];
// The schemas live in schema/*.schema.json; tools/check-game-data.mjs loads and runs everything. docs/standard-3d.md "Data".
import { resolveParams, earlyOk, PLAYER } from './monster-ai.js';
import { checkThings } from './things-data.js';
import { checkTerminals } from './terminal-data.js';
import { checkRecipes } from './recipes-data.js';
import { checkPlan } from './plan-check.js';
import { validateNotes } from './release-notes.js';
import { Progression, validate as validateProgression } from './progression.js';
import { buildProgressionDef } from './game-data.js';
export { buildProgressionDef };

export const SCHEMA_NAMES = ['game', 'plan', 'items', 'docs', 'tasks', 'stages', 'endings', 'release-notes'];
const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v);
const isType = (v, t) => (t === 'number' ? typeof v === 'number' && Number.isFinite(v) : t === 'integer' ? Number.isInteger(v) : typeOf(v) === t);

export function validate(schema, data, path = '$', root = schema) {
  const out = [];
  const err = (m) => out.push(`${path}: ${m}`);
  if (schema === true || schema == null) return out;
  if (schema === false) return [`${path}: not allowed`];
  if (schema.$ref) {
    const target = schema.$ref.replace(/^#\//, '').split('/').reduce((o, k) => o && o[k], root);
    if (!target) return [`${path}: unresolved $ref ${schema.$ref}`];
    return validate(target, data, path, root);
  }
  if (schema.type) {
    const ts = [].concat(schema.type);
    if (!ts.some((t) => isType(data, t))) return [`${path}: must be ${ts.join(' or ')} (got ${typeOf(data)})`];
  }
  if ('const' in schema && data !== schema.const) err(`must be ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.includes(data)) err(`must be one of ${schema.enum.join(' | ')} (got ${JSON.stringify(data)})`);
  if (typeof data === 'string') {
    if (schema.minLength != null && data.length < schema.minLength) err(schema.minLength === 1 ? 'must not be empty' : `must have at least ${schema.minLength} characters`);
    if (schema.maxLength != null && data.length > schema.maxLength) err(`must have at most ${schema.maxLength} characters`);
    if (schema.pattern && !new RegExp(schema.pattern).test(data)) err(`must match ${schema.pattern}`);
  }
  if (typeof data === 'number') {
    if (schema.minimum != null && data < schema.minimum) err(`must be >= ${schema.minimum}`);
    if (schema.maximum != null && data > schema.maximum) err(`must be <= ${schema.maximum}`);
  }
  if (Array.isArray(data)) {
    if (schema.minItems != null && data.length < schema.minItems) err(`needs at least ${schema.minItems} item(s)`);
    if (schema.maxItems != null && data.length > schema.maxItems) err(`needs at most ${schema.maxItems} item(s)`);
    if (schema.items) data.forEach((v, i) => out.push(...validate(schema.items, v, `${path}[${i}]`, root)));
    if (schema.uniqueBy) {
      const seen = new Set();
      data.forEach((v, i) => { const k = v && v[schema.uniqueBy]; if (k != null && seen.has(k)) out.push(`${path}[${i}]: duplicate ${schema.uniqueBy} "${k}"`); seen.add(k); });
    }
  }
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    for (const k of schema.required || []) if (!(k in data) || data[k] === undefined) out.push(`${path}.${k}: is required`);
    const props = schema.properties || {};
    for (const [k, v] of Object.entries(data)) {
      if (k in props) out.push(...validate(props[k], v, `${path}.${k}`, root));
      else if (schema.additionalProperties === false) out.push(`${path}.${k}: unknown property`);
      else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') out.push(...validate(schema.additionalProperties, v, `${path}.${k}`, root));
    }
  }
  if (schema.anyOf && !schema.anyOf.some((s) => !validate(s, data, path, root).length)) err('matches none of the allowed shapes');
  if (schema.oneOf && schema.oneOf.filter((s) => !validate(s, data, path, root).length).length !== 1) err('must match exactly one of the allowed shapes');
  return out;
}


const uniq = (a) => [...new Set(a)];
export function checkGameData(d, opts = {}) {
  const errors = [], warns = [];
  const E = (m) => errors.push(m), W = (m) => warns.push(m);
  const { game, plan, items = [], docs = [], tasks = [], stages, endings = [], notes, monsters, things, terminals } = d;
  const types = new Set([...(opts.minigameTypes || []), ...((game && game.minigames) || [])]);
  const rooms = new Map(((plan && plan.rooms) || []).map((r) => [r.id, r]));
  const levels = ((stages && stages.levels) || []).map((l) => l.id);
  const lvIdx = new Map(levels.map((l, i) => [l, i]));
  const unlockLevel = new Map();
  ((stages && stages.levels) || []).forEach((l, i) => (l.unlocks || []).forEach((k) => unlockLevel.set(k, i)));
  const taskIds = new Set(tasks.map((t) => t.id));

  // ids unique across things that share a namespace
  const dupIds = (kind, list) => { const s = new Set(); for (const x of list) { if (s.has(x.id)) E(`${kind} "${x.id}": duplicate id`); s.add(x.id); } };
  dupIds('item', items); dupIds('doc', docs); dupIds('task', tasks); dupIds('ending', endings);

  const needRoom = (kind, x) => { if (x.room != null && rooms.size && !rooms.has(x.room)) E(`${kind} "${x.id}": room "${x.room}" is not in plan.json`); };
  const needStage = (kind, x, key = 'stage') => { if (x[key] != null && levels.length && !lvIdx.has(x[key])) E(`${kind} "${x.id}": ${key} "${x[key]}" is not a level in stages.json`); };
  for (const [kind, list] of [['item', items], ['doc', docs], ['task', tasks]]) for (const x of list) { needRoom(kind, x); needStage(kind, x); }

  // plan: stations referenced by tasks, doors' unlock keys
  const stations = new Map((((plan && plan.stations) || [])).map((s) => [s.id, s]));
  for (const t of tasks) {
    if (t.station && stations.size && !stations.has(t.station)) E(`task "${t.id}": station "${t.station}" is not in plan.json stations`);
    if (t.station && stations.has(t.station) && t.room && stations.get(t.station).room !== t.room) E(`task "${t.id}": station "${t.station}" is in room "${stations.get(t.station).room}", not "${t.room}"`);
    if (!t.station && !t.timer) W(`task "${t.id}": no station (the world puts it in the middle of room "${t.room}")`);
    for (const n of t.needs || []) if (!taskIds.has(n)) E(`task "${t.id}": needs unknown task "${n}"`);
    if (t.minigame && types.size && !types.has(t.minigame.type)) E(`task "${t.id}": mini game type "${t.minigame.type}" is not a kit type nor listed in game.json "minigames"`);
  }
  // standard 1.7: item / doc kinds, items given by a task, room types
  const ownKinds = new Set([...((game && game.itemKinds) || []), ...(opts.itemKinds || [])]);   // a game's own kinds (ext.registerItemKind + game.json itemKinds)
  for (const x of [...items, ...docs]) if (x.kind && !ITEM_KIND_NAMES.includes(x.kind) && !ownKinds.has(x.kind)) E(`${items.includes(x) ? 'item' : 'doc'} "${x.id}": kind "${x.kind}" is not a standard kind (docs/item-kinds.md, js/item-catalog.js) nor in game.json itemKinds`);
  for (const x of items) if (x.given && !taskIds.has(x.given)) E(`item "${x.id}": given by unknown task "${x.given}"`);
  for (const r of (plan && plan.rooms) || []) if (r.type && !ROOM_TYPE_NAMES.includes(r.type)) E(`room "${r.id}": type "${r.type}" is not one of ${ROOM_TYPE_NAMES.join(', ')} (js/room-types.js)`);
  for (const dr of (plan && plan.doors) || []) if (dr.unlock && !unlockLevel.has(dr.unlock)) E(`door "${dr.id}": unlock "${dr.unlock}" is not unlocked by any level in stages.json`);
  for (const l of (stages && stages.levels) || []) for (const k of l.unlocks || []) if (!((stages.unlocks || {})[k])) E(`level "${l.id}": unlock "${k}" is not defined in stages.unlocks`);
  ((stages && stages.show) || []).forEach((r, i) => {   // stage-look rules (js/stage-look.js)
    if (!r.name && !(r.names && r.names.length)) E(`stages.show[${i}]: needs name or names`);
    for (const k of ['from', 'until']) if (r[k] != null && !lvIdx.has(r[k])) E(`stages.show[${i}]: ${k} "${r[k]}" is not a level in stages.json`);
    for (const l of r.stages || []) if (!lvIdx.has(l)) E(`stages.show[${i}]: stage "${l}" is not a level in stages.json`);
    for (const k of ['done', 'notDone']) for (const t of [].concat(r[k] ?? [])) if (!taskIds.has(t)) E(`stages.show[${i}]: ${k} "${t}" is not a task`);
  });

  // task dependency cycles
  const state = {}, byId = new Map(tasks.map((t) => [t.id, t]));
  const visit = (id, path) => {
    if (state[id] === 2) return; if (state[id] === 1) return E(`tasks: circular needs ${[...path, id].join(' -> ')}`);
    state[id] = 1; for (const n of byId.get(id)?.needs || []) visit(n, [...path, id]); state[id] = 2;
  };
  tasks.forEach((t) => visit(t.id, []));

  // reachability by stage: a room is open at level i when a path of doors exists whose unlock keys are all unlocked at <= i
  if (plan && rooms.size && levels.length) {
    const reachable = (i) => {
      const seen = new Set([plan.start]), q = [plan.start];
      const doorOk = (dr) => !dr.unlock || (unlockLevel.has(dr.unlock) && unlockLevel.get(dr.unlock) <= i);
      while (q.length) {
        const r = q.shift();
        for (const dr of plan.doors || []) {
          if (!doorOk(dr)) continue;
          const o = dr.a === r ? dr.b : dr.b === r ? dr.a : null;
          if (o && !seen.has(o)) { seen.add(o); q.push(o); }
        }
      }
      return seen;
    };
    const memo = levels.map((_, i) => reachable(i));
    for (const [kind, list] of [['task', tasks], ['item', items], ['doc', docs]]) for (const x of list) {
      if (!x.room || !lvIdx.has(x.stage)) continue;
      if (!memo[lvIdx.get(x.stage)].has(x.room)) E(`${kind} "${x.id}": room "${x.room}" is not reachable at stage "${x.stage}" (doors unlock later or not at all)`);
    }
    const last = memo[memo.length - 1];
    for (const id of rooms.keys()) if (!last.has(id)) W(`room "${id}": not reachable even after the last stage`);
  }

  // every level can be left: it has a required task (else the progression never advances) — Progression.validate says it too
  if (stages && stages.levels) {
    try {
      const def = buildProgressionDef(stages, tasks, plan);
      for (const p of validateProgression(def)) (/unreachable|circular|not defined|no level unlocks|does not exist/.test(p) ? E : W)(`progression: ${p}`);
      new Progression(def); // must construct
    } catch (e) { E(`progression: ${e.message}`); }
    for (const l of stages.levels) if (!tasks.some((t) => t.stage === l.id && !t.optional)) W(`level "${l.id}": has no required task`);
  }

  // endings
  if (!endings.length) E('endings: at least one ending is needed');
  for (const e of endings) {
    const r = e.requires || {};
    for (const t of r.tasks || []) if (!taskIds.has(t)) E(`ending "${e.id}": requires unknown task "${t}"`);
    for (const i of r.items || []) if (!items.some((x) => x.id === i)) E(`ending "${e.id}": requires unknown item "${i}"`);
  }
  if (endings.length && !endings.some((e) => !(e.requires || {}).flags)) W('endings: every ending needs a flag that only game code can set; check them in a playthrough test');

  // monsters (js/monster-std.js): rooms and stages exist, the early chase is escapable (S20)
  if (monsters && monsters.monsters) {
    const roomOk = (m, what, id) => { if (id != null && rooms.size && !rooms.has(id)) E(`monster "${m.id}": ${what} room "${id}" is not in plan.json`); };
    for (const m of monsters.monsters) {
      roomOk(m, 'spawn', m.spawn && m.spawn.room); roomOk(m, 'nearAttack', m.nearAttack && m.nearAttack.room);
      for (const k of ['from', 'target']) roomOk(m, `nearAttack.${k}`, m.nearAttack && m.nearAttack[k] && m.nearAttack[k].room);
      if (m.route && m.route.rooms) for (const r of m.route.rooms) roomOk(m, 'route', r);
      for (const [key, v] of [['activeFrom.stage', m.activeFrom && m.activeFrom.stage], ...(m.phases || []).map((ph) => ['phases.untilStage', ph.untilStage])]) if (v && levels.length && !lvIdx.has(v)) E(`monster "${m.id}": ${key} "${v}" is not a level in stages.json`);
      if (m.activeFrom && m.activeFrom.task && !taskIds.has(m.activeFrom.task)) E(`monster "${m.id}": activeFrom.task "${m.activeFrom.task}" is not a task`);
      const phases = m.phases || [{ preset: m.preset || 'early' }];
      for (const ph of phases) { let p; try { p = resolveParams(ph.preset || 'early', m.params || {}); } catch (e) { E(`monster "${m.id}": ${e.message}`); continue; } if (ph.preset === 'early' && !earlyOk(p)) E(`monster "${m.id}": the early chase speed ${p.speed.chase} must be between walk (${PLAYER.walk}) and run (${PLAYER.run}) (S20)`); }
    }
  }

  // things (js/things.js): rooms, positions inside the rooms, text / photo
  if (things && game && game.things) { const r = checkThings(things, plan, { fileExists: opts.fileExists }); r.errors.forEach(E); r.warns.forEach((w) => opts.strictThings && W(w)); }

  // terminals (js/terminal-screen.js)
  if (terminals) { const r = checkTerminals(terminals, { rooms: [...rooms.keys()], tasks: [...taskIds] }); r.errors.forEach(E); r.warns.forEach((w) => opts.strictTerminals && W(w)); }

  // recipes (props / textures / ambience / openables switched on from game.json)
  if (game && game.recipes) { const r = checkRecipes(game.recipes, plan, { textureIds: opts.textureIds }); r.errors.forEach(E); r.warns.forEach(W); }

  // manifest
  if (game) {
    for (const k of Object.keys(game.data || {})) if (!game.data[k]) E(`game.json data.${k}: empty path`);
    if (game.theme && opts.themes && !String(game.theme).split(/\s+/).some((w) => opts.themes.includes(w))) W(`game.json theme "${game.theme}" has no kit theme word (${opts.themes.join(', ')}); fine if the game ships its own css/theme-game.css`);   // a list: "dark-industrial mygame"
  }
  if (plan) {
    const r = checkPlan(plan, opts.plan || {});
    r.errors.forEach((x) => E(`plan [${x.code}] ${x.msg}`)); r.warns.forEach((x) => W(`plan [${x.code}] ${x.msg}`));
  }
  if (notes) for (const p of validateNotes(notes.notes || [])) E(`release-notes: ${p}`);
  return { errors: uniq(errors), warns: uniq(warns) };
}
