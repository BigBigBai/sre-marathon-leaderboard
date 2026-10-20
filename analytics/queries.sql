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
