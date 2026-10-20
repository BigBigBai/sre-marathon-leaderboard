-- UTC; default reports exclude self-declared owner browsers.
-- Daily trends including today (last 30 days of retained detail).
SELECT strftime('%Y-%m-%d',occurred_at/1000,'unixepoch') AS day,
       COUNT(*) AS pageviews, COUNT(DISTINCT visitor_id) AS browsers,
       COUNT(DISTINCT session_id) AS sessions,
       COUNT(DISTINCT CASE WHEN is_returning=1 THEN session_id END) AS returning_sessions,
       ROUND(SUM(active_ms)/1000.0) AS foreground_seconds
FROM events WHERE type='page' AND is_owner=0
  AND occurred_at >= (unixepoch('now')-30*86400)*1000
GROUP BY day ORDER BY day;

-- Unique browsers for the whole 30-day period (do not sum daily unique counts).
SELECT COUNT(DISTINCT visitor_id) AS browsers_30d
FROM events WHERE type='page' AND is_owner=0
  AND occurred_at >= (unixepoch('now')-30*86400)*1000;

-- Pages and interactions.
SELECT page,COUNT(*) AS pageviews,ROUND(AVG(active_ms)/1000.0) AS avg_foreground_seconds,
       ROUND(AVG(scroll_pct)) AS avg_max_scroll_pct
FROM events WHERE type='page' AND is_owner=0
  AND occurred_at >= (unixepoch('now')-30*86400)*1000
GROUP BY page ORDER BY pageviews DESC;
SELECT action,value,COUNT(*) AS count FROM events
WHERE type='action' AND is_owner=0 AND occurred_at >= (unixepoch('now')-30*86400)*1000
GROUP BY action,value ORDER BY count DESC;

-- Referrer and campaign attribution describe pageviews, not unique visitors.
SELECT referrer,country,COUNT(*) AS pageviews FROM events
WHERE type='page' AND is_owner=0 AND occurred_at >= (unixepoch('now')-30*86400)*1000
GROUP BY referrer,country ORDER BY pageviews DESC;
SELECT utm_source,utm_medium,utm_campaign,COUNT(*) AS pageviews FROM events
WHERE type='page' AND is_owner=0 AND occurred_at >= (unixepoch('now')-30*86400)*1000
GROUP BY utm_source,utm_medium,utm_campaign ORDER BY pageviews DESC;

-- Long-term daily summaries: closed UTC days only, refreshed nightly.
SELECT * FROM daily_totals WHERE is_owner=0 ORDER BY day DESC LIMIT 365;
SELECT * FROM daily_actions WHERE is_owner=0 AND action='link' ORDER BY day DESC,count DESC LIMIT 100;

-- Owner vs ordinary visitor comparison (last 30 days, pageviews only).
SELECT CASE is_owner WHEN 1 THEN 'owner' ELSE 'visitor' END AS visitor_type,
       COUNT(*) AS pageviews,COUNT(DISTINCT visitor_id) AS known_browsers,
       COUNT(DISTINCT session_id) AS sessions,ROUND(SUM(active_ms)/1000.0) AS foreground_seconds
FROM events WHERE type='page' AND occurred_at >= (unixepoch('now')-30*86400)*1000
GROUP BY is_owner;

-- Retained browser profiles (up to 90 UTC days plus today, excludes null browser IDs).
-- First seen means first retained observation, not an all-time first visit.
SELECT visitor_id,datetime(first_seen_at/1000,'unixepoch') AS first_retained_visit_utc,
       datetime(last_seen_at/1000,'unixepoch') AS last_seen_utc,
       pageviews,sessions,returning_sessions,ROUND(active_ms/1000.0) AS foreground_seconds,
       avg_max_scroll_pct
FROM visitor_profiles WHERE is_owner=0 ORDER BY last_seen_at DESC LIMIT 100;

-- Sessions starting in the last 30 days (retained observations only).
SELECT session_id,visitor_id,datetime(started_at/1000,'unixepoch') AS started_utc,
       datetime(last_activity_at/1000,'unixepoch') AS last_activity_utc,
       pageviews,distinct_pages,ROUND(active_ms/1000.0) AS foreground_seconds,
       max_scroll_pct,is_returning,actions,resource_clicks
FROM session_summary WHERE is_owner=0 AND started_at >= (unixepoch('now')-30*86400)*1000
ORDER BY started_at DESC LIMIT 100;

-- Path of the most recently active ordinary visitor session.
-- sequence_ordered=1 uses unique sequence metadata, 0 falls back to approximate time order.
-- Replace latest_session with a specific session ID / browser ID when investigating another session.
WITH latest_session AS (
  SELECT session_id,visitor_id FROM session_summary WHERE is_owner=0
  ORDER BY last_activity_at DESC,session_id LIMIT 1
)
SELECT p.session_id,p.step,p.page,p.previous_page,p.page_sequence,p.sequence_ordered,
       datetime(p.occurred_at/1000,'unixepoch') AS started_utc,
       ROUND(p.active_ms/1000.0) AS foreground_seconds,p.scroll_pct
