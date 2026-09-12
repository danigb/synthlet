import { euclidPattern } from "./dsp";
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
 * secondary outputs either exist or do not.
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
  it("is a five-output source, one channel each", () => {
    const rhythm = created(Euclid(context));

    expect(rhythm.processorName).toBe("EuclidProcessor");
    expect(rhythm.options.numberOfInputs).toBe(0);
    expect(rhythm.options.numberOfOutputs).toBe(5);
    // Declared rather than negotiated: every output is a one-channel gate, and
    // a gate that got down-mixed would arrive at a trigger as an average.
    expect(rhythm.options.outputChannelCount).toEqual([1, 1, 1, 1, 1]);
  });

  it("publishes the secondary outputs at the indices the engine writes", () => {
    const rhythm = Euclid(context);

    // The indices are asserted explicitly because an off-by-one here is silent
    // in every other test in the package: the engine writes all five outputs
    // correctly and only the wiring would be wrong, so nothing that drives
    // `generate` directly could catch it.
    //
    // Output 1 is `.rests`, permanently - ticket 05 - and 2, 3, 4 are the fan.
    // Nothing renumbers.
    const outputs = [
      ["rests", 1],
      ["b", 2],
      ["c", 3],
      ["d", 4],
    ] as const;
    for (const [name, index] of outputs) {
      expect(rhythm[name]).toBeInstanceOf(GainNodeMock);
      expect(created(rhythm).connect).toHaveBeenCalledWith(rhythm[name], index);
    }
    // Channel a has no property: it is the node itself, the way `Clock`'s
    // phase output is. An `.a` would be a circular self-reference on the
    // object `Compound` is assembling.
    expect((rhythm as unknown as Record<string, unknown>).a).toBeUndefined();
  });

  it("sets its parameters from its inputs, through the Compound wrap", () => {
    const rhythm = Euclid(context, {
      steps: 16,
      beats: 5,
      pulseWidth: 0.25,
      spread: 4,
    });

    expect(rhythm.steps.value).toBe(16);
    expect(rhythm.beats.value).toBe(5);
    expect(rhythm.pulseWidth.value).toBe(0.25);
    expect(rhythm.rotation.value).toBe(0);
    expect(rhythm.spread.value).toBe(4);
  });

  it("still carries its descriptors after the Compound wrap", () => {
    // The `Object.assign` rewrap is where `X.descriptors` would silently
    // vanish: the factory is no longer `createWorkletConstructor`'s own return
    // value, which is what carried them.
    expect(Euclid.descriptors).toBe(PARAMS);
  });

  it("still carries `pattern` after the Compound wrap", () => {
    // Same hazard as `descriptors` above, and the same guard: `Euclid.pattern`
    // is a property of the factory, so a rewrap that forgot it would leave the
    // node working and the export gone.
    expect(Euclid.pattern).toBe(euclidPattern);
  });

  it("disposes all four gains with the node", () => {
    const rhythm = Euclid(context);
    rhythm.dispose();

    expect(created(rhythm).disconnect).toHaveBeenCalled();
    expect(created(rhythm).port.postMessage).toHaveBeenCalledWith({
      type: "DISPOSE",
    });
    for (const gain of [rhythm.rests, rhythm.b, rhythm.c, rhythm.d])
      expect(gain.disconnect).toHaveBeenCalled();

    // Idempotent - `Compound` composes with the cascade the factory already
    // installed rather than replacing it, and neither runs twice. Asserted on
    // every gain: `owns` is a list, and a gain left out of it would leak.
    rhythm.dispose();
    for (const gain of [rhythm.rests, rhythm.b, rhythm.c, rhythm.d])
      expect(gain.disconnect).toHaveBeenCalledTimes(1);
  });
});
