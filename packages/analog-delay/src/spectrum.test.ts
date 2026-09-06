import { readFileSync } from "fs";
import { join } from "path";
import {
  blackmanHarris,
  centroid,
  cornerHz,
  envelopePeriodicity,
  envelopeRms,
  fft,
  fundamental,
  harmonicDistortion,
  magnitudes,
  maxAbsoluteDifference,
  noiseFloor,
  pitchTrack,
  render,
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

// `Math.imul` rather than the usual `(x * a + c) & 0x7fffffff`: at 31 bits the
// product is past 2^53, and the rounding collapses the sequence to a period of
// 10466 samples - which reads as a 4.2 Hz periodicity, exactly the thing
// `envelopePeriodicity` is here to detect.
function noise(length: number, amplitude = 1, seed = 1) {
  const out = new Float64Array(length);
  let state = seed;
  for (let i = 0; i < length; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) | 0;
    out[i] = (amplitude * state) / 2147483648;
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

const rms = (signal: ArrayLike<number>) => {
  let total = 0;
  for (let i = 0; i < signal.length; i++) total += signal[i] * signal[i];
  return Math.sqrt(total / signal.length);
};

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

/**
 * The -3 dB frequency a one-pole `y += a(x - y)` with `a = 1 - exp(-2 pi fc /
 * fs)` actually has, which is not `fc`: solving `|H|^2 = 1/2` for that filter
 * gives `cos w = (4p - p^2 - 1) / 2p` with `p = 1 - a`, and at 8 kHz on a
 * 44.1 kHz rate that is 9053 Hz rather than 8000. The oracle for `cornerHz` is
 * this number, not the nominal one - otherwise the test would be measuring the
 * filter's warping instead of the metric.
 */
const onePoleCornerHz = (cutoff: number) => {
  const p = Math.exp((-2 * Math.PI * cutoff) / SAMPLE_RATE);
  return (
    (Math.acos((4 * p - p * p - 1) / (2 * p)) * SAMPLE_RATE) / (2 * Math.PI)
  );
};

describe("cornerHz", () => {
  it.each([1000, 3000, 8000])(
    "recovers the corner of two one-poles at %p Hz",
    (cutoff) => {
      // Two cascaded one-poles are -6 dB at their common corner, which is the
      // chain a repeat passes through: the anti-alias filter on the way into
      // the line and the reconstruction filter on the way out.
      // Measured against the analytic corner: 993 / 1002, 3333 / 3047,
      // 9688 / 9055. The residual is estimator scatter - a sixth-octave band
      // of a noise spectrum is an average of Rayleigh-distributed bins, worth
      // a few tenths of a dB, and a few tenths of a dB on a 12 dB/octave skirt
      // is a few percent of frequency. 12% is that, rounded up.
      const twice = lowpass(lowpass(noise(65536), cutoff), cutoff);
      const measured = cornerHz(twice, SAMPLE_RATE, -6);
      const expected = onePoleCornerHz(cutoff);
      expect(Math.abs(measured - expected) / expected).toBeLessThan(0.12);
    },
  );

  it("recovers the corner of a single one-pole at -3 dB", () => {
    // Measured 4131 against 4113.
    const measured = cornerHz(lowpass(noise(65536), 4000), SAMPLE_RATE, -3);
    const expected = onePoleCornerHz(4000);
    expect(Math.abs(measured - expected) / expected).toBeLessThan(0.12);
  });

  it("moves with the corner it is measuring", () => {
    // The assertion above only says the metric is roughly right; this says it
    // is not returning something fixed. Doubling the cutoff doubles the answer.
    const source = noise(65536);
    const measured = [1000, 2000, 4000, 8000].map((cutoff) =>
      cornerHz(lowpass(lowpass(source, cutoff), cutoff), SAMPLE_RATE, -6),
    );
    const problems = measured.filter((v, i) => i > 0 && v <= measured[i - 1]);
    expect(problems).toEqual([]);
    expect(measured[3] / measured[0]).toBeGreaterThan(6);
  });
});

describe("harmonicDistortion", () => {
  it("is near zero for a pure sine", () => {
    expect(harmonicDistortion(sine(16384, 200), SAMPLE_RATE, 200)).toBeLessThan(
      1e-6,
    );
  });

  it("recovers a planted second harmonic at its known level", () => {
    // A fundamental at 1 plus a second harmonic at 0.1: the energy ratio is
    // 0.01 by construction, whatever the rest of the metric does.
    const length = 16384;
    const planted = Float64Array.from(
      { length },
      (_, i) =>
        Math.sin((2 * Math.PI * 200 * i) / SAMPLE_RATE) +
        0.1 * Math.sin((2 * Math.PI * 400 * i) / SAMPLE_RATE),
    );
    const measured = harmonicDistortion(planted, SAMPLE_RATE, 200);
    expect(measured / 0.01).toBeGreaterThan(0.95);
    expect(measured / 0.01).toBeLessThan(1.05);
  });

  it("rises monotonically as the same sine is driven harder into a clipper", () => {
    const clip = (x: number) => Math.tanh(x);
    const measured = [0.2, 0.5, 1, 2, 4].map((drive) => {
      const driven = Float64Array.from(sine(16384, 200), (x) =>
        clip(x * drive),
      );
      return harmonicDistortion(driven, SAMPLE_RATE, 200);
    });
    expect(measured.filter((v, i) => i > 0 && v <= measured[i - 1])).toEqual(
      [],
    );
  });
});

describe("noiseFloor", () => {
  it("recovers the RMS of a bed of known amplitude", () => {
    const bed = noise(65536, 0.01);
    const measured = noiseFloor(bed);
    expect(measured / rms(bed)).toBeGreaterThan(0.9);
    expect(measured / rms(bed)).toBeLessThan(1.1);
  });

  it("rises with the bed and is unmoved by anything loud on top of it", () => {
    const quiet = noiseFloor(noise(65536, 0.001));
    const loud = noiseFloor(noise(65536, 0.01));
    expect(loud / quiet).toBeGreaterThan(9);
    expect(loud / quiet).toBeLessThan(11);

    // A plain RMS would read the burst; the quietest decile does not.
    const withBurst = noise(65536, 0.001);
    for (let i = 0; i < 20000; i++) withBurst[i] += Math.sin(i / 5);
    expect(noiseFloor(withBurst) / quiet).toBeLessThan(1.1);
  });
});

describe("envelopePeriodicity", () => {
  it("is near 1 for evenly spaced bursts and near 0 for a steady bed", () => {
    // A pulse train at 100 ms: the envelope repeats exactly, so its
    // autocorrelation peaks at that lag.
    const length = SAMPLE_RATE * 2;
    const period = Math.round(0.1 * SAMPLE_RATE);
    const pulsed = Float64Array.from(noise(length), (value, i) =>
      i % period < 800 ? value : value * 0.01,
    );
    expect(envelopePeriodicity(pulsed, SAMPLE_RATE, 0.05, 0.5)).toBeGreaterThan(
      0.8,
    );

    // The same noise with no envelope structure at all.
    expect(
      envelopePeriodicity(noise(length), SAMPLE_RATE, 0.05, 0.5),
    ).toBeLessThan(0.3);
  });
});

describe("envelopeRms", () => {
  it("reads the RMS of each frame", () => {
    const signal = Float64Array.from({ length: 1024 }, (_, i) =>
      i < 512 ? 1 : 0.5,
    );
    const points = envelopeRms(signal, 512);
    expect(points).toEqual([1, 0.5]);
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
    // parabolic fit this pair would read as the same pitch.
    const flat = fundamental(sine(8192, 440), SAMPLE_RATE);
    const sharp = fundamental(sine(8192, 444), SAMPLE_RATE);
    expect(sharp - flat).toBeGreaterThan(3);
    expect(sharp - flat).toBeLessThan(5);
  });
});

describe("pitchTrack", () => {
  it("recovers the trajectory of a known linear glissando", () => {
    // 300 Hz to 600 Hz over one second. The instantaneous frequency at time t
    // is 300 + 300t, so each reading is checked against the analytic value at
    // the centre of its own window.
    const seconds = 1;
    const length = SAMPLE_RATE * seconds;
    const chirp = new Float64Array(length);
    let phase = 0;
    for (let i = 0; i < length; i++) {
      const t = i / SAMPLE_RATE;
      phase += (2 * Math.PI * (300 + 300 * t)) / SAMPLE_RATE;
      chirp[i] = Math.sin(phase);
    }

    const hop = 2048;
    const readings = pitchTrack(chirp, SAMPLE_RATE, hop, 200, 800);
    expect(readings.length).toBeGreaterThan(15);

    const problems: unknown[] = [];
    readings.forEach((measured, n) => {
      const centre = (n * hop + hop) / SAMPLE_RATE;
      const expected = 300 + 300 * centre;
      // 3%: a 93 ms window over a chirp rising 300 Hz/s spans 28 Hz, so the
      // estimate is a mean over that span rather than a point reading.
      if (Math.abs(measured - expected) / expected > 0.03) {
        problems.push([n, measured, expected]);
      }
    });
    expect(problems).toEqual([]);
  });

  it("is flat for a steady tone", () => {
    const readings = pitchTrack(
      sine(SAMPLE_RATE, 440),
      SAMPLE_RATE,
      2048,
      300,
      600,
    );
    const problems = readings.filter((f) => Math.abs(f - 440) > 2);
    expect(problems).toEqual([]);
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
    for (const name of [
      "centroid",
      "blackmanHarris",
      "pitchTrack",
      "noiseFloor",
      "fundamental",
    ]) {
      expect(processor).not.toContain(name);
    }
  });
});
