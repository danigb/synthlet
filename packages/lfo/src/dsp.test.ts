import { aliasSnr, magnitudes, peak } from "./_spectrum";
import { createGenerators, createLfo, LfoType } from "./dsp";

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
  frequency: ArrayLike<number>;
  gain: number[];
  offset: number[];
  sync: ArrayLike<number>;
  gate: ArrayLike<number>;
  delay: number[];
  attack: number[];
};

/**
 * A parameter block as the processor receives one.
 *
 * `sync` is the a-rate member, so it takes either a single value - the length-1
 * array a browser hands an unconnected parameter, and the default here - or a
 * whole block, which is what a connected node produces.
 */
const params = (
  over: Partial<
    Record<"type" | "gain" | "offset" | "delay" | "attack", number>
  > & {
    /** A number is the length-1 array a browser hands a constant parameter. */
    frequency?: number | ArrayLike<number>;
    sync?: ArrayLike<number>;
    gate?: ArrayLike<number>;
  } = {},
): Params => ({
  type: [over.type ?? LfoType.Sine],
  frequency:
    typeof over.frequency === "object"
      ? over.frequency
      : [over.frequency ?? RATE],
  gain: [over.gain ?? 1],
  offset: [over.offset ?? 0],
  sync: over.sync ?? [0],
  gate: over.gate ?? [0],
  delay: [over.delay ?? 0],
  attack: [over.attack ?? 0],
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

/** `audioRate`, with the construction-time initial phase this package takes. */
const fromPhase = (
  phase: number | "random",
  samples: number,
  p: Params,
  blockSize = BLOCK,
) => render(createLfo(SAMPLE_RATE, true, phase), samples, p, blockSize);

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
  // `RandSampleHold` is the one shape this cannot be run on, and the reason is
  // that it *is* independent now: two renders are two instances, and two
  // instances draw different numbers. It is compared on where it changes
  // instead, which is the statement the equality suite is making anyway - that
  // the loop is right - and is the largest true one for a stochastic shape.
  const DETERMINISTIC_SHAPES = [
    LfoType.None,
    LfoType.Sine,
    LfoType.Triangle,
    LfoType.RampUp,
    LfoType.RampDown,
    LfoType.Square,
    LfoType.ExpRampUp,
    LfoType.ExpRampDown,
    LfoType.ExpTriangle,
    LfoType.Impulse,
  ];

  it.each(DETERMINISTIC_SHAPES.map((type) => [LfoType[type], type]))(
    "%s renders per sample",
    (_name, type) => {
      const p = params({ type });
      expect(Array.from(audioRate(2 * CYCLE, p))).toEqual(
        Array.from(controlRate(2 * CYCLE, p, 1)),
      );
    },
  );

  it("RandSampleHold changes where the one-sample reference changes", () => {
    const p = params({ type: LfoType.RandSampleHold });
    const changes = (signal: Float32Array) =>
      Array.from(signal.subarray(1))
        .map((value, i) => (value !== signal[i] ? i + 1 : -1))
        .filter((i) => i >= 0);

    expect(changes(audioRate(4 * CYCLE, p))).toEqual(
      changes(controlRate(4 * CYCLE, p, 1)),
    );
  });

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

    // The first fires at sample 0 - a fresh instance is armed - and the rest
    // are a cycle apart, which is the statement that the impulse is on the
    // phase wrap rather than merely rare.
    expect(fired[0]).toBe(0);
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

describe("independent instances", () => {
  // Two of the eleven generators carry state, and both used to be built once at
  // module scope - so every `Lfo` of those types in an `AudioContext` shared one
  // variable. Measured before the fix: a brand-new `Impulse` node emitted
  // nothing at all, because an older node's render had consumed the shared
  // `active` flag, and a fresh sample-and-hold returned the older node's value.
  //
  // `karplus-strong`, `polyblep-oscillator` and `wavetable-oscillator` each
  // carry a named test for this property. This is `lfo`'s.

  /** Two instances rendered block by block against each other, as a graph runs them. */
  function lockstep(a: Params, b: Params, requested: number) {
    const samples = Math.floor(requested / BLOCK) * BLOCK;
    const genA = createLfo(SAMPLE_RATE, true);
    const genB = createLfo(SAMPLE_RATE, true);
    const outA = new Float32Array(samples);
    const outB = new Float32Array(samples);
    const block = new Float32Array(BLOCK);
    for (let i = 0; i < samples; i += BLOCK) {
      genA(block, a);
      outA.set(block, i);
      genB(block, b);
      outB.set(block, i);
    }
    return [outA, outB] as const;
  }

  const SECONDS = 3 * SAMPLE_RATE;

  it("two sample-and-holds diverge", () => {
    const p = params({ type: LfoType.RandSampleHold, frequency: 100 });
    const [a, b] = lockstep(p, p, SECONDS);

    // 300 holds each. Not 100%, because two draws from `Math.random()` collide
    // occasionally and a test that forbids it is a flake.
    let differ = 0;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) differ++;
    expect(differ / a.length).toBeGreaterThan(0.9);
  });

  it("a fresh sample-and-hold does not inherit a running one's value", () => {
    // The measured probe from the ticket, inverted: instance B is constructed
    // after A has rendered 40 blocks and must not open on A's current value.
    const p = params({ type: LfoType.RandSampleHold, frequency: 100 });
    let independent = 0;
    for (let trial = 0; trial < 20; trial++) {
      const a = audioRate(40 * BLOCK, p);
      const b = audioRate(BLOCK, p);
      if (b[0] !== a[a.length - 1]) independent++;
    }
    expect(independent).toBeGreaterThanOrEqual(18);
  });

  it("every Impulse instance fires in its own first block", () => {
    // Ten fresh nodes, one block each. Before the fix the first one fired and
    // the other nine emitted silence.
    for (let i = 0; i < 10; i++) {
      const signal = audioRate(BLOCK, params({ type: LfoType.Impulse }));
      const fired = Array.from(signal).filter((value) => value !== 0);
      expect(fired).toEqual([1]);
      expect(signal[0]).toBe(1);
    }
  });

  it("a slow sample-and-hold is not re-rolled by a fast one", () => {
    // The sharpest form of the old bug: `createSampleAndHold` re-rolls on *its
    // caller's* wrap, so A's rate used to drive B's holds. One second, A at
    // 100 Hz wrapping ~100 times, B at 0.1 Hz wrapping never.
    const [a, b] = lockstep(
      params({ type: LfoType.RandSampleHold, frequency: 100 }),
      params({ type: LfoType.RandSampleHold, frequency: 0.1 }),
      SAMPLE_RATE,
    );

    expect(new Set(a).size).toBeGreaterThan(50);
    expect(new Set(b).size).toBe(1);
  });
});

describe("gain and offset", () => {
  // `gain` was `[0, 10000]` where `ad`, `adsr` and `param` - the other three
  // packages computing `x * gain + offset` - are all `[-20000, 20000]`. An
  // `AudioParam` clamps its *computed* value to the descriptor's range, so the
  // floor of 0 forbade inversion even from a connected modulator, and the only
  // way to invert an LFO was a whole `Param.inv` node for a sign. The DSP never
  // had a sign assumption; these are the assertions that say so.

  const DETERMINISTIC_TYPES = [
    LfoType.None,
    LfoType.Sine,
    LfoType.Triangle,
    LfoType.RampUp,
    LfoType.RampDown,
    LfoType.Square,
    LfoType.ExpRampUp,
    LfoType.ExpRampDown,
    LfoType.ExpTriangle,
    LfoType.Impulse,
  ];

  it.each(DETERMINISTIC_TYPES.map((type) => [LfoType[type], type]))(
    "%s at gain -1 is %s at gain 1, negated",
    (_name, type) => {
      const positive = audioRate(2 * CYCLE, params({ type, gain: 1 }));
      const negative = audioRate(2 * CYCLE, params({ type, gain: -1 }));
      // `+ 0` normalises −0 to 0: an exact negation produces −0 wherever the
      // shape reads 0, and `toEqual` treats the two as different values.
      expect(Array.from(negative, (value) => value + 0)).toEqual(
        Array.from(positive, (value) => -value + 0),
      );
    },
  );

  it("RandSampleHold at gain -1 holds the negation of a held value", () => {
    // Two renders are two instances now, so the values differ by construction.
    // What a negative gain promises about a stochastic shape is that its range
    // is mirrored and its holds are in the same places, which is assertable.
    const p = params({ type: LfoType.RandSampleHold, gain: -1 });
    const signal = audioRate(4 * CYCLE, p);
    expect(Math.max(...signal)).toBeLessThanOrEqual(1);
    expect(Math.min(...signal)).toBeGreaterThanOrEqual(-1);
    expect(new Set(signal).size).toBeGreaterThanOrEqual(4);
  });

  it("makes a unipolar modulator out of a bipolar one", () => {
    // The recipe the widened `offset` exists for: half the depth, centred on
    // half the depth. `gain: 10000, offset: 10000` is the same line on a filter
    // cutoff, and used to be inexpressible because `offset` stopped at 1000.
    const signal = audioRate(2 * CYCLE, params({ gain: 0.5, offset: 0.5 }));
    expect(Math.min(...signal)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...signal)).toBeLessThanOrEqual(1);
    expect(Math.min(...signal)).toBeCloseTo(0, 3);
    expect(Math.max(...signal)).toBeCloseTo(1, 3);
  });
});

