export const backboneName = value => ({ 'kimi-k2.5': 'Kimi K2.5', 'gpt-5.6-luna': 'GPT-5.6 Luna' }[value] || 'Rule-based');
export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
export const percent = value => value == null ? '—' : `${(value * 100).toFixed(1)}%`;
export const decimal = value => value == null ? '—' : value.toFixed(1);
export const money = value => value == null ? '—' : `$${value.toFixed(2)}`;
export const tokens = value => value == null ? '—' : value >= 1e6 ? `${(value / 1e6).toFixed(1)}M` : `${Math.round(value / 1000)}k`;

export function selectRows(rows, { backbone = 'all', query = '', sort = 'marathonScore', direction = 'desc' } = {}) {
  const needle = query.trim().toLowerCase();
  return rows.filter(row => (backbone === 'all' || (backbone === 'rule-based' ? row.backbone == null : row.backbone === backbone))
    && `${row.method} ${backboneName(row.backbone)}`.toLowerCase().includes(needle))
    .sort((a, b) => {
      const left = a[sort], right = b[sort];
      if (left == null && right == null) return a.rank - b.rank;
      if (left == null) return 1;
      if (right == null) return -1;
      const result = typeof left === 'string' ? left.localeCompare(right) : left - right;
      return result === 0 ? a.rank - b.rank : result * (direction === 'asc' ? 1 : -1);
    });
}

export function validateData({ benchmark, leaderboard, applications, supplementary }) {
  if (leaderboard.length !== 19) throw new Error('Expected 19 paper result configurations.');
  if (new Set(leaderboard.map(row => row.id)).size !== leaderboard.length) throw new Error('Duplicate result ID.');
  const ratios = ['correlation', 'localization', 'repair', 'risk'];
  const positive = ['mttdSeconds', 'mttlSeconds', 'mttrSeconds', 'degradationLevelPct', 'tokensPerRun', 'costUsdPerRun'];
  for (const row of leaderboard) {
    if (!row.method || ![null, 'kimi-k2.5', 'gpt-5.6-luna'].includes(row.backbone)) throw new Error('Invalid method or backbone.');
    if (!Number.isFinite(row.marathonScore) || row.marathonScore < 0 || row.marathonScore > 100) throw new Error('Invalid Marathon-Score.');
    for (const key of ratios) if (row[key] !== null && (!Number.isFinite(row[key]) || row[key] < 0 || row[key] > 1)) throw new Error(`Invalid ${key}.`);
    for (const key of positive) if (row[key] !== null && (!Number.isFinite(row[key]) || row[key] < 0)) throw new Error(`Invalid ${key}.`);
  }
  if (applications.length !== 3 || applications.reduce((sum, app) => sum + app.total, 0) !== 700) throw new Error('Invalid fault catalog.');
  for (const app of applications) if (app.codeBug + app.configBug + app.chaosTest !== app.total) throw new Error('Fault catalog totals do not agree.');
  if (!benchmark.source || supplementary.table7.length !== 3 || supplementary.table8.length !== 3) throw new Error('Missing paper sources or supplementary results.');
  return true;
}
