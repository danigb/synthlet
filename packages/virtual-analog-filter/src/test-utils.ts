// Measurement instruments for the nine circuit models, used by
// `filters.test.ts`. Nothing here is shipped: this file is test-only.
//
// The I/Q demodulation in `measure()` is lifted unchanged from
// `state-variable-filter/src/allpass.test.ts:13-42`, which is the house
// instrument for "what does this filter do at this frequency". The only
// differences are mechanical: this package's circuits take
// `(input, output, from, to)` rather than a parameter array, and the render
// loop here hands each block its own subarray so that a model reading
// `input[0]` sees the first sample *of the block*, which is what the worklet
// gives it.

/** The shape every circuit module in this package returns. */
export type Filter = {
  update(frequency: number, resonance: number): void;
  reset(): void;
  process(
    input: Float32Array,
    output: Float32Array,
    from: number,
    to: number,
  ): void;
};

export type MeasureOptions = {
  /** Seconds of audio discarded before the measurement window. */
  settle?: number;
  /**
   * Approximate length of the measurement window in seconds. Short, because
   * the corner search below spends a dozen readings per corner and the file
   * measures sixty corners; the window is rounded up to at least four whole
   * cycles, which is what makes the demodulation leakage-free.
   */
  window?: number;
  /** Samples per `process()` call, as the worklet would render them. */
  blockSize?: number;
  /**
   * Peak input level. Small by default because two of the five circuits are
   * nonlinear: `diode.ts` multiplies its input by 100 before a cubic soft
   * clipper, and `oberheim.ts` clamps to +/-1. At 1e-3 the diode's clipper
   * sees +/-0.1, where `x - x^3/3` is within 0.4% of linear, so a magnitude
   * reading is a magnitude reading and not a distortion reading.
   */
  amplitude?: number;
};

const TWO_PI = 2 * Math.PI;

/**
 * Run a steady sine of `probe` Hz through `filter` and measure the amplitude
 * and phase of the output once it has settled, by I/Q demodulation over a
 * whole number of cycles (so there is no spectral leakage).
 *
 * The window is a whole number of cycles rather than a whole second: the
 * corner search below probes at non-integer frequencies, and a fixed
 * one-second window would leak on every one of them.
 *
 * `amplitude` is returned relative to the input level, so 1 means unity gain.
 */
export function measure(
  filter: Filter,
  probe: number,
  sampleRate: number,
  options: MeasureOptions = {},
) {
  const settle = options.settle ?? 0.25;
  const blockSize = options.blockSize ?? 128;
  const level = options.amplitude ?? 1e-3;

  // A whole number of cycles, at least four, spanning about `window` seconds.
  const cycles = Math.max(4, Math.round(probe * (options.window ?? 0.25)));
  const window = Math.round((cycles * sampleRate) / probe);
  const start = Math.round(sampleRate * settle);
  const length = start + window;

  const input = new Float32Array(length);
  const output = new Float32Array(length);
  for (let n = 0; n < length; n++) {
    input[n] = level * Math.sin((TWO_PI * probe * n) / sampleRate);
  }

  render(filter, input, output, blockSize);

  let i = 0;
  let q = 0;
  for (let n = start; n < length; n++) {
    const w = (TWO_PI * probe * n) / sampleRate;
    i += output[n] * Math.sin(w);
    q += output[n] * Math.cos(w);
  }
  i /= window;
  q /= window;

  const amplitude = (2 * Math.hypot(i, q)) / level;
  return {
    amplitude,
    phase: Math.atan2(q, i),
    // Floored rather than allowed to reach -Infinity: four models return
    // exact silence today and a -Infinity propagates into every comparison.
    db: 20 * Math.log10(Math.max(amplitude, 1e-12)),
  };
}

/** `measure()` when only the magnitude is wanted. */
export function measureDb(
  filter: Filter,
  probe: number,
  sampleRate: number,
  options: MeasureOptions = {},
) {
  return measure(filter, probe, sampleRate, options).db;
}

