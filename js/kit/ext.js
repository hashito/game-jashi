/* game-kit d62d2ac: js/ext.js — edit in game-kit and run tools/kit-sync.js */
// Extension points of the standard 3D first-person game (docs/standard-3d.md). Pure (no DOM, no THREE): runs in Node.
// One events bus + small registries. Game-specific code lives in js/ext/*.js of the game and ONLY talks to the standard
// through these (module-boundary rule: no module touches another module's DOM; use the bus and the data schemas).
//
//   const ext = createExtensions();                       // game-core.js makes one and passes it to every js/ext/*.js
//   ext.on('task:done', ({ id }) => ...);   ext.emit('my:event', data);
//   ext.registerTask('CLOCK', { minigame: { type: 'dial', cfg: { target: 110 } } });      // see TASK below
//   ext.registerMinigame('radio', { mount(host, cfg, ctx) { ...; return Promise<boolean> } });
//   ext.registerMonster('lurker', { create(ctx) { return { update(dt, ctx) {}, dispose() {} }; } });
//   ext.registerScreen('map', { open(ctx) {}, close(ctx) {} });          // a full window / screen, opened with ctx.openScreen('map')
//   ext.registerTab('notes', { label: 'メモ', order: 50, render(host, ctx) {}, badge(ctx) { return 0; } });
//   ext.registerInteract('lever', { prompt: (obj, ctx) => '[E] 引く', run(obj, ctx) {} });   // world objects with userData.interact.kind = 'lever'
//   ext.registerTheme('my-look', { css: 'css/theme-my-look.css' } | { tokens: { '--gf-bg': '#111' } });
// Added in standard 1.1 (the 届けるな sample, docs/standard-feedback.md): what a game with its OWN world and its OWN rules engine needs.
//   ext.registerWorld('plant', { build(ctx) -> world, createController?(ctx, opts) -> FirstPersonController-like })   // replaces world-from-plan (one per game)
//   ext.registerPersist('rules', { serialize(ctx) -> json, restore(json, ctx) })       // saved with the standard save (snapshot.ext.<id>)
//   ext.registerRender((dt, ctx, look) => { ... })                                        // the game draws each frame itself (own post pass; look.update / look.render are not called)
//   ext.registerSystem('hud', { create?(ctx) -> any, update(dt, ctx, active) })        // per-frame code that is not a monster
//   ext.registerBoot('prewarm', async (ctx, report) => {})                             // behind the title: report(0..1, 'text') while it loads; the start button waits
//   ext.registerTitleButton('chapters', { label, order?, when?(ctx), run(ctx) })        // extra buttons on the title (chapter select, gallery, credits)
//   ext.registerUi('inventory', { tabs, labels, decorate(item, ctx), actions, onUse, onExamine, onPick })   // 'inventory' | 'journal' | 'progress' | 'map' | 'guide' | 'title'
//   ext.registerDeath({ run(ctx, reason) })                                            // replaces the default die() (camera back to the checkpoint)
//   ext.registerLook('hasshaku', (o) => ({ root, update(dt, st, cam), respawn(), dispose() }))   // a monster look of the game; monsters.json "look": "hasshaku" (standard 1.7)
//   ext.registerSpotFx('my-fx', (host, step, env) => ms)                               // an effect for game.json / monsters.json "spotFx" (standard 1.9)
//   ext.registerItemKind('urn', (o) => THREE.Group)                                    // a model for items.json "kind": "urn" (list it in game.json "itemKinds"; standard 1.9)
//   ext.registerNoise('gong', { parts: [{ tone: true, dur: 2, freq: 110 }] })          // audio.noise('gong') like the standard noises (js/step-sound.js; standard 1.9)
//   ext.registerBed('cave', (ctx, dest) => ({ stop() {} }))                            // an ambience bed kind (js/ambience.js; standard 1.9)
//   ext.on('stage:look', ({ index, level, look }) => …)                                 // after the kit set a stage's fog / light / shown objects (js/stage-look.js)
//   ctx.syncOwned({ items, docs, tasks, flags, visited })                               // an external rules engine pushes its state; core emits the diff events
//
// TASK def: { run?(ctx, task) -> Promise<boolean>|boolean   // replaces the default "play the mini game, then done"
//             minigame?: { type, cfg }                       // a kit type (task-minigames.TYPES) or a registered one
//             canStart?(ctx, task) -> true | 'reason text'   // gate in code (data gates: tasks.json "needs")
//             onDone?(ctx, task) }                           // after the standard done handling (flag, progress, bus)
import { registerSpotFx } from './spot-fx.js';
import { registerNoise } from './step-sound.js';
import { registerBed } from './ambience.js';
export const EVENTS = {
  'game:ready': 'everything is built (payload: ctx)', 'game:start': 'the player pressed start / the first frame runs',
  'game:pause': '{ reason }', 'game:resume': '{}', 'game:save': '{ state }',
  'ui:open': '{ name }', 'ui:close': '{ name }',
  'player:room': '{ from, to } the room under the player changed', 'player:interact': '{ kind, id }',
  'player:dead': '{ reason }', 'player:respawn': '{ room }',
  'door:open': '{ id }', 'door:locked': '{ id, unlock }',
  'item:pickup': '{ id }', 'item:view': '{ id }', 'doc:read': '{ id }',
  'task:start': '{ id }', 'task:done': '{ id }', 'task:abort': '{ id }',
  'stage:up': '{ level, unlocks }', 'flag:set': '{ key }',
  'monster:seen': '{ id }', 'monster:lost': '{ id }',
  'ending:reach': '{ id }',
  'input:key': '{ code, event, handled } before the core key handling while playing; set handled = true to take the key',
  'player:floor': '{ from, to } the floor under the player changed (stairs / lifts)',
  'pad:key': '{ code, down, handled } a game controller button became a key (A = Enter in a window, KeyE while walking ...); set handled = true to take it (ctx.padOpen: predicates that make the pad act as in a window)',
  'input:mode': '{ mode } the input in use changed: mouse | touch | pad',
  'state:sync': '{ added, removed } ctx.syncOwned changed what the player owns / did',
};
export const KINDS = ['task', 'minigame', 'monster', 'screen', 'tab', 'interact', 'theme', 'world', 'persist', 'system', 'boot', 'title', 'ui', 'death'];

