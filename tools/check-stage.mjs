// Stage gate for a standard 3D game (docs/build-order.md): checks that each design stage is finished before the next one starts, so a late
// stage does not send the work back (a room renamed after the photos were made, a task without meaning found at release, ...).
//   node tools/check-stage.mjs [<game-dir>=.] [--stage N | --upto N] [--tools] [--report] [--json]
//   --upto N   (default 7) check stages 0..N;  --stage N  only stage N
//   --tools    also run the game's own check tools of those stages (tools/check-plan.mjs --strict, check-game-data, check-no-emoji, ...)
//   --report   write docs/stage-report.md in the game (the table below, for the spec review)
// Exit 1 when a check of the chosen stages fails (warnings do not fail). Static: no browser, no network; Node 22+, no packages.
// Stages: 0 企画  1 物語・結末  2 地図  3 素材  4 仕掛け・ミニゲーム  5 組み立て  6 磨き  7 公開
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const STAGES = ['企画', '物語・結末', '地図', '素材', '仕掛け・ミニゲーム', '組み立て', '磨き', '公開'];
const HERE = path.dirname(fileURLToPath(import.meta.url));
const NARRATORS = new Set(['私', '僕', '俺', '主人公', 'わたし', 'ぼく', '']);
const PLACEHOLDER = /(^|\/)(brief-[^/]*|placeholder[^/]*|dummy[^/]*|todo[^/]*)$/i;

const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const list = (v) => (Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v).find(Array.isArray) || [] : []);
const ver = (s) => String(s || '').split('.').map(Number);
const older = (a, b) => { const x = ver(a), y = ver(b); for (let i = 0; i < 2; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0); return false; };

