/* game-kit 244cbc9: js/controller.js — edit in game-kit and run tools/kit-sync.js */
// First-person controller: pointer lock + mouse look, WASD / arrows + Shift to run, a touch stick and
// swipe-to-look for phones, circle-vs-box collisions, footstep callbacks.
// Extracted from ひだまり薬局 (game-yakkyoku, js/game.js); the same scheme runs 未然調書 and the police game.
//
//   const fp = new FirstPersonController(camera, canvas, {
//     colliders,                    // [{ box: THREE.Box3, off?: bool }] (doors set off when open)
//     bounds: [x0, z0, x1, z1],     // optional world-space clamp
//     isBlocked: () => ui.open,     // no movement / look while a window is open
//     onStep: (running) => audio.step('wood'),
//     onUnlock: () => ui.menu(),    // the player pressed Esc (pointer lock lost)
//     touch: { stick, knob, look }, // optional elements (see css/kit.css .kit-touch)
//     floorY: 0,                    // (standard 1.1) the floor's height; eye is above it. ctl.floorY = world.floorY(floor) after stairs
//     extraCollide: (p, ctl) => {}, // (standard 1.1) called after the box collision, may move p (a game's own walk grid)
//     externalLook: true,           // (standard 1.5) the mouse / pointer lock is handled by js/look-input.js (game-core wires it); call fp.look(dx, dy) from it
//   });
//   fp.update(dt) every frame; fp.lock() after a window closes; fp.release() before one opens.
//   fp.crouching = true (standard 1.7): the eye drops to crouchEye (0.6) of the height and the walk to crouchSpeed (0.5); no running.
import * as THREE from "three";

export class FirstPersonController {
  constructor(camera, canvas, o = {}) {
    this.camera = camera;
    this.canvas = canvas;
    this.o = {
      eye: 1.65,
      radius: 0.28,
      speed: 2.2,
      run: 3.8,
      sensitivity: 1,
      pitchLimit: 1.45,
      stepEvery: [0.65, 0.9], // walk, run (metres between footsteps)
      ...o,
    };
    this.colliders = o.colliders || [];
    this.floorY = o.floorY || 0; // height of the floor under the player (multi-floor worlds: world.floorY(floor)); eye is measured from it
    this.yaw = o.yaw ?? 0;
    this.pitch = 0;
    this.keys = new Set();
    this.stick = { x: 0, y: 0, id: null };
    this.runToggle = false;
    this.enabled = true;
    this.isTouch = matchMedia("(pointer: coarse)").matches;
    this.moved = 0; // metres walked (for tutorials)
    this.looked = 0; // radians looked around
    camera.rotation.order = "YXZ";
    this.bind();
  }

  get blocked() {
    return !this.enabled || (this.o.isBlocked && this.o.isBlocked());
  }

  lock() {
    if (this.isTouch || this.blocked) return;
    Promise.resolve(this.canvas.requestPointerLock?.()).catch(() => {});
  }

  release() {
    if (document.pointerLockElement) {
      this.releasing = true;
      document.exitPointerLock();
    }
    this.keys.clear();
  }

  look(dx, dy) {
    this.looked += Math.abs(dx);
    this.yaw -= dx;
    this.pitch = Math.max(-this.o.pitchLimit, Math.min(this.o.pitchLimit, this.pitch - dy));
  }

  running() {
    return !this.crouching && (this.keys.has("ShiftLeft") || this.keys.has("ShiftRight") || this.runToggle);
  }

  // standard 1.8.2: a game's player overrides these instead of copying bind() (ten games copied it to add 'not while blind / dead / hiding'
  // and their own sensitivity setting)
  canLook() {
    return !this.blocked;
  }

  lookScale() {
    return this.o.sensitivity;
  }

