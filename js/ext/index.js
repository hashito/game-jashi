// Extension modules of 『邪視 ― 視線の山』: the ONLY place for this game's code (docs/standard-3d.md in game-kit).
//   jashi.js     the creature (the 4.x model, a gait, haze, the sickle poses), the monster look "jashi"
//   mountain.js  the mountain, the villa, the huts, the gate and the car dressed on top of the standard world
//   rules.js     the gaze / scythe / bottle rules (unchanged from 4.3.0, tested in Node)
//   gaze.js      those rules on the standard monster: the mind and body meters, eyes closed, the scythe warning, the bottle
//   story.js     the nine stages: conversations, the figure below the balcony, records, death and the ending
//   tower.js     5.7: the number lock of the old post and the reflector on the fire tower
//   sound.js     the beds (kit sound library) and the synthesized scythe, radio, phone and engine
//   papers.js    5.9: the documents on old paper (and as forms: letter, log book, notice, record card), the stories of the items
import * as THREE from 'three';
import { jashiLook } from './jashi.js';
import story from './story.js';

// two item models of this game (game.json "itemKinds"): the red-gripped gate crank and a pair of rubber boots
const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...o });
function crankHandle() {
  const g = new THREE.Group(), iron = mat(0x4c4d4b, { metalness: 0.6, roughness: 0.5 });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.5, 8), iron); shaft.rotation.z = Math.PI / 2; shaft.position.y = 0.02; g.add(shaft);
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.18, 8), iron); arm.position.set(0.25, 0.1, 0); g.add(arm);
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.13, 10), mat(0xa3322a)); grip.rotation.z = Math.PI / 2; grip.position.set(0.31, 0.19, 0); g.add(grip);
  const sq = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.04), iron); sq.position.set(-0.26, 0.02, 0); g.add(sq);
  return g;
}
function rubberBoots() {
  const g = new THREE.Group(), rubber = mat(0x2a3530, { roughness: 0.55 });
  for (const x of [-0.09, 0.09]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.06, 0.36, 12), rubber); leg.position.set(x, 0.2, 0); g.add(leg);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.07, 0.26), rubber); foot.position.set(x, 0.035, 0.06); g.add(foot);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.064, 0.008, 6, 16), mat(0x1a201d)); rim.rotation.x = Math.PI / 2; rim.position.set(x, 0.38, 0); g.add(rim);
  }
  return g;
}

export default function (ext) {
  const shared = { pose: {}, scripted: null, hidden: false };   // the gaze system <-> the look <-> the story
  ext.registerLook('jashi', jashiLook(shared));
  ext.registerItemKind('crank-handle', crankHandle);
  ext.registerItemKind('rubber-boots', rubberBoots);
  story(ext, shared);
}
