import { magnitudes, peak } from "./_spectrum";
import { createLfo, GENERATORS, LfoType } from "./dsp";

/**
 * What this package promises, as numbers.
 *
 * The LFO's output is a **signal**. Until ticket 01 of the automation-rate
 * folder `worklet.ts` built it with `createLfo(sampleRate, false)`, so every
 * `Lfo` in the library emitted one value per render quantum - a 344 Hz
 * staircase at 44.1 kHz, whatever it was patched into. `generateAudioRate`
 * already existed and was unreachable.
 *
 * Every assertion below is written to fail against the block-constant
 * generator and pass against the per-sample one, so the file is the evidence
 * for the change rather than a description of it. Where a test cannot
 * discriminate between the two - `RandSampleHold`, which re-rolls at a wrap
 * either way - it says so.
 *
 * `createLfo(sampleRate, false)` keeps its own tests at the bottom. It is a
 * documented alternative, not dead code.
 *
 * Runs in node with no `AudioWorkletProcessor` stub: `dsp.ts` imports nothing
 * from the worklet global scope. `worklet.test.ts` is where the stub lives.
 *
 * ## The second axis: the shapes
 *
 * Everything above was written about the *rate*. `every shape is the shape it
 * claims`, at the bottom, is about the *waveform*, and it exists because
 * nothing here measured one: `ExpTriangle` peaked where `Triangle` troughed
 * for the life of the package and no test could tell. Those assertions read
 * `SHAPES` below, which is the same table as the specification at the top of
 * `dsp.ts` - written out twice on purpose, so that a generator and its
 * specification cannot be changed in one edit.
 */

const SAMPLE_RATE = 44100;

/** One render quantum - the block size the processor is actually called with. */
const BLOCK = 128;

/** 5 Hz: the vibrato rate in `MonoSynth`'s own example, and slow enough that a
 * block boundary is nowhere near the waveform's own timescale. */
const RATE = 5;

/** Samples in one cycle at `RATE`. */
const CYCLE = SAMPLE_RATE / RATE;

type Params = {
  type: number[];
  frequency: number[];
  gain: number[];
  offset: number[];
};

const params = (over: Partial<Record<keyof Params, number>> = {}): Params => ({
  type: [over.type ?? LfoType.Sine],
  frequency: [over.frequency ?? RATE],
  gain: [over.gain ?? 1],
  offset: [over.offset ?? 0],
});

/** Drive a generator over `samples` in blocks, exactly as the processor does. */
function render(
  generate: ReturnType<typeof createLfo>,
  samples: number,
  p: Params,
  blockSize = BLOCK,
): Float32Array {
  const out = new Float32Array(samples);
  const block = new Float32Array(blockSize);
  for (let i = 0; i < samples; i += blockSize) {
    generate(block, p);
    out.set(block.subarray(0, Math.min(blockSize, samples - i)), i);
  }
  return out;
}

const audioRate = (samples: number, p: Params, blockSize = BLOCK) =>
  render(createLfo(SAMPLE_RATE, true), samples, p, blockSize);

const controlRate = (samples: number, p: Params, blockSize = BLOCK) =>
  render(createLfo(SAMPLE_RATE, false), samples, p, blockSize);

/** The largest step between adjacent samples. */
function maxStep(signal: Float32Array) {
  let max = 0;
  for (let i = 1; i < signal.length; i++) {
    max = Math.max(max, Math.abs(signal[i] - signal[i - 1]));
  }
  return max;
}

/**
 * The loudest bin within `halfWidth` Hz of `frequency`, in dB below the
 * loudest bin in the whole spectrum.
 *
 * A band and not a single bin, because a zero-order hold does not put energy
 * *at* its own rate: it replicates the held spectrum around every multiple of
 * it, so a 5 Hz sine sampled at 344.53 Hz images at 339.53 and 349.53 and puts
 * a null at 344.53 itself. Reading one bin measures that null and passes for
 * both generators, which is the mistake this comment exists to prevent.
 */
function rejectionDb(signal: Float32Array, frequency: number, halfWidth = 20) {
  const spectrum = magnitudes(signal);
  const perBin = SAMPLE_RATE / (spectrum.length * 2);
  const from = Math.max(1, Math.floor((frequency - halfWidth) / perBin));
  const to = Math.min(
    spectrum.length - 1,
    Math.ceil((frequency + halfWidth) / perBin),
  );

  let peak = 0;
  for (let i = 1; i < spectrum.length; i++) peak = Math.max(peak, spectrum[i]);
  let band = 0;
  for (let i = from; i <= to; i++) band = Math.max(band, spectrum[i]);
  return 20 * Math.log10(peak / (band || Number.MIN_VALUE));
}