describe("sync and phase", () => {
  // An `Lfo` used to have no way to be started. Every one in an
  // `AudioContext` free-ran from context time zero, so two at the same rate
  // were the *same signal* forever, a note-on could not restart a vibrato, and
  // there was no wire from a `Clock` to an LFO at all - even though
  // `clock/src/params.ts` names `Lfo` as the answer to tempo modulation.
  //
  // One a-rate param and one construction option answer all four, because a
  // node into an a-rate param is the library's only sync mechanism and it
  // already reaches everything.

  const EVERY_TYPE = Object.values(LfoType).filter(
    (value): value is LfoType => typeof value === "number",
  );

  /** A gate that steps `0 -> 1` at `at` and stays there: one rising edge. */
  function edgeAt(at: number, length: number, high = 1) {
    const gate = new Float32Array(length);
    gate.fill(high, at);
    return gate;
  }

  const SHAPE_TYPES = EVERY_TYPE.filter(
    (type) => type !== LfoType.RandSampleHold && type !== LfoType.Impulse,
  );

  it.each(SHAPE_TYPES.map((type) => [LfoType[type], type]))(
    "%s: a rising edge puts the next sample back at phase 0",
    (_name, type) => {
      const p = params({ type });
      const fresh = audioRate(CYCLE, p, CYCLE);
      const synced = audioRate(
        CYCLE,
        params({ type, sync: edgeAt(3000, CYCLE) }),
        CYCLE,
      );

      // Exact, not approximate: the reset lands *on* the sample the edge was
      // detected on, and the generator is then called with the same pair of
      // phases a fresh instance opens with - so everything after the edge is a
      // fresh render, sample for sample.
      expect(synced.subarray(3000)).toEqual(fresh.subarray(0, CYCLE - 3000));

      // And the reset is observable: the same LFO left alone is elsewhere.
      // `None` is the one shape it cannot be observable on, being 0 always.
      if (type !== LfoType.None) {
        expect(Array.from(synced)).not.toEqual(Array.from(fresh));
      }
    },
  );

  it("keeps the stateful shapes' own state across a reset", () => {
    // `sync` resets the **phase**, and `Impulse` and `RandSampleHold` carry
    // state that is not the phase: the impulse fires on a cycle *wrap*, so
    // after a reset the next one is a full cycle away, and the sample-and-hold
    // keeps holding. That is coherent - syncing an `Impulse` LFO to a clock
    // aligns its cycle boundaries, which is where it fires - and it is pinned
    // here so it is a decision rather than an accident.
    const synced = audioRate(
      CYCLE,
      params({ type: LfoType.Impulse, sync: edgeAt(3000, CYCLE) }),
      CYCLE,
    );
    expect(synced[3000]).toBe(0);
    expect(synced[0]).toBe(1);
  });

  it("fires once while the gate is held high", () => {
    // The gate contract, asserted on the first modulator that has to honour
    // it: a re-fire needs the signal to return to <= 0 first.
    const held = new Float32Array(CYCLE);
    held.fill(1, 100);
    const synced = audioRate(CYCLE, params({ sync: held }), CYCLE);
    const fresh = audioRate(CYCLE, params(), CYCLE);

    // One reset at 100, and from there it runs on: if it re-fired every sample
    // the output would be a constant.
    expect(synced[100]).toBe(fresh[0]);
    expect(synced.subarray(100)).toEqual(fresh.subarray(0, CYCLE - 100));
  });

  it("fires on the crossing, not on the value", () => {
    // The no-threshold rule from `gates-and-triggers.mdx`. A gate is on while
    // the signal is positive; a trigger is the transition into positive. So a
    // step to 0.001 is a trigger and a step down to 0.5 is not.
    const fresh = audioRate(CYCLE, params(), CYCLE);

    const tiny = audioRate(
      CYCLE,
      params({ sync: edgeAt(3000, CYCLE, 0.001) }),
      CYCLE,
    );
    expect(tiny[3000]).toBe(fresh[0]);

    // Held at 1 from sample 0 - which fires once, at 0 - then dropped to 0.5,
    // which is still positive and so is not an edge.
    const descending = new Float32Array(CYCLE);
    descending.fill(1);
    descending.fill(0.5, 3000);
    const stepped = audioRate(CYCLE, params({ sync: descending }), CYCLE);
    expect(stepped[3000]).toBe(fresh[3000]);
  });

  it.each(EVERY_TYPE.map((type) => [LfoType[type], type]))(
    "%s: an unconnected sync changes nothing",
    (_name, type) => {
      // The assertion that says this ticket is additive. A browser hands an
      // unconnected a-rate parameter a length-1 array and a connected constant
      // the same, so both spellings of "no reset" have to render identically -
      // and identically to a free-running LFO, which is every patch written
      // before `sync` existed.
      const single = audioRate(4 * CYCLE, params({ type }));
      const block = audioRate(
        4 * CYCLE,
        params({ type, sync: new Float32Array(BLOCK) }),
      );
      if (type === LfoType.RandSampleHold) {
        // Two renders are two instances; what is comparable is where it moves.
        const changes = (signal: Float32Array) =>
          Array.from(signal.subarray(1))
            .map((value, i) => (value !== signal[i] ? i : -1))
            .filter((i) => i >= 0);
        expect(changes(block)).toEqual(changes(single));
      } else {
        expect(Array.from(block)).toEqual(Array.from(single));
      }
    },
  );

  it("starts where phase says", () => {
    const quarter = fromPhase(0.25, CYCLE, params(), CYCLE);
    const zero = audioRate(CYCLE, params(), CYCLE);

    // A quarter of a cycle in, exactly: the phase grid is the same one shifted.
    expect(quarter[0]).toBeCloseTo(zero[Math.round(CYCLE / 4)], 6);
    expect(quarter[0]).toBeCloseTo(1, 6); // Sine at phi = 1/4
  });

  it("normalises phase the way both oscillators do", () => {
    const zero = audioRate(4, params(), 4);
    for (const phase of [0, 1, -1, NaN, Infinity]) {
      expect(Array.from(fromPhase(phase, 4, params(), 4))).toEqual(
        Array.from(zero),
      );
    }
    // `1.25` and `-0.75` both mean 0.25.
    expect(fromPhase(1.25, 4, params(), 4)[0]).toBeCloseTo(
      fromPhase(-0.75, 4, params(), 4)[0],
      9,
    );
  });

  it("decorrelates ten instances with phase: random", () => {
    // Without this, two `Lfo`s at 0.3 Hz on two destinations are one signal,
    // and the only way to separate them was to detune one - a workaround with
    // a different sound.
    const SLOW = 0.3;
    // A whole cycle of it: over a short window a 0.3 Hz sine is nearly a
    // straight line, and two straight lines correlate whatever their phase.
    const length = SAMPLE_RATE / SLOW;
    const p = params({ frequency: SLOW });
    const runs = Array.from({ length: 10 }, () =>
      fromPhase("random", length, p, length),
    );

    expect(new Set(runs.map((run) => run[0])).size).toBe(10);

    const correlation = (a: Float32Array, b: Float32Array) => {
      let ab = 0;
      let aa = 0;
      let bb = 0;
      for (let i = 0; i < a.length; i++) {
        ab += a[i] * b[i];
        aa += a[i] * a[i];
        bb += b[i] * b[i];
      }
      // Signed: two LFOs half a cycle apart correlate at -1, and antiphase is
      // exactly the decorrelation this option exists to produce.
      return ab / Math.sqrt(aa * bb);
    };

    let decorrelated = 0;
    for (let i = 0; i < runs.length; i++) {
      for (let j = i + 1; j < runs.length; j++) {
        if (correlation(runs[i], runs[j]) < 0.9) decorrelated++;
      }
    }
    // Ten draws can land close together, so the claim is about the population
    // of 45 pairs and not about any one of them.
    expect(decorrelated).toBeGreaterThanOrEqual(9);
  });

  it.each(
    [LfoType.Sine, LfoType.Triangle, LfoType.ExpTriangle].map((t) => [
      LfoType[t],
      t,
    ]),
  )("%s at a negative frequency is its own time reverse", (_name, type) => {
    const forward = audioRate(CYCLE, params({ type }), CYCLE);
    const reverse = audioRate(CYCLE, params({ type, frequency: -RATE }), CYCLE);

    // phi(-r, k) = -k/N mod 1 = 1 - k/N, so sample k of the reverse render is
    // sample N-k of the forward one. Asserted on the continuous shapes: at a
    // jump the identity is meaningless for the sample either side of it.
    for (let k = 1; k < CYCLE; k += 137) {
      expect(reverse[k]).toBeCloseTo(forward[CYCLE - k], 5);
    }
  });

  it("holds at frequency 0", () => {
    const held = fromPhase(0.3, SAMPLE_RATE, params({ frequency: 0 }), 128);
    expect(new Set(held).size).toBe(1);
    expect(held[0]).toBeCloseTo(Math.sin(0.3 * 2 * Math.PI), 6);
  });

  it("locks to a clock gate, on and off the beat", () => {
    // 120 BPM is a beat every 22050 samples at 44.1 kHz. The gate is written
    // here rather than taken from a `Clock`: `dsp.test.ts` runs in node with no
    // `AudioContext`, and what is under test is the LFO's response to that
    // signal, not `Clock`.
    const BEAT = SAMPLE_RATE / 2;
    const BEATS = 4;
    const length = BEAT * BEATS;
    const gate = new Float32Array(length);
    for (let beat = 0; beat < BEATS; beat++) {
      gate.fill(1, beat * BEAT, beat * BEAT + 64);
      gate.fill(0, beat * BEAT + 64, beat * BEAT + 65);
    }

    const fresh = audioRate(1, params(), 1)[0];
    for (const frequency of [2, 2.1]) {
      // 2 Hz is one cycle per beat and needs no help; 2.1 Hz would drift a
      // twentieth of a cycle per beat, and is dragged back every time.
      const signal = audioRate(
        length,
        params({ frequency, sync: gate }),
        length,
      );
      for (let beat = 0; beat < BEATS; beat++) {
        expect(signal[beat * BEAT]).toBeCloseTo(fresh, 6);
      }
    }
  });
});

