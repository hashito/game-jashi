import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnemyState, stepEnemy, ENEMY_RULES } from '../dist/enemy.js';

const p=(x=0,z=0,level=0)=>({x,z,level});
const input=(player=p(0,20),extra={})=>({player,active:true,hunt:false,playerMoving:false,playerRunning:false,playerLooking:false,closedEyes:false,playerPitch:0,lamp:true,attackPhase:'idle',stun:0,dead:false,...extra});
const planar=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const delta=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
function openNav(){
  return {hidden:false,paths:[],moves:[],
    isBlocked(a,b){return this.hidden;},
    actorHeight(a){return (a.level||0)*3.35;},
    isFreeAt(a){return Math.abs(a.x)<100&&Math.abs(a.z)<100;},
    findPath(a,b){this.paths.push({...b});return [{...b}];},
    move(a,dx,dz){this.moves.push({from:{...a},dx,dz});a.x+=dx;a.z+=dz;},
  };
}
function run(enemy,nav,value,seconds,hz=60){
  const events=[];for(let t=0;t<Math.round(seconds*hz);t++)events.push(...stepEnemy(enemy,typeof value==='function'?value(t/hz):value,1/hz,nav));return events;
}
function knownEnemy(nav,player=p(0,15)){
  const enemy=createEnemyState({...p(),heading:0});run(enemy,nav,input(player),3.2);return enemy;
}

test('the inactive creature stays in place, and the first mutual sight has a head-before-body pause',()=>{
  const nav=openNav(),enemy=createEnemyState(p()),origin={...enemy.position},heading=enemy.heading;
  run(enemy,nav,input(p(0,20),{active:false}),2);assert.deepEqual(enemy.position,origin);assert.equal(enemy.mode,'dormant');
  const events=run(enemy,nav,input(p(0,20)),.35);
  assert.deepEqual(enemy.position,origin);assert.equal(enemy.mode,'watch');assert.equal(enemy.heading,heading);assert.ok(Math.abs(enemy.headYaw)>.1);assert.ok(events.includes('awaken'));
  run(enemy,nav,input(p(0,20)),1);
  assert.deepEqual(enemy.position,origin);assert.ok(Math.abs(delta(enemy.heading,heading))>.2);assert.ok(Math.abs(delta(enemy.heading,0))>.1,'the body must not snap through a half turn');
  run(enemy,nav,input(p(0,20)),3);assert.ok(enemy.position.z>0);assert.ok(enemy.gait>0);
});

test('pursuit uses bounded physical movement and has comparable motion at 30 and 60 FPS',()=>{
  const positions=[];
  for(const hz of [30,60]){
    const enemy=createEnemyState({...p(),heading:0}),nav=openNav();let previous={...enemy.position};
    for(let n=0;n<hz*7;n++){
      stepEnemy(enemy,input(p(0,35),{hunt:true}),1/hz,nav);
      assert.ok(planar(enemy.position,previous)<=ENEMY_RULES.huntSpeed/hz+1e-8,'no teleport or unbounded chase step');previous={...enemy.position};
    }
    assert.ok(enemy.position.z>10);assert.equal(enemy.mode,'hunt');positions.push(enemy.position);
  }
  assert.ok(planar(positions[0],positions[1])<.15);
});

test('breaking sight really loses the player: two hidden locations produce the same search',()=>{
  const seedNav=openNav(),seed=knownEnemy(seedNav,p(0,14)),saved=JSON.parse(JSON.stringify(seed));
  const a=createEnemyState(p(),saved),b=createEnemyState(p(),saved),navA=openNav(),navB=openNav();navA.hidden=navB.hidden=true;
  const eventsA=run(a,navA,input(p(25,-18),{hunt:true}),15),eventsB=run(b,navB,input(p(-26,-17),{hunt:true}),15);
  assert.deepEqual(a.position,b.position);assert.deepEqual(a.lastKnown,b.lastKnown);assert.deepEqual(a.focusPoint,b.focusPoint);assert.equal(a.mode,b.mode);assert.equal(a.heading,b.heading);
  assert.deepEqual(eventsA,eventsB);assert.deepEqual(a.lastKnown,p(0,14));assert.ok(eventsA.includes('lostSight'));assert.ok(eventsA.includes('search'));
  for(const target of [...navA.paths,...navB.paths])assert.ok(Math.abs(target.x)<10&&target.z>5,'search is around the remembered location, never the unseen player');
});

