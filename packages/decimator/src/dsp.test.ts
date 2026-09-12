import { magnitudes, peakFrequency } from "./_spectrum";
import { BUTTERWORTH_Q, butterworthLowpass } from "./dsp";

/**
 * The decimator, measured on the real processor.
 *
 * Every number here is from Synth Secrets Part 17, the Nyquist lesson. Reid's
 * Figures 15 to 18 are one 10 kHz sine sampled at 50, 25, 13.33 and 11.11 kHz,
 * the last two folding down to 3.33 and 1.11 kHz: *"any frequencies above the
 * Nyquist frequency 'fold over' and appear an equal distance below the Nyquist
 * frequency."* This file is those figures as assertions.
 *
 * Two things about the measurement, both deliberate:
 *
 * - Every window is a **whole second** and every frequency named divides both
 *   44100 and 48000, so `amplitudeAt` below covers an integer number of cycles
 *   and is exact rather than approximate. `magnitudes` is for the other
 *   question - what is the loudest thing in here - where a -92 dB sidelobe
 *   matters and calibration does not.
 * - The processor is driven **block by block**, 128 samples at a time, because
 *   a k-rate parameter arrives once per block. Rendering a second in one call
 *   would be testing a processor no browser would ever run.
 */

const SAMPLE_RATE = 44100;
const BLOCK = 128;

/** `bits` at which the quantiser is skipped. */
const TRANSPARENT = 24;

