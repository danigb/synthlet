describe("AdWorkletNode", () => {
  let AdWorklet: any;

  beforeAll(async () => {
    createWorkletTestContext();
    AdWorklet = (await import("./worklet")).AdProcessor;
  });

  it("registers processor", () => {
    expect(global.registerProcessor).toHaveBeenCalledWith(
      "AdProcessor",
      AdWorklet,
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

  describe("modulator mode", () => {
    const params = {
      trigger: [1],
      attack: [0.5],
      decay: [0.5],
      offset: [0],
      gain: [1],
    };
    const modulator = () =>
      new AdWorklet({ processorOptions: { mode: "modulator" } });

    it("multiplies a constant 1 input by the generator's envelope", () => {
      const expected = runProcessMono(new AdWorklet(), 10, params);
      const output = runProcessWithInput(
        modulator(),
        new Float32Array(10).fill(1),
        params,
      );
      expect(Array.from(output)).toEqual(Array.from(expected));
    });

    it("is silent for a 0 input", () => {
      const output = runProcessWithInput(
        modulator(),
        new Float32Array(10),
        params,
      );
      expect(output).toEqual(new Float32Array(10));
    });

    it("applies gain and offset to the product, like adsr", () => {
      const loud = { ...params, offset: [100], gain: [50] };
      const expected = runProcessMono(new AdWorklet(), 10, loud);
      const output = runProcessWithInput(
        modulator(),
        new Float32Array(10).fill(1),
        loud,
      );
      expect(Array.from(output)).toEqual(Array.from(expected));
    });

    it("treats an unconnected input as silence", () => {
      const node = modulator();
      const outputs = [[new Float32Array(10)]];
      expect(() => node.process([[]], outputs, params)).not.toThrow();
      expect(outputs[0][0]).toEqual(new Float32Array(10));
    });

    it("processes every channel, not just the first", () => {
      const envelope = Array.from(runProcessMono(new AdWorklet(), 10, params));
      const [left, right] = runProcessChannels(
        modulator(),
        [new Float32Array(10).fill(1), new Float32Array(10).fill(0.5)],
        params,
      );
      // Both channels get the same envelope, each scaled by its own input:
      // the right channel used to come out silent.
      expect(Array.from(left)).toEqual(envelope);
      expect(Array.from(right)).toEqual(envelope.map((v) => v * 0.5));
    });

    it("keeps a hard-panned input panned", () => {
      const [left, right] = runProcessChannels(
        modulator(),
        [new Float32Array(10).fill(1), new Float32Array(10)],
        params,
      );
      expect(Array.from(left).some((v) => v > 0)).toBe(true);
      expect(right).toEqual(new Float32Array(10));
    });

    it("writes the offset to every channel of an unconnected input", () => {
      const node = modulator();
      const outputs = [[new Float32Array(10), new Float32Array(10)]];
      node.process([[]], outputs, { ...params, offset: [100] });
      expect(outputs[0][0]).toEqual(new Float32Array(10).fill(100));
      expect(outputs[0][1]).toEqual(new Float32Array(10).fill(100));
    });
  });

  describe("generator mode", () => {
    it("writes the same envelope to every output channel", () => {
      const params = {
        trigger: [1],
        attack: [0.5],
        decay: [0.5],
        offset: [0],
        gain: [1],
      };
      const outputs = [[new Float32Array(10), new Float32Array(10)]];
      new AdWorklet().process([[]], outputs, params);
      expect(outputs[0][1]).toEqual(outputs[0][0]);
    });
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

type Worklet = {
  process: (
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: any,
  ) => boolean;
};

export function runProcessMono(
  worklet: Worklet,
  size: number,
  params: any = {},
) {
  const { inputs, outputs } = createInputsOutputs({ length: size });
  worklet.process(inputs, outputs, params);
  return outputs[0][0];
}

export function runProcessWithInput(
  worklet: Worklet,
  input: Float32Array,
  params: any = {},
) {
  const outputs = [[new Float32Array(input.length)]];
  worklet.process([[input]], outputs, params);
  return outputs[0][0];
}

// Runs one block with a multi-channel input and an output of the same shape,
// the way Web Audio allocates it when no outputChannelCount is declared.
export function runProcessChannels(
  worklet: Worklet,
  input: Float32Array[],
  params: any = {},
) {
  const outputs = [input.map((channel) => new Float32Array(channel.length))];
  worklet.process([input], outputs, params);
  return outputs[0];
}
