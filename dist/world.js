import * as THREE from './vendor/three.module.js';
import { SoftwareRenderer } from './software-renderer.js';
import {buildCreature,updateCreatureDetails} from './creature.js';
import {WORLD_BOUNDS,SPAWN,LANDMARKS,TRAILS,BUILDINGS,PARKING,BRIDGE,FLOORS,STAIRS,BALCONY,CABIN_WINDOW,REVEAL_POINT,LORE_PLACEMENTS,MAP_ZONES,COVER_PATCHES,COMPANION_START,COMPANION_EXIT,distanceToTrail,distanceToSegment} from './layout.js';
export {LANDMARKS} from './layout.js';
let seed=82471;
const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
const mat=(color,extra={})=>new THREE.MeshStandardMaterial({color,roughness:.96,...extra});
const bark=mat('#b2b0a5'),stone=mat('#68716c'),wood=mat('#b9b5a7'),iron=mat('#535954',{metalness:.65,roughness:.7});
const baseHeight=(x,z)=>Math.sin(x*.085)*.38+Math.sin(z*.13)*.27+Math.sin(x*.22+z*.15)*.10;
const terrainY=(x,z)=>{let height=baseHeight(x,z);for(const b of BUILDINGS){const d=Math.max(Math.abs(x-b.x)-b.w/2,Math.abs(z-b.z)-b.d/2);if(d<1.6){const f=Math.max(0,Math.min(1,d/1.6));height=baseHeight(b.x,b.z)*(1-f)+height*f;}}return height;};

// Slab intersection tests the whole segment, including the ends of long, thin
// walls. Expanding the box also makes this a swept-circle navigation test.
function segmentHitsBox(a,b,c,margin=0){
  let enter=0,leave=1;
  for(const [axis,size] of [['x','w'],['z','d']]){
    const lo=c[axis]-c[size]/2-margin,hi=c[axis]+c[size]/2+margin;
    const origin=a[axis],delta=b[axis]-origin;
    if(Math.abs(delta)<1e-9){if(origin<lo||origin>hi)return false;continue;}
    let t0=(lo-origin)/delta,t1=(hi-origin)/delta;
    if(t0>t1)[t0,t1]=[t1,t0];
    enter=Math.max(enter,t0);leave=Math.min(leave,t1);
    if(enter>leave)return false;
  }
  return true;
}

function segmentHitsVolume(a,b,c,margin=0){
  let enter=0,leave=1;
  for(const [axis,size]of [['x','w'],['z','d'],['y','h']]){
    const lo=axis==='y'?c.bottom:c[axis]-c[size]/2-margin,hi=axis==='y'?c.bottom+c.h:c[axis]+c[size]/2+margin;
    const origin=a[axis],delta=b[axis]-origin;
    if(Math.abs(delta)<1e-9){if(origin<lo||origin>hi)return false;continue;}
    let t0=(lo-origin)/delta,t1=(hi-origin)/delta;if(t0>t1)[t0,t1]=[t1,t0];enter=Math.max(enter,t0);leave=Math.min(leave,t1);if(enter>leave)return false;
  }
  return true;
}

