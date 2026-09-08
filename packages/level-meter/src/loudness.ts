/**
 * Loudness to ITU-R BS.1770-5, in the EBU R 128 shape: Momentary (400 ms),
 * Short-term (3 s), Integrated (gated) and Loudness Range.
 *
 * Pure: no Web Audio, no worklet globals, `sampleRate` is an argument, and
 * nothing is allocated after `createLoudnessAnalyzer` returns. That is what
 * lets EBU Tech 3341 and Tech 3342 - which are conformance suites with
 * published readings, not prose - run as plain jest tests. See
 * `loudness.test.ts`.
 *
 * The four stages of BS.1770-5 Annex 1:
 *
 *   1  K-weighting      two biquads, derived here from the analog design
 *   2  mean square      per channel, over the measurement interval
 *   3  channel sum      L_K = -0.691 + 10*log10(sum_i G_i * z_i)   eq (2)
 *   4  gating           400 ms blocks at 75% overlap, two thresholds
 *
 * Everything is built on one grid: **100 ms blocks**. A block's per-channel
 * mean square goes into a 30-slot ring, and every window in the standard is a
 * run of slots off that ring - Momentary is the last 4 (400 ms), Short-term
 * the last 30 (3 s), and the gating block of eq (3) is the same last-4 window
 * emitted once per block, which is exactly the 400 ms block at a 100 ms hop
 * that 75% overlap means. One accumulator, four numbers.
 *
 * The grid is also the update rate, 10 Hz, which meets Tech 3341 §2.2 (>=10 Hz
 * for Short-term, >=1 Hz for Integrated; no rate is stated for Momentary). Its
 * one visible cost is that the sliding windows can only start on a 100 ms
 * boundary, so a tone that starts off-grid never fills a window exactly -
 * `loudness.test.ts` derives that bound and asserts it against Tech 3341
 * cases 13 and 14 rather than leaving it implicit.
 *
 * Integrated and LRA are histograms, so their memory does not depend on how
 * long the programme is. See `HISTOGRAM_BINS`.
 */

// ---------------------------------------------------------------------------
// K-weighting
// ---------------------------------------------------------------------------

/** A biquad in the form of BS.1770-5 Annex 1 Figure 3. */
export interface BiquadCoefficients {
  readonly b0: number;
  readonly b1: number;
  readonly b2: number;
  /** Feedback, in the `y[n] = ... - a1*y[n-1] - a2*y[n-2]` sign convention. */
  readonly a1: number;
  readonly a2: number;
}

/** The two stages of the K-weighting pre-filter, in signal-flow order. */
export interface KWeightingCoefficients {
  /** Stage 1: the spherical-head high shelf. BS.1770-5 Annex 1 Table 1. */
  readonly shelf: BiquadCoefficients;
  /** Stage 2: the RLB high-pass. BS.1770-5 Annex 1 Table 2. */
  readonly highpass: BiquadCoefficients;
}

// The analog design of the two stages. BS.1770-5 Annex 1 tabulates the
// *coefficients* at 48 kHz and says only that "implementations at other
// sampling rates will require different coefficient values, which should be
// chosen to provide the same frequency response". These are the analog
// parameters that reproduce that response, from libebur128's `ebur128.c`
// (MIT); re-applying the bilinear transform at the target rate is what makes
// 44.1 kHz - as common as 48 kHz in a browser AudioContext - a derivation
// rather than a second table to get wrong.
const SHELF_F0 = 1681.974450955533;
const SHELF_GAIN_DB = 3.999843853973347;
const SHELF_Q = 0.7071752369554196;
const RLB_F0 = 38.13547087602444;
const RLB_Q = 0.5003270373238773;

// The shelf's mid-band gain term. The textbook RBJ high shelf uses
// `Vb = sqrt(Vh)`; libebur128 uses this exponent instead, and the difference
// is not cosmetic - see the note on the 2.58e-5 residual in `loudness.test.ts`.
const SHELF_VB_EXPONENT = 0.4996667741545416;

