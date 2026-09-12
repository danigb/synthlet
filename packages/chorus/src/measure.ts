/**
 * What a chorus does, measured from rendered audio.
 *
 * The suite this file serves exists because the one it replaced could not have
 * failed: `worklet.test.ts` asserted that the output was finite, that it was
 * not all zeros, and that the descriptors matched a snapshot. All four
 * parameters being wired to the wrong four things passed it, a sine table
 * holding a cosine passed it, and an LFO capped at a seventh of its intended
 * range passed it. Nothing in it knew what a chorus was.
 *
 * So every reading here is a physical quantity taken from the output signal -
 * delay in milliseconds, LFO rate in hertz, excursion in milliseconds, detune
 * in cents - and never a parameter read back. That is the whole difference
 * between a stability test and a correctness test.
 *
 * The generic instruments (`magnitudes`, `fundamental`, `maxAbsoluteDifference`)
 * are in `_spectrum.ts`, shared across packages so their numbers are
 * comparable. These four are chorus-specific and stay here; they move to
 * `scripts/_spectrum.ts` when a second package needs them, not before.
 *
 * **Test-only.** `index.ts` never imports this file, so `tsup` never bundles
 * it and `esbuild` never sees it. `spectrum.test.ts` asserts that.
 */
import { fft, render } from "./_spectrum";

/** The shape `render` drives: a `dsp.ts` factory's return value. */
export type Engine = {
  update(...params: number[]): void;
  compute(
    inL: Float32Array,
    inR: Float32Array,
    outL: Float32Array,
    outR: Float32Array,
  ): void;
};

export type TapOptions = {
  sampleRate: number;
  /**
   * Samples rendered before the impulse. The engines here smooth their
   * parameters towards a target, so the impulse has to arrive after the
   * smoother has arrived: the Faust engine's `0.999` poles settle to within
   * 1e-4 in about 14 k samples, and 200 k is 4 seconds - long enough for
   * anything, and cheap enough not to have to think about it again.
   */
  warmup?: number;
  /** Output samples searched for taps. 8192 covers 85 ms at 96 kHz. */
  length?: number;
  /** Tap floor, as a fraction of the loudest sample in the window. */
  relative?: number;
};

export type Tap = {
  /** Where the tap is, in milliseconds after the impulse. */
  ms: number;
  /** Its largest absolute sample. */
  height: number;
};

/**
 * Tap positions in milliseconds, from an impulse.
 *
 * A fractionally-read tap spreads across the interpolator's support - two
 * samples for a linear read, four for Hermite - so a run of consecutive
 * samples above the floor is one tap, and its position is the run's
 * amplitude-weighted centroid rather than its peak. The dry path, if there is
 * one, is the tap at 0 ms and its height is the dry gain.
 */
export function taps(
  make: () => Engine,
  params: readonly number[],
  options: TapOptions,
): Tap[] {
  const {
    sampleRate,
    warmup = 200000,
    length = 8192,
    relative = 0.02,
  } = options;
  const input = new Float32Array(warmup + length);
  input[warmup] = 1;
  const [left] = render(make(), {
    length,
    sampleRate,
    warmup,
    input,
    params,
  });

  let peak = 0;
  for (let i = 0; i < left.length; i++)
    peak = Math.max(peak, Math.abs(left[i]));
  const floor = peak * relative;

  const found: Tap[] = [];
  let i = 0;
  while (i < left.length) {
    if (Math.abs(left[i]) <= floor) {
      i++;
      continue;
    }
    let weight = 0;
    let weighted = 0;
    let height = 0;
    while (i < left.length && Math.abs(left[i]) > floor) {
      const w = Math.abs(left[i]);
      weight += w;
      weighted += w * i;
      height = Math.max(height, w);
      i++;
    }
    found.push({ ms: (weighted / weight / sampleRate) * 1000, height });
  }
  return found;
}

