/* game-kit 6e0b6f0: js/media.js — edit in game-kit and run tools/kit-sync.js */
// Generated pictures (tools/media_catalog.json -> tools/gen_images.py -> assets/media/<key>.jpg and
// assets/media/list.json). Only listed files are loaded; anything missing returns null so the game can
// draw a canvas fallback. From ひだまり薬局 / 未然調書.
//
//   await loadMedia();                 // before building textures
//   media('poster_spring')             // HTMLImageElement or null
//   mediaUrl('face_TANABE')            // 'assets/media/face_TANABE.jpg' or null (for <img> / CSS)
//   mediaTexture('tex_wall', THREE)    // a repeating sRGB texture or null
const MEDIA = {};
const LISTED = new Set();
let BASE = "assets/media";

// opts.preload(key): which listed pictures to load up front (default: all). The others are only
// listed: mediaUrl() still returns their address, and the browser fetches them when they are shown.
export async function loadMedia(base = BASE, opts = {}) {
  BASE = base;
  let keys = [];
  try {
    const r = await fetch(`${base}/list.json`);
    keys = r.ok ? await r.json() : [];
    if (!Array.isArray(keys)) keys = [];
  } catch {
    keys = [];
  }
  keys.forEach((k) => LISTED.add(k));
  if (opts.preload) keys = keys.filter(opts.preload);
  await Promise.all(
    keys.map(
      (k) =>
        new Promise((res) => {
          const img = new Image();
          img.onload = () => {
            MEDIA[k] = img;
            res();
          };
          img.onerror = () => res();
          img.src = `${base}/${k}.jpg`;
        }),
    ),
  );
  return Object.keys(MEDIA);
}

export const media = (k) => MEDIA[k] || null;
export const mediaUrl = (k) => (MEDIA[k] || LISTED.has(k) ? `${BASE}/${k}.jpg` : null);

export function mediaTexture(k, THREE, repeat = true) {
  const img = MEDIA[k];
  if (!img) return null;
  const t = new THREE.Texture(img);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

// draw an image cropped to cover a box (posters, framed pictures on canvases)
export function drawCover(g, img, x, y, w, h) {
  const s = Math.max(w / img.width, h / img.height);
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  g.drawImage(img, x + (w - img.width * s) / 2, y + (h - img.height * s) / 2, img.width * s, img.height * s);
  g.restore();
}
