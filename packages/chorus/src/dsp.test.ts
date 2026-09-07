import { createDelayLine } from "./_delay";
import { maxAbsoluteDifference, render } from "./_spectrum";
import { createChorus } from "./dsp";
import {
  centsFromExcursion,
  correlation,
  Engine,
  lfoHz,
  monoSumDb,
  noise,
  sine,
  taps,
} from "./measure";

// Every threshold here is a measured value with a stated margin, and the raw
// measurement is in a comment beside it. A number with no measurement behind
// it is a number nobody can tighten later. The metrics themselves are
// calibrated against analytic truth in `spectrum.test.ts`; this file assumes
// they work and asks what the module does.
//
// ---------------------------------------------------------------------------
// THIS SUITE IS DELIBERATELY RED.
//
// It is written against the *current* engine, before the rewrite that replaces
// it, because a suite that has never failed has not been shown to work. The
// rewrite replaces everything these assertions point at, so writing them
// afterwards would mean writing them against code that already passes; written
// now, each one has a known failing value to hit.
//
// The failing ones are `it.failing()` so CI stays green while the values are
// committed. Each carries what the current engine measures and what it should
// measure. They become plain `it()` when the engine that satisfies them lands,
// and the characterisation values are deleted in the same commit - a test
// asserting what the old engine did is dead weight the moment it passes.
// ---------------------------------------------------------------------------

const SAMPLE_RATE = 48000;
const RATES = [44100, 48000, 96000];

/**
 * The current engine reads one input channel and writes two. `render` drives
 * the stereo-in shape every other package in the library has, so the adapter
 * is here rather than in the harness - and its existence is the mono-in bug
 * (`worklet.ts:34` reads `inputs[0][0]`) written down as code.
 */
const legacy =
  (sampleRate = SAMPLE_RATE) =>
  (): Engine => {
    const { update, compute } = createChorus(sampleRate);
    return {
      update,
      compute: (inL, _inR, outL, outR) => compute(inL, outL, outR),
    };
  };

/** The four current parameters, in `update()` order. */
const params = (
  over: Partial<{
    delay: number;
    rate: number;
    depth: number;
    deviation: number;
  }> = {},
) => {
  const s = { delay: 0.5, rate: 0.5, depth: 0.5, deviation: 0.5, ...over };
  return [s.delay, s.rate, s.depth, s.deviation];
};

/** Tap positions with the LFOs stopped, so the impulse reads the base delays. */
const frozenTaps = (over = {}, sampleRate = SAMPLE_RATE) =>
  taps(legacy(sampleRate), params({ deviation: 0, ...over }), { sampleRate });

// ---------------------------------------------------------------------------
// The interpolator. This one passes today: `_delay.ts` is already correct, and
// the engine's own two-point linear read is what the rewrite replaces with it.
// ---------------------------------------------------------------------------

describe("the fractional read", () => {
  it("reproduces a cubic exactly", () => {
    // The defining property of a 3rd-order interpolator, and the assertion
    // that catches a mistyped coefficient: a linear read fails it outright,
    // which is what makes it worth writing. Lifted from
    // `digital-delay/src/delay.test.ts`, whose numbers this reproduces.
    const cubic = (x: number) =>
      0.4 - 0.03 * x + 0.0007 * x * x - 0.000004 * x * x * x;
    const length = 400;
    const line = createDelayLine(120);
    for (let i = 0; i < length; i++) line.write(cubic(i));

    const problems: unknown[] = [];
    let worstLinear = 0;
    for (let d = 1; d < line.size - 5; d += 0.25) {
      const expected = cubic(length - 1 - d);
      const error = Math.abs(line.readHermite(d) - expected);
      if (error > 1e-5) problems.push([d, line.readHermite(d), expected]);
      worstLinear = Math.max(
        worstLinear,
        Math.abs(line.readLinear(d) - expected),
      );
    }

    expect(problems).toEqual([]);
    // The control: the same sweep read linearly is nowhere near exact, so the
    // assertion above is testing the kernel and not the harness. This is also
    // the gap Dattorro 6.1 is about - "a multivoice (more than two) chorus
    // design using linear interpolation subjects the signal to significantly
    // audible amounts of low-pass filtering".
    expect(worstLinear).toBeGreaterThan(1e-3);
  });
});

// ---------------------------------------------------------------------------
// The permutation. Faust declared its sliders in one order and mapped
// `ParamIndex` to them in another (`dsp/chorus.rs:301-333`); the hand-written
// port assigned them in declaration order (`dsp.ts:223-233`). Four rows, four
// wrong destinations, and every one of them measurable in a few lines.
// ---------------------------------------------------------------------------

