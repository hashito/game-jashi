import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {verifySceneArt,webpDimensions,quadrantRect,sheetEncoding} from '../tools/verify-scene-art.mjs';

const root=new URL('../',import.meta.url);
const read=file=>fs.readFileSync(new URL(file,root));
test('all adopted photographs, creature textures and voices match their provenance, compression and audio levels',()=>{
  const ledger=JSON.parse(read('assets/production.json'));
  const briefs=JSON.parse(read('tools/photo-briefs-v4.2.json'));
  const sceneBrief=JSON.parse(read('tools/scene-art-briefs-v4.2.json'));
  const sceneJobs=sceneBrief.sheets.flatMap(sheet=>sheet.jobs),expected=11+briefs.jobs.length+sceneJobs.length;
  assert.equal(ledger.assets.length,expected);
  assert.equal(new Set(ledger.assets.map(a=>a.file)).size,expected);
  for(const photo of briefs.jobs){assert.equal(photo.status,'ready');assert.ok(ledger.assets.some(a=>a.file===photo.output));assert.ok(photo.prompt.length>100);}
  const sceneReports=verifySceneArt();
  assert.equal(sceneReports.length,sceneJobs.length,'every configured quadrant is adopted');
  assert.deepEqual(new Set(sceneReports.map(r=>r.id)),new Set(['trail-notice','forestry-notice','shelter-notice','bridge-notice','cabin-memory','logging-memory','creek-memory','parking-memory','creature-skin','creature-cloth','creature-iron','creature-wood']));
  for(const report of sceneReports){const asset=ledger.assets.find(a=>a.file===report.file);assert.ok(asset,report.file);assert.equal(asset.source.record,report.record);assert.equal(asset.source.sha256,report.sha256);}
  for(const sheet of sceneBrief.sheets){
    if(sheet.id==='creature-materials'){
      assert.ok(sheet.encoding.maxDimension>=128&&sheet.encoding.maxDimension<=512);assert.equal(sheet.encoding.quality,72,'materials retain clean texture detail at a reduced resolution');
      for(const job of sheet.jobs){assert.ok(job.output.startsWith('dist/assets/textures/'),job.id);assert.ok(read(job.output).length<=60*1024,`${job.id}: standard kit texture byte budget`);}
    }else assert.deepEqual(sheet.encoding,{maxDimension:512,quality:68},`${sheet.id}: compact source-based encoding`);
  }
  for(const asset of ledger.assets){
    assert.equal(asset.status,'ready',asset.file);
    const bytes=read(asset.file),record=JSON.parse(read(asset.source.record));
    assert.equal(record.file,asset.file,'the shared ledger worker can rebuild every adopted record');
    assert.ok(record.credit);assert.ok(record.engine);
    const hash=createHash('sha256').update(bytes).digest('hex');
    assert.equal(hash,asset.source.sha256,asset.file);assert.equal(hash,record.sha256,asset.file);
    if(asset.file.endsWith('.webp')){
      assert.match(asset.source.kind,/^(generated|edited)-builtin$/);
      assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WEBP');
      const dimensions=webpDimensions(bytes);assert.ok(dimensions.every(n=>n>0&&n<=1280),asset.file);
      if(record.dimensions)assert.deepEqual(dimensions,record.dimensions,asset.file);
      if(!record.sheetId){
        const detail=briefs.jobs.some(job=>job.output===asset.file),maxWidth=detail?768:1280,maxHeight=detail?576:960;
        assert.deepEqual(record.encoding,{format:'WEBP',quality:76,method:6,maxWidth,maxHeight},asset.file);
        assert.ok(dimensions[0]<=maxWidth&&dimensions[1]<=maxHeight,`${asset.file}: reduced photo resolution`);
      }
      continue;
    }
    assert.equal(asset.source.kind,'generated-local');assert.equal(asset.credit,'VOICEVOX:麒ヶ島宗麟');
    assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WAVE');
    let fmt,data;
    for(let i=12;i+8<=bytes.length;){const id=bytes.toString('ascii',i,i+4),size=bytes.readUInt32LE(i+4);assert.ok(i+8+size<=bytes.length);const chunk=bytes.subarray(i+8,i+8+size);if(id==='fmt ')fmt=chunk;if(id==='data')data=chunk;i+=8+size+(size%2);}
    assert.ok(fmt&&data);assert.equal(fmt.readUInt16LE(0),1);assert.equal(fmt.readUInt16LE(2),1);assert.equal(fmt.readUInt32LE(4),24000);assert.equal(fmt.readUInt16LE(14),16);
    const duration=data.length/48000;assert.ok(duration>2&&duration<20);
    assert.ok(Math.abs(duration-record.durationSeconds)<.001);
    let peak=0,sum=0;
    for(let i=0;i<data.length;i+=2){const sample=data.readInt16LE(i)/32768;peak=Math.max(peak,Math.abs(sample));sum+=sample*sample;}
    assert.ok(peak>.49&&peak<.51,`${asset.file}: -6dBFS without clipping`);
    const rms=20*Math.log10(Math.sqrt(sum/(data.length/2)));assert.ok(rms>-25&&rms<-21,`${asset.file}: audible, consistent speech level`);
  }
});

