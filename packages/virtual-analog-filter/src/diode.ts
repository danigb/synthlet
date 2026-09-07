// Generated from the Faust function `ve.diodeLadder` (vaeffects.lib).
// Author: Eric Tarr. Licence: LicenseRef-STK-4.3.
// See THIRD-PARTY-LICENSES.md at the repository root.
import { normFreq } from "./norm-freq";
import { createPrewarp } from "./prewarp";

export function Diode(sampleRate: number) {
  let fHslider0 = 0;
  let fHslider1 = 0;
  let fDrive = 1;
  let fRec1 = [0, 0];
  let fRec2 = [0, 0];
  let fRec3 = [0, 0];
  let fRec4 = [0, 0];

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
    fRec1 = [0, 0];
    fRec2 = [0, 0];
    fRec3 = [0, 0];
    fRec4 = [0, 0];
  }

  function process(
    input: Float32Array,
    output: Float32Array,
    from: number,
    to: number,
  ) {
    let fSlow0 = normFreq(fHslider0);
    let fSlow1 = prewarp(fHslider0);
    let fSlow2 = fSlow1 + 1.0;
    let fSlow3 = fSlow1 / fSlow2;
    let fSlow4 = fSlow1 * fSlow1;
    let fSlow5 = fSlow1 * (1.0 - 0.25 * fSlow3) + 1.0;
    let fSlow6 = fSlow2 * fSlow5;
    let fSlow7 = 0.25 * (fSlow4 / fSlow6) + 1.0;
    let fSlow8 = fSlow1 / fSlow5;
    let fSlow9 = fSlow1 * (1.0 - 0.25 * fSlow8) + 1.0;
    let fSlow10 = fSlow5 * fSlow9;
    let fSlow11 = 0.25 * (fSlow4 / fSlow10) + 1.0;
    let fSlow12 = fSlow1 / fSlow9;
    let fSlow13 = 0.5 * fSlow12;
    let fSlow14 = fSlow1 * (1.0 - fSlow13) + 1.0;
    let fSlow15 = 17.0 - 9.7 * Math.pow(fSlow0, 1e1);
    let fSlow16 = 24.293 * fHslider1 + -0.00010678119;
    let fSlow17 =
      (0.5 * (fSlow4 / (fSlow9 * fSlow14)) + 1.0) /
      (0.0051455377 *
        ((fSlow1 * fSlow1 * fSlow1 * fSlow1 * fSlow15 * fSlow16) /
          (fSlow6 * fSlow9 * fSlow14)) +
        1.0);
    let fSlow18 = (fSlow15 * fSlow16) / fSlow2;
    let fSlow19 = 0.02058215 * fSlow8;
    let fSlow20 = 0.5 * fSlow3;
    let fSlow21 = 0.02058215 * fSlow12;
    let fSlow22 = 0.5 * fSlow8;
    let fSlow23 =
      0.0051455377 * ((fSlow1 * fSlow1 * fSlow1) / (fSlow10 * fSlow14));
    let fSlow24 = 1.0 / fSlow9;
    let fSlow25 = 0.5 * (fSlow1 / fSlow14);
    let fSlow26 = 1.0 / fSlow5;
    let fSlow27 = 1.0 / fSlow2;
    let fSlow28 = 2.0 * fSlow3;

    // The diode ladder's DC gain, solved from its own steady state.
    //
    // Unlike the two Moog ladders there is no closed form in `resonance`: the
    // slope of 1/gain against resonance moves with the cutoff, because
    // `fSlow15 = 17 - 9.7*normFreq^10` scales the feedback. So it is derived
    // rather than fitted. At DC every fTemp5..fTemp8 is zero, which leaves a
    // 4x4 that substitutes forward from an output of 1: fRec1 is the output,
    // and `fMakeup` is the saturator output that produces it, divided by the
    // clipper's small-signal gain of 1.5.
    //
    // Checked against measurement at five cutoffs and four resonances: agrees
    // to 0.25%, and the residual is the cubic clipper rather than the algebra.
    let dRec1 = 1.0;
    let dRec2 = 2.0 * dRec1;
    let dTemp1 = fSlow20 * dRec1 + dRec2;
    let dTemp2 = fSlow22 * dTemp1;
    let dRec3 = (2.0 * dRec2 - fSlow27 * (dRec1 + dTemp2)) / fSlow7;
    let dTemp3 = dTemp2 + dRec3;
    let dRec4 = (2.0 * dRec3 - fSlow26 * (dTemp1 + fSlow13 * dTemp3)) / fSlow11;
    let dTemp4 = fSlow12 * dTemp3 + dRec4;
    let fMakeup =
      ((dRec4 - fSlow24 * (dTemp3 + fSlow25 * dTemp4)) / fSlow17 +
        fSlow18 *
          (0.0411643 * dRec1 +
            fSlow19 * dTemp1 +
            fSlow21 * dTemp3 +
            fSlow23 * dTemp4)) /
      1.5;

    for (let i = from; i < to; i++) {
      // `1e2 *` until this parameter existed: a gain of 100 into a hard
      // clipper with no way to turn it down, which made this model a
      // distortion box with a filter after it. See faustlibraries #214.
      let fTemp0 = Math.max(-1.0, Math.min(1.0, fDrive * input[i]));
      let fTemp1 = fSlow20 * fRec1[1] + fRec2[1];
      let fTemp2 = fSlow22 * fTemp1;
      let fTemp3 = fTemp2 + fRec3[1];
      let fTemp4 = fSlow12 * fTemp3 + fRec4[1];
      let fTemp5 =
        fSlow17 *
          (1.5 * fTemp0 * (1.0 - 0.33333334 * (fTemp0 * fTemp0)) -
            fSlow18 *
              (0.0411643 * fRec1[1] +
                fSlow19 * fTemp1 +
                fSlow21 * fTemp3 +
                fSlow23 * fTemp4)) +
        fSlow24 * (fTemp3 + fSlow25 * fTemp4) -
        fRec4[1];
      let fTemp6 =
        0.5 *
          (fSlow11 * (fRec4[1] + fSlow3 * fTemp5) +
            fSlow26 * (fTemp1 + fSlow13 * fTemp3)) -
        fRec3[1];
      let fTemp7 =
        0.5 *
          (fSlow7 * (fRec3[1] + fSlow3 * fTemp6) +
            fSlow27 * (fRec1[1] + fTemp2)) -
        fRec2[1];
      let fTemp8 = 0.5 * (fRec2[1] + fSlow3 * fTemp7) - fRec1[1];
      let fRec0 = fRec1[1] + fSlow3 * fTemp8;
      fRec1[0] = fRec1[1] + fSlow28 * fTemp8;
      fRec2[0] = fRec2[1] + fSlow28 * fTemp7;
      fRec3[0] = fRec3[1] + fSlow28 * fTemp6;
      fRec4[0] = fRec4[1] + fSlow28 * fTemp5;
      output[i] = fMakeup * fRec0;
      fRec1[1] = fRec1[0];
      fRec2[1] = fRec2[0];
      fRec3[1] = fRec3[0];
      fRec4[1] = fRec4[0];
    }
  }
}
