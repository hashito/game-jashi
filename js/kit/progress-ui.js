/* game-kit 6e0b6f0: js/progress-ui.js — edit in game-kit and run tools/kit-sync.js */
// Screens for progression.js (style: css/kit.css + the pg-* block): the goal chip on the HUD, the opening
// goal briefing, the level-up dialog with what was unlocked, the goal screen and a "locked" box.
// From 飛騨市長 (ui-levels.js: goalBar / levelDialog / ladder / lockBox), ひだまり薬局 (tutorial.js: prologue,
// the green goal band) and 未然調書 (goals.js: hud / html / memoHTML).
//
//   const pui = new ProgressUI(prog, { ui });          // ui = KitUI (optional: without it, its own overlay)
//   pui.mountHud(document.getElementById('hud-left')); // refreshes itself; click / [G] opens the goal screen
//   pui.briefing(() => fp.lock());                      // once per new game (pages from DEF.goal / DEF.briefing)
//   // level-ups are shown by themselves (queued); goals done -> a toast. Or { auto: false } and call:
//   pui.levelUp({ level, unlocks }); pui.screen(); el.innerHTML = pui.lockBox('auto');
import { esc } from "./ui.js";
import { icon, iconOrText } from "./icons.js";
import { gfRegister, gfEmit, gfOk, gfFail, gfUnknown } from "./gf-test.js";

export const UI_LABELS = {
  goal: "目標",
  screen: "目標と段階",
  lv: (L) => `Lv.${L.no}`,
  levelUp: (L) => `Lv.${L.no}「${L.name}」になりました`,
  first: (L) => `Lv.${L.no}「${L.name}」から始めます`,
  newUnlocks: "新しく使えること",
  nowUnlocks: "いま使えること",
  laterUnlocks: "あとで使えること",
  nextConds: (L) => `次の Lv.${L.no}「${L.name}」の条件`,
  state: { done: "完了", now: "進行中", later: "未着手" },
  hidden: "条件は、前の段階を終えると分かります。",
  willUnlock: "ここまで進むと使えます",
  unlocked: "使えるようになりました",
  optional: "できたら",
  here: "いまここ",
  ok: "わかった",
  next: "次へ",
  back: "戻る",
  skip: "とばす",
  start: "はじめる",
  close: "閉じる",
  showConds: "条件を見る",
  goalDone: (g) => `✓ ${g.text}`,
  pages: ["目標", "進み方", "段階と解放", "さっそく"],
  meterHow: (m) => `ひとつ終えるたびに${m}がたまり、段階が上がると使えることが増えます。左上の帯（[G]）でいつでも確認できます。`,
  startHow: "まずはこれから：",
  doneAll: "すべての段階を終えました",
  task: { title: "タスク", now: "いまのタスク", undone: "これから", done: "終えたこと", abilities: "できること", allDone: "この段階のタスクは終わりました。次の条件がそろうと進みます。", count: (d, n) => `${d}/${n} 完了` },
};

const pct = (f) => `${Math.round(Math.max(0, Math.min(1, f)) * 100)}%`;
const bar = (f, cls = "") => `<span class="pg-bar ${cls}"><i style="width:${pct(f)}"></i></span>`;

