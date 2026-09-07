import { readFileSync } from "fs";
import { join } from "path";
import { blampResidual4, blepResidual4 } from "./_blep";
import {
  aliasSnr,
  centroid,
  magnitudes,
  maxAbsoluteDifference,
  peak,
  peakFrequency,
} from "./_spectrum";
import { defaultWavetable, mipmapWavetable } from "./wavetable-builder";
import { WavetableOscillator } from "./wavetable-oscillator";

/**
 * What this oscillator promises, as numbers.
 *
 * **Every floor here is set against what the code measures, and carries the
 * measurement next to it**, so that the ticket which improves a number raises
 * the floor and the diff is the evidence. Ticket 05 took the `set()` step from
 * 0.7707 to 0.0114 and ticket 06 took the alias SNR at 440 Hz from 23.7 dB to
 * 57.4 dB; both floors moved with them.
 *
 * The pitch block is the one that has already been collected: ticket 03 turned
 * twelve `it.failing` cases on by making `frequency` mean Hz, and it is what a
 * handover between tickets is supposed to look like.
 *
 * The instrument is `scripts/_spectrum.ts`, copied here; `aliasSnr` is the
 * audit's own metric and `digital-delay/src/spectrum.test.ts` is its
 * calibration. The un-mipmapped alias figures reproduce the audit
 * (`thoughts/research/2026-09-03_18-14-54_wavetable-oscillator-audit.md`
 * section 4) to within 0.1 dB and are kept as a calibration row, which is what
 * makes the mipmapped ones comparable to its band-limited reference column.
 */

const SAMPLE_RATE = 44100;

/** 32768 samples: 1.35 Hz per bin at 44.1 kHz, and the audit's analysis size. */
const ANALYSIS_LENGTH = 32768;

/** Discarded before analysis, so a measurement never includes the first block. */
const WARMUP = 8192;

/** One render quantum - the block size the worklet is actually called with. */
const BLOCK = 128;

/** The gap between two adjacent float32 values at full scale. */
const FLOAT32_STEP = 1.1920929e-7;

/**
 * A number for the k-rate case - one value for the whole block, which is how an
 * unconnected `AudioParam` arrives - or a function of the absolute sample index
 * for the a-rate one, which `render` fills into a block-sized `Float32Array`
 * the way a connected one arrives.
 *
 * All three of this oscillator's parameters take both forms, and which one a
 * test picks is itself part of what it measures: ticket 09 made the pitch path
 * choose between a per-block and a per-sample increment on exactly this test.
 */
type Rate = number | ((index: number) => number);

type Params = {
  frequency?: Rate;
  detune?: Rate;
  morph?: Rate;
  sync?: Rate;
  segments?: number;
  pitchChaos?: Rate;
  pitchSpread?: Rate;
  ampChaos?: Rate;
  ampSpread?: Rate;
};

type Inputs = {
  frequency: ArrayLike<number>;
  detune: ArrayLike<number>;
  morph: ArrayLike<number>;
  sync?: ArrayLike<number>;
  segments?: ArrayLike<number>;
  pitchChaos?: ArrayLike<number>;
  pitchSpread?: ArrayLike<number>;
  ampChaos?: ArrayLike<number>;
  ampSpread?: ArrayLike<number>;
};

/** The five stochastic inputs, and the defaults `params.ts` declares. */
const STOCHASTIC = {
  segments: 8,
  pitchChaos: 0.5,
  pitchSpread: 0,
  ampChaos: 0.5,
  ampSpread: 0,
} as const;

/**
 * `sync` is present only when a test asks for it, and that is load-bearing
 * rather than tidy: supplying it at all is what engages ticket 10's pending
 * ring and its two samples of latency. Every test written before that ticket
 * passes no `sync`, so every one of them still drives the zero-latency loop,
 * bit for bit - which is what makes the alias floors above provably untouched.
 *
 * Ticket 11's five inputs follow exactly the same rule, and for the same
 * reason: a test that names none of them drives the loop with no stochastic
 * stage at all. `it("is a no-op at zero spread")` is what says the two paths
 * are the same signal anyway.
 */
const inputsOf = (params: Params): Inputs => {
  const inputs: Inputs = {
    frequency: [typeof params.frequency === "number" ? params.frequency : 440],
    detune: [typeof params.detune === "number" ? params.detune : 0],
    // Plane 0 unless a test is about the morph: a crossfade in the middle of a
    // spectrum measurement would make it a measurement of two planes at once.
    morph: [typeof params.morph === "number" ? params.morph : 0],
  };
  if (params.sync !== undefined)
    inputs.sync = [typeof params.sync === "number" ? params.sync : 0];
  for (const name of Object.keys(STOCHASTIC) as (keyof typeof STOCHASTIC)[]) {
    if (params[name] === undefined) continue;
    // One named member brings the whole group, because that is how the worklet
    // supplies them: `parameters` always carries all five.
    for (const each of Object.keys(STOCHASTIC) as (keyof typeof STOCHASTIC)[]) {
      const value = params[each];
      inputs[each] = [typeof value === "number" ? value : STOCHASTIC[each]];
    }
    break;
  }
  return inputs;
};

/**
 * A deterministic 32-bit LCG installed over `Math.random` for the duration of
 * `fn`, and removed after it.
 *
 * The shipped code carries no seed: `stochastic.ts` draws from `Math.random()`
 * because that is what every generator in this library does, and a PRNG here
 * would go into every user's processor payload to serve a test. Stubbing is
 * where the determinism belongs, and it is what keeps this suite from being
 * flaky - every assertion below that depends on a draw runs inside one of
 * these, and the two that are *about* randomness say so.
 */
function seeded<T>(seed: number, fn: () => T): T {
  let state = seed >>> 0;
  const spy = jest.spyOn(Math, "random").mockImplementation(() => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  });
  try {
    return fn();
  } finally {
    spy.mockRestore();
  }
}

/**
 * Renders `length` samples from one oscillator, block by block, the way the
 * worklet drives it. `warmup` samples are rendered and dropped first.
 */
function render(
  table: Float32Array,
  len: number,
  params: Params,
  options: {
    length?: number;
    block?: number;
    warmup?: number;
    sampleRate?: number;
    /**
     * How many mipmap levels `table` carries, level-major. Left at 1 the table
     * is a plain set of planes and the oscillator reads level 0 alone, which is
     * bit for bit what it did before ticket 06 - which is what lets the audit's
     * un-mipmapped column below stay in this file as a calibration row.
     */
    levels?: number;
    /**
     * The initial read position, ticket 09's construction option. `"random"`
     * draws once per instance, so a test that uses it renders twice and
     * compares rather than pinning a value.
     */
    phase?: number | "random";
    /**
     * Ticket 11's construction option: `true` fluctuates the pitch once per
     * segment, `false` (the default, and Radna 2.4's) once per wave cycle.
     */
    pitchPerSegment?: boolean;
  } = {},
) {
  const length = options.length ?? ANALYSIS_LENGTH;
  const block = options.block ?? BLOCK;
  const warmup = options.warmup ?? 0;
  const sampleRate = options.sampleRate ?? SAMPLE_RATE;

  const osc = WavetableOscillator(
    sampleRate,
    options.phase,
    options.pitchPerSegment,
  );
  osc.set(table, len, options.levels ?? 1);

  const out = new Float32Array(warmup + length);
  const buffer = new Float32Array(block);
  const inputs = inputsOf(params);
  // One buffer per parameter that arrives a-rate, refilled per block because
  // that is how a connected `AudioParam` arrives.
  const aRate = (
    [
      "frequency",
      "detune",
      "morph",
      "sync",
      "pitchChaos",
      "pitchSpread",
      "ampChaos",
      "ampSpread",
    ] as const
  )
    .map((name) => {
      const at = params[name];
      return typeof at === "function"
        ? { name, at, buffer: new Float32Array(block) }
        : null;
    })
    .filter((entry) => entry !== null);

  for (let at = 0; at < out.length; at += block) {
    const size = Math.min(block, out.length - at);
    const view = size === block ? buffer : buffer.subarray(0, size);
    for (const param of aRate) {
      // Same length as the output, which is what makes the unit read it per
      // sample rather than taking element 0 for the whole block.
      const values =
        size === block ? param.buffer : param.buffer.subarray(0, size);
      for (let i = 0; i < size; i++) values[i] = param.at(at + i);
      inputs[param.name] = values;
    }
    osc.agen(view, inputs);
    out.set(view, at);
  }
  return out.subarray(warmup);
}

/** A table of `values.length` planes, each `len` samples of one constant. */
function constantPlanes(len: number, ...values: number[]) {
  const table = new Float32Array(len * values.length);
  values.forEach((value, plane) =>
    table.fill(value, plane * len, (plane + 1) * len),
  );
  return table;
}

/** One cycle of a sine: a table whose every error is interpolation error. */
const sineTable = (len: number) =>
  Float32Array.from({ length: len }, (_, i) =>
    Math.sin((2 * Math.PI * i) / len),
  );

/** The audit's full-bandwidth sawtooth: every harmonic the table can hold. */
function sawTable(len: number) {
  const table = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    let sum = 0;
    for (let h = 1; h < len / 2; h++)
      sum += Math.sin((2 * Math.PI * h * i) / len) / h;
    table[i] = (2 / Math.PI) * sum;
  }
  return table;
}

/** Distance from `f0` in cents, the unit every pitch assertion here is in. */
const centsFrom = (measured: number, f0: number) =>
  Math.abs(1200 * Math.log2(measured / f0));

// ---------------------------------------------------------------------------

