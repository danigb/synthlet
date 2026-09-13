"use client";

import type { ReactNode } from "react";

/**
 * A caption over a picture.
 *
 * The shared `Scope` and `Spectrum` draw their own, because the documentation
 * has used them that way since the first example; everything the kit draws
 * itself uses this, so the two kinds of view sit at the same height and read as
 * one row.
 */
export function ViewFrame({
  label,
  children,
}: {
  label?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      {label ? (
        <div className="mb-1 font-learn-text text-xs text-learn-audio">
          {label}
        </div>
      ) : null}
      {children}
    </div>
  );
}
