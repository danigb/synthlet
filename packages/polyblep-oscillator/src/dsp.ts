// TODO: Add more waveforms: https://gist.github.com/danigb/c86f94ad5145f2367fb4880c227824ec

import { blampResidual4, blepResidual4 } from "./_blep";
import { createGateDetector } from "./_gate";

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
 *
 * ## Hard sync
 *
 * A rising edge on `sync` restarts the phase at `phaseStart`. That is a step
 * *and* a slope change at a sub-sample instant, which is exactly one
 * `addDiscontinuity` call - so the triangle, whose reset produces a corner as
 * well as a jump, is the same line of code as the sawtooth rather than the
 * separate piece of work Brandt's section 6.3 warns it would be.
 *
 * A sample that carries a reset is **two sub-advances**, not one: the phase
 * runs to the reset instant, jumps, and runs on to the sample. Both halves are
 * walked by `move`, so a wrap or a width edge on either side of the reset is
 * corrected exactly once and at its own age.
 *
 * Advancing once and resetting afterwards - the obvious reading - is wrong in
 * both directions at the same time. The pre-reset trajectory schedules
 * crossings the reset pre-empted, and the post-reset one is never walked at
 * all, so the crossings it really makes are never scheduled. Neither is exotic:
 * at `phaseStart = 0` with a negative increment the restart wraps immediately,
 * every time. Measured over 432 settings (4 master frequencies, 4 waveforms, 9
 * slave frequencies, 3 widths), the single-advance version peaks at **2.6190**
 * against **1.0037** for this one, and reaches 2.0000 with no negative
 * frequency anywhere in the grid.
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
 *
 * The clamp is `[-MAX_INC, MAX_INC]`, symmetric about zero, because `frequency`
 * is bipolar and a negative increment runs the phase backwards. Stages spells
 * the same widening `CONSTRAIN(frequency, -kMaxFrequency, kMaxFrequency)` under
 * its `through_zero_fm` flag, `refs/eurorack/stages/oscillator.h:123`; here it
 * is unconditional, because there is no shape in this file that must not have
 * it.
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
 *
 * `slope` is `d naive / d phase`, which the *sync* reset needs and the two
 * fixed discontinuities do not: a reset lands at an arbitrary pair of phases,
 * so its corner is the difference of two slopes rather than one of the four
 * signs above. The two spellings agree where they overlap - for the triangle
 * `slope(0-) - slope(0+)` is `-(2/w + 2/(1-w))`, which is `slope0` times the
 * magnitude `corner` carries - and `dsp.test.ts` asserts it.
 */
type Waveform = {
  naive: (phase: number, width: number) => number;
  slope: (phase: number, width: number) => number;
  /** At phase 0. */
  step0: number;
  slope0: number;
  /** At phase `width`. */
  stepH: number;
  slopeH: number;
};

/** Indexed by `PolyblepOscillatorType`, in brightness order. */
const WAVEFORMS: readonly Waveform[] = [
  // Sine: no discontinuity anywhere, so no correction and no kernel evaluation
  // - until a `sync` reset splices two arbitrary points of it together, which
  // is a step and a corner like any other. That is what `slope` is for here.
  {
    naive: (phase) => Math.sin(TAU * phase),
    slope: (phase) => TAU * Math.cos(TAU * phase),
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
    slope: (phase, width) => (phase < width ? 2 / width : -2 / (1 - width)),
    step0: 0,
    slope0: 1,
    stepH: 0,
    slopeH: -1,
  },
  // Sawtooth: one step of -2 as the phase wraps.
  {
    naive: (phase) => 2 * phase - 1,
    slope: () => 2,
    step0: -2,
    slope0: 0,
    stepH: 0,
    slopeH: 0,
  },
  // Square: +1 until `width`, per the Web Audio spec. A pulse wave, and its
  // mean is `2 * width - 1` by construction - real DC, not a bug to filter out.
  {
    naive: (phase, width) => (phase < width ? 1 : -1),
    slope: () => 0,
    step0: 2,
    slope0: 0,
    stepH: -2,
    slopeH: 0,
  },
];

const LAST_TYPE = WAVEFORMS.length - 1;

