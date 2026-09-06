import {
  analyzeHarmonics,
  canonicalPhase,
  trigTable,
  TrigTable,
} from "./wavetable-builder";
import type { Wavetable } from "./wavetable-loader";

/**
 * Conditioning tables the package did not generate.
 *
 * `wavetable-builder.ts` guarantees that a *generated* table is DC-free, at
 * canonical phase and unable to clip, because it builds it that way. A table
 * that arrives through `setWavetable` or `loadWavetable` carries no such
 * guarantee, and until this module nothing checked:
 *
 * - **Phase.** A linear crossfade of two planes equals a linear crossfade of
 *   their harmonic magnitudes only while corresponding harmonics share a phase
 *   (Serra, Rubine & Dannenberg, JAES 38(3) 1990, Eq. 7). At 90° of disagreement
 *   the morph loses 3 dB, at 180° it nulls, and Serra et al. report the residue
 *   "was always perceived as a frequency shift" — a failure no level meter shows.
 * - **Loudness.** Planes at different RMS make the morph knob a volume control.
 * - **DC.** An offset thumps when the morph crosses the plane, and pushes the
 *   sum off centre.
 *
 * **The wavedit catalogue fails all three**, which is not a hypothesis: six real
 * tables were fetched and measured, and `SYNLP10` loses 5.7 dB on an average
 * crossfade and 11.1 dB on its worst, `ACCESS_V` carries a 0.61 DC offset on one
 * plane, and three of the six span more than 14 dB of RMS. The one that measures
 * near-aligned, `BRAIDS01`, is the one whose planes were *generated*. The
 * measurement and its script are in the parent repo, under
 * `thoughts/research/2026-09-05_wavedit-phase-alignment/`.
 *
 * ## What is a fact and what is a judgement
 *
 * DC removal and phase alignment are facts about the data: an offset is almost
 * never wanted, and a plane that disagrees in phase cannot be crossfaded, whether
 * or not its author knew that. **Loudness normalization is a judgement**, it is
 * ours, and no paper in the corpus prescribes it — Serra et al. deliberately let
 * level vary through a morph, because in their analysis/resynthesis framing the
 * amplitude trajectory *is* the encoded signal; Maher 2005 §4.1.2's per-table gain
 * search optimises quantizer SNR before encoding, not perceived loudness, and is
 * not a citation for this. A synth's position knob should change tone and leave
 * volume alone, so it defaults on — and an artist who shaped a level ramp across
 * their planes turns it off. Every step has its own switch for that reason.
 *
 * ## Where it runs
 *
 * Main thread, once, at load, **before** the mipmap pyramid: `mipmapWavetable`
 * resynthesises every level from the base plane's own harmonics, so a rewrite or
 * a gain applied afterwards would have to be applied identically to all eight
 * levels. `setWavetable` runs this and then that, and skips both for a table that
 * already carries a pyramid — which is exactly the set of tables
 * `buildWavetable` produced.
 *
 * Not Bristow-Johnson's (AES 101, 1996) Eq. 18 integer circular shift. His §1
 * names the failure this fixes, but his own remedy needs "at least 2048" samples
 * for its resolution and one integer step at our 256 is a coarse ~1.4°. A
 * per-harmonic rewrite is exact at any length and lands on the phase every
 * generated plane already uses.
 */

/**
 * Which steps to run. Every one defaults to **on** — the good behaviour should be
 * free — and every one can be switched off on its own, because each is a decision
 * about somebody else's data.
 */
export type ConditionOptions = {
  /**
   * Subtract each plane's mean. Default on; almost never unwanted, and
   * trivially reversible through the returned `offsets`.
   */
  removeDc?: boolean;
  /**
   * Rewrite every harmonic to `canonicalPhase`, preserving its magnitude.
   * Default on. Switch it off to keep a deliberate phase design — a table whose
   * planes were drawn to cancel each other in a particular way.
   */
  alignPhases?: boolean;
  /**
   * Match every plane's RMS, so the morph changes timbre and not level. Default
   * on. Switch it off to keep an intended level ramp across the planes.
   */
  normalize?: boolean;
};

