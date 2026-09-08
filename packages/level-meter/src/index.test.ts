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

// The layout, from the reader's side.
const LAYOUT_VERSION = 1;
const HEADER = 3;
const STRIDE = 4;
const TAIL = 2;
const levelsLength = (maxChannels: number) =>
  HEADER + maxChannels * STRIDE + TAIL;

function processorOptions(node: any) {
  return (node as AudioWorkletNodeStub).options.processorOptions;
}

// What the processor would post: one pre-shaped array carrying the whole
// layout.
function frame(maxChannels: number, peaks: number[]) {
  const view = new Float32Array(levelsLength(maxChannels));
  view[0] = LAYOUT_VERSION;
  view[1] = peaks.length;
  peaks.forEach((peak, c) => (view[HEADER + c * STRIDE] = peak));
  return view;
}

function setCrossOriginIsolated(value: boolean) {
  // @ts-ignore - a browser global the factory feature-detects.
  global.crossOriginIsolated = value;
}

describe("LevelMeter", () => {
  beforeAll(() => {
    // @ts-ignore
    global.AudioWorkletNode = AudioWorkletNodeStub;
  });

  afterEach(() => setCrossOriginIsolated(false));

  describe("maxChannels", () => {
    it("defaults to 16 slots", () => {
      const meter = LevelMeter(context);
      expect(meter.getPeaks()).toHaveLength(16);
    });

    it.each([1, 2, 16, 24])("accepts %i", (maxChannels) => {
      const meter = LevelMeter(context, { maxChannels });
      expect(meter.getPeaks()).toHaveLength(maxChannels);
    });

    // `options.maxChannels || 16` turned 0 into 16 - a bug hiding as a default -
    // and handed everything else to the buffer constructor, so `-4` surfaced as
    // a SharedArrayBuffer complaint that never named the option.
    it.each([0, -4, 1.5, NaN, 25])("throws on %p", (maxChannels) => {
      expect(() => LevelMeter(context, { maxChannels })).toThrow(RangeError);
    });
  });

  describe("transport", () => {
    // The precondition this replaces: `new SharedArrayBuffer(...)`,
    // unconditional, throwing a bare ReferenceError from the factory before any
    // of the caller's code ran - on every page that is not cross-origin
    // isolated, which includes the package's own documentation site, since a
    // static GitHub Pages deploy serves no custom headers.
    it("falls back to postMessage off a cross-origin isolated page", () => {
      setCrossOriginIsolated(false);
      const meter = LevelMeter(context);

      expect(meter.transport).toBe("message");
      expect(processorOptions(meter)!.levelsBuffer).toBeUndefined();
    });

    it("uses shared memory on a cross-origin isolated page", () => {
      setCrossOriginIsolated(true);
      const meter = LevelMeter(context, { maxChannels: 4 });

      expect(meter.transport).toBe("shared");
      const buffer = processorOptions(meter)!.levelsBuffer;
      expect(buffer).toBeInstanceOf(SharedArrayBuffer);
      expect(buffer.byteLength).toBe(levelsLength(4) * 4);
    });

    it("does not listen for posted frames when the buffer is shared", () => {
      setCrossOriginIsolated(true);
      const meter = LevelMeter(context);
      expect(meter.port.onmessage).toBeNull();
    });

    it("reads a posted frame into the same view getPeaks() serves", () => {
      setCrossOriginIsolated(false);
      const meter = LevelMeter(context, { maxChannels: 4 });

      meter.port.onmessage!({ data: frame(4, [0.5, 0.25]) } as MessageEvent);

      expect(Array.from(meter.getPeaks())).toEqual([0.5, 0.25, 0, 0]);
    });

    it("reads shared memory on demand", () => {
      setCrossOriginIsolated(true);
      const meter = LevelMeter(context, { maxChannels: 4 });

      // Stand in for the audio thread: write into the buffer the processor was
      // handed, which is the same memory the factory reads.
      const shared = new Float32Array(processorOptions(meter)!.levelsBuffer);
      shared.set(frame(4, [0.75, 0.125]));

      expect(Array.from(meter.getPeaks())).toEqual([0.75, 0.125, 0, 0]);
    });

    it("returns the same array from getPeaks() on every call", () => {
      const meter = LevelMeter(context);
      expect(meter.getPeaks()).toBe(meter.getPeaks());
    });

    it("passes postIntervalMs through, defaulting to about one frame", () => {
      expect(processorOptions(LevelMeter(context))!.postIntervalMs).toBe(16);
      expect(
        processorOptions(LevelMeter(context, { postIntervalMs: 50 }))!
          .postIntervalMs,
      ).toBe(50);
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
