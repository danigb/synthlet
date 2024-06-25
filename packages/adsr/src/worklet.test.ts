import { getProcessorName } from "./index";
import { createWorkletTestContext } from "./__test__/utils";

describe("AdsrWorkletNode", () => {
  let Worklet: any;

  beforeAll(async () => {
    createWorkletTestContext();
    Worklet = (await import("./worklet")).AdsrWorkletProcessor;
  });

  it("registers processor", () => {
    expect(global.registerProcessor).toHaveBeenCalledWith(
      getProcessorName(),
      Worklet
    );
  });

  it("has parameter descriptors", () => {
    expect(Worklet.parameterDescriptors).toMatchSnapshot();
  });
});
