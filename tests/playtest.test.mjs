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
import * as presenceRules from '../dist/presence.js';
import * as evidenceRules from '../dist/evidence.js';
import { MountainWorld } from '../dist/world.js';

// v4.0.1 playtest regressions. The shipped controller (main.js) runs against the
// real MountainWorld: actual walls, stairs, shutter, A* and the real enemy AI.
// Only the browser, audio and GPU boundaries are replaced.
const noop = () => {};
function rasterCanvas() { const context = new Proxy({ createLinearGradient: () => ({ addColorStop: noop }), createRadialGradient: () => ({ addColorStop: noop }), createPattern: () => ({}) }, { get: (o, k) => k in o ? o[k] : noop }); return { width: 512, height: 160, style: {}, setAttribute: noop, getContext: () => context }; }
Object.assign(globalThis, { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, addEventListener: noop, document: { createElement: rasterCanvas } });

const source = fs.readFileSync(new URL('../dist/main.js', import.meta.url), 'utf8').replace(/^import[^\n]*\n/gm, '').replace(/^boot\(\);\s*$/m, '');
const markup = fs.readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
const { LANDMARKS, STAIRS, BALCONY } = layout;
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

async function harness() {
  const nodes = new Map(), actions = new Map(), raf = new Map(), audioCues=[];
  let now = 0, nextFrame = 0, run, doc;
  class Element {
    constructor(tag = 'div') {
      this.tagName = tag.toUpperCase(); this.hidden = false; this.disabled = false; this.dataset = {}; this.style = {}; this.textContent = ''; this.value = ''; this.listeners = new Map();
      const classes = new Set();
      this.classList = { add: (...n) => n.forEach(x => classes.add(x)), remove: (...n) => n.forEach(x => classes.delete(x)), contains: n => classes.has(n), toggle(n, f) { const on = f ?? !classes.has(n); on ? classes.add(n) : classes.delete(n); return on; } };
    }
    set innerHTML(html) { this.html = html; parse(html); }
    get innerHTML() { return this.html || ''; }
    addEventListener(type, cb) { const l = this.listeners.get(type) || []; l.push(cb); this.listeners.set(type, l); }
    emit(type, event = {}) { for (const fn of this.listeners.get(type) || []) fn({ target: this, preventDefault() {}, ...event }); }
    matches(selector) { if (selector === '[data-radio-dial]') return this.id === 'radio-dial'; return selector.split(',').some(t => t.trim().toUpperCase() === this.tagName); }
    closest(selector) { return selector === '[data-action]' && this.dataset.action ? this : null; }
    querySelector(selector) { return query(selector); }
    querySelectorAll() { return []; }
    focus() {} setPointerCapture() {} setAttribute(k, v) { this[k] = v; } append() {}
    getBoundingClientRect() { return { left: 0, top: 0, width: 120, height: 120 }; }
  }
  function parse(html) {
    for (const [, tag, attrs] of html.matchAll(/<([a-z][\w-]*)\b([^>]*)>/gi)) {
      const id = attrs.match(/\bid="([^"]+)"/)?.[1], action = attrs.match(/\bdata-action="([^"]+)"/)?.[1];
      if (!id && !action) continue;
      const node = id && nodes.get(id) || new Element(tag);
      node.hidden = /(?:^|\s)hidden(?:\s|$)/.test(attrs); node.disabled = /(?:^|\s)disabled(?:\s|$)/.test(attrs);
      if (id) { node.id = id; nodes.set(id, node); }
      if (action) { node.dataset.action = action; actions.set(action, node); }
    }
  }
  function query(selector) {
    if (selector.startsWith('#')) return nodes.get(selector.slice(1)) || null;
    const action = selector.match(/\[data-action="([^"]+)"\]/)?.[1];
    if (action) return actions.get(action) || null;
    return null;
  }
  doc = new Element('document'); doc.body = new Element('body'); doc.hidden = false; doc.pointerLockElement = null;
  doc.getElementById = id => nodes.get(id) || null; doc.querySelector = query; doc.exitPointerLock = noop; doc.createElement = tag => new Element(tag);
  parse(markup);
  class Soundscape { setVolume() {} setMuted() {} start() { return Promise.resolve(true); } cue(name,position) { audioCues.push({name,time:run?.('time')??0,position:position?{x:position.x,z:position.z,level:position.level}:null}); } update() {} }
  class TapeEffects { constructor() { this.canvas = new Element('canvas'); } trigger() {} clear() {} update() {} }
  const renderer = { shadowMap: {}, setPixelRatio: noop, setSize: noop, render: noop, domElement: new Element('canvas') };
  const textureLoader = { load(_url, onLoad) { const t = new THREE.Texture({ width: 64, height: 64 }); queueMicrotask(() => onLoad?.(t)); return t; } };
  class World extends MountainWorld {
    constructor(_container, options) { super({ append: noop }, { ...options, renderer, textureLoader }); this.canvas.requestPointerLock = () => Promise.resolve(); }
  }
  const storage = new Map();
  const context = vm.createContext({
    THREE, ...layout, ...survivalRules, ...narrative, ...enemyRules, ...storyRules, ...dialogueRules, ...gimmickRules, ...guidanceRules, ...presenceRules, ...evidenceRules, MountainWorld: World, Soundscape, TapeEffects,
    document: doc, localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) },
    matchMedia: () => ({ matches: false }), performance: { now: () => now }, devicePixelRatio: 1,
    requestAnimationFrame: cb => { const id = ++nextFrame; raf.set(id, cb); return id; }, cancelAnimationFrame: id => raf.delete(id), addEventListener: noop, console,
  });
  run = code => vm.runInContext(code, context);
  run(source);
  const frame = (ms = 50) => { now += ms; const pending = [...raf.values()]; raf.clear(); for (const cb of pending) cb(now); };
  const promise = run('boot()'); frame(); frame(); await promise;
  const click = name => doc.emit('click', { target: actions.get(name) || Object.assign(new Element('button'), { dataset: { action: name } }) });
  const press = code => doc.emit('keydown', { code, repeat: false, target: doc.body });
  const release = code => doc.emit('keyup', { code, target: doc.body });
  const state = expr => JSON.parse(JSON.stringify(run(expr)));
  function encounter() {
    click('start'); click('begin');
    run(`Object.assign(player,{x:${LANDMARKS.telescope.x},z:${LANDMARKS.telescope.z + .45},level:1});yaw=0;pitch=0;`);
    assert.equal(run('findTarget()?.id'), 'telescope'); press('KeyE'); release('KeyE');
    for (let t = 0; t < narrative.TELESCOPE_SCENES.reduce((n, s) => n + s.duration, 0) + .3; t += .05) frame();
    assert.equal(run('mode'), 'play'); assert.equal(run('flags.seen'), true);
  }
  // Walk by holding W and steering toward the HUD's route point, like a player
  // following the bearing. Returns a per-frame trace.
  function walkUntil(done, seconds, { onFrame } = {}) {
    press('KeyW'); const trace = [];
    for (let t = 0; t < seconds; t += .05) {
      if (run('mode') !== 'play') break;
      run('(()=>{const g=currentGuide();if(g)yaw=yawToward(player,g.point);})()');
      frame(); const s = state('({player,monster:{...monster},enemyMode:enemy.mode,health:survival.health,sanity:survival.sanity,dead:survival.dead,time,phase:survival.phase})');
      trace.push(s); onFrame?.(s);
      if (run(done)) break;
    }
    release('KeyW'); return trace;
  }
  return { run, nodes, frame, click, press, release, state, encounter, walkUntil, audioCues, advance: s => { for (let t = 0; t < s - 1e-8; t += .05) frame(); } };
}

