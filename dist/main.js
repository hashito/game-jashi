import * as THREE from './vendor/three.module.js';
import { MountainWorld } from './world.js';
import { LANDMARKS, TRAILS, BUILDINGS, WORLD_BOUNDS, SPAWN, LORE_PLACEMENTS, PARKING, BRIDGE, FLOORS, STAIRS, BALCONY, REVEAL_POINT, MAP_ZONES, COVER_PATCHES, shelterAt } from './layout.js';
import { Soundscape } from './audio.js';
import { TapeEffects } from './vhs.js';
import { RULES, clamp, createSurvival, updateSurvival, movementSpeed, stunEnemy, canThrow, endingFor, advanceEscapeAction, threatDirection } from './survival.js';
import { INTRO, DOCUMENTS, LORE, CHAINS, DIALOGUE, ENDINGS, TELESCOPE_SCENES, endingParagraphs } from './narrative.js';
import { createEnemyState, stepEnemy, relocateEnemy } from './enemy.js';
import { createStoryState, advanceStory, getStoryDocument, canCompleteStoryChain, markStoryRead } from './story.js';
import { speakerProfile, dialogueDuration, createDialogueView, speechKind, tagSpeech, pruneSpeechQueue, enqueueSpeechLines, speechDuration } from './dialogue.js';
import { RADIO, createMechanisms, adjustDial, radioSignal, advanceTuning, ringBell, createShelterState, updateShelter, shelterLeash } from './gimmicks.js';
import { objectiveFor, SearchGuidance } from './guidance.js';
import { distantPresence, advanceDoorPressure } from './presence.js';
import { EVIDENCE, restoreEvidence } from './evidence.js';

const $=id=>document.getElementById(id), SAVE_KEY='jashi-mountain-checkpoint-v4', LEGACY_SAVE_KEY='jashi-mountain-checkpoint-v3', OPTIONS_KEY='jashi-mountain-options-v1', END_KEY='jashi-mountain-endings-v2';
const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}};
const write=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));}catch{}};
const remove=key=>{try{localStorage.removeItem(key);}catch{}};
const loadSavedGame=()=>read(SAVE_KEY,null)||read(LEGACY_SAVE_KEY,null);
// v4.0.1 early-section fairness. After the telescope the creature walks in from
// the forest and can be watched from the balcony, but it stays outside this ring
// around the cabin until the radio is tuned, unless the player lingers too long.
const EARLY=Object.freeze({leash:{x:0,z:24,radius:14},balconySeconds:90,downstairsSeconds:90,respawnGrace:5,respawnClearance:.8,respawnCreatureDistance:26});
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const defaults={volume:.45,muted:false,sensitivity:1,brightness:1.1,motion:!reduced,quality:'high',tape:reduced?.28:.68};
let options={...defaults,...read(OPTIONS_KEY,{})};
for(const [key,min,max]of [['volume',0,1],['sensitivity',.35,2],['brightness',.7,1.8],['tape',0,1]])options[key]=clamp(Number.isFinite(+options[key])?+options[key]:defaults[key],min,max);
const touch=matchMedia('(pointer: coarse)').matches;
const sound=new Soundscape();sound.setVolume(options.volume);sound.setMuted(options.muted);
const tape=new TapeEffects();let world,mode='title',previousMode='title',panelKind='',started=false,animationFrame,lastFrame=performance.now();
let player={x:SPAWN.x,z:SPAWN.z,level:SPAWN.level},yaw=SPAWN.yaw,pitch=-.02,enemy=createEnemyState(REVEAL_POINT),monster=enemy.position,time=0,survival=createSurvival();
let flags={},collected=new Set(),completed=new Set(),scares=new Set(),stats={},charges=0,lamp=true,glassesOn=false;
let keys={},autoWalk=false,joystick={x:0,y:0},touchEyes=false,touchRun=false,drag=null;
let currentTarget=null,action=null,checkpoint=null,lastSave=0,lastPhone=0,deathTime=0,throwTime=0,toastUntil=0,ambientTime=12;
let speechQueue=[],speechTime=0,speechTotal=0,conversation=[],activeSpeech=null,dialoguePaused=false;
const dialogueView=createDialogueView(document);
let companionState='present',mechanisms=createMechanisms(),radioActive=false;
let story=createStoryState(),scope=null,noiseEvent=null,noiseSerial=0,mapFloor='auto',lastStoryAdvance=0;
// v4.0.2: single-door shelter timer, one-time hints (drag to look, T to hold).
const HOLD_HINT_KEY='jashi-mountain-hold-hint-v1';
let shelter=createShelterState(),dragHints=0,lastDragHint=-999,holdHintShown=!!read(HOLD_HINT_KEY,false);
let searchGuidance=new SearchGuidance(),lastObjectiveId=null;
let examined=new Set(),doorPressure=null;
const freshFlags=()=>({seen:false,downstairs:false,glasses:false,key:false,note:false,bottle:false,crank:false,photo:false,phone:false,gate:false,hunt:false,firstAttack:false,phoneHint:false,bridge:false,shutterClosed:false,shutterUsed:false,radioTuned:false,bellUsed:false,leashUntil:0});
const textHTML=t=>String(t).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('\n','<br>');
const paragraphs=arr=>(arr||[]).map(t=>`<p>${textHTML(t)}</p>`).join('');
const button=(action,label,secondary=false)=>`<button type="button" data-action="${action}"${secondary?' class="secondary"':''}>${label}</button>`;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const actorDistance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z,(world?.actorHeight(a)||0)-(world?.actorHeight(b)||0));
const storyContext=()=>({flags,collected,completed,time,level:player.level});
const objectivePoint=o=>o.target||LANDMARKS[o.id];
function navigationTarget(){const objective=getObjective(),target=objectivePoint(objective);if(!target)return null;const onStairs=Math.abs(player.x-STAIRS.x)<STAIRS.width/2&&player.z>STAIRS.minZ&&player.z<STAIRS.maxZ;if(objective.id==='stairs')return onStairs?STAIRS.bottom:STAIRS.top;return (target.level||0)!==player.level?(onStairs?(target.level===1?STAIRS.top:STAIRS.bottom):(player.level===1?STAIRS.top:STAIRS.bottom)):target;}
const yawToward=(from,to)=>Math.atan2(-(to.x-from.x),-(to.z-from.z));
// The HUD bearing follows the A* route: it points at the furthest route point
// that can be walked to in a straight line, and reports the route's length.
function routeGuide(from,target){
  let route=[];try{route=world.findPathThroughDoors?.(from,target)||world.findPath(from,target)||[];}catch{route=[];}
  if(!route.length)return {point:target,length:distance(from,target)};
  let length=0,prev=from,pick=route[0];for(const p of route){length+=Math.hypot(p.x-prev.x,p.z-prev.z);prev=p;}
  for(let i=0;i<route.length&&i<16;i++){const p=route[i];if(!world.isSegmentFree(from,p,.3))break;pick=p;}
  return {point:pick,length};
}
let guide={at:-99,from:null,key:'',point:null,length:0};
// A* crosses floors itself, so the guide aims at the real destination (the
// stair foot for the stairs objective) instead of a stair-top proxy.
// Items sit on tables or shelves; route to a free spot from which they can be used.
const approaches=new Map();
function approachPoint(t){
  const key=`${t.x},${t.z},${t.level||0}`;if(approaches.has(key))return approaches.get(key);
  let best={x:t.x,z:t.z,level:t.level||0};
  if(!world.isFreeAt(best,.34))search:for(const r of [.6,.9,1.2,1.5,2,2.6])for(let i=0;i<16;i++){const a=i*Math.PI/8,q={x:t.x+Math.sin(a)*r,z:t.z+Math.cos(a)*r,level:t.level||0};if(world.isFreeAt(q,.34)&&!world.isBlocked(q,t)){best=q;break search;}}
  approaches.set(key,best);return best;
}
function guideTarget(){const o=getObjective(),t=o.id==='stairs'?STAIRS.bottom:objectivePoint(o);return t?approachPoint(t):null;}
function currentGuide(){
  const target=guideTarget();if(!target)return null;const key=`${target.x},${target.z},${target.level||0}`;
  if(!guide.from||guide.key!==key||guide.from.level!==player.level||distance(guide.from,player)>.6||time-guide.at>1.2){guide={...routeGuide({...player},target),at:time,from:{...player},key};}
  return guide;
}
function earlyLeash(){return flags.seen&&!flags.radioTuned&&time<(flags.leashUntil||0)?EARLY.leash:null;}
function openYaw(p){let best=yaw,score=-1;for(let i=0;i<16;i++){const a=i*Math.PI/8;let free=0;for(let r=.5;r<=6;r+=.5){if(!world.isSegmentFree(p,{x:p.x-Math.sin(a)*r,z:p.z-Math.cos(a)*r,level:p.level},.3))break;free=r;}if(free>score){score=free;best=a;}}return best;}
// Face along the route to the next objective, or the most open direction.
function faceRoute(){
  const target=guideTarget();let next=null;if(target){const g=routeGuide({...player},target);if(distance(g.point,player)>.5)next=g.point;}
  let facing=next?yawToward(player,next):openYaw(player);
  const ahead={x:player.x-Math.sin(facing)*1.4,z:player.z-Math.cos(facing)*1.4,level:player.level};
  if(!world.isSegmentFree(player,ahead,.3))facing=openYaw(player);
  yaw=facing;pitch=-.04;guide.at=-99;
}
// A checkpoint position may be against a wall or on the stairs: move to the
// nearest open spot on the same floor (never inside the stairwell).
function safeRespawnSpot(p){
  const ok=q=>world.isFreeAt(q,EARLY.respawnClearance)&&!world.inStairs?.(q);
  if(ok(p))return p;
  for(const r of [.4,.8,1.2,1.6,2.1,2.6,3.2,4,5])for(let i=0;i<16;i++){
    const a=i*Math.PI/8,q={x:p.x+Math.sin(a)*r,z:p.z+Math.cos(a)*r,level:p.level};
    if(ok(q)&&(!world.isFreeAt(p)||world.isSegmentFree(p,q,.3)))return q;
  }
  return p;
}
// Send the creature somewhere out of sight, away from the player, forgetting
// where the player was. Used after a respawn and when the early leash ends.
function relocateCreatureAway(minDistance=EARLY.respawnCreatureDistance){
  const candidates=[REVEAL_POINT,...TRAILS.flatMap(t=>t.points.map(([x,z])=>({x,z,level:0})))].map(c=>({x:c.x,z:c.z,level:0}));
  const usable=candidates.filter(c=>world.isFreeAt(c,.4)&&distance(c,player)>=minDistance).sort((a,b)=>distance(a,player)-distance(b,player));
  const where=usable.find(c=>world.isBlocked(player,c))||usable.at(-1)||{...REVEAL_POINT};
  relocateEnemy(enemy,{...where,heading:Math.atan2(where.x-player.x,where.z-player.z)});monster=enemy.position;
}
const cue=(name,position)=>sound.cue(name,position);
function quietSound(){sound.update({danger:0,moving:false,running:false,inside:true,time,listener:{...player,yaw},monster,monsterDistance:999,enemySpeed:0,paused:true,radioTuning:{active:false,signal:0,staticLevel:0}});}
function emitNoise(strength,kind='metal',position=player){noiseEvent={id:++noiseSerial,x:position.x,z:position.z,level:position.level||0,strength,kind};}
function storyBeat(event,{quiet=false}={}){
  const result=advanceStory(story,event,storyContext());
  if(result.dialogueKey&&!quiet)talk(result.dialogueKey,['sighting','gate','firstAttack','repel'].includes(event));
  if(result.stageChanged)lastStoryAdvance=time;
  const changes=(result.updates||[]).filter(u=>collected.has(u.id));
  if(changes.length&&!quiet)toast('記録に追記：'+changes.map(u=>u.title).slice(0,2).join(' ／ '),4600);
  checkChains();updateRecordBadge();updateObjective();maybeHunt();return result;
}
function updateRecordBadge(){
  let count=0;for(const id of collected){const d=getStoryDocument(id,storyContext(),story);if(d&&d.revision>(story.readRevisions?.[id]||0))count++;}
  $('record-updates').hidden=count===0;$('record-updates').textContent=count?String(count):'';
}
function toast(text,ms=3600){$('toast').textContent=text;$('toast').hidden=false;toastUntil=performance.now()+ms;}
// v4.0.2: every line carries its kind (critical / context / ambient), the time
// and the place it was triggered. Context lines expire when the player leaves
// the area, ambient reactions after a few seconds, and the backlog is capped.
// Critical lines are never dropped; dropped context lines stay in the log.
function enqueueSpeech(lines,priority=false,options={}){
  const tagged=tagSpeech(lines,{time,origin:options.origin||player,radius:options.radius});
  const result=enqueueSpeechLines(speechQueue,tagged,{priority,interrupted:priority&&activeSpeech&&speechTime>0?activeSpeech:null});
  speechQueue=result.queue;logDroppedSpeech(result.dropped);
  if(priority){speechTime=0;activeSpeech=null;}
  pruneSpeech();
}
function logDroppedSpeech(dropped){
  for(const {line}of dropped){if(speechKind(line)==='ambient'||line.logged)continue;conversation.push({...line,logged:true,time:Math.floor(time)});if(conversation.length>90)conversation.shift();}
}
function pruneSpeech(){if(!speechQueue.length)return;const result=pruneSpeechQueue(speechQueue,{time,player});if(result.dropped.length){speechQueue=result.queue;logDroppedSpeech(result.dropped);}}
function say(speaker,text,priority=false,options={}){enqueueSpeech([{speaker,text}],priority,options);}

