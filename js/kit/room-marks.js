/* game-kit 1b8c7db: js/room-marks.js — edit in game-kit and run tools/kit-sync.js */
// Every room its own face (standard 1.12, from 五人分の朝: 「各部屋が似通っていて分かりずらい。大きな特徴をみんなつける」).
// game.json "roomMarks": { "<room id>": { "color": "#4f86c0", "label": "冷蔵前室", "guide": true, "hazard": true, "sign": false, "band": false } }
//   color   a faintly lit painted band along the room's walls (door gaps stay clear) and the colour of its sign
//   label   the sign's text (default: the room's name without its （...）);  sign: false = no sign;  band: false = sign only
//   guide   two painted lines along the floor of a corridor;  hazard   yellow and black stripes instead of the band
// Doors between a listed room and a corridor get a two-sided sign hanging out into the corridor and a flat plate on the room side. A plan world only.
import { wallGaps, solidStretches } from './plan-dress.js';

function signTexture(T, name, color) {
  const W = 512, H = 160, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  g.fillStyle = '#f4f2ea'; g.fillRect(0, 0, W, H);
  g.fillStyle = color; g.fillRect(0, 0, 96, H); g.fillRect(0, H - 12, W, 12);
  g.fillStyle = '#ffffff'; g.beginPath(); g.arc(48, 70, 22, 0, 7); g.fill();
  g.fillStyle = '#1b1e1f'; g.font = `700 ${name.length > 4 ? 66 : 78}px "Hiragino Sans","Yu Gothic","Meiryo",sans-serif`; g.textBaseline = 'middle';
  g.fillText(name, 120, 74, W - 140);
  g.strokeStyle = '#2b2f30'; g.lineWidth = 6; g.strokeRect(3, 3, W - 6, H - 6);
  const t = new T.CanvasTexture(c); if (T.SRGBColorSpace) t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4; return t;
}
function hazardTexture(T) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 32; const g = c.getContext('2d');
  g.fillStyle = '#e0b52a'; g.fillRect(0, 0, 256, 32); g.fillStyle = '#151515';
  for (let x = -32; x < 256 + 32; x += 32) { g.beginPath(); g.moveTo(x, 32); g.lineTo(x + 16, 32); g.lineTo(x + 32, 0); g.lineTo(x + 16, 0); g.fill(); }
  const t = new T.CanvasTexture(c); t.wrapS = T.RepeatWrapping; if (T.SRGBColorSpace) t.colorSpace = T.SRGBColorSpace; return t;
}

