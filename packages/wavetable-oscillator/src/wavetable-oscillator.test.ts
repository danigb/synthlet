import { WavetableOscillator } from "./wavetable-oscillator";

// A smoke test, and only that: three blocks off a ten-sample table at a
// sampleRate of 10, small enough to read. Snapshots assert that behaviour has
// not *changed*, and this file is what proves they cannot assert it is *right*
// - these very snapshots recorded the morph click as a +112 step inside a +12
// sequence and ran green on every CI job for fourteen months. The evidence for
// every audio property this package claims is in `dsp.test.ts`, as a number.

describe("WavetableOscillator", () => {
  it("renders a single plane", () => {
    const osc = WavetableOscillator(10);
    osc.set(new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), 10);
    // sampleRate / len = 1 Hz is this table's natural pitch, so 0.5 Hz is half
    // a table sample per output sample. One plane, so `morph` does nothing.
    const inputs = {
      frequency: [0.5],
      morph: [0],
    };
    const output = new Float32Array(10);
    osc.agen(output, inputs);
    expect(output).toMatchSnapshot();
    osc.agen(output, inputs);
    expect(output).toMatchSnapshot();
    osc.agen(output, inputs);
    expect(output).toMatchSnapshot();
  });

  it("renders three planes", () => {
    const osc = WavetableOscillator(10);
    osc.set(
      new Float32Array([
        // first plane
        1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
        // second plane
        101, 102, 103, 104, 105, 106, 107, 108, 109, 110,
        // third plane
        201, 202, 203, 204, 205, 206, 207, 208, 209, 210,
      ]),
      10,
    );
    // Two cycles of a 1 Hz table per second: two table samples per output one.
    // Three planes, so `morph` 0, 0.5 and 1 are planes 0, 1 and 2 exactly - the
    // property ticket 05 exists for, and the round numbers make it legible.
    //
    // The steps between the three blocks are a full plane each, well past the
    // declick's threshold of half a plane per sample, so the second and third
    // snapshots are the 64-sample ramp caught mid-flight rather than the plane
    // read straight. That is the point: a jumped position ramps.
    const output = new Float32Array(10);
    osc.agen(output, { frequency: [2], morph: [0] });
    expect(output).toMatchSnapshot();
    osc.agen(output, { frequency: [2], morph: [0.5] });
    expect(output).toMatchSnapshot();
    osc.agen(output, { frequency: [2], morph: [1] });
    expect(output).toMatchSnapshot();
  });
});
