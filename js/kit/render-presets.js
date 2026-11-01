/* game-kit 6e0b6f0: js/render-presets.js — edit in game-kit and run tools/kit-sync.js */
// One-call looks for three.js r170 games: renderer colour management / tone mapping / pixel-ratio cap, a procedural
// PMREM environment (no file to download), a light rig with one shadow light, fog, cheap post (vignette, grain,
// half-res bloom; a CSS overlay on phones), quality tiers (auto-detect + auto-downgrade + a settings <select>), a
// frame-budget monitor and a debug overlay. The numbers and the reasons are in docs/3d-quality-guide.md.
//
//   import { applyPreset } from './kit/render-presets.js';
//   const look = applyPreset(renderer, scene, camera, 'horror');          // 'horror' | 'dusk' | 'office' | 'zoo' | {…}
//   renderer.setAnimationLoop((t) => { const dt = clock.getDelta(); update(dt); look.update(dt, t / 1000, player.position); look.render(); });
//   addEventListener('resize', () => look.resize());
//   settings.append(qualitySelect(look));                                 // 画質: 自動 / 低 / 中 / 高
//   if (location.search.includes('budget')) debugOverlay(look);           // fps, draw calls, triangles vs the tier budget
import * as THREE from "three";
import { PRESETS, TIERS, QualityTier, BudgetMonitor, sceneStats, checkBudget, extendPreset, browserEnv, detectTier, nearestLamps } from "./render-budget.js";

export { PRESETS, TIERS, BUDGETS, QualityTier, BudgetMonitor, sceneStats, checkBudget, formatBudget, extendPreset, detectTier, nearestLamps } from "./render-budget.js";

const TONE = { aces: THREE.ACESFilmicToneMapping, agx: THREE.AgXToneMapping, neutral: THREE.NeutralToneMapping, linear: THREE.LinearToneMapping, none: THREE.NoToneMapping };
const preset = (p) => (typeof p === "string" ? PRESETS[p] : p) || PRESETS.office;
const tierOf = (t) => (typeof t === "string" ? TIERS[t] : t) || TIERS.mid;
const col = (hex) => new THREE.Color(hex);

// ---- renderer -----------------------------------------------------------------------------------
// colour management, tone mapping, exposure, the tier's pixel-ratio cap, the shadow map (PCF, not the deprecated PCFSoft)
export function setupRenderer(renderer, p, t, o = {}) {
  p = preset(p);
  t = tierOf(t);
  THREE.ColorManagement.enabled = true;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = TONE[p.toneMapping] ?? THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = o.exposure ?? p.exposure ?? 1;
  capPixelRatio(renderer, t, o.dpr);
  renderer.shadowMap.enabled = !!t.shadows;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  return renderer;
}

export function capPixelRatio(renderer, t, dpr = typeof devicePixelRatio !== "undefined" ? devicePixelRatio : 1) {
  const r = Math.min(dpr, tierOf(t).dprCap);
  if (renderer.getPixelRatio() !== r) renderer.setPixelRatio(r);
  return r;
}

// a WebGLRenderer with the tier's antialias choice (antialias cannot change after creation)
export function createRenderer(o = {}) {
  const tier = o.tier || detectTier(browserEnv());
  const t = tierOf(tier);
  const renderer = new THREE.WebGLRenderer({ canvas: o.canvas, antialias: o.antialias ?? t.antialias, powerPreference: "high-performance", stencil: false, ...(o.params || {}) });
  setupRenderer(renderer, o.preset || "office", t);
  return renderer;
}

