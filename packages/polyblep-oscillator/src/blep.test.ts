import {
  blampResidual2,
  blampResidual4,
  blepResidual2,
  blepResidual4,
} from "./_blep";

// The kernels are derived - the centered B-spline integrated once for the BLEP
// and twice for the BLAMP - and this file is what makes that derivation
// checkable. Every assertion below is a property the true integrals have and a
// mistyped coefficient does not: the residual vanishes outside the support, it
// is continuous at every join, it carries a jump of exactly -1 across the step
// it corrects, it has zero net area, and differentiating the BLAMP gives the
// BLEP back. This is the one place the kernels are asserted; the drift test in
// @synthlet/synthlet keeps the per-package copies identical.
//
// Named as in the derivation: `r` for a BLEP residual, `R` for a BLAMP one.
const r2 = blepResidual2;
const r4 = blepResidual4;
const R2 = blampResidual2;
const R4 = blampResidual4;

// Big enough that the difference across a join is visible above rounding,
// small enough that every tolerance below is loose by two orders.
const eps = 1e-7;

describe("the band-limiting kernels", () => {
  it("is zero outside its support", () => {
    // Exactly zero, not -0: a caller evaluates these unconditionally, and the
    // support guard is what lets it.
    for (const t of [-1, 1, -2, 2]) expect(r2(t)).toBe(0);
    for (const t of [-2, 2, -3, 3]) expect(r4(t)).toBe(0);
    for (const d of [1, 1.5]) expect(R2(d)).toBe(0);
    for (const d of [2, 2.5]) expect(R4(d)).toBe(0);
  });

  it("is continuous at every join", () => {
    // The cubic B-spline's integral is C2, so the four pieces of r4 have to
    // meet. A transcription error in any one coefficient breaks this first.
    expect(Math.abs(r4(-1 - eps) - r4(-1 + eps))).toBeLessThan(1e-6);
    expect(Math.abs(r4(1 - eps) - r4(1 + eps))).toBeLessThan(1e-6);
    expect(Math.abs(R4(1 - eps) - R4(1 + eps))).toBeLessThan(1e-6);

    // And the joins are where the derivation says they are.
    expect(r4(-1)).toBeCloseTo(1 / 24, 12);
    expect(r4(1)).toBeCloseTo(-1 / 24, 12);
    expect(R4(1)).toBeCloseTo(1 / 120, 12);

    // Order 2 has a single join each, at the edge of the support, where both
    // kernels reach zero smoothly.
    expect(Math.abs(r2(-1 + eps))).toBeLessThan(1e-6);
    expect(Math.abs(r2(1 - eps))).toBeLessThan(1e-6);
    expect(Math.abs(R2(1 - eps))).toBeLessThan(1e-6);
  });

  it("carries the step's own jump", () => {
    // The residual's own discontinuity is -1, equal and opposite to the unit
    // step it corrects - which is the whole mechanism. At t = 0 it takes the
    // right-hand value, because the naive step H is right-continuous.
    expect(r4(0)).toBe(-0.5);
    expect(r2(0)).toBe(-0.5);
    expect(r4(-eps)).toBeCloseTo(0.5, 6);
    expect(r2(-eps)).toBeCloseTo(0.5, 6);
    expect(r4(0) - r4(-eps)).toBeCloseTo(-1, 6);
    expect(r2(0) - r2(-eps)).toBeCloseTo(-1, 6);
  });

  it("pins the peak of each BLAMP kernel", () => {
    expect(R2(0)).toBe(1 / 6);
    expect(R4(0)).toBe(7 / 30);

    // And the peak is a peak: nothing in the support exceeds it.
    for (let d = 0; d <= 2.5; d += 0.001) {
      expect(R2(d)).toBeLessThanOrEqual(R2(0));
      expect(R4(d)).toBeLessThanOrEqual(R4(0));
    }
  });

  it("has zero net area", () => {
    // r is odd, so it integrates to zero over its support. That is the
    // band-limiting property: the correction moves energy around the
    // discontinuity without adding any DC.
    expect(Math.abs(areaOf(r2, [-1, 1]))).toBeLessThan(1e-9);
    expect(Math.abs(areaOf(r4, [-2, -1, 1, 2]))).toBeLessThan(1e-9);
  });

  it("integrates the BLEP to the BLAMP", () => {
    // R' = r on d > 0, by construction. Central differences of the BLAMP
    // kernel have to land on the BLEP kernel at the same point - including
    // outside the 2-point support, where both are flat zero.
    const h = 1e-5;
    for (const d of [0.1, 0.5, 0.9, 1.3, 1.9]) {
      expect((R2(d + h) - R2(d - h)) / (2 * h)).toBeCloseTo(r2(d), 6);
      expect((R4(d + h) - R4(d - h)) / (2 * h)).toBeCloseTo(r4(d), 6);
    }
  });
});

/**
 * Composite Simpson over each polynomial piece between `joins`, plus the jump
 * at `t = 0`, at 20000 intervals per piece.
 *
 * The pieces either side of zero are inset by a picosample: Simpson weights
 * the endpoint, and `r(0)` is the right-hand value (-1/2) where the left piece
 * needs the left one (+1/2), which would cost 1.7e-5 of spurious area. The two
 * slivers dropped cancel by oddness, so the inset costs nothing measurable.
 */
function areaOf(f: (t: number) => number, joins: number[]): number {
  const inset = 1e-12;
  const edges = [...joins, -inset, inset].sort((a, b) => a - b);
  let total = 0;
  for (let i = 0; i < edges.length - 1; i++) {
    // Skip the gap straddling zero, where the kernel jumps.
    if (edges[i] === -inset && edges[i + 1] === inset) continue;
    total += simpson(f, edges[i], edges[i + 1], 20000);
  }
  return total;
}

function simpson(
  f: (t: number) => number,
  a: number,
  b: number,
  n: number,
): number {
  const h = (b - a) / n;
  let sum = f(a) + f(b);
  for (let i = 1; i < n; i++) sum += (i % 2 ? 4 : 2) * f(a + i * h);
  return (sum * h) / 3;
}
