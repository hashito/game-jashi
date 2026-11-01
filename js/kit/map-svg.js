/* game-kit 6e0b6f0: js/map-svg.js — edit in game-kit and run tools/kit-sync.js */
// SVG floor map (rule U18 of docs/3d-game-rules.md). Game-agnostic: the input is the plan.json used by js/plan-check.js
// (rooms / doors / stations; x east, z toward the bottom of the map, metres) plus runtime state.
// Floors as tabs, room names, corridors, doors (locked ones marked), stairs, the player marker with heading,
// visited / unvisited rooms, "you can go here" highlights, pinned markers (task targets, items), tap a room -> callback.
// Pan / zoom with the wheel, pinch, drag and 44 px buttons. The same renderer draws the static docs/floorplan.svg (tools/plan-doc.mjs).
// Colours come from CSS custom properties --gf-* with fallbacks (see css/kit.css "map-svg" block, classes ms-*).
// Everything above the "---- DOM ----" line is pure (no document): test/map-svg.test.mjs uses it.
//
//   import { createMapSvg } from "./kit/map-svg.js";
//   const map = createMapSvg({ plan, container: el,
//     getState: () => ({ pos: { x, z, floor }, heading: 90 /* deg clockwise from map-up */, visited: ["R1"], locked: ["d3"],
//                        named: ["R1", "R2"] /* only these show their name; others "?" (omit = all) */,
//                        pins: [{ id: "t1", room: "R2", x, z, label: "配電盤", kind: "task" | "item" }] }),
//     onRoom: (id, room) => ..., photo: (id) => url | null, onSelect });
//   map.update();            // call when the state changed (cheap; also called by the tab buttons)
//   map.toSVGString();       // static export of the current floor (standalone, has its own <style>)
import { directLinks } from "./plan-check.js";
import { gfRegister, gfEmit, gfOk, gfFail, gfUnknown } from "./gf-test.js";

export const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fl = (r) => r.floor || 0;
export const floorsOf = (plan) => [...new Set(plan.rooms.map(fl))].sort((a, b) => a - b);
export const roomsOnFloor = (plan, f) => plan.rooms.filter((r) => fl(r) === f);
export function roomAt(plan, x, z, floor = 0) {
  // smallest room first so a room inside a bigger outdoor area wins
  return plan.rooms.filter((r) => fl(r) === floor && x >= r.x && x <= r.x + r.w && z >= r.z && z <= r.z + r.d).sort((a, b) => a.w * a.d - b.w * b.d)[0] || null;
}
export function floorBounds(plan, f, pad = 1) {
  const rs = roomsOnFloor(plan, f).length ? roomsOnFloor(plan, f) : plan.rooms;
  return { x0: Math.min(...rs.map((r) => r.x)) - pad, x1: Math.max(...rs.map((r) => r.x + r.w)) + pad, z0: Math.min(...rs.map((r) => r.z)) - pad, z1: Math.max(...rs.map((r) => r.z + r.d)) + pad };
}
const asSet = (v) => (v instanceof Set ? v : new Set(v || []));
// Rooms you can walk into from `roomId` through doors that are not locked (stairs / lifts reach other floors).
export function reachableFrom(plan, roomId, locked = []) {
  const lk = asSet(locked), out = new Set();
  for (const d of plan.doors || []) {
    if (lk.has(d.id)) continue;
    if (d.a === roomId) out.add(d.b);
    else if (d.b === roomId) out.add(d.a);
  }
  return out;
}
export const doorIsVertical = (plan, d) => {
  const byId = new Map(plan.rooms.map((r) => [r.id, r]));
  return d.kind === "stairs" || d.kind === "lift" || (byId.get(d.a) && byId.get(d.b) && fl(byId.get(d.a)) !== fl(byId.get(d.b)));
};