/**
 * The K-weighting biquads at `sampleRate`, derived - never a table lookup.
 *
 * Bilinear transform with the frequency pre-warped at the design frequency:
 * `K = tan(pi * f0 / sampleRate)`. At 48 kHz this reproduces the published
 * BS.1770-5 tables to floating-point exactness, which `loudness.test.ts`
 * asserts against every one of the ten coefficients.
 */
export function kWeightingCoefficients(
  sampleRate: number,
): KWeightingCoefficients {
  // Stage 1: high shelf.
  const sK = Math.tan((Math.PI * SHELF_F0) / sampleRate);
  const sKK = sK * sK;
  const vh = Math.pow(10, SHELF_GAIN_DB / 20);
  const vb = Math.pow(vh, SHELF_VB_EXPONENT);
  const sA0 = 1 + sK / SHELF_Q + sKK;

  // Stage 2: RLB high-pass. Its numerator is exactly (1, -2, 1) - Table 2
  // publishes it that way - so only the poles depend on the rate.
  const hK = Math.tan((Math.PI * RLB_F0) / sampleRate);
  const hKK = hK * hK;
  const hA0 = 1 + hK / RLB_Q + hKK;

  return {
    shelf: {
      b0: (vh + (vb * sK) / SHELF_Q + sKK) / sA0,
      b1: (2 * (sKK - vh)) / sA0,
      b2: (vh - (vb * sK) / SHELF_Q + sKK) / sA0,
      a1: (2 * (sKK - 1)) / sA0,
      a2: (1 - sK / SHELF_Q + sKK) / sA0,
    },
    highpass: {
      b0: 1,
      b1: -2,
      b2: 1,
      a1: (2 * (hKK - 1)) / hA0,
      a2: (1 - hK / RLB_Q + hKK) / hA0,
    },
  };
}

// ---------------------------------------------------------------------------
// The constants of the standard
// ---------------------------------------------------------------------------

/**
 * The calibration constant of BS.1770-5 Annex 1 eq (2). Not a fudge: NOTE 1
 * under eq (7) says it "cancels out the K-weighting gain for 997 Hz", which
 * is +0.691014 dB as derived above - so a 0 dBFS 997 Hz sine on one channel
 * reads -3.01 LKFS. `loudness.test.ts` asserts exactly that.
 */
export const LOUDNESS_OFFSET_LUFS = -0.691;

/** The accumulation grid, in milliseconds. A quarter of a gating block. */
export const BLOCK_MS = 100;

/** Momentary: a sliding 400 ms rectangular window. EBU Tech 3341 §2.2 item 1. */
export const MOMENTARY_BLOCKS = 4;

/** Short-term: a sliding 3 s rectangular window. EBU Tech 3341 §2.2 item 2. */
export const SHORT_TERM_BLOCKS = 30;

/**
 * The absolute 'silence' gate. BS.1770-5 Annex 1 eq (6), `Gamma_a = -70 LKFS`;
 * EBU Tech 3341 §2.3 item 1 and Tech 3342 §5 `ABS_THRES`. Shared by Integrated
 * and LRA.
 */
export const ABSOLUTE_GATE_LUFS = -70;

/**
 * The relative gate for **Integrated** loudness: 10 LU below the absolute-gated
 * level. BS.1770-5 Annex 1 eq (6) (`- 10 LKFS`), EBU Tech 3341 §2.3 item 2.
 *
 * It is not the same number as `LRA_RELATIVE_GATE_LU`, and mixing the two is
 * silent - both produce a plausible reading.
 */
export const INTEGRATED_RELATIVE_GATE_LU = -10;

/**
 * The relative gate for **Loudness Range**: 20 LU below the absolute-gated
 * level of the short-term distribution. EBU Tech 3342 §3.1 ("The relative
 * threshold is set to a level of -20 LU relative to the absolute-gated loudness
 * level") and §5 `REL_THRES`.
 */
export const LRA_RELATIVE_GATE_LU = -20;

/** LRA's lower percentile. EBU Tech 3342 §3.1 and §5 `PRC_LOW`. */
export const LRA_LOW_PERCENTILE = 10;

