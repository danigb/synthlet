import { Param, ParamScaleType } from "./index";

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

const context = {} as AudioContext;

beforeAll(() => {
  (global as any).AudioNode = AudioNodeMock;
  (global as any).AudioWorkletNode = AudioWorkletNodeMock;
});

describe("Param.lin", () => {
  it("scales a 0…1 input to min…max", () => {
    const param = Param.lin(context, 0.5, 20, 100);
    expect(param.scale.value).toBe(ParamScaleType.Linear);
    expect(param.input.value).toBe(0.5);
    expect(param.min.value).toBe(20);
    expect(param.max.value).toBe(100);
  });

  it("accepts a node as the input", () => {
    const source = new AudioNodeMock();
    const param = Param.lin(context, source as unknown as AudioNode, 20, 100);
    expect(param.input.value).toBe(0);
    expect(source.connect).toHaveBeenCalledWith(param.input);
    expect(param.min.value).toBe(20);
    expect(param.max.value).toBe(100);
  });
});

describe("Param.db", () => {
  it("converts decibels to gain", () => {
    const param = Param.db(context, -6);
    expect(param.scale.value).toBe(ParamScaleType.DbToGain);
    expect(param.input.value).toBe(-6);
  });
});

describe("the factory variants", () => {
  // "`Param.db`, `Param.lin` and the other variants need no change - they set
  // `scale`, not the signal path." Confirmed with a test rather than by
  // reading, because that is what ticket 02's checklist asked for.
  const source = () => new AudioNodeMock() as unknown as AudioNode;

  it.each([
    ["input", () => Param.input(context, source())],
    ["db", () => Param.db(context, source())],
    ["lin", () => Param.lin(context, source(), 20, 100)],
    ["mul", () => Param.mul(context, source(), 2)],
    ["inv", () => Param.inv(context, source())],
  ])("%s routes its argument to the signal path", (_name, build) => {
    const param = build();
    // `connectParams` zeroes a parameter before connecting a node to it, so a
    // zero here plus a `connect` call is the node having been wired in.
    expect(param.input.value).toBe(0);
  });

  it("leaves the rate to the descriptors", () => {
    // No variant touches `automationRate`; `input` and `mod` are a-rate
    // because `params.ts` says so, and that is the only place it is decided.
    const aRate = Param.descriptors
      .filter((d) => d.automationRate === "a-rate")
      .map((d) => d.name);
    expect(aRate).toEqual(["input", "mod"]);
  });
});
