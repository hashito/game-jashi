// Stateful perception and locomotion. This module knows only what the creature
// has actually seen or heard; navigation and vertical movement remain world-owned.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const TAU=Math.PI*2;
const finite=(v,f=0)=>Number.isFinite(v)?v:f;
const point=p=>({x:finite(p?.x),z:finite(p?.z),level:p?.level===1?1:0});
const validPoint=p=>!!p&&Number.isFinite(p.x)&&Number.isFinite(p.z);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const sameLevel=(a,b)=>(a.level||0)===(b.level||0);
const angleDelta=(a,b)=>{let d=a-b;while(d>Math.PI)d-=TAU;while(d< -Math.PI)d+=TAU;return d;};
const turn=(current,target,amount)=>current+clamp(angleDelta(target,current),-amount,amount);
const bearing=(a,b)=>Math.atan2(b.x-a.x,b.z-a.z); // model's forward is +Z
const MODES=new Set(['dormant','watch','stalk','listen','investigate','search','hunt','stunned','recover','attack']);
export const ENEMY_RULES=Object.freeze({stalkSpeed:.94,huntSpeed:3.22,investigateSpeed:1.5,huntInvestigateSpeed:2.12,searchSpeed:.82,visionRange:39,huntVisionRange:48,walkHearing:7,runHearing:18,quietHearing:2.5,wallSoundFactor:.72,floorSoundFactor:.9,firstWatch:2.65,listenPause:.68,reacquirePause:.38,attackDot:.34,bellEchoSeconds:5});

/** Saved state is plain JSON. After creating it, main may use state.position as
 * its monster reference; stepEnemy never replaces that position object. */
