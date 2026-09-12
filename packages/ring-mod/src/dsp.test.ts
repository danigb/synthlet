import { blackmanHarris, magnitudes } from "./_spectrum";

/**
 * The ring modulator, measured on the real processor.
 *
 * Every number here is from Synth Secrets Part 11. Reid's Figure 10 is a
 * 300 Hz carrier against a 200 Hz modulator: two sidebands at 100 and 500 Hz,
 * and *"the Modulator has completely disappeared"* - which is the assertion
 * that separates a ring modulator from a VCA, and the one a `GainNode` fails.
 */

const SAMPLE_RATE = 44100;
const BLOCK = 128;
const IDEAL = 0;

describe("RingModProcessor", () => {
  let Worklet: any;

  beforeAll(async () => {
    createWorkletTestContext(SAMPLE_RATE);
    Worklet = (await import("./worklet")).RingModProcessor;
  });

  it("registers processor", () => {
    expect(global.registerProcessor).toHaveBeenCalledWith(
      "RingModProcessor",
      Worklet,
    );
  });

  describe("Reid's Figure 10: 300 Hz carrier, 200 Hz modulator", () => {
    it("is a ring modulator at offset 0: only the sum and the difference", () => {
      const [out] = render(new Worklet(), {
        channels: [sine(300)],
        modulator: sine(200),
        offset: 0,
      });

      expect(amplitudeAt(out, 100)).toBeCloseTo(0.5, 3);
      expect(amplitudeAt(out, 500)).toBeCloseTo(0.5, 3);

      // "The Modulator has completely disappeared" - and so has the carrier.
      expect(dbBelow(out, 200, 100)).toBeGreaterThan(60);
      expect(dbBelow(out, 300, 100)).toBeGreaterThan(60);
    });

    it("is an amplitude modulator at offset 1: the carrier, and half-height sidebands", () => {
      const [out] = render(new Worklet(), {
        channels: [sine(300)],
        modulator: sine(200),
        offset: 1,
      });

      // Equation 6: the carrier at full amplitude, the two halves either side.
      expect(amplitudeAt(out, 300)).toBeCloseTo(1, 2);
      expect(amplitudeAt(out, 100)).toBeCloseTo(0.5, 3);
      expect(amplitudeAt(out, 500)).toBeCloseTo(0.5, 3);
    });
  });

  describe("AC coupling", () => {
    // Part 11's closing section: an RM "only works in the fashion described
    // when both the Carrier and the Modulator waveforms are precisely centred
    // on zero volts", which is why many of them are AC-coupled. DC on either
    // input leaks the *other* signal to the output.
    it("removes a DC offset on the modulator, so the carrier does not leak", () => {
      const [coupled] = render(new Worklet(), {
        channels: [sine(300)],
        modulator: sine(200, 0.5),
        offset: 0,
      });
      expect(dbBelow(coupled, 300, 100)).toBeGreaterThan(60);

      const [dc] = render(new Worklet(), {
        channels: [sine(300)],
        modulator: sine(200, 0.5),
        offset: 0,
        coupling: 0,
      });
      // The "lesser RM": the carrier is back, at the modulator's DC.
      expect(amplitudeAt(dc, 300)).toBeCloseTo(0.5, 2);
    });

    it("removes a DC offset on the carrier, so the modulator does not leak", () => {
      const [coupled] = render(new Worklet(), {
        channels: [sine(300, 0.5)],
        modulator: sine(200),
        offset: 0,
      });
      expect(dbBelow(coupled, 200, 100)).toBeGreaterThan(60);

      const [dc] = render(new Worklet(), {
        channels: [sine(300, 0.5)],
        modulator: sine(200),
        offset: 0,
        coupling: 0,
      });
      expect(amplitudeAt(dc, 200)).toBeCloseTo(0.5, 2);
    });
  });

  it("keeps the DC of Reid's Case 1, where the two frequencies coincide", () => {
    // "You may be tempted to think that the signal at 0Hz has no effect, but
    // this is not the case ... this manifests itself as an offset in the
    // signal." sin(x)² = ½ - ½cos(2x): the inputs are AC-coupled, the output
    // is not, and half the modulator's amplitude lands at 0 Hz.
    const [out] = render(new Worklet(), {
      channels: [sine(100)],
      modulator: sine(100),
      offset: 0,
    });

    // 0.4991 rather than 0.5: both inputs pass a 5 Hz blocker, whose gain at
    // 100 Hz is 0.99908, and the product carries the loss twice. The claim is
    // that the offset survives the module, not that the module is lossless.
    expect(mean(out)).toBeCloseTo(0.5, 2);
    expect(amplitudeAt(out, 200)).toBeCloseTo(0.5, 2);
    expect(mean(out)).toBeGreaterThan(0.49);
  });

  describe("bypass at offset 1 with nothing connected to the modulator", () => {
    it("is bit-identical when DC-coupled", () => {
      const carrier = sine(300);
      const [out] = render(new Worklet(), {
        channels: [carrier],
        offset: 1,
        coupling: 0,
        warmup: 0,
        length: BLOCK * 8,
      });

      const input = Float32Array.from({ length: BLOCK * 8 }, (_, i) =>
        carrier(i),
      );
      expect(Array.from(out)).toEqual(Array.from(input));
    });

    it("is transparent to 0.1 % in amplitude when AC-coupled", () => {
      // Not bit-identical, and it cannot be: a 5 Hz one-pole blocker has a
      // passband gain of 1.00029 at 300 Hz and a phase shift of 0.017 rad,
      // which is 1.7e-2 of per-sample deviation on a unit sine. A blocker
      // transparent to 1e-7 at audio frequencies would need a corner near
      // 0.05 Hz and would take a minute to settle. What is asserted is the
      // claim that matters - the amplitude is unchanged - plus a bound on the
      // deviation the phase shift explains.
      const carrier = sine(300);
      const [out] = render(new Worklet(), {
        channels: [carrier],
        offset: 1,
      });

      expect(amplitudeAt(out, 300)).toBeCloseTo(1, 3);

      let worst = 0;
      for (let i = 0; i < out.length; i++) {
        worst = Math.max(worst, Math.abs(out[i] - carrier(i + SAMPLE_RATE)));
      }
      expect(worst).toBeLessThan(2e-2);
    });
  });

  it("modulates every channel with the same modulator", () => {
    const [left, right] = render(new Worklet(), {
      channels: [sine(300), sine(300, 0, 0.5)],
      modulator: sine(200),
      offset: 0,
    });

    expect(amplitudeAt(left, 100)).toBeCloseTo(0.5, 3);
    expect(amplitudeAt(right, 100)).toBeCloseTo(0.25, 3);
    // The same modulator, not one stepped twice: halving the carrier halves
    // every sample of the output.
    for (let i = 0; i < left.length; i += 97) {
      expect(right[i]).toBeCloseTo(left[i] / 2, 6);
    }
  });

  it("is silent with nothing connected, and stays silent for 60 s", () => {
    const [out] = render(new Worklet(), {
      channels: [],
      modulator: sine(200),
      offset: 0,
      warmup: 0,
      length: BLOCK * 16,
    });
    expect(Array.from(out)).toEqual(Array.from(new Float32Array(out.length)));

    // A carrier and no modulator, at offset 0: the multiply is by zero, and
    // the blockers have 60 s to accumulate a denormal or a NaN.
    const long = render(new Worklet(), {
      channels: [sine(300)],
      offset: 0,
      warmup: 0,
      length: SAMPLE_RATE * 60,
    })[0];
    expect(long.every(Number.isFinite)).toBe(true);
    expect(Math.max(...maxima(long))).toBe(0);
  });

  it("blocks the same corner at 48 kHz", () => {
    createWorkletTestContext(48000);
    const [out] = render(new Worklet(), {
      channels: [sine(300, 0.5, 1, 48000)],
      modulator: sine(200, 0, 1, 48000),
      offset: 0,
      sampleRate: 48000,
    });

    // The carrier's DC is gone at 48 kHz exactly as it is at 44.1 kHz, which
    // it would not be if the coefficient were a constant instead of a corner.
    expect(dbBelow(out, 200, 100, 48000)).toBeGreaterThan(60);
    createWorkletTestContext(SAMPLE_RATE);
  });
});

