import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import * as layout from '../dist/layout.js';
import * as survivalRules from '../dist/survival.js';
import * as narrative from '../dist/narrative.js';
import * as enemyRules from '../dist/enemy.js';
import * as storyRules from '../dist/story.js';
import * as dialogueRules from '../dist/dialogue.js';
import * as gimmickRules from '../dist/gimmicks.js';
import * as guidanceRules from '../dist/guidance.js';

// Execute the shipped controller and its real rule/story modules. Only browser,
// audio and rendering boundaries are replaced; progress is earned by interact().
const sourcePath = new URL('../dist/main.js', import.meta.url);
const source = fs.readFileSync(sourcePath, 'utf8')
  .replace(/^import[^\n]*\n/gm, '')
  .replace(/^boot\(\);\s*$/m, '');
const markup = fs.readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');

async function harness({ boot = true, storage = new Map(), failWorld = false } = {}) {
  const nodes = new Map(), actions = new Map(), raf = new Map(), windowEvents = new Map();
  let now = 0, nextFrame = 0, run, doc;
  const calls = { cues: [], tape: [], scares: [], throws: [], errors: [] };
  class Element {
    constructor(tag = 'div') {
      this.tagName = tag.toUpperCase();
      this.hidden = false; this.disabled = false; this.dataset = {}; this.style = {};
      this.textContent = ''; this.value = ''; this.children = []; this.listeners = new Map();
      const classes = new Set();
      this.classList = {
        add: (...names) => names.forEach(name => classes.add(name)),
        remove: (...names) => names.forEach(name => classes.delete(name)),
        contains: name => classes.has(name),
        toggle(name, force) { const on = force ?? !classes.has(name); on ? classes.add(name) : classes.delete(name); return on; },
      };
    }
    set innerHTML(html) { this.html = html; parse(html); }
    get innerHTML() { return this.html || ''; }
    addEventListener(type, callback) { const listeners = this.listeners.get(type) || []; listeners.push(callback); this.listeners.set(type, listeners); }
    emit(type, event = {}) { for (const fn of this.listeners.get(type) || []) fn({ target: this, preventDefault() {}, ...event }); }
    matches(selector) { if(selector==='[data-radio-dial]')return this.id==='radio-dial';return selector.split(',').some(tag => tag.trim().toUpperCase() === this.tagName); }
    closest(selector) { return selector === '[data-action]' && this.dataset.action ? this : null; }
    querySelector(selector) { return query(selector); }
    querySelectorAll(selector) { return selector.includes('button') ? [...actions.values()].filter(node => !node.disabled) : []; }
    focus() { doc.activeElement = this; }
    setPointerCapture() {}
    getBoundingClientRect() { return { left: 0, top: 0, width: 120, height: 120 }; }
    setAttribute(key, value) { this[key] = value; }
    append(...children) { this.children.push(...children); }
  }
  function parse(html) {
    for (const match of html.matchAll(/<([a-z][\w-]*)\b([^>]*)>/gi)) {
      const [, tag, attrs] = match;
      const id = attrs.match(/\bid="([^"]+)"/)?.[1];
      const action = attrs.match(/\bdata-action="([^"]+)"/)?.[1];
      if (!id && !action) continue;
      const node = id && nodes.get(id) || new Element(tag);
      node.hidden = /(?:^|\s)hidden(?:\s|$)/.test(attrs);
      node.disabled = /(?:^|\s)disabled(?:\s|$)/.test(attrs);
      if (id) { node.id = id; nodes.set(id, node); }
      if (action) { node.dataset.action = action; actions.set(action, node); }
    }
  }
  function query(selector) {
    if (selector.startsWith('#')) return nodes.get(selector.slice(1)) || null;
    const action = selector.match(/\[data-action="([^"]+)"\]/)?.[1];
    if (action) return actions.get(action) || null;
    if (selector === 'button') return [...actions.values()].find(node => !node.disabled) || null;
    return null;
  }
  doc = new Element('document');
  doc.body = new Element('body'); doc.hidden = false; doc.pointerLockElement = null;
  doc.getElementById = id => nodes.get(id) || null;
  doc.querySelector = query;
  doc.exitPointerLock = () => { doc.pointerLockElement = null; };
  doc.createElement = tag => new Element(tag);
  parse(markup);

  class Soundscape {
    setVolume() {} setMuted() {} start() { return Promise.resolve(true); }
    cue(name) { calls.cues.push(name); }
    update(state) { calls.audio = { ...state }; }
  }
  class TapeEffects {
    constructor() { this.canvas = new Element('canvas'); }
    trigger(name) { calls.tape.push(name); }
    clear() { calls.tape.push('clear'); }
    update(state) { calls.tapeFrame = state; }
  }
  class MountainWorld {
    constructor() {
      if (failWorld) throw new Error('simulated renderer initialization failure');
      this.canvas = new Element('canvas');
      this.canvas.requestPointerLock = () => { doc.pointerLockElement = this.canvas; return Promise.resolve(); };
      this.camera = { position: new THREE.Vector3(), direction: new THREE.Vector3(0, 0, -1), getWorldDirection(v) { return v.copy(this.direction); } };
      this.renderer = { shadowMap: {}, setPixelRatio() {} };
      this.items = Object.fromEntries([...Object.entries(layout.LANDMARKS).map(([id, p]) => ({ id, ...p })), ...layout.LORE_PLACEMENTS].map(p => [p.id, { ...p, marker: { visible: true }, mesh: { visible: true } }]));
      this.blocked = false; this.freezeEnemy = false; this.gateOpen = false;
    }
    setGateOpen(open) { this.gateOpen = open; }
    setShutterClosed(closed) { this.shutterClosed = closed; }
    ringBell(time) { calls.bellTime = time; }
    setItemCollected(id, value) { this.items[id].marker.visible = !value; this.items[id].mesh.visible = !value; }
    ground(x, z, level = 0) {
      const stair = layout.STAIRS;
      if (Math.abs(x - stair.x) <= stair.width / 2 && z >= stair.minZ && z <= stair.maxZ) return stair.rise * (z - stair.minZ) / (stair.maxZ - stair.minZ);
      return level === 1 ? layout.FLOORS[1].height : 0;
    }
    actorHeight(pos) { return this.ground(pos.x, pos.z, pos.level || 0); }
    isBlocked() { return this.blocked; }
    isSegmentFree() { return !this.blocked; }
    isFree(x, z) { return !(this.invalidPosition && Math.hypot(x - this.invalidPosition.x, z - this.invalidPosition.z) < .1); }
    isFreeAt(pos) { return this.isFree(pos.x, pos.z); }
    move(pos, dx, dz) {
      if (this.freezeEnemy && pos === run('enemy.position')) return;
      pos.x += dx; pos.z += dz;
      if (Math.abs(pos.x - layout.STAIRS.x) <= layout.STAIRS.width / 2) {
        if (pos.level === 0 && pos.z >= layout.STAIRS.maxZ && pos.z <= layout.STAIRS.top.z + .2) pos.level = 1;
        if (pos.level === 1 && pos.z <= layout.STAIRS.minZ && pos.z >= layout.STAIRS.bottom.z - .2) pos.level = 0;
      }
    }
    findPath(start, end) { return this.blocked ? [] : [{ ...end }]; }
    eyePosition() { const p = run('monster'); return new THREE.Vector3(p.x, this.actorHeight(p) + 1.65, p.z); }
    throwRepellent(target) { calls.throws.push({ ...target }); }
    triggerScare(id) { calls.scares.push(id); }
    update(state) {
      this.frame = state;
      this.camera.position.set(state.pos.x, this.actorHeight(state.pos) + 1.65, state.pos.z);
      this.camera.direction.set(-Math.sin(state.yaw) * Math.cos(state.pitch), Math.sin(state.pitch), -Math.cos(state.yaw) * Math.cos(state.pitch));
    }
    resize() {}
  }
  const context = vm.createContext({
    THREE, ...layout, ...survivalRules, ...narrative, ...enemyRules, ...storyRules, ...dialogueRules, ...gimmickRules, ...guidanceRules, MountainWorld, Soundscape, TapeEffects,
    document: doc, localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    matchMedia: () => ({ matches: false }), performance: { now: () => now }, devicePixelRatio: 1,
    requestAnimationFrame: callback => { const id = ++nextFrame; raf.set(id, callback); return id; },
    cancelAnimationFrame: id => raf.delete(id),
    addEventListener: (type, callback) => { const handlers = windowEvents.get(type) || []; handlers.push(callback); windowEvents.set(type, handlers); },
    console: { ...console, error: error => calls.errors.push(error.message) },
  });
  run = code => vm.runInContext(code, context, { filename: sourcePath.pathname });
  run(source);
  function frame(ms = 50) {
    now += ms;
    const pending = [...raf.values()]; raf.clear();
    for (const callback of pending) callback(now);
  }
  async function load() { const promise = run('boot()'); frame(); frame(); await promise; }
  function click(name) {
    const target = actions.get(name) || Object.assign(new Element('button'), { dataset: { action: name } });
    doc.emit('click', { target });
  }
  function press(code) { doc.emit('keydown', { code, repeat: false, target: doc.body }); }
  function release(code) { doc.emit('keyup', { code, target: doc.body }); }
  function advance(seconds) { for (let elapsed = 0; elapsed < seconds - 1e-8; elapsed += .05) frame(); }
  function moveTo(x, z, yaw = 0, level = 0) { run(`Object.assign(player,{x:${x},z:${z},level:${level}});yaw=${yaw};renderFrame(0);`); }
  function use(id) {
    const item = run(`world.items[${JSON.stringify(id)}]`);
    assert.ok(item, `World item ${id} exists`);
    moveTo(item.x, item.z + .45, 0, item.level || 0);
    assert.equal(run('findTarget()?.id'), id, `Interaction targets ${id}`);
    press('KeyE'); release('KeyE');
  }
  function pickup(id) { use(id); if (run('mode') === 'panel') click('close-panel'); }
  function fresh() { click('start'); assert.equal(run('panelKind'), 'intro'); click('begin'); assert.equal(run('mode'), 'play'); }
  function encounter() {
    use('telescope'); assert.equal(run('mode'), 'scope');
    advance(narrative.TELESCOPE_SCENES.reduce((sum, beat) => sum + beat.duration, 0) + .2);
    assert.equal(run('mode'), 'play'); assert.equal(run('flags.seen'), true);
  }
  function descend() {
    moveTo(layout.STAIRS.bottom.x, layout.STAIRS.bottom.z, 0, 0); advance(.1);
    assert.equal(run('flags.downstairs'), true);
  }
  function placeEnemy(x, z, heading = Math.PI, level = 0) {
    run(`Object.assign(enemy.position,{x:${x},z:${z},level:${level}});monster=enemy.position;enemy.heading=${heading};enemy.route=[];enemy.routeAge=0;`);
  }
  function safeEnemy() { placeEnemy(-33, -33); run('world').freezeEnemy = true; }
  function tuneRadio() {
    if(run('flags.radioTuned'))return;
    use('radio'); assert.equal(run('panelKind'),'radio');
    while(run('mechanisms.dial')<gimmickRules.RADIO.target)click('radio-plus');
    while(run('mechanisms.dial')>gimmickRules.RADIO.target)click('radio-minus');
    advance(1.3);click('radio-lock');assert.equal(run('flags.radioTuned'),true);
  }
  function equip() { if (run('flags.seen&&!flags.downstairs')) descend();if(run('flags.seen'))tuneRadio();for (const id of ['glasses', 'note', 'bottle', 'crank']) if (!run(`flags.${id}`)) pickup(id); }
  function settleStory(stage = 5) {
    safeEnemy();
    if(run('flags.seen'))tuneRadio();
    for (let i = 0; i < 600; i++) {
      if (run(`story.stage>=${stage}&&speechQueue.length===0&&speechTime<=0`)) return;
      advance(1);
      assert.equal(run('mode'), 'play', 'story pacing remains playable while pending speech is delivered');
    }
    assert.fail(`story did not reach quiet stage ${stage}: ` + run('JSON.stringify({story,speechQueue,speechTime,time})'));
  }
  function completeEscape() {
    safeEnemy(); settleStory(); use('gate'); assert.equal(run('action?.type'), 'gate');
    advance(survivalRules.RULES.gateSeconds + .1);
    assert.equal(run('flags.gate'), true); assert.equal(run('mode'), 'play');
    use('car'); assert.equal(run('action?.type'), 'engine');
    advance(survivalRules.RULES.engineSeconds + .1);
    assert.equal(run('panelKind'), 'ending');
  }
  if (boot) await load();
  return { run, nodes, actions, doc, calls, storage, load, frame, advance, click, press, release, moveTo, use, pickup, fresh, encounter, descend, tuneRadio, safeEnemy, placeEnemy, settleStory, equip, completeEscape,
    state: expression => JSON.parse(JSON.stringify(run(expression))),
  };
}

