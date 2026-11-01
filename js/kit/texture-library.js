/* game-kit 6e0b6f0: js/texture-library.js — edit in game-kit and run tools/kit-sync.js */
// Shared rough textures for Game-fleet: load surfaces and decals from assets/textures/catalog.json by id,
// category or tag, lazily (an image is fetched the first time it is asked for), with the repeat in metres,
// sRGB colour, anisotropy and mipmaps set; decals with alpha and polygonOffset; footprint trails; "aged room"
// kits (dust, grime, cobwebs, stains) for rooms that should look closed for years. See docs/textures.md.
//
//   import { TextureLibrary } from "./kit/texture-library.js";
//   const tex = await TextureLibrary.load("assets/textures/", { renderer });
//   floor.material = tex.material("tatami_old", { size: [3.6, 2.7] });      // repeat from the floor size in m
//   wall.material = tex.material("plaster_yellowed", { triplanar: true });  // world-space mapping, any mesh
//   scene.add(tex.decal("stain_ceiling", { position: [1, 2.6, 0], normal: [0, -1, 0] }));
//   scene.add(tex.footprintTrail([[0, 0], [2, 1], [4, 1]], { id: "fp_shoe_mud" }));
//   scene.add(tex.agedRoom({ min: [0, 0, 0], max: [4, 2.6, 3] }, { kit: "aged_closed", seed: 3 }));
//   await tex.preload(["tatami_old", "kit:aged_closed"]); tex.prewarm(renderer);  // before play (no hitches)
import * as THREE from "three";

// ------------------------------------------------------------------------------------------- pure helpers
/** a small deterministic random number generator (mulberry32) */
export function rand(seed = 1) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** ids of the catalog matching a query: "id", "category:tile", "tag:aged", "kit:aged_closed", "type:decal", "*",
 *  or an array of those (union) */
export function selectIds(catalog, query) {
  const all = catalog.textures || [];
  const qs = Array.isArray(query) ? query : [query];
  const out = new Set();
  for (const q of qs) {
    if (!q) continue;
    if (q === "*") all.forEach((e) => out.add(e.id));
    else if (q.startsWith("category:")) all.filter((e) => e.category === q.slice(9)).forEach((e) => out.add(e.id));
    else if (q.startsWith("tag:")) all.filter((e) => (e.tags || []).includes(q.slice(4))).forEach((e) => out.add(e.id));
    else if (q.startsWith("type:")) all.filter((e) => e.type === q.slice(5)).forEach((e) => out.add(e.id));
    else if (q.startsWith("kit:")) kitIds(catalog, q.slice(4)).forEach((id) => out.add(id));
    else if (all.some((e) => e.id === q)) out.add(q);
  }
  return [...out];
}

/** every decal id an aged-room kit may place */
export function kitIds(catalog, kit) {
  const k = (catalog.kits || {})[kit];
  return k ? [...new Set(k.items.flatMap((it) => it.ids))] : [];
}

/** texture repeat [u, v] for a surface of width x height metres (entry.repeat = metres per tile) */
export function repeatFor(entry, width, height) {
  const r = entry.repeat || entry.meters || [1, 1];
  return [width / r[0], height / r[1]];
}

/**
 * Where an aged-room kit puts its decals in an axis-aligned room (pure; agedRoom() turns it into meshes).
 * box = { min: [x, y, z], max: [x, y, z] } (floor at min.y, ceiling at max.y).
 * opts: kit, seed, intensity (0..1 scales counts, default 1), walls (which walls exist: subset of
 * ["-x", "+x", "-z", "+z"], default all), path ([[x, z], ...]: footprints walked through the room; trail = their
 * id when the kit has none, default fp_shoe_dust), have (Set of ids that exist).
 * Each placement: { id, at: [x, y, z], normal: [x, y, z], up: [x, y, z], w, h, repeatU, flip }
 */
