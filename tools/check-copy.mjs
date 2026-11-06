#!/usr/bin/env node
// 文面の点検（公開の前に通す。docs/writing-style.md §7）: reads a 3D standard game's data as a director would, in play order.
// A player does not read like a robot: they keep the gist, forget the rest, and only know what the game has already shown them.
//   node tools/check-copy.mjs [game-dir] [--strict] [--json] [--sheet docs/copy-sheet.md]
// Warn only by default; --strict exits 1 (run it strict before publishing, or say in the commit why a line stays). A string can opt out with a
// game.json "copy": { "ok": ["the exact text"] }.
//   next     a required task has no meaning (なぜ) or hint (どこで)
//   place    a hint does not name a place the player can find (a room name, or 〜の壁 / 台 / 扉 ...)
//   code     an internal id in player text (D08, R03, S_TABLE, T_WIRE; a doc may show one only next to its name)
//   key      a key written so the device text cannot change it (［E］ -> [E]; 「Eキー」 -> [E], or say both ways)
//   map      nothing near the start says the map exists and how to open it (ctx.mapTip(), or a first-stage text with 地図)
//   wait     a timed task with no "bar" (the player cannot see how long), or a task that says 待つ with no timer
//   em       a task's hint / meaning has no **emphasis** (the one thing to remember is not marked)
//   em-title **emphasis** in a title (titles go to the map labels and the task list, they are marked already)
//   recap    a level has no recap, or the game has no "facts" (nothing to read again)
//   repeat   a fact's marked words appear in fewer than 3 places (said once is forgotten)
//   spoiler  game.json "copy.terms": { "word": "G03" }: the word appears in the text of an earlier stage, or of an item owned from the start
//   gloss    game.json "copy.gloss": { "差圧": "水の圧力" }: the first use of the word in play order does not explain it
//   same     two words for one thing (私 / わたし, 地図 / マップ; add yours in game.json "copy.same": [["懐中電灯", "ハンドライト"]])
//   chapter  two stages with the same chapter name
//   long     a hint / meaning sentence over 50 characters
// --sheet writes the reading sheet: every text in play order with the director's questions, to read through once before publishing.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const J = (dir, f) => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { return null; } };
const SAME = [['私', 'わたし'], ['地図', 'マップ'], ['所持品', '持ち物'], ['懐中電灯', 'ハンドライト'], ['スマートフォン', 'スマホ']];
const PLACE = /室|階段|通路|ホール|壁|台|扉|戸|棚|机|箱|窓|盤|端末|電話|ロッカー|前|奥|横|先|裏|隣|入口|出口/;
const CODE = /(?<![A-Za-z0-9-])(?:[DRST]\d{1,2}[A-Z]?|[STRD]_[A-Z0-9_]+)(?![A-Za-z0-9-])/g;
const marks = (s) => [...String(s).matchAll(/\*\*([^*\n]+)\*\*/g)].map((m) => m[1]);
const plain = (s) => String(s ?? '').replace(/\*\*/g, '');

