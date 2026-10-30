import * as THREE from './vendor/three.module.js';

const clamp = (n, a = 0, b = 1) => Math.max(a, Math.min(b, n));
const material = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: .94, ...extra });

/** The same skeleton coordinates are used by the measured, collision-aware gait. */
export function buildCreature(world) {
  const group = (name, parent, x = 0, y = 0, z = 0) => {
    const object = new THREE.Group(); object.name = name; object.position.set(x, y, z); parent.add(object); return object;
  };
  const mesh = (name, geometry, skin, parent, x = 0, y = 0, z = 0, scale) => {
    const object = new THREE.Mesh(geometry, skin); object.name = name;
    object.position.set(x, y, z); if (scale) object.scale.set(...scale);
    object.castShadow = true; parent.add(object); return object;
  };
  const ball = (name, skin, parent, x, y, z, scale, segments = 10) =>
    mesh(name, new THREE.SphereGeometry(1, segments, 8), skin, parent, x, y, z, scale);
  const tube = (name, points, radius, skin, parent, closed = false) => mesh(name,
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)), closed), points.length * 2, radius, 5, closed), skin, parent);
  const loader = world.options?.textureLoader || new THREE.TextureLoader();
  // Four small shared tiles cover the whole creature. Reusing their luminance
  // for shallow relief adds no normal/bump downloads, including on mobile.
  const textureStatus = {}, textureUsers = new Map(), maps = {};
  const loadMap = (name, repeat) => {
    textureStatus[name] = 'loading'; textureUsers.set(name, []); let texture;
    texture = loader.load(`assets/textures/creature-${name}-v4-2.webp`,
      () => { if (textureStatus[name] !== 'failed') textureStatus[name] = 'ready'; }, undefined, () => {
        textureStatus[name] = 'failed';
        for (const surface of textureUsers.get(name)) {
          surface.map = null; surface.bumpMap = null; surface.needsUpdate = true;
        }
        texture?.dispose();
      });
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(...repeat); texture.anisotropy = 2;
    texture.userData.creatureMaterial = name;
    if (textureStatus[name] === 'failed') texture.dispose();
    maps[name] = texture;
  };
  loadMap('skin', [1.6, 1.6]); loadMap('cloth', [3, 2]);
  loadMap('iron', [1.5, 1.5]); loadMap('wood', [1, 2]);
  const textured = (color, name, extra = {}) => {
    const map = textureStatus[name] === 'failed' ? null : maps[name];
    const surface = material(color, { map, ...extra, bumpMap: extra.bumpScale ? map : null });
    textureUsers.get(name).push(surface); return surface;
  };
  const skinMap = maps.skin;
  const skin = textured('#d3d1bd', 'skin', { bumpScale: .005 });
  const tendon = textured('#b5b7a3', 'skin', { bumpScale: .004 });
  const fold = textured('#6b7264', 'skin', { bumpScale: .003 });
  const cavity = material('#100f12', { roughness: .99 });
  const tooth = material('#b8b196', { roughness: .73 });
  const nail = material('#665f4b', { roughness: .86 });
  const shroud = textured('#929688', 'cloth', { roughness: 1, bumpScale: .009 });
  const binding = textured('#555548', 'cloth', { roughness: 1 });
  const handleMaterial = textured('#a08a6c', 'wood', { roughness: .91, bumpScale: .006 });
  const bladeMaterial = textured('#aaa38e', 'iron', { metalness: .62, roughness: .78, bumpScale: .003, side: THREE.DoubleSide });
  const edgeMaterial = textured('#cccbbb', 'iron', { metalness: .78, roughness: .52 });

  world.creature = group('jashi', world.scene);
  world.creature.userData.anatomy = 'one vertical eye; asymmetric articulated jaw; covered emaciated body';
  world.creature.visible = false;
  world.torso = group('torso', world.creature);
  ball('ribcage', skin, world.torso, -.025, 1.53, -.035, [.30, .50, .185]);
  ball('hollow-waist', skin, world.torso, .012, 1.20, .015, [.175, .29, .135]);
  // Shallow ribs catch grazing light without painting the entire body dark.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) tube(`rib-${side}-${i}`,
      [[side * .035, 1.77 - i * .11, .142], [side * .15, 1.72 - i * .105, .161], [side * .245, 1.66 - i * .095, .09]],
      .013, tendon, world.torso);
    ball(`shoulder-${side}`, skin, world.torso, side * .25, 1.88, -.025, [.15, .125, .15]);
    tube(`neck-tendon-${side}`, [[side * .16, 1.86, .09], [side * .095, 2.04, .11], [side * .11 - .06, 2.22, .12]], .018, tendon, world.torso);
  }
  mesh('neck', new THREE.CylinderGeometry(.073, .11, .39, 10), skin, world.torso, -.055, 2.02, .035);
  mesh('torn-shroud', new THREE.CylinderGeometry(.20, .245, .68, 11), shroud, world.torso, .015, .91, .015);
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3;
    const strip = mesh(`shroud-edge-${i}`, new THREE.ConeGeometry(.05, .18 + i % 2 * .05, 3), shroud, world.torso,
      Math.sin(a) * .22, .55 - (i % 2) * .025, Math.cos(a) * .22);
    strip.rotation.z = Math.PI;
  }

  world.head = group('head', world.torso, -.075, 2.28, .14);
  const skullGeometry = new THREE.SphereGeometry(1, 18, 14);
  const skullPosition = skullGeometry.attributes.position;
  for (let i = 0; i < skullPosition.count; i++) {
    let x = skullPosition.getX(i), y = skullPosition.getY(i), z = skullPosition.getZ(i);
    // Narrow, sunken lower face. Its recess sits behind the actual teeth/jaw.
    if (y < -.05 && z > 0) z *= .46 + .3 * Math.abs(x);
    x *= 1 + .045 * y - .055 * Math.sin(y * 4);
    skullPosition.setXYZ(i, x, y, z);
  }
  skullGeometry.computeVertexNormals();
  mesh('pale-skull', skullGeometry, skin, world.head, 0, .025, -.025, [.30, .365, .245]);
  for (const side of [-1, 1]) {
    ball(`temple-${side}`, tendon, world.head, side * .205, .035 + side * .015, .125, [.085, .16, .105]);
    tube(`cheekbone-${side}`, [[side * .245, .13, .13], [side * .23, -.025, .215], [side * .155, -.085, .265], [side * .13, -.18, .20]], .029, skin, world.head);
    tube(`jaw-tendon-${side}`, [[side * .22, -.035, .12], [side * .18, -.225, .17], [side * .105 + .02, -.34, .21]], .014, tendon, world.head);
  }
  // A vertical socket with asymmetrical raised lids; no two-eyed human mask.
  ball('vertical-eye-socket', fold, world.head, .004, .115, .232, [.135, .222, .075], 14);
  const ocular = group('ocular', world.head, .004, .115, .292);
  world.eye = ball('single-vertical-eye', material('#c1c4ab', { roughness: .27 }), ocular, 0, 0, 0, [.078, .155, .048], 16);
  const iris = ball('vertical-iris', material('#767e4a', { roughness: .35 }), ocular, -.005, -.006, .045, [.044, .113, .012], 12);
  const pupil = ball('single-slit-pupil', cavity, ocular, -.005, -.006, .057, [.013, .083, .008], 10);
  ball('eye-catchlight', new THREE.MeshBasicMaterial({ color: '#dedfbb' }), pupil, -.25, .42, .82, [.13, .08, .13], 6);
  const upperLid = group('upper-lid', world.head, .004, .115, .292);
  const lowerLid = group('lower-lid', world.head, .004, .115, .292);
  const eyeRim = (first, last, steps, radius) => Array.from({ length: steps + 1 }, (_, i) => {
    const a = first + (last - first) * i / steps;
    return [Math.cos(a) * radius, Math.sin(a) * .17, .012 + Math.sin(a * 2) * .011];
  });
  tube('heavy-upper-eyelid', eyeRim(0, Math.PI, 8, .091), .027, skin, upperLid);
  tube('uneven-lower-eyelid', eyeRim(Math.PI, Math.PI * 2, 8, .09), .019, tendon, lowerLid);
  tube('forehead-ridge-left', [[-.09, .32, .18], [-.145, .235, .255], [-.14, .08, .265], [-.105, -.065, .27]], .028, skin, world.head);
  tube('forehead-ridge-right', [[.10, .315, .17], [.135, .23, .25], [.12, .10, .267], [.104, -.035, .26]], .02, tendon, world.head);
  ball('collapsed-nose-bridge', skin, world.head, -.003, -.091, .245, [.045, .068, .036]);

  // The mouth is an open cavity behind teeth, with a physically offset lower jaw.
  ball('mouth-cavity', cavity, world.head, .01, -.215, .176, [.139, .147, .085], 14);
  tube('upper-mouth-rim', [[-.137, -.185, .23], [-.105, -.133, .27], [-.035, -.126, .284], [.065, -.143, .275], [.141, -.205, .22]], .02, tendon, world.head);
  const jaw = group('dislocated-jaw', world.head, .026, -.17, .13);
  jaw.rotation.z = -.16;
  tube('lower-jaw-bone', [[-.16, .015, .055], [-.13, -.145, .103], [-.035, -.196, .139], [.07, -.178, .141], [.13, -.063, .072]], .034, skin, jaw);
  ball('drawn-chin', skin, jaw, -.007, -.193, .112, [.085, .046, .052]);
  for (let i = 0; i < 7; i++) {
    const x = (i - 3) * .029, length = [.036, .058, .044, .067, .042, .055, .034][i];
    const upper = mesh(`upper-tooth-${i}`, new THREE.ConeGeometry(.011 + i % 2 * .002, length, 5), tooth, world.head,
      x, -.151 - length / 2 + Math.abs(x) * .16, .272 - Math.abs(x) * .18);
    upper.rotation.z = Math.PI + (i - 3) * .055;
    if (i !== 2 && i !== 5) {
      const lower = mesh(`lower-tooth-${i}`, new THREE.ConeGeometry(.012, length * .7, 5), tooth, jaw,
        x - .007, -.148 + length * .25, .145 - Math.abs(x) * .12);
      lower.rotation.z = (i - 3) * .04;
    }
  }
  const throat = ball('throat-tension', tendon, world.torso, -.052, 2.02, .118, [.047, .1, .027]);

  world.arms = [];
  world.legs = [];
  const fingers = [];
  for (const side of [-1, 1]) {
    const arm = group(`arm-${side}`, world.torso, side * .31, 1.88, -.02);
    ball('upper-arm', skin, arm, side * .04, -.29, .015, [.079, .35, .071]);
    ball('protruding-elbow', tendon, arm, side * .075, -.60, .025, [.071, .066, .063]);
    ball('long-forearm', skin, arm, side * .09, -.88, .08, [.051, .34, .054]);
    tube('forearm-tendon', [[side * .08, -.63, .075], [side * .105, -.94, .128], [side * .1, -1.23, .162]], .009, tendon, arm);
    ball('knuckled-palm', skin, arm, side * .1, -1.20, .13, [.074, .12, .037]);
    for (let f = 0; f < 4; f++) {
      const length = .16 + (f === 1 ? .035 : 0), x = side * .1 + (f - 1.5) * .03;
      const finger = mesh(`finger-${side}-${f}`, new THREE.CylinderGeometry(.012, .008, length, 5), skin, arm, x, -1.36, .15);
      finger.rotation.x = -.3 - f * .07;
      // Claws bend forwards instead of extending below the checked fingertip.
      const claw = mesh(`claw-${side}-${f}`, new THREE.ConeGeometry(.009, .055, 5), nail, finger, 0, -length / 2 + .014, .02);
      claw.rotation.x = -Math.PI / 2 - .25;
      fingers.push(finger);
    }
    world.arms.push(arm);
    const leg = group(`leg-${side}`, world.creature, side * .13, .98, .005);
    ball('thigh', skin, leg, side * .015, -.23, -.015, [.085, .29, .078]);
    ball('exposed-knee', tendon, leg, side * .01, -.49, .025, [.073, .065, .062]);
    mesh('shin', new THREE.CylinderGeometry(.055, .035, .46, 8), skin, leg, 0, -.72, .045);
    ball('long-foot', tendon, leg, 0, -.93, .12, [.073, .045, .165]);
    world.legs.push(leg);
  }

  world.sickle = group('sickle', world.arms[1], .1, -1.2, .16);
  const handle = mesh('worn-wood-handle', new THREE.CylinderGeometry(.023, .031, .8, 8), handleMaterial, world.sickle, 0, .10, 0);
  handle.rotation.z = -.18;
  for (let i = 0; i < 3; i++) mesh(`sickle-binding-${i}`, new THREE.CylinderGeometry(.033, .033, .022, 7), binding, world.sickle, -.045 + i * .004, .34 + i * .035, 0);
  const bladeShape = new THREE.Shape();
  bladeShape.moveTo(-.07, .47);
  bladeShape.bezierCurveTo(.28, .69, .80, .65, .72, -.17);
  bladeShape.bezierCurveTo(.65, .22, .41, .42, -.07, .38);
  const blade = mesh('curved-rusted-blade', new THREE.ExtrudeGeometry(bladeShape, { depth: .018, bevelEnabled: false, curveSegments: 10 }),
    bladeMaterial, world.sickle, 0, 0, -.009);
  blade.userData.weapon = true;
  tube('chipped-cutting-edge', [[-.055, .395, .012], [.30, .40, .012], [.57, .265, .012], [.72, -.17, .012]], .008,
    edgeMaterial, world.sickle);

  world.creatureDetails = { skin, skinMap, maps, textureStatus, materials: { skin, tendon, fold, shroud, binding, handle: handleMaterial, blade: bladeMaterial, edge: edgeMaterial }, ocular, iris, pupil, jaw, upperLid, lowerLid, throat, fingers };
  return world.creature;
}