function talk(key,priority=false){enqueueSpeech((DIALOGUE[key]||[]).map(line=>({...line,beat:key})),priority);}

function updateSpeech(dt){
  if(!dialoguePaused)speechTime-=dt;
  if(!dialoguePaused)pruneSpeech();
  if(speechTime>0){dialogueView.tick(speechTime,{paused:dialoguePaused,queued:speechQueue.length});return;}
  const previous=activeSpeech;activeSpeech=speechQueue.shift()||null;
  if(!activeSpeech){dialogueView.hide();dialoguePaused=false;return;}
  speechTime=speechTotal=speechDuration(activeSpeech,speechQueue.length);
  dialogueView.show(activeSpeech,{remaining:speechTime,total:speechTotal,queued:speechQueue.length,paused:dialoguePaused,previous:previous?.beat===activeSpeech.beat?previous:null});
  if(!activeSpeech.logged){conversation.push({...activeSpeech,time:Math.floor(time)});if(conversation.length>90)conversation.shift();}
  if(/^無線/.test(speakerProfile(activeSpeech).channel))cue('radio');
  $('subtitle-hold')?.classList.remove('hint');
  if(!holdHintShown&&mode==='play'){holdHintShown=true;write(HOLD_HINT_KEY,true);$('subtitle-hold')?.classList.add('hint');toast(touch?'「読む間停止」を押すと、会話を読むあいだ進行が止まります':'T で、会話を読むあいだ進行が止まります（もう一度 T で再開）',6500);}
}
function nextSpeech(){if(mode!=='play'||!activeSpeech)return;speechTime=0;updateSpeech(0);if(!dialoguePaused)lockPointer();}
function toggleDialogueHold(){
  if(mode!=='play'||!activeSpeech)return;dialoguePaused=!dialoguePaused;freezeInput();
  if(dialoguePaused){quietSound();document.exitPointerLock?.();$('interaction').hidden=true;}else lockPointer();
  dialogueView.tick(speechTime,{paused:dialoguePaused,queued:speechQueue.length});
}
function freezeInput(){keys={};autoWalk=false;joystick={x:0,y:0};touchEyes=false;touchRun=false;drag=null;$('joystick-knob').style.transform='translate(0,0)';}
function panel(kind,eyebrow,title,body,actions,closable=true){
  sound.stopGuideVoice?.();
  if(kind!=='radio')radioActive=false;hideAttackWarning();
  if(mode!=='panel')previousMode=mode;mode='panel';panelKind=kind;freezeInput();document.exitPointerLock?.();
  $('panel-eyebrow').textContent=eyebrow;$('panel-title').textContent=title;$('panel-body').innerHTML=body;$('panel-actions').innerHTML=actions;
  $('panel-close').hidden=!closable;$('panel').hidden=false;$('panel-body').scrollTop=0;$('veil').style.opacity=0;tape.canvas.hidden=true;
  quietSound();dialogueView.tick(speechTime,{paused:true});requestAnimationFrame(()=>$('panel-actions').querySelector('button')?.focus());
}
// v4.0.2: the drag hint appears at most twice per session, a minute apart.
function dragHint(){if(dragHints>=2||time-lastDragHint<60)return;dragHints++;lastDragHint=time;toast('画面をドラッグして見回せます',2200);}
function lockPointer(){if(touch||mode!=='play'||dialoguePaused)return;if(!world.canvas.requestPointerLock){dragHint();return;}try{world.canvas.requestPointerLock()?.catch?.(dragHint);}catch{dragHint();}}
function resume(){
  sound.stopGuideVoice?.();
  radioActive=false;quietSound();
  if(panelKind==='intro'){beginPlay();return;}
  if(['ending','death'].includes(panelKind)||previousMode==='title'){title();return;}
  $('panel').hidden=true;mode=previousMode==='scope'&&scope?'scope':'play';
  $('scope-sequence').hidden=mode!=='scope';document.body.dataset.scene=mode==='scope'?'scope':'explore';
  dialogueView.tick(speechTime,{paused:dialoguePaused});
  if(mode==='play')lockPointer();
}
function title(){
  sound.stopGuideVoice?.();
  dialoguePaused=false;radioActive=false;dialogueView.hide();
  $('panel').hidden=true;$('subtitle').hidden=true;$('action-status').hidden=true;$('scope-sequence').hidden=true;
  scope=null;mode='title';started=false;document.body.dataset.screen='title';document.body.dataset.scene='explore';freezeInput();document.exitPointerLock?.();tape.clear();tape.canvas.hidden=true;
  $('veil').style.opacity=0;$('danger-vignette').style.opacity=0;document.body.classList.remove('wearing-glasses','chased','injured');
  quietSound();$('continue-button').hidden=!validSave(loadSavedGame());
}
function newGame(){
  examined=new Set();doorPressure=null;world.restoreDoors?.(null);
  searchGuidance=new SearchGuidance();lastObjectiveId=null;
  sound.start();flags=freshFlags();collected=new Set();completed=new Set();scares=new Set();stats={repels:0,escapes:0};survival=createSurvival();story=createStoryState();
  player={x:SPAWN.x,z:SPAWN.z,level:SPAWN.level};yaw=SPAWN.yaw;pitch=-.02;enemy=createEnemyState(REVEAL_POINT);monster=enemy.position;time=0;charges=0;lamp=true;glassesOn=false;
  lastSave=0;lastPhone=0;ambientTime=12;action=null;checkpoint=null;speechQueue=[];activeSpeech=null;speechTime=0;conversation=[];throwTime=0;scope=null;noiseEvent=null;noiseSerial=0;mapFloor='auto';lastStoryAdvance=0;tape.clear();
  speechTotal=0;dialoguePaused=false;radioActive=false;mechanisms=createMechanisms();shelter=createShelterState();companionState='present';dialogueView.hide();
  $('scope-sequence').hidden=true;document.body.dataset.scene='explore';remove(SAVE_KEY);remove(LEGACY_SAVE_KEY);syncWorld();
  const instruction=touch?'左のスティックで移動。右側をなぞって見回します。':'W A S D で移動、マウスで見回し、E で調べます。';
  panel('intro',INTRO.eyebrow,INTRO.title,'<figure class="scene-photo"><img src="assets/photos/arrival-v4-1.webp" alt="片付け前の別荘。開いた戸の先のベランダに望遠鏡がある" width="1400" height="788"><figcaption>到着した日の、二階の記録</figcaption></figure><div class="ending-copy">'+paragraphs(INTRO.paragraphs)+'</div><div class="intro-hint">'+instruction+'<br>まずは二階のベランダの望遠鏡へ。「詳しく」で探す物の見本を確認できます。</div>',button('begin','録画を始める'),false);previousMode='play';
}
function beginPlay(){
  started=true;mode='play';$('panel').hidden=true;document.body.dataset.screen='play';document.body.dataset.scene='explore';lockPointer();storyBeat('opening');saveCheckpoint();
}
function syncWorld(){
  if(!world)return;world.setGateOpen(!!flags.gate);world.setShutterClosed?.(!!flags.shutterClosed);
  for(const id of ['glasses','bottle','crank'])world.setItemCollected(id,!!flags[id]);world.setStairGuide?.(!!flags.seen&&!flags.downstairs);
  for(const [id,item]of Object.entries(world.items)){if(!['glasses','bottle','crank'].includes(id))item.marker.visible=!(collected.has(id)||flags[id]||id==='telescope'&&flags.seen);}
  updateInventory();updateRecordBadge();updateObjective();
}
function getObjective(){
  return objectiveFor(flags,story.stage);
}
function updateObjective(){
  const o=getObjective();$('chapter-label').textContent=o.chapter;$('objective').textContent=o.title;
  $('search-open-label').textContent=touch?'詳しく':'Hで詳しく';
  $('search-location').textContent=o.location;$('search-thumb').hidden=!o.image;
  if(o.image)$('search-thumb').src=o.image;
  if(lastObjectiveId!==o.id){
    if(lastObjectiveId&&mode==='play')cue('objective');
    sound.stopGuideVoice?.();lastObjectiveId=o.id;guide.at=-99;
    $('search-phase').textContent=o.action;$('search-idle-hint').hidden=true;
  }
}
function updateSearchGuidance(closed=false){
  const o=getObjective(),t=o.target,near=t?actorDistance(player,t):Infinity;
  const danger=survival.phase==='windup'||survival.phase==='strike'||enemy.mode==='hunt'&&distance(player,monster)<13;
  const v=searchGuidance.update(o,{level:player.level,distance:near,blocked:t?world.isBlocked(player,t):true,targetId:currentTarget?.id,closed,touch},time,{danger});
  $('search-card').dataset.phase=action?'working':v.phase;
  $('search-phase').textContent=action?`${action.type==='gate'?'巻き上げ中':'始動中'}。その場を離れず待ってください`:v.label;
  $('search-idle-hint').textContent=v.hint;$('search-idle-hint').hidden=!!action||!v.hint;
  if(v.cue&&!action)cue('found');
  world.searchTarget=v.near?o.id:null;
}
function searchDetails(){
  const o=getObjective();return `<section class="search-detail">${o.image?`<figure><img src="${o.image}" alt="${textHTML(o.title)}のゲーム内の見本" width="320" height="240"><figcaption>ゲーム内の物と同じ形です</figcaption></figure>`:''}<div><p class="search-kicker">いま探すもの</p><h3>${textHTML(o.title)}</h3><dl><dt>場所</dt><dd>${textHTML(o.location)}</dd><dt>見た目</dt><dd>${textHTML(o.appearance)}</dd><dt>目的</dt><dd>${textHTML(o.purpose)}</dd><dt>操作</dt><dd>${textHTML(o.action)}${['stairs','listen'].includes(o.id)?'':touch?'。「調べる」をタップします。':'。近づいてEを押します。'}</dd></dl><p class="search-tip">${textHTML(o.hint)}</p></div></section>`;
}
function searchHelp(){
  const o=getObjective();panel('search-help','探し物の見本と手順','次にすること',searchDetails()+`<p id="guide-voice-status" class="small-note" role="status">説明を読む間は、ゲームが止まります。</p>`,(o.voice?button('guide-voice','修司の案内を聞く',true):'')+button('journal','地図で場所を見る',true)+button('close-panel','探索へ戻る'));
}
async function playSearchVoice(){
  if(mode!=='panel'||panelKind!=='search-help')return;
  const o=getObjective(),status=$('guide-voice-status');if(!o.voice)return;
  const request=Symbol('guide-voice');status.voiceRequest=request;
  const current=()=>mode==='panel'&&panelKind==='search-help'&&getObjective().id===o.id&&$('guide-voice-status')===status&&status.voiceRequest===request;
  if(sound.guidePlaying){sound.stopGuideVoice();status.textContent='案内の音声を止めました。';return;}
  status.textContent='案内を準備しています…';
  const result=await sound.playGuideVoice?.(o.voice,()=>{if(current())status.textContent='案内が終わりました。もう一度聞くこともできます。';});
  if(!current())return;
  status.textContent=result==='playing'?'修司の案内を再生中。もう一度押すと止まります。':result==='muted'?'音が切になっています。設定で音を入れると聞けます。':result==='cancelled'?'案内の再生を取り消しました。':'音声を読み込めませんでした。見本と文章で手順を確認できます。';
}
function updateInventory(){
  $('inventory-lamp').classList.toggle('equipped',lamp);$('inventory-glasses').classList.toggle('unavailable',!flags.glasses);$('inventory-glasses').classList.toggle('equipped',glassesOn);
  $('inventory-bottle').classList.toggle('unavailable',charges<1);$('inventory-bottle').classList.toggle('active',charges>0);
  $('inventory-glasses').title=flags.glasses?(glassesOn?'装着中 · Qで外す':'Qでかける'):'別荘の机にある';$('inventory-bottle').title=`ボトル：残り ${charges} 回 / 8.5m以内でR`;
  $('charge-count').textContent=charges?`×${charges}`:'—';$('mute-button').textContent=options.muted?'音：切':'音：入';document.body.classList.toggle('wearing-glasses',glassesOn);
}
function serialize(){return {v:4,doors:world.snapshotDoors?.()||{},examined:[...examined],flags:{...flags},collected:[...collected],completed:[...completed],scares:[...scares],stats:{...stats},player:{...player},enemy:JSON.parse(JSON.stringify(enemy)),story:JSON.parse(JSON.stringify(story)),yaw,pitch,time,survival:{...survival},charges,lamp,glassesOn,conversation:conversation.slice(-60),speechQueue:speechQueue.map(l=>({...l})),activeSpeech:activeSpeech?{...activeSpeech}:null,speechTime,speechTotal,lastStoryAdvance,noiseSerial,mechanisms:{dial:mechanisms.dial,bellReadyAt:mechanisms.bellReadyAt}};}
function validSave(s){return !!(s&&[3,4].includes(s.v)&&s.flags&&s.player&&s.survival&&s.enemy&&s.story&&Number.isFinite(s.player.x)&&Number.isFinite(s.player.z)&&[0,1].includes(s.player.level)&&s.player.x>=WORLD_BOUNDS.minX&&s.player.x<=WORLD_BOUNDS.maxX&&s.player.z>=WORLD_BOUNDS.minZ&&s.player.z<=WORLD_BOUNDS.maxZ&&Number.isFinite(s.time)&&s.survival.health>0);}
function saveCheckpoint(){
  if(!started||survival.dead||mode==='title'||mode==='dying'||mode==='scope')return;
  if(flags.seen&&(actorDistance(player,monster)<11||survival.health<55||survival.sanity<40||survival.phase==='windup'))return;
  checkpoint=serialize();write(SAVE_KEY,checkpoint);$('continue-button').hidden=false;
}
function restore(s){
  if(!validSave(s)){toast('再開できる記録がありません');return;}
  searchGuidance=new SearchGuidance();lastObjectiveId=null;
  examined=restoreEvidence(s.examined);doorPressure=null;
  sound.start();flags={...freshFlags(),...s.flags};collected=new Set(s.collected||[]);completed=new Set(s.completed||[]);scares=new Set(s.scares||[]);stats={repels:0,escapes:0,...s.stats};
  if(s.v===3&&s.story.stage>=3)flags.radioTuned=true;
  mechanisms=createMechanisms(s.mechanisms);companionState=flags.seen?'away':'present';radioActive=false;dialoguePaused=false;
  player={...s.player};enemy=createEnemyState(REVEAL_POINT,s.enemy);monster=enemy.position;story=createStoryState(s.story);yaw=s.yaw||0;pitch=clamp(s.pitch||0,-1.2,1.2);time=s.time;
  world.restoreDoors?.(s.doors,[player]);
  survival={...createSurvival(),...s.survival,phase:'idle',phaseTime:0,stun:0,dead:false,hit:0,cooldown:2};
  shelter=createShelterState();charges=clamp(s.charges||0,0,2);lamp=s.lamp!==false;glassesOn=!!s.glassesOn;conversation=s.conversation||[];speechQueue=Array.isArray(s.speechQueue)?s.speechQueue.map(l=>({...l})):[];activeSpeech=s.activeSpeech?{...s.activeSpeech}:null;speechTime=activeSpeech?Math.max(0,s.speechTime||0):0;lastStoryAdvance=Number.isFinite(s.lastStoryAdvance)?s.lastStoryAdvance:time;action=null;scope=null;noiseEvent=null;noiseSerial=s.noiseSerial||0;
  throwTime=0;lastSave=time;lastPhone=time;ambientTime=12;mapFloor='auto';speechTotal=activeSpeech?Math.max(speechTime,dialogueDuration(activeSpeech)):0;freezeInput();
  world.setGateOpen(!!flags.gate);world.setShutterClosed?.(!!flags.shutterClosed);
  if(!world.isFreeAt(player)){player=safeRespawnSpot(player);if(!world.isFreeAt(player))player=player.level===0?{...STAIRS.bottom}:{x:SPAWN.x,z:SPAWN.z,level:SPAWN.level};}
  if(!world.isFreeAt(monster,.3)){enemy=createEnemyState(REVEAL_POINT);monster=enemy.position;}
  // v4.0.1 respawn safety: an open spot facing the route, the creature out of
  // sight and away, a short grace without gaze drain or strikes.
  if(flags.seen){
    player=safeRespawnSpot(player);
    const d=actorDistance(player,monster);if(d<EARLY.respawnCreatureDistance-2||d<40&&!world.isBlocked(player,monster))relocateCreatureAway();
    survival.grace=EARLY.respawnGrace;survival.cooldown=Math.max(survival.cooldown,EARLY.respawnGrace);
    if(!flags.radioTuned)flags.leashUntil=Math.max(flags.leashUntil||0,time+EARLY.downstairsSeconds);
  }
  faceRoute();
  syncWorld();tape.clear();if(activeSpeech&&speechTime>0)dialogueView.show(activeSpeech,{remaining:speechTime,total:speechTotal,queued:speechQueue.length});else dialogueView.hide();checkpoint=s;started=true;mode='play';$('panel').hidden=true;$('scope-sequence').hidden=true;document.body.dataset.screen='play';document.body.dataset.scene='explore';lockPointer();toast('記録から再開しました');
}
function startTelescope(){
  if(flags.seen||mode!=='play')return;
  freezeInput();scope={phase:0,elapsed:0,total:0,entered:-1,startedAt:time};mode='scope';document.body.dataset.scene='scope';$('panel').hidden=true;$('scope-sequence').hidden=false;$('subtitle').hidden=true;$('interaction').hidden=true;
  dialoguePaused=false;companionState='leaving';
  document.exitPointerLock?.();
  for(const line of speechQueue.filter(l=>l.beat==='opening'))conversation.push({...line,time:Math.floor(time)});
  speechQueue=speechQueue.filter(l=>l.beat!=='opening');if(activeSpeech?.beat==='opening'){activeSpeech=null;speechTime=0;}
  sound.start();showScopeBeat();
}
function showScopeBeat(){
  if(!scope)return;const scene=TELESCOPE_SCENES[scope.phase];scope.entered=scope.phase;
  $('scope-eyebrow').textContent=scene.eyebrow||'二階のベランダ ／ 望遠鏡';
  $('scope-title').textContent=scene.title;$('scope-text').innerHTML=paragraphs(scene.paragraphs);
  $('scope-counter').textContent=String(scope.phase+1).padStart(2,'0')+' / 03';
  if(scene.cue)cue(scene.cue,player);
}
function stepScope(dt){
  if(mode!=='scope'||!scope)return;
  time+=dt;scope.elapsed+=dt;scope.total+=dt;
  const scene=TELESCOPE_SCENES[scope.phase];
  if(scope.elapsed>=scene.duration){
    if(scope.phase<TELESCOPE_SCENES.length-1){scope.phase++;scope.elapsed=0;showScopeBeat();}
    else{encounter();return;}
  }
  const total=TELESCOPE_SCENES.reduce((n,s)=>n+s.duration,0);
  $('scope-progress').style.width=(scope.total/total*100)+'%';
  $('scope-leave').hidden=!(scope.phase===2&&scope.elapsed>TELESCOPE_SCENES[2].duration-1.25);
  $('tape-clock').textContent='00:'+String(Math.floor(time/60)).padStart(2,'0')+':'+String(Math.floor(time%60)).padStart(2,'0');
  const danger=scope.phase===2?clamp(scope.elapsed/scene.duration*.8,0,.8):0;
  sound.update({danger,moving:false,running:false,inside:true,time,monsterDistance:scope.phase===2?17:80,pursuit:false,listener:{...player,yaw},monster:REVEAL_POINT,occluded:false,surface:'wood',enemyMode:'watch',enemySpeed:0,radioTuning:{active:false}});
}
function encounter(){
  if(flags.seen)return;
  flags.seen=true;collected.add('telescope');survival.sanity=83;companionState='away';
  const finalPresence=distantPresence(time,scope);
  enemy=createEnemyState({...finalPresence,heading:Math.atan2(player.x-finalPresence.x,player.z-finalPresence.z)});enemy.gait=finalPresence.gait;monster=enemy.position;scope=null;flags.leashUntil=time+EARLY.balconySeconds;mode='play';$('panel').hidden=true;$('scope-sequence').hidden=true;document.body.dataset.scene='explore';
  tape.trigger('encounter');cue('whisper',player);storyBeat('sighting');syncWorld();lockPointer();saveCheckpoint();
}
function maybeHunt(){
  if(flags.seen&&flags.crank&&story.stage>=5&&!flags.hunt){flags.hunt=true;emitNoise(55,'crank');cue('hunt');tape.trigger('hunt');toast('金具が鳴った。森の足音が止まる。',4200);}
}
// v4.0.2: pictures of the in-game item models (tools/make-item-images.mjs).
const ITEM_IMAGES=new Set(['glasses','note','bottle','crank','photo','phone','radio','bell','telescope','boots','ledger','cassette','mirror','ribbon','toy','tag']);
const itemImage=(id,cls='item-figure')=>ITEM_IMAGES.has(id)?`<img class="${cls}" src="assets/items/${id}.webp" alt="" width="320" height="240" decoding="async">`:'';
function docHTML(d,id=''){
  let body=!d.image&&ITEM_IMAGES.has(id)?`<figure class="item-shot">${itemImage(id)}<figcaption>DVで撮った ${textHTML(d.title)}</figcaption></figure>`:'';
  body+=d.image?'<figure class="photo-frame"><img src="'+d.image+'" alt="'+textHTML(d.title)+'"><figcaption>'+textHTML(d.caption||'撮影した記録。')+'</figcaption></figure>':'';
  const detail=EVIDENCE[id];
  if(detail?.image)body+=`<figure class="photo-frame evidence-photo"><img src="${detail.image}" alt="${textHTML(detail.alt)}" width="960" height="720" loading="lazy" decoding="async"><figcaption>${textHTML(detail.caption)} ／ 記録の細部</figcaption></figure>`;
  if(d.unread)body+='<p class="record-revision">撮影した面を見返して、分かったことがある。</p>';
  body+='<div class="document-card">'+paragraphs(d.paragraphs)+'</div>';
  if(d.pending)body+='<p class="small-note record-pending">裏面や細かい字も撮影してある。ほかの記録と照合できそうだ。</p>';
  if(detail)body+=examined.has(id)?`<section class="linked-story"><small>細部の記録</small><p>${textHTML(detail.result)}</p></section>`:`<div class="evidence-action"><p>記録を止めて、細部を確かめられます（任意）。</p>${button('examine-'+id,detail.action,true)}</div>`;
  return body;
}
function checkChains(){
  const newly=[];
  for(const[id,chain]of Object.entries(CHAINS)){if(!completed.has(id)&&canCompleteStoryChain(id,storyContext(),story)){completed.add(id);newly.push(chain);}}
  return newly;
}
function readObject(id,collect=true){
  if(!LORE[id]&&!DOCUMENTS[id])return;
  const first=!collected.has(id);
  if(collect){collected.add(id);if(id in flags)flags[id]=true;if(world.items[id])world.items[id].marker.visible=false;}
  const prior=new Set(completed);if(first&&collect)storyBeat(DOCUMENTS[id]?id:'collect:'+id);
  const d=getStoryDocument(id,storyContext(),story);if(!d)return;
  const chains=checkChains();for(const key of completed)if(!prior.has(key)&&!chains.includes(CHAINS[key]))chains.push(CHAINS[key]);
  cue(['cassette','mirror'].includes(id)?'tape':id==='toy'?'bell':'page',player);
  let body=docHTML(d,id);
  for(const c of chains)body+='<section class="linked-story"><small>つながった記録</small><h3>'+textHTML(c.title)+'</h3>'+paragraphs(c.paragraphs)+'</section>';
  markStoryRead(story,id,d.revision);updateRecordBadge();
  panel('document',d.eyebrow||'備品記録 / '+(d.category||'拾得物'),d.title,body,button('close-panel','記録を閉じる'));
  if(first&&collect){
    for(const line of d.after||[])say(line.speaker,line.text);
    if(flags.seen&&(id==='cassette'||id==='mirror')){tape.trigger('tape');world.triggerScare('shelf');}
    if(flags.seen&&id==='boots')cue('knock');if(flags.seen&&id==='ribbon')world.triggerScare('bridge');
    maybeHunt();updateObjective();saveCheckpoint();
  }
}
function findTarget(){
  if(!world||keys.KeyC||keys.Space||touchEyes)return null;
  const fx=-Math.sin(yaw),fz=-Math.cos(yaw);let best=null,score=Infinity;
  for(const item of Object.values(world.items)){
    if(['glasses','bottle','crank'].includes(item.id)&&flags[item.id])continue;
    if(item.id==='telescope'&&flags.seen)continue;
    if(item.id==='gate'&&flags.gate)continue;
    if(Math.abs(world.actorHeight(player)-world.actorHeight(item))>1.25)continue;
    const d=actorDistance(player,item);if(d>3.4)continue;
    const planar=Math.max(.001,distance(player,item)),dot=fx*(item.x-player.x)/planar+fz*(item.z-player.z)/planar;
    // The shutter handle is reachable from either side of its own closed leaf.
    // Height is checked above, so this exception cannot reach through a floor.
    if(d>.85&&dot<.28||item.id!=='shutter'&&world.isBlocked(player,item))continue;
    // Keep the actual usable range/occlusion; gently prefer the sought item
    // when two neighbouring objects are both under the player's view.
    const value=d+(1-dot)*1.4-(item.id===getObjective().id ? .3 : 0);if(value<score){best=item;score=value;}
  }
  const door=world.getDoorTarget?.(player,yaw);
  if(door&&(!best||door.distance+.35<score)){best=door;score=door.distance+.35;}
  const art=world.getArtTarget?.(player,yaw);
  if(art&&(!best||art.distance+.65<score))return art;
  return best;
}

