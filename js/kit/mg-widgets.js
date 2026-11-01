/* game-kit 6e0b6f0: js/mg-widgets.js — edit in game-kit and run tools/kit-sync.js */
// Hands-on widgets for mini games and puzzle panels (standard 1.8), kept from the games that made them: 撤去通知 (tekkyo) js/mini.js
// (drum knob keyTurn lever crank cardSlots holdButton vSlider dial; the same file in shiogaeri / turnback / urakawa) and 浦川
// (urakawa) js/mini-moon.js (rocker wires mirrorDial valveWheel hookTrace). Mouse, touch and keys; nothing gets stuck, everything can
// be redone; each widget reports through callbacks and the mini game decides. Style: css/kit.css "mini game widgets" (.mg-*, --gf-mg tokens).
//   import { drum, knob, lever } from './kit/mg-widgets.js';
//   const row = document.createElement('div'); row.className = 'mg-row'; f.body.append(row);   // inside mgFrame (js/mg-frame.js)
//   drum(row, { label: '一の位', values: [0,1,2,3,4,5,6,7,8,9], value: 0, onChange: (v) => ..., sound: (n) => audio.click() });

const ang = (cx, cy, x, y) => Math.atan2(y - cy, x - cx);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};
// pointer drag helper: down / move / up with capture; returns the element
function draggable(target, { down, move, up }) {
  let id = null;
  target.addEventListener("pointerdown", (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    id = e.pointerId;
    try {
      target.setPointerCapture(id);
    } catch {
      /* fine */
    }
    e.preventDefault();
    e.stopPropagation();
    down && down(e);
  });
  target.addEventListener("pointermove", (e) => {
    if (id === null || e.pointerId !== id) return;
    e.preventDefault();
    move && move(e);
  });
  const end = (e) => {
    if (id === null || (e.pointerId !== undefined && e.pointerId !== id)) return;
    id = null;
    up && up(e);
  };
  target.addEventListener("pointerup", end);
  target.addEventListener("pointercancel", end);
  return target;
}

// a split-flap drum: drag up / down (or ▲▼) to flip through the values
export function drum(parent, { label, values, value, onChange, sound, suffix = "" }) {
  const box = el("div", "mg-drum");
  box.innerHTML = `<small>${label}</small><button class="mg-up" aria-label="前へ">▲</button><div class="mg-flap" tabindex="0"><span class="prev"></span><b></b><span class="next"></span></div><button class="mg-dn" aria-label="次へ">▼</button>`;
  parent.appendChild(box);
  let i = Math.max(0, values.indexOf(value));
  const flap = box.querySelector(".mg-flap");
  const show = () => {
    flap.querySelector("b").textContent = values[i] + suffix;
    flap.querySelector(".prev").textContent = values[(i - 1 + values.length) % values.length] + suffix;
    flap.querySelector(".next").textContent = values[(i + 1) % values.length] + suffix;
  };
  const step = (d) => {
    i = (i + d + values.length) % values.length;
    show();
    flap.classList.remove("flip");
    void flap.offsetWidth;
    flap.classList.add("flip");
    sound && sound("click");
    onChange(values[i]);
  };
  box.querySelector(".mg-up").addEventListener("click", (e) => (e.stopPropagation(), step(-1)));
  box.querySelector(".mg-dn").addEventListener("click", (e) => (e.stopPropagation(), step(1)));
  let y0 = 0;
  draggable(flap, {
    down: (e) => (y0 = e.clientY),
    move: (e) => {
      const d = e.clientY - y0;
      if (Math.abs(d) >= 22) {
        step(d > 0 ? 1 : -1);
        y0 = e.clientY;
      }
    },
  });
  flap.addEventListener("keydown", (e) => {
    if (e.code === "ArrowUp") step(-1);
    if (e.code === "ArrowDown") step(1);
  });
  show();
  return { el: box, set: (v) => ((i = Math.max(0, values.indexOf(v))), show()) };
}

