/**
 * Measurement, used only by this package's tests.
 *
 * Deliberately private, for the reason `polyblep-oscillator/src/spectrum.ts`
 * gives: a metric shared with the thing it measures stops being independent
 * evidence. Shipped DSP duplication is a bug factory; measurement duplication
 * is how this repository keeps its checkers honest - see
 * `lookahead-limiter/src/true-peak-oracle.ts`.
 *
 * `index.ts` does not import it, so `tsup` never bundles it and `esbuild`
 * never sees it: the assertion that it stays out of `processor.ts` is in
 * `spectrum.test.ts`.
 *
 * Most of this is `digital-delay`'s file. What is new here is what this
 * package has to assert and that one did not: `pitchTrack`, because the
 * defining behaviour is that pitch moves *during* a sweep rather than sitting
 * at one value; `noiseFloor` and `harmonicDistortion`, because `age` moves
 * four things and each has to be measurable on its own; and
 * `envelopePeriodicity`, because rhythmic-versus-diffuse is the claim that
 * justifies the mode enum.
 *
 * Nothing here is fast. Every function is written for legibility against its
 * textbook definition, because the tests that read it are the argument that
 * the module works.
 */

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

/** Four-term Blackman-Harris window: -92 dB sidelobes, so leakage is not the story. */
export function blackmanHarris(length: number) {
  const window = new Float64Array(length);
  for (let i = 0; i < length; i++) {
    const x = (2 * Math.PI * i) / (length - 1);
    window[i] =
      0.35875 -
      0.48829 * Math.cos(x) +
      0.14128 * Math.cos(2 * x) -
      0.01168 * Math.cos(3 * x);
  }
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

/**
 * Harmonic distortion as a ratio: the energy in partials 2..`partials` over
 * the energy in the fundamental, both read from the peak bin and its two
 * neighbours so a slightly off-bin tone is not undercounted.
 *
 * A ratio rather than a percentage because it is only ever compared against
 * itself across a parameter sweep.
 */
export function harmonicDistortion(
  signal: ArrayLike<number>,
  sampleRate: number,
  frequency: number,
  partials = 5,
) {
  const spectrum = magnitudes(signal);
  const binWidth = sampleRate / (spectrum.length * 2);

  const energyAt = (hz: number) => {
    const centre = Math.round(hz / binWidth);
    let total = 0;
    for (let i = centre - 1; i <= centre + 1; i++) {
      if (i >= 0 && i < spectrum.length) total += spectrum[i] * spectrum[i];
    }
    return total;
  };

  let harmonics = 0;
  for (let n = 2; n <= partials; n++) {
    const hz = n * frequency;
    if (hz < sampleRate / 2) harmonics += energyAt(hz);
  }
  const first = energyAt(frequency);
  return first > 0 ? harmonics / first : NaN;
}

/**
 * The frequency, in Hz, at which a broadband signal's spectrum has fallen
 * `dropDb` below its own low-frequency plateau.
 *
 * `centroid` answers "how bright", which is the right question for a trend but
 * the wrong one for a derivation: the centroid of noise through a two-pole
 * lowpass is not proportional to the cutoff - the integral that would make it
 * so diverges - so a centroid cannot be checked against a predicted corner.
 * This can. Read at -6 dB it recovers the corner of two cascaded one-poles,
 * which is exactly the chain a repeat passes through here.
 *
 * The spectrum is averaged over a sixth-octave band around each probe
 * frequency, because a single bin of a noise spectrum is Rayleigh-distributed
 * and would cross any threshold on luck alone. The average is geometric - the
 * mean of the log magnitudes - because an arithmetic mean over a band where
 * the response falls 12 dB/octave sits above the band's centre value, and that
 * bias pushes the measured corner up by 5% at 8 kHz. A geometric mean over a
 * symmetric log band returns the centre value exactly for any straight line on
 * a log-log plot, which is what a filter skirt is.
 */
export function cornerHz(
  signal: ArrayLike<number>,
  sampleRate: number,
  dropDb = -6,
  plateauLowHz = 150,
  plateauHighHz = 600,
) {
  const spectrum = magnitudes(signal);
  const binWidth = sampleRate / (spectrum.length * 2);

  const band = (lowHz: number, highHz: number) => {
    const from = Math.max(1, Math.round(lowHz / binWidth));
    const to = Math.min(spectrum.length - 1, Math.round(highHz / binWidth));
    if (to < from) return NaN;
    let total = 0;
    for (let i = from; i <= to; i++) total += Math.log(spectrum[i] + 1e-300);
    return Math.exp(total / (to - from + 1));
  };

  const sixth = Math.pow(2, 1 / 6);
  const smoothed = (hz: number) => band(hz / sixth, hz * sixth);

  const scan = (highHz: number) => {
    const plateau = band(plateauLowHz, highHz);
    if (!(plateau > 0)) return NaN;
    const threshold = plateau * Math.pow(10, dropDb / 20);

    // A 48th of an octave per step: finer than the sixth-octave average, so
    // the crossing is located rather than quantised.
    const stepRatio = Math.pow(2, 1 / 48);
    let previousHz = highHz;
    let previous = smoothed(previousHz);
    for (let hz = highHz * stepRatio; hz < sampleRate / 2; hz *= stepRatio) {
      const value = smoothed(hz);
      if (value <= threshold) {
        // Linear interpolation in log frequency between the two probes.
        const span =
          Math.log(previous / threshold) / Math.log(previous / value);
        return previousHz * Math.pow(hz / previousHz, span);
      }
      previousHz = hz;
      previous = value;
    }
    return NaN;
  };

  // Two passes. The plateau has to be measured somewhere the filter is not yet
  // working, and where that is depends on the answer: read against a band that
  // reaches a third of the way to the corner, the plateau comes out low, the
  // threshold with it, and the corner reads 28% high. So the first pass only
  // locates the corner roughly, and the second re-reads the plateau a full two
  // octaves below it.
  const rough = scan(plateauHighHz);
  if (!(rough > 0)) return rough;
  const refined = Math.min(plateauHighHz, rough / 4);
  return refined > plateauLowHz * 1.5 ? scan(refined) : rough;
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

/** Short-time RMS, one point per `hop`. */
export function envelopeRms(signal: ArrayLike<number>, hop = 256) {
  const points: number[] = [];
  for (let i = 0; i + hop <= signal.length; i += hop) {
    let total = 0;
    for (let j = i; j < i + hop; j++) total += signal[j] * signal[j];
    points.push(Math.sqrt(total / hop));
  }
  return points;
}

/**
 * The noise bed under a signal: the RMS of the quietest tenth of its frames.
 *
 * A plain RMS would read the signal; a minimum would read a single unlucky
 * frame. The quietest decile is the standard compromise, and it is unmoved by
 * anything loud happening elsewhere in the take - which is the property the
 * `age` assertion needs.
 */
export function noiseFloor(signal: ArrayLike<number>, hop = 256) {
  const points = envelopeRms(signal, hop).sort((a, b) => a - b);
  if (points.length === 0) return NaN;
  const count = Math.max(1, Math.round(points.length / 10));
  let total = 0;
  for (let i = 0; i < count; i++) total += points[i];
  return total / count;
}

/**
 * How periodic a signal's energy envelope is: the largest normalised
 * autocorrelation of the mean-removed envelope over lags between `minSeconds`
 * and `maxSeconds`.
 *
 * A train of evenly spaced repeats scores near 1; a diffuse wash, whose
 * envelope has no repeating structure, scores near 0. That contrast is the
 * rhythmic-versus-diffuse claim, measured rather than asserted in prose.
 */
export function envelopePeriodicity(
  signal: ArrayLike<number>,
  sampleRate: number,
  minSeconds: number,
  maxSeconds: number,
  hop = 256,
) {
  const points = envelopeRms(signal, hop);
  const mean = points.reduce((a, b) => a + b, 0) / points.length;
  const centred = points.map((value) => value - mean);
  const minLag = Math.max(1, Math.round((minSeconds * sampleRate) / hop));
  const maxLag = Math.min(
    Math.round((maxSeconds * sampleRate) / hop),
    centred.length - 2,
  );
  if (maxLag <= minLag) return NaN;

  let energy = 0;
  for (const value of centred) energy += value * value;
  if (energy === 0) return 0;

  let best = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let dot = 0;
    let tail = 0;
    for (let i = 0; i + lag < centred.length; i++) {
      dot += centred[i] * centred[i + lag];
      tail += centred[i + lag] * centred[i + lag];
    }
    // Normalised against the overlapping window rather than the whole signal,
    // so a long lag is not penalised for having fewer terms.
    let head = 0;
    for (let i = 0; i + lag < centred.length; i++)
      head += centred[i] * centred[i];
    const norm = Math.sqrt(head * tail);
    const score = norm > 0 ? dot / norm : 0;
    if (score > best) best = score;
  }
  return best;
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

/**
 * A *time series* of fundamental estimates, one per `hop`, each read over a
 * window of `2 x hop` samples.
 *
 * `digital-delay` only ever needed one estimate, because its claim is that
 * pitch does not move. The claim here is that it moves *during* a sweep and
 * comes back afterwards, and a single number cannot say that.
 */
export function pitchTrack(
  signal: ArrayLike<number>,
  sampleRate: number,
  hop = 2048,
  minHz = 60,
  maxHz = 2000,
) {
  const window = hop * 2;
  const readings: number[] = [];
  for (let start = 0; start + window <= signal.length; start += hop) {
    const slice: number[] = [];
    for (let i = 0; i < window; i++) slice.push(signal[start + i]);
    readings.push(fundamental(slice, sampleRate, minHz, maxHz));
  }
  return readings;
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
