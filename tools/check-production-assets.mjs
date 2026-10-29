#!/usr/bin/env node
// Explicit asset ledger: a usable scaffold is not the same thing as finished production media.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { localPath } from './authoring/media-queue.mjs';
const root = process.cwd(), errors = [], pending = [];
const release = process.argv.includes('--release');
try {
  const ledger = JSON.parse(fs.readFileSync(path.join(root, 'assets/production.json'), 'utf8'));
  if (ledger.version !== 1 || !Array.isArray(ledger.assets)) throw new Error('assets/production.json: expected version 1 and assets array');
  const seen = new Set();
  for (const a of ledger.assets) {
    if (typeof a.file !== 'string' || !a.file.trim()) { errors.push('asset.file is required'); continue; }
    const full = localPath(fs.realpathSync(root), a.file);
    if (seen.has(a.file)) errors.push(`${a.file}: duplicate asset`);
    seen.add(a.file);
    if (!['ready', 'placeholder', 'missing'].includes(a.status)) errors.push(`${a.file}: unknown status`);
    if (typeof a.credit !== 'string' || !a.credit.trim()) errors.push(`${a.file}: credit / origin is required`);
    if (!fs.existsSync(full) || !fs.statSync(full).isFile()) errors.push(`${a.file}: file is missing`);
    if (a.source?.kind === 'external') {
      for (const key of ['url', 'author', 'license', 'licenseUrl', 'retrievedAt', 'sha256']) if (typeof a.source[key] !== 'string' || !a.source[key].trim()) errors.push(`${a.file}: source.${key} is required for external assets`);
      if (fs.existsSync(full) && fs.statSync(full).isFile() && createHash('sha256').update(fs.readFileSync(full)).digest('hex') !== a.source.sha256) errors.push(`${a.file}: external asset sha256 does not match`);
    }
    if (a.status !== 'ready') pending.push(`${a.file}: ${a.purpose || ''} (${a.status})`);
  }
  pending.forEach((x) => console.log(`TODO ${x}`));
  if (release && pending.length) errors.push(`${pending.length} unfinished production asset(s)`);
  errors.forEach((x) => console.error(`ERROR ${x}`));
  console.log(`assets: ${errors.length} error(s), ${pending.length} unfinished`);
} catch (e) { errors.push(e.message); console.error(e.message); }
process.exitCode = errors.length ? 1 : 0;