// a rotary knob with N positions over 270 degrees: drag around it (or ◀▶)
export function knob(parent, { label, values, value, onChange, sound }) {
  const box = el("div", "mg-knob");
  const n = values.length;
  const posAng = (k) => (-135 + (270 * k) / Math.max(1, n - 1)) * (Math.PI / 180);
  const ticks = values.map((v, k) => {
    const a = posAng(k);
    return `<span class="tick" style="left:${50 + Math.sin(a) * 47}%;top:${50 - Math.cos(a) * 47}%">${v}</span>`;
  });
  box.innerHTML = `<small>${label}</small><div class="mg-k"><div class="ticks">${ticks.join("")}</div><div class="cap" tabindex="0"><i></i></div></div><div class="mg-kbtn"><button aria-label="左へ">‹</button><b></b><button aria-label="右へ">›</button></div>`;
  parent.appendChild(box);
  let i = values.indexOf(value);
  const cap = box.querySelector(".cap");
  const show = () => {
    cap.style.transform = `rotate(${i < 0 ? -150 : -135 + (270 * i) / Math.max(1, n - 1)}deg)`;
    box.querySelector(".mg-kbtn b").textContent = i < 0 ? "―" : values[i];
    box.querySelectorAll(".tick").forEach((t, k) => t.classList.toggle("on", k === i));
  };
  const set = (k, quiet) => {
    if (k === i) return;
    i = k;
    show();
    if (!quiet) sound && sound("click");
    onChange(values[i]);
  };
  const [bl, br] = box.querySelectorAll(".mg-kbtn button");
  bl.addEventListener("click", (e) => (e.stopPropagation(), set(Math.max(0, i - 1))));
  br.addEventListener("click", (e) => (e.stopPropagation(), set(Math.min(n - 1, i + 1))));
  const pick = (e) => {
    const r = cap.getBoundingClientRect();
    const a = ang(r.left + r.width / 2, r.top + r.height / 2, e.clientX, e.clientY) + Math.PI / 2; // 0 = up
    let best = 0, bd = 9;
    for (let k = 0; k < n; k++) {
      const d = Math.abs(wrap(a - posAng(k)));
      if (d < bd) (bd = d), (best = k);
    }
    set(best);
  };
  draggable(cap, { down: pick, move: pick });
  cap.addEventListener("keydown", (e) => {
    if (e.code === "ArrowLeft") set(Math.max(0, i - 1));
    if (e.code === "ArrowRight") set(Math.min(n - 1, i + 1));
  });
  show();
  return { el: box };
}

// a key in a lock: drag it around a quarter turn (or the button)
export function keyTurn(parent, { label, done, onTurn, sound, img }) {
  const box = el("div", `mg-key ${done ? "done" : ""}`);
  box.innerHTML = `<small>${label}</small><div class="mg-lock"><div class="mg-bow" style="${img ? `background-image:url(${img})` : ""}"></div></div><button>${done ? "回してある" : "鍵を回す"}</button>`;
  parent.appendChild(box);
  const bow = box.querySelector(".mg-bow");
  let a0 = 0, rot = done ? 90 : 0;
  const show = () => (bow.style.transform = `rotate(${rot}deg)`);
  const finish = () => {
    if (done) return;
    done = true;
    rot = 90;
    show();
    sound && sound("click");
    onTurn();
  };
  if (!done) {
    draggable(bow, {
      down: (e) => {
        const r = bow.getBoundingClientRect();
        a0 = ang(r.left + r.width / 2, r.top + r.height / 2, e.clientX, e.clientY) - (rot * Math.PI) / 180;
      },
      move: (e) => {
        const r = bow.getBoundingClientRect();
        const a = ang(r.left + r.width / 2, r.top + r.height / 2, e.clientX, e.clientY);
        rot = Math.max(0, Math.min(90, (wrap(a - a0) * 180) / Math.PI));
        show();
        if (rot >= 80) finish();
      },
      up: () => !done && ((rot = 0), show()),
    });
    box.querySelector("button").addEventListener("click", (e) => (e.stopPropagation(), finish()));
  }
  show();
  return { el: box };
}