describe("the output is a signal", () => {
  // A sine's steepest point is its zero crossing, where it moves at
  // `2*pi*f*gain` per second. One sample of that is the whole budget.
  const SINE_BOUND = (2 * Math.PI * RATE) / SAMPLE_RATE;

  it("steps by no more than one sample's worth of the sine's own slope", () => {
    expect(maxStep(audioRate(4 * CYCLE, params()))).toBeLessThanOrEqual(
      SINE_BOUND * 1.001,
    );
  });

  it("where the block-constant generator steps by a block's worth", () => {
    // Not a regression net - the statement of the bug. 128x the bound above,
    // which is the number in the ticket.
    const step = maxStep(controlRate(4 * CYCLE, params()));
    expect(step).toBeGreaterThan(SINE_BOUND * 100);
    expect(step).toBeLessThanOrEqual(SINE_BOUND * BLOCK * 1.01);
  });

  it("does not depend on the block size", () => {
    const at32 = audioRate(2 * CYCLE, params(), 32);
    const at128 = audioRate(2 * CYCLE, params(), 128);
    const at512 = audioRate(2 * CYCLE, params(), 512);
    expect(Array.from(at128)).toEqual(Array.from(at32));
    expect(Array.from(at512)).toEqual(Array.from(at32));
  });
});

describe("every waveform", () => {
  // The reference: the block-constant generator driven one sample at a time is
  // *by construction* the per-sample signal - same phase increment, same
  // `gen(phase, nextPhase)`, same order of operations. So bit-equality against
  // it is a constant-free statement that the 128-sample render is the same
  // signal, for every shape, without a hand-derived slope bound per waveform.
  //
  // `RandSampleHold` and `Impulse` are excluded and tested below: both are
  // built once at module scope in `dsp.ts`, so their state is shared by every
  // `Lfo` in the process and two renders of them are not independent.
  const STATELESS = [
    LfoType.None,
    LfoType.Sine,
    LfoType.Triangle,
    LfoType.RampUp,
    LfoType.RampDown,
    LfoType.Square,
    LfoType.ExpRampUp,
    LfoType.ExpRampDown,
    LfoType.ExpTriangle,
  ];

  it.each(STATELESS.map((type) => [LfoType[type], type]))(
    "%s renders per sample",
    (_name, type) => {
      const p = params({ type });
      expect(Array.from(audioRate(2 * CYCLE, p))).toEqual(
        Array.from(controlRate(2 * CYCLE, p, 1)),
      );
    },
  );

  it("Impulse emits one sample of 1.0 per cycle, at the cycle boundary", () => {
    const signal = audioRate(4 * CYCLE, params({ type: LfoType.Impulse }));
    const fired: number[] = [];
    for (let i = 0; i < signal.length; i++) {
      if (signal[i] !== 0) fired.push(i);
    }

    // Every impulse is one sample wide and full scale. `output.fill()` - the
    // block-constant generator - makes each of them 128 samples wide instead.
    expect(fired.length).toBeGreaterThanOrEqual(3);
    for (const at of fired) {
      expect(signal[at]).toBe(1);
      expect(signal[at + 1] ?? 0).toBe(0);
    }

    // And they are a cycle apart, which is the statement that the impulse is
    // on the phase wrap rather than merely rare. Where the *first* one falls
    // is not asserted: `impulse` is built once at module scope in `dsp.ts`, so
    // this render starts wherever the previous test left the shared generator
    // (ticket 01 of this folder).
    const gaps = fired.slice(1).map((at, i) => at - fired[i]);
    for (const gap of gaps)
      expect(Math.abs(gap - CYCLE)).toBeLessThanOrEqual(1);
  });

  it("RandSampleHold holds one value per cycle", () => {
    // This one does not discriminate: the block-constant generator also
    // re-rolls only at a wrap, because the wrap test is the same. It is here
    // so the shape is covered rather than because it catches the bug.
    const signal = audioRate(
      3 * CYCLE,
      params({ type: LfoType.RandSampleHold }),
    );
    let changes = 0;
    for (let i = 1; i < signal.length; i++) {
      if (signal[i] !== signal[i - 1]) changes++;
    }
    expect(changes).toBeGreaterThanOrEqual(2);
    expect(changes).toBeLessThanOrEqual(4);
  });
});

