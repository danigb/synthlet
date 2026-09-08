import { buildSync } from "esbuild";
import { join } from "path";

import { createTruePeakDetector } from "@synthlet/lookahead-limiter/dsp";

import {
  ANALYSIS_FRAME,
  createLevelAnalyzer,
  LEVEL_HOLD,
  LEVEL_PEAK,
  LEVEL_RMS,
  LEVEL_TRUE_PEAK,
  LEVELS_LAYOUT_VERSION,
  levelIndex,
  levelsLength,
  levelsTailIndex,
} from "./dsp";

// The core, with no worklet anywhere near it. What `worklet.test.ts` asserts
// about the *processor* is asserted there and is not repeated: the proof that
// this file holds the same arithmetic is that that suite passes unchanged over
// it. What is here is what only the pure core can be asked - that chunking does
// not move the numbers, that a partial frame still counts, and that the
// subpath this file is published at carries no worklet.

const SAMPLE_RATE = 48000;

const signal = (length: number, seed = 1) =>
  Float32Array.from(
    { length },
    (_, i) => Math.sin((i + seed) * 0.031) * 0.8 * Math.cos(i * 0.0007),
  );

describe("createLevelAnalyzer", () => {
  it("needs no worklet globals", () => {
    // The stub `worklet.test.ts` installs is not installed here, so a single
    // reference to `sampleRate` or `AudioWorkletProcessor` would throw.
    expect(() => {
      const analyzer = createLevelAnalyzer(SAMPLE_RATE, { maxChannels: 2 });
      analyzer.process([signal(ANALYSIS_FRAME), signal(ANALYSIS_FRAME, 9)]);
      analyzer.results();
    }).not.toThrow();
  });

  it("writes the layout it was handed, in place", () => {
    const analyzer = createLevelAnalyzer(SAMPLE_RATE, { maxChannels: 4 });
    const view = new Float32Array(levelsLength(4));

    analyzer.process([new Float32Array(ANALYSIS_FRAME).fill(1)]);
    expect(analyzer.results(view)).toBe(view);

    expect(view[0]).toBe(LEVELS_LAYOUT_VERSION);
    expect(view[1]).toBe(1);
    expect(view[levelIndex(0, LEVEL_PEAK)]).toBe(1);
    expect(view[levelIndex(0, LEVEL_HOLD)]).toBe(1);
  });

  it("leaves the reserved slots alone while their measurement is off", () => {
    const analyzer = createLevelAnalyzer(SAMPLE_RATE, { maxChannels: 2 });
    const view = new Float32Array(levelsLength(2)).fill(-1);

    analyzer.process([signal(ANALYSIS_FRAME), signal(ANALYSIS_FRAME, 9)]);
    analyzer.results(view);

    // -1 is the sentinel: an untouched slot still holds it.
    expect(view[levelIndex(0, LEVEL_TRUE_PEAK)]).toBe(-1);
    expect(view[levelsTailIndex(2)]).toBe(-1);
    expect(view[levelsTailIndex(2) + 1]).toBe(-1);
    expect(view[levelIndex(0, LEVEL_RMS)]).not.toBe(-1);
  });

  // The property that makes offline and realtime one implementation: a chunk
  // boundary is not a frame boundary, so how the caller slices the audio
  // cannot move a reading.
  it.each([1, 7, 128, 129, 1000, 4096])(
    "reads the same numbers in chunks of %i samples",
    (chunk) => {
      const length = ANALYSIS_FRAME * 40;
      const channels = [signal(length), signal(length, 17)];

      const whole = createLevelAnalyzer(SAMPLE_RATE, { maxChannels: 2 });
      whole.process(channels, 0, length);

      const sliced = createLevelAnalyzer(SAMPLE_RATE, { maxChannels: 2 });
      for (let offset = 0; offset < length; offset += chunk) {
        sliced.process(channels, offset, Math.min(chunk, length - offset));
      }

      expect(Array.from(sliced.results())).toEqual(Array.from(whole.results()));
    },
  );

  it("counts a partial frame only once it is flushed", () => {
    const analyzer = createLevelAnalyzer(SAMPLE_RATE, { maxChannels: 1 });
    const tail = new Float32Array(50).fill(1);

    analyzer.process([tail], 0, 50);
    expect(analyzer.results()[levelIndex(0, LEVEL_PEAK)]).toBe(0);

    analyzer.flush();
    expect(analyzer.results()[levelIndex(0, LEVEL_PEAK)]).toBe(1);
  });

  it("keeps the running maxima a decaying reading cannot", () => {
    const analyzer = createLevelAnalyzer(SAMPLE_RATE, { maxChannels: 1 });
    analyzer.process([new Float32Array(ANALYSIS_FRAME).fill(1)]);
    const silence = new Float32Array(ANALYSIS_FRAME);
    for (let i = 0; i < 1000; i++) analyzer.process([silence]);

    // The bar has fallen 23 dB; "the peak of this buffer" has not moved.
    expect(analyzer.results()[levelIndex(0, LEVEL_PEAK)]).toBeLessThan(0.1);
    expect(analyzer.maxPeak(0)).toBe(1);
    expect(analyzer.everClipped(0)).toBe(true);
  });

  it("advances time on an empty input, so nothing freezes", () => {
    const analyzer = createLevelAnalyzer(SAMPLE_RATE, { maxChannels: 1 });
    analyzer.process([new Float32Array(ANALYSIS_FRAME).fill(1)]);
    const start = analyzer.results()[levelIndex(0, LEVEL_PEAK)];

    for (let i = 0; i < 200; i++) analyzer.process([], 0, ANALYSIS_FRAME);

    expect(analyzer.results()[levelIndex(0, LEVEL_PEAK)]).toBeLessThan(start);
    // And the channel count survives it - an empty input is "nothing this
    // block", not "zero channels of audio".
    expect(analyzer.results()[1]).toBe(1);
  });

  it("resets to construction", () => {
    const analyzer = createLevelAnalyzer(SAMPLE_RATE, { maxChannels: 2 });
    analyzer.process([new Float32Array(ANALYSIS_FRAME).fill(1)]);
    analyzer.reset();

    expect(Array.from(analyzer.results())).toEqual(
      Array.from(
        createLevelAnalyzer(SAMPLE_RATE, { maxChannels: 2 }).results(),
      ),
    );
    expect(analyzer.maxPeak(0)).toBe(0);
    expect(analyzer.everClipped(0)).toBe(false);
  });

  it("has no loudness core until loudness is wired in", () => {
    expect(
      createLevelAnalyzer(SAMPLE_RATE, { loudness: true }).loudness,
    ).toBeUndefined();
    expect(createLevelAnalyzer(SAMPLE_RATE).truePeakEnabled).toBe(false);
  });
});

