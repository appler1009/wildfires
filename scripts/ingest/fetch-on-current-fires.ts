// Pulls Ontario's current-season fire perimeters and reduces each polygon to
// an area-weighted centroid point, mirroring BC's own live feed
// (fetch-current-fires.ts). STATUS is a single-letter code ('F'/'I' observed)
// that Ontario doesn't publish a decoded domain for in this service - treated
// here as F = active, I = inactive, a reasonable but unconfirmed reading.
//
// Source: Ontario GeoHub / LIO - In-year Fire Perimeters (LIO_Open09 layer 51)
// Licence: Open Government Licence - Ontario
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { centroidOfRings } from "./lib/geometry";

const QUERY_URL =
  "https://ws.lioservices.lrc.gov.on.ca/arcgis2/rest/services/LIO_OPEN_DATA/LIO_Open09/MapServer/51/query?" +
  new URLSearchParams({
    where: "1=1",
    outFields: "FIRENUMB,CUR_SIZE,STATUS,DATE_MAPPED",
    outSR: "4326",
    f: "json",
  }).toString();

const OUTPUT_PATH = path.join(import.meta.dirname, "../../public/data/fires/on-current.json");

type EsriFeature = {
  attributes: Record<string, string | number | null>;
  geometry?: { rings: [number, number][][] };
};

async function main() {
  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });

  const res = await fetch(QUERY_URL);
  if (!res.ok) throw new Error(`ArcGIS query failed (${res.status})`);
  const data = (await res.json()) as { features: EsriFeature[] };

  const points = data.features
    .filter((f) => f.geometry?.rings?.length)
    .map((f) => {
      const { lat, lon } = centroidOfRings(f.geometry!.rings);
      const dateMapped = f.attributes.DATE_MAPPED;
      return {
        fireNumber: f.attributes.FIRENUMB,
        hectares: f.attributes.CUR_SIZE,
        status: f.attributes.STATUS,
        dateMapped: typeof dateMapped === "number" ? new Date(dateMapped).toISOString() : null,
        lat,
        lon,
      };
    });

  const output = {
    source: "Ontario GeoHub / LIO - In-year Fire Perimeters (LIO_Open09, layer 51)",
    licence: "Open Government Licence - Ontario",
    kind: "operational_live_reference" as const,
    note: "Points are area-weighted centroids of the published fire perimeter, not the exact incident location. Status code meaning (F/I) is an inferred reading, not from a published domain.",
    generatedAt: new Date().toISOString(),
    points,
  };

  await writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2) + "\n", "utf-8");
  console.log(`Wrote ${points.length} Ontario current fire points to ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
