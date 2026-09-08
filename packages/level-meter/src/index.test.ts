import { frameListenerCount, isDriverRunning } from "./driver";
import {
  dbToUnit,
  formatDb,
  LevelMeter,
  LevelMeterApi,
  Levels,
  registerLevelMeterWorklet,
} from "./index";
import { Compound } from "./_worklet";

// The factory's own surface, not the processor's: what it validates, what it
// sizes, and what it hands the audio thread. `AudioWorkletNode` is a stub, so
// nothing here says anything about what a browser does with the node.
class AudioNodeStub {
  connect = jest.fn();
  disconnect = jest.fn();
  numberOfOutputs = 1;
  constructor(readonly context: unknown = {}) {}
}

class GainNodeStub extends AudioNodeStub {
  gain = { value: 1 };
}

// Every worklet node the factory builds, in order. A tap builds exactly one,
// and it builds it inside `ready` - so this is how a test reaches the node that
// is no longer the thing the factory returns.
const built: AudioWorkletNodeStub[] = [];

class AudioWorkletNodeStub extends AudioNodeStub {
  port = { postMessage: jest.fn(), onmessage: null as any };
  onprocessorerror: ((event: Event) => void) | null = null;
  constructor(
    context: unknown,
    readonly processorName: string,
    readonly options: AudioWorkletNodeOptions,
  ) {
    super(context);
    built.push(this);
  }
}

// A fresh context per test: `createRegistrar` caches its registration on the
// context object, and every test that asserts anything about registration wants
// to start from nothing.
function createContext(): AudioContext {
  const ac: any = {
    audioWorklet: { addModule: jest.fn().mockResolvedValue(undefined) },
    createGain: () => new GainNodeStub(ac),
  };
  return ac as AudioContext;
}

let context: AudioContext;

const addModuleOf = (ac: AudioContext = context) =>
  (ac as any).audioWorklet.addModule as jest.Mock;

// The node a meter built, once `ready` has resolved.
function lastWorklet(): AudioWorkletNodeStub {
  const node = built[built.length - 1];
  if (!node) throw Error("no worklet node was built");
  return node;
}

// The layout, from the reader's side.
const LAYOUT_VERSION = 1;
const HEADER = 3;
const STRIDE = 4;
const TAIL = 3;
const levelsLength = (maxChannels: number) =>
  HEADER + maxChannels * STRIDE + TAIL;