// a lever to pull down (drag it down past the mark, or the button)
export function lever(parent, { label, on, enabled, onPull, sound }) {
  const box = el("div", `mg-lever ${on ? "on" : ""} ${enabled ? "" : "off"}`);
  box.innerHTML = `<small>${label}</small><div class="mg-slot"><div class="mg-handle"></div></div><span class="mg-state">${on ? "ON" : "OFF"}</span><button>${on ? "入っている" : "下ろす"}</button>`;
  parent.appendChild(box);
  const h = box.querySelector(".mg-handle");
  const slot = box.querySelector(".mg-slot");
  let y = on ? 1 : 0, y0 = 0, base = 0;
  const show = () => (h.style.top = `${4 + y * 64}%`);
  const pull = () => {
    if (on || !enabled) return;
    on = true;
    y = 1;
    show();
    box.classList.add("on");
    sound && sound("breaker");
    onPull();
  };
  if (!on && enabled) {
    draggable(h, {
      down: (e) => ((y0 = e.clientY), (base = y)),
      move: (e) => {
        y = Math.max(0, Math.min(1, base + (e.clientY - y0) / slot.getBoundingClientRect().height));
        show();
        if (y > 0.92) pull();
      },
      up: () => !on && ((y = 0), show()),
    });
    box.querySelector("button").addEventListener("click", (e) => (e.stopPropagation(), pull()));
  }
  show();
  return { el: box };
}

// a hand crank: wind it round (drag in circles) until it is in; `turns` full turns (or hold the button)
export function crank(parent, { label, done, turns = 2, onDone, sound }) {
  const box = el("div", `mg-crank ${done ? "done" : ""}`);
  box.innerHTML = `<small>${label}</small><div class="mg-wheel"><div class="mg-arm"><i></i></div></div><div class="mg-prog"><i></i></div><button>${done ? "差してある" : "押している間回す"}</button>`;
  parent.appendChild(box);
  const arm = box.querySelector(".mg-arm");
  const prog = box.querySelector(".mg-prog i");
  let total = done ? turns * 360 : 0, last = null, hold = null;
  const show = () => {
    arm.style.transform = `rotate(${total}deg)`;
    prog.style.width = `${Math.min(100, (total / (turns * 360)) * 100)}%`;
  };
  const add = (deg) => {
    if (done) return;
    total = Math.max(0, total + deg);
    if (Math.floor((total - deg) / 90) !== Math.floor(total / 90)) sound && sound("click");
    show();
    if (total >= turns * 360) {
      done = true;
      box.classList.add("done");
      onDone();
    }
  };
  if (!done) {
    const wheel = box.querySelector(".mg-wheel");
    draggable(wheel, {
      down: (e) => {
        const r = wheel.getBoundingClientRect();
        last = ang(r.left + r.width / 2, r.top + r.height / 2, e.clientX, e.clientY);
      },
      move: (e) => {
        const r = wheel.getBoundingClientRect();
        const a = ang(r.left + r.width / 2, r.top + r.height / 2, e.clientX, e.clientY);
        const d = (wrap(a - last) * 180) / Math.PI;
        last = a;
        if (d > 0) add(d); // clockwise only
      },
    });
    const b = box.querySelector("button");
    const stop = () => clearInterval(hold);
    b.addEventListener("pointerdown", (e) => (e.stopPropagation(), stop(), (hold = setInterval(() => add(24), 50))));
    for (const ev of ["pointerup", "pointerleave", "pointercancel"]) b.addEventListener(ev, stop);
    b.addEventListener("keydown", (e) => (e.code === "Enter" || e.code === "Space") && add(90));
  }
  show();
  return { el: box };
}

