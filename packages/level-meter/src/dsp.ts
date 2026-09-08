import { createTruePeakDetector } from "@synthlet/lookahead-limiter/dsp";

/**
 * The meter, as pure arithmetic.
 *
 * No Web Audio, no worklet globals: `sampleRate` is an argument, samples arrive
 * as `Float32Array[]`, and the readings go into a plain typed array. That is the
 * house shape - `state-variable-filter/src/dsp.ts`, `adsr/src/dsp.ts`,
 * `lookahead-limiter/src/dsp.ts` - and it buys three things this package could
 * not have otherwise: the numbers can be tested without a stub, the same
 * analyzer can be driven offline over a whole file, and the offline and
 * realtime readings agree **by construction** rather than by inspection.
 *
 * `worklet.ts` is a driver over this that calls it once per render quantum.
 * `offline.ts` is a driver over this that calls it over chunks.
 */

import { createLoudnessAnalyzer } from "./loudness";

/**
 * The loudness core, published at `./dsp` alongside the meter.
 *
 * `kWeightingCoefficients`, `createLoudnessAnalyzer`, `gainToTarget` and the
 * constants of BS.1770-5 are useful on their own - "what gain moves this file
 * to -14 LUFS" is not a metering question - and they are already pure, so the
 * subpath that exists to keep Web Audio out is where they belong.
 */
export * from "./loudness";

/**
 * The accumulation frame, in samples.
 *
 * The peak's attack, release, hold and clip latch are per *frame*, not per
 * sample - a peak meter's bar is a per-block quantity - and 128 is the render
 * quantum the Web Audio spec fixes. Holding the offline path to the same frame
 * is what makes the two produce the same numbers rather than nearly the same
 * numbers.
 *
 * `process()` accepts any length and carries a partial frame across calls, so a
 * chunk boundary is not a frame boundary.
 */
export const ANALYSIS_FRAME = 128;

// Ballistics defaults, from K-Meter - an open-source implementation of Bob
// Katz's published K-System spec, and the only *sourced* set of numbers found
// for a digital peak meter:
// https://github.com/mzuther/K-Meter/blob/master/Source/meter_ballistics.cpp
export const DEFAULT_RELEASE_DB_PER_SECOND = 8.7;
export const DEFAULT_HOLD_MS = 1500;
export const DEFAULT_CLIP_HOLD_MS = 1500;
export const DEFAULT_CLIP_THRESHOLD = 1;
export const DEFAULT_RMS_MS = 600;
export const DEFAULT_MAX_CHANNELS = 16;

/**
 * Below this a reading is zero, so `20*log10(x)` prints `-Infinity` rather than
 * -200 dB and no UI has to special-case a floor that should not exist. A
 * correctness fix, not a performance one: V8's denormal penalty was measured at
 * 1.00x in the state-variable-filter audit.
 */
export const SILENCE = 1e-10;

/**
 * The EBU R 128 delivery ceiling, and the number most people looking at a
 * true-peak meter are checking against. Exported so a renderer can draw the
 * line rather than each one hardcoding it.
 */
export const TRUE_PEAK_CEILING_DBTP = -1;

/**
 * Samples of zeros needed to flush the true-peak detector's ring.
 *
 * `TP_HISTORY` in `lookahead-limiter/src/dsp.ts`, which does not export it. A
 * channel that stops arriving is drained rather than left holding its last
 * window, so if it comes back it fades in from silence instead of reporting a
 * peak from before it went away.
 */
const TRUE_PEAK_HISTORY = 12;

// ---------------------------------------------------------------------------
// The buffer layout
// ---------------------------------------------------------------------------

/**
 * The readings, as a flat `Float32Array` both transports carry:
 *
 * ```
 *   [0]                                    layout version
 *   [1]                                    channel count
 *   [2]                                    flags: clip latch, bit c for channel c
 *   [HEADER + c*STRIDE + LEVEL_PEAK]       peak       (linear)
 *   [HEADER + c*STRIDE + LEVEL_HOLD]       peak hold  (linear)
 *   [HEADER + c*STRIDE + LEVEL_RMS]        rms        (linear)
 *   [HEADER + c*STRIDE + LEVEL_TRUE_PEAK]  true peak  (linear)
 *   [HEADER + n*STRIDE + TAIL_MOMENTARY]   LUFS momentary   (dB)
 *   [HEADER + n*STRIDE + TAIL_SHORT_TERM]  LUFS short-term  (dB)
 *   [HEADER + n*STRIDE + TAIL_INTEGRATED]  LUFS integrated  (dB)
 * ```
 *
 * Per-channel slots are linear magnitudes, 0 for silence; the tail is in the dB
 * domain. The stride is fixed and unused slots are reserved rather than
 * appended, so a page running an older bundle against a newer one fails the
 * version check in `[0]` instead of reading a stride that moved.
 */
