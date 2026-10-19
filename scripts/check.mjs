import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJSON = async name => JSON.parse(await fs.readFile(path.join(root, name), 'utf8'));
for (const version of ['v1.0', 'v1.1']) {
  const leaderboard = await readJSON(`data/${version}/leaderboard.json`);
  const tasks = await readJSON(`data/${version}/tasks.json`);
  const taskDetails = await readJSON(`data/${version}/taskDetails.json`);
  const trials = await readJSON(`data/${version}/trialById.json`);
  const metadata = await readJSON(`data/${version}/metadata.json`);
  assert.equal(metadata.version, version);
  assert.equal(new Set(leaderboard.map(row => row.id)).size, leaderboard.length, 'Duplicate model ID');
  assert.equal(new Set(tasks.map(task => task.id)).size, tasks.length, 'Duplicate task ID');
  for (const row of leaderboard) {
    assert.ok(row.name && row.scaffold, `Missing model/agent for ${row.id}`);
    assert.ok(Number.isFinite(row.pass1) && row.pass1 >= 0 && row.pass1 <= 100, `Invalid pass1: ${row.id}`);
  }
  for (const task of tasks) assert.ok(taskDetails[task.id], `Missing detail page: ${task.id}`);
  for (const [id, trial] of Object.entries(trials)) {
    assert.ok(tasks.some(task => task.id === trial.task), `Unknown task for run: ${id}`);
    if (trial.trajectoryUrl) assert.ok(/^\/?trajectories\/|^https:\/\//.test(trial.trajectoryUrl), `Invalid trajectory URL: ${id}`);
  }
  console.log(`${version}: data references and score ranges valid`);
}
const manifest = await readJSON('vendor/manifest.json');
for (const entry of manifest.files) {
  const content = await fs.readFile(path.join(root, 'vendor/site', entry.path));
  assert.equal(crypto.createHash('sha256').update(content).digest('hex'), entry.sha256, `Upstream file changed: ${entry.path}`);
}
const dist = path.join(root, 'dist');
const html = await fs.readFile(path.join(dist, 'index.html'), 'utf8');
assert.ok(html.includes('./src/bootstrap.js'));
for (const match of html.matchAll(/(?:href|src)="(\.\/[^"?]+)(?:\?[^"]*)?"/g)) {
  await fs.access(path.join(dist, match[1]));
}
for (const icon of (await readJSON('dist/site.webmanifest')).icons) await fs.access(path.join(dist, icon.src));
const app = await fs.readFile(path.join(dist, 'assets/index-BMEz9I0h.js'), 'utf8');
assert.ok(!app.includes('https://formspree.io/f/xovnyyod'), 'Do not submit subscriber emails to upstream');
assert.ok(app.includes('Object.assign(Ot,window.SWEMarathonReplica.benchmarks)'));
assert.ok(!app.includes('Mt=function(e){return`/`+e}'), 'Origin-root preload breaks Pages subdirectories');
for (const file of await fs.readdir(path.join(dist, 'assets'))) {
  if (!file.endsWith('.js')) continue;
  const fullPath = path.join(dist, 'assets', file);
  execFileSync(process.execPath, ['--check', fullPath]);
  const content = await fs.readFile(fullPath, 'utf8');
  for (const match of content.matchAll(/(?:from|import\()\s*["'`]\.\/([^"'`]+)["'`]/g)) {
    await fs.access(path.join(dist, 'assets', match[1]));
  }
}
execFileSync(process.execPath, ['--check', path.join(dist, 'src/bootstrap.js')]);
console.log(`${manifest.files.length} upstream asset hashes verified; built modules, assets and Pages paths valid.`);