// Standalone <style> for toSVGString / docs (the in-page version is the same rules in css/kit.css).
export const MAP_SVG_CSS = `
.ms-bg{fill:var(--gf-bg,#fff)}
.ms-grid{stroke:var(--gf-map-grid,#eee)}.ms-grid5{stroke:var(--gf-map-grid-2,#ccc)}
.ms-room{stroke:var(--gf-text,#333);stroke-width:1.5}
.ms-room--room{fill:var(--gf-map-room,#dbe8f4)}.ms-room--corridor{fill:var(--gf-map-corridor,#e8e2c8)}.ms-room--outdoor{fill:var(--gf-map-outdoor,#d6efd0)}.ms-room--stairs{fill:var(--gf-map-stairs,#f2d9b8)}
.ms-room--unvisited{opacity:.55;stroke-dasharray:4 3}
.ms-room--go{stroke:var(--gf-accent,#3a7a5a);stroke-width:3;opacity:1;stroke-dasharray:none}
.ms-room--here{stroke:var(--gf-accent,#3a7a5a);stroke-width:3.5}
.ms-room--sel{stroke:var(--gf-danger,#c0502a);stroke-width:3.5}
.ms-door{stroke:var(--gf-map-door,#8a5a00);stroke-width:4;stroke-linecap:butt}
.ms-door--exit{stroke:var(--gf-ok,#2a8a4a)}.ms-door--direct{stroke:#d22}
.ms-door--locked{stroke:var(--gf-danger,#c0502a)}
.ms-lock{fill:var(--gf-danger,#c0502a);stroke:#fff;stroke-width:1}
.ms-stairs{fill:none;stroke:var(--gf-map-door,#8a5a00);stroke-width:1.2}
.ms-station{fill:#c33}
.ms-pin{fill:var(--gf-accent,#e8a040);stroke:#fff;stroke-width:1.5}
.ms-pin--item{fill:var(--gf-ok,#2e7a4a)}
.ms-player{fill:var(--gf-accent,#3a7a5a);stroke:#fff;stroke-width:1.5}
.ms-player-ring{fill:none;stroke:var(--gf-accent,#3a7a5a);stroke-width:1.5;opacity:.5}
.ms-label,.ms-stairs-t,.ms-station-t,.ms-start,.ms-pin-t,.ms-legend,.ms-ruler{font-family:var(--gf-font,system-ui,"Noto Sans JP","Hiragino Sans","Yu Gothic",sans-serif);font-weight:600;paint-order:stroke;stroke:var(--gf-surface,#fff);stroke-width:3px;stroke-linejoin:round}
.ms-label{fill:var(--gf-text,#222);font-size:calc(var(--ms-fs,12)*1px);text-anchor:middle;pointer-events:none}
.ms-label--small{font-size:calc(var(--ms-fs,12)*.92px)}.ms-label--dim{fill:var(--gf-text,#222)}.ms-label--floor{text-anchor:start;font-size:calc(var(--ms-fs,12)*1.1px);font-weight:700}
.ms-stairs-t{fill:var(--gf-text,#222);font-size:calc(var(--ms-fs,12)*.85px);text-anchor:middle;pointer-events:none}
.ms-station-t{fill:var(--gf-text,#222);font-size:calc(var(--ms-fs,12)*.8px)}
.ms-start{fill:var(--gf-text,#222);font-size:calc(var(--ms-fs,12)*.8px)}
.ms-pin-t{fill:var(--gf-text,#222);font-size:calc(var(--ms-fs,12)*.85px);pointer-events:none}
.ms-legend{fill:var(--gf-text,#222);font-size:calc(var(--ms-fs,12)*.85px)}
.ms-ruler{fill:var(--gf-text-dim,#555);font-size:calc(var(--ms-fs,12)*.7px)}
`;

