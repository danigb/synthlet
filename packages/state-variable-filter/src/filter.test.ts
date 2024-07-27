import { SVFilter } from "./filter";

describe("SVFilter", () => {
  it("filters the signal", () => {
    const filter = SVFilter(20);
    const input = new Float32Array(20);
    const output = new Float32Array(20);

    for (let i = 0; i < input.length; i++) {
      input[i] = i % 2 ? 1 : -1;
    }
    expect(input).toMatchSnapshot();
    filter.update({
      filterType: [1],
      frequency: [10],
      resonance: [0.5],
    });
    filter.fill(input, output);
    expect(output).toMatchSnapshot();
    filter.update({
      filterType: [1],
      frequency: [5],
      resonance: [0.5],
    });
    filter.fill(input, output);
    expect(output).toMatchSnapshot();
  });
});