test('boot waits for the world, binds real HTML controls, and handles failed initialization', async () => {
  const h = await harness({ boot: false });
  for (const action of ['start', 'continue', 'retry', 'journal', 'interact']) h.run(`dispatch(${JSON.stringify(action)})`);
  assert.equal(h.run('mode'), 'title');
  assert.equal(h.run('started'), false);
  assert.equal(h.run('world'), undefined);
  await h.load();
  assert.deepEqual(h.calls.errors, []);
  assert.equal(h.nodes.get('start-button').disabled, false);
  h.fresh(); h.advance(.1);
  assert.equal(h.run('started'), true);
  assert.ok(h.run('validSave(read(SAVE_KEY,null))'));
  assert.equal(h.calls.tapeFrame.playing, true);
  const failure = await harness({ failWorld: true });
  assert.equal(failure.calls.errors.length, 1);
  assert.match(failure.nodes.get('loading-label').textContent, /失敗/);
  failure.run("dispatch('continue')");
  assert.equal(failure.run('mode'), 'title');
});

test('search help pauses the real game and shows a matching prop, place, purpose and action',async()=>{
  const h=await harness();h.fresh();
  assert.equal(h.nodes.get('objective').textContent,'三脚の望遠鏡');
  assert.equal(h.nodes.get('search-thumb').src,'assets/items/telescope.png');
  h.click('search-help');assert.equal(h.run('panelKind'),'search-help');
  const time=h.run('time');h.advance(25);assert.equal(h.run('time'),time);
  const body=h.nodes.get('panel-body').innerHTML;
  for(const text of ['三脚の望遠鏡','二階のベランダ','場所','見た目','目的','操作','ゲーム内の物と同じ形'])assert.ok(body.includes(text),text);
  h.click('close-panel');assert.equal(h.run('mode'),'play');
  h.run('Object.assign(flags,{seen:true,downstairs:true,radioTuned:true,glasses:true,note:true});story.stage=4;updateObjective();');
  assert.equal(h.nodes.get('objective').textContent,'蓋つきのボトル2本');
  assert.equal(h.nodes.get('search-thumb').src,'assets/items/bottle.png');
  h.click('journal');assert.match(h.nodes.get('panel-body').innerHTML,/蓋つきのボトル2本/);
  assert.match(h.nodes.get('panel-body').innerHTML,/西の物置・中の床/);
});

