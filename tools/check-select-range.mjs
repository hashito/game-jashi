#!/usr/bin/env node
// Selection-range check (rule W18): can the player SELECT every interactable (terminal, item, document, door,
// switch, locker ...) easily? For every interactable it sweeps camera poses around it through the game's own
// aim function (headless; the camera is set directly, no real mouse / pointer lock) and measures
//   frac7   share of "reasonable approach poses" (standing 0.6-2.1 m from the object, clear line, looking within 7 deg of its
//           centre) from which the prompt shows          (>= 85 %)
//   frac20  the same for looks up to 20 deg off centre   (information)
//   cover   share of 5 points on what is SEEN (the model / furniture) that select from 1.5 m          (>= 90 %)
//   px      width of the region that still selects at 1.5 m, on screen at 1280x720 (min of horizontal / vertical) (>= 44 px)
//   reach   how far (m from its surface) it still selects when looked at squarely (median over directions)     (>= 1.8 m)
//   maxOff  how many degrees off centre it still selects at 1.5 m (median)
// No dependencies (Node 22+, Edge / Chrome, headless only).
//
//   node tools/check-select-range.mjs --root . [--query 'debug=1&calm=1&qa=1&start=chapter0'] [options]
//   node tools/check-select-range.mjs --url http://localhost:8000/?debug=1 [options]
// Page adapter (expressions evaluated in the page; the defaults fit the sorting-centre style games that have
// game.camera, game.aim() -> game.aimed, game.world.things (Map id -> { box: Box3 })):
//   --game <expr>     the game object                     (window.game || window.__game)
//   --ready <expr>    truthy once the game is playing      (G.started)
//   --things <expr>   [{ id, floor?, min, max (the hit box), v?: { min, max } (what the player SEES; the sweep aims at it) }]  (G.world.things; with floor the page's G.teleport(x, z, floor, yaw) puts the player on that floor first)   (function body using G; return the array)
//   --aim <expr>      run after the camera is set; returns the aimed id (G.aim(); G.aimed && G.aimed.id)
//   --walk <expr>     function (x, z) -> bool, may the player stand here? (G.grid.open + G.player.colliders)
//   --los <body>      function body (x0, z0, x1, z1) -> bool, clear line between two points (default G.grid.los)   --prep <body>  run once after ready (G)
//   --norm <body>     function body (a, T, G) -> id, maps the aimed id before it is compared (e.g. both faces of one door)   --kit  the "after" estimate with the kit's selectInteractable
//   --preset core|things   (core: the standard game-core games, see js/interact-select.js; default things)
// Options: --allow id,id (known residuals that do not fail --strict)  --json <file>  --top <n, 10>  --az <n, 12>  --strict (exit 1 on flagged objects)  --width 1280 --height 720
// Exit 0 ok / 1 flagged (with --strict) / 2 page could not be driven.
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
const flag = (k) => argv.includes(k);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise((res) => { const s = net.createServer().listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); }); });

const root = path.resolve(opt("--root", "."));
const cdpFile = [path.join(HERE, "cdp.mjs"), path.join(root, "tools/cdp.mjs")].find((f) => fs.existsSync(f)); // the kit's own copy first (a game's copy can be older)
const serveFile = [path.join(HERE, "serve.js"), path.join(root, "tools/serve.js")].find((f) => fs.existsSync(f));
if (!cdpFile) { console.error("tools/cdp.mjs not found"); process.exit(2); }
const { launch } = await import("file:///" + cdpFile.replace(/\\/g, "/"));

let server = null, url = opt("--url", null);
if (!url) {
  if (!serveFile) { console.error("no tools/serve.js and no --url"); process.exit(2); }
  const port = opt("--port", null) ? +opt("--port") : await freePort();
  server = spawn(process.execPath, [serveFile, "--root", root, "--port", String(port)], { stdio: "ignore", windowsHide: true });
  url = `http://localhost:${port}/`;
  await sleep(700);
  const q = opt("--query", "debug=1&calm=1&qa=1&start=chapter0");
  if (q) url += "?" + q;
}