/**
 * Peak excursion of the first moving tap, in milliseconds, by sampling the tap
 * position at `steps` points around one LFO cycle.
 *
 * Each point is a separate render from a fresh engine with a different warm-up
 * length, which is what puts the LFO at a different phase when the impulse
 * arrives. Reading it this way rather than freezing the LFO keeps the
 * measurement honest about a moving read: it is the same thing an ear hears,
 * and it does not depend on a parameter value being out of range to work.
 */
export function excursionMs(
  make: () => Engine,
  params: readonly number[],
  options: TapOptions & { rateHz: number; steps?: number; tap?: number },
) {
  const { rateHz, steps = 16, tap = 1, sampleRate } = options;
  const warmup = options.warmup ?? 200000;
  const period = sampleRate / rateHz;
  let low = Infinity;
  let high = -Infinity;
  for (let k = 0; k < steps; k++) {
    const at = taps(make, params, {
      ...options,
      warmup: Math.round(warmup + (k * period) / steps),
    });
    if (at.length <= tap) continue;
    low = Math.min(low, at[tap].ms);
    high = Math.max(high, at[tap].ms);
  }
  return (high - low) / 2;
}

/**
 * Amplitude envelope of a signal, one-poled and decimated.
 *
 * The one-pole's corner is around 3.8 Hz at 48 kHz, so the audio is gone and
 * only the modulation survives; decimating by `hop` then removes samples the
 * autocorrelation below could not use anyway, and turns a 30-second search
 * from hours into milliseconds. The mean is removed because an envelope is
 * positive and its DC would swamp every lag.
 */
export function envelope(signal: ArrayLike<number>, hop = 256) {
  const out: number[] = [];
  let state = 0;
  for (let i = 0; i < signal.length; i++) {
    state += 0.0005 * (Math.abs(signal[i]) - state);
    if (i % hop === 0) out.push(state);
  }
  let mean = 0;
  for (const value of out) mean += value;
  mean /= out.length;
  return out.map((value) => value - mean);
}

/**
 * LFO rate in hertz, by autocorrelation of the amplitude envelope.
 *
 * The first peak within 10 % of the best rather than the best peak, and a
 * parabola through it - the same two guards `fundamental` uses in
 * `_spectrum.ts`, and for the same reason: a periodic envelope correlates just
 * as well at two periods as at one.
 */
export function lfoHz(
  signal: ArrayLike<number>,
  sampleRate: number,
  minHz = 0.05,
  maxHz = 10,
  hop = 256,
) {
  const env = envelope(signal, hop);
  const rate = sampleRate / hop;
  const minLag = Math.max(2, Math.floor(rate / maxHz));
  const maxLag = Math.min(Math.floor(rate / minHz), env.length - 2);
  if (maxLag <= minLag) return NaN;

  const scores = new Float64Array(maxLag + 1);
  let best = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let dot = 0;
    let a = 0;
    let b = 0;
    for (let i = 0; i + lag < env.length; i++) {
      dot += env[i] * env[i + lag];
      a += env[i] * env[i];
      b += env[i + lag] * env[i + lag];
    }
    const norm = Math.sqrt(a * b);
    scores[lag] = norm > 0 ? dot / norm : 0;
    if (scores[lag] > best) best = scores[lag];
  }

  let bestLag = minLag;
  for (let lag = minLag + 1; lag < maxLag; lag++) {
    if (
      scores[lag] >= 0.9 * best &&
      scores[lag] >= scores[lag - 1] &&
      scores[lag] >= scores[lag + 1]
    ) {
      bestLag = lag;
      break;
    }
  }

  let refined = bestLag;
  if (bestLag > minLag && bestLag < maxLag) {
    const a = scores[bestLag - 1];
    const b = scores[bestLag];
    const c = scores[bestLag + 1];
    const denominator = a - 2 * b + c;
    if (denominator !== 0) refined += (0.5 * (a - c)) / denominator;
  }
  return rate / refined;
}

