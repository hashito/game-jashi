import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import {SpatialChunkManager,STREAMING_RULES,instanceRecord,addInstancedLayer,addTerrainChunks,streamingViewpoints} from '../dist/streaming.js';

function fixture(options={}){
  const scene=new THREE.Scene(),manager=new SpatialChunkManager(scene,{loadRadius:10,unloadRadius:15,maxLoadsPerUpdate:2,...options});
  let built=0,released=0;
  const add=(id,x,z=0)=>manager.register({id,bounds:{minX:x-1,maxX:x+1,minZ:z-1,maxZ:z+1},instances:1,create:()=>{built++;return new THREE.Group();},dispose:object=>{released++;object.removeFromParent();}});
  return {scene,manager,add,get built(){return built;},get released(){return released;}};
}

test('distant map chunks have no meshes or instance buffers until approached',()=>{
  const f=fixture();for(let i=0;i<20;i++)f.add(`c${i}`,i*20);
  assert.equal(f.built,0);assert.equal(f.scene.children.length,0);
  const state=f.manager.update({x:0,z:0});
  assert.equal(state.residentChunks,1);assert.equal(f.built,1);assert.equal(state.totalChunks,20);assert.equal(state.instanceMatrixBytes,64);
});

test('nearest chunks load within a per-frame budget and warmup is explicit',()=>{
  const f=fixture();for(let i=0;i<6;i++)f.add(`c${i}`,i);
  let state=f.manager.update({x:0,z:0});assert.equal(state.residentChunks,2);assert.equal(state.pendingChunks,4);
  assert.equal(f.manager.chunks.get('c0').object?.isObject3D,true);assert.equal(f.manager.chunks.get('c5').object,null);
  state=f.manager.update({x:0,z:0},{flush:true});assert.equal(state.residentChunks,6);assert.equal(state.pendingChunks,0);
});

test('hysteresis prevents repeated allocation when crossing the load boundary',()=>{
  const f=fixture();f.add('tree',0);f.manager.update({x:0,z:0});
  for(const x of [10.9,12,13.5,11.5,14.9,10])f.manager.update({x,z:0});
  assert.equal(f.built,1);assert.equal(f.released,0);
  f.manager.update({x:17,z:0});assert.equal(f.released,1);assert.equal(f.scene.children.length,0);
  f.manager.update({x:0,z:0});assert.equal(f.built,2);
});

test('hard residency capacity remains bounded and scope target has priority',()=>{
  const f=fixture({maxResident:2});f.add('near',0);f.add('near2',2);f.add('target',90);
  f.manager.update({x:0,z:0},{flush:true});assert.equal(f.scene.children.length,2);
  const state=f.manager.update([{x:0,z:0},{x:90,z:0,radius:4,pin:2}],{flush:true});
  assert.equal(state.residentChunks,2);assert.equal(f.manager.chunks.get('target').object?.isObject3D,true);
  assert.equal(f.manager.chunks.get('near2').object,null);
});

test('a moving player can unload and revisit without modifying logical world data',()=>{
  const f=fixture(),colliders=[{x:0,z:0,w:1,d:1},{x:80,z:0,w:1,d:1}],snapshot=JSON.stringify(colliders);
  f.add('start',0);f.add('end',80);f.manager.update({x:0,z:0});f.manager.update({x:80,z:0});
  assert.equal(f.manager.chunks.get('start').object,null);assert.ok(f.manager.chunks.get('end').object);
  f.manager.update({x:0,z:0});assert.ok(f.manager.chunks.get('start').object);assert.equal(JSON.stringify(colliders),snapshot);
  f.manager.dispose();f.manager.dispose();assert.equal(f.released,3,'dispose is idempotent');
});

test('instanced layers snapshot transforms and recreate them identically after unload',()=>{
  const f=fixture(),dummy=new THREE.Object3D(),material=new THREE.MeshBasicMaterial(),records=[];let geometries=0;
  for(const x of [-35,-1,1,35]){dummy.position.set(x,3,2);dummy.updateMatrix();records.push(instanceRecord(dummy.matrix));}
  dummy.position.x=900;dummy.updateMatrix();
  const layer=addInstancedLayer(f.manager,{id:'trunks',instances:records,chunkSize:16,geometryFactory:()=>{geometries++;return new THREE.BoxGeometry(1,6,1);},material,userData:{trunks:true},castShadow:true});
  assert.equal(geometries,0);assert.equal(layer.count,4);assert.equal(layer.material,material);
  f.manager.update({x:0,z:0},{flush:true});assert.equal(layer.meshes.length,2);assert.equal(f.manager.stats().residentInstances,2);
  const first=layer.meshes.find(m=>m.instanceMatrix.array[12]===1),matrix=Array.from(first.instanceMatrix.array);
  assert.ok(first.userData.trunks);assert.ok(first.castShadow);assert.ok(first.geometry.boundingSphere||first.boundingSphere);
  f.manager.update({x:150,z:150});assert.equal(layer.meshes.length,0);
  f.manager.update({x:0,z:0},{flush:true});assert.deepEqual(Array.from(layer.meshes.find(m=>m.instanceMatrix.array[12]===1).instanceMatrix.array),matrix);
  assert.notEqual(layer.meshes.find(m=>m.instanceMatrix.array[12]===1),first);
});