// every text the player reads, in play order: { stage, where, text, kind } (kind: 'guide' tells what to do, 'story' is the fiction)
export function playerTexts(dir) {
  const stages = J(dir, 'data/stages.json') || {}, tasks = J(dir, 'data/tasks.json') || [], items = J(dir, 'data/items.json') || [], docs = J(dir, 'data/docs.json') || [], thingsRaw = J(dir, 'data/things.json') || [], things = Array.isArray(thingsRaw) ? thingsRaw : thingsRaw.things || [], talk = J(dir, 'data/talk.json') || {};
  const levels = stages.levels || [], list = Array.isArray(tasks) ? tasks : tasks.tasks || [], out = [];
  const add = (stage, where, text, kind = 'guide') => { if (text) out.push({ stage, where, text: String(text), kind }); };
  for (const l of levels) {
    add(l.id, `段階 ${l.id} 題`, l.title); add(l.id, `段階 ${l.id} あらすじ`, l.recap); add(l.id, `段階 ${l.id} ひとこと`, l.remind);
    for (const u of l.unlocks || []) { const x = (stages.unlocks || {})[u]; if (x) add(l.id, `解放 ${u}`, x.desc); }
    for (const t of list.filter((x) => x.stage === l.id)) {
      add(l.id, `${t.id} 題`, t.title); add(l.id, `${t.id} なぜ`, t.meaning); add(l.id, `${t.id} どこで`, t.hint);
      for (const s of t.steps || []) { add(l.id, `${t.id} 手順`, s.text); add(l.id, `${t.id} 手順`, s.body); }
      if (t.minigame && t.minigame.cfg) { add(l.id, `${t.id} 作業`, t.minigame.cfg.title); add(l.id, `${t.id} 作業`, t.minigame.cfg.help); }
    }
    for (const f of (stages.facts || []).filter((x) => x.from === l.id)) add(l.id, '覚えておくこと', f.text);
    for (const i of items.filter((x) => (x.start ? levels[0].id : x.stage) === l.id)) { add(l.id, `持ち物 ${i.id}`, i.desc); add(l.id, `持ち物 ${i.id}`, i.why); }
    for (const d of docs.filter((x) => x.stage === l.id)) add(l.id, `資料 ${d.id}`, d.text, 'story');
  }
  for (const t of things) { const at = (t.stage || (levels[0] || {}).id); add(at, `調べ物 ${t.id}`, [].concat(t.text || []).join(' '), 'story'); add(at, `調べ物 ${t.id}`, t.feeling, 'story'); }
  for (const [k, lines] of Object.entries(talk)) if (Array.isArray(lines)) for (const L of lines) add('talk', `会話 ${k}`, L.text || L.t, 'story');
  return { out, levels, list, stages, items };
}
const jsStrings = (dir) => {
  const p = path.join(dir, 'js/ext'); if (!fs.existsSync(p)) return '';
  return fs.readdirSync(p).filter((f) => /\.js$/.test(f)).map((f) => fs.readFileSync(path.join(p, f), 'utf8')).join('\n');
};