/**
 * Render `input` into `output` one block at a time, exactly the way
 * `worklet.ts` does: each call gets the block's own subarray and renders it
 * from 0 to its length. A model that reads `input[0]` therefore latches the
 * first sample of the block, not of the signal, which is the defect
 * `filters.test.ts`'s block-size group is looking for.
 */
export function render(
  filter: Filter,
  input: Float32Array,
  output: Float32Array,
  blockSize = 128,
) {
  for (let n = 0; n < input.length; n += blockSize) {
    const to = Math.min(n + blockSize, input.length);
    filter.process(input.subarray(n, to), output.subarray(n, to), 0, to - n);
  }
}

/**
 * The -3 dB corner of a lowpass response, relative to the model's own
 * passband level.
 *
 * A fresh filter per reading, because state from a previous probe is state
 * from a different signal. Bisection on log2(f) assumes the magnitude falls
 * monotonically through the corner, which holds at the low resonance every
 * caller uses and would not at 0.9 - hence `resonance` is a parameter and
 * every corner measurement in the tests passes 0.2.
 *
 * 5 Hz is the passband reference: it is below every corner any of these
 * models can currently produce - the lowest measured is the diode ladder's
 * 10.7 Hz - so it is a passband reference for both the broken and the fixed
 * tuning.
 */
export function findCorner(
  make: () => Filter,
  frequency: number,
  resonance: number,
  sampleRate: number,
  options: MeasureOptions = {},
) {
  const at = probeAt(make, frequency, resonance, sampleRate, options);
  return bisect(at, 5, sampleRate * 0.45, at(5) - 3, true);
}

/**
 * The -3 dB corner of a highpass response. The mirror of `findCorner`: the
 * passband is at the top, so the reference is `0.4 * sampleRate` and the
 * magnitude rises rather than falls through the corner.
 */
export function findCornerHigh(
  make: () => Filter,
  frequency: number,
  resonance: number,
  sampleRate: number,
  options: MeasureOptions = {},
) {
  const at = probeAt(make, frequency, resonance, sampleRate, options);
  const top = sampleRate * 0.4;
  return bisect(at, 2, top, at(top) - 3, false);
}

/**
 * The frequency of the loudest ("peak") or quietest ("notch") point of the
 * response, found by argmax over a log grid rather than by bisection - a
 * bandpass and a bandstop are not monotonic, which is the whole point of
 * them.
 */
export function findExtreme(
  make: () => Filter,
  frequency: number,
  resonance: number,
  sampleRate: number,
  kind: "peak" | "notch",
  options: MeasureOptions = {},
) {
  const at = probeAt(make, frequency, resonance, sampleRate, options);
  const lo = Math.log2(10);
  const hi = Math.log2(sampleRate * 0.4);
  const steps = 48;
  let best = 0;
  let bestDb = kind === "peak" ? -Infinity : Infinity;
  for (let n = 0; n <= steps; n++) {
    const f = Math.pow(2, lo + ((hi - lo) * n) / steps);
    const db = at(f);
    if (kind === "peak" ? db > bestDb : db < bestDb) {
      bestDb = db;
      best = f;
    }
  }
  return best;
}

/** A fresh filter, tuned, measured at one probe. */
function probeAt(
  make: () => Filter,
  frequency: number,
  resonance: number,
  sampleRate: number,
  options: MeasureOptions,
) {
  return (probe: number) => {
    const filter = make();
    filter.update(frequency, resonance);
    return measureDb(filter, probe, sampleRate, options);
  };
}

/**
 * Bisect a monotonic magnitude curve for `target` dB. 12 halvings of a
 * ~13-octave bracket resolves to ~0.2%, an order finer than the few percent
 * any assertion here cares about, and a dozen renders rather than thirty.
 */
function bisect(
  at: (f: number) => number,
  low: number,
  high: number,
  target: number,
  falling: boolean,
) {
  let lo = Math.log2(low);
  let hi = Math.log2(high);
  if (falling ? at(high) > target : at(low) > target)
    return falling ? high : low;
  for (let n = 0; n < 12; n++) {
    const mid = (lo + hi) / 2;
    const above = at(Math.pow(2, mid)) > target;
    if (above === falling) lo = mid;
    else hi = mid;
  }
  return Math.pow(2, (lo + hi) / 2);
}
