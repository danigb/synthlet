import {
  ANALYSIS_FRAME,
  LEVEL_PEAK,
  levelIndex,
  levelsLength,
  toDb,
} from "./dsp";
import { analyze, analyzeAudioBuffer, DEFAULT_CHUNK_SIZE } from "./offline";
import { createWorkletTestContext } from "./test-utils";

const SAMPLE_RATE = 48000;

function tone(length: number, cyclesPerFrame = 4, amplitude = 0.8) {
  const step = (2 * Math.PI * cyclesPerFrame) / ANALYSIS_FRAME;
  return Float32Array.from(
    { length },
    (_, i) => Math.sin(i * step) * amplitude,
  );
}

describe("analyze", () => {
  it("reports the highest peak in the buffer, not the one still on the bar", async () => {
    const length = ANALYSIS_FRAME * 2000; // ~5.3 s, long enough to decay 46 dB
    const channels = [new Float32Array(length)];
    channels[0][10] = 1; // one full-scale sample, right at the start

    const analysis = await analyze(channels, SAMPLE_RATE);

    expect(analysis.peak[0]).toBeCloseTo(0, 6);
    expect(analysis.clipped[0]).toBe(true);
    // The layout view still shows the bar where it actually is.
    expect(analysis.levels[levelIndex(0, LEVEL_PEAK)]).toBeLessThan(0.01);
  });

  it("carries the shape of the buffer", async () => {
    const length = ANALYSIS_FRAME * 100;
    const analysis = await analyze(
      [tone(length), tone(length, 4, 0.25)],
      SAMPLE_RATE,
    );

    expect(analysis.sampleRate).toBe(SAMPLE_RATE);
    expect(analysis.channelCount).toBe(2);
    expect(analysis.length).toBe(length);
    expect(analysis.duration).toBeCloseTo(length / SAMPLE_RATE, 9);
    expect(analysis.peak[0]).toBeCloseTo(toDb(0.8), 4);
    expect(analysis.peak[1]).toBeCloseTo(toDb(0.25), 4);
    expect(analysis.clipped).toEqual([false, false]);
    expect(analysis.levels).toHaveLength(levelsLength(16));
  });

  it("measures true peak when it is asked to", async () => {
    // A quarter-Nyquist sine sampled at its zero crossings: every sample sits
    // at +/-0.707 while the waveform between them reaches 1.
    const length = ANALYSIS_FRAME * 40;
    const step = (2 * Math.PI * (SAMPLE_RATE / 4)) / SAMPLE_RATE;
    const channel = Float32Array.from({ length }, (_, i) =>
      Math.sin(i * step + Math.PI / 4),
    );

    const analysis = await analyze([channel], SAMPLE_RATE, { truePeak: true });

    expect(analysis.peak[0]).toBeCloseTo(-3.01, 1);
    expect(analysis.truePeak[0]).toBeGreaterThan(analysis.peak[0] + 2);
    expect(analysis.truePeak[0]).toBeLessThan(0.4);
  });

  it("reads NaN for what it is not measuring", async () => {
    const analysis = await analyze([tone(ANALYSIS_FRAME)], SAMPLE_RATE);
    expect(analysis.truePeak[0]).toBeNaN();
    expect(analysis.momentary).toBeNaN();
    expect(analysis.shortTerm).toBeNaN();
  });

  it("reports progress once per chunk, ending at 1", async () => {
    const length = ANALYSIS_FRAME * 40; // 5120 samples
    const progress: number[] = [];

    await analyze([tone(length)], SAMPLE_RATE, {
      chunkSize: ANALYSIS_FRAME * 10,
      onProgress: (p) => progress.push(p),
    });

    expect(progress).toHaveLength(4);
    expect(progress[0]).toBeCloseTo(0.25, 9);
    expect(progress[progress.length - 1]).toBe(1);
  });

  it("yields between chunks, so a long analysis is not one turn of the loop", async () => {
    const length = ANALYSIS_FRAME * 40;
    let interleaved = false;

    const running = analyze([tone(length)], SAMPLE_RATE, {
      chunkSize: ANALYSIS_FRAME * 4,
    });
    // A macrotask queued now runs before the analysis finishes only if the
    // analysis actually gives the loop back between chunks.
    setTimeout(() => (interleaved = true), 0);
    await running;

    expect(interleaved).toBe(true);
  });

  it.each([ANALYSIS_FRAME, 1000, DEFAULT_CHUNK_SIZE])(
    "reads the same numbers at a chunk size of %i",
    async (chunkSize) => {
      const length = ANALYSIS_FRAME * 37 + 61; // not a whole number of frames
      const channels = [tone(length), tone(length, 3, 0.5)];

      const reference = await analyze(channels, SAMPLE_RATE, {
        chunkSize: ANALYSIS_FRAME,
      });
      const chunked = await analyze(channels, SAMPLE_RATE, { chunkSize });

      expect(Array.from(chunked.levels)).toEqual(Array.from(reference.levels));
      expect(chunked.peak).toEqual(reference.peak);
    },
  );

  // A `Float64Array` from a decoder holds values the realtime path could never
  // have seen, so it is rounded to Float32 first: the answer is the one the
  // meter would have given, not a slightly better one.
  it("rounds a Float64Array to Float32 before measuring", async () => {
    const length = ANALYSIS_FRAME * 8;
    const wide = Float64Array.from({ length }, (_, i) => Math.sin(i * 0.017));
    const narrow = Float32Array.from(wide);

    const fromWide = await analyze([wide], SAMPLE_RATE);
    const fromNarrow = await analyze([narrow], SAMPLE_RATE);

    expect(Array.from(fromWide.levels)).toEqual(Array.from(fromNarrow.levels));
  });

  it("analyses a plain number[] too", async () => {
    const length = ANALYSIS_FRAME * 4;
    const asArray = Array.from({ length }, (_, i) => Math.sin(i * 0.017));
    const asFloat32 = Float32Array.from(asArray);

    expect(Array.from((await analyze([asArray], SAMPLE_RATE)).levels)).toEqual(
      Array.from((await analyze([asFloat32], SAMPLE_RATE)).levels),
    );
  });

  it("handles an empty buffer without dividing by zero", async () => {
    const analysis = await analyze([], SAMPLE_RATE);
    expect(analysis.channelCount).toBe(0);
    expect(analysis.length).toBe(0);
    expect(analysis.peak).toEqual([]);
  });
});

