# SRE-Marathon

A project website for **SRE-Marathon: A Continuous, Change-Driven Benchmark for Autonomous Site Reliability Agents**, with its public paper at https://arxiv.org/abs/2609.33023.

Website: https://bigbigbai.github.io/sre-marathon-leaderboard/

## Run locally

Requires Node.js 22.13 or later. No npm installation or runtime service is required.

```sh
npm run dev
```

Open http://localhost:5173/ . Restart the command after editing source or data to rebuild, then refresh.

```sh
npm run build
npm run check
npm test
npm run preview
```

## What is included

- A project homepage, primary arXiv PDF/abstract links, public author list, BibTeX citation and benchmark code link.
- All 19 Table 2 configurations, with backbone/search filters, numeric sorting, and optional full metrics.
- Three application pages with verified catalog counts and concurrency statistics.
- The scoring definition, evaluation protocol and interpretation of each metric.
- Interactive lifecycle and cost/score views from Table 2 aggregates.
- Tables 7/8 shown separately as seed and operating-pressure comparisons.
- Two paper figures and the case-study narratives from Section 5.3.
- Keyboard access, light/dark themes and responsive layouts.

## Data and provenance

| File | Content | Paper source |
| --- | --- | --- |
| `data/benchmark.json` | Paper title, status, notes and protocol | Sections 2–4 |
| `data/leaderboard.json` | 19 reported configurations | Table 2, page 7 |
| `data/applications.json` | App descriptions, catalog sizes and concurrency | Table 1, page 4; Sections 2/4 |
| `data/supplementary.json` | Seed and load-regime results | Tables 7/8, page 20 |
| `public/sre-marathon-paper.pdf` | Web distribution copy of the anonymous manuscript | Conference/review headers removed |
| `public/assets/system-overview.png` | System architecture | Figure 2, page 3 |
| `public/assets/case-comparison.png` | Published case timelines | Figure 6, page 9 |

Numbers are manually transcribed from the paper and validated; they are not recomputed from raw experimental bundles. `leaderboard.json` is the source for the table and both interactive analysis views.

- `marathonScore` is a score from 0 to 100, **not** a repair percentage.
- `correlation`, `localization`, `repair` and `risk` are stored as ratios in `[0,1]`; the UI displays percentages.
- `mttdSeconds`, `mttlSeconds`, `mttrSeconds` are paper-reported medians over successfully reaching faults. They can be unordered.
- `degradationLevelPct` is relative to paired no-action runs and can exceed 100.
- `costUsdPerRun` is experimental USD cost; `tokensPerRun` is approximate because the paper rounds token counts.
- `null` preserves a source-table dash. It is never substituted with zero.
- The overall score cannot be derived by averaging the displayed aggregate stage rates: its computation gates progress per fault.
- Main rows average three applications. No per-application method results, raw time series, individual fault catalog or replay data is inferred.
- The 700 catalog faults are distinct from the approximately 60 faults injected per main run.
- Authors and BibTeX match arXiv:2609.33023. No conference acceptance or institution is claimed.

## Source structure

- `src/index.html`: document shell, navigation, metadata and footer.
- `src/main.js`: startup, filters, sorting, theme, citation and hash routing.
- `src/views.js`: project sections, tables and chart markup.
- `src/model.js`: formatting, filtering, ordering and input validation.
- `src/styles.css`: site styles, themes and responsive rules.
- `src/site.config.json`: public URL, project description and resource links.
- `scripts/build.mjs`: clean static build into `dist/`.
- `scripts/check.mjs`: data, module, deployment-asset and stale-content checks.
- `tests/`: numerical/formatting/filter regressions and Pages subdirectory HTTP checks.

Application pages use `#application/astronomy-shop`, `#application/online-boutique` and `#application/train-ticket`, which work on GitHub Pages without server routing. In-page sections use ordinary hash anchors.

## Deploy

Push to `main`. `.github/workflows/deploy.yml` builds, validates, tests, uploads `dist/` and deploys to GitHub Pages. Repository Settings → Pages should use **GitHub Actions**.

All assets, data and the paper are hosted locally. The anonymous benchmark repository link is reproduced from the manuscript; this website repository is a separate implementation.

The initial SWE-Marathon replica remains in Git history. Its results, team list, source bundles and remote log/demo integrations are no longer part of the current deployment. Do not rerun the old snapshot/export scripts from previous commits on the new data.

## Private project analytics

The website includes an optional event collector for pageviews, paper/code clicks, leaderboard interactions and citation copies. Session-local page sequences and previous tracked pages support journey reports, including back/forward cache restores. Configure the public Worker URL in `src/site.config.json` → `analytics.endpoint`; an empty value disables collection.

The separate Cloudflare Worker and D1 database live in `analytics/`; deployment instructions, reporting SQL, retention rules and shutdown steps are in [analytics/README.md](analytics/README.md). The website keeps its existing GitHub Pages hosting. Cloudflare tooling has its own pinned dependencies in `analytics/package.json` and is not included in the static website.

Visitors can disable collection in `privacy.html`; DNT/GPC are respected. The same page can mark your browser as owner, excluding future views from ordinary reports. No raw IP or search text is saved in the analytics database.

Analytics reports include browser profiles, session summaries, ordered paths, resource interest and session click rates, plus country/device/browser distributions. The views read retained detail (90 UTC days plus today); long-term daily counts remain separate. See [analytics/queries.sql](analytics/queries.sql) for ready-to-run SQL.
