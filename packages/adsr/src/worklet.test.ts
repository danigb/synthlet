import { getAdsrProcessorName } from "./index";

describe("AdsrWorkletNode", () => {
  let Worklet: any;

  beforeAll(async () => {
    createWorkletTestContext(4410);
    Worklet = (await import("./worklet")).AdsrWorkletProcessor;
  });

  it("registers processor", () => {
    expect(global.registerProcessor).toHaveBeenCalledWith(
      getAdsrProcessorName(),
      Worklet
    );
  });

  it("has parameter descriptors", () => {
    expect(Worklet.parameterDescriptors).toMatchSnapshot();
  });
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
