// Reads the cached historical fire records and produces frontend-ready
// rollup JSON artifacts under src/data/, using DuckDB for aggregation.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { DuckDBInstance } from "@duckdb/node-api";

const RAW_PATH = path.join(
  import.meta.dirname,
  "../../data/raw/historical-fire-perimeters.ndjson",
);
const OUTPUT_DIR = path.join(import.meta.dirname, "../../src/data");

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });

  const instance = await DuckDBInstance.create(":memory:");
  const connection = await instance.connect();

  await connection.run(`
    CREATE TABLE fires AS
    SELECT
      FIRE_YEAR::INTEGER AS fire_year,
      FIRE_SIZE_HECTARES::DOUBLE AS size_hectares,
      FIRE_CAUSE AS cause,
      FIRE_NUMBER AS fire_number
    FROM read_ndjson_auto('${RAW_PATH}')
    WHERE FIRE_YEAR IS NOT NULL
  `);

  const yearly = await connection.runAndReadAll(`
    SELECT
      fire_year AS year,
      COUNT(*)::INTEGER AS fire_count,
      ROUND(SUM(size_hectares), 1) AS hectares_burned
    FROM fires
    GROUP BY fire_year
    ORDER BY fire_year
  `);

  const yearlyTotals = {
    source: "BC Data Catalogue - Historical Fire Perimeters (WHSE_LAND_AND_NATURAL_RESOURCE.PROT_HISTORICAL_FIRE_POLYS_SP)",
    licence: "Open Government Licence - British Columbia",
    generatedAt: new Date().toISOString(),
    kind: "historical_summary" as const,
    rows: yearly.getRowObjectsJson(),
  };

  await writeFile(
    path.join(OUTPUT_DIR, "yearly-fire-totals.json"),
    JSON.stringify(yearlyTotals, null, 2) + "\n",
    "utf-8",
  );

  console.log(`Wrote ${yearlyTotals.rows.length} yearly rows to src/data/yearly-fire-totals.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
