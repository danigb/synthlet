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

/** A plain object copy of one reading, for anything that needs to keep it. */
export type LevelsSnapshot = {
  channelCount: number;
  peak: number[];
  hold: number[];
  rms: number[];
  truePeak: number[];
  clipped: boolean[];
  momentary: number;
  shortTerm: number;
  version: number;
};

/**
 * One reading of the meter, in dB.
 *
 * The same object on every call and allocation-free, so a renderer can read it
 * once per animation frame without producing garbage. The raw view stays linear;
 * this converts, because every consumer converted anyway and having each of them
 * re-derive the `-Infinity` case is how floor bugs get written.
 */
export interface Levels {
  /** Channels the meter is measuring - the source's, not `maxChannels`. */
  readonly channelCount: number;
  /** Monotonic; changes when the readings change. */
  readonly version: number;
  /** dBFS, `-Infinity` for silence. */
  peak(channel: number): number;
  /** dBFS. The hold marker: a running maximum, parked and then released. */
  hold(channel: number): number;
  /** dBFS. */
  rms(channel: number): number;
  /** dBTP, or `NaN` while true-peak measurement is off. */
  truePeak(channel: number): number;
  clipped(channel: number): boolean;
  /** Clears every channel's clip latch. */
  clearClip(): void;
  /** LUFS momentary, or `NaN` while loudness measurement is off. */
  readonly momentary: number;
  /** LUFS short-term, or `NaN` while loudness measurement is off. */
  readonly shortTerm: number;
  /** Whether the processor has reported an error. */
  readonly error: boolean;
  /** A plain object copy - this one allocates, by definition. */
  snapshot(): LevelsSnapshot;
}

export type LevelMeterWorkletNode = AudioWorkletNode & {
  dispose(): void;
  /** @deprecated Use `getLevels()`, which knows the channel count. */
  getPeaks(): Float32Array;
  getLevels(): Levels;
  readonly transport: LevelMeterTransport;
};

// `Math.log10(0)` is already `-Infinity`, which is the whole point: a UI should
// not have to special-case a floor that should not exist.
const toDb = (magnitude: number) => 20 * Math.log10(magnitude);

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
   * How long the RMS one-pole takes to reach 99 % of a step, in ms. Default
   * 600 — K-Meter's average meter. Not the peak's release: they answer
   * different questions.
   */
  rmsMs?: number;
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
    // What the view held when `version` was last bumped.
    const previous = new Float32Array(length);

    let version = 0;
    let error = false;

    // The one place on the main thread where the view becomes readable. Under
    // `"message"` it runs when a frame arrives; under `"shared"` the memory is
    // already live, so it runs when a reader asks. Everything derived from the
    // view is derived here, so `subscribe` has somewhere to live.
    const readView = () => {
      // A page can only end up here with a mismatched bundle by registering two
      // versions of the processor in one context, where the registrar's cache
      // means the first one wins. `[0]` exists so that fails loudly instead of
      // reading a stride that moved. 0 is "no block has run yet".
      const layout = view[0];
      if (layout !== 0 && layout !== LEVELS_LAYOUT_VERSION) {
        throw Error(
          `LevelMeter: the registered processor writes layout ${layout}, this build reads ${LEVELS_LAYOUT_VERSION}`,
        );
      }

      let changed = false;
      for (let i = 0; i < length; i++) {
        if (previous[i] !== view[i]) {
          previous[i] = view[i];
          changed = true;
        }
      }
      if (!changed) return;

      version++;
      for (let c = 0; c < maxChannels; c++)
        peaks[c] = view[HEADER + c * STRIDE];
    };

    const slot = (channel: number) => HEADER + channel * STRIDE;

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
        rmsMs: options.rmsMs,
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

    // One object, reused. `truePeak`, `momentary` and `shortTerm` read NaN
    // rather than -Infinity while their measurement is off: "not measured" and
    // "silent" are different answers and a UI has to be able to tell them apart.
    const levels: Levels = {
      get channelCount() {
        return view[1];
      },
      get version() {
        return version;
      },
      get momentary() {
        return NaN;
      },
      get shortTerm() {
        return NaN;
      },
      get error() {
        return error;
      },
      peak: (channel) => toDb(view[slot(channel)]),
      hold: (channel) => toDb(view[slot(channel) + 1]),
      rms: (channel) => toDb(view[slot(channel) + 2]),
      truePeak: () => NaN,
      clipped: (channel) => ((view[2] >>> channel) & 1) === 1,
      clearClip() {
        node.port.postMessage({ type: "CLEAR_CLIP" });
        // The processor clears its own copy too; this is so a reader looking
        // before the next frame arrives sees the click it just made.
        view[2] = 0;
      },
      snapshot() {
        const count = view[1];
        const each = (read: (channel: number) => number) =>
          Array.from({ length: count }, (_, c) => read(c));
        return {
          channelCount: count,
          peak: each(levels.peak),
          hold: each(levels.hold),
          rms: each(levels.rms),
          truePeak: each(levels.truePeak),
          clipped: Array.from({ length: count }, (_, c) => levels.clipped(c)),
          momentary: levels.momentary,
          shortTerm: levels.shortTerm,
          version,
        };
      },
    };

    node.getLevels = () => {
      if (shared) readView();
      return levels;
    };

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