export class MountainWorld {
  constructor(container,options={}) {
    seed=82471;this.options=options;this.colliders=[];this.slabs=[];this.items={};this.flickers=[];this._time=0;this._scares={};this.gateOpen=false;
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#263039');
    this.scene.fog=new THREE.FogExp2('#29363c',.034);
    this.camera=new THREE.PerspectiveCamera(68,innerWidth/innerHeight,.08,155);
    this.camera.rotation.order='YXZ';
    try{this.renderer=options.renderer||new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});}
    catch{this.renderer=new SoftwareRenderer();}
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,options.quality==='low'?1:1.6));
    this.renderer.setSize(innerWidth,innerHeight);this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.05;
    this.renderer.shadowMap.enabled=options.quality!=='low';this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    this.renderer.domElement.setAttribute('aria-label','霧の山を探索する一人称3D画面');
    container.append(this.renderer.domElement);this.canvas=this.renderer.domElement;
    this.scene.add(new THREE.HemisphereLight('#9dabb7','#242a21',1.3));
    const moon=new THREE.DirectionalLight('#b7c5d1',1.0);moon.position.set(-22,36,-30);moon.castShadow=true;
    moon.shadow.mapSize.set(1024,1024);Object.assign(moon.shadow.camera,{left:-35,right:35,top:35,bottom:-35,near:1,far:100});
    moon.shadow.bias=-.001;this.scene.add(moon);
    this.loadMaterials();this.createTerrain();this.createPaths();this.createForest();this.createRocks();this.createCabin();this.createShed();this.createShelter();this.createCar();this.createParking();this.createObjects();this.createLore();this.createZoneLandmarks();this.createGimmicks();this.createCompanion();this.createDust();this.createCreature();this.createScares();
    this.flashlight=new THREE.SpotLight('#fff2cf',32,28,.49,.67,1.25);this.flashlightTarget=new THREE.Object3D();this.flashlight.target=this.flashlightTarget;
    this.scene.add(this.flashlight,this.flashlightTarget);
    this.handlight=new THREE.PointLight('#efd9aa',.5,3);this.scene.add(this.handlight);
    this.createHand();this.scene.add(this.camera);
    this.resize=()=>{this.camera.aspect=innerWidth/innerHeight;this.camera.updateProjectionMatrix();this.renderer.setSize(innerWidth,innerHeight);};
    addEventListener('resize',this.resize);
  }
  mesh(geometry,material,x,y,z,parent=this.scene){const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);m.receiveShadow=true;parent.add(m);return m;}
  box(w,h,d,material,x,y,z,parent=this.scene){const mapped=material?.map?.wrapS===THREE.RepeatWrapping,g=new THREE.BoxGeometry(w,h,d,mapped?Math.max(1,Math.ceil(w/3)):1,mapped?Math.max(1,Math.ceil(h/3)):1,mapped?Math.max(1,Math.ceil(d/3)):1);if(mapped){const p=g.attributes.position,n=g.attributes.normal,uv=g.attributes.uv;for(let i=0;i<p.count;i++){const ax=Math.abs(n.getX(i)),ay=Math.abs(n.getY(i));uv.setXY(i,ax>.5?p.getZ(i)*.6:p.getX(i)*.6,ay>.5?p.getZ(i)*.6:p.getY(i)*.6);}}return this.mesh(g,material,x,y,z,parent);}
  obstacle(x,z,w,d,h=3,id=null,bottom=null){const c={x,z,w,d,h,id,bottom:bottom??terrainY(x,z),enabled:true};this.colliders.push(c);return c;}
  inStairs(pos,margin=0){return Math.abs(pos.x-STAIRS.x)<=STAIRS.width/2-margin&&pos.z>=STAIRS.minZ&&pos.z<=STAIRS.maxZ;}
  ground(x,z,level=0){if(this.inStairs({x,z}))return terrainY(0,24)+STAIRS.rise*(z-STAIRS.minZ)/(STAIRS.maxZ-STAIRS.minZ);return level===1?terrainY(0,24)+FLOORS[1].height:terrainY(x,z);}
  actorHeight(pos){return this.ground(pos.x,pos.z,pos.level??0);}
  upstairsContains(x,z,r=0){const b=FLOORS[1].bounds;return (x>=b.minX+r&&x<=b.maxX-r&&z>=b.minZ&&z<=b.maxZ-r)||(x>=BALCONY.minX+r&&x<=BALCONY.maxX-r&&z>=BALCONY.minZ+r&&z<=BALCONY.maxZ);}
  loadMaterials(){
    const loader=this.options.textureLoader||new THREE.TextureLoader();this.textureStatus={};
    const load=(name,repeat=[1,1])=>{const texture=loader.load(`./assets/textures/${name}.webp`,()=>{this.textureStatus[name]='ready';},undefined,()=>{this.textureStatus[name]='failed';});texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(...repeat);texture.anisotropy=4;this.textureStatus[name]='loading';return texture;};
    this.floorTexture=load('forest-floor');this.woodTexture=load('weathered-wood');this.barkTexture=load('cedar-bark',[1,9]);
    this.boughTexture=loader.load('./assets/textures/cedar-bough-v4.png',()=>{this.textureStatus['cedar-bough-v4']='ready';},undefined,()=>{this.textureStatus['cedar-bough-v4']='failed';});
    this.boughTexture.colorSpace=THREE.SRGBColorSpace;this.boughTexture.wrapS=this.boughTexture.wrapT=THREE.ClampToEdgeWrapping;this.boughTexture.userData.cutout=true;this.textureStatus['cedar-bough-v4']='loading';
    this.boughMaterial=mat('#d7dfd2',{map:this.boughTexture,side:THREE.DoubleSide,alphaTest:.18,roughness:1});
    wood.map=this.woodTexture;wood.bumpMap=this.woodTexture;wood.bumpScale=.025;wood.needsUpdate=true;
    bark.map=this.barkTexture;bark.bumpMap=this.barkTexture;bark.bumpScale=.035;bark.needsUpdate=true;
    this.floorMaterial=mat('#b5b7aa',{map:this.floorTexture,bumpMap:this.floorTexture,bumpScale:.03,vertexColors:true});
    this.pathMaterial=mat('#f1dfb6',{map:this.floorTexture,roughness:.92});
    this.trailMaterials={road:mat('#b9b7a8',{map:this.floorTexture}),timber:mat('#c7ad88',{map:this.floorTexture}),creek:mat('#a9b8ae',{map:this.floorTexture})};
  }
  createTerrain(){
    const geo=new THREE.PlaneGeometry(180,180,112,112);geo.rotateX(-Math.PI/2);const p=geo.attributes.position,c=[];
    const color=new THREE.Color();for(let i=0;i<p.count;i++){const x=p.getX(i),z=p.getZ(i);p.setY(i,terrainY(x,z));geo.attributes.uv.setXY(i,x/4,z/4);const n=.85+rand()*.15;color.setRGB(n*.94,n,n*.91);c.push(color.r,color.g,color.b);}
    geo.setAttribute('color',new THREE.Float32BufferAttribute(c,3));geo.computeVertexNormals();const floor=this.mesh(geo,this.floorMaterial,0,0,0);floor.userData.ground=true;
    for(let i=0;i<16;i++){const a=i/16*Math.PI*2,r=78+rand()*18;const hill=this.mesh(new THREE.ConeGeometry(22+rand()*15,25+rand()*23,7),mat('#334644'),Math.cos(a)*r,-1,Math.sin(a)*r);hill.rotation.y=rand()*6;hill.userData.skyline=true;}
  }
  createPaths(){
    for(const trail of TRAILS){const verts=[],uvs=[],indices=[];
      for(let j=1;j<trail.points.length;j++){const a=trail.points[j-1],b=trail.points[j],dx=b[0]-a[0],dz=b[1]-a[1],d=Math.hypot(dx,dz),steps=Math.ceil(d/1.4),nx=dz/d,nz=-dx/d,base=verts.length/3;
        for(let i=0;i<=steps;i++){const t=i/steps,cx=a[0]+t*dx,cz=a[1]+t*dz;for(const side of [-1,1]){const x=cx+nx*side*trail.width/2,z=cz+nz*side*trail.width/2;verts.push(x,terrainY(x,z)+.035,z);uvs.push(x/3,z/3);}if(i<steps){const k=base+i*2;indices.push(k,k+2,k+1,k+1,k+2,k+3);}}
      }
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.setIndex(indices);g.computeVertexNormals();const material=trail.id.includes('road')?this.trailMaterials.road:trail.id==='shed'||trail.id==='west-loop'?this.trailMaterials.timber:trail.id.includes('east')?this.trailMaterials.creek:this.pathMaterial;const m=this.mesh(g,material,0,0,0);m.userData.ground=true;m.userData.path=true;
    }
    // Dappled leaf litter and stones break up the clean path edges.
    const litter=new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1,0),mat('#6c6d57'),600);litter.userData.smallDetail=true;const dummy=new THREE.Object3D();
    for(let i=0;i<600;i++){const x=(rand()-.5)*64,z=(rand()-.5)*64;dummy.position.set(x,terrainY(x,z)+.035,z);dummy.scale.set(.04+rand()*.14,.025,.06+rand()*.16);dummy.rotation.set(0,rand()*6,0);dummy.updateMatrix();litter.setMatrixAt(i,dummy.matrix);}this.scene.add(litter);
    this.sign(-2.5,5,'← 物置　沢沿い →');this.sign(3,-18.8,'← 伐採跡　避難小屋 →');this.sign(-7.8,18.4,'← 駐車場　別荘 →');
    this.sign(-10.8,-10.5,'← 呼び鐘　沢 →',-.3);this.sign(10.4,-7.3,'← 別荘　避難小屋 →',.3);this.sign(-18,10.7,'林道工事中・徐行',.13);
  }
  createForest(){
    const trees=[];let attempts=0;
    while(trees.length<272&&attempts++<3000){const x=(rand()-.5)*106,z=(rand()-.5)*106;
      const nearBuilding=BUILDINGS.some(b=>Math.abs(x-b.x)<b.w/2+1.4&&Math.abs(z-b.z)<b.d/2+1.4);
      if(distanceToSegment(x,z,[LANDMARKS.telescope.x,LANDMARKS.telescope.z],[REVEAL_POINT.x,REVEAL_POINT.z])<2.5||distanceToTrail(x,z)<.95||nearBuilding||x>-34&&x<-15&&z>15.5&&z<30.5||LORE_PLACEMENTS.some(p=>Math.hypot(x-p.x,z-p.z)<1.5)||COVER_PATCHES.some(p=>Math.abs(x-p.x)<p.w/2+1&&Math.abs(z-p.z)<p.d/2+1))continue;
      if(trees.some(t=>Math.hypot(x-t.x,z-t.z)<1.7))continue;trees.push({x,z,h:10+rand()*13,r:.2+rand()*.24,angle:rand()*Math.PI*2});
    }
    const trunks=new THREE.InstancedMesh(new THREE.CylinderGeometry(.38,1,1,this.renderer.isSoftware?6:9),bark,trees.length);trunks.castShadow=true;trunks.receiveShadow=true;trunks.userData.trunks=true;
    // Each cedar has fifteen tapered, radial boughs. The transparent needle
    // texture is attached to individual vertical branches, never a solid crown.
    const boughGeometry=new THREE.PlaneGeometry(1,1);boughGeometry.translate(.5,-.5,0);
    const boughs=new THREE.InstancedMesh(boughGeometry,this.boughMaterial,trees.length*15);boughs.userData.foliage=true;boughs.userData.cedarBoughs=true;boughs.castShadow=true;
    const branches=new THREE.InstancedMesh(new THREE.CylinderGeometry(.025,.085,1,5),bark,trees.length*6);branches.userData.branches=true;
    const dummy=new THREE.Object3D(),axis=new THREE.Vector3(0,1,0),direction=new THREE.Vector3();
    trees.forEach((t,i)=>{const y=terrainY(t.x,t.z);dummy.position.set(t.x,y+t.h/2,t.z);dummy.scale.set(t.r,t.h,t.r);dummy.rotation.set((rand()-.5)*.012,t.angle,(rand()-.5)*.012);dummy.updateMatrix();trunks.setMatrixAt(i,dummy.matrix);
      for(let tier=0;tier<5;tier++)for(let side=0;side<3;side++){
        const a=t.angle+side*Math.PI*2/3+tier*.71,length=(2.6-tier*.39)*(.86+rand()*.25),height=t.h*(.38+tier*.125),droop=.35+rand()*.25;
        dummy.position.set(t.x,y+height,t.z);
        dummy.scale.set(length*1.35,1.52-tier*.16,1);dummy.rotation.set(.05,-a,-.16-tier*.025);dummy.updateMatrix();boughs.setMatrixAt(i*15+tier*3+side,dummy.matrix);
        if(tier<2){direction.set(Math.cos(a)*length,-droop*1.5,Math.sin(a)*length);dummy.position.set(t.x+direction.x*.45,y+height+direction.y*.45,t.z+direction.z*.45);dummy.quaternion.setFromUnitVectors(axis,direction.clone().normalize());dummy.scale.set(1,direction.length(),1);dummy.updateMatrix();branches.setMatrixAt(i*6+tier*3+side,dummy.matrix);}
      }
      if(Math.abs(t.x)<36&&t.z>-38&&t.z<34)this.obstacle(t.x,t.z,t.r*2,t.r*2,t.h);
    });this.scene.add(trunks,boughs,branches);this.forest={trees,trunks,boughs,branches};
    const grassGeo=new THREE.BufferGeometry();grassGeo.setAttribute('position',new THREE.Float32BufferAttribute([-.15,0,0,0,.46,0,.04,0,0,-.04,0,-.1,.12,.38,.12,.13,0,.1],3));grassGeo.computeVertexNormals();
    const grass=new THREE.InstancedMesh(grassGeo,mat('#535f46',{side:THREE.DoubleSide}),600);grass.userData.smallDetail=true;
    for(let i=0;i<600;i++){const x=(rand()-.5)*78,z=(rand()-.5)*78;dummy.position.set(x,terrainY(x,z),z);dummy.scale.set(1,.5+rand(),1);dummy.rotation.set(0,rand()*6,0);dummy.updateMatrix();grass.setMatrixAt(i,dummy.matrix);}this.scene.add(grass);
  }
  createRocks(){
    const rocks=[[-6,-4,1.8],[7,1,2.1],[-7,-21,2.2],[9,-24,1.9],[-12,10,1.5],[25.4,-8.5,2],[-26,5,2.2],[9,13,1.7],[-6,-30,2],[27,10,2.5]];
    rocks.forEach(([x,z,s])=>{const m=this.mesh(new THREE.DodecahedronGeometry(s,1),stone,x,terrainY(x,z)+s*.48,z);m.scale.set(1,.8,.9);m.rotation.set(.2,rand()*6,.1);m.castShadow=true;this.obstacle(x,z,s*1.65,s*1.6,s*1.2);});
    // A low fallen trunk offers a recognizable woodland landmark.
    const trunk=this.mesh(new THREE.CylinderGeometry(.42,.54,9,8),bark,11,terrainY(11,5)+.6,5);trunk.rotation.z=Math.PI/2;trunk.rotation.y=.32;this.obstacle(11,5,8,1.1,1.3);
    // Rock banks make the playable boundary legible before collision stops you.
    const boundary=[];for(let x=WORLD_BOUNDS.minX;x<=WORLD_BOUNDS.maxX;x+=4.3){boundary.push([x,WORLD_BOUNDS.minZ-1.1],[x,WORLD_BOUNDS.maxZ+1.1]);}for(let z=WORLD_BOUNDS.minZ+3;z<WORLD_BOUNDS.maxZ;z+=4.3)boundary.push([WORLD_BOUNDS.minX-1.1,z],[WORLD_BOUNDS.maxX+1.1,z]);
    const bank=new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1,0),mat('#687666',{map:this.floorTexture}),boundary.length),dummy=new THREE.Object3D();
    boundary.forEach(([x,z],i)=>{dummy.position.set(x,terrainY(x,z)+1.15,z);dummy.scale.set(2.4,2.4+rand()*1.2,2.4);dummy.rotation.set(.15,rand()*Math.PI,.12);dummy.updateMatrix();bank.setMatrixAt(i,dummy.matrix);this.obstacle(x,z,4,4,4,'world-boundary');});this.scene.add(bank);
  }
  createCabin(){
    const b=BUILDINGS.find(b=>b.id==='cabin'),base=terrainY(b.x,b.z),g=new THREE.Group();g.position.set(b.x,base,b.z);this.scene.add(g);this.cabin=g;
    const planks=wood,darkwood=mat('#77796d',{map:this.woodTexture}),rise=FLOORS[1].height,wallHeight=6.7;
    const wall=(x,z,w,d,h=wallHeight,bottom=0,id='cabin-wall')=>{this.box(w,h,d,darkwood,x,bottom+h/2,z,g);this.obstacle(b.x+x,b.z+z,w,d,h,id,base+bottom);};
    const slab=(x,z,w,d,y,id)=>{const floor=this.box(w,.18,d,planks,x,y-.09,z,g);floor.userData.floor=true;this.slabs.push({x:b.x+x,z:b.z+z,w,d,bottom:base+y-.18,h:.18,id});};
    slab(0,0,b.w,b.d,.1,'cabin-ground-floor');
    wall(-6,0,.24,10);wall(6,0,.24,10);wall(0,5,12,.24);
    // The lower doorway and upper balcony opening are separate physical holes.
    const doorway=3.2,panel=(12-doorway)/2,offset=doorway/2+panel/2;
    for(const x of [-offset,offset])wall(x,-5,panel,.24,rise);
    wall(0,-5,doorway,.24,.45,rise-.45,'ground-door-header');
    const upperDoor=2.6,upperPanel=(12-upperDoor)/2,upperOffset=upperDoor/2+upperPanel/2;
    for(const x of [-upperOffset,upperOffset])wall(x,-5,upperPanel,.24,wallHeight-rise,rise,'upper-front-wall');
    wall(0,-5,upperDoor,.24,.55,wallHeight-.55,'balcony-door-header');
    for(let y=.35;y<wallHeight;y+=.42){for(const x of [-offset,offset])this.box(panel+.04,.025,.27,planks,x,y,-5.02,g);}
    // Floor slabs surround the entire stairwell opening; there is no invisible lift.
    const left=STAIRS.x-STAIRS.width/2,right=STAIRS.x+STAIRS.width/2;
    slab((right+6)/2,0,6-right,10,rise,'upper-room-floor');
    slab((-6+left)/2,0,left+6,10,rise,'upper-west-floor');
    slab(STAIRS.x,(19+STAIRS.minZ)/2-24,STAIRS.width,STAIRS.minZ-19,rise,'upper-north-floor');
    slab(STAIRS.x,(STAIRS.maxZ+29)/2-24,STAIRS.width,29-STAIRS.maxZ,rise,'upper-landing-floor');
    // An enclosed timber stairwell has an opening at each appropriate level.
    const stairCenter=(STAIRS.minZ+STAIRS.maxZ)/2;
    for(const x of [left,right])wall(x,stairCenter-24,.14,STAIRS.maxZ-STAIRS.minZ,wallHeight,0,'stair-side');
    wall(STAIRS.x,STAIRS.minZ-24,STAIRS.width,.14,wallHeight-rise,rise,'stair-upper-north');
    wall(STAIRS.x,STAIRS.maxZ-24,STAIRS.width,.14,rise-.25,0,'stair-lower-south');
    const steps=18,run=(STAIRS.maxZ-STAIRS.minZ)/steps;
    for(let i=0;i<steps;i++){const top=rise*(i+1)/steps;this.box(STAIRS.width-.2,.12,run+.018,planks,STAIRS.x,top-.06,STAIRS.minZ+(i+.5)*run-24,g);}
    for(const side of [-1,1]){const rail=this.mesh(new THREE.CylinderGeometry(.035,.035,Math.hypot(STAIRS.maxZ-STAIRS.minZ,rise),8),iron,STAIRS.x+side*(STAIRS.width/2-.15),rise/2+.92,stairCenter-24,g);rail.rotation.x=Math.atan2(STAIRS.maxZ-STAIRS.minZ,rise);}
    // A walkable upper balcony directly overlooks the mountain.
    const bw=BALCONY.maxX-BALCONY.minX,bd=BALCONY.maxZ-BALCONY.minZ,bz=(BALCONY.minZ+BALCONY.maxZ)/2;
    slab((BALCONY.minX+BALCONY.maxX)/2,bz-24,bw,bd,rise,'balcony-floor');
    for(const x of [BALCONY.minX+.06,BALCONY.maxX-.06]){for(const z of [BALCONY.minZ,19]){const low=z===BALCONY.minZ?rise:0,high=rise+1.1-low;this.box(.17,high,.17,planks,x,low+high/2,z-24,g);}wall(x,bz-24,.14,bd,1.1,rise,'balcony-rail');}
    wall(0,BALCONY.minZ-24,bw,.13,1.05,rise,'balcony-front-rail');
    for(const x of [-2,-1,0,1,2])this.box(.055,.9,.055,iron,x,rise+.5,BALCONY.minZ-24,g);
    // Two full levels fit below the raised roof; the upper room is visible.
    this.box(b.w,.15,b.d,planks,0,wallHeight-.06,0,g);
    const roof=this.mesh(new THREE.ConeGeometry((b.w+.9)/Math.SQRT2,3.1,4),mat('#71786e',{map:this.woodTexture}),0,wallHeight+1.45,0,g);roof.rotation.y=Math.PI/4;roof.scale.z=(b.d+1.5)/(b.w+.9);
    this.box(b.w+.9,.16,2.7,planks,0,-.02,-6.1,g);
    for(let x=-6;x<6;x+=.42)this.box(.016,.03,2.7,darkwood,x,.08,-6.1,g);
    for(const level of [0,1])for(const z of [-3,0,3])this.box(12,.13,.16,darkwood,0,level*rise+3.05,z,g);
    const table=(x,z,w,d)=>{this.box(w,.1,d,planks,x,.86,z,g);for(const xx of [x-w*.38,x+w*.38])this.box(.1,.8,.1,darkwood,xx,.42,z,g);this.obstacle(x,z+24,w,d,1,'cabin-table',base);};
    table(LANDMARKS.glasses.x,LANDMARKS.glasses.z-24,2.5,1.3);table(LANDMARKS.note.x,LANDMARKS.note.z-24,1.4,1.2);
    this.box(2,.45,2.8,mat('#525b4c'),4,.45,3,g);this.obstacle(4,27,2,2.8,.9,'bed',base);this.box(.7,.22,1,mat('#aca998'),4,.82,3.65,g);
    this.box(1.4,2.2,.5,darkwood,-1.2,1.2,4.5,g);this.obstacle(-1.2,28.5,1.4,.6,2.2,'shelf',base);
    for(let y=.3;y<2.5;y+=.55)this.box(1.45,.09,.7,planks,-1.2,y,4.5,g);
    // Packed belongings upstairs establish the camera inventory task.
    for(const [x,z]of [[3.8,26.6],[4.6,27.4],[3.4,27.8]]){this.box(.8,.75,.7,mat('#84755a'),x,rise+.38,z-24,g);this.obstacle(x,z,.8,.7,.75,'upper-box',base+rise);}
    this.box(.75,.9,.65,planks,2.8,rise+.45,-2,g);this.obstacle(2.8,22,.75,.65,.9,'upper-cabinet',base+rise);
    const windowMat=new THREE.MeshBasicMaterial({color:'#c89b5f'});this.box(1.7,1.2,.04,windowMat,3.7,2.15,-5.16,g);this.box(.06,1.3,.07,darkwood,3.7,2.15,-5.2,g);this.box(1.8,.06,.07,darkwood,3.7,2.15,-5.2,g);
    this.lantern(-2,base+2.65,18.6,1.4);this.lantern(0,base+2.6,25,1.3);this.lantern(1.5,base+rise+2.3,23.8,.85);this.lantern(STAIRS.x,base+rise+1.4,27.75,.7);
  }
  createShed(){
    const b=BUILDINGS.find(b=>b.id==='shed'),{x,z,w,d}=b,y=terrainY(x,z);this.box(w,.15,d,wood,x,y,z);
    for(const sx of [-w/2+.05,w/2-.05]){this.box(.19,2.8,d,wood,x+sx,y+1.4,z);this.obstacle(x+sx,z,.25,d,2.8);}
    this.box(w,2.8,.2,wood,x,y+1.4,z-d/2);this.obstacle(x,z-d/2,w,.25,2.8);
    const roof=this.box(w+.5,.18,d+.7,mat('#858a7b',{map:this.woodTexture}),x,y+2.9,z);roof.rotation.z=.08;
    this.box(2.8,.12,.9,wood,x,y+.8,z-1.3);this.obstacle(x,z-1.3,2.8,.9,1);
    this.lantern(x+1.7,y+1.9,z+1.4,.6);this.sign(-16,0,'物置',-.3);
    for(let i=0;i<3;i++){const log=this.mesh(new THREE.CylinderGeometry(.25,.27,1.2,8),wood,x-1.5,y+.28+i*.3,z-.8);log.rotation.z=Math.PI/2;}
  }
  createShelter(){
    const b=BUILDINGS.find(b=>b.id==='shelter'),{x,z,w,d}=b,y=terrainY(x,z);this.box(w,.15,d,wood,x,y,z);
    for(const xx of [-w/2+.1,w/2-.1]){this.box(.25,3.1,d,wood,x+xx,y+1.55,z);this.obstacle(x+xx,z,.3,d,3);}
    this.box(w,3.1,.22,wood,x,y+1.55,z-d/2);this.obstacle(x,z-d/2,w,.3,3);
    const roof=this.mesh(new THREE.ConeGeometry((w+.5)/Math.SQRT2,1.9,4),mat('#85897d',{map:this.woodTexture}),x,y+3.4,z);roof.rotation.y=Math.PI/4;roof.scale.z=(d+.8)/(w+.5);
    this.box(3.2,.16,.7,wood,x,y+.8,z-1.8);this.obstacle(x,z-1.8,3.2,.8,1);
    this.lantern(x-2,y+2.3,z+1.7,.65);this.sign(12,-12,'避難小屋',-.6);
    // Raised bridge over a shallow, dark stream.
    const water=this.box(35,.06,1.4,mat('#233e40',{metalness:.4,roughness:.22}),BRIDGE.x-3.8,terrainY(BRIDGE.x-3.8,BRIDGE.z)-.04,BRIDGE.z);
    water.rotation.y=.12;
    for(let i=0;i<12;i++){const zz=BRIDGE.z+BRIDGE.length/2-(i+.5)*BRIDGE.length/12;this.box(BRIDGE.width,.14,BRIDGE.length/12-.04,wood,BRIDGE.x,terrainY(BRIDGE.x,zz)+.16,zz);}
    const sides=[BRIDGE.x-BRIDGE.width/2+.08,BRIDGE.x+BRIDGE.width/2-.08];for(const xx of sides)for(const zz of [BRIDGE.z-BRIDGE.length/2,BRIDGE.z+BRIDGE.length/2])this.box(.12,1.15,.12,wood,xx,terrainY(xx,zz)+.55,zz);
    for(const xx of sides){this.box(.1,.1,BRIDGE.length,wood,xx,terrainY(xx,BRIDGE.z)+1,BRIDGE.z);this.obstacle(xx,BRIDGE.z,.12,BRIDGE.length,1.1,'bridge-rail');}
  }
  createCar(){
    const {modelX:x,modelZ:z}=LANDMARKS.car,y=terrainY(x,z);const car=new THREE.Group();car.position.set(x,y,z);car.rotation.y=Math.PI/2;this.scene.add(car);this.car=car;
    this.box(2.1,.65,4.3,mat('#505c58',{metalness:.45,roughness:.6}),0,.75,0,car);
    this.box(1.9,.85,2.3,mat('#394744'),0,1.42,-.2,car);
    this.box(1.72,.64,.03,mat('#192a2c',{metalness:.7,roughness:.2}),0,1.45,1.01,car);
    for(const x of [-1,1])for(const z of [-1.3,1.4]){const w=this.mesh(new THREE.CylinderGeometry(.42,.42,.22,12),mat('#131b19'),x,.4,z,car);w.rotation.z=Math.PI/2;}
    for(const x of [-.72,.72]){this.box(.45,.2,.07,new THREE.MeshBasicMaterial({color:'#bead7a'}),x,.86,2.16,car);}
    this.obstacle(-27,23,4.4,2.2,1.9);this.sign(-23,19.2,'林道出口',.3);
  }
  createParking(){
    const p=PARKING,gate=p.entrance,half=p.gateWidth/2;
    // The visible fence and collision use exactly the same closed perimeter.
    const fence=(x,z,w,d)=>{const y=terrainY(x,z),h=2.35;this.box(w,h,d,wood,x,y+h/2,z);this.obstacle(x,z,w,d,h,'parking-fence');const horizontal=w>d,length=horizontal?w:d;
      for(let n=0;n<=length;n+=2){const xx=horizontal?x-w/2+n:x,zz=horizontal?z:z-d/2+n;this.box(.18,2.65,.18,wood,xx,terrainY(xx,zz)+1.3,zz);}
      for(const yy of [.45,1.8])this.box(horizontal?w:.3,.12,horizontal?.3:d,iron,x,y+yy,z);
    };
    fence(p.minX,(p.minZ+p.maxZ)/2,.28,p.maxZ-p.minZ);
    fence((p.minX+p.maxX)/2,p.minZ,p.maxX-p.minX,.28);
    fence((p.minX+p.maxX)/2,p.maxZ,p.maxX-p.minX,.28);
    fence(p.maxX,(p.minZ+gate.z-half)/2,.28,gate.z-half-p.minZ);
    fence(p.maxX,(gate.z+half+p.maxZ)/2,.28,p.maxZ-gate.z-half);
    this.gateCollider=this.obstacle(gate.x,gate.z,.3,p.gateWidth,2.3,'gate');
    const hinge=new THREE.Group();this.gateBaseY=terrainY(gate.x,gate.z);this.gateLift=0;hinge.position.set(gate.x,this.gateBaseY,gate.z-half);this.scene.add(hinge);this.gate=hinge;
    for(const z of [gate.z-half-.12,gate.z+half+.12])this.box(.24,5.15,.24,iron,gate.x,this.gateBaseY+2.57,z);
    this.box(.3,.23,p.gateWidth+.5,iron,gate.x,this.gateBaseY+5.1,gate.z);
    this.gateChains=[];for(const z of [gate.z-half+.18,gate.z+half-.18]){const chain=this.mesh(new THREE.CylinderGeometry(.023,.023,1,5),iron,gate.x,this.gateBaseY+3.5,z);this.gateChains.push(chain);const pulley=this.mesh(new THREE.TorusGeometry(.12,.028,5,10),iron,gate.x,this.gateBaseY+4.9,z);pulley.rotation.y=Math.PI/2;}
    this.box(.3,.5,.36,iron,gate.x+.2,this.gateBaseY+1.3,gate.z+half+.18);
    this.gateWheel=this.mesh(new THREE.CylinderGeometry(.19,.19,.14,12),mat('#847450',{metalness:.6}),gate.x+.4,this.gateBaseY+1.3,gate.z+half+.18);this.gateWheel.rotation.z=Math.PI/2;
    for(let i=0;i<10;i++){const link=this.mesh(new THREE.TorusGeometry(.05,.014,4,7),iron,gate.x+.15,this.gateBaseY+1.65+i*.3,gate.z+half+.18);link.rotation.y=i%2?Math.PI/2:0;}
    for(const z of [.07,p.gateWidth-.07])this.box(.13,2.25,.13,iron,0,1.12,z,hinge);
    for(const y of [.22,1.1,2.15])this.box(.1,.11,p.gateWidth,iron,0,y,half,hinge);
    for(let z=.4;z<p.gateWidth;z+=.4)this.box(.07,2,.07,iron,0,1.15,z,hinge);
    this.box(.22,.2,.22,mat('#8f8161',{metalness:.65}),.05,1.05,p.gateWidth-.12,hinge);
    this.sign(-15.8,24.9,'手動ゲート',-Math.PI/2);
  }
  setGateOpen(open){this.gateOpen=!!open;if(this.gateCollider)this.gateCollider.enabled=!this.gateOpen;}
  makeItem(id,label,x,z,mesh,y=0){const level=LANDMARKS[id]?.level??LORE_PLACEMENTS.find(p=>p.id===id)?.level??0,base=this.ground(x,z,level);if(mesh){mesh.position.set(x,base+y,z);this.scene.add(mesh);}const marker=this.mesh(new THREE.OctahedronGeometry(.045),new THREE.MeshBasicMaterial({color:'#cbbd8e',transparent:true,opacity:.65,depthWrite:false}),x,base+y+.5,z);this.items[id]={id,label,x,z,level,mesh,marker,y:marker.position.y,floorHeight:base,collected:false};return mesh;}
  createObjects(){
    const telescope=new THREE.Group();const tube=this.mesh(new THREE.CylinderGeometry(.12,.17,1.35,16),mat('#a8a18c',{metalness:.5}),0,1.35,0,telescope);tube.rotation.x=Math.PI/2-.14;
    const lens=this.mesh(new THREE.CylinderGeometry(.135,.135,.03,16),mat('#233c40',{metalness:.7,roughness:.12}),0,1.46,-.67,telescope);lens.rotation.x=Math.PI/2;
    for(let i=0;i<3;i++){const leg=this.mesh(new THREE.CylinderGeometry(.025,.035,1.3,5),iron,Math.cos(i*2.09)*.22,.6,Math.sin(i*2.09)*.22,telescope);leg.rotation.z=Math.cos(i*2.09)*.32;leg.rotation.x=Math.sin(i*2.09)*.32;}
    this.makeItem('telescope','望遠鏡を覗く',LANDMARKS.telescope.x,LANDMARKS.telescope.z,telescope);this.items.telescope.persistent=true;
    const glasses=new THREE.Group();for(const x of [-.1,.1]){this.mesh(new THREE.SphereGeometry(.09,12,8),mat('#142329',{metalness:.5,roughness:.15}),x,.01,0,glasses).scale.set(1,.25,.75);this.box(.015,.015,.22,iron,x*1.8,.015,.08,glasses);}this.box(.1,.015,.015,iron,0,0,0,glasses);const keys=this.mesh(new THREE.TorusGeometry(.055,.007,5,14),iron,.22,.01,.12,glasses);keys.rotation.x=Math.PI/2;this.box(.025,.014,.12,iron,.23,.01,.22,glasses);this.makeItem('glasses','サングラスと自分の車の鍵',LANDMARKS.glasses.x,LANDMARKS.glasses.z,glasses,.94);
    const note=new THREE.Group();this.box(.42,.025,.32,mat('#d1c6a5'),0,0,0,note);for(let i=0;i<5;i++)this.box(.24-i*.012,.002,.005,mat('#6d695b'),-.025,.014,-.1+i*.035,note);this.makeItem('note','叔父の書き置き',LANDMARKS.note.x,LANDMARKS.note.z,note,.94);this.items.note.persistent=true;
    const bottle=new THREE.Group();this.mesh(new THREE.CylinderGeometry(.11,.14,.43,12),mat('#827b46',{transparent:true,opacity:.85}),0,.22,0,bottle);this.mesh(new THREE.CylinderGeometry(.06,.08,.12,10),mat('#6d7358'),0,.49,0,bottle);this.mesh(new THREE.CylinderGeometry(.065,.065,.05,10),mat('#bab392'),0,.565,0,bottle);const spare=bottle.clone();spare.position.set(.34,0,.07);bottle.add(spare);this.makeItem('bottle','蓋つきの容器 二本',LANDMARKS.bottle.x,LANDMARKS.bottle.z,bottle,.08);
    const photo=new THREE.Group();this.box(.42,.02,.34,mat('#ddd6bb'),0,0,0,photo);const photoPlane=this.mesh(new THREE.PlaneGeometry(.35,.23),mat('#6e7767'),0,.018,-.015,photo);photoPlane.rotation.x=-Math.PI/2;
    (this.options.textureLoader||new THREE.TextureLoader()).load('./assets/mountain-photo.webp',t=>{t.colorSpace=THREE.SRGBColorSpace;photoPlane.material.map=t;photoPlane.material.needsUpdate=true;});
    this.box(1.1,.1,.75,wood,LANDMARKS.photo.x,terrainY(17,-15)+.85,LANDMARKS.photo.z);for(const xx of [-.4,.4])this.box(.07,.85,.07,iron,LANDMARKS.photo.x+xx,terrainY(17,-15)+.42,LANDMARKS.photo.z);this.obstacle(LANDMARKS.photo.x,LANDMARKS.photo.z,1.1,.75,.95,'photo-table');
    this.box(.49,.008,.36,mat('#aa9b78'),.015,-.017,.01,photo);this.makeItem('photo','古い写真の入った封筒',LANDMARKS.photo.x,LANDMARKS.photo.z,photo,.92);this.items.photo.persistent=true;
    const crank=new THREE.Group();this.box(.045,.4,.045,iron,0,.2,0,crank);this.box(.37,.045,.045,iron,.16,.4,0,crank);this.mesh(new THREE.CylinderGeometry(.045,.045,.18,8),mat('#8c3829'),.34,.4,.07,crank).rotation.x=Math.PI/2;this.makeItem('crank','赤い握りの巻上げハンドル',LANDMARKS.crank.x,LANDMARKS.crank.z,crank,.08);
    const phone=new THREE.Group();this.box(.19,.045,.36,iron,0,.02,0,phone);const screen=this.box(.15,.006,.2,new THREE.MeshBasicMaterial({color:'#6e9984'}),0,.047,-.045,phone);this.phoneScreen=screen;
    this.makeItem('phone','落ちている携帯電話',LANDMARKS.phone.x,LANDMARKS.phone.z,phone,.13);this.items.phone.persistent=true;
    this.makeItem('gate','ハンドルで林道ゲートを開く',LANDMARKS.gate.x,LANDMARKS.gate.z,null,.5);this.items.gate.persistent=true;
    this.makeItem('car','車で山を下りる',LANDMARKS.car.x,LANDMARKS.car.z,null,.7);
  }
  createLore(){
    const rubber=mat('#3d4038'),paper=mat('#c6bca0'),red=mat('#6e2924'),cloth=mat('#68695b');
    for(const p of LORE_PLACEMENTS){const g=new THREE.Group();let height=p.height;
      if(p.type==='boots'){for(const x of [-.16,.16]){this.mesh(new THREE.CylinderGeometry(.095,.115,.42,8),rubber,x,.24,0,g);this.mesh(new THREE.SphereGeometry(1,10,6),rubber,x,.08,.1,g).scale.set(.115,.09,.22);this.mesh(new THREE.CylinderGeometry(.075,.075,.012,8),mat('#161d18'),x,.456,0,g);}for(let n=0;n<4;n++)this.box(.07,.004,.11,mat('#635d49'),n*.09-.14,.004,.38+n*.18,g);}
      if(p.type==='book'){this.box(.4,.055,.32,mat('#423d30'),0,0,0,g);this.box(.365,.034,.29,paper,.006,.012,0,g);this.box(.4,.008,.32,mat('#595543'),0,.035,0,g);this.box(.21,.003,.045,paper,0,.041,-.05,g);this.box(.72,.1,.65,wood,p.x,terrainY(p.x,p.z)+.84,p.z);for(const x of [-.25,.25])this.box(.06,.83,.06,wood,p.x+x,terrainY(p.x,p.z)+.42,p.z);this.obstacle(p.x,p.z,.72,.65,.9,'ledger-stool');}
      if(p.type==='cassette'){this.box(.25,.035,.17,mat('#202927'),0,.03,0,g);this.box(.22,.004,.09,paper,0,.05,0,g);for(const x of [-.062,.062]){const reel=this.mesh(new THREE.TorusGeometry(.029,.007,5,10),iron,x,.054,0,g);reel.rotation.x=-Math.PI/2;}this.box(.7,.08,.65,wood,p.x,terrainY(p.x,p.z)+.82,p.z);this.box(.18,.8,.18,wood,p.x,terrainY(p.x,p.z)+.4,p.z);this.obstacle(p.x,p.z,.7,.65,.9,'cassette-stool');this.cassetteProp=g;}
      if(p.type==='mirror'){height=.69;this.mesh(new THREE.CylinderGeometry(.16,.15,.025,14),mat('#777160',{metalness:.75,roughness:.42}),0,0,0,g).scale.z=.76;this.box(.055,.023,.25,wood,0,0,.2,g);this.box(.025,.003,.24,mat('#454a40'),.02,.014,.21,g);}
      if(p.type==='ribbon'){const ribbon=this.box(.1,.48,.014,red,0,-.1,0,g);ribbon.rotation.z=.2;this.box(.26,.055,.028,red,0,.12,0,g).rotation.z=-.1;this.ribbonProp=g;}
      if(p.type==='bell'){const bell=this.mesh(new THREE.SphereGeometry(.105,12,8),mat('#827759',{metalness:.8,roughness:.62}),0,.09,0,g);bell.scale.y=.85;this.box(.014,.035,.21,mat('#242c27'),0,.08,0,g);const loop=this.mesh(new THREE.TorusGeometry(.031,.009,5,10),iron,0,.19,0,g);loop.rotation.y=.3;this.box(.12,.016,.32,red,0,.013,.2,g);}
      if(p.type==='tag'){this.box(.08,1.6,.08,wood,p.x+.15,terrainY(p.x,p.z)+.8,p.z);this.box(.23,.34,.025,wood,0,0,0,g);this.box(.15,.2,.005,paper,0,0,.017,g);for(let i=0;i<3;i++)this.box(.08,.006,.006,mat('#575e51'),0,.05-i*.05,.022,g);g.rotation.z=.18;}
      this.makeItem(p.id,p.label,p.x,p.z,g,height);this.items[p.id].persistent=true;
    }
  }
  createZoneLandmarks(){
    this.mapZones=MAP_ZONES;
    // Timber and stone stacks have the same solid footprint used by sight and
    // navigation. Both sides remain open so breaking a gaze is a route choice.
    for(const p of COVER_PATCHES){
      const y=terrainY(p.x,p.z),group=new THREE.Group();group.position.set(p.x,y,p.z);this.scene.add(group);group.userData.cover=p.id;
      if(p.kind==='logs'){
        for(let row=0;row<4;row++)for(let column=0;column<3;column++){
          const log=this.mesh(new THREE.CylinderGeometry(.235,.26,p.w,7),bark,0,.25+row*.43,-.58+column*.56,group);log.rotation.z=Math.PI/2;
          for(const side of [-1,1]){const end=this.mesh(new THREE.CircleGeometry(.205,7),mat('#b2a07e'),side*(p.w/2+.005),.25+row*.43,-.58+column*.56,group);end.rotation.y=side*Math.PI/2;}
        }
        for(const x of [-.8,.8])this.box(.05,p.h,.04,iron,x,p.h/2,p.d/2,group);
      }else if(p.kind==='screen'){
        for(let z=-p.d/2+.13;z<p.d/2;z+=.27)this.box(.16,p.h-.06,.255,wood,0,p.h/2,z,group);
        for(const yy of [.35,1.55])this.box(.25,.12,p.d,wood,0,yy,0,group);
        this.box(.04,.48,.37,mat('#93634b'),.13,1.48,-.38,group);
      }else{
        for(let row=0;row<3;row++)for(let column=0;column<3;column++){
          const rock=this.mesh(new THREE.DodecahedronGeometry(.52,0),mat('#78857a',{map:this.floorTexture}),-.72+column*.72,.33+row*.55,(row%2-.5)*.45,group);rock.scale.set(.9,.85,1.25);rock.rotation.y=column+row*.7;
        }
        this.box(p.w,.15,p.d,stone,0,1.82,0,group);
      }
      this.obstacle(p.x,p.z,p.w,p.d,p.h,p.id);
    }
    // Saw-cut stumps, working tags and a discarded cable drum distinguish the
    // western lumber area from the stony, cold-water eastern loop.
    for(const [x,z]of [[-20.8,1.7],[-17.5,-9.8],[-8.4,-2.2]]){
      const h=.38+rand()*.22,y=terrainY(x,z);this.mesh(new THREE.CylinderGeometry(.36,.46,h,8),bark,x,y+h/2,z);const top=this.mesh(new THREE.CircleGeometry(.35,12),mat('#baa987',{map:this.woodTexture}),x,y+h+.008,z);top.rotation.x=-Math.PI/2;
    }
    const drum=new THREE.Group();drum.position.set(-22,terrainY(-22,-.2)+.55,-.2);drum.rotation.x=Math.PI/2;this.scene.add(drum);
    this.mesh(new THREE.CylinderGeometry(.31,.31,.65,10),mat('#252d29'),0,0,0,drum);for(const y of [-.36,.36])this.mesh(new THREE.CylinderGeometry(.56,.56,.09,12),wood,0,y,0,drum);
    for(const [x,z]of [[4.2,-13.7],[8.4,-18.1],[20.4,-24.2]]){const y=terrainY(x,z);this.box(.12,1.2,.12,wood,x,y+.6,z);this.box(.13,.15,.13,mat('#879da2'),x,y+.91,z);}
    this.sign(-17.5,-10.5,'伐採跡 / 呼び鐘',.25);this.sign(20.3,-9,'沢沿い・足元注意',-.15);
    // A broken barrier gives Shuji's road a destination, without opening the
    // fenced parking area or granting a second escape route.
    this.box(3.9,.14,.12,mat('#b09e72'),-26,terrainY(-26,12.8)+.95,12.8).rotation.z=.18;
    for(const x of [-27.5,-24.8])this.box(.16,1.1,.16,wood,x,terrainY(x,12.8)+.5,12.8);
  }
  createGimmicks(){
    const base=this.ground(0,19,1),slats=mat('#777c6d',{map:this.woodTexture});
    this.shutterPanels=[];this.shutterClosed=false;this.shutterSlide=1;
    for(const side of [-1,1]){const panel=new THREE.Group();panel.position.set(side*1.95,base+1.43,19);panel.userData.side=side;this.scene.add(panel);
      this.box(1.28,2.84,.1,slats,0,0,0,panel);for(let yy=-1.25;yy<1.42;yy+=.26)this.box(1.29,.026,.13,wood,0,yy,0,panel);
      for(const zz of [-.09,.09])this.box(.035,.27,.04,iron,-side*.4,-.24,zz,panel);this.shutterPanels.push(panel);
    }
    this.box(5.3,.09,.17,iron,0,base+2.91,19);
    this.shutterCollider=this.obstacle(0,19,2.6,.18,2.87,'upper-shutter',base);this.shutterCollider.enabled=false;
    const handle=new THREE.Group();this.box(.055,.38,.065,iron,0,0,0,handle);this.box(.13,.06,.065,iron,0,.17,0,handle);this.makeItem('shutter','二階の雨戸を閉める',LANDMARKS.shutter.x,LANDMARKS.shutter.z,handle,1.22);this.items.shutter.persistent=true;
    const radio=new THREE.Group();this.box(.28,.36,.16,mat('#313d38'),0,.17,0,radio);this.box(.21,.1,.018,mat('#5f7668'),0,.24,.089,radio);for(let i=0;i<5;i++)this.box(.18,.013,.018,iron,0,.05+i*.021,.09,radio);this.mesh(new THREE.CylinderGeometry(.013,.015,.48,5),iron,-.09,.58,0,radio);this.mesh(new THREE.CylinderGeometry(.032,.032,.035,7),iron,.08,.37,0,radio);this.makeItem('radio','机の無線で修司に呼びかける',LANDMARKS.radio.x,LANDMARKS.radio.z,radio,.94);this.items.radio.persistent=true;this.radioProp=radio;
    const bx=LANDMARKS.bell.x,bz=LANDMARKS.bell.z,by=terrainY(bx,bz),postX=bx+2.05;
    this.box(.15,2.55,.15,wood,postX,by+1.275,bz);this.box(2.28,.13,.16,wood,bx+1.02,by+2.49,bz);this.obstacle(postX,bz,.15,.15,2.55,'bell-post');
    this.mesh(new THREE.CylinderGeometry(.009,.009,.75,5),iron,bx,by+2.12,bz);
    const bell=new THREE.Group();const shell=this.mesh(new THREE.CylinderGeometry(.13,.22,.3,12,1,true),mat('#827651',{metalness:.75,side:THREE.DoubleSide}),0,0,0,bell);this.mesh(new THREE.CylinderGeometry(.13,.13,.035,12),iron,0,.15,0,bell);this.mesh(new THREE.SphereGeometry(.043,7,5),iron,0,-.17,0,bell);this.box(.025,.44,.025,mat('#624535'),0,-.33,0,bell);this.makeItem('bell','林業用の呼び鐘を鳴らす',bx,bz,bell,1.66);this.items.bell.persistent=true;this.bellProp=bell;this._bellTime=-100;
    this.box(.5,.32,.035,wood,postX,by+1.22,bz+.1);this.sign(postX+1.4,bz+1.2,'合図以外 鳴らすな',-.3);
  }
  setShutterClosed(closed){this.shutterClosed=!!closed;if(this.shutterCollider)this.shutterCollider.enabled=this.shutterClosed;if(this.items.shutter)this.items.shutter.label=`二階の雨戸を${this.shutterClosed?'開く':'閉める'}`;}
  ringBell(time=this._time){this._bellTime=time;}
  createCompanion(){
    const g=new THREE.Group(),jacket=mat('#4e5648'),seam=mat('#2e3930'),pants=mat('#333d38'),skin=mat('#b9aa8e'),hair=mat('#252a25');this.scene.add(g);g.name='叔父・修司';this.companion=g;
    this.companionPos={...COMPANION_START};this.companionState='present';this._companionCommand='present';this._companionRoute=[];this._companionStep=0;
    const torso=this.box(.48,.61,.29,jacket,0,1.12,0,g);this.box(.035,.53,.022,seam,0,1.12,.157,g);this.box(.5,.08,.32,seam,0,.83,0,g);
    for(const x of [-.145,.145]){this.box(.12,.13,.022,seam,x,1.2,.162,g);this.box(.13,.022,.026,jacket,x,1.26,.177,g);}
    this.mesh(new THREE.CylinderGeometry(.075,.085,.13,8),skin,0,1.48,0,g);
    const head=new THREE.Group();head.position.set(0,1.66,0);g.add(head);this.companionHead=head;
    this.mesh(new THREE.SphereGeometry(1,12,9),skin,0,0,0,head).scale.set(.15,.19,.145);
    // Keep the hair shell clear of the scalp; intersecting faceted spheres
    // otherwise show pale triangular patches on the CPU painter path.
    this.mesh(new THREE.SphereGeometry(1,16,10,0,Math.PI*2,0,1.28),hair,0,.005,-.006,head).scale.set(.174,.212,.172);
    for(const side of [-1,1]){this.mesh(new THREE.SphereGeometry(.035,6,5),skin,side*.15,-.005,0,head).scale.set(.55,1,.7);this.mesh(new THREE.SphereGeometry(.018,7,5),mat('#27322c'),side*.058,.015,.133,head).scale.set(1,.62,.45);this.box(.05,.009,.018,hair,side*.06,.045,.139,head);}
    this.mesh(new THREE.SphereGeometry(1,7,5),skin,0,-.018,.151,head).scale.set(.027,.041,.035);
    this.companionMouth=this.box(.055,.008,.013,mat('#65594b'),0,-.083,.13,head);this.box(.09,.008,.008,hair,0,-.064,.137,head);
    this.companionLegs=[];this.companionArms=[];
    for(const side of [-1,1]){
      const leg=new THREE.Group();leg.position.set(side*.135,.84,0);g.add(leg);this.box(.19,.65,.21,pants,0,-.32,0,leg);this.box(.21,.15,.34,mat('#202b25'),0,-.76,.065,leg);this.companionLegs.push(leg);
      const arm=new THREE.Group();arm.position.set(side*.29,1.38,0);g.add(arm);this.mesh(new THREE.CylinderGeometry(.085,.075,.43,8),jacket,0,-.2,0,arm);this.mesh(new THREE.CylinderGeometry(.075,.06,.33,8),jacket,0,-.54,.025,arm);this.mesh(new THREE.SphereGeometry(1,8,6),skin,0,-.75,.05,arm).scale.set(.055,.082,.05);this.companionArms.push(arm);
    }
    const radio=new THREE.Group();radio.position.set(0,-.71,.085);this.companionArms[1].add(radio);this.box(.12,.22,.085,iron,0,0,0,radio);this.box(.075,.045,.012,mat('#a5ad80'),0,.04,.05,radio);this.mesh(new THREE.CylinderGeometry(.007,.007,.19,5),iron,-.035,.195,0,radio);
    g.position.set(COMPANION_START.x,this.actorHeight(COMPANION_START),COMPANION_START.z);g.rotation.y=Math.atan2(SPAWN.x-COMPANION_START.x,SPAWN.z-COMPANION_START.z);
  }
  updateCompanion(command,speaking,pos,time,dt){
    if(command==='present'&&this._companionCommand!=='present'){
      this.companionPos={...COMPANION_START};this.companionState='present';this._companionRoute=[];this._companionStep=0;this.companion.visible=true;
    }
    if(command==='leaving'&&this.companionState==='present'){
      this.companionState='leaving';let from={...this.companionPos};this._companionRoute=[];
      for(const target of COMPANION_EXIT){const segment=this.findPath(from,target);if(!segment.length)break;this._companionRoute.push(...segment);from=target;}this._companionStep=0;
    }
    if(command==='away'&&this.companionState==='present'){this.companionState='away';this.companion.visible=false;}
    this._companionCommand=command;
    let walking=false;
    if(this.companionState==='leaving'){
      const target=this._companionRoute[this._companionStep];
      if(target){const dx=target.x-this.companionPos.x,dz=target.z-this.companionPos.z,d=Math.hypot(dx,dz);if(d<.035)this._companionStep++;
        else{const step=Math.min(d,dt*1.65),before={...this.companionPos};this.move(this.companionPos,dx/d*step,dz/d*step,.3);walking=Math.hypot(before.x-this.companionPos.x,before.z-this.companionPos.z)>.0001;this.companion.rotation.y=Math.atan2(dx,dz);}}
      else{const d=Math.hypot(pos.x-this.companionPos.x,pos.z-this.companionPos.z),direction=new THREE.Vector3();this.camera.getWorldDirection(direction);const behind=(this.companionPos.x-pos.x)*direction.x+(this.companionPos.z-pos.z)*direction.z<0;if(d>24||d>8&&behind||this.isBlocked(pos,this.companionPos)){this.companionState='away';this.companion.visible=false;}}
    }
    if(!this.companion.visible)return;
    const stride=walking?Math.sin(time*7.2)*.34:0;this.companionLegs.forEach((leg,i)=>leg.rotation.x=stride*(i?1:-1));this.companionArms.forEach((arm,i)=>{arm.rotation.x=walking?-stride*(i?1:-1)*.6:i===1?-.5:Math.sin(time*.7)*.025;arm.rotation.z=(i?1:-1)*.04;});
    if(this.companionState==='present'){this.companion.rotation.y=Math.atan2(pos.x-this.companionPos.x,pos.z-this.companionPos.z);this.companionHead.rotation.x=speaking?Math.sin(time*3.2)*.025:Math.sin(time*.5)*.012;this.companionHead.rotation.y=Math.sin(time*.43)*.03;}
    this.companionMouth.scale.y=speaking?.6+Math.abs(Math.sin(time*11))*2.1:1;
    this.companion.position.set(this.companionPos.x,this.actorHeight(this.companionPos)+(walking?Math.abs(Math.sin(time*7.2))*.025:0),this.companionPos.z);
  }
  lantern(x,y,z,intensity=1){
    const warm=new THREE.MeshBasicMaterial({color:'#e4b66c'});this.mesh(new THREE.CylinderGeometry(.12,.12,.27,6),warm,x,y,z);this.mesh(new THREE.ConeGeometry(.22,.14,6),iron,x,y+.2,z);const light=new THREE.PointLight('#ffd38e',intensity*9,9,1.5);light.position.set(x,y,z);this.scene.add(light);this.flickers.push({light,intensity:intensity*9});
  }
  sign(x,z,text,rotation=0){
    const c=document.createElement('canvas');c.width=512;c.height=160;const ctx=c.getContext('2d');ctx.fillStyle='#373b2d';ctx.fillRect(0,0,512,160);ctx.strokeStyle='#9b9a76';ctx.strokeRect(9,9,494,142);ctx.font='500 40px serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#e0ddbd';ctx.fillText(text,256,80);
    const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;const y=terrainY(x,z);this.box(.1,1.8,.1,wood,x,y+.9,z);const board=this.mesh(new THREE.BoxGeometry(2.5,.78,.09),[wood,wood,wood,wood,new THREE.MeshStandardMaterial({map:t,roughness:1}),wood],x,y+1.5,z);board.rotation.y=rotation;
  }
  createDust(){
    const positions=[];for(let i=0;i<240;i++)positions.push((rand()-.5)*70,.5+rand()*7,(rand()-.5)*70);
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));this.dust=new THREE.Points(geo,new THREE.PointsMaterial({color:'#b5c4b5',size:.026,transparent:true,opacity:.24,depthWrite:false}));this.scene.add(this.dust);
  }
  createCreature(){buildCreature(this);}
  createScares(){
    const figure=new THREE.Group();figure.position.set(3.7,terrainY(0,24)+1.75,18.79);this.scene.add(figure);
    const shade=mat('#252d29');this.mesh(new THREE.SphereGeometry(1,10,8),shade,0,.35,0,figure).scale.set(.17,.26,.06);this.mesh(new THREE.SphereGeometry(1,8,6),shade,0,-.05,0,figure).scale.set(.32,.3,.05);figure.visible=false;this.windowFigure=figure;
    this.projectile=new THREE.Group();this.mesh(new THREE.CylinderGeometry(.075,.095,.28,8),mat('#a79c6d'),0,0,0,this.projectile);this.mesh(new THREE.CylinderGeometry(.04,.04,.08,8),iron,0,.18,0,this.projectile);this.projectile.visible=false;this.scene.add(this.projectile);
    this.splash=new THREE.InstancedMesh(new THREE.SphereGeometry(.025,5,4),mat('#b8baa0',{transparent:true,opacity:.7}),18);this.splash.visible=false;this.scene.add(this.splash);this._splashDummy=new THREE.Object3D();
  }
  triggerScare(id){if(['window','bridge','shelf','phone'].includes(id))this._scares[id]=this._time;}
  throwRepellent(target){const from=this.camera.position.clone().add(new THREE.Vector3(.18,-.2,-.3).applyQuaternion(this.camera.quaternion));const to=new THREE.Vector3(target?.x??this.creature.position.x,(target?.y??this.actorHeight(target||{x:this.creature.position.x,z:this.creature.position.z,level:0})+1.35),target?.z??this.creature.position.z);this._throw={start:this._time,from,to};this.projectile.visible=true;}
  createHand(){
    const g=new THREE.Group();this.camera.add(g);g.position.set(.27,-.32,-.48);g.rotation.x=-.08;g.rotation.y=-.06;
    const sleeve=this.mesh(new THREE.CylinderGeometry(.065,.085,.36,10),mat('#222e2d'),.03,-.1,.13,g);sleeve.rotation.x=Math.PI/2+.6;
    this.mesh(new THREE.SphereGeometry(.065,12,8),mat('#786c55'),0,0,0,g).scale.set(.8,.75,1.4);
    const torch=this.mesh(new THREE.CylinderGeometry(.04,.052,.25,12),mat('#343a33',{metalness:.6}),0,.015,-.11,g);torch.rotation.x=Math.PI/2;
    const rim=this.mesh(new THREE.CylinderGeometry(.059,.042,.065,12),iron,0,.015,-.27,g);rim.rotation.x=Math.PI/2;
    this.hand=g;
  }
  isFree(x,z,r=.34,level=0){return this.isFreeAt({x,z,level:Number.isInteger(level)?level:0},r);}
  isFreeAt(pos,r=.34){
    const {x,z}=pos,level=pos.level??0;
    if(x<WORLD_BOUNDS.minX||x>WORLD_BOUNDS.maxX||z<WORLD_BOUNDS.minZ||z>WORLD_BOUNDS.maxZ)return false;
    if(level===1&&!this.inStairs(pos)&&!this.upstairsContains(x,z,r*.4))return false;
    const feet=this.actorHeight(pos),head=feet+1.72;
    return !this.colliders.some(c=>c.enabled!==false&&head>c.bottom+.02&&feet+.08<c.bottom+c.h&&x>c.x-c.w/2-r&&x<c.x+c.w/2+r&&z>c.z-c.d/2-r&&z<c.z+c.d/2+r);
  }
  isBlocked(a,b){
    const start={x:a.x,z:a.z,y:a.eyeY??this.actorHeight(a)+(a.eyeHeight??1.65)},end={x:b.x,z:b.z,y:b.eyeY??this.actorHeight(b)+(b.eyeHeight??1.65)};
    return this.colliders.some(c=>c.enabled!==false&&segmentHitsVolume(start,end,c,.045))||this.slabs.some(c=>segmentHitsVolume(start,end,c,.015));
  }
  _movementEnd(a,b,r=.3){
    if(!this.isFreeAt(a,r))return null;
    const length=Math.hypot(b.x-a.x,b.z-a.z),steps=Math.max(1,Math.ceil(length/.18));let previous={x:a.x,z:a.z,level:a.level??0};
    for(let i=1;i<=steps;i++){
      const next={x:a.x+(b.x-a.x)*i/steps,z:a.z+(b.z-a.z)*i/steps,level:previous.level};
      if(this.inStairs(previous)||this.inStairs(next)){
        if(next.z>=STAIRS.maxZ-.012)next.level=1;else if(next.z<=STAIRS.minZ+.012)next.level=0;
      }
      if(Math.abs(this.actorHeight(next)-this.actorHeight(previous))>.29||!this.isFreeAt(next,r))return null;
      previous=next;
    }
    if(b.level!==undefined&&previous.level!==b.level&&!this.inStairs(b))return null;
    return previous;
  }
  isSegmentFree(a,b,r=.3){return !!this._movementEnd(a,b,r);}
  move(pos,dx,dz,r=.34){
    const alongX=this._movementEnd(pos,{x:pos.x+dx,z:pos.z},r);if(alongX)Object.assign(pos,alongX);
    const alongZ=this._movementEnd(pos,{x:pos.x,z:pos.z+dz},r);if(alongZ)Object.assign(pos,alongZ);
  }
  _findPathOnLevel(start,end){
    const direct=this._movementEnd(start,end,.3);if(direct)return [direct];
    const level=start.level??0,step=level===1?.75:1.5,minX=level===1?-6:-33,minZ=level===1?17:-33,nx=level===1?17:43,nz=level===1?17:44,key=(x,z)=>z*nx+x;
    const point=(x,z)=>({x:minX+x*step,z:minZ+z*step,level}),free=new Uint8Array(nx*nz),edges=new Map();
    const nodeFree=(x,z)=>{const k=key(x,z);if(!free[k]){const p=point(x,z);free[k]=this.isFreeAt(p,.3)?2:1;}return free[k]===2;};
    const visibleNode=pos=>{
      const bx=Math.max(0,Math.min(nx-1,Math.round((pos.x-minX)/step))),bz=Math.max(0,Math.min(nz-1,Math.round((pos.z-minZ)/step))),candidates=[];
      for(let dz=-4;dz<=4;dz++)for(let dx=-4;dx<=4;dx++){
        const x=bx+dx,z=bz+dz;if(x<0||x>=nx||z<0||z>=nz||!nodeFree(x,z))continue;
        const p=point(x,z);candidates.push({x,z,p,d:Math.hypot(p.x-pos.x,p.z-pos.z)});
      }
      candidates.sort((a,b)=>a.d-b.d);return candidates.find(n=>this.isSegmentFree(pos,n.p,.3));
    };
    const first=visibleNode(start),last=visibleNode(end);if(!first||!last)return [];
    const sx=first.x,sz=first.z,ex=last.x,ez=last.z,open=[{x:sx,z:sz,g:0,f:0}],seen=new Map(),closed=new Set();seen.set(key(sx,sz),open[0]);let found=null;
    for(let loops=0;open.length&&loops<2400;loops++){
      open.sort((a,b)=>a.f-b.f);const cur=open.shift(),k=key(cur.x,cur.z);if(closed.has(k))continue;closed.add(k);if(cur.x===ex&&cur.z===ez){found=cur;break;}
      for(const [dx,dz]of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]){
        const x=cur.x+dx,z=cur.z+dz,kk=key(x,z);if(x<0||x>=nx||z<0||z>=nz||closed.has(kk)||!nodeFree(x,z))continue;
        if(dx&&dz&&(!nodeFree(cur.x,z)||!nodeFree(x,cur.z)))continue;
        const edgeKey=Math.min(k,kk)*nx*nz+Math.max(k,kk);if(!edges.has(edgeKey))edges.set(edgeKey,this.isSegmentFree(point(cur.x,cur.z),point(x,z),.3));if(!edges.get(edgeKey))continue;
        const g=cur.g+Math.hypot(dx,dz),prev=seen.get(kk);if(prev&&prev.g<=g)continue;const next={x,z,g,f:g+Math.hypot(x-ex,z-ez),parent:cur};seen.set(kk,next);open.push(next);
      }
    }
    if(!found)return [];const route=[];while(found?.parent){route.unshift(point(found.x,found.z));found=found.parent;}
    if(Math.hypot(first.p.x-start.x,first.p.z-start.z)>.03)route.unshift(first.p);
    if(Math.hypot(last.p.x-end.x,last.p.z-end.z)>.03)route.push({...end,level:end.level??level});return route;
  }
  findPath(a,b){
    const start={x:a.x,z:a.z,level:a.level??0},end={x:b.x,z:b.z,level:b.level??0};
    const direct=this._movementEnd(start,end,.3);if(direct)return [direct];
    const inStairs=this.inStairs(start),crossFloor=start.level!==end.level;
    if(!inStairs&&!crossFloor)return this._findPathOnLevel(start,end);
    const destinationLevel=end.level,entry=destinationLevel===1?STAIRS.bottom:STAIRS.top,exit=destinationLevel===1?STAIRS.top:STAIRS.bottom;
    const first=inStairs?[]:this._findPathOnLevel(start,entry);if(!inStairs&&!first.length)return [];
    const from=inStairs?start:entry,stairEnd=this._movementEnd(from,exit,.3);if(!stairEnd)return [];
    const stairs=[];let prev=from;const count=Math.max(1,Math.ceil(Math.hypot(exit.x-from.x,exit.z-from.z)/.8));
    for(let i=1;i<=count;i++){const p=this._movementEnd(prev,{x:from.x+(exit.x-from.x)*i/count,z:from.z+(exit.z-from.z)*i/count},.3);if(!p)return [];stairs.push(p);prev=p;}
    const last=this._findPathOnLevel(stairEnd,end);if(!last.length)return [];return first.concat(stairs,last);
  }
  setItemCollected(id,yes){const item=this.items[id];if(!item)return;item.collected=!!yes;if(item.mesh&&!item.persistent)item.mesh.visible=!yes;item.marker.visible=!yes;}
  update({pos,yaw,pitch,time,moving=false,running=false,lamp=true,monster,active=false,repelled=false,closing=false,brightness=1,motion=true,attackPhase='idle',attackProgress=0,hit=0,escape=false,gateOpen,enemyVisual=null,scope=null,companionState='present',companionSpeaking=false}){
    if(time<this._time){this._scares={};this._throw=null;this.projectile.visible=false;this.splash.visible=false;this.windowFigure.visible=false;this.gateLift=(gateOpen??this.gateOpen)?2.8:0;this._bellTime=-100;if(companionState==='present')this._companionCommand='away';}
    const dt=Math.min(.1,Math.max(0,time-this._time));this._time=time;if(gateOpen!==undefined)this.setGateOpen(gateOpen);
    const bob=motion&&moving?Math.sin(time*(running?13:8))*(running?.045:.025):0;
    this.camera.position.set(pos.x,this.actorHeight(pos)+1.65+bob,pos.z);this.camera.rotation.set(pitch,yaw,motion?Math.sin(time*48)*hit*.035:0);
    // Finish magnifying before the last beat, leaving 1.5 seconds to read the
    // turned face at a steady optical scale instead of zooming through it.
    const faceZoomProgress=scope?.phase===2?THREE.MathUtils.clamp(scope.progress/.75,0,1):0,faceZoomEase=faceZoomProgress*faceZoomProgress*(3-2*faceZoomProgress);
    const zoom=scope?scope.phase===0?20-2*scope.progress:scope.phase===1?18-3*scope.progress:15-9*faceZoomEase:68;
    if(Math.abs(this.camera.fov-zoom)>.01){this.camera.fov=zoom;this.camera.updateProjectionMatrix();}this.scene.fog.density=scope?.014:.034;
    if(scope){const origin={x:LANDMARKS.telescope.x,z:LANDMARKS.telescope.z+.5,level:1},target=scope.target||REVEAL_POINT;this.camera.position.set(origin.x,this.actorHeight(origin)+1.65,origin.z);this.camera.lookAt(target.x,this.actorHeight(target)+1.7+(scope.phase===2?scope.progress*.55:0),target.z);}
    // The optical view starts inside the instrument. Its physical blue objective
    // lens otherwise fills the magnified foreground one metre from the camera.
    this.items.telescope.mesh.visible=!scope;
    this.hand.position.y=-.32+(motion&&moving?Math.sin(time*8)*.012:0);this.hand.visible=lamp&&!scope;
    this.hand.rotation.z=this._throw?-Math.sin(Math.min(1,(time-this._throw.start)/.55)*Math.PI)*.45:0;
    this.flashlight.position.copy(this.camera.position);this.flashlight.position.y-=.12;
    const forward=new THREE.Vector3(0,-.025,-1).applyQuaternion(this.camera.quaternion);this.flashlightTarget.position.copy(this.camera.position).addScaledVector(forward,12);
    this.flashlight.intensity=lamp&&!closing&&!scope?32:0;this.handlight.position.copy(this.camera.position);this.handlight.intensity=lamp&&!scope?.4:0;
    this.renderer.toneMappingExposure=brightness;
    for(const item of Object.values(this.items)){if(item.marker.visible){item.marker.position.y=item.y+Math.sin(time*2)*.035;item.marker.rotation.y=time*.35;item.marker.material.opacity=(item.level===(pos.level??0)&&!scope?.6:0)*Math.max(.12,1-Math.hypot(item.x-pos.x,item.z-pos.z)/11);}}
    const windowAge=time-(this._scares.window??-100),shelfAge=time-(this._scares.shelf??-100),bridgeAge=time-(this._scares.bridge??-100),phoneAge=time-(this._scares.phone??-100);
    this.windowFigure.visible=windowAge>=0&&windowAge<1.15;
    if(this.ribbonProp)this.ribbonProp.rotation.z=bridgeAge<3?Math.sin(bridgeAge*19)*Math.max(0,1-bridgeAge/3)*.45:Math.sin(time*.6)*.035;
    if(this.cassetteProp)this.cassetteProp.rotation.z=shelfAge<1?Math.sin(shelfAge*Math.PI*6)*.12*(1-shelfAge):0;
    if(this.phoneScreen)this.phoneScreen.material.color.setHex(phoneAge<2&&Math.sin(phoneAge*30)<0?0x18281f:0x6e9984);
    this.flickers.forEach((f,i)=>{const scare=(windowAge<1.8||shelfAge<1.5)&&i<2?(.25+.75*Math.max(0,Math.sin(time*39))):1;f.light.intensity=f.intensity*(.95+Math.sin(time*3+i)*.05)*scare;});this.dust.rotation.y=time*.002;
    this.gateLift=THREE.MathUtils.damp(this.gateLift,this.gateOpen?2.8:0,3.5,dt);this.gate.position.y=this.gateBaseY+this.gateLift;
    for(const chain of this.gateChains){const bottom=this.gateBaseY+this.gateLift+2.15,top=this.gateBaseY+4.95;chain.scale.y=Math.max(.035,top-bottom);chain.position.y=(top+bottom)/2;}this.gateWheel.rotation.x=this.gateLift*5;
    if(this._throw){const flight=this._throw,age=time-flight.start,t=Math.min(1,age/.55);this.projectile.visible=t<1;this.projectile.position.lerpVectors(flight.from,flight.to,t);this.projectile.position.y+=Math.sin(t*Math.PI)*1.05;this.projectile.rotation.set(age*11,age*7,age*5);
      this.splash.visible=age>=.55&&age<1.25;if(this.splash.visible){const s=age-.55;for(let i=0;i<18;i++){const a=i*2.39996,r=s*(1+(i%4)*.24),d=this._splashDummy;d.position.set(flight.to.x+Math.cos(a)*r,flight.to.y+Math.sin(i*1.7)*s*1.8-s*s*3,flight.to.z+Math.sin(a)*r);d.scale.setScalar(Math.max(.2,1-s));d.updateMatrix();this.splash.setMatrixAt(i,d.matrix);}this.splash.instanceMatrix.needsUpdate=true;this.splash.material.opacity=Math.max(0,.75*(1-(age-.55)/.7));}if(age>1.3){this._throw=null;this.projectile.visible=false;this.splash.visible=false;}}
    this.creature.visible=active||!!scope&&scope.phase>=1;
    if(active||scope){
      const creaturePos=scope?(scope.target||REVEAL_POINT):monster,visual=enemyVisual||{},c=THREE.MathUtils.clamp(visual.crouch||0,0,1);
      this.creature.position.set(creaturePos.x,this.actorHeight(creaturePos),creaturePos.z);
      const previous=this._lastCreaturePosition||creaturePos,moved=Math.hypot(previous.x-creaturePos.x,previous.z-creaturePos.z);this._lastCreaturePosition={...creaturePos};this._creatureGait=(this._creatureGait||0)+Math.min(.5,moved)*3.2;
      const gait=Number.isFinite(visual.gait)?visual.gait:this._creatureGait,speed=Number.isFinite(visual.speed)?visual.speed:dt?moved/dt:0,walk=THREE.MathUtils.clamp(speed/.65,0,1),mode=visual.mode||'stalk';
      this.creature.rotation.y=Number.isFinite(visual.heading)?visual.heading:Math.atan2(pos.x-creaturePos.x,pos.z-creaturePos.z);
      const p=THREE.MathUtils.clamp(attackProgress,0,1),lean=(visual.lean||0)+c*.30;
      this.torso.position.set(0,THREE.MathUtils.damp(this.torso.position.y,-1.25*c,4,dt),0);
      this.torso.rotation.set(.065+lean,(visual.headYaw||0)*.13,Math.sin(time*1.55)*.035+Math.sin(gait)*.025*walk);
      this.head.rotation.set((visual.headPitch||0)-.06-c*.65,visual.headYaw||Math.sin(time*.33)*.025,Math.sin(time*.8)*.045-.07);
      const stride=(mode==='hunt'?.41:.23)*(1-c*.45);
      this.legs.forEach((leg,i)=>{const phase=gait+i*Math.PI;leg.scale.y=1-c*.39;leg.position.y=.98-c*.38;leg.rotation.x=THREE.MathUtils.damp(leg.rotation.x,Math.sin(phase)*stride*walk,8,dt);leg.rotation.z=(i===0?1:-1)*c*.26;});
      const reach=c*2.05+Math.max(0,(visual.lean||0)-.065-c*.22)*Math.min(1,c*3)*2,armSwing=Math.pow(1-c,3);
      this.arms[0].rotation.set(Math.sin(gait+Math.PI)*.19*walk*armSwing-reach,0,-.12+c*.35+Math.sin(time*.9)*.035);
      this.arms[1].rotation.set(Math.sin(gait)*.13*walk*armSwing-reach,0,.12-c*.28+Math.cos(time*1.1)*.025);
      if(mode==='listen'||mode==='search'){this.head.rotation.z-=.09;this.arms[0].rotation.z-=.07;}
      if(mode==='watch'){this.torso.rotation.z*=.4;if(c<.05)this.arms[1].rotation.x=-.08;}
      if(attackPhase==='windup'){this.arms[1].rotation.x=-2.5*p;this.arms[1].rotation.z=.5*p;this.torso.rotation.y=-.35*p;this.head.rotation.x=-.15;this.arms[0].rotation.x=-.45*p;}
      if(attackPhase==='strike'){const swing=Math.min(1,p*1.8);this.arms[1].rotation.x=-2.5+swing*3.5;this.arms[1].rotation.z=.5-swing*.8;this.torso.rotation.x=.1+Math.sin(p*Math.PI)*.34;this.torso.rotation.y=-.35+swing*.75;this.torso.position.z=Math.sin(p*Math.PI)*.32;this.head.rotation.x=.13;}
      if(attackPhase==='recover'){this.arms[1].rotation.x=(1-p)*1.0;this.torso.rotation.y=(1-p)*.4;this.head.rotation.z=-.15;}
      if(attackPhase==='stunned'||repelled){this.arms[0].rotation.set(-2.35,0,.75);this.arms[1].rotation.set(-1.45,0,-.6);this.head.rotation.x=.45;this.torso.rotation.x=-.18;this.torso.rotation.z=Math.sin(time*19)*.055;this.torso.position.z=-.2;}
      if(attackPhase==='death'){this.torso.rotation.x=.35;this.head.rotation.x=.2;this.arms[1].rotation.x=-1.1;this.arms[0].rotation.x=-1.3;}
      if(scope){
        const facing=Math.atan2(this.camera.position.x-creaturePos.x,this.camera.position.z-creaturePos.z),progress=scope.phase===2?THREE.MathUtils.clamp(scope.progress,0,1):0;
        const ease=v=>{const n=THREE.MathUtils.clamp(v,0,1);return n*n*(3-2*n);},headTurn=ease(progress/.46),shoulderTurn=ease((progress-.16)/.69),hipTurn=ease((progress-.32)/.68);
        this.creature.rotation.y=facing+Math.PI-Math.PI*hipTurn;
        this.torso.position.set(0,Math.sin(time*1.9)*.022,0);this.torso.rotation.set(.08,-Math.min(.55,Math.PI*(shoulderTurn-hipTurn)),Math.sin(time*1.2)*.075);
        this.head.rotation.set(-.07,-Math.min(.98,Math.PI*(headTurn-shoulderTurn)),Math.sin(time*.65)*.09-.1);
        this.arms[0].rotation.set(Math.sin(time*.7)*.05,0,-.18);this.arms[1].rotation.set(Math.cos(time*.8)*.04,0,.14);
        this.legs.forEach(leg=>{leg.rotation.set(0,0,0);leg.position.y=.98;leg.scale.y=1;});
      }
    }
    updateCreatureDetails(this,{time,dt,scope,attackPhase,attackProgress,repelled,enemyVisual:enemyVisual||{},active});
    this.updateCompanion(companionState,companionSpeaking,pos,time,dt);
    this.shutterSlide=THREE.MathUtils.damp(this.shutterSlide,this.shutterClosed?0:1,9,dt);
    this.shutterPanels.forEach(panel=>{panel.position.x=panel.userData.side*(.65+this.shutterSlide*1.3);});
    const bellAge=time-this._bellTime;this.bellProp.rotation.z=bellAge>=0&&bellAge<5?Math.sin(bellAge*13)*Math.exp(-bellAge*.9)*.55:Math.sin(time*.3)*.006;
    this.renderer.render(this.scene,this.camera);
  }
  eyePosition(){return this.eye.getWorldPosition(new THREE.Vector3());}
}
