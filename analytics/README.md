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

- `page`: one record per rendered homepage or application detail view. Reloading creates another view; navigating homepage sections does not. Unknown application IDs share `application/not-found`.
- Page heartbeats update the same event ID with the maximum cumulative foreground milliseconds and scroll percentage. Duplicate and out-of-order uploads do not inflate pageviews, time or depth.
- `action`: paper/PDF/code/results links; section navigation; backbone filter; sort column; full-metrics toggle; chart/backbone choice; search use (once per document, no text); successful clipboard copy.
- A random localStorage browser ID approximates browsers, not people. A sessionStorage session renews after 30 minutes without recorded activity. Visible page heartbeats count as activity. Tabs normally have separate sessions, but browsers may copy sessionStorage when duplicating tabs. First/returning classification is a browser-local signal, not verified identity.
- Device/browser categories and approximate country are derived on the Worker. Referrers retain only the hostname. Only the five named `utm_*` values are retained, each capped at 128 characters. Never place personal information in campaign values.
- Raw IP addresses, raw user agents, arbitrary URLs, arbitrary query parameters and search text are not written to D1. Cloudflare processes the network request; IP is transiently used as a rate-limit key. Worker request observability is disabled in the deployment template.
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

The CLI also supports queries after login:

```sh
cd analytics
npx wrangler d1 execute sre-marathon-analytics --remote --config wrangler.jsonc \
  --command "SELECT * FROM daily_totals WHERE is_owner=0 ORDER BY day DESC LIMIT 30"
```

All timestamps/daily summaries use UTC. Browser counts exclude null IDs. Daily unique browsers/sessions cannot be summed to get period uniques: use `COUNT(DISTINCT ...)` over retained detail for a whole period. Referrer and campaign reports count pageviews. Summaries are for closed days and appear after the nightly cron.

## Retention, quotas and shutdown

A daily cron at 03:17 UTC recomputes summaries for closed days still present in detail, then deletes records before midnight UTC 90 days ago. These changes run in one D1 batch transaction. Long-term summaries contain daily counts/totals and no browser/session identifiers. The newest 90 UTC days plus today are retained; summaries do not contain today's partial results. Cron failure delays cleanup until the next successful run; inspect Cron status in Cloudflare.

The API caps bodies at 32 KiB, validates action/page values, batches at most 20 events, and uses bound SQL parameters. Rate limits are 60 requests/minute per IP and 600/minute for the shared global key. Cloudflare's counters are approximate and distributed; these are abuse controls, not a hard billing cap. Monitor actual Workers/D1 usage and quotas in your account. This setup does not automatically upgrade to paid plans.

Origin checks filter cross-site browser requests but are not authentication; scripts can forge Origin and manufacture statistics. No production service can promise bot-free counts. A separate authenticated service is needed if a visual administration dashboard is added later.

To stop new collection immediately, change Worker variable `COLLECTION_ENABLED` to `false` and redeploy (or stop the Worker). Also empty the site endpoint and publish to stop new client requests. Disabling only the site endpoint does not stop already-open old pages. Existing database records remain until retention/deletion; export only into ignored `analytics/exports/`.

Official references: [Workers](https://developers.cloudflare.com/workers/), [D1 batches](https://developers.cloudflare.com/d1/worker-api/d1-database/), [rate limits](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/), [cron](https://developers.cloudflare.com/workers/configuration/cron-triggers/).
