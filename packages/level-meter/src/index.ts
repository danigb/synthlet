import { PROCESSOR } from "./processor";
import { createRegistrar, disposable, ParamDescriptor } from "./_worklet";
export { LevelMeterUI } from "./meter-ui";

export const registerLevelMeterWorklet = createRegistrar(
  "LEVEL_METER",
  PROCESSOR,
);

export type LevelMeterInputs = {};

// The buffer layout, shared by both transports. Duplicated in `worklet.ts`,
// which is bundled on its own; ticket 09's `dsp.ts` is where the two meet.
//
//   [0]                       layout version
//   [1]                       channel count
//   [2]                       flags: clip latch, bit c for channel c
//   [HEADER + c*STRIDE + 0]   peak      (linear)
//   [HEADER + c*STRIDE + 1]   peak hold (linear)
//   [HEADER + c*STRIDE + 2]   rms       (linear)
//   [HEADER + c*STRIDE + 3]   true peak (linear)
//   [HEADER + n*STRIDE + 0]   LUFS momentary  (dB)
//   [HEADER + n*STRIDE + 1]   LUFS short-term (dB)
export const LEVELS_LAYOUT_VERSION = 1;
const HEADER = 3;
const STRIDE = 4;
const TAIL = 2;

const levelsLength = (maxChannels: number) =>
  HEADER + maxChannels * STRIDE + TAIL;

const DEFAULT_MAX_CHANNELS = 16;
// The flags word is one Float32, one bit per channel, and a Float32 holds
// integers exactly only up to 2^24 - so 24 channels is where "bit c for channel
// c" stops being exact. Nothing in the library goes near it; the point of the
// limit is that a typo cannot ask for a buffer of four million slots, and that
// the clip flags cannot quietly stop being reliable.
const MAX_MAX_CHANNELS = 24;

const DEFAULT_POST_INTERVAL_MS = 16;

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

/**
 * Which way the readings reach the main thread.
 *
 * `"shared"` is a `SharedArrayBuffer` the audio thread writes and this thread
 * reads - no `postMessage`, no per-frame round trip. It needs a cross-origin
 * isolated page, which a library cannot ask its consumer for: setting COOP and
 * COEP on a whole origin breaks that origin's other cross-origin embeds, and a
 * static host such as GitHub Pages cannot set headers at all.
 *
 * `"message"` is the processor posting a copy of the same buffer at
 * `postIntervalMs`. About 20 floats at 60 Hz - 4.8 KB/s - which is what the
 * precondition used to cost the package every page that is not isolated,
 * including its own documentation site.
 *
 * Diagnostics only. `getLevels()` reads the same view and returns the same
 * numbers either way, and no UI should branch on this.
 */
export type LevelMeterTransport = "shared" | "message";

export type LevelMeterWorkletNode = AudioWorkletNode & {
  dispose(): void;
  /** @deprecated Use `getLevels()`, which knows the channel count. */
  getPeaks(): Float32Array;
  readonly transport: LevelMeterTransport;
};

// SharedArrayBuffer exists in every current browser, but only *usable* on a
// cross-origin isolated page - and unusable ones are still constructible in
// some engines, so both halves are checked.
function sharedBufferAvailable(): boolean {
  return (
    typeof SharedArrayBuffer !== "undefined" &&
    typeof crossOriginIsolated !== "undefined" &&
    crossOriginIsolated
  );
}

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
  /**
   * How often the processor posts its readings when the transport is
   * `"message"`, in ms. Default 16, i.e. about one animation frame. Ignored
   * when the transport is `"shared"`.
   */
  postIntervalMs?: number;
};

export const LevelMeter = Object.assign(
  (
    context: AudioContext,
    options: LevelMeterOptions = {},
  ): LevelMeterWorkletNode => {
    const maxChannels = resolveMaxChannels(options.maxChannels);
    const length = levelsLength(maxChannels);

    const shared = sharedBufferAvailable();
    const levelsBuffer = shared
      ? new SharedArrayBuffer(length * Float32Array.BYTES_PER_ELEMENT)
      : undefined;
    // One view, whichever transport wrote it: shared memory the audio thread is
    // updating live, or the destination the posted copy lands in.
    const view = levelsBuffer
      ? new Float32Array(levelsBuffer)
      : new Float32Array(length);

    // The deprecated flat peak view, kept in step with the strided one.
    const peaks = new Float32Array(maxChannels);

    // The one place on the main thread where the view becomes readable. Under
    // `"message"` it runs when a frame arrives; under `"shared"` the memory is
    // already live, so it runs when a reader asks. Everything derived from the
    // view is derived here, so `subscribe`/`version` have somewhere to live.
    const readView = () => {
      for (let c = 0; c < maxChannels; c++)
        peaks[c] = view[HEADER + c * STRIDE];
    };

    // Hand-rolled rather than built with `createWorkletConstructor`: that helper
    // exists to wire `AudioParam`s from a `ParamInput` map, and the meter has no
    // parameters by design. What it does need is a `processorOptions` payload,
    // which the helper does not carry. Not an oversight - there is nothing here
    // for it to do.
    const node = new AudioWorkletNode(context, "LevelMeterProcessor", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      processorOptions: {
        levelsBuffer,
        maxChannels,
        releaseDbPerSecond: options.releaseDbPerSecond,
        holdMs: options.holdMs,
        clipHoldMs: options.clipHoldMs,
        clipThreshold: options.clipThreshold,
        postIntervalMs: options.postIntervalMs ?? DEFAULT_POST_INTERVAL_MS,
      },
    }) as LevelMeterWorkletNode;

    if (!shared) {
      node.port.onmessage = (event: MessageEvent) => {
        view.set(event.data as Float32Array);
        readView();
      };
    }

    Object.defineProperty(node, "transport", {
      value: shared ? "shared" : "message",
      enumerable: true,
    });

    node.getPeaks = () => {
      if (shared) readView();
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
