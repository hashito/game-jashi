// Render actual stereo Web Audio graphs: levels, quiet tails, direction and wall attenuation.
import fs from 'node:fs';
import path from 'node:path';
import {serve} from './serve.mjs';
import {launch} from './cdp.mjs';
const out=path.resolve(process.argv[2]||'shots/audio');fs.mkdirSync(out,{recursive:true});
const server=await serve(0,'dist');let page;
try{
  page=await launch({width:640,height:480});
  // A same-origin text page is enough for imports; don't start the 3D game just
  // to render audio, especially on a machine already busy with other GPU jobs.
  await page.goto(`http://127.0.0.1:${server.port}/audio.js`);
  const results=await page.eval(`(async()=>{
    const {Soundscape}=await import('./audio.js');const results=[];
    const cases=[...['objective','found','keyPickup','bottlePickup','crankPickup','doorOpen','doorClose','doorKnock','woodCreak','distantScrape','presenceShift'].map(name=>({name,cue:name})),
      ...['wood','stairs','gravel','leaves'].map(surface=>({name:'foot-'+surface,surface})),
      {name:'doorOpen-wall',cue:'doorOpen',wall:true},{name:'presenceShift-muted',cue:'presenceShift',muted:true},
      {name:'presenceShift-paused',cue:'presenceShift',paused:true},{name:'doorOpen-paused',cue:'doorOpen',paused:true}];
    for(const item of cases){
      const {name}=item,rate=48000,seconds=3.5;
      // Equal source noise for the open/wall comparison; do not leave a global seed behind.
      const random=Math.random;let seed=418731;Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
      const offline=new OfflineAudioContext(2,rate*seconds,rate);
      const context=new Proxy(offline,{get(o,k){if(k==='state')return 'running';const v=Reflect.get(o,k,o);return typeof v==='function'?v.bind(o):v;}});
      const sound=new Soundscape();sound.context=context;sound._buildGraph();sound._ready=true;
      for(const node of [sound._windGain,sound._airGain,sound._needleGain,sound._uneaseA,sound._uneaseB,sound._radioGain,sound._radioToneGain]){node.gain.cancelScheduledValues(0);node.gain.setValueAtTime(0,0);}
      sound.setVolume(1);sound.setMuted(Boolean(item.muted));sound._listener={x:0,z:0,level:0,yaw:0};
      try{
        if(item.surface)sound._footstep(item.surface,false,1);
        else sound.cue(item.cue,{x:3,z:-2,level:0},{occluded:Boolean(item.wall)});
        if(item.paused)sound.update({paused:true,time:0});
      }finally{Math.random=random;}
      const buffer=await offline.startRendering(),channels=[buffer.getChannelData(0),buffer.getChannelData(1)],samples=channels[0];
      let peak=0,sum=0,nonfinite=0,tail=0;const channelRms=[];
      for(const channel of channels){let channelSum=0;for(let i=0;i<channel.length;i++){const x=channel[i];if(!Number.isFinite(x))nonfinite++;peak=Math.max(peak,Math.abs(x));channelSum+=x*x;if(i>=channel.length-rate*.2)tail+=x*x;}sum+=channelSum;channelRms.push(Math.sqrt(channelSum/channel.length));}
      const data=new ArrayBuffer(44+samples.length*4),v=new DataView(data),ascii=(offset,text)=>[...text].forEach((c,i)=>v.setUint8(offset+i,c.charCodeAt(0)));
      ascii(0,'RIFF');v.setUint32(4,data.byteLength-8,true);ascii(8,'WAVEfmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,2,true);v.setUint32(24,rate,true);v.setUint32(28,rate*4,true);v.setUint16(32,4,true);v.setUint16(34,16,true);ascii(36,'data');v.setUint32(40,samples.length*4,true);
      for(let i=0;i<samples.length;i++)for(let c=0;c<2;c++)v.setInt16(44+i*4+c*2,Math.round(Math.max(-1,Math.min(1,channels[c][i]))*32767),true);
      let bytes='';for(const b of new Uint8Array(data))bytes+=String.fromCharCode(b);
      results.push({name,peak,rms:Math.sqrt(sum/(samples.length*2)),channelRms,tailRms:Math.sqrt(tail/(rate*.2*2)),nonfinite,silent:Boolean(item.muted||item.paused),wav:btoa(bytes)});sound.dispose();
    }return results;
  })()`);
  for(const result of results){
    if(result.nonfinite||result.peak>=.12||result.tailRms>.00001)throw new Error(`unsafe level or lingering tail: ${result.name} ${result.peak}/${result.tailRms}`);
    if(result.silent ? result.peak>1e-7 : result.peak<.0005||result.rms<.000025)throw new Error(`unexpected silence/energy: ${result.name} ${result.peak}/${result.rms}`);
    if(!result.silent&&!result.name.startsWith('foot-')&&result.channelRms[1]<result.channelRms[0]*2)throw new Error(`source direction lost: ${result.name}`);
    fs.writeFileSync(path.join(out,`${result.name}.wav`),Buffer.from(result.wav,'base64'));delete result.wav;
  }
  if(results.find(r=>r.name==='doorOpen-wall').rms>=results.find(r=>r.name==='doorOpen').rms*.4)throw new Error('wall does not meaningfully attenuate the door');
  fs.writeFileSync(path.join(out,'levels.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
}finally{await page?.close();server.srv.close();}
