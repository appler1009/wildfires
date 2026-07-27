"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer } from "react-leaflet";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Status palette (dataviz skill, fixed/reserved — never reused for series identity).
const STATUS_COLOR: Record<string, string> = {
  Out: "#0ca30c",
  "Under Control": "#fab219",
  "Being Held": "#ec835a",
  "Out of Control": "#d03b3b",
  "Fire of Note": "#d03b3b",
};
const HISTORICAL_COLOR = "#2a78d6";

type IndexMonth = { year: number; month: number; count: number };
type IndexData = {
  source: string;
  licence: string;
  generatedAt: string;
  months: IndexMonth[];
};

type HistoricalPoint = {
  fire_number: string;
  date: string | null;
  lat: number;
  lon: number;
  hectares: number | null;
  cause: string | null;
  place: string | null;
};

type CurrentPoint = {
  fireNumber: string;
  year: number;
  hectares: number | null;
  status: string | null;
  trackDate: string | null;
  url: string | null;
  lat: number;
  lon: number;
};

type CurrentData = {
  source: string;
  licence: string;
  note: string;
  generatedAt: string;
  points: CurrentPoint[];
};

type Timeline =
  | { kind: "live"; label: string }
  | { kind: "historical"; year: number; month: number; count: number; label: string };

function radiusFor(hectares: number | null | undefined) {
  const h = hectares ?? 0;
  return Math.min(24, Math.max(4, Math.sqrt(h) * 0.35 + 4));
}

function formatNumber(n: number) {
  return new Intl.NumberFormat("en-CA").format(n);
}