// cards dragged into slots (or: tap a card, then tap a slot). slots: [{ id, label }], cards: [{ id, html }],
// place: { cardId: slotId }; onPlace(cardId, slotId | null)
export function cardSlots(parent, { slots, cards, place, onPlace, sound, many = false }) {
  const box = el("div", "mg-cards");
  const slotRow = el("div", "mg-slots");
  const tray = el("div", "mg-tray");
  box.append(slotRow, tray);
  parent.appendChild(box);
  let picked = null;
  const render = () => {
    slotRow.innerHTML = "";
    tray.innerHTML = "";
    for (const s of slots) {
      const se = el("div", "mg-slotbox", `<small>${s.label}</small>`);
      se.dataset.slot = s.id;
      se.addEventListener("click", (e) => {
        e.stopPropagation();
        if (picked) put(picked, s.id);
      });
      slotRow.appendChild(se);
    }
    for (const c of cards) {
      const ce = el("div", `mg-card ${picked === c.id ? "picked" : ""}`, c.html);
      ce.dataset.card = c.id;
      const target = place[c.id] ? slotRow.querySelector(`[data-slot="${place[c.id]}"]`) : tray;
      target.appendChild(ce);
      let ghost = null, sx = 0, sy = 0, moved = false;
      draggable(ce, {
        down: (e) => ((sx = e.clientX), (sy = e.clientY), (moved = false)),
        move: (e) => {
          const dx = e.clientX - sx, dy = e.clientY - sy;
          if (!moved && Math.hypot(dx, dy) < 6) return;
          moved = true;
          ce.classList.add("dragging");
          ce.style.transform = `translate(${dx}px, ${dy}px)`;
          ghost = document.elementsFromPoint(e.clientX, e.clientY).find((x) => x.dataset && x.dataset.slot);
          slotRow.querySelectorAll(".mg-slotbox").forEach((x) => x.classList.toggle("hover", x === ghost));
        },
        up: (e) => {
          ce.classList.remove("dragging");
          ce.style.transform = "";
          if (!moved) {
            picked = picked === c.id ? null : c.id;
            sound && sound("paper");
            return render();
          }
          const over = document.elementsFromPoint(e.clientX, e.clientY).find((x) => x.dataset && x.dataset.slot);
          if (over) put(c.id, over.dataset.slot);
          else if (place[c.id]) put(c.id, null);
          else render();
        },
      });
    }
  };
  const put = (cid, sid) => {
    if (sid && !many) for (const [k, v] of Object.entries(place)) if (v === sid && k !== cid) delete place[k];
    if (sid) place[cid] = sid;
    else delete place[cid];
    picked = null;
    sound && sound("paper");
    onPlace(cid, sid);
    render();
  };
  render();
  return { el: box, put };
}

// a button you press and hold (the test switch of an emergency light, the megaphone's talk key): the bar fills in
// `sec`; letting go early resets it. Keys: hold Space / Enter while it has focus.
export function holdButton(parent, { label, sec = 1.5, done = false, onDone, sound, small = "" }) {
  const box = el("div", `mg-hold ${done ? "done" : ""}`);
  box.innerHTML = `<button class="mg-hb" tabindex="0"><span class="mg-hl">${label}</span><span class="mg-hbar"><i></i></span></button>${small ? `<small>${small}</small>` : ""}`;
  parent.appendChild(box);
  const b = box.querySelector("button");
  const bar = box.querySelector(".mg-hbar i");
  let t0 = null, raf = 0;
  const stop = () => {
    t0 = null;
    cancelAnimationFrame(raf);
    if (!done) bar.style.width = "0%";
  };
  const tick = () => {
    if (t0 === null) return;
    const k = Math.min(1, (performance.now() - t0) / (sec * 1000));
    bar.style.width = `${k * 100}%`;
    if (k >= 1) {
      t0 = null;
      if (!done) {
        done = true;
        box.classList.add("done");
      }
      onDone && onDone();
      return;
    }
    raf = requestAnimationFrame(tick);
  };
  const start = (e) => {
    if (e) (e.preventDefault(), e.stopPropagation());
    if (t0 !== null) return;
    t0 = performance.now();
    sound && sound("click");
    raf = requestAnimationFrame(tick);
  };
  b.addEventListener("pointerdown", start);
  for (const ev of ["pointerup", "pointerleave", "pointercancel"]) b.addEventListener(ev, stop);
  b.addEventListener("keydown", (e) => (e.code === "Space" || e.code === "Enter") && !e.repeat && start(e));
  b.addEventListener("keyup", stop);
  b.addEventListener("click", (e) => e.stopPropagation());
  return { el: box, start, stop, finish: () => ((t0 = performance.now() - sec * 1000), tick()) };
}