// presets: "core" = the standard game-core games (window.__game: ctx.selectables() / ctx.pickNow()); default = the sorting-centre style (G.world.things, G.aim())
const PRESET = opt("--preset", "things");
const PRE = PRESET === "core"
  ? { game: "window.__game", ready: "G.state && G.state.started", things: "const multi = ((G.data && G.data.plan && G.data.plan.rooms) || []).some((r) => r.floor); const fy = (f) => (G.world && G.world.floorY ? G.world.floorY(f) : f * 3.4); const floorOf = (y) => { let f = 0; while (f < 8 && fy(f + 1) <= y + 0.3) f++; return f; }; return G.selectables().map((t) => ({ id: t.id, floor: multi ? floorOf(t.min[1]) : undefined, v: { min: t.min, max: t.max }, min: t.min, max: t.max }));", aim: "const t = G.pickNow(); return t ? t.kind + ':' + t.id : null;" }
  : {};
const W = +opt("--width", 1280), H = +opt("--height", 720);
const GAME = opt("--game", PRE.game || "(window.game || window.__game)");
const READY = opt("--ready", PRE.ready || "G.started");
const THINGS = opt("--things", PRE.things || "return [...G.world.things.values()].map(t => ({ id: t.id, floor: t.floor, v: t.vbox && !t.vbox.isEmpty() ? { min: [t.vbox.min.x, t.vbox.min.y, t.vbox.min.z], max: [t.vbox.max.x, t.vbox.max.y, t.vbox.max.z] } : null, min: [t.box.min.x, t.box.min.y, t.box.min.z], max: [t.box.max.x, t.box.max.y, t.box.max.z] }));");
const AIM = opt("--aim", PRE.aim || "G.aim(); return G.aimed ? (G.aimed.id || G.aimed.name || '?') : null;");
const WALK = opt("--walk", "");
const LOS = opt("--los", "");   // function body (x0, z0, x1, z1) -> bool: clear line on walkable ground between two points (default: G.grid.los)
const NORM = opt("--norm", ""); // function body (a, T, G) -> id: maps the aimed id before the comparison (e.g. both faces of one door count as the door)
const KIT = flag("--kit");      // "after" estimate: select with the kit's js/interact-select.js (selectInteractable) over the same things (visible bounds `v` if given, else the hit box) instead of the game's own aim
const PREP = opt("--prep", ""); // function body run once after --ready (G): e.g. enable every entry, clear flags
const AZ = +opt("--az", 12);

