/* game-kit 9a50101: js/game-core.js — edit in game-kit and run tools/kit-sync.js */
// The standard bootstrap of a 3D first-person game (docs/standard-3d.md). Wires the standard modules from DATA (game.json + data/*.json):
//   runtime base  render-presets (renderer, lights, fog, post, quality tiers; the preset may be a name or { base, ...overrides }),
//                 frame-guard (?perf overlay, dynamic resolution, job queue), controller (walk / look / touch),
//                 store, audio, analytics (GA4: game_start / task_done / ending_reached)
//   world         world-from-plan (plan.json -> rooms, walls, doors, stations) OR the game's own world (ext.registerWorld), items / docs as pickups
//   player        walking, room + floor tracking, checkpoint, die() / respawn (or ext.registerDeath)
//   tasks         progression + progress-ui (goal chip, task screen), task-minigames (kit types) or registered mini games
//   UI shell      win-manager (ONE fixed-size window) + tab-menu [Tab] (items / tasks / notes / map + game tabs) + pause-menu [Esc] +
//                 step-guide (STEP cards, U22/U23) + map-svg (U18) + release-notes + title + endings. KitUI stays only for the
//                 short messages (say / toast) and for progress-ui's level-up dialog.
// Game-specific code goes ONLY into the extension modules listed in game.json "ext" (default export (ext) => void) using js/ext.js.
//
//   import { loadGame } from './kit/game-core.js';
//   const game = await loadGame('game.json');      // fetches the manifest + data, runs the ext modules, builds everything, runs the boot steps
//
// Standard 1.1 additions (from the 届けるな sample): preset overrides + quality tiers + dynamic resolution, a replaceable world / persist / systems /
// boot steps / title buttons / UI sections (ext.registerWorld ... registerUi), input:key event, controls in game.json, ctx.syncOwned, ctx.floor.
//
// Known coupling left: progress-ui's level-up / briefing dialogs still open as KitUI windows (TODO: move them to win-manager).
import * as THREE from 'three';
import { makeItemModel, registerItemKind, topsIn, seatOn, slotOn, DOC_KIND } from './item-kinds.js';
import { makeTheme, applyTheme } from './theme-make.js';
import { THEME_PRESETS } from './theme-presets.js';
import { createSpotFx } from './spot-fx.js';
import { createStageLook } from './stage-look.js';
import { stepSurfaceOf } from './step-sound.js';
import { createTalk } from './talk-ui.js';
import { createRenderer, applyPreset, extendPreset, QualityTier } from './render-presets.js';
import { browserEnv } from './render-budget.js';
import { FirstPersonController } from './controller.js';
import { KitUI, esc, keyText } from './ui.js';
import { ToastLane } from './toast-lane.js';
import { ensureHudSlots, registerHudPart, layoutHudSlots, laneFree, hudTestHooks, schedule as scheduleHudLayout } from './hud-slots.js';
import { Progression } from './progression.js';
import { ProgressUI } from './progress-ui.js';
import { createInventory, viewItemHtml } from './inventory-ui.js';
import { createReleaseNotes } from './release-notes.js';
import { Store } from './store.js';
import { Audio } from './audio.js';
import * as MG from './task-minigames.js';
import { buildWorld, pickInteractable, pickInteractableAt, selectablesOf } from './world-from-plan.js';
import { lockedLabel, exposeGf } from './interact-select.js';
import { icon } from './icons.js';
import { createWindowManager, hudLayout } from './win-manager.js';
import { createTabMenu } from './tab-menu.js';
import { createPauseMenu } from './pause-menu.js';
import { createJournal } from './journal-ui.js';
import { createMapSvg } from './map-svg.js';
import { createStepGuide, minigameSteps } from './step-guide.js';
import { FrameGuard, JobQueue } from './frame-guard.js';
import { warmStandardUi, corpusOf, imagesOf } from './ui-warm.js';
import { preloadImage, whenFontsReady, mountTitleArt, crossfadeToTitle } from './boot.js';
import { track } from './analytics.js';
import { InputMode, LookInput } from './look-input.js';
import { PadInput } from './pad-input.js';
import { roomGraph, roomOf, occlusion } from './audio-at.js';
import { gfRegister, gfOk, gfFail, gfUnknown } from './gf-test.js';
import { createExtensions } from './ext.js';
import { buildProgressionDef, taskAtStation, pickEnding } from './game-data.js';
import { showEndingScene, foundEndings } from './ending-scene.js';

export const CORE_VERSION = '1.10.2';
const $ = (id) => document.getElementById(id);
const Q = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
const safe = (fn, d = null) => { try { return fn(); } catch { return d; } };
const hue = (s) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % 360;
// the on-screen buttons are OPERATION buttons only (standard 1.4): 目標 / 所持品 / 気になること / 地図 are reached from the top-right menu (≡) and the menu icon above the cluster
const DEFAULT_TOUCH = [{ k: 'KeyE', label: '操作', cls: 'big' }];

export { preloadImage, whenFontsReady };   // js/boot.js (first-load screen, docs/load-flicker.md)

export async function loadGame(manifestUrl = 'game.json', o = {}) {
  const base = new URL(manifestUrl, location.href);
  const get = async (u) => { const r = await fetch(new URL(u, base)); if (!r.ok) throw new Error(`${u}: ${r.status}`); return r.json(); };
  const manifest = await get(base.href);
  if (manifest.titleImage && !o.titleArt) o = { ...o, titleArt: preloadImage(new URL(manifest.titleImage, location.href).href) };   // start the key art right away, in parallel with data/*.json and the ext modules
  const data = Object.fromEntries(await Promise.all(Object.entries(manifest.data).map(async ([k, f]) => [k, await get(f)])));
  const ext = o.ext || createExtensions();
  for (const f of manifest.ext || []) { const m = await import(new URL(f, base).href); if (typeof m.default === 'function') await m.default(ext, { manifest, data, base }); }   // (1.1) the ext module gets the loaded data (a game whose rules read it at import time fills its tables here)
  // optional feature modules are loaded only when the manifest / data ask for them (tools/kit-features.cjs is the list kit-sync copies)
  const mods = { ...(o.mods || {}) };
  if (data.monsters && !mods.monsters) mods.monsters = await import('./monster-std.js');
  if (manifest.fx && !mods.fx) mods.fx = await import('./fx-std.js');
  if (manifest.things && data.things && !mods.things) mods.things = await import('./things.js');   // opt-in: a game's own legacy things.json (other format) is not touched
  if (data.terminals && !mods.terminals) mods.terminals = await import('./terminal-screen.js');
  if (manifest.voice && !mods.voice) mods.voice = await import('./voice-fx.js');
  if (data.flavor && !mods.flavor) mods.flavor = await import('./flavor.js');   // data/flavor.json: mood lines (standard 1.10)
  const ctx = createGame({ manifest, data, ext, ...o, mods });
  if (manifest.recipes) await (await import('./recipes.js')).installRecipes(ctx, manifest.recipes);
  ctx.seatPickups && ctx.seatPickups();   // the furniture is in: put the pickups on it (standard 1.7)   // props / openables / textures / ambience, switched on from game.json (standard 1.5)
  await Promise.race([ctx.titleShown, new Promise((r) => setTimeout(r, 1500))]);   // never start the heavy boot steps in the middle of the first crossfade (but never wait more than 1.5 s)
  await ctx.boot();
  return ctx;
}

// "start=chapter3" / "start=3" -> { chapter: 3 }
const startFromUrl = () => { const v = Q.get('start'); if (!v) return null; const d = String(v).replace(/\D/g, ''); return d === '' ? null : { chapter: +d }; };