// a vertical slider on a scale (drag the handle up / down, or ▲▼): values min..max in `step`
export function vSlider(parent, { label, min, max, step, value, onChange, sound, fmt = (v) => String(v), height = 220 }) {
  const box = el("div", "mg-vs");
  box.innerHTML = `<small>${label}</small><button class="mg-up" aria-label="上へ">▲</button><div class="mg-vtrack" style="height:${height}px"><div class="mg-vh" tabindex="0"><b></b></div></div><button class="mg-dn" aria-label="下へ">▼</button>`;
  parent.appendChild(box);
  const track = box.querySelector(".mg-vtrack");
  const h = box.querySelector(".mg-vh");
  let v = value;
  const show = () => {
    h.style.bottom = `${((v - min) / (max - min)) * 100}%`;
    h.querySelector("b").textContent = fmt(v);
  };
  const set = (nv) => {
    nv = Math.max(min, Math.min(max, Math.round(nv / step) * step));
    if (nv === v) return;
    v = nv;
    show();
    sound && sound("click");
    onChange(v);
  };
  box.querySelector(".mg-up").addEventListener("click", (e) => (e.stopPropagation(), set(v + step)));
  box.querySelector(".mg-dn").addEventListener("click", (e) => (e.stopPropagation(), set(v - step)));
  const pick = (e) => {
    const r = track.getBoundingClientRect();
    set(min + (1 - (e.clientY - r.top) / r.height) * (max - min));
  };
  draggable(h, { down: () => {}, move: pick });
  track.addEventListener("pointerdown", (e) => (e.target === track ? pick(e) : null));
  h.addEventListener("keydown", (e) => {
    if (e.code === "ArrowUp") set(v + step);
    if (e.code === "ArrowDown") set(v - step);
  });
  show();
  return { el: box, set, get: () => v };
}

// a free dial (the curve mirror's angle): drag around it, or ◀▶; angle in degrees, clamped to [min, max]
export function dial(parent, { label, min = -90, max = 90, value = 0, onChange, sound, step = 5 }) {
  const box = el("div", "mg-knob mg-dial");
  box.innerHTML = `<small>${label}</small><div class="mg-k"><div class="cap" tabindex="0"><i></i></div></div><div class="mg-kbtn"><button aria-label="左へ">‹</button><b></b><button aria-label="右へ">›</button></div>`;
  parent.appendChild(box);
  const cap = box.querySelector(".cap");
  let a = value, lastClick = a;
  const show = () => {
    cap.style.transform = `rotate(${a}deg)`;
    box.querySelector(".mg-kbtn b").textContent = `${Math.round(a)}°`;
  };
  const set = (na) => {
    na = Math.max(min, Math.min(max, na));
    a = na;
    show();
    if (Math.abs(a - lastClick) >= step) (lastClick = a), sound && sound("click");
    onChange(a);
  };
  const [bl, br] = box.querySelectorAll(".mg-kbtn button");
  bl.addEventListener("click", (e) => (e.stopPropagation(), set(a - step)));
  br.addEventListener("click", (e) => (e.stopPropagation(), set(a + step)));
  let a0 = 0, s0 = 0;
  draggable(cap, {
    down: (e) => {
      const r = cap.getBoundingClientRect();
      a0 = ang(r.left + r.width / 2, r.top + r.height / 2, e.clientX, e.clientY);
      s0 = a;
    },
    move: (e) => {
      const r = cap.getBoundingClientRect();
      const d = (wrap(ang(r.left + r.width / 2, r.top + r.height / 2, e.clientX, e.clientY) - a0) * 180) / Math.PI;
      set(s0 + d);
    },
  });
  cap.addEventListener("keydown", (e) => {
    if (e.code === "ArrowLeft") set(a - step);
    if (e.code === "ArrowRight") set(a + step);
  });
  show();
  return { el: box, set, get: () => a };
}

