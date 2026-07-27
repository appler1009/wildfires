// Pulls BC historical fire incident points (actual fires only, not smoke
// chases/nuisance calls) from the DataBC WFS and caches them as ndjson.
//
// Source: WHSE_LAND_AND_NATURAL_RESOURCE.PROT_HISTORICAL_INCIDENTS_SP
// Licence: Open Government Licence - British Columbia
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const WFS_BASE =
  "https://openmaps.gov.bc.ca/geo/pub/WHSE_LAND_AND_NATURAL_RESOURCE.PROT_HISTORICAL_INCIDENTS_SP/ows";
const TYPE_NAME = "pub:WHSE_LAND_AND_NATURAL_RESOURCE.PROT_HISTORICAL_INCIDENTS_SP";
const PROPERTIES = [
  "FIRE_NUMBER",
  "FIRE_YEAR",
  "IGNITION_DATE",
  "LATITUDE",
  "LONGITUDE",
  "CURRENT_SIZE",
  "FIRE_CAUSE",
  "GEOGRAPHIC_DESCRIPTION",
];
const PAGE_SIZE = 10_000; // server-enforced max per request

const OUTPUT_PATH = path.join(
  import.meta.dirname,
  "../../data/raw/historical-fire-points.ndjson",
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
    // FIRE_TYPE='Fire' excludes suspected fires, nuisance fires, and smoke
    // chases that are also tracked in this incident dataset.
    CQL_FILTER: "FIRE_TYPE='Fire'",
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
    console.log(`Fetched ${startIndex}/${total} fire incident points`);

    if (page.numberReturned === 0) break;
  }

  await writeFile(OUTPUT_PATH, rows.join("\n") + "\n", "utf-8");
  console.log(`Wrote ${rows.length} records to ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
