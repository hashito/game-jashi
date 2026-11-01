#!/usr/bin/env node
// The generic self-test of ONE game (docs/testing.md). A game's `npm run selftest` is just:  node tools/selftest-game.mjs
// It runs, in the game's folder: the game's own `npm test`, and every check listed in the manifest selftest.json (name, command, optional,
// timeoutMs, requires). Without a manifest the checks below are auto-detected when their tool exists in the game's tools/ (or in the kit).
//   node tools/selftest-game.mjs [--only <name>[,<name>]] [--json] [--list] [--out selftest-result.json] [--kit <game-kit dir>] [--no-browser]
// selftest.json: { "checks": [ { "name": "plan", "command": "node tools/check-plan.mjs data/plan.json --strict", "optional": false,
//                  "timeoutMs": 120000, "requires": "browser" } ], "autodetect": true }
//   optional: true  -> a failure is a "warn" (does not fail the run)       requires: "browser" -> skipped when there is no Edge/Chrome
//   autodetect: false -> only the manifest runs.   "command" runs through the shell in the game's folder; "{kit}" is replaced by the kit folder.
// Exit code 1 when a non-optional check failed. Result: selftest-result.json (same shape as the kit's own tools/selftest.mjs).
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n, d = null) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const GAME = process.cwd();
const JSON_ONLY = flag("json");
const norm = (s) => String(s).toLowerCase().replace(/[-_.\s]/g, "");
const only = opt("only") ? opt("only").split(",").map(norm) : null;
const rd = (f) => { try { return JSON.parse(fs.readFileSync(path.join(GAME, f), "utf8")); } catch { return null; } };
const has = (f) => fs.existsSync(path.join(GAME, f));

// where the kit's tools are: --kit, kit.json "kit" path, a sibling ../game-kit, or this file's own folder when it is the kit
function findKit() {
  const c = [opt("kit"), process.env.GAME_KIT, path.resolve(HERE, ".."), path.resolve(GAME, "../game-kit"), path.resolve(GAME, "../../game-kit"), path.resolve(GAME, "../Game-fleet/projects/game-kit")].filter(Boolean);
  return c.find((d) => fs.existsSync(path.join(d, "tools", "check-plan.mjs"))) || null;
}
const KIT = findKit();
const toolPath = (name) => (has(`tools/${name}`) ? `tools/${name}` : KIT && fs.existsSync(path.join(KIT, "tools", name)) ? path.join(KIT, "tools", name) : null);