/** LRA's upper percentile. EBU Tech 3342 §3.1 and §5 `PRC_HIGH`. */
export const LRA_HIGH_PERCENTILE = 95;

/**
 * Bins in each gating histogram: 1000 at 0.1 LU, the lowest edge at the
 * absolute gate. 1000 x 0.1 LU spans -70 to +30 LUFS, which is every value a
 * digital signal can produce with room to spare.
 *
 * The histogram is why memory is O(1) in programme length: both gates become a
 * re-scan of 1000 bins at query time instead of a list of every block seen.
 */
export const HISTOGRAM_BINS = 1000;

/** Width of a histogram bin, in LU. */
export const HISTOGRAM_BIN_LU = 0.1;

/** Loudness at the bottom edge of bin 0 - the absolute gate. */
export const HISTOGRAM_MIN_LUFS = ABSOLUTE_GATE_LUFS;

/**
 * The BS.1770-5 Annex 1 Table 3 channel weights, by channel *position*.
 *
 * Exported to be passed deliberately, not applied automatically:
 * `createLoudnessAnalyzer` defaults every weight to 1.0 and never infers a
 * layout from a channel count, because Web Audio does not say what channel 4
 * is and guessing wrong moves the reading by 1.5 dB in silence. The LFE
 * channel is excluded from the measurement, which is a weight of 0.
 */
export const BS1770_CHANNEL_WEIGHTS = Object.freeze({
  L: 1.0,
  R: 1.0,
  C: 1.0,
  Ls: 1.41,
  Rs: 1.41,
  LFE: 0.0,
});

/** BS.1770-5 Annex 1 Table 3 as a 5.1 weight vector, in L R C LFE Ls Rs order. */
export const BS1770_51_CHANNEL_WEIGHTS: readonly number[] = Object.freeze([
  BS1770_CHANNEL_WEIGHTS.L,
  BS1770_CHANNEL_WEIGHTS.R,
  BS1770_CHANNEL_WEIGHTS.C,
  BS1770_CHANNEL_WEIGHTS.LFE,
  BS1770_CHANNEL_WEIGHTS.Ls,
  BS1770_CHANNEL_WEIGHTS.Rs,
]);

/** BS.1770-5 Annex 1 Table 3 as a 5.0 weight vector, in L R C Ls Rs order. */
export const BS1770_50_CHANNEL_WEIGHTS: readonly number[] = Object.freeze([
  BS1770_CHANNEL_WEIGHTS.L,
  BS1770_CHANNEL_WEIGHTS.R,
  BS1770_CHANNEL_WEIGHTS.C,
  BS1770_CHANNEL_WEIGHTS.Ls,
  BS1770_CHANNEL_WEIGHTS.Rs,
]);

/**
 * Filter state below this magnitude is flushed to zero at the block boundary.
 * -600 dB: far under anything audible, far over the subnormal range, so the
 * one recursive per-sample loop in the package cannot fall into denormals.
 */
const STATE_FLUSH_FLOOR = 1e-30;

// Offsets into the 8-word-per-channel filter state.
const S_X1 = 0;
const S_X2 = 1;
const S_Y1 = 2;
const S_Y2 = 3;
const H_X1 = 4;
const H_X2 = 5;
const H_Y1 = 6;
const H_Y2 = 7;
const STATE_WORDS = 8;

/** `L_K = -0.691 + 10*log10(z)`. BS.1770-5 Annex 1 eq (2). */
export function loudnessFromEnergy(energy: number): number {
  return energy > 0
    ? LOUDNESS_OFFSET_LUFS + 10 * Math.log10(energy)
    : -Infinity;
}

/**
 * The gain, in dB, that moves a measured loudness onto a delivery target.
 *
 * `gainToTarget(-23, -14)` is `9`. Returns dB and leaves applying it to the
 * caller: normalising a buffer has to think about the true-peak ceiling, and
 * that is a different job.
 */
export function gainToTarget(lufs: number, targetLufs: number): number {
  return targetLufs - lufs;
}

// ---------------------------------------------------------------------------
// The gating histogram
// ---------------------------------------------------------------------------

