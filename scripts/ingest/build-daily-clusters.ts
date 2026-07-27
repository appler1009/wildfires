// Grid-clusters raw satellite hotspot pixels (many per real fire) into a
// coarser per-day, per-cell marker set, and writes one JSON file per day
// under public/data/fires/daily/ - this is the real (not accumulated-only)
// day-by-day view for the current season, across Canada and the US border
// states, since CWFIS hotspots are the only source with genuine daily
// granularity for fires that haven't finished their season yet.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { DuckDBInstance } from "@duckdb/node-api";

const RAW_PATH = path.join(import.meta.dirname, "../../data/raw/cwfis-hotspots.ndjson");
const OUTPUT_DIR = path.join(import.meta.dirname, "../../public/data/fires/daily");

const SOURCE = "Natural Resources Canada / CWFIS - satellite-detected hotspots (Canada + US border states)";
const LICENCE = "Open Government Licence - Canada";
const GRID_DEGREES = 0.1; // ~11km at BC's latitude, collapses pixel clusters into one marker

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });

  const instance = await DuckDBInstance.create(":memory:");
  const connection = await instance.connect();

  await connection.run(`
    CREATE TABLE hotspots AS
    SELECT
      agency AS province,
      rep_day::VARCHAR AS rep_day_str,
      lat::DOUBLE AS lat,
      lon::DOUBLE AS lon,
      estarea::DOUBLE AS estarea,
      frp::DOUBLE AS frp,
      ROUND(lat::DOUBLE / ${GRID_DEGREES}) * ${GRID_DEGREES} AS cell_lat,
      ROUND(lon::DOUBLE / ${GRID_DEGREES}) * ${GRID_DEGREES} AS cell_lon
    FROM read_ndjson_auto('${RAW_PATH}')
    WHERE lat IS NOT NULL AND lon IS NOT NULL AND rep_day IS NOT NULL
  `);

  const daysResult = await connection.runAndReadAll(`
    SELECT SUBSTR(rep_day_str, 1, 10) AS date, COUNT(*)::INTEGER AS pixel_count
    FROM hotspots
    GROUP BY date
    ORDER BY date
  `);
  const days = daysResult.getRowObjectsJson() as { date: string; pixel_count: number }[];

  for (const { date } of days) {
    const cellsResult = await connection.runAndReadAll(`
      SELECT
        province,
        cell_lat AS lat,
        cell_lon AS lon,
        COUNT(*)::INTEGER AS pixel_count,
        ROUND(SUM(estarea), 1) AS estarea,
        ROUND(MAX(frp), 1) AS max_frp
      FROM hotspots
      WHERE SUBSTR(rep_day_str, 1, 10) = '${date}'
      GROUP BY province, cell_lat, cell_lon
      ORDER BY estarea DESC NULLS LAST, province, lat, lon
    `);
    const points = cellsResult.getRowObjectsJson();

    await writeFile(
      path.join(OUTPUT_DIR, `${date}.json`),
      JSON.stringify({ date, points }),
      "utf-8",
    );
  }

  const index = {
    source: SOURCE,
    licence: LICENCE,
    note: "Satellite hotspot detections grid-clustered to ~11km cells per day, across Canada and the 13 US states/territories bordering it. Reflects detected thermal activity, not official incident boundaries or status - cross-reference with the BC/Ontario/Quebec status layers where available.",
    generatedAt: new Date().toISOString(),
    days: days.map((d) => ({ date: d.date, count: d.pixel_count })),
  };

  await writeFile(
    path.join(OUTPUT_DIR, "index.json"),
    JSON.stringify(index, null, 2) + "\n",
    "utf-8",
  );

  console.log(`Wrote ${days.length} daily cluster files to public/data/fires/daily/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
