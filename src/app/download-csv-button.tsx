"use client";

// Builds a CSV client-side from data already on the page and triggers a
// download - no network request, just turning what's rendered into a file
// the visitor can open in a spreadsheet.
export function DownloadCsvButton<T extends Record<string, string | number>>({
  rows,
  columns,
  filename,
}: {
  rows: T[];
  columns: { key: keyof T; label: string }[];
  filename: string;
}) {
  function handleDownload() {
    const header = columns.map((c) => c.label).join(",");
    const body = rows
      .map((row) => columns.map((c) => String(row[c.key])).join(","))
      .join("\n");
    const blob = new Blob([`${header}\n${body}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button
      type="button"
      onClick={handleDownload}
      className="text-ember-glow label w-fit text-[var(--ink-faint)] hover:text-[var(--ember)]"
    >
      ↓ Download CSV
    </button>
  );
}
