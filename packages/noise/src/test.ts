import { NoiseType } from "./dsp";

describe("NoiseWorkletNode", () => {
  let NoiseWorklet: any;

  beforeAll(async () => {
    createWorkletTestContext();
    NoiseWorklet = (await import("./worklet")).NoiseWorkletProcessor;
  });

  it("registers processor", () => {
    expect(global.registerProcessor).toHaveBeenCalledWith(
      "NoiseWorkletProcessor",
      NoiseWorklet
    );
  });

  it("is generates audio", () => {
    const node = new NoiseWorklet();
    let output = runProcessMono(node, 10, { type: [NoiseType.WHITE_RND] });
    let sum = output.reduce((sum, value) => sum + value, 0);
    expect(sum).not.toBe(0);
    output = runProcessMono(node, 10, { type: [NoiseType.PINK_TRAMMEL] });
    sum = output.reduce((sum, value) => sum + value, 0);
    expect(sum).not.toBe(0);
  });

  it("has parameter descriptors", () => {
    expect(NoiseWorklet.parameterDescriptors).toMatchSnapshot();
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

type Worklet = {
  process: (
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: any
  ) => boolean;
};

export function runProcessMono(
  worklet: Worklet,
  size: number,
  params: any = {}
) {
  const { inputs, outputs } = createInputsOutputs({ length: size });
  worklet.process(inputs, outputs, params);
  return outputs[0][0];
}