function processorOptions(node: AudioWorkletNodeStub) {
  return node.options.processorOptions;
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
function deliver(
  meter: LevelMeterApi,
  node: AudioWorkletNodeStub,
  view: Float32Array,
) {
  if (meter.transport === "shared") {
    new Float32Array(processorOptions(node)!.levelsBuffer).set(view);
  } else {
    node.port.onmessage({ data: view } as MessageEvent);
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

// A tap, and the node it built. `tap` is synchronous; `ready` is where the
// worklet appears, so almost every assertion below waits for it.
async function tapMeter(options: Parameters<typeof LevelMeter.tap>[1] = {}) {
  const source = new AudioNodeStub(context);
  const meter = LevelMeter.tap(source as unknown as AudioNode, options);
  await meter.ready;
  return { meter, source, node: lastWorklet() };
}

async function passMeter(options: Parameters<typeof LevelMeter>[1] = {}) {
  const meter = LevelMeter(context, options);
  await meter.ready;
  return { meter, node: lastWorklet() };
}

describe("LevelMeter", () => {
  beforeAll(() => {
    // @ts-ignore
    global.AudioWorkletNode = AudioWorkletNodeStub;
    // `disposable` tests its dependencies with `instanceof AudioNode`, which a
    // tap's teardown callback is the first thing here to reach.
    // @ts-ignore
    global.AudioNode = AudioNodeStub;
    installFrameStub();
  });

  beforeEach(() => {
    // Deliberately not clearing `pendingFrames`: the driver holds at most one
    // frame, and dropping the callback without telling it leaves it believing a
    // frame is pending, so it never schedules another and `runFrame()` silently
    // stops working.
    framesRequested = 0;
    context = createContext();
    built.length = 0;
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
    it("falls back to postMessage off a cross-origin isolated page", async () => {
      setCrossOriginIsolated(false);
      const { meter, node } = await passMeter();

      expect(meter.transport).toBe("message");
      expect(processorOptions(node)!.levelsBuffer).toBeUndefined();
    });

    it("uses shared memory on a cross-origin isolated page", async () => {
      setCrossOriginIsolated(true);
      const { meter, node } = await passMeter({ maxChannels: 4 });

      expect(meter.transport).toBe("shared");
      const buffer = processorOptions(node)!.levelsBuffer;
      expect(buffer).toBeInstanceOf(SharedArrayBuffer);
      expect(buffer.byteLength).toBe(levelsLength(4) * 4);
    });

    // The transport is decided from the page, not from the node, so it is
    // knowable before there is a node to ask.
    it("is known synchronously, before ready", () => {
      setCrossOriginIsolated(true);
      expect(LevelMeter(context).transport).toBe("shared");
    });

    it("does not listen for posted frames when the buffer is shared", async () => {
      setCrossOriginIsolated(true);
      const { node } = await passMeter();
      expect(node.port.onmessage).toBeNull();
    });

    it("reads a posted frame into the same view getPeaks() serves", async () => {
      setCrossOriginIsolated(false);
      const { meter, node } = await passMeter({ maxChannels: 4 });

      node.port.onmessage!({
        data: frame(4, [{ peak: 0.5 }, { peak: 0.25 }]),
      } as MessageEvent);

      expect(Array.from(meter.getPeaks())).toEqual([0.5, 0.25, 0, 0]);
    });

    it("reads shared memory on demand", async () => {
      setCrossOriginIsolated(true);
      const { meter, node } = await passMeter({ maxChannels: 4 });

      // Stand in for the audio thread: write into the buffer the processor was
      // handed, which is the same memory the factory reads.
      const shared = new Float32Array(processorOptions(node)!.levelsBuffer);
      shared.set(frame(4, [{ peak: 0.75 }, { peak: 0.125 }]));

      expect(Array.from(meter.getPeaks())).toEqual([0.75, 0.125, 0, 0]);
    });

    it("returns the same array from getPeaks() on every call", () => {
      const meter = LevelMeter(context);
      expect(meter.getPeaks()).toBe(meter.getPeaks());
    });

    it("passes postIntervalMs through, defaulting to about one frame", async () => {
      expect(processorOptions((await passMeter()).node)!.postIntervalMs).toBe(
        16,
      );
      expect(
        processorOptions((await passMeter({ postIntervalMs: 50 })).node)!
          .postIntervalMs,
      ).toBe(50);
    });
  });

  describe.each(["shared", "message"] as const)("getLevels() (%s)", (kind) => {
    beforeEach(() => setCrossOriginIsolated(kind === "shared"));

    it("carries the channel count, so the caller does not pass it", async () => {
      const { meter, node } = await passMeter({ maxChannels: 8 });
      deliver(meter, node, frame(8, [{ peak: 1 }, { peak: 1 }]));
      expect(meter.getLevels().channelCount).toBe(2);
    });

    it("converts to dB, and reads -Infinity rather than a floor", async () => {
      const { meter, node } = await passMeter({ maxChannels: 2 });
      deliver(
        meter,
        node,
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

    it("unpacks the clip latch, one bit per channel", async () => {
      const { meter, node } = await passMeter({ maxChannels: 4 });
      deliver(meter, node, frame(4, [{}, {}, {}, {}], 0b1010));
      const levels = meter.getLevels();

      expect([0, 1, 2, 3].map((c) => levels.clipped(c))).toEqual([
        false,
        true,
        false,
        true,
      ]);
    });

    it("clears the latch through the port, and locally at once", async () => {
      const { meter, node } = await passMeter({ maxChannels: 2 });
      deliver(meter, node, frame(2, [{}, {}], 0b11));
      const levels = meter.getLevels();
      expect(levels.clipped(0)).toBe(true);

      levels.clearClip();
      expect(node.port.postMessage).toHaveBeenCalledWith({
        type: "CLEAR_CLIP",
      });
      expect(levels.clipped(0)).toBe(false);
    });

    // "Not measured" and "silent" are different answers, and -Infinity would
    // say the second when the truth is the first.
    it("reads NaN for what is not being measured", async () => {
      const { meter, node } = await passMeter({ maxChannels: 2 });
      deliver(meter, node, frame(2, [{ peak: 1 }, { peak: 1 }]));
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

    it("advances version when the readings change, and not when they do not", async () => {
      const { meter, node } = await passMeter({ maxChannels: 2 });
      deliver(meter, node, frame(2, [{ peak: 0.5 }, { peak: 0.5 }]));
      const first = meter.getLevels().version;
      expect(first).toBeGreaterThan(0);

      expect(meter.getLevels().version).toBe(first);

      deliver(meter, node, frame(2, [{ peak: 0.6 }, { peak: 0.5 }]));
      expect(meter.getLevels().version).toBeGreaterThan(first);
    });

    it("snapshots to a plain object sized by the channel count", async () => {
      const { meter, node } = await passMeter({ maxChannels: 8 });
      deliver(
        meter,
        node,
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
    it("throws rather than read a layout it does not know", async () => {
      const { meter, node } = await passMeter({ maxChannels: 2 });
      const stale = frame(2, [{ peak: 1 }, { peak: 1 }]);
      stale[0] = 99;

      expect(() => deliver(meter, node, stale) ?? meter.getLevels()).toThrow(
        /layout 99/,
      );
    });
  });

  describe.each(["shared", "message"] as const)("subscribe (%s)", (kind) => {
    beforeEach(() => setCrossOriginIsolated(kind === "shared"));

    // Under "message" a posted frame is the trigger; under "shared" memory has
    // no events, so the driver's tick is. Both are one delivery per change.
    const change = (
      meter: LevelMeterApi,
      node: AudioWorkletNodeStub,
      view: Float32Array,
    ) => {
      deliver(meter, node, view);
      if (meter.transport === "shared") runFrame();
    };

    it("notifies once per change, and not when nothing changed", async () => {
      const { meter, node } = await passMeter({ maxChannels: 2 });
      const listener = jest.fn();
      const off = meter.subscribe(listener);

      change(meter, node, frame(2, [{ peak: 0.5 }, { peak: 0.5 }]));
      expect(listener).toHaveBeenCalledTimes(1);

      runFrame();
      runFrame();
      expect(listener).toHaveBeenCalledTimes(1);

      change(meter, node, frame(2, [{ peak: 0.6 }, { peak: 0.5 }]));
      expect(listener).toHaveBeenCalledTimes(2);

      // The same readings again: the view was not written, so nothing happened.
      change(meter, node, frame(2, [{ peak: 0.6 }, { peak: 0.5 }]));
      expect(listener).toHaveBeenCalledTimes(2);

      off();
    });

    it("hands the listener the live accessor", async () => {
      const { meter, node } = await passMeter({ maxChannels: 2 });
      const seen: Levels[] = [];
      const off = meter.subscribe((levels) => seen.push(levels));

      change(meter, node, frame(2, [{ peak: 1 }, { peak: 0.5 }]));

      expect(seen).toHaveLength(1);
      expect(seen[0]).toBe(meter.getLevels());
      expect(seen[0].peak(0)).toBeCloseTo(0, 6);
      off();
    });

    it("stops on unsubscribe, and twice is harmless", async () => {
      const { meter, node } = await passMeter({ maxChannels: 2 });
      const listener = jest.fn();
      const off = meter.subscribe(listener);

      change(meter, node, frame(2, [{ peak: 0.5 }, {}]));
      expect(listener).toHaveBeenCalledTimes(1);

      off();
      off();
      change(meter, node, frame(2, [{ peak: 0.9 }, {}]));
      expect(listener).toHaveBeenCalledTimes(1);
      expect(isDriverRunning()).toBe(false);
    });

    it("notifies every subscriber", async () => {
      const { meter, node } = await passMeter({ maxChannels: 2 });
      const first = jest.fn();
      const second = jest.fn();
      const offs = [meter.subscribe(first), meter.subscribe(second)];

      change(meter, node, frame(2, [{ peak: 0.5 }, {}]));
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
    it("never fires more than once per animation frame", async () => {
      const { meter, node } = await passMeter({
        maxChannels: 2,
        postIntervalMs: 2,
      });
      const listener = jest.fn();
      const off = meter.subscribe(listener);

      deliver(meter, node, frame(2, [{ peak: 0.1 }, {}]));
      deliver(meter, node, frame(2, [{ peak: 0.2 }, {}]));
      deliver(meter, node, frame(2, [{ peak: 0.3 }, {}]));
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

    it("dispose() drops the subscribers and the loop", async () => {
      const { meter, node } = await passMeter({ maxChannels: 2 });
      const listener = jest.fn();
      meter.subscribe(listener);
      expect(isDriverRunning()).toBe(true);

      meter.dispose();
      expect(isDriverRunning()).toBe(false);
      deliver(meter, node, frame(2, [{ peak: 0.5 }, {}]));
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

    it("recipe 1: a DOM meter in twenty lines", async () => {
      const container = new ElementStub("div");
      const document = { createElement: (tag: string) => new ElementStub(tag) };
      const { meter, node } = await tapMeter({ maxChannels: 4 });

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
        node,
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
      deliver(meter, node, frame(4, [{ peak: 0.25 }, { peak: 1 }], 0b10));
      expect(container.children).toHaveLength(2);
      expect(bars[0].peak.style.width).toBe(
        dbToUnit(20 * Math.log10(0.25), -60, 0) * 100 + "%",
      );

      stop();
    });

    it("recipe 2: a React hook in ten", async () => {
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

      const { meter, node } = await tapMeter({ maxChannels: 2 });

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

      deliver(meter, node, frame(2, [{ peak: 1 }, { peak: 0.5 }]));
      expect(renders).toBe(1);
      // The hook returns the live accessor, so the component reads the new
      // numbers off the object it already has.
      expect(levels.peak(0)).toBeCloseTo(0, 6);
      expect(levels.channelCount).toBe(2);

      // Nothing changed: no notification, so no re-render.
      runFrame();
      deliver(meter, node, frame(2, [{ peak: 1 }, { peak: 0.5 }]));
      expect(renders).toBe(1);

      runFrame();
      deliver(meter, node, frame(2, [{ peak: 0.5 }, { peak: 0.5 }]));
      expect(renders).toBe(2);

      teardown!();
    });
  });

  describe("tap", () => {
    it("has no output at all - in either form", async () => {
      const { node } = await tapMeter();
      expect(node.options.numberOfOutputs).toBe(0);
      expect(node.options.numberOfInputs).toBe(1);

      // Pass-through too: the worklet is beside the path now, not in it.
      const pass = await passMeter();
      expect(pass.node.options.numberOfOutputs).toBe(0);
    });

    // The whole point: metering a connection should not mean breaking it.
    it("adds an edge and changes nothing else", async () => {
      const { meter, source, node } = await tapMeter();

      expect(source.connect).toHaveBeenCalledTimes(1);
      expect(source.connect).toHaveBeenCalledWith(node, 0);
      expect(source.disconnect).not.toHaveBeenCalled();
      // The meter is not the node, and has no output to connect onwards.
      expect(meter as unknown).not.toBe(node);
    });

    it("takes its context from the node, so there is none to pass", async () => {
      const { source, node } = await tapMeter();
      expect(node.context).toBe(context);
      expect(source.context).toBe(context);
    });

    it("connects the output it was asked for", async () => {
      const source = new AudioNodeStub(context);
      source.numberOfOutputs = 3;
      const meter = LevelMeter.tap(source as unknown as AudioNode, {
        output: 2,
      });
      await meter.ready;

      expect(source.connect).toHaveBeenCalledWith(lastWorklet(), 2);
    });

    it("leaves the graph as it was on dispose", async () => {
      const { meter, source, node } = await tapMeter();

      meter.dispose();
      expect(source.disconnect).toHaveBeenCalledTimes(1);
      expect(source.disconnect).toHaveBeenCalledWith(node, 0);
      // `disposable`'s own cascade still ran.
      expect(node.port.postMessage).toHaveBeenCalledWith({ type: "DISPOSE" });
    });

    it("disposes once, however many times it is asked", async () => {
      const { meter, source } = await tapMeter();

      meter.dispose();
      meter.dispose();
      expect(source.disconnect).toHaveBeenCalledTimes(1);
    });

    it("takes the same options as the pass-through form", async () => {
      const { meter, node } = await tapMeter({ maxChannels: 4, holdMs: 500 });
      expect(meter.getPeaks()).toHaveLength(4);
      expect(processorOptions(node)).toMatchObject({ holdMs: 500 });
    });

    it("says which engine is running", () => {
      const meter = LevelMeter.tap(
        new AudioNodeStub(context) as unknown as AudioNode,
      );
      expect(meter.engine).toBe("worklet");
    });

    // `ac.destination` is the node people reach for first, and it is exactly
    // the one that cannot be tapped.
    it("refuses a node with no outputs, and says what to tap instead", () => {
      class AudioDestinationNode extends AudioNodeStub {
        numberOfOutputs = 0;
      }
      const destination = new AudioDestinationNode(context);

      expect(() => LevelMeter.tap(destination as unknown as AudioNode)).toThrow(
        /AudioDestinationNode has no outputs to tap/,
      );
      expect(() => LevelMeter.tap(destination as unknown as AudioNode)).toThrow(
        /connect to it/,
      );
    });

    it("refuses an output the node does not have", () => {
      const source = new AudioNodeStub(context);
      expect(() =>
        LevelMeter.tap(source as unknown as AudioNode, { output: 1 }),
      ).toThrow(RangeError);
    });

    // A `Compound` *is* its output node with properties assigned, so tapping
    // one needs no reference to which node it ends in.
    it("taps a compound without knowing its output node", async () => {
      const out = new GainNodeStub(context);
      const compound = Compound({
        output: out as unknown as GainNode,
        exposes: { trigger: { value: 0 } },
      });

      const meter = LevelMeter.tap(compound);
      await meter.ready;

      expect(out.connect).toHaveBeenCalledWith(lastWorklet(), 0);
    });
  });

  describe("ready", () => {
    it("registers the worklet itself - no call for the caller to forget", async () => {
      const { node } = await tapMeter();
      expect(addModuleOf()).toHaveBeenCalledTimes(1);
      expect(node.processorName).toBe("LevelMeterProcessor");
    });

    it("registers once however many meters a context carries", async () => {
      const first = LevelMeter.tap(
        new AudioNodeStub(context) as unknown as AudioNode,
      );
      const second = LevelMeter.tap(
        new AudioNodeStub(context) as unknown as AudioNode,
      );
      await Promise.all([first.ready, second.ready]);

      expect(addModuleOf()).toHaveBeenCalledTimes(1);
      expect(built).toHaveLength(2);
    });

    // The trick that makes the synchronous facade honest: a tap has no output,
    // so nothing downstream can notice it is not connected yet.
    it("reads silence before it resolves, and never throws", () => {
      const meter = LevelMeter.tap(
        new AudioNodeStub(context) as unknown as AudioNode,
      );
      const levels = meter.getLevels();

      expect(built).toHaveLength(0);
      expect(levels.channelCount).toBe(0);
      expect(levels.peak(0)).toBe(-Infinity);
      expect(levels.hold(0)).toBe(-Infinity);
      expect(levels.rms(0)).toBe(-Infinity);
      expect(levels.clipped(0)).toBe(false);
      expect(() => levels.clearClip()).not.toThrow();
      expect(levels.snapshot()).toMatchObject({ channelCount: 0 });
    });

    it("fires no subscriber while it is pending", async () => {
      const meter = LevelMeter.tap(
        new AudioNodeStub(context) as unknown as AudioNode,
      );
      const listener = jest.fn();
      const off = meter.subscribe(listener);

      runFrame();
      runFrame();
      expect(listener).not.toHaveBeenCalled();

      await meter.ready;
      off();
    });

    it("dispose() before ready builds nothing and connects nothing", async () => {
      const source = new AudioNodeStub(context);
      const meter = LevelMeter.tap(source as unknown as AudioNode);

      meter.dispose();
      await meter.ready;

      expect(built).toHaveLength(0);
      expect(source.connect).not.toHaveBeenCalled();
      expect(source.disconnect).not.toHaveBeenCalled();
      expect(isDriverRunning()).toBe(false);
    });

    it("rejects when the worklet cannot be registered", async () => {
      addModuleOf().mockRejectedValueOnce(new Error("blocked by CSP"));
      const meter = LevelMeter.tap(
        new AudioNodeStub(context) as unknown as AudioNode,
      );

      await expect(meter.ready).rejects.toThrow("blocked by CSP");
      // Still readable, still silent - a failed meter is not a broken object.
      expect(meter.getLevels().channelCount).toBe(0);
      expect(built).toHaveLength(0);
    });
  });

  describe("pass-through", () => {
    it("is a GainNode with a tap beside it, not a worklet in the path", async () => {
      const { meter } = await passMeter();
      expect(meter).toBeInstanceOf(GainNodeStub);
    });

    it("connects its own gain to the tap", async () => {
      const { meter, node } = await passMeter();
      expect((meter as unknown as GainNodeStub).connect).toHaveBeenCalledWith(
        node,
        0,
      );
    });

    it("takes the tap down with it", async () => {
      const { meter, node } = await passMeter();
      const gain = meter as unknown as GainNodeStub;

      meter.dispose();

      expect(node.port.postMessage).toHaveBeenCalledWith({ type: "DISPOSE" });
      expect(gain.disconnect).toHaveBeenCalledWith(node, 0);
    });
  });

  // A dead processor was indistinguishable from a silent signal: the browser
  // stops calling `process()` for good, and the readings simply stop moving.
  describe.each(["pass-through", "tap"] as const)(
    "onprocessorerror (%s)",
    (form) => {
      const build = async (options: Parameters<typeof LevelMeter>[1] = {}) =>
        form === "tap" ? await tapMeter(options) : await passMeter(options);

      it("is observable from the main thread", async () => {
        const { meter, node } = await build();
        expect(meter.getLevels().error).toBe(false);

        node.onprocessorerror!(new Event("processorerror"));

        expect(meter.getLevels().error).toBe(true);
      });

      it("calls onError with the event", async () => {
        const onError = jest.fn();
        const { node } = await build({ onError });
        const event = new Event("processorerror");

        node.onprocessorerror!(event);

        expect(onError).toHaveBeenCalledTimes(1);
        expect(onError).toHaveBeenCalledWith(event);
      });

      it("stays flagged - a dead processor does not come back", async () => {
        const { meter, node } = await build();
        node.onprocessorerror!(new Event("processorerror"));

        deliver(meter, node, frame(16, [{ peak: 1 }]));
        expect(meter.getLevels().error).toBe(true);
      });
    },
  );

  // `createRegistrar` is the shared contract in `scripts/_worklet.ts`, copied
  // into all 23 packages. It is exercised here because this is the package that
  // made a cached failure matter: once `LevelMeter.tap` registers implicitly,
  // nobody is watching the call that failed.
  describe("registerLevelMeterWorklet", () => {
    const workletContext = (addModule: jest.Mock) =>
      ({ audioWorklet: { addModule } }) as unknown as AudioContext;

    it("registers once per context, however many meters ask", async () => {
      const addModule = jest.fn().mockResolvedValue(undefined);
      const ac = workletContext(addModule);

      await Promise.all([
        registerLevelMeterWorklet(ac),
        registerLevelMeterWorklet(ac),
      ]);
      await registerLevelMeterWorklet(ac);

      expect(addModule).toHaveBeenCalledTimes(1);
    });

    // The promise was cached before it settled and never cleared, so one
    // rejection - a CSP that blocks `blob:`, a closed context, a dev-server
    // hiccup - made every later call on that context fail identically, forever.
    it("retries after a rejection rather than caching it forever", async () => {
      const addModule = jest
        .fn()
        .mockRejectedValueOnce(new Error("blocked by CSP"))
        .mockResolvedValueOnce(undefined);
      const ac = workletContext(addModule);

      await expect(registerLevelMeterWorklet(ac)).rejects.toThrow(
        "blocked by CSP",
      );
      await expect(registerLevelMeterWorklet(ac)).resolves.toBeUndefined();
      expect(addModule).toHaveBeenCalledTimes(2);
    });

    it("still caches the success that follows a failure", async () => {
      const addModule = jest
        .fn()
        .mockRejectedValueOnce(new Error("nope"))
        .mockResolvedValue(undefined);
      const ac = workletContext(addModule);

      await expect(registerLevelMeterWorklet(ac)).rejects.toThrow();
      await registerLevelMeterWorklet(ac);
      await registerLevelMeterWorklet(ac);

      expect(addModule).toHaveBeenCalledTimes(2);
    });

    it("says so where AudioWorklet does not exist", () => {
      expect(() => registerLevelMeterWorklet({} as AudioContext)).toThrow(
        /AudioWorklet/,
      );
    });
  });

  describe("ballistics", () => {
    it("passes the options through to the processor", async () => {
      const { node } = await passMeter({
        releaseDbPerSecond: 20,
        holdMs: 500,
        clipHoldMs: 250,
        clipThreshold: 0.9,
        rmsMs: 300,
      });

      expect(processorOptions(node)).toMatchObject({
        releaseDbPerSecond: 20,
        holdMs: 500,
        clipHoldMs: 250,
        clipThreshold: 0.9,
        rmsMs: 300,
      });
    });

    it("leaves them undefined when not given, so the processor's defaults win", async () => {
      const options = processorOptions((await passMeter()).node)!;
      expect(options.releaseDbPerSecond).toBeUndefined();
      expect(options.holdMs).toBeUndefined();
      expect(options.clipHoldMs).toBeUndefined();
      expect(options.clipThreshold).toBeUndefined();
      expect(options.rmsMs).toBeUndefined();
    });
  });
});