export class ProgressUI {
  // opts: ui (KitUI), labels, face(who) -> img url, key ('KeyG' opens the screen; null = none), auto, toasts, reveal
  constructor(prog, opts = {}) {
    this.p = prog;
    this.ui = opts.ui || null;
    this.o = { auto: true, toasts: true, key: "KeyG", reveal: false, ...opts };
    this.L = { ...UI_LABELS, ...(opts.labels || {}), task: { ...UI_LABELS.task, ...((opts.labels || {}).task || {}) } };   // (1.1) a partial labels.task keeps the rest (count ...)
    this.q = [];
    this.cur = null;
    if (this.o.auto) {
      prog.on("levelup", (e) => this.levelUp(e));
      if (this.o.toasts) prog.on("goal", (g) => this.toast(esc(this.L.goalDone(g))));
    }
    prog.on("update", () => this.refresh());
    gfRegister("progressUi", () => ({
      snapshot: () => ({ open: this.isOpen(), level: this.p.level ? this.p.level.id : null, meter: this.p.meter(), complete: !!this.p.complete, queued: this.q.length, tasks: (() => { const m = this.p.taskModel(); return { done: m.counts.done, total: m.counts.total }; })() }),
      drive: (action, a = {}) => {
        switch (action) {
          case "screen": this.screen(); return gfOk({ open: this.isOpen() });
          case "taskScreen": this.taskScreen(); return gfOk({ open: this.isOpen() });
          case "close": this.close(true); return gfOk({ open: this.isOpen() });
          case "add": this.p.add(a.stat, a.n == null ? 1 : a.n); return gfOk({ meter: this.p.meter() });
          case "flag": this.p.flag(a.flag, a.on !== false); return gfOk({ meter: this.p.meter() });
          default: return gfUnknown(action);
        }
      },
      reset: () => { this.close(true); this.q.length = 0; this.cur = null; },
    }));
    if (this.o.key && typeof addEventListener === "function")
      addEventListener("keydown", (e) => {
        if (e.code === this.o.key && !this.isOpen() && !/INPUT|TEXTAREA/.test((e.target && e.target.tagName) || "")) this.screen();
        if (e.code === "Escape" && this.own) this.close();
      });
  }

  // ---- windows: KitUI when given, else a small overlay with the same classes -----------------------
  isOpen() {
    return this.ui ? !!this.ui.open : !!this.own;
  }
  win(name, title, sub, cls) {
    if (this.ui) {
      const w = this.ui.window(name, title, sub, { cls: `pg ${cls}` });
      return { ...w, close: () => this.ui.close() };
    }
    this.close(true);
    const el = document.createElement("div");
    el.className = `win-wrap pg-layer pg ${cls}`;
    el.innerHTML = `<div class="win" role="dialog" aria-label="${title.replace(/<[^>]+>/g, "").replace(/"/g, "&quot;")}"><div class="win-head"><div class="win-title">${title}</div><div class="win-sub">${sub}</div><button class="win-x" aria-label="${esc(this.L.close)}">×</button></div><div class="win-body"></div><div class="win-foot"></div></div>`;
    document.body.appendChild(el);
    const w = { el, body: el.querySelector(".win-body"), foot: el.querySelector(".win-foot"), close: () => this.close() };
    el.querySelector(".win-x").onclick = () => this.close();
    this.own = w;
    return w;
  }
  close(silent = false) {
    if (this.ui) return this.ui.close(silent);
    if (!this.own) return;
    const w = this.own;
    this.own = null;
    w.el.remove();
    if (!silent && w.onClose) w.onClose();
  }
  buttons(foot, list) {
    if (this.ui) return this.ui.buttons(foot, list);
    foot.innerHTML = "";
    for (const b of list) {
      const btn = document.createElement("button");
      btn.className = `btn ${b.cls || ""}`;
      btn.textContent = b.t;
      btn.onclick = () => b.fn && b.fn(btn);
      foot.appendChild(btn);
    }
  }
  toast(html) {
    if (this.ui) return this.ui.toast(html, "ok");
    let box = document.querySelector(".pg-toasts");
    if (!box) document.body.appendChild((box = Object.assign(document.createElement("div"), { className: "pg-toasts" })));
    const el = Object.assign(document.createElement("div"), { className: "pg-toast", innerHTML: html });
    box.appendChild(el);
    setTimeout(() => el.classList.add("out"), 3800);
    setTimeout(() => el.remove(), 4500);
  }

