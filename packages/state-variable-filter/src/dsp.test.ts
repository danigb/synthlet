import { createFilter, SvfType } from "./dsp";

/**
 * What this filter promises, as numbers.
 *
 * **Every magnitude here is asserted against the analytic transfer function,
 * not against captured output.** A trapezoidal SVF has a closed form and this
 * port already hits it to about 6e-9, so `1e-6` is a loose tolerance and
 * anything that fails it is a defect rather than drift. Golden numbers would
 * have been the easier choice and the wrong one: today's output is wrong at
 * three sample rates, and capturing it would have enshrined that.
 *
 * The measurement helper is lifted from `allpass.test.ts:7-42`, which is the
 * only response anybody has had a reason to measure until now, and which stays
 * where it is.
 *
 * Four cases are `it.failing`. That is not a gap, it is the handover: ticket 03
 * turns three of them on by clamping the cutoff and ticket 05 turns on the
 * fourth by noticing a non-finite state. A ticket that fixes one of these has
 * to delete its way out of the list, so the diff is the evidence.
 */

const MAX_FREQUENCY = 20000; // `frequency.maxValue` in params.ts
const SAMPLE_RATES = [8000, 22050, 32000, 44100, 48000, 96000];

// Every sample rate at which the declared cutoff range breaks the filter today.
// `frequency.maxValue` is 20000 and Nyquist is not, so wherever 20 kHz is above
// fs/2 the argument of `tan` walks past its pole:
//
//   8000   Nyquist is 4000. A cutoff of 6000 gives g = -1 and the state
//          diverges; a cutoff of 20000 gives tan(2.5*PI) = +3.3e15 and the
//          lowpass silently degenerates into a bypass. The mapping from
//          requested cutoff to actual cutoff is neither monotonic nor finite.
//   22050  g = -0.301 at maxValue, state reaches 1.5e140, output is Infinity
//   32000  g = -2.414 at maxValue, state reaches 6.9e198, output is Infinity
//
// Ticket 03 replaces `tan` with a prewarping that is finite and monotonic at
// every sample rate. Delete this set there.
const FAILS_UNTIL_TICKET_03 = new Set([8000, 22050, 32000]);

/**
 * Run a steady sine of `f` Hz through the filter and measure the amplitude and
 * phase of the output once it has settled, using I/Q demodulation over the
 * last full second (an integer number of cycles for any integer frequency, so
 * there is no spectral leakage).
 */
function measure(
  sampleRate: number,
  type: SvfType,
  cutoff: number,
  q: number,
  f: number,
) {
  const seconds = 2;
  const length = sampleRate * seconds;
  const input = new Float32Array(length);
  const output = new Float32Array(length);
  const frequency = new Float32Array(length).fill(cutoff);

  for (let n = 0; n < length; n++) {
    input[n] = Math.sin((2 * Math.PI * f * n) / sampleRate);
  }

  createFilter(sampleRate)(input, output, type, frequency, q);

  let i = 0;
  let quad = 0;
  for (let n = length - sampleRate; n < length; n++) {
    const w = (2 * Math.PI * f * n) / sampleRate;
    i += output[n] * Math.sin(w);
    quad += output[n] * Math.cos(w);
  }
  i /= sampleRate;
  quad /= sampleRate;

  return { amplitude: 2 * Math.hypot(i, quad), phase: Math.atan2(quad, i) };
}

/**
 * The magnitude of the analytic response, evaluated the way the trapezoidal
 * integrator actually behaves: the bilinear transform maps the unit circle onto
 * the imaginary axis as `s = j*tan(pi*f/fs)`, so normalising by the prewarped
 * cutoff `g = tan(pi*fc/fs)` gives `s = j*t` with `t = tan(pi*f/fs)/g`.
 *
 * Denominator is the SVF prototype `s^2 + s/Q + 1`; each numerator follows from
 * the mixing coefficients in `dsp.ts`. They are derived rather than assumed:
 * `HighPass = 1 - k*BP - LP` reduces to `s^2/(s^2+ks+1)` only if the raw
 * bandpass is `s/(s^2+ks+1)`, which is also why that tap peaks at a gain of Q.
 */
