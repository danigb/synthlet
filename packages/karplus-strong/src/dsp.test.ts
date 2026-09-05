import { createKS, createString } from "./dsp";
import { PARAMS } from "./params";

// The first tests this package has had. A pluck fills the delay line with
// noise, so "did it fire" is "did the output stop being silent".
describe("createKS trigger detection", () => {
  const pluck = (triggers: number[]) => {
    const ks = createKS(44100, 100);
    return triggers.map((trigger) => {
      const output = new Float32Array(64);
      ks(output, trigger, 440, 1);
      return output.some((v) => v !== 0);
    });
  };

  it.each([1, 0.99, 0.5, 0.05])("plucks on a trigger of %p", (trigger) => {
    expect(pluck([trigger])).toEqual([true]);
  });

  it.each([0, -1])("does not pluck on a trigger of %p", (trigger) => {
    expect(pluck([trigger])).toEqual([false]);
  });

  it("does not double-trigger while the trigger is held", () => {
    // The rising edge is the whole rule; the old `>= 1 && prev < 0.9`
    // hysteresis was doing the same job with two constants.
    const ks = createKS(44100, 100);
    const first = new Float32Array(64);
    ks(first, 1, 440, 1);
    const second = new Float32Array(64);
    ks(second, 1, 440, 1);
    // A re-pluck would refill the delay line with fresh noise, so the second
    // block would not continue the first.
    expect(Array.from(second)).not.toEqual(Array.from(first));
    expect(second.some((v) => v !== 0)).toBe(true);
  });

  it("plucks again after the trigger returns to 0", () => {
    const ks = createKS(44100, 100);
    const out = new Float32Array(64);
    ks(out, 1, 440, 1);
    ks(out, 0, 440, 1);
    const before = Array.from(out);
    ks(out, 1, 440, 1);
    expect(Array.from(out)).not.toEqual(before);
  });
});

// ---------------------------------------------------------------------------
// Measurement helpers
//
// They live in this file on purpose. They are not shipped DSP - `index.ts`
// never imports them, so `tsup` never bundles them and `esbuild` never sees
// them - and they are the only reason the assertions below are readable. If a
// second resonator package ever needs them they move to a shared
// `scripts/_metrics.ts`, not before.
//
// Nothing here is fast; every function is written against its textbook
// definition, because the tests that read it are the argument that the module
// works.
// ---------------------------------------------------------------------------

const SAMPLE_RATE = 44100;
const BLOCK = 128;
// Same source `worklet.ts` sizes the delay line from, so these are assertions
// about the shipped node rather than about a literal repeated in a test.
const MIN_FREQUENCY = PARAMS.find((p) => p.name === "frequency")!.minValue;

/** Plucks once and renders `seconds` of output, block by block, as a graph would. */
function pluck(frequency: number, decay: number, seconds: number) {
  const ks = createKS(SAMPLE_RATE, MIN_FREQUENCY);
  const output = new Float32Array(Math.ceil(SAMPLE_RATE * seconds));
  const block = new Float32Array(BLOCK);
  for (let n = 0; n < output.length; n += BLOCK) {
    ks(block, 1, frequency, decay);
    output.set(block.subarray(0, Math.min(BLOCK, output.length - n)), n);
  }
  return output;
}

/** In-place radix-2 Cooley-Tukey FFT; both arrays are the same power-of-two length. */
function fft(re: Float64Array, im: Float64Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const angle = (-2 * Math.PI) / len;
    const wr = Math.cos(angle);
    const wi = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let j = 0; j < len / 2; j++) {
        const high = i + j + len / 2;
        const ar = re[i + j];
        const ai = im[i + j];
        const br = re[high] * cr - im[high] * ci;
        const bi = re[high] * ci + im[high] * cr;
        re[i + j] = ar + br;
        im[i + j] = ai + bi;
        re[high] = ar - br;
        im[high] = ai - bi;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}

const ANALYSIS_WINDOW = 2048; // 46 ms, 21.5 Hz per bin
const BAND_EDGE = 5000; // the audit's, so these numbers stay comparable to its tables

