import { AdsrAmp, AdsrEnv } from "./index";

// A minimal node-level mock: enough for createWorkletConstructor to build the
// node. Kept local so the package stays dependency-free.
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

describe("AdsrAmp", () => {
  it("is a one-input modulator on the ADSR processor", () => {
    const amp = created(AdsrAmp(context));
    expect(amp.processorName).toBe("AdsrProcessor");
    expect(amp.options.numberOfInputs).toBe(1);
    expect(amp.options.processorOptions).toEqual({ mode: "modulator" });
  });

  it("does not constrain its channel count", () => {
    // `channelCount: 1, channelCountMode: "explicit"` would make Web Audio
    // downmix for us, which collapses a stereo source (a Chorus, say) to mono
    // before the amplifier ever sees it. The processor handles the channels
    // itself instead, so a stereo input reaches the destination in stereo.
    const { options } = created(AdsrAmp(context));
    expect(options.channelCount).toBeUndefined();
    expect(options.channelCountMode).toBeUndefined();
    expect(options.outputChannelCount).toBeUndefined();
  });
});

describe("AdsrEnv", () => {
  it("is a no-input generator on the same processor", () => {
    const env = created(AdsrEnv(context));
    expect(env.processorName).toBe("AdsrProcessor");
    expect(env.options.numberOfInputs).toBe(0);
    expect(env.options.processorOptions).toEqual({ mode: "generator" });
  });
});
