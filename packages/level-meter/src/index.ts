import { PROCESSOR } from "./processor";
import { createRegistrar, disposable, ParamDescriptor } from "./_worklet";
export { LevelMeterUI } from "./meter-ui";

export const registerLevelMeterWorklet = createRegistrar(
  "LEVEL_METER",
  PROCESSOR,
);

export type LevelMeterInputs = {};

const DEFAULT_MAX_CHANNELS = 16;
// Web Audio's own ceiling on a node's channel count. Nothing in the library
// reaches it; the point of the limit is that a typo cannot ask for a buffer of
// four million slots.
const MAX_MAX_CHANNELS = 32;

// `options.maxChannels || 16` turned `0` into 16 - a bug hiding as a default -
// and passed everything else straight to the buffer constructor, so a negative
// number surfaced as `new SharedArrayBuffer(-4)` rather than as anything that
// named the option.
function resolveMaxChannels(value: number | undefined): number {
  if (value === undefined) return DEFAULT_MAX_CHANNELS;
  if (!Number.isInteger(value) || value < 1 || value > MAX_MAX_CHANNELS) {
    throw new RangeError(
      `LevelMeter: maxChannels must be an integer from 1 to ${MAX_MAX_CHANNELS}, got ${value}`,
    );
  }
  return value;
}

export type LevelMeterWorkletNode = AudioWorkletNode & {
  dispose(): void;
  getPeaks(): Float32Array;
};

// Ballistics are construction options, not `AudioParam`s. They are properties of
// the instrument, fixed for its life - the same reasoning `lookahead-limiter`
// gives for `lookaheadMs`. Making the package's first parameter out of a number
// nobody modulates would cost a rate declaration and a `params.ts` for
// `check:rates` to read, and buy nothing.
export type LevelMeterOptions = {
  /** Slots in the level buffer. Default 16. */
  maxChannels?: number;
  /** Peak fall rate, in dB per second. Default 8.7 - K-Meter's 26 dB / 3 s. */
  releaseDbPerSecond?: number;
  /** How long the hold marker parks at a new maximum, in ms. Default 1500. */
  holdMs?: number;
  /** How long the clip latch stays lit, in ms. Default 1500. */
  clipHoldMs?: number;
  /** Linear magnitude that counts as a clip. Default 1, i.e. 0 dBFS. */
  clipThreshold?: number;
};

export const LevelMeter = Object.assign(
  (
    context: AudioContext,
    options: LevelMeterOptions = {},
  ): LevelMeterWorkletNode => {
    const maxChannels = resolveMaxChannels(options.maxChannels);
    const peaksBuffer = new SharedArrayBuffer(
      maxChannels * Float32Array.BYTES_PER_ELEMENT,
    );
    const peaks = new Float32Array(peaksBuffer);
    // Hand-rolled rather than built with `createWorkletConstructor`: that helper
    // exists to wire `AudioParam`s from a `ParamInput` map, and the meter has no
    // parameters by design. What it does need is a `processorOptions` payload,
    // which the helper does not carry. Not an oversight - there is nothing here
    // for it to do.
    const node = new AudioWorkletNode(context, "LevelMeterProcessor", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      processorOptions: {
        peaksBuffer,
        releaseDbPerSecond: options.releaseDbPerSecond,
        holdMs: options.holdMs,
        clipHoldMs: options.clipHoldMs,
        clipThreshold: options.clipThreshold,
      },
    }) as LevelMeterWorkletNode;

    node.getPeaks = () => {
      return peaks;
    };

    return disposable(node);
  },
  // No parameters: the meter is configured by options, not AudioParams.
  { descriptors: [] as readonly ParamDescriptor[] },
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
