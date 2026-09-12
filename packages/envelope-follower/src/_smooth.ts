// DON'T EDIT THIS FILE unless inside scripts/_smooth.ts
// use ./scripts/copy_files.sh to copy this file to the right place
// the goal is to avoid external dependencies on packages

// Synthlet's one meaning for a time in seconds, as a filter coefficient.
//
//   The number is how long the move takes, and "the move" is 99 % of a step.
//
// That rule was settled for envelopes in `02-envelope-time-semantics`, and it
// is the reason this file exists rather than three lines living twice. What is
// shared here is not "a one-pole" - it is the *definition*. If two packages
// drifted, `0.1` would mean 99 % of a step in one module and something else in
// the one next to it, a caller moving a setting between them would get a
// different glide, and nothing would say so. That is the same class of silence
// `_gate.ts` exists to prevent.
//
// Analogue circuits, and most plugins, label their times as **time constants**
// - tau, 63.2 % of a step. One library should not have two meanings for
// "seconds", so the conversion is documented rather than adopted:
//
//   t = tau * NINETY_NINE_PERCENT          tau = t / NINETY_NINE_PERCENT
//
// ## What is deliberately not here
//
// The direction choice (attack against release, rise against fall), the
// rectifier and the RMS averaging stage in `envelope-follower`, and the linear
// rate limiter in `slew-limiter`. None of those is shared, and dragging them in
// to make the file look substantial would be how a shared file becomes a
// framework.
//
// `adsr` and `ad` do not use this and are not being retrofitted: `adsr` runs
// Pirkle's TCO constants inside a stage machine and `ad` has its own variant.
// So this covers two of the library's four smoothers, which is the honest
// scope.

/**
 * `ln(100)`: the number of time constants in 99 % of a step, and the factor
 * between this library's seconds and a datasheet's tau.
 */
export const NINETY_NINE_PERCENT = Math.log(100);

/**
 * The pole of a one-pole that covers 99 % of a step in `seconds`.
 *
 * Derived from the sample rate, so 44.1 and 48 kHz behave identically rather
 * than differing by 8 %. `seconds <= 0` is instantaneous: the coefficient is 0
 * and the filter takes its input. (`exp(-x/0)` is already 0, but relying on
 * that is a puzzle for the next reader.)
 */
export function smoothCoefficient(seconds: number, sampleRate: number) {
  if (seconds <= 0) return 0;
  return Math.exp(-NINETY_NINE_PERCENT / (seconds * sampleRate));
}
