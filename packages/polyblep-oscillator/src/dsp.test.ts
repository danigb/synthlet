import { createPolyblep, PolyblepOscillatorType } from "./dsp";
import { PARAMS } from "./params";
import { aliasSnr, peak, render, RenderContext } from "./spectrum";

// What this package promises, as numbers.
//
// The snapshots in `worklet.test.ts` assert stability; this file asserts
// quality. Every floor below was measured against the code as it stands, at
// 44.1 kHz, rendered through `createPolyblep` into a `Float32Array` in
// 128-sample blocks with 8192 samples of warm-up discarded - the same figures
// the two harnesses in `thoughts/research/2026-09-03_polyblep-harness/` report,
// to the decimal. `spectrum.test.ts` is what keeps the metric itself honest.
//
// The floors are deliberately the 2-point PolyBLEP's, so this suite is green
// the day it lands. The rewrite in ticket 04 raises them, and its diff is
// where the improvement shows. Every assertion here is one-sided on purpose: a
// waveform that gets *better* needs no edit, a waveform that gets worse fails.

const SAMPLE_RATE = 44100;

type Waveform = "sawtooth" | "square" | "triangle";

const TYPE_OF: Record<Waveform, PolyblepOscillatorType> = {
  sawtooth: PolyblepOscillatorType.Sawtooth,
  square: PolyblepOscillatorType.Square,
  triangle: PolyblepOscillatorType.Triangle,
};

const WAVEFORMS = Object.keys(TYPE_OF) as Waveform[];

/**
 * Alias SNR floors in dB: the measured 2-point figure minus 1.5 dB.
 *
 * | measured | 440 | 1000 | 2000 | 4000 | 8000 |
 * | saw      | 35.4 | 32.0 | 29.5 | 24.7 | 18.3 |
 * | square   | 36.9 | 33.3 | 33.0 | 30.4 | 18.1 |
 *
 * | measured | 440 | 1000 | 1661 | 4186 | 7040 |
 * | triangle | 65.7 | 55.1 | 50.1 | 40.9 | 39.6 |
 *
 * The triangle is measured on its own grid because that is the grid the audit
 * and `tri-harness.js` used for it; 1661 / 4186 / 7040 Hz are G#6, C8 and A8.
 *
 * The 1.5 dB margin is a judgment call, not a measurement - it covers the
 * `Float32Array` output against the harnesses' `Float64` and small differences
 * in phase-accumulator bookkeeping. In practice the port reproduces the
 * harnesses exactly, so it can be tightened once ticket 04 has replaced these
 * numbers with the 4-point ones.
 */
export const ALIAS_FLOORS: Record<
  Waveform,
  Array<[f0: number, floorDb: number]>
> = {
  sawtooth: [
    [440, 33.9],
    [1000, 30.5],
    [2000, 28.0],
    [4000, 23.2],
    [8000, 16.8],
  ],
  square: [
    [440, 35.4],
    [1000, 31.8],
    [2000, 31.5],
    [4000, 28.9],
    [8000, 16.6],
  ],
  triangle: [
    [440, 64.2],
    [1000, 53.6],
    [1661, 48.6],
    [4186, 39.4],
    [7040, 38.1],
  ],
};

/**
 * A band-limited waveform does not peak at 1.0, so an amplitude test needs
 * per-frequency bounds or a correct implementation fails it: every harmonic
 * above Nyquist is gone, and the ones that remain no longer add up to the
 * corner. The square is the exception - its two steps are symmetric and their
 * corrections cancel at the extremes.
 */
const PEAK_MAX = 1.02;

/** The measured warm peak minus 0.02, against `PEAK_MAX` throughout. */
export const PEAK_BOUNDS: Record<
  Waveform,
  Array<[f0: number, min: number, max: number]>
