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
