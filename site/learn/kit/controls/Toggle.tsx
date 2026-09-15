"use client";

import { useEffect, useState } from "react";
import type { ToggleControl } from "../../patches/define";
import type { PatchRuntime } from "../useLessonPatch";
import { Field } from "./Field";

/**
 * On or off.
 *
 * A two-valued parameter, not a different kind of thing - the manifest says so
 * and this renderer agrees: it writes 1 and 0 into the same accessor a slider
 * would. `role="switch"` rather than a checkbox because that is what a screen
 * reader should announce for something that changes the sound immediately
 * rather than on submit.
 */
export function Toggle({
  control,
  runtime,
}: {
  control: ToggleControl<any>;
  runtime: PatchRuntime;
}) {
  const fallback = control.default ?? 0;
  const [on, setOn] = useState(fallback >= 0.5);

  useEffect(() => {
    if (!runtime.synth) return;
    setOn(runtime.read(control.param, fallback) >= 0.5);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runtime.synth]);

  const set = (next: boolean) => {
    setOn(next);
    runtime.write(control.param, next ? 1 : 0);
  };

  return (
    <Field label={control.label} help={control.help}>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={control.label}
        className={
          "rounded-learn border border-learn-border px-3 py-1 font-learn-text text-sm " +
          (on
            ? "bg-learn-accent text-learn-bg"
            : "bg-learn-bg text-learn-ink-muted")
        }
        onClick={() => set(!on)}
      >
        {on ? "On" : "Off"}
      </button>
    </Field>
  );
}
