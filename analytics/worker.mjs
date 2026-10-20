const MAX_BYTES = 32768;
const ID = /^[a-zA-Z0-9_-]{16,64}$/;
const PAGES = new Set(['home', 'application/astronomy-shop', 'application/online-boutique', 'application/train-ticket', 'application/not-found']);
const ACTIONS = {
  section: ['home','main','leaderboard','applications','protocol','analysis','paper','metrics'],
  link: ['paper_pdf','paper_abstract','benchmark_code','website_source','results_json'],
  backbone: ['all','kimi-k2.5','gpt-5.6-luna','rule-based'],
  analysis_backbone: ['kimi-k2.5','gpt-5.6-luna'],
  sort: ['marathonScore','method','backbone','correlation','localization','repair','risk','mttdSeconds','mttlSeconds','mttrSeconds','degradationLevelPct','costUsdPerRun','tokensPerRun'],
  metrics: ['expanded','collapsed'], analysis: ['stages','cost'], search: ['used'], citation: ['copied'],
};
const clean = (v, n = 128) => typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, '').slice(0,n) : '';
const bounded = (v, max) => Number.isFinite(v) ? Math.max(0, Math.min(max, Math.floor(v))) : 0;

function connectionIP(request) {
  const value = request.headers.get('cf-connecting-ip');
  if (!value || value.length > 45) return null;
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(value) && value.split('.').every(part => Number(part) <= 255)) return value;
  if (value.includes(':') && /^[0-9a-f:.]+$/i.test(value)) {
    try { new URL(`http://[${value}]/`); return value; } catch { /* Invalid IPv6 address. */ }
  }
  return null;
}
const locationText = value => typeof value === 'string' ? clean(value.trim()).trim() || null : null;

export function normalizeEvent(raw, request, now = Date.now()) {
  if (!raw || !ID.test(raw.event_id) || !ID.test(raw.page_id) || !ID.test(raw.session_id) || !PAGES.has(raw.page)) throw new Error('Invalid event');
  if (raw.visitor_id != null && !ID.test(raw.visitor_id)) throw new Error('Invalid visitor');
  if (!['page','action'].includes(raw.type)) throw new Error('Invalid type');
  if (raw.type === 'page' && raw.event_id !== raw.page_id) throw new Error('Invalid page ID');
  if (raw.type === 'action' && !ACTIONS[raw.action]?.includes(raw.value)) throw new Error('Invalid action');
  if (!Number.isSafeInteger(raw.occurred_at) || raw.occurred_at > now + 300000 || raw.occurred_at < now - 86400000) throw new Error('Invalid time');
  // Missing fields from older collectors remain unknown, rather than fabricated.
  if (raw.page_sequence != null && (!Number.isSafeInteger(raw.page_sequence) || raw.page_sequence < 1 || raw.page_sequence > 1000000)) throw new Error('Invalid page sequence');
  if (raw.previous_page != null && !PAGES.has(raw.previous_page)) throw new Error('Invalid previous page');
  let referrer = '';
  try { const u = new URL(raw.referrer); if (['http:','https:'].includes(u.protocol)) referrer = u.hostname.slice(0,253); } catch { /* No referrer. */ }
  const ua = request.headers.get('user-agent') || '';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Other';
  return {
    event_id: raw.event_id, page_id: raw.page_id, type: raw.type, occurred_at: raw.occurred_at, received_at: now,
    page_sequence: raw.page_sequence ?? null, previous_page: raw.previous_page ?? null,
    page: raw.page, session_id: raw.session_id, visitor_id: raw.visitor_id ?? null,
    is_returning: raw.is_returning === 0 || raw.is_returning === 1 ? raw.is_returning : null,
    is_owner: raw.is_owner === 1 ? 1 : 0, referrer,
    ip: connectionIP(request), region: locationText(request.cf?.region), city: locationText(request.cf?.city),
    country: /^[A-Z]{2}$/.test(request.cf?.country || '') ? request.cf.country : '',
    device: /iPad|Tablet/i.test(ua) ? 'tablet' : /Mobi|Android/i.test(ua) ? 'mobile' : 'desktop', browser,
    ...Object.fromEntries(['source','medium','campaign','term','content'].map(k => [`utm_${k}`, clean(raw[`utm_${k}`])])),
    action: raw.type === 'action' ? raw.action : '', value: raw.type === 'action' ? raw.value : '',
    active_ms: raw.type === 'page' ? bounded(raw.active_ms, Math.max(0, now - raw.occurred_at + 5000)) : 0,
    scroll_pct: raw.type === 'page' ? bounded(raw.scroll_pct,100) : 0,
  };
}

