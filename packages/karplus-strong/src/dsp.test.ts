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

/**
 * Plucks once and renders `seconds` of output, block by block, as a graph
 * would. The excitation arguments default to `params.ts`'s defaults, exactly
 * as `createKS` does, so every measurement below is a measurement of the
 * shipped sound unless it says otherwise.
 */
function pluck(
  frequency: number,
  decay: number,
  seconds: number,
  brightness = 0.5,
  level = 0.5,
  dynamics = 0.5,
  position = 0.13,
  pickAngle = 0,
) {
  const ks = createKS(SAMPLE_RATE, MIN_FREQUENCY);
  const output = new Float32Array(Math.ceil(SAMPLE_RATE * seconds));
  const block = new Float32Array(BLOCK);
  for (let n = 0; n < output.length; n += BLOCK) {
    ks(
      block,
      1,
      frequency,
      decay,
      brightness,
      level,
      dynamics,
      position,
      pickAngle,
    );
    output.set(block.subarray(0, Math.min(BLOCK, output.length - n)), n);
  }
  return output;
}

/** The excitation chain switched off: the burst ticket 03 summed in, unshaped. */
const NEUTRAL = [1, 1, 0, 0] as const;

const peakOf = (signal: Float32Array) => {
  let peak = 0;
  for (const sample of signal)
    if (Math.abs(sample) > peak) peak = Math.abs(sample);
  return peak;
};

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

/** Energy per bin of one Hann-windowed window of `size` samples from `start`. */
function spectrum(signal: Float32Array, start: number, size: number) {
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  for (let i = 0; i < size; i++) {
    const hann = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1));
    re[i] = (signal[start + i] ?? 0) * hann;
  }
  fft(re, im);
  const energy = new Float64Array(size / 2);
  for (let k = 0; k < size / 2; k++) energy[k] = re[k] * re[k] + im[k] * im[k];
  return energy;
}

/**
 * Fraction of the energy above `BAND_EDGE` in one window starting at
 * `atSeconds`. `size` is the window: the default 2048 is 46 ms, and the
 * excitation assertions use a short one because the pick-direction filter's
 * whole effect is over in a few milliseconds.
 */
function highBandRatio(
  signal: Float32Array,
  atSeconds: number,
  size = ANALYSIS_WINDOW,
) {
  const energy = spectrum(signal, Math.round(atSeconds * SAMPLE_RATE), size);
  let total = 0;
  let high = 0;
  for (let k = 1; k < size / 2; k++) {
    total += energy[k];
    if ((k * SAMPLE_RATE) / size > BAND_EDGE) high += energy[k];
  }
  return total > 0 ? high / total : 0;
}

/** Energy-weighted mean frequency of one window - "how bright is the attack". */
function spectralCentroid(signal: Float32Array, start: number, size: number) {
  const energy = spectrum(signal, start, size);
  let weighted = 0;
  let total = 0;
  for (let k = 1; k < size / 2; k++) {
    weighted += ((k * SAMPLE_RATE) / size) * energy[k];
    total += energy[k];
  }
  return total > 0 ? weighted / total : 0;
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
 * `t60` averaged over enough plucks for the estimate to be stable.
 *
 * The excitation is a fresh noise burst every time, and what the follower ends
 * up timing is the burst's slowest-decaying component, whose level is a random
 * draw: at 1760 Hz, where the burst is 24 samples long, one pluck reads
 * anywhere between 0.61 and 1.02 of the requested time, and at 110 Hz, where
 * it is 400, between 0.80 and 0.88. The decay time is a property of the string
 * rather than of one draw, so the assertions below average it.
 */
const T60_PLUCKS = 32;
function averageT60(frequency: number, decay: number, brightness = 0.5) {
  let total = 0;
  for (let i = 0; i < T60_PLUCKS; i++) {
    total += t60(pluck(frequency, decay, Math.max(3, 3 * decay), brightness));
  }
  return total / T60_PLUCKS;
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

/**
 * Fundamental in Hz from the spectrum, for pitches the estimator above cannot
 * resolve. Autocorrelation refines a peak sampled at integer lags, and at the
 * top of the declared range one lag is 240 cents, so no amount of parabolic
 * refinement measures a 5 cent error there. This is bin-limited instead:
 * 16384 points is 2.7 Hz per bin, under a cent at 5 kHz, and refining the
 * log-magnitude peak takes it well below that. It agrees with `fundamental`
 * where both work, and is the more accurate of the two - the 1.4 cents the
 * autocorrelation reports at 440 Hz is its own resolution, not the string's.
 */
const SPECTRAL_WINDOW = 16384;
function spectralFundamental(
  signal: Float32Array,
  expected: number,
  // A shorter window, placed anywhere, is how the pitch of a *moving* string
  // gets measured: 4096 points is 93 ms, over which a one-octave-per-second
  // slide moves 111 cents, and the peak of that chirp sits at its mean.
  start = Math.round(0.02 * SAMPLE_RATE),
  size = SPECTRAL_WINDOW,
) {
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  for (let i = 0; i < size; i++) {
    const hann = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1));
    re[i] = (signal[start + i] ?? 0) * hann;
  }
  fft(re, im);

  const bin = (frequency: number) => (frequency * size) / SAMPLE_RATE;
  const magnitude = (k: number) =>
    Math.sqrt(re[k] * re[k] + im[k] * im[k]) + 1e-30;
  const lowest = Math.max(1, Math.floor(bin(expected * 0.75)));
  const highest = Math.min(size / 2 - 2, Math.ceil(bin(expected * 1.3)));

  let peak = lowest;
  for (let k = lowest; k <= highest; k++) {
    if (magnitude(k) > magnitude(peak)) peak = k;
  }
  const a = Math.log(magnitude(peak - 1));
  const b = Math.log(magnitude(peak));
  const c = Math.log(magnitude(peak + 1));
  const denominator = a - 2 * b + c;
  const refined =
    denominator !== 0 ? peak + (0.5 * (a - c)) / denominator : peak;
  return (refined * SAMPLE_RATE) / size;
}

