// Reads the cached historical fire records and produces a year x month
// hectares-burned rollup, for the monthly heatmap visualization.
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
      TRY_CAST(FIRE_DATE AS DATE) AS fire_date,
      FIRE_SIZE_HECTARES::DOUBLE AS size_hectares
    FROM read_ndjson_auto('${RAW_PATH}')
    WHERE FIRE_YEAR IS NOT NULL
  `);

  const monthly = await connection.runAndReadAll(`
    SELECT
      fire_year AS year,
      MONTH(fire_date)::INTEGER AS month,
      COUNT(*)::INTEGER AS fire_count,
      ROUND(SUM(size_hectares), 1) AS hectares_burned
    FROM fires
    WHERE fire_date IS NOT NULL
    GROUP BY fire_year, MONTH(fire_date)
    ORDER BY fire_year, month
  `);

  const undated = await connection.runAndReadAll(`
    SELECT COUNT(*)::INTEGER AS count FROM fires WHERE fire_date IS NULL
  `);
  const undatedCount = (undated.getRowObjectsJson()[0]?.count as number) ?? 0;

  const rows = monthly.getRowObjectsJson();
  const years = [...new Set(rows.map((r) => r.year as number))].sort((a, b) => a - b);

  const output = {
    source:
      "BC Data Catalogue - Historical Fire Perimeters (WHSE_LAND_AND_NATURAL_RESOURCE.PROT_HISTORICAL_FIRE_POLYS_SP)",
    licence: "Open Government Licence - British Columbia",
    metric: "Hectares burned per month, grouped by the fire's FIRE_DATE (reported fire date).",
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
    console.log(`Note: excluded ${undatedCount} records with no parseable FIRE_DATE.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