describe("the parameter permutation", () => {
  it.failing("`delay` sets the delay time and not the mix", () => {
    // Measured: the taps do not move at all with `delay` - 13.333 ms at both
    // 0.25 and 0.75 - while the tap at 0 ms, which is the dry path, has height
    // 0.75 and 0.25 respectively. `delay` is exactly `1 - mix`.
    const near = frozenTaps({ delay: 0.25, rate: 1 });
    const far = frozenTaps({ delay: 0.75, rate: 1 });

    expect(far[1].ms).toBeGreaterThan(near[1].ms * 1.5);
    // And the dry tap should not be what this knob moves.
    expect(far[0].height).toBeCloseTo(near[0].height, 2);
  });

  it.failing("`rate` sets the LFO rate and not the delay time", () => {
    // Measured: the taps scale exactly with `rate` - first moving tap at
    // 3.333 / 6.667 / 13.333 ms for rate 0.25 / 0.5 / 1.0. It is the base
    // delay, `curdel*(i+1)/8` for `curdel = 4096*rate`.
    const slow = frozenTaps({ rate: 0.25 });
    const fast = frozenTaps({ rate: 1.0 });

    expect(fast[1].ms).toBeCloseTo(slow[1].ms, 1);
  });

  it.failing("`depth` sets the excursion and not the per-voice offset", () => {
    // Measured with the LFOs stopped, so nothing should move at all: the first
    // moving tap goes 10.667 ms -> 15.999 ms as `depth` goes 0 -> 1. That is
    // Faust's `Deviation`, the per-voice offset sigma, reached through the
    // knob called `depth`.
    const shallow = frozenTaps({ depth: 0, rate: 1 });
    const deep = frozenTaps({ depth: 1, rate: 1 });

    expect(deep[1].ms).toBeCloseTo(shallow[1].ms, 1);
  });

  it.failing(
    "`deviation` is not the LFO rate",
    () => {
      // Measured by envelope autocorrelation on 440 Hz, 60-second renders:
      //   deviation  0.25 -> 0.0830 Hz
      //              0.50 -> 0.1659 Hz
      //              0.75 -> 0.2489 Hz
      //              1.00 -> 0.3320 Hz
      // Exactly linear, which is what makes the claim safe rather than a
      // coincidence: `deviation` is Faust's `Rate` in hertz.
      const length = SAMPLE_RATE * 60;
      const input = sine(length, 440, SAMPLE_RATE);
      const measure = (deviation: number) => {
        const [left] = render(legacy()(), {
          length,
          sampleRate: SAMPLE_RATE,
          input,
          params: params({ deviation }),
        });
        return lfoHz(left, SAMPLE_RATE, 0.05, 3);
      };

      const half = measure(0.5);
      const full = measure(1.0);
      // If `deviation` were the phase/rate spread it is documented as, doubling
      // it would not double the LFO rate.
      expect(full / half).toBeLessThan(1.5);
    },
    180000,
  );
});

describe("the LFO range", () => {
  it.failing(
    "reaches the 7 Hz the source declared",
    () => {
      // `dsp/chorus.rs:302` declares Rate as 0.01 ... 7.0 Hz; `params.ts:31-35`
      // declares 0 ... 1. Measured ceiling on the voice this reads: 0.332 Hz,
      // and the fastest of the eight voices reaches 1 Hz. One seventh of the
      // range, lost on the way through the wrapper.
      const length = SAMPLE_RATE * 20;
      const input = sine(length, 440, SAMPLE_RATE);
      const [left] = render(legacy()(), {
        length,
        sampleRate: SAMPLE_RATE,
        input,
        // Everything at maximum: this is as fast as the module goes.
        params: params({ deviation: 1 }),
      });

      expect(lfoHz(left, SAMPLE_RATE, 0.05, 10)).toBeGreaterThan(5);
    },
    120000,
  );
});

// ---------------------------------------------------------------------------
// Stereo. Faust's `os.oscp` builds a cosine of arbitrary phase as
// `cos*cos(phi) - sin*sin(phi)`; `fillTable` (`dsp.ts:241-256`) ignores its
// `fn` argument, so both tables hold a cosine and the per-voice phase offsets
// do not compute.
// ---------------------------------------------------------------------------