/** What `conditionWavetable` returns: a table, plus what it did to get there. */
export type ConditionedWavetable = Wavetable & {
  /**
   * The DC offset removed from each plane, or 0 where the step was off. Adding
   * it back and dividing by `gains` undoes the two reversible steps; the phase
   * rewrite is not reversible, which is why it has a switch.
   */
  offsets: Float32Array;
  /** The gain applied to each plane, or 1 where normalization was off. */
  gains: Float32Array;
};

/**
 * The largest boost `normalizeRms` will apply, as a ratio — 30 dB.
 *
 * The worst RMS spread in the sampled catalogue is `SYNLP10`'s 28.89 dB, so the
 * cap does not bind on any real table measured; it is there for the plane that is
 * *deliberately* almost empty, where matching it to the loudest plane would
 * amplify a 16-bit quantization floor rather than a sound. A plane at exactly
 * zero keeps unity gain: `303` is 42 planes of digital silence out of 64, and
 * there is no gain that makes silence loud.
 */
const MAX_BOOST = 31.622776601683793; // 10 ** (30 / 20)

/**
 * Subtracts `plane`'s mean in place, returning the offset removed.
 *
 * Harmonic content is untouched — the mean is the `h = 0` bin and nothing else —
 * so this changes where the plane sits and not what it sounds like.
 */
export function removeDc(plane: Float32Array) {
  const length = plane.length;
  if (length === 0) return 0;

  let sum = 0;
  for (let k = 0; k < length; k++) sum += plane[k];
  const offset = sum / length;
  if (offset === 0) return 0;

  for (let k = 0; k < length; k++) plane[k] -= offset;
  return offset;
}

/**
 * Rewrites every harmonic of `plane` to `canonicalPhase`, in place, preserving
 * each magnitude exactly. Analyse, keep `|a_h|`, resynthesise:
 *
 *     plane[k] = Σ_h  (-1)^(h+1) · |a_h| · sin(2π·h·k / L)
 *
 * which is `buildPlane`'s formula, so a conditioned plane and a generated one are
 * the same kind of object and crossfade correctly with each other.
 * `canonicalPhase` is called rather than its `h % 2` re-derived: one definition,
 * two call sites, no way for them to drift apart.
 *
 * Two harmonics are dropped rather than rewritten, and both are dropped for the
 * same reason — they have no sine-phase form:
 *
 * - **DC** (`h = 0`) is a constant, and `sin` is not. Alignment therefore
 *   subsumes `removeDc`; running both is what makes the removed offset
 *   *reportable*.
 * - **Nyquist** (`h = L/2`) is `sin(πk)`, which is 0 at every integer `k`. It
 *   costs a generated table nothing, because `buildPlane` sums the same `sin` and
 *   so already contributes exactly zero there, and it costs an imported table one
 *   alternating ±1 component at exactly half the table rate that no interpolating
 *   reader could reproduce anyway.
 *
 * Because every surviving term is in sine phase, `plane[0]` comes back **exactly**
 * 0 — the invariant `buildPlane` has and the reason the loop seam is quiet.
 *
 * `trig` is accepted so a whole table shares one table of sines; omit it and one
 * is built per call.
 */
export function alignPhases(
  plane: Float32Array,
  trig: TrigTable = trigTable(plane.length),
) {
  const length = plane.length;
  const top = Math.floor(length / 2) - 1;
  if (top < 1) return plane;

  const { a, b } = analyzeHarmonics(plane, top, trig);
  const sin = trig.sin;
  plane.fill(0);
  for (let h = 1; h <= top; h++) {
    const magnitude = Math.hypot(a[h], b[h]);
    if (magnitude === 0) continue;
    // `sin(x + π) === -sin(x)`, so the canonical phase is a sign and the inner
    // loop stays one multiply and one table read.
    const amp = canonicalPhase(h) === 0 ? magnitude : -magnitude;
    for (let k = 0; k < length; k++) plane[k] += amp * sin[(h * k) % length];
  }
  return plane;
}

