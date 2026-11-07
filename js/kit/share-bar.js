/* game-kit 2246e71: js/share-bar.js — edit in game-kit and run tools/kit-sync.js */
// The share row of the title screen and of the ending (all-games rule A21, kit 1.16): X で共有 / 共有 (the phone's share sheet, when there is one) /
// リンクをコピー / 他のゲームを遊ぶ (https://games.autoarticles.net/ in the same tab). No other kit module is needed: the chat site, the 3D standard
// and games of their own make (欠番放送, 工場) use the same file. Its CSS comes with it (injected once, tokens with fallbacks), so a game whose
// css/kit.css is its own copy still gets it.
//
//   mountShareBar(el, { place: 'title' | 'ending', name, line, url, ending, tags, game })
//     name: the game's title (default: og:site_name = site.json name, then fallbackName (game.json title), then document.title before ｜)
//     line: one short line about the game (default: <meta name="gf-share-line">, then what follows ｜ in og:title = site.json titleSuffix)
//     url:  the game's page (default: <link rel="canonical">, then this page)
//     ending: the name of the ending reached, ONLY when the game decides it gives nothing away (game.json share.endingName)
//   shareText({ name, line, place, ending }) / xPostUrl(text, url, tags) / PORTAL_URL: pure parts for the tests and for games that build their own row
//   GA4: share { method: x | native | copy, place, game } and other_games { place, game } (sent with the beacon transport: the page is left right after)
export const PORTAL_URL = "https://games.autoarticles.net/";
export const PORTAL_LABEL = "他のゲームを遊ぶ";

