import test from 'node:test';
import assert from 'node:assert/strict';
import { Soundscape, audioSpatial } from '../dist/audio.js';

class Param {
  constructor(value = 0) { this.value = value; this.events = []; }
  setValueAtTime(v, t) { this.value = v; this.events.push(['set', v, t]); }
  linearRampToValueAtTime(v, t) { this.events.push(['linear', v, t]); }
  exponentialRampToValueAtTime(v, t) { this.events.push(['exponential', v, t]); }
  setTargetAtTime(v, t, s) { this.value = v; this.events.push(['target', v, t, s]); }
  setValueCurveAtTime(v, t, d) { this.events.push(['curve', [...v], t, d]); }
  cancelAndHoldAtTime() {} cancelScheduledValues() {}
}
class AudioNode {
  constructor(kind) {
    this.kind = kind; this.connections = []; this.disconnected = false;
    for (const p of ['gain', 'frequency', 'Q', 'pan', 'threshold', 'knee', 'ratio', 'attack', 'release']) this[p] = new Param();
  }
  connect(node) { this.connections.push(node); }
  disconnect() { this.disconnected = true; }
  start(...args) { this.started = args; }
  stop(...args) { this.stopped = args; }
}
class Context {
  constructor() { this.currentTime = 0; this.sampleRate = 11025; this.state = 'running'; this.nodes = []; this.destination = new AudioNode('destination'); }
  node(kind) { const n = new AudioNode(kind); this.nodes.push(n); return n; }
  createGain() { return this.node('gain'); }
  createDynamicsCompressor() { return this.node('compressor'); }
  createBiquadFilter() { return this.node('filter'); }
  createBufferSource() { return this.node('buffer'); }
  createOscillator() { return this.node('oscillator'); }
  createStereoPanner() { return this.node('panner'); }
  createBuffer(_channels, length) { const data = new Float32Array(length); return { getChannelData: () => data }; }
  close() { this.state = 'closed'; return Promise.resolve(); }
}
function create() { const s = new Soundscape(); s.context = new Context(); s._buildGraph(); s._ready = true; return s; }

test('world directions rotate with the camera; floors and walls attenuate instead of faking stereo', () => {
  const listener = { x: 0, z: 0, level: 0, yaw: 0 }, right = { x: 6, z: 0, level: 0 };
  assert.ok(audioSpatial(listener, right).pan > .85);
  assert.ok(audioSpatial({ ...listener, yaw: Math.PI }, right).pan < -.85);
  assert.ok(Math.abs(audioSpatial({ ...listener, yaw: Math.PI / 2 }, right).pan) < .001);
  const open = audioSpatial(listener, right), wall = audioSpatial(listener, right, { occluded: true });
  assert.ok(wall.gain < open.gain * .4); assert.ok(wall.cutoff < open.cutoff / 4);
  assert.ok(audioSpatial(listener, { ...right, level: 1 }).gain < open.gain);
  assert.equal(audioSpatial(listener, { x: 100, z: 0 }).gain, 0);
});

test('positioned cues create real panning/occlusion nodes and never contaminate later player sounds', () => {
  const s = create();
  s.update({ listener: { x: 0, z: 0, level: 0, yaw: 0 }, monster: { x: 3, z: -1, level: 0 }, occluded: true });
  const before = s.context.nodes.length; s.cue('windup');
  const nodes = s.context.nodes.slice(before);
  assert.ok(nodes.some(n => n.kind === 'panner' && n.pan.value > .8));
  assert.ok(nodes.some(n => n.kind === 'filter' && n.frequency.value === 460));
  assert.equal(s._cueSpatial, null);
  const after = s.context.nodes.length; s.cue('hit');
  assert.ok(!s.context.nodes.slice(after).some(n => n.kind === 'panner'), 'player hit remains on the player, not at the monster');
  s.dispose();
});

test('the enemy plants feet only after actual travel, and walking materials sound different', () => {
  const s = create(), calls = [];
  s._noise = p => calls.push(['noise', p]); s._tone = p => calls.push(['tone', p]);
  const base = { listener: { x: 0, z: 0, level: 0, yaw: 0 }, monster: { x: 2, z: -2, level: 0 }, monsterDistance: 3,
    enemyMode: 'watch', enemySpeed: 2, time: 0 };
  s._nextCreatureBreath = s._nextSong = 100;
  for (let i = 0; i < 20; i++) { s.context.currentTime = i * .1; s.update({ ...base, time: i * .1 }); }
  assert.equal(calls.length, 0, 'turning and watching cannot invent foot plants');
  for (let i = 20; i < 32; i++) { s.context.currentTime = i * .1; s.update({ ...base, enemyMode: 'stalk', time: i * .1 }); }
  assert.ok(calls.filter(c => c[1].spatial).length >= 4, 'moving enemy emits position-aware alternating foot plants');
  calls.length = 0; s._footstep('stairs', false, 1); const stairs = JSON.stringify(calls);
  calls.length = 0; s._footstep('leaves', false, 1); assert.notEqual(JSON.stringify(calls), stairs);
  s.dispose();
});

test('tuning makes the actual static quieter and ends its continuous signal on close', () => {
  const s = create(); s.setRadioTuning({ active: true, signal: .05, staticLevel: 1 });
  const noisy = s._radioGain.gain.value, whistle = s._radioToneGain.gain.value;
  s.context.currentTime = .2; s.setRadioTuning({ active: true, signal: .98, staticLevel: 1 });
  assert.ok(s._radioGain.gain.value < noisy * .2); assert.ok(s._radioToneGain.gain.value < whistle * .1);
  s.setRadioTuning({ active: false }); assert.equal(s._radioGain.gain.value, 0); assert.equal(s._radioToneGain.gain.value, 0);
  const nodes = s.context.nodes; s.dispose(); assert.ok(nodes.every(n => n.disconnected || ['gain', 'compressor'].includes(n.kind)));
});

