import test from 'node:test';
import assert from 'node:assert/strict';
import { SPEECH_RULES, speechKind, tagSpeech, pruneSpeechQueue, enqueueSpeechLines, speechDuration, dialogueDuration } from '../dist/dialogue.js';
import { threatDirection, THREAT_SIDES } from '../dist/survival.js';
import { SHELTER, createShelterState, updateShelter, shelterLeash } from '../dist/gimmicks.js';
import { BUILDINGS, shelterAt } from '../dist/layout.js';
import { createEnemyState, stepEnemy } from '../dist/enemy.js';
import { DIALOGUE } from '../dist/narrative.js';

// v4.0.2 playtest fixes: the speech backlog, the scythe direction and the single-door shelters.
const lines = (key, extra = {}) => DIALOGUE[key].map(line => ({ ...line, beat: key, ...extra }));
const BRIDGE = { x: .8, z: -10, level: 0 }, PHONE = { x: 18, z: -23, level: 0 };

test('every dialogue beat has a kind; the story plan, discoveries and the phone are critical', () => {
  for (const key of ['opening', 'radioTuned', 'note', 'trail', 'bottle', 'crank', 'gate', 'engine', 'phone', 'phoneIgnore', 'records', 'preparing'])
    assert.equal(speechKind({ beat: key }), 'critical', key);
  for (const key of ['bridge', 'nearCabin', 'bell', 'shutter']) assert.equal(speechKind({ beat: key }), 'context', key);
  for (const key of ['enemyTurn', 'enemySearch', 'enemyListen', 'enemyCrawl', 'firstAttack', 'repel']) assert.equal(speechKind({ beat: key }), 'ambient', key);
  assert.equal(speechKind({ speaker: '私', text: '物の説明' }), 'context', 'an item remark without a beat belongs to its place');
  for (const key of Object.keys(DIALOGUE)) assert.ok(['critical', 'context', 'ambient'].includes(speechKind({ beat: key })));
});

test('a place line expires once the player has left the area; critical lines stay', () => {
  let queue = tagSpeech([...lines('bridge'), ...lines('trail')], { time: 10, origin: BRIDGE });
  assert.ok(queue.filter(l => l.kind === 'context').every(l => l.origin && l.at === 10));
  assert.ok(queue.filter(l => l.kind === 'critical').every(l => !l.origin), 'critical lines are not tied to a place');
  // Still near the bridge: nothing is dropped.
  let result = pruneSpeechQueue(queue, { time: 14, player: { x: 3, z: -6, level: 0 } });
  assert.equal(result.dropped.length, 0);
  // At the phone, 25 m away: the bridge lines are gone, the trail plan is kept in order.
  result = pruneSpeechQueue(queue, { time: 16, player: PHONE });
  assert.deepEqual(result.dropped.map(d => d.line.beat), ['bridge', 'bridge']);
  assert.ok(result.dropped.every(d => d.reason === 'left'));
  assert.deepEqual(result.queue.map(l => l.text), DIALOGUE.trail.map(l => l.text));
  // A context line also expires by age where it was triggered, and on another floor.
  assert.equal(pruneSpeechQueue(queue.slice(0, 1), { time: 10 + SPEECH_RULES.contextTtl + .1, player: BRIDGE }).dropped[0].reason, 'expired');
  assert.equal(pruneSpeechQueue(queue.slice(0, 1), { time: 11, player: { ...BRIDGE, level: 1 } }).dropped.length, 1);
});

test('ambient reactions expire after a few seconds and at most two place/ambient lines wait', () => {
  const queue = tagSpeech([...lines('enemyTurn'), ...lines('enemySearch'), ...lines('enemyListen'), ...lines('nearCabin')], { time: 0, origin: BRIDGE });
  const fresh = pruneSpeechQueue(queue, { time: 1, player: BRIDGE });
  assert.equal(fresh.queue.length, SPEECH_RULES.maxPending, 'never more than two non-critical lines waiting');
  assert.equal(fresh.dropped[0].line.beat, 'enemyTurn', 'the oldest non-critical line goes first');
  const old = pruneSpeechQueue(queue, { time: SPEECH_RULES.ambientTtl + .5, player: BRIDGE });
  assert.ok(old.queue.every(l => l.kind !== 'ambient'));
  // Critical lines are never dropped, even past the cap.
  const story = tagSpeech([...lines('radioTuned'), ...lines('trail'), ...lines('gate')], { time: 0 });
  const kept = pruneSpeechQueue(story, { time: 999, player: PHONE });
  assert.equal(kept.dropped.length, 0); assert.equal(kept.queue.length, story.length);
});

test('a priority line supersedes waiting place and ambient lines; an interrupted critical line resumes once', () => {
  const waiting = tagSpeech([...lines('bridge'), ...lines('enemyListen'), ...lines('note')], { time: 0, origin: BRIDGE });
  const active = tagSpeech(lines('radioTuned'), { time: 0 })[0];
  const { queue, dropped } = enqueueSpeechLines(waiting, tagSpeech(lines('firstAttack'), { time: 1 }), { priority: true, interrupted: active });
  assert.deepEqual(queue.map(l => l.beat), ['firstAttack', 'firstAttack', 'radioTuned', 'note', 'note']);
  assert.equal(queue[2].logged, true, 'the resumed line is not logged twice');
  assert.deepEqual(dropped.map(d => d.line.beat).sort(), ['bridge', 'bridge', 'enemyListen']);
  // An interrupted ambient line is not re-queued; duplicate texts are not queued twice.
  const ambient = tagSpeech(lines('enemyTurn'), { time: 0 })[0];
  assert.equal(enqueueSpeechLines([], lines('gate'), { priority: true, interrupted: ambient }).queue.length, DIALOGUE.gate.length);
  assert.equal(enqueueSpeechLines(lines('gate'), lines('gate')).queue.length, DIALOGUE.gate.length);
});

