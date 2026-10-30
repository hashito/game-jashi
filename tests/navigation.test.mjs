import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import {MountainWorld} from '../dist/world.js';
import {SoftwareRenderer} from '../dist/software-renderer.js';
import {WORLD_BOUNDS,SPAWN,LANDMARKS,LORE_PLACEMENTS,BUILDINGS,DOORS,TRAILS,PARKING,FLOORS,STAIRS,BALCONY,REVEAL_POINT,COMPANION_START,COMPANION_EXIT,COVER_PATCHES} from '../dist/layout.js';

// Only browser and raster APIs are replaced. Geometry, furniture, collision,
// dynamic gate and A* are built by the same MountainWorld used in the game.
const noop=()=>{};
function canvas(){const context=new Proxy({createLinearGradient:()=>({addColorStop:noop}),createRadialGradient:()=>({addColorStop:noop}),createPattern:()=>({})},{get:(o,k)=>k in o?o[k]:noop});return {width:512,height:160,style:{},setAttribute:noop,getContext:()=>context};}
Object.assign(globalThis,{innerWidth:1280,innerHeight:720,devicePixelRatio:1,addEventListener:noop,document:{createElement:canvas}});
const renderer={shadowMap:{},setPixelRatio:noop,setSize:noop,render:noop,domElement:canvas()};
const textureLoader={load(_url,onLoad){const t=new THREE.Texture({width:1024,height:1024});queueMicrotask(()=>onLoad?.(t));return t;}};
const world=new MountainWorld({append:noop},{renderer,textureLoader});
// Reachability below describes the traversable floor plan. Door collision,
// operating it from both sides and closed-door planning are in buildings.test.
world.restoreDoors(Object.fromEntries(DOORS.map(door=>[door.id,true])));

function assertRoute(start,end,reason){
  const route=world.findPath(start,end);assert.ok(route.length,`${reason}: route exists`);
  let prev=start;for(const p of route){assert.ok(world.isSegmentFree(prev,p,.3),`${reason}: no wall crossing at ${JSON.stringify(p)}`);prev=p;}
  assert.ok(Math.hypot(prev.x-end.x,prev.z-end.z)<.04,`${reason}: route ends at the requested point`);return route;
}
function reachableApproach(item){
  const candidates=[{x:item.x,z:item.z,level:item.level??0}];
  for(const r of [.65,1,1.5,2.1])for(let i=0;i<16;i++)candidates.push({x:item.x+Math.cos(i*Math.PI/8)*r,z:item.z+Math.sin(i*Math.PI/8)*r,level:item.level??0});
  return candidates.find(p=>world.isFreeAt(p,.34)&&!world.isBlocked(p,item)&&world.findPath(SPAWN,p).length);
}

test('shared layout corresponds to visible items and clear entrances',()=>{
  assert.ok(world.isFreeAt(SPAWN));assert.equal(SPAWN.level,1);assert.equal(LANDMARKS.telescope.level,1);
  for(const [id,p] of Object.entries(LANDMARKS)){assert.equal(world.items[id]?.x,p.x,`${id} x`);assert.equal(world.items[id]?.z,p.z,`${id} z`);assert.equal(world.items[id].level,p.level);}
  for(const p of LORE_PLACEMENTS){assert.ok(world.items[p.id]?.mesh,`${p.id} has a physical model`);assert.equal(world.items[p.id].x,p.x);assert.equal(world.items[p.id].z,p.z);}
  for(const b of BUILDINGS){assertRoute(SPAWN,b.entrance,`${b.id} entrance`);assert.ok(world.isFree(b.entrance.x-.45,b.entrance.z,.34),`${b.id} entrance left clearance`);assert.ok(world.isFree(b.entrance.x+.45,b.entrance.z,.34),`${b.id} entrance right clearance`);}
  assert.ok(TRAILS.every(p=>p.width>=2.6));
});

test('every main and optional object has a reachable, unoccluded interaction position',()=>{
  world.setGateOpen(false);
  for(const [id,item] of Object.entries(world.items)){if(id==='car')continue;const approach=reachableApproach(item);assert.ok(approach,`${id} must be reachable within interaction range`);assertRoute(SPAWN,approach,id);assert.ok(Math.hypot(approach.x-item.x,approach.z-item.z)<=2.2);}
});

