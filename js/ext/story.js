// The story of 『邪視 ― 視線の山』 on top of the standard (docs/standard-3d.md in game-kit). The standard runs the stages, tasks, items,
// records, map, menus, saves, the stage looks (stages.json "look" / "show") and the chase (data/monsters.json, from the radio on).
// This module adds what is particular to this mountain:
//   L1 二階の備品   the uncle tells where he is going and leaves; the telescope shows the white figure far down the valley
//   L2 窓の向こう   it stands below the balcony and looks up (it never comes in: the rule is taught, E-01); the amado slides shut
//   L3 一階の机     the radio: static, a knock on the front door while you tune (H4), the uncle's voice; glasses, keys, the note
//   L4-L5          the standard monster hunts the trails; records make chains (the ending), the bell lures it, the hut: hold your breath
//   L6-L7          the crank on the gate, the car, the engine (the figure in the mirror while it cranks)
// Conversations use the one standard window (ctx.talk / ctx.choose); thoughts use the thought band (ctx.monologue).
import * as THREE from 'three';
import { useMinigames } from '../kit/mg-library.js';
import photoFocus from '../kit/mg-photo-focus.js';
import steadyHand from '../kit/mg-steady-hand.js';
import tuneRadio from '../kit/mg-tune-radio.js';
import sortItems from '../kit/mg-sort-items.js';
import timing from '../kit/mg-timing.js';
import searchDark from '../kit/mg-search-dark.js';
import pumpGauge from '../kit/mg-pump-gauge.js';
import holdBreath from '../kit/mg-hold-breath.js';
import { createFear } from '../kit/fear-fx.js';
import { showEndingScene } from '../kit/ending-scene.js';
import { dressMountain } from './mountain.js';
import { makeJashi } from './jashi.js';
import { createGaze } from './gaze.js';
import { createSound } from './sound.js';
import { CHAINS, completedChains } from './rules.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const REVEAL = { x: 4, z: -28 };              // where the telescope finds it
export const WATCH = { x: 1.2, z: 10.2 };            // where it stands below the balcony (L2-L3: never nearer than the front yard)
const STAGE_NAMES = ['一', '二', '三', '四', '五', '六', '七'];