export function planAgedRoom(catalog, box, opts = {}) {
  const kit = (catalog.kits || {})[opts.kit || "aged_closed"];
  if (!kit) throw new Error(`no kit ${opts.kit}`);
  const byId = new Map((catalog.textures || []).map((e) => [e.id, e]));
  const R = rand(opts.seed ?? 1);
  const pick = (ids) => {
    const ok = ids.filter((id) => byId.has(id) && (!opts.have || opts.have.has(id)));
    return ok.length ? ok[Math.floor(R() * ok.length)] : null;
  };
  const k = opts.intensity ?? 1;
  const [x0, y0, z0] = box.min;
  const [x1, y1, z1] = box.max;
  const eps = 0.003;
  const walls = [
    { name: "-x", n: [1, 0, 0], a: [x0, z1], b: [x0, z0] },
    { name: "+x", n: [-1, 0, 0], a: [x1, z0], b: [x1, z1] },
    { name: "-z", n: [0, 0, 1], a: [x0, z0], b: [x1, z0] },
    { name: "+z", n: [0, 0, -1], a: [x1, z1], b: [x0, z1] },
  ].filter((w) => !opts.walls || opts.walls.includes(w.name));
  const corners = [
    [x0, z0, [1, 0, 0], [0, 0, 1]],
    [x1, z0, [-1, 0, 0], [0, 0, 1]],
    [x1, z1, [-1, 0, 0], [0, 0, -1]],
    [x0, z1, [1, 0, 0], [0, 0, -1]],
  ];
  const out = [];
  const size = (e, s = 1) => [e.meters[0] * s, e.meters[1] * s];
  const wallLen = (w) => Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
  // a point along a wall (t in 0..1 from a to b) at height y, pushed off the face
  const onWall = (w, t, y) => [w.a[0] + (w.b[0] - w.a[0]) * t + w.n[0] * eps, y, w.a[1] + (w.b[1] - w.a[1]) * t + w.n[2] * eps];
  const items = [...kit.items];
  // a path given to a kit without footprints: someone walked through (opts.trail = the footprint id)
  if (opts.path && !items.some((it) => it.where === "path")) items.push({ ids: [opts.trail || "fp_shoe_dust"], where: "path" });
  for (const it of items) {
    const count = it.count != null ? Math.max(it.count > 0 ? 1 : 0, Math.round(it.count * k)) : 0;
    switch (it.where) {
      case "wall-bottom":
      case "wall-top":
        for (const w of walls) {
          const id = pick(it.ids);
          if (!id) continue;
          const e = byId.get(id);
          const L = wallLen(w);
          const h = Math.min(e.meters[1], (y1 - y0) * 0.5);
          const y = it.where === "wall-bottom" ? y0 + h / 2 : y1 - h / 2;
          out.push({ id, at: onWall(w, 0.5, y), normal: w.n, up: [0, 1, 0], w: L, h, repeatU: L / e.meters[0], flip: false });
        }
        break;
      case "floor-edge":
        for (const w of walls) {
          const id = pick(it.ids);
          if (!id) continue;
          const e = byId.get(id);
          const L = wallLen(w);
          const h = e.meters[1];
          const c = onWall(w, 0.5, y0 + eps);
          out.push({ id, at: [c[0] + w.n[0] * h / 2, y0 + eps, c[2] + w.n[2] * h / 2], normal: [0, 1, 0], up: w.n.map((v) => -v), w: L, h, repeatU: L / e.meters[0], flip: false });
        }
        break;
      case "floor-corner":
      case "ceiling-corner":
      case "wall-corner": {
        const order = corners.map((c, i) => [R(), i]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
        for (let i = 0; i < Math.min(count, 4); i++) {
          const id = pick(it.ids);
          if (!id) continue;
          const e = byId.get(id);
          const [cx, cz, nx, nz] = corners[order[i]];
          const s = 0.8 + R() * 0.4;
          const [w, h] = size(e, s);
          if (it.where === "floor-corner") {
            // picture top-left in the corner: up points at one wall, left at the other
            const up = nz.map((v) => -v);
            const right = cross(up, [0, 1, 0]);
            const flip = dot(right, nx) < 0; // left must point at the x wall: right along +nx
            out.push({ id, at: [cx + nx[0] * w / 2, y0 + eps, cz + nz[2] * h / 2], normal: [0, 1, 0], up, w, h, flip });
          } else {
            // on the wall whose normal is nz (an x-running wall), top at the ceiling, left side in the corner
            const n = nz;
            const right = cross([0, 1, 0], n);
            const flip = dot(right, nx) < 0;
            const hh = Math.min(h, (y1 - y0) * 0.6);
            out.push({ id, at: [cx + nx[0] * w / 2, y1 - hh / 2, cz + n[2] * eps], normal: n, up: [0, 1, 0], w, h: hh, flip });
          }
        }
        break;
      }
      case "floor":
      case "ceiling":
        for (let i = 0; i < count; i++) {
          const id = pick(it.ids);
          if (!id) continue;
          const e = byId.get(id);
          let [w, h] = size(e, 0.8 + R() * 0.5);
          // turned any way, it must stay off the walls: shrink it in a small room
          const fit = Math.min(1, (Math.min(x1 - x0, z1 - z0) - 0.1) / Math.hypot(w, h));
          w *= fit;
          h *= fit;
          const m = Math.hypot(w, h) / 2 + 0.02;
          const x = x0 + m + R() * Math.max(0, x1 - x0 - 2 * m);
          const z = z0 + m + R() * Math.max(0, z1 - z0 - 2 * m);
          const a = R() * Math.PI * 2;
          const up = [Math.sin(a), 0, Math.cos(a)];
          if (it.where === "floor") out.push({ id, at: [x, y0 + eps * (2 + i), z], normal: [0, 1, 0], up, w, h, flip: R() < 0.5 });
          else out.push({ id, at: [x, y1 - eps * (2 + i), z], normal: [0, -1, 0], up, w, h, flip: R() < 0.5 });
        }
        break;
      case "wall":
        for (let i = 0; i < count && walls.length; i++) {
          const id = pick(it.ids);
          if (!id) continue;
          const e = byId.get(id);
          const w0 = walls[Math.floor(R() * walls.length)];
          const [w, h] = size(e, 0.8 + R() * 0.4);
          const L = wallLen(w0);
          if (L < w + 0.2) continue;
          const t = (w / 2 + 0.1 + R() * (L - w - 0.2)) / L;
          const tagTop = (e.anchor || "").includes("source at the top");
          const y = tagTop ? y1 - h / 2 - 0.02 : y0 + 0.4 + h / 2 + R() * Math.max(0, y1 - y0 - h - 0.6);
          out.push({ id, at: onWall(w0, t, Math.min(y, y1 - h / 2)), normal: w0.n, up: [0, 1, 0], w, h, flip: R() < 0.5 });
        }
        break;
      case "path":
        if (opts.path && opts.path.length > 1) {
          const id = pick(it.ids);
          if (id) for (const p of trailSteps(opts.path, { seed: opts.seed })) out.push({ id, at: [p.x, y0 + eps * 3, p.z], normal: [0, 1, 0], up: p.up, w: byId.get(id).meters[0], h: byId.get(id).meters[1], flip: !p.right });
        }
        break;
      default:
        break;
    }
  }
  return out;
}

/** footprint positions along a polyline [[x, z], ...]: { x, z, up: [dx, 0, dz], right } every stride metres,
 *  left / right feet offset by half the step width */
export function trailSteps(path, opts = {}) {
  const stride = opts.stride ?? 0.38;
  const half = (opts.stepWidth ?? 0.18) / 2;
  const R = rand(opts.seed ?? 7);
  const out = [];
  let carry = opts.start ?? 0.1;
  let right = true;
  for (let i = 0; i + 1 < path.length; i++) {
    const [ax, az] = path[i];
    const [bx, bz] = path[i + 1];
    const L = Math.hypot(bx - ax, bz - az);
    if (L < 1e-6) continue;
    const dx = (bx - ax) / L;
    const dz = (bz - az) / L;
    for (let s = carry; s <= L; s += stride) {
      const side = right ? 1 : -1;
      // right of the walking direction (dx, dz) seen from above (+y) is (-dz, dx)
      const jitter = (R() - 0.5) * 0.04;
      const a = (R() - 0.5) * 0.2 + side * 0.08;
      const ux = dx * Math.cos(a) - dz * Math.sin(a);
      const uz = dx * Math.sin(a) + dz * Math.cos(a);
      out.push({ x: ax + dx * s - dz * side * (half + jitter), z: az + dz * s + dx * side * (half + jitter), up: [ux, 0, uz], right });
      right = !right;
      carry = s + stride - L;
    }
    if (carry < 0) carry = 0;
  }
  return out;
}

function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

// ------------------------------------------------------------------------------------------- shader helpers
/** world-space (triplanar) mapping for a material with a map: no UVs needed, no stretching on any face.
 *  scale = metres per tile (default: the catalog repeat of the map) */
export function triplanar(material, scale = 1, sharpness = 4) {
  const s = Array.isArray(scale) ? scale : [scale, scale];
  material.onBeforeCompile = (sh) => {
    sh.uniforms.triScale = { value: new THREE.Vector2(1 / s[0], 1 / s[1]) };
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vTriPos;\nvarying vec3 vTriNrm;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvTriPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvTriNrm = normalize(mat3(modelMatrix) * objectNormal);");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vTriPos;\nvarying vec3 vTriNrm;\nuniform vec2 triScale;")
      .replace(
        "#include <map_fragment>",
        `#ifdef USE_MAP
  vec3 triW = pow(abs(normalize(vTriNrm)), vec3(${sharpness.toFixed(1)}));
  triW /= (triW.x + triW.y + triW.z);
  vec4 sampledDiffuseColor = texture2D(map, vTriPos.zy * triScale) * triW.x + texture2D(map, vTriPos.xz * triScale) * triW.y + texture2D(map, vTriPos.xy * triScale) * triW.z;
  diffuseColor *= sampledDiffuseColor;
#endif`,
      );
  };
  material.customProgramCacheKey = () => `triplanar${sharpness}`;
  material.needsUpdate = true;
  return material;
}

