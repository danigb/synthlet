import {
  createPolyblepOscillatorNode,
  registerPolyblepOscillatorWorkletOnce,
} from "./index";

describe("PolyblepOscillator", () => {
  it("registers only once", () => {
    const context = new AudioContextMock();

    registerPolyblepOscillatorWorkletOnce(context.asAudioContext());
    expect(context.audioWorklet?.addModule).toHaveBeenCalledTimes(1);
    registerPolyblepOscillatorWorkletOnce(context.asAudioContext());
    expect(context.audioWorklet?.addModule).toHaveBeenCalledTimes(1);
  });

  it("creates the worklet node with default parameters", () => {
    // @ts-ignore
    global.AudioWorkletNode = AudioWorkletNodeMock;
    const node = createPolyblepOscillatorNode(
      new AudioContextMock().asAudioContext()
    );
    expect(node.frequency.value).toBe(440);
    expect(node.waveform.value).toBe(1);
    expect(node.type).toEqual("sawtooth");
  });

  it("changes the waveform using type property", () => {
    // @ts-ignore
    global.AudioWorkletNode = AudioWorkletNodeMock;
    const node = createPolyblepOscillatorNode(
      new AudioContextMock().asAudioContext()
    );
    expect(node.waveform.value).toBe(1);
    node.type = "triangle";
    expect(node.waveform.value).toBe(3);
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
      waveform: new ParamMock(),
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