// ---- environment (image-based lighting) ---------------------------------------------------------
// A tiny scene rendered once into a PMREM cube: 'room' (ceiling / walls / floor colours + bright panels, like
// RoomEnvironment but tinted per mood) or 'sky' (gradient + a sun disc). Nothing to download.
export function makeEnvironment(renderer, env, o = {}) {
  env = env || { kind: "room" };
  const s = new THREE.Scene();
  const disposables = [];
  const basic = (c, k = 1, side = THREE.FrontSide) => {
    const m = new THREE.MeshBasicMaterial({ color: col(c).multiplyScalar(k), side, toneMapped: false, fog: false });
    disposables.push(m);
    return m;
  };
  const geo = (g) => (disposables.push(g), g);
  if (env.kind === "sky") {
    const g = geo(new THREE.SphereGeometry(10, 32, 16));
    const m = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, toneMapped: false,
      uniforms: { top: { value: col(env.top ?? 0x6080b0) }, horizon: { value: col(env.horizon ?? 0xc0c8d0) }, ground: { value: col(env.ground ?? 0x303030) } },
      vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: "uniform vec3 top; uniform vec3 horizon; uniform vec3 ground; varying vec3 vP; void main(){ float y = vP.y; vec3 c = y > 0.0 ? mix(horizon, top, pow(y, 0.6)) : mix(horizon, ground, pow(-y, 0.4)); gl_FragColor = vec4(c, 1.0); }",
    });
    disposables.push(m);
    s.add(new THREE.Mesh(g, m));
    if (env.sun) {
      const [c, k, d] = env.sun;
      const sun = new THREE.Mesh(geo(new THREE.SphereGeometry(0.7, 16, 8)), basic(c, k));
      sun.position.set(...d).normalize().multiplyScalar(8);
      s.add(sun);
    }
  } else {
    // a 10 x 6 x 10 room seen from inside; the camera of PMREM sits at the origin (about head height)
    const g = geo(new THREE.BoxGeometry(10, 6, 10));
    const wall = basic(env.wall ?? 0x9a9a9a, 1, THREE.BackSide);
    const box = new THREE.Mesh(g, [wall, wall, basic(env.top ?? 0xd0d0d0, 1, THREE.BackSide), basic(env.floor ?? 0x404040, 1, THREE.BackSide), wall, wall]);
    box.position.y = 1.4;
    s.add(box);
    const panels = env.panels || [[0xffffff, 3]];
    const pg = geo(new THREE.PlaneGeometry(2.4, 0.9));
    panels.forEach(([c, k], i) => {
      const m = new THREE.Mesh(pg, basic(c, k, THREE.DoubleSide));
      m.rotation.x = Math.PI / 2;
      m.position.set((i - (panels.length - 1) / 2) * 3.2, 4.3, i % 2 ? 1.2 : -1.2);
      s.add(m);
    });
    if (env.window) {
      const [c, k] = env.window;
      const w = new THREE.Mesh(geo(new THREE.PlaneGeometry(4, 2)), basic(c, k, THREE.DoubleSide));
      w.position.set(4.95, 1.8, 0);
      w.rotation.y = -Math.PI / 2;
      s.add(w);
    }
  }
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(s, o.blur ?? 0.04);
  pmrem.dispose();
  disposables.forEach((d) => d.dispose());
  rt.texture.name = `env-${env.kind || "room"}`;
  return rt.texture;
}

// ---- lights -------------------------------------------------------------------------------------
// The preset's hemisphere light, the key light (the only shadow caster) and the fill lights (no shadows, at most
// the tier's maxLights). All are in one group; lights that are switched off keep visible = true and intensity 0
// (changing the light count recompiles every lit material).
export function buildLights(scene, p, t, o = {}) {
  p = preset(p);
  t = tierOf(t);
  const group = new THREE.Group();
  group.name = `lights-${p.name}`;
  let hemi = null;
  if (p.hemi) {
    hemi = new THREE.HemisphereLight(col(p.hemi.sky), col(p.hemi.ground), p.hemi.intensity);
    group.add(hemi);
  }
  let key = null;
  const k = p.key;
  if (k) {
    if (k.type === "spot") {
      key = new THREE.SpotLight(col(k.color), k.intensity, k.distance ?? 0, k.angle ?? 0.6, k.penumbra ?? 0.4, 2);
    } else {
      key = new THREE.DirectionalLight(col(k.color), k.intensity);
    }
    key.position.set(...k.pos);
    key.target.position.set(...(k.target || [0, 0, 0]));
    group.add(key, key.target);
    key.userData.base = k.intensity;
    key.userData.offset = new THREE.Vector3(...k.pos).sub(new THREE.Vector3(...(k.target || [0, 0, 0])));
    if (k.shadow && t.shadows) setupShadow(key, t, { area: k.area });
  }
  const fills = (p.fills || []).slice(0, t.maxLights).map((f) => {
    const l = f.type === "spot" ? new THREE.SpotLight(col(f.color), f.intensity, f.distance ?? 0, f.angle ?? 0.6, f.penumbra ?? 0.5, 2) : new THREE.PointLight(col(f.color), f.intensity, f.distance ?? 0, 2);
    l.position.set(...f.pos);
    l.userData.base = f.intensity;
    group.add(l);
    return l;
  });
  scene.add(group);
  let seed = 1;
  return {
    group, hemi, key, fills,
    // flicker (preset.key.flicker: 0..1) - a noisy, not periodic, wobble of the key light
    update(t) {
      if (key && k.flicker) {
        const n = Math.sin(t * 13.1) * 0.5 + Math.sin(t * 31.7 + 1.3) * 0.3 + Math.sin(t * 71.3 + seed) * 0.2;
        const drop = Math.sin(t * 0.7) > 0.97 ? 0.5 : 1; // rare short dips
        key.intensity = key.userData.base * (1 - k.flicker * 0.5 + n * k.flicker * 0.5) * drop;
      }
    },
    dispose() {
      scene.remove(group);
      group.traverse((l) => l.isLight && l.dispose && l.dispose());
      seed++;
    },
  };
}

