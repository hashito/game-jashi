/* game-kit 6e0b6f0: js/progression.js — edit in game-kit and run tools/kit-sync.js */
// Levels / stages, unlocks and goals as plain data + a small state machine (no DOM; runs in Node too).
// From 飛騨市長 (levels.js: 市長レベル, FEATURES), ひだまり薬局 (goals.js: 段階・信頼・解放) and
// 未然調書 (goals.js: 段階・タスク・解放). The screens are in progress-ui.js; check with tools/check-progression.mjs.
//
//   const prog = new Progression(DEF, { onLevelUp: (e) => pui.levelUp(e), onGoalDone: (g) => ui.toast(g.text) });
//   prog.add('decisions'); prog.set('approval', 52); prog.flag('MET_BOSS');   // each re-checks (opts.auto)
//   prog.isUnlocked('auto')  /  prog.lockText('auto')  /  prog.next()  // "次：毎月の判断を3回（1/3）"
//   prog.goalProgress('g1') -> { cur, need, frac, done }   prog.conditions(2) -> [{ label, cur, need, ok }]
//   store.save({ prog: prog.serialize() }); prog.restore(store.load()?.prog)
//   validate(DEF) -> ['unlock "x": not defined', ...]  (empty = fine)
//
// DEF = { goal: { title, short, sub, meter, unit }, stats: { approval: { name: '支持率', unit: '%', max: 100 } },
//   levels: [{ id, name, title, text, when: [cond], unlocks: ['key'], gate: true }],   // levels[0] = the start
//   unlocks: { key: { name, desc, why, icon } },
//   goals: [{ id, text, level, when | stat + target, optional, needs: 'unlockKey', where, meaning, weight }] }
// A cond: { stat, gte | lte | eq, label } | { flag } | { goal } | { all: [..] } | { any: [..] } |
//   { label, cur: (p) => n, need } | { label, test: (p) => bool } | (p) => bool.
// Level i+1 is reached when its `when` holds and (unless gate: false) every required goal of level i is done.
// Goals are checked whatever the level (done early counts) and stay done.

export const LABELS = {
  gte: (name, n, unit) => `${name} ${n}${unit}以上`,
  lte: (name, n, unit) => `${name} ${n}${unit}以下`,
  eq: (name, n, unit) => `${name} ${n}${unit}`,
  flag: (f) => f,
  goal: (text) => `「${text}」を終える`,
  goalsOf: (name) => `「${name}」の目標をすべて終える`,
  lock: (lv) => `Lv.${lv.no}「${lv.name}」で解放`,
  next: (text, cur, need) => `次：${text}${need > 1 ? `（${cur}/${need}）` : ""}`,
  toLevel: (lv) => `Lv.${lv.no}「${lv.name}」まで`,
  done: "すべての段階を終えました",
};

const arr = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);
const num = (v) => (typeof v === "number" && isFinite(v) ? v : 0);

export class Progression {
  constructor(def, opts = {}) {
    this.def = def;
    this.o = { auto: true, clock: () => Date.now(), ...opts };
    this.L = { ...LABELS, ...(opts.labels || {}) };
    this.levels = def.levels.map((l, i) => ({ ...l, index: i, no: i + 1 }));
    this.goals = (def.goals || []).map((g) => ({ ...g }));
    this.unlocks = def.unlocks || {};
    this.ev = {};
    for (const [k, n] of [["levelup", "onLevelUp"], ["unlock", "onUnlock"], ["goal", "onGoalDone"], ["change", "onChange"]])
      if (opts[n]) this.on(k, opts[n]);
    this.reset();
  }

  reset() {
    this.s = { level: 0, stats: {}, flags: {}, done: {}, at: {} };
    this.check(true);
  }

  // ---- events: levelup { level, unlocks[] } / unlock { key, name, ... } / goal (the goal) / change (something
  // new) / update (after every set / add / flag, for a HUD) ------------------------------------------
  on(name, fn) {
    (this.ev[name] = this.ev[name] || []).push(fn);
    return () => (this.ev[name] = this.ev[name].filter((f) => f !== fn));
  }
  emit(name, arg) {
    for (const f of this.ev[name] || []) f(arg, this);
  }

