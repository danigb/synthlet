describe("AnalogDelayProcessor", () => {
  let Processor: any;
  const sampleRate = 44100;

  const params = (over: Record<string, number> = {}) => {
    const values: Record<string, number> = {
      time: 0.3,
      feedback: 0.4,
      mix: 0.3,
      taps: 0,
      age: 0.3,
      wobble: 0.3,
      spread: 0,
      mode: 0,
      ...over,
    };
    return Object.fromEntries(
      Object.entries(values).map(([name, value]) => [name, [value]]),
    );
  };

  const stereoOut = (length = 128) => [
    [new Float32Array(length), new Float32Array(length)],
  ];

  const tone = (length: number, frequency = 440) =>
    Float32Array.from({ length }, (_, i) =>
      Math.sin((2 * Math.PI * frequency * i) / sampleRate),
    );

  beforeAll(async () => {
    createWorkletTestContext(sampleRate);
    Processor = (await import("./worklet")).AnalogDelayProcessor;
  });

  it("registers processor", () => {
    expect(global.registerProcessor).toHaveBeenCalledWith(
      "AnalogDelayProcessor",
      Processor,
    );
  });

  it("has parameter descriptors", () => {
    expect(Processor.parameterDescriptors).toMatchSnapshot();
  });

  it("processes a block into stereo output without NaN", () => {
    const processor = new Processor();
    const outputs = stereoOut();
    const running = processor.process(
      [[tone(128)]],
      outputs,
      params({ mix: 1 }),
    );

    expect(running).toBe(true);
    for (const channel of outputs[0]) {
      expect(channel.every((x) => Number.isFinite(x))).toBe(true);
    }
  });

  it("takes the first two channels of a stereo input", () => {
    const processor = new Processor();
    const outputs = stereoOut();
    const left = tone(128, 440);
    const right = tone(128, 660);

    processor.process([[left, right]], outputs, params({ mix: 0 }));

    // `mix: 0` is dry, so the two channels come straight back out - which is
    // only true if the second input channel reached the right-hand line.
    expect(Array.from(outputs[0][0])).toEqual(Array.from(left));
    expect(Array.from(outputs[0][1])).toEqual(Array.from(right));
  });

  it("keeps producing output after the input goes silent", () => {
    // The trap this guards: every other effect in the catalogue early-returns
    // when `inputs[0]` is empty, and a delay that does the same cuts off its
    // own tail the moment its source is disconnected.
    const processor = new Processor();
    const settings = params({ time: 0.02, feedback: 0.7, mix: 1, age: 0 });

    // 882 samples of delay, so ~8 blocks of input is well inside the line.
    for (let block = 0; block < 8; block++) {
      processor.process([[tone(128)]], stereoOut(), settings);
    }

    let energy = 0;
    for (let block = 0; block < 20; block++) {
      const outputs = stereoOut();
      // No input at all: the source is gone.
      expect(processor.process([[]], outputs, settings)).toBe(true);
      for (const value of outputs[0][0]) energy += value * value;
    }

    expect(energy).toBeGreaterThan(0.1);
  });

  it("stops running after DISPOSE", () => {
    const processor = new Processor();
    processor.port.onmessage({ data: { type: "DISPOSE" } });
    expect(
      processor.process([[new Float32Array(8)]], stereoOut(8), params()),
    ).toBe(false);
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
