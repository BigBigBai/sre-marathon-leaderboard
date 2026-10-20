# SRE-Marathon analytics

The project website stays on GitHub Pages. A separate Cloudflare Worker accepts a small allowlist of events at `POST /collect` and writes them to D1. There is no public analytics read API or dashboard. View data through your own authenticated Cloudflare D1 console or Wrangler CLI.

## Current deployment

- Website: https://bigbigbai.github.io/sre-marathon-leaderboard/
- Collector: https://sre-marathon-analytics.sre-marathon-leaderboard.workers.dev/collect
- Worker and D1 names: `sre-marathon-analytics`
- Preferences / owner marking: https://bigbigbai.github.io/sre-marathon-leaderboard/privacy.html
- Daily summary / retention cron: 03:17 UTC.

The resource IDs are in your ignored local `wrangler.jsonc`; recover them using your own account's `wrangler d1 list` if setting up on another machine. A GET on the collector does not return analytics data.

## Data and definitions

- `page`: one record per rendered homepage or application detail view. Reloading, switching applications, and back/forward restoration from the browser's BFCache create another view; navigating homepage sections does not. A normal initial `pageshow` does not duplicate the first view. Unknown application IDs share `application/not-found`.
- New pageviews carry a session-local `page_sequence` and `previous_page` (the previous tracked canonical page, not a URL). Sequence persists across reloads and same-tab document navigation; an expired session resets to sequence 1 and no predecessor. BFCache restoration reloads the latest stored session metadata before starting its new view. Blocked session storage prevents persistence across documents. Tab duplication may copy session IDs/sequences; reports flag non-unique sequence metadata and fall back to time order.
- Already-open older collectors keep working after migration: their sequence and predecessor stay NULL. Historical sequence/predecessor values are not fabricated.
- Page heartbeats update the same event ID with the maximum cumulative foreground milliseconds and scroll percentage. Duplicate and out-of-order uploads do not inflate pageviews, time or depth.
- `action`: paper/PDF/code/results links; section navigation; backbone filter; sort column; full-metrics toggle; chart/backbone choice; search use (once per document, no text); successful clipboard copy.
- A random localStorage browser ID approximates browsers, not people. A sessionStorage session renews after 30 minutes without recorded activity. Visible page heartbeats count as activity. Tabs normally have separate sessions, but browsers may copy sessionStorage when duplicating tabs. First/returning classification is a browser-local signal, not verified identity.
- Connection IP and approximate country, region/state and city come from Cloudflare on the Worker; device/browser categories are derived there as well. Referrers retain only the hostname. Only the five named `utm_*` values are retained, each capped at 128 characters. Never place personal information in campaign values.
- New event records store the connection IP from `CF-Connecting-IP` and country/region/city from `request.cf`. JSON fields and `X-Forwarded-For` are never trusted for these values. IPv4 and IPv6 are supported; unavailable/invalid IP, region and city values remain NULL (missing country retains the existing empty-string representation). IP is also used for rate limiting. Raw user agents, arbitrary URLs, arbitrary query parameters and search text are not written to D1. Worker request observability stays disabled; network data is not included in logs or public responses.
- Storage refusal is supported: collection can continue with a null browser ID and null return classification. Local previews, the privacy page, DNT/GPC browsers and opted-out browsers do not collect.
- Visibility loss/pagehide attempts a best-effort beacon. Timer deltas are capped at 60 seconds to limit sleep inflation. Background time is excluded. Network loss, blockers, browser termination or quota exhaustion can lose events; time is activity, not proof of reading, and clicks do not prove a completed download.
- The queue is memory-only, bounded to 200 pending records, sent in batches of at most 20. It retries transient failures; event IDs deduplicate retries. Hidden tabs may be suspended by the browser.
- Owner classification is self-declared through `privacy.html`, not authentication. It only affects future views. Reports default to `is_owner=0`. Changing privacy/owner preferences stops existing collectors in other tabs until reload; previously sent data is unchanged.

## Reproducible local setup

Node 22.13+ is required. The main website still needs no npm dependencies. Analytics tooling is isolated:

```sh
npm ci --prefix analytics
cp analytics/wrangler.example.jsonc analytics/wrangler.jsonc
npm --prefix analytics run login
npm --prefix analytics run whoami
```

`wrangler.jsonc`, `.dev.vars*`, local state, credentials and analytics exports are ignored by Git. Never put API tokens in frontend code, site configuration, GitHub commits or command-line arguments.

## First deployment

