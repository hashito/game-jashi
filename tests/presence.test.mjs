import test from 'node:test';
import assert from 'node:assert/strict';
import {distantPresence,advanceDoorPressure} from '../dist/presence.js';
import {restoreEvidence} from '../dist/evidence.js';
test('the walker already moves before looking through the telescope and never jumps at entry or phase boundaries',()=>{
  const a=distantPresence(21),b=distantPresence(22);assert.ok(Math.hypot(b.x-a.x,b.z-a.z)>.02);
  assert.deepEqual(distantPresence(21,{startedAt:21,total:0}),a);
  for(const total of [5,11,17]){const left=distantPresence(21+total,{startedAt:21,total:total-.0001});const right=distantPresence(21+total,{startedAt:21,total:total+.0001});assert.ok(Math.hypot(left.x-right.x,left.z-right.z)<.001);}
});
test('door pressure warns three times before opening, resets when the target is lost and freezes at zero dt',()=>{
  let state=null,events=[];for(let i=0;i<44;i++){const result=advanceDoorPressure(state,'shed-entry',.1);state=result.state;events.push(...result.events);}
  assert.equal(events.filter(e=>e==='knock').length,3);assert.equal(events.at(-1),'open');
  assert.equal(advanceDoorPressure(state,null,.1).state,null);assert.equal(advanceDoorPressure(state,'cabin-entry',0).state.elapsed,0);
  assert.equal(advanceDoorPressure(state,'shed-entry',0).state.elapsed,state.elapsed);
});
test('optional close-up records restore only known identifiers and accept old saves',()=>{
  assert.deepEqual([...restoreEvidence(null)],[]);assert.deepEqual([...restoreEvidence(['mirror','unknown','mirror'])],['mirror']);
});