export function createEnemyState(spawn={x:4,z:-30,level:0},saved=null){
  const state={version:1,position:point(spawn),mode:'dormant',clock:0,modeTime:0,activated:false,
    heading:Number.isFinite(spawn.heading)?spawn.heading:Math.PI,headYaw:0,headPitch:0,gait:0,speed:0,attention:0,crouch:0,lean:0,attackAligned:false,
    lastKnown:null,lastSeenAt:-100,lastHeardAt:-100,focusPoint:null,playerVisible:false,notice:0,wasVisible:false,everVisible:false,
    watchUntil:0,watchStarted:0,initialWatch:false,listenUntil:0,turnPauseUntil:0,nextPauseAt:8,huntCueAt:-100,
    route:[],routeAge:0,routeTarget:null,blockedTime:0,searchOrigin:null,searchTarget:null,searchIndex:0,searchPauseUntil:0,
    hearingCooldown:0,lastNoiseId:null,lastBellNoiseId:null,pendingBell:null,lastPhase:'idle',attackHeading:0,staggerUntil:0,recoilHeading:0,wasStunned:false,stepIndex:0};
  if(saved&&saved.version===1){
    if(validPoint(saved.position))Object.assign(state.position,point(saved.position));
    for(const key of ['clock','modeTime','heading','headYaw','headPitch','gait','speed','attention','crouch','lean','lastSeenAt','lastHeardAt','notice','watchUntil','watchStarted','listenUntil','turnPauseUntil','nextPauseAt','huntCueAt','routeAge','blockedTime','searchIndex','searchPauseUntil','hearingCooldown','attackHeading','staggerUntil','recoilHeading','stepIndex'])if(Number.isFinite(saved[key]))state[key]=saved[key];
    for(const key of ['activated','playerVisible','wasVisible','everVisible','initialWatch','wasStunned'])state[key]=!!saved[key];
    for(const key of ['lastKnown','focusPoint','routeTarget','searchOrigin','searchTarget'])state[key]=validPoint(saved[key])?point(saved[key]):null;
    state.route=Array.isArray(saved.route)?saved.route.filter(validPoint).slice(0,96).map(point):[];
    if(MODES.has(saved.mode))state.mode=saved.mode;
    if(typeof saved.lastNoiseId==='string'||typeof saved.lastNoiseId==='number')state.lastNoiseId=saved.lastNoiseId;
    if(typeof saved.lastBellNoiseId==='string'||typeof saved.lastBellNoiseId==='number')state.lastBellNoiseId=saved.lastBellNoiseId;
    if(validPoint(saved.pendingBell?.position)&&Number.isFinite(saved.pendingBell.expiresAt)&&saved.pendingBell.expiresAt>state.clock
        &&saved.pendingBell.id===state.lastBellNoiseId)state.pendingBell={id:saved.pendingBell.id,position:point(saved.pendingBell.position),expiresAt:Math.min(saved.pendingBell.expiresAt,state.clock+ENEMY_RULES.bellEchoSeconds)};
    if(['idle','windup','strike','recover','stunned','death'].includes(saved.lastPhase))state.lastPhase=saved.lastPhase;
    state.speed=clamp(state.speed,0,ENEMY_RULES.huntSpeed);state.attention=clamp(state.attention,0,1);state.crouch=clamp(state.crouch,0,1);
  }
  return state;
}
function mode(state,name){if(state.mode!==name){state.mode=name;state.modeTime=0;}}
function remember(state,where,kind){
  state.lastKnown=point(where);state.focusPoint=point(where);
  if(kind==='seen')state.lastSeenAt=state.clock;else state.lastHeardAt=state.clock;
  state.searchOrigin=null;state.searchTarget=null;state.searchIndex=0;
}
function height(nav,p){return typeof nav.actorHeight==='function'?finite(nav.actorHeight(p)):finite(p.y,(p.level||0)*3.35);}
function blocked(nav,a,b){return typeof nav.isBlocked==='function'?!!nav.isBlocked(a,b):false;}
function hearingRadius(nav,a,b,radius){return radius*(blocked(nav,a,b)?ENEMY_RULES.wallSoundFactor:1)*(sameLevel(a,b)?1:ENEMY_RULES.floorSoundFactor);}
function canSee(state,input,nav){
  const p=input.player,d=distance(state.position,p),dy=height(nav,p)-height(nav,state.position);
  if(Math.hypot(d,dy)>(input.hunt?ENEMY_RULES.huntVisionRange:ENEMY_RULES.visionRange)||blocked(nav,state.position,p))return false;
  if(d<3.3&&Math.abs(dy)<1.8)return true;
  // The narrow pupil does not mean a narrow field of view, but it cannot watch
  // through the back of its head. Sound can still draw it around.
  return Math.cos(angleDelta(bearing(state.position,p),state.heading+state.headYaw*.45))>.035;
}
function chooseSearchPoint(state,nav){
  const origin=state.searchOrigin||state.lastKnown||state.position;
  for(let attempt=0;attempt<10;attempt++){
    const index=state.searchIndex++,angle=index*2.399963+(state.attackHeading||0),radius=2.0+Math.min(5,Math.floor(index/3))*.72;
    const candidate={x:origin.x+Math.sin(angle)*radius,z:origin.z+Math.cos(angle)*radius,level:origin.level||0};
    if(typeof nav.isFreeAt==='function'&&!nav.isFreeAt(candidate,.32))continue;
    if(typeof nav.isFreeAt!=='function'&&typeof nav.isFree==='function'&&!nav.isFree(candidate.x,candidate.z,.32))continue;
    state.searchTarget=candidate;state.routeAge=0;return;
  }
  state.searchTarget=point(origin);state.searchPauseUntil=state.clock+1.5;
}
function startSearch(state,nav,events){
  if(state.mode!=='search'){mode(state,'search');state.searchOrigin=point(state.lastKnown||state.position);state.searchTarget=null;state.searchIndex=0;state.searchPauseUntil=state.clock+1.1;state.route=[];events.push('search');}
  if(!state.searchTarget&&state.clock>=state.searchPauseUntil)chooseSearchPoint(state,nav);
}
function look(state,target,nav,dt,input,locked=false){
  const desired=target?bearing(state.position,target):state.heading;
  const headTarget=target?clamp(angleDelta(desired,state.heading),-.82,.82):Math.sin(state.clock*.66)*.38;
  state.headYaw=turn(state.headYaw,headTarget,dt*2.4);
  const high=target?height(nav,target)+1.65-height(nav,state.position)-(2.4-state.crouch*1.05):0;
  const pitch=target?clamp(-Math.atan2(high,Math.max(1,distance(state.position,target))),-.42,.48):.04;
  state.headPitch+=(pitch-state.headPitch)*Math.min(1,dt*3.3);
  if(!locked){
    const rate=state.mode==='hunt'?2.75:state.mode==='watch'&&state.initialWatch?1.55:state.mode==='search'?1.25:1.06;
    if(!(state.mode==='watch'&&state.clock-state.watchStarted<.48))state.heading=turn(state.heading,desired,rate*dt);
    // Keep the gaze locked on its observed point as the shoulders catch up.
    state.headYaw=clamp(angleDelta(desired,state.heading),-.82,.82)*.67+state.headYaw*.33;
  }
}
function advanceRoute(state,target,desiredSpeed,nav,dt){
  if(!target){state.speed=0;return;}
  state.routeAge-=dt;
  const changed=!state.routeTarget||!sameLevel(target,state.routeTarget)||distance(target,state.routeTarget)>.9;
  // A remembered destination is stationary. Replanning it on every timer tick
  // re-inserts the nearest grid node behind us while we are still turning.
  // Keep a valid route until its target moves, it ends, or a real obstacle stops it.
  if(changed||(state.routeAge<=0&&(!state.route.length||state.blockedTime>1))){
    state.route=typeof nav.findPath==='function'?(nav.findPath(state.position,target)||[]).filter(validPoint).map(point):[];
    state.routeTarget=point(target);state.routeAge=state.mode==='hunt'?.8:1.5;
    // Only a swept, feet-height walkability check may shorten a route. Eye-level
    // line of sight is insufficient around furniture, floors and stair openings.
    if(typeof nav.isSegmentFree==='function'){
      let reachable=0;
      for(let i=0;i<state.route.length;i++){
        if(!sameLevel(state.position,state.route[i]))break;
        if(nav.isSegmentFree(state.position,state.route[i],.3))reachable=i;
      }
      if(reachable)state.route.splice(0,reachable);
    }
  }
  // A top landing directly above a bottom waypoint is not an arrived waypoint.
  while(state.route.length&&sameLevel(state.position,state.route[0])&&distance(state.position,state.route[0])<.22)state.route.shift();
  const next=state.route[0];
  if(!next){state.speed=0;state.blockedTime+=dt;return;}
  const goal=bearing(state.position,next),rotation=angleDelta(goal,state.heading);
  state.heading=turn(state.heading,goal,(state.mode==='hunt'?2.75:1.2)*dt);
  // Plant a foot before sharp turns, instead of skating sideways around corners.
  desiredSpeed*=clamp((1.35-Math.abs(rotation))/.7,0,1);
  const desired=clamp(desiredSpeed,0,ENEMY_RULES.huntSpeed),accel=desired>state.speed?(state.mode==='hunt'?4.8:1.6):7;
  const speed=state.speed+clamp(desired-state.speed,-accel*dt,accel*dt),d=distance(state.position,next),stride=Math.min(d,speed*dt);
  const before=point(state.position);
  if(d>.001&&typeof nav.move==='function')nav.move(state.position,(next.x-state.position.x)/d*stride,(next.z-state.position.z)/d*stride,.3);
  else if(d<=.001&&typeof nav.move==='function')nav.move(state.position,0,0,.3);
  const actual=distance(before,state.position);
  state.speed=dt?actual/dt:0;state.gait+=actual*3.2;
  if(actual<.001&&desired>.15){state.blockedTime+=dt;if(state.blockedTime>1.1)state.routeAge=0;}else state.blockedTime=0;
}
function finish(state,input,nav,dt,events){
  const p=input.player,d=distance(state.position,p),vertical=Math.abs(height(nav,p)-height(nav,state.position));
  // This is a geometric hit-arc result, not information used for navigation.
  state.attackAligned=vertical<1.25&&(d<.12||Math.cos(angleDelta(bearing(state.position,p),state.heading))>ENEMY_RULES.attackDot);
  const lower=state.playerVisible&&vertical<1.0&&d<8&&input.lamp!==false&&input.playerPitch<-.34&&state.mode!=='stunned'&&state.mode!=='attack'?clamp((-input.playerPitch-.34)/.65,0,1)*clamp((8-d)/3,0,1):0;
  state.crouch+=(lower-state.crouch)*Math.min(1,dt*(lower>state.crouch?1.15:1.8));
  const lean=(state.mode==='hunt'?.21:state.speed>.03?.065:0)+state.crouch*.22;
  state.lean+=(lean-state.lean)*Math.min(1,dt*3);
  const index=Math.floor(state.gait/Math.PI);
  if(index>state.stepIndex&&state.speed>.1)events.push(index%2?'stepLeft':'stepRight');
  state.stepIndex=index;state.lastPhase=input.attackPhase||'idle';state.wasVisible=state.playerVisible;
  return events;
}