export const LEVELS_LAYOUT_VERSION = 1;
export const LEVELS_HEADER = 3;
export const LEVELS_STRIDE = 4;
export const LEVELS_TAIL = 3;

/** Slots in the loudness tail. */
export const TAIL_MOMENTARY = 0;
export const TAIL_SHORT_TERM = 1;
/**
 * Integrated loudness over the current session. Grown into the tail rather
 * than posted on its own channel, so the gated reading arrives with the
 * ungated ones and under `"shared"` there is still nothing to post at all.
 *
 * There is no LRA slot: Tech 3342 is a statistical descriptor of a whole
 * programme and close to meaningless as a live readout, so it is offline only.
 */
export const TAIL_INTEGRATED = 2;

export const LEVEL_PEAK = 0;
export const LEVEL_HOLD = 1;
export const LEVEL_RMS = 2;
export const LEVEL_TRUE_PEAK = 3;

/** Slots a level buffer needs for `maxChannels` channels. */
export function levelsLength(maxChannels: number): number {
  return LEVELS_HEADER + maxChannels * LEVELS_STRIDE + LEVELS_TAIL;
}

/** Index of one channel's `field` - `LEVEL_PEAK` and friends. */
export function levelIndex(channel: number, field: number): number {
  return LEVELS_HEADER + channel * LEVELS_STRIDE + field;
}

/** Index of the loudness tail, which sits after `maxChannels` channels. */
export function levelsTailIndex(maxChannels: number): number {
  return LEVELS_HEADER + maxChannels * LEVELS_STRIDE;
}

/** `-Infinity` for silence, which is the whole point of the flush to zero. */
export const toDb = (magnitude: number): number => 20 * Math.log10(magnitude);

// ---------------------------------------------------------------------------
// The analyzer
// ---------------------------------------------------------------------------

/**
 * The loudness core, as this file needs it.
 *
 * Structural rather than an alias for `LoudnessAnalyzer`, so this file states
 * what it uses and the compiler checks that `createLoudnessAnalyzer` still
 * supplies it. Everything the core exports reaches callers through the
 * `export *` above; this is the meter's own view of it.
 */
export interface LoudnessCore {
  process(
    channels: ArrayLike<ArrayLike<number>>,
    offset?: number,
    length?: number,
  ): void;
  momentary(): number;
  shortTerm(): number;
  integrated(): number;
  lra(): number;
  startIntegration(): void;
  stopIntegration(): void;
  resetIntegration(): void;
  reset(): void;
}

function createLoudnessCore(
  sampleRate: number,
  maxChannels: number,
  channelWeights: ArrayLike<number> | undefined,
  integrate: boolean,
): LoudnessCore {
  return createLoudnessAnalyzer(sampleRate, {
    maxChannels,
    channelWeights,
    integrate,
  });
}

export interface LevelAnalyzerOptions {
  /** Channels to size state for. Channels beyond it are ignored. Default 16. */
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
   * RMS time to 99 % of a step, in ms. Default 600 - K-Meter's average meter,
   * and deliberately not the peak's release: they answer different questions.
   */
  rmsMs?: number;
  /**
   * Measure true peak. **Off by default**, because it costs 11x the entire
   * loudness path - 48 multiply-accumulates per sample per channel.
   */
  truePeak?: boolean;
  /**
   * Measure loudness. **Off by default**; cheap, but a number nobody reads is
   * still waste. Same rule as `truePeak`.
   */
  loudness?: boolean;
  /**
   * Per-channel weights for the loudness path. Defaults to 1.0 everywhere -
   * BS.1770 weights by channel *position* and Web Audio does not say what
   * channel 4 is, so nothing here infers a layout from a channel count.
   */
  channelWeights?: ArrayLike<number>;
  /**
   * Accumulate the gated Integrated / LRA histograms from construction.
   * Default `true`, which is the offline answer: an `analyze()` call has a
   * programme by definition - the buffer you passed it - so there is no
   * session to declare.
   *
   * The worklet passes `false`. A synth that has been running since page load
   * has no programme, and a number that only means something relative to a
   * boundary nobody set invites being read as though it did; `startIntegration()`
   * is where a live caller declares one.
   */
  integrate?: boolean;
}