test('closed parking cannot be bypassed; opening the gate creates the escape route',()=>{
  world.setGateOpen(false);const car=LANDMARKS.car;
  assert.equal(world.findPath(SPAWN,car).length,0,'no route from the forest to the enclosed car');
  assert.ok(world.isBlocked({x:-14.8,z:22},{x:-19,z:22}),'closed gate blocks sight and movement');
  for(const edge of [{x:PARKING.minX,z:23},{x:-27,z:PARKING.minZ},{x:-27,z:PARKING.maxZ},{x:PARKING.maxX,z:26}])assert.equal(world.isFree(edge.x,edge.z,.34),false,'each fence side is solid');
  const before={x:-15.5,z:22};world.move(before,-5,0);assert.equal(before.x,-15.5,'large movement cannot tunnel through gate');
  world.setGateOpen(true);assert.ok(!world.isBlocked({x:-14.8,z:22},{x:-19,z:22}));
  assertRoute(SPAWN,car,'open gate escape');
  const after={x:-15.5,z:22};world.move(after,-5,0);assert.equal(after.x,-20.5);
  world.setGateOpen(false);assert.equal(world.findPath(SPAWN,car).length,0,'closing invalidates the route without stale A* edges');
});

test('thin walls occlude and route around their ends; every A* edge is swept',()=>{
  const a={x:5.2,z:20.2},b={x:7,z:20.2};assert.ok(world.isBlocked(a,b),'cabin wall occludes');assert.equal(world.isSegmentFree(a,b),false);
  const p={...a};world.move(p,b.x-a.x,0);assert.equal(p.x,a.x,'wall tunneling is rejected');
  assertRoute(a,b,'route around cabin doorway and corner');
  assert.equal(world.isFree(WORLD_BOUNDS.minX-1,0),false);
  assert.equal(world.isFree(0,WORLD_BOUNDS.maxZ+1),false);
});

test('shared trails are traversable and main corridors preserve their designed width',()=>{
  world.setGateOpen(true);
  for(const trail of TRAILS)for(let i=1;i<trail.points.length;i++){const a={x:trail.points[i-1][0],z:trail.points[i-1][1]},b={x:trail.points[i][0],z:trail.points[i][1]};assert.ok(world.isSegmentFree(a,b,.3),`${trail.id} segment ${i} intersects a collider`);
    // Inside the parking lot the gravel continues underneath the parked car.
    // Its driver-door approach stays clear, while every corridor outside is full-width.
    if(trail.id==='road'&&a.x<=PARKING.maxX)continue;
    // Outdoor trails stay broad; physical room doorways deliberately narrow to
    // 1.8–2 m. Their center route is still checked immediately above.
    if(BUILDINGS.some(building=>[a,b].some(p=>Math.abs(p.x-building.x)<=building.w/2&&Math.abs(p.z-building.z)<=building.d/2)))continue;
    const dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz),offset=trail.width/2-.34;
    for(const side of [-1,1]){const ox=dz/length*offset*side,oz=-dx/length*offset*side;assert.ok(world.isSegmentFree({x:a.x+ox,z:a.z+oz},{x:b.x+ox,z:b.z+oz},.3),`${trail.id} segment ${i} loses ${trail.width} m corridor width`);}
  }
  world.setGateOpen(false);
});

test('Canvas2D repeats negative UVs with the texture transform and caches the pattern',()=>{
  const sr=new SoftwareRenderer(),draws=[],transforms=[];let patterns=0;
  const ctx={save:noop,restore:noop,beginPath:noop,moveTo:noop,lineTo:noop,closePath:noop,clip:noop,createPattern:(_image,repeat)=>{patterns++;assert.equal(repeat,'repeat');return {};},setTransform:(...m)=>transforms.push(m),fillRect:(...r)=>draws.push(r),drawImage:()=>assert.fail('repeating material must not clamp to one bitmap')};
  const texture=new THREE.Texture({width:32,height:32});texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(2,3);texture.offset.set(.2,.1);
  const points=[{x:0,y:0,u:-2,v:-1},{x:80,y:0,u:1,v:-1},{x:0,y:80,u:-2,v:2}];
  sr._texture(ctx,texture,points);sr._texture(ctx,texture,points);
  assert.equal(patterns,1);assert.equal(draws.length,2);assert.ok(draws[0][0]<0&&draws[0][2]>32);assert.ok(transforms.flat().every(Number.isFinite));
});

