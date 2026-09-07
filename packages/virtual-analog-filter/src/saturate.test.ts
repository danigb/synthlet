import { resolve, saturate, SATURATION_KNEE } from "./saturate";

describe("the ladder's differential pair", () => {
  it("is its own argument well below the knee", () => {
    // Which is what keeps every measurement in `filters.test.ts` a measurement
    // of the linear filter: those probe at 1e-3, four decades under the knee.
    // `tanh` deviates from its argument by (x/knee)^2/3, so the error at the
    // 1e-3 those probes use is 2e-6 - four decades below anything the
    // assertions there resolve.
    for (const [x, tolerance] of [
      [1e-6, 1e-11],
      [1e-4, 1e-7],
      [1e-3, 3e-6],
    ]) {
      expect(Math.abs(saturate(x) / x - 1)).toBeLessThan(tolerance);
    }
  });

  it("is odd, monotonic, and bounded by the knee", () => {
    // Non-decreasing rather than strictly increasing: past about |x| = 8 knees
    // `Math.tanh` returns exactly 1 and the curve is flat, which is the
    // saturation and not a defect. It is strictly increasing everywhere it is
    // not fully saturated, which is what the second loop checks.
    let previous = -Infinity;
    for (let x = -50; x <= 50; x += 0.01) {
      const y = saturate(x);
      expect(y).toBeGreaterThanOrEqual(previous);
      expect(Math.abs(y)).toBeLessThanOrEqual(SATURATION_KNEE);
      expect(saturate(-x)).toBeCloseTo(-y, 12);
      previous = y;
    }

    previous = -Infinity;
    for (let x = -2; x <= 2; x += 0.01) {
      const y = saturate(x);
      expect(y).toBeGreaterThan(previous);
      previous = y;
    }
  });
});

describe("the delay-free loop solver", () => {
  // `resolve(A, B, k, x)` solves `y = A*(x - k*saturate(y)) + B`. The residual
  // is what says two Newton iterations are enough, and it is asserted rather
  // than assumed because the number of iterations is the one thing in
  // `saturate.ts` chosen for cost.
  const residual = (A: number, B: number, k: number, x: number) => {
    const y = resolve(A, B, k, x);
    return Math.abs(y - (A * (x - k * saturate(y)) + B));
  };

  it("converges to under 1e-9 in two iterations across the whole range", () => {
    // A is a product of one-pole gains, so 0..1; k reaches just past 4 at
    // maximum resonance; x and B span everything `drive` and a full-scale
    // input can produce.
    let worst = 0;
    for (const A of [1e-4, 0.01, 0.25, 0.6, 0.9, 0.999]) {
      for (const k of [0, 0.5, 2, 4, 4.3]) {
        for (const x of [-100, -1, -0.01, 0, 0.01, 1, 100]) {
          for (const B of [-10, -0.5, 0, 0.5, 10]) {
            worst = Math.max(worst, residual(A, B, k, x));
          }
        }
      }
    }
    expect(worst).toBeLessThan(1e-9);
  });

  it("is exactly the linear solution when the signal is under the knee", () => {
    // The initial estimate is the linear closed form, which is what the filter
    // computed before the nonlinearity existed. Below the knee Newton has
    // nothing to correct, so the two agree to floating point - which is why
    // ticket 01's corner, skirt and sample-rate groups did not move.
    for (const A of [0.01, 0.25, 0.9]) {
      for (const k of [0, 1, 4]) {
        const x = 1e-4;
        const B = 1e-5;
        expect(resolve(A, B, k, x)).toBeCloseTo((A * x + B) / (1 + A * k), 12);
      }
    }
  });

  it("bends the answer down once the signal passes the knee", () => {
    // The property that makes a ladder settle rather than diverge: past the
    // knee the feedback stops growing with the signal, so the loop gain falls.
    const A = 0.5;
    const k = 4.3;
    const small = resolve(A, 0, k, 1e-3) / 1e-3;
    const large = resolve(A, 0, k, 100) / 100;
    expect(large).toBeGreaterThan(small);
  });
});