  // ---- HUD chip --------------------------------------------------------------------------------------
  hudHTML() {
    const p = this.p;
    const g = p.current();
    let f = 0;
    if (g) f = p.goalProgress(g).frac;
    else if (p.levels[p.index + 1]) {
      const cs = p.conditions(p.index + 1);
      f = cs.length ? cs.filter((c) => c.ok).length / cs.length : 0;
    } else f = 1;
    const goal = p.def.goal || {};
    return `${goal.short || goal.title ? `<span class="pg-goal"><span class="pg-k">${esc(this.L.goal)}</span>${esc(goal.short || goal.title)}</span>` : ""}
      <span class="pg-head"><span class="pg-lv">${esc(this.L.lv(p.level))}</span><span class="pg-name">${esc(p.level.name)}</span>${goal.meter ? `<span class="pg-meter">${esc(goal.meter)} <b>${p.meter()}%</b></span>` : ""}</span>
      <span class="pg-now">${esc(p.next())}</span>${bar(f)}`;
  }
  mountHud(parent = document.getElementById("hud-left") || document.body) {
    if (!this.hudEl) {
      this.hudEl = document.createElement("button");
      this.hudEl.className = "pg-hud";
      this.hudEl.type = "button";
      this.hudEl.setAttribute("aria-label", this.L.screen);
      this.hudEl.onclick = () => this.screen();
    }
    parent.appendChild(this.hudEl);
    this.refresh();
    return this.hudEl;
  }
  refresh() {
    if (!this.hudEl) return;
    const html = this.hudHTML();
    if (html === this.last) return;
    if (this.last) {
      this.hudEl.classList.remove("bump");
      void this.hudEl.offsetWidth;
      this.hudEl.classList.add("bump");
    }
    this.hudEl.innerHTML = this.last = html;
  }

  // ---- pieces ----------------------------------------------------------------------------------------
  chips(list, off = false) {
    return list.map((u) => `<span class="pg-chip ${off ? "off" : ""}" title="${esc(u.desc || "")}">${u.icon ? `<i>${iconOrText(u.icon, { size: 16 })}</i>` : ""}${esc(u.name)}</span>`).join("");
  }
  condsHTML(list) {
    return `<ul class="pg-conds">${list.map((c) => `<li class="${c.ok ? "ok" : ""}"><span class="pg-ck">${c.ok ? "✓" : "○"}</span>${esc(c.label)}${typeof c.need === "number" && typeof c.cur === "number" && c.need > 1 ? `<small>${esc(Math.min(c.cur, c.need))}/${esc(c.need)}</small>` : ""}</li>`).join("")}</ul>`;
  }
  ladderHTML() {
    const p = this.p;
    return `<ol class="pg-ladder">${p.levels.map((L) => `<li class="${L.index < p.index ? "done" : L.index === p.index ? "now" : ""}"><span class="pg-lv">${esc(this.L.lv(L))}</span><b>${esc(L.name)}</b>${L.title ? `<small>${esc(L.title)}</small>` : ""}${L.index === p.index ? `<em>${esc(this.L.here)}</em>` : ""}</li>`).join("")}</ol>`;
  }
  steps(at) {
    return `<div class="pg-steps">${this.p.levels.map((L) => `<i class="${L.index === at ? "on" : L.index < at ? "done" : ""}" title="${esc(L.name)}">${L.no}</i>`).join("")}</div>`;
  }
  say(text, who) {
    const face = who && this.o.face ? this.o.face(who) : null;
    return `<div class="talkrow pg-say">${face ? `<img class="talkface" src="${esc(face)}" alt="">` : ""}<div class="bubble">${esc(text)}</div></div>`;
  }
  lockBox(key) {
    const u = this.p.unlockInfo(key);
    if (this.p.isUnlocked(key)) return "";
    return `<div class="pg-lock"><span class="pg-lk">${icon("lock", { size: 16 })}</span><div><b>${esc(u.name)}</b> ${esc(this.p.lockText(key))}${u.why ? `<small>${esc(u.why)}</small>` : ""}</div><button class="btn small" data-pg-screen="1">${esc(this.L.showConds)}</button></div>`;
  }
  // wire buttons made by lockBox (data-pg-screen) inside a root
  wire(root) {
    for (const b of root.querySelectorAll("[data-pg-screen]")) b.onclick = () => this.screen();
  }

