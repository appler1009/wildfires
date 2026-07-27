import { ImageResponse } from "next/og";
import yearlyFireTotals from "@/data/yearly-fire-totals.json";

export const runtime = "nodejs";
export const alt = "Canada Wildfires — live and historical wildfire tracker";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

async function loadAnton() {
  const css = await fetch("https://fonts.googleapis.com/css2?family=Anton&display=swap").then(
    (r) => r.text(),
  );
  const match = css.match(/src: url\(([^)]+)\) format\('(opentype|truetype)'\)/);
  const url = match?.[1];
  if (!url) return null;
  return fetch(url).then((r) => r.arrayBuffer());
}

export default async function OpengraphImage() {
  const rows = yearlyFireTotals.rows as { year: number; hectares_burned: number }[];
  const recordYear = rows.reduce((a, b) => (b.hectares_burned > a.hectares_burned ? b : a));
  const fontData = await loadAnton();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background:
            "radial-gradient(ellipse 120% 90% at 12% -10%, rgba(255,90,31,0.28), transparent 55%), #0d0b09",
          padding: "72px",
          fontFamily: fontData ? "Anton" : "sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div
            style={{
              display: "flex",
              alignSelf: "flex-start",
              fontSize: 22,
              letterSpacing: 4,
              color: "#ffb020",
              border: "2px solid #4a4030",
              padding: "8px 18px",
              textTransform: "uppercase",
            }}
          >
            Latest &amp; Historical Tracker
          </div>
          <div style={{ display: "flex", fontSize: 108, color: "#f3ecdf", lineHeight: 1.02 }}>
            Canada
          </div>
          <div style={{ display: "flex", fontSize: 108, color: "#ff5a1f", lineHeight: 1.02 }}>
            Wildfires
          </div>
        </div>

        <div style={{ display: "flex", gap: 64 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", fontSize: 60, color: "#f3ecdf" }}>
              {new Intl.NumberFormat("en-CA").format(Math.round(recordYear.hectares_burned))}
            </div>
            <div style={{ display: "flex", fontSize: 22, letterSpacing: 3, color: "#a89a83" }}>
              HECTARES BURNED, {recordYear.year} (RECORD SEASON)
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: fontData ? [{ name: "Anton", data: fontData, style: "normal", weight: 400 }] : [],
    },
  );
}
