import { PROCESSOR } from "./processor";
import {
  createRegistrar,
  disposable,
  Disposable,
  ParamDescriptor,
} from "./_worklet";
import { currentFrame, onAnimationFrame } from "./driver";
import {
  createScriptProcessorDriver,
  resolveBufferSize,
  ScriptProcessorDriver,
} from "./script-processor";
import type { LevelAnalyzer, LevelAnalyzerOptions } from "./dsp";
export { LevelMeterUI } from "./meter-ui";
// The dB-to-pixel arithmetic, from the file that needs it most. Every hand-built
// UI clamps a bar length and the canvas renderer clamps a gradient stop; they
// are the same function, and §C7 is what happens when it exists twice.
export { dbToUnit, formatDb } from "./meter-ui";
// The EBU R 128 delivery ceiling, from the core that measures against it: the
// number anyone reading `levels.truePeak()` is checking, and one every renderer
// would otherwise hardcode.
export { TRUE_PEAK_CEILING_DBTP } from "./dsp";
export type {
  LevelMeterUICanvas,
  LevelMeterUIColors,
  LevelMeterUIOptions,
  LevelsSource,
} from "./meter-ui";

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
//   [HEADER + n*STRIDE + 2]   LUFS integrated (dB)
export const LEVELS_LAYOUT_VERSION = 1;
const HEADER = 3;
const STRIDE = 4;
const TAIL = 3;

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

/** Called with the live accessor when the readings change. */
export type LevelsListener = (levels: Levels) => void;

/**
 * Which driver is producing the readings.
 *
 * `"worklet"` is the `AudioWorkletNode`, and what you get on any secure page.
 *
 * `"script-processor"` is the main-thread driver over the same core, for pages
 * the worklet cannot reach: `AudioWorklet` is `[SecureContext]`, so on plain
 * http `ac.audioWorklet` is simply `undefined`. It is also what a registration
 * that *rejects* falls back to - a CSP that blocks `blob:` scripts, say.
 *
 * The readings are the same either way; the engine is diagnostics, and the one
 * thing that differs is that a `ScriptProcessorNode`'s channel count is fixed
 * when it is built.
 */
export type LevelMeterEngine = "worklet" | "script-processor";

/** What both forms of the meter expose. */
export type LevelMeterApi = {
  /**
   * Resolves once the meter is measuring: the worklet registered, the node
   * built, the edge connected.
   *
   * Awaiting it is optional. Until it resolves the meter reads silence -
   * `channelCount` 0 and `-Infinity` everywhere - and never throws, so a UI can
   * be wired up in the same breath as the meter. It rejects only when no engine
   * can run at all.
   */
  readonly ready: Promise<void>;
  /** Which driver is running. Definitive once `ready` has resolved. */
  readonly engine: LevelMeterEngine;
  readonly transport: LevelMeterTransport;
  getLevels(): Levels;
  /** @deprecated Use `getLevels()`, which knows the channel count. */
  getPeaks(): Float32Array;
  /**
   * Call `listener` when the readings change; returns the unsubscribe.
   *
   * The shape `useSyncExternalStore`, a Svelte store and a plain callback all
   * consume without adaptation. `listener` is handed the same live accessor
   * `getLevels()` returns - read what you need from it, or take a
   * `snapshot()` if you mean to keep it.
   *
   * At most one call per animation frame, on either transport, and none at all
   * while nothing is changing. Subscribing is what starts the loop; the last
   * unsubscribe stops it.
   *
   * The reference is stable for the life of the node, so it can be handed
   * straight to `useSyncExternalStore` without a `useCallback` around it.
   */
  subscribe(listener: LevelsListener): () => void;

  /**
   * LUFS integrated over the current session, or `NaN` while loudness is off.
   *
   * `-Infinity` until `startIntegration()` has been called and 400 ms of audio
   * above the -70 LUFS absolute gate has gone by: a live meter has no
   * programme of its own, which is the whole reason this is a session rather
   * than a reading.
   *
   * Deliberately not on `Levels` and not in the default UI. A number that only
   * means something relative to a boundary somebody set invites being read as
   * though it always did, and a renderer handed `Levels` cannot draw what it
   * cannot see.
   *
   * There is no live LRA. EBU Tech 3342 describes a whole programme; use
   * `analyze()` for it.
   */
  readonly integrated: number;
  /**
   * Start - or restart - the integrated-loudness session: this is where the
   * programme begins. Discards whatever was integrated before it.
   *
   * EBU Tech 3341 §2.2 requires an 'EBU Mode' meter to be able to start, pause
   * and continue the measurement, and to reset it from either state.
   */
  startIntegration(): void;
  /** Pause it. Tech 3341 §2.2's 'stand-by'; the reading stands where it was. */
  stopIntegration(): void;
  /** Discard it, running or paused. Momentary and Short-term are untouched. */
  resetIntegration(): void;

  dispose(): void;
};

