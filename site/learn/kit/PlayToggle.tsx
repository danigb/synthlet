"use client";

import type { PatchRuntime } from "./useLessonPatch";

/**
 * The gate, and the only way a lesson page ever makes a sound.
 *
 * It is the docs examples' rule with a name: a page must not arrive making a
 * noise, so the patch's last node is a gain at zero and this is the click that
 * opens it - the same click that resumes the context, because a browser will
 * only start audio from a gesture and this is the gesture the reader made.
 *
 * A `button` with `aria-pressed`, not a checkbox and not a div: it is a control
 * with two states that changes something immediately, which is what
 * `aria-pressed` means, and the reader who arrives on it with a keyboard gets
 * the same sound as the one who clicked.
 */
export function PlayToggle({ runtime }: { runtime: PatchRuntime }) {
  const building = runtime.status === "building";
  const failed = runtime.status === "failed";

  return (
    <button
      type="button"
      aria-pressed={runtime.playing}
      aria-label={runtime.playing ? "Stop" : "Play"}
      disabled={failed}
      className={
        "shrink-0 rounded-learn border border-learn-border px-3 py-1 font-learn-text text-sm " +
        (runtime.playing
          ? "bg-learn-accent text-learn-bg"
          : "bg-learn-bg text-learn-ink hover:border-learn-accent")
      }
      onClick={() => runtime.setPlaying(!runtime.playing)}
    >
      {failed ? "Unavailable" : runtime.playing ? "Stop" : "Play"}
      {building ? (
        <span className="ml-1 text-xs text-learn-ink-muted">…</span>
      ) : null}
    </button>
  );
}
