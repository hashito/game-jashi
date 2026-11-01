/* game-kit 6e0b6f0: js/fx-std.js — edit in game-kit and run tools/kit-sync.js */
// Screen effects of the standard (manifest `fx`; standard 1.5). Wraps js/fx.js (film grain, scanlines, vignette, glitch, danger tint) and adds the
// red-black mist (S12), presets, proximity-driven danger, the spook surge and a brightness-neutral exposure. Pure model + THREE glue.
//
//   game.json:  "fx": "old-tv"                                    a preset name, or
//               "fx": { "preset": "old-tv" | "clean" | "horror" | "retro-crt", "noise": 0.045, "scanlines": 0.08, "vignette": 1, "saturation": 0.25,
//                       "glitch": true, "dangerTint": true, "mist": "auto" | true | false, "exposure": "neutral" | 1 }
//   ctx.fxState = { danger, mist, chasing }    written by the monster pack (js/monster-std.js) from the distance to the nearest monster; a game may write it too
//   ctx.fx.spook(amount)    the surge when something spots you: mist rushes in, a hard glitch, easing off over ~4 s (1.5 s when calm)
//   ctx.fx.glitch(amount, seconds) / ctx.fx.blackout(seconds)
// Calm / no flash: <html data-gf-calm="1"> (set by game-core from the "calm" setting), ?calm, or prefers-reduced-motion. Calm only SOFTENS: no glitch bursts, a third of the mist,
// little noise (S12 keeps the monster deadly; the picture is just gentler).
// Brightness-neutral exposure: the scanlines and the vignette darken the picture on average; `exposureComp` brings the mean back so adding the FX does not make the game darker
// (tone mapping / exposure of the preset keep their meaning). Games tuned against the old darkening set "exposure": 1.
import { FX } from './fx.js';

export const PRESETS = {
  'old-tv': { noise: 0.045, scanlines: 0.08, vignette: 1, saturation: 0.25, glitch: true, dangerTint: true, mist: 'auto' },
  clean: { noise: 0, scanlines: 0, vignette: 0.35, saturation: 0, glitch: false, dangerTint: true, mist: 'auto' },
  horror: { noise: 0.06, scanlines: 0.05, vignette: 1, saturation: 0.35, glitch: true, dangerTint: true, mist: 'auto' },
  'retro-crt': { noise: 0.05, scanlines: 0.16, vignette: 1, saturation: 0.1, glitch: true, dangerTint: false, mist: false },
};
export function resolveFx(cfg) {
  const c = typeof cfg === 'string' ? { preset: cfg } : cfg === true ? {} : cfg || {};
  const base = PRESETS[c.preset || 'old-tv'];
  if (!base) throw new Error(`fx preset "${c.preset}" is not one of ${Object.keys(PRESETS).join(', ')}`);
  return { exposure: 'neutral', ...base, ...c };
}

// mean of smoothstep(0.85, 0.25, length(v * (1.1, 1))) over the screen (v in [-.5,.5]^2): what the vignette does to the average brightness
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const VIGNETTE_MEAN = (() => { let s = 0, n = 0; for (let i = 0; i < 40; i++) for (let j = 0; j < 40; j++) { const x = (i + 0.5) / 40 - 0.5, y = (j + 0.5) / 40 - 0.5; s += smooth(0.85, 0.25, Math.hypot(x * 1.1, y)); n++; } return s / n; })();
// factor that restores the mean brightness lost to scanlines (mean of (1-scan)+scan*sin = 1-scan) and the vignette (mix(1, V, vig))
export function exposureComp(scan = 0.08, vig = 1) {
  const m = (1 - scan) * (1 - vig * (1 - VIGNETTE_MEAN));
  return m > 0.05 ? 1 / m : 1;
}

