// Screenshot review (feedback 2026-11-02: "screenshot every key point, and check more than the normal route").
// Runs headless (tools/cdp.mjs, never a visible window), takes every shot listed in a review plan and writes a report with what the screen
// said at each one (the [E] prompt, the thought band, the open window), so a person (or Claude) can look at every picture.
//   node tools/review-shots.mjs [review.json] [--out shots/review] [--only name,name] [--mobile]
// review.json: { "runs": [ { "name", "query": "?qa=1", "steps": [ step, ... ] } ] }   (each run is a fresh page load)
// step: { "name", "tasks": [ids to complete first], "flags": [..], "items": [ids to own], "close": true,
//         "focus": { "x", "y", "z", "floor", "dist" }  -> stand at a clear spot `dist` m away and look at the point (picks a direction no wall blocks)
//         "at": { "x", "z", "floor", "yaw", "pitch" }, "eval": "js (g = window.__game)", "keys": ["KeyE"], "hold": { "KeyW": 1500 },
//         "wait": ms, "shot": true | "file-name", "expect": "js returning true or a problem string" }
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { launch } from './cdp.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(`--${k}`) ? args[args.indexOf(`--${k}`) + 1] : d);
const planFile = args.filter((a, i) => !a.startsWith('--') && !['--out', '--only'].includes(args[i - 1]))[0] || 'tools/review.json';
const mobile = args.includes('--mobile');
const only = opt('only', '') ? opt('only').split(',') : null;
const out = opt('out', mobile ? 'shots/review-mobile' : 'shots/review');
const plan = JSON.parse(fs.readFileSync(planFile, 'utf8'));
fs.mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 20000 + Math.floor(Math.random() * 20000);
const server = spawn(process.execPath, ['tools/serve.js', '--port', String(port)], { stdio: 'ignore' });
const base = `http://127.0.0.1:${port}/`;
for (let i = 0; i < 50; i++) { if (await fetch(base).then((r) => r.ok).catch(() => false)) break; await sleep(100); }

// in-page helpers: close every window (level-up notes arrive a moment after a task), aim at a point from a clear side, read the screen
const HELPERS = `window.__rv = {
  async closeAll() { const g = window.__game; let calm = 0;
    for (let i = 0; i < 40 && calm < 3; i++) { const mg = document.getElementById('mg-custom'); if ((g.wm && g.wm.isOpen) || (g.ui && g.ui.open) || mg) { calm = 0; g.wm && g.wm.isOpen && g.wm.close(); g.ui && g.ui.open && g.ui.close && g.ui.close(); if (mg) { const x = [...mg.querySelectorAll('button')].find((b) => /閉じる|やめる|戻る/.test(b.textContent)); x ? x.click() : document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true })); } } else calm++; await new Promise((r) => setTimeout(r, 150)); } },
  async focus(f) { const g = window.__game, THREE = await import('three'); const T = new THREE.Vector3(f.x, f.y ?? 1, f.z), floorY = (f.floor || 0) * 3.2;
    const boxes = (g.world.colliders || []).map((c) => c.box || c).filter((b) => b && b.max && !(b.off));
    const best = []; const dist = f.dist || 1.6;
    for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; for (const d of [dist, dist * 1.4, dist * 0.75]) {
      const P = new THREE.Vector3(f.x + Math.sin(a) * d, floorY + 1.55, f.z + Math.cos(a) * d);
      if (boxes.some((b) => b.containsPoint(P))) continue;
      const dir = T.clone().sub(P), len = dir.length(); dir.normalize(); const ray = new THREE.Ray(P, dir), hit = new THREE.Vector3();
      const blocked = boxes.some((b) => !b.containsPoint(T) && ray.intersectBox(b, hit) && hit.distanceTo(P) < len - 0.25);
      if (!blocked) { best.push({ P, d }); break; } } if (best.length >= 1 && f.first) break; }
    if (!best.length) return 'no clear view';
    best.sort((u, v) => Math.abs(u.d - dist) - Math.abs(v.d - dist)); const P = best[0].P;
    g.teleport({ x: P.x, z: P.z, floor: f.floor || 0, yaw: Math.atan2(-(T.x - P.x), -(T.z - P.z)) });
    g.fp.yaw = Math.atan2(-(T.x - P.x), -(T.z - P.z)); g.fp.pitch = Math.atan2(T.y - (floorY + 1.55), Math.hypot(T.x - P.x, T.z - P.z)); return 'ok'; },
  screen() { const vis = (e) => e && e.offsetParent !== null && getComputedStyle(e).visibility !== 'hidden';
    const txt = (sel) => [...document.querySelectorAll(sel)].filter(vis).map((e) => e.textContent.trim().replace(/\\s+/g, ' ')).filter(Boolean);
    const g = window.__game;
    return { room: g.state.room, floor: g.floor, stage: g.prog && g.prog.index, prompt: txt('#prompt, .gf-prompt, [data-hud-part=prompt]').slice(0, 2), say: txt('#say, .gf-say').slice(0, 2), window: txt('.gf-win-title, .wm-title, .gf-window h2').slice(0, 2), lane: txt('.tl-item').slice(0, 3) }; },
};`;

