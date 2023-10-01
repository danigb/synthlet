import { VaOscillator } from "./va-oscillator";

describe("VaOscillator", () => {
  it("can be instantiated", () => {
    const osc = new VaOscillator(44100);
    expect(osc).toBeDefined();
  });
});
