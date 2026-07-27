// Reads the cached historical fire records (BC + Ontario's own datasets, the
// National Fire Database for the rest of Canada) and produces a year x month
// hectares-burned rollup, for the monthly heatmap visualization.
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

  // DISTINCT * on each raw source before projecting: the NFDB cache has a
  // handful of byte-identical duplicate records, which would otherwise
  // double-count those fires' hectares in the monthly totals.
  await connection.run(`
    CREATE TABLE fires AS
    SELECT
      FIRE_YEAR::INTEGER AS fire_year,
      MONTH(TRY_CAST(FIRE_DATE AS DATE)) AS fire_month,
      FIRE_SIZE_HECTARES::DOUBLE AS size_hectares
    FROM (SELECT DISTINCT * FROM read_ndjson_auto('${BC_RAW_PATH}'))
    WHERE FIRE_YEAR IS NOT NULL
    UNION ALL
    SELECT
      FIRE_YEAR::INTEGER AS fire_year,
      MONTH(EPOCH_MS(FIRE_START_DATE::BIGINT)) AS fire_month,
      FIRE_FINAL_SIZE::DOUBLE AS size_hectares
    FROM (SELECT DISTINCT * FROM read_ndjson_auto('${ON_RAW_PATH}'))
    WHERE FIRE_YEAR IS NOT NULL
    UNION ALL
    SELECT YEAR::INTEGER AS fire_year, MONTH::INTEGER AS fire_month, SIZE_HA::DOUBLE AS size_hectares
    FROM (SELECT DISTINCT * FROM read_ndjson_auto('${NFDB_RAW_PATH}'))
    WHERE YEAR IS NOT NULL
  `);

  const monthly = await connection.runAndReadAll(`
    SELECT
      fire_year AS year,
      fire_month::INTEGER AS month,
      COUNT(*)::INTEGER AS fire_count,
      ROUND(SUM(size_hectares), 1) AS hectares_burned
    FROM fires
    WHERE fire_month BETWEEN 1 AND 12
    GROUP BY fire_year, fire_month
    ORDER BY fire_year, month
  `);

  const undated = await connection.runAndReadAll(`
    SELECT COUNT(*)::INTEGER AS count FROM fires WHERE fire_month IS NULL OR fire_month NOT BETWEEN 1 AND 12
  `);
  const undatedCount = (undated.getRowObjectsJson()[0]?.count as number) ?? 0;

  const rows = monthly.getRowObjectsJson();
  const years = [...new Set(rows.map((r) => r.year as number))].sort((a, b) => a - b);

  const output = {
    source:
      "BC Data Catalogue (BC), Ontario GeoHub / LIO (Ontario), National Fire Database (rest of Canada, Natural Resources Canada / CWFIS)",
    licence:
      "Open Government Licence - British Columbia / Open Government Licence - Ontario / Open Government Licence - Canada",
    metric: "Hectares burned per month, grouped by each fire's reported date.",
    note: "National Fire Database coverage outside BC/Ontario currently extends to 2023 and lags the current season by roughly 1-2 years; BC's and Ontario's own datasets are more current and complete for those provinces.",
    generatedAt: new Date().toISOString(),
    kind: "historical_summary" as const,
    excludedRecordsMissingDate: undatedCount,
    years,
    rows,
  };

  await writeFile(
    path.join(OUTPUT_DIR, "monthly-fire-heatmap.json"),
    JSON.stringify(output, null, 2) + "\n",
    "utf-8",
  );

  console.log(
    `Wrote ${rows.length} year/month cells (${years.length} years) to src/data/monthly-fire-heatmap.json`,
  );
  if (undatedCount > 0) {
    console.log(`Note: excluded ${undatedCount} records with no parseable date.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
