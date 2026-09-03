import { blampResidual4, blepResidual4 } from "./_blep";
import { createPolyblepOscillator, PolyblepOscillatorType } from "./dsp";
import { PARAMS } from "./params";
import { aliasSnr, peak, render, RenderContext } from "./spectrum";

// What this package promises, as numbers.
//
// The snapshots in `worklet.test.ts` assert stability; this file asserts
// quality. Every floor below was measured against the code as it stands, at
// 44.1 kHz, rendered through `createPolyblepOscillator` into a `Float32Array`
// in 128-sample blocks with 8192 samples of warm-up discarded - the same
// figures the two harnesses in
// `thoughts/research/2026-09-03_polyblep-harness/` report, to the decimal.
// `spectrum.test.ts` is what keeps the metric itself honest.
//
// The floors were the 2-point PolyBLEP's until ticket 04 replaced the three
// per-waveform branches with one discontinuity scheduler and the 4-point
// kernels; they are now that implementation's, roughly 10 dB higher for the saw
// and square and 15-35 dB higher for the triangle. Every assertion here is
// one-sided on purpose: a waveform that gets *better* needs no edit, a waveform
// that gets worse fails.

const SAMPLE_RATE = 44100;

type Waveform = "sine" | "triangle" | "sawtooth" | "square";

const TYPE_OF: Record<Waveform, PolyblepOscillatorType> = {
  sine: PolyblepOscillatorType.Sine,
  triangle: PolyblepOscillatorType.Triangle,
  sawtooth: PolyblepOscillatorType.Sawtooth,
  square: PolyblepOscillatorType.Square,
};

const WAVEFORMS = Object.keys(TYPE_OF) as Waveform[];

/**
 * Alias SNR floors in dB: the measured 4-point figure minus 1.5 dB.
 *
 * | measured | 440 | 1000 | 2000 | 4000 | 8000 |
 * | saw      | 45.5 | 42.3 | 40.1 | 34.5 | 26.8 |
 * | square   | 46.8 | 43.2 | 45.1 | 43.8 | 26.6 |
 * | triangle | 80.7 | 70.2 | 67.0 | 60.6 | 36.2 |
 *
 * | measured | 1661 | 4186 | 7040 |
 * | triangle | 67.2 | 63.7 | 76.4 |
 *
 * The triangle carries three extra frequencies because they are the grid the
 * audit and `tri-harness.js` published for it; 1661 / 4186 / 7040 Hz are G#6,
 * C8 and A8. Above 7350 Hz its third harmonic folds and the figure drops off a
 * cliff - 33.4 dB at 7400 - which is why 8000 Hz reads 36.2 while 7040 reads
 * 76.4. Both are measurements of the same code.
 *
 * The 1.5 dB margin is a judgment call, not a measurement - it covers the
 * `Float32Array` output against the harnesses' `Float64` and small differences
 * in phase-accumulator bookkeeping. In practice the port reproduces
 * `order-harness.js`'s 4-point rows exactly, which `spectrum.test.ts` pins
 * two-sided.
 *
 * The sine is the exception to the convention. It has no discontinuity to
 * correct, so what `aliasSnr` reads for it is the `Float32Array`'s own
 * quantisation noise and not an alias floor at all: 95.6 dB at worst over a
 * sweep from 20 Hz to 11 kHz. A flat 90 dB is an honest regression net; a
 * per-frequency floor would be pinning rounding.
 */
export const ALIAS_FLOORS: Record<
  Waveform,
  Array<[f0: number, floorDb: number]>
> = {
  sine: [
    [440, 90],
    [1000, 90],
    [2000, 90],
    [4000, 90],
    [8000, 90],
  ],
  triangle: [
    [440, 79.2],
    [1000, 68.7],
    [1661, 65.7],
    [2000, 65.5],
    [4000, 59.1],
    [4186, 62.2],
    [7040, 74.9],
    [8000, 34.7],
  ],
  sawtooth: [
    [440, 44.0],
    [1000, 40.8],
    [2000, 38.6],
    [4000, 33.0],
    [8000, 25.3],
  ],
  square: [
    [440, 45.3],
    [1000, 41.7],
    [2000, 43.6],
    [4000, 42.3],
    [8000, 25.1],
  ],
};

/**
 * A band-limited waveform does not peak at 1.0, so an amplitude test needs
 * per-frequency bounds or a correct implementation fails it: every harmonic
 * above Nyquist is gone, and the ones that remain no longer add up to the
 * corner. The 4-point correction band-limits harder than the 2-point one did,
 * so several of these bounds are *lower* than ticket 02 recorded. That is the
 * correction working, not a regression - `ALIAS_FLOORS` is the other half of
 * the same trade and every one of those went up.
 */
const PEAK_MAX = 1.02;

/** The measured warm peak minus 0.02, against `PEAK_MAX` throughout. */
export const PEAK_BOUNDS: Record<
  Waveform,
  Array<[f0: number, min: number, max: number]>
> = {
  // measured 1.000 at every frequency: a sine needs no correction, so nothing
  // takes anything off its peak.
  sine: [
    [20, 0.98, PEAK_MAX],
    [55, 0.98, PEAK_MAX],
    [110, 0.98, PEAK_MAX],
    [440, 0.98, PEAK_MAX],
    [1000, 0.98, PEAK_MAX],
    [2000, 0.98, PEAK_MAX],
    [4000, 0.98, PEAK_MAX],
    [8000, 0.98, PEAK_MAX],
  ],
  // measured 0.999 0.998 0.995 0.981 0.958 0.930 0.823 0.702
  //
  // The first three rows are the headline of ticket 04. They were 0.201 / 0.524
  // / 0.795 - the 63 Hz DC blocker that followed the triangle's integrator,
  // dropping a 20 Hz triangle to a fifth of full scale. There is no integrator
  // and no blocker now: the corners are corrected directly with a BLAMP, and a
  // 20 Hz triangle peaks at 0.999.
  triangle: [
    [20, 0.979, PEAK_MAX],
    [55, 0.978, PEAK_MAX],
    [110, 0.975, PEAK_MAX],
    [440, 0.961, PEAK_MAX],
    [1000, 0.938, PEAK_MAX],
    [1661, 0.91, PEAK_MAX],
    [4186, 0.803, PEAK_MAX],
    [7040, 0.682, PEAK_MAX],
  ],
  // measured 0.998 0.995 0.991 0.966 0.927 0.863 0.748 0.554
  sawtooth: [
    [20, 0.978, PEAK_MAX],
    [55, 0.975, PEAK_MAX],
    [110, 0.971, PEAK_MAX],
    [440, 0.946, PEAK_MAX],
    [1000, 0.907, PEAK_MAX],
    [2000, 0.843, PEAK_MAX],
    [4000, 0.728, PEAK_MAX],
    [8000, 0.534, PEAK_MAX],
  ],
  // measured 1.000 everywhere up to 4186 Hz, then 0.994 at 7040 and 0.975 at
  // 8000. The square's two steps are symmetric and their corrections cancel at
  // the extremes - but only while the steps are far apart compared with the
  // kernel's support. At 8000 Hz they are 2.76 samples apart and the +/-2
  // sample corrections overlap, so the plateau stops reaching 1.
  square: [
    [20, 0.98, PEAK_MAX],
    [55, 0.98, PEAK_MAX],
    [110, 0.98, PEAK_MAX],
    [440, 0.98, PEAK_MAX],
    [1000, 0.98, PEAK_MAX],
    [2000, 0.98, PEAK_MAX],
    [4000, 0.98, PEAK_MAX],
    [8000, 0.955, PEAK_MAX],
    // 44100 / 20: an exact 20 samples per cycle, so the accumulated phase can
    // land on the double immediately below 0.5. See the overshoot test.
    [2205, 0.98, PEAK_MAX],
  ],
};

/**
 * What `width` costs, as numbers: the same two conventions as `ALIAS_FLOORS`
 * and `PEAK_BOUNDS` - measured minus 1.5 dB, measured minus 0.02 - applied to
 * the settings that only exist once `width` does.
 *
 * **Measured, 4-point, 44.1 kHz, DC removed for the pulse rows:**
 *
 * | pulse    | 440 | 1000 | 2000 | 4000 | 8000 |
 * | 25%      | 46.4 | 43.7 | 44.7 | 32.3 | 36.8 |
 * | 10%      | 42.6 | 37.4 | 36.8 | 39.4 | 36.8 |
 *
 * | triangle | 440 | 1661 | 4186 |
 * | w = 0.75 | 79.2 | 60.1 | 48.9 |
 * | w = 0.95 | 65.6 | 59.6 | 53.6 |
 *
 * **Why some cells beat `order-harness.js` and one is worse than the square.**
 * The harness places its corrections predictively and does not clamp the width;
 * `dsp.ts` clamps it to `[2|inc|, 1 - 2|inc|]` per sample. So a requested 10%
 * pulse *is* 10% at 440, 1000 and 2000 Hz - where these rows reproduce the
 * harness's `pulse4_10` to the decimal - and is an 18% pulse at 4000 Hz and a
 * 36% one at 8000, where the harness reads 27.2 and 19.1 dB and this reads 39.4
 * and 36.8. The aliasing stops getting worse because the pulse stops getting
 * narrower. For the same reason the triangle's `w = 0.75` row reproduces
 * `skew4_75` at all three frequencies - the clamp never binds there, which
 * makes it the row that pins this implementation to the harness - while
 * `w = 0.95` matches only at 440 Hz and is pulled back to 0.925 and 0.810 above
 * it.
 *
 * The 25% row is here because it is the setting the clamp does *not* rescue:
 * 32.3 dB at 4000 Hz is the worst cell in the table, worse than the 10% row at
 * the same frequency and 11.5 dB worse than the square. A pulse at an awkward
 * width genuinely aliases more than a square, and this is where that is
 * written down rather than left out of the grid.
 *
 * Against no correction at all, the skewed triangle measures 56.6 / 38.8 / 26.5
 * at `w = 0.75` and 44.4 / 28.4 / 13.7 at `w = 0.95` - worse than a naive
 * sawtooth at the top. Corner correction is not optional once the triangle can
 * be skewed.
 */
