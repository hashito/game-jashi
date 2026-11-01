#!/usr/bin/env node
// Local test server (no dependencies). ES modules do not work from file://, so serve over HTTP.
// Copy into a game's tools/ (kit-sync does it). Run from anywhere:
//   node tools/serve.js            -> http://localhost:8000/ (the source tree, as you edit it)
//   node tools/serve.js --public   -> public/ (what Firebase serves; run tools/build-site.js first)
//   node tools/serve.js --port 9000 [--root some/dir]
const http = require("http");
const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
const arg = (k) => (args.indexOf(k) >= 0 ? args[args.indexOf(k) + 1] : null);
const BASE = path.join(__dirname, "..");
const ROOT = path.resolve(arg("--root") || path.join(BASE, args.includes("--public") ? "public" : ""));
const PORT = Number(arg("--port") || process.env.PORT || 8000);
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png",
  ".jpg": "image/jpeg", ".webp": "image/webp", ".glb": "model/gltf-binary", ".xml": "application/xml",
  ".txt": "text/plain; charset=utf-8", ".ico": "image/x-icon", ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".wav": "audio/wav",
};
let name = path.basename(BASE);
try {
  name = JSON.parse(fs.readFileSync(path.join(BASE, "site.json"), "utf8")).name || name;
} catch {
  /* no site.json */
}

if (!fs.existsSync(path.join(ROOT, "index.html"))) {
  console.error(`${ROOT} has no index.html (for --public, run: node tools/build-site.js)`);
  process.exit(1);
}

http
  .createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (p.endsWith("/")) p += "index.html";
    const file = path.join(ROOT, path.normalize(p));
    if (!file.startsWith(ROOT)) return res.writeHead(403).end();
    fs.readFile(file, (err, data) => {
      if (err) return res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("404");
      res.writeHead(200, { "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-cache" });
      res.end(data);
    });
  })
  .listen(PORT, "127.0.0.1", () => console.log(`${name}: http://localhost:${PORT}/  (?debug=1 for the debug overlay)`));
