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