test('Canvas2D paints distant mountain bases before nearby terrain',()=>{
  const sr=new SoftwareRenderer(),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(68,1.6,.08,100),paint=[];
  scene.background=new THREE.Color('#000');camera.position.set(0,2,8);camera.lookAt(0,0,-10);
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(40,40,4,4).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({color:'#ff0000'}));ground.userData.ground=true;scene.add(ground);
  const mountain=new THREE.Mesh(new THREE.ConeGeometry(8,20,7),new THREE.MeshBasicMaterial({color:'#0000ff'}));mountain.position.set(0,-1,-12);mountain.userData.skyline=true;scene.add(mountain);
  let polygon=[];sr.context.beginPath=()=>{polygon=[];};sr.context.moveTo=(x,y)=>{polygon=[[x,y]];};sr.context.lineTo=(x,y)=>polygon.push([x,y]);
  sr.context.fill=()=>{const area=Math.abs(polygon.reduce((sum,p,i)=>{const q=polygon[(i+1)%polygon.length];return sum+p[0]*q[1]-q[0]*p[1];},0))/2;if(area>.01)paint.push(sr.context.fillStyle);};sr.render(scene,camera);
  const blue=paint.map((c,i)=>/^rgb\(0,0,[1-9]/.test(c)?i:-1).filter(i=>i>=0),red=paint.map((c,i)=>/^rgb\([1-9][0-9]*,0,0\)/.test(c)?i:-1).filter(i=>i>=0);
  assert.ok(blue.length&&red.length,'actual skyline and floor faces are rasterized');assert.ok(Math.max(...blue)<Math.min(...red),'subsurface mountain triangles cannot overpaint the nearby ground');
});

test('CPU mountain silhouettes retain every face beyond the ordinary woodland detail distance',()=>{
  const sr=new SoftwareRenderer(),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(40,1.6,.08,155),paint=[];
  scene.background=new THREE.Color('#000');scene.fog=new THREE.FogExp2('#000',.003);camera.position.y=5;camera.lookAt(0,0,-85);
  const mountain=new THREE.Mesh(new THREE.ConeGeometry(12,28,7),new THREE.MeshBasicMaterial({color:'#0000ff',side:THREE.DoubleSide}));mountain.position.z=-85;mountain.userData.skyline=true;scene.add(mountain);
  let polygon=[];sr.context.beginPath=()=>{polygon=[];};sr.context.moveTo=(x,y)=>{polygon=[[x,y]];};sr.context.lineTo=(x,y)=>polygon.push([x,y]);
  sr.context.fill=()=>{const area=Math.abs(polygon.reduce((sum,p,i)=>{const q=polygon[(i+1)%polygon.length];return sum+p[0]*q[1]-q[0]*p[1];},0))/2;if(area>.01)paint.push(sr.context.fillStyle);};sr.render(scene,camera);
  assert.equal(paint.filter(c=>/^rgb\(0,0,[1-9]/.test(c)).length,14,'all seven sides and seven base triangles survive the 52 m woodland cutoff');
  mountain.userData.skyline=false;paint.length=0;sr.render(scene,camera);assert.equal(paint.length,0,'ordinary distant meshes still obey their performance budget');
  mountain.position.z=-60;mountain.scale.setScalar(.2);camera.lookAt(0,0,-60);camera.fov=6;camera.updateProjectionMatrix();paint.length=0;sr.render(scene,camera);assert.ok(paint.length>=14,'the optical view includes complete boundary rocks and terrain behind the 46 m reveal point');
});

test('CPU torch highlights preserve skin hue and warm light instead of whitening each channel',()=>{
  const sr=new SoftwareRenderer(),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(68,1.6,.08,100),paint=[];
  scene.background=new THREE.Color('#000');camera.position.z=3;sr.toneMappingExposure=1.6;
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.MeshStandardMaterial({color:'#b9aa8e'})));
  scene.add(new THREE.SpotLight('#fff2cf',32));const lantern=new THREE.PointLight('#ffd38e',9,8);lantern.position.z=2;scene.add(lantern);
  sr.context.fill=()=>{const match=/^rgb\((\d+),(\d+),(\d+)\)$/.exec(sr.context.fillStyle);if(match)paint.push(match.slice(1).map(Number));};sr.render(scene,camera);
  assert.ok(paint.length>=2);for(const [r,g,b]of paint){assert.ok(r<255,'the torch highlight is compressed');assert.ok(r/g>1.08,'red-to-green skin warmth survives the highlight shoulder');assert.ok(g/b>1.17,'the darker blue channel retains the original skin saturation');}
});