describe("the ./dsp subpath", () => {
  it("reaches the limiter's true-peak detector", () => {
    // The whole reason the meter can measure dBTP without a second
    // interpolator: one implementation, so the two packages agree by
    // construction rather than by inspection.
    expect(typeof createTruePeakDetector).toBe("function");
    const detector = createTruePeakDetector();
    detector.channels(1);
    detector.advance();
    detector.write(0, 1);
    expect(detector.peak(1)).toBeGreaterThan(0);
  });

  // The rule this subpath exists to keep. An offline-only consumer - a build
  // script, a worker, a node process - must not end up with the minified
  // worklet string in their bundle, and a comment saying so is not a test.
  it("does not carry the worklet into its bundle", () => {
    const built = buildSync({
      entryPoints: [join(__dirname, "dsp-entry.ts")],
      bundle: true,
      write: false,
      format: "esm",
      conditions: ["synthlet-source"],
      logLevel: "silent",
    });
    const code = built.outputFiles[0].text;

    // Not vacuous: the bundle is the core, and only the core.
    expect(code).toContain("createLevelAnalyzer");
    expect(code).toContain("analyze");

    expect(code).not.toContain("PROCESSOR");
    expect(code).not.toContain("registerProcessor");
    expect(code).not.toContain("AudioWorkletProcessor");
    expect(code).not.toContain("AudioWorkletNode");
  });
});
