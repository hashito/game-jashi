import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {objectiveFor,describeSearch,SearchGuidance} from '../dist/guidance.js';
import {DOCUMENTS,DIALOGUE} from '../dist/narrative.js';

test('the whole route names a real prop, its exact place and how to use it',()=>{
  const flags={};
  const steps=[['telescope',null],['stairs','seen'],['radio','downstairs'],['glasses','radioTuned'],['note','glasses'],['bottle','note'],['crank','bottle'],['listen','crank'],['gate',null],['car','gate']];
  for(const [id,flag]of steps){
    if(flag)flags[flag]=true;
    const o=objectiveFor(flags,['gate','car'].includes(id)?5:4);
    assert.equal(o.id,id);for(const key of ['title','location','appearance','purpose','action','hint'])assert.ok(o[key],`${id}: ${key}`);
    if(o.image)assert.ok(fs.existsSync(new URL(`../dist/${o.image}`,import.meta.url)),`${id} uses the real prop photo`);
    assert.equal(Boolean(o.target),id!=='listen');
  }
  const b=objectiveFor({seen:true,downstairs:true,radioTuned:true,glasses:true,note:true},4);
  assert.match(b.title,/ボトル/);assert.match(b.location,/床/);assert.doesNotMatch(b.title,/箱/);
  assert.match(DOCUMENTS.note.paragraphs[1],/まず西/);assert.match(DIALOGUE.note[0].text,/先に西/);
});

test('early pickups, restored saves and optional evidence do not invent or repeat goals',()=>{
  const flags={seen:true,downstairs:true,radioTuned:true,glasses:true,crank:true,phone:true,photo:true};
  assert.equal(objectiveFor(flags,5).id,'gate','an already acquired crank can go straight to the gate');
  assert.equal(objectiveFor({...flags,note:true,bottle:true},4).target,null,'wait for actual story progression');
  assert.equal(objectiveFor(JSON.parse(JSON.stringify(flags)),5).id,'gate');
  assert.equal(objectiveFor({...flags,crank:false,note:true,bottle:true},4).id,'crank');
  assert.equal(objectiveFor({...flags,radioTuned:false},4).id,'radio');
});

test('local search and focus cues require the same floor, clear sight and open eyes',()=>{
  const o=objectiveFor({seen:true,downstairs:true,radioTuned:true,glasses:true,note:true},4);
  const near={level:0,distance:2,blocked:false,targetId:'bottle'};
  assert.equal(describeSearch(o,near).phase,'ready');
  assert.match(describeSearch(o,{...near,touch:true}).label,/タップ/);
  for(const blocked of [{blocked:true},{level:1},{closed:true},{distance:20}])assert.equal(describeSearch(o,{...near,...blocked}).near,false);
  assert.equal(describeSearch(o,{...near,targetId:'boots'}).phase,'search');
});

test('standard idle hints use game time, clear with progress and never repeat focus sounds',()=>{
  const guide=new SearchGuidance(),o=objectiveFor({},0);
  let context={level:1,distance:12,blocked:false,targetId:null};
  assert.equal(guide.update(o,context,0).hint,'');
  assert.equal(guide.update(o,context,0).hint,'','paused game clock stays still');
  assert.equal(guide.update(o,context,20).hint,o.hint);
  context={...context,distance:8};assert.equal(guide.update(o,context,21).hint,'','real progress folds away extra help');
  context={...context,distance:2,targetId:'telescope'};
  assert.equal(guide.update(o,context,22,{danger:true}).cue,false);
  assert.equal(guide.update(o,context,23).cue,true);
  assert.equal(guide.update(o,context,24).cue,false);
  assert.equal(guide.update(o,{...context,targetId:null},25).cue,false);
  assert.equal(guide.update(o,context,26).cue,false);
});
