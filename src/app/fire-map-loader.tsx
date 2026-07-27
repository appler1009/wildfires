"use client";

import dynamic from "next/dynamic";

export const FireMap = dynamic(() => import("./fire-map").then((m) => m.FireMap), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen items-center justify-center bg-zinc-100 text-sm text-zinc-500 dark:bg-zinc-900 dark:text-zinc-500">
      Loading map…
    </div>
  ),
});
