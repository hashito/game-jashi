import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import {MountainWorld} from '../dist/world.js';
import {SCENE_ART,SCENE_ART_RULES} from '../dist/scene-art.js';
import {DOORS,SPAWN,LANDMARKS} from '../dist/layout.js';

const noop=()=>{};
function canvas(){
  const texts=[],images=[],context=new Proxy({texts,images,fillText:(...args)=>texts.push(args),drawImage:(...args)=>images.push(args),createLinearGradient:()=>({addColorStop:noop}),createRadialGradient:()=>({addColorStop:noop}),createPattern:()=>({})},{get:(o,k)=>k in o?o[k]:noop});
  return {width:512,height:160,style:{},setAttribute:noop,getContext:()=>context};
}
Object.assign(globalThis,{innerWidth:1280,innerHeight:720,devicePixelRatio:1,addEventListener:noop,document:{createElement:canvas}});
const renderer={shadowMap:{},setPixelRatio:noop,setSize:noop,render:noop,domElement:canvas()},requests=[];
const textureLoader={load(url,onLoad,_progress,onError){const texture=new THREE.Texture({width:768,height:768});let disposed=0;texture.addEventListener('dispose',()=>disposed++);requests.push({url,texture,resolve:()=>onLoad?.(texture),reject:()=>onError?.(),get disposed(){return disposed;}});return texture;}};
const world=new MountainWorld({append:noop},{renderer,textureLoader});
const facing=(from,to)=>Math.atan2(from.x-to.x,from.z-to.z);
const front=(art,distance=1.25)=>({x:art.x+Math.sin(art.rotation)*distance,z:art.z+Math.cos(art.rotation)*distance,level:art.level});
const artRequests=()=>requests.filter(request=>SCENE_ART.some(art=>art.image===request.url));

test('eight distinct photographs are compact optional records with Japanese printed headings',()=>{
  assert.equal(SCENE_ART.length,8);assert.equal(new Set(SCENE_ART.map(art=>art.id)).size,8);assert.equal(new Set(SCENE_ART.map(art=>art.image)).size,8);
  assert.equal(SCENE_ART.filter(art=>art.type==='notice').length,4);assert.equal(SCENE_ART.filter(art=>art.type==='photo').length,4);
  for(const art of SCENE_ART){
    assert.match(art.image,/^\.\/assets\/photos\/[a-z-]+-v4-2\.webp$/);assert.ok(art.title&&art.label&&art.caption&&art.alt&&art.text.includes('\n'));
    assert.ok(art.width<=.64&&art.height<=.8,`${art.id} stays smaller than a person`);assert.ok(art.y-art.height/2>.65);
    assert.ok(Math.abs(art.width/art.height-.8)<1e-9);assert.equal(art.level,0);assert.ok(Object.isFrozen(art));
  }
  assert.ok(SCENE_ART_RULES.textureWidth<=768&&SCENE_ART_RULES.textureHeight<=768);
  const poster=world.artPanels.get('trail-notice');assert.ok(poster.group);assert.ok(poster.canvas.getContext('2d').texts.some(([text])=>text===poster.art.title));
});

test('only nearby art requests images, with bounded loads and hysteresis before disposal',()=>{
  const initial=artRequests().map(request=>request.url);assert.equal(initial.length,2);assert.ok(initial.every(url=>url.includes('cabin-memory')||url.includes('trail-notice')));
  const panel=world.artPanels.get('trail-notice'),imageRequest=artRequests().find(request=>request.url===panel.art.image);imageRequest.resolve();assert.equal(panel.status,'ready');assert.equal(imageRequest.disposed,1,'source pixels are copied into the small canvas, then the unused source texture is released');
  assert.equal(panel.canvas.getContext('2d').images.length,1);const texture=panel.texture,material=panel.surface.material,geometry=panel.surface.geometry;let textureDisposals=0,materialDisposals=0,geometryDisposals=0;
  texture.addEventListener('dispose',()=>textureDisposals++);material.addEventListener('dispose',()=>materialDisposals++);geometry.addEventListener('dispose',()=>geometryDisposals++);
  world.updateSceneArt({x:panel.art.x,z:panel.art.z+SCENE_ART_RULES.loadRadius+1});assert.equal(panel.texture,texture,'a loaded panel stays resident between the two radii');
  world.updateSceneArt({x:100,z:100});assert.equal(panel.group,null);assert.equal(textureDisposals,1);assert.equal(materialDisposals,1);assert.equal(geometryDisposals,1);assert.equal(texture.image.width,512);assert.equal(texture.image.height,640);
  const count=artRequests().length;world.updateSceneArt({x:16,z:-15});assert.ok(artRequests().length-count<=SCENE_ART_RULES.maxLoadsPerUpdate);assert.ok(artRequests().length-count>0);
  world.disposeSceneArt();world.disposeSceneArt();assert.equal(textureDisposals,1,'repeated release is harmless');
});

