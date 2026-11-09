// Voice audit: every spoken line against every audio file.
//   node tools/check-voices.mjs            list what is wrong (exit 1 when something is)
//   node tools/check-voices.mjs --resynth  also synthesise each line again through the local queue and compare the length (a clip made from other words is off)
//   node tools/check-voices.mjs --make     make the missing clips through the local queue (http://127.0.0.1:8765, never VOICEVOX directly)
// It looks for: (a) a speaking character's line with no voice, (b) a voice named but no file, (c) words changed after the clip was made,
// (d) a clip that is too short or nearly silent. It also lists clips nothing plays and talk keys nothing opens.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const API = 'http://127.0.0.1:8765';
const args = process.argv.slice(2), resynth = args.includes('--resynth'), make = args.includes('--make');
const VOICED = { 修司: { speaker: 53, speed: 1.03 }, 受話器の声: { speaker: 12, speed: 0.88 } };   // 受話器の声 = the dead brother, a boy's voice on a bad line
const SILENT = { 私: '主人公の声は決まりで入れない（字幕と思考の帯で読む。プレイヤー自身の声として空けておく）' };
const read = (f) => fs.readFileSync(f, 'utf8');
const json = (f) => JSON.parse(read(f));
const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 1 << 28 }).trim();
const spoken = (s) => String(s).replace(/\*/g, '').replace(/^「|」$/g, '');   // what goes to the engine: no emphasis marks, no quote marks

function wavStats(file) {
  const b = fs.readFileSync(file);
  let p = 12, fmt = null, data = null;
  while (p + 8 <= b.length) { const id = b.toString('latin1', p, p + 4), n = b.readUInt32LE(p + 4); if (id === 'fmt ') fmt = { ch: b.readUInt16LE(p + 10), rate: b.readUInt32LE(p + 12), bits: b.readUInt16LE(p + 22) }; if (id === 'data') data = [p + 8, Math.min(n, b.length - p - 8)]; p += 8 + n + (n & 1); }
  if (!fmt || !data || fmt.bits !== 16) return null;
  const count = Math.floor(data[1] / 2), win = Math.floor(fmt.rate * fmt.ch * 0.02); let peak = 0, sum = 0, loud = 0, wins = 0, ws = 0, wn = 0;
  for (let i = 0; i < count; i++) { const v = b.readInt16LE(data[0] + i * 2) / 32768; peak = Math.max(peak, Math.abs(v)); sum += v * v; ws += v * v; if (++wn === win) { wins++; if (Math.sqrt(ws / wn) > 0.01) loud++; ws = 0; wn = 0; } }
  const db = (x) => (x > 0 ? 20 * Math.log10(x) : -120);
  return { sec: count / fmt.ch / fmt.rate, peak: db(peak), rms: db(Math.sqrt(sum / Math.max(1, count))), voiced: wins ? loud / wins : 0, rate: fmt.rate };
}

// ---- every line that is spoken
const talk = json('data/talk.json'), lines = [];
for (const [key, list] of Object.entries(talk)) list.forEach((L, i) => { if (L.text != null) lines.push({ src: `talk.${key}[${i}]`, key, who: L.who, text: L.text, voice: L.voice || null, vfx: L.vfx || null }); });
const story = read('js/ext/story.js');
const guideBlock = story.match(/const GUIDE = \{([\s\S]*?)\n\s*\};/)[1];
lines.push({ src: 'radio-dial', key: 'dial', who: '修司', text: '聞こえるか', voice: 'assets/audio/uncle-dial.wav' });
for (const m of guideBlock.matchAll(/(\w+):\s*'([^']+)'/g)) lines.push({ src: `GUIDE.${m[1]}`, key: `guide:${m[1]}`, who: '修司', text: m[2], voice: `assets/audio/guide-${m[1]}.wav`, guide: m[1] });