const insideCabin = p => Math.abs(p.x) < 6.3 && p.z > 18.6 && p.z < 29.4;

test('after the telescope a player following the route reaches the 1F radio unhurt; the creature stays outside', async () => {
  const h = await harness(); h.encounter();
  assert.equal(h.run('world.stairGuide.group.visible'), true, 'the stair entrance is lit after the telescope');
  const trace = h.walkUntil('flags.downstairs&&Math.hypot(player.x-LANDMARKS.radio.x,player.z-LANDMARKS.radio.z)<1.6', 60);
  const last = trace.at(-1);
  assert.ok(h.run('flags.downstairs'), `reached the ground floor; last=${JSON.stringify(last.player)}`);
  assert.ok(flat(last.player, LANDMARKS.radio) < 1.6, `reached the radio desk; last=${JSON.stringify(last)} mode=${h.run("mode")} panel=${h.run("panelKind")}`);
  assert.equal(h.run('world.stairGuide.group.visible'), false, 'the guide turns off downstairs');
  assert.ok(trace.every(s => !s.dead && s.health === 100), 'no damage on the way down');
  assert.ok(trace.every(s => !insideCabin(s.monster) && !h.run(`world.inStairs(${JSON.stringify(s.monster)})`)), 'the creature never enters the cabin or the stair corridor');
  const nearest = Math.min(...trace.map(s => flat(s.monster, { x: 0, z: 24 })));
  assert.ok(nearest > 13, `creature kept outside the leash (${nearest.toFixed(1)}m)`);
  assert.ok(trace.at(-1).time - trace[0].time < 30, 'the walk is short');
  // Tuning the radio ends the leash; a creature waiting at the cabin withdraws out of sight.
  h.run(`Object.assign(player,{x:${LANDMARKS.radio.x},z:${LANDMARKS.radio.z + .6},level:0});yaw=0;`);
  assert.equal(h.run('findTarget()?.id'), 'radio'); h.press('KeyE'); h.release('KeyE');
  h.run('setRadioDial(RADIO.target)'); h.advance(1.4); h.click('radio-lock');
  assert.equal(h.run('flags.radioTuned'), true);
  assert.equal(h.run('earlyLeash()'), null);
  assert.ok(h.run('actorDistance(player,monster)') >= 24 || h.run('world.isBlocked(player,monster)'));
});

