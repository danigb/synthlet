describe("VAFProcessor", () => {
  let Worklet: any;
  const MOOG_LADDER = 0;
  const KORG35_LPF = 2;

  beforeAll(async () => {
    createWorkletTestContext(8000);
    Worklet = (await import("./worklet")).VAF;
  });

  const params = {
    type: [MOOG_LADDER],
    frequency: [1000],
    detune: [0],
    resonance: [0.5],
  };
  const impulse = () => {
    const signal = new Float32Array(16);
    signal[0] = 1;
    return signal;
  };

  it("registers processor", () => {
    expect(global.registerProcessor).toHaveBeenCalledWith(
      "VAFProcessor",
      Worklet,
    );
  });

  it("processes every channel, not just the first", () => {
    const [left, right] = runProcessChannels(
      new Worklet(),
      [impulse(), impulse()],
      params,
    );
    // The right channel used to come out silent.
    expect(Array.from(left).some((value) => value !== 0)).toBe(true);
    expect(Array.from(right)).toEqual(Array.from(left));
  });

  it("filters the left channel exactly as it would filter it alone", () => {
    const [mono] = runProcessChannels(new Worklet(), [impulse()], params);
    const [left] = runProcessChannels(
      new Worklet(),
      [impulse(), impulse()],
      params,
    );
    expect(Array.from(left)).toEqual(Array.from(mono));
  });

  it("gives each channel its own state, so a hard pan stays panned", () => {
    const node = new Worklet();
    // A ladder filter is all state: with one shared instance the left
    // channel's ringing would come back out of the right one.
    const first = runProcessChannels(
      node,
      [impulse(), new Float32Array(16)],
      params,
    );
    expect(Array.from(first[0]).some((value) => value !== 0)).toBe(true);
    expect(first[1]).toEqual(new Float32Array(16));

    const second = runProcessChannels(
      node,
      [new Float32Array(16), new Float32Array(16)],
      params,
    );
    expect(Array.from(second[0]).some((value) => value !== 0)).toBe(true);
    expect(second[1]).toEqual(new Float32Array(16));
  });

  it("keeps each type's state when `type` changes", () => {
    // Every channel holds one instance of every filter, so switching back to
    // a type picks up where that filter left off rather than from silence.
    const korg = { ...params, type: [KORG35_LPF] };
    const node = new Worklet();
    const [viaMoog] = runProcessChannels(node, [impulse()], params);
    runProcessChannels(node, [impulse()], korg);
    const [backToMoog] = runProcessChannels(
      node,
      [new Float32Array(16)],
      params,
    );

    expect(Array.from(viaMoog).some((value) => value !== 0)).toBe(true);
    // Still ringing from the first block, undisturbed by the Korg detour.
    expect(Array.from(backToMoog).some((value) => value !== 0)).toBe(true);
  });

  it("is a no-op for an input with no channels", () => {
    const outputs = [[new Float32Array(16)]];
    expect(() => new Worklet().process([[]], outputs, params)).not.toThrow();
    expect(outputs[0][0]).toEqual(new Float32Array(16));
  });
});

function createWorkletTestContext(sampleRate = 10) {
  // @ts-ignore
  global.sampleRate = sampleRate;
  // @ts-ignore
  global.AudioWorkletProcessor = class AudioWorkletNodeStub {
    port: {
      postMessage: jest.Mock<any, any, any>;
      onmessage: jest.Mock<any, any, any>;
    };

    constructor() {
      this.port = {
        postMessage: jest.fn(),
        onmessage: jest.fn(),
      };
    }
  };
  // @ts-ignore
  global.registerProcessor = jest.fn();
}

type Worklet = {
  process: (
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: any,
  ) => boolean;
};

// Runs one block with a multi-channel input and an output of the same shape,
// the way Web Audio allocates it when no outputChannelCount is declared.
function runProcessChannels(
  worklet: Worklet,
  input: Float32Array[],
  params: any = {},
) {
  const outputs = [input.map((channel) => new Float32Array(channel.length))];
  worklet.process([input], outputs, params);
  return outputs[0];
}

// This file declares helpers at the top level: make it a module so they don't
// collide with the identically named helpers in sibling packages.
export {};