// a two-position rocker switch (tap a side or drag it over)
export function rocker(parent, { label, a, b, value, onChange, sound }) {
  const box = el("div", `mg-rocker ${value === "b" ? "b" : value === "a" ? "a" : ""}`);
  box.innerHTML = `<small>${label}</small><div class="mg-rk" tabindex="0"><span class="ra">${a}</span><span class="rb">${b}</span><i></i></div>`;
  parent.appendChild(box);
  const rk = box.querySelector(".mg-rk");
  const set = (v) => {
    if (v === value) return;
    value = v;
    box.classList.toggle("a", v === "a");
    box.classList.toggle("b", v === "b");
    sound && sound("click");
    onChange(v);
  };
  let x0 = 0, moved = false;
  draggable(rk, {
    down: (e) => ((x0 = e.clientX), (moved = false)),
    move: (e) => {
      const d = e.clientX - x0;
      if (Math.abs(d) > 18) (moved = true), set(d > 0 ? "b" : "a");
    },
    up: (e) => {
      if (moved) return;
      const r = rk.getBoundingClientRect();
      set(e.clientX > r.left + r.width / 2 ? "b" : "a");
    },
  });
  rk.addEventListener("keydown", (e) => (e.code === "ArrowLeft" ? set("a") : e.code === "ArrowRight" ? set("b") : null));
  return { el: box, set };
}

// wires: drag from a plug on the left to a socket on the right (tap a plug, then a socket, also works; tap a
// connected plug to pull its wire). left: [{ id, html }], right: [{ id, html, color }], links: { leftId: rightId }
export function wires(parent, { left, right, links, onLink, sound }) {
  const box = el("div", "mg-wires");
  const L = el("div", "mg-wl"), R = el("div", "mg-wr");
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", "mg-wsvg");
  box.append(L, svg, R);
  parent.appendChild(box);
  let picked = null, drag = null;
  const colorOf = (rid) => (right.find((r) => r.id === rid) || {}).color || "#ccc";
  const pos = (node) => {
    const a = node.getBoundingClientRect(), s = box.getBoundingClientRect();
    return [a.left + a.width / 2 - s.left, a.top + a.height / 2 - s.top];
  };
  const draw = () => {
    const s = box.getBoundingClientRect();
    svg.setAttribute("viewBox", `0 0 ${Math.max(1, s.width)} ${Math.max(1, s.height)}`);
    svg.innerHTML = "";
    const line = (p, q, c, dash) => {
      const pth = document.createElementNS(NS, "path");
      const mx = (p[0] + q[0]) / 2;
      pth.setAttribute("d", `M${p[0]},${p[1]} C${mx},${p[1]} ${mx},${q[1]} ${q[0]},${q[1]}`);
      pth.setAttribute("stroke", c);
      pth.setAttribute("stroke-width", "6");
      pth.setAttribute("fill", "none");
      pth.setAttribute("stroke-linecap", "round");
      if (dash) pth.setAttribute("stroke-dasharray", "8 6");
      svg.appendChild(pth);
    };
    for (const [lid, rid] of Object.entries(links)) {
      const a = L.querySelector(`[data-w="${lid}"] .plug`), b = R.querySelector(`[data-w="${rid}"] .plug`);
      if (a && b) line(pos(a), pos(b), colorOf(rid));
    }
    if (drag) line(drag.from, drag.to, "#e8e8e8", true);
  };
  const connect = (lid, rid) => {
    links[lid] = rid;
    picked = null;
    sound && sound("clip");
    onLink(lid, rid);
    render();
  };
  const render = () => {
    L.innerHTML = "";
    R.innerHTML = "";
    for (const l of left) {
      const n = el("div", `mg-wn ${picked === l.id ? "picked" : ""} ${links[l.id] ? "on" : ""}`, `${l.html}<span class="plug"></span>`);
      n.dataset.w = l.id;
      L.appendChild(n);
      draggable(n, {
        down: (e) => {
          const s = box.getBoundingClientRect();
          drag = { from: pos(n.querySelector(".plug")), to: [e.clientX - s.left, e.clientY - s.top], moved: false };
        },
        move: (e) => {
          if (!drag) return;
          const s = box.getBoundingClientRect();
          drag.to = [e.clientX - s.left, e.clientY - s.top];
          drag.moved = true;
          draw();
        },
        up: (e) => {
          const d = drag;
          drag = null;
          const over = document.elementsFromPoint(e.clientX, e.clientY).map((x) => x.closest && x.closest(".mg-wr [data-w]")).find(Boolean);
          if (d && d.moved && over) return connect(l.id, over.dataset.w);
          if (d && !d.moved) {
            if (links[l.id]) {
              delete links[l.id];
              sound && sound("click");
              onLink(l.id, null);
              picked = null;
            } else picked = picked === l.id ? null : l.id;
          }
          render();
        },
      });
    }
    for (const r of right) {
      const n = el("div", "mg-wn", `<span class="plug" style="background:${r.color}"></span>${r.html}`);
      n.dataset.w = r.id;
      n.addEventListener("click", (e) => (e.stopPropagation(), picked && connect(picked, r.id)));
      R.appendChild(n);
    }
    requestAnimationFrame(draw);
  };
  render();
  return { el: box, connect };
}

