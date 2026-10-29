import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RULES,
  createSurvival,
  updateSurvival,
  movementSpeed,
  stunEnemy,
  canThrow,
  endingFor,
  advanceEscapeAction,
} from '../dist/survival.js';

// Drive the public rules through ordinary game frames. No attack phases,
// health values, stamina values, or action progress are injected into state.
const FRAME = 1 / 60;
const EPSILON = 1e-8;
const SAFE_INPUT = Object.freeze({
  active: true, moving: false, run: false, closed: false,
  gaze: false, blocked: false, distance: 18, glasses: false,
});
const CLOSE_INPUT = Object.freeze({ distance: 1.5 });
const ACTION_SECONDS = { gate: RULES.gateSeconds, engine: RULES.engineSeconds };

function framesFor(seconds, frame, callback) {
  let remaining = seconds;
  while (remaining > EPSILON) {
    const dt = Math.min(frame, remaining);
    callback(dt);
    remaining -= dt;
  }
}

function simulate(frame = FRAME) {
  const state = createSurvival();
  const history = [];
  let time = 0;
  const step = (input = {}, dt = frame) => {
    time += dt;
    const events = updateSurvival(state, { ...SAFE_INPUT, ...input }, dt);
    for (const name of events) history.push({ name, time });
    return events;
  };
  const advance = (seconds, input = {}) => {
    const events = [];
    framesFor(seconds, frame, dt => events.push(...step(input, dt)));
    return events;
  };
  const until = (name, input = {}, timeout = 10) => {
    const deadline = time + timeout;
    while (time < deadline - EPSILON) {
      if (step(input, Math.min(frame, deadline - time)).includes(name)) return time;
    }
    assert.fail(`Expected ${name} within ${timeout}s; state=${JSON.stringify(state)}`);
  };
  return { state, history, step, advance, until, get time() { return time; } };
}

function escapeSimulation(type, game = simulate()) {
  let action = { type, duration: ACTION_SECONDS[type], elapsed: 0 };
  const results = [];
  const step = ({ distance = 1.2, enemy = {} } = {}, dt = FRAME) => {
    const events = game.step(enemy, dt);
    const next = advanceEscapeAction(action, {
      dt, distance, damaged: events.includes('hit'), dead: game.state.dead,
    });
    action = next.action;
    if (next.result !== null) results.push({ result: next.result, time: game.time });
    return { events, result: next.result };
  };
  const advance = (seconds, input = {}) => framesFor(seconds, FRAME, dt => step(input, dt));
  return { game, step, advance, results, get action() { return action; } };
}

for (const fps of [30, 60]) {
  test(`two close-range hits kill the player at ${fps} FPS`, () => {
    const game = simulate(1 / fps);
    game.until('hit', CLOSE_INPUT);
    assert.ok(game.state.health > 0 && game.state.health < 100,
      'one hit must injure a living player');
    assert.equal(game.state.dead, false);
    assert.equal(game.history.filter(e => e.name === 'hit').length, 1);
    game.until('death', CLOSE_INPUT);
    assert.equal(game.state.health, 0);
    assert.equal(game.state.dead, true);
    assert.equal(game.history.filter(e => e.name === 'hit').length, 2,
      'death must occur on the second impact');
    const deadState = structuredClone(game.state);
    assert.deepEqual(game.advance(5, CLOSE_INPUT), [],
      'a dead player must not take further attacks');
    assert.deepEqual(game.state, deadState, 'death is terminal until a new run');
  });
}

test('sprinting away during the windup makes the swing miss', () => {
  const game = simulate();
  game.until('windup', CLOSE_INPUT);
  let distance = CLOSE_INPUT.distance;
  let missed = false;
  for (let frame = 0; frame < 120 && !missed; frame++) {
    distance += movementSpeed(game.state, { run: true }) * FRAME;
    missed = game.step({ moving: true, run: true, distance }).includes('miss');
  }
  assert.equal(missed, true, 'the telegraphed swing must resolve as a miss');
  assert.equal(game.state.health, 100);
  assert.equal(game.history.some(e => e.name === 'hit'), false);
  game.advance(3, { distance });
  assert.equal(game.state.health, 100, 'the missed attack must not deal delayed damage');
});