test('sheet compression supports photo and material profiles with bounded explicit quality and resolution',()=>{
  assert.deepEqual(sheetEncoding({encoding:{maxDimension:512,quality:68}}),{format:'WEBP',quality:68,method:6,maxDimension:512});
  assert.deepEqual(sheetEncoding({encoding:{maxDimension:512,quality:72}}),{format:'WEBP',quality:72,method:6,maxDimension:512});
  assert.deepEqual(sheetEncoding({}),{format:'WEBP',quality:82,method:6,maxDimension:768},'existing version 1 sheets retain their prior default');
  for(const encoding of [{maxDimension:0},{maxDimension:4096},{quality:10},{quality:100},{quality:null},{maxDimension:512.5},{format:'PNG'},null])assert.throws(()=>sheetEncoding({encoding}),/encoding/);
});

test('quadrant cutting preserves outside edges and only removes an explicitly requested central seam',()=>{
  assert.deepEqual(quadrantRect(2048,2048,'top-left'),[0,0,1024,1024]);
  assert.deepEqual(quadrantRect(2048,2048,'top-right',3),[1027,0,2048,1021]);
  assert.deepEqual(quadrantRect(2048,2048,'bottom-left',3),[0,1027,1021,2048]);
  assert.deepEqual(quadrantRect(2048,2048,'bottom-right',3),[1027,1027,2048,2048]);
  assert.throws(()=>quadrantRect(2048,1536,'top-left'),/square/,'a landscape sheet must not be silently stretched');
  assert.throws(()=>quadrantRect(2047,2048,'top-left'),/even/,'odd dimensions cannot produce equal quadrants');
  assert.throws(()=>quadrantRect(2048,2048,'center'),/Invalid/);
});

test('scene verification rejects missing images, corrupted bytes, wrong crops and missing required originals',()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'jashi-scene-art-'));
  try{
    const brief=JSON.parse(read('tools/scene-art-briefs-v4.2.json'));
    brief.sheets=brief.sheets.slice(0,1);
    const sheet=brief.sheets[0],write=(file,bytes)=>{const full=path.join(directory,file);fs.mkdirSync(path.dirname(full),{recursive:true});fs.writeFileSync(full,bytes);};
    write('tools/scene-art-briefs-v4.2.json',JSON.stringify(brief));
    for(const job of sheet.jobs){write(job.output,read(job.output));write(job.record,read(job.record));}
    const options={root:directory,sheetId:sheet.id};
    assert.equal(verifySceneArt(options).length,4);
    assert.ok(verifySceneArt(options).every(r=>r.sourceVerified===false),'CI does not claim ignored original sheets were verified');
    assert.throws(()=>verifySceneArt({...options,requireSource:true}),/source sheet is missing/);
    const job=sheet.jobs[0],original=read(job.output);
    fs.unlinkSync(path.join(directory,job.output));
    assert.throws(()=>verifySceneArt(options),/ENOENT/,'missing output must fail, never be skipped');
    write(job.output,original.subarray(0,original.length-1));
    assert.throws(()=>verifySceneArt(options),/Truncated/,'partial output must fail');
    const changed=Buffer.from(original);changed[changed.length-2]^=1;write(job.output,changed);
    assert.throws(()=>verifySceneArt(options),/hash or size differs/,'changed compressed pixels must fail even with a valid WebP header');
    write(job.output,original);
    const record=JSON.parse(read(job.record));record.cropRect[0]+=2;write(job.record,JSON.stringify(record));
    assert.throws(()=>verifySceneArt(options),/crop rectangle differs/,'source crop attribution must match the quadrant');
    const wrongEncoding=JSON.parse(read(job.record));wrongEncoding.encoding.quality=93;write(job.record,JSON.stringify(wrongEncoding));
    assert.throws(()=>verifySceneArt(options),/encoding recipe differs/,'recorded compression must match the requested sheet profile');
    write(job.record,read(job.record));
    fs.unlinkSync(path.join(directory,job.record));
    assert.throws(()=>verifySceneArt(options),/ENOENT/,'an image without its provenance record is not verified');
  }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
