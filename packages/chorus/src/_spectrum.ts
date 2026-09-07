/**
 * Measurement, used only by tests. **`scripts/_spectrum.ts` is the only
 * editable copy**; `scripts/copy_files.sh` writes the rest, and
 * `packages/synthlet/src/worklet-copies.test.ts` fails if one drifts.
 *
 * It lived in `digital-delay/src/spectrum.ts` until a second package wanted
 * the same metric, which is the condition its old header set for moving it.
 * Note what it is not: `_worklet.ts`, `_gate.ts` and `_delay.ts` are runtime
 * contracts, shared so that two packages cannot disagree about behaviour a
 * user can observe. This is a measuring instrument, shared so that two
 * packages' numbers are comparable. Duplicating shipped DSP is a bug factory;
 * duplicating a metric is how this repository keeps its checkers honest -
 * `lookahead-limiter/src/true-peak-oracle.ts` is still deliberately its own.
 * A metric earns a place here only once its readings have to line up across
 * packages, which is why it took two of them.
 *
 * No `index.ts` imports it, so `tsup` never bundles it and `esbuild` never
 * sees it: the assertion that it stays out of `processor.ts` is in each
 * consumer's tests.
 *
 * Nothing here is fast. Every function is written for legibility against its
 * textbook definition, because the tests that read it are the argument that
 * the module works.
 */

/** Bins either side of a harmonic counted as signal rather than as noise. */
export const HARMONIC_BINS = 10;

/** In-place radix-2 Cooley-Tukey FFT. `re` and `im` must be a power of two. */
export function fft(re: Float64Array, im: Float64Array) {
  const n = re.length;
  if (n !== im.length || (n & (n - 1)) !== 0) {
    throw Error("fft needs two arrays of the same power-of-two length");
  }

  // Bit-reversal permutation.
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
        const ar = re[i + j];
        const ai = im[i + j];
        const br = re[i + j + len / 2] * cr - im[i + j + len / 2] * ci;
        const bi = re[i + j + len / 2] * ci + im[i + j + len / 2] * cr;
        re[i + j] = ar + br;
        im[i + j] = ai + bi;
        re[i + j + len / 2] = ar - br;
        im[i + j + len / 2] = ai - bi;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}

const WINDOWS = new Map<number, Float64Array>();

/**
 * Four-term Blackman-Harris window: -92 dB sidelobes, so leakage is not the
 * story. Memoised, because a suite windows dozens of renders of one length.
 */
export function blackmanHarris(length: number) {
  const cached = WINDOWS.get(length);
  if (cached) return cached;

  const window = new Float64Array(length);
  for (let i = 0; i < length; i++) {
    const x = (2 * Math.PI * i) / (length - 1);
    window[i] =
      0.35875 -
      0.48829 * Math.cos(x) +
      0.14128 * Math.cos(2 * x) -
      0.01168 * Math.cos(3 * x);
  }
  WINDOWS.set(length, window);
  return window;
}

const previousPowerOfTwo = (n: number) => {
  let size = 1;
  while (size * 2 <= n) size *= 2;
  return size;
};

/** Windowed magnitude spectrum of the longest power-of-two prefix of `signal`. */
export function magnitudes(signal: ArrayLike<number>) {
  const n = previousPowerOfTwo(signal.length);
  const window = blackmanHarris(n);
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = signal[i] * window[i];

  fft(re, im);

  const half = n / 2;
  const out = new Float64Array(half);
  for (let i = 0; i < half; i++) out[i] = Math.hypot(re[i], im[i]);
  return out;
}

/**
 * Frequency in Hz of the largest magnitude bin above DC, refined by a parabola
 * through the peak and its two neighbours so the answer is not quantised to
 * whole bins.
 *
 * `fundamental` answers the same question better for a periodic signal, but it
 * is an autocorrelation bounded to a plausible musical range; this reads
 * whatever is loudest, which is what a test of a *broken* pitch has to do.
 */
export function peakFrequency(signal: ArrayLike<number>, sampleRate: number) {
  const spectrum = magnitudes(signal);
  let best = 1;
  for (let i = 1; i < spectrum.length; i++) {
    if (spectrum[i] > spectrum[best]) best = i;
  }

  const a = spectrum[best - 1] ?? 0;
  const b = spectrum[best];
  const c = spectrum[best + 1] ?? 0;
  const denominator = a - 2 * b + c;
  const refined =
    denominator !== 0 ? best + (0.5 * (a - c)) / denominator : best;
  return (refined * sampleRate) / (spectrum.length * 2);
}

/** The largest absolute sample. */
export function peak(signal: ArrayLike<number>) {
  let max = 0;
  for (let i = 0; i < signal.length; i++) {
    const value = Math.abs(signal[i]);
    if (value > max) max = value;
  }
  return max;
}