/**
 * The initial phase, normalised into `[0, 1)`.
 *
 * `"random"` draws once, here, at construction - which is the whole point of
 * the option. Three detuned `PolyblepOscillator`s are a supersaw, and built
 * from the same factory they otherwise start phase-locked and comb for the
 * first few hundred milliseconds until they have drifted apart.
 *
 * A number is taken modulo 1, so `1.25` and `-0.75` both mean 0.25. Anything
 * that is neither - a NaN, an infinity, an absent option - is 0, the phase this
 * package has always started at, so an unset `phase` changes nothing.
 */
function initialPhase(phase: number | "random" | undefined): number {
  if (phase === "random") return Math.random();
  const wrapped = typeof phase === "number" ? phase - Math.floor(phase) : 0;
  // A comparison rather than `isFinite` for `increment()`'s reason: every
  // comparison against a NaN is false, so a NaN falls through to 0 instead of
  // seeding a phase from which nothing recovers.
  return wrapped >= 0 && wrapped < 1 ? wrapped : 0;
}

/**
 * How many samples ago the gate crossed zero, given the previous sample and
 * this one - the age `addDiscontinuity` takes, in `[0, 1)`.
 *
 * `createGateDetector` says *whether* an edge happened; this is the fraction,
 * and it is this package's arithmetic rather than the shared contract's. With
 * `g- <= 0` and `g > 0` the crossing lies at `f = -g- / (g - g-)` of the way
 * from `i-1` to `i`, so it happened `1 - f` samples before sample `i`.
 *
 * **The two guards.**
 *
 * The denominator is `>= g > 0` for every pair the detector reports, so it can
 * only fail to be positive if one of the samples is a NaN - which reaches here,
 * because a NaN is neither `> 0` nor `<= 0` and so leaves the detector's own
 * state untouched until a real sample arrives. `rise > 0` is the test that
 * catches it, and it resolves to `f = 1`: an age of 0, this sample.
 *
 * An age of **exactly 1** is the one value the residual's convention cannot
 * express - it places the discontinuity on the previous sample, whose naive
 * value is the one from *before* the jump, and ticket 07 measured +/-2.000 on a
 * +/-1 waveform three ways when it was allowed through. It is not a knife edge
 * here, it is the *common* case: a gate written with `setValueAtTime` steps
 * `0 -> 1` between two samples, `f` is 0 and the age is 1. Reading it as 0 is
 * also the right answer for that gate - the first sample at or after the
 * scheduled time is sample `i`, not sample `i-1` - so the guard and the
 * semantics agree. The test is on the age rather than on `f` because
 * `1 - 1e-17` is 1 in binary floating point.
 */
function crossingAge(previous: number, gate: number): number {
  const rise = gate - previous;
  const raw = rise > 0 ? -previous / rise : 1;
  const fraction = raw > 0 ? (raw < 1 ? raw : 1) : 0;
  const age = 1 - fraction;
  return age < 1 ? age : 0;
}

/** `step`'s "no reset in this sample": any negative number does. */
const NO_RESET = -1;

