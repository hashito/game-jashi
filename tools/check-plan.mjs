#!/usr/bin/env node
// Floor-plan check (W16/W17): node tools/check-plan.mjs plan.json [...] [--strict] [--as-error=code,..] [--ignore=code,..] [--json]
// Exit 1 on errors (and on warnings with --strict). See docs/floorplan-template.md.
import { readFileSync } from 'node:fs';
import { checkPlan } from '../js/kit/plan-check.js';
const args = process.argv.slice(2), files = args.filter((a) => !a.startsWith('--'));
const opt = (n) => (args.find((a) => a.startsWith(`--${n}=`)) || '').split('=')[1]?.split(',').filter(Boolean) || [];
if (!files.length) { console.error('usage: check-plan.mjs plan.json [...] [--strict] [--as-error=a,b] [--ignore=a,b] [--json]'); process.exit(2); }
let bad = 0;
for (const f of files) {
  const r = checkPlan(JSON.parse(readFileSync(f, 'utf8')), { asError: opt('as-error'), ignore: opt('ignore') });
  if (args.includes('--json')) console.log(JSON.stringify(r, null, 1));
  else {
    console.log(`${f}: ${r.info.join('; ')}`);
    r.errors.forEach((e) => console.log(`  ERROR [${e.code}] ${e.msg}`));
    r.warns.forEach((e) => console.log(`  warn  [${e.code}] ${e.msg}`));
    console.log(`  => ${r.errors.length} error(s), ${r.warns.length} warning(s)`);
  }
  if (r.errors.length || (args.includes('--strict') && r.warns.length)) bad = 1;
}
process.exit(bad);
