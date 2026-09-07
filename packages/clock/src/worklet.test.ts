// 128-frame blocks at 16384 Hz and 120 BPM: a beat is exactly 8192 samples, so
// nothing below drifts on the way through a Float32Array.
//
// That exactness is also this rate's blind spot - a beat is a whole number of
// blocks here, which is why a clock that rendered one value per render quantum
// looked correct in this file for a year. `dsp.test.ts` is where the rates that
// do not divide live. What stays here is what needs the processor: the
// registration, the descriptors, and the two outputs seen through `process()`.
const SAMPLE_RATE = 16384;
const BLOCK = 128;
const SAMPLES_PER_BEAT = 8192;

describe("ClockWorkletProcessor", () => {
  let Worklet: any;

  beforeAll(async () => {
    createWorkletTestContext(SAMPLE_RATE);
    Worklet = (await import("./worklet")).ClockWorkletProcessor;
  });

  it("registers processor", () => {
    expect(global.registerProcessor).toHaveBeenCalledWith(
      "ClockWorkletProcessor",
      Worklet,
    );
  });

  it("has parameter descriptors", () => {
    expect(Worklet.parameterDescriptors).toMatchSnapshot();
  });

  it("emits a phase that rises every sample and wraps once per beat", () => {
    // This replaces an oracle test that re-implemented the block-constant
    // expression and asserted equality with it, under the comment "Euclid
    // subdivides the clock by multiplying this ramp, so it cannot move". The
    // reasoning was backwards: a per-sample ramp is the one that survives
    // multiplication, and the block-constant one is what made a fast
    // subdivision drop steps. The property below is what that test was
    // reaching for.
    const { phase } = run(new Worklet(), 3 * SAMPLES_PER_BEAT);

    const wraps = phase.flatMap((v, i) =>
      i > 0 && v < phase[i - 1] ? [i] : [],
    );
    expect(wraps).toEqual([SAMPLES_PER_BEAT, 2 * SAMPLES_PER_BEAT]);

    // Strictly increasing everywhere else, and never exactly 1.0: the phase is
    // `[0, 1)`, which is what `gatePulse` and `Euclid`'s wrap detector assume.
    for (let i = 1; i < phase.length; i++) {
      if (!wraps.includes(i)) expect(phase[i]).toBeGreaterThan(phase[i - 1]);
    }
    expect(Math.max(...phase)).toBeLessThan(1);
  });

  it("emits a gate that rises once per beat", () => {
    const { gate } = run(new Worklet(), 3 * SAMPLES_PER_BEAT);
    expect(risingEdges(gate)).toEqual([
      0,
      SAMPLES_PER_BEAT,
      2 * SAMPLES_PER_BEAT,
    ]);
  });

  it("rises on the sample the phase wraps", () => {
    // The migration property, now exact: `KickDrum({ trigger: clock.gate })`
    // fires on the sample the phase restarts, not on the block it restarts in.
    // There is no 1.0 plateau to find any more - that plateau was the old
    // `> 1` wrap letting exactly 1.0 through for one block.
    const { phase, gate } = run(new Worklet(), 3 * SAMPLES_PER_BEAT);
    const wraps = phase.flatMap((v, i) =>
      i > 0 && v < phase[i - 1] ? [i] : [],
    );
    // Plus one at startup: a clock fires its first beat immediately.
    expect(risingEdges(gate)).toEqual([0, ...wraps]);
  });

  it("holds the gate for `pulseWidth` of the beat", () => {
    // Samples, not blocks. This used to read 31 of 64 blocks for 0.5, which is
    // the same quantity seen through the quantisation this ticket removed.
    for (const pulseWidth of [0.25, 0.5, 0.75]) {
      const { gate } = run(new Worklet(), SAMPLES_PER_BEAT, { pulseWidth });
      expect(gate.filter((v) => v === 1)).toHaveLength(
        pulseWidth * SAMPLES_PER_BEAT,
      );
    }
  });

  it("emits no gate while it is stopped", () => {
    // bpm 0 never advances the phase, so a phase-derived gate would otherwise
    // latch open at 0 forever.
    const { gate } = run(new Worklet(), 10 * BLOCK, { bpm: 0 });
    expect(gate).toEqual(new Array(10 * BLOCK).fill(0));
  });
});

function risingEdges(values: number[]) {
  return values.flatMap((v, i) => (v > 0 && !(values[i - 1] > 0) ? [i] : []));
}

// Whole blocks, flattened: both outputs are written per sample, so reading one
// sample per block would be measuring one value in 128.
function run(
  worklet: any,
  samples: number,
  params: { bpm?: number; pulseWidth?: number } = {},
) {
  const phase: number[] = [];
  const gate: number[] = [];
  for (let i = 0; i < samples / BLOCK; i++) {
    const outputs = [[new Float32Array(BLOCK)], [new Float32Array(BLOCK)]];
    worklet.process([], outputs, {
      bpm: [params.bpm ?? 120],
      pulseWidth: [params.pulseWidth ?? 0.5],
    });
    phase.push(...outputs[0][0]);
    gate.push(...outputs[1][0]);
  }
  return { phase, gate };
}

function createWorkletTestContext(sampleRate = 10, ctx: any = global) {
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