export function createBus() {
  const subs = new Map();
  const bus = {
    on(name, fn) { (subs.get(name) || subs.set(name, new Set()).get(name)).add(fn); return () => bus.off(name, fn); },
    once(name, fn) { const off = bus.on(name, (p) => { off(); fn(p); }); return off; },
    off(name, fn) { subs.get(name)?.delete(fn); },
    // a throwing listener never breaks the game or the other listeners; the error is reported as 'bus:error'
    emit(name, payload) {
      bus.last = { name, payload };
      for (const fn of [...(subs.get(name) || []), ...(subs.get('*') || [])]) {
        try { fn(payload, name); } catch (e) { if (name !== 'bus:error') bus.emit('bus:error', { name, error: e }); else console.error(e); }
      }
    },
    count: (name) => subs.get(name)?.size || 0,
  };
  return bus;
}

export function createRegistry(kind, check = () => null) {
  const map = new Map();
  return {
    kind,
    register(id, def) {
      if (typeof id !== 'string' || !id) throw new Error(`${kind}: id must be a non-empty string`);
      if (!def || typeof def !== 'object') throw new Error(`${kind} "${id}": definition must be an object`);
      const bad = check(def, id);
      if (bad) throw new Error(`${kind} "${id}": ${bad}`);
      map.set(id, { ...def, id });
      return def;
    },
    unregister: (id) => map.delete(id),
    get: (id) => map.get(id),
    has: (id) => map.has(id),
    list: () => [...map.values()],
    ids: () => [...map.keys()],
  };
}

