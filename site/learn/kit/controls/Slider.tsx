"use client";

import { useEffect, useState } from "react";
import type { SliderControl } from "../../patches/define";
import {
  formatValue,
  POSITIONS,
  toPosition,
  toValue,
  type ScaleSpec,
} from "../scale";
import type { PatchRuntime } from "../useLessonPatch";
import { Field } from "./Field";

/**
 * A value between two others.
 *
 * The taper is `scale.ts`'s and the number under the thumb is a `<input
 * type="range">`'s integer position, which is why nothing here does arithmetic:
 * a knob that rounded differently from the readout beside it would be a widget
 * that disagrees with itself, and the reader would be right.
 *
 * Knobs versus sliders is a theme question and this is the kit's answer. A knob
 * is a different renderer for the same manifest entry; no patch changes.
 */
export function Slider({
  control,
  runtime,
}: {
  control: SliderControl<any>;
  runtime: PatchRuntime;
}) {
  const spec: ScaleSpec = {
    min: control.min,
    max: control.max,
    scale: control.scale,
    unit: control.unit,
    step: control.step,
  };
  const fallback = control.default ?? control.min;
  const [value, setValue] = useState(fallback);

  // The graph arrives late, and it may arrive with a preset already loaded into
  // it - so the slider asks the parameter where it is rather than assuming the
  // reader's last position is still true.
  useEffect(() => {
    if (!runtime.synth) return;
    setValue(runtime.read(control.param, fallback));
    // `control.param` is a closure the manifest declared once; `fallback` is a
    // number from the same manifest. Neither changes for the life of the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runtime.synth]);

  const move = (next: number) => {
    setValue(next);
    runtime.write(control.param, next);
  };

  return (
    <Field
      label={control.label}
      value={formatValue(spec, value)}
      help={control.help}
      onReset={
        control.default === undefined
          ? undefined
          : () => move(control.default as number)
      }
    >
      <input
        type="range"
        className="w-full accent-learn-accent"
        min={0}
        max={POSITIONS}
        step={1}
        value={Math.round(toPosition(spec, value) * POSITIONS)}
        aria-label={control.label}
        aria-valuetext={formatValue(spec, value)}
        onChange={(event) =>
          move(toValue(spec, Number(event.target.value) / POSITIONS))
        }
      />
    </Field>
  );
}