  // ---- the opening briefing: goal, how it goes, the ladder with now / later, the first step -------------
  // pages: [{ head, html }] replaces the default ones. DEF.briefing { goal, meter, ladder, start, who } adds a line each.
  briefing(then, opts = {}) {
    const p = this.p;
    const G = p.def.goal || {};
    const B = p.def.briefing || {};
    const H = this.L.pages;
    const later = p.levels.filter((L) => L.index > p.index && (L.unlocks || []).length);
    const pages = opts.pages || [
      { head: H[0], html: `${B.goal ? this.say(B.goal, B.who) : ""}<div class="pg-big"><span class="pg-k">${esc(this.L.goal)}</span><b>${esc(G.title || "")}</b>${G.sub ? `<small>${esc(G.sub)}</small>` : ""}</div>` },
      { head: H[1], html: `${B.meter ? this.say(B.meter, B.who) : ""}<p>${esc(this.L.meterHow(G.meter || "進み具合"))}</p><div class="pg-sample">${this.hudHTML()}</div>` },
      { head: H[2], html: `${B.ladder ? this.say(B.ladder, B.who) : ""}${this.ladderHTML()}
          <div class="pg-sub">${esc(this.L.nowUnlocks)}</div><div class="pg-chips">${this.chips(p.levels.slice(0, p.index + 1).flatMap((L) => p.unlocksAt(L.index)))}</div>
          ${later.length ? `<div class="pg-sub">${esc(this.L.laterUnlocks)}</div><div class="pg-chips">${later.map((L) => this.chips(p.unlocksAt(L.index).map((u) => ({ ...u, name: `${u.name}（${this.L.lv(L)}）` })), true)).join("")}</div>` : ""}` },
      { head: H[3], html: `${B.start ? this.say(B.start, B.who) : ""}<p class="pg-start">${esc(this.L.startHow)}<b>${esc(p.next())}</b></p>` },
    ];
    let i = 0;
    const done = () => (this.close(true), then && then());
    const show = () => {
      const w = this.win("pg-brief", esc(pages[i].head), `${i + 1} / ${pages.length}`, "pg-brief");
      w.body.innerHTML = `<div class="pg-dots">${pages.map((_, k) => `<i class="${k === i ? "on" : ""}"></i>`).join("")}</div>${pages[i].html}`;
      this.buttons(w.foot, [
        ...(i > 0 ? [{ t: this.L.back, fn: () => (i--, show()) }] : []),
        ...(i < pages.length - 1 ? [{ t: this.L.skip, cls: "ghost", fn: done }, { t: this.L.next, cls: "primary", fn: () => (i++, show()) }] : [{ t: this.L.start, cls: "primary", fn: done }]),
      ]);
      w.onClose = then;
    };
    show();
  }

  // ---- level-up (queued when a window is open) ---------------------------------------------------------
  levelUp(ev, then, first = false) {
    this.q.push({ ev, then, first });
    if (!this.cur) this.pump();
  }
  pump() {
    if (this.isOpen() && !this.cur) return setTimeout(() => this.pump(), 400);
    const it = (this.cur = this.q.shift() || null);
    if (!it) return;
    const p = this.p;
    const L = it.ev.level;
    const nx = p.levels[L.index + 1];
    const unl = it.ev.unlocks || p.unlocksAt(L.index);
    const w = this.win("pg-levelup", esc(it.first ? this.L.first(L) : this.L.levelUp(L)), esc(L.title || ""), "pg-levelup");
    w.body.innerHTML = `${this.steps(L.index)}${L.text ? this.say(L.text, L.who) : ""}
      ${unl.length ? `<h3 class="pg-h">${esc(it.first ? this.L.nowUnlocks : this.L.newUnlocks)}</h3><ul class="pg-new">${unl.map((u) => `<li>${u.icon ? iconOrText(u.icon, { size: 16 }) : icon("unlock", { size: 16 })} <b>${esc(u.name)}</b>${u.desc ? `<small>${esc(u.desc)}</small>` : ""}</li>`).join("")}</ul>` : ""}
      ${nx ? `<h3 class="pg-h">${esc(this.L.nextConds(nx))}</h3>${this.condsHTML(p.conditions(nx.index))}` : ""}`;
    const fin = () => {
      this.cur = null;
      if (it.then) it.then();
      if (this.q.length) setTimeout(() => this.pump(), 250);
    };
    this.buttons(w.foot, [{ t: this.L.ok, cls: "primary", fn: () => (this.close(true), fin()) }]);
    w.onClose = fin;
  }