test('a wall prevents a nearby enemy from initiating an attack', () => {
  const game = simulate();
  const events = game.advance(8, { ...CLOSE_INPUT, blocked: true, gaze: true });
  assert.equal(game.state.health, 100);
  assert.equal(game.state.sanity, 100);
  assert.equal(events.some(e => ['windup', 'swing', 'hit', 'death'].includes(e)), false);
  game.until('windup', CLOSE_INPUT, 0.2);
  game.until('hit', CLOSE_INPUT, 2);
  assert.ok(game.state.health < 100, 'removing the wall must restore the real threat');
});

test('taking cover after the windup also blocks the pending strike', () => {
  const game = simulate();
  game.until('windup', CLOSE_INPUT);
  game.until('miss', { ...CLOSE_INPUT, blocked: true }, 2);
  assert.equal(game.state.health, 100);
  assert.equal(game.history.some(e => e.name === 'hit'), false,
    'line of sight must be checked when the swing lands');
});

test('moving behind the locked swing direction avoids contact at the same distance', () => {
  const game = simulate();
  const hiddenEvents = game.advance(3, { ...CLOSE_INPUT, attackAligned: false });
  assert.equal(hiddenEvents.includes('windup'), false, 'an enemy facing away cannot begin a strike');
  game.until('windup', { ...CLOSE_INPUT, attackAligned: true });
  game.until('miss', { ...CLOSE_INPUT, attackAligned: false }, 2);
  assert.equal(game.state.health, 100, 'stepping outside the strike arc must avoid damage');
  game.until('hit', { ...CLOSE_INPUT, attackAligned: true }, 5);
  assert.ok(game.state.health < 100, 'the same range is dangerous when in front of the enemy');
});

test('closed eyes protect against an otherwise lethal gaze', () => {
  const open = simulate();
  open.until('gazeDeath', { distance: 12, gaze: true }, 6);
  assert.equal(open.state.dead, true, 'the control run proves the gaze is dangerous');

  const closed = simulate();
  const events = closed.advance(7, { distance: 12, gaze: true, closed: true });
  assert.equal(closed.state.dead, false);
  assert.equal(closed.state.health, 100);
  assert.equal(closed.state.sanity, 100);
  assert.equal(closed.state.lookCount, 0);
  assert.equal(events.includes('gazeDeath'), false);
});

test('closed eyes do not protect against the sickle', () => {
  const game = simulate();
  game.until('death', { ...CLOSE_INPUT, gaze: true, closed: true });
  assert.equal(game.state.dead, true);
  assert.equal(game.state.health, 0);
  assert.equal(game.history.filter(e => e.name === 'hit').length, 2);
  assert.equal(game.history.some(e => e.name === 'gazeDeath'), false);
  assert.equal(game.state.lookCount, 0, 'the fatal contact must not be a gaze attack');
});

test('running to exhaustion forces walking; recovery restores sprinting', () => {
  const game = simulate();
  const walk = movementSpeed(game.state);
  const sprint = movementSpeed(game.state, { run: true });
  assert.ok(sprint > walk);
  game.until('exhausted', { active: false, moving: true, run: true }, 8);
  assert.equal(game.state.stamina, 0);
  assert.equal(movementSpeed(game.state, { run: true }), walk);

  game.advance(1, { active: false, moving: true, run: true });
  assert.ok(game.state.stamina > 0, 'exhaustion must allow stamina to recover');
  assert.equal(movementSpeed(game.state, { run: true }), walk,
    'holding sprint must not bypass the exhaustion recovery period');

  game.advance(3, { active: false });
  assert.ok(game.state.stamina > 0);
  assert.equal(movementSpeed(game.state, { run: true }), sprint);
  const recoveredStamina = game.state.stamina;
  game.advance(0.5, { active: false, moving: true, run: true });
  assert.ok(game.state.stamina < recoveredStamina,
    'resumed sprinting must actually spend the recovered stamina');
});