1. Use your own Cloudflare account. Create the D1 database:

   ```sh
   npm --prefix analytics run db:create
   ```

2. Copy its returned `database_id` into the local `analytics/wrangler.jsonc`. If you have multiple accounts, set the intended `account_id` in that local file. Keep the Worker name, D1 name and rate-limiter namespaces unique within your account.
3. Apply migrations and deploy:

   ```sh
   npm --prefix analytics run db:migrate
   npm --prefix analytics run deploy
   ```

4. Set `analytics.endpoint` in `src/site.config.json` to the actual deployed HTTPS Worker URL ending in `/collect`. An empty endpoint disables collection. Only a public URL belongs in this file.
5. Open `https://bigbigbai.github.io/sre-marathon-leaderboard/privacy.html` and mark your browser as owner before testing the live site. Build, test and push the website using the existing GitHub Pages flow:

   ```sh
   npm run build
   npm run check
   npm test
   ```

6. Confirm an actual website visit produces `POST /collect` with HTTP 204 and a D1 row. Confirm `GET /collect` does not expose data. Local browser previews intentionally send nothing.

Worker/database deployment is separate from the site's Pages deployment. Later site-only pushes do not modify the database or Worker. No Cloudflare credential is needed in the GitHub Pages workflow.

## Local Worker verification

Use the example config with a local database; this does not create Cloudflare resources:

```sh
cd analytics
npx wrangler d1 migrations apply sre-marathon-analytics --local --config wrangler.example.jsonc
npx wrangler dev --local --config wrangler.example.jsonc --test-scheduled
```

The default allowed origin remains the production GitHub Pages origin. Test the endpoint through a request with that Origin header, or use a separate local config to change it. Do not add localhost to the production allowlist. The browser collector also deliberately requires the configured production origin and project base path.

## Viewing reports

Open Cloudflare dashboard → Workers & Pages → D1 → `sre-marathon-analytics` → Console. `queries.sql` contains ready-to-use trend, page, link, interaction, source and campaign queries. For example:

```sql
SELECT action,value,COUNT(*) AS count FROM events
WHERE type='action' AND is_owner=0
GROUP BY action,value ORDER BY count DESC;
```

### Report views

Apply `0002_reports_and_paths.sql` before deploying the new Worker or collector. The migration only adds nullable fields, an index and views; existing events remain unchanged. Cached older collectors are accepted. New sequence fields appear only on new pageviews.

| View | Meaning |
| --- | --- |
| `owner_visits` / `other_visits` | Pageviews split by owner mark; action records are excluded. |
| `visitor_profiles` | Per known browser and owner category: first retained observation, last seen, pageviews, sessions and foreground time. NULL browser IDs are excluded. |
| `session_summary` | Per session, browser and owner category: pageviews, distinct pages, foreground time, max depth, return classification, actions and resource clicks. Sessions without any observed pageview are absent. |
| `session_paths` | Ordered pageviews with `step`, sequence and predecessor. `sequence_ordered=1` means every retained page in that group has unique sequence metadata; otherwise order is inferred from client time, server receipt time and event ID. This flag does not guarantee a complete journey: uploads can be lost and retention can remove early steps. |
| `resource_interest` | Per resource and owner category: click count, known browsers, sessions, and last click time. |

Views read retained event detail and do not store a separate permanent copy of browser/session IDs. Profile first-seen times describe the retained window; return classification is still the browser's first/returning signal, not inferred from retention-limited first-seen time. Owner and visitor records are grouped separately, even if they share an identifier.

`queries.sql` includes the original trend/interaction/source queries plus owner comparison, browser profiles, sessions, the most recently active visitor session's path, resource interest, session resource conversion, and country/device/browser distributions. Report comments specify each time window. The owner comparison and explicit owner sample are intentionally separate from ordinary visitor reports.

Resource conversion uses browser-session pairs with an observed ordinary pageview in the last 30 days as the denominator. The numerator is those same pairs with a resource click on an eligible matching page in the period; it counts repeated clicks once. Owner clicks, orphan/mismatched clicks and clicks on pages that began outside the window are excluded. A zero denominator produces NULL rather than 0%. It measures observed link-click activity, not actual reading, downloads, or successful code use.

For a specific session, run (substitute IDs from `session_summary`):

```sql
SELECT step,page,previous_page,page_sequence,sequence_ordered,
       datetime(occurred_at/1000,'unixepoch') AS started_utc,
       ROUND(active_ms/1000.0) AS foreground_seconds,scroll_pct
FROM session_paths
WHERE is_owner=0 AND session_id='SESSION_ID' AND visitor_id IS 'BROWSER_ID'
ORDER BY step;
```