/** Fraction of the energy above `BAND_EDGE` in one window starting at `atSeconds`. */
function highBandRatio(signal: Float32Array, atSeconds: number) {
  const start = Math.round(atSeconds * SAMPLE_RATE);
  const re = new Float64Array(ANALYSIS_WINDOW);
  const im = new Float64Array(ANALYSIS_WINDOW);
  for (let i = 0; i < ANALYSIS_WINDOW; i++) {
    const hann =
      0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (ANALYSIS_WINDOW - 1));
    re[i] = (signal[start + i] ?? 0) * hann;
  }
  fft(re, im);

  let total = 0;
  let high = 0;
  for (let k = 1; k < ANALYSIS_WINDOW / 2; k++) {
    const energy = re[k] * re[k] + im[k] * im[k];
    total += energy;
    if ((k * SAMPLE_RATE) / ANALYSIS_WINDOW > BAND_EDGE) high += energy;
  }
  return total > 0 ? high / total : 0;
}

// The same 5 ms one-pole `dsp.ts` stops on, so "the level the note ended at"
// means the same thing in the test as in the module.
const ENVELOPE_COEFFICIENT = 1 - Math.exp(-1 / (0.005 * SAMPLE_RATE));

/** Seconds for a one-pole envelope of |y| to fall 60 dB below its post-attack peak. */
function t60(signal: Float32Array) {
  const envelope = new Float64Array(signal.length);
  let level = 0;
  for (let i = 0; i < signal.length; i++) {
    level += ENVELOPE_COEFFICIENT * (Math.abs(signal[i]) - level);
    envelope[i] = level;
  }
  const attack = Math.round(0.02 * SAMPLE_RATE);
  let peak = 0;
  for (let i = attack; i < envelope.length; i++) {
    if (envelope[i] > peak) peak = envelope[i];
  }
  for (let i = attack; i < envelope.length; i++) {
    if (envelope[i] < peak / 1000) return i / SAMPLE_RATE;
  }
  return Infinity; // never got there inside the render
}

/**
 * Fundamental in Hz by normalised autocorrelation, taking the *shortest* local
 * peak within 5% of the best rather than the best - the audit's own guard
 * against reading an octave low on a comb signal - then refining it with a
 * parabola, because one whole lag at 1760 Hz is 68 cents and the tolerance
 * below is 5.
 */
function fundamental(signal: Float32Array, frequency: number) {
  const period = SAMPLE_RATE / frequency;
  const minLag = Math.max(2, Math.floor(period * 0.6));
  const maxLag = Math.ceil(period * 1.9);
  const scores = new Float64Array(maxLag + 2);

  let best = -Infinity;
  for (let lag = minLag - 1; lag <= maxLag + 1; lag++) {
    let dot = 0;
    let energyA = 0;
    let energyB = 0;
    for (let i = 0; i + lag < signal.length; i++) {
      dot += signal[i] * signal[i + lag];
      energyA += signal[i] * signal[i];
      energyB += signal[i + lag] * signal[i + lag];
    }
    const norm = Math.sqrt(energyA * energyB);
    scores[lag] = norm > 0 ? dot / norm : 0;
    if (lag >= minLag && lag <= maxLag && scores[lag] > best)
      best = scores[lag];
  }

  let bestLag = minLag;
  for (let lag = minLag; lag <= maxLag; lag++) {
    if (
      scores[lag] >= 0.95 * best &&
      scores[lag] >= scores[lag - 1] &&
      scores[lag] >= scores[lag + 1]
    ) {
      bestLag = lag;
      break;
    }
  }

  const a = scores[bestLag - 1];
  const b = scores[bestLag];
  const c = scores[bestLag + 1];
  const denominator = a - 2 * b + c;
  const refined =
    denominator !== 0 ? bestLag + (0.5 * (a - c)) / denominator : bestLag;
  return SAMPLE_RATE / refined;
}

const cents = (measured: number, target: number) =>
  1200 * Math.log2(measured / target);

/** Energy ratio in dB, floored so a band that empties completely reads as -300. */
const energyDb = (after: number, before: number) =>
  10 * Math.log10(Math.max(after, 1e-30) / Math.max(before, 1e-30));

