// The data of the game must pass the standard checks (schemas + cross-file checks + floor plan).
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const run = (...a) => execFileSync(process.execPath, a, { encoding: 'utf8' });
test('game data passes check-game-data', () => { assert.match(run('tools/check-game-data.mjs', '.'), /0 error/); });
test('floor plan passes check-plan --strict', () => { run('tools/check-plan.mjs', 'data/plan.json', '--strict'); assert.ok(true); });
