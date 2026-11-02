/* game-kit b995134: js/ui-warm.js — edit in game-kit and run tools/kit-sync.js */
// Pre-paint of the standard UI (perf, docs/3d-stutter-guide.md "windows"): the FIRST open of a window costs 150-450 ms at 4x CPU even when its JS already ran once,
// because style / layout, the web-font glyphs and the image decode only happen when something is really PAINTED. Opening a window behind the title without a frame
// in between warms nothing. warmStandardUi() opens every standard window invisibly (body.gf-warming: opacity .001, no pointer events, no transitions), waits two real frames
// for each, closes it again and leaves no trace (no 'open' / 'close' events, no pause, nothing marked seen by the release notes).
//
//   await warmStandardUi({ wm, tm, pm, rn, inv, minigames: ['A_CLOCK', ...], minigame: (id) => promise, abortMinigame, owned: () => ids, steps: [async (h) => {...}] });
//   p.text = the characters the UI can show (corpusOf(data)): the web-font slices for them are loaded first (preloadFonts)
//   h = { frames, warm } : a game step opens its own windows with wm.open(...) inside, `await h.frames(2)`, wm.close()
//
// Called by game-core behind the title (after the boot steps). Pure helper `frames(n)` falls back to a timer when rAF does not run (hidden tab).
export const frames = (n = 2, max = 250) => new Promise((res) => {
  if (typeof requestAnimationFrame !== "function") return res();
  let left = n, done = false;
  const fin = () => { if (!done) { done = true; res(); } };
  const tick = () => { if (--left <= 0) fin(); else requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  setTimeout(fin, max * n);   // a background tab never fires rAF
});

// All distinct characters of every string in `obj` (a game's data/*.json): the text the UI can ever show.
export function corpusOf(obj) {
  const set = new Set();
  const walk = (v, d = 0) => {
    if (typeof v === "string") { for (const ch of v) set.add(ch); } else if (v && typeof v === "object" && d < 12) for (const k of Array.isArray(v) ? v : Object.values(v)) walk(k, d + 1);
  };
  walk(obj);
  return [...set].join("");
}

// Web fonts served as unicode-range slices (Google Fonts Noto Sans JP is ~120 of them) load a slice the first time a character of it is LAID OUT; every such
// load re-lays out the text and rasterises new glyphs in the middle of play. Loading every declared face for the characters the game can show, up front, removes
// that (the 'loading' status check is free when the font is a system font or already loaded). Returns the number of faces asked for.
export async function preloadFonts(text, { timeout = 8000 } = {}) {
  if (typeof document === "undefined" || !document.fonts || !text) return 0;
  const seen = new Set(), jobs = [];
  for (const f of document.fonts) {
    const d = `${f.style} ${f.weight} 16px "${f.family}"`;
    if (seen.has(d)) continue;
    seen.add(d);
    jobs.push(document.fonts.load(d, text).catch(() => []));
  }
  await Promise.race([Promise.all(jobs), new Promise((r) => setTimeout(r, timeout))]);
  return jobs.length;
}

// Decode the pictures the windows will show (inventory / journal thumbnails, document photos) before they are needed: a first open that has to fetch + decode
// a dozen JPEGs in the middle of play is a 200-800 ms hitch at 4x CPU. urls: strings; at most `limit`, `concurrency` at a time; never throws.
export async function decodeImages(urls, { limit = 80, concurrency = 4, timeout = 8000 } = {}) {
  if (typeof Image === "undefined" || !urls) return 0;
  const list = [...new Set(urls.filter((u) => typeof u === "string" && u))].slice(0, limit);
  let i = 0, n = 0;
  const one = async () => {
    while (i < list.length) {
      const im = new Image();
      im.decoding = "async";
      im.src = list[i++];
      try { if (im.decode) await im.decode(); n++; } catch { /* missing picture: the window shows its fallback */ }
      await new Promise((r) => setTimeout(r, 0));
    }
  };
  await Promise.race([Promise.all(Array.from({ length: concurrency }, one)), new Promise((r) => setTimeout(r, timeout))]);
  return n;
}
// the picture urls named by data records (items / docs / things / entries: img, photo, image); a bare media id (the みる series' "img": "ph_family", resolved by the game) is not a url
const isUrl = (u) => /[/.:]/.test(u);
export function imagesOf(...lists) {
  const out = [];
  for (const l of lists) for (const r of Array.isArray(l) ? l : l && typeof l === "object" ? Object.values(l) : []) if (r && typeof r === "object") for (const k of ["img", "photo", "image"]) if (typeof r[k] === "string" && isUrl(r[k])) out.push(r[k]);
  return out;
}

export async function warmStandardUi(p = {}) {
  if (typeof document === "undefined") return { windows: 0 };
  if (p.text) await preloadFonts(p.text, { timeout: p.fontTimeout });
  if (p.images && p.images.length) await decodeImages(p.images, p.imageOpts);
  const { wm, tm, pm, rn, inv } = p;
  const body = document.body;
  const had = body.classList.contains("gf-warming");
  body.classList.add("gf-warming");
  let n = 0;
  const safe = async (fn) => { try { await fn(); } catch (e) { if (typeof console !== "undefined") console.warn("ui-warm:", e && e.message); } };
  try {
    if (wm) {
      await wm.warm(async () => {
        if (tm) {
          for (const t of tm.tabs) await safe(async () => { tm.open(t.id); n++; await frames(2); });
          if (inv && p.owned) {
            const ids = p.owned().slice(0, 3);
            await safe(async () => { tm.open(tm.tabs[0] ? tm.tabs[0].id : "items"); for (const id of ids) { inv.select(id); n++; await frames(1); } inv.select(null); });
          }
          tm.close();
        }
        if (pm) await safe(async () => { pm.open(); n++; await frames(2); wm.close(); });
        for (const step of p.steps || []) await safe(() => step({ frames, warm: true }));
        wm.close();
      });
    } else for (const step of p.steps || []) await safe(() => step({ frames, warm: true }));
    if (rn) await safe(async () => { rn.open({ warm: true }); n++; await frames(2); rn.close(); });
    if (p.minigame) {
      for (const id of p.minigames || []) await safe(async () => {
        const pr = p.minigame(id);
        n++;
        await frames(2);
        p.abortMinigame && p.abortMinigame();
        await Promise.race([pr, frames(1)]);
      });
    }
  } finally {
    if (!had) body.classList.remove("gf-warming");
  }
  return { windows: n };
}