// shadow map size / blur / bias from the tier; a tight frustum for a directional light (area = half size in m)
export function setupShadow(light, t, o = {}) {
  t = tierOf(t);
  light.castShadow = true;
  light.shadow.mapSize.set(t.shadowSize, t.shadowSize);
  light.shadow.radius = t.shadowRadius;
  light.shadow.bias = o.bias ?? -0.0005;
  light.shadow.normalBias = o.normalBias ?? 0.02;
  if (light.isDirectionalLight) {
    const a = o.area ?? 10;
    const c = light.shadow.camera;
    c.left = c.bottom = -a;
    c.right = c.top = a;
    c.near = 0.5;
    c.far = o.far ?? 60;
    c.updateProjectionMatrix();
  } else if (light.isSpotLight) {
    light.shadow.camera.near = 0.2;
    light.shadow.camera.far = o.far ?? 20;
  }
  if (light.shadow.map) (light.shadow.map.dispose(), (light.shadow.map = null));
  return light;
}

// keep a directional light's shadow frustum on the player; snapped to shadow texels so edges do not crawl
const _v = new THREE.Vector3();
export function followShadow(light, focus) {
  if (!light || !light.isDirectionalLight || !focus) return;
  const c = light.shadow.camera;
  const texel = (c.right - c.left) / light.shadow.mapSize.x;
  _v.set(Math.round(focus.x / texel) * texel, 0, Math.round(focus.z / texel) * texel);
  light.target.position.copy(_v);
  light.position.copy(_v).add(light.userData.offset || _v.set(5, 10, 5));
  light.target.updateMatrixWorld();
}

// fog colour = background colour (the far end melts away, so the far plane can be short); denser on low
export function applyFog(scene, camera, p, t) {
  p = preset(p);
  t = tierOf(t);
  scene.background = p.background != null ? col(p.background) : scene.background;
  const f = p.fog;
  if (!f) scene.fog = null;
  else if (f.type === "exp2") scene.fog = new THREE.FogExp2(col(f.color), f.density * t.fogScale);
  else scene.fog = new THREE.Fog(col(f.color), f.near * (2 - t.fogScale), f.far / t.fogScale);
  if (camera && p.far) {
    camera.far = p.far * t.farScale;
    camera.updateProjectionMatrix();
  }
}

// ---- post ---------------------------------------------------------------------------------------
const VERT = "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }";
const BRIGHT = `uniform sampler2D tDiffuse; uniform float threshold; varying vec2 vUv;
void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb; float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  gl_FragColor = vec4(c * smoothstep(threshold, threshold + 0.5, l), 1.0); }`;
const BLUR = `uniform sampler2D tDiffuse; uniform vec2 dir; varying vec2 vUv;
void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb * 0.227027;
  c += (texture2D(tDiffuse, vUv + dir * 1.3846).rgb + texture2D(tDiffuse, vUv - dir * 1.3846).rgb) * 0.3162162;
  c += (texture2D(tDiffuse, vUv + dir * 3.2308).rgb + texture2D(tDiffuse, vUv - dir * 3.2308).rgb) * 0.0702703;
  gl_FragColor = vec4(c, 1.0); }`;
