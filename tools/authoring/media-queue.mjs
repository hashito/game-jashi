// Dependency/resource-aware local media production. No shell, API key, paid backend, or auto-download.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
const hash = (data) => createHash('sha256').update(data).digest('hex');
const digest = (file) => hash(fs.readFileSync(file));
const safeId = /^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/;

export function localPath(root, file) {
  if (typeof file !== 'string' || !file || path.isAbsolute(file)) throw new Error(`relative file path required: ${file}`);
  const full = path.resolve(root, file), relative = path.relative(root, full);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`path outside game: ${file}`);
  // Don't allow an output or state directory to escape through a link/junction.
  let part = full;
  while (part !== root) {
    if (fs.existsSync(part) && fs.lstatSync(part).isSymbolicLink()) throw new Error(`symlink / junction not allowed: ${file}`);
    part = path.dirname(part);
  }
  return full;
}

export function validateQueue(q, root) {
  if (q?.version !== 1 || !Array.isArray(q.jobs)) throw new Error('queue: expected version 1 and jobs array');
  const concurrency = q.concurrency ?? 4;
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 16) throw new Error('concurrency must be 1..16');
  const pools = { cpu: 4, gpu: 1, voice: 2, network: 2, ...q.pools };
  for (const [pool, n] of Object.entries(pools)) if (!safeId.test(pool) || !Number.isInteger(n) || n < 1 || n > 16) throw new Error(`pool ${pool}: capacity must be 1..16`);
  const jobs = structuredClone(q.jobs), byId = new Map(), producers = new Map();
  for (const j of jobs) {
    if (typeof j.id !== 'string' || !safeId.test(j.id) || byId.has(j.id)) throw new Error(`invalid / duplicate job id: ${j.id}`);
    if (!['image', 'video', 'voice', 'audio', 'model', 'copy', 'process'].includes(j.kind)) throw new Error(`${j.id}: unknown kind`);
    j.pool ??= ['image', 'video'].includes(j.kind) ? 'gpu' : j.kind === 'voice' ? 'voice' : 'cpu';
    if (!Object.hasOwn(pools, j.pool)) throw new Error(`${j.id}: unknown pool ${j.pool}`);
    if (!Array.isArray(j.outputs) || !j.outputs.length) throw new Error(`${j.id}: outputs are required`);
    j.inputs ??= []; j.dependsOn ??= [];
    if (!Array.isArray(j.inputs) || !Array.isArray(j.dependsOn)) throw new Error(`${j.id}: inputs / dependsOn must be arrays`);
    for (const out of j.outputs) {
      const p = localPath(root, out);
      if (path.relative(root, p).split(path.sep)[0].toLowerCase() === '.media-queue') throw new Error(`${j.id}: reserved queue state path`);
      // Windows output aliases must not be scheduled twice.
      const key = process.platform === 'win32' ? p.toLowerCase() : p;
      if (producers.has(key)) throw new Error(`${j.id}: duplicate output ${out}`);
      producers.set(key, j.id);
    }
    for (const file of j.inputs) localPath(root, file);
    if (j.command != null && (!Array.isArray(j.command) || !j.command.length || !j.command.every((v) => typeof v === 'string' && v.length))) throw new Error(`${j.id}: command must be an argv array`);
    if (!Number.isInteger(j.retries ?? 1) || (j.retries ?? 1) < 0 || (j.retries ?? 1) > 3) throw new Error(`${j.id}: retries must be 0..3`);
    if (!Number.isInteger(j.timeoutMs ?? 600000) || (j.timeoutMs ?? 600000) < 1 || (j.timeoutMs ?? 600000) > 3600000) throw new Error(`${j.id}: timeoutMs must be 1..3600000`);
    byId.set(j.id, j);
  }
  for (const j of jobs) for (const file of j.inputs) {
    const p = localPath(root, file), producer = producers.get(process.platform === 'win32' ? p.toLowerCase() : p);
    if (producer && !j.dependsOn.includes(producer)) j.dependsOn.push(producer);
  }
  const seen = new Set(), visiting = new Set();
  const visit = (id) => {
    if (!byId.has(id)) throw new Error(`unknown dependency: ${id}`);
    if (visiting.has(id)) throw new Error(`cyclic dependency: ${id}`);
    if (seen.has(id)) return;
    visiting.add(id); byId.get(id).dependsOn.forEach(visit); visiting.delete(id); seen.add(id);
  };
  jobs.forEach((j) => visit(j.id));
  return { jobs, pools, concurrency };
}