/**
 * Signal-to-alias ratio in dB: everything within `HARMONIC_BINS` of a harmonic
 * of `f0` below Nyquist is signal, every other bin in `[0, N/2)` is noise.
 *
 * This is the metric the oscillator audits used to rank correction methods
 * (`thoughts/research/2026-09-03_18-01-26_polyblep-oscillator-audit.md` and
 * `..._18-14-54_wavetable-oscillator-audit.md`). **It is not any paper's
 * metric**, so absolute values are comparable within this repository and only
 * indicative against published figures. What it is, is reproducible to the
 * decimal: both oscillator packages pin it against their audit's published
 * rows, and drifting off those makes every floor they assert meaningless.
 *
 * `removeDC` subtracts the mean before windowing. Bin 0 is noise by the rule
 * above, so a waveform with a legitimate DC component - a pulse wave, whose
 * mean is `2 * width - 1` - reads far worse than it is without it: measured, a
 * 0.3 offset takes a sine from 149 dB to 5.7 dB. **Leave it off otherwise.**
 * The mean it subtracts is the unwindowed one, so on a signal with no DC but a
 * fractional number of cycles in the window it plants a windowed constant at
 * bin 0 and costs 27 dB. `spectrum.test.ts` pins both halves of that.
 */
export function aliasSnr(
  signal: ArrayLike<number>,
  f0: number,
  sampleRate: number,
  options: { removeDC?: boolean } = {},
) {
  const n = signal.length;
  if (!(f0 > 0)) throw Error(`aliasSnr: f0 must be positive, got ${f0}`);

  let offset = 0;
  if (options.removeDC) {
    for (let i = 0; i < n; i++) offset += signal[i];
    offset /= n;
  }

  const window = blackmanHarris(n);
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = (signal[i] - offset) * window[i];
  fft(re, im);

  const half = n / 2;
  const binWidth = sampleRate / n;
  const isSignal = new Uint8Array(half);
  for (let h = 1; h * f0 < sampleRate / 2; h++) {
    const center = Math.round((h * f0) / binWidth);
    const from = Math.max(0, center - HARMONIC_BINS);
    const to = Math.min(half - 1, center + HARMONIC_BINS);
    for (let k = from; k <= to; k++) isSignal[k] = 1;
  }

  let signalPower = 0;
  let noisePower = 0;
  for (let k = 0; k < half; k++) {
    const power = re[k] * re[k] + im[k] * im[k];
    if (isSignal[k]) signalPower += power;
    else noisePower += power;
  }
  return 10 * Math.log10(signalPower / noisePower);
}

/**
 * Spectral centroid in Hz: the magnitude-weighted mean frequency, which is the
 * standard one-number answer to "how bright is this".
 */
export function centroid(signal: ArrayLike<number>, sampleRate: number) {
  const spectrum = magnitudes(signal);
  const binWidth = sampleRate / (spectrum.length * 2);

  let weighted = 0;
  let total = 0;
  for (let i = 0; i < spectrum.length; i++) {
    weighted += i * binWidth * spectrum[i];
    total += spectrum[i];
  }
  return total > 0 ? weighted / total : NaN;
}

/** Peak envelope in dB relative to the signal's own peak, one point per `hop`. */
export function envelopeDb(signal: ArrayLike<number>, hop = 256) {
  const points: number[] = [];
  for (let i = 0; i < signal.length; i += hop) {
    let peak = 0;
    for (let j = i; j < Math.min(i + hop, signal.length); j++) {
      const value = Math.abs(signal[j]);
      if (value > peak) peak = value;
    }
    points.push(peak);
  }
  const reference = Math.max(...points);
  return points.map((peak) =>
    peak > 0 && reference > 0 ? 20 * Math.log10(peak / reference) : -Infinity,
  );
}

/**
 * Decay time in seconds, by least-squares fit of the peak envelope in dB
 * against time over the -5 dB to -35 dB span, extrapolated to -60.
 *
 * That span rather than a direct measurement to -60 is standard practice: the
 * first few dB are the onset rather than the decay, and the last few are where
 * a short tail runs out of signal.
 */
export function rt60(signal: ArrayLike<number>, sampleRate: number, hop = 256) {
  const envelope = envelopeDb(signal, hop);
  const xs: number[] = [];
  const ys: number[] = [];

  for (let i = 0; i < envelope.length; i++) {
    const db = envelope[i];
    if (db <= -5 && db >= -35) {
      xs.push((i * hop) / sampleRate);
      ys.push(db);
    }
  }
  if (xs.length < 3) return NaN;

  const n = xs.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let covariance = 0;
  let variance = 0;
  for (let i = 0; i < n; i++) {
    covariance += (xs[i] - meanX) * (ys[i] - meanY);
    variance += (xs[i] - meanX) ** 2;
  }
  const slope = covariance / variance; // dB per second, negative
  return slope < 0 ? -60 / slope : NaN;
}

