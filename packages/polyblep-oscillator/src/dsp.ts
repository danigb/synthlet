// TODO: Add more waveforms: https://gist.github.com/danigb/c86f94ad5145f2367fb4880c227824ec

import { blampResidual4, blepResidual4 } from "./_blep";

/*
 * A band-limited oscillator built on one primitive.
 *
 * Every waveform here is a *naive* function of the phase plus a list of where
 * its discontinuities fall. The generator walks the phase, notices when it
 * crosses one of those places, and asks `addDiscontinuity` to write a
 * correction - the 4-point B-spline residuals of `_blep.ts` - into the samples
 * around it. Nothing predicts where a discontinuity is going to land; the
 * scheduler writes backwards into samples it has already computed but not yet
 * emitted, which is why the output lags the input by two samples.
 *
 * ## The structure is Mutable Instruments'
 *
 * `refs/eurorack/stages/oscillator.h:133-245` (MIT, (c) 2017 Emilie Gillet)
 * carries a `this_sample` / `next_sample` pair: one pending sample, written by
 * the discontinuity that has just been detected. That is exactly this file with
 * a support of +/-1 sample. The 4-point kernel's support is +/-2, so the pair
 * becomes a ring of four and the delay becomes two. Its `high_ ^ (phase_ < pw)`
 * edge test and its `(slope_up + slope_down) * frequency` recipe for scaling a
 * corner are both here; so is its `kMaxFrequency = 0.25`. See
 * THIRD-PARTY-LICENSES.md.
 *
 * **The kernels are deliberately not stmlib's.** At 2-point order its
 * `NextIntegratedBlepSample` measures 3-7 dB better than the cubic residual
 * (74.7 vs 71.1 dB at 440 Hz, 55.9 vs 48.7 at 4186 Hz). At 4-point order the
 * B-spline BLAMP beats both by a further 10-20 dB, which is why this file takes
 * stmlib's *structure* and `_blep.ts`'s *polynomials*. Do not "fix" it back.
 *
 * ## The phase convention
 *
 * Phase 0 is the step for the sawtooth and the square, and the triangle's
 * **minimum**. That is what makes `width` mean the same thing for both
 * families: the second discontinuity sits at `width`, and moving it turns the
 * square into a pulse and the triangle into a saw through the same parameter.
 *
 * ## Latency
 *
 * Two samples, about 45 us at 44.1 kHz - the only latency in the library, and
 * bought deliberately. The alternative is predictive placement, which computes
 * where a discontinuity will fall from the increment at the time it is
 * detected; under fast FM the increment has changed by the time the correction
 * lands, and it lands wrong. A scheduler that writes backwards cannot.
 */

export enum PolyblepOscillatorType {
  Sine = 0,
  Triangle = 1,
  Sawtooth = 2,
  Square = 3,
}

const TAU = Math.PI * 2;

/**
 * The floor `width` is clamped to when the increment cannot supply one.
 *
 * `clampWidth`'s real bound is `2 * |inc|`, which is zero at `inc = 0` - and the
 * triangle divides by `width` and by `1 - width`. A denominator that is a
 * parameter needs a floor that does not depend on another parameter: the
 * audit's Architecture Insight 3.
 */
const MIN_WIDTH = 1e-3;

/**
 * Stages caps the increment at 0.25 cycles/sample (`kMaxFrequency`,
 * `refs/eurorack/stages/oscillator.h:53`) and so does this. Two reasons:
 * the 4-point kernel's support is +/-2 samples, so two corrections a half cycle
 * apart start to overlap below it; and one sample must never step over both
 * discontinuities, or a crossing goes undetected.
 *
 * It caps the oscillator at `sampleRate / 4` - 11025 Hz at 44.1 kHz, above the
 * top of a piano and above every frequency this package's tests measure, but
 * below the declared `frequency` maximum of 20000. That is deliberate, not an
 * oversight.
 */
const MAX_INC = 0.25;

