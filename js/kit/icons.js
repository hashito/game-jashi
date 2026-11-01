/* game-kit 6e0b6f0: js/icons.js — edit in game-kit and run tools/kit-sync.js */
// The standard icon set (docs/icons.md): 24x24, 2px round stroke, currentColor, no fill (so the colour / contrast comes from the text colour around it).
// The sources are assets/icons/<name>.svg (generated from this file by tools/gen-icons.mjs; test/icons.test.mjs keeps them in sync).
//   import { icon, iconOrText } from "./kit/icons.js";
//   el.innerHTML = icon("map", { size: 22, title: "地図" });          // inline <svg>, role="img" + aria-label (no title = aria-hidden decoration)
//   iconOrText(tab.icon)    // an icon NAME -> the svg; anything else (an emoji / a letter a game chose) -> the escaped text
import { gfRegister, gfOk, gfFail, gfUnknown } from "./gf-test.js";
export const ICON_PATHS = {
  items: "M6 8h12l1 12H5L6 8z M9 8V6.5a3 3 0 0 1 6 0V8 M9.5 13h5",
  tasks: "M10 6h10 M10 12h10 M10 18h10 M3.5 6.2l1.6 1.6L8 4.6 M3.5 12.2l1.6 1.6L8 10.6 M3.5 18.2l1.6 1.6L8 16.6",
  notes: "M10.5 3.5a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M15.6 15.6L21 21 M7 13.5l2.6-3 2 2 1.4-1.5 1.6 2.5",
  map: "M3 6.5l6-2.5 6 2.5 6-2.5v13.5l-6 2.5-6-2.5-6 2.5V6.5z M9 4v13.5 M15 6.5V20",
  menu: "M4 6h16 M4 12h16 M4 18h16",
  terminal: "M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z M7 10l3 2.2L7 14.4 M12.5 15h4.5",
  close: "M6 6l12 12 M18 6L6 18",
  settings: "M4 7h9 M17 7h3 M4 17h3 M11 17h9 M15 4.5v5 M9 14.5v5",
  releases: "M11 3l1.9 5.6L18.5 10.5 12.9 12.4 11 18 9.1 12.4 3.5 10.5 9.1 8.6z M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z",
  pause: "M8 5v14 M16 5v14",
  play: "M7.5 4.5l12 7.5-12 7.5z",
  home: "M3 11.5L12 4l9 7.5 M5.5 10v10h13V10 M10 20v-6h4v6",
  book: "M4 5.5A1.5 1.5 0 0 1 5.5 4H12v16H5.5A1.5 1.5 0 0 1 4 18.5v-13z M12 4h6.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H12",
  flag: "M5 21V4 M5 4h11l-2 4 2 4H5",
  info: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 11v5.5 M12 7.6v.1",
  chevron: "M6 9l6 6 6-6",
  lock: "M6 11h12v9H6z M8.5 11V8a3.5 3.5 0 0 1 7 0v3 M12 14.5v2.5",
  unlock: "M6 11h12v9H6z M8.5 11V8a3.5 3.5 0 0 1 6.8-1.2 M12 14.5v2.5",
  star: "M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.9l-5.3 2.7 1-5.8-4.2-4.1 5.9-.9z",
  warn: "M12 4L2.8 19.5h18.4L12 4z M12 10v4.5 M12 17.2v.1",
  alert: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 7.5v5 M12 15.7v.1",
  check: "M5 12.5l4.5 4.5L19 7.5",
  image: "M4 5h16v14H4z M4 16l5-5 4 4 3-3 4 4 M9 9.5v.1",
  trash: "M5 7h14 M9 7V4.5h6V7 M7 7l1 13h8l1-13 M10 11v6 M14 11v6",
  skip: "M5 5l9 7-9 7z M18 5v14",
  phone: "M6.5 3.5h3l1.5 4-2 1.5a11 11 0 0 0 6 6l1.5-2 4 1.5v3a2 2 0 0 1-2 2A16 16 0 0 1 4.5 5.5a2 2 0 0 1 2-2z",
  save: "M5 4h11l3 3v13H5z M8 4v5h7V4 M8 20v-6h8v6",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 7v5l3.5 2",
  user: "M12 4.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z M5 20c.5-4 3.5-6 7-6c3.5 0 6.5 2 7 6",
  folder: "M3.5 6.5h6l2 2h9v10h-17z",
  door: "M6 20V4h12v16 M4 20h16 M14.5 12v.1",
  building: "M5 20V4h10v16 M15 9h4v11 M5 20h14 M8.5 8h3 M8.5 12h3 M8.5 16h3",
  radio: "M4 9h16v10H4z M7 9l9-5 M8 14h4 M16 14v.1",
  // chat standard 1.3 (docs/standard-chat.md 13)
  search: "M11 4.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13z M16 16l4.5 4.5",
  chat: "M4 5h16v11H10l-4.5 3.5V16H4z",
  gear: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2-1.2L14.3 3h-4l-.4 2.6a7 7 0 0 0-2 1.2l-2.3-.9-2 3.4 2 1.5A7 7 0 0 0 5.5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-.9a7 7 0 0 0 2 1.2l.4 2.6h4l.4-2.6a7 7 0 0 0 2-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z",
  users: "M9 5.7a3.3 3.3 0 1 0 0 6.6 3.3 3.3 0 0 0 0-6.6z M3 19.5a6 6 0 0 1 12 0 M17 5.4a2.6 2.6 0 1 0 0 5.2 2.6 2.6 0 0 0 0-5.2z M15.5 13.6a5 5 0 0 1 6 5",
  trophy: "M8 4h8v5a4 4 0 0 1-8 0z M8 6H5a3 3 0 0 0 3 4 M16 6h3a3 3 0 0 1-3 4 M12 13v4 M8.5 20h7",
  pin: "M12 21c0 0-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z M12 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4z",
  bell: "M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z M10 20.5a2 2 0 0 0 4 0",
  belloff: "M6 16V11a6 6 0 0 1 9.5-4.9 M18 11v5l1.5 2H8 M10 20.5a2 2 0 0 0 4 0 M4 4l16 16",
  up: "M6 15l6-6 6 6",
  down: "M6 9l6 6 6-6",
  back: "M15 5l-7 7 7 7",
  file: "M7 3h7l4 4v14H7z M14 3v4h4",
  undo: "M9 7L4 12l5 5 M4 12h9a6 6 0 0 1 6 6",
  copy: "M8 10a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2z M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3",
  forward: "M4 6l7 6-7 6z M13 6l7 6-7 6z",
  sound: "M4 9.5h3.5L12 6v12l-4.5-3.5H4z M15.5 9a4 4 0 0 1 0 6 M18 6.5a8 8 0 0 1 0 11",
  send: "M4 12l16-8-6 16-2.5-6.5z",
  smile: "M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17z M8.5 14.5c1 1.2 2.2 1.8 3.5 1.8c1.3 0 2.5-.6 3.5-1.8 M9.5 10h.01 M14.5 10h.01",
  heart: "M12 20c0 0-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z",
  reply: "M10 8L4 13l6 5 M4 13h10a6 6 0 0 1 6 6",
};
export const ICON_NAMES = Object.keys(ICON_PATHS);
export const hasIcon = (name) => Object.prototype.hasOwnProperty.call(ICON_PATHS, name);
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const ATTRS = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
// the inline svg of an icon name ("" for an unknown name)
export function icon(name, { size = 24, title = "", cls = "" } = {}) {
  if (!hasIcon(name)) return "";
  const a11y = title ? `role="img" aria-label="${esc(title)}"` : 'aria-hidden="true" focusable="false"';
  return `<svg class="gf-ic gf-ic-${name}${cls ? ` ${esc(cls)}` : ""}" ${ATTRS} width="${size}" height="${size}" ${a11y}>${ICON_PATHS[name].split(" M").map((d, i) => `<path d="${i ? "M" : ""}${d}"/>`).join("")}</svg>`;
}
export const iconOrText = (v, o) => (hasIcon(v) ? icon(v, o) : esc(v || ""));
// the standalone file (assets/icons/<name>.svg)
export const iconFile = (name) => `<svg xmlns="http://www.w3.org/2000/svg" ${ATTRS} width="24" height="24">${ICON_PATHS[name].split(" M").map((d, i) => `<path d="${i ? "M" : ""}${d}"/>`).join("")}</svg>\n`;

gfRegister("icons", () => ({
  snapshot: () => ({ names: ICON_NAMES.slice(), count: ICON_NAMES.length }),
  drive(action, a = {}) {
    switch (action) {
      case "render": return hasIcon(a.name) ? gfOk({ svg: icon(a.name, a) }) : gfFail(`unknown icon "${a.name}"`);
      case "has": return gfOk({ has: hasIcon(a.name) });
      default: return gfUnknown(action);
    }
  },
}));