// One floor as SVG markup in its own coordinates (0,0 = top-left of the bounds). Used by the map and by tools/plan-doc.mjs.
// opts: scale (px per m, 16), bounds, state, grid, ruler, direct (render direct links in red), stations, startLabel,
//       selected (room id), names ('all' | 'visited')
export function renderFloor(plan, floor, opts = {}) {
  const o = { scale: 16, grid: false, ruler: false, direct: false, stations: false, startLabel: false, names: "all", ...opts };
  const st = o.state || {};
  const scale = o.scale, b = o.bounds || floorBounds(plan, floor);
  const byId = new Map(plan.rooms.map((r) => [r.id, r]));
  const X = (x) => +((x - b.x0) * scale).toFixed(1), Z = (z) => +((z - b.z0) * scale).toFixed(1);
  const W = (b.x1 - b.x0) * scale, H = (b.z1 - b.z0) * scale;
  const visited = st.visited ? asSet(st.visited) : null, locked = asSet(st.locked), named = st.named ? asSet(st.named) : null;
  const pos = st.pos, here = pos ? roomAt(plan, pos.x, pos.z, pos.floor || 0) : null;
  const go = here ? reachableFrom(plan, here.id, locked) : new Set();
  const direct = o.direct ? new Set(directLinks(plan)) : new Set();
  let out = "";
  if (o.grid) {
    for (let x = Math.ceil(b.x0); x <= b.x1; x++) out += `<line class="ms-grid${x % 5 ? "" : " ms-grid5"}" x1="${X(x)}" y1="0" x2="${X(x)}" y2="${H}"/>`;
    for (let z = Math.ceil(b.z0); z <= b.z1; z++) out += `<line class="ms-grid${z % 5 ? "" : " ms-grid5"}" x1="0" y1="${Z(z)}" x2="${W}" y2="${Z(z)}"/>`;
  }
  if (o.ruler) for (let x = Math.ceil(b.x0 / 5) * 5; x <= b.x1; x += 5) out += `<text class="ms-ruler" x="${X(x)}" y="8">${x}</text>`;
  for (const r of roomsOnFloor(plan, floor)) {
    const seen = !visited || visited.has(r.id);
    const cls = ["ms-room", `ms-room--${r.kind || "room"}`, !seen && "ms-room--unvisited", here && here.id === r.id && "ms-room--here", go.has(r.id) && "ms-room--go", o.selected === r.id && "ms-room--sel"].filter(Boolean).join(" ");
    out += `<g class="ms-r" data-room="${esc(r.id)}"><rect class="${cls}" x="${X(r.x)}" y="${Z(r.z)}" width="${(r.w * scale).toFixed(1)}" height="${(r.d * scale).toFixed(1)}"/>`;
    const showName = named ? named.has(r.id) : o.names === "visited" ? seen : true;
    const label = showName ? r.name || r.id : "？";
    const cx = X(r.x + r.w / 2), cz = Z(r.z + r.d / 2), vertical = r.d > r.w * 1.5;
    out += `<text class="ms-label${r.kind === "corridor" ? " ms-label--small" : ""}${showName ? "" : " ms-label--dim"}" x="${cx}" y="${cz}"${vertical ? ` transform="rotate(-90 ${cx} ${cz})"` : ""}>${esc(label)}</text></g>`;
  }
  // stairs / lifts: a step glyph at the room centre of each end on this floor
  for (const d of plan.doors || []) {
    if (!doorIsVertical(plan, d)) continue;
    for (const id of [d.a, d.b]) {
      const r = byId.get(id);
      if (!r || fl(r) !== floor) continue;
      const other = byId.get(id === d.a ? d.b : d.a), up = other && fl(other) > floor;
      const cx = X(r.x + r.w / 2), cz = Z(r.z + r.d / 2) + 10, lk = locked.has(d.id);
      out += `<g class="ms-stairs-g" data-door="${esc(d.id)}"><path class="ms-stairs" d="M${cx - 8} ${cz + 4}h4v-3h4v-3h4v-3h4"/><text class="ms-stairs-t" x="${cx}" y="${cz + 14}">${d.kind === "lift" ? "EV" : up ? "上り" : "下り"}${lk ? " (施錠)" : ""}</text></g>`;
    }
  }
  for (const d of plan.doors || []) {
    if (d.x == null) continue;
    const a = byId.get(d.a), c = byId.get(d.b);
    if (!a || !c || (fl(a) !== floor && fl(c) !== floor)) continue;
    const hit = fl(a) === floor ? a : c;
    const onV = Math.abs(d.x - hit.x) < 0.31 || Math.abs(d.x - hit.x - hit.w) < 0.31;
    const hw = (d.width ?? 1) / 2, lk = locked.has(d.id);
    const cls = ["ms-door", d.kind === "exit" && "ms-door--exit", direct.has(d.id) && "ms-door--direct", lk && "ms-door--locked"].filter(Boolean).join(" ");
    out += onV ? `<line class="${cls}" data-door="${esc(d.id)}" x1="${X(d.x)}" y1="${Z(d.z - hw)}" x2="${X(d.x)}" y2="${Z(d.z + hw)}"/>` : `<line class="${cls}" data-door="${esc(d.id)}" x1="${X(d.x - hw)}" y1="${Z(d.z)}" x2="${X(d.x + hw)}" y2="${Z(d.z)}"/>`;
    if (lk) out += `<rect class="ms-lock" x="${X(d.x) - 3.5}" y="${Z(d.z) - 3.5}" width="7" height="7" rx="1.5"/>`;
  }
  if (o.stations) {
    for (const s of plan.stations || []) {
      const r = byId.get(s.room);
      if (!r || fl(r) !== floor || s.x == null) continue;
      out += `<circle class="ms-station" cx="${X(s.x)}" cy="${Z(s.z)}" r="3.5"/><text class="ms-station-t" x="${X(s.x) + 5}" y="${Z(s.z) + 3}">${esc(s.id)}</text>`;
    }
  }
  if (o.startLabel) {
    const s = byId.get(plan.start);
    if (s && fl(s) === floor) out += `<text class="ms-start" x="${X(s.x) + 3}" y="${Z(s.z) + 12}">START</text>`;
  }
  for (const p of st.pins || []) {
    const r = p.room ? byId.get(p.room) : null;
    const pf = p.floor ?? (r ? fl(r) : 0);
    if (pf !== floor) continue;
    const px = p.x ?? (r ? r.x + r.w / 2 : null), pz = p.z ?? (r ? r.z + r.d / 2 : null);
    if (px == null) continue;
    out += `<g class="ms-pinG" data-pin="${esc(p.id)}"><circle class="ms-pin${p.kind === "item" ? " ms-pin--item" : ""}" cx="${X(px)}" cy="${Z(pz)}" r="5.5"/>${p.label ? `<text class="ms-pin-t" x="${X(px) + 8}" y="${Z(pz) + 3}">${esc(p.label)}</text>` : ""}</g>`;
  }
  if (pos && (pos.floor || 0) === floor) {
    const h = st.heading || 0;
    out += `<g class="ms-playerG" transform="translate(${X(pos.x)} ${Z(pos.z)}) rotate(${h}) scale(1.4)"><circle class="ms-player-ring" r="9"/><path class="ms-player" d="M0 -8 L5.5 6 L0 3 L-5.5 6 Z"/></g>`;
  }
  return { svg: out, w: W, h: H, bounds: b };
}

