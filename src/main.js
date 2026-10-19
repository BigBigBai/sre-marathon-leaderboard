import { selectRows, validateData } from './model.js';
import { homeView, leaderboardView, stagesView, costView, supplementaryView, applicationView } from './views.js';

const main = document.getElementById('main');
const state = { backbone: 'all', query: '', sort: 'marathonScore', direction: 'desc', fullMetrics: false, analysis: 'stages', analysisBackbone: 'kimi-k2.5' };
let dataset, config;
let currentPage = '';

async function readJSON(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Unable to load ${url} (HTTP ${response.status}).`);
  return response.json();
}
function renderLeaderboard() {
  const rows = selectRows(dataset.leaderboard, state);
  document.getElementById('leaderboard-table').innerHTML = leaderboardView(rows, state);
  document.getElementById('result-count').textContent = `${rows.length} of ${dataset.leaderboard.length} configurations`;
  document.getElementById('metrics-toggle').setAttribute('aria-pressed', String(state.fullMetrics));
}
function renderAnalysis() {
  document.getElementById('analysis-panel').innerHTML = state.analysis === 'stages' ? stagesView(dataset.leaderboard, state.analysisBackbone) : costView(dataset.leaderboard);
  document.getElementById('analysis-filter-label').hidden = state.analysis !== 'stages';
  document.querySelectorAll('[data-analysis]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.analysis === state.analysis)));
}
function bindHome() {
  document.getElementById('backbone-filter').value = state.backbone;
  document.getElementById('method-search').value = state.query;
  document.getElementById('analysis-backbone').value = state.analysisBackbone;
  document.getElementById('backbone-filter').addEventListener('change', event => { state.backbone = event.target.value; renderLeaderboard(); });
  document.getElementById('method-search').addEventListener('input', event => { state.query = event.target.value; renderLeaderboard(); });
  document.getElementById('metrics-toggle').addEventListener('click', () => { state.fullMetrics = !state.fullMetrics; renderLeaderboard(); });
  document.getElementById('leaderboard-table').addEventListener('click', event => {
    const button = event.target.closest('[data-sort]');
    if (!button) return;
    state.direction = state.sort === button.dataset.sort ? (state.direction === 'asc' ? 'desc' : 'asc') : button.dataset.preferred;
    state.sort = button.dataset.sort;
    renderLeaderboard();
    document.querySelector(`[data-sort="${state.sort}"]`)?.focus({ preventScroll: true });
  });
  document.getElementById('analysis-backbone').addEventListener('change', event => { state.analysisBackbone = event.target.value; renderAnalysis(); });
  document.querySelectorAll('[data-analysis]').forEach(button => button.addEventListener('click', () => { state.analysis = button.dataset.analysis; renderAnalysis(); }));
  renderLeaderboard();
  renderAnalysis();
  document.getElementById('supplementary-results').innerHTML = supplementaryView(dataset.supplementary);
}
function route() {
  const hash = location.hash.slice(1);
  const application = hash.startsWith('application/') ? hash.slice('application/'.length) : null;
  const page = application == null ? 'home' : `application/${application}`;
  if (page !== currentPage) {
    if (application != null) {
      const app = dataset.applications.find(item => item.id === application);
      main.innerHTML = applicationView(app);
      document.title = `${app?.name || 'Application not found'} · SRE-Marathon`;
    } else {
      main.innerHTML = homeView(dataset, config);
      document.title = config.title;
      bindHome();
    }
    currentPage = page;
  }
  if (application != null) window.scrollTo({ top: 0, behavior: 'instant' });
  else if (hash) document.getElementById(hash)?.scrollIntoView({ behavior: 'instant', block: 'start' });
}
const themeButton = document.getElementById('theme-toggle');
function syncTheme() {
  const dark = document.documentElement.dataset.theme === 'dark';
  themeButton.textContent = dark ? '☼' : '◐';
  themeButton.setAttribute('aria-label', `Switch to ${dark ? 'light' : 'dark'} mode`);
  document.querySelector('meta[name="theme-color"]').content = dark ? '#121612' : '#ffffff';
}
themeButton.addEventListener('click', () => {
  const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem('sre-marathon-theme', theme); } catch { /* Theme still works without persistence. */ }
  syncTheme();
});
syncTheme();
try {
  const names = ['benchmark', 'leaderboard', 'applications', 'supplementary'];
  const [settings, ...values] = await Promise.all([readJSON('./src/site.config.json'), ...names.map(name => readJSON(`./data/${name}.json`))]);
  config = settings;
  dataset = Object.fromEntries(names.map((name, index) => [name, values[index]]));
  validateData(dataset);
  route();
  window.addEventListener('hashchange', route);
  window.addEventListener('popstate', route);
  // Own internal navigation so native anchor scrolling does not race the route render.
  document.addEventListener('click', event => {
    const anchor = event.target.closest('a[href^="#"]');
    if (!anchor || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const href = anchor.getAttribute('href');
    if (location.hash !== href) history.pushState(null, '', href);
    route();
  });
} catch (error) {
  main.innerHTML = '<div class="error-box"><h1>Results could not be loaded.</h1><p id="load-error"></p><a class="btn" href="./data/leaderboard.json">Download results JSON ↓</a></div>';
  document.getElementById('load-error').textContent = error.message;
  console.error(error);
}
