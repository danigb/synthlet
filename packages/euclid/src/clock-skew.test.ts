import { createClock } from "../../clock/src/dsp";

/**
 * `Clock.gate` against a `Euclid` on the same clock.
 *
 * The first test in this repository that drives two packages together, and the
 * measurement the clock folder exists for: layer a kick off `clock.gate` and a
 * hat off a `Euclid` fed by the same clock, and they do not land together.
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
 *
 * ## What it records
 *
 * The skew is **one render quantum**: 128 samples, 2.90 ms at 44100. Ticket 03
 * of the clock folder - a phase that moves every sample - drives it to zero,
 * and the assertions below are written to fail when it does. That is
 * deliberate: this file is the evidence for that change, not a description of
 * the current behaviour to be preserved.
 */

const BLOCK = 128;
const SAMPLE_RATE = 44100;

let Worklet: any;

describe("Clock and Euclid on one clock", () => {
  beforeAll(async () => {
    createWorkletTestContext(SAMPLE_RATE);
    Worklet = (await import("./worklet")).EuclidProcessor;
  });

  it("lands a Euclid hit one render quantum after the clock's own gate", () => {
    const { gate, hits } = render(60);

    // Both fire at sample 0: a clock fires its first beat immediately, and
    // `Euclid` plays step 0 before the first wrap advances it.
    expect(gate[0]).toBe(0);
    expect(hits[0]).toBe(0);

    // Every beat after that is a quantum apart. `Clock` takes its gate from
    // the phase *after* the wrap, so it fires on the block the phase reaches
    // 1; `Euclid` sees the wrap as `currentClock < prevClock`, which cannot be
    // true until the block *after* the one that wrapped. 128 samples at 44100
    // is 2.90 ms - a kick and a hat layered from one clock, audibly apart.
    //
    // When clock ticket 03 renders the phase per sample this becomes 0 or 1
    // sample and the assertion fails. Tighten it to `[0]` or a `<= 1` bound
    // then; do not widen it.
    const n = Math.min(gate.length, hits.length);
    const skews = Array.from(
      { length: n - 1 },
      (_, i) => hits[i + 1] - gate[i + 1],
    );
    expect([...new Set(skews)]).toEqual([BLOCK]);
    expect((1000 * BLOCK) / SAMPLE_RATE).toBeCloseTo(2.902, 3);
  });

  it("skews the same amount whatever the subdivision", () => {
    // The skew is a property of how the ramp is rendered, not of how far
    // `Euclid` multiplies it, so subdividing does not divide it away: the hit
    // on each beat boundary is still exactly one quantum late.
    for (const subdivision of [1, 2, 4]) {
      const { gate, hits } = render(30, { subdivision, steps: 1, beats: 1 });
      const nearest = gate.slice(1).map((edge) => {
        const closest = hits.reduce((best, hit) =>
          Math.abs(hit - edge) < Math.abs(best - edge) ? hit : best,
        );
        return closest - edge;
      });
      expect(nearest.length).toBeGreaterThan(10);
      expect([...new Set(nearest)]).toEqual([BLOCK]);
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