export function floorLabel(f) {
  return f === 0 ? "1F" : f > 0 ? `${f + 1}F` : `B${-f}`;
}
// Standalone SVG document of one floor (or all floors stacked when floor is null), with its own <style>.
// opts: everything renderFloor takes, plus sharedX (same x range for every floor), legend (text line), title (always print "Floor n")
export function mapSvgString(plan, floor, opts = {}) {
  const floors = floor == null ? floorsOf(plan) : [floor];
  let y = 18, body = "", maxW = 0;
  for (const f of floors) {
    const bb = floorBounds(plan, f);
    const bounds = opts.sharedX ? { ...bb, x0: Math.min(...plan.rooms.map((r) => r.x)) - 1, x1: Math.max(...plan.rooms.map((r) => r.x + r.w)) + 1 } : bb;
    const r = renderFloor(plan, f, { ...opts, bounds });
    body += `${floors.length > 1 || opts.title ? `<text class="ms-label ms-label--floor" x="4" y="${y - 5}">Floor ${f}</text>` : ""}<g transform="translate(0 ${y})">${r.svg}</g>\n`;
    y += r.h + 30;
    maxW = Math.max(maxW, r.w);
  }
  const legend = opts.legend ? `<text class="ms-legend" x="4" y="${y}">${esc(opts.legend)}</text>` : "";
  const H = y + 10;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${maxW.toFixed(0)}" height="${H.toFixed(0)}" viewBox="0 0 ${maxW.toFixed(0)} ${H.toFixed(0)}" font-family="sans-serif"><style>${MAP_SVG_CSS}</style><rect class="ms-bg" width="100%" height="100%"/>\n${body}${legend}</svg>\n`;
}

