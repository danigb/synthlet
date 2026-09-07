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

  // `clock` is a-rate as of automation-rate ticket 03. The tests above drive it
  // with one value per block, which is the k-rate shape and still what an
  // unautomated parameter delivers - so they are also the no-regression net.
  describe("a-rate clock", () => {
    it("puts the step boundary on its own sample", () => {
      // A ramp that wraps at sample 40 of the block. At k-rate the wrap was
      // only ever seen at index 0 of the *next* block.
      const worklet = new Worklet();
      const clock = new Float32Array(BLOCK);
      for (let i = 0; i < BLOCK; i++)
        clock[i] = i < 40 ? 0.9 : (i - 40) / BLOCK;

      const outputs = [[new Float32Array(BLOCK)]];
      worklet.process([], outputs, aRateParams(clock, { steps: 1, beats: 1 }));

      const out = Array.from(outputs[0][0]);
      expect(risingEdges(out)).toEqual([40]);
    });

    it("sees two step boundaries inside one block", () => {
      // A fast ramp: two wraps in 128 samples. At k-rate one of them is gone.
      const worklet = new Worklet();
      const clock = Float32Array.from(
        { length: BLOCK },
        (_, i) => (i % 50) / 50,
      );

      const outputs = [[new Float32Array(BLOCK)]];
      worklet.process([], outputs, aRateParams(clock, { steps: 1, beats: 1 }));

      // Index 0 is step 0 playing before any wrap - the same "+1" the tests
      // above account for. The two after it are the wraps, on their own
      // samples: at k-rate one of them did not exist.
      expect(risingEdges(Array.from(outputs[0][0]))).toEqual([0, 50, 100]);
    });

    it("still fires every hit of 4/4 when the clock is a ramp", () => {
      // The producer criterion: `Clock` -> `Euclid` keeps working, with
      // `gatePulse` unchanged.
      const worklet = new Worklet();
      const out: number[] = [];
      // Five clock cycles as a continuous per-sample ramp, one cycle per
      // 4 blocks, so every wrap falls inside a block rather than on a boundary.
      const perCycle = 4 * BLOCK;
      for (let b = 0; b < 5 * 4; b++) {
        const clock = Float32Array.from(
          { length: BLOCK },
          (_, i) => ((b * BLOCK + i + 13) % perCycle) / perCycle,
        );
        const outputs = [[new Float32Array(BLOCK)]];
        worklet.process(
          [],
          outputs,
          aRateParams(clock, { steps: 4, beats: 4 }),
        );
        out.push(...Array.from(outputs[0][0]));
      }
      // Five wraps, plus step 0 playing before the first one.
      const edges = risingEdges(out);
      expect(edges).toHaveLength(6);
      // And every one of them lands where the ramp wrapped, not on a block
      // boundary. `+13` puts the first wrap at 499, which is the whole point.
      expect(edges.slice(1).every((i) => i % BLOCK !== 0)).toBe(true);
    });
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

function aRateParams(
  clock: Float32Array,
  params: { steps?: number; beats?: number; pulseWidth?: number } = {},
) {
  return {
    clock,
    steps: [params.steps ?? 1],
    beats: [params.beats ?? 1],
    subdivision: [1],
    rotation: [0],
    pulseWidth: [params.pulseWidth ?? 0.5],
  };
}

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
