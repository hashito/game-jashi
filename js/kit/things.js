/* game-kit 6e0b6f0: js/things.js — edit in game-kit and run tools/kit-sync.js */
// "Things you can look at" (standard 1.5): data/things.json + the examine interaction. (届けるな has 107 of them; 未然調書 / 日陰 / 薬局 have the same.)
//   things.json: [ { "id": "A_CLOCK", "room": "A", "position": [4, 17], "y": 1.25, "label": "勤怠端末", "photo": "assets/media/th_A_CLOCK.jpg",
//                    "text": ["first look", "second look and later"], "feeling": "the protagonist's one line (journal + card)", "requires": { "stage": "L2", "flags": [..], "tasks": [..], "items": [..], "looked": [..] }, "size": 0.6 } ]
//     position [x, z] (metres, in the room) or { x, z, y }; legacy `at` + `y` are read too. `text` may be a string. `requires`: it is only examinable once all of these hold (else it is not there).
// Pressing [E] on one (interact kind "look", prompt "[E] 調べる：label"):
//   - the card (photo + label + the protagonist's feeling as its own panel, U19) pops up on the HUD, the first / repeat line goes to the thought band (ctx.monologue),
//   - it is recorded as looked (ctx.state.looked, saved with the game: ext.things) and shows in the journal (気になること) grouped by room, with its photo and feeling,
//   - events: item:view { id }, thing:look { id, n }; a step-guide step `{ "done": "look", "emphasis": "look:A_CLOCK" }` is done when it is the target.
// A world that places its own props binds them: ctx.things.attach(id, mesh) (the mesh gets the interact); otherwise an invisible box marks the spot.
// Pure part (Node): normalize / textFor / available / journalEntries / checkThings. DOM + THREE part: installThings(ctx), called by game-core when data.things exists.
import * as THREE from 'three';
import { viewItemHtml } from './inventory-ui.js';
import { gfRegister, gfEmit, gfOk, gfFail, gfUnknown } from './gf-test.js';

import { KIND, normalize, textFor, available, journalEntries, checkThings } from './things-data.js';
export { KIND, normalize, textFor, available, journalEntries, checkThings };

// ---------------- DOM + THREE ----------------
export function installThings(ctx) {
  const raw = ctx.data.things;
  if (!raw) return null;
  const { bus, world, ext } = ctx;
  const things = raw.map(normalize);
  const byId = new Map(things.map((t) => [t.id, t]));
  const counts = {};                                   // id -> times looked
  ctx.state.looked = ctx.state.looked || [];
  const roomName = (id) => ((ctx.data.plan.rooms.find((r) => r.id === id) || {}).name) || id;
  const st = () => ({ flags: ctx.state.flags, tasks: ctx.state.tasks, items: ctx.state.inv, looked: ctx.state.looked, levelIndex: ctx.prog ? ctx.prog.index : 0, levelOf: (id) => (ctx.levelIndex ? ctx.levelIndex(id) : 0) });
  const meshes = new Map();

  const mark = (t) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(t.size, Math.max(0.3, t.size), t.size), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
    m.name = `${KIND}:${t.id}`; m.position.y = t.y; m.userData.interact = t.terminal ? { kind: 'terminal', id: t.terminal } : { kind: KIND, id: t.id };   // a thing with "terminal" opens that terminal screen (js/terminal-screen.js)
    if (world.place) world.place(m, t.room, t.x, t.z); else { m.position.x = t.x; m.position.z = t.z; world.group && world.group.add(m); }
    world.interactables.push(m); meshes.set(t.id, m);
  };
  const place = () => { for (const t of things) if (!meshes.has(t.id)) mark(t); };
  const refresh = () => { for (const t of things) { const m = meshes.get(t.id); if (!m) continue; const on = available(t, st()); if (m.userData.off !== !on) { m.userData.off = !on; const i = world.interactables.indexOf(m); if (on && i < 0) world.interactables.push(m); if (!on && i >= 0) world.interactables.splice(i, 1); } } };
  place();

  let card = null, cardT = 0;
  const showCard = (t) => {
    if (ctx.lane) { ctx.lane.push({ kind: 'card', cls: 'tl-lookcard', key: `look:${t.id}`, ttl: 6000, html: viewItemHtml({ photo: t.photo, title: t.label, feeling: t.feeling }) }); return; }   // U27: the look-at card is an item of the toast lane (no box of its own that could sit on the clock)
    if (!card) { card = document.createElement('div'); card.id = 'look'; card.className = 'gf-look'; ctx.hud.appendChild(card); }
    card.innerHTML = viewItemHtml({ photo: t.photo, title: t.label, feeling: t.feeling });
    card.classList.remove('show'); void card.offsetWidth; card.classList.add('show');
    clearTimeout(cardT); cardT = setTimeout(() => card && card.classList.remove('show'), 6000);
  };
  const examine = (id) => {
    const t = byId.get(id);
    if (!t || !available(t, st())) return false;
    const n = counts[id] || 0;
    counts[id] = n + 1;
    if (!ctx.state.looked.includes(id)) ctx.state.looked.push(id);
    ctx.sound && ctx.sound('paper');
    const line = textFor(t, n);
    if (t.photo || t.feeling) showCard(t);
    if (line) (ctx.monologue || (() => {}))(line, 4);
    bus.emit('item:view', { id }); bus.emit('thing:look', { id, n: n + 1 });
    gfEmit('things', 'look', { id, n: n + 1 });
    ctx.save && ctx.save();
    return true;
  };
  ext.registerInteract(KIND, { prompt: (o) => { const t = byId.get(o.id); return t ? `[E] 調べる：${t.label}` : ''; }, run: (o) => examine(o.id) });
  ext.registerPersist('things', { serialize: () => ({ looked: ctx.state.looked.slice(), counts: { ...counts } }), restore: (j) => { ctx.state.looked = j && j.looked ? j.looked.slice() : []; for (const k of Object.keys(counts)) delete counts[k]; Object.assign(counts, (j && j.counts) || {}); refresh(); } });
  for (const ev of ['flag:set', 'task:done', 'stage:up', 'item:pickup', 'state:sync', 'game:start', 'thing:look']) bus.on(ev, refresh);
  refresh();

  const api = {
    things, byId, counts, examine, refresh, place,
    attach(id, mesh) { const t = byId.get(id); if (!t) return false; const old = meshes.get(id); if (old) { const i = world.interactables.indexOf(old); if (i >= 0) world.interactables.splice(i, 1); } mesh.userData.interact = { kind: KIND, id }; meshes.set(id, mesh); if (!world.interactables.includes(mesh)) world.interactables.push(mesh); refresh(); return true; },
    entries: () => journalEntries(things, ctx.state.looked, roomName),
    available: (id) => !!byId.get(id) && available(byId.get(id), st()),
  };
  ctx.things = api;
  gfRegister('things', () => ({
    snapshot: () => ({ total: things.length, looked: ctx.state.looked.slice(), counts: { ...counts }, available: things.filter((t) => available(t, st())).map((t) => t.id) }),
    drive(action, a = {}) {
      switch (action) {
        case 'examine': if (!byId.has(a.id)) return gfFail(`unknown thing "${a.id}"`); return examine(a.id) ? gfOk({ n: counts[a.id] }) : gfFail(`"${a.id}" is not available yet`);
        default: return gfUnknown(action);
      }
    },
    reset: () => { ctx.state.looked = []; for (const k of Object.keys(counts)) delete counts[k]; refresh(); },
  }));
  return api;
}