// HDR scene + bloom -> tint / saturation -> tone mapping + sRGB (three's chunks, so renderer.toneMapping and
// exposure apply) -> vignette and grain in display space
const FINAL = `uniform sampler2D tScene; uniform sampler2D tBloom; uniform float bloom; uniform vec3 tint; uniform float sat;
uniform float vignette; uniform float grain; uniform float time; uniform vec2 res; varying vec2 vUv;
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main(){
  vec3 c = texture2D(tScene, vUv).rgb + texture2D(tBloom, vUv).rgb * bloom;
  c *= tint;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = max(mix(vec3(l), c, sat), 0.0);
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  vec2 v = vUv - 0.5;
  gl_FragColor.rgb *= 1.0 - vignette * smoothstep(0.2, 0.8, length(v * vec2(res.x / res.y, 1.0) * 0.9));
  gl_FragColor.rgb += (hash(vUv * res + fract(time) * 61.0) - 0.5) * grain;
}`;

// One HDR target (MSAA), optional bloom at 1/4 resolution (threshold + separable blur), one final pass.
// Counts as 1 post pass (2 with bloom) in the budget; meant for the high tier. opts = preset.post
export class Post {
  constructor(renderer, opts = {}, o = {}) {
    this.renderer = renderer;
    this.opts = opts;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    this.rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: o.samples ?? 4 });
    const mk = (fs, uniforms, toneMapped = false) => new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: fs, depthTest: false, depthWrite: false, toneMapped });
    this.bloomOn = !!opts.bloom;
    const b = opts.bloom || {};
    this.bA = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    this.bB = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    this.bright = mk(BRIGHT, { tDiffuse: { value: this.rt.texture }, threshold: { value: b.threshold ?? 0.9 } });
    this.blur = mk(BLUR, { tDiffuse: { value: null }, dir: { value: new THREE.Vector2() } });
    this.final = mk(FINAL, {
      tScene: { value: this.rt.texture }, tBloom: { value: this.bA.texture }, bloom: { value: this.bloomOn ? b.strength ?? 0.5 : 0 },
      tint: { value: new THREE.Vector3(...(opts.tint || [1, 1, 1])) }, sat: { value: opts.saturation ?? 1 },
      vignette: { value: opts.vignette ?? 0 }, grain: { value: opts.grain ?? 0 }, time: { value: 0 }, res: { value: new THREE.Vector2(size.x, size.y) },
    }, true);
    this.blurRadius = b.radius ?? 0.6;
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.final);
    this.quad.frustumCulled = false;
    this.qs = new THREE.Scene();
    this.qs.add(this.quad);
    this.qc = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.passes = this.bloomOn ? 2 : 1; // effects as the budget counts them (bloom = 1, though it is 3 small draws)
    this.setSize();
  }
  setSize() {
    const s = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.rt.setSize(s.x, s.y);
    const bw = Math.max(1, s.x >> 2);
    const bh = Math.max(1, s.y >> 2);
    this.bA.setSize(bw, bh);
    this.bB.setSize(bw, bh);
    this.bw = bw;
    this.bh = bh;
    this.final.uniforms.res.value.set(s.x, s.y);
  }
  pass(mat, target) {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.qs, this.qc);
  }
  render(scene, camera, time = 0) {
    const r = this.renderer;
    const prev = r.getRenderTarget();
    r.setRenderTarget(this.rt);
    r.render(scene, camera);
    if (this.bloomOn) {
      this.pass(this.bright, this.bA);
      const k = this.blurRadius * 2;
      this.blur.uniforms.tDiffuse.value = this.bA.texture;
      this.blur.uniforms.dir.value.set(k / this.bw, 0);
      this.pass(this.blur, this.bB);
      this.blur.uniforms.tDiffuse.value = this.bB.texture;
      this.blur.uniforms.dir.value.set(0, k / this.bh);
      this.pass(this.blur, this.bA);
    }
    this.final.uniforms.time.value = time;
    this.pass(this.final, prev);
  }
  dispose() {
    [this.rt, this.bA, this.bB, this.bright, this.blur, this.final, this.quad.geometry].forEach((d) => d.dispose());
  }
}

