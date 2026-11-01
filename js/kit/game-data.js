/* game-kit 6e0b6f0: js/game-data.js — edit in game-kit and run tools/kit-sync.js */
// Pure helpers over a standard game's data files (no DOM, no THREE; Node + browser). docs/standard-3d.md "Data".
// ---- progression definition derived from stages.json + tasks.json (the standard: tasks ARE the goals) ----------------
// goal id = task id; a task is done when the flag of the same name is set (Progression.flag(id)).
export function buildProgressionDef(stages, tasks, plan) {
  const roomName = (id) => ((plan && plan.rooms) || []).find((r) => r.id === id)?.name;
  return {
    goal: stages.goal,
    stats: stages.stats,
    levels: stages.levels.map((l) => ({ ...l })),
    unlocks: stages.unlocks || {},
    goals: tasks.map((t) => ({ id: t.id, text: t.title, level: t.stage, optional: !!t.optional, where: roomName(t.room), meaning: t.meaning, when: [{ label: t.title, flag: t.id }] })),
  };
}

// the task to work on at a station: the first not-done task of that station whose needs are done
export function taskAtStation(tasks, stationId, done) {
  return tasks.find((t) => t.station === stationId && !done.includes(t.id) && (t.needs || []).every((n) => done.includes(n))) || null;
}
// the first ending (file order) whose requires all hold: { tasks:[ids done], items:[ids owned], flags:[names set] }
export function pickEnding(endings, have) {
  return endings.find((e) => {
    const r = e.requires || {};
    return (r.tasks || []).every((t) => have.tasks.includes(t)) && (r.items || []).every((i) => have.items.includes(i)) && (r.flags || []).every((f) => have.flags.includes(f));
  }) || null;
}