describe("DecimatorProcessor", () => {
  let Worklet: any;

  beforeAll(async () => {
    createWorkletTestContext(SAMPLE_RATE);
    Worklet = (await import("./worklet")).DecimatorProcessor;
  });

  afterEach(() => {
    createWorkletTestContext(SAMPLE_RATE);
  });

  it("registers processor", () => {
    expect(global.registerProcessor).toHaveBeenCalledWith(
      "DecimatorProcessor",
      Worklet,
    );
  });

  // -------------------------------------------------------------------------
  // Claim 1: sampling below twice the bandwidth aliases.
  // -------------------------------------------------------------------------

  describe.each([
    [13333, 3333, "Figure 17"],
    [11111, 1111, "Figure 18"],
  ])("a 10 kHz sine at %d Hz folds to %d Hz (%s)", (rate, alias) => {
    it.each([44100, 48000])("at %d Hz", (sampleRate) => {
      const [out] = render(Worklet, sampleRate, { input: [sine(10000)], rate });

      // The fold is *the* claim, so it is read the hard way: whatever is
      // loudest in the output, without being told where to look.
      // "within one bin" - literally, against the analysis resolution the
      // measurement actually has rather than a rounder-looking tolerance.
      expect(Math.abs(peakFrequency(out, sampleRate) - alias)).toBeLessThan(
        binWidth(out, sampleRate),
      );

      // "at least as loud as the residual at 10 kHz". It is louder, and by a
      // knowable amount: both are images of the same baseband tone through the
      // hold's sinc aperture, and the aperture is smaller the further up you
      // look. Measured 8.5 dB at 44.1 kHz for rate 13333, 17.7 dB for 11111.
      const folded = amplitudeAt(out, alias, sampleRate);
      const residual = amplitudeAt(out, 10000, sampleRate);
      expect(folded).toBeGreaterThan(residual);
    });

    it("is removed by the anti-alias filter", () => {
      // Claim 2: "you can't remove aliasing once it has been introduced, so we
      // have to ensure that it never occurs... by sticking a low-pass filter in
      // the signal path."
      const [off] = render(Worklet, SAMPLE_RATE, {
        input: [sine(10000)],
        rate,
      });
      const [on] = render(Worklet, SAMPLE_RATE, {
        input: [sine(10000)],
        rate,
        antialias: 1,
      });

      const before = amplitudeAt(off, alias, SAMPLE_RATE);
      const after = amplitudeAt(on, alias, SAMPLE_RATE);
      const removed = 20 * Math.log10(before / after);

      expect(removed).toBeGreaterThan(40);

      // And pinned, so a regression in the filter's alignment is caught here
      // rather than sliding quietly towards the 40 dB floor above. These are
      // the cascade's stopband attenuation at 10 kHz and nothing else: the
      // alias is the filtered residual folded down.
      expect(removed).toBeCloseTo(rate === 13333 ? 44.5 : 58.5, 0);
    });
  });

  // -------------------------------------------------------------------------
  // Claim 3: the samples are not the sound.
  // -------------------------------------------------------------------------

  describe("a 1 kHz sine held at 22.05 kHz images either side of the clock", () => {
    it("puts both images in the band at 48 kHz", () => {
      // 22050 +/- 1000. Both below the 24 kHz Nyquist of a 48 kHz context, so
      // both are separately visible - which is what makes this the rate the
      // claim is measured at.
      const [out] = render(Worklet, 48000, {
        input: [sine(1000)],
        rate: 22050,
      });
      const fundamental = amplitudeAt(out, 1000, 48000);

      for (const [image, expected] of [
        [21050, 26.88],
        [23050, 27.39],
      ]) {
        // `peakNear` answers in whole bins, so the tolerance is one bin -
        // which is what the criterion asks for anyway.
        expect(Math.abs(peakNear(out, image, 48000) - image)).toBeLessThan(
          binWidth(out, 48000),
        );
        const down =
          20 * Math.log10(fundamental / amplitudeAt(out, image, 48000));
        // **Not 20 dB.** The level of a zero-order hold's images is set by its
        // own sinc aperture and by nothing this module chooses: `sinc(f/rate)`
        // relative to `sinc(f0/rate)` is -26.9 dB at 21.05 kHz and -27.4 dB at
        // 23.05 kHz. A staircase's images are quieter than they look on a
        // scope, which is itself part of the lesson.
        expect(down).toBeLessThan(30);
        expect(down).toBeCloseTo(expected, 0);
      }
    });

    it("folds the upper image onto the lower one at 44.1 kHz", () => {
      // 23.05 kHz is above the *host's* 22.05 kHz Nyquist, so in a 44.1 kHz
      // signal it does not exist as a distinct frequency: it folds to
      // 44100 - 23050 = 21050 and adds to the image already there. The module
      // under test aliasing inside the test's own measurement is the chapter
      // happening twice, and the docs page says so.
      const [out] = render(Worklet, SAMPLE_RATE, {
        input: [sine(1000)],
        rate: 22050,
      });
      const fundamental = amplitudeAt(out, 1000, SAMPLE_RATE);
      const down =
        20 * Math.log10(fundamental / amplitudeAt(out, 21050, SAMPLE_RATE));

      expect(down).toBeLessThan(30);
      expect(down).toBeCloseTo(22.93, 0);
    });

    it.each([44100, 48000])(
      "is a sine again with the reconstruction filter, at %d Hz",
      (sampleRate) => {
        const input = sine(1000);
        const [out] = render(Worklet, sampleRate, {
          input: [input],
          rate: 22050,
          reconstruct: 1,
        });
        const fundamental = amplitudeAt(out, 1000, sampleRate);

        for (const image of [21050, 23050]) {
          if (image > sampleRate / 2) continue;
          const down =
            20 * Math.log10(fundamental / amplitudeAt(out, image, sampleRate));
          // Measured 98 dB and more. The corner is 9.9 kHz and the image is at
          // 21 kHz, which is where an 8th-order Butterworth has nothing left.
          expect(down).toBeGreaterThan(40);
        }

        // "The staircase is a sine again": the energy is not merely moved out
        // of the images, it is back in the fundamental. Measured -0.022 dB.
        const reference = Float32Array.from({ length: out.length }, (_, i) =>
          input(i, sampleRate),
        );
        const change = 20 * Math.log10(rms(out) / rms(reference));
        expect(Math.abs(change)).toBeLessThan(1);
      },
    );
  });

  // -------------------------------------------------------------------------
  // Bit depth: Reid's Table 1.
  // -------------------------------------------------------------------------

  describe("bits are bits", () => {
    it("puts a 6-bit converter's codes on the output, and only those", () => {
      const input = sine(1000);
      const [out] = render(Worklet, SAMPLE_RATE, {
        input: [input],
        rate: SAMPLE_RATE,
        bits: 6,
      });

      const q = 32; // 2^(6-1)
      const levels = new Set<number>();
      let worst = 0;
      let offGrid = 0;
      for (let i = 0; i < out.length; i++) {
        if (!Number.isInteger(out[i] * q)) offGrid++;
        levels.add(out[i] + 0);
        worst = Math.max(worst, Math.abs(out[i] - input(i, SAMPLE_RATE)));
      }

      // Every output is a code, not merely a nearby number.
      expect(offGrid).toBe(0);

      // **65, not the 64 Reid's table has.** Mid-tread rounding puts a level
      // *on* zero rather than a band edge, so silence stays silence, and the
      // price is that the codes run -32 ... +32 inclusive. It is the same
      // off-by-one as `bits: 1` giving three levels rather than two, and the
      // same one every mid-tread quantiser has. Clamping the code the way
      // two's complement does would buy exactly 64 and cost a half-band error
      // at full scale, which is the assertion on the next line.
      expect(levels.size).toBe(65);

      // Every sample within half a band of the input: 1/64 for 6 bits.
      expect(worst).toBeLessThanOrEqual(1 / 64);
      expect(worst).toBeCloseTo(1 / 64, 3);
    });

    it("has three levels at bits: 1, and nothing else", () => {
      const [out] = render(Worklet, SAMPLE_RATE, {
        input: [sine(1000)],
        rate: SAMPLE_RATE,
        bits: 1,
      });
      // `+ 0` normalises the negative zero `Math.round(-0.3)` produces, which
      // `toEqual` distinguishes from zero and a listener does not.
      expect(
        [...new Set(Array.from(out, (v) => v + 0))].sort((a, b) => a - b),
      ).toEqual([-1, 0, 1]);
    });

    it("takes a fractional bit depth, so a crush is smooth", () => {
      // `bits` is continuous: the point of it is a slider from 24 to 2 rather
      // than 22 steps, so a fractional value has to mean a fractional number
      // of levels rather than throwing or snapping.
      const counts = [4, 4.5, 5].map((bits) => {
        const [out] = render(Worklet, SAMPLE_RATE, {
          input: [sine(1000)],
          rate: SAMPLE_RATE,
          bits,
        });
        return new Set(out).size;
      });
      expect(counts[0]).toBeLessThan(counts[1]);
      expect(counts[1]).toBeLessThan(counts[2]);
    });
  });

  // -------------------------------------------------------------------------
  // The bypass, the two rates, and the two channels.
  // -------------------------------------------------------------------------

  describe("the bypass", () => {
    it.each([44100, 48000])("is bit-identical at %d Hz", (sampleRate) => {
      const input = sine(1000);
      const [out] = render(Worklet, sampleRate, {
        input: [input],
        rate: sampleRate,
        bits: TRANSPARENT,
        warmup: 0,
        length: BLOCK * 16,
      });

      const reference = Float32Array.from({ length: out.length }, (_, i) =>
        input(i, sampleRate),
      );
      // Not "within 1e-6": the three short-circuits mean no arithmetic happens
      // at all, so anything short of equality would be a bug.
      expect(Array.from(out)).toEqual(Array.from(reference));
    });

    it("is a bypass above the context's rate too", () => {
      // `rate` runs to 192000 and a descriptor cannot know the context's rate,
      // so everything at or above it has to behave the same way.
      const input = sine(1000);
      const [out] = render(Worklet, SAMPLE_RATE, {
        input: [input],
        rate: 192000,
        warmup: 0,
        length: BLOCK * 8,
      });
      const reference = Float32Array.from({ length: out.length }, (_, i) =>
        input(i, SAMPLE_RATE),
      );
      expect(Array.from(out)).toEqual(Array.from(reference));
    });
  });

  it("holds every channel on the same clock", () => {
    // A stereo converter has two inputs and one crystal. So the right channel
    // being exactly half the left, sample for sample, is the assertion: a
    // per-channel accumulator would latch the two on different samples and
    // decorrelate a stereo image for no reason at all.
    const [left, right] = render(Worklet, SAMPLE_RATE, {
      input: [sine(1000), sine(1000, 0.5)],
      rate: 13333,
    });

    expect(left.length).toBe(right.length);
    for (let i = 0; i < left.length; i += 97) {
      expect(right[i]).toBeCloseTo(left[i] / 2, 6);
    }
    // Not vacuous: the channels are actually being held.
    expect(new Set(left.subarray(0, 1000)).size).toBeLessThan(1000 / 3);
  });

  it("keeps the filter states apart, one set per channel", () => {
    // The clock is shared; the filters are not. A single shared cascade would
    // interleave two channels' samples into one filter and give neither of
    // them the response it asked for.
    const [left, right] = render(Worklet, SAMPLE_RATE, {
      input: [sine(1000), sine(1000, 0.5)],
      rate: 22050,
      antialias: 1,
      reconstruct: 1,
    });
    for (let i = 0; i < left.length; i += 97) {
      expect(right[i]).toBeCloseTo(left[i] / 2, 6);
    }
  });

  // -------------------------------------------------------------------------
  // Silence, and the denormals it decays through.
  // -------------------------------------------------------------------------

  describe("silence is silence", () => {
    it("is all zeros with nothing connected", () => {
      const [out] = render(Worklet, SAMPLE_RATE, {
        input: [],
        outputs: 1,
        rate: 13333,
        bits: 6,
        antialias: 1,
        reconstruct: 1,
        warmup: 0,
        length: BLOCK * 16,
      });
      expect(Array.from(out)).toEqual(Array.from(new Float32Array(out.length)));
    });

    it("stays exactly zero for 60 s after a signal, with both filters on", () => {
      // Every biquad in both cascades is decaying towards zero, and a cascade
      // decaying towards zero runs entirely in denormals unless something
      // stops it - measured, the reconstruction filter's state reaches 5e-324
      // a second after the signal stops. `dsp.ts`'s `FLUSH` is what stops it,
      // and it is a flush rather than the library's usual injected `DENORMAL`
      // precisely so that this assertion can be *equality with zero*.
      const worklet = new Worklet();
      const params = {
        rate: [13333],
        bits: [6],
        antialias: [1],
        reconstruct: [1],
      };
      const input = new Float32Array(BLOCK);
      const output = new Float32Array(BLOCK);

      // One second of full-scale signal, to charge every section.
      for (let at = 0; at < SAMPLE_RATE; at += BLOCK) {
        for (let i = 0; i < BLOCK; i++) {
          input[i] = Math.sin((2 * Math.PI * 1000 * (at + i)) / SAMPLE_RATE);
        }
        worklet.process([[input]], [[output]], params);
      }

      input.fill(0);
      const started = Date.now();
      let worstAfterSettling = 0;
      let finite = true;
      const blocks = Math.round((60 * SAMPLE_RATE) / BLOCK);
      for (let block = 0; block < blocks; block++) {
        output.fill(0);
        worklet.process([[input]], [[output]], params);
        for (let i = 0; i < BLOCK; i++) {
          if (!Number.isFinite(output[i])) finite = false;
          // The first second is the tail the filters legitimately still have.
          if (block > SAMPLE_RATE / BLOCK) {
            const value = Math.abs(output[i]);
            if (value > worstAfterSettling) worstAfterSettling = value;
          }
        }
      }
      const elapsed = Date.now() - started;

      expect(finite).toBe(true);
      expect(worstAfterSettling).toBe(0);
      // Sixty seconds of audio through eight biquads in well under a second of
      // wall clock. A denormal stall is a factor of ten or more, so this is not
      // a tight bound and does not need to be.
      expect(elapsed).toBeLessThan(5000);
    }, 60000);
  });

  // -------------------------------------------------------------------------
  // The filter itself, checked against its own definition.
  // -------------------------------------------------------------------------

  describe("the filter is an 8th-order Butterworth", () => {
    it("uses the standard even-order pole Qs", () => {
      // 1 / (2 cos((2k+1) pi / 16)). Written out so that a transcription error
      // in `dsp.ts` is a failure here rather than a filter that is merely a
      // bit wrong.
      expect(
        Array.from(BUTTERWORTH_Q).map((q) => Number(q.toFixed(6))),
      ).toEqual([0.509796, 0.601345, 0.899976, 2.562915]);
    });

    it("is -3 dB at its corner, not -12", () => {
      // The difference between the true 8th-order alignment and four identical
      // Q = 0.7071 sections, which would also be "48 dB/octave" and would be
      // 12 dB down here. A reconstruction filter has to be flat in the band it
      // keeps, or the RMS assertion above would be measuring a tone control.
      const corner = 6000;
      expect(cascadeGainDb(corner, corner, SAMPLE_RATE)).toBeCloseTo(-3.01, 1);
      expect(cascadeGainDb(corner / 4, corner, SAMPLE_RATE)).toBeCloseTo(0, 2);
    });

    it("is derived from the sample rate, so the corner is a corner", () => {
      // The coefficients come from `sampleRate` rather than being constants,
      // so 6000 Hz means 6000 Hz at both host rates instead of meaning the
      // same number of radians. That is what makes every alias and image
      // figure above hold at 48 kHz as well as at 44.1.
      for (const sampleRate of [44100, 48000]) {
        expect(cascadeGainDb(6000, 6000, sampleRate)).toBeCloseTo(-3.01, 1);
        expect(cascadeGainDb(1500, 6000, sampleRate)).toBeCloseTo(0, 2);
      }

      // What is *not* rate-independent is the stopband, and it is worth
      // pinning rather than glossing: the bilinear transform puts a double
      // zero at Nyquist in every section, so the same corner is steeper the
      // closer the measurement sits to the host's Nyquist. At 10 kHz with a
      // 6 kHz corner that is 44.5 dB at 44.1 kHz and 42.8 dB at 48 kHz - a
      // 1.6 dB difference, and the reason the anti-alias assertions above are
      // pinned per rate instead of sharing one number.
      expect(cascadeGainDb(10000, 6000, 44100)).toBeCloseTo(-44.46, 1);
      expect(cascadeGainDb(10000, 6000, 48000)).toBeCloseTo(-42.84, 1);
    });
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A sine of `frequency` Hz, `amplitude` tall, as a function of sample index. */
function sine(frequency: number, amplitude = 1) {
  return (i: number, sampleRate: number) =>
    amplitude * Math.sin((2 * Math.PI * frequency * i) / sampleRate);
}

type RenderOptions = {
  /** One function per input channel. Empty means nothing is connected. */
  input: ((i: number, sampleRate: number) => number)[];
  /** Output channels the host allocated. Web Audio allocates them whether or
   *  not anything is connected, which is how "nothing connected" is testable. */
  outputs?: number;
  rate: number;
  bits?: number;
  antialias?: number;
  reconstruct?: number;
  /** Samples rendered and discarded so the filters settle. One second. */
  warmup?: number;
  /** Samples kept. One second by default: a whole number of cycles of every
   *  frequency in this file, so `amplitudeAt` is exact. */
  length?: number;
};

/**
 * Drives the processor block by block, the way a graph does, and returns its
 * output channels.
 */
function render(Worklet: any, sampleRate: number, options: RenderOptions) {
  // Set before construction, not after: the processor reads the global
  // `sampleRate` once, in its constructor, which is exactly how a real one
  // learns its context's rate.
  createWorkletTestContext(sampleRate);
  const worklet: any = new Worklet();

  const warmup = options.warmup ?? sampleRate;
  const length = options.length ?? sampleRate;
  const total = warmup + length;
  const count = options.input.length;
  const outCount = options.outputs ?? Math.max(1, count);

  const kept = Array.from({ length: outCount }, () => new Float32Array(total));
  const input = Array.from({ length: count }, () => new Float32Array(BLOCK));
  const output = Array.from(
    { length: outCount },
    () => new Float32Array(BLOCK),
  );

  const params = {
    rate: [options.rate],
    bits: [options.bits ?? TRANSPARENT],
    antialias: [options.antialias ?? 0],
    reconstruct: [options.reconstruct ?? 0],
  };

  for (let at = 0; at < total; at += BLOCK) {
    const size = Math.min(BLOCK, total - at);
    // Web Audio hands a processor a zeroed output block every quantum.
    for (const block of output) block.fill(0);
    for (let i = 0; i < size; i++) {
      for (let c = 0; c < count; c++) {
        input[c][i] = options.input[c](at + i, sampleRate);
      }
    }

    const views = (blocks: Float32Array[]) =>
      size === BLOCK ? blocks : blocks.map((b) => b.subarray(0, size));
    const viewed = views(output);
    worklet.process([views(input)], [viewed], params);
    for (let c = 0; c < outCount; c++) kept[c].set(viewed[c], at);
  }

  return kept.map((channel) => channel.subarray(warmup));
}

/**
 * The amplitude of a sinusoid at `frequency`, by correlation against it.
 *
 * Exact rather than approximate: every window this file measures is a whole
 * second and every frequency in it divides both host rates, so the analysis
 * covers an integer number of cycles and there is no leakage to window away.
 */
function amplitudeAt(
  signal: ArrayLike<number>,
  frequency: number,
  sampleRate: number,
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

/** Width of one analysis bin, which is what "within one bin" means. */
function binWidth(signal: ArrayLike<number>, sampleRate: number) {
  return sampleRate / (magnitudes(signal).length * 2);
}

/**
 * The frequency of the largest magnitude bin within 200 Hz of `around`.
 *
 * `peakFrequency` reads whatever is loudest in the whole spectrum, which is
 * the right question for a fold and the wrong one for an image sitting 27 dB
 * below the fundamental.
 */
function peakNear(
  signal: ArrayLike<number>,
  around: number,
  sampleRate: number,
) {
  const spectrum = magnitudes(signal);
  const n = spectrum.length * 2;
  const width = sampleRate / n;
  const from = Math.max(1, Math.floor((around - 200) / width));
  const to = Math.min(spectrum.length - 1, Math.ceil((around + 200) / width));

  let best = from;
  for (let k = from; k <= to; k++) if (spectrum[k] > spectrum[best]) best = k;
  return best * width;
}

function rms(signal: ArrayLike<number>) {
  let sum = 0;
  for (let i = 0; i < signal.length; i++) sum += signal[i] * signal[i];
  return Math.sqrt(sum / signal.length);
}

/** The cascade's magnitude response at `frequency`, in dB, by z-transform. */
function cascadeGainDb(frequency: number, corner: number, sampleRate: number) {
  const coefficients = butterworthLowpass(corner, sampleRate);
  const w = (2 * Math.PI * frequency) / sampleRate;
  const cos1 = Math.cos(w);
  const sin1 = Math.sin(w);
  const cos2 = Math.cos(2 * w);
  const sin2 = Math.sin(2 * w);

  let gain = 1;
  for (let s = 0; s < 4; s++) {
    const [b0, b1, b2, a1, a2] = Array.from(
      coefficients.subarray(s * 5, s * 5 + 5),
    );
    const nRe = b0 + b1 * cos1 + b2 * cos2;
    const nIm = -(b1 * sin1 + b2 * sin2);
    const dRe = 1 + a1 * cos1 + a2 * cos2;
    const dIm = -(a1 * sin1 + a2 * sin2);
    gain *= Math.hypot(nRe, nIm) / Math.hypot(dRe, dIm);
  }
  return 20 * Math.log10(gain);
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
