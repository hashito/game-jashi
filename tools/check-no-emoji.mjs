#!/usr/bin/env node
// No emoji in the UI (rule U24 / issue #36): the interface uses SVG icons (js/icons.js), never emoji or pictographic symbols.
//   node tools/check-no-emoji.mjs [dir-or-file ...] [--skip-story] [--warn] [--allow-dirs a,b] [--json]
// Scans UI sources: html / js / css / mjs / json (data UI strings, release notes). Default roots: js css examples templates docs/*.html.
// --skip-story : skip story text (data/story*.json, data/docs.json, data/endings.json, story/, test/): the story may keep its own marks.
// A line may opt out with  /* emoji-ok */  or  // emoji-ok  (e.g. a test that must contain an emoji). Exit 1 when found (unless --warn).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Extended_Pictographic minus plain text symbols that are ordinary typography (copyright, trademark, arrows ← → ↑ ↓, ✓ ✕ ★ ☆ ◆ ◇ ▲ etc. are
// geometric / dingbat glyphs and ARE flagged only when they are emoji-presentation: we flag Emoji_Presentation + VS16 + Extended_Pictographic > U+2600).
const RE = /[\u{1F000}-\u{1FAFF}\u{1F1E6}-\u{1F1FF}\u{2600}-\u{27BF}\u{2B50}\u{2B55}\u{2B1B}\u{2B1C}\u{2934}\u{2935}\u{3030}\u{303D}\u{3297}\u{3299}\u{231A}\u{231B}\u{23E9}-\u{23F3}\u{23F8}-\u{23FA}\u{25AA}\u{25AB}\u{25B6}\u{25C0}\u{25FB}-\u{25FE}\u{2139}\u{2194}-\u{2199}\u{21A9}\u{21AA}\u{24C2}]|️/u;
// plain typographic symbols that are not emoji and stay allowed (they render as text in every font): the dingbat block has a few
const ALLOW_TEXT = new Set([..."✓✕★☆◆◇▲△▼▽●○■□♪♫※→←↑↓↔♭♯"]);
export const findEmoji = (line) => {
  const out = [];
  for (const m of line.matchAll(new RegExp(RE.source, "gu"))) {
    const ch = m[0];
    if (ALLOW_TEXT.has(ch)) continue;
    out.push(ch);
  }
  return out;
};
const EXT = new Set([".html", ".js", ".mjs", ".css", ".json", ".md"]);
const SKIP_DIR = new Set(["node_modules", ".git", "vendor", "public", "assets", "shots", "_feedback"]);
const STORY = /(^|\/)(data\/(docs|endings)\.json|story\/|test\/|docs\/)/; // story text only (documents and endings the player reads); stage / choice icons are UI

export function scan(roots, { skipStory = false, base = process.cwd(), exts = EXT } = {}) {
  const hits = [];
  const walk = (p) => {
    let st; try { st = fs.statSync(p); } catch { return; }
    if (st.isDirectory()) { if (SKIP_DIR.has(path.basename(p))) return; for (const f of fs.readdirSync(p)) walk(path.join(p, f)); return; }
    if (!exts.has(path.extname(p))) return;
    const rel = path.relative(base, p).split(path.sep).join("/");
    if (skipStory && STORY.test(rel)) return;
    if (/check-no-emoji\.mjs$/.test(p)) return;
    fs.readFileSync(p, "utf8").split(/\r\n?|\n/).forEach((line, i) => {
      if (/emoji-ok/.test(line)) return;
      // an emoji in a code comment is documentation, not UI
      const f = findEmoji([".js", ".mjs", ".css"].includes(path.extname(p)) ? line.replace(/(^|\s)\/\/.*$/, "$1").replace(/\/\*.*?\*\//g, "") : line);
      if (f.length) hits.push({ file: rel, line: i + 1, chars: [...new Set(f)].join(" "), text: line.trim().slice(0, 100) });
    });
  };
  roots.forEach(walk);
  return hits;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const a = process.argv.slice(2);
  const here = path.dirname(fileURLToPath(import.meta.url));
  const base = process.cwd();
  const roots = a.filter((x) => !x.startsWith("--")).map((x) => path.resolve(x));
  const def = ["js", "css", "examples", "templates", "index.html", "data", "game.json"].map((d) => path.resolve(base, d)).filter((d) => fs.existsSync(d));
  const hits = scan(roots.length ? roots : def.length ? def : [path.resolve(here, "..")], { skipStory: a.includes("--skip-story"), base });
  if (a.includes("--json")) console.log(JSON.stringify(hits, null, 1));
  else {
    for (const h of hits.slice(0, 200)) console.log(`${h.file}:${h.line}  ${h.chars}   ${h.text}`);
    if (hits.length > 200) console.log(`... +${hits.length - 200} more`);
    console.log(hits.length ? `${hits.length} line(s) with emoji (rule U24: use an SVG icon from js/icons.js)` : "no emoji in the UI sources");
  }
  process.exit(hits.length && !a.includes("--warn") ? 1 : 0);
}