// the label font size in MAP units so that it is >= 12px on screen (11px on phones < 500 wide); never tiny, never huge (pure)
export function labelSize(pxW, pxH, mapW, mapH, viewportW = 1280) {
  const k = Math.min(pxW / mapW, pxH / mapH); // px per map unit
  if (!(k > 0)) return 12;
  const target = viewportW < 500 ? 11 : 12;
  return Math.round(Math.min(28, Math.max(8, target / k)) * 10) / 10;
}

// the SVG viewBox for a view { zoom, x, y } over a floor of vw x vh map units: zoom 1 = the whole floor with `pad` units of padding all round (pure)
export const MAP_PAD = 14;
export function viewBoxOf(v, vw, vh, pad = MAP_PAD) {
  const z = v.zoom || 1;
  return { x: v.x - pad / z, y: v.y - pad / z, w: vw / z + (2 * pad) / z, h: vh / z + (2 * pad) / z };
}
// the zoom-1 view that fits the whole floor into a container of cw x ch px: the scale in px per map unit and the empty margin left over on each axis (pure)
// grow a viewBox {x,y,w,h} to the panel aspect (width / height) around its centre; when zoomed in (zoom > 1) never beyond the floor's own edge (+ padding): shift instead
export function aspectBox(b, a, zoom, vw, vh, pad = MAP_PAD) {
  if (!(a > 0)) return b;
  const grow = (o, len, nlen, max) => { let n = o - (nlen - len) / 2; if (!(zoom > 1)) return n; const lo = Math.min(o, -pad), hi = Math.max(o + len, max + pad); if (n < lo) n = lo; if (n + nlen > hi) n = Math.max(lo, hi - nlen); return n; };
  if (b.w / b.h > a) { const h2 = b.w / a; return { x: b.x, y: grow(b.y, b.h, h2, vh), w: b.w, h: h2 }; }
  const w2 = b.h * a;
  return { x: grow(b.x, b.w, w2, vw), y: b.y, w: w2, h: b.h };
}
export function fitScale(cw, ch, vw, vh, pad = MAP_PAD) {
  const bw = vw + 2 * pad, bh = vh + 2 * pad, k = Math.min(cw / bw, ch / bh);
  return { k, offX: (cw - bw * k) / 2, offY: (ch - bh * k) / 2, fits: bw * k <= cw + 0.01 && bh * k <= ch + 0.01 };
}

// ---- pan / zoom maths (pure) ----------------------------------------------------------------------------------
export function clampView(v, w, h, minZ = 1, maxZ = 8) {
  const z = Math.min(maxZ, Math.max(minZ, v.zoom));
  const vw = w / z, vh = h / z;
  return { zoom: z, x: Math.min(Math.max(v.x, 0), Math.max(0, w - vw)), y: Math.min(Math.max(v.y, 0), Math.max(0, h - vh)) };
}
// zoom by a factor around the point (px, py) given in map units
export function zoomAt(v, w, h, factor, px, py) {
  const z = Math.min(8, Math.max(1, v.zoom * factor)), k = v.zoom / z;
  return clampView({ zoom: z, x: px - (px - v.x) * k, y: py - (py - v.y) * k }, w, h);
}