function readSceneArt(item){
  cue('page',item);
  panel('scene-art','山に残された掲示 / 写真',item.title,
    `<figure class="photo-frame scene-art-photo"><img src="${textHTML(item.image)}" alt="${textHTML(item.alt||item.title)}" width="512" height="512" decoding="async"><figcaption>${textHTML(item.caption||item.label)}</figcaption></figure>${paragraphs(item.text.split('\n'))}`,
    button('close-panel','探索に戻る'));
}

function interact(){
  if(mode!=='play'||survival.dead||dialoguePaused)return;if(action){action=null;toast('手を止めた');return;}
  const item=findTarget();if(!item){toast('調べるものに近づき、そちらを向いてください',2000);return;}const id=item.id;cue('interact');
  if(item.kind==='sceneArt'){readSceneArt(item);return;}
  if(item.kind==='door'){
    const actors=[player,monster];if(companionState!=='away'&&world.companionPos)actors.push(world.companionPos);
    const result=world.toggleDoor(id,actors);
    if(result.blocked){toast('戸口から一歩離れてから閉めてください。',2400);return;}
    if(result.changed){cue(result.open?'doorOpen':'doorClose',item);emitNoise(result.open?10:15,'door',item);guide.at=-99;approaches.clear();saveCheckpoint();toast(result.open?'戸を開けた。':'戸を閉めた。視線は切れるが、長くは持たない。',3000);}
    return;
  }
  if(id==='telescope'){
    if(flags.seen){say('私','レンズには、もう触らない。');return;}
    startTelescope();return;
  }
  if(id==='shutter'){
    // Closing from the balcony means stepping into the room and pulling the
    // leaves shut behind you; nobody is left outside the closed shutter.
    const fromBalcony=!flags.shutterClosed&&player.level===1&&player.z<BALCONY.maxZ-.1;
    if(fromBalcony){const inside={x:clamp(player.x,-.9,.9),z:19.75,level:1};if(world.isFreeAt(inside)){Object.assign(player,inside);faceRoute();}}
    flags.shutterClosed=!flags.shutterClosed;world.setShutterClosed(flags.shutterClosed);
    cue(flags.shutterClosed?'shutterClose':'shutterOpen',item);emitNoise(18,'shutter',item);
    toast(flags.shutterClosed?(fromBalcony?'部屋に入り、雨戸を閉めた。窓越しの視線が途切れる。':'雨戸を閉めた。窓越しの視線が途切れる。'):'雨戸を開けた。',3000);
    if(flags.shutterClosed&&!flags.shutterUsed){flags.shutterUsed=true;storyBeat('shutter');}
    saveCheckpoint();return;
  }
  if(id==='radio'){
    if(!flags.seen){say('私','無線は、あとで修司と合わせる。先に二階の備品を撮ろう。');return;}
    if(flags.radioTuned){say('私','受信は安定している。修司の声は、手元の無線でも聞こえる。');return;}
    openRadio();return;
  }
  if(id==='bell'){
    const result=ringBell(mechanisms,time);
    if(!result.rang){toast(`まだ余韻が残っている。あと ${Math.ceil(result.remaining)} 秒。`,2200);return;}
    world.ringBell(time);emitNoise(result.hearingRadius,'bell',item);cue('bellNeeded',item);
    toast('鐘が鳴った。材木の陰へ抜け、その場から離れる。',4000);
    if(!flags.bellUsed){flags.bellUsed=true;storyBeat('bell');}
    saveCheckpoint();return;
  }
  if(id==='glasses'){
    flags.glasses=true;flags.key=true;collected.add(id);glassesOn=true;world.setItemCollected(id,true);cue('keyPickup');updateInventory();storyBeat('glasses');saveCheckpoint();toast('サングラスをかけた。車とゲートの鍵も持った。',4200);return;
  }
  if(id==='bottle'||id==='crank'){
    flags[id]=true;if(id==='bottle')charges=2;world.setItemCollected(id,true);cue(id==='bottle'?'bottlePickup':'crankPickup');updateInventory();readObject(id);return;
  }
  if(id==='note'||id==='photo'||LORE[id]){readObject(id);return;}
  if(id==='phone'){
    if(flags.phone){say('私','着信履歴には、何も残っていない。');return;}
    if(story.stage<4){say('私','泥の上に古い携帯がある。表示は、圏外。');return;}
    cue('phone',LANDMARKS.phone);emitNoise(24,'phone',item);
    panel('phone','表示：圏外 ／ 着信中','出るはずのない電波。',`<div class="phone-display"><span>圏外</span><strong>非通知</strong><small>着信中 …</small></div><div class="ending-copy"><p>古い携帯が、道の脇で鳴っている。<br>表示は圏外。修司の無線とは、別の音だ。</p><p>指を伸ばすと、呼び出し音が一度だけ短くなった。</p></div>`,button('answer-phone','電話に出る')+button('ignore-phone','今は離れる',true));return;
  }
  if(id==='gate'){
    if(!flags.key){toast('別荘の机に置いた鍵束が必要だ。');return;}
    if(!flags.crank){toast('巻き上げハンドルがない。小屋に保管されていそうだ。',4500);return;}
    if(story.stage<5){toast(flags.seen?'無線が入っている。ハンドルの扱いを、修司に確かめる。':'二階の備品を、まだ撮り終えていない。',4000);return;}
    action={type:'gate',elapsed:0,duration:RULES.gateSeconds,target:{x:item.x,z:item.z,level:item.level||0}};emitNoise(95,'gate',item);cue('gate');toast('巻き上げ中。離れると中断します',2300);return;
  }
  if(id==='car'){
    if(!flags.key||!flags.gate){toast('鍵を手に入れて、林道ゲートを開ける必要がある。');return;}
    if(!flags.seen){say('私','まだ、二階の備品を撮り終わっていない。');return;}
    action={type:'engine',elapsed:0,duration:RULES.engineSeconds,target:{x:item.x,z:item.z,level:item.level||0}};emitNoise(90,'engine',item);storyBeat('engine');cue('engine');return;
  }
}

