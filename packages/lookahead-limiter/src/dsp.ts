/**
 * A true-peak lookahead brickwall limiter.
 *
 * Re-derived from published algorithm descriptions:
 *
 * - Hämäläinen, *Smoothing of the Control Signal without Clipped Output in
 *   Digital Peak Limiters*, DAFx-02, §3.5 - the sliding-minimum plus boxcar
 *   gain-smoothing structure (steps 3 and 5 below implement eq 6 and eq 17/21,
 *   dualised into the gain domain).
 * - ITU-R BS.1770-4 Annex 2 - 4x oversampled true-peak measurement (step 1).
 *
 * Two things this file does that the sources do not:
 *
 * - **The release cascade (step 4) is not in the paper.** It is derived here
 *   from the five requirements recorded on `releaseStage` below.
 * - **The true-peak interpolator is BS.1770-*style*, not the ITU reference
 *   coefficients.** BS.1770-4 Annex 2 Attachment 1 publishes a specific
 *   48-coefficient 4-phase table; this is a different filter in the same
 *   family - a 48-tap Hann-windowed sinc, designed here rather than committed
 *   as a table. The accuracy claim is therefore measured, not inherited:
 *   `dsp.test.ts` asserts that a full-scale sine reads within +/-0.1 dB from
 *   60 Hz to 10 kHz at 48 kHz, and within +/-0.35 dB from there to 20 kHz.
 *
 *   The wider bound above 10 kHz is the 4x grid, not the filter. Four points
 *   per input sample is 9.6 points per cycle at 20 kHz, so the densest
 *   reconstruction point can sit up to cos(pi * f / (4 * fs)) below the true
 *   peak - about -0.48 dB at 20 kHz in the worst phase. Every BS.1770 4x
 *   detector has this property; the spec's own note about it is why higher
 *   rates exist. What it means here is that the ceiling guarantee is a
 *   guarantee about the 4x estimate, which is what "dBTP" conventionally
 *   means, and not about the analogue waveform to the last hundredth of a dB.
 *
 * No third-party limiter source is present. See THIRD-PARTY-LICENSES.md.
 *
 * The seven steps, per sample:
 *
 *   0  drive:    x = input * dbToGain(gain)
 *   1  detect:   tp = 4x true-peak estimate of x[n - TP_DELAY], max over channels
 *   2  request:  gReq = min(1, ceiling / tp)
 *   3  hold:     m = sliding minimum of gReq over the last L + 1 samples
 *   4  release:  two asymmetric one-poles in series - instant down, smoothed up
 *   5  attack:   boxcar mean of step 4 over the last L samples
 *   6  apply:    multiply the signal delayed by D = L + TP_DELAY
 *   7  backstop: hard clamp at the *current* ceiling - arithmetic only
 *
 * Steps 3 and 5 are what make the ceiling hold: the gain has already reached
 * its minimum by the time the peak that asked for it arrives at step 6.
 */

const TP_PHASES = 4;
const TP_TAPS = 48;
const TP_HISTORY = TP_TAPS / TP_PHASES; // 12 input samples per phase

/**
 * Group delay of the interpolator, in input samples: (TP_TAPS - 1) / 2 quarter
 * samples is 5.875, and the tap design puts the unit tap at exactly 6.
 *
 * This is the number the design gets wrong most often: the delay line is
 * L + TP_DELAY, *not* L.
 */
export const TP_DELAY = 6;

const UNITY_SNAP = 1e-12; // R5: reach exact unity in finite time
const BOXCAR_REBUILD = 4096; // periodic sum rebuild, bounds f64 drift
const RECOVERY_SPAN_TAU = 3.3579; // 10-90% rise time of two cascaded poles

export const DEFAULT_LOOKAHEAD_MS = 2;
export const MIN_LOOKAHEAD_MS = 0.5;
export const MAX_LOOKAHEAD_MS = 5;

/** The lookahead window in samples: the hold length of steps 3 and 5. */
export function lookaheadSamples(ms: number, sampleRate: number): number {
  const clamped = Math.min(MAX_LOOKAHEAD_MS, Math.max(MIN_LOOKAHEAD_MS, ms));
  return Math.max(1, Math.round((clamped * sampleRate) / 1000));
}

/** Total delay the node introduces: the lookahead window plus the detector's. */
export function latencySamples(ms: number, sampleRate: number): number {
  return lookaheadSamples(ms, sampleRate) + TP_DELAY;
}

const dbToGain = (db: number) => Math.pow(10, db / 20);

/**
 * The polyphase branches of the 4x interpolator, TP_PHASES x TP_HISTORY.
 *
 * Branch p is every fourth tap of the 48-tap prototype starting at p, so one
 * dot product per branch reconstructs one of the four points between input
 * samples. Branch 0 is a pure delay by TP_DELAY - the sinc's zeros fall on the
 * other taps - which is why the centre sample comes out of it exactly.
 */
