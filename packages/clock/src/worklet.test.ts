// 128-frame blocks at 16384 Hz and 120 BPM: a beat is exactly 64 blocks and the
// phase advances by 1/64 per block - a power of two, so nothing below drifts
// on the way through a Float32Array.
const SAMPLE_RATE = 16384;
const BLOCK = 128;
const BLOCKS_PER_BEAT = 64;

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

  it("leaves the phase output exactly as it was", () => {
    // The oracle is the expression this processor shipped with. Euclid
    // subdivides the clock by multiplying this ramp, so it cannot move.
    const expected: number[] = [];
    let p = 0;
    const increment = 120 / 60 / SAMPLE_RATE;
    for (let i = 0; i < 3 * BLOCKS_PER_BEAT; i++) {
      let nextPhase = p + BLOCK * increment;
      if (nextPhase > 1) nextPhase -= 1;
      expected.push(nextPhase < p ? 1 : p);
      p = nextPhase;
    }

    const { phase } = run(new Worklet(), 3 * BLOCKS_PER_BEAT);
    expect(phase).toEqual(expected.map(Math.fround));
  });

  it("emits a gate that rises once per beat", () => {
    const { gate } = run(new Worklet(), 3 * BLOCKS_PER_BEAT);
    expect(risingEdges(gate)).toEqual([0, 64, 128]);
  });

  it("rises on the same block the phase reaches 1", () => {
    // The migration property: `KickDrum({ trigger: clock.gate })` fires on the
    // block `KickDrum({ trigger: clock })` used to fire on under `=== 1`.
    const { phase, gate } = run(new Worklet(), 3 * BLOCKS_PER_BEAT);
    const plateaus = phase.flatMap((v, i) => (v === 1 ? [i] : []));
    expect(plateaus).toEqual([64, 128]);
    // Plus one at startup: a clock fires its first beat immediately.
    expect(risingEdges(gate)).toEqual([0, ...plateaus]);
  });

  it("holds the gate for `pulseWidth` of the beat", () => {
    for (const [pulseWidth, expected] of [
      [0.5, 31],
      [0.25, 15],
      [0.75, 47],
    ] as const) {
      const { gate } = run(new Worklet(), BLOCKS_PER_BEAT, { pulseWidth });
      expect(gate.filter((v) => v === 1)).toHaveLength(expected);
    }
  });

  it("emits no gate while it is stopped", () => {
    // bpm 0 never advances the phase, so a phase-derived gate would otherwise
    // latch open at 0 forever.
    const { gate } = run(new Worklet(), 10, { bpm: 0 });
    expect(gate).toEqual(new Array(10).fill(0));
  });
});

function risingEdges(values: number[]) {
  return values.flatMap((v, i) => (v > 0 && !(values[i - 1] > 0) ? [i] : []));
}

// Both outputs are filled with a single value per block, so one sample each is
// the whole block.
function run(
  worklet: any,
  blocks: number,
  params: { bpm?: number; pulseWidth?: number } = {},
) {
  const phase: number[] = [];
  const gate: number[] = [];
  for (let i = 0; i < blocks; i++) {
    const outputs = [[new Float32Array(BLOCK)], [new Float32Array(BLOCK)]];
    worklet.process([], outputs, {
      bpm: [params.bpm ?? 120],
      pulseWidth: [params.pulseWidth ?? 0.5],
    });
    phase.push(outputs[0][0][0]);
    gate.push(outputs[1][0][0]);
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
