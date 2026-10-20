const PREFIX = 'sre-marathon.analytics.';
const INACTIVE_MS = 30 * 60 * 1000;
const noop = { page() {}, action() {} };
const PAGES = new Set(['home','application/astronomy-shop','application/online-boutique','application/train-ticket']);
const SECTIONS = new Set(['home','main','leaderboard','applications','protocol','analysis','paper','metrics']);
function storage(store, method, key, value) {
  try { return store[method](PREFIX + key, value); } catch { return null; }
}

export function createAnalytics(options = {}, win = window) {
  const doc = win.document;
  let endpoint, site;
  try {
    endpoint = new URL(options.endpoint);
    site = new URL(options.siteUrl);
    if (endpoint.protocol !== 'https:' || endpoint.pathname !== '/collect' || endpoint.search || endpoint.hash || endpoint.username || endpoint.password) return noop;
    if (win.location.origin !== site.origin || !win.location.pathname.startsWith(site.pathname)) return noop;
  } catch { return noop; }
  let local, tab;
  try { local = win.localStorage; } catch { /* Storage can be blocked. */ }
  try { tab = win.sessionStorage; } catch { /* Continue without session persistence. */ }
  if (win.navigator.doNotTrack === '1' || win.navigator.globalPrivacyControl || storage(local,'getItem','disabled') === '1') return noop;
  const uuid = () => win.crypto.randomUUID();
  let visitorId = storage(local,'getItem','visitor');
  if (!/^[a-zA-Z0-9_-]{16,64}$/.test(visitorId || '')) {
    visitorId = uuid();
    storage(local,'setItem','visitor',visitorId);
    if (storage(local,'getItem','visitor') !== visitorId) visitorId = null;
  }
  const owner = storage(local,'getItem','owner') === '1' ? 1 : 0;
  const attribution = {};
  const params = new URLSearchParams(win.location.search);
  for (const k of ['source','medium','campaign','term','content']) attribution[`utm_${k}`] = (params.get(`utm_${k}`) || '').slice(0,128);
  try {
    const u = new URL(doc.referrer);
    attribution.referrer = u.origin === site.origin ? '' : u.origin;
  } catch { attribution.referrer = ''; }
  let session;
  try { session = JSON.parse(storage(tab,'getItem','session')); } catch { /* Missing session. */ }
  let stopped = false, awaitingRestore = false;
  let view = null, visible = doc.visibilityState !== 'hidden', lastTick = win.Date.now(), inFlight = false;
  const queue = new Map();
  function preferencesChanged() {
    if (stopped) return true;
    if (storage(local,'getItem','disabled') === '1' || (storage(local,'getItem','owner') === '1' ? 1 : 0) !== owner) {
      stopped = true; queue.clear(); return true;
    }
    return false;
  }
  const knownPage = value => PAGES.has(value) || value === 'application/not-found';
  function saveSession() { storage(tab,'setItem','session',JSON.stringify(session)); }
  function ensureSession() {
    const now = win.Date.now();
    if (!session || !/^[a-zA-Z0-9_-]{16,64}$/.test(session.id || '') || !Number.isFinite(session.last) || now - session.last >= INACTIVE_MS || now < session.last || session.sequence >= 1000000) {
      session = { id:uuid(), last:now, sequence:0, lastPage:null, returning: visitorId ? (storage(local,'getItem','seen') === '1' ? 1 : 0) : null };
      if (visitorId) storage(local,'setItem','seen','1');
    }
    // Older cached scripts have no sequence metadata; begin recording from here.
    if (!Number.isSafeInteger(session.sequence) || session.sequence < 0) session.sequence = 0;
    if (!knownPage(session.lastPage)) session.lastPage = null;
    if (!visitorId || ![0,1].includes(session.returning)) session.returning = null;
    session.last = now;
    saveSession();
  }
  function enqueue(event) {
    if (stopped) return;
    queue.set(event.event_id,event);
    if (queue.size > 200) queue.delete(queue.keys().next().value);
  }
  function account() {
    const now = win.Date.now();
    if (view && visible) view.active_ms += Math.max(0,Math.min(60000,now-lastTick));
    lastTick = now;
  }
  function scroll() {
    if (!view || !visible) return;
    const max = Math.max(0,doc.documentElement.scrollHeight - win.innerHeight);
    view.scroll_pct = Math.max(view.scroll_pct,max === 0 ? 100 : Math.min(100,Math.round(Math.max(0,win.scrollY) / max * 100)));
  }
  function snapshot() { if (view) enqueue({...view}); }
  function context(type) {
    return { type, page:view.page, page_id:view.page_id, page_sequence:view.page_sequence, previous_page:view.previous_page, session_id:session.id, visitor_id:visitorId, is_returning:session.returning, is_owner:owner, ...attribution };
  }
  function openView(page) {
    const id = uuid();
    const previous = session.lastPage;
    session.sequence += 1;
    session.lastPage = page;
    saveSession();
    view = { page, page_id:id, page_sequence:session.sequence, previous_page:previous };
    view = {...context('page'),event_id:id,occurred_at:win.Date.now(),active_ms:0,scroll_pct:0};
    lastTick = win.Date.now(); scroll(); snapshot();
  }
  function refreshSession() {
    const previous = session?.id;
    ensureSession();
    if (view && (previous !== session.id || win.Date.now() - view.occurred_at > 23 * 60 * 60 * 1000)) { snapshot(); openView(view.page); }
  }
  async function flush(beacon = false) {
    if (preferencesChanged() || (inFlight && !beacon)) return;
    const batch = [...queue.values()].slice(0,20);
    if (!batch.length) return;
    const body = JSON.stringify({events:batch});
    const clear = () => batch.forEach(e => { if (queue.get(e.event_id) === e) queue.delete(e.event_id); });
    if (beacon) {
      try { if (win.navigator.sendBeacon(endpoint.href,new win.Blob([body],{type:'text/plain;charset=UTF-8'}))) { clear(); return; } } catch { /* Try keepalive fetch. */ }
    }
    inFlight = true;
    try {
      const result = await win.fetch(endpoint.href,{method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8'},body,credentials:'omit',keepalive:true});
      if (result.ok || result.status === 400 || result.status === 413 || result.status === 415) clear();
    } catch { /* Retry in memory at the next heartbeat. */ }
    finally { inFlight = false; }
  }
  const api = {
    page(page) {
      if (preferencesChanged()) return;
      const next = PAGES.has(page) ? page : 'application/not-found';
      account();
      if (view?.page === next) { refreshSession(); return; }
      snapshot(); ensureSession(); openView(next); void flush();
    },
    action(action,value) {
      if (preferencesChanged() || !view) return;
      account(); refreshSession();
      enqueue({...context('action'),event_id:uuid(),occurred_at:win.Date.now(),action,value});
    },
  };
  doc.addEventListener('click', event => {
    const anchor = event.target.closest?.('a[href]');
    if (!anchor) return;
    let u;
    try { u = new URL(anchor.href,win.location.href); } catch { return; }
    if (u.origin === site.origin && u.pathname === win.location.pathname && SECTIONS.has(u.hash.slice(1))) {
      api.action('section',u.hash.slice(1)); return;
    }
    const targets = options.links || {};
    for (const [kind,target] of Object.entries(targets)) {
      if (u.href === new URL(target,site).href) { api.action('link',kind); void flush(true); break; }
    }
  });
  win.addEventListener('storage',event => {
    if (event.key === null || event.key === PREFIX + 'owner' || event.key === PREFIX + 'disabled') { stopped = true; queue.clear(); }
  });
  win.addEventListener('scroll',scroll,{passive:true});
  doc.addEventListener('visibilitychange',() => {
    if (preferencesChanged()) return;
    account(); visible = doc.visibilityState !== 'hidden'; lastTick = win.Date.now();
    if (visible) { if (!awaitingRestore) refreshSession(); }
    else { snapshot(); void flush(true); }
  });
  win.addEventListener('pagehide',event => {
    if (preferencesChanged()) return;
    account(); snapshot(); visible = false; awaitingRestore = event?.persisted === true; void flush(true);
  });
  win.addEventListener('pageshow',event => {
    if (preferencesChanged()) return;
    awaitingRestore = false;
    visible = doc.visibilityState !== 'hidden'; lastTick = win.Date.now();
    if (event.persisted && view) {
      // Another document in this tab may have advanced the session while frozen.
      try { const saved = JSON.parse(storage(tab,'getItem','session')); if (saved) session = saved; } catch { /* Use in-memory session. */ }
      ensureSession(); openView(view.page); void flush();
    } else if (visible) refreshSession();
  });
  win.setInterval(() => {
    if (preferencesChanged() || awaitingRestore) return;
    account();
    if (visible) { refreshSession(); scroll(); snapshot(); }
    void flush();
  },30000);
  return api;
}
