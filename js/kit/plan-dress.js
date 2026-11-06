/* game-kit 1b8c7db: js/plan-dress.js — edit in game-kit and run tools/kit-sync.js */
// Set dressing for a world built from a plan (standard 1.11, from 五人分の朝 2026-11-05: 「3Dデザインをこだわって」 - the plan's rooms were
// clean, bare boxes). game.json "dress": true | { "skirting": true, "band": ["hospital", "corridor"], "pipes": true, "stains": true,
//   "drains": ["bathroom", "workshop", "hospital"], "ceilingStains": true, "bandColor": "#6f7d76" }
// Per room: skirting along the walls; a painted lower band with a dado line (room types in "band"; corridors count as "corridor"); pipes with
// brackets along corridor ceilings; water stains running down from the ceiling and ceiling stains; a floor drain (room types in "drains").
// Door gaps are kept clear (no band or stain over a door). Everything is instanced (a handful of draw calls), built before the warm-up.
const rnd = (seed) => { let s = 0; for (const c of String(seed)) s = (s * 31 + c.charCodeAt(0)) >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };
export const dressConfig = (v) => (v ? { skirting: true, band: ['hospital', 'corridor'], pipes: true, stains: true, drains: ['bathroom', 'workshop', 'hospital'], ceilingStains: true, bandColor: '#6f7d76', ...(typeof v === 'object' ? v : {}) } : null);

/** the gaps (door openings) on one wall of a room, as [from, to] along the wall */
export function wallGaps(plan, room, wall, pad = 0.12) {
  return (plan.doors || []).filter((d) => (d.a === room.id || d.b === room.id) && d.x != null && d.z != null && Math.abs((wall.ax === 'x' ? d.z : d.x) - wall.at) < 0.4)
    .map((d) => { const c = wall.ax === 'x' ? d.x : d.z, half = (d.width || 1) / 2 + pad; return [c - half, c + half]; }).sort((p, q) => p[0] - q[0]);
}
/** a wall from a to b minus its gaps -> the solid stretches */
export function solidStretches(a, b, gaps, end = 0.05) {
  const segs = []; let s0 = a + end;
  for (const [g0, g1] of gaps) { if (g0 > s0) segs.push([s0, g0]); s0 = Math.max(s0, g1); }
  if (b - end > s0) segs.push([s0, b - end]);
  return segs.filter(([p, q]) => q - p >= 0.2);
}

function stainTexture(T) {
  const W = 128, H = 256, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'), r = rnd('stain');
  const top = g.createLinearGradient(0, 0, 0, 60); top.addColorStop(0, 'rgba(40,34,22,.75)'); top.addColorStop(1, 'rgba(40,34,22,0)');
  g.fillStyle = top; g.fillRect(0, 0, W, 60);
  for (let i = 0; i < 26; i++) {
    const x = 6 + r() * (W - 12), len = 60 + r() * (H - 70), w = 1 + r() * 4;
    const gr = g.createLinearGradient(0, 0, 0, len); gr.addColorStop(0, `rgba(36,30,20,${0.35 + r() * 0.4})`); gr.addColorStop(1, 'rgba(36,30,20,0)');
    g.fillStyle = gr; g.beginPath(); g.moveTo(x - w, 0); g.quadraticCurveTo(x + (r() - 0.5) * 6, len * 0.6, x, len); g.quadraticCurveTo(x + (r() - 0.5) * 6, len * 0.6, x + w, 0); g.fill();
  }
  const id = g.getImageData(0, 0, W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) id.data[(y * W + x) * 4 + 3] *= Math.min(1, Math.min(x, W - 1 - x) / 22);
  g.putImageData(id, 0, 0);
  const t = new T.CanvasTexture(c); if (T.SRGBColorSpace) t.colorSpace = T.SRGBColorSpace; return t;
}

