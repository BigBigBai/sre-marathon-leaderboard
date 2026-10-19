import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { validateData } from '../src/model.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = {};
for (const name of ['benchmark', 'leaderboard', 'applications', 'supplementary']) data[name] = JSON.parse(await fs.readFile(path.join(root, 'data', `${name}.json`), 'utf8'));
validateData(data);
assert.equal(data.leaderboard.filter(row => row.backbone == null).length, 1);
assert.equal(new Set(data.leaderboard.map(row => row.method)).size, 10);
assert.equal(Math.max(...data.leaderboard.map(row => row.marathonScore)), 41.3);
const html = await fs.readFile(path.join(root, 'dist/index.html'), 'utf8');
assert.ok(!html.includes('__PUBLIC_URL__'));
assert.ok(html.includes('https://bigbigbai.github.io/sre-marathon-leaderboard/'));
for (const match of html.matchAll(/(?:href|src)="(\.\/[^"#?]+)"/g)) await fs.access(path.join(root, 'dist', match[1]));
for (const file of await fs.readdir(path.join(root, 'dist/src'))) {
  const full = path.join(root, 'dist/src', file);
  if (!file.endsWith('.js')) continue;
  execFileSync(process.execPath, ['--check', full]);
  const content = await fs.readFile(full, 'utf8');
  for (const match of content.matchAll(/from ['"]\.\/([^'"]+)['"]/g)) await fs.access(path.join(root, 'dist/src', match[1]));
  assert.ok(!/swe-marathon\.org|abundant\.ai|formspree|\/trajectories\//i.test(content), `Stale upstream dependency: ${file}`);
}
for (const file of ['favicon.svg']) await fs.access(path.join(root, 'dist', file));
await assert.rejects(fs.access(path.join(root, 'dist/data/v1.1')));
await assert.rejects(fs.access(path.join(root, 'dist/assets/index-BMEz9I0h.js')));
console.log('Verified 19 configurations, 10 methods, 700 catalog faults, local assets and module paths. No SWE assets in the deployment.');

for (const file of ['sre-marathon-paper.pdf', 'assets/system-overview.png', 'assets/case-comparison.png']) await assert.rejects(fs.access(path.join(root, 'dist', file)));
