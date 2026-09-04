import {
  createRegistrar,
  createWorkletConstructor,
  ParamInput,
} from "./_worklet";
import { PARAMS } from "./params";
import { PROCESSOR } from "./processor";

export const registerDigitalDelayWorklet = createRegistrar(
  "DIGITAL_DELAY",
  PROCESSOR,
);

export type DigitalDelayInputs = {
  /** Delay time in seconds, 0.0002 to 2. Changes preserve pitch. */
  time?: ParamInput;
  /** Loop gain, 0 to 1.2. Above 1 self-oscillates, bounded by the limiter. */
  feedback?: ParamInput;
  /** Dry/wet, 0 to 1. */
  mix?: ParamInput;
  /** Tilt on the feedback path, -1 (dark) to +1 (thin). 0 is a bypass. */
  tone?: ParamInput;
  /** Read-pointer excursion depth, 0 to 1. Bends pitch; `time` does not. */
  mod?: ParamInput;
  /** L/R time offset as a ratio, 0 (mono-compatible) to 1. */
  spread?: ParamInput;
  /** Feedback cross-feed, 0 (independent) to 1 (ping-pong). Decay-neutral. */
  cross?: ParamInput;
  /** Allpass diffusion in the loop, 0 (discrete repeats) to 1 (a wash). */
  diffuse?: ParamInput;
  /**
   * Longest delay the buffers are sized for, in seconds (default 2). Not an
   * AudioParam: it allocates the lines, so it is fixed at construction. Two
   * lines at the default cost about 1 MB.
   */
  maxTime?: number;
};

export type DigitalDelayWorkletNode = AudioWorkletNode & {
  time: AudioParam;
  feedback: AudioParam;
  mix: AudioParam;
  tone: AudioParam;
  mod: AudioParam;
  spread: AudioParam;
  cross: AudioParam;
  diffuse: AudioParam;
  dispose(): void;
};

/**
 * A stereo feedback delay with a filtered, saturated feedback path.
 *
 * ```ts
 * const delay = DigitalDelay(ac, { time: 0.25, feedback: 0.5, cross: 1 });
 * source.connect(delay).connect(ac.destination);
 * ```
 */
export const DigitalDelay = createWorkletConstructor<
  DigitalDelayWorkletNode,
  DigitalDelayInputs
>({
  processorName: "DigitalDelayProcessor",
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
