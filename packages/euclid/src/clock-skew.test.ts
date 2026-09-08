import { createClock } from "../../clock/src/dsp";

/**
 * `Clock.gate` against a `Euclid` on the same clock.
 *
 * The first test in this repository that drives two packages together, and the
 * regression test for the defect the clock folder exists for: layer a kick off
 * `clock.gate` and a hat off a `Euclid` fed by the same clock, and they must
 * land on the same sample.
 *
 * They did not. Until clock ticket 03 the clock advanced its phase by a whole
 * block and filled the block with one number, so `Euclid` saw the 1.0 plateau,
 * failed to wrap on it, and fired a block late - **128 samples, 2.90 ms at
 * 44100**, at every subdivision. That is flam and comb filtering, not rounding.
 * The same quantisation capped how fast a subdivision could go: `Euclid` could
 * see one step boundary per block, so 600 BPM x subdivision 20 produced 579 of
 * 800 hits and 1000 BPM x 20 - the declared maximum tempo - produced 76 of
 * 1333.
 *
 * Both numbers below are now exact, and this file is what keeps them that way.
 *
 * ## Why it lives here, and how it imports
 *
 * `euclid` has no `dsp.ts` - its engine is a module-private `createEuclid()`
 * inside `worklet.ts` - so reaching it means the `AudioWorkletProcessor` stub,
 * which is a thing every package's `worklet.test.ts` already builds. `clock`
 * does have one, so the cheap direction is this: the stub here, and `clock`'s
 * `dsp.ts` by relative path.
 *
 * That path import needs no packaging change - `tsconfig.json` already includes
 * `packages/**\/*.ts`, and jest's `moduleNameMapper` is only for `@synthlet/*`
 * specifiers - so this adds no cross-package dev dependency. The alternative
 * considered was a harness under `benchmarks/`, which is outside the jest run
 * and would therefore be a measurement that exists and never runs.
 */

const BLOCK = 128;
const SAMPLE_RATE = 44100;

/** An unconnected a-rate parameter: one value, and it is 0. */
const NO_RESET = new Float32Array(1);

let Worklet: any;

describe("Clock and Euclid on one clock", () => {
  beforeAll(async () => {
    createWorkletTestContext(SAMPLE_RATE);
    Worklet = (await import("./worklet")).EuclidProcessor;
  });

  it("lands every Euclid hit on the same sample as the clock's own gate", () => {
    const { gate, hits } = render(60);

    // Identical, not "within a quantum". One accumulator rendered per sample
    // means `Clock` fires its gate on the sample the phase wraps and `Euclid`
    // sees `currentClock < prevClock` on that same sample - there is no longer
    // anything for them to disagree about.
    expect(gate.length).toBeGreaterThan(100);
    expect(hits).toEqual(gate);
  });

  it("stays aligned at every subdivision", () => {
    // The alignment is a property of how the ramp is rendered, not of how far
    // `Euclid` multiplies it, so every beat-boundary hit is still coincident.
    for (const subdivision of [1, 2, 4]) {
      const { gate, hits } = render(30, { subdivision });
      expect(gate.length).toBeGreaterThan(50);
      // Every clock gate has a hit on exactly its sample; the extra hits are
      // the subdivided steps in between.
      expect(gate.every((edge) => hits.includes(edge))).toBe(true);
      expect(hits.length).toBe(gate.length * subdivision);
    }
  });

  it("drops no step at the fastest subdivision the parameters allow", () => {
    // `subdivision` maxes at 20 and `bpm` at 1000, so the corner of the
    // declared parameter space is 333 steps/s - well under one per block at
    // 44100, but the old block-constant ramp could only carry one boundary per
    // block and dropped the rest.
    const SECONDS = 4;
    for (const [bpm, subdivision] of [
      [120, 20],
      [600, 20],
      [1000, 20],
    ] as const) {
      const stepsPerSecond = (bpm / 60) * subdivision;
      // One hit per step boundary in [0, SECONDS), and a clock fires its first
      // beat immediately - so the boundary at 0 counts.
      const expected = Math.ceil(stepsPerSecond * SECONDS);
      const { hits } = render(SECONDS, { bpm, subdivision });
      expect(hits.length).toBe(expected);
    }
  });
});

describe("pulseWidth through the real chain", () => {
  beforeAll(async () => {
    createWorkletTestContext(SAMPLE_RATE);
    Worklet = (await import("./worklet")).EuclidProcessor;
  });

  it("never latches a hit on, at any subdivision or tempo", () => {
    // `Euclid` declares the same `pulseWidth: 0 ... 1` as `Clock` and applies
    // it to its own subdivided phase, so fixing the clock did not fix this:
    // measured, a `Euclid` at `pulseWidth: 1` on a corrected clock still went
    // high on its first sample and stayed there. It carries its own clamp,
    // against the step rather than the beat.
    for (const subdivision of [1, 4, 20]) {
      for (const bpm of [60, 120, 1000]) {
        for (const pulseWidth of [1, 0.999, 0.99]) {
          const { hits, lows } = render(2, { bpm, subdivision, pulseWidth });
          expect(hits.length).toBeGreaterThan(1);
          expect(Math.min(...lows)).toBeGreaterThanOrEqual(BLOCK);
        }
      }
    }
  });

  it("leaves ordinary widths alone", () => {
    // The guard rail is inert where people actually live: half a step at 120
    // BPM and subdivision 4 is 5512 samples, and it stays that.
    const { highs } = render(4, { bpm: 120, subdivision: 4, pulseWidth: 0.5 });
    const step = (SAMPLE_RATE * 60) / 120 / 4;
    expect(Math.abs(Math.min(...highs) - 0.5 * step)).toBeLessThanOrEqual(1);
  });
});

