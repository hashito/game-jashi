import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {launch} from './cdp.mjs';
import {serve} from './serve.mjs';
const layoutOnly=process.argv.includes('--layout-only');
const out=path.resolve('shots/guidance');fs.mkdirSync(out,{recursive:true});
const server=await serve(0,'dist'),base=`http://127.0.0.1:${server.port}/`;
const saveKey='jashi-mountain-checkpoint-v4';
const profiles=[['desktop',{width:1440,height:900}],['phone',{width:390,height:844,mobile:true,dpr:1}],['landscape',{width:844,height:390,mobile:true,dpr:1}]];
try{
  for(const [name,profile]of profiles){
    const p=await launch(profile);
    const click=async selector=>{
      const rect=await p.eval(`(async()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)throw Error('missing control');e.scrollIntoView({block:'center'});await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
      await p.click(rect.x,rect.y);
    };
    try{
      await p.goto(base);
      await p.eval(`localStorage.clear();localStorage.setItem('jashi-mountain-options-v1',JSON.stringify({quality:'low',tape:0,motion:false,volume:.6}));`);
      await p.goto(base);await p.waitFor("!document.getElementById('start-button').disabled",60000);
      await click('[data-action="start"]');
      if(!layoutOnly)await p.waitFor("document.querySelector('.scene-photo img')?.naturalWidth>0");
      await p.shot(path.join(out,`${name}-intro.png`));
      await click('[data-action="begin"]');await p.sleep(800);
      const initial=await p.eval(`JSON.parse(localStorage.getItem('${saveKey}'))`);
      assert.ok(initial?.v===4);
      const scenarios=[
        {id:'telescope',flags:{},stage:0,player:initial.player},
        {id:'bottle',flags:{seen:true,downstairs:true,radioTuned:true,glasses:true,key:true,note:true},stage:4,player:{x:-19,z:-1.85,level:0}},
        {id:'crank',flags:{seen:true,downstairs:true,radioTuned:true,glasses:true,key:true,note:true,bottle:true},stage:4,player:{x:16,z:-13.2,level:0}},
      ];
      for(const scenario of scenarios){
        const checkpoint=structuredClone(initial);Object.assign(checkpoint.flags,scenario.flags);checkpoint.story.stage=scenario.stage;checkpoint.player=scenario.player;
        checkpoint.time=20;checkpoint.lastStoryAdvance=20;checkpoint.speechQueue=[];checkpoint.activeSpeech=null;checkpoint.speechTime=0;checkpoint.enemy.position={x:4,z:-28,level:0};
        await p.eval(`localStorage.setItem('${saveKey}',${JSON.stringify(JSON.stringify(checkpoint))})`);
        await p.goto(base);await p.waitFor("!document.getElementById('start-button').disabled",60000);await click('[data-action="continue"]');await p.sleep(700);
        const info=await p.eval(`(()=>{const card=document.getElementById('search-card'),r=card.getBoundingClientRect(),visible=e=>e&&!e.hidden&&getComputedStyle(e).display!=='none',overlap=(a,b)=>Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));return {title:document.getElementById('objective').textContent,src:document.getElementById('search-thumb').getAttribute('src'),image:document.getElementById('search-thumb').naturalWidth,overflow:document.documentElement.scrollWidth>innerWidth+1,outside:r.left<0||r.right>innerWidth||r.bottom>innerHeight,overlaps:[...document.querySelectorAll('#subtitle,#toast,.mobile-action-buttons,#joystick,.survival-status')].filter(visible).filter(e=>overlap(r,e.getBoundingClientRect())>4).map(e=>e.id||e.className)};})()`);
        assert.equal(info.src,`assets/items/${scenario.id}.png`);assert.ok(info.image>0);assert.equal(info.overflow,false,`${name}: no horizontal overflow`);assert.equal(info.outside,false);assert.deepEqual(info.overlaps,[],`${name}: search card must not cover controls`);
        await p.shot(path.join(out,`${name}-${scenario.id}.png`));
        if(profile.mobile)await click('#search-card');else await p.key('KeyH');
        await p.waitFor("document.getElementById('panel-title').textContent==='次にすること'");
        assert.equal(await p.eval("document.querySelector('.search-detail img').naturalWidth>0"),true);
        await p.shot(path.join(out,`${name}-${scenario.id}-help.png`));
        if(scenario.id==='bottle'){
          const clock=await p.eval("document.getElementById('tape-clock').textContent");
          await click('[data-action="guide-voice"]');await p.waitFor("document.getElementById('guide-voice-status').textContent.includes('再生中')",30000);
          await p.sleep(300);assert.equal(await p.eval("document.getElementById('tape-clock').textContent"),clock,'guidance stops danger/game time');
        }
        await click('#panel [data-action="journal"]');await p.waitFor("!!document.querySelector('.trail-map')");
        const map=await p.eval("document.querySelector('.trail-map').textContent");assert.ok(map.includes(info.title),`${name}: target is named on map`);
        await p.shot(path.join(out,`${name}-${scenario.id}-map.png`));
      }
      if(!layoutOnly&&name==='desktop'){
        const media=await p.eval(`(async()=>{const ctx=new AudioContext();try{const images=[];for(const id of ['arrival','return','mountain']){const image=new Image();image.src='assets/photos/'+id+'-v4-1.webp';await image.decode();images.push({id,width:image.naturalWidth,height:image.naturalHeight});}const voices=[];for(const id of ['telescope','radio','glasses','note','bottle','crank','gate','car']){const r=await fetch('assets/audio/guide-'+id+'.wav');if(!r.ok)throw Error('missing voice '+id);const b=await ctx.decodeAudioData(await r.arrayBuffer());voices.push({id,duration:b.duration});}return {images,voices};}finally{await ctx.close();}})()`);
        assert.equal(media.images.length,3);assert.ok(media.images.every(i=>i.width>=1000&&i.height>=700));
        assert.equal(media.voices.length,8);assert.ok(media.voices.every(v=>v.duration>2&&v.duration<20));
        fs.writeFileSync(path.join(out,'media.json'),JSON.stringify(media,null,2));
        const escape=structuredClone(initial);Object.assign(escape.flags,{seen:true,downstairs:true,radioTuned:true,glasses:true,key:true,note:true,bottle:true,crank:true,gate:true});
        escape.story.stage=6;escape.player={x:-25.8,z:26.3,level:0};escape.enemy.position={x:4,z:-28,level:0};escape.speechQueue=[];escape.activeSpeech=null;escape.speechTime=0;
        await p.eval(`localStorage.setItem('${saveKey}',${JSON.stringify(JSON.stringify(escape))})`);
        await p.goto(base);await p.waitFor("!document.getElementById('start-button').disabled");await click('[data-action="continue"]');await p.sleep(300);await p.key('KeyE');
        await p.waitFor("document.querySelector('.scene-photo img')?.getAttribute('src')==='assets/photos/return-v4-1.webp'",30000);
        await p.waitFor("document.querySelector('.scene-photo img')?.naturalWidth>0");await p.shot(path.join(out,'desktop-ending.png'));
      }
      const errors=p.errors.filter(e=>!e.includes('favicon')&&!(layoutOnly&&/assets\/photos\//.test(e)));
      assert.deepEqual(errors,[],`${name}: browser errors`);
      console.log(`${name}: real controls, prop references, map labels, pause, voice and bounds OK${layoutOnly?' (scene photos pending, excluded)':''}`);
    }catch(error){await p.shot(path.join(out,`${name}-failure.png`)).catch(()=>{});throw error;}finally{await p.close();}
  }
}finally{server.srv.close();}
