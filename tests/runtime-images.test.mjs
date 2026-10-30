import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {checkRuntimeImages} from '../tools/check-runtime-images.mjs';
test('runtime images match retained originals, dimensions and per-file delivery budgets',()=>{const result=checkRuntimeImages();assert.deepEqual(result.problems,[]);assert.equal(result.files,23);assert.ok(result.afterBytes<result.beforeBytes*.6);});

test('foliage keeps transparency and every item display uses the lossless WebP manifest',()=>{
  const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
  const report=JSON.parse(read('assets/runtime-images.json'));
  const foliage=report.images.find(e=>e.source.endsWith('cedar-bough-v4.png'));
  assert.equal(foliage.sourceAlpha,true);assert.equal(foliage.alpha,true);
  const items=JSON.parse(read('dist/assets/items/manifest.json')).items;
  assert.equal(items.length,16);
  for(const item of items){
    assert.match(item.file,/\.webp$/);
    const packaged=report.images.find(e=>e.output==='dist/'+item.file);assert.ok(packaged,item.id);
    assert.equal(packaged.lossless,true,item.id);assert.deepEqual(packaged.size,packaged.sourceSize,item.id);
  }
  for(const file of ['dist/main.js','dist/guidance.js'])assert.doesNotMatch(read(file),/assets\/items\/[^"'`\n]+\.png/,file);
});
