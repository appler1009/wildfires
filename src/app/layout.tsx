import type { Metadata } from "next";
import { Anton, IBM_Plex_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const anton = Anton({
  variable: "--font-anton",
  weight: "400",
  subsets: ["latin"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  weight: ["400", "500", "600"],
  subsets: ["latin"],
});

const title = "Canada Wildfires";
const description =
  "Latest wildfire status and over a century of historical trends across Canada — BC, Ontario, Quebec, and satellite-tracked hotspots nationwide.";

// Hardcoded rather than derived from VERCEL_PROJECT_PRODUCTION_URL: that env
// var reflects whichever domain Vercel considers "primary" for the project,
// which doesn't necessarily match the domain we actually want canonical
// (canada-wildfires.vercel.app, plural - matching the app's own name).
const siteUrl =
  process.env.NODE_ENV === "production" ? "https://canada-wildfires.vercel.app" : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title,
  description,
  openGraph: {
    title,
    description,
    type: "website",
    siteName: "Canada Wildfires",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

export const viewport = {
  themeColor: "#0d0b09",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${anton.variable} ${plexMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        {children}
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          // Runs before hydration so a stored theme choice doesn't flash
          // the OS-preference theme first, then swap. Matches the doc's
          // placement exactly: after {children}, inside <body>.
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||t==='light')document.documentElement.dataset.theme=t;}catch(e){}})();",
          }}
        />
      </body>
    </html>
  );
}