/** Largest sample-to-sample step: the cheapest click detector there is. */
export function maxAbsoluteDifference(signal: ArrayLike<number>) {
  let worst = 0;
  for (let i = 1; i < signal.length; i++) {
    const step = Math.abs(signal[i] - signal[i - 1]);
    if (step > worst) worst = step;
  }
  return worst;
}

/**
 * Fundamental in Hz by normalised autocorrelation, with a parabolic fit on the
 * peak so the answer is not quantised to whole lags - at 440 Hz one lag is
 * 17 cents, and the pitch excursions this has to resolve are smaller than that.
 */
export function fundamental(
  signal: ArrayLike<number>,
  sampleRate: number,
  minHz = 60,
  maxHz = 2000,
) {
  const minLag = Math.max(2, Math.floor(sampleRate / maxHz));
  const maxLag = Math.min(Math.floor(sampleRate / minHz), signal.length - 2);
  if (maxLag <= minLag) return NaN;

  const correlate = (lag: number) => {
    let dot = 0;
    let energyA = 0;
    let energyB = 0;
    for (let i = 0; i + lag < signal.length; i++) {
      dot += signal[i] * signal[i + lag];
      energyA += signal[i] * signal[i];
      energyB += signal[i + lag] * signal[i + lag];
    }
    const norm = Math.sqrt(energyA * energyB);
    return norm > 0 ? dot / norm : 0;
  };

  const scores = new Float64Array(maxLag + 1);
  let best = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    scores[lag] = correlate(lag);
    if (scores[lag] > best) best = scores[lag];
  }

  // The first peak within 10% of the best, not the best peak: a periodic
  // signal correlates just as well at two periods as at one, and on a pure
  // tone the winner between them is decided by rounding. Taking the earliest
  // qualifying peak is the standard guard against reading an octave low.
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

  // Parabola through the peak and its neighbours.
  let refined = bestLag;
  if (bestLag > minLag && bestLag < maxLag) {
    const a = scores[bestLag - 1];
    const b = scores[bestLag];
    const c = scores[bestLag + 1];
    const denominator = a - 2 * b + c;
    if (denominator !== 0) refined += (0.5 * (a - c)) / denominator;
  }
  return sampleRate / refined;
}

/** The shape `render` drives: a `dsp.ts` factory's return value. */
export type Renderable = {
  update(...params: number[]): void;
  compute(
    inL: Float32Array,
    inR: Float32Array,
    outL: Float32Array,
    outR: Float32Array,
  ): void;
};

export type RenderOptions = {
  /** Output samples to keep, after `warmup`. */
  length: number;
  sampleRate: number;
  /** Mono or stereo dry input. Shorter than `length` means the rest is silence. */
  input?: ArrayLike<number> | ArrayLike<number>[];
  /**
   * Parameter values, either fixed or as a function of elapsed seconds. Called
   * once per block, which is exactly how a k-rate parameter arrives.
   */
  params: readonly number[] | ((seconds: number) => readonly number[]);
  /** Render quantum. 128 unless a test needs to see block-boundary behaviour. */
  block?: number;
  /** Samples rendered and thrown away before the returned window starts. */
  warmup?: number;
};

/**
 * Renders a delay block by block and returns its two output channels.
 *
 * Block-driven rather than one long call, because k-rate parameters and the
 * per-sample ramping that answers them only behave the same way if the harness
 * updates as often as a real graph does.
 */
export function render(
  dsp: Renderable,
  options: RenderOptions,
): [Float32Array, Float32Array] {
  const block = options.block ?? 128;
  const warmup = options.warmup ?? 0;
  const total = warmup + options.length;
  const channels = Array.isArray(options.input)
    ? options.input
    : options.input
      ? [options.input]
      : [];

  const outL = new Float32Array(total);
  const outR = new Float32Array(total);
  const inL = new Float32Array(block);
  const inR = new Float32Array(block);
  const blockL = new Float32Array(block);
  const blockR = new Float32Array(block);

  for (let offset = 0; offset < total; offset += block) {
    const size = Math.min(block, total - offset);
    const values =
      typeof options.params === "function"
        ? options.params(offset / options.sampleRate)
        : options.params;
    dsp.update(...values);

    for (let i = 0; i < size; i++) {
      const at = offset + i;
      inL[i] = at < (channels[0]?.length ?? 0) ? channels[0][at] : 0;
      inR[i] =
        channels.length > 1
          ? at < channels[1].length
            ? channels[1][at]
            : 0
          : inL[i];
    }

    const viewIn = size === block ? inL : inL.subarray(0, size);
    const viewInR = size === block ? inR : inR.subarray(0, size);
    const viewL = size === block ? blockL : blockL.subarray(0, size);
    const viewR = size === block ? blockR : blockR.subarray(0, size);
    dsp.compute(viewIn, viewInR, viewL, viewR);

    outL.set(viewL, offset);
    outR.set(viewR, offset);
  }

  return [outL.subarray(warmup), outR.subarray(warmup)];
}
