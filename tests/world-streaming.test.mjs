import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import {MountainWorld} from '../dist/world.js';
import {SoftwareRenderer} from '../dist/software-renderer.js';
import {SPAWN,LANDMARKS,REVEAL_POINT} from '../dist/layout.js';
import {distantPresence} from '../dist/presence.js';
import {STREAMING_RULES,streamingViewpoints} from '../dist/streaming.js';

const noop=()=>{};
function canvas(){const context=new Proxy({createLinearGradient:()=>({addColorStop:noop}),createRadialGradient:()=>({addColorStop:noop}),createPattern:()=>({}),measureText:text=>({width:String(text).length*20})},{get:(o,k)=>k in o?o[k]:noop});return {width:512,height:160,style:{},setAttribute:noop,getContext:()=>context};}
Object.assign(globalThis,{innerWidth:1280,innerHeight:720,devicePixelRatio:1,addEventListener:noop,document:{createElement:canvas}});
const textureLoader={load(_url,onLoad){const t=new THREE.Texture({width:1024,height:1024});queueMicrotask(()=>onLoad?.(t));return t;}};
function createWorld(software=false){const renderer={isSoftware:software,shadowMap:{},setPixelRatio:noop,setSize:noop,render:noop,domElement:canvas()};return new MountainWorld({append:noop},{renderer,textureLoader});}
const world=createWorld();
const scopeOrigin={x:LANDMARKS.telescope.x,z:LANDMARKS.telescope.z+.5};
function updateAt(time,presence,scope=null){world.update({pos:SPAWN,yaw:SPAWN.yaw,pitch:0,time,monster:presence,enemyVisual:presence,active:true,scope,companionState:'away'});}
function terrainAt(point){return [...world.streaming.chunks.values()].filter(c=>c.id.startsWith('terrain:')&&point.x>=c.bounds.minX&&point.x<=c.bounds.maxX&&point.z>=c.bounds.minZ&&point.z<=c.bounds.maxZ);}

test('the shipped world keeps a minority of the complete terrain resident and reduces decorative buffers at spawn',t=>{
  const stats=world.streaming.stats(),terrain=[...world.streaming.chunks.values()].filter(c=>c.id.startsWith('terrain:'));
  assert.equal(stats.pendingChunks,0);assert.ok(stats.residentInstances<stats.totalInstances*.8,JSON.stringify(stats));
  assert.ok(terrain.filter(c=>c.object).length<terrain.length*.4,'unneeded distant terrain has no geometry');
  assert.ok(terrainAt(SPAWN).some(c=>c.object),'the floor directly under the player is loaded');
  assert.equal(world.forest.boughs.count,world.forest.trees.length*15);
  assert.ok(world.forest.boughs.meshes.every(mesh=>mesh.geometry.type==='PlaneGeometry'&&mesh.material.alphaTest>0));
  t.diagnostic(`Spawn visual allocation: ${stats.residentInstances}/${stats.totalInstances} decorative instances; ${terrain.filter(c=>c.object).length}/${terrain.length} terrain tiles; ${stats.residentChunks} chunks.`);
});

test('crossing the actual map unloads visual geometry without changing navigation/collision data',t=>{
  const collision=JSON.stringify(world.colliders),treePositions=world.forest.trees.map(t=>[t.x,t.z]);
  let peakInstances=0,peakChunks=0;
  for(const pos of [SPAWN,{x:-31,z:29},{x:-19,z:-3},{x:-27,z:-29},{x:27,z:-29},{x:16,z:-15},{x:27,z:29},SPAWN]){
    const stats=world.streaming.update(streamingViewpoints(pos),{flush:true});peakInstances=Math.max(peakInstances,stats.residentInstances);peakChunks=Math.max(peakChunks,stats.residentChunks);
    assert.equal(stats.pendingChunks,0,JSON.stringify({pos,stats}));assert.ok(terrainAt(pos).some(c=>c.object),'no missing floor after moving');
    assert.ok(stats.residentInstances<stats.totalInstances,'the complete forest is never resident on this route');
  }
  assert.ok(world.streaming.stats().disposedChunks>0);assert.ok(peakChunks<=STREAMING_RULES.maxResident);assert.ok(peakInstances<world.streaming.stats().totalInstances);
  assert.equal(JSON.stringify(world.colliders),collision);assert.deepEqual(world.forest.trees.map(t=>[t.x,t.z]),treePositions);
  t.diagnostic(`Map route peak allocation: ${peakInstances}/${world.streaming.stats().totalInstances} decorative instances; ${peakChunks}/${STREAMING_RULES.maxResident} chunk budget.`);
});

test('actual telescope views fit the residency budget with continuous floor/canopy through the optical corridor',()=>{
  for(const time of [0,21,80]){
    const target=distantPresence(time),views=streamingViewpoints(scopeOrigin,target),stats=world.streaming.update(views,{flush:true});
    assert.equal(stats.pendingChunks,0,JSON.stringify({time,stats}));assert.ok(terrainAt(scopeOrigin).some(c=>c.object));assert.ok(terrainAt(target).some(c=>c.object));
    for(const point of views)assert.ok(terrainAt(point).some(c=>c.object),`corridor floor resident at ${JSON.stringify(point)}`);
    for(const chunk of world.streaming.chunks.values())if(chunk.id.startsWith('forest-')&&views.some(p=>Math.hypot(Math.max(chunk.bounds.minX-p.x,0,p.x-chunk.bounds.maxX),Math.max(chunk.bounds.minZ-p.z,0,p.z-chunk.bounds.maxZ))<=(p.radius??STREAMING_RULES.loadRadius)))assert.ok(chunk.object,`scope canopy chunk ${chunk.id} loaded`);
  }
});

