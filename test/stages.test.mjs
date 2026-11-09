// 5.7: the two new stages: the number can be worked out from the records alone, a wrong number always answers, the aim resets and never kills
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { AIM, LOCK, checkLock, createAim, stepAim } from '../js/ext/rules.js';

const read = (f) => JSON.parse(fs.readFileSync(new URL(`../data/${f}`, import.meta.url), 'utf8'));
const docs = read('docs.json'), tasks = read('tasks.json'), stages = read('stages.json');
const plate = { 北: 1, 東: 2, 南: 3, 西: 4 };

test('the number comes from the three mark records, read with the plate', () => {
  const dirs = ['N_MARK1', 'N_MARK2', 'N_MARK3'].map((id) => { const m = docs.find((d) => d.id === id).text.match(/目が見ている向き：(?:二つとも)?([北東南西])/); assert.ok(m, id); return m[1]; });
  assert.deepEqual(dirs, LOCK.trees.map((t) => t.dir));
  assert.deepEqual(dirs.map((d) => plate[d]), [...LOCK.answer]);
  const diary = docs.find((d) => d.id === 'N_DIARY').text;
  for (const s of ['伐採跡の杉', '林道の奥の杉', '沢の下手の杉', '北は一、東は二、南は三、西は四']) assert.ok(diary.includes(s), s);
});
test('the lock opens on 3-1-4 and every wrong number gets a reply that helps', () => {
  assert.equal(checkLock([3, 1, 4]).ok, true);
  const off = checkLock([0, 0, 0]); assert.equal(off.ok, false); assert.match(off.text, /一から四/);
  const one = checkLock([3, 2, 4]); assert.deepEqual(one.wrong, [1]); assert.match(one.text, /林道の奥の杉/);
  assert.match(checkLock([1, 1, 1], 3).text, /南は三、北は一、西は四/);
});
test('the key box window shows sketches and never prints the direction', () => {
  const src = fs.readFileSync(new URL('../js/ext/tower.js', import.meta.url), 'utf8');
  assert.ok(src.includes('eyeSketch(t)'));
  assert.ok(!src.includes('目の向き：'));
});
test('the aim wins after the needed seconds on target', () => {
  const a = createAim(); let ev = null, t = 0;
  while (!ev && t < 10) { ev = stepAim(a, { dt: 0.05, onTarget: true, closed: false }); t += 0.05; }
  assert.equal(ev, 'won'); assert.ok(Math.abs(t - AIM.need) < 0.2, String(t));
});
test('closing the eyes resets the aim, off target drains it, nothing else happens', () => {
  const a = createAim();
  stepAim(a, { dt: 1, onTarget: true, closed: false }); const on = a.progress; assert.ok(on > 0);
  stepAim(a, { dt: 0.5, onTarget: false, closed: false }); assert.ok(a.progress < on && a.progress > 0);
  assert.equal(stepAim(a, { dt: 0.016, onTarget: true, closed: true }), 'reset'); assert.equal(a.progress, 0);
  assert.equal(stepAim(a, { dt: 0.016, onTarget: true, closed: true }), null);
});
test('the mind lasts longer than the aim needs, without glasses', () => {
  assert.ok((90 - AIM.closeAt) / 10.5 > AIM.need + 2, 'from 90 down to the forced closing there is room to hit it');
});
test('the stages are in order and the gate waits for the board', () => {
  assert.deepEqual(stages.levels.map((l) => l.id), ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'L9']);
  const t = (id) => tasks.find((x) => x.id === id);
  assert.equal(t('T_POST').stage, 'L6'); assert.equal(t('T_KEYBOX').stage, 'L6'); assert.equal(t('T_REFLECT').stage, 'L7');
  assert.equal(t('T_GATE').stage, 'L8'); assert.equal(t('T_ENGINE').stage, 'L9');
  assert.ok(t('T_GATE').needs.includes('T_REFLECT'));
});
