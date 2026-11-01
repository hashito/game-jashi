/* game-kit 6e0b6f0: js/motion.js — edit in game-kit and run tools/kit-sync.js */
// Motion for people: poses, crossfades, a speed-matched walk / run, two-bone leg IK, head look-at.
// Pure maths (no three.js import), so it runs in Node tests and is shared by the procedural
// character (js/character.js) and the glTF animator (js/gltf-character.js).
//
// A pose is a flat object of numbers (see REST). Legs are not stored as angles: a pose says where
// each foot is (z forward / y up from the floor under the root, plus the sole's pitch) and where the
// hips are, and solveLegs() turns that into hip / knee / ankle angles. So feet stay planted while
// the hips sway, during crossfades between standing poses, and in the stance half of the walk.
//
// Conventions (same as js/person.js): the character faces +z, its left side is +x.
//   hip.rotation.x  = -forward swing of the thigh      knee.rotation.x  = +bend (shin goes back)
//   shoulder x      = -forward raise of the arm        elbow x          = -bend (forearm comes forward)
//   shoulder "abd"  = arm away from the body (the rig mirrors it for the right arm)
//   head / neck / chest x = +nod down, y = +turn to the character's left

export const STATES = ['idle', 'walk', 'run', 'sit', 'talk', 'lookAround', 'scared', 'crouch'];
export const TRANSITIONS = ['sitDown', 'standUp'];

// default body (metres): thigh = hip joint to knee, shin = knee to ankle, ankleH = ankle above sole
export const BODY = { thigh: 0.44, shin: 0.43, ankleH: 0.07, hipW: 0.085, hipH: 0.92, thighR: 0.075 };
// a seated person stands up to (and sits down from) this far in front of the chair's origin
export const SIT_STAND_Z = 0.34;

export const REST = {
  hipsX: 0, hipsY: 0.92, hipsZ: 0, hipsYaw: 0,
  waistX: 0, waistY: 0, waistZ: 0,
  chestX: 0, chestY: 0, chestZ: 0, breath: 0,
  neckX: 0, neckY: 0, headX: 0, headY: 0, headZ: 0,
  shLx: 0, shLabd: 0.08, shLy: 0, elL: -0.12, wrL: 0,
  shRx: 0, shRabd: 0.08, shRy: 0, elR: -0.12, wrR: 0,
  footLx: 0, footLy: 0, footLz: 0, footLpitch: 0,
  footRx: 0, footRy: 0, footRz: 0, footRpitch: 0,
  mouth: 0, tremble: 0,
};
const KEYS = Object.keys(REST);

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const ease = (t) => smoothstep(0, 1, t);
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
// cheap smooth noise in -1..1 (sum of incommensurate sines), for tremble and fidgets
export const wobble = (t, seed = 0) => (Math.sin(t * 1.7 + seed) * 0.5 + Math.sin(t * 2.9 + seed * 2.1) * 0.3 + Math.sin(t * 5.3 + seed * 0.7) * 0.2);

export function blendPoses(a, b, w, out = {}) {
  for (const k of KEYS) out[k] = (a[k] ?? REST[k]) + ((b[k] ?? REST[k]) - (a[k] ?? REST[k])) * w;
  return out;
}

// ---- two-bone IK in the leg's plane ---------------------------------------------------------
// Target (z forward, y up) relative to the hip joint. Returns the thigh's forward angle from
// straight down (theta), the knee bend (>= 0) and whether the target was out of reach.
export function ik2(L1, L2, z, y) {
  const d0 = Math.hypot(z, y);
  const max = (L1 + L2) * 0.9995;
  const min = Math.abs(L1 - L2) + 1e-4;
  const d = clamp(d0, min, max);
  const alpha = Math.atan2(z, -y); // target direction, forward from straight down
  const A = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
  const K = Math.acos(clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1));
  return { theta: alpha + A, bend: Math.PI - K, reached: d0 <= max + 1e-9 && d0 >= min };
}
// forward kinematics of the same chain: where the ankle ends up
export function fk2(L1, L2, theta, bend) {
  const s = theta - bend;
  return { z: L1 * Math.sin(theta) + L2 * Math.sin(s), y: -L1 * Math.cos(theta) - L2 * Math.cos(s) };
}