  // ---- the goal screen: the goal and meter, every level with its goals, conditions and unlocks -------------
  screenHTML() {
    const p = this.p;
    const G = p.def.goal || {};
    const levels = p.levels.map((L) => {
      const state = L.index < p.index ? "done" : L.index === p.index ? "now" : "later";
      const known = state !== "later" || this.o.reveal || L.index === p.index + 1;
      const goals = p.goalsOf(L.index);
      const conds = L.index === p.index + 1 ? this.condsHTML(p.conditions(L.index)) : "";
      const list = goals.length && (state !== "later" || this.o.reveal)
        ? `<ul class="pg-goals">${goals.map((g) => {
            const gp = p.goalProgress(g);
            const lock = g.needs && !p.isUnlocked(g.needs);
            return `<li class="${gp.done ? "ok" : ""} ${g.optional ? "opt" : ""}"><span class="pg-ck">${gp.done ? "✓" : lock ? icon("lock", { size: 14 }) : g.optional ? "・" : "◆"}</span><span class="pg-gt">${esc(g.text)}${g.optional ? `<em>${esc(this.L.optional)}</em>` : ""}${g.where && !gp.done ? `<small>${esc(g.where)}</small>` : ""}</span>${gp.need > 1 && !gp.done ? `${bar(gp.frac, "mini")}<small class="pg-n">${gp.cur}/${gp.need}</small>` : ""}</li>`;
          }).join("")}</ul>`
        : goals.length ? `<p class="dim pg-hidden">${esc(this.L.hidden)}</p>` : "";
      const unl = p.unlocksAt(L.index);
      return `<section class="pg-stage ${state}"><h4><span class="pg-lv">${esc(this.L.lv(L))}</span>${esc(L.name)}${L.title ? `<small>${esc(L.title)}</small>` : ""}<span class="pg-state">${esc(this.L.state[state])}</span></h4>
        ${known && L.text && state === "now" ? `<p class="pg-intro">${esc(L.text)}</p>` : ""}${conds}${list}
        ${unl.length ? `<div class="pg-unl"><span class="pg-k">${esc(state === "later" ? this.L.willUnlock : this.L.unlocked)}</span>${this.chips(unl, state === "later")}</div>` : ""}</section>`;
    });
    return `<div class="pg-top"><div class="pg-big"><span class="pg-k">${esc(this.L.goal)}</span><b>${esc(G.title || "")}</b>${G.sub ? `<small>${esc(G.sub)}</small>` : ""}</div>
      <div class="pg-total">${G.meter ? `<span>${esc(G.meter)}</span>` : ""}${bar(p.meter() / 100)}<b>${p.meter()}%</b></div></div>
      <div class="pg-stages">${levels.join("")}</div>`;
  }
  screen() {
    const w = this.win("pg-screen", `${icon("tasks", { size: 20 })} ${esc(this.L.screen)}`, esc(`${this.L.lv(this.p.level)} ${this.p.level.name}`), "pg-screenwin");
    w.body.innerHTML = this.screenHTML();
    this.buttons(w.foot, [{ t: this.L.close, cls: "primary", fn: () => w.close() }]);
    return w;
  }

