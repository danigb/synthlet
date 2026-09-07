import { ParamScaleType } from "./dsp";

// `Param` is the conduit for the whole instrument layer: every drum voice's
// trigger inlet and `MonoSynth`'s gate is one of these. Until ticket 02 of the
// automation-rate folder its entire `process()` read seven parameters at `[0]`
// and ended in `outputs[0][0].fill(out)`, so anything routed through it was
// decimated to one value per render quantum - including the vision document's
// own headline example, `Param(ac, { input: 1, mod: lfo })`.
//
// `input` and `mod` are now a-rate. The `fill()` stays as the fast path, and
// "the fast path is still taken" is asserted here rather than assumed.

describe("ParamProcessor", () => {
  let Processor: any;

  beforeAll(async () => {
    createWorkletTestContext(44100);
    Processor = (await import("./worklet")).ParamProcessor;
  });

  it("registers processor", () => {
    expect(global.registerProcessor).toHaveBeenCalledWith(
      "ParamProcessor",
      Processor,
    );
  });

  it("has parameter descriptors", () => {
    // Two of seven a-rate: the signal, not the coefficients.
    expect(Processor.parameterDescriptors).toMatchSnapshot();
  });

  it("declares exactly input and mod a-rate", () => {
    const aRate = Processor.parameterDescriptors
      .filter((d: any) => d.automationRate === "a-rate")
      .map((d: any) => d.name);
    expect(aRate).toEqual(["input", "mod"]);
  });

  describe("the conduit is transparent", () => {
    it("passes a full-rate signal through bit for bit", () => {
      // gain 1, offset 0, Bypass: the identity. Today it came out a staircase.
      const noise = whiteNoise(128);
      const output = run(new Processor(), 128, { input: noise });
      expect(Array.from(output)).toEqual(Array.from(noise));
    });

    it("reproduces a modulator on `mod`", () => {
      // The vision document's example: `Param(ac, { input: 1, mod: lfo })`.
      const lfo = sine(128, 5, 44100);
      const output = run(new Processor(), 128, { input: [1], mod: lfo });
      for (let i = 0; i < 128; i++) {
        expect(output[i]).toBeCloseTo(1 + lfo[i], 6);
      }
    });

    it("sums two a-rate signals", () => {
      const a = whiteNoise(128);
      const b = whiteNoise(128);
      const output = run(new Processor(), 128, { input: a, mod: b });
      for (let i = 0; i < 128; i++) {
        expect(output[i]).toBeCloseTo(a[i] + b[i], 6);
      }
    });

    it("handles either side arriving length 1", () => {
      // The two ternaries have four combinations and all four have to work.
      const signal = whiteNoise(128);
      const withMod = run(new Processor(), 128, { input: [2], mod: signal });
      const withInput = run(new Processor(), 128, { input: signal, mod: [2] });
      for (let i = 0; i < 128; i++) {
        expect(withMod[i]).toBeCloseTo(2 + signal[i], 6);
        expect(withInput[i]).toBeCloseTo(signal[i] + 2, 6);
      }
    });
  });

  describe("the mid-block edge", () => {
    // The `envelopes 05` test, applied to the conduit. A gate scheduled with
    // `setValueAtTime(1, t)` for a `t` falling mid-quantum arrives as an array
    // whose value steps at that sample. Before this ticket the output rose at
    // index 0 of the *next* block - up to 2.9 ms late at 44.1 kHz, and by a
    // different amount for every event.
    const EDGE = 64;

    it("rises at the sample the edge is on, not at the block boundary", () => {
      const gate = new Float32Array(128);
      gate.fill(1, EDGE);
      const output = run(new Processor(), 128, { input: gate });

      expect(output[EDGE - 1]).toBe(0);
      expect(output[EDGE]).toBe(1);
      expect(Array.from(output.subarray(EDGE)).every((v) => v === 1)).toBe(
        true,
      );
    });

    it("survives the gain and offset a gate line is allowed to carry", () => {
      // `scripts/_gate.ts` promises the contract is invariant under `Param`:
      // `input * gain + offset` with a positive gain and a non-negative offset
      // keeps a positive signal positive. Invariant in value - and now in time.
      const gate = new Float32Array(128);
      gate.fill(1, EDGE);
      const output = run(new Processor(), 128, {
        input: gate,
        gain: [0.25],
        offset: [0.1],
      });

      expect(output[EDGE - 1]).toBeCloseTo(0.1, 6);
      expect(output[EDGE]).toBeCloseTo(0.35, 6);
    });

    it("sees two edges inside one block", () => {
      // Today the second is invisible: one value per block is one event per
      // block. This is a capability that did not exist.
      const gate = new Float32Array(128);
      gate.fill(1, 20, 30);
      gate.fill(1, 80, 90);
      const output = run(new Processor(), 128, { input: gate });

      const edges = [];
      for (let i = 1; i < 128; i++) {
        if (output[i] > 0 && output[i - 1] <= 0) edges.push(i);
      }
      expect(edges).toEqual([20, 80]);
    });
  });

  describe("the fast path", () => {
    // Asserted by instrumenting, not by timing: `fill()` is one call for the
    // whole block and the loop is 128 writes, so which one ran is observable.
    const spied = (params: any) => {
      const out = new Float32Array(128);
      const fill = jest.spyOn(out, "fill");
      new Processor().process([], [[out]], allParams(params));
      return fill;
    };

    it("is taken when nothing is automated", () => {
      expect(spied({ input: [0.5] })).toHaveBeenCalledTimes(1);
    });

    it("is taken when a constant is connected", () => {
      // Chrome collapses a constant sum: an a-rate param fed a
      // `ConstantSourceNode` still arrives as length 1. Measured in
      // `benchmarks/automation-rate/probe.js`, and the reason the fast path
      // covers the common case rather than only the unconnected one.
      expect(spied({ input: [0.5], mod: [0.25] })).toHaveBeenCalledTimes(1);
    });

    it("is not taken when either side is automated", () => {
      expect(spied({ input: whiteNoise(128) })).not.toHaveBeenCalled();
      expect(spied({ mod: whiteNoise(128) })).not.toHaveBeenCalled();
    });
  });

  describe("the converters", () => {
    it("run per sample, not once per block", () => {
      // A ramp in decibels: `10^(x/20)` at every sample. If the conversion had
      // been hoisted with the coefficients this would be one value repeated.
      const db = Float32Array.from({ length: 128 }, (_, i) => -60 + i * 0.5);
      const output = run(new Processor(), 128, {
        scale: [ParamScaleType.DbToGain],
        input: db,
      });
      for (let i = 0; i < 128; i++) {
        expect(output[i]).toBeCloseTo(Math.pow(10, db[i] / 20), 6);
      }
    });

    it("read min and max as block coefficients", () => {
      const ramp = Float32Array.from({ length: 128 }, (_, i) => i / 127);
      const output = run(new Processor(), 128, {
        scale: [ParamScaleType.Linear],
        input: ramp,
        min: [20],
        max: [100],
      });
      for (let i = 0; i < 128; i++) {
        expect(output[i]).toBeCloseTo(20 + ramp[i] * 80, 4);
      }
    });

    it("swap when scale changes, and only then", () => {
      const processor = new Processor();
      const bypass = run(processor, 128, { input: [-6] });
      const gain = run(processor, 128, {
        scale: [ParamScaleType.DbToGain],
        input: [-6],
      });
      expect(bypass[0]).toBe(-6);
      expect(gain[0]).toBeCloseTo(Math.pow(10, -6 / 20), 6);
    });
  });

  describe("no regression at k-rate", () => {
    // With the caller doing nothing special, every scale produces the value it
    // produced before, for the whole block. Snapshotted so a later change to
    // the fast path has to explain itself.
    it.each([
      ["Bypass", ParamScaleType.Bypass],
      ["DbToGain", ParamScaleType.DbToGain],
      ["GainToDb", ParamScaleType.GainToDb],
      ["Linear", ParamScaleType.Linear],
    ])("%s", (_name, scale) => {
      const output = run(new Processor(), 128, {
        scale: [scale],
        input: [0.5],
        mod: [0.25],
        min: [10],
        max: [50],
        gain: [2],
        offset: [1],
      });
      expect(new Set(output).size).toBe(1);
      expect(output[0]).toMatchSnapshot();
    });
  });

  it("stops when disposed", () => {
    const processor = new Processor();
    expect(
      processor.process([], [[new Float32Array(128)]], allParams({})),
    ).toBe(true);
    processor.port.onmessage({ data: { type: "DISPOSE" } });
    expect(
      processor.process([], [[new Float32Array(128)]], allParams({})),
    ).toBe(false);
  });
});