describe("the morph", () => {
  /**
   * Ticket 05 replaced the internal `morphFrequency` phasor with an a-rate
   * `morph` position in 0..1, so this whole block is rewritten rather than
   * retuned: the parameter ticket 02 measured no longer exists. What it
   * measured - "steps by the crossfade and nothing more" - survives as
   * `it("morphs smoothly across the whole range")` below, against a position
   * swept by the caller instead of by a phasor nobody could aim.
   *
   * Two properties do the work. **Indexing gives Serra, Rubine & Dannenberg's
   * swap discipline (JAES 38(3) 1990 §1.1) for free** - as the position crosses
   * an integer the coefficient of the plane being exchanged is exactly zero -
   * and a **64-sample ramp** covers the case indexing cannot: a position that
   * jumps, or a table replaced under the reader.
   */

  /** The declick ramp in `wavetable-oscillator.ts`, and the bound it implies. */
  const DECLICK = 64;

  /**
   * Two planes a full scale apart, so a jump between them is 2.0 - the largest
   * discontinuity a normalized table can contain, and the number every declick
   * bound below is a fraction of.
   */
  const PLANE_GAP = 2;

  /** `count` constant planes alternating +1 / -1: every adjacent pair maximal. */
  const alternatingPlanes = (len: number, count: number) =>
    constantPlanes(
      len,
      ...Array.from({ length: count }, (_, k) => (k % 2 === 0 ? 1 : -1)),
    );

  it.each([2, 3, 4, 5, 8])(
    "sits still at a chosen plane, %p planes",
    (count) => {
      // Success criterion 1. `morph` at `k / (planes - 1)` is plane `k` and
      // nothing else, sample for sample - not close to it.
      //
      // Exact even where `k / (count - 1)` is not a binary fraction: `1/3 * 3`
      // is 0.9999999999999998 in float64, so the mix carries a 2.2e-16 error
      // and misses the plane by at most 4.4e-16 - 2.7e-9 of a float32 ulp at
      // 1.0, which the write into the output array annihilates. Measured worst
      // error over every row here: 0.
      const len = 64;
      const values = Array.from(
        { length: count },
        (_, k) => -1 + (2 * k) / (count - 1),
      );
      const table = constantPlanes(len, ...values);

      for (let k = 0; k < count; k++) {
        const signal = render(
          table,
          len,
          { frequency: 440, morph: k / (count - 1) },
          { length: 256 },
        );
        for (const sample of signal)
          expect(sample).toBe(Math.fround(values[k]));
      }
    },
  );

  it("sits still at a chosen plane of the built-in table", () => {
    // The same property against ticket 04's generated set, which is four planes
    // of real waveforms rather than constants, read at a moving offset.
    //
    // At 80 Hz, because the table now carries a mipmap pyramid: `inc` is 0.464,
    // below the 0.5 where the level axis starts moving, so the read is level 0
    // with a zero fraction and is comparable sample for sample with the single
    // plane sliced out of it. At 440 Hz the morphed read would be a crossfade of
    // levels 2 and 3 and the single-plane one would be full bandwidth, and the
    // test would be measuring the mipmap rather than the morph.
    const len = 256;
    const { data, levels } = defaultWavetable(len);

    for (let k = 0; k < 4; k++) {
      const plane = data.slice(k * len, (k + 1) * len);
      const morphed = render(
        data,
        len,
        { frequency: 80, morph: k / 3 },
        { length: 1024, levels },
      );
      const alone = render(plane, len, { frequency: 80 }, { length: 1024 });
      expect(Array.from(morphed)).toEqual(Array.from(alone));
    }
  });

  it.each([2, 3, 4, 8])(
    "morphs smoothly across the whole range, %p planes",
    (count) => {
      // Success criterion 2, and ticket 02's assertion in its new form. A full
      // 0 -> 1 sweep over one second, a-rate, across planes that are maximally
      // different from their neighbours.
      //
      // The bound is the crossfade's own step and nothing else: one sample of
      // position movement is `1 / (N - 1)`, which is `count - 1` times that
      // along the plane axis, times the gap between the planes it is crossing.
      // Measured 4.5419e-5 / 9.0837e-5 / 1.3626e-4 / 3.1793e-4 against
      // predictions 4.5353e-5 / 9.0705e-5 / 1.3606e-4 / 3.1747e-4 - the excess
      // is the float32 write.
      const len = 64;
      const N = SAMPLE_RATE;
      const signal = render(
        alternatingPlanes(len, count),
        len,
        { frequency: 440, morph: (i) => i / (N - 1) },
        { length: N },
      );

      // The tolerance is float32 and nothing else: the position arrives in a
      // Float32Array, so each delta carries up to one ulp of quantization that
      // the plane axis multiplies by `(count - 1) * PLANE_GAP`, and the output
      // is a Float32Array too, which adds one ulp per sample of the difference.
      const step = (1 / (N - 1)) * (count - 1) * PLANE_GAP;
      const tolerance = ((count - 1) * PLANE_GAP + 2) * FLOAT32_STEP;
      expect(maxAbsoluteDifference(signal)).toBeLessThanOrEqual(
        step + tolerance,
      );
      // And the sweep really did reach the far end, or the bound is vacuous.
      expect(signal[N - 1]).toBe(count % 2 === 0 ? -1 : 1);
      expect(peak(signal)).toBeLessThanOrEqual(1);
    },
  );

  it.each([2, 4, 8, 64])("declicks a jumped position, %p planes", (count) => {
    // Success criterion 3. `morph` stepped 0 -> 1 in one sample, between planes
    // that are a full scale apart: the whole table crossed instantly, which is
    // what a slider drag or a stepped envelope does.
    //
    // Without the ramp the step is `PLANE_GAP` - 2.0, full scale. With it the
    // jump contributes at most `PLANE_GAP / DECLICK` to any one sample, and
    // since the planes are constants there is no waveform slope underneath:
    // measured 0.03125 exactly, at every plane count here.
    //
    // This is also the row that rejects the ticket's suggested threshold of one
    // plane per sample. At `planes === 2` that is 1.0 - the entire parameter
    // range - so nothing would ever be declicked and this case would measure
    // the full 2.0. The threshold shipped is half a plane per sample, the plane
    // axis's Nyquist rate rather than its sample rate.
    const len = 64;
    const N = 512;
    const signal = render(
      alternatingPlanes(len, count),
      len,
      { frequency: 440, morph: (i) => (i < 128 ? 0 : 1) },
      { length: N },
    );

    expect(maxAbsoluteDifference(signal)).toBeLessThanOrEqual(
      PLANE_GAP / DECLICK + FLOAT32_STEP,
    );
    // And it arrives: a ramp that never lands would satisfy the bound too.
    expect(signal[N - 1]).toBe(count % 2 === 0 ? -1 : 1);
  });

  it("declicks a table change", () => {
    // Success criterion 4, and the audit's W2 measured again. Two three-plane
    // tables swapped mid-cycle at a fixed morph position, which is exactly what
    // `loadWavetable` does from the site demo's dropdown while audio runs. The
    // audit measured 0.5517 -> -0.2190, a step of 0.7707.
    //
    // The tables are the same length here, so `set()` keeps the read position -
    // the discontinuity is purely the change of data, which is the audit's case
    // exactly. The frequency is `SAMPLE_RATE / BLOCK`, which at len 256 makes
    // the increment exactly 2 samples: one block advances the read position by
    // a whole number of cycles, so the swapped oscillator and a fresh one are
    // at the same offset and can be compared sample for sample.
    const len = 256;
    const sines = new Float32Array(len * 3);
    const cosines = new Float32Array(len * 3);
    for (let p = 0; p < 3; p++) {
      for (let i = 0; i < len; i++) {
        const w = (2 * Math.PI * (p + 1) * i) / len;
        sines[p * len + i] = Math.sin(w);
        cosines[p * len + i] = Math.cos(w);
      }
    }

    const inputs = { frequency: [SAMPLE_RATE / BLOCK], morph: [0.4] };
    const osc = WavetableOscillator(SAMPLE_RATE);
    const before = new Float32Array(BLOCK);
    osc.set(sines, len);
    osc.agen(before, inputs);

    const after = new Float32Array(BLOCK);
    osc.set(cosines, len);
    osc.agen(after, inputs);

    expect(Math.abs(after[0] - before[BLOCK - 1])).toBeLessThan(0.02);

    // And the ramp is over inside the block - the second half is the new table
    // read straight, which is what makes this a declick and not a filter.
    const straight = new Float32Array(BLOCK);
    const reference = WavetableOscillator(SAMPLE_RATE);
    reference.set(cosines, len);
    reference.agen(straight, inputs);
    expect(Array.from(after.subarray(DECLICK))).toEqual(
      Array.from(straight.subarray(DECLICK)),
    );
    // The declick really was needed: undamped, the step is the audit's 0.7707
    // order of magnitude rather than a hundredth of it.
    expect(Math.abs(straight[0] - before[BLOCK - 1])).toBeGreaterThan(0.5);
  });

  it("takes an audio-rate ramp where morphFrequency used to be", () => {
    // Success criterion 5. `morphFrequency`'s default was a 0.05 Hz sawtooth
    // phasor; an `Lfo` at 0.05 Hz into `morph` is the same signal, and the
    // package no longer has to contain one. Its wrap - 1 back to 0 in a single
    // sample - is a real discontinuity now that the position is external, and
    // the declick is what covers it: measured 4.6e-6 at 0.05 Hz and 1.57e-2 at
    // 100 Hz, both under the ramp's own bound.
    const len = 64;
    const table = constantPlanes(len, 1, -1, 0);

    for (const [frequency, length] of [
      [0.05, SAMPLE_RATE * 2],
      [100, SAMPLE_RATE],
    ]) {
      const signal = render(
        table,
        len,
        { frequency: 440, morph: (i) => ((frequency * i) / SAMPLE_RATE) % 1 },
        { length },
      );
      expect(maxAbsoluteDifference(signal)).toBeLessThanOrEqual(
        PLANE_GAP / DECLICK + FLOAT32_STEP,
      );
      // The scan really did run: plane 1 is -1 and only a crossing reaches it.
      expect(peak(signal)).toBe(1);
    }
  });

  it.each([1, 2, 4])(
    "survives morph at both extremes and a-rate, %p planes",
    (count) => {
      // Every corner of the position input at once: the two ends of the
      // declared range, values outside it, NaN, and a sweep - against a table
      // with a single plane, where there is no axis to move along at all.
      const len = 64;
      const table = alternatingPlanes(len, count);
      const positions: (number | ((i: number) => number))[] = [
        0,
        1,
        -5,
        5,
        NaN,
        (i: number) => i / 255,
        (i: number) => (i % 2 === 0 ? 0 : 1),
      ];

      for (const morph of positions) {
        const signal = render(
          table,
          len,
          { frequency: 440, morph },
          { length: 256 },
        );
        for (const sample of signal) {
          expect(Number.isFinite(sample)).toBe(true);
          expect(Math.abs(sample)).toBeLessThanOrEqual(1);
        }
      }
    },
  );

  it("never leaves the range the planes span", () => {
    const len = 64;
    const signal = render(
      constantPlanes(len, 1, -1, 0),
      len,
      { morph: (i) => (i % SAMPLE_RATE) / (SAMPLE_RATE - 1) },
      { length: SAMPLE_RATE },
    );
    expect(peak(signal)).toBeLessThanOrEqual(1);
  });
});

describe("the pitch", () => {
  // `frequency` is Hz, at every table length and every sample rate, because the
  // worklet derives the increment from `sampleRate` and `len` instead of taking
  // a `baseFrequency` divisor it had no way of defaulting correctly. Ticket 03
  // deleted that parameter; before it, these twelve cases were `it.failing` and
  // the error was a constant per table length and independent of the requested
  // pitch: +776.6 cents at len 128, -423.4 at 256, -1623.4 at 512, -4023.4 at
  // 2048, against a docs page that said "the frequency of the oscillator in Hz".
  //
  // The tolerance is the ticket's 5 cents. The measured worst case over all 24
  // rows is 0.705 cents, at 110 Hz - which is the instrument, not the
  // oscillator: 32768 bins at 44.1 kHz is 1.35 Hz apart, and 1.35 Hz at 110 Hz
  // is 21 cents before the parabolic refinement gets it down to 0.7.
  const cases = [44100, 48000].flatMap((sampleRate) =>
    [128, 256, 512, 2048].flatMap((len) =>
      [110, 440, 1760].map((f0) => [sampleRate, len, f0] as const),
    ),
  );

  it.each(cases)(
    "delivers the request at %p Hz, from a %p-sample table, asked for %p Hz",
    (sampleRate, len, f0) => {
      const measured = peakFrequency(
        render(
          sineTable(len),
          len,
          { frequency: f0 },
          { warmup: WARMUP, sampleRate },
        ),
        sampleRate,
      );
      expect(centsFrom(measured, f0)).toBeLessThan(5);
    },
  );

  it("does not move when the table length does", () => {
    // Success criterion 5, and the property the old contract could not have:
    // `inc` grows with `len` now, exactly so that the pitch does not. The
    // tolerance is a millionth of a Hz rather than the 5 cents above, because
    // this is not a measurement of accuracy - it is the assertion that the four
    // renders are the *same* signal at four resolutions. All four read
    // 440.013937451017, differing only in the last two ulps of the FFT's
    // parabolic refinement (1.2e-13 Hz, about 5e-16 cents).
    const measured = [128, 256, 512, 2048].map((len) =>
      peakFrequency(
        render(sineTable(len), len, { frequency: 440 }, { warmup: WARMUP }),
        SAMPLE_RATE,
      ),
    );
    expect(Math.max(...measured) - Math.min(...measured)).toBeLessThan(1e-6);
    expect(centsFrom(measured[0], 440)).toBeLessThan(5);
  });

  it("delivers the top of the declared range instead of clamping it", () => {
    // The increment is ceilinged at Nyquist - one table cycle every two output
    // samples - and not lower. Ticket 01's ceiling of len/4 was sampleRate/4 Hz
    // under this formula, which would read 11025 Hz for every request above it:
    // 20000 Hz would arrive 1031 cents flat. `frequency`'s maxValue is 20000, so
    // a ceiling below Nyquist would put the bug this file exists to catch back
    // into the top 44% of the declared range.
    for (const sampleRate of [44100, 48000]) {
      const measured = peakFrequency(
        render(
          sineTable(256),
          256,
          { frequency: 20000 },
          { warmup: WARMUP, sampleRate },
        ),
        sampleRate,
      );
      expect(centsFrom(measured, 20000)).toBeLessThan(5);
    }
  });
});

