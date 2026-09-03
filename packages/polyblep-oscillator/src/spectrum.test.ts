import { createPolyblepOscillator, PolyblepOscillatorType } from "./dsp";
import {
  aliasSnr,
  blackmanHarris,
  fft,
  peak,
  render,
  RenderContext,
} from "./spectrum";

// This file calibrates the instrument, not the oscillator.
//
// `aliasSnr` is the audit's own metric, so its absolute values mean nothing
// outside this repository - but they mean something precise inside it, and the
// eighteen numbers below are what pin them down. They are the audit's published
// sawtooth rows, reproduced to the decimal by both harnesses in
// `thoughts/research/2026-09-03_polyblep-harness/` and by this port driving a
// `Float32Array` in 128-sample blocks.
//
// If any row drifts, the metric changed and every floor in `dsp.test.ts` is
// meaningless. Fix the metric; do not update these numbers.
//
// The first two generators are written out in full here rather than imported,
// so that the calibration cannot move when the package's own DSP does. Ticket
// 04 is why: it replaced the 2-point PolyBLEP with a discontinuity scheduler
// and the 4-point kernels, and the row that used to be measured by driving
// `dsp.ts` would have drifted by 10 dB through no fault of the metric. The
// third row is the real oscillator, pinned two-sided against
// `order-harness.js`'s 4-point figures - which turns this package's central
// quality claim from a floor into an equality.

const SAMPLE_RATE = 44100;
const CALIBRATION_HZ = [110, 440, 1000, 2000, 4000, 8000];

/** `2 * phase - 1`, no correction at all. `order-harness.js`, naive row. */
const NAIVE_SAWTOOTH_DB = [30.2, 19.1, 15.6, 12.5, 9.1, 5.0];

/** 2-point PolyBLEP, the kernel the package shipped until ticket 04.
 * `order-harness.js`, `saw2` row. */
const TWO_POINT_SAWTOOTH_DB = [67.0, 35.4, 32.0, 29.5, 24.7, 18.3];

/** The 4-point B-spline the package ships now. `order-harness.js`, `saw4` row. */
const FOUR_POINT_SAWTOOTH_DB = [93.4, 45.5, 42.3, 40.1, 34.5, 26.8];

const TOLERANCE_DB = 0.5;

const naiveSawtooth = ({ f0, sampleRate }: RenderContext) => {
  const increment = f0 / sampleRate;
  let phase = 0;
  return (block: Float32Array) => {
    for (let i = 0; i < block.length; i++) {
      block[i] = 2 * phase - 1;
      phase += increment;
      phase -= Math.floor(phase);
    }
  };
};

/**
 * `2 * phase - 1` with the 2-point residual subtracted, placed predictively
 * from the increment - the whole of the oscillator as it stood before ticket
 * 04, transcribed. The polynomial is `2 * blepResidual2`, the 2 being the
 * sawtooth's own jump height.
 */
const twoPointSawtooth = ({ f0, sampleRate }: RenderContext) => {
  const increment = f0 / sampleRate;
  const polyblep = (phase: number) => {
    if (phase < increment) {
      const p = phase / increment;
      return p + p - p * p - 1;
    }
    if (phase > 1 - increment) {
      const p = (phase - 1) / increment;
      return p + p + p * p + 1;
    }
    return 0;
  };
  let phase = 0;
  return (block: Float32Array) => {
    for (let i = 0; i < block.length; i++) {
      block[i] = 2 * phase - 1 - polyblep(phase);
      phase += increment;
      phase -= Math.floor(phase);
    }
  };
};

const fourPointSawtooth = ({ f0, sampleRate }: RenderContext) => {
  const generate = createPolyblepOscillator(sampleRate);
  const frequency = new Float32Array([f0]);
  const detune = new Float32Array([0]);
  return (block: Float32Array) =>
    generate(block, PolyblepOscillatorType.Sawtooth, frequency, detune);
};

const round1 = (value: number) => Math.round(value * 10) / 10;

/**
 * The rows that miss the audit's figure by `TOLERANCE_DB` or more, so that a
 * failure prints every drifted frequency with both values rather than stopping
 * at the first one.
 */