// Pose -> joint angles for both legs. body: BODY-like. Returns { L: {hipX, hipZ, knee, ankle}, R: ... }.
// The sole pitch is kept as asked (0 = flat on the floor) whatever the leg does.
export function solveLegs(pose, body = BODY) {
  const out = {};
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? 1 : -1;
    const fx = pose[`foot${side}x`];
    const fz = pose[`foot${side}z`] - pose.hipsZ;
    const fy = pose[`foot${side}y`] + body.ankleH - pose.hipsY;
    // sideways: the foot is fx outward of where the hip joint stands at rest; the hips' sway (hipsX)
    // moves the joint. Roll the leg (rotation.z, world sign) so it lands there (small-angle split).
    const dx = sx * fx - pose.hipsX;
    const hipZ = Math.atan2(dx, -fy);
    const yPlane = -Math.hypot(fy, dx);
    const { theta, bend } = ik2(body.thigh, body.shin, fz, yPlane);
    const hipX = -theta;
    out[side] = { hipX, hipZ, knee: bend, ankle: -(hipX + bend) + pose[`foot${side}pitch`] };
  }
  return out;
}

// ---- gait -----------------------------------------------------------------------------------
// Stride S = distance the body travels in one full cycle (two steps). A foot is on the ground for
// the fraction `stance` of the cycle and moves back under the body at exactly the body's speed, so
// it does not slide: its sweep is stance * S, centred under the hip.
export function gaitParams(speed, body = BODY) {
  const v = Math.abs(speed);
  const leg = body.thigh + body.shin;
  const run = smoothstep(1.9, 2.9, v);
  const stride = clamp(leg * (0.85 + 0.45 * v), leg * 0.5, leg * 2.9);
  const stance = lerp(0.6, 0.36, run);
  const half = (stance * stride) / 2;
  const k = Math.min(1, v / 1.2);
  const g = {
    v, run, stride, stance, half, cadence: v / stride, ah: body.ankleH,
    lift: lerp(0.06, 0.15, run) * Math.min(1, v / 0.6 + 0.2),
    strike: lerp(-0.32, -0.06, run) * k, // toes up when the heel lands (a runner lands mid-foot)
    push: lerp(0.5, 0.75, run) * k, // heel up before the toes leave
    hipY: body.hipH,
  };
  // the hips as high as the leg allows over the whole stance (the heel / toe roll lets it reach)
  const reach = leg * 0.993;
  for (let i = 0; i <= 16; i++) {
    const a = stanceAnkle(i / 16, g);
    g.hipY = Math.min(g.hipY, a.y + body.ankleH + Math.sqrt(Math.max(0, reach * reach - a.z * a.z)));
  }
  g.hipY -= run * 0.03;
  return g;
}

// Stance s in 0..1: the ground under the foot moves back from +half to -half (relative to the hip)
// at exactly the body's speed. Heel strike: the foot rolls about the heel (toes come down); flat;
// heel off: it rolls about the ball of the foot (heel comes up). The pivot touching the ground never
// moves, so nothing slides. Returns the ankle (z, y above its rest height), the sole's pitch
// (+ = toes down), and which point holds the ground.
const HEEL = -0.06;
const BALL = 0.12;
const H_END = 0.15;
const T_START = 0.55;
function rollAbout(cz, off, p, ah) {
  // ankle = ground pivot - R(p) * (pivot offset from the ankle); offsets (z, y) = (off, -ah)
  const zz = -ah * Math.sin(p) + off * Math.cos(p);
  const yy = -ah * Math.cos(p) - off * Math.sin(p);
  return { z: cz + off - zz, y: -yy - ah };
}
function stanceAnkle(s, g) {
  const cz = lerp(g.half, -g.half, s);
  if (s < H_END && g.strike) {
    const p = g.strike * (1 - s / H_END);
    return { ...rollAbout(cz, HEEL, p, g.ah), pitch: p, pivot: 'heel', contact: cz + HEEL };
  }
  if (s > T_START && g.push) {
    const u = (s - T_START) / (1 - T_START);
    const p = g.push * u * u;
    return { ...rollAbout(cz, BALL, p, g.ah), pitch: p, pivot: 'ball', contact: cz + BALL };
  }
  return { z: cz, y: 0, pitch: 0, pivot: 'flat', contact: cz };
}

