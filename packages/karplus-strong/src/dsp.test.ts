import { createKS, createString, designDispersion } from "./dsp";
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
  stretch = 1,
  blend = 1,
  stiffness = 0,
  detune = 0.5,
  polarization = 0,
  tension = 0,
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
      stretch,
      blend,
      stiffness,
      detune,
      polarization,
      tension,
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

/**
 * How fast one band of the spectrum decays, in dB per second, measured between
 * two windows. A *rate*, which is what a decay-stretching claim is about, and
 * a narrow band because the answer is a per-partial one: everything above
 * 5 kHz at 1760 Hz spans loop gains from 0.94 down to 0.5, so a wide band
 * decays as a mixture rather than as an exponential.
 */
function bandDecayRate(
  signal: Float32Array,
  centre: number,
  width: number,
  fromSeconds: number,
  toSeconds: number,
) {
  const size = 1024;
  const level = (at: number) => {
    const energy = spectrum(signal, Math.round(at * SAMPLE_RATE), size);
    let sum = 0;
    for (let k = 1; k < size / 2; k++) {
      const frequency = (k * SAMPLE_RATE) / size;
      if (frequency > centre - width && frequency < centre + width) {
        sum += energy[k];
      }
    }
    return 10 * Math.log10(Math.max(sum, 1e-30));
  };
  return (level(fromSeconds) - level(toSeconds)) / (toSeconds - fromSeconds);
}

/**
 * How periodic the signal is: the peak normalised autocorrelation over the
 * lags a pitch could occupy. A plucked string is a delay line going round, so
 * this is near 1; Karplus and Strong's drum "is aperiodic", so it is not.
 */
function periodicity(signal: Float32Array, frequency: number) {
  const period = SAMPLE_RATE / frequency;
  const from = Math.round(0.02 * SAMPLE_RATE);
  const length = Math.min(Math.round(0.2 * SAMPLE_RATE), signal.length - from);
  let best = 0;
  for (
    let lag = Math.floor(period * 0.5);
    lag <= Math.ceil(period * 2.5);
    lag++
  ) {
    let dot = 0;
    let energyA = 0;
    let energyB = 0;
    for (let i = 0; i + lag < length; i++) {
      const a = signal[from + i];
      const b = signal[from + i + lag];
      dot += a * b;
      energyA += a * a;
      energyB += b * b;
    }
    const norm = Math.sqrt(energyA * energyB);
    const score = norm > 0 ? dot / norm : 0;
    if (score > best) best = score;
  }
  return best;
}

