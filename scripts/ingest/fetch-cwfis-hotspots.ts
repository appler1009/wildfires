// Pulls satellite-detected fire hotspots (VIIRS/MODIS) for all Canadian
// provinces/territories over a rolling window, from the Canadian Wildland
// Fire Information System. Unlike provincial "current fires" feeds, this
// updates continuously regardless of season status, so it's the only source
// that gives real day-by-day granularity for the current season.
//
// Source: Natural Resources Canada / CWFIS - hotspots
// Licence: Open Government Licence - Canada
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const WFS_BASE = "https://cwfis.cfs.nrcan.gc.ca/geoserver/public/ows";
const TYPE_NAME = "public:hotspots";
const PROPERTIES = ["lat", "lon", "rep_day", "agency", "estarea", "frp"];
const PAGE_SIZE = 10_000;
const LOOKBACK_DAYS = 35; // >30 to comfortably cover a 30-day rolling daily view

// Canadian provinces/territories only - CWFIS hotspots also cover the
// continental US, which this app is not scoped to.
const CANADIAN_AGENCIES = [
  "AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PC", "PE", "QC", "SK", "YT",
];

const OUTPUT_PATH = path.join(import.meta.dirname, "../../data/raw/cwfis-hotspots.ndjson");

type WfsFeature = { properties: Record<string, string | number | null> };
type WfsResponse = { features: WfsFeature[]; totalFeatures: number; numberReturned: number };

async function fetchPage(startIndex: number, sinceIso: string): Promise<WfsResponse> {
  const agencyList = CANADIAN_AGENCIES.map((a) => `'${a}'`).join(",");
  const params: Record<string, string> = {
    service: "WFS",
    version: "2.0.0",
    request: "GetFeature",
    typeName: TYPE_NAME,
    outputFormat: "json",
    propertyName: PROPERTIES.join(","),
    CQL_FILTER: `agency IN (${agencyList}) AND rep_day >= '${sinceIso}'`,
    sortBy: "uid",
    count: String(PAGE_SIZE),
    startIndex: String(startIndex),
  };
  // GeoServer's CQL parser rejects "+"-encoded spaces (URLSearchParams' default);
  // encodeURIComponent uses %20, which it accepts.
  const query = Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");
  const url = `${WFS_BASE}?${query}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`WFS request failed (${res.status}): ${url}`);
  return res.json() as Promise<WfsResponse>;
}

async function main() {
  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });

  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const sinceIso = since.toISOString().slice(0, 10);

  const rows: string[] = [];
  let startIndex = 0;
  let total = Infinity;

  while (startIndex < total) {
    const page = await fetchPage(startIndex, sinceIso);
    total = page.totalFeatures;
    for (const feature of page.features) rows.push(JSON.stringify(feature.properties));
    startIndex += page.numberReturned;
    console.log(`Fetched ${startIndex}/${total} CWFIS hotspots (since ${sinceIso})`);
    if (page.numberReturned === 0) break;
  }

  await writeFile(OUTPUT_PATH, rows.join("\n") + "\n", "utf-8");
  console.log(`Wrote ${rows.length} records to ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