test('radio-wait never points to the locked gate, and resumed saves derive the correct next object',async()=>{
  const h=await harness();h.fresh();
  h.run('Object.assign(flags,{seen:true,downstairs:true,radioTuned:true,glasses:true,note:true,bottle:true,crank:true});story.stage=4;updateObjective();');
  assert.equal(h.run('getObjective().id'),'listen');assert.equal(h.run('navigationTarget()'),null);assert.equal(h.run('currentGuide()'),null);
  h.run('story.stage=5;updateObjective();');assert.equal(h.run('getObjective().id'),'gate');
  h.run('flags.gate=true;world.setGateOpen(true);updateObjective();');
  const save=h.state('serialize()');h.run(`restore(${JSON.stringify(save)})`);
  assert.equal(h.run('getObjective().id'),'car');assert.equal(h.nodes.get('objective').textContent,'駐車場の車');
});

test('the upstairs telescope reveals three timed beats and pauses without skipping or exposing items through the floor', async () => {
  const h = await harness(); h.fresh();
  assert.equal(h.run('player.level'), 1);
  const glasses = layout.LANDMARKS.glasses;
  h.moveTo(glasses.x, glasses.z + .45, 0, 1);
  assert.notEqual(h.run('findTarget()?.id'), 'glasses', 'the downstairs desk cannot be used from above');
  h.press('KeyE'); h.release('KeyE');
  assert.equal(h.run('flags.glasses'), false);
  h.use('telescope');
  assert.equal(h.run('mode'), 'scope');
  assert.equal(h.run('scope.phase'), 0);
  assert.doesNotMatch(h.nodes.get('scope-text').innerHTML, /縦の目|邪視/);
  h.press('KeyE'); h.release('KeyE');
  assert.equal(h.run('flags.seen'), false, 'interaction cannot skip directly to the revelation');
  h.advance(4.9); assert.equal(h.run('scope.phase'), 0);
  h.click('pause');
  const paused = h.state('({time,scope,enemy,survival})'); h.advance(5);
  assert.deepEqual(h.state('({time,scope,enemy,survival})'), paused);
  h.click('close-panel'); assert.equal(h.run('mode'), 'scope');
  h.advance(.2); assert.equal(h.run('scope.phase'), 1);
  assert.match(h.nodes.get('scope-text').innerHTML, /白い背中/);
  h.advance(6.1); assert.equal(h.run('scope.phase'), 2);
  h.advance(4.4); assert.equal(h.run('flags.seen'), false);
  h.advance(2.1);
  assert.equal(h.run('flags.seen'), true);
  assert.equal(h.run('story.stage'), 1);
  assert.equal(h.run('player.level'), 1);
  assert.equal(h.run('getObjective().id'), 'stairs');
  assert.ok(h.calls.tape.includes('encounter'));
  h.descend();
  assert.equal(h.run('story.stage'), 2);
  assert.equal(h.run('getObjective().id'), 'radio');
  h.tuneRadio();
  assert.equal(h.run('getObjective().id'), 'glasses');
});

