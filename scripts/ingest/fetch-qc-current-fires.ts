// Pulls Quebec's current-season fires from the SOPFEU public API - unlike BC
// and Ontario, this gives lat/lon and a documented status directly (no
// polygon-centroid math, no guessing at status codes).
//
// Source: SOPFEU (Société de protection des forêts contre le feu) public API
// Licence: Creative Commons Attribution 4.0 International - Gouvernement du Québec
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const API_URL = "https://geofeux.sopfeu.qc.ca/sopfeu-api/public/feux";
const OUTPUT_PATH = path.join(import.meta.dirname, "../../public/data/fires/qc-current.json");

type SopfeuFire = {
  NoFeu: number;
  Annee: number;
  Designation: string | null;
  Condition: { Id: number; DescriptionEn: string | null } | null;
  Cause: { DescriptionEn: string | null } | null;
  SuperficieHa: number | null;
  DateDeDebut: string | null;
  Lat: number | null;
  Lon: number | null;
  EtatSituationUrl: string | null;
};

async function main() {
  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });

  const res = await fetch(API_URL);
  if (!res.ok) throw new Error(`SOPFEU API request failed (${res.status})`);
  const fires = (await res.json()) as SopfeuFire[];

  const points = fires
    .filter((f) => f.Lat != null && f.Lon != null)
    .map((f) => ({
      fireNumber: `QC-${f.NoFeu}`,
      name: f.Designation,
      hectares: f.SuperficieHa,
      status: f.Condition?.DescriptionEn ?? null,
      cause: f.Cause?.DescriptionEn ?? null,
      startDate: f.DateDeDebut,
      url: f.EtatSituationUrl,
      lat: f.Lat,
      lon: f.Lon,
    }));

  const output = {
    source: "SOPFEU public API (public/feux)",
    licence: "Creative Commons Attribution 4.0 International - Gouvernement du Québec",
    kind: "operational_live_reference" as const,
    note: "Point of origin, not a perimeter centroid. Condition codes are SOPFEU's own documented stages, not inferred.",
    generatedAt: new Date().toISOString(),
    points,
  };

  await writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2) + "\n", "utf-8");
  console.log(`Wrote ${points.length} Quebec current fire points to ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