/** The brightness figure both groups below assert on: 5 ms to 250 ms, in dB. */
function brightnessChangeDb(frequency: number) {
  const signal = pluck(frequency, 1, 0.4);
  return energyDb(highBandRatio(signal, 0.25), highBandRatio(signal, 0.005));
}

// ---------------------------------------------------------------------------
// The resonator. Every defect the audit found is in here rather than in the
// gate, and these are the numbers ticket 03's rewrite has to reproduce exactly
// - defects included - before tickets 04 and 05 are allowed to move them.
// ---------------------------------------------------------------------------

describe("createKS pitch", () => {
  // 30 Hz is the case ticket 01 fixed: the delay line used to be sized for
  // 100 Hz, so everything below it played at 100 Hz.
  it.each([30, 55, 110, 440, 1760])(
    "plays %p Hz within 5 cents of the request",
    (frequency) => {
      const period = SAMPLE_RATE / frequency;
      const signal = pluck(
        frequency,
        1,
        Math.max(0.3, (12 * period) / SAMPLE_RATE),
      );
      expect(
        Math.abs(cents(fundamental(signal, frequency), frequency)),
      ).toBeLessThan(5);
    },
  );
});

describe("createKS decay", () => {
  // The tolerance is not a guess and must not be "tightened": Jarvelainen and
  // Tolonen, "Perceptual Tolerances of Decay Parameters in String Instrument
  // Synthesis", JAES 49(11), 2001, section 3.5, measured that a variation of
  // the time constant between about 75 and 140% of the reference is inaudible,
  // and that the threshold is roughly constant across f0 (they tested 116.86,
  // 196.0, 350.8 and 662.6 Hz). So this band is the exact width of the audible
  // one, and anything outside it is a defect a listener would report.
  //
  // Fails today at all three pitches, by construction: `decay` is a count of
  // periods, not a time, so one knob position gives 40 s at 110 Hz and 2.3 s at
  // 1760 Hz. Ticket 04 makes it seconds.
  it.failing.each([110, 440, 1760])(
    "decays in 75-140%% of the requested time at %p Hz (fixed by ticket 04)",
    (frequency) => {
      const measured = t60(pluck(frequency, 1, 3));
      expect(measured).toBeGreaterThanOrEqual(0.75);
      expect(measured).toBeLessThanOrEqual(1.4);
    },
  );
});

describe("createKS brightness", () => {
  // High partials must die before low ones - that is the whole plucked-string
  // character, and it is what a lowpass in the feedback loop is for. There is
  // no lowpass in this loop; what damps the high end instead is the linear
  // interpolator, whose loss at Nyquist is |1 - 2*frac(sampleRate/frequency)|.
  // So this assertion catches the missing filter and the accidental one at once.
  it.each([439.4, 440.0, 440.6])(
    "loses 20 dB of its band above 5 kHz between 5 ms and 250 ms at %p Hz",
    (frequency) => {
      expect(brightnessChangeDb(frequency)).toBeLessThanOrEqual(-20);
    },
  );

  // The near-integer delays, where `frac` is 0.000 and 0.008 and the
  // interpolator therefore damps nothing. 441.0 Hz measures -0.0 dB and
  // 436.6 Hz -2.7 dB: a permanent bright buzz, one semitone from a pitch that
  // behaves. Ticket 04 puts a real filter in the loop.
  it.failing.each([441.0, 436.6])(
    "loses 20 dB of its band above 5 kHz at the near-integer delay %p Hz (fixed by ticket 04)",
    (frequency) => {
      expect(brightnessChangeDb(frequency)).toBeLessThanOrEqual(-20);
    },
  );
});

