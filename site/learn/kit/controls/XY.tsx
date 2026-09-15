"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
 *
 * **Two things that are not obvious.**
 *
 * A drag is tracked by *pointer id*, captured on the way down, so that a finger
 * or a mouse that leaves the pad mid-sweep keeps moving it and a second pointer
 * cannot take it over. `buttons` alone cannot tell those apart, and a touch that
 * slid off the edge and stopped responding was the bug this replaced.
 *
 * And a sweep's writes are coalesced to one per animation frame. A pointer
 * reports tens to hundreds of positions a second and a screen redraws sixty
 * times; the ones in between are two parameter writes and a React render each,
 * for a picture nobody sees. The *ramp* that keeps a sweep from zippering is not
 * here - it belongs to whatever the axis is bound to, because only a patch has
 * the context's clock. `learn/patches/playground.ts` does it with
 * `setTargetAtTime`.
 */

const spec = (axis: ControlAxis<any>): ScaleSpec => ({
  min: axis.min,
  max: axis.max,
  scale: axis.scale,
  unit: axis.unit,
});

/** One arrow key. Fine enough to hear a step, coarse enough to cross the pad. */
const NUDGE = 0.02;

interface Position {
  x: number;
  y: number;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export function XY({
  control,
  runtime,
  onGesture,
}: {
  control: XYControl<any>;
  runtime: PatchRuntime;
  /**
   * A drag started, or finished. The Playground uses the end of one to re-read
   * the sliders the pad has been moving underneath them; a lesson passes
   * nothing and never notices.
   */
  onGesture?: (phase: "start" | "end") => void;
}) {
  const pad = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<Position>(() => ({
    x: toPosition(spec(control.x), control.x.default ?? control.x.min),
    // Up is more, the way every pad in every synth works, so the stored
    // position is the value's and the drawing inverts it.
    y: toPosition(spec(control.y), control.y.default ?? control.y.min),
  }));

  // The live position, and the frame that will write it. A ref rather than the
  // state, because a pointer can move three times between two renders and each
  // of them has to start from where the last one left off.
  const latest = useRef<Position>(position);
  const frame = useRef(0);
  const dragging = useRef<number | null>(null);

  const commit = useCallback(
    (next: Position) => {
      latest.current = next;
      setPosition(next);
      runtime.write(control.x.param, toValue(spec(control.x), next.x));
      runtime.write(control.y.param, toValue(spec(control.y), next.y));
    },
    // The manifest's accessors are closures declared once, at module scope.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [runtime],
  );

  const flush = useCallback(() => {
    frame.current = 0;
    commit(latest.current);
  }, [commit]);

  const schedule = useCallback(
    (next: Position) => {
      latest.current = next;
      if (frame.current) return;
      frame.current = requestAnimationFrame(flush);
    },
    [flush],
  );

  // A pad left mid-drag must not leave a frame queued against an unmounted
  // component, and must not leave a pointer captured either.
  useEffect(
    () => () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    },
    [],
  );

  useEffect(() => {
    if (!runtime.synth) return;
    const next = {
      x: toPosition(
        spec(control.x),
        runtime.read(control.x.param, control.x.default ?? control.x.min),
      ),
      y: toPosition(
        spec(control.y),
        runtime.read(control.y.param, control.y.default ?? control.y.min),
      ),
    };
    latest.current = next;
    setPosition(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runtime.synth]);

  const at = (event: React.PointerEvent): Position | undefined => {
    const box = pad.current?.getBoundingClientRect();
    if (!box || box.width === 0 || box.height === 0) return undefined;
    return {
      x: clamp01((event.clientX - box.left) / box.width),
      y: clamp01(1 - (event.clientY - box.top) / box.height),
    };
  };

  const values =
    `${control.x.label} ${formatValue(spec(control.x), toValue(spec(control.x), position.x))}, ` +
    `${control.y.label} ${formatValue(spec(control.y), toValue(spec(control.y), position.y))}`;

  const end = (event: React.PointerEvent) => {
    if (dragging.current !== event.pointerId) return;
    dragging.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (frame.current) {
      cancelAnimationFrame(frame.current);
      flush();
    }
    onGesture?.("end");
  };

  return (
    <Field label={control.label} value={values} help={control.help}>
      <div
        ref={pad}
        role="application"
        tabIndex={0}
        aria-label={`${control.label}: ${control.x.label} across, ${control.y.label} up`}
        aria-valuetext={values}
        className="relative aspect-[2/1] w-full touch-none rounded-learn border border-learn-border bg-learn-bg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-learn-accent"
        onPointerDown={(event) => {
          if (dragging.current !== null) return;
          event.preventDefault();
          dragging.current = event.pointerId;
          event.currentTarget.setPointerCapture(event.pointerId);
          runtime.ensure();
          onGesture?.("start");
          const next = at(event);
          if (next) commit(next);
        }}
        onPointerMove={(event) => {
          if (dragging.current !== event.pointerId) return;
          const next = at(event);
          if (next) schedule(next);
        }}
        onPointerUp={end}
        onPointerCancel={end}
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
          // The page's own `←`/`→` turn the page, and a pad that let them
          // through would move and navigate on one key press.
          event.preventDefault();
          runtime.ensure();
          const from = latest.current;
          commit({
            x: clamp01(from.x + step.x),
            y: clamp01(from.y + step.y),
          });
          onGesture?.("end");
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