/** build the marks; looks = game.json "roomMarks", o = { floorY(floor), parent } -> the group (or null) */
export function buildRoomMarks(T, scene, plan, looks, o = {}) {
  if (!plan || !looks || typeof document === 'undefined') return null;
  const floorY = o.floorY || (() => 0), parent = o.parent || scene;
  const group = new T.Group(); group.name = 'room-marks';
  const rooms = new Map(plan.rooms.map((r) => [r.id, r]));
  const std = (m) => new T.MeshStandardMaterial({ roughness: 0.6, metalness: 0, ...m });
  const add = (geo, mat, x, y, z, ry = 0, into = group) => { const m = new T.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.y = ry; m.receiveShadow = true; into.add(m); return m; };
  const bandM = {}; let haz = null; const inset = 0.095;
  for (const r of plan.rooms) {
    const look = looks[r.id]; if (!look) continue;
    const y0 = floorY(r.floor || 0);
    const walls = [{ ax: 'x', at: r.z, a: r.x, b: r.x + r.w, n: 1 }, { ax: 'x', at: r.z + r.d, a: r.x, b: r.x + r.w, n: -1 }, { ax: 'z', at: r.x, a: r.z, b: r.z + r.d, n: 1 }, { ax: 'z', at: r.x + r.w, a: r.z, b: r.z + r.d, n: -1 }];
    const h = look.hazard ? 0.5 : 0.3, y = y0 + (look.hazard ? 1.0 : 1.32);
    if (look.band !== false) for (const w of walls) for (const [a, b] of solidStretches(w.a, w.b, wallGaps(plan, r, w))) {
      const L = b - a, c = (a + b) / 2, off = w.at + w.n * inset;
      let mat;
      if (look.hazard) { haz = haz || hazardTexture(T); const t = haz.clone(); t.needsUpdate = true; t.repeat.set(L, 1); mat = std({ map: t, roughness: 0.7, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.22 }); }
      else mat = bandM[r.id] || (bandM[r.id] = std({ color: new T.Color(look.color), roughness: 0.55, emissive: new T.Color(look.color), emissiveIntensity: 0.3 }));
      if (w.ax === 'x') add(new T.BoxGeometry(L, h, 0.012), mat, c, y, off);
      else add(new T.BoxGeometry(0.012, h, L), mat, off, y, c);
    }
    if (look.guide) {   // two painted lines along a corridor
      const gm = std({ color: new T.Color(look.color), roughness: 0.5, emissive: new T.Color(look.color), emissiveIntensity: 0.12 });
      for (const s of [-0.18, 0.18]) {
        if (r.w >= r.d) add(new T.PlaneGeometry(r.w - 0.6, 0.12).rotateX(-Math.PI / 2), gm, r.x + r.w / 2, y0 + 0.006, r.z + r.d / 2 + s);
        else add(new T.PlaneGeometry(0.12, r.d - 0.6).rotateX(-Math.PI / 2), gm, r.x + r.w / 2 + s, y0 + 0.006, r.z + r.d / 2);
      }
    }
  }
  // the hanging signs: sticking out into the corridor (read from far down it), and a flat plate on the room side (where am I)
  const signMats = {};
  const signFor = (id) => {
    if (signMats[id]) return signMats[id];
    const r = rooms.get(id), look = looks[id], t = signTexture(T, look.label || String(r.name || id).replace(/（.*）/, ''), look.color || '#888');
    return (signMats[id] = std({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.45, roughness: 0.5 }));
  };
  const bracketM = std({ color: 0x2f3334, metalness: 0.5, roughness: 0.5 });
  const corr = (r) => r.kind === 'corridor' || r.type === 'corridor';
  for (const d of plan.doors || []) {
    if (d.x == null || d.z == null) continue;
    const a = rooms.get(d.a), b = rooms.get(d.b); if (!a || !b) continue;
    const room = corr(a) && !corr(b) ? b : !corr(a) && corr(b) ? a : null, hall = room === a ? b : a;
    if (!room || !looks[room.id] || looks[room.id].sign === false) continue;
    const y0 = floorY(room.floor || 0);
    const onX = Math.abs(d.z - room.z) < 0.4 || Math.abs(d.z - (room.z + room.d)) < 0.4;   // the door is in a wall along x
    const n = onX ? Math.sign((hall.z + hall.d / 2) - d.z) : Math.sign((hall.x + hall.w / 2) - d.x);
    const sw = 1.3, sh = 0.4, out = 0.12 + sw / 2, y = y0 + 2.62;
    const px = onX ? d.x + (d.width || 1) / 2 + 0.15 : d.x + n * out, pz = onX ? d.z + n * out : d.z + (d.width || 1) / 2 + 0.15;
    const mat = signFor(room.id);
    const plate = new T.Group(); plate.position.set(px, y, pz); plate.rotation.y = onX ? Math.PI / 2 : 0; group.add(plate);   // the face looks along the corridor
    add(new T.BoxGeometry(sw + 0.04, sh + 0.04, 0.03), bracketM, 0, 0, 0, 0, plate);
    add(new T.PlaneGeometry(sw, sh), mat, 0, 0, 0.017, 0, plate);
    add(new T.PlaneGeometry(sw, sh), mat, 0, 0, -0.017, Math.PI, plate);
    add(new T.BoxGeometry(0.02, 0.3, 0.02), bracketM, -sw * 0.35, 0.35, 0, 0, plate); add(new T.BoxGeometry(0.02, 0.3, 0.02), bracketM, sw * 0.35, 0.35, 0, 0, plate);
    const inN = -n, ix = onX ? d.x : d.x + inN * 0.11, iz = onX ? d.z + inN * 0.11 : d.z;
    add(new T.PlaneGeometry(1.1, 0.34), mat, ix, y0 + 2.5, iz, onX ? (inN > 0 ? 0 : Math.PI) : (inN > 0 ? Math.PI / 2 : -Math.PI / 2));
  }
  parent.add(group);
  return group;
}
