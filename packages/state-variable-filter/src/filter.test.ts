import { createFilter, SvfType } from "./dsp";

describe("SVFilter", () => {
  it("filters the signal", () => {
    const filter = createFilter(20)(SvfType.LowPass);
    const input = new Float32Array(20);
    const output = new Float32Array(20);
    const frequency = new Float32Array(20);
    const q = new Float32Array(20);

    for (let i = 0; i < input.length; i++) {
      input[i] = i % 2 ? 1 : -1;
    }
    expect(input).toMatchSnapshot();
    frequency.fill(10);
    q.fill(0.5);
    filter(input, output, frequency, q);
    expect(output).toMatchSnapshot();

    frequency.fill(5);
    q.fill(0.5);
    filter(input, output, frequency, q);
    expect(output).toMatchSnapshot();
  });
});
