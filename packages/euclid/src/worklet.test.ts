// `index.ts` and `dsp.ts` imported at the top of the file, *above* the
// `beforeAll` that installs the `AudioWorkletProcessor` stub. That ordering is
// the point rather than an accident: it is criterion 2 of euclid ticket 04 at
// the node level - `Euclid.pattern` is reachable from a bare node module scope
// with no worklet globals, no `AudioContext` and nothing stubbed.
import { euclidPattern, EuclidRhythm } from "./dsp";
import { Euclid } from "./index";

// Euclid reads the clock's phase as a k-rate param, one value per block, so
// these drive it with a phase ramp directly. 64 blocks per clock cycle, in
// powers of two so nothing drifts.
const BLOCK = 128;
const BLOCKS_PER_CYCLE = 64;

/** An unconnected a-rate parameter: one value, and it is 0. That is what
 * `reset` looks like in every test that is not about resetting. */
const NO_RESET = new Float32Array(1);

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

  it("plays exactly what `Euclid.pattern` says it plays", () => {
    // Criterion 3. The export's whole value is that it tells the truth about
    // the module, so this renders the shipped processor and reads the pattern
    // back out of the audio: one sample per block, `BLOCKS_PER_CYCLE` blocks a
    // step, so out index `s * BLOCKS_PER_CYCLE` is step `s`. The counter starts
    // at 0 and block 0 sees no wrap, so step 0 is at index 0.
    //
    // The two cannot actually drift - `update()` calls `euclidPattern` too, so
    // there is one expression and not two - and this is the other claim: that
    // the engine reads that array in step order and at the step it says.
    for (const { steps, beats, rotation } of [
      ...Object.values(EuclidRhythm),
      { steps: 16, beats: 5, rotation: 0 }, // the bossa the demo used to play
      { steps: 5, beats: 5, rotation: 3 },
      { steps: 8, beats: 0, rotation: 0 },
      { steps: 7, beats: 9, rotation: 40 }, // beats > steps, rotation > steps
    ]) {
      const out = run(new Worklet(), steps, { steps, beats, rotation });
      const played = Array.from({ length: steps }, (_, s) =>
        out[s * BLOCKS_PER_CYCLE] > 0 ? 1 : 0,
      );
      expect(`E(${beats},${steps})+${rotation} ${played.join("")}`).toBe(
        `E(${beats},${steps})+${rotation} ${Euclid.pattern(steps, beats, rotation).join("")}`,
      );
    }
  });

  it("exposes that same function on the factory", () => {
    // Not a copy of it, and not a re-implementation: the identity is what makes
    // the test above a statement about the module rather than about two
    // functions that agree today.
    expect(Euclid.pattern).toBe(euclidPattern);
  });

  it("plays the fan `Euclid.pattern` describes, on every channel", () => {
    // Criterion 2 at processor level, not only at the engine's: the parameter
    // is declared, read out of `params.spread[0]`, and reaches the offset.
    // Everything between `PARAMS` and `generate()` is in this path.
    const wrong: string[] = [];
    for (const { steps, beats, rotation } of [
      EuclidRhythm.Samba,
      EuclidRhythm.BossaNova,
      EuclidRhythm.Tresillo,
      { steps: 16, beats: 9, rotation: 5 },
    ])
      for (const spread of [0, 2, 4, 9, 16]) {
        const out = run(new Worklet(), steps, {
          steps,
          beats,
          rotation,
          spread,
        });
        for (let i = 0; i < 4; i++) {
          const played = Array.from({ length: steps }, (_, s) =>
            out.fan[i][s * BLOCKS_PER_CYCLE] > 0 ? 1 : 0,
          );
          const expected = Euclid.pattern(steps, beats, rotation + i * spread);
          if (played.join("") !== expected.join(""))
            wrong.push(
              `E(${beats},${steps})+${rotation} spread ${spread} ch ${"abcd"[i]}: ` +
                `${played.join("")} != ${expected.join("")}`,
            );
        }
      }
    expect(wrong).toEqual([]);
  });

  it("plays the same channel a with `spread` unset and with no fan buffers", () => {
    // Criterion 1 and criterion 6 at processor level. `spread` defaults to 0,
    // so a caller who never sets it gets what the module played before the
    // parameter existed - and however many output buffers arrive, output 0 is
    // the same samples.
    for (const { steps, beats, rotation } of [
      EuclidRhythm.Samba,
      EuclidRhythm.Cinquillo,
    ]) {
      const full = Array.from(
        run(new Worklet(), steps, { steps, beats, rotation }),
      );
      for (const outputs of [1, 2, 5])
        expect(
          Array.from(
            run(new Worklet(), steps, { steps, beats, rotation, outputs }),
          ),
        ).toEqual(full);
      // And unison: at `spread: 0` every channel is channel a.
      const fan = run(new Worklet(), steps, { steps, beats, rotation }).fan;
      expect(fan.slice(1)).toEqual([fan[0], fan[0], fan[0]]);
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

function aRateParams(
  clock: Float32Array,
  params: {
    steps?: number;
    beats?: number;
    pulseWidth?: number;
    spread?: number;
  } = {},
) {
  return {
    clock,
    steps: [params.steps ?? 1],
    beats: [params.beats ?? 1],
    subdivision: [1],
    swing: [1],
    rotation: [0],
    spread: [params.spread ?? 0],
    pulseWidth: [params.pulseWidth ?? 0.5],
    reset: NO_RESET,
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
    spread?: number;
    pulseWidth?: number;
    outputs?: number;
  } = {},
) {
  const out: number[] = [];
  const fan: number[][] = [[], [], [], []];
  for (let i = 0; i < cycles * BLOCKS_PER_CYCLE; i++) {
    const outputs = Array.from({ length: params.outputs ?? 5 }, () => [
      new Float32Array(BLOCK),
    ]);
    worklet.process([], outputs, {
      clock: [(i % BLOCKS_PER_CYCLE) / BLOCKS_PER_CYCLE],
      steps: [params.steps ?? 1],
      beats: [params.beats ?? 1],
      subdivision: [params.subdivision ?? 1],
      swing: [1],
      rotation: [params.rotation ?? 0],
      spread: [params.spread ?? 0],
      pulseWidth: [params.pulseWidth ?? 0.5],
      reset: NO_RESET,
    });
    out.push(outputs[0][0][0]);
    // The fan is outputs 0, 2, 3, 4 - output 1 is the rests. Absent when the
    // caller asked for fewer buffers, which is what pins output 0 as
    // independent of how many came with it.
    [0, 2, 3, 4].forEach((index, channel) => {
      if (outputs[index]) fan[channel].push(outputs[index][0][0]);
    });
  }
  return Object.assign(out, { fan });
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
