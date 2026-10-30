import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {webpDimensions} from './verify-scene-art.mjs';
export function checkRuntimeImages(root=fileURLToPath(new URL('../',import.meta.url))){
 const report=JSON.parse(fs.readFileSync(path.join(root,'assets/runtime-images.json'),'utf8')),problems=[];
 if(report.version!==1||!Array.isArray(report.images)||!Array.isArray(report.excludedFromBuild))throw Error('Expected runtime image report version 1');
 const plan=JSON.parse(fs.readFileSync(path.join(root,'tools/runtime-image-plan.json'),'utf8'));
 const items=JSON.parse(fs.readFileSync(path.join(root,'dist/assets/items/manifest.json'),'utf8')).items;
 const expected=new Set([...plan.images.map(e=>e.output),...items.map(e=>'dist/'+e.file)]);
 if(items.some(e=>!/^assets\/items\/[a-z0-9-]+\.webp$/.test(e.file)))problems.push('Item manifest must reference packaged WebP images');
 if(report.images.length!==expected.size||report.images.some(e=>!expected.has(e.output)))problems.push('Runtime report does not cover the configured images and item manifest');
 const hash=b=>createHash('sha256').update(b).digest('hex');
 const seen=new Set();
 for(const e of report.images){try{
  if(seen.has(e.output))throw Error('duplicate output');seen.add(e.output);
  for(const f of [e.source,e.output])if(!f.startsWith('dist/assets/')||f.includes('..'))throw Error('invalid asset path');
  const source=fs.readFileSync(path.join(root,e.source)),bytes=fs.readFileSync(path.join(root,e.output));
  if(hash(source)!==e.sourceSha256||hash(bytes)!==e.sha256)throw Error('source/output hash differs');
  if(bytes.length!==e.bytes||source.length!==e.sourceBytes||bytes.length>e.maxBytes||bytes.length>=source.length)throw Error('size budget or actual saving failed');
  if(JSON.stringify(webpDimensions(bytes))!==JSON.stringify(e.size))throw Error('dimensions differ');
  if(e.maxDimension&&Math.max(...e.size)>e.maxDimension)throw Error('dimension budget failed');
  if(e.lossless&&JSON.stringify(e.size)!==JSON.stringify(e.sourceSize))throw Error('lossless thumbnail dimensions changed');
  if(typeof e.sourceAlpha!=='boolean'||e.sourceAlpha!==e.alpha)throw Error('source transparency was not preserved');
  if(!report.excludedFromBuild.includes(e.source.replace(/^dist\//,''))||report.excludedFromBuild.includes(e.output.replace(/^dist\//,'')))throw Error('incorrect deploy selection');
 }catch(error){problems.push(`${e.output}: ${error.message}`);}}
 for(const f of report.excludedFromBuild)if(!f.startsWith('assets/')||f.includes('..')||!fs.existsSync(path.join(root,'dist',f)))problems.push(`invalid retained source: ${f}`);
 return {problems,files:report.images.length,beforeBytes:report.images.reduce((n,e)=>n+e.sourceBytes,0),afterBytes:report.images.reduce((n,e)=>n+e.bytes,0)};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const result=checkRuntimeImages();console.log(JSON.stringify(result,null,2));if(result.problems.length)process.exitCode=1;}
