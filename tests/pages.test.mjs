import test from 'node:test';
import assert from 'node:assert/strict';
import { createStaticServer } from '../scripts/server.mjs';
test('Pages project path serves the new site, paper, charts and data without legacy artifacts', async t => {
  const server = createStaticServer(new URL('../dist/', import.meta.url).pathname, '/sre-marathon-leaderboard/');
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/sre-marathon-leaderboard/`;
  const html = await (await fetch(base)).text();
  assert.ok(html.includes('./src/main.js'));
  assert.ok(html.includes('<title>SRE-Marathon</title>'));
  for (const name of ['main.js', 'views.js', 'model.js', 'theme-init.js', 'styles.css', 'site.config.json']) {
    const response = await fetch(new URL(`src/${name}`, base));
    assert.equal(response.status, 200, name); await response.arrayBuffer();
  }
  for (const name of ['benchmark', 'leaderboard', 'applications', 'supplementary']) {
    const response = await fetch(new URL(`data/${name}.json`, base));
    assert.equal(response.status, 200);
    assert.ok(Object.keys(await response.json()).length > 0);
  }
  for (const name of ['assets/system-overview.png', 'assets/case-comparison.png', 'sre-marathon-paper.pdf']) {
    const response = await fetch(new URL(name, base));
    assert.equal(response.status, 200); await response.arrayBuffer();
  }
  assert.equal((await fetch(new URL('data/v1.1/leaderboard.json', base))).status, 404);
  assert.equal((await fetch(new URL('assets/index-BMEz9I0h.js', base))).status, 404);
  assert.equal((await fetch(new URL('/src/main.js', base))).status, 404);
});
