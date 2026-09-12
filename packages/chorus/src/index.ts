import {
  createRegistrar,
  createWorkletConstructor,
  ParamInput,
} from "./_worklet";
import { PARAMS } from "./params";
import { PROCESSOR } from "./processor";

export const registerChorusWorklet = createRegistrar("CHORUS", PROCESSOR);

export type ChorusInputs = {
  /**
   * `ChorusMode`: 0 `JUNO`, 1 `ENSEMBLE`, 2 `DIMENSION`. Structural, and
   * cross-faded over 5 ms when it changes. Each voicing has its own sensible
   * settings for the four below - see `CHORUS_MODE_DEFAULTS`.
   */
  mode?: ParamInput;
  /** LFO rate in Hz, 0 to 7. 0 stops the LFOs, leaving a static comb. */
  rate?: ParamInput;
  /**
   * Excursion, 0 to 1, scaled per mode into milliseconds. Not milliseconds:
   * the useful depth depends on `rate` and on the voicing, so 1 means "as deep
   * as this rate and this voicing can carry".
   */
  depth?: ParamInput;
  /** Dry/wet, 0 to 1. The dry never falls below `1 - 0.3*mix`. */
  mix?: ParamInput;
  /** Stereo field control on the wet path, 0 (mono) to 1 (as generated). */
  width?: ParamInput;
};

export type ChorusWorkletNode = AudioWorkletNode & {
  mode: AudioParam;
  rate: AudioParam;
  depth: AudioParam;
  mix: AudioParam;
  width: AudioParam;
  dispose(): void;
};

export { CHORUS_MODE_DEFAULTS, ChorusMode } from "./dsp";

/**
 * A stereo chorus in three voicings: a Juno-style BBD chorus, a string-machine
 * ensemble, and a Dimension-style difference output that is wide without the
 * vibrato.
 *
 * ```ts
 * const chorus = Chorus(ac);
 * source.connect(chorus).connect(ac.destination);
 * ```
 */
export const Chorus = createWorkletConstructor<ChorusWorkletNode, ChorusInputs>(
  {
    processorName: "ChorusProcessor",
    descriptors: PARAMS,
    workletOptions: () => ({
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    }),
  },
);

export { Compound, disposable } from "./_worklet";
export type {
  CompoundNode,
  ConnectedUnit,
  Connector,
  Disposable,
  ParamDescriptor,
  ParamInput,
} from "./_worklet";