  // ---- inputs ------------------------------------------------------------------------------------
  stat(k) {
    const v = this.o.get ? this.o.get(k, this) : undefined;
    return v !== undefined ? v : num(this.s.stats[k]);
  }
  set(k, v) {
    this.s.stats[k] = v;
    return this.after();
  }
  add(k, n = 1) {
    this.s.stats[k] = num(this.s.stats[k]) + n;
    return this.after();
  }
  flag(f, on = true) {
    if (on) this.s.flags[f] = true;
    else delete this.s.flags[f];
    return this.after();
  }
  has(f) {
    return !!this.s.flags[f];
  }
  after() {
    const r = this.o.auto ? this.check() : null;
    this.emit("update", r);
    return r;
  }

  // ---- lookups -----------------------------------------------------------------------------------
  get index() {
    return this.s.level;
  }
  get level() {
    return this.levels[this.s.level];
  }
  get complete() {
    return this.s.level >= this.levels.length - 1 && this.goalsOf(this.level).every((g) => g.optional || this.isDone(g.id));
  }
  levelOf(ref) {
    if (typeof ref === "number") return this.levels[ref] || null;
    return this.levels.find((l) => l.id === ref) || null;
  }
  goal(id) {
    return this.goals.find((g) => g.id === id) || null;
  }
  goalsOf(lv) {
    const L = this.levelOf(typeof lv === "object" ? lv.index : lv);
    return L ? this.goals.filter((g) => g.level === L.id) : [];
  }
  isDone(id) {
    return Object.hasOwn(this.s.done, id);
  }
  unlockLevel(key) {
    return this.levels.find((l) => arr(l.unlocks).includes(key)) || null;
  }
  // a key no level unlocks counts as open (the game may ask about anything)
  isUnlocked(key) {
    const L = this.unlockLevel(key);
    return !L || L.index <= this.s.level;
  }
  unlockInfo(key) {
    return { key, name: key, ...(this.unlocks[key] || {}), level: this.unlockLevel(key) };
  }
  unlocksAt(lv) {
    const L = this.levelOf(lv);
    return L ? arr(L.unlocks).map((k) => this.unlockInfo(k)) : [];
  }
  lockText(key) {
    const L = this.unlockLevel(key);
    return L && L.index > this.s.level ? this.L.lock(L) : "";
  }

  // ---- conditions --------------------------------------------------------------------------------
  // { label, cur, need, ok } for one condition (cur / need are numbers when they mean something)
  cond(c) {
    if (typeof c === "function") return { label: "", cur: null, need: null, ok: !!c(this) };
    if (c.all || c.any) {
      const list = arr(c.all || c.any).map((x) => this.cond(x));
      const n = list.filter((x) => x.ok).length;
      const ok = c.all ? n === list.length : n > 0;
      return { label: c.label || list.map((x) => x.label).join(c.all ? "・" : " / "), cur: n, need: c.all ? list.length : 1, ok };
    }
    if (c.test) return { label: c.label || "", cur: null, need: null, ok: !!c.test(this) };
    if (c.cur) {
      const cur = c.cur(this);
      return { label: c.label || "", cur, need: c.need, ok: cur != null && cur >= c.need };
    }
    if (c.flag) return { label: c.label || this.L.flag(c.flag), cur: +this.has(c.flag), need: 1, ok: this.has(c.flag) };
    if (c.goal) {
      const g = this.goal(c.goal);
      return { label: c.label || this.L.goal(g ? g.text : c.goal), cur: +this.isDone(c.goal), need: 1, ok: this.isDone(c.goal) };
    }
    if (c.stat) {
      const meta = (this.def.stats || {})[c.stat] || {};
      const cur = this.stat(c.stat);
      const [op, need] = "gte" in c ? ["gte", c.gte] : "lte" in c ? ["lte", c.lte] : ["eq", c.eq];
      const ok = op === "gte" ? cur >= need : op === "lte" ? cur <= need : cur === need;
      return { label: c.label || this.L[op](meta.name || c.stat, need, meta.unit || ""), cur, need, ok };
    }
    return { label: c.label || "?", cur: null, need: null, ok: false };
  }

  // the conditions to reach a level (index or id): its `when` plus the required goals of the level before
  conditions(lv) {
    const L = this.levelOf(lv);
    if (!L) return [];
    const out = arr(L.when).map((c) => this.cond(c));
    const prev = this.levels[L.index - 1];
    if (prev && L.gate !== false) {
      const req = this.goalsOf(prev).filter((g) => !g.optional);
      if (req.length) {
        const n = req.filter((g) => this.isDone(g.id)).length;
        out.push({ label: this.L.goalsOf(prev.name), cur: n, need: req.length, ok: n === req.length });
      }
    }
    return out;
  }
  reachable(lv) {
    return this.conditions(lv).every((c) => c.ok);
  }