function analytic(
  sampleRate: number,
  type: SvfType,
  cutoff: number,
  q: number,
  f: number,
) {
  const g = Math.tan((cutoff * Math.PI) / sampleRate);
  const k = 1 / Math.max(q, 0.0001);
  const t = Math.tan((f * Math.PI) / sampleRate) / g;

  // s = j*t, so s^2 = -t^2. Denominator (1 - t^2) + j*k*t.
  const denominator = Math.hypot(1 - t * t, k * t);

  let numerator: number;
  switch (type) {
    case SvfType.LowPass:
      numerator = 1;
      break;
    case SvfType.BandPass:
      numerator = Math.abs(t);
      break;
    case SvfType.HighPass:
      numerator = t * t;
      break;
    case SvfType.Notch:
      numerator = Math.abs(1 - t * t);
      break;
    case SvfType.Peak:
      numerator = Math.abs(-1 - t * t);
      break;
    case SvfType.AllPass:
      numerator = Math.hypot(1 - t * t, k * t);
      break;
    default:
      return 1; // ByPass
  }
  return numerator / denominator;
}

const db = (magnitude: number) => 20 * Math.log10(magnitude);

describe("the magnitude response", () => {
  // Two decades either side of a 1 kHz cutoff at 48 kHz, which is where the
  // audit's 6e-9 agreement was measured.
  const SAMPLE_RATE = 48000;
  const CUTOFF = 1000;
  const Q = 0.7071;
  const FREQUENCIES = [50, 200, 1000, 2000, 5000, 10000];

  const cases = [
    SvfType.LowPass,
    SvfType.HighPass,
    SvfType.BandPass,
    SvfType.Notch,
    SvfType.Peak,
  ].flatMap((type) =>
    FREQUENCIES.map((f) => [SvfType[type], type, f] as const),
  );

  it.each(cases)("%s at %p Hz matches its transfer function", (_, type, f) => {
    const { amplitude } = measure(SAMPLE_RATE, type, CUTOFF, Q, f);
    const expected = analytic(SAMPLE_RATE, type, CUTOFF, Q, f);
    expect(Math.abs(amplitude - expected)).toBeLessThan(1e-6);
  });

  it("puts the lowpass corner at the cutoff", () => {
    // The one number worth stating on its own: -3 dB at fc, for Butterworth Q.
    const { amplitude } = measure(
      SAMPLE_RATE,
      SvfType.LowPass,
      CUTOFF,
      Q,
      1000,
    );
    expect(db(amplitude)).toBeCloseTo(-3.01, 2);
  });

  it("makes the highpass the lowpass mirrored about the cutoff", () => {
    // |HP(fc*r)| == |LP(fc/r)| in the warped frequency variable, which is the
    // statement that the two share one prototype.
    for (const ratio of [2, 5, 10]) {
      const t = Math.tan((CUTOFF * ratio * Math.PI) / SAMPLE_RATE);
      const g = Math.tan((CUTOFF * Math.PI) / SAMPLE_RATE);
      // |HP(t)| == |LP(1/t)| in the warped variable, so the mirror frequency is
      // the one whose tangent is g^2/t.
      const mirror = (SAMPLE_RATE / Math.PI) * Math.atan((g * g) / t);
      const high = measure(
        SAMPLE_RATE,
        SvfType.HighPass,
        CUTOFF,
        Q,
        CUTOFF * ratio,
      ).amplitude;
      const low = analytic(SAMPLE_RATE, SvfType.LowPass, CUTOFF, Q, mirror);
      expect(Math.abs(high - low)).toBeLessThan(1e-6);
    }
  });

  it("notches at the cutoff and passes either side of it", () => {
    expect(
      measure(SAMPLE_RATE, SvfType.Notch, CUTOFF, Q, CUTOFF).amplitude,
    ).toBeLessThan(1e-4);
    for (const f of [50, 10000]) {
      const { amplitude } = measure(SAMPLE_RATE, SvfType.Notch, CUTOFF, Q, f);
      expect(Math.abs(db(amplitude))).toBeLessThan(0.5);
    }
  });
});