describe("the pitch inputs", () => {
  /**
   * Ticket 09's four additions, which are one expression:
   *
   *     inc = frequency * 2^(detune/1200) * len / sampleRate
   *
   * a-rate on both terms, signed, and with `phase` seeding the read position it
   * accumulates into. The sign is the whole of through-zero FM here - the read
   * pointer decrements and ticket 01's floor-based wrap carries it round the
   * other way - against a discontinuity scheduler rewritten around a signed
   * increment in the sibling package.
   */

  const len = 256;
  const saw = sawTable(len);
  const pyramid = mipmapWavetable({ data: saw, length: len });
  const levels = pyramid.levels ?? 1;

  /** A ramp plane: the read position is readable straight off the output. */
  const rampTable = Float32Array.from({ length: len }, (_, i) => i / len);

  it.each([-1200, -700, -5, 0, 5, 700, 1200])(
    "detunes by the cents it is given: %p",
    (cents) => {
      // Success criterion 4. The tolerance is the ticket's 2 cents; the measured
      // worst case over these seven rows is 0.231 cents, at -700, and it is the
      // instrument rather than the ratio - 32768 bins at 44.1 kHz are 1.35 Hz
      // apart, which at 293 Hz is 8 cents before the parabolic refinement.
      const f0 = 440 * Math.pow(2, cents / 1200);
      const measured = peakFrequency(
        render(
          sineTable(len),
          len,
          { frequency: 440, detune: cents },
          { warmup: WARMUP },
        ),
        SAMPLE_RATE,
      );
      expect(centsFrom(measured, f0)).toBeLessThan(2);
    },
  );

  it("takes the detune a-rate", () => {
    // The same ratio applied per sample rather than per block. A detune held
    // constant but *delivered* a-rate must be the same signal as the k-rate one,
    // sample for sample: the two paths compute the same increment and the a-rate
    // one must not accumulate anything extra on the way.
    const kRate = render(
      sineTable(len),
      len,
      { frequency: 440, detune: 700 },
      { length: 2048 },
    );
    const aRate = render(
      sineTable(len),
      len,
      { frequency: 440, detune: () => 700 },
      { length: 2048 },
    );
    expect(Array.from(aRate)).toEqual(Array.from(kRate));
  });

  it("tracks an a-rate frequency", () => {
    // Success criterion 1 at the DSP boundary. A chirp from 200 to 3200 Hz over
    // 4096 samples, a new frequency every sample and 32 block boundaries
    // crossed: finite, in range, and continuous - the largest sample step is
    // 0.9941, which is the band-limited sawtooth's own reset and not an artifact
    // of the sweep.
    const signal = render(
      pyramid.data,
      len,
      { frequency: (i) => 200 + (i * 3000) / 4095 },
      { length: 4096, levels },
    );
    for (const sample of signal) {
      expect(Number.isFinite(sample)).toBe(true);
      expect(Math.abs(sample)).toBeLessThanOrEqual(1.2);
    }
    expect(maxAbsoluteDifference(signal)).toBeLessThan(1);
    // And it really swept: a chirp that stalled would satisfy the bounds too.
    expect(peak(signal)).toBeGreaterThan(0.9);
  });

  it("runs the phase backwards", () => {
    // Success criterion 2, and it is exact rather than close. At
    // `frequency = sampleRate / len` the increment is exactly 1, so a forward
    // render walks the table one sample at a time and a backward one walks it
    // the other way from the same start: `bwd[k]` is `fwd[(len - k) mod len]`,
    // measured to a worst error of 0 over the whole cycle.
    //
    // The plane is deliberately asymmetric - a pulse then a ramp - because a
    // symmetric one is its own time-reverse and would pass whatever the sign did.
    const f0 = SAMPLE_RATE / len;
    const table = Float32Array.from({ length: len }, (_, i) =>
      i < len / 4 ? 1 : -0.25 + i / len,
    );
    const forward = render(table, len, { frequency: f0 }, { length: len });
    const backward = render(table, len, { frequency: -f0 }, { length: len });
    for (let k = 0; k < len; k++)
      expect(backward[k]).toBe(forward[(len - k) % len]);
  });

  it("survives frequency crossing zero", () => {
    // Success criterion 3. A modulator sweeping the full declared range inside
    // one 128-frame block, over and over: nothing is rectified at the bottom,
    // nothing is non-finite, and the peak stays at 0.8671.
    const fast = render(
      pyramid.data,
      len,
      { frequency: (i) => -20000 + (40000 * (i % BLOCK)) / (BLOCK - 1) },
      { length: 4096, levels },
    );
    for (const sample of fast) {
      expect(Number.isFinite(sample)).toBe(true);
      expect(Math.abs(sample)).toBeLessThanOrEqual(1.2);
    }

    // And the crossing itself costs nothing. A slow sweep from -50 to +50 Hz
    // takes its largest sample step *at* the crossing only in the sense that it
    // takes it everywhere: 0.339928 against 0.339928 for a steady render at
    // either sign. That is the waveform's own slope at that read speed, which is
    // the ticket's "no discontinuity beyond one increment" made exact - the
    // sweep is not allowed to be rougher than standing still is.
    const slow = render(
      pyramid.data,
      len,
      { frequency: (i) => -50 + (100 * i) / 4095 },
      { length: 4096, levels },
    );
    const steady = Math.max(
      maxAbsoluteDifference(
        render(pyramid.data, len, { frequency: 50 }, { length: 4096, levels }),
      ),
      maxAbsoluteDifference(
        render(pyramid.data, len, { frequency: -50 }, { length: 4096, levels }),
      ),
    );
    expect(maxAbsoluteDifference(slow)).toBeLessThanOrEqual(steady);
    for (const sample of slow) expect(Number.isFinite(sample)).toBe(true);
  });

  it("starts where phase says", () => {
    // Success criterion 5. On a ramp plane the read position *is* the output, so
    // a phase of 0.25 emits 0.25 first. Held there by `frequency: 0`, which
    // freezes the pointer, so the assertion is about the seed and nothing else.
    for (const [phase, expected] of [
      [0, 0],
      [0.25, 0.25],
      [0.5, 0.5],
      // Taken modulo 1, so both of these are the same quarter turn.
      [1.25, 0.25],
      [-0.75, 0.25],
    ] as const) {
      const signal = render(
        rampTable,
        len,
        { frequency: 0 },
        { length: 4, phase },
      );
      expect(signal[0]).toBe(Math.fround(expected));
    }

    // Anything that is not a phase is 0 rather than reaching `offset`, which is
    // absorbing: a NaN read position never comes back.
    for (const phase of [NaN, Infinity, -Infinity]) {
      const signal = render(
        rampTable,
        len,
        { frequency: 0 },
        { length: 4, phase },
      );
      expect(signal[0]).toBe(0);
    }
  });

  it("draws a different phase per instance for 'random'", () => {
    // The other half of criterion 5, and the whole reason the option exists:
    // three oscillators built at phase 0 begin phase-locked and comb through
    // their attack. Two draws colliding on a 256-sample table is a 1-in-2^52
    // event rather than a 1-in-256 one - the draw is a float, and `offset` is
    // seeded before the read quantises it.
    const draws = new Set(
      Array.from(
        { length: 8 },
        () =>
          render(
            rampTable,
            len,
            { frequency: 0 },
            { length: 4, phase: "random" },
          )[0],
      ),
    );
    expect(draws.size).toBe(8);
  });

  it("keeps the initial phase across a table of a different length", () => {
    // `set()` restates the read position whenever the length changes, because a
    // position into a 2048-sample table means nothing in a 64-sample one. It
    // restates it at *this instance's* phase rather than at zero, which is what
    // makes `phase: "random"` survive a `loadWavetable` from the dropdown.
    const osc = WavetableOscillator(SAMPLE_RATE, 0.25);
    const buffer = new Float32Array(4);
    const inputs = inputsOf({ frequency: 0 });
    osc.set(rampTable, len);
    osc.agen(buffer, inputs);
    expect(buffer[0]).toBe(0.25);

    const short = Float32Array.from({ length: 64 }, (_, i) => i / 64);
    osc.set(short, 64);
    // 64 samples of declick from the table swap, then the new table read
    // straight - at the same quarter turn, 0.25.
    const after = new Float32Array(128);
    osc.agen(after, inputs);
    expect(after[127]).toBe(0.25);
  });

  it("survives detune at both extremes", () => {
    // Success criterion 6's totality half: an octave of detune either way
    // against a frequency of zero and both ends of the declared range. The
    // corner worth naming is `frequency: 20000, detune: 1200` - 40 kHz, whose
    // increment clamps to Nyquist, `len / 2`. Reading a 256-sample table every
    // 128 samples at the top mip level, which holds one harmonic, lands on that
    // harmonic's zero crossings: the output is exact silence, which is the right
    // answer rather than a defect.
    for (const frequency of [0, 20000, -20000, NaN]) {
      for (const detune of [-1200, 0, 1200, NaN]) {
        const osc = WavetableOscillator(SAMPLE_RATE);
        osc.set(pyramid.data, len, levels);
        const buffer = new Float32Array(256);
        osc.agen(buffer, {
          frequency: [frequency],
          detune: [detune],
          morph: [0.5],
        });
        for (const sample of buffer) {
          expect(Number.isFinite(sample)).toBe(true);
          expect(Math.abs(sample)).toBeLessThanOrEqual(1.2);
        }
        // And it recovers, which is what the comparison-form clamp is for: a NaN
        // increment would have reached `offset` and stayed there forever.
        osc.agen(buffer, { frequency: [440], detune: [0], morph: [0.5] });
        for (const sample of buffer) expect(Number.isFinite(sample)).toBe(true);
        expect(peak(buffer)).toBeGreaterThan(0);
      }
    }
  });

  it("declicks a stepped k-rate pitch and not an a-rate one", () => {
    // Ticket 06 handed this ticket a question: the level-jump declick's
    // threshold, `|level| > 0.5`, is per-sample-shaped, so at a-rate it fires
    // per sample and degrades to a permanent 64-sample slew. Measured on a
    // 440 Hz carrier at 200 Hz of modulation it never fires at all below
    // +-1000 Hz of depth, and at +-3000 Hz it fires 1600 times per second with
    // the ramp running for 62.4 % of the samples - which is a lowpass on the
    // sweep the caller asked for, worth 0.85 dB of RMS and 434 Hz of spectral
    // centroid. **So it is suppressed when the pitch is a-rate**, and the
    // two-level crossfade is left to represent the movement, which is what it
    // is for.
    //
    // Both halves of that, on one signal: 110 -> 7040 Hz, five mip levels,
    // stepped at a block boundary. Through the k-rate path the step measures
    // 0.001685; through the a-rate path 0.107845, which is 64x it, exactly the
    // ratio a 64-sample linear ramp gives.
    const stepped = (i: number) => (i < 512 ? 110 : 7040);

    const osc = WavetableOscillator(SAMPLE_RATE);
    osc.set(pyramid.data, len, levels);
    const kRate = new Float32Array(1024);
    const buffer = new Float32Array(BLOCK);
    for (let at = 0; at < 1024; at += BLOCK) {
      osc.agen(buffer, {
        frequency: [stepped(at)],
        detune: [0],
        morph: [0],
      });
      kRate.set(buffer, at);
    }
    const aRate = render(
      pyramid.data,
      len,
      { frequency: stepped },
      { length: 1024, levels },
    );

    const kStep = Math.abs(kRate[512] - kRate[511]);
    const aStep = Math.abs(aRate[512] - aRate[511]);
    expect(kStep).toBeLessThan(0.002);
    expect(aStep).toBeGreaterThan(0.1);
    expect(aStep / kStep).toBeGreaterThan(60);
  });

  it("stays bright under deep audio-rate FM", () => {
    // The audible consequence of the decision above, pinned as a number. The
    // patch is the one it was measured on: a 440 Hz carrier, +-3000 Hz at
    // 200 Hz, on the mipmapped sawtooth. Suppressed, the spectral centroid is
    // 4748.4 Hz; with the ramp left running it is 4314.2 Hz. If the suppression
    // is ever removed this drops by 434 Hz and this assertion is what says so.
    const signal = render(
      pyramid.data,
      len,
      {
        frequency: (i) =>
          440 + 3000 * Math.sin((2 * Math.PI * 200 * i) / SAMPLE_RATE),
      },
      { length: ANALYSIS_LENGTH, levels },
    );
    const measured = centroid(signal, SAMPLE_RATE);
    expect(measured).toBeGreaterThan(4600);
    expect(Math.abs(measured - 4748.4)).toBeLessThan(1);
  });
});

