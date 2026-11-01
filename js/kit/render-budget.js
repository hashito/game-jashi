/* game-kit 6e0b6f0: js/render-budget.js — edit in game-kit and run tools/kit-sync.js */
// Quality tiers, per-tier budgets, the four look presets (as plain data), tier auto-detect / auto-downgrade,
// a frame-budget monitor and a scene inspector that checks a scene against the budgets.
// No three.js import (scene / renderer are duck-typed), so it runs and is tested in Node; render-presets.js
// turns the data into a renderer setup, lights, fog and post. Numbers: docs/3d-quality-guide.md §1.5 and §11.
//
//   const q = new QualityTier({ storage: localStorage, key: 'mygame.quality' });   // 'auto' | 'low' | 'mid' | 'high'
//   q.tier            -> 'mid' (auto-detected on a phone)
//   q.sample(dtMs)    -> a lower tier name when the frame average stays over 22 ms (auto mode only), else null
//   checkBudget(sceneStats(scene, renderer), 'mid').items.filter((i) => i.level !== 'ok')

export const TIER_NAMES = ["low", "mid", "high"];

// what each tier turns on. dprCap: pixel-ratio ceiling; post: a real post pass (off-screen target); cssPost: the
// DOM vignette / grain overlay used instead (almost free); animEvery: update far characters every n frames
export const TIERS = {
  low: { name: "low", label: "低", dprCap: 1.0, antialias: false, shadows: false, shadowSize: 512, shadowRadius: 1, maxLights: 2, post: false, bloom: false, cssPost: true, anisotropy: 2, fogScale: 1.3, farScale: 0.7, particles: 300, animEvery: 3, textureMax: 1024 },
  mid: { name: "mid", label: "中", dprCap: 1.5, antialias: true, shadows: true, shadowSize: 1024, shadowRadius: 2, maxLights: 3, post: false, bloom: false, cssPost: true, anisotropy: 4, fogScale: 1.0, farScale: 1.0, particles: 1000, animEvery: 2, textureMax: 1024 },
  high: { name: "high", label: "高", dprCap: 2.0, antialias: true, shadows: true, shadowSize: 2048, shadowRadius: 3, maxLights: 8, post: true, bloom: true, cssPost: false, anisotropy: 8, fogScale: 1.0, farScale: 1.0, particles: 10000, animEvery: 1, textureMax: 2048 },
};

// budgets per tier (mid = a mid-range phone, the default). warn at `warnAt` of the limit
export const BUDGETS = {
  low: { frameMs: 33.3, drawCalls: 50, triangles: 100000, textureMB: 64, textureMax: 1024, shadowLights: 0, dynamicLights: 2, skinned: 3, bones: 30, postPasses: 0, dprCap: 1.0, particles: 300, programs: 30 },
  mid: { frameMs: 16.7, drawCalls: 100, triangles: 200000, textureMB: 128, textureMax: 2048, shadowLights: 1, dynamicLights: 3, skinned: 10, bones: 65, postPasses: 1, dprCap: 1.5, particles: 1000, programs: 40 },
  high: { frameMs: 16.7, drawCalls: 500, triangles: 1000000, textureMB: 512, textureMax: 4096, shadowLights: 2, dynamicLights: 8, skinned: 30, bones: 100, postPasses: 3, dprCap: 2.0, particles: 10000, programs: 80 },
};