test('a silent player behind the creature does not attract a magical turn',()=>{
  const nav=openNav(),enemy=knownEnemy(nav,p(0,18));nav.hidden=true;run(enemy,nav,input(p(0,-25)),.5);nav.hidden=false;
  const before={...enemy.lastKnown};run(enemy,nav,input(p(0,-25)),1);
  assert.equal(enemy.playerVisible,false);assert.deepEqual(enemy.lastKnown,before);assert.ok(Math.abs(delta(enemy.heading,0))<.2);
});

test('nearby running can be heard behind cover; quiet walking outside its range cannot',()=>{
  const nav=openNav(),seed=knownEnemy(nav,p(0,14)),saved=JSON.parse(JSON.stringify(seed));
  const quiet=createEnemyState(p(),saved),loud=createEnemyState(p(),saved),quietNav=openNav(),loudNav=openNav();quietNav.hidden=loudNav.hidden=true;
  const runner=p(8,4);run(quiet,quietNav,input(runner,{playerMoving:true}),.2);run(loud,loudNav,input(runner,{playerMoving:true,playerRunning:true}),.2);
  assert.deepEqual(quiet.lastKnown,p(0,14));assert.deepEqual(loud.lastKnown,runner);assert.equal(loud.playerVisible,false);
});

test('metal noise uses a metre radius, is attenuated by walls, and is consumed only once',()=>{
  const nav=openNav(),enemy=knownEnemy(nav,p(0,14));nav.hidden=true;
  const origin={...enemy.position},quietNoise={id:'far-crank',x:origin.x+42,z:origin.z,level:0,strength:55};
  run(enemy,nav,input(p(0,-80),{noiseEvent:quietNoise}),.1);assert.deepEqual(enemy.lastKnown,p(0,14),'42m exceeds a 55m sound muffled by a wall');
  const gate={id:'gate-1',x:origin.x+40,z:origin.z,level:0,strength:95};run(enemy,nav,input(p(0,-80),{noiseEvent:gate}),.1);assert.deepEqual(enemy.lastKnown,p(gate.x,gate.z));
  const movedSameId={...gate,x:-30,z:-30};run(enemy,nav,input(p(0,-80),{noiseEvent:movedSameId}),1);assert.deepEqual(enemy.lastKnown,p(gate.x,gate.z),'an old sound is not a live locator');
  const engine={...movedSameId,id:'engine-1',strength:95};run(enemy,nav,input(p(0,-80),{noiseEvent:engine}),.1);assert.deepEqual(enemy.lastKnown,p(engine.x,engine.z));
});

test('a bell heard during pursuit can lure once after cover breaks sight, at its original position',()=>{
  const nav=openNav(),seen=p(0,15),enemy=knownEnemy(nav,seen);
  const bell={id:'bell-1',kind:'bell',x:9,z:3,level:0,strength:65};
  run(enemy,nav,input(seen,{noiseEvent:bell}),1.4);
  assert.deepEqual(enemy.lastKnown,seen,'vision keeps priority while the player is visible');
  assert.deepEqual(enemy.pendingBell.position,p(9,3));
  nav.hidden=true;
  const movedEvent={...bell,x:-30,z:-30};
  run(enemy,nav,input(p(-40,-40),{noiseEvent:movedEvent}),.2);
  assert.deepEqual(enemy.lastKnown,p(9,3),'the echo remembers the bell, never a later player/event position');
  assert.equal(enemy.pendingBell,null,'an echo is spent as soon as it becomes an investigation target');
  const heardAt=enemy.lastHeardAt;
  run(enemy,nav,input(p(-40,-40),{noiseEvent:movedEvent}),1.5);
  assert.equal(enemy.lastHeardAt,heardAt,'the same ringing event cannot keep restarting investigation');
  const newer={id:'metal-2',kind:'metal',x:6,z:7,level:0,strength:40};
  run(enemy,nav,input(p(-40,-40),{noiseEvent:newer}),.1);
  run(enemy,nav,input(p(-40,-40),{noiseEvent:movedEvent}),.1);
  assert.deepEqual(enemy.lastKnown,p(6,7),'an intervening sound does not make the previous bell reusable');
});

