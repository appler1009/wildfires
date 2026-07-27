"use client";

import { useEffect, useState } from "react";
import { useMap } from "react-leaflet";

export type GlowPoint = { key: string; lat: number; lon: number; hectares: number; label: string };

// Renders a pulsing "danger halo" over the map's most severe active fires -
// a plain absolutely-positioned overlay (not a Leaflet vector layer) so it
// can use cheap CSS animation instead of per-frame canvas redraws. Projects
// lat/lon to container pixels itself and re-projects on pan/zoom/resize.
export function CriticalFireGlow({ points }: { points: GlowPoint[] }) {
  const map = useMap();
  const [positions, setPositions] = useState<{ key: string; x: number; y: number; label: string }[]>([]);

  useEffect(() => {
    function update() {
      setPositions(
        points.map((p) => {
          const pt = map.latLngToContainerPoint([p.lat, p.lon]);
          return { key: p.key, x: pt.x, y: pt.y, label: p.label };
        }),
      );
    }
    update();
    map.on("move", update);
    map.on("zoom", update);
    map.on("resize", update);
    return () => {
      map.off("move", update);
      map.off("zoom", update);
      map.off("resize", update);
    };
  }, [map, points]);

  if (points.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-[550]">
      {positions.map((p) => (
        <div
          key={p.key}
          className="critical-glow-ring absolute"
          style={{ left: p.x, top: p.y }}
          title={p.label}
        />
      ))}
    </div>
  );
}
