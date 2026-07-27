"use client";

import "leaflet/dist/leaflet.css";
import type { CircleMarker as LeafletCircleMarker, LeafletMouseEvent } from "leaflet";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer } from "react-leaflet";
import { BootSequence } from "./boot-sequence";
import { ShareButton } from "./share-button";

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

type UsPoint = {
  fireNumber: string | null;
  name: string | null;
  state: string | null;
  hectares: number | null;
  percentContained: number | null;
  cause: string | null;
  discoveryDate: string | null;
  lat: number;
  lon: number;
};

type UsData = {
  source: string;
  licence: string;
  note: string;
  generatedAt: string;
  points: UsPoint[];
};

const US_BORDER_STATES = ["AK", "WA", "ID", "MT", "ND", "MN", "MI", "OH", "PA", "NY", "VT", "NH", "ME"];

function usStatusColor(percentContained: number | null): string {
  if (percentContained == null) return "#898781"; // unknown
  if (percentContained >= 100) return "#0ca30c"; // contained (good)
  if (percentContained <= 0) return "#d03b3b"; // 0% contained (critical)
  return "#fab219"; // partially contained (warning)
}

type ConnectionStatus = { bc: boolean; on: boolean; qc: boolean; us: boolean; cwfis: boolean };

type Timeline =
  | { kind: "live"; label: string }
  | { kind: "daily"; date: string; count: number; label: string }
  | { kind: "historical"; year: number; month: number; count: number; label: string };

