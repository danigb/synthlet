// Began as the Faust function `ve.moogHalfLadder` (vaeffects.lib), whose linear
// TPT core this still is.
// Author: Eric Tarr. Licence: LicenseRef-STK-4.3.
//
// It is no longer only that. The saturating feedback path and the solver that
// resolves the delay-free loop it creates are ours - `vaeffects.lib` says of
// this function that it has "no nonlinearities", which is accurate about the
// code it ships. See `saturate.ts` for the derivation and the papers.
// See THIRD-PARTY-LICENSES.md at the repository root.
import { createPrewarp } from "./prewarp";
import { RESONANCE_SCALE, resolve, saturate } from "./saturate";

export function MoogHalf(sampleRate: number) {
  let fHslider0 = 0;
  let fHslider1 = 0;
  let fDrive = 1;
  let fRec0 = [0, 0];
  let fRec1 = [0, 0];
  let fRec2 = [0, 0];

  const prewarp = createPrewarp(sampleRate);

  return { update, process, reset };

  function update(frequency: number, resonance: number, drive: number) {
    fHslider0 = frequency;
    fHslider1 = resonance;
    fDrive = drive;
  }

  /**
   * Back to a newly constructed filter. `NaN` reaches every one of these
   * recurrences through `state = state + k * something` and never leaves - and
   * the saturating models do not help, because `Math.max(-1, Math.min(1, NaN))`
   * is `NaN` too. Writing zeroes over them is the only way out. `worklet.ts`
   * is what calls this, once a block and only when the output says so.
   *
   * The sliders go too, so a reset filter is indistinguishable from a new one.
   * That is why the caller has to invalidate its change-detection slot.
   */
  function reset() {
    fHslider0 = 0;
    fHslider1 = 0;
    fDrive = 1;
    fRec0 = [0, 0];
    fRec1 = [0, 0];
    fRec2 = [0, 0];
  }

  function process(
    input: Float32Array,
    output: Float32Array,
    from: number,
    to: number,
  ) {
    let fSlow0 = prewarp(fHslider0);
    let fSlow1 = fSlow0 + 1.0;
    let fSlow2 = fSlow0 / fSlow1;
    let fSlow3 = 2.0 * fSlow2;
    let fSlow4 = fSlow3 + -1.0;
    let fSlow7 = 24.293 * fHslider1 + -0.00010678119;
    // The feedback amount. `0.0823286 * 24.293` is 2.0000, so this was exactly
    // `2 * resonance`; scaled so the self-oscillation threshold is reachable
    // below the top of the range, see `saturate.ts`.
    let fSlow8 = RESONANCE_SCALE * 0.0823286 * fSlow7;
    // Half the ladder, half the feedback. The same (1+k) compensation as the
    // full ladder - Huovilainen 2004, Zavalishin section 5 - and the
    // uncompensated DC gain measured 1/(1+2r) to five digits before it.
    let fMakeup = 1.0 + fSlow8;
    // Chowdhury's `h0`, for the tap the feedback path reads: the half ladder
    // feeds back a mix of three states rather than its own output, and this is
    // the gain from the ladder's input to that mix. It is what `fSlow9`'s
    // 1/(1+k*A) was built from.
    let fSlow9 = fSlow2 * fSlow2 * fSlow4;

    for (let i = from; i < to; i++) {
      // Chowdhury's `H_n` for the same tap: what it would read for zero input
      // from the state the filter is in. The linear code folded this straight
      // into the input as `fSlow8 * (...)`; the nonlinear solve needs it on
      // its own, so the 0.0823286 that used to live in the coefficients comes
      // out here as the plain state mix.
      let fFeedback =
        (2.0 * fRec0[1] + fSlow4 * fRec1[1] + fSlow2 * fSlow4 * fRec2[1]) /
        fSlow1;
      let fX = fDrive * input[i];
      let fTemp0 =
        fX -
        fSlow8 * saturate(resolve(fSlow9, fFeedback, fSlow8, fX)) -
        fRec2[1];
      let fTemp1 = fRec2[1] + fSlow2 * fTemp0 - fRec1[1];
      let fTemp2 = fRec1[1] + fSlow2 * fTemp1;
      let fTemp3 = fTemp2 - fRec0[1];
      fRec0[0] = fRec0[1] + fSlow3 * fTemp3;
      fRec1[0] = fRec1[1] + fSlow3 * fTemp1;
      fRec2[0] = fRec2[1] + fSlow3 * fTemp0;
      let fRec3 = 2.0 * (fRec0[1] + fSlow2 * fTemp3) - fTemp2;
      output[i] = fMakeup * fRec3;
      fRec0[1] = fRec0[0];
      fRec1[1] = fRec1[0];
      fRec2[1] = fRec2[0];
    }
  }
}
