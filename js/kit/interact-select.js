/* game-kit 6e0b6f0: js/interact-select.js — edit in game-kit and run tools/kit-sync.js */
// Selecting the thing you use (rule W18): pure maths, no three.js and no DOM, so it is unit-tested in Node and shared by every game.
// A small terminal / button / paper must be easy to pick with a crosshair on PC and with a thumb on a phone:
//   - the hit volume is the visible mesh bounds + a 15 cm margin (25 cm for things under 40 cm; never a hand-set tiny box)
//   - a cone assist: anything whose volume is within ~7 degrees of the look direction is selectable (more on a phone: the
//     cone grows so that its screen-space radius is at least 44 px)
//   - the reach is measured to the volume, >= 2.2 m
//   - hysteresis: the selection that is already shown is kept while it is still near the look direction (no flicker)
//   - tap-to-interact on touch: tapping a thing on the screen selects it (selectAtScreen)
//
//   import { selectInteractable, selectAtScreen, dirFromYawPitch, lockedLabel } from "./interact-select.js";
//   const sel = selectInteractable({ eye: [x, y, z], dir: dirFromYawPitch(yaw, pitch), candidates, touch, viewH, fovDeg, prev });
//   // candidates: [{ id, min: [x,y,z], max: [x,y,z], reach?, tag? }]   (min/max = the mesh bounds of what the player SEES)
//   // -> null | { id, dist, angle, via: "ray" | "cone" | "screen", cand }
//   blocked(cand, dist, point) (optional): true when a wall hides it (the game's own line of sight)

export const SELECT = Object.freeze({
  reach: 2.4, // m from the eye to the hit volume (>= 2.2)
  margin: 0.15, // m added around the visible bounds
  coneDeg: 7, // look-direction assist (6-8)
  minPx: 44, // radius of the selectable disc on a touch screen, in CSS px
  hysteresis: 1.35, // the shown selection stays while within cone*1.35 / reach+0.25
});

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// three.js camera convention: yaw about +y, forward = (-sin yaw cos p, sin p, -cos yaw cos p)
export function dirFromYawPitch(yaw, pitch) {
  const c = Math.cos(pitch);
  return [-Math.sin(yaw) * c, Math.sin(pitch), -Math.cos(yaw) * c];
}

export function expandBox(min, max, m) {
  return { min: [min[0] - m, min[1] - m, min[2] - m], max: [max[0] + m, max[1] + m, max[2] + m] };
}

// the hit volume of a candidate: its visible bounds + margin
// margin: 15 cm, growing to 25 cm for things smaller than 40 cm (a sheet of paper, a key, a card: tiny to aim at)
export function marginFor(cand, margin = SELECT.margin) {
  const m = Math.max(cand.max[0] - cand.min[0], cand.max[1] - cand.min[1], cand.max[2] - cand.min[2]);
  return cand.margin ?? Math.min(margin + 0.1, margin + Math.max(0, 0.4 - m) * 0.3);
}
export function hitVolume(cand, margin = SELECT.margin) {
  return expandBox(cand.min, cand.max, marginFor(cand, margin));
}

export function closestOnBox(p, b) {
  return [clamp(p[0], b.min[0], b.max[0]), clamp(p[1], b.min[1], b.max[1]), clamp(p[2], b.min[2], b.max[2])];
}

// slab test: distance along the ray (unit dir) to the box, or null
export function rayBox(o, d, b, far = Infinity) {
  let t0 = 0, t1 = far;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) { if (o[i] < b.min[i] || o[i] > b.max[i]) return null; continue; }
    let a = (b.min[i] - o[i]) / d[i], c = (b.max[i] - o[i]) / d[i];
    if (a > c) [a, c] = [c, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, c);
    if (t0 > t1) return null;
  }
  return t0;
}

// focal length in px for a vertical field of view over a view of viewH px
export const focalPx = (viewH, fovDeg) => viewH / 2 / Math.tan((fovDeg * Math.PI) / 360);
// the angle (rad) that a disc of `px` radius on the screen covers around the view centre
export const pxToRad = (px, viewH, fovDeg) => Math.atan(px / focalPx(viewH, fovDeg));
// the angular tolerance: coneDeg on PC; on touch also at least minPx on the screen
export function coneRad({ touch = false, viewH = 720, fovDeg = 70, coneDeg = SELECT.coneDeg, minPx = SELECT.minPx } = {}) {
  const base = (coneDeg * Math.PI) / 180;
  return touch ? Math.max(base, pxToRad(minPx, viewH, fovDeg)) : base;
}

// smallest angle (rad) between the look ray and any point of the box that lies within `reach` along the ray
function angleToBox(eye, dir, b, reach) {
  let best = Infinity;
  for (let i = 1; i <= 24; i++) {
    const s = (reach * i) / 24;
    const p = [eye[0] + dir[0] * s, eye[1] + dir[1] * s, eye[2] + dir[2] * s];
    const q = closestOnBox(p, b);
    const off = len(sub(p, q));
    best = Math.min(best, Math.atan2(off, s));
    if (off === 0) return 0;
  }
  // the box can also be beside / behind the first samples: use the direction to its closest point
  const q = closestOnBox(eye, b);
  const v = sub(q, eye);
  const l = len(v);
  if (l > 1e-6) best = Math.min(best, Math.acos(clamp(dot(norm(v), dir), -1, 1)));
  return best;
}