/**
 * A histogram of gating-block loudness, plus the per-bin energy sum.
 *
 * The counts alone would answer both gates, which is all libebur128's histogram
 * mode keeps - but then the final mean is built from bin centres and carries up
 * to 0.05 LU of quantisation, against an EBU tolerance of +/-0.1 LU. Holding the
 * exact energy per bin costs another 8 KB, still O(1) in programme length, and
 * makes the gated mean exact: the only quantised quantity left is *which* bin
 * the threshold falls in, and a block within 0.1 LU of the threshold changes
 * the mean by nothing that survives rounding.
 *
 * Percentiles (LRA) are the one thing that genuinely needs the distribution,
 * and there 0.1 LU sits inside Tech 3342's +/-1 LU.
 */
interface GatingHistogram {
  readonly counts: Uint32Array;
  readonly energies: Float64Array;
  /** Blocks above the absolute gate - stage 1 of the two-stage gate, O(1). */
  count: number;
  /** Their summed energy. */
  energy: number;
}

function createGatingHistogram(): GatingHistogram {
  return {
    counts: new Uint32Array(HISTOGRAM_BINS),
    energies: new Float64Array(HISTOGRAM_BINS),
    count: 0,
    energy: 0,
  };
}

function resetHistogram(h: GatingHistogram): void {
  h.counts.fill(0);
  h.energies.fill(0);
  h.count = 0;
  h.energy = 0;
}

/** Record a block. The caller has already applied the absolute gate. */
function addBlock(h: GatingHistogram, loudness: number, energy: number): void {
  let bin = Math.floor((loudness - HISTOGRAM_MIN_LUFS) / HISTOGRAM_BIN_LU);
  if (bin < 0) bin = 0;
  else if (bin >= HISTOGRAM_BINS) bin = HISTOGRAM_BINS - 1;
  h.counts[bin]++;
  h.energies[bin] += energy;
  h.count++;
  h.energy += energy;
}

/**
 * The first bin at or above the relative threshold, or `HISTOGRAM_BINS` when
 * nothing survives. Stage 2 of the two-stage gate: the threshold is itself a
 * loudness measurement, taken over the absolute-gated blocks.
 */
function relativeGateBin(h: GatingHistogram, gateLu: number): number {
  if (h.count === 0) return HISTOGRAM_BINS;
  const threshold = loudnessFromEnergy(h.energy / h.count) + gateLu;
  const bin = Math.ceil((threshold - HISTOGRAM_MIN_LUFS) / HISTOGRAM_BIN_LU);
  return bin < 0 ? 0 : bin;
}

// ---------------------------------------------------------------------------
// The analyzer
// ---------------------------------------------------------------------------

export interface LoudnessAnalyzerOptions {
  /**
   * Per-channel weights `G_i` of BS.1770-5 eq (2). Defaults to 1.0 for every
   * channel. Pass `BS1770_51_CHANNEL_WEIGHTS` (or your own vector) for a
   * surround layout - nothing here infers one from the channel count.
   */
  channelWeights?: ArrayLike<number>;
  /**
   * How many channels to size state for. Channels beyond it are ignored.
   * Defaults to `channelWeights.length`, or 16.
   */
  maxChannels?: number;
  /**
   * Whether to accumulate the Integrated/LRA histograms from construction.
   * Default `true`, so an offline call - where the programme *is* the buffer -
   * needs no session ceremony. A live meter can start `false` and call
   * `startIntegration()` when the caller declares a programme.
   */
  integrate?: boolean;
}

/**
 * The four EBU R 128 quantities. LUFS, except `lra` which is LU.
 *
 * `-Infinity` means "no signal": silence, or a window/gate that admitted
 * nothing. `lra` is `0` when fewer than two short-term values survive gating.
 */
export interface LoudnessReadings {
  momentary: number;
  shortTerm: number;
  integrated: number;
  lra: number;
}

export interface LoudnessAnalyzer {
  readonly sampleRate: number;
  /** Samples in one 100 ms accumulation block. */
  readonly blockSize: number;
  /** The `G_i` actually in use. Live - do not mutate. */
  readonly channelWeights: Float64Array;
  /**
   * Bytes held by every typed array in the analyzer, fixed at construction.
   * Asserting this is unchanged after an hour of audio is the honest form of
   * "memory is constant regardless of programme length".
   */
  readonly bytes: number;

