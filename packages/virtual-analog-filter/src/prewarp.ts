// Where the prewarping curve stops following the tangent, as a fraction of
// Nyquist. **This number is ours, not Zavalishin's.** He works at "some point
// around 16kHz" at a 44.1 kHz sample rate and gives no numeric prescription
// beyond the observation that the detuning "is getting particularly bad at
// cutoffs above 16kHz" (Fig. 3.18). A fixed 16 kHz would clip the top octave at
// 96 kHz and mean nothing at 8 kHz. 0.72 of Nyquist is 15876 Hz at 44.1 kHz -
// his figure to within 0.8% - and it scales with the sample rate.
//
// It is the same 0.72 as `state-variable-filter/src/dsp.ts`, deliberately: the
// two packages are the same filter question and a cutoff that means one thing
// in `Svf` and another in `VirtualAnalogFilter` would be its own bug.
const CEILING_AS_A_FRACTION_OF_NYQUIST = 0.72;

/**
 * The integrator gain `g` for a cutoff in Hz: continuous-speed bounded cutoff
 * prewarping, Zavalishin, *The Art of VA Filter Design* (2018) section 3.8,
 * eq. 3.23 and the derivative given on p.70.
 *
 * Plain prewarping is `g = tan(pi*f/fs)`, which has a pole at Nyquist. Above it
 * `g` goes negative, the poles leave the unit circle and the filter diverges.
 * `worklet.ts` folds `detune` into the cutoff and `detune` is declared +/-127
 * semitones, so `frequency: 1000, detune: 127` - both inside their ranges -
 * asks for 1.54 MHz. Before this, that returned `Infinity` on the diode ladder
 * and 5.6e21 on the Moog.
 *
 * It is the *continuous-speed* variant (eq. 3.23) rather than the plain bounded
 * one (eq. 3.22), because eq. 3.22 has a breakpoint and Zavalishin says exactly
 * what that costs: the motion of the prewarping point makes its own
 * contribution to the rate of change of the cutoff, and it "suddenly
 * disappears", giving "a sudden change of the perceived modulation speed as the
 * cutoff traverses through the prewarping breakpoint". An a-rate cutoff being
 * swept is this package's entire point. So the curve is continued as a tangent
 * line:
 *
 *     g(t) = tan(t)                                    for t <= tmax
 *     g(t) = tan(tmax) + (t - tmax) * (1 + tan^2 tmax) for t >  tmax
 *
 * where `t = pi*f/fs` is the half-angle `omega*T/2`. Both constants are hoisted,
 * so above the ceiling this is cheaper than the tangent it replaces.
 *
 * **This is a second copy of `state-variable-filter/src/dsp.ts`'s
 * `createPrewarp`, on purpose.** Both packages want it, and so did
 * `karplus-strong`; where a shared DSP core lives is a repo-wide decision that
 * three ticket folders have now deferred rather than settled inside one of
 * them. Twenty duplicated lines with the same constant is the cheaper of the
 * two mistakes, and this file is written to be deleted when the question is
 * answered.
 */
export function createPrewarp(sampleRate: number) {
  const invSr = 1 / sampleRate;
  // Independent of the sample rate, which is what makes the ceiling one
  // constant rather than a table: t = pi*f/fs and f = fraction * fs/2.
  const tMax = (CEILING_AS_A_FRACTION_OF_NYQUIST * Math.PI) / 2;
  const gMax = Math.tan(tMax);
  const speed = 1 + gMax * gMax; // mu'(omega_max), Zavalishin p.70

  return function prewarp(frequency: number) {
    const t = frequency * invSr * Math.PI;
    return t <= tMax ? Math.tan(t) : gMax + (t - tMax) * speed;
  };
}
