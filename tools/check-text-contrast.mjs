#!/usr/bin/env node
// COMPUTED text-contrast audit (rule U30: a text colour must match the background it is actually drawn on).
//   node tools/check-text-contrast.mjs <url|file.html> [--theme dark-industrial,paper-light,retro-crt] [--viewport 390x844,1920x1080]
//        [--hooks hooks.mjs] [--shots DIR] [--json out.json] [--min 4.5] [--warn] [--wait 1200]
// Loads the page in a fully HEADLESS browser (tools/cdp.mjs: --headless=new, input only inside the page), optionally drives UI states
// with a hooks module (default export  async ({ page, audit, vp, theme }) => { await page.eval("..."); await audit("state name"); }),
// and for EVERY visible text node computes: the used text colour (with opacity), the effective background (ancestor background
// colours alpha-composited; where an ancestor has an image / gradient, or the stack is never opaque, or the text is SVG, the real
// pixels behind the text are sampled from a screenshot with that element's text hidden), the WCAG ratio, and flags < 4.5 (< 3 for large text).
// Elements covered by another element, hidden, disabled or of zero size are skipped. Exit 1 on any failure (unless --warn).
// Exported: contrastRatio, audit logic is in the page function auditPage (kept as a string so it runs in the browser).
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { launch } from "./cdp.mjs";

import { contrastRatio, collectTextItems, evaluateItems } from "../js/kit/text-contrast.js"; // the one source of the audit (also window.__gf "textContrast" in the page)
export { contrastRatio };

// the page function: lists every visible text element with its used colour and composited background (js/text-contrast.js collectTextItems, self-contained)
const PAGE_FN = `(${collectTextItems.toString()})()`;

// decode a full-page screenshot inside the page (same-origin data URL, canvas not tainted) and return, for every rect, a sample of rgb pixels
async function samplePixels(page, b64, rects) {
  return page.eval(`(async () => { const im = new Image(); im.src = "data:image/png;base64,${b64}"; await im.decode();
    const c = document.createElement("canvas"); c.width = im.width; c.height = im.height; const x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(im, 0, 0);
    return ${JSON.stringify(rects)}.map(([rx, ry, rw, rh]) => { const X = Math.max(0, Math.floor(rx)), Y = Math.max(0, Math.floor(ry)), W = Math.max(1, Math.min(im.width - X, Math.ceil(rw))), H = Math.max(1, Math.min(im.height - Y, Math.ceil(rh)));
      const d = x.getImageData(X, Y, W, H).data, out = [], n = W * H, step = Math.max(1, Math.floor(n / 300)); for (let k = 0; k < n; k += step) out.push([d[k * 4], d[k * 4 + 1], d[k * 4 + 2]]); return out; }); })()`);
}