  /**
   * Consume `length` samples from each channel starting at `offset`.
   * Allocates nothing. Channels past `maxChannels` are ignored, and the channel
   * count is expected to be stable across calls.
   */
  process(
    channels: ArrayLike<ArrayLike<number>>,
    offset?: number,
    length?: number,
  ): void;

  /** Momentary loudness, LUFS: the last 400 ms. Ungated. */
  momentary(): number;
  /** Short-term loudness, LUFS: the last 3 s. Ungated. */
  shortTerm(): number;
  /** Integrated loudness, LUFS, over the current integration session. */
  integrated(): number;
  /** Loudness Range, LU, over the current integration session. */
  lra(): number;
  /** All four, into a reused object. Allocates nothing; do not retain it. */
  results(): LoudnessReadings;

  /** Enable integration and discard the histograms - a new programme starts here. */
  startIntegration(): void;
  /** Tech 3341 §2.2's 'stand-by': stop accumulating, keep what is there. */
  stopIntegration(): void;
  /**
   * Discard the Integrated and LRA histograms, leaving the M/S windows and the
   * filter state running. Tech 3341 §2.4: "The LRA computation is reset when
   * the Integrated Loudness measurement is reset" - so the two always go
   * together.
   */
  resetIntegration(): void;
  /** Everything: filter state, block ring, histograms. */
  reset(): void;
}

/**
 * A BS.1770-5 loudness analyzer at `sampleRate`.
 *
 * Incremental and allocation-free after this call returns, so the same object
 * serves a worklet's render quantum and an offline chunk loop - which is the
 * point: the two cannot disagree about a number the user can see.
 */
