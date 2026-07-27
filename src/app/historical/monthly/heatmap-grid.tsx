"use client";

import { useRef, useState } from "react";
import { ChartTooltip } from "../../tooltip";

type MonthlyRow = {
  year: number;
  month: number;
  fire_count: number;
  hectares_burned: number;
};

type MonthlyHeatmapData = {
  years: number[];
  rows: MonthlyRow[];
};

const MONTH_LABELS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Sequential blue ramp, validated with dataviz's --ordinal check (monotone L,
// adjacent ΔL >= 0.06, light-end contrast >= 2:1 against each mode's surface).
// Index 0 in each pair is a dedicated "no recorded fire" tile, not part of the ramp.
const ZERO_LIGHT = "#f4f3ef";
const ZERO_DARK = "#232320";
const RAMP_LIGHT = ["#86b6ef", "#5598e7", "#2a78d6", "#1c5cab", "#0d366b"];
const RAMP_DARK = ["#184f95", "#256abf", "#3987e5", "#6da7ec", "#cde2fb"];

function bucketIndex(hectares: number, maxHectares: number) {
  if (hectares <= 0) return -1; // dedicated zero tile
  // log scale: BC fire hectares span ~0 to low millions within a season.
  const t = Math.log10(1 + hectares) / Math.log10(1 + maxHectares);
  return Math.min(RAMP_LIGHT.length - 1, Math.max(0, Math.round(t * (RAMP_LIGHT.length - 1))));
}

function formatNumber(n: number) {
  return new Intl.NumberFormat("en-CA").format(n);
}

// Hectares are pre-rounded to 1 decimal at ingest time; force it so a value
// that happens to land on a whole number doesn't drop its trailing .0.
function formatHectares(n: number) {
  return new Intl.NumberFormat("en-CA", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(n);
}

export function HeatmapGrid({ data }: { data: MonthlyHeatmapData }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<{
    cell: MonthlyRow;
    month: number;
    x: number;
    y: number;
    width: number;
  } | null>(null);

  const cellByKey = new Map(data.rows.map((r) => [`${r.year}-${r.month}`, r]));
  const maxHectares = Math.max(...data.rows.map((r) => r.hectares_burned));
  const years = [...data.years].reverse();

  function showTooltip(
    year: number,
    month: number,
    cell: MonthlyRow | undefined,
    target: HTMLElement,
  ) {
    const containerRect = containerRef.current?.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    if (!containerRect) return;
    setHovered({
      cell: cell ?? { year, month, fire_count: 0, hectares_burned: 0 },
      month,
      x: targetRect.left + targetRect.width / 2 - containerRect.left,
      y: targetRect.top - containerRect.top,
      width: containerRect.width,
    });
  }

  return (
    <div
      ref={containerRef}
      className="relative overflow-x-auto border border-[var(--border)] bg-[var(--surface)] p-4"
      role="img"
      aria-label="Heatmap of hectares burned by year and month"
    >
      <div className="inline-flex min-w-full flex-col gap-[2px]">
        <div className="flex gap-[2px] pl-14">
          {MONTH_LABELS.map((label, i) => (
            <div
              key={i}
              className="label flex w-6 shrink-0 items-center justify-center text-[var(--ink-faint)]"
            >
              {label}
            </div>
          ))}
        </div>
        {years.map((year) => (
          <div key={year} className="flex items-center gap-[2px]">
            <div className="tabular w-14 shrink-0 pr-2 text-right text-[11px] text-[var(--ink-faint)]">
              {year}
            </div>
            {MONTH_LABELS.map((_, i) => {
              const month = i + 1;
              const cell = cellByKey.get(`${year}-${month}`);
              const hectares = cell?.hectares_burned ?? 0;
              const idx = bucketIndex(hectares, maxHectares);
              return (
                <button
                  key={month}
                  type="button"
                  className="h-6 w-6 shrink-0 outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ember)]"
                  style={{
                    backgroundColor:
                      idx === -1
                        ? `light-dark(${ZERO_LIGHT}, ${ZERO_DARK})`
                        : `light-dark(${RAMP_LIGHT[idx]}, ${RAMP_DARK[idx]})`,
                  }}
                  onPointerEnter={(e) => showTooltip(year, month, cell, e.currentTarget)}
                  onFocus={(e) => showTooltip(year, month, cell, e.currentTarget)}
                  onPointerLeave={() => setHovered(null)}
                  onBlur={() => setHovered(null)}
                  aria-label={`${MONTH_NAMES[i]} ${year}: ${formatHectares(hectares)} hectares burned`}
                />
              );
            })}
          </div>
        ))}
      </div>

      {hovered && (
        <ChartTooltip x={hovered.x} y={hovered.y} clampWidth={hovered.width}>
          <div className="font-display tracking-wide text-[var(--ink)]">
            {MONTH_NAMES[hovered.month - 1]} {hovered.cell.year}
          </div>
          <div className="tabular text-[var(--ink-muted)]">
            {formatHectares(hovered.cell.hectares_burned)} ha · {formatNumber(hovered.cell.fire_count)}{" "}
            fires
          </div>
        </ChartTooltip>
      )}

      <div className="label mt-3 flex items-center gap-2 text-[var(--ink-faint)]">
        <span>No recorded fire</span>
        <div
          className="h-3 w-5"
          style={{ backgroundColor: `light-dark(${ZERO_LIGHT}, ${ZERO_DARK})` }}
        />
        <span className="ml-2">Fewer hectares</span>
        <div className="flex gap-[2px]">
          {RAMP_LIGHT.map((_, i) => (
            <div
              key={i}
              className="h-3 w-5"
              style={{ backgroundColor: `light-dark(${RAMP_LIGHT[i]}, ${RAMP_DARK[i]})` }}
            />
          ))}
        </div>
        <span>More hectares (log scale)</span>
      </div>
    </div>
  );
}