test('the creature approaches visibly from outside and parks at the ring; lingering too long lets it in', async () => {
  const h = await harness(); h.encounter();
  // Stand inside the upper room, facing away from the window (careless but not staring).
  h.run('Object.assign(player,{x:3,z:25,level:1});yaw=Math.PI;');
  let closest = 99;
  for (let t = 0; t < 80; t += .05) { h.frame(); const m = h.state('monster'); closest = Math.min(closest, flat(m, { x: 0, z: 24 })); assert.ok(!insideCabin(m), 'outside during the leash'); }
  assert.ok(closest < 15.5, `it came all the way to the cabin's ring (${closest.toFixed(1)}m)`);
  assert.equal(h.run('survival.health'), 100);
  // After the balcony window of 90 s, staying upstairs is lingering badly.
  let inside = false;
  for (let t = 0; t < 70 && h.run('mode') === 'play'; t += .05) { h.frame(); if (insideCabin(h.state('monster'))) inside = true; }
  assert.equal(h.run('earlyLeash()'), null);
  assert.ok(inside, 'the creature enters the cabin once the player lingers');
});

test('staring at the creature from the balcony is still fatal, but takes long enough to learn', async () => {
  const h = await harness(); h.encounter();
  h.run(`Object.assign(player,{x:0,z:18.3,level:1});`);
  let firstDrop = null, death = null;
  for (let t = 0; t < 60 && h.run('mode') === 'play'; t += .05) {
    h.run('(()=>{const e=world.eyePosition();yaw=Math.atan2(-(e.x-player.x),-(e.z-player.z));pitch=Math.atan2(e.y-(world.actorHeight(player)+1.65),Math.hypot(e.x-player.x,e.z-player.z));})()');
    h.frame(); const s = h.state('({sanity:survival.sanity,time,mode})');
    if (firstDrop === null && s.sanity < 82.9) firstDrop = s.time;
    if (s.mode !== 'play') death = s.time;
  }
  assert.ok(firstDrop !== null, 'eye contact drains');
  assert.equal(h.run('flags.deathReason'), 'gaze');
  assert.ok(death - firstDrop > 7.5, `gaze death after ${(death - firstDrop).toFixed(1)} s of staring`);
});

