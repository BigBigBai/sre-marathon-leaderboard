import { backboneName, escapeHTML as h, percent, decimal, money, tokens } from './model.js';

export const sectionHeading = (number, label, title, intro = '', badge = '') => `<div class="section-head"><div><div class="eyebrow">${number} / ${label}</div><h2>${title}</h2>${intro ? `<p class="section-intro">${intro}</p>` : ''}</div>${badge ? `<span class="badge">${badge}</span>` : ''}</div>`;
const categories = [{ key: 'codeBug', label: 'Code bugs', color: 'var(--code)' }, { key: 'configBug', label: 'Config bugs', color: 'var(--config)' }, { key: 'chaosTest', label: 'Chaos tests', color: 'var(--chaos)' }];
export function catalogBar(app) {
  return `<div class="catalog-bar" role="img" aria-label="${app.codeBug} code bugs, ${app.configBug} config bugs, ${app.chaosTest} chaos tests">${categories.map(cat => `<span style="width:${app[cat.key] / app.total * 100}%;background:${cat.color}"></span>`).join('')}</div>`;
}
export function homeView(data, config) {
  const { applications, leaderboard } = data;
  const bestScore = Math.max(...leaderboard.map(row => row.marathonScore));
  return `<section class="hero" id="home"><div class="container">
    <div class="eyebrow"><span class="status-dot"></span>Continuous operations. Compounding challenges.</div>
    <h1>SRE-Marathon</h1>
    <p class="hero-subtitle">A Continuous, Change-Driven Benchmark<br>for Autonomous Site Reliability Agents</p>
    <p class="hero-lede">Can agents keep a live system reliable as faults overlap, alerts accumulate, and operational pressure grows?</p>
    <div class="actions"><a class="btn primary" href="#leaderboard">Explore results <span>↓</span></a><a class="btn" href="${h(config.sourceRepository)}" target="_blank" rel="noopener">Website source <span>↗</span></a></div>
    <div class="stats-strip"><div class="stat"><strong>${applications.length}</strong><span>live applications</span></div><div class="stat"><strong>700</strong><span>catalogued faults</span></div><div class="stat"><strong>10</strong><span>evaluated methods</span></div><div class="stat"><strong>${bestScore.toFixed(1)} <small>/ 100</small></strong><span>best Marathon-Score</span></div></div>
  </div></section>
  <section class="section" id="leaderboard"><div class="container">
    ${sectionHeading('01', 'preliminary results', 'Leaderboard', 'From alert correlation to verified repair. Each row reports the reported average over three microservice applications.', '19 CONFIGURATIONS')}
    <div class="toolbar"><label class="filter-field">Backbone <select id="backbone-filter"><option value="all">All backbones</option><option value="kimi-k2.5">Kimi K2.5</option><option value="gpt-5.6-luna">GPT-5.6 Luna</option><option value="rule-based">Rule-based</option></select></label><label class="filter-field search">Search <input id="method-search" type="search" placeholder="Find a method…" autocomplete="off"></label><span class="result-count" id="result-count" role="status" aria-live="polite"></span><button id="metrics-toggle" class="metric-toggle" type="button" aria-pressed="false">All metrics</button><a class="btn small" href="./data/leaderboard.json" download="sre-marathon-leaderboard.json">JSON ↓</a></div>
    <p class="table-mobile-hint">Swipe the table to explore all metrics →</p><div class="table-wrap" role="region" aria-label="SRE-Marathon leaderboard; scroll horizontally for more metrics" tabindex="0" id="leaderboard-table"></div>
    <p class="section-foot"><strong>Marathon-Score is a score out of 100, not a repair percentage.</strong> Corr, Loc and Rep are stage success rates. “—” preserves an unavailable or inapplicable value in the reported results. <a href="#metrics">How scoring works →</a></p>
    <p class="source-note">Preliminary evaluation results, averaged across three applications. No per-application breakdown is inferred.</p>
  </div></section>
  <section class="section" id="applications"><div class="container">
    ${sectionHeading('02', 'benchmark environments', 'Three applications. 700 faults.', 'Different service topologies, the same continuous operating challenge. About 60 faults are injected in a main marathon run.')}
    <div class="apps-grid">${applications.map((app, index) => `<a class="app-card" href="#application/${app.id}"><div class="eyebrow">0${index + 1} / ${app.services} services</div><h3>${h(app.name)}</h3><p>${h(app.description)}</p>${catalogBar(app)}<div class="app-meta"><span>${app.total} catalogued faults</span><span>3 fault families</span></div><span class="app-link">Explore environment <span>↗</span></span></a>`).join('')}</div>
    <div class="table-legend">${categories.map(cat => `<span><i class="legend-dot" style="background:${cat.color}"></i>${cat.label}</span>`).join('')}</div>
    <p class="source-note">Catalog size is distinct from faults injected per run.</p>
  </div></section>
  <section class="section" id="protocol"><div class="container">
    ${sectionHeading('03', 'continuous evaluation', 'Operate the system. Not just the incident.', 'An agent observes a live deployment through noisy operational signals while a seeded orchestrator continuously introduces overlapping faults.')}
    <div class="schedule" aria-label="Nominal schedule: 60 minutes of injections followed by 30 minutes of observation"><div>00–60 MIN <small>Increasing fault injection intensity</small></div><div>60–90 MIN <small>Observation, no new faults</small></div></div>
    <p class="section-foot">90 minutes is the nominal schedule. Actual wall-clock duration can drift; individual main-schedule faults remain active for 4–12 minutes before reversion.</p>
    <div class="protocol-grid"><article class="protocol-item"><h3>Changes that escape validation</h3><p>Curated code and configuration defects enter through realistic deployment paths. Direct interventions introduce resource, network and other operational faults.</p></article><article class="protocol-item"><h3>A persistent operating context</h3><p>Invocations every 120 seconds receive cumulative alert history and a persistent workspace. Each invocation has a 110-second wall-clock budget.</p></article><article class="protocol-item"><h3>19 tools, 44 alerting rules</h3><p>Instrumented tools expose telemetry, Kubernetes state and controlled interventions. Alerts remain ungrouped: deciding which symptoms belong together is the agent’s job.</p></article><article class="protocol-item"><h3>Evidence, sealed and scored offline</h3><p>Faults, alerts, tool calls, interventions and service measurements are recorded. Metrics are computed deterministically from system evidence, without an LLM judge.</p></article></div>
  </div></section>
  <section class="section" id="metrics"><div class="container">
    ${sectionHeading('04', 'evaluation', 'Progress through the full lifecycle.', 'The main score credits ordered progress through correlation, localization and repair, with a penalty for attempted forbidden operations.')}
    <div class="formula"><code>Score = 100 × (1 − d/2) × mean<sub>faults</sub>[(a + ab + abc) / 3]</code><p>a = correlated; b = localized; c = repaired. d = 1 if a forbidden operation is attempted, otherwise 0. Localization earns score only after correlation; repair only after both. Aggregate Corr, Loc and Rep cannot be averaged to reconstruct this score.</p></div>
    <div class="metrics-grid"><div class="metric-definition"><strong>Corr / Loc / Rep ↑</strong><p>Fraction of injected faults correlated, correctly localized, or repaired while still active. A repair does not necessarily imply all lifecycle stages passed.</p></div><div class="metric-definition"><strong>MTTD / MTTL / MTTR ↓</strong><p>Median seconds to each successful stage, over the faults reaching it. Different subsets mean these times need not be ordered.</p></div><div class="metric-definition"><strong>Degradation Level ↓</strong><p>Traffic-weighted degradation relative to a paired no-action run. 100% is the reference; a value above 100% is worse than no action.</p></div><div class="metric-definition"><strong>Intervention Risk ↓</strong><p>Fraction of interventions that target outside the incident’s affected scope or attempt a forbidden operation. Not a success metric.</p></div><div class="metric-definition"><strong>Tokens / Cost ↓</strong><p>Reported model usage and estimated USD per run. Token totals are rounded in the reported results; costs reflect the experimental pricing.</p></div><div class="metric-definition"><strong>Verified, timely recovery</strong><p>Only eligible agent interventions before orchestrator reversion can earn repair credit. Benchmark cleanup is never an agent repair.</p></div></div>
  </div></section>
  <section class="section" id="analysis"><div class="container">
    ${sectionHeading('05', 'results in context', 'Diagnosis is not yet reliable repair.', 'Explore the reported results. These charts use reported aggregates, not reconstructed run traces.')}
    <div class="analysis-controls"><div class="tab-group" role="group" aria-label="Analysis view"><button type="button" data-analysis="stages" aria-pressed="true">Lifecycle stages</button><button type="button" data-analysis="cost" aria-pressed="false">Cost vs. score</button></div><label class="filter-field" id="analysis-filter-label">Backbone <select id="analysis-backbone"><option value="kimi-k2.5">Kimi K2.5</option><option value="gpt-5.6-luna">GPT-5.6 Luna</option></select></label></div>
    <div id="analysis-panel" class="analysis-panel"></div>
    <details><summary>How results vary with seed and operating pressure</summary><div id="supplementary-results"></div></details>
    <details><summary>How to interpret this evaluation</summary><p class="section-foot">Main results use one shared schedule per application on a single-host Kind cluster. The two model backbones and three public applications do not cover the full field. Additional-seed runs also differ in deployment venue; short runs differ in venue, release, seed, invocation interval and fault lifetime. These comparisons do not isolate concurrency experimentally. These results should be interpreted within those evaluation conditions.</p></details>
  </div></section>
  <section class="section" id="cases"><div class="container">
    ${sectionHeading('06', 'case studies', 'The same remedy. Different outcomes.', 'A bad image tag requires rollback. Timing and action selection determine whether diagnosis becomes a verified repair.')}
    <div class="study-grid"><article class="study"><div class="eyebrow">Keep-agent / Online Boutique</div><h3>A rollback that arrives in time.</h3><p>With four other faults active, Keep-agent groups the alerts, identifies the service and artifact, and rolls back checkoutservice. The symptom probe recovers before the fault is reverted.</p><ol class="event-sequence"><li><b>62 min</b>Fault injected</li><li><b>65 min</b>Rollback</li><li><b>70 min</b>Probe healthy</li><li><b>72 min</b>Fault reverted</li></ol></article><article class="study outcome"><div class="eyebrow">Claude Code / Astronomy Shop</div><h3>The right action, too late.</h3><p>After ineffective configuration changes and a rejected manifest patch, Claude Code reaches the correct rollback at minute 52. The fault reverts at minute 54, before the repair can take effect.</p><ol class="event-sequence"><li><b>First</b>Ineffective changes</li><li><b>52 min</b>Rollback</li><li><b>54 min</b>Fault reverted</li></ol></article></div>
  </div></section>
  <section class="section" id="resources"><div class="container">
    ${sectionHeading('07', 'project resources', 'Explore the project.')}
    <p class="section-intro">Explore the evaluation results and the website implementation. Additional project materials will be added when available.</p>
    <div class="actions" style="justify-content:flex-start;margin-top:24px"><a class="btn primary" href="./data/leaderboard.json" download>Results JSON ↓</a><a class="btn" href="${h(config.sourceRepository)}" target="_blank" rel="noopener">Website source ↗</a></div>
  </div></section>`;
}

