import { readFileSync } from "fs";
import { join } from "path";
import {
  blackmanHarris,
  centroid,
  fft,
  fundamental,
  magnitudes,
  maxAbsoluteDifference,
  render,
  rt60,
} from "./spectrum";

// Calibration, not coverage. Every metric here is checked against a signal
// whose answer is known analytically, so that a broken metric fails in this
// file rather than silently passing - or silently failing - a feature test in
// `dsp.test.ts`.

const SAMPLE_RATE = 44100;

const sine = (length: number, frequency: number, sampleRate = SAMPLE_RATE) =>
  Float64Array.from({ length }, (_, i) =>
    Math.sin((2 * Math.PI * frequency * i) / sampleRate),
  );

function noise(length: number, seed = 1) {
  const out = new Float64Array(length);
  let state = seed;
  for (let i = 0; i < length; i++) {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    out[i] = state / 0x3fffffff - 1;
  }
  return out;
}

/** One-pole lowpass, used only to make a signal that must read darker. */
function lowpass(signal: ArrayLike<number>, cutoff: number) {
  const a = 1 - Math.exp((-2 * Math.PI * cutoff) / SAMPLE_RATE);
  const out = new Float64Array(signal.length);
  let state = 0;
  for (let i = 0; i < signal.length; i++) {
    state += a * (signal[i] - state);
    out[i] = state;
  }
  return out;
}

describe("fft", () => {
  it("puts a single-bin cosine entirely in that bin", () => {
    const n = 1024;
    const bin = 37;
    const re = Float64Array.from({ length: n }, (_, i) =>
      Math.cos((2 * Math.PI * bin * i) / n),
    );
    const im = new Float64Array(n);

    fft(re, im);

    const magnitude = (i: number) => Math.hypot(re[i], im[i]);
    expect(magnitude(bin)).toBeCloseTo(n / 2, 6);
    for (let i = 0; i < n / 2; i++) {
      if (i !== bin) expect(magnitude(i)).toBeLessThan(1e-8);
    }
  });

  it("refuses lengths it cannot transform", () => {
    expect(() => fft(new Float64Array(6), new Float64Array(6))).toThrow();
    expect(() => fft(new Float64Array(8), new Float64Array(4))).toThrow();
  });
});

describe("blackmanHarris", () => {
  it("is symmetric and peaks at 1 in the middle", () => {
    const window = blackmanHarris(1025);
    expect(window[512]).toBeCloseTo(1, 6);
    for (let i = 0; i < 512; i++) {
      expect(window[i]).toBeCloseTo(window[1024 - i], 12);
    }
    expect(window[0]).toBeLessThan(1e-4);
  });

  it("suppresses leakage: an off-bin sine has -80 dB sidelobes", () => {
    // The reason for this window rather than a Hann: `centroid` weights every
    // bin, so leakage from a strong partial would drag the answer upward.
    const spectrum = magnitudes(sine(4096, 1000.5 * (SAMPLE_RATE / 4096)));
    const peak = Math.max(...spectrum);
    const far = spectrum.filter((_, i) => Math.abs(i - 1000) > 8);
    expect(Math.max(...far) / peak).toBeLessThan(1e-4);
  });
});

describe("centroid", () => {
  it.each([440, 1000, 5000])(
    "of a %p Hz sine is that frequency",
    (frequency) => {
      const measured = centroid(sine(16384, frequency), SAMPLE_RATE);
      expect(Math.abs(measured - frequency) / frequency).toBeLessThan(0.02);
    },
  );

  it("of white noise is about a quarter of the sample rate", () => {
    // Flat magnitude across [0, sampleRate / 2] has its mean at the midpoint.
    const measured = centroid(noise(32768), SAMPLE_RATE);
    expect(measured).toBeGreaterThan(SAMPLE_RATE / 4 - 800);
    expect(measured).toBeLessThan(SAMPLE_RATE / 4 + 800);
  });

  it("falls monotonically as the same noise is lowpassed harder", () => {
    const source = noise(32768);
    const measured = [16000, 8000, 4000, 2000, 1000].map((cutoff) =>
      centroid(lowpass(source, cutoff), SAMPLE_RATE),
    );

    const problems = measured.filter(
      (value, i) => i > 0 && value >= measured[i - 1],
    );
    expect(problems).toEqual([]);
  });
});