// The per-frame values. Pure: feed it dt and the situation, read the uniforms. rand is injectable for tests.
export class FxModel {
  constructor(cfg, o = {}) {
    this.cfg = resolveFx(cfg); this.rand = o.rand || Math.random;
    this.spookV = 0; this.burstT = 0; this.blackoutT = 0; this.blackoutLen = 0;
    this.out = { noiseAmt: 0, scan: 0, vig: 1, sat: 0.25, mist: 0, danger: 0, base: 0, exp: 1, blind: 0, bursts: [] };
  }
  spook(a = 1) { this.spookV = Math.max(this.spookV, a); this.pendingGlitch = Math.max(this.pendingGlitch || 0, 0.9 * a); }
  blackout(sec = 0.5) { this.blackoutT = this.blackoutLen = sec; }
  // s: { calm, danger, prox (mist proximity 0..1), chasing }
  update(dt, s) {
    const c = this.cfg, calm = !!s.calm, o = this.out;
    this.spookV = Math.max(0, this.spookV - dt / (calm ? 1.5 : 4));
    const danger = Math.min(1, Math.max(0, s.danger || 0));
    const prox = Math.min(1, Math.max(0, s.prox == null ? danger : s.prox));
    const mistOn = c.mist === 'auto' ? !s.windmill : !!c.mist;
    const m = mistOn ? Math.min(1, prox * 0.85 + this.spookV * 0.75 + (s.chasing ? 0.2 : 0)) : 0;
    const glitchOn = c.glitch && !calm;
    o.mist = calm ? m * 0.35 : m;
    o.noiseAmt = (calm ? Math.min(c.noise, 0.02) + m * 0.03 : c.noise + m * 0.14) * (c.noise === 0 && !m ? 0 : 1);
    o.danger = c.dangerTint ? (calm ? danger * 0.45 : Math.min(1, danger + this.spookV * 0.5)) : 0;
    o.base = glitchOn && s.chasing ? 0.05 + danger * 0.12 : calm && s.chasing ? 0.01 : 0;
    o.scan = c.scanlines; o.vig = c.vignette; o.sat = c.saturation;
    o.exp = c.exposure === 'neutral' ? exposureComp(c.scanlines, c.vignette) : Number(c.exposure) || 1;
    o.bursts.length = 0;
    if (this.pendingGlitch) { if (!calm) o.bursts.push([this.pendingGlitch, 0.35]); this.pendingGlitch = 0; }
    if (glitchOn && m > 0.22) {
      this.burstT -= dt;
      if (this.burstT <= 0) { this.burstT = 0.3 + this.rand() * 1.3 * (1.15 - m); o.bursts.push([0.2 + 0.6 * m * this.rand(), 0.05 + 0.12 * m]); }
    }
    this.blackoutT = Math.max(0, this.blackoutT - dt);
    o.blind = this.blackoutLen ? Math.min(1, this.blackoutT / this.blackoutLen * 2) * (this.blackoutT > 0 ? 1 : 0) : 0;
    return o;
  }
}

export const lowStim = () => (typeof location !== 'undefined' && /[?&]calm/.test(location.search)) || (typeof document !== 'undefined' && document.documentElement.dataset.gfCalm === '1') || !!(typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches);

