import { createWorkletTestContext } from "./test-utils";

describe("WavetableOscillatorWorkletNode", () => {
  let WavetableOscillatorWorkletProcessor: any;
  const sampleRate = 40;

  beforeAll(async () => {
    createWorkletTestContext(sampleRate);
    WavetableOscillatorWorkletProcessor = (await import("./worklet"))
      .WavetableOscillatorWorkletProcessor;
  });

  it("registers processor", () => {
    expect(global.registerProcessor).toHaveBeenCalledWith(
      "WavetableOscillatorWorkletProcessor",
      WavetableOscillatorWorkletProcessor
    );
  });

  it("has parameter descriptors", () => {
    expect(
      WavetableOscillatorWorkletProcessor.parameterDescriptors
    ).toMatchSnapshot();
  });
});