test('cedar needles retain transparent holes through CPU lighting, fog and projection',()=>{
  assert.equal((world.forest.boughs.geometry??world.forest.boughs.meshes[0].geometry).type,'PlaneGeometry','individual needle branches replace solid cloud-shaped crowns');
  assert.ok(world.forest.boughs.material.alphaTest>0);assert.equal(world.boughTexture.wrapS,THREE.ClampToEdgeWrapping);
  const sr=new SoftwareRenderer(),texture=new THREE.Texture({width:2,height:1});texture.userData.cutout=true;
  const pixels=new Uint8ClampedArray([200,230,210,0,40,80,30,255]);
  sr._textures.set(texture,{source:texture.image,image:texture.image,pixels,average:[40,80,30],variants:new Map(),frame:-1,pattern:null,patternContext:null});
  const oldCreate=document.createElement;
  document.createElement=()=>{const c=canvas(),context=c.getContext('2d');context.createImageData=(w,h)=>({data:new Uint8ClampedArray(w*h*4)});context.putImageData=data=>{c.rgba=data.data;};return c;};
  try{
    const bitmap=sr._cutoutTexture(texture,[255,255,255],.6,.5,[30,40,50],.18);
    assert.deepEqual([...bitmap.rgba],[0,0,0,0,27,44,34,255],'fog colors only the actual needles, never their transparent surroundings');
    assert.equal(sr._cutoutTexture(texture,[255,255,255],.6,.5,[30,40,50],.18),bitmap,'lighting buckets reuse their prepared image');
    const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(68,1.6,.08,100);scene.fog=new THREE.FogExp2('#29363c',.04);camera.position.z=5;
    const card=new THREE.Mesh(new THREE.PlaneGeometry(3,3),new THREE.MeshStandardMaterial({map:texture,alphaTest:.18,side:THREE.DoubleSide}));scene.add(card);
    let solidFills=0,bitmapDraws=0;sr.context.fill=()=>solidFills++;sr.context.drawImage=()=>bitmapDraws++;sr.render(scene,camera);
    assert.ok(bitmapDraws>=2,'both projected triangles use the prepared transparent bitmap');assert.equal(solidFills,0,'no opaque base, darkening or fog polygon can fill a needle gap');
  }finally{document.createElement=oldCreate;}
});

test('upper shutters cut the mountain sightline while the ground-floor exit stays usable',()=>{
  const balcony={x:0,z:18.2,level:1},room={x:0,z:20,level:1};
  world.setShutterClosed(false);assert.ok(!world.isBlocked(balcony,room));assert.ok(world.isSegmentFree(balcony,room));
  world.setShutterClosed(true);assert.ok(world.isBlocked(balcony,room));assert.equal(world.isSegmentFree(balcony,room),false);
  assert.ok(world.isSegmentFree({...balcony,level:0},{...room,level:0}),'closing an upper shutter cannot block the lower front door');
  for(const approach of [{x:1.3,z:18.25,level:1},{x:1.3,z:20.1,level:1}]){assert.ok(world.isFreeAt(approach));assert.ok(Math.hypot(approach.x-LANDMARKS.shutter.x,approach.z-LANDMARKS.shutter.z)<2.2,'the same pull handle can be reached from either side');}
  world.setShutterClosed(false);assert.ok(world.isSegmentFree(balcony,room));
});

