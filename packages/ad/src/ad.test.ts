describe("AdWorkletNode", () => {
  let AdWorklet: any;

  beforeAll(async () => {
    createWorkletTestContext();
    AdWorklet = (await import("./worklet")).AdProcessor;
  });

  it("registers processor", () => {
    expect(global.registerProcessor).toHaveBeenCalledWith(
      "AdProcessor",
      AdWorklet
    );
  });

  it("is generates offset when not triggered", () => {
    const node = new AdWorklet();
    const params = {
      trigger: [0],
      attack: [0.01],
      decay: [0.1],
      offset: [100],
      gain: [0.5],
    };
    let output = runProcessMono(node, 10, params);
    expect(output).toEqual(new Float32Array(10).fill(100));
  });

  it("generates an envelope with gain", () => {
    const node = new AdWorklet();
    const params = {
      trigger: [1],
      attack: [0.5],
      decay: [0.5],
      offset: [100],
      gain: [50],
    };
    let output = runProcessMono(node, 10, params);
    expect(Array.from(output)).toEqual([
      149.08421325683594, 149.9832305908203, 149.99969482421875, 150, 150, 150,
      106.76676177978516, 100.91577911376953, 100.12393951416016,
      100.01676940917969,
    ]);
  });

  it("has parameter descriptors", () => {
    expect(AdWorklet.parameterDescriptors).toMatchSnapshot();
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