/**
 * What `LevelMeter.tap()` returns. A meter, not a node: it has no output, and
 * it exists before the worklet it will eventually drive.
 */
export type LevelMeterTap = LevelMeterApi;

/**
 * What `LevelMeter()` returns: a native `GainNode` that passes audio through,
 * with a tap beside it. No worklet in the signal path, so a dead processor
 * cannot silence the audio it was inserted to observe.
 */
export type LevelMeterNode = Disposable<GainNode> & LevelMeterApi;

/**
 * @deprecated Use `LevelMeterNode`. Pass-through is a `GainNode` with a tap
 * beside it now, not a worklet in the signal path.
 */
export type LevelMeterWorkletNode = LevelMeterNode;

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
   * Measure true peak, with `lookahead-limiter`'s own BS.1770-style 4x
   * interpolator. **Off by default**: measured at 10.6x the cost of everything
   * else in the meter put together, which makes it the one thing here
   * expensive enough to need asking for. Turns on `levels.truePeak`, which
   * reads `NaN` until it does.
   */
  truePeak?: boolean;
  /**
   * Measure loudness to ITU-R BS.1770-5. **Off by default**; cheap, but a
   * number nobody reads is still waste. Turns on `levels.momentary` and
   * `levels.shortTerm`, which read `NaN` until it does.
   */
  loudness?: boolean;
  /**
   * Per-channel weights for the loudness path. Defaults to 1.0 everywhere.
   * BS.1770 weights by channel *position* and Web Audio does not say what
   * channel 4 is, so nothing here infers a layout from a channel count - pass
   * `BS1770_51_CHANNEL_WEIGHTS` from `@synthlet/level-meter/dsp` for a
   * surround bus.
   */
  channelWeights?: ArrayLike<number>;
  /**
   * How often the processor posts its readings when the transport is
   * `"message"`, in ms. Default 16, i.e. about one animation frame. Ignored
   * when the transport is `"shared"`.
   */
  postIntervalMs?: number;
  /**
   * Called if the processor throws.
   *
   * A dead processor is otherwise indistinguishable from a silent signal: the
   * browser stops calling `process()` permanently, so the readings simply stop
   * changing, with no diagnostic. `getLevels().error` says so too, for callers
   * who would rather poll than take a callback.
   */
  onError?: (event: Event) => void;
  /**
   * Force an engine instead of detecting one.
   *
   * `"script-processor"` on a secure page is how the http driver gets
   * exercised in every browser without leaving https - and how a consumer who
   * wants one deterministic behaviour everywhere gets it.
   */
  engine?: LevelMeterEngine;
  /**
   * Frames per `onaudioprocess` on the `"script-processor"` engine. One of
   * 256, 512, 1024, 2048, 4096, 8192, 16384; default 1024, which is 21 ms at
   * 48 kHz. Ignored by the worklet, which always sees a render quantum.
   */
  bufferSize?: number;
  /**
   * Input channels for the `"script-processor"` engine, fixed at construction
   * because a `ScriptProcessorNode`'s are. Defaults to the source's
   * `channelCount`. Ignored by the worklet, which follows its input.
   */
  inputChannels?: number;
};

