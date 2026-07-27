// Orchestrates the local ingestion pipeline: fetch source data, then build rollups.
import { spawnSync } from "node:child_process";
import path from "node:path";

const STEPS = [
  "fetch-historical-fires.ts",
  "build-rollups.ts",
  "build-monthly-heatmap.ts",
  "fetch-fire-points.ts",
  "build-monthly-points.ts",
  "fetch-current-fires.ts",
];

for (const step of STEPS) {
  const scriptPath = path.join(import.meta.dirname, step);
  console.log(`\n--- Running ${step} ---`);
  const result = spawnSync("npx", ["tsx", scriptPath], { stdio: "inherit" });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