// ---- look presets -------------------------------------------------------------------------------
// Colours are sRGB hex. Intensities are physical (r155+): point lights in candela (a room lamp 20-150 with decay 2),
// directional 1-3, hemisphere 0.1-1. env: the procedural room/sky that PMREM turns into scene.environment.
// key: the one shadow-casting light. fills: lights without shadows (capped by the tier's maxLights).
export const PRESETS = {
  // horror-night interior: cold dim fluorescent + one warm lamp, deep fog, ACES for a solid black
  horror: {
    name: "horror", label: "夜の室内（ホラー）", kind: "interior",
    toneMapping: "aces", exposure: 1.0, background: 0x07090c,
    fog: { type: "exp2", color: 0x07090c, density: 0.075 }, far: 40,
    env: { kind: "room", top: 0x2a3138, wall: 0x14181c, floor: 0x0b0b0c, panels: [[0x9fb4c8, 1.2]], intensity: 0.22 },
    hemi: { sky: 0x2b3440, ground: 0x0a0806, intensity: 0.12 },
    key: { type: "spot", color: 0xd8e4ff, intensity: 38, pos: [0.6, 2.6, 0.4], target: [0, 0, -1.2], angle: 0.75, penumbra: 0.6, distance: 14, shadow: true, flicker: 0.12 },
    fills: [{ type: "point", color: 0xffb070, intensity: 6, distance: 6, pos: [-1.8, 1.1, -2.2] }],
    post: { vignette: 0.55, grain: 0.06, bloom: { strength: 0.45, threshold: 0.85, radius: 0.6 }, tint: [0.95, 1.0, 1.06], saturation: 0.82 },
  },
  // dusk exterior: low orange sun from the side, blue sky fill, light haze; AgX keeps the sunset hues
  dusk: {
    name: "dusk", label: "夕暮れの屋外", kind: "exterior",
    toneMapping: "agx", exposure: 1.05, background: 0xa8949a,
    fog: { type: "exp2", color: 0xa8949a, density: 0.012 }, far: 160,
    env: { kind: "sky", top: 0x3d5a8a, horizon: 0xe8a070, ground: 0x2a241e, sun: [0xffc080, 6, [-0.8, 0.12, -0.4]], intensity: 0.7 },
    hemi: { sky: 0x7f9ad0, ground: 0x5a4030, intensity: 0.3 },
    key: { type: "dir", color: 0xff9a50, intensity: 3.2, pos: [-12, 4.5, -6], shadow: true, area: 14 },
    fills: [{ type: "point", color: 0xffd090, intensity: 18, distance: 10, pos: [3, 3.2, 2] }],
    post: { vignette: 0.3, grain: 0.025, bloom: { strength: 0.35, threshold: 0.9, radius: 0.5 }, tint: [1.04, 1.0, 0.96], saturation: 1.05 },
  },
  // office / day interior: soft even ceiling light, daylight from a window, Neutral keeps material colours
  office: {
    name: "office", label: "昼の室内（事務所）", kind: "interior",
    toneMapping: "neutral", exposure: 1.0, background: 0xdfe6ea,
    fog: null, far: 60,
    env: { kind: "room", top: 0xffffff, wall: 0xc8c6c0, floor: 0x8a8274, panels: [[0xffffff, 4], [0xfff4e0, 3]], window: [0xd8e8ff, 6], intensity: 0.9 },
    hemi: { sky: 0xf4f6ff, ground: 0x9a9080, intensity: 0.45 },
    key: { type: "dir", color: 0xfff2dc, intensity: 1.6, pos: [5, 7, 3], shadow: true, area: 8 },
    fills: [{ type: "point", color: 0xf0f4ff, intensity: 20, distance: 9, pos: [0, 2.6, -1] }],
    post: { vignette: 0.12, grain: 0.0, bloom: null, tint: [1, 1, 1], saturation: 1.0 },
  },
  // zoo night with fog: moonlight, sodium lamps along paths, thick blue fog that hides the far plane
  zoo: {
    name: "zoo", label: "霧の夜（動物園）", kind: "exterior",
    toneMapping: "aces", exposure: 1.1, background: 0x1a2230,
    fog: { type: "exp2", color: 0x1a2230, density: 0.045 }, far: 70,
    env: { kind: "sky", top: 0x0c1220, horizon: 0x2a3446, ground: 0x0a0c0e, sun: [0xb0c4ff, 1.5, [0.4, 0.6, 0.3]], intensity: 0.35 },
    hemi: { sky: 0x405070, ground: 0x101418, intensity: 0.25 },
    key: { type: "dir", color: 0xb8c8ff, intensity: 0.9, pos: [6, 12, 4], shadow: true, area: 14 },
    fills: [
      { type: "point", color: 0xffa850, intensity: 70, distance: 14, pos: [-4, 3.5, 1] },
      { type: "point", color: 0xffa850, intensity: 70, distance: 14, pos: [5, 3.5, -4] },
      { type: "point", color: 0xffa850, intensity: 70, distance: 14, pos: [0, 3.5, -10] },
    ],
    post: { vignette: 0.4, grain: 0.04, bloom: { strength: 0.6, threshold: 0.8, radius: 0.6 }, tint: [0.96, 1.0, 1.06], saturation: 0.9 },
  },
};