export const WIDTH_ALIAS_FLOORS: Array<{
  label: string;
  waveform: Waveform;
  width: number;
  /** A pulse's mean is signal, and bin 0 is a noise bin. See `aliasSnr`. */
  removeDC: boolean;
  floors: Array<[f0: number, floorDb: number]>;
}> = [
  {
    label: "a 25% pulse",
    waveform: "square",
    width: 0.25,
    removeDC: true,
    floors: [
      [440, 44.9],
      [1000, 42.2],
      [2000, 43.2],
      [4000, 30.8],
      [8000, 35.3],
    ],
  },
  {
    label: "a 10% pulse",
    waveform: "square",
    width: 0.1,
    removeDC: true,
    floors: [
      [440, 41.1],
      [1000, 35.9],
      [2000, 35.3],
      [4000, 37.9],
      [8000, 35.3],
    ],
  },
  {
    label: "a triangle skewed to 0.75",
    waveform: "triangle",
    width: 0.75,
    removeDC: false,
    floors: [
      [440, 77.7],
      [1661, 58.6],
      [4186, 47.4],
    ],
  },
  {
    label: "a triangle skewed to 0.95",
    waveform: "triangle",
    width: 0.95,
    removeDC: false,
    floors: [
      [440, 64.1],
      [1661, 58.1],
      [4186, 52.1],
    ],
  },
];

/**
 * The skewed triangle's peak, measured minus 0.02 against the shared
 * `PEAK_MAX`. Skewing costs almost nothing at the bottom - 0.9989 at 20 Hz
 * against the symmetric 0.9992 - and a little at the top, where the short ramp
 * is the one the band limit rounds off.
 *
 * measured, w = 0.75: 0.9990 0.9975 0.9951 0.9803 0.9553 0.9258 0.9106 0.8212
 *                     0.8129 0.6939 0.6562
 * measured, w = 0.95: 0.9989 0.9969 0.9939 0.9756 0.9443 0.9126 0.8974 0.8136
 *                     0.8062 0.6939 0.6562
 *
 * The pulse needs no such table: its two steps correct symmetrically, so it
 * measures 1.0000 everywhere the square does. `keeps a pulse at full scale` is
 * the assertion.
 */
const SKEWED_TRIANGLE_PEAK_BOUNDS: Array<{
  width: number;
  bounds: Array<[f0: number, min: number]>;
}> = [
  {
    width: 0.75,
    bounds: [
      [20, 0.979],
      [55, 0.977],
      [110, 0.975],
      [440, 0.96],
      [1000, 0.935],
      [1661, 0.905],
      [2000, 0.89],
      [4000, 0.801],
      [4186, 0.792],
      [7040, 0.673],
      [8000, 0.636],
    ],
  },
  {
    width: 0.95,
    bounds: [
      [20, 0.978],
      [55, 0.976],
      [110, 0.973],
      [440, 0.955],
      [1000, 0.924],
      [1661, 0.892],
      [2000, 0.877],
      [4000, 0.793],
      [4186, 0.786],
      [7040, 0.673],
      [8000, 0.636],
    ],
  },
];

const constant = (value: number) => new Float32Array([value]);

const oscillator =
  (type: number, width = 0.5, detune = 0) =>
  ({ f0, sampleRate }: RenderContext) => {
    const generate = createPolyblepOscillator(sampleRate);
    const frequency = constant(f0);
    const cents = constant(detune);
    const pulseWidth = constant(width);
    return (block: Float32Array) =>
      generate(block, type, frequency, cents, pulseWidth);
  };

/** The DC component. A pulse wave has one, and it is `2 * width - 1`. */
const mean = (signal: Float32Array) => {
  let total = 0;
  for (let i = 0; i < signal.length; i++) total += signal[i];
  return total / signal.length;
};

const declared = (name: string) => {
  const descriptor = PARAMS.find((param) => param.name === name);
  if (!descriptor) throw new Error(`no declared range for "${name}"`);
  return descriptor;
};

describe.each(WAVEFORMS)("the %s", (waveform) => {
  const type = TYPE_OF[waveform];

  it.each(ALIAS_FLOORS[waveform])(
    "stays above the alias floor at %i Hz (%d dB)",
    (f0, floorDb) => {
      const signal = render(oscillator(type), { f0, sampleRate: SAMPLE_RATE });
      expect(aliasSnr(signal, f0, SAMPLE_RATE)).toBeGreaterThan(floorDb);
    },
  );

  it.each(PEAK_BOUNDS[waveform])(
    "stays within the peak bounds at %i Hz",
    (f0, min, max) => {
      const signal = render(oscillator(type), { f0, sampleRate: SAMPLE_RATE });
      const measured = peak(signal);
      expect(measured).toBeGreaterThanOrEqual(min);
      expect(measured).toBeLessThanOrEqual(max);
    },
  );
});

describe.each(WIDTH_ALIAS_FLOORS)(
  "$label",
  ({ waveform, width, removeDC, floors }) => {
    it.each(floors)(
      "stays above the alias floor at %i Hz (%d dB)",
      (f0, floorDb) => {
        const signal = render(oscillator(TYPE_OF[waveform], width), {
          f0,
          sampleRate: SAMPLE_RATE,
        });
        expect(aliasSnr(signal, f0, SAMPLE_RATE, { removeDC })).toBeGreaterThan(
          floorDb,
        );
      },
    );
  },
);

describe.each(SKEWED_TRIANGLE_PEAK_BOUNDS)(
  "a triangle skewed to $width",
  ({ width, bounds }) => {
    it.each(bounds)("stays within the peak bounds at %i Hz", (f0, min) => {
      const measured = peak(
        render(oscillator(TYPE_OF.triangle, width), {
          f0,
          sampleRate: SAMPLE_RATE,
        }),
      );
      expect(measured).toBeGreaterThanOrEqual(min);
      expect(measured).toBeLessThanOrEqual(PEAK_MAX);
    });
  },
);

it("is finite over the whole declared range", () => {
  // The ranges come from PARAMS rather than from literals, so this follows the
  // declared surface when ticket 07 makes `frequency` bipolar.
  const type = declared("type");
  const frequency = declared("frequency");
  const detune = declared("detune");
  const width = declared("width");

  // `type` is an AudioParam too: the half-integers are the values a ramp
  // between two waveforms passes through, and `WAVEFORMS[1.5]` is `undefined`.
  const types = [type.minValue, 0.5, 1, 1.5, type.maxValue];
  const frequencies = [frequency.minValue, frequency.maxValue];
  const detunes = [detune.minValue, detune.defaultValue, detune.maxValue];
  // Both ends of `width` are outside what the DSP will actually use - it clamps
  // by `2 * |increment|` per sample - which is exactly why they belong here.
  const widths = [width.minValue, width.defaultValue, width.maxValue];
  // 8 kHz is where a lost increment clamp shows: 20 kHz there is 2.5 cycles per
  // sample. `worklet.ts` reads the global `sampleRate` at construction, so a
  // low-rate context is a real deployment, not a contrivance.
  const sampleRates = [8000, SAMPLE_RATE];

  const problems: unknown[] = [];
  for (const sampleRate of sampleRates)
    for (const waveformType of types)
      for (const f0 of frequencies)
        for (const cents of detunes)
          for (const pulseWidth of widths) {
            const settings = {
              sampleRate,
              type: waveformType,
              f0,
              detune: cents,
              width: pulseWidth,
            };
            const generate = createPolyblepOscillator(sampleRate);
            const block = new Float32Array(4096);

            generate(
              block,
              waveformType,
              constant(f0),
              constant(cents),
              constant(pulseWidth),
            );
            // A runaway phase stays finite while growing without bound, so
            // the bound is the assertion that catches it. This render starts
            // cold, and holds to the same bound as a warm one: the integrator
            // and DC blocker whose settling used to need a looser ceiling are
            // gone.
            if (!block.every(Number.isFinite) || peak(block) > PEAK_MAX)
              problems.push({ ...settings, at: "declared", peak: peak(block) });

            // ...and the same node still works afterwards. `frequency = 0`
            // used to leave `-Infinity` in the accumulator, and every later
            // block came out NaN for the life of the node.
            generate(
              block,
              waveformType,
              constant(440),
              constant(0),
              constant(0.5),
            );
            if (
              !block.every(Number.isFinite) ||
              peak(block) > PEAK_MAX ||
              !block.some((sample) => sample !== 0)
            )
              problems.push({ ...settings, at: "recovery", peak: peak(block) });
          }

  expect(problems).toEqual([]);
});

it("holds a constant at frequency 0", () => {
  // `connectParams` writes `param.value = 0` before connecting a node to a
  // param, so every oscillator with a modulated frequency reads 0 until its
  // source produces output. Zero frequency is defined as hold: increment 0, a
  // frozen phase, and the naive value of whatever waveform is selected. There
  // is no division to reach, because the one division in `dsp.ts` is guarded by
  // a boundary crossing that a zero increment can never produce.
  const held: Record<string, number> = {};
  for (const waveform of WAVEFORMS) {
    const generate = createPolyblepOscillator(SAMPLE_RATE);
    const block = new Float32Array(1024);
    generate(block, TYPE_OF[waveform], constant(0), constant(0), constant(0.5));

    expect(block.every(Number.isFinite)).toBe(true);
    expect(block.every((sample) => sample === block[0])).toBe(true);
    held[waveform] = block[0];
  }
  // Each waveform holds at its own phase-0 value, which is where a cold node
  // starts: the sine at its zero crossing, the triangle and saw at their
  // minimum, the square at the top of its first half cycle.
  expect(held).toEqual({ sine: 0, triangle: -1, sawtooth: -1, square: 1 });
});