describe("depth envelope", () => {
  // The most common thing an LFO does is fade in. `MonoSynth` used to fake it
  // by defaulting the vibrato to `gain: 0` and expecting the caller to write an
  // automation curve, which is not vibrato - it is a note in the docs.
  //
  // Not an `AdEnv` through a `GainNode`: an AD decays where this stays,
  // retriggers on every edge where this ignores legato, and cannot freeze.
  //
  // The probe throughout is `LfoType.Square` at `gain: 1`, whose first half
  // cycle is +1: for those samples the output *is* the envelope. `frequency: 0`
  // with `phase: 0` freezes the square at +1 for as long as a test needs, which
  // makes the depth directly readable for any duration.

  const depthParams = (over: Parameters<typeof params>[0] = {}) =>
    params({ type: LfoType.Square, frequency: 0, ...over });

  /** A gate high from `from` to `to`, in samples. */
  function gateBetween(length: number, from: number, to = length) {
    const gate = new Float32Array(length);
    gate.fill(1, from, to);
    return gate;
  }

  const EVERY_TYPE = Object.values(LfoType).filter(
    (value): value is LfoType => typeof value === "number",
  );

  it.each(EVERY_TYPE.map((type) => [LfoType[type], type]))(
    "%s: the defaults change nothing",
    (_name, type) => {
      // Non-negotiable: nine packages depend on this one and none of them
      // connects a gate. With `delay` and `attack` at zero there is no
      // envelope, `amp` is exactly 1, and the arithmetic is untouched.
      const plain = audioRate(4 * CYCLE, params({ type }));
      const gated = audioRate(
        4 * CYCLE,
        params({ type, gate: new Float32Array(BLOCK).fill(1) }),
      );
      if (type === LfoType.RandSampleHold) {
        const changes = (signal: Float32Array) =>
          Array.from(signal.subarray(1))
            .map((value, i) => (value !== signal[i] ? i : -1))
            .filter((i) => i >= 0);
        expect(changes(gated)).toEqual(changes(plain));
      } else {
        expect(Array.from(gated)).toEqual(Array.from(plain));
      }
    },
  );

  it.each([1, 2])("attack: %s reaches 0.99 at %s.00 seconds", (attack) => {
    const length = Math.round((attack + 0.5) * SAMPLE_RATE);
    const depth = audioRate(
      length,
      depthParams({ attack, gate: gateBetween(length, 0) }),
      length,
    );

    const reached = depth.findIndex((value) => value >= 0.99);
    // +/- 1 ms. `attack` seconds is the time to 0.99, which is what a time
    // parameter means everywhere in this library.
    expect(Math.abs(reached / SAMPLE_RATE - attack)).toBeLessThan(0.001);
    expect(depth[length - 1]).toBeGreaterThan(0.99);
  });

  it("holds at zero for delay, then ramps", () => {
    const length = Math.round(1.5 * SAMPLE_RATE);
    const depth = audioRate(
      length,
      depthParams({ delay: 0.5, attack: 0.5, gate: gateBetween(length, 0) }),
      length,
    );

    const hold = Math.round(0.5 * SAMPLE_RATE);
    for (let i = 0; i < hold; i++) expect(depth[i]).toBe(0);
    expect(depth[hold]).toBeGreaterThan(0);

    const reached = depth.findIndex((value) => value >= 0.99);
    expect(Math.abs(reached / SAMPLE_RATE - 1)).toBeLessThan(0.001);
  });

  it("restarts on a rising edge", () => {
    const second = Math.round(1.5 * SAMPLE_RATE);
    const length = 3 * SAMPLE_RATE;
    // High for 1.5 s - long enough to finish a 0.5 s ramp - then low, then high.
    const gate = new Float32Array(length);
    gate.fill(1, 0, SAMPLE_RATE);
    gate.fill(1, second);
    const depth = audioRate(length, depthParams({ attack: 0.5, gate }), length);

    expect(depth[SAMPLE_RATE - 1]).toBeGreaterThan(0.99);
    expect(depth[second]).toBeLessThan(0.01);
    expect(depth[second + Math.round(0.5 * SAMPLE_RATE)]).toBeGreaterThan(0.98);
  });

  it("freezes on a low gate rather than resetting", () => {
    // Both halves of the Juno's behaviour: the fade advances only while a voice
    // is active, so releasing mid-fade holds the depth where it is.
    const half = Math.round(0.5 * SAMPLE_RATE);
    const length = 3 * SAMPLE_RATE;
    const gate = gateBetween(length, 0, half);
    const depth = audioRate(length, depthParams({ attack: 1, gate }), length);

    const atRelease = depth[half - 1];
    expect(atRelease).toBeGreaterThan(0.5);
    expect(atRelease).toBeLessThan(0.99);
    for (let i = half; i < length; i++) {
      expect(depth[i]).toBeCloseTo(atRelease, 6);
    }
  });

  it("treats legato as one ramp", () => {
    // A gate held continuously high across what would be several notes is one
    // edge, so it is one ramp with no discontinuity in it.
    const length = 2 * SAMPLE_RATE;
    const depth = audioRate(
      length,
      depthParams({ attack: 1, gate: gateBetween(length, 0) }),
      length,
    );

    for (let i = 1; i < length; i++) {
      expect(depth[i]).toBeGreaterThanOrEqual(depth[i - 1]);
    }
    // A restart would be a step down; the largest step here is the first one.
    let worst = 0;
    for (let i = 1; i < length; i++) {
      worst = Math.max(worst, depth[i - 1] - depth[i]);
    }
    expect(worst).toBe(0);
  });

  it("arms itself when no gate is ever connected", () => {
    // The deliberate departure from rune06, whose LFO starts silent because a
    // `Synth` always drives it. A standalone node has no such guarantee.
    const length = Math.round(1.5 * SAMPLE_RATE);
    const depth = audioRate(length, depthParams({ attack: 1 }), length);

    const reached = depth.findIndex((value) => value >= 0.99);
    expect(Math.abs(reached / SAMPLE_RATE - 1)).toBeLessThan(0.001);
    expect(depth[length - 1]).toBeGreaterThan(0.99);
  });

  it("converts the Juno-6 delay slider exactly", () => {
    // rune06's `tau = slider * 1.5` is a *time constant*; this library's
    // seconds are how long the move takes, to 99%. The two differ by exactly
    // `ln(100)`, so its maximum setting is `attack: 6.91` - asserted against
    // the formula rather than against captured numbers.
    const length = 8 * SAMPLE_RATE;
    const depth = audioRate(
      length,
      depthParams({ attack: 6.91, gate: gateBetween(length, 0) }),
      length,
    );

    for (let ms = 0; ms <= 8000; ms += 100) {
      const t = ms / 1000;
      const at = Math.min(length - 1, Math.round(t * SAMPLE_RATE));
      expect(depth[at]).toBeCloseTo(1 - Math.exp(-t / 1.5), 3);
    }
  });

  it("keeps gate and sync independent", () => {
    const length = SAMPLE_RATE;
    const edge = new Float32Array(length);
    edge.fill(1, 10000);

    // A `gate` edge does not move the phase: with no envelope engaged the
    // output is the free-running LFO whatever the gate does.
    const free = audioRate(length, params(), length);
    const gated = audioRate(length, params({ gate: edge }), length);
    expect(Array.from(gated)).toEqual(Array.from(free));

    // A `sync` edge does not touch the depth. Read on a *running* square, so
    // the reset really does move the phase: `|output|` is the depth whatever
    // half of the cycle the square is in, which is what makes the two
    // separable in one signal.
    const shaped = params({ type: LfoType.Square, attack: 0.5 });
    const withoutSync = audioRate(
      length,
      { ...shaped, gate: gateBetween(length, 0) },
      length,
    );
    const withSync = audioRate(
      length,
      { ...shaped, gate: gateBetween(length, 0), sync: edge },
      length,
    );
    expect(Array.from(withSync, Math.abs)).toEqual(
      Array.from(withoutSync, Math.abs),
    );
    // ...and it did move the phase.
    expect(Array.from(withSync)).not.toEqual(Array.from(withoutSync));
  });

  it("still holds the shape while the depth is full", () => {
    // The envelope multiplies; it does not replace. Once at full depth the
    // waveform is the waveform.
    const length = 2 * SAMPLE_RATE;
    const signal = audioRate(
      length,
      params({ attack: 0.1, gate: gateBetween(length, 0) }),
      length,
    );
    const plain = audioRate(length, params(), length);
    const from = Math.round(0.5 * SAMPLE_RATE);
    for (let i = from; i < length; i += 997) {
      expect(signal[i]).toBeCloseTo(plain[i], 5);
    }
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

describe("a rate that moves", () => {
  // `frequency` read as k-rate on a **cost** argument - the hoisted phase
  // increment is worth 34% of the generator - and `scripts/_worklet.ts` allows
  // exactly two grounds for a k-rate opt-out, neither of which is a saving.
  // `clock/src/params.ts` sends the caller who wants an audio-rate tempo here,
  // and until this they arrived at a second block-quantised parameter.

  /** A rate that sweeps linearly from `from` to `to` across `samples`. */
  const sweep = (from: number, to: number, samples: number) =>
    Float32Array.from(
      { length: samples },
      (_, i) => from + ((to - from) * i) / samples,
    );

  it("tracks a swept rate per sample", () => {
    const TOP = 20;
    const length = SAMPLE_RATE;
    const signal = audioRate(
      length,
      params({ frequency: sweep(1, TOP, length) }),
      length,
    );

    // A sine's steepest point is its zero crossing, at `2*pi*f` per second. The
    // bound is the *fastest* the rate ever gets, so one sample of it is the
    // whole budget - and a rate quantised to a render quantum would step 128
    // times that at the moment the rate itself jumps.
    const bound = (2 * Math.PI * TOP) / SAMPLE_RATE;
    expect(maxStep(signal)).toBeLessThan(bound * 2);
  });

  it("has no energy at the render-quantum rate while the rate is moving", () => {
    // The existing spectrum test, run on a *modulated* rate: this is the
    // assertion that the modulation is not itself quantised. A k-rate read puts
    // a 344.53 Hz image series here, which is the whole bug.
    const LENGTH = 65536;
    const signal = audioRate(
      LENGTH,
      params({ frequency: sweep(1, 20, LENGTH) }),
      LENGTH,
    );
    for (const harmonic of [1, 2, 3, 4]) {
      expect(
        rejectionDb(signal, (SAMPLE_RATE / BLOCK) * harmonic),
      ).toBeGreaterThan(120);
    }
  });

  const EVERY_TYPE = Object.values(LfoType).filter(
    (value): value is LfoType => typeof value === "number",
  );

  it.each(EVERY_TYPE.map((type) => [LfoType[type], type]))(
    "%s: a constant rate is free and unchanged",
    (_name, type) => {
      // Chrome hands length 1 for an unconnected parameter *and* for a
      // connected constant, so the hoisted increment is what every existing
      // patch still takes. A full block of the same value is the other
      // spelling of the same rate and has to render identically.
      const hoisted = audioRate(2 * CYCLE, params({ type }));
      const perSample = audioRate(
        2 * CYCLE,
        params({
          type,
          frequency: new Float32Array(BLOCK).fill(RATE),
        }),
      );
      if (type === LfoType.RandSampleHold) {
        const changes = (signal: Float32Array) =>
          Array.from(signal.subarray(1))
            .map((value, i) => (value !== signal[i] ? i : -1))
            .filter((i) => i >= 0);
        expect(changes(perSample)).toEqual(changes(hoisted));
      } else {
        expect(Array.from(perSample)).toEqual(Array.from(hoisted));
      }
    },
  );

  describe("the top of the range", () => {
    /**
     * Alias SNR of the naive shapes, measured on this code at 44.1 kHz over
     * 65536 samples with `_spectrum.ts`'s `aliasSnr`:
     *
     * | shape         | 20 Hz | 50 Hz | 100 Hz | 200 Hz |
     * | ------------- | ----: | ----: | -----: | -----: |
     * | `Sine`        |  98.7 |  97.6 |   96.2 |   99.7 |
     * | `Triangle`    |  98.7 |  97.6 |   96.2 |   69.8 |
     * | `RampUp`      |  98.0 |  51.1 |   97.1 |   23.6 |
     * | `Square`      |  65.1 |  55.9 |   51.1 |   25.4 |
     * | `ExpRampUp`   |  98.2 |  43.7 |   97.9 |   16.3 |
     * | `ExpTriangle` |  98.9 |  98.0 |   96.8 |   34.0 |
     *
     * **The audit's table is the same measurement with `removeDC: true`**, and
     * that flag is the wrong one here: `_spectrum.ts` subtracts the *unwindowed*
     * mean, so on a signal with no DC and a fractional number of cycles in the
     * window it plants a windowed constant at bin 0 and costs dB for nothing.
     * Every shape's mean is zero - `every shape is the shape it claims` asserts
     * it - so there is no DC to remove. The 200 Hz column is identical either
     * way, because there the aliasing genuinely dominates.
     *
     * Which is the ticket's own point, arrived at from the other side: at LFO
     * rates the images fold back onto harmonics and there is nothing inharmonic
     * to remove. **This is a range note, not a missing algorithm.** No BLEP
     * belongs in an LFO; `polyblep-oscillator` is the answer above 20 Hz.
     */
    const LENGTH = 65536;

    const snr = (type: number, frequency: number) => {
      const signal = audioRate(LENGTH, params({ type, frequency }));
      return aliasSnr(signal, frequency, SAMPLE_RATE);
    };

    const SHAPES = EVERY_TYPE.filter(
      (type) =>
        type !== LfoType.None &&
        type !== LfoType.RandSampleHold &&
        type !== LfoType.Impulse,
    );

    it.each(
      SHAPES.flatMap((type) =>
        [20, 50, 100].map(
          (frequency) =>
            [LfoType[type], frequency, type] as [string, number, number],
        ),
      ),
    )("%s is clean at %i Hz", (_name, frequency, type) => {
      // Measured minimum across the grid is 43.7 dB; 35 is the regression net.
      expect(snr(type, frequency)).toBeGreaterThan(35);
    });

    it.each(
      [
        LfoType.RampUp,
        LfoType.RampDown,
        LfoType.Square,
        LfoType.ExpRampUp,
        LfoType.ExpRampDown,
      ].map((type) => [LfoType[type], type]),
    )("%s is documented as poor at 200 Hz", (_name, type) => {
      // Pinned in both directions: it must not silently get worse, and if it
      // gets *better* the docs and the param comment are now wrong.
      const measured = snr(type, 200);
      expect(measured).toBeGreaterThan(12);
      expect(measured).toBeLessThan(35);
    });
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
  const shapes = createGenerators();
  const at = (type: number, phase: number) => shapes[type](phase, phase + 1e-9);

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
    // held value and re-rolls, so 1001 calls collect 1000 fresh rolls, the
    // first being the value the generator was constructed with.
    const generator = createGenerators()[LfoType.RandSampleHold];
    const held = Array.from({ length: 1001 }, () => generator(0.9, 0.1)).slice(
      1,
    );

    expect(held.every((value) => value >= -1 && value <= 1)).toBe(true);
    const mean = held.reduce((sum, value) => sum + value, 0) / held.length;
    // 1000 uniform draws have a standard error of 0.018, so 0.1 is 5.5σ.
    expect(Math.abs(mean)).toBeLessThan(0.1);
  });
});
