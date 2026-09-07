// Generated from the Faust function `ve.moogHalfLadder` (vaeffects.lib).
// Author: Eric Tarr. Licence: LicenseRef-STK-4.3.
// See THIRD-PARTY-LICENSES.md at the repository root.
import { createPrewarp } from "./prewarp";

export function MoogHalf(sampleRate: number) {
  let fHslider0 = 0;
  let fHslider1 = 0;
  let fRec0 = [0, 0];
  let fRec1 = [0, 0];
  let fRec2 = [0, 0];

  const prewarp = createPrewarp(sampleRate);

  return { update, process, reset };

  function update(frequency: number, resonance: number) {
    fHslider0 = frequency;
    fHslider1 = resonance;
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
    let fSlow5 = 0.0823286 * ((fSlow0 * fSlow4) / fSlow1);
    let fSlow6 = 0.0823286 * fSlow4;
    let fSlow7 = 24.293 * fHslider1 + -0.00010678119;
    let fSlow8 = fSlow7 / fSlow1;
    let fSlow9 =
      1.0 /
      (0.0823286 * ((fSlow0 * fSlow0 * fSlow7 * fSlow4) / (fSlow1 * fSlow1)) +
        1.0);

    for (let i = from; i < to; i++) {
      let fTemp0 =
        fSlow9 *
          (input[i] -
            fSlow8 *
              (0.1646572 * fRec0[1] + fSlow6 * fRec1[1] + fSlow5 * fRec2[1])) -
        fRec2[1];
      let fTemp1 = fRec2[1] + fSlow2 * fTemp0 - fRec1[1];
      let fTemp2 = fRec1[1] + fSlow2 * fTemp1;
      let fTemp3 = fTemp2 - fRec0[1];
      fRec0[0] = fRec0[1] + fSlow3 * fTemp3;
      fRec1[0] = fRec1[1] + fSlow3 * fTemp1;
      fRec2[0] = fRec2[1] + fSlow3 * fTemp0;
      let fRec3 = 2.0 * (fRec0[1] + fSlow2 * fTemp3) - fTemp2;
      output[i] = fRec3;
      fRec0[1] = fRec0[0];
      fRec1[1] = fRec1[0];
      fRec2[1] = fRec2[0];
    }
  }
}
