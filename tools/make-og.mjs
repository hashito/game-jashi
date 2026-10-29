// Captures tools/og.html in headless Edge at 1200x630 and writes assets/og-image.jpg (site) and assets/og-image.png (portal card): node tools/make-og.mjs
import fs from "node:fs";
import path from "node:path";
import { launch } from "./cdp.mjs";
import { serve } from "./serve.mjs";

const root = path.resolve(import.meta.dirname, "..");
const s = await serve(0, ".");
const page = await launch({ width: 1200, height: 630 });
try {
  await page.goto(`http://127.0.0.1:${s.port}/tools/og.html`);
  await page.sleep(1500);
  const r = await page.send("Page.captureScreenshot", { format: "jpeg", quality: 84 });
  const out = path.join(root, "assets/og-image.jpg");
  fs.writeFileSync(out, Buffer.from(r.data, "base64"));
  // the Game-fleet portal reads assets/og-image.png for its game card
  const p = await page.send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(root, "assets/og-image.png"), Buffer.from(p.data, "base64"));
  console.log(`assets/og-image.jpg ${Math.round(fs.statSync(out).size / 1024)} KB`, page.errors.length ? page.errors : "");
} finally {
  await page.close();
  s.srv.close();
}