  // ---- the task screen (未然調書 style): the current goal, the level's tasks done / undone each with its meaning and
  // progress, what unlocks next (lock icon), and the abilities list (on / locked). Data: prog.taskModel().
  taskScreenHTML() {
    const m = this.p.taskModel();
    const Lb = this.L;
    const t = Lb.task;
    const row = (x) => `<li class="${x.done ? "ok" : ""} ${x.optional ? "opt" : ""} ${x.locked ? "lock" : ""}"><span class="pg-ck">${x.done ? "✓" : x.locked ? icon("lock", { size: 14 }) : x.optional ? "・" : "◆"}</span><span class="pg-gt">${esc(x.text)}${x.optional ? `<em>${esc(Lb.optional)}</em>` : ""}${x.meaning ? `<small class="pg-mean">${esc(x.meaning)}</small>` : ""}${x.where && !x.done ? `<small>${esc(x.where)}</small>` : ""}${x.locked ? `<small>${esc(x.lockText)}</small>` : ""}</span>${x.need > 1 && !x.done ? `${bar(x.frac, "mini")}<small class="pg-n">${x.cur}/${x.need}</small>` : ""}</li>`;
    const cur = m.current;
    const open = m.tasks.filter((x) => !x.done), done = m.tasks.filter((x) => x.done);
    return `<div class="pg-top"><div class="pg-big"><span class="pg-k">${esc(Lb.goal)}</span><b>${esc(m.goal.title)}</b>${m.goal.sub ? `<small>${esc(m.goal.sub)}</small>` : ""}</div>
      <div class="pg-total">${m.goal.meter ? `<span>${esc(m.goal.meter)}</span>` : ""}${bar(m.goal.pct / 100)}<b>${m.goal.pct}%</b></div></div>
      <section class="pg-task-now"><h4><span class="pg-lv">${esc(Lb.lv(m.level))}</span>${esc(m.level.name)}<span class="pg-state">${esc(t.count(m.counts.done, m.counts.total))}</span></h4>
        ${cur ? `<div class="pg-cur"><span class="pg-k">${esc(t.now)}</span><b>${esc(cur.text)}</b>${cur.meaning ? `<p>${esc(cur.meaning)}</p>` : ""}${cur.where ? `<small>${esc(cur.where)}</small>` : ""}${cur.need > 1 ? `<div class="pg-curbar">${bar(cur.frac)}<small class="pg-n">${cur.cur}/${cur.need}</small></div>` : ""}</div>` : `<p class="dim">${esc(m.next ? t.allDone : Lb.doneAll)}</p>`}
        ${open.length ? `<div class="pg-sub">${esc(t.undone)}</div><ul class="pg-goals">${open.map(row).join("")}</ul>` : ""}
        ${done.length ? `<div class="pg-sub">${esc(t.done)}</div><ul class="pg-goals">${done.map(row).join("")}</ul>` : ""}</section>
      ${m.next ? `<section class="pg-task-next"><h4>${esc(Lb.nextConds(m.next.level))}</h4>${this.condsHTML(m.next.conditions)}${m.next.unlocks.length ? `<div class="pg-unl"><span class="pg-k">${esc(Lb.willUnlock)}</span>${m.next.unlocks.map((u) => `<span class="pg-chip off" title="${esc(u.desc || "")}"><i>${icon("lock", { size: 16 })}</i>${esc(u.name)}</span>`).join("")}</div>` : ""}</section>` : ""}
      ${m.abilities.length ? `<section class="pg-abil"><h4>${esc(t.abilities)}</h4><ul class="pg-abils">${m.abilities.map((a) => `<li class="${a.on ? "on" : "off"}"><span class="pg-ai">${a.on ? (a.icon ? iconOrText(a.icon, { size: 18 }) : "✓") : icon("lock", { size: 18 })}</span><span><b>${esc(a.name)}</b><small>${esc(a.on ? a.desc : a.lockText)}</small></span></li>`).join("")}</ul></section>` : ""}`;
  }
  taskScreen() {
    const p = this.p;
    const w = this.win("pg-tasks", `${icon("tasks", { size: 20 })} ${esc(this.L.task.title)}`, esc(`${this.L.lv(p.level)} ${p.level.name}`), "pg-screenwin pg-taskwin");
    w.body.innerHTML = this.taskScreenHTML();
    this.buttons(w.foot, [{ t: this.L.close, cls: "primary", fn: () => w.close() }]);
    return w;
  }
}
