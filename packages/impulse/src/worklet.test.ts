// The first tests this package has had. What they pin is the detection rule:
// a trigger is the transition from non-positive to positive.
describe("ImpulseProcessor", () => {
  let Worklet: any;

  beforeAll(async () => {
    createWorkletTestContext();
    Worklet = (await import("./worklet")).ImpulseProcessor;
  });

  it("registers processor", () => {
    expect(global.registerProcessor).toHaveBeenCalledWith(
      "ImpulseProcessor",
      Worklet,
    );
  });

  it("has parameter descriptors", () => {
    expect(Worklet.parameterDescriptors).toMatchSnapshot();
  });

  it.each([1, 0.99, 0.5, 0.05])("fires on a trigger of %p", (trigger) => {
    expect(run(new Worklet(), [trigger])).toEqual([1]);
  });

  it.each([0, -1])("does not fire on a trigger of %p", (trigger) => {
    expect(run(new Worklet(), [trigger])).toEqual([0]);
  });

  it("fires once while the trigger is held, again after it returns to 0", () => {
    expect(run(new Worklet(), [1, 1, 1, 0, 0, 1, 1])).toEqual([
      1, 0, 0, 0, 0, 1, 0,
    ]);
  });

  it("writes the impulse at sample 0, where k-rate params are read", () => {
    const outputs = [[new Float32Array(8)]];
    new Worklet().process([], outputs, { trigger: [1] });
    expect(Array.from(outputs[0][0])).toEqual([1, 0, 0, 0, 0, 0, 0, 0]);
  });
});

// Returns the first sample of each block: the impulse, when there is one.
function run(worklet: any, triggers: number[]) {
  return triggers.map((trigger) => {
    const outputs = [[new Float32Array(8)]];
    worklet.process([], outputs, { trigger: [trigger] });
    return outputs[0][0][0];
  });
}

function createWorkletTestContext(sampleRate = 44100, ctx: any = global) {
  ctx.sampleRate = sampleRate;
  ctx.registerProcessor = jest.fn();
  ctx.AudioWorkletProcessor = class AudioWorkletNodeStub {
    port: { postMessage: jest.Mock; onmessage: jest.Mock };
    constructor() {
      this.port = { postMessage: jest.fn(), onmessage: jest.fn() };
    }
  };
}

// This file declares helpers at the top level: make it a module so they don't
// collide with the identically named helpers in sibling packages.
export {};
