# Canada Wildfires

A public wildfire tracker for Canada — a live operational map plus over a
century of historical trends, built on Next.js (App Router), Leaflet, and
three.js.

**Live:** https://canada-wildfires.vercel.app

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

```bash
npm run ingest
```

Runs the full pipeline in `scripts/ingest/run.ts`: fetches every source
above, rebuilds the yearly/monthly rollups, the monthly heatmap, and the
daily satellite-hotspot archive, and writes everything to `public/data/`.
Individual steps can also be run directly, e.g.
`npx tsx scripts/ingest/fetch-current-fires.ts`.

## Deploying

Deployed on [Vercel](https://vercel.com) directly from this repo — pushes to
`main` deploy automatically once the project's GitHub connection is set up
(Vercel dashboard → Project → Settings → Git). No environment variables are
required; all data ships as static JSON in the repo itself.