export function createPolyblepOscillator(
  sampleRate: number,
  startPhase?: number | "random",
) {
  const ivsr = 1 / sampleRate;

  /**
   * Where the phase starts, and where a `sync` reset restarts it.
   *
   * One value, two jobs, because they are the same thing: a reset is a rising
   * edge on `sync` and `phase` is where it resets to. Fixed at construction -
   * an `AudioParam` would imply it meant something continuously, and it is a
   * one-time initial condition.
   */
  const phaseStart = initialPhase(startPhase);

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
   * 1.833 on a signal whose largest step is 0.917. A `sync` reset is scheduled
   * against the same reference, for the same reason.
   */
  let prevWave = WAVEFORMS[PolyblepOscillatorType.Sawtooth];

  /** Set on the first `generate`, when the real increment is finally known. */
  let primed = false;

  /**
   * The gate contract, `scripts/_gate.ts`: a reset is the transition from
   * non-positive to positive, so holding `sync` high fires once rather than
   * once per sample, and a falling edge fires nothing.
   *
   * `previousSync` is separate because the detector deliberately does not carry
   * it: it answers *whether* an edge happened, and the sub-sample fraction is
   * this package's own arithmetic. See `crossingAge`.
   */
  const detectSync = createGateDetector();
  let previousSync = 0;

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
   *
   * `notAfter` is the age of a `sync` reset scheduled later in this sample. A
   * crossing *younger* than it is one the pre-reset phase would have made after
   * the reset had already happened, so it did not happen at all and is dropped.
   * It is 0 for every sample that carries no reset, where `d >= 0` always holds
   * and the test is not reachable.
   */
  function addCrossing(
    overshoot: number,
    rate: number,
    stepHeight: number,
    slopeChange: number,
    notAfter: number,
  ) {
    const raw = overshoot / rate;
    const d = raw > 0 ? (raw < 1 ? raw : 1) : 0;
    if (d >= notAfter) addDiscontinuity(d, stepHeight, slopeChange);
  }

  /**
   * Advance the phase by `span` and schedule whatever it crossed on the way.
   *
   * `span` is a *fraction* of `inc` - the whole of it for an ordinary sample,
   * and the two parts either side of a `sync` reset for a sample that carries
   * one. `inc` stays the full increment because it is the *rate*: `overshoot /
   * inc` is an age in samples however far this call moved the phase, so a
   * crossing found in either half is already dated from sample `i` and needs no
   * offset.
   */
  function move(
    span: number,
    inc: number,
    previous: Waveform,
    previousWidth: number,
    w: number,
    corner: number,
    notAfter: number,
  ) {
    phase += span;

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
        const rate = inc - (w - previousWidth);
        // `g / rate` is the age, and a backward phase can push it to exactly 1:
        // `nowHigh` is `g < 0`, a strict comparison, so a phase sitting
        // precisely on the edge counts as low and the flip is noticed a sample
        // late. Reachable across a whole octave, not at a knife edge - at
        // `|inc| = MAX_INC` the width clamp pins `w` to 0.5 and the phase
        // lattice is quarter-integers, so every `|frequency| >= sampleRate / 4`
        // lands on it. Measured, the square then emitted 1.917.
        //
        // Reading such an age as 0 puts the correction on this sample, whose
        // naive value is the post-jump one, which is the half of the kernel
        // `blepResidual4(0)` is: see the backward wrap below. The guard is
        // written against `inc` rather than against `rate` so that it cannot
        // touch a non-negative increment - clamping an age of 1 or more to 1 is
        // ticket 05's reading, for a `width` that has retreated past the phase,
        // and this ticket does not renegotiate it. It is written against `inc`
        // rather than against `span` for a second reason once `span` can be a
        // fraction: the age this guard rejects is 1, not `span / inc`, and in
        // the post-reset half of a sample an age of 1 is unreachable.
        addCrossing(
          inc < 0 ? (g > rate ? g : 0) : g,
          rate,
          direction * previous.stepH,
          direction * previous.slopeH * corner,
          notAfter,
        );
      }
    }

    // The discontinuity at phase 0, crossed in whichever direction the phase
    // happens to be travelling. `frequency` is bipolar, so `inc` can be
    // negative and the phase runs backwards; a backward crossing is the same
    // call to the same primitive with the signed quantities negated. There is
    // no second code path, only a second branch.
    //
    // **The step height flips and the age does not.** Going forward the naive
    // sawtooth falls by 2 at the wrap; going backward it rises by 2, so the
    // height is `-step0`. The age is `overshoot / inc` either way: below zero
    // both are negative and the quotient is the same `d` in `[0, 1)` the
    // forward path produces.
    //
    // The corner flips for the same reason and arrives at the opposite place.
    // `corner` carries the sign of `inc`, so `-slope0 * corner` is
    // `+(2/w + 2/(1-w)) * |inc|` for a negative increment - the same sign the
    // forward branch gives. That is right: phase 0 is the triangle's *minimum*,
    // and a minimum in time stays a minimum however the phase reaches it.
    //
    // Wrapping both ways is also what makes this a wrap rather than a
    // subtraction. It is `phase -= Math.floor(phase)` spelled as the two
    // branches a crossing detector needs, and the second branch is the one that
    // sends -0.01 to 0.99. Ticket 02 measured that the one-sided form passed
    // every test it had and predicted this ticket would change that; deleting
    // this branch now fails `holds the alias floor at a negative frequency` and
    // `is finite over the whole declared range`.
    //
    // Stages spells the same pair at
    // `refs/eurorack/stages/oscillator.h:159-164,204-211,233-239`.
    if (phase >= 1) {
      phase -= 1;
      high = true;
      if (previous.step0 !== 0 || previous.slope0 !== 0)
        addCrossing(
          phase,
          inc,
          previous.step0,
          previous.slope0 * corner,
          notAfter,
        );
    } else if (phase < 0) {
      // `phase / inc` is the age, and it reaches exactly 1 when the phase was
      // sitting precisely on 0 before this sample. An age of 1 puts the
      // discontinuity on the *previous* sample, whose naive value is the one
      // from before the jump - the one arrangement the residual's convention
      // cannot express, since `blepResidual4(0)` is the post-jump half of the
      // kernel. Measured, it emits -2 on a signal bounded by 1.
      //
      // Reading it as 0 puts the same band-limited step on *this* sample, whose
      // naive value is the post-jump one, and the crossing instant is genuinely
      // ambiguous anyway: the phase had already reached the boundary and only
      // this sample's increment tells us it left going backwards. It is the
      // reachable case, not a curiosity - `connectParams` writes
      // `frequency = 0` for every connected input, so an oscillator whose
      // frequency is a modulator sits at phase 0 until the modulator's first
      // sample arrives, and that sample may be negative. A cold start at a
      // negative frequency reaches it too, on the second priming sample.
      //
      // A comparison rather than a division for `increment()`'s reason, and
      // because it keeps the forward and backward ages on the same half-open
      // `[0, 1)`: `phase > inc` is `phase / inc < 1` with both sides negative.
      const overshoot = phase > inc ? phase : 0;
      phase += 1;
      // `|inc| <= MAX_INC` and `w <= 1 - 2|inc|` put the wrapped phase in
      // `[1 - |inc|, 1)`, which is strictly above `w`: a backward wrap always
      // lands on the far side of the width edge, exactly as a forward one
      // always lands below it.
      high = false;
      if (previous.step0 !== 0 || previous.slope0 !== 0)
        addCrossing(
          overshoot,
          inc,
          -previous.step0,
          -previous.slope0 * corner,
          notAfter,
        );
    }
  }

  /**
   * One sample: advance, schedule, accumulate, emit `slot(i - 2)`.
   *
   * `resetAge` is how many samples ago a `sync` edge restarted the phase, or
   * `NO_RESET`. A sample that carries one is walked in two parts - up to the
   * reset instant and on from it - which is what keeps a wrap or a width edge
   * on either side of the reset corrected exactly once, at its own age.
   */
  function step(
    inc: number,
    wave: Waveform,
    requestedWidth: number,
    resetAge: number,
  ): number {
    const previous = prevWave;
    const previousWidth = width;
    const w = clampWidth(requestedWidth, inc);
    width = w;

    // The triangle's corner, per sample: `8 * inc` at `w = 0.5`, exactly.
    // Stages' `(slope_up + slope_down) * frequency`,
    // `refs/eurorack/stages/oscillator.h:189,200`.
    const corner = (2 / w + 2 / (1 - w)) * inc;

    // Part one: the phase this sample would have had with no reset in it. A
    // crossing younger than the reset is one the reset pre-empted, so `move`
    // drops it rather than correcting a jump that never happened.
    move(
      inc,
      inc,
      previous,
      previousWidth,
      w,
      corner,
      resetAge > 0 ? resetAge : 0,
    );

    if (resetAge >= 0) {
      // Kleimola & Valimaki's two rules, in this architecture.
      //
      // **Rule 1, scale by the actual height.** Unlike the fixed jump of 2 in a
      // plain saw, a reset's height varies with the master/slave ratio: it is
      // whatever the naive function does between the phase the slave had
      // reached and the phase it restarts at. The corner is the difference of
      // the two slopes, which is zero for the sawtooth and the square, and is
      // not for the triangle or the sine - Brandt's section 6.3 handled rather
      // than avoided, and the same `addDiscontinuity` call either way.
      //
      // `previous`, not `wave`, for `prevWave`'s reason: the reset happened at
      // `i - resetAge`, at or before a `type` change that takes effect at `i`.
      // The type change is then scheduled below against the *post*-reset phase,
      // so the two compose into one path rather than double-counting.
      const raw = phase - resetAge * inc;
      const from = raw < 0 ? raw + 1 : raw >= 1 ? raw - 1 : raw;
      addDiscontinuity(
        resetAge,
        previous.naive(phaseStart, w) - previous.naive(from, w),
        (previous.slope(phaseStart, w) - previous.slope(from, w)) * inc,
      );

      // **Rule 2, restart at the proportional sub-sample offset.** The phase
      // restarts at `phaseStart` *at the reset instant*, not at sample `i`, so
      // part two carries it the remaining `resetAge * inc` - forwards or, under
      // a negative increment, backwards, which needs no special case because
      // `move` already wraps both ways.
      //
      // `high` is restated from the restart phase rather than left as part one
      // left it, so that a reset which jumps across the width edge is corrected
      // once, by the step above, instead of also being reported as an edge
      // crossing. `previousWidth` is `w` in part two for the same reason: the
      // width does not move inside a sample twice.
      phase = phaseStart;
      high = phase < w;
      move(resetAge * inc, inc, previous, w, w, corner, 0);
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
    syncParam?: Float32Array,
  ) {
    // `type` is an AudioParam, so it arrives as a float. Round to the nearest
    // waveform and clamp; the comparisons resolve a NaN to 0 rather than
    // leaving the waveform undefined.
    const rounded = Math.round(waveformType);
    const index = rounded > 0 ? (rounded < LAST_TYPE ? rounded : LAST_TYPE) : 0;
    const wave = WAVEFORMS[index];

    // The house a-rate check, hoisted once per block and once per parameter -
    // see `_worklet.ts` next to `ParamDescriptor` for the whole of it.
    const length = output.length;
    const freqIsARate = frequency.length > 1;
    const detuneIsARate = detune.length > 1;
    const widthIsARate = widthParam.length > 1;
    // `sync` is optional so that a caller with nothing to sync to - every test
    // written before this ticket, and `spectrum.ts`'s harness - takes the same
    // path it always did, to the bit. A connected but silent gate takes the
    // other path and produces the same samples, which `dsp.test.ts` asserts.
    const synced = syncParam !== undefined && syncParam.length > 0;
    const syncIsARate = synced && syncParam.length > 1;

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
      // one increment behind `phaseStart` puts sample `n` at phase
      // `phaseStart + n * inc`, the convention the harnesses assume and the one
      // `phase` is declared in.
      phase = phaseStart - inc;
      // Stated rather than left at its initial `true`, and stated at
      // `phaseStart` rather than at the phase one increment behind it: the
      // oscillator's history begins where `phase` says it does, so a
      // `phaseStart` that happens to sit just past the width edge must not open
      // with a crossing of an edge it never crossed. At `phaseStart = 0` the
      // two spellings agree - the width clamp keeps `w` above `|inc|` - which
      // is what makes this line free of charge for every existing render.
      high = phaseStart < width;
      step(inc, wave, widthParam[0], NO_RESET);
      step(inc, wave, widthParam[0], NO_RESET);
    }

    for (let i = 0; i < length; i++) {
      let resetAge = NO_RESET;
      if (synced) {
        const gate = syncIsARate ? syncParam[i] : syncParam[0];
        if (detectSync(gate) === true)
          resetAge = crossingAge(previousSync, gate);
        previousSync = gate;
      }
      output[i] = step(
        increment(
          freqIsARate ? frequency[i] : frequency[0],
          detuneIsARate ? detune[i] : detune[0],
        ),
        wave,
        widthIsARate ? widthParam[i] : widthParam[0],
        resetAge,
      );
    }
  };

  function increment(freq: number, cents: number): number {
    if (cents !== $cents) {
      $cents = cents;
      detuneFactor = Math.pow(2, cents / 1200);
    }
    const raw = freq * detuneFactor * ivsr;
    // Clamp to [-MAX_INC, MAX_INC], symmetric about zero because `frequency` is
    // bipolar. Still written as comparisons, not `Math.min`/`Math.max`: every
    // comparison against a NaN is false, so a NaN falls through both branches
    // to the 0 that means hold, while `Math.min(0.25, Math.max(-0.25, NaN))` is
    // `NaN` and one NaN increment would poison the pending ring for good. The
    // same fall-through normalises `-0` to `+0`, so a negative zero frequency
    // holds rather than seeding a negative zero phase, and it catches
    // `-Infinity` at `-MAX_INC` the way it catches `+Infinity` at `MAX_INC`.
    if (raw > 0) return raw < MAX_INC ? raw : MAX_INC;
    if (raw < 0) return raw > -MAX_INC ? raw : -MAX_INC;
    return 0;
  }
}
