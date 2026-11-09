// 5.7: the two windows of the new stages.
//   numberLock  the key cabinet of the old forestry post (L6): three dials, the compass plate and the three eye photos are in the window (G4)
//   createReflector  the board on the fire tower (L7): keep looking at the figure on the bridge while the light stays on it. It drains the mind;
//               closing the eyes, or the mind running out, only resets the aim, never the game (rules.js AIM)
import * as THREE from 'three';
import { AIM, LOCK, checkLock, createAim, stepAim } from './rules.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const KANJI = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
const PLATE = [['北', 1], ['東', 2], ['南', 3], ['西', 4]];

export function numberLock(ctx, { sound } = {}) {
  if (ctx.qa) return Promise.resolve(true);
  ctx.fp.release();
  return new Promise((resolve) => {
    let ok = false, tries = 0;
    const digits = [0, 0, 0];
    ctx.wm.open('js-lock', { title: '壁の鍵箱', size: 'm', onClose: () => resolve(ok), render: (el) => {
      el.innerHTML = `<div class="js-lock">
        <p class="js-lock-lead">三本の杉の目が見ている向きを、順に数字にする。</p>
        <p class="js-lock-plate">${PLATE.map(([d, n]) => `<span><b>${d}</b>${KANJI[n]}</span>`).join('')}</p>
        <div class="js-lock-main">
          <div class="js-lock-dials">${LOCK.trees.map((t, i) => `<div class="js-dial" data-i="${i}"><span class="js-dial-name">${esc(t.short)}</span><button type="button" class="btn js-dial-b" data-d="1" aria-label="${esc(t.short)}の数字を増やす">▲</button><output class="js-dial-n">〇</output><button type="button" class="btn js-dial-b" data-d="-1" aria-label="${esc(t.short)}の数字を減らす">▼</button></div>`).join('')}</div>
          <ol class="js-lock-recs">${LOCK.trees.map((t) => `<li><img src="${esc(t.photo)}" alt=""><span><b>${esc(t.name)}</b>目の向き：${esc(t.dir)}</span></li>`).join('')}</ol>
        </div>
        <p class="js-lock-reply" role="status"></p>
        <div class="js-choices js-lock-acts"><button type="button" class="btn primary" data-open>開ける</button><button type="button" class="btn" data-quit>やめる</button></div>
      </div>`;
      const reply = el.querySelector('.js-lock-reply'), dials = [...el.querySelectorAll('.js-dial')];
      const show = () => dials.forEach((d, i) => { d.querySelector('.js-dial-n').textContent = KANJI[digits[i]]; });
      const turn = (i, by) => { digits[i] = (digits[i] + by + 10) % 10; show(); if (sound && sound.click) sound.click(); };
      dials.forEach((d, i) => {
        d.querySelectorAll('.js-dial-b').forEach((b) => { b.onclick = () => turn(i, Number(b.dataset.d)); });
        // dragging the number up or down turns it too
        const n = d.querySelector('.js-dial-n'); let y0 = null;
        n.onpointerdown = (e) => { y0 = e.clientY; n.setPointerCapture(e.pointerId); };
        n.onpointermove = (e) => { if (y0 == null || Math.abs(e.clientY - y0) < 22) return; turn(i, e.clientY < y0 ? 1 : -1); y0 = e.clientY; };
        n.onpointerup = n.onpointercancel = () => { y0 = null; };
      });
      el.querySelector('[data-quit]').onclick = () => ctx.wm.close();
      const open = el.querySelector('[data-open]');
      open.onclick = () => {
        const r = checkLock(digits, ++tries);
        reply.textContent = r.text; reply.dataset.ok = r.ok ? '1' : '';
        if (!r.ok) { el.querySelector('.js-lock').classList.remove('js-lock-no'); void el.offsetWidth; el.querySelector('.js-lock').classList.add('js-lock-no'); return; }
        ok = true; dials.forEach((d) => d.querySelectorAll('button').forEach((b) => { b.disabled = true; }));
        if (ctx.audio && ctx.audio.noise) ctx.audio.noise('thud', { gain: 0.5 });
        open.textContent = '鍵を取る'; open.onclick = () => ctx.wm.close();
        el.querySelector('[data-quit]').hidden = true; open.focus();
      };
      setTimeout(() => open.focus({ preventScroll: true }), 30);
    } });
  });
}

const glowTexture = (inner, outer) => {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), r = g.createRadialGradient(64, 64, 2, 64, 64, 64);
  r.addColorStop(0, inner); r.addColorStop(0.35, outer); r.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
};

