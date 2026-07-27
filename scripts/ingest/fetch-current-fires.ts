// Pulls the current-season fire perimeters (small dataset, refreshed ~15 min
// by BCWS) and reduces each polygon to an area-weighted centroid point for
// the map's live-fire overlay. This is BC's own richer, status-labeled feed;
// the rest of Canada's live/daily view comes from CWFIS hotspots (see
// fetch-cwfis-hotspots.ts / build-daily-clusters.ts), which also covers BC
// retroactively - this script only needs to produce "today".
//
// Source: WHSE_LAND_AND_NATURAL_RESOURCE.PROT_CURRENT_FIRE_POLYS_SP
// Licence: Open Government Licence - British Columbia
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { centroidOfRings, exteriorRingsFromGeoJson } from "./lib/geometry";

const WFS_URL =
  "https://openmaps.gov.bc.ca/geo/pub/WHSE_LAND_AND_NATURAL_RESOURCE.PROT_CURRENT_FIRE_POLYS_SP/ows?" +
  new URLSearchParams({
    service: "WFS",
    version: "2.0.0",
    request: "GetFeature",
    typeName: "pub:WHSE_LAND_AND_NATURAL_RESOURCE.PROT_CURRENT_FIRE_POLYS_SP",
    outputFormat: "json",
    srsName: "EPSG:4326",
  }).toString();

const OUTPUT_PATH = path.join(import.meta.dirname, "../../public/data/fires/current.json");

async function main() {
  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });

  const res = await fetch(WFS_URL);
  if (!res.ok) throw new Error(`WFS request failed (${res.status})`);
  const data = (await res.json()) as {
    features: {
      geometry: { type: string; coordinates: unknown };
      properties: Record<string, string | number | null>;
    }[];
  };

  const points = data.features
    .filter((f) => f.geometry)
    .map((f) => {
      const { lat, lon } = centroidOfRings(exteriorRingsFromGeoJson(f.geometry));
      return {
        fireNumber: f.properties.FIRE_NUMBER,
        year: f.properties.FIRE_YEAR,
        hectares: f.properties.FIRE_SIZE_HECTARES,
        status: f.properties.FIRE_STATUS,
        trackDate: f.properties.TRACK_DATE,
        url: f.properties.FIRE_URL,
        lat,
        lon,
      };
    });

  const output = {
    source:
      "BC Data Catalogue - Current Fire Perimeters (WHSE_LAND_AND_NATURAL_RESOURCE.PROT_CURRENT_FIRE_POLYS_SP)",
    licence: "Open Government Licence - British Columbia",
    kind: "operational_live_reference" as const,
    note: "Points are area-weighted centroids of the published fire perimeter, not the exact incident location. Refresh cadence and accuracy are per BC Wildfire Service's public disclaimer.",
    generatedAt: new Date().toISOString(),
    points,
  };

  await writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2) + "\n", "utf-8");
  console.log(`Wrote ${points.length} current fire points to ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