test('unloading frees owned geometry and instance resources, keeps shared material/texture alive',()=>{
  const f=fixture(),material=new THREE.MeshBasicMaterial({map:new THREE.Texture()}),matrix=new THREE.Matrix4();let geometryDisposed=0,meshDisposed=0,materialDisposed=0,textureDisposed=0;
  material.addEventListener('dispose',()=>materialDisposed++);material.map.addEventListener('dispose',()=>textureDisposed++);
  const layer=addInstancedLayer(f.manager,{id:'grass',instances:[instanceRecord(matrix)],geometryFactory:()=>{const geometry=new THREE.PlaneGeometry(1,1);geometry.addEventListener('dispose',()=>geometryDisposed++);return geometry;},material});
  f.manager.update({x:0,z:0});layer.meshes[0].addEventListener('dispose',()=>meshDisposed++);
  f.manager.update({x:100,z:100});assert.equal(geometryDisposed,1);assert.equal(meshDisposed,1);assert.equal(materialDisposed,0);assert.equal(textureDisposed,0);
});

test('telescope keeps the camera-to-target corridor resident with target-first budget',()=>{
  const player={x:0,z:18},target={x:4,z:-28},views=streamingViewpoints(player,target),f=fixture({maxLoadsPerUpdate:1});
  assert.deepEqual(views[0],player);assert.equal(views.at(-1).x,target.x);assert.equal(views.at(-1).z,target.z);assert.equal(views.at(-1).pin,2);
  for(let i=0;i<=20;i++){const t=i/20,x=player.x+(target.x-player.x)*t,z=player.z+(target.z-player.z)*t;assert.ok(views.some(p=>Math.hypot(x-p.x,z-p.z)<(p.radius??STREAMING_RULES.loadRadius)));}
  f.add('near',player.x,player.z);f.add('reveal',target.x,target.z);f.manager.update(views);assert.ok(f.manager.chunks.get('reveal').object,'far reveal is created on the first budgeted update');
  f.manager.update(views,{flush:true});assert.ok(f.manager.chunks.get('near').object);
  assert.deepEqual(streamingViewpoints(player),[player]);
});

test('terrain tiles are lazy, share edge heights/UVs/colors and preserve material ownership',()=>{
  const f=fixture({loadRadius:30,unloadRadius:36}),material=new THREE.MeshStandardMaterial(),heightAt=(x,z)=>Math.sin(x*.085)*.38+Math.sin(z*.13)*.27;
  addTerrainChunks(f.manager,{heightAt,material,minX:0,maxX:30,minZ:0,maxZ:15,tileSize:15,segments:8});
  assert.equal(f.scene.children.length,0);f.manager.update({x:15,z:7},{flush:true});assert.equal(f.scene.children.length,2);
  const [left,right]=f.scene.children.sort((a,b)=>a.position.x-b.position.x),edge=mesh=>{
    const {position,uv,color}=mesh.geometry.attributes,vertices=[];
    for(let i=0;i<position.count;i++)if(Math.abs(position.getX(i)+mesh.position.x-15)<.001)vertices.push([position.getZ(i)+mesh.position.z,position.getY(i),uv.getX(i),uv.getY(i),color.getX(i),color.getY(i),color.getZ(i)]);
    return vertices.sort((a,b)=>a[0]-b[0]);
  };
  assert.deepEqual(edge(left),edge(right));assert.equal(edge(left).length,9);assert.equal(left.material,material);assert.ok(left.userData.ground&&left.userData.terrainTile);
});

test('fog hides normal stream boundaries before the load radius',()=>{
  const transmittance=Math.exp(-((STREAMING_RULES.fogDensity*STREAMING_RULES.loadRadius)**2));
  assert.ok(transmittance<.01,'less than 1% of an object remains visible at the load boundary');
  assert.ok(STREAMING_RULES.unloadRadius>STREAMING_RULES.loadRadius);
});

test('invalid viewpoints do not unload a working scene and invalid definitions fail early',()=>{
  const f=fixture();f.add('c',0);f.manager.update({x:0,z:0});f.manager.update(null);assert.equal(f.scene.children.length,1);
  assert.throws(()=>f.manager.register({id:'invalid',bounds:{},create:()=>new THREE.Group()}));
  assert.throws(()=>f.add('c',0),/Duplicate/);assert.throws(()=>instanceRecord([1,2,3]));
  assert.throws(()=>new SpatialChunkManager(f.scene,{loadRadius:20,unloadRadius:10}));
});
