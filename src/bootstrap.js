// This is the editable integration layer around the preserved upstream frontend.
const root = new URL('../', import.meta.url);
const config = await fetchJSON(new URL('site.config.json', import.meta.url));
const versions = ['v1.0', 'v1.1'];

async function fetchJSON(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${url}: HTTP ${response.status}`);
  return response.json();
}

function resolveAssets(value) {
  if (typeof value === 'string') {
    if (value.startsWith('/assets/') || value === '/benchmark-horizons.svg') {
      return new URL(value.slice(1), root).href;
    }
    if (value.startsWith('/trajectories/')) {
      return config.trajectoryOrigin
        ? new URL(value, config.trajectoryOrigin).href
        : new URL(value.slice(1), root).href;
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(resolveAssets);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, resolveAssets(entry)]));
  }
  return value;
}

try {
  const benchmarks = await Promise.all(versions.map(async version => {
    const names = ['metadata', 'leaderboard', 'tasks', 'taskDetails', 'trialById'];
    const values = await Promise.all(names.map(name => fetchJSON(new URL(`data/${version}/${name}.json`, root))));
    const [metadata, leaderboard, tasks, taskDetails, trialById] = values;
    return [version, resolveAssets({ ...metadata, leaderboard, tasks, taskDetails, trialById })];
  }));
  window.SWEMarathonReplica = { config, benchmarks: Object.fromEntries(benchmarks) };
  await import('../assets/index-BMEz9I0h.js');
  if (config.showMirrorCredit) {
    const credit = document.createElement('div');
    credit.className = 'mirror-credit';
    credit.append('Independent replica · ');
    const link = document.createElement('a');
    link.href = 'https://www.swe-marathon.org/';
    link.textContent = 'Original SWE-Marathon ↗';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    credit.append(link);
    document.body.append(credit);
  }
} catch (error) {
  const container = document.getElementById('root');
  container.replaceChildren();
  const heading = document.createElement('h1');
  heading.textContent = 'The leaderboard could not be loaded.';
  const detail = document.createElement('p');
  detail.textContent = `${error.message}. Please reload the page.`;
  container.append(heading, detail);
  console.error(error);
}
