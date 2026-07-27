// Pulls the BC historical fire perimeters dataset (attributes only, no geometry)
// from the DataBC WFS service and caches it locally as newline-delimited JSON.
//
// Source: WHSE_LAND_AND_NATURAL_RESOURCE.PROT_HISTORICAL_FIRE_POLYS_SP
// Licence: Open Government Licence - British Columbia
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const WFS_BASE =
  "https://openmaps.gov.bc.ca/geo/pub/WHSE_LAND_AND_NATURAL_RESOURCE.PROT_HISTORICAL_FIRE_POLYS_SP/ows";
const TYPE_NAME = "pub:WHSE_LAND_AND_NATURAL_RESOURCE.PROT_HISTORICAL_FIRE_POLYS_SP";
const PROPERTIES = ["FIRE_YEAR", "FIRE_SIZE_HECTARES", "FIRE_CAUSE", "FIRE_NUMBER"];
const PAGE_SIZE = 10_000; // server-enforced max per request

const OUTPUT_PATH = path.join(
  import.meta.dirname,
  "../../data/raw/historical-fire-perimeters.ndjson",
);

type WfsFeature = {
  properties: Record<string, string | number | null>;
};

type WfsResponse = {
  features: WfsFeature[];
  totalFeatures: number;
  numberReturned: number;
};

async function fetchPage(startIndex: number): Promise<WfsResponse> {
  const url = new URL(WFS_BASE);
  url.search = new URLSearchParams({
    service: "WFS",
    version: "2.0.0",
    request: "GetFeature",
    typeName: TYPE_NAME,
    outputFormat: "json",
    propertyName: PROPERTIES.join(","),
    count: String(PAGE_SIZE),
    startIndex: String(startIndex),
  }).toString();

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`WFS request failed (${res.status}): ${url}`);
  }
  return res.json() as Promise<WfsResponse>;
}

async function main() {
  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });

  const rows: string[] = [];
  let startIndex = 0;
  let total = Infinity;

  while (startIndex < total) {
    const page = await fetchPage(startIndex);
    total = page.totalFeatures;

    for (const feature of page.features) {
      rows.push(JSON.stringify(feature.properties));
    }

    startIndex += page.numberReturned;
    console.log(`Fetched ${startIndex}/${total} historical fire records`);

    if (page.numberReturned === 0) break; // avoid infinite loop on unexpected response
  }

  await writeFile(OUTPUT_PATH, rows.join("\n") + "\n", "utf-8");
  console.log(`Wrote ${rows.length} records to ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