describe("createKS timbre versus tuning", () => {
  // Five pitches within 20 cents of each other must be the same instrument.
  // Today they span about 67 dB, because timbre is a function of the fractional
  // part of sampleRate/frequency and nothing chose that. Ticket 04 puts the
  // damping under a knob; ticket 05 replaces the interpolator so it stops
  // contributing damping at all, which is what closes the spread.
  it.failing(
    "damps its high band to within 6 dB across five pitches 20 cents apart (fixed by ticket 05)",
    () => {
      const changes = [439.4, 440.0, 440.6, 441.0, 436.6].map(
        brightnessChangeDb,
      );
      expect(Math.max(...changes) - Math.min(...changes)).toBeLessThanOrEqual(
        6,
      );
    },
  );
});

describe("createKS termination", () => {
  // The stop used to test one instantaneous sample against 1e-8. The signal is
  // noise-derived, so a zero crossing satisfied that at any amplitude: 10 of
  // these 40 plucks were cut off, the loudest at -28 dBFS. Ticket 01 replaced
  // it with an envelope at -100 dBFS.
  it("ends all 40 plucks, none of them above -100 dBFS", () => {
    const CAP_SECONDS = 100; // today's longest observed stop is 69 s
    const endLevels: number[] = [];

    for (let attempt = 0; attempt < 40; attempt++) {
      const ks = createKS(SAMPLE_RATE, MIN_FREQUENCY);
      const block = new Float32Array(BLOCK);
      let level = 0;
      let atLastNonZero = 0;
      let stopped = false;

      for (let n = 0; n < SAMPLE_RATE * CAP_SECONDS; n += BLOCK) {
        ks(block, 1, 440, 5);
        let silent = true;
        for (let i = 0; i < BLOCK; i++) {
          level += ENVELOPE_COEFFICIENT * (Math.abs(block[i]) - level);
          if (block[i] !== 0) {
            silent = false;
            atLastNonZero = level;
          }
        }
        if (silent) {
          stopped = true;
          break;
        }
      }

      expect(stopped).toBe(true);
      endLevels.push(20 * Math.log10(Math.max(atLastNonZero, 1e-30)));
    }

    expect(Math.max(...endLevels)).toBeLessThanOrEqual(-100);
  }, 120_000); // ~45 minutes of audio; `decay = 5` is 50 periods-worth today
});

