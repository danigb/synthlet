"use client";

import type { ButtonControl } from "../../patches/define";
import type { PatchRuntime } from "../useLessonPatch";
import { Field } from "./Field";

/**
 * Do something once.
 *
 * The only control whose manifest entry is a function rather than a value:
 * rebuild a wavetable, reseed a random, restart a pattern. `action(synth)`
 * returns the thing to call, so the patch closes over its own nodes and the kit
 * closes over nothing.
 */
export function Button({
  control,
  runtime,
}: {
  control: ButtonControl<any>;
  runtime: PatchRuntime;
}) {
  return (
    <Field label={control.label} help={control.help}>
      <button
        type="button"
        aria-label={control.label}
        className="w-full rounded-learn border border-learn-border bg-learn-bg px-3 py-1 font-learn-text text-sm text-learn-ink hover:border-learn-accent"
        onClick={() => runtime.call((synth) => control.action(synth)())}
      >
        {control.label}
      </button>
    </Field>
  );
}
