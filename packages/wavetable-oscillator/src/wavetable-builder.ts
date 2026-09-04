import type { Wavetable } from "./wavetable-loader";

/**
 * Wavetables from harmonic spectra.
 *
 * This module runs on the **main thread** and is deliberately not imported by
 * `worklet.ts`: building a table is a load-time operation whose result travels
 * through the existing `"WAVETABLE"` message, and keeping it out of the worklet
 * keeps the inlined `processor.ts` payload where it is. `dsp.test.ts`'s "the
 * bundle" block is what pins that.
 *
 * ## Canonical phase
 *
 * A linear crossfade between two planes equals a linear crossfade of their
 * harmonic *magnitudes* only if corresponding harmonics share a phase — Serra,
 * Rubine & Dannenberg, JAES 38(3) 1990 §1.2 and Eq. 7, confirmed independently
 * by Horner, Beauchamp & Haken 1992 §1 and Mohr 2005 §1. When they do not, the
 * crossfade dips (−3 dB at 90° of disagreement, a null at 180°) and — the half
 * that no level meter shows — Serra et al. report the result "was always
 * perceived as a frequency shift".
 *
 * Which phase set is used barely matters; sharing one is everything (§3.7 shows
 * an arbitrary measured set works as well). This package takes §3.4.3's: phases
 * alternating 0 and π, which is a sign on the magnitude because
 * `sin(x + π) === -sin(x)`. Every plane this module builds is therefore
 *
 *     plane[k] = Σ  (-1)^(h+1) · |a_h| · sin(2π·h·k / L)
 *
 * and every plane it builds is phase-compatible with every other one, whatever
 * spectra they were built from. `wavetable-conditioner.ts` (ticket 07) rewrites
 * imported tables into the same convention, and `canonicalPhase` below is the
 * one definition both share.
 */

/** Matches `loadWavetable`'s default, so a built table and a fetched one agree. */
export const DEFAULT_WAVETABLE_LENGTH = 256;

/**
 * The phase of harmonic `h` (1 = the fundamental), in radians: 0 for odd
 * harmonics and π for even ones, per Serra et al. JAES §3.4.3.
 *
 * The alternation is not decoration. With every phase at 0 a `1/n` series is
 * `Σ sin(2πhk/L)/h`, whose discontinuity sits exactly on `k = 0` — the point the
 * reader wraps through — and a generated sawtooth's loop seam is then a
 * full-scale step. Alternating the sign moves that discontinuity to the middle
 * of the table: measured at L = 256, the seam step goes from 1.0000 to 0.0067.
 * It is the mechanism behind Serra et al.'s note that canonical phase leaves
 * "the waveform and its first derivative close to zero at the beginning and at
 * the end of the table".
 *
 * Because every harmonic is in sine phase, `plane[0]` is exactly 0 for every
 * spectrum. A spectrum with an intrinsic discontinuity and no even harmonics — a
 * square — keeps one of its two jumps at the seam whatever the origin, and that
 * is a property of the waveform, not of the rule.
 */
export function canonicalPhase(harmonic: number) {
  return harmonic % 2 === 0 ? Math.PI : 0;
}

/**
 * One plane: the additive sum of `harmonics` at canonical phase, over `length`
 * samples of one cycle. Serra et al. JAES Eq. 4 / ICMC Eq. 6.
 *
 * `harmonics[0]` is the **fundamental**, `harmonics[1]` the second harmonic, and
 * so on. Note the difference from Web Audio's `PeriodicWave`, whose index 0 is
 * DC: there is no DC term here at all, deliberately — an offset in a plane
 * thumps when a morph crosses it, and removing it from imported tables is what
 * ticket 07 exists to do.
 *
 * Entries are **magnitudes**: a negative one is read through `Math.abs`. A sign
 * is a phase, phase is this module's guarantee rather than the caller's, and
 * honouring it is exactly what breaks the crossfade this convention protects.
 *
 * The result is not normalized — see `normalizePeak`, kept separate so that a
 * mipmap level (ticket 06) can be scaled by its base level's gain instead of its
 * own.
 */
export function buildPlane(harmonics: ArrayLike<number>, length: number) {
  assertLength(length);
  // Harmonic `h` needs `h` cycles in `length` samples, so `h > length / 2` is
  // above the table's own Nyquist and folds back into a lower harmonic — an
  // alias baked into the data, where no amount of band-limiting downstream can
  // reach it. Throwing beats a table that is quietly the wrong sound.
  if (harmonics.length > length / 2) {
    throw Error(
      `A ${length}-sample table holds at most ${length / 2} harmonics, got ${
        harmonics.length
      }`,
    );
  }

  const plane = new Float32Array(length);
  for (let i = 0; i < harmonics.length; i++) {
    const value = harmonics[i];
    // One NaN spreads across every sample of the plane, and a NaN that reaches
    // the read offset never comes back - the failure ticket 01 spent its budget
    // on. Refuse it here, where the caller still knows which entry it was.
    if (!Number.isFinite(value)) {
      throw Error(`Harmonic ${i + 1} is not a finite number: ${value}`);
    }
    const a = Math.abs(value);
    if (a === 0) continue;

    const h = i + 1;
    // `sin(x + π) === -sin(x)`: the canonical phase is a sign, so the inner loop
    // stays one multiply and one sine.
    const amp = h % 2 === 0 ? -a : a;
    const w = (2 * Math.PI * h) / length;
    for (let k = 0; k < length; k++) plane[k] += amp * Math.sin(w * k);
  }
  return plane;
}