  // { cur, need, frac, done } of a goal
  goalProgress(id) {
    const g = typeof id === "object" ? id : this.goal(id);
    if (!g) return null;
    const conds = g.stat ? [{ stat: g.stat, gte: g.target ?? 1 }] : arr(g.when);
    const st = conds.map((c) => this.cond(c));
    let cur, need;
    if (st.length === 1 && typeof st[0].cur === "number" && typeof st[0].need === "number") [cur, need] = [st[0].cur, st[0].need];
    else [cur, need] = [st.filter((x) => x.ok).length, st.length];
    const live = st.length > 0 && st.every((x) => x.ok) && (!g.needs || this.isUnlocked(g.needs));
    const done = this.isDone(g.id) || live;
    if (done) cur = Math.max(cur, need);
    return { cur: Math.min(cur, need), need, frac: need ? Math.max(0, Math.min(1, cur / need)) : done ? 1 : 0, done };
  }

  // ---- evaluation --------------------------------------------------------------------------------
  // marks goals done and raises the level as far as it goes. silent: no events (loading a save).
  // Returns { goals, levels, unlocks } that are new.
  check(silent = false) {
    const out = { goals: [], levels: [], unlocks: [] };
    let again = true;
    while (again) {
      again = false;
      for (const g of this.goals)
        if (!this.isDone(g.id) && (!g.needs || this.isUnlocked(g.needs)) && this.goalProgress(g).done) {
          this.s.done[g.id] = this.o.clock();
          out.goals.push(g);
          again = true;
        }
      while (this.s.level < this.levels.length - 1 && this.reachable(this.s.level + 1)) {
        this.s.level += 1;
        const L = this.level;
        this.s.at[L.id] = this.o.clock();
        out.levels.push(L);
        out.unlocks.push(...this.unlocksAt(L.index));
        again = true;
      }
    }
    if (!silent) {
      for (const g of out.goals) this.emit("goal", g);
      for (const L of out.levels) {
        const unlocks = this.unlocksAt(L.index);
        for (const u of unlocks) this.emit("unlock", u);
        this.emit("levelup", { level: L, unlocks });
      }
      if (out.goals.length || out.levels.length) this.emit("change", out);
    }
    return out;
  }

  // the goal to show now: the first required, open goal of the current level (then optional ones)
  current() {
    const list = this.goalsOf(this.level).filter((g) => !this.isDone(g.id) && (!g.needs || this.isUnlocked(g.needs)));
    return list.find((g) => !g.optional) || list[0] || null;
  }

  // one line for a HUD or a hint: the current goal, else the first unmet condition of the next level
  next() {
    const g = this.current();
    if (g) {
      const p = this.goalProgress(g);
      return this.L.next(g.text, p.cur, p.need);
    }
    const nx = this.levels[this.s.level + 1];
    if (!nx) return this.L.done;
    const c = this.conditions(nx.index).find((x) => !x.ok);
    return c ? this.L.next(`${this.L.toLevel(nx)}　${c.label}`, num(c.cur), num(c.need)) : this.L.toLevel(nx);
  }

  // the whole meter 0..100: goals by weight (required 2, optional 1 unless goal.weight), else levels
  meter() {
    if (!this.goals.length) return Math.round((this.s.level / Math.max(1, this.levels.length - 1)) * 100);
    let all = 0;
    let got = 0;
    for (const g of this.goals) {
      const w = g.weight ?? (g.optional ? 1 : 2);
      all += w;
      got += w * this.goalProgress(g).frac;
    }
    return all ? Math.round((got / all) * 100) : 0;
  }