export function eventStatement(db, event) {
  const keys = Object.keys(event);
  return db.prepare(`INSERT INTO events (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})
    ON CONFLICT(event_id) DO UPDATE SET
      active_ms = MAX(events.active_ms, excluded.active_ms),
      scroll_pct = MAX(events.scroll_pct, excluded.scroll_pct),
      received_at = MAX(events.received_at, excluded.received_at)
    WHERE events.type = 'page' AND excluded.type = 'page'
      AND events.page_id = excluded.page_id AND events.session_id = excluded.session_id
      AND events.page = excluded.page AND events.occurred_at = excluded.occurred_at
      AND events.page_sequence IS excluded.page_sequence AND events.previous_page IS excluded.previous_page
      AND events.is_owner = excluded.is_owner
      AND events.visitor_id IS excluded.visitor_id`).bind(...Object.values(event));
}

// Refresh closed UTC days from retained detail, preserving summaries older than retention.
export function retentionStatements(db, now = Date.now()) {
  const today = Math.floor(now / 86400000) * 86400000;
  const cutoff = today - 90 * 86400000;
  const day = "strftime('%Y-%m-%d',occurred_at / 1000,'unixepoch')";
  return [
    db.prepare(`INSERT INTO daily_totals SELECT ${day},is_owner,COUNT(*),COUNT(DISTINCT visitor_id),COUNT(DISTINCT session_id),COUNT(DISTINCT CASE WHEN is_returning=1 THEN session_id END),SUM(active_ms) FROM events WHERE type='page' AND occurred_at < ? GROUP BY 1,2
      ON CONFLICT(day,is_owner) DO UPDATE SET pageviews=excluded.pageviews,browsers=excluded.browsers,sessions=excluded.sessions,returning_sessions=excluded.returning_sessions,active_ms=excluded.active_ms`).bind(today),
    db.prepare(`INSERT INTO daily_pages SELECT ${day},is_owner,page,COUNT(*),SUM(active_ms) FROM events WHERE type='page' AND occurred_at < ? GROUP BY 1,2,3
      ON CONFLICT(day,is_owner,page) DO UPDATE SET pageviews=excluded.pageviews,active_ms=excluded.active_ms`).bind(today),
    db.prepare(`INSERT INTO daily_actions SELECT ${day},is_owner,action,value,COUNT(*) FROM events WHERE type='action' AND occurred_at < ? GROUP BY 1,2,3,4
      ON CONFLICT(day,is_owner,action,value) DO UPDATE SET count=excluded.count`).bind(today),
    db.prepare('DELETE FROM events WHERE occurred_at < ?').bind(cutoff),
  ];
}

async function readBody(request) {
  if (Number(request.headers.get('content-length')) > MAX_BYTES) throw new Error('Body too large');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Missing body');
  const chunks = []; let size = 0;
  while (true) {
    const {done,value} = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) { await reader.cancel(); throw new Error('Body too large'); }
    chunks.push(value);
  }
  const body = new Uint8Array(size); let offset = 0;
  for (const c of chunks) { body.set(c,offset); offset += c.byteLength; }
  return JSON.parse(new TextDecoder().decode(body));
}

export default {
  async fetch(request, env) {
    const origin = env.ALLOWED_ORIGIN;
    const headers = { 'Cache-Control':'no-store', 'Vary':'Origin' };
    const response = status => new Response(null,{status,headers});
    if (new URL(request.url).pathname !== '/collect') return response(404);
    if (!origin || request.headers.get('origin') !== origin) return response(403);
    headers['Access-Control-Allow-Origin'] = origin;
    if (request.method === 'OPTIONS') {
      headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
      headers['Access-Control-Allow-Headers'] = 'Content-Type';
      headers['Access-Control-Max-Age'] = '86400';
      return response(204);
    }
    if (request.method !== 'POST') return response(405);
    if (env.COLLECTION_ENABLED !== 'true') return response(503);
    if (!env.DB || !env.IP_LIMITER || !env.GLOBAL_LIMITER) return response(503);
    if (!/^(text\/plain|application\/json)(;|$)/i.test(request.headers.get('content-type') || '')) return response(415);
    try {
      // Connection IP also populates new event records; never include it in logs or public replies.
      const ip = request.headers.get('cf-connecting-ip') || 'unknown';
      if (!(await env.GLOBAL_LIMITER.limit({key:'collect'})).success || !(await env.IP_LIMITER.limit({key:ip})).success) return response(429);
      let events;
      try {
        const body = await readBody(request);
        if (!Array.isArray(body.events) || body.events.length < 1 || body.events.length > 20) throw new Error('Invalid batch');
        events = body.events.map(e => normalizeEvent(e,request));
      } catch { return response(400); }
      await env.DB.batch(events.map(e => eventStatement(env.DB,e)));
      return response(204);
    } catch { return response(503); }
  },
  async scheduled(_controller, env) {
    await env.DB.batch(retentionStatements(env.DB));
  },
};
