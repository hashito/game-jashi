/* game-kit 6e0b6f0: js/prop-mats.js — edit in game-kit and run tools/kit-sync.js */
// Shared PBR materials for props and furniture: one cached MeshStandardMaterial per (kind, colour,
// options), each with a small procedural texture set drawn on a canvas at start (colour detail, normal
// and roughness), so no image files are needed and nothing adds a licence line. Generated photos
// (tools/examples/props_textures.json -> assets/media/tex_prop_*.jpg) replace the drawn detail in place.
//
//   import { pm, trimUV, setPropQuality, preferPropTextures } from "./prop-mats.js";
//   setPropQuality({ size: 256, normals: true, anisotropy: renderer.capabilities.getMaxAnisotropy() });
//   const steel = pm("paint", 0x6a7a70);          // painted steel in that colour
//   const oak = pm("wood", 0x8a6440, { uv: 0.6 });  // uv = metres per repeat (bevelBox/metricUV UVs)
//   await loadMedia(); preferPropTextures();        // optional: swap in the generated photos
//
// Kinds: paint, steel (brushed), chrome, wood, plywood, cardboard, plastic, rubber, fabric, concrete,
// rust, glass, glow (emissive), screen, trim (the trim sheet: vents, perforation, hazard stripes, ribbed
// rubber, tread plate, mesh grille, seams; map a part's UVs onto one strip with trimUV()).
// The colour textures are near white detail (mean about 0.85) multiplied by the material colour, so a
// game's colour choices keep working; data textures (normal, roughness) stay in linear colour space.
import * as THREE from "three";
import { media } from "./media.js";

const Q = { size: 256, normals: true, anisotropy: 4, normalScale: 1 };
export function setPropQuality(o = {}) {
  Object.assign(Q, o);
  for (const set of TEX.values()) for (const t of Object.values(set)) if (t) t.anisotropy = Q.anisotropy;
  for (const m of MATS.values()) {
    if (!Q.normals && m.normalMap) {
      m.normalMap = null;
      m.needsUpdate = true;
    }
  }
}