const problems = { a: [], b: [], c: [], d: [] }, excluded = [], rows = [];
// (c) the words the clip was made from: the record of the clip, or the talk.json of the commit that added it
const commitOf = (f) => { try { return git('log', '-1', '--format=%H', '--', f); } catch { return ''; } };
const talkAt = new Map();
const talkFrom = (c) => { if (!talkAt.has(c)) { try { talkAt.set(c, JSON.parse(git('show', `${c}:data/talk.json`))); } catch { talkAt.set(c, null); } } return talkAt.get(c); };
function madeFrom(L) {
  if (L.guide) { const f = `tools/local-media-records/voice-${L.guide}.json`; return fs.existsSync(f) ? { text: json(f).text, how: '制作記録' } : null; }
  const c = commitOf(L.voice); if (!c) return null;
  const old = talkFrom(c); if (!old) return null;
  const hit = Object.values(old).flat().find((x) => x.voice === L.voice);
  return hit ? { text: hit.text, how: `commit ${c.slice(0, 7)}` } : null;
}
const usedFiles = new Set();
for (const L of lines) {
  const r = { ...L, state: 'ok', note: '' }; rows.push(r);
  if (L.voice) usedFiles.add(path.basename(L.voice));
  if (SILENT[L.who] && !L.voice) { r.state = 'silent'; excluded.push(L); continue; }
  if (!L.voice) { r.state = 'a'; r.note = '声なし'; problems.a.push(r); continue; }
  if (!fs.existsSync(L.voice)) { r.state = 'b'; r.note = 'ファイルなし'; problems.b.push(r); continue; }
  const was = madeFrom(L);
  if (was && spoken(was.text) !== spoken(L.text)) { r.state = 'c'; r.note = `録音時の文（${was.how}）: ${was.text}`; problems.c.push(r); }
  const w = wavStats(L.voice);
  if (!w) { r.state = 'd'; r.note = 'wav を読めない'; problems.d.push(r); continue; }
  Object.assign(r, { sec: w.sec, peak: w.peak, rms: w.rms, voicedPart: w.voiced });
  const chars = spoken(L.text).length;
  if (w.sec < 0.6 || w.rms < -45 || w.voiced < 0.25) { r.state = r.state === 'ok' ? 'd' : r.state; r.note += ` 無音に近い（${w.sec.toFixed(2)}秒 / rms ${w.rms.toFixed(0)}dB / 有音 ${(w.voiced * 100).toFixed(0)}%）`; problems.d.push(r); }
  r.secPerChar = w.sec / chars;
}

// lines the protagonist or the uncle says outside the talk windows (thought band): only the GUIDE strings are clips
const sayQuotes = [...story.matchAll(/say\((`|')([^`']*修司[^`']*)\1/g)].map((m) => m[2]);

// nothing plays it
const allFiles = fs.readdirSync('assets/audio').filter((f) => /\.(wav|mp3|ogg)$/.test(f));
const orphans = allFiles.filter((f) => !usedFiles.has(f) && !/^music-/.test(f));
// nothing opens it
const code = read('js/ext/story.js') + read('js/ext/gaze.js') + ['tasks', 'stages', 'items', 'docs', 'monsters', 'things'].map((n) => read(`data/${n}.json`)).join('');
const dyn = (k) => /^after_/.test(k) || /^chain_/.test(k);
const unusedKeys = Object.keys(talk).filter((k) => !dyn(k) && !new RegExp(`(['"\`.])${k}\\1|T\\.${k}\\b`).test(code));

