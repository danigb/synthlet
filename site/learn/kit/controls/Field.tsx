"use client";

import type { ReactNode } from "react";

/*
 * The frame every control sits in.
 *
 * One row: the label on the left, the readout on the right, the control under
 * both, the help line under that. Every renderer uses it, which is what makes
 * a widget with a slider, a menu and a switch in it look like one instrument
 * rather than three - and what makes changing that a single edit.
 */
export function Field({
  label,
  value,
  help,
  onReset,
  children,
}: {
  label: string;
  /** The formatted current value, when the control has one worth printing. */
  value?: string;
  help?: string;
  /** Shown only when the manifest gave the control a `default`. */
  onReset?: () => void;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 font-learn-text">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-sm text-learn-ink">{label}</span>
        <span className="flex shrink-0 items-baseline gap-1">
          {value ? (
            <span className="font-learn-mono text-xs text-learn-ink-muted">
              {value}
            </span>
          ) : null}
          {onReset ? (
            <button
              type="button"
              aria-label={`Reset ${label}`}
              title={`Reset ${label}`}
              className="rounded-learn px-1 text-xs text-learn-ink-muted hover:text-learn-accent"
              onClick={onReset}
            >
              ⟲
            </button>
          ) : null}
        </span>
      </div>
      <div className="mt-1">{children}</div>
      {help ? (
        <p className="mt-1 text-xs text-learn-ink-muted">{help}</p>
      ) : null}
    </div>
  );
}
