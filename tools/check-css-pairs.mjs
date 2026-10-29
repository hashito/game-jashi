#!/usr/bin/env node
// Static check of rule U30 in CSS: a rule that sets its OWN background must also set its paired text colour, otherwise the text is inherited from some
// other background (dark text on a dark box).  Use the paired tokens (css/theme.css: --gf-note-bg / --gf-note-text, hint, warn, quote, voice, chip, badge, code).
//   node tools/check-css-pairs.mjs <file.css ...> [--warn] [--allow "#title,.gf-scanlines"]
// A rule is exempt when: the selector is html / body / :root / canvas / .gf-paper / .gf-ink, the value is transparent / none / inherit / currentColor, the rule has
// "pair-ok" in a comment inside it (for a box that holds no text of its own: a bar, a dot, a thumbnail, an overlay), or the selector ends in ::before / ::after
// with no content text.  Pairs are also accepted as: background: var(--gf-X-bg ...) with color: var(--gf-X-text ...) of the same family.
// Exit 1 on any finding (unless --warn).  Used by npm test through test/css-pairs.test.mjs (the game CSS of examples) and by games for their own css/ext.css / css/theme-game.css.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, (m) => (/pair-ok/.test(m) ? "/*pair-ok*/" : "") + m.replace(/[^\n]/g, ""));
// flatten @media / @supports / @container blocks; drop @keyframes / @font-face bodies
export function rulesOf(css) {
  const out = [];
  const src = strip(css);
  let i = 0;
  const readBlock = (from) => { let d = 0, j = from; for (; j < src.length; j++) { if (src[j] === "{") d++; else if (src[j] === "}") { d--; if (d === 0) return j; } } return src.length; };
  const walk = (a, b) => {
    let k = a;
    while (k < b) {
      const open = src.indexOf("{", k);
      if (open < 0 || open >= b) break;
      const head = src.slice(k, open).trim();
      const close = readBlock(open);
      if (/^@(media|supports|container|layer|scope)/.test(head)) walk(open + 1, close);
      else if (!head.startsWith("@")) out.push({ selector: head, body: src.slice(open + 1, close), line: src.slice(0, open).split("\n").length });
      k = close + 1;
    }
  };
  walk(0, src.length);
  return out;
}
const decls = (body) => body.split(";").map((d) => d.trim()).filter(Boolean).map((d) => { const m = /^([-\w]+)\s*:\s*([\s\S]*)$/.exec(d); return m ? [m[1].toLowerCase(), m[2].trim()] : null; }).filter(Boolean);
const EXEMPT_SEL = /^(html|body|:root|canvas|\.gf-paper|\.gf-ink|\*|\[data-theme)/;
const NO_BG = /^(none|transparent|inherit|initial|unset|currentcolor)$/i;
export function findUnpaired(css, { allow = [] } = {}) {
  const bad = [];
  for (const r of rulesOf(css)) {
    if (/pair-ok/.test(r.body)) continue;
    const d = decls(r.body);
    const bg = d.find(([k, v]) => (k === "background" || k === "background-color") && !NO_BG.test(v));
    if (!bg) continue;
    // a bare "background: url(...) no-repeat" (an image, no colour) is not a colour pair
    if (/^url\(/i.test(bg[1]) && !/#|rgb|hsl|var\(/i.test(bg[1].replace(/url\([^)]*\)/g, ""))) continue;
    if (d.some(([k]) => k === "color")) continue;
    for (const sel of r.selector.split(",").map((x) => x.trim())) {
      if (EXEMPT_SEL.test(sel) || allow.some((a) => sel.includes(a))) continue;
      if (/::?(before|after)$/.test(sel)) continue;
      if (/:(hover|active|focus|focus-visible|focus-within|disabled|checked)(:[\w-]+)*$/.test(sel)) continue; // a state of a rule that already has its colour
      bad.push({ selector: sel, line: r.line, background: bg[1].slice(0, 60) });
    }
  }
  return bad;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const a = process.argv.slice(2);
  const files = a.filter((x, i) => !x.startsWith("--") && a[i - 1] !== "--allow");
  const allow = a.includes("--allow") ? a[a.indexOf("--allow") + 1].split(",") : [];
  if (!files.length) { console.error("usage: check-css-pairs.mjs <file.css ...> [--warn] [--allow a,b]"); process.exit(2); }
  let n = 0;
  for (const f of files) {
    const bad = findUnpaired(fs.readFileSync(f, "utf8"), { allow });
    for (const b of bad) console.log(`${f}:${b.line}  ${b.selector} { background: ${b.background} }  has no colour of its own (rule U30: set the paired text token, or add /* pair-ok */ for a box without text)`);
    n += bad.length;
  }
  console.log(n ? `${n} rule(s) set a background without a paired text colour` : "every background in these CSS files comes with its text colour");
  process.exit(n && !a.includes("--warn") ? 1 : 0);
}
