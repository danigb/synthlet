import { AdAmp, AdEnv } from "./index";

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
const created = (node: unknown) => node as unknown as AudioWorkletNodeMock;

beforeAll(() => {
  (global as any).AudioNode = AudioNodeMock;
  (global as any).AudioWorkletNode = AudioWorkletNodeMock;
});

describe("AdAmp", () => {
  it("is a one-input modulator on the AD processor", () => {
    const amp = created(AdAmp(context));
    expect(amp.processorName).toBe("AdProcessor");
    expect(amp.options.numberOfInputs).toBe(1);
    expect(amp.options.processorOptions).toEqual({ mode: "modulator" });
  });

  it("sets the envelope parameters from its inputs", () => {
    const amp = AdAmp(context, { attack: 0.01, decay: 0.3 });
    expect(amp.attack.value).toBe(0.01);
    expect(amp.decay.value).toBe(0.3);
    expect(amp.trigger.value).toBe(0);
  });
});

describe("AdEnv", () => {
  it("is a no-input generator on the same processor", () => {
    const env = created(AdEnv(context));
    expect(env.processorName).toBe("AdProcessor");
    expect(env.options.numberOfInputs).toBe(0);
    expect(env.options.processorOptions).toEqual({ mode: "generator" });
  });
});
