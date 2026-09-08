import { LevelMeter } from "./index";

// The factory's own surface, not the processor's: what it validates, what it
// sizes, and what it hands the audio thread. `AudioWorkletNode` is a stub, so
// nothing here says anything about what a browser does with the node.
class AudioWorkletNodeStub {
  port = { postMessage: jest.fn(), onmessage: null as any };
  constructor(
    readonly context: unknown,
    readonly processorName: string,
    readonly options: AudioWorkletNodeOptions,
  ) {}
  connect() {}
  disconnect() {}
}

const context = {} as AudioContext;

function processorOptions(node: any) {
  return (node as AudioWorkletNodeStub).options.processorOptions;
}

describe("LevelMeter", () => {
  beforeAll(() => {
    // @ts-ignore
    global.AudioWorkletNode = AudioWorkletNodeStub;
  });

  describe("maxChannels", () => {
    it("defaults to 16 slots", () => {
      const meter = LevelMeter(context);
      expect(meter.getPeaks()).toHaveLength(16);
    });

    it.each([1, 2, 16, 32])("accepts %i", (maxChannels) => {
      const meter = LevelMeter(context, { maxChannels });
      expect(meter.getPeaks()).toHaveLength(maxChannels);
    });

    // `options.maxChannels || 16` turned 0 into 16 - a bug hiding as a default -
    // and handed everything else to the buffer constructor, so `-4` surfaced as
    // a SharedArrayBuffer complaint that never named the option.
    it.each([0, -4, 1.5, NaN, 33])("throws on %p", (maxChannels) => {
      expect(() => LevelMeter(context, { maxChannels })).toThrow(RangeError);
    });
  });

  describe("ballistics", () => {
    it("passes the options through to the processor", () => {
      const meter = LevelMeter(context, {
        releaseDbPerSecond: 20,
        holdMs: 500,
        clipHoldMs: 250,
        clipThreshold: 0.9,
      });

      expect(processorOptions(meter)).toMatchObject({
        releaseDbPerSecond: 20,
        holdMs: 500,
        clipHoldMs: 250,
        clipThreshold: 0.9,
      });
    });

    it("leaves them undefined when not given, so the processor's defaults win", () => {
      const options = processorOptions(LevelMeter(context))!;
      expect(options.releaseDbPerSecond).toBeUndefined();
      expect(options.holdMs).toBeUndefined();
      expect(options.clipHoldMs).toBeUndefined();
      expect(options.clipThreshold).toBeUndefined();
    });
  });
});
