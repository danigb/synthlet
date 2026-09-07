// Generated from the Faust function `ve.korg35LPF` and `ve.korg35HPF` (vaeffects.lib).
// Author: Eric Tarr. Licence: LicenseRef-STK-4.3.
// See THIRD-PARTY-LICENSES.md at the repository root.
import { createPrewarp } from "./prewarp";

export function Korg35(sampleRate: number, type: number) {
  let fSampleRate = 0;
  let fHslider0 = 0;
  let fHslider1 = 0;
  let fDrive = 1;
  let fRec1 = [0, 0];
  let fRec2 = [0, 0];
  let fRec3 = [0, 0];

  const prewarp = createPrewarp(sampleRate);
  const process = type === 1 ? hpf : lpf;

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
    fRec1 = [0, 0];
    fRec2 = [0, 0];
    fRec3 = [0, 0];
  }

  function lpf(
    input: Float32Array,
    output: Float32Array,
    from: number,
    to: number,
  ) {
    let fSlow0 = prewarp(fHslider0);
    let fSlow1 = fSlow0 + 1.0;
    let fSlow2 = fSlow0 / fSlow1;
    let fSlow3 = 9.293 * fHslider1 + -0.00010678119;
    let fSlow4 = 1.0 - fSlow2;
    let fSlow5 =
      1.0 / (1.0 - 0.21521823 * ((fSlow0 * fSlow3 * fSlow4) / fSlow1));
    let fSlow6 = 1.0 / fSlow1;
    let fSlow7 = 0.21521823 * fSlow3 * fSlow4;
    let fSlow8 = 2.0 * fSlow2;
    let fSlow9 = 0.21521823 * fSlow3;

    for (let i = from; i < to; i++) {
      let fTemp0 = fDrive * input[i] - fRec3[1];
      let fTemp1 =
        fSlow5 *
          (fRec3[1] +
            fSlow6 * (fSlow0 * fTemp0 + fSlow7 * fRec1[1] - fRec2[1])) -
        fRec1[1];
      let fTemp2 = fRec1[1] + fSlow2 * fTemp1;
      let fRec0 = fTemp2;
      fRec1[0] = fRec1[1] + fSlow8 * fTemp1;
      fRec2[0] = fRec2[1] + fSlow8 * (fSlow9 * fTemp2 - fRec2[1]);
      fRec3[0] = fRec3[1] + fSlow8 * fTemp0;
      output[i] = fRec0;
      fRec1[1] = fRec1[0];
      fRec2[1] = fRec2[0];
      fRec3[1] = fRec3[0];
    }
  }

  function hpf(
    input: Float32Array,
    output: Float32Array,
    from: number,
    to: number,
  ) {
    let fSlow0 = prewarp(fHslider0);
    let fSlow1 = 9.293 * fHslider1 + -0.00010678119;
    let fSlow2 = fSlow0 + 1.0;
    let fSlow3 = fSlow0 / fSlow2;
    let fSlow4 =
      1.0 - 0.21521823 * ((fSlow0 * fSlow1 * (1.0 - fSlow3)) / fSlow2);
    let fSlow5 = 1.0 / fSlow4;
    let fSlow6 = 1.0 / fSlow2;
    let fSlow7 = 2.0 * fSlow3;
    let fSlow8 = 0.21521823 * (fSlow1 / fSlow4);

    for (let i = from; i < to; i++) {
      let fTemp0 = fDrive * input[i];
      let fTemp1 = fTemp0 - fRec3[1];
      let fTemp2 =
        fTemp0 -
        (fRec3[1] + fSlow6 * (fSlow0 * fTemp1 - fRec1[1] + fSlow3 * fRec2[1]));
      let fRec0 = fSlow5 * fTemp2;
      let fTemp3 = fSlow8 * fTemp2;
      let fTemp4 = fTemp3 - fRec2[1];
      fRec1[0] =
        fRec1[1] + fSlow7 * (fTemp3 - (fSlow3 * fTemp4 + fRec1[1] + fRec2[1]));
      fRec2[0] = fRec2[1] + fSlow7 * fTemp4;
      fRec3[0] = fRec3[1] + fSlow7 * fTemp1;
      output[i] = fRec0;
      fRec1[1] = fRec1[0];
      fRec2[1] = fRec2[0];
      fRec3[1] = fRec3[0];
    }
  }
}