const coreColumns = [
  ['method', 'Method', 'asc'], ['backbone', 'Backbone', 'asc'], ['marathonScore', 'Score ↑', 'desc'],
  ['correlation', 'Corr ↑', 'desc'], ['localization', 'Loc ↑', 'desc'], ['repair', 'Rep ↑', 'desc'],
  ['costUsdPerRun', '$ / run ↓', 'asc'], ['risk', 'Risk ↓', 'asc'],
];
const extraColumns = [['mttdSeconds', 'MTTD (s) ↓', 'asc'], ['mttlSeconds', 'MTTL (s) ↓', 'asc'], ['mttrSeconds', 'MTTR (s) ↓', 'asc'], ['degradationLevelPct', 'Degrad. % ↓', 'asc'], ['tokensPerRun', 'Tokens / run ↓', 'asc']];
export function leaderboardView(rows, state) {
  const columns = state.fullMetrics ? [...coreColumns, ...extraColumns] : coreColumns;
  const field = (row, key) => {
    const value = row[key];
    if (key === 'method') return h(value);
    if (key === 'backbone') return h(backboneName(value));
    if (key === 'marathonScore') return `<span class="score-value">${value.toFixed(1)}</span><div class="score-track" aria-hidden="true"><span style="width:${value}%"></span></div>`;
    if (['correlation', 'localization', 'repair', 'risk'].includes(key)) return percent(value);
    if (key === 'costUsdPerRun') return money(value);
    if (key === 'degradationLevelPct') return value == null ? '—' : `${decimal(value)}%`;
    if (key === 'tokensPerRun') return tokens(value);
    return value ?? '—';
  };
  return `<table class="results-table"><caption class="sr-only">Evaluation results, average across three applications. Stage rates are percentages; Marathon-Score is out of 100.</caption><thead><tr><th scope="col">#</th>${columns.map(([key, label, preferred]) => `<th scope="col" ${state.sort === key ? `aria-sort="${state.direction === 'asc' ? 'ascending' : 'descending'}"` : ''}><button type="button" data-sort="${key}" data-preferred="${preferred}" aria-label="Sort by ${label.replace(/[↑↓]/g, '').trim()}">${label}${state.sort === key ? (state.direction === 'asc' ? ' ▴' : ' ▾') : ''}</button></th>`).join('')}</tr></thead><tbody>${rows.length ? rows.map(row => `<tr class="${row.rank === 1 ? 'top-row' : ''}"><td>${row.rank}</td>${columns.map(([key]) => `<td class="${key === 'marathonScore' ? 'score-cell' : ''}">${field(row, key)}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${columns.length + 1}" class="empty-state">No methods match these filters. Try another name or select all backbones.</td></tr>`}</tbody></table>`;
}

export function stagesView(rows, backbone) {
  const selected = rows.filter(row => row.backbone === backbone || row.backbone == null).sort((a, b) => b.marathonScore - a.marathonScore);
  return `<div class="stage-head"><span>${backboneName(backbone)}</span><span>Correlated</span><span>Located</span><span>Repaired</span></div>${selected.map(row => `<div class="stage-row"><span>${h(row.method)}${row.backbone == null ? ' *' : ''}</span>${['correlation', 'localization', 'repair'].map((key, index) => `<div class="stage-column ${['corr', 'loc', 'rep'][index]}"><span class="track" aria-hidden="true"><i style="width:${row[key] * 100}%"></i></span><b>${percent(row[key])}</b></div>`).join('')}</div>`).join('')}<p class="chart-caption">Independent stage rates; all bars use a 0–100% scale. These are not additive score contributions. * Runbook is a non-LLM reference.</p>`;
}

export function costView(rows) {
  const values = rows.filter(row => row.costUsdPerRun != null);
  const x = value => 60 + value / 5 * 720;
  const y = value => 300 - value / 50 * 260;
  return `<svg class="scatter" viewBox="0 0 840 350" role="img" aria-label="Cost per run versus Marathon-Score for all 18 LLM configurations. Keep-agent with Kimi K2.5 has the highest score, 41.3, at 72 cents per run.">
    ${[0, 10, 20, 30, 40, 50].map(value => `<line class="axis" x1="60" x2="780" y1="${y(value)}" y2="${y(value)}"/><text x="47" y="${y(value) + 4}" text-anchor="end">${value}</text>`).join('')}
    ${[0, 1, 2, 3, 4, 5].map(value => `<text x="${x(value)}" y="324" text-anchor="middle">$${value}</text>`).join('')}
    <text x="60" y="20">MARATHON-SCORE / 100 ↑</text><text x="780" y="346" text-anchor="end">COST PER RUN (USD)</text>
    ${values.map(row => `<circle tabindex="0" class="point ${row.backbone === 'gpt-5.6-luna' ? 'other' : ''}" cx="${x(row.costUsdPerRun)}" cy="${y(row.marathonScore)}" r="6" aria-label="${h(row.method)}, ${backboneName(row.backbone)}: score ${row.marathonScore}, ${money(row.costUsdPerRun)} per run"><title>${h(row.method)} · ${backboneName(row.backbone)} · ${row.marathonScore} / 100 · ${money(row.costUsdPerRun)}</title></circle>`).join('')}
  </svg><div class="table-legend"><span><i class="legend-dot" style="background:var(--green-bar)"></i>Kimi K2.5</span><span><i class="legend-dot" style="background:var(--blue)"></i>GPT-5.6 Luna</span></div><p class="chart-caption">Hover or focus a point for its result. Runbook is omitted because model cost is not reported. Experimental prices are reproduced from the evaluation; all values are also available in the sortable leaderboard.</p>`;
}

export function supplementaryView(supplementary) {
  return `<p class="source-note">Additional seeds · ReAct / Kimi K2.5 / Astronomy Shop · one run per seed</p><div class="table-wrap"><table class="compact-table"><thead><tr><th>Seed / venue</th><th>Corr</th><th>Loc</th><th>Rep</th><th>Risk</th><th>Score / 100</th></tr></thead><tbody>${supplementary.table7.map(row => `<tr><td>${h(row.seed)} / ${h(row.venue)}</td><td>${percent(row.correlation)}</td><td>${percent(row.localization)}</td><td>${percent(row.repair)}</td><td>${percent(row.risk)}</td><td>${decimal(row.marathonScore)}</td></tr>`).join('')}</tbody></table></div><p class="section-foot">Venue changes for seed 27. These are individual Astronomy Shop runs, not the three-application main leaderboard averages.</p><p class="source-note" style="margin-top:25px">Operating pressure · ReAct / Kimi K2.5 / operating pressure</p><div class="table-wrap"><table class="compact-table"><thead><tr><th>Regime</th><th>Runs</th><th>Corr</th><th>Loc</th><th>Rep</th><th>Score / 100</th></tr></thead><tbody>${supplementary.table8.map(row => `<tr><td>${h(row.regime)}</td><td>${row.runs}</td><td>${percent(row.correlation)}</td><td>${percent(row.localization)}</td><td>${percent(row.repair)}</td><td>${decimal(row.marathonScore)}</td></tr>`).join('')}</tbody></table></div><p class="section-foot">Short-run rows average six runs, two per application; the marathon row averages three runs. More than load differs between the regimes, so this is a qualitative comparison, not a controlled concurrency ablation. </p>`;
}

export function applicationView(app) {
  if (!app) return `<div class="container app-detail"><a class="back-link" href="#applications">← All applications</a><h1>Application not found</h1><p>Choose one of the three benchmark applications.</p></div>`;
  return `<article class="container app-detail"><a class="back-link" href="#applications">← All applications</a><div class="eyebrow">Benchmark environment / ${app.services} services</div><h1>${h(app.name)}</h1><p class="lead">${h(app.description)}</p><div class="app-detail-stats"><div><strong>${app.total}</strong><span>catalogued faults</span></div><div><strong>${app.meanConcurrentFaults}</strong><span>mean concurrent faults</span></div><div><strong>${app.peakConcurrentFaults}</strong><span>peak concurrent faults</span></div></div><h2>Fault catalog</h2>${catalogBar(app)}<div class="table-wrap" style="margin-top:20px"><table class="compact-table"><thead><tr><th>Fault family</th><th>Count</th><th>Share of catalog</th></tr></thead><tbody>${categories.map(cat => `<tr><td>${cat.label}</td><td>${app[cat.key]}</td><td>${percent(app[cat.key] / app.total)}</td></tr>`).join('')}<tr><td>Total</td><td>${app.total}</td><td>100.0%</td></tr></tbody></table></div><p class="source-note">Catalog counts and concurrency statistics from the benchmark evaluation.</p><h2>Live operating environment</h2><p>${h(app.environment)}</p><p>Each main run follows approximately 60 fault injections over 60 minutes, followed by a nominal 30-minute observation period. Faults overlap and alerts accumulate while the agent diagnoses and intervenes.</p><h2>Results and reproducibility</h2><p>The main leaderboard reports averages across all three applications. A full per-application result matrix and individual fault definitions are not available on this site. This page presents catalog statistics rather than inferred method scores.</p><div class="actions" style="justify-content:flex-start"><a class="btn" href="#leaderboard">Main leaderboard →</a></div></article>`;
}
