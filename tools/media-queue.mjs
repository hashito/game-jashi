#!/usr/bin/env node
import fs from 'node:fs';
import { runQueue } from './authoring/media-queue.mjs';
const args = process.argv.slice(2);
if (!args.length || args.includes('--help')) {
  console.log('node tools/media-queue.mjs <queue.json> [--run]\nDefault: validate and print the full plan without executing commands.\n--run: execute configured local argv workers, share resource limits, cache results, retry failures.\nRun from the game directory. See docs/media-production.md.');
} else {
  const controller = new AbortController();
  process.once('SIGINT', () => controller.abort());
  process.once('SIGTERM', () => controller.abort());
  try {
    if (args.some((a) => a.startsWith('--') && a !== '--run') || args.filter((a) => !a.startsWith('--')).length !== 1) throw new Error('unknown arguments (see --help)');
    const q = JSON.parse(fs.readFileSync(args[0], 'utf8').replace(/^\uFEFF/, ''));
    const result = await runQueue(q, { run: args.includes('--run'), signal: controller.signal, onEvent: (e) => console.log(`${e.id}: ${e.status}`) });
    console.log(JSON.stringify(result, null, 2));
    if (result.mode === 'run' && !result.ok) process.exitCode = 1;
  } catch (e) { console.error(e.message); process.exitCode = 1; }
}
