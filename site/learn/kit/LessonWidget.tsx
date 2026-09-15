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
import { DiagramLinkProvider, useDiagramLink } from "./views/diagram-link";

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

  /*
   * A keyboard is a view, never a control.
   *
   * `voice` declares its keys twice on purpose (`patches/define.ts`): as a view,
   * so a lesson that narrows the knobs down to one is still playable, and as a
   * control, so a lesson can write `show={["keyboard"]}` and mean "the keys are
   * what this page is about". Both resolve to the same component, so a lesson
   * that took the invitation used to get two sets of keys - one under the views
   * and an identical one in the panel.
   *
   * The view wins, because it is the copy no `show` can take away: naming the
   * keys changes nothing about what is drawn, which is the only answer that
   * reads the same whether a lesson names them or not. One filter, here, in the
   * file that already owns the layout decision - and free for every patch whose
   * views and controls do not overlap, which is all of them but one.
   */
  const viewKinds = new Set<string>(patch.views.map((view) => view.kind));
  const panel = controls.filter((control) => !viewKinds.has(control.kind));

  // Pointing at a knob lights its box in the diagram, and pointing at a box
  // lights its knobs. Inert - and free - for a patch that declares no diagram.
  // The panel, not the lesson's list: a box marks the knobs a reader can see.
  const link = useDiagramLink(panel);

  // The meter belongs beside Play: "is it making a sound" is the same question
  // as "make a sound", and it is the one view with a fixed place.
  const meter = patch.views.find((view) => view.kind === "meter");
  const pictures = patch.views.filter((view) => view.kind !== "meter");

  return (
    <figure
      // The patch's id, in the markup, for the same reader `data-control`
      // below is for: `check:sound` addresses one widget at a time, and a
      // failure that names the patch is a failure somebody can act on.
      data-patch={patch.id}
      className="my-6 max-w-learn overflow-hidden rounded-learn border border-learn-border bg-learn-surface p-learn text-learn-ink"
    >
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
        // The provider is here rather than around the figure because the
        // diagram is a view: it is the only thing below that reads the link,
        // and the panel below it holds the state and needs no context to.
        <DiagramLinkProvider value={link}>
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
        </DiagramLinkProvider>
      ) : null}

      {panel.length > 0 ? (
        <div className="mt-learn grid grid-cols-1 gap-learn sm:grid-cols-2">
          {panel.map((control) => (
            <div
              key={control.id}
              // The id, in the markup: it is what a lesson wrote in `show`, and
              // it is how the headless pass finds a knob it means to move.
              data-control={control.id}
              // And its kind, so that pass can tell a gate - the one control
              // that makes a note on its own - from a slider, without reading
              // a label that a redesign is free to reword.
              data-kind={control.kind}
              className={`${isWide(control) ? "sm:col-span-2" : ""} ${
                link.isLinked(control.id)
                  ? "rounded-learn ring-1 ring-learn-accent"
                  : ""
              }`}
              // Hover, and focus: the diagram's half of the same link.
              {...link.cellProps(control.id)}
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
