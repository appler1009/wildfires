# Canada Wildfires

A public wildfire tracker for Canada — a live operational map plus over a
century of historical trends, built on Next.js (App Router), Leaflet, and
three.js.

**Live:** https://canada-wildfire.vercel.app

## What it does

- **Map (`/`)** — the day's active fires across BC, Ontario, Quebec, and the
  13 US states/territories bordering Canada, plus satellite-detected hotspot
  clusters for the rest of the country. A timeline lets you scrub back
  through the last year day-by-day and the full historical record
  month-by-month, with autoplay, playback speed, satellite/street basemap
  toggle, fullscreen, and a shareable `?at=` URL for any point on the
  timeline.
- **Yearly totals (`/historical/yearly`)** — fires and hectares burned per
  season since the start of each source's record, with a record-season
  callout and CSV export.
- **Monthly heatmap (`/historical/monthly`)** — hectares burned by year and
  month, log-scaled since almost all activity concentrates in a few summer
  months, also with CSV export.

## Data sources

| Source | Coverage | Licence |
|---|---|---|
| [BC Data Catalogue](https://catalogue.data.gov.bc.ca/) | BC current + historical fires | OGL – British Columbia |
| [Ontario GeoHub / LIO](https://geohub.lio.gov.on.ca/) | Ontario current + historical fires | OGL – Ontario |
| [SOPFEU](https://sopfeu.qc.ca/) | Quebec current fires | CC BY 4.0 (Gouvernement du Québec) |
| [NIFC / WFIGS](https://www.nifc.gov/) via Esri Living Atlas | US current fires (13 border states/territories) | US federal public domain |
| [National Fire Database](https://cwfis.cfs.nrcan.gc.ca/ha/nfdb) (NRCan) | Historical fires, rest of Canada | OGL – Canada |
| [CWFIS](https://cwfis.cfs.nrcan.gc.ca/) satellite hotspots (NRCan) | Daily archive + rest-of-Canada/US live reference | OGL – Canada |

All of it is **reference data**, not exact real-time ground truth — see the
in-app source notes for specifics per layer.

## Stack

- Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind CSS v4
- Leaflet / react-leaflet for the map; three.js / react-three-fiber for the
  3D boot-sequence globe
- DuckDB (`@duckdb/node-api`) for local ingestion/aggregation
- Data is pre-fetched to static JSON under `public/data/` and committed to
  the repo — the app itself makes no server-side calls to the upstream APIs

## Development

```bash
npm install
npm run dev      # http://localhost:3000
npm run lint
npm run build && npm run start   # production build
```

## Refreshing the data

Two pipelines, both under `scripts/ingest/`:

```bash
npm run ingest         # full: every source, including the BC/Ontario/NFDB
                        # historical archives (large, no incremental fetch
                        # of their own - always pulls in full)
npm run ingest:daily   # lightweight: current-fires feeds + satellite
                        # hotspots (incremental) + rebuild rollups
```

`fetch-cwfis-hotspots.ts` (satellite hotspots) is incremental - it keeps
`data/raw/cwfis-hotspots.ndjson` between runs and only re-fetches a short
overlap window plus anything new, instead of re-pulling its full 365-day
window every time. `run-daily.ts` is self-bootstrapping: if the historical
raw caches it depends on (but doesn't itself fetch) aren't on disk yet, it
fetches them before continuing rather than failing.

Individual steps can also be run directly, e.g.
`npx tsx scripts/ingest/fetch-current-fires.ts`.

### Automated (GitHub Actions)

`.github/workflows/ingest.yml` runs `ingest:daily` once a day (`12:00 UTC`)
and the full `ingest` monthly (`03:00 UTC` on the 1st), committing any
changed files under `public/data`/`src/data` back to `main` as
`github-actions[bot]`. `data/raw/` is cached between runs so the daily job
doesn't need to re-fetch the historical archives just to have them on disk.
Trigger it manually from the Actions tab (`workflow_dispatch`, with an
optional `full` flag to force the full pipeline).

## Deploying

Deployed on [Vercel](https://vercel.com) directly from this repo - pushes to
`main` (including the ingestion bot's commits) deploy automatically. No
environment variables are required; all data ships as static JSON in the
repo itself.

The production domain (`canada-wildfire.vercel.app`) needs to be registered
under Project → Settings → Domains to auto-track the latest deployment - a
domain added any other way (e.g. `vercel alias set`) is a one-time pointer
that won't follow future deploys.
