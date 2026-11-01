#!/usr/bin/env node
// Rule S20 check: in the early game a calm player can ALWAYS get away from a chase (and standing still still kills).
//   node tools/check-escape.mjs [game-dir | plan.json] [--monsters data/monsters.json] [--rooms A,B] [--stages 2] [--no-replay] [--list] [--warn]
//
// Static: for every chase start in the early rooms (the player at a room centre / doorway, the monster on a walkway point 3.5 m .. sight away
//   with a line of sight, in the rooms the early monster patrols) it proves a SAFE escape path exists: the player (run speed) stays ahead of the
//   chaser (speed.chase) all the way to a hiding spot (plan.hides), a room on a loop of the plan, or behind two bends (js/monster-escape.js).
// Dynamic: it replays the real MonsterAI (js/monster-ai.js) on the plan: running along the proven path escapes, standing still is caught.
// Also checks the monster's early parameters: chase speed between walk and run, a short chase cap.
// Early rooms = the rooms reachable at the first `--stages` levels of data/stages.json (doors whose `unlock` opens later are walls), or monsters.json early.rooms.
// Exit 1 on an error (a chase start with no escape, a replay that does not behave); --warn reports them as warnings.
import fs from 'node:fs';
import path from 'node:path';
import { navFromPlan } from '../js/kit/monster-nav.js';
import { resolveParams, earlyOk, PLAYER } from '../js/kit/monster-ai.js';
import { escapeScenarios, findEscape, replay } from '../js/kit/monster-escape.js';

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : null; };
const target = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--') && ['monsters', 'rooms', 'stages'].includes(args[i - 1].slice(2)))) || '.';
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const stat = fs.existsSync(target) && fs.statSync(target);
const dir = stat && stat.isDirectory() ? target : path.dirname(target);
const planFile = stat && stat.isDirectory() ? path.join(dir, fs.existsSync(path.join(dir, 'game.json')) ? readJson(path.join(dir, 'game.json')).data.plan : 'data/plan.json') : target;
const plan = readJson(planFile);
const monFile = opt('monsters') || path.join(dir, 'data/monsters.json');
const mon = fs.existsSync(monFile) ? readJson(monFile) : null;
const stagesFile = path.join(dir, 'data/stages.json');
const stages = fs.existsSync(stagesFile) ? readJson(stagesFile) : null;

const errors = [], warns = [];
const bad = (m) => (flag('warn') ? warns : errors).push(m);

// ---- parameters of the early monsters ----
// a monster that kills with its own attack (monsters.json kill: { by, reach }, params.catch 0) is replayed with that reach as its catch distance
const killParams = (m, p) => (m.kill && m.kill.reach > 0 && !(p.catch > 0) ? { ...p, catch: m.kill.reach } : p);
const early = (mon && mon.monsters ? mon.monsters : [{ id: 'default', preset: 'early' }]).filter((m) => (m.preset || 'early') === 'early' || m.early);
const defs = early.length ? early : [{ id: 'default', preset: 'early' }];
for (const m of defs) {
  const p = resolveParams(m.preset || 'early', m.params || {});
  if (!earlyOk(p)) bad(`monster ${m.id}: chase speed ${p.speed.chase} must be between walk (${PLAYER.walk}) and run (${PLAYER.run}) with a chase cap <= 60 s (S20)`);
  if (p.sight > p.lose.dist) warns.push(`monster ${m.id}: it sees ${p.sight} m but gives up past ${p.lose.dist} m, so a chase that starts far away ends at once (params.lose.dist >= sight)`);
  if (p.lose.cap > 25) warns.push(`monster ${m.id}: the early chase cap is ${p.lose.cap} s (S20 wants it short, <= 25 s)`);
}

// ---- early rooms ----
const nav0 = navFromPlan(plan);
let earlyRooms;
if (opt('rooms')) earlyRooms = opt('rooms').split(',');
else if (mon && mon.early && mon.early.rooms) earlyRooms = mon.early.rooms;
else {
  const nStages = +(opt('stages') || (mon && mon.early && mon.early.stages) || 2);
  const open = new Set();
  if (stages) for (const l of (stages.levels || []).slice(0, nStages)) for (const k of l.unlocks || []) open.add(k);
  const isOpen = (id) => { const d = (plan.doors || []).find((x) => x.id === id); return !d || !d.unlock || open.has(d.unlock); };
  const nav = navFromPlan(plan, { isDoorOpen: isOpen });
  const seen = new Set([plan.start]), q = [plan.start];
  for (let h = 0; h < q.length; h++) for (const d of plan.doors || []) {
    if (!isOpen(d.id)) continue;
    const o = d.a === q[h] ? d.b : d.b === q[h] ? d.a : null;
    if (o && !seen.has(o)) { seen.add(o); q.push(o); }
  }
  earlyRooms = [...seen]; void nav;
}
const safeRooms = new Set((plan.rooms || []).filter((r) => r.safe).map((r) => r.id));
const startRooms = earlyRooms.filter((r) => !safeRooms.has(r));
const earlySet = new Set(earlyRooms);
const nav = navFromPlan(plan, { isDoorOpen: (id) => { const d = (plan.doors || []).find((x) => x.id === id); return !d || !d.unlock || earlySet.has(d.a) && earlySet.has(d.b); } });
const monsterRooms = [...new Set(defs.flatMap((m) => [m.spawn && m.spawn.room, ...((m.route && Array.isArray(m.route.rooms)) ? m.route.rooms : [])]).filter(Boolean))];

let n = 0, ok = 0, replays = 0;
const failures = [];
for (const m of defs) {
  const p = killParams(m, resolveParams(m.preset || 'early', m.params || {}));
  const scenarios = escapeScenarios(nav, p, { rooms: startRooms, monsterRooms: monsterRooms.length ? monsterRooms.filter((r) => earlySet.has(r)) : earlyRooms });
  for (const sc of scenarios) {
    n++;
    const f = findEscape(nav, p, sc);
    if (f.ok) ok++; else failures.push({ id: sc.id, room: sc.room, gap: sc.gap, reason: f.reason, monster: m.id });
    if (!flag('no-replay') && n % 4 === 0) {
      replays++;
      const stand = replay(nav, p, sc, 'stand');
      if (stand.outcome !== 'caught') bad(`${m.id} ${sc.id}: standing still was not caught (${stand.outcome}) - S12: failing must still kill`);
      if (f.ok) {
        const run = replay(nav, p, sc, 'run', { path: f.path, refuge: f.refuge });
        if (run.outcome !== 'escaped') bad(`${m.id} ${sc.id}: running along the proven path (${f.refuge}) was ${run.outcome}`);
      }
    }
  }
}
// the failing starts, grouped by the room the player stands in
const byRoom = {};
for (const f of failures) (byRoom[f.room] = byRoom[f.room] || []).push(f);
for (const [room, list] of Object.entries(byRoom)) bad(`room ${room}: ${list.length} chase start(s) with no escape (e.g. ${list[0].id}, gap ${list[0].gap.toFixed(1)} m: ${list[0].reason}). Give the plan a loop, a bend or a hiding place (plan.hides) here, or move the monster's patrol away`);

console.log(`check-escape: ${path.basename(path.resolve(dir))}  early rooms ${earlyRooms.join(',')}  chase starts ${n}  with an escape ${ok}  replays ${replays}`);
if (flag('list')) for (const f of failures) console.log('  no escape:', f.id);
for (const w of warns) console.log('  warn :', w);
for (const e of errors) console.log('  ERROR:', e);
if (!n) console.log('  (no chase starts: no early room has a walkway point that far from another - nothing to check)');
process.exit(errors.length ? 1 : 0);