describe("spectrum", () => {
  // The staircase's fundamental: one step per render quantum is a 344.53 Hz
  // sampler, and its energy is exactly what a-rate output removes.
  const STAIRCASE = SAMPLE_RATE / BLOCK;
  const LENGTH = 65536;

  /**
   * Rejection at the first four multiples of 344.53 Hz, measured on this code
   * at 44.1 kHz over a 65536-sample render of a 5 Hz sine at `gain: 1`:
   *
   * | harmonic | 1     | 2     | 3     | 4     |
   * | a-rate   | 146.0 | 152.3 | 155.6 | 158.0 |
   * | k-rate   |  36.6 |  42.7 |  46.3 |  48.8 |
   *
   * The a-rate column is the `Float32Array`'s own quantisation noise - there
   * is nothing there to measure. 120 dB is a one-sided regression net with
   * 26 dB of headroom; an LFO that gets quieter still needs no edit.
   */
  it("has no energy at the render-quantum rate or its harmonics", () => {
    const signal = audioRate(LENGTH, params());
    for (const harmonic of [1, 2, 3, 4]) {
      expect(rejectionDb(signal, STAIRCASE * harmonic)).toBeGreaterThan(120);
    }
  });

  it("where the block-constant generator has a whole image series there", () => {
    // 100 dB louder than the noise floor, at the fastest part of the waveform.
    // This is the ticket, as a number.
    const signal = controlRate(LENGTH, params());
    expect(rejectionDb(signal, STAIRCASE)).toBeLessThan(60);
  });
});

describe("vibrato, end to end", () => {
  // `MonoSynth` is `vibrato.connect(osc.frequency)` on a carrier, and since #45
  // `PolyblepOscillator.frequency` is a-rate - so the LFO was the last thing
  // quantising that path. Asserted here on the modulator rather than through
  // `MonoSynth`, which needs a real `AudioContext`; the oscillator's own
  // a-rate read is `polyblep-oscillator`'s test.
  const GAIN = 50;
  const CARRIER = 440;

  it("is a clean 5 Hz sinusoid on the carrier", () => {
    const deviation = audioRate(2 * CYCLE, params({ gain: GAIN }));
    const track = Float32Array.from(deviation, (d) => CARRIER + d);

    expect(maxStep(track)).toBeLessThanOrEqual(
      ((2 * Math.PI * RATE * GAIN) / SAMPLE_RATE) * 1.001,
    );
    expect(Math.max(...track)).toBeCloseTo(CARRIER + GAIN, 1);
    expect(Math.min(...track)).toBeCloseTo(CARRIER - GAIN, 1);
  });
});

describe("the control-rate generator", () => {
  // Reachable through `createLfo(sampleRate, false)` and unreachable from the
  // worklet. Kept because a patch with several LFOs per voice may one day want
  // it back as an option; tested so that "kept" means something.
  it("writes one value per block", () => {
    const signal = controlRate(4 * BLOCK, params());
    for (let i = 0; i < signal.length; i += BLOCK) {
      const block = Array.from(signal.subarray(i, i + BLOCK));
      expect(new Set(block).size).toBe(1);
    }
  });

  it("still tracks the waveform block by block", () => {
    const signal = controlRate(8 * BLOCK, params());
    const perBlock = [];
    for (let i = 0; i < signal.length; i += BLOCK) perBlock.push(signal[i]);
    expect(perBlock).toMatchSnapshot();
  });
});

/**
 * The shape axis.
 *
 * Nothing above this line asserts that an `LfoType` is the shape its name
 * claims - not its amplitude, not its symmetry, not its polarity, not its
 * value at any phase. That is how `ExpTriangle` shipped phase-inverted against
 * `Triangle` for the life of the package: the snapshot agreed with it, and the
 * snapshot was captured from the same code.
 *
 * So `SHAPES` below is not captured from anything. It is `dsp.ts`'s
 * specification table typed out a second time, and the two copies are the
 * point: a generator and its promise cannot be changed in one edit.
 *
 * Where a bound here is not exact it is because the *grid* is not exact, never
 * because the shape is approximate, and each one says which. `N` throughout is
 * the samples in one cycle, `sampleRate / rate`.
 */
