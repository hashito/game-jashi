/* game-kit 6e0b6f0: js/fx.js — edit in game-kit and run tools/kit-sync.js */
// Post processing reused from みる風車 (game-miru-fusha, js/fx.js): film grain, scanlines, vignette and a short
// glitch. Here the glitch marks the instant a record is adopted; "low stimulus" mode turns it off.
// Colour (fixed 2026-10, from 閉園後): the scene is rendered LINEAR into a half-float target and this pass does the
// tone mapping (renderer.toneMapping / toneMappingExposure) and the sRGB conversion. Before, an 8-bit target was
// sent to the screen with neither, which crushed the darks and blew out whites, and toneMapping / exposure did
// nothing. After syncing, re-check each game's exposure and light strengths (they were tuned against the bug).
import * as THREE from 'three';

const VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const FRAG = `
uniform sampler2D tScene; uniform float time; uniform float glitch; uniform float blind; uniform float noiseAmt; uniform vec2 res; uniform float danger;
varying vec2 vUv;
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
void main(){
  vec2 uv = vUv;
  float row = floor(uv.y * 48.0);
  float jitter = (hash(vec2(row, floor(time * 24.0))) - 0.5) * 0.08 * glitch;
  float band = step(0.82, hash(vec2(floor(uv.y * 9.0), floor(time * 13.0))));
  uv.x += jitter + band * glitch * 0.05;
  uv.y += glitch * 0.03 * step(0.9, hash(vec2(floor(time * 30.0), 1.0)));
  float split = 0.002 + glitch * 0.012;
  vec3 c;
  c.r = texture2D(tScene, uv + vec2(split, 0.0)).r;
  c.g = texture2D(tScene, uv).g;
  c.b = texture2D(tScene, uv - vec2(split, 0.0)).b;
  float n = hash(uv * res + time * 60.0);
  c += (n - 0.5) * (noiseAmt + glitch * 0.35);
  c *= 0.92 + 0.08 * sin(vUv.y * res.y * 1.4);
  vec2 v = vUv - 0.5;
  c *= smoothstep(0.85, 0.25, length(v * vec2(1.1, 1.0)));
  c = mix(c, vec3(dot(c, vec3(0.3, 0.59, 0.11))), 0.25 + glitch * 0.4);
  // danger: red, pulsing edges
  float pulse = 0.6 + 0.4 * sin(time * (4.0 + danger * 6.0));
  float edge = smoothstep(0.25, 0.75, length(v * vec2(1.1, 1.0)));
  c = mix(c, c * vec3(1.25, 0.55, 0.5) + vec3(0.18, 0.0, 0.0) * edge * pulse, danger * 0.75 * edge);
  c *= 1.0 - blind;
  gl_FragColor = vec4(max(c, 0.0), 1.0);
  // the scene was rendered linear into the target: tone map and convert for the screen here
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class FX {
  constructor(renderer) {
    this.renderer = renderer;
    const size = renderer.getSize(new THREE.Vector2());
    this.rt = new THREE.WebGLRenderTarget(size.x, size.y, { samples: 2, type: THREE.HalfFloatType });
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: this.rt.texture },
        time: { value: 0 },
        glitch: { value: 0 },
        blind: { value: 0 },
        noiseAmt: { value: 0.045 },
        danger: { value: 0 },
        res: { value: new THREE.Vector2(size.x, size.y) },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    this.qScene = new THREE.Scene();
    this.qScene.add(this.quad);
    this.qCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.glitchT = 0;
    this.glitchAmt = 0;
    this.base = 0;
    this.reduced = false; // low-stimulus mode: almost no glitch
  }

  setSize(w, h) {
    this.rt.setSize(w, h);
    this.mat.uniforms.res.value.set(w, h);
  }

  glitch(amount, dur) {
    if (this.reduced) amount *= 0.15;
    this.glitchAmt = Math.max(this.glitchAmt, amount);
    this.glitchT = Math.max(this.glitchT, dur);
  }

  update(dt, t) {
    this.glitchT -= dt;
    if (this.glitchT <= 0) this.glitchAmt = Math.max(0, this.glitchAmt - dt * 4);
    this.mat.uniforms.time.value = t;
    this.mat.uniforms.glitch.value = Math.max(this.glitchAmt, this.base);
  }

  set danger(v) {
    this.mat.uniforms.danger.value = v;
  }

  set blind(v) {
    this.mat.uniforms.blind.value = v;
  }

  render(scene, camera) {
    this.renderer.setRenderTarget(this.rt);
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.qScene, this.qCam);
  }
}
