import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';

const root=new URL('../',import.meta.url);
const read=file=>fs.readFileSync(new URL(file,root));
test('all adopted photographs and voices match their recorded provenance and audio levels',()=>{
  const ledger=JSON.parse(read('assets/production.json'));
  assert.equal(ledger.assets.length,14);
  assert.equal(new Set(ledger.assets.map(a=>a.file)).size,14);
  const briefs=JSON.parse(read('tools/photo-briefs-v4.2.json'));
  for(const photo of briefs.jobs){assert.equal(photo.status,'ready');assert.ok(ledger.assets.some(a=>a.file===photo.output));assert.ok(photo.prompt.length>100);}
  for(const asset of ledger.assets){
    assert.equal(asset.status,'ready',asset.file);
    const bytes=read(asset.file),record=JSON.parse(read(asset.source.record));
    const hash=createHash('sha256').update(bytes).digest('hex');
    assert.equal(hash,asset.source.sha256,asset.file);assert.equal(hash,record.sha256,asset.file);
    if(asset.file.endsWith('.webp')){
      assert.match(asset.source.kind,/^(generated|edited)-builtin$/);
      assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WEBP');
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