describe("hard sync", () => {
  /**
   * A rising edge on `sync` restarts the table read at `phase`, at the
   * **sub-sample instant the gate crossed**, with the step *and* the corner
   * band-limited by `_blep.ts`'s 4-point B-spline kernels. That costs two
   * samples of output latency, which ticket 10 exists to decide rather than
   * assume.
   *
   * **The decision, measured.** Alias SNR in dB with ticket 06's pyramid on, a
   * naive sawtooth master into `sync` and a 256-sample sawtooth slave. `8x` is
   * the same patch rendered at 352.8 kHz and decimated through a 513-tap
   * windowed sinc - the ceiling no correction can beat.
   *
   *   master  ratio   naive   sub-sample  +BLEP   +BLAMP   8x
   *   110     1.5     32.0    49.0        49.2    49.6     50.1
   *   110     2.5     30.2    54.2        54.1    55.1     63.0
   *   110     2.73    29.6    43.0        53.0    53.9     56.4
   *   440     1.5     20.9    38.7        38.7    52.9     59.8
   *   440     2.5     19.2    38.2        38.2    51.7     59.5
   *   440     2.73    18.6    30.2        38.0    49.7     48.9
   *   1760    1.5     14.3    32.1        32.1    46.8     55.7
   *   1760    2.5     12.2    31.4        31.4    45.5     55.0
   *   1760    2.73    11.6    21.9        28.2    40.1     41.3
   *
   * **17.6 to 33.9 dB over the naive reset**, against the ticket's bar of 6, so
   * the two samples are bought. The rows are the floors below, and the reason
   * they are pinned rather than described: removing either kernel drops them
   * back into the middle columns and fails a test.
   *
   * **Both kernels are needed.** At the classic half-integer ratios the step
   * height on a sawtooth table is *exactly zero* - the reset alternates between
   * half a cycle and none, and a sawtooth's value at half a cycle equals its
   * value at zero - so `+BLEP` is bit-identical to the uncorrected arm on those
   * rows and all 14.2 dB at 440 Hz comes from the BLAMP. A wavetable reset is a
   * corner at least as often as it is a step.
   *
   * **The metric runs with `removeDC` on, and only here.** A hard-synced
   * sawtooth carries a large and entirely real DC component - 0.164 at 110 Hz,
   * ratio 1.5 - and `aliasSnr` counts bin 0 as noise, so leaving it in buries
   * the measurement: every arm above reads 8-16 dB and they are
   * indistinguishable. The unsynced floors keep `removeDC` off, where the DC is
   * not real.
   *
   * **And the reset is never declicked**, which reverses ticket 09's handoff.
   * A 64-sample ramp needs the next edge more than 64 samples away, so above
   * `sampleRate / 64` - 689 Hz - it never completes: at a 1760 Hz master it
   * takes the peak from 0.96 to 0.32 and the alias SNR to 14.4 dB.
   */

  const len = 256;
  const saw = sawTable(len);
  const pyramid = mipmapWavetable({ data: saw, length: len });
  const levels = pyramid.levels ?? 1;

  /** The two samples the pending ring costs. */
  const LATENCY = 2;

  /** A ramp plane: the read position is readable straight off the output. */
  const rampTable = Float32Array.from({ length: len }, (_, i) => i / len);

  /**
   * A naive bipolar sawtooth master at `f0`: one rising zero crossing per
   * cycle, and a linear one, so the crossing's sub-sample instant is exactly
   * recoverable from the two samples either side of it. This is the patch -
   * `PolyblepOscillator` into `sync` - and not a test convenience.
   */
  const rampGate = (f0: number) => (i: number) =>
    2 * (((f0 * i) / SAMPLE_RATE) % 1) - 1 + 1e-12;

  /** The other shape a caller writes: `setValueAtTime(1, t)`, a hard step. */
  const stepGate = (at: number) => (i: number) => (i >= at ? 1 : 0);

  it("restarts on a rising edge", () => {
    // Success criterion 1. A step gate at sample 300 puts the crossing at the
    // sample boundary, so the read restarts at `phase` on sample 300 itself and
    // appears at output 302.
    //
    // The assertion is made two samples past that, at output 304, because the
    // 4-point residual's support is the four slots around the reset: samples
    // 298 through 301 carry a correction and sample 302 onward is the naive
    // read. On a ramp plane that read *is* the position, so `2 * inc / len` is
    // exact rather than approximate.
    const f0 = 440;
    const inc = (f0 * len) / SAMPLE_RATE;
    const signal = render(
      rampTable,
      len,
      { frequency: f0, sync: stepGate(300) },
      { length: 512 },
    );
    expect(signal[300 + LATENCY + 2]).toBe(Math.fround((2 * inc) / len));
    // And it really restarted: without the reset the position would have been
    // most of the way round the table, nowhere near the start.
    expect(signal[300 + LATENCY - 3]).toBeGreaterThan(0.5);
  });

  it("places the reset at the sub-sample instant the gate crossed", () => {
    // The half of criterion 1 that is the reason `sync` is a-rate at all. A
    // ramp gate crossing zero a known fraction of a sample before sample 300
    // restarts the read at `phase` *at the crossing*, so by sample 300 the
    // position has already advanced by that fraction of an increment.
    //
    // Two samples past the support the output is the naive read again, so the
    // position is `(d + 2) * inc / len` exactly - and it differs from the
    // sample-quantised answer by `d * inc / len`, which is what the whole
    // sub-sample path buys.
    const f0 = 440;
    const inc = (f0 * len) / SAMPLE_RATE;
    for (const d of [0.25, 0.5, 0.75]) {
      // The crossing is `1 - d` of the way from sample 299 to sample 300, which
      // is `d` samples *before* 300 - the age the correction is placed at.
      const gate = (i: number) => (i < 300 ? -(1 - d) : i - 300 + d);
      const signal = render(
        rampTable,
        len,
        { frequency: f0, sync: gate },
        { length: 512 },
      );
      expect(signal[300 + LATENCY + 2]).toBeCloseTo(((d + 2) * inc) / len, 6);
    }
  });

  // A read position slow enough that the table does not wrap inside the render,
  // so the output of a ramp plane is the number of samples since the last reset,
  // divided by 1024, and can be asserted exactly.
  const SLOW = SAMPLE_RATE / 1024;

  it("does not restart while the gate stays high", () => {
    // Success criterion 2. The gate contract fires on the transition from
    // non-positive to positive and nothing else, so a gate held high for 600
    // samples resets once, at its edge, and not 600 times.
    //
    // Asserted on the position rather than by counting steps: on a ramp plane
    // the output *is* the position, so 200 and 400 samples after the single
    // reset it must be exactly 200/1024 and 400/1024. A per-sample retrigger
    // would pin it near zero, and any second reset would show up as a smaller
    // number at the later point.
    const signal = render(
      rampTable,
      len,
      { frequency: SLOW, sync: stepGate(400) },
      { length: 1000 },
    );
    expect(signal[600 + LATENCY]).toBe(Math.fround(200 / 1024));
    expect(signal[800 + LATENCY]).toBe(Math.fround(400 / 1024));
  });

  it("re-arms on a falling edge", () => {
    // The other half of the contract: a gate that returns to non-positive and
    // rises again fires again. Two edges, two resets, and the second one is what
    // makes the position at 950 read from 800 rather than from 400.
    const signal = render(
      rampTable,
      len,
      {
        frequency: SLOW,
        sync: (i) => ((i >= 400 && i < 500) || i >= 800 ? 1 : 0),
      },
      { length: 1000 },
    );
    expect(signal[600 + LATENCY]).toBe(Math.fround(200 / 1024));
    expect(signal[950 + LATENCY]).toBe(Math.fround(150 / 1024));
  });

  it("costs exactly two samples and nothing else when the gate is silent", () => {
    // A connected but silent `sync` must be the same oscillator, delayed by the
    // ring and by nothing else - no correction is written, so the pending slots
    // carry the naive samples untouched.
    //
    // This is also the assertion that says what the latency *is*. It is paid
    // whether or not anything is connected, because a latency that changed when
    // a cable was plugged in would step the output by two samples mid-note; the
    // same two samples `polyblep-oscillator` pays, so the library's two
    // oscillators stay aligned with each other.
    const params = { frequency: 440, morph: 0.5 };
    const bare = render(pyramid.data, len, params, { length: 1024, levels });
    const gated = render(
      pyramid.data,
      len,
      { ...params, sync: () => 0 },
      { length: 1024, levels },
    );
    expect(gated[0]).toBe(0);
    expect(gated[1]).toBe(0);
    expect(Array.from(gated.subarray(LATENCY))).toEqual(
      Array.from(bare.subarray(0, 1024 - LATENCY)),
    );
  });

  it.each([
    [110, 1.5, 48.1, 49.62],
    [110, 2.5, 53.5, 55.09],
    [110, 1.37, 53.9, 55.44],
    [110, 2.73, 52.4, 53.9],
    [440, 1.5, 51.3, 52.86],
    [440, 2.5, 50.2, 51.71],
    [440, 1.37, 49.8, 51.34],
    [440, 2.73, 48.2, 49.72],
    [1760, 1.5, 45.3, 46.81],
    [1760, 2.5, 44.0, 45.51],
    [1760, 1.37, 41.9, 43.46],
    [1760, 2.73, 38.6, 40.13],
  ])(
    "keeps sync alias SNR above %p Hz at ratio %p's floor of %p dB",
    (f0, ratio, floorDb, measuredDb) => {
      // Success criterion 3, and the ticket's decision as an assertion. The
      // floors are 1.5 dB below the measurement and the measurement is pinned
      // to 0.15 dB. Take either kernel out and these collapse to the
      // 21.9-38.7 dB of the uncorrected arm; take the sub-sample placement out
      // as well and to 11.6-32.0 dB.
      const signal = render(
        pyramid.data,
        len,
        { frequency: f0 * ratio, sync: rampGate(f0) },
        { warmup: WARMUP, levels },
      );
      const measured = aliasSnr(signal, f0, SAMPLE_RATE, { removeDC: true });
      expect(measured).toBeGreaterThan(floorDb);
      expect(Math.abs(measured - measuredDb)).toBeLessThan(0.15);
    },
  );

  it.each([0.5, 1, 1.37, 2, 2.5, 3.7, 5, 8])(
    "stays finite under a-rate sync at ratio %p",
    (ratio) => {
      // Success criterion 4's totality half: every sync ratio the ticket names,
      // integer and not, against a master sweeping the audible range - and with
      // the pitch a-rate too, so the increment, the mip level and the reset all
      // move inside the same sample.
      for (const f0 of [55, 440, 3520]) {
        const signal = render(
          pyramid.data,
          len,
          {
            frequency: (i) =>
              f0 * ratio * (1 + 0.5 * Math.sin((2 * Math.PI * 60 * i) / 44100)),
            sync: rampGate(f0),
            morph: 0.5,
          },
          { length: 4096, levels },
        );
        for (const sample of signal) {
          expect(Number.isFinite(sample)).toBe(true);
          expect(Math.abs(sample)).toBeLessThanOrEqual(2);
        }
        expect(peak(signal)).toBeGreaterThan(0);
      }
    },
  );

  it("syncs correctly while morphing", () => {
    // Success criterion 4's other half. The step height and the corner are read
    // at the *live* morph position and mip level, not at a cached plane pair, so
    // a reset landing mid-crossfade is corrected against the waveform actually
    // being played.
    //
    // Against a table whose planes are maximally different - the crossfade is
    // where a stale plane index would show up as a step of up to 2.0 - and with
    // the position swept a-rate under the sync. Nothing may leave the range the
    // planes span by more than the correction's own overshoot.
    const short = 64;
    const table = constantPlanes(
      short,
      ...Array.from({ length: 4 }, (_, k) => (k % 2 === 0 ? 1 : -1)),
    );
    const signal = render(
      table,
      short,
      {
        frequency: 660,
        sync: rampGate(220),
        morph: (i) => (i % 4096) / 4095,
      },
      // Past the ring's own fill: the first two samples of a synced instance are
      // the empty slots, which is a step like any other cold start and is pinned
      // in `costs exactly two samples` above.
      { length: 8192, warmup: 4 },
    );
    for (const sample of signal) {
      expect(Number.isFinite(sample)).toBe(true);
      expect(Math.abs(sample)).toBeLessThanOrEqual(1.5);
    }

    // And the correction really is reading the right planes: on constant planes
    // the pre- and post-reset values are equal whenever the position is on a
    // plane, so the only steps left are the crossfade's own. Measured 0.0323
    // against the 2.0 a plane-pair error would produce.
    expect(maxAbsoluteDifference(signal)).toBeLessThan(0.5);
  });

  it("does not depend on the block size with an a-rate sync", () => {
    // The ring is instance state precisely so that a correction whose support
    // reaches past the end of a render quantum lands in the next one. If it ever
    // became block-local, an edge near a boundary would render differently at
    // 128 and at 1024 - which is what this reads.
    const params = {
      frequency: 660,
      sync: rampGate(220),
      morph: 0.5,
    };
    const options = { levels, length: 2048 };
    const eightBlocks = render(pyramid.data, len, params, {
      ...options,
      block: 128,
    });
    const oneBlock = render(pyramid.data, len, params, {
      ...options,
      block: 1024,
    });
    expect(eightBlocks).toEqual(oneBlock);
  });

  it("carries the kernels the correction is defined against", () => {
    // `_blep.ts` is a copied file, so its polynomials are pinned here rather
    // than trusted: the residual for a unit rising step jumps by exactly -1
    // across the discontinuity (which is what cancels the naive step), is odd
    // about it, and vanishes outside its support. The BLAMP is its integral,
    // so it is even, peaks at 7/30 and is the antiderivative of the residual.
    expect(blepResidual4(-2)).toBe(0);
    expect(blepResidual4(2)).toBe(0);
    expect(blepResidual4(0) - blepResidual4(-1e-12)).toBeCloseTo(-1, 9);
    for (const t of [0.1, 0.4, 0.9, 1.3, 1.8])
      expect(blepResidual4(t)).toBeCloseTo(-blepResidual4(-t), 12);

    expect(blampResidual4(2)).toBe(0);
    expect(blampResidual4(0)).toBeCloseTo(7 / 30, 12);
    const h = 1e-6;
    for (const d of [0.3, 0.8, 1.2, 1.7]) {
      const derivative =
        (blampResidual4(d + h) - blampResidual4(d - h)) / (2 * h);
      expect(derivative).toBeCloseTo(blepResidual4(d), 6);
    }
  });
});