// ---- --resynth: the same words through the queue; a very different length means different words
async function job(params) {
  const post = await fetch(`${API}/v1/jobs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'voice', params }) }).then((r) => r.json());
  const id = post.id || post.job?.id; if (!id) throw new Error(`no job id: ${JSON.stringify(post).slice(0, 200)}`);
  for (;;) {
    const j = await fetch(`${API}/v1/jobs/${id}`).then((r) => r.json());
    if (j.status === 'done') { const bytes = Buffer.from(await fetch(`${API}/v1/jobs/${id}/files/0`).then((r) => r.arrayBuffer())); await fetch(`${API}/v1/jobs/${id}`, { method: 'DELETE' }).catch(() => {}); return bytes; }
    if (j.status === 'failed' || j.status === 'deleted') throw new Error(`job ${j.status}: ${j.error}`);
    await new Promise((r) => setTimeout(r, 800));
  }
}
const tmp = path.join(process.env.TEMP || '.', `jashi-voice-${process.pid}.wav`);
if (resynth) {
  for (const r of rows) {
    if (!r.voice || !r.sec || !VOICED[r.who]) continue;
    fs.writeFileSync(tmp, await job({ text: spoken(r.text), ...VOICED[r.who] }));
    const w = wavStats(tmp); r.fresh = w ? w.sec : null;
    if (r.fresh && Math.abs(r.sec - r.fresh) > Math.max(0.6, r.fresh * 0.12)) { r.state = r.state === 'ok' ? 'c' : r.state; r.note += ` 長さが合わない（録音 ${r.sec.toFixed(2)}秒 / 今の文 ${r.fresh.toFixed(2)}秒）`; problems.c.push(r); }
    process.stdout.write('.');
  }
  fs.rmSync(tmp, { force: true }); console.log('');
}
if (make) {
  for (const r of problems.a.concat(problems.b)) {
    const p = VOICED[r.who]; if (!p) continue;
    const key = r.src.replace(/^talk\./, '').replace(/\[(\d+)\]/, '-$1');
    const file = r.voice || `assets/audio/${r.who === '修司' ? `uncle-${key}` : `phone-${r.src.match(/\[(\d+)\]/)[1]}`}.wav`;
    fs.writeFileSync(file, await job({ text: spoken(r.text), ...p }));
    const w = wavStats(file); console.log(`made ${file} ${w ? w.sec.toFixed(2) + 's' : '?'}`);
  }
}

// ---- report
const fmt = (x, d = 2) => (x == null ? '-' : x.toFixed(d));
const out = ['# 音声の点検', '', `台詞 ${rows.length} 行（声あり ${rows.filter((r) => r.voice).length} / 声なしの決まり ${excluded.length}） 音声ファイル ${allFiles.length}`, ''];
for (const [k, title] of [['a', '(a) 声のある人物なのに voice が無い'], ['b', '(b) 指定があるのにファイルが無い'], ['c', '(c) 文章と音声が食い違う'], ['d', '(d) 無音に近い']]) { out.push(`## ${title}: ${problems[k].length}`); for (const r of problems[k]) out.push(`- ${r.src} ${r.who}「${r.text}」 ${r.note}`); out.push(''); }
out.push(`## 声なしで除外: ${excluded.length}`, ...Object.entries(SILENT).map(([w, why]) => `- ${w}: ${why}`), '');
out.push(`## 何も鳴らさないファイル: ${orphans.length}`, ...orphans.map((f) => `- ${f}`), '');
out.push(`## 何も開かない talk のキー: ${unusedKeys.length}`, ...unusedKeys.map((k) => `- ${k}: ${talk[k].map((l) => l.who).join('・')}`), '');
out.push(`## 物語の字幕で修司の名が出る行（GUIDE 以外）: ${sayQuotes.filter((s) => !/GUIDE/.test(s)).length}`, ...sayQuotes.map((s) => `- ${s}`), '');
out.push('## 全部の声', '', '| 場所 | 人 | 秒 | 秒/字 | 今の文で作った秒 | ピーク | RMS | 有音 | 状態 |', '|---|---|---|---|---|---|---|---|---|');
for (const r of rows.filter((x) => x.voice)) out.push(`| ${r.src} | ${r.who} | ${fmt(r.sec)} | ${fmt(r.secPerChar, 3)} | ${fmt(r.fresh)} | ${fmt(r.peak, 1)} | ${fmt(r.rms, 1)} | ${r.voicedPart == null ? '-' : Math.round(r.voicedPart * 100) + '%'} | ${r.state} |`);
fs.mkdirSync('shots', { recursive: true });
fs.writeFileSync('shots/voice-audit.md', out.join('\n') + '\n');
console.log(out.slice(0, out.indexOf('## 全部の声')).join('\n'));
const total = problems.a.length + problems.b.length + problems.c.length + problems.d.length;
console.log(`voices: ${total} problem(s) -> shots/voice-audit.md`);
process.exit(total ? 1 : 0);
