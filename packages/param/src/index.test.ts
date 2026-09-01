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
