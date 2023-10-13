import { Phasor } from "./phasor";

describe("Phasor", () => {
  it("should tick", () => {
    const phasor = new Phasor(10, 2);
    const output = [0, 0, 0, 0, 0, 0, 0].map(() => phasor.tick());
    expect(output).toEqual([0, 0.2, 0.4, 0.6000000000000001, 0.8, 0, 0.2]);
  });
});