export function checkCopy(dir) {
  const hits = [], manifest = J(dir, 'game.json') || {}, cfg = manifest.copy || {}, ok = new Set(cfg.ok || []);
  const { out, levels, list, stages, items } = playerTexts(dir);
  const hit = (rule, where, msg, text = '') => { if (!ok.has(text)) hits.push({ rule, where, msg, text: plain(text).slice(0, 60) }); };
  const js = jsStrings(dir), everything = `${out.map((x) => x.text).join('\n')}\n${js}`;
  for (const t of list) {
    if (!t.optional && !t.meaning) hit('next', t.id, 'なぜやるのか（meaning）がありません');
    if (!t.optional && !t.hint) hit('next', t.id, 'どこでやるのか（hint）がありません');
    if (t.hint && !PLACE.test(plain(t.hint))) hit('place', t.id, 'hint に場所の名前がありません', t.hint);
    for (const f of ['hint', 'meaning']) {
      if (t[f] && !t[f].includes('**')) hit('em', `${t.id} ${f}`, '覚えてほしい語を **…** で示します', t[f]);
      for (const s of plain(t[f] || '').split(/[。！？\n]+/)) if ([...s].length > 50) hit('long', `${t.id} ${f}`, `${[...s].length}字の文です。二つに分けます`, s);
    }
    if (String(t.title || '').includes('**')) hit('em-title', t.id, '題に **…** は使いません（地図の札にも出ます）', t.title);
    if (t.timer && t.timer.seconds > 0 && !t.timer.bar) hit('wait', t.id, '待つ時間が見えません（timer.bar: true）', t.title);
    if (!t.timer && /待つ/.test(t.title || '')) hit('wait', t.id, '「待つ」タスクに timer がありません', t.title);
  }
  for (const x of out) {
    if (x.kind === 'guide') {
      for (const m of plain(x.text).matchAll(CODE)) hit('code', x.where, `内部の番号「${m[0]}」が見えています。名前で書きます`, x.text);
      if (/［[A-Z]］|(?<![A-Za-z])[A-Z]キー/.test(x.text)) hit('key', x.where, '［E］ は端末ごとの言いかえが効きません。[E] と書くか、キーと画面の両方を書きます', x.text);
    } else if (/(?<![A-Za-z0-9-])R\d{2}[A-Z]?(?![A-Za-z0-9-])|(?<![A-Za-z0-9])[RST]_[A-Z]/.test(x.text)) hit('code', x.where, '部屋番号など内部の名前が見えています', x.text);
  }
  for (const m of js.matchAll(/['"`]([^'"`\n]*[぀-ヿ一-鿿][^'"`\n]*)['"`]/g)) if (/［[A-Z]］/.test(m[1])) hit('key', 'js/ext', '［E］ は端末ごとの言いかえが効きません', m[1]);
  // the map near the start
  const first = levels[0] ? out.filter((x) => x.stage === levels[0].id && x.kind === 'guide').map((x) => x.text).join('\n') : '';
  if (!/mapTip\(/.test(js) && !/地図/.test(first)) hit('map', '序盤', '迷ったら地図を開くことを、開きかたと一緒に伝えます（await ctx.mapTip()）');
  // recap + facts
  for (const l of levels) if (!l.recap) hit('recap', l.id, 'あらすじ（levels[].recap）がありません', l.title);
  if (levels.length && !(stages.facts || []).length) hit('recap', 'stages.json', '覚えておくこと（facts）がありません');
  for (const f of stages.facts || []) for (const w of marks(f.text)) { const n = everything.split(w).length - 1; if (n < 3) hit('repeat', `facts ${f.from}`, `「${w}」が ${n} か所でしか言われていません（3 か所以上で、場面に合わせて言い直します）`, f.text); }
  // spoilers: a word before its stage (items owned from the start count as the first stage)
  const idx = (id) => levels.findIndex((l) => l.id === id);
  for (const [w, from] of Object.entries(cfg.terms || {})) for (const x of out) if (x.stage !== 'talk' && x.kind === 'guide' && idx(x.stage) >= 0 && idx(x.stage) < idx(from) && plain(x.text).includes(w)) hit('spoiler', x.where, `「${w}」は ${from} までは出ないはずです`, x.text);
  // words that need saying what they are, the first time
  for (const [w, g] of Object.entries(cfg.gloss || {})) { const fx = out.find((x) => x.kind === 'guide' && plain(x.text).includes(w)); if (fx && !plain(fx.text).includes(g)) hit('gloss', fx.where, `「${w}」の最初の説明に「${g}」がありません`, fx.text); }
  // one word for one thing
  for (const group of [...SAME, ...(cfg.same || [])]) { const used = group.filter((w) => everything.includes(w)); if (used.length > 1) hit('same', 'all', `同じものに二つの言葉: ${used.join(' / ')}`); }
  const names = levels.map((l) => l.name).filter(Boolean); for (const n of new Set(names.filter((x, i) => names.indexOf(x) !== i))) hit('chapter', 'stages.json', `段階の名前「${n}」が重なっています`);
  void items;
  return hits;
}

export function sheet(dir) {
  const { out, levels } = playerTexts(dir), m = J(dir, 'game.json') || {};
  const L = [`# 文面の読み合わせ表：${m.title || ''} ${m.version || ''}`, '', '上から順に、はじめて遊ぶ人のつもりで一度だけ読みます。docs/writing-style.md §7。', '', '- この段階で、次に何をして、どこへ行くかが分かりますか。', '- 強調（**…**）だけ読んで、やることが分かりますか。', '- 前の段階の説明を忘れていても、ここだけで進めますか。大事なことは場面を変えて言い直していますか。', '- まだ見ていない出来事・物の名前を先に言っていませんか。', '- はじめて出る言葉に説明がありますか。番号や記号だけになっていませんか。', '- 怖さの説明をしすぎていませんか（案内は明るく、原因は語らない）。', ''];
  for (const l of levels) { L.push(`## ${l.id} ${l.name || ''}：${plain(l.title)}`, ''); for (const x of out.filter((y) => y.stage === l.id)) L.push(`- ${x.where}：${x.text.replace(/\n/g, ' / ')}`); L.push(''); }
  return L.join('\n');
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const a = process.argv.slice(2), val = (k) => (a.includes(k) ? a[a.indexOf(k) + 1] : null);
  const dir = path.resolve(a.find((x, i) => !x.startsWith('--') && a[i - 1] !== '--sheet') || '.');
  const hits = checkCopy(dir);
  if (a.includes('--json')) console.log(JSON.stringify(hits, null, 1));
  else for (const h of hits) console.log(`[${h.rule}] ${h.where}: ${h.msg}${h.text ? `  「${h.text}」` : ''}`);
  const by = {}; for (const h of hits) by[h.rule] = (by[h.rule] || 0) + 1;
  if (!a.includes('--json')) console.log(`copy: ${hits.length} (${Object.entries(by).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}) — docs/writing-style.md §7${a.includes('--strict') ? '' : ' (warn only)'}`);
  if (val('--sheet')) { fs.mkdirSync(path.dirname(path.resolve(val('--sheet'))), { recursive: true }); fs.writeFileSync(val('--sheet'), sheet(dir)); console.log(`sheet: ${val('--sheet')}`); }
  process.exit(hits.length && a.includes('--strict') ? 1 : 0);
}
