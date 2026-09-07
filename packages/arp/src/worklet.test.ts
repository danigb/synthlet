// `trigger` is a-rate as of automation-rate ticket 03: the note changes at the
// trigger's own sample rather than at the top of the next render quantum, and
// two triggers inside one quantum advance the arpeggiator twice. At k-rate the
// second one was invisible.
//
// The arpeggiator picks a random note, so what these assert is *where* the
// output changes, not what it changes to.

describe("ArpProcessor", () => {
  let Worklet: any;
  const CHROMATIC = 4095;

  beforeAll(async () => {
    createWorkletTestContext();
    Worklet = (await import("./worklet")).ArpProcessor;
  });

  it("registers processor", () => {
    expect(global.registerProcessor).toHaveBeenCalledWith(
      "ArpProcessor",
      Worklet,
    );
  });

  it("has parameter descriptors", () => {
    expect(Worklet.parameterDescriptors).toMatchSnapshot();
  });

  it("fills the block with one note when nothing is automated", () => {
    const out = run(new Worklet(), [1]);
    expect(new Set(out).size).toBe(1);
    expect(out[0]).toBeGreaterThan(0);
  });

  describe("a-rate", () => {
    const EDGE = 40;

    it("changes the note at the trigger's sample", () => {
      // The first block opens the gate at sample 0 so the arpeggiator has a
      // note; the second one closes it and re-fires mid-block.
      const worklet = new Worklet();
      run(worklet, filled(0));
      const out = run(worklet, edgeAt(EDGE));

      const before = out[EDGE - 1];
      expect(out.slice(0, EDGE).every((v) => v === before)).toBe(true);
      expect(out[EDGE]).not.toBe(before);
      expect(out.slice(EDGE).every((v) => v === out[EDGE])).toBe(true);
    });

    it("advances twice for two triggers in one block", () => {
      // Over 40 tries, because two random notes can repeat. What is asserted
      // is that *some* run produces three distinct values in one block, which
      // one trigger per block cannot do.
      let sawTwo = false;
      for (let attempt = 0; attempt < 40 && !sawTwo; attempt++) {
        const gate = new Float32Array(128);
        gate.fill(1, 20, 30);
        gate.fill(1, 80, 90);
        const out = run(new Worklet(), gate);
        if (new Set(out).size === 3) sawTwo = true;
      }
      expect(sawTwo).toBe(true);
    });

    it("does not advance while the trigger is held across a block", () => {
      const worklet = new Worklet();
      const first = run(worklet, filled(1));
      const second = run(worklet, filled(1));
      expect(new Set([...first, ...second]).size).toBe(1);
    });
  });

  it("stops when disposed", () => {
    const worklet = new Worklet();
    const outputs = [[new Float32Array(128)]];
    expect(worklet.process([], outputs, params([1]))).toBe(true);
    worklet.port.onmessage({ data: { type: "DISPOSE" } });
    expect(worklet.process([], outputs, params([1]))).toBe(false);
  });

  function params(trigger: ArrayLike<number>) {
    return {
      trigger,
      baseNote: [60],
      scale: [CHROMATIC],
      octaves: [4],
    };
  }

  function run(worklet: any, trigger: ArrayLike<number>) {
    const outputs = [[new Float32Array(128)]];
    worklet.process([], outputs, params(trigger));
    return Array.from(outputs[0][0]);
  }
});

const filled = (value: number) => new Float32Array(128).fill(value);

/** 0 up to `index`, 1 from it: one rising edge, mid-block. */
function edgeAt(index: number) {
  const gate = new Float32Array(128);
  gate.fill(1, index);
  return gate;
}

function createWorkletTestContext(sampleRate = 44100, ctx: any = global) {
  ctx.sampleRate = sampleRate;
  ctx.registerProcessor = jest.fn();
  ctx.AudioWorkletProcessor = class AudioWorkletNodeStub {
    port: { postMessage: jest.Mock; onmessage: (e: any) => void };
    constructor() {
      this.port = { postMessage: jest.fn(), onmessage: () => {} };
    }
  };
}

// This file declares helpers at the top level: make it a module so they don't
// collide with the identically named helpers in sibling packages.
export {};
