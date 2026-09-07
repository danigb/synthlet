// The processor-level statement of what `dsp.test.ts` proves about the
// generator: `worklet.ts` builds the *audio-rate* one. That single argument is
// the whole of ticket 01, and it is invisible from `dsp.ts`, so it is asserted
// here rather than there.

describe("LfoWorkletProcessor", () => {
  let Processor: any;
  const sampleRate = 44100;

  beforeAll(async () => {
    createWorkletTestContext(sampleRate);
    Processor = (await import("./worklet")).LfoWorkletProcessor;
  });

  it("registers processor", () => {
    expect(global.registerProcessor).toHaveBeenCalledWith(
      "LfoProcessor",
      Processor,
    );
  });

  it("has parameter descriptors", () => {
    // Four k-rate shaping params read once per block, and one a-rate `sync`:
    // an event's whole content is *when*, so a reset read once per block would
    // be a reset quantised to a block.
    expect(Processor.parameterDescriptors).toMatchSnapshot();
  });

  const params = (type: number, sync: ArrayLike<number> = [0]) => ({
    type: [type],
    frequency: [5],
    gain: [1],
    offset: [0],
    sync,
    gate: [0],
    delay: [0],
    attack: [0],
  });

  it("writes a per-sample signal, not one value per block", () => {
    const output = new Float32Array(128);
    new Processor({}).process([], [[output]], params(1 /* Sine */));

    // 128 distinct values from a 5 Hz sine at 44.1 kHz. Before the flip this
    // block was 128 copies of one number.
    expect(new Set(output).size).toBe(128);
  });

  it("keeps its phase across blocks", () => {
    const processor = new Processor({});
    const first = new Float32Array(128);
    const second = new Float32Array(128);
    processor.process([], [[first]], params(1));
    processor.process([], [[second]], params(1));

    // A 5 Hz sine over 256 samples is still rising, and continuously: the step
    // across the block boundary is no larger than the steps inside a block.
    const inside = Math.max(
      ...Array.from(first.subarray(1), (v, i) => Math.abs(v - first[i])),
    );
    expect(Math.abs(second[0] - first[127])).toBeLessThanOrEqual(inside * 1.01);
  });

  it("gives every instance its own generator state", () => {
    // The module scope this is about is the worklet's: an
    // `AudioWorkletGlobalScope` evaluates `dsp.ts` once, so a generator built
    // there is one variable shared by every `LfoProcessor` in the context.
    // Measured before the fix: the first `Impulse` node fired and the second
    // emitted silence, because the first had consumed the shared flag.
    const outputs = [0, 1].map(() => {
      const output = new Float32Array(128);
      new Processor({}).process([], [[output]], params(10 /* Impulse */));
      return output;
    });

    for (const output of outputs) {
      expect(output[0]).toBe(1);
      expect(Array.from(output).filter((value) => value !== 0)).toEqual([1]);
    }
  });

  it("takes its initial phase from processorOptions", () => {
    // `phase` travels as a construction option rather than as an AudioParam:
    // it is a one-time initial condition, and this is the seam it arrives
    // through.
    const output = new Float32Array(128);
    new Processor({ processorOptions: { phase: 0.25 } }).process(
      [],
      [[output]],
      params(1 /* Sine */),
    );
    expect(output[0]).toBeCloseTo(1, 6);

    const unset = new Float32Array(128);
    new Processor({}).process([], [[unset]], params(1));
    expect(unset[0]).toBeCloseTo(0, 6);
  });

  it("resets the phase on a rising edge of sync", () => {
    const sync = new Float32Array(128);
    sync.fill(1, 64);
    const output = new Float32Array(128);
    new Processor({}).process([], [[output]], params(1, sync));

    const free = new Float32Array(128);
    new Processor({}).process([], [[free]], params(1));

    expect(output[64]).toBe(free[0]);
    expect(output[63]).toBe(free[63]);
  });

  it("stops when disposed", () => {
    const processor = new Processor({});
    expect(processor.process([], [[new Float32Array(128)]], params(1))).toBe(
      true,
    );
    processor.port.onmessage({ data: { type: "DISPOSE" } });
    expect(processor.process([], [[new Float32Array(128)]], params(1))).toBe(
      false,
    );
  });
});

function createWorkletTestContext(sampleRate = 44100) {
  // @ts-ignore
  global.sampleRate = sampleRate;
  // @ts-ignore
  global.AudioWorkletProcessor = class AudioWorkletNodeStub {
    port: {
      postMessage: jest.Mock<any, any, any>;
      onmessage: (event: { data: { type: string } }) => void;
    };

    constructor() {
      this.port = {
        postMessage: jest.fn(),
        onmessage: () => {},
      };
    }
  };
  // @ts-ignore
  global.registerProcessor = jest.fn();
}

// This file declares helpers at the top level: make it a module so they don't
// collide with the identically named helpers in sibling packages.
export {};