// The readings and everything derived from them, with no reference to the node.
//
// That separation is what lets a tap exist before its worklet does: the view
// starts zero-filled, so `channelCount` reads 0 and every level reads
// `-Infinity` until `attach` wires a node in - which is exactly what a meter
// that is not measuring yet should say.
// The port protocol, applied directly. `worklet.ts` has the same switch on the
// other side of a `postMessage`; on the main thread there is no message to send.
function applyCommand(analyzer: LevelAnalyzer, type: string) {
  switch (type) {
    case "CLEAR_CLIP":
      analyzer.clearClip();
      break;
    case "START_INTEGRATION":
      analyzer.loudness?.startIntegration();
      break;
    case "STOP_INTEGRATION":
      analyzer.loudness?.stopIntegration();
      break;
    case "RESET_INTEGRATION":
      analyzer.loudness?.resetIntegration();
      break;
  }
}

function createLevelsCore(options: LevelMeterOptions) {
  const maxChannels = resolveMaxChannels(options.maxChannels);
  const length = levelsLength(maxChannels);
  const loudness = options.loudness === true;
  // The loudness tail sits after every channel's slots, so its index moves with
  // `maxChannels` and is resolved once here rather than per read.
  const tail = HEADER + maxChannels * STRIDE;

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
    for (let c = 0; c < maxChannels; c++) peaks[c] = view[HEADER + c * STRIDE];
  };

  const slot = (channel: number) => HEADER + channel * STRIDE;

  // "Not measured" and "silent" are different answers, and the reserved slot
  // reads as digital silence while nothing is writing it.
  const truePeakOn = options.truePeak === true;

  const listeners = new Set<LevelsListener>();
  let stopTicking: (() => void) | null = null;
  // The version and the frame of the most recent delivery. Together they are
  // the whole rate policy: never twice for the same reading, never twice in
  // one animation frame.
  let notifiedVersion = 0;
  let notifiedFrame = -1;

  // Two things call this - a posted frame arriving, and the driver's tick -
  // and neither needs to know about the other.
  //
  // Under `"message"` at the default 16 ms cadence a message is a frame, so a
  // subscriber is notified as each one lands. Turn `postIntervalMs` down and
  // the extra messages coalesce here rather than waking React four times
  // between paints; the reading is never stale for more than a frame, because
  // the tick delivers whatever the message could not.
  const notify = () => {
    if (listeners.size === 0 || version === notifiedVersion) return;
    const frame = currentFrame();
    if (frame === notifiedFrame) return;
    notifiedFrame = frame;
    notifiedVersion = version;
    for (const listener of Array.from(listeners)) listener(levels);
  };

  // Hand-rolled rather than built with `createWorkletConstructor`: that helper
  // exists to wire `AudioParam`s from a `ParamInput` map, and the meter has no
  // parameters by design. What it does need is a `processorOptions` payload,
  // which the helper does not carry. Not an oversight - there is nothing here
  // for it to do.
  const processorOptions = {
    levelsBuffer,
    maxChannels,
    releaseDbPerSecond: options.releaseDbPerSecond,
    holdMs: options.holdMs,
    clipHoldMs: options.clipHoldMs,
    clipThreshold: options.clipThreshold,
    rmsMs: options.rmsMs,
    truePeak: options.truePeak,
    loudness: options.loudness,
    // A plain array: `processorOptions` is structured-cloned, and an
    // `ArrayLike` that is not one of the cloneable types would not survive
    // the trip.
    channelWeights: options.channelWeights
      ? Array.from(options.channelWeights)
      : undefined,
    postIntervalMs: options.postIntervalMs ?? DEFAULT_POST_INTERVAL_MS,
  };

  // The same settings the processor is built from, minus the two that only
  // mean something across a thread boundary. One core, two drivers, and the
  // readings agree because there is nothing else they could do.
  const {
    levelsBuffer: _b,
    postIntervalMs: _p,
    ...analyzerOptions
  } = processorOptions;

  // Whichever engine ended up running, or neither while `ready` is pending. A
  // command has to reach the one that exists.
  let node: AudioWorkletNode | null = null;
  let analyzer: LevelAnalyzer | null = null;

  /**
   * Send a command to whichever engine is running, or hold it until one is.
   *
   * `clearClip` could drop one - there is nothing to clear yet - but a session
   * command cannot: `startIntegration()` in the line after
   * `LevelMeter.tap(source)` has to mean the same thing as one a second later,
   * or the programme boundary depends on how fast registration went.
   */
  const command = (type: string) => {
    if (node) node.port.postMessage({ type });
    else if (analyzer) applyCommand(analyzer, type);
    else queued.push(type);
  };
  // Session commands sent before the node existed. Readings can wait for the
  // next block; a programme boundary cannot be moved by how long registration
  // took.
  const queued: string[] = [];

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
    // `NaN` when the measurement is off, `-Infinity` when it is on and the
    // signal is silent - which is why the buffer is not the thing that carries
    // the distinction. A `NaN` in the view would differ from itself, so
    // `readView`'s change check would fire on every block and every subscriber
    // would be woken 60 times a second by a reading that never moved.
    get momentary() {
      return loudness ? view[tail] : NaN;
    },
    get shortTerm() {
      return loudness ? view[tail + 1] : NaN;
    },
    get error() {
      return error;
    },
    peak: (channel) => toDb(view[slot(channel)]),
    hold: (channel) => toDb(view[slot(channel) + 1]),
    rms: (channel) => toDb(view[slot(channel) + 2]),
    truePeak: (channel) => (truePeakOn ? toDb(view[slot(channel) + 3]) : NaN),
    clipped: (channel) => ((view[2] >>> channel) & 1) === 1,
    clearClip() {
      command("CLEAR_CLIP");
      // The engine clears its own copy too; this is so a reader looking before
      // the next frame arrives sees the click it just made.
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

  return {
    levels,
    transport: (shared ? "shared" : "message") as LevelMeterTransport,
    processorOptions,

    getLevels() {
      if (shared) readView();
      return levels;
    },

    getPeaks() {
      if (shared) readView();
      return peaks;
    },

    integrated() {
      if (!loudness) return NaN;
      if (shared) readView();
      return view[tail + 2];
    },

    command,

    subscribe(listener: LevelsListener) {
      listeners.add(listener);
      if (listeners.size === 1) {
        // From here, not from zero: a new subscriber is told about the next
        // change, not about the one before it arrived.
        notifiedVersion = version;
        notifiedFrame = -1;
        // The renderer's driver, shared. Under `"shared"` the tick is the only
        // trigger there is - memory has no events - and under `"message"` it is
        // what delivers anything a message had to coalesce.
        stopTicking = onAnimationFrame(() => {
          if (shared) readView();
          notify();
        });
      }
      let live = true;
      return () => {
        if (!live) return;
        live = false;
        listeners.delete(listener);
        if (listeners.size === 0) {
          stopTicking?.();
          stopTicking = null;
        }
      };
    },

    /** The levels view, for the script-processor driver to write into. */
    view,

    /** What to build that driver's core with. */
    analyzerOptions: analyzerOptions as LevelAnalyzerOptions,

    /**
     * The view has been written in place - by the main-thread driver, which
     * needs no transport at all. Same two steps the message handler takes
     * after a posted frame lands.
     */
    written() {
      readView();
      notify();
    },

    /**
     * Wire in the main-thread core instead of a worklet node. Commands go to
     * it directly: there is no port, and no thread to cross.
     */
    attachAnalyzer(built: LevelAnalyzer) {
      analyzer = built;
      for (const type of queued) applyCommand(built, type);
      queued.length = 0;
    },

    /** Wire in the worklet node, once `ready` has built one. */
    attach(built: AudioWorkletNode) {
      node = built;
      for (const type of queued) built.port.postMessage({ type });
      queued.length = 0;
      if (!shared) {
        built.port.onmessage = (event: MessageEvent) => {
          view.set(event.data as Float32Array);
          readView();
          notify();
        };
      }
      // A dead processor is otherwise indistinguishable from a silent signal:
      // the browser stops calling `process()` for good and the readings simply
      // stop moving.
      built.onprocessorerror = (event: Event) => {
        error = true;
        options.onError?.(event);
      };
    },

    /** Drop the subscribers and, with the last of them, the animation frame. */
    release() {
      listeners.clear();
      stopTicking?.();
      stopTicking = null;
    },
  };
}

