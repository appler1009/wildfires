"use client";

import "leaflet/dist/leaflet.css";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer } from "react-leaflet";
import { BootSequence } from "./boot-sequence";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Status palette (dataviz skill, fixed/reserved — never reused for series identity).
// Shared by BC and Quebec - SOPFEU's English condition labels match BC's own
// wording for the stages both use; Quebec's three earlier pre-control stages
// (no BC equivalent) reuse the closest existing hue rather than inventing new
// ones outside the reserved four-color status set.
const STATUS_COLOR: Record<string, string> = {
  Out: "#0ca30c",
  "Under Control": "#fab219",
  "Being Held": "#ec835a",
  "Out of Control": "#d03b3b",
  "Fire of Note": "#d03b3b",
  Identified: "#898781",
  New: "#fab219",
  "Under Observation": "#ec835a",
};
const HISTORICAL_COLOR = "#2a78d6"; // categorical slot 1 (blue) — recorded fire location
const HOTSPOT_COLOR = "#eb6834"; // categorical slot 2 (orange) — satellite hotspot detection

// Ontario's live layer only publishes a single-letter code with no decoded
// domain; F/I read as active/inactive, reusing the status palette's
// good/critical poles (not a confirmed official meaning).
const ON_STATUS_COLOR: Record<string, string> = {
  F: "#d03b3b",
  I: "#0ca30c",
};

type IndexMonth = { year: number; month: number; count: number };
type IndexData = {
  source: string;
  licence: string;
  generatedAt: string;
  months: IndexMonth[];
};

type DailyIndexDay = { date: string; count: number };
type DailyIndexData = { source: string; licence: string; note: string; days: DailyIndexDay[] };

