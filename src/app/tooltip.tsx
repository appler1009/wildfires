"use client";

// Shared floating tooltip for chart marks. Positioned by the caller (x/y are
// relative to a `position: relative` ancestor); anchored above-and-centered
// on the point, clamped so it doesn't run off the left/right edge.
export function ChartTooltip({
  x,
  y,
  clampWidth,
  children,
}: {
  x: number;
  y: number;
  clampWidth: number;
  children: React.ReactNode;
}) {
  const clampedX = Math.min(Math.max(x, 110), clampWidth - 110);
  return (
    <div
      className="pointer-events-none absolute z-50 -translate-x-1/2 -translate-y-full border border-[var(--border-strong)] bg-[var(--surface-2)] px-2.5 py-1.5 text-xs whitespace-nowrap text-[var(--ink)] shadow-[0_4px_16px_rgba(0,0,0,0.4)]"
      style={{ left: clampedX, top: y - 10 }}
    >
      {children}
    </div>
  );
}
