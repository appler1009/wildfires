import type { Metadata } from "next";
import Link from "next/link";
import monthlyFireHeatmap from "@/data/monthly-fire-heatmap.json";
import { DownloadCsvButton } from "../../download-csv-button";
import { EmberParticles } from "../../ember-particles";
import { ThemeToggle } from "../../theme-toggle";
import { HeatmapGrid } from "./heatmap-grid";

export const metadata: Metadata = {
  title: "Monthly Heatmap — Canada Wildfires",
  description: "Hectares burned by month and year across Canada, as a heatmap.",
};

export default function MonthlyPage() {
  const lastUpdated = new Date(monthlyFireHeatmap.generatedAt);

  return (
    <div className="relative min-h-screen overflow-hidden px-6 py-14 sm:px-16">
      <EmberParticles density={0.6} />
      <main className="relative mx-auto flex w-full max-w-5xl flex-col gap-8">
        <header className="animate-reveal flex flex-col gap-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex gap-4">
              <Link
                href="/"
                className="text-ember-glow label text-[var(--ink-faint)] hover:text-[var(--ember)]"
              >
                ← Map
              </Link>
              <Link
                href="/historical/yearly"
                className="text-ember-glow label text-[var(--ink-faint)] hover:text-[var(--ember)]"
              >
                Yearly Totals
              </Link>
            </div>
            <ThemeToggle />
          </div>
          <span className="label w-fit border border-[var(--border-strong)] px-2.5 py-1 text-[var(--amber)]">
            Historical Summary
          </span>
          <h1 className="font-display text-4xl leading-none tracking-wide text-[var(--ink)] sm:text-5xl">
            Hectares Burned by Month
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-[var(--ink-muted)]">
            {monthlyFireHeatmap.metric} Color scale is logarithmic — most fire activity is
            concentrated in a few summer months, so a linear scale would make everything outside
            July–August look blank.
          </p>
        </header>

        <div className="animate-reveal-delay-1">
          <HeatmapGrid data={monthlyFireHeatmap} />
        </div>

        <div>
          <DownloadCsvButton
            rows={monthlyFireHeatmap.rows}
            columns={[
              { key: "year", label: "Year" },
              { key: "month", label: "Month" },
              { key: "fire_count", label: "Fires" },
              { key: "hectares_burned", label: "Hectares Burned" },
            ]}
            filename="canada-wildfires-monthly-totals.csv"
          />
        </div>

        <footer className="flex flex-col gap-1 border-t border-[var(--border)] pt-4 text-[11px] text-[var(--ink-faint)]">
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
