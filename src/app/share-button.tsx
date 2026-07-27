"use client";

import { useState } from "react";

export function ShareButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    if (navigator.share) {
      try {
        await navigator.share({ title: "Canada Wildfires", text, url });
      } catch {
        // user cancelled the native share sheet - not an error
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // clipboard unavailable - silently no-op, link is still visible in the address bar
    }
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      className="label flex items-center gap-1.5 text-[var(--amber)] transition-colors hover:text-[var(--ember)]"
    >
      <span>{copied ? "Link Copied" : "Share"}</span>
      <span aria-hidden="true">{copied ? "✓" : "↗"}</span>
    </button>
  );
}
