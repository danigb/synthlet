"use client";

import { CORE_PATH_SIZE } from "./chapters";
import { useProgress } from "./progress";

/**
 * How far along the core path you are.
 *
 * The core path is the twenty-two-lesson spine - the *Learning Synths*
 * equivalent - and it is the only thing worth counting, because the rest of the
 * section is a reference you dip into. The denominator is the path's planned
 * length rather than the number of lessons written so far: two of six would
 * read as nearly done, and two of twenty-two is the truth about the course.
 *
 * Absent from the server render, not merely zero there. A progress bar that
 * ships at 0% in the HTML flashes empty on every load for a reader who is
 * halfway through.
 */
export function CoreProgress({ core }: { core: string[] }) {
  const { ready, visited } = useProgress();
  if (!ready) return null;

  const total = Math.max(CORE_PATH_SIZE, core.length);
  const done = core.filter((url) => visited.has(url)).length;
  const percent = Math.round((done / total) * 100);

  return (
    <div className="my-6 max-w-learn font-learn-text">
      <div
        role="progressbar"
        aria-label="Core path"
        aria-valuenow={done}
        aria-valuemin={0}
        aria-valuemax={total}
        className="h-1 w-full overflow-hidden rounded-learn bg-learn-border"
      >
        <div
          className="h-full bg-learn-accent"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="mt-2 text-sm text-learn-ink-muted">
        {done} of {total} core lessons
      </p>
    </div>
  );
}
