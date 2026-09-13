import type { XYControl } from "@/learn/patches/define";
import {
  bindingPosition,
  bindingValue,
  padMapping,
  type PadMapping,
} from "@/learn/voice";
import type { VoiceValues } from "./values";

/*
 * The pad, as a control the kit can render.
 *
 * The patch declares one `xy` control and it is always the same two accessors -
 * a position across and a position up - because a pad whose *units* changed per
 * preset could not be put in a link, and the preset travels in the same link.
 * What changes per preset is what the two positions are bound to, which is
 * `learn/voice/mappings.ts`, and the two labels, which is this.
 */

/** The pad control for a preset: the patch's axes, the mapping's words. */
export function padControl(
  control: XYControl<any>,
  mapping: PadMapping,
  home: [number, number],
): XYControl<any> {
  return {
    ...control,
    x: { ...control.x, label: mapping.x.label, default: home[0] },
    y: { ...control.y, label: mapping.y.label, default: home[1] },
  };
}

/**
 * Where the pad sits when a sound is loaded.
 *
 * The first binding of each axis decides, because it is the one the axis is
 * named after: a `wow-bass` whose cutoff is at 260 Hz should arrive with the dot
 * a fifth of the way across rather than in a corner, so that the first thing a
 * drag does is continue the sound rather than replace it. The other bindings on
 * the axis follow the dot from there; there is no position that satisfies two
 * bindings at once, and pretending otherwise is how a pad jumps on first touch.
 */
export function padHome(
  mapping: PadMapping,
  values: VoiceValues,
): [number, number] {
  return [
    bindingPosition(mapping.x.bind[0], values[mapping.x.bind[0].param]),
    bindingPosition(mapping.y.bind[0], values[mapping.y.bind[0].param]),
  ];
}

/**
 * What a pad position means, as parameter values.
 *
 * The patch writes these into `AudioParam`s with a ramp; the page records the
 * same numbers so that the link it writes says what the reader is hearing. One
 * taper, in `mappings.ts`, called twice.
 */
export function padValues(
  mapping: PadMapping,
  [x, y]: [number, number],
): Partial<VoiceValues> {
  const moved: Partial<VoiceValues> = {};

  for (const [axis, position] of [
    [mapping.x, x],
    [mapping.y, y],
  ] as const) {
    for (const binding of axis.bind) {
      moved[binding.param] = bindingValue(binding, position);
    }
  }

  return moved;
}

export { padMapping };
