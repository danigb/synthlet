import { QuantizerOutput } from "./dsp";
import { Scale } from "./_scales";

/**
 * The real processor, on the shape a host actually hands it.
 *
 * What is worth asserting here and not in `dsp.test.ts` is the *block*: an
 * a-rate param arrives as 128 values when something is automating it and as
 * one value when nothing is, and those are two different code paths. The whole
 * reason `input` is a-rate is that a glide has to step at the sample it crosses
 * a boundary rather than at the top of the next render quantum - 2.9 ms later
 * at 44.1 kHz, and by a different amount every time.
 */

describe("QuantizerProcessor", () => {
  let Worklet: any;

  beforeAll(async () => {
    createWorkletTestContext();
    Worklet = (await import("./worklet")).QuantizerProcessor;
  });

  it("registers processor", () => {
    expect(global.registerProcessor).toHaveBeenCalledWith(
      "QuantizerProcessor",
      Worklet,
    );
  });

  it("has parameter descriptors", () => {
    expect(Worklet.parameterDescriptors).toMatchSnapshot();
  });

  describe("a-rate", () => {
    // C major's C/D boundary is 61.0, so a ramp from 60.5 to 61.5 across the
    // block crosses it at the sample where `input` first reaches 61.
    const ramp = (from: number, to: number) => {
      const block = new Float32Array(128);
      for (let i = 0; i < 128; i++) block[i] = from + ((to - from) * i) / 127;
      return block;
    };

    it("changes the note at the sample that crosses the boundary", () => {
      const input = ramp(60.5, 61.5);
      const out = run(new Worklet(), input, { output: QuantizerOutput.Note });

      const crossing = Array.from(input).findIndex((v) => v >= 61);
      expect(crossing).toBeGreaterThan(0);
      expect(crossing).toBeLessThan(127);
      expect(out.slice(0, crossing).every((v) => v === 60)).toBe(true);
      expect(out.slice(crossing).every((v) => v === 62)).toBe(true);
    });

    it("fills the whole block from a length-1 input", () => {
      // Nothing automating `input` is the common case - a `SampleHold` holds
      // its value for a whole beat - and Chrome collapses it to one value.
      const out = run(new Worklet(), [60.9], { output: QuantizerOutput.Note });
      expect(new Set(out)).toEqual(new Set([60]));
      expect(out).toHaveLength(128);
    });

    it("emits hertz by default", () => {
      const out = run(new Worklet(), [60.4]);
      expect(out[0]).toBeCloseTo(261.63, 2);
    });
  });

  it("is the same module at 44.1 kHz and at 48 kHz", () => {
    // There is no clock and no filter in here: a note number is a note number
    // whatever rate it arrives at. Pinning it is what says so - every other
    // module in the library that reads `sampleRate` would fail this.
    const input = new Float32Array(128);
    for (let i = 0; i < 128; i++) input[i] = 48 + (i * 24) / 127;

    createWorkletTestContext(44100);
    const at441 = run(new Worklet(), input);
    createWorkletTestContext(48000);
    const at48 = run(new Worklet(), input);

    expect(at48).toEqual(at441);
    createWorkletTestContext();
  });

  it("stops when disposed", () => {
    const worklet = new Worklet();
    const outputs = [[new Float32Array(128)]];
    expect(worklet.process([], outputs, params([60]))).toBe(true);
    worklet.port.onmessage({ data: { type: "DISPOSE" } });
    expect(worklet.process([], outputs, params([60]))).toBe(false);
  });

  function params(
    input: ArrayLike<number>,
    {
      scale = Scale.Major,
      root = 0,
      hysteresis = 0,
      output = QuantizerOutput.Hz,
    } = {},
  ) {
    return {
      input,
      scale: [scale],
      root: [root],
      hysteresis: [hysteresis],
      output: [output],
    };
  }

  function run(
    worklet: any,
    input: ArrayLike<number>,
    options?: Parameters<typeof params>[1],
  ) {
    const outputs = [[new Float32Array(128)]];
    worklet.process([], outputs, params(input, options));
    return Array.from(outputs[0][0]);
  }
});

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