/** Normalised zero-lag cross-correlation: 1 is mono, 0 is independent, -1 is inverted. */
export function correlation(l: ArrayLike<number>, r: ArrayLike<number>) {
  let dot = 0;
  let a = 0;
  let b = 0;
  for (let i = 0; i < l.length; i++) {
    dot += l[i] * r[i];
    a += l[i] * l[i];
    b += r[i] * r[i];
  }
  const norm = Math.sqrt(a * b);
  return norm > 0 ? dot / norm : 0;
}

export function rms(signal: ArrayLike<number>) {
  let sum = 0;
  for (let i = 0; i < signal.length; i++) sum += signal[i] * signal[i];
  return Math.sqrt(sum / signal.length);
}

/**
 * Level of `(L + R) / 2` against the input, in dB.
 *
 * The number a mix engineer finds out about by accident: a chorus whose stereo
 * comes from cancellation loses it, and everything it took from the centre
 * with it.
 */
export function monoSumDb(
  l: ArrayLike<number>,
  r: ArrayLike<number>,
  input: ArrayLike<number>,
) {
  const mono = new Float32Array(l.length);
  for (let i = 0; i < l.length; i++) mono[i] = 0.5 * (l[i] + r[i]);
  return 20 * Math.log10(rms(mono) / rms(input));
}

/**
 * Peak detune in cents for a sinusoidal delay modulation.
 *
 * Dattorro (1997) §6: a delay of `D + W·sin(Ω·n·T)` samples gives a pitch
 * ratio of `1 - W·Ω·T·cos(Ω·n·T)`, so the extrema are `1 ± W·Ω·T` and
 * `W·T` is exactly the excursion in seconds. This is the number a musician can
 * act on, which is why the README states it rather than the millisecond.
 */
export function centsFromExcursion(excursionMs: number, rateHz: number) {
  const ratio = 2 * Math.PI * rateHz * (excursionMs / 1000);
  return 1200 * Math.log2(1 + ratio);
}

/**
 * Magnitude response in dB from an impulse response, rectangular-windowed.
 *
 * No window: an impulse response *is* the transfer function, and
 * `_spectrum.ts`'s `magnitudes` applies a Blackman-Harris, which would tapers
 * the impulse itself towards nothing. Verified in `spectrum.test.ts` against a
 * one-pole whose corner is known.
 */
export function transferDb(response: ArrayLike<number>, size = 16384) {
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  for (let i = 0; i < size && i < response.length; i++) re[i] = response[i];
  fft(re, im);
  const out = new Float64Array(size / 2);
  for (let k = 0; k < size / 2; k++)
    out[k] = 20 * Math.log10(Math.hypot(re[k], im[k]) + 1e-12);
  return out;
}

/**
 * The -3 dB corner of a comb-filtered rolloff, in Hz.
 *
 * A chorus tap is a comb - roughly +/- 6 dB of ripple on a 333 Hz spacing for
 * a 3 ms delay - and reading a corner straight off that finds the first null
 * rather than the filter. The running maximum over `smoothHz` follows the
 * comb's peak envelope instead, which is the lowpass, and `smoothHz` has to be
 * wider than one comb period for it to work.
 */
export function cornerHz(
  db: ArrayLike<number>,
  sampleRate: number,
  size = 16384,
  smoothHz = 700,
) {
  const bin = sampleRate / size;
  const half = Math.max(1, Math.round(smoothHz / bin / 2));
  const peak = (k: number) => {
    let best = -Infinity;
    for (
      let j = Math.max(1, k - half);
      j <= Math.min(db.length - 1, k + half);
      j++
    )
      if (db[j] > best) best = db[j];
    return best;
  };

  // Reference: the envelope where the rolloff has not started, at 100 Hz.
  const reference = peak(Math.round(100 / bin));
  for (let k = Math.round(200 / bin); k < db.length; k++) {
    if (peak(k) < reference - 3) return k * bin;
  }
  return NaN;
}

/** Uniform white noise from an LCG, so every measurement is reproducible. */
export function noise(length: number, seed = 12345) {
  const out = new Float32Array(length);
  let state = seed;
  for (let i = 0; i < length; i++) {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    out[i] = (state / 0x3fffffff - 1) * 0.5;
  }
  return out;
}

