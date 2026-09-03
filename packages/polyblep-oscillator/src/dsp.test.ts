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

const constant = (value: number) => new Float32Array([value]);

const oscillator =
  (type: number, detune = 0) =>
  ({ f0, sampleRate }: RenderContext) => {
    const generate = createPolyblepOscillator(sampleRate);
    const frequency = constant(f0);
    const cents = constant(detune);
    return (block: Float32Array) => generate(block, type, frequency, cents);
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

it("is finite over the whole declared range", () => {
  // The ranges come from PARAMS rather than from literals, so this follows the
  // declared surface when ticket 07 makes `frequency` bipolar.
  const type = declared("type");
  const frequency = declared("frequency");
  const detune = declared("detune");

  // `type` is an AudioParam too: the half-integers are the values a ramp
  // between two waveforms passes through, and `WAVEFORMS[1.5]` is `undefined`.
  const types = [type.minValue, 0.5, 1, 1.5, type.maxValue];
  const frequencies = [frequency.minValue, frequency.maxValue];
  const detunes = [detune.minValue, detune.defaultValue, detune.maxValue];
  // 8 kHz is where a lost increment clamp shows: 20 kHz there is 2.5 cycles per
  // sample. `worklet.ts` reads the global `sampleRate` at construction, so a
  // low-rate context is a real deployment, not a contrivance.
  const sampleRates = [8000, SAMPLE_RATE];

  const problems: unknown[] = [];
  for (const sampleRate of sampleRates)
    for (const waveformType of types)
      for (const f0 of frequencies)
        for (const cents of detunes) {
          const settings = {
            sampleRate,
            type: waveformType,
            f0,
            detune: cents,
          };
          const generate = createPolyblepOscillator(sampleRate);
          const block = new Float32Array(4096);

          generate(block, waveformType, constant(f0), constant(cents));
          // A runaway phase stays finite while growing without bound, so the
          // bound is the assertion that catches it. This render starts cold,
          // and holds to the same bound as a warm one: the integrator and DC
          // blocker whose settling used to need a looser ceiling are gone.
          if (!block.every(Number.isFinite) || peak(block) > PEAK_MAX)
            problems.push({ ...settings, at: "declared", peak: peak(block) });

          // ...and the same node still works afterwards. `frequency = 0` used
          // to leave `-Infinity` in the accumulator, and every later block came
          // out NaN for the life of the node.
          generate(block, waveformType, constant(440), constant(0));
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
    generate(block, TYPE_OF[waveform], constant(0), constant(0));

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

    for (let block = 0; block < 8; block++) {
      kRate(kBlock, TYPE_OF[waveform], constant(440), constant(7));
      aRate(aBlock, TYPE_OF[waveform], frequency, detune);
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

      for (let produced = 0; produced < length; produced += blockSize) {
        generate(block, TYPE_OF[waveform], frequency, detune);
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
    generate(signal, type, constant(f0), constant(0));
    return signal;
  };

  const switched = (from: number, to: number) => {
    const generate = createPolyblepOscillator(SAMPLE_RATE);
    const signal = new Float32Array(length);
    const first = new Float32Array(at);
    const second = new Float32Array(length - at);
    generate(first, from, constant(f0), constant(0));
    generate(second, to, constant(f0), constant(0));
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