/** a different part of the texture on each mesh (offset, and a quarter turn when allowed): breaks the
 *  "same stain in every room" look without any shader */
export function vary(texture, seed, { rotate = false } = {}) {
  const R = rand(seed);
  texture.offset.set(R(), R());
  if (rotate) {
    texture.center.set(0.5, 0.5);
    texture.rotation = Math.floor(R() * 4) * (Math.PI / 2);
  }
  return texture;
}

// ------------------------------------------------------------------------------------------- the library
const UNIT = { plain: null, flip: null };
function unitPlane(flip) {
  const k = flip ? "flip" : "plain";
  if (!UNIT[k]) {
    const g = new THREE.PlaneGeometry(1, 1);
    if (flip) {
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
    }
    UNIT[k] = g;
  }
  return UNIT[k];
}

export class TextureLibrary {
  /** fetch catalog.json from base (a folder URL ending in "/") and make the library */
  static async load(base = "assets/textures/", opts = {}) {
    const url = new URL("catalog.json", new URL(base, typeof location !== "undefined" ? location.href : "file:///"));
    const res = await fetch(url);
    if (!res.ok) throw new Error(`texture catalog ${url}: ${res.status}`);
    return new TextureLibrary({ ...opts, base, catalog: await res.json() });
  }

  /** opts: base (folder of catalog.json), catalog (the parsed JSON), renderer (for the max anisotropy),
   *  anisotropy (default 8, capped by the GPU) */
  constructor({ base = "assets/textures/", catalog, renderer = null, anisotropy = 8 } = {}) {
    if (!catalog) throw new Error("TextureLibrary needs a catalog (use TextureLibrary.load)");
    this.base = base.endsWith("/") ? base : base + "/";
    this.catalog = catalog;
    this.byId = new Map(catalog.textures.map((e) => [e.id, e]));
    this.anisotropy = renderer ? Math.min(anisotropy, renderer.capabilities.getMaxAnisotropy()) : anisotropy;
    this._src = new Map(); // id -> { tex, loaded, promise, users: Set }
    this._mats = new Map();
    this.onError = (id, err) => console.warn(`texture ${id}: ${err && err.message ? err.message : err}`);
  }