function killTree(child) {
  if (!child.pid) return;
  if (process.platform === 'win32') {
    try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }); } catch { child.kill(); }
  } else { try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); } }
}

function execute(job, root, logFile, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve({ ok: false, error: 'cancelled' });
    let output = '', error = null, timer;
    const [exe, ...args] = job.command;
    const child = spawn(exe === 'node' ? process.execPath : exe, args, { cwd: root, shell: false, windowsHide: true,
      detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
    const append = (s) => { output = (output + s.toString()).slice(-128000); };
    child.stdout.on('data', append); child.stderr.on('data', append);
    const abort = () => { error = 'cancelled'; killTree(child); };
    signal?.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => { error = 'timeout'; killTree(child); }, job.timeoutMs ?? 600000);
    child.on('error', (e) => { error = e.message; });
    child.on('close', (code) => {
      clearTimeout(timer); signal?.removeEventListener('abort', abort);
      fs.appendFileSync(logFile, output + '\n');
      resolve({ ok: code === 0 && !error, error: error || (code === 0 ? null : `exit ${code}`) });
    });
  });
}

export async function runQueue(queue, { root = process.cwd(), run = false, signal, onEvent = () => {} } = {}) {
  root = fs.realpathSync(root);
  const { jobs, pools, concurrency } = validateQueue(queue, root);
  if (!run) return { mode: 'plan', concurrency, pools, jobs: jobs.map((j) => ({ id: j.id, kind: j.kind, pool: j.pool, dependsOn: j.dependsOn, outputs: j.outputs, status: j.command ? 'ready' : 'planned' })) };
  const dir = localPath(root, '.media-queue'), stateFile = localPath(root, '.media-queue/state.json'), lock = localPath(root, '.media-queue/lock');
  fs.mkdirSync(dir, { recursive: true });
  let handle;
  try { handle = fs.openSync(lock, 'wx'); } catch { throw new Error('media queue is already locked; inspect .media-queue/lock before removing a stale lock'); }
  fs.writeFileSync(handle, JSON.stringify({ pid: process.pid, started: new Date().toISOString() }));
  let previous = { jobs: {} };
  try { previous = JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch { /* first run */ }
  const state = { version: 1, jobs: {} }, busy = new Map(), active = new Map();
  const save = () => { fs.writeFileSync(stateFile + '.tmp', JSON.stringify(state, null, 2)); fs.renameSync(stateFile + '.tmp', stateFile); };
  const event = (id, status) => onEvent({ id, status });
  jobs.forEach((j) => state.jobs[j.id] = { status: 'pending' });
  const perform = async (j) => {
    const record = state.jobs[j.id];
    const old = previous.jobs?.[j.id], backups = new Map();
    let ownsOutputs = false;
    if (old?.outputs) record.outputs = old.outputs;
    const clearProducts = () => {
      for (const out of j.outputs) {
        const full = localPath(root, out);
        if (fs.existsSync(full)) {
          if (!fs.statSync(full).isFile()) throw new Error(`output is not a file: ${out}`);
          fs.unlinkSync(full);
        }
      }
    };
    try {
      if (!j.command) { record.status = 'planned'; record.error = 'command is not configured'; return; }
      for (const input of j.inputs) if (!fs.existsSync(localPath(root, input))) throw new Error(`missing input: ${input}`);
      const fingerprint = hash(JSON.stringify({ job: j, inputs: j.inputs.map((f) => [f, digest(localPath(root, f))]),
        dependencies: j.dependsOn.map((id) => state.jobs[id].outputs) }));
      if (['done', 'cached'].includes(old?.status) && old.fingerprint === fingerprint && old.outputs && j.outputs.every((f) => fs.existsSync(localPath(root, f)) && digest(localPath(root, f)) === old.outputs[f])) {
        Object.assign(record, old, { status: 'cached' }); return;
      }
      // Jobs own only their declared products. Existing unrelated files are never overwritten automatically.
      for (const out of j.outputs) {
        const full = localPath(root, out);
        if (fs.existsSync(full) && (!old?.outputs?.[out] || old.outputs[out] !== digest(full))) throw new Error(`output exists or was edited: ${out}; choose a new output path`);
        fs.mkdirSync(path.dirname(full), { recursive: true });
      }
      // Back up only unchanged products owned by this job. Failed regeneration restores them.
      // After a hard crash, keep backups for explicit recovery rather than guessing ownership.
      const backupDir = localPath(root, `.media-queue/backup-${j.id}`);
      if (fs.existsSync(backupDir)) throw new Error(`recover interrupted job from ${backupDir} before running again`);
      fs.mkdirSync(backupDir);
      for (const [i, out] of j.outputs.entries()) {
        const full = localPath(root, out);
        if (fs.existsSync(full)) { const backup = path.join(backupDir, String(i)); fs.renameSync(full, backup); backups.set(out, backup); }
      }
      ownsOutputs = true;
      const logs = localPath(root, '.media-queue/logs'); fs.mkdirSync(logs, { recursive: true });
      record.status = 'running'; record.fingerprint = fingerprint; save(); event(j.id, 'running');
      let result;
      for (let attempt = 0; attempt <= (j.retries ?? 1); attempt++) {
        if (attempt) clearProducts();
        record.attempts = attempt + 1;
        result = await execute(j, root, localPath(root, `.media-queue/logs/${j.id}.log`), signal);
        if (result.ok || signal?.aborted || result.error === 'timeout') break;
      }
      if (!result.ok) throw new Error(result.error);
      record.outputs = {};
      for (const out of j.outputs) {
        const full = localPath(root, out);
        if (!fs.existsSync(full) || !fs.statSync(full).isFile() || fs.statSync(full).size === 0) throw new Error(`empty / missing output: ${out}`);
        record.outputs[out] = digest(full);
      }
      record.status = 'done';
      ownsOutputs = false;
      for (const backup of backups.values()) fs.unlinkSync(backup);
      fs.rmdirSync(backupDir);
    } catch (e) {
      record.status = signal?.aborted ? 'cancelled' : 'failed'; record.error = e.message;
      if (ownsOutputs) {
        try {
          clearProducts();
          for (const [out, backup] of backups) fs.renameSync(backup, localPath(root, out));
          fs.rmdirSync(localPath(root, `.media-queue/backup-${j.id}`));
          record.outputs = old?.outputs;
        } catch (recovery) { record.error += `; recovery required: ${recovery.message}`; }
      }
    }
    finally { event(j.id, record.status); save(); }
  };
  try {
    while (jobs.some((j) => state.jobs[j.id].status === 'pending') || active.size) {
      let launched = false;
      for (const j of jobs) {
        if (state.jobs[j.id].status !== 'pending') continue;
        if (signal?.aborted) { state.jobs[j.id].status = 'cancelled'; continue; }
        const dependencies = j.dependsOn.map((id) => state.jobs[id].status);
        if (dependencies.some((s) => ['failed', 'blocked', 'planned', 'cancelled'].includes(s))) { state.jobs[j.id].status = 'blocked'; event(j.id, 'blocked'); continue; }
        if (dependencies.some((s) => !['done', 'cached'].includes(s))) continue;
        if (active.size >= concurrency || (busy.get(j.pool) || 0) >= pools[j.pool]) continue;
        busy.set(j.pool, (busy.get(j.pool) || 0) + 1);
        // Register before starting: a cached/planned job may finish synchronously.
        const promise = Promise.resolve().then(() => perform(j)).finally(() => { busy.set(j.pool, busy.get(j.pool) - 1); active.delete(j.id); });
        active.set(j.id, promise); state.jobs[j.id].status = 'queued'; launched = true;
      }
      if (active.size) await Promise.race(active.values());
      else if (!launched && jobs.some((j) => state.jobs[j.id].status === 'pending')) throw new Error('queue cannot make progress');
    }
    save();
    return { mode: 'run', ok: jobs.every((j) => ['done', 'cached'].includes(state.jobs[j.id].status)), ...state };
  } finally {
    await Promise.allSettled(active.values());
    fs.closeSync(handle); fs.unlinkSync(lock);
  }
}
