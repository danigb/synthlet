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
    // All four stay k-rate: this ticket is about the LFO's output, not its
    // inputs. `read()` is called once per block and `[0]` is the whole read.
    expect(Processor.parameterDescriptors).toMatchSnapshot();
  });

  const params = (type: number) => ({
    type: [type],
    frequency: [5],
    gain: [1],
    offset: [0],
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
