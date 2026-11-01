// UI hygiene of the game's own sources (standard 3D, rules U24 / U29 / U30): no emoji, every background of the game's CSS comes with its text colour,
// and (with a browser) every visible text is AA.  The checks are the kit's tools (tools/check-*.mjs, docs/text-contrast.md, docs/writing-style.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const run = (...a) => {
  try { return execFileSync(process.execPath, a, { encoding: 'utf8', timeout: 540000 }); }
  catch (error) { throw new Error([error.message, error.stdout, error.stderr].filter(Boolean).join('\n'), { cause: error }); }
};
test('no emoji in the UI sources (U24)', () => { assert.match(run('tools/check-no-emoji.mjs', 'js', 'css', 'data', 'game.json', 'index.html', '--skip-story'), /no emoji/); });
test('the game CSS sets no background without its paired text colour (U30)', () => {
  const files = ['css/theme-game.css', 'css/ext.css'].filter((f) => fs.existsSync(f));
  if (files.length) assert.match(run('tools/check-css-pairs.mjs', ...files), /comes with its text colour/);
});
test('wording lint runs (U29, warn only)', () => { console.log(run('tools/check-wording.mjs', 'js', 'data', '--skip-story').trim().split('\n').slice(-3).join('\n')); });
const EXES = [process.env.BROWSER, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean);
const SKIP = !process.env.GF_NO_BROWSER && EXES.some((b) => fs.existsSync(b)) ? false : 'no Edge / Chrome (or GF_NO_BROWSER=1)';
test('every visible text is AA on a phone and a desktop (U30, computed from the rendered pixels)', { skip: SKIP, timeout: 600000 }, () => {
  const out = run('tools/check-text-contrast.mjs', 'index.html', '--hooks', 'tools/contrast-hooks/std.mjs', '--viewport', '390x844,1920x1080', '--warn');
  assert.match(out, /, 0 below AA/, out.split('\n').filter((l) => /FAIL|below AA \(/.test(l)).slice(0, 8).join('\n'));
});
