import * as THREE from './vendor/three.module.js';

// Only decorative geometry is streamed. Collision, navigation and story state
// remain in the world even while their distant visual chunks are not resident.
export const STREAMING_RULES=Object.freeze({chunkSize:16,loadRadius:38,unloadRadius:46,maxLoadsPerUpdate:4,maxResident:192,fogDensity:.060,scopeFogDensity:.021});
const validPoint=p=>Number.isFinite(p?.x)&&Number.isFinite(p?.z);
const boxDistance=(p,b)=>Math.hypot(Math.max(b.minX-p.x,0,p.x-b.maxX),Math.max(b.minZ-p.z,0,p.z-b.maxZ));

/** Release instance buffers and owned geometries, never shared materials/maps. */
export function disposeChunk(object){
  const geometries=new Set();
  object?.traverse?.(part=>{if(part.geometry)geometries.add(part.geometry);if(part.isInstancedMesh)part.dispose();});
  for(const geometry of geometries)geometry.dispose();
  object?.removeFromParent?.();
}

export class SpatialChunkManager {
  constructor(scene,options={}){
    this.scene=scene;this.options={...STREAMING_RULES,...options};this.chunks=new Map();
    if(!(this.options.loadRadius>0)||this.options.unloadRadius<this.options.loadRadius)throw new RangeError('Streaming radii must be positive and unload >= load');
    if(!Number.isInteger(this.options.maxLoadsPerUpdate)||this.options.maxLoadsPerUpdate<1||!Number.isInteger(this.options.maxResident)||this.options.maxResident<1)throw new RangeError('Streaming budgets must be positive integers');
    this.created=0;this.released=0;this.pending=0;
  }
  register({id,bounds,create,dispose=disposeChunk,instances=0}){
    if(this.chunks.has(id))throw new Error(`Duplicate visual chunk: ${id}`);
    if(!id||typeof create!=='function'||!bounds||!['minX','maxX','minZ','maxZ'].every(key=>Number.isFinite(bounds[key]))||bounds.minX>bounds.maxX||bounds.minZ>bounds.maxZ)throw new TypeError('Invalid visual chunk');
    this.chunks.set(id,{id,bounds:{...bounds},create,dispose,instances,object:null});return id;
  }
  /** Loading is nearest-first and bounded per frame. flush is for initial load,
   * teleports and scope entry before the first frame can expose a new vista. */
  update(points,{flush=false}={}){
    const views=(Array.isArray(points)?points:[points]).filter(validPoint).map(p=>({...p,
      radius:Number.isFinite(p.radius)?Math.max(0,p.radius):this.options.loadRadius,
      unloadRadius:Number.isFinite(p.unloadRadius)?Math.max(p.radius||0,p.unloadRadius):Number.isFinite(p.radius)?Math.max(0,p.radius)+this.options.unloadRadius-this.options.loadRadius:this.options.unloadRadius}));
    if(!views.length)return this.stats();
    const candidates=[];
    for(const chunk of this.chunks.values()){
      const distances=views.map(p=>boxDistance(p,chunk.bounds));
      const wanted=views.some((p,i)=>distances[i]<=p.radius),retained=!!chunk.object&&views.some((p,i)=>distances[i]<=p.unloadRadius);
      const pinned=Math.max(0,...views.map((p,i)=>distances[i]<=p.radius?Number(p.pin)||0:0));
      if(wanted||retained)candidates.push({chunk,wanted,pinned,distance:Math.min(...distances)});
    }
    candidates.sort((a,b)=>Number(b.pinned)-Number(a.pinned)||Number(b.wanted)-Number(a.wanted)||a.distance-b.distance||a.chunk.id.localeCompare(b.chunk.id));
    const selected=candidates.slice(0,this.options.maxResident),keep=new Set(selected.map(c=>c.chunk.id));
    for(const chunk of this.chunks.values())if(chunk.object&&!keep.has(chunk.id)){chunk.dispose(chunk.object);chunk.object=null;this.released++;}
    let budget=flush?this.options.maxResident:this.options.maxLoadsPerUpdate;
    for(const {chunk,wanted} of selected)if(wanted&&!chunk.object&&budget>0){
      const object=chunk.create();if(!object?.isObject3D)throw new TypeError(`Visual chunk ${chunk.id} did not create an Object3D`);
      object.userData.streamChunk=chunk.id;this.scene.add(object);chunk.object=object;this.created++;budget--;
    }
    this.pending=candidates.filter(c=>c.wanted&&!c.chunk.object).length;return this.stats();
  }
  stats(){
    let residentChunks=0,residentInstances=0,totalInstances=0;
    for(const chunk of this.chunks.values()){totalInstances+=chunk.instances;if(chunk.object){residentChunks++;residentInstances+=chunk.instances;}}
    return {totalChunks:this.chunks.size,residentChunks,totalInstances,residentInstances,instanceMatrixBytes:residentInstances*16*4,pendingChunks:this.pending,createdChunks:this.created,disposedChunks:this.released};
  }
  dispose(){for(const chunk of this.chunks.values())if(chunk.object){chunk.dispose(chunk.object);chunk.object=null;this.released++;}this.pending=0;}
}

