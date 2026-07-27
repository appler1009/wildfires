// Lightweight daily pipeline for scheduled CI runs: only the sources that
// are actually time-sensitive day to day. Skips the large historical
// archives (BC/Ontario/NFDB full-table WFS fetches) - they have no
// incremental filter of their own, so re-running them daily would mean
// re-pulling the entire multi-decade archive from scratch every time for
// data that's already finalized and rarely changes. Run the full
// scripts/ingest/run.ts periodically instead (see the "full-refresh"
// GitHub Actions job) to pick up any revisions to that historical data.
//
// build-rollups.ts still needs the BC/Ontario/NFDB raw caches to exist on
// disk (from a previous full run, restored via the workflow's actions/cache)
// - it doesn't re-fetch them, just reads whatever's already there.
import { runSteps } from "./lib/run-steps";

const STEPS = [
  "fetch-current-fires.ts",
  "fetch-on-current-fires.ts",
  "fetch-qc-current-fires.ts",
  "fetch-us-current-fires.ts",
  "fetch-cwfis-hotspots.ts", // incremental - see the script's own comment
  "build-rollups.ts",
  "build-monthly-heatmap.ts",
  "build-monthly-points.ts",
  "build-daily-clusters.ts",
];

runSteps(STEPS, import.meta.dirname);
