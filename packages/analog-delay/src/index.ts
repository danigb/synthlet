import {
  createRegistrar,
  createWorkletConstructor,
  ParamInput,
} from "./_worklet";
import { PARAMS } from "./params";
import { PROCESSOR } from "./processor";

export const registerAnalogDelayWorklet = createRegistrar(
  "ANALOG_DELAY",
  PROCESSOR,
);

export { AnalogDelayMode } from "./dsp";

export type AnalogDelayInputs = {
  /** Delay time in seconds, 0.02 to 1.5. Changes bend pitch. */
  time?: ParamInput;
  /** Loop gain, 0 to 1.2. Above 1 self-oscillates, bounded by the limiter. */
  feedback?: ParamInput;
  /** Dry/wet, 0 to 1. */
  mix?: ParamInput;
  /** Level envelope across the mode's tap positions, 0 (first tap only) to 1. */
  taps?: ParamInput;
  /** Composite wear, 0 to 1: wobble, saturation, bandwidth loss and noise. */
  age?: ParamInput;
  /** Wow and flutter depth, 0 to 1, scaling on top of whatever `age` implies. */
  wobble?: ParamInput;
  /** L/R time offset as a ratio, 0 (mono-compatible) to 1. */
  spread?: ParamInput;
  /** `AnalogDelayMode`: 0 Tape, 1 BBD. Intermediate values wipe between them. */
  mode?: ParamInput;
  /**
   * Longest delay the buffers are sized for, in seconds (default 1.5). Not an
   * AudioParam: it allocates the lines, so it is fixed at construction. Tap
   * offsets are clamped to it rather than allocating for the longest one.
   */
  maxTime?: number;
};

export type AnalogDelayWorkletNode = AudioWorkletNode & {
  time: AudioParam;
  feedback: AudioParam;
  mix: AudioParam;
  taps: AudioParam;
  age: AudioParam;
  wobble: AudioParam;
  spread: AudioParam;
  mode: AudioParam;
  dispose(): void;
};

/**
 * A glide-based echo with tape and bucket-brigade character, multi-tap heads
 * and a single wear control.
 *
 * ```ts
 * const delay = AnalogDelay(ac, { time: 0.3, feedback: 0.6, age: 0.4 });
 * source.connect(delay).connect(ac.destination);
 * ```
 */
export const AnalogDelay = createWorkletConstructor<
  AnalogDelayWorkletNode,
  AnalogDelayInputs
>({
  processorName: "AnalogDelayProcessor",
  descriptors: PARAMS,
  workletOptions: (inputs) => ({
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [2],
    processorOptions: { maxTime: inputs.maxTime },
  }),
});

export { Compound, disposable } from "./_worklet";
export type {
  CompoundNode,
  ConnectedUnit,
  Connector,
  Disposable,
  ParamDescriptor,
  ParamInput,
} from "./_worklet";
