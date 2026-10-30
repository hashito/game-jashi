#!/usr/bin/env node
// Verify shipped quadrant artwork without needing the ignored original sheets in CI.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const defaultRoot=fileURLToPath(new URL('../',import.meta.url));
const quadrants={'top-left':[0,0],'top-right':[1,0],'bottom-left':[0,1],'bottom-right':[1,1]};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const requireThat=(condition,message)=>{if(!condition)throw new Error(message);};
const readJSON=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));

function localFile(root,file,prefix){
  requireThat(typeof file==='string'&&file.startsWith(prefix),`Expected a path under ${prefix}: ${file}`);
  const full=path.resolve(root,file),relative=path.relative(path.resolve(root,prefix),full);
  requireThat(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative),`Path escapes ${prefix}: ${file}`);
  return full;
}

function artworkFile(root,file){
  const prefix=['dist/assets/photos/','dist/assets/textures/'].find(prefix=>typeof file==='string'&&file.startsWith(prefix));
  requireThat(prefix,`Expected an artwork path under dist/assets/photos/ or dist/assets/textures/: ${file}`);
  return localFile(root,file,prefix);
}

export function sheetEncoding(sheet){
  const config=Object.hasOwn(sheet,'encoding')?sheet.encoding:{};
  requireThat(config&&typeof config==='object'&&!Array.isArray(config)&&Object.keys(config).every(key=>['maxDimension','quality'].includes(key)),'Sheet encoding accepts only maxDimension and quality');
  const maximum=Object.hasOwn(config,'maxDimension')?config.maxDimension:768,quality=Object.hasOwn(config,'quality')?config.quality:82;
  requireThat(Number.isInteger(maximum)&&maximum>=128&&maximum<=1024,'encoding.maxDimension must be an integer from 128 through 1024');
  requireThat(Number.isInteger(quality)&&quality>=40&&quality<=95,'encoding.quality must be an integer from 40 through 95');
  return {format:'WEBP',quality,method:6,maxDimension:maximum};
}

export function quadrantRect(width,height,quadrant,trim=0){
  requireThat(Number.isInteger(width)&&Number.isInteger(height)&&width%2===0&&height%2===0,'Source dimensions must be even integers');
  requireThat(width>=512&&height>=512&&Math.abs(width-height)<=Math.max(2,Math.max(width,height)*.01),'Source must be square within 1%, at least 512px');
  requireThat(Object.hasOwn(quadrants,quadrant)&&Number.isInteger(trim)&&trim>=0&&trim<=4,'Invalid quadrant or seam trim');
  const [x,y]=quadrants[quadrant],w=width/2,h=height/2;
  return [x*w+(x?trim:0),y*h+(y?trim:0),(x+1)*w-(x?0:trim),(y+1)*h-(y?0:trim)];
}

