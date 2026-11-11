// The story of 『邪視 ― 視線の山』 on top of the standard (docs/standard-3d.md in game-kit). The standard runs the stages, tasks, items,
// records, map, menus, saves, the stage looks (stages.json "look" / "show") and the chase (data/monsters.json, from the radio on).
// This module adds what is particular to this mountain:
//   L1 二階の備品   the uncle tells where he is going and leaves; the telescope shows the white figure far down the valley
//   L2 窓の向こう   it stands below the balcony and looks up (it never comes in: the rule is taught, E-01); the amado slides shut
//   L3 一階の机     the radio: static, a knock on the front door while you tune (H4), the uncle's voice; glasses, keys, the note
//   L4-L5          the standard monster hunts the trails; records make chains (the ending), the bell lures it; the three marks show it went
//                  to the hut, it waits there, the old bell down the creek draws it off, then the handle (5.8)
//   L6 旧詰所の番号   葛西さん's new padlock on the gate; the diary in the old forestry post, the three eyes make the number of the key cabinet (5.7)
//   L7 見返しの櫓    the figure stands on the only bridge and the creek floods; the fire tower's board throws the last sun back (5.7)
//   L8-L9          the crank on the gate, the car, the engine (the figure in the mirror while it cranks); it hunts harder after the board
// Conversations use the one standard window (ctx.talk / ctx.choose); thoughts use the thought band (ctx.monologue).
import * as THREE from 'three';
import { useMinigames } from '../kit/mg-library.js';
import steadyHand from '../kit/mg-steady-hand.js';
import tuneRadio from '../kit/mg-tune-radio.js';
import sortItems from '../kit/mg-sort-items.js';
import timing from '../kit/mg-timing.js';
import searchDark from '../kit/mg-search-dark.js';
import pumpGauge from '../kit/mg-pump-gauge.js';
import holdBreath from '../kit/mg-hold-breath.js';
import photoFocus from '../kit/mg-photo-focus.js';
import { createFear } from '../kit/fear-fx.js';
import { showEndingScene } from '../kit/ending-scene.js';
import { dressMountain } from './mountain.js';
import { makeJashi } from './jashi.js';
import { createGaze } from './gaze.js';
import { createSound } from './sound.js';
import { CHAINS, completedChains } from './rules.js';
import { numberLock, createReflector } from './tower.js';
import { createCull } from './cull.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const REVEAL = { x: 4, z: -28 };              // where the telescope finds it
export const WATCH = { x: 1.2, z: 10.2 };            // where it stands below the balcony (L2-L3: never nearer than the front yard)
const STAGE_NAMES = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
const BRIDGE = { x: 0.8, z: -10.2 };                  // where it stands in L7 (5.7)
const TOWER_SIDE = ['O_UPPER', 'TOWER_0', 'TOWER_1', 'TOWER_2'];
const L6 = 5, L7 = 6, L8 = 7;                         // the stage indexes the new stages hang on

