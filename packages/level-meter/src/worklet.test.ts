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

    // Ticket 04: `chOut.set(chIn)` lives inside a loop capped at `this.max = 8`,
    // so channels 9 and up come out silent from a node the README says passes
    // audio through untouched.
    it.failing(
      "passes 9 channels through sample for sample (ticket 04)",
      () => {
        const meter = createMeter(Processor, { maxChannels: 16 });
        const input = channels(9, ramp);
        const output = runProcess(meter.processor, input);

        for (let c = 0; c < 9; c++) {
          expect(Array.from(output[c])).toEqual(Array.from(input[c]));
        }
      },
    );
  });

  describe("attack", () => {
    // Ticket 03: one one-pole serves as both attack and release, so a single
    // full-scale sample reads -20 dB - and -20 dB is also the highest the meter
    // ever gets over the whole decay. A kick drum reads 20 dB low.
    it.failing(
      "a single full-scale sample in a block reads 0 dB (ticket 03)",
      () => {
        const meter = createMeter(Processor, { maxChannels: 1 });
        runProcess(meter.processor, [spike(1)]);
        expect(meter.peakDb(0)).toBeCloseTo(0, 2);
      },
    );
  });

  describe("release", () => {
    // Ticket 03: the coefficient is applied per *block*, so the fall rate is a
    // different constant at every sample rate - 315, 343 and 686 dB/s - and all
    // three are two orders of magnitude too fast.
    it.failing(
      "falls at the declared rate, and at the same rate at 44.1, 48 and 96 kHz (ticket 03)",
      () => {
        const measured = [44100, 48000, 96000].map((sampleRate) =>
          measureFallRate(Processor, sampleRate),
        );

        for (const rate of measured) {
          expect(relativeError(rate, RELEASE_DB_PER_SECOND)).toBeLessThan(0.05);
        }
        const spread = Math.max(...measured) - Math.min(...measured);
        expect(spread).toBeLessThan(0.05 * RELEASE_DB_PER_SECOND);
      },
    );
  });

  describe("silence", () => {
    // Ticket 04: the decay lives inside the measurement loop, and an
    // unconnected input arrives as an empty `inputs[0]`, so the loop body never
    // runs and the reading freezes at its last value forever.
    it.failing(
      "keeps decaying while the input is disconnected (ticket 04)",
      () => {
        const meter = createMeter(Processor, { maxChannels: 1, holdMs: 0 });
        runProcess(meter.processor, [constant(1)]);
        const start = meter.peakDb(0);

        runProcess(meter.processor, [], blocksFor(3, SAMPLE_RATE), {
          outputChannels: 1,
          blockSize: BLOCK,
        });

        expect(meter.peakDb(0)).toBeLessThan(start - 20);
      },
    );
  });

  describe("channel bounds", () => {
    // Ticket 04: how many channels to copy, how many to measure and how often
    // to decay are three different numbers, and the loop conflates them. Copy
    // is all of them; measure is what the buffer holds.
    it.failing(
      "passes every channel through even when the buffer holds fewer (ticket 04)",
      () => {
        const meter = createMeter(Processor, { maxChannels: 2 });
        const input = channels(9, ramp);
        const output = runProcess(meter.processor, input);

        for (let c = 0; c < 9; c++) {
          expect(Array.from(output[c])).toEqual(Array.from(input[c]));
        }
      },
    );

    it("meters no more channels than the buffer holds", () => {
      const meter = createMeter(Processor, { maxChannels: 2 });
      const input = channels(6, () => constant(1));
      runProcess(meter.processor, input);

      // TypedArray writes past the end are silently discarded, so an
      // out-of-bounds write shows up as a view that is still the size it was.
      expect(meter.view.length).toBe(meterViewLength(2));
      expect(meter.peak(0)).toBeGreaterThan(0);
      expect(meter.peak(1)).toBeGreaterThan(0);
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
    peakDb: (channel: number) => 20 * Math.log10(view[channel]),
  };
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
  const meter = createMeter(Processor, { maxChannels: 1, holdMs: 0 });
  runProcess(meter.processor, [constant(1)]);
  const start = meter.peakDb(0);

  const blocks = blocksFor(2, sampleRate);
  runProcess(meter.processor, [new Float32Array(BLOCK)], blocks);
  const end = meter.peakDb(0);

  return (start - end) / ((blocks * BLOCK) / sampleRate);
}