/** the kit's mini game types: task-minigames TYPES + the library (read as text: those modules need a DOM) */
export function kitMinigameTypes(dir) {
  const types = new Set();
  for (const base of [path.join(HERE, '..', 'js'), path.join(dir, 'js', 'kit')]) {
    const tm = path.join(base, 'task-minigames.js'), lib = path.join(base, 'mg-library.js');
    if (fs.existsSync(tm)) { const m = fs.readFileSync(tm, 'utf8').match(/export const TYPES = \[([^\]]*)\]/); if (m) for (const t of m[1].matchAll(/["']([\w-]+)["']/g)) types.add(t[1]); }
    if (fs.existsSync(lib)) for (const t of fs.readFileSync(lib, 'utf8').matchAll(/\btype: '([\w-]+)'/g)) types.add(t[1]);
  }
  return types;
}
/** the kit's standard version (CORE_VERSION of game-core.js), from the kit next to this tool or the game's js/kit */
export function kitStandard(dir) {
  for (const f of [path.join(HERE, '..', 'js', 'game-core.js'), path.join(dir, 'js', 'kit', 'game-core.js')]) {
    if (!fs.existsSync(f)) continue; const m = fs.readFileSync(f, 'utf8').match(/CORE_VERSION = '([\d.]+)'/); if (m) return m[1];
  }
  return null;
}

/** read a game folder into one object (missing files are null) */
export function loadGame(dir) {
  const game = readJson(path.join(dir, 'game.json')) || null, files = (game && game.data) || {};
  const d = (k, def) => readJson(path.join(dir, files[k] || def));
  return {
    dir, game, site: readJson(path.join(dir, 'site.json')), pkg: readJson(path.join(dir, 'package.json')), firebase: readJson(path.join(dir, 'firebase.json')),
    plan: d('plan', 'data/plan.json'), items: list(d('items', 'data/items.json')), docs: list(d('docs', 'data/docs.json')), tasks: list(d('tasks', 'data/tasks.json')),
    stages: d('stages', 'data/stages.json'), endings: list(d('endings', 'data/endings.json')), notes: d('releaseNotes', 'data/release-notes.json'),
    talk: d('talk', 'data/talk.json'), things: list(d('things', 'data/things.json')),
  };
}
/** every line of talk.json ({ key: [lines] | { lines } | "text" }) */
export const talkLines = (talk) => Object.values(talk || {}).flatMap((v) => (Array.isArray(v) ? v : v && Array.isArray(v.lines) ? v.lines : [])).filter((l) => l && typeof l === 'object');
/** every media path the data names, with where it is named */
export function mediaRefs(g) {
  const out = [], add = (p, at) => { if (typeof p === 'string' && p && !/^(https?:|data:)/.test(p)) out.push({ path: p.replace(/^\//, ''), at }); };
  for (const [k, a] of [['items', g.items], ['docs', g.docs], ['endings', g.endings], ['things', g.things]]) for (const x of a) add(x.photo, `${k}:${x.id}`);
  for (const l of talkLines(g.talk)) add(l.img, `talk:${l.who || ''}`);
  for (const [who, p] of Object.entries((g.game && g.game.portraits) || {})) add(p, `portrait:${who}`);
  if (g.game) add(g.game.titleImage, 'game.titleImage');
  return out;
}
/** the unfilled items of docs/brief.md: a "- 項目：" line with nothing after it (section 7 「決めないこと」 is free) */
export const briefBlanks = (md) => md.split(/^## 7/m)[0].split('\n').filter((l) => /^- [^：]+：\s*$/.test(l)).map((l) => l.slice(2, -1).trim().replace(/：$/, ''));
const exists = (dir, p) => [p, path.join('public', p)].some((q) => fs.existsSync(path.join(dir, q)));

/** run the checks of the stages in `only` (array of numbers); returns [{ stage, id, level: 'ok'|'warn'|'fail', msg }] */
export function checkStages(dir, { only = [0, 1, 2, 3, 4, 5, 6, 7] } = {}) {
  const g = loadGame(dir), out = [], want = new Set(only);
  const put = (stage, id, okv, msg, level = 'fail') => want.has(stage) && out.push({ stage, id, level: okv ? 'ok' : level, msg });
  const rooms = new Set(((g.plan && g.plan.rooms) || []).map((r) => r.id)), stations = new Set(((g.plan && g.plan.stations) || []).map((s) => s.id));
  const fmt = (a, n = 4) => a.slice(0, n).join('、') + (a.length > n ? ` ほか${a.length - n}件` : '');

  // S0 企画: what is being made, written down before anything is built
  const G = g.game || {};
  put(0, 'S0.game', g.game && G.id && G.title && G.subtitle && G.version, 'game.json に id・title・subtitle・version がある');
  const std = kitStandard(dir);
  put(0, 'S0.standard', !std || !G.standard || !older(G.standard, std), `標準の版が今のキット（${std || '不明'}）と同じ（game.json standard ${G.standard || 'なし'}）`, 'warn');
  put(0, 'S0.brief', ['docs/brief.md', 'docs/spec-review.md', 'creation-brief.json'].some((f) => fs.existsSync(path.join(dir, f))), '企画メモがある（docs/brief.md。templates/specification.md を写して埋める）');
  const briefFile = path.join(dir, 'docs', 'brief.md'), blanks = fs.existsSync(briefFile) ? briefBlanks(fs.readFileSync(briefFile, 'utf8')) : [];
  put(0, 'S0.briefFilled', !blanks.length, `企画メモの項目が埋まっている${blanks.length ? `（空き：${fmt(blanks, 3)}）` : ''}`);
  put(0, 'S0.site', g.site && g.site.name && g.site.description, 'site.json に作品名と紹介文がある（題名と一行の売りを先に決める）', 'warn');

  // S1 物語・結末: the story is fixed before the map, the pictures and the puzzles depend on it
  put(1, 'S1.endings', g.endings.length > 0, '結末が1つ以上ある');
  const thin = g.endings.filter((e) => !(e.title && e.kicker && e.text)).map((e) => e.id);
  put(1, 'S1.endingText', !thin.length, `どの結末にも title・kicker・text がある${thin.length ? `（不足：${fmt(thin)}）` : ''}`);
  put(1, 'S1.goodEnding', !g.endings.length || g.endings.some((e) => e.kind !== 'bad'), 'bad 以外の結末が少なくとも1つある', 'warn');
  const opening = g.talk && g.talk.opening, openLines = Array.isArray(opening) ? opening : (opening && opening.lines) || [];
  put(1, 'S1.opening', openLines.length > 0, '導入の語り（talk.json の opening）がある：ここはどこ・自分は誰・何をしに来たか（O-01）');
  const noImg = openLines.filter((l) => typeof l === 'object' && !l.img).length;
  put(1, 'S1.openingImg', !openLines.length || !noImg, `導入の各行に絵（img）がある（A6）${noImg ? `（${noImg}行なし）` : ''}`, 'warn');
  const noMeaning = g.tasks.filter((t) => !t.meaning).map((t) => t.id), noHint = g.tasks.filter((t) => !t.hint).map((t) => t.id);
  put(1, 'S1.taskMeaning', !noMeaning.length, `どの作業にも意味（meaning）がある（F4）${noMeaning.length ? `（不足：${fmt(noMeaning)}）` : ''}`);
  put(1, 'S1.taskHint', !noHint.length, `どの作業にも手がかり（hint）がある（G-03）${noHint.length ? `（不足：${fmt(noHint)}）` : ''}`, 'warn');
  put(1, 'S1.docs', g.docs.length >= 3, `読み物が3つ以上ある（F7、いま${g.docs.length}）`, 'warn');
  const noWhy = g.items.filter((i) => !(i.why || i.desc)).map((i) => i.id);
  put(1, 'S1.itemWhy', !noWhy.length, `持ち物に何のための物か（why / desc）がある（I-06）${noWhy.length ? `（不足：${fmt(noWhy)}）` : ''}`, 'warn');
  const speakers = [...new Set(talkLines(g.talk).map((l) => l.who).filter((w) => w && !NARRATORS.has(w)))], portraits = G.portraits || {};
  const noFace = speakers.filter((w) => !portraits[w]);
  put(1, 'S1.speakers', !noFace.length, `話す人に顔写真（game.json portraits）が決まっている（A8）${noFace.length ? `（未定：${fmt(noFace)}）` : ''}`, 'warn');

  // S2 地図: rooms, stations and doors are fixed before textures, photos of places and the puzzle stations
  put(2, 'S2.plan', rooms.size > 0, 'data/plan.json に部屋がある');
  put(2, 'S2.start', !!(g.plan && g.plan.start && (rooms.has(g.plan.start) || typeof g.plan.start === 'object')), '開始位置（plan.start）がある部屋を指している');
  const roomRefs = [...g.tasks, ...g.items, ...g.docs, ...g.things].filter((x) => x.room && !rooms.has(x.room)).map((x) => `${x.id}→${x.room}`);
  put(2, 'S2.rooms', !roomRefs.length, `作業・持ち物・資料・調べる物の部屋が地図にある${roomRefs.length ? `（ない：${fmt(roomRefs)}）` : ''}`);
  const stRefs = g.tasks.filter((t) => t.station && !stations.has(t.station)).map((t) => `${t.id}→${t.station}`);
  put(2, 'S2.stations', !stRefs.length, `作業の場所（station）が地図の stations にある${stRefs.length ? `（ない：${fmt(stRefs)}）` : ''}`);
  const bare = ((g.plan && g.plan.rooms) || []).filter((r) => !r.type && !(r.floorTex && r.wallTex) && !['corridor', 'outdoor', 'road', 'yard'].includes(r.kind)).map((r) => r.id);
  put(2, 'S2.surfaces', !bare.length, `部屋ごとに床・壁（floorTex / wallTex か type）が決まっている（W1）${bare.length ? `（未定：${fmt(bare)}）` : ''}`, 'warn');

  // S3 素材: every picture the data names exists and none is a stand-in
  const refs = mediaRefs(g), missing = refs.filter((r) => !exists(dir, r.path)), stand = refs.filter((r) => PLACEHOLDER.test(r.path));
  put(3, 'S3.files', !missing.length, `データが指す画像がすべてある${missing.length ? `（ない：${fmt(missing.map((r) => `${r.at} ${r.path}`), 3)}）` : ''}`);
  put(3, 'S3.noStandIn', !stand.length, `仮画像（brief-* など）が残っていない${stand.length ? `（${fmt(stand.map((r) => r.path), 3)}）` : ''}`);
  const noPhoto = g.endings.filter((e) => !e.photo).map((e) => e.id);
  put(3, 'S3.endingPhoto', !noPhoto.length, `どの結末にも写真がある${noPhoto.length ? `（なし：${fmt(noPhoto)}）` : ''}`);
  const facesMissing = speakers.filter((w) => portraits[w] && !exists(dir, String(portraits[w]).replace(/^\//, '')));
  put(3, 'S3.portraits', !facesMissing.length, `顔写真のファイルがある（A8）${facesMissing.length ? `（ない：${fmt(facesMissing)}）` : ''}`);

  // S4 仕掛け・ミニゲーム: every task can be played, at a place, in a stage that exists
  const known = kitMinigameTypes(dir); for (const t of G.minigames || []) known.add(typeof t === 'string' ? t : t && t.type);
  const unknown = g.tasks.filter((t) => t.minigame && t.minigame.type && !known.has(t.minigame.type)).map((t) => `${t.id}:${t.minigame.type}`);
  put(4, 'S4.mgType', !unknown.length, `作業のミニゲームの種類がキットか game.json minigames にある${unknown.length ? `（ない：${fmt(unknown)}）` : ''}`);
  const noTitle = g.tasks.filter((t) => t.minigame && !(t.minigame.cfg && t.minigame.cfg.title)).map((t) => t.id);
  put(4, 'S4.mgTitle', !noTitle.length, `ミニゲームに作品の言葉の題（cfg.title）がある${noTitle.length ? `（なし：${fmt(noTitle)}）` : ''}`, 'warn');
  const noStation = g.tasks.filter((t) => t.minigame && !t.station).map((t) => t.id);
  put(4, 'S4.station', !noStation.length, `ミニゲームのある作業に場所（station）がある（G1：見える台・道具の前で遊ぶ）${noStation.length ? `（なし：${fmt(noStation)}）` : ''}`);
  const levels = new Set(list(g.stages && g.stages.levels).map((l) => l.id));
  const badStage = levels.size ? [...g.tasks, ...g.items, ...g.docs].filter((x) => x.stage && !levels.has(x.stage)).map((x) => `${x.id}→${x.stage}`) : [];
  put(4, 'S4.stages', !badStage.length, `作業・持ち物・資料の段階（stage）が stages.json にある${badStage.length ? `（ない：${fmt(badStage)}）` : ''}`);
  const taskIds = new Set(g.tasks.map((t) => t.id)), badReq = g.endings.flatMap((e) => ((e.requires && e.requires.tasks) || []).filter((t) => !taskIds.has(t)).map((t) => `${e.id}→${t}`));
  put(4, 'S4.endingReq', !badReq.length, `結末の条件の作業が tasks.json にある${badReq.length ? `（ない：${fmt(badReq)}）` : ''}`);

  // S5 組み立て: the game runs, is tested, and says what changed
  const sc = (g.pkg && g.pkg.scripts) || {};
  put(5, 'S5.scripts', sc.test && sc.check, 'package.json に test と check がある');
  put(5, 'S5.smoke', sc.smoke || sc.selftest, 'package.json に smoke（通しプレイ）か selftest がある', 'warn');
  const tests = fs.existsSync(path.join(dir, 'test')) ? fs.readdirSync(path.join(dir, 'test')).filter((f) => /\.test\.mjs$/.test(f)) : [];
  put(5, 'S5.tests', tests.length > 0, `test/*.test.mjs がある（いま${tests.length}）`);
  const top = g.notes && (g.notes.version || (list(g.notes)[0] || {}).version);
  put(5, 'S5.notes', !!top && top === G.version, `更新情報の最新の版（${top || 'なし'}）が game.json の版（${G.version || 'なし'}）と同じ（Q3）`);

  // S6 磨き: the look and the words (the tools themselves run with --tools)
  put(6, 'S6.contrast', sc['check:contrast'], 'package.json に check:contrast（文字の読みやすさ、PC・スマホ幅）がある', 'warn');
  put(6, 'S6.mobile', sc['smoke:mobile'], 'package.json に smoke:mobile（スマホ幅の通しプレイ）がある', 'warn');
  put(6, 'S6.emoji', sc['check:emoji'] || fs.existsSync(path.join(dir, 'tools', 'check-no-emoji.mjs')), '絵文字の検査（check-no-emoji）を使える', 'warn');

  // S7 公開: the site, the store page and the review
  const S = g.site || {};
  put(7, 'S7.site', S.name && S.domain && S.firebaseProject, `site.json に name・domain・firebaseProject がある（A4）`);
  put(7, 'S7.ga', /^G-[A-Z0-9]+$/.test(S.gaId || ''), 'site.json の gaId が GA4 の測定ID（G-…）', 'warn');
  const dl = [...String(S.description || '')].length;
  put(7, 'S7.description', dl >= 50 && dl <= 200, `紹介文が50〜200字（検索結果と共有に出る。いま${dl}字）`, 'warn');
  put(7, 'S7.ogImage', S.ogImage && ['', 'assets/'].some((d) => exists(dir, d + String(S.ogImage).replace(/^\//, '')))   /* build-site copies assets/og-image.png to the site root */, `共有画像（site.json ogImage ${S.ogImage || 'なし'}）がある（npm run og）`);
  put(7, 'S7.firebase', g.firebase && g.firebase.hosting && g.firebase.hosting.public, 'firebase.json に hosting.public がある');
  put(7, 'S7.build', sc.build, 'package.json に build（公開用のフォルダを作る）がある');
  put(7, 'S7.review', fs.existsSync(path.join(dir, 'docs', 'spec-review.md')), '公開前の点検 docs/spec-review.md がある（ルールごとの合否）');
  put(7, 'S7.feedback', fs.existsSync(path.join(dir, 'docs', 'kit-feedback.md')), 'キットへの要望 docs/kit-feedback.md がある（標準にできそうな物を書き残す）', 'warn');
  return out;
}

/** the game's own tools of the chosen stages (only those the game has); returns [{ stage, id, level, msg }] */
export function runStageTools(dir, only) {
  const T = (f) => path.join(dir, 'tools', f), out = [];
  const jobs = [
    [2, 'S2.checkPlan', 'check-plan.mjs', ['data/plan.json', '--strict'], 'fail'],
    [4, 'S4.checkData', 'check-game-data.mjs', ['.'], 'fail'],
    [3, 'S3.checkMedia', 'check-game-data.mjs', ['.', '--media'], 'fail'],
    [6, 'S6.noEmoji', 'check-no-emoji.mjs', ['js', 'css', 'data', 'game.json', 'index.html', '--skip-story'], 'fail'],
    [6, 'S6.cssPairs', 'check-css-pairs.mjs', ['css/theme-game.css'], 'warn'],
    [6, 'S6.wording', 'check-wording.mjs', ['js', 'data', '--skip-story', '--strict'], 'warn'],
  ];
  for (const [stage, id, tool, args, level] of jobs) {
    if (!only.includes(stage) || !fs.existsSync(T(tool))) continue;
    const r = spawnSync(process.execPath, [T(tool), ...args.filter((a) => a.startsWith('-') || a === '.' || fs.existsSync(path.join(dir, a)))], { cwd: dir, encoding: 'utf8', timeout: 120000 });
    const tail = `${r.stdout || ''}${r.stderr || ''}`.trim().split('\n').filter(Boolean).slice(-1)[0] || '';
    out.push({ stage, id, level: r.status === 0 ? 'ok' : level, msg: `tools/${tool} ${args.join(' ')}${r.status === 0 ? '' : ` → ${tail.slice(0, 160)}`}` });
  }
  return out;
}

const MARK = { ok: '合格', warn: '注意', fail: '不合格' };
export function reportMarkdown(results, { title = '', date = new Date().toISOString().slice(0, 10) } = {}) {
  const lines = [`# 段階の点検${title ? `：${title}` : ''}`, '', `${date}、\`node tools/check-stage.mjs\`（game-kit docs/build-order.md）。不合格が残る段階は、次の段階へ進まない。`, ''];
  for (const s of [...new Set(results.map((r) => r.stage))].sort()) {
    const rs = results.filter((r) => r.stage === s), f = rs.filter((r) => r.level === 'fail').length, w = rs.filter((r) => r.level === 'warn').length;
    lines.push(`## S${s} ${STAGES[s]}（${f ? `不合格 ${f}` : '合格'}${w ? `・注意 ${w}` : ''}）`, '', '| 項目 | 判定 | 内容 |', '|---|---|---|');
    for (const r of rs) lines.push(`| ${r.id} | ${MARK[r.level]} | ${r.msg.replace(/\|/g, '｜')} |`);
    lines.push('');
  }
  return lines.join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2), flag = (n) => argv.includes(n), val = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
  const dir = path.resolve(argv.find((a, i) => !a.startsWith('--') && !['--stage', '--upto'].includes(argv[i - 1])) || '.');
  if (!fs.existsSync(path.join(dir, 'game.json'))) { console.error(`check-stage: no game.json in ${dir}`); process.exit(2); }
  const only = val('--stage') != null ? [+val('--stage')] : [...Array((val('--upto') != null ? +val('--upto') : 7) + 1).keys()];
  const results = [...checkStages(dir, { only }), ...(flag('--tools') ? runStageTools(dir, only) : [])].sort((a, b) => a.stage - b.stage);
  const fails = results.filter((r) => r.level === 'fail');
  if (flag('--report')) { fs.mkdirSync(path.join(dir, 'docs'), { recursive: true }); fs.writeFileSync(path.join(dir, 'docs', 'stage-report.md'), reportMarkdown(results, { title: (readJson(path.join(dir, 'game.json')) || {}).title }) + '\n'); }
  if (flag('--json')) console.log(JSON.stringify({ dir, stages: only, ok: !fails.length, results }, null, 2));
  else {
    let cur = -1;
    for (const r of results) { if (r.stage !== cur) { cur = r.stage; console.log(`\nS${cur} ${STAGES[cur]}`); } console.log(`  ${r.level === 'ok' ? 'ok  ' : r.level === 'warn' ? 'warn' : 'FAIL'} ${r.id}  ${r.msg}`); }
    const firstBad = fails.length ? Math.min(...fails.map((r) => r.stage)) : null;
    console.log(`\n${fails.length ? `${fails.length} failed — S${firstBad} ${STAGES[firstBad]} から直す（そこより先の段階は、直したあとでまた変わる）` : `S${only[0]}..S${only.at(-1)} 合格`}${flag('--report') ? '（docs/stage-report.md に記録）' : ''}`);
  }
  process.exit(fails.length ? 1 : 0);
}