function openRadio(){
  mechanisms.stable=0;radioActive=true;cue('radioTune',LANDMARKS.radio);
  panel('radio','一階・机の無線機','雑音の間に、修司の声。',`<div class="radio-tuner"><p>つまみをゆっくり動かし、声が明瞭になる位置を探す。安定したら同調を固定する。</p><div class="radio-dial-row"><button type="button" data-action="radio-minus" aria-label="つまみを一つ戻す">−</button><input id="radio-dial" data-radio-dial type="range" min="0" max="100" step="1" value="${mechanisms.dial}" aria-label="無線の同調つまみ"><button type="button" data-action="radio-plus" aria-label="つまみを一つ進める">＋</button></div><div class="radio-frequency">同調 <strong id="radio-dial-value">${mechanisms.dial}</strong> / 100</div><div class="radio-signal-track"><span id="radio-signal-bar"></span></div><p class="radio-signal-status" id="radio-signal-status">雑音が強い</p><blockquote class="radio-fragment" id="radio-fragment">ザ……ザザ……</blockquote><div class="radio-lock-track"><span id="radio-lock-bar"></span></div><p class="small-note" id="radio-lock-hint">聞こえる位置で、つまみを止める。</p></div>`,`<button type="button" data-action="radio-lock" id="radio-lock" disabled>同調を固定</button>`+button('close-panel','いったん離れる',true));
  updateRadio(0);
}
function setRadioDial(value){if(!radioActive)return;adjustDial(mechanisms,value);if($('radio-dial'))$('radio-dial').value=mechanisms.dial;updateRadio(0);}
function updateRadio(dt){
  if(!radioActive||mode!=='panel'||panelKind!=='radio')return;
  const {signal,progress,ready}=advanceTuning(mechanisms,dt);
  $('radio-dial-value').textContent=mechanisms.dial;$('radio-signal-bar').style.width=(signal*100)+'%';$('radio-lock-bar').style.width=(progress*100)+'%';
  $('radio-signal-status').textContent=signal>=.9?'受信良好':signal>.55?'声が近づいている':'雑音が強い';
  $('radio-fragment').textContent=signal>=.9?'「……聞こえるか。林道に倒木がある。今、どかしてる」':signal>.55?'「……きこ……林道……たおれ……」':'ザ……ザザ……';
  $('radio-lock-hint').textContent=ready?'声が安定した。同調を固定できる。':signal>=.9?'その位置で、声が安定するのを待つ。':'聞こえる位置で、つまみを止める。';
  $('radio-lock').disabled=!ready;
  sound.update({danger:0,moving:false,running:false,inside:true,time,listener:{...player,yaw},monster,monsterDistance:999,enemySpeed:0,radioTuning:{active:true,signal,staticLevel:1-signal}});
}
function finishRadio(){
  if(!radioActive||mechanisms.stable<RADIO.holdSeconds||radioSignal(mechanisms.dial)<.9)return;
  flags.radioTuned=true;collected.add('radio');world.items.radio.marker.visible=false;radioActive=false;
  // The early leash ends here. A creature still waiting at the cabin withdraws
  // into the forest instead of standing in the only doorway.
  const retreat=flags.seen&&actorDistance(player,monster)<EARLY.respawnCreatureDistance;if(retreat)relocateCreatureAway();
  resume();cue('radioLock',LANDMARKS.radio);storyBeat('radioTuned');if(retreat)toast('雑音の向こうで、足音が森へ遠ざかった。',3600);saveCheckpoint();
}

function answerPhone(){flags.phone=true;collected.add('phone');survival.sanity=Math.min(100,survival.sanity+42);survival.stamina=100;world.items.phone.marker.visible=false;world.triggerScare('phone');$('panel').hidden=true;mode='play';lockPointer();storyBeat('phone');saveCheckpoint();}

function throwBottle(){
  if(mode!=='play'||survival.dead||throwTime>0||dialoguePaused)return;const d=actorDistance(player,monster),blocked=world.isBlocked(player,monster);
  if(charges<1){toast(flags.bottle?'ボトルは、もう空だ。':'使えるボトルを持っていない。');return;}if(!flags.seen){toast('今は使う必要がない。');return;}
  if(!canThrow({charges,distance:d,blocked})){toast(blocked?'木や壁に遮られて届かない。':'まだ届かない。8.5m以内で使う。');return;}
  charges--;stats.repels++;throwTime=.55;emitNoise(22,'throw');world.throwRepellent(monster);cue('repel');updateInventory();
}

