"use client";

import { useEffect, useState } from "react";

type ThemeChoice = "auto" | "dark" | "light";

const NEXT: Record<ThemeChoice, ThemeChoice> = { auto: "dark", dark: "light", light: "auto" };
const ICON: Record<ThemeChoice, string> = { auto: "◐", dark: "☾", light: "☀" };
const LABEL: Record<ThemeChoice, string> = {
  auto: "Theme: Auto (follows system)",
  dark: "Theme: Dark",
  light: "Theme: Light",
};

export function ThemeToggle() {
  // Always starts at "auto" so the very first client render matches the
  // server-rendered markup exactly - the layout's beforeInteractive script
  // already stamps data-theme onto <html> ahead of hydration, so reading it
  // here in a lazy initializer would mismatch the server's "auto" render
  // and trigger a hydration error. Corrected client-side, after mount.
  const [theme, setTheme] = useState<ThemeChoice>("auto");

  useEffect(() => {
    const attr = document.documentElement.dataset.theme;
    if (attr !== "dark" && attr !== "light") return;
    const t = setTimeout(() => setTheme(attr), 0);
    return () => clearTimeout(t);
  }, []);

  function cycle() {
    const next = NEXT[theme];
    setTheme(next);
    if (next === "auto") {
      delete document.documentElement.dataset.theme;
      localStorage.removeItem("theme");
    } else {
      document.documentElement.dataset.theme = next;
      localStorage.setItem("theme", next);
    }
  }

  return (
    <button
      type="button"
      onClick={cycle}
      title={LABEL[theme]}
      aria-label={LABEL[theme]}
      className="ember-glow label flex h-6 w-6 items-center justify-center border border-[var(--border-strong)] text-[var(--ink-muted)] hover:border-[var(--ember)] hover:text-[var(--ember)]"
    >
      <span aria-hidden="true">{ICON[theme]}</span>
    </button>
  );
}
