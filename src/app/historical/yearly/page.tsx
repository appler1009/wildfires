import Link from "next/link";
import yearlyFireTotals from "@/data/yearly-fire-totals.json";

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
  const lastUpdated = new Date(yearlyFireTotals.generatedAt);

  return (
    <div className="min-h-screen bg-zinc-50 px-6 py-16 font-sans dark:bg-black sm:px-16">
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-8">
        <header className="flex flex-col gap-2">
          <Link
            href="/"
            className="w-fit text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            ← Map
          </Link>
          <span className="w-fit rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-300">
            Historical summary
          </span>
          <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
            Canada hectares burned by year
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            Sum of mapped fire area (hectares) and fire count per season, since {rows[0].year}. BC
            uses its own dataset (most current and complete); the rest of Canada uses the National
            Fire Database, which currently extends to 2023. This is a historical summary — not live
            operational data.
          </p>
        </header>

        <div className="flex flex-col gap-1 overflow-x-auto rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex min-w-[640px] items-end gap-[2px]" style={{ height: 220 }}>
            {rows.map((row) => (
              <div
                key={row.year}
                className="group relative flex-1 rounded-t-sm bg-orange-400 transition-colors hover:bg-orange-500 dark:bg-orange-600 dark:hover:bg-orange-500"
                style={{ height: `${(row.hectares_burned / maxHectares) * 100}%` }}
                title={`${row.year}: ${formatNumber(row.hectares_burned)} ha across ${row.fire_count} fires`}
              />
            ))}
          </div>
          <div className="mt-2 flex min-w-[640px] justify-between text-[10px] text-zinc-500 dark:text-zinc-500">
            <span>{rows[0].year}</span>
            <span>{rows[Math.floor(rows.length / 2)].year}</span>
            <span>{rows[rows.length - 1].year}</span>
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full min-w-[420px] text-left text-sm">
            <thead className="bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
              <tr>
                <th className="px-4 py-2 font-medium">Year</th>
                <th className="px-4 py-2 font-medium">Fires</th>
                <th className="px-4 py-2 font-medium">Hectares burned</th>
              </tr>
            </thead>
            <tbody>
              {[...rows]
                .reverse()
                .slice(0, 10)
                .map((row) => (
                  <tr key={row.year} className="border-t border-zinc-100 dark:border-zinc-900">
                    <td className="px-4 py-2 text-black dark:text-zinc-50">{row.year}</td>
                    <td className="px-4 py-2 text-zinc-700 dark:text-zinc-300">
                      {formatNumber(row.fire_count)}
                    </td>
                    <td className="px-4 py-2 text-zinc-700 dark:text-zinc-300">
                      {formatNumber(row.hectares_burned)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        <footer className="flex flex-col gap-1 text-xs text-zinc-500 dark:text-zinc-500">
          <p>
            Source: {yearlyFireTotals.source}. Contains information licensed under the{" "}
            {yearlyFireTotals.licence}.
          </p>
          <p>Data last refreshed: {lastUpdated.toLocaleString("en-CA")}</p>
        </footer>

        <Link
          href="/historical/monthly"
          className="w-fit text-sm font-medium text-orange-700 hover:text-orange-800 dark:text-orange-400 dark:hover:text-orange-300"
        >
          View monthly heatmap →
        </Link>
      </main>
    </div>
  );
}