test('encounter and equipment progress through actual interaction; early collection remains playable', async () => {
  const h = await harness(); h.fresh();
  assert.equal(h.run('getObjective().id'), 'telescope');
  h.encounter();
  assert.equal(h.run('getObjective().id'), 'stairs');
  h.descend();
  assert.equal(h.run('getObjective().id'), 'radio');
  h.tuneRadio();
  assert.equal(h.run('getObjective().id'), 'glasses');
  assert.ok(h.calls.tape.includes('encounter'));
  for (const [id, next] of [['glasses', 'note'], ['note', 'bottle'], ['bottle', 'crank'], ['crank', 'gate']]) {
    h.pickup(id); assert.equal(h.run('getObjective().id'), next);
  }
  assert.ok(h.run('flags.key&&glassesOn&&flags.hunt&&charges===2'));
  assert.equal(h.run('world.items.crank.marker.visible'), false);
  for (const order of [
    ['crank', 'bottle', 'note', 'glasses'], ['bottle', 'glasses', 'crank', 'note'],
    ['note', 'crank', 'glasses', 'bottle'], ['glasses', 'note', 'bottle', 'crank'],
  ]) {
    h.fresh(); for (const id of order) h.pickup(id);
    assert.equal(h.run('flags.hunt'), false);
    h.encounter();
    assert.equal(h.run('story.stage'), 1);
    assert.equal(h.run('flags.hunt'), false, 'pre-collected crank does not skip the first sighting');
    h.descend();
    assert.equal(h.run('story.stage'), 2);
    assert.equal(h.run('flags.hunt'), false, 'first descent allows the uncle to speak before pursuit escalates');
    h.settleStory();
    assert.ok(h.run('flags.hunt&&flags.key&&charges===2'));
    const delivered = h.state('story.delivered');
    for (const key of ['encounter', 'downstairs', 'glasses', 'note', 'bottle', 'crank']) assert.ok(delivered.includes(key), key + ' must not be lost when picked up early');
    const history = h.state('conversation');
    const ordered = ['encounter', 'downstairs', 'glasses', 'note', 'trail', 'bottle', 'crank'].map(key => ({ key, index: history.findIndex(line => line.beat === key) }));
    for (let i = 0; i < ordered.length; i++) {
      assert.ok(ordered[i].index >= 0, ordered[i].key + ' reaches the actual subtitles');
      if (i > 0) assert.ok(ordered[i].index > ordered[i - 1].index, ordered[i].key + ' follows ' + ordered[i - 1].key);
    }
    assert.equal(h.run('getObjective().id'), 'gate');
    assert.ok(h.run('validSave(checkpoint)'));
  }
});

