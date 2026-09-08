import { frameListenerCount, isDriverRunning } from "./driver";
import { dbToUnit, formatDb, LevelMeter, Levels } from "./index";

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

// The animation frame, under test control. `subscribe` is defined in terms of
// frames on both transports, so "once per frame" is only assertable if the test
// says when a frame happens.
const pendingFrames = new Map<number, (now: number) => void>();
let nextFrameHandle = 1;
let framesRequested = 0;

function runFrame(now = 0) {
  const due = Array.from(pendingFrames.values());
  pendingFrames.clear();
  for (const callback of due) callback(now);
}

function installFrameStub() {
  (globalThis as any).requestAnimationFrame = (cb: (now: number) => void) => {
    framesRequested++;
    const handle = nextFrameHandle++;
    pendingFrames.set(handle, cb);
    return handle;
  };
  (globalThis as any).cancelAnimationFrame = (handle: number) => {
    pendingFrames.delete(handle);
  };
}

describe("LevelMeter", () => {
  beforeAll(() => {
    // @ts-ignore
    global.AudioWorkletNode = AudioWorkletNodeStub;
    installFrameStub();
  });

  beforeEach(() => {
    // Deliberately not clearing `pendingFrames`: the driver holds at most one
    // frame, and dropping the callback without telling it leaves it believing a
    // frame is pending, so it never schedules another and `runFrame()` silently
    // stops working.
    framesRequested = 0;
  });

  afterEach(() => {
    setCrossOriginIsolated(false);
    // The driver is module state shared by every test in this file.
    expect(frameListenerCount()).toBe(0);
  });

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

  describe.each(["shared", "message"] as const)("subscribe (%s)", (kind) => {
    beforeEach(() => setCrossOriginIsolated(kind === "shared"));

    // Under "message" a posted frame is the trigger; under "shared" memory has
    // no events, so the driver's tick is. Both are one delivery per change.
    const change = (meter: any, view: Float32Array) => {
      deliver(meter, view);
      if (meter.transport === "shared") runFrame();
    };

    it("notifies once per change, and not when nothing changed", () => {
      const meter = LevelMeter(context, { maxChannels: 2 });
      const listener = jest.fn();
      const off = meter.subscribe(listener);

      change(meter, frame(2, [{ peak: 0.5 }, { peak: 0.5 }]));
      expect(listener).toHaveBeenCalledTimes(1);

      runFrame();
      runFrame();
      expect(listener).toHaveBeenCalledTimes(1);

      change(meter, frame(2, [{ peak: 0.6 }, { peak: 0.5 }]));
      expect(listener).toHaveBeenCalledTimes(2);

      // The same readings again: the view was not written, so nothing happened.
      change(meter, frame(2, [{ peak: 0.6 }, { peak: 0.5 }]));
      expect(listener).toHaveBeenCalledTimes(2);

      off();
    });

    it("hands the listener the live accessor", () => {
      const meter = LevelMeter(context, { maxChannels: 2 });
      const seen: Levels[] = [];
      const off = meter.subscribe((levels) => seen.push(levels));

      change(meter, frame(2, [{ peak: 1 }, { peak: 0.5 }]));

      expect(seen).toHaveLength(1);
      expect(seen[0]).toBe(meter.getLevels());
      expect(seen[0].peak(0)).toBeCloseTo(0, 6);
      off();
    });

    it("stops on unsubscribe, and twice is harmless", () => {
      const meter = LevelMeter(context, { maxChannels: 2 });
      const listener = jest.fn();
      const off = meter.subscribe(listener);

      change(meter, frame(2, [{ peak: 0.5 }, {}]));
      expect(listener).toHaveBeenCalledTimes(1);

      off();
      off();
      change(meter, frame(2, [{ peak: 0.9 }, {}]));
      expect(listener).toHaveBeenCalledTimes(1);
      expect(isDriverRunning()).toBe(false);
    });

    it("notifies every subscriber", () => {
      const meter = LevelMeter(context, { maxChannels: 2 });
      const first = jest.fn();
      const second = jest.fn();
      const offs = [meter.subscribe(first), meter.subscribe(second)];

      change(meter, frame(2, [{ peak: 0.5 }, {}]));
      expect(first).toHaveBeenCalledTimes(1);
      expect(second).toHaveBeenCalledTimes(1);

      // One loop for the meter, however many subscribers it has.
      expect(frameListenerCount()).toBe(1);
      offs.forEach((off) => off());
    });
  });

  describe("subscribe rate", () => {
    beforeEach(() => setCrossOriginIsolated(false));

    // Criterion 1. `postIntervalMs` is a caller's option, so "one message is
    // one frame" is a default rather than a guarantee; the frame gate is what
    // makes it one.
    it("never fires more than once per animation frame", () => {
      const meter = LevelMeter(context, { maxChannels: 2, postIntervalMs: 2 });
      const listener = jest.fn();
      const off = meter.subscribe(listener);

      deliver(meter, frame(2, [{ peak: 0.1 }, {}]));
      deliver(meter, frame(2, [{ peak: 0.2 }, {}]));
      deliver(meter, frame(2, [{ peak: 0.3 }, {}]));
      expect(listener).toHaveBeenCalledTimes(1);

      // The updates the messages could not deliver are not lost: the tick
      // carries the latest reading, one frame late at worst.
      runFrame();
      expect(listener).toHaveBeenCalledTimes(2);
      expect(meter.getLevels().peak(0)).toBeCloseTo(20 * Math.log10(0.3), 6);

      runFrame();
      expect(listener).toHaveBeenCalledTimes(2);
      off();
    });

    it("keeps one animation frame for many meters", () => {
      const meters = [1, 2, 3].map(() =>
        LevelMeter(context, { maxChannels: 2 }),
      );
      const offs = meters.map((meter) => meter.subscribe(jest.fn()));

      expect(framesRequested).toBe(1);
      runFrame();
      expect(framesRequested).toBe(2);

      offs.forEach((off) => off());
      expect(isDriverRunning()).toBe(false);
    });

    // Criterion 2.
    it("has no frame pending with no subscriber and no renderer", () => {
      const meter = LevelMeter(context, { maxChannels: 2 });
      expect(isDriverRunning()).toBe(false);

      const off = meter.subscribe(jest.fn());
      expect(isDriverRunning()).toBe(true);

      off();
      expect(isDriverRunning()).toBe(false);
      expect(pendingFrames.size).toBe(0);
    });

    it("dispose() drops the subscribers and the loop", () => {
      const meter = LevelMeter(context, { maxChannels: 2 });
      const listener = jest.fn();
      meter.subscribe(listener);
      expect(isDriverRunning()).toBe(true);

      meter.dispose();
      expect(isDriverRunning()).toBe(false);
      deliver(meter, frame(2, [{ peak: 0.5 }, {}]));
      expect(listener).not.toHaveBeenCalled();
    });
  });

  // Ticket 16's helpers are the package's, not the renderer's: a hand-built UI
  // needs them more than the canvas does.
  describe("dbToUnit and formatDb on the main entry", () => {
    it("are the same functions the renderer uses", () => {
      expect(dbToUnit(-12, -60, 0)).toBeCloseTo(0.8, 12);
      expect(dbToUnit(-Infinity, -40, 0)).toBe(0);
      expect(dbToUnit(6, -40, 0)).toBe(1);
      expect(formatDb(-Infinity)).toBe("−∞");
      expect(formatDb(-12.34, 1)).toBe("−12.3");
    });
  });

  // The README's "Build your own" recipes, pasted, so they cannot rot. Recipe 3
  // is `new LevelMeterUI().attach(canvas, meter)`, which meter-ui.test.ts's
  // `attach` group runs against a stubbed canvas.
  describe("README recipes", () => {
    beforeEach(() => setCrossOriginIsolated(false));

    // Enough DOM for recipe 1 - the node environment has none.
    class ElementStub {
      constructor(readonly tag: string) {}
      className = "";
      title = "";
      readonly style: Record<string, string> = {};
      readonly children: ElementStub[] = [];
      readonly classes = new Set<string>();
      readonly classList = {
        toggle: (name: string, on: boolean) =>
          on ? this.classes.add(name) : this.classes.delete(name),
      };
      append(...nodes: ElementStub[]) {
        this.children.push(...nodes);
      }
    }

    it("recipe 1: a DOM meter in twenty lines", () => {
      const container = new ElementStub("div");
      const document = { createElement: (tag: string) => new ElementStub(tag) };
      const meter = LevelMeter(context, { maxChannels: 4 });

      // --- README, verbatim from `const bars = []` ---
      const bars: any[] = [];

      function addBar(c: number) {
        const row = document.createElement("div");
        const peak = document.createElement("i");
        const hold = document.createElement("b");
        row.className = "bar";
        row.append(peak, hold);
        container.append(row);
        return (bars[c] = { row, peak, hold });
      }

      const stop = meter.subscribe((levels) => {
        for (let c = 0; c < levels.channelCount; c++) {
          const { row, peak, hold } = bars[c] ?? addBar(c);
          peak.style.width = dbToUnit(levels.peak(c), -60, 0) * 100 + "%";
          hold.style.left = dbToUnit(levels.hold(c), -60, 0) * 100 + "%";
          row.classList.toggle("clip", levels.clipped(c));
          row.title = formatDb(levels.peak(c), 1);
        }
      });
      // --- end ---

      // -6 dBFS peak, 0 dBFS hold, channel 1 clipped.
      deliver(
        meter,
        frame(
          4,
          [
            { peak: 0.5, hold: 1 },
            { peak: 1, hold: 1 },
          ],
          0b10,
        ),
      );

      expect(container.children).toHaveLength(2);
      // -6.02 dB on a -60..0 scale is 89.96 % of the way up.
      expect(bars[0].peak.style.width).toBe(
        dbToUnit(20 * Math.log10(0.5), -60, 0) * 100 + "%",
      );
      expect(bars[0].hold.style.left).toBe("100%");
      expect(bars[0].row.title).toBe("−6.0");
      expect(bars[0].row.classes.has("clip")).toBe(false);
      expect(bars[1].row.classes.has("clip")).toBe(true);
      expect(bars[1].row.title).toBe("0.0");

      // A second frame reuses the rows rather than growing the container.
      runFrame();
      deliver(meter, frame(4, [{ peak: 0.25 }, { peak: 1 }], 0b10));
      expect(container.children).toHaveLength(2);
      expect(bars[0].peak.style.width).toBe(
        dbToUnit(20 * Math.log10(0.25), -60, 0) * 100 + "%",
      );

      stop();
    });

    it("recipe 2: a React hook in ten", () => {
      // React's contract for `useSyncExternalStore`, in the twelve lines of it
      // the recipe depends on: read the snapshot, subscribe, and re-render when
      // a notification produces a different one.
      let renders = 0;
      let snapshot: unknown;
      let teardown: (() => void) | null = null;
      const useSyncExternalStore = <T>(
        subscribe: (onChange: () => void) => () => void,
        getSnapshot: () => T,
        // React's third argument. Unused on the client, but the recipe passes
        // it, so the stub has to accept it.
        _getServerSnapshot?: () => T,
      ): T => {
        if (!teardown) {
          snapshot = getSnapshot();
          teardown = subscribe(() => {
            const next = getSnapshot();
            if (!Object.is(next, snapshot)) {
              snapshot = next;
              renders++;
            }
          });
        }
        return snapshot as T;
      };

      const meter = LevelMeter(context, { maxChannels: 2 });

      // --- README, verbatim ---
      function useLevels(meter: any) {
        useSyncExternalStore(
          meter.subscribe,
          () => meter.getLevels().version,
          () => 0,
        );
        return meter.getLevels();
      }
      // --- end ---

      const levels: Levels = useLevels(meter);
      expect(renders).toBe(0);
      expect(levels.channelCount).toBe(0);

      deliver(meter, frame(2, [{ peak: 1 }, { peak: 0.5 }]));
      expect(renders).toBe(1);
      // The hook returns the live accessor, so the component reads the new
      // numbers off the object it already has.
      expect(levels.peak(0)).toBeCloseTo(0, 6);
      expect(levels.channelCount).toBe(2);

      // Nothing changed: no notification, so no re-render.
      runFrame();
      deliver(meter, frame(2, [{ peak: 1 }, { peak: 0.5 }]));
      expect(renders).toBe(1);

      runFrame();
      deliver(meter, frame(2, [{ peak: 0.5 }, { peak: 0.5 }]));
      expect(renders).toBe(2);

      teardown!();
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