// phase in 0..1 for one foot -> its ankle relative to the root's floor point (y above rest height)
export function footOnPath(phase, g) {
  const p = ((phase % 1) + 1) % 1;
  if (p < g.stance) return { ...stanceAnkle(p / g.stance, g), grounded: true };
  // swing: from where the toes left to where the heel lands, lifted, the sole turning back
  const s = (p - g.stance) / (1 - g.stance);
  const a = stanceAnkle(1, g);
  const b = stanceAnkle(0, g);
  const e = ease(s);
  return { z: lerp(a.z, b.z, e), y: lerp(a.y, b.y, e) + g.lift * Math.sin(Math.PI * s), grounded: false, pitch: lerp(a.pitch, b.pitch, e) + Math.sin(Math.PI * s) * 0.25 * Math.min(1, g.v), pivot: null };
}

// ---- head look-at ---------------------------------------------------------------------------
// yaw / pitch (radians, character space) of a target -> how much chest, neck and head each turn.
// Clamped to what a neck can do; the chest only helps past ~45 degrees.
export const LOOK_LIMIT = { yaw: 1.35, up: 0.5, down: 0.6 };
export function splitLook(yaw, pitch, lim = LOOK_LIMIT) {
  const y = clamp(wrapAngle(yaw), -lim.yaw, lim.yaw);
  const p = clamp(pitch, -lim.up, lim.down);
  const extra = Math.sign(y) * Math.max(0, Math.abs(y) - 0.8);
  const chestY = extra * 0.6 + y * 0.08;
  const neckY = (y - chestY) * 0.4;
  return { chestY, neckY, headY: y - chestY - neckY, neckX: p * 0.4, headX: p * 0.6 };
}
// target position relative to the character's eyes (character space, +z forward) -> yaw, pitch
export function lookAngles(dx, dy, dz) {
  return { yaw: Math.atan2(dx, dz), pitch: -Math.atan2(dy, Math.hypot(dx, dz)) };
}
// a target behind the shoulder is not tracked (the head returns to the front instead)
export const canTrack = (yaw, lim = LOOK_LIMIT) => Math.abs(wrapAngle(yaw)) <= lim.yaw + 0.35;

// exponential approach that does not depend on the frame rate
export const damp = (cur, target, rate, dt) => target + (cur - target) * Math.exp(-rate * dt);

// ---- seated pose ----------------------------------------------------------------------------
// The thighs rest on a seat whose top is at seatH; hips a little behind the seat centre; soles flat
// on the floor in front. Matches js/props.js chairs (SEAT_H) and js/person.js.
export function seatPose(seatH, body = BODY) {
  const hipsY = seatH + body.thighR + 0.02;
  const hipsZ = -0.05;
  // thighs nearly level; tipped down a little when the shins are too short for the seat
  const fit = (hipsY - body.ankleH - body.shin * 0.985) / body.thigh;
  const THIGH = clamp(Math.acos(clamp(fit, -1, 1)), 1.15, 1.45);
  const kneeZ = hipsZ + body.thigh * Math.sin(THIGH);
  const kneeY = hipsY - body.thigh * Math.cos(THIGH);
  const drop = clamp((kneeY - body.ankleH) / body.shin, -1, 1);
  const psi = Math.acos(drop); // shin tipped forward from vertical
  // a seat too high for the legs (a bar stool): the feet hang
  return { hipsY, hipsZ, thigh: THIGH, footZ: kneeZ + body.shin * Math.sin(psi), footY: Math.max(0, kneeY - body.shin - body.ankleH) };
}

// ---- poses per state ------------------------------------------------------------------------
// ctx: { t (seconds), body, seatH, gait (gaitParams), phase (gait phase), mood (0..1), seed,
//        progress (0..1 for transitions) }
function standBase(p, ctx) {
  const b = ctx.body;
  p.hipsY = b.hipH - 0.005;
  p.footLx = 0.01;
  p.footRx = 0.01;
  p.footLz = 0.02;
  p.footRz = -0.01;
  return p;
}