// a preset with some fields replaced (deep for env / key / post)
export function extendPreset(base, over = {}) {
  const b = typeof base === "string" ? PRESETS[base] : base;
  if (!b) throw new Error(`unknown preset ${base}`);
  const out = { ...b, ...over };
  for (const k of ["env", "hemi", "key", "post", "fog"]) if (over[k] && b[k] && typeof over[k] === "object") out[k] = { ...b[k], ...over[k] };
  return out;
}

// ---- tier detection -----------------------------------------------------------------------------
// env: { touch, dpr, cores, memory (GB, navigator.deviceMemory), gpu (UNMASKED_RENDERER string), width, height }
export function detectTier(env = {}) {
  const gpu = String(env.gpu || "").toLowerCase();
  if (/swiftshader|llvmpipe|software|mali-[4t][0-9]{2}\b|adreno \(tm\) [3-5][0-9]{2}\b|powervr/.test(gpu)) return "low";
  const touch = !!env.touch;
  const cores = env.cores || 4;
  const mem = env.memory || (touch ? 4 : 8);
  if (touch) return cores <= 4 || mem <= 3 ? "low" : "mid";
  if (/intel.*(hd|uhd) graphics [0-9]{3}\b|intel\(r\) hd/.test(gpu) || cores <= 2 || mem <= 4) return "mid";
  return "high";
}

// the env for detectTier from the browser (and the GL context's renderer string when given)
export function browserEnv(gl = null) {
  const g = typeof globalThis !== "undefined" ? globalThis : {};
  const nav = g.navigator || {};
  let gpu = "";
  try {
    if (gl) {
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      gpu = gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || "";
    }
  } catch {
    /* blocked */
  }
  const mm = g.matchMedia ? g.matchMedia("(pointer: coarse)") : null;
  return {
    touch: !!(mm && mm.matches) || (nav.maxTouchPoints || 0) > 1,
    dpr: g.devicePixelRatio || 1,
    cores: nav.hardwareConcurrency || 4,
    memory: nav.deviceMemory || 0,
    gpu,
    width: g.innerWidth || 0,
    height: g.innerHeight || 0,
  };
}

export const lowerTier = (t) => TIER_NAMES[Math.max(0, TIER_NAMES.indexOf(t) - 1)];

