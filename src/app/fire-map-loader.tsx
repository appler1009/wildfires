"use client";

import dynamic from "next/dynamic";

export const FireMap = dynamic(() => import("./fire-map").then((m) => m.FireMap), {
  ssr: false,
  loading: () => (
    <div className="flex h-dvh flex-col items-center justify-center gap-3 bg-[var(--bg)]">
      <div className="font-display animate-pulse text-2xl tracking-wide text-[var(--ink)]">
        Canada Wildfires
      </div>
      <div className="label text-[var(--ink-faint)]">Loading…</div>
    </div>
  ),
});
