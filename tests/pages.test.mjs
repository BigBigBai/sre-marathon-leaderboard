import test from 'node:test';
import assert from 'node:assert/strict';
import { createStaticServer } from '../scripts/server.mjs';

test('a Pages subdirectory resolves entry, data, images, lazy modules and manifest', async t => {
  const server = createStaticServer(new URL('../dist/', import.meta.url).pathname, '/swe-marathon-leaderboard/');
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/swe-marathon-leaderboard/`;
  const html = await (await fetch(base)).text();
  assert.ok(html.includes('./src/bootstrap.js'));
  for (const asset of ['src/bootstrap.js', 'src/site.config.json', 'assets/index-BMEz9I0h.js',
    'assets/analysis-DuIku1ZK.js', 'assets/installCanvasRenderer-VQkYRJvL.js',
    'assets/gpt56-stats-C82dffFf.js', 'assets/astra-stats-CKa6tc11.js',
    'assets/claude5-stats-CWEaJ6_v.js', 'assets/logos/stripe.png?v=ca89a25',
    'benchmark-horizons.svg', 'site.webmanifest']) {
    const response = await fetch(new URL(asset, base));
    assert.equal(response.status, 200, asset);
    await response.arrayBuffer();
  }
  for (const version of ['v1.0', 'v1.1']) {
    for (const file of ['metadata', 'leaderboard', 'tasks', 'taskDetails', 'trialById']) {
      const response = await fetch(new URL(`data/${version}/${file}.json`, base));
      assert.equal(response.status, 200);
      assert.ok(response.headers.get('content-type').startsWith('application/json'));
      const data = await response.json();
      assert.ok(Object.keys(data).length > 0);
    }
  }
  assert.equal((await fetch(new URL('/assets/index-BMEz9I0h.js', base))).status, 404);
  assert.equal((await fetch(new URL('missing.json', base))).status, 404);
});