/** Every parameter the processor reads, defaulted to the descriptor's value. */
function allParams(over: Record<string, ArrayLike<number>>) {
  return {
    scale: [0],
    input: [0],
    offset: [0],
    min: [0],
    max: [1],
    gain: [1],
    mod: [0],
    ...over,
  };
}

function run(
  processor: any,
  length: number,
  params: Record<string, ArrayLike<number>>,
) {
  const out = new Float32Array(length);
  processor.process([], [[out]], allParams(params));
  return out;
}

/** Deterministic full-scale noise: a 32-bit LCG, so the test cannot flake. */
function whiteNoise(length: number) {
  let state = 0x2545f491;
  return Float32Array.from({ length }, () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x80000000 - 1;
  });
}

function sine(length: number, frequency: number, sampleRate: number) {
  return Float32Array.from({ length }, (_, i) =>
    Math.sin((2 * Math.PI * frequency * i) / sampleRate),
  );
}

function createWorkletTestContext(sampleRate = 44100) {
  // @ts-ignore
  global.sampleRate = sampleRate;
  // @ts-ignore
  global.AudioWorkletProcessor = class AudioWorkletNodeStub {
    port: {
      postMessage: jest.Mock<any, any, any>;
      onmessage: (event: { data: { type: string } }) => void;
    };

    constructor() {
      this.port = {
        postMessage: jest.fn(),
        onmessage: () => {},
      };
    }
  };
  // @ts-ignore
  global.registerProcessor = jest.fn();
}

// This file declares helpers at the top level: make it a module so they don't
// collide with the identically named helpers in sibling packages.
export {};
