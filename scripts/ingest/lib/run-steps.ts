// Shared runner for a list of ingest step scripts, run in sequence.
import { spawnSync } from "node:child_process";
import path from "node:path";

export function runSteps(steps: string[], baseDir: string) {
  for (const step of steps) {
    const scriptPath = path.join(baseDir, step);
    console.log(`\n--- Running ${step} ---`);
    const result = spawnSync("npx", ["tsx", scriptPath], { stdio: "inherit" });
    if (result.status !== 0) {
      process.exit(result.status ?? 1);
    }
  }
}
