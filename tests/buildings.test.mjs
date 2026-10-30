import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import {MountainWorld} from '../dist/world.js';
import {DOORS,ROOMS,BUILDINGS,SPAWN,LANDMARKS,LORE_PLACEMENTS,COMPANION_START} from '../dist/layout.js';

const noop=()=>{};
function canvas(){const context=new Proxy({createLinearGradient:()=>({addColorStop:noop}),createRadialGradient:()=>({addColorStop:noop}),createPattern:()=>({})},{get:(o,k)=>k in o?o[k]:noop});return {width:512,height:160,style:{},setAttribute:noop,getContext:()=>context};}
Object.assign(globalThis,{innerWidth:1280,innerHeight:720,devicePixelRatio:1,addEventListener:noop,document:{createElement:canvas}});
const renderer={shadowMap:{},setPixelRatio:noop,setSize:noop,render:noop,domElement:canvas()};
const textureLoader={load(_url,onLoad){const t=new THREE.Texture({width:1024,height:1024});queueMicrotask(()=>onLoad?.(t));return t;}};
const world=new MountainWorld({append:noop},{renderer,textureLoader});
const settle=(actors=[])=>{for(let i=0;i<30;i++)world.updateDoors(.1,actors);};
const openAll=()=>{for(const d of DOORS)world.setDoor(d.id,true,{immediate:true});};

test('every building has an operable entrance with physical leaves and two-sided handles',()=>{
  for(const b of BUILDINGS){const d=world.doors[`${b.id}-entry`];assert.ok(d);assert.equal(d.leaves.length,2);assert.equal(d.colliders.length,2);assert.equal(d.colliders.every(c=>c.id===d.id),true);
    world.setDoor(d.id,false,{immediate:true});
    const a={x:d.x,z:d.z-1,level:d.level},beyond={...a,z:d.z+1};
    assert.equal(world.isSegmentFree(a,beyond),false,`${d.id} closed blocks movement`);assert.equal(world.isBlocked(a,beyond),true,`${d.id} closed blocks sight`);
    assert.equal(world.getDoorTarget(a,Math.PI)?.id,d.id);assert.equal(world.getDoorTarget(beyond,0)?.id,d.id);
    const result=world.toggleDoor(d.id,[a]);assert.equal(result.changed,true);assert.equal(result.open,true);settle();
    assert.equal(world.isSegmentFree(a,beyond),true,`${d.id} open is walkable`);assert.equal(world.isBlocked(a,beyond),false,`${d.id} open reveals the room`);
  }
});

test('a sliding door cannot close around an occupant or sweep into an approaching actor',()=>{
  const d=world.doors['shed-entry'],actor={x:d.x,z:d.z,level:0};world.setDoor(d.id,true,{immediate:true});
  assert.equal(world.setDoor(d.id,false,{actors:[actor]}).blocked,true);assert.equal(d.open,true);assert.equal(world.isFreeAt(actor),true);
  world.setDoor(d.id,false);settle([actor]);assert.equal(d.open,true,'animation reverses when an actor enters the leaf path');assert.equal(world.isFreeAt(actor),true);
  world.setDoor(d.id,false,{immediate:true});assert.equal(world.getDoorTarget({...actor,level:1},0),null,'the upstairs player cannot operate the floor below');openAll();
});

test('door saves use only known boolean states and restore collision immediately',()=>{
  world.setDoor('shed-entry',false,{immediate:true});world.setDoor('shelter-entry',true,{immediate:true});const saved=world.snapshotDoors();
  world.restoreDoors({...saved,unknown:true,'cabin-store':'closed'});assert.equal(world.doors['shed-entry'].slide,0);assert.equal(world.doors['shelter-entry'].slide,1);assert.equal(world.doors['cabin-store'].open,true);assert.equal(world.doors.unknown,undefined);
  world.restoreDoors();assert.equal(world.doors['shed-entry'].open,false);assert.equal(world.doors['cabin-entry'].open,true);openAll();
});

test('enemy planning may reach a closed door but cannot move through its physical leaf',()=>{
  const d=world.doors['shed-entry'],outside={x:d.x,z:d.z+1.1,level:0},inside={x:d.x,z:d.z-1.1,level:0};world.setDoor(d.id,false,{immediate:true});
  assert.equal(world.findPath(outside,inside).length,0);assert.ok(world.findPathThroughDoors(outside,inside).length);assert.equal(world.getBlockingDoor(outside,inside)?.id,d.id);assert.equal(world.getBlockingDoor({...outside,z:4},inside),null);
  const actor={...outside};world.move(actor,0,-2.2);assert.deepEqual(actor,outside);assert.equal(d.colliders.every(c=>c.enabled),true,'planning restores every collider');openAll();
});

test('new room partitions leave actual routes to the stairs, props and both small buildings',()=>{
  openAll();assert.ok(world.isFreeAt(SPAWN));assert.ok(world.isFreeAt(COMPANION_START));assert.ok(ROOMS.some(r=>r.id==='cabin-bedroom'));assert.ok(ROOMS.some(r=>r.id==='cabin-store'));
  for(const target of [{x:0,z:17,level:0},{x:0,z:27,level:0},{x:3.8,z:26.7,level:1},...BUILDINGS.map(b=>b.entrance)])assert.ok(world.findPath(SPAWN,target).length,`reachable ${JSON.stringify(target)}`);
  for(const item of [...Object.values(LANDMARKS).filter(i=>i!==LANDMARKS.car),...LORE_PLACEMENTS]){
    const candidates=[];for(const r of [.2,.65,1,1.5,2.1])for(let i=0;i<16;i++)candidates.push({x:item.x+Math.cos(i*Math.PI/8)*r,z:item.z+Math.sin(i*Math.PI/8)*r,level:item.level??0});
    assert.ok(candidates.some(p=>world.isFreeAt(p,.34)&&!world.isBlocked(p,item)&&world.findPath(SPAWN,p).length),`reachable ${item.label}`);
  }
  assert.equal(world.isBlocked({x:3,z:25.1,level:0},{x:3,z:26.8,level:0}),true,'bedroom has a solid partition away from its opening');
  assert.equal(world.isBlocked({x:2,z:27.5,level:1},{x:3,z:27.5,level:1}),true,'upstairs store has a solid side wall');
});

test('signs stay below eye level and are small enough to leave the path readable',()=>{
  assert.ok(world.signs.length>=10);for(const sign of world.signs){assert.ok(sign.width<=1.35);assert.equal(sign.height,.34);assert.ok(sign.board.position.y-sign.post.position.y<.5);}
});
