#!/usr/bin/env node
// Wording lint for the STANDARD UI strings (rule U29, docs/writing-style.md): gentle, short, plain Japanese.  WARN ONLY by default (exit 0); --strict exits 1.
//   node tools/check-wording.mjs [dir-or-file ...] [--strict] [--max 40] [--json] [--rules long,jargon,tone,kana]
// Checks every Japanese string literal in .js / .mjs (and every string value in .json) of the given paths (default: js/):
//   long    a sentence (cut at 。！？ and line breaks) longer than --max characters (default 40): split it into two short ones
//   jargon  words the player should not have to know (リセット, エラー, 無効, 実行, 不正, 破棄, 初期化 ...): see JARGON for the replacement
//   tone    commands and scolding (〜しろ / 〜せよ / 〜すること。 / 〜しなければならない / 〜禁止 / 失敗しました): say what is possible, or what happens, softly
//   plain   a sentence in plain form (〜する。 〜ない。) in a standard string: explanations are written with です・ます (the protagonist's own voice stays plain: use // wording-ok)
//   kana    a very long run of kanji (8 or more in a row) with no kana: hard to read
// A line (or the string) may opt out with  // wording-ok  .  Story text (data/story*.json, docs.json, endings.json) can be left out with --skip-story.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const JARGON = [
  ["リセット", "もとにもどす"], ["エラー", "うまくいきませんでした（理由を添える）"], ["無効", "いまは使えません"], ["不正", "正しくありません → 合っていません"],
  ["実行", "する・始める"], ["破棄", "すてる"], ["初期化", "最初の状態にもどす"], ["削除", "消す"], ["失敗", "うまくいかなかった"], ["強制", "むりやり → 自動で"],
  ["必須", "かならず必要 → 入れてください"], ["デフォルト", "ふつう・はじめの設定"], ["パラメータ", "数値・設定"], ["ステータス", "いまの状態"], ["オブジェクト", "物"],
  ["キャンセル", "やめる"], ["ロード", "読み込み → ひらく"], ["セーブデータ", "つづきの記録"], ["コンテンツ", "中身"], ["アクセス", "ひらく・行く"], ["インタラクション", "操作"],
  ["トリガー", "きっかけ"], ["ペナルティ", "減点 → ありません と書く"], ["クリア条件", "できると"], ["チュートリアル", "使い方・はじめの案内"], ["ミニゲーム", "作業"],
];
const TONE = [
  [/(?:しろ|じろ|みろ|えろ|けろ|れろ|せよ)[。！\s」]/, "命令: 「〜してみましょう」「〜できます」"], [/すること。/, "命令: 「〜します」「〜してください」"], [/なければならない|なくてはならない|べき[。です]/, "押しつけ: 「〜すると進みます」"],
  [/禁止/, "禁止: 「いまはできません。〜すると使えます」"], [/失敗しました|失敗です|間違いです|不正解/, "責める言い方: 「うまくいきませんでした。もう一度どうぞ」"], [/できません。$|不可。$/, "突き放す: 「いまは〜できません。〜すると使えます」"],
  [/ない！|だめ[！。]|ダメ[！。]/, "強い否定: 「まだ〜できません」"],
];
const PLAIN_END = /(?:ない|ある|いる|する|れる|える|った|いた|んだ|だ|た|る|い|う|く|す|つ)$/;
const POLITE_END = /(?:ます|です|ません|ください|ましょう|でしょう|ですか|ますか|でした|ました|ませんか|ください)$/;
const sentences = (t) => t.split(/[。！？!?\n]+/).map((x) => x.trim()).filter(Boolean);
const JP = /[぀-ヿ一-鿿]/;

export function lintString(text, { max = 40, rules = ["long", "jargon", "tone", "kana", "plain"] } = {}) {
  const out = [];
  if (!JP.test(text)) return out;
  const plain = text.replace(/\$\{[^}]*\}/g, "◯").replace(/<[^>]*>/g, "");
  if (rules.includes("long")) for (const s of sentences(plain)) if ([...s].length > max) out.push({ rule: "long", msg: `${[...s].length}字の文: 二つに分ける`, at: s.slice(0, 30) });
  if (rules.includes("jargon")) for (const [w, r] of JARGON) if (plain.includes(w)) out.push({ rule: "jargon", msg: `「${w}」→ ${r}`, at: w });
  if (rules.includes("tone")) for (const [re, r] of TONE) { const m = re.exec(plain); if (m) out.push({ rule: "tone", msg: r, at: m[0] }); }
  if (rules.includes("plain")) for (const m of plain.matchAll(/([^。！？\n]+)。/g)) { const x = m[1].trim(); if ([...x].length >= 4 && PLAIN_END.test(x) && !POLITE_END.test(x)) out.push({ rule: "plain", msg: "だ・である調: 案内は「です・ます」で", at: x.slice(-12) }); }
  if (rules.includes("kana")) { const m = /[一-鿿]{8,}/.exec(plain); if (m) out.push({ rule: "kana", msg: "漢字が8字以上続く: かなをまぜるか、区切る", at: m[0] }); }
  return out;
}

