// Pulls satellite-detected fire hotspots (VIIRS/MODIS) for Canada plus the
// 13 US states/territories that share the Canada-US border, over a rolling
// window, from the Canadian Wildland Fire Information System. Unlike
// provincial "current fires" feeds, this updates continuously regardless of
// season status, so it's the only source that gives real day-by-day
// granularity for the current season - and it already carries continental
// (not just Canadian) coverage, so the border states cost nothing extra to
// add beyond widening this allowlist.
//
// Incremental: re-fetching the full 365-day window every run was the single
// most expensive step in the pipeline (many chunked requests against a
// server that already needs retry/split handling - see below). Instead this
// keeps the existing cache and only re-fetches a short overlap window at the
// tail (hotspot records for a date can keep trickling in for a day or two
// after, from later satellite passes/reprocessing), then prunes anything
// that's aged out of the 365-day window. First run (no cache yet) still
// does the full fetch.
//
// Fetched in date-range chunks, splitting recursively on timeout: the server
// is fast for small/recent ranges but can 504 on larger or denser (peak fire
// season) ranges regardless of season age - there's no reliable fixed chunk
// size that avoids this, so chunks that time out are halved and retried
// down to a 1-day floor, which is skipped (not failed) if it still times out.
//
// Source: Natural Resources Canada / CWFIS - hotspots
// Licence: Open Government Licence - Canada
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const WFS_BASE = "https://cwfis.cfs.nrcan.gc.ca/geoserver/public/ows";
const TYPE_NAME = "public:hotspots";
const PROPERTIES = ["lat", "lon", "rep_day", "agency", "estarea", "frp"];
const PAGE_SIZE = 10_000;
const LOOKBACK_DAYS = 365;
const OVERLAP_DAYS = 3; // re-pull this many days before the cached max, for late-arriving corrections
const INITIAL_CHUNK_DAYS = 7;
const REQUEST_TIMEOUT_MS = 25_000;

const CANADIAN_AGENCIES = [
  "AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PC", "PE", "QC", "SK", "YT",
];

// The 13 US states touching the Canadian border (land or Great Lakes/Bay of
// Fundy shoreline): AK, WA, ID, MT, ND, MN, MI, OH, PA, NY, VT, NH, ME.
const US_BORDER_STATES = [
  "AK", "WA", "ID", "MT", "ND", "MN", "MI", "OH", "PA", "NY", "VT", "NH", "ME",
];

const AGENCIES = [...CANADIAN_AGENCIES, ...US_BORDER_STATES];

const OUTPUT_PATH = path.join(import.meta.dirname, "../../data/raw/cwfis-hotspots.ndjson");

type WfsFeature = { properties: Record<string, string | number | null> };
type WfsResponse = { features: WfsFeature[]; totalFeatures: number; numberReturned: number };

function toIso(date: Date) {
  return date.toISOString().slice(0, 10);
}

async function fetchPage(
  startIndex: number,
  fromIso: string,
  toIsoExclusive: string,
): Promise<WfsResponse> {
  const agencyList = AGENCIES.map((a) => `'${a}'`).join(",");
  const params: Record<string, string> = {
    service: "WFS",
    version: "2.0.0",
    request: "GetFeature",
    typeName: TYPE_NAME,
    outputFormat: "json",
    propertyName: PROPERTIES.join(","),
    CQL_FILTER: `agency IN (${agencyList}) AND rep_day >= '${fromIso}' AND rep_day < '${toIsoExclusive}'`,
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

  const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`WFS request failed (${res.status})`);
  return res.json() as Promise<WfsResponse>;
}

async function fetchChunk(fromIso: string, toIsoExclusive: string): Promise<string[]> {
  const rows: string[] = [];
  let startIndex = 0;
  let total = Infinity;

  while (startIndex < total) {
    const page = await fetchPage(startIndex, fromIso, toIsoExclusive);
    total = page.totalFeatures;
    for (const feature of page.features) rows.push(JSON.stringify(feature.properties));
    startIndex += page.numberReturned;
    if (page.numberReturned === 0) break;
  }
  return rows;
}

