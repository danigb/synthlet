import { magnitudes } from "./_spectrum";
import { createLfo, LfoType } from "./dsp";

/**
 * What this package promises, as numbers.
 *
 * The LFO's output is a **signal**. Until ticket 01 of the automation-rate
 * folder `worklet.ts` built it with `createLfo(sampleRate, false)`, so every
 * `Lfo` in the library emitted one value per render quantum - a 344 Hz
 * staircase at 44.1 kHz, whatever it was patched into. `generateAudioRate`
 * already existed and was unreachable.
 *
 * Every assertion below is written to fail against the block-constant
 * generator and pass against the per-sample one, so the file is the evidence
 * for the change rather than a description of it. Where a test cannot
 * discriminate between the two - `RandSampleHold`, which re-rolls at a wrap
 * either way - it says so.
 *
 * `createLfo(sampleRate, false)` keeps its own tests at the bottom. It is a
 * documented alternative, not dead code.
 *
 * Runs in node with no `AudioWorkletProcessor` stub: `dsp.ts` imports nothing
 * from the worklet global scope. `worklet.test.ts` is where the stub lives.
 */

const SAMPLE_RATE = 44100;

/** One render quantum - the block size the processor is actually called with. */
const BLOCK = 128;

/** 5 Hz: the vibrato rate in `MonoSynth`'s own example, and slow enough that a
 * block boundary is nowhere near the waveform's own timescale. */
const RATE = 5;

/** Samples in one cycle at `RATE`. */
const CYCLE = SAMPLE_RATE / RATE;

type Params = {
  type: number[];
  frequency: number[];
  gain: number[];
  offset: number[];
};

const params = (over: Partial<Record<keyof Params, number>> = {}): Params => ({
  type: [over.type ?? LfoType.Sine],
  frequency: [over.frequency ?? RATE],
  gain: [over.gain ?? 1],
  offset: [over.offset ?? 0],
});

/** Drive a generator over `samples` in blocks, exactly as the processor does. */
function render(
  generate: ReturnType<typeof createLfo>,
  samples: number,
  p: Params,
  blockSize = BLOCK,
): Float32Array {
  const out = new Float32Array(samples);
  const block = new Float32Array(blockSize);
  for (let i = 0; i < samples; i += blockSize) {
    generate(block, p);
    out.set(block.subarray(0, Math.min(blockSize, samples - i)), i);
  }
  return out;
}

const audioRate = (samples: number, p: Params, blockSize = BLOCK) =>
  render(createLfo(SAMPLE_RATE, true), samples, p, blockSize);

const controlRate = (samples: number, p: Params, blockSize = BLOCK) =>
  render(createLfo(SAMPLE_RATE, false), samples, p, blockSize);

/** The largest step between adjacent samples. */
function maxStep(signal: Float32Array) {
  let max = 0;
  for (let i = 1; i < signal.length; i++) {
    max = Math.max(max, Math.abs(signal[i] - signal[i - 1]));
  }
  return max;
}

/**
 * The loudest bin within `halfWidth` Hz of `frequency`, in dB below the
 * loudest bin in the whole spectrum.
 *
 * A band and not a single bin, because a zero-order hold does not put energy
 * *at* its own rate: it replicates the held spectrum around every multiple of
 * it, so a 5 Hz sine sampled at 344.53 Hz images at 339.53 and 349.53 and puts
 * a null at 344.53 itself. Reading one bin measures that null and passes for
 * both generators, which is the mistake this comment exists to prevent.
 */
function rejectionDb(signal: Float32Array, frequency: number, halfWidth = 20) {
  const spectrum = magnitudes(signal);
  const perBin = SAMPLE_RATE / (spectrum.length * 2);
  const from = Math.max(1, Math.floor((frequency - halfWidth) / perBin));
  const to = Math.min(
    spectrum.length - 1,
    Math.ceil((frequency + halfWidth) / perBin),
  );

  let peak = 0;
  for (let i = 1; i < spectrum.length; i++) peak = Math.max(peak, spectrum[i]);
  let band = 0;
  for (let i = from; i <= to; i++) band = Math.max(band, spectrum[i]);
  return 20 * Math.log10(peak / (band || Number.MIN_VALUE));
}

describe("the output is a signal", () => {
  // A sine's steepest point is its zero crossing, where it moves at
  // `2*pi*f*gain` per second. One sample of that is the whole budget.
  const SINE_BOUND = (2 * Math.PI * RATE) / SAMPLE_RATE;

  it("steps by no more than one sample's worth of the sine's own slope", () => {
    expect(maxStep(audioRate(4 * CYCLE, params()))).toBeLessThanOrEqual(
      SINE_BOUND * 1.001,
    );
  });

  it("where the block-constant generator steps by a block's worth", () => {
    // Not a regression net - the statement of the bug. 128x the bound above,
    // which is the number in the ticket.
    const step = maxStep(controlRate(4 * CYCLE, params()));
    expect(step).toBeGreaterThan(SINE_BOUND * 100);
    expect(step).toBeLessThanOrEqual(SINE_BOUND * BLOCK * 1.01);
  });

  it("does not depend on the block size", () => {
    const at32 = audioRate(2 * CYCLE, params(), 32);
    const at128 = audioRate(2 * CYCLE, params(), 128);
    const at512 = audioRate(2 * CYCLE, params(), 512);
    expect(Array.from(at128)).toEqual(Array.from(at32));
    expect(Array.from(at512)).toEqual(Array.from(at32));
  });
});

