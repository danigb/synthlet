"use client";

import { useEffect, useState } from "react";
import type { SelectControl } from "../../patches/define";
import type { PatchRuntime } from "../useLessonPatch";
import { Field } from "./Field";

/**
 * A list of names, written as an index.
 *
 * The library's rule, met at the surface: the reader picks `Sawtooth`, the
 * `AudioParam` receives `2`. The names are the patch's, in the order the DSP
 * numbers them, which is why the manifest gives an array and not a map - the
 * index *is* the value, and a map would let the two drift apart.
 */
export function Select({
  control,
  runtime,
}: {
  control: SelectControl<any>;
  runtime: PatchRuntime;
}) {
  const fallback = control.default ?? 0;
  const [index, setIndex] = useState(fallback);

  useEffect(() => {
    if (!runtime.synth) return;
    setIndex(Math.round(runtime.read(control.param, fallback)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runtime.synth]);

  const choose = (next: number) => {
    setIndex(next);
    runtime.write(control.param, next);
  };

  return (
    <Field
      label={control.label}
      help={control.help}
      onReset={
        control.default === undefined
          ? undefined
          : () => choose(control.default as number)
      }
    >
      <select
        className="w-full rounded-learn border border-learn-border bg-learn-bg px-2 py-1 font-learn-text text-sm text-learn-ink"
        aria-label={control.label}
        value={index}
        onChange={(event) => choose(Number(event.target.value))}
      >
        {control.options.map((name, position) => (
          <option key={name} value={position}>
            {name}
          </option>
        ))}
      </select>
    </Field>
  );
}