// The player's choice ('auto' or a tier) and the tier in effect. Auto mode drops one tier when the average frame
// over `window` frames stays above `downMs` (default 22 ms = ~45 fps) `strikes` times in a row; it never goes up by
// itself (no flip-flop; the player can pick a higher tier in the settings). Frames over 250 ms (tab switch, load)
// and the first `warmup` frames are ignored. The choice is saved in `storage` (localStorage-like; failures ignored).
export class QualityTier {
  constructor(o = {}) {
    this.storage = o.storage || null;
    this.key = o.key || "kit.quality";
    this.downMs = o.downMs ?? 22;
    this.window = o.window ?? 60;
    this.strikes = o.strikes ?? 2;
    this.warmup = o.warmup ?? 90;
    this.min = o.min || "low";
    this.onChange = o.onChange || null;
    this.detected = o.detected || detectTier(o.env || browserEnv());
    let saved = null;
    try {
      saved = this.storage ? this.storage.getItem(this.key) : null;
    } catch {
      /* private mode */
    }
    this.choice = ["auto", ...TIER_NAMES].includes(saved) ? saved : o.initial || "auto";
    this.auto = this.detected; // the tier auto mode is on now
    this.reset();
  }
  get tier() {
    return this.choice === "auto" ? this.auto : this.choice;
  }
  get config() {
    return TIERS[this.tier];
  }
  reset() {
    this.acc = 0;
    this.n = 0;
    this.seen = 0;
    this.bad = 0;
  }
  // 'auto' | 'low' | 'mid' | 'high'
  setChoice(c) {
    if (!["auto", ...TIER_NAMES].includes(c)) throw new Error(`bad quality ${c}`);
    const before = this.tier;
    this.choice = c;
    if (c === "auto") this.auto = this.detected;
    try {
      if (this.storage) this.storage.setItem(this.key, c);
    } catch {
      /* ignore */
    }
    this.reset();
    if (this.tier !== before && this.onChange) this.onChange(this.tier, before, "choice");
    return this.tier;
  }
  // feed every frame's dt (ms). Returns the new tier name when auto mode dropped a tier, else null
  sample(dtMs) {
    if (this.choice !== "auto") return null;
    if (!(dtMs > 0) || dtMs > 250) return null;
    if (this.seen++ < this.warmup) return null;
    this.acc += dtMs;
    if (++this.n < this.window) return null;
    const avg = this.acc / this.n;
    this.acc = 0;
    this.n = 0;
    this.bad = avg > this.downMs ? this.bad + 1 : 0;
    if (this.bad < this.strikes) return null;
    this.bad = 0;
    const i = TIER_NAMES.indexOf(this.auto);
    if (i <= TIER_NAMES.indexOf(this.min)) return null;
    const before = this.auto;
    this.auto = TIER_NAMES[i - 1];
    this.seen = 0; // the new tier gets its own warm-up
    if (this.onChange) this.onChange(this.auto, before, "auto");
    return this.auto;
  }
}

// ---- monitor ------------------------------------------------------------------------------------
// Frame times (ring buffer) + the last renderer.info numbers. snapshot() -> { fps, avgMs, p95Ms, worstMs, calls, triangles, ... }
export class BudgetMonitor {
  constructor(o = {}) {
    this.size = o.size ?? 120;
    this.buf = new Float32Array(this.size);
    this.i = 0;
    this.n = 0;
    this.info = { calls: 0, triangles: 0, points: 0, lines: 0, geometries: 0, textures: 0, programs: 0 };
  }
  push(dtMs, renderer = null) {
    if (dtMs > 0 && dtMs < 1000) {
      this.buf[this.i] = dtMs;
      this.i = (this.i + 1) % this.size;
      this.n = Math.min(this.n + 1, this.size);
    }
    if (renderer && renderer.info) this.read(renderer.info);
  }
  read(info) {
    const r = info.render || {};
    const m = info.memory || {};
    this.info = { calls: r.calls || 0, triangles: r.triangles || 0, points: r.points || 0, lines: r.lines || 0, geometries: m.geometries || 0, textures: m.textures || 0, programs: info.programs ? info.programs.length : 0 };
  }
  snapshot() {
    const v = Array.from(this.buf.subarray(0, this.n)).sort((a, b) => a - b);
    const avg = v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
    const p95 = v.length ? v[Math.min(v.length - 1, Math.ceil(0.95 * v.length) - 1)] : 0;
    return { fps: avg ? Math.round(1000 / avg) : 0, avgMs: +avg.toFixed(1), p95Ms: +p95.toFixed(1), worstMs: +(v[v.length - 1] || 0).toFixed(1), frames: v.length, ...this.info };
  }
}