test('bell cover breaks sight without closing the west escape loop',()=>{
  const bell=LANDMARKS.bell;
  for(const p of COVER_PATCHES){assert.ok(world.colliders.some(c=>c.id===p.id&&c.w===p.w&&c.d===p.d));assert.ok(world.isBlocked({x:p.x-p.w/2-1,z:p.z},{x:p.x+p.w/2+1,z:p.z}),`${p.id} blocks an eye-level gaze`);}
  const hide={x:-18.8,z:-7,level:0};assert.ok(world.isBlocked(bell,hide));assertRoute(bell,hide,'bell to timber cover');assertRoute(hide,{x:-10,z:-13},'timber cover to the far side of the west loop');
  const returnTrail=TRAILS.find(t=>t.id==='east-return');assert.ok(returnTrail,'the east area has a return route');assertRoute({x:11,z:-10},{x:0,z:4},'eastern return loop');
});

test('Shuji is visible at the opening, walks the actual stairs, and stays gone on restore',()=>{
  const base={pos:SPAWN,yaw:SPAWN.yaw,pitch:0,active:false};world.update({...base,time:0,companionState:'present',companionSpeaking:true});
  assert.ok(world.companion.visible);assert.deepEqual(world.companionPos,COMPANION_START);
  const facing=new THREE.Vector3();world.camera.getWorldDirection(facing);const toShuji=new THREE.Vector3(COMPANION_START.x-SPAWN.x,0,COMPANION_START.z-SPAWN.z).normalize();assert.ok(facing.dot(toShuji)>.99,'the opening camera actually faces the person who is speaking');
  let last=world.actorHeight(world.companionPos),maxStep=0,sawLower=false,sawProgress=false;
  for(let i=1;i<=960;i++){world.update({...base,time:i*.05,companionState:i<340?'leaving':'away'});const height=world.actorHeight(world.companionPos);maxStep=Math.max(maxStep,Math.abs(height-last));last=height;sawLower ||= world.companionPos.level===0&&world.companion.visible;sawProgress ||= world.companionPos.z<18&&world.companion.visible;}
  assert.ok(sawLower&&sawProgress,'Shuji physically descends and walks outside before disappearing');assert.ok(maxStep<.15,'the companion never teleports between storeys');
  assert.equal(world.companionState,'away');assert.equal(world.companion.visible,false);assert.ok(Math.hypot(world.companionPos.x-COMPANION_EXIT.at(-1).x,world.companionPos.z-COMPANION_EXIT.at(-1).z)<.08);
  world.update({...base,time:0,companionState:'present'});assert.ok(world.companion.visible);assert.deepEqual(world.companionPos,COMPANION_START,'a new game restores the actual starting actor');
  world.update({...base,time:.05,companionState:'away'});assert.equal(world.companion.visible,false,'restoring after the encounter does not respawn the uncle upstairs');
  world.update({...base,time:0,companionState:'present'});
});

test('attack poses and thrown bottle animate in the real scene without changing creature location',()=>{
  const state={pos:SPAWN,yaw:SPAWN.yaw,pitch:0,time:1,monster:{x:0,z:12},active:true,attackPhase:'windup',attackProgress:.8};
  world.update(state);const raised=world.arms[1].rotation.x;world.update({...state,time:1.2,attackPhase:'strike',attackProgress:.8});assert.ok(world.arms[1].rotation.x>raised+2);assert.equal(world.creature.position.x,0);assert.equal(world.creature.position.z,12);
  world.throwRepellent({x:0,z:12});world.update({...state,time:1.4});assert.ok(world.projectile.visible);assert.ok(world.projectile.position.distanceTo(world.camera.position)>.2);
  world.update({...state,time:1.9,attackPhase:'stunned'});assert.ok(world.splash.visible);assert.ok(world.arms[0].rotation.x<-2);
  world.triggerScare('window');world.update({...state,time:2});assert.ok(world.windowFigure.visible);assert.equal(world.creature.position.z,12);
  world.update({...state,time:0,active:false,gateOpen:false});assert.deepEqual(world._scares,{});assert.equal(world._throw,null);assert.equal(world.projectile.visible,false);assert.equal(world.splash.visible,false);assert.equal(world.windowFigure.visible,false);assert.equal(world.gateLift,0);
});


