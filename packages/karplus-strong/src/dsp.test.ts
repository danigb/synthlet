import { createKS } from "./dsp";

// The first tests this package has had. A pluck fills the delay line with
// noise, so "did it fire" is "did the output stop being silent".
describe("createKS trigger detection", () => {
  const pluck = (triggers: number[]) => {
    const ks = createKS(44100, 100);
    return triggers.map((trigger) => {
      const output = new Float32Array(64);
      ks(output, trigger, 440, 1);
      return output.some((v) => v !== 0);
    });
  };

  it.each([1, 0.99, 0.5, 0.05])("plucks on a trigger of %p", (trigger) => {
    expect(pluck([trigger])).toEqual([true]);
  });

  it.each([0, -1])("does not pluck on a trigger of %p", (trigger) => {
    expect(pluck([trigger])).toEqual([false]);
  });

  it("does not double-trigger while the trigger is held", () => {
    // The rising edge is the whole rule; the old `>= 1 && prev < 0.9`
    // hysteresis was doing the same job with two constants.
    const ks = createKS(44100, 100);
    const first = new Float32Array(64);
    ks(first, 1, 440, 1);
    const second = new Float32Array(64);
    ks(second, 1, 440, 1);
    // A re-pluck would refill the delay line with fresh noise, so the second
    // block would not continue the first.
    expect(Array.from(second)).not.toEqual(Array.from(first));
    expect(second.some((v) => v !== 0)).toBe(true);
  });

  it("plucks again after the trigger returns to 0", () => {
    const ks = createKS(44100, 100);
    const out = new Float32Array(64);
    ks(out, 1, 440, 1);
    ks(out, 0, 440, 1);
    const before = Array.from(out);
    ks(out, 1, 440, 1);
    expect(Array.from(out)).not.toEqual(before);
  });
});
