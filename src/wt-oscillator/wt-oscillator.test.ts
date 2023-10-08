import { WtOscillator } from "./wt-oscillator";

describe("PcmOscillator", () => {
  it("can be instantiated", () => {
    const osc = WtOscillator(44100);
    expect(osc).toBeDefined();
  });
});
