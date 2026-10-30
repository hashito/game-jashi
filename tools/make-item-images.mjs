#!/usr/bin/env node
// Renders the game's own 3D item models, then packages lossless WebP (no external service).
// Builds the real MountainWorld in headless Edge, clones each item model into an empty
// studio scene (dark backdrop, warm key light like the in-game lamp) and writes
// Retains PNG sources; the manifest and game use WebP. Rerun after changing an item model.
// Pillow is required; GF_PYTHON may select the Python executable without shell interpolation.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import { launch } from './cdp.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIST = path.join(ROOT, 'dist');
const OUT = path.join(DIST, 'assets/items');
// id -> Japanese label (what the record calls it). Order = manifest order.
const ITEMS = {
  glasses: 'サングラスと鍵束', note: '叔父の書き置き', bottle: '蓋つきの容器 二本', crank: '巻上げハンドル',
  photo: '古い写真の封筒', phone: '古い携帯電話', radio: '携帯無線機', bell: '林業用の呼び鐘', telescope: '望遠鏡',
  boots: '揃えられた長靴', ledger: '作業日誌', cassette: 'カセットケース', mirror: '手鏡', ribbon: '橋の赤い紐',
  toy: '布袋の鈴', tag: '作業札',
};
const PAGE = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#000"><div id="w" style="width:64px;height:64px;overflow:hidden"></div>
<script type="module">
import * as THREE from './vendor/three.module.js';
import { MountainWorld } from './world.js';
window.renderItems = async (ids, W, H) => {
  const world = new MountainWorld(document.getElementById('w'), { quality: 'high' });
  await new Promise(r => setTimeout(r, 2500)); // textures
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(W, H); renderer.setPixelRatio(1); renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
  const out = {};
  for (const id of ids) {
    const src = world.items[id]?.mesh; if (!src) continue;
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#141b17');
    const obj = src.clone(true); obj.position.set(0, 0, 0); obj.visible = true; obj.traverse(o => { o.visible = true; });
    scene.add(obj);
    const box = new THREE.Box3().setFromObject(obj), size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
    scene.add(new THREE.HemisphereLight('#c9d3c0', '#1d241f', 1.1));
    const key = new THREE.DirectionalLight('#ffd9a0', 2.6); key.position.set(center.x + 1.5, center.y + 2.4, center.z + 2.2); scene.add(key);
    const rim = new THREE.DirectionalLight('#8fb2c8', 1.1); rim.position.set(center.x - 2, center.y + 1, center.z - 2); scene.add(rim);
    const radius = Math.max(size.length() / 2, .08), camera = new THREE.PerspectiveCamera(32, W / H, .01, 50);
    const dir = new THREE.Vector3(.75, .62, 1).normalize(), dist = radius / Math.sin(THREE.MathUtils.degToRad(32 / 2)) * 1.05;
    camera.position.copy(center).addScaledVector(dir, dist); camera.lookAt(center);
    renderer.render(scene, camera); out[id] = renderer.domElement.toDataURL('image/png');
  }
  return out;
};
window.ready = true;
</script>`;

const TYPES = { '.js': 'text/javascript; charset=utf-8', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg' };
const srv = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/__items.html') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(PAGE); return; }
  const f = path.join(DIST, p);
  if (!f.startsWith(DIST) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
await new Promise(ok => srv.listen(0, '127.0.0.1', ok));
const page = await launch({ width: 800, height: 600 });
try {
  await page.goto(`http://127.0.0.1:${srv.address().port}/__items.html`);
  await page.waitFor('window.ready', 30000);
  const images = await page.eval(`renderItems(${JSON.stringify(Object.keys(ITEMS))}, 320, 240)`);
  fs.mkdirSync(OUT, { recursive: true });
  const manifest = [];
  for (const [id, label] of Object.entries(ITEMS)) {
    if (!images[id]) { console.warn('no model for', id); continue; }
    fs.writeFileSync(path.join(OUT, `${id}.png`), Buffer.from(images[id].split(',')[1], 'base64'));
    manifest.push({ id, label, file: `assets/items/${id}.webp`, width: 320, height: 240, source: 'in-game 3D model (dist/world.js), rendered by tools/make-item-images.mjs; retained PNG packaged as pixel-identical lossless WebP' });
  }
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({ generated: new Date().toISOString().slice(0, 10), items: manifest }, null, 2) + '\n');
  console.log(`rendered ${manifest.length} retained PNG sources; packaging lossless WebP next`, page.errors.length ? page.errors : '');
} finally { await page.close(); srv.close(); }
const python=process.env.GF_PYTHON||(process.platform==='win32'?'python':'python3');
const packaged=spawnSync(python,[path.join(ROOT,'tools/optimize-runtime-images.py'),'--items-only'],{cwd:ROOT,stdio:'inherit',shell:false,windowsHide:true,env:{...process.env,PYTHONUTF8:'1'}});
if(packaged.error)throw packaged.error;
if(packaged.status!==0)throw new Error(`Item WebP packaging failed (${packaged.signal||packaged.status}); check GF_PYTHON and Pillow`);
