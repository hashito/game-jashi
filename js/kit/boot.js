/* game-kit 6e0b6f0: js/boot.js — edit in game-kit and run tools/kit-sync.js */
// First-load screen helpers (rule Q11, docs/load-flicker.md). No dependencies (the standard 3D shell and the chat standard both use it).
//   index.html has a static <div id="boot"> loader (css/shell.css) that is painted before any script runs; the title is built hidden behind it
//   (#title.gf-prep) and ONE crossfade (boot -> title) happens when the fonts and the key art are ready. Never two steps, never a pop-in.
export const FONT_WAIT_MS = 4000;   // how long the title may wait for the web fonts (then it is shown with the fallback font: a visible swap is worse than a short wait, a long wait is worse than a swap)
export const ART_WAIT_MS = 3000;    // how long it may wait for the key art
export const SETTLE_MS = 600;       // the crossfade (0.4-0.5 s) has run: the heavy boot steps start after it, so the fade is smooth

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const frames2 = () => new Promise((r) => (typeof requestAnimationFrame === "function" ? requestAnimationFrame(() => requestAnimationFrame(r)) : setTimeout(r, 32)));

// Decode an image off the critical path (the key art must not pop in): resolves (never rejects) once it is decoded or has failed.
export function preloadImage(url) {
  return new Promise((res) => { const i = new Image(); i.decoding = "async"; i.onerror = () => res(null); i.src = url; (i.decode ? i.decode() : new Promise((r) => (i.onload = r))).then(() => res(i), () => res(null)); });
}

// Resolves when the web-font stylesheet (if it is loaded async: <link data-gf-fonts media=print onload>) has arrived and the pending font faces have loaded.
export function whenFontsReady() {
  const link = document.querySelector('link[rel="stylesheet"][href*="fonts.googleapis"], link[rel="stylesheet"][data-gf-fonts]');
  const sheet = !link || link.sheet ? Promise.resolve() : new Promise((r) => { link.addEventListener("load", r, { once: true }); link.addEventListener("error", r, { once: true }); });
  return sheet.then(frames2).then(() => (document.fonts ? document.fonts.ready : null)).catch(() => {});
}

// Resolves when the opacity transition of `el` has ended (the real event: under load it comes late, and the heavy work that waits for it starts later too),
// or after `maxMs` (no transition: reduced motion / calm / a hidden tab).
function fadeDone(el, maxMs) {
  return new Promise((res) => {
    let d = 0;
    try { d = Math.max(...getComputedStyle(el).transitionDuration.split(",").map((s) => parseFloat(s) * (/ms$/.test(s.trim()) ? 1 : 1000))); } catch { /* ignore */ }
    if (!(d > 0) || (typeof document !== "undefined" && document.hidden)) return setTimeout(res, 60);
    const fin = () => { el.removeEventListener("transitionend", on); clearTimeout(t); res(); };
    const on = (e) => { if (e.target === el && e.propertyName === "opacity") fin(); };
    el.addEventListener("transitionend", on);
    const t = setTimeout(fin, Math.max(maxMs, d + 400));
  });
}

// The key art as its own layer (fades in once decoded: opacity only). Returns the layer, or null.
export function mountTitleArt(title, url, { gradient = "linear-gradient(rgba(0,0,0,0.45), rgba(0,0,0,0.62))" } = {}) {
  if (!url) return null;
  const art = document.createElement("div");
  art.className = "gf-title-art gf-art-wait";
  art.style.backgroundImage = `${gradient}, url(${url})`;
  title.insertBefore(art, title.firstChild);
  return art;
}

// The one crossfade. title: the #title element built with class gf-prep; art: the layer (or null); artP: the preload promise.
// Without a #boot loader (an old index.html) the art fades in when decoded and nothing else happens. Resolves after the heavy boot may start.
export async function crossfadeToTitle({ boot = document.getElementById("boot"), title, art = null, artP = Promise.resolve(null), fontMs = FONT_WAIT_MS, artMs = ART_WAIT_MS, settleMs = SETTLE_MS } = {}) {
  if (!boot) { artP.then(() => requestAnimationFrame(() => art && art.classList.remove("gf-art-wait"))); return; }
  await frames2();   // layout is done: the fonts the title uses are requested now
  await Promise.race([whenFontsReady(), sleep(fontMs)]);
  await Promise.race([artP, sleep(artMs)]);
  if (art) art.classList.remove("gf-art-wait");
  title.classList.remove("gf-prep");
  boot.classList.add("gf-boot-out");
  await fadeDone(boot, settleMs);   // the heavy boot starts only after the fade has really been painted to the end
  boot.remove();
}
