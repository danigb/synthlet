import { WtOscillator } from "./wt-oscillator";

function createTestWavetable(wtLen: number, steps: number) {
  const buffer = new Float32Array(wtLen * steps);
  for (let s = 0; s < steps; s++) {
    for (let i = 0; i < wtLen; i++) {
      buffer[s * wtLen + i] = s + 1;
    }
  }
  return buffer;
}

describe("PcmOscillator", () => {
  it("can create a test wavetable", () => {
    expect(Array.from(createTestWavetable(2, 4))).toEqual([
      1, 1, 2, 2, 3, 3, 4, 4,
    ]);
  });
  it("can be instantiated", () => {
    const osc = WtOscillator(10);
    const wavetable = createTestWavetable(10, 2);
    osc.setWavetable(wavetable, 10);
    osc.setParams({ frequency: [440], morphFrequency: [1] });
    const output = new Float32Array(20);
    osc.fillAudioMono(output);
    expect(Array.from(output)).toMatchInlineSnapshot(`
      [
        1,
        1.100000023841858,
        1.2000000476837158,
        1.2999999523162842,
        1.399999976158142,
        1.5,
        1.600000023841858,
        1.7000000476837158,
        1.7999999523162842,
        1.899999976158142,
        2,
        1.100000023841858,
        1.2000000476837158,
        1.2999999523162842,
        1.399999976158142,
        1.5,
        1.600000023841858,
        1.7000000476837158,
        1.7999999523162842,
        1.899999976158142,
      ]
    `);
  });
});
