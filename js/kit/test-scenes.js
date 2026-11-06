/* game-kit 1b8c7db: js/test-scenes.js — edit in game-kit and run tools/kit-sync.js */
// Test mode scenes (standard 1.12, from 五人分の朝: 「テストモードで特定のURL引数で特定の画面に移動できるように」).
// The game lists its scenes in js/ext/test-scenes.js and registers them:
//   import { SCENES } from './test-scenes.js';
//   ext.registerTestScenes(SCENES, { api: { field: (from) => ... }, prepare: (scene, a) => ... });
// A scene: { id, group, label, tasks: [ids done quietly], flags: [ids], at: { x, z, yaw, floor }, run(a) }   a = { ctx, talk(key, o), task(id), ...api }
// ?scene=<id> starts at once in test mode (no save written or cleared, a badge): flags and tasks are done with ctx.skipping = true (no task onDone, no
// stage:up, so no talks or lines from the way there), open windows close, prepare() runs, the player is placed, run() runs. game:start carries { scene: id };
// return early on it. An unknown id says so and starts from the beginning. tools/scene-links.mjs writes the README's table of links from the same list.
// Every game also has ?scene=stage:<level id> (standard 1.13): the tasks of the earlier stages done, in the room of that stage's first task.
export const stageScenes = (levels = [], tasks = []) => levels.map((l, i) => ({
  id: `stage:${l.id}`, group: '段階の頭', label: `${i + 1}. ${l.title || l.name || l.id}`,
  tasks: tasks.filter((t) => levels.findIndex((x) => x.id === t.stage) < i).map((t) => t.id),
  room: (tasks.find((t) => t.stage === l.id && t.room) || {}).room || null,
}));
export const sceneIn = (list, id) => (list || []).find((s) => s.id === id) || null;

/** close what opened on the way here (a level-up note arrives a moment after a task) */
export async function settleWindows(ctx, sleep = (ms) => new Promise((r) => setTimeout(r, ms))) {
  for (let i = 0, calm = 0; i < 30 && calm < 3; i++) {
    if ((ctx.wm && ctx.wm.isOpen) || (ctx.ui && ctx.ui.open)) { calm = 0; if (ctx.wm && ctx.wm.isOpen) ctx.wm.close(); if (ctx.ui && ctx.ui.open && ctx.ui.close) ctx.ui.close(); } else calm++;
    await sleep(120);
  }
}

export async function runTestScene(ctx, def, id, sleep) {
  const sc = sceneIn(def && def.list, id); if (!sc) return false;
  ctx.skipping = true;
  try {
    for (const f of sc.flags || []) if (!(ctx.state.flags || []).includes(f)) ctx.setFlag(f, { silent: true });
    for (const t of sc.tasks || []) if (!ctx.state.tasks.includes(t)) ctx.completeTask(t, { quiet: true, noSave: true });
  } finally { ctx.skipping = false; }
  await settleWindows(ctx, sleep);
  const a = { ctx, talk: (k, o) => ctx.talk(k, o), task: (t) => ctx.startTask(t), ...(def.api || {}) };
  if (def.prepare) await def.prepare(sc, a);
  if (sc.room && !sc.at) ctx.teleport(sc.room);
  if (sc.at) { const p = { floor: 0, yaw: 0, ...sc.at }; ctx.teleport(p); if (ctx.fp) { ctx.fp.yaw = p.yaw; ctx.fp.pitch = p.pitch ?? -0.08; } ctx.checkpoint = { ...p }; }
  if (sc.run) await sc.run(a);
  return true;
}