test('two real floors connect continuously through the stairwell in both directions',()=>{
  const upper={...SPAWN},lower={x:0,z:17,level:0};
  for(const [from,to]of [[upper,lower],[lower,upper]]){
    const route=assertRoute(from,to,'two floor route'),actor={...from};let lastHeight=world.actorHeight(actor),maxStep=0;
    for(const waypoint of route){let guard=0;while(Math.hypot(actor.x-waypoint.x,actor.z-waypoint.z)>.025&&guard++<1000){const d=Math.hypot(waypoint.x-actor.x,waypoint.z-actor.z),step=Math.min(.08,d);world.move(actor,(waypoint.x-actor.x)/d*step,(waypoint.z-actor.z)/d*step,.3);const h=world.actorHeight(actor);maxStep=Math.max(maxStep,Math.abs(h-lastHeight));lastHeight=h;}assert.ok(guard<1000,'the actual movement function follows every navigation waypoint');}
    assert.equal(actor.level,to.level);assert.ok(Math.hypot(actor.x-to.x,actor.z-to.z)<.04);assert.ok(maxStep<.13,'no teleporting elevation step');
  }
  assert.ok(Math.abs(world.actorHeight(upper)-world.actorHeight({...upper,level:0})-FLOORS[1].height)<.001);
  assert.equal(world.actorHeight({x:0,z:17.8,level:1}),world.actorHeight(upper),'the balcony stays level with the upstairs floor above sloping terrain');
  const side={x:STAIRS.x+STAIRS.width/2+.5,z:24,level:1},before={...side};world.move(side,-1.1,0);assert.deepEqual(side,before,'stairwell side wall prevents walking into midair');
  const edge={x:0,z:BALCONY.minZ+.5,level:1};world.move(edge,0,-2);assert.ok(edge.z>BALCONY.minZ,'balcony front rail prevents falling');
});

test('floor slabs block vertical sight while the upper balcony has a real mountain sightline',()=>{
  const below={x:1,z:24,level:0},above={x:1,z:24,level:1};assert.ok(world.isBlocked(below,above),'solid floor blocks a gaze or hit from below');
  const scope={x:LANDMARKS.telescope.x,z:LANDMARKS.telescope.z+.5,level:1};assert.equal(world.isBlocked(scope,REVEAL_POINT),false,'no decorative tree, railing or invisible wall blocks the telescope view');
  assert.equal(world.isSegmentFree({...scope},{...scope,level:0}),false,'same coordinates are not an elevator');
  assertRoute(SPAWN,{x:0,z:18.3,level:1},'walk to upper balcony');
});

test('scope uses the actual upper viewpoint and turns head, shoulders and body before restoring normal view',()=>{
  const state={pos:SPAWN,yaw:SPAWN.yaw,pitch:0,time:10,monster:REVEAL_POINT,active:false};
  world.update({...state,scope:{phase:0,progress:1,target:REVEAL_POINT}});const back=world.creature.rotation.y;assert.equal(world.creature.visible,true,'the distant creature already exists in the opening optical view');assert.equal(world.hand.visible,false);assert.equal(world.items.telescope.mesh.visible,false,'the instrument lens cannot cover its own optical view');assert.ok(world.camera.fov<=20);assert.ok(world.camera.position.y>4.8);
  const scopeFog=world.scene.fog.density,fogAtTarget=1-Math.exp(-Math.pow(scopeFog*46,2));assert.ok(fogAtTarget>.55&&fogAtTarget<.7,'optical fog leaves the moving silhouette readable at 46 m');
  world.update({...state,time:10.25,scope:{phase:1,progress:.5,target:REVEAL_POINT}});assert.ok(world.creature.visible,'the white back appears in the second beat');
  world.update({...state,time:10.5,scope:{phase:2,progress:.25,target:REVEAL_POINT}});assert.ok(Math.abs(world.head.rotation.y)>.2);assert.ok(Math.abs(world.creature.rotation.y-back)<.2,'head turns before hips');
  const earlierFov=world.camera.fov;world.update({...state,time:10.75,scope:{phase:2,progress:.5,target:REVEAL_POINT}});assert.ok(world.camera.fov<earlierFov&&world.camera.fov>6,'optical magnification progresses smoothly while the body turns');
  world.update({...state,time:11,scope:{phase:2,progress:.75,target:REVEAL_POINT}});assert.equal(world.camera.fov,6,'the final 1.5 seconds hold the magnified face steady');
  world.update({...state,time:11.5,scope:{phase:2,progress:1,target:REVEAL_POINT}});assert.ok(Math.abs(world.creature.rotation.y-back)>3,'body completes the turn without changing position');assert.equal(world.creature.position.x,REVEAL_POINT.x);assert.equal(world.creature.position.z,REVEAL_POINT.z);
  assert.equal(world.camera.fov,6);
  world.update({...state,time:12,active:true,scope:null});assert.equal(world.camera.fov,68);assert.ok(world.scene.fog.density>scopeFog*2&&world.scene.fog.density>=.055,'ordinary woodland has substantially denser fog');assert.equal(world.hand.visible,true);assert.equal(world.items.telescope.mesh.visible,true,'the physical telescope is restored when leaving the eyepiece');
});

