import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const projectRoot = dirname(root);
const indexPath = join(projectRoot, 'index.html');

function read(path) {
  return readFileSync(path, 'utf8');
}

test('weekly generated constants keep exactly one replacement marker each', () => {
  const html = read(indexPath);
  const vwap = /^    const VWAP_VALUES = \{[^}]*\}; \/\/ @vwap-auto$/gm;
  const corr = /^    const CORR_VALUES = \{.*\}; \/\/ @corr-auto$/gm;
  assert.equal(html.match(vwap)?.length ?? 0, 1, 'VWAP weekly marker must match exactly once');
  assert.equal(html.match(corr)?.length ?? 0, 1, 'correlation weekly marker must match exactly once');
});

test('static runtime module graph exists and is wired from the page', () => {
  const modulePaths = ['assets/runtime.mjs', 'assets/data-sources.mjs', 'assets/dashboard.mjs'];
  for (const path of modulePaths) {
    assert.ok(existsSync(join(projectRoot, path)), `${path} must exist`);
  }

  const html = read(indexPath);
  assert.match(html, /<script\b[^>]*type=["']module["'][^>]*src=["'][^"']*assets\/dashboard\.mjs["']/i,
    'index.html must load dashboard.mjs as an ES module');

  const dashboard = read(join(projectRoot, 'assets/dashboard.mjs'));
  assert.match(dashboard, /(?:from\s*["']\.\/data-sources\.mjs|import\s*\{[^}]*\}\s*from\s*["']\.\/data-sources\.mjs)/,
    'dashboard.mjs must import data-sources.mjs');
  const dataSources = read(join(projectRoot, 'assets/data-sources.mjs'));
  assert.match(`${dashboard}\n${dataSources}`, /(?:from\s*["']\.\/runtime\.mjs|import\s*\{[^}]*\}\s*from\s*["']\.\/runtime\.mjs)/,
    'module graph must include runtime.mjs');
});

test('legacy inline timers are removed from index.html', () => {
  const html = read(indexPath);
  assert.equal((html.match(/\bset(?:Timeout|Interval)\s*\(/g) ?? []).length, 0,
    'index.html must not retain the pre-refactor timer loop');
});
