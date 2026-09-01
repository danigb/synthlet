// Euclid reads the clock's phase as a k-rate param, one value per block, so
// these drive it with a phase ramp directly. 64 blocks per clock cycle, in
// powers of two so nothing drifts.
const BLOCK = 128;
const BLOCKS_PER_CYCLE = 64;

describe("EuclidProcessor", () => {
  let Worklet: any;

  beforeAll(async () => {
    createWorkletTestContext();
    Worklet = (await import("./worklet")).EuclidProcessor;
  });

  it("registers processor", () => {
    expect(global.registerProcessor).toHaveBeenCalledWith(
      "EuclidProcessor",
      Worklet,
    );
  });

  it("has parameter descriptors", () => {
    expect(Worklet.parameterDescriptors).toMatchSnapshot();
  });

  // The patterns the shipped euclid() generates, for reference:
  //   4/4  -> [1,1,1,1]           every step a hit, all adjacent
  //   8/5  -> [1,0,1,0,1,1,0,1]   two adjacent pairs (4-5, and 7-0 at the wrap)
  //   16/5 -> five isolated hits, no adjacency
  it.each([
    [4, 4, 4],
    [8, 5, 5],
    [16, 5, 5],
    [8, 7, 7],
  ])("fires every hit of %i/%i", (steps, beats, hits) => {
    // One cycle of the pattern: `steps` clock cycles, plus a first cycle that
    // plays step 0 before the first wrap advances it.
    const out = run(new Worklet(), steps + 1, { steps, beats });
    expect(risingEdges(out)).toHaveLength(hits + 1);
  });

  it("used to merge adjacent hits into one", () => {
    // The regression this ticket exists for: with the level held to the next
    // step, 4/4 is a single unbroken 1 and fires exactly once, ever.
    const held = run(new Worklet(), 5, { steps: 4, beats: 4, pulseWidth: 1 });
    expect(risingEdges(held)).toHaveLength(1);
  });

  it("holds each hit for `pulseWidth` of its step", () => {
    for (const [pulseWidth, expected] of [
      [0.5, 32],
      [0.25, 16],
    ] as const) {
      const out = run(new Worklet(), 1, { steps: 1, beats: 1, pulseWidth });
      expect(out.filter((v) => v === 1)).toHaveLength(expected);
    }
  });

  it("still steps once per clock cycle, and `subdivision` times faster", () => {
    for (const [subdivision, cycles, steps] of [
      [1, 4, 4],
      [2, 4, 8],
      [4, 4, 16],
    ] as const) {
      // steps: 1, beats: 1 is a hit on every step, so a rising edge is a step.
      const out = run(new Worklet(), cycles, {
        steps: 1,
        beats: 1,
        subdivision,
      });
      expect(risingEdges(out)).toHaveLength(steps);
    }
  });
});

function risingEdges(values: number[]) {
  return values.flatMap((v, i) => (v > 0 && !(values[i - 1] > 0) ? [i] : []));
}

// Runs `cycles` full clock cycles of the phase ramp, returning the value the
// processor filled each block with.
function run(
  worklet: any,
  cycles: number,
  params: {
    steps?: number;
    beats?: number;
    subdivision?: number;
    rotation?: number;
    pulseWidth?: number;
  } = {},
) {
  const out: number[] = [];
  for (let i = 0; i < cycles * BLOCKS_PER_CYCLE; i++) {
    const outputs = [[new Float32Array(BLOCK)]];
    worklet.process([], outputs, {
      clock: [(i % BLOCKS_PER_CYCLE) / BLOCKS_PER_CYCLE],
      steps: [params.steps ?? 1],
      beats: [params.beats ?? 1],
      subdivision: [params.subdivision ?? 1],
      rotation: [params.rotation ?? 0],
      pulseWidth: [params.pulseWidth ?? 0.5],
    });
    out.push(outputs[0][0][0]);
  }
  return out;
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