FROM session_paths p JOIN latest_session s
  ON p.session_id=s.session_id AND p.visitor_id IS s.visitor_id
WHERE p.is_owner=0 ORDER BY p.step;

-- Resource interest over all retained detail. Clicks do not prove reading or downloads.
SELECT resource,clicks,known_browsers,sessions,
       datetime(last_clicked_at/1000,'unixepoch') AS last_clicked_utc
FROM resource_interest WHERE is_owner=0 ORDER BY clicks DESC,resource;

-- Resource conversion (last 30 days).
-- Denominator: observed visitor/browser-session pairs with a pageview in the period.
-- Numerator: those pairs with a matching resource click on an eligible page in the period.
-- Repeated clicks count once per session. Orphan/mismatched clicks and owner activity are excluded.
WITH eligible_pages AS (
  SELECT page_id,session_id,visitor_id FROM events
  WHERE type='page' AND is_owner=0 AND occurred_at >= (unixepoch('now')-30*86400)*1000
), eligible_sessions AS (
  SELECT DISTINCT session_id,visitor_id FROM eligible_pages
), clicks AS (
  SELECT DISTINCT a.value AS resource,a.session_id,a.visitor_id
  FROM events a JOIN eligible_pages p
    ON a.page_id=p.page_id AND a.session_id=p.session_id AND a.visitor_id IS p.visitor_id
  WHERE a.type='action' AND a.action='link' AND a.is_owner=0
    AND a.occurred_at >= (unixepoch('now')-30*86400)*1000
), resources(resource) AS (
  VALUES ('paper_pdf'),('paper_abstract'),('benchmark_code'),('website_source'),('results_json')
), clicked_sessions AS (
  SELECT resource,COUNT(*) AS sessions FROM clicks GROUP BY resource
), totals AS (
  SELECT COUNT(*) AS sessions FROM eligible_sessions
)
SELECT r.resource,t.sessions AS eligible_sessions,COALESCE(c.sessions,0) AS clicked_sessions,
       ROUND(100.0*COALESCE(c.sessions,0)/NULLIF(t.sessions,0),1) AS session_click_pct
FROM resources r CROSS JOIN totals t LEFT JOIN clicked_sessions c ON c.resource=r.resource
ORDER BY clicked_sessions DESC,r.resource;

-- Country, device and browser distribution (last 30 days, pageviews and known browsers).
SELECT COALESCE(NULLIF(country,''),'Unknown') AS country,COUNT(*) AS pageviews,
       COUNT(DISTINCT visitor_id) AS known_browsers
FROM events WHERE type='page' AND is_owner=0
  AND occurred_at >= (unixepoch('now')-30*86400)*1000
GROUP BY country ORDER BY pageviews DESC;
SELECT device,COUNT(*) AS pageviews,COUNT(DISTINCT visitor_id) AS known_browsers
FROM events WHERE type='page' AND is_owner=0
  AND occurred_at >= (unixepoch('now')-30*86400)*1000
GROUP BY device ORDER BY pageviews DESC;
SELECT browser,COUNT(*) AS pageviews,COUNT(DISTINCT visitor_id) AS known_browsers
FROM events WHERE type='page' AND is_owner=0
  AND occurred_at >= (unixepoch('now')-30*86400)*1000
GROUP BY browser ORDER BY pageviews DESC;

-- Your own latest pageviews, separate from ordinary visitor reports.
SELECT datetime(occurred_at/1000,'unixepoch') AS started_utc,page,session_id,page_sequence,
       previous_page,ROUND(active_ms/1000.0) AS foreground_seconds,scroll_pct
FROM owner_visits ORDER BY occurred_at DESC LIMIT 50;

-- Latest retained visitor access records, with initial IP/location snapshot.
-- started_utc is browser time; last_received_utc is the server's latest heartbeat receipt.
-- IP/region/city stay NULL for records created before network collection was enabled.
SELECT visitor_id,session_id,page,ip,country,region,city,
       datetime(occurred_at/1000,'unixepoch') AS started_utc,
       datetime(received_at/1000,'unixepoch') AS last_received_utc
FROM other_visits ORDER BY occurred_at DESC LIMIT 100;

-- Country/region/city distribution over the last 30 days (NULL or an empty country means unavailable).
SELECT country,region,city,COUNT(*) AS pageviews,
       COUNT(DISTINCT visitor_id) AS known_browsers
FROM events WHERE type='page' AND is_owner=0
  AND occurred_at >= (unixepoch('now')-30*86400)*1000
GROUP BY country,region,city ORDER BY pageviews DESC;

-- IP/location combinations over the last 30 days. IP addresses do not identify people.
SELECT ip,country,region,city,COUNT(*) AS pageviews,
       COUNT(DISTINCT visitor_id) AS known_browsers,
       datetime(MIN(occurred_at)/1000,'unixepoch') AS first_observed_utc,
       datetime(MAX(received_at)/1000,'unixepoch') AS last_received_utc
FROM events WHERE type='page' AND is_owner=0 AND ip IS NOT NULL
  AND occurred_at >= (unixepoch('now')-30*86400)*1000
GROUP BY ip,country,region,city ORDER BY pageviews DESC;
