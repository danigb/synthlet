"use client";

import { useProgress } from "./progress";

/**
 * The tick beside a lesson you have already opened.
 *
 * Nothing at all until the browser has read `localStorage`, which is why a
 * list of lessons has to tolerate this rendering to nothing: the exported HTML
 * has no ticks in it and never will.
 */
export function VisitedMark({ url }: { url: string }) {
  const { ready, visited } = useProgress();
  if (!ready || !visited.has(url)) return null;

  return (
    <span
      aria-label="visited"
      title="visited"
      className="shrink-0 text-learn-accent"
    >
      ✓
    </span>
  );
}