// ---- browser available? ----
const BROWSERS = [process.env.BROWSER, "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].filter(Boolean);
const haveBrowser = !flag("no-browser") && BROWSERS.some((b) => fs.existsSync(b));

// ---- the check list ----
const checks = [];
const pkg = rd("package.json");
const manifest = rd("selftest.json");
const q = (p) => (/\s/.test(p) ? `"${p}"` : p);
const addCheck = (c) => { if (!checks.some((x) => x.name === c.name)) checks.push({ optional: false, timeoutMs: 180000, ...c }); };
if (manifest && Array.isArray(manifest.checks)) manifest.checks.forEach(addCheck);
if (!manifest || manifest.autodetect !== false) {
  if (pkg && pkg.scripts && pkg.scripts.test) addCheck({ name: "npm test", command: "npm test --silent", timeoutMs: 600000 });
  const gd = toolPath("check-game-data.mjs");
  if (has("game.json") && gd) addCheck({ name: "check-game-data", command: `node ${q(gd)} .` });
  const cp = toolPath("check-plan.mjs");
  for (const f of ["data/plan.json", "plan.json"]) if (has(f) && cp) { addCheck({ name: "check-plan", command: `node ${q(cp)} ${f} --strict` }); break; }
  if (has("story/story.js") && toolPath("check-chat.mjs")) addCheck({ name: "check-chat", command: `node ${q(toolPath("check-chat.mjs"))} story/story.js --standard --strict` });
  // optional tools of the 3D standard: run with no arguments only when the game itself carries the tool (it knows its own defaults)
  for (const t of ["check-text-contrast", "check-hud-overlap", "check-load-flicker", "check-select-range", "stairs-check", "check-parcels", "check-no-emoji"])
    if (has(`tools/${t}.mjs`)) addCheck({ name: t, command: `node tools/${t}.mjs`, optional: true, requires: /hud|flicker|select|stairs|parcels|contrast/.test(t) ? "browser" : undefined });
  if (has("tools/perf-routes.mjs") && has("tools/perf-routes-path.mjs")) addCheck({ name: "perf-routes", command: "node tools/perf-routes.mjs", optional: true, requires: "browser" });
}
const picked = checks.filter((c) => !only || only.includes(norm(c.name)));
if (flag("list")) { picked.forEach((c) => console.log(`${c.name}${c.optional ? " (optional)" : ""}${c.requires ? ` [${c.requires}]` : ""}: ${c.command}`)); process.exit(0); }
if (!picked.length) { console.error(`selftest-game: nothing to run in ${GAME} (no package.json test, no selftest.json)`); process.exit(2); }

function run(cmd, timeout) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const p = spawn(cmd.replace(/\{kit\}/g, KIT || ""), { cwd: GAME, shell: true, stdio: ["ignore", "pipe", "pipe"], windowsHide: true, env: { ...process.env, GF_SELFTEST: "1" } });
    let out = "";
    p.stdout.on("data", (d) => (out += d)); p.stderr.on("data", (d) => (out += d));
    const timer = setTimeout(() => { out += "\n[timeout]"; p.kill(); }, timeout);
    p.on("close", (code) => { clearTimeout(timer); resolve({ code, out, ms: Date.now() - t0 }); });
    p.on("error", (e) => { clearTimeout(timer); resolve({ code: 127, out: String(e), ms: Date.now() - t0 }); });
  });
}
const tail = (s, n = 8) => s.trim().split("\n").filter(Boolean).slice(-n).join("\n").slice(0, 700);

const results = [];
const T0 = Date.now();
for (const c of picked) {
  let row;
  if (c.requires === "browser" && !haveBrowser) row = { name: c.name, status: "skip", ms: 0, detail: "no browser" };
  else {
    const r = await run(c.command, c.timeoutMs);
    row = { name: c.name, status: r.code === 0 ? "pass" : c.optional ? "warn" : "fail", ms: r.ms, ...(r.code === 0 ? {} : { detail: tail(r.out) }) };
  }
  row.optional = !!c.optional; row.command = c.command;
  results.push(row);
  if (!JSON_ONLY) console.log(`${{ pass: "ok  ", warn: "warn", skip: "skip", fail: "FAIL" }[row.status]}  ${c.name} (${row.ms} ms)${row.detail && row.status !== "skip" ? "\n      " + row.detail.split("\n").join("\n      ") : ""}`);
}
const count = (s) => results.filter((r) => r.status === s).length;
let commit = "";
try { commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: GAME, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { /* not a git checkout */ }
const summary = { game: (pkg && pkg.name) || path.basename(GAME), commit, date: new Date().toISOString(), node: process.version, total: results.length, pass: count("pass"), fail: count("fail"), warn: count("warn"), skip: count("skip"), ms: Date.now() - T0 };
fs.writeFileSync(path.resolve(GAME, opt("out", "selftest-result.json")), JSON.stringify({ ...summary, results }, null, 1) + "\n");
if (JSON_ONLY) console.log(JSON.stringify({ ...summary, results }));
else {
  console.log(`\n${"check".padEnd(26)} ${"result".padEnd(6)} ms`);
  for (const r of results) console.log(`${r.name.slice(0, 26).padEnd(26)} ${r.status.padEnd(6)} ${r.ms}`);
  console.log(`\nselftest ${summary.game}: ${summary.pass} pass, ${summary.fail} fail, ${summary.warn} warn, ${summary.skip} skip in ${(summary.ms / 1000).toFixed(1)} s`);
}
process.exit(summary.fail ? 1 : 0);