export function createLoudnessAnalyzer(
  sampleRate: number,
  options: LoudnessAnalyzerOptions = {},
): LoudnessAnalyzer {
  const maxChannels =
    options.maxChannels ?? options.channelWeights?.length ?? 16;
  const blockSize = Math.round((sampleRate * BLOCK_MS) / 1000);

  const weights = new Float64Array(maxChannels);
  weights.fill(1);
  if (options.channelWeights) {
    const given = options.channelWeights;
    for (let c = 0; c < maxChannels && c < given.length; c++) {
      weights[c] = given[c];
    }
  }

  const { shelf, highpass } = kWeightingCoefficients(sampleRate);
  const sb0 = shelf.b0;
  const sb1 = shelf.b1;
  const sb2 = shelf.b2;
  const sa1 = shelf.a1;
  const sa2 = shelf.a2;
  // The high-pass numerator is (1, -2, 1) by definition; only its poles vary.
  const ha1 = highpass.a1;
  const ha2 = highpass.a2;

  const state = new Float64Array(maxChannels * STATE_WORDS);
  const blockSum = new Float64Array(maxChannels);
  const blockHasSignal = new Uint8Array(maxChannels);
  // The ring: 30 slots (Short-term) x maxChannels of block mean square.
  const ring = new Float64Array(SHORT_TERM_BLOCKS * maxChannels);

  const integratedHistogram = createGatingHistogram();
  const lraHistogram = createGatingHistogram();

  const readings: LoudnessReadings = {
    momentary: -Infinity,
    shortTerm: -Infinity,
    integrated: -Infinity,
    lra: 0,
  };

  const bytes =
    weights.byteLength +
    state.byteLength +
    blockSum.byteLength +
    blockHasSignal.byteLength +
    ring.byteLength +
    2 *
      (integratedHistogram.counts.byteLength +
        integratedHistogram.energies.byteLength);

  let channelCount = 0;
  let blockFill = 0;
  let writeIndex = 0;
  let blocksSeen = 0;
  let integrating = options.integrate ?? true;

  /**
   * `sum_i G_i * z_i` over the last `blocks` slots of the ring, where `z_i` is
   * the channel's mean square across the window. Slots not yet written are
   * zero, so a window that reaches back before the start of the signal is a
   * window over silence - which is what it is.
   */
  function windowEnergy(blocks: number): number {
    let total = 0;
    for (let c = 0; c < channelCount; c++) {
      const weight = weights[c];
      if (weight === 0) continue;
      let power = 0;
      for (let k = 1; k <= blocks; k++) {
        const slot = (writeIndex - k + SHORT_TERM_BLOCKS) % SHORT_TERM_BLOCKS;
        power += ring[slot * maxChannels + c];
      }
      total += weight * (power / blocks);
    }
    return total;
  }

  /** K-weight `count` samples of one channel and accumulate their squares. */
  function filterInto(
    channel: ArrayLike<number>,
    c: number,
    from: number,
    count: number,
  ): void {
    const o = c * STATE_WORDS;
    let sx1 = state[o + S_X1];
    let sx2 = state[o + S_X2];
    let sy1 = state[o + S_Y1];
    let sy2 = state[o + S_Y2];
    let hx1 = state[o + H_X1];
    let hx2 = state[o + H_X2];
    let hy1 = state[o + H_Y1];
    let hy2 = state[o + H_Y2];
    let sum = blockSum[c];
    let sawSignal = blockHasSignal[c] !== 0;

    for (let i = 0; i < count; i++) {
      // `Math.fround` so a Float64Array handed to the offline driver measures
      // as the same signal the realtime path would have seen.
      const x = Math.fround(channel[from + i]);
      if (x !== 0) sawSignal = true;
      const w = sb0 * x + sb1 * sx1 + sb2 * sx2 - sa1 * sy1 - sa2 * sy2;
      sx2 = sx1;
      sx1 = x;
      sy2 = sy1;
      sy1 = w;
      const y = w - 2 * hx1 + hx2 - ha1 * hy1 - ha2 * hy2;
      hx2 = hx1;
      hx1 = w;
      hy2 = hy1;
      hy1 = y;
      sum += y * y;
    }

    state[o + S_X1] = sx1;
    state[o + S_X2] = sx2;
    state[o + S_Y1] = sy1;
    state[o + S_Y2] = sy2;
    state[o + H_X1] = hx1;
    state[o + H_X2] = hx2;
    state[o + H_Y1] = hy1;
    state[o + H_Y2] = hy2;
    blockSum[c] = sum;
    blockHasSignal[c] = sawSignal ? 1 : 0;
  }

  /**
   * Close a 100 ms block: write the ring, flush, and emit to the histograms.
   *
   * The flush is the reason a silent channel reads `-Infinity` rather than
   * "very quiet". Two biquads in series ring for a long time in f64, and a
   * channel carrying no signal must not report the tail of one it used to
   * carry - so a block with no non-zero input sample zeroes both the power and
   * the filter state. Everything else only loses state that is already below
   * -600 dB, which also keeps the one per-sample recursive loop in the package
   * out of the denormal range.
   */
  function finishBlock(): void {
    const base = writeIndex * maxChannels;
    for (let c = 0; c < channelCount; c++) {
      const o = c * STATE_WORDS;
      if (blockHasSignal[c] === 0) {
        ring[base + c] = 0;
        for (let w = 0; w < STATE_WORDS; w++) state[o + w] = 0;
      } else {
        ring[base + c] = blockSum[c] / blockSize;
        for (let w = 0; w < STATE_WORDS; w++) {
          if (Math.abs(state[o + w]) < STATE_FLUSH_FLOOR) state[o + w] = 0;
        }
      }
      blockSum[c] = 0;
      blockHasSignal[c] = 0;
    }
    writeIndex = (writeIndex + 1) % SHORT_TERM_BLOCKS;
    blocksSeen++;

    if (!integrating) return;

    // The gating block of BS.1770-5 eq (3): 400 ms, 75% overlap, emitted once
    // the first complete one exists. "Incomplete gating blocks at the end of
    // the measurement interval are not used" - and there is no end here, so a
    // trailing partial 100 ms block simply never closes.
    if (blocksSeen >= MOMENTARY_BLOCKS) {
      const z = windowEnergy(MOMENTARY_BLOCKS);
      const l = loudnessFromEnergy(z);
      // eq (6): `J_g = {j : l_j > Gamma_a}`, strictly greater.
      if (l > ABSOLUTE_GATE_LUFS) addBlock(integratedHistogram, l, z);
    }
    if (blocksSeen >= SHORT_TERM_BLOCKS) {
      const z = windowEnergy(SHORT_TERM_BLOCKS);
      const l = loudnessFromEnergy(z);
      // Tech 3342 §5 gates with `>=`; the difference from eq (6) is a set of
      // measure zero, but it is the document's own comparison.
      if (l >= ABSOLUTE_GATE_LUFS) addBlock(lraHistogram, l, z);
    }
  }

  function integrated(): number {
    const start = relativeGateBin(
      integratedHistogram,
      INTEGRATED_RELATIVE_GATE_LU,
    );
    let count = 0;
    let energy = 0;
    for (let bin = start; bin < HISTOGRAM_BINS; bin++) {
      count += integratedHistogram.counts[bin];
      energy += integratedHistogram.energies[bin];
    }
    return count === 0 ? -Infinity : loudnessFromEnergy(energy / count);
  }

  function lra(): number {
    const start = relativeGateBin(lraHistogram, LRA_RELATIVE_GATE_LU);
    let n = 0;
    for (let bin = start; bin < HISTOGRAM_BINS; bin++) {
      n += lraHistogram.counts[bin];
    }
    if (n === 0) return 0;

    // Tech 3342 §5 indexes a sorted vector at `round((n-1)*p/100 + 1)`, which
    // is this rank 0-based. The histogram is that vector already sorted.
    const lowRank = Math.round(((n - 1) * LRA_LOW_PERCENTILE) / 100);
    const highRank = Math.round(((n - 1) * LRA_HIGH_PERCENTILE) / 100);
    let seen = 0;
    let low = -Infinity;
    let high = -Infinity;
    for (let bin = start; bin < HISTOGRAM_BINS; bin++) {
      const c = lraHistogram.counts[bin];
      if (c === 0) continue;
      seen += c;
      const centre = HISTOGRAM_MIN_LUFS + (bin + 0.5) * HISTOGRAM_BIN_LU;
      if (low === -Infinity && seen > lowRank) low = centre;
      if (seen > highRank) {
        high = centre;
        break;
      }
    }
    return high - low;
  }

  function resetIntegration(): void {
    resetHistogram(integratedHistogram);
    resetHistogram(lraHistogram);
  }

  return {
    sampleRate,
    blockSize,
    channelWeights: weights,
    bytes,

    process(channels, offset = 0, length?: number) {
      const n = Math.min(channels.length, maxChannels);
      if (n === 0) return;
      if (n > channelCount) channelCount = n;
      const count = length ?? channels[0].length - offset;

      let done = 0;
      while (done < count) {
        const take = Math.min(blockSize - blockFill, count - done);
        for (let c = 0; c < n; c++) {
          filterInto(channels[c], c, offset + done, take);
        }
        blockFill += take;
        done += take;
        if (blockFill === blockSize) {
          finishBlock();
          blockFill = 0;
        }
      }
    },

    momentary: () => loudnessFromEnergy(windowEnergy(MOMENTARY_BLOCKS)),
    shortTerm: () => loudnessFromEnergy(windowEnergy(SHORT_TERM_BLOCKS)),
    integrated,
    lra,

    results() {
      readings.momentary = loudnessFromEnergy(windowEnergy(MOMENTARY_BLOCKS));
      readings.shortTerm = loudnessFromEnergy(windowEnergy(SHORT_TERM_BLOCKS));
      readings.integrated = integrated();
      readings.lra = lra();
      return readings;
    },

    startIntegration() {
      integrating = true;
      resetIntegration();
    },
    stopIntegration() {
      integrating = false;
    },
    resetIntegration,

    reset() {
      state.fill(0);
      blockSum.fill(0);
      blockHasSignal.fill(0);
      ring.fill(0);
      resetIntegration();
      channelCount = 0;
      blockFill = 0;
      writeIndex = 0;
      blocksSeen = 0;
    },
  };
}