/** A sine of `frequency` Hz, `amplitude` tall, sitting on `dc`. */
function sine(
  frequency: number,
  dc = 0,
  amplitude = 1,
  sampleRate = SAMPLE_RATE,
) {
  return (i: number) =>
    dc + amplitude * Math.sin((2 * Math.PI * frequency * i) / sampleRate);
}

type RenderOptions = {
  /** One function per carrier channel, of the absolute sample index. */
  channels: ((i: number) => number)[];
  /** Output channels the host allocated. Web Audio allocates them whether or
   *  not anything is connected to the input, which is how "nothing connected"
   *  is testable at all. */
  outputs?: number;
  /** The a-rate modulator. Omitted means nothing is connected. */
  modulator?: (i: number) => number;
  offset?: number;
  coupling?: number;
  type?: number;
  sampleRate?: number;
  /** Samples rendered and discarded so the DC blockers settle. */
  warmup?: number;
  /** Samples kept. One second by default: a whole number of cycles of every
   *  frequency in this file, so the correlation below is exact. */
  length?: number;
};

/**
 * Drives the processor block by block, the way a graph does, and returns its
 * output channels.
 *
 * Block-driven rather than one long call because a k-rate parameter arrives
 * once per block and an a-rate one arrives as a block: rendering a second in
 * one call would test a processor no browser would ever run.
 */