// Fetches [from, to), halving on timeout down to a 1-day floor (skipped, not
// failed, if even that times out - logged so gaps are visible, not silent).
async function fetchRangeResilient(from: Date, to: Date): Promise<string[]> {
  const spanDays = Math.round((to.getTime() - from.getTime()) / 86400000);
  const fromIso = toIso(from);
  const toIsoExclusive = toIso(to);

  try {
    const rows = await fetchChunk(fromIso, toIsoExclusive);
    console.log(`  ${fromIso}..${toIsoExclusive}: ${rows.length} hotspots`);
    return rows;
  } catch (err) {
    if (spanDays <= 1) {
      console.warn(`  ${fromIso}..${toIsoExclusive}: skipped (still failing at 1-day floor: ${err})`);
      return [];
    }
    const mid = new Date(from.getTime() + Math.floor(spanDays / 2) * 86400000);
    console.warn(`  ${fromIso}..${toIsoExclusive}: timed out, splitting at ${toIso(mid)}`);
    const [first, second] = await Promise.all([
      fetchRangeResilient(from, mid),
      fetchRangeResilient(mid, to),
    ]);
    return [...first, ...second];
  }
}

async function loadExisting(): Promise<string[]> {
  try {
    const raw = await readFile(OUTPUT_PATH, "utf-8");
    return raw.split("\n").filter((line) => line.trim().length > 0);
  } catch {
    return []; // no cache yet - first run does the full fetch
  }
}

function repDay(line: string): string {
  return String((JSON.parse(line) as { rep_day: string }).rep_day).slice(0, 10);
}

async function main() {
  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });

  const windowEnd = new Date();
  const windowStart = new Date(windowEnd.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const windowStartIso = toIso(windowStart);

  const existing = await loadExisting();
  const existingMaxDay = existing.reduce<string | null>((max, line) => {
    const day = repDay(line);
    return !max || day > max ? day : max;
  }, null);

  // Re-fetch only the overlap tail if we already have a cache; otherwise
  // (first run) fetch the whole rolling window.
  let fetchFrom = windowStart;
  if (existingMaxDay) {
    const resumeFrom = new Date(new Date(existingMaxDay).getTime() - OVERLAP_DAYS * 86400000);
    fetchFrom = resumeFrom > windowStart ? resumeFrom : windowStart;
  }
  const fetchFromIso = toIso(fetchFrom);

  console.log(
    existingMaxDay
      ? `Cache has data through ${existingMaxDay} - fetching from ${fetchFromIso} (incremental)`
      : `No cache found - fetching the full ${LOOKBACK_DAYS}-day window`,
  );

  const fetchedRows: string[] = [];
  let cursor = new Date(fetchFrom);
  while (cursor < windowEnd) {
    const chunkEnd = new Date(
      Math.min(cursor.getTime() + INITIAL_CHUNK_DAYS * 86400000, windowEnd.getTime()),
    );
    const chunkRows = await fetchRangeResilient(cursor, chunkEnd);
    for (const row of chunkRows) fetchedRows.push(row);
    cursor = chunkEnd;
  }

  // Keep existing rows outside the refetched range and inside the rolling
  // window; drop everything else (superseded by the fresh fetch, or aged out).
  const keptExisting = existing.filter((line) => {
    const day = repDay(line);
    return day >= windowStartIso && day < fetchFromIso;
  });

  const rows = [...keptExisting, ...fetchedRows];
  await writeFile(OUTPUT_PATH, rows.join("\n") + "\n", "utf-8");
  console.log(
    `Wrote ${rows.length} records to ${OUTPUT_PATH} (${keptExisting.length} kept, ${fetchedRows.length} fetched)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