/**
 * `width`, made safe for the sample about to be generated.
 *
 * `2 * |inc|` keeps the two discontinuities at least two samples apart, which
 * is the 4-point kernel's support: any closer and the two corrections overlap.
 * Stages spells the same bound `CONSTRAIN(pw, fabsf(frequency) * 2.0f, 1.0f -
 * 2.0f * fabsf(frequency))` at `refs/eurorack/stages/oscillator.h:125,149`.
 *
 * It also bounds the triangle's corner, which is the less obvious half. At
 * `w = 2|inc|` the per-sample corner `(2/w + 2/(1 - w)) * |inc|` is
 * `1 + 2|inc|`, so it can never exceed 1.5 however low the frequency goes.
 * Without the bound it grows without limit as `w -> 0` and a skewed triangle
 * explodes.
 *
 * `Math.abs` rather than the raw increment because ticket 07 makes it negative.
 * Comparisons rather than `Math.min`/`Math.max` for `increment()`'s reason:
 * they resolve a NaN to the lower bound instead of propagating it through the
 * pending ring, which would poison the node for good.
 *
 * `|inc| <= MAX_INC` is what keeps `low <= 1 - low`. At the maximum increment
 * the interval degenerates to the single point 0.5; it never inverts.
 */
function clampWidth(requested: number, inc: number): number {
  const margin = inc < 0 ? -2 * inc : 2 * inc;
  const low = margin > MIN_WIDTH ? margin : MIN_WIDTH;
  const high = 1 - low;
  return requested > low ? (requested < high ? requested : high) : low;
}

/**
 * A waveform is a naive function plus where its discontinuities fall.
 *
 * `step*` is the signed jump in the naive function. `slope*` is the *sign* of
 * the corner there - `+1`, `-1` or `0` - which the scheduler multiplies by the
 * width-dependent magnitude `(2/w + 2/(1 - w)) * inc`, the per-sample slope
 * change `blampResidual4` is defined against. That magnitude is `8 * inc` at
 * `width = 0.5`, which is where ticket 04's `+/-8` came from: a symmetric unit
 * triangle runs at `+/-4` per cycle.
 *
 * `naive` takes the width as well as the phase. The sine and the sawtooth
 * ignore it; a "skewed sawtooth" is the triangle at `width -> 1`, so a second
 * spelling of it would only be another branch.
 */
type Waveform = {
  naive: (phase: number, width: number) => number;
  /** At phase 0. */
  step0: number;
  slope0: number;
  /** At phase `width`. */
  stepH: number;
  slopeH: number;
};

/** Indexed by `PolyblepOscillatorType`, in brightness order. */
const WAVEFORMS: readonly Waveform[] = [
  // Sine: no discontinuity anywhere, so no correction and no kernel evaluation.
  {
    naive: (phase) => Math.sin(TAU * phase),
    step0: 0,
    slope0: 0,
    stepH: 0,
    slopeH: 0,
  },
  // Triangle: minimum at phase 0, maximum at `width`. Corrected directly, with
  // no integrator and no DC blocker - it peaks at 0.999 at 20 Hz.
  //
  // The falling branch is `1 - 2 * (phase - width) / (1 - width)` rearranged.
  // The two are equal in exact arithmetic; this spelling is also equal *in
  // binary floating point* to ticket 04's `3 - 4 * phase` when `width` is 0.5,
  // because `x -> 2x` is exact, so `2 * fl(1.5 - 2p)` is `fl(3 - 4p)`. That is
  // what makes "width 0.5 reproduces the symmetric triangle exactly" a claim
  // about bits rather than about tolerances. The rising branch is exactly
  // `4 * phase - 1` at 0.5 for the same reason.
  {
    naive: (phase, width) =>
      phase < width
        ? (2 * phase) / width - 1
        : (1 + width - 2 * phase) / (1 - width),
    step0: 0,
    slope0: 1,
    stepH: 0,
    slopeH: -1,
  },
  // Sawtooth: one step of -2 as the phase wraps.
  {
    naive: (phase) => 2 * phase - 1,
    step0: -2,
    slope0: 0,
    stepH: 0,
    slopeH: 0,
  },
  // Square: +1 until `width`, per the Web Audio spec. A pulse wave, and its
  // mean is `2 * width - 1` by construction - real DC, not a bug to filter out.
  {
    naive: (phase, width) => (phase < width ? 1 : -1),
    step0: 2,
    slope0: 0,
    stepH: -2,
    slopeH: 0,
  },
];

const LAST_TYPE = WAVEFORMS.length - 1;

