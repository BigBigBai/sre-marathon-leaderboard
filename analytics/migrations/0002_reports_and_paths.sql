-- Optional metadata keeps already-open older collectors compatible.
ALTER TABLE events ADD COLUMN page_sequence INTEGER
  CHECK (page_sequence IS NULL OR (page_sequence BETWEEN 1 AND 1000000));
ALTER TABLE events ADD COLUMN previous_page TEXT
  CHECK (previous_page IS NULL OR previous_page IN ('home','application/astronomy-shop','application/online-boutique','application/train-ticket','application/not-found'));
CREATE INDEX events_session_path ON events(session_id,visitor_id,is_owner,type,occurred_at);

-- These views read retained detail only; they do not duplicate or retain identifiers.
CREATE VIEW owner_visits AS SELECT * FROM events WHERE type='page' AND is_owner=1;
CREATE VIEW other_visits AS SELECT * FROM events WHERE type='page' AND is_owner=0;

CREATE VIEW visitor_profiles AS
SELECT visitor_id,is_owner,MIN(occurred_at) AS first_seen_at,MAX(received_at) AS last_seen_at,
       COUNT(*) AS pageviews,COUNT(DISTINCT session_id) AS sessions,
       COUNT(DISTINCT CASE WHEN is_returning=1 THEN session_id END) AS returning_sessions,
       SUM(active_ms) AS active_ms,ROUND(AVG(scroll_pct),1) AS avg_max_scroll_pct
FROM events WHERE type='page' AND visitor_id IS NOT NULL
GROUP BY visitor_id,is_owner;

CREATE VIEW session_summary AS
WITH pages AS (
  SELECT session_id,visitor_id,is_owner,MIN(occurred_at) AS started_at,MAX(received_at) AS last_seen_at,
         COUNT(*) AS pageviews,COUNT(DISTINCT page) AS distinct_pages,
         SUM(active_ms) AS active_ms,MAX(scroll_pct) AS max_scroll_pct,
         CASE WHEN COUNT(is_returning)=0 THEN NULL ELSE MAX(is_returning) END AS is_returning
  FROM events WHERE type='page' GROUP BY session_id,visitor_id,is_owner
), actions AS (
  SELECT session_id,visitor_id,is_owner,COUNT(*) AS actions,
         SUM(action='link') AS resource_clicks,MAX(received_at) AS last_action_at
  FROM events WHERE type='action' GROUP BY session_id,visitor_id,is_owner
)
SELECT p.*,COALESCE(a.actions,0) AS actions,COALESCE(a.resource_clicks,0) AS resource_clicks,
       MAX(p.last_seen_at,COALESCE(a.last_action_at,p.last_seen_at)) AS last_activity_at
FROM pages p LEFT JOIN actions a
  ON a.session_id=p.session_id AND a.visitor_id IS p.visitor_id AND a.is_owner=p.is_owner;

CREATE VIEW session_paths AS
WITH quality AS (
  SELECT session_id,visitor_id,is_owner,
         COUNT(*)=COUNT(page_sequence) AND COUNT(*)=COUNT(DISTINCT page_sequence) AS sequence_ordered
  FROM events WHERE type='page' GROUP BY session_id,visitor_id,is_owner
)
SELECT e.session_id,e.visitor_id,e.is_owner,e.page_id,e.page,e.previous_page,e.page_sequence,
       e.occurred_at,e.received_at,e.active_ms,e.scroll_pct,q.sequence_ordered,
       ROW_NUMBER() OVER (
         PARTITION BY e.session_id,e.visitor_id,e.is_owner
         ORDER BY CASE WHEN q.sequence_ordered THEN e.page_sequence END,
                  e.occurred_at,e.received_at,e.event_id
       ) AS step
FROM events e JOIN quality q
  ON q.session_id=e.session_id AND q.visitor_id IS e.visitor_id AND q.is_owner=e.is_owner
WHERE e.type='page';

CREATE VIEW resource_interest AS
SELECT value AS resource,is_owner,COUNT(*) AS clicks,
       COUNT(DISTINCT visitor_id) AS known_browsers,COUNT(DISTINCT session_id) AS sessions,
       MAX(occurred_at) AS last_clicked_at
FROM events WHERE type='action' AND action='link'
GROUP BY value,is_owner;
