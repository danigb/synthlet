/**
 * The ring modulator's arithmetic, with no Web Audio anywhere near it.
 *
 * The multiply itself is one operator and needs no file. What lives here is
 * the part that makes this a ring modulator rather than a VCA: the DC blockers
 * on both inputs, and the enum that leaves room for the diode model.
 */

export enum RingModType {
  /** `carrier × (offset + modulator)`. The textbook multiply. */
  Ideal = 0,
}

/**
 * Corner frequency of the input DC blockers, in hertz.
 *
 * Low enough to be out of the way of anything musical - a 20 Hz fundamental
 * loses 0.4 dB - and high enough to settle in about a fifth of a second, which
 * is what the AC-coupling tests need in order to measure a steady state.
 */
export const DC_BLOCK_HZ = 5;

/**
 * The pole of the one-pole DC blocker `y[n] = x[n] - x[n-1] + R·y[n-1]`.
 *
 * Derived from the sample rate rather than hardcoded, so 44.1 and 48 kHz block
 * the same *corner* rather than the same number of samples.
 *
 * The price of blocking DC is a small passband error, and it is worth stating
 * because a user comparing this against a bare `GainNode` will measure it: at
 * 44.1 kHz the gain at 300 Hz is 1.00029, and at 20 Hz it is 0.9578. A ring
 * modulator that were transparent to 1e-7 at audio frequencies would need a
 * corner near 0.05 Hz, and would take a minute to settle after a DC step.
 */
export function dcBlockCoefficient(sampleRate: number) {
  return Math.exp((-2 * Math.PI * DC_BLOCK_HZ) / sampleRate);
}
