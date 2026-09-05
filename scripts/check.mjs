#!/usr/bin/env node

import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

function collect(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) collect(path, out);
    else if (/\.(?:mjs|cjs|js)$/.test(entry.name)) out.push(path);
  }
  return out;
}

const files = [
  ...collect(join(root, 'assets')),
  ...collect(join(root, 'tests')),
  ...collect(join(root, 'scripts')),
].sort();

if (!files.length) {
  console.error('check: no JavaScript files found under assets/, tests/, or scripts/');
  process.exit(1);
}

let failed = 0;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], {
    cwd: root,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    failed += 1;
    process.stderr.write(result.stderr || `${relative(root, file)} failed node --check\n`);
  } else {
    console.log(`check: ${relative(root, file)}`);
  }
}

if (failed) {
  console.error(`check: ${failed} file(s) failed`);
  process.exit(1);
}
console.log(`check: ${files.length} JavaScript file(s) passed`);
