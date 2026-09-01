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
  readonly port = { postMessage: jest.fn() };
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

beforeAll(() => {
  (global as any).AudioNode = AudioNodeMock;
  (global as any).AudioWorkletNode = AudioWorkletNodeMock;
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
});
