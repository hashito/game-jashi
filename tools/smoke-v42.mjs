// Uses normal checkpoints, rendered map coordinates and real keyboard/touch
// controls. No game controller globals or production-only debug API are needed.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {launch} from './cdp.mjs';
import {serve} from './serve.mjs';
import {DOORS} from '../dist/layout.js';
import {TELESCOPE_SCENES} from '../dist/narrative.js';
import {EVIDENCE} from '../dist/evidence.js';

const out=path.resolve('shots/v4.2');fs.mkdirSync(out,{recursive:true});
const server=await serve(0,'dist'),base=`http://127.0.0.1:${server.port}/`,saveKey='jashi-mountain-checkpoint-v4';
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
const report=[];
try{
  for(const [name,profile]of [['desktop',{width:1440,height:900}],['phone',{width:390,height:844,mobile:true,dpr:1}]]){
    console.log(`${name}: launching browser`);
    const p=await launch(profile);
    const trace=[];let lastPose=null,stage='initial load';
    const uiState=()=>p.eval(`(()=>({screen:document.body.dataset.screen,scene:document.body.dataset.scene,panelHidden:document.getElementById('panel')?.hidden,panelTitle:document.getElementById('panel-title')?.textContent,scopeHidden:document.getElementById('scope-sequence')?.hidden,clock:document.getElementById('tape-clock')?.textContent,interactionHidden:document.getElementById('interaction')?.hidden,interaction:document.getElementById('interaction-text')?.textContent,focused:document.hasFocus(),pointerLocked:!!document.pointerLockElement,activeElement:document.activeElement?.id||document.activeElement?.tagName,dialoguePaused:document.getElementById('subtitle-hold')?.getAttribute('aria-pressed'),toast:document.getElementById('toast')?.textContent}))()`);
    const traceState=async label=>{const state={label,pose:lastPose,...await uiState()};trace.push(state);console.log(`${name}: ${JSON.stringify(state)}`);return state;};
    const gameplay=()=>p.waitFor("document.body.dataset.screen==='play'&&document.getElementById('panel').hidden&&document.getElementById('scope-sequence').hidden&&document.getElementById('subtitle-hold').getAttribute('aria-pressed')!=='true'",15000);
    const clockSeconds=value=>String(value).split(':').reduce((total,n)=>total*60+Number(n),0);
    const tap=async selector=>{
      const rect=await p.eval(`(async()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)throw Error('missing control: '+${JSON.stringify(selector)});e.scrollIntoView({block:'center'});await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);
      if(profile.mobile){await p.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...rect,id:1}]});await p.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
      else await p.click(rect.x,rect.y);
    };
    const interact=async()=>profile.mobile?tap('[data-action="interact"]'):p.key('KeyE');
    const closePanel=async()=>{await tap('#panel-close');await gameplay();await p.sleep(150);};
    const openMap=async()=>{if(profile.mobile)await tap('.hud-icon-button[data-action="journal"]');else await p.key('KeyJ');await p.waitFor("!!document.querySelector('.trail-map')&&!document.getElementById('panel').hidden");};
    const pose=async()=>{
      await openMap();
      const data=await p.eval(`(()=>{const svg=document.querySelector('.trail-map');return{label:svg.getAttribute('aria-label'),transform:[...svg.querySelectorAll('g[transform]')].find(g=>g.querySelector('path[fill="#f0cf8a"]'))?.getAttribute('transform')};})()`);
      assert.ok(data.transform,'map exposes the actual current location');
      const nums=data.transform.match(/[-+]?\d*\.?\d+(?:e[-+]?\d+)?/gi).map(Number),up=data.label.startsWith('二階');
      lastPose={x:up?(nums[0]-195)/23:(nums[0]-30)/5-34,z:up?(nums[1]-25)/23+16:(nums[1]-28)/5-34,level:up?1:0,yaw:-nums[2]*Math.PI/180};await closePanel();return lastPose;
    };
    const hold=async(code,ms)=>{await p.key(code,'down');await p.sleep(ms);await p.key(code,'up');await p.sleep(80);};
    const turnToward=async target=>{
      let at=await pose();
      // Arrow controls are also supported on touch browsers. Read the rendered
      // compass after every turn, so CPU-only frame rates cannot skew the aim.
      for(let i=0;i<12;i++){
        const desired=Math.atan2(-(target.x-at.x),-(target.z-at.z)),delta=wrap(desired-at.yaw);if(Math.abs(delta)<.065)return at;
        await hold(delta>0?'ArrowLeft':'ArrowRight',Math.max(35,Math.min(800,Math.abs(delta)*520)));at=await pose();
      }
      throw Error(`could not face ${JSON.stringify(target)} from ${JSON.stringify(at)}`);
    };
    const forward=async seconds=>{
      await gameplay();const before=await uiState(),start=clockSeconds(before.clock);assert.ok(Number.isFinite(start),'game clock is readable');
      try{
        if(!profile.mobile)await p.key('KeyW','down');
        else{
          const r=await p.eval("(()=>{const r=document.getElementById('joystick').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2,d:r.width*.4};})()");
          await p.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:r.x,y:r.y,id:2}]});
          await p.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:r.x,y:r.y-r.d,id:2}]});
        }
        // The game's clock caps simulation catch-up. Wait for actual simulated
        // seconds rather than assuming 400 ms of wall time includes a frame.
        const until=Date.now()+30000;let advanced=false;
        while(Date.now()<until){const state=await uiState();assert.equal(state.panelHidden,true,`movement paused: ${JSON.stringify(state)}`);if(clockSeconds(state.clock)>=start+seconds){advanced=true;break;}await p.sleep(100);}
        assert.ok(advanced,`simulation clock did not advance ${seconds}s: ${JSON.stringify(await uiState())}`);
      }finally{
        if(profile.mobile)await p.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});else await p.key('KeyW','up');
      }
      await p.sleep(100);
    };
    const bounds=async label=>assert.equal(await p.eval('document.documentElement.scrollWidth>innerWidth+1'),false,`${name}: ${label} horizontal overflow`);
    let initial;
    const load=async checkpoint=>{
      await p.eval(`localStorage.setItem('${saveKey}',${JSON.stringify(JSON.stringify(checkpoint))})`);
      await p.goto(base);await p.waitFor("!document.getElementById('start-button').disabled",90000);await tap('[data-action="continue"]');await p.sleep(450);
    };
    const checkpoint=(player,extra={})=>{
      const c=structuredClone(initial);Object.assign(c.flags,{seen:true,downstairs:true,radioTuned:true,glasses:true,key:true,note:true});
      c.story.stage=4;c.story.events=['opening','sighting','downstairs','radioTuned','glasses','note'];c.player=player;c.time=20;c.lastStoryAdvance=20;c.speechQueue=[];c.activeSpeech=null;c.speechTime=0;c.enemy.position={x:4,z:-28,level:0};c.enemy.mode='search';c.enemy.lastKnown=null;c.enemy.route=[];c.doors=Object.fromEntries(DOORS.map(d=>[d.id,true]));return Object.assign(c,extra);
    };
    try{
      console.log(`${name}: loading game`);
      await p.goto(base);await p.eval("localStorage.clear();localStorage.setItem('jashi-mountain-options-v1',JSON.stringify({quality:'low',tape:0,motion:false,volume:.6}));");
      await p.goto(base);await p.waitFor("!document.getElementById('start-button').disabled",90000);await tap('[data-action="start"]');await tap('[data-action="begin"]');await p.sleep(600);
      initial=await p.eval(`JSON.parse(localStorage.getItem('${saveKey}'))`);assert.equal(initial.v,4);
      for(const [id,start]of [['cabin-entry',{x:0,z:20.6,level:0}],['shed-entry',{x:-19,z:.6,level:0}]]){
        stage=id;console.log(`${name}: ${id}`);
        const d=DOORS.find(d=>d.id===id),c=checkpoint(start);c.doors[id]=false;await load(c);await turnToward(d);
        await p.waitFor(`!document.getElementById('interaction').hidden&&document.getElementById('interaction-text').textContent.includes(${JSON.stringify(d.label)})`);
        await p.shot(path.join(out,`${name}-${id}-closed.png`));
        const approach=await pose();await forward(2);const blocked=await pose();await traceState(`${id}: closed movement`);
        assert.ok(blocked.z>d.z+.25,`${id}: a closed door blocks actual movement: ${JSON.stringify(blocked)}`);
        assert.ok(blocked.z<approach.z-.3,`${id}: movement input approaches the closed door: ${JSON.stringify({approach,blocked})}`);
        await forward(1);const stillBlocked=await pose();assert.ok(Math.hypot(stillBlocked.x-blocked.x,stillBlocked.z-blocked.z)<.2,`${id}: continued walking stops at the physical leaf`);
        await turnToward(d);await interact();await p.waitFor(`JSON.parse(localStorage.getItem('${saveKey}')).doors[${JSON.stringify(id)}]===true`);await p.sleep(600);
        await p.shot(path.join(out,`${name}-${id}-open.png`));
        let inside=await pose();for(let i=0;i<8&&inside.z>d.z-.65;i++){await turnToward({x:d.x,z:d.z-2});await forward(1);inside=await pose();await traceState(`${id}: open movement ${i+1}`);}
        assert.ok(inside.z<d.z-.65,`${id}: opening permits actual movement through the doorway: ${JSON.stringify({inside,door:d,ui:await uiState()})}`);await p.shot(path.join(out,`${name}-${id}-crossed.png`));
        report.push({profile:name,door:id,blocked,inside});
        if(id==='shed-entry'){
          await turnToward({x:-19,z:-3});await p.waitFor("document.getElementById('interaction-text').textContent.includes('ボトル')");await interact();
          await p.waitFor(`JSON.parse(localStorage.getItem('${saveKey}')).flags.bottle===true`);assert.equal(await p.eval("document.getElementById('charge-count').textContent"),'×2');await bounds('bottle record');await p.shot(path.join(out,`${name}-shed-bottle.png`));await closePanel();
        }
      }
      // These are already photographed records in a normal saved game. Opening
      // and inspecting them still goes through the actual journal UI.
      const records=checkpoint({x:0,z:23,level:0});records.collected=['boots','ledger','mirror'];records.examined=[];await load(records);
      for(const id of records.collected){
        stage=`inspect ${id}`;console.log(`${name}: ${stage}`);await openMap();await tap('[data-action="journal-records"]');await tap(`[data-action="read-${id}"]`);
        await p.waitFor("document.querySelector('.evidence-photo img')?.naturalWidth>0",30000);assert.equal(await p.eval("document.querySelector('.evidence-photo img').getAttribute('src')"),EVIDENCE[id].image);
        await bounds(`${id} photo`);await p.shot(path.join(out,`${name}-${id}-photo.png`));await tap(`[data-action="examine-${id}"]`);
        await p.waitFor(`!document.querySelector('[data-action="examine-${id}"]')&&document.getElementById('panel-body').textContent.includes(${JSON.stringify(EVIDENCE[id].result.slice(0,14))})`);
        assert.ok((await p.eval(`JSON.parse(localStorage.getItem('${saveKey}')).examined`)).includes(id));await bounds(`${id} inspection`);await p.shot(path.join(out,`${name}-${id}-examined.png`));await closePanel();
      }
      const persisted=await p.eval(`JSON.parse(localStorage.getItem('${saveKey}'))`);await load(persisted);await openMap();await tap('[data-action="journal-records"]');await tap('[data-action="read-boots"]');
      assert.equal(await p.eval(`!!document.querySelector('[data-action="examine-boots"]')`),false,'inspection persists after actual reload');await closePanel();
      stage='telescope';const telescope=structuredClone(initial);telescope.player={x:0,z:18.4,level:1};telescope.time=5;telescope.speechQueue=[];telescope.activeSpeech=null;telescope.speechTime=0;telescope.doors=Object.fromEntries(DOORS.map(d=>[d.id,true]));
      await load(telescope);await turnToward({x:0,z:17.8});await interact();
      for(let phase=0;phase<3;phase++){
        await p.waitFor(`!document.getElementById('scope-sequence').hidden&&document.getElementById('scope-title').textContent===${JSON.stringify(TELESCOPE_SCENES[phase].title)}`,90000);await p.sleep(phase===2?1000:250);await bounds(`scope ${phase}`);await p.shot(path.join(out,`${name}-scope-${phase}.png`));
      }
      assert.deepEqual(p.errors.filter(e=>!e.includes('favicon')),[],`${name}: browser errors`);console.log(`${name}: doors, movement, bottle, detail photos, inspection persistence and all scope beats OK`);
    }catch(error){
      const diagnostics={error:String(error),stage,lastPose,ui:await uiState().catch(stateError=>({error:String(stateError)})),trace,errors:p.errors,logs:p.logs};
      fs.writeFileSync(path.join(out,`${name}-failure.json`),JSON.stringify(diagnostics,null,2));console.error(diagnostics);
      await p.shot(path.join(out,`${name}-failure.png`)).catch(captureError=>console.error('Screenshot failed:',String(captureError)));throw error;
    }finally{await p.close();}
  }
  fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({checkedAt:new Date().toISOString(),report},null,2));
}finally{server.srv.close();}
