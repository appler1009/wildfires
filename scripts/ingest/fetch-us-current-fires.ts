// Pulls current US wildland fire incidents from NIFC/WFIGS (via Esri Living
// Atlas' public mirror, no auth token required), filtered to the 13 US
// states/territories that border Canada. Gives lat/lon and PercentContained
// directly - no polygon-centroid math, similar to Quebec's SOPFEU feed.
//
// Source: National Interagency Fire Center (NIFC) / WFIGS, via Esri Living
// Atlas (USA_Wildfires_v1, Current_Incidents layer)
// Licence: US federal government work - public domain (17 U.S.C. SS 105)
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const QUERY_URL =
  "https://services9.arcgis.com/RHVPKKiFTONKtxq3/arcgis/rest/services/USA_Wildfires_v1/FeatureServer/0/query";

// The 13 US states/territories bordering Canada, in NIFC's "US-XX" POOState format.
const BORDER_STATES = [
  "AK", "WA", "ID", "MT", "ND", "MN", "MI", "OH", "PA", "NY", "VT", "NH", "ME",
].map((s) => `'US-${s}'`);

const OUTPUT_PATH = path.join(import.meta.dirname, "../../public/data/fires/us-current.json");

type NifcFeature = {
  attributes: {
    IncidentName: string | null;
    UniqueFireIdentifier: string | null;
    DailyAcres: number | null;
    PercentContained: number | null;
    FireCause: string | null;
    POOState: string | null;
    FireDiscoveryDateTime: number | null;
  };
  geometry?: { x: number; y: number };
};

async function main() {
  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });

  const params = new URLSearchParams({
    where: `POOState IN (${BORDER_STATES.join(",")})`,
    outFields:
      "IncidentName,UniqueFireIdentifier,DailyAcres,PercentContained,FireCause,POOState,FireDiscoveryDateTime",
    f: "json",
    returnGeometry: "true",
    resultRecordCount: "2000",
  });

  const res = await fetch(`${QUERY_URL}?${params.toString()}`);
  if (!res.ok) throw new Error(`NIFC query failed (${res.status})`);
  const data = (await res.json()) as { features: NifcFeature[] };

  const points = data.features
    .filter((f) => f.geometry)
    .map((f) => ({
      fireNumber: f.attributes.UniqueFireIdentifier,
      name: f.attributes.IncidentName,
      state: f.attributes.POOState?.replace("US-", "") ?? null,
      hectares:
        f.attributes.DailyAcres != null ? Math.round(f.attributes.DailyAcres * 0.4047 * 10) / 10 : null,
      percentContained: f.attributes.PercentContained,
      cause: f.attributes.FireCause,
      discoveryDate: f.attributes.FireDiscoveryDateTime
        ? new Date(f.attributes.FireDiscoveryDateTime).toISOString()
        : null,
      lat: f.geometry!.y,
      lon: f.geometry!.x,
    }));

  const output = {
    source: "National Interagency Fire Center (NIFC) / WFIGS, via Esri Living Atlas",
    licence: "US federal government work - public domain (17 U.S.C. §105)",
    kind: "operational_live_reference" as const,
    note: "Limited to the 13 US states/territories bordering Canada. Percent-contained is NIFC's own containment metric, not a status code.",
    generatedAt: new Date().toISOString(),
    points,
  };

  await writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2) + "\n", "utf-8");
  console.log(`Wrote ${points.length} US border-state fire points to ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
