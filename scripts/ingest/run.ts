// Orchestrates the local ingestion pipeline: fetch source data, then build rollups.
import { spawnSync } from "node:child_process";
import path from "node:path";

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
  // Rest of Canada (National Fire Database + CWFIS satellite hotspots)
  "fetch-nfdb-points.ts",
  "fetch-cwfis-hotspots.ts",
  // Rollups (combine BC + Ontario + Canada-wide sources)
  "build-rollups.ts",
  "build-monthly-heatmap.ts",
  "build-monthly-points.ts",
  "build-daily-clusters.ts",
];

for (const step of STEPS) {
  const scriptPath = path.join(import.meta.dirname, step);
  console.log(`\n--- Running ${step} ---`);
  const result = spawnSync("npx", ["tsx", scriptPath], { stdio: "inherit" });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