// ---- DOM ------------------------------------------------------------------------------------------------------
export const MAP_KEY = { title: "記号の意味", me: "いまいる場所", door: "ドア", lock: "鍵がかかっている", pin: "印" };
export function createMapSvg(cfg) {
  const KEY = { ...MAP_KEY, ...(cfg.key || {}) }; // the legend of the marker meanings (colour is only for markers; room names are plain text)
  const { plan, container, getState = () => ({}), onRoom, onSelect, photo, scale = 16, names = "all", calm = false, floorNames = null } = cfg;
  const labelOf = (f) => (floorNames && floorNames[f]) || floorLabel(f); // a game names its floors ("3階" for the hillside level that is storey 1 of the grid)
  const floors = floorsOf(plan);
  const root = document.createElement("div");
  root.className = "ms-wrap" + (calm ? " ms-calm" : "");
  root.innerHTML = `<div class="ms-tabs" role="tablist"></div><div class="ms-view"><div class="ms-ctl"><button type="button" class="ms-btn" data-a="in" aria-label="拡大">＋</button><button type="button" class="ms-btn" data-a="out" aria-label="縮小">－</button><button type="button" class="ms-btn" data-a="me" aria-label="現在地">◎</button></div></div><div class="ms-info" aria-live="polite"></div><ul class="ms-key" aria-label="${KEY.title}"><li><i class="ms-k ms-k-me"></i>${KEY.me}</li><li><i class="ms-k ms-k-door"></i>${KEY.door}</li><li><i class="ms-k ms-k-lock"></i>${KEY.lock}</li><li><i class="ms-k ms-k-pin"></i>${KEY.pin}</li></ul>`;
  const tabs = root.querySelector(".ms-tabs"), view = root.querySelector(".ms-view"), info = root.querySelector(".ms-info");
  container.appendChild(root);
  let floor = floors[0], userFloor = null, sel = null, vw = 1, vh = 1, v = { zoom: 1, x: 0, y: 0 }, svgEl = null, lastPlayerFloor = null;

  const curState = () => getState() || {};
  // (perf) the static layer (rooms, doors, pins, labels) is rebuilt only when what it shows changed (floor, the room the player is in, visited / named /
  // locked / pins / selection); otherwise only the player marker moves (a transform). Opening the map twice in a row costs nothing.
  let lastKey = null, tabsKey = null, playerEl = null, bounds = null;
  function draw() {
    const st = curState();
    const pf = st.pos ? st.pos.floor || 0 : null;
    if (pf !== lastPlayerFloor) { lastPlayerFloor = pf; userFloor = null; }
    floor = userFloor != null ? userFloor : pf != null && floors.includes(pf) ? pf : floor;
    const tk = `${floor}|${pf}`;
    if (tk !== tabsKey) {
      tabsKey = tk;
      tabs.innerHTML = floors.map((f) => `<button type="button" role="tab" class="ms-tab${f === floor ? " ms-on" : ""}${f === pf ? " ms-here" : ""}" data-f="${f}" aria-selected="${f === floor}">${labelOf(f)}</button>`).join("");
      tabs.hidden = floors.length < 2;
    }
    if (!svgEl) {
      svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svgEl.setAttribute("class", "ms-svg");
      svgEl.setAttribute("role", "img");
      svgEl.setAttribute("aria-label", "マップ");
      view.insertBefore(svgEl, view.firstChild);
      if (typeof ResizeObserver === "function") new ResizeObserver(() => { rcCache = null; }).observe(svgEl);
    }
    const here = st.pos ? roomAt(plan, st.pos.x, st.pos.z, st.pos.floor || 0) : null;
    const key = JSON.stringify([floor, here && here.id, st.visited ? [...st.visited] : null, st.named ? [...st.named] : null, st.locked ? [...st.locked] : null, st.pins || null, sel, names]);
    if (key !== lastKey) {
      lastKey = key;
      const r = renderFloor(plan, floor, { scale, state: st, names, selected: sel, marker: false });
      bounds = r.bounds;
      if (r.w !== vw || r.h !== vh) { vw = r.w; vh = r.h; v = clampView(v, vw, vh); }
      svgEl.innerHTML = r.svg;
      playerEl = null;
    }
    const pos = st.pos;
    if (pos && (pos.floor || 0) === floor) {
      if (!playerEl) {
        svgEl.insertAdjacentHTML("beforeend", '<g class="ms-playerG"><circle class="ms-player-ring" r="9"/><path class="ms-player" d="M0 -8 L5.5 6 L0 3 L-5.5 6 Z"/></g>');
        playerEl = svgEl.lastElementChild;
      }
      playerEl.setAttribute("transform", `translate(${+((pos.x - bounds.x0) * scale).toFixed(1)} ${+((pos.z - bounds.z0) * scale).toFixed(1)}) rotate(${st.heading || 0}) scale(1.4)`);
    } else if (playerEl) { playerEl.remove(); playerEl = null; }
    applyView();
  }
  // labels are >= 12px on screen (11px on phones) whatever the map is scaled to: --ms-fs is in map units (docs/map-svg.md)
  // the viewBox takes the aspect of the panel (aspectBox): a wide floor in a tall phone panel shows more of the floor above / below instead of leaving the panel empty
  let rcCache = null;
  const boxOf = () => {
    const b = viewBoxOf(v, vw, vh), rc = rcCache || (svgEl && (rcCache = svgEl.getBoundingClientRect()));
    return rc && rc.width && rc.height ? aspectBox(b, rc.width / rc.height, v.zoom, vw, vh) : b;
  };
  // perf (Q12): the size of the svg box is cached (a ResizeObserver / the window resize drops it) so that opening the map does not force a layout of the whole
  // svg, and --ms-fs is only written when it changed (a custom-property write restyles every label)
  let lastFs = "";
  function fitText() {
    const rc = rcCache || (rcCache = svgEl.getBoundingClientRect());
    if (!rc.width || !rc.height) { rcCache = null; return; }
    const fs = String(labelSize(rc.width, rc.height, boxOf().w, boxOf().h, typeof innerWidth === "number" ? innerWidth : 1280));
    if (fs !== lastFs) { lastFs = fs; svgEl.style.setProperty("--ms-fs", fs); }
  }
  if (typeof addEventListener === "function") addEventListener("resize", () => { rcCache = null; svgEl && applyView(); });
  function applyView() {
    v = clampView(v, vw, vh);
    { const b = boxOf(); svgEl.setAttribute("viewBox", `${b.x.toFixed(1)} ${b.y.toFixed(1)} ${b.w.toFixed(1)} ${b.h.toFixed(1)}`); }
    fitText();
  }
  const toMap = (clientX, clientY) => {
    const rc = svgEl.getBoundingClientRect(), bx = boxOf(), k = Math.min(rc.width / bx.w, rc.height / bx.h);
    const offX = (rc.width - bx.w * k) / 2, offY = (rc.height - bx.h * k) / 2;
    return { x: bx.x + (clientX - rc.left - offX) / k, y: bx.y + (clientY - rc.top - offY) / k, k };
  };
  function centerOnPlayer() {
    const p = curState().pos;
    if (!p || (p.floor || 0) !== floor) return;
    const b = floorBounds(plan, floor), z = Math.max(v.zoom, 2);
    v = clampView({ zoom: z, x: (p.x - b.x0) * scale - vw / z / 2, y: (p.z - b.z0) * scale - vh / z / 2 }, vw, vh);
    applyView();
  }
  function select(id) {
    sel = id;
    gfEmit("mapSvg", "select", { id });
    const r = plan.rooms.find((q) => q.id === id);
    const st = curState(), named = st.named ? asSet(st.named).has(id) : true;
    const url = photo && r ? photo(id) : null;
    info.innerHTML = r ? `${url ? `<img class="ms-photo" src="${esc(url)}" alt="">` : ""}<b>${esc(named ? r.name || r.id : "？")}</b>` : "";
    info.classList.toggle("ms-on", !!r);
    draw();
    if (r) { onSelect && onSelect(id, r); onRoom && onRoom(id, r); }
  }

  tabs.addEventListener("click", (e) => {
    const b = e.target.closest("[data-f]");
    if (!b) return;
    userFloor = +b.dataset.f; sel = null; info.classList.remove("ms-on"); v = { zoom: 1, x: 0, y: 0 };
    draw();
  });
  root.querySelector(".ms-ctl").addEventListener("click", (e) => {
    const a = e.target.closest("[data-a]")?.dataset.a;
    if (!a) return;
    if (a === "me") { userFloor = null; draw(); centerOnPlayer(); return; }
    v = zoomAt(v, vw, vh, a === "in" ? 1.5 : 1 / 1.5, v.x + vw / v.zoom / 2, v.y + vh / v.zoom / 2);
    applyView();
  });
  view.addEventListener("wheel", (e) => {
    e.preventDefault();
    const m = toMap(e.clientX, e.clientY);
    v = zoomAt(v, vw, vh, e.deltaY < 0 ? 1.2 : 1 / 1.2, m.x, m.y);
    applyView();
  }, { passive: false });
  // pointers: one = pan (a tap that did not move picks a room), two = pinch
  const ptr = new Map();
  let moved = 0, pinch0 = null;
  view.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".ms-ctl")) return;
    ptr.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved = 0;
    if (ptr.size === 2) { const [a, b] = [...ptr.values()]; pinch0 = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom: v.zoom }; }
  });
  view.addEventListener("pointermove", (e) => {
    const p = ptr.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    moved += Math.abs(dx) + Math.abs(dy);
    if (ptr.size === 1 && moved > 6) {
      const k = toMap(0, 0).k;
      v = { ...v, x: v.x - dx / k, y: v.y - dy / k };
      applyView();
    }
    p.x = e.clientX; p.y = e.clientY;
    if (ptr.size === 2 && pinch0) {
      const [a, b] = [...ptr.values()], d = Math.hypot(a.x - b.x, a.y - b.y), m = toMap((a.x + b.x) / 2, (a.y + b.y) / 2);
      v = zoomAt(v, vw, vh, (pinch0.zoom * d) / pinch0.d / v.zoom, m.x, m.y);
      applyView();
      moved = 99;
    }
  });
  const up = (e) => {
    const tap = ptr.size === 1 && moved <= 6 && e.type === "pointerup";
    ptr.delete(e.pointerId);
    if (ptr.size < 2) pinch0 = null;
    if (tap) {
      const g = document.elementFromPoint(e.clientX, e.clientY)?.closest?.("[data-room]");
      if (g && svgEl.contains(g)) select(g.dataset.room);
    }
  };
  view.addEventListener("pointerup", up);
  view.addEventListener("pointercancel", up);

  draw();
  // (perf) lay out every room name once (class ms-label, invisible): text shaping of Japanese labels is the slow part of an SVG layout (100 ms+ at 4x CPU), and the
  // labels change as rooms get visited ("？" -> the name), so the first real redraw would pay for it in play. After this the shaping cache has every name.
  try {
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("visibility", "hidden");
    g.innerHTML = [...new Set(["？", ...plan.rooms.map((r) => r.name || r.id)])].map((t) => `<text class="ms-label" x="0" y="0">${esc(t)}</text><text class="ms-label ms-label--small" x="0" y="0">${esc(t)}</text>`).join("");
    svgEl.appendChild(g);
    g.getBBox();
    g.remove();
  } catch { /* detached / no layout */ }
  // the whole floor is fitted into the view (with padding) on every size; the labels keep >= 11-12px on screen (labelSize), so no auto-zoom
  const mapApi = {
    el: root,
    update: draw,
    select,
    setFloor(f) { userFloor = f; draw(); },
    centerOnPlayer,
    get floor() { return floor; },
    get view() { return { ...v }; },
    toSVGString: (o = {}) => mapSvgString(plan, o.floor ?? floor, { scale, state: curState(), names, ...o }),
    // back to the state of a fresh map (the player's floor, no zoom, nothing selected): a tab that re-attaches `el` calls this instead of building a new map
    reset() {
      userFloor = null; sel = null; info.classList.remove("ms-on"); v = { zoom: 1, x: 0, y: 0 };
      draw();
    },
    destroy() { root.remove(); },
  };
  gfRegister("mapSvg", () => ({
    snapshot: () => ({ floor, floors: floors.slice(), selected: sel, view: { ...v }, size: { w: vw, h: vh }, rooms: plan.rooms.length, infoShown: info.classList.contains("ms-on") }),
    drive(action, a = {}) {
      switch (action) {
        case "select": if (!plan.rooms.some((r) => r.id === a.id)) return gfFail(`unknown room "${a.id}"`); mapApi.select(a.id); return gfOk({ selected: sel });
        case "setFloor": if (!floors.includes(a.floor)) return gfFail(`unknown floor ${a.floor}`); mapApi.setFloor(a.floor); return gfOk({ floor });
        case "update": draw(); return gfOk();
        case "center": mapApi.centerOnPlayer(); return gfOk({ view: { ...v } });
        case "clickZoom": { const b = root.querySelector(`[data-a="${a.dir === "out" ? "out" : "in"}"]`); return b ? (b.click(), gfOk({ view: { ...v } })) : gfFail("no zoom button"); }
        default: return gfUnknown(action);
      }
    },
    reset: () => mapApi.reset(),
  }));
  return mapApi;
}
