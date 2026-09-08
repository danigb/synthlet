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
function frame(
  maxChannels: number,
  channels: { peak?: number; hold?: number; rms?: number }[],
  flags = 0,
) {
  const view = new Float32Array(levelsLength(maxChannels));
  view[0] = LAYOUT_VERSION;
  view[1] = channels.length;
  view[2] = flags;
  channels.forEach(({ peak = 0, hold = 0, rms = 0 }, c) => {
    view[HEADER + c * STRIDE] = peak;
    view[HEADER + c * STRIDE + 1] = hold;
    view[HEADER + c * STRIDE + 2] = rms;
  });
  return view;
}

// Stand in for the audio thread under either transport: hand the factory a
// frame the way the processor would.
function deliver(meter: any, view: Float32Array) {
  if (meter.transport === "shared") {
    new Float32Array(processorOptions(meter)!.levelsBuffer).set(view);
  } else {
    meter.port.onmessage({ data: view } as MessageEvent);
  }
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

      meter.port.onmessage!({
        data: frame(4, [{ peak: 0.5 }, { peak: 0.25 }]),
      } as MessageEvent);

      expect(Array.from(meter.getPeaks())).toEqual([0.5, 0.25, 0, 0]);
    });

    it("reads shared memory on demand", () => {
      setCrossOriginIsolated(true);
      const meter = LevelMeter(context, { maxChannels: 4 });

      // Stand in for the audio thread: write into the buffer the processor was
      // handed, which is the same memory the factory reads.
      const shared = new Float32Array(processorOptions(meter)!.levelsBuffer);
      shared.set(frame(4, [{ peak: 0.75 }, { peak: 0.125 }]));

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

  describe.each(["shared", "message"] as const)("getLevels() (%s)", (kind) => {
    beforeEach(() => setCrossOriginIsolated(kind === "shared"));

    it("carries the channel count, so the caller does not pass it", () => {
      const meter = LevelMeter(context, { maxChannels: 8 });
      deliver(meter, frame(8, [{ peak: 1 }, { peak: 1 }]));
      expect(meter.getLevels().channelCount).toBe(2);
    });

    it("converts to dB, and reads -Infinity rather than a floor", () => {
      const meter = LevelMeter(context, { maxChannels: 2 });
      deliver(
        meter,
        frame(2, [
          { peak: 1, hold: 1, rms: Math.SQRT1_2 },
          { peak: 0, hold: 0, rms: 0 },
        ]),
      );
      const levels = meter.getLevels();

      expect(levels.peak(0)).toBeCloseTo(0, 6);
      expect(levels.hold(0)).toBeCloseTo(0, 6);
      expect(levels.rms(0)).toBeCloseTo(-3.01, 2);
      expect(levels.peak(1)).toBe(-Infinity);
      expect(levels.rms(1)).toBe(-Infinity);
    });

    it("unpacks the clip latch, one bit per channel", () => {
      const meter = LevelMeter(context, { maxChannels: 4 });
      deliver(meter, frame(4, [{}, {}, {}, {}], 0b1010));
      const levels = meter.getLevels();

      expect([0, 1, 2, 3].map((c) => levels.clipped(c))).toEqual([
        false,
        true,
        false,
        true,
      ]);
    });

    it("clears the latch through the port, and locally at once", () => {
      const meter = LevelMeter(context, { maxChannels: 2 });
      deliver(meter, frame(2, [{}, {}], 0b11));
      const levels = meter.getLevels();
      expect(levels.clipped(0)).toBe(true);

      levels.clearClip();
      expect(meter.port.postMessage).toHaveBeenCalledWith({
        type: "CLEAR_CLIP",
      });
      expect(levels.clipped(0)).toBe(false);
    });

    // "Not measured" and "silent" are different answers, and -Infinity would
    // say the second when the truth is the first.
    it("reads NaN for what is not being measured", () => {
      const meter = LevelMeter(context, { maxChannels: 2 });
      deliver(meter, frame(2, [{ peak: 1 }, { peak: 1 }]));
      const levels = meter.getLevels();

      expect(levels.truePeak(0)).toBeNaN();
      expect(levels.momentary).toBeNaN();
      expect(levels.shortTerm).toBeNaN();
      expect(levels.error).toBe(false);
    });

    it("hands back the same object every call", () => {
      const meter = LevelMeter(context);
      expect(meter.getLevels()).toBe(meter.getLevels());
    });

    it("advances version when the readings change, and not when they do not", () => {
      const meter = LevelMeter(context, { maxChannels: 2 });
      deliver(meter, frame(2, [{ peak: 0.5 }, { peak: 0.5 }]));
      const first = meter.getLevels().version;
      expect(first).toBeGreaterThan(0);

      expect(meter.getLevels().version).toBe(first);

      deliver(meter, frame(2, [{ peak: 0.6 }, { peak: 0.5 }]));
      expect(meter.getLevels().version).toBeGreaterThan(first);
    });

    it("snapshots to a plain object sized by the channel count", () => {
      const meter = LevelMeter(context, { maxChannels: 8 });
      deliver(
        meter,
        frame(8, [{ peak: 1, hold: 1, rms: 1 }, { peak: 0 }], 0b1),
      );
      const snapshot = meter.getLevels().snapshot();

      expect(snapshot).toEqual({
        channelCount: 2,
        peak: [0, -Infinity],
        hold: [0, -Infinity],
        rms: [0, -Infinity],
        truePeak: [NaN, NaN],
        clipped: [true, false],
        momentary: NaN,
        shortTerm: NaN,
        version: meter.getLevels().version,
      });
    });

    // Registering two builds of the processor in one context leaves the first
    // one's bundle in place, so a stride can move underneath a reader.
    it("throws rather than read a layout it does not know", () => {
      const meter = LevelMeter(context, { maxChannels: 2 });
      const stale = frame(2, [{ peak: 1 }, { peak: 1 }]);
      stale[0] = 99;

      expect(() => deliver(meter, stale) ?? meter.getLevels()).toThrow(
        /layout 99/,
      );
    });
  });

  describe("ballistics", () => {
    it("passes the options through to the processor", () => {
      const meter = LevelMeter(context, {
        releaseDbPerSecond: 20,
        holdMs: 500,
        clipHoldMs: 250,
        clipThreshold: 0.9,
        rmsMs: 300,
      });

      expect(processorOptions(meter)).toMatchObject({
        releaseDbPerSecond: 20,
        holdMs: 500,
        clipHoldMs: 250,
        clipThreshold: 0.9,
        rmsMs: 300,
      });
    });

    it("leaves them undefined when not given, so the processor's defaults win", () => {
      const options = processorOptions(LevelMeter(context))!;
      expect(options.releaseDbPerSecond).toBeUndefined();
      expect(options.holdMs).toBeUndefined();
      expect(options.clipHoldMs).toBeUndefined();
      expect(options.clipThreshold).toBeUndefined();
      expect(options.rmsMs).toBeUndefined();
    });
  });
});
