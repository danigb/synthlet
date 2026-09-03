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
 * **minimum**. That is what will make `width` mean the same thing for both
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
 * Where the second discontinuity sits, in cycles. Fixed at half a cycle until
 * `width` becomes a parameter; named rather than inlined so that diff is small.
 */
const WIDTH = 0.5;

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
 * A waveform is a naive function plus where its discontinuities fall.
 *
 * `step*` is the signed jump in the naive function; `slope*` is the change in
 * its slope per *cycle*, which the scheduler multiplies by the increment to get
 * the per-sample change `blampResidual4` is defined against. A unit triangle
 * runs at `+/-4` per cycle, so its corners are `+8` and `-8`.
 */
type Waveform = {
  naive: (phase: number) => number;
  /** At phase 0. */
  step0: number;
  slope0: number;
  /** At phase `WIDTH`. */
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
  // Triangle: minimum at phase 0, maximum at WIDTH. Corrected directly, with no
  // integrator and no DC blocker - it peaks at 0.999 at 20 Hz.
  {
    naive: (phase) => (phase < WIDTH ? 4 * phase - 1 : 3 - 4 * phase),
    step0: 0,
    slope0: 8,
    stepH: 0,
    slopeH: -8,
  },
  // Sawtooth: one step of -2 as the phase wraps.
  {
    naive: (phase) => 2 * phase - 1,
    step0: -2,
    slope0: 0,
    stepH: 0,
    slopeH: 0,
  },
  // Square: +1 for the first half of the cycle, per the Web Audio spec.
  {
    naive: (phase) => (phase < WIDTH ? 1 : -1),
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

  /** `phase < WIDTH` on the previous sample: Stages' `high_`. */
  let high = true;

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
   * `d` is in `[0, 1)`, so `k + d` sweeps `[-2, -1)`, `[-1, 0)`, `[0, 1)` and
   * `[1, 2)` - the 4-point support, and exactly the four live slots. Two
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
   * The same, for a discontinuity the phase has just crossed: `overshoot` is
   * how far past it the phase now sits, and `slopePerCycle` is the waveform's
   * slope change per cycle rather than per sample.
   *
   * **The division here is the only one in the generator**, and it cannot
   * divide by zero: it runs only from inside a crossing branch, and a crossing
   * requires the phase to have moved, which requires a non-zero increment. A
   * held `frequency = 0` never reaches it. (The file's two other divisions,
   * `1 / sampleRate` and `cents / 1200`, are by constants.)
   */
  function addCrossing(
    overshoot: number,
    inc: number,
    stepHeight: number,
    slopePerCycle: number,
  ) {
    addDiscontinuity(overshoot / inc, stepHeight, slopePerCycle * inc);
  }

  /** One sample: advance, schedule, accumulate, emit `slot(i - 2)`. */
  function step(inc: number, wave: Waveform): number {
    const previous = prevWave;
    phase += inc;

    // The discontinuity at WIDTH, tested before the wrap so `phase - WIDTH` is
    // still measured in the same cycle. `MAX_INC` guarantees one sample cannot
    // step over both this and the wrap, so at most one branch fires.
    if (high !== phase < WIDTH) {
      high = phase < WIDTH;
      if (previous.stepH !== 0 || previous.slopeH !== 0)
        addCrossing(phase - WIDTH, inc, previous.stepH, previous.slopeH);
    }

    // The discontinuity at phase 0.
    if (phase >= 1) {
      phase -= 1;
      high = true;
      if (previous.step0 !== 0 || previous.slope0 !== 0)
        addCrossing(phase, inc, previous.step0, previous.slope0);
    }

    // A type change is a discontinuity too: `type` is k-rate, so it lands on a
    // block boundary as a step of the difference between the two waveforms at
    // this phase. Switching mid-note is click-free instead of a hard jump.
    if (wave !== previous) {
      addDiscontinuity(0, wave.naive(phase) - previous.naive(phase), 0);
      prevWave = wave;
    }

    pending[write] += wave.naive(phase);

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

    if (!primed) {
      primed = true;
      prevWave = wave;
      const inc = increment(frequency[0], detune[0]);
      // Two samples of the ring are filled before the first is emitted, so the
      // first `process()` returns real output rather than two zeros. Starting
      // one increment behind puts sample `n` at phase `n * inc`, the convention
      // the harnesses and `phase` (ticket 06) both assume.
      phase = -inc;
      step(inc, wave);
      step(inc, wave);
    }

    for (let i = 0; i < length; i++) {
      output[i] = step(
        increment(
          freqIsARate ? frequency[i] : frequency[0],
          detuneIsARate ? detune[i] : detune[0],
        ),
        wave,
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