/**
 * Runs `render` with `Math.random` replaced by a seeded generator, so two
 * renders can be given the *same* excitation. Every measurement here is made
 * on a fresh noise burst, and comparing two pitches each with its own draw
 * measures the draw as much as the pitch; seeding turns that into a paired
 * comparison, where the draw cancels and what is left is the difference the
 * assertion is about.
 */
function withSeededNoise<T>(seed: number, render: () => T): T {
  const original = Math.random;
  let state = seed >>> 0;
  Math.random = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 4294967296;
  };
  try {
    return render();
  } finally {
    Math.random = original;
  }
}

const cents = (measured: number, target: number) =>
  1200 * Math.log2(measured / target);

/** Energy ratio in dB, floored so a band that empties completely reads as -300. */
const energyDb = (after: number, before: number) =>
  10 * Math.log10(Math.max(after, 1e-30) / Math.max(before, 1e-30));

/**
 * Runs `render` with `Math.random` stubbed so the noise burst is `+1, -1` and
 * then silence - a two-sample impulse, whose sum is zero, so the zero-mean
 * subtraction in `pluck` leaves it alone. What the excitation chain then emits
 * is its own impulse response, and it is finite and short.
 */
function withImpulseBurst<T>(render: () => T): T {
  const original = Math.random;
  let call = 0;
  Math.random = () => (call++ === 0 ? 1 : call === 2 ? 0 : 0.5);
  try {
    return render();
  } finally {
    Math.random = original;
  }
}

/**
 * Where the pick-position comb's first notch actually lands, in Hz.
 *
 * Measured on the excitation's impulse response rather than on a pluck: the
 * response is only `floor(beta*P) + 2` samples long and the loop returns
 * nothing for a whole period, so the first `P - 4` output samples contain all
 * of it and nothing else. Zero-padding a complete finite response is the exact
 * DTFT - no window, no leakage - which matters because a comb notch is a null,
 * and a null is the one place where a few percent of leakage moves the answer
 * by a few percent. The `+1, -1` burst puts a `1 - z^-1` tilt on the response,
 * which has no zero anywhere but dc and so cannot move this one.
 */
const NOTCH_WINDOW = 8192;
function combNotch(frequency: number, position: number) {
  const period = SAMPLE_RATE / frequency;
  const signal = withImpulseBurst(() =>
    pluck(frequency, 1, 0.05, 0.5, 1, 1, position, 0),
  );
  const re = new Float64Array(NOTCH_WINDOW);
  const im = new Float64Array(NOTCH_WINDOW);
  for (let i = 0; i < Math.floor(period) - 4; i++) re[i] = signal[i];
  fft(re, im);

  const magnitude = (k: number) =>
    Math.sqrt(re[k] * re[k] + im[k] * im[k]) + 1e-30;
  const target = frequency / position;
  const bin = (hz: number) => (hz * NOTCH_WINDOW) / SAMPLE_RATE;
  const lowest = Math.max(1, Math.floor(bin(target * 0.6)));
  const highest = Math.min(NOTCH_WINDOW / 2 - 2, Math.ceil(bin(target * 1.5)));
  let notch = lowest;
  for (let k = lowest; k <= highest; k++) {
    if (magnitude(k) < magnitude(notch)) notch = k;
  }
  const a = Math.log(magnitude(notch - 1));
  const b = Math.log(magnitude(notch));
  const c = Math.log(magnitude(notch + 1));
  const denominator = a - 2 * b + c;
  const refined =
    denominator !== 0 ? notch + (0.5 * (a - c)) / denominator : notch;
  return (refined * SAMPLE_RATE) / NOTCH_WINDOW;
}

/**
 * The decay time the loop's own transfer function predicts for the
 * fundamental: `rho` once per period, times the damping filter's gain there.
 * `decay` is derived from `rho` alone - Smith's formula - so this is the same
 * number for every pitch only while the filter is transparent.
 */
function predictedT60(frequency: number, decay: number, brightness: number) {
  const rho = Math.pow(0.001, 1 / (frequency * decay));
  const h0 = (1 + brightness) / 2;
  const h1 = (1 - brightness) / 4;
  const perPeriod =
    rho * (h0 + 2 * h1 * Math.cos((2 * Math.PI * frequency) / SAMPLE_RATE));
  return Math.log(0.001) / Math.log(perPeriod) / frequency;
}

