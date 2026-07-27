// Orchestrates the FULL ingestion pipeline: every source, including the
// large historical archives (BC/Ontario/NFDB), which have no incremental
// fetch logic of their own and always re-pull in full. Meant for local use
// or an infrequent (e.g. monthly) scheduled refresh - see run-daily.ts for
// the lightweight version used by the daily GitHub Actions job.
import { runSteps } from "./lib/run-steps";

const STEPS = [
  // BC (own datasets - most complete/current for BC)
  "fetch-historical-fires.ts",
  "fetch-fire-points.ts",
  "fetch-current-fires.ts",
  // Ontario (own datasets - more current than NFDB for Ontario)
  "fetch-on-historical-points.ts",
  "fetch-on-current-fires.ts",
  // Quebec (own live feed; historical still comes from NFDB)
  "fetch-qc-current-fires.ts",
  // US border states (own live feed; historical/daily still comes from CWFIS)
  "fetch-us-current-fires.ts",
  // Rest of Canada + the border states' daily/historical fallback (National
  // Fire Database + CWFIS satellite hotspots)
  "fetch-nfdb-points.ts",
  "fetch-cwfis-hotspots.ts",
  // Rollups (combine BC + Ontario + Canada-wide sources)
  "build-rollups.ts",
  "build-monthly-heatmap.ts",
  "build-monthly-points.ts",
  "build-daily-clusters.ts",
];

runSteps(STEPS, import.meta.dirname);
