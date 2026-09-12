import {
  createRegistrar,
  createWorkletConstructor,
  ParamInput,
} from "./_worklet";
import { createLevelsReader, LevelsReader } from "./_levels";
import {
  DEFAULT_LOOKAHEAD_MS,
  GAIN_REDUCTION,
  latencySamples,
  LEVELS_LAYOUT_VERSION,
  LEVELS_LENGTH,
} from "./dsp";
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
  /**
   * Report gain reduction. **Off by default**: nearly free, but a limiter sits
   * on every master chain and a processor posting to nobody is waste.
   *
   * Turns on `getLevels()` and `subscribe()`, which are the same contract
   * `@synthlet/level-meter` publishes - so `LevelMeterUI` and a React hook
   * written against the meter read this with no change.
   */
  meter?: boolean;
  /** How often the readings are posted, in ms. Default 16, about one frame. */
  postIntervalMs?: number;
};

/** One reading of how hard the limiter is working. */
export type LimiterLevels = {
  /**
   * The block's largest gain reduction, in dB: `20·log10` of the smallest gain
   * applied. 0 when the limiter is doing nothing, -6 when it took 6 dB off.
   *
   * `NaN` while `meter` is off - "not measured" and "not reducing" are
   * different answers, exactly as they are next door.
   */
  readonly gainReduction: number;
  /** Monotonic; changes when the reading changes. */
  readonly version: number;
};

// Carried on `inputs` so it reaches `workletOptions`, which is where the buffer
// has to be handed to the processor. A symbol rather than a field, because it
// is not part of the public input type.
const LEVELS = Symbol("levels");

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
  /**
   * How hard the limiter is working. The same object every call and
   * allocation-free, so a renderer can read it once per animation frame.
   */
  getLevels(): LimiterLevels;
  /**
   * Call `listener` when the reading changes; returns the unsubscribe. At most
   * once per animation frame, and never while `meter` is off.
   */
  subscribe(listener: (levels: LimiterLevels) => void): () => void;
  /**
   * Which way the reading reaches the main thread - shared memory where the
   * page is cross-origin isolated, a posted copy where it is not. Diagnostics
   * only; the number is the same either way.
   *
   * `undefined` while `meter` is off, because then nothing is transported.
   */
  readonly transport: "shared" | "message" | undefined;
  dispose(): void;
};

// `createWorkletConstructor`'s generic is the *parameter* map, and its
// constraint is `ParamInput` - so the construction options that ride alongside
// (`lookahead`, `meter`, `postIntervalMs`) are read off the same object with a
// cast rather than widened into it.
type LookaheadLimiterParams = {
  threshold?: ParamInput;
  release?: ParamInput;
  gain?: ParamInput;
};

const create = createWorkletConstructor<
  LookaheadLimiterWorkletNode,
  LookaheadLimiterParams
>({
  processorName: "LookaheadLimiterProcessor",
  descriptors: PARAMS,
  workletOptions: (inputs) => {
    const options = inputs as LookaheadLimiterInputs;
    const reader = (inputs as any)[LEVELS] as LevelsReader | undefined;
    return {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      // No outputChannelCount: the limiter follows its input's channel count.
      // The metering fields only appear when metering is on, so an unmetered
      // limiter hands the processor exactly what it always did.
      processorOptions: {
        lookahead: options.lookahead ?? DEFAULT_LOOKAHEAD_MS,
        ...(reader && {
          meter: true,
          levelsBuffer: reader.buffer,
          postIntervalMs: options.postIntervalMs,
        }),
      },
    };
  },
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
    // The transport from `scripts/_levels.ts` - the same file
    // `@synthlet/level-meter` reads, which is what lets one renderer and one
    // hook draw both without adaptation.
    const reader = inputs.meter
      ? createLevelsReader({
          length: LEVELS_LENGTH,
          layoutVersion: LEVELS_LAYOUT_VERSION,
          name: "LookaheadLimiter",
        })
      : undefined;

    const node = create(
      context,
      reader ? ({ ...inputs, [LEVELS]: reader } as any) : inputs,
    );

    if (reader && !reader.shared) {
      node.port.onmessage = (event: MessageEvent) =>
        reader.receive(event.data as Float32Array);
    }

    // One object, reused, so a renderer reads it once per frame with no
    // garbage. `NaN` while the meter is off: "not measured" and "not reducing"
    // are different answers.
    const levels: LimiterLevels = {
      get gainReduction() {
        if (!reader) return NaN;
        if (reader.shared) reader.read();
        return reader.view[GAIN_REDUCTION];
      },
      get version() {
        return reader ? reader.version : 0;
      },
    };
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
      transport: reader?.transport,
      getLevels: () => levels,
      subscribe: (listener: (levels: LimiterLevels) => void) =>
        reader ? reader.subscribe(() => listener(levels)) : () => {},
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
