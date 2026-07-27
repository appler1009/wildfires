// Pulls Canada-wide historical fire points (all provinces/territories except
// BC, which is covered more completely and further back by BC's own
// historical incidents dataset - see fetch-fire-points.ts) from the National
// Fire Database.
//
// Source: Natural Resources Canada / CWFIS - NFDB_point
// Licence: Open Government Licence - Canada
// Note: NFDB is a compiled national dataset and lags behind the current
// season by roughly 1-2 years; it is not a substitute for near-real-time data.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const WFS_BASE = "https://cwfis.cfs.nrcan.gc.ca/geoserver/public/ows";
const TYPE_NAME = "public:NFDB_point";
const PROPERTIES = [
  "FIRE_ID",
  "SRC_AGENCY",
  "FIRENAME",
  "LATITUDE",
  "LONGITUDE",
  "YEAR",
  "MONTH",
  "DAY",
  "SIZE_HA",
  "CAUSE",
];
const PAGE_SIZE = 10_000;

const OUTPUT_PATH = path.join(import.meta.dirname, "../../data/raw/nfdb-points.ndjson");

type WfsFeature = { properties: Record<string, string | number | null> };
type WfsResponse = { features: WfsFeature[]; totalFeatures: number; numberReturned: number };

async function fetchPage(startIndex: number): Promise<WfsResponse> {
  const url = new URL(WFS_BASE);
  url.search = new URLSearchParams({
    service: "WFS",
    version: "2.0.0",
    request: "GetFeature",
    typeName: TYPE_NAME,
    outputFormat: "json",
    propertyName: PROPERTIES.join(","),
    CQL_FILTER: "SRC_AGENCY<>'BC'",
    count: String(PAGE_SIZE),
    startIndex: String(startIndex),
  }).toString();

  const res = await fetch(url);
  if (!res.ok) throw new Error(`WFS request failed (${res.status}): ${url}`);
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
    for (const feature of page.features) rows.push(JSON.stringify(feature.properties));
    startIndex += page.numberReturned;
    console.log(`Fetched ${startIndex}/${total} NFDB (non-BC) fire records`);
    if (page.numberReturned === 0) break;
  }

  await writeFile(OUTPUT_PATH, rows.join("\n") + "\n", "utf-8");
  console.log(`Wrote ${rows.length} records to ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