test('bottle range, cover, delayed impact and resumed pursuit connect to rendering and inventory', async () => {
  const h = await harness(); h.fresh(); h.encounter(); h.equip();
  h.moveTo(0, 0); h.placeEnemy(0, 15);
  h.press('KeyR'); h.release('KeyR'); assert.equal(h.run('charges'), 2);
  h.placeEnemy(0, 6); h.run('world.blocked=true;');
  h.press('KeyR'); h.release('KeyR'); assert.equal(h.run('charges'), 2);
  h.run('world.blocked=false;'); h.press('KeyR'); h.release('KeyR');
  h.press('KeyR'); h.release('KeyR');
  assert.equal(h.run('charges'), 1); assert.equal(h.calls.throws.length, 1);
  assert.equal(h.run('survival.stun'), 0);
  h.advance(.65);
  assert.ok(h.run('survival.stun>5.9'));
  assert.ok(h.calls.cues.includes('stun'));
  assert.equal(h.run('world.frame.repelled'), true);
  h.moveTo(0, -8); h.advance(6.6);
  assert.equal(h.run('survival.stun'), 0);
  h.advance(.8); // Recovery has a visible pause before the creature moves again.
  const before = h.run('distance(player,monster)'); h.advance(1);
  assert.ok(h.run('distance(player,monster)') < before, 'Pursuit really resumes after stun');
  assert.equal(h.run('flags.hunt'), true);
  assert.equal(h.run('mode'), 'play');
  const target = h.state('monster'); h.moveTo(target.x, target.z - 6, Math.PI);
  h.press('KeyR'); h.release('KeyR'); h.advance(.65);
  assert.equal(h.run('charges'), 0); assert.equal(h.calls.throws.length, 2);
  h.press('KeyR'); h.release('KeyR');
  assert.equal(h.calls.throws.length, 2, 'The two physical bottles allow exactly two throws');
  h.click('journal-records'); h.click('read-bottle');
  assert.equal(h.run('charges'), 0, 'Reviewing the bottle document cannot refill inventory');
});

test('gate and car enforce prerequisites, timed actions, distance cancellation and pause', async () => {
  const h = await harness(); h.fresh(); h.use('gate');
  assert.equal(h.run('action'), null); assert.match(h.nodes.get('toast').textContent, /鍵束/);
  h.pickup('glasses'); h.use('gate');
  assert.equal(h.run('action'), null); assert.match(h.nodes.get('toast').textContent, /ハンドル/);
  h.use('car'); assert.equal(h.run('action'), null);
  h.encounter(); h.descend(); h.pickup('note'); h.pickup('bottle'); h.pickup('crank'); h.safeEnemy(); h.settleStory();
  h.use('gate'); h.advance(.5);
  assert.ok(h.run('action.elapsed>0&&action.elapsed<RULES.gateSeconds&&!flags.gate'));
  assert.match(h.nodes.get('search-phase').textContent,/巻き上げ中/);
  assert.doesNotMatch(h.nodes.get('search-phase').textContent,/Eで/);
  h.moveTo(layout.LANDMARKS.gate.x + 5, layout.LANDMARKS.gate.z); h.advance(.05);
  assert.equal(h.run('action'), null); assert.equal(h.run('flags.gate'), false);
  assert.doesNotMatch(h.nodes.get('search-phase').textContent,/巻き上げ中/);
  h.use('gate'); h.advance(survivalRules.RULES.gateSeconds + .1);
  assert.equal(h.run('world.gateOpen'), true); assert.equal(h.run('getObjective().id'), 'car');
  assert.ok(h.run('conversation.some(line=>line.speaker==="修司（無線）"&&line.text.includes("道は通れる"))'), 'The road-clearance report is shown before engine dialogue can interrupt it');
  h.use('car'); h.advance(.5);
  assert.match(h.nodes.get('search-phase').textContent,/始動中/);
  h.click('pause');
  const frozen = h.state('({time,monster,action,survival})'); h.advance(3);
  assert.deepEqual(h.state('({time,monster,action,survival})'), frozen);
  h.click('close-panel'); h.advance(.5);
  assert.ok(h.run('action.elapsed>=1&&!survival.dead'));
  assert.notEqual(h.run('panelKind'), 'ending');
  h.advance(survivalRules.RULES.engineSeconds);
  assert.equal(h.run('panelKind'), 'ending');
  assert.equal(h.nodes.get('panel-title').textContent, narrative.ENDINGS.return.title);
  assert.equal(h.run('read(SAVE_KEY,null)'), null); assert.equal(h.run('checkpoint'), null);
});

