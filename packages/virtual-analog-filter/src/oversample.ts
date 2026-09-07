// Polyphase FIR resampling around the filter bank.
//
// Seven of the nine models saturate - the two ladders since `saturate.ts`, the
// diode ladder and the four Oberheim taps since the package shipped - and a
// saturating nonlinearity generates harmonics without bound. Everything above
// Nyquist folds back down as inharmonic aliasing, which is the "digital" sound
// virtual-analog modelling exists to avoid. Huovilainen is explicit about it:
// "since there is a non-linearity, oversampling must be used".
//
// **This costs latency and the cost is not hidden.** A symmetric FIR delays by
// half its length, and there are two of them - one up, one down - so the round
// trip is `(taps - 1) / factor` samples at the base rate. `LATENCY_SAMPLES` in
// `worklet.ts` is that number, and the README states it. A polyphase *IIR*
// halfband would be near-zero-latency, but its allpass coefficients come out of
// an elliptic design, and a table of constants copied from a library nobody
// here has is the kind of thing this package has already been bitten by.

/** Modified Bessel function of the first kind, order zero, for the window. */
function besselI0(x: number) {
  let sum = 1;
  let term = 1;
  for (let k = 1; k < 40; k++) {
    term *= (x / (2 * k)) * (x / (2 * k));
    sum += term;
    if (term < sum * 1e-17) break;
  }
  return sum;
}

/**
 * A Kaiser-windowed sinc, low-pass at `1 / (2 * factor)` of the oversampled
 * rate - which is exactly the base band - normalised so that the polyphase
 * interpolation has unity gain.
 *
 * Written out rather than tabulated on purpose: the stopband is then a
 * consequence of two stated numbers rather than of a magic array, and changing
 * the factor does not mean finding a new table.
 */
function kernel(factor: number, tapsPerPhase: number, beta: number) {
  const length = factor * tapsPerPhase * 2 + 1;
  const centre = (length - 1) / 2;
  const taps = new Float64Array(length);
  const norm = besselI0(beta);

  for (let n = 0; n < length; n++) {
    const t = (n - centre) / factor;
    const sinc = t === 0 ? 1 : Math.sin(Math.PI * t) / (Math.PI * t);
    const r = (n - centre) / centre;
    taps[n] = (sinc * besselI0(beta * Math.sqrt(1 - r * r))) / norm;
  }

  // Normalised so the kernel sums to `factor`: each of the `factor` polyphase
  // branches then has unity DC gain, which is what an interpolator needs, and
  // the decimator divides by `factor` to get back to unity.
  let sum = 0;
  for (const tap of taps) sum += tap;
  for (let n = 0; n < length; n++) taps[n] *= factor / sum;
  return taps;
}

export type Oversampler = {
  /** Base-rate `input[from..to)` into `factor * (to - from)` samples. */
  up(input: Float32Array, from: number, to: number, out: Float32Array): void;
  /** The inverse: `factor * (to - from)` samples back into `out[from..to)`. */
  down(input: Float32Array, from: number, to: number, out: Float32Array): void;
  /** Both histories back to silence, for the `NaN` guard. */
  reset(): void;
};

/**
 * `tapsPerPhase` taps either side of the centre in each of `factor` phases, so
 * `factor * tapsPerPhase * 2 + 1` in total. `beta` is the Kaiser parameter:
 * 8.0 gives roughly -80 dB of stopband, which is what the measured aliasing
 * floors needed.
 */
export function createOversampler(
  factor: number,
  tapsPerPhase = 8,
  beta = 8,
): Oversampler {
  const taps = kernel(factor, tapsPerPhase, beta);
  const length = taps.length;
  const span = tapsPerPhase * 2 + 1; // history needed, in base-rate samples

  // Ring buffers, one per direction. The up-sampler remembers base-rate input,
  // the down-sampler remembers oversampled input, and both have to survive
  // across segments and blocks - which is why they live in the closure rather
  // than being rebuilt per call.
  const upHistory = new Float64Array(span);
  let upWrite = 0;
  // `factor - 1` longer than the kernel, because the decimator reads the
  // *first* sample of each group of `factor` rather than the last: sampling
  // the filtered stream at `n * factor` is what makes the round trip a whole
  // number of base-rate samples of delay rather than half of one.
  const downSpan = length + factor;
  const downHistory = new Float64Array(downSpan);
  let downWrite = 0;

  function up(
    input: Float32Array,
    from: number,
    to: number,
    out: Float32Array,
  ) {
    let o = 0;
    for (let n = from; n < to; n++) {
      upHistory[upWrite] = input[n];
      upWrite = (upWrite + 1) % span;
      // Phase p reads taps p, p + factor, p + 2*factor, ... - the polyphase
      // decomposition of one filter into `factor` shorter ones, each of which
      // already has unity DC gain because of the normalisation above.
      for (let p = 0; p < factor; p++) {
        let sum = 0;
        let k = 0;
        for (let j = p; j < length; j += factor, k++) {
          sum += taps[j] * upHistory[(upWrite + span - 1 - k) % span];
        }
        out[o++] = sum;
      }
    }
  }

  function down(
    input: Float32Array,
    from: number,
    to: number,
    out: Float32Array,
  ) {
    let i = 0;
    for (let n = from; n < to; n++) {
      // Every oversampled sample enters the history; only every `factor`-th
      // output is computed, which is what makes decimation cheap.
      let sum = 0;
      for (let p = 0; p < factor; p++) {
        downHistory[downWrite] = input[i++];
        downWrite = (downWrite + 1) % downSpan;
      }
      for (let j = 0; j < length; j++) {
        sum +=
          taps[j] * downHistory[(downWrite + downSpan - factor - j) % downSpan];
      }
      out[n] = sum / factor;
    }
  }

  function reset() {
    upHistory.fill(0);
    downHistory.fill(0);
    upWrite = 0;
    downWrite = 0;
  }

  return { up, down, reset };
}

/** Round-trip delay in base-rate samples, for a given kernel. */
export function oversamplerLatency(factor: number, tapsPerPhase = 8) {
  return (factor * tapsPerPhase * 2) / factor;
}