/**
 * The frequencies the mirror identities are asserted at, and why they stop
 * below 11025.
 *
 * At `|f0| = sampleRate / 4` the increment is exactly +/-0.25 - `MAX_INC`, and a
 * power of two - so the accumulated phase lands *exactly* on 0 and exactly on
 * `width` every few samples. Those are the two measure-zero points where the
 * naive function's own branch tests (`phase < width`, and the wrap's
 * `phase >= 1`) put the boundary sample on one side going forwards and the
 * other going backwards, so the two renders stop being reflections of each
 * other: measured 2.0 there against 1e-12 everywhere else. Everything below is
 * a frequency whose increment is not a dyadic rational, which is every
 * frequency a musician will ever ask for.
 */
const MIRROR_HZ = [110, 440, 1000];

/** The measured worst mirror error is 2.1e-13; the ticket asks for 1e-6. */
const MIRROR_TOLERANCE = 1e-6;

const mirrored = (waveform: Waveform, width = 0.5) =>
  MIRROR_HZ.map((f0) => {
    const options = { f0, sampleRate: SAMPLE_RATE, length: 4096 };
    return {
      f0,
      forward: render(oscillator(TYPE_OF[waveform], width), options),
      backward: render(oscillator(TYPE_OF[waveform], width), {
        ...options,
        f0: -f0,
      }),
    };
  });

it("mirrors the sine at a negative frequency", () => {
  // A sine is odd, so reversing time negates it: `sin(2pi(1 - p))` is
  // `-sin(2pi p)` exactly. It has no discontinuity for the scheduler to
  // correct, which makes this the cleanest possible statement about the phase
  // itself - it passes only if the backward wrap sends -0.01 to 0.99 rather
  // than leaving it at -0.01, and it is insensitive to every correction sign in
  // the file. Measured worst error 2.1e-13.
  const problems: unknown[] = [];
  for (const { f0, forward, backward } of mirrored("sine")) {
    let worst = 0;
    for (let i = 0; i < forward.length; i++)
      worst = Math.max(worst, Math.abs(backward[i] + forward[i]));
    if (worst > MIRROR_TOLERANCE) problems.push({ f0, worst });
  }
  expect(problems).toEqual([]);
});

it("mirrors the symmetric triangle at a negative frequency", () => {
  // At `width = 0.5` the triangle is *even* about phase 0, so reversing time
  // leaves it alone. That makes it the test for the corner's sign: phase 0 is
  // the triangle's minimum, and a minimum in time stays a minimum however the
  // phase reaches it, so the backward branch's `-slope0 * corner` has to come
  // out with the *same* sign as the forward branch's `+slope0 * corner`. It
  // does, because `corner` carries the sign of `inc`. Get that wrong and the
  // corners are corrected the wrong way and this reads about 2.
  //
  // Measured error: exactly 0, not merely within tolerance. The naive function
  // is even in binary floating point at `w = 0.5`, the crossing instants are
  // the same set in both directions, and both corners keep their sign - so
  // there is nothing left to round differently.
  const problems: unknown[] = [];
  for (const { f0, forward, backward } of mirrored("triangle")) {
    let worst = 0;
    for (let i = 0; i < forward.length; i++)
      worst = Math.max(worst, Math.abs(backward[i] - forward[i]));
    if (worst > MIRROR_TOLERANCE) problems.push({ f0, worst });
  }
  expect(problems).toEqual([]);
});

it("mirrors the sawtooth and the square at a negative frequency", () => {
  // Both are odd about phase 0 at `width = 0.5` for the same reason the sine
  // is, and unlike the sine both are *stepped*: this is the test that pins the
  // backward wrap's step height to `-step0` rather than `+step0`. Measured
  // worst 3.0e-8 for the sawtooth - `Float32` epsilon at the one sample whose
  // phase lands nearest the wrap - and 3.3e-12 for the square.
  const problems: unknown[] = [];
  for (const waveform of ["sawtooth", "square"] as Waveform[])
    for (const { f0, forward, backward } of mirrored(waveform)) {
      let worst = 0;
      for (let i = 0; i < forward.length; i++)
        worst = Math.max(worst, Math.abs(backward[i] + forward[i]));
      if (worst > MIRROR_TOLERANCE) problems.push({ waveform, f0, worst });
    }
  expect(problems).toEqual([]);
});

it("holds the alias floor at a negative frequency", () => {
  // **This is the test that makes the two-sided wrap load-bearing.** Ticket 02
  // found that reverting `phase -= Math.floor(phase)` to a one-sided
  // `if (phase >= 1) phase -= 1` failed zero tests, because under a positive
  // clamped increment the two forms agree for every reachable input, and
  // predicted that the wrap "becomes independently load-bearing in ticket 07".
  // It does, twice over:
  //
  // - Delete the `else if (phase < 0)` branch and the phase marches to -N
  //   without ever wrapping. `2 * phase - 1` marches with it, and the peak
  //   bound below fails by a factor of hundreds rather than by a hair.
  // - Keep the wrap but drop the negated step height, and the wrap is no longer
  //   band-limited: the alias floor fails by tens of dB.
  //
  // The floors and bounds are `ALIAS_FLOORS` and `PEAK_BOUNDS` themselves, at
  // `|f0|`. Measured, a negative-frequency render reproduces the positive
  // figures *to the decimal* in every cell of both tables, so reusing them is
  // both the strongest available assertion and the one that cannot drift from
  // what the positive side promises. `aliasSnr` needs a positive `f0`, which is
  // right: a backward-running waveform's harmonics are at `|f0|`.
  const problems: unknown[] = [];
  const floorAt = (waveform: Waveform, f0: number) =>
    ALIAS_FLOORS[waveform].find(([hz]) => hz === f0)![1];
  const peakAt = (waveform: Waveform, f0: number) =>
    PEAK_BOUNDS[waveform].find(([hz]) => hz === f0)!;

  for (const waveform of ["sawtooth", "square"] as Waveform[])
    for (const f0 of [440, 1000, 4000]) {
      const signal = render(oscillator(TYPE_OF[waveform]), {
        f0: -f0,
        sampleRate: SAMPLE_RATE,
      });
      const snr = aliasSnr(signal, f0, SAMPLE_RATE);
      const measured = peak(signal);
      const [, min, max] = peakAt(waveform, f0);
      if (snr <= floorAt(waveform, f0))
        problems.push({ waveform, f0, snr, floor: floorAt(waveform, f0) });
      if (measured < min || measured > max)
        problems.push({ waveform, f0, peak: measured, min, max });
    }

  expect(problems).toEqual([]);
});

/**
 * How much more a sweep's largest first difference may be than the same
 * waveform's at a steady 2000 Hz.
 *
 * Measured, only the sawtooth exceeds its steady figure at all, by 0.0601
 * (1.1674 against 1.1072) - the sweep visits every increment between +2000 and
 * -2000 Hz and so visits edge placements a steady render never lands on. Every
 * other waveform's sweep is at or below its own steady reference.
 */
const SWEEP_MARGIN = 0.1;

it("survives a sweep through zero", () => {
  // A full-length a-rate `frequency` array ramping linearly from +2000 to -2000
  // across the block, so the phase decelerates, stops and reverses - and does
  // it at a-rate, one value per sample, with no smoothing. Measured worst peak
  // over this grid: 1.0000.
  const length = 4096;
  const problems: unknown[] = [];

  for (const waveform of WAVEFORMS)
    for (const width of [0.1, 0.5, 0.9]) {
      const sweep = new Float32Array(length);
      for (let i = 0; i < length; i++)
        sweep[i] = 2000 - (4000 * i) / (length - 1);

      const generate = createPolyblepOscillator(SAMPLE_RATE);
      const block = new Float32Array(length);
      generate(
        block,
        TYPE_OF[waveform],
        sweep,
        new Float32Array(length),
        new Float32Array(length).fill(width),
      );

      const steady = render(oscillator(TYPE_OF[waveform], width), {
        f0: 2000,
        sampleRate: SAMPLE_RATE,
        length,
      });

      if (!block.every(Number.isFinite) || peak(block) > 1.05)
        problems.push({ waveform, width, peak: peak(block), at: "range" });
      const step = maxAbsoluteDifference(block);
      const reference = maxAbsoluteDifference(steady);
      if (step > reference + SWEEP_MARGIN)
        problems.push({ waveform, width, step, reference, at: "step" });
    }

  expect(problems).toEqual([]);
});

it("survives audio-rate FM through zero", () => {
  // `200 + 3000 * sin(2pi * 220 * i / sampleRate)`: a 220 Hz modulator three
  // times deeper than the carrier, so the frequency crosses zero twice per
  // modulator cycle - 440 sign changes a second, each one a phase reversal
  // inside a render quantum. This is the input the scheduler was designed for
  // and the reason it writes corrections *backwards* rather than predicting
  // where they will land: under FM this fast the increment has changed by the
  // time a predicted correction arrives. Measured worst peak: 1.0000.
  const length = 4096;
  const problems: unknown[] = [];

  const modulated = new Float32Array(length);
  for (let i = 0; i < length; i++)
    modulated[i] = 200 + 3000 * Math.sin((2 * Math.PI * 220 * i) / SAMPLE_RATE);

  for (const waveform of WAVEFORMS)
    for (const width of [0.1, 0.5]) {
      const generate = createPolyblepOscillator(SAMPLE_RATE);
      const block = new Float32Array(length);
      generate(
        block,
        TYPE_OF[waveform],
        modulated,
        new Float32Array(length),
        new Float32Array(length).fill(width),
      );
      if (!block.every(Number.isFinite) || peak(block) > 1.05)
        problems.push({
          waveform,
          width,
          peak: peak(block),
          finite: block.every(Number.isFinite),
        });
    }

  expect(problems).toEqual([]);
});

