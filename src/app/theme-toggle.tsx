"use client";

import { useState } from "react";

type ThemeChoice = "auto" | "dark" | "light";

const NEXT: Record<ThemeChoice, ThemeChoice> = { auto: "dark", dark: "light", light: "auto" };
const ICON: Record<ThemeChoice, string> = { auto: "◐", dark: "☾", light: "☀" };
const LABEL: Record<ThemeChoice, string> = {
  auto: "Theme: Auto (follows system)",
  dark: "Theme: Dark",
  light: "Theme: Light",
};

export function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeChoice>(() => {
    if (typeof document === "undefined") return "auto";
    const attr = document.documentElement.dataset.theme;
    return attr === "dark" || attr === "light" ? attr : "auto";
  });

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
