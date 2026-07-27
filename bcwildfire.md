# BC Wildfire Visualization Project Plan

This document summarizes the project plan discussed for a public web visualization about British Columbia wildfires, with historical trend storytelling and a live-status map. The plan uses official BC wildfire public data as the primary source, with a low-cost deployment path centered on local ingestion and Vercel delivery.[cite:1][cite:4][cite:2][cite:18][cite:26]

## Project goal

The core goal is to build a public-facing site that helps people recognize how BC wildfires are changing month by month and year by year, while also showing current wildfire status on a map.[cite:1][cite:4] The strongest product framing is to separate long-term historical analysis from live operational status, because BC Wildfire Service publishes both historical statistics and current incident/map information, but also warns that live perimeters and map data are reference information rather than exact real-time ground truth.[cite:4][cite:26]

## Public data sources

The main official sources identified so far are listed below.

| Source | Use in project |
|---|---|
| BC Wildfire Service status portal | Active wildfire map, incident details, statistics links, related wildfire resources.[cite:1] |
| BC Wildfire Service statistics and geospatial data page | Daily fire-season statistics, historical wildfire locations, season summaries, and long-run context including 10-year average references.[cite:4] |
| BC historical fire perimeters dataset | Historical perimeter geometry for all fire seasons before the current year.[cite:2] |
| BC current fire perimeters dataset | Current-season fire perimeters, including active and inactive fires, refreshed from operational systems approximately every 15 minutes.[cite:18][cite:20] |
| BC Wildfire Service public disclaimer | Caveats about map/perimeter accuracy, refresh timing, and reference-only use for public tools.[cite:26] |
| BC wildfire map/app guide and usage material | Public incident fields and map behavior, including size, suspected cause, response information, and evacuation context.[cite:7][cite:46] |

Federal wildfire datasets such as the Canadian Wildland Fire Information System were also noted as optional validation or enrichment sources, especially for broader context or hotspot overlays.[cite:24]

## Product structure

The recommended structure is a web app with two primary modes:

1. **Historical analysis mode** for month-by-month and year-by-year storytelling.[cite:4][cite:2]
2. **Live operations mode** for current wildfire polygons, incident summaries, and map-based exploration.[cite:1][cite:7][cite:26]

This separation improves rigor and clarity. Historical views are the right place to support claims about worsening seasons, while live views should focus on current conditions and be explicitly labeled as operational public-reference data.[cite:26][cite:45]

## Visualizations to build first

The recommended first-pass visualizations are:

- Cumulative hectares burned by day-of-year, with selectable seasons and a multi-year baseline or average band.[cite:4]
- Monthly hectares burned heatmap, with years as rows and months as columns.[cite:4][cite:2]
- Yearly totals for hectares burned and number of fires.[cite:4][cite:45]
- Regional breakdown by fire centre, since BC public wildfire information is commonly organized by fire centre.[cite:46]
- Cause splits where available, such as lightning versus human-caused fires.[cite:46]
- Live map with current fire perimeters, incident points, stage-of-control styling, and links to official incident information.[cite:18][cite:7][cite:26]

The general product priority is to ship historical storytelling first, then add live map capabilities afterward.[cite:4][cite:45][cite:18]

## Data and storage model

A useful normalized internal model would include:

- `fires`: fire identifier, discovery date, fire centre, suspected cause, latest size, stage of control, and status timestamps.[cite:7][cite:46]
- `perimeters`: geometry snapshots for each fire and date or version, plus source metadata and area in hectares.[cite:2][cite:18]
- `daily_rollups`: daily counts, cumulative hectares, and category breakdowns.[cite:4]
- `monthly_yearly_rollups`: precomputed series for charts and comparisons.[cite:4][cite:45]

The project does not need a live transactional database at first if the site is read-only and based on scheduled updates. A static artifact workflow can serve users efficiently by publishing generated files such as JSON, GeoJSON, Parquet, or vector tiles.[cite:56][cite:111][cite:122]

## Why DuckDB was recommended

DuckDB was recommended for the ingestion and analytics layer because the project has an analytical workload: repeated scans and aggregations across historical wildfire data by month, year, region, cause, and cumulative season curves.[cite:109][cite:98] DuckDB is especially well suited to file-based, batch-style transformation work and can produce frontend-ready outputs without needing to be the production database for the public site.[cite:109]

The intended role is:

- DuckDB as an ETL and aggregation engine.[cite:109]
- Vercel as the frontend delivery and hosting layer.[cite:56]
- Optional additional storage only if the product later needs richer app features such as users, admin editing, or ad hoc live querying.[cite:56]

