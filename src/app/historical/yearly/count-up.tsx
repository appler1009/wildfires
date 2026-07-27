"use client";

import { useEffect, useRef, useState } from "react";

function formatNumber(n: number) {
  return new Intl.NumberFormat("en-CA").format(Math.round(n));
}

// Animates from 0 to value once on mount - a stat that "arrives" rather than
// just appearing, without looping or drawing attention after the first beat.
export function CountUp({ value, duration = 900 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState(0);
  const start = useRef<number | null>(null);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame: number;
    if (reduced) {
      frame = requestAnimationFrame(() => setDisplay(value));
      return () => cancelAnimationFrame(frame);
    }
    const step = (t: number) => {
      if (start.current === null) start.current = t;
      const progress = Math.min(1, (t - start.current) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(value * eased);
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);

  return <>{formatNumber(display)}</>;
}
