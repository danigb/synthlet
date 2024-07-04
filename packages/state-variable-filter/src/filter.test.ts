import { SVFilter, SVFilterType } from "./filter";

describe("SVFilter", () => {
  it("filters the signal", () => {
    const filter = SVFilter(20, SVFilterType.LowPass);
    const input = new Float32Array(20);
    for (let i = 0; i < input.length; i++) {
      input[i] = i % 2 ? 1 : -1;
    }
    expect(input).toMatchSnapshot();
    const output = new Float32Array(20);
    filter.fill(input, output, {
      frequency: [10],
      resonance: [0.5],
    });
    expect(output).toMatchSnapshot();
    filter.fill(input, output, {
      frequency: [5],
      resonance: [0.5],
    });
    expect(output).toMatchSnapshot();
  });
});