export function FireMap() {
  const [index, setIndex] = useState<IndexData | null>(null);
  const [current, setCurrent] = useState<CurrentData | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [historicalPoints, setHistoricalPoints] = useState<HistoricalPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const cache = useRef(new Map<string, HistoricalPoint[]>());

  useEffect(() => {
    Promise.all([
      fetch("/data/fires/index.json").then((r) => r.json()),
      fetch("/data/fires/current.json").then((r) => r.json()),
    ]).then(([idx, cur]: [IndexData, CurrentData]) => {
      setIndex(idx);
      setCurrent(cur);
    });
  }, []);

  const timeline: Timeline[] = useMemo(() => {
    const months: Timeline[] = (index?.months ?? []).map((m) => ({
      kind: "historical",
      year: m.year,
      month: m.month,
      count: m.count,
      label: `${MONTH_NAMES[m.month - 1]} ${m.year}`,
    }));
    if (current && current.points.length > 0) {
      months.push({ kind: "live", label: "Live — now" });
    }
    return months;
  }, [index, current]);

  // Default to "live" (last entry) once data loads, unless the user already picked something.
  const effectiveSelected = selected ?? Math.max(0, timeline.length - 1);
  const activeEntry = timeline[effectiveSelected];

  useEffect(() => {
    if (!activeEntry || activeEntry.kind !== "historical") return;
    const monthStr = String(activeEntry.month).padStart(2, "0");
    const key = `${activeEntry.year}-${monthStr}`;
    const cached = cache.current.get(key);
    if (cached) {
      setHistoricalPoints(cached);
      return;
    }
    setLoading(true);
    fetch(`/data/fires/${key}.json`)
      .then((r) => r.json())
      .then((data: { points: HistoricalPoint[] }) => {
        cache.current.set(key, data.points);
        setHistoricalPoints(data.points);
      })
      .finally(() => setLoading(false));
  }, [activeEntry]);

  const isLive = activeEntry?.kind === "live";
  const points = isLive ? [] : historicalPoints;

  function step(delta: number) {
    setSelected(Math.min(timeline.length - 1, Math.max(0, effectiveSelected + delta)));
  }

  return (
    <div className="flex h-screen flex-col">
      <div className="relative flex-1">
        <MapContainer
          center={[54.5, -125]}
          zoom={5}
          preferCanvas
          style={{ height: "100%", width: "100%" }}
          className="bg-zinc-100 dark:bg-zinc-900"
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          />
          {isLive &&
            current?.points.map((p) => (
              <CircleMarker
                key={p.fireNumber}
                center={[p.lat, p.lon]}
                radius={radiusFor(p.hectares)}
                pathOptions={{
                  color: "#ffffff",
                  weight: 1,
                  fillColor: STATUS_COLOR[p.status ?? ""] ?? "#898781",
                  fillOpacity: 0.85,
                }}
              >
                <Popup>
                  <div className="flex flex-col gap-1 text-sm">
                    <strong>{p.fireNumber}</strong>
                    <span>Status: {p.status ?? "Unknown"}</span>
                    <span>{formatNumber(p.hectares ?? 0)} ha</span>
                    {p.url && (
                      <a
                        href={p.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-orange-700 underline"
                      >
                        Official incident page
                      </a>
                    )}
                  </div>
                </Popup>
              </CircleMarker>
            ))}
          {!isLive &&
            points.map((p, i) => (
              <CircleMarker
                key={`${p.fire_number}-${i}`}
                center={[p.lat, p.lon]}
                radius={radiusFor(p.hectares)}
                pathOptions={{
                  color: "#ffffff",
                  weight: 1,
                  fillColor: HISTORICAL_COLOR,
                  fillOpacity: 0.7,
                }}
              >
                <Popup>
                  <div className="flex flex-col gap-1 text-sm">
                    <strong>{p.fire_number}</strong>
                    {p.place && <span>{p.place}</span>}
                    <span>{p.date ?? "Unknown date"}</span>
                    <span>{formatNumber(p.hectares ?? 0)} ha · {p.cause ?? "Unknown cause"}</span>
                  </div>
                </Popup>
              </CircleMarker>
            ))}
        </MapContainer>

        <div className="pointer-events-none absolute bottom-4 left-4 z-[1000] flex flex-col gap-2">
          <span
            className={`pointer-events-auto w-fit rounded-full px-3 py-1 text-xs font-medium ${
              isLive
                ? "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-300"
                : "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300"
            }`}
          >
            {isLive ? "Live operational status" : "Historical summary"}
          </span>
          <div className="pointer-events-auto flex flex-col gap-1 rounded-lg border border-zinc-200 bg-white/95 px-3 py-2 text-[11px] text-zinc-600 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95 dark:text-zinc-400">
            {isLive ? (
              <>
                <LegendDot color={STATUS_COLOR["Out of Control"]} label="Out of control" />
                <LegendDot color={STATUS_COLOR["Being Held"]} label="Being held" />
                <LegendDot color={STATUS_COLOR["Under Control"]} label="Under control" />
                <LegendDot color={STATUS_COLOR["Out"]} label="Out" />
              </>
            ) : (
              <LegendDot color={HISTORICAL_COLOR} label="Recorded fire location" />
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950 sm:px-8">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-semibold text-black dark:text-zinc-50">
              {activeEntry?.label ?? "Loading…"}
            </span>
            {!isLive && activeEntry?.kind === "historical" && (
              <span className="text-xs text-zinc-500 dark:text-zinc-500">
                {formatNumber(activeEntry.count)} fires{loading ? " · loading…" : ""}
              </span>
            )}
            {isLive && current && (
              <span className="text-xs text-zinc-500 dark:text-zinc-500">
                {formatNumber(current.points.length)} active/recent fires
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => step(-1)}
              disabled={effectiveSelected <= 0}
              className="rounded-md border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-700 disabled:opacity-30 dark:border-zinc-700 dark:text-zinc-300"
            >
              ← Prev
            </button>
            <button
              type="button"
              onClick={() => setSelected(timeline.length - 1)}
              disabled={isLive}
              className="rounded-md border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-700 disabled:opacity-30 dark:border-zinc-700 dark:text-zinc-300"
            >
              Live
            </button>
            <button
              type="button"
              onClick={() => step(1)}
              disabled={effectiveSelected >= timeline.length - 1}
              className="rounded-md border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-700 disabled:opacity-30 dark:border-zinc-700 dark:text-zinc-300"
            >
              Next →
            </button>
          </div>
        </div>
        <input
          type="range"
          min={0}
          max={Math.max(0, timeline.length - 1)}
          value={effectiveSelected}
          onChange={(e) => setSelected(Number(e.target.value))}
          className="w-full accent-orange-600"
        />
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <span>{label}</span>
    </div>
  );
}
