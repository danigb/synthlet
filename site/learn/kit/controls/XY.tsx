"use client";

import { useEffect, useRef, useState } from "react";
import type { ControlAxis, XYControl } from "../../patches/define";
import { formatValue, toPosition, toValue, type ScaleSpec } from "../scale";
import type { PatchRuntime } from "../useLessonPatch";
import { Field } from "./Field";

/*
 * Two parameters under one finger.
 *
 * It exists for the Playground and for Part 50's joystick lesson: some pairs of
 * controls are one gesture - a filter's cutoff and its resonance, a wobble's
 * rate and its depth - and two sliders make the reader do arithmetic to find
 * the corner. Each axis is a `ControlAxis`, which is a slider without a label
 * of its own, so the taper rules are the same ones.
 *
 * Keyboard-nudgeable, because a pad that only a pointer can reach is a control
 * some readers do not have.
 */

const spec = (axis: ControlAxis<any>): ScaleSpec => ({
  min: axis.min,
  max: axis.max,
  scale: axis.scale,
  unit: axis.unit,
});

/** One arrow key. Fine enough to hear a step, coarse enough to cross the pad. */
const NUDGE = 0.02;

export function XY({
  control,
  runtime,
}: {
  control: XYControl<any>;
  runtime: PatchRuntime;
}) {
  const pad = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(() => ({
    x: toPosition(spec(control.x), control.x.default ?? control.x.min),
    // Up is more, the way every pad in every synth works, so the stored
    // position is the value's and the drawing inverts it.
    y: toPosition(spec(control.y), control.y.default ?? control.y.min),
  }));

  const move = (next: { x: number; y: number }) => {
    const x = Math.min(1, Math.max(0, next.x));
    const y = Math.min(1, Math.max(0, next.y));
    setPosition({ x, y });
    runtime.write(control.x.param, toValue(spec(control.x), x));
    runtime.write(control.y.param, toValue(spec(control.y), y));
  };

  useEffect(() => {
    if (!runtime.synth) return;
    setPosition({
      x: toPosition(
        spec(control.x),
        runtime.read(control.x.param, control.x.default ?? control.x.min),
      ),
      y: toPosition(
        spec(control.y),
        runtime.read(control.y.param, control.y.default ?? control.y.min),
      ),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runtime.synth]);

  const track = (event: React.PointerEvent) => {
    const box = pad.current?.getBoundingClientRect();
    if (!box) return;
    move({
      x: (event.clientX - box.left) / box.width,
      y: 1 - (event.clientY - box.top) / box.height,
    });
  };

  const values =
    `${control.x.label} ${formatValue(spec(control.x), toValue(spec(control.x), position.x))}, ` +
    `${control.y.label} ${formatValue(spec(control.y), toValue(spec(control.y), position.y))}`;

  return (
    <Field label={control.label} value={values} help={control.help}>
      <div
        ref={pad}
        role="application"
        tabIndex={0}
        aria-label={`${control.label}: ${control.x.label} across, ${control.y.label} up`}
        aria-valuetext={values}
        className="relative aspect-[2/1] w-full touch-none rounded-learn border border-learn-border bg-learn-bg"
        onPointerDown={(event) => {
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          runtime.ensure();
          track(event);
        }}
        onPointerMove={(event) => {
          if (event.buttons === 0) return;
          track(event);
        }}
        onKeyDown={(event) => {
          const step =
            event.key === "ArrowLeft"
              ? { x: -NUDGE, y: 0 }
              : event.key === "ArrowRight"
                ? { x: NUDGE, y: 0 }
                : event.key === "ArrowDown"
                  ? { x: 0, y: -NUDGE }
                  : event.key === "ArrowUp"
                    ? { x: 0, y: NUDGE }
                    : undefined;
          if (!step) return;
          event.preventDefault();
          move({ x: position.x + step.x, y: position.y + step.y });
        }}
      >
        <span
          aria-hidden
          className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-learn-accent"
          style={{
            left: `${position.x * 100}%`,
            top: `${(1 - position.y) * 100}%`,
          }}
        />
      </div>
    </Field>
  );
}
