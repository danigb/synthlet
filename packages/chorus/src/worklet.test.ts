describe("ChorusProcessor", () => {
  let Processor: any;
  const sampleRate = 44100;

  beforeAll(async () => {
    createWorkletTestContext(sampleRate);
    Processor = (await import("./worklet")).ChorusProcessor;
  });

  it("registers processor", () => {
    expect(global.registerProcessor).toHaveBeenCalledWith(
      "ChorusProcessor",
      Processor
    );
  });

  it("has parameter descriptors", () => {
    expect(Processor.parameterDescriptors).toMatchSnapshot();
  });

  it("processes a block into stereo output without NaN", () => {
    const processor = new Processor();
    const length = 128;
    const input = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      input[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate);
    }
    const outputs = [[new Float32Array(length), new Float32Array(length)]];
    const params = {
      delay: [0.5],
      rate: [0.5],
      depth: [0.5],
      deviation: [0.5],
    };

    const running = processor.process([[input]], outputs, params);

    expect(running).toBe(true);
    for (const channel of outputs[0]) {
      expect(channel.every((x) => Number.isFinite(x))).toBe(true);
      expect(channel.some((x) => x !== 0)).toBe(true);
    }
  });

  it("stops running after DISPOSE", () => {
    const processor = new Processor();
    processor.port.onmessage({ data: { type: "DISPOSE" } });
    const outputs = [[new Float32Array(8), new Float32Array(8)]];
    const params = { delay: [0.5], rate: [0.5], depth: [0.5], deviation: [0.5] };
    expect(processor.process([[new Float32Array(8)]], outputs, params)).toBe(
      false
    );
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

// Make this file a module so its helpers don't collide with the identically
// named helpers in other packages' tests under the root tsconfig.
export {};