function drift(
  createGenerator: (context: RenderContext) => (block: Float32Array) => void,
  audit: number[],
) {
  return CALIBRATION_HZ.map((f0, i) => ({
    f0,
    measured: round1(
      aliasSnr(
        render(createGenerator, { f0, sampleRate: SAMPLE_RATE }),
        f0,
        SAMPLE_RATE,
      ),
    ),
    audit: audit[i],
  })).filter(
    ({ measured, audit: expected }) =>
      // Not `>` - a drift of exactly the tolerance is a drift.
      Math.abs(measured - expected) >= TOLERANCE_DB,
  );
}

describe("the alias-SNR metric", () => {
  it("reproduces the naive sawtooth", () => {
    expect(drift(naiveSawtooth, NAIVE_SAWTOOTH_DB)).toEqual([]);
  });

  it("reproduces the 2-point sawtooth", () => {
    expect(drift(twoPointSawtooth, TWO_POINT_SAWTOOTH_DB)).toEqual([]);
  });

  it("reproduces the shipped 4-point sawtooth", () => {
    expect(drift(fourPointSawtooth, FOUR_POINT_SAWTOOTH_DB)).toEqual([]);
  });

  it("ignores a constant offset when asked to", () => {
    // Bin 0 is a noise bin, so a waveform with genuine DC reads far worse than
    // it is. `removeDC` is what ticket 05's pulse wave will need, whose mean is
    // `2 * width - 1` by construction; asserted here rather than shipped
    // untested.
    const f0 = 440;
    const clean = render(twoPointSawtooth, { f0, sampleRate: SAMPLE_RATE });
    const offset = clean.map((sample) => sample + 0.3);

    const reference = aliasSnr(clean, f0, SAMPLE_RATE);
    expect(reference).toBeGreaterThan(35);
    expect(aliasSnr(offset, f0, SAMPLE_RATE)).toBeLessThan(10);
    expect(aliasSnr(offset, f0, SAMPLE_RATE, { removeDC: true })).toBeCloseTo(
      reference,
      2,
    );
  });
});

describe("the instrument itself", () => {
  it("puts a cosine in its own bin", () => {
    const n = 64;
    const bin = 5;
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    for (let i = 0; i < n; i++) re[i] = Math.cos((2 * Math.PI * bin * i) / n);

    fft(re, im);

    for (let k = 0; k <= n / 2; k++) {
      const magnitude = Math.hypot(re[k], im[k]);
      if (k === bin) expect(magnitude).toBeCloseTo(n / 2, 9);
      else expect(magnitude).toBeLessThan(1e-9);
    }
  });

  it("rejects a length that is not a power of two", () => {
    expect(() => fft(new Float64Array(48), new Float64Array(48))).toThrow(
      /power of two/,
    );
    expect(() => fft(new Float64Array(64), new Float64Array(32))).toThrow(
      /same length/,
    );
  });

  it("builds a symmetric window that reaches 1 at the centre", () => {
    const window = blackmanHarris(1024);
    // The four coefficients alternate to 0.00006 at both ends and sum to 1 at
    // the centre - the definition, evaluated.
    expect(window[0]).toBeCloseTo(0.00006, 12);
    expect(window[1023]).toBeCloseTo(0.00006, 10);
    expect(window[512]).toBeGreaterThan(0.9999);
    for (let i = 0; i < 512; i++)
      expect(window[i]).toBeCloseTo(window[1023 - i], 10);
    expect(peak(window)).toBeLessThanOrEqual(1);
  });

  it("discards the warm-up and captures the requested length", () => {
    // A generator that emits its own sample index: the returned buffer must
    // start at `warmup` and be `length` long, whatever the block size.
    const counting = () => {
      let n = 0;
      return (block: Float32Array) => {
        for (let i = 0; i < block.length; i++) block[i] = n++;
      };
    };

    for (const blockSize of [1, 13, 128, 4096]) {
      const signal = render(counting, {
        f0: 440,
        sampleRate: SAMPLE_RATE,
        length: 100,
        warmup: 50,
        blockSize,
      });
      expect(signal.length).toBe(100);
      expect(Array.from(signal)).toEqual(
        Array.from({ length: 100 }, (_, i) => 50 + i),
      );
    }
  });
});