// the look from the board to the figure: the player's eyes, a little shake that grows as the mind goes
export function createReflector(ctx, { shared, gaze, fear, sound, mountain, say, figure, bridge }) {
  const TARGET = new THREE.Vector3(bridge.x, 1.6, bridge.z);
  const mk = (tex, w) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, fog: false })); s.scale.set(w, w, 1); s.visible = false; s.renderOrder = 5; ctx.scene.add(s); return s; };
  const spot = mk(glowTexture('rgba(255,244,214,1)', 'rgba(255,176,92,.5)'), 1.9);
  let cur = null;

  function card() {
    let el = document.getElementById('js-aim');
    if (!el) {
      document.body.insertAdjacentHTML('beforeend', '<div id="js-aim" class="js-aim" hidden><div class="js-aim-lens"></div><div class="js-aim-card"><p class="js-aim-eyebrow">見張り台 ／ 反射板</p><h2 class="js-aim-title">光を、白い姿に重ねる</h2><p class="js-aim-text">視線を動かすと、光の点が動きます。目を閉じると、狙いは最初からです。</p><div class="js-aim-bar"><i></i></div></div><button type="button" class="btn js-aim-quit"></button></div><div id="js-flash" class="js-flash" hidden></div>');
      el = document.getElementById('js-aim');
    }
    return el;
  }
  function stop(result) {
    const c = cur; if (!c) return; cur = null;
    removeEventListener('keydown', c.onKey, true);
    c.el.hidden = true; document.body.classList.remove('js-aiming'); spot.visible = false;
    ctx.camera.fov = c.fov0; ctx.camera.updateProjectionMatrix();
    if (c.fog) { const f = ctx.scene.fog; f.density = c.fog.d; f.color.copy(c.fog.c); if (c.fog.bg) ctx.scene.background.copy(c.fog.bg); }
    ctx.fp.bodySlow = 1; shared.aim = false; shared.forceClose = false; shared.aimDrive = false;
    if (mountain.parts.board) mountain.parts.board.visible = true;
    c.resolve(result);
  }
  function win(c) {
    c.phase = 'win'; c.t = 0; shared.aimDrive = true; shared.forceClose = false; shared.scripted = null;
    spot.visible = true; if (sound.sting) sound.sting(); if (sound.shatter) sound.shatter(); if (fear) fear.kick(1);
    const fl = document.getElementById('js-flash');
    if (fl && !ctx.calm) { fl.hidden = false; setTimeout(() => { fl.hidden = true; }, 900); }
    c.el.querySelector('.js-aim-title').textContent = '当たった';
    c.el.querySelector('.js-aim-text').textContent = '白い姿が、橋の上でよろめいた。';
    c.el.querySelector('.js-aim-quit').hidden = true;
  }
  function run() {
    if (ctx.qa) return Promise.resolve(true);
    return new Promise((resolve) => {
      const fp = ctx.fp, cam = ctx.camera, el = card(), quit = el.querySelector('.js-aim-quit');
      ctx.teleport({ x: -33.75, z: -15, floor: 2, yaw: -Math.PI / 2 });
      gaze.state.sanity = Math.max(gaze.state.sanity, 90); gaze.state.grace = 0;
      el.hidden = false; document.body.classList.add('js-aiming');
      if (mountain.parts.board) mountain.parts.board.visible = false;   // we look through its hole
      shared.aim = true; fp.bodySlow = 0;
      el.querySelector('.js-aim-title').textContent = '光を、白い姿に重ねる';
      el.querySelector('.js-aim-text').textContent = '視線を動かすと、光の点が動きます。目を閉じると、狙いは最初からです。';
      el.querySelector('.js-aim-bar i').style.width = '0';
      quit.hidden = false; quit.textContent = ctx.isTouch ? '手を離す' : '[E] 手を離す';
      // through the hole the far side of the valley is clear and dark: a pale figure must be easy to find
      const fg = ctx.scene.fog, sky = ctx.scene.background && ctx.scene.background.isColor ? ctx.scene.background : null;
      const fog = fg ? { d: fg.density, c: fg.color.clone(), bg: sky ? sky.clone() : null } : null;
      if (fg) { fg.density = 0.0065; fg.color.setHex(0x2a2320); if (sky) sky.setHex(0x2a2320); }
      cur = { fog, resolve, el, phase: 'aim', t: 0, wob: 0, aim: createAim(), fov0: cam.fov, force: 0, told: false, zoom: 0, dist: 35,
        onKey: (e) => { if (e.code !== 'KeyE' || !cur || cur.phase !== 'aim') return; e.preventDefault(); e.stopImmediatePropagation(); stop(false); } };
      quit.onclick = () => { if (cur && cur.phase === 'aim') stop(false); };
      addEventListener('keydown', cur.onKey, true);
      // start a little off the figure, so the first thing to do is to bring the light onto it
      const dx = TARGET.x - cam.position.x, dz = TARGET.z - cam.position.z;
      fp.yaw = Math.atan2(-dx, -dz) + 0.1; fp.pitch = Math.atan2(TARGET.y - cam.position.y, Math.hypot(dx, dz)) + 0.05;
      if (!document.pointerLockElement && !ctx.isTouch) fp.lock();
    });
  }
  const dir = new THREE.Vector3(), to = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), right = new THREE.Vector3(), p = new THREE.Vector3();
  function update(dt, active) {
    const c = cur; if (!c) return;
    const cam = ctx.camera, fp = ctx.fp;
    if (!active) return;   // a window (the notebook) is open: everything waits, and nothing is lost
    fp.bodySlow = 0;
    c.zoom = Math.min(1, c.zoom + dt / 0.5);
    cam.fov = c.fov0 + (34 - c.fov0) * c.zoom * c.zoom * (3 - 2 * c.zoom); cam.updateProjectionMatrix();
    if (c.phase === 'win') {
      c.t += dt;
      const f = figure(), k = Math.min(1, c.t / AIM.winSeconds);
      if (f) {
        f.root.visible = k < 1;
        f.root.position.set(bridge.x + k * 2.3, 0.37 - Math.max(0, k - 0.45) * 2.6, bridge.z + Math.sin(c.t * 15) * 0.06 * (1 - k));
        f.root.rotation.z = -k * 1.25;
        f.update(dt, { speed: 0, look: cam.position, pose: { attack: 'stunned', progress: 1 } });
      }
      spot.position.copy(TARGET); spot.material.opacity = Math.max(0, 1 - k * 1.3);
      if (k >= 1) { const fr = figure(); if (fr) fr.root.rotation.z = 0; stop(true); }
      return;
    }
    c.t += dt;
    const s = gaze.state, low = 1 - s.sanity / 100;
    const wob = AIM.wobble * (1 + low * 2);
    cam.getWorldDirection(dir);
    right.crossVectors(dir, up).normalize();
    const wa = (Math.sin(c.t * 1.31) + Math.sin(c.t * 2.87 + 1) * 0.5) * wob, wb = (Math.cos(c.t * 1.13) + Math.sin(c.t * 3.3) * 0.5) * wob;
    dir.addScaledVector(right, wa).addScaledVector(up, wb).normalize();
    to.copy(TARGET).sub(cam.position); c.dist = to.length(); to.divideScalar(c.dist);
    const angle = dir.angleTo(to), closedNow = c.force > 0 || gaze.closed;
    const on = !closedNow && angle < AIM.tolerance;
    // the light on the far end (none while the eyes are shut)
    p.copy(cam.position).addScaledVector(dir, c.dist);
    spot.position.copy(p); spot.visible = !closedNow; spot.material.opacity = on ? 1 : 0.6;
    if (c.force > 0) {
      c.force -= dt; s.sanity = Math.min(AIM.recoverTo, s.sanity + AIM.recoverRate * dt);
      if (c.force <= 0) { c.force = 0; shared.forceClose = false; }
    } else if (s.sanity <= AIM.closeAt) {
      c.force = AIM.closedHold; shared.forceClose = true; c.aim.progress = 0;
      if (fear) fear.kick(1); say('目が勝手に閉じた。息を整えて、もう一度。', 3.4);
    }
    const ev = stepAim(c.aim, { dt, onTarget: on, closed: closedNow });
    if (ev === 'reset' && c.force <= 0 && !c.told) { c.told = true; say('目を閉じた。板が逸れて、光は最初からだ。', 3.4); }
    shared.aimProgress = c.aim.progress;
    c.el.querySelector('.js-aim-bar i').style.width = `${Math.round(c.aim.progress * 100)}%`;
    c.el.classList.toggle('js-aim-on', on);
    if (ev === 'won') win(c);
  }
  return { run, update, get aiming() { return !!cur; }, cancel: () => stop(false), get snapshot() { return cur ? { phase: cur.phase, progress: cur.aim.progress, dist: cur.dist } : null; } };
}
