// Render actual Web Audio cue graphs offline, then verify peak, energy and finite samples.
import fs from 'node:fs';
import path from 'node:path';
import {serve} from './serve.mjs';
import {launch} from './cdp.mjs';
const out=path.resolve(process.argv[2]||'shots/audio');fs.mkdirSync(out,{recursive:true});
const server=await serve(0,'dist');let page;
try{
  page=await launch({width:640,height:480});
  await page.goto(`http://127.0.0.1:${server.port}/`);
  const results=await page.eval(`(async()=>{
    const {Soundscape}=await import('./audio.js');const results=[];
    for(const name of ['objective','found','keyPickup','bottlePickup','crankPickup']){
      const offline=new OfflineAudioContext(1,48000*2,48000);
      const context=new Proxy(offline,{get(o,k){if(k==='state')return 'running';const v=Reflect.get(o,k,o);return typeof v==='function'?v.bind(o):v;}});
      const sound=new Soundscape();sound.context=context;sound._buildGraph();sound._ready=true;
      for(const node of [sound._windGain,sound._airGain,sound._needleGain,sound._uneaseA,sound._uneaseB,sound._radioGain,sound._radioToneGain]){node.gain.cancelScheduledValues(0);node.gain.setValueAtTime(0,0);}
      sound.setVolume(1);sound.cue(name);
      const buffer=await offline.startRendering(),samples=buffer.getChannelData(0);let peak=0,sum=0,nonfinite=0;
      for(const x of samples){if(!Number.isFinite(x))nonfinite++;peak=Math.max(peak,Math.abs(x));sum+=x*x;}
      const data=new ArrayBuffer(44+samples.length*2),v=new DataView(data),ascii=(offset,text)=>[...text].forEach((c,i)=>v.setUint8(offset+i,c.charCodeAt(0)));
      ascii(0,'RIFF');v.setUint32(4,data.byteLength-8,true);ascii(8,'WAVEfmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,48000,true);v.setUint32(28,96000,true);v.setUint16(32,2,true);v.setUint16(34,16,true);ascii(36,'data');v.setUint32(40,samples.length*2,true);
      samples.forEach((x,i)=>v.setInt16(44+i*2,Math.round(Math.max(-1,Math.min(1,x))*32767),true));
      let bytes='';for(const b of new Uint8Array(data))bytes+=String.fromCharCode(b);
      results.push({name,peak,rms:Math.sqrt(sum/samples.length),nonfinite,wav:btoa(bytes)});sound.dispose();
    }return results;
  })()`);
  for(const result of results){
    if(result.nonfinite||result.peak>=.98||result.peak<.001||result.rms<.0001)throw new Error(`invalid rendered cue: ${result.name} ${result.peak}/${result.rms}`);
    fs.writeFileSync(path.join(out,`${result.name}.wav`),Buffer.from(result.wav,'base64'));delete result.wav;
  }
  fs.writeFileSync(path.join(out,'levels.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
}finally{await page?.close();server.srv.close();}
