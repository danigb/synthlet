"use client";

import type { Diagram, View } from "../../patches/define";
import type { TokenColors } from "../useTokenColors";
import type { PatchRuntime } from "../useLessonPatch";
import { KeyboardKeys } from "../controls/KeyboardControl";
import { DiagramView } from "./DiagramView";
import { MeterView } from "./MeterView";
import { PatternView } from "./PatternView";
import { ScopeView } from "./ScopeView";
import { SpectrumView } from "./SpectrumView";

/*
 * One renderer per view kind, and the switch that picks it.
 *
 * The `meter` view is missing on purpose: the widget's frame puts it in the
 * header beside Play, because "is it making a sound" belongs with "make a
 * sound" and not in the row of pictures. `LessonWidget` pulls it out before it
 * gets here, which is why `renderView` returns nothing for it.
 */
export function renderView(
  view: View,
  runtime: PatchRuntime,
  colors: TokenColors,
  diagram?: Diagram,
) {
  switch (view.kind) {
    case "scope":
      return (
        <ScopeView
          source={view.source}
          label={view.label}
          options={view.options}
          runtime={runtime}
          color={colors.audio}
        />
      );
    case "spectrum":
      return (
        <SpectrumView
          source={view.source}
          label={view.label}
          options={view.options}
          runtime={runtime}
          color={colors.audio}
          markColor={colors.control}
        />
      );
    case "keyboard":
      return (
        <KeyboardKeys
          source={{
            noteOn: view.noteOn,
            noteOff: view.noteOff,
            octaves: view.options?.octaves,
            from: view.options?.from,
          }}
          runtime={runtime}
          label={view.label ?? "Keyboard"}
        />
      );
    case "pattern":
      return (
        <PatternView
          source={view.source}
          label={view.label}
          runtime={runtime}
        />
      );
    case "diagram":
      return (
        <DiagramView
          diagram={diagram}
          label={view.label}
          options={view.options}
        />
      );
    case "meter":
      return null;
  }
}

export { MeterView };

/**
 * Which views want the whole width.
 *
 * A keyboard and a pattern are read left to right and break in a column; a
 * scope and a spectrum are pictures and pair up on a wide screen. Layout, so it
 * lives here.
 */
export function isWideView(view: View): boolean {
  return view.kind === "keyboard" || view.kind === "pattern";
}
