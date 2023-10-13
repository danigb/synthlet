import { Counter } from "./counter";
import { Phasor } from "./phasor";

describe("Counter", () => {
  it("ticks", () => {
    const phasor = new Phasor(4, 2);
    const counter = new Counter(3);
    const output1 = [0, 0, 0, 0, 0, 0, 0].map(() =>
      counter.tick(phasor.tick())
    );
    expect(output1).toEqual([0, 1, 1, 2, 2, 0, 0]);
    const output2 = [0, 0, 0, 0, 0, 0, 0].map(() =>
      counter.tick(phasor.tick())
    );
    expect(output2).toEqual([1, 1, 2, 2, 0, 0, 1]);
  });
});