function death(reason){
  if(mode==='dying'||panelKind==='death'&&mode==='panel')return;survival.dead=true;survival.phase='death';mode='dying';deathTime=0;action=null;freezeInput();document.exitPointerLock?.();
  dialoguePaused=false;radioActive=false;dialogueView.hide();quietSound();$('scope-sequence').hidden=true;$('interaction').hidden=true;$('action-status').hidden=true;$('subtitle').hidden=true;$('hunt-banner').hidden=true;$('health-value').textContent='0';$('health-bar').style.width='0%';$('focus-value').textContent=Math.ceil(survival.sanity);$('focus-bar').style.width=survival.sanity+'%';$('gaze-status').textContent='録画停止';cue('fail');tape.trigger('death');flags.deathReason=reason;
}
function deathPanel(){
  panel('death','死亡 ／ 録画終了',flags.deathReason==='gaze'?'視線から、離れられなかった。':'帰り道は、そこで途切れた。',`<div class="ending-copy"><p>録画は、地面を向いたまま終わっている。<br>最後の数秒だけ、足音が残っていた。</p></div><div class="intro-hint">${flags.deathReason==='gaze'?'顔を画面の中央に捉え続けると意識を失います。目をそらし、木や壁で視線を遮ってください。':'怪異が鎌を持ち上げたら、すぐに距離を取ってください。目を閉じても、近距離の攻撃は避けられません。'}<br>ボトルは一時的にひるませる道具です。逃げる体力を残し、車のエンジンがかかるまで生き残りましょう。</div>`,button('retry','記録からやり直す')+button('restart','はじめから',true)+button('title','タイトルへ',true),false);previousMode='title';
}
function endGame(){
  if(survival.dead||survival.health<=0||!flags.gate)return;const id=endingFor(flags,completed.size),e=ENDINGS[id],saved=read(END_KEY,[]),ends=Array.isArray(saved)?saved:[];
  if(!ends.includes(id))ends.push(id);write(END_KEY,ends);remove(SAVE_KEY);remove(LEGACY_SAVE_KEY);checkpoint=null;$('continue-button').hidden=true;cue('ending');tape.clear();
  panel('ending',e.eyebrow,e.title,`<figure class="scene-photo"><img src="assets/photos/return-v4-1.webp" alt="夜明けの谷へ下る林道。車のダッシュボードに残ったDVカメラ" width="1400" height="788"><figcaption>山を下りてから残した、最後の一枚</figcaption></figure><div class="ending-copy">${paragraphs(endingParagraphs(id,flags))}</div><div class="ending-stats"><span>生還 ${Math.floor(time/60)}分${Math.floor(time%60)}秒</span><span>小物 ${Object.keys(LORE).filter(id=>collected.has(id)).length}/7</span><span>つながった記録 ${completed.size}/3</span><span>結末 ${ends.length}/3</span></div>`,button('restart','別の記録をたどる')+button('credits','原話について',true)+button('title','タイトルへ',true),false);previousMode='title';
}
function mapHTML(){
  const floor=mapFloor==='auto'?player.level:Number(mapFloor),up=floor===1;
  const scale=up?23:5,x=v=>up?195+v*scale:30+(v-WORLD_BOUNDS.minX)*scale,z=v=>up?25+(v-16)*scale:28+(v-WORLD_BOUNDS.minZ)*scale;
  const marker=(p,r,color)=>`<circle cx="${x(p.x)}" cy="${z(p.z)}" r="${r}" fill="none" stroke="${color}" stroke-width="1.5"/>`;
  let plan='';
  if(up){
    const b=FLOORS.find(f=>f.level===1).bounds;
    plan=`<rect x="${x(b.minX)}" y="${z(b.minZ)}" width="${(b.maxX-b.minX)*scale}" height="${(b.maxZ-b.minZ)*scale}" fill="#263329" stroke="#adad86" stroke-width="2"/><rect x="${x(BALCONY.minX)}" y="${z(BALCONY.minZ)}" width="${(BALCONY.maxX-BALCONY.minX)*scale}" height="${(BALCONY.maxZ-BALCONY.minZ)*scale}" fill="#343d31" stroke="#adad86"/><path d="M${x(BALCONY.entrance.x)-13},${z(BALCONY.entrance.z)}h26" stroke="#dfc789" stroke-width="4"/><text x="195" y="${z(22)}" text-anchor="middle" fill="#cbd0bd" font-size="14">二階の部屋</text><text x="195" y="${z(17.5)}" text-anchor="middle" fill="#cbd0bd" font-size="11">ベランダ</text>${marker(LANDMARKS.telescope,5,'#dfc789')}<text x="${x(LANDMARKS.telescope.x)+12}" y="${z(LANDMARKS.telescope.z)+15}" fill="#dfc789" font-size="10">望遠鏡</text>`;
    const st=STAIRS;
    plan+=`<rect x="${x(st.x-st.width/2)}" y="${z(st.minZ)}" width="${st.width*scale}" height="${(st.maxZ-st.minZ)*scale}" fill="#17221b" stroke="#8f9c85"/>${Array.from({length:12},(_,i)=>`<path d="M${x(st.x-st.width/2)},${z(st.minZ+i*(st.maxZ-st.minZ)/12)}h${st.width*scale}" stroke="#77806b"/>`).join('')}<path d="M${x(st.x)},${z(st.maxZ)-8}v-${(st.maxZ-st.minZ)*scale-22}m-5,8 5-8 5,8" fill="none" stroke="#dfc789"/><text x="${x(st.x)}" y="${z(st.maxZ)+29}" text-anchor="middle" fill="#d7c79e" font-size="10">ここから一階へ</text>`;
  }else{
    plan+='<g opacity=".22" stroke="#718268" stroke-width=".6">'+[0,1,2,3,4,5,6].map(i=>`<path d="M${30+i*50},28v330M30,${28+i*50}h325"/>`).join('')+'</g>';
    plan+=TRAILS.map(t=>`<polyline points="${t.points.map(p=>`${x(p[0])},${z(p[1])}`).join(' ')}" fill="none" stroke="#6e755e" stroke-width="${t.width*scale}" stroke-linejoin="round" stroke-linecap="round"/>`).join('');
    plan+=`<rect x="${x(BRIDGE.x-BRIDGE.width/2)}" y="${z(BRIDGE.z-BRIDGE.length/2)}" width="${BRIDGE.width*scale}" height="${BRIDGE.length*scale}" fill="#908368" stroke="#c7b99a"/><text x="${x(BRIDGE.x)+14}" y="${z(BRIDGE.z)+3}" fill="#d4c9aa" font-size="9">木橋</text><rect x="${x(PARKING.minX)}" y="${z(PARKING.minZ)}" width="${(PARKING.maxX-PARKING.minX)*scale}" height="${(PARKING.maxZ-PARKING.minZ)*scale}" fill="none" stroke="#8b9274" stroke-width="1.5"/>`;
    plan+=BUILDINGS.map(b=>`<rect x="${x(b.x-b.w/2)}" y="${z(b.z-b.d/2)}" width="${b.w*scale}" height="${b.d*scale}" fill="#263329" stroke="#adad86" stroke-width="1.1"/><circle cx="${x(b.entrance.x)}" cy="${z(b.entrance.z)}" r="3.5" fill="#d9c78d"/><text x="${x(b.x)}" y="${z(b.z-b.d/2)-6}" text-anchor="middle" fill="#dadcc9" font-size="10">${b.label}</text>`).join('');
    const gate=LANDMARKS.gate,gx=x(gate.modelX??gate.x),gz=z(gate.modelZ??gate.z);
    plan+=`<path d="M${gx},${gz-10}v20" stroke="${flags.gate?'#84aa82':'#bc7160'}" stroke-width="3" ${flags.gate?'stroke-dasharray="3 3"':''}/><text x="${gx-3}" y="${gz-14}" text-anchor="end" fill="#b9c5b3" font-size="9">ゲート</text><text x="${x(-27)}" y="${z(26.6)}" fill="#c6c9b5" font-size="9">駐車場</text><text x="${x(STAIRS.bottom.x)-7}" y="${z(STAIRS.bottom.z)+8}" fill="#e1cb91" font-size="9">2F ↑</text>`;
  }
  const target=navigationTarget();
  if(up){
    plan+=`<path d="M${x(-1.3)},${z(19)}h${2.6*scale}" stroke="${flags.shutterClosed?'#b8856e':'#74948b'}" stroke-width="4" ${flags.shutterClosed?'':'stroke-dasharray="4 3"'}/><text x="${x(1.55)+12}" y="${z(19.5)+10}" fill="#c6b792" font-size="10">雨戸</text>`;
  }else{
    plan+=COVER_PATCHES.map(c=>`<rect x="${x(c.x-c.w/2)}" y="${z(c.z-c.d/2)}" width="${c.w*scale}" height="${c.d*scale}" fill="#596451" stroke="#bac4a5"/>`).join('');
    plan+=MAP_ZONES.filter(zone=>zone.id!=='cabin').map(zone=>`<text x="${x(zone.x)}" y="${z(zone.z)+28}" text-anchor="middle" fill="${zone.color}" font-size="9">${textHTML(zone.label)}</text>`).join('');
    for(const[id,label]of[['bell','呼び鐘'],['radio','無線機']]){const p=LANDMARKS[id];plan+=marker(p,3,'#dac491')+`<text x="${x(p.x)+7}" y="${z(p.z)-7}" fill="#dac491" font-size="9">${label}</text>`;}
    // v4.0.2: once the ringing has been heard, its rough place is noted (optional).
    if(flags.phoneHint&&!flags.phone){const p=LANDMARKS.phone;plan+=`<circle cx="${x(p.x)}" cy="${z(p.z)}" r="8" fill="none" stroke="#c9a08e" stroke-width="1.2" stroke-dasharray="2 3"/><text x="${x(p.x)+11}" y="${z(p.z)+3}" fill="#c9a08e" font-size="9">着信音？</text>`;}
  }
  plan+=LORE_PLACEMENTS.filter(p=>(p.level||0)===floor&&collected.has(p.id)).map(p=>`<circle cx="${x(p.x)}" cy="${z(p.z)}" r="2.3" fill="#8aab9a"/>`).join('');
  if(target&&(target.level||0)===floor){
    const o=getObjective(),label=(o.target?.level||0)!==floor?'目的地へ向かう階段':o.title;
    const width=Math.min(350,label.length*11+14),left=clamp(x(target.x)-width/2,8,382-width),top=clamp(z(target.z)-34,25,335);
    plan+=marker(target,9,'#f4d68f')+`<rect x="${left}" y="${top}" width="${width}" height="21" rx="2" fill="#14211e" stroke="#f4d68f" stroke-width=".6"/><text x="${left+width/2}" y="${top+14}" text-anchor="middle" fill="#f4d68f" font-size="11">${textHTML(label)}</text>`;
  }
  if(player.level===floor)plan+=`<g transform="translate(${x(player.x)} ${z(player.z)}) rotate(${-yaw*180/Math.PI})"><circle r="8" fill="#131e17"/><path d="M0,-7 5,5 0,2 -5,5Z" fill="#f0cf8a"/></g>`;
  const tabs=`<nav class="map-level-tabs" aria-label="地図の階">${[['auto','現在の階'],['1','二階'],['0','一階・山道']].map(([id,label])=>`<button data-action="map-${id}" type="button" class="${mapFloor===id?'selected':''}">${label}</button>`).join('')}</nav>`;
  return tabs+`<svg class="trail-map exact-map" viewBox="0 0 390 390" role="img" aria-label="${up?'二階とベランダ、階段':'一階と山道'}の地図"><rect width="390" height="390" fill="#1c2721"/>${plan}<text x="20" y="17" fill="#aab4a1" font-size="10">N ↑　${up?'二階 ／ 階段は南西側':'一階・山道 ／ 1目盛＝10m'}</text><text x="20" y="378" fill="#aab4a1" font-size="9">△ 現在位置　○ 次の行き先　● 調べた記録</text></svg>`;
}