describe("the magnitude response at every sample rate", () => {
  // A cutoff of 1 kHz is safely under the 4 kHz Nyquist of the lowest rate, so
  // this group is about the sample rate reaching the coefficients correctly and
  // nothing else. It passes today; the group below is the one that does not.
  const CUTOFF = 1000;
  const Q = 0.7071;

  const cases = SAMPLE_RATES.flatMap((sampleRate) =>
    [100, 1000, 3000].map((f) => [sampleRate, f] as const),
  );

  it.each(cases)("lowpass at %p Hz, tested at %p Hz", (sampleRate, f) => {
    const { amplitude } = measure(sampleRate, SvfType.LowPass, CUTOFF, Q, f);
    const expected = analytic(sampleRate, SvfType.LowPass, CUTOFF, Q, f);
    expect(Math.abs(amplitude - expected)).toBeLessThan(1e-6);
  });
});

describe("Q maps to a peak height", () => {
  const SAMPLE_RATE = 48000;
  const CUTOFF = 1000;

  // Measured against today's dsp.ts, and independently the analytic peak of
  // 1/(s^2 + s/Q + 1). Q = 0.5 is over-damped - it has no -3 dB point at the
  // cutoff at all - which is ticket 07's reason for moving the default.
  const cases = [
    [0.5, -0.09],
    [0.7071, 0.0],
    [1, 1.25],
    [4, 12.09],
    [40, 32.04],
  ] as const;

  // Scanning the analytic function is free; scanning the measured one is two
  // seconds of audio per point. So the peak is located analytically and then
  // confirmed once against the filter itself.
  //
  // The scan starts at 100 Hz, a tenth of the cutoff, and that lower bound is
  // load-bearing for the first two rows: below Q = 1/sqrt(2) the response has
  // no resonant peak at all, it descends monotonically from a DC gain of 1, so
  // "the peak" is whatever the bottom of the band measures. That is the honest
  // reading of "over-damped" and it is the number the audit reported.
  function analyticPeak(q: number) {
    let best = 0;
    let at = 0;
    for (let f = 100; f <= 2000; f++) {
      const a = analytic(SAMPLE_RATE, SvfType.LowPass, CUTOFF, q, f);
      if (a > best) {
        best = a;
        at = f;
      }
    }
    return { peak: db(best), at };
  }

  it.each(cases)("Q=%p peaks at %p dB", (q, expected) => {
    const { peak, at } = analyticPeak(q);
    expect(peak).toBeCloseTo(expected, 1);

    // ...and the filter agrees with the formula that describes it.
    const { amplitude } = measure(SAMPLE_RATE, SvfType.LowPass, CUTOFF, q, at);
    expect(db(amplitude)).toBeCloseTo(peak, 4);
  });

  it.each([4, 40])("Q=%p puts the peak within 5% of the cutoff", (q) => {
    const { at } = analyticPeak(q);
    expect(Math.abs(at - CUTOFF) / CUTOFF).toBeLessThan(0.05);
  });
});

describe("ByPass", () => {
  it("is bit-identical to its input", () => {
    const input = new Float32Array(512);
    for (let n = 0; n < input.length; n++) {
      input[n] = Math.sin(n * 0.31) * 0.7 + Math.sin(n * 2.9) * 0.3;
    }
    const output = new Float32Array(input.length);
    const frequency = new Float32Array(input.length).fill(1000);

    createFilter(48000)(input, output, SvfType.ByPass, frequency, 0.7071);
    expect(Array.from(output)).toEqual(Array.from(input));
  });
});

