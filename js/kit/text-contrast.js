/* game-kit 5b6bf60: js/text-contrast.js — edit in game-kit and run tools/kit-sync.js */
// Computed text contrast (rule U30 / docs/text-contrast.md): for every visible text node, the colour it is really drawn in against the colour it is really drawn on.
// Used by tools/check-text-contrast.mjs (headless browser; real pixels where the background is an image / gradient / 3D scene) and, in the page itself,
// through window.__gf.drive("textContrast", "audit") (docs/testing.md; no pixels: elements that need them are reported as "unchecked").
//
//   import { contrastRatio, collectTextItems, evaluateItems, auditInPage } from "./kit/text-contrast.js";
//   contrastRatio([0, 0, 0], [255, 255, 255]) -> 21
//   auditInPage({ min: 4.5 }) -> { checked, unchecked, failures: [{ sel, text, ratio, need, fg, bg, px }] }          (browser only)
//   evaluateItems(items, { min, samples })   // pure: items from collectTextItems(), samples = { [i]: [[r,g,b], ...] } real pixels behind the text
import { gfRegister, gfOk, gfUnknown } from "./gf-test.js";

// ---- pure (Node and browser) ----
// rgb() / rgba(), and color(srgb r g b / a): what getComputedStyle returns for a colour made with color-mix() (the HUD surfaces of the standard themes)
export const parseColor = (s) => {
  const m = /rgba?\(([^)]+)\)/.exec(s || "");
  if (m) {
    const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  }
  const c = /color\(srgb ([^)]+)\)/.exec(s || "");
  if (!c) return null;
  const q = c[1].split(/[ ,/]+/).filter(Boolean).map(Number);
  return [q[0] * 255, q[1] * 255, q[2] * 255, q.length > 3 ? q[3] : 1];
};
export const over = (f, b) => [f[0] * f[3] + b[0] * (1 - f[3]), f[1] * f[3] + b[1] * (1 - f[3]), f[2] * f[3] + b[2] * (1 - f[3]), 1];
const lum = (c) => { const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
// WCAG 2.x contrast ratio of two [r, g, b] colours
export const contrastRatio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
// large text (>= 24px, or >= 18.66px bold) needs 3:1, everything else `min` (4.5)
export const neededRatio = (large, min = 4.5) => (large ? 3 : min);

// items (from collectTextItems) -> failures.  samples[i] = [[r,g,b], ...] the real pixels behind item i (only for items with needPixels); without samples such an item is "unchecked".
export function evaluateItems(items, { min = 4.5, samples = {} } = {}) {
  const failures = [], unchecked = [];
  for (const it of items) {
    let bgs = [it.bg];
    if (it.needPixels) {
      const s = samples[it.i];
      if (!s || !s.length) { unchecked.push(it); continue; }
      bgs = s;
    }
    const need = neededRatio(it.large, min);
    let worst = null;
    for (const b of bgs) {
      const f = it.fgA, fc = [f[0] * f[3] + b[0] * (1 - f[3]), f[1] * f[3] + b[1] * (1 - f[3]), f[2] * f[3] + b[2] * (1 - f[3])]; // a see-through text is composited over this background
      const c = contrastRatio(fc, b);
      if (!worst || c < worst.c) worst = { c, b, fc };
    }
    if (worst && worst.c < need) failures.push({ i: it.i, sel: it.sel, text: it.text, ratio: +worst.c.toFixed(2), need, fg: worst.fc.map(Math.round), bg: worst.b.map(Math.round), px: it.px, why: it.why, rect: it.rect });
  }
  return { checked: items.length - unchecked.length, unchecked: unchecked.length, failures };
}

// ---- in the page ----
// SELF-CONTAINED (no closure variables, no imports): tools/check-text-contrast.mjs sends this function's source to the browser.
// Returns the visible text elements with their used colour and the background composited from the ancestors; needPixels = the background is an image / gradient / SVG / 3D canvas /
// never opaque, so the real pixels behind the text must be sampled.  Elements that are hidden, disabled, covered by another element or outside the screen are skipped.
export function collectTextItems(root) {
  const parse = (s) => { s = s || ""; let m = /rgba?\(([^)]+)\)/.exec(s); if (m) { const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; } m = /color\(srgb ([^)]+)\)/.exec(s); if (!m) return null; const q = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [q[0] * 255, q[1] * 255, q[2] * 255, q.length > 3 ? q[3] : 1]; };
  const over = (f, b) => [f[0] * f[3] + b[0] * (1 - f[3]), f[1] * f[3] + b[1] * (1 - f[3]), f[2] * f[3] + b[2] * (1 - f[3]), 1];
  const sel = (e) => { const p = []; for (let n = e; n && n.nodeType === 1 && p.length < 4; n = n.parentElement) { let s = n.tagName.toLowerCase(); if (n.id) { p.unshift("#" + n.id); break; } const c = [...(n.classList || [])].slice(0, 2).join("."); if (c) s += "." + c; p.unshift(s); } return p.join(" > "); };
  const doc = (root && root.ownerDocument) || document;
  doc.querySelectorAll("[data-cc-i]").forEach((e) => e.removeAttribute("data-cc-i")); // the marks of the previous state
  const out = []; let idx = 0;
  const tw = doc.createTreeWalker(root || doc.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  const canvases = [...doc.querySelectorAll("canvas")];
  for (let t; (t = tw.nextNode()); ) {
    const txt = t.nodeValue.replace(/\s+/g, " ").trim(); if (!txt) continue;
    const el = t.parentElement; if (!el || seen.has(el)) continue;
    if (/^(script|style|noscript|title|option)$/i.test(el.tagName)) continue;
    if (el.closest("[disabled],[aria-disabled=true],[hidden],[aria-hidden=true],.gf-cc-skip")) continue;
    const r = doc.createRange(); r.selectNodeContents(t); const rc = r.getBoundingClientRect();
    if (rc.width < 1 || rc.height < 1) continue;
    if (rc.right < 0 || rc.bottom < 0 || rc.left > innerWidth || rc.top > innerHeight) continue;
    let ok = true, op = 1;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.display === "none" || cs.visibility === "hidden" || cs.contentVisibility === "hidden") { ok = false; break; } op *= parseFloat(cs.opacity);
      if (n !== el && (cs.overflowX !== "visible" || cs.overflowY !== "visible")) { const b = n.getBoundingClientRect(); if (rc.bottom <= b.top + 1 || rc.top >= b.bottom - 1 || rc.right <= b.left + 1 || rc.left >= b.right - 1) { ok = false; break; } } }   // scrolled out of a scroll box: not seen (yet)
    if (!ok || op < 0.05) continue;
    const cx = Math.min(innerWidth - 1, Math.max(0, rc.left + rc.width / 2)), cy = Math.min(innerHeight - 1, Math.max(0, rc.top + rc.height / 2));
    const top = doc.elementFromPoint(cx, cy);
    if (!top || !(el === top || el.contains(top) || top.contains(el))) continue;
    seen.add(el);
    const cs = getComputedStyle(el);
    const svg = !!el.closest("svg");
    let fg = parse(svg ? cs.fill : cs.color) || [0, 0, 0, 1];
    if (cs.webkitTextFillColor && !svg) { const f2 = parse(cs.webkitTextFillColor); if (f2) fg = f2; }
    fg = [fg[0], fg[1], fg[2], fg[3] * op];
    const layers = []; let needPixels = svg, why = svg ? "svg" : "";
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const c = getComputedStyle(n); const bc = parse(c.backgroundColor);
      if (c.backgroundImage && c.backgroundImage !== "none") { needPixels = true; why = why || "image"; break; }
      if (bc && bc[3] > 0) { layers.push(bc); if (bc[3] >= 0.999) break; }
      if (n === doc.documentElement) break;
    }
    let bg = [255, 255, 255, 1]; // the browser canvas
    const last = layers[layers.length - 1];
    for (let i = layers.length - 1; i >= 0; i--) bg = over(layers[i], bg);
    if ((!last || last[3] < 0.999) && canvases.some((c) => { const b = c.getBoundingClientRect(); return b.width > 50 && rc.left < b.right && rc.right > b.left && rc.top < b.bottom && rc.bottom > b.top; })) { needPixels = true; why = why || "canvas behind"; }
    const fgc = over(fg, bg);
    const px = parseFloat(cs.fontSize), bold = parseInt(cs.fontWeight, 10) >= 700;
    const large = px >= 24 || (px >= 18.66 && bold);
    el.setAttribute("data-cc-i", String(idx));
    out.push({ i: idx++, sel: sel(el), text: txt.slice(0, 40), fg: fgc.slice(0, 3).map(Math.round), fgA: fg, bg: bg.slice(0, 3).map(Math.round), px: Math.round(px), large, needPixels, why, rect: [rc.left, rc.top, rc.width, rc.height] });
  }
  return out;
}

let last = null;
// the in-page audit (no pixels): { checked, unchecked, failures }
export function auditInPage({ min = 4.5, root } = {}) {
  const items = collectTextItems(root);
  last = evaluateItems(items, { min });
  return last;
}

gfRegister("textContrast", () => ({
  snapshot: () => (last ? { checked: last.checked, unchecked: last.unchecked, failures: last.failures.length } : { checked: 0, unchecked: 0, failures: 0 }),
  drive(action, a = {}) {
    if (action !== "audit") return gfUnknown(action);
    const r = auditInPage({ min: a.min || 4.5 });
    return gfOk({ checked: r.checked, unchecked: r.unchecked, failures: r.failures.slice(0, 50).map((f) => ({ sel: f.sel, text: f.text, ratio: f.ratio, need: f.need })) });
  },
  reset: () => { last = null; },
}));