// ---- runs in the page -------------------------------------------------------------------------------------------------
const SWEEP = `(() => {
  const G = ${GAME};
  const things = (() => { ${THINGS} })();
  const normFn = ${NORM ? `(a, T) => { ${NORM} }` : "null"};
  const K = ${KIT ? "window.__kitSel" : "null"};
  const cands = K ? things.map((t) => ({ id: t.id, floor: t.floor, min: (t.v || t).min, max: (t.v || t).max })) : null;
  const aimFn0 = K ? () => {
    const c = G.camera, T = window.__selThing, e = c.position;
    const near = cands.filter((q) => (T.floor == null || q.floor === T.floor) && Math.abs(q.min[0] - e.x) < 8 && Math.abs(q.min[2] - e.z) < 8);
    const r = K.selectInteractable({ eye: [e.x, e.y, e.z], dir: K.dirFromYawPitch(c.rotation.y, c.rotation.x), candidates: near, touch: false, viewH: ${H}, fovDeg: c.fov, blocked: (cand, dist, q) => (losUser ? !losUser(e.x, e.z, q[0], q[2]) : false) });
    return r ? r.id : null;
  } : () => { ${AIM} };
  const aimFn = normFn ? () => normFn(aimFn0(), window.__selThing) : aimFn0;
  const walkUser = ${WALK ? `(x, z) => { ${WALK} }` : "null"};
  const losUser = ${LOS ? `(x0, z0, x1, z1) => { ${LOS} }` : "null"};
  const cam = G.camera;
  cam.rotation.order = 'YXZ';
  let eye = cam.position.y;
  let colliders = (G.player && G.player.colliders) || (G.fp && G.fp.colliders) || [];
  // a tall collider (a wall, a shelf) crossed by the floor line from the pose to the thing (core games have no walk grid; standard 1.7)
  const wallBetween = (x0, z0, x1, z1, V) => {
    for (const c of colliders) {
      if (c.off) continue; const b = c.box; if (b.max.y - b.min.y < 1.0 || b.min.y > eye) continue;
      if (b.min.x <= V.max[0] && b.max.x >= V.min[0] && b.min.z <= V.max[2] && b.max.z >= V.min[2]) continue;   // the thing's own box / what it stands on
      let t0 = 0, t1 = 1; const dx = x1 - x0, dz = z1 - z0; let ok = true;
      for (const [p, d, lo, hi] of [[x0, dx, b.min.x, b.max.x], [z0, dz, b.min.z, b.max.z]]) {
        if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) { ok = false; break; } continue; }
        let a = (lo - p) / d, c2 = (hi - p) / d; if (a > c2) [a, c2] = [c2, a]; t0 = Math.max(t0, a); t1 = Math.min(t1, c2); if (t0 > t1) { ok = false; break; }
      }
      if (ok && t1 > 0.02 && t0 < 0.98) return true;
    }
    return false;
  };
  const walk = (x, z) => {
    if (walkUser) return !!walkUser(x, z);
    if (G.grid && G.grid.open && !G.grid.open(Math.floor(x), Math.floor(z))) return false;
    if (!G.grid && G.world && G.world.roomAt && G.world.roomAt(x, z) == null) return false;   // core games: a pose outside every room is not an approach
    for (const c of colliders) { if (c.off) continue; const b = c.box; if (b.max.y < 0.15 || b.min.y > eye) continue;
      const cx = Math.max(b.min.x, Math.min(x, b.max.x)), cz = Math.max(b.min.z, Math.min(z, b.max.z));
      if ((x - cx) ** 2 + (z - cz) ** 2 < 0.28 * 0.28) return false; }
    return true;
  };
  const rad = Math.PI / 180;
  const f = (${H} / 2) / Math.tan(cam.fov * rad / 2);
  const sel = (x, y, z, yaw, pitch) => {
    cam.position.set(x, y, z); cam.rotation.set(pitch, yaw, 0); cam.updateMatrixWorld(true);
    return aimFn();
  };
  const lookAt = (x, y, z, tx, ty, tz) => { const dx = tx - x, dz = tz - z; return [Math.atan2(-dx, -dz), Math.atan2(ty - y, Math.hypot(dx, dz))]; };
  const rectDist = (x, z, t) => { t = t.v || t; return Math.hypot(Math.max(t.min[0] - x, 0, x - t.max[0]), Math.max(t.min[2] - z, 0, z - t.max[2])); };
  const out = [];
  const save = { p: cam.position.clone(), r: cam.rotation.clone() };
  for (const t of things) {
    window.__selThing = t; // the thing being swept (an --aim expression can read it, e.g. to treat the two faces of one door as the same thing)
    const cx0 = (t.min[0] + t.max[0]) / 2, cz0 = (t.min[2] + t.max[2]) / 2;
    if (t.floor != null && G.teleport) { if (G.teleport.length >= 3) G.teleport(cx0, cz0, t.floor, 0); else G.teleport({ x: cx0, z: cz0, floor: t.floor, yaw: 0 }); /* core games: teleport({ x, z, floor, yaw }) (multi-floor plans, jashi 5.0) */ eye = cam.position.y; colliders = (G.player && G.player.colliders) || (G.fp && G.fp.colliders) || []; }
    const V = t.v || t; // the visual bounds: the player looks at these
    const cx = (V.min[0] + V.max[0]) / 2, cy = (V.min[1] + V.max[1]) / 2, cz = (V.min[2] + V.max[2]) / 2;
    const y0 = eye;
    // does the line from p to the object's centre stay on walkable ground until it reaches the object?
    const clear = (x, z) => { if (!losUser && !(G.grid && G.grid.los) && wallBetween(x, z, cx, cz, V)) return false; if (losUser) { const qx = Math.max(V.min[0], Math.min(x, V.max[0])), qz = Math.max(V.min[2], Math.min(z, V.max[2])); if (!losUser(x, z, cx, cz) && !losUser(x, z, qx, qz)) return false; } else if (G.grid && G.grid.los) { const qx = Math.max(V.min[0], Math.min(x, V.max[0])), qz = Math.max(V.min[2], Math.min(z, V.max[2])); if (!G.grid.los(x, z, cx, cz) && !G.grid.los(x, z, qx, qz)) return false; } const n = 12; for (let i = 1; i < n; i++) { const px = x + (cx - x) * i / n, pz = z + (cz - z) * i / n; if (rectDist(px, pz, t) < 0.06) return true; if (walkUser ? false : (G.grid && G.grid.open && !G.grid.open(Math.floor(px), Math.floor(pz)))) return false; } return true; };
    const big = Math.max(V.max[0] - V.min[0], V.max[2] - V.min[2]) > 1.5;
    const aimPt = (x, z) => big ? [Math.max(V.min[0] + 0.05, Math.min(x, V.max[0] - 0.05)), cy, Math.max(V.min[2] + 0.05, Math.min(z, V.max[2] - 0.05))] : [cx, cy, cz];
    const poseAt = (a, d) => { // d metres from the rectangle of the object, in direction a
      let lo = 0, hi = 6;
      for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if (rectDist(cx + Math.cos(a) * m, cz + Math.sin(a) * m, t) < d) lo = m; else hi = m; }
      return [cx + Math.cos(a) * hi, cz + Math.sin(a) * hi];
    };
    const poses = [];
    for (let k = 0; k < ${AZ}; k++) for (const d of [0.6, 0.9, 1.2, 1.5, 1.8, 2.1]) {
      const a = k * 2 * Math.PI / ${AZ}; const [x, z] = poseAt(a, d);
      if (walk(x, z) && clear(x, z)) poses.push({ k, d, x, z });
    }
    let n7 = 0, ok7 = 0, n20 = 0, ok20 = 0; const lost = {}; // lost: what was selected instead, within 7 deg
    const dirs = 8;
    for (const p of poses) {
      const [yaw, pitch] = lookAt(p.x, y0, p.z, ...aimPt(p.x, p.z));
      for (const r of [0, 3, 6, 9, 12, 16, 20]) for (let j = 0; j < (r ? dirs : 1); j++) {
        const a = j * 2 * Math.PI / dirs, aid = sel(p.x, y0, p.z, yaw + Math.cos(a) * r * rad / Math.max(0.2, Math.cos(pitch)), pitch + Math.sin(a) * r * rad), s = aid === t.id;
        n20++; if (s) ok20++; if (r <= 7) { n7++; if (s) ok7++; else { const k = aid == null ? '(nothing)' : aid; lost[k] = (lost[k] || 0) + 1; } }
      }
    }
    // reach, px and max offset from squarely-looked-at poses
    const reaches = [], pxs = [], offs = [], covs = [];
    for (let k = 0; k < ${AZ}; k++) {
      const a = k * 2 * Math.PI / ${AZ};
      let best = 0, got = false;
      for (let d = 0.5; d <= 4.0; d += 0.1) { const [x, z] = poseAt(a, d); if (!walk(x, z) || !clear(x, z)) { if (got) continue; else continue; }
        const [yaw, pitch] = lookAt(x, y0, z, ...aimPt(x, z)); if (sel(x, y0, z, yaw, pitch) === t.id) { best = d; got = true; } else if (got && d - best > 0.35) break; }
      if (best > 0) reaches.push(best);
      const [x, z] = poseAt(a, 1.5); if (!walk(x, z) || !clear(x, z)) continue;
      const [yaw, pitch] = lookAt(x, y0, z, ...aimPt(x, z));
      if (!big) { // coverage: aim at 5 points of what is SEEN (centre and four around it)
        const tx = -Math.sin(a), tz = Math.cos(a), wv = 0.3 * (Math.abs(tx) * (V.max[0] - V.min[0]) + Math.abs(tz) * (V.max[2] - V.min[2])), hv = 0.3 * (V.max[1] - V.min[1]);
        let c = 0;
        for (const [u, v] of [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]]) { const [yy, pp] = lookAt(x, y0, z, cx + tx * u * wv, cy + v * hv, cz + tz * u * wv); if (sel(x, y0, z, yy, pp) === t.id) c++; }
        covs.push(c / 5);
      }
      if (sel(x, y0, z, yaw, pitch) !== t.id) { pxs.push(0); offs.push(0); continue; }
      const ext = (dy, dp) => { let m = 0; for (let v = 0.25; v <= 40; v += 0.25) { if (sel(x, y0, z, yaw + dy * v * rad, Math.max(-1.5, Math.min(1.5, pitch + dp * v * rad))) === t.id) m = v; else break; } return m; };
      const l = ext(1, 0), r = ext(-1, 0), u = ext(0, 1), dn = ext(0, -1);
      const w = (Math.tan(l * rad) + Math.tan(r * rad)) * f, h = (Math.tan(u * rad) + Math.tan(dn * rad)) * f;
      pxs.push(Math.min(w, h)); offs.push(Math.max(l, r, u, dn));
    }
    const med = (a) => { if (!a.length) return 0; a = [...a].sort((p, q) => p - q); return a[a.length >> 1]; };
    out.push({ id: t.id, size: [t.max[0] - t.min[0], t.max[1] - t.min[1], t.max[2] - t.min[2]].map((v) => +v.toFixed(2)), poses: poses.length,
      frac7: n7 ? ok7 / n7 : null, frac20: n20 ? ok20 / n20 : null, px: pxs.length ? med(pxs) : null, cover: covs.length ? covs.reduce((a, b) => a + b, 0) / covs.length : null, reach: reaches.length ? Math.max(...reaches) : 0, maxOff: offs.length ? med(offs) : null, lost: Object.entries(lost).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => [k, +(v / Math.max(1, n7)).toFixed(2)]) });
  }
  cam.position.copy(save.p); cam.rotation.copy(save.r);
  return JSON.stringify(out);
})()`;

