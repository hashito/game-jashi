/* game-kit 6e0b6f0: js/mg-search-dark.js — edit in game-kit and run tools/kit-sync.js */
// Library mini game "search-dark" (standard 1.8.2: a flashlight in a dark room, a cellar wall, the underside of a floor): the picture is dark
// except where the light falls; find every hidden mark by lighting it and tapping it. A tap that misses only says so. Move the light with the
// mouse / a finger, or the arrow keys, and look with a tap / Space / E. A mark is found only while it is lit.
//   cfg: title, help, image (url of the dark place; default a plain dark wall), marks ([{ x, y, label }] 0..1; default three),
//        r (0.24: the light's radius as a part of the height), hit (0.08: how close a tap must be, part of the height), ok (the line)
//   hooks: { sound(name, ctx) }  name = 'found' | 'miss' | 'ok'
import { mgFrame, esc } from './mg-frame.js';

const DEF = [{ x: 0.18, y: 0.72, label: '爪の跡' }, { x: 0.62, y: 0.28, label: '古い札' }, { x: 0.86, y: 0.8, label: '小さな手形' }];
/** the mark (index) a look at p finds: lit (within r of the light) and within hit of p, measured in heights (aspect = width / height); -1 for none */
export function findAt(marks, found, p, light, r = 0.24, hit = 0.08, aspect = 1.6) {
  const d = (a, b) => Math.hypot((a.x - b.x) * aspect, a.y - b.y);
  let best = -1, bd = Infinity;
  marks.forEach((m, i) => { if (found.includes(i)) return; const dm = d(m, p); if (dm <= hit && d(m, light) <= r && dm < bd) { bd = dm; best = i; } });
  return best;
}
export const searchDarkOk = (found, marks) => marks.every((_, i) => found.includes(i));

export default {
  type: 'search-dark',
  about: '暗い絵を灯りで照らし、隠れた印をすべて見つける',
  mount(host, cfg = {}, ctx = {}, hooks = {}) {
    return new Promise((done) => {
      const marks = cfg.marks || DEF, r = cfg.r ?? 0.24, hit = cfg.hit ?? 0.08, snd = (k) => hooks.sound && hooks.sound(k, ctx);
      const light = { x: 0.5, y: 0.5 }, found = [];
      const f = mgFrame(host, { cfg, ctx, title: cfg.title || '暗がりを照らす', help: cfg.help || `灯りを動かして、隠れているものを ${marks.length} つ見つけ、照らしたまま押してください。` }, done);
      f.body.innerHTML = `<div class="mgx-dark"><div class="mgx-dark-stage" tabindex="0" role="application" aria-label="暗い場所。矢印キーで灯りを動かし、Space で調べる">
        <div class="mgx-dark-pic" style="${cfg.image ? `background-image:url('${esc(cfg.image)}')` : ''}"></div>
        ${marks.map((m, i) => `<span class="mgx-dark-mark" data-i="${i}" style="left:${m.x * 100}%;top:${m.y * 100}%"></span>`).join('')}
        <div class="mgx-dark-shade"></div></div><p class="mgx-dark-count"></p></div>`;
      const stage = f.body.querySelector('.mgx-dark-stage'), shade = f.body.querySelector('.mgx-dark-shade'), count = f.body.querySelector('.mgx-dark-count');
      const aspect = () => (stage.clientHeight ? stage.clientWidth / stage.clientHeight : 1.6);
      const draw = () => {
        const px = Math.round(r * (stage.clientHeight || 200));
        shade.style.background = `radial-gradient(circle ${px}px at ${light.x * 100}% ${light.y * 100}%, rgba(0,0,0,0) 0%, rgba(0,0,0,0.15) 55%, rgba(0,0,0,0.93) 100%)`; /* pair-ok */
        f.progress(found.length, marks.length);
        count.textContent = `見つけたもの ${found.length} / ${marks.length}${found.length ? '：' + found.map((i) => marks[i].label || '印').join('、') : ''}`;
      };
      const at = (e) => { const b = stage.getBoundingClientRect(); return { x: Math.min(1, Math.max(0, (e.clientX - b.left) / b.width)), y: Math.min(1, Math.max(0, (e.clientY - b.top) / b.height)) }; };
      const look = (p) => {
        if (f.done) return;
        const i = findAt(marks, found, p, light, r, hit, aspect());
        if (i < 0) { snd('miss'); f.miss(); f.say('何もない。灯りを当てたまま、よく見て。'); return; }
        found.push(i); stage.querySelector(`[data-i="${i}"]`).classList.add('found'); snd('found'); f.say(`${marks[i].label || '何か'}を見つけた。`); draw();
        if (searchDarkOk(found, marks)) { snd('ok'); f.say(cfg.ok || 'すべて見つけた。'); f.win(800); }
      };
      stage.addEventListener('pointermove', (e) => { Object.assign(light, at(e)); draw(); });
      stage.addEventListener('pointerdown', (e) => { e.preventDefault(); const p = at(e); Object.assign(light, p); draw(); look(p); });
      f.on('keydown', (e) => {
        const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.code];
        if (d) { e.preventDefault(); light.x = Math.min(1, Math.max(0, light.x + d[0] * 0.04)); light.y = Math.min(1, Math.max(0, light.y + d[1] * 0.06)); draw(); }
        if ((e.code === 'Space' || e.code === 'KeyE') && !e.repeat) { e.preventDefault(); look({ ...light }); }
      });
      draw();
      if (ctx.qa) return f.end(true);
      stage.focus();
    });
  },
};
