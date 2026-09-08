import {
  channels,
  constant,
  createWorkletTestContext,
  runProcess,
  setSampleRate,
  spike,
} from "./test-utils";

// What this harness reaches, and what it does not.
//
// `AudioWorkletProcessor` is a stub, so `process()` is called as a plain method
// with hand-built `Float32Array[][]`. That covers everything about the meter's
// arithmetic - attack, release, hold, channel bounds, disposal. It does **not**
// cover what the browser does *around* the processor: whether an unconnected
// input really arrives as an empty array, or whether a zero-output node is
// rendered at all. Those are browser checks, not unit tests, and a green run
// here does not stand in for them.
//
// Several of these were written against intended behaviour before the processor
// had it, marked `it.failing` with the ticket that would make each pass - jest
// fails a `.failing` test the day it starts passing, which is what turns the
// list into a checklist rather than a comment. None are left.

const SAMPLE_RATE = 48000;
const BLOCK = 128;

// K-Meter's peak ballistics: 26 dB in 3 s, instantaneous rise.
// https://github.com/mzuther/K-Meter/blob/master/Source/meter_ballistics.cpp
const RELEASE_DB_PER_SECOND = 8.7;

describe("LevelMeterProcessor", () => {
  let Processor: any;

  beforeAll(async () => {
    createWorkletTestContext(SAMPLE_RATE);
    Processor = (await import("./worklet")).LevelMeterProcessor;
  });

  afterEach(() => setSampleRate(SAMPLE_RATE));

  it("registers processor", () => {
    expect(global.registerProcessor).toHaveBeenCalledWith(
      "LevelMeterProcessor",
      Processor,
    );
  });

  describe("pass-through", () => {
    it.each([1, 2, 6])(
      "passes %i channels through sample for sample",
      (count) => {
        const meter = createMeter(Processor, { maxChannels: 16 });
        const input = channels(count, ramp);
        const output = runProcess(meter.processor, input);

        for (let c = 0; c < count; c++) {
          expect(Array.from(output[c])).toEqual(Array.from(input[c]));
        }
      },
    );

    // `chOut.set(chIn)` used to live inside a loop capped at `this.max = 8`, so
    // channels 9 and up came out silent from a node the README says passes
    // audio through untouched.
    it.each([9, 16])(
      "passes %i channels through sample for sample",
      (count) => {
        const meter = createMeter(Processor, { maxChannels: 16 });
        const input = channels(count, ramp);
        const output = runProcess(meter.processor, input);

        for (let c = 0; c < count; c++) {
          expect(Array.from(output[c])).toEqual(Array.from(input[c]));
        }
      },
    );

    it("copies no further than the output the browser handed it", () => {
      const meter = createMeter(Processor, { maxChannels: 16 });
      const input = channels(4, ramp);
      const output = runProcess(meter.processor, input, 1, {
        outputChannels: 2,
      });

      expect(output).toHaveLength(2);
      expect(Array.from(output[1])).toEqual(Array.from(input[1]));
    });
  });

  describe("attack", () => {
    it.each([0, 77, BLOCK - 1])(
      "a single full-scale sample at index %i reads 0 dB",
      (index) => {
        const meter = createMeter(Processor, { maxChannels: 1 });
        runProcess(meter.processor, [spike(1, index)]);
        expect(meter.peakDb(0)).toBeCloseTo(0, 6);
      },
    );

    it("reads exactly -Infinity for a silent channel, not a floor", () => {
      const meter = createMeter(Processor, { maxChannels: 1 });
      runProcess(meter.processor, [constant(0)], 10);
      expect(meter.peakDb(0)).toBe(-Infinity);
    });

    it("flushes a decayed peak to exact zero rather than to a denormal", () => {
      const meter = createMeter(Processor, { maxChannels: 1 });
      runProcess(meter.processor, [constant(1)]);
      // 8.7 dB/s takes 23 s to cross the -200 dB flush threshold.
      runProcess(meter.processor, [constant(0)], blocksFor(30, SAMPLE_RATE));
      expect(meter.peak(0)).toBe(0);
      expect(meter.peakDb(0)).toBe(-Infinity);
    });
  });

  describe("release", () => {
    it("falls at the declared rate, and at the same rate at 44.1, 48 and 96 kHz", () => {
      const measured = [44100, 48000, 96000].map((sampleRate) =>
        measureFallRate(Processor, sampleRate),
      );

      for (const rate of measured) {
        expect(relativeError(rate, RELEASE_DB_PER_SECOND)).toBeLessThan(0.05);
      }
      const spread = Math.max(...measured) - Math.min(...measured);
      expect(spread).toBeLessThan(0.05 * RELEASE_DB_PER_SECOND);
    });

    it("honours a releaseDbPerSecond of its own", () => {
      const meter = createMeter(Processor, {
        maxChannels: 1,
        releaseDbPerSecond: 20,
      });
      runProcess(meter.processor, [constant(1)]);
      const blocks = blocksFor(1, SAMPLE_RATE);
      runProcess(meter.processor, [constant(0)], blocks);
      const elapsed = (blocks * BLOCK) / SAMPLE_RATE;
      expect(meter.peakDb(0)).toBeCloseTo(-20 * elapsed, 4);
    });
  });

  describe("hold", () => {
    // K-Meter holds for 10 s, which is right for a mastering meter and too long
    // for a synth voice; 1500 ms is the package's own number.
    const HOLD_MS = 1500;

    it("parks the marker at the maximum for holdMs, then falls at the release rate", () => {
      const meter = createMeter(Processor, { maxChannels: 1, holdMs: HOLD_MS });
      runProcess(meter.processor, [constant(1)]);
      expect(meter.holdDb(0)).toBeCloseTo(0, 6);

      // Still parked just short of holdMs, while the peak underneath it has
      // already fallen more than 10 dB.
      runProcess(meter.processor, [constant(0)], blocksFor(1.4, SAMPLE_RATE));
      expect(meter.holdDb(0)).toBeCloseTo(0, 6);
      expect(meter.peakDb(0)).toBeLessThan(-10);

      // And moving shortly after it.
      runProcess(meter.processor, [constant(0)], blocksFor(0.4, SAMPLE_RATE));
      expect(meter.holdDb(0)).toBeLessThan(-0.5);
    });

    it("falls at the same rate as the peak once the hold expires", () => {
      const meter = createMeter(Processor, { maxChannels: 1, holdMs: HOLD_MS });
      runProcess(meter.processor, [constant(1)]);
      runProcess(meter.processor, [constant(0)], blocksFor(2, SAMPLE_RATE));
      const start = meter.holdDb(0);

      const blocks = blocksFor(2, SAMPLE_RATE);
      runProcess(meter.processor, [constant(0)], blocks);
      const rate = (start - meter.holdDb(0)) / ((blocks * BLOCK) / SAMPLE_RATE);

      expect(relativeError(rate, RELEASE_DB_PER_SECOND)).toBeLessThan(0.05);
    });

    it("re-parks on a new maximum", () => {
      const meter = createMeter(Processor, { maxChannels: 1, holdMs: HOLD_MS });
      runProcess(meter.processor, [constant(0.5)]);
      expect(meter.holdDb(0)).toBeCloseTo(dB(0.5), 5);
      runProcess(meter.processor, [constant(1)]);
      expect(meter.holdDb(0)).toBeCloseTo(0, 6);
    });
  });

  describe("clip", () => {
    it.each([1, -1, 1.5])("latches on a sample of %p", (value) => {
      const meter = createMeter(Processor, { maxChannels: 1 });
      expect(meter.clipped(0)).toBe(false);
      runProcess(meter.processor, [spike(value)]);
      expect(meter.clipped(0)).toBe(true);
    });

    it("does not latch just below the threshold", () => {
      const meter = createMeter(Processor, { maxChannels: 1 });
      runProcess(meter.processor, [spike(0.999)]);
      expect(meter.clipped(0)).toBe(false);
    });

    it("latches per channel, not across the node", () => {
      const meter = createMeter(Processor, { maxChannels: 2 });
      runProcess(meter.processor, [spike(1), constant(0.5)]);
      expect(meter.clipped(0)).toBe(true);
      expect(meter.clipped(1)).toBe(false);
    });

    it("holds the latch for clipHoldMs and then releases it", () => {
      const meter = createMeter(Processor, {
        maxChannels: 1,
        clipHoldMs: 1500,
      });
      runProcess(meter.processor, [spike(1)]);
      runProcess(meter.processor, [constant(0)], blocksFor(1.4, SAMPLE_RATE));
      expect(meter.clipped(0)).toBe(true);
      runProcess(meter.processor, [constant(0)], blocksFor(0.2, SAMPLE_RATE));
      expect(meter.clipped(0)).toBe(false);
    });

    it("clears on a CLEAR_CLIP message from the main thread", () => {
      const meter = createMeter(Processor, { maxChannels: 1 });
      runProcess(meter.processor, [spike(1)]);
      expect(meter.clipped(0)).toBe(true);

      meter.processor.port.onmessage({ data: { type: "CLEAR_CLIP" } });
      expect(meter.clipped(0)).toBe(false);
    });

    it("honours a clipThreshold of its own", () => {
      const meter = createMeter(Processor, {
        maxChannels: 1,
        clipThreshold: 0.5,
      });
      runProcess(meter.processor, [spike(0.6)]);
      expect(meter.clipped(0)).toBe(true);
    });
  });

  describe("silence", () => {
    // The decay used to live inside the measurement loop, and an unconnected
    // input arrives as an empty `inputs[0]`, so the loop body never ran and the
    // reading froze at its last value forever.
    //
    // The empty array is a browser fact rather than a spec guarantee, so this
    // asserts the fix and not the browser. The fix is right either way: an
    // unconditional decay does the same thing whether the array is empty or
    // full of zeros.
    it("keeps decaying while the input is disconnected", () => {
      const meter = createMeter(Processor, { maxChannels: 1 });
      runProcess(meter.processor, [constant(1)]);
      const start = meter.peakDb(0);

      runProcess(meter.processor, [], blocksFor(3, SAMPLE_RATE), {
        outputChannels: 1,
        blockSize: BLOCK,
      });

      expect(meter.peakDb(0)).toBeLessThan(start - 20);
    });
  });

  describe("channel bounds", () => {
    // How many channels to copy, how many to measure and how often to decay are
    // three different numbers, and one loop used to conflate them. Copy is all
    // of them; measure is what the buffer holds.
    it("passes every channel through even when the buffer holds fewer", () => {
      const meter = createMeter(Processor, { maxChannels: 2 });
      const input = channels(9, ramp);
      const output = runProcess(meter.processor, input);

      for (let c = 0; c < 9; c++) {
        expect(Array.from(output[c])).toEqual(Array.from(input[c]));
      }
    });

    it("meters exactly as many channels as the buffer holds", () => {
      const meter = createMeter(Processor, { maxChannels: 2 });
      const input = channels(6, (c) => constant((c + 1) / 10));
      runProcess(meter.processor, input);

      // TypedArray writes past the end are silently discarded, so an
      // out-of-bounds write shows up as a view that is still the size it was.
      expect(meter.view.length).toBe(meterViewLength(2));
      expect(meter.peak(0)).toBeCloseTo(0.1, 6);
      expect(meter.peak(1)).toBeCloseTo(0.2, 6);
    });
  });

  describe("layout", () => {
    it("stamps the layout version and the channel count every block", () => {
      const meter = createMeter(Processor, { maxChannels: 8 });
      expect(meter.version()).toBe(0);

      runProcess(meter.processor, channels(2, ramp));
      expect(meter.version()).toBe(LAYOUT_VERSION);
      expect(meter.channelCount()).toBe(2);

      runProcess(meter.processor, channels(6, ramp));
      expect(meter.channelCount()).toBe(6);
    });

    it("counts only the channels it can measure, not the ones it copies", () => {
      const meter = createMeter(Processor, { maxChannels: 2 });
      runProcess(meter.processor, channels(6, ramp));
      expect(meter.channelCount()).toBe(2);
    });

    // Reporting 0 would hide the decay: an empty `inputs[0]` is "nothing this
    // block", not "zero channels of audio".
    it("keeps the channel count when the input is disconnected", () => {
      const meter = createMeter(Processor, { maxChannels: 2 });
      runProcess(meter.processor, channels(2, ramp));
      runProcess(meter.processor, [], 10, { outputChannels: 2 });
      expect(meter.channelCount()).toBe(2);
    });

    it("leaves the reserved true-peak and LUFS slots alone", () => {
      const meter = createMeter(Processor, { maxChannels: 2 });
      runProcess(
        meter.processor,
        channels(2, () => constant(1)),
        100,
      );

      // Reserved now, written by the true-peak and loudness tickets, so those
      // do not each have to bump the layout version.
      for (let c = 0; c < 2; c++) {
        expect(meter.view[HEADER + c * STRIDE + 3]).toBe(0);
      }
      const tail = HEADER + 2 * STRIDE;
      expect(Array.from(meter.view.slice(tail, tail + TAIL))).toEqual([0, 0]);
    });
  });

  describe("rms", () => {
    // K-Meter's average meter: 0.6 s to 99 % of a step. The one-pole runs on
    // the mean square, so "99 %" is 99 % of the power.
    const RMS_MS = 600;

    it("reads -3.01 dB for a full-scale sine, against 0 dB peak", () => {
      const meter = createMeter(Processor, { maxChannels: 1, rmsMs: RMS_MS });
      const sine = sineBlock(4); // 1500 Hz at 48 kHz
      runProcess(meter.processor, [sine], blocksFor(4, SAMPLE_RATE));

      expect(meter.rmsDb(0)).toBeCloseTo(-3.01, 2);
      expect(meter.peakDb(0)).toBeCloseTo(0, 3);
    });

    it("reads 0 dB for a full-scale square, where peak and rms agree", () => {
      const meter = createMeter(Processor, { maxChannels: 1, rmsMs: RMS_MS });
      runProcess(meter.processor, [constant(1)], blocksFor(4, SAMPLE_RATE));
      expect(meter.rmsDb(0)).toBeCloseTo(0, 2);
    });

    it.each([44100, 48000, 96000])(
      "settles to 99 %% of a step in the declared time at %i Hz",
      (sampleRate) => {
        setSampleRate(sampleRate);
        const meter = createMeter(Processor, { maxChannels: 1, rmsMs: RMS_MS });
        runProcess(
          meter.processor,
          [constant(1)],
          blocksFor(RMS_MS / 1000, sampleRate),
        );

        // 99 % of the power is sqrt(0.99) of the magnitude.
        expect(meter.rms(0)).toBeCloseTo(Math.sqrt(0.99), 2);
      },
    );

    it("is not the peak's release: it neither jumps nor falls with it", () => {
      const meter = createMeter(Processor, { maxChannels: 1, rmsMs: RMS_MS });
      runProcess(meter.processor, [constant(1)]);

      // One block in, the peak is already there and the average is 17 dB
      // behind it, on its way to the same place over the next 0.6 s.
      expect(meter.peakDb(0)).toBeCloseTo(0, 6);
      expect(meter.rmsDb(0)).toBeLessThan(-15);

      runProcess(meter.processor, [constant(1)], blocksFor(4, SAMPLE_RATE));
      expect(meter.rmsDb(0)).toBeCloseTo(0, 2);
    });

    it("keeps falling on a disconnected input, at the same rate as on zeros", () => {
      const disconnected = createMeter(Processor, { maxChannels: 1 });
      const zeros = createMeter(Processor, { maxChannels: 1 });
      runProcess(disconnected.processor, [constant(1)], 200);
      runProcess(zeros.processor, [constant(1)], 200);

      runProcess(disconnected.processor, [], 100, { outputChannels: 1 });
      runProcess(zeros.processor, [constant(0)], 100);

      expect(disconnected.rms(0)).toBeGreaterThan(0);
      expect(disconnected.rms(0)).toBeCloseTo(zeros.rms(0), 6);
    });

    it("reads exactly -Infinity for silence, not a denormal floor", () => {
      const meter = createMeter(Processor, { maxChannels: 1, rmsMs: 10 });
      runProcess(meter.processor, [constant(1)], 10);
      runProcess(meter.processor, [constant(0)], blocksFor(5, SAMPLE_RATE));

      expect(meter.rms(0)).toBe(0);
      expect(meter.rmsDb(0)).toBe(-Infinity);
    });
  });

  describe("transport", () => {
    it("writes into the buffer it was given and posts nothing", () => {
      const meter = createMeter(Processor, { maxChannels: 2 });
      runProcess(
        meter.processor,
        channels(2, () => constant(1)),
        100,
      );

      expect(meter.peak(0)).toBeCloseTo(1, 6);
      expect(meter.processor.port.postMessage).not.toHaveBeenCalled();
    });

    it("owns a buffer and posts it when it was given none", () => {
      const meter = createMeter(Processor, {
        maxChannels: 2,
        transport: "message",
        postIntervalMs: 16,
      });
      const post = meter.processor.port.postMessage;

      // 16 ms is 6 blocks at 48 kHz, so five blocks are not yet a frame.
      runProcess(
        meter.processor,
        channels(2, () => constant(1)),
        5,
      );
      expect(post).not.toHaveBeenCalled();

      runProcess(
        meter.processor,
        channels(2, () => constant(1)),
      );
      expect(post).toHaveBeenCalledTimes(1);

      // The payload is the buffer itself - one pre-shaped array, not an object
      // literal - and it carries the whole layout.
      const posted: Float32Array = post.mock.calls[0][0];
      expect(posted).toBeInstanceOf(Float32Array);
      expect(posted).toHaveLength(meterViewLength(2));
      expect(posted[0]).toBe(LAYOUT_VERSION);
      expect(posted[1]).toBe(2);
      expect(posted[HEADER]).toBeCloseTo(1, 6);
    });

    it("posts at a cadence derived from sampleRate, not from a block count", () => {
      setSampleRate(96000);
      const meter = createMeter(Processor, {
        maxChannels: 1,
        transport: "message",
        postIntervalMs: 16,
      });

      // Twice the sample rate is twice the blocks per 16 ms: 12, not 6.
      runProcess(meter.processor, [constant(1)], 11);
      expect(meter.processor.port.postMessage).not.toHaveBeenCalled();
      runProcess(meter.processor, [constant(1)]);
      expect(meter.processor.port.postMessage).toHaveBeenCalledTimes(1);
    });

    it("reads the same numbers under either transport", () => {
      const shared = createMeter(Processor, { maxChannels: 2 });
      const posted = createMeter(Processor, {
        maxChannels: 2,
        transport: "message",
      });

      const input = () => channels(2, (c) => constant((c + 1) / 4));
      runProcess(shared.processor, input(), 40);
      runProcess(posted.processor, input(), 40);
      runProcess(shared.processor, [], 200, { outputChannels: 2 });
      runProcess(posted.processor, [], 200, { outputChannels: 2 });

      expect(Array.from(posted.view)).toEqual(Array.from(shared.view));
    });
  });

  describe("disposal", () => {
    it("returns false after a DISPOSE message", () => {
      const meter = createMeter(Processor, { maxChannels: 1 });
      const run = () =>
        meter.processor.process(
          [[constant(0)]],
          [[new Float32Array(BLOCK)]],
          {},
        );

      // `true` first, so a regression here fails for the right reason.
      expect(run()).toBe(true);
      meter.processor.port.onmessage({ data: { type: "DISPOSE" } });
      expect(run()).toBe(false);
    });
  });
});

