import { readFileSync } from "fs";
import { join } from "path";
import {
  aliasSnr,
  blackmanHarris,
  centroid,
  fft,
  fundamental,
  magnitudes,
  maxAbsoluteDifference,
  peak,
  peakFrequency,
  render,
  rt60,
} from "./_spectrum";

// Calibration, not coverage. Every metric here is checked against a signal
// whose answer is known analytically, so that a broken metric fails in this
// file rather than silently passing - or silently failing - a feature test in
// `dsp.test.ts`.
//
// The instrument is now shared (`scripts/_spectrum.ts`, copied here and into
// `wavetable-oscillator`), so this file is the calibration for both packages:
// every alias-SNR floor in `wavetable-oscillator/src/dsp.test.ts` is only worth
// as much as the pins below.

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

describe("peak", () => {
  it("is the largest absolute sample, sign-blind", () => {
    expect(peak(sine(1024, 440))).toBeCloseTo(1, 6);
    expect(
      peak(Float64Array.from(sine(1024, 440), (v) => -0.3 * v)),
    ).toBeCloseTo(0.3, 6);
    expect(peak(new Float64Array(16))).toBe(0);
  });
});

describe("peakFrequency", () => {
  it.each([440, 1000, 5000])(
    "recovers a %p Hz sine to within half a hertz",
    (frequency) => {
      expect(peakFrequency(sine(32768, frequency), SAMPLE_RATE)).toBeCloseTo(
        frequency,
        0,
      );
    },
  );

  it("resolves a frequency between two bins", () => {
    // 32768 samples at 44.1 kHz is 1.346 Hz per bin, so 440.7 is two thirds of
    // the way between bins. Without the parabolic fit this would read 440.0,
    // and the pitch test in `wavetable-oscillator` - which asserts 5 cents,
    // i.e. 1.27 Hz at 440 - would be measuring the bin grid.
    expect(peakFrequency(sine(32768, 440.7), SAMPLE_RATE)).toBeCloseTo(
      440.7,
      1,
    );
  });
});

describe("aliasSnr", () => {
  // A 440 Hz sine plus one interferer at 5000 Hz, which is not a harmonic of
  // 440 (11 x 440 = 4840, 12 x 440 = 5280) and so lands squarely in the noise
  // band. The answer is then -20 log10(amplitude), exactly.
  it.each([
    [0.1, 20],
    [0.01, 40],
    [0.001, 60],
  ])("reads an interferer of %p as %p dB", (amplitude, expected) => {
    const signal = Float64Array.from(
      { length: 32768 },
      (_, i) =>
        Math.sin((2 * Math.PI * 440 * i) / SAMPLE_RATE) +
        amplitude * Math.sin((2 * Math.PI * 5000 * i) / SAMPLE_RATE),
    );
    expect(aliasSnr(signal, 440, SAMPLE_RATE)).toBeCloseTo(expected, 1);
  });

  it("has headroom far above any floor a module test would set", () => {
    // A whole number of cycles in the window, so there is no leakage and no
    // noise: what is left is arithmetic. Any floor a module asserts is
    // measuring the module, not the instrument.
    const cycles = 327;
    const frequency = (cycles * SAMPLE_RATE) / 32768;
    expect(
      aliasSnr(sine(32768, frequency), frequency, SAMPLE_RATE),
    ).toBeGreaterThan(140);
  });

  it("ignores a constant offset when asked to", () => {
    // Bin 0 is noise by the rule above, so a waveform with a legitimate DC
    // component - a pulse wave, whose mean is 2 x width - 1 - reads far worse
    // than it is without `removeDC`: 149 dB down to 5.7.
    const cycles = 327;
    const frequency = (cycles * SAMPLE_RATE) / 32768;
    const clean = sine(32768, frequency);
    const offset = Float64Array.from(clean, (value) => value + 0.3);

    expect(aliasSnr(offset, frequency, SAMPLE_RATE)).toBeLessThan(10);
    expect(
      aliasSnr(offset, frequency, SAMPLE_RATE, { removeDC: true }),
    ).toBeCloseTo(aliasSnr(clean, frequency, SAMPLE_RATE), 6);
  });

  it("costs 27 dB on a signal that has no DC to remove", () => {
    // The mean it subtracts is the *unwindowed* mean, so a signal with no DC
    // but a fractional number of cycles in the window - which is every musical
    // pitch - has a small non-zero mean, and subtracting it plants a windowed
    // constant at bin 0 that the metric then counts as noise. Measured: a
    // 440 Hz sine reads 109.8 dB raw and 82.4 dB with `removeDC`.
    //
    // So `removeDC` is for waveforms whose DC is real. It is asserted here
    // because the wavetable oscillator's tables are DC-free by construction and
    // its floors would be 6.5 dB pessimistic at 110 Hz with it turned on.
    const raw = aliasSnr(sine(32768, 440), 440, SAMPLE_RATE);
    const removed = aliasSnr(sine(32768, 440), 440, SAMPLE_RATE, {
      removeDC: true,
    });
    expect(raw).toBeGreaterThan(105);
    expect(removed).toBeLessThan(raw - 20);
  });

  it("refuses a fundamental it cannot place harmonics from", () => {
    expect(() => aliasSnr(sine(1024, 440), 0, SAMPLE_RATE)).toThrow();
    expect(() => aliasSnr(sine(1024, 440), NaN, SAMPLE_RATE)).toThrow();
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