For an anonymous session, replace `visitor_id IS 'BROWSER_ID'` with `visitor_id IS NULL`.

### Updating an existing deployment

```sh
npm run build
npm run check
npm test
npm --prefix analytics run db:migrate
npm --prefix analytics run deploy
```

Verify the Worker accepts both an old-format packet and a new packet with sequence metadata, then push the frontend to GitHub Pages. Migrate the schema first, then deploy the Worker, then the website. The Pages workflow does not migrate D1 automatically.

The CLI also supports queries after login:

```sh
cd analytics
npx wrangler d1 execute sre-marathon-analytics --remote --config wrangler.jsonc \
  --command "SELECT * FROM daily_totals WHERE is_owner=0 ORDER BY day DESC LIMIT 30"
```

All timestamps/daily summaries use UTC. Browser counts exclude null IDs. Daily unique browsers/sessions cannot be summed to get period uniques: use `COUNT(DISTINCT ...)` over retained detail for a whole period. Referrer and campaign reports count pageviews. Summaries are for closed days and appear after the nightly cron.

## IP, access times and approximate location

Migration `0003_ip_and_location.sql` adds nullable `ip`, `region` and `city` fields; `country`, `occurred_at` and `received_at` already exist. Apply it before deploying the updated Worker. Publish the updated privacy notice before enabling network-data collection. No browser permissions, client-side IP lookup, or third-party geolocation API is needed.

The IP/location snapshot describes the request that first inserted an event. Heartbeat updates change only cumulative time/depth and last receipt time, preserving the initial network snapshot. Events created before this upgrade keep NULL IP/region/city even if a later heartbeat arrives; historical data is not backfilled. A new event is recorded using its incoming connection, so later pages/actions can reflect a different network.

`occurred_at` is the browser's page/action start time, subject to clock differences; `received_at` is the server's latest receipt time (updated on page heartbeats). Ready-to-run SQL displays both in UTC. `queries.sql` adds the latest visitor access records, country/region/city distribution, and IP/location counts. Random browser IDs remain the basis for browser metrics; IP counts are not unique-person counts.

Locations are Cloudflare's approximate IP-based estimates, can be missing, and may reflect a shared network, VPN/proxy exit or Worker subrequest. No browser geolocation permission is requested. Detailed IP/location data is accessible only through your authenticated Cloudflare D1 tools, follows the same 90-UTC-days-plus-today retention window, and is not included in permanent daily aggregates, repository files, or public endpoints. Export only to the ignored `analytics/exports/` directory.

Official field references: [Request connection metadata](https://developers.cloudflare.com/workers/runtime-apis/request/#incomingrequestcfproperties) and [CF-Connecting-IP](https://developers.cloudflare.com/fundamentals/reference/http-headers/#cf-connecting-ip).

## Retention, quotas and shutdown

A daily cron at 03:17 UTC recomputes summaries for closed days still present in detail, then deletes records before midnight UTC 90 days ago. These changes run in one D1 batch transaction. Long-term summaries contain daily counts/totals and no browser/session identifiers. The newest 90 UTC days plus today are retained; summaries do not contain today's partial results. Cron failure delays cleanup until the next successful run; inspect Cron status in Cloudflare.

The API caps bodies at 32 KiB, validates action/page values, batches at most 20 events, and uses bound SQL parameters. Rate limits are 60 requests/minute per IP and 600/minute for the shared global key. Cloudflare's counters are approximate and distributed; these are abuse controls, not a hard billing cap. Monitor actual Workers/D1 usage and quotas in your account. This setup does not automatically upgrade to paid plans.

Origin checks filter cross-site browser requests but are not authentication; scripts can forge Origin and manufacture statistics. No production service can promise bot-free counts. A separate authenticated service is needed if a visual administration dashboard is added later.

To stop new collection immediately, change Worker variable `COLLECTION_ENABLED` to `false` and redeploy (or stop the Worker). Also empty the site endpoint and publish to stop new client requests. Disabling only the site endpoint does not stop already-open old pages. Existing database records remain until retention/deletion; export only into ignored `analytics/exports/`.

Official references: [Workers](https://developers.cloudflare.com/workers/), [D1 batches](https://developers.cloudflare.com/d1/worker-api/d1-database/), [rate limits](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/), [cron](https://developers.cloudflare.com/workers/configuration/cron-triggers/).