test('an actual attack cancels engine startup and a third attack kills even with eyes closed', async () => {
  const h = await harness(); h.fresh(); h.encounter(); h.equip(); h.safeEnemy(); h.settleStory();
  h.use('gate'); h.advance(survivalRules.RULES.gateSeconds + .1); h.use('car');
  // In front of the camera (use() faces -z): strikes never begin from behind.
  const player = h.state('player'); h.placeEnemy(player.x, player.z - .9, 0);
  h.run('world.freezeEnemy=false;survival.cooldown=0;');
  h.press('Space'); h.advance(1.2);
  assert.equal(h.run('survival.health'), 100 - survivalRules.RULES.attackDamage);
  assert.equal(h.run('action'), null); assert.equal(h.run('flags.firstAttack'), true);
  assert.ok(h.calls.cues.includes('windup')&&h.calls.cues.includes('attack')&&h.calls.cues.includes('hit'));
  assert.ok(h.calls.tape.includes('hit'));
  h.advance(4);
  assert.equal(h.run('survival.dead'), false, 'two hits are survivable');
  h.advance(4.5);
  assert.equal(h.run('survival.dead'), true);
  assert.equal(h.run('flags.deathReason'), 'attack');
  assert.deepEqual(h.state('read(END_KEY,[])'), []);
  h.advance(3);
  assert.equal(h.run('panelKind'), 'death');
  assert.equal(h.nodes.get('panel-eyebrow').textContent, '死亡 ／ 録画終了');
  h.click('retry');
  assert.ok(h.run('mode==="play"&&started&&!survival.dead&&survival.health>=55&&flags.key&&flags.crank'));
  assert.equal(h.run('action'), null);
});

test('gaze exhaustion reaches the death sequence and cannot be turned into an ending', async () => {
  const h = await harness(); h.fresh(); h.encounter(); h.pickup('glasses');
  h.moveTo(0, 0); h.placeEnemy(0, -12, 0); h.run('world.freezeEnemy=true;survival.sanity=.1;');
  h.advance(.05);
  assert.ok(h.run('survival.dead&&mode==="dying"&&flags.deathReason==="gaze"'));
  h.run('endGame()'); assert.deepEqual(h.state('read(END_KEY,[])'), []);
  h.advance(3); assert.equal(h.run('panelKind'), 'death');
  assert.match(h.nodes.get('panel-title').textContent, /視線/);
});

test('all successful endings require finishing the engine and preserve distinct unlocks', async () => {
  const h = await harness();
  for (const kind of ['return', 'witness', 'voice']) {
    h.fresh(); h.encounter(); h.equip(); h.safeEnemy();
    if (kind !== 'return') {
      for (const id of ['boots', 'ledger', 'tag', 'ribbon', 'photo']) h.pickup(id);
      assert.equal(h.run('completed.size'), 2);
    }
    if (kind === 'voice') { h.use('phone'); h.click('answer-phone'); assert.equal(h.run('flags.phone'), true); }
    else if (kind === 'witness') { h.use('phone'); h.click('ignore-phone'); assert.equal(h.run('flags.phone'), false); }
    assert.notEqual(h.run('panelKind'), 'ending');
    h.completeEscape();
    assert.equal(h.nodes.get('panel-title').textContent, narrative.ENDINGS[kind].title);
    assert.ok(h.state('read(END_KEY,[])').includes(kind));
    assert.equal(h.run('read(SAVE_KEY,null)'), null);
    h.click('credits'); h.click('close-panel');
    assert.ok(h.run('mode==="title"&&!started'));
  }
  assert.deepEqual(h.state('read(END_KEY,[])'), ['return', 'witness', 'voice']);
});

test('small-object chains, conversation history and journal rereads retain their real records', async () => {
  const h = await harness(); h.fresh(); h.advance(10);
  assert.ok(h.run('conversation.length>=2'));
  h.click('journal-dialogue');
  assert.match(h.nodes.get('panel-body').innerHTML, /修司/);
  assert.match(h.nodes.get('panel-body').innerHTML, /二階/);
  h.click('close-panel');
  h.use('cassette');
  assert.equal(h.nodes.get('panel-title').textContent, '古いカセットケース');
  assert.doesNotMatch(h.nodes.get('panel-body').innerHTML, /車の外|もう一度|鳴っていた/);
  h.click('close-panel');
  for (const id of ['mirror', 'toy']) h.pickup(id);
  assert.equal(h.run('completed.size'), 0, 'collecting a set before the encounter does not expose its conclusion');
  h.click('journal-records');
  assert.doesNotMatch(h.nodes.get('panel-body').innerHTML, /連れて帰った二人|閉じられなかった一日の仕事|巻き上げハンドル/);
  h.click('close-panel');
  h.encounter(); h.descend(); h.equip(); h.safeEnemy();
  assert.deepEqual(h.state('[...completed]'), ['voices']);
  h.click('journal-records');
  assert.match(h.nodes.get('panel-body').innerHTML, /連れて帰った二人/);
  assert.match(h.nodes.get('panel-body').innerHTML, /記録がつながった/);
  const count = h.run('speechQueue.length');
  h.click('read-cassette');
  assert.equal(h.nodes.get('panel-title').textContent, narrative.LORE.cassette.title);
  assert.equal(h.run('speechQueue.length'), count, 'Rereading does not queue duplicate dialogue');
  h.click('close-panel');
  h.click('journal-records'); h.click('read-bottle');
  assert.equal(h.run('charges'), 2);
  h.click('close-panel'); h.click('journal');
  assert.match(h.nodes.get('panel-body').innerHTML, /現在位置/);
  assert.match(h.nodes.get('panel-body').innerHTML, /一階・山道/);
  h.click('map-1');
  assert.match(h.nodes.get('panel-body').innerHTML, /二階とベランダ、階段/);
  h.click('map-0');
  assert.match(h.nodes.get('panel-body').innerHTML, /一階と山道/);
});