describe("stability under a fast sweep", () => {
  // A 3 kHz LFO on the cutoff across the whole declared range is not a patch
  // anybody plays; it is the worst case the a-rate coefficient path can be
  // handed, and it is what makes the zero-delay-feedback claim in the README a
  // measurement rather than an assertion.
  const SAMPLE_RATE = 48000;

  it.each([0.7071, 10, 40])("survives a 3 kHz cutoff LFO at Q=%p", (q) => {
    const length = SAMPLE_RATE;
    const input = new Float32Array(length);
    const output = new Float32Array(length);
    const frequency = new Float32Array(length);
    for (let n = 0; n < length; n++) {
      input[n] = Math.sin((2 * Math.PI * 220 * n) / SAMPLE_RATE);
      const lfo = Math.sin((2 * Math.PI * 3000 * n) / SAMPLE_RATE);
      frequency[n] = 20 + ((MAX_FREQUENCY - 20) * (lfo + 1)) / 2;
    }

    createFilter(SAMPLE_RATE)(input, output, SvfType.LowPass, frequency, q);

    expect(Array.from(output).every(Number.isFinite)).toBe(true);
    expect(Math.max(...Array.from(output).map(Math.abs))).toBeLessThan(1.1);
  });
});

describe("the declared cutoff range", () => {
  // The property this asserts is not a level but a *shape*: raising the cutoff
  // of a lowpass can never lower its gain at a fixed probe tone. That is true
  // of any sane prewarping and does not prejudge where ticket 03 puts its
  // ceiling - a cutoff far above Nyquist is legitimately "wide open", and the
  // ticket's fix does not pretend otherwise. What it must not be is negative,
  // infinite, or backwards, all three of which happen today.
  //
  // dsp.ts:51 claims the range is "[16, sampleRate / 2] (clamped by
  // AudioWorklet)". AudioParam clamps to the descriptor's compile-time
  // constants and has never known the sample rate. That sentence is why this
  // survived three readings of the file.
  const Q = 0.7071; // k^2 = 2, so |H|^2 = 1/(1+u^4): monotone in the cutoff
  const CUTOFFS = [
    20,
    100,
    500,
    1000,
    2000,
    4000,
    6000,
    8000,
    12000,
    16000,
    MAX_FREQUENCY,
  ];

  for (const sampleRate of SAMPLE_RATES) {
    const run = FAILS_UNTIL_TICKET_03.has(sampleRate) ? it.failing : it;

    run(`is finite and monotonic at ${sampleRate} Hz`, () => {
      // A fifth of the sample rate: under Nyquist everywhere, above the cutoff
      // at the bottom of the sweep and below it at the top, so the measured
      // magnitude has to climb the whole way.
      const probe = Math.round(0.2 * sampleRate);
      let previous = -Infinity;

      for (const cutoff of CUTOFFS) {
        const { amplitude } = measure(
          sampleRate,
          SvfType.LowPass,
          cutoff,
          Q,
          probe,
        );
        expect(Number.isFinite(amplitude)).toBe(true);
        expect(amplitude).toBeLessThan(1.1);
        expect(amplitude).toBeGreaterThan(previous - 1e-6);
        previous = amplitude;
      }
    });
  }
});

describe("recovery from a poisoned state", () => {
  // One non-finite sample - a disconnected node, a division in an upstream
  // graph - and the state is NaN forever, because NaN propagates through every
  // one of the five state updates. Ticket 05 adds the per-block check that
  // turns this from a dead node into a click.
  it.failing("comes back after a single Infinity at the input", () => {
    const filter = createFilter(48000);
    const frequency = new Float32Array(128).fill(1000);
    const poisoned = new Float32Array(128);
    poisoned[0] = Infinity;
    const output = new Float32Array(128);

    filter(poisoned, output, SvfType.LowPass, frequency, 0.7071);

    const clean = new Float32Array(128);
    for (let block = 0; block < 100; block++) {
      filter(clean, output, SvfType.LowPass, frequency, 0.7071);
    }

    expect(Array.from(output).every(Number.isFinite)).toBe(true);
  });
});