// ---- scene inspection ---------------------------------------------------------------------------
// Counts what a scene costs: meshes, instances, triangles (whole scene, before culling), lights, shadow casters,
// skinned meshes / bones, materials, programs, textures (estimated GPU MB, the largest side), post passes.
// SELF-CONTAINED on purpose: tools/check-3d-budget.mjs sends this function's source into a page and calls it there.
// opts: { postPasses, camera }
export function sceneStats(scene, renderer, opts) {
  opts = opts || {};
  const s = {
    meshes: 0, instancedMeshes: 0, instances: 0, triangles: 0, points: 0, skinned: 0, maxBones: 0,
    lights: { total: 0, point: 0, spot: 0, directional: 0, hemisphere: 0, ambient: 0, rectArea: 0, other: 0 },
    dynamicLights: 0, shadowLights: 0, pointShadows: 0, shadowMapMax: 0, castShadow: 0,
    materials: 0, textures: 0, textureMB: 0, textureMax: 0, textureMaxName: "", uncompressed: 0, noAnisotropy: 0, srgbMissing: 0,
    environment: false, fog: null, background: null,
    postPasses: opts.postPasses || 0,
    renderer: null, issues: [],
  };
  const mats = new Set();
  const texs = new Set();
  const colorSlots = { map: 1, emissiveMap: 1, specularColorMap: 1, sheenColorMap: 1 };
  const addMat = (m) => {
    if (!m || mats.has(m)) return;
    mats.add(m);
    for (const k in m) {
      const v = m[k];
      if (v && v.isTexture && !texs.has(v)) {
        texs.add(v);
        if (colorSlots[k] && !v.isRenderTargetTexture && v.colorSpace !== "srgb" && !v.isCompressedTexture) s.srgbMissing++;
      }
    }
    if (m.uniforms) for (const k in m.uniforms) { const u = m.uniforms[k] && m.uniforms[k].value; if (u && u.isTexture) texs.add(u); }
  };
  const tris = (g) => {
    if (!g) return 0;
    if (g.index) return (g.drawRange && isFinite(g.drawRange.count) ? Math.min(g.drawRange.count, g.index.count) : g.index.count) / 3;
    const p = g.attributes && g.attributes.position;
    return p ? p.count / 3 : 0;
  };
  // like traverseVisible: a hidden group hides its children too
  const walk = (o, fn) => {
    if (o.visible === false) return;
    fn(o);
    for (const c of o.children || []) walk(c, fn);
  };
  walk(scene, (o) => {
    if (o.isLight) {
      s.lights.total++;
      const t = o.isPointLight ? "point" : o.isSpotLight ? "spot" : o.isDirectionalLight ? "directional" : o.isHemisphereLight ? "hemisphere" : o.isAmbientLight ? "ambient" : o.isRectAreaLight ? "rectArea" : "other";
      s.lights[t]++;
      if (t === "point" || t === "spot" || t === "directional" || t === "rectArea") s.dynamicLights++;
      if (o.castShadow && o.shadow) {
        s.shadowLights++;
        if (o.isPointLight) s.pointShadows++;
        const ms = o.shadow.mapSize ? Math.max(o.shadow.mapSize.x, o.shadow.mapSize.y) : 0;
        s.shadowMapMax = Math.max(s.shadowMapMax, ms);
      }
      return;
    }
    if (o.isMesh || o.isPoints || o.isLine || o.isSprite) {
      [].concat(o.material || []).forEach(addMat);
      if (o.castShadow) s.castShadow++;
      if (o.isPoints) { const p = o.geometry && o.geometry.attributes && o.geometry.attributes.position; s.points += p ? p.count : 0; return; }
      if (!o.isMesh) return;
      s.meshes++;
      let n = 1;
      if (o.isInstancedMesh) { s.instancedMeshes++; n = o.count; s.instances += o.count; }
      if (o.isBatchedMesh) n = 1;
      s.triangles += tris(o.geometry) * n;
      if (o.isSkinnedMesh) { s.skinned++; s.maxBones = Math.max(s.maxBones, o.skeleton && o.skeleton.bones ? o.skeleton.bones.length : 0); }
    }
  });
  if (scene.environment) s.environment = true;
  if (scene.fog) s.fog = scene.fog.isFogExp2 ? "exp2" : "linear";
  if (scene.background) s.background = scene.background.isColor ? "color" : scene.background.isTexture ? "texture" : "other";
  if (scene.environment && scene.environment.isTexture) texs.add(scene.environment);
  if (scene.background && scene.background.isTexture) texs.add(scene.background);
  for (const t of texs) {
    const img = t.isCompressedTexture && t.mipmaps && t.mipmaps[0] ? t.mipmaps[0] : t.image || (t.source && t.source.data);
    let w = (img && (img.width || img.videoWidth)) || 0;
    let h = (img && (img.height || img.videoHeight)) || 0;
    if (t.isRenderTargetTexture && !w && t.image) { w = t.image.width || 0; h = t.image.height || 0; }
    if (!w || !h) continue;
    const isCube = t.isCubeTexture || (Array.isArray(t.image) && t.image.length === 6);
    // compressed (KTX2: ETC1S / UASTC transcode to ~1 byte per texel); others: RGBA8, half float 8 bytes; mipmaps +1/3
    const bpp = t.isCompressedTexture ? 1 : t.type === 1016 || t.type === 1015 ? (t.type === 1015 ? 16 : 8) : 4;
    const mip = t.generateMipmaps !== false || (t.mipmaps && t.mipmaps.length > 1) ? 4 / 3 : 1;
    s.textureMB += (w * h * bpp * mip * (isCube ? 6 : 1)) / (1024 * 1024);
    s.textures++;
    if (!t.isCompressedTexture && !t.isRenderTargetTexture && !t.isDataTexture && !t.isCanvasTexture) s.uncompressed++;
    if (!t.isRenderTargetTexture && (t.anisotropy || 1) <= 1 && t.repeat && (t.repeat.x > 1 || t.repeat.y > 1)) s.noAnisotropy++;
    if (Math.max(w, h) > s.textureMax && !t.isRenderTargetTexture) { s.textureMax = Math.max(w, h); s.textureMaxName = t.name || (t.source && t.source.data && t.source.data.src ? String(t.source.data.src).split("/").pop() : "") || String(t.uuid || "").slice(0, 8); }
  }
  s.textureMB = Math.round(s.textureMB * 10) / 10;
  s.materials = mats.size;
  if (renderer) {
    const i = renderer.info || {};
    const sm = renderer.shadowMap || {};
    s.renderer = {
      calls: (i.render && i.render.calls) || 0,
      triangles: (i.render && i.render.triangles) || 0,
      geometries: (i.memory && i.memory.geometries) || 0,
      texturesLoaded: (i.memory && i.memory.textures) || 0,
      programs: i.programs ? i.programs.length : 0,
      pixelRatio: renderer.getPixelRatio ? renderer.getPixelRatio() : 0,
      outputColorSpace: renderer.outputColorSpace || "",
      toneMapping: renderer.toneMapping || 0,
      exposure: renderer.toneMappingExposure || 1,
      shadowMap: !!sm.enabled,
      shadowType: sm.type || 0,
    };
  }
  return s;
}