## Whether Postgres is required

The conclusion reached was that the project does **not** need both DuckDB and Postgres to run.[cite:56][cite:98] The simplest and most suitable first version is either:

- static files only, or
- DuckDB for batch processing plus static outputs served by Vercel.[cite:56][cite:109]

Postgres only becomes useful if the product grows into a more interactive application with accounts, server-side filtering, editorial workflows, comments, or dynamic live querying beyond precomputed artifacts.[cite:56]

## Vercel offerings that fit this project

The Vercel features identified as relevant were:

| Vercel feature | Role in project |
|---|---|
| Frontend hosting | Deploy the site with CDN-backed global delivery.[cite:28][cite:35] |
| Functions / API routes | Lightweight metadata endpoints, latest refresh info, and small operational joins.[cite:56] |
| Blob | Store and serve generated files such as JSON, Parquet, GeoJSON, and other large static artifacts.[cite:111][cite:112][cite:118] |
| Edge Config | Hold very small, frequently-read config values such as current dataset version or feature flags.[cite:62][cite:56] |
| Web Analytics | Understand page usage and audience behavior.[cite:52][cite:58] |
| Speed Insights | Monitor real-user performance for map and chart pages.[cite:53][cite:57] |
| Observability | Review logs, route behavior, and production debugging data.[cite:51][cite:52] |

The plan does not depend on Vercel Postgres. Marketplace storage may be introduced later only if the product scope expands.[cite:56]

## MotherDuck and DuckDB on Vercel

It was confirmed that Vercel Marketplace includes a MotherDuck integration, and MotherDuck is positioned as a serverless analytics backend powered by DuckDB.[cite:66][cite:72][cite:98] However, this is not the same thing as Vercel offering plain standalone DuckDB as a first-party storage product.[cite:56][cite:75]

MotherDuck also appears to have a free tier suitable for hobbyist or small-scale analytics use, although it is usage-limited and better aligned with modest public dashboards and precomputed analytics than with heavy, constantly live analytical querying.[cite:80][cite:82][cite:91]

## Recommended low-cost deployment path

The most practical low-cost architecture discussed is:

1. Run ingestion and DuckDB processing locally on a desktop machine at home.[cite:109]
2. Generate compact derivative outputs such as JSON, GeoJSON, Parquet, or vector tiles.[cite:109][cite:111]
3. Upload those generated files to Vercel Blob or publish them as static deployment artifacts.[cite:111][cite:122]
4. Serve them to end users through the Vercel-hosted frontend.[cite:122][cite:118]

This approach avoids paying for a continuously running analytics backend and keeps the heavy data processing outside the request path.[cite:56][cite:111]

## Local desktop ingestion

It was concluded that the ingestion and DuckDB processing can run on a local desktop computer and the results can then be uploaded to Vercel for serving users.[cite:111][cite:122] This can be done in two ways:

- Commit generated artifacts into the site repository and deploy them with the site.[cite:122]
- Upload generated artifacts to Vercel Blob and let the site fetch them from Blob without a full frontend redeploy.[cite:111][cite:112]