type HistoricalPoint = {
  fire_number: string;
  province: string;
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

type OntarioPoint = {
  fireNumber: string;
  hectares: number | null;
  status: string | null;
  dateMapped: string | null;
  lat: number;
  lon: number;
};

type OntarioData = {
  source: string;
  licence: string;
  note: string;
  generatedAt: string;
  points: OntarioPoint[];
};

type QuebecPoint = {
  fireNumber: string;
  name: string | null;
  hectares: number | null;
  status: string | null;
  cause: string | null;
  startDate: string | null;
  url: string | null;
  lat: number;
  lon: number;
};

type QuebecData = {
  source: string;
  licence: string;
  note: string;
  generatedAt: string;
  points: QuebecPoint[];
};

type ClusterPoint = {
  province: string;
  lat: number;
  lon: number;
  pixel_count: number;
  estarea: number | null;
  max_frp: number | null;
};

type Timeline =
  | { kind: "live"; label: string }
  | { kind: "daily"; date: string; count: number; label: string }
  | { kind: "historical"; year: number; month: number; count: number; label: string };

function formatDayLabel(date: string) {
  // date is YYYY-MM-DD (UTC); format without a timezone-shifting Date parse.
  const [y, m, d] = date.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${d}, ${y}`;
}

function radiusFor(hectares: number | null | undefined) {
  const h = hectares ?? 0;
  return Math.min(24, Math.max(4, Math.sqrt(h) * 0.35 + 4));
}

function radiusForCluster(pixelCount: number) {
  return Math.min(20, Math.max(4, Math.sqrt(pixelCount) * 1.4 + 3));
}

function formatNumber(n: number) {
  return new Intl.NumberFormat("en-CA").format(n);
}

function formatUtcClock(d: Date) {
  return d.toISOString().slice(11, 19) + " UTC";
}

function useUtcClock() {
  // Lazy-initialized: this hook only ever runs client-side (FireMap is
  // loaded with ssr:false), so reading the clock here avoids needing a
  // synchronous setState inside the effect just to get the first tick.
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

async function fetchClusterDay(date: string): Promise<ClusterPoint[]> {
  const res = await fetch(`/data/fires/daily/${date}.json`);
  const data = (await res.json()) as { points: ClusterPoint[] };
  return data.points;
}

export function FireMap() {
  const clock = useUtcClock();
  const [index, setIndex] = useState<IndexData | null>(null);
  const [dailyIndex, setDailyIndex] = useState<DailyIndexData | null>(null);
  const [current, setCurrent] = useState<CurrentData | null>(null);
  const [onCurrent, setOnCurrent] = useState<OntarioData | null>(null);
  const [qcCurrent, setQcCurrent] = useState<QuebecData | null>(null);
  const [latestClusters, setLatestClusters] = useState<ClusterPoint[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [historicalPoints, setHistoricalPoints] = useState<HistoricalPoint[]>([]);
  const [dailyPoints, setDailyPoints] = useState<ClusterPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);
  const historicalCache = useRef(new Map<string, HistoricalPoint[]>());
  const dailyCache = useRef(new Map<string, ClusterPoint[]>());

  useEffect(() => {
    Promise.all([
      fetch("/data/fires/index.json").then((r) => r.json()),
      fetch("/data/fires/current.json").then((r) => r.json()),
      fetch("/data/fires/on-current.json").then((r) => r.json()),
      fetch("/data/fires/qc-current.json").then((r) => r.json()),
      fetch("/data/fires/daily/index.json").then((r) => r.json()),
    ]).then((results) => {
      const [idx, cur, onCur, qcCur, daily] = results as [
        IndexData,
        CurrentData,
        OntarioData,
        QuebecData,
        DailyIndexData,
      ];
      setIndex(idx);
      setCurrent(cur);
      setOnCurrent(onCur);
      setQcCurrent(qcCur);
      setDailyIndex(daily);
      const latestDate = daily.days.at(-1)?.date;
      if (latestDate) {
        fetchClusterDay(latestDate).then((pts) => {
          dailyCache.current.set(latestDate, pts);
          setLatestClusters(pts);
        });
      }
      setDataLoaded(true);
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
    // The most recent day in the CWFIS archive is folded into "Live" (blended
    // with BC's richer feed) rather than shown as its own timeline stop.
    const pastDays = (dailyIndex?.days ?? []).slice(0, -1);
    const days: Timeline[] = pastDays.map((d) => ({
      kind: "daily",
      date: d.date,
      count: d.count,
      label: formatDayLabel(d.date),
    }));
    const entries = [...months, ...days];
    if (
      (current && current.points.length > 0) ||
      (onCurrent && onCurrent.points.length > 0) ||
      (qcCurrent && qcCurrent.points.length > 0) ||
      latestClusters.length > 0
    ) {
      entries.push({ kind: "live", label: "Live — Today" });
    }
    return entries;
  }, [index, dailyIndex, current, onCurrent, qcCurrent, latestClusters]);

  // Default to "live" (last entry) once data loads, unless the user already picked something.
  const effectiveSelected = selected ?? Math.max(0, timeline.length - 1);
  const activeEntry = timeline[effectiveSelected];

  useEffect(() => {
    if (activeEntry?.kind === "historical") {
      const monthStr = String(activeEntry.month).padStart(2, "0");
      const key = `${activeEntry.year}-${monthStr}`;
      const cached = historicalCache.current.get(key);
      if (cached) {
        setHistoricalPoints(cached);
        return;
      }
      setLoading(true);
      fetch(`/data/fires/${key}.json`)
        .then((r) => r.json())
        .then((data: { points: HistoricalPoint[] }) => {
          historicalCache.current.set(key, data.points);
          setHistoricalPoints(data.points);
        })
        .finally(() => setLoading(false));
    } else if (activeEntry?.kind === "daily") {
      const cached = dailyCache.current.get(activeEntry.date);
      if (cached) {
        setDailyPoints(cached);
        return;
      }
      setLoading(true);
      fetchClusterDay(activeEntry.date)
        .then((pts) => {
          dailyCache.current.set(activeEntry.date, pts);
          setDailyPoints(pts);
        })
        .finally(() => setLoading(false));
    }
  }, [activeEntry]);

  const isLive = activeEntry?.kind === "live";
  const isDaily = activeEntry?.kind === "daily";
  const isOperational = isLive || isDaily;
  const dataRefreshedAt = [current, onCurrent, qcCurrent]
    .map((d) => d?.generatedAt)
    .filter((d): d is string => Boolean(d))
    .sort()
    .at(-1);
  const bcStatusPoints = isLive ? (current?.points ?? []) : [];
  const onStatusPoints = isLive ? (onCurrent?.points ?? []) : [];
  const qcStatusPoints = isLive ? (qcCurrent?.points ?? []) : [];
  const clusterPoints = isLive
    ? latestClusters.filter((c) => c.province !== "BC" && c.province !== "ON" && c.province !== "QC")
    : isDaily
      ? dailyPoints
      : [];
  const points = isOperational ? [] : historicalPoints;

  function step(delta: number) {
    setSelected(Math.min(timeline.length - 1, Math.max(0, effectiveSelected + delta)));
  }

  return (
    <div className="flex h-dvh flex-col">
      <BootSequence ready={dataLoaded} />
      <div className="animate-reveal flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-4 py-2 sm:px-8">
        <div className="flex items-baseline gap-3">
          <h1 className="font-display text-lg leading-none tracking-wide text-[var(--ink)] sm:text-xl">
            Canada Wildfires
          </h1>
          <span className="label hidden sm:inline">Live &amp; Historical Tracker</span>
        </div>
        <div className="flex items-center gap-4">
          {dataRefreshedAt && (
            <span className="label tabular hidden md:inline" title="When this data was last pulled from source — not a continuous live stream">
              Data refreshed {new Date(dataRefreshedAt).toISOString().slice(0, 16).replace("T", " ")} UTC
            </span>
          )}
          <span className="label tabular">{formatUtcClock(clock)}</span>
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        <div
          key={effectiveSelected}
          className="scan-flash pointer-events-none absolute inset-0 z-[900]"
          style={{
            background:
              "linear-gradient(180deg, transparent 0%, color-mix(in srgb, var(--ember) 25%, transparent) 50%, transparent 100%)",
          }}
        />
        <MapContainer
          center={[58, -97]}
          zoom={4}
          preferCanvas
          style={{ height: "100%", width: "100%" }}
          className="bg-[var(--bg)]"
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          />
          {isOperational &&
            bcStatusPoints.map((p) => (
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
          {isOperational &&
            onStatusPoints.map((p, i) => (
              <CircleMarker
                key={`${p.fireNumber}-${i}`}
                center={[p.lat, p.lon]}
                radius={radiusFor(p.hectares)}
                pathOptions={{
                  color: "#ffffff",
                  weight: 1,
                  fillColor: ON_STATUS_COLOR[p.status ?? ""] ?? "#898781",
                  fillOpacity: 0.85,
                }}
              >
                <Popup>
                  <div className="flex flex-col gap-1 text-sm">
                    <strong>ON — {p.fireNumber}</strong>
                    <span>Status code: {p.status ?? "Unknown"}</span>
                    <span>{formatNumber(p.hectares ?? 0)} ha</span>
                  </div>
                </Popup>
              </CircleMarker>
            ))}
          {isOperational &&
            qcStatusPoints.map((p, i) => (
              <CircleMarker
                key={`${p.fireNumber}-${i}`}
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
                    <strong>QC — {p.name || p.fireNumber}</strong>
                    <span>Status: {p.status ?? "Unknown"}</span>
                    <span>{formatNumber(p.hectares ?? 0)} ha · {p.cause ?? "Unknown cause"}</span>
                    {p.url && (
                      <a
                        href={p.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-orange-700 underline"
                      >
                        Situation update
                      </a>
                    )}
                  </div>
                </Popup>
              </CircleMarker>
            ))}
          {isOperational &&
            clusterPoints.map((c, i) => (
              <CircleMarker
                key={`${c.province}-${c.lat}-${c.lon}-${i}`}
                center={[c.lat, c.lon]}
                radius={radiusForCluster(c.pixel_count)}
                pathOptions={{
                  color: "#ffffff",
                  weight: 1,
                  fillColor: HOTSPOT_COLOR,
                  fillOpacity: 0.75,
                }}
              >
                <Popup>
                  <div className="flex flex-col gap-1 text-sm">
                    <strong>{c.province} — satellite hotspot cluster</strong>
                    <span>{formatNumber(c.pixel_count)} detections</span>
                    {c.estarea != null && <span>~{formatNumber(c.estarea)} ha estimated</span>}
                  </div>
                </Popup>
              </CircleMarker>
            ))}
          {!isOperational &&
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
                    <span>{p.province}{p.place ? ` · ${p.place}` : ""}</span>
                    <span>{p.date ?? "Unknown date"}</span>
                    <span>{formatNumber(p.hectares ?? 0)} ha · {p.cause ?? "Unknown cause"}</span>
                  </div>
                </Popup>
              </CircleMarker>
            ))}
        </MapContainer>

        <div className="animate-reveal-delay-1 pointer-events-none absolute bottom-4 left-4 z-[1000] flex flex-col gap-2">
          <span
            className={`label pointer-events-auto w-fit border px-2.5 py-1 backdrop-blur-sm ${
              isOperational
                ? "border-[var(--ember-dim)] bg-[color-mix(in_srgb,var(--ember)_18%,var(--surface))] text-[var(--ember)]"
                : "border-[var(--border-strong)] bg-[var(--surface)]/95 text-[var(--amber)]"
            }`}
          >
            {isLive ? "Live Operational Status" : isDaily ? "Satellite Hotspot Detections" : "Historical Summary"}
          </span>
          <div className="pointer-events-auto flex flex-col gap-1.5 border border-[var(--border)] bg-[var(--surface)]/95 px-3 py-2.5 text-[11px] text-[var(--ink-muted)] backdrop-blur-sm">
            {isLive && (
              <>
                <LegendDot color={STATUS_COLOR["Out of Control"]} label="BC/QC — out of control" />
                <LegendDot color={STATUS_COLOR["Being Held"]} label="BC/QC — being held" />
                <LegendDot color={STATUS_COLOR["Under Control"]} label="BC/QC — under control" />
                <LegendDot color={STATUS_COLOR["Out"]} label="BC/QC — out" />
                <LegendDot color={ON_STATUS_COLOR["F"]} label="Ontario — active" />
                <LegendDot color={ON_STATUS_COLOR["I"]} label="Ontario — inactive" />
                <LegendDot color={HOTSPOT_COLOR} label="Elsewhere — hotspot cluster" />
              </>
            )}
            {isDaily && <LegendDot color={HOTSPOT_COLOR} label="Satellite hotspot cluster" />}
            {!isOperational && <LegendDot color={HISTORICAL_COLOR} label="Recorded fire location" />}
          </div>
        </div>
      </div>

      <div className="animate-reveal-delay-2 flex flex-col gap-2.5 border-t border-[var(--border)] bg-[var(--surface)] px-4 py-3 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
          <div className="flex items-baseline gap-3">
            <span className="font-display text-2xl leading-none tracking-wide text-[var(--ink)] sm:text-3xl">
              {activeEntry?.label ?? "Loading…"}
            </span>
            {activeEntry?.kind === "historical" && (
              <span className="label tabular">
                {formatNumber(activeEntry.count)} fires{loading ? " · loading…" : ""}
              </span>
            )}
            {activeEntry?.kind === "daily" && (
              <span className="label tabular">
                {formatNumber(clusterPoints.length)} hotspot clusters{loading ? " · loading…" : ""}
              </span>
            )}
            {isLive && (
              <span className="label tabular">
                {formatNumber(bcStatusPoints.length)} BC · {formatNumber(onStatusPoints.length)} Ontario
                · {formatNumber(qcStatusPoints.length)} Quebec · {formatNumber(clusterPoints.length)}{" "}
                clusters elsewhere
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => step(-1)}
              disabled={effectiveSelected <= 0}
              className="label border border-[var(--border-strong)] px-2.5 py-1.5 text-[var(--ink-muted)] transition-all hover:border-[var(--ember)] hover:text-[var(--ember)] active:scale-95 disabled:pointer-events-none disabled:opacity-25"
            >
              ← Prev
            </button>
            <button
              type="button"
              onClick={() => setSelected(timeline.length - 1)}
              disabled={isLive}
              className="label border border-[var(--ember-dim)] bg-[var(--ember)] px-3 py-1.5 text-[#0d0b09] transition-all hover:opacity-90 active:scale-95 disabled:pointer-events-none disabled:opacity-30"
            >
              Live
            </button>
            <button
              type="button"
              onClick={() => step(1)}
              disabled={effectiveSelected >= timeline.length - 1}
              className="label border border-[var(--border-strong)] px-2.5 py-1.5 text-[var(--ink-muted)] transition-all hover:border-[var(--ember)] hover:text-[var(--ember)] active:scale-95 disabled:pointer-events-none disabled:opacity-25"
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
          className="w-full"
        />
      </div>

      <div
        className="flex items-center justify-between gap-4 border-t border-[var(--border)] bg-[var(--bg-2)] px-4 py-1.5 text-[10px] text-[var(--ink-faint)] sm:px-8"
        title="Sources: BC Data Catalogue (BC), Ontario GeoHub / LIO (Ontario), SOPFEU (Quebec), Natural Resources Canada / CWFIS (elsewhere). Licensed under OGL British Columbia, Ontario, and Canada, and CC BY 4.0 (Gouvernement du Québec). Reference data, not exact real-time ground truth."
      >
        <span className="truncate">
          Sources: BC · Ontario · Quebec · CWFIS (rest of Canada) — reference data, not real-time
          ground truth.
        </span>
        <div className="flex shrink-0 gap-4">
          <Link
            href="/historical/yearly"
            className="label text-[var(--amber)] transition-colors hover:text-[var(--ember)]"
          >
            Yearly totals
          </Link>
          <Link
            href="/historical/monthly"
            className="label text-[var(--amber)] transition-colors hover:text-[var(--ember)]"
          >
            Monthly heatmap
          </Link>
        </div>
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-2 w-2 shrink-0" style={{ backgroundColor: color }} />
      <span>{label}</span>
    </div>
  );
}