// Builds a compact SVG sparkline path (line + closed area-under-curve) from a
// series of counts, scaled to fit a width x height viewBox with a small
// vertical margin so peaks don't clip the stroke.
function sparklinePaths(values: number[], width: number, height: number) {
  if (values.length < 2) return { line: "", area: "" };
  const max = Math.max(1, ...values);
  const margin = height * 0.12;
  const usableHeight = height - margin * 2;
  const stepX = width / (values.length - 1);
  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = margin + usableHeight * (1 - v / max);
    return [x, y] as const;
  });
  const line = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${width},${height} L0,${height} Z`;
  return { line, area };
}

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

// Markers are canvas-rendered (preferCanvas) for performance with thousands of
// points, so CSS :hover can't reach them - Leaflet still fires mouse events on
// canvas-rendered paths via hit-testing, so we drive the glow imperatively
// through the layer's own setStyle instead of React state (no re-render).
function markerHoverHandlers(baseWeight: number, baseFillOpacity: number) {
  return {
    mouseover: (e: LeafletMouseEvent) => {
      const layer = e.target as LeafletCircleMarker;
      layer.setStyle({ weight: baseWeight + 2, fillOpacity: Math.min(1, baseFillOpacity + 0.15) });
      layer.bringToFront();
    },
    mouseout: (e: LeafletMouseEvent) => {
      const layer = e.target as LeafletCircleMarker;
      layer.setStyle({ weight: baseWeight, fillOpacity: baseFillOpacity });
    },
  };
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
  const [usCurrent, setUsCurrent] = useState<UsData | null>(null);
  const [latestClusters, setLatestClusters] = useState<ClusterPoint[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [historicalPoints, setHistoricalPoints] = useState<HistoricalPoint[]>([]);
  const [dailyPoints, setDailyPoints] = useState<ClusterPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [connected, setConnected] = useState<ConnectionStatus>({
    bc: false,
    on: false,
    qc: false,
    us: false,
    cwfis: false,
  });
  const historicalCache = useRef(new Map<string, HistoricalPoint[]>());
  const dailyCache = useRef(new Map<string, ClusterPoint[]>());

  useEffect(() => {
    const indexP = fetch("/data/fires/index.json").then((r) => r.json());
    const currentP = fetch("/data/fires/current.json").then((r) => r.json());
    const onCurrentP = fetch("/data/fires/on-current.json").then((r) => r.json());
    const qcCurrentP = fetch("/data/fires/qc-current.json").then((r) => r.json());
    const usCurrentP = fetch("/data/fires/us-current.json").then((r) => r.json());
    const dailyP = fetch("/data/fires/daily/index.json").then((r) => r.json());

    // Each channel flips to "connected" independently as its own fetch
    // resolves, not all at once - the boot screen's status list reflects
    // this instead of just claiming everything connected on a timer.
    currentP.then(() => setConnected((c) => ({ ...c, bc: true })));
    onCurrentP.then(() => setConnected((c) => ({ ...c, on: true })));
    qcCurrentP.then(() => setConnected((c) => ({ ...c, qc: true })));
    usCurrentP.then(() => setConnected((c) => ({ ...c, us: true })));
    dailyP.then(() => setConnected((c) => ({ ...c, cwfis: true })));

    Promise.all([indexP, currentP, onCurrentP, qcCurrentP, usCurrentP, dailyP]).then((results) => {
      const [idx, cur, onCur, qcCur, usCur, daily] = results as [
        IndexData,
        CurrentData,
        OntarioData,
        QuebecData,
        UsData,
        DailyIndexData,
      ];
      setIndex(idx);
      setCurrent(cur);
      setOnCurrent(onCur);
      setQcCurrent(qcCur);
      setUsCurrent(usCur);
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
      (usCurrent && usCurrent.points.length > 0) ||
      latestClusters.length > 0
    ) {
      entries.push({ kind: "live", label: "Today" });
    }
    return entries;
  }, [index, dailyIndex, current, onCurrent, qcCurrent, usCurrent, latestClusters]);

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
  const dataRefreshedAt = [current, onCurrent, qcCurrent, usCurrent]
    .map((d) => d?.generatedAt)
    .filter((d): d is string => Boolean(d))
    .sort()
    .at(-1);
  const bcStatusPoints = isLive ? (current?.points ?? []) : [];
  const onStatusPoints = isLive ? (onCurrent?.points ?? []) : [];
  const qcStatusPoints = isLive ? (qcCurrent?.points ?? []) : [];
  const usStatusPoints = isLive ? (usCurrent?.points ?? []) : [];
  const richCoveredCodes = ["BC", "ON", "QC", ...US_BORDER_STATES];
  const clusterPoints = isLive
    ? latestClusters.filter((c) => !richCoveredCodes.includes(c.province))
    : isDaily
      ? dailyPoints
      : [];
  const points = isOperational ? [] : historicalPoints;
  const totalActive = bcStatusPoints.length + onStatusPoints.length + qcStatusPoints.length;
  const shareText = isLive
    ? `${formatNumber(totalActive)} wildfires being tracked across Canada right now.`
    : "Wildfire tracking across Canada — latest status and historical trends.";

  function step(delta: number) {
    setSelected(Math.min(timeline.length - 1, Math.max(0, effectiveSelected + delta)));
  }

  const sparklineDays = (dailyIndex?.days ?? []).slice(-30);
  const sparkline = sparklinePaths(sparklineDays.map((d) => d.count), 110, 28);
  const sparklineTrendPct =
    sparklineDays.length >= 2 && sparklineDays[0].count > 0
      ? Math.round(
          ((sparklineDays.at(-1)!.count - sparklineDays[0].count) / sparklineDays[0].count) * 100,
        )
      : null;

  // Collapsed by default on narrow viewports so the ten-row legend doesn't
  // eat half the map; left open on desktop where it always has room.
  const [legendOpen, setLegendOpen] = useState(() =>
    typeof window === "undefined" ? true : window.matchMedia("(min-width: 640px)").matches,
  );
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing) return;
    const id = setTimeout(() => {
      if (effectiveSelected >= timeline.length - 1) {
        setPlaying(false);
      } else {
        step(1);
      }
    }, 450);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, effectiveSelected, timeline.length]);

  // Arrow-key scrubbing through the timeline, Space to play/pause - skipped
  // while focus is inside a form control so typing/selecting still works.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setPlaying(false);
        step(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setPlaying(false);
        step(1);
      } else if (e.key === " ") {
        e.preventDefault();
        setPlaying((p) => !p);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveSelected, timeline.length]);

  return (
    <div className="flex h-dvh flex-col">
      <BootSequence ready={dataLoaded} connected={connected} />
      <div className="animate-reveal flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-4 py-2 sm:px-8">
        <div className="flex items-baseline gap-3">
          <h1 className="font-display text-lg leading-none tracking-wide text-[var(--ink)] sm:text-xl">
            Canada Wildfires
          </h1>
          <span className="label hidden sm:inline">Latest &amp; Historical Tracker</span>
        </div>
        <div className="flex items-center gap-4">
          {sparkline.line && (
            <div
              className="hidden items-center gap-2 lg:flex"
              title="Satellite hotspot detections per day, last 30 days"
            >
              <span className="label">30-day trend</span>
              <svg width="110" height="28" viewBox="0 0 110 28" className="overflow-visible">
                <path d={sparkline.area} fill="var(--ember)" opacity="0.12" />
                <path d={sparkline.line} fill="none" stroke="var(--ember)" strokeWidth="1.5" />
              </svg>
              {sparklineTrendPct != null && (
                <span
                  className="label tabular"
                  style={{ color: sparklineTrendPct >= 0 ? "var(--ember)" : "var(--safe)" }}
                >
                  {sparklineTrendPct >= 0 ? "▲" : "▼"} {Math.abs(sparklineTrendPct)}%
                </span>
              )}
            </div>
          )}
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
                eventHandlers={markerHoverHandlers(1, 0.85)}
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
                eventHandlers={markerHoverHandlers(1, 0.85)}
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
                eventHandlers={markerHoverHandlers(1, 0.85)}
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
            usStatusPoints.map((p, i) => (
              <CircleMarker
                key={`${p.fireNumber}-${i}`}
                center={[p.lat, p.lon]}
                radius={radiusFor(p.hectares)}
                pathOptions={{
                  color: "#ffffff",
                  weight: 1,
                  fillColor: usStatusColor(p.percentContained),
                  fillOpacity: 0.85,
                }}
                eventHandlers={markerHoverHandlers(1, 0.85)}
              >
                <Popup>
                  <div className="flex flex-col gap-1 text-sm">
                    <strong>{p.state ?? "US"} — {p.name || p.fireNumber}</strong>
                    <span>
                      {p.percentContained != null ? `${p.percentContained}% contained` : "Containment unknown"}
                    </span>
                    <span>{formatNumber(p.hectares ?? 0)} ha · {p.cause ?? "Unknown cause"}</span>
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
                eventHandlers={markerHoverHandlers(1, 0.75)}
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
                eventHandlers={markerHoverHandlers(1, 0.7)}
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

        <div
          className="pointer-events-none absolute inset-0 z-[850]"
          style={{ boxShadow: "inset 0 0 140px 40px rgba(0,0,0,0.55)" }}
        />

        <div className="animate-reveal-delay-1 pointer-events-none absolute bottom-4 left-4 z-[1000] flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setLegendOpen((o) => !o)}
            className={`ember-glow label pointer-events-auto flex w-fit items-center gap-1.5 border px-2.5 py-1 backdrop-blur-sm ${
              isOperational
                ? "border-[var(--ember-dim)] bg-[color-mix(in_srgb,var(--ember)_18%,var(--surface))] text-[var(--ember)]"
                : "border-[var(--border-strong)] bg-[var(--surface)]/95 text-[var(--amber)]"
            }`}
          >
            {isLive ? "Latest Operational Status" : isDaily ? "Satellite Hotspot Detections" : "Historical Summary"}
            <span aria-hidden="true" className="text-[9px]">
              {legendOpen ? "▾" : "▸"}
            </span>
          </button>
          <div
            className={`pointer-events-auto flex-col gap-1.5 border border-[var(--border)] bg-[var(--surface)]/95 px-3 py-2.5 text-[11px] text-[var(--ink-muted)] backdrop-blur-sm ${
              legendOpen ? "flex" : "hidden"
            }`}
          >
            {isLive && (
              <>
                <LegendDot color={STATUS_COLOR["Out of Control"]} label="BC/QC — out of control" />
                <LegendDot color={STATUS_COLOR["Being Held"]} label="BC/QC — being held" />
                <LegendDot color={STATUS_COLOR["Under Control"]} label="BC/QC — under control" />
                <LegendDot color={STATUS_COLOR["Out"]} label="BC/QC — out" />
                <LegendDot color={ON_STATUS_COLOR["F"]} label="Ontario — active" />
                <LegendDot color={ON_STATUS_COLOR["I"]} label="Ontario — inactive" />
                <LegendDot color={usStatusColor(0)} label="US border states — uncontained" />
                <LegendDot color={usStatusColor(50)} label="US border states — partial" />
                <LegendDot color={usStatusColor(100)} label="US border states — contained" />
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
            <span
              className="font-display text-2xl leading-none tracking-wide text-[var(--ink)] sm:text-3xl"
              aria-live="polite"
            >
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
                · {formatNumber(qcStatusPoints.length)} Quebec · {formatNumber(usStatusPoints.length)} US
                border states · {formatNumber(clusterPoints.length)} clusters elsewhere
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPlaying((p) => !p)}
              disabled={effectiveSelected >= timeline.length - 1 && !playing}
              className="ember-glow label border border-[var(--border-strong)] px-2.5 py-1.5 text-[var(--ink-muted)] transition-all hover:border-[var(--ember)] hover:text-[var(--ember)] active:scale-95 disabled:pointer-events-none disabled:opacity-25"
              title="Play through the timeline"
            >
              {playing ? "⏸ Pause" : "▶ Play"}
            </button>
            <button
              type="button"
              onClick={() => {
                setPlaying(false);
                step(-1);
              }}
              disabled={effectiveSelected <= 0}
              className="ember-glow label border border-[var(--border-strong)] px-2.5 py-1.5 text-[var(--ink-muted)] transition-all hover:border-[var(--ember)] hover:text-[var(--ember)] active:scale-95 disabled:pointer-events-none disabled:opacity-25"
            >
              ← Prev
            </button>
            <button
              type="button"
              onClick={() => {
                setPlaying(false);
                setSelected(timeline.length - 1);
              }}
              disabled={isLive}
              className="ember-glow-solid label border border-[var(--ember-dim)] bg-[var(--ember)] px-3 py-1.5 text-[#0d0b09] transition-all hover:opacity-90 active:scale-95 disabled:pointer-events-none disabled:opacity-30"
            >
              Latest
            </button>
            <button
              type="button"
              onClick={() => {
                setPlaying(false);
                step(1);
              }}
              disabled={effectiveSelected >= timeline.length - 1}
              className="ember-glow label border border-[var(--border-strong)] px-2.5 py-1.5 text-[var(--ink-muted)] transition-all hover:border-[var(--ember)] hover:text-[var(--ember)] active:scale-95 disabled:pointer-events-none disabled:opacity-25"
            >
              Next →
            </button>
          </div>
        </div>
        <input
          type="range"
          title="Tip: use the ← → arrow keys anywhere on this page to scrub, and Space to play/pause"
          min={0}
          max={Math.max(0, timeline.length - 1)}
          value={effectiveSelected}
          onChange={(e) => {
            setPlaying(false);
            setSelected(Number(e.target.value));
          }}
          className="w-full"
        />
      </div>

      <div
        className="flex items-center justify-between gap-4 border-t border-[var(--border)] bg-[var(--bg-2)] px-4 py-1.5 text-[10px] text-[var(--ink-faint)] sm:px-8"
        title="Sources: BC Data Catalogue (BC), Ontario GeoHub / LIO (Ontario), SOPFEU (Quebec), NIFC/WFIGS via Esri Living Atlas (13 US border states), Natural Resources Canada / CWFIS (elsewhere). Licensed under OGL British Columbia, Ontario, and Canada, CC BY 4.0 (Gouvernement du Québec), and US federal public domain. Reference data, not exact real-time ground truth."
      >
        <span className="truncate">
          Sources: BC · Ontario · Quebec · NIFC (US border states) · CWFIS (elsewhere) — reference
          data, not real-time ground truth.
        </span>
        <div className="flex shrink-0 items-center gap-4">
          <ShareButton text={shareText} />
          <Link
            href="/historical/yearly"
            className="text-ember-glow label text-[var(--amber)] hover:text-[var(--ember)]"
          >
            Yearly totals
          </Link>
          <Link
            href="/historical/monthly"
            className="text-ember-glow label text-[var(--amber)] hover:text-[var(--ember)]"
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
