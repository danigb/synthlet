// `trigger` is a-rate as of automation-rate ticket 03: the note changes at the
// trigger's own sample rather than at the top of the next render quantum, and
// two triggers inside one quantum advance the arpeggiator twice. At k-rate the
// second one was invisible.
//
// Since ticket 03 of the arp folder the traversal is deterministic, so these
// assert *what* the output changes to as well as where. The 40-try loop that
// used to be in "advances twice for two triggers in one block" is gone with
// it: it existed only because two random notes can repeat.

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
    // The first trigger sounds the root: MIDI 60, middle C.
    expect(out[0]).toBeCloseTo(261.63, 2);
  });

  describe("a-rate", () => {
    const EDGE = 40;

    it("changes the note at the trigger's sample", () => {
      // The first block fires a step and the second closes the gate, so the
      // arpeggiator is sitting on a note with somewhere to go; the third
      // re-fires mid-block. Two blocks and not one, because the engine emits
      // the note it is sitting on and *then* advances - the very first
      // trigger sounds the note the module was already holding, which is the
      // root, and this test is about *where* the output changes.
      const worklet = new Worklet();
      run(worklet, filled(1));
      run(worklet, filled(0));
      const out = run(worklet, edgeAt(EDGE));

      const before = out[EDGE - 1];
      expect(out.slice(0, EDGE).every((v) => v === before)).toBe(true);
      expect(out[EDGE]).not.toBe(before);
      expect(out.slice(EDGE).every((v) => v === out[EDGE])).toBe(true);
    });

    it("advances twice for two triggers in one block", () => {
      // Three notes in one block, which one trigger per block cannot produce:
      // the note held from construction, then the first two steps of a
      // chromatic run up from middle C.
      const gate = new Float32Array(128);
      gate.fill(1, 20, 30);
      gate.fill(1, 80, 90);
      const out = run(new Worklet(), gate);

      const midi = (hz: number) => Math.round(69 + 12 * Math.log2(hz / 440));
      expect([out[0], out[20], out[80]].map(midi)).toEqual([60, 60, 61]);
      expect(new Set(out).size).toBe(2);
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
      mode: [0], // ArpMode.Up
      octaveMode: [0], // ArpOctaveMode.Serial
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
