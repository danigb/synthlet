import {
  createRegistrar,
  createWorkletConstructor,
  ParamInput,
} from "./_worklet";
import { PARAMS } from "./params";
import { PROCESSOR } from "./processor";

export const registerGraniteWorklet = createRegistrar("GRANITE", PROCESSOR);

export type GraniteInputs = {
  /** Grains per second, 0 to 2000. 0 emits none. */
  rate?: ParamInput;
  /** Grain duration in milliseconds, 1 to 1000. Independent of `rate`. */
  duration?: ParamInput;
  /** How far back grains start, 0 (freshest) to 1 (the reachable end). */
  position?: ParamInput;
  /** Per-grain transposition in semitones, -24 to +24. */
  pitch?: ParamInput;
  /** Envelope asymmetry: 0 expodec, 0.5 a symmetric bell, 1 reversed expodec. */
  shape?: ParamInput;
  /** Dry/wet, 0 to 1. 0 is an exact bypass. */
  wet?: ParamInput;
  /**
   * Grains allocated at construction (default 64). Not an `AudioParam`: it
   * allocates the pool. A stream denser than the pool drops grains rather than
   * stealing one that is playing.
   */
  maxGrains?: number;
  /**
   * How far back `position` reaches, in seconds (default 4). Not an
   * `AudioParam`: it allocates the two delay lines, about 2 MB at 44.1 kHz.
   * A grain can be at most a quarter of it, so a shorter buffer shortens the
   * longest grain.
   */
  bufferSeconds?: number;
};

export type GraniteWorkletNode = AudioWorkletNode & {
  rate: AudioParam;
  duration: AudioParam;
  position: AudioParam;
  pitch: AudioParam;
  shape: AudioParam;
  wet: AudioParam;
  dispose(): void;
};

/**
 * A granular delay: a cloud of overlapping, windowed, pitch-shifted reads of
 * the last few seconds of its input.
 *
 * ```ts
 * const granite = Granite(ac, { rate: 40, duration: 60, pitch: 12 });
 * source.connect(granite).connect(ac.destination);
 * ```
 */
export const Granite = createWorkletConstructor<
  GraniteWorkletNode,
  GraniteInputs
>({
  processorName: "GraniteProcessor",
  descriptors: PARAMS,
  workletOptions: (inputs) => ({
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [2],
    processorOptions: {
      maxGrains: inputs.maxGrains,
      bufferSeconds: inputs.bufferSeconds,
    },
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