  // ---- the task screen model (未然調書 style): what to do now, the level's tasks done / undone with what each means,
  // what unlocks next (locked), and every ability with its on / off state. Plain data for progress-ui.js taskScreen().
  // goal.meaning = what the task is for (shown under it), goal.where = where to do it.
  taskModel() {
    const row = (g) => {
      const gp = this.goalProgress(g);
      const locked = !!(g.needs && !this.isUnlocked(g.needs));
      return { id: g.id, text: g.text, meaning: g.meaning || "", where: g.where || "", optional: !!g.optional, done: gp.done, locked, lockText: locked ? this.lockText(g.needs) : "", cur: gp.cur, need: gp.need, frac: gp.frac };
    };
    const tasks = this.goalsOf(this.level).map(row);
    const cg = this.current();
    const req = tasks.filter((t) => !t.optional);
    const nx = this.levels[this.s.level + 1] || null;
    const G = this.def.goal || {};
    return {
      goal: { title: G.title || "", sub: G.sub || "", meter: G.meter || "", pct: this.meter() },
      level: { no: this.level.no, name: this.level.name, title: this.level.title || "", text: this.level.text || "", count: this.levels.length },
      current: cg ? row(cg) : null,
      tasks,
      counts: { done: req.filter((t) => t.done).length, total: req.length },
      next: nx ? { level: { no: nx.no, name: nx.name, title: nx.title || "" }, conditions: this.conditions(nx.index), unlocks: this.unlocksAt(nx.index).map((u) => ({ ...u, locked: true })) } : null,
      abilities: this.levels.flatMap((L) => this.unlocksAt(L.index).map((u) => ({ key: u.key, name: u.name, desc: u.desc || "", why: u.why || "", icon: u.icon || "", on: L.index <= this.s.level, lockText: L.index <= this.s.level ? "" : this.L.lock(L), levelNo: L.no }))),
      complete: this.complete,
    };
  }

  // ---- saving ------------------------------------------------------------------------------------
  serialize() {
    return { v: 1, level: this.level.id, stats: { ...this.s.stats }, flags: { ...this.s.flags }, done: { ...this.s.done }, at: { ...this.s.at } };
  }
  restore(d) {
    this.s = { level: 0, stats: {}, flags: {}, done: {}, at: {} };
    if (d && d.v === 1) {
      const L = this.levelOf(d.level);
      Object.assign(this.s, { level: L ? L.index : 0, stats: { ...d.stats }, flags: { ...d.flags }, done: { ...d.done }, at: { ...d.at } });
      for (const id of Object.keys(this.s.done)) if (!this.goal(id)) delete this.s.done[id];
    }
    this.check(true);
    this.emit("update", null);
    return this;
  }

  // debug / ?level=N: jump to a level (index), marking the required goals before it done
  jump(index) {
    for (let i = 0; i < Math.min(index, this.levels.length - 1); i++) {
      for (const g of this.goalsOf(i)) if (!g.optional && !this.isDone(g.id)) this.s.done[g.id] = this.o.clock();
      this.s.level = Math.max(this.s.level, i + 1);
      this.s.at[this.levels[i + 1].id] ??= this.o.clock();
    }
    this.check(true);
    this.emit("update", null);
  }
}

