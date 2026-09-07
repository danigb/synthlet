// Generated from the Faust function `ve.moogLadder` (vaeffects.lib).
// Author: Dario Sanfilippo. Licence: LicenseRef-STK-4.3.
// See THIRD-PARTY-LICENSES.md at the repository root.
import { createPrewarp } from "./prewarp";

export function Moog(sampleRate: number) {
  let fHslider0 = 0;
  let fHslider1 = 0;
  let fDrive = 1;
  let fRec0 = [0, 0];
  let fRec1 = [0, 0];
  let fRec2 = [0, 0];
  let fRec3 = [0, 0];

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
    fRec3 = [0, 0];
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
    let fSlow3 = 24.293 * fHslider1 + -0.00010678119;
    let fSlow4 = 0.1646572 * fSlow3 * (1.0 - fSlow2);
    let fSlow5 =
      1.0 /
      (0.1646572 *
        ((fSlow0 * fSlow0 * fSlow0 * fSlow0 * fSlow3) /
          (fSlow1 * fSlow1 * fSlow1 * fSlow1)) +
        1.0);
    let fSlow6 = 2.0 * fSlow2;
    // A ladder's uncompensated DC gain is 1/(1+k) - Huovilainen 2004, and
    // Zavalishin section 5 - so `resonance` was doubling as a volume control:
    // measured 1/(1+4r) to five digits, -5.1 dB at 0.2 and -13.3 dB at 0.9.
    // The file's own constants make k exactly 4r: 0.1646572 * 24.293 = 4.0000.
    let fMakeup = 1.0 + 0.1646572 * fSlow3;

    for (let i = from; i < to; i++) {
      let fTemp0 =
        fSlow5 *
          (fDrive * input[i] -
            fSlow4 *
              (fRec3[1] +
                fSlow2 *
                  (fRec2[1] + fSlow2 * (fRec1[1] + fSlow2 * fRec0[1])))) -
        fRec0[1];
      fRec0[0] = fRec0[1] + fSlow6 * fTemp0;
      let fTemp1 = fRec0[1] + fSlow2 * fTemp0 - fRec1[1];
      fRec1[0] = fRec1[1] + fSlow6 * fTemp1;
      let fTemp2 = fRec1[1] + fSlow2 * fTemp1 - fRec2[1];
      fRec2[0] = fRec2[1] + fSlow6 * fTemp2;
      let fTemp3 = fRec2[1] + fSlow2 * fTemp2 - fRec3[1];
      fRec3[0] = fRec3[1] + fSlow6 * fTemp3;
      let fRec4 = fRec3[1] + fSlow2 * fTemp3;
      output[i] = fMakeup * fRec4;
      fRec0[1] = fRec0[0];
      fRec1[1] = fRec1[0];
      fRec2[1] = fRec2[0];
      fRec3[1] = fRec3[0];
    }
  }
}
