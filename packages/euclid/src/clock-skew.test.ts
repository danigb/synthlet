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

/** Render `seconds` and return the rising-edge sample indices of each signal. */
function render(
  seconds: number,
  params: {
    bpm?: number;
    subdivision?: number;
    steps?: number;
    beats?: number;
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
    pulseWidth: [0.5],
  };
  const gate: number[] = [];
  const hits: number[] = [];
  let prevGate = 0;
  let prevHit = 0;
  const blocks = Math.floor((SAMPLE_RATE * seconds) / BLOCK);
  for (let b = 0; b < blocks; b++) {
    clock(phase, clockGate, params.bpm ?? 120, 0.5);
    euclid.process([], [[euclidOut]], euclidParams);
    for (let i = 0; i < BLOCK; i++) {
      if (clockGate[i] > 0 && !(prevGate > 0)) gate.push(b * BLOCK + i);
      if (euclidOut[i] > 0 && !(prevHit > 0)) hits.push(b * BLOCK + i);
      prevGate = clockGate[i];
      prevHit = euclidOut[i];
    }
  }
  return { gate, hits };
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