  bind() {
    addEventListener("keydown", (e) => {
      if (this.blocked) return;
      this.keys.add(e.code);
    });
    addEventListener("keyup", (e) => this.keys.delete(e.code));
    addEventListener("blur", () => this.keys.clear());
    if (!this.o.externalLook) {
      // (standard 1.5: game-core hands the mouse to js/look-input.js LookInput and sets externalLook: pointer lock, drag-look fallback, "click to resume")
      this.canvas.addEventListener("click", () => this.lock());
      document.addEventListener("pointerlockchange", () => {
        if (document.pointerLockElement) return;
        if (this.releasing) {
          this.releasing = false;
          return;
        }
        if (!this.blocked && !this.isTouch && this.o.onUnlock) this.o.onUnlock();
      });
      addEventListener("mousemove", (e) => {
        if (document.pointerLockElement !== this.canvas || !this.canLook()) return;
        const k = 0.0022 * this.lookScale();
        this.look(e.movementX * k, e.movementY * k);
      });
    }
    const t = this.o.touch;
    if (!t) return;
    const stick = this.stick;
    const moveStick = (e) => {
      const r = t.stick.getBoundingClientRect();
      let x = (e.clientX - r.left - r.width / 2) / (r.width / 2);
      let y = (e.clientY - r.top - r.height / 2) / (r.height / 2);
      const l = Math.hypot(x, y);
      if (l > 1) {
        x /= l;
        y /= l;
      }
      stick.x = x;
      stick.y = y;
      if (t.knob) t.knob.style.transform = `translate(${x * 36}px, ${y * 36}px)`;
    };
    t.stick.addEventListener("pointerdown", (e) => {
      stick.id = e.pointerId;
      t.stick.setPointerCapture(e.pointerId);
      moveStick(e);
    });
    t.stick.addEventListener("pointermove", (e) => e.pointerId === stick.id && moveStick(e));
    const stop = () => {
      stick.id = null;
      stick.x = stick.y = 0;
      if (t.knob) t.knob.style.transform = "";
    };
    t.stick.addEventListener("pointerup", stop);
    t.stick.addEventListener("pointercancel", stop);
    if (t.look) {
      let id = null;
      let last = null;
      let down = null;
      t.look.addEventListener("pointerdown", (e) => {
        id = e.pointerId;
        last = [e.clientX, e.clientY];
        down = { x: e.clientX, y: e.clientY, t: performance.now(), far: false };
        t.look.setPointerCapture(e.pointerId);
      });
      t.look.addEventListener("pointermove", (e) => {
        if (e.pointerId !== id || !this.canLook()) return;
        if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 12) down.far = true;
        const k = 0.005 * this.lookScale();
        this.look((e.clientX - last[0]) * k, (e.clientY - last[1]) * k);
        last = [e.clientX, e.clientY];
      });
      t.look.addEventListener("pointerup", (e) => {
        if (down && e.pointerId === id && !down.far && performance.now() - down.t < 350 && !this.blocked && this.o.onTap) this.o.onTap(e.clientX, e.clientY);
        down = null;
        id = null;
      });
      t.look.addEventListener("pointercancel", () => ((down = null), (id = null)));
    }
  }

  // push the point out of every solid box (a circle of `radius` against boxes, in x/z). A few passes, so two boxes close together cannot
  // push the player into each other; a centre already inside a box goes out the nearest side (before 1.10.4 it stayed and walked through
  // thin walls: in 邪視 a squeeze between a boulder and the hut wall put the player inside the locked hut)
  solid(c) { const b = c.box; return !c.off && !(b.max.y < this.floorY + 0.15 || b.min.y > this.floorY + this.o.eye); }
  collide(p) {
    const R = this.o.radius;
    for (let pass = 0; pass < 4; pass++) {
      let pushed = false;
      for (const c of this.colliders) {
        if (!this.solid(c)) continue;
        const b = c.box;
        if (p.x > b.min.x && p.x < b.max.x && p.z > b.min.z && p.z < b.max.z) {
          const out = [[b.min.x - R - p.x, 0], [b.max.x + R - p.x, 0], [0, b.min.z - R - p.z], [0, b.max.z + R - p.z]].sort((u, v) => Math.abs(u[0] + u[1]) - Math.abs(v[0] + v[1]))[0];
          p.x += out[0]; p.z += out[1]; pushed = true; continue;
        }
        const cx = Math.max(b.min.x, Math.min(p.x, b.max.x));
        const cz = Math.max(b.min.z, Math.min(p.z, b.max.z));
        const dx = p.x - cx;
        const dz = p.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 < R * R - 1e-6) {
          const d = Math.sqrt(d2) || 1e-4;
          p.x += (dx / d) * (R - d);
          p.z += (dz / d) * (R - d);
          pushed = true;
        }
      }
      if (!pushed) break;
    }
  }
  // true when the step a -> b runs through a solid box (the passes settled a squeeze on the far side of a thin wall)
  crosses(a, b) {
    const dx = b.x - a.x, dz = b.z - a.z;
    for (const c of this.colliders) {
      if (!this.solid(c)) continue;
      const x = c.box; if (a.x > x.min.x && a.x < x.max.x && a.z > x.min.z && a.z < x.max.z) continue;   // started inside (a spawn, a teleport): let it out
      let t0 = 0, t1 = 1, hit = true;
      for (const [o, d, lo, hi] of [[a.x, dx, x.min.x, x.max.x], [a.z, dz, x.min.z, x.max.z]]) {
        if (Math.abs(d) < 1e-9) { if (o <= lo || o >= hi) { hit = false; break; } continue; }
        let u = (lo - o) / d, v = (hi - o) / d; if (u > v) [u, v] = [v, u];
        t0 = Math.max(t0, u); t1 = Math.min(t1, v); if (t0 >= t1) { hit = false; break; }
      }
      if (hit) return true;
    }
    return false;
  }

  update(dt) {
    const p = this.camera.position;
    if (!this.blocked) {
      const k = this.keys;
      let fx = (k.has("KeyD") ? 1 : 0) - (k.has("KeyA") ? 1 : 0) + this.stick.x;
      let fz = (k.has("KeyS") ? 1 : 0) - (k.has("KeyW") ? 1 : 0) + this.stick.y;
      if (k.has("ArrowUp")) fz -= 1;
      if (k.has("ArrowDown")) fz += 1;
      if (k.has("ArrowLeft")) this.yaw += dt * 1.8;
      if (k.has("ArrowRight")) this.yaw -= dt * 1.8;
      const l = Math.hypot(fx, fz);
      if (l > 1) {
        fx /= l;
        fz /= l;
      }
      const v = new THREE.Vector3(fx, 0, fz).applyAxisAngle(THREE.Object3D.DEFAULT_UP, this.yaw).multiplyScalar((this.crouching ? this.o.speed * (this.o.crouchSpeed ?? 0.5) : this.running() ? this.o.run : this.o.speed) * dt);
      const before = p.clone();
      p.add(v);
      this.collide(p);
      if (this.crosses(before, p)) p.copy(before);   // never through a wall: a step the pushes carried across a box is not taken
      if (this.o.extraCollide) this.o.extraCollide(p, this); // a game's own walls (a walk grid, a custom world)
      const b = this.o.bounds;
      if (b) {
        p.x = Math.max(b[0], Math.min(b[2], p.x));
        p.z = Math.max(b[1], Math.min(b[3], p.z));
      }
      const moved = Math.hypot(p.x - before.x, p.z - before.z);
      this.moved += moved;
      this.stepDist = (this.stepDist || 0) + moved;
      if (this.stepDist > this.o.stepEvery[this.running() ? 1 : 0]) {
        this.stepDist = 0;
        this.o.onStep && this.o.onStep(this.running());
      }
    }
    const ty = this.floorY + this.o.eye * (this.crouching ? this.o.crouchEye ?? 0.6 : 1);   // standard 1.7: crouching lowers the eye and slows the walk
    if (this.o.smoothY === false || this._y == null || Math.abs(ty - this._y) > 0.8) this._y = ty;
    else this._y += (ty - this._y) * (1 - Math.exp(-Math.min(dt, 0.1) * 16));
    p.y = this._y;
    this.camera.rotation.set(this.pitch, this.yaw, 0);
  }
}
