/**
 * The EBU conformance signals, synthesised.
 *
 * EBU Tech 3341 Table 1 and Tech 3342 Table 1 describe their test material as
 * prose - "3 tones similar to #1 but with the following durations and levels" -
 * and publish the readings each must produce. The audio files are downloadable,
 * but every case that matters here is a 1000 Hz sine at a stated peak level for
 * a stated duration, so the suite can be *built* instead of vendored: no
 * fixtures in the repository, no licence question, and the test reads as the
 * table does.
 *
 * Levels throughout are per-channel **peak** level in dBFS, as the tables state
 * them. For an in-phase sine in two channels that number is also the loudness
 * in LUFS: `sum_i G_i * z_i` is `2 * A^2/2 = A^2`, and eq (2)'s -0.691 cancels
 * the K-weighting gain at ~1 kHz, so a -23.0 dBFS stereo tone reads
 * -23.0 LUFS. That identity is what makes the tables' expected values readable.
 *
 * Test-only: nothing here is exported from the package entry.
 */

import type { LoudnessAnalyzer } from "./loudness";

/** Tech 3341 Table 1 case 1: "Stereo sine wave, 1000 Hz". */
export const EBU_TEST_FREQUENCY = 1000;

/** The default render quantum, so feeds are misaligned with the 100 ms grid. */
export const RENDER_QUANTUM = 128;

export interface ToneSegment {
  seconds: number;
  /**
   * Per-channel peak level in dBFS: one number for every channel, or one per
   * channel. `-Infinity` is digital silence.
   */
  dbfs: number | readonly number[];
}

/** A tone segment at a single level, or a per-channel vector of levels. */
export function tone(
  seconds: number,
  dbfs: number | readonly number[],
): ToneSegment {
  return { seconds, dbfs };
}

/** A silent segment. */
export function silence(seconds: number): ToneSegment {
  return { seconds, dbfs: -Infinity };
}

export function dbfsToAmplitude(dbfs: number): number {
  return dbfs === -Infinity ? 0 : Math.pow(10, dbfs / 20);
}

export interface ProgrammeOptions {
  channels?: number;
  frequency?: number;
}

/**
 * A sine programme built from `segments`, one `Float32Array` per channel.
 *
 * Phase runs continuously across segment boundaries - the tables say nothing
 * about phase, and a continuous one keeps the level changes from being step
 * discontinuities that the K-weighting would ring on.
 */
export function sineProgramme(
  sampleRate: number,
  segments: readonly ToneSegment[],
  options: ProgrammeOptions = {},
): Float32Array[] {
  const channelCount = options.channels ?? 2;
  const frequency = options.frequency ?? EBU_TEST_FREQUENCY;

  const lengths = segments.map((s) => Math.round(s.seconds * sampleRate));
  const total = lengths.reduce((sum, n) => sum + n, 0);
  const channels: Float32Array[] = [];
  for (let c = 0; c < channelCount; c++) channels.push(new Float32Array(total));

  const amplitudes = new Float64Array(channelCount);
  const omega = (2 * Math.PI * frequency) / sampleRate;

  let n = 0;
  for (let s = 0; s < segments.length; s++) {
    const { dbfs } = segments[s];
    for (let c = 0; c < channelCount; c++) {
      amplitudes[c] = dbfsToAmplitude(
        typeof dbfs === "number" ? dbfs : dbfs[c],
      );
    }
    for (let i = 0; i < lengths[s]; i++, n++) {
      const v = Math.sin(omega * n);
      for (let c = 0; c < channelCount; c++) channels[c][n] = amplitudes[c] * v;
    }
  }
  return channels;
}

/** Feed a whole programme through the analyzer in render-quantum chunks. */
export function feed(
  analyzer: LoudnessAnalyzer,
  channels: readonly Float32Array[],
  chunkSize = RENDER_QUANTUM,
): void {
  const total = channels[0].length;
  for (let at = 0; at < total; at += chunkSize) {
    analyzer.process(channels, at, Math.min(chunkSize, total - at));
  }
}

/**
 * Feed a programme and return the largest value `read` took along the way -
 * the "Max M" / "Max S" of Tech 3341 cases 10, 11, 13 and 14. Read after every
 * chunk, which is 375 Hz at 48 kHz: far above the 10 Hz the document asks of a
 * live meter, and above the 10 Hz at which the reading can actually change.
 */
export function feedTrackingMax(
  analyzer: LoudnessAnalyzer,
  channels: readonly Float32Array[],
  read: () => number,
  chunkSize = RENDER_QUANTUM,
): number {
  const total = channels[0].length;
  let max = -Infinity;
  for (let at = 0; at < total; at += chunkSize) {
    analyzer.process(channels, at, Math.min(chunkSize, total - at));
    const value = read();
    if (value > max) max = value;
  }
  return max;
}

/**
 * The reading a 400 ms window can reach for a `windowMs` tone that starts
 * `offsetMs` after a 100 ms grid boundary.
 *
 * A window that can only start on the grid cannot be centred on a tone that
 * does not; the best it can do is the larger of the two straddling positions.
 * Zero for any offset that is a multiple of the grid - which is why the
 * conformance cases that land on the grid are asserted at the document's own
 * +/-0.1 LU, and the rest are asserted against this.
 */
export function gridQuantisationDb(
  offsetMs: number,
  windowMs: number,
  gridMs = 100,
): number {
  const d = ((offsetMs % gridMs) + gridMs) % gridMs;
  const covered = Math.max(windowMs - d, windowMs - gridMs + d);
  return 10 * Math.log10(covered / windowMs);
}