Blob is the better fit if files are larger, updated more frequently, or should be decoupled from code deployments.[cite:111][cite:118] The current plan is to start with generated artifacts committed to the repo and deployed via the standard Vercel Git flow, keeping Blob as a fallback if repo size or deploy time later become an issue — see [Risks and open questions](#risks-and-open-questions-review-follow-up).

## Apple container architecture for ingestion

It was also discussed that DuckDB ingestion can run in an ephemeral way inside Apple’s container architecture on Apple silicon Macs.[cite:124][cite:129][cite:128] Apple’s container runtime uses lightweight virtual machines for Linux containers, which suits short-lived ETL jobs well.[cite:124][cite:129]

DuckDB can support two useful patterns in that environment:

- an in-memory ephemeral run using `:memory:` where only final artifacts are persisted outside the container, or
- an ephemeral container with a host-mounted persistent `.duckdb` file to retain state between runs.[cite:126][cite:137]

The recommended starting point is an ephemeral container, in-memory DuckDB, a host-mounted output directory, and a final upload step to Vercel Blob or deployment artifacts.[cite:126][cite:129][cite:111]

## Suggested end-state architecture

A strong first version of the system would look like this:

- Local scheduled ingestion job on a home desktop or Mac.[cite:109]
- DuckDB used during ETL to aggregate and reshape wildfire data.[cite:109]
- Generated artifacts written to a local output directory.[cite:111]
- Publishing step uploads artifacts to Vercel Blob or includes them in deployment output.[cite:111][cite:122]
- Vercel frontend serves charts, statistics views, and a live map using those prepared assets.[cite:56][cite:122]
- Vercel Analytics and Speed Insights provide usage and performance feedback.[cite:52][cite:53]

## MVP sequence

The agreed MVP sequence is:

1. Build the historical monthly/yearly dashboard first, because it is the most stable and persuasive awareness tool.[cite:4][cite:45]
2. Add the live map afterward using current perimeter data and public incident details.[cite:18][cite:7]
3. Add filters by fire centre, cause, and season.[cite:46][cite:4]
4. Add editorial annotations or season highlights later if desired.[cite:45]

## Cautions and data labeling

The project should consistently distinguish between historical summaries and live operational data. BC Wildfire Service’s public disclaimer says public map/perimeter information is for reference, may update on a delay, and may not reflect exact current conditions.[cite:26]

To keep the site credible, each visualization should label:

- the metric definition,
- the data source,
- the last refresh time,
- and whether the data is historical summary or operational live-reference information.[cite:4][cite:26]

## Risks and open questions (review follow-up)

A review of this plan surfaced a few operational items worth resolving before implementation. Decisions made so far:

- **Ingestion reliability**: The home-desktop ingestion job depends on the machine being on and connected. This is acceptable for this project — the update cadence is daily/early-morning, not the 15-minute live-perimeter refresh rate, so occasional missed runs are low-stakes. No failover system needed at MVP.
- **Publish and deploy path**: Generated artifacts (JSON, GeoJSON, Parquet, vector tiles) will be committed into the site repository and deployed through the normal Vercel Git-based deployment flow, rather than pushed to Vercel Blob out-of-band. This keeps the pipeline simple (one deploy = one consistent, versioned dataset) and avoids managing Blob upload credentials/scripts separately. Trade-off to keep in mind: repo size will grow over time as historical artifacts accumulate, and every data refresh triggers a full site redeploy. Vercel Blob remains the fallback if artifact size, update frequency, or deploy time later become a problem — see [Local desktop ingestion](#local-desktop-ingestion).
- **Data licensing and attribution**: BC Data Catalogue wildfire datasets (perimeters, incident locations, statistics) are published under the **Open Government Licence – British Columbia (OGL-BC)**, which permits copying, modifying, and redistributing the data, including for commercial use, provided it is attributed. If a dataset doesn't specify its own attribution wording, OGL-BC requires the statement: *"Contains information licensed under the Open Government Licence – British Columbia."* The site should carry this attribution (e.g., in a footer or About/Sources page) alongside the per-visualization source labeling already planned in [Cautions and data labeling](#cautions-and-data-labeling). Note the license also flags that some historical wildfire data is not to be used for legal purposes — worth keeping the site framed as informational/public-awareness rather than authoritative.
- **Geometry size/simplification**: No specific tool has been chosen yet. Suggested options to evaluate when the live map is built: `mapshaper` (simple CLI, good for one-off simplification during the DuckDB/ETL step) or `tippecanoe` (better if vector tiles with per-zoom detail become necessary). Given perimeters are processed locally already, running simplification as a step in the same local pipeline is the natural fit — no new infrastructure required.
- **Schema drift in source data**: Deferred until it actually happens, per direction. Worth a lightweight sanity check in the ingestion script later (e.g., asserting expected columns exist before the DuckDB transform runs) so a silent schema change fails loudly instead of corrupting rollups, but no proactive validation layer is needed now.

## Practical recommendation

The best first implementation is a public, read-only Vercel site backed by locally generated analytical artifacts. That means no mandatory Postgres, no mandatory always-on warehouse, and no requirement to run DuckDB in production request handling.[cite:56][cite:109][cite:122]

A concise architecture summary is:

- **Frontend**: Next.js or TypeScript React app on Vercel.[cite:28][cite:35]
- **Analytics prep**: DuckDB run locally during scheduled ingestion.[cite:109]
- **Delivery**: static files and/or Vercel Blob.[cite:111][cite:122]
- **Observability**: Vercel Analytics, Speed Insights, and basic observability tooling.[cite:52][cite:53]
- **Future expansion**: add Postgres, MotherDuck, or editorial/admin tooling only if the site evolves beyond a read-only public dashboard.[cite:66][cite:56][cite:80]
