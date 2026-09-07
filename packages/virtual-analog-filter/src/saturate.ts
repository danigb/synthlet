// Where the feedback path stops being linear, in this package's units, where a
// signal is nominally +/-1.
//
// Huovilainen's scale is the transistors' thermal voltage: his eq. (1) is
// `I_t1 - I_t2 = (I_t1 + I_t2) * tanh(dV / 2Vt)`, so the knee sits wherever the
// circuit's signal level happens to sit relative to about 26 mV. There is no
// transfer of that number to a normalised digital signal, so this one is ours,
// and it was chosen by measurement rather than derived: it is the value that
// makes the ladder settle at roughly full scale when it self-oscillates. Say so
// rather than implying Huovilainen picked it.
const KNEE = 0.4;

// Four, and the residual is asserted rather than assumed - see
// `saturate.test.ts`. The initial estimate is the *linear* solution, which is
// exactly right wherever the signal is small compared to the knee, so below it
// there is nothing to iterate on at all; Chowdhury notes that "the performance
// of the Newton-Raphson method ... can be greatly improved through the use of
// an intelligently chosen initial estimate", and this is that estimate.
//
// Measured worst-case residual over every (A, B, k, x) the parameter ranges
// permit: 8.9e-3 at two iterations, 1.4e-5 at three, 9.0e-11 at four. Worst in
// the transition region rather than at the extremes, which is where the linear
// estimate is least useful. Four is under float32's own resolution, which is
// the line worth being on the right side of for a value that feeds straight
// back into the filter's state - and it is nearly free: measured 82, 103 and
// 112 ns a call for two, three and four, because the cost is the fixed setup
// and the first `tanh` rather than the loop.
const ITERATIONS = 4;

/**
 * The ladder's differential pair.
 *
 * Huovilainen 2004 eq. (1)-(6): the two transistors' collector currents differ
 * by `(I_t1 + I_t2) * tanh(dV / 2Vt)`, so the summing junction where the input
 * meets the feedback is a hyperbolic tangent. That one nonlinearity is what
 * makes a ladder able to scream: the loop gain is above 1 for small signals and
 * falls below it as the amplitude grows, so the oscillation settles instead of
 * decaying or diverging. A linear ladder has one loop gain for every amplitude
 * and can only do the other two.
 *
 * Huovilainen also puts a `tanh` in each of the four stages. Those are not
 * here, and that is a scope decision rather than an omission: they shape the
 * harmonics rather than create the oscillation, they turn this scalar solve
 * into a four-dimensional one - the case Chowdhury singles out as the expensive
 * one, "since computing J^-1 requires a matrix inversion at every iteration" -
 * and Huovilainen is explicit that they need oversampling, which is ticket 08.
 */
export function saturate(x: number) {
  return KNEE * Math.tanh(x / KNEE);
}

/**
 * Solve `y = A*(x - k*saturate(y)) + B` for `y`, the signal the feedback path
 * reads.
 *
 * This is Chowdhury's discrete-time method (*A Review of Methods for Resolving
 * Delay-Free Loops*, section 4), which his conclusion recommends for purely
 * digital systems: "forming continuous-time equations often adds unnecessary
 * complexity, so the discrete-time method is often simpler, more flexible, and
 * reasonably efficient". It writes any filter's output as an input gain plus
 * the zero-input response of its current state, `y = h0*c + H_n`, and both of
 * those are already in the ladders' coefficient blocks - `A` is `G^4` for the
 * full ladder and `G^2(2G-1)` for the half, and `B` is the state sum the linear
 * code already forms. So the nonlinear version replaces two lines rather than
 * rewriting the filter, and below the knee it returns exactly what the linear
 * closed form returned.
 *
 * Newton-Raphson on
 *
 *     F(y)  = y + A*k*saturate(y) - (A*x + B)
 *     F'(y) = 1 + A*k*saturate'(y)
 *
 * The alternative, and the one Huovilainen himself uses, is to put a unit delay
 * in the feedback path and not resolve the loop at all - his eq. (13) reads
 * `yd(n-1)`. His sections 5.2 and 5.3 are then entirely about compensating the
 * tuning error that delay causes, with a half-sample delay and a residual
 * "less than 10% for f < Fs/4". Taking that would retune this filter, and not
 * retuning it is the point.
 */
export function resolve(A: number, B: number, k: number, x: number) {
  const target = A * x + B;
  const loop = A * k;
  let y = target / (1 + loop);
  for (let n = 0; n < ITERATIONS; n++) {
    const t = Math.tanh(y / KNEE);
    y -= (y + loop * KNEE * t - target) / (1 + loop * (1 - t * t));
  }
  return y;
}

/** Exposed so the tests can state the knee rather than repeat the number. */
export const SATURATION_KNEE = KNEE;

/**
 * Where in the `resonance` range the linear self-oscillation threshold sits.
 *
 * `resonance: 1.0` used to land on `k = 4.0` *exactly* - the analytic threshold
 * of a linear four-pole ladder - which is why the filter held a constant
 * amplitude there rather than growing into a note: a marginally stable linear
 * resonator, one rounding error either side of silence and divergence. A
 * ladder that can scream has to be able to go past its threshold, so the
 * threshold is moved down the range and the top of the range is where it
 * screams.
 *
 * 0.95 rather than 0.99, because the interesting part of a self-oscillating
 * filter is the approach: everything above this point is oscillating and the
 * last 5% is where the amplitude is set.
 */
const THRESHOLD_AT_RESONANCE = 0.95;

/**
 * `k` at `resonance: 1.0`, as a multiple of what it used to be.
 *
 * One constant serves both ladders, which is a measurement rather than a
 * convenience. The four-pole ladder's threshold is the analytic `k = 4` and
 * its own constants make `k` exactly `4 * resonance`. The half ladder's is not
 * analytic here - its feedback tap is a mix of three states rather than its
 * output - but measured it sits at exactly its own `k = 2`, which is again
 * `resonance: 1.0`. So both were tuned to end at their threshold, and both
 * move down the range by the same factor. `filters.test.ts` asserts the
 * behaviour this number produces rather than the number.
 */
export const RESONANCE_SCALE = 1 / THRESHOLD_AT_RESONANCE;

/** Exposed so the tests can state where the threshold is, not repeat it. */
export const SELF_OSCILLATION_RESONANCE = THRESHOLD_AT_RESONANCE;
