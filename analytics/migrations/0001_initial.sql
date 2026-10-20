CREATE TABLE events (
  event_id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('page','action')),
  occurred_at INTEGER NOT NULL,
  received_at INTEGER NOT NULL,
  page TEXT NOT NULL,
  session_id TEXT NOT NULL,
  visitor_id TEXT,
  is_returning INTEGER CHECK (is_returning IN (0,1)),
  is_owner INTEGER NOT NULL CHECK (is_owner IN (0,1)),
  referrer TEXT NOT NULL,
  country TEXT NOT NULL,
  device TEXT NOT NULL,
  browser TEXT NOT NULL,
  utm_source TEXT NOT NULL,
  utm_medium TEXT NOT NULL,
  utm_campaign TEXT NOT NULL,
  utm_term TEXT NOT NULL,
  utm_content TEXT NOT NULL,
  action TEXT NOT NULL,
  value TEXT NOT NULL,
  active_ms INTEGER NOT NULL DEFAULT 0,
  scroll_pct INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX events_time ON events(occurred_at);
CREATE INDEX events_page ON events(page_id);
CREATE INDEX events_owner_type_time ON events(is_owner,type,occurred_at);
CREATE TABLE daily_totals (
  day TEXT NOT NULL,
  is_owner INTEGER NOT NULL,
  pageviews INTEGER NOT NULL,
  browsers INTEGER NOT NULL,
  sessions INTEGER NOT NULL,
  returning_sessions INTEGER NOT NULL,
  active_ms INTEGER NOT NULL,
  PRIMARY KEY(day,is_owner)
);
CREATE TABLE daily_pages (
  day TEXT NOT NULL,
  is_owner INTEGER NOT NULL,
  page TEXT NOT NULL,
  pageviews INTEGER NOT NULL,
  active_ms INTEGER NOT NULL,
  PRIMARY KEY(day,is_owner,page)
);
CREATE TABLE daily_actions (
  day TEXT NOT NULL,
  is_owner INTEGER NOT NULL,
  action TEXT NOT NULL,
  value TEXT NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY(day,is_owner,action,value)
);