describe("aliasing", () => {
  // A 256-sample table holding a full-bandwidth saw, played at its natural
  // pitch multiplied up, with the mipmap pyramid ticket 06 built for it.
  //
  // The floors are 1.5 dB below what the code measures, and the third column is
  // the measurement itself, pinned to 0.15 dB. Against the audit's own columns:
  //
  //   f0     shipped before   this        audit's band-limited   audit's
  //                           ticket      reference (ideal)      1 mipmap/octave
  //   110    56.50            59.26       56.6                   -
  //   220    32.32            48.39       39.2                   44.5
  //   440    23.71            57.40       48.5                   53.6
  //   880    18.26            66.14       57.5                   62.4
  //   1760   13.92            74.49       66.8                   71.7
  //   3520   10.39            82.13       75.1                   79.6
  //
  // Above the reference column at every pitch, because the crossfade forces the
  // pyramid to be conservative: the level in use is band-limited between one and
  // zero octaves below Nyquist rather than exactly at it, so some harmonics the
  // reference keeps are gone. That is the trade the crossfade buys, and the row
  // below - the same table with no pyramid - is what it is bought against.
  const len = 256;
  const raw = sawTable(len);
  // Through the *imported* path: `sawTable` is samples, not a spectrum, so this
  // block exercises the analysis-and-truncate half of the ticket. The generated
  // half measures 48.21 / 57.38 / 66.13 / 74.49 / 82.13 on the same waveform,
  // pinned in `describe("the built-in table")` below.
  const pyramid = mipmapWavetable({ data: raw, length: len });

  it.each([
    [110, 57.7, 59.26],
    [220, 46.9, 48.39],
    [440, 55.9, 57.4],
    [880, 64.6, 66.14],
    [1760, 73.0, 74.49],
    [3520, 80.6, 82.13],
  ])("stays above %p Hz's floor of %p dB", (f0, floorDb, measuredDb) => {
    const signal = render(
      pyramid.data,
      len,
      { frequency: f0 },
      { warmup: WARMUP, levels: pyramid.levels },
    );
    const measured = aliasSnr(signal, f0, SAMPLE_RATE);

    expect(measured).toBeGreaterThan(floorDb);
    expect(Math.abs(measured - measuredDb)).toBeLessThan(0.15);
  });

  it.each([
    [110, 59.26],
    [220, 48.39],
    [440, 57.4],
    [880, 66.14],
    [1760, 74.49],
    [3520, 82.13],
  ])("holds %p Hz's floor through the a-rate path too: %p dB", (f0, db) => {
    // Ticket 09 made `frequency` a-rate, which moved the increment and its mip
    // level from once per block to once per sample. The rows above drive it
    // k-rate - a one-element array, which is how an unconnected `AudioParam`
    // arrives - and this one drives the same six pitches through the per-sample
    // path with a constant a-rate array, which is how a connected one arrives.
    //
    // **They agree to the printed precision at every pitch.** The mip level is a
    // function of the increment and of nothing else, so computing it per sample
    // cannot change a constant-pitch render; if it ever does, some per-block
    // state has leaked into the loop and this is the row that catches it.
    const measured = aliasSnr(
      render(
        pyramid.data,
        len,
        { frequency: () => f0 },
        { warmup: WARMUP, levels: pyramid.levels },
      ),
      f0,
      SAMPLE_RATE,
    );
    expect(Math.abs(measured - db)).toBeLessThan(0.15);
  });

  it.each([
    [110, 56.5],
    [220, 32.3],
    [440, 23.7],
    [880, 18.3],
    [1760, 13.9],
    [3520, 10.4],
  ])(
    "is the audit's own %p Hz figure with no pyramid: %p dB",
    (f0, auditDb) => {
      // The calibration row, kept from ticket 02. The same table played with
      // `levels: 1` is the code as it was before ticket 06 - every harmonic above
      // Nyquist folding back - and it still reproduces the audit's published
      // column to 0.15 dB. If the instrument or the harness ever drifts, this is
      // what says so, and it is what makes the floors above comparable to
      // anything the audit wrote down.
      const measured = aliasSnr(
        render(raw, len, { frequency: f0 }, { warmup: WARMUP }),
        f0,
        SAMPLE_RATE,
      );
      expect(Math.abs(measured - auditDb)).toBeLessThan(0.15);
    },
  );

  it("does not step across an octave boundary", () => {
    // Success criterion 2, and the half of the ticket the audit never mentioned:
    // PowerWave (Trausmuth & Huovilainen, DAFx-05 §2.3) crossfades mip levels
    // exactly as it crossfades wavetable positions, and without it a pitch sweep
    // steps its harmonic content audibly at every octave.
    //
    // 61 renders from 300 to 700 Hz - across `inc = 2` at 344.5 Hz and `inc = 4`
    // at 689.1 Hz, two level crossovers - measuring RMS and alias SNR at each.
    // Both move smoothly. The largest single step in RMS is 0.175 % and it is
    // not at a crossover - the largest step at one is 0.086 %, half of it - and
    // the alias SNR stays above 53.79 dB everywhere, its worst point being
    // 308.6 Hz rather than a boundary.
    const steps = 60;
    const rms = (signal: ArrayLike<number>) => {
      let sum = 0;
      for (let i = 0; i < signal.length; i++) sum += signal[i] * signal[i];
      return Math.sqrt(sum / signal.length);
    };

    const levelOf = (f0: number) =>
      Math.floor(Math.log2((f0 * len) / SAMPLE_RATE)) + 1;
    const points = Array.from({ length: steps + 1 }, (_, k) => {
      const f0 = 300 * Math.pow(700 / 300, k / steps);
      const signal = render(
        pyramid.data,
        len,
        { frequency: f0 },
        { warmup: WARMUP, length: 16384, levels: pyramid.levels },
      );
      return { f0, rms: rms(signal), snr: aliasSnr(signal, f0, SAMPLE_RATE) };
    });

    // Two crossings, or the sweep does not test what it says it does.
    expect(new Set(points.map((p) => levelOf(p.f0))).size).toBe(3);

    let worst = 0;
    let worstAtCrossover = 0;
    for (let i = 1; i < points.length; i++) {
      const step = Math.abs(points[i].rms - points[i - 1].rms) / points[i].rms;
      worst = Math.max(worst, step);
      if (levelOf(points[i].f0) !== levelOf(points[i - 1].f0)) {
        worstAtCrossover = Math.max(worstAtCrossover, step);
      }
      expect(points[i].snr).toBeGreaterThan(53);
    }
    // A step at a crossover is no larger than the largest step away from one:
    // the level axis is doing nothing the pitch sweep was not already doing.
    expect(worstAtCrossover).toBeLessThanOrEqual(worst);
    expect(worst).toBeLessThan(0.01);
  });

  it("is the dominant error by 69 dB, which closes the cubic question", () => {
    // A single-harmonic table, so the only error left is the interpolator's.
    // Linear reads 92.9 dB at len 256; the audit measured cubic (Catmull-Rom)
    // at 109.8 dB on the same signal. That is 17 dB of improvement on an error
    // already 69 dB below the aliasing measured directly above at the same
    // pitch. **Do not spend effort on a higher-order interpolator**; the
    // decisions table in the series README records this as closed, and this
    // assertion is what keeps it closed.
    const signal = render(
      sineTable(len),
      len,
      { frequency: 440 },
      { warmup: WARMUP },
    );
    const measured = aliasSnr(signal, 440, SAMPLE_RATE);
    expect(measured).toBeGreaterThan(91);
    expect(Math.abs(measured - 92.9)).toBeLessThan(0.15);
  });
});