  has(id) {
    return this.byId.has(id);
  }
  entry(id) {
    const e = this.byId.get(id);
    if (!e) throw new Error(`no texture "${id}" in the catalog`);
    return e;
  }
  /** ids by query (see selectIds): "category:metal", "tag:aged", "kit:aged_closed", "type:decal", "*" */
  ids(query = "*") {
    return selectIds(this.catalog, query);
  }
  categories() {
    return { ...(this.catalog.categories || {}) };
  }
  url(id) {
    return this.base + this.entry(id).file;
  }

  /** the shared source texture of an id (fetched on first use; a 1x1 grey stands in until it arrives) */
  _source(id) {
    let s = this._src.get(id);
    if (s) return s;
    const e = this.entry(id);
    const tex = new THREE.Texture(placeholder());
    tex.name = id;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = this.anisotropy;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    if (e.tileable === true) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    else if (e.tileable === "x") {
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
    } else tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
    s = { tex, loaded: false, users: new Set([tex]) };
    s.promise = new Promise((resolve) => {
      new THREE.ImageLoader().load(
        this.url(id),
        (image) => {
          // WebGL2 texture storage is immutable: the GPU copy of the 1x1 placeholder cannot take the real size
          // (the upload would fail silently and the grey would stay), so free it and give the real image a new Source
          const src = new THREE.Source(image);
          s.loaded = true;
          for (const t of s.users) {
            t.dispose();
            t.source = src;
            t.needsUpdate = true;
          }
          resolve(tex);
        },
        undefined,
        (err) => {
          this.onError(id, err);
          resolve(tex);
        },
      );
    });
    this._src.set(id, s);
    return s;
  }