test('one paused update silences every continuous layer and creates no new footsteps or breaths', () => {
  const s = create();
  s.context.currentTime = 1;
  s.update({ time: 1, danger: 1, pursuit: true, radioTuning: { active: true, signal: .1 } });
  assert.ok(s._uneaseA.gain.value > 0); assert.ok(s._needleGain.gain.value > 0); assert.ok(s._radioGain.gain.value > 0);
  const calls = []; s._tone = p => calls.push(p); s._noise = p => calls.push(p);
  s.context.currentTime = 1.01;
  s.update({ time: 1, paused: true, danger: 1, inside: true, moving: true, running: true, stamina: .1,
    monsterDistance: 2, enemyMode: 'hunt', enemySpeed: 3, radioTuning: { active: true, signal: .1 } });
  for (const node of [s._windGain, s._airGain, s._uneaseA, s._uneaseB, s._needleGain, s._radioGain, s._radioToneGain])
    assert.equal(node.gain.value, 0, 'each continuous gain has a zero fade target');
  assert.equal(s._radio.active, false); assert.equal(calls.length, 0);
  s.context.currentTime = 1.02;
  s.update({ time: 1.02, paused: false, inside: false, danger: .5 });
  assert.ok(s._windGain.gain.value > 0); assert.ok(s._uneaseA.gain.value > 0, 'resuming restores the mix without waiting for the old rate limit');
  s.dispose();
});

test('new physical cues use the bounded mixer and disconnect their completed voice chains', () => {
  const s = create();
  for (const name of ['shutterOpen', 'shutterClose', 'radioTune', 'radioLock', 'bellNeeded']) {
    const before = s.context.nodes.length; s.cue(name, { x: -3, z: -2, level: 0 });
    assert.ok(s.context.nodes.length > before, `${name} creates sound`);
    for (const voice of [...s._voices]) voice.source.onended();
    assert.equal(s._voices.size, 0);
  }
  for (let i = 0; i < 50; i++) s._tone({ frequency: 70, duration: .1, gain: 3 });
  assert.equal(s._voices.size, 28, 'peak workload is capped');
  for (const voice of s._voices) for (const node of voice.chain)
    for (const e of node.gain.events) if (e[0] === 'linear') assert.ok(e[1] <= .12, 'one voice cannot overdrive the envelope');
  s.dispose(); assert.equal(s._voices.size, 0);
});

test('search cues distinguish materials, stay bounded and honor mute and cooldown',()=>{
  const s=create(),calls=[];
  s._noise=p=>calls.push(['noise',p]);s._tone=p=>calls.push(['tone',p]);
  const signatures=[];
  for(const name of ['objective','found','keyPickup','bottlePickup','crankPickup']){
    calls.length=0;s.cue(name);assert.ok(calls.length,name);signatures.push(JSON.stringify(calls));
    assert.ok(calls.every(([,p])=>p.gain<=.04),'quiet confirmation must not drown footsteps');
    const count=calls.length;s.cue(name);assert.equal(calls.length,count,'no duplicate within cooldown');
  }
  assert.equal(new Set(signatures).size,5);
  s.setMuted(true);calls.length=0;s.context.currentTime=100;s.cue('found');assert.equal(calls.length,0);s.dispose();
});

test('recorded guidance uses the master mixer, caches decoding and stops when closed or muted',async t=>{
  const prior=globalThis.fetch;t.after(()=>globalThis.fetch=prior);
  let requests=0;globalThis.fetch=async()=>{requests++;return {ok:true,arrayBuffer:async()=>new ArrayBuffer(8)};};
  const s=create();s.context.decodeAudioData=async()=>({duration:3});let ended=0;
  assert.equal(await s.playGuideVoice('guide.wav',()=>ended++),'playing');
  const first=s._guideVoice;assert.equal(first.nodes.at(-1).connections[0],s._compressor);
  s.stopGuideVoice();assert.equal(s.guidePlaying,false);assert.ok(first.nodes.every(n=>n.disconnected));assert.equal(ended,0);
  assert.equal(await s.playGuideVoice('guide.wav',()=>ended++),'playing');assert.equal(requests,1);
  s._guideVoice.source.onended();assert.equal(ended,1);assert.equal(s.guidePlaying,false);
  await s.playGuideVoice('guide.wav');s.setMuted(true);assert.equal(s.guidePlaying,false);
  assert.equal(await s.playGuideVoice('missing.wav'),'muted');assert.equal(requests,1);s.dispose();
});

test('a late voice download cannot restart sound after leaving the help screen',async t=>{
  const prior=globalThis.fetch;t.after(()=>globalThis.fetch=prior);
  let release;globalThis.fetch=()=>new Promise(resolve=>release=resolve);
  const s=create();s.context.decodeAudioData=async()=>({duration:3});
  const pending=s.playGuideVoice('slow.wav');await new Promise(resolve=>setImmediate(resolve));
  s.stopGuideVoice();release({ok:true,arrayBuffer:async()=>new ArrayBuffer(8)});
  assert.equal(await pending,'cancelled');assert.equal(s.guidePlaying,false);s.dispose();
});