/**
 * Scales `plane` in place so its largest absolute sample is 1, returning the
 * gain applied (0 for a silent plane, which is left alone).
 *
 * Peak, not RMS, and per plane: it is the cheap guarantee that a generated table
 * cannot clip. Loudness — matching planes to each other so a morph changes
 * timbre and not level — is ticket 07, and it is RMS-based and switchable
 * because it is a judgement about someone's data rather than a fact about it.
 */
export function normalizePeak(plane: Float32Array) {
  let peak = 0;
  for (let k = 0; k < plane.length; k++) {
    const value = Math.abs(plane[k]);
    if (value > peak) peak = value;
  }
  if (peak === 0) return 0;

  const gain = 1 / peak;
  for (let k = 0; k < plane.length; k++) plane[k] *= gain;
  return gain;
}

/**
 * A multi-plane wavetable from one harmonic spectrum per plane, packed into the
 * `plane * length + index` layout `interpolateLinear2d` already reads and
 * `set()` already counts planes from.
 *
 * Every plane is built at canonical phase and normalized to peak 1.0.
 */
export function buildWavetable(
  planes: ArrayLike<number>[],
  length = DEFAULT_WAVETABLE_LENGTH,
): Wavetable {
  assertLength(length);
  if (planes.length === 0) {
    throw Error("A wavetable needs at least one plane of harmonics");
  }

  const data = new Float32Array(planes.length * length);
  for (let p = 0; p < planes.length; p++) {
    const plane = buildPlane(planes[p], length);
    normalizePeak(plane);
    data.set(plane, p * length);
  }
  return { data, length };
}

/** The shapes of the built-in table, in the order they morph. */
export type BuiltInShape = "sine" | "triangle" | "sawtooth" | "square";

/**
 * Amplitude of harmonic `n` (1-based) for each built-in shape — rules, not baked
 * samples, so the whole default set costs a few hundred bytes of code and so
 * ticket 06 can get a mipmap level by evaluating the same rule over fewer
 * harmonics.
 *
 * These are magnitude series only. A textbook triangle alternates the sign of
 * its odd harmonics; that sign is a phase, it disagrees with the sawtooth and
 * square either side of it in the morph order, and disagreeing is precisely the
 * failure this module is built to prevent. Same spectrum, canonical phase.
 */
const SHAPES: Record<BuiltInShape, (n: number) => number> = {
  sine: (n) => (n === 1 ? 1 : 0),
  triangle: (n) => (n % 2 === 1 ? 1 / (n * n) : 0),
  sawtooth: (n) => 1 / n,
  square: (n) => (n % 2 === 1 ? 1 / n : 0),
};

/**
 * Three planes of rising brightness plus the odd-harmonic counterpart of the
 * sawtooth: the set a musician expects a default wavetable to hold, and enough
 * to hear the morph do something immediately. The order is a product choice, not
 * a constraint — canonical phase makes every plane compatible with every other
 * one, so any arrangement crossfades correctly.
 *
 * Four rather than sixty-four: Wun, Horner & Ayers 2003 §3.2 measure the 1→2
 * table drop as the one that dominates and the curve as flat past five, Horner
 * et al. 1992 §3 land in the same place ("three wavetables... facilitated a good
 * basic match, but five or more were often needed"), and Shan et al. 2022 §5.1
 * reach it from the machine-learning direction (best at 20, barely worse at 10,
 * no better at 100).
 */
export const BUILT_IN_SHAPES: readonly BuiltInShape[] = [
  "sine",
  "triangle",
  "sawtooth",
  "square",
];

/** The first `count` harmonic magnitudes of a built-in shape. */
export function shapeHarmonics(shape: BuiltInShape, count: number) {
  const rule = SHAPES[shape];
  if (!rule) throw Error(`Unknown shape: ${shape}`);
  return Float32Array.from({ length: count }, (_, i) => rule(i + 1));
}

/**
 * The built-in set as harmonic spectra, at the full bandwidth a `length`-sample
 * table can hold.
 *
 * Full bandwidth is the deliberate pre-mipmap state. There is no band-limiting
 * anywhere in this package yet, so the sawtooth plane measures the audit's own
 * alias figures — 23.7 dB at 440 Hz — and ticket 06 is what raises them, by
 * truncating this same series per octave. Truncating here instead would be a
 * filter design taken in the wrong ticket, and it would be wrong at every pitch
 * but one.
 */
export function builtInHarmonics(length = DEFAULT_WAVETABLE_LENGTH) {
  assertLength(length);
  return BUILT_IN_SHAPES.map((shape) => shapeHarmonics(shape, length / 2));
}

const DEFAULTS = new Map<number, Wavetable>();

/**
 * The table a `WavetableOscillator` starts with, so it makes a sound the moment
 * it is constructed — offline, under a strict CSP, in a test with no network
 * stub. Before this the only path to a non-empty table was a fetch from a third
 * party's GitHub Pages mirror.
 *
 * Memoized per length: `postCreate` runs once per node and the default size is
 * 131 072 sine evaluations, which is a per-voice cost in a polyphonic patch
 * otherwise. `postMessage` structured-clones the array, so the shared instance
 * cannot be mutated from a worklet.
 */
export function defaultWavetable(length = DEFAULT_WAVETABLE_LENGTH) {
  let wavetable = DEFAULTS.get(length);
  if (!wavetable) {
    wavetable = buildWavetable(builtInHarmonics(length), length);
    DEFAULTS.set(length, wavetable);
  }
  return wavetable;
}

/**
 * A power of two, at least 2. The reader's wrap is cheapest on one, and both
 * ticket 06's mipmaps and ticket 07's phase alignment take a radix-2 FFT of a
 * plane, which has no other length.
 */
function assertLength(length: number) {
  if (
    !Number.isInteger(length) ||
    length < 2 ||
    (length & (length - 1)) !== 0
  ) {
    throw Error(`Table length must be a power of two >= 2, got ${length}`);
  }
}
