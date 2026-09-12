import { SampleHoldType } from "./dsp";

/**
 * The sample and hold, on the real processor.
 *
 * Two lines of DSP and a contract. What the tests are about is the contract:
 * which edge samples, what counts as an edge, and what a held value survives.
 *
 * `SAMPLE_RATE` is 12800 so the arithmetic is exact rather than approximate -
 * a 10 Hz clock is 1280 samples, which is ten whole render quanta, and one
 * second is a hundred of them. The processor never reads `sampleRate`, so the
 * choice costs nothing and makes every step count checkable by hand.
 */

const SAMPLE_RATE = 12800;
const BLOCK = 128;
const SECOND = SAMPLE_RATE;

describe("SampleHoldProcessor", () => {
  let Worklet: any;

  beforeAll(async () => {
    createWorkletTestContext(SAMPLE_RATE);
    Worklet = (await import("./worklet")).SampleHoldProcessor;
  });

  it("registers processor", () => {
    expect(global.registerProcessor).toHaveBeenCalledWith(
      "SampleHoldProcessor",
      Worklet,
    );
  });

  it("samples on the rising edge, ten times a second, at the edge sample", () => {
    // A one-second ramp, clocked at 10 Hz: the classic staircase.
    const [out] = render(new Worklet(), {
      channels: [(i) => i / SECOND],
      trigger: square(10),
      length: SECOND,
    });

    expect(steps(out)).toEqual([
      0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9,
    ]);
    // Each step is the input *at the edge sample*, and each lasts exactly one
    // clock period.
    expect(runLengths(out)).toEqual(new Array(10).fill(SAMPLE_RATE / 10));
  });

  it("holds without droop for 60 s", () => {
    const [out] = render(new Worklet(), {
      channels: [() => 0.375],
      // One rising edge in the first sample, then nothing for a minute.
      trigger: (i) => (i === 0 ? 1 : 0),
      length: SECOND * 60,
    });

    expect(new Set(out)).toEqual(new Set([0.375]));
  });

  describe("the trigger contract", () => {
    it("samples once while the trigger is held positive", () => {
      const [out] = render(new Worklet(), {
        channels: [(i) => i / SECOND],
        trigger: () => 1,
        length: BLOCK * 4,
      });
      // Held open is not held sampling: it took the first sample and stopped.
      expect(steps(out)).toEqual([0]);
    });

    it("samples again only after the trigger returns to zero or below", () => {
      const [out] = render(new Worklet(), {
        channels: [(i) => i],
        // high, low, high: two samples, at 0 and at 2 * BLOCK.
        trigger: (i) => (i < BLOCK ? 1 : i < 2 * BLOCK ? 0 : 1),
        length: BLOCK * 3,
      });
      expect(steps(out)).toEqual([0, 2 * BLOCK]);
    });

    it.each([
      ["0.001 fires", 0.001, [0, 7]],
      ["0 does not", 0, [0]],
      ["-1 does not", -1, [0]],
    ])("%s", (_what, level, expected) => {
      // The same table as the gates-and-triggers page: positive is the whole
      // rule, and there is no threshold to remember.
      const [out] = render(new Worklet(), {
        channels: [(i) => i],
        trigger: (i) => (i === 0 ? 1 : i === 7 ? level : 0),
        length: BLOCK,
      });
      expect(steps(out)).toEqual(expected);
    });
  });

  describe("track and hold", () => {
    it("is transparent while the trigger is positive and constant while it is not", () => {
      const input = (i: number) => i / SECOND;
      const [out] = render(new Worklet(), {
        channels: [input],
        trigger: square(10),
        type: SampleHoldType.Track,
        length: SAMPLE_RATE / 10,
      });

      const period = SAMPLE_RATE / 10;
      // The first half tracks sample for sample.
      for (let i = 0; i < period / 2; i++) {
        expect(out[i]).toBeCloseTo(input(i), 6);
      }
      // The second half is the value at the falling edge, held.
      const latched = out[period / 2];
      expect(latched).toBeCloseTo(input(period / 2 - 1), 6);
      for (let i = period / 2; i < period; i++) expect(out[i]).toBe(latched);
    });

    it("is a plain sample and hold when the pulse is one sample wide", () => {
      // Part 16: "you can use the T&H as a conventional S&H if you use a clock
      // with a pulse of minimal duration."
      const options = {
        channels: [(i: number) => Math.sin(i / 13)],
        trigger: (i: number) => (i % 371 === 0 ? 1 : 0),
        length: BLOCK * 20,
      };
      const [track] = render(new Worklet(), {
        ...options,
        type: SampleHoldType.Track,
      });
      const [hold] = render(new Worklet(), {
        ...options,
        type: SampleHoldType.SampleHold,
      });

      expect(Array.from(track)).toEqual(Array.from(hold));
    });
  });

  it("holds one value per channel, all sampled at the same frame", () => {
    const [left, right] = render(new Worklet(), {
      channels: [(i) => i / SECOND, (i) => -i / SECOND],
      trigger: (i) => (i === 40 ? 1 : 0),
      length: BLOCK,
    });

    expect(steps(left)).toEqual([0, 40 / SECOND]);
    expect(steps(right)).toEqual([0, -40 / SECOND]);
    // Same frame, not the same value: the trigger is one signal and the
    // detector advances once per frame, not once per channel.
    expect(runLengths(left)).toEqual(runLengths(right));
  });

  describe("the a-rate trigger", () => {
    // Declared a-rate because on this module the render quantum is not a
    // timing error, it is a different sample: fed noise, the quantisation
    // decides *which* random value is held.
    it("samples at the frame the edge arrives", () => {
      const [out] = render(new Worklet(), {
        channels: [(i) => i],
        trigger: (i) => (i === 40 ? 1 : 0),
        length: BLOCK,
      });
      expect(steps(out)).toEqual([0, 40]);
    });

    it("samples at the block boundary when a caller leaves it k-rate", () => {
      // The same edge, delivered the way a k-rate parameter arrives: one value
      // for the whole block, taken at its first frame. The edge at 40 is now
      // invisible until the next block starts.
      const [out] = render(new Worklet(), {
        channels: [(i) => i],
        trigger: (i) => (i >= 40 ? 1 : 0),
        kRate: true,
        length: BLOCK * 2,
      });
      expect(steps(out)).toEqual([0, BLOCK]);
    });
  });

  it("is silent with nothing connected", () => {
    const [out] = render(new Worklet(), {
      channels: [],
      trigger: square(10),
      length: BLOCK * 8,
    });
    expect(Array.from(out)).toEqual(Array.from(new Float32Array(out.length)));
    expect(out.every(Number.isFinite)).toBe(true);
  });
});