// a mirror on a rod: drag on the dial to set the angle (5 degree steps; ◀ ▶); the window shows what the mirror
// sees (draw(ctx, angle, w, h) paints it)
export function mirrorDial(parent, { label, angle, min = 0, max = 90, step = 5, onChange, draw, sound }) {
  const box = el("div", "mg-mirror");
  box.innerHTML = `<small>${label}</small><div class="mg-mrow"><div class="mg-md"><div class="mg-scale"></div><div class="mg-rod"><i></i></div></div><canvas class="mg-view" width="240" height="150"></canvas></div><div class="mg-kbtn"><button aria-label="小さく">‹</button><b></b><button aria-label="大きく">›</button></div>`;
  parent.appendChild(box);
  const rod = box.querySelector(".mg-rod");
  const cv = box.querySelector(".mg-view");
  const show = () => {
    rod.style.transform = `rotate(${-angle}deg)`;
    box.querySelector(".mg-kbtn b").textContent = `${angle}°`;
    draw(cv.getContext("2d"), angle, cv.width, cv.height);
  };
  const set = (a) => {
    a = Math.max(min, Math.min(max, Math.round(a / step) * step));
    if (a === angle) return;
    angle = a;
    show();
    sound && sound("click");
    onChange(angle);
  };
  const md = box.querySelector(".mg-md");
  const pick = (e) => {
    const r = md.getBoundingClientRect();
    const a = (-ang(r.left + r.width * 0.12, r.top + r.height * 0.88, e.clientX, e.clientY) * 180) / Math.PI;
    set(a);
  };
  draggable(md, { down: pick, move: pick });
  const [bl, br] = box.querySelectorAll(".mg-kbtn button");
  bl.addEventListener("click", (e) => (e.stopPropagation(), set(angle - step)));
  br.addEventListener("click", (e) => (e.stopPropagation(), set(angle + step)));
  show();
  return { el: box, set };
}

