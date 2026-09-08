/**
 * The offline driver: the same analyzer, over a whole buffer instead of a
 * render quantum.
 *
 * "Tell me the peak of this file" is at least as common an ask as "put a bar on
 * my graph", and both are the same arithmetic. Chunked and yielding, because
 * true peak costs 11x the loudness path and a five-minute track is seconds of
 * work - which is a frozen tab if it runs in one go.
 *
 * `OfflineAudioContext` is deliberately not used: it needs a context, a worklet
 * registration and a browser, and gives nothing a pure function does not.
 */

import {
  ANALYSIS_FRAME,
  createLevelAnalyzer,
  LEVEL_HOLD,
  LEVEL_RMS,
  levelIndex,
  LevelAnalyzerOptions,
  levelsLength,
  levelsTailIndex,
  TAIL_MOMENTARY,
  TAIL_SHORT_TERM,
  toDb,
} from "./dsp";

/** Samples per chunk. ~1.4 s of 48 kHz audio; see `chunkSize` below. */
export const DEFAULT_CHUNK_SIZE = 1 << 16;

export interface AnalyzeOptions extends LevelAnalyzerOptions {
  /**
   * Samples per chunk, rounded down to a whole number of `ANALYSIS_FRAME`s.
   *
   * The whole point of chunking is that no single turn of the event loop runs
   * long, so this is the knob that trades progress granularity against loop
   * overhead. The default is one chunk per ~1.4 s of 48 kHz stereo, which is a
   * few milliseconds of work even with `truePeak` on.
   */
  chunkSize?: number;
  /** Called after each chunk with a fraction from 0 to 1. */
  onProgress?: (progress: number) => void;
}

/** What an offline analysis says about a buffer. */
export interface LevelAnalysis {
  sampleRate: number;
  /** Channels analysed: the buffer's, capped at `maxChannels`. */
  channelCount: number;
  /** Frames analysed. */
  length: number;
  /** Seconds analysed. */
  duration: number;
  /** The highest sample peak anywhere in the buffer, dBFS. */
  peak: number[];
  /** The highest true peak anywhere in the buffer, dBTP; `NaN` when off. */
  truePeak: number[];
  /** The hold marker where the buffer ends, dBFS. */
  hold: number[];
  /** The RMS one-pole where the buffer ends, dBFS. */
  rms: number[];
  /** Whether any sample in the buffer reached `clipThreshold`. */
  clipped: boolean[];
  /** LUFS momentary at the end of the buffer; `NaN` while loudness is off. */
  momentary: number;
  /** LUFS short-term at the end of the buffer; `NaN` while loudness is off. */
  shortTerm: number;
  /**
   * LUFS integrated over the whole buffer, gated per BS.1770-5 eq (6)-(7);
   * `NaN` while loudness is off.
   *
   * The objection that kept Integrated out of this package was that "integrated
   * loudness is defined over a programme, and a synthesiser that has been
   * running since page load has no programme". An offline call has one by
   * definition: the buffer you passed it.
   */
  integrated: number;
  /**
   * Loudness Range in LU, per EBU Tech 3342; `NaN` while loudness is off.
   *
   * Offline only. LRA is a statistical descriptor of a whole programme - the
   * 95th percentile of the short-term distribution minus the 10th, after a
   * -20 LU relative gate - and Tech 3342 asks a meter to warn that the value is
   * not stable for the first 60 s. There is no realtime slot for it.
   */
  lra: number;
  /**
   * The layout view as the realtime meter would have left it after the same
   * samples - byte for byte, which is what makes offline and realtime one
   * implementation rather than two that agree.
   */
  levels: Float32Array;
}

/**
 * Let the host do something else.
 *
 * A macrotask, not a microtask: a microtask queue drains before the browser
 * paints, so `queueMicrotask` would yield to nothing that matters here.
 */
const yieldToHost = () =>
  new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Analyse `channels` at `sampleRate`.
 *
 * Takes `Float32Array[]` and a number rather than an `AudioBuffer`, so it runs
 * in node, in jest and in a worker; `analyzeAudioBuffer` is the four-line
 * adapter for when a buffer is what you have.
 *
 * Channels that are not `Float32Array` - a `Float64Array` from a decoder, a
 * plain `number[]` from a test - are rounded to Float32 first, so the answer is
 * the one the realtime path would have given for the same audio rather than a
 * slightly better one.
 */