// ---------------------------------------------------------------------------------------------- noise
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// tileable value noise: `cells` grid points per side, bilinear with smoothstep, wraps at the edge
function valueNoise(size, cells, seed) {
  const r = rng(seed);
  const grid = new Float32Array(cells * cells).map(() => r());
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const gy = (y / size) * cells;
    const y0 = Math.floor(gy);
    let ty = gy - y0;
    ty = ty * ty * (3 - 2 * ty);
    const y1 = (y0 + 1) % cells;
    for (let x = 0; x < size; x++) {
      const gx = (x / size) * cells;
      const x0 = Math.floor(gx);
      let tx = gx - x0;
      tx = tx * tx * (3 - 2 * tx);
      const x1 = (x0 + 1) % cells;
      const a = grid[y0 * cells + x0] + (grid[y0 * cells + x1] - grid[y0 * cells + x0]) * tx;
      const b = grid[y1 * cells + x0] + (grid[y1 * cells + x1] - grid[y1 * cells + x0]) * tx;
      out[y * size + x] = a + (b - a) * ty;
    }
  }
  return out;
}
function fbm(size, base, oct, seed) {
  const out = new Float32Array(size * size);
  let amp = 1;
  let sum = 0;
  for (let o = 0; o < oct; o++) {
    const n = valueNoise(size, base << o, seed + o * 101);
    for (let i = 0; i < out.length; i++) out[i] += n[i] * amp;
    sum += amp;
    amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= sum;
  return out;
}

// Each recipe returns { alb: [r, g, b] per pixel in 0..1 (multiplied by the material colour),
// h: height 0..1 (-> normal map), rough: 0..1 multiplier }. All are tileable.
const RECIPES = {
  paint(S) {
    const peel = fbm(S, 16, 3, 11);
    const blot = fbm(S, 3, 3, 12);
    const r = rng(13);
    const scratch = new Float32Array(S * S);
    for (let k = 0; k < S / 6; k++) {
      let x = r() * S;
      let y = r() * S;
      const a = r() * Math.PI;
      const len = 4 + r() * S * 0.12;
      for (let s = 0; s < len; s++) scratch[(Math.floor(y + Math.sin(a) * s + S) % S) * S + (Math.floor(x + Math.cos(a) * s + S) % S)] = 1;
    }
    return (i) => {
      const v = 0.86 + (blot[i] - 0.5) * 0.12 + (peel[i] - 0.5) * 0.04 + scratch[i] * 0.1;
      return [v, v, v, peel[i] * 0.5 - scratch[i] * 0.3, 0.85 + (blot[i] - 0.5) * 0.4 - scratch[i] * 0.3];
    };
  },
  steel(S) {
    const r = rng(21);
    const rows = new Float32Array(S).map(() => r());
    const blot = fbm(S, 4, 3, 22);
    return (i) => {
      const y = Math.floor(i / S);
      const x = i % S;
      const streak = rows[y] * 0.6 + rows[(y + 1) % S] * 0.4 + Math.sin((x / S) * Math.PI * 2 * 3 + rows[y] * 6) * 0.05;
      const v = 0.82 + (streak - 0.5) * 0.12 + (blot[i] - 0.5) * 0.08;
      return [v, v, v * 1.01, streak * 0.25, 0.75 + (blot[i] - 0.5) * 0.5];
    };
  },
  chrome(S) {
    const blot = fbm(S, 4, 2, 31);
    return (i) => [0.95, 0.95, 0.95, 0, 0.6 + blot[i] * 0.8];
  },
  wood(S, seed = 41) {
    const warp = fbm(S, 4, 3, seed);
    const fine = fbm(S, 32, 2, seed + 1);
    const r = rng(seed + 2);
    const nPlanks = 4;
    const plankTone = Array.from({ length: nPlanks }, () => 0.9 + (r() - 0.5) * 0.12);
    return (i) => {
      const y = Math.floor(i / S);
      const x = i % S;
      const plank = Math.floor((y / S) * nPlanks);
      const yy = (y / S) * nPlanks * 6 + warp[i] * 3 + Math.sin((x / S) * Math.PI * 2) * 0.3;
      const ring = Math.pow(Math.abs(Math.sin(yy * Math.PI)), 6);
      const seam = (y * nPlanks) % S < 1.5 ? 1 : 0;
      // veneer: the planks differ a little in tone but have no gaps (furniture, doors, crates)
      const t = plankTone[plank] - ring * 0.14 - (fine[i] - 0.5) * 0.06 - seam * 0.04;
      return [t, t * 0.92, t * 0.84, 0.5 - ring * 0.25 + fine[i] * 0.1, 0.9 + ring * 0.2];
    };
  },
  plywood(S) {
    const w = RECIPES.wood(S, 51);
    return (i) => {
      const [a, b, c, h, ro] = w(i);
      return [0.5 + a * 0.45, 0.48 + b * 0.45, 0.45 + c * 0.45, h * 0.5, ro];
    };
  },
  cardboard(S) {
    const fib = fbm(S, 64, 1, 61);
    const blot = fbm(S, 4, 3, 62);
    return (i) => {
      const y = Math.floor(i / S);
      const corr = Math.sin((y / S) * Math.PI * 2 * 24) * 0.5 + 0.5;
      const v = 0.86 + (blot[i] - 0.5) * 0.14 + (fib[i] - 0.5) * 0.08 - corr * 0.03;
      return [v, v * 0.97, v * 0.92, corr * 0.3 + fib[i] * 0.2, 1];
    };
  },
  plastic(S) {
    const st = fbm(S, 64, 2, 71);
    const blot = fbm(S, 4, 2, 72);
    return (i) => {
      const v = 0.88 + (blot[i] - 0.5) * 0.06;
      return [v, v, v, st[i] * 0.6, 0.85 + (st[i] - 0.5) * 0.3];
    };
  },
  rubber(S) {
    const st = fbm(S, 32, 2, 81);
    return (i) => [0.9, 0.9, 0.9, st[i] * 0.3, 1];
  },
  fabric(S) {
    const blot = fbm(S, 8, 3, 91);
    const cell = Math.max(2, Math.round(S / 96));
    return (i) => {
      const y = Math.floor(i / S);
      const x = i % S;
      const wx = Math.floor(x / cell) % 2;
      const wy = Math.floor(y / cell) % 2;
      const thread = wx ^ wy ? Math.sin(((x % cell) / cell) * Math.PI) : Math.sin(((y % cell) / cell) * Math.PI);
      const v = 0.8 + thread * 0.12 + (blot[i] - 0.5) * 0.1;
      return [v, v, v, thread * 0.8, 1];
    };
  },
  concrete(S) {
    const blot = fbm(S, 4, 4, 101);
    const fine = fbm(S, 64, 1, 102);
    const r = rng(103);
    const pores = new Float32Array(S * S);
    for (let k = 0; k < S * 2; k++) pores[Math.floor(r() * S * S)] = 1;
    return (i) => {
      const v = 0.84 + (blot[i] - 0.5) * 0.2 + (fine[i] - 0.5) * 0.08 - pores[i] * 0.3;
      return [v, v, v * 0.98, fine[i] * 0.4 - pores[i] * 0.6, 1];
    };
  },
  rust(S) {
    const blot = fbm(S, 6, 4, 111);
    const fine = fbm(S, 48, 2, 112);
    return (i) => {
      const k = Math.max(0, Math.min(1, (blot[i] - 0.5) * 4 + 0.5));
      const r = 0.8 * (1 - k) + 0.75 * k;
      const g = 0.8 * (1 - k) + 0.45 * k;
      const b = 0.8 * (1 - k) + 0.3 * k;
      const f = (fine[i] - 0.5) * 0.12;
      return [r + f, g + f, b + f, k * 0.5 + fine[i] * 0.3, 0.8 + k * 0.2];
    };
  },
};

// the trim sheet: 8 strips of 1/8 of the height each (see TRIM below), colour + height
const TRIM = { vent: 0, perforated: 1, hazard: 2, ribbed: 3, tread: 4, grille: 5, seam: 6, bolts: 7 };
function trimRecipe(S) {
  const strip = S / 8;
  const fine = fbm(S, 32, 2, 121);
  return (i) => {
    const y = Math.floor(i / S);
    const x = i % S;
    const s = Math.floor(y / strip);
    const v = (y % strip) / strip; // 0..1 inside the strip
    const u = x / S;
    const f = (fine[i] - 0.5) * 0.06;
    let c = [0.82 + f, 0.82 + f, 0.82 + f];
    let h = 0.5;
    let ro = 0.8;
    if (s === TRIM.vent) {
      const slot = (u * 12) % 1;
      const hole = v > 0.2 && v < 0.8 && slot > 0.15 && slot < 0.85;
      if (hole) [c, h] = [[0.08, 0.08, 0.09], 0.05];
    } else if (s === TRIM.perforated) {
      const cx = ((u * 16) % 1) - 0.5;
      const cy = ((v * 2) % 1) - 0.5;
      if (cx * cx + cy * cy < 0.09) [c, h] = [[0.06, 0.06, 0.06], 0.05];
    } else if (s === TRIM.hazard) {
      const band = Math.floor(u * 8 * 2 + v * 2) % 2;
      c = band ? [0.93, 0.75, 0.1] : [0.1, 0.1, 0.1];
      ro = 0.6;
      if (v < 0.06 || v > 0.94) h = 0.3;
    } else if (s === TRIM.ribbed) {
      const rib = Math.sin(u * Math.PI * 2 * 24);
      c = [0.18 + rib * 0.03, 0.18 + rib * 0.03, 0.19 + rib * 0.03];
      h = 0.5 + rib * 0.4;
      ro = 0.95;
    } else if (s === TRIM.tread) {
      const a = (((u * 16 + v * 2) % 1) - 0.5) * 2;
      const b = (((u * 16 - v * 2 + 0.5) % 1) - 0.5) * 2;
      const lug = Math.floor(u * 16) % 2 ? Math.abs(a) < 0.2 && Math.abs(v * 2 - Math.round(v * 2)) < 0.35 : Math.abs(b) < 0.2 && Math.abs(v * 2 + 0.5 - Math.round(v * 2 + 0.5)) < 0.35;
      c = [0.72 + f, 0.72 + f, 0.74 + f];
      h = lug ? 0.9 : 0.45;
      ro = 0.55;
    } else if (s === TRIM.grille) {
      const gx = (u * 32) % 1;
      const gy = (v * 4) % 1;
      const wire = gx < 0.18 || gy < 0.18;
      [c, h] = wire ? [[0.7, 0.7, 0.7], 0.8] : [[0.04, 0.04, 0.04], 0.0];
    } else if (s === TRIM.seam) {
      const line = Math.abs(v - 0.5) < 0.06;
      if (line) [c, h] = [[0.3, 0.3, 0.3], 0.1];
    } else if (s === TRIM.bolts) {
      const cx = ((u * 8) % 1) - 0.5;
      const cy = v - 0.5;
      const d2 = cx * cx * 4 + cy * cy;
      if (d2 < 0.06) [c, h] = [[0.6, 0.6, 0.6], 0.5 + (0.06 - d2) * 8];
    }
    return [c[0], c[1], c[2], h, ro];
  };
}

// --------------------------------------------------------------------------------------------- textures
const TEX = new Map(); // kind -> { map, normalMap, roughnessMap }

function makeCanvas(S) {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(S, S);
  const c = document.createElement("canvas");
  c.width = c.height = S;
  return c;
}

// height (Float32Array 0..1, tileable) -> tangent-space normal map pixels
function normalPixels(h, S, strength) {
  const px = new Uint8ClampedArray(S * S * 4);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const at = (xx, yy) => h[((yy + S) % S) * S + ((xx + S) % S)];
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const l = Math.hypot(dx, dy, 1);
      const i = (y * S + x) * 4;
      px[i] = (-dx / l) * 127.5 + 127.5;
      px[i + 1] = (dy / l) * 127.5 + 127.5;
      px[i + 2] = (1 / l) * 127.5 + 127.5;
      px[i + 3] = 255;
    }
  return px;
}

