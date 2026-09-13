"use client";

import { useMemo } from "react";
import type { Control, LessonPatch } from "../patches/define";
import { getPatchSource } from "../patches";
import { CodeView } from "./CodeView";
import { isWide, renderControl } from "./controls";
import { PlayToggle } from "./PlayToggle";
import { useLessonPatch } from "./useLessonPatch";
import { useTokenColors } from "./useTokenColors";
import { isWideView, MeterView, renderView } from "./views";

/*
 * The widget every lesson shares.
 *
 * Fifty-seven lessons and one frame: a header with the patch's name, the play
 * gate and the meter; the views; the controls the lesson chose; the code. None
 * of it is decided by a lesson and none of it by a patch - a patch says a
 * control is a slider from 1 to 16 and a lesson says which controls to show,
 * and everything from there is this file and the tokens under it. That is what
 * makes the section redesignable in one place, and it is the only reason the
 * widget is one component rather than thirty.
 *
 * It arrives silent, and it arrives with nothing built. `useLessonPatch` has
 * the rest of that story.
 */
export function LessonWidget({
  patch,
  controls,
  preset,
}: {
  patch: LessonPatch;
  /** Already filtered by the lesson's `show`, in manifest order. */
  controls: Control[];
  preset?: string;
}) {
  // A new object every render would rebuild the audio graph; the two fields are
  // a lesson's and fixed for the life of the page.
  const options = useMemo(() => ({ preset }), [preset]);
  const runtime = useLessonPatch(patch, options);
  const { colors, markers } = useTokenColors();

  // The meter belongs beside Play: "is it making a sound" is the same question
  // as "make a sound", and it is the one view with a fixed place.
  const meter = patch.views.find((view) => view.kind === "meter");
  const pictures = patch.views.filter((view) => view.kind !== "meter");

  return (
    <figure className="my-6 max-w-learn overflow-hidden rounded-learn border border-learn-border bg-learn-surface p-learn text-learn-ink">
      {markers}

      <figcaption className="flex flex-wrap items-center justify-between gap-2">
        <span className="min-w-0 font-learn-text text-sm font-medium">
          {patch.label ?? patch.id}
          {preset ? (
            <span className="text-learn-ink-muted"> · {preset}</span>
          ) : null}
        </span>
        <span className="flex items-center gap-3">
          {meter && meter.kind === "meter" ? (
            <MeterView
              source={meter.source}
              label={meter.label}
              options={meter.options}
              runtime={runtime}
            />
          ) : null}
          <PlayToggle runtime={runtime} />
        </span>
      </figcaption>

      {pictures.length > 0 ? (
        <div className="mt-learn grid grid-cols-1 gap-learn sm:grid-cols-2">
          {pictures.map((view, index) => (
            <div
              key={`${view.kind}-${index}`}
              data-view={view.kind}
              className={isWideView(view) ? "sm:col-span-2" : undefined}
            >
              {renderView(view, runtime, colors, patch.diagram)}
            </div>
          ))}
        </div>
      ) : null}

      {controls.length > 0 ? (
        <div className="mt-learn grid grid-cols-1 gap-learn sm:grid-cols-2">
          {controls.map((control) => (
            <div
              key={control.id}
              // The id, in the markup: it is what a lesson wrote in `show`, and
              // it is how the headless pass finds a knob it means to move.
              data-control={control.id}
              className={isWide(control) ? "sm:col-span-2" : undefined}
            >
              {renderControl(control, runtime)}
            </div>
          ))}
        </div>
      ) : null}

      <CodeView
        id={patch.id}
        source={getPatchSource(patch.id)}
        code={patch.code}
      />
    </figure>
  );
}