// the string literals of a JS source with their line numbers (comments removed, template ${} kept as text)
export function stringsOfJs(src) {
  const out = [];
  let i = 0, line = 1;
  const n = src.length;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === "\n") { line++; i++; continue; }
    if (c === "/" && d === "/") { while (i < n && src[i] !== "\n") i++; continue; }
    if (c === "/" && d === "*") { i += 2; while (i < n && !(src[i] === "*" && src[i + 1] === "/")) { if (src[i] === "\n") line++; i++; } i += 2; continue; }
    if (c === '"' || c === "'" || c === "`") {
      const q = c, start = line; let j = i + 1, t = "";
      while (j < n && src[j] !== q) {
        if (src[j] === "\\") { t += src[j + 1] === "n" ? "\n" : src[j + 1]; j += 2; continue; }
        if (q === "`" && src[j] === "$" && src[j + 1] === "{") { let dep = 0; for (; j < n; j++) { if (src[j] === "{") dep++; else if (src[j] === "}" && --dep === 0) { j++; break; } if (src[j] === "\n") line++; } t += "${}"; continue; }
        if (src[j] === "\n") { if (q !== "`") break; line++; }
        t += src[j]; j++;
      }
      out.push({ text: t, line: start });
      i = j + 1; continue;
    }
    i++;
  }
  return out;
}
const jsonStrings = (v, acc = []) => { if (typeof v === "string") acc.push(v); else if (Array.isArray(v)) v.forEach((x) => jsonStrings(x, acc)); else if (v && typeof v === "object") Object.values(v).forEach((x) => jsonStrings(x, acc)); return acc; };

export function scan(roots, { max = 40, rules, skipStory = false, base = process.cwd(), all: a_all = false } = {}) {
  const hits = [];
  const walk = (p) => {
    let st; try { st = fs.statSync(p); } catch { return; }
    if (st.isDirectory()) { if (/node_modules|\.git|vendor|assets|shots|public$/.test(path.basename(p))) return; for (const f of fs.readdirSync(p)) walk(path.join(p, f)); return; }
    const ext = path.extname(p), rel = path.relative(base, p).split(path.sep).join("/");
    if (![".js", ".mjs", ".json"].includes(ext) || /check-wording\.mjs$/.test(p) || /(^|\/)test\//.test(rel)) return;
    if (/(check|schema|audit|directions|align-rules|layout-rules|plan|balance)[-\w]*\.(m?js)$/.test(path.basename(p)) && !a_all) return; // developer-facing messages (the player never sees them); --all includes them
    if (skipStory && /(^|\/)data\/(story[^/]*|docs|endings)\.json$/.test(rel)) return;
    const src = fs.readFileSync(p, "utf8");
    const lines = src.split("\n");
    const items = ext === ".json" ? jsonStrings(JSON.parse(src)).map((text) => ({ text, line: Math.max(1, lines.findIndex((l) => l.includes(text.slice(0, 20))) + 1) })) : stringsOfJs(src);
    for (const it of items) {
      if (/wording-ok/.test(lines[it.line - 1] || "")) continue;
      for (const f of lintString(it.text, { max, rules })) hits.push({ file: rel, line: it.line, ...f, text: it.text.replace(/\s+/g, " ").slice(0, 60) });
    }
  };
  roots.forEach(walk);
  return hits;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const a = process.argv.slice(2);
  const val = (k, d) => (a.includes(k) ? a[a.indexOf(k) + 1] : d);
  const roots = a.filter((x, i) => !x.startsWith("--") && !["--max", "--rules"].includes(a[i - 1])).map((x) => path.resolve(x));
  const hits = scan(roots.length ? roots : [path.resolve("js")], { max: +val("--max", 40), rules: val("--rules") ? val("--rules").split(",") : undefined, skipStory: a.includes("--skip-story"), all: a.includes("--all") });
  if (a.includes("--json")) console.log(JSON.stringify(hits, null, 1));
  else {
    const by = {};
    for (const h of hits) (by[h.rule] = by[h.rule] || []).push(h);
    for (const h of hits.slice(0, 300)) console.log(`${h.file}:${h.line} [${h.rule}] ${h.msg}  「${h.text}」`);
    if (hits.length > 300) console.log(`... +${hits.length - 300} more`);
    console.log(`wording: ${hits.length} suggestion(s) (${Object.entries(by).map(([k, v]) => `${k} ${v.length}`).join(", ") || "none"}) — docs/writing-style.md${a.includes("--strict") ? "" : " (warn only)"}`);
  }
  process.exit(hits.length && a.includes("--strict") ? 1 : 0);
}