export function webpDimensions(bytes){
  requireThat(bytes.length>=20&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP','Expected a WebP RIFF file');
  requireThat(bytes.readUInt32LE(4)+8===bytes.length,'Truncated or appended WebP bytes');
  let canvas=null,image=null,offset=12;
  while(offset<bytes.length){
    requireThat(offset+8<=bytes.length,'Truncated WebP chunk header');
    const id=bytes.toString('ascii',offset,offset+4),size=bytes.readUInt32LE(offset+4),start=offset+8,end=start+size;
    requireThat(end+(size%2)<=bytes.length,'Truncated WebP chunk data');
    const data=bytes.subarray(start,end);
    if(id==='VP8X'){
      requireThat(size===10&&!(data[0]&2),'Expected a still WebP canvas');
      canvas=[data.readUIntLE(4,3)+1,data.readUIntLE(7,3)+1];
    }else if(id==='VP8 '){
      requireThat(size>=10&&data.subarray(3,6).equals(Buffer.from([0x9d,0x01,0x2a])),'Invalid VP8 image header');
      image=[data.readUInt16LE(6)&0x3fff,data.readUInt16LE(8)&0x3fff];
    }else if(id==='VP8L'){
      requireThat(size>=5&&data[0]===0x2f,'Invalid VP8L image header');
      const bits=data.readUInt32LE(1);image=[(bits&0x3fff)+1,((bits>>>14)&0x3fff)+1];
    }
    offset=end+(size%2);
  }
  requireThat(image&&image.every(n=>n>0),'WebP has no valid image payload');
  requireThat(!canvas||canvas.every((n,i)=>n===image[i]),'WebP canvas and image dimensions differ');
  return image;
}

export function verifySceneArt({root=defaultRoot,sheetId=null,requireSource=false,writeReports=false}={}){
  root=path.resolve(root);
  const brief=readJSON(path.join(root,'tools/scene-art-briefs-v4.2.json'));
  requireThat(brief.version===1&&Array.isArray(brief.sheets)&&brief.sheets.length>0,'Expected scene-art brief version 1 with sheets');
  requireThat(new Set(brief.sheets.map(s=>s.id)).size===brief.sheets.length,'Duplicate sheet ID');
  const sheets=brief.sheets.filter(sheet=>sheetId===null||sheet.id===sheetId);
  requireThat(sheets.length>0,`Unknown sheet: ${sheetId}`);
  const ids=new Set(),files=new Set(),records=new Set(),reports=[];
  for(const sheet of sheets){
    const encoding=sheetEncoding(sheet);
    requireThat(/^[a-z0-9-]+$/.test(sheet.id)&&sheet.status==='ready',`Sheet is not ready: ${sheet.id}`);
    requireThat(Array.isArray(sheet.jobs)&&sheet.jobs.length===4&&new Set(sheet.jobs.map(j=>j.quadrant)).size===4,`${sheet.id}: expected four distinct quadrants`);
    requireThat(typeof sheet.prompt==='string'&&sheet.prompt.length>100,`${sheet.id}: missing generation prompt`);
    requireThat(Array.isArray(sheet.sourceDimensions)&&sheet.sourceDimensions.length===2,`${sheet.id}: missing source dimensions`);
    const [width,height]=sheet.sourceDimensions;
    requireThat(/^[a-f0-9]{64}$/.test(sheet.sourceSha256),`${sheet.id}: missing source hash`);
    const sourcePath=localFile(root,sheet.sourceFile,'assets/sources/');
    let sourceVerified=false;
    if(fs.existsSync(sourcePath)){
      const source=fs.readFileSync(sourcePath);
      requireThat(hash(source)===sheet.sourceSha256,`${sheet.id}: source sheet hash differs`);
      requireThat(source.length>=24&&source.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&source.toString('ascii',12,16)==='IHDR',`${sheet.id}: source is not PNG`);
      requireThat(source.readUInt32BE(16)===width&&source.readUInt32BE(20)===height,`${sheet.id}: source dimensions differ`);
      sourceVerified=true;
    }else requireThat(!requireSource,`${sheet.id}: original source sheet is missing`);
    for(const job of sheet.jobs){
      requireThat(/^[a-z0-9-]+$/.test(job.id)&&job.status==='ready',`${job.id}: job is not ready`);
      requireThat(!ids.has(job.id)&&!files.has(job.output)&&!records.has(job.record),`${job.id}: duplicate job/output/record`);
      ids.add(job.id);files.add(job.output);records.add(job.record);
      const target=artworkFile(root,job.output),recordPath=localFile(root,job.record,'tools/local-media-records/');
      requireThat(job.output.endsWith('.webp')&&job.record.endsWith('.json'),`${job.id}: unexpected output format`);
      // readFileSync deliberately throws on missing outputs or records; none are skipped.
      const bytes=fs.readFileSync(target),record=readJSON(recordPath),dimensions=webpDimensions(bytes);
      const rect=quadrantRect(width,height,job.quadrant,sheet.seamTrimPixels??0),cropWidth=rect[2]-rect[0],cropHeight=rect[3]-rect[1];
      const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
      requireThat(record.id===job.id&&record.sheetId===sheet.id&&record.quadrant===job.quadrant,`${job.id}: record identifies a different crop`);
      requireThat(record.file===job.output&&record.output===job.output&&record.prompt===sheet.prompt,`${job.id}: output or prompt differs`);
      requireThat(record.sourceFile===sheet.sourceFile&&record.sourceSha256===sheet.sourceSha256&&same(record.sourceDimensions,sheet.sourceDimensions),`${job.id}: source provenance differs`);
      requireThat(record.seamTrimPixels===(sheet.seamTrimPixels??0)&&same(record.cropRect,rect),`${job.id}: crop rectangle differs`);
      requireThat(record.engine==='built-in image_gen'&&record.source?.kind==='generated-builtin'&&record.source?.engine==='image_gen',`${job.id}: incorrect generating engine provenance`);
      requireThat(record.source.originalFile===sheet.sourceFile&&record.source.sourceSha256===sheet.sourceSha256&&record.source.sheetId===sheet.id&&record.source.quadrant===job.quadrant,`${job.id}: nested source provenance differs`);
      requireThat(record.credit&&record.license&&record.licenseUrl&&record.processing,`${job.id}: missing credit, license or processing record`);
      requireThat(hash(bytes)===record.sha256&&bytes.length===record.bytes,`${job.id}: output hash or size differs`);
      requireThat(same(dimensions,record.dimensions)&&record.width===dimensions[0]&&record.height===dimensions[1],`${job.id}: recorded dimensions differ`);
      requireThat(Math.max(...dimensions)===Math.min(encoding.maxDimension,Math.max(cropWidth,cropHeight))&&Math.abs(dimensions[0]-dimensions[1]*cropWidth/cropHeight)<=1,`${job.id}: crop was stretched, upscaled or not bounded to ${encoding.maxDimension}px`);
      requireThat(Object.entries(encoding).every(([key,value])=>record.encoding?.[key]===value),`${job.id}: encoding recipe differs`);
      reports.push({id:job.id,sheetId:sheet.id,file:job.output,record:job.record,sha256:record.sha256,status:'verified-existing',dimensions,encoding,cropRect:rect,sourceFile:sheet.sourceFile,sourceSha256:sheet.sourceSha256,sourceVerified,engineContacted:false});
    }
  }
  if(writeReports){
    const dir=path.join(root,'tools/local-media-verification');fs.mkdirSync(dir,{recursive:true});
    const verifiedAt=new Date().toISOString();
    for(const report of reports)fs.writeFileSync(path.join(dir,`${report.id}-v4-2.json`),JSON.stringify({...report,verifiedAt},null,2)+'\n');
  }
  return reports;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const args=process.argv.slice(2);let sheetId=null,requireSource=false;
    for(let i=0;i<args.length;i++){
      if(args[i]==='--sheet'&&args[i+1]&&!args[i+1].startsWith('--'))sheetId=args[++i];
      else if(args[i]==='--require-source')requireSource=true;
      else throw new Error('Usage: node tools/verify-scene-art.mjs [--sheet SHEET_ID] [--require-source]');
    }
    const reports=verifySceneArt({sheetId,requireSource,writeReports:true});
    console.log(JSON.stringify({verifiedOutputs:reports.length,sourceVerifiedOutputs:reports.filter(r=>r.sourceVerified).length,outputs:reports.map(r=>r.file)},null,2));
  }catch(error){console.error(error.message);process.exitCode=1;}
}
