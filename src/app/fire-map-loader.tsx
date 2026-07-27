"use client";

import dynamic from "next/dynamic";

export const FireMap = dynamic(() => import("./fire-map").then((m) => m.FireMap), {
  ssr: false,
  loading: () => (
    <div className="label flex h-dvh items-center justify-center bg-[var(--bg)] text-[var(--ink-faint)]">
      Loading map…
    </div>
  ),
});