describe("analyzeAudioBuffer", () => {
  it("adapts an AudioBuffer to the same call", async () => {
    const length = ANALYSIS_FRAME * 20;
    const left = tone(length);
    const right = tone(length, 3, 0.4);
    // The four lines of `AudioBuffer` this adapter actually uses.
    const buffer = {
      sampleRate: SAMPLE_RATE,
      numberOfChannels: 2,
      length,
      getChannelData: (c: number) => (c === 0 ? left : right),
    } as unknown as AudioBuffer;

    const fromBuffer = await analyzeAudioBuffer(buffer);
    const fromArrays = await analyze([left, right], SAMPLE_RATE);

    expect(Array.from(fromBuffer.levels)).toEqual(
      Array.from(fromArrays.levels),
    );
  });
});

// The payoff of the extraction, asserted rather than assumed: the worklet and
// the offline call are one implementation, so they cannot disagree about a
// number a user can see.
describe("offline against realtime", () => {
  let Processor: any;

  beforeAll(async () => {
    createWorkletTestContext(SAMPLE_RATE);
    Processor = (await import("./worklet")).LevelMeterProcessor;
  });

  it.each([false, true])(
    "leaves the layout in exactly the same state (truePeak: %p)",
    async (truePeak) => {
      const frames = 300;
      const length = ANALYSIS_FRAME * frames;
      const channels = [tone(length), tone(length, 7, 0.35)];
      const maxChannels = 4;

      // Realtime: one render quantum at a time, through the processor.
      const realtime = new Float32Array(levelsLength(maxChannels));
      const processor = new Processor({
        processorOptions: {
          maxChannels,
          truePeak,
          levelsBuffer: realtime.buffer,
        },
      });
      for (let frame = 0; frame < frames; frame++) {
        const offset = frame * ANALYSIS_FRAME;
        const block = channels.map((c) =>
          c.subarray(offset, offset + ANALYSIS_FRAME),
        );
        processor.process(
          [block],
          [block.map(() => new Float32Array(ANALYSIS_FRAME))],
          {},
        );
      }

      // Offline: the whole thing, in chunks that are not frames.
      const offline = await analyze(channels, SAMPLE_RATE, {
        maxChannels,
        truePeak,
        chunkSize: 5000,
      });

      expect(Array.from(offline.levels)).toEqual(Array.from(realtime));
    },
  );
});
