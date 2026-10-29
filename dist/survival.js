// Survival rules are independent of rendering, so attacks and escapes can be
// verified against real frame sequences without a GPU or browser timing.
// v4.0.1: tuned after a first-time playtest. A clean strike costs a third of the
// body (three hits kill), the raised scythe is readable for over a second, and
// eye contact drains slowly enough that looking away or closing the eyes works.
export const RULES=Object.freeze({walk:2.65,sprint:4.75,closedWalk:.85,staminaDrain:21,staminaRecover:16,stunSeconds:6.5,attackRange:2.65,strikeReach:.3,attackDamage:34,windup:1.05,strike:.25,recover:1.35,attackCooldown:1.1,gateSeconds:2.4,engineSeconds:4.2,gazeDrain:10.5,glassesGazeDrain:4.2,farGazeDistance:24,farGazeFactor:.55,gazeRecover:3,coveredGazeRecover:7});
export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function createSurvival(){return {health:100,sanity:100,stamina:100,exhausted:0,phase:'idle',phaseTime:0,phaseLength:1,stun:0,cooldown:1.2,grace:0,dead:false,hit:0,gazeTime:0,attackCount:0,lookCount:0};}
export function movementSpeed(state,{run=false,closed=false}={}){return closed?RULES.closedWalk:run&&state.stamina>1&&state.exhausted<=0?RULES.sprint:RULES.walk;}
export function stunEnemy(state){if(state.dead)return false;state.stun=RULES.stunSeconds;state.phase='stunned';state.phaseTime=RULES.stunSeconds;state.phaseLength=RULES.stunSeconds;state.cooldown=.9;return true;}
export function canThrow({charges,distance,blocked,dead=false}){return charges>0&&distance<=8.5&&!blocked&&!dead;}
export function endingFor(flags,completedChains){return flags.phone?'voice':completedChains>=2?'witness':'return';}
export function updateSurvival(state,input,delta){
  const dt=clamp(delta,0,.1),events=[];if(state.dead)return events;
  const moving=!!input.moving,closed=!!input.closed,running=!!input.run&&moving&&!closed&&state.exhausted<=0&&state.stamina>0;
  state.hit=Math.max(0,state.hit-dt*1.8);state.cooldown=Math.max(0,state.cooldown-dt);state.grace=Math.max(0,(state.grace||0)-dt);state.exhausted=Math.max(0,state.exhausted-dt);
  if(running){state.stamina=Math.max(0,state.stamina-RULES.staminaDrain*dt);if(state.stamina===0){state.exhausted=2.8;events.push('exhausted');}}
  else state.stamina=Math.min(100,state.stamina+RULES.staminaRecover*dt*(moving?.7:1));
  if(!input.active){state.sanity=Math.min(100,state.sanity+dt*3);return events;}
  // A respawn grace (or the stun) suspends eye contact; it never suspends recovery.
  const gaze=!!input.gaze&&!closed&&!input.blocked&&state.stun<=0&&state.grace<=0;
  if(gaze){if(state.gazeTime===0)state.lookCount++;state.gazeTime+=dt;const far=Number.isFinite(input.distance)&&input.distance>RULES.farGazeDistance?RULES.farGazeFactor:1;state.sanity-=dt*(input.glasses?RULES.glassesGazeDrain:RULES.gazeDrain)*far;}
  else{state.gazeTime=0;state.sanity+=dt*(closed||input.blocked?RULES.coveredGazeRecover:RULES.gazeRecover);}
  state.sanity=clamp(state.sanity,0,100);
  if(state.sanity<=0){state.health=0;state.dead=true;state.phase='death';events.push('gazeDeath');return events;}
  if(state.stun>0){state.stun=Math.max(0,state.stun-dt);state.phaseTime=state.stun;state.phase='stunned';if(state.stun===0){state.phase='idle';state.cooldown=.8;events.push('resumeHunt');}return events;}
  if(state.phase==='windup'){
    state.phaseTime-=dt;
    if(state.phaseTime<=0){state.phase='strike';state.phaseTime=RULES.strike;state.phaseLength=RULES.strike;events.push('swing');
      if(!input.blocked&&input.attackAligned!==false&&input.distance<RULES.attackRange+RULES.strikeReach){state.health=Math.max(0,state.health-RULES.attackDamage);state.sanity=Math.max(1,state.sanity-17);state.stamina=Math.max(0,state.stamina-14);state.hit=1;state.attackCount++;events.push('hit');if(state.health<=0){state.dead=true;state.phase='death';events.push('death');}}
      else events.push('miss');
    }
  }else if(state.phase==='strike'){
    state.phaseTime-=dt;if(state.phaseTime<=0){state.phase='recover';state.phaseTime=RULES.recover;state.phaseLength=RULES.recover;}
  }else if(state.phase==='recover'){
    state.phaseTime-=dt;if(state.phaseTime<=0){state.phase='idle';state.cooldown=RULES.attackCooldown;}
  // A strike may only begin from where the player can see it coming: in front
  // of or beside the camera (attackVisible), never from behind, and not during grace.
  }else if(input.distance<RULES.attackRange&&!input.blocked&&input.attackAligned!==false&&input.attackVisible!==false&&state.cooldown<=0&&state.grace<=0){
    state.phase='windup';state.phaseTime=RULES.windup;state.phaseLength=RULES.windup;events.push('windup');
  }
  return events;
}

export function advanceEscapeAction(action,{dt,distance,damaged,dead}){
  if(!action)return {action:null,result:null};
  if(dead||damaged||distance>3.6)return {action:null,result:'cancelled'};
  const next={...action,elapsed:action.elapsed+dt};
  return next.elapsed>=next.duration?{action:null,result:next.type}:{action:next,result:null};
}

// v4.0.2: where the raised scythe is, relative to the camera, and which way to
// get clear. yaw follows the camera: forward is (-sin, -cos), right is (cos, -sin).
export const THREAT_SIDES=Object.freeze({
  front:{label:'正面 — 横へ、離れる',arrow:'↑'},
  left:{label:'左から — 右へ離れる',arrow:'←'},
  right:{label:'右から — 左へ離れる',arrow:'→'},
  behind:{label:'背後 — 前へ走る',arrow:'↓'},
});
export function threatDirection({player,yaw=0,monster}={}){
  if(!player||!monster)return {side:'front',angle:0,...THREAT_SIDES.front};
  const dx=monster.x-player.x,dz=monster.z-player.z,d=Math.hypot(dx,dz);
  if(d<1e-6)return {side:'front',angle:0,...THREAT_SIDES.front};
  const forward=(-Math.sin(yaw)*dx-Math.cos(yaw)*dz)/d,right=(Math.cos(yaw)*dx-Math.sin(yaw)*dz)/d,angle=Math.atan2(right,forward);
  const side=Math.abs(angle)<=Math.PI/4?'front':Math.abs(angle)>=Math.PI*3/4?'behind':angle>0?'right':'left';
  return {side,angle,...THREAT_SIDES[side]};
}
