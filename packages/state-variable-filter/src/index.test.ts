import { registerStateVariableFilterWorklet } from "./index";

describe("Noise", () => {
  it("registers only once", () => {
    const context = new AudioContextMock();
    // @ts-ignore
    global.AudioNode = class AudioNode {};

    registerStateVariableFilterWorklet(context.asAudioContext());
    expect(context.audioWorklet?.addModule).toHaveBeenCalledTimes(1);
    registerStateVariableFilterWorklet(context.asAudioContext());
    expect(context.audioWorklet?.addModule).toHaveBeenCalledTimes(1);
  });
});

class AudioContextMock {
  audioWorklet?: { addModule: jest.Mock<any, any, any> };

  constructor(worklets = true) {
    if (worklets) {
      this.audioWorklet = {
        addModule: jest.fn(),
      };
    }
  }

  asAudioContext(): AudioContext {
    return this as unknown as AudioContext;
  }
}

class AudioWorkletNodeMock {
  params: Record<string, ParamMock>;
  parameters: { get(name: string): void };
  disconnect = jest.fn();

  constructor(
    public context: any,
    public processorName: any,
    public options: any
  ) {
    this.params = {
      frequency: new ParamMock(),
      resonance: new ParamMock(),
      filterType: new ParamMock(),
    };

    const get = (name: string): ParamMock => {
      return this.params[name];
    };

    this.parameters = {
      get,
    };
  }
}

class ParamMock {
  value = 0;
  values: { value: number; time: number }[] = [];

  setValueAtTime(value: number, time: number) {
    this.values.push({ value, time });
    if (time === 0) this.value = value;
  }
}