/**
 * input: {player:{x,z,level}, active,hunt,playerMoving,playerRunning,
 * playerLooking,closedEyes,playerPitch,lamp,attackPhase,stun,dead,
 * noiseEvent?:{id,x,z,level,strength,kind}}.
 * noise strength is an unobstructed audible radius in metres. Each id is used
 * exactly once, even when out of range. An audible bell leaves a five-second
 * immutable echo, usable once after losing sight; it never tracks its ringer.
 * Nav supplies actorHeight, isBlocked,
 * findPath, move and optionally isFreeAt. The returned strings are cue events.
 */
export function stepEnemy(state,input,delta,nav){
  const events=[],dt=clamp(finite(delta),0,.1);if(!dt||!validPoint(input?.player))return events;
  state.clock+=dt;state.modeTime+=dt;state.hearingCooldown=Math.max(0,state.hearingCooldown-dt);
  if(state.pendingBell&&state.clock>=state.pendingBell.expiresAt)state.pendingBell=null;
  if(!input.active){if(input.noiseEvent?.id!==undefined)state.lastNoiseId=input.noiseEvent.id;state.pendingBell=null;mode(state,'dormant');state.speed=0;state.playerVisible=false;state.attackAligned=false;return events;}
  if(!state.activated){
    state.activated=true;remember(state,input.player,'seen');state.attention=1;state.watchUntil=state.clock+ENEMY_RULES.firstWatch;state.watchStarted=state.clock;state.initialWatch=true;state.nextPauseAt=state.clock+8;mode(state,'watch');events.push('awaken');
  }
  if(input.dead){state.speed=0;return finish(state,input,nav,dt,events);}
  const phase=input.attackPhase||'idle',stunned=input.stun>0||phase==='stunned';
  if(stunned){
    state.pendingBell=null;
    if(input.noiseEvent?.id!==undefined)state.lastNoiseId=input.noiseEvent.id;
    if(!state.wasStunned){remember(state,input.player,'heard');state.staggerUntil=state.clock+.42;state.recoilHeading=bearing(input.player,state.position);events.push('stagger');}
    state.wasStunned=true;mode(state,'stunned');state.playerVisible=false;state.speed=0;state.route=[];
    if(state.clock<state.staggerUntil&&typeof nav.move==='function'){
      const before=point(state.position);nav.move(state.position,Math.sin(state.recoilHeading)*.58*dt,Math.cos(state.recoilHeading)*.58*dt,.3);const actual=distance(before,state.position);state.speed=actual/dt;state.gait+=actual*3.2;
    }
    state.headYaw*=Math.max(0,1-dt*4);state.headPitch=.45;return finish(state,input,nav,dt,events);
  }
  if(state.wasStunned){state.wasStunned=false;state.watchUntil=state.clock+.74;state.watchStarted=state.clock;state.initialWatch=false;mode(state,'watch');events.push('recovering');}
  const seen=canSee(state,input,nav);state.notice=seen?Math.min(1,state.notice+dt*5):Math.max(0,state.notice-dt*7);state.playerVisible=seen&&state.notice>.12;
  if(state.playerVisible){
    if(!state.wasVisible&&state.everVisible&&state.clock-state.lastSeenAt>1.2){state.turnPauseUntil=state.clock+ENEMY_RULES.reacquirePause;events.push('reacquired');}
    state.everVisible=true;remember(state,input.player,'seen');state.attention=Math.min(1,state.attention+dt*1.6);
  }else{
    if(state.wasVisible){events.push('lostSight');state.routeAge=0;}
    state.attention=Math.max(.22,state.attention-dt*.045);
  }
  let heardPoint=null;
  const noise=input.noiseEvent;
  if(noise&&noise.id!==undefined&&noise.id!==null&&noise.id!==state.lastNoiseId){
    state.lastNoiseId=noise.id;
    const audible=validPoint(noise)&&distance(state.position,noise)<=hearingRadius(nav,state.position,noise,clamp(finite(noise.strength),0,140));
    if(noise.kind==='bell'){
      // Even an unheard bell ID is consumed. Reusing its object later cannot
      // manufacture a fresh echo when the creature has moved into range.
      if(noise.id!==state.lastBellNoiseId){
        state.lastBellNoiseId=noise.id;
        if(audible)state.pendingBell={id:noise.id,position:point(noise),expiresAt:state.clock+ENEMY_RULES.bellEchoSeconds};
      }
    }else if(audible)heardPoint=point(noise);
  }
  // Visual contact wins while it lasts. The copied bell position may attract
  // attention once during the decay, without continuously resetting a search.
  if(!state.playerVisible&&state.pendingBell&&!heardPoint&&!['windup','strike','recover'].includes(phase)){
    heardPoint=point(state.pendingBell.position);state.pendingBell=null;
  }
  if(!heardPoint&&input.playerMoving&&state.hearingCooldown<=0){
    const radius=input.closedEyes?ENEMY_RULES.quietHearing:input.playerRunning?ENEMY_RULES.runHearing:ENEMY_RULES.walkHearing;
    if(distance(state.position,input.player)<=hearingRadius(nav,state.position,input.player,radius)){
      heardPoint=point(input.player);state.hearingCooldown=input.playerRunning?.72:1.15;
    }
  }
  if(heardPoint&&!state.playerVisible){
    remember(state,heardPoint,'heard');state.attention=Math.max(.7,state.attention);
    if(!['listen','investigate','hunt','attack','recover'].includes(state.mode)&&state.clock>=state.watchUntil){state.listenUntil=state.clock+ENEMY_RULES.listenPause;mode(state,'listen');events.push('heard');}
  }
  if(phase==='windup'||phase==='strike'){
    if(state.lastPhase!=='windup'&&state.lastPhase!=='strike')state.attackHeading=state.heading;
    mode(state,'attack');state.speed=0;state.heading=state.attackHeading;look(state,state.focusPoint,nav,dt,input,true);return finish(state,input,nav,dt,events);
  }
  if(phase==='recover'){
    mode(state,'recover');state.speed=0;if(state.modeTime>.52)look(state,state.focusPoint,nav,dt,input);return finish(state,input,nav,dt,events);
  }
  const d=distance(state.position,input.player);
  if(!input.hunt&&state.playerVisible&&input.playerLooking&&d>9&&state.clock>=state.nextPauseAt&&state.clock>=state.watchUntil){state.watchUntil=state.clock+.75;state.watchStarted=state.clock;state.initialWatch=false;state.nextPauseAt=state.clock+8.5;mode(state,'watch');events.push('watching');}
  if(state.clock<state.watchUntil){mode(state,'watch');state.speed=0;look(state,state.focusPoint,nav,dt,input);return finish(state,input,nav,dt,events);}
  if(state.clock<state.listenUntil){mode(state,'listen');state.speed=0;look(state,state.focusPoint,nav,dt,input);return finish(state,input,nav,dt,events);}
  let target=null,speed=0;
  if(state.playerVisible){
    const next=input.hunt?'hunt':'stalk';if(next==='hunt'&&state.mode!=='hunt'&&state.clock-state.huntCueAt>5){events.push('hunt');state.huntCueAt=state.clock;}mode(state,next);target=state.lastKnown;
    speed=input.hunt?ENEMY_RULES.huntSpeed*(.95+.05*Math.sin(state.gait*1.4)):ENEMY_RULES.stalkSpeed*(.83+.17*Math.sin(state.gait*1.12+.7));
    if(d<1.5&&Math.abs(height(nav,input.player)-height(nav,state.position))<1.2)speed=0;
  }else if(state.lastKnown&&!(sameLevel(state.position,state.lastKnown)&&distance(state.position,state.lastKnown)<.85)&&state.mode!=='search'){
    mode(state,'investigate');target=state.lastKnown;speed=input.hunt?ENEMY_RULES.huntInvestigateSpeed:ENEMY_RULES.investigateSpeed;
  }else{
    startSearch(state,nav,events);
    if(state.searchTarget&&sameLevel(state.position,state.searchTarget)&&distance(state.position,state.searchTarget)<.6){state.searchTarget=null;state.searchPauseUntil=state.clock+1.2;state.route=[];}
    if(state.clock>=state.searchPauseUntil){if(!state.searchTarget)chooseSearchPoint(state,nav);target=state.searchTarget;speed=ENEMY_RULES.searchSpeed;}
  }
  if(state.clock<state.turnPauseUntil)speed=0;
  const focus=state.playerVisible?state.focusPoint:target||state.focusPoint;
  look(state,focus,nav,dt,input,!!target);
  if(speed>0)advanceRoute(state,target,speed,nav,dt);else {state.speed=0;if(target)state.heading=turn(state.heading,bearing(state.position,target),dt*1.15);}
  if(state.blockedTime>3.5&&!state.playerVisible){state.searchOrigin=point(state.lastKnown||state.position);mode(state,'search');state.searchTarget=null;state.searchPauseUntil=state.clock+.7;state.blockedTime=0;state.route=[];events.push('search');}
  return finish(state,input,nav,dt,events);
}