it("still holds at frequency 0", () => {
  // The zero-hold behaviour is unchanged by the widened range - and `-0` is now
  // a value the clamp can tell apart, since it has a negative branch. Both
  // resolve to a `+0` increment, so both hold, and they hold the same constant
  // as each other and as `holds a constant at frequency 0` above.
  //
  // This is also the state a modulated oscillator *starts* in: `connectParams`
  // writes `param.value = 0` before connecting, so every oscillator whose
  // frequency is a node sits here until the modulator's first sample arrives.
  // That first sample may be negative, which is the path the backward wrap's
  // degenerate-age guard exists for - so the recovery half below is not a
  // formality.
  const problems: unknown[] = [];
  for (const zero of [0, -0])
    for (const waveform of WAVEFORMS) {
      const generate = createPolyblepOscillator(SAMPLE_RATE);
      const block = new Float32Array(1024);
      generate(
        block,
        TYPE_OF[waveform],
        constant(zero),
        constant(0),
        constant(0.5),
      );
      if (
        !block.every(Number.isFinite) ||
        !block.every((sample) => sample === block[0])
      )
        problems.push({ waveform, zero: Object.is(zero, -0) ? "-0" : "0" });

      // ...and it comes off the hold going backwards without a spike.
      generate(
        block,
        TYPE_OF[waveform],
        constant(-440),
        constant(0),
        constant(0.5),
      );
      if (!block.every(Number.isFinite) || peak(block) > PEAK_MAX)
        problems.push({
          waveform,
          zero: Object.is(zero, -0) ? "-0" : "0",
          at: "recovery",
          peak: peak(block),
        });
    }

  expect(problems).toEqual([]);
});

it("matches k-rate for a constant a-rate input", () => {
  // A length-1 array is what a k-rate `AudioParam` delivers and a length-128
  // one is what an a-rate one delivers. Holding the same value, the two must be
  // bit-identical, or every automation that happens to be flat sounds different
  // from the same value typed in.
  const quantum = 128;
  for (const waveform of WAVEFORMS) {
    const kRate = createPolyblepOscillator(SAMPLE_RATE);
    const aRate = createPolyblepOscillator(SAMPLE_RATE);
    const kBlock = new Float32Array(quantum);
    const aBlock = new Float32Array(quantum);
    const frequency = new Float32Array(quantum).fill(440);
    const detune = new Float32Array(quantum).fill(7);
    const width = new Float32Array(quantum).fill(0.3);

    for (let block = 0; block < 8; block++) {
      kRate(
        kBlock,
        TYPE_OF[waveform],
        constant(440),
        constant(7),
        constant(0.3),
      );
      aRate(aBlock, TYPE_OF[waveform], frequency, detune, width);
      expect(Array.from(aBlock)).toEqual(Array.from(kBlock));
    }
  }
});

it("is independent of block size", () => {
  // The phase, the four-slot pending ring and its write index all carry across
  // calls; nothing may depend on where the block boundaries fall. This is the
  // test that fails if the ring is not carried across render quanta - the whole
  // reason the 4-point kernel needs one.
  const length = 4096;
  const shapes: Array<{ blockSize: number; aRate: boolean }> = [
    { blockSize: length, aRate: false },
    { blockSize: length, aRate: true },
    { blockSize: 128, aRate: false },
    { blockSize: 128, aRate: true },
  ];

  for (const waveform of WAVEFORMS) {
    const renders = shapes.map(({ blockSize, aRate }) => {
      const generate = createPolyblepOscillator(SAMPLE_RATE);
      const signal = new Float32Array(length);
      const block = new Float32Array(blockSize);
      const frequency = aRate
        ? new Float32Array(blockSize).fill(440)
        : constant(440);
      const detune = aRate ? new Float32Array(blockSize).fill(0) : constant(0);
      // 0.2 rather than the default, so the carry is exercised with the width
      // edge somewhere other than the middle of the cycle.
      const width = aRate
        ? new Float32Array(blockSize).fill(0.2)
        : constant(0.2);

      for (let produced = 0; produced < length; produced += blockSize) {
        generate(block, TYPE_OF[waveform], frequency, detune, width);
        signal.set(
          block.subarray(0, Math.min(blockSize, length - produced)),
          produced,
        );
      }
      return Array.from(signal);
    });

    for (const rendered of renders) expect(rendered).toEqual(renders[0]);
  }
});

/**
 * The largest sample-to-sample change a *unit* 4-point band-limited step can
 * make, found by sweeping the sub-sample offset over `[0, 1)`: 0.599, at
 * exactly half a sample. It bounds what a `type` change is allowed to add,
 * because a type change is one step and nothing else. Measured worst case at
 * the parameters below is 0.521.
 */
const TYPE_SWITCH_MARGIN = 0.6;

const maxAbsoluteDifference = (signal: Float32Array) => {
  let largest = 0;
  for (let i = 1; i < signal.length; i++) {
    const difference = Math.abs(signal[i] - signal[i - 1]);
    if (difference > largest) largest = difference;
  }
  return largest;
};

it("does not click when the type changes", () => {
  // `type` is k-rate, so it changes at a block boundary - and a change is a
  // discontinuity like any other: a step of `naive_new(phase) -
  // naive_old(phase)`, scheduled through the same primitive. Without it,
  // switching waveform mid-note steps the output audibly, which is what audit
  // finding C10's stale-state note was groping towards.
  const f0 = 440;
  const length = 512;
  const at = 256;

  const whole = (type: number) => {
    const generate = createPolyblepOscillator(SAMPLE_RATE);
    const signal = new Float32Array(length);
    generate(signal, type, constant(f0), constant(0), constant(0.5));
    return signal;
  };

  const switched = (from: number, to: number) => {
    const generate = createPolyblepOscillator(SAMPLE_RATE);
    const signal = new Float32Array(length);
    const first = new Float32Array(at);
    const second = new Float32Array(length - at);
    generate(first, from, constant(f0), constant(0), constant(0.5));
    generate(second, to, constant(f0), constant(0), constant(0.5));
    signal.set(first, 0);
    signal.set(second, at);
    return signal;
  };

  // The same two renders spliced together with no correction at the seam: the
  // signal the scheduler is supposed to improve on.
  const spliced = (from: number, to: number) => {
    const signal = new Float32Array(length);
    signal.set(whole(from).subarray(0, at), 0);
    signal.set(whole(to).subarray(at), at);
    return signal;
  };

  const problems: unknown[] = [];
  for (const from of WAVEFORMS)
    for (const to of WAVEFORMS) {
      if (from === to) continue;
      const step = maxAbsoluteDifference(switched(TYPE_OF[from], TYPE_OF[to]));
      const uncorrected = maxAbsoluteDifference(
        spliced(TYPE_OF[from], TYPE_OF[to]),
      );
      const ownEdges = Math.max(
        maxAbsoluteDifference(whole(TYPE_OF[from])),
        maxAbsoluteDifference(whole(TYPE_OF[to])),
      );

      if (step > ownEdges + TYPE_SWITCH_MARGIN)
        problems.push({ from, to, step, ownEdges, at: "margin" });
      // ...and correcting the seam never makes it worse than not correcting it.
      // It halves it where the switch is the loudest event in the render.
      if (step > uncorrected + 1e-9)
        problems.push({ from, to, step, uncorrected, at: "uncorrected" });
    }

  expect(problems).toEqual([]);
});

/** 44100 / 60, / 30, / 20 and / 12: an exact integer of samples per cycle. */
const EXACT_HALF_CYCLE_HZ = [735, 1470, 2205, 3675];

it("does not overshoot where the half cycle lands on 0.5", () => {
  // At these increments the accumulated phase reaches the double immediately
  // below 0.5, where the old `(phase + 0.5) % 1` rounded up to 1.0 and wrapped
  // to 0: the rising edge's correction applied with the falling edge's sign, a
  // -2 sample on a +/-1 square. The scheduler never adds half a cycle to a
  // phase - it notices the crossing with an edge flag instead - so the rounding
  // disagreement cannot be expressed. It was a cold-start event, measured at
  // sample index 10, so this renders from zero rather than from a settled
  // state.
  const problems: unknown[] = [];
  for (const waveform of WAVEFORMS)
    for (const f0 of EXACT_HALF_CYCLE_HZ) {
      const signal = render(oscillator(TYPE_OF[waveform]), {
        f0,
        sampleRate: SAMPLE_RATE,
        length: 4096,
        warmup: 0,
      });
      if (peak(signal) > PEAK_MAX)
        problems.push({ waveform, f0, peak: peak(signal) });
    }
  expect(problems).toEqual([]);
});

it("keeps a pulse at full scale", () => {
  // A pulse's two steps correct symmetrically and their corrections cancel over
  // the plateau, so unlike the sawtooth - whose single step drags its peak to
  // 0.534 at 8 kHz - a pulse stays at full scale however narrow it gets.
  // Measured 1.00000 in every cell below.
  const problems: unknown[] = [];
  for (const width of [0.5, 0.25, 0.1])
    for (const f0 of [110, 440, 1000, 2000, 4000]) {
      const measured = peak(
        render(oscillator(TYPE_OF.square, width), {
          f0,
          sampleRate: SAMPLE_RATE,
        }),
      );
      if (measured < 0.98 || measured > PEAK_MAX)
        problems.push({ width, f0, peak: measured });
    }
  expect(problems).toEqual([]);
});