// `[SecureContext]`, so on plain http this is `undefined` rather than false.
function hasAudioWorklet(context: BaseAudioContext): boolean {
  return typeof context.audioWorklet?.addModule === "function";
}

function assertTappable(source: AudioNode, output: number) {
  const name = source.constructor?.name ?? "node";
  if (source.numberOfOutputs === 0) {
    throw Error(
      `LevelMeter.tap: a ${name} has no outputs to tap. Tap what feeds it instead - for a destination, the node you connect to it.`,
    );
  }
  if (
    !Number.isInteger(output) ||
    output < 0 ||
    output >= source.numberOfOutputs
  ) {
    throw RangeError(
      `LevelMeter.tap: a ${name} has ${source.numberOfOutputs} output(s), so there is no output ${output} to tap.`,
    );
  }
}

// The tap, and the whole of the meter: `LevelMeter()` is this with a `GainNode`
// in front of it.
//
// Synchronous, because a tap has no output - there is nothing downstream that
// could notice it is not connected yet, which is what makes the facade honest
// rather than a promise dressed as a node.
function createTap(
  source: AudioNode,
  options: LevelMeterOptions,
  output: number,
): LevelMeterTap {
  assertTappable(source, output);
  const context = source.context;
  const core = createLevelsCore(options);

  let node: Disposable<AudioWorkletNode> | null = null;
  let driver: ScriptProcessorDriver | null = null;
  let disposed = false;

  // Validated here rather than inside `ready`, so a typo is a throw at the call
  // site instead of a rejection nobody awaited.
  if (options.bufferSize !== undefined) resolveBufferSize(options.bufferSize);

  // Known synchronously in both deterministic cases: the caller forced one, or
  // there is no `audioWorklet` on this page to try. Only a registration that
  // *rejects* can move it later.
  let engine: LevelMeterEngine =
    options.engine ??
    (hasAudioWorklet(context) ? "worklet" : "script-processor");

  const startScriptProcessor = () => {
    engine = "script-processor";
    driver = createScriptProcessorDriver(source, output, core, {
      bufferSize: options.bufferSize,
      inputChannels: options.inputChannels,
    });
    core.attachAnalyzer(driver.analyzer);
  };

  const ready = (async () => {
    if (engine === "script-processor") {
      if (disposed) return;
      startScriptProcessor();
      return;
    }

    try {
      // Through the registrar, so two meters on one context register once -
      // and, since ticket 15's other half, so a registration that failed is
      // retried rather than cached forever.
      await registerLevelMeterWorklet(context);
    } catch {
      // A CSP that blocks `blob:` scripts, a closed context, a dev-server
      // hiccup. Different cause from plain http, same result - no worklet - and
      // the same answer. The registrar itself is untouched: it is the shared
      // module contract and 23 other packages depend on it throwing.
      if (disposed) return;
      startScriptProcessor();
      return;
    }
    // `dispose()` may have run while that was in flight. Everything below is
    // synchronous, so this is the only place the two can cross.
    if (disposed) return;

    const built = new AudioWorkletNode(context, "LevelMeterProcessor", {
      numberOfInputs: 1,
      // Always. The processor has no output in either form: pass-through is a
      // `GainNode` beside it, not a worklet in the path.
      numberOfOutputs: 0,
      processorOptions: core.processorOptions,
    });
    core.attach(built);
    source.connect(built, output);
    // The cascade every other module uses, plus the edge that made it a tap.
    node = disposable(built, [() => source.disconnect(built, output)]);
  })();

  // `ready` now rejects only when *no* engine can run - if building the script
  // processor itself throws. The no-op handler keeps an unawaited `ready` from
  // being reported as an unhandled rejection; `ready` still rejects for anyone
  // who awaits it.
  ready.catch(() => {});

  return {
    ready,
    get engine() {
      return engine;
    },
    transport: core.transport,
    getLevels: core.getLevels,
    getPeaks: core.getPeaks,
    subscribe: core.subscribe,
    get integrated() {
      return core.integrated();
    },
    // Posted rather than shared: the session is a command, and the buffer only
    // carries readings. They queue behind `ready` the same way the audio does -
    // a message sent before the node exists is delivered when it does.
    startIntegration: () => core.command("START_INTEGRATION"),
    stopIntegration: () => core.command("STOP_INTEGRATION"),
    resetIntegration: () => core.command("RESET_INTEGRATION"),
    dispose() {
      if (disposed) return;
      disposed = true;
      core.release();
      node?.dispose();
      driver?.dispose();
    },
  };
}