// three.js constants used below (r170)
const PCFSoftShadowMap = 2;
const TONE = { 0: "none", 1: "linear", 2: "reinhard", 3: "cineon", 4: "aces", 5: "custom", 6: "agx", 7: "neutral" };

// stats (from sceneStats) against a tier's budget -> { tier, ok, over, warn, items: [{ key, value, limit, level, hint }] }
// level: 'ok' | 'warn' (>= warnAt of the limit) | 'over'. Lint items (no environment map, PCFSoft, point-light
// shadows, wrong output colour space, pixel ratio over the cap) are 'over' or 'warn' with limit null.
export function checkBudget(stats, tierName = "mid", o = {}) {
  const b = { ...BUDGETS[tierName], ...(o.budgets || {}) };
  const warnAt = o.warnAt ?? 0.8;
  const r = stats.renderer || {};
  const items = [];
  const num = (key, value, limit, hint) => {
    if (value == null || limit == null) return;
    // small counts (1 shadow light, 1.5 pixel ratio) may sit right at the limit: only "over" counts there
    const level = value > limit ? "over" : limit > 3 && value >= limit * warnAt ? "warn" : "ok";
    items.push({ key, value, limit, level, hint });
  };
  num("drawCalls", r.calls || 0, b.drawCalls, "merge static props (mergeStatic), InstancedMesh for repeats, hide rooms you are not in");
  num("triangles", Math.max(r.triangles || 0, 0) || stats.triangles, b.triangles, "simpler props, LOD, cull far rooms");
  num("textureMB", stats.textureMB, b.textureMB, "KTX2 (4-8x less GPU memory), 1024 max on phones, share textures");
  num("textureMax", stats.textureMax, b.textureMax, `largest texture ${stats.textureMaxName || ""}: resize to the tier's max`.trim());
  num("shadowLights", stats.shadowLights, b.shadowLights, "one shadow light; blob / baked shadows for the rest");
  num("dynamicLights", Math.max(0, stats.dynamicLights - stats.shadowLights), b.dynamicLights, "LightPool: only the nearest lamps are real lights, the rest are emissive");
  num("skinned", stats.skinned, b.skinned, "fewer animated characters, impostors for the far ones");
  num("bones", stats.maxBones, b.bones, "a lighter rig (65 bones or fewer on phones)");
  num("postPasses", stats.postPasses, b.postPasses, "no post on phones: use the CSS vignette / grain overlay");
  num("particles", stats.points, b.particles, "fewer points, smaller sprites");
  num("programs", r.programs || 0, b.programs, "share materials (one cached material per look), fewer material variants");
  if (r.pixelRatio) num("pixelRatio", r.pixelRatio, b.dprCap, "renderer.setPixelRatio(Math.min(devicePixelRatio, cap))");
  const lint = (key, bad, hint, level = "over") => items.push({ key, value: bad ? 1 : 0, limit: null, level: bad ? level : "ok", hint });
  lint("environment", !stats.environment, "set scene.environment (makeEnvironment / RoomEnvironment through PMREM): PBR materials look flat without it", "warn");
  lint("pointShadows", stats.pointShadows > 0, "PointLight shadows draw the scene 6 times: use a SpotLight or no shadow");
  if (stats.renderer) {
    lint("outputColorSpace", r.outputColorSpace && r.outputColorSpace !== "srgb", "renderer.outputColorSpace = THREE.SRGBColorSpace");
    lint("shadowType", r.shadowMap && r.shadowType === PCFSoftShadowMap, "PCFSoftShadowMap is deprecated (r182) and removed later: use PCFShadowMap + shadow.radius", "warn");
    lint("toneMapping", !r.toneMapping && !stats.postPasses, `tone mapping is ${TONE[r.toneMapping] || r.toneMapping}: use ACES / AgX / Neutral`, "warn");
  }
  lint("srgbTextures", stats.srgbMissing > 0, `${stats.srgbMissing} colour map(s) not in SRGBColorSpace: tex.colorSpace = THREE.SRGBColorSpace for map / emissiveMap`, "warn");
  lint("anisotropy", stats.noAnisotropy > 0, `${stats.noAnisotropy} tiled texture(s) without anisotropy: floors blur at a glancing angle (setAnisotropy)`, "warn");
  const over = items.filter((i) => i.level === "over").length;
  const warn = items.filter((i) => i.level === "warn").length;
  return { tier: tierName, ok: over === 0, over, warn, items };
}

