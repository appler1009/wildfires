import Link from "next/link";
import { FireMap } from "./fire-map-loader";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <FireMap />
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-200 bg-zinc-50 px-4 py-2 text-xs text-zinc-500 dark:border-zinc-800 dark:bg-black dark:text-zinc-500 sm:px-8">
        <span>
          Source: BC Data Catalogue. Contains information licensed under the Open Government
          Licence – British Columbia. Live status is reference information, not exact real-time
          ground truth.
        </span>
        <div className="flex gap-4">
          <Link
            href="/historical/yearly"
            className="font-medium text-orange-700 hover:text-orange-800 dark:text-orange-400 dark:hover:text-orange-300"
          >
            Yearly totals
          </Link>
          <Link
            href="/historical/monthly"
            className="font-medium text-orange-700 hover:text-orange-800 dark:text-orange-400 dark:hover:text-orange-300"
          >
            Monthly heatmap
          </Link>
        </div>
      </div>
    </div>
  );
}