describe("every waveform", () => {
  // The reference: the block-constant generator driven one sample at a time is
  // *by construction* the per-sample signal - same phase increment, same
  // `gen(phase, nextPhase)`, same order of operations. So bit-equality against
  // it is a constant-free statement that the 128-sample render is the same
  // signal, for every shape, without a hand-derived slope bound per waveform.
  //
  // `RandSampleHold` and `Impulse` are excluded and tested below: both are
  // built once at module scope in `dsp.ts`, so their state is shared by every
  // `Lfo` in the process and two renders of them are not independent.
  const STATELESS = [
    LfoType.None,
    LfoType.Sine,
    LfoType.Triangle,
    LfoType.RampUp,
    LfoType.RampDown,
    LfoType.Square,
    LfoType.ExpRampUp,
    LfoType.ExpRampDown,
    LfoType.ExpTriangle,
  ];

  it.each(STATELESS.map((type) => [LfoType[type], type]))(
    "%s renders per sample",
    (_name, type) => {
      const p = params({ type });
      expect(Array.from(audioRate(2 * CYCLE, p))).toEqual(
        Array.from(controlRate(2 * CYCLE, p, 1)),
      );
    },
  );

  it("Impulse emits a single sample, not a whole block", () => {
    const signal = audioRate(2 * CYCLE, params({ type: LfoType.Impulse }));
    const runs: number[] = [];
    let run = 0;
    for (const value of signal) {
      if (value !== 0) run++;
      else if (run) {
        runs.push(run);
        run = 0;
      }
    }
    if (run) runs.push(run);

    // Two cycles, so two or three impulses depending on where the render
    // starts in the shared generator's cycle. Each one sample wide: today
    // `output.fill()` makes every one of them 128 samples wide.
    expect(runs.length).toBeGreaterThanOrEqual(2);
    expect(runs.length).toBeLessThanOrEqual(3);
    expect(runs.every((length) => length === 1)).toBe(true);
  });

  it("RandSampleHold holds one value per cycle", () => {
    // This one does not discriminate: the block-constant generator also
    // re-rolls only at a wrap, because the wrap test is the same. It is here
    // so the shape is covered rather than because it catches the bug.
    const signal = audioRate(
      3 * CYCLE,
      params({ type: LfoType.RandSampleHold }),
    );
    let changes = 0;
    for (let i = 1; i < signal.length; i++) {
      if (signal[i] !== signal[i - 1]) changes++;
    }
    expect(changes).toBeGreaterThanOrEqual(2);
    expect(changes).toBeLessThanOrEqual(4);
  });
});

describe("spectrum", () => {
  // The staircase's fundamental: one step per render quantum is a 344.53 Hz
  // sampler, and its energy is exactly what a-rate output removes.
  const STAIRCASE = SAMPLE_RATE / BLOCK;
  const LENGTH = 65536;

  /**
   * Rejection at the first four multiples of 344.53 Hz, measured on this code
   * at 44.1 kHz over a 65536-sample render of a 5 Hz sine at `gain: 1`:
   *
   * | harmonic | 1     | 2     | 3     | 4     |
   * | a-rate   | 146.0 | 152.3 | 155.6 | 158.0 |
   * | k-rate   |  36.6 |  42.7 |  46.3 |  48.8 |
   *
   * The a-rate column is the `Float32Array`'s own quantisation noise - there
   * is nothing there to measure. 120 dB is a one-sided regression net with
   * 26 dB of headroom; an LFO that gets quieter still needs no edit.
   */
  it("has no energy at the render-quantum rate or its harmonics", () => {
    const signal = audioRate(LENGTH, params());
    for (const harmonic of [1, 2, 3, 4]) {
      expect(rejectionDb(signal, STAIRCASE * harmonic)).toBeGreaterThan(120);
    }
  });

  it("where the block-constant generator has a whole image series there", () => {
    // 100 dB louder than the noise floor, at the fastest part of the waveform.
    // This is the ticket, as a number.
    const signal = controlRate(LENGTH, params());
    expect(rejectionDb(signal, STAIRCASE)).toBeLessThan(60);
  });
});

describe("vibrato, end to end", () => {
  // `MonoSynth` is `vibrato.connect(osc.frequency)` on a carrier, and since #45
  // `PolyblepOscillator.frequency` is a-rate - so the LFO was the last thing
  // quantising that path. Asserted here on the modulator rather than through
  // `MonoSynth`, which needs a real `AudioContext`; the oscillator's own
  // a-rate read is `polyblep-oscillator`'s test.
  const GAIN = 50;
  const CARRIER = 440;

  it("is a clean 5 Hz sinusoid on the carrier", () => {
    const deviation = audioRate(2 * CYCLE, params({ gain: GAIN }));
    const track = Float32Array.from(deviation, (d) => CARRIER + d);

    expect(maxStep(track)).toBeLessThanOrEqual(
      ((2 * Math.PI * RATE * GAIN) / SAMPLE_RATE) * 1.001,
    );
    expect(Math.max(...track)).toBeCloseTo(CARRIER + GAIN, 1);
    expect(Math.min(...track)).toBeCloseTo(CARRIER - GAIN, 1);
  });
});

describe("the control-rate generator", () => {
  // Reachable through `createLfo(sampleRate, false)` and unreachable from the
  // worklet. Kept because a patch with several LFOs per voice may one day want
  // it back as an option; tested so that "kept" means something.
  it("writes one value per block", () => {
    const signal = controlRate(4 * BLOCK, params());
    for (let i = 0; i < signal.length; i += BLOCK) {
      const block = Array.from(signal.subarray(i, i + BLOCK));
      expect(new Set(block).size).toBe(1);
    }
  });

  it("still tracks the waveform block by block", () => {
    const signal = controlRate(8 * BLOCK, params());
    const perBlock = [];
    for (let i = 0; i < signal.length; i += BLOCK) perBlock.push(signal[i]);
    expect(perBlock).toMatchSnapshot();
  });
});
