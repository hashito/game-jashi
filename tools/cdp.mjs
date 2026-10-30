// A tiny headless Edge / Chrome driver over the DevTools protocol (no dependencies; Node 22+).
// Used by tools/shot.mjs (screenshots) and tools/playthrough.mjs (every ending through the real game).
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const EXES = [process.env.BROWSER, "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].filter(Boolean);

export async function launch(o = {}) {
  const exe = EXES.find((b) => fs.existsSync(b));
  if (!exe) throw new Error("no Edge / Chrome");
  const W = o.width || 1280, H = o.height || 720;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cdp-"));
  const flags = [`--user-data-dir=${dir}`, "--remote-debugging-port=0", "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows", "--autoplay-policy=no-user-gesture-required", "--ignore-gpu-blocklist", `--window-size=${W},${H}`, "--headless=new"];
  // Explicit opt-in for the trusted local pages on GPU-less CI runners.
  if (process.env.GF_SOFTWARE_GL === '1') flags.push('--use-gl=angle', '--use-angle=swiftshader');
  else if (process.platform === "win32") flags.push("--use-angle=d3d11");
  const proc = spawn(exe, [...flags, "about:blank"], { stdio: "ignore", windowsHide: true });
  let startupError=null;proc.once('error',error=>{startupError=error;});
  const stopOwnedBrowser=async()=>{
    if(proc.exitCode!==null||!Number.isInteger(proc.pid))return;
    if(process.platform==='win32')await new Promise(resolve=>{const killer=spawn('taskkill',['/PID',String(proc.pid),'/T','/F'],{stdio:'ignore',windowsHide:true});killer.once('exit',resolve);killer.once('error',resolve);});
    else proc.kill();
  };
  let port = null;
  for (let i = 0; i < 450 && !port && !startupError; i++) {
    const f = path.join(dir, "DevToolsActivePort");
    try {
      if (fs.existsSync(f)) port = fs.readFileSync(f, "utf8").split("\n")[0].trim();
    } catch {} // still being written by the browser (EBUSY on Windows): try again
    if (!port) await sleep(100);
  }
  if(!port){await stopOwnedBrowser();throw new Error(`Browser startup did not expose DevTools within 45s: ${startupError?.message||exe}`);}
  let wsUrl = null;
  for (let i = 0; i < 100 && !wsUrl; i++) {
    const list = await fetch(`http://127.0.0.1:${port}/json/list`,{signal:AbortSignal.timeout(1000)}).then((r) => r.json()).catch(() => []);
    wsUrl = list.find((t) => t.type === "page")?.webSocketDebuggerUrl;
    if (!wsUrl) await sleep(100);
  }
  if(!wsUrl){await stopOwnedBrowser();throw new Error('Browser started without an inspectable page');}
  const ws = new WebSocket(wsUrl);
  try{await new Promise((res, rej) => {const timer=setTimeout(()=>rej(new Error('DevTools websocket startup timed out')),10000);ws.onopen=()=>{clearTimeout(timer);res();};ws.onerror=error=>{clearTimeout(timer);rej(error);};});}
  catch(error){ws.close();await stopOwnedBrowser();throw error;}
  let seq = 0;
  const waits = new Map();
  const errors = [];
  const logs = [];
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && waits.has(msg.id)) {
      const [res, rej, timer] = waits.get(msg.id);
      clearTimeout(timer);
      waits.delete(msg.id);
      msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
    } else if (msg.method === "Runtime.exceptionThrown") errors.push(msg.params.exceptionDetails?.exception?.description?.split("\n").slice(0, 3).join(" ") || "exception");
    else if (msg.method === "Runtime.consoleAPICalled") {
      const t = msg.params.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 300);
      if (msg.params.type === "error") errors.push(t);
      else logs.push(`${msg.params.type}: ${t}`);
    } else if (msg.method === "Log.entryAdded" && msg.params.entry.level === "error") errors.push(`${msg.params.entry.text} ${msg.params.entry.url || ""}`.slice(0, 300));
  };
  ws.onclose = () => {
    for (const [, reject, timer] of waits.values()) { clearTimeout(timer); reject(new Error('browser disconnected')); }
    waits.clear();
  };
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const id = ++seq;
      const timer = setTimeout(() => { waits.delete(id); rej(new Error(`CDP timeout: ${method}`)); }, 60000);
      waits.set(id, [res, rej, timer]);
      try { ws.send(JSON.stringify({ id, method, params })); }
      catch (e) { clearTimeout(timer); waits.delete(id); rej(e); }
    });
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Log.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: o.dpr || 1, mobile: !!o.mobile });
  if (o.mobile) await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  const page = {
    errors,
    logs,
    send,
    sleep,
    async goto(url) {
      await send("Page.navigate", { url });
      await sleep(500);
    },
    async eval(expr) {
      const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true, userGesture: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    },
    async waitFor(expr, ms = 60000) {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        if (await page.eval(`!!(${expr})`).catch(() => false)) return true;
        await sleep(200);
      }
      throw new Error(`timeout: ${expr}`);
    },
    async shot(file) {
      const r = await send("Page.captureScreenshot", { format: file.endsWith(".png") ? "png" : "jpeg", quality: 80 });
      fs.writeFileSync(file, Buffer.from(r.data, "base64"));
    },
    async key(code, type = "both") {
      const k = { KeyE: "e", KeyG: "g", Tab: "Tab", Escape: "Escape", KeyW: "w" }[code] || code;
      if (type !== "up") await send("Input.dispatchKeyEvent", { type: "keyDown", code, key: k });
      if (type !== "down") await send("Input.dispatchKeyEvent", { type: "keyUp", code, key: k });
    },
    async click(x, y) {
      await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
      await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
    },
    async close() {
      // Ask Chromium to close its whole process tree, including the DevTools socket.
      // Killing only the launcher can leave a socket alive and hang node --test.
      await Promise.race([send('Browser.close').catch(() => {}), sleep(1000)]);
      try {
        ws.close();
      } catch {}
      proc.kill();
      await sleep(400);
      try {
        fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
      } catch {}
    },
  };
  return page;
}
