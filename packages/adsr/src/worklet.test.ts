// The processor reads `sampleRate` at construction: everything here runs at
// SAMPLE_RATE, so stage lengths in samples are `seconds * SAMPLE_RATE`.
const SAMPLE_RATE = 4410;

describe("AdsrWorkletNode", () => {
  let Worklet: any;

  beforeAll(async () => {
    createWorkletTestContext(SAMPLE_RATE);
    Worklet = (await import("./worklet")).AdsrProcessor;
  });

  const params = {
    gate: [1],
    attack: [0.01],
    decay: [0.1],
    sustain: [0.5],
    release: [0.4],
    offset: [0],
    gain: [1],
  };
  const generator = () => new Worklet();
  const modulator = () =>
    new Worklet({ processorOptions: { mode: "modulator" } });

  it("registers processor", () => {
    expect(global.registerProcessor).toHaveBeenCalledWith(
      "AdsrProcessor",
      Worklet,
    );
  });

  it("has parameter descriptors", () => {
    expect(Worklet.parameterDescriptors).toMatchSnapshot();
  });

  it("reaches 1.0 at `attack` seconds", () => {
    const ATTACK_SECONDS = 0.1;
    const attackSamples = ATTACK_SECONDS * SAMPLE_RATE;
    const output = runProcessMono(generator(), 2 * attackSamples, {
      ...params,
      attack: [ATTACK_SECONDS],
    });

    const peak = output.findIndex((value) => value >= 1);
    // The one-pole crosses its overshooting target on update `attackSamples`,
    // which is index `attackSamples - 1`; allow a sample of rounding.
    expect(Math.abs(peak - (attackSamples - 1))).toBeLessThanOrEqual(1);
  });

  it("snaps through zero-length stages without NaN", () => {
    const node = generator();
    const zero = { ...params, attack: [0], decay: [0], release: [0] };

    const held = runProcessMono(node, 10, zero);
    expect(Array.from(held).every(Number.isFinite)).toBe(true);
    expect(held[held.length - 1]).toBe(0.5);

    const released = runProcessMono(node, 10, { ...zero, gate: [0] });
    expect(Array.from(released).every(Number.isFinite)).toBe(true);
    expect(released[released.length - 1]).toBe(0);
  });

  it("continues from the current level when retriggered during release", () => {
    const slow = { ...params, attack: [0.1] };
    const node = generator();
    runProcessMono(node, SAMPLE_RATE * 0.3, slow); // attack, decay, sustain
    const releasing = runProcessMono(node, SAMPLE_RATE * 0.1, {
      ...slow,
      gate: [0],
    });
    const level = releasing[releasing.length - 1];
    expect(level).toBeGreaterThan(0);
    expect(level).toBeLessThan(slow.sustain[0]);

    const retriggered = runProcessMono(node, 10, slow);
    // Legato: the attack resumes from `level` instead of resetting to 0 - one
    // attack step above it, not a jump back to the start of the curve.
    const fromZero = runProcessMono(generator(), 10, slow)[0];
    expect(retriggered[0]).toBeGreaterThan(level);
    expect(retriggered[0] - level).toBeLessThan(0.01);
    expect(retriggered[0]).toBeGreaterThan(10 * fromZero);
  });

  describe("modulator mode", () => {
    it("multiplies a constant 1 input by the generator's envelope", () => {
      const expected = runProcessMono(generator(), 100, params);
      const output = runProcessWithInput(
        modulator(),
        new Float32Array(100).fill(1),
        params,
      );
      expect(Array.from(output)).toEqual(Array.from(expected));
    });

    it("is silent for a 0 input", () => {
      const output = runProcessWithInput(
        modulator(),
        new Float32Array(100),
        params,
      );
      expect(output).toEqual(new Float32Array(100));
    });

    it("applies gain and offset to the product, like the generator", () => {
      const loud = { ...params, offset: [100], gain: [50] };
      const expected = runProcessMono(generator(), 100, loud);
      const output = runProcessWithInput(
        modulator(),
        new Float32Array(100).fill(1),
        loud,
      );
      expect(Array.from(output)).toEqual(Array.from(expected));
    });

    it("treats an unconnected input as silence instead of throwing", () => {
      const node = modulator();
      const outputs = [[new Float32Array(10)]];
      expect(() => node.process([[]], outputs, params)).not.toThrow();
      expect(outputs[0][0]).toEqual(new Float32Array(10));
    });

    it("keeps advancing the envelope while the input is inactive", () => {
      const BLOCKS = 5;
      const BLOCK = 128;

      // A generator running continuously for BLOCKS + 1 blocks.
      const env = generator();
      let expected = new Float32Array(BLOCK);
      for (let i = 0; i <= BLOCKS; i++) {
        expected = runProcessMono(env, BLOCK, params);
      }

      // A modulator gated open with nothing connected for BLOCKS blocks, then
      // fed a constant 1. A stalled stage machine would still be in its attack.
      const amp = modulator();
      for (let i = 0; i < BLOCKS; i++) {
        amp.process([[]], [[new Float32Array(BLOCK)]], params);
      }
      const output = runProcessWithInput(
        amp,
        new Float32Array(BLOCK).fill(1),
        params,
      );

      expect(Array.from(output)).toEqual(Array.from(expected));
    });
  });
});

function createWorkletTestContext(sampleRate = 10, ctx: any = global) {
  ctx.sampleRate = sampleRate;
  ctx.registerProcessor = jest.fn();
  ctx.AudioWorkletProcessor = class AudioWorkletNodeStub {
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
}

type Worklet = {
  process: (
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: any,
  ) => boolean;
};

function runProcessMono(worklet: Worklet, size: number, params: any = {}) {
  const outputs = [[new Float32Array(size)]];
  worklet.process([[new Float32Array(size)]], outputs, params);
  return outputs[0][0];
}

function runProcessWithInput(
  worklet: Worklet,
  input: Float32Array,
  params: any = {},
) {
  const outputs = [[new Float32Array(input.length)]];
  worklet.process([[input]], outputs, params);
  return outputs[0][0];
}

// This file declares helpers at the top level: make it a module so they don't
// collide with the identically named helpers in sibling packages.
export {};
