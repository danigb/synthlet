"use client";

import type { Control } from "../../patches/define";
import type { PatchRuntime } from "../useLessonPatch";
import { Button } from "./Button";
import { Gate } from "./Gate";
import { KeyboardKeys } from "./KeyboardControl";
import { Select } from "./Select";
import { Slider } from "./Slider";
import { Toggle } from "./Toggle";
import { XY } from "./XY";

/*
 * One renderer per kind, and the switch that picks it.
 *
 * It is the only place in the section that knows what a `kind` looks like, and
 * that is the whole architecture in one function: a patch writes `kind:
 * "slider"` and knows nothing else, a lesson writes the control's id and knows
 * less than that, and a redesign is a different file in this directory.
 */
export function renderControl(control: Control, runtime: PatchRuntime) {
  switch (control.kind) {
    case "slider":
      return <Slider control={control} runtime={runtime} />;
    case "select":
      return <Select control={control} runtime={runtime} />;
    case "toggle":
      return <Toggle control={control} runtime={runtime} />;
    case "xy":
      return <XY control={control} runtime={runtime} />;
    case "gate":
      return <Gate control={control} runtime={runtime} />;
    case "button":
      return <Button control={control} runtime={runtime} />;
    case "keyboard":
      return (
        <KeyboardKeys
          source={control}
          runtime={runtime}
          label={control.label}
        />
      );
  }
}

/**
 * How much of a row a control wants.
 *
 * A pad and a keyboard are gestures rather than values and read badly in a
 * column half the widget wide; everything else pairs up. Layout, so it lives
 * here rather than in any manifest.
 */
export function isWide(control: Control): boolean {
  return control.kind === "xy" || control.kind === "keyboard";
}