export async function run(opts) {
  const { url, themes = [""], viewports = [[1920, 1080]], hooks, shots, min = 4.5, wait = 1200 } = opts;
  const results = [];
  const hookImp = hooks ? await import(pathToFileURL(path.resolve(hooks)).href) : null;
  const hookMod = hookImp ? hookImp.default : null;
  const urlFn = hookImp && hookImp.url; // optional: export const url = (base, { w, h, mobile, theme }) => string  (a game needs ?touch=1 on a phone, etc.)
  for (const [w, h] of viewports) {
    for (const theme of themes) {
      const page = await launch({ width: w, height: h, mobile: w < 700, dpr: 1 });
      try {
        await page.send("Page.addScriptToEvaluateOnNewDocument", { source: `(() => { const s = document.createElement("style"); s.textContent = "[data-cc-hide], [data-cc-hide] * { color: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; fill: transparent !important; }"; document.addEventListener("DOMContentLoaded", () => document.head.appendChild(s)); })()` });
        await page.goto(urlFn ? urlFn(url, { w, h, mobile: w < 700, theme }) : url);
        await page.sleep(wait);
        if (theme) await page.eval(`document.documentElement.setAttribute("data-theme", ${JSON.stringify(theme)})`);
        const vp = `${w}x${h}`;
        const audit = async (state = "initial") => {
          // Sampling hides and restores text. Finish that instrumentation immediately,
          // otherwise a CSS color transition is measured halfway back from transparent.
          await page.eval(`(() => { if (!document.getElementById('cc-no-transitions')) { const s = document.createElement('style'); s.id = 'cc-no-transitions'; s.textContent = '* { transition: none !important; }'; document.head.appendChild(s); } })()`);
          await page.sleep(150);
          const items = await page.eval(PAGE_FN);
          // the real pixels behind the text of every element that needs them: hide all those texts at once, one screenshot, sample each rect
          const need = items.filter((it) => it.needPixels);
          let samples = [];
          if (need.length) {
            await page.eval(`(() => { if (!document.getElementById("cc-hide-style")) { const s = document.createElement("style"); s.id = "cc-hide-style"; s.textContent = "[data-cc-hide], [data-cc-hide] * { color: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; fill: transparent !important; caret-color: transparent !important; }"; document.documentElement.appendChild(s); } })()`);
            await page.eval(`${JSON.stringify(need.map((it) => it.i))}.forEach((i) => document.querySelector('[data-cc-i="' + i + '"]')?.setAttribute("data-cc-hide", "1"))`);
            await page.eval("new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))");
            await page.sleep(80);
            const r = await page.send("Page.captureScreenshot", { format: "png" });
            samples = await samplePixels(page, r.data, need.map((it) => it.rect));
            await page.eval(`document.querySelectorAll("[data-cc-hide]").forEach((e) => e.removeAttribute("data-cc-hide"))`);
          }
          const samplesById = Object.fromEntries(need.map((it, k) => [it.i, samples[k]]));
          const ev = evaluateItems(items, { min, samples: samplesById });
          const bad = ev.failures;
          const rec = { url, vp, theme, state, checked: items.length, failures: bad.map(({ sel, text, ratio, need, fg, bg, px, why, rect }) => ({ sel, text, ratio, need, fg, bg, px, why, rect })) };
          results.push(rec);
          console.log(`${bad.length ? "FAIL" : "ok  "} ${theme || "-"} ${vp} [${state}] ${items.length} text elements, ${bad.length} below AA`);
          for (const b of bad.slice(0, 40)) console.log(`     ${b.ratio}:1 (need ${b.need}) ${b.sel} "${b.text}" fg rgb(${b.fg}) on bg rgb(${b.bg}) ${b.px}px${b.why ? " [" + b.why + "]" : ""}`);
          if (bad.length > 40) console.log(`     ... +${bad.length - 40} more`);
          if (bad.length && shots) {
            fs.mkdirSync(shots, { recursive: true });
            await page.eval(`(${JSON.stringify(bad.map((b) => b.i))}).forEach((i) => { const e = document.querySelector('[data-cc-i="' + i + '"]'); if (e) e.style.outline = "3px solid #ff00aa"; })`);
            await page.shot(path.join(shots, `contrast-${slug(url)}-${theme || "default"}-${vp}-${slug(state)}.png`));
            await page.eval(`document.querySelectorAll("[data-cc-i]").forEach((e) => { if (e.style.outline.includes("ff00aa") || e.style.outline.includes("255, 0, 170")) e.style.outline = ""; })`);
          }
          return rec;
        };
        if (hookMod) await hookMod({ page, audit, vp: [w, h], theme });
        else await audit("initial");
      } finally {
        await page.close();
      }
    }
  }
  return results;
}
const slug = (s) => String(s).replace(/^https?:\/\//, "").replace(/[^\w぀-ヿ一-鿿-]+/g, "_").slice(0, 60);

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const a = process.argv.slice(2);
  const arg = (k, d) => (a.includes(k) ? a[a.indexOf(k) + 1] : d);
  const target = a.find((x) => !x.startsWith("--") && !a[a.indexOf(x) - 1]?.startsWith("--"));
  if (!target) { console.error("usage: check-text-contrast.mjs <url|file> [--theme a,b] [--viewport 390x844,1920x1080] [--hooks f.mjs] [--shots DIR] [--json f] [--min 4.5] [--warn]"); process.exit(2); }
  let server = null, url = target;
  if (!/^https?:/.test(target)) { // a local file: serve the kit root (ES modules need http) on a free port
    const here = path.dirname(fileURLToPath(import.meta.url));
    const root = path.resolve(arg("--root", path.join(here, "..")));
    const port = 18000 + Math.floor(Math.random() * 2000);
    server = spawn(process.execPath, [path.join(here, "serve.js"), "--root", root, "--port", String(port)], { stdio: "ignore" });
    await new Promise((r) => setTimeout(r, 800));
    url = `http://localhost:${port}/${path.relative(root, path.resolve(target)).replace(/\\/g, "/")}`;
  }
  const res = await run({
    url,
    themes: arg("--theme", "") ? arg("--theme").split(",") : [""],
    viewports: arg("--viewport", "1920x1080").split(",").map((v) => v.split("x").map(Number)),
    hooks: arg("--hooks"), shots: arg("--shots"), min: +arg("--min", 4.5), wait: +arg("--wait", 1200),
  });
  server?.kill();
  const n = res.reduce((s, r) => s + r.failures.length, 0);
  if (arg("--json")) fs.writeFileSync(arg("--json"), JSON.stringify(res, null, 1));
  console.log(`\n${res.length} states, ${res.reduce((s, r) => s + r.checked, 0)} text elements, ${n} below AA`);
  process.exit(n && !a.includes("--warn") ? 1 : 0);
}
