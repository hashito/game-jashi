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