// A whole number of sine cycles in one block, so repeating the block is a
// continuous tone and its mean square is exactly 0.5 - which is what makes
// -3.01 dB an assertion about the meter rather than about the test signal.
function sineBlock(cyclesPerBlock: number): Float32Array {
  const step = (2 * Math.PI * cyclesPerBlock) / BLOCK;
  return Float32Array.from({ length: BLOCK }, (_, i) => Math.sin(i * step));
}

// A distinct waveform per channel, so a pass-through that aliased two channels
// onto one buffer would not go unnoticed.
function ramp(channel: number): Float32Array {
  return Float32Array.from(
    { length: BLOCK },
    (_, i) => Math.sin((i + channel * 7) * 0.1) * 0.5,
  );
}

// The one place in the tests that knows the buffer layout. Both transports
// carry it, so both read through here.
const LAYOUT_VERSION = 1;
const HEADER = 3;
const STRIDE = 4;
const TAIL = 2;

function meterViewLength(maxChannels: number) {
  return HEADER + maxChannels * STRIDE + TAIL;
}

/**
 * A processor with a buffer around it.
 *
 * `transport: "message"` withholds the buffer, which is how the factory tells
 * the processor to own one and post copies of it; the view is then the
 * processor's own, which is what the main thread's copy is a copy of.
 */
