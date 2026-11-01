// 邪視 5.0: the game's own data and rules agree (the record chains, the talk keys the story uses, the endings, the threat side)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CHAINS, completedChains, endingFor, threatDirection } from '../js/ext/rules.js';

const read = (f) => JSON.parse(fs.readFileSync(new URL(`../data/${f}`, import.meta.url), 'utf8'));
const docs = read('docs.json'), talk = read('talk.json'), endings = read('endings.json'), tasks = read('tasks.json');
const story = fs.readFileSync(new URL('../js/ext/story.js', import.meta.url), 'utf8');

test('every record of a chain is a doc with that chain', () => {
  for (const [chain, ids] of Object.entries(CHAINS)) for (const id of ids) {
    const d = docs.find((x) => x.id === id); assert.ok(d, id); assert.equal(d.chain, chain, id);
  }
  for (const d of docs.filter((x) => x.chain)) assert.ok(CHAINS[d.chain].includes(d.id), `${d.id} is in ${d.chain}`);
});
test('completed chains count', () => {
  assert.equal(completedChains([]), 0);
  assert.equal(completedChains(['N_RIBBON', 'N_PHOTO']), 1);
  assert.equal(completedChains(['N_RIBBON', 'N_PHOTO', 'N_BOOTS', 'N_LEDGER', 'N_TAG']), 2);
});
test('the talk keys the story opens exist', () => {
  const keys = new Set([...story.matchAll(/talk\('([A-Za-z_]+)'/g)].map((m) => m[1]));
  for (const k of keys) assert.ok(talk[k], `talk.json "${k}"`);
  for (const chain of Object.keys(CHAINS)) assert.ok(talk[`chain_${chain}`], `chain_${chain}`);
});
test('the endings follow endingFor (phone first, then two chains, else return)', () => {
  const byFlag = (f) => endings.find((e) => (e.requires.flags || []).includes(f));
  assert.equal(byFlag('phone').id, 'E_VOICE'); assert.equal(byFlag('records2').id, 'E_WITNESS');
  assert.ok(endings.findIndex((e) => e.id === 'E_VOICE') < endings.findIndex((e) => e.id === 'E_WITNESS'));
  assert.equal(endingFor({ phone: true }, 3), 'voice'); assert.equal(endingFor({}, 2), 'witness'); assert.equal(endingFor({}, 1), 'return');
  for (const e of endings) assert.ok(e.requires.tasks.includes('T_ENGINE'), e.id);
});
test('every task with a story hook exists', () => {
  for (const m of story.matchAll(/registerTask\('([A-Z_]+)'/g)) assert.ok(tasks.find((t) => t.id === m[1]), m[1]);
});
test('the scythe is never raised from behind', () => {
  assert.equal(threatDirection({ player: { x: 0, z: 0 }, yaw: 0, monster: { x: 0, z: 3 } }).side, 'behind');
  assert.equal(threatDirection({ player: { x: 0, z: 0 }, yaw: 0, monster: { x: 0, z: -3 } }).side, 'front');
  assert.equal(threatDirection({ player: { x: 0, z: 0 }, yaw: 0, monster: { x: 3, z: 0 } }).side, 'right');
});
