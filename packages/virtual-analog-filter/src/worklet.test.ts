describe("VAFProcessor", () => {
  let Worklet: any;
  const MOOG_LADDER = 0;
  const KORG35_LPF = 2;

  beforeAll(async () => {
    createWorkletTestContext(8000);
    Worklet = (await import("./worklet")).VAF;
  });

  const params = {
    type: [MOOG_LADDER],
    frequency: [1000],
    detune: [0],
    resonance: [0.5],
  };
  const impulse = () => {
    const signal = new Float32Array(16);
    signal[0] = 1;
    return signal;
  };

  it("registers processor", () => {
    expect(global.registerProcessor).toHaveBeenCalledWith(
      "VAFProcessor",
      Worklet,
    );
  });

  it("processes every channel, not just the first", () => {
    const [left, right] = runProcessChannels(
      new Worklet(),
      [impulse(), impulse()],
      params,
    );
    // The right channel used to come out silent.
    expect(Array.from(left).some((value) => value !== 0)).toBe(true);
    expect(Array.from(right)).toEqual(Array.from(left));
  });

  it("filters the left channel exactly as it would filter it alone", () => {
    const [mono] = runProcessChannels(new Worklet(), [impulse()], params);
    const [left] = runProcessChannels(
      new Worklet(),
      [impulse(), impulse()],
      params,
    );
    expect(Array.from(left)).toEqual(Array.from(mono));
  });

  it("gives each channel its own state, so a hard pan stays panned", () => {
    const node = new Worklet();
    // A ladder filter is all state: with one shared instance the left
    // channel's ringing would come back out of the right one.
    const first = runProcessChannels(
      node,
      [impulse(), new Float32Array(16)],
      params,
    );
    expect(Array.from(first[0]).some((value) => value !== 0)).toBe(true);
    expect(first[1]).toEqual(new Float32Array(16));

    const second = runProcessChannels(
      node,
      [new Float32Array(16), new Float32Array(16)],
      params,
    );
    expect(Array.from(second[0]).some((value) => value !== 0)).toBe(true);
    expect(second[1]).toEqual(new Float32Array(16));
  });

  it("keeps each type's state when `type` changes", () => {
    // Every channel holds one instance of every filter, so switching back to
    // a type picks up where that filter left off rather than from silence.
    const korg = { ...params, type: [KORG35_LPF] };
    const node = new Worklet();
    const [viaMoog] = runProcessChannels(node, [impulse()], params);
    runProcessChannels(node, [impulse()], korg);
    const [backToMoog] = runProcessChannels(
      node,
      [new Float32Array(16)],
      params,
    );

    expect(Array.from(viaMoog).some((value) => value !== 0)).toBe(true);
    // Still ringing from the first block, undisturbed by the Korg detour.
    expect(Array.from(backToMoog).some((value) => value !== 0)).toBe(true);
  });

  describe("surviving a non-finite sample", () => {
    // A ladder is all state and `NaN + anything` is `NaN`, so one bad input
    // sample used to kill the node for the life of the AudioContext. There is
    // no recovery path in Web Audio: the graph emits `NaN` or silence until
    // somebody rebuilds it.
    const poisoned = () => {
      const signal = new Float32Array(16);
      signal[0] = NaN;
      signal[1] = 1;
      return signal;
    };

    // One per circuit: Moog, half ladder, Korg 35, diode, Oberheim.
    const TYPES = [0, 1, 2, 4, 5];

    it.each(TYPES)("type %p is finite again on the next block", (type) => {
      const node = new Worklet();
      const withType = { ...params, type: [type] };
      const [bad] = runProcessChannels(node, [poisoned()], withType);
      // The offending block is silence, not NaN. Zeroing it is what keeps the
      // damage inside the block that caused it.
      expect(Array.from(bad)).toEqual(Array.from(new Float32Array(16)));

      const [good] = runProcessChannels(node, [impulse()], withType);
      expect(Array.from(good).every(Number.isFinite)).toBe(true);
      expect(Array.from(good).some((value) => value !== 0)).toBe(true);
    });

    it("recovers on the automated path too", () => {
      // A different route into the same check: the segment renderer calls
      // `process()` once per sample here, and the guard is still once per
      // block.
      const node = new Worklet();
      const swept = {
        ...params,
        frequency: Array.from({ length: 16 }, (_, i) => 500 + 40 * i),
      };
      runProcessChannels(node, [poisoned()], swept);
      const [good] = runProcessChannels(node, [impulse()], swept);
      expect(Array.from(good).every(Number.isFinite)).toBe(true);
      expect(Array.from(good).some((value) => value !== 0)).toBe(true);
    });

    it("does not reset the other channel", () => {
      // Each channel has its own bank and its own change-detection slot, so a
      // NaN on the left must not silence the right one's ringing.
      const node = new Worklet();
      runProcessChannels(node, [impulse(), impulse()], params);
      const [, right] = runProcessChannels(
        node,
        [poisoned(), new Float32Array(16)],
        params,
      );
      // Still ringing from the first block.
      expect(Array.from(right).some((value) => value !== 0)).toBe(true);
    });

    it("does not reset the other types in the bank", () => {
      // The bank exists so that switching `type` mid-note resumes where that
      // model left off. Only the filter that rendered can have been poisoned.
      const korg = { ...params, type: [KORG35_LPF] };
      const node = new Worklet();
      runProcessChannels(node, [impulse()], korg);
      runProcessChannels(node, [poisoned()], params);
      const [backToKorg] = runProcessChannels(
        node,
        [new Float32Array(16)],
        korg,
      );
      expect(Array.from(backToKorg).some((value) => value !== 0)).toBe(true);
    });
  });

  it("is a no-op for an input with no channels", () => {
    const outputs = [[new Float32Array(16)]];
    expect(() => new Worklet().process([[]], outputs, params)).not.toThrow();
    expect(outputs[0][0]).toEqual(new Float32Array(16));
  });
});

