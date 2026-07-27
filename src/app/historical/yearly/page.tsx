import Link from "next/link";
import yearlyFireTotals from "@/data/yearly-fire-totals.json";
import { CountUp } from "./count-up";

type YearRow = {
  year: number;
  fire_count: number;
  hectares_burned: number;
};

function formatNumber(n: number) {
  return new Intl.NumberFormat("en-CA").format(n);
}

export default function Home() {
  const rows = yearlyFireTotals.rows as YearRow[];
  const maxHectares = Math.max(...rows.map((r) => r.hectares_burned));
  const recordYear = rows.reduce((a, b) => (b.hectares_burned > a.hectares_burned ? b : a));
  const lastUpdated = new Date(yearlyFireTotals.generatedAt);

  return (
    <div className="min-h-screen px-6 py-14 sm:px-16">
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-10">
        <header className="animate-reveal flex flex-col gap-3">
          <Link
            href="/"
            className="label w-fit text-[var(--ink-faint)] transition-colors hover:text-[var(--ember)]"
          >
            ← Back to map
          </Link>
          <span className="label w-fit border border-[var(--border-strong)] px-2.5 py-1 text-[var(--amber)]">
            Historical Summary
          </span>
          <h1 className="font-display text-4xl leading-none tracking-wide text-[var(--ink)] sm:text-5xl">
            Hectares Burned by Year
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-[var(--ink-muted)]">
            Sum of mapped fire area (hectares) and fire count per season, since {rows[0].year}. BC
            and Ontario use their own datasets (most current and complete for those provinces); the
            rest of Canada uses the National Fire Database, which currently extends to 2023. This is
            a historical summary — not live operational data.
          </p>
        </header>

        <div className="animate-reveal-delay-1 flex flex-col justify-between gap-4 border border-[var(--ember-dim)] bg-[color-mix(in_srgb,var(--ember)_10%,var(--surface))] px-6 py-5 sm:flex-row sm:items-center">
          <div>
            <div className="label text-[var(--ember)]">Record Season</div>
            <div className="font-display text-3xl tracking-wide text-[var(--ink)] sm:text-4xl">
              {recordYear.year}
            </div>
          </div>
          <div className="flex gap-8 tabular">
            <div>
              <div className="text-2xl text-[var(--ink)] sm:text-3xl">
                <CountUp value={recordYear.hectares_burned} />
              </div>
              <div className="label">Hectares Burned</div>
            </div>
            <div>
              <div className="text-2xl text-[var(--ink)] sm:text-3xl">
                <CountUp value={recordYear.fire_count} />
              </div>
              <div className="label">Fires</div>
            </div>
          </div>
        </div>

        <div className="animate-reveal-delay-2 flex flex-col gap-1 overflow-x-auto border border-[var(--border)] bg-[var(--surface)] p-6">
          <div className="flex min-w-[640px] items-end gap-[2px]" style={{ height: 220 }}>
            {rows.map((row, i) => (
              <div
                key={row.year}
                className="animate-bar group relative flex-1 bg-[var(--ember)] transition-opacity hover:opacity-80"
                style={
                  {
                    height: `${(row.hectares_burned / maxHectares) * 100}%`,
                    opacity: row.year === recordYear.year ? 1 : 0.55,
                    "--bar-i": i,
                  } as React.CSSProperties
                }
                title={`${row.year}: ${formatNumber(row.hectares_burned)} ha across ${row.fire_count} fires`}
              />
            ))}
          </div>
          <div className="label tabular mt-2 flex min-w-[640px] justify-between">
            <span>{rows[0].year}</span>
            <span>{rows[Math.floor(rows.length / 2)].year}</span>
            <span>{rows[rows.length - 1].year}</span>
          </div>
        </div>

        <div className="overflow-x-auto border border-[var(--border)]">
          <table className="w-full min-w-[420px] text-left text-sm">
            <thead className="label bg-[var(--surface-2)] text-[var(--ink-faint)]">
              <tr>
                <th className="px-4 py-2 font-normal">Year</th>
                <th className="px-4 py-2 font-normal">Fires</th>
                <th className="px-4 py-2 font-normal">Hectares Burned</th>
              </tr>
            </thead>
            <tbody>
              {[...rows]
                .reverse()
                .slice(0, 10)
                .map((row) => (
                  <tr key={row.year} className="border-t border-[var(--border)]">
                    <td className="px-4 py-2 text-[var(--ink)]">{row.year}</td>
                    <td className="tabular px-4 py-2 text-[var(--ink-muted)]">
                      {formatNumber(row.fire_count)}
                    </td>
                    <td className="tabular px-4 py-2 text-[var(--ink-muted)]">
                      {formatNumber(row.hectares_burned)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        <footer className="flex flex-col gap-1 border-t border-[var(--border)] pt-4 text-[11px] text-[var(--ink-faint)]">
          <p>
            Source: {yearlyFireTotals.source}. Contains information licensed under the{" "}
            {yearlyFireTotals.licence}.
          </p>
          <p>Data last refreshed: {lastUpdated.toLocaleString("en-CA")}</p>
        </footer>

        <Link
          href="/historical/monthly"
          className="label w-fit text-[var(--amber)] transition-colors hover:text-[var(--ember)]"
        >
          View monthly heatmap →
        </Link>
      </main>
    </div>
  );
}
