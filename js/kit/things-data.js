/* game-kit 6e0b6f0: js/things-data.js — edit in game-kit and run tools/kit-sync.js */
// Pure data side of the "things you can look at" standard (js/things.js is the DOM + THREE side): normalize, textFor, available, journalEntries, checkThings. Runs in Node
// (js/schema-check.js, tools/check-game-data.mjs). things.json: [ { id, room, position: [x, z] | { x, z, y }, y?, label?, photo?, text: string | [first, repeat], feeling?, requires?: { stage, flags, tasks, items, looked }, size? } ]
export const KIND = 'look';

export function normalize(t) {
  const pos = Array.isArray(t.position) ? { x: t.position[0], z: t.position[1], y: t.y } : t.position ? { ...t.position } : Array.isArray(t.at) ? { x: t.at[0], z: t.at[1], y: t.y } : { x: 0, z: 0, y: t.y };
  const text = Array.isArray(t.text) ? t.text.filter(Boolean) : t.text ? [t.text] : [];
  return { id: t.id, room: t.room, x: pos.x, z: pos.z, y: pos.y == null ? 1.1 : pos.y, label: t.label || t.id, photo: t.photo || '', text, feeling: t.feeling || '', requires: t.requires || null, size: t.size || 0.6, floor: t.floor, terminal: t.terminal || '', raw: t };
}
// the n-th look (0 = the first): the first line, then the repeat line (the last one is kept)
export const textFor = (thing, n) => (thing.text.length ? thing.text[Math.min(n, thing.text.length - 1)] : '');
// state: { flags, tasks, items, looked, levelIndex, levelOf }
export function available(thing, s = {}) {
  const r = thing.requires;
  if (!r) return true;
  const has = (list, have) => (list || []).every((x) => (have || []).includes(x));
  if (r.stage != null && s.levelOf && (s.levelIndex ?? 0) < s.levelOf(r.stage)) return false;
  return has(r.flags, s.flags) && has(r.tasks, s.tasks) && has(r.items, s.items) && has(r.looked, s.looked);
}
// journal entries (気になること) for what has been looked at: no spoilers (only the looked ones), grouped by room
export function journalEntries(things, looked, roomName = (id) => id) {
  const seen = new Set(looked || []);
  return things.filter((t) => seen.has(t.id)).map((t) => ({ id: `thing:${t.id}`, tab: 'notes', group: t.room, groupLabel: roomName(t.room), title: t.label, text: t.text[0] || '', line: t.feeling || t.text[0] || '', img: t.photo || undefined, tag: '調べた' }));
}
export function checkThings(list, plan, o = {}) {
  const errors = [], warns = [], ids = new Set();
  const rooms = new Map(((plan && plan.rooms) || []).map((r) => [r.id, r]));
  for (const raw of list || []) {
    const t = normalize(raw);
    if (ids.has(t.id)) errors.push(`thing "${t.id}": duplicate id`); ids.add(t.id);
    if (rooms.size && !rooms.has(t.room)) { errors.push(`thing "${t.id}": room "${t.room}" is not in plan.json`); continue; }
    const r = rooms.get(t.room);
    if (r && (t.x < r.x - 0.01 || t.x > r.x + r.w + 0.01 || t.z < r.z - 0.01 || t.z > r.z + r.d + 0.01)) errors.push(`thing "${t.id}": position (${t.x}, ${t.z}) is outside room "${t.room}"`);
    if (!t.text.length && !t.feeling) warns.push(`thing "${t.id}": no text and no feeling (nothing to say when looked at)`);
    if (t.photo && o.fileExists && !o.fileExists(t.photo)) errors.push(`thing "${t.id}": photo "${t.photo}" does not exist`);
    if (!t.photo) warns.push(`thing "${t.id}": no photo yet`);
  }
  return { errors, warns };
}