test('the scythe is raised visibly for over 0.9 s before damage, and never starts from behind', async () => {
  const h = await harness(); h.encounter(); h.run('flags.leashUntil=0;');
  h.run('Object.assign(player,{x:2,z:24,level:1});yaw=Math.PI/2;'); // facing -x
  // Behind the camera, in range and aligned: no strike may begin.
  h.run('Object.assign(enemy.position,{x:3.6,z:24,level:1});monster=enemy.position;enemy.heading=-Math.PI/2;survival.cooldown=0;');
  for (let t = 0; t < 4; t += .05) { h.run('enemy.position.x=3.6;enemy.position.z=24;enemy.heading=-Math.PI/2;'); h.frame(); assert.notEqual(h.run('survival.phase'), 'windup'); }
  assert.equal(h.run('survival.health'), 100);
  assert.match(h.nodes.get('gaze-status').textContent, /背後/);
  // In front: the warning appears with the windup and stays until the swing.
  h.run('enemy.position.x=.4;enemy.heading=Math.PI/2;');
  let warned = null, hit = null;
  for (let t = 0; t < 4 && hit === null; t += .05) {
    h.run('enemy.position.x=.4;enemy.position.z=24;'); h.frame();
    const s = h.state('({time,health:survival.health,warning:!document.getElementById("attack-warning").hidden})');
    if (warned === null && s.warning) warned = s.time;
    if (hit === null && s.health < 100) hit = s.time;
    if (hit === null && warned !== null) assert.equal(s.warning, true);
  }
  assert.ok(warned !== null && hit !== null);
  assert.ok(hit - warned >= .9, `warning ${(hit - warned).toFixed(2)} s before the hit`);
  assert.equal(h.run('survival.health'), 100 - survivalRules.RULES.attackDamage);
});

test('retrying a checkpoint saved against a wall beside the creature restores a safe, open, route-facing start', async () => {
  const h = await harness(); h.encounter();
  const save = h.state('serialize()');
  save.player = { x: 5.62, z: 25.2, level: 1 }; save.yaw = -Math.PI / 2; // face pressed to the east wall
  save.enemy.position = { x: 3.2, z: 25.2, level: 1 }; save.enemy.mode = 'hunt'; save.enemy.lastKnown = { ...save.player };
  h.run(`restore(${JSON.stringify(save)})`);
  const p = h.state('player'), m = h.state('monster');
  assert.ok(h.run('world.isFreeAt(player,.8)'), 'clear of walls');
  assert.equal(h.run('world.inStairs(player)'), false);
  assert.ok(h.run('world.isSegmentFree(player,{x:player.x-Math.sin(yaw)*1.4,z:player.z-Math.cos(yaw)*1.4,level:player.level},.3)'), 'facing open space, not a wall');
  const g = h.run('routeGuide({...player},guideTarget()).point'); const want = Math.atan2(-(g.x - p.x), -(g.z - p.z));
  assert.ok(Math.cos(h.run('yaw') - want) > .9, 'facing along the route to the stairs');
  assert.ok(h.run('actorDistance(player,monster)') >= 24, `creature pushed away (${flat(p, m).toFixed(1)}m)`);
  assert.ok(h.run('world.isBlocked(player,monster)'), 'and out of sight');
  assert.equal(h.run('enemy.lastKnown'), null, 'it forgot where the player was');
  assert.equal(h.run('survival.grace'), 5);
  h.advance(4.5);
  assert.equal(h.run('survival.health'), 100); assert.ok(h.run('survival.sanity') >= save.survival.sanity);
});

test('closing the shutter from the balcony leaves the player inside the room', async () => {
  const h = await harness(); h.encounter();
  h.run(`Object.assign(player,{x:${LANDMARKS.shutter.x},z:18.5,level:1});yaw=Math.PI;`);
  assert.equal(h.run('findTarget()?.id'), 'shutter');
  h.frame(); assert.equal(h.nodes.get('interaction-text').textContent, '部屋に入り、雨戸を閉める');
  h.press('KeyE'); h.release('KeyE');
  assert.equal(h.run('flags.shutterClosed'), true);
  const p = h.state('player');
  assert.ok(p.z > BALCONY.maxZ + .3 && h.run('world.isFreeAt(player)'), `inside at z=${p.z}`);
  assert.ok(h.run('world.isBlocked({x:0,z:18,level:1},player)'), 'the closed shutter is between the balcony and the player');
  const route = h.run('world.findPath(player,STAIRS.top)'); assert.ok(route.length, 'the stairs remain reachable');
});