/** Geometric over arithmetic mean of the spectrum: 0 is a line, 1 is noise. */
function spectralFlatness(signal: Float32Array, start: number, size: number) {
  const energy = spectrum(signal, start, size);
  let logSum = 0;
  let sum = 0;
  let count = 0;
  for (let k = 1; k < size / 2; k++) {
    logSum += Math.log(energy[k] + 1e-30);
    sum += energy[k];
    count++;
  }
  return Math.exp(logSum / count) / (sum / count);
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
function averageT60(
  frequency: number,
  decay: number,
  brightness = 0.5,
  stiffness = 0,
  seed = 101,
) {
  let total = 0;
  for (let i = 0; i < T60_PLUCKS; i++) {
    // Seeded at the helper rather than at each call site, so every decay
    // assertion in this file is deterministic at once. Averaging 32 draws
    // narrows the scatter but does not remove it, and two of the assertions
    // below sit within a few percent of their bound - which is how this one
    // was caught.
    total += withSeededNoise(seed + i, () =>
      t60(
        pluck(
          frequency,
          decay,
          Math.max(3, 3 * decay),
          brightness,
          0.5,
          0.5,
          0.13,
          0,
          1,
          1,
          stiffness,
        ),
      ),
    );
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
/**
 * The damping filter's own gain at the fundamental, `G(w0) = h0 + 2*h1*cos(w0)`.
 * It is 1 only at `brightness` 1, and it is the reason `rho` is divided by it.
 */
function filterGainAt(frequency: number, brightness: number) {
  return (
    (1 + brightness) / 2 +
    ((1 - brightness) / 2) * Math.cos((2 * Math.PI * frequency) / SAMPLE_RATE)
  );
}

/** The loop gain the module actually uses, clamp included. */
const MAX_LOOP_GAIN = 0.99999;
function loopGainOf(frequency: number, decay: number, brightness: number) {
  return Math.min(
    Math.pow(0.001, 1 / (frequency * decay)) /
      filterGainAt(frequency, brightness),
    MAX_LOOP_GAIN,
  );
}

/**
 * The decay time the loop's own transfer function predicts for the fundamental:
 * `rho` once per period, times the damping filter's gain there. `rho` is
 * derived so that the product is `0.001^(1/(f0*t60))` - so this returns
 * `decay` exactly, unless the clamp binds, and then it returns the longest the
 * filter can deliver.
 */
function predictedT60(frequency: number, decay: number, brightness: number) {
  const perPeriod =
    loopGainOf(frequency, decay, brightness) *
    filterGainAt(frequency, brightness);
  return Math.log(0.001) / Math.log(perPeriod) / frequency;
}

/** The longest decay a given brightness can deliver at a given pitch. */
function longestT60(frequency: number, brightness: number) {
  return (
    Math.log(0.001) /
    (frequency * Math.log(filterGainAt(frequency, brightness)))
  );
}

/**
 * The brightness figure both groups below assert on: 5 ms to 250 ms, in dB.
 *
 * `stiffness` is threaded through so ticket 09 can re-run ticket 02's two
 * high-band groups with the dispersion cascade in the loop; every argument
 * between it and `brightness` is `pluck`'s own default, so the call at
 * `stiffness = 0` is the one it always was, sample for sample.
 */
function brightnessChangeDb(
  frequency: number,
  brightness = 0.5,
  stiffness = 0,
) {
  const signal = pluck(
    frequency,
    1,
    0.4,
    brightness,
    0.5,
    0.5,
    0.13,
    0,
    1,
    1,
    stiffness,
  );
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
      // says at every pitch. Measured 0.970 / 0.957 / 0.961.
      const measured = averageT60(frequency, 1, 1);
      expect(measured).toBeGreaterThanOrEqual(0.75);
      expect(measured).toBeLessThanOrEqual(1.4);
    },
  );

  // And at the **shipped** brightness, which is ticket 04's criterion 1 in its
  // own words and used to hold only at `brightness` 1. `rho` is now derived from
  // the loop's gain at the fundamental rather than at dc - divided by
  // `G(w0) = h0 + 2*h1*cos(w0)`, which is what the ear actually hears once per
  // period - so `decay` means the same seconds at every brightness. Measured
  // ratios to the requested time:
  //
  //   110 Hz:  0.897 / 0.852 / 0.805 at decay 0.5 / 1 / 3
  //   440 Hz:  0.914 / 0.863 / 0.817
  //
  // against 0.85 / 0.83 / - before, and 0.33 at 1760 Hz, which is the next
  // assertion's business. The systematic 0.85 is the measurement rather than the
  // string: `t60` times the broadband envelope, and the partials above the
  // fundamental decay faster than it does by construction.
  it.each([110, 440])(
    "decays in 75-140%% of the requested time at %p Hz, at the shipped brightness",
    (frequency) => {
      for (const decay of [0.5, 1, 3]) {
        const ratio = averageT60(frequency, decay) / decay;
        expect([decay, ratio >= 0.75 && ratio <= 1.4]).toEqual([decay, true]);
      }
    },
    120_000,
  );

  // Where it does *not* hold, and why - which is a property of a symmetric
  // three-tap filter rather than of this code. `G(w0) < 1` for every brightness
  // below 1, so asking for a decay longer than the filter alone can deliver
  // needs a loop gain above 1 at dc, and that is the 3.4e38 failure. The clamp
  // binds instead, and the string decays as fast as the filter allows:
  //
  //   t60_max = ln(0.001) / (f0 * ln(1/G(w0)))
  //
  // which at `brightness` 0.5 is 2045 s at 110 Hz, 32 s at 440, **0.50 s at
  // 1760** and 22 ms at 5 kHz. So 1760 Hz honours any `decay` up to half a
  // second and nothing beyond it - measured 0.963 of the request at `decay` 0.5,
  // and 0.963 of the ceiling at both `decay` 1 and `decay` 3.
  it("delivers the longest decay the damping filter allows, and says what it is", () => {
    const ceiling = longestT60(1760, 0.5);
    expect(ceiling).toBeCloseTo(0.5, 2);
    // Inside the ceiling, `decay` is honoured.
    const short = averageT60(1760, 0.5) / 0.5;
    expect(short).toBeGreaterThanOrEqual(0.75);
    expect(short).toBeLessThanOrEqual(1.4);
    // Beyond it, the request is capped rather than approximated.
    for (const decay of [1, 3]) {
      const ratio = averageT60(1760, decay) / ceiling;
      expect([decay, ratio >= 0.75 && ratio <= 1.4]).toEqual([decay, true]);
      // The prediction sits a hair under the ceiling, because the clamp leaves
      // `maxLoopGain`'s own 0.001% of loss in the loop rather than exactly 1.
      expect(
        Math.abs(predictedT60(1760, decay, 0.5) / ceiling - 1),
      ).toBeLessThan(0.01);
    }
  }, 120_000);
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
  // `rho` is derived from the loop's gain at the *fundamental*, so it carries
  // the damping filter's own response there divided back out - see `loopGainOf`.
  const RHO = loopGainOf(FREQUENCY, DECAY, BRIGHTNESS);
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

  // Ticket 04's criterion 4, and it has two halves that want measuring
  // separately.
  //
  // **The fundamental's decay does not move at all.** `rho` is derived so that
  // the loop's gain *at the fundamental* delivers the requested time, so this is
  // true by construction rather than approximately: the t60 of a band around f0
  // measures 1.000 s at every brightness from 0 to 1, to four decimal places.
  it("does not change the fundamental's decay time as it sweeps", () => {
    const measured = [0, 0.25, 0.5, 0.75, 1].map((brightness) => {
      let total = 0;
      const PLUCKS = 8;
      for (let seed = 1; seed <= PLUCKS; seed++) {
        total +=
          60 /
          withSeededNoise(seed, () =>
            bandDecayRate(pluck(440, 1, 2, brightness), 440, 80, 0.1, 0.6),
          ) /
          PLUCKS;
      }
      return total;
    });
    const spread = Math.max(...measured) / Math.min(...measured);
    expect(spread).toBeLessThan(1.05);
  }, 60_000);

  // **The broadband envelope still moves by 11%, and that is brightness
  // working.** What `t60` times is the whole signal, which contains the partials
  // brightness exists to damp: measured 0.860 / 0.863 / 0.957 s at B = 0 / 0.5 /
  // 1. B = 0 and B = 0.5 are 0.4% apart; all of the remaining 11% is the B = 1
  // endpoint, where the filter degenerates to a plain delay and *every* partial
  // decays at exactly `rho` instead of the high ones going first.
  //
  // So the criterion's "less than 10%" is met by the string and not by the
  // broadband measurement, and the bound here is tightened only as far as the
  // measurement honestly supports: 15%, against a measured 11.3% and the 25% it
  // used to allow. Jarvelainen and Tolonen's audible threshold is 75-140%, so
  // all of this is well inside what a listener could report.
  it("does not change the decay time as it sweeps", () => {
    const measured = BRIGHTNESSES.map((brightness) =>
      averageT60(440, 1, brightness),
    );
    const spread = Math.max(...measured) / Math.min(...measured);
    expect(spread).toBeLessThan(1.15);
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

  // Ticket 06's criterion 1 says "up to one octave per 0.5 s", and the
  // assertion above runs at half that rate. This is the criterion's own rate,
  // in both directions, using the `rampUp`/`rampDown` the level assertion
  // further down already slides at. Measured worst error 2.4 cents up and 4.7
  // down, against the criterion's 10.
  it.each([
    ["up", rampUp],
    ["down", rampDown],
  ])(
    "tracks an octave per half second, sliding %s, within 10 cents",
    (_direction, glide) => {
      const WINDOW = 4096;
      let worst = 0;
      for (let seed = 1; seed <= 4; seed++) {
        const signal = withSeededNoise(seed, () => slide(glide, 0.8, 3));
        for (let point = 0; point < 8; point++) {
          const start = Math.round((0.04 + point * 0.05) * SAMPLE_RATE);
          let requested = 0;
          for (let i = 0; i < WINDOW; i++) requested += glide(start + i);
          requested /= WINDOW;
          const error = Math.abs(
            cents(
              spectralFundamental(signal, requested, start, WINDOW),
              requested,
            ),
          );
          if (error > worst) worst = error;
        }
      }
      expect(worst).toBeLessThan(10);
    },
    60_000,
  );

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

// ---------------------------------------------------------------------------
// Karplus and Strong's own two probabilistic variants, from the 1983 paper
// this package is named after - the ones its title is about. `stretch` is
// *their* decay stretching, from "Modifications in the Basic Algorithm", not
// Jaffe and Smith's identically-lettered one; `blend` is the drum algorithm
// Kevin Karplus discovered in December 1979. Both are inside the loop, and
// both are neutral at their defaults.
// ---------------------------------------------------------------------------

describe("createKS stretch", () => {
  it("costs the default path nothing: stretch 1 and blend 1 are the string", () => {
    // Not "sounds the same" - the same samples. The probabilistic branch is
    // behind one boolean, and its generator is private, so a default note does
    // not even draw a random number: the excitation's seeded sequence is
    // untouched and this render is the pre-ticket one.
    const before = withSeededNoise(3, () => pluck(440, 1, 0.2));
    const after = withSeededNoise(3, () =>
      pluck(440, 1, 0.2, 0.5, 0.5, 0.5, 0.13, 0, 1, 1),
    );
    expect(Array.from(after)).toEqual(Array.from(before));
  });

  // "The decay time of each overtone is approximately multiplied by S."
  it("multiplies a partial's decay time by roughly the stretch factor", () => {
    const STRETCHES = [1, 2, 4, 8];
    // The third partial of a 1760 Hz string, where the damping filter's loss
    // dominates: measured 1128 dB/s unstretched, against the 60 dB/s that
    // `decay = 1` alone imposes.
    // Seeded, and it has to be: `stretch` is a coin flip per sample, so the
    // decay rate it produces is a random variable on top of the burst's own.
    // Averaging eight plucks was not enough - the monotonicity step from S = 4
    // to S = 8 failed about one run in thirty, because those two means are
    // within the mean's own scatter. Eight fixed seeds keep the same eight
    // draws and make the verdict reproducible.
    const rate = (stretch: number) => {
      let total = 0;
      const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
      for (const seed of SEEDS) {
        const signal = withSeededNoise(seed, () =>
          pluck(1760, 1, 0.3, 0.5, 0.5, 1, 0.13, 0, stretch, 1),
        );
        total += bandDecayRate(signal, 5280, 400, 0.005, 0.05) / SEEDS.length;
      }
      return total;
    };
    const rates = STRETCHES.map(rate);

    // Monotone, and by the right amount. `rho` is outside the coin flip, so it
    // sets a floor the stretch cannot lift: the rate is
    // `rhoRate + (r1 - rhoRate)/S` rather than `r1/S`.
    //
    // `rhoRate` is not 60 dB/s any more. `rho` is derived from the loop's gain
    // at the fundamental, and at 1760 Hz with `brightness` 0.5 that division
    // asks for more than 1 and is clamped - so at this setting `rho` contributes
    // essentially no loss at all and the damping filter is doing all of it.
    // Computed from the shipped `rho` rather than assumed.
    for (let i = 1; i < rates.length; i++) {
      expect(rates[i]).toBeLessThan(rates[i - 1]);
    }
    const rhoRate = -20 * Math.log10(loopGainOf(1760, 1, 0.5)) * 1760;
    for (let i = 0; i < STRETCHES.length; i++) {
      const model = rhoRate + (rates[0] - rhoRate) / STRETCHES[i];
      expect([STRETCHES[i], Math.abs(rates[i] / model - 1) < 0.2]).toEqual([
        STRETCHES[i],
        true,
      ]);
    }
  });

  // K&S's period moves from `p + 1/2` to `p + 1/(2S)` because their averager
  // carries half a sample of phase delay and skipping it removes it. Ticket
  // 04's damping filter is symmetric, so it carries exactly one sample at
  // every frequency - and the skip path here is `x[n-1]`, which carries
  // exactly one too. So there is nothing to compensate, and this is the
  // assertion that says so.
  //
  // Measured with the autocorrelation estimator, and by the *spread* across
  // the sweep rather than the absolute error, for two reasons. Randomly
  // switching between two loop filters modulates the loop, which puts a noise
  // skirt around every partial: the spectral estimator reads one pluck's peak
  // out of that skirt and scatters by up to 15 cents at 110 Hz while its mean
  // stays at -0.3, where autocorrelation - which measures periodicity, and
  // periodicity is what "detune" means - scatters by 0.27. And the
  // autocorrelation estimator has a lag-resolution bias of its own, 1.5 cents
  // at 440 Hz, which is constant across the sweep and cancels in a spread.
  // Measured spread: 0.06 / 0.31 / 0.77 cents at 110 / 440 / 1760.
  it.each([110, 440, 1760])(
    "does not detune the string as it sweeps, at %p Hz",
    (frequency) => {
      const PLUCKS = 6;
      const measured = [1, 2, 5, 10, 20].map((stretch) => {
        let total = 0;
        for (let i = 0; i < PLUCKS; i++) {
          const signal = pluck(
            frequency,
            1,
            0.5,
            0.5,
            0.5,
            0.5,
            0.13,
            0,
            stretch,
            1,
          );
          total += cents(fundamental(signal, frequency), frequency) / PLUCKS;
        }
        return total;
      });
      expect(Math.max(...measured) - Math.min(...measured)).toBeLessThan(5);
    },
  );
});

describe("createKS blend", () => {
  // `position` is 0 and `dynamics` 1 throughout this group: the pick-position
  // comb is a *string* filter and it annihilates the constant wavetable the
  // drum is loaded with, `x[n] - x[n-D]` being zero wherever the burst is flat.
  const drum = (frequency: number, seconds: number, blend: number) =>
    pluck(frequency, 1, seconds, 0.5, 0.5, 1, 0, 0, 1, blend);

  // "With a blend factor of 1/2, the sound is drumlike."
  it("turns the string into a drum at 1/2", () => {
    const string = periodicity(drum(440, 0.5, 1), 440);
    const drumlike = periodicity(drum(440, 0.5, 0.5), 440);
    // A delay line going round is as periodic as a signal gets; the drum "is
    // aperiodic", and measures it: 0.996 against 0.16.
    expect(string).toBeGreaterThan(0.9);
    expect(drumlike).toBeLessThan(0.4);

    // And the spectrum fills in: a line spectrum has a flatness near 0, noise
    // near 1. Measured 0.00003 against 0.54.
    expect(spectralFlatness(drum(440, 0.5, 1), 2048, 4096)).toBeLessThan(0.01);
    expect(spectralFlatness(drum(440, 0.5, 0.5), 2048, 4096)).toBeGreaterThan(
      0.3,
    );
  });

  // "A blend factor of 0 negates the entire signal every p + 1/2 samples. This
  // drops the frequency an octave and leaves only odd harmonics of the new
  // fundamental... the sound is harplike."
  it("drops an octave and keeps only odd harmonics at 0", () => {
    const signal = drum(440, 0.5, 0);
    expect(Math.abs(cents(spectralFundamental(signal, 220), 220))).toBeLessThan(
      5,
    );

    const energy = spectrum(signal, 2048, 16384);
    const at = (frequency: number) => {
      const k = Math.round((frequency * 16384) / SAMPLE_RATE);
      let peak = 0;
      for (let j = k - 2; j <= k + 2; j++)
        if (energy[j] > peak) peak = energy[j];
      return 10 * Math.log10(peak + 1e-30);
    };
    // Odd harmonics of 220 present, even ones gone: measured 54.9 / -62.2 /
    // 44.6 / -71.8 / 38.0 dB at 220 / 440 / 660 / 880 / 1100.
    for (const odd of [220, 660, 1100]) {
      for (const even of [440, 880]) {
        expect(at(odd) - at(even)).toBeGreaterThan(80);
      }
    }
  });

  // "The initial wavetable can be filled with a constant (A), since the drum
  // algorithm will create the randomness itself... starting with a constant
  // gives some buildup before the decay, while starting with randomness gives
  // maximum amplitude initially."
  it("loads the wavetable with a constant, and builds up from it", () => {
    const signal = drum(200, 0.5, 0.5);
    // The loop returns nothing for a whole period, so the first samples are
    // the excitation and the excitation is flat.
    for (let i = 0; i < 64; i++) expect(signal[i]).toBe(0.5); // `level`
    // And then it grows past it rather than starting at its maximum: 0.67
    // against the 0.5 it was loaded with.
    expect(peakOf(signal)).toBeGreaterThan(0.55);
  });

  // "For b = 1/2, the wavetable length does not control the pitch of the tone,
  // as the sound is aperiodic. Instead, it controls the decay time of the
  // noise burst. The decay time is roughly proportional to p."
  it("makes the buffer length a decay control rather than a pitch", () => {
    const measured = [100, 200, 500, 1000].map((frequency) =>
      t60(drum(frequency, 1.5, 0.5)),
    );
    // Measured 0.221 / 0.109 / 0.067 / 0.055 s. The first pair is the
    // proportionality itself - twice the buffer, 2.03x the decay - and it
    // flattens at short buffers, where `rho` and the excitation length are
    // what is left.
    for (let i = 1; i < measured.length; i++) {
      expect(measured[i]).toBeLessThan(measured[i - 1]);
    }
    expect(measured[0] / measured[1]).toBeGreaterThan(1.7);
    expect(measured[0] / measured[1]).toBeLessThan(2.4);
    expect(measured[0] / measured[3]).toBeGreaterThan(3);
  });
});

describe("createKS amplitude and stability with the loop variants", () => {
  it("stays finite and bounded across the corners of both", () => {
    let peak = 0;
    let nonFinite = 0;
    for (const frequency of [20, 110, 440, 1760, 5000]) {
      for (const level of [0.5, 1]) {
        for (const stretch of [1, 4, 20]) {
          for (const blend of [1, 0.5, 0]) {
            for (const position of [0, 0.13, 0.5]) {
              for (const sample of pluck(
                frequency,
                1,
                0.3,
                0.5,
                level,
                0.5,
                position,
                0,
                stretch,
                blend,
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
    // Measured 0.90. Both branches have magnitude at most 1 - the skip path is
    // a pure delay and the sign flip is a sign - so the loop is a contraction
    // for exactly the same reason it was before, and `rho < 1` still bounds it.
    expect(peak).toBeLessThan(2.5);
  }, 120_000);

  it("never grows over a 30 second render with both at their corners", () => {
    const CORNERS: [number, number][] = [];
    for (const stretch of [1, 20]) {
      for (const blend of [1, 0.5, 0]) CORNERS.push([stretch, blend]);
    }

    for (const [stretch, blend] of CORNERS) {
      const ks = createKS(SAMPLE_RATE, MIN_FREQUENCY);
      const block = new Float32Array(BLOCK);
      let firstSecond = 0;
      let lastSecond = 0;
      let nonFinite = 0;
      const total = SAMPLE_RATE * 30;

      for (let n = 0; n < total; n += BLOCK) {
        ks(block, 1, 110, 5, 1, 1, 1, 0, 0, stretch, blend);
        for (const sample of block) {
          if (!Number.isFinite(sample)) nonFinite++;
          else if (n < SAMPLE_RATE) {
            if (Math.abs(sample) > firstSecond) firstSecond = Math.abs(sample);
          } else if (n >= total - SAMPLE_RATE) {
            if (Math.abs(sample) > lastSecond) lastSecond = Math.abs(sample);
          }
        }
      }

      expect([stretch, blend, nonFinite]).toEqual([stretch, blend, 0]);
      expect(lastSecond).toBeLessThanOrEqual(firstSecond);
    }
  }, 120_000);
});

// ---------------------------------------------------------------------------
// `Hdisp`, the last of Bank and Valimaki's three blocks: dispersion. Rauhala
// and Valimaki's tunable Thiran allpass, driven by a `stiffness` knob whose
// taper is ours. Its two structural claims - allpass, so it cannot touch the
// decay; compensated, so it cannot touch the pitch - are what the first half
// of this group asserts; the second half is the thing it is *for*.
// ---------------------------------------------------------------------------

/** The `(frequency, stiffness)` corners the design has to survive. */
const DISPERSION_GRID: [number, number][] = [];
for (const frequency of [20, 30, 55, 110, 220, 440, 880, 1760, 3000, 5000]) {
  for (const stiffness of [0.01, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
    DISPERSION_GRID.push([frequency, stiffness]);
  }
}
const MAX_DELAY = Math.ceil(SAMPLE_RATE / MIN_FREQUENCY);
const design = (frequency: number, stiffness: number) =>
  designDispersion(
    SAMPLE_RATE,
    frequency,
    stiffness,
    Math.min(SAMPLE_RATE / frequency, MAX_DELAY),
  );

/** `|A(e^jw)|` of one second-order allpass section. */
function sectionMagnitude(a1: number, a2: number, w: number) {
  const numerator = Math.hypot(
    a2 + a1 * Math.cos(w) + Math.cos(2 * w),
    -(a1 * Math.sin(w) + Math.sin(2 * w)),
  );
  const denominator = Math.hypot(
    1 + a1 * Math.cos(w) + a2 * Math.cos(2 * w),
    -(a1 * Math.sin(w) + a2 * Math.sin(2 * w)),
  );
  return numerator / denominator;
}

/** Its phase delay, `N + 2*arg Dr(e^jw)/w` - the quantity the loop pays back. */
function sectionPhaseDelay(a1: number, a2: number, w: number) {
  return (
    2 +
    (2 *
      Math.atan2(
        -(a1 * Math.sin(w) + a2 * Math.sin(2 * w)),
        1 + a1 * Math.cos(w) + a2 * Math.cos(2 * w),
      )) /
      w
  );
}

/**
 * The first `count` partials of a pluck, in Hz, tracked upwards.
 *
 * Not a fixed window around `k*f0`: a stretched partial moves by more than half
 * the spacing well before the 16th, so the search for partial `k` starts half a
 * period above the one below it. Measured on a bright, comb-free pluck, because
 * a partial that has been damped or notched out of existence cannot be located
 * - `brightness` 1 makes the loop filter a plain delay, and `position` 0
 * bypasses the pick-position comb, whose first null is near the 8th partial at
 * the shipped setting.
 */
function partialSeries(
  frequency: number,
  stiffness: number,
  count: number,
  size = SPECTRAL_WINDOW,
  polarization = 0,
  seed = 11,
) {
  // Seeded. Every partial's location is a spectral peak of a noise-excited
  // signal, so it jitters by a fraction of a bin from draw to draw: unseeded,
  // the harmonic baseline below put the 13th partial past its 2 cent bound
  // about one run in fifty. The seed fixes the draw, not the physics - the
  // dispersion this measures is deterministic given the excitation.
  const signal = withSeededNoise(seed, () =>
    pluck(
      frequency,
      3,
      0.02 + (size + BLOCK) / SAMPLE_RATE,
      1,
      1,
      1,
      0,
      0,
      1,
      1,
      stiffness,
      0, // `detune` 0: one pitch, so a partial is one line rather than two
      polarization,
    ),
  );
  const start = Math.round(0.02 * SAMPLE_RATE);
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  for (let i = 0; i < size; i++) {
    const hann = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1));
    re[i] = (signal[start + i] ?? 0) * hann;
  }
  fft(re, im);

  const magnitude = (k: number) =>
    Math.sqrt(re[k] * re[k] + im[k] * im[k]) + 1e-30;
  const bin = (hz: number) => (hz * size) / SAMPLE_RATE;
  const found: number[] = [];
  let previous = 0;
  for (let partial = 1; partial <= count; partial++) {
    const from = Math.max(2, Math.floor(bin(previous + 0.5 * frequency)));
    const to = Math.min(
      size / 2 - 2,
      Math.ceil(bin(previous + 1.9 * frequency)),
    );
    if (to <= from) break;
    let peak = from;
    for (let k = from; k <= to; k++) {
      if (magnitude(k) > magnitude(peak)) peak = k;
    }
    const a = Math.log(magnitude(peak - 1));
    const b = Math.log(magnitude(peak));
    const c = Math.log(magnitude(peak + 1));
    const denominator = a - 2 * b + c;
    const refined =
      denominator !== 0 ? peak + (0.5 * (a - c)) / denominator : peak;
    previous = (refined * SAMPLE_RATE) / size;
    found.push(previous);
  }
  return found;
}

describe("designDispersion", () => {
  // The property the whole ticket rests on. Unity magnitude at every frequency
  // means the dispersion block cannot change any partial's decay time, so
  // ticket 04's loop filter keeps sole ownership of it and ticket 02's decay
  // assertions still hold at full stiffness. The checklist asks for 0.01 dB;
  // measured, the worst deviation over this grid is 6.1e-12 dB, which is
  // double-precision arithmetic rather than a design margin.
  it("is allpass to within 0.01 dB from 20 Hz to 20 kHz, everywhere on the grid", () => {
    let worst = 0;
    for (const [frequency, stiffness] of DISPERSION_GRID) {
      const { a1, a2, phaseDelay } = design(frequency, stiffness);
      if (phaseDelay === 0) continue;
      for (let f = 20; f <= 20000; f *= 1.02) {
        const db = Math.abs(
          20 *
            Math.log10(
              sectionMagnitude(a1, a2, (2 * Math.PI * f) / SAMPLE_RATE),
            ),
        );
        if (db > worst) worst = db;
      }
    }
    expect(worst).toBeLessThan(0.01);
  });

  // Ticket 06's cautionary tale is why this is an assertion and not a comment:
  // a factor of 1.005 inside this loop reached 3.4e38. A Thiran allpass is
  // stable only for `D > N - 1` and at `D = 1` exactly it has a pole on the
  // unit circle, so `D` is clamped to `N = 2` - which is where the
  // parameterization saturates anyway, and where the section is exactly `z^-2`.
  // Measured, the worst pole radius the grid reaches is 0.985.
  it("produces stable coefficients everywhere on the grid", () => {
    let worstRadius = 0;
    for (const [frequency, stiffness] of DISPERSION_GRID) {
      const { a1, a2, phaseDelay } = design(frequency, stiffness);
      if (phaseDelay === 0) continue;
      expect([frequency, stiffness, Math.abs(a2) < 1]).toEqual([
        frequency,
        stiffness,
        true,
      ]);
      expect([frequency, stiffness, Math.abs(a1) < 1 + a2]).toEqual([
        frequency,
        stiffness,
        true,
      ]);
      const radius = Math.sqrt(Math.abs(a2));
      if (radius > worstRadius) worstRadius = radius;
    }
    expect(worstRadius).toBeLessThan(0.99);
  });

  // Rauhala and Valimaki's (1), `a_k = (-1)^k (N choose k) prod (D-N+n)/(D-N+k+n)`,
  // evaluated as the product it is written as rather than as the closed form
  // `dsp.ts` uses. Section II-D-1 says to derive the second-order case from (1)
  // by setting N = 2, and this is the assertion that says the derivation is
  // right - the equations are typeset images in that PDF and are in no text
  // extraction of it, so a transcription error would be silent.
  it("matches the Thiran design equation evaluated as a product", () => {
    for (const [frequency, stiffness] of DISPERSION_GRID) {
      const { a1, a2, phaseDelay } = design(frequency, stiffness);
      if (phaseDelay === 0) continue;
      // Recover D from `a1 = -2(D-2)/(D+1)`.
      const d = (4 - a1) / (a1 + 2);
      const N = 2;
      const product = (k: number) => {
        let value = 1;
        for (let n = 0; n <= N; n++) value *= (d - N + n) / (d - N + k + n);
        return value;
      };
      expect(a1).toBeCloseTo(-1 * 2 * product(1), 9); // (-1)^1 * (2 choose 1)
      expect(a2).toBeCloseTo(1 * 1 * product(2), 9); // (-1)^2 * (2 choose 2)
      expect(d).toBeGreaterThanOrEqual(2); // clamped at N, never below
    }
  });

  // The phase delay the loop is told to give back, against the same quantity
  // computed from the coefficients - and against `D`, which section II-D-2 says
  // is "a satisfactory approximation" for it. It is: the worst gap over this
  // grid is 0.026 samples, 0.067 cents of detuning. `dsp.ts` uses the exact
  // value anyway, because one `atan2` per block is free next to the three `exp`
  // the parameterization already costs.
  it("reports the cascade's exact phase delay at the fundamental", () => {
    let worstApproximation = 0;
    for (const [frequency, stiffness] of DISPERSION_GRID) {
      const { a1, a2, phaseDelay } = design(frequency, stiffness);
      if (phaseDelay === 0) continue;
      const w = (2 * Math.PI * frequency) / SAMPLE_RATE;
      expect(phaseDelay).toBeCloseTo(sectionPhaseDelay(a1, a2, w), 9);
      const d = (4 - a1) / (a1 + 2);
      const gap = Math.abs(d - phaseDelay);
      if (gap > worstApproximation) worstApproximation = gap;
    }
    expect(worstApproximation).toBeLessThan(0.05); // samples
  });

  // Phase delay falling with frequency is the whole mechanism: high partials go
  // round the loop faster, so they sit above the harmonic series.
  it("delays low frequencies more than high ones, which is what stretches the partials", () => {
    const { a1, a2, phaseDelay } = design(110, 1);
    expect(phaseDelay).toBeGreaterThan(2);
    let previous = Infinity;
    for (let f = 20; f < SAMPLE_RATE / 2; f *= 1.2) {
      const delay = sectionPhaseDelay(a1, a2, (2 * Math.PI * f) / SAMPLE_RATE);
      expect(delay).toBeLessThan(previous);
      previous = delay;
    }
    // "the phase delay decreases monotonically with frequency from D samples at
    // dc to N samples at the Nyquist frequency" - section II-A.
    expect(sectionPhaseDelay(a1, a2, Math.PI)).toBeCloseTo(2, 9);
  });

  it("is exactly bypassed at stiffness 0", () => {
    for (const frequency of [20, 110, 440, 5000]) {
      expect(design(frequency, 0)).toEqual({ a1: 0, a2: 0, phaseDelay: 0 });
    }
  });
});

describe("createKS stiffness", () => {
  it("costs the default path nothing: stiffness 0 is the string", () => {
    // Not "sounds the same" - the same samples. The cascade is behind one
    // boolean and it takes no share of the loop length while it is off, so a
    // default note is the pre-ticket render.
    const before = withSeededNoise(5, () => pluck(440, 1, 0.2));
    const after = withSeededNoise(5, () =>
      pluck(440, 1, 0.2, 0.5, 0.5, 0.5, 0.13, 0, 1, 1, 0),
    );
    expect(Array.from(after)).toEqual(Array.from(before));
  });

  // The baseline: a pure delay line puts every partial at an exact integer
  // multiple of f0, which is the defect this ticket exists to remove.
  it("leaves the partials harmonic at stiffness 0", () => {
    const found = partialSeries(110, 0, 16);
    expect(found.length).toBe(16);
    for (let k = 1; k <= found.length; k++) {
      expect([k, Math.abs(cents(found[k - 1], k * 110)) < 2]).toEqual([
        k,
        true,
      ]);
    }
  });

  // And the thing it is for. Partial `k` of a stiff string sits at
  // `k*f0*sqrt(1 + B*k^2)`, so the deviation from `k*f0` rises monotonically -
  // measured 0.5 / 6.5 / 38.5 / 91.8 cents at partials 2 / 4 / 8 / 16.
  it("stretches the partial series monotonically at stiffness 1", () => {
    const found = partialSeries(110, 1, 16);
    expect(found.length).toBe(16);
    const deviation = found.map((f, i) => cents(f, (i + 1) * 110));
    for (let k = 2; k < deviation.length; k++) {
      expect([k, deviation[k] > deviation[k - 1]]).toEqual([k, true]);
    }
    expect(deviation[0]).toBeCloseTo(0, 0); // the fundamental does not move
    expect(deviation[15]).toBeGreaterThan(50); // and the 16th is most of a semitone up
  });

  // Monotone in the knob, too: more stiffness, more stretch, at every partial.
  it("stretches further as the knob turns", () => {
    const at = [0, 0.25, 0.5, 0.75, 1].map((stiffness) => {
      const found = partialSeries(110, stiffness, 16);
      return cents(found[15], 16 * 110);
    });
    for (let i = 1; i < at.length; i++) {
      expect([i, at[i] > at[i - 1]]).toEqual([i, true]);
    }
  });

  // Success criterion 2, half one. The cascade's phase delay comes out of the
  // loop length - `phaseDelayCompensation`, the same bookkeeping the damping
  // filter and the interpolator go through - and it is computed at the
  // fundamental, so the fundamental is where the compensation is exact.
  //
  // Measured with the spectral estimator: dispersion is precisely a loss of
  // periodicity, which is what the autocorrelation one measures, so it is the
  // wrong tool here even before its 1.4-2.5 cents of lag resolution is counted
  // against a 5 cent tolerance.
  it.each([110, 440, 1760])(
    "does not detune the string as it sweeps, at %p Hz",
    (frequency) => {
      const measured = [0, 0.25, 0.5, 0.75, 1].map((stiffness) =>
        cents(
          spectralFundamental(
            pluck(frequency, 1, 0.5, 0.5, 0.5, 0.5, 0.13, 0, 1, 1, stiffness),
            frequency,
          ),
          frequency,
        ),
      );
      expect(Math.max(...measured) - Math.min(...measured)).toBeLessThan(5);
    },
  );

  // Success criterion 2, half two, and the consequence of the block being an
  // allpass. The bound is the same 25% the brightness sweep uses, itself well
  // inside Jarvelainen and Tolonen's 75-140% audible threshold.
  it("does not change the decay time as it sweeps", () => {
    const measured = [0, 0.5, 1].map((stiffness) =>
      averageT60(440, 1, 0.5, stiffness),
    );
    const spread = Math.max(...measured) / Math.min(...measured);
    expect(spread).toBeLessThan(1.25);
  });

  // Success criterion 4: all of ticket 02's assertions hold at `stiffness = 1`
  // as well as at 0. Its pitch, decay, amplitude and long-render groups are the
  // four re-asserted around this comment; the three below are the rest of it -
  // brightness, timbre versus tuning, and termination - re-run with the cascade
  // at full.
  //
  // Every bound here was measured before it was written, because dispersion is
  // exactly the thing that could have moved these numbers: it moves partial
  // frequencies, so a band edge fixed at 5 kHz sees a different set of partials
  // than it did at `stiffness = 0`. None of them had to move. All three are
  // ticket 02's own bounds, unwidened, and the measured values are recorded
  // above each so a later regression has something to be compared against.

  // Ticket 02's brightness group. Its two `it.each` lists at once - the three
  // pitches around 440 and the two near-integer delays - because at full
  // stiffness there is nothing left to tell them apart: what separated them was
  // the two-point interpolator's `|1 - 2*frac|` damping, ticket 04 removed it,
  // and an allpass cascade cannot put a tuning dependence back.
  //
  // Seeded and asserted on the worst of eight draws rather than on one, because
  // the quantity is a ratio of two noise-burst spectra and moves about 10 dB
  // between draws. Worst of the eight, per pitch, in dB:
  //
  //   439.4: -62.6   440.0: -62.5   440.6: -62.5   441.0: -62.6   436.6: -62.5
  //
  // against -60.4 / -60.4 / -60.5 / -60.6 / -59.0 with the cascade bypassed on
  // the same seeds. The fall is a couple of dB *deeper* with dispersion in, so
  // the -20 dB bound is ticket 02's, unchanged, with 42 dB of margin.
  it.each([439.4, 440.0, 440.6, 441.0, 436.6])(
    "loses 20 dB of its band above 5 kHz at %p Hz, at full stiffness",
    (frequency) => {
      const worst = Math.max(
        ...[1, 2, 3, 4, 5, 6, 7, 8].map((seed) =>
          withSeededNoise(seed, () => brightnessChangeDb(frequency, 0.5, 1)),
        ),
      );
      expect(worst).toBeLessThanOrEqual(-20);
    },
  );

  // Ticket 02's timbre-versus-tuning group: five pitches within 20 cents of
  // each other must still be the same instrument once the cascade is stretching
  // their partials. Its structure exactly - 16 seeds, one excitation shared
  // across the five pitches so the comparison stays paired, the mean spread
  // asserted - and its 6 dB bound, because the measurement did not move: mean
  // spread 1.61 dB at full stiffness against the ~1.9 dB the group above
  // records at 0, with a per-seed range of 0.42 to 5.43 dB.
  //
  // Which is what the design predicts. `stiffness` maps to an inharmonicity
  // coefficient `B` and the cascade's coefficients follow from `B` and f0; 20
  // cents of tuning moves f0 by 1.2%, so all five get very nearly the same
  // stretch and none of them gets a different instrument out of it.
  it("damps its high band to within 6 dB across five pitches 20 cents apart, at full stiffness", () => {
    const SEEDS = 16;
    let total = 0;
    for (let seed = 1; seed <= SEEDS; seed++) {
      const changes = [439.4, 440.0, 440.6, 441.0, 436.6].map((frequency) =>
        withSeededNoise(seed, () => brightnessChangeDb(frequency, 0.5, 1)),
      );
      total += Math.max(...changes) - Math.min(...changes);
    }
    expect(total / SEEDS).toBeLessThanOrEqual(6);
  });

  // Ticket 02's termination group, at full stiffness. The cascade is the one
  // thing in the loop that could keep a tail alive without ever raising its
  // level: it is allpass, so it removes no energy of its own, and it smears
  // each period into the next rather than handing it back intact.
  //
  // It does not. All 40 stop, the longest at 5.5 s against 5.7 s with the
  // cascade bypassed on the same seeds, and every one of them ends at -100.00
  // dBFS. That last number is structural rather than lucky: `dsp.ts` stops on
  // its own 5 ms envelope crossing `stopThreshold = 1e-5`, and the envelope
  // here uses the same coefficient, so the level at the last non-zero sample is
  // that threshold to the digit.
  //
  // Seeded, unlike ticket 02's, which takes 40 unseeded draws. Seeds 1..40 keep
  // the same 40 independent excitations and make the verdict deterministic -
  // including the loop's private xorshift, which draws its own seed from
  // `Math.random`.
  it("ends all 40 plucks at full stiffness, none of them above -100 dBFS", () => {
    const CAP_SECONDS = 100; // the longest stop measured here is 5.5 s
    const endLevels: number[] = [];

    for (let attempt = 0; attempt < 40; attempt++) {
      withSeededNoise(attempt + 1, () => {
        const ks = createKS(SAMPLE_RATE, MIN_FREQUENCY);
        const block = new Float32Array(BLOCK);
        let level = 0;
        let atLastNonZero = 0;
        let stopped = false;

        for (let n = 0; n < SAMPLE_RATE * CAP_SECONDS; n += BLOCK) {
          ks(block, 1, 440, 5, 0.5, 0.5, 0.5, 0.13, 0, 1, 1, 1);
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

        expect([attempt, stopped]).toEqual([attempt, true]);
        endLevels.push(20 * Math.log10(Math.max(atLastNonZero, 1e-30)));
      });
    }

    expect(Math.max(...endLevels)).toBeLessThanOrEqual(-100);
  }, 120_000);

  // `frequency.maxValue` is a measurement (ticket 05), and a filter that takes
  // a share of the loop length is exactly the thing that could invalidate it.
  // At 5 kHz the period is 8.82 samples and `D` has saturated to N, so the
  // cascade is a pure two-sample delay and the floor is 6.5 - still under the
  // period, and the declared maximum survives at full stiffness.
  it("still plays its declared maximum within 5 cents at full stiffness", () => {
    const MAX_FREQUENCY = PARAMS.find((p) => p.name === "frequency")!.maxValue;
    let worst = 0;
    for (let attempt = 0; attempt < 8; attempt++) {
      const signal = pluck(
        MAX_FREQUENCY,
        1,
        0.5,
        0.5,
        0.5,
        0.5,
        0.13,
        0,
        1,
        1,
        1,
      );
      const error = Math.abs(
        cents(spectralFundamental(signal, MAX_FREQUENCY), MAX_FREQUENCY),
      );
      if (error > worst) worst = error;
    }
    expect(worst).toBeLessThan(5);
  });

  // Seeded, because the quantity is the peak of a noise burst and so is a
  // random variable: unseeded, this sweep measured min 2.315, max 3.253, mean
  // 2.618 over 40 draws, and crossed 3 in 3 of them - a test that fails one run
  // in thirteen while asserting nothing that changed. Eight fixed seeds keep
  // the coverage and make the verdict deterministic.
  it("stays finite and bounded across the corners of the range", () => {
    let peak = 0;
    let nonFinite = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      withSeededNoise(seed, () => {
        for (const frequency of [20, 110, 440, 1760, 5000]) {
          for (const stiffness of [0, 0.5, 1]) {
            for (const decay of [0.01, 1, 5]) {
              for (const brightness of [0, 1]) {
                for (const sample of pluck(
                  frequency,
                  decay,
                  0.3,
                  brightness,
                  1,
                  1,
                  0.13,
                  0,
                  1,
                  1,
                  stiffness,
                )) {
                  if (!Number.isFinite(sample)) nonFinite++;
                  else if (Math.abs(sample) > peak) peak = Math.abs(sample);
                }
              }
            }
          }
        }
      });
    }
    expect(nonFinite).toBe(0);
    // An allpass has magnitude exactly 1 at every frequency, so the loop is a
    // contraction for exactly the reason it was before and `rho < 1` bounds it -
    // which the 30 second render below is what actually proves.
    //
    // It is not, however, unity gain in the *time* domain, and this sweep is
    // where that shows: `level` 1 into the pick-position comb, whose peak gain
    // is 2, already reaches 2.25 with the cascade bypassed, and 2.71 with it at
    // half stiffness. The extra 1.7 dB is a burst arriving all at once and
    // coming back out smeared, so parts of it that used to cancel now overlap.
    // The shipped defaults peak at 0.28; `level` is what buys the headroom, and
    // that is the parameter's whole job.
    //
    // The bound is 3.5 rather than 3 because 3 was below the distribution's own
    // maximum, not because anything got louder: over the eight seeds this
    // asserts, the worst corner is 3.25.
    expect(peak).toBeLessThan(3.5);
  }, 120_000);

  it("never grows over a 30 second render at full stiffness", () => {
    for (const frequency of [110, 440]) {
      const ks = createKS(SAMPLE_RATE, MIN_FREQUENCY);
      const block = new Float32Array(BLOCK);
      let firstSecond = 0;
      let lastSecond = 0;
      let nonFinite = 0;
      const total = SAMPLE_RATE * 30;

      for (let n = 0; n < total; n += BLOCK) {
        ks(block, 1, frequency, 5, 1, 1, 1, 0, 0, 1, 1, 1);
        for (const sample of block) {
          if (!Number.isFinite(sample)) nonFinite++;
          else if (n < SAMPLE_RATE) {
            if (Math.abs(sample) > firstSecond) firstSecond = Math.abs(sample);
          } else if (n >= total - SAMPLE_RATE) {
            if (Math.abs(sample) > lastSecond) lastSecond = Math.abs(sample);
          }
        }
      }

      expect([frequency, nonFinite]).toEqual([frequency, 0]);
      expect(lastSecond).toBeLessThanOrEqual(firstSecond);
    }
  }, 120_000);
});

// ---------------------------------------------------------------------------
// Two polarizations. A real string vibrates in two planes at once and they
// couple to the bridge differently, which is where the two most characteristic
// features of a string tone come from - beating, and a two-stage decay.
//
// Jarvelainen and Karjalainen 2002 section 2, read off the rendered pages
// because this paper's text layer is mis-encoded:
//
//   "The horizontal polarization is dominant at first, having a much higher
//   initial amplitude than the vertical component. However, it is decaying
//   faster than the vertical component, which after a while becomes dominant.
//   Thus the fast decaying but louder 'prompt sound' is followed by the more
//   sustained 'aftersound'."
//
// The louder component is the faster one, and that single fact fixes every sign
// in the implementation. Their section 6 supplies the tolerances asserted here.
// ---------------------------------------------------------------------------

/**
 * The amplitude envelope of one partial, by complex demodulation.
 *
 * Not the broadband envelope, and Fig. 1's caption says why: the overall
 * amplitude of a beating string shows "the complex effect of the beating
 * patterns of individual harmonics", because partial `k` beats at `k` times the
 * fundamental's rate. The criterion is about one partial's beat, so the
 * measurement isolates one - multiply by `e^(-jwt)` to bring it to dc, then
 * lowpass. Four cascaded one-poles rather than one: a single pole is 6 dB per
 * octave and leaves enough of the carrier through that the "beat rate" comes
 * back as the carrier frequency.
 */
function partialEnvelope(
  signal: Float32Array,
  frequency: number,
  fromSeconds: number,
  toSeconds: number,
  cutoff = 20,
) {
  const from = Math.round(fromSeconds * SAMPLE_RATE);
  const to = Math.min(signal.length, Math.round(toSeconds * SAMPLE_RATE));
  const w = (2 * Math.PI * frequency) / SAMPLE_RATE;
  const coefficient = 1 - Math.exp((-2 * Math.PI * cutoff) / SAMPLE_RATE);
  const POLES = 4;
  const re = new Float64Array(POLES);
  const im = new Float64Array(POLES);
  const envelope = new Float64Array(Math.max(0, to - from));
  for (let i = from; i < to; i++) {
    let real = signal[i] * Math.cos(w * i);
    let imaginary = -signal[i] * Math.sin(w * i);
    for (let pole = 0; pole < POLES; pole++) {
      re[pole] += coefficient * (real - re[pole]);
      im[pole] += coefficient * (imaginary - im[pole]);
      real = re[pole];
      imaginary = im[pole];
    }
    envelope[i - from] = Math.hypot(real, imaginary);
  }
  return envelope;
}

/**
 * The beat rate in Hz: the spectral peak of the envelope once its exponential
 * decay has been taken out, which in the log domain is a straight line.
 */
function beatRate(envelope: Float64Array) {
  let size = 1;
  while (size * 2 <= envelope.length) size *= 2;
  const log = new Float64Array(size);
  for (let i = 0; i < size; i++) log[i] = Math.log(envelope[i] + 1e-30);
  let sumX = 0;
  let sumY = 0;
  let sumXX = 0;
  let sumXY = 0;
  for (let i = 0; i < size; i++) {
    sumX += i;
    sumY += log[i];
    sumXX += i * i;
    sumXY += i * log[i];
  }
  const slope = (size * sumXY - sumX * sumY) / (size * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / size;

  const re = new Float64Array(size);
  const im = new Float64Array(size);
  for (let i = 0; i < size; i++) {
    const hann = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1));
    re[i] = (log[i] - (slope * i + intercept)) * hann;
  }
  fft(re, im);
  const power = (k: number) => re[k] * re[k] + im[k] * im[k];
  let peak = 1;
  for (let k = 1; k < size / 2; k++) if (power(k) > power(peak)) peak = k;
  const magnitude = (k: number) => Math.log(Math.sqrt(power(k)) + 1e-30);
  const a = magnitude(peak - 1);
  const b = magnitude(peak);
  const c = magnitude(peak + 1);
  const denominator = a - 2 * b + c;
  const refined =
    denominator !== 0 ? peak + (0.5 * (a - c)) / denominator : peak;
  return (refined * SAMPLE_RATE) / size;
}

/**
 * Modulation depth: the envelope divided by its own local mean over one beat
 * period, which takes out both the exponential decay and the two-stage knee and
 * leaves the modulation. For two components of amplitude `A1` and `A2` it is
 * `A2/A1`, so it reads the level difference straight back out - but only while
 * the two ratios are what they were at the pluck, which is why every use of it
 * below measures an *early* window. The two components decay at different rates
 * by design, so `A2/A1` climbs through 1 as the note rings and the depth
 * measured late is a statement about the decay difference, not the mix.
 */
function beatDepth(envelope: Float64Array, rateHz: number) {
  const period = Math.max(2, Math.round(SAMPLE_RATE / rateHz));
  const n = envelope.length;
  const running = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) running[i + 1] = running[i] + envelope[i];
  let high = -Infinity;
  let low = Infinity;
  for (let i = Math.floor(n * 0.2); i < Math.floor(n * 0.8); i++) {
    const from = Math.max(0, i - (period >> 1));
    const to = Math.min(n, i + (period >> 1));
    const value = envelope[i] / ((running[to] - running[from]) / (to - from));
    if (value > high) high = value;
    if (value < low) low = value;
  }
  return high + low > 0 ? (high - low) / (high + low) : 0;
}

/** dB per second of the broadband envelope between two instants. */
function decayRate(
  signal: Float32Array,
  fromSeconds: number,
  toSeconds: number,
) {
  const first = Math.round(fromSeconds * SAMPLE_RATE);
  const last = Math.round(toSeconds * SAMPLE_RATE);
  let level = 0;
  let atFirst = 0;
  let atLast = 0;
  for (let i = 0; i <= last && i < signal.length; i++) {
    level += ENVELOPE_COEFFICIENT * (Math.abs(signal[i]) - level);
    if (i === first) atFirst = level;
    if (i === last) atLast = level;
  }
  return (
    (20 * Math.log10(Math.max(atFirst, 1e-30) / Math.max(atLast, 1e-30))) /
    (toSeconds - fromSeconds)
  );
}

/**
 * How much faster the note falls early than late, averaged over eight plucks -
 * the two-stage decay as one number. Measured at `brightness` 1, where the
 * damping filter degenerates to a plain delay and each polarization really is
 * one exponential, so a ratio above 1 means two stages rather than "high
 * partials died first". The control below reads 1.18 there.
 */
const TWO_STAGE_PLUCKS = 8;
function twoStageRatio(polarization: number, detune = 0) {
  let total = 0;
  for (let i = 0; i < TWO_STAGE_PLUCKS; i++) {
    const signal = pluck(
      220,
      2,
      4,
      1,
      1,
      1,
      0,
      0,
      1,
      1,
      0,
      detune,
      polarization,
    );
    total += decayRate(signal, 0.05, 0.4) / decayRate(signal, 1.6, 2.6);
  }
  return total / TWO_STAGE_PLUCKS;
}

/** The level difference in dB the paper measured its thresholds against. */
const levelDifference = (polarization: number) =>
  -20 * Math.log10(polarization);

describe("createKS polarization", () => {
  it("costs the default path nothing: polarization 0 is one string", () => {
    // Not "sounds the same" - the same samples. The second string, the shared
    // burst buffer, the second delay array and the mix pass are all allocated
    // on the first block that asks for them, and nothing asks while this is 0.
    // In particular no extra `Math.random` is drawn, which is what this seeded
    // comparison would otherwise catch immediately.
    const before = withSeededNoise(11, () => pluck(440, 1, 0.2));
    const after = withSeededNoise(11, () =>
      pluck(440, 1, 0.2, 0.5, 0.5, 0.5, 0.13, 0, 1, 1, 0, 0.5, 0),
    );
    expect(Array.from(after)).toEqual(Array.from(before));
  });

  // "When the two models are slightly mistuned, a natural sounding beat effect
  // results" - Karjalainen, Valimaki and Tolonen 1998. The rate of that beat is
  // the frequency difference between the two loops, and `detune` is in cents,
  // so it scales with pitch: measured 0.633 / 1.266 Hz at 220 Hz and 1.264 /
  // 2.546 at 440, against 0.636 / 1.274 / 1.273 / 2.549 asked for. Worst error
  // over the four, 0.7%.
  it.each([220, 440])(
    "beats at the detuning, at %p Hz",
    (frequency) => {
      for (const detune of [0.5, 1]) {
        const MAX_DETUNE_CENTS = 10; // `dsp.ts`
        const expected =
          frequency * (Math.pow(2, (MAX_DETUNE_CENTS * detune) / 1200) - 1);
        const signal = pluck(
          frequency,
          5,
          6,
          1,
          0.5,
          1,
          0,
          0,
          1,
          1,
          0,
          detune,
          1,
        );
        const measured = beatRate(
          partialEnvelope(signal, frequency, 0.05, 5.8),
        );
        expect([
          frequency,
          detune,
          Math.abs(measured / expected - 1) < 0.1,
        ]).toEqual([frequency, detune, true]);
      }
    },
    60_000,
  );

  // Jarvelainen and Karjalainen section 6: "Reduction of level of the vertical
  // component was detected poorly until the level difference was about 7 dB,
  // and for differences greater than 18 dB beatings remained inaudible."
  //
  // The parameter *is* that level difference - it is the second component's
  // amplitude relative to the first, so the difference is `-20*log10(p)` - and
  // the two thresholds are therefore knob positions, 0.45 and 0.126. This is
  // the assertion that the declared range spans the region they measured and
  // that the depth tracks it.
  it("loses its beating as the level difference rises past 18 dB", () => {
    const depths = [1, 0.45, 0.25, 0.126, 0.063].map((polarization) => {
      // 1760 Hz and full `detune`, so the beat is 10.2 Hz and several cycles
      // fit in a window short enough that the two components' decay difference
      // has not yet moved their ratio - see `beatDepth`.
      const signal = pluck(
        1760,
        5,
        3,
        1,
        0.5,
        1,
        0,
        0,
        1,
        1,
        0,
        1,
        polarization,
      );
      const rate = beatRate(partialEnvelope(signal, 1760, 0.05, 2.8, 40));
      return beatDepth(partialEnvelope(signal, 1760, 0.05, 0.5, 40), rate);
    });
    // Measured 0.99 / 0.55 / 0.31 / 0.16 / 0.08 at 0 / 6.9 / 12 / 18 / 24 dB,
    // which is the amplitude ratio itself, as it should be.
    for (let i = 1; i < depths.length; i++) {
      expect([i, depths[i] < depths[i - 1]]).toEqual([i, true]);
    }
    expect(depths[0]).toBeGreaterThan(0.8); // equal strength: full modulation
    expect(depths[3]).toBeLessThan(0.2); // 18 dB apart, where the paper found it inaudible
    expect(levelDifference(0.126)).toBeCloseTo(18, 0);
    expect(levelDifference(0.45)).toBeCloseTo(7, 0);
  }, 60_000);

  // The other half of section 2: the loud component decays fast, the quiet one
  // rings on, and the sum has a knee. `detune` is 0 here, which is Karjalainen,
  // Valimaki and Tolonen's Fig. 10(b) - equal fundamentals, different loop
  // filters - so what is measured is the decay alone, with no beating in it.
  it("decays in two stages at an intermediate polarization", () => {
    // Measured 1.18 for one string, 2.67 for two.
    expect(twoStageRatio(0)).toBeLessThan(1.5);
    expect(twoStageRatio(0.25)).toBeGreaterThan(2);
  }, 120_000);

  // "If the polarization components are made equally strong, the two-stage
  // decay cannot be implemented at all" - section 6, and the reason the mix and
  // the decay difference are one knob here rather than two. The knee does not
  // vanish at equal strength, but it flattens: measured 2.67 at 12 dB apart
  // against 2.28 at 0 dB, because the crossover moves to the very start of the
  // note and there is no first stage left to hear.
  it("flattens the knee as the components approach equal strength", () => {
    expect(twoStageRatio(1)).toBeLessThan(twoStageRatio(0.25));
  }, 120_000);

  // Ticket 02's pitch assertion, in dual mode, with `detune` at 0 so there is
  // one pitch to measure. With `detune` up the pair deliberately spans up to
  // 10 cents and "the pitch" is the pair's rather than a line: measured 4.3 to
  // 5.3 cents at half detuning, which is the mistuning, not an error.
  it.each([110, 440, 1760])(
    "still plays %p Hz within 5 cents with both polarizations",
    (frequency) => {
      const signal = pluck(
        frequency,
        1,
        0.5,
        0.5,
        0.5,
        0.5,
        0.13,
        0,
        1,
        1,
        0,
        0,
        1,
      );
      expect(
        Math.abs(cents(spectralFundamental(signal, frequency), frequency)),
      ).toBeLessThan(5);
    },
  );

  // Ticket 02's decay assertion, *re-derived* rather than loosened, which is
  // what success criterion 4 asks for: two-stage decay is not one exponential,
  // so the number to compare against is the two-exponential model's own t60.
  // The weak polarization rings `POLARIZATION_TIME_CONSTANT` = 3 times as long,
  // with amplitudes `1/(1+p)` and `p/(1+p)`, so the sum reaches -60 dB later
  // than `decay` asks - 2.30 s at 12 dB apart and 2.70 s at equal strength, for
  // a `decay` of 1. `decay` is the *prompt* sound's time, which is the
  // component it is applied to.
  //
  // At `brightness` 1, where the damping filter is a plain delay and each
  // polarization really is one exponential - the same condition ticket 04's own
  // t60 assertion is made under, and for the same reason.
  it("rings past `decay` by what the two-exponential model predicts", () => {
    const RATIO = 3; // POLARIZATION_TIME_CONSTANT
    for (const polarization of [0.25, 1]) {
      const tau = 1 / Math.log(1000); // decay = 1 s
      const first = 1 / (1 + polarization);
      const second = polarization / (1 + polarization);
      const level = (t: number) =>
        first * Math.exp(-t / tau) + second * Math.exp(-t / (RATIO * tau));
      let low = 0;
      let high = 20;
      for (let i = 0; i < 200; i++) {
        const middle = (low + high) / 2;
        if (level(middle) > 0.001) low = middle;
        else high = middle;
      }
      let total = 0;
      const PLUCKS = 8;
      for (let i = 0; i < PLUCKS; i++) {
        total += t60(
          pluck(440, 1, 8, 1, 0.5, 0.5, 0.13, 0, 1, 1, 0, 0, polarization),
        );
      }
      // Measured 0.94 and 0.93 of the model. The band is Jarvelainen and
      // Tolonen's 75-140%, applied to the model rather than to `decay`.
      const ratio = total / PLUCKS / low;
      expect([polarization, ratio >= 0.75 && ratio <= 1.4]).toEqual([
        polarization,
        true,
      ]);
    }
  }, 120_000);

  // The second loop is the *final* loop, not a stripped copy: same damping
  // filter, same Lagrange read, same dispersion cascade, same probabilistic
  // variants. A second polarization built without ticket 09's cascade would put
  // its partials on the harmonic series while the first loop's were stretched,
  // so the eighth partial of the mix would sit between the two.
  it("gives the second polarization the whole string, dispersion included", () => {
    // Tracked upwards rather than searched around `8*f0`: a stretched eighth
    // partial has moved further than half the spacing, so a fixed window finds
    // the ninth.
    const eighth = (stiffness: number, polarization: number) =>
      cents(
        partialSeries(110, stiffness, 8, SPECTRAL_WINDOW, polarization)[7],
        8 * 110,
      );
    expect(Math.abs(eighth(0, 1))).toBeLessThan(2); // harmonic with both loops
    // 38.6 cents is where one dispersed string puts the eighth partial. Both
    // loops dispersed put the pair in the same place; a second polarization
    // built without the cascade would leave it half way back to harmonic.
    expect(eighth(1, 1)).toBeGreaterThan(30);
    expect(Math.abs(eighth(1, 1) - eighth(1, 0))).toBeLessThan(5);
  });

  // Seeded for the same reason as the stiffness sweep above: the peak of a
  // noise burst is a random variable. This one measured min 1.955, max 2.518,
  // mean 2.067 over 40 draws, so it was not failing - but an unseeded peak
  // bound is a flake waiting for a change that shifts the mean.
  it("stays finite and bounded across the corners of the range", () => {
    let peak = 0;
    let nonFinite = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      withSeededNoise(seed, () => {
        for (const frequency of [20, 110, 440, 1760, 5000]) {
          for (const polarization of [0, 0.5, 1]) {
            for (const detune of [0, 1]) {
              for (const stiffness of [0, 1]) {
                for (const sample of pluck(
                  frequency,
                  1,
                  0.3,
                  0.5,
                  1,
                  1,
                  0.13,
                  0,
                  1,
                  1,
                  stiffness,
                  detune,
                  polarization,
                )) {
                  if (!Number.isFinite(sample)) nonFinite++;
                  else if (Math.abs(sample) > peak) peak = Math.abs(sample);
                }
              }
            }
          }
        }
      });
    }
    expect(nonFinite).toBe(0);
    // The mix is a convex combination - the weights are `1/(1+p)` and
    // `p/(1+p)` and they sum to 1 - so it can never exceed the louder of the
    // two strings, and the bound is the single-string one rather than twice it.
    expect(peak).toBeLessThan(3);
  }, 120_000);

  it("never grows over a 30 second render with both polarizations", () => {
    for (const polarization of [0.5, 1]) {
      const ks = createKS(SAMPLE_RATE, MIN_FREQUENCY);
      const block = new Float32Array(BLOCK);
      let firstSecond = 0;
      let lastSecond = 0;
      let nonFinite = 0;
      const total = SAMPLE_RATE * 30;

      for (let n = 0; n < total; n += BLOCK) {
        ks(block, 1, 110, 5, 1, 1, 1, 0, 0, 1, 1, 1, 1, polarization);
        for (const sample of block) {
          if (!Number.isFinite(sample)) nonFinite++;
          else if (n < SAMPLE_RATE) {
            if (Math.abs(sample) > firstSecond) firstSecond = Math.abs(sample);
          } else if (n >= total - SAMPLE_RATE) {
            if (Math.abs(sample) > lastSecond) lastSecond = Math.abs(sample);
          }
        }
      }

      expect([polarization, nonFinite]).toEqual([polarization, 0]);
      expect(lastSecond).toBeLessThanOrEqual(firstSecond);
    }
  }, 120_000);
});

// ---------------------------------------------------------------------------
// Tension modulation. A hard pluck stretches the string, which raises its
// tension, which raises its pitch - and it all slides back down as the
// vibration decays.
//
// Two papers converge on the implementation, and that convergence is the
// ticket. Avanzini, Marogna and Bank 2012: "the short-time average of the
// tension variation, which is responsible for pitch glides, is approximately
// proportional to the system energy." Jarvelainen and Valimaki 2001, describing
// how they built the stimuli for their listening test: "The pitch contour
// decreased exponentially with time from the highest value towards the steady
// state fundamental frequency. The time constant of the frequency descent was
// 50% of the overall time constant of amplitude decay."
//
// A descent whose time constant is half the amplitude's is a descent
// proportional to amplitude *squared*, which is energy. The same statement,
// derived twice.
// ---------------------------------------------------------------------------

/** The four fundamentals Jarvelainen and Valimaki measured, and what they found. */
const GLIDE_PITCHES = [116.5, 196, 349.23, 659.26];
const GLIDE_THRESHOLDS = [3.1, 4.4, 5.4, 11.7]; // Hz, section 3.1

/**
 * The extent of the initial pitch glide in Hz: the pitch of a short window at
 * the attack minus the settled pitch of a long window in the tail.
 *
 * Measured at `decay` 5, where the pitch time constant this module produces is
 * `decay/(2*ln 1000)` = 0.36 s - within a hair of the 0.39 s their own stimuli
 * used - so a 2048-point window at the attack averages over 46 ms of a 0.36 s
 * exponential and reads 94% of the peak rather than 74%. It still reads low, by
 * that 6% and by whatever the estimator loses to a peak that is moving while it
 * is being measured; the numbers below are the measured ones, not the modelled.
 *
 * `brightness` 1 and no comb, so every partial survives to be measured and none
 * of the spectrum has a notch in it.
 */
const GLIDE_PLUCKS = 6;
function glideExtent(frequency: number, tension: number, level = 1) {
  let total = 0;
  // Seeded, and averaged: the burst is a random draw, so both the energy that
  // drives the glide and the spectral estimate of a peak that is moving while
  // it is measured are random variables. Six fixed seeds keep the verdict
  // deterministic and the numbers in the comments reproducible.
  for (let i = 0; i < GLIDE_PLUCKS; i++) {
    const signal = withSeededNoise(i + 1, () =>
      pluck(frequency, 5, 4, 1, level, 1, 0, 0, 1, 1, 0, 0.5, 0, tension),
    );
    const attack = spectralFundamental(signal, frequency, 0, 2048);
    const settled = spectralFundamental(
      signal,
      frequency,
      Math.round(2.5 * SAMPLE_RATE),
      SPECTRAL_WINDOW,
    );
    total += attack - settled;
  }
  return total / GLIDE_PLUCKS;
}

describe("createKS tension", () => {
  it("costs the default path nothing: tension 0 is the string", () => {
    // Not "sounds the same" - the same samples. The burst's energy is not even
    // accumulated while this is 0, and the read is the constant-delay one.
    const before = withSeededNoise(13, () => pluck(440, 1, 0.2));
    const after = withSeededNoise(13, () =>
      pluck(440, 1, 0.2, 0.5, 0.5, 0.5, 0.13, 0, 1, 1, 0, 0.5, 0, 0),
    );
    expect(Array.from(after)).toEqual(Array.from(before));
  });

  // Jarvelainen and Valimaki section 3.1: "The mean thresholds were 3.1 Hz,
  // 4.4 Hz, 5.4 Hz, and 11.7 Hz" at the four fundamentals below. The checklist
  // asks for mid-range to land "on the order of" those at a full-level pluck
  // and for the top of the range to "clearly exceed" them. Measured:
  //
  //   tension 0.5:  2.89 / 5.57 / 8.92 / 15.68 Hz  (0.93 / 1.27 / 1.65 / 1.34x)
  //   tension 1:    6.03 / 10.47 / 19.09 / 31.60 Hz  (1.94 / 2.38 / 3.53 / 2.70x)
  it("glides by about what the detection thresholds are, at mid-range", () => {
    GLIDE_PITCHES.forEach((frequency, i) => {
      const ratio = glideExtent(frequency, 0.5) / GLIDE_THRESHOLDS[i];
      expect([frequency, ratio > 0.5 && ratio < 2]).toEqual([frequency, true]);
    });
  }, 120_000);

  it("glides unmistakably past them at the top of the range", () => {
    GLIDE_PITCHES.forEach((frequency, i) => {
      const ratio = glideExtent(frequency, 1) / GLIDE_THRESHOLDS[i];
      expect([frequency, ratio > 1.5]).toEqual([frequency, true]);
    });
  }, 120_000);

  // Success criterion 2. Their Fig. 1 is a recorded electric guitar tone whose
  // fundamental "decreases exponentially with time from 499 to 496 Hz, giving a
  // glide extent of approximately 3 Hz" - which is what a physically-scaled
  // glide looks like, and it sits at a tenth of this knob. Measured 2.75 Hz.
  it("puts the recorded guitar of their Fig. 1 at a tenth of the range", () => {
    const measured = glideExtent(499, 0.1);
    expect(measured).toBeGreaterThan(1.5);
    expect(measured).toBeLessThan(4.5);
  }, 60_000);

  // Success criterion 1, and the entire physical point: the glide is driven by
  // the energy the pluck put in, which is `level^2`. Measured 0.93 / 2.63 /
  // 5.29 / 8.92 Hz at levels 0.25 / 0.5 / 0.75 / 1 - monotone, and a factor of
  // 9.5 across the range. Not the full 16 that `level^2` alone would give,
  // because a bigger glide smears the moving peak the estimator is reading.
  it("glides less on a soft pluck than on a hard one", () => {
    const measured = [0.25, 0.5, 0.75, 1].map((level) =>
      glideExtent(349.23, 0.5, level),
    );
    for (let i = 1; i < measured.length; i++) {
      expect([i, measured[i] > measured[i - 1]]).toEqual([i, true]);
    }
    expect(measured[3] / measured[0]).toBeGreaterThan(4);
  }, 120_000);

  // The contour, against the rule section 2.1 states: the pitch descent's time
  // constant is half the amplitude decay's. That falls out of the energy model
  // rather than being tuned in - energy is amplitude squared - so this is the
  // assertion that the two papers really do describe the same curve. Measured
  // excess 21.3 / 15.7 / 11.5 / 6.6 / 2.6 Hz at 0 / 0.1 / 0.2 / 0.4 / 0.8 s
  // against a model of 20.8 / 15.8 / 12.0 / 6.9 / 2.3 - worst error 13%.
  it("descends exponentially with half the amplitude decay's time constant", () => {
    const DECAY = 5;
    const frequency = 349.23;
    const tau = DECAY / Math.log(1000) / 2; // "50% of the overall time constant"
    const peak = frequency * (Math.pow(2, 1 / 12) - 1); // `tension` 1, full level
    const signal = withSeededNoise(1, () =>
      pluck(frequency, DECAY, 5, 1, 1, 1, 0, 0, 1, 1, 0, 0.5, 0, 1),
    );
    const settled = spectralFundamental(
      signal,
      frequency,
      Math.round(3.5 * SAMPLE_RATE),
      SPECTRAL_WINDOW,
    );
    for (const at of [0, 0.1, 0.2, 0.4, 0.8]) {
      const excess =
        spectralFundamental(
          signal,
          frequency,
          Math.round(at * SAMPLE_RATE),
          2048,
        ) - settled;
      const model = peak * Math.exp(-at / tau);
      expect([at, Math.abs(excess / model - 1) < 0.25]).toEqual([at, true]);
    }
  }, 60_000);

  // Ticket 02's pitch assertion, re-derived rather than deleted, which is what
  // success criterion 5 asks for: with `tension` up the pitch is a glide, so
  // "the pitch" is the settled pitch of the tail. The energy decays to zero and
  // the modulation factor with it, so the string ends up exactly where
  // `frequency` asked - measured within 0.41 cents at every pitch and tension.
  it.each([110, 440, 1760])(
    "settles on %p Hz within 5 cents at every tension",
    (frequency) => {
      for (const tension of [0, 0.5, 1]) {
        const signal = withSeededNoise(1, () =>
          pluck(frequency, 3, 2.5, 1, 1, 1, 0, 0, 1, 1, 0, 0.5, 0, tension),
        );
        const settled = spectralFundamental(
          signal,
          frequency,
          Math.round(1.5 * SAMPLE_RATE),
          SPECTRAL_WINDOW,
        );
        expect([tension, Math.abs(cents(settled, frequency)) < 5]).toEqual([
          tension,
          true,
        ]);
      }
    },
  );

  // Success criterion 4. The energy is open loop - it is seeded by the pluck and
  // decays with `rho`, and the loop's own signal never enters it - so there is
  // no path by which the delay drives its own modulation, which is the failure
  // Pakarinen et al. 2005 section 7 report for models where "the TMDF mechanism
  // continuously feeds energy to the string". The modulation factor is in (0, 1]
  // by construction and the result is clamped to the same range every other read
  // is, so this is bounded by construction and the render is the proof.
  it("stays bounded over 60 seconds at maximum tension, at every corner", () => {
    for (const frequency of [20, 110, 440, 5000]) {
      const ks = createKS(SAMPLE_RATE, MIN_FREQUENCY);
      const block = new Float32Array(BLOCK);
      let firstSecond = 0;
      let lastSecond = 0;
      let nonFinite = 0;
      const total = SAMPLE_RATE * 60;

      for (let n = 0; n < total; n += BLOCK) {
        // Every loop parameter at a corner at once: no damping tilt, maximum
        // stretch, the drum's sign flips, full dispersion, both polarizations.
        ks(
          block,
          n === 0 ? 1 : 0,
          frequency,
          5,
          0,
          1,
          1,
          0,
          0,
          20,
          0,
          1,
          1,
          1,
          1,
        );
        for (const sample of block) {
          if (!Number.isFinite(sample)) nonFinite++;
          else if (n < SAMPLE_RATE) {
            if (Math.abs(sample) > firstSecond) firstSecond = Math.abs(sample);
          } else if (n >= total - SAMPLE_RATE) {
            if (Math.abs(sample) > lastSecond) lastSecond = Math.abs(sample);
          }
        }
      }

      expect([frequency, nonFinite]).toEqual([frequency, 0]);
      expect(lastSecond).toBeLessThanOrEqual(firstSecond);
    }
  }, 240_000);

  // Seeded, because the quantity is the peak of a noise burst and so is a
  // random variable - the same reason the two sweeps above it are.
  it("stays finite and in scale across the corners of the range", () => {
    let peak = 0;
    let nonFinite = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      withSeededNoise(seed, () => {
        for (const frequency of [20, 110, 440, 1760, 5000]) {
          for (const tension of [0, 0.5, 1]) {
            for (const level of [0.5, 1]) {
              for (const sample of pluck(
                frequency,
                1,
                0.3,
                0.5,
                level,
                1,
                0.13,
                0,
                1,
                1,
                0,
                0.5,
                0,
                tension,
              )) {
                if (!Number.isFinite(sample)) nonFinite++;
                else if (Math.abs(sample) > peak) peak = Math.abs(sample);
              }
            }
          }
        }
      });
    }
    expect(nonFinite).toBe(0);
    expect(peak).toBeLessThan(3);
  }, 120_000);
});

// ---------------------------------------------------------------------------
// The gesture vocabulary: damp, re-pluck without erasing, legato.
//
// Laurson, Erkut, Valimaki and Kuuskankare 2001 keep the loop-filter
// coefficients time-varying for exactly these two reasons: "they must be
// changed, for example, during attenuation or re-plucking of the string". This
// group is the assertion that both work, and the folder README's exit criterion
// - "the string can be damped and re-plucked without being erased" - is the
// pair of tests at the top of it.
// ---------------------------------------------------------------------------

type Gesture = {
  trigger?: number;
  frequency?: number;
  decay?: number;
  brightness?: number;
  level?: number;
  dynamics?: number;
  position?: number;
  polarization?: number;
  tension?: number;
  damp?: number;
};

/**
 * Renders `seconds`, asking `at` for the parameter values at the start of each
 * block - which is how a player's hands reach a k-rate worklet. `pluck` above
 * holds one trigger for a whole render and cannot express a gesture; this can.
 */
function perform(seconds: number, at: (second: number) => Gesture) {
  const ks = createKS(SAMPLE_RATE, MIN_FREQUENCY);
  const output = new Float32Array(Math.ceil(SAMPLE_RATE * seconds));
  const block = new Float32Array(BLOCK);
  for (let n = 0; n < output.length; n += BLOCK) {
    const p = at(n / SAMPLE_RATE);
    ks(
      block,
      p.trigger ?? 0,
      p.frequency ?? 440,
      p.decay ?? 1,
      p.brightness ?? 0.5,
      p.level ?? 0.5,
      p.dynamics ?? 0.5,
      p.position ?? 0.13,
      0,
      1,
      1,
      0,
      0.5,
      p.polarization ?? 0,
      p.tension ?? 0,
      p.damp ?? 0,
    );
    output.set(block.subarray(0, Math.min(BLOCK, output.length - n)), n);
  }
  return output;
}

/** The 5 ms envelope `dsp.ts` stops on, as a whole signal. */
function envelopeOf(signal: Float32Array) {
  const envelope = new Float64Array(signal.length);
  let level = 0;
  for (let i = 0; i < signal.length; i++) {
    level += ENVELOPE_COEFFICIENT * (Math.abs(signal[i]) - level);
    envelope[i] = level;
  }
  return envelope;
}

/** Energy in `[low, high)` of one window, for the band comparison below. */
function bandEnergy(
  signal: Float32Array,
  start: number,
  size: number,
  low: number,
  high: number,
) {
  const energy = spectrum(signal, start, size);
  let total = 0;
  for (let k = 1; k < size / 2; k++) {
    const frequency = (k * SAMPLE_RATE) / size;
    if (frequency >= low && frequency < high) total += energy[k];
  }
  return total;
}

const DAMP_MUTE_TIME = 0.05; // `dsp.ts`, and the number the comment documents

describe("createKS as an instrument", () => {
  // The folder README's exit criterion, first half. A pluck used to begin with
  // `line.fill(0)` and a reset of every filter state, which is the one thing a
  // real string never does: a string already ringing when you pluck it again
  // keeps its energy and gets more added.
  //
  // Two assertions, because "adds" and "does not erase" are different claims.
  it("adds a re-pluck to a ringing string instead of resetting it", () => {
    let quiet = 0;
    let loud = 0;
    const PLUCKS = 8;
    for (let seed = 1; seed <= PLUCKS; seed++) {
      const plain = withSeededNoise(seed, () =>
        perform(0.6, (t) => ({
          trigger: t < 0.01 ? 1 : 0,
          decay: 3,
          level: 1,
          dynamics: 1,
        })),
      );
      const again = withSeededNoise(seed, () =>
        perform(0.6, (t) => ({
          trigger: t < 0.01 || (t >= 0.3 && t < 0.31) ? 1 : 0,
          decay: 3,
          level: 1,
          dynamics: 1,
        })),
      );
      const at = Math.round(0.35 * SAMPLE_RATE);
      quiet += (20 * Math.log10(envelopeOf(plain)[at])) / PLUCKS;
      loud += (20 * Math.log10(envelopeOf(again)[at])) / PLUCKS;

      // And nothing before the re-pluck moved. An erase would have zeroed the
      // line, so this is the assertion that the memset is gone rather than
      // merely masked by the new burst.
      const before = Math.round(0.3 * SAMPLE_RATE) - 100;
      expect(Array.from(again.subarray(before, before + 64))).toEqual(
        Array.from(plain.subarray(before, before + 64)),
      );
    }
    // Measured -25.2 dBFS against -13.9: 11.3 dB of energy added, where an
    // erase-and-refill would have landed at the same level as the first pluck.
    expect(loud - quiet).toBeGreaterThan(6);
  }, 60_000);

  // The sharpest form of the same claim: a re-pluck whose burst is *silent* is
  // a no-op. If `pluck` still cleared the line this would stop the note dead;
  // instead the ringing string carries on to the sample, -24.89 dBFS either way.
  it("leaves a ringing string untouched when the re-pluck is silent", () => {
    const plain = withSeededNoise(1, () =>
      perform(0.6, (t) => ({
        trigger: t < 0.01 ? 1 : 0,
        decay: 3,
        level: 1,
        dynamics: 1,
      })),
    );
    const silent = withSeededNoise(1, () =>
      perform(0.6, (t) => ({
        trigger: t < 0.01 || (t >= 0.3 && t < 0.31) ? 1 : 0,
        decay: 3,
        level: t >= 0.3 ? 0 : 1,
        dynamics: 1,
      })),
    );
    const at = Math.round(0.4 * SAMPLE_RATE);
    expect(20 * Math.log10(envelopeOf(silent)[at])).toBeCloseTo(
      20 * Math.log10(envelopeOf(plain)[at]),
      1,
    );
  });

  // The other half of the exit criterion. `damp` raises the loop's loss towards
  // a 50 ms decay time, so a note that was going to ring for three seconds is
  // gone in a twentieth of one. Measured 53.4 / 47.0 / 47.5 ms to -60 dBFS.
  it.each([110, 440, 1760])(
    "mutes a ringing %p Hz note inside the documented time",
    (frequency) => {
      let total = 0;
      const PLUCKS = 8;
      for (let seed = 1; seed <= PLUCKS; seed++) {
        const signal = withSeededNoise(seed, () =>
          perform(1.2, (t) => ({
            trigger: t < 0.01 ? 1 : 0,
            frequency,
            decay: 3,
            brightness: 1,
            level: 1,
            dynamics: 1,
            damp: t >= 0.5 ? 1 : 0,
          })),
        );
        const envelope = envelopeOf(signal);
        const from = Math.round(0.5 * SAMPLE_RATE);
        let muted = Infinity;
        for (let i = from; i < envelope.length; i++) {
          if (envelope[i] < 1e-3) {
            muted = (i - from) / SAMPLE_RATE;
            break;
          }
        }
        total += muted / PLUCKS;
      }
      // The 110 Hz case runs a little over because the loss is applied once per
      // period and one period there is 9 ms of the 50.
      expect(total).toBeLessThan(1.3 * DAMP_MUTE_TIME);
      expect(total).toBeGreaterThan(0.5 * DAMP_MUTE_TIME);
    },
    60_000,
  );

  // The knob is geometric in the decay time - `decay^(1-damp) * 0.05^damp` -
  // because adding loss linearly would put the whole mute in the bottom fifth of
  // the range. Measured t60 after engaging: 0.955 / 0.436 / 0.191 / 0.080 /
  // 0.039 s against a model of 1.000 / 0.473 / 0.224 / 0.106 / 0.050. It reads
  // consistently short because the envelope follower's own 5 ms time constant
  // cannot track a 39 ms t60, which is why the tolerance is 25% rather than 5%.
  it("shortens the decay geometrically across its range", () => {
    const measured = [0, 0.25, 0.5, 0.75, 1].map((damp) => {
      let total = 0;
      const PLUCKS = 8;
      for (let seed = 1; seed <= PLUCKS; seed++) {
        const signal = withSeededNoise(seed, () =>
          perform(4, (t) => ({
            trigger: t < 0.01 ? 1 : 0,
            decay: 1,
            brightness: 1,
            level: 1,
            dynamics: 1,
            damp: t >= 0.5 ? damp : 0,
          })),
        );
        const envelope = envelopeOf(signal);
        const from = Math.round(0.55 * SAMPLE_RATE);
        const reference = envelope[from];
        let fell = Infinity;
        for (let i = from; i < envelope.length; i++) {
          if (envelope[i] < reference / 1000) {
            fell = (i - from) / SAMPLE_RATE;
            break;
          }
        }
        total += fell / PLUCKS;
      }
      return total;
    });
    for (let i = 1; i < measured.length; i++) {
      expect([i, measured[i] < measured[i - 1]]).toEqual([i, true]);
    }
    [0, 0.25, 0.5, 0.75, 1].forEach((damp, i) => {
      const model = Math.pow(DAMP_MUTE_TIME, damp); // decay = 1 s
      expect([damp, Math.abs(measured[i] / model - 1) < 0.25]).toEqual([
        damp,
        true,
      ]);
    });
  }, 120_000);

  // The reason `damp` scales the loop gain rather than the output. Muting
  // through the loop is the same mechanism as decaying, so the string keeps its
  // own spectral tilt on the way down and dies dark; an output gain would take
  // every band down by exactly the same number of dB, by construction.
  //
  // Measured 30 ms into a mute at the shipped brightness: the 3-10 kHz band
  // loses 46.2 dB where 300-1500 Hz loses 42.5.
  it("keeps losing its high partials first while it mutes", () => {
    let high = 0;
    let low = 0;
    const PLUCKS = 8;
    for (let seed = 1; seed <= PLUCKS; seed++) {
      const signal = withSeededNoise(seed, () =>
        perform(1.2, (t) => ({
          trigger: t < 0.01 ? 1 : 0,
          decay: 3,
          level: 1,
          dynamics: 1,
          position: 0,
          damp: t >= 0.5 ? 1 : 0,
        })),
      );
      const before = Math.round(0.49 * SAMPLE_RATE);
      const after = Math.round(0.53 * SAMPLE_RATE);
      high +=
        energyDb(
          bandEnergy(signal, after, 1024, 3000, 10000),
          bandEnergy(signal, before, 1024, 3000, 10000),
        ) / PLUCKS;
      low +=
        energyDb(
          bandEnergy(signal, after, 1024, 300, 1500),
          bandEnergy(signal, before, 1024, 300, 1500),
        ) / PLUCKS;
    }
    expect(high).toBeLessThan(low - 2);
  }, 60_000);

  // Legato: the pitch changes without a new excitation. Ticket 06 made
  // `frequency` drive the loop length every block whether or not there is a
  // trigger; what this ticket had to remove was the delay *snap* inside `pluck`,
  // which would have stepped the read index under a ringing string. Measured
  // 220.10 Hz before and 329.84 after.
  it("changes pitch without a trigger, and without a click", () => {
    const signal = withSeededNoise(1, () =>
      perform(0.8, (t) => ({
        trigger: t < 0.01 ? 1 : 0,
        frequency: t < 0.3 ? 220 : 330,
        decay: 3,
        level: 1,
        dynamics: 1,
      })),
    );
    const WINDOW = 4096;
    expect(
      Math.abs(
        cents(
          spectralFundamental(
            signal,
            220,
            Math.round(0.15 * SAMPLE_RATE),
            WINDOW,
          ),
          220,
        ),
      ),
    ).toBeLessThan(10);
    expect(
      Math.abs(
        cents(
          spectralFundamental(
            signal,
            330,
            Math.round(0.5 * SAMPLE_RATE),
            WINDOW,
          ),
          330,
        ),
      ),
    ).toBeLessThan(10);

    // And no step at the block boundaries, which is where a snapped delay would
    // put one - the same measurement ticket 06's slide assertions use. Measured
    // 0.967 against a bound of 1.5.
    let atBoundary = 0;
    let between = 0;
    let boundaries = 0;
    let interior = 0;
    for (
      let i = Math.round(0.05 * SAMPLE_RATE);
      i < Math.round(0.75 * SAMPLE_RATE);
      i++
    ) {
      const step = Math.abs(signal[i] - signal[i - 1]);
      if (i % BLOCK === 0) {
        atBoundary += step;
        boundaries++;
      } else {
        between += step;
        interior++;
      }
    }
    expect(atBoundary / boundaries / (between / interior)).toBeLessThan(1.5);
  });

  // Success criterion 4, with the two things this ticket changed around it: the
  // pluck lands mid-block onto a string that is already ringing and being
  // damped, and it still lands where it was scheduled rather than at the block
  // boundary.
  it("still starts an a-rate pluck mid-block onto a damped, ringing string", () => {
    const AT = 64;
    // Two identical strings, driven identically under the same seed: plucked,
    // then rung on for twenty blocks with the mute engaged. On the last block
    // one of them gets a rising edge at sample 64 and the other does not.
    const drive = (replucked: boolean) =>
      withSeededNoise(1, () => {
        const ks = createKS(SAMPLE_RATE, MIN_FREQUENCY);
        const block = new Float32Array(BLOCK);
        const trigger = new Float32Array(BLOCK);
        const render = (damp: number) =>
          ks(
            block,
            trigger,
            440,
            3,
            0.5,
            1,
            1,
            0.13,
            0,
            1,
            1,
            0,
            0.5,
            0,
            0,
            damp,
          );
        trigger.fill(1);
        render(0); // the first pluck
        trigger.fill(0);
        for (let n = 0; n < 20; n++) render(1); // ringing, and being damped
        if (replucked) trigger.fill(1, AT);
        render(1);
        return Float32Array.from(block);
      });

    const quiet = drive(false);
    const again = drive(true);
    // Identical up to the scheduled sample - the pluck did not get quantised to
    // the block boundary, and it did not erase what was already ringing.
    expect(Array.from(again.subarray(0, AT))).toEqual(
      Array.from(quiet.subarray(0, AT)),
    );
    // And different from it onwards, which is the pluck landing.
    expect(Array.from(again.subarray(AT))).not.toEqual(
      Array.from(quiet.subarray(AT)),
    );
  });

  it("stays finite and in scale with every gesture at once", () => {
    let peak = 0;
    let nonFinite = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      withSeededNoise(seed, () => {
        for (const frequency of [20, 110, 440, 5000]) {
          for (const damp of [0, 0.5, 1]) {
            const signal = perform(0.4, (t) => ({
              // Re-plucked every 50 ms, damped throughout, both polarizations,
              // full tension - a gesture nobody would play, held for 0.4 s.
              trigger: Math.floor(t / 0.05) % 2 === 0 ? 1 : 0,
              frequency,
              decay: 5,
              level: 1,
              dynamics: 1,
              polarization: 1,
              tension: 1,
              damp,
            }));
            for (const sample of signal) {
              if (!Number.isFinite(sample)) nonFinite++;
              else if (Math.abs(sample) > peak) peak = Math.abs(sample);
            }
          }
        }
      });
    }
    expect(nonFinite).toBe(0);
    // A re-pluck adds to what is there, so the bound is above the single-pluck
    // one: `level` 1 into the comb (peak gain 2) on top of a ringing string.
    expect(peak).toBeLessThan(4);
  }, 120_000);
});