test('safe checkpoints restore inventory, story and preferences; danger cannot overwrite them', async () => {
  const h = await harness(); h.fresh(); h.encounter(); h.equip(); h.safeEnemy();
  for (const id of ['boots', 'ledger', 'tag']) h.pickup(id);
  h.moveTo(0, 10); h.press('KeyF'); h.release('KeyF'); h.press('KeyQ'); h.release('KeyQ');
  h.advance(1); h.run('saveCheckpoint()');
  const saved = h.state('checkpoint');
  assert.ok(saved.completed.includes('attendance'));
  assert.equal(saved.lamp, false); assert.equal(saved.glassesOn, false);
  const current = h.state('player'); h.placeEnemy(current.x, current.z + 1);
  h.run('saveCheckpoint()');
  assert.deepEqual(h.state('checkpoint'), saved, 'Close danger keeps the previous safe checkpoint');
  h.click('title'); h.click('continue');
  assert.ok(h.run('mode==="play"&&flags.crank&&flags.key&&charges===2&&!lamp&&!glassesOn'));
  assert.deepEqual(h.state('[...completed]'), saved.completed);
  assert.deepEqual(h.state('conversation'), saved.conversation);
  assert.deepEqual(h.state('story'), saved.story);
  assert.deepEqual(h.state('speechQueue'), saved.speechQueue);
  assert.deepEqual(h.state('activeSpeech'), saved.activeSpeech);
  assert.equal(h.run('speechTime'), saved.speechTime);
  assert.deepEqual(h.state('enemy.position'), saved.enemy.position);
  assert.equal(h.run('time'), saved.time);
  assert.ok(h.run('survival.phase==="idle"&&!survival.dead&&action===null'));
  h.run('world.invalidPosition={...player};'); h.click('title'); h.click('continue');
  assert.deepEqual(h.state('player'), { x: layout.SPAWN.x, z: layout.SPAWN.z, level: layout.SPAWN.level });
});

test('missing, legacy and out-of-map saves fall back to a fresh intro instead of broken play', async () => {
  const h = await harness(); h.fresh();
  const valid = h.state('serialize()');
  const invalid = [null, { ...valid, v: 2 }, { ...valid, player: { ...valid.player, level: 2 } }, { ...valid, player: { x: 99, z: 0, level: 0 } }, { ...valid, enemy: null }, { ...valid, story: null }, { ...valid, time: null }, { ...valid, survival: { ...valid.survival, health: 0 } }];
  for (const save of invalid) {
    h.run('title();checkpoint=null;');
    h.storage.set(h.run('SAVE_KEY'), JSON.stringify(save));
    assert.equal(h.run('validSave(read(SAVE_KEY,null))'), false);
    h.click('continue');
    assert.equal(h.run('panelKind'), 'intro');
    assert.equal(h.run('started'), false);
    h.click('begin'); assert.ok(h.run('started&&mode==="play"&&!flags.seen'));
  }
  h.run('title();checkpoint=null;'); h.storage.set(h.run('SAVE_KEY'), '{broken json');
  h.click('continue'); assert.equal(h.run('panelKind'), 'intro');
});

test('readable dialogue can hold the entire game, advance manually, and resume without retained movement', async () => {
  const h=await harness();h.fresh();h.advance(.1);
  assert.equal(h.nodes.get('subtitle-speaker').textContent,'修司');
  assert.equal(h.nodes.get('subtitle-channel').textContent,'対面');
  assert.match(h.nodes.get('subtitle-portrait').src,/shuji-v4/);
  assert.ok(h.run('speechTime>=6'));
  h.press('KeyZ');h.press('KeyT');
  const before=h.state('({player,time,enemy,survival,speechTime})');
  h.press('KeyW');h.advance(3);h.release('KeyW');
  assert.deepEqual(h.state('({player,time,enemy,survival,speechTime})'),before);
  assert.equal(h.run('autoWalk'),false);
  h.press('Enter');assert.equal(h.nodes.get('subtitle-speaker').textContent,'私');
  assert.equal(h.run('dialoguePaused'),true);
  h.click('journal-dialogue');h.click('close-panel');h.advance(1);
  assert.equal(h.run('time'),before.time,'journal returns to the reading hold');
  h.press('KeyT');h.advance(.2);
  assert.equal(h.run('dialoguePaused'),false);assert.ok(h.run('time')>before.time);
  assert.deepEqual(h.state('player'),before.player);
});

