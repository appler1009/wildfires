"use client";

import { useMap } from "react-leaflet";

// A child of MapContainer (needs useMap()) rendered as a plain absolute
// overlay rather than a Leaflet control, so it can share the app's own
// button styling instead of Leaflet's default control chrome.
export function MapResetButton({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();

  return (
    <button
      type="button"
      onClick={() => map.setView(center, zoom, { animate: true })}
      title="Reset map view"
      aria-label="Reset map view"
      className="ember-glow label pointer-events-auto absolute top-14 left-2.5 z-[1000] flex h-[26px] w-[26px] items-center justify-center border border-[var(--border-strong)] bg-[var(--surface)] text-[var(--ink-muted)] hover:border-[var(--ember)] hover:text-[var(--ember)]"
    >
      <span aria-hidden="true">⟲</span>
    </button>
  );
}
