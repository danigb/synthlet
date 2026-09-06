/**
 * Radna's *Dynamic Stochastic Wavetable Synthesis* (DAFx-23), the parts of it
 * that are not the table read.
 *
 * The deviation state and its per-cycle regeneration live here so that the
 * sample loop in `wavetable-oscillator.ts` stays a sample loop: what it keeps
 * is one array read, one lerp and one fold per sample, and everything O(M)
 * happens once per wave cycle through `walk()`.
 */

/**
 * The most segments a wavetable is divided into, and Radna 2.1's own ceiling:
 * "as few as one segment, in which case the entire wavetable is affected
 * uniformly, or as many as 256".
 *
 * It sizes the two deviation arrays, which are allocated once per instance and
 * never per cycle - 2 KB an instance, against the 32 KB the built-in table set
 * already costs.
 */
export const MAX_SEGMENTS = 256;

/**
 * The house comparison-form clamp into `[0, max]`.
 *
 * The form is the one `updateInc()` uses and is chosen for the same reason: a
 * NaN fails both comparisons and falls through to the literal 0, where
 * `Math.min(max, Math.max(0, NaN))` would return NaN and put it into a random
 * walk that has no way back out.
 */
export function clamped(value: number, max: number) {
  return value > 0 ? (value < max ? value : max) : 0;
}

/**
 * One iteration of the bounded random walk, Radna 2.3: a new value "generated
 * in the range [-1, 1]" is scaled by the step size and added to the previous
 * deviation, and "any such sums are reflected back into range in the manner of
 * (7) and (8)" by the elastic barrier.
 *
 * Uniform randomness, which is what the paper uses for demonstration; the
 * alternative distributions it names (Cauchy, logistic) are on this folder's
 * Deferred list. `Math.random()` rather than a seeded generator is the
 * library's idiom - `noise/src/dsp.ts`, `karplus-strong/src/dsp.ts`,
 * `lfo/src/dsp.ts` and this package's own `phase: "random"` all use it - and
 * shipping a PRNG here would put it in every user's processor payload to serve
 * a test. `dsp.test.ts` stubs `Math.random` instead.
 *
 * **The step is a fraction of the barrier**, passed in already multiplied, so
 * `|step| <= barrier`. With `|previous| <= barrier` that puts the sum inside
 * `2 * barrier` and one reflection is enough to land back in range.
 *
 * The clamp before the step is the case the paper does not have: its barriers
 * are set once, ours are `AudioParam`s and can *close* between two cycles,
 * leaving a held deviation outside the new range. Reflecting from there would
 * throw it out the other side - a deviation of 24 semitones against a barrier
 * that just fell to 1 reflects to -22 - so a walk that finds itself outside a
 * shrunken barrier is placed on it and steps from there.
 */
export function walk(
  deviations: Float32Array,
  count: number,
  step: number,
  barrier: number,
) {
  for (let i = 0; i < count; i++) {
    const held = deviations[i];
    const from = held > barrier ? barrier : held < -barrier ? -barrier : held;
    const value = from + step * (Math.random() * 2 - 1);
    deviations[i] =
      value > barrier
        ? 2 * barrier - value
        : value < -barrier
          ? -2 * barrier - value
          : value;
  }
}

/**
 * Radna Eq. 7-8: a sample driven out of range by its amplitude deviation is
 * "reduced or increased by the amount `d` that it lies out of range", which is
 * a reflection rather than a clip and is what makes the stage "a segmented,
 * stochastic wavefolder" (2.2) rather than a limiter.
 *
 * A fold rather than a clip is the ticket's choice to make, and this is it: the
 * fold is the paper's own equation, it is the more interesting sound, and it is
 * the more aliasing - which the README says out loud.
 *
 * **The clamp behind it is the case the equations do not cover.** Eq. 7 folds
 * once, so it only bounds the result while `|x + a| <= 2`: it maps 3.5 to -1.5.
 * Every table this package plays is peak-normalized (generated) or peak-trimmed
 * (conditioned) and `ampSpread` is at most 1, so the equations hold as written -
 * but `setWavetable(t, { normalize: false })` can hand in a plane that peaks
 * past 1, and "no input in the declared range produces a non-finite or
 * out-of-range sample" is a standing promise of this package rather than a
 * property of this stage.
 */
export function fold(value: number) {
  if (value > 1) {
    const folded = 2 - value;
    return folded > -1 ? folded : -1;
  }
  if (value < -1) {
    const folded = -2 - value;
    return folded < 1 ? folded : 1;
  }
  return value;
}
