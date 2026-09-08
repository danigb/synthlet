import { Euclid } from "./index";
import { PARAMS } from "./params";

/**
 * The node surface, driven with a minimal local mock - enough for
 * `createWorkletConstructor` to build the node, for `connectParams` to set its
 * parameters, and for `Compound` to hang a gain off output 1. Kept local so the
 * package stays dependency-free, the way
 * `packages/lookahead-limiter/src/index.test.ts` does.
 *
 * The package's other tests drive the engine and the processor; this is the
 * first that looks at what `Euclid()` actually hands back, which is where the
 * second output either exists or does not.
 */

class ParamMock {
  value = 0;
}

class AudioNodeMock {
  connect = jest.fn();
  disconnect = jest.fn();
}

class GainNodeMock extends AudioNodeMock {
  constructor(public context: any) {
    super();
  }
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

const context = { sampleRate: 48000 } as AudioContext;
const created = (node: unknown) => node as unknown as AudioWorkletNodeMock;

beforeAll(() => {
  (global as any).AudioNode = AudioNodeMock;
  (global as any).AudioWorkletNode = AudioWorkletNodeMock;
  (global as any).GainNode = GainNodeMock;
});

describe("Euclid", () => {
  it("is a two-output source, one channel each", () => {
    const rhythm = created(Euclid(context));

    expect(rhythm.processorName).toBe("EuclidProcessor");
    expect(rhythm.options.numberOfInputs).toBe(0);
    expect(rhythm.options.numberOfOutputs).toBe(2);
    // Declared rather than negotiated: both outputs are one-channel gates, and
    // a gate that got down-mixed would arrive at a trigger as an average.
    expect(rhythm.options.outputChannelCount).toEqual([1, 1]);
  });

  it("publishes the second output as `.rests`", () => {
    const rhythm = Euclid(context);

    expect(rhythm.rests).toBeInstanceOf(GainNodeMock);
    // Output 1, permanently. Euclid ticket 06 appends 2, 3 and 4; nothing
    // renumbers.
    expect(created(rhythm).connect).toHaveBeenCalledWith(rhythm.rests, 1);
  });

  it("sets its parameters from its inputs, through the Compound wrap", () => {
    const rhythm = Euclid(context, { steps: 16, beats: 5, pulseWidth: 0.25 });

    expect(rhythm.steps.value).toBe(16);
    expect(rhythm.beats.value).toBe(5);
    expect(rhythm.pulseWidth.value).toBe(0.25);
    expect(rhythm.rotation.value).toBe(0);
  });

  it("still carries its descriptors after the Compound wrap", () => {
    // The `Object.assign` rewrap is where `X.descriptors` would silently
    // vanish: the factory is no longer `createWorkletConstructor`'s own return
    // value, which is what carried them.
    expect(Euclid.descriptors).toBe(PARAMS);
  });

  it("disposes the rests gain with the node", () => {
    const rhythm = Euclid(context);
    rhythm.dispose();

    expect(created(rhythm).disconnect).toHaveBeenCalled();
    expect(rhythm.rests.disconnect).toHaveBeenCalled();
    expect(created(rhythm).port.postMessage).toHaveBeenCalledWith({
      type: "DISPOSE",
    });

    // Idempotent - `Compound` composes with the cascade the factory already
    // installed rather than replacing it, and neither runs twice.
    rhythm.dispose();
    expect(rhythm.rests.disconnect).toHaveBeenCalledTimes(1);
  });
});
