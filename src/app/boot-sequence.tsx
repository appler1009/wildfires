"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { EmberParticles } from "./ember-particles";

// three.js is a heavy dependency (~1MB) that only this boot screen needs -
// load it in its own chunk, in parallel with (not blocking) the rest of the
// map's JS. Skipped entirely if the boot screen never mounts.
const WildfireGlobe = dynamic(() => import("./wildfire-globe").then((m) => m.WildfireGlobe), {
  ssr: false,
});

type ConnectionStatus = { bc: boolean; on: boolean; qc: boolean; cwfis: boolean };

const CHANNELS: { key: keyof ConnectionStatus; label: string }[] = [
  { key: "bc", label: "BC DATA CATALOGUE" },
  { key: "on", label: "ONTARIO GEOHUB / LIO" },
  { key: "qc", label: "SOPFEU QUEBEC" },
  { key: "cwfis", label: "CWFIS / NRCAN SATELLITE" },
];

// A brief themed boot screen on first load - purely for first-impression
// impact. Holds for a minimum duration even if data arrives instantly (a
// flash of nothing would undercut the effect, and the globe deserves a
// couple of seconds of rotation), then fades once both the timer and the
// real data fetch are done. The channel list reflects each source's actual
// fetch state, not a decorative always-green checklist.
export function BootSequence({
  ready,
  connected,
}: {
  ready: boolean;
  connected: ConnectionStatus;
}) {
  const [visible, setVisible] = useState(true);
  const [minTimeDone, setMinTimeDone] = useState(false);
  const fading = ready && minTimeDone;

  useEffect(() => {
    const t = setTimeout(() => setMinTimeDone(true), 2200);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!fading) return;
    const t = setTimeout(() => setVisible(false), 600);
    return () => clearTimeout(t);
  }, [fading]);

  if (!visible) return null;

  return (
    <div
      className={`fixed inset-0 z-[2000] flex flex-col items-center justify-center overflow-hidden bg-[var(--bg)] transition-opacity duration-600 ${
        fading ? "opacity-0" : "opacity-100"
      }`}
    >
      <div className="absolute inset-0 opacity-90">
        <WildfireGlobe />
      </div>
      <EmberParticles density={1.4} />
      <div className="relative flex flex-col items-center gap-5 px-6 text-center">
        <h1 className="animate-reveal font-display text-4xl leading-none tracking-wide text-[var(--ink)] drop-shadow-[0_2px_24px_rgba(0,0,0,0.9)] sm:text-6xl">
          Canada Wildfires
        </h1>
        <div className="animate-reveal-delay-1 label text-[var(--ink-faint)]">
          Initializing Wildfire Telemetry
        </div>
        <div className="flex flex-col items-start gap-1">
          {CHANNELS.map((channel, i) => {
            const isConnected = connected[channel.key];
            return (
              <div
                key={channel.key}
                className="label animate-reveal flex items-center gap-2 text-[var(--ink-faint)]"
                style={{ animationDelay: `${0.35 + i * 0.15}s` }}
              >
                <span className={isConnected ? "text-[var(--safe)]" : "text-[var(--ink-faint)]"}>
                  {isConnected ? "●" : "○"}
                </span>
                <span>{channel.label}</span>
                <span className="text-[var(--ink-faint)]">
                  {isConnected ? "Connected" : "Connecting…"}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