export interface LevelAnalyzer {
  readonly sampleRate: number;
  readonly maxChannels: number;
  /** Samples in one ballistics frame: `ANALYSIS_FRAME`. */
  readonly frameSize: number;
  /** Channels most recently seen on the input. */
  readonly channelCount: number;
  readonly truePeakEnabled: boolean;
  /** The loudness core, when `loudness` is on. */
  readonly loudness: LoudnessCore | undefined;

  /**
   * Consume `length` samples from each channel starting at `offset`.
   *
   * Allocates nothing. Any length is accepted and a partial frame is carried
   * across calls, so chunking does not move the ballistics. Pass an empty
   * `channels` with an explicit `length` to advance time with no input - which
   * is what an unconnected worklet input is, and the reading has to keep
   * falling through it.
   */
  process(
    channels: ArrayLike<ArrayLike<number>>,
    offset?: number,
    length?: number,
  ): void;

  /**
   * Apply the ballistics to a partial frame.
   *
   * Only for the end of an offline buffer whose length is not a multiple of
   * `ANALYSIS_FRAME`: without it the last few samples would never reach the
   * readings. A realtime driver never needs it - the browser always delivers a
   * whole render quantum.
   */
  flush(): void;

  /**
   * Write the readings into `into`, or into a reused internal array.
   *
   * `into` is written in place, so a worklet hands over its shared or posted
   * buffer directly and no copy happens anywhere.
   */
  results(into?: Float32Array): Float32Array;

  /** Highest sample peak seen since `reset()`, linear. */
  maxPeak(channel: number): number;
  /** Highest true peak seen since `reset()`, linear; 0 while `truePeak` is off. */
  maxTruePeak(channel: number): number;
  /** Whether any sample since `reset()` reached `clipThreshold`. */
  everClipped(channel: number): boolean;

  /** Clear every channel's clip latch. */
  clearClip(): void;
  /** Every reading and every piece of state back to construction. */
  reset(): void;
}

/**
 * A peak / hold / clip / RMS analyzer at `sampleRate`.
 *
 * Incremental and allocation-free after this call returns, so the same object
 * serves a worklet's render quantum and an offline chunk loop.
 */