const enc = encodeURIComponent;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function xPostUrl(text, url, tags = []) {
  const t = (tags || []).map((s) => String(s).replace(/^#/, "").trim()).filter(Boolean);
  return `https://x.com/intent/post?text=${enc(text)}&url=${enc(url)}${t.length ? `&hashtags=${enc(t.join(","))}` : ""}`;
}

// 『題名』ひとこと  /  at the end: 『題名』を最後まで遊びました。ひとこと  /  with an ending the game allows: 『題名』で結末「名前」にたどり着きました。
export function shareText({ name, line = "", place = "title", ending = "" } = {}) {
  const n = `『${String(name || "").trim()}』`;
  const l = String(line || "").trim();
  if (place === "ending") {
    const head = ending ? `${n}で結末「${String(ending).trim()}」にたどり着きました。` : `${n}を最後まで遊びました。`;
    return l ? `${head}\n${l}` : head;
  }
  return l ? `${n}${l}` : n;
}

export function shareInfo(o = {}, doc = typeof document !== "undefined" ? document : null) {
  const meta = (sel) => (doc && doc.querySelector(sel) ? doc.querySelector(sel).getAttribute("content") || "" : "");
  const ogTitle = meta('meta[property="og:title"]');
  const docTitle = doc ? doc.title || "" : "";
  const name = o.name || meta('meta[property="og:site_name"]') || o.fallbackName || docTitle.split("｜")[0] || "";
  const line = o.line != null ? o.line : meta('meta[name="gf-share-line"]') || (ogTitle.includes("｜") ? ogTitle.split("｜").slice(1).join("｜") : "");
  const canon = doc && doc.querySelector('link[rel="canonical"]');
  const url = o.url || (canon && canon.href) || (typeof location !== "undefined" ? location.origin + location.pathname : "");
  return { name: String(name).trim(), line: String(line).trim(), url };
}

function track(name, params) {
  try { if (typeof window !== "undefined" && typeof window.gtag === "function") window.gtag("event", name, params); } catch { /* analytics never breaks the game */ }
}

const CSS = `
.gf-sharebar { display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 6px 8px; margin: 10px auto 0; max-width: 100%; pointer-events: auto; }
.gf-sharebar .gf-sb-btn { box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 44px; min-width: 44px; padding: 0 12px; border-radius: var(--gf-radius, 10px);
  border: 1px solid var(--gf-border, rgba(128,128,128,.5)); background: var(--gf-surface, rgba(20,20,20,.75)); color: var(--gf-text, #eee); font: inherit; font-size: 14px; line-height: 1.2; text-decoration: none; cursor: pointer; white-space: nowrap; touch-action: manipulation; }
.gf-sharebar .gf-sb-btn:hover { filter: brightness(1.12); }
.gf-sharebar .gf-sb-btn:focus-visible { outline: 2px solid var(--gf-accent, #6aa); outline-offset: 2px; }
.gf-sharebar .gf-sb-x { background: #000; color: #fff; border-color: #555; }
.gf-sharebar .gf-sb-more { font-weight: 600; }
.gf-sharebar svg { width: 16px; height: 16px; flex: none; }
.gf-sharebar .gf-sb-note { flex-basis: 100%; min-height: 0; font-size: 13px; color: var(--gf-title-dim, var(--gf-text-dim, #bbb)); text-align: center; }
.gf-sharebar .gf-sb-note:empty { display: none; }
@media (max-width: 420px) { .gf-sharebar .gf-sb-btn { padding: 0 10px; font-size: 13.5px; } }
`;
function injectCss(doc) {
  if (!doc || doc.getElementById("gf-sharebar-css")) return;
  const s = doc.createElement("style");
  s.id = "gf-sharebar-css";
  s.textContent = CSS;
  (doc.head || doc.documentElement).prepend(s);   // first in <head>: a game's own stylesheet can still restyle the row
}

const X_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M17.8 3h3.1l-6.8 7.8L22 21h-6.2l-4.9-6.4L5.3 21H2.2l7.3-8.3L2 3h6.4l4.4 5.8zm-1.1 16.2h1.7L7.4 4.7H5.6z"/></svg>';

export function mountShareBar(el, o = {}) {
  if (!el) return null;
  const doc = el.ownerDocument || document;
  injectCss(doc);
  const place = o.place || "title";
  const info = shareInfo(o, doc);
  const text = o.text || shareText({ ...info, place, ending: o.ending });
  const game = o.game || info.name;
  const native = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const bar = doc.createElement("div");
  bar.className = "gf-sharebar";
  bar.dataset.place = place;
  bar.setAttribute("role", "group");
  bar.setAttribute("aria-label", "共有と他のゲーム");
  bar.innerHTML = `<a class="gf-sb-btn gf-sb-x" data-sb="x" href="${esc(xPostUrl(text, info.url, o.tags))}" target="_blank" rel="noopener noreferrer">${X_SVG}<span>X で共有</span></a>`
    + (native ? `<button type="button" class="gf-sb-btn" data-sb="native">共有…</button>` : "")
    + `<button type="button" class="gf-sb-btn" data-sb="copy">リンクをコピー</button>`
    + `<a class="gf-sb-btn gf-sb-more" data-sb="more" href="${PORTAL_URL}">${PORTAL_LABEL}</a>`
    + `<span class="gf-sb-note" aria-live="polite"></span>`;
  const note = (m) => { bar.querySelector(".gf-sb-note").textContent = m; };
  // the row sits on the title / the ending: a press on it must not reach what is under it (the ending's "show everything at once", a game's tap-to-go-on, the 3D view)
  for (const t of ["pointerdown", "pointerup", "mousedown", "mouseup", "touchstart", "touchend"]) bar.addEventListener(t, (e) => e.stopPropagation(), { passive: true });
  bar.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") e.stopPropagation(); });
  bar.addEventListener("click", async (e) => {
    e.stopPropagation();
    const b = e.target.closest && e.target.closest("[data-sb]");
    if (!b) return;
    const m = b.dataset.sb;
    if (m === "more") { track("other_games", { place, game, transport_type: "beacon" }); return; }   // the link itself navigates (same tab)
    track("share", { method: m, place, game });
    if (m === "native") { navigator.share({ title: info.name, text, url: info.url }).catch(() => {}); return; }
    if (m === "copy") {
      let ok = false;
      try { await navigator.clipboard.writeText(`${text}\n${info.url}`); ok = true; } catch { /* no clipboard (http, permission) */ }
      note(ok ? "紹介文とリンクをコピーしました。" : info.url);
    }
  });
  el.appendChild(bar);
  return bar;
}

// a game's own share block (js/share.js shareButtons, a game of its own make): the portal link alone, same look and event
export function portalLink(el, o = {}) {
  if (!el) return null;
  const doc = el.ownerDocument || document;
  injectCss(doc);
  const a = doc.createElement("a");
  a.className = `gf-sb-btn gf-sb-more ${o.className || ""}`.trim();
  a.dataset.sb = "more";
  a.href = PORTAL_URL;
  a.textContent = PORTAL_LABEL;
  const place = o.place || "ending";
  a.addEventListener("click", (e) => { e.stopPropagation(); track("other_games", { place, game: o.game || shareInfo({}, doc).name, transport_type: "beacon" }); });
  for (const t of ["pointerdown", "pointerup", "touchstart", "touchend"]) a.addEventListener(t, (e) => e.stopPropagation(), { passive: true });
  const wrap = doc.createElement("div");
  wrap.className = "gf-sharebar gf-sharebar-portal";
  wrap.appendChild(a);
  el.appendChild(wrap);
  return a;
}