describe("rt60", () => {
  it.each([0.2, 0.5, 1.2])("recovers a known %p s decay", (expected) => {
    // A decaying noise burst: -60 dB is reached at exactly `expected` seconds.
    const length = Math.round(expected * 2 * SAMPLE_RATE);
    const source = noise(length);
    const decayed = Float64Array.from(
      source,
      (value, i) =>
        value * Math.pow(10, (-60 * (i / SAMPLE_RATE)) / expected / 20),
    );

    expect(rt60(decayed, SAMPLE_RATE) / expected).toBeGreaterThan(0.95);
    expect(rt60(decayed, SAMPLE_RATE) / expected).toBeLessThan(1.05);
  });

  it("is NaN when there is no decay to measure", () => {
    expect(rt60(noise(4096), SAMPLE_RATE)).toBeNaN();
  });
});

describe("maxAbsoluteDifference", () => {
  it("is the largest step, and a planted discontinuity dominates it", () => {
    const smooth = sine(4096, 100);
    const clean = maxAbsoluteDifference(smooth);
    smooth[2000] += 0.5;
    expect(maxAbsoluteDifference(smooth)).toBeGreaterThan(clean * 10);
    expect(maxAbsoluteDifference(smooth)).toBeCloseTo(
      Math.max(
        Math.abs(smooth[2000] - smooth[1999]),
        Math.abs(smooth[2001] - smooth[2000]),
      ),
      6,
    );
  });
});

describe("fundamental", () => {
  it.each([110, 440, 1760])("recovers a %p Hz sine", (frequency) => {
    const measured = fundamental(sine(8192, frequency), SAMPLE_RATE);
    expect(Math.abs(measured - frequency) / frequency).toBeLessThan(0.01);
  });

  it("resolves a shift smaller than one whole lag", () => {
    // 440 Hz is 100.2 lags at 44.1 kHz, so one lag is 17 cents. Without the
    // parabolic fit this pair would read as the same pitch, and criterion 7's
    // pitch-excursion assertion would be untestable.
    const flat = fundamental(sine(8192, 440), SAMPLE_RATE);
    const sharp = fundamental(sine(8192, 444), SAMPLE_RATE);
    expect(sharp - flat).toBeGreaterThan(3);
    expect(sharp - flat).toBeLessThan(5);
  });
});

describe("render", () => {
  it("drives the module block by block and keeps the tail", () => {
    // A stand-in module, so the harness is checked without the thing it is
    // there to measure: it copies its input and reports what it was told.
    const seen: number[][] = [];
    const stub = {
      update: (...params: number[]) => seen.push(params),
      compute: (
        inL: Float32Array,
        inR: Float32Array,
        outL: Float32Array,
        outR: Float32Array,
      ) => {
        outL.set(inL);
        outR.set(inR);
      },
    };

    const input = Float32Array.from({ length: 100 }, (_, i) => i + 1);
    const [left, right] = render(stub, {
      length: 256,
      sampleRate: SAMPLE_RATE,
      input,
      params: (seconds) => [seconds],
      block: 64,
      warmup: 64,
    });

    expect(left.length).toBe(256);
    // Warm-up is discarded, so the window starts at input sample 64.
    expect(left[0]).toBe(65);
    // Past the input, the module is fed silence rather than stopping.
    expect(left[100]).toBe(0);
    // Mono in is duplicated to both lines.
    expect(Array.from(right)).toEqual(Array.from(left));
    // One update per block, at that block's start time.
    expect(seen.length).toBe(5);
    expect(seen[1][0]).toBeCloseTo(64 / SAMPLE_RATE, 12);
  });
});

describe("the bundle", () => {
  it("does not contain any of this", () => {
    // `index.ts` never imports this file, so esbuild never walks into it. The
    // check is here rather than in a comment because the day someone imports
    // `centroid` from `dsp.ts` for a real reason, an FFT ships to every user.
    const processor = readFileSync(join(__dirname, "processor.ts"), "utf8");
    for (const name of ["centroid", "blackmanHarris", "rt60", "fundamental"]) {
      expect(processor).not.toContain(name);
    }
  });
});