const POSES = {
  idle(ctx) {
    const p = standBase({ ...REST }, ctx);
    const t = ctx.t;
    const f = ctx.mood || 0;
    // weight shift from foot to foot, the feet stay where they are
    const w = Math.sin(t * (0.35 + f * 0.9) + ctx.seed);
    p.hipsX = w * (0.018 + f * 0.008);
    p.hipsY -= Math.abs(w) * 0.008;
    p.waistZ = -w * 0.025;
    p.chestZ = w * 0.015;
    p.breath = Math.sin(t * (1.6 + f * 1.4));
    p.headX = 0.04 + Math.sin(t * 0.23 + ctx.seed) * 0.04;
    p.headY = Math.sin(t * 0.17 + ctx.seed * 3) * 0.12;
    p.shLabd = p.shRabd = 0.09;
    p.elL = -0.14 - Math.sin(t * 0.5) * 0.03;
    p.elR = -0.14 - Math.sin(t * 0.5 + 1) * 0.03;
    // agitated: the foot taps
    if (f > 0.05) p.footLpitch = -Math.max(0, Math.sin(t * 7)) * 0.25 * f;
    return p;
  },
  move(ctx) {
    const g = ctx.gait;
    const p = { ...REST };
    const dir = ctx.reverse ? -1 : 1;
    const L = footOnPath(ctx.phase, g);
    const R = footOnPath(ctx.phase + 0.5, g);
    p.footLz = L.z * dir;
    p.footLy = L.y;
    p.footLpitch = L.pitch * dir;
    p.footRz = R.z * dir;
    p.footRy = R.y;
    p.footRpitch = R.pitch * dir;
    p.footLx = p.footRx = lerp(0.005, -0.02, g.run);
    const step = Math.cos(ctx.phase * Math.PI * 4); // twice per cycle
    // hips: lowest when a foot lands; sway over the stance foot; pelvis twists with the legs
    p.hipsY = g.hipY - lerp(0.012, 0.035, g.run) * (0.5 + 0.5 * step);
    p.hipsX = Math.sin(ctx.phase * Math.PI * 2) * lerp(0.02, 0.008, g.run);
    p.hipsYaw = -Math.sin(ctx.phase * Math.PI * 2) * lerp(0.08, 0.12, g.run) * Math.min(1, g.v);
    p.waistX = lerp(0.03, 0.16, g.run) * Math.min(1, g.v);
    p.waistY = -p.hipsYaw * 0.9; // the shoulders counter-rotate
    p.chestX = 0.02;
    p.breath = Math.sin(ctx.t * lerp(2, 4.5, g.run));
    p.headX = -p.waistX * 0.7;
    // arms swing against the legs; elbows bend more when running
    const swing = Math.sin(ctx.phase * Math.PI * 2) * lerp(0.32, 0.7, g.run) * Math.min(1, g.v / 1.2 + 0.1);
    p.shLx = swing * dir - lerp(0, 0.15, g.run);
    p.shRx = -swing * dir - lerp(0, 0.15, g.run);
    p.shLabd = p.shRabd = lerp(0.1, 0.2, g.run);
    p.elL = -lerp(0.25, 1.45, g.run) - Math.max(0, -swing) * 0.3;
    p.elR = -lerp(0.25, 1.45, g.run) - Math.max(0, swing) * 0.3;
    return p;
  },
  sit(ctx) {
    const p = { ...REST };
    const s = seatPose(ctx.seatH, ctx.body);
    const t = ctx.t;
    const f = ctx.mood || 0;
    p.hipsY = s.hipsY;
    p.hipsZ = s.hipsZ;
    p.footLz = p.footRz = s.footZ;
    p.footLy = p.footRy = s.footY;
    p.footLx = 0.02;
    p.footRx = 0.02;
    p.waistX = 0.1 + f * 0.1;
    p.chestX = 0.04;
    p.breath = Math.sin(t * (1.6 + f * 1.4));
    // eyes down, now and then a glance up; anxious: the head sinks, hands rub, a knee bounces
    p.headX = 0.2 + f * 0.18 - Math.max(0, Math.sin(t * 0.21 + ctx.seed)) * 0.3 * (1 - f * 0.6);
    p.headY = Math.sin(t * (0.13 + f * 0.5) + ctx.seed) * (0.14 + f * 0.1);
    p.shLx = p.shRx = -0.5;
    p.shLabd = p.shRabd = 0.12;
    p.elL = -0.95 + Math.sin(t * (2.1 + f * 7) + 1.3) * f * 0.09;
    p.elR = -0.95 + Math.sin(t * (2.3 + f * 7)) * (0.02 + f * 0.09);
    p.footRpitch = Math.max(0, Math.sin(t * 9)) * 0.22 * f; // the heel lifts (a bouncing knee)
    return p;
  },
  talk(ctx) {
    const p = POSES.idle({ ...ctx, mood: 0 });
    const t = ctx.t;
    // beats with the right hand, the left now and then; small nods on the stresses
    const beat = Math.max(0, Math.sin(t * 3.1 + ctx.seed));
    const open = 0.5 + 0.5 * Math.sin(t * 0.7 + ctx.seed);
    p.shRx = -0.35 - beat * 0.12;
    p.shRabd = 0.18;
    p.elR = -1.2 - beat * 0.25;
    p.wrR = open * 0.5;
    p.shLx = -0.15 * open;
    p.elL = -0.3 - open * 0.6;
    p.shLabd = 0.12;
    p.headX = 0.02 + Math.sin(t * 6.2) * 0.03 * beat;
    p.headY = Math.sin(t * 0.6 + ctx.seed) * 0.15;
    p.chestY = Math.sin(t * 0.6 + ctx.seed) * 0.05;
    p.mouth = 1;
    return p;
  },
  lookAround(ctx) {
    const p = POSES.idle({ ...ctx, mood: 0 });
    // hold, turn, hold: left, front, right, a glance back over the shoulder
    const seq = [0, 1.0, 1.0, 0.1, -1.05, -1.05, -0.2, 0.55];
    const T = 1.1;
    const k = ctx.t / T + ctx.seed;
    const i = Math.floor(k);
    const a = seq[((i % seq.length) + seq.length) % seq.length];
    const b = seq[(((i + 1) % seq.length) + seq.length) % seq.length];
    const yaw = lerp(a, b, ease(k - i));
    const look = splitLook(yaw, -0.08);
    p.chestY = look.chestY;
    p.neckY = look.neckY;
    p.headY = look.headY;
    p.headX = look.headX + look.neckX;
    p.waistY = yaw * 0.1;
    p.shLx = p.shRx = 0.05;
    return p;
  },
  scared(ctx) {
    const p = standBase({ ...REST }, ctx);
    const t = ctx.t;
    p.hipsY = ctx.body.hipH - 0.09;
    p.hipsZ = -0.05;
    p.footLx = p.footRx = 0.05;
    p.footLz = 0.09;
    p.footRz = -0.08;
    p.waistX = -0.05;
    p.chestX = 0.18; // hunched
    p.headX = 0.25;
    p.neckX = -0.15;
    p.breath = Math.sin(t * 5.5) * 1.6;
    // arms up in front of the face, trembling
    p.shLx = p.shRx = -0.85;
    p.shLabd = p.shRabd = -0.22;
    p.elL = p.elR = -2.15;
    p.tremble = 1;
    p.headY = wobble(t * 3, ctx.seed) * 0.08;
    return p;
  },
  crouch(ctx) {
    const p = { ...REST };
    const b = ctx.body;
    p.hipsY = b.hipH * 0.52;
    p.hipsZ = -0.12;
    p.footLz = 0.12;
    p.footRz = -0.06;
    p.footLx = p.footRx = 0.06;
    p.footRpitch = 0.35; // on the ball of the back foot
    p.waistX = 0.38;
    p.chestX = 0.1;
    p.headX = -0.38; // keep looking ahead
    p.neckX = -0.15;
    p.breath = Math.sin(ctx.t * 2.4);
    p.shLx = p.shRx = -0.75;
    p.shLabd = p.shRabd = 0.2;
    p.elL = p.elR = -0.7;
    p.headY = Math.sin(ctx.t * 0.4 + ctx.seed) * 0.25;
    return p;
  },
};