export default function story(ext, shared) {
  const st = { uncleGone: false, deaths: 0, played: 0, charges: 2, seenWatch: false, watchT: -1, knocked: false, firstRoom: {}, chainsTold: [], mirror: false };
  let ctx = null, T = null, M = null, F = null, snd = null, fear = null, gaze = null, dying = false;
  const lvl = () => (ctx && ctx.prog ? ctx.prog.index : 0);
  const done = (id) => ctx.state.tasks.includes(id);
  const say = (text, sec) => ctx.monologue(text, sec ?? Math.min(9, 2.4 + String(text).length * 0.09));
  const talk = (key, o = {}) => (T[key] ? ctx.talk(T[key], o) : Promise.resolve());
  // 修司's voice over the radio (VOICEVOX, tools/local-media-voices.json): the words as a subtitle, the clip through the radio preset
  const GUIDE = {
    telescope: 'まず、二階のベランダへ。三脚のついた望遠鏡を確かめてくれ。',
    radio: '一階の机にある黒い無線機だ。つまみを動かして、俺の声が聞こえる所で止めてくれ。',
    glasses: '無線機の右に、黒いサングラスと鍵束がある。両方持っていってくれ。',
    bottle: '先に西の物置へ。床にある、蓋つきのボトルを二本持っていけ。近づかれたときに使える。',
    crank: '次は東の避難小屋だ。床に置いた、赤い握りの鉄のハンドルを探してくれ。',
    gate: 'ハンドルと鍵が揃ったな。別荘の西の駐車場へ戻って、ゲートを開けてくれ。',
    car: 'ゲートの奥の車に乗るんだ。エンジンがかかるまで、その場を離れるな。',
  };
  // one at a time, never over an open window (a talk, a mini game): the next waits for the window to close and the last clip to end
  let guideChain = Promise.resolve();
  const guide = (key) => {
    if (!GUIDE[key]) return guideChain;
    guideChain = guideChain.then(async () => {
      while (ctx.wm && ctx.wm.isOpen && !ctx.qa) await new Promise((r) => setTimeout(r, 300));
      if (ctx.voiceLine) ctx.voiceLine(`assets/audio/guide-${key}.wav`, 'radio');
      say(`修司（無線）「${GUIDE[key]}」`, 7);
      await wait(6.5);
    });
    return guideChain;
  };
  const wait = (sec) => new Promise((r) => setTimeout(r, (ctx.qa ? 0.05 : sec) * 1000));

  const MGX = useMinigames(ext, [
    [photoFocus, { type: 'photo-focus' }], [steadyHand, { type: 'steady-hand' }],
    [tuneRadio, { type: 'tune-radio', hooks: { sound: (k, c, v) => snd && snd.radioStatic(k !== 'ok' && k !== 'done', typeof v === 'number' ? v : 0) } }],
    [sortItems, { type: 'sort-items' }], [timing, { type: 'timing' }], [searchDark, { type: 'search-dark' }], [pumpGauge, { type: 'pump-gauge', hooks: { sound: () => snd && snd.chain() } }],
    [holdBreath, { type: 'hold-breath', hooks: { sound: (k) => { if (!snd) return; if (k === 'near' || k === 'step') snd.steps({ gain: 0.8 }); if (k === 'fail') snd.breath(); } } }],
  ]);
  // a task's own mini game inside its run() (talk before / after it)
  async function playMG(task, mg = task.minigame) {
    if (!mg) return true;
    if (ctx.qa) return true;
    const lib = MGX[mg.type]; if (!lib) return true;
    const host = document.createElement('div'); host.id = 'mg-custom'; host.className = 'gf-overlay'; document.body.appendChild(host);
    ctx.fp.release();
    try { return !!(await lib.mount(host, { title: task.title, help: task.hint || '', ...(mg.cfg || {}) }, ctx)); } finally { host.remove(); }
  }
  ext.registerUi('title', {
    kicker: 'JASHI ／ A FIRST-PERSON MOUNTAIN HORROR',
    tagline: '叔父の別荘の二階、ベランダの望遠鏡で見てしまった白い姿。目が合えば心を削られ、近づかれれば鎌が振り下ろされる。日が暮れる前に、山を下りる。',
    meta: '七つの段階 ・ 約15分 ・ PC・スマートフォン ・ ヘッドホン推奨',
    note: '怪異の姿、襲われて倒れる場面、驚かせる表現があります（設定の「おだやか」で弱められます）。ネット怪談「邪視」の骨組みを借りた創作です。修司の声：VOICEVOX:麒ヶ島宗麟。',
  });
  ext.registerPersist('jashi', {
    serialize: () => ({ uncleGone: st.uncleGone, deaths: st.deaths, played: st.played, charges: gaze ? gaze.charges : st.charges, seenWatch: st.seenWatch, knocked: st.knocked, chainsTold: st.chainsTold }),
    restore: (j) => { Object.assign(st, { uncleGone: false, deaths: 0, played: 0, charges: 2, seenWatch: false, knocked: false, chainsTold: [] }, j || {}); if (gaze) gaze.charges = st.charges; },
  });

  // a picture at the top of the screen for a moment (U14: things above, thoughts below)
  function flashPhoto(src, caption, sec = 2.4) {
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
      await talk('uncleLeave', { title: '二階の作業室' });
      st.uncleGone = true; applyStage(); snd.steps({ gain: 0.4 });
      say('叔父の足音が階段を下りて、玄関の戸が閉まった。', 4);
      await wait(0.6);
    }
    return playMG(task);
  }, onDone: async () => {
    await talk('telescope', { title: '望遠鏡' });
    snd.sting(); fear.kick(0.6);
  } });
  ext.registerTask('T_SHUTTER', { onDone: async () => {
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
    if (!(await playMG(task))) return false;
    // something walks round the hut while you hold the handle (H4: the wait has its event)
    snd.steps({ gain: 0.9 }); say('外を、何かが回っている。息を止めて。', 4);
    const ok = await playMG(task, { type: 'hold-breath', cfg: { title: '避難小屋：息を殺す', help: '足音が近い間は、ボタンを押し続けて息を止める。', sec: 8, ok: '足音は、沢の方へ遠ざかっていった。' } });
    if (!ok) { gaze.state.sanity = Math.max(20, gaze.state.sanity - 30); fear.kick(1); snd.sting(); say('息が漏れた。戸の隙間に、白い指が見えた。……今は、離れていく。', 5); }
    return true;
  }, onDone: () => talk('crank', { title: '避難小屋' }) });
  ext.registerTask('T_PHONE', { run: async () => {
    snd.ring(0.3); await wait(1.4);
    const v = await ctx.choose({ who: '着信', title: '泥の中の携帯電話', text: '圏外のはずの画面に「着信」とだけ出ている。出るか。', options: [{ id: 'no', label: '出ない' }, { id: 'yes', label: '出る', primary: true }] });
    if (v === 'yes') { ctx.setFlag('phone', { silent: true }); await talk('phone', { title: '着信' }); }
    else await talk('phoneIgnore', { title: '着信' });
    return true;
  } });
  ext.registerTask('T_GATE', { onDone: async () => {
    snd.chain(); const d = ctx.world.doors.get('D_GATE'); if (d) { d.isOpen = true; d.col && (d.col.off = true); }
    M.parts.crankArm.visible = true;
    await talk('gate', { title: '林道ゲート' });
  } });
  ext.registerTask('T_ENGINE', { run: async (c, task) => {
    await talk('engine', { title: '叔父の車' });
    // while the engine catches: the white figure in the mirror, behind the car (H4)
    if (!ctx.qa) { snd.engine(false); await wait(0.9); mirrorFigure(); snd.engine(false); await wait(1.2); }
    const ok = await playMG(task);
    if (ok) snd.engine(true);
    return ok;
  } });

  // ---------------------------------------------------------------- the bell lures it (it goes to the sound when it has lost you)
  function ringBell() {
    snd.bell(); if (M.parts.bell) M.parts.bell.userData.swing = 1.2;
    const m = ctx.monsters && ctx.monsters.list[0];
    if (m && m.spawned && m.ai.state !== 'chase' && m.ai.state !== 'off') { m.ai.lastSeen = { x: -12.7, z: -6, floor: 0 }; if (m.ai.goTo({ x: -12.7, z: -6.8 })) { m.ai.lookT = 0; m.ai.set('seek'); } }
  }
  ext.registerInteract('js-bell', { prompt: () => (done('T_BELL') ? '[E] 鐘を鳴らす（音の方へ誘う）' : ''), run: () => { if (done('T_BELL')) { ringBell(); say('鐘が鳴った。今のうちに、木の陰へ。', 4); } } });

  // ---------------------------------------------------------------- the figure before the radio, and in the mirror (the scripted one)
  function mirrorFigure() {
    if (!F) return; const cam = ctx.camera; const dir = new THREE.Vector3(); cam.getWorldDirection(dir);
    F.root.position.set(cam.position.x - dir.x * 7, 0, cam.position.z - dir.z * 7); F.root.rotation.y = Math.atan2(cam.position.x - F.root.position.x, cam.position.z - F.root.position.z);
    F.root.visible = true; st.mirror = true; flashPhoto('assets/photos/mountain-v4-1.webp', 'ミラーの中。白い姿が、車の後ろに立っていた。', 1.6); snd.sting(); fear.kick(1);
    setTimeout(() => { if (F) F.root.visible = false; st.mirror = false; }, ctx.qa ? 50 : 1500);
  }
  // L2-L3: it stands in the front yard and looks up at the villa. Looked at the first time: it tilts its head, comes two steps, and is
  // gone; a breath later it stands where it was (H3). It never comes nearer than the yard before the radio (it teaches the rule).
  function updateWatcher(dt) {
    const i = lvl(), on = (i === 1 || i === 2) && !done('T_RADIO') && !st.mirror;
    if (!F) return;
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
    if (dying) return; dying = true; st.deaths++;
    c.bus.emit('player:dead', { reason });
    snd.sting();
    const text = reason === 'gaze' ? '目を合わせ続けてしまった。目を閉じる（Q）か、木や壁を間に入れれば、心は戻る。' : reason === 'scythe' ? '鎌は三度で倒れる。振り上げたら、画面の縁が示す向きの反対へ離れる。ボトル（R）で怯ませることもできる。' : '山の中で、倒れた。';
    const lines = (T.death || []).map((l) => `<p class="js-death-line"><b>${esc(l.who)}</b>${esc(l.text)}</p>`).join('');
    const show = () => c.wm.open('death', { title: 'そらせない', size: 's', locked: true, render: (el) => {
      el.innerHTML = `<div class="js-death"><p class="js-death-kicker">THE EYE WAS STILL OPEN</p>${lines}<p class="js-death-text">${esc(text)}</p><div class="js-choices"><button type="button" class="btn primary" data-retry>この段階からやり直す</button></div></div>`;
      const b = el.querySelector('[data-retry]'); b.onclick = () => { c.wm.close(); }; setTimeout(() => b.focus(), 30);
    }, onClose: () => {
      dying = false; gaze.reset({ grace: 5 }); fear.reset(); applyStage();
      c.setFloor(c.checkpoint.floor || 0, c.checkpoint); c.fp.yaw = c.checkpoint.yaw || 0;
      c.bus.emit('player:respawn', { room: c.world.roomAt(c.checkpoint.x, c.checkpoint.z, c.camera.position.y) });
      c.ui.toast(`第${STAGE_NAMES[lvl()]}段階の区切りから、やり直します。`);
    } });
    const el = document.getElementById('js-jump');
    if (el && !c.calm) { el.hidden = false; setTimeout(() => { el.hidden = true; show(); }, 800); } else show();
  } });
  ext.registerScreen('ending', { keepSave: false, open: (c, e) => {
    const sec = Math.round(st.played), chains = completedChains(c.state.docsRead), recs = Object.values(CHAINS).flat().filter((d) => c.state.docsRead.includes(d)).length;
    fear && fear.reset(); snd && snd.radioStatic(false);
    showEndingScene(c, { photo: e.photo, kicker: e.kicker, title: e.title, text: e.text,
      stats: `記録 ${recs} / 8 ・ そろった記録 ${chains} / 3 ・ やり直し ${st.deaths} 回 ・ ${Math.floor(sec / 60)}分${String(sec % 60).padStart(2, '0')}秒`,
      buttons: [{ label: 'タイトルに戻る', primary: true, fn: () => location.reload() }] });
  } });

  // ---------------------------------------------------------------- what is where at each stage (the kit's stage-look does the "show" names)
  function applyStage() {
    if (!ctx || !M) return;
    const i = lvl();
    const U = M.people.uncle; if (U) U.root.visible = i === 0 && !st.uncleGone;
    if (M.parts.shutter) M.parts.shutter.target = done('T_SHUTTER') ? 1 : 0;
    const balc = ctx.world.doors.get('D_BALC'); if (balc && done('T_SHUTTER')) balc.close();
    const gate = ctx.world.doors.get('D_GATE'); if (gate && done('T_GATE')) { gate.isOpen = true; gate.col && (gate.col.off = true); }
    if (M.parts.crankArm) M.parts.crankArm.visible = done('T_GATE');
    if (gaze) gaze.updateBottles();
  }

  // ---------------------------------------------------------------- records: each one has the uncle's word; a whole chain is a thought
  function onDoc(id) {
    const key = `after_${id.replace(/^N_/, '').toLowerCase()}`;
    if (T[key]) setTimeout(() => talk(key, { title: '無線' }), 400);
    if (id === 'N_NOTE') setTimeout(() => talk('note', { title: '書き置き' }), 400);
    for (const [chain, ids] of Object.entries(CHAINS)) {
      if (!ids.includes(id) || st.chainsTold.includes(chain) || !ids.every((d) => ctx.state.docsRead.includes(d))) continue;
      st.chainsTold.push(chain);
      setTimeout(() => { talk(`chain_${chain}`, { title: 'そろった記録' }); ctx.ui.toast(`記録がそろった（${completedChains(ctx.state.docsRead)} / 3）`); }, 1600);
    }
    if (completedChains(ctx.state.docsRead) >= 2) ctx.setFlag('records2', { silent: true });
  }

  // ---------------------------------------------------------------- set up once the world is built
  ext.on('game:ready', (c) => {
    ctx = c; T = c.data.talk; snd = createSound(c);
    M = dressMountain(c);
    c.seatPickups && c.seatPickups();   // the desks, tables and shelves of mountain.js are in: put the pickups on them
    fear = createFear(c);
    F = makeJashi({ detail: 1 }); F.root.visible = false; c.scene.add(F.root);
    gaze = createGaze(c, { shared, mountain: M, sound: snd, fear, onDeath: (r) => c.die(r) });
    gaze.charges = st.charges;
    // the bell is something to use once its muffle is back (T_BELL): an invisible handle on the frame
    const bm = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.2, 0.8), new THREE.MeshBasicMaterial({ visible: false })); bm.position.set(-12.7, 1.4, -6.6); bm.name = 'js-bell'; bm.userData.interact = { kind: 'js-bell', id: 'bell' }; c.world.group.add(bm);
    // the station is the first use; afterwards the frame stays usable
    c.bus.on('task:done', ({ id }) => { if (id === 'T_BELL') c.world.interactables.push(bm); });
    if (c.state.tasks.includes('T_BELL')) c.world.interactables.push(bm);
    // the balcony door stays shut once the amado is drawn
    const balc = c.world.doors.get('D_BALC'); if (balc) { const base = balc.locked; balc.locked = () => (done('T_SHUTTER') ? true : base()); balc.def.hint = '雨戸を閉めた。もう窓には戻らない。'; }
    document.body.insertAdjacentHTML('beforeend', `<div id="js-photo" class="js-photo" hidden></div><div id="js-jump" class="js-jump" hidden><img src="assets/textures/monster-face-v4-2.webp" alt=""></div>`);
    c.warmImages = [...(c.warmImages || []), 'assets/textures/monster-face-v4-2.webp', 'assets/photos/mountain-v4-1.webp'];
    if (window.__gf || c.qa || c.debug) window.__js = { st, gaze, M, F: () => F, applyStage, chains: () => completedChains(c.state.docsRead), shared };
  });
  ext.registerBoot('js-walls', async (c, report) => { if (!M) return; report(0, '山を準備中…'); await Promise.race([M.ready, new Promise((r) => setTimeout(r, 12000))]); report(1, '山を準備中…'); });

  ext.on('game:start', async ({ resume }) => {
    dying = false; st.watchT = -1; gaze.reset(); applyStage();
    if (!resume) { await talk('opening', { title: '山の別荘', last: '片付けを始める' }); guide('telescope'); }
    else say(`第${STAGE_NAMES[lvl()]}段階から再開した。Tab で手帳、M で地図を開ける。`, 5);
  });
  ext.on('stage:up', () => {
    applyStage();
    const i = lvl();
    const G = [null, null, 'radio', 'bottle', 'crank', 'gate', 'car'][i];
    if (G && i !== 3 && i !== 5) setTimeout(() => guide(G), 900);
    if (i === 1) setTimeout(() => say('窓の外に、まだいる。目を合わせると胸が苦しい。Q で目を閉じられる。', 7), 1200);
    if (i === 3) setTimeout(() => guide('bottle').then(() => say('外では、白い姿が林道を歩いている。目を合わせず、木の陰を選んで。', 6)), 1500);
    if (i === 5) setTimeout(() => guide('gate').then(() => say('橋を渡って、南から戻る。', 4)), 1200);
    if (i === 6) setTimeout(() => say('ゲートが上がった。駐車場の車まで。', 4), 800);
  });
  ext.on('player:room', ({ to }) => {
    if (st.firstRoom[to]) return; st.firstRoom[to] = true;
    if (to === 'CAB_HALL' && lvl() === 2 && !done('T_RADIO')) setTimeout(() => talk('downstairs', { title: '一階' }), 500);
    if (to === 'O_BRIDGE' && lvl() >= 4) setTimeout(() => talk('bridge', { title: '沢と橋' }), 600);
    if (to === 'SHELTER') snd.rustle({ gain: 0.5 });
  });
  ext.on('item:pickup', ({ id }) => { if (id === 'I_GLASSES') setTimeout(() => talk(done('T_RADIO') ? 'glasses' : 'earlyGlasses', { title: 'サングラス' }), 300); });
  ext.on('doc:read', ({ id }) => onDoc(id));
  ext.on('task:start', ({ id }) => { if (id === 'T_RADIO') snd.radioStatic(true, 0); });
  ext.on('task:abort', ({ id }) => { if (id === 'T_RADIO') snd.radioStatic(false); });
  ext.on('jashi:first-hit', () => talk('firstAttack', { title: '鎌' }));
  ext.on('jashi:stunned', () => { if (!st.repelTold) { st.repelTold = true; talk('repel', { title: 'ボトル' }); } });
  ext.on('monster:seen', ({ first }) => { if (first) say('こっちを見た。目を合わせるな。', 3); });

  // ---------------------------------------------------------------- per frame
  ext.registerSystem('jashi-story', { update: (dt, c, active) => {
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
      setTimeout(() => talk('encounter', { title: '窓の向こう' }), 900);
    }
    if (lookAt) { turnTo(lookAt.x, lookAt.y, lookAt.z, Math.min(1, dt * 4)); if ((lookAt.t -= dt) <= 0) lookAt = null; }
    // L3: a knock on the front door while you are downstairs and the radio is not yet tuned (H4)
    if (run && lvl() === 2 && !done('T_RADIO') && !st.knocked && c.state.room === 'CAB_HALL' && (st.hallT = (st.hallT || 0) + dt) > 14) { st.knocked = true; c.audio && c.audio.noise && c.audio.noise('knock', { n: 3, gain: 0.9 }); fear.kick(0.6); say('玄関の戸を、外から三度。……開けない。叔父なら、無線で呼ぶはずだ。', 6); }
    gaze.update(dt, run);
    const g = gaze.level(), danger = (c.fxState && c.fxState.danger) || 0;
    fear.update(dt, run ? Math.max(g, danger) : 0, { heart: !(c.fxState && c.fxState.chasing) });
    const room = c.data.plan.rooms.find((r) => r.id === c.state.room);
    snd.update(dt, { level: lvl(), outdoor: !room || room.kind === 'outdoor' });
    void clamp;
  } });
}
