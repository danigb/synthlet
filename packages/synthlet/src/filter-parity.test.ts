import { Svf } from "@synthlet/state-variable-filter";
import { VirtualAnalogFilter } from "@synthlet/virtual-analog-filter";

// The library has two filters and they used to give opposite answers about
// rate. `state-variable-filter` declared `frequency` a-rate and is the origin
// of the house read idiom; `virtual-analog-filter` declared `frequency`,
// `detune` and `resonance` k-rate with no stated reason, so `MonoSynth` got a
// smooth sweep through `Svf` (`synths/mono.ts:39-40`) and the same patch built
// on `VirtualAnalogFilter` got a 344 Hz staircase.
//
// Not the same filter and not the same response - what is asserted is that a
// sweep through either one is comparably smooth.

const SAMPLE_RATE = 44100;
const BLOCK = 128;

describe("the two filters", () => {
  let SvfProcessor: any;
  let VAF: any;

  beforeAll(async () => {
    createWorkletTestContext(SAMPLE_RATE);
    SvfProcessor = (await import("../../state-variable-filter/src/worklet"))
      .SvfProcessor;
    VAF = (await import("../../virtual-analog-filter/src/worklet")).VAF;
  });

  it("agree that cutoff is a-rate", () => {
    const rate = (descriptors: readonly any[], name: string) =>
      descriptors.find((d) => d.name === name)?.automationRate;

    expect(rate(Svf.descriptors, "frequency")).toBe("a-rate");
    expect(rate(VirtualAnalogFilter.descriptors, "frequency")).toBe("a-rate");
    // And that the structural one is not.
    expect(rate(Svf.descriptors, "type")).toBe("k-rate");
    expect(rate(VirtualAnalogFilter.descriptors, "type")).toBe("k-rate");
  });

  it("agree that resonance is a-rate", () => {
    // The other half of the same disagreement. `virtual-analog-filter` moved
    // `resonance` in automation-rate ticket 04; `Svf`'s `Q` carried a comment
    // calling itself "a bet, and a weak one" until it moved too.
    const rate = (descriptors: readonly any[], name: string) =>
      descriptors.find((d) => d.name === name)?.automationRate;

    expect(rate(Svf.descriptors, "Q")).toBe("a-rate");
    expect(rate(VirtualAnalogFilter.descriptors, "resonance")).toBe("a-rate");
  });

  // An envelope-shaped cutoff sweep: 200 Hz to 6 kHz over 16 blocks, rendered
  // per sample. Driving both with DC makes the output a direct read-out of the
  // filter's own gain at the moving cutoff, so a staircase in the cutoff is a
  // staircase in the output.
  const BLOCKS = 16;
  const cutoffAt = (block: number, i: number) =>
    200 + ((6000 - 200) * (block * BLOCK + i)) / (BLOCKS * BLOCK);

  function sweep(
    render: (input: Float32Array, cutoff: Float32Array) => Float32Array,
  ) {
    const out: number[] = [];
    for (let b = 0; b < BLOCKS; b++) {
      const cutoff = Float32Array.from({ length: BLOCK }, (_, i) =>
        cutoffAt(b, i),
      );
      out.push(...Array.from(render(new Float32Array(BLOCK).fill(1), cutoff)));
    }
    return out;
  }

  /** The largest jump between adjacent samples, ignoring the first block. */
  const roughness = (values: number[]) => {
    let max = 0;
    for (let i = BLOCK + 1; i < values.length; i++) {
      max = Math.max(max, Math.abs(values[i] - values[i - 1]));
    }
    return max;
  };

  it("sweep comparably smoothly", () => {
    const svf = new SvfProcessor();
    const svfOut = sweep((input, cutoff) => {
      const outputs = [[new Float32Array(BLOCK)]];
      svf.process([[input]], outputs, {
        type: [0],
        frequency: cutoff,
        Q: [1],
      });
      return outputs[0][0];
    });

    const vaf = new VAF();
    const vafOut = sweep((input, cutoff) => {
      const outputs = [[new Float32Array(BLOCK)]];
      vaf.process([[input]], outputs, {
        type: [0],
        frequency: cutoff,
        detune: [0],
        resonance: [0.2],
      });
      return outputs[0][0];
    });

    // Both are smooth in absolute terms - no step is a meaningful fraction of
    // full scale - which is the criterion. Comparable, not identical: these
    // are different circuits.
    expect(roughness(svfOut)).toBeLessThan(0.01);
    expect(roughness(vafOut)).toBeLessThan(0.01);
  });

  it("track a 200 Hz Q modulator instead of sampling it at 344 Hz", () => {
    // Resonance FM, and the assertion is deliberately not `roughness`. A cutoff
    // staircase shows up directly in the output because it detunes a resonance
    // peak; a Q staircase does not, because Q enters through the damping term
    // and the filter's own settling smooths a step in it. Measured: a Q ramp of
    // 0.5 -> 8 over sixteen blocks is as smooth per block as it is per sample,
    // to seven decimal places. So this asserts what the cutoff test asserts
    // about `frequency` in `virtual-analog-filter/src/worklet.test.ts` - that
    // the modulator arrives at all.
    //
    // A bandpass at its own centre frequency has a gain of exactly Q, which
    // makes the output a direct read-out of the modulator.
    const BLOCKS_Q = 8;
    const FC = 1000;
    const qAt = (n: number) =>
      4 + 3.5 * Math.sin((2 * Math.PI * 200 * n) / SAMPLE_RATE);

    const render = (perBlock: boolean) => {
      const svf = new SvfProcessor();
      const out: number[] = [];
      for (let b = 0; b < BLOCKS_Q; b++) {
        const input = new Float32Array(BLOCK);
        const q = new Float32Array(BLOCK);
        for (let i = 0; i < BLOCK; i++) {
          const n = b * BLOCK + i;
          input[i] = Math.sin((2 * Math.PI * FC * n) / SAMPLE_RATE);
          q[i] = qAt(n);
        }
        const outputs = [[new Float32Array(BLOCK)]];
        svf.process([[input]], outputs, {
          type: [2],
          frequency: [FC],
          Q: perBlock ? [q[0]] : q,
        });
        out.push(...Array.from(outputs[0][0]));
      }
      return out;
    };

    const rms = (v: number[]) =>
      Math.sqrt(v.reduce((a, x) => a + x * x, 0) / v.length);
    const perSample = render(false);
    const perBlock = render(true);

    // At 200 Hz the modulator turns over inside a single block - it rises and
    // falls - so one value per block cannot represent it at all.
    let rising = 0;
    for (let i = 1; i < BLOCK; i++) if (qAt(i) > qAt(i - 1)) rising++;
    expect(rising).toBeGreaterThan(10);
    expect(rising).toBeLessThan(BLOCK - 10);

    // 58% of the signal, measured. Before this the two renders were identical.
    const difference = perSample.map((x, i) => x - perBlock[i]);
    expect(rms(difference) / rms(perSample)).toBeGreaterThan(0.4);
  });

  it("and the VA filter is smoother than it was at k-rate", () => {
    // The same sweep with the cutoff delivered one value per block, which is
    // what this filter did before automation-rate ticket 04.
    const perSample = new VAF();
    const perBlock = new VAF();

    const smooth = sweep((input, cutoff) => {
      const outputs = [[new Float32Array(BLOCK)]];
      perSample.process([[input]], outputs, {
        type: [0],
        frequency: cutoff,
        detune: [0],
        resonance: [0.2],
      });
      return outputs[0][0];
    });
    const stepped = sweep((input, cutoff) => {
      const outputs = [[new Float32Array(BLOCK)]];
      perBlock.process([[input]], outputs, {
        type: [0],
        frequency: [cutoff[0]],
        detune: [0],
        resonance: [0.2],
      });
      return outputs[0][0];
    });

    expect(roughness(smooth)).toBeLessThan(roughness(stepped));
  });
});

function createWorkletTestContext(sampleRate = SAMPLE_RATE, ctx: any = global) {
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
