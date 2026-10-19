import fs from 'node:fs/promises';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = await fs.readFile(path.join(root, 'vendor/site/assets/index-BMEz9I0h.js'), 'utf8');
const marker = source.lastIndexOf('(0,v.createRoot)');
if (marker < 0) throw new Error('Upstream entry point changed; review the snapshot first.');
const snapshot = vm.runInNewContext(source.slice(0, marker) + ';JSON.stringify(Ot)', {
  document: { createElement: () => ({ relList: { supports: () => true } }) },
  console, TextEncoder, TextDecoder, URL, setTimeout, clearTimeout,
}, { timeout: 10000 });
for (const [version, benchmark] of Object.entries(JSON.parse(snapshot))) {
  const dir = path.join(root, 'data', version);
  await fs.mkdir(dir, { recursive: true });
  const { leaderboard, tasks, taskDetails, trialById, ...metadata } = benchmark;
  for (const [name, value] of Object.entries({ leaderboard, tasks, taskDetails, trialById, metadata })) {
    await fs.writeFile(path.join(dir, `${name}.json`), JSON.stringify(value, null, 2) + '\n');
  }
  console.log(`${version}: ${leaderboard.length} models, ${tasks.length} tasks, ${Object.keys(trialById).length} runs`);
}