test('a waiting backlog shortens each line so the player catches up', () => {
  const long = { text: 'あ'.repeat(60) };
  assert.equal(speechDuration(long, 0), dialogueDuration(long));
  assert.ok(speechDuration(long, 2) < dialogueDuration(long));
  assert.ok(speechDuration({ text: '短い' }, 3) >= SPEECH_RULES.catchUpMin);
});

test('the scythe warning names the side relative to the camera and the way out', () => {
  const player = { x: 0, z: 0 };
  // yaw 0 looks toward -z; +x is to the right.
  assert.equal(threatDirection({ player, yaw: 0, monster: { x: 0, z: -2 } }).side, 'front');
  assert.equal(threatDirection({ player, yaw: 0, monster: { x: 2, z: 0 } }).side, 'right');
  assert.equal(threatDirection({ player, yaw: 0, monster: { x: -2, z: 0 } }).side, 'left');
  assert.equal(threatDirection({ player, yaw: 0, monster: { x: 0, z: 2 } }).side, 'behind');
  // The camera turned around: the same creature is now behind / in front.
  assert.equal(threatDirection({ player, yaw: Math.PI, monster: { x: 0, z: -2 } }).side, 'behind');
  assert.equal(threatDirection({ player, yaw: Math.PI / 2, monster: { x: -2, z: 0 } }).side, 'front');
  assert.equal(threatDirection({ player, yaw: Math.PI / 2, monster: { x: 0, z: -2 } }).side, 'right');
  assert.equal(threatDirection({ player, yaw: 0, monster: { x: 1.2, z: 1.6 } }).label, '背後 — 前へ走る');
  assert.equal(THREAT_SIDES.left.label, '左から — 右へ離れる');
  assert.equal(THREAT_SIDES.right.label, '右から — 左へ離れる');
});

test('the shed and the hut: a calm period, then a clear warning, then the creature may come in', () => {
  assert.equal(shelterAt({ x: -19, z: -3, level: 0 })?.id, 'shed');
  assert.equal(shelterAt({ x: 16, z: -15, level: 0 })?.id, 'shelter');
  assert.equal(shelterAt({ x: 0, z: 24, level: 0 }), null, 'the cabin has its own rules');
  assert.equal(shelterAt({ x: -19, z: -3, level: 1 }), null);
  const shed = BUILDINGS.find(b => b.id === 'shed'), state = createShelterState(), events = [];
  for (let t = 0; t < SHELTER.release + 1; t += .1) {
    events.push(...updateShelter(state, 'shed', .1).map(e => [e, +t.toFixed(1)]));
    if (t < SHELTER.release - .2) assert.ok(shelterLeash(state, shed, true), 'kept off the door while calm or warned');
  }
  assert.deepEqual(events.map(e => e[0]), ['enter', 'warn', 'release']);
  assert.ok(events[2][1] - events[1][1] >= 9.5, 'the warning comes about ten seconds before');
  assert.equal(shelterLeash(state, shed, true), null, 'released');
  // Stepping out for a moment does not reset the clock; a real absence does.
  updateShelter(state, null, 3); updateShelter(state, 'shed', .1);
  assert.equal(state.released, true);
  for (let t = 0; t < SHELTER.reset + .5; t += .25) updateShelter(state, null, .25);
  assert.equal(state.id, null);
  assert.deepEqual(updateShelter(state, 'shed', .1), ['enter']);
  assert.equal(shelterLeash(state, shed, false), null, 'no leash once the player is outside');
});

test('a door-aware leash parks the hunting creature away from the doorway', () => {
  const shed = BUILDINGS.find(b => b.id === 'shed'), state = createShelterState(); updateShelter(state, 'shed', .1);
  const leash = shelterLeash(state, shed, true), player = { x: -19, z: -3.3, level: 0 };
  // A tiny open-field nav: free everywhere, the shed walls are not modelled.
  const nav = {
    actorHeight: () => 0, isBlocked: () => false, isFreeAt: () => true,
    findPath: (a, b) => [{ x: b.x, z: b.z, level: 0 }],
    move: (p, dx, dz) => { p.x += dx; p.z += dz; return true; },
  };
  const enemy = createEnemyState({ x: -19, z: 3, level: 0 });
  let closestToDoor = 99;
  for (let t = 0; t < 30; t += .05) {
    stepEnemy(enemy, { player, active: true, hunt: true, playerMoving: false, leash }, .05, nav);
    if (t > 6) closestToDoor = Math.min(closestToDoor, Math.hypot(enemy.position.x - shed.entrance.x, enemy.position.z - shed.entrance.z));
  }
  const ring = Math.hypot(enemy.position.x - shed.x, enemy.position.z - shed.z);
  assert.ok(ring > leash.radius - .8, `parked on the ring (${ring.toFixed(2)} m from the centre)`);
  assert.ok(closestToDoor > SHELTER.doorClear - .9, `kept off the doorway (${closestToDoor.toFixed(2)} m)`);
});