/** A unipolar square at `frequency` Hz: 1 for the first half of each period. */
function square(frequency: number) {
  const period = SAMPLE_RATE / frequency;
  return (i: number) => (i % period < period / 2 ? 1 : 0);
}

type RenderOptions = {
  /** One function per input channel, of the absolute sample index. */
  channels: ((i: number) => number)[];
  trigger: (i: number) => number;
  type?: SampleHoldType;
  length: number;
  /** Deliver the trigger as a k-rate parameter does: one value per block. */
  kRate?: boolean;
};

/** Drives the processor block by block, the way a graph does. */
function render(worklet: any, options: RenderOptions) {
  const count = options.channels.length;
  const outCount = Math.max(1, count);
  const total = options.length;

  const out = Array.from({ length: outCount }, () => new Float32Array(total));
  const input = Array.from({ length: count }, () => new Float32Array(BLOCK));
  const output = Array.from(
    { length: outCount },
    () => new Float32Array(BLOCK),
  );
  const trigger = new Float32Array(BLOCK);
  const kRate = new Float32Array(1);

  const params = {
    type: [options.type ?? SampleHoldType.SampleHold],
    trigger: options.kRate ? kRate : trigger,
  };

  for (let at = 0; at < total; at += BLOCK) {
    const size = Math.min(BLOCK, total - at);
    for (const block of output) block.fill(0);
    kRate[0] = options.trigger(at);
    for (let i = 0; i < size; i++) {
      for (let c = 0; c < count; c++) input[c][i] = options.channels[c](at + i);
      trigger[i] = options.trigger(at + i);
    }

    const views = (blocks: Float32Array[]) =>
      size === BLOCK ? blocks : blocks.map((b) => b.subarray(0, size));
    const viewed = views(output);
    worklet.process([views(input)], [viewed], params);
    for (let c = 0; c < outCount; c++) out[c].set(viewed[c], at);
  }

  return out;
}

/** The distinct values a piecewise-constant signal takes, in order. */
function steps(signal: Float32Array) {
  const out: number[] = [];
  for (let i = 0; i < signal.length; i++) {
    if (i === 0 || signal[i] !== signal[i - 1]) {
      // Six decimals: the samples are `Float32`, so a ramp's 0.7 comes back
      // as 0.6999999881 and an exact comparison would be a test of IEEE 754.
      out.push(Number(signal[i].toFixed(6)));
    }
  }
  return out;
}

/** How long each of those steps lasted, in samples. */
function runLengths(signal: Float32Array) {
  const out: number[] = [];
  for (let i = 0; i < signal.length; i++) {
    if (i === 0 || signal[i] !== signal[i - 1]) out.push(1);
    else out[out.length - 1]++;
  }
  return out;
}

function createWorkletTestContext(sampleRate: number) {
  // @ts-ignore
  global.sampleRate = sampleRate;
  // @ts-ignore
  global.AudioWorkletProcessor = class AudioWorkletNodeStub {
    port: { postMessage: jest.Mock; onmessage: jest.Mock };
    constructor() {
      this.port = { postMessage: jest.fn(), onmessage: jest.fn() };
    }
  };
  // @ts-ignore
  global.registerProcessor = jest.fn();
}

// This file declares helpers at the top level: make it a module so they don't
// collide with the identically named helpers in sibling packages.
export {};
