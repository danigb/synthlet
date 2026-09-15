import {
  LEARN_VOICE_GROUPS,
  learnVoiceParams,
  presets,
  type LearnVoiceParam,
} from "@/learn/voice";
import type { PlaygroundState } from "./state";

/*
 * What the sound is, as thirty-one numbers.
 *
 * The Playground keeps its own model of the voice rather than asking the
 * `AudioParam`s, and it has to, for two reasons.
 *
 * The first is that it writes a link on every knob move, and a link says which
 * parameters *differ from the preset* - a question an `AudioParam` cannot
 * answer, because it does not know where it came from.
 *
 * The second is timing. `Instrument.setPreset` schedules with
 * `setValueAtTime`, and a parameter written that way does not report its new
 * value to a `.value` read in the same tick: the spec updates `[[current value]]`
 * at the start of a render quantum, not on the call. A gallery tile has to move
 * thirty-one sliders *now*, so the Playground writes `ref.value = x` instead -
 * which the spec does define as updating `[[current value]]` immediately - and
 * resolves the preset itself to know what to write.
 *
 * Resolving it here means this file has to agree with `resolvePreset` inside the
 * library. It is four lines of agreement - defaults, then the preset's own
 * entries - and `playground.test.ts` builds an instrument with a preset and
 * checks the two against each other for every sound in both banks.
 */

/** The thirty-one, in the order the Playground lays its groups out. */
export const PLAYGROUND_PARAMS: LearnVoiceParam[] = Object.values(
  LEARN_VOICE_GROUPS,
).flatMap((group) => [...group]);

export type VoiceValues = Record<LearnVoiceParam, number>;

/** Everything a build starts from, which is everything a link carries. */
export interface PlaygroundValues {
  preset?: string;
  values: VoiceValues;
  glide: number;
  voices: number;
  /** Absent when the link did not say; the pad then starts where the sound is. */
  xy?: [number, number];
}

/** The pool a Playground arrives with. The patch's own default. */
export const DEFAULT_VOICES = 8;

const defaults = (): VoiceValues => {
  const values = {} as VoiceValues;
  for (const name of PLAYGROUND_PARAMS) {
    values[name] = learnVoiceParams[name].default;
  }
  return values;
};

/**
 * A named sound as thirty-one numbers plus its glide.
 *
 * A preset is a list of *departures* from the bare voice, and the bare voice is
 * every parameter at its declared default - which is why `Init` is `{}`. An
 * unknown name is the bare voice too: a link naming a preset this version does
 * not have opens something playable rather than nothing.
 */
export function presetValues(preset?: string): {
  values: VoiceValues;
  glide: number;
} {
  const values = defaults();
  const bank = (preset && presets[preset]) || {};
  let glide = 0;

  for (const [name, amount] of Object.entries(bank)) {
    if (typeof amount !== "number") continue;
    // `glide` is one of the instrument's reserved preset keys, not a parameter:
    // the allocator applies it, so it is not in the table above.
    if (name === "glide") glide = amount;
    else if (name in learnVoiceParams) values[name as LearnVoiceParam] = amount;
  }

  return { values, glide };
}

/**
 * A link, as a sound.
 *
 * The preset first, then whatever the reader had moved on top of it. A
 * parameter this version no longer has is dropped rather than written, which is
 * what makes an old link open at all.
 */
export function stateValues(state: PlaygroundState): PlaygroundValues {
  const { values, glide } = presetValues(state.preset);

  for (const [name, amount] of Object.entries(state.params ?? {})) {
    if (name in learnVoiceParams) values[name as LearnVoiceParam] = amount;
  }

  return {
    preset: state.preset,
    values,
    glide: state.glide ?? glide,
    voices: state.voices ?? DEFAULT_VOICES,
    xy: state.xy,
  };
}