/** build the dressing; o = dressConfig(...) plus { wallH, inset, floorY(floor) } -> { group, count } */
export function buildPlanDress(T, scene, plan, o0 = {}) {
  const o = { ...dressConfig(true), wallH: 3, inset: 0.09, floorY: (f) => (f || 0) * 3.4, ...o0 };
  const group = new T.Group(); group.name = 'kit:dress';
  const lists = { skirt: [], band: [], line: [], pipe: [], pipe2: [], bracket: [], stain: [], drain: [], ceil: [] };
  const E = new T.Euler(), Q = new T.Quaternion();
  const put = (list, x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) => { E.set(rx, ry, rz); Q.setFromEuler(E); list.push(new T.Matrix4().compose(new T.Vector3(x, y, z), Q.clone(), new T.Vector3(sx, sy, sz))); };
  const H = o.wallH;
  for (const r of plan.rooms || []) {
    if (r.kind === 'stairs' || r.kind === 'outside' || r.dress === false) continue;
    const R = rnd(r.id), y0 = o.floorY(r.floor || 0), corridor = r.kind === 'corridor' || r.type === 'corridor';
    const kinds = new Set([r.type, corridor ? 'corridor' : null]);
    const painted = (o.band || []).some((t) => kinds.has(t));
    const walls = [
      { ax: 'x', at: r.z, a: r.x, b: r.x + r.w, n: 1 }, { ax: 'x', at: r.z + r.d, a: r.x, b: r.x + r.w, n: -1 },
      { ax: 'z', at: r.x, a: r.z, b: r.z + r.d, n: 1 }, { ax: 'z', at: r.x + r.w, a: r.z, b: r.z + r.d, n: -1 },
    ];
    for (const w of walls) {
      const gaps = wallGaps(plan, r, w), off = w.at + w.n * o.inset;
      for (const [a, b] of solidStretches(w.a, w.b, gaps)) {
        const L = b - a, c = (a + b) / 2;
        const at = (y, thick, h, list, lift = 0) => (w.ax === 'x' ? put(list, c, y0 + y, off + w.n * lift, L, h, thick) : put(list, off + w.n * lift, y0 + y, c, thick, h, L));
        if (o.skirting) at(0.06, 0.03, 0.12, lists.skirt);
        if (painted) { at(0.62, 0.008, 1.0, lists.band); at(1.13, 0.02, 0.035, lists.line, 0.01); }
      }
      if (o.stains) {
        const n = corridor ? Math.round((w.b - w.a) / 9) : 1 + Math.floor(R() * 2);
        for (let i = 0; i < n; i++) {
          const sw = 0.6 + R() * 0.9, sh = 1.2 + R() * 1.2, c = w.a + 0.6 + R() * Math.max(0, w.b - w.a - 1.2);
          if (gaps.some(([g0, g1]) => c + sw / 2 > g0 - 0.1 && c - sw / 2 < g1 + 0.1)) continue;
          const y = y0 + H - sh / 2 - 0.02, d = w.at + w.n * (o.inset + 0.004 + i * 0.0005);
          if (w.ax === 'x') put(lists.stain, c, y, d, sw, sh, 1, 0, w.n > 0 ? 0 : Math.PI, 0);
          else put(lists.stain, d, y, c, sw, sh, 1, 0, w.n > 0 ? Math.PI / 2 : -Math.PI / 2, 0);
        }
      }
    }
    if (o.pipes && corridor) {
      const long = r.w >= r.d, L = long ? r.w : r.d, side = 0.32;
      for (const [list, rad, y, dz] of [[lists.pipe, 0.055, H - 0.22, side], [lists.pipe2, 0.035, H - 0.34, side + 0.16]]) {
        if (long) put(list, r.x + L / 2, y0 + y, r.z + dz, rad, L - 0.1, rad, 0, 0, Math.PI / 2);
        else put(list, r.x + dz, y0 + y, r.z + L / 2, rad, L - 0.1, rad, Math.PI / 2, 0, 0);
      }
      for (let t = 1; t < L - 0.5; t += 2) {
        if (long) put(lists.bracket, r.x + t, y0 + H - 0.2, r.z + side + 0.08, 0.04, 0.4, 0.42);
        else put(lists.bracket, r.x + side + 0.08, y0 + H - 0.2, r.z + t, 0.42, 0.4, 0.04);
      }
    }
    if ((o.drains || []).includes(r.type)) put(lists.drain, r.x + r.w * (0.3 + R() * 0.4), y0 + 0.006, r.z + r.d * (0.3 + R() * 0.4), 0.42, 0.42, 1, -Math.PI / 2, 0, 0);
    if (o.ceilingStains) for (let i = 0; i < (corridor ? 2 : 1); i++) put(lists.ceil, r.x + 1 + R() * Math.max(0, r.w - 2), y0 + H - 0.012, r.z + 1 + R() * Math.max(0, r.d - 2), 1.2 + R() * 1.6, 0.9 + R() * 1.2, 1, Math.PI / 2, 0, R() * 3);
  }
  const count = Object.fromEntries(Object.entries(lists).map(([k, v]) => [k, v.length]));
  if (typeof document === 'undefined') return { group, count };   // node tests: the layout only
  const stain = stainTexture(T);
  const drainTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#1b1d1d'; g.beginPath(); g.arc(32, 32, 31, 0, 7); g.fill(); g.fillStyle = '#050606'; for (let i = 0; i < 6; i++) g.fillRect(14, 12 + i * 7, 36, 3.5); return new T.CanvasTexture(c); })();
  const decal = { transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 };
  const mats = {
    skirt: new T.MeshStandardMaterial({ color: 0x2b2e2c, roughness: 0.7 }),
    band: new T.MeshStandardMaterial({ color: new T.Color(o.bandColor), roughness: 0.55 }),
    line: new T.MeshStandardMaterial({ color: 0x3e4a45, roughness: 0.6 }),
    pipe: new T.MeshStandardMaterial({ color: 0x55504a, roughness: 0.45, metalness: 0.6 }),
    pipe2: new T.MeshStandardMaterial({ color: 0x6b4b36, roughness: 0.6, metalness: 0.4 }),
    bracket: new T.MeshStandardMaterial({ color: 0x2f3231, roughness: 0.6, metalness: 0.5 }),
    stain: new T.MeshStandardMaterial({ map: stain, roughness: 0.9, ...decal }),
    drain: new T.MeshStandardMaterial({ map: drainTex, roughness: 0.4, metalness: 0.6, ...decal }),
    ceil: new T.MeshStandardMaterial({ map: stain, opacity: 0.55, roughness: 0.9, ...decal }),
  };
  const box = new T.BoxGeometry(1, 1, 1), plane = new T.PlaneGeometry(1, 1), cyl = new T.CylinderGeometry(1, 1, 1, 10, 1, true);
  const geo = { skirt: box, band: box, line: box, pipe: cyl, pipe2: cyl, bracket: box, stain: plane, drain: plane, ceil: plane };
  for (const [k, list] of Object.entries(lists)) {
    if (!list.length) continue;
    const im = new T.InstancedMesh(geo[k], mats[k], list.length); im.name = `dress:${k}`;
    list.forEach((m, i) => im.setMatrixAt(i, m)); im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere();
    im.receiveShadow = k !== 'stain' && k !== 'ceil';
    group.add(im);
  }
  scene.add(group);
  return { group, count };
}
