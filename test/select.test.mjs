// Rule W18: every interactable (doors, stations, items, documents) is easy to select: >= 85% of the reasonable approach poses, a hit region of
// >= 44 px at 1.5 m, a reach >= 1.8 m. Runs in a headless browser; skipped when there is none (CI without Edge / Chrome).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

// the checker (1.7) counts only approaches from inside a room with no wall in between. One residual: the board on the fire tower's
// platform (5.7): the platform is 3.2 m across, so no pose is further than 1.6 m from it; it selects from anywhere on the platform
const RESIDUALS = 'station:S_REFLECT';
const have = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium', process.env.BROWSER].filter(Boolean).some((p) => fs.existsSync(p));
test('select range: every interactable passes check-select-range (--preset core --strict)', { skip: !have && 'no headless browser' }, () => {
  const r = spawnSync(process.execPath, ['tools/check-select-range.mjs', '--root', '.', '--preset', 'core', '--query', 'qa=1&autostart', '--strict', ...(RESIDUALS ? ['--allow', RESIDUALS] : [])], { encoding: 'utf8', timeout: 120000 });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});
