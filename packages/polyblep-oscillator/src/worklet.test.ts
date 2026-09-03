describe("ProcessorNode", () => {
  let Processor: any;
  const sampleRate = 40;

  beforeAll(async () => {
    createWorkletTestContext(sampleRate);
    Processor = (await import("./worklet")).PolyBLEProcessor;
  });

  it("registers processor", () => {
    expect(global.registerProcessor).toHaveBeenCalledWith(
      "PolyBLEProcessor",
      Processor,
    );
  });

  it("has parameter descriptors", () => {
    expect(Processor.parameterDescriptors).toMatchSnapshot();
  });

  it("generates a sawtooth", () => {
    const processor = new Processor();
    const { inputs, outputs } = createInputsOutputs({ length: sampleRate });
    const params = {
      type: [0],
      frequency: [2],
      detune: [0],
    };
    processor.process(inputs, outputs, params);
    expect(outputs).toMatchSnapshot();
  });
  it("generates a square", () => {
    const processor = new Processor();
    const { inputs, outputs } = createInputsOutputs({ length: sampleRate });
    const params = {
      type: [1],
      frequency: [2],
      detune: [0],
    };
    processor.process(inputs, outputs, params);
    expect(outputs).toMatchSnapshot();
  });
  it("generates a triangle", () => {
    const processor = new Processor();
    const { inputs, outputs } = createInputsOutputs({ length: sampleRate });
    const params = {
      type: [2],
      frequency: [2],
      detune: [0],
    };
    processor.process(inputs, outputs, params);
    expect(outputs).toMatchSnapshot();
  });

  it("holds a finite value at frequency 0", () => {
    // `connectParams` writes `param.value = 0` before connecting a node to a
    // param, so every oscillator with a modulated frequency reads 0 until its
    // source produces output. The triangle used to divide by it.
    const processor = new Processor();
    const silent = render(
      processor,
      { type: [2], frequency: [0], detune: [0] },
      1024,
    );
    const after = render(
      processor,
      { type: [2], frequency: [440], detune: [0] },
      1024,
    );

    expect(silent.every(Number.isFinite)).toBe(true);
    expect(after.every(Number.isFinite)).toBe(true);
    // and the node still works afterwards: frequency 0 holds, it does not poison
    expect(after.some((value) => value !== 0)).toBe(true);
  });

  it("rounds a fractional type to the nearest waveform", () => {
    const at = (type: number) =>
      render(
        new Processor(),
        { type: [type], frequency: [2], detune: [0] },
        sampleRate,
      );

    expect(at(1.5)).toEqual(at(2));
    expect(at(1.4)).toEqual(at(1));
  });

  it("wraps the phase at any increment", () => {
    // inc = 20000 / 8000 = 2.5 before clamping: a wrap that subtracts at most
    // once per sample lets the phase run away.
    const previous = globalThis.sampleRate;
    // @ts-ignore
    globalThis.sampleRate = 8000;
    try {
      for (const type of [0, 1, 2]) {
        const output = render(
          new Processor(),
          { type: [type], frequency: [20000], detune: [0] },
          64,
        );
        for (const sample of output) {
          expect(sample).toBeGreaterThanOrEqual(-1.05);
          expect(sample).toBeLessThanOrEqual(1.05);
        }
      }
    } finally {
      // @ts-ignore
      globalThis.sampleRate = previous;
    }
  });
});

function render(
  processor: any,
  params: Record<string, number[]>,
  length: number,
): Float32Array {
  const { inputs, outputs } = createInputsOutputs({ length });
  processor.process(inputs, outputs, params);
  return outputs[0][0];
}

function createWorkletTestContext(sampleRate = 10) {
  // @ts-ignore
  global.sampleRate = sampleRate;
  // @ts-ignore
  global.AudioWorkletProcessor = class AudioWorkletNodeStub {
    port: {
      postMessage: jest.Mock<any, any, any>;
      onmessage: jest.Mock<any, any, any>;
    };

    constructor() {
      this.port = {
        postMessage: jest.fn(),
        onmessage: jest.fn(),
      };
    }
  };
  // @ts-ignore
  global.registerProcessor = jest.fn(); // Mock registerProcessor
}

function createInputsOutputs(
  options: { ins?: number; outs?: number; length?: number } = {},
) {
  const inCount = options.ins ?? 1;
  const outCount = options.outs ?? 1;
  const length = options.length ?? 10;
  const inputs: Float32Array[][] = [];
  const outputs: Float32Array[][] = [];

  for (let i = 0; i < inCount; i++) {
    inputs.push([new Float32Array(length)]);
  }
  for (let i = 0; i < outCount; i++) {
    outputs.push([new Float32Array(length)]);
  }
  return { inputs, outputs };
}

// This file declares helpers at the top level: make it a module so they don't
// collide with the identically named helpers in sibling packages.
export {};
