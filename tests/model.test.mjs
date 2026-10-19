import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { selectRows, percent, money, validateData } from '../src/model.js';
const read = async name => JSON.parse(await fs.readFile(new URL(`../data/${name}.json`, import.meta.url), 'utf8'));
const leaderboard = await read('leaderboard');
test('paper leaderboard has the reported winner and preserves the rule-based reference', () => {
  const sorted = selectRows(leaderboard);
  assert.equal(sorted[0].method, 'Keep-agent');
  assert.equal(sorted[0].backbone, 'kimi-k2.5');
  assert.equal(sorted[0].marathonScore, 41.3);
  assert.equal(sorted[1].method, 'Runbook');
  assert.equal(sorted.length, 19);
});
test('backbone and search filters compose without mixing in the reference', () => {
  assert.equal(selectRows(leaderboard, { backbone: 'kimi-k2.5' }).length, 9);
  assert.equal(selectRows(leaderboard, { backbone: 'gpt-5.6-luna', query: 'keep' }).length, 1);
  assert.equal(selectRows(leaderboard, { backbone: 'rule-based' })[0].method, 'Runbook');
  assert.equal(selectRows(leaderboard, { query: 'no-such-method' }).length, 0);
});
test('missing cost and timing sort last in both directions; zero remains zero', () => {
  for (const direction of ['asc', 'desc']) {
    assert.equal(selectRows(leaderboard, { sort: 'costUsdPerRun', direction }).at(-1).method, 'Runbook');
    assert.equal(selectRows(leaderboard, { sort: 'mttrSeconds', direction }).at(-1).mttrSeconds, null);
  }
  assert.equal(percent(0), '0.0%');
  assert.equal(percent(null), '—');
  assert.equal(money(null), '—');
  assert.equal(selectRows(leaderboard, { sort: 'costUsdPerRun', direction: 'asc' })[0].costUsdPerRun, .09);
});
test('stage averages are not substituted for the lifecycle score', () => {
  const row = leaderboard[0];
  assert.notEqual(Number(((row.correlation + row.localization + row.repair) / 3 * 100).toFixed(1)), row.marathonScore);
});
test('catalog and report dimensions are valid', async () => {
  assert.equal(validateData({ benchmark: await read('benchmark'), leaderboard, applications: await read('applications'), supplementary: await read('supplementary') }), true);
});
