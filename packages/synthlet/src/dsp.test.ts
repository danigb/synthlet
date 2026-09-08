import { buildSync } from "esbuild";
import { join } from "path";

import { analyze, createLevelAnalyzer, gainToTarget } from "synthlet/dsp";

/**
 * `synthlet/dsp` - the library's DSP with no Web Audio anywhere near it.
 *
 * This file runs under `testEnvironment: "node"`, so there is no
 * `AudioContext`, no `AudioWorkletProcessor` and no `AudioBuffer`: a single
 * reference to one from the import graph would throw on load rather than fail
 * an assertion. That is the point of the subpath and it is why this test does
 * not stub anything.
 */
describe("synthlet/dsp", () => {
  it("has no Web Audio to reach for", () => {
    expect(typeof globalThis.AudioContext).toBe("undefined");
    expect(typeof (globalThis as any).AudioWorkletProcessor).toBe("undefined");
  });

  it("analyses a buffer", async () => {
    const length = 128 * 40;
    const channel = Float32Array.from({ length }, (_, i) => Math.sin(i * 0.05));

    const analysis = await analyze([channel], 48000);

    expect(analysis.channelCount).toBe(1);
    expect(analysis.peak[0]).toBeCloseTo(0, 1);
  });

  it("reaches the level meter's core and the limiter's", () => {
    expect(typeof createLevelAnalyzer).toBe("function");
    // From `@synthlet/level-meter/dsp`'s loudness half - the number a host
    // actually wants out of an offline analysis.
    expect(gainToTarget(-20, -14)).toBeCloseTo(6, 6);
  });

  // The rule the subpath exists to keep. `synthlet` re-exports twenty-three
  // packages, every one of which carries its worklet as a minified string; an
  // offline-only consumer should not be handed all of them for one function.
  it("does not carry a single worklet into its bundle", () => {
    const built = buildSync({
      entryPoints: [join(__dirname, "dsp-entry.ts")],
      bundle: true,
      write: false,
      format: "esm",
      conditions: ["synthlet-source"],
      logLevel: "silent",
    });
    const code = built.outputFiles[0].text;

    // Not vacuous.
    expect(code).toContain("createLevelAnalyzer");
    expect(code).toContain("createTruePeakDetector");

    expect(code).not.toContain("PROCESSOR");
    expect(code).not.toContain("registerProcessor");
    expect(code).not.toContain("AudioWorkletProcessor");
    expect(code).not.toContain("AudioWorkletNode");
  });
});