describe("type selection", () => {
  // `worklet.ts` read `Math.floor(params.type)` - the whole `Float32Array`,
  // with no `[0]` - from the day it was written. It worked because `Math.floor`
  // coerces, a length-1 array stringifies to its single value, and `type` is
  // k-rate so the array is always length 1. Correct by accident, and it
  // detonates the moment anything hands this parameter more than one value.
  let Worklet: any;
  const TYPES = [0, 1, 2, 3, 4, 5, 6, 7, 8];

  beforeAll(async () => {
    Worklet = (await import("./worklet")).VAF;
  });

  const impulseResponse = (type: ArrayLike<number>) => {
    const signal = new Float32Array(64);
    signal[0] = 1;
    const [out] = runProcessChannels(new Worklet(), [signal], {
      type,
      frequency: [1000],
      detune: [0],
      resonance: [0.5],
    });
    return Array.from(out);
  };

  it("gives every VaFilterType its own model", () => {
    const responses = TYPES.map((type) => impulseResponse([type]));
    const distinct = new Set(responses.map((r) => JSON.stringify(r)));
    expect(distinct.size).toBe(TYPES.length);
  });

  it("selects the same model when `type` arrives with more than one value", () => {
    // The shape that broke it: a length-3 array stringifies to "3,3,3", which
    // is NaN, and `bank[NaN] || bank[0]` falls back to the Moog ladder for
    // every type - silently, with audio that still sounds like a filter.
    for (const type of TYPES) {
      expect(impulseResponse([type, type, type])).toEqual(
        impulseResponse([type]),
      );
    }
  });
});

