import { createFilter, SvfType } from "./dsp";

describe("SVFilter", () => {
  it("filters the signal", () => {
    const filter = createFilter(20);
    const input = new Float32Array(20);
    const output = new Float32Array(20);
    const frequency = new Float32Array(20);
    const type = SvfType.LowPass;
    const q = 0.5;

    for (let i = 0; i < input.length; i++) {
      input[i] = i % 2 ? 1 : -1;
    }
    expect(input).toMatchSnapshot();
    frequency.fill(10);
    filter(input, output, type, frequency, q);
    expect(output).toMatchSnapshot();

    frequency.fill(5);
    filter(input, output, type, frequency, q);
    expect(output).toMatchSnapshot();
  });
});