describe("the built-in table", () => {
  // Ticket 04's generated set, measured with the same instrument and at the same
  // pitches as the `aliasing` block above, one plane at a time so the number is
  // the plane's and not the crossfade's.
  //
  // These are level 0 of each plane's pyramid, read on its own with `levels: 1`,
  // so they are the *unfiltered* figures and they have not moved: level 0 is the
  // full-bandwidth plane it always was, and the band-limiting is a level the
  // oscillator selects rather than a change to the data. The sawtooth row is the
  // *same object* as this file's `sawTable` reference to within 0.07 dB at every
  // pitch, which is what let ticket 06 raise the floors above against the audit's
  // own column rather than re-characterising a new waveform.
  //
  // What the pyramid does with them is the row below.
  const len = 256;
  const planes: [string, number, number[]][] = [
    ["sine", 0, [98.17, 91.09, 92.89, 92.64, 91.92, 91.06]],
    ["triangle", 1, [92.49, 72.29, 60.92, 50.99, 40.45, 31.46]],
    ["sawtooth", 2, [56.5, 32.25, 23.68, 18.24, 13.91, 10.38]],
    ["square", 3, [58.11, 33.94, 25.38, 20.18, 15.54, 11.92]],
  ];
  const pitches = [110, 220, 440, 880, 1760, 3520];
  const { data } = defaultWavetable(len);

  it.each(planes)("the %s plane aliases as measured", (_name, index, dbs) => {
    const plane = data.slice(index * len, (index + 1) * len);
    pitches.forEach((f0, i) => {
      const signal = render(plane, len, { frequency: f0 }, { warmup: WARMUP });
      expect(Math.abs(aliasSnr(signal, f0, SAMPLE_RATE) - dbs[i])).toBeLessThan(
        0.15,
      );
    });
  });

  it("is the audit's own sawtooth, so ticket 06 inherits its column", () => {
    const generated = data.slice(2 * len, 3 * len);
    const reference = sawTable(len);
    for (const f0 of pitches) {
      const a = aliasSnr(
        render(generated, len, { frequency: f0 }, { warmup: WARMUP }),
        f0,
        SAMPLE_RATE,
      );
      const b = aliasSnr(
        render(reference, len, { frequency: f0 }, { warmup: WARMUP }),
        f0,
        SAMPLE_RATE,
      );
      expect(Math.abs(a - b)).toBeLessThan(0.1);
    }
  });

  it("band-limits the generated sawtooth as the imported one", () => {
    // Success criterion 3 measured where criterion 4 is measured, on the same
    // waveform: the generated path truncates the harmonic series and the
    // imported path truncates an analysis of the samples, and at the morph
    // position that selects the sawtooth plane they agree to 0.2 dB - the
    // residue being that the built-in plane is one of four being crossfaded
    // rather than a table of its own.
    const measured = [48.21, 57.38, 66.13, 74.49, 82.13];
    const { data, levels } = defaultWavetable(len);
    [220, 440, 880, 1760, 3520].forEach((f0, i) => {
      const signal = render(
        data,
        len,
        { frequency: f0, morph: 2 / 3 },
        { warmup: WARMUP, levels },
      );
      expect(
        Math.abs(aliasSnr(signal, f0, SAMPLE_RATE) - measured[i]),
      ).toBeLessThan(0.15);
    });
  });

  it("plays every plane at the pitch it is asked for", () => {
    for (let index = 0; index < 4; index++) {
      const plane = data.slice(index * len, (index + 1) * len);
      const measured = peakFrequency(
        render(plane, len, { frequency: 440 }, { warmup: WARMUP }),
        SAMPLE_RATE,
      );
      expect(centsFrom(measured, 440)).toBeLessThan(5);
    }
  });

  it("is not silent in its first render quantum", () => {
    // Success criterion 1, at the DSP boundary; `index.test.ts` asserts the same
    // thing through the node, which is where the network would have been.
    const signal = render(data, len, { frequency: 440 }, { length: 128 });
    expect(peak(signal)).toBeGreaterThan(0.5);
  });
});

