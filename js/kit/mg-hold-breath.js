/* game-kit 6e0b6f0: js/mg-hold-breath.js — edit in game-kit and run tools/kit-sync.js */
// Library mini game "hold-breath" (standard 1.8.4: hiding in a cupboard while it walks past, under the floor, behind a screen): something comes
// near and goes away again. Hold your breath (hold the button / Space) while it is close - the sense of it is the bar at the top - but you can
// only hold for so long. Breathing while it is close, or running out of breath, only starts the passing again (a "nearly heard" scare, no
// other penalty). When it has gone by, it is done.
//   cfg: title, help, sec (9: one passing), lung (6: seconds of breath), near (0.55: how close is "close"), ok, skin, stamp
//   hooks: { sound(name, ctx, v) }  name = 'step' (v = nearness) | 'gasp' | 'heard' | 'ok'
import { mgFrame } from './mg-frame.js';

/** how near it is at t (0..sec): it comes, lingers a moment, goes */
export const nearAt = (t, sec = 9) => { const u = t / sec; return u <= 0 || u >= 1 ? 0 : Math.pow(Math.sin(Math.PI * u), 2.2); };
/** the breath: drains while held, comes back twice as fast when breathing */
export const breathStep = (b, holding, dt, lung = 6) => Math.max(0, Math.min(1, b + (holding ? -dt / lung : (2 * dt) / lung)));
/** heard: breathing while it is close */
export const heard = (near, holding, limit = 0.55) => near >= limit && !holding;
export const holdBreathOk = (t, sec = 9) => t >= sec;

export default {
  type: 'hold-breath',
  about: '近づいてくる気配のあいだ息を止め、通り過ぎるのを待つ',
  mount(host, cfg = {}, ctx = {}, hooks = {}) {
    return new Promise((done) => {
      const sec = cfg.sec ?? 9, lung = cfg.lung ?? 6, limit = cfg.near ?? 0.55, snd = (k, v) => hooks.sound && hooks.sound(k, ctx, v);
      let t = -1, breath = 1, holding = false, raf = 0, last = 0, lastStep = 0;
      const f = mgFrame(host, { cfg, ctx, title: cfg.title || '息を殺す', help: cfg.help || '気配が近いあいだ（上の帯が赤い間）、ボタンを押し続けて息を止めてください。息が続くのは少しの間だけです。' }, (ok) => { cancelAnimationFrame(raf); done(ok); });
      f.body.innerHTML = `<div class="mgx-breath"><div class="mgx-breath-sense"><i></i><span>気配</span></div><div class="mgx-breath-eye" aria-hidden="true"></div>
        <div class="mgx-breath-lung"><i></i><span>息</span></div><button type="button" class="btn primary mgx-breath-btn">押している間、息を止める</button></div>`;
      const sense = f.body.querySelector('.mgx-breath-sense i'), lungEl = f.body.querySelector('.mgx-breath-lung i'), btn = f.body.querySelector('.mgx-breath-btn'), wrap = f.body.querySelector('.mgx-breath');
      const again = (line) => { snd('heard'); f.miss(); f.say(line); t = -1.2; };   // a short pause, then it comes again
      const tick = (now) => {
        const dt = last ? Math.min(0.05, (now - last) / 1000) : 0; last = now; t += dt;
        const near = nearAt(t, sec);
        breath = breathStep(breath, holding, dt, lung);
        sense.style.width = `${near * 100}%`; sense.classList.toggle('close', near >= limit); lungEl.style.width = `${breath * 100}%`;
        wrap.style.setProperty('--near', near.toFixed(3)); wrap.classList.toggle('holding', holding);
        if (now - lastStep > 900 - near * 500 && near > 0.05) { lastStep = now; snd('step', near); }
        if (breath <= 0) { holding = false; snd('gasp'); again('息が続かず、大きく吸ってしまった。…気づかれたか？'); }
        else if (heard(near, holding, limit)) again('息の音が漏れた。足音が止まり、また戻ってくる…');
        else if (holdBreathOk(t, sec)) { snd('ok'); f.say(cfg.ok || '足音は遠ざかっていった。'); f.win(800); return; }
        else if (t > 0) f.say(near >= limit ? 'すぐそこにいる。' : near > 0.2 ? '近づいてくる…' : t > sec * 0.6 ? '遠ざかっていく…' : '足音がする…');
        raf = requestAnimationFrame(tick);
      };
      const hold = (on) => { if (!f.done) holding = on && breath > 0.02; };
      btn.addEventListener('pointerdown', (e) => { e.preventDefault(); hold(true); });
      for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) btn.addEventListener(ev, () => hold(false));
      f.on('keydown', (e) => { if ((e.code === 'Space' || e.code === 'KeyE') && !e.repeat) { e.preventDefault(); hold(true); } });
      f.on('keyup', (e) => { if (e.code === 'Space' || e.code === 'KeyE') hold(false); });
      if (ctx.qa) return f.end(true);
      btn.focus(); raf = requestAnimationFrame(tick);
    });
  },
};
