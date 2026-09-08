import { LookaheadLimiter } from "./index";

// A minimal node-level mock: enough for createWorkletConstructor to build the
// node and for connectParams to set its parameters. Kept local so the package
// stays dependency-free.
class ParamMock {
  value = 0;
}

class AudioNodeMock {
  connect = jest.fn();
  disconnect = jest.fn();
}

class AudioWorkletNodeMock extends AudioNodeMock {
  readonly port: {
    postMessage: jest.Mock;
    onmessage?: (event: MessageEvent) => void;
  } = { postMessage: jest.fn() };
  readonly parameters: { get(name: string): ParamMock };

  constructor(
    public context: any,
    public processorName: string,
    public options: any,
  ) {
    super();
    const params = new Map<string, ParamMock>();
    this.parameters = {
      get(name) {
        let param = params.get(name);
        if (!param) {
          param = new ParamMock();
          params.set(name, param);
        }
        return param;
      },
    };
  }
}

// Unlike the `ad` mock this one carries a sampleRate: `latencySamples` is
// computed on the main thread from `context.sampleRate`.
const context = { sampleRate: 48000 } as AudioContext;
const created = (node: unknown) => node as unknown as AudioWorkletNodeMock;

// `subscribe` coalesces to one call per animation frame, on this package as on
// `level-meter`, so the frame has to be under the test's control.
const pendingFrames = new Map<number, (now: number) => void>();
let nextFrameHandle = 1;

function runFrame() {
  const due = Array.from(pendingFrames.values());
  pendingFrames.clear();
  for (const callback of due) callback(0);
}

beforeAll(() => {
  (global as any).AudioNode = AudioNodeMock;
  (global as any).AudioWorkletNode = AudioWorkletNodeMock;
  (globalThis as any).requestAnimationFrame = (cb: (now: number) => void) => {
    const handle = nextFrameHandle++;
    pendingFrames.set(handle, cb);
    return handle;
  };
  (globalThis as any).cancelAnimationFrame = (handle: number) =>
    pendingFrames.delete(handle);
});

describe("LookaheadLimiter", () => {
  it("is a one-input effect that follows its input's channel count", () => {
    const limiter = created(LookaheadLimiter(context));

    expect(limiter.processorName).toBe("LookaheadLimiterProcessor");
    expect(limiter.options.numberOfInputs).toBe(1);
    expect(limiter.options.numberOfOutputs).toBe(1);
    // Forcing stereo here is what the rewrite removed.
    expect(limiter.options.outputChannelCount).toBeUndefined();
  });

  it("passes the default lookahead through as a processor option", () => {
    const limiter = created(LookaheadLimiter(context));
    expect(limiter.options.processorOptions).toEqual({ lookahead: 2 });
  });

  it("reports the lookahead window plus the detector's group delay", () => {
    const limiter = LookaheadLimiter(context, { lookahead: 5 });

    expect(created(limiter).options.processorOptions).toEqual({ lookahead: 5 });
    expect(limiter.latencySamples).toBe((5 * 48000) / 1000 + 6);
    expect(limiter.latencyTime).toBeCloseTo(246 / 48000);
  });

  it("clamps an out-of-range lookahead the way the processor does", () => {
    // The option is not an AudioParam, so nothing else range-checks it.
    expect(LookaheadLimiter(context, { lookahead: 50 }).latencySamples).toBe(
      240 + 6,
    );
  });

  it("sets its parameters from its inputs", () => {
    const limiter = LookaheadLimiter(context, { threshold: -3, gain: 6 });

    expect(limiter.threshold.value).toBe(-3);
    expect(limiter.gain.value).toBe(6);
    expect(limiter.release.value).toBe(0);
  });

  it("keeps the dispose cascade the factory attached", () => {
    const limiter = LookaheadLimiter(context);
    limiter.dispose();

    expect(created(limiter).disconnect).toHaveBeenCalled();
    expect(created(limiter).port.postMessage).toHaveBeenCalledWith({
      type: "DISPOSE",
    });
  });

  it("carries its parameter list", () => {
    expect(LookaheadLimiter.descriptors.map((d) => d.name)).toEqual([
      "threshold",
      "release",
      "gain",
    ]);
  });

  // Ticket 17: the readout the limiter's own plan deferred "pending the
  // SharedArrayBuffer decision", over the transport `level-meter` now shares.
  describe("the gain reduction meter", () => {
    /** One posted frame, the way the processor would send it. */
    const frame = (gainReductionDb: number) => {
      const view = new Float32Array(4);
      view[0] = 1; // layout version
      view[1] = 1; // one slot
      view[3] = gainReductionDb;
      return view;
    };

    const deliver = (limiter: any, view: Float32Array) =>
      created(limiter).port.onmessage!({ data: view } as MessageEvent);

    it("is off by default, and says so rather than reporting 0 dB", () => {
      const limiter = LookaheadLimiter(context);

      expect(created(limiter).options.processorOptions.meter).toBeUndefined();
      expect(limiter.getLevels().gainReduction).toBeNaN();
    });

    it("asks the processor for it when it is on", () => {
      const limiter = LookaheadLimiter(context, { meter: true });
      expect(created(limiter).options.processorOptions.meter).toBe(true);
      expect(limiter.getLevels().gainReduction).toBe(0);
    });

    it("reads the slot the processor writes", () => {
      const limiter = LookaheadLimiter(context, { meter: true });
      deliver(limiter, frame(-6.5));
      expect(limiter.getLevels().gainReduction).toBeCloseTo(-6.5, 6);
    });

    it("hands back the same object every call", () => {
      const limiter = LookaheadLimiter(context, { meter: true });
      expect(limiter.getLevels()).toBe(limiter.getLevels());
    });

    it("moves version only when the reading moves", () => {
      const limiter = LookaheadLimiter(context, { meter: true });
      deliver(limiter, frame(-3));
      const first = limiter.getLevels().version;
      expect(first).toBeGreaterThan(0);

      deliver(limiter, frame(-3));
      expect(limiter.getLevels().version).toBe(first);

      deliver(limiter, frame(-9));
      expect(limiter.getLevels().version).toBeGreaterThan(first);
    });

    // Success criterion 5: the same shape `level-meter`'s README hook consumes.
    it("notifies subscribers, at most once per animation frame", () => {
      const limiter = LookaheadLimiter(context, { meter: true });
      const listener = jest.fn();
      const off = limiter.subscribe(listener);

      deliver(limiter, frame(-2));
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener.mock.calls[0][0].gainReduction).toBeCloseTo(-2, 6);

      deliver(limiter, frame(-4));
      expect(listener).toHaveBeenCalledTimes(1);
      runFrame();
      expect(listener).toHaveBeenCalledTimes(2);

      off();
      deliver(limiter, frame(-8));
      runFrame();
      expect(listener).toHaveBeenCalledTimes(2);
    });

    it("subscribing with the meter off is a no-op, not a throw", () => {
      const limiter = LookaheadLimiter(context);
      const listener = jest.fn();
      const off = limiter.subscribe(listener);

      runFrame();
      expect(listener).not.toHaveBeenCalled();
      expect(() => off()).not.toThrow();
    });

    it("never listens on the port with the meter off", () => {
      const limiter = LookaheadLimiter(context);
      expect(created(limiter).port.onmessage).toBeUndefined();
    });

    it("says which transport is carrying it", () => {
      expect(LookaheadLimiter(context, { meter: true }).transport).toBe(
        "message",
      );
    });
  });
});
