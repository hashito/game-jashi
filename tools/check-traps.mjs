#!/usr/bin/env node
// No place that shuts you in (rule: every place you can get to can also be left). Headless: opens the game (?qa=1), then on a 0.1 m grid
// tests the controller's circle (r 0.28) against every solid collider at body height (closed doors count as open: they can be opened) and
// flood-fills the free floor. Reports the hiding spots (plan.hides), stations and room centres that are not on the main walkable area, and
// closed-off pockets bigger than 0.3 m2 (a place a hide / teleport / push could put the player and they could not walk out of).
//   node tools/check-traps.mjs [game-dir] [--warn]      exit 1 on a pocket or an unreachable hide / station (--warn: report only)
// Found in 八尺様 (2026-11): a bus shelter turned the wrong way round shut in whoever hid in it.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { launch } from './cdp.mjs';

const args = process.argv.slice(2), dir = path.resolve(args.find((a) => !a.startsWith('--')) || '.'), warn = args.includes('--warn');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 20000 + Math.floor(Math.random() * 20000);
const server = spawn(process.execPath, [path.join(dir, 'tools/serve.js'), '--port', String(port)], { cwd: dir, stdio: 'ignore' });
const base = `http://127.0.0.1:${port}/`;
for (let i = 0; i < 50; i++) { if (await fetch(base).then((r) => r.ok).catch(() => false)) break; await sleep(100); }
const p = await launch({ width: 1280, height: 720 });
let bad = 0;
try {
  await p.goto(`${base}?qa=1&gftest=1`);
  await p.waitFor("window.__game && window.__game.world && window.__game.world.colliders", 90000);
  await sleep(1500);
  const r = JSON.parse(await p.eval(`(${inPage.toString()})()`));
  const hard = r.notReachable.filter(([k]) => k !== 'room');   // a room centre can sit inside furniture or a paddy: listed, not an error
  console.log(`check-traps: ${path.basename(dir)}  walkable ${r.mainArea} m2  pockets ${r.pockets.length}  unreachable hides / stations ${hard.length}`);
  for (const x of r.pockets) console.log(`  ${warn ? 'WARN' : 'ERROR'} closed-off pocket ${x[1]} m2 at (${x[2]}, ${x[3]})`);
  for (const x of hard) console.log(`  ${warn ? 'WARN' : 'ERROR'} ${x[0]} ${x[1]} at (${x[2]}, ${x[3]}) is not on the main walkable area (${x[4]})`);
  for (const x of r.notReachable.filter(([k]) => k === 'room')) console.log(`  note: the centre of room ${x[1]} is ${x[4]}`);
  bad = r.pockets.length + hard.length;
} finally { await p.close(); server.kill(); }
process.exit(bad && !warn ? 1 : 0);

// runs in the page (window.__game, the plan from game.json)
async function inPage() {
  const g = window.__game, W = g.world, R = 0.28, S = 0.1;
  const plan = await (await fetch((await (await fetch('game.json')).json()).data.plan || 'data/plan.json')).json();
  const doorCols = new Set(); if (W.doors) for (const d of W.doors.values()) { if (d.col) doorCols.add(d.col); if (d.collider) doorCols.add(d.collider); }
  const cols = W.colliders.filter((c) => !c.off && !doorCols.has(c) && c.box.max.y >= 0.15 && c.box.min.y <= 1.6);
  const rooms = plan.rooms.filter((r) => !r.y);
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const r of rooms) { x0 = Math.min(x0, r.x); z0 = Math.min(z0, r.z); x1 = Math.max(x1, r.x + r.w); z1 = Math.max(z1, r.z + r.d); }
  const nx = Math.ceil((x1 - x0) / S), nz = Math.ceil((z1 - z0) / S), free = new Uint8Array(nx * nz);
  const inRoom = (x, z) => rooms.some((r) => x >= r.x && x <= r.x + r.w && z >= r.z && z <= r.z + r.d);
  // door openings: a door gap through the room walls is free when the wall colliders leave it (world walls are colliders too)
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const x = x0 + (i + 0.5) * S, z = z0 + (j + 0.5) * S;
    let ok = inRoom(x, z);
    if (ok) for (const c of cols) { const b = c.box; const cx = Math.max(b.min.x, Math.min(x, b.max.x)), cz = Math.max(b.min.z, Math.min(z, b.max.z)); if ((x - cx) ** 2 + (z - cz) ** 2 < R * R) { ok = false; break; } }
    free[i + j * nx] = ok ? 1 : 0;
  }
  const comp = new Int32Array(nx * nz).fill(-1), sizes = [];
  for (let k = 0; k < free.length; k++) if (free[k] && comp[k] < 0) {
    const id = sizes.length; let n = 0; const st = [k]; comp[k] = id;
    while (st.length) { const c = st.pop(); n++; const i = c % nx, j = (c / nx) | 0; for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= nx || b >= nz) continue; const q = a + b * nx; if (free[q] && comp[q] < 0) { comp[q] = id; st.push(q); } } }
    sizes.push(n);
  }
  const main = sizes.indexOf(Math.max(...sizes));
  const near = (x, z, rad = 0.6) => { const i0 = Math.floor((x - x0) / S), j0 = Math.floor((z - z0) / S); let best = null, bd = 1e9; const m = Math.ceil(rad / S); for (let di = -m; di <= m; di++) for (let dj = -m; dj <= m; dj++) { const i = i0 + di, j = j0 + dj; if (i < 0 || j < 0 || i >= nx || j >= nz) continue; const k = i + j * nx; if (!free[k]) continue; const d = di * di + dj * dj; if (comp[k] === main) { if (d < bd) { bd = d; best = 'main'; } } else if (best !== 'main' && d < bd) { bd = d; best = 'pocket' + comp[k] + '(' + (sizes[comp[k]] * S * S).toFixed(1) + 'm2)'; } } return best || 'blocked'; };
  const pts = [];
  for (const h of plan.hides || []) pts.push(['hide', h.id, h.x, h.z, 0.6]);
  for (const s of plan.stations || []) pts.push(['station', s.id, s.x, s.z, 1.4]);
  for (const r of rooms) pts.push(['room', r.id, r.x + r.w / 2, r.z + r.d / 2, 2.5]);
  const bad = pts.map(([k, id, x, z, rad]) => [k, id, x, z, near(x, z, rad)]).filter((p) => p[4] !== 'main');
  // pockets inside rooms bigger than 0.3 m2 that the main area cannot reach (a place you could be put / pushed into and not leave)
  const pockets = [];
  sizes.forEach((n, id) => { if (id === main || n * S * S < 0.3) return; let sx = 0, sz = 0, c = 0; for (let k = 0; k < comp.length; k++) if (comp[k] === id) { sx += k % nx; sz += (k / nx) | 0; c++; } pockets.push([id, +(n * S * S).toFixed(2), +(x0 + (sx / c + 0.5) * S).toFixed(1), +(z0 + (sz / c + 0.5) * S).toFixed(1)]); });
  return JSON.stringify({ grid: [nx, nz], mainArea: +(sizes[main] * S * S).toFixed(0), notReachable: bad, pockets });
}