/**
 * Pink noise, from Paul Kellet's economy filter over the white LCG.
 *
 * Correlation is measured on this rather than on white noise, and that matters
 * enough to say why: white noise puts half its energy above 12 kHz, which no
 * musical signal does, and a chorus whose wet path is deliberately rolled off
 * has no wet content up there at all. Measured on white noise, the broadband
 * L/R correlation of *any* filtered-wet chorus reads near 1 - not because the
 * effect is narrow but because the measurement is looking where the effect
 * isn't. Pink is the standard stand-in for programme material.
 */
export function pink(length: number, seed = 12345) {
  const white = noise(length * 2, seed);
  const out = new Float32Array(length);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  for (let i = 0; i < length; i++) {
    const w = white[i + length];
    b0 = 0.99765 * b0 + w * 0.099046;
    b1 = 0.963 * b1 + w * 0.2965164;
    b2 = 0.57 * b2 + w * 1.0526913;
    out[i] = (b0 + b1 + b2 + w * 0.1848) * 0.35;
  }
  return out;
}

/**
 * A one-pole band-pass: the signal low-passed at `highHz`, minus that low-pass
 * again at `lowHz`. Gentle rather than surgical, which is what a per-band
 * comparison of two channels wants - a steep filter would ring and the ringing
 * is correlated between them.
 */
export function bandpass(
  signal: ArrayLike<number>,
  sampleRate: number,
  lowHz: number,
  highHz: number,
) {
  const aLow = tanG(lowHz, sampleRate);
  const aHigh = tanG(highHz, sampleRate);
  const out = new Float32Array(signal.length);
  let sLow = 0;
  let sHigh = 0;
  for (let i = 0; i < signal.length; i++) {
    const vHigh = (signal[i] - sHigh) * aHigh;
    const low = vHigh + sHigh;
    sHigh = low + vHigh;
    const vLow = (low - sLow) * aLow;
    const lower = vLow + sLow;
    sLow = lower + vLow;
    out[i] = low - lower;
  }
  return out;
}

const tanG = (hz: number, sampleRate: number) => {
  const g = Math.tan((Math.PI * Math.min(hz, 0.45 * sampleRate)) / sampleRate);
  return g / (1 + g);
};

/**
 * Correlation of `l` and `r` inside one frequency band.
 *
 * The per-band shape is the part that is not a matter of taste: the
 * decorrelation literature measures effective decorrelators at 0.35-0.4 at low
 * frequencies and 0.1-0.33 at high, and treats that as correct rather than as
 * a limitation. Bass stays centred.
 */
export function bandCorrelation(
  l: ArrayLike<number>,
  r: ArrayLike<number>,
  sampleRate: number,
  lowHz: number,
  highHz: number,
) {
  return correlation(
    bandpass(l, sampleRate, lowHz, highHz),
    bandpass(r, sampleRate, lowHz, highHz),
  );
}

/**
 * Mono-sum level against the input, inside one band.
 *
 * The broadband number hides the failure that matters for a difference-output
 * chorus: `L = d0 - d1` cancels the common mode, and at low frequencies two
 * short delayed copies are nearly identical, so it is the bass that goes.
 */
export function bandMonoDb(
  l: ArrayLike<number>,
  r: ArrayLike<number>,
  input: ArrayLike<number>,
  sampleRate: number,
  lowHz: number,
  highHz: number,
) {
  const mono = new Float32Array(l.length);
  for (let i = 0; i < l.length; i++) mono[i] = 0.5 * (l[i] + r[i]);
  return (
    20 *
    Math.log10(
      rms(bandpass(mono, sampleRate, lowHz, highHz)) /
        rms(bandpass(input, sampleRate, lowHz, highHz)),
    )
  );
}

export const sine = (length: number, hz: number, sampleRate: number) =>
  Float32Array.from({ length }, (_, i) =>
    Math.sin((2 * Math.PI * hz * i) / sampleRate),
  );