// standing in front of the chair <-> seated. progress 0..1; the standing end is SIT_STAND_Z in front.
function sitTransition(ctx, sittingDown) {
  const u = sittingDown ? ctx.progress : 1 - ctx.progress; // 0 standing .. 1 seated
  const stand = POSES.idle({ ...ctx, mood: 0 });
  stand.hipsZ = SIT_STAND_Z - 0.02;
  stand.footLz = SIT_STAND_Z + 0.02;
  stand.footRz = SIT_STAND_Z - 0.01;
  const seat = POSES.sit({ ...ctx, mood: 0 });
  const p = {};
  // feet go first (sitting) / last (standing); the hips follow a curve over the knees
  const feet = smoothstep(0, 0.45, u);
  const hips = smoothstep(0.15, 1, u);
  blendPoses(stand, seat, hips, p);
  for (const s of ['L', 'R']) {
    p[`foot${s}z`] = lerp(stand[`foot${s}z`], seat[`foot${s}z`], sittingDown ? feet : smoothstep(0.55, 1, u));
    p[`foot${s}y`] = 0;
    p[`foot${s}pitch`] = 0;
  }
  // lean forward over the knees in the middle of the move, hands push on the thighs
  const lean = Math.sin(Math.PI * clamp((u - 0.1) / 0.85, 0, 1));
  p.waistX += lean * 0.65;
  p.headX -= lean * 0.45;
  p.shLx = p.shRx = lerp(p.shLx, -0.75, lean);
  p.elL = p.elR = lerp(p.elL, -0.5, lean);
  return p;
}
export const TRANSITION_TIME = { sitDown: 1.25, standUp: 1.35 };

