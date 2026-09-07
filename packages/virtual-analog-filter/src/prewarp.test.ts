import { createPrewarp } from "./prewarp";

// Mirrors `state-variable-filter/src/dsp.test.ts`'s "the prewarped cutoff"
// group, because it is the same helper against the same three properties: it
// is exact below the ceiling, it is monotonic above it, and its first
// derivative is continuous through the join.
const CEILING_FRACTION = 0.72;

// 8000 and 22050 are the interesting ones: `frequency.maxValue` is a
// compile-time 20000 and Nyquist is not, so at any rate below 40 kHz the
// parameter's own declared maximum is past the tangent's pole.
const RATES = [8000, 22050, 44100, 48000, 96000];

// `frequency: 20` with `detune: -127` and `frequency: 20000` with `detune: 127`.
// Both ends are inside the declared ranges of both parameters.
const LOWEST = 20 * Math.pow(2, -127 / 12);
const HIGHEST = 20000 * Math.pow(2, 127 / 12);

describe("the prewarped cutoff", () => {
  it.each(RATES)(
    "is bit-identical to Math.tan below the ceiling at %p Hz",
    (sampleRate) => {
      // Asserted at its source rather than through a tolerance on the output:
      // below the ceiling nothing about any existing patch moves. The
      // reference is `f * (1/fs) * PI`, which is the expression the circuits
      // computed before this ticket, not the algebraically identical
      // `f * PI / fs` - they differ in the last bit, and "bit-identical" is a
      // claim about the code that was replaced.
      const prewarp = createPrewarp(sampleRate);
      const ceiling = (CEILING_FRACTION * sampleRate) / 2;
      for (const fraction of [0.001, 0.01, 0.1, 0.5, 0.9, 0.999]) {
        const f = ceiling * fraction;
        expect(prewarp(f)).toBe(Math.tan(f * (1 / sampleRate) * Math.PI));
      }
    },
  );

  it.each(RATES)(
    "stays positive and strictly increasing over everything detune can reach at %p Hz",
    (sampleRate) => {
      const prewarp = createPrewarp(sampleRate);
      let previous = 0;
      // Log-spaced, because the range is eight decades wide.
      for (let n = 0; n <= 2000; n++) {
        const f = LOWEST * Math.pow(HIGHEST / LOWEST, n / 2000);
        const g = prewarp(f);
        expect(Number.isFinite(g)).toBe(true);
        expect(g).toBeGreaterThan(previous);
        previous = g;
      }
    },
  );

  it("has a continuous first derivative through the breakpoint", () => {
    // Stepping the cutoff by 1 Hz at 48 kHz, a smooth curve gives a second
    // difference of about g'' * h^2 = 24 * (PI/48000)^2 ~ 1e-7, while
    // eq. 3.22's hard breakpoint would drop the slope by 5.599 in one step and
    // give ~3.7e-4. Two orders of magnitude of daylight either side of 1e-6,
    // which is what makes this an assertion about the *kink* and not about the
    // curvature.
    const sampleRate = 48000;
    const prewarp = createPrewarp(sampleRate);
    const ceiling = (CEILING_FRACTION * sampleRate) / 2;

    let worst = 0;
    for (let f = ceiling - 200; f <= ceiling + 200; f++) {
      const second = prewarp(f + 1) - 2 * prewarp(f) + prewarp(f - 1);
      worst = Math.max(worst, Math.abs(second));
    }
    expect(worst).toBeLessThan(1e-6);
  });
});
