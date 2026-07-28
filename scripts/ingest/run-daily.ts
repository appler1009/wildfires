// Lightweight daily pipeline for scheduled CI runs: only the sources that
// are actually time-sensitive day to day. Skips the large historical
// archives (BC/Ontario/NFDB full-table WFS fetches) when their raw caches
// already exist - they have no incremental filter of their own, so
// re-running them daily would mean re-pulling the entire multi-decade
// archive from scratch every time for data that's already finalized and
// rarely changes. Run the full scripts/ingest/run.ts periodically instead
// (see the "full-refresh" GitHub Actions job) to pick up any revisions to
// that historical data.
//
// Self-bootstrapping: build-rollups.ts, build-monthly-heatmap.ts, and
// build-monthly-points.ts all read the BC/Ontario/NFDB raw caches from
// disk without fetching them - normally restored from a previous run via
// the workflow's actions/cache, but on a cold cache (first run ever, or
// after the cache was evicted) those files won't exist yet. Rather than
// silently crashing on a missing file deep in a build step, this checks
// upfront and fetches whatever's missing before continuing - the fetch
// steps skipped on a warm cache, run automatically on a cold one.
import { existsSync } from "node:fs";
import path from "node:path";
import { runSteps } from "./lib/run-steps";

const RAW_DIR = path.join(import.meta.dirname, "../../data/raw");

const HISTORICAL_STEPS: { file: string; step: string }[] = [
  { file: "historical-fire-perimeters.ndjson", step: "fetch-historical-fires.ts" },
  { file: "historical-fire-points.ndjson", step: "fetch-fire-points.ts" },
  { file: "on-historical-points.ndjson", step: "fetch-on-historical-points.ts" },
  { file: "nfdb-points.ndjson", step: "fetch-nfdb-points.ts" },
];

const missingHistoricalSteps = HISTORICAL_STEPS.filter(
  ({ file }) => !existsSync(path.join(RAW_DIR, file)),
).map(({ step }) => step);

if (missingHistoricalSteps.length > 0) {
  console.log(
    `No cache for: ${missingHistoricalSteps.join(", ")} - fetching (cold cache / first run).`,
  );
}

const STEPS = [
  "fetch-current-fires.ts",
  "fetch-on-current-fires.ts",
  "fetch-qc-current-fires.ts",
  "fetch-us-current-fires.ts",
  "fetch-cwfis-hotspots.ts", // incremental - see the script's own comment
  ...missingHistoricalSteps,
  "build-rollups.ts",
  "build-monthly-heatmap.ts",
  "build-monthly-points.ts",
  "build-daily-clusters.ts",
];

runSteps(STEPS, import.meta.dirname);