/** Snapshot only lightweight transforms at map generation time, without making
 * an InstancedMesh or allocating its GPU instance buffer for the entire map. */
export function instanceRecord(matrix,position=null){
  const elements=matrix?.elements||matrix;
  if(!elements||elements.length!==16||!Array.from(elements).every(Number.isFinite))throw new TypeError('Expected a finite 4x4 instance transform');
  return {x:position?.x??elements[12],z:position?.z??elements[14],matrix:Float32Array.from(elements)};
}

export function addInstancedLayer(manager,{id,instances,geometryFactory,material,userData={},castShadow=false,receiveShadow=true,chunkSize=manager.options.chunkSize}){
  if(!(chunkSize>0)||typeof geometryFactory!=='function')throw new TypeError('Invalid streamed instance layer');
  const cells=new Map();
  for(const instance of instances){
    if(!validPoint(instance)||!instance.matrix||instance.matrix.length!==16)throw new TypeError(`Invalid instance in ${id}`);
    const x=Math.floor(instance.x/chunkSize),z=Math.floor(instance.z/chunkSize),key=`${x}:${z}`;
    if(!cells.has(key))cells.set(key,{x,z,records:[]});cells.get(key).records.push(instance);
  }
  const chunkIds=[];
  for(const [key,cell]of cells){
    const chunkId=`${id}:${key}`,bounds={minX:cell.x*chunkSize,maxX:(cell.x+1)*chunkSize,minZ:cell.z*chunkSize,maxZ:(cell.z+1)*chunkSize};
    manager.register({id:chunkId,bounds,instances:cell.records.length,create:()=>{
      const mesh=new THREE.InstancedMesh(geometryFactory(),material,cell.records.length),matrix=new THREE.Matrix4();
      for(let i=0;i<cell.records.length;i++)mesh.setMatrixAt(i,matrix.fromArray(cell.records[i].matrix));
      mesh.instanceMatrix.needsUpdate=true;mesh.castShadow=castShadow;mesh.receiveShadow=receiveShadow;Object.assign(mesh.userData,userData);
      mesh.computeBoundingBox();mesh.computeBoundingSphere();return mesh;
    }});chunkIds.push(chunkId);
  }
  return {count:instances.length,material,chunkIds,get meshes(){return chunkIds.map(key=>manager.chunks.get(key).object).filter(Boolean);}};
}

/** The old 180 m ground plane is replaced by exact-height local tiles. Adjacent
 * tiles sample the same world coordinates, including color/UV, so no seams. */
export function addTerrainChunks(manager,{heightAt,material,minX=-90,maxX=90,minZ=-90,maxZ=90,tileSize=15,segments=8}){
  if(typeof heightAt!=='function'||!(tileSize>0)||!Number.isInteger(segments)||segments<1)throw new TypeError('Invalid terrain tile specification');
  const ids=[];
  for(let z=minZ;z<maxZ;z+=tileSize)for(let x=minX;x<maxX;x+=tileSize){
    const width=Math.min(tileSize,maxX-x),depth=Math.min(tileSize,maxZ-z),cx=x+width/2,cz=z+depth/2,id=`terrain:${x}:${z}`;
    manager.register({id,bounds:{minX:x,maxX:x+width,minZ:z,maxZ:z+depth},create:()=>{
      const geometry=new THREE.PlaneGeometry(width,depth,segments,segments);geometry.rotateX(-Math.PI/2);geometry.userData.terrainTile=true;
      const positions=geometry.attributes.position,colors=[];
      for(let i=0;i<positions.count;i++){
        const wx=positions.getX(i)+cx,wz=positions.getZ(i)+cz;positions.setY(i,heightAt(wx,wz));geometry.attributes.uv.setXY(i,wx/4,wz/4);
        const wave=Math.sin(wx*12.9898+wz*78.233)*43758.5453,n=.85+(wave-Math.floor(wave))*.15;colors.push(n*.94,n,n*.91);
      }
      geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.computeVertexNormals();
      const mesh=new THREE.Mesh(geometry,material);mesh.position.set(cx,0,cz);mesh.receiveShadow=true;mesh.userData.ground=true;mesh.userData.terrainTile=true;return mesh;
    }});ids.push(id);
  }
  return ids;
}

/** Keep the entire optical corridor resident, not just the far reveal. This is
 * also used to prewarm the target before magnification starts. */
export function streamingViewpoints(player,scopeTarget=null){
  const points=[{x:player.x,z:player.z}];if(!validPoint(scopeTarget))return points;
  const distance=Math.hypot(scopeTarget.x-player.x,scopeTarget.z-player.z),steps=Math.max(1,Math.ceil(distance/12));
  for(let i=1;i<=steps;i++)points.push({x:player.x+(scopeTarget.x-player.x)*i/steps,z:player.z+(scopeTarget.z-player.z)*i/steps,radius:18,pin:i===steps?2:1});
  return points;
}
