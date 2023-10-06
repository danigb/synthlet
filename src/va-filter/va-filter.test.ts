import { VaFilter } from "./va-filter";

describe("VaFilter", () => {
  it("can be instantiated", () => {
    const filter = new VaFilter(44100);
    expect(filter).toBeDefined();
  });

  it("can change params", () => {
    const filter = new VaFilter(44100);
    filter.setParams(2, 1000, 0.5);
  });

  it("process a value", () => {
    const filter = new VaFilter(44100);
    filter.setParams(2, 1000, 0.5);
    const output = filter.process(0.5);
    expect(output).toBe(0.4666971098749088);
  });
});
