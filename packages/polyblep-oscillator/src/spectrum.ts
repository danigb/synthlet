/**
 * The oscillator's measuring instrument, used only by the tests.
 *
 * `aliasSnr` is the metric the audit
 * (`thoughts/research/2026-09-03_18-01-26_polyblep-oscillator-audit.md`) used to
 * rank every correction method: a 32768-point FFT of a Blackman-Harris-windowed
 * render, energy within +-10 bins of each harmonic counted as signal and
 * everything else as noise. **It is not any paper's metric**, so absolute values
 * are comparable within this repository and only indicative against published
 * figures. What it is, is reproducible to the decimal - `spectrum.test.ts` pins
 * it against the audit's two published sawtooth rows, and drifting off those
 * makes every floor in `dsp.test.ts` meaningless.
 *
 * It is not imported by `index.ts`, so `tsup` never bundles it - the precedent
 * is `packages/lookahead-limiter/src/true-peak-oracle.ts`. It is deliberately
 * inside the package rather than in `scripts/`: `_worklet.ts`, `_gate.ts` and
 * `_blep.ts` are runtime contracts shared between packages, and this is not one.
 * If a second oscillator package ever wants the same metric, move it then.
 */

/** 32768 samples: 1.35 Hz per bin at 44.1 kHz. */
export const DEFAULT_LENGTH = 32768;

/** 8192 samples, 186 ms at 44.1 kHz. See `render`. */
export const DEFAULT_WARMUP = 8192;

/** One render quantum - the block size the worklet is actually called with. */
export const DEFAULT_BLOCK_SIZE = 128;

/** Bins either side of a harmonic counted as signal rather than as noise. */
export const HARMONIC_BINS = 10;

/**
 * In-place iterative radix-2 FFT: bit-reversal permutation, then log2(n)
 * butterfly passes. `re` and `im` are transformed in place and must be the same
 * power-of-two length.
 */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  if (im.length !== n)
    throw new Error("fft: re and im must be the same length");
  if (n < 2 || (n & (n - 1)) !== 0)
    throw new Error(`fft: length must be a power of two, got ${n}`);

  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i];
      re[i] = re[j];
      re[j] = t;
      t = im[i];
      im[i] = im[j];
      im[j] = t;
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const angle = (-2 * Math.PI) / len;
    const wr = Math.cos(angle);
    const wi = Math.sin(angle);
    const half = len / 2;
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let j = 0; j < half; j++) {
        const a = i + j;
        const b = a + half;
        const vr = re[b] * cr - im[b] * ci;
        const vi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - vr;
        im[b] = im[a] - vi;
        re[a] += vr;
        im[a] += vi;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
}

const WINDOWS = new Map<number, Float64Array>();

/**
 * The 4-term Blackman-Harris window: -92 dB sidelobes, which is what lets a
 * -60 dB alias be measured next to a 0 dB harmonic without the harmonic's own
 * leakage counting as noise. Memoised, because the suite windows 27 renders of
 * the same length.
 */
export function blackmanHarris(length: number): Float64Array {
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

/** The largest absolute sample. */
export function peak(signal: Float32Array | Float64Array): number {
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
 * `removeDC` subtracts the mean before windowing. Bin 0 is noise by the rule
 * above, so a waveform with a legitimate DC component - a pulse wave, whose
 * mean is `2 * width - 1` - reads far worse than it is without this: measured,
 * a 0.3 offset takes the shipped sawtooth from 35.4 dB to 3.8 dB.
 */
export function aliasSnr(
  signal: Float32Array | Float64Array,
  f0: number,
  sampleRate: number,
  options: { removeDC?: boolean } = {},
): number {
  const n = signal.length;
  if (!(f0 > 0)) throw new Error(`aliasSnr: f0 must be positive, got ${f0}`);

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
  const binHz = sampleRate / n;
  const isSignal = new Uint8Array(half);
  for (let h = 1; h * f0 < sampleRate / 2; h++) {
    const center = Math.round((h * f0) / binHz);
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

export type RenderContext = { f0: number; sampleRate: number };

export type RenderOptions = RenderContext & {
  length?: number;
  warmup?: number;
  blockSize?: number;
};

/**
 * Build one generator and drive it in render-quantum-sized blocks, discarding
 * `warmup` samples before capturing `length`.
 *
 * `createGenerator` is a factory rather than a generator because every
 * measurement needs its own phase accumulator, and because `createPolyblep`
 * takes the sample rate at construction - the same shape as the harnesses'
 * `GENS[name](f0)`.
 *
 * The warm-up is not cosmetic. The triangle's integrator and DC blocker start
 * from rest and settle over the first few hundred samples: measured cold peak
 * at 1661 Hz is 1.777 over samples 0-1024 against a steady-state 0.966, which
 * is finding C3 of the audit. Ticket 04 deletes the integrator and the blocker
 * and the transient with them; until then, every steady-state figure in
 * `dsp.test.ts` is measured after this warm-up, and the tests that deliberately
 * look at a cold start pass `warmup: 0` and say so.
 */
export function render(
  createGenerator: (context: RenderContext) => (block: Float32Array) => void,
  options: RenderOptions,
): Float32Array {
  const { f0, sampleRate } = options;
  const length = options.length ?? DEFAULT_LENGTH;
  const warmup = options.warmup ?? DEFAULT_WARMUP;
  const blockSize = options.blockSize ?? DEFAULT_BLOCK_SIZE;

  const generate = createGenerator({ f0, sampleRate });
  const signal = new Float32Array(length);
  const block = new Float32Array(blockSize);
  const total = warmup + length;

  for (let produced = 0; produced < total; produced += blockSize) {
    generate(block);
    const count = Math.min(blockSize, total - produced);
    for (let i = 0; i < count; i++) {
      const n = produced + i;
      if (n >= warmup) signal[n - warmup] = block[i];
    }
  }
  return signal;
}
