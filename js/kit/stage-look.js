/* game-kit 6e0b6f0: js/stage-look.js — edit in game-kit and run tools/kit-sync.js */
// The look of each stage, from data (standard 1.9). Before this every game wrote the same applyStage(): the fog and light per stage, which
// people / props are out at which stage or after which task, stations that are used up, and the title / night music.
//   stages.json  "levels": [{ "id": "L1", …, "look": { "fog": "#455b57", "density": 0.02, "light": 1, "background": "fog", "exposure": 1, "music": "assets/audio/dusk.mp3" } }, …]
//                "show": [{ "name": "van", "from": "L4" }, { "name": "salt_NW", "done": "T_SALT_NW" }, { "names": ["grandpa", "k"], "until": "L2" },
//                         { "name": "boarding", "stages": ["L4"], "notDone": "T_CAR" }, { "name": "seal", "flag": "sealed" }]
//   game.json    "music": { "title": "assets/audio/music-title.mp3", "volume": 0.35 },  "stationsWhenDone": "hide"
// A look is inherited: a level's look only changes what it names (L3 can set just "light": 0.4). Names are object names in the scene
// (mesh.name / group.name; the game names what it builds). Anything else per stage: ext.on('stage:look', ({ index, level, look }) => …).
// Pure helpers (lookAt, shown) + glue (createStageLook).
import * as THREE from 'three';

/** the look in force at level index i: every earlier level's look, then this one's (pure) */
export function lookAt(levels, i) {
  const out = {};
  for (let k = 0; k <= i && k < (levels || []).length; k++) Object.assign(out, (levels[k] && levels[k].look) || {});
  return out;
}
/** is a show rule true now? s = { level index, levels, done(id), flag(id) } (pure) */
export function shown(rule, s) {
  const idx = (id) => (s.levels || []).findIndex((l) => l.id === id);
  const all = (v, f) => [].concat(v).every(f);
  if (rule.stages && !rule.stages.map(idx).includes(s.level)) return false;
  if (rule.from != null && s.level < idx(rule.from)) return false;
  if (rule.until != null && s.level > idx(rule.until)) return false;
  if (rule.done != null && !all(rule.done, s.done)) return false;
  if (rule.notDone != null && !all(rule.notDone, (t) => !s.done(t))) return false;
  if (rule.flag != null && !all(rule.flag, s.flag)) return false;
  if (rule.notFlag != null && !all(rule.notFlag, (f) => !s.flag(f))) return false;
  return true;
}
/** stations whose tasks are all done (pure) */
export const usedStations = (stations, tasks, done) => (stations || []).filter((st) => { const ts = (tasks || []).filter((t) => t.station === st.id); return ts.length && ts.every((t) => done(t.id)); }).map((s) => s.id);

export function createStageLook(ctx, { levels = [], rules = [], music = null, stationsWhenDone = 'keep', stations = [], tasks = [] } = {}) {
  const hasLook = levels.some((l) => l && l.look);   // no look in the data: the fog / lights / music stay the game's own (an ext applyStage keeps working)
  const scene = ctx.scene, base = { lights: null, fog: null, bg: null, exposure: null };
  const audio = { el: null, src: null };
  const vol = () => ((music && music.volume) ?? 0.35) * ((ctx.settings && ctx.settings.volume) ?? 0.85);
  const play = (src) => {
    if (typeof Audio === 'undefined' || ctx.qa || audio.src === src) return;
    if (audio.el) { const old = audio.el; const t0 = performance.now(); const fade = () => { const p = Math.min(1, (performance.now() - t0) / 1200); old.volume = Math.max(0, vol() * (1 - p)); if (p < 1) requestAnimationFrame(fade); else old.pause(); }; fade(); }
    audio.src = src; audio.el = null;
    if (!src) return;
    const el = new Audio(src); el.loop = true; el.volume = vol(); audio.el = el;
    el.play().catch(() => { const go = () => audio.el === el && el.play().catch(() => {}); addEventListener('pointerdown', go, { once: true }); addEventListener('keydown', go, { once: true }); });
  };
  const state = () => ({
    level: ctx.prog ? ctx.prog.index ?? 0 : 0, levels,
    done: (id) => !!(ctx.state && ctx.state.tasks.includes(id)), flag: (id) => !!(ctx.state && ctx.state.flags.includes(id)),
  });
  function apply() {
    if (!scene) return null;
    const s = state(), look = lookAt(levels, s.level);
    const col = (v, d) => (v == null ? d : typeof v === 'number' ? v : parseInt(String(v).replace('#', ''), 16));
    if (!base.lights) {
      base.lights = []; scene.traverse((o) => { if (o.isLight) base.lights.push([o, o.intensity]); });
      // the preset has no fog / no plain background but a look names one: make it (exp2, 0.02 unless a look says)
      const looks = levels.map((l) => (l && l.look) || {}), first = (k) => (looks.find((x) => x[k] != null) || {})[k];
      if (hasLook && !scene.fog && (first('fog') != null || first('density') != null)) scene.fog = new THREE.FogExp2(col(first('fog'), 0x000000), first('density') ?? 0.02);
      if (hasLook && !scene.background && first('background') != null) scene.background = new THREE.Color(col(first('background') === 'fog' ? first('fog') : first('background'), 0x000000));
      base.fog = scene.fog ? { c: scene.fog.color.getHex(), d: scene.fog.density, n: scene.fog.near, f: scene.fog.far } : null; base.bg = scene.background && scene.background.isColor ? scene.background.getHex() : null; base.exposure = ctx.renderer ? ctx.renderer.toneMappingExposure : null;
    }
    if (hasLook && scene.fog && base.fog) {
      scene.fog.color.setHex(col(look.fog, base.fog.c));
      if (scene.fog.density != null) scene.fog.density = look.density ?? base.fog.d;
      if (scene.fog.near != null) { scene.fog.near = look.near ?? base.fog.n; scene.fog.far = look.far ?? base.fog.f; }
    }
    if (hasLook && scene.background && scene.background.isColor && base.bg != null) scene.background.setHex(look.background === 'fog' ? col(look.fog, base.bg) : col(look.background, base.bg));
    if (hasLook) for (const [o, k] of base.lights) if (o.isHemisphereLight || o.isDirectionalLight || o.isAmbientLight) o.intensity = k * (look.light ?? 1);
    if (hasLook && ctx.renderer && base.exposure != null) ctx.renderer.toneMappingExposure = base.exposure * (look.exposure ?? 1);
    for (const r of rules) { const vis = shown(r, s); for (const n of [].concat(r.names || r.name || [])) scene.traverse((o) => { if (o.name === n) o.visible = vis; }); }
    if (stationsWhenDone === 'hide' && ctx.world && ctx.world.interactables) {
      const used = new Set(usedStations(stations, tasks, s.done)), I = ctx.world.interactables;
      for (const st of stations || []) {
        const m = ctx.world.group && ctx.world.group.getObjectByName(`station:${st.id}`); if (!m) continue;
        const i = I.indexOf(m); if (used.has(st.id) && i >= 0) I.splice(i, 1); else if (!used.has(st.id) && i < 0) I.push(m);
      }
    }
    if (ctx.state && ctx.state.started && (hasLook || (music && music.title))) play(look.music || null);   // the title music stops at the start
    ctx.bus && ctx.bus.emit('stage:look', { index: s.level, level: levels[s.level] && levels[s.level].id, look });
    return look;
  }
  const title = () => { if (music && music.title) play(music.title); };
  const setVolume = () => { if (audio.el) audio.el.volume = vol(); };
  return { apply, title, setVolume, stop: () => play(null), get playing() { return audio.src; } };
}