describe("the stochastic mode", () => {
  // Ticket 11: Radna's Dynamic Stochastic Wavetable Synthesis (DAFx-23) as a
  // modulation layer over the table read.
  //
  // Every assertion that depends on a draw runs inside `seeded()`, so nothing
  // here is flaky; the two tests that are *about* the randomness say so and use
  // the real `Math.random`.
  const len = 256;
  const built = defaultWavetable(len);

  /**
   * A parameter that holds `value` for the first `warm` samples and then falls
   * to 0 - the only way to *freeze* a walk, and what several measurements below
   * need. A chaos of 0 leaves each deviation exactly where it is (the step is
   * zero and the reflection is a no-op), so the stage becomes a static,
   * periodic transform of the table and the harmonic metrics apply to it again.
   */
  const freeze = (value: number, warm: number) => (i: number) =>
    i < warm ? value : 0;

  it("is a no-op at zero spread", () => {
    // **The load-bearing test of the whole ticket.** The mode is the only thing
    // in this folder that adds a sound rather than fixing one, and what makes it
    // safe to add to a package people already use is that switching it off is
    // exact rather than quiet. Both barriers at 0 is Radna 2.3's own bypass:
    // "reducing both barrier position parameters to zero reproduces the input
    // wavetable at a constant pitch".
    //
    // Sample for sample, against the same patch rendered with the five inputs
    // *absent* - which is what every test above this line does - across the
    // pitch range and with the pyramid engaged.
    for (const f0 of [110, 440, 3520]) {
      const without = render(
        built.data,
        len,
        { frequency: f0, morph: 0.5 },
        { levels: built.levels },
      );
      const with0 = render(
        built.data,
        len,
        { frequency: f0, morph: 0.5, pitchSpread: 0, ampSpread: 0 },
        { levels: built.levels },
      );
      expect(Array.from(with0)).toEqual(Array.from(without));
    }
  });

  it.each([
    [110, 59.26],
    [220, 48.39],
    [440, 57.4],
    [880, 66.14],
    [1760, 74.49],
    [3520, 82.13],
  ])("leaves %p Hz's alias floor exactly where it was: %p dB", (f0, db) => {
    // Criterion 1 again, at the number the folder actually promises. The six
    // floors of `describe("aliasing")` re-measured with the stage present and
    // both barriers closed: identical to the printed decimal, because the
    // samples are identical.
    const raw = sawTable(len);
    const pyramid = mipmapWavetable({ data: raw, length: len });
    const measured = aliasSnr(
      render(
        pyramid.data,
        len,
        { frequency: f0, pitchSpread: 0, ampSpread: 0 },
        { warmup: WARMUP, levels: pyramid.levels },
      ),
      f0,
      SAMPLE_RATE,
    );
    expect(Math.abs(measured - db)).toBeLessThan(0.15);
  });

  it("releases the stage one cycle after the barrier closes", () => {
    // The stage is latched on by a barrier and released by the *walk*, not by
    // the block: a closed barrier only zeroes the deviations when the walk next
    // iterates, which is at a cycle boundary. So closing it leaves a tail of at
    // most one cycle, and then the output is the bypass again - bit for bit,
    // 27 samples later at 440 Hz, which is what says nothing is left behind in
    // the state. The fold goes with it: an all-zero deviation series is not
    // "fold by nothing", it is not folding.
    //
    // **The amplitude path only, and that is not a gap.** A pitch deviation
    // moves the read position while it runs, so an oscillator that has been
    // through one comes back at the right frequency and the wrong phase - the
    // same waveform, some samples along. Nothing is retained; there is just no
    // sample-for-sample comparison to make.
    const close = 8192;
    const moved = seeded(4, () =>
      render(
        built.data,
        len,
        {
          frequency: 440,
          morph: 0.5,
          ampSpread: freeze(0.5, close),
          ampChaos: 1,
        },
        { levels: built.levels, length: 16384 },
      ),
    );
    const plain = render(
      built.data,
      len,
      { frequency: 440, morph: 0.5 },
      { levels: built.levels, length: 16384 },
    );
    // One cycle at 440 Hz is 100 samples; 128 is the block that contains it.
    const from = close + 128;
    expect(Array.from(moved.subarray(from))).toEqual(
      Array.from(plain.subarray(from)),
    );
    // And it was not a no-op before that, or the comparison above proves
    // nothing.
    const before = new Float32Array(close);
    for (let i = 0; i < close; i++) before[i] = moved[i] - plain[i];
    expect(peak(before)).toBeGreaterThan(0.1);
  });

  it.each([false, true])(
    "stays in range at maximum chaos, per-segment %p",
    (pitchPerSegment) => {
      // Criterion 2. Every parameter at the top of its declared range, on the
      // four-plane built-in set, at the bottom, middle and top of the pitch
      // range. The fold is what holds it: Radna Eq. 7-8 reflects the excess
      // rather than clipping it, and `fold()`'s clamp covers the one case the
      // equations do not.
      seeded(1, () => {
        for (const f0 of [55, 440, 3520]) {
          const signal = render(
            built.data,
            len,
            {
              frequency: f0,
              morph: 0.5,
              segments: 256,
              pitchChaos: 1,
              pitchSpread: 24,
              ampChaos: 1,
              ampSpread: 1,
            },
            { levels: built.levels, pitchPerSegment },
          );
          for (let i = 0; i < signal.length; i++) {
            expect(Number.isFinite(signal[i])).toBe(true);
          }
          expect(peak(signal)).toBeLessThanOrEqual(1);
        }
      });
    },
  );

  it.each([1, 2, 3, 4])("holds pitch on average, seed %p", (seed) => {
    // Criterion 3, and it is a statement about the walk rather than about the
    // read: the barrier is symmetric about 0 semitones and an elastic
    // reflection keeps the stationary distribution uniform, so the deviation
    // has mean zero in semitones and the tone sits where it was asked to.
    //
    // **Mean pitch, cycle by cycle, not mean rate.** Those are different
    // averages of the same signal and only the first one is what "pitch" means:
    // a deviation centred in semitones is centred in the log domain, so the
    // mean of `log2(1 / period)` is exactly 0, while the mean *frequency* of
    // the same signal is flat by Jensen's inequality - measurably, 1.5 cents at
    // a barrier of 1 semitone and 3.8 at 2. That flatness is a real property of
    // the algorithm and is documented rather than corrected; correcting it
    // would mean dividing out a constant that is only right for one
    // distribution, and Radna's own future work adds more of them.
    //
    // Four seconds at a barrier of half a semitone - a 100-cent-wide wobble -
    // and `pitchChaos` at 1. **The window is what sets the bar, not the
    // algorithm**: the walk has memory at every chaos, so the sample mean of a
    // finite window wanders in proportion to the barrier and inversely to the
    // square root of the length. Measured across eight seeds: 2.3 cents worst
    // case here, 4.2 if the window is halved, 4.6 if the barrier is doubled.
    // Four seeds, because one seeded run proves nothing about a mean.
    const signal = seeded(seed, () =>
      render(
        built.data,
        len,
        { frequency: 440, pitchSpread: 0.5, pitchChaos: 1 },
        { levels: built.levels, length: 4 * SAMPLE_RATE },
      ),
    );
    const crossings: number[] = [];
    for (let i = 1; i < signal.length; i++) {
      if (signal[i - 1] <= 0 && signal[i] > 0) {
        crossings.push(i - 1 + signal[i - 1] / (signal[i - 1] - signal[i]));
      }
    }
    let cents = 0;
    for (let k = 1; k < crossings.length; k++) {
      cents +=
        1200 * Math.log2(SAMPLE_RATE / (crossings[k] - crossings[k - 1]) / 440);
    }
    expect(Math.abs(cents / (crossings.length - 1))).toBeLessThan(5);
  });

  it("is quieter in the high end in single-segment mode", () => {
    // Criterion 4, and Radna 2.4's claim, at the paper's own Fig. 4 settings:
    // "a center pitch of C5 (523.25 Hz), pitch barrier range of +/- two
    // octaves, pitch step size of six semitones, and no amplitude fluctuation",
    // on a sinusoidal table so the table contributes nothing of its own.
    //
    // The paper says the single-segment spectrum "shows less energy in the
    // high-frequency range despite otherwise identical parameters". Measured
    // here as the share of energy above 10 kHz, with the same seed on both
    // sides so the two renders are the same deviation series read two ways:
    // -59.2 dB against -40.7 dB, which is 18.5 dB, and the spectral centroid
    // moves 894 Hz to 1651 Hz with it.
    //
    // This is the whole reason single-segment is the default here as it is
    // there: it is the one antialiasing measure the paper actually implements.
    const table = sineTable(len);
    const params = {
      frequency: 523.25,
      pitchSpread: 24,
      pitchChaos: 0.25,
      ampSpread: 0,
    };
    const above10k = (signal: Float32Array) => {
      const bins = magnitudes(signal);
      const binWidth = SAMPLE_RATE / (bins.length * 2);
      let high = 0;
      let total = 0;
      for (let i = 1; i < bins.length; i++) {
        const power = bins[i] * bins[i];
        total += power;
        if (i * binWidth >= 10000) high += power;
      }
      return 10 * Math.log10(high / total);
    };
    const single = seeded(11, () => render(table, len, params));
    const perSegment = seeded(11, () =>
      render(table, len, params, { pitchPerSegment: true }),
    );
    expect(above10k(single)).toBeLessThan(above10k(perSegment) - 15);
    expect(centroid(single, SAMPLE_RATE)).toBeLessThan(
      centroid(perSegment, SAMPLE_RATE),
    );
  });

  it("varies between renders", () => {
    // The one test that uses the real `Math.random`: two instances, identical
    // parameters, and the whole point of the mode is that they are not the same
    // note. `phase` is 0 on both, so the difference is the walks and nothing
    // else.
    const params = {
      frequency: 220,
      pitchSpread: 2,
      ampSpread: 0.3,
      morph: 0.5,
    };
    const a = render(built.data, len, params, {
      levels: built.levels,
      length: 4096,
    });
    const b = render(built.data, len, params, {
      levels: built.levels,
      length: 4096,
    });
    const difference = new Float32Array(a.length);
    for (let i = 0; i < a.length; i++) difference[i] = a[i] - b[i];
    expect(peak(difference)).toBeGreaterThan(0.1);
  });

  // The stage's own aliasing, in isolation, which is what ticket 06's handoff
  // asked for: a sinusoidal table read with `levels: 1`, so the table is band-
  // limited to one partial and every extra bin in the output is the stage's.
  //
  // **Measured on a frozen walk**, because `aliasSnr` cannot answer the
  // question on a moving one: the mode is deliberately inharmonic, so a live
  // walk puts real signal in bins the metric counts as noise and the number
  // stops being about aliasing. Warm the walks, drop the chaos to 0, and the
  // deviations hold: the output becomes an exactly periodic, statically folded
  // waveform, and the metric is meaningful again. What it measures then is the
  // segment knees alone - which is precisely the source Radna declines to
  // treat, "as the linear interpolation of DSWS, like that of DSS, ultimately
  // produces its own aliasing artifacts" (3.1).
  //
  // **`removeDC` is on, and the mode is why.** An amplitude deviation is a
  // per-segment offset, and its mean over a cycle is not zero: this stage
  // generates genuine DC, up to 0.5 of full scale at `ampSpread` 1. `aliasSnr`
  // counts bin 0 as noise, so leaving it in reads 19 dB where the aliasing is
  // 26 - the same judgement ticket 10 recorded for hard sync, and the opposite
  // of the unsynced floors, where the DC is not real.
  //
  // Against the table's own floors - 57.4 dB at 440 Hz, 74.5 at 1760 - the
  // amplitude path is *quieter than the oscillator it modulates* up to about
  // `ampSpread` 0.25 at 440 Hz, and is the dominant source above that and at
  // every higher pitch. That is the honest shape of the trade, and the README
  // says so.
  it.each([
    [440, 0.1, 67.57],
    [440, 0.25, 62.03],
    [440, 0.5, 55.98],
    [440, 1, 46.0],
    [1760, 0.1, 43.52],
    [1760, 0.25, 39.61],
    [1760, 0.5, 33.98],
    [1760, 1, 26.32],
  ])(
    "folds at %p Hz with an amplitude barrier of %p at %p dB",
    (f0, spread, db) => {
      const warm = 8192;
      const signal = seeded(5, () =>
        render(
          sineTable(len),
          len,
          {
            frequency: f0,
            ampSpread: spread,
            ampChaos: freeze(1, warm),
            pitchSpread: 0,
            segments: 8,
          },
          { warmup: warm, length: ANALYSIS_LENGTH },
        ),
      );
      expect(
        Math.abs(aliasSnr(signal, f0, SAMPLE_RATE, { removeDC: true }) - db),
      ).toBeLessThan(0.15);
    },
  );

  it.each([
    [2, 0.25, 65.29],
    [2, 1, 53.25],
    [8, 0.25, 43.49],
    [8, 1, 31.35],
    [64, 0.25, 52.17],
    [64, 1, 49.16],
  ])(
    "bends the read across %p segments with a barrier of %p at %p dB",
    (segments, spread, db) => {
      // The pitch path's own knees, the same way: frozen, per-segment mode -
      // the rough one - on a sinusoidal table at 440 Hz. Single-segment mode
      // has no row here at all, and that is the result rather than an omission:
      // frozen, one deviation per cycle is a constant detune, so it introduces
      // no knee and no aliasing of its own. The measured pitch is read back
      // from the signal because a per-segment deviation set changes the cycle
      // length; at a barrier of 1 semitone across 2 segments it lands 45 cents
      // sharp of 440, which is the deviation set and not an error.
      //
      // 64 segments measuring cleaner than 8 is real and is the sampling
      // catching up with the modulation: at 440 Hz on a 256-sample table the
      // read advances 2.55 samples per output sample, so a 64-segment table
      // changes its increment faster than it is sampled and the deviations
      // average out. Radna's Fig. 2 brightness curve flattens over the same
      // range.
      const warm = 8192;
      const signal = seeded(5, () =>
        render(
          sineTable(len),
          len,
          {
            frequency: 440,
            ampSpread: 0,
            pitchSpread: spread,
            pitchChaos: freeze(1, warm),
            segments,
          },
          { warmup: warm, length: ANALYSIS_LENGTH, pitchPerSegment: true },
        ),
      );
      const f0 = peakFrequency(signal, SAMPLE_RATE);
      expect(Math.abs(aliasSnr(signal, f0, SAMPLE_RATE) - db)).toBeLessThan(
        0.15,
      );
    },
  );

  it("keeps the deviated read on the mipmap pyramid", () => {
    // Ticket 06's handoff predicted the opposite - "the mode's segment pitch
    // deviations move the READ RATE within a cycle, and that does not go
    // through `updateInc()`, so it gets no mipmap protection" - and the
    // prediction is what the implementation is built to falsify: the deviation
    // is a factor *inside* `updateInc()`, so `updateLevel()` picks a level for
    // the rate actually being read.
    //
    // Measured on the full-bandwidth sawtooth with its pyramid, at 440 Hz with
    // a frozen half-octave pitch walk across four segments, in per-segment
    // mode: 35.51 dB with the pyramid against 24.56 without it, so the
    // protection is worth **10.95 dB**. Same table, same seed, same deviation
    // series; the only difference is whether the oscillator is allowed to
    // select a level for the rate it is actually reading at.
    //
    // Four segments and half an octave rather than the extremes, because past
    // that the stage's own knees are louder than anything the pyramid can fix
    // and both columns collapse to the same number - at a 2-octave barrier
    // across eight segments it is 23.04 against 23.00. That is the honest
    // shape of it: the mipmap protects the *table* from the deviation, and
    // nothing here protects the deviation from itself.
    const warm = 8192;
    const pyramid = mipmapWavetable({ data: sawTable(len), length: len });
    const params = {
      frequency: 440,
      pitchSpread: 6,
      pitchChaos: freeze(1, warm),
      ampSpread: 0,
      segments: 4,
    };
    const withPyramid = seeded(9, () =>
      render(pyramid.data, len, params, {
        warmup: warm,
        levels: pyramid.levels,
        pitchPerSegment: true,
      }),
    );
    const without = seeded(9, () =>
      render(pyramid.data, len, params, {
        warmup: warm,
        pitchPerSegment: true,
      }),
    );
    const f0 = peakFrequency(withPyramid, SAMPLE_RATE);
    const protectedDb = aliasSnr(withPyramid, f0, SAMPLE_RATE);
    const flat = aliasSnr(
      without,
      peakFrequency(without, SAMPLE_RATE),
      SAMPLE_RATE,
    );
    expect(Math.abs(protectedDb - 35.51)).toBeLessThan(0.15);
    expect(Math.abs(flat - 24.56)).toBeLessThan(0.15);
    expect(protectedDb).toBeGreaterThan(flat + 10);
  });
});

