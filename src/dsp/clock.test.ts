import { Clock } from "./clock";

describe("Clock", () => {
  it("ticks", () => {
    const phasor = new Clock(10, 2);
    const output = [0, 0, 0, 0, 0, 0, 0].map(() => phasor.tick());
    expect(output).toEqual([1, 0, 0, 0, 0, 1, 0]);
  });
});