export async function analyze(
  channels: ArrayLike<ArrayLike<number>>,
  sampleRate: number,
  options: AnalyzeOptions = {},
): Promise<LevelAnalysis> {
  const analyzer = createLevelAnalyzer(sampleRate, options);
  const channelCount = Math.min(channels.length, analyzer.maxChannels);
  const length = channelCount > 0 ? (channels[0] as any).length : 0;

  const chunkSize = Math.max(
    ANALYSIS_FRAME,
    Math.floor((options.chunkSize ?? DEFAULT_CHUNK_SIZE) / ANALYSIS_FRAME) *
      ANALYSIS_FRAME,
  );

  // Anything that is not already Float32 goes through a Float32Array first,
  // which rounds exactly as `Math.fround` does - in bulk, once per chunk,
  // rather than once per sample on a path where it is a no-op.
  const source: ArrayLike<number>[] = [];
  for (let c = 0; c < channelCount; c++) source.push(channels[c]);
  const needsRounding = source.some((c) => !(c instanceof Float32Array));
  const rounded: Float32Array[] = needsRounding
    ? source.map(() => new Float32Array(chunkSize))
    : [];

  for (let offset = 0; offset < length; offset += chunkSize) {
    const take = Math.min(chunkSize, length - offset);

    if (needsRounding) {
      for (let c = 0; c < channelCount; c++) {
        const from = source[c];
        const into = rounded[c];
        for (let i = 0; i < take; i++) into[i] = from[offset + i];
      }
      analyzer.process(rounded, 0, take);
    } else {
      analyzer.process(source, offset, take);
    }

    options.onProgress?.(Math.min(1, (offset + take) / length));
    if (offset + take < length) await yieldToHost();
  }

  // A buffer whose length is not a whole number of frames still has to count
  // its tail; a realtime driver never needs this, because the browser always
  // hands over a whole render quantum.
  analyzer.flush();

  const levels = analyzer.results(
    new Float32Array(levelsLength(analyzer.maxChannels)),
  );
  const per = <T>(read: (channel: number) => T) =>
    Array.from({ length: channelCount }, (_, c) => read(c));

  const tail = levelsTailIndex(analyzer.maxChannels);

  return {
    sampleRate,
    channelCount,
    length,
    duration: length / sampleRate,
    peak: per((c) => toDb(analyzer.maxPeak(c))),
    truePeak: per((c) =>
      analyzer.truePeakEnabled ? toDb(analyzer.maxTruePeak(c)) : NaN,
    ),
    hold: per((c) => toDb(levels[levelIndex(c, LEVEL_HOLD)])),
    rms: per((c) => toDb(levels[levelIndex(c, LEVEL_RMS)])),
    clipped: per((c) => analyzer.everClipped(c)),
    momentary: analyzer.loudness ? levels[tail + TAIL_MOMENTARY] : NaN,
    shortTerm: analyzer.loudness ? levels[tail + TAIL_SHORT_TERM] : NaN,
    // Read from the core, not from the tail: the layout slot is Float32 and an
    // integrated reading is the number a delivery spec is written in.
    integrated: analyzer.loudness ? analyzer.loudness.integrated() : NaN,
    lra: analyzer.loudness ? analyzer.loudness.lra() : NaN,
    levels,
  };
}

/** An `AudioBuffer`'s channels, as the arrays `analyze` wants. */
export function audioBufferChannels(buffer: AudioBuffer): Float32Array[] {
  return Array.from({ length: buffer.numberOfChannels }, (_, channel) =>
    buffer.getChannelData(channel),
  );
}

/** `analyze`, for when an `AudioBuffer` is what you have. */
export function analyzeAudioBuffer(
  buffer: AudioBuffer,
  options: AnalyzeOptions = {},
): Promise<LevelAnalysis> {
  return analyze(audioBufferChannels(buffer), buffer.sampleRate, options);
}