describe("every shape is the shape it claims", () => {
  type Direction = 1 | -1;

  type ShapeSpec = {
    /** Value at φ = 0, ¼, ½, ¾. */
    quarters: [number, number, number, number];
    /** Phases where the shape jumps. Symmetry and monotonicity step around them. */
    jumps: number[];
    /** Spans the shape is monotonic over, as `[from, to, direction]`. */
    monotonic: [number, number, Direction][];
    /** Where the shape reads exactly ±1, as `[phase, value]`. */
    full: [number, number][];
    /** Spends half its cycle above zero and half below, so its mean is zero. */
    bipolar: boolean;
    /**
     * `f(φ + ½) = −f(φ)`, so a cycle sampled at an even number of points sums
     * to exactly zero rather than to one sample's worth of the jump.
     */
    balanced: boolean;
  };

  /** `concave(0.5)`: the exponential ramp a quarter of the way up its rise. */
  const EXP_QUARTER = 0.1246;

  const SHAPES: Record<number, ShapeSpec> = {
    [LfoType.None]: {
      quarters: [0, 0, 0, 0],
      jumps: [],
      monotonic: [],
      full: [],
      bipolar: false,
      balanced: true,
    },
    [LfoType.Sine]: {
      quarters: [0, 1, 0, -1],
      jumps: [],
      monotonic: [
        [0, 0.25, 1],
        [0.25, 0.75, -1],
        [0.75, 1, 1],
      ],
      full: [
        [0.25, 1],
        [0.75, -1],
      ],
      bipolar: true,
      balanced: true,
    },
    [LfoType.Triangle]: {
      quarters: [0, 1, 0, -1],
      jumps: [],
      monotonic: [
        [0, 0.25, 1],
        [0.25, 0.75, -1],
        [0.75, 1, 1],
      ],
      full: [
        [0.25, 1],
        [0.75, -1],
      ],
      bipolar: true,
      balanced: true,
    },
    [LfoType.RampUp]: {
      quarters: [0, 0.5, -1, -0.5],
      jumps: [0.5],
      monotonic: [
        [0, 0.5, 1],
        [0.5, 1, 1],
      ],
      // A sampled saw lands *on* its jump and so reads −1 exactly, and stops
      // 2/N short of the +1 just before it. One peak, not two.
      full: [
        [0.5 - 1e-12, 1],
        [0.5, -1],
      ],
      bipolar: true,
      balanced: false,
    },
    [LfoType.RampDown]: {
      quarters: [0, -0.5, 1, 0.5],
      jumps: [0.5],
      monotonic: [
        [0, 0.5, -1],
        [0.5, 1, -1],
      ],
      full: [
        [0.5 - 1e-12, -1],
        [0.5, 1],
      ],
      bipolar: true,
      balanced: false,
    },
    [LfoType.Square]: {
      quarters: [1, 1, -1, -1],
      jumps: [0, 0.5],
      monotonic: [],
      full: [
        [0, 1],
        [0.5, -1],
      ],
      bipolar: true,
      balanced: true,
    },
    [LfoType.ExpRampUp]: {
      quarters: [0, EXP_QUARTER, -1, -EXP_QUARTER],
      jumps: [0.5],
      monotonic: [
        [0, 0.5, 1],
        [0.5, 1, 1],
      ],
      full: [
        [0.5 - 1e-12, 1],
        [0.5, -1],
      ],
      bipolar: true,
      balanced: false,
    },
    [LfoType.ExpRampDown]: {
      quarters: [0, -EXP_QUARTER, 1, EXP_QUARTER],
      jumps: [0.5],
      monotonic: [
        [0, 0.5, -1],
        [0.5, 1, -1],
      ],
      full: [
        [0.5 - 1e-12, -1],
        [0.5, 1],
      ],
      bipolar: true,
      balanced: false,
    },
    [LfoType.ExpTriangle]: {
      quarters: [0, 1, 0, -1],
      jumps: [],
      monotonic: [
        [0, 0.25, 1],
        [0.25, 0.75, -1],
        [0.75, 1, 1],
      ],
      full: [
        [0.25, 1],
        [0.75, -1],
      ],
      bipolar: true,
      balanced: true,
    },
  };

  const DETERMINISTIC = Object.keys(SHAPES).map(Number);
  const named = (types: number[]) =>
    types.map((type) => [LfoType[type], type] as const);

  /** Read a shape at an exact phase, with no render and no accumulated drift. */
  const at = (type: number, phase: number) =>
    GENERATORS[type](phase, phase + 1e-9);

  it.each(named(DETERMINISTIC))(
    "%s reads its declared quarters",
    (_n, type) => {
      const declared = SHAPES[type].quarters;
      const read = [0, 0.25, 0.5, 0.75].map((phase) => at(type, phase));
      read.forEach((value, i) => expect(value).toBeCloseTo(declared[i], 4));
    },
  );

  it.each(named(DETERMINISTIC.filter((t) => SHAPES[t].jumps.length === 0)))(
    "%s starts at zero and rises",
    (_n, type) => {
      // The convention `sync` will snap to: no modulation at φ=0. `Square` and
      // `Impulse` are excluded and cannot comply - a square has no zero
      // crossing and the impulse's sample *is* the boundary.
      expect(at(type, 0)).toBeCloseTo(0, 9);
      if (type !== LfoType.None) expect(at(type, 0.01)).toBeGreaterThan(0);
    },
  );

  describe("at every sample rate", () => {
    // A shape assertion that only holds at one sample rate is not a shape
    // assertion: `N`, the samples in a cycle, spans 160 to 192000 here.
    const SAMPLE_RATES = [8000, 22050, 44100, 48000, 96000];
    const RATES = [0.5, 5, 50];

    /** One cycle, rendered in whole blocks exactly as the processor renders. */
    function cycle(type: number, sampleRate: number, rate: number) {
      const samples = sampleRate / rate;
      const total = Math.ceil(samples / BLOCK) * BLOCK;
      const out = new Float32Array(total);
      const block = new Float32Array(BLOCK);
      const generate = createLfo(sampleRate, true);
      const p = params({ type, frequency: rate });
      for (let i = 0; i < total; i += BLOCK) {
        generate(block, p);
        out.set(block, i);
      }
      return out.subarray(0, samples);
    }

    const grid = SAMPLE_RATES.flatMap((sampleRate) =>
      RATES.flatMap((rate) =>
        DETERMINISTIC.map(
          (type) =>
            [LfoType[type], sampleRate, rate, type] as [
              string,
              number,
              number,
              number,
            ],
        ),
      ),
    );

    it.each(grid)(
      "%s at %i Hz, %s Hz: swings full scale and no further",
      (_n, sampleRate, rate, type) => {
        const signal = cycle(type, sampleRate, rate);
        const reached = peak(signal);

        expect(reached).toBeLessThanOrEqual(1);
        if (!SHAPES[type].bipolar) {
          expect(reached).toBe(0);
          return;
        }
        // 0.75 and not 1, because two shapes' full-scale excursion sits *at* a
        // discontinuity and a sample grid does not have to land on one: at the
        // coarsest grid tested (N = 160) an `ExpRampUp` that misses its jump by
        // half a step reads `concave(1 - 1/N)` = 0.83. The exact excursions are
        // asserted on the generator by `reaches ±1`, where there is no grid.
        expect(reached).toBeGreaterThan(0.75);
      },
    );

    it.each(
      SAMPLE_RATES.flatMap((sampleRate) =>
        RATES.flatMap((rate) =>
          DETERMINISTIC.filter((type) => SHAPES[type].bipolar).map(
            (type) =>
              [LfoType[type], sampleRate, rate, type] as [
                string,
                number,
                number,
                number,
              ],
          ),
        ),
      ),
    )(
      "%s at %i Hz, %s Hz: averages to zero over a cycle",
      (_n, sampleRate, rate, type) => {
        // Read off the generator at φ = k/N rather than off a render, because
        // this is a statement about the *shape*: `generateAudioRate` accumulates
        // its phase, and at a rate whose increment is not a dyadic fraction the
        // drift moves the odd sample across a discontinuity. That is a property
        // of floating point, and it is worth 2/N of DC - which `swings full
        // scale` above bounds, and which this assertion would blame on the
        // waveform.
        const samples = sampleRate / rate;
        let sum = 0;
        for (let k = 0; k < samples; k++) sum += at(type, k / samples);
        const mean = sum / samples;

        // Zero mean is the property that makes an `Lfo` safe to sum into an
        // `AudioParam`. It is 1/N and not zero for the ramps, and the reason is
        // arithmetic rather than a defect: a cycle of N samples visits
        // φ = k/N for k = 0…N−1, which lands on the trough and stops one step
        // short of the peak, so the sum is exactly ∓1. Measured: −1/N for
        // `RampUp` and `ExpRampUp`, +1/N for their mirrors, +1/N for `Square`
        // on an odd N, and 1e-17 for everything odd about a half cycle.
        expect(Math.abs(mean)).toBeLessThan(1.1 / samples);
        if (SHAPES[type].balanced && samples % 2 === 0) {
          expect(Math.abs(mean)).toBeLessThan(1e-9);
        }
      },
    );
  });

  it.each(named(DETERMINISTIC.filter((t) => SHAPES[t].bipolar)))(
    "%s reaches ±1",
    (_n, type) => {
      // Where each excursion is, from the specification. The ramps' peak is the
      // limit approached at their jump, so it is read a hair before it.
      for (const [phase, value] of SHAPES[type].full) {
        expect(at(type, phase)).toBeCloseTo(value, 9);
      }
    },
  );

  describe("symmetry", () => {
    // Sampled off the discontinuities: an identity between two phases says
    // nothing at a jump, where the two sides disagree by design.
    const PHASES = Array.from({ length: 63 }, (_, i) => (i + 1) / 64);

    it.each(named([LfoType.Sine, LfoType.Triangle, LfoType.ExpTriangle]))(
      "%s is symmetric about its peak at φ=¼",
      (_n, type) => {
        for (let d = 1 / 64; d < 0.25; d += 1 / 64) {
          expect(at(type, 0.25 + d)).toBeCloseTo(at(type, 0.25 - d), 9);
        }
      },
    );

    it.each(
      named([LfoType.RampDown, LfoType.ExpRampDown]).map(
        ([name, down], i) =>
          [name, down, [LfoType.RampUp, LfoType.ExpRampUp][i]] as const,
      ),
    )("%s(φ) is %s reversed", (_n, down, up) => {
      for (const phase of PHASES) {
        if (phase === 0.5) continue;
        expect(at(down, phase)).toBeCloseTo(at(up, 1 - phase), 9);
      }
    });
  });

  it.each(named(DETERMINISTIC.filter((t) => SHAPES[t].monotonic.length > 0)))(
    "%s is monotonic between its discontinuities",
    (_n, type) => {
      for (const [from, to, direction] of SHAPES[type].monotonic) {
        const step = (to - from) / 200;
        let previous = at(type, from + step / 2);
        for (let phase = from + step * 1.5; phase < to; phase += step) {
          const value = at(type, phase);
          expect((value - previous) * direction).toBeGreaterThanOrEqual(-1e-12);
          previous = value;
        }
      }
    },
  );

  it.each([
    ["ExpRampUp", LfoType.ExpRampUp, LfoType.RampUp],
    ["ExpRampDown", LfoType.ExpRampDown, LfoType.RampDown],
    ["ExpTriangle", LfoType.ExpTriangle, LfoType.Triangle],
  ])("%s is its linear partner, bent inward", (_n, exp, linear) => {
    // What "exponential" means here, stated without naming Pirkle's 5/12: the
    // curved shape keeps its partner's sign everywhere - which is the whole of
    // `ExpTriangle`'s bug, since it used to keep the opposite one - and never
    // gets further from zero than the straight one does.
    for (let i = 0; i < 1000; i++) {
      const phase = i / 1000;
      const curved = at(exp, phase);
      const straight = at(linear, phase);
      expect(curved * straight).toBeGreaterThanOrEqual(0);
      expect(Math.abs(curved)).toBeLessThanOrEqual(Math.abs(straight) + 1e-12);
    }
  });

  it("RandSampleHold rolls a uniform value in [-1, 1]", () => {
    // Driven straight, one forced wrap per call: the generator returns the
    // held value and re-rolls, so 1001 calls collect 1000 fresh rolls. The
    // first is whatever an earlier test left in `dsp.ts`'s module-scope
    // generator - ticket 01 of this folder is why that sentence is necessary.
    const generator = GENERATORS[LfoType.RandSampleHold];
    const held = Array.from({ length: 1001 }, () => generator(0.9, 0.1)).slice(
      1,
    );

    expect(held.every((value) => value >= -1 && value <= 1)).toBe(true);
    const mean = held.reduce((sum, value) => sum + value, 0) / held.length;
    // 1000 uniform draws have a standard error of 0.018, so 0.1 is 5.5σ.
    expect(Math.abs(mean)).toBeLessThan(0.1);
  });
});
