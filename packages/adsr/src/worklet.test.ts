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

  it("reaches silence at `decay` seconds with no sustain", () => {
    // The mirror of the AD's `decay` contract: with nothing to sustain, the
    // decay is the time from the peak to silence. Same second in both packages.
    const DECAY_SECONDS = 0.1;
    const decaySamples = DECAY_SECONDS * SAMPLE_RATE;
    const output = runProcessMono(generator(), 2 * decaySamples, {
      ...params,
      attack: [0],
      decay: [DECAY_SECONDS],
      sustain: [0],
    });

    // A zero-length attack snaps to the peak on sample 0, so the decay runs
    // from sample 1 and lands on 0 `decay` seconds later.
    expect(output[0]).toBe(1);
    expect(Math.abs(output.indexOf(0) - decaySamples)).toBeLessThanOrEqual(2);
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

  // The gate/trigger contract, shared with @synthlet/ad: on while positive,
  // opened by the transition from non-positive to positive and closed by the
  // return to <= 0. It replaces a Schmitt trigger that opened at 0.9, which
  // silently ignored any gate peaking below 90% of nominal.
  describe("gate detection", () => {
    const held = (gate: number) =>
      runProcessMono(generator(), 200, { ...params, gate: [gate] });

    it.each([1, 0.99, 0.5, 0.05])("opens on a gate of %p", (gate) => {
      expect(Math.max(...Array.from(held(gate)))).toBeGreaterThan(0);
    });

    it.each([0, -1])("stays closed on a gate of %p", (gate) => {
      expect(Math.max(...Array.from(held(gate)))).toBe(0);
    });

    it("releases when the gate returns to 0", () => {
      const node = generator();
      runProcessMono(node, SAMPLE_RATE * 0.2, params); // to sustain
      // `release` is 0.4 s, so run past it.
      const releasing = runProcessMono(node, SAMPLE_RATE * 0.5, {
        ...params,
        gate: [0],
      });
      expect(releasing[releasing.length - 1]).toBe(0);
    });

    it("is driven by a bipolar square, at 50% duty", () => {
      const node = generator();
      const open = runProcessMono(node, 200, params);
      expect(Math.max(...Array.from(open))).toBeGreaterThan(0);
      const closed = runProcessMono(node, SAMPLE_RATE, {
        ...params,
        gate: [-1],
      });
      expect(closed[closed.length - 1]).toBe(0);
    });

    // The gate is read per sample. Envelopes 05 made the read rate-agnostic
    // behind an opt-in; automation-rate 03 declared the parameter a-rate, so
    // this is what every caller gets rather than what an expert can ask for.
    it("opens at the sample an a-rate gate rises, not at index 0", () => {
      const EDGE = 40;
      const aRate = new Float32Array(200);
      aRate.fill(1, EDGE);

      const outputs = [[new Float32Array(200)]];
      generator().process([[]], outputs, { ...params, gate: aRate });

      const output = Array.from(outputs[0][0]);
      expect(output.slice(0, EDGE)).toEqual(new Array(EDGE).fill(0));
      expect(output[EDGE]).toBeGreaterThan(0);
    });

    it("is unchanged for a k-rate gate", () => {
      const kRate = runProcessMono(generator(), 200, params);
      const outputs = [[new Float32Array(200)]];
      generator().process([[]], outputs, {
        ...params,
        gate: new Float32Array(1).fill(1),
      });
      expect(Array.from(outputs[0][0])).toEqual(Array.from(kRate));
    });
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

    it("processes every channel, not just the first", () => {
      const envelope = Array.from(runProcessMono(generator(), 100, params));
      const [left, right] = runProcessChannels(
        modulator(),
        [new Float32Array(100).fill(1), new Float32Array(100).fill(0.5)],
        params,
      );
      // The right channel used to come out silent: same envelope, each
      // channel scaled by its own input.
      expect(Array.from(left)).toEqual(envelope);
      expect(Array.from(right)).toEqual(envelope.map((v) => v * 0.5));
    });

    it("keeps a hard-panned input panned", () => {
      const [left, right] = runProcessChannels(
        modulator(),
        [new Float32Array(100).fill(1), new Float32Array(100)],
        params,
      );
      expect(Array.from(left).some((value) => value > 0)).toBe(true);
      expect(right).toEqual(new Float32Array(100));
    });

    it("advances the envelope once per sample, not once per channel", () => {
      // Two channels must not run the stage machine twice as fast: a stereo
      // block has to match the mono block sample for sample.
      const expected = Array.from(runProcessMono(generator(), 100, params));
      const [left, right] = runProcessChannels(
        modulator(),
        [new Float32Array(100).fill(1), new Float32Array(100).fill(1)],
        params,
      );
      expect(Array.from(left)).toEqual(expected);
      expect(Array.from(right)).toEqual(expected);
    });

    it("writes the offset to every channel of an unconnected input", () => {
      const outputs = [[new Float32Array(10), new Float32Array(10)]];
      modulator().process([[]], outputs, { ...params, offset: [100] });
      expect(outputs[0][0]).toEqual(new Float32Array(10).fill(100));
      expect(outputs[0][1]).toEqual(new Float32Array(10).fill(100));
    });
  });

  describe("generator mode", () => {
    it("writes the same envelope to every output channel", () => {
      const outputs = [[new Float32Array(100), new Float32Array(100)]];
      generator().process([[]], outputs, params);
      expect(outputs[0][1]).toEqual(outputs[0][0]);
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
