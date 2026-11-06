#!/usr/bin/env node
// Writes the README's 「テスト用の場面リンク」 section from js/ext/test-scenes.js (export const SCENES; standard 1.12), between two marker comments.
//   node tools/scene-links.mjs [--local http://localhost:8000/]    write README.md
//   node tools/scene-links.mjs --check                            exit 1 when README.md is out of date
// The live address comes from site.json "domain". A game without js/ext/test-scenes.js: nothing to do.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

// Without that file (standard 1.13): one link per stage (?scene=stage:<id>, js/test-scenes.js) from data/stages.json, unless the game keeps its own state in a host (js/ext/host.js).
const file = path.resolve('js/ext/test-scenes.js');
let SCENES = null;
if (existsSync(file)) ({ SCENES } = await import(pathToFileURL(file).href));
else if (existsSync('js/ext/host.js') || !existsSync('data/stages.json')) { console.log('no js/ext/test-scenes.js and no plain stages: no scene links'); process.exit(0); }
else SCENES = (JSON.parse(readFileSync('data/stages.json', 'utf8')).levels || []).map((l, i) => ({ id: `stage:${l.id}`, group: '段階の頭', label: `${i + 1}. ${l.title || l.name || l.id}` }));
if (!SCENES.length) { console.log('no scenes'); process.exit(0); }
const args = process.argv.slice(2), at = args.indexOf('--local');
const LOCAL = at >= 0 ? args[at + 1] : 'http://localhost:8000/';
let domain = ''; try { domain = JSON.parse(readFileSync('site.json', 'utf8')).domain || ''; } catch { /* no site.json */ }
const LIVE = domain ? `https://${domain}/` : '';
const A = '<!-- scene-links:start -->', B = '<!-- scene-links:end -->';

const lines = [A, '## テスト用の場面リンク', '',
  '`?scene=<id>` を付けて開くと、テストモードでその場面から始まります（前の作業は済んだことになり、会話は飛ばします）。',
  'テストモードではセーブを書かず、消しもしません（画面の上に「テストモード」の札が出ます）。`?test` だけを付けると、最初からテストモードで遊べます。',
  '知らない id のときは最初から始まります。場面の一覧は `js/ext/test-scenes.js`、この表は `node tools/scene-links.mjs` で作り直します。', ''];
let group = null;
for (const s of SCENES) {
  if (s.group !== group) {
    group = s.group;
    lines.push('', `### ${group || '場面'}`, '', LIVE ? '| 場面 | 公開版 | 手元 (npm run serve) |' : '| 場面 | 手元 (npm run serve) |', LIVE ? '|---|---|---|' : '|---|---|');
  }
  lines.push(LIVE ? `| ${s.label} | [${s.id}](${LIVE}?scene=${s.id}) | [local](${LOCAL}?scene=${s.id}) |` : `| ${s.label} | [${s.id}](${LOCAL}?scene=${s.id}) |`);
}
lines.push('', B);
const block = lines.join('\n');

const readme = existsSync('README.md') ? readFileSync('README.md', 'utf8') : '';
const eol = readme.includes('\r\n') ? '\r\n' : '\n';
const body = readme.replace(/\r\n/g, '\n');
const next = body.includes(A) ? body.replace(new RegExp(`${A}[\\s\\S]*?${B}`), () => block) : body.replace(/\n*$/, `\n\n${block}\n`);
if (args.includes('--check')) {
  if (next !== body) { console.error('README.md: the scene links are out of date (node tools/scene-links.mjs)'); process.exit(1); }
  console.log(`scene links OK (${SCENES.length})`);
} else {
  writeFileSync('README.md', next.replace(/\n/g, eol));
  console.log(`README.md: ${SCENES.length} scene links`);
}
