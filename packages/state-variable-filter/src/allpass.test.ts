import { createFilter, SvfType } from "./dsp";

const SAMPLE_RATE = 48000;
const CUTOFF = 1000;
const Q = 0.5;

/**
 * Run a steady sine of `f` Hz through the filter and measure the amplitude and
 * phase of the output once it has settled, using I/Q demodulation over the
 * last full second (an integer number of cycles for any integer frequency, so
 * there is no spectral leakage).
 */
function measure(type: SvfType, f: number) {
  const seconds = 2;
  const length = SAMPLE_RATE * seconds;
  const input = new Float32Array(length);
  const output = new Float32Array(length);
  const frequency = new Float32Array(length).fill(CUTOFF);

  for (let n = 0; n < length; n++) {
    input[n] = Math.sin((2 * Math.PI * f * n) / SAMPLE_RATE);
  }

  const { filter } = createFilter(SAMPLE_RATE);
  filter(input, output, type, frequency, new Float32Array([Q]));

  let i = 0;
  let q = 0;
  const start = length - SAMPLE_RATE;
  for (let n = start; n < length; n++) {
    const w = (2 * Math.PI * f * n) / SAMPLE_RATE;
    i += output[n] * Math.sin(w);
    q += output[n] * Math.cos(w);
  }
  i /= SAMPLE_RATE;
  q /= SAMPLE_RATE;

  return {
    amplitude: 2 * Math.hypot(i, q),
    phase: Math.atan2(q, i),
  };
}

describe("SVF all-pass", () => {
  it("passes every frequency at unit gain", () => {
    for (const f of [50, CUTOFF, 10000]) {
      const { amplitude } = measure(SvfType.AllPass, f);
      expect(Math.abs(amplitude - 1)).toBeLessThan(1e-3);
    }
  });

  it("shifts phase by 180 degrees at the cutoff frequency", () => {
    const { phase } = measure(SvfType.AllPass, CUTOFF);
    expect(Math.cos(phase)).toBeLessThan(-0.999);
  });

  it("is not a bypass", () => {
    // Bypass has zero phase shift everywhere...
    expect(Math.cos(measure(SvfType.ByPass, CUTOFF).phase)).toBeGreaterThan(
      0.999,
    );
    // ...the all-pass shifts phase below and above the cutoff too.
    expect(Math.abs(measure(SvfType.AllPass, 50).phase)).toBeGreaterThan(0.1);
    expect(Math.abs(measure(SvfType.AllPass, 10000).phase)).toBeGreaterThan(
      0.1,
    );
  });
});
