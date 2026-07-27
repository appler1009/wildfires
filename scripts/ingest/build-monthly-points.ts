// Splits the cached historical fire points (BC + Ontario's own datasets,
// National Fire Database for the rest of Canada) into one JSON file per
// year-month (under public/data/fires/) so the map only fetches the month
// the user is actually viewing, plus an index of which months have data.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { DuckDBInstance } from "@duckdb/node-api";

const BC_RAW_PATH = path.join(import.meta.dirname, "../../data/raw/historical-fire-points.ndjson");
const ON_RAW_PATH = path.join(import.meta.dirname, "../../data/raw/on-historical-points.ndjson");
const NFDB_RAW_PATH = path.join(import.meta.dirname, "../../data/raw/nfdb-points.ndjson");
const OUTPUT_DIR = path.join(import.meta.dirname, "../../public/data/fires");

const SOURCE =
  "BC Data Catalogue (BC), Ontario GeoHub / LIO (Ontario), National Fire Database (rest of Canada, Natural Resources Canada / CWFIS)";
const LICENCE =
  "Open Government Licence - British Columbia / Open Government Licence - Ontario / Open Government Licence - Canada";

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });

  const instance = await DuckDBInstance.create(":memory:");
  const connection = await instance.connect();

  // DISTINCT on the whole union: some sources carry near-duplicate records
  // for the same fire (differing only in fields we don't display, e.g. a
  // BC point re-surveyed under a different internal object ID) - deduping
  // on exactly the fields we show keeps the per-month fire count (which
  // surfaces in the UI) and the per-file point list consistent, without
  // risking collapsing genuinely distinct fires the way deduping on a
  // narrower key (like just year+hectares) could.
  await connection.run(`
    CREATE TABLE points AS
    SELECT DISTINCT * FROM (
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
        FIRE_DISTURBANCE_AREA_IDENT AS fire_number,
        'ON' AS province,
        FIRE_YEAR::INTEGER AS fire_year,
        EPOCH_MS(FIRE_START_DATE::BIGINT)::DATE AS ignition_date,
        LATITUDE::DOUBLE AS lat,
        LONGITUDE::DOUBLE AS lon,
        FIRE_FINAL_SIZE::DOUBLE AS hectares,
        FIRE_GENERAL_CAUSE_CODE AS cause,
        NULL AS place
      FROM read_ndjson_auto('${ON_RAW_PATH}')
      WHERE FIRE_YEAR IS NOT NULL AND LATITUDE IS NOT NULL AND LONGITUDE IS NOT NULL
        AND FIRE_START_DATE IS NOT NULL
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
    )
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

    // points is already deduplicated (see above); the full tiebreaker chain
    // here just makes row order deterministic across runs (ORDER BY over a
    // non-unique key isn't guaranteed stable), so re-running with unchanged
    // input doesn't produce a spurious diff.
    const cellResult = await connection.runAndReadAll(`
      SELECT fire_number, province, ignition_date::VARCHAR AS date, lat, lon, hectares, cause, place
      FROM points
      WHERE fire_year = ${year} AND MONTH(ignition_date) = ${month}
      ORDER BY
        hectares DESC NULLS LAST, fire_number, province, date, lat, lon, cause, place
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
    note: "National Fire Database coverage outside BC/Ontario currently extends to 2023 and lags the current season by roughly 1-2 years; BC's and Ontario's own datasets are more current and complete for those provinces.",
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