function texFrom(px, S, srgb) {
  const c = makeCanvas(S);
  const g = c.getContext("2d");
  g.putImageData(new ImageData(px, S, S), 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = Q.anisotropy;
  return t;
}

const NORMAL_STRENGTH = { paint: 1.5, steel: 1.5, wood: 3, plywood: 3, cardboard: 3, plastic: 2, rubber: 3, fabric: 5, concrete: 4, rust: 5, trim: 10, chrome: 0 };

export function propTextures(kind) {
  if (TEX.has(kind)) return TEX.get(kind);
  const recipe = kind === "trim" ? trimRecipe : RECIPES[kind];
  if (!recipe || typeof document === "undefined" || typeof ImageData === "undefined") {
    TEX.set(kind, {});
    return TEX.get(kind);
  }
  const S = kind === "trim" ? Math.max(256, Q.size * 2) : Q.size;
  const f = recipe(S);
  const alb = new Uint8ClampedArray(S * S * 4);
  const rough = new Uint8ClampedArray(S * S * 4);
  const h = new Float32Array(S * S);
  for (let i = 0; i < S * S; i++) {
    const [r, g, b, hh, ro] = f(i);
    alb[i * 4] = r * 255;
    alb[i * 4 + 1] = g * 255;
    alb[i * 4 + 2] = b * 255;
    alb[i * 4 + 3] = 255;
    const rv = Math.max(0, Math.min(1, ro)) * 255;
    rough[i * 4] = rough[i * 4 + 1] = rough[i * 4 + 2] = rv;
    rough[i * 4 + 3] = 255;
    h[i] = hh;
  }
  const set = {
    map: texFrom(alb, S, true),
    roughnessMap: texFrom(rough, S, false),
    normalMap: NORMAL_STRENGTH[kind] ? texFrom(normalPixels(h, S, (NORMAL_STRENGTH[kind] * S) / 256), S, false) : null,
  };
  TEX.set(kind, set);
  return set;
}

// --------------------------------------------------------------------------------------------- materials
// per kind: base roughness / metalness and the default texture scale (metres per repeat)
export const KINDS = {
  paint: { roughness: 0.55, metalness: 0.15, uv: 0.8 },
  steel: { roughness: 0.38, metalness: 0.85, uv: 0.5 },
  chrome: { roughness: 0.18, metalness: 1, uv: 1 },
  wood: { roughness: 0.62, metalness: 0, uv: 0.9 },
  plywood: { roughness: 0.75, metalness: 0, uv: 0.9 },
  cardboard: { roughness: 0.92, metalness: 0, uv: 0.45 },
  plastic: { roughness: 0.5, metalness: 0, uv: 0.4 },
  rubber: { roughness: 0.9, metalness: 0, uv: 0.3 },
  fabric: { roughness: 0.95, metalness: 0, uv: 0.25 },
  concrete: { roughness: 0.9, metalness: 0, uv: 1.5 },
  rust: { roughness: 0.8, metalness: 0.35, uv: 1 },
  trim: { roughness: 0.6, metalness: 0.4, uv: 1 },
  glass: { roughness: 0.05, metalness: 0, uv: 1 },
  glow: { roughness: 0.5, metalness: 0, uv: 1 },
  screen: { roughness: 0.2, metalness: 0, uv: 1 },
};

const MATS = new Map();
const BY_KIND = new Map(); // kind -> Set of materials (for preferPropTextures)

// pm(kind, colour, { uv, roughness, metalness, emissive, emissiveIntensity, opacity, side, map, ... })
// Returns a cached material: the same arguments give the same object (so mergeProps can group by it).
// o.uv rescales the texture repeat (the UVs from bevelBox / metricUV are in metres).
export function pm(kind = "paint", color = 0xffffff, o = {}) {
  const key = kind + "|" + color + "|" + Object.entries(o).map(([k, v]) => `${k}=${v && v.isTexture ? v.uuid : v}`).join(",");
  if (MATS.has(key)) return MATS.get(key);
  const K = KINDS[kind] || KINDS.paint;
  const { uv = K.uv, ...rest } = o;
  const p = { color, roughness: K.roughness, metalness: K.metalness };
  if (kind === "glass") Object.assign(p, { transparent: true, opacity: 0.22, depthWrite: false, envMapIntensity: 1.5 });
  if (kind === "glow") Object.assign(p, { emissive: color, emissiveIntensity: 1.6, toneMapped: true });
  if (kind === "screen") Object.assign(p, { emissive: color, emissiveIntensity: 0.9 });
  const m = new THREE.MeshStandardMaterial({ ...p, ...rest });
  if (!["glass", "glow", "screen"].includes(kind) && !rest.map) applyTextures(m, kind, uv);
  m.name = `prop:${kind}`;
  m.userData.propKind = kind;
  m.userData.propUV = uv;
  MATS.set(key, m);
  if (!BY_KIND.has(kind)) BY_KIND.set(kind, new Set());
  BY_KIND.get(kind).add(m);
  return m;
}

function applyTextures(m, kind, uv) {
  const t = propTextures(kind);
  if (!t.map) return;
  // each material gets its own clone of the texture only for the repeat (clones share the image / GPU upload)
  const rep = (tex) => {
    if (!tex) return null;
    if (uv === 1) return tex;
    const c = tex.clone();
    c.repeat.set(1 / uv, 1 / uv);
    c.userData.propBase = tex;
    return c;
  };
  m.map = rep(t.map);
  m.roughnessMap = rep(t.roughnessMap);
  m.normalMap = Q.normals ? rep(t.normalMap) : null;
  if (m.normalMap) m.normalScale.setScalar(Q.normalScale);
  m.userData.propTex = true;
  m.needsUpdate = true;
}

// Swap the drawn detail for generated photos where assets/media has tex_prop_<kind> (call after
// loadMedia()). The photo is turned into a near-white detail map (so the material colours stay) and
// its brightness into the normal map. Returns the kinds swapped. Works on materials already in use.
export function preferPropTextures(opts = {}) {
  const prefix = opts.prefix ?? "tex_prop_";
  const swapped = [];
  for (const kind of Object.keys(RECIPES)) {
    const img = media(prefix + kind);
    if (!img) continue;
    const S = Math.min(opts.size ?? 512, img.width);
    const c = makeCanvas(S);
    const g = c.getContext("2d", { willReadFrequently: true });
    g.drawImage(img, 0, 0, S, S);
    const d = g.getImageData(0, 0, S, S);
    let mean = 0;
    for (let i = 0; i < d.data.length; i += 4) mean += (d.data[i] + d.data[i + 1] + d.data[i + 2]) / 3;
    mean /= S * S * 255;
    const k = 0.85 / Math.max(0.05, mean);
    const h = new Float32Array(S * S);
    const keepColour = kind === "rust" || kind === "wood" || kind === "plywood" || kind === "cardboard" ? 0.5 : 0.1;
    // how much of the photo's light / dark variation to keep: painted and plastic surfaces stay calm
    const contrast = opts.contrast?.[kind] ?? { paint: 0.45, plastic: 0.5, steel: 0.7, fabric: 0.8, concrete: 0.8 }[kind] ?? 1;
    for (let i = 0; i < S * S; i++) {
      const r = d.data[i * 4] / 255;
      const gg = d.data[i * 4 + 1] / 255;
      const b = d.data[i * 4 + 2] / 255;
      const l = (r + gg + b) / 3;
      h[i] = l;
      // mostly the brightness, a little of the photo's own colour for warm materials
      for (const [j, ch] of [r, gg, b].entries()) d.data[i * 4 + j] = Math.min(255, (mean + (l - mean) * contrast + (ch - l) * keepColour) * k * 255);
    }
    const map = texFrom(d.data, S, true);
    const nm = texFrom(normalPixels(h, S, ((NORMAL_STRENGTH[kind] || 3) * S) / 256), S, false);
    const set = TEX.get(kind) || {};
    set.map = map;
    set.normalMap = nm;
    TEX.set(kind, set);
    for (const m of BY_KIND.get(kind) || []) if (m.userData.propTex) applyTextures(m, kind, m.userData.propUV ?? 1);
    swapped.push(kind);
  }
  return swapped;
}

// A copy of a material that multiplies by the vertex colours (the baked AO of mergeProps); cached.
const AO = new WeakMap();
const BASE = new WeakMap();
// the material an AO copy was made from (itself for any other material)
export const baseMaterial = (m) => BASE.get(m) || m;
export function withVertexColors(m) {
  if (m.vertexColors) return m;
  if (!AO.has(m)) {
    const c = m.clone();
    c.vertexColors = true;
    c.name = (m.name || "mat") + "+ao";
    BASE.set(c, m);
    AO.set(m, c);
  }
  return AO.get(m);
}

// Map the UVs of a part (whose v runs 0..1 across it, e.g. a PlaneGeometry or one face) onto one strip
// of the trim sheet. uMetres: metres per repeat along u (0 keeps the part's own u).
export function trimUV(geo, strip, uMetres = 0, width = 1) {
  const s = typeof strip === "number" ? strip : TRIM[strip];
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    const u = uMetres ? (uv.getX(i) * width) / uMetres : uv.getX(i);
    const v = uv.getY(i);
    uv.setXY(i, u, 1 - (s + 0.06 + (1 - v) * 0.88) / 8);
  }
  return geo;
}
export const TRIM_STRIPS = Object.keys(TRIM);

// how many textures and materials the library has made (gallery / budgets)
export const propStats = () => ({ materials: MATS.size, textureSets: [...TEX.values()].filter((t) => t.map).length, size: Q.size });