// evaluate one candidate: null when out of reach / blocked / outside the cone
function evalCand(c, eye, dir, o, tol, wide) {
  const vol = hitVolume(c, o.margin);
  const q = closestOnBox(eye, vol);
  const dist = len(sub(q, eye));
  const reach = (c.reach ?? o.reach) + (wide ? 0.25 : 0);
  if (dist > reach) return null;
  const t = rayBox(eye, dir, vol, reach + 0.01);
  let via = "ray", angle = 0;
  if (t == null) {
    angle = angleToBox(eye, dir, vol, reach);
    if (angle > tol * (wide ? o.hysteresis : 1)) return null;
    via = "cone";
  }
  const d = t != null ? t : dist;
  if (o.blocked && o.blocked(c, d, q)) return null;
  const cc = [(vol.min[0] + vol.max[0]) / 2, (vol.min[1] + vol.max[1]) / 2, (vol.min[2] + vol.max[2]) / 2];
  const centre = Math.acos(clamp(dot(norm(sub(cc, eye)), dir), -1, 1));
  return { id: c.id, dist: d, angle, via, cand: c, norm: tol ? angle / tol : 0, centre };
}

// the selection for a look direction (PC crosshair, or the phone's centre). prev = id shown last frame (hysteresis)
export function selectInteractable(args) {
  const { eye, dir, candidates, prev = null, touch = false, viewH = 720, fovDeg = 70 } = args;
  const o = { ...SELECT, ...(args.opts || {}), blocked: args.blocked };
  const tol = coneRad({ touch, viewH, fovDeg, coneDeg: o.coneDeg, minPx: o.minPx });
  const d = norm(dir);
  let best = null, bestScore = Infinity;
  for (const c of candidates) {
    const e = evalCand(c, eye, d, o, tol, c.id === prev);
    if (!e) continue;
    // direct hits first (nearest wins), then the cone ones (nearest to the look direction, then nearer)
    // (among direct hits the one looked at nearest its centre wins, then the nearer: a big shelf does not hide the small terminal in front of it)
    let score = e.via === "ray" ? e.dist * 0.3 + Math.min(1.5, e.centre / (tol * 3)) : 2.5 + e.norm * 2 + e.dist * 0.3;
    if (c.id === prev) score *= 0.6; // hysteresis
    if (score < bestScore) { bestScore = score; best = e; }
  }
  return best;
}

// a direction through a screen point (x, y in CSS px of a w x h view); basis = { fwd, right, up } unit vectors of the camera
export function dirFromScreen(x, y, w, h, fovDeg, basis) {
  const f = focalPx(h, fovDeg);
  const nx = (x - w / 2) / f, ny = -(y - h / 2) / f;
  return norm([basis.fwd[0] + basis.right[0] * nx + basis.up[0] * ny, basis.fwd[1] + basis.right[1] * nx + basis.up[1] * ny, basis.fwd[2] + basis.right[2] * nx + basis.up[2] * ny]);
}

// the camera basis from yaw / pitch (right = (cos yaw, 0, -sin yaw))
export function basisFromYawPitch(yaw, pitch) {
  const fwd = dirFromYawPitch(yaw, pitch);
  const right = [Math.cos(yaw), 0, -Math.sin(yaw)];
  const up = [right[1] * fwd[2] - right[2] * fwd[1], right[2] * fwd[0] - right[0] * fwd[2], right[0] * fwd[1] - right[1] * fwd[0]];
  // (right x fwd) points down for this convention: flip so up is +y-ish
  return { fwd, right, up: up[1] < 0 ? [-up[0], -up[1], -up[2]] : up };
}

// tap-to-interact: the thing under a finger (the touch radius is minPx), or null
export function selectAtScreen({ x, y, w, h, fovDeg = 70, eye, basis, candidates, blocked, opts }) {
  const dir = dirFromScreen(x, y, w, h, fovDeg, basis);
  const r = selectInteractable({ eye, dir, candidates, touch: true, viewH: h, fovDeg, blocked, opts });
  return r ? { ...r, via: "screen" } : null;
}

// how many px wide (min of w / h) the selectable region of a box is on the screen at `dist` m, for the checks (W18: >= 44 px at 1.5 m)
export function screenSizePx(cand, dist, viewH, fovDeg, margin = SELECT.margin) {
  const f = focalPx(viewH, fovDeg);
  const v = hitVolume(cand, margin);
  const size = [v.max[0] - v.min[0], v.max[1] - v.min[1], v.max[2] - v.min[2]];
  const horiz = Math.max(size[0], size[2]);
  return Math.min((horiz / dist) * f, (size[1] / dist) * f);
}

// the prompt label of a shut thing says so (rule W19 / W18): "ドア（施錠中）", "階段（点検中）"
export function lockedLabel(name, reason = "施錠中") {
  return `${name}（${reason}）`;
}
// def: { name, locked?: bool, lockedReason?, label? }  -> the label shown in the [E] prompt
export function interactLabel(def, locked = !!def.locked) {
  const base = def.label || def.name || "";
  return locked ? lockedLabel(def.name || base, def.lockedReason || "施錠中") : base;
}

// state for tests and the debug hooks (docs/testing.md: window.__gf.select)
export function exposeGf(api) {
  if (typeof window === "undefined") return api;
  const gf = (window.__gf = window.__gf || {});
  gf.select = api;
  return api;
}