> = {
  // measured 0.999 0.998 0.995 0.980 0.955 0.911 0.827 0.670
  sawtooth: [
    [20, 0.979, PEAK_MAX],
    [55, 0.978, PEAK_MAX],
    [110, 0.975, PEAK_MAX],
    [440, 0.96, PEAK_MAX],
    [1000, 0.935, PEAK_MAX],
    [2000, 0.891, PEAK_MAX],
    [4000, 0.807, PEAK_MAX],
    [8000, 0.65, PEAK_MAX],
  ],
  // measured 1.000 at every frequency
  square: [
    [20, 0.98, PEAK_MAX],
    [55, 0.98, PEAK_MAX],
    [110, 0.98, PEAK_MAX],
    [440, 0.98, PEAK_MAX],
    [1000, 0.98, PEAK_MAX],
    [2000, 0.98, PEAK_MAX],
    [4000, 0.98, PEAK_MAX],
    [8000, 0.98, PEAK_MAX],
    // 44100 / 20: an exact 20 samples per cycle, so the accumulated phase can
    // land on the double immediately below 0.5. See the overshoot test.
    [2205, 0.98, PEAK_MAX],
  ],
  // measured 0.201 0.524 0.795 0.978 0.979 0.966 0.909 0.844
  //
  // The first three rows are not band-limiting: they are the 63 Hz DC blocker
  // that follows the triangle's integrator, dropping a 20 Hz triangle to a
  // fifth of full scale. Ticket 04 replaces the integrator and the blocker with
  // a direct BLAMP corner correction, measured 0.999 at 20 Hz, and these three
  // rows go up with it.
  triangle: [
    [20, 0.181, PEAK_MAX],
    [55, 0.504, PEAK_MAX],
    [110, 0.775, PEAK_MAX],
    [440, 0.958, PEAK_MAX],
    [1000, 0.959, PEAK_MAX],
    [1661, 0.946, PEAK_MAX],
    [4186, 0.889, PEAK_MAX],
    [7040, 0.824, PEAK_MAX],
  ],
};

/**
 * The ceiling for a *cold* render, which is a different number from `PEAK_MAX`.
 *
 * The triangle's integrator and DC blocker start from rest and settle over the
 * first ~20 ms, peaking at a measured 1.777 at 1661 Hz while they do - finding
 * C3 of the audit, left alone by ticket 01 and deleted by ticket 04. Every
 * steady-state figure above is measured after the warm-up; the tests that
 * deliberately start cold assert against this looser bound instead, which is
 * still three orders of magnitude below a runaway phase accumulator.
 */
const COLD_START_MAX = 2;

const oscillator =
  (type: number, detune = 0) =>
  ({ f0, sampleRate }: RenderContext) => {
    const generate = createPolyblep(sampleRate);
    return (block: Float32Array) => generate(block, type, f0, detune);
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
  // between two waveforms passes through, and `GENS[1.5]` is `undefined`.
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
          const generate = createPolyblep(sampleRate);
          const block = new Float32Array(4096);

          generate(block, waveformType, f0, cents);
          // A runaway phase stays finite while growing without bound, so the
          // bound is the assertion that catches it.
          if (!block.every(Number.isFinite) || peak(block) > COLD_START_MAX)
            problems.push({ ...settings, at: "declared", peak: peak(block) });

          // ...and the same node still works afterwards. `frequency = 0` used
          // to leave `-Infinity` in the accumulator, and every later block came
          // out NaN for the life of the node.
          generate(block, waveformType, 440, 0);
          if (
            !block.every(Number.isFinite) ||
            peak(block) > COLD_START_MAX ||
            !block.some((sample) => sample !== 0)
          )
            problems.push({ ...settings, at: "recovery", peak: peak(block) });
        }

  expect(problems).toEqual([]);
});

it("is independent of block size", () => {
  // The phase, the integrator accumulator and the DC blocker all carry across
  // calls; nothing may depend on where the block boundaries fall.
  for (const waveform of WAVEFORMS) {
    const options = {
      f0: 440,
      sampleRate: SAMPLE_RATE,
      length: 4096,
      warmup: 0,
    };
    const single = render(oscillator(TYPE_OF[waveform]), {
      ...options,
      blockSize: 4096,
    });
    const quanta = render(oscillator(TYPE_OF[waveform]), {
      ...options,
      blockSize: 128,
    });
    expect(Array.from(quanta)).toEqual(Array.from(single));
  }
});

/** 44100 / 60, / 30, / 20 and / 12: an exact integer of samples per cycle. */
const EXACT_HALF_CYCLE_HZ = [735, 1470, 2205, 3675];

it("does not overshoot where the half cycle lands on 0.5", () => {
  // At these increments the accumulated phase reaches the double immediately
  // below 0.5, where `(phase + 0.5) % 1` rounds up to 1.0 and wraps to 0: the
  // rising edge's correction applied with the falling edge's sign, a -2 sample
  // on a +/-1 square. `dsp.ts`'s `halfPhase` is what prevents it. It is a
  // cold-start event - measured at sample index 10, and gone after warm-up -
  // so this renders from zero rather than from a settled state.
  const problems: unknown[] = [];
  for (const f0 of EXACT_HALF_CYCLE_HZ) {
    const signal = render(oscillator(PolyblepOscillatorType.Square), {
      f0,
      sampleRate: SAMPLE_RATE,
      length: 4096,
      warmup: 0,
    });
    if (peak(signal) > PEAK_MAX) problems.push({ f0, peak: peak(signal) });
  }
  expect(problems).toEqual([]);
});