test('a bottle interrupts an attack for 6.5 seconds, then pursuit and attacks return', () => {
  const game = simulate();
  game.until('windup', CLOSE_INPUT);
  assert.equal(canThrow({ charges: 1, distance: 1.5, blocked: false }), true);
  assert.equal(stunEnemy(game.state), true);
  const thrownAt = game.time;
  const protectedEvents = game.advance(6.49, CLOSE_INPUT);
  assert.equal(protectedEvents.includes('resumeHunt'), false);
  assert.equal(protectedEvents.includes('hit'), false);
  assert.equal(game.state.health, 100);
  assert.ok(game.state.stun > 0);

  game.advance(0.04, CLOSE_INPUT);
  const resumed = game.history.filter(e => e.name === 'resumeHunt');
  assert.equal(resumed.length, 1);
  const duration = resumed[0].time - thrownAt;
  assert.ok(duration >= 6.5 - EPSILON && duration <= 6.5 + FRAME + EPSILON,
    `bottle protection lasted ${duration}s, expected 6.5s within one frame`);
  assert.equal(game.state.stun, 0);
  game.until('windup', CLOSE_INPUT, 2);
  game.until('hit', CLOSE_INPUT, 2);
  assert.ok(game.state.health < 100, 'the bottle must not permanently remove the enemy');
});

for (const type of ['gate', 'engine']) {
  test(`${type}: leaving the work area cancels progress without delayed completion`, () => {
    const scene = escapeSimulation(type);
    scene.advance(0.75);
    assert.ok(scene.action && scene.action.elapsed > 0);
    assert.equal(scene.step({ distance: 4 }).result, 'cancelled');
    assert.equal(scene.action, null);
    scene.advance(ACTION_SECONDS[type] + 1);
    assert.deepEqual(scene.results.map(e => e.result), ['cancelled']);
  });

  test(`${type}: a real nonfatal sickle hit interrupts the work`, () => {
    const game = simulate();
    game.until('windup', CLOSE_INPUT);
    const scene = escapeSimulation(type, game);
    scene.advance(1.1, { enemy: CLOSE_INPUT });
    assert.ok(game.state.health > 0 && game.state.health < 100);
    assert.equal(game.state.dead, false);
    assert.equal(scene.action, null);
    assert.deepEqual(scene.results.map(e => e.result), ['cancelled']);
  });

  test(`${type}: gaze death interrupts the work even without an impact`, () => {
    const game = simulate();
    game.advance(4, { distance: 12, gaze: true });
    assert.equal(game.state.dead, false);
    const scene = escapeSimulation(type, game);
    scene.advance(0.6, { enemy: { distance: 12, gaze: true } });
    assert.equal(game.state.dead, true);
    assert.equal(game.history.some(e => e.name === 'hit'), false);
    assert.equal(scene.action, null);
    assert.deepEqual(scene.results.map(e => e.result), ['cancelled']);
  });

  test(`${type}: a living player must finish the whole work period exactly once`, () => {
    const scene = escapeSimulation(type);
    scene.advance(ACTION_SECONDS[type] - FRAME / 2, { distance: 2.8 });
    assert.ok(scene.action, 'work must still be pending just before the required time');
    assert.equal(scene.results.length, 0);
    assert.equal(scene.game.state.dead, false);
    assert.equal(scene.step({ distance: 2.8 }).result, type);
    assert.equal(scene.action, null);
    assert.ok(scene.game.time >= ACTION_SECONDS[type]);
    assert.ok(scene.game.time <= ACTION_SECONDS[type] + FRAME + EPSILON);
    scene.advance(1);
    assert.deepEqual(scene.results.map(e => e.result), [type]);
  });
}

const ENDING_SCENARIOS = [
  { name: 'ordinary return', flags: { phone: false }, chains: 0, expected: 'return' },
  { name: 'one completed evidence chain', flags: { phone: false }, chains: 1, expected: 'return' },
  { name: 'two completed evidence chains', flags: { phone: false }, chains: 2, expected: 'witness' },
  { name: 'answering the telephone', flags: { phone: true }, chains: 0, expected: 'voice' },
  { name: 'telephone takes priority over collected evidence', flags: { phone: true }, chains: 3, expected: 'voice' },
];

for (const { name, flags, chains, expected } of ENDING_SCENARIOS) {
  test(`surviving the gate and engine selects ${expected}: ${name}`, () => {
    const game = simulate();
    const gate = escapeSimulation('gate', game);
    gate.advance(ACTION_SECONDS.gate + FRAME);
    assert.deepEqual(gate.results.map(e => e.result), ['gate']);
    const engine = escapeSimulation('engine', game);
    engine.advance(ACTION_SECONDS.engine + FRAME);
    assert.deepEqual(engine.results.map(e => e.result), ['engine']);
    assert.equal(game.state.dead, false);
    assert.equal(endingFor(flags, chains), expected);
  });
}
