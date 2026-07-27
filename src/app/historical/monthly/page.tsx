import Link from "next/link";
import monthlyFireHeatmap from "@/data/monthly-fire-heatmap.json";
import { HeatmapGrid } from "./heatmap-grid";

export default function MonthlyPage() {
  const lastUpdated = new Date(monthlyFireHeatmap.generatedAt);

  return (
    <div className="min-h-screen bg-zinc-50 px-6 py-16 font-sans dark:bg-black sm:px-16">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <header className="flex flex-col gap-2">
          <div className="flex gap-3">
            <Link
              href="/"
              className="text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              ← Map
            </Link>
            <Link
              href="/historical/yearly"
              className="text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              Yearly totals
            </Link>
          </div>
          <span className="w-fit rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-300">
            Historical summary
          </span>
          <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
            Hectares burned by month
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            {monthlyFireHeatmap.metric} Color scale is logarithmic — most BC fire activity is
            concentrated in a few summer months, so a linear scale would make everything outside
            July–August look blank.
          </p>
        </header>

        <HeatmapGrid data={monthlyFireHeatmap} />

        <footer className="flex flex-col gap-1 text-xs text-zinc-500 dark:text-zinc-500">
          <p>
            Source: {monthlyFireHeatmap.source}. Contains information licensed under the{" "}
            {monthlyFireHeatmap.licence}.
          </p>
          <p>
            Data last refreshed: {lastUpdated.toLocaleString("en-CA")}
            {monthlyFireHeatmap.excludedRecordsMissingDate > 0 && (
              <>
                {" "}
                · {monthlyFireHeatmap.excludedRecordsMissingDate} records excluded (no reported
                date)
              </>
            )}
          </p>
        </footer>
      </main>
    </div>
  );
}