// ---------------- THREE glue ----------------
const NOISE = `
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * vnoise(p); p *= 2.03; a *= 0.5; } return s; }
`;
const MIST = `
  {
    float t2 = time * 0.3;
    float sm = fbm(vUv * vec2(3.2, 2.2) + vec2(t2, -t2 * 0.7)) * 0.65 + fbm(vUv * 7.0 - vec2(t2 * 1.6, t2)) * 0.35;
    float edgeM = smoothstep(0.1, 0.8, length(v * vec2(1.1, 1.0)));
    float mm = clamp(fxMist * (0.3 + 0.7 * edgeM) * (0.45 + 0.9 * sm), 0.0, 0.93);
    c = mix(c, c * vec3(0.38, 0.1, 0.1) + vec3(0.11, 0.0, 0.012) * (0.4 + sm), mm);
    c += (hash(uv * res * 0.5 + time * 37.0) - 0.5) * fxMist * 0.2;
  }
`;
// adds uniforms fxScan fxVig fxSat fxMist fxExp to js/fx.js's shader (whatever its version: the fixed scanline / vignette / desaturation lines are
// replaced when they are still fixed; a version that already has scan / vig / sat / mist uniforms is driven through those)
export function patchShader(fs) {
  let own = { scan: 'fxScan', vig: 'fxVig', sat: 'fxSat', mist: 'fxMist' };
  const has = (u) => new RegExp(`uniform float[^;]*\\b${u}\\b`).test(fs);
  const decl = ['fxExp'];
  if (has('scan') && has('vig') && has('sat')) own = { ...own, scan: 'scan', vig: 'vig', sat: 'sat' }; else decl.push('fxScan', 'fxVig', 'fxSat');
  if (has('mist')) own.mist = 'mist'; else decl.push('fxMist');
  if (decl.includes('fxScan')) {
    fs = fs.replace('c *= 0.92 + 0.08 * sin(vUv.y * res.y * 1.4);', 'c *= (1.0 - fxScan) + fxScan * sin(vUv.y * res.y * 1.4);');
    fs = fs.replace('c *= smoothstep(0.85, 0.25, length(v * vec2(1.1, 1.0)));', 'c *= mix(1.0, smoothstep(0.85, 0.25, length(v * vec2(1.1, 1.0))), fxVig);');
    fs = fs.replace('0.25 + glitch * 0.4);', 'fxSat + glitch * 0.4);');
  }
  fs = fs.replace('varying vec2 vUv;', `varying vec2 vUv; uniform float ${decl.join(', ')};`);
  if (decl.includes('fxMist')) { fs = fs.replace('void main(){', NOISE + 'void main(){'); fs = fs.replace('c *= 1.0 - blind;', MIST + '  c *= 1.0 - blind;'); }
  fs = fs.replace('c *= 1.0 - blind;', 'c *= fxExp;\n  c *= 1.0 - blind;');
  return { fs, own, decl };
}

export function attachFx(look, ctx, cfg = {}) {
  const model = new FxModel(cfg);
  const renderer = look.renderer;
  const fx = new FX(renderer);
  const { fs, own, decl } = patchShader(fx.mat.fragmentShader);
  fx.mat.fragmentShader = fs;
  for (const d of decl) fx.mat.uniforms[d] = { value: d === 'fxExp' ? 1 : d === 'fxVig' ? 1 : 0 };
  fx.mat.needsUpdate = true;
  const U = fx.mat.uniforms;
  const tmp = U.res.value.clone();
  let w = 0, h = 0;
  const baseRender = look.render, baseUpdate = look.update;
  look.fx = fx; ctx.fx = fx; ctx.fxModel = model;
  ctx.fxState = ctx.fxState || { danger: 0, mist: 0, chasing: false };
  fx.spook = (a = 1) => model.spook(a);
  fx.blackout = (s = 0.5) => model.blackout(s);
  look.update = (dt, time, focus) => {
    baseUpdate(dt, time, focus);
    const st = ctx.fxState || {};
    const o = model.update(dt, { calm: !!(ctx.calm || lowStim()), danger: st.danger, prox: st.mist, chasing: st.chasing, windmill: !!st.noMist });
    fx.reduced = !!(ctx.calm || lowStim());
    U[own.mist].value = o.mist; U[own.scan].value = o.scan; U[own.vig].value = o.vig; U[own.sat].value = o.sat;
    U.fxExp.value = o.exp; U.noiseAmt.value = o.noiseAmt; fx.danger = o.danger; fx.base = o.base; fx.blind = o.blind;
    for (const [a, d] of o.bursts) fx.glitch(a, d);
    fx.update(dt, time);
  };
  look.render = () => {
    renderer.getDrawingBufferSize(tmp);
    if (tmp.x !== w || tmp.y !== h) { w = tmp.x; h = tmp.y; fx.setSize(w, h); if (look.post) look.post.setSize(); }
    renderer.setRenderTarget(fx.rt);
    baseRender();
    renderer.setRenderTarget(null);
    renderer.render(fx.qScene, fx.qCam);
  };
  return fx;
}