test('the entire walkable map fits the normal residency budget including the central junction',t=>{
  let peak={count:0,pos:null};
  for(let x=-32;x<=30;x+=4)for(let z=-32;z<=30;z+=4){
    const pos={x,z,level:0};if(!world.isFreeAt(pos,.3))continue;
    const count=[...world.streaming.chunks.values()].filter(c=>Math.hypot(Math.max(c.bounds.minX-x,0,x-c.bounds.maxX),Math.max(c.bounds.minZ-z,0,z-c.bounds.maxZ))<=STREAMING_RULES.loadRadius).length;
    if(count>peak.count)peak={count,pos};
  }
  assert.ok(peak.count<=STREAMING_RULES.maxResident,JSON.stringify(peak));
  const stats=world.streaming.update(streamingViewpoints(peak.pos),{flush:true});assert.equal(stats.pendingChunks,0);
  t.diagnostic(`Walkable grid maximum required chunks: ${peak.count}/${STREAMING_RULES.maxResident} at ${JSON.stringify(peak.pos)}.`);
});

test('the real creature stays present, keeps its pose at scope entry and walks during the first beat',()=>{
  const start=21,presence=distantPresence(start);updateAt(start,presence);
  const before=world.creature.position.clone(),heading=world.creature.rotation.y;
  const scope={phase:0,progress:0,target:presence,heading:presence.heading,gait:presence.gait,speed:presence.speed};
  updateAt(start,presence,scope);assert.ok(world.creature.visible);assert.ok(world.creature.position.distanceTo(before)<.00001);assert.ok(Math.abs(world.creature.rotation.y-heading)<.00001,'no body turn snap at optical entry');
  const next=distantPresence(start+1,{startedAt:start,total:1});updateAt(start+1,next,{...scope,progress:.2,target:next,heading:next.heading,gait:next.gait,speed:next.speed});
  assert.ok(world.creature.visible);assert.ok(world.creature.position.distanceTo(before)>.02,'phase zero does not reveal a motionless spawned figure');
  assert.ok(world.legs.some(leg=>Math.abs(leg.rotation.x)>.001),'walking feet remain animated inside the telescope');
  assert.equal(world.scene.fog.density,STREAMING_RULES.scopeFogDensity);
});

test('the final telescope pose hands the same creature position to ordinary gameplay',()=>{
  const presence=distantPresence(38,{startedAt:21,total:17}),scope={phase:2,progress:1,target:presence,heading:presence.heading,gait:presence.gait,speed:presence.speed};
  updateAt(38,presence,scope);const before=world.creature.position.clone(),heading=world.creature.rotation.y;
  const facing=Math.atan2(SPAWN.x-presence.x,SPAWN.z-presence.z);updateAt(38,{...presence,heading:facing},null);
  assert.ok(world.creature.visible);assert.ok(world.creature.position.distanceTo(before)<.00001);
  // The camera at the telescope and the player's interaction position differ
  // slightly; the facing error is bounded rather than a 180-degree re-spawn.
  assert.ok(Math.abs(Math.atan2(Math.sin(world.creature.rotation.y-heading),Math.cos(world.creature.rotation.y-heading)))<.06);
  assert.equal(world.scene.fog.density,STREAMING_RULES.fogDensity);
});

test('teleport and retry render a complete nearby floor on their first frame',()=>{
  const presence=distantPresence(40);
  world.update({pos:SPAWN,yaw:0,pitch:0,time:40,monster:presence,enemyVisual:presence,active:true,companionState:'away'});
  const far={x:-28,z:-29,level:0};world.update({pos:far,yaw:0,pitch:0,time:41,monster:presence,enemyVisual:presence,active:true,companionState:'away'});
  assert.equal(world.streaming.stats().pendingChunks,0);assert.ok(terrainAt(far).every(c=>c.object),'all tiles touching teleported feet exist on frame one');
  world.update({pos:SPAWN,yaw:0,pitch:0,time:0,monster:presence,enemyVisual:presence,active:true,companionState:'away'});
  assert.equal(world.streaming.stats().pendingChunks,0);assert.ok(terrainAt(SPAWN).every(c=>c.object),'retry restores the initial floor before rendering');
});

test('CPU terrain retains ground ordering with fewer triangles than the old complete coarse map',t=>{
  const cpu=createWorld(true),renderer=new SoftwareRenderer(),tiles=[...cpu.streaming.chunks.values()].filter(c=>c.id.startsWith('terrain:')&&c.object);
  let triangles=0;
  for(const chunk of tiles){
    const geometry=chunk.object.geometry;assert.ok(geometry.parameters.widthSegments<=3);assert.equal(geometry.userData.terrainTile,true);
    const cached=renderer._geometry(geometry);assert.equal(cached.terrain,true,'terrain still draws below paths/props');triangles+=cached.count;
  }
  assert.ok(triangles<28*28*2,`${triangles} triangles vs 1568 in the prior CPU terrain grid`);
  t.diagnostic(`CPU resident terrain: ${tiles.length} tiles, ${triangles} triangles (previous full-map coarse grid 1568).`);
  cpu.streaming.dispose();
});