test('the HUD bearing follows the walkable route instead of a line through walls', async () => {
  const h = await harness(); h.encounter();
  h.run('Object.assign(player,{x:0,z:18.3,level:1});yaw=0;'); h.frame();
  const g = h.state('currentGuide()');
  assert.ok(h.run(`world.isSegmentFree(player,${JSON.stringify(g.point)},.3)`), 'the bearing points at a directly walkable route point');
  assert.ok(g.length >= flat({ x: 0, z: 18.3 }, STAIRS.top) + flat(STAIRS.top, STAIRS.bottom) - .01, 'the length is the walking route down the stairs');
  assert.match(h.nodes.get('compass-label').textContent, new RegExp(`${Math.round(g.length)}m$`));
});

// v4.0.2 playtest-2 regressions, against the real controller and world.
const calm = 'speechQueue=[];activeSpeech=null;speechTime=0;flags.leashUntil=0;flags.radioTuned=true;relocateEnemy(enemy,{x:-30,z:-30,level:0});monster=enemy.position;survival.grace=999;survival.cooldown=999;';

test('place lines from the bridge never play at the phone; the story plan still does and the log keeps them', async () => {
  const h = await harness(); h.encounter(); h.advance(.5);
  h.run(calm + 'Object.assign(player,{x:.8,z:-11.5,level:0});');
  h.run(`talk('bridge');say('私','ラベルの字が、雨で滲んでいる。');talk('enemyListen');talk('enemySearch');talk('trail');talk('enemyTurn');`);
  assert.ok(h.run(`speechQueue.filter(l=>l.kind!=='critical').length`) <= 2, 'at most two place/ambient lines wait');
  for (let i = 0; i < 4; i++) { h.frame(); if (h.run(`activeSpeech?.beat==='bridge'`)) break; }
  assert.equal(h.run('activeSpeech?.beat'), 'bridge', 'the place line plays where it was triggered');
  // Walk to the dropped phone: about 40 s later and 25 m away.
  h.run('time+=40;Object.assign(player,{x:18.5,z:-19.5,level:0});');
  const shown = [], current = h.run('activeSpeech?.text||""');
  for (let t = 0; t < 40; t += .05) { h.frame(); const a = h.run('activeSpeech?.text||""'); if (a && a !== current && shown.at(-1) !== a) shown.push(a); }
  assert.ok(!shown.some(t => /橋まで来た|滲んで|向こうの音も止まった|調べてる/.test(t)), `stale lines at the phone: ${shown.join(' / ')}`);
  for (const line of narrative.DIALOGUE.trail) assert.ok(shown.includes(line.text) || h.run(`conversation.some(l=>l.text===${JSON.stringify(line.text)})`), 'the uncle\'s plan is never lost');
  assert.ok(h.run(`conversation.some(l=>/滲んで/.test(l.text))`), 'a dropped place line stays in the log');
  assert.ok(!h.run(`conversation.some(l=>/調べてる/.test(l.text))`), 'stale reactions are not logged');
});