  /** a texture for one use: its own repeat / offset / rotation, the image shared with every other use.
   *  opts: size [w, h] metres of the surface (repeat from the catalog), repeat [u, v] (wins over size),
   *  offset [u, v], rotation (radians, about the centre), vary (seed: random offset), colorSpace */
  texture(id, opts = {}) {
    const s = this._source(id);
    const t = s.tex.clone();
    s.users.add(t);
    const e = this.entry(id);
    if (opts.repeat) t.repeat.set(opts.repeat[0], opts.repeat[1]);
    else if (opts.size) t.repeat.set(...repeatFor(e, opts.size[0], opts.size[1]));
    if (opts.offset) t.offset.set(opts.offset[0], opts.offset[1]);
    if (opts.rotation) {
      t.center.set(0.5, 0.5);
      t.rotation = opts.rotation;
    }
    if (opts.vary != null) vary(t, opts.vary, { rotate: !!opts.rotate });
    if (opts.colorSpace) t.colorSpace = opts.colorSpace;
    return t;
  }

  /** resolves when the image of id is in (the texture is usable before that, grey) */
  whenLoaded(id) {
    return this._source(id).promise;
  }

  /** fetch every texture of a query now (e.g. at the loading screen); resolves when all are in */
  preload(query) {
    return Promise.all(this.ids(query).map((id) => this._source(id).promise));
  }

  /** upload every loaded texture to the GPU now (call before play so nothing uploads mid-game) */
  prewarm(renderer) {
    let n = 0;
    for (const s of this._src.values()) if (s.loaded) for (const t of s.users) (renderer.initTexture(t), n++);
    return n;
  }

  /** a MeshStandardMaterial with the texture and the catalog's roughness / metalness.
   *  opts: the texture() options plus color, roughness, metalness, side, triplanar (true or metres per tile),
   *  transparent, alphaTest, and any other material parameters in opts.params */
  material(id, opts = {}) {
    const e = this.entry(id);
    const map = this.texture(id, opts);
    const m = new THREE.MeshStandardMaterial({
      map,
      color: opts.color ?? 0xffffff,
      roughness: opts.roughness ?? e.roughness ?? 0.85,
      metalness: opts.metalness ?? e.metalness ?? 0,
      side: opts.side ?? THREE.FrontSide,
      transparent: opts.transparent ?? false,
      alphaTest: opts.alphaTest ?? (e.alpha && e.type === "surface" ? 0.5 : 0),
      ...(opts.params || {}),
    });
    m.name = id;
    if (opts.triplanar) triplanar(m, opts.triplanar === true ? e.repeat || [1, 1] : opts.triplanar);
    return m;
  }

  /** the shared decal material of an id (+ a u repeat for long strips) */
  decalMaterial(id, { repeatU = 1, opacity = 1, color = 0xffffff, roughness, layer = 0 } = {}) {
    const key = `${id}|${repeatU.toFixed(2)}|${opacity}|${color}|${roughness}|${layer}`;
    let m = this._mats.get(key);
    if (m) return m;
    const e = this.entry(id);
    const map = this.texture(id, { repeat: [repeatU, 1] });
    m = new THREE.MeshStandardMaterial({
      map,
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      roughness: roughness ?? e.roughness ?? 0.9,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: -2 - layer,
      polygonOffsetUnits: -4 - layer * 2,
    });
    m.name = `decal:${id}`;
    this._mats.set(key, m);
    return m;
  }

