import { euclid } from "./dsp";

/**
 * The engine, driven directly.
 *
 * Runs in node with no `AudioWorkletProcessor` stub: `dsp.ts` imports nothing
 * from the worklet global scope. `worklet.test.ts` is where the stub lives.
 *
 * One test, deliberately. This file is the door rather than the room - the
 * generator's arithmetic, the `NaN` paths and the named rhythms are the tickets
 * that follow, and every one of them is a call to a plain function now.
 */
describe("euclid", () => {
  it("generates E(3, 8)", () => {
    // Three onsets over eight steps - the tresillo, and the one Euclidean
    // rhythm everybody can hum. `euclid` takes `steps` first.
    expect(euclid(8, 3)).toEqual([1, 0, 0, 1, 0, 0, 1, 0]);
  });
});
