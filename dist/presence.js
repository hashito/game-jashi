import {REVEAL_POINT} from './layout.js';

// The same distant walker exists before, during and after the telescope.
// A reveal changes attention and framing, never visibility or spawn position.
export function distantPresence(time,scope=null){
  const elapsed=Math.max(0,Number(time)||0);
  const start=Number.isFinite(scope?.startedAt)?scope.startedAt:elapsed;
  const total=Math.max(0,Number(scope?.total)||0);
  // Ease to a stop over the last six seconds, retaining a continuous path.
  const late=Math.max(0,total-11),walkTime=scope?start+Math.min(total,11)+6*(1-Math.exp(-late/6)):elapsed;
  const a=walkTime*.115;
  const x=REVEAL_POINT.x+Math.sin(a)*1.25,z=REVEAL_POINT.z+Math.cos(a)*.7;
  const heading=Math.atan2(Math.cos(a)*1.25,-Math.sin(a)*.7);
  const speed=Math.hypot(Math.cos(a)*1.25,Math.sin(a)*.7)*.115*(scope?Math.exp(-late/6):1);
  return {x,z,level:0,heading,gait:walkTime*.8,speed,headYaw:0,headPitch:.1,crouch:0,lean:.04,mode:'stalk'};
}

// A door buys a little time; it cannot permanently imprison the creature.
export function advanceDoorPressure(state,doorId,dt){
  if(!doorId)return {state:null,events:[]};
  const next=state?.id===doorId?{...state}:{id:doorId,elapsed:0,knocks:0};
  next.elapsed+=Math.max(0,Math.min(.1,dt||0));
  const events=[];
  for(const at of [.5,1.8,3.1])if(next.elapsed>=at&&next.knocks<[.5,1.8,3.1].indexOf(at)+1){next.knocks++;events.push('knock');}
  if(next.elapsed>=4.4)events.push('open');
  return {state:next,events};
}
