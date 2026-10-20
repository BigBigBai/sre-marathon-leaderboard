const prefix = 'sre-marathon.analytics.';
let endpoint = '';
try { endpoint = (await (await fetch('./src/site.config.json')).json()).analytics?.endpoint || ''; } catch { /* Display unavailable status. */ }
function render() {
  try {
    const browserSignal = navigator.doNotTrack === '1' || navigator.globalPrivacyControl;
    document.getElementById('analytics-status').textContent = !endpoint ? 'Collection is not currently configured for this site.' : browserSignal ? 'Collection is disabled by your browser privacy signal.' : localStorage.getItem(prefix + 'disabled') === '1' ? 'Analytics is disabled in this browser.' : 'Analytics is allowed in this browser.';
    document.getElementById('owner-status').textContent = localStorage.getItem(prefix + 'owner') === '1' ? 'This browser is marked as the owner.' : 'This browser is not marked as the owner.';
  } catch { document.getElementById('analytics-status').textContent = 'Browser storage is unavailable. Preferences cannot be saved.'; }
}
for (const [id,key,value] of [['disable-analytics','disabled','1'],['enable-analytics','disabled','0'],['mark-owner','owner','1'],['clear-owner','owner','0']]) {
  document.getElementById(id).addEventListener('click',() => {
    try {
      localStorage.setItem(prefix + key,value);
      if (key === 'disabled' && value === '1') {
        localStorage.removeItem(prefix + 'visitor'); localStorage.removeItem(prefix + 'seen');
      }
      sessionStorage.removeItem(prefix + 'session');
      render();
    } catch { document.getElementById('analytics-status').textContent = 'This browser could not save your preference.'; }
  });
}
render();