describe("the stereo image", () => {
  const length = SAMPLE_RATE * 4;
  const warmup = 200000;
  const input = noise(length + warmup);
  const stereo = (over = {}) =>
    render(legacy()(), {
      length,
      sampleRate: SAMPLE_RATE,
      input,
      warmup,
      params: params(over),
    });

  it.failing(
    "stays decorrelated without falling apart",
    () => {
      // Measured: 0.4124 at the defaults - which is inside the band - and
      // -0.0001 with every knob at maximum, which is not. Fully decorrelated is
      // the opposite failure from mono: it is where image stability and mono
      // compatibility both go.
      const [left, right] = stereo({
        delay: 1,
        rate: 1,
        depth: 1,
        deviation: 1,
      });
      expect(correlation(left, right)).toBeGreaterThan(0.1);
    },
    60000,
  );

  it.failing(
    "survives a mono sum",
    () => {
      // Measured: -3.59 dB at the defaults. Eight taps summed at full bandwidth
      // comb-filter each other, and half of what a listener on a phone hears is
      // the part that cancelled.
      const [left, right] = stereo();
      expect(monoSumDb(left, right, input.subarray(warmup))).toBeGreaterThan(
        -1.5,
      );
    },
    60000,
  );
});

// ---------------------------------------------------------------------------
// Sample rate. `virtual-analog-filter` found three bugs with this group: a
// delay in milliseconds and a rate in hertz are claims about wall-clock time,
// and a module that stores either as a sample count fails them silently.
// ---------------------------------------------------------------------------

describe("the sample rate", () => {
  it.failing(
    "does not move the delay in milliseconds",
    () => {
      // Measured first moving tap, `rate = 0.5`, `depth = 0`:
      //   44100 Hz -> 5.805 ms   48000 Hz -> 5.333 ms   96000 Hz -> 2.667 ms
      // Exactly 256 samples at every rate. The delay is a sample count wearing a
      // millisecond's clothes, and 96 kHz halves it.
      //
      // Asserted as the three rates against each other rather than against a
      // number, because the current engine has no parameter in milliseconds to
      // ask for one. The rewrite does, and this becomes a `describe.each` over
      // `RATES` asserting the value that was asked for.
      const measured = RATES.map(
        (rate) => frozenTaps({ depth: 0 }, rate)[1].ms,
      );

      expect(Math.max(...measured) / Math.min(...measured)).toBeLessThan(1.02);
    },
    180000,
  );
});

// ---------------------------------------------------------------------------
// Survival. This one passes on the current engine and is here so it keeps
// passing: `vaf 05` found that one NaN killed that filter permanently, and the
// property is worth pinning before the engine is replaced rather than after.
// ---------------------------------------------------------------------------

describe("a non-finite input", () => {
  it("does not poison the engine", () => {
    const dsp = legacy()();
    dsp.update(...params());
    const n = 128;
    const bad = new Float32Array(n).fill(NaN);
    const good = sine(n, 440, SAMPLE_RATE);
    const outL = new Float32Array(n);
    const outR = new Float32Array(n);

    dsp.compute(bad, bad, outL, outR);
    // Long enough for the line to have flushed the poisoned samples past every
    // tap the engine reads.
    for (let block = 0; block < 40; block++)
      dsp.compute(good, good, outL, outR);

    expect(Array.from(outL).every(Number.isFinite)).toBe(true);
    expect(Array.from(outL).some((x) => x !== 0)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Clicks. `maxAbsoluteDifference` is the cheapest click detector there is, and
// it is the assertion every parameter change in this package has to clear.
// ---------------------------------------------------------------------------

describe("a parameter change mid-render", () => {
  it("does not click", () => {
    const length = SAMPLE_RATE * 2;
    const input = sine(length, 220, SAMPLE_RATE);
    const [left] = render(legacy()(), {
      length,
      sampleRate: SAMPLE_RATE,
      input,
      // A step from one setting to another, halfway through.
      params: (seconds) =>
        seconds < 1 ? params({ delay: 0.2 }) : params({ delay: 0.8 }),
    });

    // 220 Hz at 48 kHz steps by at most 0.029 per sample; the bound is that
    // with room for the wet path's own slope.
    expect(maxAbsoluteDifference(left)).toBeLessThan(0.1);
  }, 60000);
});

describe("the detune conversion", () => {
  it("turns an excursion in ms into cents", () => {
    // Dattorro's extrema, checked against a hand computation: 2 ms at 0.5 Hz
    // is 2*pi*0.5*0.002 = 0.0062832, and 1200*log2(1.0062832) = 10.8436 cents.
    expect(centsFromExcursion(2, 0.5)).toBeCloseTo(10.8436, 3);
  });
});