  /**
   * A flat decal mesh lying on a surface.
   * opts: position [x, y, z] (on the surface), normal [x, y, z] (out of the surface, default up),
   * up [x, y, z] (where the top of the picture points, in the surface; default +y on walls, -z on floors),
   * angle (extra turn about the normal), width / height in metres (default the catalog meters),
   * scale, flip (mirror), repeatU, opacity, color, roughness, layer (stacking order), offset (metres off the
   * surface, default 0.003)
   */
  decal(id, opts = {}) {
    const e = this.entry(id);
    const n = new THREE.Vector3(...(opts.normal || [0, 1, 0])).normalize();
    let up = opts.up ? new THREE.Vector3(...opts.up) : Math.abs(n.y) > 0.9 ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(0, 1, 0);
    up.addScaledVector(n, -up.dot(n)).normalize();
    if (opts.angle) up.applyAxisAngle(n, opts.angle);
    const right = new THREE.Vector3().crossVectors(up, n).normalize();
    const sc = opts.scale ?? 1;
    const w = (opts.width ?? e.meters?.[0] ?? 1) * sc;
    const h = (opts.height ?? e.meters?.[1] ?? 1) * sc;
    const mesh = new THREE.Mesh(unitPlane(!!opts.flip), this.decalMaterial(id, opts));
    mesh.matrixAutoUpdate = false;
    const basis = new THREE.Matrix4().makeBasis(right, up, n);
    const pos = new THREE.Vector3(...(opts.position || [0, 0, 0])).addScaledVector(n, opts.offset ?? 0.003);
    mesh.matrix.copy(basis).scale(new THREE.Vector3(w, h, 1)).setPosition(pos);
    mesh.position.copy(pos);
    mesh.renderOrder = 1 + (opts.layer || 0);
    mesh.name = `decal:${id}`;
    mesh.userData.decal = id;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    return mesh;
  }

  /** footprints along a path [[x, z], ...] at floor height y: a Group of decals (left feet mirrored).
   *  opts: id (default fp_shoe_dust), y, stride, stepWidth, seed, fade (0..1: the last prints this faint),
   *  scale, opacity */
  footprintTrail(path, opts = {}) {
    const id = opts.id || "fp_shoe_dust";
    const g = new THREE.Group();
    g.name = `trail:${id}`;
    const steps = trailSteps(path, opts);
    const fade = opts.fade ?? 0;
    steps.forEach((p, i) => {
      const op = (opts.opacity ?? 1) * (1 - (fade * i) / Math.max(1, steps.length - 1));
      g.add(this.decal(id, { position: [p.x, (opts.y ?? 0) + 0.002 * (i % 3), p.z], normal: [0, 1, 0], up: p.up, flip: !p.right, scale: opts.scale, opacity: Math.round(op * 8) / 8, layer: 2 }));
    });
    return g;
  }

  /** decals of an aged-room kit for an axis-aligned room box { min, max } (see planAgedRoom for opts) */
  agedRoom(box, opts = {}) {
    const g = new THREE.Group();
    g.name = `aged:${opts.kit || "aged_closed"}`;
    const plan = planAgedRoom(this.catalog, box, opts);
    plan.forEach((p, i) => {
      const e = this.entry(p.id);
      const layer = e.category === "decal-footprint" ? 2 : e.category === "decal-cobweb" ? 3 : i % 2;
      g.add(this.decal(p.id, { position: p.at, normal: p.normal, up: p.up, width: p.w, height: p.h, repeatU: p.repeatU || 1, flip: p.flip, opacity: opts.opacity, layer }));
    });
    g.userData.plan = plan;
    return g;
  }

  dispose() {
    for (const s of this._src.values()) for (const t of s.users) t.dispose();
    for (const m of this._mats.values()) m.dispose();
    this._src.clear();
    this._mats.clear();
  }
}

let _ph = null;
function placeholder() {
  if (_ph) return _ph;
  if (typeof document !== "undefined") {
    const c = document.createElement("canvas");
    c.width = c.height = 1;
    const x = c.getContext("2d");
    x.fillStyle = "#808080";
    x.fillRect(0, 0, 1, 1);
    _ph = c;
  } else _ph = { width: 1, height: 1, data: new Uint8Array([128, 128, 128, 255]) };
  return _ph;
}
