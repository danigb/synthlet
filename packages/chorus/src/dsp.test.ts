import { createDelayLine } from "./_delay";
import { fundamental, maxAbsoluteDifference, render } from "./_spectrum";
import {
  CHORUS_MODE_DEFAULTS,
  ChorusMode,
  createChorus,
  FAST_MULTIPLIER,
  usefulDepthMs,
  VOICINGS,
} from "./dsp";
import {
  centsFromExcursion,
  correlation,
  excursionMs,
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
// The assertions this suite landed with were written against the Faust engine
// and every one of them failed. The engine is gone; the ones it can no longer
// be asked about went with it, and the rest are here in the units they were
// always meant to be in. What is still `it.failing()` is what the engine does
// not have yet.

const SAMPLE_RATE = 48000;
const RATES = [44100, 48000, 96000];

/** The base delay every voice sits on until the voicing table lands. */
const BASE_MS = 3;

type Settings = {
  mode?: number;
  rate?: number;
  depth?: number;
  mix?: number;
  width?: number;
};
type Values = [number, number, number, number, number];

/** Parameters in `update()` order. */
const params = (over: Settings = {}): Values => {
  const s = { mode: 0, rate: 0.5, depth: 0.5, mix: 0.5, width: 1, ...over };
  return [s.mode, s.rate, s.depth, s.mix, s.width];
};

const engine =
  (sampleRate = SAMPLE_RATE) =>
  () =>
    createChorus(sampleRate);

/**
 * Warm-up before the impulse. The ramps here reach their targets inside one
 * block, so this is two blocks rather than the 200 k the Faust engine's
 * `0.999` smoothers needed - and that reduction is itself a result: nothing in
 * this engine takes four seconds to settle.
 */
const WARMUP = 256;

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
// Delay time. The Faust engine put its first tap at 5.805 / 5.333 / 2.667 ms
// at 44.1 / 48 / 96 kHz for the same knob setting - a sample count wearing a
// millisecond's clothes. This is that group, and it is the group
// `virtual-analog-filter` found three bugs with.
// ---------------------------------------------------------------------------

describe.each(RATES)("at %i Hz", (sampleRate) => {
  it("puts the tap at the delay it was asked for, in milliseconds", () => {
    const at = taps(engine(sampleRate), params({ rate: 0, depth: 0 }), {
      sampleRate,
      warmup: WARMUP,
    });

    // The dry path is the tap at 0 ms; the voices are the one after it.
    expect(at[0].ms).toBeCloseTo(0, 3);
    // A tenth of a millisecond of tolerance, which is what the centroid of a
    // 4-point Hermite tap can be read to at 44.1 kHz.
    expect(at[1].ms).toBeCloseTo(BASE_MS, 1);
  });

  it("puts the dry path at the gain `mix` asks for", () => {
    const at = taps(engine(sampleRate), params({ mix: 0.25, rate: 0 }), {
      sampleRate,
      warmup: WARMUP,
    });
    expect(at[0].height).toBeCloseTo(0.75, 2);
  });
});

// ---------------------------------------------------------------------------
// Modulation. Red until the LFO bank lands: the read position does not move
// yet, so there is no rate to measure and no excursion to measure it with.
// ---------------------------------------------------------------------------

describe("the LFO", () => {
  it.each(RATES)(
    "runs at the rate it was asked for at %i Hz",
    (sampleRate) => {
      const length = sampleRate * 20;
      const input = sine(length, 440, sampleRate);
      const measure = (rate: number) => {
        const [left] = render(engine(sampleRate)(), {
          length,
          sampleRate,
          input,
          params: params({ rate, depth: 1 }),
        });
        return lfoHz(left, sampleRate, 0.05, 12);
      };

      // Three settings, not one: the ratios are the load-bearing part of the
      // claim that the parameter is in hertz rather than merely monotonic in it.
      expect(measure(1)).toBeCloseTo(1, 1);
      expect(measure(3)).toBeCloseTo(3, 1);
      // 7 Hz is the range the Faust source declared and the wrapper truncated to
      // 1 Hz on the way in.
      expect(measure(7)).toBeCloseTo(7, 1);
    },
    240000,
  );

  it("holds every phase still at rate 0", () => {
    // A legitimate setting - a static comb - and the reason the impulse
    // measurements above do not have to chase a moving tap.
    const first = taps(engine(), params({ rate: 0, depth: 1 }), {
      sampleRate: SAMPLE_RATE,
      warmup: WARMUP,
    });
    const later = taps(engine(), params({ rate: 0, depth: 1 }), {
      sampleRate: SAMPLE_RATE,
      warmup: WARMUP + 4096,
    });
    expect(later[1].ms).toBeCloseTo(first[1].ms, 3);
  });

  it.each([
    // rate Hz, measured excursion ms. `JUNO`'s ceiling is 2 ms, and Martens &
    // Marui's bound is what binds above 2.4 Hz.
    [0.5, 2.0],
    [2, 2.0],
    [6, usefulDepthMs(6)],
    [7, usefulDepthMs(7)],
  ])(
    "swings the expected excursion at depth 1 and rate %p Hz",
    (rate, expected) => {
      const swing = excursionMs(engine(), params({ rate, depth: 1 }), {
        sampleRate: SAMPLE_RATE,
        warmup: WARMUP,
        rateHz: rate,
        steps: 24,
      });
      // A 24-point sweep of one cycle reads the peak of a sine to within
      // 1 - cos(pi/24) = 0.9 %, and the tap centroid adds a fraction of a
      // sample; the tolerance is 8 % of the expected value.
      expect(swing).toBeGreaterThan(expected * 0.92);
      expect(swing).toBeLessThan(expected * 1.08);
    },
    240000,
  );

  it("couples depth to rate rather than holding it fixed", () => {
    // The shape of the rule: faster LFOs need proportionally less depth. If
    // `depth` were a millisecond value these two would be equal, and one of
    // them would be wrong.
    const slow = usefulDepthMs(0.5);
    const fast = usefulDepthMs(6);
    expect(slow / fast).toBeGreaterThan(10);
    // Regression rows from the paper, to three decimals.
    expect(usefulDepthMs(4)).toBeCloseTo(0.85, 3);
    expect(usefulDepthMs(6)).toBeCloseTo(0.45, 3);
    expect(usefulDepthMs(9)).toBeCloseTo(0.1833, 3);
  });

  it("puts the detune range in cents", () => {
    // What a musician can act on. `JUNO` at its 2 ms ceiling and 0.5 Hz is
    // +/- 10.8 cents; at 6 Hz the coupling holds it to +/- 29.1, which is why
    // the rule exists.
    expect(centsFromExcursion(2, 0.5)).toBeCloseTo(10.8436, 3);
    expect(centsFromExcursion(usefulDepthMs(6), 6)).toBeCloseTo(29.1, 1);
  });

  it("does not click when the rate steps mid-render", () => {
    const length = SAMPLE_RATE * 2;
    const input = sine(length, 220, SAMPLE_RATE);
    const [left] = render(engine()(), {
      length,
      sampleRate: SAMPLE_RATE,
      input,
      params: (seconds) =>
        seconds < 1 ? params({ rate: 0.5 }) : params({ rate: 7 }),
    });
    expect(maxAbsoluteDifference(left)).toBeLessThan(0.1);
  }, 60000);

  it("does not click when the depth is swept end to end in one block", () => {
    // The read position travels the whole excursion inside one 128-sample
    // block, which is faster than any automation can ask for it to: the wet
    // path is momentarily resampled at 1.75x. That is a pitch bend, and it has
    // to stay a pitch bend rather than becoming a step.
    const length = SAMPLE_RATE;
    const input = sine(length, 220, SAMPLE_RATE);
    const [left] = render(engine()(), {
      length,
      sampleRate: SAMPLE_RATE,
      input,
      params: (seconds) =>
        seconds < 0.5
          ? params({ rate: 1, depth: 0 })
          : params({ rate: 1, depth: 1 }),
    });

    expect(maxAbsoluteDifference(left)).toBeLessThan(0.1);
  }, 60000);

  it("uses an irrational fast/slow ratio", () => {
    // The RS-101 trap: a set of rates that are all rational multiples of each
    // other closes on a common period, and the pattern audibly repeats. This
    // is the property that is easy to reintroduce by picking round numbers.
    expect(FAST_MULTIPLIER).toBeCloseTo(8.7082, 4);
    // No fraction with a denominator under 60 comes within 1e-9, so the pair
    // has no common period under 60 s at any rate at or above 1 Hz.
    for (let q = 1; q < 60; q++) {
      const p = Math.round(FAST_MULTIPLIER * q);
      expect(Math.abs(FAST_MULTIPLIER - p / q)).toBeGreaterThan(1e-9);
    }
  });
});

describe("the stereo image", () => {
  const length = SAMPLE_RATE * 4;
  const input = noise(length + WARMUP);
  const stereo = (over: Settings = {}) =>
    render(engine()(), {
      length,
      sampleRate: SAMPLE_RATE,
      input,
      warmup: WARMUP,
      params: params(over),
    });

  it.failing(
    "stays decorrelated without falling apart",
    () => {
      // Decorrelated enough to be wide, correlated enough to survive a mono sum.
      // The Faust engine measured 0.4124 at its defaults and -0.0001 with
      // everything at maximum, and the second of those is the failure that
      // matters: fully decorrelated is where image stability goes.
      const [left, right] = stereo();
      const value = correlation(left, right);
      expect(value).toBeGreaterThan(0.1);
      expect(value).toBeLessThan(0.5);
    },
    60000,
  );

  it.failing(
    "survives a mono sum",
    () => {
      // The Faust engine measured -3.59 dB: eight taps summed at full bandwidth
      // comb-filter each other, and half of what a listener on a phone hears is
      // the part that cancelled.
      const [left, right] = stereo();
      expect(
        Math.abs(monoSumDb(left, right, input.subarray(WARMUP))),
      ).toBeLessThan(1.5);
    },
    60000,
  );
});

// ---------------------------------------------------------------------------
// The three voicings. Every candidate topology is the same computation - N
// taps on one line per channel, Hermite reads, an LFO bank, an output matrix -
// so what separates a Juno from a Solina from a Dimension D is five tables.
// These assertions are about the tables.
// ---------------------------------------------------------------------------

/** Peak-to-peak pitch excursion in cents, from the fundamental tracker. */
const pitchSpreadCents = (mode: number, over: Settings = {}) => {
  const length = SAMPLE_RATE * 4;
  const defaults = CHORUS_MODE_DEFAULTS[mode];
  const [left] = render(engine()(), {
    length,
    sampleRate: SAMPLE_RATE,
    input: sine(length, 440, SAMPLE_RATE),
    params: params({ mode, ...defaults, mix: 1, ...over }),
  });

  const window = 4096;
  let low = Infinity;
  let high = -Infinity;
  for (let at = SAMPLE_RATE; at + window < length; at += window) {
    const f = fundamental(
      left.subarray(at, at + window),
      SAMPLE_RATE,
      200,
      900,
    );
    if (Number.isFinite(f)) {
      low = Math.min(low, f);
      high = Math.max(high, f);
    }
  }
  return 1200 * Math.log2(high / low);
};

describe("the voicings", () => {
  it("keeps every tap inside the line at every parameter combination", () => {
    // The bound `readHermite` documents is `[1, size - 4]`; the clamp at the
    // read site enforces it, and this is the check that no voicing *relies* on
    // the clamp. Swept from the table rather than from a render, because the
    // table is where a new voicing would break it.
    const line = 1 / 44.1; // one sample in ms, at the lowest supported rate
    for (const v of VOICINGS) {
      for (const voice of v.voices) {
        const swing = voice.modScale * v.maxDepthMs;
        expect(voice.delayMs - swing).toBeGreaterThan(line);
        expect(voice.delayMs + swing).toBeLessThan(20);
      }
      // The weights a voice puts on the two accumulators sum to at most 1, so
      // `depth: 1` means the voicing's ceiling and not some multiple of it.
      for (const voice of v.voices) {
        expect(Math.abs(voice.slow) + Math.abs(voice.fast)).toBeCloseTo(1, 6);
      }
    }
  });

  it.each([
    [ChorusMode.Juno, 3],
    [ChorusMode.Ensemble, 4],
  ])("puts voicing %i on a %p ms centre", (mode, centre) => {
    const at = taps(engine(), params({ mode, rate: 0, depth: 0 }), {
      sampleRate: SAMPLE_RATE,
      warmup: WARMUP,
    });
    expect(at[1].ms).toBeCloseTo(centre, 1);
  });

  it("cancels DIMENSION's wet path exactly when its two voices coincide", () => {
    // The defining property of the difference matrix, and the cheapest
    // possible check that it is a difference: `L = d0 - d1` with `d0 === d1`
    // is zero, so at `depth: 0` there is no wet path at all and the impulse
    // shows the dry tap and nothing else.
    const at = taps(
      engine(),
      params({ mode: ChorusMode.Dimension, rate: 0, depth: 0 }),
      { sampleRate: SAMPLE_RATE, warmup: WARMUP },
    );
    expect(at).toHaveLength(1);
    expect(at[0].ms).toBeCloseTo(0, 3);
  });

  it("puts DIMENSION on an 8.5 ms centre", () => {
    // With the voices separated the two taps straddle the base delay, so the
    // centre is their mean. 8.5 ms is the SDD-320's 7.5-10 ms range.
    const at = taps(
      engine(),
      params({ mode: ChorusMode.Dimension, rate: 0, depth: 0.2 }),
      { sampleRate: SAMPLE_RATE, warmup: WARMUP },
    );
    const moving = at.slice(1);
    expect(moving).toHaveLength(2);
    expect((moving[0].ms + moving[1].ms) / 2).toBeCloseTo(8.5, 1);
  });

  it("gives ENSEMBLE three voices where the others have two", () => {
    // Density is voice count, and it is the reason ENSEMBLE is unreachable
    // from JUNO at any knob setting - that and the incommensurate rates.
    expect(VOICINGS[ChorusMode.Juno].voices).toHaveLength(2);
    expect(VOICINGS[ChorusMode.Ensemble].voices).toHaveLength(3);
    expect(VOICINGS[ChorusMode.Dimension].voices).toHaveLength(2);

    // And measurably: at `rate: 0` ENSEMBLE's three exact-thirds phases put
    // its voices at three distinct positions, where JUNO's antiphase pair puts
    // one voice in each channel.
    const at = taps(
      engine(),
      params({ mode: ChorusMode.Ensemble, rate: 0, depth: 1 }),
      { sampleRate: SAMPLE_RATE, warmup: WARMUP },
    );
    // The dry tap plus two of the three voices; the third is panned hard right.
    expect(at.length).toBeGreaterThanOrEqual(3);
  });

  it("gives DIMENSION far less pitch modulation than JUNO", () => {
    // The whole point of the difference output: the common-mode pitch
    // modulation cancels while the differential spatial motion survives.
    // Measured at each voicing's own defaults, wet only:
    //   JUNO 13.00 cents   ENSEMBLE 38.88 cents   DIMENSION 0.31 cents
    const juno = pitchSpreadCents(ChorusMode.Juno);
    const dimension = pitchSpreadCents(ChorusMode.Dimension);

    expect(juno).toBeGreaterThan(8);
    expect(dimension).toBeLessThan(2);
    expect(juno / dimension).toBeGreaterThan(5);
  }, 120000);

  it("does not click when the mode changes mid-render", () => {
    // A mode change is a topology change, so it cross-fades: out over 5 ms,
    // swap the table at the envelope's zero, back in.
    const length = SAMPLE_RATE * 2;
    const input = sine(length, 220, SAMPLE_RATE);
    const [left] = render(engine()(), {
      length,
      sampleRate: SAMPLE_RATE,
      input,
      params: (seconds) =>
        params({
          mode: seconds < 1 ? ChorusMode.Juno : ChorusMode.Dimension,
          mix: 1,
        }),
    });

    expect(maxAbsoluteDifference(left)).toBeLessThan(0.1);
  }, 60000);

  it.each([0, 1, 2])(
    "stays finite across voicing %i's whole range",
    (mode) => {
      const length = SAMPLE_RATE;
      const input = sine(length, 220, SAMPLE_RATE);
      for (const depth of [0, 0.5, 1]) {
        for (const rate of [0, 0.05, 3, 7]) {
          const [left, right] = render(engine()(), {
            length,
            sampleRate: SAMPLE_RATE,
            input,
            params: params({ mode, rate, depth, mix: 1 }),
          });
          expect(Array.from(left).every(Number.isFinite)).toBe(true);
          expect(Array.from(right).every(Number.isFinite)).toBe(true);
        }
      }
    },
    120000,
  );
});

// ---------------------------------------------------------------------------
// The guarantees `_delay.ts` was adopted for.
// ---------------------------------------------------------------------------

describe("the engine", () => {
  it("allocates nothing after the factory returns", () => {
    // `_delay.ts` guarantees allocation-free operation after construction, and
    // that guarantee is the reason to use it rather than a private ring.
    // Asserted rather than assumed: a `new Float32Array` in an audio callback
    // is a dropout waiting for a garbage collection.
    const dsp = createChorus(SAMPLE_RATE);
    const n = 128;
    const inL = sine(n, 220, SAMPLE_RATE);
    const outL = new Float32Array(n);
    const outR = new Float32Array(n);
    dsp.update(...params());
    dsp.compute(inL, inL, outL, outR);

    const real = global.Float32Array;
    let constructed = 0;
    // A construction counter, restored in the `finally` below.
    global.Float32Array = new Proxy(real, {
      construct(target, args) {
        constructed++;
        return new (target as any)(...args);
      },
    });
    try {
      for (let block = 0; block < 200; block++) {
        dsp.update(...params({ rate: 0.5 + block * 0.01 }));
        dsp.compute(inL, inL, outL, outR);
      }
    } finally {
      global.Float32Array = real;
    }

    expect(constructed).toBe(0);
  });

  it("does not click when a parameter steps mid-render", () => {
    const length = SAMPLE_RATE * 2;
    const input = sine(length, 220, SAMPLE_RATE);
    const [left] = render(engine()(), {
      length,
      sampleRate: SAMPLE_RATE,
      input,
      params: (seconds) =>
        seconds < 1 ? params({ mix: 0 }) : params({ mix: 1 }),
    });

    // 220 Hz at 48 kHz steps by at most 0.029 per sample; the bound is that
    // with room for the wet path's own slope.
    expect(maxAbsoluteDifference(left)).toBeLessThan(0.1);
  }, 60000);

  it("does not poison itself on a non-finite input", () => {
    // `vaf 05` found that one NaN killed that filter permanently. A delay line
    // flushes, so this engine recovers by construction - which is a property
    // worth pinning rather than rediscovering.
    const dsp = createChorus(SAMPLE_RATE);
    dsp.update(...params());
    const n = 128;
    const bad = new Float32Array(n).fill(NaN);
    const good = sine(n, 440, SAMPLE_RATE);
    const outL = new Float32Array(n);
    const outR = new Float32Array(n);

    dsp.compute(bad, bad, outL, outR);
    for (let block = 0; block < 40; block++)
      dsp.compute(good, good, outL, outR);

    expect(Array.from(outL).every(Number.isFinite)).toBe(true);
    expect(Array.from(outL).some((x) => x !== 0)).toBe(true);
  });

  it("comes back from reset the way it started", () => {
    const n = 512;
    const input = sine(n, 220, SAMPLE_RATE);
    const first = new Float32Array(n);
    const firstR = new Float32Array(n);
    const again = new Float32Array(n);
    const againR = new Float32Array(n);

    const dsp = createChorus(SAMPLE_RATE);
    dsp.update(...params());
    dsp.compute(input, input, first, firstR);
    dsp.reset();
    dsp.update(...params());
    dsp.compute(input, input, again, againR);

    expect(Array.from(again)).toEqual(Array.from(first));
  });
});

describe("the detune conversion", () => {
  it("turns an excursion in ms into cents", () => {
    // Dattorro's extrema, checked against a hand computation: 2 ms at 0.5 Hz
    // is 2*pi*0.5*0.002 = 0.0062832, and 1200*log2(1.0062832) = 10.8436 cents.
    expect(centsFromExcursion(2, 0.5)).toBeCloseTo(10.8436, 3);
  });
});