describe("two Euclids on one clock", () => {
  beforeAll(async () => {
    createWorkletTestContext(SAMPLE_RATE);
    Worklet = (await import("./worklet")).EuclidProcessor;
  });

  /**
   * Each `Euclid` keeps a private step counter starting at 0 whenever *that
   * node* was built, so two of them on one clock play different rotations of
   * the same pattern. Measured across 32 birth offsets, 28 diverge - one
   * firing at sample 441088 while the other fires at 446592, permanently.
   *
   * `site/examples/EuclidExample.tsx` builds two on one `Clock` and they agree
   * only because both are constructed in the same synchronous block. A third
   * pattern added from a UI callback gets a private downbeat.
   *
   * A pattern's step 0 is a shared musical fact, and `reset` is the only way
   * to say so.
   */
  // The sweep the audit ran: 32 birth blocks spread across many step
  // boundaries, `E(3, 8)` at subdivision 4, compared over the last 4 s of a
  // 14 s render so the startup transient is long gone.
  const OFFSETS = Array.from({ length: 32 }, (_, i) => (i + 1) * 60);
  const SECONDS = 14;
  const COMPARE_AFTER = 10;

  it("diverges at 28 of 32 birth offsets with no reset", () => {
    // The measurement this ticket exists for, kept as the control: without the
    // reset the divergence is still there, so the next test is evidence that
    // the reset is what closes it rather than that the sweep is toothless.
    const diverging = OFFSETS.filter(
      (offset) => !alignedPair(offset, { reset: false }),
    );
    expect(diverging).toHaveLength(28);
  });

  it("agrees at all 32 once both are reset from one signal", () => {
    // Criterion 3: 0 of 32, against 28 of 32.
    const diverging = OFFSETS.filter(
      (offset) => !alignedPair(offset, { reset: true }),
    );
    expect(diverging).toEqual([]);
  });

  /**
   * Build two `Euclid`s on one clock, the second `offset` blocks late, and
   * report whether they fire at the same samples once both are settled.
   */
  function alignedPair(offset: number, options: { reset: boolean }) {
    const clock = createClock(SAMPLE_RATE);
    const first = new Worklet();
    let second: any = null;
    const phase = new Float32Array(BLOCK);
    const clockGate = new Float32Array(BLOCK);
    const firstOut = new Float32Array(BLOCK);
    const secondOut = new Float32Array(BLOCK);
    const pulse = new Float32Array(BLOCK);
    pulse[0] = 1;

    // E(3, 8): three hits over eight steps, the pattern the measurement used.
    const params = (reset: Float32Array) => ({
      clock: phase,
      steps: [8],
      beats: [3],
      subdivision: [4],
      rotation: [0],
      spread: [0],
      pulseWidth: [0.5],
      reset,
    });

    // A reset well after the last birth block, so it is re-alignment and not a
    // coincidence of construction.
    const resetBlock = offset + 100;
    const blocks = Math.floor((SAMPLE_RATE * SECONDS) / BLOCK);
    const compareFrom = SAMPLE_RATE * COMPARE_AFTER;
    const firstHits: number[] = [];
    const secondHits: number[] = [];
    let prevFirst = 0;
    let prevSecond = 0;

    for (let b = 0; b < blocks; b++) {
      const reset = options.reset && b === resetBlock ? pulse : NO_RESET;
      clock([[phase], [clockGate]], 120, 0.5, 4, NO_RESET);
      if (b === offset) second = new Worklet();
      first.process([], [[firstOut]], params(reset));
      if (second) second.process([], [[secondOut]], params(reset));
      for (let i = 0; i < BLOCK; i++) {
        const at = b * BLOCK + i;
        if (firstOut[i] > 0 && !(prevFirst > 0) && at >= compareFrom) {
          firstHits.push(at);
        }
        prevFirst = firstOut[i];
        if (!second) continue;
        if (secondOut[i] > 0 && !(prevSecond > 0) && at >= compareFrom) {
          secondHits.push(at);
        }
        prevSecond = secondOut[i];
      }
    }
    return (
      firstHits.length > 0 &&
      firstHits.length === secondHits.length &&
      firstHits.every((hit, i) => hit === secondHits[i])
    );
  }
});

