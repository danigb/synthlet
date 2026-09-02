describe("LookaheadLimiterProcessor", () => {
  let Worklet: any;

  beforeAll(async () => {
    createWorkletTestContext(48000);
    Worklet = (await import("./worklet")).LookaheadLimiterProcessor;
  });

  it("registers processor", () => {
    expect(global.registerProcessor).toHaveBeenCalledWith(
      "LookaheadLimiterProcessor",
      Worklet,
    );
  });

  it("has parameter descriptors", () => {
    expect(Worklet.parameterDescriptors).toMatchSnapshot();
  });

  it("survives a block with no input channels", () => {
    // An unconnected input arrives as `[[]]`. The limiter still has to render
    // the block - it has a delay line to flush - so this must not throw and
    // must not leave the output untouched garbage.
    const processor = new Worklet({ processorOptions: { lookahead: 2 } });
    const outputs = [[new Float32Array(128)]];

    const running = processor.process([[]], outputs, params());

    expect(running).toBe(true);
    expect(Array.from(outputs[0][0])).toEqual(
      Array.from(new Float32Array(128)),
    );
  });

  it("limits a hot block down to the threshold", () => {
    const processor = new Worklet({ processorOptions: { lookahead: 0.5 } });
    const input = Float32Array.from({ length: 128 }, () => 1);
    const outputs = [[new Float32Array(128)]];

    // Two blocks: the first fills the delay line, the second is the signal.
    processor.process([[input]], outputs, params());
    processor.process([[input]], outputs, params());

    const peak = Math.max(...Array.from(outputs[0][0], Math.abs));
    expect(peak).toBeGreaterThan(0);
    expect(peak).toBeLessThanOrEqual(Math.pow(10, -1 / 20));
  });

  it("stops running once disposed", () => {
    const processor = new Worklet({});
    processor.port.onmessage({ data: { type: "DISPOSE" } });

    expect(processor.process([[]], [[new Float32Array(128)]], params())).toBe(
      false,
    );
  });
});

const params = () => ({
  threshold: new Float32Array([-1]),
  release: new Float32Array([168]),
  gain: new Float32Array([0]),
});

function createWorkletTestContext(sampleRate = 10, ctx: any = global) {
  ctx.sampleRate = sampleRate;
  ctx.registerProcessor = jest.fn();
  ctx.AudioWorkletProcessor = class AudioWorkletNodeStub {
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
}

// This file declares helpers at the top level: make it a module so they don't
// collide with the identically named helpers in sibling packages.
export {};