const PHASE_TAPS = (() => {
  const phases: Float64Array[] = [];
  for (let p = 0; p < TP_PHASES; p++) phases.push(new Float64Array(TP_HISTORY));
  for (let j = 0; j < TP_TAPS; j++) {
    const window = 0.5 * (1 - Math.cos((2 * Math.PI * j) / TP_TAPS));
    const m = j - TP_TAPS / 2;
    const arg = (m * Math.PI) / TP_PHASES;
    const tap = Math.abs(m) > 1e-6 ? (window * Math.sin(arg)) / arg : window;
    phases[j % TP_PHASES][(j / TP_PHASES) | 0] = tap;
  }
  return phases;
})();

/**
 * A true-peak limiter over `lookaheadMs` of lookahead at `sampleRate`.
 *
 * The returned function is the audio-path entry point and allocates nothing.
 * Everything it needs is sized here, so changing the lookahead means a new
 * limiter - which is exactly why `lookahead` is not an AudioParam.
 */
export function createLimiter(sampleRate: number, lookaheadMs: number) {
  const L = lookaheadSamples(lookaheadMs, sampleRate);
  const D = L + TP_DELAY;

  const detector = createTruePeakDetector();
  const slidingMin = createSlidingMin(L + 1);

  // Step 4 state: two one-poles in series, both starting at unity.
  let r1 = 1;
  let r2 = 1;
  let $release = -1; // last release seen, so the coefficient is cached
  let releaseCoeff = 0;

  // Step 5 state: a boxcar of the last L smoothed gains, held as a running sum.
  const box = new Float64Array(L).fill(1);
  let boxPos = 0;
  let boxSum = L;
  let sampleCount = 0;

  // Step 6 state: one D-sample ring per channel, grown on demand.
  const delay: Float32Array[] = [];
  let delayPos = 0;

  // Test-facing statistics. Never read on the audio path.
  let minGain = 1;
  let clampCount = 0;
  let maxOvershoot = 0;

  function limiter(
    inputs: Float32Array[],
    outputs: Float32Array[],
    threshold: Float32Array,
    release: number,
    gain: Float32Array,
    gainOut?: Float32Array,
  ): void {
    const channels = outputs.length;
    if (channels === 0) return;

    const inputChannels = inputs.length;
    // An unconnected input arrives as `[]`: the output block is then the only
    // thing that says how many samples to render. The loop still runs - it
    // flushes the D-sample tail and lets the gain recover to unity, which a
    // limiter must do and an early return would freeze.
    const blockSize = inputChannels > 0 ? inputs[0].length : outputs[0].length;

    while (delay.length < channels) delay.push(new Float32Array(D));
    detector.channels(channels);

    if (release !== $release) {
      $release = release;
      const tau = Math.max(0.1, release / RECOVERY_SPAN_TAU) / 1000;
      releaseCoeff = Math.exp(-1 / (sampleRate * tau));
    }
    const a = releaseCoeff;

    // Web Audio hands over an array of either 1 or `blockSize` values. The
    // dB conversion is a `Math.pow`, so do it once per block in the common
    // constant case and per sample only when the parameter is truly a-rate.
    const thresholdIsARate = threshold.length === blockSize && blockSize > 1;
    const driveIsARate = gain.length === blockSize && blockSize > 1;
    let ceiling = dbToGain(threshold[0]);
    let drive = dbToGain(gain[0]);

    for (let i = 0; i < blockSize; i++) {
      if (thresholdIsARate) ceiling = dbToGain(threshold[i]);
      if (driveIsARate) drive = dbToGain(gain[i]);

      // 0 + 1: drive, then the true peak of the sample TP_DELAY ago.
      //
      // `Math.fround` is not cosmetic: the delay ring is a Float32Array, so
      // what step 6 replays is the driven sample rounded to f32. Measuring the
      // unrounded f64 would let a sample come back very slightly hotter than
      // the detector saw it, and step 7 would have to trim the difference.
      detector.advance();
      for (let c = 0; c < channels; c++) {
        const x = c < inputChannels ? Math.fround(inputs[c][i] * drive) : 0;
        detector.write(c, x);
      }
      const tp = detector.peak(channels);

      // 2: the gain that sample needs
      const requested = tp <= ceiling ? 1 : ceiling / tp;

      // 3: hold the minimum over the lookahead window
      const held = slidingMin(requested);

      // 4: fall instantly, rise smoothly
      r1 = releaseStage(held, r1, a);
      r2 = releaseStage(r1, r2, a);

      // 5: boxcar the result into a linear attack ramp
      const previous = box[boxPos];
      box[boxPos] = r2;
      boxPos = boxPos + 1 === L ? 0 : boxPos + 1;
      boxSum += r2 - previous;
      if (++sampleCount % BOXCAR_REBUILD === 0) {
        boxSum = 0;
        for (let k = 0; k < L; k++) boxSum += box[k];
      }
      const applied = boxSum / L;
      if (applied < minGain) minGain = applied;
      if (gainOut) gainOut[i] = applied;

      // 6 + 7: apply to the delayed signal, then the arithmetic backstop
      for (let c = 0; c < channels; c++) {
        const ring = delay[c];
        const delayed = ring[delayPos];
        ring[delayPos] =
          c < inputChannels ? Math.fround(inputs[c][i] * drive) : 0;

        // At exactly unity the multiply is skipped, so an unlimited signal
        // comes out bit-exact rather than merely very close.
        let y = applied === 1 ? delayed : delayed * applied;
        const magnitude = y < 0 ? -y : y;
        if (magnitude > ceiling) {
          clampCount++;
          const overshoot = (magnitude - ceiling) / ceiling;
          if (overshoot > maxOvershoot) maxOvershoot = overshoot;
          y = y > 0 ? ceiling : -ceiling;
        }
        outputs[c][i] = y;
      }
      delayPos = delayPos + 1 === D ? 0 : delayPos + 1;
    }
  }

  /**
   * Test-facing only: how far the gain fell, and what step 7 had to do.
   *
   * `maxOvershoot` is the relative amount the backstop clipped away. It is the
   * number that says whether the ballistics actually hold the ceiling: the
   * clamp does fire on samples that land exactly on it, because the boxcar
   * sum is maintained incrementally and its last bit drifts, but an overshoot
   * of more than a few ulps means the smoothing let a real peak through.
   */
  limiter.stats = () => ({ minGain, clampCount, maxOvershoot });
  limiter.latency = D;
  return limiter;
}