function journal(tab='map'){
  let body='';const navigation=`<nav class="journal-tabs">${button('journal','地図')}${button('journal-records','小物の記録',true)}${button('journal-dialogue','無線・会話',true)}</nav>`;
  if(tab==='map'){
    const o=getObjective();
    body=`<button type="button" class="map-search" data-action="search-help">${o.image?`<img src="${o.image}" alt="" width="64" height="48">`:''}<span><strong>${textHTML(o.title)}</strong><small>${textHTML(o.location)}</small></span><span class="search-open">詳しく</span></button>${mapHTML()}<p class="small-note">黄色の丸は今の行き先です。階の違う目的地へ向かうときは、階段を表示します。小物の記録と携帯電話は任意です。</p>`;
  }
  else if(tab==='dialogue')body=`<div class="radio-log">${conversation.length?conversation.map(l=>`<article><small>${Math.floor(l.time/60)}:${String(l.time%60).padStart(2,'0')} / ${textHTML(speakerProfile(l).name)} · ${textHTML(speakerProfile(l).channel)} · ${textHTML(speakerProfile(l).location)}</small><p>${textHTML(l.text)}</p></article>`).join(''):'<p>まだ会話の記録がありません。</p>'}</div>`;
  else{
    const chains=Object.entries(CHAINS).filter(([,c])=>c.ids.some(k=>collected.has(k)));
    const found=Object.keys({...DOCUMENTS,...LORE}).filter(id=>collected.has(id));
    body=`<div class="story-progress">${chains.map(([id,c])=>`<section class="story-chain"><small>${c.ids.filter(k=>collected.has(k)||flags[k]).length} / ${c.ids.length} 個の記録</small><h3>${textHTML(completed.has(id)?c.title:'まだ、つながらない記録')}</h3>${completed.has(id)?`<div class="chain-complete">記録がつながった</div>${paragraphs(c.paragraphs)}`:'<p>撮影した面を見返すと、ほかの物とのつながりが分かるかもしれない。</p>'}</section>`).join('')}</div><div class="journal-grid">${found.map(id=>{const d=getStoryDocument(id,storyContext(),story),unread=d.revision>(story.readRevisions[id]||0);return `<button class="journal-entry ${unread?'unread-entry':''} ${ITEM_IMAGES.has(id)?'has-thumb':''}" data-action="read-${id}">${itemImage(id,'journal-thumb')}<small>${unread?'追記あり':'記録済み'}</small><strong>${textHTML(d.title)}</strong></button>`;}).join('')}</div>${found.length?'':'<p>まだ小物の記録はありません。近づいて E で調べると、ここに残ります。</p>'}`;
  }
  panel('journal','DV記録 ／ 拾得物と会話','帰る道を、確かめる。',navigation+body,button('close-panel',mode==='scope'||mode==='panel'&&previousMode==='scope'?'望遠鏡へ戻る':'探索へ戻る'));
}

function help(){panel('help','操作と記録','山での、身の置き方。',`<div class="control-grid"><kbd>W A S D</kbd><span>移動。階段も歩いて上り下り</span><kbd>マウス</kbd><span>見回す。固定されない場合は画面をドラッグ</span><kbd>E</kbd><span>調べる／道具や車を操作する</span><kbd>Shift</kbd><span>走る。息が切れる前に休む</span><kbd>Z</kbd><span>自動歩行の開始・停止</span><kbd>C / Space</kbd><span>押している間、目を閉じて静かに歩く</span><kbd>F / Q</kbd><span>懐中電灯／サングラス</span><kbd>R</kbd><span>持っているボトルを使う</span><kbd>H</kbd><span>探す物の見本と音声案内（ゲームは停止）</span><kbd>J / M</kbd><span>階別の地図・小物・会話の記録</span><kbd>Enter</kbd><span>会話の次の発言へ</span><kbd>T</kbd><span>会話を読む間、ゲームごと停止／再開</span><kbd>Esc / P</kbd><span>一時停止。望遠鏡の場面も停止できます</span></div><details class="document-card" ${flags.seen?'open':''}><summary>生存のヒント（先の内容を含みます）</summary><h3>見つかる理由</h3><p>怪異は、視線と音を頼りに動きます。木や壁で姿を隠し、その先で足音を抑えると、最後に見失った場所を探し始めます。走る音と金属音は遠くまで届きます。</p><h3>足元を照らすと</h3><p>怪異は、顔を下げて視線を追ってきます。目を閉じても身体は守れません。近づかれる前に離れてください。</p><h3>鎌が上がったら</h3><p>肩と鎌が上がる間に、横や後ろへ抜けて距離を取ります。振り始めた向きは変わりません。背後からは振り下ろしません。3回まともに受けると死亡します。ボトルは8.5m以内に届き、約6秒だけひるませます。</p><h3>身を隠す道具</h3><p>二階の雨戸は実際に視線と通行を遮ります。西の呼び鐘を鳴らしたら材木の陰へ抜けてください。怪異に見えている間は追跡されますが、姿を隠すと残っている響きを調べに向かいます。鐘の余韻が消えた後は、最後に見た場所を探します。</p><h3>帰るまで</h3><p>サングラスは視線の影響を軽くするだけです。鍵とハンドルでゲートを開け、車のエンジンがかかるまで生き残ってください。操作中の移動や被弾で中断します。</p></details><p class="small-note">スマホ：左スティックで移動、右画面をドラッグして見回し、ボタンで操作。記録と設定を開くと一時停止します。映像の乱れと画面揺れは設定で調整できます。</p>`,button('close-panel','戻る'));}

function settings(){panel('settings','視界・音・操作','記録の調整',`${[['volume','音量',0,1,.05],['sensitivity','視点の速さ',.35,2,.05],['brightness','明るさ',.7,1.8,.05],['tape','ビデオの乱れ',0,1,.05]].map(([id,label,min,max,step])=>`<div class="range-row"><label for="setting-${id}">${label}</label><input id="setting-${id}" type="range" min="${min}" max="${max}" step="${step}" value="${options[id]}" data-setting="${id}"></div>`).join('')}<label class="settings-row"><span>歩行と被弾時の画面揺れ</span><input type="checkbox" data-setting="motion" ${options.motion?'checked':''}></label><label class="settings-row"><span>音を消す</span><input type="checkbox" data-setting="muted" ${options.muted?'checked':''}></label><label class="settings-row"><span>描画品質</span><select data-setting="quality"><option value="high" ${options.quality==='high'?'selected':''}>標準</option><option value="low" ${options.quality==='low'?'selected':''}>軽量</option></select></label><p class="small-note">ビデオの乱れを0にすると走査線とトラッキングの乱れを停止します。攻撃の合図と所持品の表示は残ります。</p>`,button('close-panel','戻る'));}
function credits(){panel('credits','原話と翻案','投稿怪談「邪視」',`<div class="ending-copy"><p>匿名掲示板に投稿された怪談「邪視」の再録をもとにした翻案です。実在の事件として確認したものではありません。</p></div><div class="document-card"><h3>参照した要素</h3><p>原話では、一階へ水を飲みに行ってから自室へ戻り、望遠鏡をベランダに持ち出します。本作ではその部屋を二階として構成しています。</p><p>望遠鏡越しの遭遇、白い無毛の姿、縦向きの一つ目と鎌、体を揺らす遅い接近と足元へ顔を下げる動き、視線の精神的作用、サングラスの軽減、不浄を嫌う性質、圏外で鳴る電話を参照しました。</p><h3>ゲームのために作った部分</h3><p>成人の主人公による片付けとDV撮影、修司との無線、管理人と作業者の話、小物の記録、地形とゲート、追跡・鎌攻撃・体力・道具の効果・死亡条件・3つの生還結末は本作の創作です。原話にある尿と成人の叔父の露出の場面は、一時的にひるませるボトルへ変更しています。</p><p>文章は新規に作成。画像と質感素材はAI生成です。</p><h3>参照した再録</h3><p>2008年1月17日投稿として伝わる「邪視」。初出スレッドの現物ではなく再録資料を確認しています。</p><p><a href="https://horror2ch.com/archives/2271232.html" target="_blank" rel="noopener noreferrer">洒落怖まとめ厳選「邪視」前半 ↗</a><br><a href="https://horror2ch.com/archives/2271232.html/2" target="_blank" rel="noopener noreferrer">同 後半 ↗</a></p></div><p class="small-note">3D：Three.js r164 / <a href="vendor/THREE-LICENSE.txt" target="_blank" rel="noopener">MIT License</a>。環境音・効果音：Web Audio。案内音声：VOICEVOX:麒ヶ島宗麟（合成音声）。<a href="https://www.virvoxproject.com/voicevoxの利用規約" target="_blank" rel="noopener noreferrer">音声の利用規約</a>。設定・進行はこのブラウザ内に保存します。</p>`,button('close-panel','戻る'));}
function pause(){if(mode!=='play'&&mode!=='scope')return;const scoped=mode==='scope';panel('pause','一時停止','山の音が、止まった。',`<p>${scoped?'望遠鏡の映像は、ここで止まっています。':'地図と記録を確かめてから、戻ってください。<br>直近の安全な記録から再開できます。'}</p>`,button('close-panel',scoped?'望遠鏡へ戻る':'探索を続ける')+(scoped?'':button('journal','地図・記録',true))+button('settings','設定',true)+button('help','操作方法',true)+button('title','タイトルへ',true));}

function updateEnemyMotion(dt,moving=false,running=false,closed=false){
  const looking=gazeAtMonster(closed);
  const nav=Object.create(world);nav.findPath=(world.findEnemyPath||world.findPath).bind(world);
  const events=stepEnemy(enemy,{player,active:flags.seen,hunt:flags.hunt,playerMoving:moving,playerRunning:running,playerLooking:looking,closedEyes:closed,playerPitch:pitch,lamp,attackPhase:survival.phase,stun:survival.stun,dead:survival.dead,noiseEvent,leash:earlyLeash()||currentShelterLeash()},dt,nav);
  for(const event of events){
    if(event==='search'&&actorDistance(player,monster)<26)storyBeat('enemySearch');
    if(event==='heard'&&actorDistance(player,monster)<22)storyBeat('enemyListen');
    if(event==='reacquired'&&actorDistance(player,monster)<22){storyBeat('enemyTurn');cue('tape');}
    if(event==='hunt'&&actorDistance(player,monster)<22){cue('hunt');tape.trigger('hunt');}
    if(event==='watching'&&enemy.playerVisible&&actorDistance(player,monster)<24)cue('knock');
  }
  if(enemy.crouch>.45&&!scares.has('crawling')){scares.add('crawling');storyBeat('enemyCrawl');cue('tape');}
}

function updateDoorPressure(dt){
  // Only a remembered/actually planned destination can lead it to a door.
  const target=enemy.route?.[0]||enemy.lastKnown;
  const door=flags.seen&&survival.stun<=0&&!survival.dead&&target?world.getBlockingDoor?.(monster,target,2.3):null;
  const result=advanceDoorPressure(doorPressure,door?.id,dt);doorPressure=result.state;
  for(const event of result.events){
    if(event==='knock'){cue('doorKnock',door);if(actorDistance(player,door)<9)toast('戸の向こうで、木が鳴った。戸口から離れる。',2600);}
    if(event==='open'){
      const opened=world.setDoor(door.id,true,{actors:[player,monster]});
      if(opened.changed){cue('doorOpen',door);enemy.routeAge=0;guide.at=-99;approaches.clear();}
      doorPressure=null;
    }
  }
}

function gazeAtMonster(closed){
  if(!flags.seen||closed||survival.stun>0||actorDistance(player,monster)>39||world.isBlocked(player,monster))return false;
  const bearing=Math.atan2(player.x-monster.x,player.z-monster.z);
  if(Math.cos(bearing-enemy.heading-enemy.headYaw)<.5)return false;
  const eye=world.eyePosition(),origin=new THREE.Vector3(player.x,world.actorHeight(player)+1.65,player.z);
  const forward=new THREE.Vector3(-Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch));
  return eye.sub(origin).normalize().dot(forward)>.945;
}

function handleSurvivalEvents(events){
  for(const event of events){
    // v4.0.2: the windup is told once, by the centre warning (with direction) and its sound.
    if(event==='windup'){cue('windup',monster);updateAttackWarning();}
    if(event==='swing'){cue('attack',monster);if(!flags.firstAttack){flags.firstAttack=true;storyBeat('firstAttack');}}
    if(event==='hit'){
      cue('hit');tape.trigger('hit');action=null;$('health-value').textContent=Math.ceil(survival.health);$('health-bar').style.width=survival.health+'%';const d=Math.max(.01,distance(player,monster));
      world.move(player,(player.x-monster.x)/d*.65,(player.z-monster.z)/d*.65);toast(survival.health>RULES.attackDamage?'被弾 — まだ動ける。鎌の届かない所へ。':'被弾 — 次は耐えられない。',3200);
    }
    if(event==='miss')stats.escapes++;
    if(event==='exhausted'){cue('breath');toast('息が切れた。少し歩いて呼吸を整える。',2400);}
    if(event==='resumeHunt'){flags.hunt=true;cue('hunt');tape.trigger('hunt');toast('また、足音が近づく。',2500);}
    if(event==='death')death('attack');
    if(event==='swing'||event==='death'||event==='gazeDeath')hideAttackWarning();
    if(event==='gazeDeath')death('gaze');
  }
}

