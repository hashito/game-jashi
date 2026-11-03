#!/usr/bin/env node
// Headless first-steps smoke (no visible window): serve the game, start it with the real title button, walk, pick up the item,
// read the doc, do the tasks through the real [E] key, open the doors the stages unlock and reach an ending.
//   node tools/smoke.mjs [--mobile] [--shots dir] [--url http://host/]     (--url: test an already running server)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { launch } from './cdp.mjs';

const args = process.argv.slice(2);
const mobile = args.includes('--mobile');
const shots = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : null;
if (shots) fs.mkdirSync(shots, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let server = null, base = args.includes('--url') ? args[args.indexOf('--url') + 1] : null;
if (!base) {
  const port = 20000 + Math.floor(Math.random() * 20000);
  server = spawn(process.execPath, [path.join(import.meta.dirname, 'serve.js'), '--port', String(port)], { stdio: 'ignore' });
  base = `http://127.0.0.1:${port}/`;
  for (let i = 0; i < 50; i++) { if (await fetch(base).then((r) => r.ok).catch(() => false)) break; await sleep(100); }
}
const p = await launch(mobile ? { width: 812, height: 375, mobile: true, dpr: 1 } : { width: 1280, height: 720 });
const t0 = Date.now(), log = (...a) => console.log(`${((Date.now() - t0) / 1000).toFixed(1).padStart(5)}s`, ...a);
let n = 0;
const shot = async (name) => shots && (await p.shot(path.join(shots, `${String(++n).padStart(2, '0')}_${name}.jpg`)));
const G = (expr) => p.eval(`(() => { const g = window.__game; return JSON.stringify(${expr}); })()`).then(JSON.parse);
let failed = null;
const fail = (m) => { failed = failed || m; log('FAIL', m); };
const expect = (ok, m) => { if (!ok) fail(m); else log('ok  ', m); };

try {
  await p.goto(`${base}?qa=1${mobile ? '&touch=1' : ''}`);
  await p.waitFor("window.__game && document.getElementById('start-btn') && !document.getElementById('start-btn').disabled", 90000);   // the button is disabled while the boot steps run
  // a game that shows its own card after the start button (miru-delivery's 「今夜の仕事」 #controls: クリック（タップ）で始める) is tapped through, as a player would
  const passStartCard = async () => { for (let i = 0; i < 20; i++) { await p.sleep(150); if (await p.eval('!!(window.__game && __game.state.started)')) return; const c = await p.eval("(() => { const e = document.getElementById('controls'); if (!e || e.classList.contains('hidden') || getComputedStyle(e).display === 'none') return ''; const b = e.getBoundingClientRect(); return JSON.stringify({ x: b.x + b.width / 2, y: b.y + b.height - 20 }); })()"); if (c) { const q = JSON.parse(c); await p.click(q.x, q.y); return; } } };
  await shot('title');
  // a short landscape phone scrolls the title: bring the button into view before tapping it
  const r = await p.eval("(() => { const b = document.getElementById('start-btn'); b.scrollIntoView({ block: 'center' }); return JSON.stringify(b.getBoundingClientRect()); })()").then(JSON.parse);
  await p.click(r.x + r.width / 2, r.y + r.height / 2);
  await passStartCard();
  await p.waitFor('__game.state.started', 10000);
  await sleep(500);
  expect((await G('g.world.roomAt(g.camera.position.x, g.camera.position.z)')) !== null, 'the player starts inside a room');
  if (mobile) expect(await p.eval("!!document.getElementById('t-stick') && !document.getElementById('touch').classList.contains('hidden')"), 'touch controls are shown');

  // Wait for observable movement; software-rendered CI may produce only a few frames in 700 ms.
  const x0 = await G('[g.camera.position.x, g.camera.position.z]');
  await p.key('KeyW', 'down');
  try { await p.waitFor(`Math.hypot(__game.camera.position.x - ${x0[0]}, __game.camera.position.z - ${x0[1]}) > 0.3`, 15000); }
  finally { await p.key('KeyW', 'up'); }
  const x1 = await G('[g.camera.position.x, g.camera.position.z]');
  expect(Math.hypot(x1[0] - x0[0], x1[1] - x0[1]) > 0.3, 'W walks the player');

  // stand 1.3 m from an interactable (on a side that is inside a room) and look at it
  const approach = (name) => p.eval(`(async () => { const g = window.__game, m = g.world.interactables.find((o) => o.name === ${JSON.stringify(name)});
    if (!m) return 'no such object'; const c = m.getWorldPosition(new m.position.constructor());
    // the floor the thing stands on (multi-floor plans: rooms with "floor"); its height above that floor
    const fy = (f) => (g.world.floorY ? g.world.floorY(f) : f * 3.4); let fl = 0; while (fl < 8 && fy(fl + 1) <= c.y + 0.3) fl++;
    for (const [dx, dz] of [[0, -1.3], [0, 1.3], [-1.3, 0], [1.3, 0]]) {
      if (g.world.roomAt(c.x + dx, c.z + dz, fy(fl) + 1.6) === null) continue;
      g.teleport({ x: c.x + dx, z: c.z + dz, yaw: Math.atan2(dx, dz), floor: fl });
      g.fp.pitch = -Math.atan2(1.65 - (c.y - fy(fl)), 1.3);
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      if (g.target && g.target.kind + ':' + g.target.id === ${JSON.stringify(name)}) return 'ok'; }
    return 'no selectable approach side'; })()`);
  // close whatever window is open (a level-up dialog, a doc): Escape, else its first button
  const dismiss = async () => { for (let i = 0; i < 6 && (await G('!!(g.ui.open || g.wm.isOpen)')); i++) { await p.key('Escape'); await sleep(300); if (await G('!!(g.ui.open || g.wm.isOpen)')) { await p.eval("document.querySelector('.win-foot .btn')?.click()"); await sleep(300); } } };
  const press = async (name, wantPrompt) => {
    await dismiss();
    const a = await approach(name);
    if (a !== 'ok') return fail(`${name}: ${a}`);
    await p.waitFor(`__game.target && (__game.target.kind + ':' + __game.target.id) === ${JSON.stringify(name)}${wantPrompt ? ` && document.getElementById('prompt').textContent.includes(${JSON.stringify(wantPrompt)})` : ''}`, 15000);
    const prompt = await p.eval("document.getElementById('prompt').textContent");
    if (wantPrompt && !prompt.includes(wantPrompt)) fail(`${name}: prompt "${prompt}" lacks "${wantPrompt}"`);
    await p.key('KeyE'); await sleep(450);
    return prompt;
  };

  const items = await G('g.data.items.filter((i) => !i.start && !i.given).map((i) => i.id)');   // given items come from their task
  for (const id of items) { await press(`item:${id}`, '拾う'); expect(await G(`g.state.inv.includes(${JSON.stringify(id)})`), `item ${id} picked up`); }
  const docs = await G('g.data.docs.map((d) => d.id)');
  for (const id of docs) { await press(`doc:${id}`, '読む'); expect(await G(`g.state.docsRead.includes(${JSON.stringify(id)})`), `doc ${id} read`); }
  await shot('first_room');

  // the shell: Tab opens the tab menu (map tab has an svg), Esc closes it, Esc again opens the pause menu, Esc resumes
  await dismiss();
  await p.key('Tab'); await sleep(300);
  expect(await G('g.tm.isOpen'), 'Tab opens the tab menu');
  await G("g.tm.open('map') && 1"); await sleep(300);
  expect(await p.eval("!!document.querySelector('.wm-body svg, .wm-win svg, [class*=wm] svg')"), 'the map tab draws an svg');
  await shot('map');
  await p.key('Escape'); await sleep(300);
  expect(await G('!g.wm.isOpen'), 'Esc closes the tab menu (and does not open the pause menu at once)');
  await p.key('Escape'); await sleep(300);
  expect(await G('g.pm.isOpen'), 'Esc opens the pause menu');
  await shot('pause');
  await p.key('Escape'); await sleep(300);
  expect(await G('!g.wm.isOpen'), 'Esc resumes');

  // tasks in order of the data (needs respected), doors in between
  const tasks = await G('g.data.tasks');
  const doors = await G('g.data.plan.doors.filter((d) => g.world.doors.get(d.id) && !d.open).map((d) => d.id)');   // stairs / lifts are not doors; openings are always open
  const doneAll = () => G('g.data.tasks.every((t) => g.state.tasks.includes(t.id)) || !!g.state.ended');
  let resumed = false;
  for (let round = 0; round < 12 && !(await doneAll()); round++) {
    // a running task timer (a 90 s drain) is waited out: ?qa runs timers 10x (standard 1.10.15, deguchi K7)
    const left = await G('Math.max(0, ...g.data.tasks.filter((t) => t.timer && !g.state.tasks.includes(t.id) && (g.state.timers || {})[t.id] > 0).map((t) => (g.timer(t.id) || {}).left || 0))');
    if (round > 0 && left > 0) await sleep(Math.min(60000, (left / 10) * 1000 + 800));
    for (const d of doors) {
      if (await G(`g.world.doors.get(${JSON.stringify(d)}).isOpen`)) continue;
      const unlocked = await G(`!g.world.doors.get(${JSON.stringify(d)}).locked()`);
      await press(`door:${d}`);
      if (unlocked) await p.waitFor(`__game.world.doors.get(${JSON.stringify(d)}).isOpen`, 15000);
    }
    for (const t of tasks) {
      if (await G('!!g.state.ended')) break;   // an ending was reached: optional tasks left over are not pressed
      if ((await G(`g.state.tasks.includes(${JSON.stringify(t.id)})`)) || (await G(`g.canStart(g.data.tasks.find((x) => x.id === ${JSON.stringify(t.id)}))`)) !== true) continue;
      await press(`station:${t.station}`, t.title);
      await p.waitFor(`__game.state.tasks.includes(${JSON.stringify(t.id)})`, 15000);
      expect(await G(`g.state.tasks.includes(${JSON.stringify(t.id)})`), `task ${t.id} done (${t.title})`);
      await shot(`task_${t.id}`);
      if (!resumed && !(await doneAll())) {
        await dismiss();
        const before = await G('[g.state.tasks, g.state.docsRead, g.state.inv]');
        await p.eval('__game.save()');
        await p.goto(`${base}?qa=1${mobile ? '&touch=1' : ''}`);
        await p.waitFor("window.__game && document.getElementById('continue-btn') && !document.getElementById('continue-btn').classList.contains('hidden') && !document.getElementById('start-btn').disabled", 90000);   // shown before the boot steps end: wait for them (slow phones)
        const rect = JSON.parse(await p.eval("(() => { const b = document.getElementById('continue-btn'); b.scrollIntoView({ block: 'center' }); return JSON.stringify(b.getBoundingClientRect()); })()"));
        await p.click(rect.x + rect.width / 2, rect.y + rect.height / 2);
        await passStartCard();
        await p.waitFor('__game.state.started', 10000);
        expect(JSON.stringify(before) === JSON.stringify(await G('[g.state.tasks, g.state.docsRead, g.state.inv]')), 'reload restores tasks, documents and inventory');
        resumed = true;
      }
    }
  }
  await p.waitFor('__game.state.ended', 15000);
  expect(await G('!!g.state.ended'), 'an ending is reached');
  await shot('ending');
  const errs = p.errors.filter((e) => !/favicon/.test(e));
  expect(errs.length === 0, `no console errors${errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''}`);
} catch (e) { fail(e.message); }
await p.close();
server && server.kill();
console.log(failed ? `SMOKE FAILED: ${failed}` : 'SMOKE OK');
process.exit(failed ? 1 : 0);
