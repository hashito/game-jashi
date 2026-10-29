// Small, serializable mechanisms. Time advances only with the corresponding
// activity: tuning uses panel time; the bell uses unpaused exploration time.
export const RADIO = Object.freeze({ target:72, range:100, holdSeconds:1.2 });
export const BELL = Object.freeze({ hearingRadius:65, cooldownSeconds:25 });
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

export function radioSignal(dial) {
  const value=Number.isFinite(Number(dial))?Number(dial):45;
  return clamp(1-Math.abs(value-RADIO.target)/24,0,1);
}

export function createMechanisms(saved={}) {
  return {
    dial:clamp(Number.isFinite(saved.dial)?saved.dial:45,0,RADIO.range),
    stable:0,
    bellReadyAt:Math.max(0,Number.isFinite(saved.bellReadyAt)?saved.bellReadyAt:0),
  };
}

export function adjustDial(state,value) {
  state.dial=clamp(Math.round(Number.isFinite(Number(value))?Number(value):state.dial),0,RADIO.range);
  state.stable=0;
  return radioSignal(state.dial);
}

export function advanceTuning(state,dt) {
  const signal=radioSignal(state.dial);
  state.stable=signal>=.9?Math.min(RADIO.holdSeconds,state.stable+clamp(dt,0,.25)):0;
  return {signal,progress:state.stable/RADIO.holdSeconds,ready:state.stable>=RADIO.holdSeconds};
}

export function ringBell(state,time) {
  const remaining=Math.max(0,state.bellReadyAt-time);
  if(remaining>0)return {rang:false,remaining};
  state.bellReadyAt=time+BELL.cooldownSeconds;
  return {rang:true,remaining:BELL.cooldownSeconds,hearingRadius:BELL.hearingRadius};
}

// v4.0.2: the shed and the evacuation hut have a single door. For a while
// after the player steps inside, the creature keeps its distance and does not
// stand in the doorway (a leash ring around the building, away from the door).
// After `warn` seconds the player is told clearly that staying is dangerous;
// after `release` seconds the ring is lifted and the creature comes in.
// Stepping out briefly does not reset the clock; only a real absence does.
export const SHELTER = Object.freeze({ warn:20, release:30, reset:10, margin:5.5, doorClear:6.8 });

export function createShelterState() {
  return { id:null, inside:0, outside:0, warned:false, released:false };
}

/** buildingId: the small building the player stands in now, or null. Returns cue events. */
export function updateShelter(state, buildingId, dt) {
  const events=[], step=clamp(Number.isFinite(dt)?dt:0,0,.25);
  if(buildingId){
    if(state.id!==buildingId){Object.assign(state,createShelterState(),{id:buildingId});events.push('enter');}
    state.outside=0;state.inside+=step;
    if(!state.warned&&state.inside>=SHELTER.warn){state.warned=true;events.push('warn');}
    if(!state.released&&state.inside>=SHELTER.release){state.released=true;events.push('release');}
  }else if(state.id){
    state.outside+=step;
    if(state.outside>=SHELTER.reset){Object.assign(state,createShelterState());events.push('leave');}
  }
  return events;
}

/** The ring that keeps the creature off the door while the player is inside, or null. */
export function shelterLeash(state, building, inside) {
  if(!building||!inside||state.released||state.id!==building.id)return null;
  return { x:building.x, z:building.z, radius:Math.max(building.w,building.d)/2+SHELTER.margin, door:{ x:building.entrance.x, z:building.entrance.z }, doorClear:SHELTER.doorClear };
}