test('radio tuning requires a stable signal, pauses danger, and silences its loop when closed or locked',async()=>{
  const h=await harness();h.fresh();h.encounter();h.descend();h.safeEnemy();
  h.use('radio');assert.equal(h.run('radioActive'),true);
  const before=h.state('({time,enemy,survival})');h.advance(2);
  assert.equal(h.run('flags.radioTuned'),false);assert.equal(h.actions.get('radio-lock').disabled,true);
  assert.equal(h.calls.audio.radioTuning.active,true);
  const dial=h.nodes.get('radio-dial');dial.value='72';h.doc.emit('input',{target:dial});h.advance(.6);
  assert.equal(h.actions.get('radio-lock').disabled,true);
  dial.value='10';h.doc.emit('input',{target:dial});assert.equal(h.run('mechanisms.stable'),0);
  dial.value='72';h.doc.emit('input',{target:dial});h.advance(1.3);
  assert.deepEqual(h.state('({time,enemy,survival})'),before);
  assert.equal(h.actions.get('radio-lock').disabled,false);h.click('radio-lock');
  assert.equal(h.run('flags.radioTuned'),true);assert.equal(h.run('radioActive'),false);
  assert.equal(h.calls.audio.radioTuning.active,false);assert.equal(h.run('mode'),'play');
  assert.equal(h.run('getObjective().id'),'glasses');
});

test('shutter stays operable from both sides and the bell cannot be retriggered while paused',async()=>{
  const h=await harness();h.fresh();h.encounter();h.safeEnemy();
  h.use('shutter');assert.equal(h.run('world.shutterClosed'),true);
  h.run('world.blocked=true');h.use('shutter');assert.equal(h.run('world.shutterClosed'),false);
  h.run('world.blocked=false');h.descend();h.use('bell');
  const noise=h.state('noiseEvent');assert.equal(noise.kind,'bell');assert.equal(noise.strength,65);
  h.use('bell');assert.equal(h.run('noiseEvent.id'),noise.id);
  h.click('pause');h.advance(30);h.click('close-panel');h.use('bell');
  assert.equal(h.run('noiseEvent.id'),noise.id,'paused time cannot expire the real-world bell cooldown');
  h.advance(25.1);h.use('bell');assert.ok(h.run('noiseEvent.id')>noise.id);
});

test('v3 checkpoints migrate without resetting a later story or requiring an already-passed radio scene',async()=>{
  const h=await harness();h.fresh();h.encounter();h.equip();h.safeEnemy();
  const saved=h.state('serialize()');saved.v=3;delete saved.flags.radioTuned;delete saved.mechanisms;
  h.click('title');h.run('checkpoint=null');h.storage.delete(h.run('SAVE_KEY'));
  h.storage.set(h.run('LEGACY_SAVE_KEY'),JSON.stringify(saved));h.click('continue');
  assert.equal(h.run('flags.radioTuned'),true);assert.equal(h.run('story.stage'),saved.story.stage);
  assert.equal(h.run('companionState'),'away');assert.equal(h.run('serialize().v'),4);
  assert.equal(h.run('story.events.includes("radioTuned")'),saved.story.events.includes('radioTuned'));
});

test('a superseded guide voice request cannot overwrite the current playback status',async()=>{
  const h=await harness();h.fresh();h.click('search-help');
  h.run('globalThis.voiceRequests=[];sound.playGuideVoice=()=>new Promise(resolve=>voiceRequests.push(resolve));');
  const first=h.run('playSearchVoice()'),second=h.run('playSearchVoice()');
  h.run('voiceRequests[1]("playing")');await second;
  assert.match(h.nodes.get('guide-voice-status').textContent,/再生中/);
  h.run('voiceRequests[0]("cancelled")');await first;
  assert.match(h.nodes.get('guide-voice-status').textContent,/再生中/);
  const third=h.run('playSearchVoice()');h.click('close-panel');
  h.run('voiceRequests[2]("playing")');await third;
  assert.equal(h.run('mode'),'play');
});

test('restoring an older checkpoint resets idle and discovery hints for the same objective',async()=>{
  const h=await harness();h.fresh();
  h.run('globalThis.guideSave=serialize();guideSave.time=10;searchGuidance.update(getObjective(),{level:1,distance:1,blocked:false,targetId:"telescope"},100);restore(guideSave);');
  assert.equal(h.run('searchGuidance.update(getObjective(),{level:1,distance:12,blocked:false},10).hint'),'');
  assert.ok(h.run('searchGuidance.update(getObjective(),{level:1,distance:12,blocked:false},30).hint'));
  assert.equal(h.run('searchGuidance.update(getObjective(),{level:1,distance:1,blocked:false,targetId:"telescope"},31).cue'),true);
});
