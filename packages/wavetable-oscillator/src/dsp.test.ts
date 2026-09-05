import { readFileSync } from "fs";
import { join } from "path";
import {
  aliasSnr,
  maxAbsoluteDifference,
  peak,
  peakFrequency,
} from "./_spectrum";
import { defaultWavetable } from "./wavetable-builder";
import { WavetableOscillator } from "./wavetable-oscillator";

/**
 * What this oscillator promises, as numbers.
 *
 * **Every floor here is set against the code as it stands today, on purpose.**
 * They are not targets and several of them are bad: 22.2 dB of alias SNR at
 * 440 Hz is worse than a naive uncorrected sawtooth. They exist so that the
 * tickets that improve this package raise them and the diff shows by how much:
 * ticket 06 (mipmaps) owns the alias floors and ticket 05 (a morph position)
 * owns the `set()` step. A floor is only useful if the number it came from is
 * written next to it, so each one carries its measurement.
 *
 * The pitch block is the one that has already been collected: ticket 03 turned
 * twelve `it.failing` cases on by making `frequency` mean Hz, and it is what a
 * handover between tickets is supposed to look like.
 *
 * The instrument is `scripts/_spectrum.ts`, copied here; `aliasSnr` is the
 * audit's own metric and `digital-delay/src/spectrum.test.ts` is its
 * calibration. Every alias figure below reproduces the audit
 * (`thoughts/research/2026-09-03_18-14-54_wavetable-oscillator-audit.md`
 * section 4) to within 0.1 dB, which is what makes them comparable to its
 * band-limited reference column.
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

type Params = {
  frequency?: number;
  /**
   * A number for the k-rate case - one value for the whole block, which is how
   * an unconnected `AudioParam` arrives - or a function of the absolute sample
   * index for the a-rate one, which `render` fills into a block-sized
   * `Float32Array` the way a connected one arrives.
   */
  morph?: number | ((index: number) => number);
};

const inputsOf = (params: Params) => ({
  frequency: [params.frequency ?? 440],
  // Plane 0 unless a test is about the morph: a crossfade in the middle of a
  // spectrum measurement would make it a measurement of two planes at once.
  morph: [typeof params.morph === "number" ? params.morph : 0],
});

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
  } = {},
) {
  const length = options.length ?? ANALYSIS_LENGTH;
  const block = options.block ?? BLOCK;
  const warmup = options.warmup ?? 0;
  const sampleRate = options.sampleRate ?? SAMPLE_RATE;

  const osc = WavetableOscillator(sampleRate);
  osc.set(table, len);

  const out = new Float32Array(warmup + length);
  const buffer = new Float32Array(block);
  const inputs: {
    frequency: number[];
    morph: ArrayLike<number>;
  } = inputsOf(params);
  const morphAt = typeof params.morph === "function" ? params.morph : null;
  const morphBuffer = new Float32Array(block);

  for (let at = 0; at < out.length; at += block) {
    const size = Math.min(block, out.length - at);
    const view = size === block ? buffer : buffer.subarray(0, size);
    if (morphAt) {
      // Same length as the output, which is what makes the unit read it per
      // sample, and refilled per block because that is how it arrives.
      const morph =
        size === block ? morphBuffer : morphBuffer.subarray(0, size);
      for (let i = 0; i < size; i++) morph[i] = morphAt(at + i);
      inputs.morph = morph;
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
    const len = 256;
    const { data } = defaultWavetable(len);

    for (let k = 0; k < 4; k++) {
      const plane = data.slice(k * len, (k + 1) * len);
      const morphed = render(
        data,
        len,
        { frequency: 440, morph: k / 3 },
        { length: 1024 },
      );
      const alone = render(plane, len, { frequency: 440 }, { length: 1024 });
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

describe("aliasing", () => {
  // A 256-sample table holding a full-bandwidth saw, played at its natural
  // pitch multiplied up. There is no band-limiting anywhere in this package, so
  // every harmonic above Nyquist folds back, and it costs 25-65 dB against the
  // same table with its harmonics truncated (the audit's reference column:
  // 56.6 / 39.2 / 48.5 / 57.5 / 66.8 / 75.1 dB).
  //
  // THESE FLOORS ARE NOT A TARGET. They are 1.5 dB below what the code does
  // today, so that ticket 06's mipmaps raise them by 20-40 dB and the diff is
  // the evidence. Reading 22.2 dB at 440 Hz as acceptable would be reading this
  // file backwards: it is worse than an uncorrected naive sawtooth.
  const len = 256;
  const table = sawTable(len);

  it.each([
    [110, 55.1, 56.5],
    [220, 30.8, 32.3],
    [440, 22.2, 23.7],
    [880, 16.8, 18.3],
    [1760, 12.4, 13.9],
    [3520, 8.9, 10.4],
  ])("stays above %p Hz's floor of %p dB", (f0, floorDb, auditDb) => {
    const signal = render(table, len, { frequency: f0 }, { warmup: WARMUP });
    const measured = aliasSnr(signal, f0, SAMPLE_RATE);

    expect(measured).toBeGreaterThan(floorDb);
    // And the third column is the audit's own published figure. This half is
    // the pin: if the instrument or the harness drifts, the floors above stop
    // meaning what the audit measured and ticket 06 has nothing to compare to.
    expect(Math.abs(measured - auditDb)).toBeLessThan(0.15);
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
  // The row that matters to ticket 06 is the sawtooth: the built-in plane is the
  // *same object* as this file's `sawTable` reference, to within 0.07 dB at
  // every pitch. So the audit's reference column applies to the generated table
  // unchanged, and 06 can raise these floors against the numbers it already has
  // rather than re-characterising a new waveform. It also fixes the shape of the
  // work: a mip level is `shapeHarmonics(shape, fewer)` through the same
  // builder, no FFT and no filter design.
  //
  // THESE ARE NOT TARGETS either. The set is built at the table's full
  // bandwidth, deliberately, because band-limiting it here would be right at one
  // pitch and wrong at every other one.
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

describe("totality", () => {
  // Every value in `frequency`'s declared range against every table length the
  // package can be handed, plus the two that are outside it. There is no divisor
  // any more - ticket 03 replaced `frequency / baseFrequency` with
  // `frequency * len / sampleRate`, so `Infinity` is no longer reachable at all
  // - and the clamp that survives is there for exactly these last two rows: a
  // caller reaching the DSP unit directly with a negative or non-finite
  // frequency. `-440` freezes the phase (matching `minValue: 0`; ticket 09's
  // through-zero FM is what lifts it) and `NaN` resolves to a stopped
  // oscillator rather than poisoning `offset`, which is absorbing.
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
});