export function createPolyblepOscillator(sampleRate: number) {
  const ivsr = 1 / sampleRate;

  /*
   * The pending output. Four slots in a ring, holding the samples whose
   * corrections are not yet complete: `slot(i - 2)` through `slot(i + 1)`,
   * exactly the 4-point kernel's support. `write` is the ring index of
   * `slot(i)`. The ring persists across `generate` calls - that is the carry
   * across render quanta, and `dsp.test.ts`'s block-size test is what fails if
   * it stops.
   */
  const pending = new Float64Array(4);
  let write = 0;
  let phase = 0;

  /** `phase < width` on the previous sample: Stages' `high_`. */
  let high = true;

  /**
   * The clamped `width` in force on the previous sample.
   *
   * It is state for the same reason `prevWave` is. A crossing detected on
   * sample `i` is the zero of `phase(t) - width(t)`, not of
   * `phase(t) - width_i`: with `width` at a-rate the edge can be crossed
   * because the *width* moved, and then the crossing belongs partly to the
   * previous sample's width. `step` uses it to compute the closing speed the
   * sub-sample age is measured against.
   */
  let width = 0.5;

  /**
   * The waveform in force on the previous sample. A crossing detected on sample
   * `i` happened at time `i - d`, which is at or before a `type` change that
   * takes effect at `i`, so the crossing belongs to the *previous* waveform.
   * Correcting it with the new waveform's step instead double-counts: measured,
   * a switch to a square landing on its own falling edge produced a jump of
   * 1.833 on a signal whose largest step is 0.917.
   */
  let prevWave = WAVEFORMS[PolyblepOscillatorType.Sawtooth];

  /** Set on the first `generate`, when the real increment is finally known. */
  let primed = false;

  // Param cache: `Math.pow` only when the cents value actually moves.
  let $cents = 0;
  let detuneFactor = 1;

  /**
   * Superpose one discontinuity's correction, `d` samples after it happened.
   *
   * `d` is in `[0, 1]`, so `k + d` sweeps `[-2, -1]`, `[-1, 0]`, `[0, 1]` and
   * `[1, 2]` - the 4-point support, and exactly the four live slots. Two
   * discontinuities within two samples of each other simply add, so there is no
   * case analysis anywhere in this file.
   *
   * `blampResidual4` is even but is written in `d = |t|` and does not mirror a
   * negative argument, so the absolute value here is load-bearing.
   */
  function addDiscontinuity(
    d: number,
    stepHeight: number,
    slopeChange: number,
  ) {
    for (let k = -2; k <= 1; k++) {
      const t = k + d;
      pending[(write + k + 4) & 3] +=
        stepHeight * blepResidual4(t) +
        slopeChange * blampResidual4(t < 0 ? -t : t);
    }
  }

  /**
   * The same, for a discontinuity that has just been crossed. `overshoot` is
   * how far past it the crossed quantity now sits and `rate` is how fast that
   * quantity is closing, so `overshoot / rate` is the crossing's age in
   * samples.
   *
   * For the wrap, both are about the phase alone and `rate` is the increment.
   * For the edge at `width` the crossed quantity is `phase - width`, which
   * moves at `inc - deltaWidth`: with the width held that is the increment to
   * the bit, and with the width moving it is the difference between a
   * correction placed where the edge really was and one placed by a divisor
   * that is not the closing speed.
   *
   * **The division here is the only one in the generator** (the file's two
   * others, `1 / sampleRate` and `cents / 1200`, are by constants), and the
   * clamp is what makes it total. In every ordinary case the quotient is
   * already in `[0, 1)` and the clamp is a no-op; it exists so that the one
   * degenerate case a moving width can reach - a held `frequency = 0` sitting
   * exactly on the width, `0 / 0` - resolves to 0 rather than writing a NaN
   * into the pending ring, from which nothing recovers.
   */
  function addCrossing(
    overshoot: number,
    rate: number,
    stepHeight: number,
    slopeChange: number,
  ) {
    const raw = overshoot / rate;
    const d = raw > 0 ? (raw < 1 ? raw : 1) : 0;
    addDiscontinuity(d, stepHeight, slopeChange);
  }

  /** One sample: advance, schedule, accumulate, emit `slot(i - 2)`. */
  function step(inc: number, wave: Waveform, requestedWidth: number): number {
    const previous = prevWave;
    const previousWidth = width;
    const w = clampWidth(requestedWidth, inc);
    width = w;
    phase += inc;

    // The triangle's corner, per sample: `8 * inc` at `w = 0.5`, exactly.
    // Stages' `(slope_up + slope_down) * frequency`,
    // `refs/eurorack/stages/oscillator.h:189,200`.
    const corner = (2 / w + 2 / (1 - w)) * inc;

    // The discontinuity at `width`, tested before the wrap so `phase - width`
    // is still measured in the same cycle. `MAX_INC` and the width clamp
    // together guarantee one sample cannot step over both this and the wrap.
    //
    // Stages' `high_ ^ (phase_ < pw)`
    // (`refs/eurorack/stages/oscillator.h:187,217`): one test that fires both
    // when the phase advances past the width and when the width retreats past
    // the phase. In the second case the naive function goes *back* to its first
    // branch, so the jump is the negative of the one going forwards - which
    // ticket 04 never needed, because only the phase could move.
    const g = phase - w;
    const nowHigh = g < 0;
    if (high !== nowHigh) {
      high = nowHigh;
      if (previous.stepH !== 0 || previous.slopeH !== 0) {
        const direction = nowHigh ? -1 : 1;
        addCrossing(
          g,
          inc - (w - previousWidth),
          direction * previous.stepH,
          direction * previous.slopeH * corner,
        );
      }
    }

    // The discontinuity at phase 0.
    if (phase >= 1) {
      phase -= 1;
      high = true;
      if (previous.step0 !== 0 || previous.slope0 !== 0)
        addCrossing(phase, inc, previous.step0, previous.slope0 * corner);
    }

    // A type change is a discontinuity too: `type` is k-rate, so it lands on a
    // block boundary as a step of the difference between the two waveforms at
    // this phase. Switching mid-note is click-free instead of a hard jump.
    if (wave !== previous) {
      addDiscontinuity(0, wave.naive(phase, w) - previous.naive(phase, w), 0);
      prevWave = wave;
    }

    pending[write] += wave.naive(phase, w);

    // `slot(i - 2)` is complete: everything whose support reaches it has been
    // written. Emit it and hand the freed slot forward as `slot(i + 2)`.
    const out = pending[(write + 2) & 3];
    pending[(write + 2) & 3] = 0;
    write = (write + 1) & 3;
    return out;
  }

  return function generate(
    output: Float32Array,
    waveformType: number,
    frequency: Float32Array,
    detune: Float32Array,
    widthParam: Float32Array,
  ) {
    // `type` is an AudioParam, so it arrives as a float. Round to the nearest
    // waveform and clamp; the comparisons resolve a NaN to 0 rather than
    // leaving the waveform undefined.
    const rounded = Math.round(waveformType);
    const index = rounded > 0 ? (rounded < LAST_TYPE ? rounded : LAST_TYPE) : 0;
    const wave = WAVEFORMS[index];

    // `packages/state-variable-filter/src/dsp.ts:103-117`'s idiom: an a-rate
    // parameter arrives one value per frame, a k-rate one as a single value.
    const length = output.length;
    const freqIsARate = frequency.length === length;
    const detuneIsARate = detune.length === length;
    const widthIsARate = widthParam.length === length;

    if (!primed) {
      primed = true;
      prevWave = wave;
      const inc = increment(frequency[0], detune[0]);
      // Seed the width too, or the first sample compares its edge against the
      // 0.5 this closure was constructed with and schedules a crossing that
      // never happened.
      width = clampWidth(widthParam[0], inc);
      // Two samples of the ring are filled before the first is emitted, so the
      // first `process()` returns real output rather than two zeros. Starting
      // one increment behind puts sample `n` at phase `n * inc`, the convention
      // the harnesses and `phase` (ticket 06) both assume.
      phase = -inc;
      // Stated rather than left at its initial `true`: `high` means
      // `phase < width`, and ticket 07 makes `-inc` positive.
      high = phase < width;
      step(inc, wave, widthParam[0]);
      step(inc, wave, widthParam[0]);
    }

    for (let i = 0; i < length; i++) {
      output[i] = step(
        increment(
          freqIsARate ? frequency[i] : frequency[0],
          detuneIsARate ? detune[i] : detune[0],
        ),
        wave,
        widthIsARate ? widthParam[i] : widthParam[0],
      );
    }
  };

  function increment(freq: number, cents: number): number {
    if (cents !== $cents) {
      $cents = cents;
      detuneFactor = Math.pow(2, cents / 1200);
    }
    const raw = freq * detuneFactor * ivsr;
    // Clamp to [0, MAX_INC]. Written as comparisons, not `Math.min`/`Math.max`,
    // because they resolve a NaN to 0: `Math.min(0.25, Math.max(0, NaN))` is
    // `NaN`, and one NaN increment would freeze the phase forever.
    return raw > 0 ? (raw < MAX_INC ? raw : MAX_INC) : 0;
  }
}