describe("a-rate cutoff", () => {
  // `frequency`, `detune` and `resonance` were k-rate with no stated reason,
  // while `state-variable-filter` - the other filter in this library - has
  // declared its cutoff a-rate from the start. So `MonoSynth` got a smooth
  // sweep through `Svf` and a 344 Hz staircase through this one.
  //
  // These run at 44.1 kHz, unlike the tests above: a cutoff sweep needs a real
  // sample rate to mean anything.
  let Worklet: any;
  const SAMPLE_RATE = 44100;
  const BLOCK = 128;
  const MOOG_LADDER = 0;

  beforeAll(async () => {
    createWorkletTestContext(SAMPLE_RATE);
    Worklet = (await import("./worklet")).VAF;
  });

  const noise = (length: number) => {
    // Deterministic: a 32-bit LCG, so nothing here can flake.
    let state = 0x2545f491;
    return Float32Array.from({ length }, () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 0x80000000 - 1;
    });
  };

  const ramp = (length: number, from: number, to: number) =>
    Float32Array.from(
      { length },
      (_, i) => from + ((to - from) * i) / (length - 1),
    );

  const run = (worklet: any, input: Float32Array, params: any) => {
    const outputs = [[new Float32Array(input.length)]];
    worklet.process([[input]], outputs, {
      type: [MOOG_LADDER],
      frequency: [1000],
      detune: [0],
      resonance: [0.5],
      ...params,
    });
    return outputs[0][0];
  };

  it("renders a sweep in runs, one per distinct cutoff", () => {
    // The mechanism, asserted directly: `update()` only stores, and the
    // coefficients are computed inside `process()`, so a per-sample sweep has
    // to be a per-sample render. 128 distinct cutoffs, 128 calls.
    const worklet = new Worklet();
    run(worklet, noise(BLOCK), {}); // build the bank
    const filter = worklet.p[0][MOOG_LADDER];
    const update = jest.spyOn(filter, "update");
    const process = jest.spyOn(filter, "process");

    run(worklet, noise(BLOCK), { frequency: ramp(BLOCK, 200, 4000) });

    expect(update).toHaveBeenCalledTimes(BLOCK);
    expect(process).toHaveBeenCalledTimes(BLOCK);
    // And between them they cover the block exactly once, in order.
    const ranges = process.mock.calls.map((call: any) => [call[2], call[3]]);
    expect(ranges[0]).toEqual([0, 1]);
    expect(ranges[BLOCK - 1]).toEqual([BLOCK - 1, BLOCK]);
  });

  it("costs one update and one process when nothing is automated", () => {
    // The cost criterion, asserted by instrumenting rather than by timing.
    const worklet = new Worklet();
    run(worklet, noise(BLOCK), {});
    const filter = worklet.p[0][MOOG_LADDER];
    const update = jest.spyOn(filter, "update");
    const process = jest.spyOn(filter, "process");

    run(worklet, noise(BLOCK), {});

    // Change detection skips the update entirely: nothing moved.
    expect(update).not.toHaveBeenCalled();
    expect(process).toHaveBeenCalledTimes(1);
    expect(process.mock.calls[0].slice(2)).toEqual([0, BLOCK]);
  });

  it("collapses an a-rate parameter that holds still", () => {
    // Finding 3 of the benchmark: an a-rate param can still be handed 128
    // identical values. That must cost one run, not 128.
    const worklet = new Worklet();
    run(worklet, noise(BLOCK), {});
    const filter = worklet.p[0][MOOG_LADDER];
    const process = jest.spyOn(filter, "process");

    run(worklet, noise(BLOCK), {
      frequency: new Float32Array(BLOCK).fill(800),
    });

    expect(process).toHaveBeenCalledTimes(1);
  });

  it("gives every channel its own change detection", () => {
    // One shared pair of locals would report "unchanged" for every channel
    // after the first and leave their coefficients stale.
    const worklet = new Worklet();
    const signal = noise(BLOCK);
    const outputs = [[new Float32Array(BLOCK), new Float32Array(BLOCK)]];
    worklet.process([[signal, signal]], outputs, {
      type: [MOOG_LADDER],
      frequency: ramp(BLOCK, 200, 4000),
      detune: [0],
      resonance: [0.5],
    });

    // Same input and same sweep, so the two channels must agree - and neither
    // may be silent.
    expect(Array.from(outputs[0][1])).toEqual(Array.from(outputs[0][0]));
    expect(Array.from(outputs[0][0]).some((v) => v !== 0)).toBe(true);
  });

  it("sweeps smoothly where it used to step once a block", () => {
    // An envelope-shaped sweep across four blocks. The k-rate filter held one
    // cutoff for each 128 samples; measure that by filtering a DC input and
    // looking for the staircase in the output's own increments.
    const sweep = (aRate: boolean) => {
      const worklet = new Worklet();
      const out: number[] = [];
      for (let b = 0; b < 8; b++) {
        const cutoff = ramp(BLOCK, 200 + b * 400, 200 + (b + 1) * 400);
        const block = run(worklet, new Float32Array(BLOCK).fill(1), {
          frequency: aRate ? cutoff : [cutoff[0]],
          resonance: [0.2],
        });
        out.push(...Array.from(block));
      }
      return out;
    };

    const steps = (values: number[]) =>
      values.slice(1).map((v, i) => Math.abs(v - values[i]));

    // The k-rate render's largest sample-to-sample jump lands on a block
    // boundary; the a-rate one's does not, and is smaller.
    const aRateSteps = steps(sweep(true));
    const kRateSteps = steps(sweep(false));
    expect(Math.max(...aRateSteps)).toBeLessThan(Math.max(...kRateSteps));
  });

  it("folds an a-rate detune into the cutoff", () => {
    // `detune` is part of the same quantity as `frequency`: the pair is only
    // as smooth as its coarser half.
    const worklet = new Worklet();
    const signal = noise(BLOCK);

    const viaDetune = run(worklet, signal, {
      frequency: [1000],
      detune: new Float32Array(BLOCK).fill(12),
    });
    const viaFrequency = run(new Worklet(), signal, { frequency: [2000] });

    for (let i = 0; i < BLOCK; i++) {
      expect(viaDetune[i]).toBeCloseTo(viaFrequency[i], 5);
    }
  });

  it("stays stable under a fast full-range sweep at maximum resonance", () => {
    // The self-oscillating ladder is the one to watch under per-sample
    // coefficient updates.
    const worklet = new Worklet();
    for (let b = 0; b < 40; b++) {
      const up = b % 2 === 0;
      const out = run(worklet, noise(BLOCK), {
        frequency: ramp(BLOCK, up ? 20 : 20000, up ? 20000 : 20),
        resonance: [1],
      });
      expect(Array.from(out).every(Number.isFinite)).toBe(true);
      expect(Math.max(...Array.from(out).map(Math.abs))).toBeLessThan(100);
    }
  });

  it("tracks a 200 Hz modulator instead of sampling it at 344 Hz", () => {
    // Filter FM. A 200 Hz modulator on the cutoff is above the Nyquist of a
    // 344.5 Hz sampler, so a k-rate filter did not merely quantise it - it
    // aliased it, to 144 Hz. Asserted on the coefficients the filter is
    // actually given, which is where the modulator arrives.
    const worklet = new Worklet();
    const modulator = Float32Array.from(
      { length: BLOCK },
      (_, i) => 2000 + 1500 * Math.sin((2 * Math.PI * 200 * i) / SAMPLE_RATE),
    );

    run(worklet, noise(BLOCK), {}); // build the bank
    const filter = worklet.p[0][MOOG_LADDER];
    const update = jest.spyOn(filter, "update");
    run(worklet, noise(BLOCK), { frequency: modulator, resonance: [0.2] });

    const cutoffs = update.mock.calls.map((call: any) => call[0]);
    expect(cutoffs).toHaveLength(BLOCK);
    // Every sample of the modulator reaches the filter, in order.
    for (let i = 0; i < BLOCK; i++) {
      expect(cutoffs[i]).toBeCloseTo(modulator[i], 3);
    }
    // At 200 Hz the modulator turns over inside a single block: it rises and
    // falls. One value per block cannot represent that at all.
    const rising = cutoffs.slice(1).filter((f, i) => f > cutoffs[i]).length;
    expect(rising).toBeGreaterThan(10);
    expect(rising).toBeLessThan(BLOCK - 10);
  });

  it("selects the type correctly with `type` forced a-rate", () => {
    // The regression test for the missing `[0]`, run under the conditions that
    // would have detonated it.
    const signal = noise(64);
    const responses = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((type) =>
      JSON.stringify(
        Array.from(
          run(new Worklet(), signal, { type: new Float32Array(64).fill(type) }),
        ),
      ),
    );
    expect(new Set(responses).size).toBe(9);
  });
});

function createWorkletTestContext(sampleRate = 10) {
  // @ts-ignore
  global.sampleRate = sampleRate;
  // @ts-ignore
  global.AudioWorkletProcessor = class AudioWorkletNodeStub {
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
  // @ts-ignore
  global.registerProcessor = jest.fn();
}

type Worklet = {
  process: (
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: any,
  ) => boolean;
};

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
