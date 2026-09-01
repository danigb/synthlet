import {
  createRegistrar,
  createWorkletConstructor,
  ParamInput,
} from "./_worklet";
import { DEFAULT_LOOKAHEAD_MS, latencySamples } from "./dsp";
import { PARAMS } from "./params";
import { PROCESSOR } from "./processor";

export const registerLookaheadLimiterWorklet = createRegistrar(
  "LOOKAHEAD_LIMITER",
  PROCESSOR,
);

export type LookaheadLimiterInputs = {
  threshold?: ParamInput;
  release?: ParamInput;
  gain?: ParamInput;
  /**
   * Lookahead window in ms (0.5-5, default 2). Not an AudioParam: it sizes the
   * delay line, so changing it would change the node's latency.
   */
  lookahead?: number;
};

export type LookaheadLimiterWorkletNode = AudioWorkletNode & {
  threshold: AudioParam;
  release: AudioParam;
  gain: AudioParam;
  /**
   * Samples of delay this node introduces: the lookahead window plus the
   * true-peak detector's group delay. Web Audio has no automatic delay
   * compensation, so a parallel dry path must be delayed by this much.
   */
  latencySamples: number;
  /** The same delay in seconds, for scheduling against `currentTime`. */
  latencyTime: number;
  dispose(): void;
};

const create = createWorkletConstructor<
  LookaheadLimiterWorkletNode,
  LookaheadLimiterInputs
>({
  processorName: "LookaheadLimiterProcessor",
  descriptors: PARAMS,
  workletOptions: (inputs) => ({
    numberOfInputs: 1,
    numberOfOutputs: 1,
    // No outputChannelCount: the limiter follows its input's channel count.
    processorOptions: { lookahead: inputs.lookahead ?? DEFAULT_LOOKAHEAD_MS },
  }),
});

/**
 * A true-peak brickwall limiter, for the last node before the destination.
 *
 * ```ts
 * const limiter = LookaheadLimiter(ac, { threshold: -1, gain: 6 });
 * source.connect(limiter).connect(ac.destination);
 * ```
 */
export const LookaheadLimiter = Object.assign(
  (context: AudioContext, inputs: LookaheadLimiterInputs = {}) => {
    const node = create(context, inputs);
    // `createWorkletConstructor`'s `postCreate` hook doesn't see the inputs, so
    // the latency - which depends on `lookahead` - is attached here instead.
    // Computing it on the main thread is legal precisely because `dsp.ts`
    // touches no worklet globals: this is the same pure function the processor
    // uses. `Object.assign` runs after `disposable()`, so it adds properties
    // without replacing the dispose cascade.
    const samples = latencySamples(
      inputs.lookahead ?? DEFAULT_LOOKAHEAD_MS,
      context.sampleRate,
    );
    return Object.assign(node, {
      latencySamples: samples,
      latencyTime: samples / context.sampleRate,
    });
  },
  { descriptors: PARAMS },
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
