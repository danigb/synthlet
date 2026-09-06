// DON'T EDIT THIS FILE unless inside scripts/_blep.ts
// use ./scripts/copy_files.sh to copy this file to the right place
// the goal is to avoid external dependencies on packages

// Synthlet's band-limiting kernels, in two correction orders.
//
// The contract, for every function here:
//
//   `t` is the signed distance in samples from the discontinuity: negative
//   before it, positive after. `d` is `|t|`.
//
//   A BLEP residual is the correction for a *unit rising step*. Add
//   `stepHeight * blepResidual(t)` to the naive sample, where `stepHeight` is
//   the signed jump - a sawtooth's wrap is -2.
//
//   A BLAMP residual is the correction for a corner. Add
//   `slopeChangePerSample * blampResidual(d)`, where the slope change is
//   measured per sample, not per cycle: a unit-amplitude triangle at increment
//   `inc` turns from `-4 * inc` to `+4 * inc` at its trough, so `8 * inc`.
//
//   Every function returns 0 outside its support, so a caller may evaluate it
//   unconditionally.
//
// Both orders are *derived*, not transcribed. Let `B` be the centered cardinal
// B-spline with unit area - the hat function for order 2, the cubic for order
// 4. Its running integral `S` is the band-limited step; subtract the naive step
// `H(t) = t >= 0 ? 1 : 0` and the difference is the residual `r`. Integrate `r`
// once more and the result is the BLAMP residual `R`. `r` is odd, so its net
// area over the support is zero; `R` is even, so it is written in `d = |t|`;
// and `R' = r` for `d > 0` by construction. blep.test.ts asserts all three,
// which is what makes the derivation checkable rather than a claim.
//
// Order 4 is the cubic B-spline PolyBLEP that Valimaki, Pekonen and Nam 2012
// recommend: about 10 more operations per discontinuity - not per sample - for
// roughly 10 dB of alias rejection, and a perceptually alias-free fundamental
// of 7845 Hz against 2135 Hz for order 2. They also recommend skipping the odd
// orders, whose extra branching costs as much as the next even order, which is
// why this file carries 2 and 4 and no 3.

/**
 * 2-point BLEP residual: the linear B-spline, support `|t| < 1`.
 *
 * This is the kernel the oscillator has always shipped, with the step height
 * factored out: the polynomial in the inline `polyblep()` it replaces is
 * `2 * blepResidual2`, the 2 being the sawtooth's own jump.
 */
export function blepResidual2(t: number): number {
  if (t <= -1 || t >= 1) return 0;
  if (t < 0) {
    const u = 1 + t;
    return (u * u) / 2;
  }
  const u = 1 - t;
  return -(u * u) / 2;
}

/**
 * 4-point BLEP residual: the cubic B-spline, support `|t| < 2`.
 *
 * Four pieces, joined at -1, 0 and 1. The jump of -1 across `t = 0` is the
 * residual cancelling the naive step it corrects.
 */
export function blepResidual4(t: number): number {
  if (t <= -2 || t >= 2) return 0;
  if (t < -1) {
    const u = 2 + t;
    return (u * u * u * u) / 24;
  }
  if (t < 0) return 0.5 + (2 * t) / 3 - (t * t * t) / 3 - (t * t * t * t) / 8;
  if (t < 1) return -0.5 + (2 * t) / 3 - (t * t * t) / 3 + (t * t * t * t) / 8;
  const u = 2 - t;
  return -(u * u * u * u) / 24;
}

/**
 * 2-point BLAMP residual: `blepResidual2` integrated once. Support `d < 1`,
 * peak `1/6` at the corner. `d` is `|t|` and must not be negative.
 */
export function blampResidual2(d: number): number {
  if (d >= 1) return 0;
  const u = 1 - d;
  return (u * u * u) / 6;
}

/**
 * 4-point BLAMP residual: `blepResidual4` integrated once. Support `d < 2`,
 * peak `7/30` at the corner. `d` is `|t|` and must not be negative.
 */
export function blampResidual4(d: number): number {
  if (d >= 2) return 0;
  if (d < 1) {
    return (
      7 / 30 -
      d / 2 +
      (d * d) / 3 -
      (d * d * d * d) / 12 +
      (d * d * d * d * d) / 40
    );
  }
  const u = 2 - d;
  return (u * u * u * u * u) / 120;
}
