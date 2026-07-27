"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";

const SHORTCUTS: [string, string][] = [
  ["← / →", "Step through the timeline"],
  ["Space", "Play / pause the timeline"],
  ["Satellite / Streets", "Switch the map's base imagery"],
  ["⟲", "Reset the map view"],
  ["1× / 2× / 4×", "Change autoplay speed"],
  ["◐ / ☾ / ☀", "Cycle theme: auto / dark / light"],
];

export function HelpButton() {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, right: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);

  function toggle() {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setCoords({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
    }
    setOpen((o) => !o);
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls="help-panel"
        title="Controls & shortcuts"
        aria-label="Controls & shortcuts"
        className="ember-glow label flex h-6 w-6 items-center justify-center border border-[var(--border-strong)] text-[var(--ink-muted)] hover:border-[var(--ember)] hover:text-[var(--ember)]"
      >
        ?
      </button>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <>
            {/* Click-outside catcher */}
            <button
              type="button"
              tabIndex={-1}
              aria-hidden="true"
              className="fixed inset-0 z-[2999] cursor-default"
              onClick={() => setOpen(false)}
            />
            {/* Portalled to <body> so it always paints above the map's
                Leaflet panes, regardless of any stacking context an
                ancestor establishes - a nested absolute overlay here
                got reliably out-stacked by the map canvas otherwise. */}
            <div
              id="help-panel"
              style={{ top: coords.top, right: coords.right }}
              className="animate-reveal fixed z-[3000] flex w-64 flex-col gap-2 border border-[var(--border-strong)] bg-[var(--surface)] p-3 text-[11px] text-[var(--ink)] shadow-lg"
            >
              <div className="label text-[var(--ember)]">Controls</div>
              {SHORTCUTS.map(([key, desc]) => (
                <div key={key} className="flex items-baseline justify-between gap-3">
                  <span className="tabular shrink-0 text-[var(--ink)]">{key}</span>
                  <span className="text-right text-[var(--ink-muted)]">{desc}</span>
                </div>
              ))}
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