test('a bell decays after five simulation seconds and cannot become a delayed locator',()=>{
  const nav=openNav(),seen=p(0,20),enemy=knownEnemy(nav,seen);
  const bell={id:8,kind:'bell',x:8,z:1,level:0,strength:65};
  run(enemy,nav,input(seen,{noiseEvent:bell}),ENEMY_RULES.bellEchoSeconds+.2);
  assert.equal(enemy.pendingBell,null);
  nav.hidden=true;run(enemy,nav,input(p(-50,-50),{noiseEvent:{...bell,x:-10,z:-10}}),.5);
  assert.deepEqual(enemy.lastKnown,seen,'cover after the decay does not resurrect the old sound');
  const far={id:9,kind:'bell',x:80,z:80,level:0,strength:10};
  run(enemy,nav,input(p(-50,-50),{noiseEvent:far}),.1);assert.equal(enemy.pendingBell,null);
  run(enemy,nav,input(p(-50,-50),{noiseEvent:{...far,x:enemy.position.x,z:enemy.position.z}}),.1);
  assert.deepEqual(enemy.lastKnown,seen,'a previously inaudible bell cannot later become audible under the same ID');
});

test('only a bell is held behind visual priority; ordinary noise and footsteps gain no deferred replay',()=>{
  const nav=openNav(),seen=p(0,10),enemy=knownEnemy(nav,seen);
  const metal={id:12,kind:'metal',x:7,z:2,level:0,strength:65};
  run(enemy,nav,input(seen,{noiseEvent:metal,playerMoving:true,playerRunning:true}),1);
  nav.hidden=true;run(enemy,nav,input(p(-50,-50),{noiseEvent:metal}),.5);
  assert.equal(enemy.pendingBell,null);assert.deepEqual(enemy.lastKnown,seen);
});

test('a saved bell echo keeps its original deadline, while a stun discards it',()=>{
  const nav=openNav(),seen=p(0,20),enemy=knownEnemy(nav,seen);
  const bell={id:'bell-save',kind:'bell',x:9,z:3,level:0,strength:65};
  run(enemy,nav,input(seen,{noiseEvent:bell}),1.5);
  const restored=createEnemyState(p(),JSON.parse(JSON.stringify(enemy)));
  assert.deepEqual(restored.pendingBell,enemy.pendingBell);
  run(restored,nav,input(seen,{noiseEvent:bell}),4);
  assert.equal(restored.pendingBell,null,'loading does not give an old echo five fresh seconds');
  const second={...bell,id:'bell-stun'};
  run(enemy,nav,input(seen,{noiseEvent:second}),.1);assert.ok(enemy.pendingBell);
  run(enemy,nav,input(seen,{stun:2,attackPhase:'stunned',noiseEvent:second}),.1);
  assert.equal(enemy.pendingBell,null);
});

test('a new sound makes the searching creature plant its feet and turn before investigating',()=>{
  const nav=openNav(),enemy=knownEnemy(nav,p(0,1));nav.hidden=true;run(enemy,nav,input(p(0,-80)),2);
  assert.equal(enemy.mode,'search');const before={...enemy.position},heading=enemy.heading;
  const events=run(enemy,nav,input(p(0,-80),{noiseEvent:{id:1,x:10,z:0,level:0,strength:25}}),.3);
  assert.equal(enemy.mode,'listen');assert.ok(events.includes('heard'));assert.deepEqual(enemy.position,before);assert.ok(Math.abs(enemy.headYaw)>.1);assert.ok(Math.abs(delta(enemy.heading,heading))<.5);
  run(enemy,nav,input(p(0,-80)),2);assert.equal(enemy.mode,'investigate');assert.ok(planar(enemy.position,before)>.1);
});

test('the creature follows supplied detours instead of crossing a blocked segment',()=>{
  const nav=openNav();nav.isBlocked=()=>true;
  const obstacle={minX:-1,maxX:1,minZ:-4,maxZ:4};
  nav.findPath=function(a,b){this.paths.push({...b});return a.z<4.7&&a.x< -1?[p(-3,5),p(3,5),{...b}]:a.x<2.8?[p(3,5),{...b}]:[{...b}];};
  nav.move=function(a,dx,dz){const next={...a,x:a.x+dx,z:a.z+dz};assert.ok(!(next.x>obstacle.minX&&next.x<obstacle.maxX&&next.z>obstacle.minZ&&next.z<obstacle.maxZ),'no wall crossing');this.moves.push(next);a.x=next.x;a.z=next.z;};
  const enemy=createEnemyState({...p(-3,0),heading:0});run(enemy,nav,input(p(3,0),{hunt:true}),11);
  assert.ok(nav.moves.some(m=>m.z>=4.8));assert.ok(enemy.position.x>1);
});