/** The brightness figure both groups below assert on: 5 ms to 250 ms, in dB. */
function brightnessChangeDb(frequency: number, brightness = 0.5) {
  const signal = pluck(frequency, 1, 0.4, brightness);
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
  // It used to fail at all three pitches, by construction: `decay` was a count
  // of periods, not a time, so one knob position gave 40 s at 110 Hz and 2.3 s
  // at 1760 Hz. `rho = 0.001^(1/(f0*t60))` is applied once per period, which
  // makes the same number mean the same seconds at every pitch.
  //
  // This measurement used to be timing a DC residue rather than the string.
  // The damping filter's taps sum to 1 at every brightness, so a DC offset in
  // the burst decays at exactly `rho` and outlives every partial - and
  // `Math.random()*2-1` has a mean of order 1/sqrt(P) per draw, so every pluck
  // injected one. At 1760 Hz the same knob position read anywhere between 0.36
  // and 1.02 of the requested second depending on the draw, and its average,
  // 0.89, was the residue rather than the tone. Ticket 07 makes the burst
  // zero-mean, so what is timed below is the string: the per-pluck spread at
  // 1760 Hz is now 0.30 to 0.35.
  //
  // Which exposes what the residue was hiding. `rho = 0.001^(1/(f0*t60))` is
  // Smith's formula and it accounts for the loop gain at dc, not at f0; the
  // two-zero damping filter takes its own bite there, `h0 + 2*h1*cos(w0)`,
  // which is 0.99997 at 110 Hz, 0.9995 at 440 and 0.9922 at 1760. So at the
  // shipped brightness a 1 s `decay` is 0.33 s at 1760 Hz, and no arithmetic
  // available here fixes it: `rho/(h0 + 2*h1*cos(w0))` is 1.0039, a loop gain
  // above one at dc, and a symmetric three-tap can only have unity gain at w0
  // by having `h1 = 0`, which is brightness 1 and no damping at all. The fix
  // is a per-note loop-filter design (Bank and Valimaki 2003), which the
  // folder README defers. So it is measured here rather than hidden: the two
  // assertions below say what the module does, in the same 75-140% band.
  it.each([110, 440, 1760])(
    "decays in 75-140%% of the requested time at %p Hz, where nothing but `rho` damps it",
    (frequency) => {
      // brightness 1: the damping filter degenerates to a plain delay, the
      // loop's per-period gain is exactly `rho`, and `decay` is the time it
      // says at every pitch. Measured 0.971 / 0.960 / 0.968.
      const measured = averageT60(frequency, 1, 1);
      expect(measured).toBeGreaterThanOrEqual(0.75);
      expect(measured).toBeLessThanOrEqual(1.4);
    },
  );

  it.each([110, 440, 1760])(
    "decays in 75-140%% of what the loop's own gain predicts at %p Hz",
    (frequency) => {
      // And at the shipped brightness the string decays as the loop filter
      // says it should, which is the tighter statement. Measured 0.86 / 0.87 /
      // 1.02 of prediction, where the predictions are 1.00 / 0.97 / 0.33 s.
      const ratio = averageT60(frequency, 1) / predictedT60(frequency, 1, 0.5);
      expect(ratio).toBeGreaterThanOrEqual(0.75);
      expect(ratio).toBeLessThanOrEqual(1.4);
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

  // The near-integer delays, where `frac` is 0.000 and 0.008 so the
  // interpolator damps nothing at all. 441.0 Hz used to measure -0.0 dB and
  // 436.6 Hz -2.7 dB: a permanent bright buzz, one semitone from a pitch that
  // behaved. They pass now for the same reason every other pitch does - there
  // is a filter in the loop, and it does not depend on the tuning.
  it.each([441.0, 436.6])(
    "loses 20 dB of its band above 5 kHz at the near-integer delay %p Hz",
    (frequency) => {
      expect(brightnessChangeDb(frequency)).toBeLessThanOrEqual(-20);
    },
  );
});

describe("createKS timbre versus tuning", () => {
  // Five pitches within 20 cents of each other must be the same instrument.
  // They used to span 67 dB before there was a filter in the loop and 52.7 dB
  // after, because the two-point interpolator damped by `|1 - 2*frac|` per
  // period and so timbre was a function of the fractional part of
  // sampleRate/frequency. The five-tap Lagrange read has no such dependence,
  // and the systematic spread is now about 1 dB.
  //
  // Seeded, because the measurement's own noise is several dB per pluck and
  // would otherwise swamp what is being measured: with one excitation shared
  // across the five pitches the comparison is paired, and 16 seeds keep the
  // test from being an argument about one lucky draw. The spread within a
  // seed is 0.4-4.9 dB with a mean of 1.9; the level *between* seeds moves by
  // 14 dB, which is the noise this pairing removes.
  it("damps its high band to within 6 dB across five pitches 20 cents apart", () => {
    const SEEDS = 16;
    let total = 0;
    for (let seed = 1; seed <= SEEDS; seed++) {
      const changes = [439.4, 440.0, 440.6, 441.0, 436.6].map((frequency) =>
        withSeededNoise(seed, () => brightnessChangeDb(frequency)),
      );
      total += Math.max(...changes) - Math.min(...changes);
    }
    expect(total / SEEDS).toBeLessThanOrEqual(6);
  });
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
    for (const frequency of [20, 30, 55, 110, 440, 1760, 3000, 5000]) {
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
  // The excitation is a burst summed into the loop input rather than a fill of
  // the whole delay line. At 441 Hz the round trip is exactly 100 samples, so
  // the interpolator is the identity and what the loop does can be written
  // down exactly: one period of full-scale noise, then that period cycling
  // through the damping filter and nothing else.
  //
  // The first two assertions are made at the excitation chain's *neutral*
  // settings, which is what ticket 07 owes the reader: with no level change,
  // no dynamic filter, no comb and no pick angle, the burst is the one ticket
  // 03 summed in, to the sample. What the shipped settings do to it is
  // measured further down; that they do not leak into the loop afterwards is
  // the third assertion here.
  const FREQUENCY = 441; // 44100 / 441 = 100 samples, exactly
  const PERIOD = 100;
  // One of those samples is the damping filter's phase delay, so the read
  // distance - and the burst - is one shorter than the period.
  const BURST = PERIOD - 1;
  const DECAY = 1;
  const BRIGHTNESS = 0.5;
  const RHO = Math.pow(0.001, 1 / (FREQUENCY * DECAY));
  const H0 = (1 + BRIGHTNESS) / 2;
  const H1 = (1 - BRIGHTNESS) / 4;

  it("excites one period with full-scale noise, unshaped", () => {
    // Averaged over eight bursts: the RMS of 99 uniform draws has a standard
    // deviation of 7%, which is most of the 15% band this used to assert on a
    // single one - about one run in thirty landed outside it. Eight brings the
    // standard error to 2.5%.
    const BURSTS = 8;
    let peak = 0;
    let rms = 0;
    for (let attempt = 0; attempt < BURSTS; attempt++) {
      const burst = pluck(
        FREQUENCY,
        DECAY,
        0.05,
        BRIGHTNESS,
        ...NEUTRAL,
      ).subarray(0, BURST);
      let sumOfSquares = 0;
      for (const sample of burst) {
        if (Math.abs(sample) > peak) peak = Math.abs(sample);
        sumOfSquares += sample * sample;
      }
      rms += Math.sqrt(sumOfSquares / BURST) / BURSTS;
    }

    expect(peak).toBeLessThanOrEqual(1);
    expect(peak).toBeGreaterThan(0.9);
    // Uniform on [-1, 1) has an RMS of 1/sqrt(3), and this measures 0.95 of
    // that: removing the burst's mean and scaling its peak back to `level`
    // costs about 5%, which is the price of an excitation that carries no dc.
    expect(rms).toBeGreaterThan((0.95 * 0.85) / Math.sqrt(3));
    expect(rms).toBeLessThan((0.95 * 1.15) / Math.sqrt(3));
  });

  it("then recirculates it through the damping filter, and nothing else", () => {
    const signal = pluck(FREQUENCY, DECAY, 0.05, BRIGHTNESS, ...NEUTRAL);
    let worst = 0;
    // The whole loop in one line: a round trip of `PERIOD` samples, of which
    // the filter is one, and `rho*(h0*x' + h1*(x + x''))` around it. If any
    // excitation leaked in after the burst, if the delay compensation were
    // missing, or if the filter's coefficients were anything else, the
    // residual here would be of order the signal rather than of order a
    // Float32 rounding.
    for (let i = PERIOD + 1; i < 5 * PERIOD; i++) {
      const expected =
        RHO *
        (H0 * signal[i - PERIOD] +
          H1 * (signal[i - PERIOD + 1] + signal[i - PERIOD - 1]));
      const difference = Math.abs(signal[i] - expected);
      if (difference > worst) worst = difference;
    }
    expect(worst).toBeLessThan(1e-6); // Float32 storage, not algorithm
  });

  it("recirculates the shaped excitation the same way, once it has ended", () => {
    // The shipped chain deliberately outlasts a period: the comb is a delay of
    // `floor(position*P)` and the dynamic-level filter is an IIR with a tail,
    // so at these settings the excitation runs 222 samples against a loop of
    // 100. That is Smith's structure - his `noiseburst` is a full period and
    // the comb adds to it - and what keeps the sum inside full scale is
    // `level` rather than the burst being short. Three periods in, the
    // excitation is over and the loop is again the only thing running.
    const signal = pluck(FREQUENCY, DECAY, 0.05);
    let worst = 0;
    for (let i = 3 * PERIOD; i < 8 * PERIOD; i++) {
      const expected =
        RHO *
        (H0 * signal[i - PERIOD] +
          H1 * (signal[i - PERIOD + 1] + signal[i - PERIOD - 1]));
      const difference = Math.abs(signal[i] - expected);
      if (difference > worst) worst = difference;
    }
    expect(worst).toBeLessThan(1e-6);
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
    string.setDamping(Math.pow(0.001, 1 / (frequency * 1)), 0.5);
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

// ---------------------------------------------------------------------------
// The loop filter ticket 04 put in, and the two properties it was chosen for.
// Smith gives two damping filters; this package runs the two-zero one because
// its impulse response is symmetric about n = 1, so its phase delay is exactly
// one sample at every frequency and its DC gain is `rho` for every brightness.
// Those are not decorative facts - they are what lets `brightness` be a timbre
// knob rather than a knob that also detunes the string and shortens the note.
// ---------------------------------------------------------------------------

describe("createKS brightness as a knob", () => {
  const BRIGHTNESSES = [0, 0.5, 1];

  // "Tuning invariance for the price of one additional multiply per sample" -
  // Smith 3.4, which is the entire reason this filter was chosen over the
  // one-zero EKS original, whose phase delay moves with its coefficient.
  //
  // Measured with the spectral estimator, because the autocorrelation one
  // cannot see an effect this small: it reports a spread of up to 2.5 cents at
  // 1760 Hz, all of which is its own lag resolution, where the real figure is
  // 0.018 cents. At 110 Hz the real figure is 0.001.
  it.each([110, 440, 1760])(
    "does not detune the string as it sweeps, at %p Hz",
    (frequency) => {
      const measured = BRIGHTNESSES.map((brightness) =>
        cents(
          spectralFundamental(pluck(frequency, 1, 0.5, brightness), frequency),
          frequency,
        ),
      );
      expect(Math.max(...measured) - Math.min(...measured)).toBeLessThan(2);
    },
  );

  // DC gain is `h0 + 2*h1 = 1` for every B, so the *fundamental's* decay is
  // `rho`'s business alone. What this measures is the broadband envelope,
  // which also contains the partials brightness exists to damp, so it moves a
  // little: 0.85 at B = 0 against 0.95 at B = 1. That gap was 2% while the
  // interpolator was adding its own B-independent damping on top, and 12% now
  // that it is not - the decoupling showing up as a number. The bound is the
  // perceptual one this folder uses everywhere: Jarvelainen and Tolonen put
  // the audible threshold for a decay-time change at 75-140%, so a 25% bound
  // is comfortably inside what a listener could report.
  it("does not change the decay time as it sweeps", () => {
    const measured = BRIGHTNESSES.map((brightness) =>
      averageT60(440, 1, brightness),
    );
    const spread = Math.max(...measured) / Math.min(...measured);
    expect(spread).toBeLessThan(1.25);
  });

  // And the thing it is for: more brightness, more high band left at 250 ms.
  it("damps the high band monotonically less as it rises", () => {
    const measured = BRIGHTNESSES.map((brightness) =>
      brightnessChangeDb(440, brightness),
    );
    expect(measured[0]).toBeLessThan(measured[1]);
    expect(measured[1]).toBeLessThan(measured[2]);
  });
});

describe("createKS stability", () => {
  // The loop filter's taps sum to 1 for every brightness, so the loop is a
  // contraction whenever `rho < 1` - and `rho` is clamped below 1 for every
  // declared parameter combination, including the ones a caller reaches by
  // automating two params to their limits at once.
  it("never grows over a 60 second render at the corners of the ranges", () => {
    const CORNERS: [number, number, number][] = [];
    for (const frequency of [20, 440, 20000]) {
      for (const decay of [0.01, 5]) {
        for (const brightness of [0, 1]) {
          CORNERS.push([frequency, decay, brightness]);
        }
      }
    }

    for (const [frequency, decay, brightness] of CORNERS) {
      const ks = createKS(SAMPLE_RATE, MIN_FREQUENCY);
      const block = new Float32Array(BLOCK);
      let firstSecond = 0;
      let lastSecond = 0;
      let nonFinite = 0;
      const total = SAMPLE_RATE * 60;

      for (let n = 0; n < total; n += BLOCK) {
        ks(block, 1, frequency, decay, brightness);
        for (const sample of block) {
          if (!Number.isFinite(sample)) nonFinite++;
          else if (n < SAMPLE_RATE) {
            if (Math.abs(sample) > firstSecond) firstSecond = Math.abs(sample);
          } else if (n >= total - SAMPLE_RATE) {
            if (Math.abs(sample) > lastSecond) lastSecond = Math.abs(sample);
          }
        }
      }

      expect([frequency, decay, brightness, nonFinite]).toEqual([
        frequency,
        decay,
        brightness,
        0,
      ]);
      expect(lastSecond).toBeLessThanOrEqual(firstSecond);
    }
  }, 120_000);
});

describe("createKS at the top of its range", () => {
  // `frequency.maxValue` is a measurement, so this is the assertion that keeps
  // it one. A five-tap read needs its taps inside the buffer and the damping
  // filter takes a sample too, which puts the shortest loop at 4.5 samples
  // (9800 Hz) - but that is not what binds. What binds is that a loop this
  // short holds almost no string: at 5 kHz the period is 8.8 samples, four
  // partials fit under Nyquist and the excitation is five samples long.
  const MAX_FREQUENCY = PARAMS.find((p) => p.name === "frequency")!.maxValue;

  it("plays its declared maximum within 5 cents, on every pluck", () => {
    let worst = 0;
    for (let attempt = 0; attempt < 8; attempt++) {
      const signal = pluck(MAX_FREQUENCY, 1, 0.5);
      const error = Math.abs(
        cents(spectralFundamental(signal, MAX_FREQUENCY), MAX_FREQUENCY),
      );
      if (error > worst) worst = error;
    }
    expect(worst).toBeLessThan(5);
  });

  it("stays bounded and audible at its declared maximum", () => {
    // Averaged over eight plucks, because at 5 kHz the burst is five samples
    // long and its peak is a draw of five numbers: with `level` at 0.5 one
    // pluck measures anywhere between 0.07 and 0.33, where the mean over 40 is
    // 0.21. It used to be a single pluck against 0.25, which only worked
    // because the burst was full scale.
    let total = 0;
    for (let attempt = 0; attempt < 8; attempt++) {
      const signal = pluck(MAX_FREQUENCY, 1, 0.5);
      let peak = 0;
      for (const sample of signal) {
        if (!Number.isFinite(sample)) throw new Error("not finite");
        if (Math.abs(sample) > peak) peak = Math.abs(sample);
      }
      expect(peak).toBeLessThanOrEqual(1);
      total += peak;
    }
    expect(total / 8).toBeGreaterThan(0.1); // a burst this short still excites it
  });
});

// ---------------------------------------------------------------------------
// The pitch moving while the string rings. `frequency` is a-rate, so an `Lfo`
// patched into it is vibrato and a `Param` ramp is portamento; there is no
// glide parameter, and these are the assertions that say the machinery under
// that claim works. Ticket 11 drives the same per-sample delay from the loop's
// own energy.
// ---------------------------------------------------------------------------

/** Renders one pluck while `frequencyAt` moves the pitch, sample by sample. */
function slide(
  frequencyAt: (sample: number) => number,
  seconds: number,
  decay = 1,
) {
  const ks = createKS(SAMPLE_RATE, MIN_FREQUENCY);
  const output = new Float32Array(Math.ceil(SAMPLE_RATE * seconds));
  const block = new Float32Array(BLOCK);
  const frequency = new Float32Array(BLOCK);
  for (let n = 0; n < output.length; n += BLOCK) {
    for (let i = 0; i < BLOCK; i++) frequency[i] = frequencyAt(n + i);
    ks(block, 1, frequency, decay);
    output.set(block.subarray(0, Math.min(BLOCK, output.length - n)), n);
  }
  return output;
}

/** Mean power over `[from, to)` seconds - steadier than an instantaneous envelope. */
function power(signal: Float32Array, from: number, to: number) {
  const first = Math.round(from * SAMPLE_RATE);
  const last = Math.round(to * SAMPLE_RATE);
  let total = 0;
  for (let i = first; i < last; i++) total += signal[i] * signal[i];
  return total / (last - first);
}

const OCTAVE_IN_HALF_A_SECOND = 0.5 * SAMPLE_RATE;
const rampUp = (sample: number) =>
  220 * Math.pow(2, Math.min(1, sample / OCTAVE_IN_HALF_A_SECOND));
const rampDown = (sample: number) =>
  440 * Math.pow(2, -Math.min(1, sample / OCTAVE_IN_HALF_A_SECOND));
const vibrato = (sample: number) =>
  440 *
  Math.pow(2, (50 / 1200) * Math.sin((2 * Math.PI * 5 * sample) / SAMPLE_RATE));

describe("createKS with a moving pitch", () => {
  it("tracks a one-octave slide within 10 cents", () => {
    const WINDOW = 4096;
    const glide = (sample: number) =>
      220 * Math.pow(2, Math.min(1, sample / SAMPLE_RATE)); // an octave in 1 s
    const signal = slide(glide, 1.3, 3);

    let worst = 0;
    for (let point = 0; point < 10; point++) {
      const start = Math.round((0.05 + point * 0.09) * SAMPLE_RATE);
      // The window spans a range of pitches, so the request it is compared
      // against is the mean over the same window.
      let requested = 0;
      for (let i = 0; i < WINDOW; i++) requested += glide(start + i);
      requested /= WINDOW;

      const error = Math.abs(
        cents(spectralFundamental(signal, requested, start, WINDOW), requested),
      );
      if (error > worst) worst = error;
    }
    expect(worst).toBeLessThan(10);
  });

  it("turns a 5 Hz modulation into symmetric vibrato", () => {
    const WINDOW = 2048;
    const signal = slide(vibrato, 1, 3);
    const measured: number[] = [];
    for (let point = 0; point < 20; point++) {
      const start = Math.round(0.05 * SAMPLE_RATE) + point * 1024;
      measured.push(
        cents(spectralFundamental(signal, 440, start, WINDOW), 440),
      );
    }
    const highest = Math.max(...measured);
    const lowest = Math.min(...measured);
    // A 50 cent modulation, and the estimator sees nearly all of it.
    expect(highest).toBeGreaterThan(40);
    expect(lowest).toBeLessThan(-40);
    // Symmetric: a vibrato that bends further one way than the other would be
    // a delay that is not linear in what it was asked for.
    expect(Math.abs(highest + lowest)).toBeLessThan(10);
  });

  it("neither gains nor loses more than 3 dB over a slide", () => {
    // The energy-compensation criterion. There is no compensation multiply -
    // measured against this assertion, Pakarinen et al.'s belongs on an output
    // tap rather than inside a feedback loop, and see the plan for ticket 06 -
    // so what keeps this true is that `rho` follows the current frequency.
    //
    // Averaged over 12 seeded renders: a slid string and a held one are
    // genuinely different signals, so one render of each differs by up to 5 dB
    // even with the same excitation.
    const SEEDS = 12;
    let up = 0;
    let down = 0;
    for (let seed = 1; seed <= SEEDS; seed++) {
      const measure = (at: (sample: number) => number) =>
        withSeededNoise(seed, () => power(slide(at, 0.6), 0.45, 0.55));
      up += 10 * Math.log10(measure(rampUp) / measure(() => 440));
      down += 10 * Math.log10(measure(rampDown) / measure(() => 220));
    }
    expect(Math.abs(up / SEEDS)).toBeLessThan(3);
    expect(Math.abs(down / SEEDS)).toBeLessThan(3);
  });

  it("does not step at block boundaries", () => {
    // A delay length stepped once per block rather than smoothed would put a
    // discontinuity every 128 samples and nowhere else, so this compares the
    // mean sample-to-sample difference at the boundaries with the one between
    // them. A held note is the control.
    const boundaryRatio = (at: (sample: number) => number) => {
      const signal = slide(at, 0.6);
      let atBoundary = 0;
      let between = 0;
      let boundaries = 0;
      let interior = 0;
      for (let i = Math.round(0.05 * SAMPLE_RATE); i < signal.length; i++) {
        const step = Math.abs(signal[i] - signal[i - 1]);
        if (i % BLOCK === 0) {
          atBoundary += step;
          boundaries++;
        } else {
          between += step;
          interior++;
        }
      }
      return atBoundary / boundaries / (between / interior);
    };

    expect(boundaryRatio(() => 330)).toBeLessThan(1.5); // control
    expect(boundaryRatio(rampUp)).toBeLessThan(1.5);
    expect(boundaryRatio(rampDown)).toBeLessThan(1.5);
    expect(boundaryRatio(vibrato)).toBeLessThan(1.5);
  });

  it("reads a constant a-rate frequency as the k-rate scalar", () => {
    const held = slide(() => 330, 0.2);
    let peak = 0;
    for (const sample of held)
      if (Math.abs(sample) > peak) peak = Math.abs(sample);
    // 0.19-0.26 over plucks at the shipped `level` of 0.5, where an unshaped
    // full-scale burst gave 0.6-0.9. The claim is "it played the note", not a
    // level: that is the excitation-shaping group's business.
    expect(peak).toBeGreaterThan(0.1);
    expect(Math.abs(cents(spectralFundamental(held, 330), 330))).toBeLessThan(
      5,
    );
  });

  it("stays finite under a modulation no player could make", () => {
    // 20 Hz to 5 kHz and back every 10 ms, which is the whole declared range
    // 100 times a second. The clamp is per sample and the loop filter is a
    // contraction, so this has to stay bounded even though it is nonsense.
    const period = 0.01 * SAMPLE_RATE;
    const signal = slide(
      (sample) =>
        20 *
        Math.pow(250, 0.5 - 0.5 * Math.cos((2 * Math.PI * sample) / period)),
      1,
    );
    let peak = 0;
    let nonFinite = 0;
    for (const sample of signal) {
      if (!Number.isFinite(sample)) nonFinite++;
      else if (Math.abs(sample) > peak) peak = Math.abs(sample);
    }
    expect(nonFinite).toBe(0);
    expect(peak).toBeLessThan(8);
  });
});

// ---------------------------------------------------------------------------
// The excitation chain ticket 07 put on the pluck. Every filter here is
// *outside* the loop - Smith's `filtered_excitation : stringloop` - so none of
// them can change the decay time or destabilise the string, and the two
// assertions that say so (the dynamics sweep below, and the loop identity
// above) are the ones that make that structural claim checkable.
// ---------------------------------------------------------------------------

describe("createKS excitation shaping", () => {
  it("no longer plucks at 0 dBFS", () => {
    // The whole point of the ticket. An unshaped burst peaked at 0.96-0.99
    // whatever the patch's gain staging; the shipped defaults - `level` 0.5
    // into a dynamic-level filter at Smith's -10 dB - peak at 0.21 on average
    // and 0.28 at worst, about -13.5 dBFS, which leaves a patch room to sum
    // several voices.
    for (const frequency of [110, 440, 1760]) {
      const peak = peakOf(pluck(frequency, 1, 0.5));
      expect(peak).toBeLessThan(0.5); // -6 dBFS
      expect(peak).toBeGreaterThan(0.05); // and still a note
    }
  });

  it("scales the burst by `level`, and nothing else", () => {
    // `level` multiplies the noise before the three filters, so it is exactly
    // linear: the same seeded draw at four levels gives peaks in the same
    // ratio to well inside a percent.
    const peaks = [0.1, 0.25, 0.5, 1].map((level) =>
      withSeededNoise(7, () =>
        peakOf(pluck(440, 1, 0.3, 0.5, level, 0.5, 0.13, 0)),
      ),
    );
    const ratios = peaks.map((peak, i) => peak / [0.1, 0.25, 0.5, 1][i]);
    expect(Math.max(...ratios) / Math.min(...ratios)).toBeLessThan(1.01);
  });

  // Smith 3.5: "in real strings, the spectral centroid typically rises as
  // plucking/striking becomes more energetic".
  it("lowers the attack's spectral centroid as `dynamics` falls", () => {
    const DYNAMICS = [0, 0.25, 0.5, 0.75, 1];
    // Paired across the sweep and averaged over eight draws: one noise burst
    // moves the centroid of a 23 ms window by more than the two darkest steps
    // are apart.
    const measured = DYNAMICS.map((dynamics) => {
      let total = 0;
      for (let seed = 1; seed <= 8; seed++) {
        total += withSeededNoise(seed, () =>
          spectralCentroid(
            pluck(440, 1, 0.1, 0.5, 0.5, dynamics, 0.13, 0),
            0,
            1024,
          ),
        );
      }
      return total / 8;
    });
    // Measured 1395, 1970, 3576, 4084, 4208 Hz.
    for (let i = 1; i < measured.length; i++) {
      expect(measured[i]).toBeGreaterThan(measured[i - 1]);
    }
    expect(measured[measured.length - 1] / measured[0]).toBeGreaterThan(2);
  });

  it("does not change the decay time as `dynamics` sweeps", () => {
    // The structural claim, measured: the dynamic-level filter is outside the
    // loop, so it colours the attack and leaves the decay to `decay` and
    // `brightness`. Measured 0.89 / 0.84 / 0.79 s at 0 / 0.5 / 1, a spread of
    // 1.13 - inside the same 25% bound the brightness sweep uses, and well
    // inside Jarvelainen and Tolonen's 75-140% audible threshold. It is not 1
    // exactly because a darker excitation puts less of the broadband envelope
    // in the fast-decaying partials, which is the filter doing its job.
    const measured = [0, 0.5, 1].map((dynamics) => {
      let total = 0;
      for (let i = 0; i < T60_PLUCKS; i++) {
        total += t60(pluck(440, 1, 3, 0.5, 0.5, dynamics, 0.13, 0));
      }
      return total / T60_PLUCKS;
    });
    expect(Math.max(...measured) / Math.min(...measured)).toBeLessThan(1.25);
  });

  // Smith 3.2: `1 - z^-floor(beta*P)`, "0 being at the bridge and 1 at the
  // nut", so the first notch is at `f0/beta`.
  it.each([110, 440])(
    "puts the pick-position comb's first notch at f0/position, at %p Hz",
    (frequency) => {
      for (const position of [0.1, 0.13, 0.25, 0.5]) {
        const measured = combNotch(frequency, position);
        const expected = frequency / position;
        expect(Math.abs(measured / expected - 1)).toBeLessThan(0.05);
      }
    },
  );

  it("truncates the comb delay, which is what costs it accuracy up high", () => {
    // The comb delay is `floor(beta*P)` samples, not a fractional delay, on
    // Smith's own authority: "pick position accuracy is normally not critical,
    // hence the 1% slider steps and lack of delay-line interpolation in the
    // comb filter". This is the price, measured rather than waved at: at
    // 880 Hz the period is 50 samples, `floor(0.13*50)` is 6 rather than 6.5,
    // and the notch lands at 7350 Hz where `f0/beta` is 6769 - 8.6% high. The
    // exact form is Lehtonen, Valimaki and Laakso 2008's inverse comb built on
    // a fractional-delay filter, which is for cancelling partials precisely;
    // this is a timbre knob.
    const error = Math.abs(combNotch(880, 0.13) / (880 / 0.13) - 1);
    expect(error).toBeGreaterThan(0.05);
    expect(error).toBeLessThan(0.12);
  });

  // Smith 3.1: "real up-picks may be at different angles than down-picks, thus
  // resulting in different plucking stiffness".
  it("darkens the first 5 ms as `pickAngle` rises", () => {
    const measured = [0, 0.3, 0.6, 0.9].map((pickAngle) => {
      let total = 0;
      for (let seed = 1; seed <= 8; seed++) {
        total += withSeededNoise(seed, () =>
          highBandRatio(
            pluck(440, 1, 0.1, 0.5, 0.5, 0.5, 0.13, pickAngle),
            0,
            256,
          ),
        );
      }
      return total / 8;
    });
    // Measured 0.605, 0.443, 0.243, 0.056 of the energy above 5 kHz.
    for (let i = 1; i < measured.length; i++) {
      expect(measured[i]).toBeLessThan(measured[i - 1]);
    }
    // 10.3 dB at the top of the range, against a bound of 6.
    expect(energyDb(measured[3], measured[0])).toBeLessThan(-6);
  });
});

describe("createKS amplitude with the excitation shaped", () => {
  // The four excitation parameters at their corners. Nothing here is inside
  // the loop, so this cannot diverge - but it is where the module's *level*
  // now lives, and the number is worth writing down: the pick-position comb is
  // `1 - z^-D`, whose peak gain is 2, so a `level` of 1 with the comb enabled
  // reaches 1.99. `level` is what buys the headroom back, which is the whole
  // point of the parameter; at the shipped defaults the same sweep peaks at
  // 0.28.
  it("stays finite, and bounded by the comb's own gain", () => {
    let peak = 0;
    let nonFinite = 0;
    for (const frequency of [20, 110, 440, 1760, 5000]) {
      for (const level of [0.5, 1]) {
        for (const dynamics of [0, 0.5, 1]) {
          for (const position of [0, 0.13, 0.5]) {
            for (const pickAngle of [0, 0.9]) {
              for (const sample of pluck(
                frequency,
                1,
                0.2,
                0.5,
                level,
                dynamics,
                position,
                pickAngle,
              )) {
                if (!Number.isFinite(sample)) nonFinite++;
                else if (Math.abs(sample) > peak) peak = Math.abs(sample);
              }
            }
          }
        }
      }
    }
    expect(nonFinite).toBe(0);
    expect(peak).toBeLessThan(2.5);
  }, 120_000);
});