function hideAttackWarning(){$('attack-warning').hidden=true;$('threat-edge').hidden=true;delete document.body.dataset.threat;}
// v4.0.2: the warning names where the scythe is and which way to get clear.
function updateAttackWarning(){
  if(survival.phase!=='windup'){hideAttackWarning();return;}
  const dir=threatDirection({player,yaw,monster});
  $('attack-warning').hidden=false;$('attack-warning').dataset.side=dir.side;$('attack-warning-text').textContent=dir.label;$('attack-warning-arrow').textContent=dir.arrow;
  $('threat-edge').hidden=false;$('threat-edge').dataset.side=dir.side;document.body.dataset.threat=dir.side;
}
const SOUND_SIDE={front:'前の方',left:'左手の奥',right:'右手の奥',behind:'背後の奥'};
function currentShelterLeash(){if(!flags.seen||earlyLeash())return null;const b=shelterAt(player);return shelterLeash(shelter,b,!!b);}
function shelterEvents(dt){
  const building=flags.seen&&!earlyLeash()?shelterAt(player):null;
  for(const event of updateShelter(shelter,building?.id||null,dt)){
    if(event==='enter'&&building?.id==='shelter'&&flags.phoneHint&&!flags.phone&&!scares.has('phone-hut')){scares.add('phone-hut');toast('着信音は、小屋の先の尾根から聞こえる。',4200);}
    if(event==='warn'){cue('knock');toast('出口は一つだけ。長く留まると、戸口をふさがれる。',5200);}
    if(event==='release'){cue('knock');emitNoise(45,'shelter',player);toast('戸口の外で、足音が止まった。',3600);}
  }
}
function environmentalEvents(dt){
  if(!flags.seen)return;
  shelterEvents(dt);
  if(!flags.downstairs&&player.level===0&&Math.abs(world.actorHeight(player)-world.ground(player.x,player.z))<.35){
    flags.downstairs=true;flags.leashUntil=Math.max(flags.leashUntil||0,time+EARLY.downstairsSeconds);world.setStairGuide?.(false);storyBeat('downstairs');cue('knock');world.triggerScare('window');
  }
  if(story.stage>=3&&flags.note&&story.delivered.includes('note')&&!scares.has('trail-talk')&&speechTime<=0&&!speechQueue.length){scares.add('trail-talk');storyBeat('trail');}
  if(time-lastStoryAdvance>8&&speechTime<=0&&!speechQueue.length){lastStoryAdvance=time;storyBeat('_progress');}
  if(story.stage>=3&&!flags.bridge&&player.level===0&&distance(player,BRIDGE)<4.3){flags.bridge=true;world.triggerScare('bridge');cue('tape');storyBeat('bridge');tape.trigger('tape');}
  if(story.stage>=4&&flags.bottle&&!scares.has('window')&&distance(player,BUILDINGS[0])<15){scares.add('window');world.triggerScare('window');cue('knock');storyBeat('nearCabin');tape.trigger('tape');}
  const nearPhone=player.level===0&&distance(player,LANDMARKS.phone)<24;
  if(story.stage>=4&&!flags.phone&&nearPhone&&time-lastPhone>23){lastPhone=time;emitNoise(24,'phone',LANDMARKS.phone);cue('phone',LANDMARKS.phone);world.triggerScare('phone');if(!flags.phoneHint){flags.phoneHint=true;const dir=threatDirection({player,yaw,monster:LANDMARKS.phone});say('私','尾根のほうで、携帯が鳴っている。ここは圏外のはずだ。',false,{radius:30});toast(`どこかで、着信音がする（${SOUND_SIDE[dir.side]}）— 地図に記した`,5200);}}
  ambientTime-=dt;
  if(ambientTime<=0){ambientTime=22+Math.random()*16;if(story.stage>=3&&actorDistance(player,monster)<22&&survival.stun<=0){cue('tape');if(story.stage>=4&&Math.random()<.3)tape.trigger('tape');}}
}

function stepGame(dt){
  if(mode!=='play'||!world||dialoguePaused)return;
  time+=dt;
  const closed=!!(keys.KeyC||keys.Space||touchEyes),run=!!(keys.ShiftLeft||keys.ShiftRight||touchRun);
  let forward=(keys.KeyW||keys.ArrowUp?1:0)-(keys.KeyS||keys.ArrowDown?1:0)-joystick.y+(autoWalk?1:0),side=(keys.KeyD?1:0)-(keys.KeyA?1:0)+joystick.x;
  const length=Math.hypot(forward,side);if(length>1){forward/=length;side/=length;}
  if(keys.ArrowLeft)yaw+=dt*1.35;if(keys.ArrowRight)yaw-=dt*1.35;
  const speed=movementSpeed(survival,{run,closed}),before={...player};
  world.move(player,(-Math.sin(yaw)*forward+Math.cos(yaw)*side)*speed*dt,(-Math.cos(yaw)*forward-Math.sin(yaw)*side)*speed*dt);
  const moving=actorDistance(before,player)>.0005;
  updateEnemyMotion(dt,moving,moving&&speed>RULES.walk,closed);
  updateDoorPressure(dt);
  if(throwTime>0){throwTime-=dt;if(throwTime<=0&&!survival.dead){stunEnemy(survival);cue('stun');storyBeat('repel');tape.trigger('repel');toast('ひるんでいる。今のうちに離れる。',2500);}}
  const blocked=world.isBlocked(player,monster),gaze=gazeAtMonster(closed),d=actorDistance(player,monster);
  // A strike may start only from in front of or beside the camera (about +-105 deg).
  const planar=Math.max(.001,distance(player,monster)),facing=(-Math.sin(yaw)*(monster.x-player.x)-Math.cos(yaw)*(monster.z-player.z))/planar,attackVisible=planar<.6||facing>-.26;
  const events=updateSurvival(survival,{moving,closed,run,active:flags.seen,gaze,blocked,glasses:glassesOn,distance:d,attackAligned:enemy.attackAligned,attackVisible},dt);
  handleSurvivalEvents(events);
  if(mode!=='play')return;
  updateAttackWarning();
  if(action){
    const result=advanceEscapeAction(action,{dt,distance:actorDistance(player,action.target),damaged:events.includes('hit'),dead:survival.dead});action=result.action;
    if(result.result==='cancelled')toast('操作を中断した。もう一度 E で始める。',2300);
    if(result.result==='gate'){flags.gate=true;world.setGateOpen(true);world.items.gate.marker.visible=false;cue('gate');storyBeat('gate');saveCheckpoint();toast('ゲートが開いた。車へ。',3000);}
    if(result.result==='engine'){endGame();return;}
  }
  currentTarget=findTarget();$('interaction').hidden=!currentTarget||!!action||closed;
  if(currentTarget)$('interaction-text').textContent=currentTarget.id==='shutter'?(flags.shutterClosed?'雨戸を開ける':player.level===1&&player.z<BALCONY.maxZ-.1?'部屋に入り、雨戸を閉める':'雨戸を閉める'):currentTarget.id==='radio'&&flags.radioTuned?'同調済みの無線機':currentTarget.label;
  if(currentTarget&&currentTarget.id===getObjective().id)$('interaction-text').textContent='探しているもの：'+getObjective().action;
  else if(currentTarget&&(LORE[currentTarget.id]||['photo','phone'].includes(currentTarget.id)))$('interaction-text').textContent+='（任意の記録）';
  updateSearchGuidance(closed);
  $('action-status').hidden=!action;
  if(action){$('action-label').textContent=action.type==='gate'?'ゲートを巻き上げている…':'エンジンを始動している…';$('action-bar').style.width=(action.elapsed/action.duration*100)+'%';}
  $('focus-value').textContent=Math.ceil(survival.sanity);$('focus-bar').style.width=survival.sanity+'%';
  $('health-value').textContent=Math.ceil(survival.health);$('health-bar').style.width=survival.health+'%';
  $('stamina-value').textContent=Math.ceil(survival.stamina);$('stamina-bar').style.width=survival.stamina+'%';
  const audible=flags.seen&&d<23,sameFloor=(monster.level||0)===player.level,near=audible&&d<8&&sameFloor,walking=enemy.speed>.12,behind=near&&!attackVisible&&d<RULES.attackRange+1&&!blocked;
  $('gaze-status').textContent=closed?'目を閉じている':gaze?'目が、合っている。':survival.stun>0?'今は、動きを止めている':behind?'背後に、息づかいがある':near&&walking?'すぐそばで、足音がする':near&&!blocked?'すぐ近くで、止まっている':audible&&d<8&&!sameFloor&&walking?'床の向こうで、足音がする':audible&&enemy.mode==='search'?'足音が、同じ場所を回っている':audible&&enemy.mode==='listen'?'足音が止まった':audible&&enemy.mode==='hunt'?'足音が追ってくる':flags.seen?'どこかから、見られている':'録画中';
  $('hunt-banner').hidden=!(enemy.mode==='hunt'&&audible)||survival.stun>0;
  $('hunt-banner').textContent=d<9?'足音が近い — 離れる':'足音が速くなる — 身を隠す';
  const route=currentGuide(),goalAngle=route?yawToward(player,route.point):yaw;
  let delta=goalAngle-yaw;while(delta>Math.PI)delta-=Math.PI*2;while(delta< -Math.PI)delta+=Math.PI*2;
  $('compass-label').textContent=route?(Math.abs(delta)<.25?'↑':delta>0?'←':'→')+' '+Math.round(route.length)+'m':'無線を確認';
  $('compass-label').title=getObjective().location;
  const climbing=Math.abs(player.x-STAIRS.x)<STAIRS.width/2&&player.z>STAIRS.minZ+.2&&player.z<STAIRS.maxZ-.2;
  $('floor-label').textContent=climbing?'階段':player.level===1?'2F':'1F';
  $('tape-clock').textContent='00:'+String(Math.floor(time/60)).padStart(2,'0')+':'+String(Math.floor(time%60)).padStart(2,'0');
  $('veil').style.opacity=closed?'1':'0';
  document.body.classList.toggle('chased',enemy.mode==='hunt'&&d<13);document.body.classList.toggle('injured',survival.health<50);
  const danger=threatLevel(gaze,d);$('danger-vignette').style.opacity=String(clamp(danger*.65+survival.hit*.2,0,.85));
  // v4.0.2: in danger the subtitle card shrinks out of the way.
  const tense=survival.phase==='windup'||survival.phase==='strike'||danger>.55||enemy.mode==='hunt'&&d<10;if(tense)document.body.dataset.danger='high';else delete document.body.dataset.danger;
  const room=BUILDINGS.find(b=>Math.abs(player.x-b.x)<b.w/2&&Math.abs(player.z-b.z)<b.d/2),inside=!!room;
  const surface=climbing?'stairs':inside?'wood':player.z>16||player.x<-21?'gravel':'leaves';
  sound.update({danger,moving,running:moving&&speed>RULES.walk,inside,roomSource:room?{...room.entrance,level:player.level}:null,time,stamina:survival.stamina,pursuit:enemy.mode==='hunt',monsterDistance:flags.seen?d:999,enemyMode:enemy.mode,enemySpeed:enemy.speed,listener:{...player,yaw},monster,occluded:blocked,surface,dialogue:!!activeSpeech,paused:false,radioTuning:{active:false}});
  updateSpeech(dt);environmentalEvents(dt);
  if(time-lastSave>18){lastSave=time;saveCheckpoint();}
}

function threatLevel(gaze=false,d=distance(player,monster)){return flags.seen?clamp((1-survival.sanity/100)*.7+(gaze?.5:0)+(survival.stun>0?0:Math.max(0,1-d/20)*.65)+survival.hit*.4,0,1):0;}
function renderFrame(dt){
  if(!world)return;
  const closed=mode==='play'&&!dialoguePaused&&!!(keys.KeyC||keys.Space||touchEyes),running=mode==='play'&&!dialoguePaused&&movementSpeed(survival,{run:keys.ShiftLeft||keys.ShiftRight||touchRun,closed})>RULES.walk;
  const moving=mode==='play'&&!dialoguePaused&&!!(autoWalk||keys.KeyW||keys.KeyS||keys.KeyA||keys.KeyD||keys.ArrowUp||keys.ArrowDown||Math.hypot(joystick.x,joystick.y)>.05);
  const progress=survival.phaseLength?clamp(1-survival.phaseTime/survival.phaseLength,0,1):0;
  const falling=mode==='dying'&&options.motion?clamp(deathTime/1.7,0,1):0;
  const presence=!flags.seen?distantPresence(time,scope):null;
  const scoped=scope&&(mode==='scope'||mode==='panel'&&previousMode==='scope')?{phase:scope.phase,progress:scope.elapsed/TELESCOPE_SCENES[scope.phase].duration,target:presence,heading:presence.heading,gait:presence.gait,speed:presence.speed}:null;
  const profile=activeSpeech?speakerProfile(activeSpeech):null;
  world.update({pos:player,yaw:yaw+falling*.16,pitch:pitch+(-1.35-pitch)*falling,time,moving,running,lamp,monster:presence||monster,enemyVisual:presence||enemy,scope:scoped,active:true,repelled:survival.stun>0,closing:closed,brightness:options.brightness,motion:options.motion,attackPhase:survival.phase,attackProgress:progress,hit:survival.hit,escape:!!flags.hunt,gateOpen:!!flags.gate,companionState,companionSpeaking:profile?.id==='shuji'&&profile.channel==='対面'&&!dialoguePaused});
  const danger=mode==='dying'?1:scoped?scoped.phase===2?scoped.progress*.9:0:threatLevel(gazeAtMonster(closed));
  tape.update({dt,time,danger,source:world.canvas,enabled:options.tape>0,intensity:options.tape,reduced:reduced||!options.motion,playing:['play','scope','dying'].includes(mode)&&!dialoguePaused,health:survival.health});
}