it("has the DC a pulse should have", () => {
  // `2 * width - 1` by construction. That is correct behaviour and not an
  // offset to filter out (audit F2) - it is the reason every pulse row in
  // `WIDTH_ALIAS_FLOORS` is measured with `removeDC`, since bin 0 is a noise
  // bin and a 0.3 offset alone costs the sawtooth 31 dB.
  const problems: unknown[] = [];
  for (const f0 of [440, 1000])
    for (const width of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      const measured = mean(
        render(oscillator(TYPE_OF.square, width), {
          f0,
          sampleRate: SAMPLE_RATE,
        }),
      );
      if (Math.abs(measured - (2 * width - 1)) > 0.01)
        problems.push({ f0, width, measured, expected: 2 * width - 1 });
    }
  expect(problems).toEqual([]);

  // ...and the clamp is audible in it. At 4000 Hz `2 * inc` is 0.1814, so a
  // requested 10% pulse is an 18% one, and its mean is the clamp's receipt.
  const clamped = (2 * 4000) / SAMPLE_RATE;
  expect(
    mean(
      render(oscillator(TYPE_OF.square, 0.1), {
        f0: 4000,
        sampleRate: SAMPLE_RATE,
      }),
    ),
  ).toBeCloseTo(2 * clamped - 1, 2);
});

it("survives width at both extremes", () => {
  // Both ends of the declared range are outside what the DSP will use: it
  // clamps to `[2|inc|, 1 - 2|inc|]`, floored by `MIN_WIDTH`. `frequency = 0` is
  // the case that floor exists for - the `2|inc|` term is zero there, and the
  // triangle divides by `width` and by `1 - width`.
  const width = declared("width");
  const problems: unknown[] = [];

  for (const waveform of WAVEFORMS)
    for (const f0 of [0, 20, 440])
      for (const requested of [width.minValue, width.maxValue]) {
        const generate = createPolyblepOscillator(SAMPLE_RATE);
        const block = new Float32Array(4096);
        generate(
          block,
          TYPE_OF[waveform],
          constant(f0),
          constant(0),
          constant(requested),
        );
        if (!block.every(Number.isFinite) || peak(block) > 1.05)
          problems.push({
            waveform,
            f0,
            width: requested,
            peak: peak(block),
            finite: block.every(Number.isFinite),
          });
      }

  expect(problems).toEqual([]);
});

it("survives width modulated at a-rate", () => {
  // A full-length `width` array sweeping 0 to 1 across the block, which drags
  // the edge across the whole cycle - forwards through it at the bottom of the
  // sweep and backwards through it at the top, since the width overtakes a
  // slow phase. Measured worst peak over this grid: 1.0000.
  const problems: unknown[] = [];

  for (const waveform of WAVEFORMS)
    for (const f0 of [0, 20, 110, 440, 1000, 2000, 4000, 8000, 11025, 20000])
      for (const length of [128, 512, 4096]) {
        const generate = createPolyblepOscillator(SAMPLE_RATE);
        const block = new Float32Array(length);
        const width = new Float32Array(length);
        for (let i = 0; i < length; i++) width[i] = i / (length - 1);
        generate(
          block,
          TYPE_OF[waveform],
          new Float32Array(length).fill(f0),
          new Float32Array(length),
          width,
        );
        if (!block.every(Number.isFinite) || peak(block) > 1.05)
          problems.push({ waveform, f0, length, peak: peak(block) });
      }

  expect(problems).toEqual([]);
});

/**
 * What a `width` driven at Nyquist is allowed to reach. Measured worst: 1.281.
 *
 * Every flip of the edge flag schedules a corner the naive signal really has,
 * and when `width` changes every sample the flips can land inside the kernel's
 * +/-2-sample support and add. It is bounded rather than divergent, and the
 * bound comes from the width clamp: at `w = 2|inc|` the per-sample corner is
 * `1 + 2|inc| <= 1.5`, so one corner contributes at most `1.5 * 7/30 = 0.35`.
 *
 * The alternative is to smooth `width` the way Stages' `ParameterInterpolator`
 * does, and this package's position is that an a-rate parameter is read per
 * sample. Every input the ticket names - both extremes, a sweep across a block
 * - peaks at exactly 1.0000 and is asserted at 1.05 above.
 */
const WIDTH_NOISE_MAX = 1.35;