export function createLevelAnalyzer(
  sampleRate: number,
  options: LevelAnalyzerOptions = {},
): LevelAnalyzer {
  const maxChannels = options.maxChannels ?? DEFAULT_MAX_CHANNELS;
  const frameSeconds = ANALYSIS_FRAME / sampleRate;

  // Derived from `sampleRate`, once. A meter's fall rate is a property of the
  // meter, not of the interface it happens to be running on: a fixed per-block
  // coefficient made the same audio meter differently at 44.1 and 96 kHz.
  const release = options.releaseDbPerSecond ?? DEFAULT_RELEASE_DB_PER_SECOND;
  const decay = Math.pow(10, (-release * frameSeconds) / 20);
  const holdFrames = Math.round(
    (options.holdMs ?? DEFAULT_HOLD_MS) / 1000 / frameSeconds,
  );
  const clipFrames = Math.round(
    (options.clipHoldMs ?? DEFAULT_CLIP_HOLD_MS) / 1000 / frameSeconds,
  );
  const clipThreshold = options.clipThreshold ?? DEFAULT_CLIP_THRESHOLD;

  // rms^2 = rms^2*a + x^2*(1-a), per sample, `a` from `sampleRate` for the same
  // reason. `frameSilence` is `a` over a whole frame, which is what a channel
  // with no input gets - the same answer as feeding it 128 zeros, without the
  // loop.
  const rmsSeconds = (options.rmsMs ?? DEFAULT_RMS_MS) / 1000;
  const rmsA = Math.pow(0.01, 1 / Math.max(1, rmsSeconds * sampleRate));
  const rmsB = 1 - rmsA;
  const frameSilence = Math.pow(rmsA, ANALYSIS_FRAME);

  // Peak and hold are held at Float32 precision because that is the precision
  // the layout publishes them at: the state and the reading are the same
  // number, so the offline path cannot drift away from the realtime one.
  const peak = new Float32Array(maxChannels);
  const hold = new Float32Array(maxChannels);
  const rms = new Float32Array(maxChannels);
  const peakMax = new Float32Array(maxChannels);
  const holdLeft = new Int32Array(maxChannels);
  const clipLeft = new Int32Array(maxChannels);
  const everClip = new Uint8Array(maxChannels);
  const framePeak = new Float32Array(maxChannels);
  const meanSquare = new Float64Array(maxChannels);

  // True peak: the limiter's own detector, one per channel, so the meter and
  // the limiter agree by construction. Off by default - 48 multiply-
  // accumulates per sample per channel is 11x the entire loudness path, and it
  // is the only thing in the package expensive enough to need an opt-in.
  //
  // The two meter-specific optimisations the plan offered were measured and
  // both declined; see the `truePeak` option for the numbers.
  const truePeakEnabled = options.truePeak === true;
  const detectors = truePeakEnabled
    ? Array.from({ length: maxChannels }, () => {
        const detector = createTruePeakDetector();
        detector.channels(1);
        return detector;
      })
    : [];
  const truePeak = new Float32Array(maxChannels);
  const truePeakMax = new Float32Array(maxChannels);
  const frameTruePeak = new Float32Array(maxChannels);
  const drain = new Int32Array(maxChannels);

  const loudness = options.loudness
    ? createLoudnessCore(
        sampleRate,
        maxChannels,
        options.channelWeights,
        options.integrate ?? true,
      )
    : undefined;

  let channelCount = 0;
  let pending = 0; // samples accumulated toward the current frame
  let flags = 0;
  let own: Float32Array | undefined;

  // Per sample: the frame's raw maximum and the RMS one-pole.
  function consume(
    channels: ArrayLike<ArrayLike<number>>,
    offset: number,
    length: number,
  ) {
    const measured = Math.min(channels.length, maxChannels);
    for (let c = 0; c < measured; c++) {
      const channel = channels[c];
      let blockPeak = framePeak[c];
      let square = meanSquare[c];
      const end = offset + length;
      for (let i = offset; i < end; i++) {
        const sample = channel[i];
        const x = sample < 0 ? -sample : sample;
        if (x > blockPeak) blockPeak = x;
        square = square * rmsA + sample * sample * rmsB;
      }
      framePeak[c] = blockPeak;
      meanSquare[c] = square;

      if (truePeakEnabled) {
        const detector = detectors[c];
        let highest = frameTruePeak[c];
        for (let i = offset; i < end; i++) {
          detector.advance();
          detector.write(0, channel[i]);
          const reconstructed = detector.peak(1);
          if (reconstructed > highest) highest = reconstructed;
        }
        frameTruePeak[c] = highest;
        drain[c] = TRUE_PEAK_HISTORY;
      }
    }

    // A channel that has stopped arriving gets zeros until its ring is empty,
    // and then costs nothing at all - which is what keeps 14 unused slots of a
    // 16-channel buffer from paying for a detector nobody is reading.
    if (truePeakEnabled) {
      for (let c = measured; c < maxChannels; c++) {
        if (drain[c] <= 0) continue;
        const detector = detectors[c];
        const steps = Math.min(drain[c], length);
        for (let i = 0; i < steps; i++) {
          detector.advance();
          detector.write(0, 0);
        }
        drain[c] -= steps;
      }
    }

    // Channels the input does not carry are silent, not frozen.
    if (measured < maxChannels) {
      const silent =
        length === ANALYSIS_FRAME ? frameSilence : Math.pow(rmsA, length);
      for (let c = measured; c < maxChannels; c++) meanSquare[c] *= silent;
    }

    // An empty input is "nothing this block", not "zero channels of audio":
    // reporting 0 would hide the decay the reading is supposed to show.
    if (measured > 0) channelCount = measured;

    loudness?.process(channels, offset, length);
  }

  // Per frame: the ballistics.
  function advance() {
    flags = 0;
    for (let c = 0; c < maxChannels; c++) {
      const blockPeak = framePeak[c];

      // Instant attack, exponential release. The attack falls out of the
      // comparison and the release is one multiply.
      let p = peak[c] * decay;
      if (blockPeak > p) p = blockPeak;
      if (p < SILENCE) p = 0;
      peak[c] = p;
      if (p > peakMax[c]) peakMax[c] = p;

      // The hold marker is a running maximum, parked for `holdFrames` after it
      // was last raised and then released at the same rate as the peak.
      let h = hold[c];
      if (p >= h) {
        h = p;
        holdLeft[c] = holdFrames;
      } else if (holdLeft[c] > 0) {
        holdLeft[c]--;
      } else {
        h *= decay;
        if (h < SILENCE) h = 0;
      }
      hold[c] = h;

      // One square root per frame per channel, not per sample. Flushed to zero
      // for the same reason the peak is: silence must read -Infinity.
      let square = meanSquare[c];
      if (square < SILENCE * SILENCE) {
        square = 0;
        meanSquare[c] = 0;
      }
      rms[c] = Math.sqrt(square);

      // True peak gets the peak's ballistics and its own state: instant
      // attack, the same release, and a hold counter that is not the sample
      // peak's. The layout has one slot for it, so there is no separate
      // true-peak hold marker - adding one would move the stride.
      if (truePeakEnabled) {
        const frame = frameTruePeak[c];
        let t = truePeak[c] * decay;
        if (frame > t) t = frame;
        if (t < SILENCE) t = 0;
        truePeak[c] = t;
        if (t > truePeakMax[c]) truePeakMax[c] = t;
        frameTruePeak[c] = 0;
      }

      // `blockPeak` is already the largest |x| in the frame, so one compare
      // says whether any sample in it reached the threshold.
      if (blockPeak >= clipThreshold) {
        clipLeft[c] = clipFrames;
        everClip[c] = 1;
      } else if (clipLeft[c] > 0) {
        clipLeft[c]--;
      }
      if (clipLeft[c] > 0) flags |= 1 << c;

      framePeak[c] = 0;
    }
  }

  return {
    sampleRate,
    maxChannels,
    frameSize: ANALYSIS_FRAME,
    truePeakEnabled,
    loudness,

    get channelCount() {
      return channelCount;
    },

    process(channels, offset = 0, length) {
      const total =
        length ??
        (channels.length > 0 ? (channels[0] as any).length - offset : 0);

      let done = 0;
      while (done < total) {
        const take = Math.min(ANALYSIS_FRAME - pending, total - done);
        consume(channels, offset + done, take);
        pending += take;
        done += take;
        if (pending === ANALYSIS_FRAME) {
          advance();
          pending = 0;
        }
      }
    },

    flush() {
      if (pending > 0) {
        advance();
        pending = 0;
      }
    },

    results(into) {
      const view =
        into ?? (own ??= new Float32Array(levelsLength(maxChannels)));
      view[0] = LEVELS_LAYOUT_VERSION;
      view[1] = channelCount;
      view[2] = flags;
      for (let c = 0; c < maxChannels; c++) {
        const slot = LEVELS_HEADER + c * LEVELS_STRIDE;
        view[slot + LEVEL_PEAK] = peak[c];
        view[slot + LEVEL_HOLD] = hold[c];
        view[slot + LEVEL_RMS] = rms[c];
        // Left alone while true peak is off, so an unwritten slot stays
        // unwritten rather than reading as digital silence.
        if (truePeakEnabled) view[slot + LEVEL_TRUE_PEAK] = truePeak[c];
      }
      if (loudness) {
        const tail = levelsTailIndex(maxChannels);
        view[tail + TAIL_MOMENTARY] = loudness.momentary();
        view[tail + TAIL_SHORT_TERM] = loudness.shortTerm();
        view[tail + TAIL_INTEGRATED] = loudness.integrated();
      }
      return view;
    },

    maxPeak: (channel) => peakMax[channel],
    maxTruePeak: (channel) => truePeakMax[channel],
    everClipped: (channel) => everClip[channel] === 1,

    clearClip() {
      clipLeft.fill(0);
      flags = 0;
    },

    reset() {
      peak.fill(0);
      hold.fill(0);
      rms.fill(0);
      peakMax.fill(0);
      holdLeft.fill(0);
      clipLeft.fill(0);
      everClip.fill(0);
      framePeak.fill(0);
      meanSquare.fill(0);
      truePeak.fill(0);
      truePeakMax.fill(0);
      frameTruePeak.fill(0);
      drain.fill(0);
      channelCount = 0;
      pending = 0;
      flags = 0;
      loudness?.reset();
    },
  };
}