export function poseFor(state, ctx) {
  if (state === 'sitDown') return sitTransition(ctx, true);
  if (state === 'standUp') return sitTransition(ctx, false);
  const fn = POSES[state === 'walk' || state === 'run' ? 'move' : state] || POSES.idle;
  return fn(ctx);
}

// ---- state machine with crossfades ----------------------------------------------------------
// Drives one character. The rig calls update(dt, speed) each frame and applies .pose.
//   m.set('sit', { fade: 0.3 })     m.set('walk', { speed: 1.4 })   (speed for walking in place)
//   m.sitDown() / m.standUp()       timed transitions that end in 'sit' / 'idle'
// speed: the measured ground speed of the root (m/s, signed: negative = walking backwards). When a
// standing state moves faster than 0.15 m/s it walks (or runs) automatically, feet matched to speed.
export const DEFAULT_SPEED = { walk: 1.35, run: 3.6 };
export class Motion {
  constructor(opts = {}) {
    this.body = { ...BODY, ...(opts.body || {}) };
    this.seatH = opts.seatH ?? 0.47;
    this.seed = opts.seed ?? Math.random() * 10;
    this.state = opts.state || 'idle';
    this.t = 0;
    this.phase = 0;
    this.mood = 0;
    this.moodTarget = 0;
    this.speed = 0;
    this.stateSpeed = 0;
    this.pose = { ...REST };
    this.from = null;
    this.fadeT = 0;
    this.fadeDur = 0;
    this.progress = 0;
    this.onDone = null;
    this.locomoting = false;
    this.events = [];
    this.update(0, 0);
  }
  ctx(gaitSpeed) {
    return {
      t: this.t, body: this.body, seatH: this.seatH, seed: this.seed, mood: this.mood,
      gait: gaitParams(gaitSpeed, this.body), phase: this.phase, reverse: gaitSpeed < 0, progress: this.progress,
    };
  }
  // the state the body is actually in this frame (idle + moving -> walk)
  effective() {
    const standing = this.state === 'idle' || this.state === 'talk' || this.state === 'lookAround';
    if (standing && Math.abs(this.speed) > 0.15) return 'walk';
    return this.state;
  }
  set(state, o = {}) {
    if (o.speed !== undefined) this.stateSpeed = o.speed;
    else if (state === 'walk' || state === 'run') this.stateSpeed = DEFAULT_SPEED[state];
    if (state === this.state && !o.restart) return this;
    this.crossfade(o.fade ?? (state === 'scared' ? 0.15 : 0.3));
    this.state = state;
    this.progress = 0;
    this.lastEff = this.effective(); // already fading: update() must not start another fade
    return this;
  }
  crossfade(dur) {
    this.from = { ...this.pose };
    this.fadeT = 0;
    this.fadeDur = Math.max(1e-3, dur);
  }
  // The rig moves the root from in front of the chair onto the chair's origin when this starts
  // (event 'sitDown:start'); the pose being faded from is moved with it so nothing jumps.
  sitDown() {
    this.crossfade(0.2);
    for (const k of ['hipsZ', 'footLz', 'footRz']) this.from[k] += SIT_STAND_Z;
    this.events.push('sitDown:start');
    this.state = 'sitDown';
    this.progress = 0;
    return this;
  }
  standUp() {
    this.crossfade(0.15);
    this.state = 'standUp';
    this.progress = 0;
    return this;
  }
  update(dt, speed = 0) {
    this.t += dt;
    this.speed = speed;
    this.mood = damp(this.mood, this.moodTarget, 1.5, dt);
    let eff = this.effective();
    if (eff !== (this.lastEff || eff)) this.crossfade(eff === 'walk' || this.lastEff === 'walk' ? 0.22 : 0.3);
    this.lastEff = eff;
    if (this.state === 'sitDown' || this.state === 'standUp') {
      this.progress = Math.min(1, this.progress + dt / TRANSITION_TIME[this.state]);
      if (this.progress >= 1) {
        const done = this.state;
        this.state = done === 'sitDown' ? 'sit' : 'idle';
        this.events.push(done); // the rig moves the root forward after standUp
        eff = this.lastEff = this.state;
        if (done === 'standUp') this.from = null; // the root jumps, the pose restarts at rest offsets
      }
    }
    const explicit = eff === 'walk' || eff === 'run';
    let gs = 0;
    if (explicit) gs = Math.abs(speed) > 0.15 ? speed : this.stateSpeed || DEFAULT_SPEED[eff];
    const g = gaitParams(gs, this.body);
    if (g.v > 0) this.phase = (this.phase + (g.v * dt) / g.stride) % 1;
    const target = poseFor(eff, this.ctx(gs));
    if (this.from && this.fadeT < this.fadeDur) {
      this.fadeT += dt;
      blendPoses(this.from, target, ease(Math.min(1, this.fadeT / this.fadeDur)), this.pose);
    } else {
      this.from = null;
      Object.assign(this.pose, target);
    }
    return this.pose;
  }
}

