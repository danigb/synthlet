import { WavetableOscillator } from "./wavetable-oscillator";

describe("WavetableOscillator", () => {
  it("renders a single plane", () => {
    const osc = WavetableOscillator(10);
    osc.set(new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), 10);
    const inputs = {
      frequency: [110],
      baseFrequency: [220],
      morphFrequency: [1],
    };
    const output = new Float32Array(10);
    osc.agen(output, inputs);
    expect(output).toMatchSnapshot();
    osc.agen(output, inputs);
    expect(output).toMatchSnapshot();
    osc.agen(output, inputs);
    expect(output).toMatchSnapshot();
  });

  it("renders two planes", () => {
    const osc = WavetableOscillator(10);
    osc.set(
      new Float32Array([
        // first plane
        1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
        // second plane
        101, 102, 103, 104, 105, 106, 107, 108, 109, 110,
        // third plane
        201, 202, 203, 204, 205, 206, 207, 208, 209, 210,
      ]),
      10
    );
    const inputs = {
      frequency: [440],
      baseFrequency: [220],
      morphFrequency: [1],
    };
    const output = new Float32Array(10);
    osc.agen(output, inputs);
    expect(output).toMatchSnapshot();
    osc.agen(output, inputs);
    expect(output).toMatchSnapshot();
    osc.agen(output, inputs);
    expect(output).toMatchSnapshot();
  });
});
