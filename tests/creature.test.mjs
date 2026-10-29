import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import { buildCreature, updateCreatureDetails } from '../dist/creature.js';

function create() {
  const urls = [], world = { scene: new THREE.Scene(), options: { textureLoader: { load(url) {
    urls.push(url); return new THREE.Texture({ width: 512, height: 512 });
  } } } };
  buildCreature(world); return { world, urls };
}

test('a single vertical eye, pale head/body, hollow mouth and uneven teeth are actual geometry', () => {
  const { world: w, urls } = create();
  assert.equal(w.head.getObjectByName('pale-skull').material, w.torso.getObjectByName('ribcage').material,
    'the skull and body must share the pale generated skin material');
  assert.deepEqual(urls, ['assets/textures/monster-skin-v4.webp'], 'a dark portrait cannot become the 3D face');
  const eyes = []; w.creature.traverse(o => { if (o.name === 'single-vertical-eye') eyes.push(o); });
  assert.equal(eyes.length, 1); assert.ok(eyes[0].scale.y > eyes[0].scale.x * 1.8);
  const cavity = w.head.getObjectByName('mouth-cavity'), upper = w.head.getObjectByName('upper-tooth-0');
  assert.ok(upper.position.z > cavity.position.z + .06, 'teeth must stand forward of the mouth recess');
  assert.notEqual(w.head.getObjectByName('upper-tooth-0').geometry.parameters.height,
    w.head.getObjectByName('upper-tooth-3').geometry.parameters.height);
  assert.ok(w.sickle.getObjectByName('curved-rusted-blade').geometry.attributes.position.count > 20);
  assert.equal(w.arms.length, 2); assert.equal(w.legs.length, 2); assert.equal(w.creatureDetails.fingers.length, 8);
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
