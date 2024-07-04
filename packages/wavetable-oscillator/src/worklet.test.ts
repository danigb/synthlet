import { getProcessorName } from "./index";
import { createWorkletTestContext } from "./test-utils";

describe("WavetableOscillatorWorkletNode", () => {
  let WavetableOscillatorWorklet: any;
  const sampleRate = 40;

  beforeAll(async () => {
    createWorkletTestContext(sampleRate);
    WavetableOscillatorWorklet = (await import("./worklet"))
      .WavetableOscillatorWorklet;
  });

  it("registers processor", () => {
    expect(global.registerProcessor).toHaveBeenCalledWith(
      getProcessorName(),
      WavetableOscillatorWorklet
    );
  });

  it("has parameter descriptors", () => {
    expect(WavetableOscillatorWorklet.parameterDescriptors).toMatchSnapshot();
  });
});
