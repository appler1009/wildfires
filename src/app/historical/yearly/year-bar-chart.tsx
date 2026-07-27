"use client";

import { useRef, useState } from "react";
import { ChartTooltip } from "../../tooltip";

type YearRow = {
  year: number;
  fire_count: number;
  hectares_burned: number;
};

function formatNumber(n: number) {
  return new Intl.NumberFormat("en-CA").format(n);
}

function formatHectares(n: number) {
  return new Intl.NumberFormat("en-CA", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(n);
}

export function YearBarChart({
  rows,
  maxHectares,
  recordYear,
}: {
  rows: YearRow[];
  maxHectares: number;
  recordYear: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<{ row: YearRow; x: number; y: number; width: number } | null>(
    null,
  );

  function handlePointer(row: YearRow, e: React.PointerEvent<HTMLDivElement>) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setHovered({ row, x: e.clientX - rect.left, y: e.clientY - rect.top, width: rect.width });
  }

  return (
    <div ref={containerRef} className="relative">
      {/* 22px of top padding reserves headroom for the record-year flame
          marker, which would otherwise be clipped by the horizontal
          scroll container's implied overflow-y: hidden. */}
      <div className="flex min-w-[640px] items-end gap-[2px] pt-[22px]" style={{ height: 220 }}>
        {rows.map((row, i) => (
          <div
            key={row.year}
            className="animate-bar group relative flex-1 bg-[var(--ember)] transition-opacity hover:opacity-80"
            style={
              {
                height: `${(row.hectares_burned / maxHectares) * 100}%`,
                opacity: row.year === recordYear ? 1 : 0.55,
                "--bar-i": i,
              } as React.CSSProperties
            }
            onPointerEnter={(e) => handlePointer(row, e)}
            onPointerMove={(e) => handlePointer(row, e)}
            onPointerLeave={() => setHovered(null)}
          >
            {row.year === recordYear && (
              <span
                className="flame-icon absolute -top-5 left-1/2 -translate-x-1/2"
                aria-hidden="true"
                title={`Record season: ${row.year}`}
              />
            )}
          </div>
        ))}
      </div>
      {hovered && (
        <ChartTooltip x={hovered.x} y={hovered.y} clampWidth={hovered.width}>
          <div className="font-display tracking-wide text-[var(--ink)]">{hovered.row.year}</div>
          <div className="tabular text-[var(--ink-muted)]">
            {formatHectares(hovered.row.hectares_burned)} ha · {formatNumber(hovered.row.fire_count)}{" "}
            fires
          </div>
        </ChartTooltip>
      )}
    </div>
  );
}
