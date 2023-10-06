import { PcmOscillator } from "./pcm-oscillator";

describe("PcmOscillator", () => {
  it("can be instantiated", () => {
    const osc = PcmOscillator(44100);
    expect(osc).toBeDefined();
  });
});