// ---- validator: returns a list of problems (strings); [] = fine --------------------------------------
export function validate(def) {
  const P = [];
  const bad = (m) => P.push(m);
  if (!def || !Array.isArray(def.levels) || !def.levels.length) return ["levels: at least one level is required"];
  const stats = def.stats || {};
  const unlocks = def.unlocks || {};
  const goals = def.goals || [];
  const lvIndex = {};
  const dup = (kind, ids) => {
    const seen = new Set();
    for (const id of ids) {
      if (id == null || id === "") bad(`${kind}: an entry has no id`);
      else if (seen.has(id)) bad(`${kind} "${id}": duplicate id`);
      seen.add(id);
    }
  };
  dup("level", def.levels.map((l) => l.id));
  dup("goal", goals.map((g) => g.id));
  def.levels.forEach((l, i) => (lvIndex[l.id] ??= i));
  const goalLv = Object.fromEntries(goals.map((g) => [g.id, g.level in lvIndex ? lvIndex[g.level] : -1]));

  // unlocks: defined, unlocked by exactly one level, and every definition used
  const by = {};
  def.levels.forEach((l, i) =>
    arr(l.unlocks).forEach((k) => {
      if (!(k in unlocks)) bad(`level "${l.id}": unlock "${k}" is not defined in unlocks`);
      if (k in by) bad(`unlock "${k}": unlocked by more than one level ("${def.levels[by[k]].id}", "${l.id}")`);
      else by[k] = i;
    }),
  );
  for (const k of Object.keys(unlocks)) if (!(k in by)) bad(`unlock "${k}": no level unlocks it`);

  // conditions: known stats/goals, sane numbers; `at` = the level index the condition is checked for
  const walk = (c, where, at, isLevel) => {
    if (typeof c === "function" || (c && (c.test || c.cur))) return;
    if (!c || typeof c !== "object") return bad(`${where}: a condition is empty`);
    if (c.all || c.any) return arr(c.all || c.any).forEach((x) => walk(x, where, at, isLevel));
    if (c.goal) {
      if (!(c.goal in goalLv)) return bad(`${where}: goal "${c.goal}" does not exist`);
      if (isLevel && goalLv[c.goal] >= at) bad(`${where}: needs goal "${c.goal}" of the same or a later level (unreachable)`);
      return;
    }
    if (c.flag) return;
    if (c.stat) {
      const m = stats[c.stat];
      if (def.stats && !m) bad(`${where}: stat "${c.stat}" is not declared in stats`);
      const n = c.gte ?? c.lte ?? c.eq;
      if (typeof n !== "number") return bad(`${where}: stat "${c.stat}" needs a number in gte / lte / eq`);
      if (m && "gte" in c && m.max != null && c.gte > m.max) bad(`${where}: ${c.stat} >= ${c.gte} but its max is ${m.max} (unreachable)`);
      if (m && "lte" in c && m.min != null && c.lte < m.min) bad(`${where}: ${c.stat} <= ${c.lte} but its min is ${m.min} (unreachable)`);
      return;
    }
    bad(`${where}: unknown condition ${JSON.stringify(c)}`);
  };

  def.levels.forEach((l, i) => {
    if (!l.name) bad(`level "${l.id}": no name`);
    const when = arr(l.when);
    if (i === 0 && when.length) bad(`level "${l.id}": the first level is the start and cannot have conditions`);
    when.forEach((c) => walk(c, `level "${l.id}"`, i, true));
    // contradicting bounds on the same stat at one level
    const lo = {};
    const hi = {};
    for (const c of when) if (c && c.stat) ("gte" in c && (lo[c.stat] = Math.max(lo[c.stat] ?? -Infinity, c.gte)), "lte" in c && (hi[c.stat] = Math.min(hi[c.stat] ?? Infinity, c.lte)));
    for (const k of Object.keys(lo)) if (k in hi && lo[k] > hi[k]) bad(`level "${l.id}": ${k} >= ${lo[k]} and <= ${hi[k]} at once (unreachable)`);
    const gated = i > 0 && l.gate !== false && goals.some((g) => g.level === def.levels[i - 1].id && !g.optional);
    if (i > 0 && !when.length && !gated) bad(`level "${l.id}": no conditions and no required goals before it (reached at once)`);
  });

  for (const g of goals) {
    const where = `goal "${g.id}"`;
    if (!g.text) bad(`${where}: no text`);
    if (g.level != null && !(g.level in lvIndex)) bad(`${where}: level "${g.level}" does not exist`);
    if (!g.stat && !arr(g.when).length) bad(`${where}: no condition (when, or stat + target)`);
    if (g.stat) walk({ stat: g.stat, gte: g.target ?? 1 }, where, goalLv[g.id], false);
    arr(g.when).forEach((c) => walk(c, where, goalLv[g.id], false));
    if (g.needs) {
      if (!(g.needs in by)) bad(`${where}: needs "${g.needs}", which no level unlocks`);
      else if (goalLv[g.id] >= 0 && by[g.needs] > goalLv[g.id]) bad(`${where}: needs "${g.needs}", unlocked only at level "${def.levels[by[g.needs]].id}" (later than its own)`);
    }
  }
  // goals that depend on each other in a loop
  const deps = (g) => arr(g.when).flatMap(function f(c) { return c && (c.all || c.any) ? arr(c.all || c.any).flatMap(f) : c && c.goal ? [c.goal] : []; });
  const state = {};
  const visit = (id, path) => {
    if (state[id] === 2) return;
    if (state[id] === 1) return bad(`goals: circular dependency ${[...path, id].join(" -> ")}`);
    state[id] = 1;
    const g = goals.find((x) => x.id === id);
    if (g) for (const d of deps(g)) visit(d, [...path, id]);
    state[id] = 2;
  };
  for (const g of goals) visit(g.id, []);
  return P;
}