/** Local soft tissue only: never overwrites navigation, turning or the limb gait. */
export function updateCreatureDetails(world, { time = 0, dt = .016, scope = null,
  attackPhase = '', attackProgress = 0, repelled = false, enemyVisual = {}, active = false } = {}) {
  const d = world.creatureDetails;
  if (!d) return;
  const t = Number.isFinite(time) ? time : 0;
  const p = clamp(Number.isFinite(attackProgress) ? attackProgress : 0);
  const hunting = enemyVisual?.mode === 'hunt';
  const gasp = attackPhase === 'windup' ? p * .50 : attackPhase === 'strike' ? .55 : attackPhase === 'stunned' || repelled ? .68 : 0;
  const revealed = scope?.phase === 2 ? clamp((scope.progress - .3) / .7) : 0;
  const breath = .045 + (Math.sin(t * (hunting ? 5.4 : 2.05)) + 1) * .027;
  const targetJaw = breath + gasp + revealed * .20;
  const smoothing = 1 - Math.exp(-Math.max(0, Math.min(.1, dt)) * 9);
  d.jaw.rotation.x += (targetJaw - d.jaw.rotation.x) * smoothing;
  d.jaw.rotation.z = -.16 + Math.sin(t * 1.7) * .025 + gasp * .12;
  d.jaw.position.x = .026 + Math.sin(t * .91) * .006;
  // A rare, slow squeeze is held open during the telescope recognition beat.
  const phase = ((t + 2.3) % 9.7), blink = !scope && phase < .42 ? Math.sin(phase / .42 * Math.PI) * .86 : 0;
  d.ocular.scale.y = 1 - blink * .77;
  d.upperLid.position.y = .115 - blink * .13;
  d.lowerLid.position.y = .115 + blink * .07;
  d.upperLid.scale.y = 1 - blink * .62;
  d.lowerLid.scale.y = 1 - blink * .32;
  const look = clamp(Number(enemyVisual?.headYaw) || 0, -.7, .7);
  d.iris.position.x = -.005 - look * .018;
  d.pupil.position.x = d.iris.position.x;
  d.iris.position.y = d.pupil.position.y = -.006 + Math.sin(t * .43) * .005;
  d.pupil.scale.x = .013 * (1 + (active ? .1 : 0) + gasp * .35);
  d.throat.scale.y = .1 * (1 + Math.sin(t * 2.05) * .07 + gasp * .22);
}
