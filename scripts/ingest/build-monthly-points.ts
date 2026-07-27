// Splits the cached historical fire points (BC's own incidents + National
// Fire Database for the rest of Canada) into one JSON file per year-month
// (under public/data/fires/) so the map only fetches the month the user is
// actually viewing, plus an index of which months have data.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { DuckDBInstance } from "@duckdb/node-api";

const BC_RAW_PATH = path.join(import.meta.dirname, "../../data/raw/historical-fire-points.ndjson");
const NFDB_RAW_PATH = path.join(import.meta.dirname, "../../data/raw/nfdb-points.ndjson");
const OUTPUT_DIR = path.join(import.meta.dirname, "../../public/data/fires");

const SOURCE =
  "BC Data Catalogue - Historical Fire Incident Locations (BC), National Fire Database (rest of Canada, Natural Resources Canada / CWFIS)";
const LICENCE = "Open Government Licence - British Columbia / Open Government Licence - Canada";

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });

  const instance = await DuckDBInstance.create(":memory:");
  const connection = await instance.connect();

  await connection.run(`
    CREATE TABLE points AS
    SELECT
      FIRE_NUMBER AS fire_number,
      'BC' AS province,
      FIRE_YEAR::INTEGER AS fire_year,
      TRY_CAST(IGNITION_DATE AS DATE) AS ignition_date,
      LATITUDE::DOUBLE AS lat,
      LONGITUDE::DOUBLE AS lon,
      CURRENT_SIZE::DOUBLE AS hectares,
      FIRE_CAUSE AS cause,
      GEOGRAPHIC_DESCRIPTION AS place
    FROM read_ndjson_auto('${BC_RAW_PATH}')
    WHERE FIRE_YEAR IS NOT NULL AND LATITUDE IS NOT NULL AND LONGITUDE IS NOT NULL
    UNION ALL
    SELECT
      COALESCE(FIRE_ID, FIRENAME) AS fire_number,
      SRC_AGENCY AS province,
      YEAR::INTEGER AS fire_year,
      MAKE_DATE(YEAR::INTEGER, MONTH::INTEGER, DAY::INTEGER) AS ignition_date,
      LATITUDE::DOUBLE AS lat,
      LONGITUDE::DOUBLE AS lon,
      SIZE_HA::DOUBLE AS hectares,
      CAUSE AS cause,
      FIRENAME AS place
    FROM read_ndjson_auto('${NFDB_RAW_PATH}')
    WHERE YEAR IS NOT NULL AND LATITUDE IS NOT NULL AND LONGITUDE IS NOT NULL
      AND MONTH::INTEGER BETWEEN 1 AND 12 AND DAY::INTEGER BETWEEN 1 AND 31
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
      SELECT fire_number, province, ignition_date::VARCHAR AS date, lat, lon, hectares, cause, place
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
    note: "National Fire Database coverage outside BC currently extends to 2023 and lags the current season by roughly 1-2 years; BC's own dataset is more current and complete for BC.",
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
