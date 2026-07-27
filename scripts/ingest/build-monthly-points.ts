// Splits the cached historical fire incident points into one JSON file per
// year-month (under public/data/fires/) so the map only fetches the month
// the user is actually viewing, plus an index of which months have data.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { DuckDBInstance } from "@duckdb/node-api";

const RAW_PATH = path.join(import.meta.dirname, "../../data/raw/historical-fire-points.ndjson");
const OUTPUT_DIR = path.join(import.meta.dirname, "../../public/data/fires");

const SOURCE =
  "BC Data Catalogue - Historical Fire Incident Locations (WHSE_LAND_AND_NATURAL_RESOURCE.PROT_HISTORICAL_INCIDENTS_SP)";
const LICENCE = "Open Government Licence - British Columbia";

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });

  const instance = await DuckDBInstance.create(":memory:");
  const connection = await instance.connect();

  await connection.run(`
    CREATE TABLE points AS
    SELECT
      FIRE_NUMBER AS fire_number,
      FIRE_YEAR::INTEGER AS fire_year,
      TRY_CAST(IGNITION_DATE AS DATE) AS ignition_date,
      LATITUDE::DOUBLE AS lat,
      LONGITUDE::DOUBLE AS lon,
      CURRENT_SIZE::DOUBLE AS hectares,
      FIRE_CAUSE AS cause,
      GEOGRAPHIC_DESCRIPTION AS place
    FROM read_ndjson_auto('${RAW_PATH}')
    WHERE FIRE_YEAR IS NOT NULL AND LATITUDE IS NOT NULL AND LONGITUDE IS NOT NULL
  `);

  const monthsResult = await connection.runAndReadAll(`
    SELECT
      fire_year AS year,
      COALESCE(MONTH(ignition_date), 0)::INTEGER AS month,
      COUNT(*)::INTEGER AS count
    FROM points
    GROUP BY fire_year, COALESCE(MONTH(ignition_date), 0)
    ORDER BY year, month
  `);
  const months = monthsResult.getRowObjectsJson() as {
    year: number;
    month: number;
    count: number;
  }[];

  for (const { year, month } of months) {
    // month = 0 means no parseable ignition date; grouped separately, not written as a tile.
    if (month === 0) continue;

    const cellResult = await connection.runAndReadAll(`
      SELECT fire_number, ignition_date::VARCHAR AS date, lat, lon, hectares, cause, place
      FROM points
      WHERE fire_year = ${year} AND MONTH(ignition_date) = ${month}
      ORDER BY hectares DESC NULLS LAST
    `);
    const points = cellResult.getRowObjectsJson();

    const monthStr = String(month).padStart(2, "0");
    await writeFile(
      path.join(OUTPUT_DIR, `${year}-${monthStr}.json`),
      JSON.stringify({ year, month, points }),
      "utf-8",
    );
  }

  const undatedResult = await connection.runAndReadAll(`
    SELECT COUNT(*)::INTEGER AS count FROM points WHERE ignition_date IS NULL
  `);
  const undatedCount = (undatedResult.getRowObjectsJson()[0]?.count as number) ?? 0;

  const index = {
    source: SOURCE,
    licence: LICENCE,
    generatedAt: new Date().toISOString(),
    excludedRecordsMissingDate: undatedCount,
    months: months.filter((m) => m.month !== 0),
  };

  await writeFile(path.join(OUTPUT_DIR, "index.json"), JSON.stringify(index, null, 2) + "\n", "utf-8");

  console.log(
    `Wrote ${index.months.length} monthly point files to public/data/fires/ (${undatedCount} points excluded, no ignition date)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
