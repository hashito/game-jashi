#!/usr/bin/env node
// Checks a standard game's data: schema/*.schema.json for every file named in game.json, then the cross-file checks
// (js/schema-check.js checkGameData: ids, stage reachability, tasks, endings, progression, plan, release notes).
//   node tools/check-game-data.mjs [<game-dir>=.] [--media] [--strict] [--json]
//   --media   also fail when a photo path (items / docs / endings) does not exist on disk
//   --strict  warnings fail too
// Reads <game-dir>/game.json. Schemas: <game-dir>/schema, else the kit's schema/ next to this tool. Exit 1 on errors.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validate, checkGameData, SCHEMA_NAMES } from '../js/kit/schema-check.js';
import { TYPES } from '../js/kit/task-minigames.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const dir = path.resolve(args.find((a) => !a.startsWith('--')) || '.');
const flag = (n) => args.includes(`--${n}`);
const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const schemaDir = [path.join(dir, 'schema'), path.join(here, '..', 'schema')].find((d) => fs.existsSync(d));
const errors = [], warns = [];

let game;
try { game = read(path.join(dir, 'game.json')); } catch (e) { console.error(`game.json: ${e.message}`); process.exit(1); }
const schemaOf = (n) => read(path.join(schemaDir, `${n}.schema.json`));
for (const p of validate(schemaOf('game'), game)) errors.push(`game.json ${p}`);

const keyToSchema = { plan: 'plan', items: 'items', docs: 'docs', tasks: 'tasks', stages: 'stages', endings: 'endings', releaseNotes: 'release-notes', monsters: 'monsters', things: 'things', terminals: 'terminals' };
const data = { game };
for (const [key, file] of Object.entries(game.data || {})) {
  const full = path.join(dir, file);
  if (!fs.existsSync(full)) { errors.push(`${file}: file not found (game.json data.${key})`); continue; }
  let v;
  try { v = read(full); } catch (e) { errors.push(`${file}: invalid JSON (${e.message})`); continue; }
  if (keyToSchema[key] && (key !== 'things' || game.things) && fs.existsSync(path.join(schemaDir, `${keyToSchema[key]}.schema.json`))) for (const p of validate(schemaOf(keyToSchema[key]), v)) errors.push(`${file} ${p}`);
  data[key === 'releaseNotes' ? 'notes' : key] = v;
}
if (!errors.length) {
  const r = checkGameData(data, { minigameTypes: TYPES, themes: ['dark-industrial', 'paper-light', 'retro-crt', 'shrine-night', 'summer-rural', 'hospital-cold', 'school-dusk', 'vhs-tape', 'snow-silence', 'deep-water', 'blood-washi', 'office-night', 'candle-room', 'fog-forest', 'pencil-diary'] });
  errors.push(...r.errors); warns.push(...r.warns);
  if (data.notes && game.version && data.notes.version !== game.version) errors.push(`release-notes.json version ${data.notes.version} differs from game.json version ${game.version}`);
  if (data.notes && data.notes.notes && data.notes.notes[0] && data.notes.notes[0].version !== data.notes.version) errors.push(`release-notes.json: newest entry ${data.notes.notes[0].version} differs from version ${data.notes.version}`);
}
// data/flavor.json (standard 1.10): rooms and stages it names must exist, every line has text, and a game with it says enough to matter
if (data.flavor) {
  const F = data.flavor, rooms = new Set(((data.plan || {}).rooms || []).map((r) => r.id)), stages = new Set((((data.stages || {}).levels) || []).map((l) => l.id));
  const txt = (l) => (typeof l === 'string' ? l : l && l.text);
  for (const r of Object.keys(F.rooms || {})) if (rooms.size && !rooms.has(r)) errors.push(`flavor.json: room "${r}" is not in plan.json`);
  for (const st of Object.keys(F.stages || {})) if (stages.size && !stages.has(st)) errors.push(`flavor.json: stage "${st}" is not in stages.json`);
  const all = [...Object.values(F.rooms || {}).flat(), ...Object.values(F.stages || {}).flat(), ...(F.idle || []), ...(F.spots || []).flatMap((s) => (s.text ? [s.text] : s.lines || []))];
  for (const l of all) if (!txt(l)) errors.push('flavor.json: a line without text');
  if (all.length < 12) warns.push(`flavor.json: only ${all.length} lines (12 or more keep the mood from repeating)`);
}
if (flag('media')) {
  const lists = [['item', data.items], ['doc', data.docs], ['ending', data.endings], ...(game.things ? [['thing', data.things]] : [])];
  for (const [kind, list] of lists) for (const x of list || []) {
    if (!x.photo) { warns.push(`${kind} "${x.id}": photo is empty (picture not made yet)`); continue; }
    if (!fs.existsSync(path.join(dir, x.photo))) errors.push(`${kind} "${x.id}": photo "${x.photo}" does not exist`);
  }
}
// the parts game.json asks for (fx, things, terminals, monsters, voice, recipes ...) must be in the game's kit folder: kit-sync copies them (run it after changing game.json)
if (fs.existsSync(path.join(dir, 'kit.json'))) {
  const kitCfg = read(path.join(dir, 'kit.json')), dest = kitCfg.dest || 'js/kit';
  let features = [];
  try { features = (await import('node:module')).createRequire(import.meta.url)('./kit-features.cjs'); } catch { /* a game whose tools folder has no kit-features.cjs: not checked */ }
  for (const f of features) {
    if (!f.when(game)) continue;
    for (const m of [...f.modules, ...(f.dynamic ? f.dynamic(game) : [])]) if (!fs.existsSync(path.join(dir, dest, `${m}.js`))) errors.push(`game.json uses "${f.id}" but ${dest}/${m}.js is missing: run node ../game-kit/tools/kit-sync.js .`);
  }
}
if (flag('json')) console.log(JSON.stringify({ errors, warns }, null, 1));
else {
  console.log(`${game.id || path.basename(dir)}: ${Object.keys(data).filter((k) => k !== 'game').join(', ')}`);
  errors.forEach((e) => console.log(`  ERROR ${e}`));
  warns.forEach((e) => console.log(`  warn  ${e}`));
  console.log(`  => ${errors.length} error(s), ${warns.length} warning(s)`);
}
process.exit(errors.length || (flag('strict') && warns.length) ? 1 : 0);