/**
 * Exported for `dsp.test.ts` only - `index.ts` does not re-export it, so it
 * stays inside the package and out of the published surface.
 *
 * BS.1770-style 4x true-peak detection: an oversampled reconstruction of the
 * sample TP_DELAY inputs ago, taken as the max over all channels.
 *
 * One gain drives every channel, which is what keeps a stereo image from
 * wandering when only one side is hot. A channel appearing mid-stream gets a
 * zero-filled ring, so it fades in over the delay length.
 *
 * The interpolator is not the ITU reference coefficient table - see the file
 * header for what is and is not claimed.
 */
export function createTruePeakDetector() {
  const history: Float64Array[] = []; // one TP_HISTORY ring per channel
  let pos = 0;

  return {
    channels(count: number): void {
      while (history.length < count) history.push(new Float64Array(TP_HISTORY));
    },

    advance(): void {
      pos = pos + 1 === TP_HISTORY ? 0 : pos + 1;
    },

    write(channel: number, value: number): void {
      history[channel][pos] = value;
    },

    peak(channelCount: number): number {
      let tp = 0;
      for (let c = 0; c < channelCount; c++) {
        const h = history[c];
        const centre = h[(pos + TP_HISTORY - TP_DELAY) % TP_HISTORY];
        const centreAbs = centre < 0 ? -centre : centre;
        if (centreAbs > tp) tp = centreAbs;

        for (let p = 0; p < TP_PHASES; p++) {
          const taps = PHASE_TAPS[p];
          let acc = 0;
          for (let j = 0; j < TP_HISTORY; j++) {
            acc += taps[j] * h[(pos + TP_HISTORY - j) % TP_HISTORY];
          }
          const abs = acc < 0 ? -acc : acc;
          if (abs > tp) tp = abs;
        }
      }
      return tp;
    },
  };
}

/**
 * Exported for `dsp.test.ts` only, like `createTruePeakDetector` above.
 *
 * Monotonic deque: O(1) amortised sliding minimum over the last `window`
 * pushes, including the current one.
 *
 * The deque holds indices whose values are strictly increasing, so the front
 * is always the window minimum: a new value evicts every entry it undercuts
 * (they can never be the minimum again) and the front expires by age.
 */
export function createSlidingMin(window: number) {
  const capacity = window + 1;
  const idx = new Float64Array(capacity);
  const val = new Float64Array(capacity);
  let head = 0;
  let length = 0;
  let next = 0;

  return function push(v: number): number {
    const i = next++;
    while (length > 0 && val[(head + length - 1) % capacity] >= v) length--;
    const tail = (head + length) % capacity;
    idx[tail] = i;
    val[tail] = v;
    length++;
    if (idx[head] + window <= i) {
      head = (head + 1) % capacity;
      length--;
    }
    return val[head];
  };
}

/**
 * One stage of the release cascade. Derived from five requirements, recorded
 * because the choice of *second* order is otherwise unexplainable:
 *
 *   R1 ceiling safety - S(m)[n] <= m[n] pointwise, or the hold argument fails
 *   R2 no attack lag  - when m falls, follow immediately; shaping is step 5's job
 *   R3 recovery over release_ms
 *   R4 continuous first derivative at release onset - a single pole's slope
 *      jumps when m stops falling, and that step is what is heard as pumping
 *   R5 exact unity in finite time, so the bit-exact passthrough is recoverable
 *
 * R1+R2 force "instant down, smoothed up". R3 rules out an FIR (its support is
 * the lookahead, two orders too short). R4 rules out a single pole. Order 2 is
 * the minimum that satisfies all five - which is why it is 2 and not 3.
 */
function releaseStage(target: number, state: number, a: number): number {
  if (target < state) return target; // R2
  const next = target + (state - target) * a; // R1: approach from below
  if (target === 1 && 1 - next < UNITY_SNAP) return 1; // R5
  return next;
}