test('a stationary remembered target does not keep re-inserting a grid point behind a turning creature',()=>{
  const nav=openNav();nav.hidden=true;
  nav.findPath=function(a,b){this.paths.push({...b});return [p(0,-.5),p(0,3),p(3,3),{...b}];};
  const enemy=createEnemyState({...p(),heading:0});run(enemy,nav,input(p(3,11),{hunt:true}),15);
  assert.ok(enemy.position.z>8,'the creature commits to the valid route after its initial backward turn');
});

test('other-floor waypoints survive until the creature physically climbs the stairs',()=>{
  const nav=openNav();nav.isBlocked=(a,b)=>(a.level||0)!==(b.level||0);
  nav.actorHeight=a=>a.level===1?3.35:a.z>2&&Math.abs(a.x)<.6?Math.min(3.35,(a.z-2)/6*3.35):0;
  nav.findPath=function(a,b){this.paths.push({...b});if(a.level===0&&b.level===1)return [...(a.z<1.8?[p(0,2,0)]:[]),p(0,8,1),{...b}];return [{...b}];};
  nav.move=function(a,dx,dz){const previous={...a};a.x+=dx;a.z+=dz;if(a.level===0&&a.z>=7.8&&Math.abs(a.x)<.6)a.level=1;this.moves.push({from:previous,to:{...a}});};
  const enemy=createEnemyState({...p(),heading:0}),events=[];
  for(let i=0;i<60*22;i++)events.push(...stepEnemy(enemy,input(p(0,0,1),{hunt:true}),1/60,nav));
  const firstUpper=nav.moves.find(m=>m.to.level===1);assert.ok(firstUpper);assert.ok(firstUpper.to.z>=7.8);assert.equal(enemy.position.level,1);
  assert.ok(nav.moves.some(m=>m.to.z>7));assert.ok(enemy.position.z<3,'it follows the upper-floor waypoint back toward the player');
});

test('windup and swing lock body direction; stepping behind makes the hit arc invalid',()=>{
  const nav=openNav(),enemy=knownEnemy(nav,p(0,2));run(enemy,nav,input(p(0,2),{attackPhase:'windup'}),.1);
  const heading=enemy.heading,position={...enemy.position};assert.equal(enemy.attackAligned,true);
  run(enemy,nav,input(p(0,-2),{attackPhase:'windup'}),.6);assert.equal(enemy.heading,heading);assert.deepEqual(enemy.position,position);assert.equal(enemy.attackAligned,false);
  run(enemy,nav,input(p(0,-2),{attackPhase:'strike'}),.2);assert.equal(enemy.heading,heading);assert.deepEqual(enemy.position,position);
  run(enemy,nav,input(p(0,-2),{attackPhase:'recover'}),1);assert.deepEqual(enemy.position,position);assert.ok(Math.abs(delta(enemy.heading,heading))>.2,'only the recovery can start to turn');
});

test('vertical separation disallows the hit arc even at identical map coordinates',()=>{
  const nav=openNav(),enemy=createEnemyState({...p(),heading:0});run(enemy,nav,input(p(0,0,1)),1);assert.equal(enemy.attackAligned,false);
});

test('stun recoils only a short physical distance and remembers the throw, not the escaping player',()=>{
  const nav=openNav(),enemy=knownEnemy(nav,p(0,7)),before={...enemy.position},thrower=p(0,7);
  const first=stepEnemy(enemy,input(thrower,{attackPhase:'stunned',stun:6.5}),1/60,nav);assert.ok(first.includes('stagger'));
  nav.hidden=true;run(enemy,nav,input(p(20,-20),{attackPhase:'stunned',stun:5,noiseEvent:{id:'old-engine',x:20,z:-20,strength:95}}),3);
  assert.equal(enemy.mode,'stunned');assert.ok(planar(enemy.position,before)<.3);assert.deepEqual(enemy.lastKnown,thrower);const stopped={...enemy.position};
  const resumed=run(enemy,nav,input(p(20,-20),{noiseEvent:{id:'old-engine',x:20,z:-20,strength:95}}),.3);
  assert.ok(resumed.includes('recovering'));assert.equal(enemy.mode,'watch');assert.deepEqual(enemy.position,stopped);assert.deepEqual(enemy.lastKnown,thrower);
  run(enemy,nav,input(p(20,-20)),2);assert.equal(enemy.mode,'investigate');assert.deepEqual(enemy.lastKnown,thrower);
});