describe("totality", () => {
  // Every value in `frequency`'s declared range against every table length the
  // package can be handed, plus the two that are outside it. There is no divisor
  // any more - ticket 03 replaced `frequency / baseFrequency` with
  // `frequency * len / sampleRate`, so `Infinity` is no longer reachable at all
  // - and the clamp that survives is there for exactly these last two rows.
  // `-440` is inside the declared range since ticket 09 made it bipolar: it runs
  // the read pointer backwards, which is measured properly in
  // `describe("the pitch inputs")` above and is here only for totality. `NaN`
  // resolves to a stopped oscillator rather than poisoning `offset`, which is
  // absorbing.
  const frequencies = [0, 1e-9, 440, 20000, -440, NaN];
  const lengths = [0, 1, 64, 2048];

  const cases = frequencies.flatMap((frequency) =>
    lengths.map((len) => [frequency, len] as const),
  );

  it.each(cases)("survives frequency %p, len %p", (frequency, len) => {
    const table = sineTable(Math.max(len, 1) * 3);
    const osc = WavetableOscillator(SAMPLE_RATE);
    osc.set(table, len);

    const buffer = new Float32Array(BLOCK);
    const inputs = inputsOf({ frequency, morph: 0.5 });
    for (let block = 0; block < 2; block++) {
      osc.agen(buffer, inputs);
      for (const sample of buffer) {
        expect(Number.isFinite(sample)).toBe(true);
        expect(Math.abs(sample)).toBeLessThanOrEqual(1.05);
      }
    }

    // And it recovers. Before ticket 01 clamped the increment, `offset` became
    // Infinity and stayed there: restoring a sane frequency left the node
    // producing NaN forever, which is a dead voice rather than a glitch.
    osc.agen(buffer, inputsOf({ frequency: 440 }));
    for (const sample of buffer) expect(Number.isFinite(sample)).toBe(true);
    if (len > 0) expect(peak(buffer)).toBeGreaterThan(0);
  });

  it("emits DC at frequency 0, not silence and not NaN", () => {
    // Success criterion 3. A stopped oscillator holds its read position, so the
    // output is the table's value there - a constant, and a constant the caller
    // can predict. A phasor that froze at NaN or reset to zero output would both
    // be a click on the way in and on the way out.
    const len = 64;
    const table = sineTable(len);
    const signal = render(table, len, { frequency: 0 }, { length: 256 });
    for (const sample of signal) expect(sample).toBe(table[0]);
  });

  it("emits exact silence at len 0", () => {
    // The other half of criterion 3: `agen()` returns early rather than dividing
    // by a zero length, which is what makes the floor-based wrap in the sample
    // loop safe.
    const signal = render(
      new Float32Array(0),
      0,
      { frequency: 440 },
      {
        length: 256,
      },
    );
    for (const sample of signal) expect(sample).toBe(0);
  });
});

describe("set()", () => {
  it("cannot read past the end of a shorter table", () => {
    // A 2048-sample table swapped for a 64-sample one mid-note. The old read
    // position is far outside the new array, and before ticket 01 reset it the
    // first twelve samples were NaN and a fifth of the block was wrong.
    //
    // The block is no longer a flat 0.25 throughout, because ticket 05 replaced
    // ticket 01's hard reset with a 64-sample ramp: the first block is the old
    // table's last sample sliding onto the new table's constant. What the test
    // is for is unchanged - nothing reads out of range, so nothing is NaN - and
    // the ramp lands exactly, on the sample it is supposed to.
    const osc = WavetableOscillator(SAMPLE_RATE);
    const buffer = new Float32Array(64);
    const inputs = inputsOf({ frequency: 440 });

    osc.set(sineTable(2048 * 2), 2048);
    osc.agen(buffer, inputs);
    osc.set(constantPlanes(64, 0.25, 0.25), 64);
    osc.agen(buffer, inputs);

    for (const sample of buffer) {
      expect(Number.isFinite(sample)).toBe(true);
      expect(Math.abs(sample)).toBeLessThanOrEqual(1);
    }
    // 64 samples of ramp, so the 64th is the new table and nothing else.
    expect(buffer[63]).toBe(0.25);

    const next = new Float32Array(64);
    osc.agen(next, inputs);
    for (const sample of next) expect(sample).toBe(0.25);
  });

  it("makes the swap deterministic", () => {
    // Same swap twice, sample for sample. This is the property ticket 05's
    // crossfade needs: you cannot fade over a discontinuity whose size depends
    // on where the old read position happened to be.
    const play = () => {
      const osc = WavetableOscillator(SAMPLE_RATE);
      const buffer = new Float32Array(128);
      const inputs = inputsOf({ frequency: 440 });
      osc.set(sineTable(2048 * 2), 2048);
      osc.agen(buffer, inputs);
      osc.set(sineTable(64 * 3), 64);
      const after = new Float32Array(128);
      osc.agen(after, inputs);
      return [buffer[buffer.length - 1], after] as const;
    };

    const [beforeA, afterA] = play();
    const [beforeB, afterB] = play();
    expect(afterA).toEqual(afterB);
    expect(beforeA).toBe(beforeB);

    // Ticket 01 reset the read position, which made the step across the swap
    // knowable but not small: 0.744097 for these tables, 0.3797 before ticket
    // 03 changed the increment. Ticket 05's declick is what bounds it, and the
    // bound is arithmetic rather than empirical - the first sample of a
    // 64-sample linear ramp is the old step divided by 64. Measured 0.011627,
    // which is 0.744097 / 64 to seven digits.
    expect(Math.abs(afterA[0] - beforeA)).toBeLessThan(0.02);
  });
});

describe("the render loop", () => {
  it("does not depend on the block size", () => {
    // A worklet is called with 128 samples, but nothing in the contract says so
    // and the tests above use several sizes. If a state update ever moves out
    // of the sample loop into `agen`, this is what catches it.
    const table = sineTable(256 * 3);
    const params = { frequency: 440, morph: 0.5 };
    const eightBlocks = render(table, 256, params, {
      length: 1024,
      block: 128,
    });
    const oneBlock = render(table, 256, params, { length: 1024, block: 1024 });
    expect(eightBlocks).toEqual(oneBlock);
  });

  it("does not depend on the block size with an a-rate morph", () => {
    // The declick's ramp counter is instance state precisely so that a jump
    // arriving at the end of a quantum finishes in the next one. If it ever
    // became block-local, a sweep that crosses a block boundary would render
    // differently at 128 and at 1024 - which is what this reads.
    const len = 64;
    const table = constantPlanes(len, 1, -1, 0);
    // Continuous for most of it and a full-scale jump at 700, deliberately not
    // on a 128-sample boundary.
    const params = {
      frequency: 440,
      morph: (i: number) => (i < 700 ? i / 1023 : 0),
    };
    const eightBlocks = render(table, len, params, {
      length: 1024,
      block: 128,
    });
    const oneBlock = render(table, len, params, { length: 1024, block: 1024 });
    expect(eightBlocks).toEqual(oneBlock);
  });

  it("does not depend on the block size with an a-rate frequency", () => {
    // The morph's twin, and the assertion that decided ticket 06's open question
    // about the mip level. `updateLevel()` costs a `Math.log2`, so an a-rate
    // pitch could take it once per block from the block's peak |increment|
    // instead of once per sample - safe, in that a level too dark never aliases,
    // and 62 % cheaper.
    //
    // **It is not the same oscillator twice.** A level chosen from the block is
    // a function of the block: rendered at 128 and at 1024 frames the per-block
    // arm differs by 1.9e-1 RMS on this very signal, and against the same signal
    // rendered a sample at a time - where the two are by definition identical -
    // it misses by 2.3e-2, 27.5 dB below the signal, losing 110 Hz of spectral
    // centroid because the whole block plays at the darkest level any sample in
    // it needed. The per-sample level reproduces the sample-at-a-time render
    // exactly, at any block size, which is what this reads.
    const len = 256;
    const table = sawTable(len);
    const pyramid = mipmapWavetable({ data: table, length: len });
    // Continuous across most of it, then a five-level jump at 700, deliberately
    // not on a 128-sample boundary.
    const params = {
      frequency: (i: number) => (i < 700 ? 110 + (i * 5000) / 1023 : 7040),
    };
    const options = { levels: pyramid.levels, length: 1024 };
    const eightBlocks = render(pyramid.data, len, params, {
      ...options,
      block: 128,
    });
    const oneBlock = render(pyramid.data, len, params, {
      ...options,
      block: 1024,
    });
    // The reference render is two samples at a time, not one. At a block of
    // one an a-rate parameter arrives as a single value, which is byte for byte
    // what an unautomated one arrives as - the two deliveries are identical and
    // no rule can tell them apart. The house check is `length > 1`
    // (`_worklet.ts`, next to `ParamDescriptor`), so a one-sample block reads
    // as k-rate and the declick at `wavetable-oscillator.ts:387` engages, which
    // is the conservative answer to an ambiguity rather than a disagreement
    // about the level. Two samples is the smallest block that can carry an
    // a-rate array, and it pins the same thing.
    const twoAtATime = render(pyramid.data, len, params, {
      ...options,
      block: 2,
    });
    expect(eightBlocks).toEqual(oneBlock);
    expect(eightBlocks).toEqual(twoAtATime);
  });
});

describe("the bundle", () => {
  it("does not contain the instrument", () => {
    // `index.ts` never imports `_spectrum.ts`, so esbuild never walks into it.
    // The check is here rather than in a comment because the day someone
    // imports `aliasSnr` from `wavetable-oscillator.ts` for a real reason, a
    // 32768-point FFT ships to every user of the package.
    const processor = readFileSync(join(__dirname, "processor.ts"), "utf8");
    for (const name of [
      "aliasSnr",
      "blackmanHarris",
      "peakFrequency",
      "rt60",
    ]) {
      expect(processor).not.toContain(name);
    }
  });

  it("does not contain the main-thread table machinery", () => {
    // `wavetable-builder.ts` and `wavetable-conditioner.ts` are load-time work:
    // `index.ts` imports them, `worklet.ts` does not, and esbuild only walks
    // into `worklet.ts`. Every table transform in this package - the additive
    // build, the mipmap pyramid, the DC/phase/loudness conditioning - therefore
    // runs once on the main thread and reaches the worklet as samples.
    const processor = readFileSync(join(__dirname, "processor.ts"), "utf8");
    for (const name of [
      "alignPhases",
      "analyzeHarmonics",
      "buildPlane",
      "conditionWavetable",
      "mipmapWavetable",
      "normalizeRms",
    ]) {
      expect(processor).not.toContain(name);
    }
  });
});