// a valve wheel: drag round it (both ways) to turn it; value in degrees 0..max (or hold ◀ ▶)
export function valveWheel(parent, { label, value = 0, max = 360, color = "#b03a2e", onChange, sound, done }) {
  const box = el("div", `mg-valve ${done ? "done" : ""}`);
  box.innerHTML = `<small>${label}</small><div class="mg-vw" style="--vc:${color}"><i></i><i></i><i></i></div><div class="mg-prog"><i></i></div><div class="mg-kbtn"><button aria-label="戻す">‹</button><b></b><button aria-label="回す">›</button></div>`;
  parent.appendChild(box);
  const w = box.querySelector(".mg-vw");
  const prog = box.querySelector(".mg-prog i");
  let last = null, hold = null;
  const show = () => {
    w.style.transform = `rotate(${value}deg)`;
    prog.style.width = `${Math.min(100, (value / max) * 100)}%`;
    box.querySelector(".mg-kbtn b").textContent = `${Math.round(value)}°`;
  };
  const add = (d) => {
    if (done) return;
    const before = value;
    value = Math.max(0, Math.min(max, value + d));
    if (Math.floor(before / 30) !== Math.floor(value / 30)) sound && sound("click");
    show();
    onChange(value);
  };
  if (!done) {
    draggable(w, {
      down: (e) => {
        const r = w.getBoundingClientRect();
        last = ang(r.left + r.width / 2, r.top + r.height / 2, e.clientX, e.clientY);
      },
      move: (e) => {
        const r = w.getBoundingClientRect();
        const a = ang(r.left + r.width / 2, r.top + r.height / 2, e.clientX, e.clientY);
        const d = (wrap(a - last) * 180) / Math.PI;
        last = a;
        add(d);
      },
    });
    const [bl, br] = box.querySelectorAll(".mg-kbtn button");
    const stop = () => clearInterval(hold);
    for (const [b, d] of [[bl, -6], [br, 6]]) {
      b.addEventListener("pointerdown", (e) => (e.stopPropagation(), stop(), add(d), (hold = setInterval(() => add(d), 60))));
      for (const ev of ["pointerup", "pointerleave", "pointercancel"]) b.addEventListener(ev, stop);
      b.addEventListener("keydown", (e) => (e.code === "Enter" || e.code === "Space") && add(d * 5));
    }
  }
  show();
  return { el: box, set: (v) => ((value = v), show()) };
}

// hooks on a plan: draw the rope through them in order with one drag (or tap them one by one). hooks: [{ id, x, y
// (0..1), beads }], order: [ids so far]; onHook(id); each hook shows its tactile beads
export function hookTrace(parent, { hooks, order, onHook, sound, hatch }) {
  const box = el("div", "mg-hooks");
  box.innerHTML = `<svg class="mg-hsvg" viewBox="0 0 100 70"></svg>`;
  parent.appendChild(box);
  const svg = box.querySelector("svg");
  const NS = "http://www.w3.org/2000/svg";
  const at = (node, o) => Object.entries(o).forEach(([k, v]) => node.setAttribute(k, v));
  const draw = () => {
    svg.innerHTML = "";
    if (hatch) {
      const h = document.createElementNS(NS, "rect");
      at(h, { x: hatch.x * 100 - 7, y: hatch.y * 70 - 3, width: 14, height: 5, rx: 1.5, class: "hatch" });
      svg.appendChild(h);
    }
    const pts = order.map((id) => hooks.find((h) => h.id === id)).filter(Boolean);
    if (pts.length > 1) {
      const pl = document.createElementNS(NS, "polyline");
      at(pl, { points: pts.map((h) => `${h.x * 100},${h.y * 70}`).join(" "), class: "rope" });
      svg.appendChild(pl);
    }
    for (const h of hooks) {
      const g = document.createElementNS(NS, "g");
      at(g, { class: `hook ${order.includes(h.id) ? "on" : ""}` });
      g.dataset.hook = h.id;
      const c = document.createElementNS(NS, "circle");
      at(c, { cx: h.x * 100, cy: h.y * 70, r: 6.5 });
      g.appendChild(c);
      for (let i = 0; i < h.beads; i++) {
        const b = document.createElementNS(NS, "circle");
        at(b, { cx: h.x * 100 - (h.beads - 1) * 1.6 + i * 3.2, cy: h.y * 70, r: 1.2, class: "bead" });
        g.appendChild(b);
      }
      const n = order.indexOf(h.id);
      if (n >= 0) {
        const t = document.createElementNS(NS, "text");
        at(t, { x: h.x * 100 + 7, y: h.y * 70 - 6, class: "no" });
        t.textContent = String(n + 1);
        g.appendChild(t);
      }
      svg.appendChild(g);
    }
  };
  const hit = (e) => {
    const r = svg.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 100, y = ((e.clientY - r.top) / r.height) * 70;
    return hooks.find((h) => Math.hypot(h.x * 100 - x, h.y * 70 - y) < 8);
  };
  const take = (h) => {
    if (!h || order.includes(h.id)) return;
    sound && sound("clip");
    onHook(h.id);
  };
  draggable(svg, { down: (e) => take(hit(e)), move: (e) => take(hit(e)) });
  draw();
  return { el: box, redraw: (o) => ((order = o), draw()) };
}