// v4.0.2: the automatic pause ("sleep") was too eager: any window blur (an
// IME candidate box, a notification, a permission bubble) or a momentary loss
// of pointer lock paused at once. Now a blur must last 2.5 s with the window
// still unfocused, and a lost pointer lock pauses only if it is not regained
// within 0.4 s while the window keeps focus (that is the Esc key). A hidden tab
// still pauses at once. Clicking the view re-locks the pointer without a pause.
const SLEEP=Object.freeze({blurMs:2500,unlockMs:400});
let blurredAt=0,unlockedAt=0;
function onWindowBlur(){freezeInput();if(mode==='play'||mode==='scope')blurredAt=performance.now()||1;}
function onWindowFocus(){blurredAt=0;unlockedAt=0;}
function onPointerLockChange(){
  if(document.pointerLockElement){unlockedAt=0;return;}
  if(mode==='play'&&!touch&&!dialoguePaused)unlockedAt=performance.now()||1;
}
function checkSleep(now){
  if(mode!=='play'&&mode!=='scope'){blurredAt=0;unlockedAt=0;return;}
  const focused=document.hasFocus?.()!==false;
  if(blurredAt&&now-blurredAt>=SLEEP.blurMs){blurredAt=0;unlockedAt=0;if(!focused)pause();return;}
  if(unlockedAt&&now-unlockedAt>=SLEEP.unlockMs){unlockedAt=0;if(!document.pointerLockElement&&!dialoguePaused&&!blurredAt&&focused&&mode==='play')pause();}
}
function tick(now){
  animationFrame=requestAnimationFrame(tick);checkSleep(now);const dt=Math.min(.25,Math.max(0,(now-lastFrame)/1000));lastFrame=now;
  if(mode==='play'&&!dialoguePaused){let remaining=dt;while(remaining>0&&mode==='play'&&!dialoguePaused){const step=Math.min(1/30,remaining);stepGame(step);remaining-=step;}if(mode==='play'||mode==='dying')renderFrame(dt);}
  else if(mode==='play'&&dialoguePaused){dialogueView.tick(speechTime,{paused:true,queued:speechQueue.length});renderFrame(0);}
  else if(mode==='scope'){stepScope(dt);renderFrame(dt);}
  else if(mode==='panel'&&panelKind==='radio')updateRadio(dt);
  else if(mode==='dying'){time+=dt;deathTime+=dt;renderFrame(dt);if(deathTime>=2.85)deathPanel();}
  if(!$('toast').hidden&&now>toastUntil)$('toast').hidden=true;
}

function toggleLamp(){if(mode!=='play'||dialoguePaused)return;lamp=!lamp;cue('interact');updateInventory();}
function toggleGlasses(){if(mode!=='play'||dialoguePaused)return;if(!flags.glasses){toast('別荘の机にサングラスがある。');return;}glassesOn=!glassesOn;cue('interact');updateInventory();toast(glassesOn?'サングラスをかけた。邪視は軽減される。':'サングラスを外した。');}
function applySettings(){
  sound.setVolume(options.volume);sound.setMuted(options.muted);write(OPTIONS_KEY,options);updateInventory();
  if(world){world.renderer.setPixelRatio(Math.min(devicePixelRatio,options.quality==='low'?1:1.6));world.renderer.shadowMap.enabled=options.quality!=='low';world.resize();if(started)renderFrame(0);}
}
function dispatch(actionName){
  if(actionName==='mute'){options.muted=!options.muted;sound.start();applySettings();return;}
  if(actionName==='settings'){settings();return;}if(actionName==='help'){help();return;}if(actionName==='credits'){credits();return;}
  if(!world)return;
  if(actionName==='start'||actionName==='restart')newGame();
  else if(actionName==='begin')beginPlay();
  else if(actionName==='continue'||actionName==='retry'){const saved=checkpoint||loadSavedGame();validSave(saved)?restore(saved):newGame();}
  else if(actionName==='close-panel')resume();
  else if(actionName==='title')title();
  else if(actionName==='scope-leave'){if(mode==='scope'&&scope?.phase===2&&scope.elapsed>TELESCOPE_SCENES[2].duration-1.25)encounter();}
  else if(actionName==='pause')pause();
  else if(actionName==='journal')journal('map');
  else if(actionName==='journal-records')journal('records');
  else if(actionName==='journal-dialogue')journal('dialogue');
  else if(actionName==='search-help')searchHelp();
  else if(actionName==='guide-voice')playSearchVoice();
  else if(actionName==='speech-next')nextSpeech();
  else if(actionName==='speech-hold')toggleDialogueHold();
  else if(actionName==='radio-minus')setRadioDial(mechanisms.dial-1);
  else if(actionName==='radio-plus')setRadioDial(mechanisms.dial+1);
  else if(actionName==='radio-lock')finishRadio();
  else if(['map-auto','map-0','map-1'].includes(actionName)){mapFloor=actionName.slice(4);journal('map');}
  else if(actionName==='interact')interact();
  else if(actionName==='flashlight')toggleLamp();
  else if(actionName==='glasses')toggleGlasses();
  else if(actionName==='repel')throwBottle();
  else if(actionName==='answer-phone')answerPhone();
  else if(actionName==='ignore-phone'){resume();talk('phoneIgnore');}
  else if(actionName.startsWith('examine-')){
    const id=actionName.slice(8);if(panelKind!=='document'||!collected.has(id)||!EVIDENCE[id]||examined.has(id))return;
    examined.add(id);readObject(id,false);cue(EVIDENCE[id].cue,world.items[id]);saveCheckpoint();
  }
  else if(actionName.startsWith('read-')){const id=actionName.slice(5);if(collected.has(id))readObject(id,false);}
}
document.addEventListener('click',event=>{const target=event.target.closest('[data-action]');if(target&&!target.disabled)dispatch(target.dataset.action);});
document.addEventListener('input',event=>{const el=event.target;if(el.matches('[data-radio-dial]')){setRadioDial(Number(el.value));return;}const key=el.dataset.setting;if(!key)return;options[key]=el.type==='checkbox'?el.checked:el.tagName==='SELECT'?el.value:Number(el.value);applySettings();});
document.addEventListener('keydown',event=>{
  if(event.code==='Tab'&&mode==='panel'){
    const focusable=[...$('panel').querySelectorAll('button:not([disabled]),a,input,select')].filter(el=>!el.hidden);if(!focusable.length)return;
    const first=focusable[0],last=focusable.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}return;
  }
  if(event.code==='Escape'||event.code==='KeyP'){
    event.preventDefault();if(event.repeat)return;if(mode==='play'||mode==='scope')pause();else if(mode==='panel'&&!['intro','telescope','death','ending'].includes(panelKind))resume();return;
  }
  if(mode!=='play'||event.target.matches('input,select,textarea'))return;
  if(event.code==='KeyH'){event.preventDefault();if(!event.repeat)searchHelp();return;}
  if(event.code==='Enter'&&event.target.matches('button,a,[role="button"]'))return;
  if(event.code==='Enter'||event.code==='KeyT'){event.preventDefault();if(!event.repeat)event.code==='Enter'?nextSpeech():toggleDialogueHold();return;}
  if(dialoguePaused){if(event.code==='KeyJ'||event.code==='KeyM')journal();return;}
  if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyW','KeyA','KeyS','KeyD'].includes(event.code))event.preventDefault();
  keys[event.code]=true;if(event.repeat)return;
  if(event.code==='KeyE')interact();if(event.code==='KeyF')toggleLamp();if(event.code==='KeyQ')toggleGlasses();if(event.code==='KeyR')throwBottle();
  if(event.code==='KeyJ'||event.code==='KeyM')journal();
  if(event.code==='KeyZ'){autoWalk=!autoWalk;toast(autoWalk?'自動歩行：Zで停止':'自動歩行を止めた',1300);}
});
document.addEventListener('keyup',event=>{delete keys[event.code];});
document.addEventListener('pointerlockchange',onPointerLockChange);
document.addEventListener('mousemove',event=>{if(mode==='play'&&!dialoguePaused&&document.pointerLockElement===world?.canvas){yaw-=event.movementX*.0021*options.sensitivity;pitch=clamp(pitch-event.movementY*.0019*options.sensitivity,-1.3,1.3);}});
function bindPointers(){
  world.canvas.addEventListener('pointerdown',event=>{if(mode!=='play'||dialoguePaused)return;sound.start();if(document.pointerLockElement===world.canvas)return;dragHints=2;if(!touch&&world.canvas.requestPointerLock&&event.pointerType==='mouse')lockPointer();drag={id:event.pointerId,x:event.clientX,y:event.clientY};world.canvas.setPointerCapture?.(event.pointerId);});
  world.canvas.addEventListener('pointermove',event=>{if(mode!=='play'||!drag||drag.id!==event.pointerId||document.pointerLockElement)return;const dx=event.clientX-drag.x,dy=event.clientY-drag.y;yaw-=dx*.004*options.sensitivity;pitch=clamp(pitch-dy*.0035*options.sensitivity,-1.3,1.3);drag.x=event.clientX;drag.y=event.clientY;});
  const endDrag=()=>{drag=null;};world.canvas.addEventListener('pointerup',endDrag);world.canvas.addEventListener('pointercancel',endDrag);
  const stick=$('joystick');let stickId=null;
  const moveStick=event=>{if(stickId!==event.pointerId||mode!=='play'||dialoguePaused)return;const r=stick.getBoundingClientRect(),dx=(event.clientX-r.left-r.width/2)/(r.width*.34),dy=(event.clientY-r.top-r.height/2)/(r.height*.34),n=Math.max(1,Math.hypot(dx,dy));joystick={x:dx/n,y:dy/n};$('joystick-knob').style.transform='translate('+(joystick.x*r.width*.27)+'px,'+(joystick.y*r.height*.27)+'px)';};
  stick.addEventListener('pointerdown',event=>{if(mode!=='play'||dialoguePaused)return;event.preventDefault();stickId=event.pointerId;stick.setPointerCapture(event.pointerId);moveStick(event);});
  stick.addEventListener('pointermove',moveStick);
  const endStick=()=>{stickId=null;joystick={x:0,y:0};$('joystick-knob').style.transform='translate(0,0)';};stick.addEventListener('pointerup',endStick);stick.addEventListener('pointercancel',endStick);
  for(const name of ['sprint','close-eyes']){const el=document.querySelector('[data-action="'+name+'"]');const set=value=>{if(name==='sprint')touchRun=value;else touchEyes=value;};el.addEventListener('pointerdown',event=>{if(mode!=='play'||dialoguePaused)return;event.preventDefault();el.setPointerCapture(event.pointerId);set(true);});el.addEventListener('pointerup',()=>set(false));el.addEventListener('pointercancel',()=>set(false));}
}
addEventListener('blur',onWindowBlur);addEventListener('focus',onWindowFocus);
document.addEventListener('visibilitychange',()=>{if(document.hidden){freezeInput();if(mode==='play'||mode==='scope')pause();}});
async function boot(){
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  try{
    $('loading-bar').style.width='25%';world=new MountainWorld($('world'),options);flags=freshFlags();stats={repels:0,escapes:0};syncWorld();bindPointers();renderFrame(0);
    $('loading-bar').style.width='100%';$('loading-label').textContent='記録の準備ができました';$('start-button').disabled=false;title();
    animationFrame=requestAnimationFrame(tick);
  }catch(error){console.error(error);$('loading-label').textContent='読み込みに失敗しました。ページを更新してください。';$('loading-bar').style.background='#a66b58';}
}
boot();
