import { readFileSync } from "fs";
import { join } from "path";
import {
  aliasSnr,
  maxAbsoluteDifference,
  peak,
  peakFrequency,
} from "./_spectrum";
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
  morphFrequency?: number;
};

const inputsOf = (params: Params) => ({
  frequency: [params.frequency ?? 440],
  // Off unless a test is about the morph: a running phasor would otherwise put
  // a crossfade in the middle of every spectrum measured here.
  morphFrequency: [params.morphFrequency ?? 0],
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
  const inputs = inputsOf(params);

  for (let at = 0; at < out.length; at += block) {
    const size = Math.min(block, out.length - at);
    const view = size === block ? buffer : buffer.subarray(0, size);
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
  // Three constant planes one full scale apart, so the crossfade's own step is
  // exactly `morphFrequency / sampleRate * |planeA - planeB|` and any departure
  // from it is the defect. Before ticket 01 hoisted the plane advance above the
  // output write, this measured 1.9977 at every rate: a full-scale one-sample
  // impulse on each of the phasor's wraps.
  const PLANE_GAP = 2;

  it.each([
    [100, 1],
    [5, 2],
    [0.05, 25],
  ])(
    "steps by the crossfade and nothing more at %p Hz",
    (morphFrequency, seconds) => {
      const len = 64;
      const signal = render(
        constantPlanes(len, 1, -1, 0),
        len,
        { frequency: 440, morphFrequency },
        { length: Math.round(SAMPLE_RATE * seconds) },
      );

      // Expressed as the step rather than as a literal, so that the assertion
      // still says something true if a later ticket changes the morph rate. At
      // 100 Hz it is 0.0045351 and the measured worst case is 0.0045352.
      const step = (morphFrequency / SAMPLE_RATE) * PLANE_GAP;
      expect(maxAbsoluteDifference(signal)).toBeLessThanOrEqual(
        step + FLOAT32_STEP,
      );
      // And the phasor really did wrap - otherwise the bound above is vacuous.
      expect(peak(signal)).toBeGreaterThan(0.5);
    },
  );

  it("never leaves the range the planes span", () => {
    const len = 64;
    const signal = render(
      constantPlanes(len, 1, -1, 0),
      len,
      { morphFrequency: 100 },
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
    const inputs = inputsOf({ frequency, morphFrequency: 0.05 });
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
    const osc = WavetableOscillator(SAMPLE_RATE);
    const buffer = new Float32Array(64);
    const inputs = inputsOf({ frequency: 440 });

    osc.set(sineTable(2048 * 2), 2048);
    osc.agen(buffer, inputs);
    osc.set(constantPlanes(64, 0.25, 0.25), 64);
    osc.agen(buffer, inputs);

    for (const sample of buffer) expect(sample).toBe(0.25);
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

    // The step across the swap is still whatever the new table holds at offset
    // 0 - resetting the read position makes it *knowable*, not small. Measured
    // 0.744097 for these tables; it read 0.3797 before ticket 03, purely because
    // the increment changed and so the 2048-sample table is left mid-cycle
    // somewhere else. **Ticket 05's crossfade is what bounds it**, and when it
    // lands this number should drop by an order of magnitude.
    expect(Math.abs(afterA[0] - beforeA)).toBeLessThan(0.8);
  });
});

describe("the render loop", () => {
  it("does not depend on the block size", () => {
    // A worklet is called with 128 samples, but nothing in the contract says so
    // and the tests above use several sizes. If a state update ever moves out
    // of the sample loop into `agen`, this is what catches it.
    const table = sineTable(256 * 3);
    const params = { frequency: 440, morphFrequency: 0.05 };
    const eightBlocks = render(table, 256, params, {
      length: 1024,
      block: 128,
    });
    const oneBlock = render(table, 256, params, { length: 1024, block: 1024 });
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
