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

  // `trigger` is a-rate as of automation-rate ticket 03, so the detector reads
  // every sample it was given rather than only the first. The impulse still
  // goes at index 0 - deliberately, and deferred - so what these assert is the
  // *detection*, which is where the events were being lost.
  describe("a-rate detection", () => {
    const block = (values: number[]) => Float32Array.from(values);

    it("sees a pulse narrower than the block, which used to vanish", () => {
      // Rises at 2 and falls at 5. Reading only sample 0 sees 0, then 0 in the
      // next block, and no edge ever existed: not a late trigger, a lost one.
      const outputs = [[new Float32Array(8)]];
      new Worklet().process([], outputs, {
        trigger: block([0, 0, 1, 1, 1, 0, 0, 0]),
      });
      expect(outputs[0][0][0]).toBe(1);
    });

    it("fires in the block the trigger arrives in, not the next one", () => {
      const worklet = new Worklet();
      const first = [[new Float32Array(8)]];
      worklet.process([], first, { trigger: block([0, 0, 0, 0, 0, 0, 0, 1]) });
      expect(first[0][0][0]).toBe(1);

      // And holding it across the boundary does not re-fire.
      const second = [[new Float32Array(8)]];
      worklet.process([], second, { trigger: block([1, 1, 1, 1, 1, 1, 1, 1]) });
      expect(second[0][0][0]).toBe(0);
    });

    it("does not fire on a block that never goes positive", () => {
      const outputs = [[new Float32Array(8)]];
      new Worklet().process([], outputs, { trigger: new Float32Array(8) });
      expect(Array.from(outputs[0][0])).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    });

    it("collapses two edges in one block into one impulse", () => {
      // Index 0 holds one sample. Documented rather than fixed: moving the
      // impulse off index 0 is deferred, and this is the same question.
      const outputs = [[new Float32Array(8)]];
      new Worklet().process([], outputs, {
        trigger: block([0, 1, 0, 0, 1, 0, 0, 0]),
      });
      expect(Array.from(outputs[0][0])).toEqual([1, 0, 0, 0, 0, 0, 0, 0]);
    });
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