test('crawling blends in only when visible nearby and the lamp is aimed at the ground',()=>{
  const nav=openNav(),enemy=knownEnemy(nav,p(0,6));run(enemy,nav,input(p(0,6),{playerPitch:-1,lamp:true}),1.8);assert.ok(enemy.crouch>.7);
  nav.hidden=true;run(enemy,nav,input(p(0,6),{playerPitch:-1,lamp:true}),1.5);assert.ok(enemy.crouch<.1,'the creature cannot react to a hidden camera angle');
  nav.hidden=false;run(enemy,nav,input(p(0,6),{playerPitch:-1,lamp:false}),1);assert.ok(enemy.crouch<.1);
});

test('gait stops with the feet and resumes from movement rather than elapsed time',()=>{
  const nav=openNav(),enemy=knownEnemy(nav,p(0,20));run(enemy,nav,input(p(0,20)),1);const gait=enemy.gait;assert.ok(gait>0);
  run(enemy,nav,input(p(0,20),{attackPhase:'windup'}),.6);assert.equal(enemy.gait,gait);assert.equal(enemy.speed,0);
  run(enemy,nav,input(p(0,20),{attackPhase:'recover'}),1.3);assert.equal(enemy.gait,gait);
  run(enemy,nav,input(p(0,20)),1);assert.ok(enemy.gait>gait);
});

test('plain JSON restoration preserves perception, route memory, position identity and deterministic motion',()=>{
  const nav=openNav(),enemy=knownEnemy(nav,p(0,20));nav.hidden=true;run(enemy,nav,input(p(-40,-40)),2);
  const restored=createEnemyState(p(99,99),JSON.parse(JSON.stringify(enemy))),otherNav=openNav();otherNav.hidden=true;
  const reference=restored.position;
  for(let i=0;i<180;i++){
    const value=input(p(-40,-40));assert.deepEqual(stepEnemy(enemy,value,1/60,nav),stepEnemy(restored,value,1/60,otherNav));
  }
  assert.equal(restored.position,reference);assert.deepEqual(restored.position,enemy.position);assert.deepEqual(restored.lastKnown,enemy.lastKnown);assert.equal(restored.mode,enemy.mode);assert.equal(restored.heading,enemy.heading);
});

test('the real world and enemy AI follow both stair directions without teleporting or getting stuck on replanning',async t=>{
  const THREE=await import('../dist/vendor/three.module.js');
  const {MountainWorld}=await import('../dist/world.js');
  const {STAIRS}=await import('../dist/layout.js');
  const noop=()=>{};
  function canvas(){const context=new Proxy({createLinearGradient:()=>({addColorStop:noop}),createRadialGradient:()=>({addColorStop:noop}),createPattern:()=>({})},{get:(o,k)=>k in o?o[k]:noop});return {width:512,height:160,style:{},setAttribute:noop,getContext:()=>context};}
  const globals={innerWidth:1280,innerHeight:720,devicePixelRatio:1,addEventListener:noop,document:{createElement:canvas}},previous={};
  for(const key of Object.keys(globals))previous[key]=globalThis[key];
  Object.assign(globalThis,globals);t.after(()=>{for(const key of Object.keys(globals)){if(previous[key]===undefined)delete globalThis[key];else globalThis[key]=previous[key];}});
  const renderer={shadowMap:{},setPixelRatio:noop,setSize:noop,render:noop,domElement:canvas()};
  const textureLoader={load(_url,onLoad){const texture=new THREE.Texture({width:1024,height:1024});queueMicrotask(()=>onLoad?.(texture));return texture;}};
  const world=new MountainWorld({append:noop},{renderer,textureLoader});
  for(const [start,target] of [[p(0,17,0),p(0,24,1)],[p(0,24,1),p(0,17,0)]]){
    const enemy=createEnemyState({...start,heading:0});let transition=null;
    for(let i=0;i<60*24;i++){
      const before={...enemy.position},feet=world.actorHeight(before);
      stepEnemy(enemy,input(target,{hunt:true}),1/60,world);
      assert.ok(planar(before,enemy.position)<=ENEMY_RULES.huntSpeed/60+1e-6);
      assert.ok(Math.abs(world.actorHeight(enemy.position)-feet)<.1,'feet climb continuously instead of changing floors abruptly');
      assert.ok(world.isFreeAt(enemy.position,.3),'physical movement remains clear of world colliders');
      if(before.level!==enemy.position.level){transition={...enemy.position};assert.ok(Math.abs(transition.x-STAIRS.x)<STAIRS.width/2);}
      if(enemy.position.level===target.level&&planar(enemy.position,target)<1.8)break;
    }
    assert.ok(transition,'the creature must physically use the stairs');assert.equal(enemy.position.level,target.level);
    assert.ok(planar(enemy.position,target)<1.8,'it reaches the remembered player on the other floor');
  }
});
