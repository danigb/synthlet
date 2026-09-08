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
// Tests marked `it.failing` assert intended behaviour that the shipped
// processor does not have yet; each names the ticket that makes it pass. Jest
// fails a `.failing` test the day it starts passing, which is what turns the
// list into a checklist instead of a comment.

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

// A distinct waveform per channel, so a pass-through that aliased two channels
// onto one buffer would not go unnoticed.
function ramp(channel: number): Float32Array {
  return Float32Array.from(
    { length: BLOCK },
    (_, i) => Math.sin((i + channel * 7) * 0.1) * 0.5,
  );
}

// The one place that knows the buffer layout: tickets 05 and 06 give it a
// header and a stride, and every test above reads through here.
function meterViewLength(maxChannels: number) {
  return maxChannels;
}

function createMeter(Processor: any, options: Record<string, any> = {}) {
  const maxChannels = options.maxChannels ?? 2;
  const peaksBuffer = new ArrayBuffer(
    meterViewLength(maxChannels) * Float32Array.BYTES_PER_ELEMENT,
  );
  const view = new Float32Array(peaksBuffer);
  const processor = new Processor({
    processorOptions: { ...options, peaksBuffer },
  });
  return {
    processor,
    view,
    peak: (channel: number) => view[channel],
    peakDb: (channel: number) => dB(view[channel]),
    // The hold marker and the clip latch are processor-internal until ticket 06
    // gives the buffer a layout with room for them and an accessor over it.
    hold: (channel: number) => processor.h[channel],
    holdDb: (channel: number) => dB(processor.h[channel]),
    clipped: (channel: number) => processor.cl[channel] > 0,
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
