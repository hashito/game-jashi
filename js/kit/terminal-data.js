/* game-kit 6e0b6f0: js/terminal-data.js — edit in game-kit and run tools/kit-sync.js */
// The "terminal" screen kind, pure side (standard 1.5; js/terminal-screen.js is the DOM side). Runs in Node (tests, js/schema-check.js).
// data/terminals.json = { "terminals": [ {
//     "id": "T_DOOR", "title": "出入口の制御盤", "goal": "what to achieve here (the ⓘ and the line under the title)", "photo": "", "lamp": "",
//     "lines": ["screen text", "..."],                                  // may use {flag:name} / {task:ID} switches: see `lines` below
//     "info": "plain words about this screen (the ⓘ)",
//     "choices": [ { "id": "open", "label": "開ける", "info": "what it does, in plain words (the ⓘ lists every choice)",
//                    "decision": true,                                  // select first, then 確定 (a decision you cannot take back)
//                    "hold": 1.2,                                       // a long press of 1.2 s (a mouse / touch hold, Enter / Space held, the pad's A held)
//                    "requires": { "flags": [], "tasks": [], "items": [], "looked": [] }, "locked": "why it does not work yet",
//                    "set": ["flag"], "complete": "TASKID", "lines": ["what the screen says after"], "lamp": "ok", "close": true, "next": "OTHER_TERMINAL" } ],
//     "related": ["I1", "N1"]                                          // items / documents that belong to this job (shown when owned / read)
//   } ] }
// Rules code adds to it through the bus: 'terminal:view' { terminal, view } (change lines / buttons before drawing) and 'terminal:choose' { terminal, choice, result }
// (a handler may replace `result` = { lines, lamp, close, next, set, complete }, or set `handled`).
export const HOLD_DEFAULT = 1.0;

const has = (need, have) => (need || []).every((x) => (have || []).includes(x));
export const metRequires = (r, s = {}) => !r || (has(r.flags, s.flags) && has(r.tasks, s.tasks) && has(r.items, s.items) && has(r.looked, s.looked));

// the screen as the player sees it now. s: { flags, tasks, items, looked, docs, lines? (the lines said by the last choice), lamp? }
export function viewOf(t, s = {}) {
  const buttons = (t.choices || []).map((c) => {
    const ok = metRequires(c.requires, s);
    return { id: c.id, label: c.label, info: c.info || '', disabled: !ok, reason: ok ? '' : c.locked || 'いまは、まだできません。', hold: c.hold ? (c.hold === true ? HOLD_DEFAULT : c.hold) : 0, decision: !!c.decision };
  });
  return { id: t.id, title: t.title || t.id, goal: t.goal || '', photo: t.photo || '', lamp: (s.lamp != null ? s.lamp : t.lamp) || '', lines: (s.lines && s.lines.length ? s.lines : t.lines) || [], info: t.info || '', buttons, related: relatedOf(t, s) };
}
// what belongs to this job and is owned / read now
export const relatedOf = (t, s = {}) => (t.related || []).filter((id) => (s.items || []).includes(id) || (s.docs || []).includes(id));

// the plain-words text of the ⓘ: the goal, the screen's own words and one line per choice
export function infoHtml(t, esc = (x) => x) {
  const parts = [];
  if (t.goal) parts.push(`<p><b>目的</b>　${esc(t.goal)}</p>`);
  if (t.info) parts.push(`<p>${esc(t.info)}</p>`);
  const cs = (t.choices || []).filter((c) => c.info);
  if (cs.length) parts.push(`<ul>${cs.map((c) => `<li><b>${esc(c.label)}</b>　${esc(c.info)}</li>`).join('')}</ul>`);
  return parts.join('') || '<p>このあたりで、できることを選ぶ。</p>';
}

// the effect of choosing: pure; the screen applies it (flags / tasks through ctx), appends the lines
export function choose(t, id, s = {}) {
  const c = (t.choices || []).find((x) => x.id === id);
  if (!c) return { ok: false, error: `unknown choice "${id}"` };
  if (!metRequires(c.requires, s)) return { ok: false, error: c.locked || 'requires not met' };
  return { ok: true, choice: c, result: { lines: c.lines || [], lamp: c.lamp || '', close: !!c.close, next: c.next || null, set: c.set || [], complete: c.complete || null } };
}

// select -> confirm. sel = the selected choice id or null. A decision choice is selected first and fires on the second press (or 確定); other choices fire at once.
export function press(sel, choice) {
  if (!choice.decision) return { sel: null, fire: choice.id };
  return sel === choice.id ? { sel: null, fire: choice.id } : { sel: choice.id, fire: null };
}
export const confirm = (sel) => ({ sel: null, fire: sel });
// a long press: progress 0..1 of `elapsed` seconds on a `hold`-second choice; it fires when full
export const holdProgress = (elapsed, hold) => (hold > 0 ? Math.min(1, Math.max(0, elapsed / hold)) : 1);

export function checkTerminals(data, ctx = {}) {
  const errors = [], warns = [];
  const ids = new Set();
  const rooms = new Set(ctx.rooms || []), tasks = new Set(ctx.tasks || []), flagsKnown = ctx.flags ? new Set(ctx.flags) : null;
  for (const t of (data && data.terminals) || []) {
    if (ids.has(t.id)) errors.push(`terminal "${t.id}": duplicate id`); ids.add(t.id);
    if (!(t.choices || []).length) warns.push(`terminal "${t.id}": no choices (a screen to read only)`);
    const cids = new Set();
    for (const c of t.choices || []) {
      if (cids.has(c.id)) errors.push(`terminal "${t.id}": duplicate choice "${c.id}"`); cids.add(c.id);
      if (c.complete && tasks.size && !tasks.has(c.complete)) errors.push(`terminal "${t.id}" choice "${c.id}": complete "${c.complete}" is not a task`);
      if (c.next && !((data.terminals || []).some((x) => x.id === c.next))) errors.push(`terminal "${t.id}" choice "${c.id}": next "${c.next}" is not a terminal`);
      if (!c.info) warns.push(`terminal "${t.id}" choice "${c.id}": no plain-words info (the ⓘ cannot explain it, U29)`);
      if (c.hold && c.decision) warns.push(`terminal "${t.id}" choice "${c.id}": hold and decision together (pick one)`);
      void flagsKnown;
    }
    if (t.room && rooms.size && !rooms.has(t.room)) errors.push(`terminal "${t.id}": room "${t.room}" is not in plan.json`);
  }
  return { errors, warns };
}