/**
 * Scales every plane of `data` in place to a common RMS, returning the gain
 * applied to each.
 *
 * `target` defaults to the **loudest plane's** RMS. A level the table already
 * contains, rather than an absolute constant: nothing is pushed past something
 * the author already asked for, and the quiet planes come up to meet the loud one
 * instead of the loud one coming down to meet an arbitrary number.
 *
 * That boosts, so two guards follow it. A boost is capped at `MAX_BOOST`, and a
 * silent plane is left at unity. Then **one shared trim** — deliberately not one
 * per plane, which would undo the matching this function exists to do — brings
 * the whole table's peak back to 1 if the boosting pushed it over. That is how
 * this keeps `normalizePeak`'s promise that a table cannot clip while using one
 * gain for the table where the generated path uses one per plane.
 *
 * The returned gains are the gains actually applied, trim included, so dividing
 * by them restores the input.
 */
export function normalizeRms(data: Float32Array, length: number, target = 0) {
  const planes = Math.floor(data.length / length);
  const gains = new Float32Array(planes);
  if (planes < 1) return gains;

  const levels = new Float64Array(planes);
  let loudest = 0;
  for (let p = 0; p < planes; p++) {
    const at = p * length;
    let sum = 0;
    for (let k = 0; k < length; k++) {
      const x = data[at + k];
      sum += x * x;
    }
    const rms = Math.sqrt(sum / length);
    levels[p] = rms;
    if (rms > loudest) loudest = rms;
  }

  const want = target > 0 ? target : loudest;
  // Nothing to match against: every plane is silence.
  if (!(want > 0)) return gains.fill(1);

  let peak = 0;
  for (let p = 0; p < planes; p++) {
    const rms = levels[p];
    let gain = 1;
    if (rms > 0) {
      gain = want / rms;
      if (gain > MAX_BOOST) gain = MAX_BOOST;
    }
    gains[p] = gain;

    const at = p * length;
    for (let k = 0; k < length; k++) {
      const size = Math.abs(data[at + k]) * gain;
      if (size > peak) peak = size;
    }
  }

  const trim = peak > 1 ? 1 / peak : 1;
  for (let p = 0; p < planes; p++) {
    // Read the gain back out of the Float32Array after storing it, so the number
    // reported is the number applied.
    gains[p] *= trim;
    const gain = gains[p];
    if (gain === 1) continue;
    const at = p * length;
    for (let k = 0; k < length; k++) data[at + k] *= gain;
  }
  return gains;
}

/**
 * Runs the whole pass over a copy of `wavetable`, returning the conditioned table
 * and the transformation it applied.
 *
 * Order is DC, then phase, then loudness. Phase alignment would remove the offset
 * on its own; doing it first is what makes the offset a number the caller can see
 * and add back. Loudness comes last because it is the only step that looks at the
 * planes as a set rather than one at a time.
 *
 * **It refuses a table that already carries a mipmap pyramid.** Conditioning
 * after mipmapping is the one ordering that silently produces a wrong table —
 * each level would be phase-rewritten and gain-matched independently of the level
 * below it, and the pyramid's whole point is that one gain covers all of them.
 * `setWavetable` calls this before `mipmapWavetable`, and passes a table that
 * already has levels straight through.
 */
export function conditionWavetable(
  wavetable: Wavetable,
  options: ConditionOptions = {},
): ConditionedWavetable {
  const { length } = wavetable;
  if (wavetable.levels && wavetable.levels > 1) {
    throw Error(
      "Condition a wavetable before building its mipmap pyramid, not after",
    );
  }

  const data = wavetable.data.slice();
  const planes = length >= 2 ? Math.floor(data.length / length) : 0;
  const offsets = new Float32Array(planes);
  const gains = new Float32Array(planes).fill(1);
  if (planes < 1) return { data, length, levels: 1, offsets, gains };

  // `!== false` rather than `?? true`: an options object that omits a key gets
  // the step, which is what "defaults to all three on" has to mean for `{}`.
  const dc = options.removeDc !== false;
  const align = options.alignPhases !== false;
  const normalize = options.normalize !== false;

  const trig = align ? trigTable(length) : undefined;
  for (let p = 0; p < planes; p++) {
    const plane = data.subarray(p * length, (p + 1) * length);
    if (dc) offsets[p] = removeDc(plane);
    if (trig) alignPhases(plane, trig);
  }
  if (normalize) gains.set(normalizeRms(data, length));

  return { data, length, levels: 1, offsets, gains };
}