describe("createKS amplitude", () => {
  // The excitation is `Math.random() * 2 - 1`, the loop gain is below one and
  // linear interpolation is a convex combination of two stored samples, so 1 is
  // the true bound rather than a number picked to make this pass.
  it("stays finite and within full scale across the declared parameter range", () => {
    let peak = 0;
    let nonFinite = 0;
    // Counted rather than asserted per sample: this sweep is a third of a
    // million samples, and 300k `expect` calls cost seconds for no more
    // information than one count does.
    for (const frequency of [20, 30, 55, 110, 440, 1760, 5000, 20000]) {
      for (const decay of [0.01, 0.1, 1, 5]) {
        for (const sample of pluck(frequency, decay, 0.2)) {
          if (!Number.isFinite(sample)) nonFinite++;
          else if (Math.abs(sample) > peak) peak = Math.abs(sample);
        }
      }
    }
    expect(nonFinite).toBe(0);
    expect(peak).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// The structure ticket 03 introduced. These say nothing about the sound - the
// six measurements above are what says the sound did not change - and
// everything about the shape: an excitation that is a signal, a trigger that
// is read per sample, and a loop that is a closure.
// ---------------------------------------------------------------------------

describe("createKS excitation", () => {
  // The rewrite replaced a fill of the whole delay line with a burst of `P`
  // samples summed into the loop input. At 441 Hz the delay is exactly 100
  // samples, so the interpolator is the identity and the two forms reduce to
  // the same statement: *one period of full-scale uniform noise, recirculating
  // at the loop gain*. Both halves of it are asserted here.
  const FREQUENCY = 441; // 44100 / 441 = 100 samples, exactly
  const PERIOD = 100;
  const DECAY = 1;
  const LOOP_GAIN = Math.pow(0.001, 1 / (0.1 * DECAY * SAMPLE_RATE));

  it("excites one period with full-scale noise, as the whole-buffer fill did", () => {
    const signal = pluck(FREQUENCY, DECAY, 0.05);
    const burst = signal.subarray(0, PERIOD);

    let peak = 0;
    let sumOfSquares = 0;
    for (const sample of burst) {
      if (Math.abs(sample) > peak) peak = Math.abs(sample);
      sumOfSquares += sample * sample;
    }
    const rms = Math.sqrt(sumOfSquares / PERIOD);

    expect(peak).toBeLessThanOrEqual(1);
    expect(peak).toBeGreaterThan(0.9); // 100 draws; missing the top decile is a 1e-5 event
    // Uniform on [-1, 1) has an RMS of 1/sqrt(3); 100 samples put it within
    // about 7% of that, so 15% is a loose test of "still full scale".
    expect(rms).toBeGreaterThan(0.85 / Math.sqrt(3));
    expect(rms).toBeLessThan(1.15 / Math.sqrt(3));
  });

  it("then recirculates that period at the loop gain, and nothing else", () => {
    const signal = pluck(FREQUENCY, DECAY, 0.05);
    let worst = 0;
    // Three periods past the burst: if any excitation leaked in after the
    // first `P` samples, or the loop wrote anything but `gain * y`, this is
    // where it shows.
    for (let i = PERIOD; i < 4 * PERIOD; i++) {
      const difference = Math.abs(signal[i] - LOOP_GAIN * signal[i - PERIOD]);
      if (difference > worst) worst = difference;
    }
    expect(worst).toBeLessThan(1e-6); // Float32 storage, not algorithm
  });
});

describe("createKS trigger timing", () => {
  // The descriptor is still k-rate, so this is what every existing caller
  // gets: one value for the block, and the pluck lands on its first sample.
  it.each([1, new Float32Array([1])])(
    "plucks on the first sample of the block when the trigger is k-rate (%p)",
    (trigger) => {
      const output = new Float32Array(BLOCK);
      createKS(SAMPLE_RATE, MIN_FREQUENCY)(output, trigger, 440, 1);
      expect(output[0]).not.toBe(0);
    },
  );

  // And this is what a caller who sets `trigger.automationRate = "a-rate"`
  // gets: the pluck starts where it was scheduled, not up to 2.9 ms later.
  it("starts a pluck mid-block when the trigger is a-rate", () => {
    const AT = 64;
    const trigger = new Float32Array(BLOCK);
    trigger.fill(1, AT);
    const output = new Float32Array(BLOCK);
    createKS(SAMPLE_RATE, MIN_FREQUENCY)(output, trigger, 440, 1);

    expect(Array.from(output.subarray(0, AT))).toEqual(
      Array.from(new Float32Array(AT)),
    );
    expect(output.subarray(AT).some((v) => v !== 0)).toBe(true);
  });
});

describe("createString instances", () => {
  // Ticket 10 needs two of these summed, one per polarization. Nothing here
  // ships that; this only asserts the closure holds no shared state, which is
  // the property that makes it possible.
  const render = (frequency: number, seconds: number) => {
    const string = createString(SAMPLE_RATE, MIN_FREQUENCY);
    string.setLoopGain(Math.pow(0.001, 1 / (0.1 * 1 * SAMPLE_RATE)));
    string.setDelay(SAMPLE_RATE / frequency);
    string.pluck();
    const output = new Float32Array(Math.ceil(SAMPLE_RATE * seconds));
    for (let n = 0; n < output.length; n += BLOCK) {
      string.process(output, n, Math.min(n + BLOCK, output.length));
    }
    return output;
  };

  it("runs two independent strings that can be summed", () => {
    const low = render(220, 0.3);
    const high = render(330, 0.3);

    const sum = new Float32Array(low.length);
    for (let i = 0; i < sum.length; i++) sum[i] = low[i] + high[i];

    expect(sum.every(Number.isFinite)).toBe(true);
    expect(Math.max(...Array.from(sum, Math.abs))).toBeLessThanOrEqual(2);
    // Each still plays its own note, which is the actual claim: neither
    // instance touched the other's delay line.
    expect(Math.abs(cents(fundamental(low, 220), 220))).toBeLessThan(5);
    expect(Math.abs(cents(fundamental(high, 330), 330))).toBeLessThan(5);
  });
});