test('the scythe warning says where it is; it is not repeated as a toast or a subtitle', async () => {
  const h = await harness(); h.encounter(); h.advance(.5);
  h.run(calm + 'flags.firstAttack=false;survival.cooldown=0;survival.grace=0;Object.assign(player,{x:0,z:8,level:0});yaw=0;relocateEnemy(enemy,{x:-1.6,z:8,level:0,heading:Math.PI/2});monster=enemy.position;enemy.mode="hunt";$("toast").hidden=true;');
  let phase = '';
  for (let t = 0; t < 4 && phase !== 'windup'; t += .05) { h.run('enemy.position.x=-1.6;enemy.position.z=8;'); h.frame(); phase = h.run('survival.phase'); }
  assert.equal(phase, 'windup');
  const warning = h.nodes.get('attack-warning'), edge = h.nodes.get('threat-edge');
  assert.equal(warning.hidden, false); assert.equal(edge.hidden, false);
  assert.equal(h.nodes.get('attack-warning-text').textContent, '左から — 右へ離れる'); assert.equal(edge.dataset.side, 'left');
  assert.ok(h.nodes.get('toast').hidden || !/鎌/.test(h.nodes.get('toast').textContent), 'no duplicate toast');
  assert.ok(h.nodes.get('subtitle').hidden || !/鎌/.test(h.nodes.get('subtitle-text').textContent), 'no duplicate subtitle');
  // Turning during the windup: the creature is now behind.
  h.run('yaw=-Math.PI/2;'); h.frame();
  assert.equal(h.nodes.get('attack-warning-text').textContent, '背後 — 前へ走る'); assert.equal(edge.dataset.side, 'behind');
  h.advance(1.2);
  assert.equal(warning.hidden, true); assert.equal(edge.hidden, true);
  assert.equal(h.run('flags.firstAttack'), true, 'the first-attack lines come after the swing');
});

test('inside the shed the creature keeps off the door for a while, warns, then comes in', async () => {
  const h = await harness(); h.encounter(); h.advance(.5);
  h.run(calm + 'survival.grace=0;survival.cooldown=0;Object.assign(player,{x:-19,z:-3.3,level:0});yaw=Math.PI;relocateEnemy(enemy,{x:-19,z:2.5,level:0,heading:Math.PI});monster=enemy.position;enemy.lastKnown={...player};enemy.mode="hunt";flags.hunt=true;');
  const door = layout.BUILDINGS.find(b => b.id === 'shed').entrance;
  let nearest = 99, warnedAt = null;
  for (let t = 0; t < 19; t += .05) {
    h.frame(); const m = h.state('monster'); if (t > 6) nearest = Math.min(nearest, flat(m, door));
    assert.equal(h.run('survival.health'), 100, 'no strike while the player is reading inside');
  }
  assert.ok(nearest > 5, `the doorway is left clear (${nearest.toFixed(1)} m)`);
  for (let t = 0; t < 3 && warnedAt === null; t += .05) { h.frame(); if (/出口は一つだけ/.test(h.nodes.get('toast').textContent)) warnedAt = h.run('shelter.inside'); }
  assert.ok(warnedAt !== null && warnedAt >= 20, 'a clear warning after about 20 s');
  let entered = false;
  for (let t = 0; t < 40 && h.run('mode') === 'play'; t += .05) { h.frame(); if (flat(h.state('monster'), door) < 2.5 || flat(h.state('monster'), h.state('player')) < 3) entered = true; }
  assert.ok(entered, 'staying on lets the creature in');
});

test('a pursuing creature reaches the closed shed door, knocks three times, opens it and walks through',async()=>{
  const h=await harness();h.encounter();h.advance(.5);
  h.run(calm+'Object.assign(player,{x:-19,z:-3.3,level:0});yaw=Math.PI;world.setDoor("shed-entry",false,{immediate:true});relocateEnemy(enemy,{x:-19,z:3,level:0,heading:Math.PI});monster=enemy.position;enemy.lastKnown={...player};enemy.searchOrigin={...player};enemy.mode="hunt";flags.hunt=true;shelter={id:"shed",inside:31,outside:0,warned:true,released:true};');
  const door=layout.BUILDINGS.find(b=>b.id==='shed').entrance;
  assert.equal(h.run('world.doors["shed-entry"].open'),false);
  assert.equal(h.run('world.isSegmentFree({x:-19,z:.2,level:0},{x:-19,z:-2,level:0},.3)'),false,'the original closed leaf physically obstructs the route');
  let pressureAt=null,openedAt=null,entered=false;
  const cueStart=h.audioCues.length;
  for(let t=0;t<24;t+=.05){
    h.frame();const m=h.state('monster'),open=h.run('world.doors["shed-entry"].open');
    if(pressureAt===null&&h.run('doorPressure!==null'))pressureAt=h.run('time');
    if(!open)assert.ok(m.z>door.z-.1,'the creature cannot pass through a closed leaf');
    if(open&&openedAt===null){openedAt=h.run('time');assert.equal(h.audioCues.slice(cueStart).filter(c=>c.name==='doorKnock').length,3,'three audible knocks precede opening');}
    if(open&&m.z<door.z-.65){entered=true;break;}
  }
  assert.ok(pressureAt!==null,'real AI reaches the blocking door');assert.ok(openedAt!==null,'controller pressure opens it');
  assert.ok(openedAt-pressureAt>=4.3,'the warning delay gives time to retreat');
  assert.ok(entered,'AI resumes its route through the physically opened passage');
  assert.equal(h.run('world.isSegmentFree({x:-19,z:.2,level:0},{x:-19,z:-2,level:0},.3)'),true,'animated opening moves its real colliders away');
});