it("stays bounded when width is driven at Nyquist", () => {
  const problems: unknown[] = [];

  // A deterministic LCG rather than `Math.random`, so a failure is reproducible.
  let seed = 7919;
  const random = () =>
    (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

  for (const waveform of WAVEFORMS)
    for (const f0 of [0, 20, 440, 4000, 11025]) {
      const patterns: Array<[string, (i: number) => number]> = [
        ["noise", () => random()],
        // ...and the worst square wave: 0 and 1 alternating every `period`
        // samples, which flips the edge as often as a signal can.
        ["alternating", (i) => (i % 2 ? 0 : 1)],
        ["alternating/3", (i) => (Math.floor(i / 3) % 2 ? 0 : 1)],
      ];

      for (const [label, at] of patterns) {
        const length = 4096;
        const generate = createPolyblepOscillator(SAMPLE_RATE);
        const block = new Float32Array(length);
        const width = new Float32Array(length);
        for (let i = 0; i < length; i++) width[i] = at(i);
        generate(
          block,
          TYPE_OF[waveform],
          new Float32Array(length).fill(f0),
          new Float32Array(length),
          width,
        );
        if (!block.every(Number.isFinite) || peak(block) > WIDTH_NOISE_MAX)
          problems.push({
            waveform,
            f0,
            pattern: label,
            peak: peak(block),
            finite: block.every(Number.isFinite),
          });
      }
    }

  expect(problems).toEqual([]);
});

/**
 * The largest sample-to-sample change a band-limited step of *height 2* can
 * make: `TYPE_SWITCH_MARGIN`'s 0.599 for a unit step, doubled. The square's own
 * edges already reach it - measured 1.1979 at 440 Hz - so this is not a margin
 * around a measurement, it is one edge.
 */
const ONE_EDGE_MAX = 1.2;

it("does not double-correct a moving pulse edge", () => {
  // The output lags the parameters by two samples, so an edge detected on
  // sample `i` happened at `i - d` and belongs partly to the *previous*
  // sample's width - the same hazard `prevWave` exists for on the `type` side,
  // where correcting one edge with both waveforms produced a jump of 1.833 on a
  // signal whose own edge is 0.917.
  //
  // `dsp.ts` answers it in the divisor: the edge's age is measured against
  // `inc - deltaWidth`, the speed at which `phase - width` is closing, and the
  // sign of the correction follows which way the flag flipped. Measured over
  // the grid below the worst change is 1.1979, and the same width steps spliced
  // with no correction at the seam measure 2.0000 - so the scheduler halves the
  // seam rather than doubling it.
  //
  // The square only. A width step on a *triangle* is a genuine step in the
  // naive signal - `naive(phase, width)` depends on the width at a fixed phase
  // - of up to 2.0, and this ticket does not correct a parameter step:
  // measured, the corrected render and a naive-only render of the same width
  // step agree to within 0.16.
  const widths = [0.001, 0.05, 0.2, 0.5, 0.8, 0.95, 0.999];
  const length = 256;
  const problems: unknown[] = [];

  for (const f0 of [110, 440, 2000])
    for (const from of widths)
      for (const to of widths) {
        if (from === to) continue;
        for (let at = 8; at < 136; at++) {
          const generate = createPolyblepOscillator(SAMPLE_RATE);
          const block = new Float32Array(length);
          const width = new Float32Array(length);
          for (let i = 0; i < length; i++) width[i] = i < at ? from : to;
          generate(
            block,
            TYPE_OF.square,
            new Float32Array(length).fill(f0),
            new Float32Array(length),
            width,
          );
          const step = maxAbsoluteDifference(block);
          if (step > ONE_EDGE_MAX) problems.push({ f0, from, to, at, step });
        }
      }

  expect(problems).toEqual([]);
});

// ---------------------------------------------------------------------------
// Hard sync, and the phase it resets to
// ---------------------------------------------------------------------------

/**
 * What a render driven by a master oscillator's gate is allowed to reach.
 *
 * Measured worst 1.0037 over 432 settings - 4 master frequencies, 4 waveforms,
 * 9 slave frequencies including negative ones, 3 widths - and 1.0027 over the
 * 288-setting non-integer-master grid below. `1.05` is the ticket's number and
 * there is 4.6% of headroom under it.
 *
 * The comparison worth recording is against the same file with the reset done
 * in **one** advance instead of two, which is how the ticket's checklist reads
 * if taken literally: that peaks at **2.6190** over the same grid, and at
 * 2.0000 with no negative frequency in it at all. See `dsp.ts`'s header.
 */
const SYNC_PEAK_MAX = 1.05;

/**
 * What a reset arriving every few samples is allowed to reach. Measured worst
 * **1.1667** (sawtooth, a reset every 5 samples, `f0 = -11025`, `width = 0.1`)
 * over 672 settings, and 1.0875 for a gate driven by white noise.
 *
 * Ticket 05 needed `WIDTH_NOISE_MAX = 1.35` for the same shape of input,
 * because a `width` flipping at Nyquist moves a +/-1 edge every sample and the
 * flips bunch inside the kernel's +/-2-sample support. A *reset* cannot do
 * that, and the reason is worth writing down: the faster resets arrive, the
 * less the phase has moved between them, so the step height shrinks with the
 * reset period. The corrections do bunch - they are what pushes 1.0000 to
 * 1.1667 - but what bunches gets smaller as it gets more frequent.
 */
const FAST_SYNC_MAX = 1.25;

/**
 * Drive the generator with a `sync` gate, in render-quantum blocks.
 *
 * `spectrum.ts`'s `render` cannot do this: its generator closure takes a block
 * and nothing else, and a gate is a second array that has to be sliced in step
 * with it.
 */
const renderSynced = ({
  type,
  f0,
  gate,
  width = 0.5,
  phase,
  blockSize = 128,
}: {
  type: number;
  f0: number;
  gate: Float32Array;
  width?: number;
  phase?: number | "random";
  blockSize?: number;
}) => {
  const generate = createPolyblepOscillator(SAMPLE_RATE, phase);
  const signal = new Float32Array(gate.length);
  const block = new Float32Array(blockSize);
  const frequency = new Float32Array(blockSize).fill(f0);
  const detune = new Float32Array(blockSize);
  const pulseWidth = new Float32Array(blockSize).fill(width);
  for (let at = 0; at < gate.length; at += blockSize) {
    generate(
      block,
      type,
      frequency,
      detune,
      pulseWidth,
      gate.subarray(at, at + blockSize),
    );
    signal.set(block.subarray(0, Math.min(blockSize, gate.length - at)), at);
  }
  return signal;
};

/** A master sawtooth: one rising zero crossing per cycle, at a sub-sample instant. */
const masterGate = (length: number, fm: number) => {
  const gate = new Float32Array(length);
  const inc = fm / SAMPLE_RATE;
  let p = 0;
  for (let i = 0; i < length; i++) {
    p += inc;
    if (p >= 1) p -= 1;
    gate[i] = 2 * p - 1;
  }
  return gate;
};

/** A one-sample pulse every `period` samples: an exact integer-sample reset. */
const pulseGate = (length: number, period: number) => {
  const gate = new Float32Array(length);
  for (let i = 0; i < length; i += period) gate[i] = 1;
  return gate;
};

/**
 * A gate that crosses zero `d` of the way *back* from sample `at`, by holding
 * `-(1 - d)` and then `d`: the crossing lies at `1 - d` of the way from
 * `at - 1` to `at`, so the reset is `d` samples old when sample `at` is
 * computed. `d = 1` is the `0 -> 1` step a `setValueAtTime` gate makes, and the
 * age it produces is the one the residual cannot express - see `crossingAge`.
 */
const rampGate = (length: number, at: number, d: number) => {
  const gate = new Float32Array(length);
  for (let i = 0; i < length; i++) gate[i] = i < at ? -(1 - d) : d;
  return gate;
};

/**
 * How many *runs* of consecutive large first differences a signal has - one
 * band-limited step spans about four samples, so counting samples would count
 * one discontinuity several times.
 */
const discontinuityRuns = (signal: Float32Array, threshold: number) => {
  let runs = 0;
  let inRun = false;
  for (let i = 1; i < signal.length; i++) {
    const large = Math.abs(signal[i] - signal[i - 1]) > threshold;
    if (large && !inRun) runs++;
    inRun = large;
  }
  return runs;
};

/** The naive sawtooth, for the sub-sample assertions. `2 * phase - 1`, wrapped. */
const naiveSaw = (phase: number) => 2 * (phase - Math.floor(phase)) - 1;

/** The 16 crossing fractions, and the age each one really produces. */
const FRACTIONS = Array.from({ length: 16 }, (_, k) => {
  const d = (k + 1) / 16;
  // `d = 1` means `g- = 0`: the crossing interpolates to the previous sample,
  // an age of exactly 1, which `crossingAge` reads as 0. It is in the sweep
  // *because* it is the reachable degenerate case, not despite it.
  return { d, age: d < 1 ? d : 0 };
});

it("resets the phase on a rising edge", () => {
  // Kleimola & Valimaki's rule 2, as a number. The phase restarts at
  // `phaseStart` *at the crossing instant*, so by the time sample `i` is
  // emitted it has already run on `age * inc`; the emitted sample is that naive
  // value plus the reset's own correction, `height * blepResidual4(age)`. Rule
  // 1 is the `height` in that expression - the actual discontinuity at this
  // reset, not the fixed jump of 2 a plain sawtooth wraps by.
  //
  // `at` is chosen so the slave sits near phase 0.5 when the reset arrives, a
  // half cycle from its own wrap, so the reset is the only discontinuity inside
  // the kernel's +/-2 samples and the identity is exact rather than
  // approximate. Measured worst deviation 2.0e-3 at 440 Hz and 4.6e-3 at
  // 1000 Hz, which is `Float32` epsilon plus what the far wrap still leaks.
  //
  // The gate rise at index `at` lands on the sample emitted at `at + 2`: the
  // output lags the input by the two samples the 4-point kernel buys.
  const problems: unknown[] = [];
  for (const [f0, at] of [
    [440, 348],
    [1000, 100],
  ] as const) {
    const inc = f0 / SAMPLE_RATE;
    for (const { d, age } of FRACTIONS) {
      const signal = renderSynced({
        type: TYPE_OF.sawtooth,
        f0,
        gate: rampGate(512, at, d),
        phase: 0,
      });
      const from = (at + 2 - age) * inc;
      const height = naiveSaw(age * inc) - naiveSaw(from);
      const expected = naiveSaw(age * inc) + height * blepResidual4(age);
      const measured = signal[at + 2];
      if (Math.abs(measured - expected) > 0.01)
        problems.push({ f0, d, measured, expected, height });
    }
  }
  expect(problems).toEqual([]);
});

/**
 * The naive functions and their phase derivatives, restated.
 *
 * `dsp.ts` does not export `WAVEFORMS`, and it should not: a test that borrowed
 * the implementation's own table could not catch that table being wrong. These
 * are the four shapes as the package documents them, written out again.
 */
type Shape = {
  naive: (phase: number, width: number) => number;
  slope: (phase: number, width: number) => number;
};

const SHAPES: Record<Waveform, Shape> = {
  sine: {
    naive: (phase: number) => Math.sin(2 * Math.PI * phase),
    slope: (phase: number) => 2 * Math.PI * Math.cos(2 * Math.PI * phase),
  },
  triangle: {
    naive: (phase: number, width: number) =>
      phase < width
        ? (2 * phase) / width - 1
        : (1 + width - 2 * phase) / (1 - width),
    slope: (phase: number, width: number) =>
      phase < width ? 2 / width : -2 / (1 - width),
  },
  sawtooth: { naive: naiveSaw, slope: () => 2 },
  square: {
    naive: (phase: number, width: number) => (phase < width ? 1 : -1),
    slope: () => 0,
  },
};

it("emits a corner as well as a step where the waveform has one", () => {
  // Success criterion 2, and Brandt's section 6.3 handled rather than avoided.
  // A hard-synced triangle is not C1-continuous: the reset produces a *corner*
  // as well as a step, so a band-limited step alone does not correct it. The
  // audit read that as a reason to ship sync for the saw and square first;
  // `addDiscontinuity` takes a step height and a slope change in the same call,
  // so it is the same line of code and it ships here.
  //
  // The assertion is comparative, which is what makes it about the corner
  // rather than about a tolerance: predict the sample two ways, with the BLAMP
  // term and without it, and require the full prediction to be at least twice
  // as close. Measured ratios 0.22 to 0.26 - the full prediction is four times
  // closer - against a slope change of 0.36 to 0.88 per sample.
  //
  // The settings put the reset on the triangle's *falling* branch and restart
  // it on the rising one, which is where the corner is largest; at `width` 0.5
  // it is `8 * inc`, the same magnitude `corner` carries for the fixed
  // discontinuities.
  const problems: unknown[] = [];

  for (const waveform of ["triangle", "sine"] as const)
    for (const [f0, at, width] of [
      [2000, 100, 0.5],
      [4000, 50, 0.5],
      [2000, 103, 0.25],
    ] as const) {
      const { naive, slope } = SHAPES[waveform];
      const inc = f0 / SAMPLE_RATE;
      let worstFull = 0;
      let worstStepOnly = 0;
      let largestCorner = 0;

      for (const { d, age } of FRACTIONS) {
        const signal = renderSynced({
          type: TYPE_OF[waveform],
          f0,
          gate: rampGate(512, at, d),
          width,
          phase: 0,
        });
        const raw = (at + 2 - age) * inc;
        const from = raw - Math.floor(raw);
        const to = age * inc;
        const height = naive(to, width) - naive(from, width);
        const cornerChange = (slope(to, width) - slope(from, width)) * inc;
        largestCorner = Math.max(largestCorner, Math.abs(cornerChange));

        const stepOnly = naive(to, width) + height * blepResidual4(age);
        const full = stepOnly + cornerChange * blampResidual4(age);
        worstFull = Math.max(worstFull, Math.abs(signal[at + 2] - full));
        worstStepOnly = Math.max(
          worstStepOnly,
          Math.abs(signal[at + 2] - stepOnly),
        );
      }

      // The grid has to actually contain a corner, or the comparison is vacuous.
      if (largestCorner < 0.3)
        problems.push({ waveform, f0, width, largestCorner, at: "vacuous" });
      if (worstFull > 0.5 * worstStepOnly)
        problems.push({ waveform, f0, width, worstFull, worstStepOnly });
    }

  // ...and the sawtooth and the square have no corner to emit: their slope is
  // the same on both sides of any reset, so the step alone is the whole of it.
  for (const waveform of ["sawtooth", "square"] as const) {
    const { naive, slope } = SHAPES[waveform];
    const inc = 1000 / SAMPLE_RATE;
    for (const { d, age } of FRACTIONS) {
      const signal = renderSynced({
        type: TYPE_OF[waveform],
        f0: 1000,
        gate: rampGate(512, 100, d),
        phase: 0,
      });
      const raw = (102 - age) * inc;
      const from = raw - Math.floor(raw);
      const to = age * inc;
      if (slope(to, 0.5) !== slope(from, 0.5))
        problems.push({ waveform, at: "slope should be flat" });
      const expected =
        naive(to, 0.5) +
        (naive(to, 0.5) - naive(from, 0.5)) * blepResidual4(age);
      if (Math.abs(signal[102] - expected) > 0.01)
        problems.push({ waveform, d, measured: signal[102], expected });
    }
  }

  expect(problems).toEqual([]);
});

it("does not double-correct a type change that lands on a reset", () => {
  // The stale-state hazard, for the third time in this file. `type` is k-rate,
  // so it changes on a block boundary; a reset detected on that same sample
  // happened at `i - age`, which is at or *before* the change. So the reset
  // belongs to the previous waveform, and the type change is then scheduled
  // against the post-reset phase - the two compose into one path.
  //
  // Correcting the reset with the *new* waveform instead counts the difference
  // between the two shapes twice. Measured over the grid below: 1.0368 as
  // written, and **2.0240** with `wave` in place of `prevWave` - which is
  // ticket 04's 1.833 on a signal whose own edge is 0.917, in this ticket's
  // clothes. `ONE_EDGE_MAX` is the bound because a reset is one band-limited
  // step and a type change is another, and they are a sample apart at most.
  const boundary = 256;
  const problems: unknown[] = [];

  for (const from of WAVEFORMS)
    for (const to of WAVEFORMS) {
      if (from === to) continue;
      for (const f0 of [110, 440, 2000])
        for (const { d } of FRACTIONS) {
          const gate = rampGate(512, boundary, d);
          const generate = createPolyblepOscillator(SAMPLE_RATE, 0);
          const signal = new Float32Array(512);
          const block = new Float32Array(128);
          const frequency = new Float32Array(128).fill(f0);
          const detune = new Float32Array(128);
          const width = new Float32Array(128).fill(0.5);
          for (let at = 0; at < 512; at += 128) {
            generate(
              block,
              TYPE_OF[at < boundary ? from : to],
              frequency,
              detune,
              width,
              gate.subarray(at, at + 128),
            );
            signal.set(block, at);
          }
          const step = maxAbsoluteDifference(
            signal.subarray(boundary, boundary + 8),
          );
          if (!signal.every(Number.isFinite) || step > ONE_EDGE_MAX)
            problems.push({ from, to, f0, d, step });
        }
    }

  expect(problems).toEqual([]);
});

it("is sub-sample accurate", () => {
  // Two halves. The first is that the reset stays *bounded* wherever inside the
  // sample it lands: a reset is one band-limited step and nothing else, so its
  // largest first difference cannot exceed one edge - `ONE_EDGE_MAX`, which is
  // `TYPE_SWITCH_MARGIN`'s 0.599 for a unit step doubled. Measured worst over
  // the grid below: 1.1979, which is that bound reached rather than approached.
  //
  // The second is that it is genuinely sub-sample. Read the same sample against
  // `blepResidual4(0)` instead of `blepResidual4(age)` - which is exactly what
  // an integer-sample reset produces, the correction pinned to the sample
  // boundary - and the error is not merely larger, it *grows monotonically with
  // the fraction*: measured 0.039 at 1/16 rising to 0.403 at 15/16 at 440 Hz, a
  // ratio of 10.3. That is the difference between placing a reset in time and
  // rounding it to the nearest sample, and it is what a 16-position sweep is
  // for.
  const problems: unknown[] = [];

  for (const waveform of WAVEFORMS)
    for (const f0 of [110, 440, 1000, 2000, -440])
      for (const width of [0.1, 0.5, 0.9])
        for (const { d } of FRACTIONS) {
          const signal = renderSynced({
            type: TYPE_OF[waveform],
            f0,
            gate: rampGate(512, 300, d),
            width,
            phase: 0,
          });
          const step = maxAbsoluteDifference(signal.subarray(296, 310));
          if (!signal.every(Number.isFinite) || step > ONE_EDGE_MAX)
            problems.push({ waveform, f0, width, d, step, at: "bounded" });
        }

  for (const [f0, at] of [
    [440, 348],
    [1000, 100],
  ] as const) {
    const inc = f0 / SAMPLE_RATE;
    const errors = FRACTIONS.map(({ d, age }) => {
      const signal = renderSynced({
        type: TYPE_OF.sawtooth,
        f0,
        gate: rampGate(512, at, d),
        phase: 0,
      });
      const height = naiveSaw(age * inc) - naiveSaw((at + 2 - age) * inc);
      // The integer reading: the same step height, placed at age 0.
      const atBoundary = naiveSaw(0) + height * blepResidual4(0);
      return Math.abs(signal[at + 2] - atBoundary);
    });
    // The last entry is `d = 1`, the age the DSP reads as 0 - which *is* the
    // boundary reading, so its error is 0 by construction and is not part of
    // the trend.
    const trend = errors.slice(0, -1);
    for (let i = 1; i < trend.length; i++)
      if (trend[i] <= trend[i - 1])
        problems.push({ f0, i, trend, at: "monotone" });
    if (trend[trend.length - 1] < 5 * trend[0])
      problems.push({ f0, first: trend[0], last: trend[trend.length - 1] });
    if (errors[errors.length - 1] > 1e-6)
      problems.push({ f0, boundary: errors[errors.length - 1] });
  }

  expect(problems).toEqual([]);
});

it("fires once while the gate is held", () => {
  // `scripts/_gate.ts`'s contract: a trigger is the *transition* to positive,
  // so holding the line high is one reset and not one per sample. Without it a
  // held gate would freeze the phase at `phaseStart` and the oscillator would
  // output a constant.
  //
  // 40 Hz over 512 samples is less than half a cycle, so the sawtooth has no
  // wrap of its own in the render and every discontinuity in it belongs to the
  // gate. `phase: 0.5` puts the restart half a cycle from where the phase has
  // reached, which makes the one reset unmistakable - measured, a step of 0.72.
  const gate = new Float32Array(512);
  gate.fill(1, 256);
  const signal = renderSynced({
    type: TYPE_OF.sawtooth,
    f0: 40,
    gate,
    phase: 0.5,
  });

  expect(discontinuityRuns(signal, 0.05)).toBe(1);
  // ...and the phase keeps running afterwards rather than being pinned.
  expect(signal[500] - signal[400]).toBeGreaterThan(0);
});

it("does not fire on a falling edge or on zero", () => {
  // A gate that goes 1 -> 0 -> -1 produces no reset anywhere. The opening
  // sample is a rising edge by the contract - `createGateDetector` starts
  // closed, the same as AD, ADSR and Arp - but it is a *no-op* here, because
  // the phase has advanced only the two priming samples from `phaseStart` and
  // the step is `-4 * inc`, 0.0036 at 40 Hz. What the render does prove is that
  // neither the fall to 0 nor the fall through it to -1 fires: by then the
  // phase has run 170 samples from the restart, so a spurious reset would step
  // the output by 0.3 and be plainly visible.
  const falling = new Float32Array(512);
  falling.fill(1, 0, 170);
  falling.fill(0, 170, 340);
  falling.fill(-1, 340);
  const signal = renderSynced({
    type: TYPE_OF.sawtooth,
    f0: 40,
    gate: falling,
    phase: 0.5,
  });
  expect(discontinuityRuns(signal, 0.05)).toBe(0);

  // ...and a gate that returns below zero and rises again *does* fire twice,
  // which is what makes the first assertion about edges rather than about the
  // detector being asleep.
  const retrigger = new Float32Array(512);
  retrigger.fill(1, 128, 200);
  retrigger.fill(1, 320, 400);
  expect(
    discontinuityRuns(
      renderSynced({
        type: TYPE_OF.sawtooth,
        f0: 40,
        gate: retrigger,
        phase: 0.5,
      }),
      0.05,
    ),
  ).toBe(2);
});

/**
 * The hard-sync settings the alias comparison runs over: three master
 * frequencies whose period is **not** a whole number of samples, and seven
 * slave/master ratios.
 *
 * The non-integer master is not decoration, it is what makes the measurement
 * possible at all. A signal that repeats in an exact integer number of samples
 * folds every one of its aliases onto a multiple of `sampleRate / period` -
 * which is precisely the harmonic grid `aliasSnr` counts as *signal*. Measured
 * with a gate pulsing every 401 samples, a completely naive synced sawtooth
 * reads **9.44 dB better** than the band-limited one. The metric is not wrong;
 * it is blind to that input, and so is any other harmonic-grid metric.
 */
const SYNC_ALIAS_GRID = {
  masters: [110.3, 73.42, 220.7],
  ratios: [3.17, 4.31, 6.53, 8.11, 12.7, 17.3, 23.9],
};

/**
 * The slave/master ratio above which the reset *dominates* the waveform, and
 * the second comparison below becomes decisive.
 *
 * At a ratio of 3 the slave completes three cycles between resets, so the seam
 * is a small part of what is being measured and correcting it moves the figure
 * by hundredths of a dB. At 24 the waveform is nearly all seam.
 */
const SYNC_RESET_DOMINATES = 12;

it("beats an uncorrected reset", () => {
  // Two comparisons, because "uncorrected" has two honest readings and they
  // measure different things.
  //
  // **Against a naive implementation** - one that assigns the phase at the
  // sample the gate rose on and writes nothing at the seam. That is the whole
  // of what this ticket adds, sub-sample placement and band limiting together,
  // and the corrected render wins all 21 settings by **+0.94 dB to +23.82 dB**,
  // the margin growing monotonically with the slave/master ratio.
  //
  // **Against the same phase trajectory with only the correction missing** -
  // a fresh oscillator per segment, started at the *post-reset* phase, which
  // `phase` makes expressible: identical timing, nothing written at the seam.
  // This isolates the correction, and it is asserted only where the reset
  // dominates, because that is where it is decisive: measured **+0.85 dB to
  // +13.71 dB** at ratios of 12.7 and above, and +0.03 to +0.97 below them,
  // which is positive but too fine to hold a regression net.
  //
  // No threshold is hardcoded. The assertion is that correcting is strictly
  // better; the numbers above are the record of by how much.
  const length = 32768;
  const problems: unknown[] = [];

  for (const fm of SYNC_ALIAS_GRID.masters)
    for (const ratio of SYNC_ALIAS_GRID.ratios) {
      const f0 = fm * ratio;
      const inc = f0 / SAMPLE_RATE;
      const gate = masterGate(length, fm);
      const corrected = renderSynced({
        type: TYPE_OF.sawtooth,
        f0,
        gate,
        phase: 0,
      });

      // (a) The free-running sawtooth, re-indexed from each rising edge: every
      //     segment keeps its own band-limited wraps, and the reset is raw and
      //     pinned to the sample boundary.
      const free = render(oscillator(TYPE_OF.sawtooth), {
        f0,
        sampleRate: SAMPLE_RATE,
        length,
        warmup: 0,
      });
      const naive = new Float32Array(length);

      // (b) The same, but each segment starts at the post-reset phase, so the
      //     restart keeps the sub-sample offset the corrected render gives it.
      const placed = new Float32Array(length);
      const segments: Array<{ from: number; phase: number }> = [
        { from: 0, phase: 0 },
      ];

      let since = 0;
      let open = false;
      let previousGate = 0;
      for (let i = 0; i < length; i++) {
        const g = gate[i];
        if (!open && g > 0) {
          open = true;
          since = 0;
          // `crossingAge`, restated here rather than exported: a test that
          // borrowed the implementation's arithmetic could not catch it being
          // wrong.
          const rise = g - previousGate;
          const raw = rise > 0 ? -previousGate / rise : 1;
          const fraction = raw > 0 ? (raw < 1 ? raw : 1) : 0;
          const age = 1 - fraction;
          const offset = (age < 1 ? age : 0) * inc;
          // The reset lands on the sample emitted two later: the latency the
          // 4-point kernel buys.
          segments.push({ from: i + 2, phase: offset - Math.floor(offset) });
        } else if (open && g <= 0) open = false;
        previousGate = g;
        naive[i] = free[since];
        since++;
      }

      for (let s = 0; s < segments.length; s++) {
        const { from, phase } = segments[s];
        const to = s + 1 < segments.length ? segments[s + 1].from : length;
        if (to <= from) continue;
        const generate = createPolyblepOscillator(SAMPLE_RATE, phase);
        const segment = new Float32Array(to - from);
        generate(
          segment,
          TYPE_OF.sawtooth,
          constant(f0),
          constant(0),
          constant(0.5),
        );
        placed.set(segment, from);
      }

      const correctedSnr = aliasSnr(corrected, fm, SAMPLE_RATE);
      if (correctedSnr <= aliasSnr(naive, fm, SAMPLE_RATE))
        problems.push({
          fm,
          ratio,
          correctedSnr,
          naive: aliasSnr(naive, fm, SAMPLE_RATE),
          at: "naive",
        });
      if (
        ratio >= SYNC_RESET_DOMINATES &&
        correctedSnr <= aliasSnr(placed, fm, SAMPLE_RATE)
      )
        problems.push({
          fm,
          ratio,
          correctedSnr,
          placed: aliasSnr(placed, fm, SAMPLE_RATE),
          at: "placement-matched",
        });
    }

  expect(problems).toEqual([]);
});

it("syncs at a non-integer master period", () => {
  // 333.7 Hz against 44100: a master period of 132.155 samples, so the crossing
  // fraction is different on every cycle and never repeats. Every waveform,
  // both signs of `frequency`, every width, four starting phases - 288 settings.
  // Measured worst peak 1.0027, and nothing non-finite.
  const gate = masterGate(4096, 333.7);
  const problems: unknown[] = [];

  for (const waveform of WAVEFORMS)
    for (const f0 of [110, 440, 1000, 2000, 4000, -2000])
      for (const width of [0.1, 0.5, 0.9])
        for (const phase of [0, 0.25, 0.5, 0.9]) {
          const signal = renderSynced({
            type: TYPE_OF[waveform],
            f0,
            gate,
            width,
            phase,
          });
          if (!signal.every(Number.isFinite) || peak(signal) > SYNC_PEAK_MAX)
            problems.push({
              waveform,
              f0,
              width,
              phase,
              peak: peak(signal),
              finite: signal.every(Number.isFinite),
            });
        }

  expect(problems).toEqual([]);
});

it("stays bounded when the gate fires as fast as it can", () => {
  // The hazard ticket 05 measured for `width`: corrections landing inside the
  // kernel's +/-2-sample support and adding. A reset every sample is the worst
  // a gate can do, and it is in the grid rather than excluded from it.
  //
  // Measured worst 1.1667 - a sawtooth reset every 5 samples at
  // `frequency = -11025`, where the increment is pinned at `-MAX_INC` and the
  // phase covers a cycle and a quarter between resets, which is where the step
  // heights are largest while the resets are still close enough to overlap.
  const problems: unknown[] = [];

  for (const waveform of WAVEFORMS)
    for (const period of [1, 2, 3, 5, 8, 16, 32])
      for (const f0 of [0, 20, 440, 4000, 11025, 20000, -4000, -11025])
        for (const width of [0.1, 0.5, 0.9]) {
          const signal = renderSynced({
            type: TYPE_OF[waveform],
            f0,
            gate: pulseGate(4096, period),
            width,
            phase: 0,
          });
          if (!signal.every(Number.isFinite) || peak(signal) > FAST_SYNC_MAX)
            problems.push({
              waveform,
              f0,
              period,
              width,
              peak: peak(signal),
              finite: signal.every(Number.isFinite),
            });
        }

  // ...and a gate that is white noise, so the edges arrive at every sub-sample
  // fraction as well as at every rate. Measured worst 1.0875.
  let seed = 7919;
  const random = () =>
    (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

  for (const waveform of WAVEFORMS)
    for (const f0 of [0, 20, 440, 4000, 11025, -4000])
      for (const width of [0.1, 0.5, 0.9]) {
        const gate = new Float32Array(4096);
        for (let i = 0; i < gate.length; i++) gate[i] = random() * 2 - 1;
        const signal = renderSynced({
          type: TYPE_OF[waveform],
          f0,
          gate,
          width,
          phase: 0,
        });
        if (!signal.every(Number.isFinite) || peak(signal) > FAST_SYNC_MAX)
          problems.push({
            waveform,
            f0,
            width,
            peak: peak(signal),
            at: "noise",
          });
      }

  expect(problems).toEqual([]);
});

it("is total for any sync value", () => {
  // `sync` is declared `0..1`, and like every other param on this node the DSP
  // has to be total outside it too: `connectParams` writes `param.value = 0`
  // and then sums whatever node is connected, so a bipolar audio-rate master -
  // the intended input - spends half its time negative. A NaN reaches the gate
  // detector without changing its state (a NaN is neither `> 0` nor `<= 0`),
  // which is the case `crossingAge`'s `rise > 0` test exists for.
  const sync = declared("sync");
  const problems: unknown[] = [];

  for (const waveform of WAVEFORMS)
    for (const f0 of [-20000, 0, 20000])
      for (const width of [0, 0.5, 1])
        for (const value of [
          -1,
          sync.minValue,
          0.5,
          sync.maxValue,
          NaN,
          Infinity,
        ]) {
          const signal = renderSynced({
            type: TYPE_OF[waveform],
            f0,
            gate: new Float32Array(2048).fill(value),
            width,
            phase: 0,
          });
          if (!signal.every(Number.isFinite) || peak(signal) > FAST_SYNC_MAX)
            problems.push({ waveform, f0, width, value, peak: peak(signal) });
        }

  // ...and a NaN gate that later becomes a real rising edge still syncs.
  const recovered = new Float32Array(512);
  recovered.fill(NaN, 0, 100);
  recovered.fill(1, 100);
  const signal = renderSynced({
    type: TYPE_OF.sawtooth,
    f0: 440,
    gate: recovered,
    phase: 0,
  });
  expect(signal.every(Number.isFinite)).toBe(true);
  expect(peak(signal)).toBeLessThanOrEqual(SYNC_PEAK_MAX);

  expect(problems).toEqual([]);
});

it("is bit-identical with a silent gate", () => {
  // `sync` is an optional argument so that every call site written before it
  // existed takes the path it was measured on. A gate that is present but never
  // positive has to take the other path and produce the same samples, or the
  // fingerprint claim would only hold for callers who pass nothing.
  for (const waveform of WAVEFORMS) {
    const withGate = renderSynced({
      type: TYPE_OF[waveform],
      f0: 440,
      gate: new Float32Array(1024),
      width: 0.3,
    });
    const without = render(oscillator(TYPE_OF[waveform], 0.3), {
      f0: 440,
      sampleRate: SAMPLE_RATE,
      length: 1024,
      warmup: 0,
    });
    expect(Array.from(withGate)).toEqual(Array.from(without));
  }
});

it("starts at the configured phase", () => {
  // `output[0]` is the sample at `phaseStart` - the two priming steps are what
  // buy that - so on a sawtooth it reads `2 * phase - 1` exactly. 20 Hz keeps
  // the wrap 2205 samples away, so nothing is corrected anywhere near it.
  const at = (phase: number | "random") => {
    const generate = createPolyblepOscillator(SAMPLE_RATE, phase);
    const block = new Float32Array(64);
    generate(block, TYPE_OF.sawtooth, constant(20), constant(0), constant(0.5));
    return (block[0] + 1) / 2;
  };

  expect(at(0)).toBe(0);
  expect(at(0.25)).toBe(0.25);
  expect(at(0.75)).toBe(0.75);
  // A number is taken modulo 1, so a phase in turns can be handed over
  // unnormalised - and the degenerate values resolve to 0, the phase this
  // package has always started at, rather than poisoning the accumulator.
  expect(at(1.25)).toBe(0.25);
  expect(at(-0.25)).toBe(0.75);
  expect(at(NaN)).toBe(0);
  expect(at(Infinity)).toBe(0);

  // `"random"` is `Math.random()` drawn once, at construction. Stubbing it is
  // what makes that a fact rather than an inference from two samples differing.
  const draw = jest.spyOn(Math, "random").mockReturnValue(0.375);
  expect(at("random")).toBe(0.375);
  draw.mockRestore();

  // ...and unstubbed, two instances decorrelate, which is the whole point:
  // three of these detuned into a supersaw no longer start phase-locked.
  const instances = Array.from({ length: 8 }, () => at("random"));
  expect(new Set(instances).size).toBeGreaterThan(1);
  for (const phase of instances) {
    expect(phase).toBeGreaterThanOrEqual(0);
    expect(phase).toBeLessThan(1);
  }
});