test('enemy pose follows measured travel and explicit gaze, including a low four-limbed approach',()=>{
  const state={pos:{x:0,z:12,level:0},yaw:0,pitch:-.5,time:20,monster:{x:0,z:7,level:0},active:true,enemyVisual:{mode:'watch',heading:.7,headYaw:-.4,gait:1.2,speed:0,crouch:0,headPitch:.1}};
  world.update(state);assert.equal(world.creature.rotation.y,.7);assert.equal(world.head.rotation.y,-.4);const still=world.legs[0].rotation.x;world.update({...state,time:20.1});assert.ok(Math.abs(world.legs[0].rotation.x)<=Math.abs(still)+.001,'stationary watch does not walk in place');
  for(let i=1;i<=20;i++)world.update({...state,time:20.1+i*.1,enemyVisual:{...state.enemyVisual,mode:'stalk',crouch:1,speed:1,gait:i*.25}});
  assert.ok(world.eyePosition().y-world.actorHeight(state.monster)<1.1,'the eye moves down toward a lowered flashlight');assert.ok(world.arms[0].rotation.x<-1,'free hand reaches toward the ground');
});


test('Canvas2D telescope retains bitmap face detail at the actual distant viewpoint',()=>{
  const sr=new SoftwareRenderer(),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(68,1.6,.08,100),texture=new THREE.Texture({width:128,height:128});
  const face=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.MeshBasicMaterial({color:'#ffffff',map:texture}));face.position.z=-46;scene.add(face);let textured=0;sr._texture=()=>textured++;
  sr.render(scene,camera);assert.equal(textured,0,'normal wide view keeps the CPU distance budget');
  camera.fov=12;camera.updateProjectionMatrix();sr.render(scene,camera);assert.ok(textured>0,'magnified distant face uses its generated texture');
});


test('crouching hands remain above the real floor while the eye follows a low flashlight',()=>{
  let time=100;const monster={x:0,z:7,level:0};
  for(const mode of ['stalk','hunt','watch'])for(const crouch of [.2,.5,.8,1]){
    const visual={mode,heading:0,headYaw:0,headPitch:0,crouch,lean:(mode==='hunt'?.21:.065)+crouch*.22,speed:1,gait:0};
    for(let i=0;i<80;i++){time+=.05;visual.gait=i*.2;world.update({pos:{x:0,z:12,level:0},yaw:0,pitch:-.7,time,monster,active:true,enemyVisual:visual});}
    for(const arm of world.arms)for(const finger of arm.children.filter(mesh=>mesh.geometry?.parameters?.radiusTop===.012)){
      const tip=finger.localToWorld(new THREE.Vector3(0,-finger.geometry.parameters.height/2,0));assert.ok(tip.y-world.actorHeight(monster)>-.015,`${mode} crouch ${crouch}: a fingertip cannot go underground`);
    }
  }
});