const report = [`# 画面の点検（${new Date().toISOString().slice(0, 10)}${mobile ? '、スマホ幅' : ''}）`, ''];
let problems = 0, n = 0;
for (const run of plan.runs) {
  if (only && !only.includes(run.name) && !run.steps.some((s) => only.includes(s.name))) continue;
  const p = await launch(mobile ? { width: 844, height: 390, mobile: true } : { width: 1280, height: 720 });
  report.push(`## ${run.name}`, '');
  try {
    await p.goto(base + (run.query ?? '?qa=1') + (mobile ? '&touch=1' : ''));
    await p.waitFor("window.__game && document.getElementById('start-btn') && !document.getElementById('start-btn').disabled", 90000);
    await p.eval(HELPERS);
    for (const s of run.steps) {
      if (only && !only.includes(run.name) && !only.includes(s.name)) continue;
      if (s.eval && s.beforeStart) await p.eval(`(async () => { const g = window.__game; ${s.eval} })()`);
      if (s.start !== false && !(await p.eval('!!(window.__game.state.started)'))) {
        if (s.name === 'title' && s.shot) { await sleep(s.wait || 800); await p.shot(path.join(out, `${run.name}-title.jpg`)); report.push(`- **title**: ![](${run.name}-title.jpg)`); n++; continue; }
        await p.eval("(() => { const b = document.getElementById('start-btn'); b.scrollIntoView({ block: 'center' }); b.click(); })()"); for (let i = 0; i < 20 && !(await p.eval('!!__game.state.started')); i++) { await sleep(150); await p.eval("(() => { const go = [...document.querySelectorAll('#controls-go, [id$=\"-go\"]')].find((b) => b.offsetWidth); if (go) return go.click(); const e = document.getElementById('controls'); if (e && !e.classList.contains('hidden') && getComputedStyle(e).display !== 'none') e.click(); })()"); }   /* a game's own start card (miru-delivery #controls) */
        await p.waitFor('__game.state.started', 15000); await sleep(1200);
      }
      const r = await p.eval(`(async () => { const g = window.__game, rv = window.__rv; let note = '';
        ${s.close === false ? '' : 'await rv.closeAll();'}
        for (const id of ${JSON.stringify(s.items || [])}) if (!g.state.inv.includes(id)) g.state.inv.push(id);
        for (const f of ${JSON.stringify(s.flags || [])}) g.setFlag ? g.setFlag(f) : 0;
        for (const id of ${JSON.stringify(s.tasks || [])}) if (!g.state.tasks.includes(id)) { g.completeTask(id, { quiet: true, noSave: true }); await rv.closeAll(); }
        ${s.close === false ? '' : 'await rv.closeAll();'}
        ${s.focus ? `note = await rv.focus(${JSON.stringify(s.focus)});` : ''}
        ${s.at ? `g.teleport({ x: ${s.at.x}, z: ${s.at.z}, floor: ${s.at.floor || 0}, yaw: ${s.at.yaw || 0} }); g.fp.yaw = ${s.at.yaw || 0}; g.fp.pitch = ${s.at.pitch || 0};` : ''}
        ${s.eval && !s.beforeStart ? s.eval : ''}
        return note; })()`).catch((e) => 'ERR ' + e.message);
      if ((s.keys || []).length) await sleep(300);   // let a frame place the camera first: [E] and the tap pick from the camera's current view
      for (const k of s.keys || []) { if (mobile && k === 'KeyE') { await p.eval('window.__game.tapSelect(innerWidth / 2, innerHeight / 2)'); await sleep(250); continue; }   // on a phone [E] is a tap on the thing
        await p.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { code: '${k}', key: '${k.replace('Key', '').toLowerCase()}' })); window.dispatchEvent(new KeyboardEvent('keyup', { code: '${k}', key: '${k.replace('Key', '').toLowerCase()}' }))`); await sleep(250); }
      for (const [k, ms] of Object.entries(s.hold || {})) { await p.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { code: '${k}' }))`); await sleep(ms); await p.eval(`window.dispatchEvent(new KeyboardEvent('keyup', { code: '${k}' }))`); }
      await sleep(s.wait ?? 1500);
      const scr = await p.eval('JSON.stringify(window.__rv.screen())').then(JSON.parse).catch(() => ({}));
      let bad = r && String(r).startsWith('ERR') ? r : r === 'no clear view' ? 'no clear view' : '';
      if (s.expect) { const e = await p.eval(`(() => { const g = window.__game, scr = ${JSON.stringify(scr)}; return (${s.expect}); })()`).catch((x) => 'expect threw: ' + x.message); if (e !== true) bad = bad || String(e); }
      const file = s.shot ? `${run.name}-${typeof s.shot === 'string' ? s.shot : s.name}.jpg` : '';
      if (file) { await p.shot(path.join(out, file)); n++; }
      if (bad) problems++;
      report.push(`- **${s.name}**${bad ? ` — 問題: ${bad}` : ''}${file ? `: ![](${file})` : ''}`);
      const said = [...(scr.prompt || []), ...(scr.say || []), ...(scr.window || []).map((w) => `窓「${w}」`), ...(scr.lane || []).map((w) => `通知「${w}」`)];
      if (said.length) report.push(`  - 画面: ${said.join(' ／ ')}`);
    }
    const errs = p.errors.filter((e) => !/favicon/.test(e));
    if (errs.length) { problems += errs.length; report.push('', `エラー: ${errs.slice(0, 5).join(' | ')}`); }
  } catch (e) { problems++; report.push(`- 中断: ${e.message}`); } finally { await p.close(); }
  report.push('');
}
server.kill();
fs.writeFileSync(path.join(out, 'report.md'), report.join('\n') + '\n');
console.log(`review: ${n} shots, ${problems} problem(s) -> ${path.join(out, 'report.md')}`);
process.exit(problems ? 1 : 0);
