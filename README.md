# SRE-Marathon

A project website for a continuous, change-driven benchmark for autonomous site reliability agents.

Website: https://bigbigbai.github.io/sre-marathon-leaderboard/

## Local development

Node.js 22 or later is required. No npm installation is needed.

```sh
npm run dev
npm run build
npm run check
npm test
```

Open http://localhost:5173/ after starting the dev server. Restart it after edits to rebuild.

## Content

- 19 evaluation configurations, with search, backbone filters and sortable metrics.
- Three application pages and a 700-fault catalog summary.
- Benchmark protocol, metric definitions, lifecycle and cost comparisons.
- Supplementary seed and load-regime comparisons, shown separately from the main results.
- Project case-study descriptions and downloadable result JSON.

The website does not distribute a manuscript, citation, review status or extracted manuscript figures.

## Data

`data/benchmark.json` describes the protocol; `leaderboard.json` stores main results; `applications.json` stores app/catalog statistics; `supplementary.json` stores seed and load comparisons.

Marathon-Score is out of 100, not a repair percentage. Stage metrics and risk are ratios, displayed as percentages. Missing values stay null. Time metrics are reported medians; token counts are rounded. Main results aggregate three applications and do not provide per-application scores or raw run replays.

## Implementation and deployment

`src/` contains the document shell, views, route and interaction handling, pure data helpers, styles and configuration. `scripts/build.mjs` generates a clean `dist/`; checks and tests validate data and Pages subdirectory routing.

Push to `main` to run the GitHub Pages workflow. Historical commits may contain previously deployed materials; the current build excludes them.