const fn = (def, name) => (typeof def[name] === 'function' ? null : `needs a ${name}() function`);
export function createExtensions() {
  const bus = createBus();
  const reg = {
    task: createRegistry('task', (d) => (d.run && typeof d.run !== 'function' ? 'run must be a function' : d.minigame && !d.minigame.type ? 'minigame needs a type' : null)),
    minigame: createRegistry('minigame', (d) => fn(d, 'mount')),
    monster: createRegistry('monster', (d) => fn(d, 'create')),
    screen: createRegistry('screen', (d) => fn(d, 'open')),
    tab: createRegistry('tab', (d) => (!d.label ? 'needs a label' : fn(d, 'render'))),
    interact: createRegistry('interact', (d) => fn(d, 'run')),
    theme: createRegistry('theme', (d) => (d.css || d.tokens ? null : 'needs css (url) or tokens (object)')),
    world: createRegistry('world', (d) => fn(d, 'build')),
    persist: createRegistry('persist', (d) => fn(d, 'serialize') || fn(d, 'restore')),
    system: createRegistry('system', (d) => fn(d, 'update')),
    boot: createRegistry('boot', (d) => fn(d, 'run')),
    title: createRegistry('title', (d) => (!d.label ? 'needs a label' : fn(d, 'run'))),
    ui: createRegistry('ui', () => null),
    death: createRegistry('death', (d) => fn(d, 'run')),
    look: createRegistry('look', (d) => fn(d, 'create')),
    itemKind: createRegistry('itemKind', (d) => fn(d, 'make')),
    render: createRegistry('render', (d) => fn(d, 'render')),
  };
  return {
    bus, reg, ...bus,
    registerTask: (id, d) => reg.task.register(id, d),
    registerMinigame: (type, d) => reg.minigame.register(type, d),
    registerMonster: (id, d) => reg.monster.register(id, d),
    registerScreen: (id, d) => reg.screen.register(id, d),
    registerTab: (id, d) => reg.tab.register(id, { order: 100, ...d }),
    registerInteract: (kind, d) => reg.interact.register(kind, d),
    registerTheme: (id, d) => reg.theme.register(id, d),
    registerWorld: (id, d) => reg.world.register(id, d),
    registerPersist: (id, d) => reg.persist.register(id, d),
    registerSystem: (id, d) => reg.system.register(id, d),
    registerBoot: (id, d) => reg.boot.register(id, typeof d === 'function' ? { run: d } : d),
    registerTitleButton: (id, d) => reg.title.register(id, { order: 100, ...d }),
    registerUi: (section, d) => reg.ui.register(section, d),
    registerDeath: (d) => reg.death.register('death', d),
    registerRender: (d) => reg.render.register('render', typeof d === 'function' ? { render: d } : d),   // standard 1.10.7: a game draws the frame itself (its own post pass): render(dt, ctx, look) replaces look.update + look.render
    registerItemKind: (kind, d) => reg.itemKind.register(kind, typeof d === 'function' ? { make: d } : d),   // standard 1.9: a game's own item model (game.json itemKinds lists it)
    registerSpotFx: (name, make, label) => registerSpotFx(name, make, label),   // standard 1.9: a game's own 'it saw you' effect (js/spot-fx.js)
    registerNoise: (name, def) => registerNoise(name, def),   // standard 1.9: a game's own audio.noise (js/step-sound.js)
    registerBed: (name, build) => registerBed(name, build),   // standard 1.9: a game's own ambience bed kind (js/ambience.js)
    registerLook: (name, d) => reg.look.register(name, typeof d === 'function' ? { create: d } : d),
    titleButtons: () => reg.title.list().sort((a, b) => a.order - b.order),
    uiOf: (section) => reg.ui.get(section) || {},
    tabs: () => reg.tab.list().sort((a, b) => a.order - b.order),
  };
}
