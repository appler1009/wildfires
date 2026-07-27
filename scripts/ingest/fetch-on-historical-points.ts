// Pulls Ontario's historical fire points (before the current season) from
// the LIO Fire Disturbance Point layer, which is more current than the
// National Fire Database (through last completed season, not lagging ~2
// years) so it's used in place of NFDB for Ontario specifically.
//
// Source: Ontario GeoHub / LIO - Fire Disturbance Point (LIO_Open09 layer 30)
// Licence: Open Government Licence - Ontario
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const QUERY_BASE = "https://ws.lioservices.lrc.gov.on.ca/arcgis2/rest/services/LIO_OPEN_DATA/LIO_Open09/MapServer/30/query";
const PAGE_SIZE = 2000; // service maxRecordCount
const OUTPUT_PATH = path.join(import.meta.dirname, "../../data/raw/on-historical-points.ndjson");

type EsriFeature = {
  attributes: Record<string, string | number | null>;
  geometry?: { x: number; y: number };
};

async function fetchPage(offset: number): Promise<EsriFeature[]> {
  const url =
    `${QUERY_BASE}?` +
    new URLSearchParams({
      where: "1=1",
      outFields:
        "FIRE_DISTURBANCE_AREA_IDENT,FIRE_YEAR,FIRE_START_DATE,FIRE_FINAL_SIZE,FIRE_GENERAL_CAUSE_CODE,FIRE_TYPE_CODE",
      outSR: "4326",
      f: "json",
      resultOffset: String(offset),
      resultRecordCount: String(PAGE_SIZE),
      orderByFields: "OBJECTID",
    }).toString();

  const res = await fetch(url);
  if (!res.ok) throw new Error(`ArcGIS query failed (${res.status})`);
  const data = (await res.json()) as { features: EsriFeature[] };
  return data.features;
}

async function main() {
  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });

  const rows: string[] = [];
  let offset = 0;

  while (true) {
    const features = await fetchPage(offset);
    for (const f of features) {
      if (!f.geometry) continue;
      rows.push(
        JSON.stringify({
          ...f.attributes,
          LATITUDE: f.geometry.y,
          LONGITUDE: f.geometry.x,
        }),
      );
    }
    offset += features.length;
    console.log(`Fetched ${offset} Ontario historical fire points`);
    if (features.length < PAGE_SIZE) break;
  }

  await writeFile(OUTPUT_PATH, rows.join("\n") + "\n", "utf-8");
  console.log(`Wrote ${rows.length} records to ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