export const LevelMeter = Object.assign(
  /**
   * A pass-through meter: audio in, the same audio out, metered on the way.
   *
   * It is a native `GainNode` with a tap beside it, so the audio never waits
   * for the worklet to register and a processor that throws cannot silence
   * what it was inserted to observe.
   *
   * Prefer `LevelMeter.tap(source)` unless you actually want the meter in the
   * signal path: metering a connection should not mean breaking it.
   */
  (
    context: BaseAudioContext,
    options: LevelMeterOptions = {},
  ): LevelMeterNode => {
    const gain = context.createGain();
    const tap = createTap(gain, options, 0);
    // Assigned before `disposable`, which composes with the `dispose` it finds
    // rather than replacing it.
    Object.defineProperty(gain, "engine", {
      get: () => tap.engine,
      enumerable: true,
    });
    Object.assign(gain, {
      ready: tap.ready,
      transport: tap.transport,
      getLevels: tap.getLevels,
      getPeaks: tap.getPeaks,
      subscribe: tap.subscribe,
      startIntegration: () => tap.startIntegration(),
      stopIntegration: () => tap.stopIntegration(),
      resetIntegration: () => tap.resetIntegration(),
      dispose: () => tap.dispose(),
    });
    // A getter, not a copied value: the reading moves.
    Object.defineProperty(gain, "integrated", {
      get: () => tap.integrated,
      enumerable: true,
    });
    return disposable(gain) as LevelMeterNode;
  },
  {
    /**
     * Meter `source` without going in front of it. One line, no context, no
     * registration call, no `await`.
     *
     * ```ts
     * const meter = LevelMeter.tap(source); // adds an edge; changes nothing else
     * meter.dispose(); // removes it
     * ```
     *
     * A second outgoing edge is additive and reversible: whatever `source` was
     * already connected to stays connected, you do not have to know what that
     * was, and there is nothing downstream of the meter that a thrown processor
     * could silence.
     *
     * Returns synchronously and reads silence until `ready` resolves, so a UI
     * can be attached in the next line. The context comes from `source`, which
     * is why a `Compound` can be tapped without knowing which node it ends in.
     *
     * The node has `numberOfOutputs: 0`. Chrome renders such a node at the full
     * block rate whether or not `source` reaches the destination; Firefox and
     * Safari are unverified.
     */
    tap(
      source: AudioNode,
      options: LevelMeterOptions & { output?: number } = {},
    ): LevelMeterTap {
      return createTap(source, options, options.output ?? 0);
    },
    // No parameters: the meter is configured by options, not AudioParams.
    descriptors: [] as readonly ParamDescriptor[],
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