function render(worklet: any, options: RenderOptions) {
  const sampleRate = options.sampleRate ?? SAMPLE_RATE;
  const warmup = options.warmup ?? sampleRate;
  const length = options.length ?? sampleRate;
  const total = warmup + length;
  const count = options.channels.length;
  const outCount = options.outputs ?? Math.max(1, count);

  const out = Array.from({ length: outCount }, () => new Float32Array(total));
  const input = Array.from({ length: count }, () => new Float32Array(BLOCK));
  const output = Array.from(
    { length: outCount },
    () => new Float32Array(BLOCK),
  );
  const modulator = new Float32Array(BLOCK);
  const unconnected = new Float32Array(1);

  const params = {
    type: [options.type ?? IDEAL],
    modulator: options.modulator ? modulator : unconnected,
    offset: [options.offset ?? 0],
    coupling: [options.coupling ?? 1],
  };

  for (let at = 0; at < total; at += BLOCK) {
    const size = Math.min(BLOCK, total - at);
    // Web Audio hands a processor a zeroed output block every quantum.
    for (const block of output) block.fill(0);
    for (let i = 0; i < size; i++) {
      for (let c = 0; c < count; c++) input[c][i] = options.channels[c](at + i);
      if (options.modulator) modulator[i] = options.modulator(at + i);
    }

    const views = (blocks: Float32Array[]) =>
      size === BLOCK ? blocks : blocks.map((b) => b.subarray(0, size));
    const viewed = views(output);
    worklet.process([views(input)], [viewed], params);
    for (let c = 0; c < outCount; c++) out[c].set(viewed[c], at);
  }

  return out.map((channel) => channel.subarray(warmup));
}

/**
 * The amplitude of a sinusoid at `frequency`, by correlation against it.
 *
 * Exact rather than approximate: every window this file measures is a whole
 * second, and every frequency in it divides 44100, so the analysis covers an
 * integer number of cycles and there is no leakage to window away.
 * `magnitudes` below is for the other question - how far *down* something is -
 * where a -92 dB sidelobe is what matters and calibration is not.
 */
function amplitudeAt(
  signal: ArrayLike<number>,
  frequency: number,
  sampleRate = SAMPLE_RATE,
) {
  let re = 0;
  let im = 0;
  for (let i = 0; i < signal.length; i++) {
    const phase = (2 * Math.PI * frequency * i) / sampleRate;
    re += signal[i] * Math.cos(phase);
    im -= signal[i] * Math.sin(phase);
  }
  return (2 * Math.hypot(re, im)) / signal.length;
}

/** How many dB the spectrum at `frequency` sits below the one at `reference`. */
function dbBelow(
  signal: ArrayLike<number>,
  frequency: number,
  reference: number,
  sampleRate = SAMPLE_RATE,
) {
  const spectrum = magnitudes(signal);
  const n = spectrum.length * 2;
  const at = (hz: number) => {
    const bin = (hz * n) / sampleRate;
    let max = 0;
    for (let k = Math.floor(bin) - 3; k <= Math.ceil(bin) + 3; k++) {
      if (k >= 0 && k < spectrum.length) max = Math.max(max, spectrum[k]);
    }
    return max;
  };
  // Windowed, so the floor this reads is the window's own -92 dB sidelobes
  // rather than a rectangular window's -13 dB ones.
  expect(blackmanHarris(n).length).toBe(n);
  return 20 * Math.log10(at(reference) / at(frequency));
}

function mean(signal: ArrayLike<number>) {
  let sum = 0;
  for (let i = 0; i < signal.length; i++) sum += signal[i];
  return sum / signal.length;
}

/** Chunked maxima, so a 60 s render does not blow the argument limit. */
function maxima(signal: Float32Array) {
  const out: number[] = [];
  for (let at = 0; at < signal.length; at += 8192) {
    out.push(Math.max(...signal.subarray(at, at + 8192).map(Math.abs)));
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