export function createGame(cfg) {
  const { manifest, data, ext = createExtensions() } = cfg;
  const bus = ext.bus;
  const plan = data.plan, tasks = data.tasks || [], items = data.items || [], docs = data.docs || [], endings = data.endings || [];
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const roomName = (id) => (plan.rooms.find((r) => r.id === id) || {}).name || id;
  const ctx = { padOpen: [], warmSteps: [], manifest, data, ext, bus, THREE, qa: Q.has('qa') || !!cfg.qa, debug: Q.has('debug'), calm: Q.has('calm'), floor: 0, blockers: [], booted: false };
  window.__game = ctx;
  const wdef = ext.reg.world.list().pop() || null;     // the game's own world (ext.registerWorld), else world-from-plan
  const uiDef = (s) => ext.uiOf(s);

  // ---- theme ----
  const root = document.documentElement;
  root.dataset.theme = manifest.theme;
  // standard 1.9: a theme from a few colours (game.json "themeColors", optionally "from" a mood theme), AA-fitted by js/theme-make.js
  if (manifest.themeColors) {
    const { from, ...own } = manifest.themeColors;
    ctx.themeTokens = applyTheme(root, makeTheme({ ...(from ? THEME_PRESETS[from] || {} : {}), ...own }));
  }
  for (const th of ext.reg.theme.list()) {
    if (th.css) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = th.css; document.head.appendChild(l); }
    if (th.tokens) for (const [k, v] of Object.entries(th.tokens)) root.style.setProperty(k, v);
  }

  // ---- state & saves ----
  const store = ctx.store = new Store(manifest.id, 1);
  const settings = ctx.settings = store.settings({ sensitivity: 1, volume: 0.85, calm: false });
  const state = ctx.state = { tasks: [], inv: items.filter((i) => i.start).map((i) => i.id), docsRead: [], doors: [], flags: [], ended: null, started: false, room: null, visited: [] };
  const startInv = [...state.inv];
  let tm = null;
  // an external rules engine (a game with its own state machine) pushes what the player owns / did; the core emits the diff events
  ctx.syncOwned = (o = {}) => {
    const added = {}, removed = {};
    for (const [key, field] of [['items', 'inv'], ['docs', 'docsRead'], ['tasks', 'tasks'], ['flags', 'flags'], ['visited', 'visited'], ['doors', 'doors']]) {
      const next = o[key];
      if (!next) continue;
      const old = state[field];
      added[key] = next.filter((x) => !old.includes(x)); removed[key] = old.filter((x) => !next.includes(x));
      if (field !== 'tasks' && field !== 'flags') state[field] = [...next];
    }
    for (const id of added.items || []) bus.emit('item:pickup', { id });
    for (const id of added.docs || []) bus.emit('doc:read', { id });
    for (const k of added.flags || []) ctx.setFlag(k, { silent: true });
    if (o.flags) state.flags = state.flags.filter((k) => o.flags.includes(k));
    for (const id of added.tasks || []) ctx.completeTask(id, { quiet: !!o.quiet, noSave: true });
    if (o.tasks) state.tasks = state.tasks.filter((id) => o.tasks.includes(id));
    if (tm) tm.refresh();
    if (Object.values(added).some((a) => a.length) || Object.values(removed).some((a) => a.length)) bus.emit('state:sync', { added, removed });
    return { added, removed };
  };
  const snapshot = () => {
    const s = { tasks: state.tasks, inv: state.inv, docsRead: state.docsRead, doors: state.doors, flags: state.flags, visited: state.visited, prog: ctx.prog.serialize(), pos: { x: ctx.camera.position.x, z: ctx.camera.position.z, yaw: ctx.fp.yaw, floor: ctx.floor } };
    const extra = {};
    for (const p of ext.reg.persist.list()) { const v = p.serialize(ctx); if (v === null) return null; extra[p.id] = v; }   // null = do not save now
    if (Object.keys(extra).length) s.ext = extra;
    return s;
  };
  ctx.snapshot = () => snapshot();
  ctx.save = () => { if (!state.ended) { const s = snapshot(); if (s) { store.save(s); bus.emit('game:save', { state: s }); } } };

  // ---- DOM skeleton ----
  const body = document.body;
  const mk = (tag, id, html = '', parent = body) => { let el = $(id); if (!el) { el = document.createElement(tag); el.id = id; parent.appendChild(el); } if (html) el.innerHTML = html; return el; };
  const canvas = mk('canvas', 'view');
  const hud = mk('div', 'hud'); hud.classList.add('hidden');
  mk('div', 'hud-left', '', hud); mk('div', 'guide', '', $('hud-left')); mk('div', 'hud-right', '', hud); mk('div', 'crosshair', '', hud); mk('div', 'prompt', '', hud);
  ctx.hud = hud;
  const controls = manifest.controls || {};
  // input (standard 1.5): mouse / touch / pad are detected from the input actually USED (js/look-input.js InputMode + js/pad-input.js), not from the device once at start;
  // the touch controls are built when the device can touch and shown only while touch is the mode in use
  const inputMode = ctx.inputMode = new InputMode({ mode: Q.has('touch') || cfg.touch ? 'touch' : undefined, pin: Q.has('touch') || !!cfg.touch })   // ?touch=1 pins touch (tests);
  const touchCapable = matchMedia('(pointer: coarse)').matches || matchMedia('(any-pointer: coarse)').matches || (navigator.maxTouchPoints || 0) > 0 || Q.has('touch') || cfg.touch;
  if (touchCapable) {
    const extraTouch = [...(controls.crouch && !(controls.touch || []).some((b) => b.k === 'KeyC') ? [{ k: 'KeyC', label: 'しゃがむ' }] : []), ...(controls.flashlight && !(controls.touch || []).some((b) => b.k === 'KeyF') ? [{ k: 'KeyF', label: '灯り' }] : [])];   // standard 1.7
    const btns = [...(controls.touch || DEFAULT_TOUCH), ...extraTouch].map((b) => `<button data-k="${b.k}"${b.id ? ` id="${b.id}"` : ''} class="${b.cls || ''}">${esc(b.label)}</button>`).join('');
    mk('div', 'touch', `<div id="t-look"></div><div id="t-stick"><div id="t-knob"></div></div><div id="t-right"><div id="t-buttons">${btns}</div></div><button id="t-menu" aria-label="メニュー">${icon("menu", { size: 24 })}</button>`).classList.add('hidden');
  }
  body.classList.toggle('touch', inputMode.touch);
  ctx.isTouch = inputMode.touch; ctx.input = inputMode.mode;
  // HUD slots + toast lane (rule U27, docs/hud-slots.md): one region per HUD part; every short notification is an item of the lane (top centre, below the top stacks)
  const slots = ensureHudSlots(hud);
  const lane = ctx.lane = new ToastLane({ el: slots.lane, paused: () => !!((ctx.wm && ctx.wm.isOpen) || (ctx.ui && ctx.ui.open)), calm: () => ctx.calm || document.documentElement.hasAttribute('data-gf-calm'), fit: () => { layoutHudSlots(); return laneFree(); }, onChange: scheduleHudLayout });
  ctx.registerHudPart = registerHudPart;
  registerHudPart('prompt', { slot: 'prompt' });
  if ($('t-menu')) registerHudPart('pause-menu', { slot: 'tr', order: -20, move: false });

  // ---- renderer / world ----
  const scene = ctx.scene = new THREE.Scene();
  const camera = ctx.camera = new THREE.PerspectiveCamera(controls.fov || 72, innerWidth / innerHeight, controls.near || 0.05, controls.far || 120);
  scene.add(camera);
  const { base: presetBase, ...presetOver } = typeof manifest.preset === 'object' && manifest.preset ? manifest.preset : { base: manifest.preset || 'office' };
  const preset = Object.keys(presetOver).length ? extendPreset(presetBase || 'office', presetOver) : presetBase || 'office';   // a name, or { base, ...overrides } (JSON)
  const renderer = ctx.renderer = createRenderer({ canvas, preset, antialias: !matchMedia('(pointer: coarse)').matches });
  let quality = null;
  if (manifest.quality !== false) {
    quality = new QualityTier({ storage: safe(() => localStorage), key: `${manifest.id}.quality`, env: browserEnv(renderer.getContext()), downMs: 1e9 });   // chosen once; no switching during play
    if (['low', 'mid', 'high'].includes(Q.get('tier'))) quality.setChoice(Q.get('tier'));
  }
  const look = ctx.look = applyPreset(renderer, scene, camera, preset, { cssParent: body, ...(quality ? { quality } : {}) });
  ctx.tier = look.tier;
  if (manifest.fx && cfg.mods && cfg.mods.fx) cfg.mods.fx.attachFx(look, ctx, manifest.fx);   // old-TV noise, scanlines, vignette, glitch, danger tint, red-black mist (manifest "fx", js/fx-std.js)
  addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); look.resize && look.resize(); });
  renderer.setSize(innerWidth, innerHeight, false);
  const fg = ctx.frameGuard = new FrameGuard({ renderer, overlay: FrameGuard.query(), dynres: { targetMs: 1000 / 40, min: 0.6, max: Math.min(devicePixelRatio || 1, look.tier === 'high' ? 2 : 1.5) } });   // ?perf shows hitches
  ctx.jobs = new JobQueue({ budgetMs: 3, guard: fg });

  // progression: the tasks ARE the goals
  const def = buildProgressionDef(data.stages, tasks, plan);
  const prog = ctx.prog = new Progression(def);
  prog.on('levelup', (e) => bus.emit('stage:up', { level: e.level.id, unlocks: e.unlocks }));
  const world = ctx.world = wdef ? wdef.build(ctx) : buildWorld(plan, { isUnlocked: (k) => prog.isUnlocked(k) });
  if (world.group && !world.group.parent) scene.add(world.group);
  world.floorY = world.floorY || (() => 0);
  const EYE = controls.eye || 1.65;
  ctx.eyeY = (floor = ctx.floor) => world.floorY(floor) + EYE;

  // pickups (items, docs): a model of the item's `kind` (js/item-kinds.js; docs default to paper) resting on what is under it, or a coloured box
  // for an item without a kind; a world that places its own pickups says so (registerWorld({ pickups: 'self' })). Items with "given": <task id>
  // are not placed: the task gives them (standard 1.7).
  for (const d of ext.reg.itemKind.list()) registerItemKind(d.id, d.make, d.label);   // a game's own kinds (standard 1.9)
  const pickups = new Map();
  const hidden = new THREE.MeshBasicMaterial({ visible: false });
  const addPickup = (kind, x) => {
    const k = x.kind || (kind === 'doc' ? DOC_KIND : null);
    const model = k ? makeItemModel(k, { scale: x.scale, color: x.color }) : null;
    let mesh;
    if (model) {
      const b = new THREE.Box3().setFromObject(model), sz = b.getSize(new THREE.Vector3());
      mesh = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.12, sz.x + 0.06), Math.max(0.06, sz.y + 0.04), Math.max(0.12, sz.z + 0.06)), hidden);
      model.position.y = -mesh.geometry.parameters.height / 2; mesh.add(model); mesh.userData.model = model; mesh.userData.foot = [sz.x, sz.z];
    } else mesh = new THREE.Mesh(new THREE.BoxGeometry(kind === 'doc' ? 0.32 : 0.26, kind === 'doc' ? 0.02 : 0.2, kind === 'doc' ? 0.24 : 0.26), new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(hue(x.id) / 360, 0.35, kind === 'doc' ? 0.8 : 0.45), emissive: new THREE.Color().setHSL(hue(x.id) / 360, 0.5, 0.18), roughness: 0.7 }));
    mesh.position.y = 0.85; mesh.name = `${kind}:${x.id}`; mesh.userData.interact = { kind, id: x.id }; mesh.userData.def = x;
    world.place(mesh, x.room, x.x, x.z); world.interactables.push(mesh); pickups.set(`${kind}:${x.id}`, mesh);
  };
  if (!(wdef && wdef.pickups === 'self')) { items.filter((i) => !i.start && !i.given).forEach((i) => addPickup('item', i)); docs.forEach((d) => addPickup('doc', d)); }
  // put each pickup on its support (a desk top, a shelf board, the floor): x.y wins; run again after the recipes have placed the furniture
  ctx.seatPickups = () => {
    const used = new Map();   // top -> things on it
    for (const mesh of pickups.values()) {
      const x = mesh.userData.def || {}, R = world.rooms && world.rooms.get && world.rooms.get(x.room), fy = R ? R.y || 0 : 0;
      const p = mesh.geometry.parameters, [w, d] = mesh.userData.foot || [p.width || 0.2, p.depth || 0.2], h = p.height || 0.2;
      // no x / z in the data: the next free slot on a desk or table top of its room (a row along the long side; a full top passes to the next)
      if ((x.x == null || x.z == null) && x.y == null && R && R.room) {
        for (const t of topsIn(world.colliders, R.room, fy)) { const k = `${t.minX},${t.minZ},${t.y}`, n = used.get(k) || 0, s = slotOn(t, n, w, d); if (s) { mesh.position.x = s.x; mesh.position.z = s.z; used.set(k, n + 1); break; } }
      }
      if (x.y != null) { mesh.position.y = fy + x.y + h / 2; continue; }
      // on whatever is under it, moved inward so nothing sticks out over the edge (seatOn)
      const s = seatOn(world.colliders, mesh.position.x, mesh.position.z, w, d, fy);
      mesh.position.x = s.x; mesh.position.z = s.z; mesh.position.y = s.y + h / 2;
    }
  };
  ctx.seatPickups();

  // ---- audio / input / UI ----
  const audioDef = uiDef('audio');
  const audio = ctx.audio = audioDef.create ? audioDef.create(ctx) : new Audio(); audio.volume = settings.volume;
  const unlockAudio = () => safe(() => { ctx.audio.init(); ctx.audio.resume(); });
  addEventListener('pointerdown', unlockAudio, { once: true }); addEventListener('keydown', unlockAudio, { once: true });
  const sound = (name, ...a) => safe(() => ctx.audio[name] && ctx.audio[name](...a));
  ctx.sound = sound;
  // standard 1.9: the 'it saw you' effects (js/spot-fx.js): game.json "spotFx" for every monster, monsters.json "spotFx" per monster
  { const sfx = createSpotFx(ctx, manifest.spotFx || null); ctx.spotFx = (spec, o) => sfx.play(spec, o); }
  // the look of each stage from data: stages.json levels[].look + "show" rules, game.json "music" / "stationsWhenDone" (js/stage-look.js; more per stage: ext.on('stage:look'))
  const stageLook = ctx.stageLook = createStageLook(ctx, { levels: data.stages.levels || [], rules: data.stages.show || [], music: manifest.music || null, stationsWhenDone: manifest.stationsWhenDone || 'keep', stations: plan.stations || [], tasks });
  for (const ev of ['game:start', 'stage:up', 'task:done', 'flag:set', 'state:sync']) bus.on(ev, () => safe(() => stageLook.apply()));
  bus.on('settings:change', () => stageLook.setVolume());
  // standard 1.8: the footstep follows the floor of the room (plan room step / floorTex / kind, game.json controls.step, js/step-sound.js);
  // a game with its own ground (snow outside, a wet corridor) sets ctx.stepSurfaceOf = (room, pos) => 'snow' | null
  { const cache = new Map(), def = (manifest.controls || {}).step;
    ctx.stepSurface = () => { const own = ctx.stepSurfaceOf && ctx.stepSurfaceOf(state.room, ctx.camera && ctx.camera.position); if (own) return own;
      if (!cache.has(state.room)) cache.set(state.room, stepSurfaceOf(plan.rooms.find((r) => r.id === state.room), { def })); return cache.get(state.room); }; }
  // positional cues behind walls are muffled (audio.at(pos).door(), js/audio-at.js): the occlusion of a position = the doors between its room and the listener's room
  { let g = null; audio.occlusionOf = (pos) => { g = g || roomGraph(plan); return occlusion(g, state.room, roomOf(g, pos.x, pos.z, ctx.floor), (id) => { const d = world.doors && world.doors.get(id); return d ? (d.isOpen ? 1 : 0) : 1; }); }; }
  // in-world voices (rule S15): ctx.playVoice(src, 'phone' | 'pa' | 'radio' | 'wall', { pos, intensity }) -> js/voice-fx.js (manifest "voice": true)
  if (cfg.mods && cfg.mods.voice) { let vfx = null; ctx.playVoice = (src, preset, opt = {}) => { unlockAudio(); if (!vfx && audio.ctx) vfx = cfg.mods.voice.createVoiceFx(audio.ctx, { out: audio.master }); return vfx ? vfx.play(src, preset, opt) : null; }; }
  // a spoken line (talk window, timed lines): ctx.voiceLine(src, preset | null, { volume }) -> { stop() }. A preset goes through playVoice (S15);
  // null = a voice in the same room, played clean on the master bus. Fails silently (the subtitle carries the words).
  ctx.voiceLine = (src, preset = null, opt = {}) => {
    unlockAudio();
    if (preset && ctx.playVoice) return ctx.playVoice(src, preset, opt);
    const ac = audio.ctx; if (!ac) return null;
    let node = null, stopped = false;
    fetch(src).then((r) => r.arrayBuffer()).then((b) => ac.decodeAudioData(b)).then((buf) => {
      if (stopped) return;
      node = ac.createBufferSource(); node.buffer = buf;
      const gain = ac.createGain(); gain.gain.value = opt.volume ?? 1;
      node.connect(gain).connect(audio.master || ac.destination); node.start();
    }).catch(() => {});
    return { stop() { stopped = true; try { node && node.stop(); } catch (e) {} } };
  };

  // short messages (say / toast) and progress-ui's dialogs: KitUI. Menus, tabs, docs, endings: the window manager (ONE window at a time).
  const ui = ctx.ui = new KitUI({ lane, onOpen: (n) => onUiOpen(n), onClose: (n) => onUiClose(n) });
  const wm = ctx.wm = createWindowManager({ container: body, thought: '#say', onPause: (p) => { if (p) ctx.fp && ctx.fp.release(); else setTimeout(() => { if (state.started && !state.ended && !ui.open && !blocked()) ctx.fp.lock(); }, 0); } });   // the lock waits one tick: a window opened right after the last one closed (a result, the next page) must not get a lock landing over it
  wm.on('open', (id) => bus.emit('ui:open', { name: id })); wm.on('close', (id) => bus.emit('ui:close', { name: id }));
  function onUiOpen(n) { ctx.fp && ctx.fp.release(); bus.emit('ui:open', { name: n }); }
  function onUiClose(n) { if (!state.ended && state.started && !wm.isOpen && !blocked()) ctx.fp.lock(); bus.emit('ui:close', { name: n }); }
  const blocked = () => !state.started || !!ui.open || wm.isOpen || MG.isActive() || !!ctx.mgOpen || !!state.ended || ctx.rnOpen || ctx.blockers.some((f) => f());
  ctx.blocked = blocked;
  const fpOpts = {
    colliders: world.colliders, bounds: world.bounds, isBlocked: blocked, sensitivity: settings.sensitivity, eye: EYE,
    onStep: (run) => sound('step', ctx.stepSurface(), { run, crouch: !!ctx.fp?.crouching }), onUnlock: () => state.started && !blocked() && pm.open(),
    touch: $('t-stick') ? { stick: $('t-stick'), knob: $('t-knob'), look: $('t-look') } : undefined,
    onTap: (x, y) => ctx.tapSelect && ctx.tapSelect(x, y),   // W18: tap-to-interact on touch
    externalLook: controls.lookInput !== false,   // the mouse goes through LookInput below (pointer lock, drag-look when the lock is refused, click-to-resume)
  };
  const fp = ctx.fp = wdef && wdef.createController ? wdef.createController(ctx, fpOpts) : new FirstPersonController(camera, canvas, fpOpts);
  fp.isTouch = inputMode.touch;
  // ---- input: mouse (pointer lock / drag), touch, pad; the mode follows the input actually used ----
  const touchEl = $('touch');
  const placeTmb = () => { const tmb = ctx.tmButton; if (!tmb) return; const host = ctx.isTouch && $('t-right') ? $('t-right') : $('hud-right'); if (tmb.parentNode !== host || host.firstChild !== tmb) host.prepend(tmb);
    registerHudPart('menu', { slot: ctx.isTouch && $('t-right') ? 'br' : 'tr', order: -10, el: tmb, move: false }); registerHudPart('prompt', { slot: 'prompt' });   // HUD slots (U27): the menu icon and the prompt follow the input mode
  };
  const applyInput = () => {
    ctx.input = inputMode.mode; ctx.isTouch = inputMode.touch; fp.isTouch = inputMode.touch;
    body.classList.toggle('touch', inputMode.touch);
    if (touchEl) touchEl.classList.toggle('hidden', !(inputMode.touch && state.started));
    placeTmb(); if (ctx.applyHud) ctx.applyHud();
    bus.emit('input:mode', { mode: inputMode.mode });
  };
  inputMode.onChange = applyInput;
  if (fpOpts.externalLook) {
    const li = ctx.lookInput = new LookInput(canvas, { mode: inputMode, blocked: () => blocked(), onExit: () => state.started && !blocked() && pm.open(), keys: false, ...(controls.lookText ? { text: controls.lookText } : {}) });
    fp.lock = () => li.resume(); fp.release = () => li.release();   // the controller's own pointer-lock is off; windows call these
    fp.lockNow = () => li.lock();
    li.onLook = (dx, dy, kind) => { const k = (kind === 'drag' ? 0.004 : 0.0022) * settings.sensitivity; fp.look(dx * k, dy * k); };
    ctx.lookPrompt = li;
  }
  const placeCamera = (x, z, floor = ctx.floor) => { ctx.floor = floor; fp.floorY = world.floorY(floor); camera.position.set(x, world.floorY(floor) + EYE, z); };
  placeCamera(world.spawn.x, world.spawn.z, world.spawn.floor || 0); fp.yaw = world.spawn.yaw || 0;
  ctx.checkpoint = { ...world.spawn, floor: world.spawn.floor || 0 };

  const pui = ctx.pui = new ProgressUI(prog, { ui, key: null, toasts: false, ...(uiDef('progress').options || {}) });
  pui.mountHud($('hud-left'));
  registerHudPart('goal', { slot: 'tl', order: 10, el: pui.hudEl }); registerHudPart('guide', { slot: 'tl', order: 20 }); registerHudPart('say', { slot: 'bc', move: false });
  // compact HUD on small screens (hudLayout in win-manager.js, css/shell.css): the STEP card is a chip until tapped
  const hudLeft = $('hud-left'); let hudOpen = false;
  const applyHud = () => { const L = hudLayout(innerWidth, innerHeight, { touch: ctx.isTouch, open: hudOpen }); hud.classList.toggle('hud-compact', L.compact); hudLeft.style.setProperty('--gf-hud-w', `${L.maxW}px`); if ($('guide')) { if (L.open) $('guide').setAttribute('data-open', '1'); else $('guide').removeAttribute('data-open'); } };
  hudLeft.addEventListener('click', (e) => { if (hud.classList.contains('hud-compact') && e.target.closest && e.target.closest('#guide .sg-card') && !e.target.closest('.sg-btn')) { hudOpen = !hudOpen; applyHud(); } });
  addEventListener('resize', applyHud); applyHud(); ctx.applyHud = applyHud;
  const invDef = uiDef('inventory'), jrDef = uiDef('journal');
  const docTab = invDef.docTab || 'docs';
  const itemEntry = (i) => ({ ...i, tab: i.tab || 'items', img: i.photo || undefined, meta: i.meta || (i.room ? `${roomName(i.room)}で入手` : undefined) });
  const docEntry = (d) => ({ ...d, name: d.title, desc: d.text, why: d.why || '', tab: docTab, img: d.photo || undefined, canUse: false, examineLabel: '読む' });
  const invItems = () => [...items.map(itemEntry), ...docs.map(docEntry)].map((e) => (invDef.decorate ? invDef.decorate(e, ctx) || e : e));
  const inv = ctx.inv = createInventory({
    items: invItems, getOwned: () => ctx.owned(), name: manifest.id, storage: invDef.storage === undefined ? safe(() => localStorage) : invDef.storage,
    tabs: invDef.tabs || [{ id: 'items', label: '持ち物' }, { id: docTab, label: '資料' }],
    ...(invDef.labels ? { labels: invDef.labels } : {}),
    ...(invDef.onUse ? { onUse: (it, v) => invDef.onUse(it, v, ctx) } : {}), ...(invDef.onExamine ? { onExamine: (it, v) => invDef.onExamine(it, v, ctx) } : {}),
    ...(invDef.actions ? { actions: (it) => invDef.actions(it, ctx) } : {}), ...(invDef.onPick ? { onPick: (a, b, v) => invDef.onPick(a, b, v, ctx) } : {}),
  });
  ctx.owned = () => (invDef.owned ? invDef.owned(ctx) : [...state.inv, ...state.docsRead]);
  const notes = data.releaseNotes || data.notes;
  const rn = ctx.rn = createReleaseNotes({ notes: notes.notes, version: notes.version, key: `${manifest.id}.rn`, onOpen: () => { ctx.rnOpen = true; fp.release(); }, onClose: () => { ctx.rnOpen = false; if (state.started && !ui.open && !wm.isOpen && !blocked()) fp.lock(); refreshDot(); } });

  // ---- minigames ----
  // the STEP guide of a mini game (U22/U23): 3 short cards (what / how / what happens) inside the mini game's help line; the protagonist's hints go to the thought band
  const guideFor = (id, T) => ({
    create: (rootEl) => createStepGuide({ container: rootEl.querySelector('.mg-help'), steps: minigameSteps(T.kind, { prefix: `mg-${id}`, target: '.mg-stage', ...(uiDef('guide').minigame ? uiDef('guide').minigame(id, T, ctx) : {}) }), say: (text) => ui.say(esc(text)), storage: safe(() => localStorage), key: `${manifest.id}.mg.${id}`, calm: settings.calm }),
  });
  ctx.minigame = (id, o = {}) => MG.start(id, { qa: ctx.qa, calm: settings.calm, guide: guideFor(id, MG.TASKS[id] || { kind: 'dial' }), ...o });
  async function runMinigame(task, mgDef) {
    const type = mgDef.type;
    if (MG.TYPES.includes(type)) {
      MG.register(task.id, type, { title: task.title, help: task.hint || '', ...(mgDef.cfg || {}) });
      return ctx.minigame(task.id);
    }
    const custom = ext.reg.minigame.get(type);
    if (!custom) throw new Error(`task ${task.id}: unknown mini game type "${type}"`);
    if (ctx.qa) return true;
    const host = document.createElement('div'); host.id = 'mg-custom'; host.className = 'gf-overlay'; body.appendChild(host);
    fp.release(); ctx.mgOpen = true;   // a library mini game blocks the game like a kit one (the look hint hides, the world waits)
    try { return !!(await custom.mount(host, { title: task.title, help: task.hint || '', ...(mgDef.cfg || {}) }, ctx)); } finally { ctx.mgOpen = false; host.remove(); }
  }
  // a task's own run() can open a mini game in the middle of its story (talk, then the mini game, then more talk): resolves true when it was done
  ctx.runMinigame = (task, mgDef = task && task.minigame) => (mgDef ? runMinigame(task, mgDef) : Promise.resolve(true));

  // ---- tasks ----
  ctx.levelIndex = (stage) => prog.levels.findIndex((l) => l.id === stage);
  ctx.canStart = (task) => {
    if (state.tasks.includes(task.id)) return 'この作業は、もう終わっています。';
    if (ctx.levelIndex(task.stage) > prog.index) return 'まだ、この作業には進めません。先に、いまの目標を進めましょう。';
    const pending = (task.needs || []).filter((n) => !state.tasks.includes(n));
    if (pending.length) return `先に済ませることがある：${pending.map((n) => (taskById.get(n) || {}).title || n).join('、')}`;
    const reg = ext.reg.task.get(task.id);
    if (task.timer && !(reg && reg.canStart)) return `時間が来るまで待つ（あと ${Math.ceil(Math.max(0, task.timer.seconds - ((state.timers || {})[task.id] || 0)))} 秒）`;   // a timed task finishes by itself (standard 1.7)
    if (reg && reg.canStart) { const r = reg.canStart(ctx, task); if (r !== true) return r || 'いまは、まだできません。条件がそろうと進められます。'; }
    return true;
  };
  ctx.completeTask = (id, o = {}) => {
    if (state.tasks.includes(id)) return;
    state.tasks.push(id); prog.flag(id); ctx.checkpoint = { x: camera.position.x, z: camera.position.z, yaw: fp.yaw, floor: ctx.floor };
    if (!o.quiet) { ui.toast(`✓ ${esc((taskById.get(id) || {}).title || id)}`, 'ok'); sound('beep', true); }
    bus.emit('task:done', { id });
    for (const it of items) if (it.given === id && !state.inv.includes(it.id)) { state.inv.push(it.id); if (!o.quiet) ui.toast(`受け取った：${esc(it.name)}`); bus.emit('item:given', { id: it.id, task: id }); }   // "given": <task id> (standard 1.7)
    const reg = ext.reg.task.get(id); reg && reg.onDone && reg.onDone(ctx, taskById.get(id));
    if (!o.noSave) ctx.save();
    checkEndings();
  };
  ctx.startTask = async (id) => {
    const task = taskById.get(id), ok = ctx.canStart(task);
    if (ok !== true) return ui.say(esc(ok), 5, { urgent: true });
    bus.emit('task:start', { id });
    const reg = ext.reg.task.get(id) || {};
    const mgDef = reg.minigame || task.minigame;
    let done = true;
    if (reg.run) done = await reg.run(ctx, task);
    else if (mgDef) done = await runMinigame(task, mgDef);
    else done = await new Promise((res) => { // no mini game: a plain confirm window
      let yes = false;
      wm.open('task', { title: task.title, size: 's', onClose: () => res(yes), render: (el) => { el.innerHTML = `<p>${esc(task.meaning)}</p><p><button class="btn primary" data-yes>作業する</button> <button class="btn" data-no>やめる</button></p>`; el.querySelector('[data-yes]').onclick = () => { yes = true; wm.close(); }; el.querySelector('[data-no]').onclick = () => wm.close(); } });
    });
    if (done) ctx.completeTask(id); else bus.emit('task:abort', { id });
    if (!state.ended && !ui.open && !wm.isOpen && state.started && !blocked()) fp.lock();
  };

  // ---- endings ----
  function checkEndings() {
    if (state.ended) return;
    const e = pickEnding(endings, { tasks: state.tasks, items: state.inv, flags: state.flags });
    if (!e) return;
    const screen = ext.reg.screen.get('ending');
    state.ended = e.id; fp.release();
    if (!(screen && screen.keepSave)) store.clear();
    Store.write(`${manifest.id}.endings.v1`, [...new Set([...(Store.read(`${manifest.id}.endings.v1`) || []), e.id])]);
    if (screen) screen.open(ctx, e);   // the game's own presentation (sequence, result card, share buttons)
    // standard 1.8.2 (F10): with no screen of its own a game still ends on the scene - the picture, the lines, the endings found so far
    else showEndingScene(ctx, { photo: e.photo, kicker: e.kicker, title: e.title, text: e.text, endings: { all: endings, current: e.id }, buttons: [{ label: '最初から', primary: true, fn: () => location.reload() }] });
    bus.emit('ending:reach', { id: e.id });
  }
  ctx.checkEndings = checkEndings;
  ctx.foundEndings = () => foundEndings(manifest.id);   // the endings this player has reached (standard 1.8.2)
  ctx.setFlag = (key, o = {}) => { if (!state.flags.includes(key)) { state.flags.push(key); prog.flag(key); bus.emit('flag:set', { key }); if (!o.silent) checkEndings(); else setTimeout(checkEndings, 0); } };

  // ---- interaction ----
  const builtin = {
    door: { prompt: (o) => { const d = world.doors.get(o.id); return d.isOpen ? '' : d.locked() ? `[E] ${lockedLabel('扉', '鍵がかかっている')}` : '[E] 扉を開ける'; },   // [E] on a locked door says why (its hint)
      run: (o) => { const d = world.doors.get(o.id); if (d.open()) { sound('door'); state.doors.push(o.id); bus.emit('door:open', { id: o.id }); } else if (d.locked()) { ui.say(esc(d.def.hint || prog.lockText(d.def.unlock) || 'いまは開きません。鍵や手がかりを探してみましょう。'), 5, { urgent: true }); /* the answer to [E]: at once, not after a queued line */ bus.emit('door:locked', { id: o.id, unlock: d.def.unlock }); } } },
    station: { prompt: (o) => { const t = taskAtStation(tasks, o.id, state.tasks); return t ? `[E] ${t.title}` : o.label || '（いまは何もない）'; },
      run: (o) => { const t = taskAtStation(tasks, o.id, state.tasks); if (!t) { const open = tasks.find((x) => x.station === o.id && !state.tasks.includes(x.id)); return ui.say(esc(open ? ctx.canStart(open) : 'ここでの作業は、もう終わっています。')); } return ctx.startTask(t.id); } },
    item: { prompt: (o) => `[E] 拾う：${items.find((i) => i.id === o.id).name}`,
      run: (o) => { const it = items.find((i) => i.id === o.id); remove('item', o.id); state.inv.push(o.id); sound('pickup'); if (it.photo) lane.push({ kind: 'card', cls: 'tl-lookcard tl-pickcard', key: `pickup:${it.id}`, ttl: 6000, html: viewItemHtml({ photo: it.photo, title: `入手：${it.name}` }) }); else ui.toast(`入手：${esc(it.name)}`); ui.say(esc(it.feeling));   /* an item with a photo shows its picture card (the feeling stays in the thought band) */ bus.emit('item:pickup', { id: o.id }); ctx.save(); checkEndings(); } },
    doc: { prompt: (o) => `[E] 読む：${docs.find((d) => d.id === o.id).title}`,
      run: (o) => { const d = docs.find((x) => x.id === o.id); if (!state.docsRead.includes(o.id)) state.docsRead.push(o.id); sound('paper'); wm.open('doc', { title: d.title, size: 's', render: (el) => { el.innerHTML = `${d.photo ? `<img class="gf-doc-img" src="${esc(d.photo)}" alt="">` : ''}${d.text.split('\n').map((p) => `<p>${esc(p)}</p>`).join('')}${d.feeling ? `<p class="iv-feel">${esc(d.feeling)}</p>` : ''}`; } }); bus.emit('doc:read', { id: o.id }); ctx.save(); } },
    // locked stairs say why (the plan's hint, else the progression's lock text) and stay shut: [E] gives the reason in the thought band (1.9.1)
    stairs: { prompt: (o) => (o.locked && o.locked() ? `[E] ${lockedLabel(o.label || '階段', 'いまは使えません')}` : `[E] ${o.label || '階段を使う'}`),
      run: (o) => { if (o.locked && o.locked()) { ui.say(esc(o.hint || prog.lockText(o.unlock) || 'いまは、この階段を使えません。先に、いまの目標を進めましょう。'), 6, { urgent: true }); bus.emit('stairs:locked', { id: o.id, unlock: o.unlock }); return; } ctx.useStairs(o); } },
  };
  function remove(kind, id) { const m = pickups.get(`${kind}:${id}`); if (!m) return; m.visible = false; world.group.remove(m); const i = world.interactables.indexOf(m); if (i >= 0) world.interactables.splice(i, 1); pickups.delete(`${kind}:${id}`); }
  ctx.removePickup = remove;
  const handlerOf = (kind) => ext.reg.interact.get(kind) || builtin[kind];
  let target = null;
  const pickNow = () => (world.pick ? world.pick(camera, ctx) : pickInteractable(camera, world.interactables, 2.4, null, { touch: fp.isTouch, viewH: innerHeight, colliders: world.colliders }));
  ctx.pickNow = pickNow; ctx.selectables = () => selectablesOf(world.interactables);   // the same pick as every frame, for the selection checks (tools/check-select-range.mjs --preset core)
  exposeGf({ snapshot: () => ({ target: target && { kind: target.kind, id: target.id, distance: target.distance, via: target.via }, prompt: ($('prompt') || {}).textContent || '' }), pick: pickNow, selectables: () => selectablesOf(world.interactables), tap: (x, y) => ctx.tapSelect(x, y) });
  // W18: a tap on a thing on the screen selects it and uses it (the finger's radius is >= 44 px); worlds with their own pick() provide world.pickAt(x, y, ctx)
  ctx.tapSelect = (x, y) => { if (blocked() || !state.started) return false; const t = world.pickAt ? world.pickAt(x, y, ctx) : pickInteractableAt(camera, world.interactables, x, y, innerWidth, innerHeight, 2.4, { colliders: world.colliders }); if (!t) return false; target = ctx.target = t; return ctx.interact(); };
  ctx.interact = () => { if (blocked() || !target) return false; const h = handlerOf(target.kind); if (!h) return false; bus.emit('player:interact', { kind: target.kind, id: target.id }); h.run(target, ctx); return true; };
  // floors: a stairs / lift end ({ to: { x, z, floor, yaw } }) moves the player; worlds without stairs never call it
  ctx.setFloor = (floor, p = null) => { const from = ctx.floor; if (p) { placeCamera(p.x, p.z, floor); if (p.yaw != null) fp.yaw = p.yaw; } else placeCamera(camera.position.x, camera.position.z, floor); if (from !== floor) bus.emit('player:floor', { from, to: floor }); };
  ctx.useStairs = (o) => { const to = o.to || (o.def && o.def.to); if (!to) return false; if (world.useStairs) return world.useStairs(o, ctx); ctx.setFloor(to.floor || 0, to); return true; };

  // ---- menus: tab menu (items / tasks / notes / map + the game's tabs), pause menu, step guide ----
  const journal = ctx.journal = createJournal({
    name: manifest.id, tabs: jrDef.tabs || [{ id: 'notes', label: '気になること' }], ...(jrDef.groups ? { groups: jrDef.groups } : {}), ...(jrDef.layout ? { layout: jrDef.layout } : {}),
    ...(jrDef.onOpen ? { onOpen: (e, jr) => jrDef.onOpen(e, jr, ctx) } : {}), ...(jrDef.storage !== undefined ? { storage: jrDef.storage } : {}),
    getEntries: () => (jrDef.entries ? jrDef.entries(ctx) : [
      ...items.filter((i) => state.inv.includes(i.id)).map((i) => ({ id: `item:${i.id}`, tab: 'notes', title: i.name, text: i.desc, line: i.feeling, img: i.photo || undefined, group: i.room, groupLabel: roomName(i.room) })),
      ...docs.filter((d) => state.docsRead.includes(d.id)).map((d) => ({ id: `doc:${d.id}`, tab: 'notes', title: d.title, text: d.text, line: d.feeling, img: d.photo || undefined, group: d.room, groupLabel: roomName(d.room) })),
      ...(ctx.things ? ctx.things.entries() : []),   // what was looked at (data/things.json)
    ]),
  });
  tm = ctx.tm = createTabMenu({ wm, inventory: inv, journal, progress: pui, key: 'Tab', ...(uiDef('tabs').labels ? { labels: uiDef('tabs').labels } : {}), canOpen: () => state.started && !state.ended && !ui.open && !MG.isActive() && !ctx.rnOpen && !ctx.blockers.some((f) => f()) });
  let mapView = null;
  const mapDef = uiDef('map');
  const stationPos = (id) => { const m = world.interactables.find((o) => o.userData.interact && o.userData.interact.kind === 'station' && o.userData.interact.id === id); return m ? { x: m.position.x, z: m.position.z } : {}; };
  const mapState = () => {
    const base = {
      pos: { x: camera.position.x, z: camera.position.z, floor: ctx.floor }, heading: (-fp.yaw * 180) / Math.PI, visited: state.visited, named: state.visited,
      locked: [...world.doors.values()].filter((d) => d.locked()).map((d) => d.def.id),
      pins: tasks.filter((t) => t.station && ctx.canStart(t) === true).map((t) => ({ id: t.id, room: t.room, ...stationPos(t.station), label: t.title, kind: 'task' })),
    };
    return mapDef.state ? { ...base, ...mapDef.state(ctx, base) } : base;
  };
  tm.registerTab({ id: 'map', label: mapDef.label || '地図', icon: 'map', render: (el) => { el.innerHTML = ''; if (mapView) { el.appendChild(mapView.el); mapView.reset(); return; } mapView = createMapSvg({ plan: mapDef.plan ? mapDef.plan(ctx) : plan, container: el, getState: mapState, ...(mapDef.photo ? { photo: (id) => mapDef.photo(id, ctx) } : {}), ...(mapDef.names ? { names: mapDef.names } : {}), ...(mapDef.floorNames ? { floorNames: mapDef.floorNames } : {}), calm: settings.calm }); }, onShow: () => mapView && mapView.update() });
  for (const t of ext.tabs()) tm.registerTab({ id: t.id, label: t.label, icon: t.icon, after: t.after, render: (el) => t.render(el, ctx), badge: t.badge ? () => t.badge(ctx) : undefined, onShow: t.onShow ? () => t.onShow(ctx) : undefined, onKey: t.onKey, focus: t.focus });
  const pm = ctx.pm = createPauseMenu({
    wm, tabMenu: tm, releaseNotes: rn, ...(uiDef('pause').renderSettings ? { renderSettings: (el, api) => uiDef('pause').renderSettings(el, api, ctx) } : {}), onTitle: () => (ctx.toTitle ? ctx.toTitle() : location.reload()), storage: safe(() => localStorage),
    canOpen: () => state.started && !state.ended && !ui.open && !MG.isActive() && !ctx.rnOpen && !tm.isOpen && !ctx.blockers.some((f) => f()),
    onSettings: (s) => { settings.calm = s.calm; root.dataset.gfCalm = s.calm || Q.has('calm') ? '1' : ''; settings.volume = s.volume; settings.hudAlpha = s.hudAlpha; ctx.calm = s.calm || Q.has('calm'); ctx.audio.volume = s.volume; safe(() => ctx.audio.setVolume(s.volume)); store.saveSettings(settings); bus.emit('settings:change', s); },
  });
  root.dataset.gfCalm = pm.settings.calm || Q.has('calm') ? '1' : '';   // calm / no flash for the CSS and js/fx-std.js
  settings.volume = pm.settings.volume; settings.calm = pm.settings.calm; ctx.audio.volume = settings.volume; if (settings.calm) ctx.calm = true;
  wm.on('open', (id) => id === 'pause-menu' && bus.emit('game:pause', { reason: 'menu' }));
  wm.on('close', (id) => id === 'pause-menu' && bus.emit('game:resume', {}));
  ctx.openPause = () => pm.open();
  ctx.openScreen = (id, ...a) => { const s = ext.reg.screen.get(id); if (!s) return false; s.open(ctx, ...a); return true; };

  // step guide: STEP cards for the first task that can be started and has "steps" (U22/U23); the hint is the protagonist's line
  let guide = null, guideTask = null;
  const glow = (key, on) => { const m = world.interactables.find((o) => key && o.userData.interact && `${o.userData.interact.kind}:${o.userData.interact.id}` === key); if (m && m.material && m.material.emissiveIntensity != null) m.material.emissiveIntensity = on ? 1.8 : 0.55; };
  const kt = (x) => (x == null ? x : keyText(x, ctx.input === 'pad' ? 'pad' : ctx.isTouch ? 'touch' : 'mouse'));   // the step card's key names follow the device
  ctx.keyText = kt; ui.keys = () => (ctx.input === 'pad' ? 'pad' : ctx.isTouch ? 'touch' : 'mouse');
  function refreshGuide() {
    const t = tasks.find((x) => x.steps && x.steps.length && ctx.canStart(x) === true) || null;
    if ((t && guideTask && t.id === guideTask.id) || (!t && !guideTask)) return;
    if (guide) { guide.destroy(); guide = null; }
    guideTask = t;
    if (!t) return;
    const gd = uiDef('guide');
    guide = createStepGuide({
      container: $('guide'), getState: () => state, say: (text) => ui.say(esc(text)), storage: safe(() => localStorage), key: `${manifest.id}.guide.${t.id}`, calm: settings.calm,
      onEmphasize: (tg, on) => { if (gd.onEmphasize) return gd.onEmphasize(tg, on, ctx); glow(tg && tg.game, on); return true; },
      steps: t.steps.map((s, i) => ({
        id: `${t.id}.${i}`, title: kt(s.text), body: kt(s.body || ''), hint: kt(s.hint || (i === 0 ? t.hint : undefined)), emphasize: 'glow', target: s.emphasis ? { game: s.emphasis } : undefined,
        done: s.done === 'room' ? () => state.room === t.room : s.done === 'look' ? () => !!ctx.target && `${ctx.target.kind}:${ctx.target.id}` === s.emphasis : s.done === 'task' ? () => state.tasks.includes(t.id) : undefined,
      })),
    });
  }
  ctx.refreshGuide = refreshGuide;
  for (const ev of ['game:start', 'task:done', 'stage:up', 'door:open']) bus.on(ev, () => setTimeout(refreshGuide, 0));

  addEventListener('keydown', (e) => {
    if (!state.started || /INPUT|TEXTAREA|SELECT/.test((e.target && e.target.tagName) || '')) return;
    if (blocked()) return;
    const k = { code: e.code, event: e, handled: false };
    bus.emit('input:key', k);
    if (k.handled) return;
    if (e.code === 'KeyE') ctx.interact();
    else if (e.code === 'KeyG') tm.open('tasks');
    else if (controls.crouch && e.code === 'KeyC') ctx.setCrouch(!fp.crouching);
    else if (controls.flashlight && e.code === 'KeyF') ctx.setLight(!ctx.lightOn);
    else if (e.code === 'KeyI') tm.open('items');
    else if (e.code === 'KeyM') tm.open('map');
    else if (e.code === 'KeyL') tm.open('log');
  });
  const tb = $('touch');
  if (tb) {
    for (const b of tb.querySelectorAll('[data-k]')) {
      const hold = b.classList.contains('hold');   // a button with class "hold" (run): down while pressed, up when released
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); if (hold) b.classList.add('on'); dispatchEvent(new KeyboardEvent('keydown', { code: b.dataset.k })); });
      if (hold) for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, () => { if (b.classList.contains('on')) { b.classList.remove('on'); dispatchEvent(new KeyboardEvent('keyup', { code: b.dataset.k })); } });
    }
    $('t-menu').onclick = () => pm.open();
  }
  // the tab-menu (端末) icon button: touch = just ABOVE the operation cluster (bottom-right column #t-right), desktop = top-right (#hud-right); icon + label on large screens, icon only on small ones
  { const tmb = tm.mountButton(ctx.isTouch && $('t-right') ? $('t-right') : $('hud-right')); ctx.tmButton = tmb; placeTmb(); }   // (placeTmb: the input mode can change while playing)
  gfRegister('inputMode', () => ({   // ?gftest=1: the input detection and the pad can be driven without a device
    snapshot: () => ({ mode: inputMode.mode, touch: inputMode.touch, pinned: !!inputMode.pinned, locked: ctx.lookInput ? ctx.lookInput.locked : false, pad: ctx.pad ? ctx.pad.connected : false, calm: document.documentElement.dataset.gfCalm === '1' }),
    drive(action, a = {}) {
      switch (action) {
        case 'setMode': if (!['mouse', 'touch', 'pad'].includes(a.mode)) return gfFail(`mode "${a.mode}"`); inputMode.set(a.mode); return gfOk({ mode: inputMode.mode });
        case 'pad': ctx.fakePads = [{ connected: true, mapping: 'standard', id: 'gftest', axes: a.axes || [0, 0, 0, 0], buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: (a.buttons || []).includes(i), value: (a.buttons || []).includes(i) ? 1 : 0 })) }]; ctx.pad.poll(a.dt || 1 / 60); return gfOk({ mode: inputMode.mode, stick: { ...fp.stick } });
        case 'padOff': ctx.fakePads = null; ctx.pad.poll(1 / 60); return gfOk();
        default: return gfUnknown(action);
      }
    },
    reset: () => { ctx.fakePads = null; },
  }));
  // game controller: sticks / buttons -> the same keys the keyboard sends (js/pad-input.js has the mapping); the first use switches the mode to "pad" (prompts say [A])
  const keyEv = (type, code) => (document.activeElement || document.body).dispatchEvent(new KeyboardEvent(type, { code, key: /^Key/.test(code) ? code.slice(3).toLowerCase() : code, bubbles: true, cancelable: true }));   // from the focused element: the window manager listens on document, the core on window
  ctx.pad = new PadInput({
    getPads: () => ctx.fakePads || (navigator.getGamepads ? navigator.getGamepads() : []), always: true, onUse: () => inputMode.set('pad'),
    buttons: (controls.pad || {}).buttons,   // controls.pad.buttons: { "2": "KeyG" } = a button's key while walking (a game's own keys)
    windowOpen: () => wm.isOpen || !!ui.open || MG.isActive() || !!ctx.mgOpen || !!ctx.rnOpen || ctx.padOpen.some((f) => f()), blocked: () => !state.started || !!state.ended || ctx.blockers.some((f) => f()),
    onMove: (x, y) => { fp.stick.x = x; fp.stick.y = y; }, onLook: (dx, dy) => fp.look(dx * settings.sensitivity, dy * settings.sensitivity), onRun: (on) => (on ? fp.keys.add('ShiftLeft') : fp.keys.delete('ShiftLeft')),
    onKey: (code, down) => {
      const pk = { code, down, handled: false };   // 'pad:key': a game with its own screen (a terminal, an intro card) takes the pad key by setting handled
      bus.emit('pad:key', pk); if (pk.handled) return;
      if (!state.started) { if (down && code === 'KeyE') { const b = $('start-btn'); if (b && !b.disabled && !title.classList.contains('hidden')) b.click(); } return; }
      if (down && code === 'Enter') { const a = document.activeElement; if (a && a !== document.body && a.click) return a.click(); }   // A in a window presses the focused button
      keyEv(down ? 'keydown' : 'keyup', code);
    },
  });

  // ---- player: rooms, die / respawn ----
  const defaultDie = (reason = '') => {
    bus.emit('player:dead', { reason });
    ctx.setFloor(ctx.checkpoint.floor || 0, ctx.checkpoint); fp.yaw = ctx.checkpoint.yaw || 0;
    bus.emit('player:respawn', { room: world.roomAt(ctx.checkpoint.x, ctx.checkpoint.z, camera.position.y) });
  };
  ctx.die = (reason = '') => {
    if (state.ended) return;
    const d = ext.reg.death.get('death');
    if (d) return d.run(ctx, reason);   // the game's own sequence (it emits player:dead / player:respawn itself)
    defaultDie(reason);
  };
  ctx.teleport = (target) => { // debug and tests: a room id or { x, z, yaw, floor }
    const R = typeof target === 'string' ? world.rooms.get(target) : null;
    const p = R ? { x: R.cx, z: R.cz, floor: (R.room || {}).floor || 0 } : target;
    ctx.setFloor(p.floor != null ? p.floor : ctx.floor, p); return world.roomAt(p.x, p.z, camera.position.y);
  };
  // monsters (registered by the game): each gets create(ctx) once and update(dt, ctx) per frame; systems are the same without the "monster" meaning
  const monsters = ext.reg.monster.list().map((m) => ({ id: m.id, inst: m.create(ctx) }));
  const systems = ext.reg.system.list().map((s) => ({ id: s.id, def: s, inst: s.create ? s.create(ctx) : null }));
  // crouch and flashlight (game.json "controls": { "crouch": true, "flashlight": true | { "on": true, "intensity": 24 } }, standard 1.7): [C] / [F] and touch
  // buttons; ctx.visibility() tells the monster how easy you are to notice (crouching 0.6, a light on 1.3: controls.crouchVisibility / lightVisibility)
  ctx.setCrouch = (on) => { if (!controls.crouch) return; fp.crouching = !!on; bus.emit('player:crouch', { on: fp.crouching }); ui.toast(fp.crouching ? 'しゃがんだ（Cで立つ）' : '立ち上がった'); };
  ctx.lightOn = false;
  if (controls.flashlight) {
    const fl = typeof controls.flashlight === 'object' ? controls.flashlight : {};
    const light = ctx.flashlight = new THREE.SpotLight(fl.color ?? 0xffefc7, fl.intensity ?? 24, fl.distance ?? 22, fl.angle ?? Math.PI / 6.5, 0.7, 1.3);
    light.visible = false; scene.add(light, light.target);
    ctx.setLight = (on) => { ctx.lightOn = !!on; light.visible = ctx.lightOn; bus.emit('player:light', { on: ctx.lightOn }); };
    const dir = new THREE.Vector3();
    systems.push({ id: 'flashlight', def: { update: () => { if (!light.visible) return; light.position.copy(camera.position); camera.getWorldDirection(dir); light.target.position.copy(camera.position).addScaledVector(dir, 6); } }, inst: null });
    if (fl.on) ctx.setLight(true);
  } else ctx.setLight = () => {};
  ctx.visibility = () => (fp.crouching ? controls.crouchVisibility ?? 0.6 : 1) * (ctx.lightOn ? controls.lightVisibility ?? 1.3 : 1);

  // timed tasks (tasks.json "timer": { "seconds": 150, "label": "夜明けまで" }, standard 1.7): once the task can be worked on (its stage, its needs),
  // play time counts up and the task completes by itself; ext.registerTask(id, { beforeDone: async (ctx, task) => ... }) runs first (a conversation).
  // ctx.timer(id) -> { elapsed, seconds, left, k }. On respawn the running timers start over. ?qa: 10x by the wall clock (window.__gfRealtime = true: off).
  state.timers = state.timers || {};
  const timed = tasks.filter((t) => t.timer && t.timer.seconds > 0);
  ctx.timer = (id) => { const t = taskById.get(id); if (!t || !t.timer) return null; const e = state.timers[id] || 0, S = t.timer.seconds; return { elapsed: e, seconds: S, left: Math.max(0, S - e), k: Math.min(1, e / S), label: t.timer.label || t.title }; };
  if (timed.length) {
    let wallT = 0; const finishing = new Set();
    const runnable = (t) => !state.tasks.includes(t.id) && ctx.levelIndex(t.stage) === prog.index && (t.needs || []).every((n) => state.tasks.includes(n));
    systems.push({ id: 'task-timers', def: { update: (dt, c, active) => {
      const now = performance.now(), wall = wallT ? Math.min(2, (now - wallT) / 1000) : dt; wallT = now;
      if (!active) return;
      const step = ctx.qa && !(typeof window !== 'undefined' && window.__gfRealtime) ? wall * 10 : dt;
      for (const t of timed) {
        if (!runnable(t) || finishing.has(t.id)) continue;
        state.timers[t.id] = (state.timers[t.id] || 0) + step;
        if (state.timers[t.id] >= t.timer.seconds) {
          finishing.add(t.id);
          const reg = ext.reg.task.get(t.id) || {};
          Promise.resolve(reg.beforeDone ? reg.beforeDone(ctx, t) : true).then(() => { finishing.delete(t.id); ctx.completeTask(t.id); });
        }
      }
    } }, inst: null });
    bus.on('player:respawn', () => { for (const t of timed) if (!state.tasks.includes(t.id)) state.timers[t.id] = 0; });
  }
  ctx.systems = systems;
  ctx.monologue = (text, sec = 2.2, o) => ui.say(esc(text), sec, o);   // the protagonist's thought line (U23); monster hints ("走れ") go through it
  // the conversation window and the choice (js/talk-ui.js, standard 1.7): ctx.talk(lines | 'key of data/talk.json', o), ctx.choose({ who, text, options })
  { const T = createTalk({ wm, qa: !!ctx.qa, data: data.talk || null, portraits: manifest.portraits || null, log: (ctx.talkLog = []), said: (L) => ui.sayLine.remember(`<span class="who">${esc(L.who || '')}</span>${esc(L.text || '')}`), voice: (L) => ctx.voiceLine(L.voice, L.vfx || null) }); ctx.talk = T.talk; ctx.choose = T.choose; }
  // 言葉の記録 (feedback 2026-11-02 「思ったことや会話が流れる」): every thought and spoken line since the start, newest first, in the menu;
  // L opens it, and on a phone a tap on the thought band does
  tm.registerTab({ id: 'log', label: uiDef('tabs').labels?.log || '言葉の記録', icon: 'notes', render: (el) => {
    const L = ui.sayLine.log.slice().reverse();
    el.innerHTML = `<div class="gf-saylog"><p class="gf-saylog-help">${ctx.isTouch ? '画面下の文をタップしても開けます。' : '[L] でいつでも開けます。'}新しい順です。</p>${L.length ? `<ol>${L.map((x) => `<li>${x.html}</li>`).join('')}</ol>` : '<p class="tm-empty">まだ何もありません。</p>'}</div>`; } });
  { const sayEl = document.getElementById('say'); if (sayEl) sayEl.addEventListener('pointerdown', (e) => { if (ctx.isTouch && state.started) { e.preventDefault(); e.stopPropagation(); tm.open('log'); } }); }
  if (manifest.things && data.things && cfg.mods && cfg.mods.things) cfg.mods.things.installThings(ctx);   // data/things.json: [E] examine -> card + thought + journal (standard 1.5)
  if (data.terminals && cfg.mods && cfg.mods.terminals) cfg.mods.terminals.installTerminals(ctx);   // data/terminals.json: the 'terminal' screen kind (standard 1.5)
  if (data.flavor && cfg.mods && cfg.mods.flavor) { const fl = ctx.flavor = cfg.mods.flavor.installFlavor(ctx, data.flavor); systems.push({ id: 'flavor', def: { update: fl.update }, inst: fl }); }   // mood lines in the thought band (docs/flavor.md)
  if (data.monsters && cfg.mods && cfg.mods.monsters) { const ms = cfg.mods.monsters.installMonsters(ctx); if (ms) systems.push({ id: 'monsters', def: { update: (dt, c, active) => ms.update(dt, c, active) }, inst: ms }); }   // the default monster pack (data/monsters.json, standard 1.5)

  // ---- title ----
  const saved = ctx.saved = store.load();
  const td = uiDef('title');
  const title = mk('div', 'title', `<div class="gf-title-box">${td.kicker ? `<p class="gf-sub gf-kicker">${esc(td.kicker)}</p>` : ''}<h1>${esc(manifest.title)}</h1>${manifest.subtitle ? `<p class="gf-sub">${esc(manifest.subtitle)}</p>` : ''}${td.tagline ? `<p class="gf-tagline">${esc(td.tagline)}</p>` : ''}${td.meta ? `<p class="gf-sub gf-meta">${esc(td.meta)}</p>` : ''}
    <div class="gf-title-btns"><button id="start-btn" class="btn primary" disabled>読み込み中…</button>${saved ? '<button id="continue-btn" class="btn hidden">つづきから</button>' : ''}<span id="title-extra" class="gf-title-extra"></span>
    <button id="notes-btn" class="rn-link">更新情報<span id="rn-dot" class="rn-dot" hidden></span></button></div><p id="boot-status" class="gf-sub gf-boot-status" aria-live="polite"></p><p id="title-info" class="gf-sub gf-info"></p>${td.note ? `<p class="gf-sub gf-note">${esc(td.note)}</p>` : ''}<p class="gf-ver">v${esc(manifest.version)}</p></div>`);
  // First-load screen (no flicker, docs/load-flicker.md): index.html carries a static #boot loader. The title is built hidden behind it (gf-prep),
  // the key art is its own layer that fades in once decoded, and ONE crossfade (boot -> title) happens when the fonts and the art are ready.
  const bootEl = document.getElementById('boot');
  const artUrl = manifest.titleImage ? new URL(manifest.titleImage, location.href).href : null;
  const artP = cfg.titleArt || (artUrl ? preloadImage(artUrl) : Promise.resolve(null));
  const art = mountTitleArt(title, manifest.titleImage ? artUrl : null);
  if (bootEl) title.classList.add('gf-prep');
  ctx.titleShown = crossfadeToTitle({ boot: bootEl, title, art, artP });
  function refreshDot() { const d = $('rn-dot'); if (d) d.hidden = !rn.hasUnseen(); }
  refreshDot();
  $('notes-btn').onclick = () => rn.open();
  const extraEl = $('title-extra');
  for (const b of ext.titleButtons()) { const el = document.createElement('button'); el.className = 'btn'; el.id = `title-${b.id}`; el.textContent = b.label; if (b.when && !b.when(ctx)) el.classList.add('hidden'); el.onclick = () => ctx.booted && b.run(ctx); extraEl.appendChild(el); }
  if (td.info && saved) $('title-info').textContent = td.info(saved, ctx) || '';
  ctx.refreshTitle = () => { for (const b of ext.titleButtons()) { const el = $(`title-${b.id}`); el && el.classList.toggle('hidden', !!(b.when && !b.when(ctx))); } };
  // begin({ resume, chapter, keepSave, skipIntro, quiet, restart }): a new game, the saved one (read from the store now: ctx.start({ restart: true, resume: true }) is
  // "try again from the save" after an ending), or whatever the ext persist.restore makes of the options (chapter select)
  const begin = (o = {}) => {
    if (!ctx.booted || (state.started && !o.restart)) return;
    const go = () => {
      const snap = o.resume ? store.load() || saved : null;
      const resume = !!snap;
      state.started = false; state.ended = null;
      Object.assign(state, { tasks: [], inv: [...startInv], docsRead: [], doors: [], flags: [], visited: [] });
      prog.reset();
      if (resume) {
        Object.assign(state, { inv: snap.inv || [...startInv], docsRead: snap.docsRead || [], doors: snap.doors || [], visited: snap.visited || [] });
        prog.restore(snap.prog);
        state.tasks = [...(snap.tasks || [])]; state.flags = [...(snap.flags || [])];
        for (const id of state.doors) { const d = world.doors.get(id); if (d && d.open() && d.snap) d.snap(); }   // a restored door is already open (no swing on load)
        for (const id of state.inv) remove('item', id);
        if (snap.pos) { placeCamera(snap.pos.x, snap.pos.z, snap.pos.floor || 0); fp.yaw = snap.pos.yaw || 0; }
      } else if (!o.keepSave) store.clear();
      for (const p of ext.reg.persist.list()) p.restore(resume ? (snap.ext && snap.ext[p.id]) ?? null : null, ctx, { ...o, resume, saved: resume ? snap : null });
      title.classList.add('hidden'); hud.classList.remove('hidden'); state.started = true; applyInput();
      state.started = true; unlockAudio(); bus.emit('game:start', { ...o, resume });
      if (!resume && !o.quiet && !td.intro) ui.say(esc(data.stages.goal.sub || data.stages.goal.title), 6);
      if (!blocked()) fp.lock();
      checkEndings();
    };
    title.classList.add('hidden');   // the game's cards (controls, intro) show on the bare 3D view
    if (td.beforeStart && !o.skipIntro) td.beforeStart(ctx, go, o); else go();   // the game's controls card / intro screens
  };
  $('start-btn').onclick = () => { if (saved && td.confirmNew && !$('start-btn').dataset.sure) { $('start-btn').dataset.sure = '1'; $('start-btn').textContent = td.confirmNew; return; } begin({}); };
  if ($('continue-btn')) $('continue-btn').onclick = () => begin({ resume: true });
  ctx.start = begin;
  store.autosave(() => (state.started && !state.ended ? snapshot() : null));

  // ---- boot (behind the title: the game's pre-compile, tour, decode steps) ----
  ctx.boot = async () => {
    const btn = $('start-btn');
    const steps = ext.reg.boot.list();
    const status = $('boot-status');
    const report = (k, text) => { if (status && text) status.textContent = text; ctx.bootProgress = k; };   // the button keeps one label while loading (no text toggling)
    for (let i = 0; i < steps.length; i++) await steps[i].run(ctx, (k, t) => report((i + k) / steps.length, t));
    // pre-paint every standard window (invisible): the first real open must not pay for layout / glyphs / image decode (perf: 150-450 ms at 4x CPU)
    if (status) status.textContent = '画面を準備中…';
    ctx.warmReport = await warmStandardUi({ text: corpusOf([data, manifest]), images: [...imagesOf(data.items, data.docs, data.things), ...(ctx.warmImages || [])], wm, tm, pm, rn, inv, owned: () => ctx.owned(), minigames: Object.keys(MG.TASKS), minigame: (id) => ctx.minigame(id), abortMinigame: MG.abort, steps: ctx.warmSteps });
    ctx.booted = true;
    if (status) status.textContent = '';
    if (btn) { btn.disabled = false; btn.textContent = saved ? (td.restartLabel || 'はじめから') : 'はじめる'; }
    if ($('continue-btn')) $('continue-btn').classList.remove('hidden');
    bus.emit('game:booted', ctx);
    const s = startFromUrl();
    if (s) begin({ ...s, skipIntro: true, keepSave: true }); else if (Q.has('autostart')) begin({});
    return ctx;
  };

  // ---- frame loop ----
  const clock = new THREE.Clock();
  ctx.active = () => state.started && !blocked();
  renderer.setAnimationLoop((t) => {
    fg.frame(t); ctx.jobs.run();
    if (!ctx.booted && !manifest.renderWhileBooting) { clock.getDelta(); return; }   // behind the title nothing is drawn until the boot steps are done (a time-sliced world build waits for frames: drawing a half-built scene every frame doubled the build time)
    const dt = Math.min(clock.getDelta(), 0.1);
    const active = state.started && !blocked();
    ctx.pad.poll(dt);
    if (ctx.lookInput) ctx.lookInput.update(dt);
    fp.update(dt);
    if (world.update) world.update(dt, ctx);
    const room = world.roomAt(camera.position.x, camera.position.z, camera.position.y);
    if (room !== state.room) { const from = state.room; state.room = room; if (room && !state.visited.includes(room)) state.visited.push(room); if (state.started) bus.emit('player:room', { from, to: room }); }
    target = ctx.target = state.started && !blocked() ? pickNow() : null;
    const h = target && handlerOf(target.kind);
    let text = h ? (h.prompt ? h.prompt(target, ctx) : '') : '';
    if (ctx.input === 'pad') text = text.replace(/\[E\]/g, '[A]'); else if (ctx.isTouch) text = text.replace(/\[E\] ?/g, 'タップ：');   // the key hint follows the device in use (touch: tap the thing, W18)
    const pe = $('prompt'); if (pe.dataset.t !== text) { pe.dataset.t = text; if (/<[a-z]/i.test(text)) pe.innerHTML = text; else pe.textContent = text; }
    $('crosshair').classList.toggle('on', !!text); $('crosshair').classList.toggle('aim', !!text);
    for (const m of monsters) m.inst && m.inst.update && m.inst.update(dt, ctx);
    for (const s of systems) s.def.update(dt, ctx, active, s.inst);
    if (ctx.audio.ctx) safe(() => ctx.audio.setListener(camera));
    look.update(dt, t / 1000, camera.position); look.render();
  });
  // GA4 events (no-ops unless the site build injected gtag)
  bus.on('game:start', () => track('game_start', { game: manifest.id, version: manifest.version }));
  bus.on('task:done', ({ id }) => track('task_done', { game: manifest.id, task: id }));
  bus.on('ending:reach', ({ id }) => track('ending_reached', { game: manifest.id, ending: id }));

  // test / QA hooks (docs/hud-slots.md): the overlap checker spawns every notification kind at once through stress()
  ctx.hudStressHooks = [];   // a game adds (on) => show / hide its own HUD parts (clock, sensors ...)
  if (ctx.debug || ctx.qa || window.__gf) window.__gfHud = hudTestHooks({ lane, ui, hooks: ctx.hudStressHooks });
  safe(() => { stageLook.apply(); if (!state.started) stageLook.title(); });   // the first stage's look on the title too; the title music waits for the first click / key
  bus.emit('game:ready', ctx);
  return ctx;
}
