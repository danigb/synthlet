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
  toDb,
  TRUE_PEAK_CEILING_DBTP,
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

  it("builds a loudness core only when asked", () => {
    expect(createLevelAnalyzer(SAMPLE_RATE).loudness).toBeUndefined();
    expect(
      createLevelAnalyzer(SAMPLE_RATE, { loudness: true }).loudness,
    ).toBeDefined();
    expect(createLevelAnalyzer(SAMPLE_RATE).truePeakEnabled).toBe(false);
  });
});

describe("true peak", () => {
  // A steady sine, rounded the way a Float32Array holds it, so the analyzer and
  // a bare detector are handed the same numbers.
  //
  // Faded in over 64 samples, for the reason `lookahead-limiter`'s own test
  // skips the ring fill: a signal that starts abruptly at full scale has a real
  // inter-sample overshoot at its first edge - about +1 dB here - and that is an
  // answer about the edge, not about the steady tone being asserted.
  const ONSET = 64;
  function sine(freq: number, phase: number, length: number) {
    return Float32Array.from({ length }, (_, i) => {
      const fade = i < ONSET ? 0.5 * (1 - Math.cos((Math.PI * i) / ONSET)) : 1;
      return Math.sin((2 * Math.PI * freq * i) / SAMPLE_RATE + phase) * fade;
    });
  }

  /** The limiter's detector, driven directly, exactly as the meter drives it. */
  function detectorMax(channel: Float32Array) {
    const detector = createTruePeakDetector();
    detector.channels(1);
    let highest = 0;
    for (let i = 0; i < channel.length; i++) {
      detector.advance();
      detector.write(0, channel[i]);
      const reconstructed = detector.peak(1);
      if (reconstructed > highest) highest = reconstructed;
    }
    return highest;
  }

  function analyzerMax(channel: Float32Array, channels = [channel]) {
    const analyzer = createLevelAnalyzer(SAMPLE_RATE, {
      maxChannels: channels.length,
      truePeak: true,
    });
    analyzer.process(channels, 0, channel.length);
    analyzer.flush();
    return analyzer;
  }

  it("is off unless it is asked for", () => {
    const analyzer = createLevelAnalyzer(SAMPLE_RATE, { maxChannels: 1 });
    const view = new Float32Array(levelsLength(1)).fill(-1);
    analyzer.process([sine(1000, 0, ANALYSIS_FRAME)]);
    analyzer.results(view);

    expect(analyzer.truePeakEnabled).toBe(false);
    expect(view[levelIndex(0, LEVEL_TRUE_PEAK)]).toBe(-1);
    expect(analyzer.maxTruePeak(0)).toBe(0);
  });

  // The agreement is the whole reason the detector is shared rather than
  // reimplemented: two of them disagreeing by 0.2 dB is a worse outcome than
  // 48 multiply-accumulates.
  it("reports exactly what the limiter's own detector reports", () => {
    const channel = sine(1234, 0.4, 12000);
    expect(analyzerMax(channel).maxTruePeak(0)).toBe(
      Math.fround(detectorMax(channel)),
    );
  });

  it("measures each channel on its own", () => {
    const loud = sine(997, 0, 6000);
    const quiet = Float32Array.from(loud, (x) => x * 0.25);
    const analyzer = analyzerMax(loud, [loud, quiet]);

    expect(analyzer.maxTruePeak(0)).toBe(Math.fround(detectorMax(loud)));
    expect(analyzer.maxTruePeak(1)).toBe(Math.fround(detectorMax(quiet)));
  });

  // The same bound `lookahead-limiter/src/dsp.test.ts` asserts for the detector
  // itself. A sine's true peak is its amplitude analytically, so this needs no
  // second implementation to say what the right answer is.
  it.each([60, 220, 1000, 3150, 10000])(
    "reads a full-scale %i Hz sine within 0.1 dB",
    (freq) => {
      let worst = 0;
      for (let k = 0; k < 8; k++) {
        const db = toDb(
          analyzerMax(sine(freq, (k * Math.PI) / 4, 8000)).maxTruePeak(0),
        );
        if (Math.abs(db) > Math.abs(worst)) worst = db;
      }
      expect(Math.abs(worst)).toBeLessThan(0.1);
    },
  );

  // Sampling a quarter-Nyquist sine at its zero crossings hides 3 dB of it:
  // every sample sits at +/-0.707 while the reconstructed waveform reaches 1.
  // This is the number every streaming delivery spec is written in, and why a
  // track that never exceeds 0 dBFS can still clip a converter.
  it("sees the peak between the samples, and reports it separately", () => {
    const channel = sine(SAMPLE_RATE / 4, Math.PI / 4, 4000);
    const analyzer = analyzerMax(channel);

    expect(toDb(analyzer.maxPeak(0))).toBeCloseTo(-3.01, 1);
    expect(toDb(analyzer.maxTruePeak(0))).toBeGreaterThan(-0.4);
    // Sample peak stays reported alongside: anyone checking a delivery spec
    // needs both numbers, not one of them.
    expect(analyzer.maxPeak(0)).toBeLessThan(analyzer.maxTruePeak(0));
  });

  it("gives the true-peak reading the peak's ballistics", () => {
    const analyzer = createLevelAnalyzer(SAMPLE_RATE, {
      maxChannels: 1,
      truePeak: true,
    });
    const burst = new Float32Array(ANALYSIS_FRAME).fill(0.5);
    analyzer.process([burst]);
    const attacked = analyzer.results()[levelIndex(0, LEVEL_TRUE_PEAK)];
    expect(attacked).toBeGreaterThan(0.4);

    const silence = new Float32Array(ANALYSIS_FRAME);
    for (let i = 0; i < 100; i++) analyzer.process([silence]);
    const released = analyzer.results()[levelIndex(0, LEVEL_TRUE_PEAK)];

    // 100 frames is 0.267 s, so 8.7 dB/s has taken it down 2.32 dB - the same
    // release the sample peak got over the same span.
    expect(toDb(attacked) - toDb(released)).toBeCloseTo(2.32, 1);
  });

  it("drains a channel that stops arriving instead of holding its window", () => {
    const analyzer = createLevelAnalyzer(SAMPLE_RATE, {
      maxChannels: 2,
      truePeak: true,
    });
    const loud = new Float32Array(ANALYSIS_FRAME).fill(0.9);
    analyzer.process([loud, loud]);

    // Channel 1 goes away for 500 frames - long enough for its reading to fall
    // 11 dB - and then comes back silent.
    const silence = new Float32Array(ANALYSIS_FRAME);
    for (let i = 0; i < 500; i++) analyzer.process([silence]);
    const before = analyzer.results()[levelIndex(1, LEVEL_TRUE_PEAK)];

    analyzer.process([silence, silence]);
    const after = analyzer.results()[levelIndex(1, LEVEL_TRUE_PEAK)];

    // A ring still holding the burst would reconstruct it on the first frame
    // back and the reading would jump straight up again. Attack is instant, so
    // "kept falling" is the whole assertion.
    expect(before).toBeLessThan(0.3);
    expect(after).toBeLessThan(before);
  });

  it("names the EBU R 128 ceiling so a renderer need not", () => {
    expect(TRUE_PEAK_CEILING_DBTP).toBe(-1);
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
