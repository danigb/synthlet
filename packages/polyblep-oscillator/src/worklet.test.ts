import { getProcessorName } from "./index";

describe("ProcessorNode", () => {
  let Processor: any;
  const sampleRate = 40;

  beforeAll(async () => {
    createWorkletTestContext(sampleRate);
    Processor = (await import("./worklet")).Processor;
  });

  it("registers processor", () => {
    expect(global.registerProcessor).toHaveBeenCalledWith(
      getProcessorName(),
      Processor
    );
  });

  it("has parameter descriptors", () => {
    expect(Processor.parameterDescriptors).toMatchSnapshot();
  });

  it("generates sine", () => {
    const processor = new Processor();
    const { inputs, outputs } = createInputsOutputs({ length: sampleRate });
    const params = {
      waveform: [0],
      frequency: [2],
    };
    processor.process(inputs, outputs, params);
    expect(outputs).toMatchSnapshot();
  });
  it("generates saw", () => {
    const processor = new Processor();
    const { inputs, outputs } = createInputsOutputs({ length: sampleRate });
    const params = {
      waveform: [1],
      frequency: [2],
    };
    processor.process(inputs, outputs, params);
    expect(outputs).toMatchSnapshot();
  });
  it("generates square", () => {
    const processor = new Processor();
    const { inputs, outputs } = createInputsOutputs({ length: sampleRate });
    const params = {
      waveform: [2],
      frequency: [2],
    };
    processor.process(inputs, outputs, params);
    expect(outputs).toMatchSnapshot();
  });
  it("generates triangle", () => {
    const processor = new Processor();
    const { inputs, outputs } = createInputsOutputs({ length: sampleRate });
    const params = {
      waveform: [3],
      frequency: [2],
    };
    processor.process(inputs, outputs, params);
    expect(outputs).toMatchSnapshot();
  });
});

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
  options: { ins?: number; outs?: number; length?: number } = {}
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
