import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import { buildCreature, updateCreatureDetails } from '../dist/creature.js';

function create() {
  const urls = [], requests = [], world = { scene: new THREE.Scene(), options: { textureLoader: { load(url, onLoad, _progress, onError) {
    urls.push(url); const texture = new THREE.Texture({ width: 512, height: 512 });
    requests.push({ url, texture, resolve: () => onLoad?.(texture), reject: () => onError?.() }); return texture;
  } } } };
  buildCreature(world); return { world, urls, requests };
}

test('a single vertical eye, pale head/body, hollow mouth and uneven teeth are actual geometry', () => {
  const { world: w, urls } = create();
  assert.equal(w.head.getObjectByName('pale-skull').material, w.torso.getObjectByName('ribcage').material,
    'the skull and body must share the pale generated skin material');
  assert.deepEqual(urls, ['skin', 'cloth', 'iron', 'wood'].map(name => `assets/textures/creature-${name}-v4-2.webp`), 'four small surface tiles replace the old shared skin map; no portrait masks the real face');
  const eyes = []; w.creature.traverse(o => { if (o.name === 'single-vertical-eye') eyes.push(o); });
  assert.equal(eyes.length, 1); assert.ok(eyes[0].scale.y > eyes[0].scale.x * 1.8);
  const cavity = w.head.getObjectByName('mouth-cavity'), upper = w.head.getObjectByName('upper-tooth-0');
  assert.ok(upper.position.z > cavity.position.z + .06, 'teeth must stand forward of the mouth recess');
  assert.notEqual(w.head.getObjectByName('upper-tooth-0').geometry.parameters.height,
    w.head.getObjectByName('upper-tooth-3').geometry.parameters.height);
  assert.ok(w.sickle.getObjectByName('curved-rusted-blade').geometry.attributes.position.count > 20);
  assert.equal(w.arms.length, 2); assert.equal(w.legs.length, 2); assert.equal(w.creatureDetails.fingers.length, 8);
});

test('skin, cloth, rusted iron and wood use distinct bounded shared maps on actual geometry', () => {
  const { world: w, requests } = create(), d = w.creatureDetails;
  assert.equal(new Set(Object.values(d.maps)).size, 4);
  const uses = new Set(); w.creature.traverse(object => { if (object.material?.map) uses.add(object.material.map); });
  assert.equal(uses.size, 4, 'no part clones an extra texture or downloads a separate bump map');
  for (const [name, map] of Object.entries(d.maps)) {
    assert.equal(map.userData.creatureMaterial, name); assert.equal(map.colorSpace, THREE.SRGBColorSpace);
    assert.equal(map.wrapS, THREE.RepeatWrapping); assert.equal(map.wrapT, THREE.RepeatWrapping);
    assert.ok(map.repeat.x >= 1 && map.repeat.y >= 1); assert.equal(map.anisotropy, 2);
    assert.ok(map.image.width <= 512 && map.image.height <= 512);
  }
  assert.equal(w.head.getObjectByName('pale-skull').material.map, d.maps.skin);
  assert.equal(w.torso.getObjectByName('torn-shroud').material.map, d.maps.cloth);
  assert.equal(w.sickle.getObjectByName('curved-rusted-blade').material.map, d.maps.iron);
  assert.equal(w.sickle.getObjectByName('worn-wood-handle').material.map, d.maps.wood);
  for (const surface of Object.values(d.materials)) if (surface.bumpMap) {
    assert.equal(surface.bumpMap, surface.map); assert.ok(surface.bumpScale > 0 && surface.bumpScale <= .009);
  }
  for (const name of ['single-vertical-eye', 'vertical-iris', 'single-slit-pupil', 'mouth-cavity']) assert.equal(w.head.getObjectByName(name).material.map, null, `${name} stays clean and readable`);
  requests.forEach(request => request.resolve()); assert.deepEqual(Object.values(d.textureStatus), ['ready', 'ready', 'ready', 'ready']);
});

test('missing surface images fall back to the same physical creature with readable plain materials', () => {
  const { world: w, requests } = create(), d = w.creatureDetails;
  const before = []; w.creature.traverse(object => { if (object.geometry) before.push(object.geometry); });
  let released = 0; for (const request of requests) { request.texture.addEventListener('dispose', () => released++); request.reject(); }
  assert.equal(released, 4); assert.deepEqual(Object.values(d.textureStatus), ['failed', 'failed', 'failed', 'failed']);
  for (const surface of Object.values(d.materials)) { assert.equal(surface.map, null); assert.equal(surface.bumpMap, null); assert.ok(surface.color.getHex() > 0); }
  const after = []; w.creature.traverse(object => { if (object.geometry) after.push(object.geometry); }); assert.deepEqual(after, before);
  updateCreatureDetails(w, { time: 7.5, dt: .05, scope: { phase: 2, progress: .8 } });
  assert.equal(d.ocular.scale.y, 1); assert.equal(w.head.getObjectByName('single-vertical-eye'), w.eye);
});

test('the one eye is readable at the real 46 m, 12-degree telescope view', () => {
  const { world: w } = create();
  w.creature.position.z = -46; w.creature.updateMatrixWorld(true);
  const camera = new THREE.PerspectiveCamera(12, 1.6, .08, 100); camera.position.y = 2.5;
  camera.updateMatrixWorld(true);
  const top = w.eye.localToWorld(new THREE.Vector3(0, 1, 0)).project(camera);
  const bottom = w.eye.localToWorld(new THREE.Vector3(0, -1, 0)).project(camera);
  assert.ok(Math.abs(top.y - bottom.y) * 400 / 2 > 10, 'the vertical eye spans over 10 pixels at CPU telescope resolution');
});

test('soft-tissue animation opens the jaw without replacing measured navigation or limb poses', () => {
  const { world: w } = create();
  w.creature.position.set(5, 3.35, -8); w.creature.rotation.y = 1.7;
  w.head.rotation.set(.2, -.4, .1); w.arms[1].rotation.x = -2.2;
  for (let i = 0; i < 20; i++) updateCreatureDetails(w, { time: i * .05, dt: .05, active: true });
  const idle = w.creatureDetails.jaw.rotation.x;
  for (let i = 0; i < 20; i++) updateCreatureDetails(w, { time: 1 + i * .05, dt: .05, attackPhase: 'strike', attackProgress: .7, active: true });
  assert.ok(w.creatureDetails.jaw.rotation.x > idle + .35);
  assert.deepEqual(w.creature.position.toArray(), [5, 3.35, -8]); assert.equal(w.creature.rotation.y, 1.7);
  assert.equal(w.head.rotation.y, -.4); assert.equal(w.arms[1].rotation.x, -2.2);
  updateCreatureDetails(w, { time: 7.5, dt: .05, scope: { phase: 2, progress: .8 } });
  assert.equal(w.creatureDetails.ocular.scale.y, 1, 'the recognition beat never closes the only eye');
});