// The phone fallback: a vignette and moving grain drawn by the browser's compositor over the canvas (no extra
// render pass, no off-screen target, MSAA keeps working). parent: the element that holds the canvas.
let grainUrl = null;
function grainImage() {
  if (grainUrl || typeof document === "undefined") return grainUrl;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  const d = g.createImageData(128, 128);
  for (let i = 0; i < d.data.length; i += 4) {
    const v = (Math.random() * 255) | 0;
    d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
    d.data[i + 3] = 255;
  }
  g.putImageData(d, 0, 0);
  grainUrl = c.toDataURL();
  return grainUrl;
}
export class CssPost {
  constructor(opts = {}, o = {}) {
    this.el = document.createElement("div");
    this.el.className = "kit-csspost";
    const st = this.el.style;
    st.cssText = `position:${o.parent && o.parent !== document.body ? "absolute" : "fixed"};inset:0;pointer-events:none;z-index:${o.z ?? 1};`;
    const v = opts.vignette ?? 0;
    const vig = document.createElement("div");
    vig.style.cssText = `position:absolute;inset:0;background:radial-gradient(ellipse at center, rgba(0,0,0,0) 45%, rgba(0,0,0,${Math.min(1, v * 1.4).toFixed(2)}) 100%);`;
    this.el.appendChild(vig);
    const g = opts.grain ?? 0;
    if (g > 0) {
      const gr = document.createElement("div");
      gr.style.cssText = `position:absolute;inset:-64px;background-image:url(${grainImage()});opacity:${Math.min(0.5, g * 2.2).toFixed(3)};mix-blend-mode:overlay;animation:kitGrain 0.5s steps(4) infinite;`;
      this.el.appendChild(gr);
      if (!document.getElementById("kit-grain-kf")) {
        const s = document.createElement("style");
        s.id = "kit-grain-kf";
        s.textContent = "@keyframes kitGrain{0%{transform:translate(0,0)}25%{transform:translate(-37px,21px)}50%{transform:translate(19px,-43px)}75%{transform:translate(-11px,-17px)}100%{transform:translate(29px,33px)}}@media (prefers-reduced-motion: reduce){.kit-csspost div{animation:none!important}}";
        document.head.appendChild(s);
      }
    }
    (o.parent || document.body).appendChild(this.el);
  }
  dispose() {
    this.el.remove();
  }
}

// ---- the look -----------------------------------------------------------------------------------
// applyPreset(renderer, scene, camera, preset, opts) -> look
// opts: quality (a QualityTier; made with storage = localStorage when absent), tier (force a tier), post (true |
// false | 'auto' = by tier), cssParent (element for the CSS overlay), storageKey, exposure, expose (default true:
// window.__sceneStats / __budget for tools/check-3d-budget.mjs), environment (false to keep the game's own)
export function applyPreset(renderer, scene, camera, p, opts = {}) {
  let storage = null;
  try {
    storage = typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    /* blocked */
  }
  const quality = opts.quality || new QualityTier({ storage, key: opts.storageKey || "kit.quality", env: browserEnv(renderer.getContext && renderer.getContext()), initial: opts.tier });
  if (opts.tier && !opts.quality) quality.setChoice(opts.tier);
  const look = {
    preset: preset(p), quality, monitor: new BudgetMonitor(), renderer, scene, camera,
    tier: quality.tier, lights: null, env: null, post: null, css: null, overlay: null, time: 0, onTierChange: opts.onTierChange || null,
    get passes() { return this.post ? this.post.passes : 0; },
  };
  const build = () => {
    const t = TIERS[look.tier];
    const pr = look.preset;
    setupRenderer(renderer, pr, t, { exposure: opts.exposure });
    applyFog(scene, camera, pr, t);
    if (opts.environment !== false) {
      if (look.env) look.env.dispose();
      look.env = makeEnvironment(renderer, pr.env);
      scene.environment = look.env;
      scene.environmentIntensity = pr.env ? pr.env.intensity ?? 1 : 1;
    }
    if (look.lights) look.lights.dispose();
    look.lights = buildLights(scene, pr, t);
    if (look.post) (look.post.dispose(), (look.post = null));
    if (look.css) (look.css.dispose(), (look.css = null));
    const wantPost = opts.post === "auto" || opts.post == null ? t.post : !!opts.post;
    const po = pr.post;
    if (po && wantPost) look.post = new Post(renderer, { ...po, bloom: t.bloom ? po.bloom : null });
    else if (po && t.cssPost && opts.css !== false && typeof document !== "undefined" && (po.vignette || po.grain)) look.css = new CssPost(po, { parent: opts.cssParent });
    // shadows on / off and light counts change shader programs: rebuild the materials once here
    scene.traverse((o) => {
      for (const m of [].concat(o.material || [])) m.needsUpdate = true;
    });
  };
  look.setPreset = (np) => {
    look.preset = preset(np);
    build();
  };
  look.setTier = (name) => {
    if (!TIERS[name] || name === look.tier) return;
    const before = look.tier;
    look.tier = name;
    build();
    if (look.onTierChange) look.onTierChange(name, before);
  };
  look.setChoice = (c) => {
    quality.setChoice(c);
    look.setTier(quality.tier);
  };
  look.resize = (w = innerWidth, h = innerHeight) => {
    capPixelRatio(renderer, TIERS[look.tier]);
    renderer.setSize(w, h, false);
    if (camera.isPerspectiveCamera) (camera.aspect = w / h), camera.updateProjectionMatrix();
    if (look.post) look.post.setSize();
  };
  look.update = (dt, time, focus) => {
    look.time = time ?? look.time + dt;
    look.lights.update(look.time);
    if (focus && look.lights.key) followShadow(look.lights.key, focus);
    const down = quality.sample(dt * 1000);
    if (down) look.setTier(down);
    if (look.overlay) look.overlay.update();
  };
  look.render = () => {
    // renderer.info counts the whole frame (scene + every post pass), not only the last pass
    const info = renderer.info;
    const ar = info.autoReset;
    info.autoReset = false;
    info.reset();
    if (look.post) look.post.render(scene, camera, look.time);
    else renderer.render(scene, camera);
    info.autoReset = ar;
    look.monitor.push(look._last ? performance.now() - look._last : 0, renderer);
    look._last = performance.now();
  };
  look.stats = () => sceneStats(scene, renderer, { postPasses: look.passes });
  look.check = (tierName = look.tier) => checkBudget(look.stats(), tierName);
  look.dispose = () => {
    look.lights && look.lights.dispose();
    look.post && look.post.dispose();
    look.css && look.css.dispose();
    look.env && look.env.dispose();
    look.overlay && look.overlay.dispose();
  };
  build();
  if (opts.expose !== false && typeof window !== "undefined") {
    window.__sceneStats = () => look.stats();
    window.__budget = (t) => look.check(t);
    window.__look = look;
  }
  return look;
}