function createMeter(Processor: any, options: Record<string, any> = {}) {
  const maxChannels = options.maxChannels ?? 2;
  const levelsBuffer =
    options.transport === "message"
      ? undefined
      : new ArrayBuffer(
          meterViewLength(maxChannels) * Float32Array.BYTES_PER_ELEMENT,
        );
  const processor = new Processor({
    processorOptions: { ...options, maxChannels, levelsBuffer },
  });
  const view: Float32Array = levelsBuffer
    ? new Float32Array(levelsBuffer)
    : processor.v;
  const slot = (channel: number) => HEADER + channel * STRIDE;
  return {
    processor,
    view,
    version: () => view[0],
    channelCount: () => view[1],
    flags: () => view[2],
    peak: (channel: number) => view[slot(channel)],
    peakDb: (channel: number) => dB(view[slot(channel)]),
    hold: (channel: number) => view[slot(channel) + 1],
    holdDb: (channel: number) => dB(view[slot(channel) + 1]),
    rms: (channel: number) => view[slot(channel) + 2],
    rmsDb: (channel: number) => dB(view[slot(channel) + 2]),
    clipped: (channel: number) => ((view[2] >>> channel) & 1) === 1,
  };
}

function dB(magnitude: number) {
  return 20 * Math.log10(magnitude);
}

function blocksFor(seconds: number, sampleRate: number) {
  return Math.round((seconds * sampleRate) / BLOCK);
}

function relativeError(measured: number, expected: number) {
  return Math.abs(measured - expected) / Math.abs(expected);
}

// Full scale, then silence with hold disabled, so what is measured is the
// release alone.
function measureFallRate(Processor: any, sampleRate: number) {
  setSampleRate(sampleRate);
  const meter = createMeter(Processor, { maxChannels: 1 });
  runProcess(meter.processor, [constant(1)]);
  const start = meter.peakDb(0);

  const blocks = blocksFor(2, sampleRate);
  runProcess(meter.processor, [new Float32Array(BLOCK)], blocks);
  const end = meter.peakDb(0);

  return (start - end) / ((blocks * BLOCK) / sampleRate);
}