export default function story(ext, shared) {
  let cull = null;
  const st = { uncleGone: false, deaths: 0, played: 0, charges: 2, seenWatch: false, watchT: -1, knocked: false, firstRoom: {}, chainsTold: [], mirror: false, l6Told: false, hard: false, barT: -99, floodT: -99, huntT: 0, floodWade: false, blinkT: 0 };
  let ctx = null, T = null, M = null, F = null, snd = null, fear = null, gaze = null, reflector = null, dying = false;
  const lvl = () => (ctx && ctx.prog ? ctx.prog.index : 0);
  const done = (id) => ctx.state.tasks.includes(id);
  const say = (text, sec) => ctx.monologue(text, sec ?? Math.min(9, 2.4 + String(text).length * 0.09));
  const talk = (key, o = {}) => (T[key] ? ctx.talk(T[key], o) : Promise.resolve());
  // 修司's voice over the radio (VOICEVOX, tools/local-media-voices.json): the words as a subtitle, the clip through the radio preset
  const GUIDE = {
    telescope: 'まず、二階のベランダへ。三脚のついた望遠鏡を確かめてくれ。',
    radio: '一階の机にある黒い無線機だ。つまみを動かして、俺の声が聞こえる所で止めてくれ。',
    glasses: '無線機の右に、黒いサングラスと鍵束がある。両方持っていってくれ。',
    bottle: '先に西の物置へ。棚にある、蓋つきのボトルを二本持っていけ。近づかれたときに使える。',
    crank: '次は東の避難小屋だ。床に置いた、赤い握りの鉄のハンドルを探してくれ。',
    gate: 'ハンドルと鍵が揃ったな。別荘の西の駐車場へ戻って、ゲートを開けてくれ。',
    car: 'ゲートの奥の車に乗るんだ。エンジンがかかるまで、その場を離れるな。',
    post: '旧詰所は、林道の奥から西へ入る山道の先だ。地図の南西の端にある。',
    bridge: '箱の鍵が手に入ったなら、山道を戻って、橋を北へ渡ってくれ。',
    tower: '櫓へ行くぞ。橋の南から西の伐採跡へ。西の端の山道を上がって、梯子で一番上まで登るんだ。',
  };
  // one at a time, never over an open window (a talk, a mini game): the next waits for the window to close and the last clip to end
  let guideChain = Promise.resolve();
  const guide = (key) => {
    if (!GUIDE[key]) return guideChain;
    guideChain = guideChain.then(async () => {
      while (ctx.wm && ctx.wm.isOpen && !ctx.qa) await new Promise((r) => setTimeout(r, 300));
      const here = false;   // 5.7.2: he is downstairs from the start, every word comes through the radio
      if (ctx.voiceLine) ctx.voiceLine(`assets/audio/guide-${key}.wav`, here ? null : 'radio');
      say(`修司${here ? '' : '（無線）'}「${GUIDE[key]}」`, 7);
      await wait(6.5);
    });
    return guideChain;
  };
  // a talk in the same queue as the guide lines: after the window that is open now
  const queueTalk = (key, o) => { guideChain = guideChain.then(async () => { while (ctx.wm && ctx.wm.isOpen && !ctx.qa) await new Promise((r) => setTimeout(r, 300)); await talk(key, o); }); return guideChain; };
  const wait = (sec) => new Promise((r) => setTimeout(r, (ctx.qa ? 0.05 : sec) * 1000));

  const MGX = useMinigames(ext, [
    [steadyHand, { type: 'steady-hand' }],
    [tuneRadio, { type: 'tune-radio', hooks: { sound: (k, c, v) => { if (snd) snd.radioStatic(k !== 'ok' && k !== 'done', typeof v === 'number' ? v : 0); if (k === 'turn' && v > 0.75 && !st.dialHeard && ctx.voiceLine) { st.dialHeard = true; ctx.voiceLine('assets/audio/uncle-dial.wav', 'radio'); } } } }],
    [sortItems, { type: 'sort-items' }], [timing, { type: 'timing' }], [photoFocus, { type: 'photo-focus' }], [searchDark, { type: 'search-dark' }], [pumpGauge, { type: 'pump-gauge', hooks: { sound: () => snd && snd.chain() } }],
    [holdBreath, { type: 'hold-breath', hooks: { sound: (k) => { if (!snd) return; if (k === 'near' || k === 'step') snd.steps({ gain: 0.8 }); if (k === 'fail') snd.breath(); } } }],
  ]);
  // a task's own mini game inside its run() (talk before / after it)
  async function playMG(task, mg = task.minigame) {
    if (!mg) return true;
    if (ctx.qa) return true;
    if (!MGX[mg.type]) return true;
    return ctx.runMinigame(task, mg);   /* the kit's runner: the game is blocked while it is open (no look hint over it) */
  }
  // 5.8.1 (feedback: show where to go next): the map shows one pin, 「次」, where the step card points now (its emphasis, its room,
  // else the task's station); the other startable tasks keep their plain pins
  const nextPins = (c, base = {}) => {
      const L = c.data.tasks.tasks || c.data.tasks, ok = (x) => x.steps && x.steps.length && c.canStart(x) === true;
      const t = L.find((x) => ok(x) && !x.optional) || L.find(ok); if (!t) return {};
      const card = (document.getElementById('guide') || {}).textContent || '';
      let i = t.steps.findIndex((s) => card.includes(s.text)); if (i < 0) i = 0;
      const s = t.steps[i], where = (key) => { const m = key && c.world.interactables.find((o) => o.userData.interact && `${o.userData.interact.kind}:${o.userData.interact.id}` === key); if (!m) return null; m.updateMatrixWorld(); const e = m.matrixWorld.elements; return { x: e[12], z: e[14] }; };
      const p = where(s.emphasis) || (s.done === 'room' && (s.room || t.room) ? {} : null) || where(t.station && `station:${t.station}`) || {};
      const room = s.done === 'room' ? s.room || t.room : t.room;
      const next = { id: 'next', room, ...p, label: `次：${s.text}`, kind: 'task' };
      const pins = [next];
      const R = c.world.rooms.get(room), nf = R && R.room ? R.room.floor || 0 : 0, cf = c.floor || 0;
      if (nf !== cf) {   // the place is on another floor: the way there on this one (the nearest ladder that goes toward it)
        const cam = c.camera.position; let best = null;
        for (const m of c.world.stairs.values()) {
          const it = m.userData.interact, to = it && it.to; if (!to || (to.floor || 0) === cf || Math.sign((to.floor || 0) - cf) !== Math.sign(nf - cf)) continue;
          m.updateMatrixWorld(); const e = m.matrixWorld.elements, d = Math.hypot(e[12] - cam.x, e[14] - cam.z);
          if (!best || d < best.d) best = { d, x: e[12], z: e[14] };
        }
        if (best) pins.push({ id: 'next-floor', floor: cf, x: best.x, z: best.z, label: nf < cf ? '次：下の階へ' : '次：上の階へ', kind: 'task' });
      }
      return { pins: [...pins, ...(base.pins || []).filter((x) => x.id !== t.id)] };
  };
  ext.registerUi('map', { state: (c, base) => nextPins(c, base) });
  // the map is drawn round the player: a line over it says where 「次」 is (arrow and metres) even when the pin is off the panel
  ext.on('map:open', () => setTimeout(() => {
    if (!ctx) return; const wrap = document.querySelector('.ms-wrap'); if (!wrap || !wrap.parentNode) return;
    let bar = wrap.parentNode.querySelector('.js-next-bar');
    const ps = (nextPins(ctx).pins || []).filter((p) => /^next/.test(p.id)), p = ps.find((x) => x.id === 'next-floor') || ps[0];
    if (!p) { if (bar) bar.remove(); return; }
    if (!bar) { bar = document.createElement('div'); bar.className = 'js-next-bar'; wrap.parentNode.insertBefore(bar, wrap); }
    let x = p.x, z = p.z; if (x == null) { const R = ctx.world.rooms.get(p.room); if (R) { x = R.cx; z = R.cz; } }
    const cam = ctx.camera.position, dx = x - cam.x, dz = z - cam.z, d = Math.hypot(dx, dz);
    const arrow = d < 3 ? '' : `<span class="js-next-arrow" style="transform:rotate(${(Math.atan2(dz, dx) * 180 / Math.PI).toFixed(0)}deg)"><svg viewBox="0 0 20 20" width="1em" height="1em" aria-hidden="true"><path d="M2 10h12M10 4l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`;
    bar.innerHTML = `${arrow}<b>${esc(p.label)}</b><span class="js-next-d">${d < 3 ? 'ここ' : `約${Math.round(d)}m`}</span>`;
  }, 60));
  ext.registerUi('title', {
    kicker: 'JASHI ／ A FIRST-PERSON MOUNTAIN HORROR',
    tagline: '叔父の別荘の二階、ベランダの望遠鏡で見てしまった白い姿。目が合えば心を削られ、近づかれれば鎌が振り下ろされる。日が暮れる前に、山を下りる。',
    meta: '九つの段階 ・ 約25分 ・ PC・スマホ ・ ヘッドホン推奨',
    note: '怪異の姿、襲われて倒れる場面、驚かせる表現があります（設定の「おだやか」で弱められます）。ネット怪談「邪視」の骨組みを借りた創作です。修司の声：VOICEVOX:麒ヶ島宗麟、電話の声：VOICEVOX:白上虎太郎。',
  });
  ext.registerPersist('jashi', {
    serialize: () => ({ uncleGone: st.uncleGone, deaths: st.deaths, played: st.played, charges: gaze ? gaze.charges : st.charges, seenWatch: st.seenWatch, knocked: st.knocked, chainsTold: st.chainsTold, l6Told: st.l6Told }),
    restore: (j, c, o = {}) => { Object.assign(st, { uncleGone: false, deaths: 0, played: 0, charges: 2, seenWatch: false, knocked: false, chainsTold: [], l6Told: false, hard: false }, j || {}); if (gaze) gaze.charges = st.charges; if (o.resume) migrateSave(c); },
  });
  // 5.7: a save from before the two new stages. The eye photos become records; a player already past the gate (the old stage seven, the engine)
  // keeps that progress: the new stages count as done and the game goes on at the engine. A player before the gate plays them as usual.
  function migrateSave(c) {
    const s = c.state;
    for (const n of [1, 2, 3]) if (s.tasks.includes(`T_MARK${n}`) && !s.docsRead.includes(`N_MARK${n}`)) s.docsRead.push(`N_MARK${n}`);
    if (!s.tasks.includes('T_GATE') || s.tasks.includes('T_REFLECT')) return;
    for (const id of ['T_POST', 'T_DIARY', 'T_KEYBOX', 'T_BRIDGE', 'T_TOWER', 'T_REFLECT']) { if (!s.tasks.includes(id)) s.tasks.push(id); c.prog.s.flags[id] = true; }
    if (!s.inv.includes('I_BOXKEY')) s.inv.push('I_BOXKEY');
    st.l6Told = true; c.prog.check(true);
  }

  // a picture at the top of the screen for a moment (U14: things above, thoughts below)
  function flashPhoto(src, caption, sec = 5) {   // long enough to read the caption (feedback: pictures changed too fast)
    const el = document.getElementById('js-photo'); if (!el) return;
    el.innerHTML = `<img src="${esc(src)}" alt="">${caption ? `<p>${esc(caption)}</p>` : ''}`;
    el.hidden = false; clearTimeout(flashPhoto.t); flashPhoto.t = setTimeout(() => { el.hidden = true; }, sec * 1000);
  }
  // turn my eyes towards a point (a staged glance: the figure below the balcony, the mirror)
  let lookAt = null, baseFov = 0;
  function turnTo(x, y, z, k) {
    const cam = ctx.camera, fp = ctx.fp; if (!fp) return;
    const dx = x - cam.position.x, dz = z - cam.position.z, ty = Math.atan2(-dx, -dz), tp = Math.atan2(y - cam.position.y, Math.hypot(dx, dz));
    fp.yaw += Math.atan2(Math.sin(ty - fp.yaw), Math.cos(ty - fp.yaw)) * k; fp.pitch += (tp - fp.pitch) * k;
  }

  // ---------------------------------------------------------------- tasks
  ext.registerTask('T_TELESCOPE', { run: async (c, task) => {
    if (!st.uncleGone) {
      await talk('uncleLeave', { title: '無線' });
      st.uncleGone = true; applyStage(); snd.steps({ gain: 0.4 });
      say('下で、玄関の戸が閉まる音がした。叔父が林道へ出ていった。', 4);
      await wait(0.6);
    }
    await scopeScene();   // the 4.x scene: no mini game, the lens zooms in by itself (feedback 2026-11-02)
    return true;
  }, onDone: async () => {
    await talk('telescope', { title: '望遠鏡' });
    snd.sting(); fear.kick(0.6);
  } });
  ext.registerTask('T_SHUTTER', { canStart: (c) => (c.state.room === 'CAB_BALC' ? '雨戸は部屋の中から引く。先に作業室へ戻ろう。' : true), onDone: async () => {   // drawn from inside only: pulled from the balcony it shut the player out (feedback 2026-11-02)
    M.parts.shutter.target = 1; snd.shutter();
    const d = ctx.world.doors.get('D_BALC'); if (d) d.close();
    await talk('shutter', { title: '二階の作業室' });
  } });
  ext.registerTask('T_RADIO', {
    canStart: () => true,
    onDone: async () => { snd.radioStatic(false); await talk('radioTuned', { title: '机の無線' }); if (ctx.state.inv.includes('I_GLASSES')) say('サングラスはもう持っている。外では、目を合わせない。', 6); else guide('glasses'); },
  });
  ext.registerTask('T_BOTTLE', { onDone: async () => { gaze.charges = 2; await talk('bottle', { title: '物置' }); say('近づかれたら、R でボトルを投げる。怯んだら、すぐ離れる。', 6); } });
  ext.registerTask('T_BELL', { onDone: () => { ringBell(); talk('bell', { title: '呼び鐘' }); } });
  ext.registerTask('T_CRANK', { run: async (c, task) => {
    // 5.7.4: it lies on the floor in plain sight: [E] picks it up (the search in the dark was one mini game too many)
    snd.pickup ? snd.pickup() : ctx.sound && ctx.sound('pickup'); say('床の赤い握りの鉄のハンドルを、拾い上げた。', 3); await wait(1.2);
    // 5.8: no held breath any more (one mini game too many): the bell has drawn it off, the danger is that it comes back
    snd.steps({ gain: 0.45 });
    return true;
  }, onDone: () => talk('crank', { title: '避難小屋' }) });
  // 山道の記録 (5.2): three eyes carved into cedars; each shot says where the next one is, the third one is watched back
  // 5.7: each shot is kept as a record with the direction written down: the number of the key cabinet comes from these
  const keepMark = (n) => { const id = `N_MARK${n}`; if (!ctx.state.docsRead.includes(id)) ctx.state.docsRead.push(id); ctx.ui.toast('写真と目の向きを、手帳に残した'); };
  ext.registerTask('T_MARK1', { onDone: () => { keepMark(1); return talk('mark1', { title: '伐採跡の杉' }); } });
  ext.registerTask('T_MARK2', { onDone: () => { keepMark(2); return talk('mark2', { title: '林道の奥の杉' }); } });
  ext.registerTask('T_MARK3', { onDone: async () => {
    keepMark(3); snd.sting(); fear.kick(0.6); gaze.state.sanity = Math.max(25, gaze.state.sanity - 12);
    await talk('mark3', { title: '沢の下手の杉' });
  } });
  ext.registerTask('T_PHONE', { run: async () => {
    snd.ring(0.3); await wait(1.4);
    const v = await ctx.choose({ who: '着信', title: '泥の中の携帯電話', text: '圏外のはずの画面に「着信」とだけ出ている。誰からかは分からない。出ても出なくても、帰り道は変わらない。出れば、その声を聞いたまま山を下りることになる。', options: [{ id: 'no', label: '出ない（声を聞かずに進む）' }, { id: 'yes', label: '出る（誰の声か確かめる）', primary: true }] });
    if (v === 'yes') { ctx.setFlag('phone', { silent: true }); await talk('phone', { title: '着信' }); }
    else await talk('phoneIgnore', { title: '着信' });
    return true;
  } });
  // 5.7 ---------------------------------------------------------------- the old post, the key cabinet, the blocked bridge, the board
  const showDoc = (id) => new Promise((res) => {
    const d = ctx.data.docs.find((x) => x.id === id);
    if (!ctx.state.docsRead.includes(id)) ctx.state.docsRead.push(id);
    if (ctx.qa) return res();
    ctx.wm.open('doc', { title: d.title, size: 's', onClose: res, render: (el) => { el.innerHTML = `${d.photo ? `<img class="gf-doc-img" src="${esc(d.photo)}" alt="">` : ''}${d.text.split('\n').map((p) => `<p>${esc(p)}</p>`).join('')}${d.feeling ? `<p class="iv-feel">${esc(d.feeling)}</p>` : ''}`; } });
  });
  ext.registerTask('T_POST', { onDone: () => talk('postArrive', { title: '旧詰所' }) });
  ext.registerTask('T_DIARY', { run: (c, task) => playMG(task), onDone: async () => { await showDoc('N_DIARY'); await talk('diary', { title: '当直日誌' }); } });
  ext.registerTask('T_KEYBOX', { run: () => numberLock(ctx, { sound: snd }), onDone: () => talk('keybox', { title: '鍵箱' }) });
  ext.registerTask('T_BRIDGE', { onDone: async () => {
    snd.sting(); fear.kick(0.9); lookAt = { x: BRIDGE.x, y: 2.3, z: BRIDGE.z, t: 1.4 };
    await wait(1.5); await talk('bridgeBlocked', { title: '沢の橋' }); guide('tower');
  } });
  ext.registerTask('T_TOWER', { onDone: () => talk('towerTop', { title: '火の見櫓' }) });
  ext.registerTask('T_REFLECT', {
    canStart: () => (reflector && reflector.aiming ? '板から、いったん手を離してから。' : true),
    run: () => reflector.run(),
    onDone: async () => { M.parts.boardHit = true; await talk('reflect', { title: '見張り台' }); },
  });
  ext.registerTask('T_GATE', { onDone: async () => {
    snd.chain(); const d = ctx.world.doors.get('D_GATE'); if (d) { d.isOpen = true; d.col && (d.col.off = true); }
    M.parts.crankArm.visible = true;
    await talk('gate', { title: '林道ゲート' });
  } });
  ext.registerTask('T_ENGINE', { run: async (c, task) => {
    await talk('engine', { title: '私の車' });
    // while the engine catches: the white figure in the mirror, behind the car (H4)
    if (!ctx.qa) { snd.engine(false); await wait(0.9); mirrorFigure(); snd.engine(false); await wait(1.2); }
    const ok = await playMG(task);
    if (ok) snd.engine(true);
    return ok;
  } });

  // ---------------------------------------------------------------- the bell lures it (it goes to the sound when it has lost you)
  function ringBell(at = { x: -12.7, z: -6.8 }, part = M.parts.bell) {
    snd.bell(); if (part) part.userData.swing = 1.2;
    const m = ctx.monsters && ctx.monsters.list[0];
    if (m && m.spawned && m.ai.state !== 'chase' && m.ai.state !== 'off') { m.ai.lastSeen = { x: at.x, z: at.z, floor: 0 }; if (m.ai.goTo({ x: at.x, z: at.z })) { m.ai.lookT = 0; m.ai.set('seek'); } }
  }
  // 5.8: the old bell down the creek (T_LURE): it stands guard at the hut once the three marks have shown where it went; the bell draws
  // it off for LURE_SEC, then it goes back to the hut. Ringing again draws it off again
  const BELL2 = { x: 24.4, z: -28.9 }, HUT_GUARD = { x: 20.2, z: -12.4 }, LURE_SEC = 75;
  const guarding = () => lvl() === 4 && done('T_MARK3') && !done('T_CRANK');
  function lure() { ringBell({ x: BELL2.x, z: BELL2.z + 1.2 }, M.parts.bell2); st.lureT = LURE_SEC; }
  ext.registerTask('T_LURE', { run: async () => { lure(); await wait(0.8); return true; }, onDone: () => talk('lure', { title: '下手の呼び鐘' }) });
  ext.registerInteract('js-bell2', { prompt: () => (done('T_LURE') ? '[E] 鐘を鳴らす（小屋から引き離す）' : ''), run: () => { if (done('T_LURE')) { lure(); say('鐘が鳴った。来る道から外れて、小屋へ。', 4); } } });
  ext.registerInteract('js-cache', {
    prompt: (o) => (ctx.state.inv.includes('I_BOTTLE') && !ctx.state.flags.includes(`cache_${o.id}`) ? '[E] 箱のボトルを持つ' : ''),
    run: (o) => {
      const id = o.id; if (!ctx.state.inv.includes('I_BOTTLE') || ctx.state.flags.includes(`cache_${id}`)) return;
      if (gaze.charges >= 2) { say('ボトルは、まだ二本ある。足りなくなったら、ここへ戻ろう。', 4); return; }
      ctx.setFlag(`cache_${id}`, { silent: true }); gaze.charges = 2; snd.pickup ? snd.pickup() : ctx.sound && ctx.sound('pickup');
      const k = (M.caches || []).find((x) => x.id === id); if (k) k.bottles.visible = false;
      ctx.ui.toast('ボトルを補充した（2本）'); say('箱に、同じボトルが残っていた。二本に戻った。', 4); ctx.save();
    },
  });
  ext.registerInteract('js-bell', { prompt: () => (done('T_BELL') ? '[E] 鐘を鳴らす（音の方へ誘う）' : ''), run: () => { if (done('T_BELL')) { ringBell(); say('鐘が鳴った。今のうちに、木の陰へ。', 4); } } });

  // ---------------------------------------------------------------- the telescope (4.x TELESCOPE_SCENES): three beats, the lens zooms in
  // by itself; something moves between the cedars, a white back with a sickle, then only the head turns to the window. Each card waits for the button.
  const SCOPE = [
    { eyebrow: '二階のベランダ ／ 望遠鏡', title: '木の間に、動くもの。', text: '鳥かと思って、少しだけレンズを動かした。', sec: 5, fov: [30, 13] },
    { eyebrow: '録画中', title: 'まだ、誰かいる。', text: '白い背中。手には草刈りの鎌のようなもの。声をかける前に、顔を確かめようと思った。', sec: 6, fov: [13, 7] },
    { eyebrow: '映像の乱れ', title: '頭だけが、こちらを向く。', text: '肩はまだ揺れている。顔だけが、こちらのベランダへ向き始めた。', sec: 6, fov: [7, 3.6] },
  ];
  const REVEAL = { x: 3.2, z: -6.5 };   // on the trail below, between the cedars, seen from the balcony
  function scopeScene() {
    if (!F) return Promise.resolve();
    const cam = ctx.camera, fov0 = cam.fov, eye = { x: -1.9, z: 18.35 };
    st.scope = true; ctx.blockers.push(scopeBlock); ctx.fp.release();
    ctx.teleport({ x: eye.x, z: eye.z, floor: 1, yaw: 0 });
    let el = document.getElementById('js-scope');
    if (!el) { document.body.insertAdjacentHTML('beforeend', '<div id="js-scope" class="js-scope" hidden><div class="js-scope-lens"></div><div class="js-scope-rec">● REC <span></span></div><div class="js-scope-card"><p class="js-scope-eyebrow"></p><h2 class="js-scope-title"></h2><p class="js-scope-text"></p><p class="js-scope-count"></p><div class="js-scope-bar"><i></i></div><button type="button" class="btn primary js-scope-next" hidden></button></div></div>'); el = document.getElementById('js-scope'); }
    const q = (c) => el.querySelector(c), total = SCOPE.reduce((n, b) => n + b.sec, 0);
    const scope = ctx.scene.getObjectByName('telescope'); if (scope) scope.visible = false;   // we look through it: its own body must not fill the lens
    el.hidden = false; F.root.visible = true; document.body.classList.add('js-scoping');   // the thought band and the HUD stay out of the lens
    return new Promise((done) => {
      let i = -1, tb = 0, tt = 0, last = performance.now(), waiting = false, closed = false;
      const nextBtn = q('.js-scope-next');
      const next = () => { waiting = false; nextBtn.hidden = true; if (i < SCOPE.length - 1) beat(i + 1); else finish(); };
      nextBtn.onclick = next;
      // 5.6.1 (feedback 2026-11-08 「望遠鏡が解除できない」): a pointer lock that lands after release() (the lock asked for when the talk
      // window closed) hid the cursor and sent every click to the canvas, so the button could not be pressed. The scene keeps the
      // pointer free, the keys close it too, and 8 s after the button shows the whole lens takes a click or a tap as well.
      let waitT = 0;
      const onKey = (e) => { if (!waiting || closed || !['Enter', 'NumpadEnter', 'Space', 'Escape', 'KeyE'].includes(e.code)) return; e.preventDefault(); e.stopPropagation(); next(); };
      const onLens = (e) => { if (!waiting || closed || waitT < 8 || e.target === nextBtn) return; e.preventDefault(); next(); };
      addEventListener('keydown', onKey, true); el.addEventListener('click', onLens);
      const beat = (k) => { i = k; tb = 0; const b = SCOPE[k]; q('.js-scope-eyebrow').textContent = b.eyebrow; q('.js-scope-title').textContent = b.title; q('.js-scope-text').textContent = b.text; q('.js-scope-count').textContent = `0${k + 1} / 03`; if (k === 1) snd.sting(); if (k === 2) { fear.kick(0.5); ctx.fx && ctx.fx.glitch && ctx.fx.glitch(0.25, 0.4); } };
      beat(0);
      const frame = (now) => {
        if (closed) return;   // 5.6.2: the frame already queued when the button closed the scene put the zoomed-in field of view back (a stuck 3.6-degree view for the rest of the game)
        const dt =Math.min(0.1, (now - last) / 1000) * (ctx.qa ? 40 : 1); last = now; tb += dt; tt += dt;
        const b = SCOPE[i], k = Math.min(1, tb / b.sec), ease = k * k * (3 - 2 * k);
        // the figure: walking across the trail, then still with its back to the villa, then the head turning (the body does not)
        const away = Math.atan2(REVEAL.x - eye.x, REVEAL.z - eye.z);   // facing away from the balcony
        if (i === 0) { F.root.position.set(REVEAL.x - 2.2 + k * 2.2, 0, REVEAL.z); F.root.rotation.y = Math.PI / 2; }
        else { F.root.position.set(REVEAL.x, 0, REVEAL.z); F.root.rotation.y += (away - F.root.rotation.y) * Math.min(1, dt * 3); }
        F.update(dt, { speed: i === 0 ? 1.1 : 0, look: i === 2 ? cam.position : null, headMax: 2.7, headRate: 0.55, pose: {} });
        // the lens follows the head and zooms in by itself
        turnTo(F.root.position.x, i === 0 ? 1.7 : 2.25, F.root.position.z, 1);
        cam.fov = b.fov[0] + (b.fov[1] - b.fov[0]) * ease; cam.updateProjectionMatrix();
        q('.js-scope-bar i').style.width = `${Math.min(100, (tt / total) * 100)}%`;
        q('.js-scope-rec span').textContent = `00:00:${String(Math.floor(tt)).padStart(2, '0')}`;
        // the lens moves on by itself (feedback 2026-11-02: the zoom plays, it is not a mini game); only the last card waits for the button
        if (document.pointerLockElement) document.exitPointerLock();   // the button needs the cursor
        if (waiting) { waitT += Math.min(0.1, dt); if (nextBtn.hidden) nextBtn.hidden = false; el.classList.toggle('js-scope-wait', waitT >= 8); }
        if (tb >= b.sec && !waiting) { if (i < SCOPE.length - 1) beat(i + 1); else if (ctx.qa) { next(); if (closed) return; } else { waiting = true; nextBtn.textContent = 'レンズから目を離す'; nextBtn.hidden = false; nextBtn.focus({ preventScroll: true }); } }
        if (closed) return;
        requestAnimationFrame(frame);
      };
      const finish = () => {
        closed = true; removeEventListener('keydown', onKey, true); el.classList.remove('js-scope-wait'); cam.fov = fov0; cam.updateProjectionMatrix(); el.hidden = true; document.body.classList.remove('js-scoping'); F.root.visible = false; st.scope = false; if (scope) scope.visible = true;
        const at = ctx.blockers.indexOf(scopeBlock); if (at >= 0) ctx.blockers.splice(at, 1);
        snd.sting(); fear.kick(0.8); done();
      };
      requestAnimationFrame(frame);
    });
  }
  const scopeBlock = () => !!st.scope;

  // ---------------------------------------------------------------- the figure before the radio, and in the mirror (the scripted one)
  function mirrorFigure() {
    if (!F) return; const cam = ctx.camera; const dir = new THREE.Vector3(); cam.getWorldDirection(dir);
    F.root.position.set(cam.position.x - dir.x * 7, 0, cam.position.z - dir.z * 7); F.root.rotation.y = Math.atan2(cam.position.x - F.root.position.x, cam.position.z - F.root.position.z);
    F.root.visible = true; st.mirror = true; flashPhoto('assets/photos/mountain-v4-1.webp', 'ミラーの中。白い姿が、車の後ろに立っていた。', 4); snd.sting(); fear.kick(1);
    setTimeout(() => { if (F) F.root.visible = false; st.mirror = false; }, ctx.qa ? 50 : 1500);
  }
  // L2-L3: it stands in the front yard and looks up at the villa. Looked at the first time: it tilts its head, comes two steps, and is
  // gone; a breath later it stands where it was (H3). It never comes nearer than the yard before the radio (it teaches the rule).
  function updateWatcher(dt) {
    const i = lvl(), on = (i === 1 || i === 2) && !done('T_RADIO') && !st.mirror;
    if (!F) return;
    if (st.scope) { shared.scripted = null; return; }   // the telescope scene drives F itself
    if (shared.aimDrive) return;                        // the reflector's last moment drives F itself
    if (done('T_KEYBOX') && !done('T_REFLECT') && !st.mirror) {   // 5.7: it stands on the bridge and does not move; the head follows you, the scythe rises as the light holds
      const cam = ctx.camera;
      F.root.visible = true; F.root.position.set(BRIDGE.x, 0.37, BRIDGE.z); F.root.rotation.set(0, Math.atan2(cam.position.x - BRIDGE.x, cam.position.z - BRIDGE.z), 0);
      const p = shared.aim ? shared.aimProgress || 0 : 0;
      F.update(dt, { speed: 0, look: cam.position, pose: p > 0.35 ? { attack: 'windup', progress: Math.min(1, (p - 0.35) / 0.6) } : {} });
      shared.scripted = { visible: true, x: BRIDGE.x, z: BRIDGE.z, floor: 0, yaw: F.root.rotation.y };
      return;
    }
    if (!on) { if (!st.mirror) F.root.visible = false; shared.scripted = null; return; }
    const cam = ctx.camera;
    if (st.watchT < 0) { F.root.visible = true; F.root.position.set(WATCH.x, 0, WATCH.z); }
    if (st.seenWatch && st.watchT >= 0) {
      const t = (st.watchT += dt);
      if (t < 1.4) { /* it looks */ } else if (t < 3.0) F.root.position.z = Math.min(13.4, F.root.position.z + dt * 2.0);
      else if (t < 3.6) F.root.visible = Math.random() < 0.5;
      else if (t < 5.2) F.root.visible = false;
      else { F.root.visible = true; F.root.position.set(WATCH.x - 3, 0, WATCH.z - 0.6); st.watchT = -2; }
    } else if (st.watchT < -1) { F.root.position.x += Math.sin(performance.now() / 4000) * dt * 0.3; }
    F.root.rotation.y = Math.atan2(cam.position.x - F.root.position.x, cam.position.z - F.root.position.z);
    F.update(dt, { speed: st.watchT > 1.4 && st.watchT < 3 ? 1.2 : 0, look: cam.position, pose: {} });
    shared.scripted = F.root.visible ? { visible: true, x: F.root.position.x, z: F.root.position.z, floor: 0, yaw: F.root.rotation.y } : null;
  }

  // ---------------------------------------------------------------- death: what went wrong, try this stage again
  ext.registerDeath({ run: (c, reason) => {
    if (dying) return; dying = true; st.deaths++; reflector && reflector.aiming && reflector.cancel();
    c.bus.emit('player:dead', { reason });
    snd.sting();
    const kq = c.isTouch ? '「目を閉じる」ボタン' : '目を閉じる（Q）', kr = c.isTouch ? '「ボトル」ボタン' : 'ボトル（R）';   // the advice names the control the player has
    const text = reason === 'gaze' ? `目を合わせ続けてしまった。${kq}か、木や壁を間に入れれば、心は戻る。` : reason === 'scythe' ? `鎌は三度で倒れる。振り上げたら、画面の縁が示す向きの反対へ離れる。${kr}で怯ませることもできる。` : '山の中で、倒れた。';
    const scy = reason === 'scythe', lines = ((scy && T.deathScythe) || T.death || []).map((l) => `<p class="js-death-line"><b>${esc(l.who)}</b>${esc(l.text)}</p>`).join('');
    const show = () => c.wm.open('death', { title: scy ? '振り下ろされた' : 'そらせない', size: 's', locked: true, render: (el) => {
      el.innerHTML = `<div class="js-death">${c.calm ? '' : '<img class="js-death-img" src="assets/textures/monster-face-v4-2.webp" alt="">'}<p class="js-death-kicker">${scy ? 'THE BLADE CAME DOWN' : 'THE EYE WAS STILL OPEN'}</p>${lines}<p class="js-death-text">${esc(text)}</p><div class="js-choices"><button type="button" class="btn primary" data-retry>この段階からやり直す</button></div></div>`;
      const b = el.querySelector('[data-retry]'); b.onclick = () => { c.wm.close(); }; setTimeout(() => b.focus(), 30);
    }, onClose: () => {
      dying = false; gaze.reset({ grace: 5 }); if (ctx.state.inv.includes('I_BOTTLE')) gaze.charges = 2; fear.reset(); applyStage();   // 5.7.2: a retry starts with both bottles
      c.setFloor(c.checkpoint.floor || 0, c.checkpoint); c.fp.yaw = c.checkpoint.yaw || 0;
      c.bus.emit('player:respawn', { room: c.world.roomAt(c.checkpoint.x, c.checkpoint.z, c.camera.position.y) });
      c.ui.toast(`第${STAGE_NAMES[lvl()]}段階の区切りから、やり直します。`);
    } });
    const el = document.getElementById('js-jump');
    if (el && !c.calm) { el.hidden = false; setTimeout(() => { el.hidden = true; show(); }, c.qa ? 50 : 2400); } else show();   // the face stays 2.4 s, then the same face heads the window
  } });
  ext.registerScreen('ending', { keepSave: false, open: (c, e) => {
    const sec = Math.round(st.played), chains = completedChains(c.state.docsRead), allRecs = Object.values(CHAINS).flat().length, allChains = Object.keys(CHAINS).length, recs = Object.values(CHAINS).flat().filter((d) => c.state.docsRead.includes(d)).length;
    fear && fear.reset(); snd && snd.radioStatic(false);
    showEndingScene(c, { photo: e.photo, kicker: e.kicker, title: e.title, text: e.text,
      stats: `記録 ${recs} / ${allRecs} ・ そろった記録 ${chains} / ${allChains} ・ やり直し ${st.deaths} 回 ・ ${Math.floor(sec / 60)}分${String(sec % 60).padStart(2, '0')}秒`,
      buttons: [{ label: 'タイトルに戻る', primary: true, fn: () => location.reload() }] });
  } });

  // ---------------------------------------------------------------- what is where at each stage (the kit's stage-look does the "show" names)
  function touchButtons() {
    const show = { KeyR: ctx.state.inv.includes('I_BOTTLE'), KeyC: ctx.controlOpen('crouch'), KeyF: ctx.controlOpen('light'), ShiftLeft: ctx.controlOpen('run') };
    for (const [k, on] of Object.entries(show)) { const b = document.querySelector(`#t-buttons [data-k="${k}"]`); if (b) b.style.display = on ? '' : 'none'; }
  }
  function applyStage() {
    if (!ctx || !M) return;
    const i = lvl();
    const U = M.people.uncle; if (U) U.root.visible = false;   // 5.7.2: he is downstairs, heard on the radio only
    if (M.parts.shutter) M.parts.shutter.target = done('T_SHUTTER') ? 1 : 0;
    const balc = ctx.world.doors.get('D_BALC'); if (balc && done('T_SHUTTER') && ctx.state.room !== 'CAB_BALC') balc.close();
    const gate = ctx.world.doors.get('D_GATE'); if (gate && done('T_GATE')) { gate.isOpen = true; gate.col && (gate.col.off = true); }
    if (M.parts.crankArm) M.parts.crankArm.visible = done('T_GATE');
    if (gaze) gaze.updateBottles();
    touchButtons();
    // 5.7: the flood and the blocked bridge come from the tasks, so a resumed game has them too
    const flooded = done('T_KEYBOX'), wade = st.floodWade && i === L7;
    if (M.setFlood) { M.setFlood(flooded, flooded && !wade); M.setBridgeShut(flooded && !done('T_REFLECT')); }
    if (M.parts.sun) M.parts.sun.visible = i === L7;
    if (M.parts.towerLamp) M.parts.towerLamp.intensity = i === L7 ? 5 : 0;
    if (done('T_REFLECT')) harden();
  }
  // after the board: it has been hurt and it comes for you (the last two stages). 5.7.2: it was too fast to get away from (3.7 against a walk
  // of 2.65 once the breath runs out): its chase is 3.1 now, it loses you sooner, and it is told where you are every 14 s, not 9
  function harden() {
    const m = ctx.monsters && ctx.monsters.list[0]; if (!m || st.hard) return;
    st.hard = true; const p = m.ai.p;
    Object.assign(p.speed, { wander: 1.3, seek: 1.8, chase: 3.1 }); p.sight = 22; p.notice = 0.9; p.near = 2.2; if (p.lose) { p.lose.cap = 28; p.lose.noLos = 3.5; }
    m.wait = Math.min(m.wait, 5);
  }
  // L7: the bridge figure replaces the walking one; afterwards it hunts: every few seconds it is told where you are, unless you have hidden
  function monsterTick(dt, run) {
    const m = ctx.monsters && ctx.monsters.list[0]; if (!m) return;
    if (lvl() === L7 && !done('T_REFLECT')) { if (m.spawned) { m.ai.despawn(); m.spawned = false; } m.wait = 1e6; return; }
    if (m.wait > 1e5) m.wait = 5;
    // 5.8: it waits at the hut until the bell draws it off
    if (run && guarding()) {
      if (st.lureT > 0) st.lureT -= dt;
      else if (m.spawned && m.ai.state !== 'chase' && m.ai.state !== 'off' && (st.guardT = (st.guardT || 0) + dt) >= 3) {
        st.guardT = 0; const d = Math.hypot(m.ai.pos.x - HUT_GUARD.x, m.ai.pos.z - HUT_GUARD.z);
        if (d > 2.5 && m.ai.goTo(HUT_GUARD)) { m.ai.lookT = 0; m.ai.set('seek'); }
      } else if (!m.spawned && m.wait > 2) m.wait = 2;   // it comes out soon (the kit counts the wait down)
    }
    if (!st.hard || !run || !m.spawned || m.ai.state === 'chase' || m.ai.state === 'off' || ctx.hidden) return;
    if ((st.huntT += dt) < 14) return; st.huntT = 0;
    const p = ctx.camera.position, at = { x: p.x, z: p.z, floor: ctx.floor || 0 };
    m.ai.lastSeen = at; if (m.ai.goTo(at)) { m.ai.lookT = 0; m.ai.set('seek'); }
  }
  // the water and the bridge on the way back (L7)
  function bridgeTick(c, t, run, dt) {
    if (!done('T_KEYBOX') || !run) return;
    const p = c.camera.position, ground = (c.floor || 0) === 0;
    // looking at the bridge figure too long closes the eyes for you: it cannot kill from there (the aim has its own rule in tower.js)
    if (lvl() === L7 && !done('T_REFLECT') && !reflector.aiming) {
      const S = gaze.state;
      if (st.blinkT > 0) { st.blinkT -= dt; S.sanity = Math.min(60, S.sanity + 20 * dt); if (st.blinkT <= 0) { st.blinkT = 0; shared.forceClose = false; } }
      else if (S.sanity <= 8) { st.blinkT = 3; shared.forceClose = true; fear.kick(0.8); say('目が勝手に閉じた。橋の方を、見続けてはいけない。', 4); }
    } else if (st.blinkT > 0) { st.blinkT = 0; shared.forceClose = false; }
    if (lvl() === L7 && !done('T_REFLECT') && ground) {
      // never shut out: a game resumed on the north bank (the save's own position) may wade back until it is south again
      if (p.z > -8 && !st.floodWade) { st.floodWade = true; applyStage(); say('今なら、まだ足の届く浅い所がある。南の岸へ戻ろう。', 6); }
      else if (st.floodWade && p.z < -12.2) { st.floodWade = false; applyStage(); }
      if (Math.hypot(p.x - BRIDGE.x, p.z + 12.2) < 1.8 && t - st.barT > 6 && !gaze.closed) {
        st.barT = t;
        const S = gaze.state; S.health = Math.max(34, S.health - 34); S.sanity = Math.max(10, S.sanity - 15); S.hit = 1;
        if (snd.scytheSwing) snd.scytheSwing(); if (snd.hit) snd.hit(); fear.kick(1); if (c.fx && c.fx.spook) c.fx.spook(0.8);
        c.teleport({ x: p.x, z: -14.6, floor: 0, yaw: c.fp.yaw });
        say('鎌の届く幅だ。ここは通れない。', 4);
      }
    }
    if (ground && !st.floodWade && !done('T_ENGINE') && p.z > -12.6 && p.z < -8 && Math.abs(p.x - BRIDGE.x) > 2.2 && t - st.floodT > 12) { st.floodT = t; say('流れが速い。足を入れたら持っていかれる。橋を通るしかない。', 5); }
  }

  // ---------------------------------------------------------------- records: each one has the uncle's word; a whole chain is a thought
  function onDoc(id) {
    const key = `after_${id.replace(/^N_/, '').toLowerCase()}`;
    // 5.7.2: never over the record itself (it flashed and was replaced): these wait until the player closes it
    if (T[key]) queueTalk(key, { title: '無線' });
    if (id === 'N_NOTE') queueTalk('note', { title: '書き置き' });
    for (const [chain, ids] of Object.entries(CHAINS)) {
      if (!ids.includes(id) || st.chainsTold.includes(chain) || !ids.every((d) => ctx.state.docsRead.includes(d))) continue;
      st.chainsTold.push(chain);
      ctx.ui.toast(`記録がそろった（${completedChains(ctx.state.docsRead)} / ${Object.keys(CHAINS).length}）`); queueTalk(`chain_${chain}`, { title: 'そろった記録' });
    }
    if (completedChains(ctx.state.docsRead) >= 2) ctx.setFlag('records2', { silent: true });
  }

  // ---------------------------------------------------------------- set up once the world is built
  ext.on('game:ready', (c) => {
    ctx = c; T = c.data.talk; snd = createSound(c);
    M = dressMountain(c);
    c.seatPickups && c.seatPickups();   // the desks, tables and shelves of mountain.js are in: put the pickups on them
    if (M.fitWallDocs) M.fitWallDocs();   // 5.8: the wall notices are read at their frames
    { // 5.8.1: a ladder is climbed, not jumped: its sound, the screen goes dark, the player comes out on the other floor
      const veil = document.createElement('div'); veil.id = 'js-ladder-veil';
      veil.style.cssText = 'position:fixed;inset:0;background:#000;opacity:0;pointer-events:none;transition:opacity .35s ease;z-index:40';
      document.body.appendChild(veil);
      let climbing = false; c.blockers.push(() => climbing);
      const use = c.useStairs;
      c.useStairs = (o) => {
        if (climbing) return false; if (!(o.to || (o.def && o.def.to))) return false;
        if (c.qa || c.calm) return use(o);   // the quick checks move at once
        climbing = true; if (snd.ladder) snd.ladder(); veil.style.opacity = '1';
        setTimeout(() => { use(o); setTimeout(() => { veil.style.opacity = '0'; climbing = false; }, 650); }, 400);
        return true;
      };
    }
    fear = createFear(c);
    F = makeJashi({ detail: 1 }); F.root.visible = false; c.scene.add(F.root);
    gaze = createGaze(c, { shared, mountain: M, sound: snd, fear, onDeath: (r) => c.die(r) });
    gaze.charges = st.charges;
    reflector = createReflector(c, { shared, gaze, fear, sound: snd, mountain: M, say, figure: () => F, bridge: BRIDGE });
    if (!c.qa) for (const id of ['N_MARK1', 'N_MARK2', 'N_MARK3', 'N_DIARY']) c.removePickup('doc', id);   // kept by the task that makes them (they lie nowhere on the map)
    // 5.6.2: the things you can walk up to too early say what is missing and where, not the kit's plain "not yet"
    { const early = { T_GATE: '', T_KEYBOX: '鍵箱だ。番号が分からない。先に、奥の机の引き出しで日誌を探そう。', T_ENGINE: 'ゲートの鎖が下りたままでは車を出せない。先に、ゲートの箱にハンドルを差す。', T_LURE: '古い呼び鐘だ。先に杉の刻み目をたどって、白い姿がどこにいるか確かめよう。', T_PHONE: '泥の中で何かが光っている。今は先に、やることがある。' };
      const crankEarly = () => (!c.state.tasks.includes('T_BOTTLE') ? '先に西の物置へ。小屋へ行くのは、ボトルを持ってからだ。' : !c.state.tasks.includes('T_MARK3') ? '小屋へ行く前に、杉の刻み目をたどって、白い姿がどこにいるか確かめよう。' : '小屋の前に、白い姿がいる。先に沢の下手の呼び鐘を鳴らして、引き離そう。');
      const base = c.canStart; c.canStart = (t) => { const r = base(t); if (r !== true && t.id === 'T_CRANK' && !c.state.tasks.includes('T_CRANK')) return crankEarly(); if (r !== true && t.id === 'T_GATE' && !c.state.tasks.includes('T_GATE')) return c.state.tasks.includes('T_CRANK') ? '巻上げの箱に、新しい錠がかかっている。葛西さんの札に「盗難よけ。鍵は旧詰所」とある。' : '巻上げの箱だ。差し込むハンドルが要る。東の避難小屋の床にあるはずだ。'; return r !== true && early[t.id] && !c.state.tasks.includes(t.id) ? early[t.id] : r; }; }
    // the bell is something to use once its muffle is back (T_BELL): an invisible handle on the frame
    const bm = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.2, 0.8), new THREE.MeshBasicMaterial({ visible: false })); bm.position.set(-12.7, 1.4, -6.6); bm.name = 'js-bell'; bm.userData.interact = { kind: 'js-bell', id: 'bell' }; c.world.group.add(bm);
    // the station is the first use; afterwards the frame stays usable
    c.bus.on('task:done', ({ id }) => { if (id === 'T_BELL') c.world.interactables.push(bm); });
    if (c.state.tasks.includes('T_BELL')) c.world.interactables.push(bm);
    // 5.8: the bell down the creek: the same, an unseen handle once T_LURE is done
    const bm2 = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.2, 0.9), new THREE.MeshBasicMaterial({ visible: false })); bm2.position.set(BELL2.x, 1.4, BELL2.z); bm2.name = 'js-bell2'; bm2.userData.interact = { kind: 'js-bell2', id: 'bell2' }; c.world.group.add(bm2);
    c.bus.on('task:done', ({ id }) => { if (id === 'T_LURE') c.world.interactables.push(bm2); });
    if (c.state.tasks.includes('T_LURE')) c.world.interactables.push(bm2);
    // 5.8: bottles to be found on the way (they ran out while exploring): each crate fills them up to two, once
    for (const k of M.caches || []) { k.handle.userData.interact = { kind: 'js-cache', id: k.id }; c.world.interactables.push(k.handle); k.bottles.visible = !c.state.flags.includes(`cache_${k.id}`); }
    // the balcony door stays shut once the amado is drawn
    const balc = c.world.doors.get('D_BALC'); if (balc) { const base = balc.locked; balc.locked = () => (done('T_SHUTTER') && c.state.room !== 'CAB_BALC' ? true : base()); /* locked from the room side only: outside, it always opens (a player shut out on the balcony, 2026-11-02) */ balc.def.hint = '雨戸を閉めた。もう窓には戻らない。'; }
    document.body.insertAdjacentHTML('beforeend', `<div id="js-photo" class="js-photo" hidden></div><div id="js-jump" class="js-jump" hidden><img src="assets/textures/monster-face-v4-2.webp" alt=""></div>`);
    c.warmImages = [...(c.warmImages || []), 'assets/textures/monster-face-v4-2.webp', 'assets/photos/mountain-v4-1.webp'];
    if (window.__gf || c.qa || c.debug) window.__js = { cull: () => cull, st, gaze, M, F: () => F, applyStage, chains: () => completedChains(c.state.docsRead), shared, reflector };
  });
  ext.registerBoot('js-walls', async (c, report) => { if (!M) return; report(0, '山を準備中…'); await Promise.race([M.ready, new Promise((r) => setTimeout(r, 12000))]);
    // 5.7.5: once the mountain and its outer walls are done, before the kit compiles the shaders: only the room you are in and the ones
    // next to it are drawn, small things outdoors not far off in the fog, the still meshes merged, three pooled lights for the pendants
    if (!cull && !/[?&]nocull(&|$)/.test(location.search)) cull = createCull(c);   // ?nocull: the old way, to compare
    report(1, '山を準備中…'); });

  ext.on('game:start', async ({ resume }) => {
    dying = false; st.watchT = -1; gaze.reset(); applyStage();
    if (!resume) { await talk('opening', { title: '山の別荘', last: '片付けを始める' }); guide('telescope'); }
    else {
      say(`第${STAGE_NAMES[lvl()]}段階から再開した。${ctx.isTouch ? "右上のメニューから手帳と地図を開ける" : "Tab で手帳、M で地図を開ける"}。`, 5);
      const p = ctx.camera.position; ctx.checkpoint = { x: p.x, z: p.z, yaw: ctx.fp.yaw, floor: ctx.floor || 0 };   // 5.7: a death after a resume comes back here, not to the villa on the far bank
      if (lvl() === L6 && !done('T_POST') && !st.l6Told) { st.l6Told = true; queueTalk('gateLocked', { title: '無線' }); guide('post'); }   // a save from the old gate stage: the padlock has to be told
    }
  });
  ext.on('stage:up', () => {
    applyStage();
    const i = lvl();
    const G = [null, null, 'radio', 'bottle', 'crank', null, 'bridge', 'gate', 'car'][i];
    if (G && i !== 3 && i !== L8) setTimeout(() => guide(G), 900);
    if (i === L6) { st.l6Told = true; setTimeout(() => { queueTalk('gateLocked', { title: '無線' }); guide('post'); }, 1000); }
    if (i === 1) setTimeout(() => say(`窓の外に、まだいる。目を合わせると胸が苦しい。${ctx.isTouch ? '「目を閉じる」ボタン' : 'Q'}で目を閉じられる。`, 7), 1200);
    if (i === 3) setTimeout(() => guide('bottle').then(() => say('外では、白い姿が林道を歩いている。目を合わせず、木の陰を選んで。', 6)), 1500);
    if (i === L8) setTimeout(() => guide('gate').then(() => say('橋を渡って、北へ戻る。足音が、さっきより速い。見つかったら、走るだけでは振り切りにくい。', 7)), 1200);
    if (i === 8) setTimeout(() => say('ゲートが上がった。駐車場の車まで。', 4), 800);
  });
  ext.on('player:room', ({ to }) => {
    if (TOWER_SIDE.includes(to) && lvl() === L7 && !done('T_BRIDGE')) ctx.completeTask('T_BRIDGE');   // came round without passing the bridge (a resumed game on the far bank): do not send them back
    if (st.firstRoom[to]) return; st.firstRoom[to] = true;
    if (to === 'CAB_HALL' && lvl() === 2 && !done('T_RADIO')) setTimeout(() => talk('downstairs', { title: '一階' }), 500);
    if (to === 'CAB_UP' && lvl() >= 3 && !done('T_ENGINE')) setTimeout(() => talk('nearCabin', { title: '二階' }), 500);   // 5.6.2: the player who walks back up to wait
    if (to === 'O_BRIDGE' && lvl() >= 4 && lvl() < L6) setTimeout(() => talk('bridge', { title: '沢と橋' }), 600);
    if (to === 'SHELTER') snd.rustle({ gain: 0.5 });
  });
  ext.on('item:pickup', ({ id }) => { if (id === 'I_GLASSES') setTimeout(() => talk(done('T_RADIO') ? 'glasses' : 'earlyGlasses', { title: 'サングラス' }), 300); });
  ext.on('doc:read', ({ id }) => onDoc(id));
  // 5.7.3: [E] (or the touch button) while standing in the doorway of an open door that closes: step back to the side you are on, then the
  // kit shuts it (it refuses while you stand in the frame, which read as "the door will not close")
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'KeyE' || !ctx || !ctx.world || (ctx.wm && ctx.wm.isOpen)) return;
    const p = ctx.camera.position;
    for (const d of ctx.world.doors.values()) {
      if (!d.isOpen || !d.def.closable || !d.mesh) continue;
      const b = new THREE.Box3().setFromObject(d.mesh), thinX = b.max.x - b.min.x < b.max.z - b.min.z;
      const cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2, half = (thinX ? b.max.z - b.min.z : b.max.x - b.min.x) / 2;
      const along = thinX ? p.z - cz : p.x - cx, off = thinX ? p.x - cx : p.z - cz;
      if (Math.abs(along) > half + 0.3 || Math.abs(off) >= 0.44) continue;
      const room = ctx.data.plan.rooms.find((r) => r.id === d.def.a), inside = room ? Math.sign(thinX ? room.x + room.w / 2 - cx : room.z + room.d / 2 - cz) || 1 : 1;
      const side = Math.abs(off) > 0.05 ? Math.sign(off) : inside;
      if (thinX) p.x = cx + side * 0.46; else p.z = cz + side * 0.46;
    }
  }, true);
  for (const ev of ['item:pickup', 'task:done', 'stage:up']) ext.on(ev, () => ctx && setTimeout(touchButtons, 0));   // after the task's items are given
  // the hut's sliding door shuts again from inside (plan: closable, the room shutHide): with it drawn, the figure outside cannot see you
  ext.on('door:open', ({ id }) => { if (id === 'D_SHELTER' && !st.hutTold) { st.hutTold = true; setTimeout(() => say('この引戸は、中から閉められる。', 4), 900); } });
  ext.on('door:close', ({ id }) => { if (id === 'D_SHELTER' && ctx.state.room === 'SHELTER') ctx.monologue('戸を閉めた。ここなら、外から見えない。', 4, { urgent: true }); });
  ext.on('task:start', ({ id }) => { if (id === 'T_RADIO') snd.radioStatic(true, 0); });
  ext.on('task:abort', ({ id }) => { if (id === 'T_RADIO') snd.radioStatic(false); });
  ext.on('jashi:first-hit', () => talk('firstAttack', { title: '鎌' }));
  ext.on('jashi:stunned', () => { if (!st.repelTold) { st.repelTold = true; talk('repel', { title: 'ボトル' }); } });
  ext.on('monster:seen', ({ first }) => { if (first) say('こっちを見た。目を合わせるな。', 3); });

  // ---------------------------------------------------------------- per frame
  ext.registerSystem('jashi-story', { update: (dt, c, active) => {
    if (cull) cull.update(dt);
    // never shut out on the balcony: once the amado is drawn, standing outside opens it and the door again; back inside, both close
    if (M && M.parts.shutter && done('T_SHUTTER')) {
      const balc = c.world.doors.get('D_BALC'), out = c.state.room === 'CAB_BALC';
      if (out && M.parts.shutter.target !== 0) { M.parts.shutter.target = 0; if (balc && !balc.isOpen) balc.open(); say('雨戸を少し開けて、中へ戻ろう。', 4); }
      else if (!out && M.parts.shutter.target === 0 && c.state.room === 'CAB_UP' && c.camera.position.z > 19.9) { M.parts.shutter.target = 1; snd.shutter(); if (balc) balc.close(); }
    }
    if (!M) return;
    const t = performance.now() / 1000;
    M.update(dt, t);
    if (M.parts.bell && M.parts.bell.userData.swing) { const s = (M.parts.bell.userData.swing = Math.max(0, M.parts.bell.userData.swing - dt * 0.4)); M.parts.bell.rotation.z = Math.sin(t * 7) * 0.3 * s; }
    if (M.parts.crankArm && M.parts.crankArm.visible) M.parts.crankArm.rotation.x = 0;
    const run = active && c.state.started && !dying && !c.state.ended;
    if (run) st.played += dt;
    updateWatcher(dt);
    // L2: the first time its face is in view, it reacts (and the encounter talk)
    if (run && lvl() === 1 && shared.scripted && !st.seenWatch && document.body.classList.contains('js-gazing')) {
      st.seenWatch = true; st.watchT = 0; snd.sting(); fear.kick(0.9); c.fx && c.fx.glitch && c.fx.glitch(0.3, 0.3);
      lookAt = { x: F.root.position.x, y: 2.3, z: F.root.position.z, t: 1.4 };
      setTimeout(() => talk('encounter', { title: '窓の向こう' }), 3200);   // after it has looked and stepped closer: the window must not cover the moment it notices you
    }
    if (lookAt) { turnTo(lookAt.x, lookAt.y, lookAt.z, Math.min(1, dt * 4)); if ((lookAt.t -= dt) <= 0) lookAt = null; }
    // L3: a knock on the front door while you are downstairs and the radio is not yet tuned (H4)
    if (run && lvl() === 2 && !done('T_RADIO') && !st.knocked && c.state.room === 'CAB_HALL' && (st.hallT = (st.hallT || 0) + dt) > 14) { st.knocked = true; c.audio && c.audio.noise && c.audio.noise('knock', { n: 3, gain: 0.9 }); fear.kick(0.6); say('玄関の戸を、外から三度。……開けない。叔父なら、無線で呼ぶはずだ。', 6); }
    reflector.update(dt, run);
    monsterTick(dt, run);
    bridgeTick(c, t, run, dt);
    gaze.update(dt, run);
    const g = gaze.level(), danger = (c.fxState && c.fxState.danger) || 0;
    fear.update(dt, run ? Math.max(g, danger) : 0, { heart: !(c.fxState && c.fxState.chasing) });
    const room = c.data.plan.rooms.find((r) => r.id === c.state.room);
    snd.update(dt, { level: lvl(), outdoor: !room || room.kind === 'outdoor' });
    void clamp;
  } });
}
