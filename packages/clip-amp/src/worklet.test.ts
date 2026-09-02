describe("ClipAmpProcessor", () => {
  let Worklet: any;
  const TANH = 1;

  beforeAll(async () => {
    createWorkletTestContext();
    Worklet = (await import("./worklet")).ClipAmpProcessor;
  });

  it("registers processor", () => {
    expect(global.registerProcessor).toHaveBeenCalledWith(
      "ClipAmpProcessor",
      Worklet,
    );
  });

  it("applies the clip with pre and post gain", () => {
    const [output] = runProcessChannels(
      new Worklet(),
      [new Float32Array(8).fill(1)],
      { type: [TANH], preGain: [2], postGain: [3] },
    );
    expect(Array.from(output)).toEqual(
      Array.from(new Float32Array(8).fill(Math.tanh(2) * 3)),
    );
  });

  it("processes every channel, not just the first", () => {
    const [left, right] = runProcessChannels(
      new Worklet(),
      [new Float32Array(8).fill(1), new Float32Array(8).fill(0.5)],
      { type: [TANH], preGain: [2], postGain: [1] },
    );
    // The right channel used to come out silent.
    expect(Array.from(left)).toEqual(
      Array.from(new Float32Array(8).fill(Math.tanh(2))),
    );
    expect(Array.from(right)).toEqual(
      Array.from(new Float32Array(8).fill(Math.tanh(1))),
    );
  });

  it("leaves an output channel the input doesn't have alone", () => {
    const outputs = [[new Float32Array(8), new Float32Array(8)]];
    new Worklet().process([[new Float32Array(8).fill(1)]], outputs, {
      type: [TANH],
      preGain: [1],
      postGain: [1],
    });
    expect(outputs[0][1]).toEqual(new Float32Array(8));
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
