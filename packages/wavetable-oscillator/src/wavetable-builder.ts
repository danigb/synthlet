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
export function buildPlane(
  harmonics: ArrayLike<number>,
  length: number,
  count = harmonics.length,
) {
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
  // A mip level is a prefix of the same series — ticket 06 sums the first `count`
  // of them and nothing else. Taking it as an argument rather than making the
  // caller slice keeps a level free of a copy per level per plane.
  if (count > harmonics.length) count = harmonics.length;

  const plane = new Float32Array(length);
  for (let i = 0; i < count; i++) {
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
 * The mipmap pyramid.
 *
 * Level `i` holds `length/2 / 2^i` harmonics — one octave of bandwidth per
 * level — at the **full base length**, which is where Trausmuth & Huovilainen's
 * (DAFx-05 §2.3) "two to four times longer tables than dictated by Nyquist
 * criteria" comes from: the level is not shortened as harmonics leave it, so at
 * the pitches it is used for it carries 2× to 8× the samples per period Nyquist
 * would require, and `interpolateLinear2d`'s indexing is identical at every
 * level.
 *
 * The oscillator selects with `x = log2(inc)` — the pitch in octaves above the
 * table's natural frequency — and crossfades levels `floor(x) + 1` and
 * `floor(x) + 2`. The `+1` is not an off-by-one: a linear crossfade of two
 * levels does not produce a level with an intermediate harmonic limit, it
 * produces the *lower* level's harmonic content with its top octave scaled by
 * `1 − frac`. So the lower member of the pair has to be below Nyquist on its
 * own. Selecting `floor(x)` instead measures 30.9 dB of alias SNR at 440 Hz
 * against this scheme's 57.4 dB; the plan has the table.
 */
export function mipHarmonics(length: number, level: number) {
  return Math.max(1, Math.floor(length / 2 / Math.pow(2, level)));
}

/**
 * How many levels a `length`-sample table's pyramid holds: down to a single
 * harmonic, which is 8 levels at the default 256 and is PowerWave §2.3's "limit
 * on minimum and maximum table size" in harmonic-count units. One harmonic is
 * the floor because a sine is the most a table can carry at the top of the
 * increment's own range (`inc = length / 2`, one table cycle every two output
 * samples), and no level above that is reachable.
 *
 * The pyramid therefore costs `levels ×` the base table: 32 KB for the built-in
 * four-plane 256-sample set, 512 KB for a 64-plane one. Load-time heap, not
 * published bytes — the payload is a few hundred bytes of harmonic rules.
 */
export function mipLevelCount(length: number) {
  return Math.floor(Math.log2(length / 2)) + 1;
}

/**
 * A multi-plane wavetable from one harmonic spectrum per plane, with a mipmap
 * pyramid, packed level-major:
 *
 *     data[(level * planes + plane) * length + index]
 *
 * so the plane index `interpolateLinear2d` already takes is `level * planes + p`
 * and the reader needs no second dimension. Level 0 sits at the head of the
 * array, so `data.slice(p * length, (p + 1) * length)` is still plane `p` at
 * full bandwidth.
 *
 * Every plane is built at canonical phase, and **one gain scales the whole of a
 * plane's pyramid**: level 0's, from `normalizePeak` — which is the whole reason
 * `normalizePeak` is separate from `buildPlane` — trimmed only if a level above
 * it overshoots 1. A level normalized to its own peak would change loudness at
 * every octave crossover, and the plane could not be crossfaded with anything.
 *
 * The trim is not hypothetical: band-limiting a square *raises* its peak. One
 * sine carries 4/π of the square's height, so the top of the built-in square's
 * pyramid overshoots level 0 by 8.0 %, and `normalizePeak`'s promise is that a
 * generated table cannot clip. The trim keeps that promise for the pyramid, at
 * the cost of level 0 peaking at 0.926 rather than 1 on that one plane.
 */
export function buildWavetable(
  planes: ArrayLike<number>[],
  length = DEFAULT_WAVETABLE_LENGTH,
): Wavetable {
  assertLength(length);
  if (planes.length === 0) {
    throw Error("A wavetable needs at least one plane of harmonics");
  }

  const levels = mipLevelCount(length);
  const data = new Float32Array(levels * planes.length * length);
  const at = (level: number, plane: number) =>
    (level * planes.length + plane) * length;

  for (let p = 0; p < planes.length; p++) {
    const base = buildPlane(planes[p], length);
    const gain = normalizePeak(base);
    data.set(base, at(0, p));

    let peak = 1;
    for (let i = 1; i < levels; i++) {
      const plane = buildPlane(planes[p], length, mipHarmonics(length, i));
      for (let k = 0; k < length; k++) {
        const value = (plane[k] *= gain);
        const size = value < 0 ? -value : value;
        if (size > peak) peak = size;
      }
      data.set(plane, at(i, p));
    }

    if (peak > 1) {
      const trim = 1 / peak;
      for (let i = 0; i < levels; i++) {
        const from = at(i, p);
        for (let k = 0; k < length; k++) data[from + k] *= trim;
      }
    }
  }
  return { data, length, levels };
}

/**
 * The pyramid for a table that arrived as **samples** rather than as harmonics —
 * `loadWavetable`'s WAV planes, or anything a caller hands `setWavetable`.
 *
 * One harmonic analysis per plane, then one additive resynthesis per level from
 * the retained harmonics, each at the phase it was measured at. Preserving the
 * measured phase rather than rewriting it to canonical is deliberate: a phase
 * rewrite changes the plane's shape and is ticket 07's decision to make on
 * imported data, and this function's whole job is to remove bandwidth and
 * nothing else. Level 0 is the original samples, byte for byte.
 *
 * The transform is a direct one, not `_spectrum.ts`'s FFT: that file is
 * test-only by the rule in `scripts/copy_files.sh`, and importing it here would
 * put a 32768-point FFT into the published bundle. Sine and cosine come out of
 * one `length`-entry table indexed by `(h * k) % length`, so a plane costs about
 * `length²/2` multiply-adds with no transcendental call in the loop — 33 k for a
 * 256-sample plane, once, on the main thread.
 *
 * A table too short to analyse comes back unchanged with `levels: 1`, which the
 * oscillator reads as "no pyramid" and plays exactly as it does today.
 */
export function mipmapWavetable(wavetable: Wavetable): Wavetable {
  const { data, length } = wavetable;
  if (wavetable.levels && wavetable.levels > 1) return wavetable;

  const planes = Math.floor(data.length / length);
  const levels = mipLevelCount(length);
  if (!(length >= 2) || planes < 1 || levels < 2) {
    return { data, length, levels: 1 };
  }

  // cos(2πj/length) and sin(2πj/length) for every j: `h * k` only ever reaches
  // the table modulo `length`, so this is the whole transform's trig.
  const cos = new Float64Array(length);
  const sin = new Float64Array(length);
  for (let j = 0; j < length; j++) {
    cos[j] = Math.cos((2 * Math.PI * j) / length);
    sin[j] = Math.sin((2 * Math.PI * j) / length);
  }

  // Level 1 is the widest level that is ever *synthesised* — level 0 is the
  // samples themselves — so nothing above its harmonic count is worth analysing.
  const top = mipHarmonics(length, 1);
  const a = new Float64Array(top + 1);
  const b = new Float64Array(top + 1);
  const out = new Float32Array(levels * planes * length);
  out.set(data.subarray(0, planes * length), 0);

  for (let p = 0; p < planes; p++) {
    const at = p * length;
    // Analysis. The 2/N scaling makes `a`/`b` the harmonic's own amplitude, so a
    // resynthesis over every harmonic reproduces the plane (up to the DC and the
    // Nyquist term, which no level carries — a DC offset in a plane thumps when a
    // morph crosses it, and ticket 07 is what strips it deliberately).
    for (let h = 1; h <= top; h++) {
      let re = 0;
      let im = 0;
      for (let k = 0; k < length; k++) {
        const j = (h * k) % length;
        const x = data[at + k];
        re += x * cos[j];
        im += x * sin[j];
      }
      a[h] = (2 * re) / length;
      b[h] = (2 * im) / length;
    }
    // Synthesis, one level at a time. Harmonics are dropped, never reshaped:
    // this is a brick wall in the harmonic domain, which is the exact analogue
    // of the generated path's truncation.
    for (let i = 1; i < levels; i++) {
      const kept = mipHarmonics(length, i);
      const to = (i * planes + p) * length;
      for (let k = 0; k < length; k++) {
        let y = 0;
        for (let h = 1; h <= kept; h++) {
          const j = (h * k) % length;
          y += a[h] * cos[j] + b[h] * sin[j];
        }
        out[to + k] = y;
      }
    }
  }
  return { data: out, length, levels };
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
 * Full bandwidth is level 0 of the pyramid, and it is right there and only
 * there: `buildWavetable` truncates this same series per octave for the levels
 * above it, and the oscillator picks the level from the pitch. Truncating *here*
 * would be a filter design fixed at one pitch and wrong at every other one.
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
 * 131 072 sine evaluations for level 0 and as many again for the seven levels
 * above it, which is a per-voice cost in a polyphonic patch otherwise. The
 * memoized instance is shared, so `setWavetable` copies before it transfers.
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