// ---- settings and debug UI ----------------------------------------------------------------------
// <select> 画質: 自動（いまは 中）/ 低 / 中 / 高. Saved in localStorage by the QualityTier.
export function qualitySelect(look, o = {}) {
  const sel = document.createElement("select");
  sel.className = o.className || "kit-quality";
  sel.setAttribute("aria-label", o.label || "画質");
  const fill = () => {
    sel.innerHTML = "";
    const opts = [["auto", `自動（いまは${TIERS[look.quality.tier].label}）`], ["low", "低（軽い）"], ["mid", "中"], ["high", "高（きれい）"]];
    for (const [v, l] of opts) {
      const op = document.createElement("option");
      op.value = v;
      op.textContent = l;
      sel.appendChild(op);
    }
    sel.value = look.quality.choice;
  };
  fill();
  sel.addEventListener("change", () => {
    look.setChoice(sel.value);
    fill();
  });
  const prev = look.onTierChange;
  look.onTierChange = (n, b) => {
    fill();
    if (prev) prev(n, b);
  };
  if (o.parent) o.parent.appendChild(sel);
  return sel;
}

// a small fixed panel: fps / ms, draw calls, triangles, textures, programs, lights, against the tier's budget.
// Colours: green within, amber >= 80 %, red over. Updated twice a second from look.update().
export function debugOverlay(look, o = {}) {
  const el = document.createElement("div");
  el.className = "kit-budget";
  el.style.cssText = "position:fixed;left:8px;top:8px;z-index:50;font:11px/1.35 ui-monospace,Consolas,monospace;background:rgba(0,0,0,.72);color:#e8e8e8;padding:6px 8px;border-radius:6px;pointer-events:none;white-space:pre;max-width:calc(100vw - 16px);overflow:hidden";
  (o.parent || document.body).appendChild(el);
  let last = 0;
  const C = { ok: "#7fdc8a", warn: "#ffc857", over: "#ff6b6b" };
  const ov = {
    el,
    update(force) {
      const n = performance.now();
      if (!force && n - last < (o.every ?? 500)) return;
      last = n;
      const s = look.monitor.snapshot();
      const rep = look.check();
      const by = Object.fromEntries(rep.items.map((i) => [i.key, i]));
      const row = (label, key, v) => {
        const it = by[key];
        const c = it ? C[it.level] : "#e8e8e8";
        return `<span style="color:${c}">${label} ${v}${it && it.limit != null ? ` / ${it.limit}` : ""}</span>`;
      };
      const st = look._stats && n - look._statsT < 2000 ? look._stats : ((look._statsT = n), (look._stats = look.stats()));
      const fpsC = s.avgMs > 22 ? C.over : s.avgMs > 17.5 ? C.warn : C.ok;
      const lints = rep.items.filter((i) => i.limit == null && i.level !== "ok").map((i) => `<span style="color:${C[i.level]}">! ${i.key}</span>`);
      el.innerHTML = [
        `<b>${look.preset.name}</b> tier <b>${look.tier}</b> (${look.quality.choice}) dpr ${look.renderer.getPixelRatio()}`,
        `<span style="color:${fpsC}">${s.fps} fps  avg ${s.avgMs} ms  p95 ${s.p95Ms}</span>`,
        row("calls", "drawCalls", s.calls) + "  " + row("tris", "triangles", fmtK(s.triangles)),
        row("tex MB", "textureMB", st.textureMB) + "  " + row("max", "textureMax", st.textureMax),
        row("lights", "dynamicLights", Math.max(0, st.dynamicLights - st.shadowLights)) + "  " + row("shadow", "shadowLights", st.shadowLights) + "  " + row("post", "postPasses", look.passes),
        row("programs", "programs", s.programs) + `  geo ${s.geometries}`,
        lints.join("  "),
      ].filter(Boolean).join("\n");
    },
    dispose() {
      el.remove();
      look.overlay = null;
    },
  };
  look.overlay = ov;
  ov.update(true);
  return ov;
}
const fmtK = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}k` : String(n));

// ---- small helpers ------------------------------------------------------------------------------
// A soft round contact shadow under a character / prop (no shadow map). Shares one texture.
let blobTex = null;
export function blobShadow(radius = 0.4, opacity = 0.5) {
  if (!blobTex && typeof document !== "undefined") {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d");
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, "rgba(0,0,0,1)");
    gr.addColorStop(0.5, "rgba(0,0,0,0.55)");
    gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    blobTex = new THREE.CanvasTexture(c);
    blobTex.colorSpace = THREE.SRGBColorSpace;
  }
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 2, radius * 2),
    new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, toneMapped: false }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.005;
  m.renderOrder = 1;
  m.name = "blobShadow";
  return m;
}

// Many lamps, few real lights: n PointLights follow the lamps nearest to the player (fading when they move);
// the other lamps only glow (give them an emissive material). lamps: [[x, y, z], ...]
export class LightPool {
  constructor(scene, lamps, o = {}) {
    this.lamps = lamps;
    this.n = Math.min(o.count ?? 3, lamps.length);
    this.intensity = o.intensity ?? 20;
    this.every = o.every ?? 0.25;
    this.t = this.every;
    this.lights = Array.from({ length: this.n }, () => {
      const l = new THREE.PointLight(col(o.color ?? 0xffd2a0), 0, o.distance ?? 8, 2);
      l.userData = { lamp: -1, want: -1, k: 0 };
      scene.add(l);
      return l;
    });
  }
  update(dt, pos) {
    this.t += dt;
    if (this.t >= this.every) {
      this.t = 0;
      const want = nearestLamps(this.lamps, [pos.x, pos.y, pos.z], this.n);
      const free = this.lights.filter((l) => !want.includes(l.userData.lamp));
      for (const w of want) if (!this.lights.some((l) => l.userData.lamp === w || l.userData.want === w)) { const l = free.shift(); if (l) l.userData.want = w; }
    }
    for (const l of this.lights) {
      const u = l.userData;
      if (u.want >= 0 && u.want !== u.lamp) {
        u.k = Math.max(0, u.k - dt * 6);
        if (u.k === 0) (u.lamp = u.want), l.position.set(...this.lamps[u.lamp]);
      } else if (u.lamp >= 0) u.k = Math.min(1, u.k + dt * 6);
      l.intensity = this.intensity * u.k;
    }
  }
  dispose() {
    this.lights.forEach((l) => (l.parent && l.parent.remove(l), l.dispose()));
  }
}