// ---- glTF helpers ---------------------------------------------------------------------------
// Map our state names to the clip names a model happens to have (Quaternius UAL, KayKit, Mixamo
// exports, the 3d-models mannequin and Fox). The first matching pattern wins.
export const CLIP_ALIASES = {
  idle: [/^idle$/i, /idle(_loop)?$/i, /idle/i, /survey/i, /stand/i],
  walk: [/^walk$/i, /walk(_loop|_fwd)?/i, /walk/i],
  run: [/^run$/i, /jog|sprint|run/i],
  sit: [/sit(ting)?.?idle/i, /^sit/i, /sit/i],
  sitDown: [/sit.?down|stand.?to.?sit/i],
  standUp: [/stand.?up|sit.?to.?stand/i],
  talk: [/talk|convers|speak/i],
  lookAround: [/look.?around|survey|search/i],
  scared: [/scared|fear|cower|terrified/i],
  crouch: [/crouch(.?idle)?/i, /sneak/i],
  wave: [/wave/i],
  jump: [/jump/i],
};
export function resolveClips(names, aliases = CLIP_ALIASES) {
  const out = {};
  for (const [state, pats] of Object.entries(aliases)) {
    for (const re of pats) {
      const hit = names.find((n) => re.test(n));
      if (hit) {
        out[state] = hit;
        break;
      }
    }
  }
  return out;
}
// fallbacks when a model has no clip for a state
export const CLIP_FALLBACK = { lookAround: 'idle', talk: 'idle', scared: 'crouch', crouch: 'idle', sit: 'idle', sitDown: 'sit', standUp: 'idle', run: 'walk', walk: 'idle', wave: 'idle', jump: 'idle' };
export function clipFor(state, map) {
  const seen = new Set();
  let s = state;
  while (s && !map[s] && !seen.has(s)) {
    seen.add(s);
    s = CLIP_FALLBACK[s];
  }
  return map[s] || null;
}
// speed (m/s) -> weights of idle / walk / run and the playback rate of the moving clips, so the
// feet match the ground: rate = speed / the clip's own speed.
export function locomotion(speed, walkSpeed = DEFAULT_SPEED.walk, runSpeed = DEFAULT_SPEED.run) {
  const v = Math.abs(speed);
  const moving = smoothstep(0.05, 0.35, v);
  const r = smoothstep(walkSpeed * 1.25, runSpeed * 0.8, v);
  return {
    idle: 1 - moving,
    walk: moving * (1 - r),
    run: moving * r,
    walkRate: clamp(v / walkSpeed, 0.5, 2),
    runRate: clamp(v / runSpeed, 0.6, 1.6),
  };
}

// ---- crowds ---------------------------------------------------------------------------------
// How often a character far from the camera needs its animation updated, and which detail level
// to build it with. Distances in metres.
export function crowdLevel(distance) {
  if (distance < 6) return { detail: 2, every: 1 };
  if (distance < 14) return { detail: 1, every: 2 };
  if (distance < 30) return { detail: 0, every: 3 };
  return { detail: 0, every: 6 };
}