test('late texture requests cannot resurrect an unloaded panel or overwrite a replacement',()=>{
  world.updateSceneArt(front(SCENE_ART[0]));const panel=world.artPanels.get('trail-notice'),oldRequest=artRequests().findLast(request=>request.url===panel.art.image);
  world.updateSceneArt({x:100,z:100});oldRequest.resolve();assert.equal(panel.group,null);assert.equal(panel.status,'idle');
  world.updateSceneArt(front(SCENE_ART[0]));const currentTexture=panel.texture,newRequest=artRequests().findLast(request=>request.url===panel.art.image);assert.notEqual(newRequest,oldRequest);
  oldRequest.resolve();assert.equal(panel.texture,currentTexture);assert.equal(panel.status,'loading');assert.equal(panel.canvas.getContext('2d').images.length,0);
  newRequest.resolve();assert.equal(panel.status,'ready');assert.equal(panel.canvas.getContext('2d').images.length,1);world.disposeSceneArt();
});

test('every record has a reachable front and returns its full inspection content',()=>{
  for(const door of DOORS)world.setDoor(door.id,true,{immediate:true});world.setGateOpen(true);
  for(const art of SCENE_ART){
    const candidates=[.8,1.25,1.7,2.1].flatMap(distance=>[-.35,0,.35].map(offset=>{const p=front(art,distance);p.x+=Math.cos(art.rotation)*offset;p.z-=Math.sin(art.rotation)*offset;return p;}));
    const accessible=candidates.find(p=>world.isFreeAt(p,.34)&&world.getArtTarget(p,facing(p,art))?.id===art.id&&world.findPath(SPAWN,p).length);
    assert.ok(accessible,`${art.id} has a walkable approach and unobstructed front`);
    const target=world.getArtTarget(accessible,facing(accessible,art));assert.equal(target.kind,'sceneArt');assert.equal(target.image,art.image);assert.equal(target.text,art.text);assert.equal(target.title,art.title);assert.ok(target.distance<=2.8);
    assert.notEqual(world.getArtTarget(accessible,facing(accessible,art)+Math.PI)?.id,art.id,'looking away cannot inspect a record');
    assert.notEqual(world.getArtTarget({...accessible,level:1},facing(accessible,art))?.id,art.id,'the floor above cannot inspect it');
    const behind=front(art,-1);assert.notEqual(world.getArtTarget(behind,facing(behind,art))?.id,art.id,'the reverse side of a wall is not inspectable');
  }
  for(const [id,p]of [['trail-notice',{x:-4.25,z:17.3,level:0}],['cabin-memory',{x:4.5,z:23.15,level:0}]]){const art=SCENE_ART.find(a=>a.id===id);assert.ok(world.isFreeAt(p));assert.equal(world.getArtTarget(p,facing(p,art))?.id,id,'browser-smoke checkpoint is genuinely reachable and targetable');}
});

test('wall-mounted art neither creates blockers nor permits looking through a closed door',()=>{
  const colliders=world.colliders.map(c=>({...c})),beforePaths=[{x:0,z:17,level:0},{x:0,z:27,level:0},LANDMARKS.bottle,LANDMARKS.crank].map(to=>world.findPath(SPAWN,to));
  for(const art of SCENE_ART)world.updateSceneArt(front(art));world.disposeSceneArt();assert.deepEqual(world.colliders,colliders);
  const afterPaths=[{x:0,z:17,level:0},{x:0,z:27,level:0},LANDMARKS.bottle,LANDMARKS.crank].map(to=>world.findPath(SPAWN,to));assert.deepEqual(afterPaths,beforePaths);
  const art=SCENE_ART.find(art=>art.id==='logging-memory'),outside={x:-19,z:.6,level:0};
  world.setDoor('shed-entry',false,{immediate:true});assert.notEqual(world.getArtTarget(outside,facing(outside,art),6)?.id,art.id,'a closed physical leaf hides the interior photograph');
  world.setDoor('shed-entry',true,{immediate:true});assert.equal(world.getArtTarget(outside,facing(outside,art),6)?.id,art.id,'opening the actual leaf clears the sightline');
});
