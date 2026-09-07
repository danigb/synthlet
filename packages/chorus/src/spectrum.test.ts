import { readFileSync } from "fs";
import { join } from "path";
import {
  centsFromExcursion,
  correlation,
  envelope,
  lfoHz,
  monoSumDb,
  noise,
  rms,
  sine,
} from "./measure";

// The instruments, calibrated against signals whose answer is known before the
// measurement runs. `dsp.test.ts` assumes these work and asks what the module
// does; this file is the argument that it is entitled to.
//
// `analog-delay` and `virtual-analog-filter` both split their suites this way,
// and the reason is the same: when an assertion about the module fails, the
// first question is whether the module moved or the ruler did, and a suite
// that cannot answer it costs an afternoon every time.

const SAMPLE_RATE = 48000;

describe("correlation", () => {
  it("is 1 for a signal against itself", () => {
    const signal = noise(4096);
    expect(correlation(signal, signal)).toBeCloseTo(1, 10);
  });

  it("is -1 against its own inverse", () => {
    const signal = noise(4096);
    const inverted = signal.map((x) => -x);
    expect(correlation(signal, inverted)).toBeCloseTo(-1, 10);
  });

  it("is near zero for two independent noises", () => {
    // Two LCG streams from different seeds. 4096 samples of white noise
    // correlate at around 1/sqrt(N) by chance, which is 0.016; the bound is
    // three times that.
    expect(Math.abs(correlation(noise(4096, 1), noise(4096, 99)))).toBeLessThan(
      0.05,
    );
  });

  it("is zero rather than NaN for silence", () => {
    expect(correlation(new Float32Array(64), new Float32Array(64))).toBe(0);
  });
});

describe("monoSumDb", () => {
  it("is 0 dB when both channels are the input", () => {
    const signal = noise(4096);
    expect(monoSumDb(signal, signal, signal)).toBeCloseTo(0, 10);
  });

  it("is -6 dB when one channel is silent", () => {
    const signal = noise(4096);
    expect(monoSumDb(signal, new Float32Array(4096), signal)).toBeCloseTo(
      -6.02,
      2,
    );
  });

  it("is -Infinity when the channels cancel", () => {
    const signal = noise(4096);
    expect(
      monoSumDb(
        signal,
        signal.map((x) => -x),
        signal,
      ),
    ).toBe(-Infinity);
  });
});

describe("envelope", () => {
  it("removes the audio and keeps the modulation", () => {
    // A 440 Hz tone at constant amplitude: the envelope is flat, so with its
    // mean removed there is nothing left.
    const flat = envelope(sine(SAMPLE_RATE * 4, 440, SAMPLE_RATE));
    // The first samples are the one-pole charging up from zero, which is a
    // real feature of the signal and not an artefact, so the tail is what is
    // asserted.
    const settled = flat.slice(Math.floor(flat.length / 2));
    expect(Math.max(...settled.map(Math.abs))).toBeLessThan(0.01);
  });
});

describe("lfoHz", () => {
  it.each([0.25, 0.5, 1, 3, 7])(
    "reads an envelope modulated at %p Hz",
    (rate) => {
      // A tone whose amplitude is modulated at a known rate. Sixteen cycles
      // at every rate, so the slow ones get the same number of periods to
      // correlate over as the fast ones.
      const length = Math.round((SAMPLE_RATE * 16) / rate);
      const carrier = sine(length, 440, SAMPLE_RATE);
      const modulated = Float32Array.from(carrier, (x, i) => {
        const lfo =
          0.5 + 0.5 * Math.sin((2 * Math.PI * rate * i) / SAMPLE_RATE);
        return x * lfo;
      });
      expect(lfoHz(modulated, SAMPLE_RATE, 0.05, 10)).toBeCloseTo(rate, 1);
    },
    120000,
  );

  it("is NaN when the window is too short to hold one period", () => {
    expect(
      lfoHz(sine(1024, 440, SAMPLE_RATE), SAMPLE_RATE, 0.05, 10),
    ).toBeNaN();
  });
});

describe("centsFromExcursion", () => {
  it.each([
    // excursion ms, rate Hz, cents - each computed by hand from
    // 1200*log2(1 + 2*pi*rate*excursion), Dattorro's extrema.
    [2, 0.5, 10.8436],
    [1, 1, 10.8436],
    [0.5, 6, 32.3292],
    [0, 5, 0],
  ])("is %p ms at %p Hz -> %p cents", (ms, rate, cents) => {
    expect(centsFromExcursion(ms, rate)).toBeCloseTo(cents, 3);
  });
});

describe("rms", () => {
  it("is 1/sqrt(2) for a unit sine", () => {
    expect(rms(sine(SAMPLE_RATE, 100, SAMPLE_RATE))).toBeCloseTo(
      Math.SQRT1_2,
      3,
    );
  });
});

describe("the bundle", () => {
  it("contains none of this", () => {
    // `index.ts` never imports `measure.ts` or `_spectrum.ts`, so esbuild
    // never walks into them. The check is here rather than in a comment
    // because the day someone imports `correlation` from `dsp.ts` for a real
    // reason, an FFT and an autocorrelator ship to every user.
    const processor = readFileSync(join(__dirname, "processor.ts"), "utf8");
    for (const name of [
      "blackmanHarris",
      "centroid",
      "centsFromExcursion",
      "correlation",
      "fundamental",
      "monoSumDb",
    ]) {
      expect(processor).not.toContain(name);
    }
  });
});