// a one-line-per-item text report
export function formatBudget(report) {
  const mark = { ok: "  ok ", warn: " warn", over: " OVER" };
  const lines = [`budget (${report.tier}): ${report.ok ? "within" : `${report.over} over`}${report.warn ? `, ${report.warn} warning(s)` : ""}`];
  for (const i of report.items) {
    const v = i.limit == null ? (i.level === "ok" ? "fine" : "") : `${i.value} / ${i.limit}`;
    lines.push(`${mark[i.level]}  ${i.key.padEnd(16)} ${v}${i.level !== "ok" ? `  - ${i.hint}` : ""}`);
  }
  return lines.join("\n");
}

// ---- light pool helper --------------------------------------------------------------------------
// indices of the n lamps nearest to p, for keeping only a few real PointLights (render-presets LightPool).
// lamps / p: [x, y, z] or [x, z] (only x and z count)
export function nearestLamps(lamps, p, n) {
  const xz = (a) => (a.length === 2 ? a : [a[0], a[2]]);
  const [px, pz] = xz(p);
  return lamps
    .map((l, i) => { const [x, z] = xz(l); return [i, (x - px) ** 2 + (z - pz) ** 2]; })
    .sort((a, b) => a[1] - b[1])
    .slice(0, n)
    .map((x) => x[0]);
}