describe("a Euclid on the clock's bar phase", () => {
  beforeAll(async () => {
    createWorkletTestContext(SAMPLE_RATE);
    Worklet = (await import("./worklet")).EuclidProcessor;
  });

  it("spreads its steps evenly across the bar", () => {
    // Criterion 4 of clock ticket 06, proven by consumption rather than by
    // measurement: a bar phase is only worth having if it is the *same kind of
    // object* as a beat phase, and the test of that is that the thing which
    // consumes beat phases consumes it without knowing the difference.
    //
    // Eight steps over a 4-beat bar at 120 BPM: one every half beat, the first
    // on the downbeat. `subdivision` is what divides a cycle into steps -
    // `steps` selects the pattern - so eight steps *per bar* is
    // `subdivision: 8`, not `steps: 8` alone.
    const beatsPerBar = 4;
    const steps = 8;
    const clock = createClock(SAMPLE_RATE);
    const euclid = new Worklet();
    const out = [
      [new Float32Array(BLOCK)],
      [new Float32Array(BLOCK)],
      [new Float32Array(BLOCK)],
      [new Float32Array(BLOCK)],
    ];
    const hitsOut = new Float32Array(BLOCK);
    const params = {
      clock: out[2][0],
      steps: [steps],
      beats: [steps],
      subdivision: [steps],
      rotation: [0],
      spread: [0],
      pulseWidth: [0.5],
      reset: NO_RESET,
    };

    const hits: number[] = [];
    let prev = 0;
    const blocks = Math.floor((SAMPLE_RATE * 16) / BLOCK);
    for (let b = 0; b < blocks; b++) {
      clock(out, 120, 0.5, beatsPerBar, NO_RESET);
      euclid.process([], [[hitsOut]], params);
      for (let i = 0; i < BLOCK; i++) {
        if (hitsOut[i] > 0 && !(prev > 0)) hits.push(b * BLOCK + i);
        prev = hitsOut[i];
      }
    }

    const beat = (SAMPLE_RATE * 60) / 120;
    const stepLength = (beat * beatsPerBar) / steps;
    expect(hits[0]).toBe(0);
    expect(hits.length).toBeGreaterThan(steps * 3);
    // Evenly spaced, to the sample.
    hits.forEach((hit, i) => {
      expect(Math.abs(hit - i * stepLength)).toBeLessThanOrEqual(1);
    });
  });
});

/** Render `seconds` and return the rising-edge sample indices of each signal. */
function render(
  seconds: number,
  params: {
    bpm?: number;
    subdivision?: number;
    steps?: number;
    beats?: number;
    pulseWidth?: number;
    reset?: Float32Array;
    startBlock?: number;
  } = {},
) {
  const clock = createClock(SAMPLE_RATE);
  const euclid = new Worklet();
  const phase = new Float32Array(BLOCK);
  const clockGate = new Float32Array(BLOCK);
  const euclidOut = new Float32Array(BLOCK);
  const euclidParams = {
    clock: phase,
    steps: [params.steps ?? 1],
    beats: [params.beats ?? 1],
    subdivision: [params.subdivision ?? 1],
    rotation: [0],
    spread: [0],
    pulseWidth: [params.pulseWidth ?? 0.5],
    reset: params.reset ?? NO_RESET,
  };
  const gate: number[] = [];
  const hits: number[] = [];
  // Complete high and low runs of the Euclid output, for the latch check. The
  // leading and trailing partials are dropped: the first hit starts at sample
  // 0 with nothing before it, and the render stops mid-run.
  const highs: number[] = [];
  const lows: number[] = [];
  let current = -1;
  let runLength = 0;
  let prevGate = 0;
  let prevHit = 0;
  const blocks = Math.floor((SAMPLE_RATE * seconds) / BLOCK);
  for (let b = 0; b < blocks; b++) {
    clock([[phase], [clockGate]], params.bpm ?? 120, 0.5, 4, NO_RESET);
    euclid.process([], [[euclidOut]], euclidParams);
    for (let i = 0; i < BLOCK; i++) {
      if (clockGate[i] > 0 && !(prevGate > 0)) gate.push(b * BLOCK + i);
      if (euclidOut[i] > 0 && !(prevHit > 0)) hits.push(b * BLOCK + i);
      prevGate = clockGate[i];
      prevHit = euclidOut[i];

      const value = euclidOut[i] > 0 ? 1 : 0;
      if (value !== current) {
        if (current === 1) highs.push(runLength);
        if (current === 0) lows.push(runLength);
        current = value;
        runLength = 0;
      }
      runLength++;
    }
  }
  return { gate, hits, highs, lows };
}

function createWorkletTestContext(sampleRate = 44100, ctx: any = global) {
  ctx.sampleRate = sampleRate;
  ctx.registerProcessor = jest.fn();
  ctx.AudioWorkletProcessor = class AudioWorkletNodeStub {
    port: { postMessage: jest.Mock; onmessage: jest.Mock };
    constructor() {
      this.port = { postMessage: jest.fn(), onmessage: jest.fn() };
    }
  };
}

// This file declares helpers at the top level: make it a module so they don't
// collide with the identically named helpers in sibling packages.
export {};
