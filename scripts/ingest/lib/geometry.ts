// Shared polygon-centroid math for reducing fire perimeter geometry (BC's
// GeoJSON Polygon/MultiPolygon, Ontario's Esri rings) to a single point pin.

export type Ring = [number, number][];

export function ringCentroid(ring: Ring): { x: number; y: number; area: number } {
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

// Area-weighted centroid across a flat list of rings (Esri polygon format,
// or any set of exterior rings from a GeoJSON Polygon/MultiPolygon).
export function centroidOfRings(rings: Ring[]): { lat: number; lon: number } {
  let totalArea = 0;
  let sumX = 0;
  let sumY = 0;
  for (const ring of rings) {
    const { x, y, area } = ringCentroid(ring);
    const weight = area || 1;
    totalArea += weight;
    sumX += x * weight;
    sumY += y * weight;
  }
  return { lon: sumX / totalArea, lat: sumY / totalArea };
}

// GeoJSON Polygon/MultiPolygon -> exterior rings only (ring[0] per polygon).
export function exteriorRingsFromGeoJson(geometry: {
  type: string;
  coordinates: unknown;
}): Ring[] {
  const polygons: Ring[][] =
    geometry.type === "Polygon"
      ? [geometry.coordinates as Ring[]]
      : (geometry.coordinates as Ring[][]);
  return polygons.map((poly) => poly[0]);
}