let code = 0;
const p = await launch({ width: W, height: H });
try {
  await p.goto(url);
  await p.waitFor(`(() => { const G = ${GAME}; return !!G && (${READY}); })()`, 150000);
  await p.sleep(1500);
  if (KIT) { const src = fs.readFileSync(path.join(HERE, "../js/kit/interact-select.js"), "utf8"); await p.eval(`(async () => { window.__kitSel = await import(URL.createObjectURL(new Blob([${JSON.stringify(src)}], { type: 'text/javascript' }))); })()`); }
  if (PREP) await p.eval(`(async () => { const G = ${GAME}; ${PREP} })()`);
  const rows = JSON.parse(await p.eval(SWEEP));
  const bad = (r) => r.poses === 0 ? null : (r.frac7 < 0.85 ? "角度" : r.cover != null && r.cover < 0.9 ? "見た目" : r.px < 44 ? "px" : r.reach < 1.8 ? "距離" : null);
  const ok = rows.filter((r) => r.poses > 0);
  const allow = new Set(String(opt("--allow", "")).split(",").filter(Boolean)); // known residual ids (documented in the game)
  const flagged = ok.filter((r) => bad(r) && !allow.has(r.id));
  const pct = (v) => (v == null ? "  -" : String(Math.round(v * 100)).padStart(3) + "%");
  const score = (r) => r.frac7 + (r.cover ?? 1) + Math.min(1, r.px / 44) + Math.min(1, r.reach / 1.8);
  const worst = [...ok].sort((a, b) => score(a) - score(b)).slice(0, +opt("--top", 10));
  console.log(`select-range: ${rows.length} interactables, ${ok.length} with approach poses, ${flagged.length} flagged (frac7<85% or px<44 or reach<1.8m)`);
  console.log("id".padEnd(16) + "size(m)".padEnd(18) + "poses  frac7 frac20 cover    px  reach maxOff  flag  (instead:)");
  for (const r of worst) console.log(String(r.id).padEnd(16) + r.size.join("x").padEnd(18) + String(r.poses).padStart(5) + " " + pct(r.frac7) + "  " + pct(r.frac20) + " " + pct(r.cover) + String(Math.round(r.px ?? 0)).padStart(6) + String(r.reach.toFixed(1)).padStart(7) + String(Math.round(r.maxOff ?? 0)).padStart(7) + "  " + (bad(r) || "") + (bad(r) && r.lost && r.lost.length ? "  " + r.lost.map(([k, v]) => k + " " + Math.round(v * 100) + "%").join(", ") : ""));
  const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
  console.log(`mean frac7 ${pct(mean(ok.map((r) => r.frac7)))}  mean px ${Math.round(mean(ok.map((r) => r.px)))}  no-pose objects: ${rows.length - ok.length}`);
  if (opt("--json", null)) fs.writeFileSync(opt("--json"), JSON.stringify({ url, rows, flagged: flagged.map((r) => r.id) }, null, 1));
  if (flag("--strict") && flagged.length) code = 1;
} catch (e) {
  console.error("select-range: could not drive the page: " + e.message);
  code = 2;
} finally {
  await p.close();
  if (server) server.kill();
}
process.exit(code);
