// Pulls the current-season fire perimeters (small dataset, refreshed ~15 min
// by BCWS) and reduces each polygon to an area-weighted centroid point for
// the map's live-fire overlay.
//
// Source: WHSE_LAND_AND_NATURAL_RESOURCE.PROT_CURRENT_FIRE_POLYS_SP
// Licence: Open Government Licence - British Columbia
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

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
const DAILY_DIR = path.join(import.meta.dirname, "../../public/data/fires/daily");

type Ring = [number, number][];

function ringCentroid(ring: Ring): { x: number; y: number; area: number } {
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[i + 1];
    const cross = x0 * y1 - x1 * y0;
    area += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  area /= 2;
  if (Math.abs(area) < 1e-12) {
    // degenerate ring: fall back to a plain vertex average
    const n = ring.length - 1;
    const avg = ring
      .slice(0, n)
      .reduce((acc, [x, y]) => [acc[0] + x / n, acc[1] + y / n], [0, 0]);
    return { x: avg[0], y: avg[1], area: 0 };
  }
  return { x: cx / (6 * area), y: cy / (6 * area), area: Math.abs(area) };
}

// Exterior ring only (ring[0]) per polygon; holes don't matter for a point pin.
function polygonCentroid(geometry: { type: string; coordinates: unknown }): {
  lat: number;
  lon: number;
} {
  const polygons: Ring[][] =
    geometry.type === "Polygon"
      ? [geometry.coordinates as Ring[]]
      : (geometry.coordinates as Ring[][]);

  let totalArea = 0;
  let sumX = 0;
  let sumY = 0;
  for (const poly of polygons) {
    const { x, y, area } = ringCentroid(poly[0]);
    const weight = area || 1;
    totalArea += weight;
    sumX += x * weight;
    sumY += y * weight;
  }
  return { lon: sumX / totalArea, lat: sumY / totalArea };
}

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
      const { lat, lon } = polygonCentroid(f.geometry);
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

  await writeDailySnapshot(output);
}

// Archives today's live snapshot so the map can offer daily (not just
// monthly) granularity going forward. There is no source for day-level
// history of the *current* season - BCWS only publishes day-dated records
// once a season is complete - so this only grows from the day this pipeline
// started running; it can't be backfilled.
async function writeDailySnapshot(output: {
  source: string;
  licence: string;
  generatedAt: string;
  points: unknown[];
}) {
  await mkdir(DAILY_DIR, { recursive: true });

  const today = new Date().toISOString().slice(0, 10); // UTC date
  await writeFile(
    path.join(DAILY_DIR, `${today}.json`),
    JSON.stringify({ ...output, date: today }, null, 2) + "\n",
    "utf-8",
  );

  const files = (await readdir(DAILY_DIR)).filter(
    (f) => f.endsWith(".json") && f !== "index.json",
  );
  const days = await Promise.all(
    files.map(async (f) => {
      const raw = JSON.parse(await readFile(path.join(DAILY_DIR, f), "utf-8")) as {
        date: string;
        points: unknown[];
      };
      return { date: raw.date, count: raw.points.length };
    }),
  );
  days.sort((a, b) => a.date.localeCompare(b.date));

  await writeFile(
    path.join(DAILY_DIR, "index.json"),
    JSON.stringify(
      {
        source: output.source,
        licence: output.licence,
        note: "Daily archive of the live current-fire snapshot, one entry per day this pipeline has run. Not a backfilled history.",
        days,
      },
      null,
      2,
    ) + "\n",
    "utf-8",
  );

  console.log(`Wrote daily snapshot for ${today} (${days.length} days archived total)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
