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
  /**
   * Onset randomisation, 0 to 1. Each interval is drawn from
   * `mean * (1 +- jitter)`, so the density is unchanged and only the grid
   * dissolves. 0 is a metronomic stream.
   */
  jitter?: ParamInput;
  /**
   * Probability a scheduled grain is skipped, 0 to 1. Unlike `jitter` this
   * lowers the density; 0.1 to 0.2 is the erratic-contact texture.
   */
  intermittency?: ParamInput;
  /** Grain duration in milliseconds, 1 to 1000. Independent of `rate`. */
  duration?: ParamInput;
  /** Per-grain duration randomisation, 0 to 1, as a total width. */
  durationSpread?: ParamInput;
  /** How far back grains start, 0 (freshest) to 1 (the reachable end). */
  position?: ParamInput;
  /** Per-grain read origin randomisation, 0 to 1. Reaches back from `position`. */
  spray?: ParamInput;
  /** Per-grain transposition in semitones, -24 to +24. */
  pitch?: ParamInput;
  /** Per-grain pitch randomisation in semitones, 0 to 24, as a total width. */
  pitchSpread?: ParamInput;
  /** Probability a grain plays backwards, 0 to 1. */
  reverse?: ParamInput;
  /** Envelope asymmetry: 0 expodec, 0.5 a symmetric bell, 1 reversed expodec. */
  shape?: ParamInput;
  /** Stereo centre, -1 to +1. Constant power for mono in, balance for stereo. */
  pan?: ParamInput;
  /** Per-grain pan randomisation, 0 to 1, as a half width. */
  panSpread?: ParamInput;
  /** Grain gain, 0 to 1. The ceiling `levelSpread` hangs from. */
  level?: ParamInput;
  /** Per-grain gain randomisation, 0 to 1. Downward from `level`. */
  levelSpread?: ParamInput;
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
  /**
   * Seed for the per-grain randomisation (default `0x9e3779b9`). Not an
   * `AudioParam`: it seeds a generator at construction. Two nodes given the same
   * seed and the same parameters produce the same cloud, which is reproducible
   * by design - pass different seeds to two nodes to double a source without
   * correlating them.
   */
  seed?: number;
};

export type GraniteWorkletNode = AudioWorkletNode & {
  rate: AudioParam;
  jitter: AudioParam;
  intermittency: AudioParam;
  duration: AudioParam;
  durationSpread: AudioParam;
  position: AudioParam;
  spray: AudioParam;
  pitch: AudioParam;
  pitchSpread: AudioParam;
  reverse: AudioParam;
  shape: AudioParam;
  pan: AudioParam;
  panSpread: AudioParam;
  level: AudioParam;
  levelSpread: AudioParam;
  wet: AudioParam;
  dispose(): void;
};

/**
 * A granular delay: a cloud of overlapping, windowed, pitch-shifted reads of
 * the last few seconds of its input.
 *
 * Every per-grain quantity is a `(centre, spread)` pair, drawn once per grain -
 * Truax's control model. Every spread defaults to 0, where the module is
 * deterministic and every grain is identical; turning them up is what makes a
 * cloud out of a stream.
 *
 * `jitter` and `intermittency` are the two that randomise the *stream* rather
 * than a grain: the first scatters the onsets without changing the density, the
 * second drops grains and lowers it.
 *
 * ```ts
 * const granite = Granite(ac, { rate: 40, duration: 60, pitch: 12 });
 * const cloud = Granite(ac, {
 *   rate: 80, duration: 40, durationSpread: 0.4,
 *   spray: 0.3, pitchSpread: 7, panSpread: 1,
 *   jitter: 0.8, intermittency: 0.15,
 * });
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
      seed: inputs.seed,
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
