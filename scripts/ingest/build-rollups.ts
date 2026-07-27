// Reads the cached historical fire records (BC + Ontario's own datasets, the
// National Fire Database for the rest of Canada) and produces frontend-ready
// yearly rollup JSON under src/data/, using DuckDB for aggregation.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { DuckDBInstance } from "@duckdb/node-api";

const BC_RAW_PATH = path.join(
  import.meta.dirname,
  "../../data/raw/historical-fire-perimeters.ndjson",
);
const ON_RAW_PATH = path.join(import.meta.dirname, "../../data/raw/on-historical-points.ndjson");
const NFDB_RAW_PATH = path.join(import.meta.dirname, "../../data/raw/nfdb-points.ndjson");
const OUTPUT_DIR = path.join(import.meta.dirname, "../../src/data");

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });

  const instance = await DuckDBInstance.create(":memory:");
  const connection = await instance.connect();

  await connection.run(`
    CREATE TABLE fires AS
    SELECT FIRE_YEAR::INTEGER AS fire_year, FIRE_SIZE_HECTARES::DOUBLE AS size_hectares
    FROM read_ndjson_auto('${BC_RAW_PATH}')
    WHERE FIRE_YEAR IS NOT NULL
    UNION ALL
    SELECT FIRE_YEAR::INTEGER AS fire_year, FIRE_FINAL_SIZE::DOUBLE AS size_hectares
    FROM read_ndjson_auto('${ON_RAW_PATH}')
    WHERE FIRE_YEAR IS NOT NULL
    UNION ALL
    SELECT YEAR::INTEGER AS fire_year, SIZE_HA::DOUBLE AS size_hectares
    FROM read_ndjson_auto('${NFDB_RAW_PATH}')
    WHERE YEAR IS NOT NULL
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
    source:
      "BC Data Catalogue (BC), Ontario GeoHub / LIO (Ontario), National Fire Database (rest of Canada, Natural Resources Canada / CWFIS)",
    licence:
      "Open Government Licence - British Columbia / Open Government Licence - Ontario / Open Government Licence - Canada",
    note: "National Fire Database coverage outside BC/Ontario currently extends to 2023 and lags the current season by roughly 1-2 years; BC's and Ontario's own datasets are more current and complete for those provinces.",
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
