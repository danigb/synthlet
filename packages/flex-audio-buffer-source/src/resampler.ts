/**
 * A windowed-sinc fractional resampler, for the pitch stage.
 *
 * Re-derived from J. O. Smith III, *Digital Audio Resampling Home Page*
 * (CCRMA, Stanford), which describes the method of Smith and Gossett, *A
 * Flexible Sampling-Rate Conversion Method*, Proc. ICASSP-84: a Kaiser-windowed
 * sinc sampled into a table at `PHASES` points per input sample, read with
 * linear interpolation between table entries.
 *
 * Two properties of that write-up matter here and are easy to get wrong:
 *
 * - **When reading faster than unity the filter has to be stretched, not just
 *   stepped through faster.** Reading at ratio β > 1 decimates, so the cutoff
 *   must come down to 0.5/β or everything above the new Nyquist folds back.
 *   Smith's method gets this by scaling the filter's *time* axis by β - the
 *   same table, stepped at 1/β and spanning β times as many input samples -
 *   rather than by designing a new filter. That is what keeps the table fixed
 *   and the process path allocation-free while `detune` is automated.
 * - **The kernel is symmetric, so the interpolation is zero-phase.** It reads
 *   `reach` samples either side of the read position rather than only behind
 *   it. That costs lookahead, not latency: `dsp.ts` pulls the engine ahead to
 *   cover it, and because the engine reads a buffer by random access, pulling
 *   ahead is free. The node therefore adds no delay at all, which is what lets
 *   the β = 1 short circuit below be exact rather than merely close.
 *
 * ONE THING THIS FILE DOES THAT THE SOURCE DOES NOT
 *
 * Each output sample is divided by the sum of the tap weights that actually
 * contributed, instead of by a precomputed constant. In the interior the two
 * agree - that sum is the filter's DC gain. At the very start of a clip the
 * taps reaching back before sample 0 read zero, and dividing by the constant
 * would attenuate the first `reach` samples into a short fade. Dividing by the
 * realised weight instead gives a one-sided interpolation there, which is the
 * same reasoning as the running window sum in `wsola.ts`, and for the same
 * reason: an onset must not be faded in.
 */

/** Half the kernel's support, in input samples, at unity ratio. */
export const HALF_TAPS = 16;

/** Table resolution: entries per input sample. */
const PHASES = 128;

/** Kaiser shape parameter. ~8 gives about -80 dB of stopband. */
const KAISER_BETA = 8;

/** Modified Bessel function of the first kind, order 0. */
function besselI0(x: number) {
  let sum = 1;
  let term = 1;
  const quarter = (x * x) / 4;
  for (let k = 1; k < 40; k++) {
    term *= quarter / (k * k);
    sum += term;
    if (term < 1e-14 * sum) break;
  }
  return sum;
}

/**
 * The kernel, sampled at x = i / PHASES for i in [0, HALF_TAPS * PHASES].
 *
 * Built once at module load: it depends on nothing a caller can vary, so it is
 * shared by every instance and never rebuilt when the pitch changes.
 */
const KERNEL = (() => {
  const length = HALF_TAPS * PHASES + 2;
  const table = new Float32Array(length);
  const norm = besselI0(KAISER_BETA);
  for (let i = 0; i < length; i++) {
    const x = i / PHASES;
    if (x > HALF_TAPS) {
      table[i] = 0;
      continue;
    }
    const arg = Math.PI * x;
    const sinc = i === 0 ? 1 : Math.sin(arg) / arg;
    const shape = Math.sqrt(Math.max(0, 1 - (x / HALF_TAPS) ** 2));
    table[i] = sinc * (besselI0(KAISER_BETA * shape) / norm);
  }
  return table;
})();

/** The kernel at |x| input samples from the centre, linearly interpolated. */
function kernelAt(x: number) {
  const scaled = x * PHASES;
  const index = scaled | 0;
  if (index >= HALF_TAPS * PHASES) return 0;
  const fraction = scaled - index;
  return KERNEL[index] + (KERNEL[index + 1] - KERNEL[index]) * fraction;
}

/**
 * How many samples either side of the read position the kernel reaches, at
 * ratio `beta`. Stretching for β > 1 widens the support proportionally.
 */
export function reachFor(beta: number) {
  return Math.ceil(HALF_TAPS * Math.max(1, beta)) + 1;
}

/** Where a set of taps sits. */
export type Taps = { first: number; count: number };

/**
 * Fill `taps` with the kernel weights for reading at `position` at ratio
 * `beta`, and report where they start.
 *
 * Split out from the read itself for two reasons: a multi-channel block
 * computes the kernel once and applies it to every channel rather than once
 * per channel, and the *weight* is deliberately left to the caller. Only the
 * caller knows which taps land on real samples, and summing the weight over
 * taps that read past the end of a buffer is exactly what would fade an onset
 * in - see the note at the top of this file.
 *
 * `taps` must hold at least `2 * reachFor(beta) + 2` entries.
 */
export function gatherTaps(
  position: number,
  beta: number,
  taps: Float32Array,
): Taps {
  // β <= 1 interpolates without decimating, so the cutoff stays at Nyquist
  // and the kernel keeps its unity-ratio width.
  const scale = beta > 1 ? 1 / beta : 1;
  const reach = HALF_TAPS / scale;
  const first = Math.ceil(position - reach);
  const last = Math.floor(position + reach);

  let count = 0;
  for (let n = first; n <= last; n++) {
    taps[count++] = kernelAt(Math.abs(position - n) * scale);
  }
  return { first, count };
}

/**
 * One resampled sample, over the samples in `[min, max)`.
 *
 * The single-channel form, used by the tests; `dsp.ts` inlines the same maths
 * across channels. Taps falling outside the range are dropped from the weight
 * as well as the sum, so an edge is interpolated one-sidedly rather than
 * faded.
 */
export function resampleAt(
  read: (index: number) => number,
  position: number,
  beta: number,
  min = -Infinity,
  max = Infinity,
  taps = new Float32Array(2 * reachFor(beta) + 2),
) {
  const { first, count } = gatherTaps(position, beta, taps);
  let sum = 0;
  let weight = 0;
  for (let i = 0; i < count; i++) {
    const n = first + i;
    if (n < min || n >= max) continue;
    sum += taps[i] * read(n);
    weight += taps[i];
  }
  return weight > 1e-9 ? sum / weight : 0;
}

/**
 * Resample whole channels from one sample rate to another.
 *
 * Used once at load time, on the main thread, when a buffer's rate does not
 * match the context's - the policy `decodeAudioData` follows. It allocates,
 * which is why it is never called from `process`.
 */
export function resampleBuffer(
  channels: Float32Array[],
  fromRate: number,
  toRate: number,
): Float32Array[] {
  if (fromRate === toRate || channels.length === 0) return channels;

  const beta = fromRate / toRate;
  const sourceLength = channels[0].length;
  const length = Math.max(1, Math.round(sourceLength / beta));
  const taps = new Float32Array(2 * reachFor(beta) + 2);

  return channels.map((channel) => {
    const read = (n: number) => channel[n];
    const out = new Float32Array(length);
    for (let j = 0; j < length; j++) {
      out[j] = resampleAt(read, j * beta, beta, 0, sourceLength, taps);
    }
    return out;
  });
}
