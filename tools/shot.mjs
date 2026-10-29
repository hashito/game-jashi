// Headless Edge check: title, start, first scene at 1920x1080 and 390x844 (touch). Collects console errors.
// node tools/shot.mjs <outDir> [dir=public]   (or BASE_URL=https://... to check the live site)
import fs from "node:fs";
import path from "node:path";
import { launch } from "./cdp.mjs";
import { serve } from "./serve.mjs";

const out = process.argv[2] || "shots";
fs.mkdirSync(out, { recursive: true });
const s = process.env.BASE_URL ? null : await serve(0, process.argv[3] || "public");
const base = process.env.BASE_URL || `http://127.0.0.1:${s.port}/`;
const SIZES = [
  ["1920x1080", { width: 1920, height: 1080 }],
  ["390x844", { width: 390, height: 844, mobile: true, dpr: 2 }],
];
let bad = 0;
for (const [name, prof] of SIZES) {
  const page = await launch(prof);
  try {
    await page.goto(base);
    await page.waitFor(`document.querySelector('[data-action="start"]')`, 20000);
    await page.sleep(2500);
    await page.shot(path.join(out, `${name}-title.png`));
    await page.eval(`document.querySelector('[data-action="start"]').click()`);
    await page.sleep(1500);
    await page.shot(path.join(out, `${name}-intro.png`));
    const begin = await page.eval(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>/録画を始める/.test(b.textContent)&&b.offsetParent);if(b){b.click();return true}return false})()`);
    await page.sleep(6000);
    await page.shot(path.join(out, `${name}-play.png`));
    const info = await page.eval(`({screen:document.body.dataset.screen,touch:[...document.querySelectorAll('.touch-button')].filter(b=>b.offsetParent&&getComputedStyle(b).visibility!=='hidden').length,canvas:!!document.querySelector('#world canvas')})`);
    console.log(name, "begin:", begin, JSON.stringify(info), "errors:", page.errors.length);
    for (const e of page.errors) console.log("  ERR", e);
    bad += page.errors.length;
  } finally {
    await page.close();
  }
}
if (s) s.srv.close();
process.exit(bad ? 1 : 0);