test('after the telescope the prompt is gone; the phone ring is hinted once and marked on the map', async () => {
  const h = await harness(); h.encounter(); h.advance(.5);
  h.run(`Object.assign(player,{x:${LANDMARKS.telescope.x},z:${LANDMARKS.telescope.z + .45},level:1});yaw=0;pitch=0;`); h.frame();
  assert.notEqual(h.run('findTarget()?.id'), 'telescope');
  assert.ok(h.nodes.get('interaction').hidden || !/望遠鏡/.test(h.nodes.get('interaction-text').textContent));
  h.run(calm + 'story.stage=4;flags.phoneHint=false;lastPhone=-99;Object.assign(player,{x:16,z:-11,level:0});yaw=Math.PI;$("toast").hidden=true;');
  h.frame();
  assert.equal(h.run('flags.phoneHint'), true);
  assert.match(h.nodes.get('toast').textContent, /着信音がする（.+）— 地図に記した/);
  assert.equal(h.run('getObjective().id') === 'phone', false, 'the phone is not an objective');
  h.click('journal');
  assert.match(h.nodes.get('panel-body').innerHTML, /着信音？/);
});

test('the drag-to-look hint is shown at most twice per session', async () => {
  const h = await harness(); h.encounter(); h.advance(.5);
  h.run('world.canvas.requestPointerLock=()=>Promise.reject(new Error("no lock"));');
  let shown = 0;
  for (let i = 0; i < 6; i++) {
    h.run('time+=70;$("toast").hidden=true;$("toast").textContent="";lockPointer();'); await new Promise(r => setTimeout(r, 0));
    if (/ドラッグ/.test(h.nodes.get('toast').textContent)) shown++;
  }
  assert.equal(shown, 2);
});

test('a brief blur or pointer-lock blip no longer pauses; a real absence or Esc still does', async () => {
  const h = await harness(); h.encounter(); h.advance(.5);
  h.run(calm);
  const paused = () => h.run('mode') === 'panel' && h.run('panelKind') === 'pause';
  // An IME box / notification takes focus for a second, then gives it back.
  h.run('document.hasFocus=()=>false;onWindowBlur();'); h.advance(1.2); h.run('document.hasFocus=()=>true;onWindowFocus();'); h.advance(3);
  assert.equal(paused(), false, 'a one-second blur is ignored');
  // The pointer lock drops and is regained at once.
  h.run('document.pointerLockElement=null;onPointerLockChange();'); h.advance(.15); h.run('document.pointerLockElement=world.canvas;onPointerLockChange();'); h.advance(1);
  assert.equal(paused(), false, 'a pointer-lock blip is ignored');
  // Esc: the lock is released and stays released, the window keeps focus.
  h.run('document.pointerLockElement=null;onPointerLockChange();'); h.advance(.2);
  assert.equal(paused(), false); h.advance(.4);
  assert.equal(paused(), true, 'Esc still pauses');
  h.click('close-panel'); assert.equal(h.run('mode'), 'play');
  // Really switching to another window still pauses, after the grace period.
  h.run('document.pointerLockElement=world.canvas;document.hasFocus=()=>false;onWindowBlur();'); h.advance(2);
  assert.equal(paused(), false); h.advance(.7);
  assert.equal(paused(), true, 'a lasting blur pauses');
});
